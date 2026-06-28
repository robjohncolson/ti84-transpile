# Phase 875: D0301B Owner/Lifetime

Probe: `probe-phase875-d0301b-owner-lifetime.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase875-d0301b-owner-lifetime.mjs`

## Summary

- Result: PASS.
- CEmu captures keep D0301B magic before/after CLEAR: yes.
- Browser stable replay packet includes D0301B: no.
- Browser coldboot-ready D0301B is zero: yes.
- Port-skip route reaches D0301B gate with zero: yes.
- Direct absolute D0301B writer found in static scan: yes.
- Traced browser coldboot/CLEAR route reaches any direct owner candidate: no.
- Adjudication: D0301B is not lost inside the CLEAR branch; the browser recipe enters the route with it already zero. Real RAM has 0x5AA55A before and after CLEAR, and static scan found direct ROM owner candidates, including magic-load/store pairs at 0x040BF0->0x040BF4 and 0x040C62->0x040C66. The traced browser coldboot/CLEAR path never reaches those candidates and the browser stable replay packet omits D0301B, so the browser route loses the sentinel before CLEAR by not executing or replaying the owner state.

## Lifecycle Field Table

| Point | D0301B | D007CA | D008E0 | D010EF | D010FE | D010F4 | D02437 | D0243A | D02590 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CEmu before CLEAR | 0x5AA55A | 0x0585E9 | 0xD1A86C | 0xD2A83E | 0xD1A8CC | 0x1F | 0xD1A8CC | 0xD1A8CD | 0xD3FE81 |
| CEmu after CLEAR | 0x5AA55A | 0x0585E9 | 0xD1A86C | 0xD2A83E | 0xD1A8CC | 0x1F | 0xD1A8CC | 0xD1A8CC | 0xD3FE81 |
| browser phase5 stable boundary | 0x000000 | 0x0585E9 | 0xD1A866 | 0xD2A83E | 0xD1A8CC | 0x1F | 0xD1A8CC | 0xD1A8CC | 0xD3FE81 |
| browser after stable replay | 0x000000 | 0x0585E9 | 0xD1A866 | 0x000000 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0xD3FE81 |
| browser after boot ready | 0x000000 | 0x0585E9 | 0x000000 | 0x000000 | 0x000000 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD3FE81 |
| browser before CLEAR run | 0x000000 | 0x0585E9 | 0xD1A863 | 0x000000 | 0x000000 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD3FE81 |
| route at 0x0018AF | 0x000000 | 0x0585E9 | 0xD1A863 | 0x000000 | 0x000000 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD3FE81 |
| route at 0x0018D7 | 0x000000 | 0x0585E9 | 0xD1A863 | 0x000000 | 0x000000 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD3FE81 |

## Browser Stable Replay Packet

| Browser Stable Replay Field |
| --- |
| D007CA |
| D008E0 |
| D02505 |
| D02587 |
| D0258A |
| D0258D |
| D02590 |
| D02593 |
| D0259A |
| D0259D |
| D025A0 |
| D025C5 |

## D0301B Change Trace

No D0301B value changes were observed in the traced coldboot or CLEAR route.

## Owner Candidate Dynamic Counts

| Owner Candidate | PC | Coldboot Hits | CLEAR Hits | First Coldboot D0301B | First CLEAR D0301B |
| --- | --- | --- | --- | --- | --- |
| d0301bWriter00086F | 0x00086F | 0 | 0 | - | - |
| d0301bWriter00141C | 0x00141C | 0 | 0 | - | - |
| d0301bWriter001B06 | 0x001B06 | 0 | 0 | - | - |
| d0301bWriter0141AE | 0x0141AE | 0 | 0 | - | - |
| d0301bMagicLoad040BF0 | 0x040BF0 | 0 | 0 | - | - |
| d0301bWriter040BF4 | 0x040BF4 | 0 | 0 | - | - |
| d0301bMagicLoad040C62 | 0x040C62 | 0 | 0 | - | - |
| d0301bWriter040C66 | 0x040C66 | 0 | 0 | - | - |

## CLEAR Route Target Counts

| Target | Count | First PC | Prev | D0301B | D007CA | D02590 |
| --- | --- | --- | --- | --- | --- | --- |
| phase5Cleanup0018F8 | 1 | 0x0018F8 | 0x001881 | 0x000000 | 0x000000 | 0x000000 |
| clearCaller058A16 | 1 | 0x058A16 | 0x058A14 | 0x000000 | 0x0585E9 | 0xD3FE81 |
| clearEntry0A223A | 1 | 0x0A223A | 0x058A16 | 0x000000 | 0x0585E9 | 0xD3FE81 |
| anchor0A229D | 1 | 0x0A229D | 0x0A2A37 | 0x000000 | 0x0585E9 | 0xD3FE81 |
| liveSpin0A1854 | 112 | 0x0A1854 | 0x0A184A | 0x000000 | 0x0585E9 | 0xD3FE81 |
| portBranch001872 | 1 | 0x001872 | 0x0158F8 | 0x000000 | 0x0585E9 | 0xD3FE81 |
| portSkip0018AF | 1 | 0x0018AF | 0x001872 | 0x000000 | 0x0585E9 | 0xD3FE81 |
| sentinelBlock0018D7 | 1 | 0x0018D7 | 0x0018AF | 0x000000 | 0x0585E9 | 0xD3FE81 |
| largeClear001881 | 1 | 0x001881 | 0x0018D7 | 0x000000 | 0x0585E9 | 0xD3FE81 |
| cleanup0018F8 | 1 | 0x0018F8 | 0x001881 | 0x000000 | 0x000000 | 0x000000 |
| poll006D64 | 9041 | 0x006D64 | 0x0021C2 | 0x000000 | 0x000000 | 0x000000 |

## Static Direct References

| Kind | Byte Hit | Decode PC | Bytes | Instruction |
| --- | --- | --- | --- | --- |
| D0301B address bytes | 0x000870 | 0x00086F | `22 1B 30 D0` | LD (0xD0301B), HL |
| D0301B address bytes | 0x00141D | 0x00141C | `22 1B 30 D0` | LD (0xD0301B), HL |
| D0301B address bytes | 0x0018E1 | 0x0018E0 | `2A 1B 30 D0` | LD HL, (0xD0301B) |
| D0301B address bytes | 0x001B07 | 0x001B06 | `22 1B 30 D0` | LD (0xD0301B), HL |
| D0301B address bytes | 0x0141AF | 0x0141AE | `22 1B 30 D0` | LD (0xD0301B), HL |
| D0301B address bytes | 0x0402BC | 0x0402BB | `3A 1B 30 D0` | LD A, (0xD0301B) |
| D0301B address bytes | 0x040BF5 | 0x040BF4 | `22 1B 30 D0` | LD (0xD0301B), HL |
| D0301B address bytes | 0x040C67 | 0x040C66 | `22 1B 30 D0` | LD (0xD0301B), HL |
| 0x5AA55A magic bytes | 0x0018E5 | 0x0018E4 | `11 5A A5 5A` | LD DE, 0x5AA55A |
| 0x5AA55A magic bytes | 0x040BF1 | 0x040BF0 | `21 5A A5 5A` | LD HL, 0x5AA55A |
| 0x5AA55A magic bytes | 0x040C63 | 0x040C62 | `21 5A A5 5A` | LD HL, 0x5AA55A |

## Machine JSON

```json
{
  "pass": true,
  "lifecycle": {
    "pass": true,
    "captureHasMagic": true,
    "stableFieldInfo": {
      "found": true,
      "names": [
        "D007CA",
        "D008E0",
        "D02505",
        "D02587",
        "D0258A",
        "D0258D",
        "D02590",
        "D02593",
        "D0259A",
        "D0259D",
        "D025A0",
        "D025C5"
      ]
    },
    "replayIncludesD0301B": false,
    "browserReadyZero": true,
    "gateZero": true,
    "directWriterHits": true,
    "ownerTargetNames": [
      "d0301bWriter00086F",
      "d0301bWriter00141C",
      "d0301bWriter001B06",
      "d0301bWriter0141AE",
      "d0301bMagicLoad040BF0",
      "d0301bWriter040BF4",
      "d0301bMagicLoad040C62",
      "d0301bWriter040C66"
    ],
    "ownerTargetsHit": false,
    "preOracle": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D010EF": "0xD2A83E",
      "D010FE": "0xD1A8CC",
      "D010F4": "0x1F",
      "D02317": "0xD2A83E",
      "D0231A": "0xD2A83E",
      "D0231D": "0xD2A83D",
      "D02437": "0xD1A8CC",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02440": "0xD2A83E",
      "D02505": "0x0A",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x000C",
      "D0301B": "0x5AA55A",
      "D000C2_IY42": "0x00"
    },
    "afterOracle": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D010EF": "0xD2A83E",
      "D010FE": "0xD1A8CC",
      "D010F4": "0x1F",
      "D02317": "0xD2A83E",
      "D0231A": "0xD2A83E",
      "D0231D": "0xD2A83D",
      "D02437": "0xD1A8CC",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02440": "0xD2A83E",
      "D02505": "0x0A",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D0301B": "0x5AA55A",
      "D000C2_IY42": "0x00"
    },
    "stableBoundary": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A866",
      "D010EF": "0xD2A83E",
      "D010FE": "0xD1A8CC",
      "D010F4": "0x1F",
      "D02317": "0xD2A83E",
      "D0231A": "0xD2A83E",
      "D0231D": "0xD2A83D",
      "D02437": "0xD1A8CC",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02440": "0xD2A83E",
      "D02505": "0x0A",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D0301B": "0x000000",
      "D000C2_IY42": "0x00"
    },
    "afterStableReplay": {
      "label": "afterStableReplay",
      "atBlock": 588232,
      "phase": "p5-launch-home",
      "cpu": {
        "pc": "0x0019B5",
        "currentBlockPc": "0x0019B5",
        "sp": "0xD1A87E",
        "af": "0x1044",
        "bc": "0x00B026",
        "de": "0xD65800",
        "hl": "0x000000",
        "ix": "0xFFFFFF",
        "iy": "0xD00080",
        "f": "0x44"
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A866",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000C2_IY42": "0x00"
      }
    },
    "afterBoot": {
      "label": "afterBootReady",
      "atBlock": 637630,
      "phase": "p6-home-repaint",
      "cpu": {
        "pc": "0x0019B5",
        "currentBlockPc": "0x0019B5",
        "sp": "0xD1A866",
        "af": "0x1054",
        "bc": "0x000000",
        "de": "0xD2A815",
        "hl": "0xD1A8A3",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x54"
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000C2_IY42": "0x00"
      }
    },
    "beforeClear": {
      "label": "beforeClearRun",
      "atBlock": 0,
      "phase": "init",
      "cpu": {
        "pc": "0x0019B5",
        "currentBlockPc": "0x0019B5",
        "sp": "0xD1A863",
        "af": "0x1040",
        "bc": "0x000000",
        "de": "0xD2A815",
        "hl": "0xD1A8A3",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x40"
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000C2_IY42": "0x00"
      }
    },
    "skipRow": {
      "block": 78212,
      "phase": "p7-clear-route",
      "pc": "0x0018AF",
      "prevPc": "0x001872",
      "cpu": {
        "pc": "0x0018AF",
        "currentBlockPc": "0x0018AF",
        "sp": "0xD1A87B",
        "af": "0xFE10",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "ix": "0xE00800",
        "iy": "0xD00080",
        "f": "0x10"
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000C2_IY42": "0x00"
      },
      "stackTop": [
        {
          "addr": "0xD1A87B",
          "value": "0x0013E8"
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
        }
      ]
    },
    "gateRow": {
      "block": 78213,
      "phase": "p7-clear-route",
      "pc": "0x0018D7",
      "prevPc": "0x0018AF",
      "cpu": {
        "pc": "0x0018D7",
        "currentBlockPc": "0x0018D7",
        "sp": "0xD1A87B",
        "af": "0xFF54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "ix": "0xE00800",
        "iy": "0xD00080",
        "f": "0x54"
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000C2_IY42": "0x00"
      },
      "stackTop": [
        {
          "addr": "0xD1A87B",
          "value": "0x0013E8"
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
        }
      ]
    },
    "largeClearRow": {
      "block": 78214,
      "phase": "p7-clear-route",
      "pc": "0x001881",
      "prevPc": "0x0018D7",
      "cpu": {
        "pc": "0x001881",
        "currentBlockPc": "0x001881",
        "sp": "0xD1A87B",
        "af": "0x5293",
        "bc": "0x000003",
        "de": "0x5AA55A",
        "hl": "0xA55AA6",
        "ix": "0xE00800",
        "iy": "0xD00080",
        "f": "0x93"
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000C2_IY42": "0x00"
      },
      "stackTop": [
        {
          "addr": "0xD1A87B",
          "value": "0x0013E8"
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
        }
      ]
    },
    "shortTailRow": null,
    "conclusion": "D0301B is not lost inside the CLEAR branch; the browser recipe enters the route with it already zero. Real RAM has 0x5AA55A before and after CLEAR, and static scan found direct ROM owner candidates, including magic-load/store pairs at 0x040BF0->0x040BF4 and 0x040C62->0x040C66. The traced browser coldboot/CLEAR path never reaches those candidates and the browser stable replay packet omits D0301B, so the browser route loses the sentinel before CLEAR by not executing or replaying the owner state."
  },
  "phases": [
    {
      "name": "p1-coldboot",
      "result": {
        "steps": 20000,
        "termination": "max_steps",
        "lastPc": "0x001CC0",
        "lastMode": "adl"
      }
    },
    {
      "name": "p2-kernel",
      "result": {
        "steps": 100000,
        "termination": "max_steps",
        "lastPc": "0x000A92",
        "lastMode": "adl"
      }
    },
    {
      "name": "p3-postinit",
      "result": {
        "steps": 100,
        "termination": "max_steps",
        "lastPc": "0x0158BC",
        "lastMode": "adl"
      }
    },
    {
      "name": "p4-warm-idle",
      "result": {
        "steps": 192290,
        "termination": "halt",
        "lastPc": "0x0019B5",
        "lastMode": "adl"
      }
    },
    {
      "name": "p5-launch-home",
      "result": {
        "steps": 275843,
        "termination": "halt",
        "lastPc": "0x0019B5",
        "lastMode": "adl"
      }
    },
    {
      "name": "p6-home-repaint",
      "result": {
        "steps": 49474,
        "termination": "halt",
        "lastPc": "0x0019B5",
        "lastMode": "adl"
      }
    }
  ],
  "coldbootRoute": {
    "totalBlocks": 637630,
    "targetCounts": {
      "launchHome09DD62": 1,
      "phase5PreWipe001879": 6,
      "phase5Cleanup0018F8": 6,
      "homeRepaint058241": 1,
      "clearCaller058A16": 0,
      "clearEntry0A223A": 0,
      "anchor0A229D": 0,
      "liveSpin0A1854": 32,
      "portBranch001872": 6,
      "portSkip0018AF": 0,
      "sentinelBlock0018D7": 0,
      "largeClear001881": 0,
      "shortTail0018EC": 0,
      "cleanup0018F8": 6,
      "poll006D64": 30264,
      "d0301bWriter00086F": 0,
      "d0301bWriter00141C": 0,
      "d0301bWriter001B06": 0,
      "d0301bWriter0141AE": 0,
      "d0301bReader0402BB": 0,
      "d0301bMagicLoad040BF0": 0,
      "d0301bWriter040BF4": 0,
      "d0301bMagicLoad040C62": 0,
      "d0301bWriter040C66": 0
    },
    "checkpoints": [
      {
        "label": "afterPhase5",
        "atBlock": 588232,
        "phase": "p5-launch-home",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A87E",
          "af": "0x1044",
          "bc": "0x00B026",
          "de": "0xD65800",
          "hl": "0x000000",
          "ix": "0xFFFFFF",
          "iy": "0xD00080",
          "f": "0x44"
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        }
      },
      {
        "label": "afterStableReplay",
        "atBlock": 588232,
        "phase": "p5-launch-home",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A87E",
          "af": "0x1044",
          "bc": "0x00B026",
          "de": "0xD65800",
          "hl": "0x000000",
          "ix": "0xFFFFFF",
          "iy": "0xD00080",
          "f": "0x44"
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        }
      },
      {
        "label": "afterPhase6",
        "atBlock": 637630,
        "phase": "p6-home-repaint",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54"
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        }
      },
      {
        "label": "afterEditSeed",
        "atBlock": 637630,
        "phase": "p6-home-repaint",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54"
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        }
      },
      {
        "label": "afterBootReady",
        "atBlock": 637630,
        "phase": "p6-home-repaint",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54"
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        }
      }
    ],
    "d0301bChanges": [],
    "stableSnapshot": {
      "atBlock": 396519,
      "watchedFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A866",
        "D010EF": "0xD2A83E",
        "D010FE": "0xD1A8CC",
        "D010F4": "0x1F",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000C2_IY42": "0x00"
      },
      "replayFields": [
        {
          "name": "D007CA",
          "addr": "0xD007CA",
          "len": 3,
          "value": "0x0585E9"
        },
        {
          "name": "D008E0",
          "addr": "0xD008E0",
          "len": 3,
          "value": "0xD1A866"
        },
        {
          "name": "D02505",
          "addr": "0xD02505",
          "len": 1,
          "value": "0x0A"
        },
        {
          "name": "D02587",
          "addr": "0xD02587",
          "len": 3,
          "value": "0xD2A8E2"
        },
        {
          "name": "D0258A",
          "addr": "0xD0258A",
          "len": 3,
          "value": "0xD2A8E2"
        },
        {
          "name": "D0258D",
          "addr": "0xD0258D",
          "len": 3,
          "value": "0xD2A8E2"
        },
        {
          "name": "D02590",
          "addr": "0xD02590",
          "len": 3,
          "value": "0xD3FE81"
        },
        {
          "name": "D02593",
          "addr": "0xD02593",
          "len": 3,
          "value": "0xD3FE81"
        },
        {
          "name": "D0259A",
          "addr": "0xD0259A",
          "len": 3,
          "value": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "addr": "0xD0259D",
          "len": 3,
          "value": "0xD3FECD"
        },
        {
          "name": "D025A0",
          "addr": "0xD025A0",
          "len": 3,
          "value": "0xD2A8A4"
        },
        {
          "name": "D025C5",
          "addr": "0xD025C5",
          "len": 3,
          "value": "0x0C0000"
        }
      ]
    }
  },
  "clearRoute": {
    "result": {
      "steps": 160000,
      "lastPc": 8642,
      "lastMode": "adl",
      "halted": false,
      "termination": "max_steps",
      "loopsForced": 0,
      "blockVisits": {
        "08c331:adl": 1,
        "05c634:adl": 3,
        "000038:adl": 23,
        "0006f3:adl": 23,
        "000704:adl": 23,
        "000710:adl": 23,
        "001713:adl": 110,
        "0008bb:adl": 111,
        "001717:adl": 110,
        "001718:adl": 110,
        "00171e:adl": 23,
        "0067f8:adl": 23,
        "001c4f:adl": 51,
        "001ca6:adl": 168,
        "001cc0:adl": 151,
        "001cca:adl": 150,
        "001cce:adl": 25,
        "001cd5:adl": 25,
        "001ce5:adl": 43,
        "001c54:adl": 51,
        "006808:adl": 23,
        "001c33:adl": 148,
        "001c38:adl": 145,
        "001c3c:adl": 129,
        "001c44:adl": 116,
        "001c7d:adl": 117,
        "001ce4:adl": 125,
        "001c81:adl": 117,
        "001c82:adl": 117,
        "001c48:adl": 116,
        "001c42:adl": 29,
        "006810:adl": 23,
        "006812:adl": 23,
        "006816:adl": 23,
        "00681e:adl": 23,
        "006828:adl": 23,
        "001727:adl": 23,
        "000719:adl": 23,
        "00071d:adl": 23,
        "02010c:adl": 23,
        "03cf7d:adl": 23,
        "03cfa4:adl": 23,
        "03cfcf:adl": 23,
        "03cfd4:adl": 20,
        "03cfdb:adl": 20,
        "03cfe0:adl": 20,
        "03cfe5:adl": 20,
        "03cfea:adl": 20,
        "03d029:adl": 20,
        "03d033:adl": 20,
        "03d038:adl": 20,
        "03d044:adl": 20,
        "03d04c:adl": 20,
        "03d054:adl": 20,
        "03f994:adl": 20,
        "0003d4:adl": 20,
        "003cc2:adl": 20,
        "003cd4:adl": 21,
        "003ce0:adl": 21,
        "003cee:adl": 21,
        "003cf3:adl": 21,
        "03f998:adl": 20,
        "03f99a:adl": 20,
        "03f9ab:adl": 20,
        "03f9ae:adl": 20,
        "03d058:adl": 20,
        "03d060:adl": 20,
        "03d0e0:adl": 23,
        "05c67c:adl": 3,
        "08c339:adl": 1,
        "06ce73:adl": 1,
        "06ce7f:adl": 1,
        "06ce7b:adl": 1,
        "06c8ab:adl": 1,
        "08c33d:adl": 3,
        "0a349a:adl": 3,
        "0a349f:adl": 3,
        "0a32f9:adl": 5,
        "0a3301:adl": 3,
        "08c308:adl": 6,
        "0a331e:adl": 5,
        "0a336f:adl": 5,
        "0a3383:adl": 5,
        "0a338a:adl": 5,
        "0a33fb:adl": 20,
        "0a3408:adl": 132,
        "0a3404:adl": 120,
        "0a340f:adl": 44,
        "0a3392:adl": 5,
        "0a339a:adl": 5,
        "0a33e6:adl": 20,
        "0a33ff:adl": 20,
        "0a33ee:adl": 20,
        "0a3403:adl": 20,
        "0a33a2:adl": 5,
        "0a33aa:adl": 5,
        "0a33b2:adl": 5,
        "0a33ba:adl": 5,
        "0a33c2:adl": 5,
        "0a33ca:adl": 5,
        "0a33da:adl": 5,
        "0a33e4:adl": 3,
        "0a34ae:adl": 3,
        "08c341:adl": 3,
        "05c75b:adl": 3,
        "05c760:adl": 3,
        "05c768:adl": 3,
        "05c771:adl": 5,
        "05c795:adl": 5,
        "05c7a5:adl": 5,
        "05c7ad:adl": 5,
        "05c7b5:adl": 5,
        "05c7c1:adl": 5,
        "05c7d7:adl": 5,
        "05c7dd:adl": 3,
        "05c7ed:adl": 3,
        "05c815:adl": 3,
        "0a237e:adl": 10,
        "0a2a37:adl": 12,
        "0a2389:adl": 10,
        "05c819:adl": 3,
        "05c82c:adl": 5,
        "05c832:adl": 5,
        "05e3d6:adl": 5,
        "04c973:adl": 8,
        "05c836:adl": 5,
        "05c84d:adl": 5,
        "05ca44:adl": 5,
        "05ca4e:adl": 5,
        "05ca57:adl": 5,
        "05c851:adl": 5,
        "05cbc0:adl": 5,
        "05cbc3:adl": 5,
        "05cbc9:adl": 5,
        "05c855:adl": 5,
        "05c875:adl": 5,
        "05c87e:adl": 5,
        "0a1799:adl": 7,
        "0a17aa:adl": 7,
        "0a17ae:adl": 7,
        "0a17b2:adl": 5,
        "0a17b8:adl": 5,
        "07bf3e:adl": 7,
        "07bf4d:adl": 7,
        "07bf5c:adl": 7,
        "000380:adl": 7,
        "003d85:adl": 7,
        "07bf61:adl": 7,
        "0a17c5:adl": 7,
        "0a2d4c:adl": 7,
        "0a17d0:adl": 7,
        "00038c:adl": 7,
        "005a53:adl": 94,
        "0a17e9:adl": 7,
        "0a17ef:adl": 7,
        "0a17f7:adl": 7,
        "0a1805:adl": 7,
        "0a180b:adl": 7,
        "0a1838:adl": 7,
        "0a1a8f:adl": 7,
        "0a183d:adl": 7,
        "0a184a:adl": 7,
        "0a1854:adl": 112,
        "0a187c:adl": 112,
        "0a188a:adl": 112,
        "0a189e:adl": 112,
        "0a18a6:adl": 112,
        "0a1a83:adl": 224,
        "0a18af:adl": 112,
        "0a18c1:adl": 112,
        "0a18c4:adl": 112,
        "0a18ca:adl": 112,
        "0a18e9:adl": 112,
        "0a18eb:adl": 112,
        "0a190d:adl": 112,
        "0a191f:adl": 112,
        "0a1939:adl": 112,
        "0a1969:adl": 112,
        "0a1976:adl": 112,
        "0a1980:adl": 112,
        "0a1988:adl": 112,
        "0a1994:adl": 112,
        "0a19a4:adl": 784,
        "0a19aa:adl": 112,
        "0a19b5:adl": 112,
        "0a19b7:adl": 112,
        "0a19d7:adl": 112,
        "0a1a1d:adl": 112,
        "0a1a30:adl": 7,
        "05c883:adl": 5,
        "08c345:adl": 3,
        "08c34f:adl": 1,
        "08c366:adl": 2,
        "08c38a:adl": 2,
        "08c3a0:adl": 2,
        "05c689:adl": 2,
        "05c696:adl": 2,
        "05c6a6:adl": 2,
        "05c6ae:adl": 2,
        "05c6b6:adl": 2,
        "05c6c2:adl": 2,
        "05c6d3:adl": 2,
        "05c6e6:adl": 2,
        "05c6fc:adl": 2,
        "0a17b6:adl": 2,
        "05c700:adl": 2,
        "08c3a8:adl": 2,
        "0a27dd:adl": 2,
        "0a27e7:adl": 2,
        "03d1c3:adl": 9,
        "03d1c9:adl": 2,
        "0a32ff:adl": 2,
        "0a3411:adl": 48,
        "0a3418:adl": 16,
        "03d1d1:adl": 2,
        "0a27f9:adl": 2,
        "0a1a36:adl": 2,
        "08c3ac:adl": 2,
        "08c3c3:adl": 2,
        "08c3c9:adl": 2,
        "08c3ee:adl": 2,
        "08c3f2:adl": 2,
        "084989:adl": 2,
        "084998:adl": 2,
        "0849a5:adl": 2,
        "0849b3:adl": 2,
        "0849b9:adl": 2,
        "0849c4:adl": 2,
        "089092:adl": 2,
        "0849c8:adl": 2,
        "0849ca:adl": 2,
        "08909e:adl": 2,
        "0849ce:adl": 2,
        "0849d2:adl": 2,
        "0890c2:adl": 2,
        "0849d6:adl": 2,
        "0849da:adl": 2,
        "0890aa:adl": 2,
        "0849de:adl": 2,
        "0849e6:adl": 2,
        "084b7f:adl": 2,
        "084b82:adl": 2,
        "0849ea:adl": 2,
        "0849ee:adl": 2,
        "0849f8:adl": 2,
        "084adf:adl": 2,
        "084ae7:adl": 2,
        "0849fc:adl": 2,
        "084a00:adl": 4,
        "0851d2:adl": 4,
        "08c3f6:adl": 2,
        "08c3fa:adl": 2,
        "08c3fc:adl": 2,
        "08c401:adl": 2,
        "04e0e4:adl": 2,
        "04e0e8:adl": 2,
        "084ad6:adl": 2,
        "04e0ec:adl": 2,
        "04e0f0:adl": 2,
        "04e0f4:adl": 2,
        "08c405:adl": 2,
        "08c407:adl": 2,
        "08c413:adl": 2,
        "08c417:adl": 2,
        "08c41b:adl": 2,
        "08c44d:adl": 2,
        "08c59b:adl": 2,
        "08c5a7:adl": 2,
        "08c509:adl": 2,
        "08c511:adl": 2,
        "08c519:adl": 2,
        "08c526:adl": 2,
        "08c532:adl": 2,
        "022331:adl": 2,
        "000578:adl": 3,
        "0158a6:adl": 4,
        "022336:adl": 2,
        "022344:adl": 2,
        "08c536:adl": 2,
        "08c72f:adl": 2,
        "05622e:adl": 2,
        "05623d:adl": 2,
        "056244:adl": 2,
        "056248:adl": 2,
        "056253:adl": 2,
        "08c734:adl": 2,
        "08c745:adl": 2,
        "0585e9:adl": 2,
        "0585f8:adl": 2,
        "0585f9:adl": 2,
        "058602:adl": 2,
        "05877a:adl": 2,
        "0587a3:adl": 2,
        "080259:adl": 6,
        "0587a7:adl": 2,
        "0587e9:adl": 2,
        "058b73:adl": 2,
        "0587f1:adl": 2,
        "0587f3:adl": 2,
        "05884c:adl": 2,
        "058eda:adl": 2,
        "058850:adl": 2,
        "05899d:adl": 2,
        "058d54:adl": 4,
        "058ec6:adl": 4,
        "058d58:adl": 4,
        "0800a8:adl": 4,
        "0800ae:adl": 4,
        "0800b2:adl": 4,
        "058d60:adl": 4,
        "058d89:adl": 4,
        "0589a1:adl": 2,
        "0589ae:adl": 2,
        "0589b2:adl": 1,
        "0581a3:adl": 1,
        "0800b8:adl": 3,
        "0581a7:adl": 1,
        "0589b6:adl": 1,
        "05e42a:adl": 1,
        "05e37d:adl": 1,
        "05e38a:adl": 1,
        "05e432:adl": 1,
        "0589ba:adl": 1,
        "08c73d:adl": 2,
        "08c53a:adl": 2,
        "08c543:adl": 2,
        "08c593:adl": 2,
        "08c359:adl": 2,
        "02fcb3:adl": 2,
        "02fcb9:adl": 2,
        "02fd8f:adl": 2,
        "02fda6:adl": 2,
        "03013a:adl": 2,
        "03013f:adl": 2,
        "030145:adl": 2,
        "03014b:adl": 2,
        "030151:adl": 2,
        "030157:adl": 2,
        "02fdac:adl": 2,
        "05c76c:adl": 2,
        "05c81e:adl": 2,
        "02fdb6:adl": 2,
        "03fa09:adl": 2,
        "05c623:adl": 7,
        "03fb9a:adl": 1,
        "03fbc0:adl": 1,
        "03fbc3:adl": 1,
        "03fbe8:adl": 1,
        "02fdc2:adl": 1,
        "02fdc8:adl": 1,
        "02fdd8:adl": 1,
        "02fde6:adl": 1,
        "02fe89:adl": 1,
        "02fe9d:adl": 1,
        "02feb7:adl": 1,
        "02fecf:adl": 1,
        "02fed7:adl": 1,
        "02fedf:adl": 1,
        "02fef3:adl": 1,
        "02ff09:adl": 1,
        "022346:adl": 1,
        "02234b:adl": 1,
        "022357:adl": 1,
        "02ff1a:adl": 1,
        "0302eb:adl": 1,
        "0302f0:adl": 1,
        "02ff1f:adl": 1,
        "02ff23:adl": 1,
        "02ffae:adl": 1,
        "02ffb7:adl": 1,
        "02ffbf:adl": 1,
        "02ffc4:adl": 1,
        "02ffcc:adl": 1,
        "02ffd2:adl": 1,
        "02ffda:adl": 1,
        "02ffde:adl": 1,
        "02ffe3:adl": 1,
        "02ffe7:adl": 1,
        "02ffed:adl": 1,
        "02fe84:adl": 1,
        "030300:adl": 1,
        "02fe88:adl": 1,
        "02fcc6:adl": 1,
        "02fcf9:adl": 1,
        "02fcfd:adl": 1,
        "02fce0:adl": 1,
        "0589bb:adl": 1,
        "0589e5:adl": 1,
        "0589e9:adl": 1,
        "0589ef:adl": 1,
        "058a0c:adl": 1,
        "058a10:adl": 1,
        "058212:adl": 1,
        "058216:adl": 1,
        "05821d:adl": 1,
        "05e3e3:adl": 1,
        "05e3f5:adl": 1,
        "05e3e7:adl": 1,
        "05e3e8:adl": 1,
        "058221:adl": 1,
        "058a14:adl": 1,
        "058a16:adl": 1,
        "0a223a:adl": 1,
        "0a235e:adl": 1,
        "0a223e:adl": 1,
        "0800a0:adl": 1,
        "0800bd:adl": 1,
        "0a2247:adl": 1,
        "0a2251:adl": 1,
        "0a2254:adl": 1,
        "0a225a:adl": 1,
        "0a2263:adl": 1,
        "0a226d:adl": 1,
        "09ef20:adl": 1,
        "09ef44:adl": 1,
        "09ef4c:adl": 1,
        "09ef5e:adl": 1,
        "09ef70:adl": 1,
        "09efb7:adl": 1,
        "09efde:adl": 33600,
        "09efe8:adl": 210,
        "09efef:adl": 210,
        "09efcb:adl": 209,
        "09f001:adl": 1,
        "09f736:adl": 1,
        "09f73a:adl": 1,
        "03cffe:adl": 3,
        "09ef2e:adl": 1,
        "0a227a:adl": 1,
        "0a2280:adl": 1,
        "026789:adl": 1,
        "026795:adl": 1,
        "0267a6:adl": 1,
        "026146:adl": 2,
        "0267b6:adl": 1,
        "0267c5:adl": 1,
        "0267e0:adl": 1,
        "0267f0:adl": 1,
        "026815:adl": 8400,
        "02681a:adl": 8400,
        "026823:adl": 8400,
        "026810:adl": 8190,
        "02682a:adl": 420,
        "02683c:adl": 210,
        "026840:adl": 210,
        "0267f7:adl": 209,
        "026848:adl": 1,
        "026851:adl": 1,
        "0a228f:adl": 1,
        "0a229d:adl": 1,
        "0a22a4:adl": 1,
        "058a1a:adl": 1,
        "058a22:adl": 1,
        "058a26:adl": 1,
        "058a2a:adl": 1,
        "058a58:adl": 1,
        "03fbf9:adl": 1,
        "03fc06:adl": 1,
        "03fa1c:adl": 1,
        "03fa93:adl": 1,
        "03fa9c:adl": 1,
        "03faa2:adl": 1,
        "03fabc:adl": 1,
        "02515c:adl": 1,
        "025196:adl": 1,
        "0251a1:adl": 1,
        "0251cb:adl": 1,
        "03fac1:adl": 1,
        "0005f4:adl": 1,
        "0158b1:adl": 1,
        "03fac5:adl": 1,
        "03fac9:adl": 1,
        "03fad6:adl": 1,
        "03fae2:adl": 1,
        "03fae8:adl": 1,
        "048ac4:adl": 1,
        "00012c:adl": 12,
        "002197:adl": 13,
        "048acc:adl": 1,
        "048ae0:adl": 1,
        "048ae5:adl": 1,
        "03f26d:adl": 2,
        "048ae9:adl": 1,
        "048b07:adl": 1,
        "048b11:adl": 1,
        "048b21:adl": 1,
        "048b26:adl": 1,
        "05206e:adl": 3,
        "052089:adl": 3,
        "048b3c:adl": 1,
        "048b5b:adl": 1,
        "0000b0:adl": 11,
        "00285f:adl": 11,
        "002873:adl": 11,
        "00287d:adl": 11,
        "048b69:adl": 1,
        "048b81:adl": 1,
        "048b91:adl": 1,
        "048ba1:adl": 1,
        "048bb1:adl": 1,
        "048bc1:adl": 1,
        "048bd1:adl": 1,
        "0457b2:adl": 1,
        "04586b:adl": 1,
        "048bd7:adl": 1,
        "048beb:adl": 1,
        "04e07b:adl": 1,
        "000130:adl": 3,
        "00218a:adl": 3,
        "04e07f:adl": 1,
        "04e091:adl": 1,
        "04e0a1:adl": 1,
        "04e0b1:adl": 1,
        "052013:adl": 2,
        "04e0cc:adl": 1,
        "0bcd24:adl": 1,
        "04e0d1:adl": 1,
        "04e0d6:adl": 1,
        "048bfb:adl": 1,
        "049cca:adl": 1,
        "049cd2:adl": 1,
        "049d11:adl": 1,
        "049d19:adl": 1,
        "049a23:adl": 1,
        "049a2b:adl": 1,
        "049a3a:adl": 1,
        "000124:adl": 2,
        "00211b:adl": 2,
        "002147:adl": 2,
        "049aa7:adl": 1,
        "000210:adl": 1,
        "002623:adl": 1,
        "00263e:adl": 1,
        "002649:adl": 1,
        "049ac9:adl": 1,
        "049cc2:adl": 1,
        "049d23:adl": 1,
        "049d2f:adl": 1,
        "049d77:adl": 1,
        "049df9:adl": 1,
        "049dfe:adl": 1,
        "048c0a:adl": 1,
        "048c20:adl": 1,
        "048c2c:adl": 1,
        "04985c:adl": 1,
        "048c44:adl": 1,
        "048c4e:adl": 1,
        "048964:adl": 1,
        "048968:adl": 1,
        "048c5d:adl": 1,
        "048c6b:adl": 1,
        "05202f:adl": 13,
        "048c75:adl": 1,
        "048c7f:adl": 1,
        "048c89:adl": 1,
        "048c93:adl": 1,
        "048c9d:adl": 1,
        "048ca7:adl": 1,
        "048cb1:adl": 1,
        "048cbb:adl": 1,
        "048cc5:adl": 1,
        "048ccf:adl": 1,
        "048cd9:adl": 1,
        "048ce3:adl": 1,
        "048ced:adl": 1,
        "04ca7b:adl": 1,
        "040d11:adl": 1,
        "040d1f:adl": 1,
        "040d29:adl": 1,
        "040d3e:adl": 1,
        "048cf2:adl": 1,
        "048cf7:adl": 1,
        "049ffa:adl": 1,
        "04a00a:adl": 1,
        "04a00f:adl": 1,
        "04a01f:adl": 1,
        "04a024:adl": 1,
        "048d05:adl": 1,
        "048d15:adl": 1,
        "048d1a:adl": 1,
        "048d2a:adl": 1,
        "048d2f:adl": 1,
        "048d3f:adl": 1,
        "048d44:adl": 1,
        "048d54:adl": 1,
        "048d59:adl": 1,
        "048d69:adl": 1,
        "048d6e:adl": 1,
        "040fad:adl": 1,
        "040fb1:adl": 1,
        "040fc1:adl": 1,
        "040fc6:adl": 1,
        "000138:adl": 4,
        "0021c2:adl": 9045,
        "040fcd:adl": 1,
        "040ff9:adl": 1,
        "048d77:adl": 1,
        "048d8c:adl": 1,
        "048d91:adl": 1,
        "048da1:adl": 1,
        "048da6:adl": 1,
        "048db6:adl": 1,
        "048dbb:adl": 1,
        "048dc9:adl": 1,
        "048dce:adl": 1,
        "048dd3:adl": 1,
        "048de4:adl": 1,
        "048de9:adl": 1,
        "048ded:adl": 1,
        "048dfc:adl": 1,
        "0419f1:adl": 1,
        "0419f9:adl": 1,
        "000178:adl": 1,
        "0022f9:adl": 1,
        "002301:adl": 1,
        "002307:adl": 1,
        "002306:adl": 8,
        "002309:adl": 1,
        "0022ff:adl": 1,
        "041a09:adl": 1,
        "000168:adl": 1,
        "00229d:adl": 1,
        "041a1d:adl": 1,
        "04b664:adl": 1,
        "04b67f:adl": 1,
        "04b684:adl": 1,
        "041a28:adl": 1,
        "041a48:adl": 1,
        "041a4d:adl": 1,
        "041a5d:adl": 1,
        "041a62:adl": 1,
        "041a72:adl": 1,
        "041a77:adl": 1,
        "041a8d:adl": 1,
        "041a8f:adl": 1,
        "041ab1:adl": 1,
        "041ab6:adl": 1,
        "041ac6:adl": 1,
        "041acb:adl": 1,
        "041ad4:adl": 1,
        "041ade:adl": 1,
        "02af88:adl": 1,
        "02af90:adl": 1,
        "0bcb0b:adl": 1,
        "0bcb13:adl": 1,
        "02af98:adl": 1,
        "02afb5:adl": 1,
        "02afa8:adl": 4,
        "02afbe:adl": 3,
        "02afb3:adl": 1,
        "02afe3:adl": 1,
        "02afec:adl": 1,
        "0bc93c:adl": 1,
        "0bc944:adl": 1,
        "02aff0:adl": 1,
        "02b00d:adl": 1,
        "02b000:adl": 1,
        "02b00b:adl": 1,
        "02b03b:adl": 1,
        "000100:adl": 1,
        "00257f:adl": 1,
        "002584:adl": 1,
        "002583:adl": 6,
        "002586:adl": 1,
        "02b04e:adl": 1,
        "0bca42:adl": 1,
        "0bca4a:adl": 1,
        "02b070:adl": 1,
        "02b090:adl": 1,
        "02b083:adl": 1,
        "02b08e:adl": 1,
        "02b0be:adl": 1,
        "0bca85:adl": 1,
        "0bca8d:adl": 1,
        "02b0c2:adl": 1,
        "02b0e2:adl": 1,
        "02b0d5:adl": 2,
        "02b0eb:adl": 1,
        "02b0e0:adl": 1,
        "02b110:adl": 1,
        "0bcac8:adl": 1,
        "0bcad0:adl": 1,
        "02b114:adl": 1,
        "02b134:adl": 1,
        "02b127:adl": 1,
        "02b132:adl": 1,
        "02b162:adl": 1,
        "02aec8:adl": 1,
        "02aed0:adl": 1,
        "000338:adl": 1,
        "001ceb:adl": 1,
        "001c55:adl": 4,
        "001c5d:adl": 4,
        "001c5e:adl": 4,
        "001c6b:adl": 4,
        "001cf3:adl": 1,
        "001cf5:adl": 1,
        "001cbc:adl": 17,
        "001cf9:adl": 1,
        "001d01:adl": 1,
        "001d03:adl": 1,
        "001d07:adl": 1,
        "001d0c:adl": 1,
        "02aed4:adl": 1,
        "02aee5:adl": 1,
        "02aee9:adl": 1,
        "0000d4:adl": 1,
        "0029e9:adl": 1,
        "02aef1:adl": 1,
        "02af22:adl": 1,
        "02af0f:adl": 14,
        "000218:adl": 14,
        "002696:adl": 14,
        "0026a1:adl": 14,
        "02af1c:adl": 14,
        "02af2b:adl": 13,
        "02af20:adl": 1,
        "02af62:adl": 1,
        "02b16b:adl": 1,
        "02b175:adl": 1,
        "02b17e:adl": 1,
        "02b19a:adl": 1,
        "02b18b:adl": 2,
        "02b1a3:adl": 1,
        "02b196:adl": 1,
        "02b319:adl": 1,
        "0bcb2f:adl": 1,
        "0bcb37:adl": 1,
        "02b31d:adl": 1,
        "02b33a:adl": 1,
        "02b32d:adl": 3,
        "02b343:adl": 2,
        "02b338:adl": 1,
        "02b368:adl": 1,
        "02b36d:adl": 1,
        "000000:adl": 1,
        "000658:adl": 1,
        "000673:adl": 1,
        "000679:adl": 1,
        "00067e:adl": 1,
        "000688:adl": 1,
        "000697:adl": 1,
        "0006d8:adl": 1,
        "0012ca:adl": 1,
        "0012dd:adl": 1,
        "0012e3:adl": 1,
        "0012ea:adl": 1,
        "001305:adl": 1,
        "00131b:adl": 1,
        "001324:adl": 1,
        "00132d:adl": 1,
        "001336:adl": 1,
        "001352:adl": 1,
        "001359:adl": 79,
        "00135b:adl": 1,
        "00136a:adl": 1,
        "001370:adl": 1,
        "001377:adl": 254,
        "001379:adl": 1,
        "001380:adl": 256,
        "001382:adl": 256,
        "001384:adl": 256,
        "001386:adl": 1,
        "001388:adl": 99,
        "00138a:adl": 1,
        "001393:adl": 1,
        "00139d:adl": 1,
        "0013c3:adl": 1,
        "001988:adl": 1,
        "0019a9:adl": 1,
        "0019b3:adl": 1,
        "0013c7:adl": 1,
        "0158de:adl": 3,
        "0158e8:adl": 3,
        "0158bc:adl": 3,
        "0158c4:adl": 3,
        "0158c6:adl": 3,
        "0158ca:adl": 3,
        "001c4a:adl": 3,
        "0158d2:adl": 3,
        "0158da:adl": 3,
        "0158ec:adl": 3,
        "0158ee:adl": 3,
        "0158f8:adl": 3,
        "0013da:adl": 1,
        "0013e4:adl": 1,
        "001853:adl": 1,
        "001872:adl": 1,
        "0018af:adl": 1,
        "0018d7:adl": 1,
        "001881:adl": 1,
        "0018f8:adl": 1,
        "005b96:adl": 1,
        "00190b:adl": 1,
        "005bb1:adl": 1,
        "005bc3:adl": 1,
        "005bc7:adl": 1,
        "005c44:adl": 1,
        "005c59:adl": 1,
        "005c5e:adl": 1,
        "005c6c:adl": 1,
        "005c71:adl": 1,
        "005c84:adl": 1,
        "005c99:adl": 1,
        "005cae:adl": 1,
        "005cc8:adl": 1,
        "005cdb:adl": 1,
        "005cec:adl": 1,
        "005cf1:adl": 1,
        "005d00:adl": 1,
        "005d0d:adl": 1,
        "0061e3:adl": 8,
        "0061e9:adl": 13,
        "0061f7:adl": 13,
        "006201:adl": 13,
        "006202:adl": 13,
        "005d19:adl": 1,
        "0061e5:adl": 5,
        "005d27:adl": 1,
        "005d35:adl": 1,
        "005d43:adl": 1,
        "005d54:adl": 1,
        "005d6a:adl": 1,
        "005d6f:adl": 1,
        "005d7a:adl": 1,
        "0060f7:adl": 23,
        "0060fb:adl": 23,
        "006114:adl": 86,
        "00612f:adl": 86,
        "00611d:adl": 86,
        "006129:adl": 173,
        "00612e:adl": 173,
        "006118:adl": 87,
        "006133:adl": 87,
        "00613e:adl": 87,
        "006145:adl": 87,
        "00611c:adl": 87,
        "005d80:adl": 1,
        "005d86:adl": 1,
        "005d8c:adl": 1,
        "0060fa:adl": 63,
        "005d92:adl": 1,
        "005d98:adl": 1,
        "005d9e:adl": 1,
        "005da4:adl": 1,
        "005da9:adl": 1,
        "005dae:adl": 1,
        "005db4:adl": 1,
        "005dba:adl": 1,
        "005dc0:adl": 1,
        "005dc6:adl": 1,
        "005dcc:adl": 1,
        "005dd2:adl": 1,
        "005dd8:adl": 1,
        "005dde:adl": 1,
        "005de4:adl": 1,
        "005dea:adl": 1,
        "005df0:adl": 1,
        "005df6:adl": 1,
        "005dfc:adl": 1,
        "005e02:adl": 1,
        "005e08:adl": 1,
        "005e0e:adl": 1,
        "005e14:adl": 1,
        "005e1a:adl": 1,
        "005e20:adl": 1,
        "005e26:adl": 1,
        "005e2c:adl": 1,
        "005e32:adl": 1,
        "005e38:adl": 1,
        "005e3e:adl": 1,
        "005e44:adl": 1,
        "005e4a:adl": 1,
        "005e50:adl": 1,
        "005e56:adl": 1,
        "005e5c:adl": 1,
        "005e62:adl": 1,
        "005e68:adl": 1,
        "005e6e:adl": 1,
        "005e74:adl": 1,
        "006147:adl": 1,
        "006156:adl": 1,
        "00615b:adl": 1,
        "00617d:adl": 1,
        "00618b:adl": 1,
        "006196:adl": 1,
        "00619b:adl": 1,
        "00619f:adl": 1,
        "005e7a:adl": 1,
        "005e80:adl": 1,
        "005e86:adl": 1,
        "005e8c:adl": 1,
        "005e92:adl": 1,
        "005e98:adl": 1,
        "005e9e:adl": 1,
        "005ea4:adl": 1,
        "005eaa:adl": 1,
        "005eb0:adl": 1,
        "005eb6:adl": 1,
        "005ebc:adl": 1,
        "005ec2:adl": 1,
        "005ec8:adl": 1,
        "005ece:adl": 1,
        "005ed4:adl": 1,
        "005eda:adl": 1,
        "005ee0:adl": 1,
        "005ee6:adl": 1,
        "005eec:adl": 1,
        "005ef2:adl": 1,
        "005ef8:adl": 1,
        "005efe:adl": 1,
        "005f04:adl": 1,
        "005f0a:adl": 1,
        "005f10:adl": 1,
        "005f16:adl": 1,
        "005f1c:adl": 1,
        "005f22:adl": 1,
        "005f28:adl": 1,
        "005f2e:adl": 1,
        "005f34:adl": 1,
        "005f3a:adl": 1,
        "005f40:adl": 1,
        "005f46:adl": 1,
        "005f4c:adl": 1,
        "005f52:adl": 1,
        "005f58:adl": 1,
        "005f5e:adl": 1,
        "005f64:adl": 1,
        "005f6a:adl": 1,
        "005f70:adl": 1,
        "005f76:adl": 1,
        "005f7c:adl": 1,
        "005f82:adl": 1,
        "005f88:adl": 1,
        "006094:adl": 1,
        "00609a:adl": 1,
        "0060a8:adl": 1,
        "0060ad:adl": 1,
        "0060af:adl": 31,
        "0060b1:adl": 1,
        "0060b3:adl": 255,
        "0060b5:adl": 1,
        "0060c7:adl": 1,
        "0060d8:adl": 1,
        "0060e5:adl": 1,
        "0060ea:adl": 1,
        "0060f6:adl": 1,
        "00190f:adl": 1,
        "001915:adl": 1,
        "0013e8:adl": 1,
        "0013f0:adl": 1,
        "003b05:adl": 1,
        "003b19:adl": 1,
        "003b2a:adl": 1,
        "003c4b:adl": 1,
        "003b45:adl": 1,
        "003b47:adl": 1,
        "003b5d:adl": 1,
        "003b86:adl": 1,
        "003b9c:adl": 1,
        "003bb0:adl": 1,
        "003bb8:adl": 1,
        "003bc9:adl": 1,
        "003bd1:adl": 1,
        "003be4:adl": 1,
        "003bec:adl": 1,
        "003bf5:adl": 1,
        "003bfd:adl": 1,
        "003c0e:adl": 1,
        "003c16:adl": 1,
        "003c1f:adl": 1,
        "003c27:adl": 1,
        "003c42:adl": 1,
        "003b0d:adl": 1,
        "003b17:adl": 1,
        "0013f4:adl": 1,
        "0013f8:adl": 1,
        "0028d1:adl": 1,
        "0013fc:adl": 1,
        "015930:adl": 1,
        "015937:adl": 1,
        "015944:adl": 1,
        "015953:adl": 1,
        "01597a:adl": 1,
        "015987:adl": 1,
        "000d7e:adl": 1,
        "000dc2:adl": 1,
        "000dca:adl": 1,
        "000d82:adl": 1,
        "000dae:adl": 1,
        "d18b62:adl": 1,
        "015994:adl": 1,
        "015999:adl": 1,
        "0159bb:adl": 1,
        "001405:adl": 1,
        "003cbc:adl": 1,
        "003cc6:adl": 1,
        "001409:adl": 1,
        "001424:adl": 1,
        "001428:adl": 1,
        "00142c:adl": 1,
        "000721:adl": 1,
        "013d00:adl": 1,
        "005ba6:adl": 1,
        "013d11:adl": 1,
        "0059c6:adl": 87,
        "0059d6:adl": 87,
        "005a75:adl": 87,
        "005a82:adl": 87,
        "00596e:adl": 87,
        "005974:adl": 87,
        "005998:adl": 87,
        "005a8b:adl": 87,
        "005a48:adl": 87,
        "005a96:adl": 87,
        "005aa2:adl": 87,
        "005aae:adl": 87,
        "005ae8:adl": 1392,
        "005b16:adl": 1392,
        "005b4b:adl": 1392,
        "005ab6:adl": 1305,
        "005b92:adl": 87,
        "005a19:adl": 87,
        "0059da:adl": 87,
        "0059e6:adl": 87,
        "013d1d:adl": 14,
        "013d19:adl": 13,
        "013d1f:adl": 1,
        "0059e9:adl": 5,
        "0059f3:adl": 71,
        "0059f7:adl": 71,
        "0059ed:adl": 71,
        "0059fe:adl": 5,
        "013d32:adl": 5,
        "013d29:adl": 4,
        "005a60:adl": 2,
        "013d35:adl": 1,
        "013d87:adl": 1,
        "013d8d:adl": 1,
        "000725:adl": 1,
        "00072d:adl": 1,
        "0138f1:adl": 1,
        "0138f9:adl": 1,
        "013918:adl": 1,
        "013927:adl": 1,
        "01394e:adl": 1,
        "01395b:adl": 1,
        "006447:adl": 1,
        "00646c:adl": 1,
        "006475:adl": 1,
        "006479:adl": 1,
        "00647d:adl": 1,
        "0017dd:adl": 2,
        "0017fc:adl": 2,
        "006486:adl": 1,
        "001cc4:adl": 1,
        "00649b:adl": 1,
        "00649d:adl": 1,
        "0064be:adl": 1,
        "006c8e:adl": 1,
        "006c9c:adl": 1,
        "006ca1:adl": 1,
        "006cb2:adl": 1,
        "006cb7:adl": 1,
        "0064c7:adl": 1,
        "0064d0:adl": 1,
        "006cc6:adl": 3,
        "006d5d:adl": 9042,
        "006d64:adl": 9041,
        "006cdf:adl": 9039,
        "006cf7:adl": 9037,
        "006d0f:adl": 9039,
        "006d38:adl": 9038,
        "006d4f:adl": 9038,
        "006cf4:adl": 2,
        "006d68:adl": 2,
        "0064de:adl": 1,
        "0064ee:adl": 1
      },
      "dynamicTargets": [
        5911,
        7252,
        26632,
        7297,
        7240,
        26640,
        26646,
        5927,
        1817,
        260504,
        249944,
        378492,
        574265,
        446075,
        574269,
        668446,
        668562,
        668570,
        668654,
        668578,
        668586,
        668594,
        668602,
        668610,
        668618,
        668846,
        574273,
        664457,
        378905,
        378934,
        378961,
        378965,
        661422,
        507745,
        661445,
        661456,
        661481,
        661565,
        661679,
        661908,
        379011,
        574277,
        378624,
        574376,
        250321,
        665593,
        249932,
        662070,
        574380,
        543176,
        543182,
        543190,
        543198,
        543210,
        543228,
        574454,
        319724,
        319732,
        574469,
        574770,
        140086,
        574774,
        575284,
        361961,
        362407,
        362481,
        362576,
        363864,
        524466,
        363872,
        362913,
        360871,
        362934,
        385930,
        386098,
        362938,
        575293,
        574778,
        378715,
        196012,
        196022,
        249952,
        261018,
        196034,
        140107,
        196378,
        196383,
        196232,
        195782,
        574310,
        524889,
        362985,
        360982,
        386023,
        360993,
        363028,
        664126,
        664135,
        651120,
        651054,
        664186,
        157622,
        157637,
        664207,
        664221,
        664228,
        363034,
        363042,
        363046,
        260636,
        260801,
        260805,
        297676,
        297705,
        297788,
        297833,
        297857,
        297873,
        297889,
        297905,
        297921,
        297937,
        297943,
        297963,
        304,
        319615,
        319633,
        319649,
        319665,
        319692,
        319697,
        297979,
        302290,
        301611,
        301735,
        301769,
        302371,
        302455,
        297994,
        298016,
        298052,
        297320,
        298077,
        298091,
        298101,
        298111,
        298121,
        298131,
        298141,
        298151,
        298161,
        298171,
        298181,
        298191,
        298201,
        298211,
        298221,
        298226,
        303098,
        298245,
        266161,
        266189,
        298359,
        298477,
        268793,
        8959,
        268809,
        268829,
        268840,
        268893,
        268941,
        269012,
        176016,
        772883,
        176024,
        772420,
        176112,
        176206,
        772682,
        176240,
        772749,
        176322,
        772816,
        176404,
        175824,
        7261,
        7411,
        7417,
        7425,
        7431,
        175828,
        175845,
        175857,
        175900,
        176491,
        176501,
        772919,
        176925,
        0,
        5063,
        88260,
        88266,
        88274,
        88300,
        5082,
        6258,
        6411,
        23495,
        23833,
        23847,
        23861,
        24856,
        24860,
        23936,
        23942,
        23948,
        23954,
        23960,
        23966,
        23972,
        23977,
        23982,
        23988,
        23994,
        24000,
        24006,
        24012,
        24018,
        24024,
        24030,
        24036,
        24042,
        24048,
        24054,
        24060,
        24066,
        24072,
        24078,
        24084,
        24090,
        24096,
        24102,
        24108,
        24114,
        24120,
        24126,
        24132,
        24138,
        24144,
        24150,
        24156,
        24162,
        24168,
        24174,
        24180,
        24991,
        24186,
        24198,
        24204,
        24210,
        24216,
        24222,
        24228,
        24234,
        24240,
        24246,
        24252,
        24258,
        24264,
        24270,
        24276,
        24282,
        24288,
        24294,
        24300,
        24306,
        24312,
        24318,
        24324,
        24330,
        24336,
        24342,
        24348,
        24354,
        24360,
        24366,
        24372,
        24378,
        24384,
        24390,
        24396,
        24402,
        24408,
        24414,
        24420,
        24426,
        24432,
        24438,
        24444,
        24450,
        24456,
        24730,
        6415,
        5096,
        15173,
        15197,
        15260,
        15280,
        15305,
        15332,
        15349,
        15374,
        15391,
        15426,
        15117,
        5108,
        5116,
        3458,
        13732706,
        5125,
        5129,
        5160,
        81169,
        22900,
        23179,
        23190,
        23202,
        23002,
        81181,
        23031,
        81202,
        1829,
        1837,
        80121,
        25721,
        6140,
        25734,
        25755,
        25799,
        25808,
        28004,
        25822,
        25838
      ],
      "missingBlocks": [
        "d18b62:adl"
      ]
    },
    "route": {
      "label": "phase875-clear-route-port-bit-skip",
      "totalBlocks": 159977,
      "targetCounts": {
        "launchHome09DD62": 0,
        "phase5PreWipe001879": 0,
        "phase5Cleanup0018F8": 1,
        "homeRepaint058241": 0,
        "clearCaller058A16": 1,
        "clearEntry0A223A": 1,
        "anchor0A229D": 1,
        "liveSpin0A1854": 112,
        "portBranch001872": 1,
        "portSkip0018AF": 1,
        "sentinelBlock0018D7": 1,
        "largeClear001881": 1,
        "shortTail0018EC": 0,
        "cleanup0018F8": 1,
        "poll006D64": 9041,
        "d0301bWriter00086F": 0,
        "d0301bWriter00141C": 0,
        "d0301bWriter001B06": 0,
        "d0301bWriter0141AE": 0,
        "d0301bReader0402BB": 0,
        "d0301bMagicLoad040BF0": 0,
        "d0301bWriter040BF4": 0,
        "d0301bMagicLoad040C62": 0,
        "d0301bWriter040C66": 0
      },
      "targetFirst": {
        "liveSpin0A1854": {
          "block": 412,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": "0x54"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        "clearCaller058A16": {
          "block": 4938,
          "phase": "p7-clear-route",
          "pc": "0x058A16",
          "prevPc": "0x058A14",
          "cpu": {
            "pc": "0x058A16",
            "currentBlockPc": "0x058A16",
            "sp": "0xD1A854",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x4A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        "clearEntry0A223A": {
          "block": 4939,
          "phase": "p7-clear-route",
          "pc": "0x0A223A",
          "prevPc": "0x058A16",
          "cpu": {
            "pc": "0x0A223A",
            "currentBlockPc": "0x0A223A",
            "sp": "0xD1A851",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x4A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            }
          ]
        },
        "anchor0A229D": {
          "block": 73965,
          "phase": "p7-clear-route",
          "pc": "0x0A229D",
          "prevPc": "0x0A2A37",
          "cpu": {
            "pc": "0x0A229D",
            "currentBlockPc": "0x0A229D",
            "sp": "0xD1A851",
            "af": "0x0A0C",
            "bc": "0x000018",
            "de": "0x00013F",
            "hl": "0x000104",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x0C"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            }
          ]
        },
        "portBranch001872": {
          "block": 78211,
          "phase": "p7-clear-route",
          "pc": "0x001872",
          "prevPc": "0x0158F8",
          "cpu": {
            "pc": "0x001872",
            "currentBlockPc": "0x001872",
            "sp": "0xD1A87B",
            "af": "0x0044",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "ix": "0xE00800",
            "iy": "0xD00080",
            "f": "0x44"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013E8"
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
            }
          ]
        },
        "portSkip0018AF": {
          "block": 78212,
          "phase": "p7-clear-route",
          "pc": "0x0018AF",
          "prevPc": "0x001872",
          "cpu": {
            "pc": "0x0018AF",
            "currentBlockPc": "0x0018AF",
            "sp": "0xD1A87B",
            "af": "0xFE10",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "ix": "0xE00800",
            "iy": "0xD00080",
            "f": "0x10"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013E8"
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
            }
          ]
        },
        "sentinelBlock0018D7": {
          "block": 78213,
          "phase": "p7-clear-route",
          "pc": "0x0018D7",
          "prevPc": "0x0018AF",
          "cpu": {
            "pc": "0x0018D7",
            "currentBlockPc": "0x0018D7",
            "sp": "0xD1A87B",
            "af": "0xFF54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "ix": "0xE00800",
            "iy": "0xD00080",
            "f": "0x54"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013E8"
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
            }
          ]
        },
        "largeClear001881": {
          "block": 78214,
          "phase": "p7-clear-route",
          "pc": "0x001881",
          "prevPc": "0x0018D7",
          "cpu": {
            "pc": "0x001881",
            "currentBlockPc": "0x001881",
            "sp": "0xD1A87B",
            "af": "0x5293",
            "bc": "0x000003",
            "de": "0x5AA55A",
            "hl": "0xA55AA6",
            "ix": "0xE00800",
            "iy": "0xD00080",
            "f": "0x93"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013E8"
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
            }
          ]
        },
        "phase5Cleanup0018F8": {
          "block": 78215,
          "phase": "p7-clear-route",
          "pc": "0x0018F8",
          "prevPc": "0x001881",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "af": "0x5281",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "ix": "0xE00800",
            "iy": "0xD00080",
            "f": "0x81"
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013E8"
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
            }
          ]
        },
        "cleanup0018F8": {
          "block": 78215,
          "phase": "p7-clear-route",
          "pc": "0x0018F8",
          "prevPc": "0x001881",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "af": "0x5281",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "ix": "0xE00800",
            "iy": "0xD00080",
            "f": "0x81"
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013E8"
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
            }
          ]
        },
        "poll006D64": {
          "block": 87657,
          "phase": "p7-clear-route",
          "pc": "0x006D64",
          "prevPc": "0x0021C2",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
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
            }
          ]
        }
      },
      "d0301bChanges": [],
      "checkpoints": [
        {
          "label": "beforeClearRun",
          "atBlock": 0,
          "phase": "init",
          "cpu": {
            "pc": "0x0019B5",
            "currentBlockPc": "0x0019B5",
            "sp": "0xD1A863",
            "af": "0x1040",
            "bc": "0x000000",
            "de": "0xD2A815",
            "hl": "0xD1A8A3",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          }
        },
        {
          "label": "afterClearRun",
          "atBlock": 159977,
          "phase": "p7-clear-route",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A828",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x01043E",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "f": "0x54"
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          }
        }
      ],
      "sampleRows": [
        {
          "block": 412,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": "0x54"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 445,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": "0x1A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 478,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 511,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 544,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 577,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 610,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 643,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 676,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 709,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 742,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 775,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 808,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 841,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 874,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 907,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 985,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": "0x54"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1018,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": "0x1A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1051,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1084,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1117,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1150,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1183,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1216,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1249,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1282,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1315,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1348,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1381,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1414,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1447,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 1480,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2378,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": "0x54"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2411,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": "0x1A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2444,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2477,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2510,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2543,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2576,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2609,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2642,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2675,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2708,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2741,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2774,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2807,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2840,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2873,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 2974,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": "0x54"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3007,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": "0x1A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3040,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3073,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3106,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3139,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3172,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3205,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3238,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3271,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3304,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3337,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3370,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3403,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3436,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3469,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3821,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": "0x54"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3854,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": "0x1A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3887,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3920,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3953,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 3986,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4019,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4052,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4085,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": "0x0A"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4118,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4151,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4184,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4217,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4250,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4283,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        },
        {
          "block": 4316,
          "phase": "p7-clear-route",
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": "0x02"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            }
          ]
        }
      ]
    },
    "finalFields": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D010EF": "0x000000",
      "D010FE": "0x000000",
      "D010F4": "0x00",
      "D02317": "0x000000",
      "D0231A": "0x000000",
      "D0231D": "0x000000",
      "D02437": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02440": "0x000000",
      "D02505": "0x00",
      "D02590": "0x000000",
      "D0259D": "0x000000",
      "D02A29": "0x0000",
      "D0301B": "0x000000",
      "D000C2_IY42": "0x00"
    }
  },
  "staticRefs": {
    "addressHits": [
      {
        "kind": "D0301B address bytes",
        "hit": "0x000870",
        "candidates": [
          {
            "pc": "0x00086F",
            "bytes": "22 1B 30 D0",
            "instruction": "LD (0xD0301B), HL",
            "tag": "ld-pair-mem"
          }
        ]
      },
      {
        "kind": "D0301B address bytes",
        "hit": "0x00141D",
        "candidates": [
          {
            "pc": "0x00141C",
            "bytes": "22 1B 30 D0",
            "instruction": "LD (0xD0301B), HL",
            "tag": "ld-pair-mem"
          }
        ]
      },
      {
        "kind": "D0301B address bytes",
        "hit": "0x0018E1",
        "candidates": [
          {
            "pc": "0x0018E0",
            "bytes": "2A 1B 30 D0",
            "instruction": "LD HL, (0xD0301B)",
            "tag": "ld-pair-mem"
          }
        ]
      },
      {
        "kind": "D0301B address bytes",
        "hit": "0x001B07",
        "candidates": [
          {
            "pc": "0x001B06",
            "bytes": "22 1B 30 D0",
            "instruction": "LD (0xD0301B), HL",
            "tag": "ld-pair-mem"
          }
        ]
      },
      {
        "kind": "D0301B address bytes",
        "hit": "0x0141AF",
        "candidates": [
          {
            "pc": "0x0141AE",
            "bytes": "22 1B 30 D0",
            "instruction": "LD (0xD0301B), HL",
            "tag": "ld-pair-mem"
          }
        ]
      },
      {
        "kind": "D0301B address bytes",
        "hit": "0x0402BC",
        "candidates": [
          {
            "pc": "0x0402BB",
            "bytes": "3A 1B 30 D0",
            "instruction": "LD A, (0xD0301B)",
            "tag": "ld-reg-mem"
          }
        ]
      },
      {
        "kind": "D0301B address bytes",
        "hit": "0x040BF5",
        "candidates": [
          {
            "pc": "0x040BF4",
            "bytes": "22 1B 30 D0",
            "instruction": "LD (0xD0301B), HL",
            "tag": "ld-pair-mem"
          }
        ]
      },
      {
        "kind": "D0301B address bytes",
        "hit": "0x040C67",
        "candidates": [
          {
            "pc": "0x040C66",
            "bytes": "22 1B 30 D0",
            "instruction": "LD (0xD0301B), HL",
            "tag": "ld-pair-mem"
          }
        ]
      }
    ],
    "magicHits": [
      {
        "kind": "0x5AA55A magic bytes",
        "hit": "0x0018E5",
        "candidates": [
          {
            "pc": "0x0018E4",
            "bytes": "11 5A A5 5A",
            "instruction": "LD DE, 0x5AA55A",
            "tag": "ld-pair-imm"
          }
        ]
      },
      {
        "kind": "0x5AA55A magic bytes",
        "hit": "0x040BF1",
        "candidates": [
          {
            "pc": "0x040BF0",
            "bytes": "21 5A A5 5A",
            "instruction": "LD HL, 0x5AA55A",
            "tag": "ld-pair-imm"
          }
        ]
      },
      {
        "kind": "0x5AA55A magic bytes",
        "hit": "0x040C63",
        "candidates": [
          {
            "pc": "0x040C62",
            "bytes": "21 5A A5 5A",
            "instruction": "LD HL, 0x5AA55A",
            "tag": "ld-pair-imm"
          }
        ]
      }
    ]
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


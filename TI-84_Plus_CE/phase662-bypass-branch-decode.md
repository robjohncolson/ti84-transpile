# Phase 662: Port-Bit4 Bypass Branch Decode

Probe: `probe-phase662-bypass-branch-decode.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase662-bypass-branch-decode.mjs`

## Summary

- PASS: browser coldboot live-VAT route completed with baseline and forced first-port-read scenarios.
- Baseline: token/tail hits=0, low-path hits=60889, counts={"gate001872":3,"clear001879":3,"bypass0018af":0,"bypass0018d7":0,"bypass001881":0,"cleanup0018f8":3}.
- Forced: shim=0xEE->0xFE at 0x001872#13137, token/tail hits=0, low-path hits=60889, counts={"gate001872":3,"clear001879":2,"bypass0018af":1,"bypass0018d7":1,"bypass001881":1,"cleanup0018f8":3}.
- Finding: The port-bit4 bypass lands in a second cleanup setup path, not a cleanup skip. It sets port 0x07 bit4, checks IY+0x42, sets port 0x09 bit4, then compares D0301B against 0x5AA55A; because the comparison is NZ, it jumps to 0x001881 and reaches the same 0x0018F8 clear tail.
- No browser-shell, runtime, transpiler, scheduler, or golden-regression-relevant source files were modified.

## Dynamic Branch Samples

| Scenario | 0x001872 | 0x001879 | 0x0018AF | 0x0018D7 | 0x001881 | 0x0018F8 |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline | gate001872@0x001872#13137; AF=0x0044; Z=true; C=false; HL=0x000000; DE=0x000430; BC=0x000003; stack0=0x0013E8; IY+42=0x00; D0301B=0x000000; port03=read:0xEE@0x001988; port07=none; port09=write:0x42@0x001853 | clear001879@0x001879#13138; AF=0xEE54; Z=true; C=false; HL=0x000000; DE=0x000430; BC=0x000003; stack0=0x0013E8; IY+42=0x00; D0301B=0x000000; port03=read:0xEE@0x001872; port07=none; port09=write:0x42@0x001853 | none | none | none | cleanup0018f8@0x0018F8#13139; AF=0x5200; Z=false; C=false; HL=0xD3FEFF; DE=0xD3FF00; BC=0x0000FF; stack0=0x0013E8; IY+42=0x00; D0301B=0x000000; port03=read:0xEE@0x001872; port07=none; port09=write:0x52@0x001879 |
| Forced | gate001872@0x001872#13137; AF=0x0044; Z=true; C=false; HL=0x000000; DE=0x000430; BC=0x000003; stack0=0x0013E8; IY+42=0x00; D0301B=0x000000; port03=read:0xEE@0x001988; port07=none; port09=write:0x42@0x001853 | clear001879@0x001879#203291; AF=0xEE54; Z=true; C=false; HL=0x000000; DE=0x000430; BC=0x000003; stack0=0x000862; IY+42=0x00; D0301B=0x000000; port03=read:0xEE@0x001872; port07=none; port09=write:0x76@0x001853 | bypass0018af@0x0018AF#13138; AF=0xFE10; Z=false; C=false; HL=0x000000; DE=0x000430; BC=0x000003; stack0=0x0013E8; IY+42=0x00; D0301B=0x000000; port03=read:0xFE@0x001872; port07=none; port09=write:0x42@0x001853 | bypass0018d7@0x0018D7#13139; AF=0xFF54; Z=true; C=false; HL=0x000000; DE=0x000430; BC=0x000003; stack0=0x0013E8; IY+42=0x00; D0301B=0x000000; port03=read:0xFE@0x001872; port07=none; port09=write:0x42@0x001853 | bypass001881@0x001881#13140; AF=0x5293; Z=false; C=true; HL=0xA55AA6; DE=0x5AA55A; BC=0x000003; stack0=0x0013E8; IY+42=0x00; D0301B=0x000000; port03=read:0xFE@0x001872; port07=none; port09=write:0x52@0x0018D7 | cleanup0018f8@0x0018F8#13141; AF=0x5281; Z=false; C=true; HL=0xD3FEFF; DE=0xD3FF00; BC=0x0000FF; stack0=0x0013E8; IY+42=0x00; D0301B=0x000000; port03=read:0xFE@0x001872; port07=none; port09=write:0x52@0x0018D7 |

## Static Decode: 0x0018AF..0x0018F8

| Address | Bytes | Instruction |
| --- | --- | --- |
| 0x0018AF | 0xED 0x38 0x07 | len=3 tag=in0 reg=a port=7 mode=adl modePrefix=null |
| 0x0018B2 | 0xCB 0xE7 | len=2 tag=bit-set bit=4 reg=a mode=adl modePrefix=null |
| 0x0018B4 | 0xED 0x39 0x07 | len=3 tag=out0 reg=a port=7 mode=adl modePrefix=null |
| 0x0018B7 | 0xFD 0xCB 0x42 0x7E | len=4 tag=indexed-cb-bit bit=7 indexRegister=iy displacement=66 mode=adl modePrefix=null |
| 0x0018BB | 0x28 0x1A | len=2 tag=jr-conditional condition=z target=6359 fallthrough=6333 terminates=true mode=adl modePrefix=null |
| 0x0018BD | 0x3E 0x08 | len=2 tag=ld-reg-imm dest=a value=8 mode=adl modePrefix=null |
| 0x0018BF | 0x32 0x00 0x00 0xF8 | len=4 tag=ld-mem-reg addr=16252928 src=a mode=adl modePrefix=null |
| 0x0018C3 | 0xED 0x38 0x09 | len=3 tag=in0 reg=a port=9 mode=adl modePrefix=null |
| 0x0018C6 | 0xCB 0xA7 | len=2 tag=bit-res bit=4 reg=a mode=adl modePrefix=null |
| 0x0018C8 | 0xED 0x39 0x09 | len=3 tag=out0 reg=a port=9 mode=adl modePrefix=null |
| 0x0018CB | 0x3A 0x0C 0x00 0xF9 | len=4 tag=ld-reg-mem dest=a addr=16318476 mode=adl modePrefix=null |
| 0x0018CF | 0xCB 0xF7 | len=2 tag=bit-set bit=6 reg=a mode=adl modePrefix=null |
| 0x0018D1 | 0x32 0x0C 0x00 0xF9 | len=4 tag=ld-mem-reg addr=16318476 src=a mode=adl modePrefix=null |
| 0x0018D5 | 0x18 0x08 | len=2 tag=jr target=6367 terminates=true mode=adl modePrefix=null |
| 0x0018D7 | 0xED 0x38 0x09 | len=3 tag=in0 reg=a port=9 mode=adl modePrefix=null |
| 0x0018DA | 0xCB 0xE7 | len=2 tag=bit-set bit=4 reg=a mode=adl modePrefix=null |
| 0x0018DC | 0xED 0x39 0x09 | len=3 tag=out0 reg=a port=9 mode=adl modePrefix=null |
| 0x0018DF | 0xB7 | len=1 tag=alu-reg op=or src=a mode=adl modePrefix=null |
| 0x0018E0 | 0x2A 0x1B 0x30 0xD0 | len=4 tag=ld-pair-mem pair=hl addr=13643803 direction=from-mem mode=adl modePrefix=null |
| 0x0018E4 | 0x11 0x5A 0xA5 0x5A | len=4 tag=ld-pair-imm pair=de value=5940570 mode=adl modePrefix=null |
| 0x0018E8 | 0xED 0x52 | len=2 tag=sbc-pair src=de mode=adl modePrefix=null |
| 0x0018EA | 0x20 0x95 | len=2 tag=jr-conditional condition=nz target=6273 fallthrough=6380 terminates=true mode=adl modePrefix=null |
| 0x0018EC | 0x01 0x25 0x00 0x00 | len=4 tag=ld-pair-imm pair=bc value=37 mode=adl modePrefix=null |
| 0x0018F0 | 0x21 0xFF 0x00 0xD0 | len=4 tag=ld-pair-imm pair=hl value=13631743 mode=adl modePrefix=null |
| 0x0018F4 | 0x11 0x00 0x01 0xD0 | len=4 tag=ld-pair-imm pair=de value=13631744 mode=adl modePrefix=null |

## Shim Events

```json
[
  {
    "block": 13137,
    "pc": "0x001872",
    "port": "0x0003",
    "raw": "0xEE",
    "forced": "0xFE",
    "stack24": [
      {
        "offset": 0,
        "addr": "0xD1A87B",
        "value": "0x0013E8"
      },
      {
        "offset": 3,
        "addr": "0xD1A87E",
        "value": "0x000000"
      },
      {
        "offset": 6,
        "addr": "0xD1A881",
        "value": "0x000000"
      },
      {
        "offset": 9,
        "addr": "0xD1A884",
        "value": "0x000000"
      },
      {
        "offset": 12,
        "addr": "0xD1A887",
        "value": "0x000000"
      },
      {
        "offset": 15,
        "addr": "0xD1A88A",
        "value": "0x000000"
      },
      {
        "offset": 18,
        "addr": "0xD1A88D",
        "value": "0x008000"
      },
      {
        "offset": 21,
        "addr": "0xD1A890",
        "value": "0x000000"
      }
    ],
    "cpuBefore": {
      "pc": "0x001872",
      "sp": "0xD1A87B",
      "ix": "0x000000",
      "iy": "0xD00080",
      "a": "0x00",
      "f": "0x44",
      "af": "0x0044",
      "bc": "0x000003",
      "de": "0x000430",
      "hl": "0x000000",
      "flags": {
        "s": false,
        "z": true,
        "h": false,
        "pv": true,
        "n": false,
        "c": false
      },
      "halted": false,
      "madl": 1,
      "mbase": "0xD0"
    }
  }
]
```

## Scenario Records

```json
{
  "scenarios": [
    {
      "label": "baseline-no-autorun-digit2",
      "replayOk": true,
      "errors": [],
      "key": {
        "label": "Digit2",
        "afterStatus": "Key: 2 → 300000 steps (peak 8754px)",
        "afterVramPixels": 3040,
        "route": {
          "label": "baseline-no-autorun-digit2:Digit2",
          "totalBlocks": 299956,
          "tokenHookHits": 0,
          "lowPathHits": 60889,
          "counts": {
            "gate001872": 3,
            "clear001879": 3,
            "bypass0018af": 0,
            "bypass0018d7": 0,
            "bypass001881": 0,
            "cleanup0018f8": 3
          },
          "forcedPort03Events": [],
          "samples": {
            "gate001872": {
              "block": 13137,
              "target": "gate001872",
              "pc": "0x001872",
              "previousPc": "0x0158F8",
              "routeFields": {
                "D00587": 0,
                "D0058C": 0,
                "D0058D": 26,
                "D0058E": 0,
                "D00080": 0,
                "D0009F": 0,
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02A28": 0,
                "D001B8": 0,
                "D001D3": 0,
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 13805591,
                "D0301B": 0,
                "D02A40": 0,
                "VAT_D02590": 13893249,
                "VAT_D0259D": 13893325
              },
              "cpu": {
                "pc": "0x001872",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0x00",
                "f": "0x44",
                "af": "0x0044",
                "bc": "0x000003",
                "de": "0x000430",
                "hl": "0x000000",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              },
              "iyFlags": {
                "IY+00": {
                  "addr": "0xD00080",
                  "value": "0x00"
                },
                "IY+0D": {
                  "addr": "0xD0008D",
                  "value": "0x0E"
                },
                "IY+1B": {
                  "addr": "0xD0009B",
                  "value": "0x00"
                },
                "IY+1F": {
                  "addr": "0xD0009F",
                  "value": "0x00"
                },
                "IY+23": {
                  "addr": "0xD000A3",
                  "value": "0x00"
                },
                "IY+27": {
                  "addr": "0xD000A7",
                  "value": "0x00"
                },
                "IY+28": {
                  "addr": "0xD000A8",
                  "value": "0x00"
                },
                "IY+2C": {
                  "addr": "0xD000AC",
                  "value": "0x00"
                },
                "IY+42": {
                  "addr": "0xD000C2",
                  "value": "0x00"
                },
                "IY+44": {
                  "addr": "0xD000C4",
                  "value": "0x00"
                }
              },
              "bytesAtPc": [
                "0xED",
                "0x38",
                "0x03",
                "0xCB",
                "0x67",
                "0x20",
                "0x36",
                "0xED",
                "0x38",
                "0x09",
                "0xCB",
                "0xE7",
                "0xED",
                "0x39",
                "0x09",
                "0x21"
              ],
              "recentBlocks": [
                "0x001C82",
                "0x001C48",
                "0x001C33",
                "0x001C38",
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
                "0x001C4A",
                "0x0158D2",
                "0x0158DA",
                "0x0158EC",
                "0x0158EE",
                "0x0158F8",
                "0x001872"
              ],
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x0013E8"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                },
                {
                  "offset": 24,
                  "addr": "0xD1A893",
                  "value": "0x000000"
                },
                {
                  "offset": 27,
                  "addr": "0xD1A896",
                  "value": "0x008000"
                },
                {
                  "offset": 30,
                  "addr": "0xD1A899",
                  "value": "0x000000"
                },
                {
                  "offset": 33,
                  "addr": "0xD1A89C",
                  "value": "0x000000"
                }
              ],
              "returnHints": [
                "0x0013E8",
                "0x008000",
                "0x008000"
              ],
              "ioTail": [
                {
                  "type": "read",
                  "block": 11700,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11707,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11708,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11709,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11893,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11900,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11901,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11902,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12082,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12089,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12090,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12091,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12217,
                  "pc": "0x02B03B",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x12",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12503,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 12570,
                  "pc": "0x000658",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x02",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12573,
                  "pc": "0x00067E",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x05",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12576,
                  "pc": "0x0012E3",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x06",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12920,
                  "pc": "0x001379",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x76",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x7F",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                }
              ],
              "lastIoByPort": {
                "0x0003": {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5016": {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5015": {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5014": {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5004": {
                  "type": "read",
                  "block": 11349,
                  "pc": "0x03FAA2",
                  "port": "0x5004",
                  "value": "0x11",
                  "a": "0xCC",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5005": {
                  "type": "write",
                  "block": 11366,
                  "pc": "0x048ACC",
                  "port": "0x5005",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x45",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": true
                  }
                },
                "0x0009": {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                }
              }
            },
            "clear001879": {
              "block": 13138,
              "target": "clear001879",
              "pc": "0x001879",
              "previousPc": "0x001872",
              "routeFields": {
                "D00587": 0,
                "D0058C": 0,
                "D0058D": 26,
                "D0058E": 0,
                "D00080": 0,
                "D0009F": 0,
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02A28": 0,
                "D001B8": 0,
                "D001D3": 0,
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 13805591,
                "D0301B": 0,
                "D02A40": 0,
                "VAT_D02590": 13893249,
                "VAT_D0259D": 13893325
              },
              "cpu": {
                "pc": "0x001879",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0xEE",
                "f": "0x54",
                "af": "0xEE54",
                "bc": "0x000003",
                "de": "0x000430",
                "hl": "0x000000",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": true,
                  "pv": true,
                  "n": false,
                  "c": false
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              },
              "iyFlags": {
                "IY+00": {
                  "addr": "0xD00080",
                  "value": "0x00"
                },
                "IY+0D": {
                  "addr": "0xD0008D",
                  "value": "0x0E"
                },
                "IY+1B": {
                  "addr": "0xD0009B",
                  "value": "0x00"
                },
                "IY+1F": {
                  "addr": "0xD0009F",
                  "value": "0x00"
                },
                "IY+23": {
                  "addr": "0xD000A3",
                  "value": "0x00"
                },
                "IY+27": {
                  "addr": "0xD000A7",
                  "value": "0x00"
                },
                "IY+28": {
                  "addr": "0xD000A8",
                  "value": "0x00"
                },
                "IY+2C": {
                  "addr": "0xD000AC",
                  "value": "0x00"
                },
                "IY+42": {
                  "addr": "0xD000C2",
                  "value": "0x00"
                },
                "IY+44": {
                  "addr": "0xD000C4",
                  "value": "0x00"
                }
              },
              "bytesAtPc": [
                "0xED",
                "0x38",
                "0x09",
                "0xCB",
                "0xE7",
                "0xED",
                "0x39",
                "0x09",
                "0x21",
                "0x00",
                "0x00",
                "0xD0",
                "0x11",
                "0x01",
                "0x00",
                "0xD0"
              ],
              "recentBlocks": [
                "0x001C48",
                "0x001C33",
                "0x001C38",
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
                "0x001C4A",
                "0x0158D2",
                "0x0158DA",
                "0x0158EC",
                "0x0158EE",
                "0x0158F8",
                "0x001872",
                "0x001879"
              ],
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x0013E8"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                },
                {
                  "offset": 24,
                  "addr": "0xD1A893",
                  "value": "0x000000"
                },
                {
                  "offset": 27,
                  "addr": "0xD1A896",
                  "value": "0x008000"
                },
                {
                  "offset": 30,
                  "addr": "0xD1A899",
                  "value": "0x000000"
                },
                {
                  "offset": 33,
                  "addr": "0xD1A89C",
                  "value": "0x000000"
                }
              ],
              "returnHints": [
                "0x0013E8",
                "0x008000",
                "0x008000"
              ],
              "ioTail": [
                {
                  "type": "read",
                  "block": 11707,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11708,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11709,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11893,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11900,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11901,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11902,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12082,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12089,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12090,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12091,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12217,
                  "pc": "0x02B03B",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x12",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12503,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 12570,
                  "pc": "0x000658",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x02",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12573,
                  "pc": "0x00067E",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x05",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12576,
                  "pc": "0x0012E3",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x06",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12920,
                  "pc": "0x001379",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x76",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x7F",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              ],
              "lastIoByPort": {
                "0x0003": {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5016": {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5015": {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5014": {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5004": {
                  "type": "read",
                  "block": 11349,
                  "pc": "0x03FAA2",
                  "port": "0x5004",
                  "value": "0x11",
                  "a": "0xCC",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5005": {
                  "type": "write",
                  "block": 11366,
                  "pc": "0x048ACC",
                  "port": "0x5005",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x45",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": true
                  }
                },
                "0x0009": {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                }
              }
            },
            "bypass0018af": null,
            "bypass0018d7": null,
            "bypass001881": null,
            "cleanup0018f8": {
              "block": 13139,
              "target": "cleanup0018f8",
              "pc": "0x0018F8",
              "previousPc": "0x001879",
              "routeFields": {
                "D00587": 0,
                "D0058C": 0,
                "D0058D": 0,
                "D0058E": 0,
                "D00080": 0,
                "D0009F": 0,
                "D007CA": 0,
                "D008E0": 0,
                "D02A28": 0,
                "D001B8": 0,
                "D001D3": 0,
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 0,
                "D0301B": 0,
                "D02A40": 0,
                "VAT_D02590": 0,
                "VAT_D0259D": 0
              },
              "cpu": {
                "pc": "0x0018F8",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0x52",
                "f": "0x00",
                "af": "0x5200",
                "bc": "0x0000FF",
                "de": "0xD3FF00",
                "hl": "0xD3FEFF",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              },
              "iyFlags": {
                "IY+00": {
                  "addr": "0xD00080",
                  "value": "0x00"
                },
                "IY+0D": {
                  "addr": "0xD0008D",
                  "value": "0x00"
                },
                "IY+1B": {
                  "addr": "0xD0009B",
                  "value": "0x00"
                },
                "IY+1F": {
                  "addr": "0xD0009F",
                  "value": "0x00"
                },
                "IY+23": {
                  "addr": "0xD000A3",
                  "value": "0x00"
                },
                "IY+27": {
                  "addr": "0xD000A7",
                  "value": "0x00"
                },
                "IY+28": {
                  "addr": "0xD000A8",
                  "value": "0x00"
                },
                "IY+2C": {
                  "addr": "0xD000AC",
                  "value": "0x00"
                },
                "IY+42": {
                  "addr": "0xD000C2",
                  "value": "0x00"
                },
                "IY+44": {
                  "addr": "0xD000C4",
                  "value": "0x00"
                }
              },
              "bytesAtPc": [
                "0x36",
                "0x00",
                "0xED",
                "0xB0",
                "0xAF",
                "0x32",
                "0xB7",
                "0x77",
                "0xD1",
                "0x3E",
                "0x95",
                "0x32",
                "0x8F",
                "0x05",
                "0xD0",
                "0xCD"
              ],
              "recentBlocks": [
                "0x001C33",
                "0x001C38",
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
                "0x001C4A",
                "0x0158D2",
                "0x0158DA",
                "0x0158EC",
                "0x0158EE",
                "0x0158F8",
                "0x001872",
                "0x001879",
                "0x0018F8"
              ],
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x0013E8"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                },
                {
                  "offset": 24,
                  "addr": "0xD1A893",
                  "value": "0x000000"
                },
                {
                  "offset": 27,
                  "addr": "0xD1A896",
                  "value": "0x008000"
                },
                {
                  "offset": 30,
                  "addr": "0xD1A899",
                  "value": "0x000000"
                },
                {
                  "offset": 33,
                  "addr": "0xD1A89C",
                  "value": "0x000000"
                }
              ],
              "returnHints": [
                "0x0013E8",
                "0x008000",
                "0x008000"
              ],
              "ioTail": [
                {
                  "type": "read",
                  "block": 11709,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11893,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11900,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11901,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11902,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12082,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12089,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12090,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12091,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12217,
                  "pc": "0x02B03B",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x12",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12503,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 12570,
                  "pc": "0x000658",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x02",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12573,
                  "pc": "0x00067E",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x05",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12576,
                  "pc": "0x0012E3",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x06",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12920,
                  "pc": "0x001379",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x76",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x7F",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13138,
                  "pc": "0x001879",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0xEE",
                  "f": "0x54",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": true,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13138,
                  "pc": "0x001879",
                  "port": "0x0009",
                  "value": "0x52",
                  "a": "0x52",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              ],
              "lastIoByPort": {
                "0x0003": {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5016": {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5015": {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5014": {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5004": {
                  "type": "read",
                  "block": 11349,
                  "pc": "0x03FAA2",
                  "port": "0x5004",
                  "value": "0x11",
                  "a": "0xCC",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5005": {
                  "type": "write",
                  "block": 11366,
                  "pc": "0x048ACC",
                  "port": "0x5005",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x45",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": true
                  }
                },
                "0x0009": {
                  "type": "write",
                  "block": 13138,
                  "pc": "0x001879",
                  "port": "0x0009",
                  "value": "0x52",
                  "a": "0x52",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              }
            }
          },
          "firstBlocks": [
            "0x08C331",
            "0x05C634",
            "0x000038",
            "0x0006F3",
            "0x000704",
            "0x000710",
            "0x001713",
            "0x0008BB",
            "0x001717",
            "0x001718",
            "0x00171E",
            "0x0067F8",
            "0x001C4F",
            "0x001CA6",
            "0x001CC0",
            "0x001CCA",
            "0x001CCE",
            "0x001CD5",
            "0x001CE5",
            "0x001C54"
          ],
          "hotBlocks": [
            {
              "pc": "0x000A92",
              "count": 33289
            },
            {
              "pc": "0x000BFE",
              "count": 32258
            },
            {
              "pc": "0x0021C2",
              "count": 20182
            },
            {
              "pc": "0x006D5D",
              "count": 20176
            },
            {
              "pc": "0x006D64",
              "count": 20176
            },
            {
              "pc": "0x006CDF",
              "count": 20166
            },
            {
              "pc": "0x006D0F",
              "count": 20166
            },
            {
              "pc": "0x006D38",
              "count": 20160
            },
            {
              "pc": "0x006D4F",
              "count": 20160
            },
            {
              "pc": "0x006CF7",
              "count": 20156
            },
            {
              "pc": "0x005AE8",
              "count": 6224
            },
            {
              "pc": "0x005B16",
              "count": 6224
            }
          ],
          "startFields": {
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D007CA": 361961,
            "D008E0": 0,
            "D02A28": 0,
            "D001B8": 0,
            "D001D3": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 13805589,
            "D0301B": 0,
            "D02A40": 0,
            "VAT_D02590": 13893249,
            "VAT_D0259D": 13893325
          },
          "endFields": {
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D007CA": 0,
            "D008E0": 0,
            "D02A28": 0,
            "D001B8": 0,
            "D001D3": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 0,
            "D0301B": 0,
            "D02A40": 0,
            "VAT_D02590": 0,
            "VAT_D0259D": 0
          }
        }
      }
    },
    {
      "label": "force-port03-bit4-no-autorun-digit2",
      "replayOk": true,
      "errors": [],
      "key": {
        "label": "Digit2",
        "afterStatus": "Key: 2 → 300000 steps (peak 8754px)",
        "afterVramPixels": 3040,
        "route": {
          "label": "force-port03-bit4-no-autorun-digit2:Digit2",
          "totalBlocks": 299956,
          "tokenHookHits": 0,
          "lowPathHits": 60889,
          "counts": {
            "gate001872": 3,
            "clear001879": 2,
            "bypass0018af": 1,
            "bypass0018d7": 1,
            "bypass001881": 1,
            "cleanup0018f8": 3
          },
          "forcedPort03Events": [
            {
              "block": 13137,
              "pc": "0x001872",
              "port": "0x0003",
              "raw": "0xEE",
              "forced": "0xFE",
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x0013E8"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                }
              ],
              "cpuBefore": {
                "pc": "0x001872",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0x00",
                "f": "0x44",
                "af": "0x0044",
                "bc": "0x000003",
                "de": "0x000430",
                "hl": "0x000000",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              }
            }
          ],
          "samples": {
            "gate001872": {
              "block": 13137,
              "target": "gate001872",
              "pc": "0x001872",
              "previousPc": "0x0158F8",
              "routeFields": {
                "D00587": 0,
                "D0058C": 0,
                "D0058D": 26,
                "D0058E": 0,
                "D00080": 0,
                "D0009F": 0,
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02A28": 0,
                "D001B8": 0,
                "D001D3": 0,
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 13805591,
                "D0301B": 0,
                "D02A40": 0,
                "VAT_D02590": 13893249,
                "VAT_D0259D": 13893325
              },
              "cpu": {
                "pc": "0x001872",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0x00",
                "f": "0x44",
                "af": "0x0044",
                "bc": "0x000003",
                "de": "0x000430",
                "hl": "0x000000",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              },
              "iyFlags": {
                "IY+00": {
                  "addr": "0xD00080",
                  "value": "0x00"
                },
                "IY+0D": {
                  "addr": "0xD0008D",
                  "value": "0x0E"
                },
                "IY+1B": {
                  "addr": "0xD0009B",
                  "value": "0x00"
                },
                "IY+1F": {
                  "addr": "0xD0009F",
                  "value": "0x00"
                },
                "IY+23": {
                  "addr": "0xD000A3",
                  "value": "0x00"
                },
                "IY+27": {
                  "addr": "0xD000A7",
                  "value": "0x00"
                },
                "IY+28": {
                  "addr": "0xD000A8",
                  "value": "0x00"
                },
                "IY+2C": {
                  "addr": "0xD000AC",
                  "value": "0x00"
                },
                "IY+42": {
                  "addr": "0xD000C2",
                  "value": "0x00"
                },
                "IY+44": {
                  "addr": "0xD000C4",
                  "value": "0x00"
                }
              },
              "bytesAtPc": [
                "0xED",
                "0x38",
                "0x03",
                "0xCB",
                "0x67",
                "0x20",
                "0x36",
                "0xED",
                "0x38",
                "0x09",
                "0xCB",
                "0xE7",
                "0xED",
                "0x39",
                "0x09",
                "0x21"
              ],
              "recentBlocks": [
                "0x001C82",
                "0x001C48",
                "0x001C33",
                "0x001C38",
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
                "0x001C4A",
                "0x0158D2",
                "0x0158DA",
                "0x0158EC",
                "0x0158EE",
                "0x0158F8",
                "0x001872"
              ],
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x0013E8"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                },
                {
                  "offset": 24,
                  "addr": "0xD1A893",
                  "value": "0x000000"
                },
                {
                  "offset": 27,
                  "addr": "0xD1A896",
                  "value": "0x008000"
                },
                {
                  "offset": 30,
                  "addr": "0xD1A899",
                  "value": "0x000000"
                },
                {
                  "offset": 33,
                  "addr": "0xD1A89C",
                  "value": "0x000000"
                }
              ],
              "returnHints": [
                "0x0013E8",
                "0x008000",
                "0x008000"
              ],
              "ioTail": [
                {
                  "type": "read",
                  "block": 11700,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11707,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11708,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11709,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11893,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11900,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11901,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11902,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12082,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12089,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12090,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12091,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12217,
                  "pc": "0x02B03B",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x12",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12503,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 12570,
                  "pc": "0x000658",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x02",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12573,
                  "pc": "0x00067E",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x05",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12576,
                  "pc": "0x0012E3",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x06",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12920,
                  "pc": "0x001379",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x76",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x7F",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                }
              ],
              "lastIoByPort": {
                "0x0003": {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5016": {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5015": {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5014": {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5004": {
                  "type": "read",
                  "block": 11349,
                  "pc": "0x03FAA2",
                  "port": "0x5004",
                  "value": "0x11",
                  "a": "0xCC",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5005": {
                  "type": "write",
                  "block": 11366,
                  "pc": "0x048ACC",
                  "port": "0x5005",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x45",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": true
                  }
                },
                "0x0009": {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                }
              }
            },
            "clear001879": {
              "block": 203291,
              "target": "clear001879",
              "pc": "0x001879",
              "previousPc": "0x001872",
              "routeFields": {
                "D00587": 0,
                "D0058C": 0,
                "D0058D": 0,
                "D0058E": 0,
                "D00080": 0,
                "D0009F": 0,
                "D007CA": 0,
                "D008E0": 0,
                "D02A28": 0,
                "D001B8": 0,
                "D001D3": 0,
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 0,
                "D0301B": 0,
                "D02A40": 0,
                "VAT_D02590": 0,
                "VAT_D0259D": 0
              },
              "cpu": {
                "pc": "0x001879",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0xEE",
                "f": "0x54",
                "af": "0xEE54",
                "bc": "0x000003",
                "de": "0x000430",
                "hl": "0x000000",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": true,
                  "pv": true,
                  "n": false,
                  "c": false
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              },
              "iyFlags": {
                "IY+00": {
                  "addr": "0xD00080",
                  "value": "0x00"
                },
                "IY+0D": {
                  "addr": "0xD0008D",
                  "value": "0x00"
                },
                "IY+1B": {
                  "addr": "0xD0009B",
                  "value": "0x00"
                },
                "IY+1F": {
                  "addr": "0xD0009F",
                  "value": "0x00"
                },
                "IY+23": {
                  "addr": "0xD000A3",
                  "value": "0x00"
                },
                "IY+27": {
                  "addr": "0xD000A7",
                  "value": "0x00"
                },
                "IY+28": {
                  "addr": "0xD000A8",
                  "value": "0x00"
                },
                "IY+2C": {
                  "addr": "0xD000AC",
                  "value": "0x01"
                },
                "IY+42": {
                  "addr": "0xD000C2",
                  "value": "0x00"
                },
                "IY+44": {
                  "addr": "0xD000C4",
                  "value": "0x00"
                }
              },
              "bytesAtPc": [
                "0xED",
                "0x38",
                "0x09",
                "0xCB",
                "0xE7",
                "0xED",
                "0x39",
                "0x09",
                "0x21",
                "0x00",
                "0x00",
                "0xD0",
                "0x11",
                "0x01",
                "0x00",
                "0xD0"
              ],
              "recentBlocks": [
                "0x001C48",
                "0x001C33",
                "0x001C38",
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
                "0x001C4A",
                "0x0158D2",
                "0x0158DA",
                "0x0158EC",
                "0x0158EE",
                "0x0158F8",
                "0x001872",
                "0x001879"
              ],
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x000862"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                },
                {
                  "offset": 24,
                  "addr": "0xD1A893",
                  "value": "0x000000"
                },
                {
                  "offset": 27,
                  "addr": "0xD1A896",
                  "value": "0x008000"
                },
                {
                  "offset": 30,
                  "addr": "0xD1A899",
                  "value": "0x000000"
                },
                {
                  "offset": 33,
                  "addr": "0xD1A89C",
                  "value": "0x000000"
                }
              ],
              "returnHints": [
                "0x000862",
                "0x008000",
                "0x008000"
              ],
              "ioTail": [
                {
                  "type": "read",
                  "block": 199200,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x2C",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 199393,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x2D",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 199586,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x2E",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 199779,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x2F",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 199972,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x30",
                  "f": "0xB0",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 200165,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x31",
                  "f": "0xB0",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 200358,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x32",
                  "f": "0xB0",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 200551,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x33",
                  "f": "0xB0",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 200744,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x34",
                  "f": "0xB0",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 200937,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x35",
                  "f": "0xB0",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 201130,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x36",
                  "f": "0xB0",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 201323,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x37",
                  "f": "0xB0",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 201516,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x38",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 201709,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x39",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 201902,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x3A",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 202097,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x3C",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 202290,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x3D",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 202483,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x3E",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 202676,
                  "pc": "0x000E7F",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x3F",
                  "f": "0xB8",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 203089,
                  "pc": "0x001D37",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0xFF",
                  "f": "0x90",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 203103,
                  "pc": "0x001D37",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 203188,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x76",
                  "a": "0x7F",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 203188,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x76",
                  "a": "0x76",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 203290,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              ],
              "lastIoByPort": {
                "0x0003": {
                  "type": "read",
                  "block": 203290,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5016": {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5015": {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5014": {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5004": {
                  "type": "write",
                  "block": 13147,
                  "pc": "0x005C5E",
                  "port": "0x5004",
                  "value": "0x11",
                  "a": "0x11",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5005": {
                  "type": "write",
                  "block": 11366,
                  "pc": "0x048ACC",
                  "port": "0x5005",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x45",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": true
                  }
                },
                "0x0009": {
                  "type": "write",
                  "block": 203188,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x76",
                  "a": "0x76",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                }
              }
            },
            "bypass0018af": {
              "block": 13138,
              "target": "bypass0018af",
              "pc": "0x0018AF",
              "previousPc": "0x001872",
              "routeFields": {
                "D00587": 0,
                "D0058C": 0,
                "D0058D": 26,
                "D0058E": 0,
                "D00080": 0,
                "D0009F": 0,
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02A28": 0,
                "D001B8": 0,
                "D001D3": 0,
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 13805591,
                "D0301B": 0,
                "D02A40": 0,
                "VAT_D02590": 13893249,
                "VAT_D0259D": 13893325
              },
              "cpu": {
                "pc": "0x0018AF",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0xFE",
                "f": "0x10",
                "af": "0xFE10",
                "bc": "0x000003",
                "de": "0x000430",
                "hl": "0x000000",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": true,
                  "pv": false,
                  "n": false,
                  "c": false
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              },
              "iyFlags": {
                "IY+00": {
                  "addr": "0xD00080",
                  "value": "0x00"
                },
                "IY+0D": {
                  "addr": "0xD0008D",
                  "value": "0x0E"
                },
                "IY+1B": {
                  "addr": "0xD0009B",
                  "value": "0x00"
                },
                "IY+1F": {
                  "addr": "0xD0009F",
                  "value": "0x00"
                },
                "IY+23": {
                  "addr": "0xD000A3",
                  "value": "0x00"
                },
                "IY+27": {
                  "addr": "0xD000A7",
                  "value": "0x00"
                },
                "IY+28": {
                  "addr": "0xD000A8",
                  "value": "0x00"
                },
                "IY+2C": {
                  "addr": "0xD000AC",
                  "value": "0x00"
                },
                "IY+42": {
                  "addr": "0xD000C2",
                  "value": "0x00"
                },
                "IY+44": {
                  "addr": "0xD000C4",
                  "value": "0x00"
                }
              },
              "bytesAtPc": [
                "0xED",
                "0x38",
                "0x07",
                "0xCB",
                "0xE7",
                "0xED",
                "0x39",
                "0x07",
                "0xFD",
                "0xCB",
                "0x42",
                "0x7E",
                "0x28",
                "0x1A",
                "0x3E",
                "0x08"
              ],
              "recentBlocks": [
                "0x001C48",
                "0x001C33",
                "0x001C38",
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
                "0x001C4A",
                "0x0158D2",
                "0x0158DA",
                "0x0158EC",
                "0x0158EE",
                "0x0158F8",
                "0x001872",
                "0x0018AF"
              ],
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x0013E8"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                },
                {
                  "offset": 24,
                  "addr": "0xD1A893",
                  "value": "0x000000"
                },
                {
                  "offset": 27,
                  "addr": "0xD1A896",
                  "value": "0x008000"
                },
                {
                  "offset": 30,
                  "addr": "0xD1A899",
                  "value": "0x000000"
                },
                {
                  "offset": 33,
                  "addr": "0xD1A89C",
                  "value": "0x000000"
                }
              ],
              "returnHints": [
                "0x0013E8",
                "0x008000",
                "0x008000"
              ],
              "ioTail": [
                {
                  "type": "read",
                  "block": 11707,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11708,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11709,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11893,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11900,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11901,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11902,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12082,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12089,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12090,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12091,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12217,
                  "pc": "0x02B03B",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x12",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12503,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 12570,
                  "pc": "0x000658",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x02",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12573,
                  "pc": "0x00067E",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x05",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12576,
                  "pc": "0x0012E3",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x06",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12920,
                  "pc": "0x001379",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x76",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x7F",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xFE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              ],
              "lastIoByPort": {
                "0x0003": {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xFE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5016": {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5015": {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5014": {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5004": {
                  "type": "read",
                  "block": 11349,
                  "pc": "0x03FAA2",
                  "port": "0x5004",
                  "value": "0x11",
                  "a": "0xCC",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5005": {
                  "type": "write",
                  "block": 11366,
                  "pc": "0x048ACC",
                  "port": "0x5005",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x45",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": true
                  }
                },
                "0x0009": {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                }
              }
            },
            "bypass0018d7": {
              "block": 13139,
              "target": "bypass0018d7",
              "pc": "0x0018D7",
              "previousPc": "0x0018AF",
              "routeFields": {
                "D00587": 0,
                "D0058C": 0,
                "D0058D": 26,
                "D0058E": 0,
                "D00080": 0,
                "D0009F": 0,
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02A28": 0,
                "D001B8": 0,
                "D001D3": 0,
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 13805591,
                "D0301B": 0,
                "D02A40": 0,
                "VAT_D02590": 13893249,
                "VAT_D0259D": 13893325
              },
              "cpu": {
                "pc": "0x0018D7",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0xFF",
                "f": "0x54",
                "af": "0xFF54",
                "bc": "0x000003",
                "de": "0x000430",
                "hl": "0x000000",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": true,
                  "pv": true,
                  "n": false,
                  "c": false
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              },
              "iyFlags": {
                "IY+00": {
                  "addr": "0xD00080",
                  "value": "0x00"
                },
                "IY+0D": {
                  "addr": "0xD0008D",
                  "value": "0x0E"
                },
                "IY+1B": {
                  "addr": "0xD0009B",
                  "value": "0x00"
                },
                "IY+1F": {
                  "addr": "0xD0009F",
                  "value": "0x00"
                },
                "IY+23": {
                  "addr": "0xD000A3",
                  "value": "0x00"
                },
                "IY+27": {
                  "addr": "0xD000A7",
                  "value": "0x00"
                },
                "IY+28": {
                  "addr": "0xD000A8",
                  "value": "0x00"
                },
                "IY+2C": {
                  "addr": "0xD000AC",
                  "value": "0x00"
                },
                "IY+42": {
                  "addr": "0xD000C2",
                  "value": "0x00"
                },
                "IY+44": {
                  "addr": "0xD000C4",
                  "value": "0x00"
                }
              },
              "bytesAtPc": [
                "0xED",
                "0x38",
                "0x09",
                "0xCB",
                "0xE7",
                "0xED",
                "0x39",
                "0x09",
                "0xB7",
                "0x2A",
                "0x1B",
                "0x30",
                "0xD0",
                "0x11",
                "0x5A",
                "0xA5"
              ],
              "recentBlocks": [
                "0x001C33",
                "0x001C38",
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
                "0x001C4A",
                "0x0158D2",
                "0x0158DA",
                "0x0158EC",
                "0x0158EE",
                "0x0158F8",
                "0x001872",
                "0x0018AF",
                "0x0018D7"
              ],
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x0013E8"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                },
                {
                  "offset": 24,
                  "addr": "0xD1A893",
                  "value": "0x000000"
                },
                {
                  "offset": 27,
                  "addr": "0xD1A896",
                  "value": "0x008000"
                },
                {
                  "offset": 30,
                  "addr": "0xD1A899",
                  "value": "0x000000"
                },
                {
                  "offset": 33,
                  "addr": "0xD1A89C",
                  "value": "0x000000"
                }
              ],
              "returnHints": [
                "0x0013E8",
                "0x008000",
                "0x008000"
              ],
              "ioTail": [
                {
                  "type": "read",
                  "block": 11707,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11708,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11709,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11893,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11900,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11901,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11902,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12082,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12089,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12090,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12091,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12217,
                  "pc": "0x02B03B",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x12",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12503,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 12570,
                  "pc": "0x000658",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x02",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12573,
                  "pc": "0x00067E",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x05",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12576,
                  "pc": "0x0012E3",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x06",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12920,
                  "pc": "0x001379",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x76",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x7F",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xFE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              ],
              "lastIoByPort": {
                "0x0003": {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xFE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5016": {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5015": {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5014": {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5004": {
                  "type": "read",
                  "block": 11349,
                  "pc": "0x03FAA2",
                  "port": "0x5004",
                  "value": "0x11",
                  "a": "0xCC",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5005": {
                  "type": "write",
                  "block": 11366,
                  "pc": "0x048ACC",
                  "port": "0x5005",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x45",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": true
                  }
                },
                "0x0009": {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                }
              }
            },
            "bypass001881": {
              "block": 13140,
              "target": "bypass001881",
              "pc": "0x001881",
              "previousPc": "0x0018D7",
              "routeFields": {
                "D00587": 0,
                "D0058C": 0,
                "D0058D": 26,
                "D0058E": 0,
                "D00080": 0,
                "D0009F": 0,
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02A28": 0,
                "D001B8": 0,
                "D001D3": 0,
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 13805591,
                "D0301B": 0,
                "D02A40": 0,
                "VAT_D02590": 13893249,
                "VAT_D0259D": 13893325
              },
              "cpu": {
                "pc": "0x001881",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0x52",
                "f": "0x93",
                "af": "0x5293",
                "bc": "0x000003",
                "de": "0x5AA55A",
                "hl": "0xA55AA6",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": true,
                  "pv": false,
                  "n": true,
                  "c": true
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              },
              "iyFlags": {
                "IY+00": {
                  "addr": "0xD00080",
                  "value": "0x00"
                },
                "IY+0D": {
                  "addr": "0xD0008D",
                  "value": "0x0E"
                },
                "IY+1B": {
                  "addr": "0xD0009B",
                  "value": "0x00"
                },
                "IY+1F": {
                  "addr": "0xD0009F",
                  "value": "0x00"
                },
                "IY+23": {
                  "addr": "0xD000A3",
                  "value": "0x00"
                },
                "IY+27": {
                  "addr": "0xD000A7",
                  "value": "0x00"
                },
                "IY+28": {
                  "addr": "0xD000A8",
                  "value": "0x00"
                },
                "IY+2C": {
                  "addr": "0xD000AC",
                  "value": "0x00"
                },
                "IY+42": {
                  "addr": "0xD000C2",
                  "value": "0x00"
                },
                "IY+44": {
                  "addr": "0xD000C4",
                  "value": "0x00"
                }
              },
              "bytesAtPc": [
                "0x21",
                "0x00",
                "0x00",
                "0xD0",
                "0x11",
                "0x01",
                "0x00",
                "0xD0",
                "0x01",
                "0xD7",
                "0x3F",
                "0x01",
                "0x36",
                "0x00",
                "0xED",
                "0xB0"
              ],
              "recentBlocks": [
                "0x001C38",
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
                "0x001C4A",
                "0x0158D2",
                "0x0158DA",
                "0x0158EC",
                "0x0158EE",
                "0x0158F8",
                "0x001872",
                "0x0018AF",
                "0x0018D7",
                "0x001881"
              ],
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x0013E8"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                },
                {
                  "offset": 24,
                  "addr": "0xD1A893",
                  "value": "0x000000"
                },
                {
                  "offset": 27,
                  "addr": "0xD1A896",
                  "value": "0x008000"
                },
                {
                  "offset": 30,
                  "addr": "0xD1A899",
                  "value": "0x000000"
                },
                {
                  "offset": 33,
                  "addr": "0xD1A89C",
                  "value": "0x000000"
                }
              ],
              "returnHints": [
                "0x0013E8",
                "0x008000",
                "0x008000"
              ],
              "ioTail": [
                {
                  "type": "read",
                  "block": 11709,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11893,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11900,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11901,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11902,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12082,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12089,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12090,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12091,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12217,
                  "pc": "0x02B03B",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x12",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12503,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 12570,
                  "pc": "0x000658",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x02",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12573,
                  "pc": "0x00067E",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x05",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12576,
                  "pc": "0x0012E3",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x06",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12920,
                  "pc": "0x001379",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x76",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x7F",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xFE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13139,
                  "pc": "0x0018D7",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0xFF",
                  "f": "0x54",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": true,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13139,
                  "pc": "0x0018D7",
                  "port": "0x0009",
                  "value": "0x52",
                  "a": "0x52",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              ],
              "lastIoByPort": {
                "0x0003": {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xFE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5016": {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5015": {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5014": {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5004": {
                  "type": "read",
                  "block": 11349,
                  "pc": "0x03FAA2",
                  "port": "0x5004",
                  "value": "0x11",
                  "a": "0xCC",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5005": {
                  "type": "write",
                  "block": 11366,
                  "pc": "0x048ACC",
                  "port": "0x5005",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x45",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": true
                  }
                },
                "0x0009": {
                  "type": "write",
                  "block": 13139,
                  "pc": "0x0018D7",
                  "port": "0x0009",
                  "value": "0x52",
                  "a": "0x52",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              }
            },
            "cleanup0018f8": {
              "block": 13141,
              "target": "cleanup0018f8",
              "pc": "0x0018F8",
              "previousPc": "0x001881",
              "routeFields": {
                "D00587": 0,
                "D0058C": 0,
                "D0058D": 0,
                "D0058E": 0,
                "D00080": 0,
                "D0009F": 0,
                "D007CA": 0,
                "D008E0": 0,
                "D02A28": 0,
                "D001B8": 0,
                "D001D3": 0,
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 0,
                "D0301B": 0,
                "D02A40": 0,
                "VAT_D02590": 0,
                "VAT_D0259D": 0
              },
              "cpu": {
                "pc": "0x0018F8",
                "sp": "0xD1A87B",
                "ix": "0x000000",
                "iy": "0xD00080",
                "a": "0x52",
                "f": "0x81",
                "af": "0x5281",
                "bc": "0x0000FF",
                "de": "0xD3FF00",
                "hl": "0xD3FEFF",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": true
                },
                "halted": false,
                "madl": 1,
                "mbase": "0xD0"
              },
              "iyFlags": {
                "IY+00": {
                  "addr": "0xD00080",
                  "value": "0x00"
                },
                "IY+0D": {
                  "addr": "0xD0008D",
                  "value": "0x00"
                },
                "IY+1B": {
                  "addr": "0xD0009B",
                  "value": "0x00"
                },
                "IY+1F": {
                  "addr": "0xD0009F",
                  "value": "0x00"
                },
                "IY+23": {
                  "addr": "0xD000A3",
                  "value": "0x00"
                },
                "IY+27": {
                  "addr": "0xD000A7",
                  "value": "0x00"
                },
                "IY+28": {
                  "addr": "0xD000A8",
                  "value": "0x00"
                },
                "IY+2C": {
                  "addr": "0xD000AC",
                  "value": "0x00"
                },
                "IY+42": {
                  "addr": "0xD000C2",
                  "value": "0x00"
                },
                "IY+44": {
                  "addr": "0xD000C4",
                  "value": "0x00"
                }
              },
              "bytesAtPc": [
                "0x36",
                "0x00",
                "0xED",
                "0xB0",
                "0xAF",
                "0x32",
                "0xB7",
                "0x77",
                "0xD1",
                "0x3E",
                "0x95",
                "0x32",
                "0x8F",
                "0x05",
                "0xD0",
                "0xCD"
              ],
              "recentBlocks": [
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
                "0x001C4A",
                "0x0158D2",
                "0x0158DA",
                "0x0158EC",
                "0x0158EE",
                "0x0158F8",
                "0x001872",
                "0x0018AF",
                "0x0018D7",
                "0x001881",
                "0x0018F8"
              ],
              "stack24": [
                {
                  "offset": 0,
                  "addr": "0xD1A87B",
                  "value": "0x0013E8"
                },
                {
                  "offset": 3,
                  "addr": "0xD1A87E",
                  "value": "0x000000"
                },
                {
                  "offset": 6,
                  "addr": "0xD1A881",
                  "value": "0x000000"
                },
                {
                  "offset": 9,
                  "addr": "0xD1A884",
                  "value": "0x000000"
                },
                {
                  "offset": 12,
                  "addr": "0xD1A887",
                  "value": "0x000000"
                },
                {
                  "offset": 15,
                  "addr": "0xD1A88A",
                  "value": "0x000000"
                },
                {
                  "offset": 18,
                  "addr": "0xD1A88D",
                  "value": "0x008000"
                },
                {
                  "offset": 21,
                  "addr": "0xD1A890",
                  "value": "0x000000"
                },
                {
                  "offset": 24,
                  "addr": "0xD1A893",
                  "value": "0x000000"
                },
                {
                  "offset": 27,
                  "addr": "0xD1A896",
                  "value": "0x008000"
                },
                {
                  "offset": 30,
                  "addr": "0xD1A899",
                  "value": "0x000000"
                },
                {
                  "offset": 33,
                  "addr": "0xD1A89C",
                  "value": "0x000000"
                }
              ],
              "returnHints": [
                "0x0013E8",
                "0x008000",
                "0x008000"
              ],
              "ioTail": [
                {
                  "type": "read",
                  "block": 11709,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11893,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11900,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11901,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 11902,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12082,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12089,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12090,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12091,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12217,
                  "pc": "0x02B03B",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x00",
                  "f": "0x12",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12503,
                  "pc": "0x006816",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x02",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 12570,
                  "pc": "0x000658",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x02",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12573,
                  "pc": "0x00067E",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x05",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12576,
                  "pc": "0x0012E3",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x06",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12920,
                  "pc": "0x001379",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x76",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 12925,
                  "pc": "0x001988",
                  "port": "0x0003",
                  "value": "0xEE",
                  "a": "0x08",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x02",
                  "a": "0x7F",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13035,
                  "pc": "0x001853",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0x42",
                  "f": "0x00",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xFE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "read",
                  "block": 13139,
                  "pc": "0x0018D7",
                  "port": "0x0009",
                  "value": "0x42",
                  "a": "0xFF",
                  "f": "0x54",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": true,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                {
                  "type": "write",
                  "block": 13139,
                  "pc": "0x0018D7",
                  "port": "0x0009",
                  "value": "0x52",
                  "a": "0x52",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              ],
              "lastIoByPort": {
                "0x0003": {
                  "type": "read",
                  "block": 13137,
                  "pc": "0x001872",
                  "port": "0x0003",
                  "value": "0xFE",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5016": {
                  "type": "read",
                  "block": 12510,
                  "pc": "0x03CF7D",
                  "port": "0x5016",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5015": {
                  "type": "read",
                  "block": 12511,
                  "pc": "0x03CFA4",
                  "port": "0x5015",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x44",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                },
                "0x5014": {
                  "type": "read",
                  "block": 12512,
                  "pc": "0x03CFCF",
                  "port": "0x5014",
                  "value": "0x10",
                  "a": "0x00",
                  "f": "0x02",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5004": {
                  "type": "read",
                  "block": 11349,
                  "pc": "0x03FAA2",
                  "port": "0x5004",
                  "value": "0x11",
                  "a": "0xCC",
                  "f": "0x42",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  }
                },
                "0x5005": {
                  "type": "write",
                  "block": 11366,
                  "pc": "0x048ACC",
                  "port": "0x5005",
                  "value": "0x00",
                  "a": "0x00",
                  "f": "0x45",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": true
                  }
                },
                "0x0009": {
                  "type": "write",
                  "block": 13139,
                  "pc": "0x0018D7",
                  "port": "0x0009",
                  "value": "0x52",
                  "a": "0x52",
                  "f": "0x04",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  }
                }
              }
            }
          },
          "firstBlocks": [
            "0x08C331",
            "0x05C634",
            "0x000038",
            "0x0006F3",
            "0x000704",
            "0x000710",
            "0x001713",
            "0x0008BB",
            "0x001717",
            "0x001718",
            "0x00171E",
            "0x0067F8",
            "0x001C4F",
            "0x001CA6",
            "0x001CC0",
            "0x001CCA",
            "0x001CCE",
            "0x001CD5",
            "0x001CE5",
            "0x001C54"
          ],
          "hotBlocks": [
            {
              "pc": "0x000A92",
              "count": 33287
            },
            {
              "pc": "0x000BFE",
              "count": 32258
            },
            {
              "pc": "0x0021C2",
              "count": 20182
            },
            {
              "pc": "0x006D5D",
              "count": 20176
            },
            {
              "pc": "0x006D64",
              "count": 20176
            },
            {
              "pc": "0x006CDF",
              "count": 20166
            },
            {
              "pc": "0x006D0F",
              "count": 20166
            },
            {
              "pc": "0x006D38",
              "count": 20160
            },
            {
              "pc": "0x006D4F",
              "count": 20160
            },
            {
              "pc": "0x006CF7",
              "count": 20156
            },
            {
              "pc": "0x005AE8",
              "count": 6224
            },
            {
              "pc": "0x005B16",
              "count": 6224
            }
          ],
          "startFields": {
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D007CA": 361961,
            "D008E0": 0,
            "D02A28": 0,
            "D001B8": 0,
            "D001D3": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 13805589,
            "D0301B": 0,
            "D02A40": 0,
            "VAT_D02590": 13893249,
            "VAT_D0259D": 13893325
          },
          "endFields": {
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D007CA": 0,
            "D008E0": 0,
            "D02A28": 0,
            "D001B8": 0,
            "D001D3": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 0,
            "D0301B": 0,
            "D02A40": 0,
            "VAT_D02590": 0,
            "VAT_D0259D": 0
          }
        }
      }
    }
  ],
  "errors": [],
  "originalPass": true
}
```


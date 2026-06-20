# Phase 744: Browser EOL 0x202020 Pre-Missing Trace

Probe: `probe-phase744-browser-eol-202020-preselector.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase744-browser-eol-202020-preselector.mjs`  
Exit: 0

## Summary

- **** Browser EOL burst captured 7351 observed blocks; result status: Key: CLEAR → 7366 steps (missing_block, peak 8585px).
- **** Final missing target: lastPc=0x202020, final CPU pc=0x0A22A4, final status=Key: CLEAR → 7366 steps (missing_block, peak 8585px).
- **** Source inference: 0x202020 is produced by the 0x0A22A4 space-fill tail: entry SP=0xD1A851 had return 0x058A1A, but BC=0x000000 and the LD (HL),0x20; LDIR sequence leaves the post-run stack/cx/VAT fields as spaces (SP top=0x202020, D007CA=0x202020, D008E0=0x202020, D02590=0x202020), then RET at 0x0A22B0 targets 0x202020.
- *** Space-source check: D006C0 after key is `.                               `; lastKey buffer=[32,32,32,32,32,32,32,32].
- No disk edit to `browser-shell.html`; this probe served an in-memory instrumented copy only.

## Static Tail at 0x0A22A4

- `0x0A22A4: LD DE,0xD006C0`
- `0x0A22A8: ADD HL,DE`
- `0x0A22A9: PUSH HL`
- `0x0A22AA: POP DE`
- `0x0A22AB: INC DE`
- `0x0A22AC: LD (HL),0x20`
- `0x0A22AE: LDIR`
- `0x0A22B0: RET`

## Target Hits

| Target | Hits | First block | First PC |
|---|---:|---:|---|
| block0a22a4 | 1 | 7351 | 0x0A22A4 |
| nearby0a2150 | 0 | - | - |
| nearby0a21ff | 0 | - | - |
| nearby0a223a | 1 | 4939 | 0x0A223A |
| nearby0a22b1 | 0 | - | - |
| nearby0a22da | 0 | - | - |
| cleanup001879 | 0 | - | - |
| cleanupTail0018f8 | 0 | - | - |
| postInsertGate0158de | 0 | - | - |
| postInsertReturn0013da | 0 | - | - |
| status0059da | 0 | - | - |
| displayLoop005ab6 | 0 | - | - |
| displayCaller005b92 | 0 | - | - |
| lowSelect0064d0 | 0 | - | - |
| lowFrame006cc6 | 0 | - | - |
| lowCall006d5d | 0 | - | - |
| lowBackedge006d64 | 0 | - | - |
| tokenOuter08f3b8 | 0 | - | - |
| tokenTuple08f54b | 0 | - | - |
| tokenExit08f5e1 | 0 | - | - |
| tokenGate090992 | 0 | - | - |

## Final Observed Snapshot

```json
{
  "source": "0x202020 is produced by the 0x0A22A4 space-fill tail: entry SP=0xD1A851 had return 0x058A1A, but BC=0x000000 and the LD (HL),0x20; LDIR sequence leaves the post-run stack/cx/VAT fields as spaces (SP top=0x202020, D007CA=0x202020, D008E0=0x202020, D02590=0x202020), then RET at 0x0A22B0 targets 0x202020.",
  "lastSnapshot": {
    "block": 7351,
    "pc": "0x0A22A4",
    "prevPc": "0x0A2A37",
    "cpu": {
      "pc": "0x0A22A4",
      "sp": "0xD1A851",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "af": "0x0044",
      "bc": "0x000000",
      "de": "0x00013F",
      "hl": "0x000000",
      "f": "0x44",
      "halted": false,
      "iff1": 1,
      "iff2": 1,
      "mbase": 208,
      "madl": 1
    },
    "fields": {
      "D00595": "0x00",
      "D00596": "0x00",
      "D00085": "0x00",
      "D000C2": "0x00",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02A28": "0x00",
      "D02A29": "0x0000",
      "D02A2B": "0x0000",
      "D02A1B": "0x0000",
      "D02A40": "0xD2A83E",
      "D00121": "0x000000",
      "D00124": "0x00",
      "D005A0": "0x00",
      "D0059C": "0xD45A00",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D02590": "0xD3FE81",
      "D00587": "0x00",
      "D0058C": "0x09",
      "D0058D": "0x0F",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D01150": "0x0000"
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
      },
      {
        "addr": "0xD1A85D",
        "value": "0x08C53A"
      },
      {
        "addr": "0xD1A860",
        "value": "0x0009A3"
      },
      {
        "addr": "0xD1A863",
        "value": "0x0019B5"
      },
      {
        "addr": "0xD1A866",
        "value": "0xFFFFFF"
      }
    ],
    "d006c0": null,
    "aroundSp": null,
    "aroundHl": null,
    "aroundDe": null
  },
  "block0a22a4": {
    "block": 7351,
    "pc": "0x0A22A4",
    "prevPc": "0x0A2A37",
    "cpu": {
      "pc": "0x0A22A4",
      "sp": "0xD1A851",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "af": "0x0044",
      "bc": "0x000000",
      "de": "0x00013F",
      "hl": "0x000000",
      "f": "0x44",
      "halted": false,
      "iff1": 1,
      "iff2": 1,
      "mbase": 208,
      "madl": 1
    },
    "fields": {
      "D00595": "0x00",
      "D00596": "0x00",
      "D00085": "0x00",
      "D000C2": "0x00",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02A28": "0x00",
      "D02A29": "0x0000",
      "D02A2B": "0x0000",
      "D02A1B": "0x0000",
      "D02A40": "0xD2A83E",
      "D00121": "0x000000",
      "D00124": "0x00",
      "D005A0": "0x00",
      "D0059C": "0xD45A00",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D02590": "0xD3FE81",
      "D00587": "0x00",
      "D0058C": "0x09",
      "D0058D": "0x0F",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D01150": "0x0000"
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
      },
      {
        "addr": "0xD1A85D",
        "value": "0x08C53A"
      },
      {
        "addr": "0xD1A860",
        "value": "0x0009A3"
      },
      {
        "addr": "0xD1A863",
        "value": "0x0019B5"
      },
      {
        "addr": "0xD1A866",
        "value": "0xFFFFFF"
      }
    ],
    "d006c0": null,
    "aroundSp": null,
    "aroundHl": null,
    "aroundDe": null
  },
  "after": {
    "status": "Key: CLEAR → 7366 steps (missing_block, peak 8585px)",
    "lastPc": "0x202020",
    "cpu": {
      "pc": "0x0A22A4",
      "sp": "0xD1A854",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "af": "0x0040",
      "bc": "0x000000",
      "de": "0xD006C1",
      "hl": "0xD006C0",
      "f": "0x40",
      "halted": false,
      "iff1": 1,
      "iff2": 1,
      "mbase": 208,
      "madl": 1
    },
    "fields": {
      "D00595": "0xFF",
      "D00596": "0xFF",
      "D00085": "0xFF",
      "D000C2": "0xFF",
      "D0243A": "0x202020",
      "D0243D": "0x202020",
      "D02A28": "0x20",
      "D02A29": "0x2020",
      "D02A2B": "0x2020",
      "D02A1B": "0x2020",
      "D02A40": "0x202020",
      "D00121": "0xFFFFFF",
      "D00124": "0xFF",
      "D005A0": "0xFF",
      "D0059C": "0xFFFFFF",
      "D007CA": "0x202020",
      "D008E0": "0x202020",
      "D02590": "0x202020",
      "D00587": "0x00",
      "D0058C": "0xFF",
      "D0058D": "0xFF",
      "D0058E": "0xFF",
      "D00080": "0xF7",
      "D0009F": "0xFF",
      "D01150": "0x2020"
    },
    "stackTop": [
      {
        "addr": "0xD1A854",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A857",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A85A",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A85D",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A860",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A863",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A866",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A869",
        "value": "0x202020"
      }
    ],
    "d006c0": {
      "bytes": [
        "0xFF",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20"
      ],
      "ascii": ".                               "
    },
    "lastKey": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "clear-bulk-clear-body",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": null,
      "controlStopPc": null,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": false,
      "steps": 7366,
      "termination": "missing_block",
      "wipes": 0,
      "D0243A": 2105376,
      "D0243D": 2105376,
      "D007CA": 2105376,
      "D008E0": 2105376,
      "D02590": 2105376,
      "D000C2": 255,
      "buffer": [
        32,
        32,
        32,
        32,
        32,
        32,
        32,
        32
      ],
      "vramPeak": 8585,
      "vramCurrent": 76800
    }
  }
}
```

## Compact Trace Evidence

```json
{
  "before": {
    "status": "Coldboot complete. OS event loop is ready.",
    "lastPc": "0x08C331",
    "cpu": {
      "pc": "0x0019B5",
      "sp": "0xD1A866",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "af": "0x1054",
      "bc": "0x000000",
      "de": "0xD2A815",
      "hl": "0xD1A8A3",
      "f": "0x54",
      "halted": true,
      "iff1": 0,
      "iff2": 0,
      "mbase": 208,
      "madl": 1
    },
    "fields": {
      "D00595": "0x00",
      "D00596": "0x00",
      "D00085": "0x00",
      "D000C2": "0x00",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02A28": "0x00",
      "D02A29": "0x0000",
      "D02A2B": "0x0000",
      "D02A1B": "0x0000",
      "D02A40": "0xD2A83E",
      "D00121": "0x000000",
      "D00124": "0x00",
      "D005A0": "0x00",
      "D0059C": "0xD4202C",
      "D007CA": "0x0585E9",
      "D008E0": "0x000000",
      "D02590": "0xD3FE81",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D01150": "0x0000"
    },
    "d006c0": {
      "bytes": [
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00",
        "0x00"
      ],
      "ascii": "................................"
    }
  },
  "after": {
    "status": "Key: CLEAR → 7366 steps (missing_block, peak 8585px)",
    "lastPc": "0x202020",
    "cpu": {
      "pc": "0x0A22A4",
      "sp": "0xD1A854",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "af": "0x0040",
      "bc": "0x000000",
      "de": "0xD006C1",
      "hl": "0xD006C0",
      "f": "0x40",
      "halted": false,
      "iff1": 1,
      "iff2": 1,
      "mbase": 208,
      "madl": 1
    },
    "fields": {
      "D00595": "0xFF",
      "D00596": "0xFF",
      "D00085": "0xFF",
      "D000C2": "0xFF",
      "D0243A": "0x202020",
      "D0243D": "0x202020",
      "D02A28": "0x20",
      "D02A29": "0x2020",
      "D02A2B": "0x2020",
      "D02A1B": "0x2020",
      "D02A40": "0x202020",
      "D00121": "0xFFFFFF",
      "D00124": "0xFF",
      "D005A0": "0xFF",
      "D0059C": "0xFFFFFF",
      "D007CA": "0x202020",
      "D008E0": "0x202020",
      "D02590": "0x202020",
      "D00587": "0x00",
      "D0058C": "0xFF",
      "D0058D": "0xFF",
      "D0058E": "0xFF",
      "D00080": "0xF7",
      "D0009F": "0xFF",
      "D01150": "0x2020"
    },
    "stackTop": [
      {
        "addr": "0xD1A854",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A857",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A85A",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A85D",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A860",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A863",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A866",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A869",
        "value": "0x202020"
      }
    ],
    "d006c0": {
      "bytes": [
        "0xFF",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20"
      ],
      "ascii": ".                               "
    },
    "lastKey": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "clear-bulk-clear-body",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": null,
      "controlStopPc": null,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": false,
      "steps": 7366,
      "termination": "missing_block",
      "wipes": 0,
      "D0243A": 2105376,
      "D0243D": 2105376,
      "D007CA": 2105376,
      "D008E0": 2105376,
      "D02590": 2105376,
      "D000C2": 255,
      "buffer": [
        32,
        32,
        32,
        32,
        32,
        32,
        32,
        32
      ],
      "vramPeak": 8585,
      "vramCurrent": 76800
    }
  },
  "record": {
    "totalBlocks": 7351,
    "counts": {
      "block0a22a4": 1,
      "nearby0a223a": 1
    },
    "regionCounts": {
      "near0a2100_0a23ff": 28,
      "token08f000_090fff": 0,
      "display005900_006dff": 110,
      "cleanup001000_001fff": 1065
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
      "0x001C54",
      "0x006808",
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
      "0x05C67C",
      "0x08C339",
      "0x06CE73",
      "0x06CE7F",
      "0x06CE7B",
      "0x06C8AB",
      "0x08C33D",
      "0x0A349A",
      "0x0A349F",
      "0x0A32F9",
      "0x0A3301",
      "0x08C308",
      "0x0A331E",
      "0x0A336F",
      "0x0A3383",
      "0x0A338A",
      "0x0A33FB",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A3392",
      "0x0A33FB",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A339A",
      "0x0A33E6",
      "0x0A33FF",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33EE",
      "0x0A3403",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33A2",
      "0x0A33E6",
      "0x0A33FF",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33EE",
      "0x0A3403",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33AA",
      "0x0A33E6",
      "0x0A33FF",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33EE",
      "0x0A3403",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33B2",
      "0x0A33E6",
      "0x0A33FF",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33EE",
      "0x0A3403",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33BA",
      "0x0A33FB",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33C2",
      "0x0A33FB",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A3404",
      "0x0A3408",
      "0x0A340F",
      "0x0A33CA",
      "0x0A33DA",
      "0x0A33E4",
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
      "0x001C54",
      "0x006808",
      "0x001C33",
      "0x001C38",
      "0x001C3C"
    ],
    "lastBlocks": [
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x02682A",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x02682A",
      "0x02683C",
      "0x026840",
      "0x026848",
      "0x026851",
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
      "0x001C54",
      "0x006808",
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
      "0x001C54",
      "0x006808",
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
      "0x03CFFE",
      "0x03D0E0",
      "0x0A228F",
      "0x0A2A37",
      "0x0A229D",
      "0x0A2A37",
      "0x0A22A4"
    ],
    "hotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 960
      },
      {
        "pc": "0x0A19A4",
        "count": 560
      },
      {
        "pc": "0x026815",
        "count": 240
      },
      {
        "pc": "0x02681A",
        "count": 240
      },
      {
        "pc": "0x026823",
        "count": 240
      },
      {
        "pc": "0x026810",
        "count": 234
      },
      {
        "pc": "0x0A1A83",
        "count": 160
      },
      {
        "pc": "0x0A3408",
        "count": 96
      },
      {
        "pc": "0x0A3404",
        "count": 96
      },
      {
        "pc": "0x001CA6",
        "count": 90
      },
      {
        "pc": "0x001CC0",
        "count": 90
      },
      {
        "pc": "0x001CCA",
        "count": 90
      },
      {
        "pc": "0x0A1854",
        "count": 80
      },
      {
        "pc": "0x0A187C",
        "count": 80
      },
      {
        "pc": "0x0A188A",
        "count": 80
      },
      {
        "pc": "0x0A189E",
        "count": 80
      },
      {
        "pc": "0x0A18A6",
        "count": 80
      },
      {
        "pc": "0x0A18AF",
        "count": 80
      },
      {
        "pc": "0x0A18C1",
        "count": 80
      },
      {
        "pc": "0x0A18C4",
        "count": 80
      },
      {
        "pc": "0x0A18CA",
        "count": 80
      },
      {
        "pc": "0x0A18E9",
        "count": 80
      },
      {
        "pc": "0x0A18EB",
        "count": 80
      },
      {
        "pc": "0x0A190D",
        "count": 80
      },
      {
        "pc": "0x0A191F",
        "count": 80
      },
      {
        "pc": "0x0A1939",
        "count": 80
      },
      {
        "pc": "0x0A1969",
        "count": 80
      },
      {
        "pc": "0x0A1976",
        "count": 80
      },
      {
        "pc": "0x0A1980",
        "count": 80
      },
      {
        "pc": "0x0A1988",
        "count": 80
      },
      {
        "pc": "0x0A1994",
        "count": 80
      },
      {
        "pc": "0x0A19AA",
        "count": 80
      }
    ],
    "firstSamples": {
      "nearby0a223a": {
        "block": 4939,
        "pc": "0x0A223A",
        "prevPc": "0x058A16",
        "cpu": {
          "pc": "0x0A223A",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      "block0a22a4": {
        "block": 7351,
        "pc": "0x0A22A4",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A22A4",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      }
    },
    "lastSnapshot": {
      "block": 7351,
      "pc": "0x0A22A4",
      "prevPc": "0x0A2A37",
      "cpu": {
        "pc": "0x0A22A4",
        "sp": "0xD1A851",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "af": "0x0044",
        "bc": "0x000000",
        "de": "0x00013F",
        "hl": "0x000000",
        "f": "0x44",
        "halted": false,
        "iff1": 1,
        "iff2": 1,
        "mbase": 208,
        "madl": 1
      },
      "fields": {
        "D00595": "0x00",
        "D00596": "0x00",
        "D00085": "0x00",
        "D000C2": "0x00",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02A28": "0x00",
        "D02A29": "0x0000",
        "D02A2B": "0x0000",
        "D02A1B": "0x0000",
        "D02A40": "0xD2A83E",
        "D00121": "0x000000",
        "D00124": "0x00",
        "D005A0": "0x00",
        "D0059C": "0xD45A00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
        "D00587": "0x00",
        "D0058C": "0x09",
        "D0058D": "0x0F",
        "D0058E": "0x00",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D01150": "0x0000"
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
        },
        {
          "addr": "0xD1A85D",
          "value": "0x08C53A"
        },
        {
          "addr": "0xD1A860",
          "value": "0x0009A3"
        },
        {
          "addr": "0xD1A863",
          "value": "0x0019B5"
        },
        {
          "addr": "0xD1A866",
          "value": "0xFFFFFF"
        }
      ],
      "d006c0": null,
      "aroundSp": null,
      "aroundHl": null,
      "aroundDe": null
    },
    "block0a22a4": {
      "block": 7351,
      "pc": "0x0A22A4",
      "prevPc": "0x0A2A37",
      "cpu": {
        "pc": "0x0A22A4",
        "sp": "0xD1A851",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "af": "0x0044",
        "bc": "0x000000",
        "de": "0x00013F",
        "hl": "0x000000",
        "f": "0x44",
        "halted": false,
        "iff1": 1,
        "iff2": 1,
        "mbase": 208,
        "madl": 1
      },
      "fields": {
        "D00595": "0x00",
        "D00596": "0x00",
        "D00085": "0x00",
        "D000C2": "0x00",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02A28": "0x00",
        "D02A29": "0x0000",
        "D02A2B": "0x0000",
        "D02A1B": "0x0000",
        "D02A40": "0xD2A83E",
        "D00121": "0x000000",
        "D00124": "0x00",
        "D005A0": "0x00",
        "D0059C": "0xD45A00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
        "D00587": "0x00",
        "D0058C": "0x09",
        "D0058D": "0x0F",
        "D0058E": "0x00",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D01150": "0x0000"
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
        },
        {
          "addr": "0xD1A85D",
          "value": "0x08C53A"
        },
        {
          "addr": "0xD1A860",
          "value": "0x0009A3"
        },
        {
          "addr": "0xD1A863",
          "value": "0x0019B5"
        },
        {
          "addr": "0xD1A866",
          "value": "0xFFFFFF"
        }
      ],
      "d006c0": null,
      "aroundSp": null,
      "aroundHl": null,
      "aroundDe": null
    },
    "near0aTail": [
      {
        "block": 960,
        "pc": "0x0A237E",
        "prevPc": "0x0A17AA",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A848",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0031",
          "bc": "0x00E000",
          "de": "0xD2A815",
          "hl": "0x00FFFF",
          "f": "0x31",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A848",
            "value": "0x0A17AE"
          },
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
          },
          {
            "addr": "0xD1A857",
            "value": "0x000075"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x05C700"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x000F10"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 962,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A83F",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x00E000",
          "de": "0xD2A815",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A83F",
            "value": "0xD2A815"
          },
          {
            "addr": "0xD1A842",
            "value": "0x00E000"
          },
          {
            "addr": "0xD1A845",
            "value": "0x000031"
          },
          {
            "addr": "0xD1A848",
            "value": "0x0A17AE"
          },
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
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 2330,
        "pc": "0x0A237E",
        "prevPc": "0x05C815",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0075",
          "bc": "0x000F00",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x75",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x05C819"
          },
          {
            "addr": "0xD1A851",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A857",
            "value": "0x00FFFF"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD2A83E"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x000011"
          },
          {
            "addr": "0xD1A860",
            "value": "0x08C345"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 2332,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A845",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000F00",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A845",
            "value": "0xD2A83E"
          },
          {
            "addr": "0xD1A848",
            "value": "0x000F00"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x000075"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x05C819"
          },
          {
            "addr": "0xD1A851",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A857",
            "value": "0x00FFFF"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD2A83E"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 2352,
        "pc": "0x0A237E",
        "prevPc": "0x0A17AA",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A83C",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xE010",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0xD100CC",
          "f": "0x10",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A83C",
            "value": "0x0A17AE"
          },
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
          },
          {
            "addr": "0xD1A84B",
            "value": "0x00E044"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x05C883"
          },
          {
            "addr": "0xD1A851",
            "value": "0x000000"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 2354,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A833",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A833",
            "value": "0xD2A83E"
          },
          {
            "addr": "0xD1A836",
            "value": "0x00E000"
          },
          {
            "addr": "0xD1A839",
            "value": "0x00E010"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x0A17AE"
          },
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
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 2948,
        "pc": "0x0A237E",
        "prevPc": "0x0A17AA",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A836",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xE010",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0xD100CC",
          "f": "0x10",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A836",
            "value": "0x0A17AE"
          },
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
          },
          {
            "addr": "0xD1A845",
            "value": "0x00E044"
          },
          {
            "addr": "0xD1A848",
            "value": "0x05C883"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x000000"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 2950,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A82D",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A82D",
            "value": "0xD2A83E"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00E000"
          },
          {
            "addr": "0xD1A833",
            "value": "0x00E010"
          },
          {
            "addr": "0xD1A836",
            "value": "0x0A17AE"
          },
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
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 3796,
        "pc": "0x0A237E",
        "prevPc": "0x0A17AA",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A848",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0031",
          "bc": "0x00E000",
          "de": "0xD2003E",
          "hl": "0x09F7AA",
          "f": "0x31",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A848",
            "value": "0x0A17AE"
          },
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
          },
          {
            "addr": "0xD1A857",
            "value": "0x000075"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x05C700"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x000931"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 3798,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A83F",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x00E000",
          "de": "0xD2003E",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A83F",
            "value": "0xD2003E"
          },
          {
            "addr": "0xD1A842",
            "value": "0x00E000"
          },
          {
            "addr": "0xD1A845",
            "value": "0x000031"
          },
          {
            "addr": "0xD1A848",
            "value": "0x0A17AE"
          },
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
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 4939,
        "pc": "0x0A223A",
        "prevPc": "0x058A16",
        "cpu": {
          "pc": "0x0A223A",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 4940,
        "pc": "0x0A235E",
        "prevPc": "0x0A223A",
        "cpu": {
          "pc": "0x0A235E",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x0A223E"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 4941,
        "pc": "0x0A223E",
        "prevPc": "0x0A235E",
        "cpu": {
          "pc": "0x0A223E",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 4944,
        "pc": "0x0A2247",
        "prevPc": "0x0800BD",
        "cpu": {
          "pc": "0x0A2247",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x5C",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x00004A"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 4945,
        "pc": "0x0A2251",
        "prevPc": "0x0A2247",
        "cpu": {
          "pc": "0x0A2251",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x5C",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x00004A"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 4946,
        "pc": "0x0A2254",
        "prevPc": "0x0A2251",
        "cpu": {
          "pc": "0x0A2254",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x00004A"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 4947,
        "pc": "0x0A225A",
        "prevPc": "0x0A2254",
        "cpu": {
          "pc": "0x0A225A",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x1E44",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x00004A"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 4948,
        "pc": "0x0A2267",
        "prevPc": "0x0A225A",
        "cpu": {
          "pc": "0x0A2267",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x00B3",
          "bc": "0x001E00",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0xB3",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x00004A"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 4950,
        "pc": "0x0A226B",
        "prevPc": "0x0A2D4C",
        "cpu": {
          "pc": "0x0A226B",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x2520",
          "bc": "0x001E00",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x20",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x00004A"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 6145,
        "pc": "0x0A227A",
        "prevPc": "0x09EF2E",
        "cpu": {
          "pc": "0x0A227A",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x001E23",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x00004A"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 6146,
        "pc": "0x0A2280",
        "prevPc": "0x0A227A",
        "cpu": {
          "pc": "0x0A2280",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0018",
          "bc": "0x001E23",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x18",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 7347,
        "pc": "0x0A228F",
        "prevPc": "0x03D0E0",
        "cpu": {
          "pc": "0x0A228F",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x001E23",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 7349,
        "pc": "0x0A229D",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A229D",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 7351,
        "pc": "0x0A22A4",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A22A4",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      }
    ],
    "finalWindowTail": [
      {
        "block": 7320,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "cpu": {
          "pc": "0x001C81",
          "sp": "0xD1A830",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x0100",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020013",
          "f": "0x00",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A830",
            "value": "0x001C48"
          },
          {
            "addr": "0xD1A833",
            "value": "0x006810"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          }
        ]
      },
      {
        "block": 7321,
        "pc": "0x001C82",
        "prevPc": "0x001C81",
        "cpu": {
          "pc": "0x001C82",
          "sp": "0xD1A830",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x0100",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020013",
          "f": "0x00",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A830",
            "value": "0x001C48"
          },
          {
            "addr": "0xD1A833",
            "value": "0x006810"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          }
        ]
      },
      {
        "block": 7322,
        "pc": "0x001C48",
        "prevPc": "0x001C82",
        "cpu": {
          "pc": "0x001C48",
          "sp": "0xD1A833",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x0100",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020014",
          "f": "0x00",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A833",
            "value": "0x006810"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          }
        ]
      },
      {
        "block": 7323,
        "pc": "0x001C33",
        "prevPc": "0x001C48",
        "cpu": {
          "pc": "0x001C33",
          "sp": "0xD1A833",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x0100",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020014",
          "f": "0x00",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A833",
            "value": "0x006810"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          }
        ]
      },
      {
        "block": 7324,
        "pc": "0x001C38",
        "prevPc": "0x001C33",
        "cpu": {
          "pc": "0x001C38",
          "sp": "0xD1A833",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x8093",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020014",
          "f": "0x93",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A833",
            "value": "0x006810"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          }
        ]
      },
      {
        "block": 7325,
        "pc": "0x001C3C",
        "prevPc": "0x001C38",
        "cpu": {
          "pc": "0x001C3C",
          "sp": "0xD1A833",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x8042",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020015",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A833",
            "value": "0x006810"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          }
        ]
      },
      {
        "block": 7326,
        "pc": "0x001C42",
        "prevPc": "0x001C3C",
        "cpu": {
          "pc": "0x001C42",
          "sp": "0xD1A833",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0xC042",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020015",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A833",
            "value": "0x006810"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          }
        ]
      },
      {
        "block": 7327,
        "pc": "0x006810",
        "prevPc": "0x001C42",
        "cpu": {
          "pc": "0x006810",
          "sp": "0xD1A836",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0xC042",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020014",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          }
        ]
      },
      {
        "block": 7328,
        "pc": "0x006812",
        "prevPc": "0x006810",
        "cpu": {
          "pc": "0x006812",
          "sp": "0xD1A836",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0xC042",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020014",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          }
        ]
      },
      {
        "block": 7329,
        "pc": "0x001C4F",
        "prevPc": "0x006812",
        "cpu": {
          "pc": "0x001C4F",
          "sp": "0xD1A833",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0xC042",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020014",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A833",
            "value": "0x006816"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          }
        ]
      },
      {
        "block": 7330,
        "pc": "0x001CA6",
        "prevPc": "0x001C4F",
        "cpu": {
          "pc": "0x001CA6",
          "sp": "0xD1A830",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0xC042",
          "bc": "0x000001",
          "de": "0x0080C0",
          "hl": "0x020015",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A830",
            "value": "0x001C54"
          },
          {
            "addr": "0xD1A833",
            "value": "0x006816"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          }
        ]
      },
      {
        "block": 7331,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "cpu": {
          "pc": "0x001CC0",
          "sp": "0xD1A82A",
          "ix": "0xD1A82D",
          "iy": "0xD00080",
          "af": "0x02B3",
          "bc": "0x000000",
          "de": "0x0080C0",
          "hl": "0x020016",
          "f": "0xB3",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A82A",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD1A836"
          },
          {
            "addr": "0xD1A830",
            "value": "0x001C54"
          },
          {
            "addr": "0xD1A833",
            "value": "0x006816"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          }
        ]
      },
      {
        "block": 7332,
        "pc": "0x001CCA",
        "prevPc": "0x001CC0",
        "cpu": {
          "pc": "0x001CCA",
          "sp": "0xD1A82A",
          "ix": "0xD1A82D",
          "iy": "0xD00080",
          "af": "0x02B3",
          "bc": "0x000000",
          "de": "0x0080C0",
          "hl": "0x020016",
          "f": "0xB3",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A82A",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD1A836"
          },
          {
            "addr": "0xD1A830",
            "value": "0x001C54"
          },
          {
            "addr": "0xD1A833",
            "value": "0x006816"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          }
        ]
      },
      {
        "block": 7333,
        "pc": "0x001CE4",
        "prevPc": "0x001CCA",
        "cpu": {
          "pc": "0x001CE4",
          "sp": "0xD1A82A",
          "ix": "0xD1A82D",
          "iy": "0xD00080",
          "af": "0x02B3",
          "bc": "0x000000",
          "de": "0x0080C0",
          "hl": "0x020016",
          "f": "0xB3",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A82A",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD1A836"
          },
          {
            "addr": "0xD1A830",
            "value": "0x001C54"
          },
          {
            "addr": "0xD1A833",
            "value": "0x006816"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          }
        ]
      },
      {
        "block": 7334,
        "pc": "0x001C54",
        "prevPc": "0x001CE4",
        "cpu": {
          "pc": "0x001C54",
          "sp": "0xD1A833",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x0200",
          "bc": "0x000002",
          "de": "0x0080C0",
          "hl": "0x020016",
          "f": "0x00",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A833",
            "value": "0x006816"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          }
        ]
      },
      {
        "block": 7335,
        "pc": "0x006816",
        "prevPc": "0x001C54",
        "cpu": {
          "pc": "0x006816",
          "sp": "0xD1A836",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x0200",
          "bc": "0x000002",
          "de": "0x0080C0",
          "hl": "0x020016",
          "f": "0x00",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          }
        ]
      },
      {
        "block": 7336,
        "pc": "0x00681E",
        "prevPc": "0x006816",
        "cpu": {
          "pc": "0x00681E",
          "sp": "0xD1A836",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000002",
          "de": "0x0080C0",
          "hl": "0x020017",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          }
        ]
      },
      {
        "block": 7337,
        "pc": "0x006828",
        "prevPc": "0x00681E",
        "cpu": {
          "pc": "0x006828",
          "sp": "0xD1A836",
          "ix": "0xD1A836",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000002",
          "de": "0x0080C0",
          "hl": "0x000001",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A836",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A839",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          }
        ]
      },
      {
        "block": 7338,
        "pc": "0x001727",
        "prevPc": "0x006828",
        "cpu": {
          "pc": "0x001727",
          "sp": "0xD1A83C",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000002",
          "de": "0x0080C0",
          "hl": "0x000001",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A83C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
          {
            "addr": "0xD1A851",
            "value": "0x058A1A"
          }
        ]
      },
      {
        "block": 7339,
        "pc": "0x000719",
        "prevPc": "0x001727",
        "cpu": {
          "pc": "0x000719",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x0080C0",
          "hl": "0x000000",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          }
        ]
      },
      {
        "block": 7340,
        "pc": "0x00071D",
        "prevPc": "0x000719",
        "cpu": {
          "pc": "0x00071D",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x0080C0",
          "hl": "0x000000",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          }
        ]
      },
      {
        "block": 7341,
        "pc": "0x02010C",
        "prevPc": "0x00071D",
        "cpu": {
          "pc": "0x02010C",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x0080C0",
          "hl": "0x000000",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          }
        ]
      },
      {
        "block": 7342,
        "pc": "0x03CF7D",
        "prevPc": "0x02010C",
        "cpu": {
          "pc": "0x03CF7D",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x0080C0",
          "hl": "0x000000",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          }
        ]
      },
      {
        "block": 7343,
        "pc": "0x03CFA4",
        "prevPc": "0x03CF7D",
        "cpu": {
          "pc": "0x03CFA4",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x005016",
          "de": "0x0080C0",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          }
        ]
      },
      {
        "block": 7344,
        "pc": "0x03CFCF",
        "prevPc": "0x03CFA4",
        "cpu": {
          "pc": "0x03CFCF",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x005015",
          "de": "0x0080C0",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          }
        ]
      },
      {
        "block": 7345,
        "pc": "0x03CFFE",
        "prevPc": "0x03CFCF",
        "cpu": {
          "pc": "0x03CFFE",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x005014",
          "de": "0x0080C0",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          }
        ]
      },
      {
        "block": 7346,
        "pc": "0x03D0E0",
        "prevPc": "0x03CFFE",
        "cpu": {
          "pc": "0x03D0E0",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x005014",
          "de": "0x0080C0",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0A228F"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          }
        ]
      },
      {
        "block": 7347,
        "pc": "0x0A228F",
        "prevPc": "0x03D0E0",
        "cpu": {
          "pc": "0x0A228F",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x001E23",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x000018"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ]
      },
      {
        "block": 7348,
        "pc": "0x0A2A37",
        "prevPc": "0x0A228F",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x42",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x0A229D"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ]
      },
      {
        "block": 7349,
        "pc": "0x0A229D",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A229D",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ]
      },
      {
        "block": 7350,
        "pc": "0x0A2A37",
        "prevPc": "0x0A229D",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x0A22A4"
          },
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          }
        ]
      },
      {
        "block": 7351,
        "pc": "0x0A22A4",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A22A4",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ]
      }
    ],
    "fieldTransitionsTail": [
      {
        "block": 3041,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD45F04",
            "0xD46184"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45F04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46184",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3074,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46184",
            "0xD46404"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46184",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46404",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3107,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46404",
            "0xD46684"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46404",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46684",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3140,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46684",
            "0xD46904"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46684",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46904",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3173,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46904",
            "0xD46B84"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46904",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46B84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3206,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46B84",
            "0xD46E04"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46B84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46E04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3239,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46E04",
            "0xD47084"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46E04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47084",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3272,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47084",
            "0xD47304"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47084",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47304",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3305,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47304",
            "0xD47584"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47304",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47584",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3338,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47584",
            "0xD47804"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47584",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47804",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3371,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47804",
            "0xD47A84"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47804",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47A84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3404,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47A84",
            "0xD47D04"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47A84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47D04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3437,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47D04",
            "0xD47F84"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47D04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47F84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3470,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47F84",
            "0xD48204"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47F84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3506,
        "pc": "0x000038",
        "diff": {
          "D00587": [
            "0x0F",
            "0x00"
          ],
          "D00080": [
            "0x08",
            "0x00"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3781,
        "pc": "0x08C38A",
        "diff": {
          "D0058C": [
            "0x00",
            "0x09"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3815,
        "pc": "0x0A1805",
        "diff": {
          "D0059C": [
            "0xD48204",
            "0xD45A04"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3822,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD45A04",
            "0xD45C84"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45C84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3855,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD45C84",
            "0xD45F04"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45C84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45F04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3888,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD45F04",
            "0xD46184"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45F04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46184",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3921,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46184",
            "0xD46404"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46184",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46404",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3954,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46404",
            "0xD46684"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46404",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46684",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 3987,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46684",
            "0xD46904"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46684",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46904",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4020,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46904",
            "0xD46B84"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46904",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46B84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4053,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46B84",
            "0xD46E04"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46B84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46E04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4086,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD46E04",
            "0xD47084"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD46E04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47084",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4119,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47084",
            "0xD47304"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47084",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47304",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4152,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47304",
            "0xD47584"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47304",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47584",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4185,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47584",
            "0xD47804"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47584",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47804",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4218,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47804",
            "0xD47A84"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47804",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47A84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4251,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47A84",
            "0xD47D04"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47A84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47D04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4284,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47D04",
            "0xD47F84"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47D04",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47F84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4317,
        "pc": "0x0A187C",
        "diff": {
          "D0059C": [
            "0xD47F84",
            "0xD48204"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD47F84",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 4958,
        "pc": "0x09EFDE",
        "diff": {
          "D0059C": [
            "0xD48204",
            "0xD44B00"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD44B00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 5120,
        "pc": "0x09EFCB",
        "diff": {
          "D0059C": [
            "0xD44B00",
            "0xD44D80"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD44B00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD44D80",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 5283,
        "pc": "0x09EFCB",
        "diff": {
          "D0059C": [
            "0xD44D80",
            "0xD45000"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD44D80",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45000",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 5446,
        "pc": "0x09EFCB",
        "diff": {
          "D0059C": [
            "0xD45000",
            "0xD45280"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45000",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45280",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 5609,
        "pc": "0x09EFCB",
        "diff": {
          "D0059C": [
            "0xD45280",
            "0xD45500"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45280",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45500",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 5772,
        "pc": "0x09EFCB",
        "diff": {
          "D0059C": [
            "0xD45500",
            "0xD45780"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45500",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45780",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      },
      {
        "block": 5935,
        "pc": "0x09F001",
        "diff": {
          "D0059C": [
            "0xD45780",
            "0xD45A00"
          ]
        },
        "beforeHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45780",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        },
        "afterHook": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
        }
      }
    ],
    "targetSamples": [
      {
        "block": 4939,
        "pc": "0x0A223A",
        "prevPc": "0x058A16",
        "cpu": {
          "pc": "0x0A223A",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD48204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      },
      {
        "block": 7351,
        "pc": "0x0A22A4",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A22A4",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A2B": "0x0000",
          "D02A1B": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD45A00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D01150": "0x0000"
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
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "d006c0": null,
        "aroundSp": null,
        "aroundHl": null,
        "aroundDe": null
      }
    ]
  },
  "errors": []
}
```

## Interpretation

The current browser EOL route still never reaches the phase743 selector/token/low targets before the miss. The immediate pre-missing block is the 0x0A22A4 text-buffer space-fill tail, and its final transfer is a RET at 0x0A22B0; the report records the stack and field state at that block and after termination to distinguish a space-filled return frame from a corrupted cx/VAT tuple.

No runtime, transpiler, browser, scheduler, or follow-along files were modified.


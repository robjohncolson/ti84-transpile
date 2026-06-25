# Phase 833 — EOL Engine-Side Pre-Burst Reference

Probe: `probe-phase833-eol-engine-prekey-reference.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase833-eol-engine-prekey-reference.mjs`  
Exit: 0

## Purpose

Banks the proven in-memory EOL pre-burst state that reaches the OS tuple-save engine
`0x08F54B`. The post-sweep browser shell stops EOL/Escape at the `0x0A229D`
space-fill owner pre-stop and never reaches this engine. A later tick diffs this
reference against the browser coldboot pre-key state to name the controlling field.

## Assertion

- Reached engine `0x08F54B`: YES (hits=2, expected 2).
- Halted clean at `0x0019B5`: YES (termination=halt, lastPc=0x0019B5, steps=316825).

## Engine-Side Pre-Burst Reference (snapshot taken immediately before the EOL burst)

| Field | Value |
| --- | --- |
| D00587 | 0x0F |
| D0058C | 0x0F |
| D0058E | 0x0F |
| D0009F | 0x20 |
| D00080 | 0x08 |
| D007CA | 0x0585E9 |
| D0008D | 0x0E |
| D008E0 | 0xD1A866 |
| D00082 | 0x12 |
| D007E0 | 0x40 |
| D0243A | 0xD1A8F8 |
| D0243D | 0xD2A7E1 |
| D02590 | 0xD3FE81 |
| D02593 | 0xD3FE81 |
| D0259A | 0xD3FE81 |
| D0259D | 0xD3FECD |
| D02A28 | 0x00 |
| D02A29 | 0x013A |
| D02A2B | 0x0006 |
| IY | 0xD00080 |
| MBASE | 0xD0 |
| SP | 0xD1A866 |

## Engine Hits

| Hit | Block |
| ---: | ---: |
| 1 | 26057 |
| 2 | 30871 |

## Full JSON

```json
{
  "preBurst": {
    "D00587": "0x0F",
    "D0058C": "0x0F",
    "D0058E": "0x0F",
    "D0009F": "0x20",
    "D00080": "0x08",
    "D007CA": "0x0585E9",
    "D0008D": "0x0E",
    "D008E0": "0xD1A866",
    "D00082": "0x12",
    "D007E0": "0x40",
    "D0243A": "0xD1A8F8",
    "D0243D": "0xD2A7E1",
    "D02590": "0xD3FE81",
    "D02593": "0xD3FE81",
    "D0259A": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A28": "0x00",
    "D02A29": "0x013A",
    "D02A2B": "0x0006",
    "IY": "0xD00080",
    "MBASE": "0xD0",
    "SP": "0xD1A866"
  },
  "engineHits": [
    {
      "hit": 1,
      "block": 26057
    },
    {
      "hit": 2,
      "block": 30871
    }
  ],
  "reachedEngine": true,
  "haltedClean": true,
  "termination": "halt",
  "lastPc": "0x0019B5",
  "steps": 316825
}
```

No runtime, transpiler, or browser files were changed.

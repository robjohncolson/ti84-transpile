# Ground-Truth Replay Experiment

Seed the real CEmu edit-context layout into the synthetic state, press '2', and
check for the real calc's surgical insert (0x32 at D1A8CC, no 0x0018F8 wipe).

| metric | control | real-seed |
|---|---|---|
| steps | 288673 | 450000 |
| 0x0018F8 wipe hits | 2 | 0 |
| token save 0x08F54B | 0 | 2 |
| token exit 0x08F5E1 | 5 | 5353 |
| token gate 0x090992 | 351 | 5360 |
| D1A8CC after (0x32='2'?) | 0x00 | 0x32 |
| '2' deposit block | never | 2151 |
| D0243A after | 0x000000 | 0xD1A8CD |
| D007CA after | 0x000000 | 0x0585E9 |

## Full JSON

```json
[
  {
    "label": "Digit2-control",
    "seedReal": false,
    "steps": 288673,
    "termination": "halt",
    "lastPc": "0x0019B5",
    "blocks": 288457,
    "counts": {
      "WIPE": 2,
      "tupleSave": 0,
      "tokenExit": 5,
      "tokenGate": 351,
      "saveCall": 0
    },
    "depositBlock": null,
    "synthBaseline": {
      "D0231A": "0xD1A8CC",
      "D0231D": "0xD1A8CB",
      "D02317": "0xD1A8A3",
      "D0243A": "0xD1A8F8",
      "D0243D": "0xD2A7E1",
      "D000A3": "0x08",
      "D007CA": "0x0585E9",
      "D007E0": "0x40",
      "D00082": "0x12",
      "D02A29": "0x013A",
      "D1A8CC(buf)": "0x00",
      "D1A8C0(hdr)": "0x0E0014"
    },
    "seeded": {
      "D0231A": "0xD1A8CC",
      "D0231D": "0xD1A8CB",
      "D02317": "0xD1A8A3",
      "D0243A": "0xD1A8F8",
      "D0243D": "0xD2A7E1",
      "D000A3": "0x08",
      "D007CA": "0x0585E9",
      "D007E0": "0x40",
      "D00082": "0x12",
      "D02A29": "0x013A",
      "D1A8CC(buf)": "0x00",
      "D1A8C0(hdr)": "0x0E0014"
    },
    "after": {
      "D0231A": "0x000000",
      "D0231D": "0x000000",
      "D02317": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D000A3": "0x00",
      "D007CA": "0x000000",
      "D007E0": "0x00",
      "D00082": "0x00",
      "D02A29": "0x0000",
      "D1A8CC(buf)": "0x00",
      "D1A8C0(hdr)": "0x0E0014"
    },
    "d1a8ccAfter": "0x00",
    "tokenHookFired": true
  },
  {
    "label": "Digit2-realseed",
    "seedReal": true,
    "steps": 450000,
    "termination": "max_steps",
    "lastPc": "0x0908A6",
    "blocks": 447765,
    "counts": {
      "WIPE": 0,
      "tupleSave": 2,
      "tokenExit": 5353,
      "tokenGate": 5360,
      "saveCall": 2
    },
    "depositBlock": 2151,
    "synthBaseline": {
      "D0231A": "0xD1A8CC",
      "D0231D": "0xD1A8CB",
      "D02317": "0xD1A8A3",
      "D0243A": "0xD1A8F8",
      "D0243D": "0xD2A7E1",
      "D000A3": "0x08",
      "D007CA": "0x0585E9",
      "D007E0": "0x40",
      "D00082": "0x12",
      "D02A29": "0x013A",
      "D1A8CC(buf)": "0x00",
      "D1A8C0(hdr)": "0x0E0014"
    },
    "seeded": {
      "D0231A": "0xD2A83E",
      "D0231D": "0xD2A83D",
      "D02317": "0xD2A83E",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D000A3": "0x0A",
      "D007CA": "0x0585E9",
      "D007E0": "0x40",
      "D00082": "0x12",
      "D02A29": "0x0000",
      "D1A8CC(buf)": "0x00",
      "D1A8C0(hdr)": "0x07000C"
    },
    "after": {
      "D0231A": "0xD2A83E",
      "D0231D": "0xD2A83D",
      "D02317": "0xD2A83E",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D000A3": "0x0E",
      "D007CA": "0x0585E9",
      "D007E0": "0x40",
      "D00082": "0x12",
      "D02A29": "0xCD0F",
      "D1A8CC(buf)": "0x32",
      "D1A8C0(hdr)": "0x07000C"
    },
    "d1a8ccAfter": "0x32",
    "tokenHookFired": true
  }
]
```


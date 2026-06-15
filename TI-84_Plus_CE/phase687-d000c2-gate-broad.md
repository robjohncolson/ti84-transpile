# Phase 687: Broad D000C2 / 0x0158DE Gate Policy Probe

Probe: `probe-phase687-d000c2-gate-broad.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase687-d000c2-gate-broad.mjs`

## Result

- Overall: **PASS**
- VAT snapshot captured: true
- Single-key pass count: 9/9
- Sequence pass: true
- Main finding: broad probe-only D000C2 bit7 gate policy matched browser early-stop across 9 insertable keys and a 2+3 sequence, skipped 0x0158E8/0x0158BC/0x001879/0x0018F8, and preserved follow-up Digit2 insertion with bit 7 left set

## Single-Key A/B

| key | policy | termination | steps | insert block | gate set block | gate hits | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D0243A | buffer | VRAM hash/nonWhite | assertion |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| 2 | early | stop_0158e8_before_owner | 6308 | 2601 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x4BBD1039/8754 | early=true |
| 2 | gate | gate_return_0013da | 6809 | 2890 | 6790 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x4BBD1039/8754 | gate=true; eq=true |
| 2 | next-digit-from-gate | insert_stop | 3513 | 3505 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xE51C6171/8650 | nextDigit=true |
| 3 | early | stop_0158e8_before_owner | 6519 | 2602 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x7131B1FD/8756 | early=true |
| 3 | gate | gate_return_0013da | 7018 | 2890 | 6997 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x7131B1FD/8756 | gate=true; eq=true |
| 2 | next-digit-from-gate | insert_stop | 3513 | 3505 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x8ACEDF35/8652 | nextDigit=true |
| + | early | stop_0158e8_before_owner | 6311 | 2604 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xFEECCD53/8755 | early=true |
| + | gate | gate_return_0013da | 7021 | 2893 | 7000 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xFEECCD53/8755 | gate=true; eq=true |
| 2 | next-digit-from-gate | insert_stop | 3513 | 3505 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x9E 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x3C3B968B/8651 | nextDigit=true |
| - | early | stop_0158e8_before_owner | 6315 | 2608 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x50AA4597/8709 | early=true |
| - | gate | gate_return_0013da | 6818 | 2899 | 6799 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x50AA4597/8709 | gate=true; eq=true |
| 2 | next-digit-from-gate | insert_stop | 3513 | 3505 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x71 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x20F5D0CF/8605 | nextDigit=true |
| * | early | stop_0158e8_before_owner | 6562 | 2762 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x81B203D7/8741 | early=true |
| * | gate | gate_return_0013da | 6562 | 2853 | 6545 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x81B203D7/8741 | gate=true; eq=true |
| 2 | next-digit-from-gate | insert_stop | 3513 | 3505 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x82 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x6080230F/8637 | nextDigit=true |
| / | early | stop_0158e8_before_owner | 6570 | 2770 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x5A01A291/8718 | early=true |
| / | gate | gate_return_0013da | 6570 | 2861 | 6553 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x5A01A291/8718 | gate=true; eq=true |
| 2 | next-digit-from-gate | insert_stop | 3513 | 3505 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x83 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xF8A027C9/8614 | nextDigit=true |
| . | early | stop_0158e8_before_owner | 6301 | 2594 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xA9499FCF/8705 | early=true |
| . | gate | gate_return_0013da | 7265 | 3116 | 7243 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xA9499FCF/8705 | gate=true; eq=true |
| 2 | next-digit-from-gate | insert_stop | 3459 | 3451 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x3A 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x58E41707/8601 | nextDigit=true |
| ( | early | stop_0158e8_before_owner | 6330 | 2623 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x526A33AB/8727 | early=true |
| ( | gate | gate_return_0013da | 6866 | 3064 | 6847 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x526A33AB/8727 | gate=true; eq=true |
| 2 | next-digit-from-gate | insert_stop | 3459 | 3451 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x10 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xC37FCCE3/8623 | nextDigit=true |
| ) | early | stop_0158e8_before_owner | 6366 | 2567 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xDE917ED1/8726 | early=true |
| ) | gate | gate_return_0013da | 6570 | 2861 | 6553 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xDE917ED1/8726 | gate=true; eq=true |
| 2 | next-digit-from-gate | insert_stop | 3513 | 3505 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x11 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x90629A09/8622 | nextDigit=true |

## Three-Key Sequence

Sequence: 2 + 3

| key | policy | termination | steps | insert block | gate set block | gate hits | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D0243A | buffer | VRAM hash/nonWhite | assertion |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| 2 | early | stop_0158e8_before_owner | 6308 | 2601 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x4BBD1039/8754 | early=true |
| + | early | stop_0158e8_before_owner | 6622 | 3508 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CE | 0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x736E415D/8820 | early=true |
| 3 | early | stop_0158e8_before_owner | 6689 | 3457 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CF | 0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD6F1F62B/8887 | early=true |
| 2 | gate | gate_return_0013da | 6545 | 2836 | 6528 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x4BBD1039/8754 | gate=true |
| + | gate | gate_return_0013da | 6622 | 3508 | 6605 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x736E415D/8820 | gate=true |
| 3 | gate | gate_return_0013da | 6663 | 3457 | 6645 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CF | 0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD6F1F62B/8887 | gate=true |
| 2 | next-digit-from-sequence-gate | insert_stop | 3459 | 3451 | - | 0 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8D0 | 0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x02B7B763/8783 | nextDigit=true |

## Interpretation

- Setting `D000C2` bit 7 at `0x0158DE` skipped `0x0158E8 -> 0x0158BC` for every tested insertable key and for the `2 + 3` sequence.
- Each gate-bypass result matched the corresponding browser-style early-stop result for buffer, cursor/context, VAT fields, and full-VRAM hash/non-white count. The only intentional state delta is `D000C2=0x80`.
- A follow-up Digit2 insert succeeded from every single-key gate state and from the 3-key sequence gate state while leaving `D000C2` bit 7 set.

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
    "f": "0x54",
    "bc": "0x000000",
    "de": "0xD2A815",
    "hl": "0xD1A8A3",
    "ix": "0xD1A860",
    "iy": "0xD00080",
    "sp": "0xD1A866",
    "D00080": "0x08",
    "D0009F": "0x20",
    "D000C2": "0x00",
    "D00587": "0x1A",
    "D0058C": "0x90",
    "D0058D": "0x90",
    "D0058E": "0x90",
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
    "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "vram": {
      "hash": "0xA5610B57",
      "nonWhite": 8549
    }
  },
  "singleResults": [
    {
      "key": {
        "name": "2",
        "pcCode": "Digit2",
        "group": 3,
        "bit": 1,
        "osScan": 26,
        "internal": 144,
        "expected": 50
      },
      "earlyOk": true,
      "gateOk": true,
      "equivalent": true,
      "nextDigitOk": true,
      "pass": true,
      "early": {
        "key": "2",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6308,
        "insertBlock": 2601,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1A",
          "D0058E": "0x00",
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
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x4BBD1039",
            "nonWhite": 8754
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2601,
            "steps": 2607,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x32"
          },
          {
            "kind": "release-key",
            "block": 2601,
            "steps": 2607,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6293,
            "steps": 6307,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6294,
            "steps": 6308,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "gate": {
        "key": "2",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6809,
        "insertBlock": 2890,
        "gateSetBlock": 6790,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1A",
          "D0058E": "0x00",
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
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x4BBD1039",
            "nonWhite": 8754
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2890,
            "steps": 2898,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x32"
          },
          {
            "kind": "release-key",
            "block": 2890,
            "steps": 2898,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6790,
            "steps": 6808,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6790,
            "steps": 6808,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6791,
            "steps": 6809,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "nextDigit": {
        "key": "2",
        "policy": "next-digit-from-gate",
        "termination": "insert_stop",
        "steps": 3513,
        "insertBlock": 3505,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 0,
          "cxMain": 1,
          "gate": 0,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x05E372",
          "f": "0x44",
          "bc": "0x009005",
          "de": "0x000032",
          "hl": "0xD1A8CE",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "sp": "0xD1A842",
          "D00080": "0x10",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x1A",
          "D0058E": "0x90",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xE51C6171",
            "nonWhite": 8650
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x32 0x32"
          },
          {
            "kind": "release-key",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    },
    {
      "key": {
        "name": "3",
        "pcCode": "Digit3",
        "group": 2,
        "bit": 1,
        "osScan": 34,
        "internal": 145,
        "expected": 51
      },
      "earlyOk": true,
      "gateOk": true,
      "equivalent": true,
      "nextDigitOk": true,
      "pass": true,
      "early": {
        "key": "3",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6519,
        "insertBlock": 2602,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x22",
          "D0058E": "0x00",
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
          "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x7131B1FD",
            "nonWhite": 8756
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2602,
            "steps": 2608,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "3",
            "expectedPrefix": "0x33"
          },
          {
            "kind": "release-key",
            "block": 2602,
            "steps": 2608,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6502,
            "steps": 6518,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6503,
            "steps": 6519,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "gate": {
        "key": "3",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 7018,
        "insertBlock": 2890,
        "gateSetBlock": 6997,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x22",
          "D0058E": "0x00",
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
          "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x7131B1FD",
            "nonWhite": 8756
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2890,
            "steps": 2898,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "3",
            "expectedPrefix": "0x33"
          },
          {
            "kind": "release-key",
            "block": 2890,
            "steps": 2898,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6997,
            "steps": 7017,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6997,
            "steps": 7017,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6998,
            "steps": 7018,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "nextDigit": {
        "key": "2",
        "policy": "next-digit-from-gate",
        "termination": "insert_stop",
        "steps": 3513,
        "insertBlock": 3505,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 0,
          "cxMain": 1,
          "gate": 0,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x05E372",
          "f": "0x44",
          "bc": "0x009005",
          "de": "0x000032",
          "hl": "0xD1A8CE",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "sp": "0xD1A842",
          "D00080": "0x10",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x1A",
          "D0058E": "0x90",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x8ACEDF35",
            "nonWhite": 8652
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x33 0x32"
          },
          {
            "kind": "release-key",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    },
    {
      "key": {
        "name": "+",
        "pcCode": "Equal",
        "group": 1,
        "bit": 1,
        "osScan": 42,
        "internal": 112,
        "expected": 158
      },
      "earlyOk": true,
      "gateOk": true,
      "equivalent": true,
      "nextDigitOk": true,
      "pass": true,
      "early": {
        "key": "+",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6311,
        "insertBlock": 2604,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2A",
          "D0058E": "0x00",
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
          "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xFEECCD53",
            "nonWhite": 8755
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2604,
            "steps": 2610,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "+",
            "expectedPrefix": "0x9E"
          },
          {
            "kind": "release-key",
            "block": 2604,
            "steps": 2610,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6296,
            "steps": 6310,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6297,
            "steps": 6311,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "gate": {
        "key": "+",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 7021,
        "insertBlock": 2893,
        "gateSetBlock": 7000,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2A",
          "D0058E": "0x00",
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
          "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xFEECCD53",
            "nonWhite": 8755
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2893,
            "steps": 2901,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "+",
            "expectedPrefix": "0x9E"
          },
          {
            "kind": "release-key",
            "block": 2893,
            "steps": 2901,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 7000,
            "steps": 7020,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 7000,
            "steps": 7020,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 7001,
            "steps": 7021,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "nextDigit": {
        "key": "2",
        "policy": "next-digit-from-gate",
        "termination": "insert_stop",
        "steps": 3513,
        "insertBlock": 3505,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 0,
          "cxMain": 1,
          "gate": 0,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x05E372",
          "f": "0x44",
          "bc": "0x009005",
          "de": "0x000032",
          "hl": "0xD1A8CE",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "sp": "0xD1A842",
          "D00080": "0x10",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x1A",
          "D0058E": "0x90",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x9E 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x3C3B968B",
            "nonWhite": 8651
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x9E 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x9E 0x32"
          },
          {
            "kind": "release-key",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x9E 0x32 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    },
    {
      "key": {
        "name": "-",
        "pcCode": "Minus",
        "group": 1,
        "bit": 2,
        "osScan": 11,
        "internal": 129,
        "expected": 113
      },
      "earlyOk": true,
      "gateOk": true,
      "equivalent": true,
      "nextDigitOk": true,
      "pass": true,
      "early": {
        "key": "-",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6315,
        "insertBlock": 2608,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2B",
          "D0058E": "0x00",
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
          "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x50AA4597",
            "nonWhite": 8709
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2608,
            "steps": 2614,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "-",
            "expectedPrefix": "0x71"
          },
          {
            "kind": "release-key",
            "block": 2608,
            "steps": 2614,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6300,
            "steps": 6314,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6301,
            "steps": 6315,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "gate": {
        "key": "-",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6818,
        "insertBlock": 2899,
        "gateSetBlock": 6799,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2B",
          "D0058E": "0x00",
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
          "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x50AA4597",
            "nonWhite": 8709
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2899,
            "steps": 2907,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "-",
            "expectedPrefix": "0x71"
          },
          {
            "kind": "release-key",
            "block": 2899,
            "steps": 2907,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6799,
            "steps": 6817,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6799,
            "steps": 6817,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6800,
            "steps": 6818,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "nextDigit": {
        "key": "2",
        "policy": "next-digit-from-gate",
        "termination": "insert_stop",
        "steps": 3513,
        "insertBlock": 3505,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 0,
          "cxMain": 1,
          "gate": 0,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x05E372",
          "f": "0x44",
          "bc": "0x009005",
          "de": "0x000032",
          "hl": "0xD1A8CE",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "sp": "0xD1A842",
          "D00080": "0x10",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x1A",
          "D0058E": "0x90",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x71 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x20F5D0CF",
            "nonWhite": 8605
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x71 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x71 0x32"
          },
          {
            "kind": "release-key",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x71 0x32 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    },
    {
      "key": {
        "name": "*",
        "pcCode": "NumpadMultiply",
        "group": 1,
        "bit": 3,
        "osScan": 12,
        "internal": 130,
        "expected": 130
      },
      "earlyOk": true,
      "gateOk": true,
      "equivalent": true,
      "nextDigitOk": true,
      "pass": true,
      "early": {
        "key": "*",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6562,
        "insertBlock": 2762,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2C",
          "D0058E": "0x00",
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
          "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x81B203D7",
            "nonWhite": 8741
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2762,
            "steps": 2769,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "*",
            "expectedPrefix": "0x82"
          },
          {
            "kind": "release-key",
            "block": 2762,
            "steps": 2769,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6545,
            "steps": 6561,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6546,
            "steps": 6562,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "gate": {
        "key": "*",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6562,
        "insertBlock": 2853,
        "gateSetBlock": 6545,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2C",
          "D0058E": "0x00",
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
          "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x81B203D7",
            "nonWhite": 8741
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2853,
            "steps": 2861,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "*",
            "expectedPrefix": "0x82"
          },
          {
            "kind": "release-key",
            "block": 2853,
            "steps": 2861,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6545,
            "steps": 6561,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6545,
            "steps": 6561,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6546,
            "steps": 6562,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "nextDigit": {
        "key": "2",
        "policy": "next-digit-from-gate",
        "termination": "insert_stop",
        "steps": 3513,
        "insertBlock": 3505,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 0,
          "cxMain": 1,
          "gate": 0,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x05E372",
          "f": "0x44",
          "bc": "0x009005",
          "de": "0x000032",
          "hl": "0xD1A8CE",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "sp": "0xD1A842",
          "D00080": "0x10",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x1A",
          "D0058E": "0x90",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x82 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x6080230F",
            "nonWhite": 8637
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x82 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x82 0x32"
          },
          {
            "kind": "release-key",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x82 0x32 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    },
    {
      "key": {
        "name": "/",
        "pcCode": "Slash",
        "group": 1,
        "bit": 4,
        "osScan": 13,
        "internal": 131,
        "expected": 131
      },
      "earlyOk": true,
      "gateOk": true,
      "equivalent": true,
      "nextDigitOk": true,
      "pass": true,
      "early": {
        "key": "/",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6570,
        "insertBlock": 2770,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2D",
          "D0058E": "0x00",
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
          "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x5A01A291",
            "nonWhite": 8718
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2770,
            "steps": 2777,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "/",
            "expectedPrefix": "0x83"
          },
          {
            "kind": "release-key",
            "block": 2770,
            "steps": 2777,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6553,
            "steps": 6569,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6554,
            "steps": 6570,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "gate": {
        "key": "/",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6570,
        "insertBlock": 2861,
        "gateSetBlock": 6553,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2D",
          "D0058E": "0x00",
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
          "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x5A01A291",
            "nonWhite": 8718
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2861,
            "steps": 2869,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "/",
            "expectedPrefix": "0x83"
          },
          {
            "kind": "release-key",
            "block": 2861,
            "steps": 2869,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6553,
            "steps": 6569,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6553,
            "steps": 6569,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6554,
            "steps": 6570,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x83 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "nextDigit": {
        "key": "2",
        "policy": "next-digit-from-gate",
        "termination": "insert_stop",
        "steps": 3513,
        "insertBlock": 3505,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 0,
          "cxMain": 1,
          "gate": 0,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x05E372",
          "f": "0x44",
          "bc": "0x009005",
          "de": "0x000032",
          "hl": "0xD1A8CE",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "sp": "0xD1A842",
          "D00080": "0x10",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x1A",
          "D0058E": "0x90",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x83 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xF8A027C9",
            "nonWhite": 8614
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x83 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x83 0x32"
          },
          {
            "kind": "release-key",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x83 0x32 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    },
    {
      "key": {
        "name": ".",
        "pcCode": "Period",
        "group": 3,
        "bit": 0,
        "osScan": 25,
        "internal": 141,
        "expected": 58
      },
      "earlyOk": true,
      "gateOk": true,
      "equivalent": true,
      "nextDigitOk": true,
      "pass": true,
      "early": {
        "key": ".",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6301,
        "insertBlock": 2594,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x19",
          "D0058E": "0x00",
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
          "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xA9499FCF",
            "nonWhite": 8705
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2594,
            "steps": 2600,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": ".",
            "expectedPrefix": "0x3A"
          },
          {
            "kind": "release-key",
            "block": 2594,
            "steps": 2600,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6286,
            "steps": 6300,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6287,
            "steps": 6301,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "gate": {
        "key": ".",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 7265,
        "insertBlock": 3116,
        "gateSetBlock": 7243,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x19",
          "D0058E": "0x00",
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
          "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xA9499FCF",
            "nonWhite": 8705
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3116,
            "steps": 3126,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": ".",
            "expectedPrefix": "0x3A"
          },
          {
            "kind": "release-key",
            "block": 3116,
            "steps": 3126,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 7243,
            "steps": 7264,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 7243,
            "steps": 7264,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 7244,
            "steps": 7265,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x3A 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "nextDigit": {
        "key": "2",
        "policy": "next-digit-from-gate",
        "termination": "insert_stop",
        "steps": 3459,
        "insertBlock": 3451,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 0,
          "cxMain": 1,
          "gate": 0,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x05E372",
          "f": "0x44",
          "bc": "0x009005",
          "de": "0x000032",
          "hl": "0xD1A8CE",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "sp": "0xD1A842",
          "D00080": "0x10",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x1A",
          "D0058E": "0x90",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x3A 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x58E41707",
            "nonWhite": 8601
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3451,
            "steps": 3459,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x3A 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x3A 0x32"
          },
          {
            "kind": "release-key",
            "block": 3451,
            "steps": 3459,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x3A 0x32 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    },
    {
      "key": {
        "name": "(",
        "pcCode": "BracketLeft",
        "group": 3,
        "bit": 4,
        "osScan": 29,
        "internal": 133,
        "expected": 16
      },
      "earlyOk": true,
      "gateOk": true,
      "equivalent": true,
      "nextDigitOk": true,
      "pass": true,
      "early": {
        "key": "(",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6330,
        "insertBlock": 2623,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1D",
          "D0058E": "0x00",
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
          "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x526A33AB",
            "nonWhite": 8727
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2623,
            "steps": 2629,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "(",
            "expectedPrefix": "0x10"
          },
          {
            "kind": "release-key",
            "block": 2623,
            "steps": 2629,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6315,
            "steps": 6329,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6316,
            "steps": 6330,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "gate": {
        "key": "(",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6866,
        "insertBlock": 3064,
        "gateSetBlock": 6847,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1D",
          "D0058E": "0x00",
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
          "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x526A33AB",
            "nonWhite": 8727
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3064,
            "steps": 3073,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "(",
            "expectedPrefix": "0x10"
          },
          {
            "kind": "release-key",
            "block": 3064,
            "steps": 3073,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6847,
            "steps": 6865,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6847,
            "steps": 6865,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6848,
            "steps": 6866,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x10 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "nextDigit": {
        "key": "2",
        "policy": "next-digit-from-gate",
        "termination": "insert_stop",
        "steps": 3459,
        "insertBlock": 3451,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 0,
          "cxMain": 1,
          "gate": 0,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x05E372",
          "f": "0x44",
          "bc": "0x009005",
          "de": "0x000032",
          "hl": "0xD1A8CE",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "sp": "0xD1A842",
          "D00080": "0x10",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x1A",
          "D0058E": "0x90",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x10 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xC37FCCE3",
            "nonWhite": 8623
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3451,
            "steps": 3459,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x10 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x10 0x32"
          },
          {
            "kind": "release-key",
            "block": 3451,
            "steps": 3459,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x10 0x32 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    },
    {
      "key": {
        "name": ")",
        "pcCode": "BracketRight",
        "group": 2,
        "bit": 4,
        "osScan": 21,
        "internal": 134,
        "expected": 17
      },
      "earlyOk": true,
      "gateOk": true,
      "equivalent": true,
      "nextDigitOk": true,
      "pass": true,
      "early": {
        "key": ")",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6366,
        "insertBlock": 2567,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x25",
          "D0058E": "0x00",
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
          "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xDE917ED1",
            "nonWhite": 8726
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2567,
            "steps": 2573,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": ")",
            "expectedPrefix": "0x11"
          },
          {
            "kind": "release-key",
            "block": 2567,
            "steps": 2573,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6350,
            "steps": 6365,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6351,
            "steps": 6366,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "gate": {
        "key": ")",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6570,
        "insertBlock": 2861,
        "gateSetBlock": 6553,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x25",
          "D0058E": "0x00",
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
          "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xDE917ED1",
            "nonWhite": 8726
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2861,
            "steps": 2869,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": ")",
            "expectedPrefix": "0x11"
          },
          {
            "kind": "release-key",
            "block": 2861,
            "steps": 2869,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6553,
            "steps": 6569,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6553,
            "steps": 6569,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6554,
            "steps": 6570,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x11 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      "nextDigit": {
        "key": "2",
        "policy": "next-digit-from-gate",
        "termination": "insert_stop",
        "steps": 3513,
        "insertBlock": 3505,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 0,
          "cxMain": 1,
          "gate": 0,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x05E372",
          "f": "0x44",
          "bc": "0x009005",
          "de": "0x000032",
          "hl": "0xD1A8CE",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "sp": "0xD1A842",
          "D00080": "0x10",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x1A",
          "D0058E": "0x90",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x11 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x90629A09",
            "nonWhite": 8622
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x11 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x11 0x32"
          },
          {
            "kind": "release-key",
            "block": 3505,
            "steps": 3513,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x11 0x32 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    }
  ],
  "sequence": {
    "keys": [
      "2",
      "+",
      "3"
    ],
    "pass": true,
    "equivalent": true,
    "expectedPrefix": "0x32 0x9E 0x33",
    "early": [
      {
        "key": "2",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6308,
        "insertBlock": 2601,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1A",
          "D0058E": "0x00",
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
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x4BBD1039",
            "nonWhite": 8754
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2601,
            "steps": 2607,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x32"
          },
          {
            "kind": "release-key",
            "block": 2601,
            "steps": 2607,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6293,
            "steps": 6307,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6294,
            "steps": 6308,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      {
        "key": "+",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6622,
        "insertBlock": 3508,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2A",
          "D0058E": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x736E415D",
            "nonWhite": 8820
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3508,
            "steps": 3516,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "+",
            "expectedPrefix": "0x32 0x9E"
          },
          {
            "kind": "release-key",
            "block": 3508,
            "steps": 3516,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6605,
            "steps": 6621,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6606,
            "steps": 6622,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      {
        "key": "3",
        "policy": "early",
        "termination": "stop_0158e8_before_owner",
        "steps": 6689,
        "insertBlock": 3457,
        "gateSetBlock": null,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 1,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0158E8",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87B",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x22",
          "D0058E": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CF",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xD6F1F62B",
            "nonWhite": 8887
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3457,
            "steps": 3465,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00",
            "key": "3",
            "expectedPrefix": "0x32 0x9E 0x33"
          },
          {
            "kind": "release-key",
            "block": 3457,
            "steps": 3465,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6671,
            "steps": 6688,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "stop-before-owner",
            "block": 6672,
            "steps": 6689,
            "pc": "0x0158E8",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    ],
    "gate": [
      {
        "key": "2",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6545,
        "insertBlock": 2836,
        "gateSetBlock": 6528,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1A",
          "D0058E": "0x00",
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
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x4BBD1039",
            "nonWhite": 8754
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2836,
            "steps": 2844,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x32"
          },
          {
            "kind": "release-key",
            "block": 2836,
            "steps": 2844,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6528,
            "steps": 6544,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6528,
            "steps": 6544,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6529,
            "steps": 6545,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      {
        "key": "+",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6622,
        "insertBlock": 3508,
        "gateSetBlock": 6605,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2A",
          "D0058E": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x736E415D",
            "nonWhite": 8820
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3508,
            "steps": 3516,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "+",
            "expectedPrefix": "0x32 0x9E"
          },
          {
            "kind": "release-key",
            "block": 3508,
            "steps": 3516,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6605,
            "steps": 6621,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6605,
            "steps": 6621,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6606,
            "steps": 6622,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      {
        "key": "3",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6663,
        "insertBlock": 3457,
        "gateSetBlock": 6645,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x22",
          "D0058E": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CF",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xD6F1F62B",
            "nonWhite": 8887
          }
        },
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3457,
            "steps": 3465,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00",
            "key": "3",
            "expectedPrefix": "0x32 0x9E 0x33"
          },
          {
            "kind": "release-key",
            "block": 3457,
            "steps": 3465,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6645,
            "steps": 6662,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6645,
            "steps": 6662,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6646,
            "steps": 6663,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    ],
    "nextDigitOk": true,
    "nextDigit": {
      "key": "2",
      "policy": "next-digit-from-sequence-gate",
      "termination": "insert_stop",
      "steps": 3459,
      "insertBlock": 3451,
      "gateSetBlock": null,
      "counts": {
        "getcsc": 0,
        "cxMain": 1,
        "gate": 0,
        "preOwnerCall": 0,
        "cleanupOwner": 0,
        "cleanupEntry": 0,
        "wipe": 0
      },
      "after": {
        "pc": "0x05E372",
        "f": "0x44",
        "bc": "0x009005",
        "de": "0x000032",
        "hl": "0xD1A8D0",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "sp": "0xD1A842",
        "D00080": "0x10",
        "D0009F": "0x00",
        "D000C2": "0x80",
        "D00587": "0x00",
        "D0058C": "0x90",
        "D0058D": "0x1A",
        "D0058E": "0x90",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8D0",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "vram": {
          "hash": "0x02B7B763",
          "nonWhite": 8783
        }
      },
      "events": [
        {
          "kind": "inserted-prefix",
          "block": 3451,
          "steps": 3459,
          "pc": "0x05E372",
          "D000C2": "0x80",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8D0",
          "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00",
          "key": "2",
          "expectedPrefix": "0x32 0x9E 0x33 0x32"
        },
        {
          "kind": "release-key",
          "block": 3451,
          "steps": 3459,
          "pc": "0x05E372",
          "D000C2": "0x80",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8D0",
          "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
        }
      ]
    }
  }
}
```


# Phase 677: Control-Key Early-Stop/Persistence A/B

Probe: `probe-phase677-control-early-stop-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase677-control-early-stop-ab.mjs`

## Result

- Overall: **PASS**
- Scope: probe-only direct Node harness mirroring browser coldboot/VAT replay/edit-context seeding; no browser-shell/runtime/transpiler edits.

## Findings

- ENTER: pre-stop at 0x0A2150 step 8994 preserves D007CA=0x0585E9, D0243A=0xD1A8CD, VAT=0xD3FE81, buffer=0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00, VRAM=10149.
- CLEAR: pre-stop at 0x001879 step 9006 preserves D007CA=0x0585E9, D0243A=0xD1A8CC, VAT=0xD3FE81, buffer=0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00, VRAM=8829.
- ENTER: post-restore after 0x0A2156 also preserves state, but requires broad state+VRAM snapshot restore.
- CLEAR: post-restore after 0x0018F8 also preserves state, but requires broad state+VRAM snapshot restore.
- ENTER: baseline reaches 0x0A2150 and does not preserve state (after D007CA=0x000000, D0243A=0xD1A8CD, VAT=0xD3FE81).
- CLEAR: baseline reaches 0x001879 and does not preserve state (after D007CA=0x000000, D0243A=0x000000, VAT=0x000000).

## Candidate Matrix

| key | candidate | pass | termination | destructive hit | observed-after hit | restore block | state safe | cursor effect | D007CA after | D0243A after | VAT after | buffer after | VRAM after | changed fields |
|---|---|---|---|---:|---:|---:|---|---|---:|---:|---:|---|---:|---|
| ENTER | baseline | yes | after_first_destructive_clear 0x001C38 | 0x0A2150@8994 | -@- | - | no | preserved | 0x000000 | 0xD1A8CD | 0xD3FE81 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 10149 | D007CA, D008E0, D00587, D0058C, D0058D, D0058E, vramPixels |
| ENTER | pre-stop | yes | pre_destructive_stop 0x0A2150 | 0x0A2150@8994 | -@- | - | yes | preserved | 0x0585E9 | 0xD1A8CD | 0xD3FE81 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 10149 | D00587, D0058C, D0058D, D0058E, vramPixels |
| ENTER | post-restore | yes | post_destructive_restore_stop 0x0A2156 | 0x0A2150@8994 | 0x0A2156@8995 | 8971 | yes | preserved | 0x0585E9 | 0xD1A8CD | 0xD3FE81 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 10149 | D00587, D0058C, D0058D, D0058E, vramPixels |
| CLEAR | baseline | yes | after_first_destructive_clear 0x00612E | 0x001879@9006 | -@- | - | no | changed | 0x000000 | 0x000000 | 0x000000 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0 | D007CA, D008E0, D0243A, D0243D, D02590, D0259D, D02A40, D00587, D0058C, D0058D, D0058E, D00080, vramPixels |
| CLEAR | pre-stop | yes | pre_destructive_stop 0x001879 | 0x001879@9006 | -@- | - | yes | rewound-one | 0x0585E9 | 0xD1A8CC | 0xD3FE81 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 8829 | D0243A, D00587, D0058C, D0058D, D0058E, D00080, vramPixels |
| CLEAR | post-restore | yes | post_destructive_restore_stop 0x0018F8 | 0x001879@9006 | 0x0018F8@9007 | 8988 | yes | rewound-one | 0x0585E9 | 0xD1A8CC | 0xD3FE81 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 8829 | D0243A, D00587, D0058C, D0058D, D0058E, D00080, vramPixels |

## Interpretation

- `pre-stop` is the clean browser-compatible candidate for state persistence: it hits the first destructive block but stops before executing it, so cxMain context, VAT, edit buffer, and display remain intact.
- ENTER leaves the cursor unchanged after the primed digit; CLEAR has already rewound the cursor one byte before its destructive clear, so it is state-safe but not a full semantic clear of the visible digit.
- `post-restore` also preserves state, but only by executing the destructive block and restoring a broad state/VRAM snapshot on the following block. That is heavier than the pre-stop candidate and is less attractive for browser-shell wiring.
- Baseline confirms the comparison is meaningful: letting either control reach its destructive clear loses D007CA/edit/VAT state.

## Full JSON

```json
[
  {
    "key": "ENTER",
    "candidate": "baseline",
    "pass": true,
    "primePass": true,
    "result": {
      "steps": 9124,
      "termination": "after_first_destructive_clear",
      "lastPc": "0x001C38",
      "lastMode": "adl"
    },
    "destructiveHit": {
      "pc": "0x0A2150",
      "step": 8994,
      "block": 8970
    },
    "observedAfterHit": null,
    "restoreBlock": null,
    "hits": {
      "contextLdir": 1,
      "bulkClearBody": 0,
      "bulkTail": 0
    },
    "preserved": false,
    "safety": {
      "contextSafe": false,
      "stateSafe": false,
      "cursorPreserved": true,
      "cursorRewoundOne": false,
      "cursorEffect": "preserved"
    },
    "diffs": [
      "D007CA",
      "D008E0",
      "D00587",
      "D0058C",
      "D0058D",
      "D0058E",
      "vramPixels"
    ],
    "before": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x1A",
      "D0058C": "0x90",
      "D0058D": "0x90",
      "D0058E": "0x90",
      "D00080": "0x08",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 8614
    },
    "after": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x09",
      "D0058C": "0x05",
      "D0058D": "0x05",
      "D0058E": "0x05",
      "D00080": "0x08",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 10149
    }
  },
  {
    "key": "ENTER",
    "candidate": "pre-stop",
    "pass": true,
    "primePass": true,
    "result": {
      "steps": 8994,
      "termination": "pre_destructive_stop",
      "lastPc": "0x0A2150",
      "lastMode": "adl"
    },
    "destructiveHit": {
      "pc": "0x0A2150",
      "step": 8994,
      "block": 8970
    },
    "observedAfterHit": null,
    "restoreBlock": null,
    "hits": {
      "contextLdir": 1,
      "bulkClearBody": 0,
      "bulkTail": 0
    },
    "preserved": true,
    "safety": {
      "contextSafe": true,
      "stateSafe": true,
      "cursorPreserved": true,
      "cursorRewoundOne": false,
      "cursorEffect": "preserved"
    },
    "diffs": [
      "D00587",
      "D0058C",
      "D0058D",
      "D0058E",
      "vramPixels"
    ],
    "before": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x1A",
      "D0058C": "0x90",
      "D0058D": "0x90",
      "D0058E": "0x90",
      "D00080": "0x08",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 8614
    },
    "after": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x09",
      "D0058C": "0x05",
      "D0058D": "0x05",
      "D0058E": "0x05",
      "D00080": "0x08",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 10149
    }
  },
  {
    "key": "ENTER",
    "candidate": "post-restore",
    "pass": true,
    "primePass": true,
    "result": {
      "steps": 8995,
      "termination": "post_destructive_restore_stop",
      "lastPc": "0x0A2156",
      "lastMode": "adl"
    },
    "destructiveHit": {
      "pc": "0x0A2150",
      "step": 8994,
      "block": 8970
    },
    "observedAfterHit": {
      "pc": "0x0A2156",
      "step": 8995,
      "block": 8971
    },
    "restoreBlock": 8971,
    "hits": {
      "contextLdir": 1,
      "bulkClearBody": 0,
      "bulkTail": 0
    },
    "preserved": true,
    "safety": {
      "contextSafe": true,
      "stateSafe": true,
      "cursorPreserved": true,
      "cursorRewoundOne": false,
      "cursorEffect": "preserved"
    },
    "diffs": [
      "D00587",
      "D0058C",
      "D0058D",
      "D0058E",
      "vramPixels"
    ],
    "before": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x1A",
      "D0058C": "0x90",
      "D0058D": "0x90",
      "D0058E": "0x90",
      "D00080": "0x08",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 8614
    },
    "after": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x09",
      "D0058C": "0x05",
      "D0058D": "0x05",
      "D0058E": "0x05",
      "D00080": "0x08",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 10149
    }
  },
  {
    "key": "CLEAR",
    "candidate": "baseline",
    "pass": true,
    "primePass": true,
    "result": {
      "steps": 9135,
      "termination": "after_first_destructive_clear",
      "lastPc": "0x00612E",
      "lastMode": "adl"
    },
    "destructiveHit": {
      "pc": "0x001879",
      "step": 9006,
      "block": 8987
    },
    "observedAfterHit": null,
    "restoreBlock": null,
    "hits": {
      "contextLdir": 0,
      "bulkClearBody": 1,
      "bulkTail": 1
    },
    "preserved": false,
    "safety": {
      "contextSafe": false,
      "stateSafe": false,
      "cursorPreserved": false,
      "cursorRewoundOne": false,
      "cursorEffect": "changed"
    },
    "diffs": [
      "D007CA",
      "D008E0",
      "D0243A",
      "D0243D",
      "D02590",
      "D0259D",
      "D02A40",
      "D00587",
      "D0058C",
      "D0058D",
      "D0058E",
      "D00080",
      "vramPixels"
    ],
    "before": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x1A",
      "D0058C": "0x90",
      "D0058D": "0x90",
      "D0058E": "0x90",
      "D00080": "0x08",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 8614
    },
    "after": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0x000000",
      "D0259D": "0x000000",
      "D02A40": "0x000000",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 0
    }
  },
  {
    "key": "CLEAR",
    "candidate": "pre-stop",
    "pass": true,
    "primePass": true,
    "result": {
      "steps": 9006,
      "termination": "pre_destructive_stop",
      "lastPc": "0x001879",
      "lastMode": "adl"
    },
    "destructiveHit": {
      "pc": "0x001879",
      "step": 9006,
      "block": 8987
    },
    "observedAfterHit": null,
    "restoreBlock": null,
    "hits": {
      "contextLdir": 0,
      "bulkClearBody": 1,
      "bulkTail": 0
    },
    "preserved": true,
    "safety": {
      "contextSafe": true,
      "stateSafe": true,
      "cursorPreserved": false,
      "cursorRewoundOne": true,
      "cursorEffect": "rewound-one"
    },
    "diffs": [
      "D0243A",
      "D00587",
      "D0058C",
      "D0058D",
      "D0058E",
      "D00080",
      "vramPixels"
    ],
    "before": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x1A",
      "D0058C": "0x90",
      "D0058D": "0x90",
      "D0058E": "0x90",
      "D00080": "0x08",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 8614
    },
    "after": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x0F",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 8829
    }
  },
  {
    "key": "CLEAR",
    "candidate": "post-restore",
    "pass": true,
    "primePass": true,
    "result": {
      "steps": 9007,
      "termination": "post_destructive_restore_stop",
      "lastPc": "0x0018F8",
      "lastMode": "adl"
    },
    "destructiveHit": {
      "pc": "0x001879",
      "step": 9006,
      "block": 8987
    },
    "observedAfterHit": {
      "pc": "0x0018F8",
      "step": 9007,
      "block": 8988
    },
    "restoreBlock": 8988,
    "hits": {
      "contextLdir": 0,
      "bulkClearBody": 1,
      "bulkTail": 1
    },
    "preserved": true,
    "safety": {
      "contextSafe": true,
      "stateSafe": true,
      "cursorPreserved": false,
      "cursorRewoundOne": true,
      "cursorEffect": "rewound-one"
    },
    "diffs": [
      "D0243A",
      "D00587",
      "D0058C",
      "D0058D",
      "D0058E",
      "D00080",
      "vramPixels"
    ],
    "before": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x1A",
      "D0058C": "0x90",
      "D0058D": "0x90",
      "D0058E": "0x90",
      "D00080": "0x08",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 8614
    },
    "after": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A40": "0xD2A83E",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x0F",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D02A28": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramPixels": 8829
    }
  }
]
```


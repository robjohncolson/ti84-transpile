# Phase 641: Phase 5 VAT Zeroing Site

Probe: `probe-phase641-phase5-vat-zero-site.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase641-phase5-vat-zero-site.mjs`

## Summary

- **** Phase 5 reproduced the phase640 direct launch-home result: termination=halt, lastPc=0x0019B5, steps=275843.
- **** MEM_INIT fired 1x; D02590 became nonzero immediately after MEM_INIT and later returned to zero.
- **** Exact VAT zeroing transition: after block 0x001879, before next block 0x0018F8, at observed block 84131; zeroed fields=D007CA, D008E0, D02587, D0258A, D0258D, D02590, D02593, D0259A, D0259D, D025A0, D025C5.
- *** Cleanup 0x0018F8 hit 2x; final tail path 0x0060F6 -> 0x00190F -> 0x000862 -> 0x0019B5.

## Phase 5 Boundary

```json
{
  "bootPhases": [
    {
      "name": "p1-coldboot",
      "steps": 20000,
      "termination": "max_steps",
      "lastPc": "0x001CC0"
    },
    {
      "name": "p2-kernel",
      "steps": 100000,
      "termination": "max_steps",
      "lastPc": "0x000A92"
    },
    {
      "name": "p3-postinit",
      "steps": 100,
      "termination": "max_steps",
      "lastPc": "0x0158BC"
    },
    {
      "name": "p4-warm-idle",
      "steps": 192290,
      "termination": "halt",
      "lastPc": "0x0019B5"
    }
  ],
  "beforePhase5": {
    "pc": "0x0019B5",
    "sp": "0xD1A866",
    "fields": {
      "D007CA": "0x000000",
      "D008E0": "0xD1A866",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "vramPixels": 0
  },
  "afterPhase5": {
    "result": {
      "steps": 275843,
      "termination": "halt",
      "lastPc": "0x0019B5",
      "lastMode": "adl"
    },
    "cpu": {
      "pc": "0x0019B5",
      "sp": "0xD1A87E",
      "iy": "0xD00080",
      "halted": true,
      "iff1": 0,
      "iff2": 0,
      "mbase": 208
    },
    "fields": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "vramPixels": 0
  },
  "targetCounts": {
    "launchHome09dd62": 1,
    "memInit09dee0": 1,
    "memInitReturn08a98f": 1,
    "heapSizeStore09dd66": 1,
    "cleanup0018f8": 2,
    "cleanupTail0060f6": 2,
    "cleanupTail00190f": 2,
    "cleanupTail000862": 1,
    "halt0019b5": 1
  },
  "finalFields": {
    "D007CA": "0x000000",
    "D008E0": "0x000000",
    "D02587": "0x000000",
    "D0258A": "0x000000",
    "D0258D": "0x000000",
    "D02590": "0x000000",
    "D02593": "0x000000",
    "D0259A": "0x000000",
    "D0259D": "0x000000",
    "D025A0": "0x000000",
    "D025C5": "0x000000"
  },
  "vramPixels": 0
}
```

## Zeroing Transitions

```json
[
  {
    "block": 84131,
    "afterPc": "0x001879",
    "beforePc": "0x0018F8",
    "zeroed": [
      "D007CA",
      "D008E0",
      "D02587",
      "D0258A",
      "D0258D",
      "D02590",
      "D02593",
      "D0259A",
      "D0259D",
      "D025A0",
      "D025C5"
    ],
    "diff": {
      "D007CA": [
        "0x0585E9",
        "0x000000"
      ],
      "D008E0": [
        "0xD1A866",
        "0x000000"
      ],
      "D02587": [
        "0xD2A8E2",
        "0x000000"
      ],
      "D0258A": [
        "0xD2A8E2",
        "0x000000"
      ],
      "D0258D": [
        "0xD2A8E2",
        "0x000000"
      ],
      "D02590": [
        "0xD3FE81",
        "0x000000"
      ],
      "D02593": [
        "0xD3FE81",
        "0x000000"
      ],
      "D0259A": [
        "0xD3FE81",
        "0x000000"
      ],
      "D0259D": [
        "0xD3FECD",
        "0x000000"
      ],
      "D025A0": [
        "0xD2A8A4",
        "0x000000"
      ],
      "D025C5": [
        "0x0C0000",
        "0x000000"
      ]
    },
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
    "fieldsAfter": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    }
  }
]
```

## Target Events

```json
[
  {
    "name": "launchHome09dd62",
    "block": 1,
    "pc": "0x09DD62",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0xD1A866",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "recentBlocks": []
  },
  {
    "name": "memInit09dee0",
    "block": 2,
    "pc": "0x09DEE0",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0xD1A866",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "recentBlocks": [
      "0x09DD62"
    ]
  },
  {
    "name": "memInitReturn08a98f",
    "block": 3,
    "pc": "0x08A98F",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0xD1A866",
      "D02587": "0xD1A881",
      "D0258A": "0xD1A881",
      "D0258D": "0xD1A881",
      "D02590": "0xD3FFFF",
      "D02593": "0xD3FFFF",
      "D0259A": "0xD3FFFF",
      "D0259D": "0xD3FFFF",
      "D025A0": "0xD1A881",
      "D025C5": "0x000000"
    },
    "recentBlocks": [
      "0x09DD62",
      "0x09DEE0"
    ]
  },
  {
    "name": "heapSizeStore09dd66",
    "block": 19,
    "pc": "0x09DD66",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0xD1A866",
      "D02587": "0xD1A881",
      "D0258A": "0xD1A881",
      "D0258D": "0xD1A881",
      "D02590": "0xD3FFFF",
      "D02593": "0xD3FFFF",
      "D0259A": "0xD3FFFF",
      "D0259D": "0xD3FFFF",
      "D025A0": "0xD1A881",
      "D025C5": "0x0C0000"
    },
    "recentBlocks": [
      "0x09DD62",
      "0x09DEE0",
      "0x08A98F",
      "0x08A999",
      "0x07F976",
      "0x09DF0C",
      "0x09DF12",
      "0x000600",
      "0x0138EC",
      "0x09DF18",
      "0x09DF29",
      "0x04C9EA",
      "0x04C8B4",
      "0x04C9EE",
      "0x04C9F4",
      "0x04C896",
      "0x04C9F8",
      "0x09DF2E"
    ]
  },
  {
    "name": "cleanup0018f8",
    "block": 84131,
    "pc": "0x0018F8",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
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
      "0x001C4A",
      "0x0158D2",
      "0x0158DA",
      "0x0158EC",
      "0x0158EE",
      "0x0158F8",
      "0x001872",
      "0x001879"
    ]
  },
  {
    "name": "cleanupTail0060f6",
    "block": 85712,
    "pc": "0x0060F6",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "recentBlocks": [
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B5",
      "0x0060C7",
      "0x0060D8",
      "0x0060E5",
      "0x0060EA"
    ]
  },
  {
    "name": "cleanupTail00190f",
    "block": 85713,
    "pc": "0x00190F",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "recentBlocks": [
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B5",
      "0x0060C7",
      "0x0060D8",
      "0x0060E5",
      "0x0060EA",
      "0x0060F6"
    ]
  },
  {
    "name": "cleanup0018f8",
    "block": 274259,
    "pc": "0x0018F8",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
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
      "0x001C4A",
      "0x0158D2",
      "0x0158DA",
      "0x0158EC",
      "0x0158EE",
      "0x0158F8",
      "0x001872",
      "0x001879"
    ]
  },
  {
    "name": "cleanupTail0060f6",
    "block": 275840,
    "pc": "0x0060F6",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "recentBlocks": [
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B5",
      "0x0060C7",
      "0x0060D8",
      "0x0060E5",
      "0x0060EA"
    ]
  },
  {
    "name": "cleanupTail00190f",
    "block": 275841,
    "pc": "0x00190F",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "recentBlocks": [
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B5",
      "0x0060C7",
      "0x0060D8",
      "0x0060E5",
      "0x0060EA",
      "0x0060F6"
    ]
  },
  {
    "name": "cleanupTail000862",
    "block": 275842,
    "pc": "0x000862",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "recentBlocks": [
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B5",
      "0x0060C7",
      "0x0060D8",
      "0x0060E5",
      "0x0060EA",
      "0x0060F6",
      "0x00190F"
    ]
  },
  {
    "name": "halt0019b5",
    "block": 275843,
    "pc": "0x0019B5",
    "fieldsBeforeBlock": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02587": "0x000000",
      "D0258A": "0x000000",
      "D0258D": "0x000000",
      "D02590": "0x000000",
      "D02593": "0x000000",
      "D0259A": "0x000000",
      "D0259D": "0x000000",
      "D025A0": "0x000000",
      "D025C5": "0x000000"
    },
    "recentBlocks": [
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B3",
      "0x0060B5",
      "0x0060C7",
      "0x0060D8",
      "0x0060E5",
      "0x0060EA",
      "0x0060F6",
      "0x00190F",
      "0x000862"
    ]
  }
]
```

## Hot Blocks

```json
[
  {
    "pc": "0x09EFDE",
    "count": 33600
  },
  {
    "pc": "0x000A92",
    "count": 32512
  },
  {
    "pc": "0x000BFE",
    "count": 32258
  },
  {
    "pc": "0x0021C2",
    "count": 10090
  },
  {
    "pc": "0x006D5D",
    "count": 10088
  },
  {
    "pc": "0x006D64",
    "count": 10088
  },
  {
    "pc": "0x006CDF",
    "count": 10083
  },
  {
    "pc": "0x006D0F",
    "count": 10083
  },
  {
    "pc": "0x006D38",
    "count": 10080
  },
  {
    "pc": "0x006D4F",
    "count": 10080
  },
  {
    "pc": "0x006CF7",
    "count": 10078
  },
  {
    "pc": "0x005AE8",
    "count": 4800
  },
  {
    "pc": "0x005B16",
    "count": 4800
  },
  {
    "pc": "0x005B4B",
    "count": 4800
  },
  {
    "pc": "0x005AB6",
    "count": 4500
  },
  {
    "pc": "0x000B72",
    "count": 3855
  },
  {
    "pc": "0x000B7C",
    "count": 3085
  },
  {
    "pc": "0x000B81",
    "count": 3085
  },
  {
    "pc": "0x0825D9",
    "count": 1200
  },
  {
    "pc": "0x07CB22",
    "count": 1183
  }
]
```

## Interpretation

The VAT lifetime issue is not a mysterious Phase 6/browser readback problem. The Phase 5 MEM_INIT values survive until the first bulk cleanup block, and the observed zeroing happens inside the block that executed immediately before 0x0018F8. Because that block is 0x001879, the next useful experiment is to snapshot the MEM_INIT/VAT tuple before the first cleanup and replay it after Phase 5 cleanup, before repaint.


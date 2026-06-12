# Phase 640: Browser Coldboot State Residual

Probe: `probe-phase640-browser-coldboot-state.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase640-browser-coldboot-state.mjs`  
Exit: 0

## Summary

- *** Browser Phase 5/6 snapshots were captured from an in-memory instrumented browser shell; no repo browser/runtime/transpiler source was modified.
- *** Direct comparison used the current phase597/610-style probe recipe around `0x09DD62` and `0x058241`.
- *** Key finding: both browser and direct phase597-style launch-home state still have D02590=0 after 0x09DD62; the browser VAT=0 log is not just a browser read/export bug.
- *** Browser Phase 5 MEM_INIT block hits=1; direct Phase 5 MEM_INIT block hits=1.
- *** Browser repaint ended max_steps at 0x084711 with D02590=0x000000; direct repaint ended max_steps at 0x084711 with D02590=0x000000.

## Browser Snapshots

| Label | Term | Steps | Last PC | D007CA | D007E0 | D008E0 | D02590 | D0259A | D0259D | D025C5 | VRAM |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| browser-before-p5-launch-home |  |  |  | 0x000000 | 0x00 | 0xD1A866 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0 |
| browser-after-p5-launch-home | halt | 275843 | 0x0019B5 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0 |
| browser-after-p6-event-frame |  |  |  | 0x000000 | 0x00 | 0xD1A863 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0 |
| browser-after-p6-home-repaint | max_steps | 300000 | 0x084711 | 0x0585E9 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 8549 |

## Direct Probe Snapshots

| Label | Term | Steps | Last PC | D007CA | D007E0 | D008E0 | D02590 | D0259A | D0259D | D025C5 | VRAM |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| direct-before-p5-launch-home |  |  |  | 0x000000 | 0x00 | 0xD1A866 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0 |
| direct-after-p5-launch-home | halt | 275843 | 0x0019B5 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0 |
| direct-after-p6-probe-frame |  |  |  | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0 |
| direct-after-p6-home-repaint | max_steps | 300000 | 0x084711 | 0x0585E9 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 8549 |

## Phase Stats

```json
{
  "browserP5": {
    "label": "browser-p5-launch-home",
    "totalBlocks": 275843,
    "targetCounts": {
      "launch09dd62": 1,
      "memInit09dee0": 1,
      "memInitStore09defc": 0,
      "repaint058241": 0,
      "vatLoop084711": 65,
      "vatRewind082be2": 573,
      "cleanup0018f8": 2,
      "halt0019b5": 1
    },
    "firstBlocks": [
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
      "0x04C9EA"
    ],
    "lastBlocks": [
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
      "0x000862",
      "0x0019B5"
    ],
    "hotBlocks": [
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
      }
    ],
    "fieldTransitions": [
      {
        "block": 3,
        "pc": "0x08A98F",
        "diff": {
          "D02587": [
            0,
            13740161
          ],
          "D0258A": [
            0,
            13740161
          ],
          "D0258D": [
            0,
            13740161
          ],
          "D02590": [
            0,
            13893631
          ],
          "D02593": [
            0,
            13893631
          ],
          "D0259A": [
            0,
            13893631
          ],
          "D0259D": [
            0,
            13893631
          ],
          "D025A0": [
            0,
            13740161
          ]
        }
      },
      {
        "block": 19,
        "pc": "0x09DD66",
        "diff": {
          "D025C5": [
            0,
            786432
          ]
        }
      },
      {
        "block": 348,
        "pc": "0x09E23E",
        "diff": {
          "D0258D": [
            13740161,
            13740170
          ]
        }
      },
      {
        "block": 415,
        "pc": "0x0821DF",
        "diff": {
          "D0258A": [
            13740161,
            13740163
          ],
          "D0258D": [
            13740170,
            13740172
          ]
        }
      },
      {
        "block": 418,
        "pc": "0x082236",
        "diff": {
          "D02587": [
            13740161,
            13740163
          ]
        }
      },
      {
        "block": 472,
        "pc": "0x08255D",
        "diff": {
          "D025A0": [
            13740161,
            13740163
          ]
        }
      },
      {
        "block": 539,
        "pc": "0x082105",
        "diff": {
          "D02590": [
            13893631,
            13893621
          ]
        }
      },
      {
        "block": 540,
        "pc": "0x082114",
        "diff": {
          "D0259A": [
            13893631,
            13893621
          ]
        }
      },
      {
        "block": 547,
        "pc": "0x08214F",
        "diff": {
          "D02593": [
            13893631,
            13893621
          ]
        }
      },
      {
        "block": 605,
        "pc": "0x08290A",
        "diff": {
          "D0258D": [
            13740172,
            13740163
          ]
        }
      },
      {
        "block": 638,
        "pc": "0x09E23E",
        "diff": {
          "D0258D": [
            13740163,
            13740172
          ]
        }
      },
      {
        "block": 719,
        "pc": "0x0821DF",
        "diff": {
          "D0258A": [
            13740163,
            13740165
          ],
          "D0258D": [
            13740172,
            13740174
          ]
        }
      }
    ]
  },
  "browserP6": {
    "label": "browser-p6-home-repaint",
    "totalBlocks": 298593,
    "targetCounts": {
      "launch09dd62": 0,
      "memInit09dee0": 0,
      "memInitStore09defc": 0,
      "repaint058241": 1,
      "vatLoop084711": 22741,
      "vatRewind082be2": 22742,
      "cleanup0018f8": 0,
      "halt0019b5": 0
    },
    "firstBlocks": [
      "0x058241",
      "0x058257",
      "0x058258",
      "0x058262",
      "0x0800C2",
      "0x058272",
      "0x058BA3",
      "0x058276",
      "0x058222",
      "0x08C782",
      "0x05822A",
      "0x058282"
    ],
    "lastBlocks": [
      "0x08471B",
      "0x084723",
      "0x084711",
      "0x082BE2",
      "0x084716",
      "0x08471B",
      "0x084723",
      "0x084711",
      "0x082BE2",
      "0x084716",
      "0x08471B",
      "0x084723"
    ],
    "hotBlocks": [
      {
        "pc": "0x082BE2",
        "count": 22742
      },
      {
        "pc": "0x084716",
        "count": 22742
      },
      {
        "pc": "0x08471B",
        "count": 22742
      },
      {
        "pc": "0x084723",
        "count": 22742
      },
      {
        "pc": "0x084711",
        "count": 22741
      },
      {
        "pc": "0x001CA6",
        "count": 8447
      },
      {
        "pc": "0x001CC0",
        "count": 8443
      },
      {
        "pc": "0x001CCA",
        "count": 8443
      }
    ],
    "fieldTransitions": [
      {
        "block": 11,
        "pc": "0x05822A",
        "diff": {
          "D007CA": [
            0,
            361961
          ]
        }
      },
      {
        "block": 18,
        "pc": "0x0582AC",
        "diff": {
          "D008E0": [
            13740131,
            0
          ]
        }
      },
      {
        "block": 33,
        "pc": "0x08377D",
        "diff": {
          "D008E0": [
            0,
            13740110
          ]
        }
      },
      {
        "block": 88,
        "pc": "0x08379A",
        "diff": {
          "D008E0": [
            13740110,
            0
          ]
        }
      }
    ]
  },
  "directP5": {
    "label": "direct-p5-launch-home",
    "totalBlocks": 275843,
    "targetCounts": {
      "launch09dd62": 1,
      "memInit09dee0": 1,
      "memInitStore09defc": 0,
      "repaint058241": 0,
      "vatLoop084711": 65,
      "vatRewind082be2": 573,
      "cleanup0018f8": 2,
      "halt0019b5": 1
    },
    "firstBlocks": [
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
      "0x04C9EA"
    ],
    "lastBlocks": [
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
      "0x000862",
      "0x0019B5"
    ],
    "hotBlocks": [
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
      }
    ],
    "fieldTransitions": [
      {
        "block": 3,
        "pc": "0x08A98F",
        "diff": {
          "D02587": [
            0,
            13740161
          ],
          "D0258A": [
            0,
            13740161
          ],
          "D0258D": [
            0,
            13740161
          ],
          "D02590": [
            0,
            13893631
          ],
          "D02593": [
            0,
            13893631
          ],
          "D0259A": [
            0,
            13893631
          ],
          "D0259D": [
            0,
            13893631
          ],
          "D025A0": [
            0,
            13740161
          ]
        }
      },
      {
        "block": 19,
        "pc": "0x09DD66",
        "diff": {
          "D025C5": [
            0,
            786432
          ]
        }
      },
      {
        "block": 348,
        "pc": "0x09E23E",
        "diff": {
          "D0258D": [
            13740161,
            13740170
          ]
        }
      },
      {
        "block": 415,
        "pc": "0x0821DF",
        "diff": {
          "D0258A": [
            13740161,
            13740163
          ],
          "D0258D": [
            13740170,
            13740172
          ]
        }
      },
      {
        "block": 418,
        "pc": "0x082236",
        "diff": {
          "D02587": [
            13740161,
            13740163
          ]
        }
      },
      {
        "block": 472,
        "pc": "0x08255D",
        "diff": {
          "D025A0": [
            13740161,
            13740163
          ]
        }
      },
      {
        "block": 539,
        "pc": "0x082105",
        "diff": {
          "D02590": [
            13893631,
            13893621
          ]
        }
      },
      {
        "block": 540,
        "pc": "0x082114",
        "diff": {
          "D0259A": [
            13893631,
            13893621
          ]
        }
      },
      {
        "block": 547,
        "pc": "0x08214F",
        "diff": {
          "D02593": [
            13893631,
            13893621
          ]
        }
      },
      {
        "block": 605,
        "pc": "0x08290A",
        "diff": {
          "D0258D": [
            13740172,
            13740163
          ]
        }
      },
      {
        "block": 638,
        "pc": "0x09E23E",
        "diff": {
          "D0258D": [
            13740163,
            13740172
          ]
        }
      },
      {
        "block": 719,
        "pc": "0x0821DF",
        "diff": {
          "D0258A": [
            13740163,
            13740165
          ],
          "D0258D": [
            13740172,
            13740174
          ]
        }
      }
    ]
  },
  "directP6": {
    "label": "direct-p6-home-repaint",
    "totalBlocks": 298593,
    "targetCounts": {
      "launch09dd62": 0,
      "memInit09dee0": 0,
      "memInitStore09defc": 0,
      "repaint058241": 1,
      "vatLoop084711": 22741,
      "vatRewind082be2": 22742,
      "cleanup0018f8": 0,
      "halt0019b5": 0
    },
    "firstBlocks": [
      "0x058241",
      "0x058257",
      "0x058258",
      "0x058262",
      "0x0800C2",
      "0x058272",
      "0x058BA3",
      "0x058276",
      "0x058222",
      "0x08C782",
      "0x05822A",
      "0x058282"
    ],
    "lastBlocks": [
      "0x08471B",
      "0x084723",
      "0x084711",
      "0x082BE2",
      "0x084716",
      "0x08471B",
      "0x084723",
      "0x084711",
      "0x082BE2",
      "0x084716",
      "0x08471B",
      "0x084723"
    ],
    "hotBlocks": [
      {
        "pc": "0x082BE2",
        "count": 22742
      },
      {
        "pc": "0x084716",
        "count": 22742
      },
      {
        "pc": "0x08471B",
        "count": 22742
      },
      {
        "pc": "0x084723",
        "count": 22742
      },
      {
        "pc": "0x084711",
        "count": 22741
      },
      {
        "pc": "0x001CA6",
        "count": 8447
      },
      {
        "pc": "0x001CC0",
        "count": 8443
      },
      {
        "pc": "0x001CCA",
        "count": 8443
      }
    ],
    "fieldTransitions": [
      {
        "block": 11,
        "pc": "0x05822A",
        "diff": {
          "D007CA": [
            0,
            361961
          ]
        }
      },
      {
        "block": 33,
        "pc": "0x08377D",
        "diff": {
          "D008E0": [
            0,
            13740134
          ]
        }
      },
      {
        "block": 88,
        "pc": "0x08379A",
        "diff": {
          "D008E0": [
            13740134,
            0
          ]
        }
      }
    ]
  },
  "browserLogTail": [
    "--- Phase 1 done: 20000 steps, max_steps at 0x001cc0 ---",
    "--- Coldboot Phase 2: Kernel init (0x08C331, 100K steps) ---",
    "--- Phase 2 done: 100000 steps, max_steps at 0x000a92 ---",
    "--- Coldboot Phase 3: Post-init (0x0802B2, 100 steps) ---",
    "--- Phase 3 done: 100 steps, max_steps at 0x0158bc ---",
    "--- Coldboot Phase 4: Warm idle continuation (0x0019be, 1.5M step cap) ---",
    "--- Phase 4 done: 192290 steps, halt at 0x0019b5 ---",
    "--- Coldboot Phase 5: Launch-home init (0x09dd62, 300K step cap) ---",
    "--- Phase 5 done: 275843 steps, halt at 0x0019b5 ---",
    "--- Coldboot Phase 6: Home repaint (0x058241, 300K step cap) ---",
    "--- Phase 6 done: 300000 steps, max_steps at 0x084711; D007CA=0x0585e9, VAT=0x000000, VRAM=8549px ---",
    "--- Coldboot seeded (entry=0x08c331, halt=0x0019b5, SP=0xd1a85d, IY=0xD00080, timerInterrupt=true) ---"
  ],
  "browserFinal": {
    "label": "browser-final",
    "result": null,
    "sp": "0xD1A85D",
    "pc": "0x084723",
    "halted": false,
    "fields": {
      "D007CA": "0x0585E9",
      "D007E0": "0x00",
      "D008E0": "0x000000",
      "D0231A": "0x000000",
      "D0243A": "0x000000",
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
    "vramPixels": 8549,
    "status": "Coldboot complete. OS event loop is ready."
  }
}
```

## Interpretation

The residual is now narrowed to the launch-home setup boundary rather than a browser-only Phase 6 display issue. The current browser and direct recipes both reach a clean-looking home context path, but neither leaves OPBase (`D02590`) initialized after `0x09DD62`; `0x058241` then hits the known VAT search loop (`0x084711`). The next useful test is to inspect why the `0x09DD62` frame is not reaching or preserving MEM_INIT in the current recipe, or replay a known-good post-init/VAT snapshot before repaint.


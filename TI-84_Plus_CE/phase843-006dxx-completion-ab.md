# Phase 843: 0x006Dxx Completion A/B

Probe: `probe-phase843-006dxx-completion-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase843-006dxx-completion-ab.mjs`

## Summary

- Baseline reproduced Phase842: the faithful CLEAR route reaches the `0x006Dxx` loop with port `0x2001` already returning `0x00` / bit 3 clear.
- A probe-local `0x2001` force-clear control is behaviorally identical to baseline, confirming the inner busy bit is not the remaining stuck condition.
- A probe-local completion override at `0x006D64` forces the local `IX+9`/`HL` compare to zero. This tests the surrounding loop only; it is not a proposed source edit.
- Pass criteria: baseline and force-clear both sample the loop with bit 3 clear, and the completion case applies at least one `0x006D64` override then leaves `0x006Dxx`. Result: PASS.

## Case Matrix

| Case | Termination | Steps | Low 0x006D Hits | Poll Reads | Poll Values | 0x006D64 Hits | Overrides | First Exit | 0x001879/0x0018F8 | Top PCs |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- |
| baseline-current | sampled-006dxx-poll | 20966 | 330 | 64 | 0x00 | 67 | 0 | 0x0064DE | 1/1 | 0x09EFDE:2880, 0x005AE8:1392, 0x005B16:1392, 0x005B4B:1392 |
| force-port2001-clear | sampled-006dxx-poll | 20966 | 330 | 64 | 0x00 | 67 | 0 | 0x0064DE | 1/1 | 0x09EFDE:2880, 0x005AE8:1392, 0x005B16:1392, 0x005B4B:1392 |
| completion-override-006d64 | post-006dxx-completion-window | 50558 | 24 | 0 | - | 5 | 5 | 0x0064DE | 1/1 | 0x000A92:16256, 0x000BFE:8830, 0x09EFDE:2880, 0x005AE8:1424 |

## Oracle Comparison

Compared against `captures/realram-home-afterCLEAR-D00000-D657FF.bin`.

| Case | Field | Actual | Oracle | Match |
| --- | --- | --- | --- | --- |
| baseline-current | D007CA | 0x000000 | 0x0585E9 | no |
| baseline-current | D008E0 | 0x000000 | 0xD1A86C | no |
| baseline-current | D0243A | 0x000000 | 0xD1A8CC | no |
| baseline-current | D0243D | 0x000000 | 0xD2A83E | no |
| baseline-current | D02590 | 0x000000 | 0xD3FE81 | no |
| baseline-current | D0259D | 0x000000 | 0xD3FECD | no |
| baseline-current | D02A29 | 0x0000 | 0x0000 | yes |
| baseline-current | D00587 | 0x00 | 0x00 | yes |
| baseline-current | D0058C | 0x00 | 0x00 | yes |
| baseline-current | D0058E | 0x00 | 0x00 | yes |
| force-port2001-clear | D007CA | 0x000000 | 0x0585E9 | no |
| force-port2001-clear | D008E0 | 0x000000 | 0xD1A86C | no |
| force-port2001-clear | D0243A | 0x000000 | 0xD1A8CC | no |
| force-port2001-clear | D0243D | 0x000000 | 0xD2A83E | no |
| force-port2001-clear | D02590 | 0x000000 | 0xD3FE81 | no |
| force-port2001-clear | D0259D | 0x000000 | 0xD3FECD | no |
| force-port2001-clear | D02A29 | 0x0000 | 0x0000 | yes |
| force-port2001-clear | D00587 | 0x00 | 0x00 | yes |
| force-port2001-clear | D0058C | 0x00 | 0x00 | yes |
| force-port2001-clear | D0058E | 0x00 | 0x00 | yes |
| completion-override-006d64 | D007CA | 0x000000 | 0x0585E9 | no |
| completion-override-006d64 | D008E0 | 0x000000 | 0xD1A86C | no |
| completion-override-006d64 | D0243A | 0x000000 | 0xD1A8CC | no |
| completion-override-006d64 | D0243D | 0x000000 | 0xD2A83E | no |
| completion-override-006d64 | D02590 | 0x000000 | 0xD3FE81 | no |
| completion-override-006d64 | D0259D | 0x000000 | 0xD3FECD | no |
| completion-override-006d64 | D02A29 | 0x0000 | 0x0000 | yes |
| completion-override-006d64 | D00587 | 0x00 | 0x00 | yes |
| completion-override-006d64 | D0058C | 0x00 | 0x00 | yes |
| completion-override-006d64 | D0058E | 0x00 | 0x00 | yes |

## Completion Override Detail

```json
{
  "blockIndex": 20438,
  "ix9Value": "0x000100",
  "before": {
    "pc": "0x006D64",
    "currentBlockPc": "0x006D64",
    "sp": "0xD1A82B",
    "ix": "0xD1A831",
    "iy": "0xD00080",
    "af": "0x0002",
    "bc": "0x020000",
    "de": "0x000240",
    "hl": "0x000100",
    "flags": {
      "z": false,
      "c": false
    },
    "fields": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0x000000",
      "D0259D": "0x000000",
      "D02A29": "0x0000",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058E": "0x00",
      "D00121": "0x000000",
      "D00124": "0x0A"
    },
    "ixFrame": {
      "IX-6": "0x000000",
      "IX-3": "0x020000",
      "IX+0": "0xD1A866",
      "IX+3": "0x0064DE",
      "IX+6": "0x020000",
      "IX+9": "0x000100"
    }
  },
  "after": {
    "pc": "0x006D64",
    "currentBlockPc": "0x006D64",
    "sp": "0xD1A82B",
    "ix": "0xD1A831",
    "iy": "0xD00080",
    "af": "0x0042",
    "bc": "0x020000",
    "de": "0x000240",
    "hl": "0x000000",
    "flags": {
      "z": true,
      "c": false
    },
    "fields": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0x000000",
      "D0259D": "0x000000",
      "D02A29": "0x0000",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058E": "0x00",
      "D00121": "0x000000",
      "D00124": "0x0A"
    },
    "ixFrame": {
      "IX-6": "0x000000",
      "IX-3": "0x020000",
      "IX+0": "0xD1A866",
      "IX+3": "0x0064DE",
      "IX+6": "0x020000",
      "IX+9": "0x000000"
    }
  }
}
```

## First Exit After 0x006Dxx

```json
{
  "baseline-current": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  },
  "force-port2001-clear": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  },
  "completion-override-006d64": {
    "blockIndex": 20440,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x020000",
      "de": "0x000240",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x0A"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  }
}
```

## First Hits

```json
{
  "baseline-current": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  },
  "force-port2001-clear": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  },
  "completion-override-006d64": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0042",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000000"
        }
      }
    }
  }
}
```

## Peripheral Cross-Check

| Line | Source |
| ---: | --- |
| 142 | `function createFlashControllerHandler(state) {` |
| 145 | `if (port === 0x2001) {` |
| 146 | `return 0x00;` |
| 149 | `return 0x00;` |
| 721 | `register({ start: 0x2000, end: 0x200f }, createFlashControllerHandler(state));` |

## Full JSON

```json
{
  "probe": "phase843-006dxx-completion-ab",
  "pass": true,
  "cases": [
    {
      "scenario": "baseline-current",
      "description": "Current peripherals.js behavior; stop after sampling 0x006Dxx.",
      "termination": "sampled-006dxx-poll",
      "steps": 20966,
      "low006DRegion": 330,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 64,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 67,
      "overrideCount": 0,
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0060B3",
          "count": 255
        },
        {
          "pc": "0x001377",
          "count": 254
        },
        {
          "pc": "0x006129",
          "count": 173
        },
        {
          "pc": "0x00612E",
          "count": 173
        },
        {
          "pc": "0x0A1A83",
          "count": 160
        },
        {
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x001000",
        "D00124": "0x0E"
      },
      "oracle": [
        {
          "name": "D007CA",
          "actual": 0,
          "expected": 361961,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 0,
          "expected": 13740140,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D"
      ]
    },
    {
      "scenario": "force-port2001-clear",
      "description": "Probe-local 0x2001 read override to 0x00; should match baseline because bit 3 is already clear.",
      "termination": "sampled-006dxx-poll",
      "steps": 20966,
      "low006DRegion": 330,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 64,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 67,
      "overrideCount": 0,
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0060B3",
          "count": 255
        },
        {
          "pc": "0x001377",
          "count": 254
        },
        {
          "pc": "0x006129",
          "count": 173
        },
        {
          "pc": "0x00612E",
          "count": 173
        },
        {
          "pc": "0x0A1A83",
          "count": 160
        },
        {
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x001000",
        "D00124": "0x0E"
      },
      "oracle": [
        {
          "name": "D007CA",
          "actual": 0,
          "expected": 361961,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 0,
          "expected": 13740140,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D"
      ]
    },
    {
      "scenario": "completion-override-006d64",
      "description": "Probe-local completion override: force IX+9/HL zero and Z at 0x006D64, then observe the next route.",
      "termination": "post-006dxx-completion-window",
      "steps": 50558,
      "low006DRegion": 24,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 0,
      "pollValues": [],
      "allBit3Clear": false,
      "loop006D64": 5,
      "overrideCount": 5,
      "firstOverride": {
        "blockIndex": 20438,
        "ix9Value": "0x000100",
        "before": {
          "pc": "0x006D64",
          "currentBlockPc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000000",
            "D00124": "0x0A"
          },
          "ixFrame": {
            "IX-6": "0x000000",
            "IX-3": "0x020000",
            "IX+0": "0xD1A866",
            "IX+3": "0x0064DE",
            "IX+6": "0x020000",
            "IX+9": "0x000100"
          }
        },
        "after": {
          "pc": "0x006D64",
          "currentBlockPc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000000",
            "D00124": "0x0A"
          },
          "ixFrame": {
            "IX-6": "0x000000",
            "IX-3": "0x020000",
            "IX+0": "0xD1A866",
            "IX+3": "0x0064DE",
            "IX+6": "0x020000",
            "IX+9": "0x000000"
          }
        }
      },
      "firstExitAfter006D": {
        "blockIndex": 20440,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000000",
            "D00124": "0x0A"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000000"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x000A92",
          "count": 16256
        },
        {
          "pc": "0x000BFE",
          "count": 8830
        },
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1424
        },
        {
          "pc": "0x005B16",
          "count": 1424
        },
        {
          "pc": "0x005B4B",
          "count": 1424
        },
        {
          "pc": "0x005AB6",
          "count": 1335
        },
        {
          "pc": "0x000B72",
          "count": 1095
        },
        {
          "pc": "0x000B7C",
          "count": 887
        },
        {
          "pc": "0x000B81",
          "count": 887
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x000B7F",
          "count": 281
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x0A"
      },
      "oracle": [
        {
          "name": "D007CA",
          "actual": 0,
          "expected": 361961,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 0,
          "expected": 13740140,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000C4A",
        "0x000C80",
        "0x000B37",
        "0x000B60",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7F",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7F",
        "0x000B72",
        "0x000B7F",
        "0x000B72",
        "0x000B7F",
        "0x000B72",
        "0x000B7F",
        "0x000B83",
        "0x000BCB",
        "0x000BD3",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE"
      ]
    }
  ],
  "peripheralsCrossCheck": [
    {
      "line": 142,
      "text": "function createFlashControllerHandler(state) {"
    },
    {
      "line": 145,
      "text": "if (port === 0x2001) {"
    },
    {
      "line": 146,
      "text": "return 0x00;"
    },
    {
      "line": 149,
      "text": "return 0x00;"
    },
    {
      "line": 721,
      "text": "register({ start: 0x2000, end: 0x200f }, createFlashControllerHandler(state));"
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.


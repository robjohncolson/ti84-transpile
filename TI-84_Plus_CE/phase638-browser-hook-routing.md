# Phase 638: Browser Hook Routing

Probe: `probe-phase638-browser-hook-routing.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase638-browser-hook-routing.mjs`  
Exit: 0

## Summary

- *** Browser key bursts were instrumented in an in-memory copy of browser-shell.html; no repo browser/runtime/transpiler source was modified.
- *** EOL/CLEAR seed was present (yes) and the burst reached cleanup but missed token/tuple hook blocks: 0x08F5E1=0, 0x090992=0, 0x08F54B=0, 0x0018F8=3.
- *** Digit2 seed was present (yes) and also missed the token/tuple hooks while preserving VRAM: 0x08F5E1=0, 0x090992=0, 0x08F54B=0, 0x0018F8=3.
- *** Preserve Display still works at the display level: EOL VRAM=3039, Digit2 VRAM=3040, page errors=0.

## Interpretation

The browser-shell persistence code is being called, and key seeding is not the miss: the start snapshots show the pending-key fields armed before each burst. The current browser AutoRun state then routes through structural cleanup and display-preserve VRAM peaks, but it never enters the proven token-output consumer blocks (`0x08F5E1`, `0x090992`, `0x09098E`) or the natural EOL tuple save block (`0x08F54B`). That explains why the phase637 token/tuple restore logs never appear: the hooks are wired but the exercised browser key route bypasses their trigger addresses.

## Key Records

```json
{
  "before": {
    "status": "Coldboot: 50000 steps, max_steps | Total: 938233 | PC=0x006d38",
    "preserve": true,
    "autoRunText": "AutoRun",
    "diagnostics": {
      "tokenGate": 0,
      "tokenA": 0,
      "tokenB": 0,
      "tuple": {
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D0059A": 0,
        "D01150": 0,
        "D0243D": 0,
        "D02A40": 0,
        "D02A28": 0
      }
    },
    "phase638": {
      "runtimeMode": "coldboot",
      "lastPc": 27960,
      "lastMode": "adl",
      "totalSteps": 938233,
      "cpu": {
        "pc": 27919,
        "sp": 13740075,
        "iy": 13631616,
        "ix": 13740081,
        "f": 66,
        "halted": false,
        "iff1": 0,
        "iff2": 0,
        "mbase": 208,
        "madl": 1
      },
      "fields": {
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
        "D02A40": 0,
        "VAT_D02590": 0
      },
      "diagnostics": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D02A40": 0,
          "D02A28": 0
        }
      },
      "status": "Coldboot: 50000 steps, max_steps | Total: 938233 | PC=0x006d38"
    },
    "vramPixels": 3031,
    "errors": [],
    "infoLogTail": [
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
    ]
  },
  "afterEol": {
    "status": "Key: CLEAR → 350000 steps (peak 3353px)",
    "preserve": true,
    "autoRunText": "AutoRun",
    "diagnostics": {
      "tokenGate": 0,
      "tokenA": 0,
      "tokenB": 0,
      "tuple": {
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D0059A": 0,
        "D01150": 0,
        "D0243D": 0,
        "D02A40": 0,
        "D02A28": 0
      }
    },
    "phase638": {
      "runtimeMode": "coldboot",
      "lastPc": 2930,
      "lastMode": "adl",
      "totalSteps": 1288233,
      "cpu": {
        "pc": 2943,
        "sp": 13738940,
        "iy": 13631616,
        "ix": 13738985,
        "f": 2,
        "halted": false,
        "iff1": 0,
        "iff2": 0,
        "mbase": 208,
        "madl": 1
      },
      "fields": {
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
        "D02A40": 0,
        "VAT_D02590": 0
      },
      "diagnostics": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D02A40": 0,
          "D02A28": 0
        }
      },
      "status": "Key: CLEAR → 350000 steps (peak 3353px)"
    },
    "vramPixels": 3039,
    "errors": [],
    "infoLogTail": [
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
    ]
  },
  "afterDigit2": {
    "status": "Key: 2 → 300000 steps (peak 3359px)",
    "preserve": true,
    "autoRunText": "AutoRun",
    "diagnostics": {
      "tokenGate": 0,
      "tokenA": 0,
      "tokenB": 0,
      "tuple": {
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D0059A": 0,
        "D01150": 0,
        "D0243D": 0,
        "D02A40": 0,
        "D02A28": 0
      }
    },
    "phase638": {
      "runtimeMode": "coldboot",
      "lastPc": 2706,
      "lastMode": "adl",
      "totalSteps": 1588233,
      "cpu": {
        "pc": 2706,
        "sp": 13738940,
        "iy": 13631616,
        "ix": 13738985,
        "f": 34,
        "halted": false,
        "iff1": 0,
        "iff2": 0,
        "mbase": 208,
        "madl": 1
      },
      "fields": {
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
        "D02A40": 0,
        "VAT_D02590": 0
      },
      "diagnostics": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D02A40": 0,
          "D02A28": 0
        }
      },
      "status": "Key: 2 → 300000 steps (peak 3359px)"
    },
    "vramPixels": 3040,
    "errors": [],
    "infoLogTail": [
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
    ]
  },
  "eol": {
    "label": "EOL/CLEAR",
    "totalBlocks": 349982,
    "counts": {
      "cleanup0018f8": 3,
      "halt0019b5": 1,
      "getCsc03fa09": 2,
      "loop08c331": 2,
      "outer08f3b8": 0,
      "tokenReader090883": 0,
      "tokenExit08f5e1": 0,
      "tokenGate090992": 0,
      "tokenStore09098e": 0,
      "eolTuple08f54b": 0,
      "low006d38": 20160,
      "low006d4f": 20160,
      "low006d5d": 20176
    },
    "regionCounts": {
      "token08f000_090fff": 0,
      "display090000_091fff": 0,
      "low006d00_006dff": 100864,
      "cleanupLow001000_001fff": 3600
    },
    "startFields": {
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
      "D02A40": 0,
      "VAT_D02590": 0
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
      "D02A40": 0,
      "VAT_D02590": 0
    },
    "startPc": 27960,
    "endPc": 2930,
    "status": "Key: CLEAR → 350000 steps (peak 3353px)",
    "firstBlocks": [
      "0x08C331",
      "0x000038",
      "0x0006F3",
      "0x000704",
      "0x000710",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x000719",
      "0x0019BE",
      "0x0019EF",
      "0x0019F4",
      "0x0019FE",
      "0x001ACF",
      "0x001AD9"
    ],
    "lastBlocks": [
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
      "0x000B7F"
    ],
    "hotBlocks": [
      {
        "pc": "0x000A92",
        "count": 65024
      },
      {
        "pc": "0x000BFE",
        "count": 51435
      },
      {
        "pc": "0x0021C2",
        "count": 20186
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
    "targetSamples": [
      {
        "block": 1,
        "pc": "0x08C331",
        "target": "loop08c331",
        "before": {
          "D00587": 0,
          "D0058C": 15,
          "D0058D": 15,
          "D0058E": 15,
          "D00080": 8,
          "D0009F": 32,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 2942,
        "pc": "0x03FA09",
        "target": "getCsc03fa09",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 15,
          "D0058E": 0,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 4083,
        "pc": "0x0018F8",
        "target": "cleanup0018f8",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 13390,
        "pc": "0x006D5D",
        "target": "low006d5d",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 13396,
        "pc": "0x006D38",
        "target": "low006d38",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 13397,
        "pc": "0x006D4F",
        "target": "low006d4f",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 13398,
        "pc": "0x006D5D",
        "target": "low006d5d",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 13404,
        "pc": "0x006D38",
        "target": "low006d38",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 13405,
        "pc": "0x006D4F",
        "target": "low006d4f",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 13406,
        "pc": "0x006D5D",
        "target": "low006d5d",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 13412,
        "pc": "0x006D38",
        "target": "low006d38",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 13413,
        "pc": "0x006D4F",
        "target": "low006d4f",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 194211,
        "pc": "0x0018F8",
        "target": "cleanup0018f8",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 195795,
        "pc": "0x0019B5",
        "target": "halt0019b5",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 195796,
        "pc": "0x08C331",
        "target": "loop08c331",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 196879,
        "pc": "0x03FA09",
        "target": "getCsc03fa09",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      },
      {
        "block": 198527,
        "pc": "0x0018F8",
        "target": "cleanup0018f8",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 938233
        }
      }
    ],
    "fieldTransitions": [
      {
        "block": 1,
        "pc": "0x08C331",
        "diff": {
          "D0058C": [
            0,
            15
          ],
          "D0058D": [
            0,
            15
          ],
          "D0058E": [
            0,
            15
          ],
          "D00080": [
            0,
            8
          ],
          "D0009F": [
            0,
            32
          ],
          "D007CA": [
            0,
            361961
          ],
          "D008E0": [
            0,
            13740131
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 15,
          "D0058D": 15,
          "D0058E": 15,
          "D00080": 8,
          "D0009F": 32,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 15,
          "D0058D": 15,
          "D0058E": 15,
          "D00080": 8,
          "D0009F": 32,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 763,
        "pc": "0x08C366",
        "diff": {
          "D0009F": [
            32,
            0
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 15,
          "D0058D": 15,
          "D0058E": 15,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 15,
          "D0058D": 15,
          "D0058E": 15,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 2334,
        "pc": "0x02FCB3",
        "diff": {
          "D0058C": [
            15,
            0
          ],
          "D0058E": [
            15,
            0
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 15,
          "D0058E": 0,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 15,
          "D0058E": 0,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 2943,
        "pc": "0x000038",
        "diff": {
          "D00080": [
            8,
            0
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 15,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 15,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 4083,
        "pc": "0x0018F8",
        "diff": {
          "D0058D": [
            15,
            0
          ],
          "D007CA": [
            361961,
            0
          ],
          "D008E0": [
            13740131,
            0
          ]
        },
        "beforeHook": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        }
      }
    ]
  },
  "digit2": {
    "label": "Digit2",
    "totalBlocks": 299976,
    "counts": {
      "cleanup0018f8": 3,
      "halt0019b5": 1,
      "getCsc03fa09": 3,
      "loop08c331": 2,
      "outer08f3b8": 0,
      "tokenReader090883": 0,
      "tokenExit08f5e1": 0,
      "tokenGate090992": 0,
      "tokenStore09098e": 0,
      "eolTuple08f54b": 0,
      "low006d38": 20160,
      "low006d4f": 20160,
      "low006d5d": 20176
    },
    "regionCounts": {
      "token08f000_090fff": 0,
      "display090000_091fff": 0,
      "low006d00_006dff": 100864,
      "cleanupLow001000_001fff": 3684
    },
    "startFields": {
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
      "D02A40": 0,
      "VAT_D02590": 0
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
      "D02A40": 0,
      "VAT_D02590": 0
    },
    "startPc": 2930,
    "endPc": 2706,
    "status": "Key: 2 → 300000 steps (peak 3359px)",
    "firstBlocks": [
      "0x08C331",
      "0x000038",
      "0x0006F3",
      "0x000704",
      "0x000710",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x000719",
      "0x0019BE",
      "0x0019EF",
      "0x0019F4",
      "0x0019FE",
      "0x001ACF",
      "0x001AD9"
    ],
    "lastBlocks": [
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92"
    ],
    "hotBlocks": [
      {
        "pc": "0x000A92",
        "count": 40078
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
    "targetSamples": [
      {
        "block": 1,
        "pc": "0x08C331",
        "target": "loop08c331",
        "before": {
          "D00587": 26,
          "D0058C": 144,
          "D0058D": 144,
          "D0058E": 144,
          "D00080": 8,
          "D0009F": 32,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 3014,
        "pc": "0x03FA09",
        "target": "getCsc03fa09",
        "before": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 144,
          "D0058E": 0,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 5361,
        "pc": "0x03FA09",
        "target": "getCsc03fa09",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 144,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 6500,
        "pc": "0x0018F8",
        "target": "cleanup0018f8",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 15830,
        "pc": "0x006D5D",
        "target": "low006d5d",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 15836,
        "pc": "0x006D38",
        "target": "low006d38",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 15837,
        "pc": "0x006D4F",
        "target": "low006d4f",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 15838,
        "pc": "0x006D5D",
        "target": "low006d5d",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 15844,
        "pc": "0x006D38",
        "target": "low006d38",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 15845,
        "pc": "0x006D4F",
        "target": "low006d4f",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 15846,
        "pc": "0x006D5D",
        "target": "low006d5d",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 15852,
        "pc": "0x006D38",
        "target": "low006d38",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 15853,
        "pc": "0x006D4F",
        "target": "low006d4f",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 196651,
        "pc": "0x0018F8",
        "target": "cleanup0018f8",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 198235,
        "pc": "0x0019B5",
        "target": "halt0019b5",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 198236,
        "pc": "0x08C331",
        "target": "loop08c331",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 199319,
        "pc": "0x03FA09",
        "target": "getCsc03fa09",
        "before": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 26,
          "D0058E": 0,
          "D00080": 24,
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      },
      {
        "block": 201361,
        "pc": "0x0018F8",
        "target": "cleanup0018f8",
        "before": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 1288233
        }
      }
    ],
    "fieldTransitions": [
      {
        "block": 1,
        "pc": "0x08C331",
        "diff": {
          "D00587": [
            0,
            26
          ],
          "D0058C": [
            0,
            144
          ],
          "D0058D": [
            0,
            144
          ],
          "D0058E": [
            0,
            144
          ],
          "D00080": [
            0,
            8
          ],
          "D0009F": [
            0,
            32
          ],
          "D007CA": [
            0,
            361961
          ],
          "D008E0": [
            0,
            13740131
          ]
        },
        "beforeHook": {
          "D00587": 26,
          "D0058C": 144,
          "D0058D": 144,
          "D0058E": 144,
          "D00080": 8,
          "D0009F": 32,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 26,
          "D0058C": 144,
          "D0058D": 144,
          "D0058E": 144,
          "D00080": 8,
          "D0009F": 32,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 763,
        "pc": "0x08C366",
        "diff": {
          "D0009F": [
            32,
            0
          ]
        },
        "beforeHook": {
          "D00587": 26,
          "D0058C": 144,
          "D0058D": 144,
          "D0058E": 144,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 26,
          "D0058C": 144,
          "D0058D": 144,
          "D0058E": 144,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 2406,
        "pc": "0x02FCB3",
        "diff": {
          "D0058C": [
            144,
            0
          ],
          "D0058E": [
            144,
            0
          ]
        },
        "beforeHook": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 144,
          "D0058E": 0,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 144,
          "D0058E": 0,
          "D00080": 8,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 3015,
        "pc": "0x000038",
        "diff": {
          "D00587": [
            26,
            0
          ],
          "D00080": [
            8,
            0
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 144,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 144,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 3094,
        "pc": "0x08C38A",
        "diff": {
          "D0058C": [
            0,
            144
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 144,
          "D0058D": 144,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 144,
          "D0058D": 144,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 4753,
        "pc": "0x02FCB3",
        "diff": {
          "D0058C": [
            144,
            0
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 144,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 144,
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 6500,
        "pc": "0x0018F8",
        "diff": {
          "D0058D": [
            144,
            0
          ],
          "D007CA": [
            361961,
            0
          ],
          "D008E0": [
            13740131,
            0
          ]
        },
        "beforeHook": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 198376,
        "pc": "0x03FA04",
        "diff": {
          "D00587": [
            0,
            26
          ],
          "D00080": [
            0,
            8
          ]
        },
        "beforeHook": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 8,
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 8,
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
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 198377,
        "pc": "0x03F9D5",
        "diff": {
          "D0058D": [
            0,
            26
          ]
        },
        "beforeHook": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 26,
          "D0058E": 0,
          "D00080": 8,
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 26,
          "D0058E": 0,
          "D00080": 8,
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
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 198379,
        "pc": "0x03D058",
        "diff": {
          "D00080": [
            8,
            24
          ]
        },
        "beforeHook": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 26,
          "D0058E": 0,
          "D00080": 24,
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 26,
          "D0058C": 0,
          "D0058D": 26,
          "D0058E": 0,
          "D00080": 24,
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
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 199320,
        "pc": "0x000038",
        "diff": {
          "D00587": [
            26,
            0
          ],
          "D00080": [
            24,
            16
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 26,
          "D0058E": 0,
          "D00080": 16,
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 26,
          "D0058E": 0,
          "D00080": 16,
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
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 199629,
        "pc": "0x02FECF",
        "diff": {
          "D00080": [
            16,
            0
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 26,
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 26,
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
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 199814,
        "pc": "0x08C38A",
        "diff": {
          "D0058C": [
            0,
            144
          ]
        },
        "beforeHook": {
          "D00587": 0,
          "D0058C": 144,
          "D0058D": 26,
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
          "D00587": 0,
          "D0058C": 144,
          "D0058D": 26,
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
          "D02A40": 0,
          "VAT_D02590": 0
        }
      },
      {
        "block": 201361,
        "pc": "0x0018F8",
        "diff": {
          "D0058C": [
            144,
            0
          ],
          "D0058D": [
            26,
            0
          ]
        },
        "beforeHook": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        },
        "afterHook": {
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
          "D02A40": 0,
          "VAT_D02590": 0
        }
      }
    ]
  },
  "errors": []
}
```

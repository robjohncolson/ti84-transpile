# Phase 639: Browser Hook Routing Without Post-Coldboot AutoRun

Probe: `probe-phase639-browser-no-autorun.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase639-browser-no-autorun.mjs`  
Exit: 0

## Summary

- *** Skipped the phase626/637 manual AutoRun frame. Immediately after "Coldboot complete", status="Coldboot complete. OS event loop is ready.", lastPc=0x8c331, D007CA=0x0585e9, VAT=0x000000, VRAM=8549px.
- *** EOL/CLEAR route=low-rom-route; counters: 0x08F5E1=0, 0x090992=0, 0x08F54B=0, 0x0018F8=3, low006d=100864, final VRAM=3039.
- *** Digit2 route=low-rom-route; counters: 0x08F5E1=0, 0x090992=0, 0x08F54B=0, 0x0018F8=3, low006d=100864, final VRAM=3040.
- *** Result: skipping AutoRun did not restore the token/tuple hook route; both keys still bypassed 0x08F5E1/0x090992/0x08F54B.

## Interpretation

The extra AutoRun frame is not the only cause of the hook miss. The no-AutoRun coldboot-ready state still starts key bursts at the event-loop entry and seeds the pending key, but both tested keys route through cleanup and the low 0x006Dxx loop while never entering the proven token-output or EOL tuple-save addresses. The remaining blocker is therefore upstream coldboot/repaint state, not merely the post-coldboot AutoRun click.

## Key Records

```json
{
  "before": {
    "status": "Coldboot complete. OS event loop is ready.",
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
    "phase639": {
      "runtimeMode": "coldboot",
      "lastPc": 574257,
      "lastMode": "adl",
      "totalSteps": 888233,
      "cpu": {
        "pc": 542499,
        "sp": 13740125,
        "iy": 13631616,
        "ix": 13740128,
        "f": 170,
        "halted": false,
        "iff1": 1,
        "iff2": 1,
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
      "vramPixels": 8549,
      "status": "Coldboot complete. OS event loop is ready."
    },
    "vramPixels": 8549,
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
    "status": "Key: CLEAR → 350000 steps (peak 8621px)",
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
    "phase639": {
      "runtimeMode": "coldboot",
      "lastPc": 3070,
      "lastMode": "adl",
      "totalSteps": 1238233,
      "cpu": {
        "pc": 3070,
        "sp": 13738940,
        "iy": 13631616,
        "ix": 13738985,
        "f": 32,
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
      "vramPixels": 3039,
      "status": "Key: CLEAR → 350000 steps (peak 8621px)"
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
    "status": "Key: 2 → 300000 steps (peak 3356px)",
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
    "phase639": {
      "runtimeMode": "coldboot",
      "lastPc": 2706,
      "lastMode": "adl",
      "totalSteps": 1538233,
      "cpu": {
        "pc": 2706,
        "sp": 13738940,
        "iy": 13631616,
        "ix": 13738985,
        "f": 42,
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
      "vramPixels": 3040,
      "status": "Key: 2 → 300000 steps (peak 3356px)"
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
    "label": "NoAutoRun EOL/CLEAR",
    "totalBlocks": 349978,
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
      "cleanupLow001000_001fff": 4364
    },
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
    "startPc": 574257,
    "endPc": 3070,
    "status": "Key: CLEAR → 350000 steps (peak 8621px)",
    "firstBlocks": [
      "0x08C331",
      "0x05C634",
      "0x05C67C",
      "0x08C339",
      "0x06CE73",
      "0x06CE7F",
      "0x06CE7B",
      "0x000038",
      "0x0006F3",
      "0x000704",
      "0x000710",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x00171E"
    ],
    "lastBlocks": [
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
    ],
    "hotBlocks": [
      {
        "pc": "0x000A92",
        "count": 65024
      },
      {
        "pc": "0x000BFE",
        "count": 50573
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
          "totalSteps": 888233
        }
      },
      {
        "block": 3508,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 5370,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 14677,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 14683,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 14684,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 14685,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 14691,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 14692,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 14693,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 14699,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 14700,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 195498,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 197082,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 197083,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 198075,
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
          "totalSteps": 888233
        }
      },
      {
        "block": 199723,
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
          "totalSteps": 888233
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
        "block": 945,
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
        "block": 2916,
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
        "block": 3509,
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
        "block": 5370,
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
    "label": "NoAutoRun Digit2",
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
    "startPc": 3070,
    "endPc": 2706,
    "status": "Key: 2 → 300000 steps (peak 3356px)",
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
        "count": 40076
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 3031,
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
          "totalSteps": 1238233
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 6502,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 15832,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 15838,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 15839,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 15840,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 15846,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 15847,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 15848,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 15854,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 15855,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 196653,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 198237,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 198238,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 199321,
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
          "totalSteps": 1238233
        }
      },
      {
        "block": 201363,
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
          "totalSteps": 1238233
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
        "block": 2423,
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
        "block": 3032,
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
        "block": 6502,
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
        "block": 198378,
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
        "block": 198379,
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
        "block": 198381,
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
        "block": 199322,
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
        "block": 199776,
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
        "block": 199816,
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
        "block": 201363,
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

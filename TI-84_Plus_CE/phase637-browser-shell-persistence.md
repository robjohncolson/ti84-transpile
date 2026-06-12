# Phase 637: Browser Shell Token/Tuple Persistence

Probe: `probe-phase637-browser-shell-persistence.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase637-browser-shell-persistence.mjs`  
Exit: 1

## Summary

- !! EOL/Escape path did not restore the coherent tuple: `D02A29=0x0000 D0243D=0x000000 D02A40=0x000000`.
- !! Digit2 path did not restore token output buffers: `D001B8=0x00 D001D3=0x00`.
- *** Preserve Display stayed active and VRAM remained non-white after both key bursts: EOL=3039, Digit2=3040.

## Browser States

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
    "vramPixels": 3031,
    "errors": [],
    "infoLogTail": [
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
    "vramPixels": 3039,
    "errors": [],
    "infoLogTail": [
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
    "vramPixels": 3040,
    "errors": [],
    "infoLogTail": [
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
  "errors": []
}
```

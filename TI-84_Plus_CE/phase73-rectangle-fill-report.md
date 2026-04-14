# Phase 73: 0x046aff Analysis (Manual Trace by CC)

## Disassembly of 0x046aff

```asm
0x046aff: ld (0x002ac0), hl       ; save HL (presumably fill color or config)
0x046b03: ld bc, 0x0000ef         ; BC = 239 (screen height - 1)
0x046b07: ld hl, 0x000000         ; HL = 0 (origin row)
0x046b0b: ld de, 0x00013f         ; DE = 319 (screen width - 1)
0x046b0f: call 0x09ef44           ; call the actual rect helper
0x046b13: ret
```

**Verdict**: 0x046aff is NOT a general rectangle-fill primitive. It's a hard-coded **"clear full screen"** helper — parameters are fixed at (0,0) to (319,239). The HL argument is probably a fill color/config that gets stashed to 0x002ac0 (a ROM address in our runtime — write gets silently dropped by ROM write-protect, but on real hardware this is probably mapped to a RAM shadow region).

## Callers: 11 direct

| Caller PC | Containing block |
|-----------|------------------|
| 0x045c85 | 0x045c7d |
| 0x045c95 | 0x045c91 |
| 0x045ca5 | 0x045ca1 |
| 0x045cb5 | 0x045cb1 |
| 0x045cc1 | 0x045cbd |
| 0x045dc1 | 0x045db9 |
| 0x045e5c | 0x045e54 |
| 0x045f1e | 0x045f16 |
| 0x046168 | 0x046160 |
| 0x046252 | 0x04624a |
| 0x046858 | 0x046850 |

All callers are in 0x045cxx-0x046xxx region — the hardware diagnostic / test screens we already probed in Phase 64 (keyboard_test, flash_test, test_halt, etc.). They all call the clear-screen helper before drawing their own test UI.

## Verdict

0x046aff is a **clear-screen helper** used by the diagnostic screen family. It is NOT the rectangle-fill primitive we were looking for. The top/bottom bar fills we saw in Phase 69 (0x046878, 0x03dc1b) are NOT calls to 0x046aff — they're a different code path.

The 12800 px "bottom bar" render from Phase 69 is probably the diagnostic full-screen clear running against an already-partially-drawn screen, with the clear only covering 40×320 cells before hitting max_steps. Not a rectangle fill at all.

## Next Steps

Skip the rectangle-fill primitive hunt. Pivot to:
- **Phase 75+**: Find TI-OS token rendering helpers that use mode-state RAM vars (Phase 74 found the TI-BASIC token table at 0x0a0461 with "Normal"/"Float"/"Radian"/etc. entries, each preceded by a 1-byte length — the home status bar almost certainly uses this table, not plain strings).

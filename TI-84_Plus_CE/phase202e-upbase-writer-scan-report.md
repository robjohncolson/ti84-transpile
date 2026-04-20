# Phase 202E - LCD Upbase Writer Static Scan

Generated: 2026-04-20T02:55:10.600Z

Scanned **143547** pre-lifted blocks from `ROM.transpiled.js`.

## Goal

Find every ROM location that could write to the LCD upbase register at
`0xE00010-0xE00012`. Prior ISR probes (phase 202C) confirmed the interrupt
service routines never touch upbase, so the writer is a one-shot init routine.

## Detection rules

| Reason | Pattern |
|---|---|
| `literal-store` | `ld (0xe000{10,11,12}), ...` — direct 24-bit ADL memory store |
| `literal-addr`  | Any instruction whose dasm contains `0xe000{10,11,12}` as a literal operand (typically `ld hl,0xe00010` priming a later `ld (hl), r`) |
| `port-io`       | Block contains `ld bc, 0x??d01{0,1,2}` followed by `out (c), r` — eZ80 port-write idiom that hits MMIO `0xE000{10,11,12}` |
| `z80-short-store` | Z80-mode block with `ld (0x001{0,1,2}), reg` — MBASE=0xE0 makes this an upbase write. **Primary TI-84 CE idiom.** |
| `z80-short-load-imm` | Z80-mode block with `ld reg, 0x001{0,1,2}` — likely priming a pointer to upbase |

## Summary

Total candidate blocks: **9**
- `literal-store` matches: **0**
- `literal-addr` matches: **0**
- `port-io` matches: **0**
- `z80-short-store` matches: **2**
- `z80-short-load-imm` matches: **7**

## Highlighted candidates (OS-init 0x08C000-0x08D000 or LCD-init 0x005C00-0x006200)

| Block startPc | Reason | First hit PC | Dasm |
|---|---|---|---|
| 0x005c2d **[LCD-init]** | z80-short-store | 0x005c34 | `ld (0x000010), hl` |

## All candidates

| Block startPc | Hit PC | Match reason | Dasm | Callers |
|---|---|---|---|---|
| 0x005c2d **[LCD-init]** | 0x005c34 | z80-short-store | `ld (0x000010), hl` | - |
| 0x00628d | 0x006294 | z80-short-store | `ld (0x000010), hl` | - |
| 0x0099f6 | 0x009a00 | z80-short-load-imm | `ld bc, 0x000010` | - |
| 0x00e220 | 0x00e227 | z80-short-load-imm | `ld bc, 0x000010` | - |
| 0x00e246 | 0x00e24c | z80-short-load-imm | `ld bc, 0x000010` | 0x00e25a 0x00e25b 0x00e28c 0x00e28b |
| 0x00fc3a | 0x00fc3a | z80-short-load-imm | `ld bc, 0x000010` | - |
| 0x00fcfe | 0x00fd30 | z80-short-load-imm | `ld bc, 0x000012` | - |
| 0x00fd83 | 0x00fd83 | z80-short-load-imm | `ld bc, 0x000010` | - |
| 0x00fda5 | 0x00fda5 | z80-short-load-imm | `ld bc, 0x000011` | - |

---

Script: `TI-84_Plus_CE/phase202e-upbase-writer-scan.mjs`.

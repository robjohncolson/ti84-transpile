# Ground-Truth RAM Captures — TI-84 CE (OS 5.8.2.0029)

Captured 2026-06-25 from the live **CEmu-WASM** instance inside the TI-84 trainer
(`robjohncolson.github.io/.../ti84-trainer-v2/standalone.html`), via the CEmu export
`emu_save(type, path)` (type **2 = RAM** `0xD00000-0xD657FF` = 0x65800 bytes; type 1 = 4MB
flash; type 0 = full image). ROM version **5.8.2.0029 — exact match** with this repo's ROM,
so every address lines up and file offset `i` = address `0xD00000 + i`.

## Files

| File | State | Size |
|---|---|---|
| `realram-home-digit3-D00000-D657FF.bin` | Home screen, digit `3` typed (live edit line, **before** CLEAR) | 415,744 |
| `realram-home-afterCLEAR-D00000-D657FF.bin` | Same, **after** pressing CLEAR | 415,744 |
| `realimage-home-digit3-full.bin` | Full CEmu save state (flash+RAM+CPU regs) for digit-typed state | 5,156,971 |

## Headline finding — the `0x08F54B` "engine" target was a ghost

The proven in-memory recipe (`probe-phase629`/`phase833`) reaches `0x08F54B` only because it
hand-seeds a **non-physical** edit context (`D0243A=0xD1A8F8`, `D0243D=0xD2A7E1`). The real
calculator's edit context is **`D0243A` base `0xD1A8CC`, `D0243D=0xD2A83E`** — which **matches
the browser/transpile coldboot** (phase834: `D0243A=0xD1A8CC`, `D0243D=0xD2A83E`). So:

- The browser/transpile edit-context is **faithful to real hardware**.
- The `0x08F54B` tuple-save path the loop chased (phase 743→837) is reachable only from the
  synthetic recipe state — it is **not** on the real CLEAR path. Stop targeting it.

## What real CLEAR actually does (before → after delta)

Minimal and clean — it does **not** wipe or switch context:

| field | before (digit) | after CLEAR |
|---|---|---|
| `D0243A` edit cursor | `0xD1A8CD` | `0xD1A8CC` (cursor retracts to line base) |
| `D02A29` | `0x000C` | `0x0000` |
| `D007CA` cxMain | `0x0585E9` | `0x0585E9` (unchanged) |
| VAT (`D02590`/`D0259D`), `D007E0`, flags | — | unchanged |

Changed regions = the small edit descriptor area + **VRAM rows repainted at `0x280` (one row)
intervals** (`0xD45C80`, `0xD45F00`, `0xD46180`, …). CLEAR retracts the cursor and **repaints
the entry line**. That's the whole operation.

## Root cause of the transpile blocker

The transpile's CLEAR from this faithful state **spins in the `0x006Dxx` loop and max-steps**
(phase837). `0x006Dxx` is the OS's **display/transfer status-poll loop** (phase643) that runs
during the entry-line repaint the real delta shows. On hardware the LCD/transfer status signals
"done"; `peripherals.js` never sets that status, so the OS polls forever.

**→ The real frontier is a peripheral/MMIO gap: emulate the status the `0x006Dxx` loop polls so
CLEAR completes the clean entry-line repaint instead of spinning.** Validate against
`realram-home-afterCLEAR-*.bin` (the target post-CLEAR state).

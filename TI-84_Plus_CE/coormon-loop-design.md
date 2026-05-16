# CoorMon Loop Integration Design

## Goal

Add an opt-in browser-shell execution mode that drives the decoded TI-84 Plus CE OS event loop through CoorMon at `0x08C331`. The existing direct mode stays the default and remains unchanged for the current shell workflow.

## Runtime Split

- Direct mode: keep the current browser shell behavior.
  - Boot from `0x000000`.
  - Translate browser keys through the legacy direct path.
  - Continue stepping from `lastPc` / `lastMode`.
- CoorMon mode: new experimental path.
  - Skip boot entirely.
  - Seed the minimum RAM/register prerequisites for CoorMon.
  - Re-enter `0x08C331` from `requestAnimationFrame`.
  - Write raw scan codes to `0xD0058E` instead of translated key codes.

The browser toggle is latched at Boot time so the active runtime does not change underneath an already-created executor.

## Boot-Time Prerequisites

When CoorMon mode is enabled, the shell still loads the ROM bytes and creates the executor, but it does not call `runFrom(0x000000, 'z80', ...)`.

Before each CoorMon slice, the shell reasserts:

- `cpu.madl = 1`
- `cpu.mbase = 0xD0`
- `cpu.iy = 0xD00080`
- `cpu.sp = 0xD1A87E`
- `mem[0xD007CA..0xD007CC] = 0x058241` little-endian

The shell also clears or rewrites `mem[0xD0058E]` with the current raw scan code before calling CoorMon.

Re-seeding the state each frame is intentional. The shell is not doing a full OS boot or full RAM init yet, so the repeated seed keeps the experiment deterministic while the rest of the runtime is still incomplete.

## Keyboard Path

The authoritative mapping comes from `keyboard-matrix.md`.

- Scan code format: `(group_index << 4) | bit`
- `group_index = 7 - sdk_group`
- `KEY_MAP` in `ti84-keyboard.js` already stores the reversed matrix group index, so the browser shell can derive the raw scan code directly from `group` and `bit`

Examples:

- `ENTER` -> group 1, bit 0 -> `0x10`
- `GRAPH` -> group 6, bit 0 -> `0x60`
- `MODE` -> group 6, bit 6 -> `0x66`

One known edge case remains: `DOWN` is group 0, bit 0, so its raw scan code is `0x00`, which is indistinguishable from "no key" in the shared byte buffer.

## Frame Loop

Pseudo-flow:

```text
requestAnimationFrame(frame):
  if runtimeMode != coormon:
    run direct stepping path
    return

  scan = first pressed TI key -> raw scan code
  mem[0xD0058E] = scan
  seed IY/SP/ADL/cxMain
  executor.runFrom(0x08C331, 'adl', maxSteps=50000, maxLoopIterations=10000)
  read VRAM / sync LCD MMIO
  render canvas
```

The browser shell keeps the existing `AutoRun` button. In CoorMon mode, `AutoRun` becomes the requestAnimationFrame driver for the `0x08C331` slices.

## Non-Goals

- No boot from `0x000000`
- No attempt to make the home screen fully render yet
- No edits to `cpu-runtime.js`, `peripherals.js`, or the transpiler

## Expected Limitations

- Missing RAM initialization means the loop may not produce a usable home screen yet.
- The event loop wiring is the target here, not full OS fidelity.
- Because direct mode remains the default, regressions are contained to the explicit experimental toggle.

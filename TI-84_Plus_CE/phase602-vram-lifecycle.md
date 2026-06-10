# Phase 602 VRAM Lifecycle

This phase adds `probe-phase602-vram-zero-tracker.mjs`, a focused probe for the interval after the observed display peak and before halt.

## What The Probe Records

- Boots from `0x09DD62` for 300K steps with timer off.
- Paints through `0x058241` for 400K steps with timer on.
- Injects the `2` key using the phase 601 key recipe.
- Runs the outer loop from `0x08C331`, with return `0x0019B5` pushed and `D008E0` seeded.
- Samples VRAM non-white pixel count every 1000 steps from 265K through 280K, or until halt.
- Detects the exact instruction step where VRAM changes from non-zero to zero.
- At the transition, records PC before and after the step, stack bytes from `SP`, current block when exposed by the runtime, `D007CA`, nearby opcode bytes, and hits of `0x0018F8`.

## Expected Command

```powershell
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase602-vram-zero-tracker.mjs
```

## Result

Exact transition step and PC: pending probe execution.

Mechanism: pending probe execution. The probe classifies direct `ED B0`/`ED B8`/`ED A0`/`ED A8` opcodes as LDIR-family activity, records whether `0x0018F8` runs again, and otherwise reports the transition as non-LDIR or helper-mediated writes for follow-up against the generated block.

Assessment: pending probe execution. If `0x0018F8` is not hit a second time and the transition occurs inside a display clear path or post-loop teardown helper, the blank final VRAM is likely an artifact of the lifted run boundary rather than the stable calculator display. If the transition happens in ordinary foreground OS code before halt, with no later repaint scheduled, it should be treated as the real display state.

# Phase 25G-b - Two-Phase ISR Event-Loop Probe

## Diff Summary

- `TI-84_Plus_CE/probe-phase25g-eventloop.mjs`
  - Reworked the probe from a single ISR entry into two explicit passes:
    - Phase A: keyboard IRQ active with ENTER queued
    - Phase B: no keyboard IRQ after the system flag and callback are re-armed
  - Preserved the existing boot/setup logging and per-block inline trace output.
  - Added a between-phase re-arm step that:
    - rewrites `0xD02AD7` back to `0x0019BE`
    - re-sets `mem[0xD0009B] |= 0x40`
    - releases the keyboard matrix back to `0xFF`
    - drops the keyboard source with `setKeyboardIRQ(false)`
    - clears the keyboard interrupt-controller latch via `out (0x500A), 0x08`
    - restores the keyboard enable-mask byte via `out (0x5006), 0x08`
    - clears the executor-level pending IRQ flag with `acknowledgeIRQ()`
  - Added:
    - `REACHED 0x00B608` logging on target entry
    - immediate stop on target hit
    - Phase B newly visited block listing
    - full Phase B trace dump after the summary

## Verification Status

- Not run in this subagent.
- Subagent Mode explicitly forbids running the updated probe, the golden regression, or any other post-patch verification command after editing.
- Because of that constraint, the following are still pending for the parent agent:
  - whether Phase B actually reaches `0x00B608`
  - the concrete Phase B block trace from a successful run
  - the pasted successful console output
  - the `probe-phase99d-home-verify.mjs` post-edit `26/26` regression line

## What The Updated Probe Emits

- Phase A summary:
  - block trace
  - termination / final PC
  - callback + `0xD0009B` state after the keyboard-handling ISR pass
- Between phases:
  - the exact re-arm state after `0xD02AD7`, `0xD0009B`, keyboard IRQ, and interrupt-controller cleanup
- Phase B summary:
  - block trace
  - `REACHED 0x00B608` line on entry to the target block
  - newly visited blocks relative to Phase A
  - full Phase B trace dump suitable for pasting into this report

## Parent-Agent Fill-In Checklist

- Reached `0x00B608`: pending run
- Full Phase B block trace: emitted by the updated probe under `Phase B Full Trace`
- Successful console output: pending run
- Golden regression line: pending run of `probe-phase99d-home-verify.mjs`

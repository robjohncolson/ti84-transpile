# Phase 56 IRQ Probe Report

## Hypothesis Verdict

**Verdict: no, not from this post-init setup.**

Using the existing Phase 14 IRQ infrastructure plus a post-boot RAM image from `0x08C331 (= CoorMon)`, forcing the callback pointer to `0x0019BE`, setting `0xD0009B |= 0x40`, `cpu.mbase = 0xD0`, `IM 1`, and `IFF1=1` was **not** enough to drive the OS event loop end-to-end.

The probe resumed through the event-wait helper at `0x001794` and terminated after **32 steps** in both passes, with:

- `irqCount=0`
- `vramWrites=0`
- `lastPc=0xFFFFFF`
- identical control flow with and without the keyboard IRQ pass

That means the current setup still falls out through the sentinel return path before the timer can deliver a usable IM1 dispatch.

## Output Snippet

```text
=== Setup ===
boot: steps=8804 termination=halt lastPc=0x0019b5 lastMode=adl
init: steps=691 termination=missing_block lastPc=0xffffff callback=0xffffff sysFlag=0xff

=== Pass 1: timer IRQ only ===
steps=32 termination=missing_block lastPc=0xffffff lastMode=adl
uniqueBlocks=30 unique4kRegions=2 irqCount=0
newBlocksBeyondBoot=30 newRegionsBeyondBoot=1 vramWrites=0 vramNonZero=153600

=== Pass 2: timer IRQ + keyboard IRQ injection ===
steps=32 termination=missing_block lastPc=0xffffff lastMode=adl
uniqueBlocks=30 unique4kRegions=2 irqCount=0
keyboardIRQInjectedAtStep=not_reached (run ended before 10000 steps)
```

## New Coverage

- New blocks beyond the Phase 30 boot trace: **30**
- New 4KB regions beyond the Phase 30 boot trace: **1** (`0x003xxx`)
- Highest-hit new blocks:
  - `0x003d28:adl` x2
  - `0x003d2e:adl` x2
  - `0x001794:adl` x1
  - `0x001778:adl` x1
  - `0x00179a:adl` x1
  - `0x001296:adl` x1
  - `0x0012a7:adl` x1
  - `0x0012ac:adl` x1
  - `0x0012c2:adl` x1
  - `0x0012c7:adl` x1

The new coverage is helper/control-flow code around `0x001794` plus `0x003cxx-0x003dxx`. It does **not** show an actual IRQ vector entry or event-loop body reached via timer dispatch.

## Missing Blocks

Top missing-block hits by frequency:

1. `0xFFFFFF:adl` x1

This is the synthetic sentinel return address used to let helper calls exit cleanly. It is **not** a ROM seed/coverage blocker.

## VRAM Summary

- Additional VRAM writes during the probe: **0**
- Non-zero VRAM bytes present in the loaded post-init image: **153600**
- Result: the probe preserved the existing framebuffer contents but produced **no new draw activity**

## Recommended Next Seeds / Follow-up

No new ROM seed was identified by this probe. The only missing target was the sentinel `0xFFFFFF`.

The next investigation should focus on the **resume path**, not the transpiler:

- Try the single-instruction wait point at `0x001783` (`ei; halt`) with a synthetic caller frame, instead of entering at `0x001794`
- Try a direct forced IM1 entry at `0x000038` from the same post-init RAM snapshot to confirm whether the ISR can still reach `0x0019BE`
- If that works, inspect which caller/frame state is missing between the natural wait helper and the vector path

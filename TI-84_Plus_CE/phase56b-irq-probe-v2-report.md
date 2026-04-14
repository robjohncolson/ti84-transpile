# Phase 56B IRQ Probe V2 Report

## Verdict

**Forced IM1 entry does reach `0x0019BE`, but it does not sustain the loop.**

The direct IM1 probe from the same post-init RAM snapshot proves the ISR path is still live:

- `0x000038 -> 0x0006F3 -> 0x000704 -> 0x000710 -> 0x001713 -> 0x001717 -> 0x001718 -> 0x0008BB`
- From there execution reaches the event-loop body at `0x0019BE` and continues through:
  - `0x0019EF`
  - `0x001A17`
  - `0x001A23`
  - `0x001A2D`
  - `0x001A32`

But all three passes still terminate after **21 steps** via the synthetic `0xFFFFFF:adl` missing block, with:

- `vramWrites=0`
- `newBlocksBeyondPhase30=15`
- `new4kRegionsBeyondPhase30=0`
- no second IRQ injection reached
- no keyboard IRQ injection reached

So the follow-up hypothesis is now tighter than Phase 56:

- Phase 56 proved the callback-style helper path at `0x001794` fell out through the sentinel immediately.
- Phase 56B proves the ISR itself **can** still reach `0x0019BE`.
- The remaining blocker is **what happens after that first event-loop slice returns**. The manual stack frame still unwinds into `0xFFFFFF`, so the loop cannot cycle long enough to test repeated interrupts.

## Output Snippet

```text
=== Setup ===
boot: steps=8804 termination=halt lastPc=0x0019b5 lastMode=adl
boot unique blocks=261 unique4kRegions=6
init: steps=691 termination=missing_block lastPc=0xffffff lastMode=adl
postInit callback=0xffffff sysFlag=0xff deepInitFlag=0xff

=== Pass 1: forced IM1 entry once ===
steps=21 termination=missing_block lastPc=0xffffff lastMode=adl
uniqueBlocks=15 unique4kRegions=2 newBlocksBeyondPhase30=15
missingBlocks=1 vramWrites=0 vramNonZero=153600
eventLoopReached=true eventLoopHits=2 firstEventLoopStep=9
manualIrqs=initial_forced_im1@0->0x0019be
secondIrqInjectedAt=not_reached
keyboardInjectedAt=not_reached
callback=0xffffff sysFlag=0xbf deepInitFlag=0xff

=== Pass 2: forced IM1 entry + second IRQ at step 25000 ===
steps=21 termination=missing_block lastPc=0xffffff lastMode=adl
stoppedBeforeMilestone=manual_irq@25000

=== Pass 3: pass 2 + keyboard IRQ at step 10000 ===
steps=21 termination=missing_block lastPc=0xffffff lastMode=adl
stoppedBeforeMilestone=keyboard@10000
```

## Pass Summary

| Pass | Steps | Termination | Reached `0x0019BE` | Unique blocks | New blocks beyond Phase 30 | VRAM writes | Milestone result |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Pass 1 | 21 | `missing_block` at `0xFFFFFF:adl` | Yes, 2 hits | 15 | 15 | 0 | no scheduled milestone |
| Pass 2 | 21 | `missing_block` at `0xFFFFFF:adl` | Yes, 2 hits | 15 | 15 | 0 | ended before `manual_irq@25000` |
| Pass 3 | 21 | `missing_block` at `0xFFFFFF:adl` | Yes, 2 hits | 15 | 15 | 0 | ended before `keyboard@10000` |

All three passes are behaviorally identical because the first forced entry ends almost immediately.

## New Blocks Discovered

These are the **15 unique blocks beyond the Phase 30 boot trace** hit by the forced IM1 probe:

1. `0x000038:adl`
2. `0x0006f3:adl`
3. `0x000704:adl`
4. `0x000710:adl`
5. `0x000719:adl`
6. `0x0008bb:adl`
7. `0x001713:adl`
8. `0x001717:adl`
9. `0x001718:adl`
10. `0x0019be:adl`
11. `0x0019ef:adl`
12. `0x001a17:adl`
13. `0x001a23:adl`
14. `0x001a2d:adl`
15. `0x001a32:adl`

Hot blocks from the run:

- `0x0019be:adl` x2
- `0x0019ef:adl` x2
- `0x001a17:adl` x2
- `0x001a23:adl` x2
- `0x001a2d:adl` x2
- `0x001a32:adl` x2
- every other new block above x1

### Region Notes

- Unique 4 KB regions visited during the pass: `2`
- New 4 KB regions beyond the Phase 30 boot trace: **none**

That means the probe found new control-flow inside already-known `0x000xxx` and `0x001xxx` areas, not a new ROM region.

## Missing Blocks

Top missing-block list:

1. `0xffffff:adl` x1

There were no other missing blocks.

## Analysis

### What the probe proves

The important Phase 56 follow-up question is answered:

- A direct forced IM1 entry **does** drive the dispatcher far enough to reach `0x0019BE`.
- The proven path from the prior phase is now observed in the executor:
  - IM1 vector entry at `0x38`
  - flash-status gate at `0x6F3`
  - callback/system-flag gate at `0x704`
  - dispatch block at `0x710`
  - hand-off through `0x1713/0x1717/0x1718/0x8BB`
  - event-loop slice at `0x19BE` and the next five blocks after it

So the ISR dispatch path itself is no longer the blocker.

### What still fails

The loop still unwinds to the sentinel almost immediately:

- termination is still `0xFFFFFF:adl`
- the callback slot ends the pass back at `0xFFFFFF`
- `sysFlag` drops from `0xFF` to `0xBF`
- there are no new VRAM writes

That implies the forced return frame is enough to get **into** the loop, but not enough to keep a valid caller chain alive after the first slice executes.

### Why passes 2 and 3 did not add coverage

The scheduled follow-up injections never fired:

- Pass 2 ended before step `25000`, so the second manual IRQ was never injected.
- Pass 3 ended before step `10000`, so the keyboard IRQ was never armed.

This means the next useful experiment is not “more interrupts”; it is “a better post-`0x0019BE` return/caller context.”

## VRAM / Display

- Additional VRAM writes: `0`
- Non-zero VRAM bytes in the loaded post-init image: `153600`

The framebuffer contents from the post-init snapshot remain intact, but the forced IM1 entry does not produce any new draw activity.

## Conclusion

Phase 56B successfully narrows the problem:

- **Yes**: forced IM1 entry can still reach `0x0019BE` and a short run of event-loop blocks beyond it.
- **No**: it still cannot stay alive long enough to cycle, repaint, or accept a second synthetic IRQ.

The next probe should focus on the caller/return state around `0x0019BE` and `0x001A32`, especially whatever restores the callback pointer and causes the unwind back to `0xFFFFFF`.

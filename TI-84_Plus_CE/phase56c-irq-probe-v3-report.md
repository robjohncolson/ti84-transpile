# Phase 56C IRQ Probe V3 Report

## Verdict

**Yes. The loop sustains once the forced IM1 entry uses a real return frame.**

Phase 56B was unwinding only because the manually pushed return PC was the synthetic sentinel `0xFFFFFF`. In Phase 56C, pushing the real boot halt block `0x0019B5` before the first forced IM1 entry and then re-pushing the halt PC after each clean return keeps the ISR / event-loop slice alive across repeated manual injections.

The result is stable:

- Pass 1 completed **20/20** IRQ injections and halted cleanly at `0x0019B5` every time.
- Pass 2 also completed **20/20** injections.
- There was **no unwind to `0xFFFFFF`** in either pass.
- There were **no VRAM writes** in either pass.
- The stack fully unwound on every cycle: halt stack depth stayed at `0x000000`.

## Headline Numbers

| Pass | Successful IRQ cycles | Total steps | Stop reason | Unique blocks | New blocks beyond Phase 56B | Missing blocks | VRAM writes |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Pass 1: real return frame only | 20 / 20 | 320 | `completed_target_injections` | 16 | 1 | 0 | 0 |
| Pass 2: keyboard IRQ after 10 successful cycles | 20 / 20 | 321 | `completed_target_injections` | 19 | 4 | 0 | 0 |

## Output Snippet

```text
=== Setup ===
boot: steps=8804 termination=halt lastPc=0x0019b5 lastMode=adl
init: steps=691 termination=missing_block lastPc=0xffffff lastMode=adl
postInit callback=0xffffff sysFlag=0xff deepInitFlag=0xff

[irq 1] inject reason=initial_real_return_frame resumePc=0x0019b5 sp=0xd0fff5
[irq 1] event step=9 pc=0x0019be mode=adl
[irq 1] event step=10 pc=0x0019ef mode=adl
[irq 1] event step=11 pc=0x001a17 mode=adl
[irq 1] event step=12 pc=0x001a23 mode=adl
[irq 1] event step=13 pc=0x001a2d mode=adl
[irq 1] event step=14 pc=0x001a32 mode=adl
[irq 1] result steps=16 termination=halt lastPc=0x0019b5 lastMode=adl vramWrites=0 sysFlag=0xff->0xbf stackDepth=0x000000

[irq 20] inject reason=reinject_after_halt resumePc=0x0019b5 sp=0xd0fff5
[irq 20] event step=313 pc=0x0019be mode=adl
[irq 20] event step=314 pc=0x0019ef mode=adl
[irq 20] event step=315 pc=0x001a17 mode=adl
[irq 20] event step=316 pc=0x001a23 mode=adl
[irq 20] event step=317 pc=0x001a2d mode=adl
[irq 20] event step=318 pc=0x001a32 mode=adl
[irq 20] result steps=16 termination=halt lastPc=0x0019b5 lastMode=adl vramWrites=0 sysFlag=0xbf->0xbf stackDepth=0x000000

[Pass 2: keyboard IRQ after 10 successful cycles] keyboard IRQ armed before injection 11
[irq 11] event step=172 pc=0x001a5d mode=adl
[irq 11] event step=173 pc=0x001a70 mode=adl
[irq 11] event step=174 pc=0x001a75 mode=adl
[irq 11] result steps=17 termination=halt lastPc=0x0019b5 lastMode=adl vramWrites=0 sysFlag=0xbf->0xbf stackDepth=0x000000
```

## What Changed From Phase 56B

Phase 56B reached `0x0019BE` and the first five event-loop blocks, but it unwound to `0xFFFFFF` after 21 steps because the return frame itself was fake.

Phase 56C changes only the return-frame model:

- first injection pushes `0x0019B5`
- each later injection pushes the current halt PC (`0x0019B5` in practice)
- execution returns from the ISR to the real halt block instead of the sentinel

That is enough to convert the probe from a one-shot slice into a sustained, repeatable loop.

## Sustained Loop Behavior

### Pass 1

The loop shape is identical across all 20 injections:

1. `0x000038`
2. `0x0006F3`
3. `0x000704`
4. `0x000710`
5. `0x001713`
6. `0x001717`
7. `0x001718`
8. `0x0008BB`
9. `0x0019BE`
10. `0x0019EF`
11. `0x001A17`
12. `0x001A23`
13. `0x001A2D`
14. `0x001A32`
15. `0x0019B5`

The new stable block relative to Phase 56B is:

- `0x0019B5:adl`

That is the real halt / re-entry anchor the prior phase was missing.

### Pass 2

Pass 2 is identical except for injection 11, after arming the keyboard IRQ:

- `0x001A23` / `0x001A2D` are skipped once
- execution takes a one-cycle detour through:
  - `0x001A5D`
  - `0x001A70`
  - `0x001A75`
- control then rejoins `0x001A32` and halts cleanly at `0x0019B5`

After that one detour, injections 12 through 20 return to the normal Pass 1 path.

## New Blocks Beyond Phase 56B

### Pass 1

Only one block is new beyond Phase 56B:

1. `0x0019B5:adl`

### Pass 2

Pass 2 adds four blocks beyond Phase 56B:

1. `0x0019B5:adl`
2. `0x001A5D:adl`
3. `0x001A70:adl`
4. `0x001A75:adl`

This means Phase 56C extends proven coverage in the requested range:

- **new `0x001axxx` blocks found:** `0x001A5D`, `0x001A70`, `0x001A75`
- **new `0x001bxxx`-`0x001fxxx` blocks found:** none

## Missing Blocks

Top 10 missing blocks:

1. none

Both passes stayed entirely inside lifted code. The `0xFFFFFF` unwind disappears once the return frame is real.

## VRAM / Display

- VRAM writes per injection: **all zero**
- Total VRAM writes in Pass 1: **0**
- Total VRAM writes in Pass 2: **0**

So the sustained loop still does not reach any new rendering path.

## sysFlag, Stack, and Callback State

### sysFlag (`0xD0009B`)

- Initial post-init value: `0xFF`
- After IRQ 1: `0xBF`
- After IRQs 2-20: stays `0xBF`

This matches the Phase 56B observation that bit 6 is consumed on the first pass and then remains cleared.

### Stack depth at halt

- Every clean halt returned with stack depth `0x000000`

That is the strongest sign the new loop is structurally sound: each IRQ frame is balanced and fully unwinds before the next injection.

### Callback slot

- Final callback remains `0x0019BE`

The callback pointer stays pinned to the event-loop entry for the full run.

## Interpretation

Phase 56C answers the open question from Phase 56B:

- the ISR path itself was already valid
- the blocker was not dispatch
- the blocker was the synthetic return frame

With the real return frame in place, the executor can now model repeated wake-halt-wake cycles exactly the way this path wants to run.

The keyboard test also shows there is at least one alternate event path available after the loop is stabilized, but it is still narrow:

- it adds one short `0x001A5D -> 0x001A70 -> 0x001A75` detour
- it does not produce VRAM activity
- it does not unlock deeper `0x001bxxx`-`0x001fxxx` coverage yet

## Conclusion

Phase 56C is a clear success:

- the loop now sustains
- 20 successive IRQ injections complete cleanly
- no `0xFFFFFF` unwind remains
- no missing blocks appear
- the keyboard experiment activates one additional `0x001axxx` branch

The next useful probe is no longer “can it cycle?” That is now proven. The next step is to seed stronger input / event conditions around the stabilized `0x0019BE -> 0x001A32 -> 0x0019B5` loop and hunt for the first branch that produces new VRAM writes or reaches deeper `0x001bxxx+` code.

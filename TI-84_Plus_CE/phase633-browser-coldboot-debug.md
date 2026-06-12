# Phase 633 - Browser Coldboot Debug

## Summary

- Reproduces the `browser-shell.html` coldboot recipe outside the browser and compares it to the proven `0x09DD62` launch-home init recipe.
- The browser recipe never runs the warm-idle `0x0019BE` continuation or `0x09DD62` before starting AutoRun. It enters the event-loop frame with `D007CA=0x000000` and VAT pointers still zero.
- The first browser-style AutoRun frame reproduces the observed blocker exactly: `50000` steps, `max_steps`, `PC=0x003D6B`.
- The comparison side confirms the omitted warm-idle stage exists and reaches `0x0019B5`; this probe is intentionally conservative and does not claim to fully recreate the later live home-screen state.

## Results

| Step | Term | Steps | PC | D007CA | D007E0 | D008E0 | D02590 | D0259A | D0259D |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| browser phase1 0x000000 | max_steps | 20000 | 0x001cc0 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| browser phase2 0x08C331 | max_steps | 100000 | 0x000a92 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| browser phase3 0x0802B2 | max_steps | 100 | 0x0158bc | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| browser first 50K frame | max_steps | 50000 | 0x003d6b | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| proven phase1 0x000000 | max_steps | 20000 | 0x001cc0 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| proven phase2 0x08C331 | max_steps | 100000 | 0x000a92 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| proven phase3 0x0802B2 | max_steps | 100 | 0x0158bc | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| proven warm idle 0x0019BE | halt | 192290 | 0x0019b5 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| proven launch-home 0x09DD62 | halt | 275843 | 0x0019b5 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| proven repaint 0x058241 | max_steps | 300000 | 0x084723 | 0x0585e9 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |

## Interpretation

The headless browser probe waits for the transient status text `Coldboot complete`, but `initializeColdbootRuntime()` immediately calls `startAutoRunLoop()`. The next animation-frame run overwrites the status with `Coldboot: 50000 steps, max_steps | ... PC=0x003d6b`, so the harness can miss completion even when initialization returned.

More importantly, the browser coldboot state is not equivalent to the current post-session-596+ probe boot state. It uses the older shortcut sequence `0x000000 -> 0x08C331 -> 0x0802B2`, manually seeds event-loop RAM, and starts at `0x003A73`. That sequence leaves `D007CA=0x000000` and VAT pointers at zero in this probe. Starting AutoRun from that state sends the shell into the `0x003D6B` max-steps loop.

## Next Fix Direction

Update `browser-shell.html` coldboot in two steps: first, stop auto-starting AutoRun before a stable coldboot-ready status can be observed by the harness; second, replace the old event-loop seed with the current proven multi-key setup path from the phase597+ probes rather than entering `0x003A73` with zeroed `D007CA`/VAT state.

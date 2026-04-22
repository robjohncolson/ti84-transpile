# Phase 102A - Status-Dot Renderer Wiring

## Diff Summary

- `probe-phase99d-home-verify.mjs`
  - Inserted a CPU-restored `runFrom(0x0a3301)` stage between `0x0a2b72 (= PutBPat)` and `0x0a29ec (= RStrCurRow)`.
  - Added top-bar cluster counters for `r3-6 c146-150` and `r3-6 c306-310`.
  - Added PASS/FAIL assertions for both clusters and folded them into the probe exit code.
  - Extended the generated `phase99d-report.md` output with before/after/final cluster counts.
- `browser-shell.html`
  - Inserted the same CPU-restored `runFrom(0x0a3301)` stage inside `showHomeScreen()`.
  - Kept the stage order as background -> status dots -> text -> history -> entry line.
  - Included the status-dot stage in the composite step total and status text.

## Verification Status

- Not run in this subagent.
- Subagent Mode explicitly forbids running `node TI-84_Plus_CE/probe-phase99d-home-verify.mjs`, so the post-patch `26/26` regression re-check is still pending in the parent agent.
- The updated probe now enforces two additional assertions:
  - left cluster `r3-6 c146-150` must gain colored pixels after `0x0a3301`
  - right cluster `r3-6 c306-310` must gain colored pixels after `0x0a3301`

## Status-Dot Counts

- Phase 101A established that `0x0a3301` adds `20` colored pixels total across the two symmetric status-bar clusters.
- Exact post-patch final counts are now emitted by `probe-phase99d-home-verify.mjs` into `phase99d-report.md` as:
  - `Left cluster r3-6 c146-150: before / afterStage / final`
  - `Right cluster r3-6 c306-310: before / afterStage / final`
- Expected split by symmetry is approximately `10` colored pixels per cluster, but that remains an inference until the parent agent runs the probe.

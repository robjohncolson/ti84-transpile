# Phase 884: Natural D0301B Owner Lifecycle Trace

Probe: `probe-phase884-natural-d0301b-lifecycle.mjs`

> **Note (2026-07-01, human incident cleanup):** the original probe wrote an
> unbounded ~349 MB trace dump to this report, which was committed and blocked all
> GitHub pushes (>100 MB limit) for ~2 days. The giant trace was stripped from git
> history; this file preserves the findings summary. The probe should be re-run with
> a bounded trace if the raw block-by-block dump is ever needed. A supervisor
> size-guard now prevents committing oversize files.

## Summary

- Result: PASS.
- Browser-equivalent natural phases 1-5 hit owner-chain targets: **no** (all owner counts 0).
- Stable snapshot `D0301B` before replay/force: `0x000000`.
- Direct owner-entry experiments that naturally wrote the magic when explicitly entered: `ownerA-direct-040B27` (0x040B27), `ownerA-upstream-0454BE` (0x0454BE), `ownerA-upstream-045575` (0x045575).
- Candidate browser phase: if made natural, it must occur before or at browser Phase 5 (`0x09DD62` launch-home), before the `0x001879` snapshot / `0x0018D7` integrity decision; phases 1-5 as currently written never call the owner family.
- Static call-in path (A-side): `0x045575 -> 0x040B27 -> 0x040BE4 -> 0x040BEC -> 0x040BF0 -> 0x040BF4`, with an alternate gated entry `0x0454BE -> 0x040BDE -> 0x040BE4` when `(IY+53)` bit 1 is clear.
- Gate/state at the natural Phase 5 snapshot: `D000B5/IY+53=0x00`, `D00894=0x00`, `IY+63=0x00`, `IY+67=0x00` — compatible with the A-side alternate path, but the browser route never reaches the gate blocks at all.
- Feasibility: owner code is executable if entered explicitly, but the browser p1-p5 lifecycle has no natural edge to it. A Phase885 prototype would need to add a pre-Phase-5 owner-family entry BEHIND the existing replay baseline and prove it does not destabilize stack, flags, or RAM.
- Adjudication: the missed natural lifecycle is a **call-selection gap**, not a local `D0301B` compare or stable-replay timing issue. The shortcut boot reaches launch-home Phase 5 and the `0x001879` snapshot with live VAT/D010 fields but `D0301B` still zero, while the static owner chains live in the `0x040Bxx`/`0x040Cxx` reset/ON-context family and are never called by the browser phases.

## Browser Natural Phase Results

| Phase | Steps | Termination | Last PC |
| --- | --- | --- | --- |
| p1-coldboot-0x000000 | 20000 | max_steps | 0x001CC0 |
| p2-kernel-0x08C331 | 100000 | max_steps | 0x000A92 |
| p3-postinit-0x0802B2 | 100 | max_steps | 0x0158BC |
| p4-warm-idle-0x0019BE | 192290 | halt | 0x0019B5 |
| p5-launch-home-0x09DD62 | 275843 | halt | 0x0019B5 |

## Stable Snapshot Fields (Phase 5 pre-wipe, `0x001879`, VAT live)

```json
{
  "D007CA": "0x0585E9", "D008E0": "0xD1A866",
  "D010EF": "0xD2A83E", "D010FE": "0xD1A8CC", "D010F4": "0x1F",
  "D02437": "0xD1A8CC", "D0243A": "0xD1A8CC", "D0243D": "0xD2A83E", "D02440": "0xD2A83E",
  "D02505": "0x0A", "D02590": "0xD3FE81", "D0259D": "0xD3FECD",
  "D0301B": "0x000000",
  "D000B5_IY53": "0x00", "D000BF_IY63": "0x00", "D000C3_IY67": "0x00", "D00894": "0x00"
}
```

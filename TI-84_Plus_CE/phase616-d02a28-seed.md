# Phase 616: D02A28 Seed Test

Probe: `probe-phase616-d02a28-seed.mjs`

Run:

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase616-d02a28-seed.mjs
```

Result: exit 0.

## Summary

- ★★★ Seeding `D02A28=1` before entering the outer key dispatch loop is **not sufficient** to make token bytes reach `D001B8` / `D001D3`.
- ★★★ The baseline run (`D02A28=0`) halts cleanly at `0x0019B5` after 332,856 steps, hits the D02A28 gate test (`0x090992`) 175 times, but never writes `D001B8` or `D001D3`.
- ★★★ The seeded run (`D02A28=1`) does not halt within 500,000 steps. It ends at `0x09091C`, has `D02A28=0`, hits `0x090992` 1,940 times, and still records zero `D001B8` / `D001D3` changes.
- ★★ The OS clears or restores `D02A28` back to zero before the relevant token-output exit path. The seed must be applied closer to the `0x08F5E1` / `0x090992` gate, or via the natural entry routine that owns the save/set/restore lifetime.

## Probe Output

```text
post-paint: D007CA=0x0585E9 D02A28=0x00 D001B8=0x00 D001D3=0x00
baseline D02A28=0: exit=unknown steps=332856 pc=0x0019B5 gate=0x00 b8=0x00 d3=0x00 gateTests=175 storeAndGate=0 exitHits=2 events=0
seeded D02A28=1: exit=unknown steps=500000 pc=0x09091C gate=0x00 b8=0x00 d3=0x00 gateTests=1940 storeAndGate=0 exitHits=0 events=0
```

## Interpretation

The session-614 model of `D02A28` as a token-output nesting gate still holds, but the browser/probe integration cannot fix output by setting the byte once before key dispatch. The key path runs routines that clear or restore the gate to zero before `D001B8` / `D001D3` can be updated.

The seeded run also changes control flow: it never reaches the clean halt and instead runs into the same `0x09091C` token-walker region seen in prior stale-state investigations. That means the seed perturbs token-reader state without establishing the surrounding display-output context.

## Next Target

Find the natural gate lifetime instead of blunt pre-dispatch seeding:

- Trace writes to `D02A28` during the seeded and baseline runs to identify the exact clearing site.
- Test a narrow hook that sets `D02A28=1` only when entering `0x08F5E1` or immediately before `0x090992`, then verify whether `D001B8` / `D001D3` receive token bytes.
- Decode the `0x0907DB` / `0x09091C` interior enough to explain why the seeded run falls into the walker loop.

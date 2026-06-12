# Phase 617: D02A28 Write Trace During Key Dispatch

Probe: `probe-phase617-d02a28-write-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase617-d02a28-write-trace.mjs`  
Exit: 0

## Summary

- ★★★★ The blunt `D02A28=1` pre-dispatch seed is cleared by the `0x09013C` reset block before token output can use it.
- ★★★★ The natural gate lifetime is already active: `0x08E911` increments `D02A28` to 1 and `0x090986` decrements it back to 0 repeatedly.
- ★★★ The phase-616 seeded maxSteps behavior is reproducible only when the seeded run follows a baseline key run on the same executor/memory. A fresh seeded executor halts cleanly like baseline.
- ★★★ No run writes `D001B8` or `D001D3`; `D02A28` being briefly non-zero is not sufficient unless the correct `0x08F5E1` output path is reached while the gate is live.

## Probe Output Highlights

### Baseline (`D02A28=0`)

```text
result steps=332856 pc=0x0019B5 D02A28=0x00 D001B8=0x00 D001D3=0x00 transitions=18
watch hits:
  0x001853 wipe caller entry: 2
  0x0018F8 bulk wipe body: 2
  0x08E911 W1 block start before inc D02A28: 9
  0x08F5E1 token exit path: 2
  0x09013C W10 block start before xor/clear reset: 4
  0x09091C seeded runaway loop: 783
  0x090986 A2 dec D02A28: 9
  0x090992 R6 gate test: 175
```

The baseline has 9 natural enable/disable pairs:

```text
0x00->0x01 prev=0x08E911
0x01->0x00 prev=0x090986
```

### Seeded After Baseline on Same Executor

```text
result steps=500000 pc=0x09091C D02A28=0x00 D001B8=0x00 D001D3=0x00 transitions=431
watch hits:
  0x08E911 W1 block start before inc D02A28: 215
  0x09013C W10 block start before xor/clear reset: 1
  0x09091C seeded runaway loop: 9052
  0x090986 A2 dec D02A28: 215
  0x090992 R6 gate test: 1940
```

First transition:

```text
block=3329 0x01->0x00 pc=0x08F86F prev=0x09013C
```

This reproduces the phase-616 maxSteps case and proves the manual seed is cleared first by `0x09013C`, not by the `0x08F5E1` cleanup path.

After that, the run loops through normal gate nesting 215 times (`0x08E911` inc, `0x090986` dec), but never reaches output-buffer writes.

### Seeded on Fresh Executor

```text
result steps=332856 pc=0x0019B5 D02A28=0x00 D001B8=0x00 D001D3=0x00 transitions=19
```

The fresh seeded run halts cleanly. Its first transition is the same seed clear:

```text
block=3523 0x01->0x00 pc=0x08F86F prev=0x09013C
```

Then it follows the same 9 natural inc/dec gate pairs as baseline.

## Interpretation

`D02A28` is not missing from the key path. The OS enters token-output nesting contexts naturally, but the relevant output buffers still stay zero because the execution path does not arrive at the buffer-writing portion of `0x08F5E1` while `D02A28` is live.

The direct pre-dispatch seed is the wrong integration point for two reasons:

1. `0x09013C` clears it early in both fresh and sequential seeded runs.
2. Reusing the same executor/memory after a prior baseline run exposes stale state that sends the seeded run into the `0x09091C` walker loop, but the gate still cycles normally inside that runaway.

## Next Target

The useful next probe is a narrow hook at the consumer, not at dispatch entry:

- Set `D02A28=1` on entry to `0x08F5E1`, or just before `0x09098E` / `0x090992`.
- Log branch outcomes after `0x09098E`, `0x08F663`, and `0x08F66F`.
- Verify whether `D001B8` / `D001D3` change when the gate is live exactly at the output checks.


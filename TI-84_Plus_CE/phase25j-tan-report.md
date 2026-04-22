# Phase 25J — Tan Probe

**Goal**: Verify that calling Tan at `0x07E5D8` with OP1=pi/4 produces OP1=1.0. Non-identity input — genuinely exercises the transcendental engine.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25h-b). `cpu.madl=1` forced before `cpu.push(FAKE_RET)`. OP1 seeded via `writeReal(Math.PI/4)`. Execution stepped until PC equals FAKE_RET `0x7ffffe` or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`. **PASS requires both** returnHit AND value within tolerance — fixes prior false-positive.

**Observed OP1 bytes**: `00 7f 99 99 99 99 99 99 99`

**Result**: got=0.99999999999999, expected=1, returnHit=true — **PASS**

**Surprises**: Tan returned cleanly after 2805 blocks. Cold-boot OS state was sufficient; angle mode defaults to radians without explicit flag setup.

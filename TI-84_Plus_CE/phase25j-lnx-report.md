# Phase 25J — LnX Probe

**Goal**: Verify that calling LnX at `0x07E053` with OP1=e produces OP1=1.0. Non-identity input — genuinely exercises the transcendental engine.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25h-b). `cpu.madl=1` forced before `cpu.push(FAKE_RET)`. OP1 seeded via `writeReal(Math.E)`. Execution stepped until PC equals FAKE_RET `0x7ffffe` or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`. **PASS requires both** returnHit AND value within tolerance — fixes prior false-positive.

**Observed OP1 bytes**: `00 7f 99 99 99 99 99 99 95`

**Result**: got=0.99999999999995, expected=1, returnHit=true — **PASS**

**Surprises**: LnX returned cleanly after 1754 blocks. Cold-boot OS state was sufficient; no special mode/flag setup was required beyond normal init.

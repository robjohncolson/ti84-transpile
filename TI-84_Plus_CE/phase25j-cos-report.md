# Phase 25J — Cos Probe

**Goal**: Verify that calling Cos at `0x07E5B5` with OP1=pi/3 produces OP1=0.5. Non-identity input — genuinely exercises the transcendental engine.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25h-b). `cpu.madl=1` forced before `cpu.push(FAKE_RET)`. OP1 seeded via `writeReal(Math.PI/3)`. Execution stepped until PC equals FAKE_RET `0x7ffffe` or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`. **PASS requires both** returnHit AND value within tolerance — fixes prior false-positive.

**Observed OP1 bytes**: `00 7f 50 00 00 00 00 00 00`

**Result**: got=0.5, expected=0.5, returnHit=true — **PASS**

**Surprises**: Cos returned cleanly after 2161 blocks. Cold-boot OS state was sufficient; angle mode defaults to radians without explicit flag setup.

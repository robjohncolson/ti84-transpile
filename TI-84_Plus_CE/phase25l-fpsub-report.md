# Phase 25L - FPSub Probe

**Goal**: Verify that calling FPSub at `0x07C771` with OP1=5.0 and OP2=3.0 produces OP1=2.0.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25i-fpadd). OP1 seeded via `writeReal(5.0)`, OP2 via `writeReal(3.0)`. Fake return address `0x7ffffe` pushed on stack; execution stepped until PC equals that sentinel or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`.

**Observed OP1 bytes**: `00 80 20 00 00 00 00 00 00`

**Result**: got=2, expected=2 - **PASS**

**Surprises**: FPSub returned cleanly to the fake return address without any extra setup beyond the standard post-init state.

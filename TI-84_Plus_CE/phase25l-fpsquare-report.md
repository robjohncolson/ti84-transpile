# Phase 25L - FPSquare Probe

**Goal**: Verify that calling FPSquare at `0x07C8B3` with OP1=7.0 produces OP1=49.0.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25i-fpadd). OP1 seeded via `writeReal(7.0)`. Fake return address `0x7ffffe` pushed on stack; execution stepped until PC equals that sentinel or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`.

**Observed OP1 bytes**: `00 81 49 00 00 00 00 00 00`

**Result**: got=49, expected=49 - **PASS**

**Surprises**: FPSquare returned cleanly to the fake return address using the same minimal post-init state as the other phase25i math-entry probes.

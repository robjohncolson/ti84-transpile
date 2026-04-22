# Phase 25O - TenX Probe

**Goal**: Verify that calling TenX at `0x07E219` with OP1=3.0 produces OP1=1000.0.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25i-fpadd). OP1 seeded via `writeReal(3.0)`. Fake return address `0x7ffffe` pushed on stack; execution stepped until PC equals that sentinel or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`.

**Observed OP1 bytes**: `00 83 10 00 00 00 00 00 00`

**Result**: got=1000, expected=1000 - **PASS**

**Surprises**: TenX returned cleanly to the fake return address using the same minimal post-init state as the other unary FP probes.

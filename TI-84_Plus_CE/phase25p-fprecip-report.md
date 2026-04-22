# Phase 25P - FPRecip Probe

**Goal**: Verify that calling FPRecip at `0x07CAB1` with OP1=4.0 produces OP1=0.25.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25i-fpadd). OP1 seeded via `writeReal(4.0)`. Fake return address `0x7ffffe` pushed on stack; execution stepped until PC equals that sentinel or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`.

**Observed OP1 bytes**: `00 7f 25 00 00 00 00 00 00`

**Result**: got=0.25, expected=0.25 - **PASS**

**Surprises**: FPRecip returned cleanly to the fake return address without any extra setup beyond the standard post-init state.

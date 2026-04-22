# Phase 25O - FPMult Probe

**Goal**: Verify that calling FPMult at `0x07C8B7` with OP1=6.0 and OP2=7.0 produces OP1=42.0.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25i-fpadd). OP1 seeded via `writeReal(6.0)`, OP2 via `writeReal(7.0)`. Fake return address `0x7ffffe` pushed on stack; execution stepped until PC equals that sentinel or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`.

**Observed OP1 bytes**: `00 81 42 00 00 00 00 00 00`

**Result**: got=42, expected=42 - **PASS**

**Surprises**: FPMult returned cleanly to the fake return address without any extra setup beyond the standard post-init state.

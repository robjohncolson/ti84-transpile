# Phase 25P - InvOP1Sc Probe

**Goal**: Verify that calling InvOP1Sc at `0x07CA02` with OP1=7.0 produces OP1=-7.0.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25i-fpadd). OP1 seeded via `writeReal(7.0)`. Fake return address `0x7ffffe` pushed on stack; execution stepped until PC equals that sentinel or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`.

**Observed OP1 bytes**: `80 80 70 00 00 00 00 00 00`

**Result**: got=-7, expected=-7, diff=0 - **PASS**

**Surprises**: InvOP1Sc returned cleanly to the fake return address without any extra setup beyond the standard post-init state.

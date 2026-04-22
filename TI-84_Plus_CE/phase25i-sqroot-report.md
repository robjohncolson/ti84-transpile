# Phase 25I — SqRoot Probe

**Goal**: Verify that calling SqRoot at `0x07DF66 (= SqRoot)` with OP1=4.0 produces OP1=2.0.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25h-b). OP1 seeded via `writeReal(4.0)`. Fake return address `0x7ffffe` pushed on stack; execution stepped until PC equals that sentinel or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`.

**Observed OP1 bytes**: `00 80 20 00 00 00 00 00 00`

**Result**: got=2, expected=2 — **PASS**

**Surprises**: SqRoot returned cleanly to the fake return address. No special mode/flag setup was required beyond normal OS init.

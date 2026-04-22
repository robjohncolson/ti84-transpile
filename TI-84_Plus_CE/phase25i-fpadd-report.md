# Phase 25I — FPAdd Probe

**Goal**: Verify that calling FPAdd at `0x07C77F` with OP1=2.0 and OP2=3.0 produces OP1=5.0.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25h-b). OP1 seeded via `writeReal(2.0)`, OP2 via `writeReal(3.0)`. Fake return address `0x7ffffe` pushed on stack; execution stepped until PC equals that sentinel or 200000 instructions exhausted. Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`.

**Observed OP1 bytes**: `00 80 50 00 00 00 00 00 00`

**Result**: got=5, expected=5 — **PASS**

**Surprises**: FPAdd returned cleanly to the fake return address without needing any special flag setup, confirming the entry point is callable after minimal OS init.

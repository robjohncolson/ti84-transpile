# Phase 25Q - InvOP1S Probe

**Goal**: Classify InvOP1S at `0x07CA06` as either negate-OP1, absolute-value, or something else.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25i-fpadd). Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`. Each test restores the same post-init RAM/CPU baseline, seeds OP1 via `writeReal(...)`, pushes fake return address `0x7ffffe`, and runs until PC reaches that sentinel or 200000 instructions are exhausted.

**Static disassembly** (`0x07CA02..0x07CA12`):
```
0x07ca02: cd 27 ca 07  call 0x07ca27
0x07ca06: cd bd f7 07  call 0x07f7bd
0x07ca0a: fe 1c        cp 0x1c
0x07ca0c: 28 02        jr z, 0x07ca10
0x07ca0e: fe 1d        cp 0x1d
0x07ca10: ca 89 d1 07  jp z, 0x07d189
```

**Classification**: negate - **PASS**

## Test Results

| test | seed | observed | negate expected | abs expected | returned | observed OP1 bytes |
|---|---:|---:|---:|---:|:---:|:---|
| test1 | 7 | -7 | -7 | 7 | yes | `80 80 70 00 00 00 00 00 00` |
| test2 | -3.5 | 3.5 | 3.5 | 3.5 | yes | `00 80 35 00 00 00 00 00 00` |

**Notes**: InvOP1S behaves like a sign-flip/negation primitive.

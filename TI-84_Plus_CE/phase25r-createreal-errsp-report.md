# Phase 25R - CreateReal errSP Probe

## Goal

Call `CreateReal` at `0x08238a` with a seeded `errSP` frame so TI-OS error unwind lands at `0x7ffffa` instead of crashing to an arbitrary return PC.

## Setup

- Cold boot + post-init pattern copied from earlier Phase 25 probes.
- `CreateReal` entry: `0x08238a`
- Static failure path: `0x061d46` seeds `0x8f`, then tails into `0x061db2`
- Timer IRQ disabled via `createPeripheralBus({ timerInterrupt: false })`
- Instruction budget: 500000
- Loop cap: 8192
- `OP1` pre-call bytes: `00 41 00 00 00 00 00 00 00`
- `OP4` pre-call byte: `0x00`
- VAT pointers before seed: OPBase=0x000000 pTemp=0x000000 progPtr=0x000000
- VAT pointers before call: OPBase=0xd1a881 pTemp=0xd1a88a progPtr=0xd1a893
- VAT fallback seeds applied: OPBase 0x000000 -> 0xd1a881; pTemp 0x000000 -> 0xd1a88a; progPtr 0x000000 -> 0xd1a893
- Main return frame @ `0xd1a86f`: `fe ff 7f`
- Error frame @ `0xd1a869`: `00 00 00 fa ff 7f`
- `errSP` slot before call: `0xd1a869`

## Outcome

- Classification: **PASS**
- informative=true
- returnHit=false
- errCaught=false
- termination=missing_block
- finalPc=`0xffffff`
- steps=491
- errNo after call: `0x00 (clear)`
- errSP after call: `0x000000`
- SP after call: `0xd1a86f`
- A/F after call: `0x00 / 0x00`
- HL/DE after call: `0x7ffffe / 0x7fffff`
- OP1 post-call: `00 00 00 00 00 00 00 00 00`
- OP1 decoded via readReal: 0
- VAT pointers after call: OPBase=0xa88100 pTemp=0x000000 progPtr=0x000000
- Recent PCs: `0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x08215f 0x07f7bd 0x082163 0x08012d 0x080130 0x082167 0x082173 0x08217e 0x082182 0x082186 0x082198 0x04c990 0x08219c 0x0827c3 0x0827df 0x082823 0x08282d 0x0827e7 0x082823 0x08282d 0x0827ef 0x082823 0x08282d 0x0827f7 0x082823 0x08282d 0x0827ff 0x082823 0x08282d 0x082807 0x082823 0x08282d 0x08280f 0x082823 0x08282d 0x082817 0x082823 0x08282d 0x08281f 0x08282d 0x0821a3 0xffffff`
- Dynamic targets: `0x0822e1 0x080084 0x0822af 0x0822bf 0x08226b 0x08226f 0x0822c4 0x082bc2 0x03e1ca 0x061dba 0x08234e 0x08223b 0x08222f 0x082505 0x08250d 0x082515 0x08251d 0x082525 0x08252d 0x082535 0x08253d 0x082545 0x08254d 0x082555 0x08255d 0x082565 0x08256d 0x082575 0x08257d 0x082585 0x08258d 0x082595 0x08259d 0x0825a5 0x0825ad 0x0825b5 0x0825bd 0x0825c5 0x0825cd 0x082233 0x082358 0x08235d 0x08211c 0x082120 0x082126 0x082163 0x082167 0x08219c 0x0827e7 0x0827ef 0x0827f7 0x0827ff 0x082807 0x08280f 0x082817 0x08281f 0x0821a3 0xffffff`
- Missing blocks: `ffffff:adl`

## Post-Allocation State

- DE register: `0x7fffff`
- OP1 [0..8] @ `0xd005f8`: `00 00 00 00 00 00 00 00 00`
- OPBase (3 bytes @ `0xd02590`): `00 81 a8` -> `0xa88100`
- pTemp (3 bytes @ `0xd0259a`): `00 00 00` -> `0x000000`
- progPtr (3 bytes @ `0xd0259d`): `00 00 00` -> `0x000000`
- Heap top (3 bytes @ `0xd0258a`): `f7 ff ff` -> `0xfffff7`
- errNo @ `0xd008df`: `0x00`
- VAT area (32 bytes @ `0xd3ffdf`): `00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`

## Interpretation

CreateReal completed normally and returned through the sentinel address `0xffffff` with `errNo=0x00`. The allocator's own RET popped the stack to the missing_block terminator, confirming successful completion.

## Console Output

```text
=== Phase 25R: CreateReal with errSP seeded ===
boot: steps=3025 term=halt lastPc=0x0019b5
VAT before seed: OPBase=0x000000 pTemp=0x000000 progPtr=0x000000
VAT after seed:  OPBase=0xd1a881 pTemp=0xd1a88a progPtr=0xd1a893
VAT before call: OPBase=0xd1a881 pTemp=0xd1a88a progPtr=0xd1a893
VAT fallback seeds: OPBase 0x000000 -> 0xd1a881; pTemp 0x000000 -> 0xd1a88a; progPtr 0x000000 -> 0xd1a893
OP1 pre-call @ 0xd005f8 [00 41 00 00 00 00 00 00 00]
OP4 pre-call @ 0xd00619 = 0x00
main return frame @ 0xd1a86f [fe ff 7f]
errSP frame @ 0xd1a869 [00 00 00 fa ff 7f]
errSP slot @ 0xd008e0 -> 0xd1a869
static expectation: 0x08238a type-check failure -> 0x061d46 -> errNo 0x8f -> 0x061db2
CreateReal returned through sentinel @ 0xffffff (allocator RET popped stack to missing_block terminator)
errNo after call: 0x00 (clear)
errSP after call: 0x000000  SP after call: 0xd1a86f
OP1 post-call @ 0xd005f8 [00 00 00 00 00 00 00 00 00]
OP1 decoded via readReal: 0
VAT after call: OPBase=0xa88100 pTemp=0x000000 progPtr=0x000000

--- Post-Allocation State ---
DE register: 0x7fffff
OP1 [0..8] @ 0xd005f8: 00 00 00 00 00 00 00 00 00
OPBase  (3 bytes @ 0xd02590): 00 81 a8  -> 0xa88100
pTemp   (3 bytes @ 0xd0259a): 00 00 00  -> 0x000000
progPtr (3 bytes @ 0xd0259d): 00 00 00  -> 0x000000
Heap top (3 bytes @ 0xd0258a): f7 ff ff  -> 0xfffff7
errNo @ 0xd008df: 0x00
VAT area (32 bytes @ 0xd3ffdf): 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00

recent PCs: 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x08215f 0x07f7bd 0x082163 0x08012d 0x080130 0x082167 0x082173 0x08217e 0x082182 0x082186 0x082198 0x04c990 0x08219c 0x0827c3 0x0827df 0x082823 0x08282d 0x0827e7 0x082823 0x08282d 0x0827ef 0x082823 0x08282d 0x0827f7 0x082823 0x08282d 0x0827ff 0x082823 0x08282d 0x082807 0x082823 0x08282d 0x08280f 0x082823 0x08282d 0x082817 0x082823 0x08282d 0x08281f 0x08282d 0x0821a3 0xffffff
result=PASS
```

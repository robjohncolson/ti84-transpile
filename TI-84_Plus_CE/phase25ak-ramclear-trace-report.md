# Phase 25AK — RAM CLEAR Trace Report

Generated: 2026-04-23

## Objective

Trace every block PC between steps 2580 and 3584 during CoorMon execution
to identify the conditional branch that leads to RAM CLEAR at 0x001881.

## Setup

Identical seeding to probe-phase25aj-coormon-parseinp-trace.mjs:
- Cold boot + MEM_INIT
- cx seed: cxMain=0x058241, cxCurApp=0x40, home-context callbacks
- Pre-yield IY flags cleared
- Keyboard: ENTER seeded
- Parser: tokenized "2+3" at userMem
- CoorMon budget: 300000 steps

## Results

- CoorMon termination: max_steps
- Total steps: 300000
- Final PC: 0x0827aa
- Loops forced: 1
- RAM CLEAR (0x001881) hit at step: NOT HIT
- Blocks recorded in trace range: 200

## cx Context Changes

| Step | PC | cxCurApp | cxMain | cxPPutAway | cxPutAway | cxReDisp |
|------|-----|----------|--------|------------|-----------|----------|
| 2566 | 0x05822a | 0x40 | 0x0585e9 | 0x058b19 | 0x058b7e | 0x0582bc |
| 18282 | 0x04c990 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |

## Early Block Trace (around cxMain change)

```
step=2536 PC=0x08c5a7 SP=0xd1a86f A=0x05 F=0xb3 BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[fe 27 da 09 c5 08 fe 5a] exits=[branch:0x08c509, fallthrough:0x08c5ad]
step=2537 PC=0x08c509 SP=0xd1a86f A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[fe 69 20 04 3e fc 18 f2] exits=[branch:0x08c511, fallthrough:0x08c50d]
step=2538 PC=0x08c511 SP=0xd1a86f A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[fe 5b 20 04 3e fd 18 ea] exits=[branch:0x08c519, fallthrough:0x08c515]
step=2539 PC=0x08c519 SP=0xd1a86f A=0x05 F=0xbb BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[fe 28 f5 20 08 fd cb 16] exits=[branch:0x08c526, fallthrough:0x08c51e]
step=2540 PC=0x08c526 SP=0xd1a86c A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[f1 fe 29 f5 20 06 fd cb] exits=[branch:0x08c532, fallthrough:0x08c52c]
step=2541 PC=0x08c532 SP=0xd1a86c A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[cd 31 23 02 cd 2f c7 08] exits=[call:0x022331, call-return:0x08c536]
step=2542 PC=0x022331 SP=0xd1a869 A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[f5 cd 78 05 00 28 0c d5] exits=[call:0x000578, call-return:0x022336]
step=2543 PC=0x000578 SP=0xd1a863 A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[c3 a6 58 01 c3 c0 6e 00] exits=[jump:0x0158a6]
step=2544 PC=0x0158a6 SP=0xd1a863 A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[c5 47 3a 7e 00 00 fe ff] exits=[return:n/a]
step=2545 PC=0x022336 SP=0xd1a866 A=0x05 F=0x42 BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[28 0c d5 e5 cd 2e 62 05] exits=[branch:0x022344, fallthrough:0x022338]
step=2546 PC=0x022344 SP=0xd1a866 A=0x05 F=0x42 BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[f1 c9 f5 cd 78 05 00 28] exits=[return:n/a]
step=2547 PC=0x08c536 SP=0xd1a86c A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[cd 2f c7 08 fd cb 09 a6] exits=[call:0x08c72f, call-return:0x08c53a]
step=2548 PC=0x08c72f SP=0xd1a869 A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[e5 cd 2e 62 05 e5 2a ca] exits=[call:0x05622e, call-return:0x08c734]
step=2549 PC=0x05622e SP=0xd1a863 A=0x05 F=0x9b BC=0x000500 DE=0x000000 HL=0x09f7a4 ROM=[21 00 00 00 6f 3a 8e 05] exits=[branch:0x056241, fallthrough:0x05623d]
step=2550 PC=0x05623d SP=0xd1a863 A=0x05 F=0x13 BC=0x000500 DE=0x000000 HL=0x000005 ROM=[fe fc 20 03 6c 67 c9 fe] exits=[branch:0x056244, fallthrough:0x056241]
step=2551 PC=0x056244 SP=0xd1a863 A=0x05 F=0x1b BC=0x000500 DE=0x000000 HL=0x000005 ROM=[fe fb 28 04 fe fa 20 07] exits=[branch:0x05624c, fallthrough:0x056248]
step=2552 PC=0x056248 SP=0xd1a863 A=0x05 F=0x1b BC=0x000500 DE=0x000000 HL=0x000005 ROM=[fe fa 20 07 7c b7 7d 28] exits=[branch:0x056253, fallthrough:0x05624c]
step=2553 PC=0x056253 SP=0xd1a863 A=0x05 F=0x1b BC=0x000500 DE=0x000000 HL=0x000005 ROM=[c9 fd 21 80 00 d0 cd b3] exits=[return:n/a]
step=2554 PC=0x08c734 SP=0xd1a866 A=0x05 F=0x1b BC=0x000500 DE=0x000000 HL=0x000005 ROM=[e5 2a ca 07 d0 cd 45 c7] exits=[call:0x08c745, call-return:0x08c73d]
step=2555 PC=0x08c745 SP=0xd1a860 A=0x05 F=0x1b BC=0x000500 DE=0x000000 HL=0x058241 ROM=[e9 2a eb 07 d0 cd 45 c7] exits=[jump-indirect:n/a]
step=2556 PC=0x058241 SP=0xd1a860 A=0x05 F=0x1b BC=0x000500 DE=0x000000 HL=0x058241 ROM=[21 00 00 00 40 22 ac 26] exits=[call:0x0239b3, call-return:0x058257]
step=2557 PC=0x058257 SP=0xd1a860 A=0x03 F=0x5d BC=0x000500 DE=0x000000 HL=0x000000 ROM=[c0 fd cb 29 56 28 04 cd] exits=[return-conditional:n/a, fallthrough:0x058258]
step=2558 PC=0x058258 SP=0xd1a860 A=0x03 F=0x5d BC=0x000500 DE=0x000000 HL=0x000000 ROM=[fd cb 29 56 28 04 cd 18] exits=[branch:0x058262, fallthrough:0x05825e]
step=2559 PC=0x058262 SP=0xd1a860 A=0x03 F=0x5d BC=0x000500 DE=0x000000 HL=0x000000 ROM=[fd 7e 3c e6 f4 fd 77 3c] exits=[call:0x0800c2, call-return:0x058272]
step=2560 PC=0x0800c2 SP=0xd1a85d A=0x00 F=0x54 BC=0x000500 DE=0x000000 HL=0x000000 ROM=[fd cb 14 9e c9 21 fa 05] exits=[return:n/a]
step=2561 PC=0x058272 SP=0xd1a860 A=0x00 F=0x54 BC=0x000500 DE=0x000000 HL=0x000000 ROM=[cd a3 8b 05 32 5b 26 d0] exits=[call:0x058ba3, call-return:0x058276]
step=2562 PC=0x058ba3 SP=0xd1a85d A=0x00 F=0x54 BC=0x000500 DE=0x000000 HL=0x000000 ROM=[af 32 0c 1d d0 c9 fd cb] exits=[return:n/a]
step=2563 PC=0x058276 SP=0xd1a860 A=0x00 F=0x44 BC=0x000500 DE=0x000000 HL=0x000000 ROM=[32 5b 26 d0 32 06 25 d0] exits=[call:0x058222, call-return:0x058282]
step=2564 PC=0x058222 SP=0xd1a85d A=0x00 F=0x44 BC=0x000500 DE=0x000000 HL=0x000000 ROM=[21 d3 85 05 cd 82 c7 08] exits=[call:0x08c782, call-return:0x05822a]
step=2565 PC=0x08c782 SP=0xd1a85a A=0x00 F=0x44 BC=0x000500 DE=0x000000 HL=0x0585d3 ROM=[11 ca 07 d0 01 15 00 00] exits=[return:n/a]
step=2566 PC=0x05822a SP=0xd1a85d A=0x0e F=0x40 BC=0x000000 DE=0xd007df HL=0x0585e8 ROM=[fd cb 0d ce c9 cd 3e f8] exits=[return:n/a]
step=2567 PC=0x058282 SP=0xd1a860 A=0x0e F=0x40 BC=0x000000 DE=0xd007df HL=0x0585e8 ROM=[fd cb 1c 76 c2 2c 8a 05] exits=[branch:0x058a2c, fallthrough:0x05828a]
step=2568 PC=0x05828a SP=0xd1a860 A=0x0e F=0x54 BC=0x000000 DE=0xd007df HL=0x0585e8 ROM=[fd cb 09 7e c0 fd cb 45] exits=[return-conditional:n/a, fallthrough:0x05828f]
step=2569 PC=0x05828f SP=0xd1a860 A=0x0e F=0x54 BC=0x000000 DE=0xd007df HL=0x0585e8 ROM=[fd cb 45 be fd cb 0c 7e] exits=[branch:0x058483, fallthrough:0x05829b]
step=2570 PC=0x05829b SP=0xd1a860 A=0x0e F=0x54 BC=0x000000 DE=0xd007df HL=0x0585e8 ROM=[fd cb 0c 76 c0 fd cb 09] exits=[return-conditional:n/a, fallthrough:0x0582a0]
step=2571 PC=0x0582a0 SP=0xd1a860 A=0x0e F=0x54 BC=0x000000 DE=0xd007df HL=0x0585e8 ROM=[fd cb 09 86 fd cb 08 8e] exits=[call:0x09dcaa, call-return:0x0582ac]
step=2572 PC=0x09dcaa SP=0xd1a85d A=0x0e F=0x54 BC=0x000000 DE=0xd007df HL=0x0585e8 ROM=[2a 90 25 d0 22 93 25 d0] exits=[return:n/a]
step=2573 PC=0x0582ac SP=0xd1a860 A=0x0e F=0x54 BC=0x000000 DE=0xd007df HL=0x000000 ROM=[cd 23 36 08 cd 64 37 08] exits=[call:0x083623, call-return:0x0582b0]
step=2574 PC=0x083623 SP=0xd1a85d A=0x0e F=0x54 BC=0x000000 DE=0xd007df HL=0x000000 ROM=[af 21 00 00 00 40 22 96] exits=[return-conditional:n/a, fallthrough:0x08363c]
step=2575 PC=0x0582b0 SP=0xd1a860 A=0x00 F=0x42 BC=0x000000 DE=0xd1a881 HL=0x000000 ROM=[cd 64 37 08 cd 49 8d 05] exits=[call:0x083764, call-return:0x0582b4]
step=2576 PC=0x083764 SP=0xd1a85d A=0x00 F=0x42 BC=0x000000 DE=0xd1a881 HL=0x000000 ROM=[fd cb 33 76 fd cb 33 b6] exits=[return-conditional:n/a, fallthrough:0x08376d]
step=2577 PC=0x08376d SP=0xd1a85d A=0x00 F=0x54 BC=0x000000 DE=0xd1a881 HL=0x000000 ROM=[cd a2 f8 07 cd cf fa 07] exits=[call:0x07f8a2, call-return:0x083771]
step=2578 PC=0x07f8a2 SP=0xd1a85a A=0x00 F=0x54 BC=0x000000 DE=0xd1a881 HL=0x000000 ROM=[21 f8 05 d0 11 19 06 d0] exits=[jump:0x07f8c8]
step=2579 PC=0x07f8c8 SP=0xd1a85a A=0x00 F=0x54 BC=0x000000 DE=0xd00619 HL=0xd005f8 ROM=[c3 74 f9 07 11 0e 06 d0] exits=[jump:0x07f974]
step=2580 PC=0x07f974 SP=0xd1a85a A=0x00 F=0x54 BC=0x000000 DE=0xd00619 HL=0xd005f8 ROM=[ed a0 ed a0 ed a0 ed a0] exits=[return:n/a]
step=2581 PC=0x083771 SP=0xd1a85d A=0x00 F=0x44 BC=0xfffff5 DE=0xd00624 HL=0xd00603 ROM=[cd cf fa 07 21 9a 37 08] exits=[call:0x07facf, call-return:0x083775]
```

## Blocks Around cxCurApp Zeroing

```
step=18262 PC=0x07ff7b SP=0xd1a85a A=0x84 F=0x5d BC=0x058358 DE=0x061e27 HL=0xd02a92 ROM=[21 21 00 00 18 04 21 23] exits=[jump:0x07ff85]
step=18263 PC=0x07ff85 SP=0xd1a85a A=0x84 F=0x5d BC=0x058358 DE=0x061e27 HL=0x000021 ROM=[3e 05 32 f8 05 d0 18 0c] exits=[jump:0x07ff99]
step=18264 PC=0x07ff99 SP=0xd1a85a A=0x05 F=0x5d BC=0x058358 DE=0x061e27 HL=0x000021 ROM=[cd 40 c9 04 22 f9 05 d0] exits=[call:0x04c940, call-return:0x07ff9d]
step=18265 PC=0x04c940 SP=0xd1a857 A=0x05 F=0x5d BC=0x058358 DE=0x061e27 HL=0x000021 ROM=[f5 af 22 d7 2a d0 32 d9] exits=[return:n/a]
step=18266 PC=0x07ff9d SP=0xd1a85a A=0x05 F=0x5d BC=0x058358 DE=0x061e27 HL=0x000021 ROM=[22 f9 05 d0 c9 3e 40 21] exits=[return:n/a]
step=18267 PC=0x05e7fb SP=0xd1a85d A=0x05 F=0x5d BC=0x058358 DE=0x061e27 HL=0x000021 ROM=[cd 4f 38 08 cd a2 e3 05] exits=[call:0x08384f, call-return:0x05e7ff]
step=18268 PC=0x08384f SP=0xd1a85a A=0x05 F=0x5d BC=0x058358 DE=0x061e27 HL=0x000021 ROM=[3e 05 f5 cd cd 20 08 ed] exits=[call:0x0820cd, call-return:0x083856]
step=18269 PC=0x0820cd SP=0xd1a854 A=0x05 F=0x5d BC=0x058358 DE=0x061e27 HL=0x000021 ROM=[e5 21 f9 05 d0 7e d6 5d] exits=[return-conditional:n/a, fallthrough:0x0820e1]
step=18270 PC=0x0820e1 SP=0xd1a854 A=0x08 F=0x46 BC=0x000006 DE=0x06c427 HL=0x000021 ROM=[0c 91 fe 01 c0 5f 7a b7] exits=[return-conditional:n/a, fallthrough:0x0820e6]
step=18271 PC=0x0820e6 SP=0xd1a854 A=0x01 F=0x42 BC=0x000007 DE=0x06c427 HL=0x000021 ROM=[5f 7a b7 7b c0 3c c9 01] exits=[return-conditional:n/a, fallthrough:0x0820eb]
step=18272 PC=0x083856 SP=0xd1a857 A=0x01 F=0x80 BC=0x000007 DE=0x06c401 HL=0x000021 ROM=[ed 5b 9a 25 d0 2a 9d 25] exits=[call:0x082be2, call-return:0x08386a]
step=18273 PC=0x082be2 SP=0xd1a854 A=0x00 F=0x44 BC=0x000001 DE=0xd40000 HL=0xd3ffff ROM=[2b 2b 2b 2b 2b 2b c9 ed] exits=[return:n/a]
step=18274 PC=0x08386a SP=0xd1a857 A=0x00 F=0x44 BC=0x000001 DE=0xd40000 HL=0xd3fff9 ROM=[e6 3f ed 52 38 58 19 c1] exits=[branch:0x0838c8, fallthrough:0x083870]
step=18275 PC=0x0838c8 SP=0xd1a857 A=0x00 F=0x83 BC=0x000001 DE=0xd40000 HL=0xfffff9 ROM=[d1 c9 dd e5 dd 21 00 00] exits=[return:n/a]
step=18276 PC=0x05e7ff SP=0xd1a85d A=0x00 F=0x83 BC=0x000001 DE=0x000501 HL=0xfffff9 ROM=[cd a2 e3 05 40 ed 4b 35] exits=[call:0x05e3a2, call-return:0x05e803]
step=18277 PC=0x05e3a2 SP=0xd1a85a A=0x00 F=0x83 BC=0x000001 DE=0x000501 HL=0xfffff9 ROM=[cd 36 e8 05 2a 72 06 d0] exits=[call:0x05e836, call-return:0x05e3a6]
step=18278 PC=0x05e836 SP=0xd1a857 A=0x00 F=0x83 BC=0x000001 DE=0x000501 HL=0xfffff9 ROM=[cd a4 31 08 fd cb 01 d6] exits=[call:0x0831a4, call-return:0x05e83a]
step=18279 PC=0x0831a4 SP=0xd1a854 A=0x00 F=0x83 BC=0x000001 DE=0x000501 HL=0xfffff9 ROM=[eb 22 6f 06 d0 11 00 00] exits=[branch:0x0831e5, fallthrough:0x0831c4]
step=18280 PC=0x0831e5 SP=0xd1a854 A=0x00 F=0x06 BC=0x000001 DE=0x0054a3 HL=0xd153de ROM=[e5 c1 19 2b ed 5b 93 25] exits=[branch:0x083219, fallthrough:0x083214]
step=18281 PC=0x083214 SP=0xd1a84e A=0x00 F=0x92 BC=0x000501 DE=0xd3ffff HL=0x01a784 ROM=[eb b7 ed 52 eb c1 e1 ed] exits=[call:0x04c990, call-return:0x083232]
step=18282 PC=0x04c990 SP=0xd1a84e A=0x00 F=0x02 BC=0x01049e DE=0x000000 HL=0x01049e ROM=[e5 21 00 00 00 b7 ed 42] exits=[return:n/a]
step=18283 PC=0x083232 SP=0xd1a851 A=0x00 F=0x93 BC=0xfefb62 DE=0x000000 HL=0x01049e ROM=[d1 cd 25 25 08 c3 fd 26] exits=[call:0x082525, call-return:0x083237]
step=18284 PC=0x082525 SP=0xd1a851 A=0x00 F=0x93 BC=0xfefb62 DE=0x0054a2 HL=0x01049e ROM=[21 7e 06 d0 cd d1 25 08] exits=[call:0x0825d1, call-return:0x08252d]
step=18285 PC=0x0825d1 SP=0xd1a84e A=0x00 F=0x93 BC=0xfefb62 DE=0x0054a2 HL=0xd0067e ROM=[b7 e5 ed 27 ed 52 28 02] exits=[branch:0x0825db, fallthrough:0x0825d9]
step=18286 PC=0x0825d9 SP=0xd1a84b A=0x00 F=0x93 BC=0xfefb62 DE=0x0054a2 HL=0xffab5e ROM=[30 02 e1 c9 e1 c5 e5 ed] exits=[branch:0x0825dd, fallthrough:0x0825db]
step=18287 PC=0x0825db SP=0xd1a84b A=0x00 F=0x93 BC=0xfefb62 DE=0x0054a2 HL=0xffab5e ROM=[e1 c9 e1 c5 e5 ed 27 ed] exits=[return:n/a]
```

## RAM CLEAR Path

RAM CLEAR at 0x001881 was NOT reached in 300K steps.

Instead, the cx context is destroyed by a different mechanism:
buffer compaction at 0x04C990 (LDDR block move in function 0x0831A4)
which inadvertently zeroes the cx range when buffer pointers overlap cx memory.

## Analysis

### Key Finding: RAM CLEAR at 0x001881 is NOT the active blocker

With the full cx seed (cxMain=0x058241, cxCurApp=0x40, all handler pointers,
IY flags, error frame, tokenized "2+3"), CoorMon does NOT reach 0x001881.

The cx context is destroyed by TWO events:

1. **cxMain changes from 0x058241 to 0x0585E9 at step ~2566** (PC around 0x05822A)
   This is the home handler modifying cxMain to a different dispatch target.
   0x0585E9 may be a second-pass handler address.

2. **cxCurApp zeroed at step 18282** (PC=0x04c990)
   This is the buffer compaction path (0x0831A4 LDDR) zeroing the cx range
   as a side effect of memory management operations.

### Implication

The "RAM CLEAR at step 3584" reported in the continuation prompt may have
been from a DIFFERENT seeding configuration (e.g., without the full cx seed).
With proper cx seeding, CoorMon proceeds past the RAM CLEAR gate but still
fails because buffer compaction destroys the cx context later.

The REAL blocker is the buffer compaction at step ~18282, not RAM CLEAR.

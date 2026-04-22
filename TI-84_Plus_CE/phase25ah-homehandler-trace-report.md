# Phase 25AH - Home-Screen Handler (0x058241) Runtime Trace

## Date

2026-04-22

## Purpose

Trace the home-screen handler (cxMain=0x058241) to find the call chain
from CoorMon keystroke dispatch down to ParseInp (0x099914) and other
known OS routines. The handler is called directly after MEM_INIT with
ENTER key seeded and tokenized "2+3" in userMem.

## Console Output

```text
=== Phase 25AH: Home-Screen Handler (0x058241) Runtime Trace ===

Cold boot complete.
MEM_INIT: return_hit
Seeded cxMain @ 0xd007ca = 0x058241
Seeded cxCurApp @ 0xd007e0 = 0x40
Seeded keyboard: kbdKey=0x05 kbdGetKy=0x05 kbdSCR=0x09
Seeded tokens at 0xd1a881: [32 70 33 3f]
Seeded begPC=0xd1a881 curPC=0xd1a881 endPC=0xd1a885
Seeded error frame at 0xd1a86c
FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff

Calling home-screen handler at 0x058241
  SP=0xd1a86f return=0x7ffffe

=== Results ===

Total steps: 50000
Unique PCs collected: 418
Termination: max_steps
Final PC: 0x08279e
Return hit: false
Error caught: false
Missing block encountered: false
errNo: 0x00

=== Known Entry Point Hits ===
  (none detected in first 50,000 steps)

ParseInp (0x099914) reached: false

=== First 100 Unique PCs (annotated) ===
  [  0] 0x058241 (step 0)
  [  1] 0x058257 (step 1)
  [  2] 0x058258 (step 2)
  [  3] 0x058262 (step 3)
  [  4] 0x0800c2 (step 4)
  [  5] 0x058272 (step 5)
  [  6] 0x058ba3 (step 6)
  [  7] 0x058276 (step 7)
  [  8] 0x058222 (step 8)
  [  9] 0x08c782 (step 9)
  [ 10] 0x05822a (step 10)
  [ 11] 0x058282 (step 11)
  [ 12] 0x05828a (step 12)
  [ 13] 0x05828f (step 13)
  [ 14] 0x05829b (step 14)
  [ 15] 0x0582a0 (step 15)
  [ 16] 0x09dcaa (step 16)
  [ 17] 0x0582ac (step 17)
  [ 18] 0x083623 (step 18)
  [ 19] 0x0582b0 (step 19)
  [ 20] 0x083764 (step 20)
  [ 21] 0x08376d (step 21)
  [ 22] 0x07f8a2 (step 22)
  [ 23] 0x07f8c8 (step 23)
  [ 24] 0x07f974 (step 24)
  [ 25] 0x083771 (step 25)
  [ 26] 0x07facf (step 26)
  [ 27] 0x07fadf (step 27)
  [ 28] 0x07fa7f (step 28)
  [ 29] 0x07fa86 (step 29)
  [ 30] 0x083775 (step 30)
  [ 31] 0x061def (step 31)
  [ 32] 0x08377d (step 32)
  [ 33] 0x083379 (step 33)
  [ 34] 0x08337e (step 34)
  [ 35] 0x07f8cc (step 35)
  [ 36] 0x083386 (step 37)
  [ 37] 0x07f7bd (step 38)
  [ 38] 0x08338a (step 39)
  [ 39] 0x08012d (step 40)
  [ 40] 0x080130 (step 41)
  [ 41] 0x08338e (step 42)
  [ 42] 0x083397 (step 43)
  [ 43] 0x080115 (step 44)
  [ 44] 0x080080 (step 45)
  [ 45] 0x080084 (step 47)
  [ 46] 0x080087 (step 48)
  [ 47] 0x08008a (step 49)
  [ 48] 0x080090 (step 50)
  [ 49] 0x080093 (step 51)
  [ 50] 0x080119 (step 52)
  [ 51] 0x08339b (step 53)
  [ 52] 0x08339f (step 54)
  [ 53] 0x0820cd (step 55)
  [ 54] 0x0820e1 (step 56)
  [ 55] 0x0833a3 (step 57)
  [ 56] 0x0833b2 (step 58)
  [ 57] 0x0833bd (step 59)
  [ 58] 0x0833c3 (step 60)
  [ 59] 0x0833c8 (step 67)
  [ 60] 0x0833d0 (step 68)
  [ 61] 0x0833d7 (step 70)
  [ 62] 0x08356a (step 71)
  [ 63] 0x083571 (step 72)
  [ 64] 0x083577 (step 73)
  [ 65] 0x08357e (step 74)
  [ 66] 0x083584 (step 75)
  [ 67] 0x083588 (step 76)
  [ 68] 0x0833db (step 77)
  [ 69] 0x083470 (step 78)
  [ 70] 0x07f920 (step 79)
  [ 71] 0x07f96c (step 80)
  [ 72] 0x083474 (step 82)
  [ 73] 0x083788 (step 83)
  [ 74] 0x083796 (step 84)
  [ 75] 0x061e20 (step 85)
  [ 76] 0x061e27 (step 86)
  [ 77] 0x08379a (step 87)
  [ 78] 0x07f914 (step 88)
  [ 79] 0x08379e (step 91)
  [ 80] 0x0582b4 (step 92)
  [ 81] 0x058d49 (step 93)
  [ 82] 0x0582b8 (step 94)
  [ 83] 0x08bf22 (step 95)
  [ 84] 0x042366 (step 96)
  [ 85] 0x0421a7 (step 97)
  [ 86] 0x000310 (step 98)
  [ 87] 0x001c55 (step 99)
  [ 88] 0x001c33 (step 100)
  [ 89] 0x001c38 (step 101)
  [ 90] 0x001c44 (step 102)
  [ 91] 0x001c7d (step 103)
  [ 92] 0x001ca6 (step 104)
  [ 93] 0x001cbc (step 105)
  [ 94] 0x001ce5 (step 106)
  [ 95] 0x001c81 (step 107)
  [ 96] 0x001c82 (step 108)
  [ 97] 0x001c48 (step 109)
  [ 98] 0x001c3c (step 142)
  [ 99] 0x001c42 (step 143)
  ... (318 more unique PCs)

=== Post-Run State ===
  OP1: [00 00 00 00 00 00 00 00 00]
  begPC=0x000000 curPC=0x000000 endPC=0x000000
  errNo=0x00 errSP=0x000000
  FPSbase=0x01049e FPS=0x01049e
  OPBase=0x000000 OPS=0x000000
  SP=0xd1a85d A=0x00 F=0x00 HL=0xffc966 DE=0x0054a2
```

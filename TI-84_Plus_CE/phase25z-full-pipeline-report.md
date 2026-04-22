# Phase 25Z - Full Pipeline: MEM_INIT -> CreateReal("A") -> ParseInp("2+3")

## Date

2026-04-22

## Objective

Determine whether running `CreateReal("A")` after `MEM_INIT` and before `ParseInp("2+3")` eliminates the prior `errNo=0x8D` failure.

## Setup

- Boot/init sequence copied from `probe-phase25x-meminit-then-parseinp.mjs`.
- Timer IRQ disabled with `createPeripheralBus({ timerInterrupt: false })`.
- MEM_INIT entry: `0x09dee0`
- CreateReal entry: `0x08238a`
- ParseInp entry: `0x099914`
- Variable seed in OP1: `00 41 00 00 00 00 00 00 00`
- Input tokens: `32 70 33 3f`
- Expected OP1 bytes for 5.0: `00 80 50 00 00 00 00 00 00`

## Stage 0: Boot

- Boot result: steps=3025 term=halt lastPc=0x0019b5
- Post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00

## Stage 1: MEM_INIT

- Call frame @ `0xd1a86f`: `f6 ff 7f`
- Outcome: returned to 0x7ffff6
- Steps: 18
- errNo after MEM_INIT: `0x00`
- Post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
- Expected pointer check: OPS=0xd3ffff FPS=0xd1a881 OPBase=0xd3ffff
- MEM_INIT expected values matched: true

## Stage 2: CreateReal("A")

- OP1 pre-call @ `0xd005f8`: `00 41 00 00 00 00 00 00 00`
- Pre-call pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
- Main return frame @ `0xd1a86f`: `f2 ff 7f`
- Error frame @ `0xd1a869`: `00 00 00 fa ff 7f`
- Outcome: returned to 0x7ffff2
- Steps: 231
- errNo after CreateReal: `0x00`
- Registers after CreateReal: A/F=`0x41 / 0x40` HL/DE=`0xd3ffff / 0xd1a881` SP=`0xd1a872`
- OP1 post-call @ `0xd005f8`: `00 00 00 81 a8 d1 41 00 00`
- OP1 decoded after CreateReal: 8.2093141e-130
- Post-CreateReal pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
- OPBase movement: 0xd3ffff -> 0xd3fff6 (delta -9)
- OPS movement: 0xd3ffff -> 0xd3fff6 (delta -9)
- OP1+3 pointer snapshot: `0xd1a881`
- DE snapshot immediately after CreateReal: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
- OP1+3 snapshot immediately after CreateReal: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0

## Stage 3: ParseInp("2+3")

- Tokens @ `0xd00800`: `32 70 33 3f`
- OP1 pre-call @ `0xd005f8`: `00 41 00 00 00 00 00 00 00`
- Pre-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
- Main return frame @ `0xd1a86f`: `fe ff 7f`
- Error frame @ `0xd1a869`: `00 00 00 fa ff 7f`
- Outcome: returned to 0x7ffffe
- Steps: 253
- errNo after ParseInp: `0x00`
- Registers after ParseInp: A/F=`0x00 / 0xb3` HL/DE=`0xd1a893 / 0xd00601` SP=`0xd1a872`
- OP1 post-call @ `0xd005f8`: `00 41 00 00 00 00 00 00 00`
- OP1 exact-byte match for 5.0: false
- OP1 decoded after ParseInp: 0
- Post-ParseInp pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
- curPC/endPC after ParseInp: `0xd1a884 / 0xd1a882`
- CreateReal DE snapshot after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
- CreateReal OP1+3 snapshot after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
- ParseInp milestones: none

## Verdict

- errNo=0x8D fixed by pre-created variable: true
- Final verdict: PARTIAL: errNo cleared, but OP1 did not exactly match 5.0 (decoded=0).
- Numeric diff from expected 5.0: 5

## Recent PCs

- MEM_INIT: `0x09dee0 0x08a98f 0x08a999 0x07f976 0x09df0c 0x09df12 0x000600 0x0138ec 0x09df18 0x09df29 0x04c9ea 0x04c8b4 0x04c9ee 0x04c9f4 0x04c896 0x04c9f8 0x09df2e 0x7ffff6`
- CreateReal: `0x082120 0x082122 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096 0x082126 0x082128 0x08214f 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x08215f 0x07f7bd 0x082163 0x08012d 0x080130 0x082167 0x082173 0x08217e 0x082182 0x082186 0x082198 0x04c990 0x08219c 0x0827c3 0x0827df 0x082823 0x08282d 0x0827e7 0x082823 0x08282d 0x0827ef 0x082823 0x08282d 0x0827f7 0x082823 0x08282d 0x0827ff 0x082823 0x08282d 0x082807 0x082823 0x08282d 0x08280f 0x082823 0x08282d 0x082817 0x082823 0x08282d 0x08281f 0x08282d 0x0821a3 0x08237e 0x082344 0x7ffff2`
- ParseInp: `0x09bf06 0x04c876 0x09bf14 0x09bf47 0x099a8e 0x0828f6 0x082906 0x082912 0x08292b 0x08290a 0x07f978 0x099a93 0x0829b4 0x07f7bd 0x0829b8 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0829bc 0x082961 0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c8 0x08226f 0x082bb9 0x08296e 0x07f978 0x082978 0x099a97 0x07f920 0x07f96c 0x07f974 0x099a9b 0x099aaf 0x09bf4c 0x09bf29 0x09bf47 0x09bf50 0x09bf47 0x099ab3 0x099af1 0x07fa0d 0x07f9ff 0x07f978 0x099a9f 0x0828d1 0x082902 0x082912 0x08292b 0x08290a 0x07f978 0x0828d5 0x07f7bd 0x0828d9 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0828dd 0x7ffffe`

## Console Output

```text
=== Phase 25Z: MEM_INIT -> CreateReal("A") -> ParseInp("2+3") ===
boot: steps=3025 term=halt lastPc=0x0019b5
post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00

=== STAGE 1: MEM_INIT ===
MEM_INIT outcome: returned to 0x7ffff6
MEM_INIT steps=18 errNo=0x00
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
expected pointer check: OPS=0xd3ffff FPS=0xd1a881 OPBase=0xd3ffff matched=true

=== STAGE 2: CreateReal("A") ===
CreateReal OP1 pre-call @ 0xd005f8: [00 41 00 00 00 00 00 00 00]
CreateReal pre-call pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
CreateReal main return @ 0xd1a86f: [f2 ff 7f]
CreateReal err frame @ 0xd1a869: [00 00 00 fa ff 7f]
CreateReal outcome: returned to 0x7ffff2
CreateReal errNo=0x00 DE=0xd1a881 OP1+3=0xd1a881
CreateReal post-call OP1 @ 0xd005f8: [00 00 00 81 a8 d1 41 00 00] decoded=8.2093141e-130
CreateReal post-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
CreateReal OPBase movement: 0xd3ffff -> 0xd3fff6 (delta -9)
CreateReal DE snapshot: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
CreateReal OP1+3 snapshot: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0

=== STAGE 3: ParseInp("2+3") ===
ParseInp tokens @ 0xd00800: [32 70 33 3f]
ParseInp OP1 pre-call @ 0xd005f8: [00 41 00 00 00 00 00 00 00]
ParseInp pre-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
ParseInp main return @ 0xd1a86f: [fe ff 7f]
ParseInp err frame @ 0xd1a869: [00 00 00 fa ff 7f]
ParseInp outcome: returned to 0x7ffffe
ParseInp errNo=0x00 steps=253
ParseInp OP1 post-call @ 0xd005f8: [00 41 00 00 00 00 00 00 00] exact=false decoded=0
ParseInp post-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
CreateReal DE after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
CreateReal OP1+3 after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
```

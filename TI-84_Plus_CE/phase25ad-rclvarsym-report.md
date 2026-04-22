# Phase 25AD - RclVarSym: CreateReal("A")=42.0 then RclVarSym("A")

## Date

2026-04-22

## Objective

Test `RclVarSym` (0x09AC77): after creating variable A=42.0 via `CreateReal`, call `RclVarSym` with OP1 set to variable A and verify OP1 contains 42.0 on return.

## Setup

- Boot/init sequence from `probe-phase25z-full-pipeline.mjs`.
- Timer IRQ disabled with `createPeripheralBus({ timerInterrupt: false })`.
- MEM_INIT entry: `0x09dee0`
- CreateReal entry: `0x08238a`
- RclVarSym entry: `0x09ac77`
- Variable A seed in OP1: `00 41 00 00 00 00 00 00 00`
- Value 42.0 BCD: `00 81 42 00 00 00 00 00 00`

## Stage 0: Boot

- Boot result: steps=3025 term=halt lastPc=0x0019b5
- Post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00

## Stage 1: MEM_INIT

- Call frame @ `0xd1a86f`: `f6 ff 7f`
- Outcome: returned to 0x7ffff6
- Steps: 18
- errNo after MEM_INIT: `0x00`
- Post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00

## Stage 2: CreateReal("A") + write 42.0

- OP1 pre-call @ `0xd005f8`: `00 41 00 00 00 00 00 00 00`
- Pre-call pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
- Main return frame @ `0xd1a86f`: `f2 ff 7f`
- Error frame @ `0xd1a869`: `00 00 00 fa ff 7f`
- Outcome: returned to 0x7ffff2
- Steps: 231
- errNo after CreateReal: `0x00`
- Registers: A/F=`0x41 / 0x40` HL/DE=`0xd3ffff / 0xd1a881` SP=`0xd1a872`
- DE after CreateReal (data ptr): `0xd1a881`
- Wrote 42.0 BCD at DE: `00 81 42 00 00 00 00 00 00`
- Readback from DE after write: `00 81 42 00 00 00 00 00 00` decoded=42
- Post-CreateReal pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00

## Stage 3: RclVarSym("A")

- OP1 pre-call @ `0xd005f8`: `00 41 00 00 00 00 00 00 00`
- Pre-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
- Main return frame @ `0xd1a86f`: `fe ff 7f`
- Error frame @ `0xd1a869`: `00 00 00 fe ff 7f`
- Outcome: returned to 0x7ffffe
- Steps: 43
- errNo after RclVarSym: `0x00`
- Registers: A/F=`0x00 / 0x44` HL/DE=`0xd1a88a / 0xd00601` SP=`0xd1a872`
- OP1 post-call @ `0xd005f8`: `00 81 42 00 00 00 00 00 00`
- OP1 decoded after RclVarSym: 42
- Post-RclVarSym pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00

## Verdict

- RclVarSym returned cleanly: true
- errNo after RclVarSym: 0x00
- OP1 contains 42.0: true
- Final verdict: SUCCESS: RclVarSym returned cleanly, errNo=0, OP1 contains 42.0.
- Numeric diff from expected 42.0: 0

## Recent PCs

- MEM_INIT: `0x09dee0 0x08a98f 0x08a999 0x07f976 0x09df0c 0x09df12 0x000600 0x0138ec 0x09df18 0x09df29 0x04c9ea 0x04c8b4 0x04c9ee 0x04c9f4 0x04c896 0x04c9f8 0x09df2e 0x7ffff6`
- CreateReal: `0x082120 0x082122 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096 0x082126 0x082128 0x08214f 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x08215f 0x07f7bd 0x082163 0x08012d 0x080130 0x082167 0x082173 0x08217e 0x082182 0x082186 0x082198 0x04c990 0x08219c 0x0827c3 0x0827df 0x082823 0x08282d 0x0827e7 0x082823 0x08282d 0x0827ef 0x082823 0x08282d 0x0827f7 0x082823 0x08282d 0x0827ff 0x082823 0x08282d 0x082807 0x082823 0x08282d 0x08280f 0x082823 0x08282d 0x082817 0x082823 0x08282d 0x08281f 0x08282d 0x0821a3 0x08237e 0x082344 0x7ffff2`
- RclVarSym: `0x09ac77 0x082c50 0x0846ea 0x08011f 0x0846ee 0x0846f2 0x08470a 0x082be2 0x084716 0x08471b 0x08472c 0x084735 0x08473d 0x04c885 0x084748 0x082c54 0x082c58 0x082c3f 0x0821ae 0x04c8a3 0x0821b2 0x0821b4 0x0821b7 0x082c44 0x082c4e 0x09ac7b 0x09acf0 0x0801d3 0x07f7c4 0x0801dd 0x09acf4 0x09ad14 0x04c8b4 0x09ad19 0x0821b2 0x0821b4 0x0821b7 0x09ad1d 0x09ad3c 0x07f9fb 0x07f978 0x09ad40 0x7ffffe`

## Console Output

```text
=== Phase 25AD: RclVarSym — CreateReal("A")=42.0 then RclVarSym("A") ===
boot: steps=3025 term=halt lastPc=0x0019b5
post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00

=== STAGE 1: MEM_INIT ===
MEM_INIT outcome: returned to 0x7ffff6
MEM_INIT steps=18 errNo=0x00
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00

=== STAGE 2: CreateReal("A") + write 42.0 ===
CreateReal OP1 pre-call @ 0xd005f8: [00 41 00 00 00 00 00 00 00]
CreateReal main return @ 0xd1a86f: [f2 ff 7f]
CreateReal err frame @ 0xd1a869: [00 00 00 fa ff 7f]
CreateReal outcome: returned to 0x7ffff2
CreateReal errNo=0x00 DE=0xd1a881
Wrote 42.0 BCD at DE=0xd1a881: [00 81 42 00 00 00 00 00 00]
Readback from DE: [00 81 42 00 00 00 00 00 00] decoded=42
Post-CreateReal pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00

=== STAGE 3: RclVarSym("A") ===
RclVarSym OP1 pre-call @ 0xd005f8: [00 41 00 00 00 00 00 00 00]
RclVarSym main return @ 0xd1a86f: [fe ff 7f]
RclVarSym err frame @ 0xd1a869: [00 00 00 fe ff 7f]
RclVarSym pre-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
RclVarSym outcome: returned to 0x7ffffe
RclVarSym errNo=0x00 steps=43
RclVarSym registers: A/F=0x00/0x44 HL=0xd1a88a DE=0xd00601 SP=0xd1a872
RclVarSym OP1 post-call @ 0xd005f8: [00 81 42 00 00 00 00 00 00] decoded=42
Post-RclVarSym pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
```

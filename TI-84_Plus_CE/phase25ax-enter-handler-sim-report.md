# Phase 25AX - ENTER Handler Simulation (pre-created Ans direct-eval reference)
## Date
2026-04-24
## Summary
- Pipeline: cold boot -> MEM_INIT -> CreateReal("Ans") -> restore OPS only -> ParseInp("2+3") -> direct Ans slot readback -> RclVarSym("Ans")
- ParseInp runs with OP1 cleared so the internal `StoAns` path can store into the pre-created `Ans` slot.
- Tokens: `32 70 33 3f` at `0xd00800`
- Ans OP1: `00 72 00 00 00 00 00 00 00`
- Expected 5.0 BCD: `00 80 50 00 00 00 00 00 00`
## Stage 0: Boot
- Boot: steps=3025 term=halt lastPc=0x0019b5
- Post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
## Stage 1: MEM_INIT
- Frame: @0xd1a86f [f6 ff 7f]
- Outcome: returned to 0x7ffff6
- Steps: 18
- errNo: 0x00
- Post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
## Stage 2: CreateReal("Ans")
- OP1 pre: [00 72 00 00 00 00 00 00 00]
- Frame: @0xd1a86f [f2 ff 7f] errFrame=0xd1a869 [fa ff 7f 00 00 00]
- Outcome: returned to 0x7ffff2
- Steps: 214
- errNo: 0x00
- DE slot before zero-fill: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
- DE slot after zero-fill: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
- Post-CreateReal pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
## Stage 2B: Restore FPS/OPS
- Before restore: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
- After restore: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3ffff pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
- Restored OPS=0xd3ffff from MEM_INIT baseline (FPS/FPSbase kept post-CreateReal at 0xd1a88a/0xd1a88a).
## Stage 3: ParseInp("2+3")
- OP1 pre: [00 00 00 00 00 00 00 00 00]
- Frame: @0xd1a86f [fe ff 7f] errFrame=0xd1a869 [fa ff 7f 00 00 00]
- Outcome: returned to 0x7ffffe
- Steps: 903
- errNo: 0x8d
- OP1 post: [00 80 50 00 00 00 00 00 00] decoded=5
- Saved Ans slot after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 80 50 00 00 00 00 00 00] decoded=5
- Post-ParseInp pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a881 OPBase=0xd3fff6 OPS=0xd40002 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
- Note: `errNo=0x8D` is accepted here if OP1 and the Ans slot both decode to 5.0.
## Stage 4: RclVarSym("Ans")
- OP1 pre: [00 72 00 00 00 00 00 00 00]
- Frame: @0xd1a86f [fe ff 7f] errFrame=0xd1a869 [fe ff 7f 00 00 00]
- Outcome: returned to 0x7ffffe
- Steps: 44
- errNo: 0x8d
- OP1 post: [00 70 00 8a 9a 09 fe ff 7f] decoded=9.100106565850001e-18
- Post-RclVarSym pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
## Verdict
- MEM_INIT returned cleanly: true
- CreateReal returned cleanly: true
- CreateReal errNo=0x00: true
- ParseInp returned cleanly: true
- ParseInp errNo acceptable: true
- ParseInp OP1=5.0: true
- Ans slot exact 5.0 BCD: true
- Ans slot decoded 5.0: true
- RclVarSym returned cleanly: true
- RclVarSym OP1=5.0: false
- Final verdict: INCOMPLETE: parse=5 slot=5 recall=9.100106565850001e-18
## Console Output
```text
=== Phase 25AX: ENTER Handler Simulation ===
boot: steps=3025 term=halt lastPc=0x0019b5
post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
MEM_INIT outcome: returned to 0x7ffff6
MEM_INIT steps=18 errNo=0x00
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
CreateReal(Ans) OP1 pre-call: [00 72 00 00 00 00 00 00 00]
CreateReal(Ans) pre pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
CreateReal(Ans) outcome: returned to 0x7ffff2
CreateReal(Ans) errNo=0x00 DE=0xd1a881
CreateReal(Ans) DE before zero-fill: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
CreateReal(Ans) DE after zero-fill: ptr=0xd1a881 readable=true inRam=true bytes=[00 00 00 00 00 00 00 00 00] decoded=0
post-CreateReal pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
restored OPS to MEM_INIT baseline (FPS/FPSbase kept post-CreateReal): before=tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
restored OPS to MEM_INIT baseline (FPS/FPSbase kept post-CreateReal): after=tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3ffff pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
ParseInp tokens @ 0xd00800: [32 70 33 3f]
ParseInp OP1 pre-call: [00 00 00 00 00 00 00 00 00]
ParseInp pre pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3ffff pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
ParseInp outcome: returned to 0x7ffffe
ParseInp steps=903 errNo=0x8d
ParseInp OP1 post-call @ 0xd005f8: [00 80 50 00 00 00 00 00 00] decoded=5
Saved Ans slot after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 80 50 00 00 00 00 00 00] decoded=5
post-ParseInp pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a881 OPBase=0xd3fff6 OPS=0xd40002 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
Reset allocator to post-CreateReal: FPS=0xd1a88a FPSbase=0xd1a88a OPS=0xd3fff6
RclVarSym(Ans) OP1 pre-call: [00 72 00 00 00 00 00 00 00]
RclVarSym(Ans) pre pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
RclVarSym outcome: returned to 0x7ffffe
RclVarSym errNo=0x8d steps=44
RclVarSym OP1 post-call @ 0xd005f8: [00 70 00 8a 9a 09 fe ff 7f] decoded=9.100106565850001e-18
post-RclVarSym pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
```

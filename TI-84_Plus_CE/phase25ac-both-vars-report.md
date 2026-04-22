# Phase 25AC - ParseInp with Both Ans and Variable A

## Date

2026-04-22

## Objective

Test whether creating BOTH Ans and variable "A" (with stored 42.0) changes ParseInp("2+3") behavior compared to single-variable or no-variable controls.

## Scenarios

- **A**: MEM_INIT -> CreateReal("A") w/ 42.0 -> CreateReal(Ans) -> OP1=[00 41 ...] (var A) -> ParseInp("2+3")
- **B**: MEM_INIT -> CreateReal("A") w/ 42.0 -> CreateReal(Ans) -> OP1=zeros -> ParseInp("2+3")
- **C**: MEM_INIT -> ParseInp("2+3") with OP1=zeros, no variables (control)

## Summary Table

| Scenario | Steps | errNo | Termination | OP1 bytes | OP1 decoded | Classification |
|----------|-------|-------|-------------|-----------|-------------|----------------|
| Scenario A: Both vars + OP1=variable A | 720 | 0x00 | FAKE_RET | 00 80 00 00 00 00 00 00 00 | 0 | other |
| Scenario B: Both vars + OP1=zeros | 908 | 0x8d | FAKE_RET | 00 80 50 00 00 00 00 00 00 | 5 | computed_5_exact |
| Scenario C: Control (no vars, OP1=zeros) | 919 | 0x8d | FAKE_RET | 00 80 50 00 00 00 00 00 00 | 5 | computed_5_exact |

## Detailed Results

### Scenario A: Both vars + OP1=variable A

- MEM_INIT: returned to 0x7ffff6 steps=18
- Post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
- CreateReal("A"): returned to 0x7ffff2 steps=231 errNo=0x00 DE=0xd1a881
- CreateReal(Ans): returned to 0x7fffee steps=205 errNo=0x00 DE=0xd1a88a
- ParseInp: returned to 0x7ffffe steps=720
- ParseInp errNo: `0x00`
- ParseInp termination: FAKE_RET
- OP1 pre-call: `00 41 00 00 00 00 00 00 00`
- OP1 post-call: `00 80 00 00 00 00 00 00 00`
- OP1 decoded: 0
- OP1 classification: OP1 ended in some other state (0).
- Pointers before ParseInp: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a893 OPBase=0xd3ffed OPS=0xd3ffed pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
- Pointers after ParseInp: tempMem=0xd1a89c FPSbase=0xd1a89c FPS=0xd1a89c OPBase=0xd3ffe4 OPS=0xd3ffe4 pTemp=0xd3ffe4 progPtr=0xd3ffe4 newDataPtr=0xd1a89c errSP=0xd1a869 errNo=0x00 begPC=0xd1a883 curPC=0xd1a885 endPC=0xd22982
- Variable A data after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 81 42 00 00 00 00 00 00] decoded=42
- Recent PCs: `0x09bf06 0x04c876 0x09bf14 0x09bf47 0x099a8e 0x0828f6 0x082906 0x082912 0x08292b 0x08290a 0x07f978 0x099a93 0x0829b4 0x07f7bd 0x0829b8 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0829bc 0x082961 0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c8 0x08226f 0x082bb9 0x08296e 0x07f978 0x082978 0x099a97 0x07f920 0x07f96c 0x07f974 0x099a9b 0x099aaf 0x09bf4c 0x09bf29 0x09bf47 0x09bf50 0x09bf47 0x099ab3 0x099af1 0x07fa0d 0x07f9ff 0x07f978 0x099a9f 0x0828d1 0x082902 0x082912 0x08292b 0x08290a 0x07f978 0x0828d5 0x07f7bd 0x0828d9 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0828dd 0x7ffffe`

### Scenario B: Both vars + OP1=zeros

- MEM_INIT: returned to 0x7ffff6 steps=18
- Post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
- CreateReal("A"): returned to 0x7ffff2 steps=231 errNo=0x00 DE=0xd1a881
- CreateReal(Ans): returned to 0x7fffee steps=205 errNo=0x00 DE=0xd1a88a
- ParseInp: returned to 0x7ffffe steps=908
- ParseInp errNo: `0x8d`
- ParseInp termination: FAKE_RET
- OP1 pre-call: `00 00 00 00 00 00 00 00 00`
- OP1 post-call: `00 80 50 00 00 00 00 00 00`
- OP1 decoded: 5
- OP1 classification: OP1 exactly matches computed 5.0.
- Pointers before ParseInp: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a893 OPBase=0xd3ffed OPS=0xd3ffed pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
- Pointers after ParseInp: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a88a OPBase=0xd3ffed OPS=0xd3fff0 pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
- Variable A data after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 81 42 00 00 00 00 00 00] decoded=42
- Recent PCs: `0x09bf06 0x04c876 0x09bf14 0x09bf47 0x099a8e 0x0828f6 0x082906 0x082912 0x08292b 0x08290a 0x07f978 0x099a93 0x0829b4 0x07f7bd 0x0829b8 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0829bc 0x082961 0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c8 0x08226f 0x082bb9 0x08296e 0x07f978 0x082978 0x099a97 0x07f920 0x07f96c 0x07f974 0x099a9b 0x099aaf 0x09bf4c 0x09bf29 0x09bf47 0x09bf50 0x09bf47 0x099ab3 0x099af1 0x07fa0d 0x07f9ff 0x07f978 0x099a9f 0x0828d1 0x082902 0x082912 0x08292b 0x08290a 0x07f978 0x0828d5 0x07f7bd 0x0828d9 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0828dd 0x7ffffe`

### Scenario C: Control (no vars, OP1=zeros)

- MEM_INIT: returned to 0x7ffff6 steps=18
- Post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
- ParseInp: returned to 0x7ffffe steps=919
- ParseInp errNo: `0x8d`
- ParseInp termination: FAKE_RET
- OP1 pre-call: `00 00 00 00 00 00 00 00 00`
- OP1 post-call: `00 80 50 00 00 00 00 00 00`
- OP1 decoded: 5
- OP1 classification: OP1 exactly matches computed 5.0.
- Pointers before ParseInp: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
- Pointers after ParseInp: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a878 OPBase=0xd3ffff OPS=0xd40002 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
- Recent PCs: `0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c8 0x08226f 0x082bb9 0x08296e 0x07f978 0x082978 0x099a97 0x07f920 0x07f96c 0x07f974 0x099a9b 0x099aaf 0x09bf4c 0x09bf29 0x09bf47 0x09bf50 0x09bf47 0x099ab3 0x099aba 0x08383d 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096 0x083841 0x083843 0x0846ea 0x08011f 0x0846ee 0x0846f2 0x08470a 0x082be2 0x084716 0x099abf 0x099ac1 0x099af1 0x07fa0d 0x07f9ff 0x07f978 0x099a9f 0x0828d1 0x082902 0x082912 0x08292b 0x08290a 0x07f978 0x0828d5 0x07f7bd 0x0828d9 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0828dd 0x7ffffe`

## Console Output

```text
=== Phase 25AC: ParseInp with Both Ans and Variable A ===
Date: 2026-04-22T18:07:22.119Z

============================================================
=== Scenario A: Both vars + OP1=variable A ===
============================================================
boot: steps=3025 term=halt lastPc=0x0019b5

--- MEM_INIT ---
MEM_INIT outcome: returned to 0x7ffff6 steps=18 errNo=0x00
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000

--- CreateReal("A") ---
OP1 pre-call: [00 41 00 00 00 00 00 00 00]
pre-call pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
return frame @ 0xd1a86f: [f2 ff 7f]
err frame @ 0xd1a869: [00 00 00 fa ff 7f]
CreateReal("A") outcome: returned to 0x7ffff2 steps=231 errNo=0x00
DE=0xd1a881 OP1 post: [00 00 00 81 a8 d1 41 00 00]
post pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
Wrote 42.0 BCD at DE=0xd1a881: [00 81 42 00 00 00 00 00 00]

--- CreateReal(Ans) ---
OP1 pre-call: [00 72 00 00 00 00 00 00 00]
return frame @ 0xd1a86f: [ee ff 7f]
err frame @ 0xd1a869: [00 00 00 fa ff 7f]
CreateReal(Ans) outcome: returned to 0x7fffee steps=205 errNo=0x00
DE=0xd1a88a OP1 post: [00 00 00 8a a8 d1 72 00 00]
post pointers: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a893 OPBase=0xd3ffed OPS=0xd3ffed pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
Variable A data after Ans creation: [00 81 42 00 00 00 00 00 00] decoded=42

--- ParseInp("2+3") ---
OP1 seeded with variable A name: [00 41 00 00 00 00 00 00 00]
ParseInp pre-call OP1: [00 41 00 00 00 00 00 00 00]
ParseInp pre-call pointers: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a893 OPBase=0xd3ffed OPS=0xd3ffed pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
ParseInp return frame @ 0xd1a86f: [fe ff 7f]
ParseInp err frame @ 0xd1a869: [00 00 00 fa ff 7f]
ParseInp outcome: returned to 0x7ffffe
ParseInp steps=720 errNo=0x00
ParseInp OP1 post: [00 80 00 00 00 00 00 00 00] decoded=0
ParseInp OP1 classification: OP1 ended in some other state (0).
ParseInp post pointers: tempMem=0xd1a89c FPSbase=0xd1a89c FPS=0xd1a89c OPBase=0xd3ffe4 OPS=0xd3ffe4 pTemp=0xd3ffe4 progPtr=0xd3ffe4 newDataPtr=0xd1a89c errSP=0xd1a869 errNo=0x00 begPC=0xd1a883 curPC=0xd1a885 endPC=0xd22982
ParseInp termination: FAKE_RET
Variable A data after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 81 42 00 00 00 00 00 00] decoded=42
ParseInp recent PCs: 0x09bf06 0x04c876 0x09bf14 0x09bf47 0x099a8e 0x0828f6 0x082906 0x082912 0x08292b 0x08290a 0x07f978 0x099a93 0x0829b4 0x07f7bd 0x0829b8 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0829bc 0x082961 0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c8 0x08226f 0x082bb9 0x08296e 0x07f978 0x082978 0x099a97 0x07f920 0x07f96c 0x07f974 0x099a9b 0x099aaf 0x09bf4c 0x09bf29 0x09bf47 0x09bf50 0x09bf47 0x099ab3 0x099af1 0x07fa0d 0x07f9ff 0x07f978 0x099a9f 0x0828d1 0x082902 0x082912 0x08292b 0x08290a 0x07f978 0x0828d5 0x07f7bd 0x0828d9 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0828dd 0x7ffffe

============================================================
=== Scenario B: Both vars + OP1=zeros ===
============================================================
boot: steps=3025 term=halt lastPc=0x0019b5

--- MEM_INIT ---
MEM_INIT outcome: returned to 0x7ffff6 steps=18 errNo=0x00
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000

--- CreateReal("A") ---
OP1 pre-call: [00 41 00 00 00 00 00 00 00]
pre-call pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
return frame @ 0xd1a86f: [f2 ff 7f]
err frame @ 0xd1a869: [00 00 00 fa ff 7f]
CreateReal("A") outcome: returned to 0x7ffff2 steps=231 errNo=0x00
DE=0xd1a881 OP1 post: [00 00 00 81 a8 d1 41 00 00]
post pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
Wrote 42.0 BCD at DE=0xd1a881: [00 81 42 00 00 00 00 00 00]

--- CreateReal(Ans) ---
OP1 pre-call: [00 72 00 00 00 00 00 00 00]
return frame @ 0xd1a86f: [ee ff 7f]
err frame @ 0xd1a869: [00 00 00 fa ff 7f]
CreateReal(Ans) outcome: returned to 0x7fffee steps=205 errNo=0x00
DE=0xd1a88a OP1 post: [00 00 00 8a a8 d1 72 00 00]
post pointers: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a893 OPBase=0xd3ffed OPS=0xd3ffed pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
Variable A data after Ans creation: [00 81 42 00 00 00 00 00 00] decoded=42

--- ParseInp("2+3") ---
OP1 cleared to zeros: [00 00 00 00 00 00 00 00 00]
ParseInp pre-call OP1: [00 00 00 00 00 00 00 00 00]
ParseInp pre-call pointers: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a893 OPBase=0xd3ffed OPS=0xd3ffed pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
ParseInp return frame @ 0xd1a86f: [fe ff 7f]
ParseInp err frame @ 0xd1a869: [00 00 00 fa ff 7f]
ParseInp outcome: returned to 0x7ffffe
ParseInp steps=908 errNo=0x8d
ParseInp OP1 post: [00 80 50 00 00 00 00 00 00] decoded=5
ParseInp OP1 classification: OP1 exactly matches computed 5.0.
ParseInp post pointers: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a88a OPBase=0xd3ffed OPS=0xd3fff0 pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
ParseInp termination: FAKE_RET
Variable A data after ParseInp: ptr=0xd1a881 readable=true inRam=true bytes=[00 81 42 00 00 00 00 00 00] decoded=42
ParseInp recent PCs: 0x09bf06 0x04c876 0x09bf14 0x09bf47 0x099a8e 0x0828f6 0x082906 0x082912 0x08292b 0x08290a 0x07f978 0x099a93 0x0829b4 0x07f7bd 0x0829b8 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0829bc 0x082961 0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c8 0x08226f 0x082bb9 0x08296e 0x07f978 0x082978 0x099a97 0x07f920 0x07f96c 0x07f974 0x099a9b 0x099aaf 0x09bf4c 0x09bf29 0x09bf47 0x09bf50 0x09bf47 0x099ab3 0x099af1 0x07fa0d 0x07f9ff 0x07f978 0x099a9f 0x0828d1 0x082902 0x082912 0x08292b 0x08290a 0x07f978 0x0828d5 0x07f7bd 0x0828d9 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0828dd 0x7ffffe

============================================================
=== Scenario C: Control (no vars, OP1=zeros) ===
============================================================
boot: steps=3025 term=halt lastPc=0x0019b5

--- MEM_INIT ---
MEM_INIT outcome: returned to 0x7ffff6 steps=18 errNo=0x00
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000

--- ParseInp("2+3") ---
OP1 cleared to zeros (control): [00 00 00 00 00 00 00 00 00]
ParseInp pre-call OP1: [00 00 00 00 00 00 00 00 00]
ParseInp pre-call pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
ParseInp return frame @ 0xd1a86f: [fe ff 7f]
ParseInp err frame @ 0xd1a869: [00 00 00 fa ff 7f]
ParseInp outcome: returned to 0x7ffffe
ParseInp steps=919 errNo=0x8d
ParseInp OP1 post: [00 80 50 00 00 00 00 00 00] decoded=5
ParseInp OP1 classification: OP1 exactly matches computed 5.0.
ParseInp post pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a878 OPBase=0xd3ffff OPS=0xd40002 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
ParseInp termination: FAKE_RET
ParseInp recent PCs: 0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c8 0x08226f 0x082bb9 0x08296e 0x07f978 0x082978 0x099a97 0x07f920 0x07f96c 0x07f974 0x099a9b 0x099aaf 0x09bf4c 0x09bf29 0x09bf47 0x09bf50 0x09bf47 0x099ab3 0x099aba 0x08383d 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096 0x083841 0x083843 0x0846ea 0x08011f 0x0846ee 0x0846f2 0x08470a 0x082be2 0x084716 0x099abf 0x099ac1 0x099af1 0x07fa0d 0x07f9ff 0x07f978 0x099a9f 0x0828d1 0x082902 0x082912 0x08292b 0x08290a 0x07f978 0x0828d5 0x07f7bd 0x0828d9 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0828dd 0x7ffffe

============================================================
=== SUMMARY ===
============================================================
Scenario A: Both vars + OP1=variable A:
  steps=720  errNo=0x00  termination=FAKE_RET
  OP1=[00 80 00 00 00 00 00 00 00]  decoded=0
  classification: OP1 ended in some other state (0).
Scenario B: Both vars + OP1=zeros:
  steps=908  errNo=0x8d  termination=FAKE_RET
  OP1=[00 80 50 00 00 00 00 00 00]  decoded=5
  classification: OP1 exactly matches computed 5.0.
Scenario C: Control (no vars, OP1=zeros):
  steps=919  errNo=0x8d  termination=FAKE_RET
  OP1=[00 80 50 00 00 00 00 00 00]  decoded=5
  classification: OP1 exactly matches computed 5.0.
```

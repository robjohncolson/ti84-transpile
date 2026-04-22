# Phase 25AB - ParseInp errFrame hlPayload=0x099929 Probe

## Goal

Test using `hlPayload=0x099929` (ParseInp's internal error catch point) in the
PushErrorHandler frame, instead of the previous `0x000000` that caused execution
to jump to boot after the error-restore stub unwound.

## Setup

- Cold boot + MEM_INIT at `0x09DEE0`
- Token buffer at `0xD00800`: `[0x32, 0x70, 0x33, 0x3F]` ("2+3")
- Full 18-byte PushErrorHandler error frame on the stack:
  - SP+0  = `0x061E27` (normal-return cleanup stub)
  - SP+3  = `0x061DD1` (error-restore stub)
  - SP+6  = OPS - OPBase (delta)
  - SP+9  = FPS - FPSbase (delta)
  - SP+12 = previous errSP (`0x000000`)
  - SP+15 = hlPayload (`0x099929` = ParseInp error catch point)
- ParseInp called at `0x099914` with budget=1500000

## Error Frame Details

- Frame base: `0xd1a85d`
- Frame bytes: `27 1e 06 d1 1d 06 00 00 00 00 00 00 00 00 00 29 99 09`
- FAKE_RET @ `0xd1a86f`: `fe ff 7f`
- opsDelta=0x000000 fpsDelta=0x000000 prevErrSP=0x000000 hlPayload=0x099929

## Results

| Metric | Value |
| ------ | ----- |
| Classification | **RETURN_HIT** |
| Final PC | `0x7ffffe` |
| Steps | 920 |
| Termination | return_hit |
| Return hit (FAKE_RET) | true |
| 0x099929 reached | true |
| Missing block | true @ `0x7ffffe` |
| Cleanup stub hits | 0 |
| Error restore hits | 1 |
| errNo | `0x8d` |
| OP1 | `00 80 50 00 00 00 00 00 00` |
| OP1 decoded | 5 |

## Pointer State

- Before: FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff errSP=0xd1a85d errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
- After:  FPSbase=0xd1a881 FPS=0xd1a878 OPBase=0xd3ffff OPS=0xd40002 pTemp=0xd3ffff progPtr=0xd3ffff errSP=0x000000 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804

## Interesting Events

- 0x061d3a (ErrUndefined dispatch)
- 0x061db2 (JError)
- 0x061dd1 (PushErrorHandler error-restore stub)
- 0x099929 (ERROR_CATCH_POINT (ParseInp error catch))
- 0x7ffffe (FAKE_RET)

## Recent PCs (last 64)

```
0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c8 0x08226f 0x082bb9 0x08296e 0x07f978 0x082978 0x099a97 0x07f920 0x07f96c 0x07f974 0x099a9b 0x099aaf 0x09bf4c 0x09bf29 0x09bf47 0x09bf50 0x09bf47 0x099ab3 0x099aba 0x08383d 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096 0x083841 0x083843 0x0846ea 0x08011f 0x0846ee 0x0846f2 0x08470a 0x082be2 0x084716 0x099abf 0x099ac1 0x099af1 0x07fa0d 0x07f9ff 0x07f978 0x099a9f 0x0828d1 0x082902 0x082912 0x08292b 0x08290a 0x07f978 0x0828d5 0x07f7bd 0x0828d9 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0828dd 0x7ffffe
```

## Console Output

```text
=== Phase 25AB: ParseInp with hlPayload=0x099929 (error catch point) ===
boot: steps=3025 term=halt lastPc=0x0019b5
MEM_INIT: returned=true steps=18 term=return_hit finalPc=0x7ffff6
tokens @ 0xd00800: [32 70 33 3f]
OP1 pre-call @ 0xd005f8: [00 00 00 00 00 00 00 00 00]
pre-ParseInp: FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff errSP=0xd1a85d errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
err frame @ 0xd1a85d: [27 1e 06 d1 1d 06 00 00 00 00 00 00 00 00 00 29 99 09]
  fakeRet @ 0xd1a86f: [fe ff 7f]
  opsDelta=0x000000 fpsDelta=0x000000 prevErrSP=0x000000 hlPayload=0x099929
calling ParseInp @ 0x099914 with budget=1500000...

=== Results ===
classification: RETURN_HIT
finalPc: 0x7ffffe
steps: 920
termination: return_hit
returnHit: true
errorCatchPointHit (0x099929 reached): true
missingBlock: true @ 0x7ffffe
cleanupStubHits: 0
errorRestoreHits: 1
errNo: 0x8d
OP1 post-call: [00 80 50 00 00 00 00 00 00]
OP1 decoded: 5
post-ParseInp: FPSbase=0xd1a881 FPS=0xd1a878 OPBase=0xd3ffff OPS=0xd40002 pTemp=0xd3ffff progPtr=0xd3ffff errSP=0x000000 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
interesting events: 0x061d3a (ErrUndefined dispatch) -> 0x061db2 (JError) -> 0x061dd1 (PushErrorHandler error-restore stub) -> 0x099929 (ERROR_CATCH_POINT (ParseInp error catch)) -> 0x7ffffe (FAKE_RET)
recent PCs (last 64): 0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c8 0x08226f 0x082bb9 0x08296e 0x07f978 0x082978 0x099a97 0x07f920 0x07f96c 0x07f974 0x099a9b 0x099aaf 0x09bf4c 0x09bf29 0x09bf47 0x09bf50 0x09bf47 0x099ab3 0x099aba 0x08383d 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096 0x083841 0x083843 0x0846ea 0x08011f 0x0846ee 0x0846f2 0x08470a 0x082be2 0x084716 0x099abf 0x099ac1 0x099af1 0x07fa0d 0x07f9ff 0x07f978 0x099a9f 0x0828d1 0x082902 0x082912 0x08292b 0x08290a 0x07f978 0x0828d5 0x07f7bd 0x0828d9 0x07f7a8 0x07f7ad 0x07f7b0 0x07f7b4 0x0828dd 0x7ffffe
```


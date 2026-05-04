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
| Classification | **MISSING_BLOCK** |
| Final PC | `0x0019b5` |
| Steps | 53 |
| Termination | halt |
| Return hit (FAKE_RET) | false |
| 0x099929 reached | false |
| Missing block | true @ `0x000800` |
| Cleanup stub hits | 0 |
| Error restore hits | 0 |
| errNo | `0x8d` |
| OP1 | `00 00 00 00 00 00 00 00 00` |
| OP1 decoded | 0 |

## Pointer State

- Before: FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff errSP=0xd1a85d errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
- After:  FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff errSP=0xd1a85d errNo=0x8d begPC=0xd00800 curPC=0xd00800 endPC=0xd00804

## Interesting Events

- 0x061d3a (ErrUndefined dispatch)
- 0x061db2 (JError)

## Recent PCs (last 64)

```
0x099914 0x099b81 0x09991d 0x099b81 0x099925 0x099b18 0x08383d 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096 0x083841 0x083843 0x0846ea 0x08011f 0x0846ee 0x0846f2 0x08470a 0x082be2 0x084716 0x099b1c 0x061d3a 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b1 0x000000 0x000003 0x000658 0x000673 0x000679 0x00067e 0x000688 0x000697 0x00069a 0x0006a9 0x000038 0x000080 0x001768 0x000800 0x000804 0x000066 0x000047 0x0008bb 0x00004c 0x0019b5
```

## Console Output

```text
=== Phase 25AB: ParseInp with hlPayload=0x099929 (error catch point) ===
boot: steps=31 term=halt lastPc=0x0019b5
MEM_INIT: returned=true steps=18 term=return_hit finalPc=0x7ffff6
tokens @ 0xd00800: [32 70 33 3f]
OP1 pre-call @ 0xd005f8: [00 00 00 00 00 00 00 00 00]
pre-ParseInp: FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff errSP=0xd1a85d errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
err frame @ 0xd1a85d: [27 1e 06 d1 1d 06 00 00 00 00 00 00 00 00 00 29 99 09]
  fakeRet @ 0xd1a86f: [fe ff 7f]
  opsDelta=0x000000 fpsDelta=0x000000 prevErrSP=0x000000 hlPayload=0x099929
calling ParseInp @ 0x099914 with budget=1500000...

=== Results ===
classification: MISSING_BLOCK
finalPc: 0x0019b5
steps: 53
termination: halt
returnHit: false
errorCatchPointHit (0x099929 reached): false
missingBlock: true @ 0x000800
cleanupStubHits: 0
errorRestoreHits: 0
errNo: 0x8d
OP1 post-call: [00 00 00 00 00 00 00 00 00]
OP1 decoded: 0
post-ParseInp: FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff errSP=0xd1a85d errNo=0x8d begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
interesting events: 0x061d3a (ErrUndefined dispatch) -> 0x061db2 (JError)
recent PCs (last 64): 0x099914 0x099b81 0x09991d 0x099b81 0x099925 0x099b18 0x08383d 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096 0x083841 0x083843 0x0846ea 0x08011f 0x0846ee 0x0846f2 0x08470a 0x082be2 0x084716 0x099b1c 0x061d3a 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b1 0x000000 0x000003 0x000658 0x000673 0x000679 0x00067e 0x000688 0x000697 0x00069a 0x0006a9 0x000038 0x000080 0x001768 0x000800 0x000804 0x000066 0x000047 0x0008bb 0x00004c 0x0019b5
```


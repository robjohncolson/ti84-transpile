# Phase 25W - ParseInp with ALL MEM_INIT values

## Goal

Call `ParseInp` at `0x099914` with MEM_INIT-accurate pointer seeds from ROM 0x09DEE0:

- `tempMem = 0xd1a881` (userMem)
- `FPSbase/FPS = 0xd1a881` (userMem)
- `newDataPtr = 0xd1a881` (userMem)
- `OPBase/pTemp/progPtr = 0xd3ffff` (symTable end)
- `OPS = 0xd00800` (token buffer override)
- tokenized `2+3` at `0xd00800`

## Post-Boot Pointer Dump

- Post-boot pointers before seeding: `tempMem=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 FPSbase=0x000000 FPS=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00`
- Seeded pointers before call: `tempMem=0xd1a881 OPBase=0xd3ffff OPS=0xd00800 pTemp=0xd3ffff progPtr=0xd3ffff FPSbase=0xd1a881 FPS=0xd1a881 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00`
- Token buffer @ `0xd00800`: `32 70 33 3f`
- Main return frame @ `0xd1a872`: `fe ff 7f`
- Error catch frame @ `0xd1a86c`: `00 00 00 fa ff 7f`

## PC Trace Milestones

(no milestones reached)

## Outcome

- Disposition: `FAKE_RET`
- returnHit=true
- errCaught=false
- missingBlock=true
- termination=return_hit
- finalPc=0x7ffffe
- errNo=0x8e
- stepCount=61

## State After Call

- Expected OP1 bytes: `00 80 50 00 00 00 00 00 00`
- OP1 bytes: `00 00 00 00 00 00 00 00 00`
- OP1 exact-byte match=false
- OP1 decoded via readReal: `0`
- Expected numeric value: `5`
- Diff: `5`
- Pointers before call: `tempMem=0xd1a881 OPBase=0xd3ffff OPS=0xd00800 pTemp=0xd3ffff progPtr=0xd3ffff FPSbase=0xd1a881 FPS=0xd1a881 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00`
- Pointers after call: `tempMem=0xd1a881 OPBase=0xd3ffff OPS=0xd00800 pTemp=0xd3ffff progPtr=0xd3ffff FPSbase=0xd1a881 FPS=0xd1a881 newDataPtr=0xd1a881 errSP=0xd1a86c errNo=0x8e`
- Pointer changes: `errSP: 0x000000 -> 0xd1a86c, errNo: 0x00 -> 0x8e`
- Last 20 PCs: `0x08226b 0x0820b5 0x0820c3 0x08226f 0x082273 0x0822a2 0x082bb9 0x082bba 0x061d3e 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba 0x7ffffe`

## Verdict

- **PARTIAL**

## Console Output

```text
=== Phase 25W: ParseInp with ALL MEM_INIT values ===
userMem=0xd1a881 symTableEnd=0xd3ffff tokenBuf=0xd00800
boot: steps=3025 term=halt lastPc=0x0019b5
post-boot pointers: tempMem=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 FPSbase=0x000000 FPS=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00
seeded pointers: tempMem=0xd1a881 OPBase=0xd3ffff OPS=0xd00800 pTemp=0xd3ffff progPtr=0xd3ffff FPSbase=0xd1a881 FPS=0xd1a881 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
input bytes @ 0xd00800: [32 70 33 3f]
expected OP1 @ 0xd005f8: [00 80 50 00 00 00 00 00 00]
main return frame @ 0xd1a872: [fe ff 7f]
error catch frame @ 0xd1a86c: [00 00 00 fa ff 7f]
OP1 pre-call @ 0xd005f8: [00 00 00 00 00 00 00 00 00]
ParseInp returned to FAKE_RET @ 0x7ffffe
errNo after call: 0x8e
OP1 post-call @ 0xd005f8: [00 00 00 00 00 00 00 00 00]
OP1 exact-byte match: false
OP1 decoded via readReal: 0
pointers after call: tempMem=0xd1a881 OPBase=0xd3ffff OPS=0xd00800 pTemp=0xd3ffff progPtr=0xd3ffff FPSbase=0xd1a881 FPS=0xd1a881 newDataPtr=0xd1a881 errSP=0xd1a86c errNo=0x8e
pointer changes: errSP: 0x000000 -> 0xd1a86c, errNo: 0x00 -> 0x8e
last 20 PCs: 0x08226b 0x0820b5 0x0820c3 0x08226f 0x082273 0x0822a2 0x082bb9 0x082bba 0x061d3e 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba 0x7ffffe
milestones: 0
verdict=PARTIAL
```

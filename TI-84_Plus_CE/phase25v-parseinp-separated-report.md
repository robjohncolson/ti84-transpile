# Phase 25V - ParseInp with SEPARATED token buffer

## Goal

Call `ParseInp` at `0x099914` with the token buffer at `0xd00800` (system scratch RAM), separated from OPBase at `0xd1a881` (userMem). This avoids the 25U crash where InsertMem shifted the token data because OPBase and the token buffer shared the same address.

## Post-Boot Pointer Dump

- Post-boot pointers before seeding: `OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 FPSbase=0x000000 FPS=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00`
- Seeded pointers before call: `OPBase=0xd1a881 OPS=0xd00800 pTemp=0xd1a881 progPtr=0xd1a881 FPSbase=0xd00a00 FPS=0xd00a00 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00`
- Token buffer @ `0xd00800`: `32 70 33 3f`
- Main return frame @ `0xd1a872`: `fe ff 7f`
- Error catch frame @ `0xd1a86c`: `00 00 00 fa ff 7f`

## Outcome

- Disposition: `FAKE_RET`
- returnHit=true
- errCaught=false
- missingBlock=true
- termination=return_hit
- finalPc=0x7ffffe
- errNo=0x8e
- stepCount=87

## State After Call

- OP1 bytes: `00 00 00 00 00 00 00 00 00`
- OP1 decoded via readReal: `0`
- Expected: `5`
- Diff: `5`
- Pointers before call: `OPBase=0xd1a881 OPS=0xd00800 pTemp=0xd1a881 progPtr=0xd1a881 FPSbase=0xd00a00 FPS=0xd00a00 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00`
- Pointers after call: `OPBase=0xd1a881 OPS=0xd00800 pTemp=0xd1a881 progPtr=0xd1a881 FPSbase=0xd00a00 FPS=0xd00a00 newDataPtr=0xd1a881 errSP=0xd1a86c errNo=0x8e`
- Last 20 PCs: `0x08226b 0x0820b5 0x0820c3 0x08226f 0x082273 0x0822a2 0x082bb9 0x082bba 0x061d3e 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba 0x7ffffe`

## Verdict

- **PARTIAL**

## Console Output

```text
=== Phase 25V: ParseInp with SEPARATED token buffer ===
token buffer @ 0xd00800 (separate from OPBase @ 0xd1a881)
boot: steps=3025 term=halt lastPc=0x0019b5
post-boot pointers: OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 FPSbase=0x000000 FPS=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00
seeded pointers: OPBase=0xd1a881 OPS=0xd00800 pTemp=0xd1a881 progPtr=0xd1a881 FPSbase=0xd00a00 FPS=0xd00a00 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
input bytes @ 0xd00800: [32 70 33 3f]
main return frame @ 0xd1a872: [fe ff 7f]
error catch frame @ 0xd1a86c: [00 00 00 fa ff 7f]
OP1 pre-call @ 0xd005f8: [00 00 00 00 00 00 00 00 00]
ParseInp returned to FAKE_RET @ 0x7ffffe
errNo after call: 0x8e
OP1 post-call @ 0xd005f8: [00 00 00 00 00 00 00 00 00]
OP1 decoded via readReal: 0
pointers after call: OPBase=0xd1a881 OPS=0xd00800 pTemp=0xd1a881 progPtr=0xd1a881 FPSbase=0xd00a00 FPS=0xd00a00 newDataPtr=0xd1a881 errSP=0xd1a86c errNo=0x8e
last 20 PCs: 0x08226b 0x0820b5 0x0820c3 0x08226f 0x082273 0x0822a2 0x082bb9 0x082bba 0x061d3e 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba 0x7ffffe
verdict=PARTIAL
```

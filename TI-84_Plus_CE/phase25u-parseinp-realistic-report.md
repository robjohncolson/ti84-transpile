# Phase 25U - ParseInp realistic heap/VAT probe

## Goal

Call `ParseInp` at `0x099914` after a cold boot, seed a realistic empty heap/VAT layout plus a valid `errSP` catch frame, and test tokenized `2+3`.

## Post-Boot Pointer Dump

- Post-boot pointers before seeding: `OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 FPSbase=0x000000 FPS=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00`
- Seeded pointers before call: `OPBase=0xd1a881 OPS=0xd1a881 pTemp=0xd1a881 progPtr=0xd1a881 FPSbase=0xd00a00 FPS=0xd00a00 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00`
- Token buffer @ `0xd1a881`: `32 70 33 3f`
- Main return frame @ `0xd1a872`: `fe ff 7f`
- Error catch frame @ `0xd1a86c`: `00 00 00 fa ff 7f`

## Outcome

- Disposition: `MISSING_BLOCK`
- returnHit=false
- errCaught=false
- missingBlock=true
- termination=missing_block
- finalPc=0x9a8a00
- errNo=0x00
- stepCount=460972

## State After Call

- OP1 bytes: `00 00 00 00 00 00 00 00 00`
- OP1 decoded via readReal: `0`
- Expected: `5`
- Diff: `5`
- Pointers before call: `OPBase=0xd1a881 OPS=0xd1a881 pTemp=0xd1a881 progPtr=0xd1a881 FPSbase=0xd00a00 FPS=0xd00a00 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00`
- Pointers after call: `OPBase=0xd1a878 OPS=0xd1a86e pTemp=0xd1a878 progPtr=0xd1a878 FPSbase=0xd00a09 FPS=0xd00a12 newDataPtr=0xd1a88a errSP=0x000000 errNo=0x00`
- Last 20 PCs: `0x082823 0x08282d 0x08281f 0x08282d 0x0821a3 0x08237e 0x082344 0x09a18c 0x07fac2 0x07fa7a 0x07fa86 0x09a190 0x07fa0d 0x07f9ff 0x07f978 0x09a194 0x07f914 0x07f96c 0x07f974 0x9a8a00`

## Verdict

- **FAIL**

## Console Output

```text
=== Phase 25U: ParseInp with realistic heap/VAT setup ===
boot: steps=3025 term=halt lastPc=0x0019b5
post-boot pointers: OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 FPSbase=0x000000 FPS=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00
seeded pointers: OPBase=0xd1a881 OPS=0xd1a881 pTemp=0xd1a881 progPtr=0xd1a881 FPSbase=0xd00a00 FPS=0xd00a00 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
input bytes @ 0xd1a881: [32 70 33 3f]
main return frame @ 0xd1a872: [fe ff 7f]
error catch frame @ 0xd1a86c: [00 00 00 fa ff 7f]
OP1 pre-call @ 0xd005f8: [00 00 00 00 00 00 00 00 00]
call done: steps=460971 term=missing_block lastPc=0x9a8a00
errNo after call: 0x00
OP1 post-call @ 0xd005f8: [00 00 00 00 00 00 00 00 00]
OP1 decoded via readReal: 0
pointers after call: OPBase=0xd1a878 OPS=0xd1a86e pTemp=0xd1a878 progPtr=0xd1a878 FPSbase=0xd00a09 FPS=0xd00a12 newDataPtr=0xd1a88a errSP=0x000000 errNo=0x00
last 20 PCs: 0x082823 0x08282d 0x08281f 0x08282d 0x0821a3 0x08237e 0x082344 0x09a18c 0x07fac2 0x07fa7a 0x07fa86 0x09a190 0x07fa0d 0x07f9ff 0x07f978 0x09a194 0x07f914 0x07f96c 0x07f974 0x9a8a00
verdict=FAIL
```

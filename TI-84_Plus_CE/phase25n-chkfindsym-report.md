# Phase 25N - ChkFindSym probe

## Goal

Verify the VAT walker by creating a real variable with `CreateReal` and then locating it with `ChkFindSym`.

## Setup

- Cold-boot + post-init sequence copied from `probe-phase25i-fpadd.mjs`.
- Kernel init entry: `0x08c331`
- Post-init entry: `0x0802b2`
- CPU state before calls: `madl=1`, `mbase=0xD0`, `IY=0xD00080`, `IX=0xD1A860`, timer IRQ disabled.
- OP1 address: `0xd005f8`
- CreateReal impl: `0x08238a`
- ChkFindSym impl: `0x08383d`
- Fake return sentinel: `0x7ffffe`

## OP1 bytes pre-CreateReal

- Attempt used: RealObj + 'A' + zero pad
- Bytes: `00 41 00 00 00 00 00 00 00`

## CreateReal exit state

- PC: `0x58c35b`
- Returned to fake return: false
- Termination: `missing_block`
- Flags: `0xf3 (C=true Z=true S=true)`
- HL: `0xffffff`
- DE: `0x000012`
- B: `0x00`
- OP1 after CreateReal: `00 41 00 00 00 00 00 00 00`

## OP1 bytes pre-ChkFindSym

- Bytes: `00 41 00 00 00 00 00 00 00`

## ChkFindSym exit state

- PC: `0x7eedf3`
- Returned to fake return: false
- Termination: `missing_block`
- Flags: `0xbb (C=true Z=false S=true)`
- Carry clear (found): false
- HL: `0xffffff`
- DE: `0x000012`
- B: `0x00`
- HL points into RAM: false
- VAT scratch @ 0xD0259A: `0x000000`
- VAT scratch @ 0xD0259D: `0x000000`

## PASS/FAIL

- Result: **FAIL**
- PASS requires both calls to return to the fake sentinel, plus `ChkFindSym` carry clear and `HL` in RAM.
- Evaluated as: CreateReal.returnHit=false, ChkFindSym.returnHit=false, carryClear=false, hlInRam=false

## Surprises

- Chosen because CreateReal forces OP1[0]=RealObj and the lifted 0x0820CD helper scans OP1+1..+8 for a NUL terminator.
- The first OP1 layout already matched the ROM's expectations, so no alternate name encoding was needed.
- CreateReal clobbered OP1 to: `00 41 00 00 00 00 00 00 00`, so the probe re-seeded OP1 before ChkFindSym as requested.
- CreateReal carry=true and ChkFindSym carry=true; only the latter participates in PASS/FAIL per the task contract.

## Console Output

```text
=== Phase 25N: ChkFindSym probe ===
attempt: RealObj + 'A' + zero pad
boot: steps=3025 term=halt lastPc=0x0019b5
OP1 pre-CreateReal [00 41 00 00 00 00 00 00 00]
CreateReal did not return to FAKE_RET; finalPc=0x58c35b term=missing_block steps=50
CreateReal exit: pc=0x58c35b F=0xf3 (C=true Z=true S=true) HL=0xffffff DE=0x000012 B=0x00 OP1-post=[00 41 00 00 00 00 00 00 00]
CreateReal recent PCs: 0x082bba 0x061d3e 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba
CreateReal dynamic targets: 0x0822e1 0x080084 0x0822af 0x0822bf 0x08226b 0x08226f 0x0822c4 0x082bc2 0x03e1ca 0x061dba 0x58c35b
CreateReal missing blocks: 58c35b:adl
OP1 pre-ChkFindSym [00 41 00 00 00 00 00 00 00]
ChkFindSym did not return to FAKE_RET; finalPc=0x7eedf3 term=missing_block steps=9
ChkFindSym exit: pc=0x7eedf3 F=0xbb (C=true Z=false S=true) HL=0xffffff DE=0x000012 B=0x00 VAT.page=0x00 HL.inRAM=false
ChkFindSym recent PCs: 0x08383d 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096
ChkFindSym dynamic targets: 0x080084 0x7eedf3
ChkFindSym missing blocks: 7eedf3:adl
FAIL

```


# Phase 660: Cleanup Gate Static Decode Against Phase659 Inputs

Probe: `probe-phase660-cleanup-gate-decode.mjs`
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase660-cleanup-gate-decode.mjs`

## Summary

- The live-VAT no-AutoRun Digit2 route enters the first destructive cleanup because `0x001872` reads port `0x03` as `0xEE`, bit 4 is clear, and the `JR NZ` bypass is not taken.
- The upstream `0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8` path does not set `IY+0x42`: `0x0158EE` takes `JR Z` directly to `0x0158F8`, skipping the `SET 7,(IY+0x42)` fallthrough.
- `0x001879` is not a branch gate. It reads port `0x09`, sets bit 4, writes it back (`0x42 -> 0x52`), then begins the bulk-clear register setup and falls through to the `0x0018F8` clear tail.
- Token/tail hooks remain absent in the phase659 route: token/tail hits are 0 and low-path hits are 60,889.

## First Cleanup Chain Samples

Phase659 key status: Key: 2 -> 300000 steps (peak 8754px)

| Block | Target | PC | Previous | AF | Flags | SP | Stack0 | IY+42 | Port03 | Port09 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 13131 | `gate001c4a` | `0x001C4A` | `0x001C33` | `0xFF42` | s Z h pv N c | `0xD1A872` | `0x0158D2` | `0x00` | `0xEE` | `0x42` |
| 13132 | `gate0158d2` | `0x0158D2` | `0x001C4A` | `0xFF90` | S z H pv n c | `0xD1A875` | `0x0158EC` | `0x00` | `0xEE` | `0x42` |
| 13133 | `gate0158da` | `0x0158DA` | `0x0158D2` | `0xFF90` | S z H pv n c | `0xD1A875` | `0x0158EC` | `0x00` | `0xEE` | `0x42` |
| 13134 | `gate0158ec` | `0x0158EC` | `0x0158DA` | `0xFF6A` | s Z h pv N c | `0xD1A878` | `0x001872` | `0x00` | `0xEE` | `0x42` |
| 13135 | `gate0158ee` | `0x0158EE` | `0x0158EC` | `0xFF6A` | s Z h pv N c | `0xD1A878` | `0x001872` | `0x00` | `0xEE` | `0x42` |
| 13136 | `gate0158f8` | `0x0158F8` | `0x0158EE` | `0xFF6A` | s Z h pv N c | `0xD1A878` | `0x001872` | `0x00` | `0xEE` | `0x42` |
| 13137 | `gate001872` | `0x001872` | `0x0158F8` | `0x0044` | s Z h PV n c | `0xD1A87B` | `0x0013E8` | `0x00` | `0xEE` | `0x42` |
| 13138 | `clear001879` | `0x001879` | `0x001872` | `0xEE54` | s Z H PV n c | `0xD1A87B` | `0x0013E8` | `0x00` | `0xEE` | `0x42` |
| 13139 | `cleanup0018f8` | `0x0018F8` | `0x001879` | `0x5200` | s z h pv n c | `0xD1A87B` | `0x0013E8` | `0x00` | `0xEE` | `0x52` |

## Branch Matches

| Location | Static decode | Phase659 input | Decision |
| --- | --- | --- | --- |
| `0x001C33 -> 0x001C4A` | Upstream loop/search reaches 0x001C4A; 0x001C4A returns to the 0x0158D2 guard chain via stack0. | gate001c4a@0x001C4A#13131; prev=0x001C33; AF=0xFF42; flags=s Z h pv N c; SP=0xD1A872; stack0=0x0158D2; IY+42=0x00; port03=0xEE; port09=0x42; IY: D00080=0x00, D0008D=0x0E, D0009B=0x00, D0009F=0x00, D000A3=0x00, D000A7=0x00, D000A8=0x00, D000AC=0x00, D000C2=0x00, D000C4=0x00 | MATCH: 0x001C33 was the predecessor and stack0 routes RET to 0x0158D2. |
| `0x0158D2` | JR NZ,0x0158DA | gate0158d2@0x0158D2#13132; prev=0x001C4A; AF=0xFF90; flags=S z H pv n c; SP=0xD1A875; stack0=0x0158EC; IY+42=0x00; port03=0xEE; port09=0x42 | TAKEN: Z=false routes to 0x0158DA. |
| `0x0158DA` | OR A; SBC HL,HL; RET. This normalizes flags before returning to the caller stack target. | gate0158da@0x0158DA#13133; prev=0x0158D2; AF=0xFF90; flags=S z H pv n c; SP=0xD1A875; stack0=0x0158EC; IY+42=0x00; port03=0xEE; port09=0x42 -> next 0x0158EC | MATCH: return lands at 0x0158EC with Z=true, C=false. |
| `0x0158EC` | JR C,0x0158F8 | gate0158ec@0x0158EC#13134; prev=0x0158DA; AF=0xFF6A; flags=s Z h pv N c; SP=0xD1A878; stack0=0x001872; IY+42=0x00; port03=0xEE; port09=0x42 | NOT TAKEN: C=false falls through to 0x0158EE. |
| `0x0158EE` | JR Z,0x0158F8; fallthrough would SET 7,(IY+0x42), LD A,1, OR A, RET. | gate0158ee@0x0158EE#13135; prev=0x0158EC; AF=0xFF6A; flags=s Z h pv N c; SP=0xD1A878; stack0=0x001872; IY+42=0x00; port03=0xEE; port09=0x42; IY+42=0x00 | TAKEN: Z=true jumps to 0x0158F8 and skips the IY+0x42 set. |
| `0x0158F8` | XOR A; RET | gate0158f8@0x0158F8#13136; prev=0x0158EE; AF=0xFF6A; flags=s Z h pv N c; SP=0xD1A878; stack0=0x001872; IY+42=0x00; port03=0xEE; port09=0x42 -> next 0x001872 | MATCH: returns to the low-ROM cleanup selector at 0x001872. |
| `0x001872` | IN0 A,(0x03); BIT 4,A; JR NZ,0x0018B0 | gate001872@0x001872#13137; prev=0x0158F8; AF=0x0044; flags=s Z h PV n c; SP=0xD1A87B; stack0=0x0013E8; IY+42=0x00; port03=0xEE; port09=0x42; after IN0, next sample has A=0xEE, port03=0xEE | NOT TAKEN: port03 bit4 is clear, so Z=true after BIT 4 and execution falls through to 0x001879. |
| `0x001879` | IN0 A,(0x09); SET 4,A; OUT0 (0x09),A; then first bulk-clear setup begins. | clear001879@0x001879#13138; prev=0x001872; AF=0xEE54; flags=s Z H PV n c; SP=0xD1A87B; stack0=0x0013E8; IY+42=0x00; port03=0xEE; port09=0x42; port09 before=0x42, port09 after=0x52 | MATCH: 0x001879 sets port09 bit4 and continues into clear setup; no local skip guard exists. |
| `0x0018F8` | LD (HL),0; LDIR; XOR A; LD (D177B7),A; LD A,0x95; LD (D0058F),A... | cleanup0018f8@0x0018F8#13139; prev=0x001879; AF=0x5200; flags=s z h pv n c; SP=0xD1A87B; stack0=0x0013E8; IY+42=0x00; port03=0xEE; port09=0x52 | ENTRY HAS NO PRE-CLEAR GUARD: registers were already set by 0x001879/0x0018A1 path; this is the third clear stage entry. |

## Static Listings

### 0x001C33/0x001C4A upstream guard window

| Address | Bytes | Instruction | Notes |
| --- | --- | --- | --- |
| `0x001C33` | `7E` | `LD A,(HL)` |  |
| `0x001C34` | `FE FF` | `CP 0xFF` |  |
| `0x001C36` | `28 12` | `JR Z,0x001C4A` |  |
| `0x001C38` | `23` | `INC HL` |  |
| `0x001C39` | `BA` | `CP D` |  |
| `0x001C3A` | `20 08` | `JR NZ,0x001C44` |  |
| `0x001C3C` | `7E` | `LD A,(HL)` |  |
| `0x001C3D` | `E6 F0` | `AND 0xF0` |  |
| `0x001C3F` | `BB` | `CP E` |  |
| `0x001C40` | `20 02` | `JR NZ,0x001C44` |  |
| `0x001C42` | `2B` | `DEC HL` |  |
| `0x001C43` | `C9` | `RET` | control transfer |
| `0x001C44` | `CD 7D 1C 00` | `CALL 0x001C7D` | control transfer |
| `0x001C48` | `30 E9` | `JR NC,0x001C33` |  |
| `0x001C4A` | `3E FF` | `LD A,0xFF` |  |
| `0x001C4C` | `CB 7F` | `BIT 7,A` |  |
| `0x001C4E` | `C9` | `RET` | control transfer |
| `0x001C4F` | `23` | `INC HL` |  |
| `0x001C50` | `CD A6 1C 00` | `CALL 0x001CA6` | control transfer |
| `0x001C54` | `C9` | `RET` | control transfer |
| `0x001C55` | `21 01 00 3B` | `LD HL,0x3B0001` |  |
| `0x001C59` | `CD 33 1C 00` | `CALL 0x001C33` | control transfer |
| `0x001C5D` | `C0` | `RET NZ` |  |
| `0x001C5E` | `C5` | `PUSH BC` |  |
| `0x001C5F` | `E5` | `PUSH HL` |  |

### 0x0158D2..0x0158F8 guard-return chain

| Address | Bytes | Instruction | Notes |
| --- | --- | --- | --- |
| `0x0158D2` | `20 06` | `JR NZ,0x0158DA` | sample flags imply taken |
| `0x0158D4` | `CD 4F 1C 00` | `CALL 0x001C4F` | control transfer |
| `0x0158D8` | `18 03` | `JR 0x0158DD` | control transfer |
| `0x0158DA` | `B7` | `OR A` |  |
| `0x0158DB` | `ED 62` | `SBC HL,HL` |  |
| `0x0158DD` | `C9` | `RET` | control transfer |
| `0x0158DE` | `FD 21 80 00 D0` | `LD IY,0xD00080` |  |
| `0x0158E3` | `FD CB 42 7E` | `BIT 7,(IY+66)` |  |
| `0x0158E7` | `C0` | `RET NZ` |  |
| `0x0158E8` | `CD BC 58 01` | `CALL 0x0158BC` | control transfer |
| `0x0158EC` | `38 0A` | `JR C,0x0158F8` | sample flags imply not taken |
| `0x0158EE` | `28 08` | `JR Z,0x0158F8` | sample flags imply taken |
| `0x0158F0` | `FD CB 42 FE` | `SET 7,(IY+66)` | sets IY+0x42 bit 7 |
| `0x0158F4` | `3E 01` | `LD A,0x01` |  |
| `0x0158F6` | `B7` | `OR A` |  |
| `0x0158F7` | `C9` | `RET` | control transfer |
| `0x0158F8` | `AF` | `XOR A` |  |
| `0x0158F9` | `C9` | `RET` | control transfer |

### 0x001872..0x0018F8 cleanup selector

| Address | Bytes | Instruction | Notes |
| --- | --- | --- | --- |
| `0x001872` | `ED 38 03` | `IN0 A,(0x03)` | port read 0x03 |
| `0x001875` | `CB 67` | `BIT 4,A` |  |
| `0x001877` | `20 36` | `JR NZ,0x0018AF` |  |
| `0x001879` | `ED 38 09` | `IN0 A,(0x09)` | port read 0x09 |
| `0x00187C` | `CB E7` | `SET 4,A` |  |
| `0x00187E` | `ED 39 09` | `OUT0 (0x09),A` | port write 0x09 |
| `0x001881` | `21 00 00 D0` | `LD HL,0xD00000` |  |
| `0x001885` | `11 01 00 D0` | `LD DE,0xD00001` |  |
| `0x001889` | `01 D7 3F 01` | `LD BC,0x013FD7` |  |
| `0x00188D` | `36 00` | `LD (HL),0x00` |  |
| `0x00188F` | `ED B0` | `LDIR` | block copy/clear |
| `0x001891` | `21 7C 78 D1` | `LD HL,0xD1787C` |  |
| `0x001895` | `11 7D 78 D1` | `LD DE,0xD1787D` |  |
| `0x001899` | `01 01 20 00` | `LD BC,0x002001` |  |
| `0x00189D` | `36 00` | `LD (HL),0x00` |  |
| `0x00189F` | `ED B0` | `LDIR` | block copy/clear |
| `0x0018A1` | `21 FF FE D3` | `LD HL,0xD3FEFF` |  |
| `0x0018A5` | `11 00 FF D3` | `LD DE,0xD3FF00` |  |
| `0x0018A9` | `01 FF 00 00` | `LD BC,0x0000FF` |  |
| `0x0018AD` | `18 49` | `JR 0x0018F8` | control transfer |
| `0x0018AF` | `ED 38 07` | `IN0 A,(0x07)` | port read 0x07 |
| `0x0018B2` | `CB E7` | `SET 4,A` |  |
| `0x0018B4` | `ED 39 07` | `OUT0 (0x07),A` | port write 0x07 |
| `0x0018B7` | `FD CB 42 7E` | `BIT 7,(IY+66)` |  |
| `0x0018BB` | `28 1A` | `JR Z,0x0018D7` |  |
| `0x0018BD` | `3E 08` | `LD A,0x08` |  |
| `0x0018BF` | `32 00 00 F8` | `LD (0xF80000),A` |  |
| `0x0018C3` | `ED 38 09` | `IN0 A,(0x09)` | port read 0x09 |
| `0x0018C6` | `CB A7` | `RES 4,A` |  |
| `0x0018C8` | `ED 39 09` | `OUT0 (0x09),A` | port write 0x09 |
| `0x0018CB` | `3A 0C 00 F9` | `LD A,(0xF9000C)` |  |
| `0x0018CF` | `CB F7` | `SET 6,A` |  |
| `0x0018D1` | `32 0C 00 F9` | `LD (0xF9000C),A` |  |
| `0x0018D5` | `18 08` | `JR 0x0018DF` | control transfer |
| `0x0018D7` | `ED 38 09` | `IN0 A,(0x09)` | port read 0x09 |
| `0x0018DA` | `CB E7` | `SET 4,A` |  |
| `0x0018DC` | `ED 39 09` | `OUT0 (0x09),A` | port write 0x09 |
| `0x0018DF` | `B7` | `OR A` |  |
| `0x0018E0` | `2A 1B 30 D0` | `LD HL,(0xD0301B)` |  |
| `0x0018E4` | `11 5A A5 5A` | `LD DE,0x5AA55A` |  |
| `0x0018E8` | `ED 52` | `SBC HL,DE` |  |
| `0x0018EA` | `20 95` | `JR NZ,0x001881` |  |
| `0x0018EC` | `01 25 00 00` | `LD BC,0x000025` |  |
| `0x0018F0` | `21 FF 00 D0` | `LD HL,0xD000FF` |  |
| `0x0018F4` | `11 00 01 D0` | `LD DE,0xD00100` |  |
| `0x0018F8` | `36 00` | `LD (HL),0x00` |  |
| `0x0018FA` | `ED B0` | `LDIR` | block copy/clear |
| `0x0018FC` | `AF` | `XOR A` |  |
| `0x0018FD` | `32 B7 77 D1` | `LD (0xD177B7),A` |  |
| `0x001901` | `3E 95` | `LD A,0x95` |  |
| `0x001903` | `32 8F 05 D0` | `LD (0xD0058F),A` |  |
| `0x001907` | `CD 96 5B 00` | `CALL 0x005B96` | control transfer |
| `0x00190B` | `CD B1 5B 00` | `CALL 0x005BB1` | control transfer |

### 0x0018F8 bulk-clear entry

| Address | Bytes | Instruction | Notes |
| --- | --- | --- | --- |
| `0x0018F8` | `36 00` | `LD (HL),0x00` |  |
| `0x0018FA` | `ED B0` | `LDIR` | block copy/clear |
| `0x0018FC` | `AF` | `XOR A` |  |
| `0x0018FD` | `32 B7 77 D1` | `LD (0xD177B7),A` |  |
| `0x001901` | `3E 95` | `LD A,0x95` |  |
| `0x001903` | `32 8F 05 D0` | `LD (0xD0058F),A` |  |
| `0x001907` | `CD 96 5B 00` | `CALL 0x005B96` | control transfer |
| `0x00190B` | `CD B1 5B 00` | `CALL 0x005BB1` | control transfer |
| `0x00190F` | `ED 38 03` | `IN0 A,(0x03)` | port read 0x03 |
| `0x001912` | `CB 67` | `BIT 4,A` |  |
| `0x001914` | `C8` | `RET Z` |  |
| `0x001915` | `FD CB 42 7E` | `BIT 7,(IY+66)` |  |
| `0x001919` | `C8` | `RET Z` |  |
| `0x00191A` | `ED 38 0C` | `IN0 A,(0x0C)` | port read 0x0C |
| `0x00191D` | `CB D7` | `SET 2,A` |  |
| `0x00191F` | `ED 39 0C` | `OUT0 (0x0C),A` | port write 0x0C |
| `0x001922` | `3E 08` | `LD A,0x08` |  |
| `0x001924` | `32 00 00 F8` | `LD (0xF80000),A` |  |
| `0x001928` | `3A 0C 00 F9` | `LD A,(0xF9000C)` |  |
| `0x00192C` | `CB F7` | `SET 6,A` |  |
| `0x00192E` | `32 0C 00 F9` | `LD (0xF9000C),A` |  |
| `0x001932` | `C9` | `RET` | control transfer |

## Conclusion

The static decode matches phase659: the first cleanup entry is selected locally by the `0x001872` port-3 bit4 guard. The upstream flash/guard return path leaves `IY+0x42` clear and returns through `0x0158F8`; it does not request the bypass path. Once `0x001872` falls through, `0x001879` immediately performs port-9 bit setup and bulk-clear register setup, so the next causal experiment is the live-VAT port-3 bit4 A/B from the handoff.

## Raw Route Counters

```json
{
  "tokenHookHits": 0,
  "lowPathHits": 60889,
  "cleanupHits": 3,
  "getCscHits": 3,
  "cxMainHits": 2,
  "counts": {
    "gate001c4a": 7,
    "gate0158d2": 5,
    "gate0158da": 5,
    "gate0158ec": 5,
    "gate0158ee": 5,
    "gate0158f8": 5,
    "gate001872": 3,
    "clear001879": 3,
    "cleanup0018f8": 3
  }
}
```


# Phase 923: Repeated Digit3 owner trace

Probe: `probe-phase923-repeated-digit3-owner-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase923-repeated-digit3-owner-trace.mjs`

## Result

- PASS: **yes**.
- Digit3 intended write: 0x05E372 at block 1931, buffer[2] 0x00->0x33.
- Digit3 repeated write: 0x05E372 at block 5810, buffer[3] 0x00->0x31.
- Between the two writes: 3879 observed blocks; 0 visit(s) to 0x0158DE.
- First edge absent from both clean Digit1/Digit2 post-insert routes: **0x02FDAC -> 0x02FDB6**.
- Clean successor(s) from the same source: 1: 0x02FDAC -> 0x05C76C, D000C3=0x00; 2: 0x02FDAC -> 0x05C76C, D000C3=0x00. Bad Digit3 D000C3=0x06.
- Debounce-drain carryover: Digit2 reports first_zero_handoff at 0x03F9B0 with D0058B=0x00, but ends with D000C3=0x06; Digit3 starts with D000C3=0x06.
- First repeated edge in the bad segment: 0x0A19A4 -> 0x0A19A4 (first index 76, repeated at 77).
- The smallest owner-level intervention is in the browser debounce drain, not the edit buffer: after Digit2, runColdbootPostInsertFirstZeroDrain stops at the first 0x03F9B0 handoff solely because D0058B=0, even though D000C3 is still 0x06. The next Digit3 therefore sees bit 2 set at 0x02FDAE and skips CALL Z,0x05C76C. A future narrow fix should keep draining when (D000C3 & 0x04) != 0 (or equivalently require both D0058B=0 and bit 2 clear before accepting the handoff), rather than force-restoring RAM after duplication. This trace tick does not apply that intervention.

## Per-key route bounds

| key | termination | steps | insert block | gate block | trace end | trace rows | final cursor | buffer[0..4] |
|---|---|---:|---:|---:|---|---:|---|---|
| 1 | post_insert_gate_stop | 7526 | 2908 | 7504 | gate_entry | 4597 | 0xD1A8CD | 0x31 0x00 0x00 0x00 0x00 |
| 2 | post_insert_gate_stop | 4824 | 1979 | 4820 | gate_entry | 2842 | 0xD1A8CE | 0x31 0x32 0x00 0x00 0x00 |
| 3 | max_steps | 300000 | 1931 | - | repeated_insert | 3880 | 0xD1A8D0 | 0x31 0x32 0x33 0x31 0x00 |

Digit1 and Digit2 stop at the browser post-insert gate. Digit3 instead reaches a second edit-buffer write before any gate visit; the missing gate is therefore a route-selection failure, not a late failure inside the gate.

## First Digit3-only transition evidence

Candidate edge: 0x02FDAC -> 0x02FDB6 at Digit3 trace index 1218.

```text
0x02FDA6 b3141 AF=0x001A54 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A85D D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00
0x03013A b3142 AF=0x001A54 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A857 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00
0x03013F b3143 AF=0x001A54 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A857 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00
0x030145 b3144 AF=0x001A54 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A857 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00
0x03014B b3145 AF=0x001A10 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A857 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00
0x030151 b3146 AF=0x001A54 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A857 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00
0x030157 b3147 AF=0x001A54 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A857 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00
0x02FDAC b3148 AF=0x001A54 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A85A D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00
0x02FDB6 b3149 AF=0x001A10 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A85D D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00
0x03FA09 b3150 AF=0x001A10 BC=0x00E000 DE=0x09F916 HL=0x00FFFF SP=0xD1A85A D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x000038 b3151 AF=0x000044 BC=0x00E000 DE=0x09F916 HL=0xD00587 SP=0xD1A854 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x0006F3 b3152 AF=0x005540 BC=0x000000 DE=0xD00080 HL=0x048968 SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x000704 b3153 AF=0x00D054 BC=0x000000 DE=0xD00080 HL=0x048968 SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x000710 b3154 AF=0x00D042 BC=0x000000 DE=0xD00080 HL=0x048968 SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x001713 b3155 AF=0x00D042 BC=0x000000 DE=0xD00080 HL=0xD1A8A1 SP=0xD1A848 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x0008BB b3156 AF=0x00D042 BC=0x000000 DE=0xD00080 HL=0xD1A8A1 SP=0xD1A845 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x001717 b3157 AF=0x00D042 BC=0x00A55A DE=0xD00080 HL=0x000000 SP=0xD1A848 D00587/8B/8C/8D/8E=0x00/0x00/0x00/0x91/0x00 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
```

Static decode from 0x02FDAC:

```text
0x02FDAC  DD E1               pop
0x02FDAE  FD CB 43 56         indexed-cb-bit
0x02FDB2  CC 6C C7 05         call-conditional
0x02FDB6  FD CB 43 96         indexed-cb-res
0x02FDBA  FD CB 08 DE         indexed-cb-set
0x02FDBE  CD 09 FA 03         call
0x02FDC2  FD CB 28 6E         indexed-cb-bit
0x02FDC6  20 06               jr-conditional
0x02FDC8  FD CB 28 5E         indexed-cb-bit
0x02FDCC  28 0A               jr-conditional
0x02FDCE  FD CB 28 9E         indexed-cb-res
0x02FDD2  FD CB 28 AE         indexed-cb-res
```

Static decode from 0x02FDB6:

```text
0x02FDB6  FD CB 43 96         indexed-cb-res
0x02FDBA  FD CB 08 DE         indexed-cb-set
0x02FDBE  CD 09 FA 03         call
0x02FDC2  FD CB 28 6E         indexed-cb-bit
0x02FDC6  20 06               jr-conditional
0x02FDC8  FD CB 28 5E         indexed-cb-bit
0x02FDCC  28 0A               jr-conditional
0x02FDCE  FD CB 28 9E         indexed-cb-res
0x02FDD2  FD CB 28 AE         indexed-cb-res
0x02FDD6  3E FF               ld-reg-imm
0x02FDD8  FD CB 34 46         indexed-cb-bit
0x02FDDC  28 08               jr-conditional
```

## Digit3 write chronology

| block | observed pc | changed edit byte(s) | registers/state |
|---:|---|---|---|
| 1931 | 0x05E372 | [2] 0x00->0x33 | 0x05E372 b1931 AF=0x000044 BC=0x009108 DE=0x000033 HL=0xD1A8CF SP=0xD1A842 D00587/8B/8C/8D/8E=0x12/0x00/0x91/0x91/0x91 D00080/9F=0x18/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00 |
| 5810 | 0x05E372 | [3] 0x00->0x31 | 0x05E372 b5810 AF=0x000044 BC=0x008F00 DE=0x000031 HL=0xD1A8D0 SP=0xD1A842 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8D0 desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x31 0x00 D000C2/C3/C4=0x00/0x02/0x00 |

## D000C2/C3/C4 write chronology

| key | block | observed transition | field | change |
|---|---:|---|---|---|
| 1 | 5760 | 0x052013 -> 0x04E0CC | D000C3 | 0x00->0x02 |
| 1 | 5948 | 0x04985C -> 0x048C44 | D000C3 | 0x02->0x06 |
| 1 | 7505 | 0x0158DE -> 0x0013DA | D000C2 | 0x00->0x80 |
| 1 | 7506 | 0x0013DA -> 0x08C331 | D000C2 | 0x80->0x00 |
| 1 | 9274 | 0x02FDB6 -> 0x03FA09 | D000C3 | 0x06->0x02 |
| 1 | 9553 | 0x0457B2 -> 0x04586B | D000C3 | 0x02->0x00 |
| 2 | 4821 | 0x0158DE -> 0x0013DA | D000C2 | 0x00->0x80 |
| 2 | 4822 | 0x0013DA -> 0x08C331 | D000C2 | 0x80->0x00 |
| 2 | 7445 | 0x052013 -> 0x04E0CC | D000C3 | 0x00->0x02 |
| 2 | 7485 | 0x04985C -> 0x048C44 | D000C3 | 0x02->0x06 |
| 3 | 3150 | 0x02FDB6 -> 0x03FA09 | D000C3 | 0x06->0x02 |

## Hot PCs between intended and repeated insert

| pc | visits |
|---|---:|
| 0x0A19A4 | 208 |
| 0x0A18C4 | 176 |
| 0x0A1A83 | 128 |
| 0x003D25 | 77 |
| 0x003D28 | 77 |
| 0x001CA6 | 66 |
| 0x001CC0 | 66 |
| 0x001CCA | 66 |
| 0x001C33 | 55 |
| 0x001C38 | 55 |
| 0x001C3C | 55 |
| 0x001CE4 | 55 |
| 0x0A1854 | 48 |
| 0x0A187C | 48 |
| 0x0A188A | 48 |
| 0x0A189E | 48 |

## Tail into the repeated insert

```text
0x058B0C b5779 AF=0x008F5C BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A854 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x080109 b5780 AF=0x008F5C BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A851 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x058B10 b5781 AF=0x008F83 BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A854 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x058B14 b5782 AF=0x008F83 BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A854 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E630 b5783 AF=0x008F83 BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A851 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05C52C b5784 AF=0x008F83 BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05C530 b5785 AF=0x008F83 BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05C534 b5786 AF=0x008F83 BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05C538 b5787 AF=0x008F83 BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05C53C b5788 AF=0x008F83 BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05C547 b5789 AF=0x008F8A BC=0x008F00 DE=0x090016 HL=0x0585E9 SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E634 b5790 AF=0x003524 BC=0x008F00 DE=0x000031 HL=0x05BFB9 SP=0xD1A851 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E35A b5791 AF=0x003524 BC=0x008F00 DE=0x000031 HL=0x05BFB9 SP=0xD1A84B D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x04C973 b5792 AF=0x003524 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A84B D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E639 b5793 AF=0x003562 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A84E D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E642 b5794 AF=0x003574 BC=0x008F00 DE=0x000031 HL=0xD2A83E SP=0xD1A84B D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E37D b5795 AF=0x003574 BC=0x008F00 DE=0x000031 HL=0xD2A83E SP=0xD1A848 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x04C973 b5796 AF=0x003574 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A845 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E38A b5797 AF=0x003562 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A848 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E646 b5798 AF=0x003562 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A84B D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E648 b5799 AF=0x003562 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A84B D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E64E b5800 AF=0x003562 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A84B D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E307 b5801 AF=0x003562 BC=0x008F00 DE=0x000031 HL=0xD2A83E SP=0xD1A848 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x04C973 b5802 AF=0x003562 BC=0x008F00 DE=0xD2A83E HL=0xD1A8CF SP=0xD1A842 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E315 b5803 AF=0x0035B3 BC=0x008F00 DE=0xD2A83E HL=0xD1A8CF SP=0xD1A845 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E317 b5804 AF=0x0035B3 BC=0x008F00 DE=0x000031 HL=0xD1A8CF SP=0xD1A848 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E37D b5805 AF=0x0035B3 BC=0x008F00 DE=0x000031 HL=0xD1A8CF SP=0xD1A83F D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x04C973 b5806 AF=0x0035B3 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A83C D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E38A b5807 AF=0x003562 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A83F D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E31D b5808 AF=0x003562 BC=0x008F00 DE=0xD2A83E HL=0xD2A83E SP=0xD1A842 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E348 b5809 AF=0x000044 BC=0x008F00 DE=0x000031 HL=0xD1A8CF SP=0xD1A845 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x02/0x00
0x05E372 b5810 AF=0x000044 BC=0x008F00 DE=0x000031 HL=0xD1A8D0 SP=0xD1A842 D00587/8B/8C/8D/8E=0x00/0x05/0x8F/0x22/0x00 D00080/9F=0x00/0x00 cursor=0xD1A8D0 desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x31 0x00 D000C2/C3/C4=0x00/0x02/0x00
```

## Bounded JSON evidence

```json
{
  "pass": true,
  "lineBase": 13740236,
  "records": [
    {
      "label": "1",
      "start": {
        "cursor": 13740236,
        "descriptor": 13805630,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "control": [
          0,
          0,
          0
        ]
      },
      "end": {
        "cursor": 13740237,
        "descriptor": 13805630,
        "buffer": [
          49,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "control": [
          0,
          0,
          0
        ],
        "lastKey": {
          "code": "Digit1",
          "label": "1",
          "expectedInsertByte": 49,
          "controlPreStopPc": null,
          "controlPreStopLabel": null,
          "cursorBefore": 13740236,
          "insertBlock": 2908,
          "postInsertGateBlock": 7504,
          "stoppedAtPostInsertGate": true,
          "D000C2Bit7Restored": true,
          "controlStopBlock": null,
          "controlStopPc": null,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "postInsertFirstZeroDrain": {
            "ok": true,
            "stopKind": "first_zero_handoff",
            "stopPc": 260528,
            "guardPc": null,
            "stopD0058B": 0,
            "blockCount": 2165,
            "steps": 2171,
            "termination": "first_zero_handoff",
            "lastPc": 574257,
            "lastMode": "adl",
            "wipes": 0,
            "D007CA": 361961,
            "D0243A": 13740237,
            "token": 49
          },
          "steps": 7526,
          "termination": "post_insert_gate_stop",
          "wipes": 0,
          "D0243A": 13740237,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740140,
          "D02590": 13893249,
          "D000C2": 0,
          "buffer": [
            49,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8669,
          "vramCurrent": 8669
        }
      },
      "writes": [
        {
          "pc": 385906,
          "block": 2908,
          "changes": [
            {
              "index": 0,
              "before": 0,
              "after": 49
            }
          ],
          "row": [
            385906,
            2908,
            68,
            36608,
            49,
            13740237,
            13740098,
            18,
            5,
            143,
            18,
            143,
            24,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "controlWrites": [
        {
          "field": "D000C3",
          "before": 0,
          "after": 2,
          "pc": 319692,
          "prevPc": 335891,
          "block": 5760,
          "row": [
            319692,
            5760,
            512,
            17154,
            13631616,
            13631683,
            13740082,
            0,
            5,
            0,
            18,
            0,
            16,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            0,
            2,
            0
          ]
        },
        {
          "field": "D000C3",
          "before": 2,
          "after": 6,
          "pc": 298052,
          "prevPc": 301148,
          "block": 5948,
          "row": [
            298052,
            5948,
            68,
            16704,
            13631616,
            13631681,
            13740097,
            0,
            5,
            0,
            18,
            0,
            16,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            0,
            6,
            0
          ]
        },
        {
          "field": "D000C2",
          "before": 0,
          "after": 128,
          "pc": 5082,
          "prevPc": 88286,
          "block": 7505,
          "row": [
            5082,
            7505,
            53392,
            40965,
            13740028,
            0,
            13740158,
            0,
            5,
            0,
            18,
            0,
            16,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            128,
            6,
            0
          ]
        },
        {
          "field": "D000C2",
          "before": 128,
          "after": 0,
          "pc": 574257,
          "prevPc": 5082,
          "block": 7506,
          "row": [
            574257,
            7506,
            53312,
            40965,
            13740028,
            0,
            13740131,
            0,
            5,
            0,
            18,
            0,
            16,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            0,
            6,
            0
          ]
        },
        {
          "field": "D000C3",
          "before": 6,
          "after": 2,
          "pc": 260617,
          "prevPc": 196022,
          "block": 9274,
          "row": [
            260617,
            9274,
            6672,
            57349,
            13740028,
            65535,
            13740122,
            0,
            2,
            0,
            18,
            0,
            16,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            0,
            2,
            0
          ]
        },
        {
          "field": "D000C3",
          "before": 2,
          "after": 0,
          "pc": 284779,
          "prevPc": 284594,
          "block": 9553,
          "row": [
            284779,
            9553,
            84,
            33,
            13727868,
            0,
            13740088,
            0,
            1,
            0,
            18,
            0,
            16,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "milestones": [
        {
          "kind": "intended_insert",
          "pc": 385906,
          "block": 2908,
          "row": [
            385906,
            2908,
            68,
            36608,
            49,
            13740237,
            13740098,
            18,
            5,
            143,
            18,
            143,
            24,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        },
        {
          "kind": "insert_pc",
          "pc": 385906,
          "block": 2908,
          "row": [
            385906,
            2908,
            68,
            36608,
            49,
            13740237,
            13740098,
            18,
            5,
            143,
            18,
            143,
            24,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        },
        {
          "kind": "gate_entry",
          "pc": 88286,
          "block": 7504,
          "row": [
            88286,
            7504,
            53314,
            40965,
            13740028,
            0,
            13740155,
            0,
            5,
            0,
            18,
            0,
            16,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            0,
            6,
            0
          ]
        },
        {
          "kind": "gate_return",
          "pc": 5082,
          "block": 7505,
          "row": [
            5082,
            7505,
            53392,
            40965,
            13740028,
            0,
            13740158,
            0,
            5,
            0,
            18,
            0,
            16,
            0,
            13740237,
            13805630,
            13805630,
            49,
            0,
            0,
            0,
            0,
            128,
            6,
            0
          ]
        }
      ],
      "traceEnd": "gate_entry",
      "traceLength": 4597
    },
    {
      "label": "2",
      "start": {
        "cursor": 13740237,
        "descriptor": 13805630,
        "buffer": [
          49,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "control": [
          0,
          0,
          0
        ]
      },
      "end": {
        "cursor": 13740238,
        "descriptor": 13805630,
        "buffer": [
          49,
          50,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "control": [
          0,
          6,
          0
        ],
        "lastKey": {
          "code": "Digit2",
          "label": "2",
          "expectedInsertByte": 50,
          "controlPreStopPc": null,
          "controlPreStopLabel": null,
          "cursorBefore": 13740237,
          "insertBlock": 1979,
          "postInsertGateBlock": 4820,
          "stoppedAtPostInsertGate": true,
          "D000C2Bit7Restored": true,
          "controlStopBlock": null,
          "controlStopPc": null,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "postInsertFirstZeroDrain": {
            "ok": true,
            "stopKind": "first_zero_handoff",
            "stopPc": 260528,
            "guardPc": null,
            "stopD0058B": 0,
            "blockCount": 2781,
            "steps": 2787,
            "termination": "first_zero_handoff",
            "lastPc": 574257,
            "lastMode": "adl",
            "wipes": 0,
            "D007CA": 361961,
            "D0243A": 13740238,
            "token": 49
          },
          "steps": 4824,
          "termination": "post_insert_gate_stop",
          "wipes": 0,
          "D0243A": 13740238,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740140,
          "D02590": 13893249,
          "D000C2": 0,
          "buffer": [
            49,
            50,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 0,
          "vramCurrent": 8734
        }
      },
      "writes": [
        {
          "pc": 385906,
          "block": 1979,
          "changes": [
            {
              "index": 1,
              "before": 0,
              "after": 50
            }
          ],
          "row": [
            385906,
            1979,
            68,
            36872,
            50,
            13740238,
            13740098,
            26,
            0,
            144,
            144,
            144,
            24,
            0,
            13740238,
            13805630,
            13805630,
            49,
            50,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "controlWrites": [
        {
          "field": "D000C2",
          "before": 0,
          "after": 128,
          "pc": 5082,
          "prevPc": 88286,
          "block": 4821,
          "row": [
            5082,
            4821,
            53392,
            40965,
            131270,
            0,
            13740158,
            26,
            5,
            0,
            26,
            0,
            24,
            0,
            13740238,
            13805630,
            13805630,
            49,
            50,
            0,
            0,
            0,
            128,
            0,
            0
          ]
        },
        {
          "field": "D000C2",
          "before": 128,
          "after": 0,
          "pc": 574257,
          "prevPc": 5082,
          "block": 4822,
          "row": [
            574257,
            4822,
            53312,
            40965,
            131270,
            0,
            13740131,
            0,
            5,
            0,
            26,
            0,
            16,
            0,
            13740238,
            13805630,
            13805630,
            49,
            50,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        },
        {
          "field": "D000C3",
          "before": 0,
          "after": 2,
          "pc": 319692,
          "prevPc": 335891,
          "block": 7445,
          "row": [
            319692,
            7445,
            512,
            17154,
            13631616,
            13631683,
            13740082,
            0,
            1,
            0,
            26,
            0,
            16,
            0,
            13740238,
            13805630,
            13805630,
            49,
            50,
            0,
            0,
            0,
            0,
            2,
            0
          ]
        },
        {
          "field": "D000C3",
          "before": 2,
          "after": 6,
          "pc": 298052,
          "prevPc": 301148,
          "block": 7485,
          "row": [
            298052,
            7485,
            68,
            16704,
            13631616,
            13631681,
            13740097,
            0,
            1,
            0,
            26,
            0,
            16,
            0,
            13740238,
            13805630,
            13805630,
            49,
            50,
            0,
            0,
            0,
            0,
            6,
            0
          ]
        }
      ],
      "milestones": [
        {
          "kind": "intended_insert",
          "pc": 385906,
          "block": 1979,
          "row": [
            385906,
            1979,
            68,
            36872,
            50,
            13740238,
            13740098,
            26,
            0,
            144,
            144,
            144,
            24,
            0,
            13740238,
            13805630,
            13805630,
            49,
            50,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        },
        {
          "kind": "insert_pc",
          "pc": 385906,
          "block": 1979,
          "row": [
            385906,
            1979,
            68,
            36872,
            50,
            13740238,
            13740098,
            26,
            0,
            144,
            144,
            144,
            24,
            0,
            13740238,
            13805630,
            13805630,
            49,
            50,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        },
        {
          "kind": "gate_entry",
          "pc": 88286,
          "block": 4820,
          "row": [
            88286,
            4820,
            53314,
            40965,
            131270,
            0,
            13740155,
            26,
            5,
            0,
            26,
            0,
            24,
            0,
            13740238,
            13805630,
            13805630,
            49,
            50,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        },
        {
          "kind": "gate_return",
          "pc": 5082,
          "block": 4821,
          "row": [
            5082,
            4821,
            53392,
            40965,
            131270,
            0,
            13740158,
            26,
            5,
            0,
            26,
            0,
            24,
            0,
            13740238,
            13805630,
            13805630,
            49,
            50,
            0,
            0,
            0,
            128,
            0,
            0
          ]
        }
      ],
      "traceEnd": "gate_entry",
      "traceLength": 2842
    },
    {
      "label": "3",
      "start": {
        "cursor": 13740238,
        "descriptor": 13805630,
        "buffer": [
          49,
          50,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "control": [
          0,
          6,
          0
        ]
      },
      "end": {
        "cursor": 13740240,
        "descriptor": 13805630,
        "buffer": [
          49,
          50,
          51,
          49,
          0,
          0,
          0,
          0
        ],
        "control": [
          0,
          2,
          0
        ],
        "lastKey": {
          "code": "Digit3",
          "label": "3",
          "expectedInsertByte": 51,
          "controlPreStopPc": null,
          "controlPreStopLabel": null,
          "cursorBefore": 13740238,
          "insertBlock": 1931,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": null,
          "controlStopPc": null,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "postInsertFirstZeroDrain": null,
          "steps": 300000,
          "termination": "max_steps",
          "wipes": 0,
          "D0243A": 13740240,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740140,
          "D02590": 13893249,
          "D000C2": 0,
          "buffer": [
            49,
            50,
            51,
            49,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8848,
          "vramCurrent": 8848
        }
      },
      "writes": [
        {
          "pc": 385906,
          "block": 1931,
          "changes": [
            {
              "index": 2,
              "before": 0,
              "after": 51
            }
          ],
          "row": [
            385906,
            1931,
            68,
            37128,
            51,
            13740239,
            13740098,
            18,
            0,
            145,
            145,
            145,
            24,
            0,
            13740239,
            13805630,
            13805630,
            49,
            50,
            51,
            0,
            0,
            0,
            6,
            0
          ]
        },
        {
          "pc": 385906,
          "block": 5810,
          "changes": [
            {
              "index": 3,
              "before": 0,
              "after": 49
            }
          ],
          "row": [
            385906,
            5810,
            68,
            36608,
            49,
            13740240,
            13740098,
            0,
            5,
            143,
            34,
            0,
            0,
            0,
            13740240,
            13805630,
            13805630,
            49,
            50,
            51,
            49,
            0,
            0,
            2,
            0
          ]
        }
      ],
      "controlWrites": [
        {
          "field": "D000C3",
          "before": 6,
          "after": 2,
          "pc": 260617,
          "prevPc": 196022,
          "block": 3150,
          "row": [
            260617,
            3150,
            6672,
            57344,
            653590,
            65535,
            13740122,
            0,
            0,
            0,
            145,
            0,
            16,
            0,
            13740239,
            13805630,
            13805630,
            49,
            50,
            51,
            0,
            0,
            0,
            2,
            0
          ]
        }
      ],
      "milestones": [
        {
          "kind": "intended_insert",
          "pc": 385906,
          "block": 1931,
          "row": [
            385906,
            1931,
            68,
            37128,
            51,
            13740239,
            13740098,
            18,
            0,
            145,
            145,
            145,
            24,
            0,
            13740239,
            13805630,
            13805630,
            49,
            50,
            51,
            0,
            0,
            0,
            6,
            0
          ]
        },
        {
          "kind": "insert_pc",
          "pc": 385906,
          "block": 1931,
          "row": [
            385906,
            1931,
            68,
            37128,
            51,
            13740239,
            13740098,
            18,
            0,
            145,
            145,
            145,
            24,
            0,
            13740239,
            13805630,
            13805630,
            49,
            50,
            51,
            0,
            0,
            0,
            6,
            0
          ]
        },
        {
          "kind": "insert_pc",
          "pc": 385906,
          "block": 5810,
          "row": [
            385906,
            5810,
            68,
            36608,
            49,
            13740240,
            13740098,
            0,
            5,
            143,
            34,
            0,
            0,
            0,
            13740240,
            13805630,
            13805630,
            49,
            50,
            51,
            49,
            0,
            0,
            2,
            0
          ]
        },
        {
          "kind": "repeated_insert",
          "pc": 385906,
          "block": 5810,
          "row": [
            385906,
            5810,
            68,
            36608,
            49,
            13740240,
            13740098,
            0,
            5,
            143,
            34,
            0,
            0,
            0,
            13740240,
            13805630,
            13805630,
            49,
            50,
            51,
            49,
            0,
            0,
            2,
            0
          ]
        }
      ],
      "traceEnd": "repeated_insert",
      "traceLength": 3880
    }
  ],
  "firstNovelEdge": {
    "index": 1218,
    "from": 196012,
    "to": 196022,
    "fromRow": [
      196012,
      3148,
      6740,
      57344,
      653590,
      65535,
      13740122,
      0,
      0,
      0,
      145,
      0,
      16,
      0,
      13740239,
      13805630,
      13805630,
      49,
      50,
      51,
      0,
      0,
      0,
      6,
      0
    ],
    "toRow": [
      196022,
      3149,
      6672,
      57344,
      653590,
      65535,
      13740125,
      0,
      0,
      0,
      145,
      0,
      16,
      0,
      13740239,
      13805630,
      13805630,
      49,
      50,
      51,
      0,
      0,
      0,
      6,
      0
    ],
    "window": [
      [
        196006,
        3141,
        6740,
        57344,
        653590,
        65535,
        13740125,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        6,
        0
      ],
      [
        196922,
        3142,
        6740,
        57344,
        653590,
        65535,
        13740119,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        6,
        0
      ],
      [
        196927,
        3143,
        6740,
        57344,
        653590,
        65535,
        13740119,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        6,
        0
      ],
      [
        196933,
        3144,
        6740,
        57344,
        653590,
        65535,
        13740119,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        6,
        0
      ],
      [
        196939,
        3145,
        6672,
        57344,
        653590,
        65535,
        13740119,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        6,
        0
      ],
      [
        196945,
        3146,
        6740,
        57344,
        653590,
        65535,
        13740119,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        6,
        0
      ],
      [
        196951,
        3147,
        6740,
        57344,
        653590,
        65535,
        13740119,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        6,
        0
      ],
      [
        196012,
        3148,
        6740,
        57344,
        653590,
        65535,
        13740122,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        6,
        0
      ],
      [
        196022,
        3149,
        6672,
        57344,
        653590,
        65535,
        13740125,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        6,
        0
      ],
      [
        260617,
        3150,
        6672,
        57344,
        653590,
        65535,
        13740122,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        2,
        0
      ],
      [
        56,
        3151,
        68,
        57344,
        653590,
        13632903,
        13740116,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        2,
        0
      ],
      [
        1779,
        3152,
        21824,
        0,
        13631616,
        297320,
        13740110,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        2,
        0
      ],
      [
        1796,
        3153,
        53332,
        0,
        13631616,
        297320,
        13740110,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        2,
        0
      ],
      [
        1808,
        3154,
        53314,
        0,
        13631616,
        297320,
        13740110,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        2,
        0
      ],
      [
        5907,
        3155,
        53314,
        0,
        13631616,
        13740193,
        13740104,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        2,
        0
      ],
      [
        2235,
        3156,
        53314,
        0,
        13631616,
        13740193,
        13740101,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        2,
        0
      ],
      [
        5911,
        3157,
        53314,
        42330,
        13631616,
        0,
        13740104,
        0,
        0,
        0,
        145,
        0,
        16,
        0,
        13740239,
        13805630,
        13805630,
        49,
        50,
        51,
        0,
        0,
        0,
        2,
        0
      ]
    ]
  },
  "cleanTransitions": [
    {
      "label": "1",
      "from": 196012,
      "to": 378732,
      "fromRow": [
        196012,
        4527,
        6740,
        57344,
        653584,
        65535,
        13740122,
        0,
        5,
        0,
        18,
        0,
        16,
        0,
        13740237,
        13805630,
        13805630,
        49,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "toRow": [
        378732,
        4528,
        6740,
        57344,
        653584,
        65535,
        13740122,
        0,
        5,
        0,
        18,
        0,
        16,
        0,
        13740237,
        13805630,
        13805630,
        49,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ]
    },
    {
      "label": "2",
      "from": 196012,
      "to": 378732,
      "fromRow": [
        196012,
        3196,
        6740,
        57344,
        653587,
        65535,
        13740122,
        0,
        0,
        0,
        144,
        0,
        16,
        0,
        13740238,
        13805630,
        13805630,
        49,
        50,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "toRow": [
        378732,
        3197,
        6740,
        57344,
        653587,
        65535,
        13740122,
        0,
        0,
        0,
        144,
        0,
        16,
        0,
        13740238,
        13805630,
        13805630,
        49,
        50,
        0,
        0,
        0,
        0,
        0,
        0
      ]
    }
  ],
  "firstRepeatedEdge": {
    "edge": "661924:661924",
    "firstIndex": 76,
    "repeatIndex": 77,
    "from": 661924,
    "to": 661924
  },
  "topPcCounts": [
    {
      "pc": 661924,
      "count": 208
    },
    {
      "pc": 661700,
      "count": 176
    },
    {
      "pc": 662147,
      "count": 128
    },
    {
      "pc": 15653,
      "count": 77
    },
    {
      "pc": 15656,
      "count": 77
    },
    {
      "pc": 7334,
      "count": 66
    },
    {
      "pc": 7360,
      "count": 66
    },
    {
      "pc": 7370,
      "count": 66
    },
    {
      "pc": 7219,
      "count": 55
    },
    {
      "pc": 7224,
      "count": 55
    },
    {
      "pc": 7228,
      "count": 55
    },
    {
      "pc": 7396,
      "count": 55
    },
    {
      "pc": 661588,
      "count": 48
    },
    {
      "pc": 661628,
      "count": 48
    },
    {
      "pc": 661642,
      "count": 48
    },
    {
      "pc": 661662,
      "count": 48
    }
  ],
  "pageErrors": []
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


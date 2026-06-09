# Phase596b 0x080037 and descriptor default helpers

ROM: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ROM.rom

## 0x080037 - stall call

0x080037  3A F9 05 D0     LD A,(0xD005F9)
0x08003B  21 04 06 D0     LD HL,0xD00604
0x08003F  96              SUB (HL)
0x080040  C9              RET

### RAM reads
- 0xD005F9: LD A,(0xD005F9)
- 0xD00604: SUB (HL)

### RAM writes
- none

### Conclusion

`0x080037` is not a long-running or diverting routine in this ROM image. It reads `0xD005F9`, loads `HL=0xD00604`, subtracts `(HL)`, and returns immediately. The decoded body has no `CALL`, no computed jump, no direct `JP`, and no clock/PLL or display-reinit edge. It returns to the populator for all states; the only state it communicates is flags from `D005F9 - D00604`: `Z` when the two descriptor class/length bytes match, `NZ` when they differ, and carry when `D005F9 < D00604`. In the caller at `0x07F854`, the condition that avoids the post-call `JR NZ,0x07F883` diversion is therefore `D005F9 == D00604`.

## 0x07FACF - called when D005FA==0

0x07FACF  21 F8 05 D0     LD HL,0xD005F8
0x07FAD3  18 0A           JR 0x07FADF
0x07FADF  AF              XOR A
0x07FAE0  77              LD (HL),A
0x07FAE1  23              INC HL
0x07FAE2  77              LD (HL),A
0x07FAE3  23              INC HL
0x07FAE4  77              LD (HL),A
0x07FAE5  18 98           JR 0x07FA7F
0x07FA7F  23              INC HL
0x07FA80  77              LD (HL),A
0x07FA81  AF              XOR A
0x07FA82  18 02           JR 0x07FA86
0x07FA86  23              INC HL
0x07FA87  77              LD (HL),A
0x07FA88  23              INC HL
0x07FA89  77              LD (HL),A
0x07FA8A  23              INC HL
0x07FA8B  77              LD (HL),A
0x07FA8C  23              INC HL
0x07FA8D  77              LD (HL),A
0x07FA8E  23              INC HL
0x07FA8F  77              LD (HL),A
0x07FA90  23              INC HL
0x07FA91  77              LD (HL),A
0x07FA92  C9              RET

### RAM reads
- none

### RAM writes
- 0xD005F8..0xD00601: zero-filled through the shared tail

### Conclusion

`0x07FACF` is a left-record zero default. Starting at `HL=0xD005F8`, it clears `A` and writes zeros across `D005F8..D00601`, then returns. It does not call out or divert; it prepares an all-zero left descriptor/tail when `D005FA` was zero.

## 0x07FAD5 - called when D00605==0

0x07FAD5  21 03 06 D0     LD HL,0xD00603
0x07FAD9  18 04           JR 0x07FADF
0x07FADF  AF              XOR A
0x07FAE0  77              LD (HL),A
0x07FAE1  23              INC HL
0x07FAE2  77              LD (HL),A
0x07FAE3  23              INC HL
0x07FAE4  77              LD (HL),A
0x07FAE5  18 98           JR 0x07FA7F
0x07FA7F  23              INC HL
0x07FA80  77              LD (HL),A
0x07FA81  AF              XOR A
0x07FA82  18 02           JR 0x07FA86
0x07FA86  23              INC HL
0x07FA87  77              LD (HL),A
0x07FA88  23              INC HL
0x07FA89  77              LD (HL),A
0x07FA8A  23              INC HL
0x07FA8B  77              LD (HL),A
0x07FA8C  23              INC HL
0x07FA8D  77              LD (HL),A
0x07FA8E  23              INC HL
0x07FA8F  77              LD (HL),A
0x07FA90  23              INC HL
0x07FA91  77              LD (HL),A
0x07FA92  C9              RET

### RAM reads
- none

### RAM writes
- 0xD00603..0xD0060C: zero-filled through the shared tail

### Conclusion

`0x07FAD5` is the matching right-record zero default. Starting at `HL=0xD00603`, it clears `A` and writes zeros across `D00603..D0060C`, then returns. It is also local and non-diverting.

## 0x07FAC2 - called when D005F9==0

0x07FAC2  21 F8 05 D0     LD HL,0xD005F8
0x07FAC6  AF              XOR A
0x07FAC7  18 B1           JR 0x07FA7A
0x07FA7A  36 00           LD (HL),0x00
0x07FA7C  23              INC HL
0x07FA7D  36 80           LD (HL),0x80
0x07FA7F  23              INC HL
0x07FA80  77              LD (HL),A
0x07FA81  AF              XOR A
0x07FA82  18 02           JR 0x07FA86
0x07FA86  23              INC HL
0x07FA87  77              LD (HL),A
0x07FA88  23              INC HL
0x07FA89  77              LD (HL),A
0x07FA8A  23              INC HL
0x07FA8B  77              LD (HL),A
0x07FA8C  23              INC HL
0x07FA8D  77              LD (HL),A
0x07FA8E  23              INC HL
0x07FA8F  77              LD (HL),A
0x07FA90  23              INC HL
0x07FA91  77              LD (HL),A
0x07FA92  C9              RET

### RAM reads
- none

### RAM writes
- 0xD005F8 = 0x00
- 0xD005F9 = 0x80
- 0xD005FA = 0x00
- 0xD005FB..0xD00600 = 0x00

### Conclusion

`0x07FAC2` supplies the left descriptor default when the left class/length byte was zero. It writes `D005F8=0x00`, `D005F9=0x80`, `D005FA=0x00`, then clears `D005FB..D00600` before returning. This default is important for `0x080037`: it makes the left class/length byte `0x80`, not `0x01`.

## 0x07FAAF - called when D00604==0

0x07FAAF  AF              XOR A
0x07FAB0  C3 2F FA 07     JP 0x07FA2F

Tail target used to determine behavior:

0x07FA2F  3E 50           LD A,0x50
0x07FA31  21 03 06 D0     LD HL,0xD00603
0x07FA35  18 45           JR 0x07FA7C
0x07FA7C  23              INC HL
0x07FA7D  36 80           LD (HL),0x80
0x07FA7F  23              INC HL
0x07FA80  77              LD (HL),A
0x07FA81  AF              XOR A
0x07FA82  18 02           JR 0x07FA86
0x07FA86  23              INC HL
0x07FA87  77              LD (HL),A
0x07FA88  23              INC HL
0x07FA89  77              LD (HL),A
0x07FA8A  23              INC HL
0x07FA8B  77              LD (HL),A
0x07FA8C  23              INC HL
0x07FA8D  77              LD (HL),A
0x07FA8E  23              INC HL
0x07FA8F  77              LD (HL),A
0x07FA90  23              INC HL
0x07FA91  77              LD (HL),A
0x07FA92  C9              RET

### RAM reads
- none

### RAM writes
- 0xD00604 = 0x80
- 0xD00605 = 0x50
- 0xD00606..0xD0060B = 0x00

### Conclusion

`0x07FAAF` is a tail jump into the right descriptor default family. Although it starts with `XOR A`, the jump target immediately loads `A=0x50`, sets `HL=0xD00603`, skips the explicit `D00603=0` write by landing at `0x07FA7C`, writes `D00604=0x80`, writes `D00605=0x50`, and clears `D00606..D0060B`. It returns via the shared tail. Combined with `0x07FAC2`, the valid empty/default descriptor shape for the comparator is left `00 80 00 00 00 00 00...` and right `D00604=0x80`, `D00605=0x50`, followed by zeros; the `0x080037` check passes the caller's equality branch when `D005F9 == D00604`, which these defaults satisfy with `0x80`.

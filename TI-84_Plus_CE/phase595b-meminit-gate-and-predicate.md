# Phase595b MEM_INIT gate and home predicate

ROM: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ROM.rom

## Job 1: 0x09DD14 disassembly
0x09DD14  21 09 01 00     LD HL,0x0109
0x09DD18  40 22 CF 25     LD (0x0025CF),HL
0x09DD1C  3E 95           LD A,0x95
0x09DD1E  32 8F 05 D0     LD (0xD0058F),A
0x09DD22  CD 78 00 03     CALL 0x030078
0x09DD26  CD B5 21 0A     CALL 0x0A21B5
0x09DD2A  11 00 00 00     LD DE,0x00
0x09DD2E  40 ED 53 AC 26  LD (0x0026AC),DE
0x09DD33  FD 21 80 00 D0  LD IY,0xD00080
0x09DD38  FD CB 09 DE     SET 3,(IY+9) ; IY+9 = 0xD00089
0x09DD3C  CD 11 0D 04     CALL 0x040D11
0x09DD40  FD CB 08 D6     SET 2,(IY+8) ; IY+8 = 0xD00088
0x09DD44  FD CB 0A EE     SET 5,(IY+10) ; IY+10 = 0xD0008A
0x09DD48  FD CB 0A B6     RES 6,(IY+10) ; IY+10 = 0xD0008A
0x09DD4C  FD CB 0A BE     RES 7,(IY+10) ; IY+10 = 0xD0008A
0x09DD50  FD CB 0D CE     SET 1,(IY+13) ; IY+13 = 0xD0008D
0x09DD54  21 02 02 00     LD HL,0x0202
0x09DD58  40 22 A4 26     LD (0x0026A4),HL
0x09DD5C  3E FF           LD A,0xFF
0x09DD5E  32 0F 25 D0     LD (0xD0250F),A
0x09DD62  CD E0 DE 09     CALL 0x09DEE0
0x09DD66  FD CB 4A A6     RES 4,(IY+74) ; IY+74 = 0xD000CA
0x09DD6A  21 FF FF 00     LD HL,0xFFFF
0x09DD6E  40 22 AA 26     LD (0x0026AA),HL
0x09DD72  40 22 8A 26     LD (0x00268A),HL
0x09DD76  23              INC HL
0x09DD77  40 22 88 26     LD (0x002688),HL
0x09DD7B  CD D4 03 00     CALL 0x0003D4
0x09DD7F  38 0C           JR C,0x09DD8D
0x09DD81  28 0A           JR Z,0x09DD8D
0x09DD83  FE 0F           CP 0x0F
0x09DD85  20 06           JR NZ,0x09DD8D
0x09DD87  CD 96 7F 02     CALL 0x027F96
0x09DD8B  18 0D           JR 0x09DD9A
0x09DD8D  AF              XOR A
0x09DD8E  CD 96 7F 02     CALL 0x027F96
0x09DD92  CD 87 7D 02     CALL 0x027D87
0x09DD96  CD 3B FE 03     CALL 0x03FE3B
0x09DD9A  CD B8 DD 09     CALL 0x09DDB8
0x09DD9E  FD CB 09 A6     RES 4,(IY+9) ; IY+9 = 0xD00089
0x09DDA2  FD CB 16 86     RES 0,(IY+22) ; IY+22 = 0xD00096
0x09DDA6  FB              ei {"pc":646566,"length":1,"nextPc":646567,"tag":"ei","mode":"adl","modePrefix":null}
0x09DDA7  21 00 0A 00     LD HL,0x0A00
0x09DDAB  40 22 04 25     LD (0x002504),HL
0x09DDAF  CD EC 00 08     CALL 0x0800EC
0x09DDB3  CD F2 21 0A     CALL 0x0A21F2
0x09DDB7  C9              RET
0x09DDB8  CD 6B 87 08     CALL 0x08876B
0x09DDBC  AF              XOR A
0x09DDBD  32 E6 0B D0     LD (0xD00BE6),A

### Conditional branches before CALL 0x09DEE0

### Gate conclusion
There is no conditional branch between `0x09DD14` and `0x09DD62` in this ROM image. Static ADL-mode decode falls through directly from the function entry to `0x09DD62: CALL 0x09DEE0`.

Conclusion: no RAM byte or IY flag in this decoded range gates the MEM_INIT call. If a dynamic run of `0x09DD14` completed without executing MEM_INIT writes, the diversion is not a conditional branch in `0x09DD14..0x09DD62`; it must come from the harness entry state, call/return handling, an exception/unsupported instruction outside this pre-call slice, or the MEM_INIT routine itself not performing the expected writes under that seed.

Seed to reach the call from this entry: none beyond normal sequential execution. The decoded range sets `IY = 0xD00080` itself at `0x09DD33` before the call.

## Job 2: 0x06C732 disassembly
0x06C732  FD CB 02 7E     BIT 7,(IY+2) ; IY+2 = 0xD00082
0x06C736  C9              RET

### Predicate conclusion
`0x06C732` is exactly `BIT 7,(IY+2); RET`. With `IY = 0xD00080`, it reads `0xD00082` bit 7 and returns immediately. No later instruction changes flags before the plain `RET`.

Return condition: `NZ` iff `(0xD00082 & 0x80) != 0`; `Z` iff bit 7 of `0xD00082` is clear.

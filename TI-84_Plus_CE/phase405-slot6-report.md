# Phase 405: Slot 6 Investigation (0xD0063A)

## Question

Is 0xD0063A a true 7th pipeline slot, a scratch buffer, or unrelated data?

## Pipeline Layout Recap

| Slot | Address Range | Confirmed |
|------|--------------|-----------|
| 0 | 0xD005F8-0xD00602 | Yes (517 refs to base) |
| 1 | 0xD00603-0xD0060D | Yes (220 refs to base) |
| 2 | 0xD0060E-0xD00618 | Yes (178 refs to base) |
| 3 | 0xD00619-0xD00623 | Yes (101 refs to base) |
| 4 | 0xD00624-0xD0062E | Yes (69 refs to base) |
| 5 | 0xD0062F-0xD00639 | Yes (103 refs to base) |
| 6? | 0xD0063A-0xD00644 | Under investigation |
| 7? | 0xD00645-0xD0064F | Under investigation |

## Slot 6 Range References

Total raw byte-pattern hits: 36
Instruction-classified: 19
Data/unknown: 17
In pipeline shift region: 1

### By Target Address

| Target | Byte | Refs | Instruction Refs |
|--------|------|------|-----------------|
| 0xd0063a | byte 0 | 16 | 11 |
| 0xd0063b | byte 1 | 3 | 3 |
| 0xd0063c | byte 2 | 4 | 3 |
| 0xd0063d | byte 3 | 1 | 0 |
| 0xd0063f | byte 5 | 12 | 2 |

### Instruction-Classified References

| ROM Address | Target | Instruction | Access | In Shift? | Likely Func |
|-------------|--------|-------------|--------|-----------|-------------|
| 0x04d195 | 0xd0063a (byte 0) | LD (nn),HL | write | no | 0x04d13d |
| 0x04d283 | 0xd0063a (byte 0) | LD (nn),HL | write | no | ??? |
| 0x07da26 | 0xd0063a (byte 0) | LD (nn),A | write | no | 0x07d9cf |
| 0x07da3c | 0xd0063a (byte 0) | LD HL,nn | load-addr | no | 0x07d9cf |
| 0x07f98b | 0xd0063a (byte 0) | LD DE,nn | load-addr | YES | 0x07f98b |
| 0x07ff2e | 0xd0063a (byte 0) | LD HL,nn | load-addr | no | 0x07fef5 |
| 0x08c22b | 0xd0063a (byte 0) | LD HL,nn | load-addr | no | 0x08c215 |
| 0x0b79c6 | 0xd0063a (byte 0) | LD (nn),A | write | no | 0x0b79af |
| 0x0b7a35 | 0xd0063a (byte 0) | LD A,(nn) | read | no | 0x0b79af |
| 0x0b7a5b | 0xd0063a (byte 0) | LD A,(nn) | read | no | 0x0b79af |
| 0x0b86e8 | 0xd0063a (byte 0) | LD DE,nn | load-addr | no | ??? |
| 0x07da21 | 0xd0063b (byte 1) | LD (nn),A | write | no | 0x07d9cf |
| 0x0b79d0 | 0xd0063b (byte 1) | LD (nn),A | write | no | 0x0b79af |
| 0x0b7a61 | 0xd0063b (byte 1) | LD A,(nn) | read | no | 0x0b79af |
| 0x07da14 | 0xd0063c (byte 2) | LD (nn),HL | write | no | 0x07d9cf |
| 0x07dac4 | 0xd0063c (byte 2) | LD HL,(nn) | read | no | 0x07dabb |
| 0x07dac9 | 0xd0063c (byte 2) | LD (nn),HL | write | no | 0x07dabb |
| 0x07da07 | 0xd0063f (byte 5) | LD (nn),HL | write | no | 0x07d9cf |
| 0x07da88 | 0xd0063f (byte 5) | LD HL,(nn) | read | no | 0x07d9cf |

### Detailed Disassembly

#### 0x04d195: LD (nn),HL -> 0xd0063a (byte 0)

```
    0x04d182  22 9c 05 d0      LD (0xd0059c),HL
    0x04d186  ed               DB ed
    0x04d187  5b               DB 5b
    0x04d188  3f               DB 3f
    0x04d189  06 d0            LD B,0xd0
    0x04d18b  10               DB 10
    0x04d18c  d0               RET NC
    0x04d18d  18 c7            JR 0x04d156
    0x04d18f  40               DB 40
    0x04d190  ed               DB ed
    0x04d191  5b               DB 5b
    0x04d192  3d               DB 3d
    0x04d193  06 2b            LD B,0x2b
>>> 0x04d195  22 3a 06 d0      LD (0xd0063a),HL
    0x04d199  16 00            LD D,0x00
    0x04d19b  19               DB 19
    0x04d19c  19               DB 19
    0x04d19d  5e               DB 5e
    0x04d19e  23               INC HL
    0x04d19f  56               DB 56
    0x04d1a0  23               INC HL
    0x04d1a1  e5               PUSH HL
    0x04d1a2  dd               DB dd
```

#### 0x04d283: LD (nn),HL -> 0xd0063a (byte 0)

```
    0x04d270  4b               DB 4b
    0x04d271  3f               DB 3f
    0x04d272  06 d0            LD B,0xd0
    0x04d274  c3 b0 d1 04      JP 0x04d1b0
    0x04d278  c1               POP BC
    0x04d279  c3 31 d1 04      JP 0x04d131
    0x04d27d  40               DB 40
    0x04d27e  ed               DB ed
    0x04d27f  5b               DB 5b
    0x04d280  3d               DB 3d
    0x04d281  06 2b            LD B,0x2b
>>> 0x04d283  22 3a 06 d0      LD (0xd0063a),HL
    0x04d287  16 00            LD D,0x00
    0x04d289  19               DB 19
    0x04d28a  19               DB 19
    0x04d28b  5e               DB 5e
    0x04d28c  23               INC HL
    0x04d28d  56               DB 56
    0x04d28e  23               INC HL
    0x04d28f  e5               PUSH HL
    0x04d290  dd               DB dd
```

#### 0x07da26: LD (nn),A -> 0xd0063a (byte 0)

```
    0x07da13  00               DB 00
    0x07da14  22 3c 06 d0      LD (0xd0063c),HL
    0x07da18  11 19 06 d0      LD DE,0xd00619
    0x07da1c  cd 18 2b 08      CALL 0x082b18
    0x07da20  af               XOR A
    0x07da21  32 3b 06 d0      LD (0xd0063b),A
    0x07da25  af               XOR A
>>> 0x07da26  32 3a 06 d0      LD (0xd0063a),A
    0x07da2a  cd e4 2a 08      CALL 0x082ae4
    0x07da2e  cd f0 2a 08      CALL 0x082af0
    0x07da32  cd 02 d9 07      CALL 0x07d902
```

#### 0x07da3c: LD HL,nn -> 0xd0063a (byte 0)

```
    0x07da29  d0               RET NC
    0x07da2a  cd e4 2a 08      CALL 0x082ae4
    0x07da2e  cd f0 2a 08      CALL 0x082af0
    0x07da32  cd 02 d9 07      CALL 0x07d902
    0x07da36  cd 95 da 07      CALL 0x07da95
    0x07da3a  20 4b            JR NZ,0x07da87
>>> 0x07da3c  21 3a 06 d0      LD HL,0xd0063a
    0x07da40  34               INC (HL)
    0x07da41  7e               LD A,(HL)
    0x07da42  fe 03            CP 0x03
    0x07da44  20 e4            JR NZ,0x07da2a
    0x07da46  23               INC HL
    0x07da47  7e               LD A,(HL)
    0x07da48  2f               CPL
    0x07da49  77               LD (HL),A
```

#### 0x07f98b: LD DE,nn -> 0xd0063a (byte 0)

**In pipeline shift region (0x07F95E-0x07F9D0)**

```
    0x07f978  ed a0            LDI
    0x07f97a  ed a0            LDI
    0x07f97c  ed a0            LDI
    0x07f97e  ed a0            LDI
    0x07f980  ed a0            LDI
    0x07f982  ed a0            LDI
    0x07f984  ed a0            LDI
    0x07f986  ed a0            LDI
    0x07f988  ed a0            LDI
    0x07f98a  c9               RET
>>> 0x07f98b  11 3a 06 d0      LD DE,0xd0063a
    0x07f98f  18 e3            JR 0x07f974
    0x07f991  21 fa 05 d0      LD HL,0xd005fa
    0x07f995  11 1b 06 d0      LD DE,0xd0061b
```

#### 0x07ff2e: LD HL,nn -> 0xd0063a (byte 0)

```
    0x07ff1b  07               DB 07
    0x07ff1c  fe 20            CP 0x20
    0x07ff1e  c2 c2 fa 07      JP NZ,0x07fac2
    0x07ff22  21 03 06 d0      LD HL,0xd00603
    0x07ff26  cd 8b f9 07      CALL 0x07f98b
    0x07ff2a  cd a7 cf 07      CALL 0x07cfa7
>>> 0x07ff2e  21 3a 06 d0      LD HL,0xd0063a
    0x07ff32  cd fe f8 07      CALL 0x07f8fe
    0x07ff36  18 d3            JR 0x07ff0b
    0x07ff38  3a f9 05 d0      LD A,(0xd005f9)
```

#### 0x08c22b: LD HL,nn -> 0xd0063a (byte 0)

```
    0x08c218  d0               RET NC
    0x08c219  cd 8b f9 07      CALL 0x07f98b
    0x08c21d  fd               DB fd
    0x08c21e  cb 4f            CB 4f
    0x08c220  86               DB 86
    0x08c221  cd d7 c1 08      CALL 0x08c1d7
    0x08c225  cd eb c1 08      CALL 0x08c1eb
    0x08c229  f5               PUSH AF
    0x08c22a  e5               PUSH HL
>>> 0x08c22b  21 3a 06 d0      LD HL,0xd0063a
    0x08c22f  cd 6c f9 07      CALL 0x07f96c
    0x08c233  e1               POP HL
    0x08c234  f1               POP AF
    0x08c235  d8               RET C
    0x08c236  fe 81            CP 0x81
    0x08c238  37               DB 37
```

#### 0x0b79c6: LD (nn),A -> 0xd0063a (byte 0)

```
    0x0b79b3  37               DB 37
    0x0b79b4  3e 01            LD A,0x01
    0x0b79b6  2a 95 05 d0      LD HL,(0xd00595)
    0x0b79ba  e5               PUSH HL
    0x0b79bb  f5               PUSH AF
    0x0b79bc  fd               DB fd
    0x0b79bd  cb 05            CB 05
    0x0b79bf  9e               DB 9e
    0x0b79c0  cd 2e 7b 0b      CALL 0x0b7b2e
    0x0b79c4  2b               DEC HL
    0x0b79c5  7e               LD A,(HL)
>>> 0x0b79c6  32 3a 06 d0      LD (0xd0063a),A
    0x0b79ca  cd 1e 7b 0b      CALL 0x0b7b1e
    0x0b79ce  2b               DEC HL
    0x0b79cf  7e               LD A,(HL)
    0x0b79d0  32 3b 06 d0      LD (0xd0063b),A
```

#### 0x0b7a35: LD A,(nn) -> 0xd0063a (byte 0)

```
    0x0b7a22  7a               LD A,D
    0x0b7a23  0b               DB 0b
    0x0b7a24  cd 2e 7b 0b      CALL 0x0b7b2e
    0x0b7a28  78               LD A,B
    0x0b7a29  fd               DB fd
    0x0b7a2a  cb 05            CB 05
    0x0b7a2c  de               DB de
    0x0b7a2d  fe 01            CP 0x01
    0x0b7a2f  28 0d            JR Z,0x0b7a3e
    0x0b7a31  cd 1e 7b 0b      CALL 0x0b7b1e
>>> 0x0b7a35  3a 3a 06 d0      LD A,(0xd0063a)
    0x0b7a39  3c               DB 3c
    0x0b7a3a  32 96 05 d0      LD (0xd00596),A
    0x0b7a3e  f1               POP AF
    0x0b7a3f  f5               PUSH AF
    0x0b7a40  78               LD A,B
    0x0b7a41  30 14            JR NC,0x0b7a57
```

#### 0x0b7a5b: LD A,(nn) -> 0xd0063a (byte 0)

```
    0x0b7a48  0a               DB 0a
    0x0b7a49  fe 02            CP 0x02
    0x0b7a4b  28 23            JR Z,0x0b7a70
    0x0b7a4d  fd               DB fd
    0x0b7a4e  cb 05            CB 05
    0x0b7a50  9e               DB 9e
    0x0b7a51  18 1d            JR 0x0b7a70
    0x0b7a53  fe 01            CP 0x01
    0x0b7a55  18 f4            JR 0x0b7a4b
    0x0b7a57  fe 01            CP 0x01
    0x0b7a59  20 06            JR NZ,0x0b7a61
>>> 0x0b7a5b  3a 3a 06 d0      LD A,(0xd0063a)
    0x0b7a5f  18 04            JR 0x0b7a65
    0x0b7a61  3a 3b 06 d0      LD A,(0xd0063b)
    0x0b7a65  47               LD B,A
    0x0b7a66  3e 20            LD A,0x20
    0x0b7a68  cd 5b 1b 0a      CALL 0x0a1b5b
```

#### 0x0b86e8: LD DE,nn -> 0xd0063a (byte 0)

```
    0x0b86d5  02               DB 02
    0x0b86d6  d6               DB d6
    0x0b86d7  af               XOR A
    0x0b86d8  32 32 20 d0      LD (0xd02032),A
    0x0b86dc  cd fd 83 0b      CALL 0x0b83fd
    0x0b86e0  cd 44 96 0b      CALL 0x0b9644
    0x0b86e4  fe 03            CP 0x03
    0x0b86e6  20 1b            JR NZ,0x0b8703
>>> 0x0b86e8  11 3a 06 d0      LD DE,0xd0063a
    0x0b86ec  cd 06 29 08      CALL 0x082906
    0x0b86f0  cd 61 29 08      CALL 0x082961
    0x0b86f4  3e 01            LD A,0x01
```

#### 0x07da21: LD (nn),A -> 0xd0063b (byte 1)

```
    0x07da0e  06 d0            LD B,0xd0
    0x07da10  21 01 00 00      LD HL,0x000001
    0x07da14  22 3c 06 d0      LD (0xd0063c),HL
    0x07da18  11 19 06 d0      LD DE,0xd00619
    0x07da1c  cd 18 2b 08      CALL 0x082b18
    0x07da20  af               XOR A
>>> 0x07da21  32 3b 06 d0      LD (0xd0063b),A
    0x07da25  af               XOR A
    0x07da26  32 3a 06 d0      LD (0xd0063a),A
    0x07da2a  cd e4 2a 08      CALL 0x082ae4
    0x07da2e  cd f0 2a 08      CALL 0x082af0
```

#### 0x0b79d0: LD (nn),A -> 0xd0063b (byte 1)

```
    0x0b79bd  cb 05            CB 05
    0x0b79bf  9e               DB 9e
    0x0b79c0  cd 2e 7b 0b      CALL 0x0b7b2e
    0x0b79c4  2b               DEC HL
    0x0b79c5  7e               LD A,(HL)
    0x0b79c6  32 3a 06 d0      LD (0xd0063a),A
    0x0b79ca  cd 1e 7b 0b      CALL 0x0b7b1e
    0x0b79ce  2b               DEC HL
    0x0b79cf  7e               LD A,(HL)
>>> 0x0b79d0  32 3b 06 d0      LD (0xd0063b),A
    0x0b79d4  fd               DB fd
    0x0b79d5  cb 05            CB 05
    0x0b79d7  ce               DB ce
    0x0b79d8  fd               DB fd
    0x0b79d9  cb 08            CB 08
    0x0b79db  c6               DB c6
    0x0b79dc  cd 54 7b 0b      CALL 0x0b7b54
```

#### 0x0b7a61: LD A,(nn) -> 0xd0063b (byte 1)

```
    0x0b7a4e  cb 05            CB 05
    0x0b7a50  9e               DB 9e
    0x0b7a51  18 1d            JR 0x0b7a70
    0x0b7a53  fe 01            CP 0x01
    0x0b7a55  18 f4            JR 0x0b7a4b
    0x0b7a57  fe 01            CP 0x01
    0x0b7a59  20 06            JR NZ,0x0b7a61
    0x0b7a5b  3a 3a 06 d0      LD A,(0xd0063a)
    0x0b7a5f  18 04            JR 0x0b7a65
>>> 0x0b7a61  3a 3b 06 d0      LD A,(0xd0063b)
    0x0b7a65  47               LD B,A
    0x0b7a66  3e 20            LD A,0x20
    0x0b7a68  cd 5b 1b 0a      CALL 0x0a1b5b
    0x0b7a6c  10               DB 10
    0x0b7a6d  fa 18 04 cd      JP M,0xcd0418
```

#### 0x07da14: LD (nn),HL -> 0xd0063c (byte 2)

```
    0x07da01  f9               DB f9
    0x07da02  07               DB 07
    0x07da03  cd a9 d9 07      CALL 0x07d9a9
    0x07da07  22 3f 06 d0      LD (0xd0063f),HL
    0x07da0b  ed               DB ed
    0x07da0c  53               DB 53
    0x07da0d  72               DB 72
    0x07da0e  06 d0            LD B,0xd0
    0x07da10  21 01 00 00      LD HL,0x000001
>>> 0x07da14  22 3c 06 d0      LD (0xd0063c),HL
    0x07da18  11 19 06 d0      LD DE,0xd00619
    0x07da1c  cd 18 2b 08      CALL 0x082b18
    0x07da20  af               XOR A
    0x07da21  32 3b 06 d0      LD (0xd0063b),A
```

#### 0x07dac4: LD HL,(nn) -> 0xd0063c (byte 2)

```
    0x07dab1  cd 31 f8 07      CALL 0x07f831
    0x07dab5  e1               POP HL
    0x07dab6  c1               POP BC
    0x07dab7  20 e7            JR NZ,0x07daa0
    0x07dab9  bf               DB bf
    0x07daba  c9               RET
    0x07dabb  22 72 06 d0      LD (0xd00672),HL
    0x07dabf  eb               DB eb
    0x07dac0  cd 0d fa 07      CALL 0x07fa0d
>>> 0x07dac4  2a 3c 06 d0      LD HL,(0xd0063c)
    0x07dac8  23               INC HL
    0x07dac9  22 3c 06 d0      LD (0xd0063c),HL
    0x07dacd  f6 01            OR 0x01
    0x07dacf  c9               RET
    0x07dad0  cd 54 f9 07      CALL 0x07f954
```

#### 0x07dac9: LD (nn),HL -> 0xd0063c (byte 2)

```
    0x07dab6  c1               POP BC
    0x07dab7  20 e7            JR NZ,0x07daa0
    0x07dab9  bf               DB bf
    0x07daba  c9               RET
    0x07dabb  22 72 06 d0      LD (0xd00672),HL
    0x07dabf  eb               DB eb
    0x07dac0  cd 0d fa 07      CALL 0x07fa0d
    0x07dac4  2a 3c 06 d0      LD HL,(0xd0063c)
    0x07dac8  23               INC HL
>>> 0x07dac9  22 3c 06 d0      LD (0xd0063c),HL
    0x07dacd  f6 01            OR 0x01
    0x07dacf  c9               RET
    0x07dad0  cd 54 f9 07      CALL 0x07f954
    0x07dad4  cd 68 f9 07      CALL 0x07f968
```

#### 0x07da07: LD (nn),HL -> 0xd0063f (byte 5)

```
    0x07d9f4  04               DB 04
    0x07d9f5  f9               DB f9
    0x07d9f6  07               DB 07
    0x07d9f7  cd 31 f8 07      CALL 0x07f831
    0x07d9fb  da 0e 1d 06      JP C,0x061d0e
    0x07d9ff  cd 68 f9 07      CALL 0x07f968
    0x07da03  cd a9 d9 07      CALL 0x07d9a9
>>> 0x07da07  22 3f 06 d0      LD (0xd0063f),HL
    0x07da0b  ed               DB ed
    0x07da0c  53               DB 53
    0x07da0d  72               DB 72
    0x07da0e  06 d0            LD B,0xd0
    0x07da10  21 01 00 00      LD HL,0x000001
    0x07da14  22 3c 06 d0      LD (0xd0063c),HL
```

#### 0x07da88: LD HL,(nn) -> 0xd0063f (byte 5)

```
    0x07da75  f8               DB f8
    0x07da76  07               DB 07
    0x07da77  30 06            JR NC,0x07da7f
    0x07da79  cd f6 2a 08      CALL 0x082af6
    0x07da7d  18 f0            JR 0x07da6f
    0x07da7f  cd 95 da 07      CALL 0x07da95
    0x07da83  20 02            JR NZ,0x07da87
    0x07da85  18 e4            JR 0x07da6b
    0x07da87  eb               DB eb
>>> 0x07da88  2a 3f 06 d0      LD HL,(0xd0063f)
    0x07da8c  b7               OR A
    0x07da8d  ed               DB ed
    0x07da8e  52               DB 52
    0x07da8f  30 94            JR NC,0x07da25
    0x07da91  c3 a1 d9 07      JP 0x07d9a1
    0x07da95  ed               DB ed
```

## Slot 7 Base (0xD00645)

2 reference(s) found:

- 0x029859: LD (nn),A (write)
- 0x04244d: LD A,(nn) (read)

## Pipeline Slot Reference Count Comparison

| Slot | Base Address | Raw Hits | Instruction Hits |
|------|-------------|----------|-----------------|
| Slot 0 | 0xd005f8 | 533 | 531 |
| Slot 1 | 0xd00603 | 247 | 237 |
| Slot 2 | 0xd0060e | 195 | 191 |
| Slot 3 | 0xd00619 | 106 | 106 |
| Slot 4 | 0xd00624 | 69 | 69 |
| Slot 5 | 0xd0062f | 129 | 118 |
| Slot 6? | 0xd0063a | 16 | 11 |
| Slot 7? | 0xd00645 | 2 | 2 |

## Pipeline Shift Entry at 0x07F98B

This code sits AFTER the RET at 0x07F98A in the pipeline shift function:

```
  0x07f98b  11 3a 06 d0      LD DE,0xd0063a
  0x07f98f  18 e3            JR 0x07f974
  0x07f991  21 fa 05 d0      LD HL,0xd005fa
  0x07f995  11 1b 06 d0      LD DE,0xd0061b
  0x07f999  18 df            JR 0x07f97a
  0x07f99b  21 1b 06 d0      LD HL,0xd0061b
  0x07f99f  18 04            JR 0x07f9a5
  0x07f9a1  21 05 06 d0      LD HL,0xd00605
  0x07f9a5  11 fa 05 d0      LD DE,0xd005fa
```

Callers of 0x07F98B: 2

## Conclusion

**0xD0063A is an AUXILIARY SAVE-ASIDE / SCRATCH AREA, not a true pipeline slot.**

Evidence: 19 instruction-classified references (18 outside shift region, 6 distinct function regions), 9 write(s), 5 read(s), 5 address-load(s).

Confirmed slots 0-5 have 69-531 instruction refs each and are accessed by the shared
pipeline reader at 0x07FDD6. Slot 6 has only 11 refs, is never accessed through the
standard reader, and its internal byte layout (counter at byte 2, pointer at byte 5)
differs from the action-record structure of slots 0-5.

The pipeline is 6 slots (0-5). The 11 bytes at 0xD0063A are an auxiliary area.

See the report for full analysis and updated pipeline layout.

---
Generated by probe-phase405-slot6.mjs

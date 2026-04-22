# Phase 78 — Missing block + caller scan

## Section 1 — Callers of 0x0a2b72 (= PutBPat) and 0x0a29ec (= RStrCurRow)

- Callers of **0x0a2b72 (= PutBPat)**: 3
- Callers of **0x0a29ec (= RStrCurRow)**: 5
- Callers of **0x0a2a68 (= GetTokString)**: 29


### Callers of 0x0a2b72 (= PutBPat) (3 total)

| caller block | dasm |
|--------------|------|
| 0x05e7d2 | `call 0x0a2b72 (= PutBPat)` |
| 0x05e481 | `call 0x0a2b72 (= PutBPat)` |
| 0x09cb14 | `call 0x0a2b72 (= PutBPat)` |

### Callers of 0x0a29ec (= RStrCurRow) (5 total)

| caller block | dasm |
|--------------|------|
| 0x078f69 | `set 5, (iy+76) ; call 0x0a29ec (= RStrCurRow)` |
| 0x025b37 | `call 0x0a29ec (= RStrCurRow)` |
| 0x060a35 | `set 5, (iy+76) ; call 0x0a29ec (= RStrCurRow)` |
| 0x08847f | `set 5, (iy+76) ; call 0x0a29ec (= RStrCurRow)` |
| 0x06c865 | `call 0x0a29ec (= RStrCurRow)` |

### Callers of 0x0a2a68 (= GetTokString) (29 total)

| caller block | dasm |
|--------------|------|
| 0x0a2a50 | `call 0x0a2a68 (= GetTokString)` |
| 0x0a2a45 (= GetTokLen) | `call 0x0a2a68 (= GetTokString)` |
| 0x0a2b53 | `call 0x0a2a68 (= GetTokString)` |
| 0x0a8d72 | `ld (0xd00596), a ; call 0x0a2a68 (= GetTokString)` |
| 0x0a8d71 | `inc a ; ld (0xd00596), a ; call 0x0a2a68 (= GetTokString)` |
| 0x0a2c7b | `inc hl ; push hl ; call 0x0a2a68 (= GetTokString)` |
| 0x0a2b79 | `push bc ; call 0x0a2a68 (= GetTokString)` |
| 0x07ba37 | `call 0x0a2a68 (= GetTokString)` |
| 0x0a2b72 (= PutBPat) | `xor a ; push bc ; push de ; push hl ; push af ; ld b, 0x00 ; push bc ; call 0x0a2a68 (= GetTokString)` |
| 0x0a2a3e (= GetKeypress) | `call 0x0a2a68 (= GetTokString)` |
| 0x0babb1 | `call 0x0a2a68 (= GetTokString)` |
| 0x05e7ee | `call 0x0a2a68 (= GetTokString)` |
| 0x08934e | `call 0x0a2a68 (= GetTokString)` |
| 0x061013 | `inc hl ; push hl ; call 0x0a2a68 (= GetTokString)` |
| 0x0232f4 | `ld d, a ; inc hl ; ld e, (hl) ; call 0x0a2a68 (= GetTokString)` |
| 0x0baba9 | `ld hl, 0x00001f ; ld (0x0026ac), hl ; call 0x0a2a68 (= GetTokString)` |
| 0x03eae6 | `call 0x0a2a68 (= GetTokString)` |
| 0x0a2cce | `inc hl ; push hl ; call 0x0a2a68 (= GetTokString)` |
| 0x02258e | `push bc ; push de ; push hl ; call 0x0a2a68 (= GetTokString)` |
| 0x0a1d4d | `pop de ; call 0x0a2a68 (= GetTokString)` |

## Section 2 — Missing block trace for 0x0a2b72 (= PutBPat)

steps: 3868
termination: missing_block
lastPc: 0xffffff
lastMode: adl
error: none
total blocks visited: 3868

### Last 30 blocks before termination

  [-30]  0x0a1a61
  [-29]  0x0a1a5d
  [-28]  0x0a1a61
  [-27]  0x0a1a5d
  [-26]  0x0a1a61
  [-25]  0x0a1a67
  [-24]  0x0a1969
  [-23]  0x0a1974
  [-22]  0x0a19cc
  [-21]  0x0a1a17
  [-20]  0x0a1a3b
  [-19]  0x0a1a58
  [-18]  0x0a1a61
  [-17]  0x0a1a5d
  [-16]  0x0a1a61
  [-15]  0x0a1a5d
  [-14]  0x0a1a61
  [-13]  0x0a1a5d
  [-12]  0x0a1a61
  [-11]  0x0a1a5d
  [-10]  0x0a1a61
  [-9]  0x0a1a5d
  [-8]  0x0a1a61
  [-7]  0x0a1a5d
  [-6]  0x0a1a61
  [-5]  0x0a1a67
  [-4]  0x0a1a1d
  [-3]  0x0a1a30
  [-2]  0x0a2c03
  [-1]  0x0a2c05

### Unique blocks visited: 125

### Dasm of last 8 distinct blocks in trace


**0x0a1a58** (mode=adl):
```
  0x0a1a58  ld de, (0x002688)
  0x0a1a5d  sla a
  0x0a1a5f  jr nc, 0x0a1a4f
```
exits: branch→0x0a1a4f, fallthrough→0x0a1a61

**0x0a1a5d** (mode=adl):
```
  0x0a1a5d  sla a
  0x0a1a5f  jr nc, 0x0a1a4f
```
exits: branch→0x0a1a4f, fallthrough→0x0a1a61

**0x0a1a61** (mode=adl):
```
  0x0a1a61  ld (hl), e
  0x0a1a62  inc hl
  0x0a1a63  ld (hl), d
  0x0a1a64  inc hl
  0x0a1a65  djnz 0x0a1a5d
```
exits: branch→0x0a1a5d, fallthrough→0x0a1a67

**0x0a1a67** (mode=adl):
```
  0x0a1a67  ret
```
exits: return→0x000000

**0x0a1a1d** (mode=adl):
```
  0x0a1a1d  pop bc
  0x0a1a1e  ld hl, (0xd02a62)
  0x0a1a22  ld de, 0x000028
  0x0a1a26  add hl, de
  0x0a1a27  ld (0xd02a62), hl
  0x0a1a2b  dec b
  0x0a1a2c  jp nz, 0x0a1854
```
exits: branch→0x0a1854, fallthrough→0x0a1a30

**0x0a1a30** (mode=adl):
```
  0x0a1a30  res 0, (iy+8)
  0x0a1a34  pop ix
  0x0a1a36  pop hl
  0x0a1a37  pop de
  0x0a1a38  pop bc
  0x0a1a39  pop af
  0x0a1a3a  ret
```
exits: return→0x000000

**0x0a2c03** (mode=adl):
```
  0x0a2c03  djnz 0x0a2b85
```
exits: branch→0x0a2b85, fallthrough→0x0a2c05

**0x0a2c05** (mode=adl):
```
  0x0a2c05  pop de
  0x0a2c06  pop af
  0x0a2c07  scf
  0x0a2c08  pop hl
  0x0a2c09  pop de
  0x0a2c0a  pop bc
  0x0a2c0b  ret
```
exits: return→0x000000
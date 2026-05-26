# Phase 449: 0x001713 -> 0x0008BB Return Path

## Boot Summary
- boot: steps=1705 termination=error lastPc=0xD18C22
- kernel: steps=3344 termination=error lastPc=0xD18C22
- postInit: steps=1 termination=error lastPc=0xFFFFFF
- stage1: steps=28 termination=error lastPc=0xFFFFFF
- stage2: steps=107 termination=error lastPc=0xFFFFFF
- stage3: steps=17506 termination=error lastPc=0xFFFFFF
- stage4: steps=514 termination=error lastPc=0xFFFFFF

## Static Disassembly
### 0x001713-0x001800

```text
0x001713: CD BB 08 00          call 0x0008BB
0x001717: C0                   ret nz
0x001718: 3A BA 77 D1          ld a, (0xD177BA)
0x00171C: B7                   or a
0x00171D: C0                   ret nz
0x00171E: 01 00 00 02          ld bc, 0x020000
0x001722: C5                   push bc
0x001723: CD F8 67 00          call 0x0067F8
0x001727: C1                   pop bc
0x001728: 2D                   dec l
0x001729: C9                   ret
0x00172A: 11 30 03 00          ld de, 0x000330
0x00172E: CD 55 1C 00          call 0x001C55
0x001732: C0                   ret nz
0x001733: CD 4F 1C 00          call 0x001C4F
0x001737: 11 00 04 00          ld de, 0x000400
0x00173B: CD 33 1C 00          call 0x001C33
0x00173F: C0                   ret nz
0x001740: CD 4F 1C 00          call 0x001C4F
0x001744: C5                   push bc
0x001745: 11 19 06 D0          ld de, 0xD00619
0x001749: ED B0                ldir
0x00174B: C1                   pop bc
0x00174C: 41                   ld b, c
0x00174D: AF                   xor a
0x00174E: C9                   ret
0x00174F: 21 00 00 00          ld hl, 0x000000
0x001753: 22 95 05 D0          ld (0xD00595), hl
0x001757: 21 A6 57 01          ld hl, 0x0157A6
0x00175B: CD E9 59 00          call 0x0059E9
0x00175F: 21 73 0D 00          ld hl, 0x000D73
0x001763: CD E9 59 00          call 0x0059E9
0x001767: C9                   ret
0x001768: 3E 05                ld a, 0x05
0x00176A: 06 06                ld b, 0x06
0x00176C: C9                   ret
0x00176D: 3E 01                ld a, 0x01
0x00176F: C9                   ret
0x001770: 3E 00                ld a, 0x00
0x001772: 06 06                ld b, 0x06
0x001774: C9                   ret
0x001775: 3E 07                ld a, 0x07
0x001777: C9                   ret
0x001778: E5                   push hl
0x001779: 21 26 00 00          ld hl, 0x000026
0x00177D: 22 58 26 D0          ld (0xD02658), hl
0x001781: E1                   pop hl
0x001782: C9                   ret
0x001783: FB                   ei
0x001784: 76                   halt
0x001785: 00                   nop
0x001786: E5                   push hl
0x001787: 2A 58 26 D0          ld hl, (0xD02658)
0x00178B: 7D                   ld a, l
0x00178C: B4                   or h
0x00178D: 28 03                jr z, 0x001792
0x00178F: 3E 01                ld a, 0x01
0x001791: B7                   or a
0x001792: E1                   pop hl
0x001793: C9                   ret
0x001794: 06 F8                ld b, 0xF8
0x001796: CD 78 17 00          call 0x001778
0x00179A: CD 96 12 00          call 0x001296
0x00179E: 28 1C                jr z, 0x0017BC
0x0017A0: CD 52 16 00          call 0x001652
0x0017A4: ED 38 0F             in0 a, (0x0F)
0x0017A7: CB 7F                bit 7, a
0x0017A9: 20 04                jr nz, 0x0017AF
0x0017AB: CB 77                bit 6, a
0x0017AD: 20 01                jr nz, 0x0017B0
0x0017AF: C9                   ret
0x0017B0: CD 83 17 00          call 0x001783
0x0017B4: 20 E4                jr nz, 0x00179A
0x0017B6: CD CE 17 00          call 0x0017CE
0x0017BA: 10 DA                djnz 0x001796
0x0017BC: E5                   push hl
0x0017BD: 21 00 00 00          ld hl, 0x000000
0x0017C1: 22 95 05 D0          ld (0xD00595), hl
0x0017C5: E1                   pop hl
0x0017C6: 11 00 00 00          ld de, 0x000000
0x0017CA: C3 0F 3A 00          jp 0x003A0F
0x0017CE: E5                   push hl
0x0017CF: 21 00 0C 00          ld hl, 0x000C00
0x0017D3: CD DD 17 00          call 0x0017DD
0x0017D7: E1                   pop hl
0x0017D8: C9                   ret
0x0017D9: 7C                   ld a, h
0x0017DA: 2F                   cpl
0x0017DB: 2D                   dec l
0x0017DC: 5C                   ld e, h
0x0017DD: F5                   push af
0x0017DE: 22 95 05 D0          ld (0xD00595), hl
0x0017E2: 3A 44 77 D1          ld a, (0xD17744)
0x0017E6: 3C                   inc a
0x0017E7: E6 03                and 0x03
0x0017E9: 32 44 77 D1          ld (0xD17744), a
0x0017ED: 21 D9 17 00          ld hl, 0x0017D9
0x0017F1: 85                   add l
0x0017F2: 6F                   ld l, a
0x0017F3: 3E 00                ld a, 0x00
0x0017F5: 8C                   adc h
0x0017F6: 67                   ld h, a
0x0017F7: 7E                   ld a, (hl)
0x0017F8: CD C6 59 00          call 0x0059C6
0x0017FC: F1                   pop af
0x0017FD: C9                   ret
0x0017FE: DD E5                push ix
0x001800: DD 21 0C 18 00       ld ix, 0x00180C
```

### 0x003A73-0x003A90

```text
0x003A73: CD 5A 3D 00          call 0x003D5A
0x003A77: C1                   pop bc
0x003A78: B7                   or a
0x003A79: 20 02                jr nz, 0x003A7D
0x003A7B: 10 F5                djnz 0x003A72
0x003A7D: CD 13 17 00          call 0x001713
0x003A81: C2 33 19 00          jp nz, 0x001933
0x003A85: C3 89 3A 00          jp 0x003A89
0x003A89: CD 53 18 00          call 0x001853
0x003A8D: AF                   xor a
0x003A8E: C3 21 07 00          jp 0x000721
```

### 0x003A89-0x003AA0

```text
0x003A89: CD 53 18 00          call 0x001853
0x003A8D: AF                   xor a
0x003A8E: C3 21 07 00          jp 0x000721
0x003A92: 20 45                jr nz, 0x003AD9
0x003A94: 52 52                sil ld d, d
0x003A96: 4F                   ld c, a
0x003A97: 52 21 00 20 50       sil ld hl, 0x502000
0x003A9C: 72                   ld (hl), d
0x003A9D: 65                   ld h, l
0x003A9E: 73                   ld (hl), e
0x003A9F: 73                   ld (hl), e
0x003AA0: 20 61                jr nz, 0x003B03
```

### 0x003A73-0x003AA0

```text
0x003A73: CD 5A 3D 00          call 0x003D5A
0x003A77: C1                   pop bc
0x003A78: B7                   or a
0x003A79: 20 02                jr nz, 0x003A7D
0x003A7B: 10 F5                djnz 0x003A72
0x003A7D: CD 13 17 00          call 0x001713
0x003A81: C2 33 19 00          jp nz, 0x001933
0x003A85: C3 89 3A 00          jp 0x003A89
0x003A89: CD 53 18 00          call 0x001853
0x003A8D: AF                   xor a
0x003A8E: C3 21 07 00          jp 0x000721
0x003A92: 20 45                jr nz, 0x003AD9
0x003A94: 52 52                sil ld d, d
0x003A96: 4F                   ld c, a
0x003A97: 52 21 00 20 50       sil ld hl, 0x502000
0x003A9C: 72                   ld (hl), d
0x003A9D: 65                   ld h, l
0x003A9E: 73                   ld (hl), e
0x003A9F: 73                   ld (hl), e
0x003AA0: 20 61                jr nz, 0x003B03
```

### 0x0067F8-0x006817

```text
0x0067F8: DD E5                push ix
0x0067FA: DD 21 00 00 00       ld ix, 0x000000
0x0067FF: DD 39                add ix, sp
0x006801: DD 27 06             ld hl, (ix+0x6)
0x006804: CD 4F 1C 00          call 0x001C4F
0x006808: 11 C0 80 00          ld de, 0x0080C0
0x00680C: CD 33 1C 00          call 0x001C33
0x006810: 20 12                jr nz, 0x006824
0x006812: CD 4F 1C 00          call 0x001C4F
0x006816: ED 38 03             in0 a, (0x03)
```

## Dynamic Trace: key 1
- Injected scan code: 0x41 for key '1'
- Start PC/mode: 0x003A73 / adl
- Termination: stopped:event-loop-reentry
- 0x001713 entry: step 6, return address on stack = 0x003A81, A=0x41 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xD00085 SP=0xD1A872 IX=0xD1A860 IY=0xD00080
- 0x0008BB reached: yes at step 7, A=0x41 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xD00085 SP=0xD1A86F IX=0xD1A860 IY=0xD00080
- 0x0067F8 reached: no
- Return site after 0x001713: 0x003A81 with Z clear (F=0x82)
- Branch taken after return: 0x001933 (HALT/sleep path) at step 10
- Event loop re-entry: yes, 0x003A73 was reached again at step 54
- 0x003A89 head: call 0x001853
- Post-run RAM: D00080=0x00 D00587=0x00 D14091=0x01 D177B7=0x55

```text
     1  0x003A73  CD 5A 3D 00          call 0x003D5A                A=0x00 F=0x40 BC=0x001FD5 DE=0x000000 HL=0xD00085 SP=0xD1A872 IX=0xD1A860 IY=0xD00080
     4  0x003A77  C1                   pop bc                       A=0x41 F=0x44 BC=0x0041D5 DE=0x000000 HL=0xD00085 SP=0xD1A872 IX=0xD1A860 IY=0xD00080
     5  0x003A7D  CD 13 17 00          call 0x001713                A=0x41 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xD00085 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
     6  0x001713  CD BB 08 00          call 0x0008BB                A=0x41 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xD00085 SP=0xD1A872 IX=0xD1A860 IY=0xD00080
     7  0x0008BB  2A 00 01 02          ld hl, (0x020100)            A=0x41 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xD00085 SP=0xD1A86F IX=0xD1A860 IY=0xD00080
     8  0x001717  C0                   ret nz                       A=0x41 F=0x82 BC=0x00A55A DE=0x000000 HL=0xFF0000 SP=0xD1A872 IX=0xD1A860 IY=0xD00080
     9  0x003A81  C2 33 19 00          jp nz, 0x001933              A=0x41 F=0x82 BC=0x00A55A DE=0x000000 HL=0xFF0000 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
    10  0x001933  CD 0D 62 00          call 0x00620D                A=0x41 F=0x82 BC=0x00A55A DE=0x000000 HL=0xFF0000 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
    52  0x001937  F3                   di                           A=0x00 F=0x42 BC=0x00D000 DE=0x000000 HL=0xFF0000 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
    54  0x003A73  CD 5A 3D 00          call 0x003D5A                A=0xC4 F=0x42 BC=0x00D000 DE=0x000000 HL=0xFF0000 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
```

## Dynamic Trace: key +
- Injected scan code: 0x11 for key '+'
- Start PC/mode: 0x003A73 / adl
- Termination: stopped:event-loop-reentry
- 0x001713 entry: step 6, return address on stack = 0x003A81, A=0x11 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xFF0000 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
- 0x0008BB reached: yes at step 7, A=0x11 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xFF0000 SP=0xD1A872 IX=0xD1A860 IY=0xD00080
- 0x0067F8 reached: no
- Return site after 0x001713: 0x003A81 with Z clear (F=0x82)
- Branch taken after return: 0x001933 (HALT/sleep path) at step 10
- Event loop re-entry: yes, 0x003A73 was reached again at step 54
- 0x003A89 head: call 0x001853
- Post-run RAM: D00080=0x00 D00587=0x00 D14091=0x01 D177B7=0x55

```text
     1  0x003A73  CD 5A 3D 00          call 0x003D5A                A=0xC4 F=0x42 BC=0x00D000 DE=0x000000 HL=0xFF0000 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
     4  0x003A77  C1                   pop bc                       A=0x11 F=0x44 BC=0x001100 DE=0x000000 HL=0xFF0000 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
     5  0x003A7D  CD 13 17 00          call 0x001713                A=0x11 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xFF0000 SP=0xD1A878 IX=0xD1A860 IY=0xD00080
     6  0x001713  CD BB 08 00          call 0x0008BB                A=0x11 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xFF0000 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
     7  0x0008BB  2A 00 01 02          ld hl, (0x020100)            A=0x11 F=0x04 BC=0xFFFFFF DE=0x000000 HL=0xFF0000 SP=0xD1A872 IX=0xD1A860 IY=0xD00080
     8  0x001717  C0                   ret nz                       A=0x11 F=0x82 BC=0x00A55A DE=0x000000 HL=0xFF0000 SP=0xD1A875 IX=0xD1A860 IY=0xD00080
     9  0x003A81  C2 33 19 00          jp nz, 0x001933              A=0x11 F=0x82 BC=0x00A55A DE=0x000000 HL=0xFF0000 SP=0xD1A878 IX=0xD1A860 IY=0xD00080
    10  0x001933  CD 0D 62 00          call 0x00620D                A=0x11 F=0x82 BC=0x00A55A DE=0x000000 HL=0xFF0000 SP=0xD1A878 IX=0xD1A860 IY=0xD00080
    52  0x001937  F3                   di                           A=0x00 F=0x42 BC=0x00D000 DE=0x000000 HL=0xFF0000 SP=0xD1A878 IX=0xD1A860 IY=0xD00080
    54  0x003A73  CD 5A 3D 00          call 0x003D5A                A=0xC4 F=0x42 BC=0x00D000 DE=0x000000 HL=0xFF0000 SP=0xD1A878 IX=0xD1A860 IY=0xD00080
```

## Analysis
- For key '1', 0x001713 returned with Z clear (F=0x82).
- The event loop took 0x001933 after the return, which matches the HALT/sleep side of the dispatch. When the trace observed 0x003A73 again, re-entry was via the executor's DI-HALT bypass back to the event loop.
- For the second key ('+'), the return/branch pattern repeated: yes.
- The second trace was launched from the first observed re-entry to 0x003A73, so it re-used the post-first-key home-screen state.
- 0x0067F8 was not entered during either trace, so its role here is inferred only from the static disassembly below.


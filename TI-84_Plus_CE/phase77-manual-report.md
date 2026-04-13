# Phase 77 Manual Static Analysis (CC after Codex timeouts)

All three investigation-heavy Codex dispatches (P1/P2/P3) timed out. CC pivoted to
a unified Node static-analysis script. P4 (simple probe) succeeded as a null result.

## Section 1 — Disasm of 0x028f02 (TEST mode label helper)

Following fallthrough chain from function entry.

```
  0x028f02  call 0x080244                 
```

Block 0x028f02 (mode=adl) exits:
- call → 0x080244 (adl)
- call-return → 0x028f06 (adl)

## Section 2 — Callers of 0x028f02

Found 11 blocks with `call 0x028f02`.

### Caller dasm (block entry + instructions)


**Caller block 0x02968d (mode=adl)**:
```
  0x02968d  ld hl, 0x029304
  0x029691  ld a, 0xb7
  0x029693  call 0x028f02
```

**Caller block 0x029703 (mode=adl)**:
```
  0x029703  ld hl, 0x029132
  0x029707  ld a, 0x91
  0x029709  call 0x028f02
```

**Caller block 0x0296f7 (mode=adl)**:
```
  0x0296f7  ld hl, 0x029139
  0x0296fb  ld a, 0x92
  0x0296fd  call 0x028f02
```

**Caller block 0x02892d (mode=adl)**:
```
  0x02892d  push af
  0x02892e  ld (0x000595), de
  0x028933  call 0x028f02
```

**Caller block 0x028929 (mode=adl)**:
```
  0x028929  ld de, 0x000a09
  0x02892d  push af
  0x02892e  ld (0x000595), de
  0x028933  call 0x028f02
```

**Caller block 0x029733 (mode=adl)**:
```
  0x029733  call 0x028f02
```

**Caller block 0x02972d (mode=adl)**:
```
  0x02972d  ld hl, 0x029143
  0x029731  ld a, 0x94
  0x029733  call 0x028f02
```

**Caller block 0x029788 (mode=adl)**:
```
  0x029788  call 0x028f02
```

**Caller block 0x029782 (mode=adl)**:
```
  0x029782  ld hl, 0x02914b
  0x029786  ld a, 0xa8
  0x029788  call 0x028f02
```

**Caller block 0x028bc0 (mode=adl)**:
```
  0x028bc0  ld hl, 0x029024
  0x028bc4  ld a, 0x8a
  0x028bc6  call 0x028f02
```

**Caller block 0x028bd0 (mode=adl)**:
```
  0x028bd0  ld hl, 0x02903c
  0x028bd4  ld a, 0xbd
  0x028bd6  call 0x028f02
```

### Predecessors of caller blocks (A/HL setup)


**Predecessors of 0x029703**:
```
  0x0296f1  bit 2, (iy+0)
  0x0296f5  jr nz, 0x029703
```

**Predecessors of 0x0296f7**:
```
  0x0296f1  bit 2, (iy+0)
  0x0296f5  jr nz, 0x029703
```

**Predecessors of 0x029733**:
```
  0x029721  bit 0, (iy+26)
  0x029725  ld hl, 0x029140
  0x029729  ld a, 0x93
  0x02972b  jr nz, 0x029733
```

**Predecessors of 0x02972d**:
```
  0x029721  bit 0, (iy+26)
  0x029725  ld hl, 0x029140
  0x029729  ld a, 0x93
  0x02972b  jr nz, 0x029733
```

**Predecessors of 0x029788**:
```
  0x02977a  ld hl, 0x029147
  0x02977e  ld a, 0xa7
  0x029780  jr nz, 0x029788
```

## Section 3 — JT slot scan (BCALL targets)

- Slots targeting 0x0a0300-0x0a0600 (token-table region): **0**
- Slots targeting 0x005000-0x006500 (char-print region): **0**
- Slots targeting 0x0a2000-0x0a7000 (near token table): **16**

### Mode-region slots (all 16)

| slot | slotOffset | target | block@target? |
|------|------------|--------|---------------|
| 591 | 0x06ed | 0x0a2032 | yes |
| 595 | 0x06f9 | 0x0a215b | yes |
| 599 | 0x0705 | 0x0a21bb | yes |
| 603 | 0x0711 | 0x0a21f2 | yes |
| 607 | 0x071d | 0x0a22b1 | yes |
| 611 | 0x0729 | 0x0a237e | yes |
| 615 | 0x0735 | 0x0a26ee | yes |
| 619 | 0x0741 | 0x0a27dd | yes |
| 623 | 0x074d | 0x0a2802 | yes |
| 627 | 0x0759 | 0x0a29ec | yes |
| 631 | 0x0765 | 0x0a2a3e | yes |
| 635 | 0x0771 | 0x0a2a68 | yes |
| 639 | 0x077d | 0x0a2b72 | yes |
| 643 | 0x0789 | 0x0a2ca6 | yes |
| 647 | 0x0795 | 0x0a32af | yes |
| 851 | 0x09f9 | 0x0a5424 | yes |

### Mode-region slot target dasm (first 10 insts each)


**Slot 591 → 0x0a2032**
```
  0x0a2032  push af
  0x0a2033  push bc
  0x0a2034  push de
  0x0a2035  push hl
  0x0a2036  push ix
  0x0a2038  call 0x0a2013
```

**Slot 595 → 0x0a215b**
```
  0x0a215b  ld a, (0xd00595)
  0x0a215f  add a, b
  0x0a2160  sub 0x09
  0x0a2162  cp 0x01
  0x0a2164  ret m
  0x0a2165  ld b, a
  0x0a2166  ld hl, 0xd00595
  0x0a216a  call 0x0a2106
```

**Slot 599 → 0x0a21bb**
```
  0x0a21bb  ld bc, 0x001eef
  0x0a21bf  jr 0x0a21d7
```

**Slot 603 → 0x0a21f2**
```
  0x0a21f2  call 0x0a21c1
```

**Slot 607 → 0x0a22b1**
```
  0x0a22b1  push af
  0x0a22b2  bit 1, (iy+42)
  0x0a22b6  jr z, 0x0a22be
  0x0a22b8  pop af
  0x0a22b9  call 0x025c33
```

**Slot 611 → 0x0a237e**
```
  0x0a237e  push af
  0x0a237f  push bc
  0x0a2380  push de
  0x0a2381  ld a, (0xd00595)
  0x0a2385  call 0x0a2a37
```

**Slot 615 → 0x0a26ee**
```
  0x0a26ee  push af
  0x0a26ef  call 0x0a26f5
```

**Slot 619 → 0x0a27dd**
```
  0x0a27dd  push af
  0x0a27de  push bc
  0x0a27df  push de
  0x0a27e0  push hl
  0x0a27e1  bit 6, (iy+27)
  0x0a27e5  jr nz, 0x0a27fe
  0x0a27e7  ld hl, 0x000000
  0x0a27eb  ld (0x0005f6), hl
  0x0a27ef  ld a, 0x01
  0x0a27f1  ld (0xd005f5), a
  0x0a27f5  call 0x03d1c3
```

**Slot 623 → 0x0a2802**
```
  0x0a2802  ld hl, (0x000595)
  0x0a2806  ld (0x0007c4), hl
  0x0a280a  ld a, (0xd02504)
  0x0a280e  ld (0xd007c7), a
  0x0a2812  ld a, (0xd00092)
  0x0a2816  ld (0xd007c8), a
  0x0a281a  ld a, (0xd00085)
  0x0a281e  and 0x10
  0x0a2820  ld (0xd007c9), a
  0x0a2824  ld hl, (0x00059a)
  0x0a2828  ld (0x002ad2), hl
  0x0a282c  ret
```

**Slot 627 → 0x0a29ec**
```
  0x0a29ec  ld hl, (0x0007c4)
  0x0a29f0  ld h, 0x00
  0x0a29f2  ld (0x000595), hl
  0x0a29f6  call 0x0a237e
```

**Slot 631 → 0x0a2a3e**
```
  0x0a2a3e  call 0x0a2a68
```

**Slot 635 → 0x0a2a68**
```
  0x0a2a68  ld hl, 0x000000
  0x0a2a6c  ld l, e
  0x0a2a6d  ld a, d
  0x0a2a6e  or a
  0x0a2a6f  jp z, 0x0a2af9
  0x0a2a73  ld de, 0x09fb7d
  0x0a2a77  cp 0x5d
  0x0a2a79  jp c, 0x0a2afd
  0x0a2a7d  ld de, 0x09fb9b
  0x0a2a81  jr z, 0x0a2afd
  0x0a2a83  ld de, 0x09fbad
  0x0a2a87  cp 0x60
```

**Slot 639 → 0x0a2b72**
```
  0x0a2b72  xor a
  0x0a2b73  push bc
  0x0a2b74  push de
  0x0a2b75  push hl
  0x0a2b76  push af
  0x0a2b77  ld b, 0x00
  0x0a2b79  push bc
  0x0a2b7a  call 0x0a2a68
```

**Slot 643 → 0x0a2ca6**
```
  0x0a2ca6  bit 1, (iy+42)
  0x0a2caa  jr z, 0x0a2cb1
  0x0a2cac  call 0x025dea
```

**Slot 647 → 0x0a32af**
```
  0x0a32af  ld a, (0xd005f9)
  0x0a32b3  ld d, 0x00
  0x0a32b5  cp 0x5c
  0x0a32b7  jr c, 0x0a32dd
  0x0a32b9  cp 0x5d
  0x0a32bb  ld d, a
  0x0a32bc  ld a, (0xd005fa)
  0x0a32c0  jr nz, 0x0a32dd
  0x0a32c2  cp 0x06
  0x0a32c4  jr c, 0x0a32dd
  0x0a32c6  ld hl, 0xd005fa
  0x0a32ca  ld de, 0xd00879
```

**Slot 851 → 0x0a5424**
```
  0x0a5424  push bc
  0x0a5425  bit 1, (iy+53)
  0x0a5429  jr z, 0x0a5439
  0x0a542b  ld b, a
  0x0a542c  ld a, 0x75
  0x0a542e  call 0x02398e
```

## Section 4 — Walker candidate scan

Total blocks with `call 0x0059c6`: **13**

Total blocks with `call 0x0a1cac`: **118**

Found 7 clusters total, 5 with 2+ print-call blocks.

### Multi-call clusters (2+ print calls within 256 bytes)

Top 5 multi-print clusters (by print-call count):

| funcEntry | call count | span |
|-----------|-----------:|------|
| 0x0015c7 | 2 | 26 bytes |
| 0x0017dd | 2 | 5 bytes |
| 0x0059f3 | 2 | 66 bytes |
| 0x013d11 | 2 | 8 bytes |
| 0x015862 | 2 | 2 bytes |

### Dasm of top 8 multi-print clusters


#### Cluster at 0x0015c7 (2 print calls)

```
  0x0015ab  ld hl, 0x0157f7                 
  0x0015af  jr 0x0015b5                     
  0x0015b1  ld hl, 0x0157e4                 
  0x0015b5  call 0x0059e9                   
  0x0015b5  call 0x0059e9                   
  0x0015b9  ld hl, 0x0157cf                 
  0x0015bd  call 0x0059e9                   
  0x0015c1  call 0x001efd                   
  0x0015c5  jr c, 0x0015d5                  
  0x0015c7  ld a, 0x09                      
  0x0015c9  ld hl, 0x001700                 
  0x0015cd  ld (0xd00595), hl               
  0x0015d1  call 0x0059c6                   
  0x0015d5  ld bc, 0x000f13                 
  0x0015d9  push bc                         
  0x0015da  call 0x0066ff                   
  0x0015de  pop bc                          
  0x0015df  jr z, 0x0015f7                  
  0x0015e1  set 3, (iy+5)                   
  0x0015e5  ld a, 0x0a                      
  0x0015e7  ld hl, 0x001900                 
  0x0015eb  ld (0xd00595), hl               
  0x0015ef  call 0x0059c6                   
  0x0015f3  res 3, (iy+5)                   
  0x0015f7  call 0x001652                   
  0x0015f7  call 0x001652                   
  0x0015fb  in0 a, (0x0f)                   
  0x0015fe  bit 7, a                        
  0x001600  ld bc, 0x000000                 
  0x001604  jr nz, 0x001644                 
```

#### Cluster at 0x0017dd (2 print calls)

```
  0x0017ce  push hl                         
  0x0017cf  ld hl, 0x000c00                 
  0x0017d3  call 0x0017dd                   
  0x0017d7  pop hl                          
  0x0017d8  ret                             
  0x0017dd  push af                         
  0x0017de  ld (0xd00595), hl               
  0x0017e2  ld a, (0xd17744)                
  0x0017e6  inc a                           
  0x0017e7  and 0x03                        
  0x0017e9  ld (0xd17744), a                
  0x0017ed  ld hl, 0x0017d9                 
  0x0017f1  add a, l                        
  0x0017f2  ld l, a                         
  0x0017f3  ld a, 0x00                      
  0x0017f5  adc a, h                        
  0x0017f6  ld h, a                         
  0x0017f7  ld a, (hl)                      
  0x0017f8  call 0x0059c6                   
  0x0017dd  push af                         
  0x0017de  ld (0x000595), hl               
  0x0017e1  ret nc                          
  0x0017e2  ld a, (0x007744)                
  0x0017e5  pop de                          
  0x0017e6  inc a                           
  0x0017e7  and 0x03                        
  0x0017e9  ld (0x007744), a                
  0x0017ec  pop de                          
  0x0017ed  ld hl, 0x0017d9                 
  0x0017f0  nop                             
  0x0017f1  add a, l                        
  0x0017f2  ld l, a                         
  0x0017f3  ld a, 0x00                      
  0x0017f5  adc a, h                        
  0x0017f6  ld h, a                         
  0x0017f7  ld a, (hl)                      
  0x0017f8  call 0x0059c6                   
  0x0017fb  nop                             
  0x0017fc  pop af                          
  0x0017fd  ret                             
  0x0017fc  pop af                          
  0x0017fd  ret                             
  0x0017fe  push ix                         
  0x001800  ld ix, 0x00180c                 
  0x001805  call 0x000d7e                   
```

#### Cluster at 0x0059f3 (2 print calls)

```
  0x0059d3  nop                             
  0x0059d4  jr 0x0059e6                     
  0x0059d4  jr 0x0059e6                     
  0x0059d6  call 0x005a75                   
  0x0059d6  call 0x005a75                   
  0x0059d9  nop                             
  0x0059da  ld hl, 0x000596                 
  0x0059dd  ret nc                          
  0x0059da  ld hl, 0xd00596                 
  0x0059de  inc (hl)                        
  0x0059df  ld a, (hl)                      
  0x0059e0  cp 0x1a                         
  0x0059e2  call nc, 0x005a02               
  0x0059de  inc (hl)                        
  0x0059df  ld a, (hl)                      
  0x0059e0  cp 0x1a                         
  0x0059e2  call nc, 0x005a02               
  0x0059e5  nop                             
  0x0059e6  pop hl                          
  0x0059e7  pop af                          
  0x0059e8  ret                             
  0x0059e6  pop hl                          
  0x0059e7  pop af                          
  0x0059e8  ret                             
  0x0059e6  pop hl                          
  0x0059e7  pop af                          
  0x0059e8  ret                             
  0x0059e9  push bc                         
  0x0059ea  push af                         
  0x0059eb  ld b, 0x0a                      
  0x0059ed  ld a, (hl)                      
  0x0059ee  inc hl                          
  0x0059ef  or a                            
  0x0059f0  scf                             
  0x0059f1  jr z, 0x0059fe                  
  0x0059ed  ld a, (hl)                      
  0x0059ee  inc hl                          
  0x0059ef  or a                            
  0x0059f0  scf                             
  0x0059f1  jr z, 0x0059fe                  
  0x0059f3  call 0x0059c6                   
  0x0059f7  ld a, (0xd00595)                
  0x0059fb  cp b                            
  0x0059fc  jr c, 0x0059ed                  
  0x0059fe  pop bc                          
  0x0059ff  ld a, b                         
  0x005a00  pop bc                          
  0x005a01  ret                             
  0x005a02  push af                         
  0x005a03  push bc                         
  0x005a04  push de                         
  0x005a05  push hl                         
  0x005a06  push ix                         
  0x005a08  sub a                           
  0x005a09  ld (0xd00596), a                
  0x005a0d  ld hl, 0xd00595                 
  0x005a11  ld a, (hl)                      
  0x005a12  inc a                           
  0x005a13  cp 0x0a                         
  0x005a15  jr c, 0x005a18                  
  0x005a02  push af                         
  0x005a03  push bc                         
  0x005a04  push de                         
  0x005a05  push hl                         
  0x005a06  push ix                         
  0x005a08  sub a                           
  0x005a09  ld (0x000596), a                
  0x005a0c  ret nc                          
  0x005a0d  ld hl, 0x000595                 
  0x005a10  ret nc                          
  0x005a11  ld a, (hl)                      
  0x005a12  inc a                           
  0x005a13  cp 0x0a                         
  0x005a15  jr c, 0x005a18                  
  0x005a17  xor a                           
  0x005a18  ld (hl), a                      
  0x005a19  pop ix                          
  0x005a1b  pop hl                          
  0x005a1c  pop de                          
  0x005a1d  pop bc                          
  0x005a1e  pop af                          
  0x005a1f  ret                             
  0x005a17  xor a                           
  0x005a18  ld (hl), a                      
  0x005a19  pop ix                          
  0x005a1b  pop hl                          
  0x005a1c  pop de                          
  0x005a1d  pop bc                          
  0x005a1e  pop af                          
  0x005a1f  ret                             
  0x005a18  ld (hl), a                      
  0x005a19  pop ix                          
  0x005a1b  pop hl                          
  0x005a1c  pop de                          
  0x005a1d  pop bc                          
  0x005a1e  pop af                          
  0x005a1f  ret                             
  0x005a18  ld (hl), a                      
  0x005a19  pop ix                          
  0x005a1b  pop hl                          
  0x005a1c  pop de                          
  0x005a1d  pop bc                          
  0x005a1e  pop af                          
  0x005a1f  ret                             
  0x005a19  pop ix                          
  0x005a1b  pop hl                          
  0x005a1c  pop de                          
  0x005a1d  pop bc                          
  0x005a1e  pop af                          
  0x005a1f  ret                             
```

#### Cluster at 0x013d11 (2 print calls)

```
  0x013d00  ld a, i                         
  0x013d02  push af                         
  0x013d03  di                              
  0x013d04  push iy                         
  0x013d06  push ix                         
  0x013d08  ld iy, 0xd00080                 
  0x013d0d  call 0x005ba6                   
  0x013d11  res 3, (iy+5)                   
  0x013d15  ld a, 0x20                      
  0x013d17  ld b, 0x0e                      
  0x013d19  call 0x0059c6                   
  0x013d19  call 0x0059c6                   
  0x013d1d  djnz 0x013d19                   
  0x013d1f  ld de, 0x000004                 
  0x013d23  ld hl, 0x013d3b                 
  0x013d27  ld b, 0x05                      
  0x013d29  ld (0xd00595), de               
  0x013d2e  call 0x0059e9                   
  0x013d29  ld (0xd00595), de               
  0x013d2e  call 0x0059e9                   
  0x013d32  inc de                          
  0x013d33  djnz 0x013d29                   
  0x013d35  pop ix                          
  0x013d37  pop iy                          
  0x013d39  jr 0x013d87                     
```

#### Cluster at 0x015862 (2 print calls)

```
  0x015842  ld a, c                         
  0x015843  cp 0x24                         
  0x015845  jr nz, 0x015841                 
  0x015847  call 0x0061e3                   
  0x015849  ld h, c                         
  0x01584a  nop                             
  0x01584b  in0 a, (0x05)                   
  0x01584e  res 6, a                        
  0x015850  res 4, a                        
  0x015852  out0 (0x05), a                  
  0x015855  ret                             
  0x01584b  in0 a, (0x05)                   
  0x01584e  res 6, a                        
  0x015850  res 4, a                        
  0x015852  out0 (0x05), a                  
  0x015855  ret                             
  0x01584e  res 6, a                        
  0x015850  res 4, a                        
  0x015852  out0 (0x05), a                  
  0x015855  ret                             
  0x015856  and 0x0f                        
  0x015858  ld (0xd00595), hl               
  0x01585c  inc h                           
  0x01585d  push hl                         
  0x01585e  cp 0x0a                         
  0x015860  jr c, 0x015864                  
  0x01585c  inc h                           
  0x01585d  push hl                         
  0x01585e  cp 0x0a                         
  0x015860  jr c, 0x015864                  
  0x015862  add a, 0x07                     
  0x015864  add a, 0x30                     
  0x015866  call 0x0059c6                   
  0x015864  add a, 0x30                     
  0x015866  call 0x0059c6                   
  0x015868  ld e, c                         
  0x015869  nop                             
  0x01586a  pop hl                          
  0x01586b  ret                             
  0x01586a  pop hl                          
  0x01586b  ret                             
  0x01586c  push ix                         
  0x01586e  ld ix, 0x000000                 
  0x015873  add ix, sp                      
  0x015875  push af                         
  0x015876  push bc                         
  0x015877  push de                         
  0x015878  in0 b, (0x1f)                   
  0x01587b  inc b                           
  0x01587c  ld a, (ix+5)                    
  0x01587f  cp b                            
  0x015880  jr nc, 0x0158a5                 
  0x015875  push af                         
  0x015876  push bc                         
  0x015877  push de                         
  0x015878  in0 b, (0x1f)                   
  0x01587b  inc b                           
  0x01587c  ld a, (ix+5)                    
  0x01587f  cp b                            
  0x015880  jr nc, 0x0158a5                 
  0x015876  push bc                         
  0x015877  push de                         
  0x015878  in0 b, (0x1f)                   
  0x01587b  inc b                           
  0x01587c  ld a, (ix+5)                    
  0x01587f  cp b                            
  0x015880  jr nc, 0x0158a5                 
  0x01587b  inc b                           
  0x01587c  ld a, (ix+5)                    
  0x01587f  cp b                            
  0x015880  jr nc, 0x0158a5                 
  0x01587c  ld a, (ix+5)                    
  0x01587f  cp b                            
  0x015880  jr nc, 0x0158a5                 
  0x015882  daa                             
  0x015884  ld b, 0x11                      
  0x015886  ld a, h                         
  0x015887  adc a, b                        
  0x015888  pop de                          
  0x015889  xor a                           
  0x01588a  sbc hl, de                      
  0x01588c  jr c, 0x0158a5                  
```
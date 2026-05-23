# Phase 411: USB/Link Receive Workers Report

## Overview

Deep decode of 3 USB/Link receive workers from the notification dispatch table at 0x0120AA.

| Worker | Handler | Address Range | Size |
|--------|---------|---------------|------|
| USB Receive A | 0 | 0x013250-0x013376 | 294 bytes |
| USB Receive B | 1 | 0x013377-0x0135CE | 599 bytes |
| Extended Link | 4 | 0x0135CF-0x0136BE | 239 bytes |

## Probe Output

```
======================================================================
Phase 411: USB/Link Receive Workers Deep Decode
======================================================================

Workers from dispatch table at 0x0120AA (session 409):
  Handler 0: 0x013250 -- USB receive worker A
  Handler 1: 0x013377 -- USB receive worker B
  Handler 4: 0x0135CF -- Extended link worker
  Key RAM: D1776D=link buf ptr, D17795=protocol state, D1778F=recv size


======================================================================
[Worker A (USB receive A)] 0x013250-0x013376 (295 bytes, handler 0)
======================================================================

Disassembly (108 instructions):
  0x013250: 21 f9 ff ff              LD HL,0xfffff9
  0x013254: cd 97 21 00              CALL 0x002197
  0x013258: 01 00 00 00              LD BC,0x000000
  0x01325c: dd 0f fd                 LD (IX+fd),BC
  0x01325f: ed 4b 6d 77 d1           LD BC,(0xd1776d)
  0x013264: dd 0f fd                 LD (IX+fd),BC
  0x013267: ed 65 f9                 PEA IX+f9
  0x01326a: 01 04 00 00              LD BC,0x000004
  0x01326e: c5                       PUSH BC
  0x01326f: dd 31 fd                 LD SP,(IX+fd)
  0x013272: ed 66 05                 PEA IY+05
  0x013275: cd d8 52 01              CALL 0x0152d8
  0x013279: c1                       POP BC
  0x01327a: c1                       POP BC
  0x01327b: c1                       POP BC
  0x01327c: 01 ff 03 00              LD BC,0x0003ff
  0x013280: dd 27 f9                 LD HL,(IX+f9)
  0x013283: b7                       OR A
  0x013284: ed 42                    SBC HL,BC
  0x013286: 30 0a                    JR NC,0x013292
  0x013288: dd 07 f9                 LD BC,(IX+f9)
  0x01328b: ed 43 8f 77 d1           LD (0xd1778f),BC
  0x013290: 18 05                    JR 0x013297
  0x013292: ed 43 8f 77 d1           LD (0xd1778f),BC
  0x013297: 2a 6a 77 d1              LD HL,(0xd1776a)
  0x01329b: cd c2 21 00              CALL 0x0021c2
  0x01329f: 20 0e                    JR NZ,0x0132af
  0x0132a1: 01 01 00 00              LD BC,0x000001
  0x0132a5: c5                       PUSH BC
  0x0132a6: cd 8c 0f 01              CALL 0x010f8c
  0x0132aa: c1                       POP BC
  0x0132ab: 22 6a 77 d1              LD (0xd1776a),HL
  0x0132af: ed 4b 6a 77 d1           LD BC,(0xd1776a)
  0x0132b4: dd 0f fd                 LD (IX+fd),BC
  0x0132b7: ed 4b 8f 77 d1           LD BC,(0xd1778f)
  0x0132bc: dd 0f f9                 LD (IX+f9),BC
  0x0132bf: af                       XOR A
  0x0132c0: dd 77 fc                 LD (IX+fc),A
  0x0132c3: dd 31 fd                 LD SP,(IX+fd)
  0x0132c6: ed 66 05                 PEA IY+05
  0x0132c9: 01 04 00 00              LD BC,0x000004
  0x0132cd: c5                       PUSH BC
  0x0132ce: 01 00 00 00              LD BC,0x000000
  0x0132d2: c5                       PUSH BC
  0x0132d3: c5                       PUSH BC
  0x0132d4: dd 4e fc                 LD C,(IX+fc)
  0x0132d7: 06 00                    LD B,00
  0x0132d9: c5                       PUSH BC
  0x0132da: dd 07 f9                 LD BC,(IX+f9)
  0x0132dd: c5                       PUSH BC
  0x0132de: cd 49 53 01              CALL 0x015349
  0x0132e2: c1                       POP BC
  0x0132e3: c1                       POP BC
  0x0132e4: c1                       POP BC
  0x0132e5: c1                       POP BC
  0x0132e6: c1                       POP BC
  0x0132e7: c1                       POP BC
  0x0132e8: dd 31 fd                 LD SP,(IX+fd)
  0x0132eb: ed 66 00                 PEA IY+00
  0x0132ee: 01 04 00 00              LD BC,0x000004
  0x0132f2: c5                       PUSH BC
  0x0132f3: 01 00 00 00              LD BC,0x000000
  0x0132f7: c5                       PUSH BC
  0x0132f8: c5                       PUSH BC
  0x0132f9: c5                       PUSH BC
  0x0132fa: 01 04 00 00              LD BC,0x000004
  0x0132fe: c5                       PUSH BC
  0x0132ff: cd 49 53 01              CALL 0x015349
  0x013303: c1                       POP BC
  0x013304: c1                       POP BC
  0x013305: c1                       POP BC
  0x013306: c1                       POP BC
  0x013307: c1                       POP BC
  0x013308: c1                       POP BC
  0x013309: dd 31 fd                 LD SP,(IX+fd)
  0x01330c: fd 36 04 02              LD (IY+04),02
  0x013310: 01 09 00 00              LD BC,0x000009
  0x013314: ed 43 7b 77 d1           LD (0xd1777b),BC
  0x013319: af                       XOR A
  0x01331a: 32 7e 77 d1              LD (0xd1777e),A
  0x01331e: 2a dd 76 d1              LD HL,(0xd176dd)
  0x013322: cd c2 21 00              CALL 0x0021c2
  0x013326: 28 10                    JR Z,0x013338
  0x013328: 01 ff 03 00              LD BC,0x0003ff
  0x01332c: ed 43 83 77 d1           LD (0xd17783),BC
  0x013331: af                       XOR A
  0x013332: 32 86 77 d1              LD (0xd17786),A
  0x013336: 18 0e                    JR 0x013346
  0x013338: 01 00 00 00              LD BC,0x000000
  0x01333c: ed 43 83 77 d1           LD (0xd17783),BC
  0x013341: af                       XOR A
  0x013342: 32 86 77 d1              LD (0xd17786),A
  0x013346: 01 00 00 00              LD BC,0x000000
  0x01334a: ed 43 87 77 d1           LD (0xd17787),BC
  0x01334f: af                       XOR A
  0x013350: 32 8a 77 d1              LD (0xd1778a),A
  0x013354: ed 43 8b 77 d1           LD (0xd1778b),BC
  0x013359: af                       XOR A
  0x01335a: 32 8e 77 d1              LD (0xd1778e),A
  0x01335e: ed 43 7f 77 d1           LD (0xd1777f),BC
  0x013363: af                       XOR A
  0x013364: 32 82 77 d1              LD (0xd17782),A
  0x013368: 3e 04                    LD A,04
  0x01336a: 32 95 77 d1              LD (0xd17795),A
  0x01336e: cd 7c 56 01              CALL 0x01567c
  0x013372: dd f9                    LD SP,IX
  0x013374: dd e1                    POP IX
  0x013376: c9                       RET

  CALL targets: 0x2197, 0x152d8, 0x21c2, 0x10f8c, 0x15349, 0x1567c
  JP targets:   0x13292, 0x13297, 0x132af, 0x13338, 0x13346
  RAM reads:    0xd1776d, 0xd1776a, 0xd1778f, 0xd176dd
  RAM writes:   0xd1778f, 0xd1776a, 0xd1777b, 0xd1777e, 0xd17783, 0xd17786, 0xd17787, 0x0d1778a, 0x00d1778b, 0x000d1778e, 0x0000d1777f, 0x00000d17782, 0x000000d17795
  I/O ports:    none
  CP constants: none

======================================================================
[Worker B (USB receive B)] 0x013377-0x0135ce (600 bytes, handler 1)
======================================================================

Disassembly (212 instructions):
  0x013377: 21 f9 ff ff              LD HL,0xfffff9
  0x01337b: cd 97 21 00              CALL 0x002197
  0x01337f: 01 00 00 00              LD BC,0x000000
  0x013383: dd 0f fd                 LD (IX+fd),BC
  0x013386: ed 4b 6d 77 d1           LD BC,(0xd1776d)
  0x01338b: dd 0f fd                 LD (IX+fd),BC
  0x01338e: 2a 6a 77 d1              LD HL,(0xd1776a)
  0x013392: cd c2 21 00              CALL 0x0021c2
  0x013396: 28 0b                    JR Z,0x0133a3
  0x013398: ed 4b 6a 77 d1           LD BC,(0xd1776a)
  0x01339d: c5                       PUSH BC
  0x01339e: cd f5 0f 01              CALL 0x010ff5
  0x0133a2: c1                       POP BC
  0x0133a3: 01 00 00 00              LD BC,0x000000
  0x0133a7: ed 43 6a 77 d1           LD (0xd1776a),BC
  0x0133ac: ed 65 f9                 PEA IX+f9
  0x0133af: 01 04 00 00              LD BC,0x000004
  0x0133b3: c5                       PUSH BC
  0x0133b4: dd 31 fd                 LD SP,(IX+fd)
  0x0133b7: ed 66 05                 PEA IY+05
  0x0133ba: cd d8 52 01              CALL 0x0152d8
  0x0133be: c1                       POP BC
  0x0133bf: c1                       POP BC
  0x0133c0: c1                       POP BC
  0x0133c1: dd 07 f9                 LD BC,(IX+f9)
  0x0133c4: ed 43 8f 77 d1           LD (0xd1778f),BC
  0x0133c9: 01 01 00 00              LD BC,0x000001
  0x0133cd: c5                       PUSH BC
  0x0133ce: cd 8c 0f 01              CALL 0x010f8c
  0x0133d2: c1                       POP BC
  0x0133d3: 22 6a 77 d1              LD (0xd1776a),HL
  0x0133d7: cd 17 10 01              CALL 0x011017
  0x0133db: 2a d1 76 d1              LD HL,(0xd176d1)
  0x0133df: cd c2 21 00              CALL 0x0021c2
  0x0133e3: 28 1b                    JR Z,0x013400
  0x0133e5: 3e 02                    LD A,02
  0x0133e7: 32 95 77 d1              LD (0xd17795),A
  0x0133eb: 3a 73 40 d1              LD A,(0xd14073)
  0x0133ef: b7                       OR A
  0x0133f0: 28 06                    JR Z,0x0133f8
  0x0133f2: cd 6a 10 01              CALL 0x01106a
  0x0133f6: 18 12                    JR 0x01340a
  0x0133f8: 3e 01                    LD A,01
  0x0133fa: 32 79 40 d1              LD (0xd14079),A
  0x0133fe: 18 0a                    JR 0x01340a
  0x013400: 01 00 00 00              LD BC,0x000000
  0x013404: c5                       PUSH BC
  0x013405: cd c2 50 01              CALL 0x0150c2
  0x013409: c1                       POP BC
  0x01340a: dd f9                    LD SP,IX
  0x01340c: dd e1                    POP IX
  0x01340e: c9                       RET
  0x01340f: 21 ea ff ff              LD HL,0xffffea
  0x013413: cd 97 21 00              CALL 0x002197
  0x013417: 01 00 00 00              LD BC,0x000000
  0x01341b: dd 0f f8                 LD (IX+f8),BC
  0x01341e: dd 0f ea                 LD (IX+ea),BC
  0x013421: dd 0f ed                 LD (IX+ed),BC
  0x013424: dd 0f f4                 LD (IX+f4),BC
  0x013427: af                       XOR A
  0x013428: dd 77 f7                 LD (IX+f7),A
  0x01342b: dd 0f f0                 LD (IX+f0),BC
  0x01342e: af                       XOR A
  0x01342f: dd 77 f3                 LD (IX+f3),A
  0x013432: dd 36 fb 00              LD (IX+fb),00
  0x013436: dd 36 fc 00              LD (IX+fc),00
  0x01343a: ed 4b 6d 77 d1           LD BC,(0xd1776d)
  0x01343f: dd 0f f8                 LD (IX+f8),BC
  0x013442: ed 65 f4                 PEA IX+f4
  0x013445: 01 04 00 00              LD BC,0x000004
  0x013449: c5                       PUSH BC
  0x01344a: dd 31 f8                 LD SP,(IX+f8)
  0x01344d: ed 66 00                 PEA IY+00
  0x013450: cd d8 52 01              CALL 0x0152d8
  0x013454: c1                       POP BC
  0x013455: c1                       POP BC
  0x013456: c1                       POP BC
  0x013457: dd 31 f8                 LD SP,(IX+f8)
  0x01345a: ed 03                    ED 03
  0x01345c: 05                       DEC B
  0x01345d: ed 43 a8 76 d1           LD (0xd176a8),BC
  0x013462: dd 07 f4                 LD BC,(IX+f4)
  0x013465: ed 43 5b 77 d1           LD (0xd1775b),BC
  0x01346a: ed 4b a8 76 d1           LD BC,(0xd176a8)
  0x01346f: ed 43 5e 77 d1           LD (0xd1775e),BC
  0x013474: 2a da 76 d1              LD HL,(0xd176da)
  0x013478: cd c2 21 00              CALL 0x0021c2
  0x01347c: c2 11 35 01              JP NZ,0x013511
  0x013480: ed 65 f0                 PEA IX+f0
  0x013483: 01 04 00 00              LD BC,0x000004
  0x013487: c5                       PUSH BC
  0x013488: fd 2a a8 76 d1           LD IY,(0xd176a8)
  0x01348d: ed 66 00                 PEA IY+00
  0x013490: cd d8 52 01              CALL 0x0152d8
  0x013494: c1                       POP BC
  0x013495: c1                       POP BC
  0x013496: c1                       POP BC
  0x013497: dd 31 f0                 LD SP,(IX+f0)
  0x01349a: ed 03                    ED 03
  0x01349c: 06 ed                    LD B,ed
  0x01349e: 43                       LD B,E
  0x01349f: dd 76                    DD 76 (unknown IX)
  0x0134a1: d1                       POP DE
  0x0134a2: 3a f8 76 d1              LD A,(0xd176f8)
  0x0134a6: fe 0c                    CP 0c
  0x0134a8: 28 08                    JR Z,0x0134b2
  0x0134aa: 3a f8 76 d1              LD A,(0xd176f8)
  0x0134ae: fe 0a                    CP 0a
  0x0134b0: 20 5f                    JR NZ,0x013511
  0x0134b2: ed 65 fb                 PEA IX+fb
  0x0134b5: 01 02 00 00              LD BC,0x000002
  0x0134b9: c5                       PUSH BC
  0x0134ba: fd 2a a8 76 d1           LD IY,(0xd176a8)
  0x0134bf: ed 66 04                 PEA IY+04
  0x0134c2: cd d8 52 01              CALL 0x0152d8
  0x0134c6: c1                       POP BC
  0x0134c7: c1                       POP BC
  0x0134c8: c1                       POP BC
  0x0134c9: dd 07 fb                 LD BC,(IX+fb)
  0x0134cc: cd 6b 27 00              CALL 0x00276b
  0x0134d0: b7                       OR A
  0x0134d1: 01 0d 00 00              LD BC,0x00000d
  0x0134d5: ed 42                    SBC HL,BC
  0x0134d7: 20 38                    JR NZ,0x013511
  0x0134d9: fd 2a 5b 77 d1           LD IY,(0xd1775b)
  0x0134de: ed 03                    ED 03
  0x0134e0: fa ed 43 5b              JP M,0x5b43ed
  0x0134e4: 77                       LD (HL),A
  0x0134e5: d1                       POP DE
  0x0134e6: fd 2a 5e 77 d1           LD IY,(0xd1775e)
  0x0134eb: ed 03                    ED 03
  0x0134ed: 06 ed                    LD B,ed
  0x0134ef: 43                       LD B,E
  0x0134f0: 5e                       LD E,(HL)
  0x0134f1: 77                       LD (HL),A
  0x0134f2: d1                       POP DE
  0x0134f3: ed 4b a8 76 d1           LD BC,(0xd176a8)
  0x0134f8: c5                       PUSH BC
  0x0134f9: cd 2f 70 00              CALL 0x00702f
  0x0134fd: c1                       POP BC
  0x0134fe: 2a 51 77 d1              LD HL,(0xd17751)
  0x013502: cd c2 21 00              CALL 0x0021c2
  0x013506: 20 09                    JR NZ,0x013511
  0x013508: 01 00 00 00              LD BC,0x000000
  0x01350c: ed 43 13 77 d1           LD (0xd17713),BC
  0x013511: 3a f8 76 d1              LD A,(0xd176f8)
  0x013515: fe 0c                    CP 0c
  0x013517: 28 10                    JR Z,0x013529
  0x013519: 3a f8 76 d1              LD A,(0xd176f8)
  0x01351d: fe 0d                    CP 0d
  0x01351f: 28 08                    JR Z,0x013529
  0x013521: 3a f8 76 d1              LD A,(0xd176f8)
  0x013525: fe 0a                    CP 0a
  0x013527: 20 7f                    JR NZ,0x0135a8
  0x013529: 2a 51 77 d1              LD HL,(0xd17751)
  0x01352d: cd c2 21 00              CALL 0x0021c2
  0x013531: 28 3a                    JR Z,0x01356d
  0x013533: ed 4b 4b 77 d1           LD BC,(0xd1774b)
  0x013538: dd 0f fd                 LD (IX+fd),BC
  0x01353b: dd 27 fd                 LD HL,(IX+fd)
  0x01353e: cd c2 21 00              CALL 0x0021c2
  0x013542: 28 53                    JR Z,0x013597
  0x013544: dd 31 fd                 LD SP,(IX+fd)
  0x013547: ed 4b 5b 77 d1           LD BC,(0xd1775b)
  0x01354c: c5                       PUSH BC
  0x01354d: ed 4b 5e 77 d1           LD BC,(0xd1775e)
  0x013552: c5                       PUSH BC
  0x013553: cd 88 22 00              CALL 0x002288
  0x013557: c1                       POP BC
  0x013558: c1                       POP BC
  0x013559: 22 22 77 d1              LD (0xd17722),HL
  0x01355d: ed 4b 5b 77 d1           LD BC,(0xd1775b)
  0x013562: 2a 13 77 d1              LD HL,(0xd17713)
  0x013566: 09                       ADD HL,BC
  0x013567: 22 13 77 d1              LD (0xd17713),HL
  0x01356b: 18 2a                    JR 0x013597
  0x01356d: ed 4b 4b 77 d1           LD BC,(0xd1774b)
  0x013572: dd 0f fd                 LD (IX+fd),BC
  0x013575: dd 27 fd                 LD HL,(IX+fd)
  0x013578: cd c2 21 00              CALL 0x0021c2
  0x01357c: 28 19                    JR Z,0x013597
  0x01357e: dd 31 fd                 LD SP,(IX+fd)
  0x013581: ed 4b 5b 77 d1           LD BC,(0xd1775b)
  0x013586: c5                       PUSH BC
  0x013587: ed 4b 5e 77 d1           LD BC,(0xd1775e)
  0x01358c: c5                       PUSH BC
  0x01358d: cd 88 22 00              CALL 0x002288
  0x013591: c1                       POP BC
  0x013592: c1                       POP BC
  0x013593: 22 22 77 d1              LD (0xd17722),HL
  0x013597: ed 4b a8 76 d1           LD BC,(0xd176a8)
  0x01359c: c5                       PUSH BC
  0x01359d: cd 4e 70 00              CALL 0x00704e
  0x0135a1: c1                       POP BC
  0x0135a2: 3e 0d                    LD A,0d
  0x0135a4: 32 f8 76 d1              LD (0xd176f8),A
  0x0135a8: ed 4b da 76 d1           LD BC,(0xd176da)
  0x0135ad: c5                       PUSH BC
  0x0135ae: e1                       POP HL
  0x0135af: dd 07 f4                 LD BC,(IX+f4)
  0x0135b2: 09                       ADD HL,BC
  0x0135b3: 22 da 76 d1              LD (0xd176da),HL
  0x0135b7: 3a 73 40 d1              LD A,(0xd14073)
  0x0135bb: b7                       OR A
  0x0135bc: 28 06                    JR Z,0x0135c4
  0x0135be: cd 6a 10 01              CALL 0x01106a
  0x0135c2: 18 06                    JR 0x0135ca
  0x0135c4: 3e 01                    LD A,01
  0x0135c6: 32 79 40 d1              LD (0xd14079),A
  0x0135ca: dd f9                    LD SP,IX
  0x0135cc: dd e1                    POP IX
  0x0135ce: c9                       RET

  CALL targets: 0x2197, 0x21c2, 0x10ff5, 0x152d8, 0x10f8c, 0x11017, 0x01106a, 0x00150c2, 0x0000276b, 0x00000702f, 0x0000002288, 0x0000000704e
  JP targets:   0x133a3, 0x13400, 0x133f8, 0x1340a, 0x13511, 0x134b2, 0x5b43ed, 0x0013529, 0x000135a8, 0x00001356d, 0x0000013597, 0x000000135c4, 0x0000000135ca
  RAM reads:    0xd1776d, 0xd1776a, 0xd176d1, 0xd14073, 0xd176a8, 0xd176da, 0xd176f8, 0x0d1775b, 0x00d1775e, 0x000d17751, 0x0000d1774b, 0x00000d17713
  RAM writes:   0xd1776a, 0xd1778f, 0xd17795, 0xd14079, 0xd176a8, 0xd1775b, 0xd1775e, 0x0d17713, 0x00d17722, 0x000d176f8, 0x0000d176da
  I/O ports:    none
  CP constants: 0c, 0a, 0d

======================================================================
[Extended Link Worker] 0x0135cf-0x0136be (240 bytes, handler 4)
======================================================================

Disassembly (97 instructions):
  0x0135cf: 21 fb ff ff              LD HL,0xfffffb
  0x0135d3: cd 97 21 00              CALL 0x002197
  0x0135d7: 01 00 00 00              LD BC,0x000000
  0x0135db: dd 0f fb                 LD (IX+fb),BC
  0x0135de: ed 4b 6d 77 d1           LD BC,(0xd1776d)
  0x0135e3: dd 0f fb                 LD (IX+fb),BC
  0x0135e6: ed 65 fe                 PEA IX+fe
  0x0135e9: 01 02 00 00              LD BC,0x000002
  0x0135ed: c5                       PUSH BC
  0x0135ee: dd 31 fb                 LD SP,(IX+fb)
  0x0135f1: ed 66 05                 PEA IY+05
  0x0135f4: cd d8 52 01              CALL 0x0152d8
  0x0135f8: c1                       POP BC
  0x0135f9: c1                       POP BC
  0x0135fa: c1                       POP BC
  0x0135fb: 49                       LD C,C
  0x0135fc: 01 cc cc dd              LD BC,0xddcccc
  0x013600: 27                       DAA
  0x013601: fe b7                    CP b7
  0x013603: 40                       LD B,B
  0x013604: ed 42                    SBC HL,BC
  0x013606: 28 27                    JR Z,0x01362f
  0x013608: 49                       LD C,C
  0x013609: 01 cd cc dd              LD BC,0xddcccd
  0x01360d: 27                       DAA
  0x01360e: fe b7                    CP b7
  0x013610: 40                       LD B,B
  0x013611: ed 42                    SBC HL,BC
  0x013613: 28 1a                    JR Z,0x01362f
  0x013615: 49                       LD C,C
  0x013616: 01 cc 0c dd              LD BC,0xdd0ccc
  0x01361a: 27                       DAA
  0x01361b: fe b7                    CP b7
  0x01361d: 40                       LD B,B
  0x01361e: ed 42                    SBC HL,BC
  0x013620: 28 0d                    JR Z,0x01362f
  0x013622: 49                       LD C,C
  0x013623: 01 cd 0c dd              LD BC,0xdd0ccd
  0x013627: 27                       DAA
  0x013628: fe b7                    CP b7
  0x01362a: 40                       LD B,B
  0x01362b: ed 42                    SBC HL,BC
  0x01362d: 20 2e                    JR NZ,0x01365d
  0x01362f: 01 00 00 00              LD BC,0x000000
  0x013633: ed 43 d4 76 d1           LD (0xd176d4),BC
  0x013638: ed 43 d1 76 d1           LD (0xd176d1),BC
  0x01363d: 49                       LD C,C
  0x01363e: 01 00 c0 dd              LD BC,0xddc000
  0x013642: 27                       DAA
  0x013643: fe cd                    CP cd
  0x013645: d2 26 00 dd              JP NC,0xdd0026
  0x013649: 75                       LD (HL),L
  0x01364a: fe dd                    CP dd
  0x01364c: 74                       LD (HL),H
  0x01364d: ff                       RST 38h
  0x01364e: dd 07 fe                 LD BC,(IX+fe)
  0x013651: cd 6b 27 00              CALL 0x00276b
  0x013655: e5                       PUSH HL
  0x013656: cd c2 50 01              CALL 0x0150c2
  0x01365a: c1                       POP BC
  0x01365b: 18 5d                    JR 0x0136ba
  0x01365d: 3a 95 77 d1              LD A,(0xd17795)
  0x013661: fe 03                    CP 03
  0x013663: 28 12                    JR Z,0x013677
  0x013665: 3a 95 77 d1              LD A,(0xd17795)
  0x013669: fe 04                    CP 04
  0x01366b: 28 0a                    JR Z,0x013677
  0x01366d: 2a f2 76 d1              LD HL,(0xd176f2)
  0x013671: cd c2 21 00              CALL 0x0021c2
  0x013675: 28 2c                    JR Z,0x0136a3
  0x013677: 2a dd 76 d1              LD HL,(0xd176dd)
  0x01367b: cd c2 21 00              CALL 0x0021c2
  0x01367f: 20 0d                    JR NZ,0x01368e
  0x013681: ed 4b f2 76 d1           LD BC,(0xd176f2)
  0x013686: c5                       PUSH BC
  0x013687: cd c2 50 01              CALL 0x0150c2
  0x01368b: c1                       POP BC
  0x01368c: 18 2c                    JR 0x0136ba
  0x01368e: 3a 73 40 d1              LD A,(0xd14073)
  0x013692: b7                       OR A
  0x013693: 28 06                    JR Z,0x01369b
  0x013695: cd 76 15 01              CALL 0x011576
  0x013699: 18 1f                    JR 0x0136ba
  0x01369b: 3e 01                    LD A,01
  0x01369d: 32 78 40 d1              LD (0xd14078),A
  0x0136a1: 18 17                    JR 0x0136ba
  0x0136a3: cd d4 51 01              CALL 0x0151d4
  0x0136a7: 3a 73 40 d1              LD A,(0xd14073)
  0x0136ab: b7                       OR A
  0x0136ac: 28 06                    JR Z,0x0136b4
  0x0136ae: cd 6a 10 01              CALL 0x01106a
  0x0136b2: 18 06                    JR 0x0136ba
  0x0136b4: 3e 01                    LD A,01
  0x0136b6: 32 79 40 d1              LD (0xd14079),A
  0x0136ba: dd f9                    LD SP,IX
  0x0136bc: dd e1                    POP IX
  0x0136be: c9                       RET

  CALL targets: 0x2197, 0x152d8, 0x276b, 0x150c2, 0x21c2, 0x11576, 0x0151d4, 0x001106a
  JP targets:   0x1362f, 0x1365d, 0xdd0026, 0x136ba, 0x13677, 0x136a3, 0x01368e, 0x001369b, 0x000136b4
  RAM reads:    0xd1776d, 0xd17795, 0xd176f2, 0xd176dd, 0xd14073
  RAM writes:   0xd176d4, 0xd176d1, 0xd14078, 0xd14079
  I/O ports:    none
  CP constants: b7, cd, dd, 03, 04

======================================================================
[Extended Link Worker Signature Analysis]
======================================================================

Looking for 16-bit signature constants: 0xCCCC, 0xCCCD, 0x0CCC, 0x0CCD
  Found 0xcccc at ROM offset 0x0135fd (bytes: cc cc)
  Found 0xcccd at ROM offset 0x01360a (bytes: cd cc)
  Found 0x0ccc at ROM offset 0x013617 (bytes: cc 0c)
  Found 0x0ccd at ROM offset 0x013624 (bytes: cd 0c)

Searching for LD reg,signature patterns in 0x013500-0x0136C0:
  0x013515: CP 0c -- possible signature byte
  0x0135fc: LD BC,0xddcccc -- signature 0xcccc
  0x013609: LD BC,0xddcccd -- signature 0xcccd
  0x013616: LD BC,0xdd0ccc -- signature 0x0ccc
  0x013623: LD BC,0xdd0ccd -- signature 0x0ccd
  0x013643: CP cd -- possible signature byte
  0x013650: CP cd -- possible signature byte

Branch structure (conditional jumps in extended worker):
  0x013606: 28 27                    JR Z,0x01362f
  0x013613: 28 1a                    JR Z,0x01362f
  0x013620: 28 0d                    JR Z,0x01362f
  0x01362d: 20 2e                    JR NZ,0x01365d
  0x013645: d2 26 00 dd              JP NC,0xdd0026
  0x01365b: 18 5d                    JR 0x0136ba
  0x013663: 28 12                    JR Z,0x013677
  0x01366b: 28 0a                    JR Z,0x013677
  0x013675: 28 2c                    JR Z,0x0136a3
  0x01367f: 20 0d                    JR NZ,0x01368e
  0x01368c: 18 2c                    JR 0x0136ba
  0x013693: 28 06                    JR Z,0x01369b
  0x013699: 18 1f                    JR 0x0136ba
  0x0136a1: 18 17                    JR 0x0136ba
  0x0136ac: 28 06                    JR Z,0x0136b4
  0x0136b2: 18 06                    JR 0x0136ba
  0x0136be: c9                       RET

======================================================================
[Caller Search]
======================================================================

Callers of 0x013250:
  0x000478: JP 0x013250 [raw: c3 50 32 01]
  0x0120f8: CALL 0x013250 [raw: cd 50 32 01]

Callers of 0x013377:
  0x00047c: JP 0x013377 [raw: c3 77 33 01]
  0x012100: CALL 0x013377 [raw: cd 77 33 01]

Callers of 0x0135cf:
  0x000484: JP 0x0135cf [raw: c3 cf 35 01]
  0x012124: CALL 0x0135cf [raw: cd cf 35 01]

======================================================================
[Subcall Deep Dives]
======================================================================

External CALL targets: 0x2197, 0x21c2, 0x2288, 0x276b, 0x702f, 0x0704e, 0x010f8c, 0x0010ff5, 0x00011017, 0x00001106a, 0x0000011576, 0x000000150c2, 0x0000000151d4, 0x00000000152d8, 0x00000000015349, 0x00000000001567c

-- Subroutine 0x002197 --
  0x002197: dd e3                    EX (SP),IX
  0x002199: ed 12                    ED 12
  0x00219b: 00                       NOP
  0x00219c: dd 21 00 00 00           LD IX,0x000000
  0x0021a1: dd 39                    ADD IX,SP
  0x0021a3: 39                       ADD HL,SP
  0x0021a4: f9                       LD SP,HL
  0x0021a5: eb                       EX DE,HL
  0x0021a6: e9                       JP (HL)

-- Subroutine 0x0021c2 --
  0x0021c2: e5                       PUSH HL
  0x0021c3: d5                       PUSH DE
  0x0021c4: 11 00 00 00              LD DE,0x000000
  0x0021c8: b7                       OR A
  0x0021c9: ed 52                    SBC HL,DE
  0x0021cb: d1                       POP DE
  0x0021cc: e1                       POP HL
  0x0021cd: c9                       RET

-- Subroutine 0x002288 --
  0x002288: fd e9                    JP (IY)
  0x00228a: d5                       PUSH DE
  0x00228b: eb                       EX DE,HL
  0x00228c: b7                       OR A
  0x00228d: ed 62                    SBC HL,HL
  0x00228f: ed 52                    SBC HL,DE
  0x002291: d1                       POP DE
  0x002292: c9                       RET

-- Subroutine 0x00276b --
  0x00276b: b7                       OR A
  0x00276c: ed 62                    SBC HL,HL
  0x00276e: 69                       LD L,C
  0x00276f: 60                       LD H,B
  0x002770: c9                       RET

-- Subroutine 0x00702f --
  0x00702f: dd e5                    PUSH IX
  0x007031: dd 21 00 00 00           LD IX,0x000000
  0x007036: dd 39                    ADD IX,SP
  0x007038: e5                       PUSH HL
  0x007039: d5                       PUSH DE
  0x00703a: c5                       PUSH BC
  0x00703b: dd 27 06                 LD HL,(IX+06)
  0x00703e: 11 31 77 d1              LD DE,0xd17731
  0x007042: 01 10 00 00              LD BC,0x000010
  0x007046: ed b0                    LDIR
  0x007048: c1                       POP BC
  0x007049: d1                       POP DE
  0x00704a: e1                       POP HL
  0x00704b: dd e1                    POP IX
  0x00704d: c9                       RET

-- Subroutine 0x00704e --
  0x00704e: dd e5                    PUSH IX
  0x007050: dd 21 00 00 00           LD IX,0x000000
  0x007055: dd 39                    ADD IX,SP
  0x007057: e5                       PUSH HL
  0x007058: d5                       PUSH DE
  0x007059: c5                       PUSH BC
  0x00705a: 21 31 77 d1              LD HL,0xd17731
  0x00705e: dd 17 06                 LD DE,(IX+06)
  0x007061: 01 10 00 00              LD BC,0x000010
  0x007065: ed b0                    LDIR
  0x007067: c1                       POP BC
  0x007068: d1                       POP DE
  0x007069: e1                       POP HL
  0x00706a: dd e1                    POP IX
  0x00706c: c9                       RET

-- Subroutine 0x010f8c --
  0x010f8c: cd 8a 21 00              CALL 0x00218a
  0x010f90: 40                       LD B,B
  0x010f91: 01 82 30 ed              LD BC,0xed3082
  0x010f95: 78                       LD A,B
  0x010f96: e6 10                    AND 10
  0x010f98: 20 0c                    JR NZ,0x010fa6
  0x010f9a: 01 02 00 00              LD BC,0x000002
  0x010f9e: c5                       PUSH BC
  0x010f9f: cd 6d e0 00              CALL 0x00e06d
  0x010fa3: c1                       POP BC
  0x010fa4: 18 4a                    JR 0x010ff0
  0x010fa6: dd 7e 06                 LD A,(IX+06)
  0x010fa9: b7                       OR A
  0x010faa: ed 62                    SBC HL,HL
  0x010fac: 6f                       LD L,A
  0x010fad: cd 23 26 00              CALL 0x002623
  0x010fb1: 06 00                    LD B,00
  0x010fb3: 00                       NOP
  0x010fb4: 00                       NOP
  0x010fb5: 00                       NOP
  0x010fb6: cb 0f                    RRC A
  0x010fb8: 01 d1 0f 01              LD BC,0x010fd1
  0x010fbc: d7                       RST 10h
  0x010fbd: 0f                       RRCA
  0x010fbe: 01 d7 0f 01              LD BC,0x010fd7
  0x010fc2: d7                       RST 10h
  0x010fc3: 0f                       RRCA
  0x010fc4: 01 d7 0f 01              LD BC,0x010fd7
  0x010fc8: ed 0f                    ED 0f
  0x010fca: 01 21 a8 62              LD BC,0x62a821
  Calls: 0x218a, 0xe06d, 0x2623

-- Subroutine 0x010ff5 --
  0x010ff5: cd 8a 21 00              CALL 0x00218a
  0x010ff9: 40                       LD B,B
  0x010ffa: 01 82 30 ed              LD BC,0xed3082
  0x010ffe: 78                       LD A,B
  0x010fff: e6 10                    AND 10
  0x011001: 20 0f                    JR NZ,0x011012
  0x011003: dd 07 06                 LD BC,(IX+06)
  0x011006: c5                       PUSH BC
  0x011007: 01 02 00 00              LD BC,0x000002
  0x01100b: c5                       PUSH BC
  0x01100c: cd cc e1 00              CALL 0x00e1cc
  0x011010: c1                       POP BC
  0x011011: c1                       POP BC
  0x011012: dd f9                    LD SP,IX
  0x011014: dd e1                    POP IX
  0x011016: c9                       RET
  Calls: 0x218a, 0xe1cc

-- Subroutine 0x011017 --
  0x011017: 21 fa ff ff              LD HL,0xfffffa
  0x01101b: cd 97 21 00              CALL 0x002197
  0x01101f: 01 b8 0b 00              LD BC,0x000bb8
  0x011023: dd 0f fd                 LD (IX+fd),BC
  0x011026: 01 ff 03 00              LD BC,0x0003ff
  0x01102a: dd 0f fa                 LD (IX+fa),BC
  0x01102d: 2a 8f 77 d1              LD HL,(0xd1778f)
  0x011031: cd c2 21 00              CALL 0x0021c2
  0x011035: 28 08                    JR Z,0x01103f
  0x011037: ed 4b 8f 77 d1           LD BC,(0xd1778f)
  0x01103c: dd 0f fa                 LD (IX+fa),BC
  0x01103f: dd 27 fa                 LD HL,(IX+fa)
  0x011042: 29                       ADD HL,HL
  0x011043: 29                       ADD HL,HL
  0x011044: 29                       ADD HL,HL
  0x011045: 01 e8 03 00              LD BC,0x0003e8
  0x011049: cd 4c 22 00              CALL 0x00224c
  0x01104d: 01 36 6e 01              LD BC,0x016e36
  0x011051: cd 07 22 00              CALL 0x002207
  0x011055: 01 b8 0b 00              LD BC,0x000bb8
  0x011059: 09                       ADD HL,BC
  0x01105a: dd 2f                    DD 2f (unknown IX)
  0x01105c: fd dd                    FD dd (unknown IY)
  0x01105e: 07                       RLCA
  0x01105f: fd ed                    FD ed (unknown IY)
  0x011061: 43                       LD B,E
  0x011062: 92                       SUB D
  0x011063: 77                       LD (HL),A
  0x011064: d1                       POP DE
  0x011065: dd f9                    LD SP,IX
  Calls: 0x2197, 0x21c2, 0x224c, 0x2207
  RAM reads: 0xd1778f

-- Subroutine 0x01106a --
  0x01106a: 21 ec ff ff              LD HL,0xffffec
  0x01106e: cd 97 21 00              CALL 0x002197
  0x011072: 01 00 00 00              LD BC,0x000000
  0x011076: dd 0f fa                 LD (IX+fa),BC
  0x011079: dd 0f f2                 LD (IX+f2),BC
  0x01107c: dd 0f f5                 LD (IX+f5),BC
  0x01107f: dd 0f fd                 LD (IX+fd),BC
  0x011082: dd 36 f8 00              LD (IX+f8),00
  0x011086: dd 36 f9 f0              LD (IX+f9),f0
  0x01108a: 2a 6a 77 d1              LD HL,(0xd1776a)
  0x01108e: cd c2 21 00              CALL 0x0021c2
  0x011092: 28 0a                    JR Z,0x01109e
  0x011094: 2a 8f 77 d1              LD HL,(0xd1778f)
  0x011098: cd c2 21 00              CALL 0x0021c2
  0x01109c: 20 0e                    JR NZ,0x0110ac
  0x01109e: 01 01 00 00              LD BC,0x000001
  0x0110a2: c5                       PUSH BC
  0x0110a3: cd 8c 0f 01              CALL 0x010f8c
  0x0110a7: c1                       POP BC
  0x0110a8: 22 6a 77 d1              LD (0xd1776a),HL
  0x0110ac: ed 4b 6a 77 d1           LD BC,(0xd1776a)
  0x0110b1: dd 0f fd                 LD (IX+fd),BC
  0x0110b4: 2a 8f 77 d1              LD HL,(0xd1778f)
  0x0110b8: cd c2 21 00              CALL 0x0021c2
  0x0110bc: 20 53                    JR NZ,0x011111
  0x0110be: dd 31 fd                 LD SP,(IX+fd)
  0x0110c1: ed 66 00                 PEA IY+00
  0x0110c4: 01 04 00 00              LD BC,0x000004
  0x0110c8: c5                       PUSH BC
  0x0110c9: 01 00 00 00              LD BC,0x000000
  Calls: 0x2197, 0x21c2, 0x21c2, 0x10f8c, 0x21c2
  RAM reads: 0xd1776a, 0xd1778f
  RAM writes: 0xd1776a

-- Subroutine 0x011576 --
  0x011576: 21 f5 ff ff              LD HL,0xfffff5
  0x01157a: cd 97 21 00              CALL 0x002197
  0x01157e: dd 36 fe 00              LD (IX+fe),00
  0x011582: dd 36 ff f0              LD (IX+ff),f0
  0x011586: 01 00 00 00              LD BC,0x000000
  0x01158a: dd 0f f8                 LD (IX+f8),BC
  0x01158d: 2a 6d 77 d1              LD HL,(0xd1776d)
  0x011591: cd c2 21 00              CALL 0x0021c2
  0x011595: 20 0a                    JR NZ,0x0115a1
  0x011597: c5                       PUSH BC
  0x011598: cd 8c 0f 01              CALL 0x010f8c
  0x01159c: c1                       POP BC
  0x01159d: 22 6d 77 d1              LD (0xd1776d),HL
  0x0115a1: ed 4b 6d 77 d1           LD BC,(0xd1776d)
  0x0115a6: dd 0f f8                 LD (IX+f8),BC
  0x0115a9: dd 27 f8                 LD HL,(IX+f8)
  0x0115ac: cd c2 21 00              CALL 0x0021c2
  0x0115b0: ca 74 16 01              JP Z,0x011674
  0x0115b4: 2a 92 77 d1              LD HL,(0xd17792)
  0x0115b8: cd c2 21 00              CALL 0x0021c2
  0x0115bc: 28 0a                    JR Z,0x0115c8
  0x0115be: 2a 8f 77 d1              LD HL,(0xd1778f)
  0x0115c2: cd c2 21 00              CALL 0x0021c2
  0x0115c6: 20 04                    JR NZ,0x0115cc
  0x0115c8: cd 17 10 01              CALL 0x011017
  0x0115cc: 3e 04                    LD A,04
  0x0115ce: 32 95 77 d1              LD (0xd17795),A
  0x0115d2: 01 00 00 00              LD BC,0x000000
  0x0115d6: ed 43 87 77 d1           LD (0xd17787),BC
  0x0115db: af                       XOR A
  Calls: 0x2197, 0x21c2, 0x10f8c, 0x21c2, 0x21c2, 0x021c2, 0x011017
  RAM reads: 0xd1776d, 0xd17792, 0xd1778f
  RAM writes: 0xd1776d, 0xd17795, 0xd17787

-- Subroutine 0x0150c2 --
  0x0150c2: 21 fd ff ff              LD HL,0xfffffd
  0x0150c6: cd 97 21 00              CALL 0x002197
  0x0150ca: ed 4b bd 76 d1           LD BC,(0xd176bd)
  0x0150cf: dd 0f fd                 LD (IX+fd),BC
  0x0150d2: 2a f2 76 d1              LD HL,(0xd176f2)
  0x0150d6: cd c2 21 00              CALL 0x0021c2
  0x0150da: 20 08                    JR NZ,0x0150e4
  0x0150dc: dd 07 06                 LD BC,(IX+06)
  0x0150df: ed 43 f2 76 d1           LD (0xd176f2),BC
  0x0150e4: af                       XOR A
  0x0150e5: 32 fb 76 d1              LD (0xd176fb),A
  0x0150e9: 3a fc 76 d1              LD A,(0xd176fc)
  0x0150ed: b7                       OR A
  0x0150ee: 20 24                    JR NZ,0x015114
  0x0150f0: 01 03 00 00              LD BC,0x000003
  0x0150f4: dd 27 06                 LD HL,(IX+06)
  0x0150f7: b7                       OR A
  0x0150f8: ed 42                    SBC HL,BC
  0x0150fa: 20 18                    JR NZ,0x015114
  0x0150fc: 3a 2d 77 d1              LD A,(0xd1772d)
  0x015100: b7                       OR A
  0x015101: 28 11                    JR Z,0x015114
  0x015103: 01 00 00 00              LD BC,0x000000
  0x015107: c5                       PUSH BC
  0x015108: cd da 6e 00              CALL 0x006eda
  0x01510c: c1                       POP BC
  0x01510d: b7                       OR A
  0x01510e: 28 04                    JR Z,0x015114
  0x015110: cd b5 19 00              CALL 0x0019b5
  0x015114: dd 27 fd                 LD HL,(IX+fd)
  Calls: 0x2197, 0x21c2, 0x6eda, 0x19b5
  RAM reads: 0xd176bd, 0xd176f2, 0xd176fc, 0xd1772d
  RAM writes: 0xd176f2, 0xd176fb

-- Subroutine 0x0151d4 --
  0x0151d4: ed 57                    LD A,I
  0x0151d6: f5                       PUSH AF
  0x0151d7: f3                       DI
  0x0151d8: ed 4b cb 76 d1           LD BC,(0xd176cb)
  0x0151dd: ed 43 c3 76 d1           LD (0xd176c3),BC
  0x0151e2: ed 4b 38 40 d1           LD BC,(0xd14038)
  0x0151e7: ed 43 c6 76 d1           LD (0xd176c6),BC
  0x0151ec: af                       XOR A
  0x0151ed: 32 ca 76 d1              LD (0xd176ca),A
  0x0151f1: 3e 01                    LD A,01
  0x0151f3: 32 c9 76 d1              LD (0xd176c9),A
  0x0151f7: f1                       POP AF
  0x0151f8: e2 fd 51 01              JP PO,0x0151fd
  0x0151fc: fb                       EI
  0x0151fd: c9                       RET
  RAM reads: 0xd176cb, 0xd14038
  RAM writes: 0xd176c3, 0xd176c6, 0xd176ca, 0xd176c9

-- Subroutine 0x0152d8 --
  0x0152d8: 21 fa ff ff              LD HL,0xfffffa
  0x0152dc: cd 97 21 00              CALL 0x002197
  0x0152e0: dd 07 06                 LD BC,(IX+06)
  0x0152e3: ed 43 10 77 d1           LD (0xd17710),BC
  0x0152e8: dd 7e 09                 LD A,(IX+09)
  0x0152eb: 32 19 77 d1              LD (0xd17719),A
  0x0152ef: dd 7e 09                 LD A,(IX+09)
  0x0152f2: b7                       OR A
  0x0152f3: ed 62                    SBC HL,HL
  0x0152f5: 6f                       LD L,A
  0x0152f6: dd 07 0c                 LD BC,(IX+0c)
  0x0152f9: 09                       ADD HL,BC
  0x0152fa: 22 0d 77 d1              LD (0xd1770d),HL
  0x0152fe: 3a 19 77 d1              LD A,(0xd17719)
  0x015302: 47                       LD B,A
  0x015303: 3a 19 77 d1              LD A,(0xd17719)
  0x015307: 3d                       DEC A
  0x015308: 32 19 77 d1              LD (0xd17719),A
  0x01530c: 78                       LD A,B
  0x01530d: b7                       OR A
  0x01530e: 28 34                    JR Z,0x015344
  0x015310: ed 4b 0d 77 d1           LD BC,(0xd1770d)
  0x015315: dd 0f fd                 LD (IX+fd),BC
  0x015318: fd 2a 0d 77 d1           LD IY,(0xd1770d)
  0x01531d: ed 03                    ED 03
  0x01531f: ff                       RST 38h
  0x015320: ed 43 0d 77 d1           LD (0xd1770d),BC
  0x015325: 2a 10 77 d1              LD HL,(0xd17710)
  0x015329: 7e                       LD A,(HL)
  0x01532a: 2a 0d 77 d1              LD HL,(0xd1770d)
  Calls: 0x2197
  RAM reads: 0xd17719, 0xd1770d, 0xd17710
  RAM writes: 0xd17710, 0xd17719, 0xd1770d

-- Subroutine 0x015349 --
  0x015349: 21 fa ff ff              LD HL,0xfffffa
  0x01534d: cd 97 21 00              CALL 0x002197
  0x015351: dd 7e 12                 LD A,(IX+12)
  0x015354: b7                       OR A
  0x015355: ed 62                    SBC HL,HL
  0x015357: 6f                       LD L,A
  0x015358: dd 07 15                 LD BC,(IX+15)
  0x01535b: 09                       ADD HL,BC
  0x01535c: 22 0d 77 d1              LD (0xd1770d),HL
  0x015360: dd 07 06                 LD BC,(IX+06)
  0x015363: ed 43 1e 77 d1           LD (0xd1771e),BC
  0x015368: dd 7e 09                 LD A,(IX+09)
  0x01536b: 32 21 77 d1              LD (0xd17721),A
  0x01536f: dd 7e 12                 LD A,(IX+12)
  0x015372: 32 19 77 d1              LD (0xd17719),A
  0x015376: dd 7e 12                 LD A,(IX+12)
  0x015379: fe 08                    CP 08
  0x01537b: 20 65                    JR NZ,0x0153e2
  0x01537d: 3e 04                    LD A,04
  0x01537f: 32 19 77 d1              LD (0xd17719),A
  0x015383: 3a 19 77 d1              LD A,(0xd17719)
  0x015387: 47                       LD B,A
  0x015388: 3a 19 77 d1              LD A,(0xd17719)
  0x01538c: 3d                       DEC A
  0x01538d: 32 19 77 d1              LD (0xd17719),A
  0x015391: 78                       LD A,B
  0x015392: b7                       OR A
  0x015393: 28 38                    JR Z,0x0153cd
  0x015395: ed 4b 0d 77 d1           LD BC,(0xd1770d)
  0x01539a: dd 0f fd                 LD (IX+fd),BC
  Calls: 0x2197
  RAM reads: 0xd17719, 0xd1770d
  RAM writes: 0xd1770d, 0xd1771e, 0xd17721, 0xd17719

-- Subroutine 0x01567c --
  0x01567c: ed 4b 6a 77 d1           LD BC,(0xd1776a)
  0x015681: ed 43 ed 43 d1           LD (0xd143ed),BC
  0x015686: 01 e8 03 00              LD BC,0x0003e8
  0x01568a: ed 43 f6 43 d1           LD (0xd143f6),BC
  0x01568f: 01 00 00 00              LD BC,0x000000
  0x015693: ed 43 f9 43 d1           LD (0xd143f9),BC
  0x015698: ed 4b 7b 77 d1           LD BC,(0xd1777b)
  0x01569d: ed 43 fc 43 d1           LD (0xd143fc),BC
  0x0156a2: af                       XOR A
  0x0156a3: 32 ff 43 d1              LD (0xd143ff),A
  0x0156a7: 01 00 00 00              LD BC,0x000000
  0x0156ab: ed 43 02 44 d1           LD (0xd14402),BC
  0x0156b0: 01 6e fb 00              LD BC,0x00fb6e
  0x0156b4: ed 43 e7 43 d1           LD (0xd143e7),BC
  0x0156b9: 01 ef 21 01              LD BC,0x0121ef
  0x0156bd: ed 43 ea 43 d1           LD (0xd143ea),BC
  0x0156c2: ed 4b 92 77 d1           LD BC,(0xd17792)
  0x0156c7: c5                       PUSH BC
  0x0156c8: cd fe 51 01              CALL 0x0151fe
  0x0156cc: c1                       POP BC
  0x0156cd: 01 e7 43 d1              LD BC,0xd143e7
  0x0156d1: c5                       PUSH BC
  0x0156d2: cd b0 f5 00              CALL 0x00f5b0
  0x0156d6: c1                       POP BC
  0x0156d7: 32 25 77 d1              LD (0xd17725),A
  0x0156db: 3a 25 77 d1              LD A,(0xd17725)
  0x0156df: b7                       OR A
  0x0156e0: 28 4e                    JR Z,0x015730
  0x0156e2: af                       XOR A
  0x0156e3: 32 79 77 d1              LD (0xd17779),A
  Calls: 0x151fe, 0xf5b0
  RAM reads: 0xd1776a, 0xd1777b, 0xd17792, 0xd17725
  RAM writes: 0xd143ed, 0xd143f6, 0xd143f9, 0xd143fc, 0xd143ff, 0xd14402, 0xd143e7, 0x0d143ea, 0x00d17725, 0x000d17779

======================================================================
[Summary]
======================================================================

All RAM addresses read:
  0xd14073
  0xd176a8
  0xd176d1
  0xd176da
  0xd176dd
  0xd176f2
  0xd176f8
  0xd17713
  0xd1774b
  0xd17751
  0xd1775b
  0xd1775e
  0xd1776a
  0xd1776d
  0xd1778f
  0xd17795

All RAM addresses written:
  0xd14078
  0xd14079
  0xd176a8
  0xd176d1
  0xd176d4
  0xd176da
  0xd176f8
  0xd17713
  0xd17722
  0xd1775b
  0xd1775e
  0xd1776a
  0xd1777b
  0xd1777e
  0xd1777f
  0xd17782
  0xd17783
  0xd17786
  0xd17787
  0xd1778a
  0xd1778b
  0xd1778e
  0xd1778f
  0xd17795

All external CALL targets:
  0x002197
  0x0021c2
  0x002288
  0x00276b
  0x00702f
  0x00704e
  0x010f8c
  0x010ff5
  0x011017
  0x01106a
  0x011576
  0x0150c2
  0x0151d4
  0x0152d8
  0x015349
  0x01567c
```

## Key Findings

(Filled by probe output analysis)

Generated: 2026-05-23T00:09:37.694Z
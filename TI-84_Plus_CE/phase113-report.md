# Phase 113 Report: 0x08C4A3 Deep Investigation

Generated: 2026-04-14T17:41:55.604Z

## Boot Environment

| Stage | Steps | Termination |
|-------|-------|-------------|
| coldBoot | 3062 | halt |
| osInit | 691 | missing_block |
| postInit | 1 | missing_block |

## Static Disassembly

```
=== Static Disassembly: 0x08c4a3 (64 bytes) ===

  0x08c4a3:  3a 8e 05 d0      ld a,(nn) ; 0xd0058e
  0x08c4a7:  b7               or a
  0x08c4a8:  28 3f            jr z,e ; -> 0x08c4e9
  0x08c4aa:  fe 0d            cp n ; 0x0d
  0x08c4ac:  38 08            jr c,e ; -> 0x08c4b6
  0x08c4ae:  fe 8c            cp n ; 0x8c
  0x08c4b0:  30 04            jr nc,e ; -> 0x08c4b6
  0x08c4b2:  c3 43 c5 08      jp nn ; 0x08c543
  0x08c4b6:  fe c7            cp n ; 0xc7
  0x08c4b8:  30 2b            jr nc,e ; -> 0x08c4e5
  0x08c4ba:  fe c0            cp n ; 0xc0
  0x08c4bc:  30 1b            jr nc,e ; -> 0x08c4d9
  0x08c4be:  fe bc            cp n ; 0xbc
  0x08c4c0:  38 23            jr c,e ; -> 0x08c4e5
  0x08c4c2:  fe bd            cp n ; 0xbd
  0x08c4c4:  38 13            jr c,e ; -> 0x08c4d9
  0x08c4c6:  47               db 0x47
  0x08c4c7:  3a e0 07 d0      ld a,(nn) ; 0xd007e0
  0x08c4cb:  fe 5b            cp n ; 0x5b
  0x08c4cd:  28 16            jr z,e ; -> 0x08c4e5
  0x08c4cf:  fe 44            cp n ; 0x44
  0x08c4d1:  20 12            jr nz,e ; -> 0x08c4e5
  0x08c4d3:  3e fb            ld a,n ; 0xfb
  0x08c4d5:  c3 d1 c5 08      jp nn ; 0x08c5d1
  0x08c4d9:  fd cb            FD prefix (IY op 0xcb)
  0x08c4db:  09               db 0x09
  0x08c4dc:  46               db 0x46
  0x08c4dd:  28 f4            jr z,e ; -> 0x08c4d3
  0x08c4df:  fd cb            FD prefix (IY op 0xcb)
  0x08c4e1:  11 46 20 ee      ld de,nn ; 0xee2046
```

## Dynamic Trace (ENTER key = 0x10)

```
=== Dynamic Trace: 0x08c4a3 with ENTER (0x10) ===

Steps: 624
Termination: missing_block
Last PC: 0xffffff
Missing blocks: ffffff:adl

Key event writes (0xD0058E): 2
  block #254: wrote 0x00
  block #256: wrote 0x00
Cursor row writes (0xD00595): 0
Cursor col writes (0xD00596): 0
VRAM writes: 0

Blocks visited: 624
First 30 blocks:
  0x08c4a3 [adl] step=0
  0x08c4aa [adl] step=1
  0x08c4ae [adl] step=2
  0x08c4b2 [adl] step=3
  0x08c543 [adl] step=4
  0x08c549 [adl] step=5
  0x08c558 [adl] step=6
  0x04c973 [adl] step=7
  0x08c561 [adl] step=8
  0x08c583 [adl] step=9
  0x08c33d [adl] step=10
  0x0a349a [adl] step=11
  0x08c341 [adl] step=12
  0x05c75b [adl] step=13
  0x08c345 [adl] step=14
  0x08c34f [adl] step=15
  0x08c366 [adl] step=16
  0x08c378 [adl] step=17
  0x08c384 [adl] step=18
  0x08c3a8 [adl] step=19
  0x0a27dd [adl] step=20
  0x0a27fe [adl] step=21
  0x0a1a36 [adl] step=22
  0x08c3ac [adl] step=23
  0x08c3c3 [adl] step=24
  0x08c3c9 [adl] step=25
  0x08c3d7 [adl] step=26
  0x02392f [adl] step=27
  0x025758 [adl] step=28
  0x02393a [adl] step=29
...
Last 20 blocks:
  0x08c40f [adl] step=604
  0x08c509 [adl] step=605
  0x08c511 [adl] step=606
  0x08c519 [adl] step=607
  0x08c526 [adl] step=608
  0x08c532 [adl] step=609
  0x022331 [adl] step=610
  0x000578 [adl] step=611
  0x0158a6 [adl] step=612
  0x022336 [adl] step=613
  0x022344 [adl] step=614
  0x08c536 [adl] step=615
  0x08c72f [adl] step=616
  0x05622e [adl] step=617
  0x05623d [adl] step=618
  0x056244 [adl] step=619
  0x056248 [adl] step=620
  0x056253 [adl] step=621
  0x08c734 [adl] step=622
  0x08c745 [adl] step=623
```

## Cross-Reference

```
=== Cross-Reference: Missing Block Analysis ===

Missing block: ffffff:adl
  In PRELIFTED_BLOCKS: NO — CANDIDATE TRANSPILER SEED
```

## Summary

=== SUMMARY ===

Entry point: 0x08c4a3
Steps before stop: 624
Termination reason: missing_block
Last PC: 0xffffff
Blocks visited: 624
Key event cleared: YES
Cursor writes: row=0, col=0
VRAM writes: 0
Missing blocks: ffffff:adl
Seeds needed: ffffff:adl

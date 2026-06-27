# Phase 853: D02505 Owner / Lifetime Trace

Probe: `probe-phase853-d02505-lifetime-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase853-d02505-lifetime-trace.mjs`

## Summary

- Result: PASS; CLEAR route termination=`captured-0a31e2-to-0a31a2`, steps=4986.
- Real captures hold `D02505=0x0A` before CLEAR and `0x0A` after CLEAR.
- Lifted route reaches `0x0A31FD` with `D02505=0x00`; the later `0x0A31F2` geometry therefore uses the Phase852 bad input unless patched.
- Candidate writer `0x058D54..0x058D65` was hit 3 times, but `0x058D65` was hit 0 times. Every observed `0x058D60` branch had Z=1, so the route goes to `0x058D89` and skips the `LD (D02505),A` store.
- CPU write watch found 8 writes to `D02505`, including 1 write of `0x0A` and 3 later zeroing writes after a `0x0A` value. Diagnostic conclusion: D02505 does become 0x0A transiently during launch-home, but a later 0x001879 clear zeros it; the CLEAR route then skips the 0x058D65 rewriter because 0x0800A8 leaves Z set at 0x058D60, so D02505 remains zero into 0x0A31FD.

## Lifted Lifetime Snapshots

| Snapshot | D02504 | D02505 | D02506 | D00595 | D00596 | D0243A | D02590 | D000CA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| after p1 coldboot | 0x00 | 0x00 | 0x00 | 0x04 | 0x13 | 0x000000 | 0x000000 | 0x00 |
| after p2 kernel | 0x00 | 0x00 | 0x00 | 0x04 | 0x13 | 0x000000 | 0x000000 | 0x00 |
| after p3 postinit | 0x00 | 0x00 | 0x00 | 0x04 | 0x13 | 0x000000 | 0x000000 | 0x10 |
| after p4 warm-idle | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x00 |
| after p5 launch-home | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x00 |
| after restoring phase5 pre-clear snapshot | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0xD3FE81 | 0x00 |
| after p6 repaint | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8A3 | 0xD3FE81 | 0x20 |
| after manual cx/edit setup before CLEAR | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CC | 0xD3FE81 | 0x20 |
| after CLEAR seed before outer-loop | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CC | 0xD3FE81 | 0x20 |
| after p7 bounded owner stop | 0x00 | 0x00 | 0x00 | 0x00 | 0x19 | 0x000000 | 0x000000 | 0x21 |

## D02504..D02506 Write Watch

| # | Phase | Block PC | Address | Before | After | Recent path tail |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | p1-coldboot / write8 | 0x001879 | 0xD02504 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 2 | p1-coldboot / write8 | 0x001879 | 0xD02505 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 3 | p1-coldboot / write8 | 0x001879 | 0xD02506 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 4 | p2-kernel / write8 | 0x001879 | 0xD02504 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 5 | p2-kernel / write8 | 0x001879 | 0xD02505 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 6 | p2-kernel / write8 | 0x001879 | 0xD02506 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 7 | p4-warm-idle / write8 | 0x001879 | 0xD02504 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 8 | p4-warm-idle / write8 | 0x001879 | 0xD02505 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 9 | p4-warm-idle / write8 | 0x001879 | 0xD02506 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 10 | p4-warm-idle / write8 | 0x001879 | 0xD02504 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 11 | p4-warm-idle / write8 | 0x001879 | 0xD02505 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 12 | p4-warm-idle / write8 | 0x001879 | 0xD02506 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 13 | p5-launch-home-09dd62 / write8 | 0x0800F6 | 0xD02504 | 0x00 | 0x00 | 0x07F9FF -> 0x07F978 -> 0x09DE94 -> 0x0800EC -> 0x0800A0 -> 0x0800BD -> 0x0800F2 -> 0x0800F6 |
| 14 | p5-launch-home-09dd62 / write16 | 0x09DD9E | 0xD02504 | 0x00 | 0x00 | 0x0B2D88 -> 0x08A9DC -> 0x08A9F6 -> 0x09DED6 -> 0x05E997 -> 0x05E9AC -> 0x09DEDA -> 0x09DD9E |
| 15 | p5-launch-home-09dd62 / write16 | 0x09DD9E | 0xD02505 | 0x00 | 0x0A | 0x0B2D88 -> 0x08A9DC -> 0x08A9F6 -> 0x09DED6 -> 0x05E997 -> 0x05E9AC -> 0x09DEDA -> 0x09DD9E |
| 16 | p5-launch-home-09dd62 / write8 | 0x0800F6 | 0xD02504 | 0x00 | 0x00 | 0x05E9AC -> 0x09DEDA -> 0x09DD9E -> 0x0800EC -> 0x0800A0 -> 0x0800BD -> 0x0800F2 -> 0x0800F6 |
| 17 | p5-launch-home-09dd62 / write8 | 0x001879 | 0xD02504 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 18 | p5-launch-home-09dd62 / write8 | 0x001879 | 0xD02505 | 0x0A | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 19 | p5-launch-home-09dd62 / write8 | 0x001879 | 0xD02506 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 20 | p5-launch-home-09dd62 / write8 | 0x001879 | 0xD02504 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 21 | p5-launch-home-09dd62 / write8 | 0x001879 | 0xD02505 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 22 | p5-launch-home-09dd62 / write8 | 0x001879 | 0xD02506 | 0x00 | 0x00 | 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 |
| 23 | p6-home-repaint-058241 / write8 | 0x058276 | 0xD02506 | 0x00 | 0x00 | 0x058241 -> 0x058257 -> 0x058258 -> 0x058262 -> 0x0800C2 -> 0x058272 -> 0x058BA3 -> 0x058276 |
| 24 | p6-home-repaint-058241 / write8 | 0x0800F6 | 0xD02504 | 0x00 | 0x00 | 0x08BFD1 -> 0x08BF9E -> 0x0582BC -> 0x0800EC -> 0x0800A0 -> 0x0800BD -> 0x0800F2 -> 0x0800F6 |
| 25 | p6-home-repaint-058241 / write8 | 0x0A2854 | 0xD02504 | 0x00 | 0x00 | 0x0582F0 -> 0x0582F4 -> 0x0A1FB5 -> 0x0A1FC5 -> 0x0A1FCF -> 0x058322 -> 0x058344 -> 0x0A2854 |
| 26 | p7-clear-outer-loop-to-owner / write8 | 0x0A31E2 | 0xD02506 | 0x00 | 0x00 | 0x0A31F6 -> 0x0A3158 -> 0x0A31A6 -> 0x0A31F6 -> 0x0A31AC -> 0x0A31F6 -> 0x0A31B8 -> 0x0A31E2 |
| 27 | p7-clear-outer-loop-to-owner / write8 | 0x0A31E2 | 0xD02505 | 0x00 | 0x00 | 0x0A31F6 -> 0x0A3158 -> 0x0A31A6 -> 0x0A31F6 -> 0x0A31AC -> 0x0A31F6 -> 0x0A31B8 -> 0x0A31E2 |
| 28 | p7-clear-outer-loop-to-owner / write8 | 0x0A31E2 | 0xD02504 | 0x00 | 0x00 | 0x0A31F6 -> 0x0A3158 -> 0x0A31A6 -> 0x0A31F6 -> 0x0A31AC -> 0x0A31F6 -> 0x0A31B8 -> 0x0A31E2 |

## Candidate / Owner Hit Trace

| # | Phase | PC | Label | Z | D02505 | Recent path tail |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | p7-clear-outer-loop-to-owner | 0x058D54 | candidate-writer-entry-058d54 | 0 | 0x00 | 0x058B73 -> 0x0587F1 -> 0x0587F3 -> 0x05884C -> 0x058EDA -> 0x058850 -> 0x05899D -> 0x058D54 |
| 2 | p7-clear-outer-loop-to-owner | 0x058D60 | candidate-writer-z-branch-058d60 | 1 | 0x00 | 0x058D54 -> 0x058EC6 -> 0x058D58 -> 0x0800A8 -> 0x0800AE -> 0x080259 -> 0x0800B2 -> 0x058D60 |
| 3 | p7-clear-outer-loop-to-owner | 0x058D89 | candidate-writer-cleanup-ret-058d89 | 1 | 0x00 | 0x058EC6 -> 0x058D58 -> 0x0800A8 -> 0x0800AE -> 0x080259 -> 0x0800B2 -> 0x058D60 -> 0x058D89 |
| 4 | p7-clear-outer-loop-to-owner | 0x058D54 | candidate-writer-entry-058d54 | 0 | 0x00 | 0x058B73 -> 0x0587F1 -> 0x0587F3 -> 0x05884C -> 0x058EDA -> 0x058850 -> 0x05899D -> 0x058D54 |
| 5 | p7-clear-outer-loop-to-owner | 0x058D60 | candidate-writer-z-branch-058d60 | 1 | 0x00 | 0x058D54 -> 0x058EC6 -> 0x058D58 -> 0x0800A8 -> 0x0800AE -> 0x080259 -> 0x0800B2 -> 0x058D60 |
| 6 | p7-clear-outer-loop-to-owner | 0x058D89 | candidate-writer-cleanup-ret-058d89 | 1 | 0x00 | 0x058EC6 -> 0x058D58 -> 0x0800A8 -> 0x0800AE -> 0x080259 -> 0x0800B2 -> 0x058D60 -> 0x058D89 |
| 7 | p7-clear-outer-loop-to-owner | 0x058D54 | candidate-writer-entry-058d54 | 0 | 0x00 | 0x0800B2 -> 0x058D60 -> 0x058D89 -> 0x0589A1 -> 0x0589AE -> 0x0589BB -> 0x0589E5 -> 0x058D54 |
| 8 | p7-clear-outer-loop-to-owner | 0x058D60 | candidate-writer-z-branch-058d60 | 1 | 0x00 | 0x03F9AB -> 0x03F9AE -> 0x03D058 -> 0x03D060 -> 0x03D0E0 -> 0x080259 -> 0x0800B2 -> 0x058D60 |
| 9 | p7-clear-outer-loop-to-owner | 0x058D89 | candidate-writer-cleanup-ret-058d89 | 1 | 0x00 | 0x03F9AE -> 0x03D058 -> 0x03D060 -> 0x03D0E0 -> 0x080259 -> 0x0800B2 -> 0x058D60 -> 0x058D89 |
| 10 | p7-clear-outer-loop-to-owner | 0x0A20CC | scroll-parent-0a20cc | 1 | 0x00 | 0x0A2B16 -> 0x0A2B51 -> 0x0A2B7E -> 0x0A2B8F -> 0x0A2BEB -> 0x0A2C0C -> 0x0A2C10 -> 0x0A20CC |
| 11 | p7-clear-outer-loop-to-owner | 0x0A20EA | scroll-parent-calls-0a321d | 0 | 0x00 | 0x0A2B7E -> 0x0A2B8F -> 0x0A2BEB -> 0x0A2C0C -> 0x0A2C10 -> 0x0A20CC -> 0x0A20E4 -> 0x0A20EA |
| 12 | p7-clear-outer-loop-to-owner | 0x0A321D | scroll-down-entry-0a321d | 0 | 0x00 | 0x0A2B8F -> 0x0A2BEB -> 0x0A2C0C -> 0x0A2C10 -> 0x0A20CC -> 0x0A20E4 -> 0x0A20EA -> 0x0A321D |
| 13 | p7-clear-outer-loop-to-owner | 0x0A322B | scroll-owner-di-0a322b | 1 | 0x00 | 0x0A2BEB -> 0x0A2C0C -> 0x0A2C10 -> 0x0A20CC -> 0x0A20E4 -> 0x0A20EA -> 0x0A321D -> 0x0A322B |
| 14 | p7-clear-outer-loop-to-owner | 0x0A31FD | d02505-owner-boundary-0a31fd | 1 | 0x00 | 0x0A2C0C -> 0x0A2C10 -> 0x0A20CC -> 0x0A20E4 -> 0x0A20EA -> 0x0A321D -> 0x0A322B -> 0x0A31FD |
| 15 | p7-clear-outer-loop-to-owner | 0x0A3205 | d02505-owner-fallthrough-0a3205 | 0 | 0x00 | 0x0A2C10 -> 0x0A20CC -> 0x0A20E4 -> 0x0A20EA -> 0x0A321D -> 0x0A322B -> 0x0A31FD -> 0x0A3205 |
| 16 | p7-clear-outer-loop-to-owner | 0x0A31B8 | scroll-copy-setup-0a31b8 | 0 | 0x00 | 0x0A314D -> 0x0A31F6 -> 0x0A3158 -> 0x0A31A6 -> 0x0A31F6 -> 0x0A31AC -> 0x0A31F6 -> 0x0A31B8 |
| 17 | p7-clear-outer-loop-to-owner | 0x0A31E2 | destructive-copy-owner-0a31e2 | 1 | 0x00 | 0x0A31F6 -> 0x0A3158 -> 0x0A31A6 -> 0x0A31F6 -> 0x0A31AC -> 0x0A31F6 -> 0x0A31B8 -> 0x0A31E2 |
| 18 | p7-clear-outer-loop-to-owner | 0x0A31A2 | post-copy-tail-0a31a2 | 0 | 0x00 | 0x0A3158 -> 0x0A31A6 -> 0x0A31F6 -> 0x0A31AC -> 0x0A31F6 -> 0x0A31B8 -> 0x0A31E2 -> 0x0A31A2 |

## Direct ROM References To D02505

Total refs with literal operand bytes: 88. Direct writes: 29.

| PC | Access | Kind | Decode |
| --- | --- | --- | --- |
| 0x02721B | write | LD (addr),A | `LD (0xD02505),A` |
| 0x058D65 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x05E7B4 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x060E19 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x060F1F | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x060F9F | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x061021 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x061040 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x06104A | write | LD (addr),A | `LD (0xD02505),A` |
| 0x061055 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x061CB3 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x06A211 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x07343D | write | LD (addr),A | `LD (0xD02505),A` |
| 0x074178 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x074207 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x078F03 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0791D3 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0794A0 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x079576 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0795FC | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x07981F | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x07996E | write | LD (addr),A | `LD (0xD02505),A` |
| 0x079A32 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x07A6BD | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x07A7DB | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x07AB8C | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0876BC | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x092854 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x092C4C | address-load | LD DE,addr | `LD DE,0xD02505` |
| 0x092C65 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x092C85 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x096B3F | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x096B74 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x096C33 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x09725F | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x097351 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0974CE | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0977D8 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x097828 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0985A4 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0985BC | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0986C1 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x09911E | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x09919B | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x09D1FB | unknown | unknown | `LD HL,(0xD02505)` |
| 0x09E126 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A1B69 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A1CAE | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A1CFC | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A1DEB | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A1F41 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0A20FA | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0A2190 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0A225B | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A2294 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A233A | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0A234D | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0A2949 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0A29C3 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0A583A | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0A5C64 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0A5C91 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0A61C3 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A625D | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A637D | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A6444 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0A644B | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0A6476 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0A6604 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0A7579 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0A8C97 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0A8DE1 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0AB343 | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0ADD4B | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0AE113 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0AF2A3 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0AF2CA | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0AF2EE | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0AF2F5 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0AF317 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0AF4B7 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0AF4CD | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0B20BA | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0B20C1 | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0B20CA | write | LD (addr),A | `LD (0xD02505),A` |
| 0x0B8CF4 | address-load | LD HL,addr | `LD HL,0xD02505` |
| 0x0B910F | read | LD A,(addr) | `LD A,(0xD02505)` |
| 0x0B9123 | read | LD A,(addr) | `LD A,(0xD02505)` |

## Candidate Decodes

### Known D02505 writer 0x058D54..0x058D8E

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x058D54 | `CD C6 8E 05` | `CALL 0x058EC6` |
| 0x058D58 | `FD CB 45 BE` | `RES 7,(IY+69)` |
| 0x058D5C | `CD A8 00 08` | `CALL 0x0800A8` |
| 0x058D60 | `28 27` | `JR Z,0x058D89` |
| 0x058D62 | `F5` | `PUSH AF` |
| 0x058D63 | `3E 0A` | `LD A,0x0A` |
| 0x058D65 | `32 05 25 D0` | `LD (0xD02505),A` |
| 0x058D69 | `40 ED 5B 53 11` | `LD DE,(0x001153)` |
| 0x058D6E | `16 00` | `LD D,0x00` |
| 0x058D70 | `CD 41 D3 0B` | `CALL 0x0BD341` |
| 0x058D74 | `3A 85 26 D0` | `LD A,(0xD02685)` |
| 0x058D78 | `32 87 26 D0` | `LD (0xD02687),A` |
| 0x058D7C | `CD 8D 9A 06` | `CALL 0x069A8D` |
| 0x058D80 | `FD CB 0C A6` | `RES 4,(IY+12)` |
| 0x058D84 | `CD 65 8C 05` | `CALL 0x058C65` |
| 0x058D88 | `F1` | `POP AF` |
| 0x058D89 | `FD CB 01 9E` | `RES 3,(IY+1)` |
| 0x058D8D | `C9` | `RET` |

### Display-window SaveShadow 0x0A2802..0x0A282D

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A2802 | `40 2A 95 05` | `LD HL,(0x000595)` |
| 0x0A2806 | `40 22 C4 07` | `LD HL,(0x0007C4)` |
| 0x0A280A | `3A 04 25 D0` | `LD A,(0xD02504)` |
| 0x0A280E | `32 C7 07 D0` | `LD (0xD007C7),A` |
| 0x0A2812 | `3A 92 00 D0` | `LD A,(0xD00092)` |
| 0x0A2816 | `32 C8 07 D0` | `LD (0xD007C8),A` |
| 0x0A281A | `3A 85 00 D0` | `LD A,(0xD00085)` |
| 0x0A281E | `E6 10` | `AND 0x10` |
| 0x0A2820 | `32 C9 07 D0` | `LD (0xD007C9),A` |
| 0x0A2824 | `40 2A 9A 05` | `LD HL,(0x00059A)` |
| 0x0A2828 | `40 22 D2 2A` | `LD HL,(0x002AD2)` |
| 0x0A282C | `C9` | `RET` |

### Display-window clear/fill 0x0A223A..0x0A22B1

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A223A | `CD 5E 23 0A` | `CALL 0x0A235E` |
| 0x0A223E | `3A 04 25 D0` | `LD A,(0xD02504)` |
| 0x0A2242 | `F5` | `PUSH AF` |
| 0x0A2243 | `CD A0 00 08` | `CALL 0x0800A0` |
| 0x0A2247 | `28 08` | `JR Z,0x0A2251` |
| 0x0A2249 | `FE 06` | `CP 0x06` |
| 0x0A224B | `20 09` | `JR NZ,0x0A2256` |
| 0x0A224D | `3E 9B` | `LD A,0x9B` |
| 0x0A224F | `18 09` | `JR 0x0A225A` |
| 0x0A2251 | `B7` | `OR A` |
| 0x0A2252 | `20 02` | `JR NZ,0x0A2256` |
| 0x0A2254 | `3E 1E` | `LD A,0x1E` |
| 0x0A2256 | `C4 4C 2D 0A` | `CALL NZ,0x0A2D4C` |
| 0x0A225A | `47` | `LD B,A` |
| 0x0A225B | `3A 05 25 D0` | `LD A,(0xD02505)` |
| 0x0A225F | `FE 0A` | `CP 0x0A` |
| 0x0A2261 | `20 04` | `JR NZ,0x0A2267` |
| 0x0A2263 | `3E EF` | `LD A,0xEF` |
| 0x0A2265 | `18 06` | `JR 0x0A226D` |
| 0x0A2267 | `CD 4C 2D 0A` | `CALL 0x0A2D4C` |
| 0x0A226B | `D6 02` | `SUB 0x02` |
| 0x0A226D | `21 00 00 00` | `LD HL,0x000000` |
| 0x0A2271 | `4F` | `LD C,A` |
| 0x0A2272 | `11 3F 01 00` | `LD DE,0x00013F` |
| 0x0A2276 | `CD 20 EF 09` | `CALL 0x09EF20` |
| 0x0A227A | `F1` | `POP AF` |
| 0x0A227B | `FD CB 0D 4E` | `BIT 1,(IY+13)` |
| 0x0A227F | `C8` | `RET Z` |
| 0x0A2280 | `F5` | `PUSH AF` |
| 0x0A2281 | `FD CB 4C C6` | `SET 0,(IY+76)` |
| 0x0A2285 | `3E 02` | `LD A,0x02` |
| 0x0A2287 | `FD CB 4C 6E` | `BIT 5,(IY+76)` |
| 0x0A228B | `CC 89 67 02` | `CALL Z,0x026789` |
| 0x0A228F | `FD CB 4C 86` | `RES 0,(IY+76)` |
| 0x0A2293 | `C1` | `POP BC` |
| 0x0A2294 | `3A 05 25 D0` | `LD A,(0xD02505)` |
| 0x0A2298 | `90` | `SUB B` |
| 0x0A2299 | `CD 37 2A 0A` | `CALL 0x0A2A37` |
| 0x0A229D | `78` | `LD A,B` |
| 0x0A229E | `E5` | `PUSH HL` |
| 0x0A229F | `C1` | `POP BC` |
| 0x0A22A0 | `CD 37 2A 0A` | `CALL 0x0A2A37` |
| 0x0A22A4 | `11 C0 06 D0` | `LD DE,0xD006C0` |
| 0x0A22A8 | `19` | `ADD HL,DE` |
| 0x0A22A9 | `E5` | `PUSH HL` |
| 0x0A22AA | `D1` | `POP DE` |
| 0x0A22AB | `13` | `INC DE` |
| 0x0A22AC | `36 20` | `LD-IND-IMM {"pc":664236,"length":2,"nextPc":664238,"tag":"ld-ind-imm","value":32,"mode":"adl","modePrefix":null}` |
| 0x0A22AE | `ED B0` | `LDIR` |
| 0x0A22B0 | `C9` | `RET` |

### Scroll parent 0x0A20CC..0x0A20EE

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A20CC | `F5` | `PUSH AF` |
| 0x0A20CD | `D5` | `PUSH DE` |
| 0x0A20CE | `E5` | `PUSH HL` |
| 0x0A20CF | `3E 19` | `LD A,0x19` |
| 0x0A20D1 | `40 32 96 05` | `LD (0x000596),A` |
| 0x0A20D5 | `11 95 05 D0` | `LD DE,0xD00595` |
| 0x0A20D9 | `1A` | `LD A,(DE)` |
| 0x0A20DA | `3D` | `DEC A` |
| 0x0A20DB | `21 04 25 D0` | `LD HL,0xD02504` |
| 0x0A20DF | `BE` | `CP (HL)` |
| 0x0A20E0 | `F2 F0 20 0A` | `JP P,0x0A20F0` |
| 0x0A20E4 | `FD CB 0D 56` | `BIT 2,(IY+13)` |
| 0x0A20E8 | `28 06` | `JR Z,0x0A20F0` |
| 0x0A20EA | `CD 1D 32 0A` | `CALL 0x0A321D` |

### Scroll owner 0x0A321D..0x0A323A

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A321D | `F5` | `PUSH AF` |
| 0x0A321E | `C5` | `PUSH BC` |
| 0x0A321F | `D5` | `PUSH DE` |
| 0x0A3220 | `E5` | `PUSH HL` |
| 0x0A3221 | `DD E5` | `PUSH IX` |
| 0x0A3223 | `ED 57` | `LD A,I` |
| 0x0A3225 | `EA 2B 32 0A` | `JP PE,0x0A322B` |
| 0x0A3229 | `ED 57` | `LD A,I` |
| 0x0A322B | `F3` | `DI` |
| 0x0A322C | `F5` | `PUSH AF` |
| 0x0A322D | `DD 21 04 25 D0` | `LD IX,0xD02504` |
| 0x0A3232 | `FD CB 05 D6` | `SET 2,(IY+5)` |
| 0x0A3236 | `CD FD 31 0A` | `CALL 0x0A31FD` |

### D02505 geometry gate 0x0A31FD..0x0A3216

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A31FD | `DD 7E 01` | `LD A,(IX+1)` |
| 0x0A3200 | `DD 96 00` | `SUB (IX+0)` |
| 0x0A3203 | `3D` | `DEC A` |
| 0x0A3204 | `C8` | `RET Z` |
| 0x0A3205 | `FD CB 4C FE` | `SET 7,(IY+76)` |
| 0x0A3209 | `6F` | `LD L,A` |
| 0x0A320A | `26 14` | `LD H,0x14` |
| 0x0A320C | `ED 6C` | `MLT HL` |
| 0x0A320E | `45` | `LD B,L` |
| 0x0A320F | `DD 7E 01` | `LD A,(IX+1)` |
| 0x0A3212 | `CD 4C 2D 0A` | `CALL 0x0A2D4C` |

## Machine JSON

```json
{
  "probe": "phase853-d02505-lifetime-trace",
  "pass": true,
  "checks": {
    "clearRouteReachedOwner": true,
    "realHasTen": true,
    "ownerZero": true,
    "skippedKnownWriter": true,
    "liftedTenIsTransient": true
  },
  "conclusion": "D02505 does become 0x0A transiently during launch-home, but a later 0x001879 clear zeros it; the CLEAR route then skips the 0x058D65 rewriter because 0x0800A8 leaves Z set at 0x058D60, so D02505 remains zero into 0x0A31FD",
  "rawCounts": {
    "targetCounts": {
      "0x058D54": 3,
      "0x058D5C": 0,
      "0x058D60": 3,
      "0x058D62": 0,
      "0x058D65": 0,
      "0x058D89": 3,
      "0x0A223A": 0,
      "0x0A225B": 0,
      "0x0A2294": 0,
      "0x0A2802": 0,
      "0x0A20CC": 1,
      "0x0A20EA": 1,
      "0x0A321D": 1,
      "0x0A322B": 1,
      "0x0A31FD": 1,
      "0x0A3205": 1,
      "0x0A31B8": 1,
      "0x0A31E2": 1,
      "0x0A31A2": 1
    },
    "writeEvents": 28,
    "branchHits": 18,
    "snapshots": 10,
    "directRefs": 88,
    "directWriteRefs": 29
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


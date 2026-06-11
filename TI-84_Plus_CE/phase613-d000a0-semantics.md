# phase613 — D000A0 Semantics (IY+0x44)

## Correction: Address Is D000A0, Not D000C4

The task prompt guessed D000C4 (IY+0x68). The actual displacement byte at 0x08F40C+2 is **0x44** (decimal 68), not 0x68. So the RAM address is:

```
IY (0xD0005C) + 0x44 = 0xD000A0
```

Raw bytes at both sites confirm:
- `0x08F40C: FD CB 44 DE` → SET 3,(IY+0x44)
- `0x08F410: FD CB 44 A6` → RES 4,(IY+0x44)

---

## Summary

| Property | Value |
|----------|-------|
| RAM address | 0xD000A0 |
| IY base | 0xD0005C |
| Displacement | 0x44 (decimal 68) |
| Total IY-relative BIT/SET/RES refs | 122 |
| Direct memory refs (LD/3-byte LE pattern) | 0 |

This byte is accessed **exclusively** via IY-relative bit operations — never via direct 24-bit address. That's typical for the TI-84 CE OS system flags block at IY+N.

---

## Bit Usage Summary

| Bit | BIT tests | SETs | RESs | Role inference |
|-----|-----------|------|------|----------------|
| 0   | 0         | 0    | 1    | Cleared once; never tested — likely a one-time init clear |
| 1   | 4         | 9    | 3    | Read-write flag; more SETs than RESs → often held set |
| 2   | 10        | 12   | 28   | **Most-mutated bit** — heavily cleared; central control flag |
| 3   | 11        | 1    | 1    | **Heavily read, rarely written** — primary status/query bit |
| 4   | 3         | 1    | 5    | Mostly cleared; SET 3 in outer loop (0x08F40C) |
| 5   | 26        | 4    | 2    | **Most-tested bit** — 26 BIT tests, rarely written; read-mostly flag |
| 6   | 1         | 0    | 0    | Single BIT test only (0x061460); never SET or RES in ROM |
| 7   | 0         | 0    | 0    | Unused |

---

## Complete IY+0x44 Reference Table

All 122 BIT/SET/RES operations on D000A0 across the ROM:

| Address   | Operation            | Address   | Operation            |
|-----------|----------------------|-----------|----------------------|
| 0x022582  | BIT 5,(IY+0x44)      | 0x060543  | RES 4,(IY+0x44)      |
| 0x0225bf  | BIT 5,(IY+0x44)      | 0x060926  | RES 2,(IY+0x44)      |
| 0x0225f5  | BIT 5,(IY+0x44)      | 0x060bf8  | BIT 1,(IY+0x44)      |
| 0x0226a2  | BIT 5,(IY+0x44)      | 0x061460  | BIT 6,(IY+0x44)      |
| 0x0227cd  | BIT 5,(IY+0x44)      | 0x0614e3  | SET 2,(IY+0x44)      |
| 0x022810  | BIT 5,(IY+0x44)      | 0x0614ed  | RES 4,(IY+0x44)      |
| 0x02285d  | BIT 5,(IY+0x44)      | 0x0614f1  | RES 1,(IY+0x44)      |
| 0x0228b9  | BIT 5,(IY+0x44)      | 0x0614fa  | SET 1,(IY+0x44)      |
| 0x022904  | BIT 5,(IY+0x44)      | 0x06c927  | RES 2,(IY+0x44)      |
| 0x02292f  | BIT 5,(IY+0x44)      | 0x07932a  | RES 2,(IY+0x44)      |
| 0x022980  | BIT 5,(IY+0x44)      | 0x079380  | SET 2,(IY+0x44)      |
| 0x022bd6  | BIT 5,(IY+0x44)      | 0x079958  | RES 2,(IY+0x44)      |
| 0x022beb  | BIT 5,(IY+0x44)      | 0x0799fa  | RES 2,(IY+0x44)      |
| 0x022d4e  | BIT 5,(IY+0x44)      | 0x079cd8  | RES 5,(IY+0x44)      |
| 0x022f44  | BIT 5,(IY+0x44)      | 0x079ce0  | SET 5,(IY+0x44)      |
| 0x023011  | BIT 5,(IY+0x44)      | 0x079e29  | SET 2,(IY+0x44)      |
| 0x0231ee  | BIT 5,(IY+0x44)      | 0x079e2d  | SET 1,(IY+0x44)      |
| 0x023335  | BIT 5,(IY+0x44)      | 0x07a02d  | RES 2,(IY+0x44)      |
| 0x023666  | BIT 5,(IY+0x44)      | 0x07a1c6  | RES 4,(IY+0x44)      |
| 0x028cab  | BIT 2,(IY+0x44)      | 0x07a4b3  | RES 2,(IY+0x44)      |
| 0x028cc5  | RES 2,(IY+0x44)      | 0x07ad93  | RES 2,(IY+0x44)      |
| 0x029e0e  | BIT 2,(IY+0x44)      | 0x0800b8  | BIT 5,(IY+0x44)      |
| 0x0455d2  | BIT 2,(IY+0x44)      | 0x081212  | SET 2,(IY+0x44)      |
| 0x0456f0  | SET 5,(IY+0x44)      | 0x081216  | SET 1,(IY+0x44)      |
| 0x04e272  | RES 2,(IY+0x44)      | 0x081546  | RES 2,(IY+0x44)      |
| 0x04ef4b  | RES 2,(IY+0x44)      | 0x085cef  | BIT 2,(IY+0x44)      |
| 0x0581fb  | RES 2,(IY+0x44)      | 0x085daf  | BIT 2,(IY+0x44)      |
| 0x058406  | SET 2,(IY+0x44)      | 0x08775f  | BIT 1,(IY+0x44)      |
| 0x0586da  | RES 2,(IY+0x44)      | 0x0885c5  | RES 2,(IY+0x44)      |
| 0x058a3a  | SET 1,(IY+0x44)      | 0x08874a  | SET 2,(IY+0x44)      |
| 0x058b25  | RES 2,(IY+0x44)      | 0x08c0ee  | BIT 5,(IY+0x44)      |
| 0x058cd2  | BIT 1,(IY+0x44)      | 0x08c29d  | BIT 5,(IY+0x44)      |
| 0x058d3b  | SET 1,(IY+0x44)      | 0x08c2a2  | SET 5,(IY+0x44)      |
| 0x058d44  | RES 1,(IY+0x44)      | 0x08c2a6  | SET 2,(IY+0x44)      |
| 0x05c6ae  | BIT 2,(IY+0x44)      | 0x08c2b1  | BIT 5,(IY+0x44)      |
| 0x05c7ad  | BIT 2,(IY+0x44)      | 0x08c2b6  | RES 5,(IY+0x44)      |
| 0x05c8ae  | BIT 3,(IY+0x44)      | 0x08c2ba  | RES 2,(IY+0x44)      |
| 0x05c8e0  | BIT 4,(IY+0x44)      | 0x08cad4  | RES 1,(IY+0x44)      |
| 0x05c8e6  | BIT 3,(IY+0x44)      | 0x08ce5a  | SET 2,(IY+0x44)      |
| 0x05c910  | BIT 3,(IY+0x44)      | 0x08d0ca  | RES 0,(IY+0x44)      |
| 0x05c9f3  | BIT 3,(IY+0x44)      | 0x08d138  | SET 1,(IY+0x44)      |
| 0x05cba0  | BIT 3,(IY+0x44)      | 0x08d80b  | BIT 2,(IY+0x44)      |
| 0x060543  | RES 4,(IY+0x44)      | 0x08e399  | BIT 3,(IY+0x44)      |
| 0x060926  | RES 2,(IY+0x44)      | 0x08e3da  | BIT 3,(IY+0x44)      |
| 0x060bf8  | BIT 1,(IY+0x44)      | 0x08e69e  | BIT 3,(IY+0x44)      |
| 0x061460  | BIT 6,(IY+0x44)      | 0x08e6e0  | BIT 3,(IY+0x44)      |
| 0x0614e3  | SET 2,(IY+0x44)      | 0x08e6f8  | BIT 3,(IY+0x44)      |
| 0x0614ed  | RES 4,(IY+0x44)      | 0x08e705  | BIT 3,(IY+0x44)      |
| 0x0614f1  | RES 1,(IY+0x44)      | 0x08f40c  | SET 3,(IY+0x44)      |
| 0x0614fa  | SET 1,(IY+0x44)      | 0x08f410  | RES 4,(IY+0x44)      |
| 0x06c927  | RES 2,(IY+0x44)      | 0x08f60b  | SET 4,(IY+0x44)      |
| 0x07932a  | RES 2,(IY+0x44)      | 0x08f68e  | RES 3,(IY+0x44)      |
| 0x079380  | SET 2,(IY+0x44)      | 0x090af9  | BIT 1,(IY+0x44)      |
| 0x079958  | RES 2,(IY+0x44)      | 0x090fdd  | BIT 4,(IY+0x44)      |
| 0x0799fa  | RES 2,(IY+0x44)      | 0x091459  | BIT 4,(IY+0x44)      |
| 0x079cd8  | RES 5,(IY+0x44)      | 0x0920cb  | BIT 5,(IY+0x44)      |
| 0x079ce0  | SET 5,(IY+0x44)      | 0x0923cf  | SET 2,(IY+0x44)      |
| 0x079e29  | SET 2,(IY+0x44)      | 0x093320  | RES 2,(IY+0x44)      |
| 0x079e2d  | SET 1,(IY+0x44)      | 0x097f08  | RES 4,(IY+0x44)      |
| 0x07a02d  | RES 2,(IY+0x44)      | 0x09c2f3  | BIT 5,(IY+0x44)      |
| 0x07a1c6  | RES 4,(IY+0x44)      | 0x09c321  | BIT 5,(IY+0x44)      |
| 0x07a4b3  | RES 2,(IY+0x44)      | 0x09d149  | RES 2,(IY+0x44)      |
| 0x07ad93  | RES 2,(IY+0x44)      | 0x09dea8  | SET 5,(IY+0x44)      |
|           |                      | 0x09e08f  | BIT 2,(IY+0x44)      |
|           |                      | 0x0a65a4  | RES 2,(IY+0x44)      |
|           |                      | 0x0a68b8  | SET 2,(IY+0x44)      |
|           |                      | 0x0a68bc  | SET 1,(IY+0x44)      |
|           |                      | 0x0a704d  | SET 2,(IY+0x44)      |
|           |                      | 0x0a7051  | SET 1,(IY+0x44)      |
|           |                      | 0x0ac8f4  | RES 2,(IY+0x44)      |
|           |                      | 0x0aca9c  | RES 2,(IY+0x44)      |
|           |                      | 0x0af618  | BIT 2,(IY+0x44)      |
|           |                      | 0x0b1cf3  | RES 2,(IY+0x44)      |
|           |                      | 0x0b3fbf  | RES 2,(IY+0x44)      |
|           |                      | 0x0b4e5f  | RES 2,(IY+0x44)      |
|           |                      | 0x0b51c0  | RES 2,(IY+0x44)      |
|           |                      | 0x0b51eb  | RES 2,(IY+0x44)      |
|           |                      | 0x0b572c  | SET 2,(IY+0x44)      |
|           |                      | 0x0b5730  | SET 1,(IY+0x44)      |
|           |                      | 0x0ba1a4  | RES 2,(IY+0x44)      |

---

## Direct Memory References

Scan for 3-byte little-endian pattern `A0 00 D0` across the full ROM found **0 direct references**. The byte at D000A0 is accessed exclusively via IY-relative bit operations. This is consistent with TI-84 CE OS system flags convention — the entire IY+N block is accessed only through indexed bit ops, never through direct addressing.

---

## Patterns and Observations

### Bit 5 — Read-mostly status flag (most-tested: 26 BIT, 4 SET, 2 RES)
- 19 of the 26 BIT 5 tests are tightly clustered at 0x022582–0x023666 (the home screen / display driver region)
- Only 4 SETs and 2 RESs in the entire ROM → bit 5 is almost always externally driven; the OS mostly polls it
- Likely: **display/rendering active** or **home screen draw inhibit** flag

### Bit 2 — Most-mutated flag (10 BIT, 12 SET, 28 RES)
- 28 RESs vs 12 SETs — heavily cleared across many subsystems (file I/O at 0x07xxxxx, USB at 0x0axxxxx, editor at 0x058xxxxx, drawing at 0x06xxxxx)
- Widespread scope suggests a **global error/busy/interrupt-pending flag** that gets cleared on entry to nearly every major routine
- In the outer loop (0x08F3B8): SET 3 fires at 0x08F40C; no bit 2 operation there → bit 2 not directly controlled by the outer loop

### Bit 3 — Heavily read, almost never written (11 BIT, 1 SET, 1 RES)
- Cluster of 6 consecutive BIT 3 tests at 0x08E399–0x08E705 (just before the outer loop)
- Single SET at 0x08F40C (outer loop entry), single RES at 0x08F68E (near outer loop exit)
- Pattern: **state machine phase flag** — outer loop sets bit 3 on entry, clears it on exit, and many callers gate on it before entering

### Bit 4 — Loop-phase flag (3 BIT, 1 SET, 5 RES)
- SET 4 at 0x08F60B (later in outer loop body), RES 4 at 0x08F410 (outer loop early in same iteration)
- Additional RES 4 sites scattered across display/graph code
- Bit 4 is toggled within a single outer-loop pass — likely **sub-phase within iteration** (clear on enter step, set on reach step)

### Bit 1 — Paired SET/RES flag (4 BIT, 9 SETs, 3 RES)
- Frequently SET in pairs with bit 2 SET (e.g., 0x079e2d/0x079e29, 0x081216/0x081212, 0x0b5730/0x0b572c, 0x0a68bc/0x0a68b8, 0x0a7051/0x0a704d)
- These paired SET 2 + SET 1 writes suggest bits 1 and 2 encode a **2-bit state field** rather than fully independent flags

### Bit 0 — Init-only clear (0 BIT, 0 SET, 1 RES)
- Single RES at 0x08D0CA; never SET, never tested → cleared once at startup, not meaningful thereafter

### Bit 6 — Single test (1 BIT, 0 SET, 0 RES)
- One BIT 6 test at 0x061460; never written in ROM → likely reads hardware-initialized RAM state or is dead code

---

## Outer Loop Context (0x08F3B8)

Within the outer loop decoded in session 611:

| Address   | Operation          | Phase interpretation |
|-----------|--------------------|----------------------|
| 0x08F40C  | SET 3,(IY+0x44)    | Mark loop iteration active (bit 3 = phase flag) |
| 0x08F410  | RES 4,(IY+0x44)    | Clear sub-phase bit at loop-body start |
| 0x08F60B  | SET 4,(IY+0x44)    | Set sub-phase bit later in loop body |
| 0x08F68E  | RES 3,(IY+0x44)    | Clear phase flag at loop exit / tail |

The SET 3 / RES 3 pair bracketing the loop body confirms bit 3 functions as a **loop-active sentinel**. The RES 4 / SET 4 pair within the body tracks a **sub-iteration phase**.

---

## Cross-Reference: Previously Known D000A0-Area Flags

Note: D000A0 is 0x44 bytes past IY=0xD0005C. The IY block spans the OS system flags. For comparison:
- D000A3 (IY+0x47): mapped in session 609 — bit 3 = "parent walker active", suppressed by dynamic patch to kill runaway
- D000A0 (IY+0x44): this byte — multi-role flags byte used across display, editor, USB, graph, and outer-loop subsystems

# Phase 415: D177BB Latch — Full ROM Reference Map

**Target**: `D177BB` — master "transfer in progress" latch controlling D176F8 state transitions  
**ROM**: TI-84 Plus CE OS 5.8.2.0029 (4,194,304 bytes)

## Summary

| Category      | Count |
|---------------|-------|
| Readers       | 17    |
| Writers       | 21    |
| Address loads | 3     |
| **Total**     | **41** |

All accesses use only two instruction forms:
- `LD A,(D177BB)` / `LD (D177BB),A` — single-byte read/write (37 sites)
- `LD HL,0xD177BB` — address load for indirect `CP (HL)` comparisons (3 sites, all in 0x0369xx)
- No BC/DE/IX/IY-width reads or writes found — confirms D177BB is a single-byte latch

## Bank Distribution

| Bank | Total | Readers | Writers | Addr Loads |
|------|-------|---------|---------|------------|
| USB/OS-core (0x00xxxx–0x01xxxx) | 14 | 5 | 9 | 0 |
| OS-mid (0x02xxxx–0x03xxxx) | 15 | 6 | 6 | 3 |
| Link/peripheral (0x04xxxx–0x06xxxx) | 12 | 6 | 6 | 0 |

## Writer Analysis

### SET sites (value = 1) — Transfer Start — 2 sites

| Address | Bank | Source | Context |
|---------|------|--------|---------|
| `0x00A88D` | USB/OS-core | `LD A,0x01` at 0x00A88B | Conditional set: only if `(D140A8 & 0x03)` was 0 (fallback when computed write at 0x00A880 produced zero) |
| `0x02ACD4` | OS-mid | `LD A,0x01` at 0x02ACD2 | Mirror of 0x00A88D — same pattern: write `(D140A8 & 0x03)`, re-read, set to 1 if zero |

Both SET sites share identical logic:
1. Read `D140A8`, mask with `AND 0x03`, write result to D177BB
2. Immediately re-read D177BB
3. If zero → force-set to 1 (ensures latch is never left at 0 during transfer init)

### CLEAR sites (value = 0) — Transfer End / Reset — 15 sites

| Address | Bank | Source | Context |
|---------|------|--------|---------|
| `0x001343` | USB/OS-core | `XOR A` | Early init: also clears D177B7, then configures I/O ports |
| `0x009871` | USB/OS-core | `XOR A` | Boot/global reset: also clears D176F8 (protocol FSM) and D1407F |
| `0x00993A` | USB/OS-core | `XOR A` | Conditional clear: reads D177BB first, skips if already 0; also clears D176F8 |
| `0x00A8A3` | USB/OS-core | `XOR A` | Transfer init error path: clears latch then jumps to exit at 0x00A8B9 |
| `0x00B6FF` | USB/OS-core | `XOR A` | Post-CALL 0x00285F cleanup, then calls 0x00B8BC with timeout arg 0xBB8 |
| `0x00F3EF` | USB/OS-core | `XOR A` | Full protocol reset: clears D176F8, D17795, D17796, then D177BB |
| `0x0156FA` | USB/OS-core | `XOR A` | USB receive completion: increments D14032 counter first, then clears latch |
| `0x02AD4C` | OS-mid | `XOR A` | Transfer init error path: mirror of 0x00A8A3 |
| `0x02BFD7` | OS-mid | `XOR A` | Wrapper/receive exit: reads D177BB, clears if nonzero; also clears D177B7 and D176F8 |
| `0x036A97` | OS-mid | `XOR A` | Retry loop exit: follows `JP 0x036A05` loop, clears latch on final exit |
| `0x042033` | Link/peripheral | `XOR A` | Link port teardown: clears D177B7 then D177BB, then restores SP and returns |
| `0x0457BE` | Link/peripheral | `XOR A` | Link port init: clears D177B7, D177BB, and three D000Cx port registers |
| `0x048BEE` | Link/peripheral | `XOR A` | Post-CALL 0x0000B0 cleanup, then calls 0x04E07B with timeout arg 0x7D0 |
| `0x04923C` | Link/peripheral | `XOR A` | Boot/global reset (link-port mirror of 0x009871): clears D177BB, D176F8, D1407F |
| `0x04932B` | Link/peripheral | `XOR A` | Conditional clear (link-port mirror of 0x00993A): reads first, clears D177BB + D176F8 |

### OTHER value writers — 4 sites

| Address | Bank | Value | Source | Context |
|---------|------|-------|--------|---------|
| `0x00A880` | USB/OS-core | `(D140A8 & 0x03)` | `AND 0x03` | Computed: copies low 2 bits of D140A8 into D177BB |
| `0x02ACC7` | OS-mid | `(D140A8 & 0x03)` | `AND 0x03` | Mirror of 0x00A880 |
| `0x03697F` | OS-mid | `D177BB + 1` | `INC A` | Retry counter increment: loads D177BB, increments, writes back. Only if D177BB > 1 (guarded by `CP (HL)` / `JR NC`) |
| `0x046926` | Link/peripheral | `0x02` | `LD A,0x02` | Link-port specific: sets latch to 2 under DI, then checks I/O port bit 6 |

## Reader Analysis — 17 sites

### Pattern: "check-and-branch" (14 of 17 readers)

The dominant pattern is `LD A,(D177BB) / OR A / JR Z/JR NZ`:

| Address | Bank | Branch if nonzero | Branch if zero |
|---------|------|-------------------|----------------|
| `0x00847B` | USB/OS-core | JR NZ → 0x0084DA (transfer active path) | Falls through to check D177B8 |
| `0x009932` | USB/OS-core | Falls through to clear D177BB+D176F8 | JR Z → 0x0099A7 (skip cleanup) |
| `0x00A884` | USB/OS-core | JR NZ → 0x00A891 (already active, skip set) | Falls through to force-set to 1 |
| `0x00B8A5` | USB/OS-core | JR NZ → 0x00B8B1 (skip D176F8 clear) | Falls through to clear D176F8 from 0x10→0x00 |
| `0x0156E7` | USB/OS-core | Falls through to clear latch | JR Z → 0x015730 (nothing to do) |
| `0x02ACCB` | OS-mid | JR NZ → 0x02ACD8 (already active) | Falls through to force-set to 1 |
| `0x02BFCF` | OS-mid | Falls through to clear D177BB+D177B7+D176F8 | JR Z → 0x02C000 (skip cleanup) |
| `0x036929` | OS-mid | JR NZ → 0x036950 (merge into main check) | Falls through to retry setup |
| `0x036950` | OS-mid | Falls through to transfer retry loop | JP Z → 0x036ACA (no transfer) |
| `0x049323` | Link/peripheral | Falls through to clear D177BB+D176F8 | JR Z → 0x04939E (skip cleanup) |
| `0x04D53D` | Link/peripheral | Falls through to call 0x04DBEC | JR Z → 0x04D565 (skip) |
| `0x04DA27` | Link/peripheral | Falls through to call 0x04D40D | JR Z → 0x04DA3B (skip) |
| `0x04DED4` | Link/peripheral | Falls through to set D176F8=0x10 | JR Z → 0x04DF1A (skip sentinel) |
| `0x04DEF7` | Link/peripheral | Falls through to set D176F8=0x10 | JR Z → 0x04DF1A (skip sentinel) |

### Pattern: "D176F8 state-0x10 gate" (2 readers)

At `0x00B8A5` and `0x04DF59`, the code first checks `D176F8 == 0x10`, then reads D177BB. If D177BB is zero AND D176F8 is 0x10, it clears D176F8 back to 0x00. This is the critical gate: **D177BB must be 0 for D176F8 to leave the sentinel state 0x10**.

### Pattern: "mask and store" (1 reader)

At `0x0369AD`, D177BB is read, masked with `AND 0x03`, and stored into `D1409D`. This extracts the latch's low 2 bits for use as a status field — confirming D177BB can hold values 0, 1, or 2.

### Address loads — 3 sites (all in 0x0369xx retry loop)

| Address | Instruction | Purpose |
|---------|-------------|---------|
| `0x036973` | `LD HL,0xD177BB` | Indirect compare: `LD A,1 / CP (HL)` — checks if D177BB > 1 |
| `0x036A2A` | `LD HL,0xD177BB` | Same pattern: guards retry counter decrement |
| `0x036A51` | `LD HL,0xD177BB` | Same pattern: guards retry counter increment |

These three sites treat D177BB as a **retry counter**, not a simple boolean. When D177BB > 1, the 0x0369xx loop increments it further (up to 3, since `AND 0x03` masks are used). When D177BB <= 1, the loop skips the increment.

## Lifecycle Interpretation

D177BB is **not a simple boolean** — it has at least 3 meaningful values:

| Value | Meaning | Set by | Cleared by |
|-------|---------|--------|------------|
| `0x00` | Idle / no transfer | 15 clear sites (XOR A) | — |
| `0x01` | Transfer in progress | 2 force-set sites; also via `(D140A8 & 0x03)` | 15 clear sites |
| `0x02` | Link-port transfer mode | `0x046926` (link-port DI path); also via `(D140A8 & 0x03)` or retry INC | — |
| `0x03` | Retry overflow (max) | `0x03697F` (INC A in retry loop, capped by AND 0x03 at read) | — |

### Transfer lifecycle

1. **Init**: `D140A8 & 0x03` → D177BB (at 0x00A880 or 0x02ACC7). If result is 0, force to 1.
2. **Active**: Readers gate D176F8 transitions. D176F8 can only enter state 0x10 (sentinel/pending ack) when D177BB is nonzero.
3. **Retry** (0x0369xx loop): D177BB is incremented on each retry iteration (capped at 3 by AND 0x03 mask).
4. **Completion**: D177BB cleared to 0. D176F8 sentinel state 0x10 can now be cleared back to 0x00.
5. **Reset**: Boot paths (0x009871, 0x04923C) and full-reset (0x00F3EF) clear D177BB along with D176F8 and other protocol state.

### Key relationships

- **D177BB gates D176F8 state 0x10**: At 0x00B8A5 and 0x04DF59, if `D176F8 == 0x10 AND D177BB == 0`, D176F8 is cleared to 0x00. D177BB must be cleared first for the protocol FSM to return to idle.
- **D177B7** is always cleared alongside D177BB (at 0x001343, 0x02BFD7, 0x042033, 0x0457BE) — they are a paired latch set.
- **D140A8 bits 0-1** seed D177BB's initial value — this connects the transfer init to the hardware configuration register.

### Mirrored code pairs (USB vs Link-port)

| USB/OS-core | Link/peripheral | Function |
|-------------|-----------------|----------|
| 0x009871 | 0x04923C | Boot/global reset |
| 0x00993A | 0x04932B | Conditional read-then-clear |
| 0x00A880+0x00A88D | 0x02ACC7+0x02ACD4 | Init with D140A8-seeded value |
| 0x00B8A5 | 0x04DF59 | D176F8 state-0x10 gate |
| 0x00B6FF | 0x048BEE | Post-call cleanup with timeout |

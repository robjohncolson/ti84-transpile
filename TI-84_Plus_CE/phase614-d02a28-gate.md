# Phase 614 — D02A28 Gate Semantics

**Address**: `0xD02A28` (RAM)  
**Size**: 1 byte  
**Semantic name**: `tokenOutputEnabled`  
**Role**: Boolean gate controlling whether token display output reaches the screen buffers

---

## ROM Reference Scan

Searched all 4 MB of `ROM.rom` for byte pattern `28 2A D0` (little-endian encoding of address `0xD02A28`). Found 20 raw byte-pattern hits; 12 are genuine `LD HL,0xD02A28` address-load instructions, 7 are `LD (0xD02A28),A` / `LD A,(0xD02A28)` direct memory instructions (detected by the preceding opcode byte `0x32` / `0x3A`), and 1 remaining hit is a true false positive.

After deduplication (several LD HL instructions are followed by indirect ops at the same site), there are **19 real access sites** across 2 ROM regions.

---

## All References Classified

### WRITES to D02A28 (11 sites)

| # | Instruction PC | Encoding | Value Written | Context |
|---|---------------|----------|--------------|---------|
| W1 | `0x08E912` | `LD HL,D02A28` ; `INC (HL)` | **Increment** (prev+1) | After `CALL 0x08EF41` and `CALL 0x08E0C9` (BC=4). Pushes HL, increments D02A28, pops HL, returns. Small utility function at `0x08E904`. |
| W2 | `0x08EA5B` | `LD HL,D02A28` ; `LD (HL),0x01` | **1** | After `CALL Z,0x08F736`. Sets gate=1 then calls `0x08EA19`. Part of 2-byte token display path. |
| W3 | `0x08EA66` | `LD (D02A28),A` | **A (saved/restored)** | After `POP AF` restores original value. Follows the `LD (HL),0x01` + `CALL 0x08EA19` sequence — restores D02A28 to its pre-call value. |
| W4 | `0x08EA9A` | `LD HL,D02A28` ; `LD (HL),0x01` | **1** | After `CALL 0x08F723` (B=3, HL incremented). Saves original value (via `LD A,(HL)` ; `PUSH AF`), sets gate=1, calls `0x08EA19`. |
| W5 | `0x08EAA7` | `LD (D02A28),A` | **A (saved/restored)** | Restores D02A28 after the W4 call sequence. Mirror of W3. |
| W6 | `0x08EAE7` | `LD HL,D02A28` ; `LD (HL),0x01` | **1** | After `JP 0x08DF54` (a different entry). Sets gate=1 then calls `0x08F336`. |
| W7 | `0x08EB75` | `LD HL,D02A28` ; `LD (HL),0x01` | **1** | After `CALL 0x08E086`. Sets gate=1, pops HL, then continues with DE=6 arithmetic. |
| W8 | `0x08EBF3` | `LD (D02A28),A` | **A (saved/restored)** | Restores after `CALL 0x08EC1F`. Pattern: save → set 1 → do work → restore. |
| W9 | `0x08ECB1` | `LD (D02A28),A` | **A (saved/restored)** | Restores after `CALL 0x08EA29` + `CALL 0x08EC1F`. Same save/restore pattern. |
| W10 | `0x090143` | `LD (D02A28),A` | **0 (A=0 via XOR A)** | `XOR A` ; `LD (D02A28),A` ; `RET`. Clears the gate. Part of an init/reset routine at `0x090138`. |
| W11 | `0x08F5B8` | `LD HL,D02A28` ; `LD (HL),0x00` | **0** | In the 0x08F5E1 exit path. Clears gate as part of post-token cleanup. |

### READS from D02A28 (6 sites)

| # | Instruction PC | Encoding | What Happens Next |
|---|---------------|----------|-------------------|
| R1 | `0x08EA35` | `LD HL,D02A28` ; `LD A,(HL)` ; `PUSH AF` ; `LD (HL),0x00` | Save current value, clear to 0, do work, later restore. |
| R2 | `0x08EA9A` | `LD HL,D02A28` ; `LD A,(HL)` ; `PUSH AF` ; `LD (HL),0x01` | Save current value, set to 1, do work, later restore. |
| R3 | `0x08EAE7` | `LD HL,D02A28` ; `LD A,(HL)` ; `PUSH AF` ; `LD (HL),0x01` | Same save-set-restore pattern. |
| R4 | `0x08EC40` | `LD HL,D02A28` ; `LD A,(HL)` ; `PUSH AF` ; `LD (HL),0x00` | Save, clear, do work, restore. |
| R5 | `0x08EF24` | `LD HL,D02A28` ; `LD B,(HL)` ; `PUSH BC` ; `LD (HL),0x00` | Save to B (pushed), clear, do work, restore. |
| R6 | `0x090992` | `LD A,(D02A28)` ; `OR A` ; `RET` | **Gate test subroutine**. Sets Z flag if D02A28==0. Called from 0x08F5E1 exit path (3 times) and from 0x0907DB (token cursor advance). |

### ADDRESS-ONLY loads (used for INC/DEC via HL)

| # | Instruction PC | Operation via (HL) |
|---|---------------|--------------------|
| A1 | `0x08E912` | `INC (HL)` — increment D02A28 |
| A2 | `0x090987` | `DEC (HL)` — decrement D02A28 |

### Dedicated Subroutines

| Entry | Bytes | Purpose |
|-------|-------|---------|
| `0x09098E` | `LD (D00599),A` ; fall-through to `0x090992` | Store token byte to D00599, then test D02A28 |
| `0x090992` | `LD A,(D02A28)` ; `OR A` ; `RET` | Pure gate test — returns Z if D02A28==0 |
| `0x090986` | `PUSH HL` ; `LD HL,D02A28` ; `DEC (HL)` ; `POP HL` ; `RET` | Decrement D02A28 (nesting depth--) |

---

## Semantic Analysis

### What D02A28 Is

D02A28 is a **nesting-depth counter** that acts as a boolean gate. It tracks how many "display output contexts" are currently active. The OS uses a save/set/restore pattern:

```text
1. LD A,(D02A28)    ; save current depth
2. PUSH AF
3. LD (HL),0x01     ; force depth=1 (enable output)
4. CALL <do_work>   ; work that may itself save/restore D02A28
5. POP AF
6. LD (D02A28),A    ; restore original depth
```

This pattern appears 5 times in the ROM (at W2/W3, W4/W5, W6, W8, W9), always around calls to token rendering subroutines like `0x08EA19`, `0x08F336`, and `0x08EC1F`.

The INC at `0x08E912` and DEC at `0x090986` confirm nesting semantics: entering a display context increments the counter, leaving decrements it.

### Who Writes What

| Value | Sites | Meaning |
|-------|-------|---------|
| **0** | W10 (`XOR A`), W11 (`LD (HL),0x00`), plus save/restore clears | **Disable** token output |
| **1** | W2, W4, W6, W7 (`LD (HL),0x01`) | **Enable** token output |
| **INC** | W1 (`INC (HL)`) | Push one nesting level |
| **DEC** | A2 at `0x090986` (`DEC (HL)`) | Pop one nesting level |
| **Restore** | W3, W5, W8, W9 (`LD (D02A28),A`) | Restore previous depth from stack |

### How It Gates the 0x08F5E1 Exit Path

The exit path at `0x08F5E1` (documented in phase 613) tests D02A28 at three points via `CALL 0x090992` / `CALL 0x09098E`:

1. **`0x08F611`**: `CALL 0x09098E` (stores token byte to D00599, then tests D02A28).  
   If Z → `JP Z,0x08F5DD` — early return, skip all output.

2. **`0x08F663`**: `CALL 0x090992` (tests D02A28).  
   If Z → `JP Z,0x08F5DD` — early return after Phase 2 work.

3. **`0x08F66F`**: `CALL 0x090992` (tests D02A28).  
   If Z → `JR Z,0x08F692` — skip to RES+return, avoiding display buffer writes to D001B8/D001D3.

Every display-buffer write in the exit path is gated behind D02A28 != 0.

### Why It Must Be Non-Zero for Keypress Display

When the user presses a key:
1. The key ISR deposits a scan code
2. `cxMain` dispatches to the token reader at `0x090883`
3. Token reader returns with Z/NZ to `0x08F458`
4. On Z → `JP Z,0x08F5E1` enters the exit/display path
5. The exit path calls `0x09098E` which tests D02A28
6. **If D02A28==0**: all three gate checks fire, the routine returns without writing any token bytes to the display buffers
7. **If D02A28!=0**: token bytes flow through to D001B8/D001D3 and appear on screen

### ROM Address Ranges

All 19 references cluster in two ranges:
- **`0x08E900–0x08F5C0`**: Token processing / display output engine (17 refs)
- **`0x090140–0x090990`**: Utility subroutines — clear, test, decrement (5 refs, some shared with range above)

No references outside these two clusters. D02A28 is purely internal to the token display subsystem.

---

## Actionable Guidance

### For the Interactive Keypress Path

D02A28 must be **non-zero** (typically 1) when the post-token-read dispatch at `0x08F5E1` runs. Without this, token output is suppressed and typed characters never reach the LCD.

### Where to Initialize

The init/reset routine at `0x090138` explicitly clears D02A28 to 0 (`XOR A` ; `LD (D02A28),A`). This is correct for cold boot. The OS must set D02A28=1 before entering the main edit loop. Look for the `INC (HL)` call site at `0x08E912` (W1) — that is likely part of the edit-mode entry sequence that arms the gate.

### For the Transpiler Runtime

In `cpu-runtime.js`, ensure:
1. RAM at `0xD02A28` is initialized to 0 at boot
2. The lifted blocks at `0x08E912` (INC), `0x08EA5B`/`0x08EA9A`/`0x08EAE7`/`0x08EB75` (set 1), `0x08F5B8`/`0x090143` (clear), and `0x090986` (DEC) all execute correctly
3. The gate test at `0x090992` (`LD A,(D02A28)` ; `OR A` ; `RET`) correctly sets the Z flag

If the interactive keypress path skips display output, the first thing to check is whether D02A28 ever transitions from 0 to non-zero. The INC at `0x08E912` or any `LD (HL),0x01` site must fire before the first token-read dispatch.

---

## Summary Table

| Property | Value |
|----------|-------|
| Address | `0xD02A28` |
| Size | 1 byte |
| Semantic name | `tokenOutputEnabled` / `displayNestingDepth` |
| Type | Nesting counter used as boolean gate (0 = disabled, >0 = enabled) |
| Total ROM references | 19 (12 via LD HL + indirect, 7 via direct LD (nn)/LD (nn)) |
| Writers | 11 sites (5 set-to-1, 2 clear-to-0, 1 INC, 1 DEC, 4 restore-from-stack) |
| Readers | 6 sites (4 save-before-modify, 1 gate-test subroutine called from 4 places, 1 load-to-B) |
| Gate test subroutine | `0x090992`: `LD A,(D02A28)` ; `OR A` ; `RET` |
| Critical consumer | `0x08F5E1` exit path (3 gate checks) |
| Required for keypress display | Must be non-zero (>0) when `0x08F5E1` runs |

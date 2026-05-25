# D1407E USB Pipe/Buffer State — Trace Report

## Summary
- Total references: **28** (28 raw 3-byte hits, all classified)
- Writes: **23** (21 write 0x00, 2 write 0x01)
- Reads: **5** (all gate on zero/nonzero via `OR A` + conditional jump)
- IX-relative accesses: **0** (no `LD IX,D14070` found — all access is direct)

## Dual-Bank Structure

The 28 references split cleanly into dual-banked pairs. The TI-84 Plus CE ROM contains two copies of many USB routines (likely USB host vs device, or full-speed vs high-speed banks). Nearly every write/read site in bank 1 (0x008000–0x013FFF) has a mirror in bank 2 (0x028000+) or bank 3 (0x040000+):

| Bank 1 | Bank 2 | Bank 3 | Type | Value |
|--------|--------|--------|------|-------|
| 0x0092E1 | — | 0x0427AC | READ | OR A → JR Z |
| 0x009757 | — | 0x049118 | WRITE | 0x00 |
| 0x00989A | — | 0x049265 | WRITE | 0x00 |
| 0x00A08E | 0x02A414 | — | WRITE | 0x00 |
| 0x00A0CD | 0x02A453 | — | WRITE | 0x00 |
| 0x00C7CD | 0x02B633 | — | WRITE | 0x01 |
| 0x00C85F | 0x02B6C5 | — | WRITE | 0x00 |
| 0x00C9CC | — | — | WRITE | 0x00 |
| 0x00EFD6 | 0x02BB3B | — | READ | OR A → JP Z |
| 0x00F073 | 0x02BBDC | — | WRITE | 0x00 |
| 0x00FD18 | 0x02C282 | — | WRITE | 0x00 |
| 0x01280B | — | 0x0413DB | WRITE | 0x00 |
| 0x012A85 | — | 0x041681 | WRITE | 0x00 |
| — | — | 0x041734 | WRITE | 0x00 |
| — | — | 0x041D97 | READ | OR A → JR Z |
| — | — | 0x041DC9 | WRITE | 0x00 |

Unique logical sites (deduplicating across banks): ~16

## Write Sites

| Address | Mirror(s) | Value Written | Surrounding Context |
|---------|-----------|---------------|---------------------|
| 0x009757 | 0x049118 | 0x00 (XOR A) | Clears D1407E, then reads port 0x3120 (USB CSR), clears bit 5 |
| 0x00989A | 0x049265 | 0x00 (XOR A) | Conditional path (JR Z +0x38 skips), also clears D17796 and D140B2 |
| 0x00A08E | 0x02A414 | 0x00 (XOR A) | Clears D1407E, calls 0x00B9BD/0x0003FC, then sets D140B2=1, D1408B |
| 0x00A0CD | 0x02A453 | 0x00 (XOR A) | Clears D1407E, sets D140B2=1, D1408B, then JR +0x0B |
| 0x00C7CD | 0x02B633 | **0x01** (LD A,0x01) | **Only sites that SET the flag.** Also clears D1407C, then reads port 0x3100 |
| 0x00C85F | 0x02B6C5 | 0x00 (XOR A) | Clears D1407E, reads port 0x313C, clears bit 0 |
| 0x00C9CC | — | 0x00 (XOR A) | Clears D1407E and D140B2, then saves I register, disables interrupts |
| 0x00F073 | 0x02BBDC | 0x00 (XOR A) | Re-enables interrupts (FB=EI) before clearing, reads port 0x3080 |
| 0x00FD18 | 0x02C282 | 0x00 (XOR A) | Also clears D1407F, D14080 — bulk state block reset |
| 0x01280B | 0x0413DB | 0x00 (XOR A) | Also clears D14080, reads port 0x31CB |
| 0x012A85 | 0x041681 | 0x00 (XOR A) | Conditional (JR Z +0x09 skips), also sets (IX-1)=0x01 |
| 0x041734 | — | 0x00 (XOR A) | Bank 3 only — also clears D14084, D14088, sets D14089=0x01 |
| 0x041DC9 | — | 0x00 (XOR A) | Bank 3 only — reads port 0x313C, clears bit 0 |

## Read Sites

| Address | Mirror(s) | Decision Gated | Surrounding Context |
|---------|-----------|----------------|---------------------|
| 0x0092E1 | 0x0427AC | `OR A; JR Z,+0x10` — skip 16 bytes if D1407E==0 | After popping BC twice; if nonzero, loads BC=0x000003 and pushes, then loads BC=0x000010 |
| 0x00EFD6 | 0x02BB3B | `OR A; JP Z,0x00F08C/0x02BBF5` — jump far if D1407E==0 | After JP NZ to 0x00F0F7/0x02BC60; if nonzero, falls through to read D177B8 and compare 0xC0 |
| 0x041D97 | — | `OR A; JR Z,+0x59` — skip 89 bytes if D1407E==0 | Bank 3 only — saves I register, disables interrupts, then reads port 0x3100 |

## Analysis

### Values
D1407E is a **boolean flag** — it only ever takes two values:
- **0x00** (cleared) — 21 of 23 write sites
- **0x01** (set) — 2 write sites (0x00C7CD and its mirror 0x02B633)

### Lifecycle
1. **Set to 1**: Only at 0x00C7CD / 0x02B633. Context: `LD A,0x01; LD (D1407E),A; XOR A; LD (D1407C),A` — sets the pipe-active flag while simultaneously clearing D1407C. Immediately after, reads USB port 0x3100 (OTG CSR base). This is the **USB pipe activation point**.

2. **Cleared to 0**: At 21 different sites across all three code banks. Clearing happens during:
   - USB reset/disconnect sequences (alongside clearing D17796, D140B2)
   - Interrupt-disabled critical sections (save I, DI, clear flag, port I/O)
   - Bulk state block resets (clearing D1407E + D1407F + D14080 together)
   - Port read sequences (0x3120, 0x313C, 0x3080 — USB status/control registers)
   - Error/abort paths (conditional jumps that skip the clear)

3. **Read gates**: All 5 reads test `D1407E != 0` (OR A; conditional branch). When the flag is set (pipe active), the code:
   - At 0x0092E1: pushes additional parameters (BC=3, BC=0x10) — likely buffer size/count for an active pipe
   - At 0x00EFD6: proceeds to check D177B8 (USB event code) against 0xC0 — event processing only when pipe is active
   - At 0x041D97: enters a 89-byte critical section with port I/O — active pipe servicing

### Role in USB State Machine
D1407E is a **USB pipe-active flag**:
- **0** = no pipe established / pipe torn down
- **1** = pipe is active and ready for data transfer

It acts as a guard: USB event processing (D177B8 checks), buffer management (parameter pushes), and port I/O servicing are all gated behind `D1407E != 0`. The overwhelming write-to-read ratio (23:5) reflects the many different error/reset/disconnect paths that must tear down the pipe, versus the few paths that check whether it is up.

### Relationship to Adjacent State Bytes
- **D1407C**: Cleared when D1407E is set — mutually exclusive or complementary flag
- **D1407F, D14080**: Cleared alongside D1407E in bulk resets — part of the same pipe state group
- **D14084, D14088, D14089**: Cleared/set alongside D1407E in bank 3 — extended pipe configuration
- **D140B2**: Frequently set to 1 after D1407E is cleared — likely a "pipe needs re-init" or "idle" flag
- **D17796**: Cleared with D1407E in some paths — USB subsystem state coordination

### Code Banks
The three banks (0x008000+, 0x028000+, 0x040000+) likely correspond to:
- Bank 1 (0x00xxxx): Primary USB controller routines
- Bank 2 (0x02xxxx): Mirror/alternate speed USB routines
- Bank 3 (0x04xxxx): Extended USB routines (has 3 unique sites not mirrored in other banks)

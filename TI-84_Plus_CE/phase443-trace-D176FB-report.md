# Phase 443: Trace D176FB — USB Transfer-Ready Gate Flag

## Summary

D176FB is a **boolean flag** (values 0x00 and 0x01 only) with **34 references** (4 reads, 30 writes) across the USB subsystem. It signals "a transfer is ready for processing" — set to 0x01 when a deferred event (D14078 endpoint-configured, D14079 deferred-transfer-pending, D1407A deferred-dispatch) is consumed, and cleared to 0x00 when the transfer completes or is aborted. Readers use it as a gate: if D176FB is nonzero, skip idle-state processing and stay in the active-transfer path.

**Characterization**: Boolean (0/1). Not a counter, not a pointer. 30 write sites, 4 read sites. All writes are either `LD A,0x01 / LD (D176FB),A` or `XOR A / LD (D176FB),A`.

## Adjacent Addresses

| Address | Hits | Type | Notes |
|---------|------|------|-------|
| D176FB | 34 | Boolean (0/1) | Transfer-ready gate — this report |
| D176FC | 8 | Boolean (0/1) | Separately addressed, boot/init related (written by 0x0BCD26 with value 0x01, cleared by 0x00B738/0x048C3C reset helpers, read by 0x0150E9/0x012149/0x0157A1) |
| D176FD | 49 | Multi-value enum (0-3+) | Transfer phase/stage counter — uses `CP 0x02`, `CP 0x03` comparisons, DEC A patterns. NOT boolean. |

D176FB is a **single-byte independent flag** — D176FC and D176FD are separate variables with distinct semantics.

## Reference Table (D176FB)

### Writes (30 sites)

| Address | Value | Context | Co-accessed D1xxxx |
|---------|-------|---------|-------------------|
| 0x00AA46 | 0x00 | Transfer null-pointer cleanup — clears D176A8, D176F5, then D176FB | D176A8, D176F5 |
| 0x00B8B7 | 0x00 | Reset helper — bulk-clears D176F8 (×2) then D176FB, returns | D176F8, D177BB |
| 0x00E726 | 0x01 | IY+16 bit-clear handler, sets transfer-ready after endpoint config | D14008, D14011, D14076, D141BB |
| 0x00F164 | 0x00 | Port 0x3114 init path — clears D14046 bit, sets D1408A, clears D14074 + D176FB | D14046, D14072, D14074, D1408A |
| 0x00F2F0 | 0x00 | Transfer teardown — clears D1776D, D176A8, D14074, D176FB | D14074, D176A8, D176F8 |
| 0x00F481 | 0x01 | Port 0x3138 check — sets D176FB after port validation (CP 0x38 / CP 0x31) | D1407F, D1408B |
| 0x00FB93 | 0x01 | Null-check gate — sets D176FB when pointer comparison succeeds (CALL 0x0021C2 returns NZ) | — |
| 0x00FBF2 | 0x00 | Transfer-active path — sets D14074=1, clears D1772D, clears D176FB | D14074, D1772D, D177B8 |
| 0x00FEC1 | 0x01 | IY+8 handler — sets D176FB, then checks port 0x3030 bit 0 | D13FE7, D141EA, D177B7 |
| 0x013753 | 0x01 | D14073-gated path — sets D176FB when D176F2 pointer is null | D14073, D1407A, D176F2, D17792 |
| **0x0137B5** | **0x01** | **D14078 consumer — clears D14078, sets D176FB=1, calls 0x011576** | **D14078, D14079, D17792** |
| **0x0137D0** | **0x01** | **D14079 consumer — sets D176FB=1, clears D14079** | **D14078, D14079, D17787** |
| **0x0138B6** | **0x01** | **D14078 consumer (path B) — sets D176FB=1, clears D14078** | **D14078, D14079, D17792** |
| **0x0138D1** | **0x01** | **D14079 consumer (path B) — clears D14079, sets D176FB=1, calls 0x01106A** | **D14078, D14079, D17787** |
| 0x0150E5 | 0x00 | Completion handler — updates D176F2, clears D176FB, then checks D176FC | D176BD, D176F2, D176FC |
| 0x02BCCF | 0x00 | Mirror of 0x00F164 — same D14046/D1408A/D14074/D176FB clear pattern | D14046, D14072, D14074, D1408A |
| 0x02BFAA | 0x00 | D177B8==0x01 path — clears D14074 + D176FB + D176F8 after CALL 0x000420 | D14074, D176F8, D177B8 |
| 0x02C0D9 | 0x00 | Mirror of 0x00FBF2 — same D14074=1, D1772D=0, D176FB=0 pattern | D14074, D1772D, D177B8 |
| 0x03B970 | 0x01 | Mirror of 0x00E726 — same IY+16 bit-clear, same endpoint config path | D14008, D14011, D14076, D141BB |
| 0x03CD68 | dynamic | Writes A from IX-19 (computed value, but only 0x00/0x01 based on CP 0x80 branch) | D13FE7, D141EA, D177B7 |
| 0x047EEA | 0x00 | Transfer cleanup — calls CALL 0x000264, stores D176F2, clears D176FB | D14089, D176F2 |
| 0x048450 | 0x00 | Bulk-clear — clears D176EC, D176B1, D176E9, D176FB | D176B1, D176E9, D176F2 |
| 0x048590 | 0x01 | Null-pointer confirmed — sets D176FB=1, writes D1771A=0x000B | D176AB, D1771A |
| 0x049746 | 0x00 | D14046 reset + D14074 clear + D176FB clear path | D14046, D14074, D177B8 |
| 0x04D574 | 0x00 | Cleanup — clears D176F8 + D176FB, then loads D17726 | D176F8, D17726 |
| 0x04DC2C | 0x00 | Mirror of 0x00AA46 — clears D176A8, D176F5, D176FB | D176A8, D176F5, D176F2 |
| 0x04DFB3 | 0x00 | Final cleanup — clears D176F9, D176F8, D176FB, returns | D176F8, D176F9 |
| 0x04E00E | 0x00 | Post-CALL 0x049CCA (arg 0x11) cleanup — clears D176FB | D176F8, D177B8 |
| 0x04E025 | 0x00 | Post-CALL 0x049CCA (arg 0x09) cleanup — clears D176FB + D176F8 | D176F2, D176F8, D177B8 |
| 0x064AFE | 0x00 | Mirror of 0x04E025 — post-0x049CCA cleanup, clears D176FB | D176A8, D176FD, D17726 |

### Reads (4 sites)

| Address | Pattern | What it gates |
|---------|---------|---------------|
| 0x009434 | `LD A,(D176FB) / OR A / JR NZ,+0x7A` | If D176FB set → skip idle polling at 0x009394, jump to active-transfer handler at 0x0094B5 |
| 0x00F274 | `LD A,(D176FB) / OR A / JP NZ,0x00EF8E` | Part of 5-flag idle-guard chain: D17768, D177BA bit 7, **D176FB**, D140B2, D140AF — if ANY nonzero → jump to 0x00EF8E (back to main loop) |
| 0x02BF29 | `LD A,(D176FB) / OR A / JP NZ,0x02B9CC` | Mirror of 0x00F274 — same 5-flag idle-guard chain, same order |
| 0x042999 | `LD A,(D176FB) / OR A / JR NZ,+0x7A` | Mirror of 0x009434 — same idle-skip pattern |

## Idle-Guard Chain (Read Sites at 0x00F274 / 0x02BF29)

The reads at 0x00F274 and 0x02BF29 are part of an identical 5-flag guard chain that prevents the USB subsystem from entering idle/completion processing while any work is pending:

```
LD A,(D17768)    ; check 1: pending interrupt notification
OR A
JP NZ, exit

LD A,(D177BA)    ; check 2: high bit of status register
AND 0x80
JP NZ, exit

LD A,(D176FB)    ; check 3: transfer-ready gate  ← THIS FLAG
OR A
JP NZ, exit

LD A,(D140B2)    ; check 4: completion status enum (0/1/2/4)
OR A
JP NZ, exit

LD HL,(D140AF)   ; check 5: pending callback pointer
CALL null_check
```

D176FB is the **third of five** conditions that must all be zero for the USB subsystem to proceed to idle/sleep state.

## Co-Access Map (Top Frequencies)

| Address | Freq (of 34) | Known Identity |
|---------|-------------|----------------|
| D177B8 | 9 | USB state/mode byte |
| D176F2 | 8 | Transfer pointer / descriptor |
| D176F8 | 7 | Transfer sub-state flag |
| D14074 | 7 | Transfer-active flag |
| D176A8 | 6 | Transfer buffer base |
| D17726 | 6 | Command/status word |
| D17792 | 5 | Staged argument for 0x0155BC |
| D1772D | 5 | Transfer counter/offset |
| D17787 | 5 | Pipe descriptor field |
| D1778A | 5 | Pipe descriptor field |
| D14078 | 4 | Endpoint-configured flag |
| D14079 | 4 | Deferred-transfer-pending flag |
| D1408A | 4 | Port init complete flag |

## Key Functions

| Function | Role |
|----------|------|
| 0x013700 (path A) / 0x0137E9 (path B) | **Deferred-work consumer loop** — checks D14073→D14078→D14079→D1407A in sequence, sets D176FB=1 for D14078/D14079 before calling 0x011576 or 0x01106A |
| 0x011576 | **READY-promoter** — called after D176FB=1, uses D17792 as staged argument, dispatches via 0x0155BC |
| 0x01106A | **Transfer initiator** — called after D176FB=1 on D14079 consume path |
| 0x00F023 (~0x00EF8E loop) | **Main USB processing loop** — reads D176FB as part of 5-flag idle guard |
| 0x00B8B7 | **Reset helper** — bulk-clears D176F8 and D176FB |
| 0x0150C2 | **Completion handler** — clears D176FB after updating D176F2 |

## Conclusion

**D176FB = USB transfer-ready gate flag (boolean)**

- **Set to 1** when a deferred event (D14078/D14079/D1407A consume, endpoint config, port validation) triggers a transfer that needs processing
- **Cleared to 0** when the transfer completes, is cleaned up, or the subsystem resets
- **Read as gate** in 4 sites: prevents idle-state entry while a transfer is active
- Tightly coupled with D14074 (transfer-active), D176F8 (transfer sub-state), and D176F2 (transfer descriptor pointer) — these four are typically cleared together on completion paths
- Part of the 5-flag idle-guard chain alongside D17768, D177BA, D140B2, and D140AF

# Phase 410: Syscall 0x0004A0 -> 0x00F5B0 — Notification Delivery Handler

## Verification

Syscall vector at 0x0004A0 confirmed: `C3 B0 F5 00` = `JP 0x00F5B0`.

## Function Summary

**0x00F5B0 is the notification delivery handler.** It receives a notification parameter block pointer via the first argument (IX+6), validates it through three null-pointer guards, then either:
- (A) Returns immediately with status code 4 if D14084 != 0 (notification system already active), or
- (B) Performs full hardware-level notification delivery with USB/Link port signaling if D14084 == 0.

Return value is in A (loaded from IX-1 before epilogue).

## Control Flow

```
0x00F5B0: Entry — allocate 3 bytes of stack frame (HL = 0xFFFFFD)
  |
  CALL 0x002197 — stack frame setup (EX (SP),IX; adjusts SP by HL)
  |
  Store 0x06 at IX-1 (default return code = 6 "not delivered")
  |
  Load HL = (IX+6) — first argument (notification block pointer)
  CALL 0x0021C2 — null check (SBC HL,0; sets Z if HL==0)
  JP Z, exit_6 — bail if null
  |
  CALL 0x006EAF — hardware status check (IN0 port 0x0F, test bit 7)
  JP Z, exit_6 — bail if hardware not ready
  |
  Load HL = (IY+6) — dereference pointer from notification block
  CALL 0x0021C2 — null check
  JP Z, exit_6 — bail if null
  |
  Clear (IY+26) = 0 — reset status field
  Read A = (IY+24) — notification type byte
  |
  CALL 0x002623 — computed switch/jump (clamp + 3-way table lookup)
  [inline jump table data at 0x00F5F3-0x00F607 — 4 entries, 3 bytes each]
  |
  Load A = (0xD14073) — notification system enabled flag
  JP Z, exit_6 — bail if notifications disabled
  |
  Load A = (0xD14084) — notification system busy flag
  JR Z, 0x00F636 — branch to full delivery if not busy
  |
  [D14084 != 0 path]: return code = 4, exit immediately
  [D14084 == 0 path]: full delivery at 0x00F636
```

## The Full Delivery Path (0x00F636, when D14084 == 0)

This is the hardware notification delivery sequence:

1. **Set notification type** at (IY+25) = 0x04
2. **Store parameter block** at 0xD13FF9 via LD (HL),BC from IX+6
3. **Clear lock flag** at 0xD1440E = 0
4. **USB port manipulation** (SIS-mode I/O):
   - Read port 0x3121 (USB status register)
   - Read port 0x0008, AND with result
   - If bit not set: read port 0x3108, SET bit 0, write back (enable USB notification)
   - Verify port address via CP 0x31 / CP 0x08 sanity checks (RST 0x08 = system error if wrong)
5. **Link port manipulation**:
   - Read port 0x313A, RES bit 3, write back (clear link notification pending)
   - Same port verification pattern
6. **Call notification installer** (0x014E3F) if (IY+15) is non-null:
   - Loads BC from (0xD14410) as parameter
   - 0x014E3F: saves interrupt state, disables interrupts, clears D1440E, calls 0x014EF8 (inner handler), stores parameter block pointer at D14408, clears D14405, copies D14038 -> D1440B, restores interrupts, sets D1440E = 1
7. **Poll for completion**:
   - Read port 0x314A, test bit 3
   - If set: jump to 0x00F6D9 (completion path)
   - If not set: check (IY+15), check D1440F, check D177B7 == 0x55 (magic sentinel)
   - If D177B7 != 0x55 and notification should proceed: clear D14410, return code = 3

## Sub-Functions

| Address | Purpose |
|---------|---------|
| 0x002197 | Stack frame allocator — EX (SP),IX, adjusts SP by HL, jumps to return address |
| 0x0021C2 | Null pointer check — SBC HL,0; sets Z flag if HL == 0 |
| 0x002623 | Computed switch — reads inline jump table from return address, clamps value, returns via EX (SP),IY / EX (SP),HL |
| 0x006EAF | Hardware readiness check — IN0 port 0x0F, tests bit 7 (entry) or bit 6 (alternate entry at 0x006EB6). Returns A=1 if ready, A=0 if not |
| 0x014E3F | Notification state installer — disables interrupts, stores block pointer at D14408, copies link state D14038->D1440B, sets D1440E=1 (lock) |
| 0x014EF8 | Inner notification handler (called by 0x014E3F) — not traced |

## RAM Addresses

| Address | Purpose |
|---------|---------|
| 0xD13FF9 | Notification parameter block storage destination |
| 0xD14038 | Link/USB state (copied to D1440B during install) |
| 0xD14073 | Notification system enabled flag (0 = disabled) |
| 0xD14084 | Notification system busy flag (0 = idle, !=0 = busy) |
| 0xD14405 | Cleared to 0 during install |
| 0xD14408 | Notification block pointer storage |
| 0xD1440B | Saved link state (copied from D14038) |
| 0xD1440E | Notification lock flag (0 = unlocked, 1 = locked) |
| 0xD1440F | Notification delivery status (cleared during install) |
| 0xD14410 | Notification callback parameter (loaded before CALL 0x014E3F) |
| 0xD176FB | Written to 1 by related syscall 0x0004A4 handler |
| 0xD177B7 | Magic sentinel — compared to 0x55 to gate notification delivery |

## I/O Ports Used

| Port | Operation | Purpose |
|------|-----------|---------|
| 0x0F (IN0) | Read bits 7/6 | Hardware readiness (USB/Link controller status) |
| 0x3121 | Read | USB status register |
| 0x0008 | Read + AND | USB notification enable mask |
| 0x3108 | Read/Write | USB notification control — SET bit 0 to enable |
| 0x313A | Read/Write | Link notification control — RES bit 3 to clear pending |
| 0x314A | Read bit 3 | Notification completion polling |

## Return Codes (in A)

| Code | Meaning |
|------|---------|
| 6 | Not delivered (null pointer, hardware not ready, or notifications disabled) |
| 4 | Not delivered (notification system busy — D14084 != 0) |
| 3 | Delivered but timed out waiting for completion |

## Related Syscall 0x0004A4 (0x00FB6E)

The next syscall vector handles notification response/completion:
- Reads fields at IY+27, IY+3, IY+18 from the notification block
- If (IX-3) is null, sets D176FB = 1 (notification acknowledged)
- If (IY+3) is non-null, calls 0x015542 (notification callback dispatch) and 0x002288 (result handler)

## Key Findings

1. **0x00F5B0 is a USB/Link notification delivery syscall** — it sends data to connected devices (another calculator or PC) via the TI-84's USB and link ports.

2. **The 28-byte parameter block from 0x02B373** feeds directly into this hardware delivery pipeline. Field at offset 24 (byte at IY+24) selects the notification type via a computed jump table.

3. **D14084 is the busy flag** — when the notification system is already active, the handler returns code 4 immediately. This prevents re-entrant notification delivery.

4. **D177B7 == 0x55 is a "notification installed" sentinel** — the magic byte gates whether the hardware polling loop proceeds.

5. **The function uses SIS (Short Index Short) mode** for port I/O operations, indicating these are 16-bit Z80-compatible port accesses despite running in ADL mode.

## Probe Artifact

`TI-84_Plus_CE/probe-phase410-trace-00F5B0.mjs` — uses the project's `ez80-decoder.js` in ADL mode for correct disassembly.

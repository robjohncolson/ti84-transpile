# Phase 420: Non-USB Link Port Handlers Report

## Context

Session 418 decoded 0x009B35, the USB/link masked-status service helper. When D177B7 != 0x55 (USB not initialized), it dispatches to one of two link-protocol handlers based on D14073:
- **0x0094C0** when D14073 == 0 (legacy TI link port path)
- **0x0096CB** when D14073 != 0 (USB controller hardware path, non-USB mode)

---

## Function 1: 0x0094C0 — Legacy Link Port ISR Handler

### Boundaries
- **Start**: 0x0094C0
- **End**: 0x0096CA (inclusive)
- **Size**: 523 bytes
- **Structure**: Main loop with `JP NZ,0x0094DC` at 0x0096C2 looping back while D14049 has pending bits. IX stack frame (7 bytes).

### Ports Accessed

All I/O via `IN A,(C)` / `OUT (C),A` with BC holding the port address:

| Port | Direction | Purpose |
|------|-----------|---------|
| 0x3014 | OUT | Link port interrupt acknowledge — writes individual bit masks (0x10, 0x20, 0x02, 0x04, 0x01, 0x08) to clear pending interrupts |
| 0x3014 | IN | Reads current link port interrupt status into D14049 at end of loop |
| 0x3030 | IN | Link port data/control register — reads status bits (bit 7: activity flag, bit 1: RX ready, bit 3: error, bit 0: busy) |
| 0x3030 | OUT | Link port data/control register — read-modify-write to SET/clear status bits |
| 0x3031 | IN | Link port secondary status register — reads bit 0 |

### RAM Variables

| Address | R/W | Purpose |
|---------|-----|---------|
| D14049 | R/W | **Link interrupt status shadow** — read repeatedly to check pending bits; written at end of loop with fresh port 0x3014 read |
| D141EC | R/W | **Link transfer active flag** — loaded as initial pointer, set to 1 when link transfer starts |
| D141BB | R/W | **Link transfer descriptor pointer** — 24-bit pointer to a transfer control block; null-checked via 0x0021C2 |
| D141EA | W | **Link RX status** — set to 0 (receive started) or 1 (busy/pending) |
| D141EB | W | **Link activity flag** — set to 1 when port 0x3030 bit 7 is high |
| D141E7 | R/W | **Link error flag 1** — cleared when port 0x3031 bit 0 goes low |
| D141E8 | R/W | **Link error flag 2** — set to 1 when port 0x3030 bit 7 is high (while previously 0) |
| D143FF | R | **Link protocol state** — compared against 3; if equal, skips clearing D141BB |
| D14035 | R/W | **Link event counter** — incremented when bit 3 interrupt fires (timer/heartbeat) |

### CALL Targets

| Target | Purpose |
|--------|---------|
| 0x002197 | Stack-frame helper (allocates IX frame) |
| 0x0021C2 | HL null-check helper |
| 0x0019B5 | USB ISR handler (called when bit 4 interrupt fires — shared USB/link ISR entry) |
| 0x00ED77 | Link protocol negotiation/handshake function |
| 0x00FE10 | Link transfer dispatch (takes transfer type in BC via stack) |
| 0x00DA8C | Link disconnect/reset handler (called with arg 0 when RX not busy) |
| 0x01322D | Link state transition (called with arg 2 after disconnect) |

### High-Level Behavior

This is the **legacy link port interrupt service routine** for the non-USB TI-Link protocol. It runs as a polling loop:

1. **Read D14049** (shadow of port 0x3014 link interrupt status)
2. **Process each pending interrupt bit** in priority order:
   - **Bit 4 (0x10)**: Calls 0x0019B5 (USB ISR — shared interrupt line)
   - **Bit 5 (0x20)**: Acknowledged (no further action)
   - **Bit 1 (0x02)**: Data received — sets D141EC transfer flag, calls 0x00ED77 (handshake) then 0x00FE10 (dispatch); if D143FF != 3, clears D141BB
   - **Bit 2 (0x04)**: Link port status change — reads port 0x3030 for activity/RX/error bits, handles RX-ready (calls 0x00DA8C + 0x01322D), updates D141EA/D141E7/D141E8
   - **Bit 0 (0x01)**: Transfer complete — checks D141BB descriptor, sets D141EC, calls 0x00ED77 + 0x00FE10
   - **Bit 3 (0x08)**: Timer/heartbeat — increments D14035 counter
3. **Re-read port 0x3014** into D14049 and loop if non-zero
4. **Epilogue**: Restore IX frame and RET

Each bit-acknowledge follows a verification pattern: `OUT (C),A` then checks `B == 0x30, C == 0x14` with `RST 0x08` on mismatch (debug trap / assertion).

---

## Function 2: 0x0096CB — USB Controller Link Handler (Non-USB Mode)

### Boundaries
- **Start**: 0x0096CB
- **End**: 0x0098D1 (inclusive)
- **Size**: 519 bytes
- **Structure**: Linear dispatch with multiple JP forward branches to common exit at 0x0098D1 (RET). No stack frame.

### Ports Accessed

All I/O via `IN A,(C)` / `OUT (C),A`:

| Port | Direction | Purpose |
|------|-----------|---------|
| 0x3100 | IN/OUT | USB controller main status/control register |
| 0x3108 | IN/OUT | USB endpoint control — SET bit 0 |
| 0x3114 | IN/OUT | USB endpoint interrupt — RES bit 0 |
| 0x3120 | IN/OUT | USB FIFO control — SET/RES bit 2, SET bit 3 |
| 0x3130 | IN | USB data register — reads current data byte |
| 0x313C | IN/OUT | USB transfer control — RES bit 1, SET bit 2 |
| 0x313D | IN/OUT | USB transfer status — SET bit 2 |
| 0x314C | IN | USB event register — reads bits 0, 2, 4 |
| 0x314D | IN | USB event register 2 — reads bit 2 |
| 0x31CB | IN/OUT | USB endpoint config — RES bit 7 |
| 0x5005 | IN/OUT | System interrupt controller — SET bit 5 (mask USB interrupts) |

### RAM Variables

| Address | R/W | Purpose |
|---------|-----|---------|
| D14059 | R/W | **USB event accumulator** — ORed with newly detected edges |
| D1405A | W/R | **USB data register shadow** (port 0x3130 snapshot) |
| D1405B | W/R | **USB status register shadow** (port 0x3140 snapshot) |
| D1407B | R/W | **USB reset-detect flag** — set on first SOF detection, cleared after reset sequence |
| D1407C | R/W | **USB connect flag** — set to 1 on bus reset event |
| D1407D | W | **USB active flag** — set to 1 alongside D1407C |
| D1407E | W | **USB endpoint ready flag** — cleared during reset/init |
| D1407F | W | **USB configuration flag** — cleared on bus reset |
| D14084 | W | **USB transfer complete flag** — cleared after SOF event processing |
| D1408C | W | **USB suspend flag** — cleared on bus reset |
| D140AF | W | **USB transfer counter** — cleared (set to 0) during init/reset |
| D140B2 | W | **USB enumeration state** — set to 1 during init, cleared during teardown |
| D14038 | W | **Rolling counter** — cleared to 0 on first SOF (timeout baseline) |
| D14040 | W | **USB buffer pointer** — two bytes cleared to 0 during init/reset |
| D176F8 | W | **USB session flag** — cleared on bus reset |
| D17796 | W | **USB protocol state** — cleared during teardown |
| D177BB | W | **USB/link bridge flag** — cleared on bus reset |

### CALL Targets

| Target | Purpose |
|--------|---------|
| 0x006F31 | USB SOF (Start of Frame) handler |
| 0x00756C | USB bus reset handler (called with arg 0 via stack) |

### High-Level Behavior

This is the **USB controller interrupt handler when USB is NOT fully initialized** (D177B7 != 0x55, D14073 != 0). It handles low-level USB hardware events using the eZ80's built-in USB controller registers (0x31xx range):

1. **Check USB controller present**: Read port 0x3100 bit 2; if not set, mask USB interrupts (port 0x5005 SET bit 5) and return
2. **Snapshot status**: Read ports 0x3140 and 0x3130 into D1405B/D1405A
3. **Edge detection**: Compute newly-set bits: `D14059 |= (~D1405A & D1405B) | D14059_old`. If no events pending (D14059 == 0), mask USB interrupts and return
4. **SOF event** (port 0x314C bit 2): Reset USB controller state (clear bit 3 on port 0x3100, clear bit 7 on port 0x31CB), init FIFO (SET bit 3 on port 0x3120), set D140B2=1, clear D140AF/D14040, configure transfer control (port 0x313C RES bit 1, SET bit 2). On first SOF: set D1407B=1, clear D14038.
5. **SOF processing** (port 0x314D bit 2): If D1407C not set, set D1407B/clear D14038 on first SOF. Acknowledge SOF (port 0x313D SET bit 2), call 0x006F31 (SOF handler), clear D14084
6. **Bus reset** (port 0x314C bit 0): Clear D1408C, set D1407C/D1407D=1, reconfigure FIFO (port 0x3120 RES bit 2, port 0x3108 SET bit 0, port 0x3114 RES bit 0), set D140B2=1, clear D140AF/D14040/D177BB/D176F8/D1407F. If D1407B was set, clear it.
7. **Teardown** (when D1407B==0 && D1407C==0): Clear D1407E/D17796/D140B2/D140AF/D14040
8. **USB not present fallback**: Mask USB interrupts via port 0x5005 SET bit 5

---

## Cross-Function Comparison

| Aspect | 0x0094C0 (func 1) | 0x0096CB (func 2) |
|--------|-------------------|-------------------|
| Size | 523 bytes | 519 bytes |
| Port range | 0x30xx (legacy link) | 0x31xx (USB controller) |
| Structure | Polling loop (re-reads status) | Linear dispatch with forward jumps |
| Stack frame | Yes (IX, 7 bytes) | No |
| CALL count | 7 unique targets | 2 unique targets |
| RAM vars | 12 unique addresses | 17 unique addresses |
| Primary role | Legacy TI-Link serial ISR | USB controller event handler |

### Shared RAM Variables
Both functions are part of the link/USB subsystem but access **disjoint** RAM regions — no shared variables. This confirms they handle completely separate hardware paths (legacy link vs USB controller).

### Port Verification Pattern
Both functions use the same RST 0x08 assertion pattern after port writes: verify B and C still hold the expected port address. This is a debug/integrity check compiled in by the TI SDK — RST 0x08 likely triggers a diagnostic trap if the assertion fails.

---

## Summary

- **0x0094C0** is the TI-Link legacy serial port interrupt handler. It polls D14049 (shadow of port 0x3014) in a loop, processing 6 interrupt sources (USB shared, link status, data RX, port change, transfer complete, timer). It manages link transfers via descriptor pointer D141BB and coordinates with higher-level protocol handlers (0x00ED77 handshake, 0x00FE10 dispatch, 0x00DA8C disconnect).

- **0x0096CB** is the USB controller event handler for non-initialized USB mode. It reads the eZ80's USB peripheral registers (0x31xx), performs edge detection on status changes, and handles three main events: SOF (Start of Frame), SOF processing, and bus reset. It manages USB enumeration state (D140B2) and coordinates with USB-specific handlers (0x006F31 SOF, 0x00756C bus reset).

Both are dispatched by 0x009B35 based on D14073, which selects between legacy link (D14073==0, port 0x30xx) and USB controller (D14073!=0, port 0x31xx) hardware paths.

# Phase 434 — 0x00FBD1: Universal USB Event Callback

## Function Boundaries

| Property | Value |
|----------|-------|
| Start | 0x00FBD1 |
| End | 0x00FE0E (RET at 0x00FE0E) |
| Size | 574 bytes (0x23E) |
| Instructions | 246 |
| Prologue | CALL 0x00218A (__frameset) |
| Epilogue | LD SP,IX; POP IX; RET |

## How It Gets Called

0x00FBD1 has **zero direct CALL sites** in the ROM. It is called exclusively via indirect dispatch:

1. Address stored at RAM slot **D14026** (the universal USB callback pointer)
2. The indirect dispatcher at **0x01322D** reads D14026, null-checks, and dispatches via `JP (IY)` trampoline at 0x002288 (`_indcall`)
3. All 13 callers of 0x01322D pass distinct power-of-two event bitmasks
4. Low-ROM thunk at **0x00063C** contains `JP 0x00FBD1` (for the OS API jump table)

## Bitmask Argument (IX+6)

The function receives a 24-bit bitmask at IX+6 and tests individual bits sequentially. Each bit triggers a distinct handler block:

| Bit | Mask | Meaning | Handler Action |
|-----|------|---------|----------------|
| 2 | 0x04 | Device connect | Set D14074=1 (USB active), clear D1772D/D176FB, dispatch speed-dependent event via 0x00883C |
| 3 | 0x08 | Device disconnect | Clear D14074=0 (USB inactive) with DI protection |
| 7 | 0x80 | Port status change | Call 0x014EF8 (speed negotiation), then attach/detach/reset based on port 0x3082 bit 5 |
| 6 | 0x40 | Suspend/resume | Speed-dependent re-attach or disconnect event |
| 1 | 0x02 | Link ready | If 0x006EB6 returns 0, trigger bus reset via 0x0123AD(0) |
| 11 | 0x0800 | Final cleanup | Clear D14074=0, optional port 0x314C enable for low-speed |

Bits are tested in order: 2, 3, 7, 6, 1, 11. The bit-2 test uses a simple AND on the low byte. The bit-11 test requires `__ibitAND` (0x0021A7) since bit 11 exceeds 8 bits. Each `OR A; SBC HL,HL; LD L,A; CALL __icmpzero` idiom converts the masked result into a Z/NZ flag for conditional branching.

## State Machine Dispatch (0x00883C calls)

All USB events are forwarded to 0x00883C with two stacked arguments: (event_code, sub_event). Nine distinct dispatch calls:

| Call Site | event_code | sub_event | Trigger |
|-----------|-----------|-----------|---------|
| 0x00FC08 | 0x06 | 0x03 | Bit 2, speed < 0x40 (low-speed connect) |
| 0x00FC2A | 0x44 | 0x02 | Bit 2, speed == 0x40 (full-speed connect) |
| 0x00FC44 | 0x81 | 0x10 | Bit 2, speed 0x80..0xBF (high-speed connect) |
| 0x00FC60 | 0x06 | 0x03 | Bit 2, speed >= 0xC0 + port 0x3082 bit 4 set (fallback) |
| 0x00FCF6 | 0x01 | 0x00 | Bit 7, device attached, after port reset sequence |
| 0x00FD3A | 0xC3 | 0x12 | Bit 7, no device — disconnect after clearing endpoints |
| 0x00FD73 | 0x45 | 0x02 | Bit 6, device still attached (resume) |
| 0x00FD8D | 0x80 | 0x10 | Bit 6, no device, speed == 1 (low-speed suspend) |
| 0x00FDAF | 0x84 | 0x11 | Bit 6, no device, speed 6 or 7 (FS/HS suspend) |

## Speed Code (D177B8) Dispatch

The bit-2 handler uses a 4-way speed classification:

```
D177B8 < 0x40          => low-speed   => 0x00883C(0x06, 0x03)
D177B8 == 0x40         => full-speed  => 0x00883C(0x44, 0x02)
D177B8 0x80..0xBF      => high-speed  => 0x00883C(0x81, 0x10)
D177B8 >= 0xC0         => read port 0x3082 bit 4; if set => 0x00883C(0x06, 0x03)
D177B8 == 0xFF         => disconnected (bit-6 handler skips negotiation)
D177B8 == 0x01         => low-speed (bit-6/bit-11 handlers)
D177B8 == 0x06 or 0x07 => full/high-speed (bit-6 handler)
```

## CALL Targets

| Target | Count | Purpose |
|--------|-------|---------|
| 0x00218A | 1 | __frameset — IX frame prologue |
| 0x0021A7 | 1 | __ibitAND — 24-bit bitmask AND test (for bit 11) |
| 0x0021C2 | 6 | __icmpzero — HL==0 test (sets Z flag) |
| 0x006EB6 | 1 | USB link-ready check (returns 0 if ready) |
| 0x00883C | 9 | USB state-machine dispatch (event_code, sub_event) |
| 0x00B9E8 | 1 | USB cleanup/teardown |
| 0x00C9A0 | 1 | USB port enable / final handshake |
| 0x0123AD | 2 | USB host reset / bus-reset trigger |
| 0x014EF8 | 2 | USB port 0x3082 speed/mode negotiation |

## RAM Variables

| Address | Access | Count | Purpose |
|---------|--------|-------|---------|
| D14074 | write8 | 3 | USB active flag (1=active, 0=inactive) |
| D14078-D14081 | write8 | 9 | USB endpoint configuration bytes (cleared on disconnect) |
| D1408D | write8 | 1 | USB endpoint config byte 8 (cleared on disconnect) |
| D176FB | write8 | 1 | USB sub-state tracker B (cleared on connect) |
| D1772D | write8 | 1 | USB sub-state tracker A (cleared on connect) |
| D177B8 | read8 | 9 | USB device speed code |

## Port I/O

| Port | Direction | Purpose |
|------|-----------|---------|
| 0x3082 | IN | USB PHY status — bit 5: device attached, bit 4: secondary attach flag |
| 0x3010 | IN/OUT | USB host control — bits 0, 4, 5 cleared during port-change reset sequence |
| 0x314C | OUT | USB port enable — write 0x01 for low-speed final enable |

The port 0x3010 manipulation in the bit-7 handler follows a deliberate 3-step sequence: clear bit 4, then bit 5, then bit 0. Each write is followed by a port-address verification loop (RST 0x08 assertions checking BC == 0x3010).

## Control Flow

The function is a **flat sequential bitmask dispatcher** with no loops (the RST 0x08 assertion loops are port-verification guards, not algorithmic loops). Each bit handler is a self-contained block that falls through or branches to the next bit test. The bit-7 handler is the largest (0x00FC84-0x00FD43, ~192 bytes) because it contains two sub-paths (device-attached vs. no-device) with the 3-step port reset sequence.

## Hypothesis

0x00FBD1 is the **USB event demultiplexer** — the single point where raw USB hardware interrupts (encoded as bitmask bits by the 13 callers of 0x01322D) are translated into TI-OS USB state machine events (via 0x00883C). It handles the full USB lifecycle:

1. **Connect** (bit 2): activate USB, classify speed, dispatch attach event
2. **Disconnect** (bit 3): deactivate USB (interrupt-safe)
3. **Port change** (bit 7): negotiate speed, reset port bits, dispatch attach/detach
4. **Suspend/Resume** (bit 6): speed-dependent re-attach or suspend notification
5. **Link ready** (bit 1): conditional bus reset
6. **Cleanup** (bit 11): final deactivation, optional low-speed port enable

# Phase 434 — 0x012456 Host-to-Device OTG Transition (Re-Verification)

## Summary

Session 420 decoded 0x012456 as a "host-to-device OTG transition" of 186 bytes. This independent re-trace **confirms both the identification and size**.

## Function Boundaries

| Property | Value |
|----------|-------|
| Start | 0x012456 |
| End (RET) | 0x01250F |
| Size | 186 bytes (0xBA) — **confirmed** |
| Instructions | 91 |
| Prologue | CALL 0x00218A (__frameset) |
| Epilogue | LD SP,IX / POP IX / RET |

## Execution Flow

The function takes two arguments via the stack frame:
- **(IX+9)**: "skip re-init" flag — when nonzero, skips PHY re-init (0x00D9EE) and link teardown (0x3010)
- **(IX+6)**: secondary flag — when nonzero, calls 0x006FAF

### Phase 1: USB Controller Transition (port 0x3080, unconditional)

1. **RES 7** — disable host mode
2. Poll-wait until port settles (RST 8 yield loop)
3. Clear D14082 to 0 (reset OTG state variable)
4. If (IX+9) == 0: **CALL 0x00D9EE(1)** — PHY negotiation / device re-init
5. **SET 5** — enable device mode
6. Poll-wait until port settles
7. **RES 4** — disable VBUS sensing
8. Poll-wait until port settles

### Phase 2: Link Teardown (port 0x3010, conditional on (IX+9) == 0)

1. **RES 5** — clear link control bit 5
2. Poll-wait
3. **RES 4** — clear link control bit 4
4. Poll-wait
5. **RES 0** — clear link enable
6. Poll-wait
7. **CALL 0x0123AD(0)** — notification install/poll wrapper

### Phase 3: Cleanup (unconditional)

- If (IX+6) != 0: **CALL 0x006FAF** (called between phases 1 and 2)
- **CALL 0x006E84** — epilogue cleanup (always called)

## CALL Targets

| Address | Call Site | Description |
|---------|-----------|-------------|
| 0x00218A | 0x012456 | __frameset / IX-frame prologue |
| 0x00D9EE | 0x01247F | PHY negotiation / USB device re-init (158 bytes, known) |
| 0x006FAF | 0x0124B4 | Helper, called if (IX+6) != 0 |
| 0x0123AD | 0x012502 | Notification install/poll wrapper (83 bytes, known) |
| 0x006E84 | 0x012507 | Epilogue cleanup helper |

## Port I/O

| Port | Direction | Bit Operation | Meaning | Condition |
|------|-----------|---------------|---------|-----------|
| 0x3080 | IN/OUT | RES 7 | Disable host mode | Unconditional |
| 0x3080 | IN/OUT | SET 5 | Enable device mode | Unconditional |
| 0x3080 | IN/OUT | RES 4 | Disable VBUS sense | Unconditional |
| 0x3010 | IN/OUT | RES 5 | Clear link bit 5 | (IX+9) == 0 |
| 0x3010 | IN/OUT | RES 4 | Clear link bit 4 | (IX+9) == 0 |
| 0x3010 | IN/OUT | RES 0 | Disable link | (IX+9) == 0 |

Total: 6 IN, 6 OUT instructions. Each write is followed by a poll-wait loop using RST 8 as a yield.

## RAM References

| Address | Access | Site | Description |
|---------|--------|------|-------------|
| D14082 | write8 (= 0) | 0x012470 | USB OTG state variable, cleared at transition start |

No other direct RAM reads/writes. Stack frame variables (IX+6, IX+9) are the function arguments.

## All Callers (8 sites)

| Call Site | Context |
|-----------|---------|
| 0x008542 | 0x008527 USB follow-up helper (port 0x3082 bit 3 branch) |
| 0x008B96 | P2 HID init handler branch |
| 0x008BC5 | P2 HID init handler branch (alternate) |
| 0x008E4E | P4 CDC init handler branch |
| 0x00990D | Priority init chain handler |
| 0x009A77 | Priority init chain handler (branch A) |
| 0x009A99 | Priority init chain handler (branch B) |
| 0x009AE0 | Priority init chain handler (branch C) |

All 8 callers push two arguments onto the stack before CALL 0x012456, consistent with the two-arg frame layout. The callers span USB follow-up (0x008527), HID init (P2), CDC init (P4), and priority init chain handlers — all contexts where a host-to-device role switch would occur.

## Assessment

**Session 420 decode: CONFIRMED.**

- The function is exactly 186 bytes as reported.
- The name "host-to-device OTG transition" accurately describes the behavior: it systematically disables USB host mode (RES 7 on 0x3080), enables device mode (SET 5), removes VBUS (RES 4), and optionally tears down the link layer (0x3010 bits 5, 4, 0).
- The conditional paths controlled by (IX+9) allow a "quick switch" (host bits only, no PHY re-init, no link teardown) versus a "full transition" (PHY re-init + link teardown + notification).
- D14082 being cleared to 0 marks the start of the transition in the USB state machine.
- The 8 callers are spread across USB init priorities and follow-up handlers, consistent with OTG being invoked from multiple USB subsystem paths.

## Probe

Run: `node TI-84_Plus_CE/probe-phase434-trace-012456.mjs`

# Phase 435 — D14074 (USB Active Flag) Reference Trace

**ROM**: TI-84_Plus_CE/ROM.rom  
**Target**: 0xD14074 — single-byte boolean flag ("USB active")  
**Probe**: `probe-phase435-trace-D14074.mjs`

## Summary

| Category | Count |
|----------|-------|
| Reads (LD A,(D14074)) | 3 |
| Writes (LD (D14074),A) | 26 |
| Total references | 29 |

All 29 references use the simple `LD A,(D14074)` / `LD (D14074),A` form — no pair loads, no ED-prefixed instructions, no address-as-immediate loads.

## Write Pattern

Every write follows one of two patterns:

### Pattern 1: Clear to 0 (XOR A; LD (D14074),A) — 23 sites

The dominant pattern. A is zeroed via XOR A immediately before the store. These are USB disconnect / cleanup / teardown paths.

### Pattern 2: Set to 1 (LD A,0x01; LD (D14074),A) — 3 sites

- `0x00FBE8` — in 0x00FBD1 (USB event demultiplexer), bit 2 handler (USB connect)
- `0x012B2A` — in 0x012AC2, after verifying USB descriptor byte == 0x4C, followed by port I/O to 0x5005 (SET bit 5)
- `0x0417B1` — in 0x041749, same descriptor-check + port-write pattern as 0x012B2A (likely a duplicate/variant init path)

One additional "set to 1" site at `0x02C0CF` in function 0x02C0B7, which mirrors the 0x00FBD1 connect handler structure (CALL 0x000138 check, then set flag).

## Read Sites (3 total)

### 1. 0x00BC7B — in function 0x00BC77 (USB-gated descriptor pipeline entry)

```
0x00BC77  CALL 0x00218A       ; setup/lock
0x00BC7B  LD A,(D14074)       ; <<< read
0x00BC7F  OR A
0x00BC80  JP NZ,0x00BE7C      ; USB active → jump to USB descriptor path
0x00BC84  LD BC,0x3138        ; USB inactive → fall through to port I/O
0x00BC8A  OUT (C),A           ; write to port 0x3138
```

**Behavioral gate**: If D14074 is nonzero (USB active), execution jumps to 0x00BE7C — the USB descriptor processing pipeline. If zero, falls through to direct port I/O on port 0x3138, bypassing USB entirely.

### 2. 0x00F1A6 — in function 0x00EFA0 (USB state machine, large function)

```
0x00F1A1  CALL 0x006F4D       ; some USB helper
0x00F1A5  POP BC
0x00F1A6  LD A,(D14074)       ; <<< read
0x00F1AA  OR A
0x00F1AB  JR Z,0xF1BB         ; USB inactive → skip
0x00F1AD  CALL 0x009420       ; USB active → call status handler
```

**Behavioral gate**: After a USB helper call, checks if USB is still active. If active, calls 0x009420 (likely a status/negotiation handler). If inactive, skips past it.

### 3. 0x02BD5E — in function 0x02B806 (large USB state machine, bank 2 copy)

```
0x02BD54  CALL 0x049EE4       ; interrupt-protected call
0x02BD58  POP AF
0x02BD59  JP PO,0x02BD5E      ; skip EI if interrupts were disabled
0x02BD5D  EI
0x02BD5E  LD A,(D14074)       ; <<< read
0x02BD62  OR A
0x02BD63  JP Z,0x02BDE8       ; USB inactive → jump to idle path
0x02BD67  LD A,(D14091)       ; USB active → check D14091 state
```

**Behavioral gate**: After an interrupt-protected operation, checks USB active flag. If active, continues to check D14091 (another USB state byte at offset +0x1D from D14074). If inactive, jumps to an idle/cleanup path at 0x02BDE8.

## Containing Functions (15 distinct)

| Function | Refs | Access | Notes |
|----------|------|--------|-------|
| 0x00FBD1 | 3 | WWW | USB event demultiplexer (session 434) |
| 0x00EFA0 | 5 | WWWRW | Large USB state machine (~900B) |
| 0x02B806 | 6 | WWWWRW | Bank 2 copy of USB state machine |
| 0x02C0B7 | 3 | WWW | Bank 2 USB connect handler |
| 0x00846E | 1 | W | USB cleanup (XOR A before final RET) |
| 0x00A492 | 1 | W | USB init/reset path |
| 0x00BC77 | 1 | R | Descriptor pipeline entry gate |
| 0x00EE1B | 1 | W | USB teardown (checks D177B8 for mode) |
| 0x011F1A | 1 | W | USB event dispatch (calls 0x00883C) |
| 0x012AC2 | 1 | W | USB descriptor validation + port config |
| 0x02A818 | 1 | W | USB init (calls 0x0004BC) |
| 0x02D319 | 1 | W | USB cleanup (calls 0x049CCA) |
| 0x041749 | 1 | W | USB descriptor validation (bank 4) |
| 0x04897F | 1 | W | USB teardown (calls 0x04B713) |
| 0x049656 | 2 | WW | USB state machine (bank 4) |

## Bank Distribution

- **Bank 0** (0x000000–0x03FFFF): 14 references across 8 functions
- **Bank 2** (0x020000–0x02FFFF): 11 references across 4 functions  
- **Bank 4** (0x040000–0x04FFFF): 4 references across 3 functions

Banks 2 and 4 contain parallel copies of USB state machine logic, mirroring bank 0 structures. This is consistent with the TI-OS pattern of duplicating USB handlers across ROM banks for different execution contexts.

## Adjacent RAM Bytes

### D14073 — 52 pattern matches

Heavy traffic. The adjacent byte at D14073 is accessed far more frequently than D14074 itself. The probe classified the first 10 hits — mix of reads and writes. This suggests D14073 is a more actively polled USB state variable (possibly a mode/phase indicator rather than a simple boolean).

### D14075 — 6 pattern matches

Light traffic. 4 writes, 2 reads. Likely another USB state flag in the same struct.

### Struct Layout Hypothesis

D14070–D1409x appears to be a USB state structure:
- D14072: referenced by reads in the state machine (seen at 0x00F16C, 0x02BCD7)
- D14073: heavily referenced (52 hits) — USB mode/phase byte
- D14074: USB active boolean (this analysis)
- D14075: another USB flag (6 refs)
- D14084: USB state byte, often set to 1 alongside D14074 clears (seen at 0x00F037, 0x02BBA0)
- D1408A: USB flag, set to 1 in state transitions (seen at 0x00F15A, 0x02BCC5)
- D14091: checked after D14074 reads (seen at 0x02BD67)
- D14046: USB sub-state, written in same blocks as D14074 (seen at 0x00F154, 0x02BCBF)

## How D14074 Gates OS Behavior

1. **Descriptor pipeline routing** (0x00BC77): The primary behavioral gate. When USB is active, the OS routes through the full USB descriptor pipeline (0x00BE7C). When inactive, it falls through to direct port I/O — a fundamentally different code path.

2. **USB status polling** (0x00F1A6 / 0x02BD5E): After USB operations complete, the flag is checked to decide whether to continue USB-specific processing or fall to an idle state. This prevents the OS from attempting USB communication after a disconnect event.

3. **Write-heavy profile**: 26 writes vs 3 reads indicates D14074 is set/cleared at many state transition points but only checked at a few critical decision nodes. The flag acts as a coarse gate — the detailed USB state lives in adjacent bytes (D14073, D14084, D14091).

## Related Addresses

| Address | Role | Evidence |
|---------|------|----------|
| D177B8 | USB mode byte | Frequently checked (CP 0x01, CP 0x02, CP 0x40, CP 0xC3) near D14074 writes |
| D176FB | USB sub-flag | Cleared alongside D14074 in multiple teardown paths |
| D1772D | USB sub-flag | Cleared alongside D14074 set-to-1 in connect paths |
| D177BA | USB sub-flag | Cleared in descriptor init paths |
| 0x00883C | USB event dispatcher | Called before D14074 clear in 0x011F1A |
| 0x006F4D | USB helper | Called before D14074 read in 0x00EFA0 |
| 0x009420 | Status handler | Called when D14074 is active (read site 2) |

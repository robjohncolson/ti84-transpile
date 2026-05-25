# D14072 USB Speed/Mode Flag -- Trace Report

## Summary
- Total references: 19 (raw 3-byte pattern matches)
- Writes: 8 (all `LD (D14072),A`)
- Reads: 11 (all `LD A,(D14072)`)
- No IX-based or indirect references
- Relationship to D141E6: **distinct** -- no cross-references within functions

## Write Sites

| Address | Value Written | Preceding Context | Notes |
|---------|--------------|-------------------|-------|
| 0x00992E | A = 0x01 (`LD A,01h`) | After `CALL 0x00883C` returns | Sets "connected" after USB state transition recorder |
| 0x0099FC | A = 0x00 (`XOR A`) | After clearing D14076 | Clears flag during USB disconnect/reset sequence |
| 0x00EEF5 | A = 0x01 (`LD A,01h`) | After `IN A,(3082h)`, `AND 20h`, branch if bit 5 set | Port 0x3082 bit 5 gates this -- sets speed=1 when USB hardware reports connected |
| 0x00EEFC | A = 0x00 (`XOR A`) | Else branch of 0x00EEF5 | Clears speed when USB hardware bit 5 not set |
| 0x02B91F | A = 0x01 (`LD A,01h`) | After `IN A,(3082h)`, `AND 20h`, branch if bit 5 set | **Duplicate** of 0x00EEF5 pattern (ROM bank 2 copy) |
| 0x02B926 | A = 0x00 (`XOR A`) | Else branch of 0x02B91F | **Duplicate** of 0x00EEFC pattern (ROM bank 2 copy) |
| 0x04931F | A = 0x01 (`LD A,01h`) | After `CALL` returns | **Duplicate** of 0x00992E pattern (ROM bank 4 copy) |
| 0x0493E8 | A = 0x00 (`XOR A`) | After clearing D14076 | **Duplicate** of 0x0099FC pattern (ROM bank 4 copy) |

### Write Pattern Analysis

There are exactly **2 unique write patterns**, each duplicated across ROM banks:

1. **Port-gated write** (0x00EEF5/0x02B91F): Reads port 0x3082, tests bit 5 (`AND 20h`). If set, writes 1; else writes 0. Also clears D14080 (`XOR A; LD (D14080),A`) before the conditional. Co-occurs with D14074 write at offset -0x2A.

2. **State-transition write** (0x00992E/0x04931F): Sets D14072=1 after the USB state transition recorder (CALL 0x00883C). The corresponding clear (0x0099FC/0x0493E8) zeroes D14072 alongside D14076 during disconnect.

## Read Sites

| Address | Comparison | Branch Direction | Notes |
|---------|-----------|-----------------|-------|
| 0x008ECD | `OR A` (zero test) | JR NZ +0x3A (skip block if nonzero) | Gates USB event dispatch -- skips if D14072=0 |
| 0x00931E | `OR A` (zero test) | JR NZ +0x12 (skip block if nonzero) | Gates USB sub-event 0x20 processing |
| 0x00F16C | `OR A` (zero test) | JR Z +0x25 (skip block if zero) | **Inverted**: enters port 0x3114 reconfiguration only when D14072=1 |
| 0x01291B | `OR A` (zero test) | JR NZ +0x10 (skip block if nonzero) | Gates USB descriptor push (event 0xC1) |
| 0x012940 | `OR A` (zero test) | JR NZ +0x16 (skip block if nonzero) | Gates USB descriptor push (event 0xC2) |
| 0x02BCD7 | `OR A` (zero test) | JR Z +0x64 (skip block if zero) | Bank 2 duplicate of 0x00F16C |
| 0x02F34C | `OR A` (zero test) | JR NZ +0x04 (skip if nonzero) | Returns 1 if D14072=0, else returns 0 -- boolean inversion helper |
| 0x036F54 | `OR A` (zero test) | JR NZ +0x3A (skip block if nonzero) | Bank 3 duplicate of 0x008ECD |
| 0x0414EB | `OR A` (zero test) | JR NZ +0x10 (skip block if nonzero) | Bank 4 duplicate of 0x01291B |
| 0x041510 | `OR A` (zero test) | JR NZ +0x16 (skip block if nonzero) | Bank 4 duplicate of 0x012940 |
| 0x04285F | `OR A` (zero test) | JR NZ +0x12 (skip block if nonzero) | Bank 4 duplicate of 0x00931E |

### Read Pattern Analysis

All 11 reads use `OR A` as a zero test -- **D14072 is treated strictly as a boolean** (0 or 1). No read ever compares it against 2, 3, or any multi-valued constant.

Two gating directions:
- **Skip-if-nonzero** (8 sites): Guard USB event/descriptor processing. When D14072!=0 (connected), these blocks are skipped -- they handle the "not connected" case.
- **Skip-if-zero** (3 sites): Enter USB hardware reconfiguration or return a derived boolean only when D14072=1 (connected).

## Co-Access with D14073/D14074

| D14072 Site | Co-accessed | Relationship |
|-------------|-------------|-------------|
| 0x00992E (write 1) | D14073 write at 0x009A27 | Same function sets both after state transition |
| 0x0099FC (write 0) | D14073 write at 0x009A27 | D14073 written later in same disconnect sequence |
| 0x00EEF5 (write 1) | D14074 write at 0x00EECB | D14074 set just before D14072 in connect path |
| 0x00F16C (read) | D14073 read/write, D14074 read/write | Hub function accesses all three USB state bytes |
| 0x01291B (read) | D14073 read at 0x0128D4 | Both checked before descriptor push |
| 0x02BCD7 (read) | D14073 read/write, D14074 read/write | Bank 2 duplicate of 0x00F16C hub |

**Pattern**: D14072 is always set/cleared alongside or near D14073 and D14074. The three form a coordinated USB state triple:
- **D14072**: USB device physically connected (boolean, port 0x3082 bit 5)
- **D14073**: USB device-connected flag (from session 436: 52 refs, two-level gate with D14074)
- **D14074**: USB active flag (from session 435: 29 refs, gates descriptor pipeline)

## Relationship to D141E6

**Distinct variables with no cross-reference.** None of the four D141E6 write sites (0x00DD61, 0x00DDF9, 0x03AB82, 0x03AC1A) reference D14072 within their function bodies (+/-64 to +256 bytes).

D141E6 stores a 2-bit speed enum from port 0x3082 bits 7:6 (full-speed=0, high-speed=1, etc.), while D14072 stores a 1-bit "USB physically connected" boolean from port 0x3082 bit 5. They read the same port but extract different bitfields.

## Analysis

### What values does D14072 take?
Exactly two: **0x00** (not connected) and **0x01** (connected). All writes are either `LD A,01h; LD (D14072),A` or `XOR A; LD (D14072),A`. All reads test for zero/nonzero only.

### What does it represent in the USB state machine?
**D14072 is a USB physical-connection flag** -- a boolean indicating whether a USB device/host is physically attached to the port. It is:

1. **Set to 1** when port 0x3082 bit 5 indicates a connected device (the hardware "device connected" signal from the USB OTG controller).
2. **Set to 1** by the USB state transition recorder (0x00883C) during connect events.
3. **Cleared to 0** during disconnect sequences (alongside D14076 clear).
4. **Read as a gate** for USB event dispatch, descriptor submission, and hardware reconfiguration -- most code paths skip USB work when D14072=0.

### Naming recommendation
`usb_DeviceConnected` or `usb_PhysicalConnect` -- it is the lowest-level "is anything plugged in" flag, distinct from D14073 (logical device-connected, set after enumeration) and D14074 (USB active/ready for data transfer).

### Dual-bank structure
The 8 write sites and 11 read sites reduce to **4 unique write patterns** and **6 unique read patterns** when accounting for ROM bank duplication:
- Bank 0 (0x00xxxx): primary copies
- Bank 2 (0x02xxxx): duplicates of the port-gated write and hub read
- Bank 3 (0x03xxxx): duplicate of the event-dispatch gate
- Bank 4 (0x04xxxx): duplicates of state-transition writes and descriptor-push gates

# Phase 431 — USB Handler Call Targets Report

**Session**: 431  
**Date**: 2026-05-24  
**Probe**: `probe-phase431-trace-usb-targets.mjs`  
**ROM**: TI-84 Plus CE OS 5.8.2.0029 (4 MB)  

Five functions called from the USB init handler at 0x0089F8 (decoded in session 430) were disassembled and analysed in this session.

---

## 1. 0x00D681 — Descriptor Pipeline Driver

**Size**: 877 bytes (0x00D681 – 0x00D9ED, shared epilogue at 0x00D9E9)  
**Decoded instructions**: 366

### Purpose

This is a large multi-stage USB descriptor pipeline function. It is called from the event 0x46 (ready-gate) path of 0x0089F8, after two calls to the link-ready gate at 0x00DCB6. Its job is to iteratively walk all USB interface descriptors stored in a RAM pool, validate each one via `0x00CD7B` (the descriptor builder), and transmit them to the host one at a time. On failure at any stage it returns `A=0` via the shared epilogue. On full success it returns `A=1`.

### Structure

- **Prologue**: `LD HL,0xFFFFF7 / CALL 0x002197` — 9-byte IX frame (7 locals).
- **Stage 1** (0x00D681–0x00D6BA): First `0x00CD7B` call with 4 pushed args: descriptor index 0, RAM buf `0xD14099`, source buf `0xD141EE`, descriptor type from `D1409F`. Exit on failure.
- **Stage 2** (0x00D6BE–0x00D74C): Writes descriptor headers into two IY-relative structs (pointers from `D13FD8` and `D13FDB`). Calls `0x00DCB6` again (link-ready gate). Copies `D14097` into multiple fields. Wraps `D14097` with `INC + RES 7` (mod-128 increment). Second `0x00CD7B` call (no-data descriptor). Exit on failure.
- **Stage 3** (0x00D751–0x00D788): Delay call `0x014FA0(10)`. Third `0x00CD7B` call with offset=1. Exit on failure.
- **Stage 4 loop** (0x00D78C–0x00D8AB): Iterates over a 256-byte descriptor array at `D140B3`. Index counter in `(IX-3)`, base pointer in `(IX-6)`. For each entry calls `0x00CD7B` with the entry's data. Ends when counter reaches `D141FF` (descriptor count byte).
- **Stage 5** (0x00D8AF–0x00D968): Calls `0x00D33B` (unknown) on the `D140B3` pool. Conditional sub-stage: if `D1435C == 3`, calls `0x007AAE` then `0x00CD7B` with type=4. If `D1408E != 0`, calls `0x007AA1` then `0x00CD7B`.
- **Stage 6** (0x00D968–0x00D9E8): Reads `D141FF`-field count. If nonzero: large additional `0x00CD7B` call with `D1409B = 0x20`, `D1409C = 2`, port 0x03 bit 0 ORed into `D17725`, then shifted via `0x00257F`. Otherwise: `0x01322D(0x100)` or `0x01322D(4)` depending on `(IX-7)` flag.
- **Epilogue** (0x00D9E9): `LD SP,IX / POP IX / RET`.

### CALL Targets

| Address | Count | Role |
|---------|-------|------|
| 0x002197 | 1 | Frame setup helper |
| 0x007A60 | 1 | Unknown init helper |
| 0x012400 | 8 | Unknown — called after every `007A6x/7Ax` "next item" call |
| 0x00CD7B | 9 | Descriptor builder (known from session 429) |
| 0x00DCB6 | 1 | Link-ready gate (known from session 429) |
| 0x007A87 | 1 | Unknown iterator helper |
| 0x014FA0 | 1 | Short delay helper |
| 0x007A6D | 1 | Unknown iterator helper |
| 0x007A7A | 1 | Unknown iterator helper |
| 0x00276B | 1 | Unknown — used to add entry size to pointer |
| 0x00D33B | 1 | Unknown — processes D140B3 pool |
| 0x007AAE | 1 | Unknown |
| 0x007A94 | 1 | Unknown |
| 0x00D2ED | 1 | Unknown — returns count into (IX-3) |
| 0x007AA1 | 1 | Unknown |
| 0x0021C2 | 1 | Compare-HL-zero helper |
| 0x007AC8 | 1 | Unknown |
| 0x00257F | 1 | Bit-shift helper (known as _lshru) |
| 0x01322D | 2 | Unknown — called with arg 4 or 0x100 |

### RAM Variables

| Address | Role |
|---------|------|
| 0xD13FD8 | Pointer to descriptor struct 1 |
| 0xD13FDB | Pointer to descriptor struct 2 |
| 0xD1408E | Flag: extra descriptor stage active |
| 0xD14097 | Descriptor sequence counter (wrapping mod-128) |
| 0xD14099 | Descriptor output buffer pointer |
| 0xD1409B | Descriptor type/status field |
| 0xD1409C | Descriptor subtype field |
| 0xD1409F | Descriptor class/wValue byte |
| 0xD140A0 | Descriptor bMaxPacketSize copy |
| 0xD140B3 | Base of 256-byte descriptor array |
| 0xD141E5 | Mirror of D14097 |
| 0xD141EE | Source buffer pointer (USB data cursor, known from session 430) |
| 0xD141F5 | USB endpoint/class code byte |
| 0xD141F8 | Descriptor type check (0x08 = class) |
| 0xD141F9 | Descriptor subtype check (0xE0) |
| 0xD141FF | Descriptor count (outer loop limit) |
| 0xD1435C | Connection type latch (3 = special mode) |
| 0xD17725 | Port 0x03 bit-field scratch |

### Port I/O

- `IN0 A,(0x03)` — reads hardware interrupt/status byte; bit 0 ORed into `D17725`.

### Return Value

- `A = 1` on complete success (all descriptor stages passed and transmitted).
- `A = 0` on any `0x00CD7B` failure; jumps directly to shared epilogue at 0x00D9E9.

---

## 2. 0x00D9EE — USB PHY Link-Speed Negotiation Helper

**Size**: 158 bytes (0x00D9EE – 0x00DA8B)  
**Decoded instructions**: 69

### Purpose

Reads the USB PHY line state from port 0x3018, then branches on whether the current session's `(IX+6)` context flag is set. If the flag is zero it calls a minimal init helper (`0x00DE0E`). If the flag is nonzero it calls three additional helpers (`0x00DB66`, `0x00DC0E`, `0x00DA8C`). Then, regardless of branch, it reads the link speed registers at ports 0x3015 and 0x3014, computes a 6-bit speed value, saves it to local stack, calls the endpoint bandwidth helper `0x0079E5`, then calls `0x01322D(8)`. Finally it clears three RAM flags (`D14078`, `D1407A`, `D14079`) and returns `A = 1`.

### Structure

- **Prologue**: `LD HL,0xFFFFFE / CALL 0x002197` — 2-byte IX frame.
- **PHY line check** (0x00D9F6–0x00DA04): `LD BC,0x3018 / IN A,(C)` reads PHY status. `CALL 0x0021C2` tests if A is zero. `JR Z` to epilogue (A=1, early success if PHY is not ready for full init).
- **Branch on context** (0x00DA06–0x00DA2F): If `(IX+6) == 0`, call `0x00DE0E` (minimal PHY reset). Else call `0x00DB66(0)`, `0x00DC0E(0)`, `0x00DA8C(0)` (three-stage full init).
- **Speed negotiation** (0x00DA30–0x00DA64): Read port 0x3015 (low byte) and 0x3014 (high byte). Call `0x0026D2` (multiply/combine). Mask result to 6 bits (`AND 0x3F`). Store in `(IX-2)` / `(IX-1)`.
- **Endpoint arm** (0x00DA63–0x00DA75): Push speed value, call `0x0079E5` (endpoint configurator). Push 8, call `0x01322D(8)` (unknown — possibly a timer or DMA threshold).
- **Flag clear** (0x00DA76–0x00DA84): Zero-fill `D14078`, `D1407A`, `D14079`.
- **Return**: `LD A,0x01 / epilogue / RET`.

### CALL Targets

| Address | Role |
|---------|------|
| 0x002197 | Frame setup helper |
| 0x0021C2 | Compare-HL-zero helper |
| 0x00DE0E | Minimal PHY reset (context=0 path) |
| 0x00DB66 | PHY init stage 1 (context≠0 path) |
| 0x00DC0E | PHY init stage 2 (context≠0 path) |
| 0x00DA8C | PHY init stage 3 / self-tail (context≠0 path) |
| 0x007A05 | Unknown init helper |
| 0x0026D2 | 16-bit multiply/combine (known from prior phases) |
| 0x0079E5 | Endpoint bandwidth configurator |
| 0x01322D | Timer/DMA threshold setter |

### RAM Variables

| Address | Role |
|---------|------|
| 0xD14078 | PHY state flag (cleared on success) |
| 0xD14079 | PHY state flag (cleared on success) |
| 0xD1407A | PHY state flag (cleared on success) |

### Port I/O

| Port | Direction | Role |
|------|-----------|------|
| 0x3018 | IN | USB PHY line state register |
| 0x3015 | IN | USB link speed register (low byte) |
| 0x3014 | IN | USB link speed register (high byte) |

### Return Value

- Always returns `A = 1` (unconditional success path — failure is handled upstream by the caller checking the PHY ready flag before calling this function).
- Early exit (PHY not ready): `JR Z` to epilogue still sets `A = 1` and returns.

### Argument Semantics

- `(IX+6)`: context flag — if nonzero, run full three-stage PHY init; if zero, run minimal reset only.

---

## 3. 0x00B8BC — DI-Protected Bulk bzero + Timer Arm

**Size**: 87 bytes (0x00B8BC – 0x00B912)  
**Decoded instructions**: 36

### Purpose

Saves interrupt state, disables interrupts (DI), calls `0x00285F` (_bzero) three times to zero-fill three RAM regions, then writes the caller's tick-count argument (`(IX+6)`) into two timer latches, calls `0x01579B` (the main timer arm function), restores interrupt state (EI if IFF1 was set before DI), and returns.

### Structure

- **No IX frame**: opens with `CALL 0x00218A` (small-frame helper, not the standard `0x002197`). This is a compact function.
- **Save IFF1** (0x00B8C0–0x00B8C2): `LD A,I` captures IFF1 in the P flag. `PUSH AF` saves it.
- **DI** (0x00B8C3): Disable interrupts.
- **Three bzero calls** (0x00B8C4–0x00B8F3):
  1. `0x00285F(0xD176A8, 0x62)` — zeroes 98 bytes at D176A8.
  2. `0x00285F(0xD1770A, 0x60)` — zeroes 96 bytes at D1770A.
  3. `0x00285F(0xD1776A, 0x4D)` — zeroes 77 bytes at D1776A.
- **Timer latch write** (0x00B8F4–0x00B903):
  - `LD BC,(IX+6)` — load 24-bit tick-count argument.
  - `LD (0xD17792),BC` — write to timer target register 1.
  - `LD BC,(IX+6)` again.
  - `LD (0xD176CB),BC` — write to timer target register 2.
- **Timer arm** (0x00B904): `CALL 0x01579B`.
- **Restore IFF1** (0x00B908–0x00B90D): `POP AF / JP PO,skip_ei` — parity-odd means IFF1 was 0, so skip EI. Otherwise `EI`.
- **Epilogue** (0x00B90E–0x00B912): `LD SP,IX / POP IX / RET`.

### CALL Targets

| Address | Count | Role |
|---------|-------|------|
| 0x00218A | 1 | Small-frame helper (no local variables) |
| 0x00285F | 3 | _bzero (known from session 427) |
| 0x01579B | 1 | Main timer arm function |

### RAM Variables (zeroed regions)

| Address | Size | Role |
|---------|------|------|
| 0xD176A8 | 98 bytes | USB recovery state block 1 |
| 0xD1770A | 96 bytes | USB recovery state block 2 |
| 0xD1776A | 77 bytes | USB recovery state block 3 |

### Timer Latches Written

| Address | Value written |
|---------|--------------|
| 0xD17792 | `(IX+6)` — tick count arg (3000 from event 0x47 caller) |
| 0xD176CB | `(IX+6)` — same tick count, second latch |

### Port I/O

None.

### Argument Semantics

- `(IX+6)`: 24-bit tick-count. The caller at event 0x47 passes 3000 (0x0BB8). Both timer latches receive this value.

### Return Value

No explicit return value (A is not set before epilogue). The caller in event 0x47 discards the return and only uses the side effects (zeroed state blocks + armed timer).

---

## 4. 0x0125EA — USB Mode Transition / Port-Ready Gate

**Size**: 191 bytes (0x0125EA – 0x0126A8)  
**Decoded instructions**: 67

### Purpose

Waits for port 0x3082 bit 1 (USB PHY PLL lock or FIFO ready signal) and then submits a status/mode event via `0x00883C`. The function has two major paths depending on bit 6 of RAM byte `D00080+27` (a hardware capability flag):

- **Long-wait path** (bit 6 = 0): Calls `0x014E3F(0x4B0)` — a long blocking wait (1200 ticks). Then spins up to polling port 0x3082 bit 1.
- **Short-spin path** (bit 6 = 1): Loads initial counter `(IX-1) = 0x78` (120 retries). Spins reading port 0x3082 bit 1 with `0x0061E3` (a short delay) between retries.

After the spin resolves, a fall-through at 0x01262E does a final port 0x3082 check. If bit 1 is still 0 (timeout), it overrides the caller's args with `(0xFF, 0x10)` to force a fallback mode. Regardless, it calls `0x00883C` (status reporter) with the accumulated args and clears `D1440E` (notification lock). Finally it checks `D00080+65` bits 4 and 0 (two more capability flags) and conditionally calls `0x01270B` before returning.

### Structure

- **Prologue** (0x0125EA–0x0125F2): `LD HL,0xFFFFFC / CALL 0x002197` — 4-byte IX frame.
- **Arg capture** (0x0125F3–0x012605): Saves `(IX+6)` → `(IX-4)` (first arg = mode byte), `(IX+9)` → `(IX-2)` (second arg = control byte). Initialises `(IX-3) = 1` (success flag), `(IX-1) = 0` (retry counter).
- **Capability branch** (0x012606–0x01260F): `LD IY,0xD00080 / BIT 6,(IY+27)` → `JR Z,longwait`.
- **Short-spin** (0x012611–0x01262C): Counter loop 0x78→0 reading port 0x3082 bit 1.
- **Final check** (0x01262E–0x012643): Re-read port 0x3082 bit 1. If clear: override args to fallback `(0xFF, 0x10)`.
- **Long-wait path** (0x012648–0x012676): Wait 1200 ticks, then poll port 0x3082. Check `D1440F` and `D177B7` (abort flag and sentinel 0x55) to decide whether to continue polling. On timeout: override args to `(0xFF, 0x10)`.
- **Status submit** (0x01267C–0x01268B): `CALL 0x00883C(arg2, arg1)`.
- **Clear lock** (0x012677): `XOR A / LD (0xD1440E),A`.
- **Capability post-check** (0x01268C–0x0126A0): Bits 4 and 0 of `D00080+65`. If either is set skip `0x01270B`.
- **Return value** (0x0126A1): `LD A,(IX-3)` — the success flag (1 if PHY came ready, 0 if it timed out and fell back).
- **Epilogue** (0x0126A4–0x0126A8).

### CALL Targets

| Address | Role |
|---------|------|
| 0x002197 | Frame setup helper |
| 0x0061E3 | Short busy-delay (used inside spin loop) |
| 0x014E3F | Long wait helper |
| 0x00883C | Status/event reporter |
| 0x01270B | Post-mode capability handler |

### RAM Variables

| Address | Role |
|---------|------|
| 0xD00080 | Hardware capability word base (IY base) |
| 0xD1440E | Notification lock (cleared at exit) |
| 0xD1440F | Abort flag (if nonzero, stop waiting for PHY) |
| 0xD177B7 | Armed sentinel (0x55 = USB init still armed; stop polling if ≠ 0x55) |

### Port I/O

| Port | Direction | Sites |
|------|-----------|-------|
| 0x3082 | IN | 3 — short-spin loop, final check, long-wait loop |

### Argument Semantics

- `(IX+6)` (first arg): mode byte. From caller: `0x12` for vendor-control (0xC0 path), `0x10` for standard-control (0xC1/0xC2 path).
- `(IX+9)` (second arg): control byte. From caller: `0xC0` for vendor, `0xFF` for standard.
- If PHY times out, both args are overridden to `(0xFF, 0x10)` before the status call.

### Return Value

- `A = 1`: PHY came ready, submitted the caller's original mode args.
- `A = 0`: PHY timed out, submitted fallback `(0xFF, 0x10)` instead.

---

## 5. 0x012933 — Vendor Control Success Follow-Up

**Size**: 43 bytes (0x012933 – 0x01295D)  
**Decoded instructions**: 18

### Purpose

A short success handler called from event 0xC0 path after `0x0125EA` returns 1. It checks whether a "connection ready" condition holds, and if so emits a mode-change notification event to the OS event layer.

### Structure

- **Connection check** (0x012933–0x012939): `CALL 0x012766` — unknown check that returns a value in A. `OR A / JR Z,pass` — if A is zero the check passed, continue.
- **Failure branch** (0x01293A–0x01293E): If check failed, call `0x012914` (unknown cleanup) then jump to exit.
- **Mode notification** (0x012940–0x01295C): 
  - Load `D14072` (USB/link mode latch). If nonzero, skip (mode already set).
  - Push `0x12` and `0xC2` as args.
  - `CALL 0x00883C` — status reporter with code `(0xC2, 0x12)`.
  - `LD A,0x01 / LD (0xD008A0),A` — set a global "vendor connection active" flag at D008A0.
- **Exit** (0x01295D): `RET`.

### CALL Targets

| Address | Role |
|---------|------|
| 0x012766 | Connection state check |
| 0x012914 | Cleanup / failure handler |
| 0x00883C | Status/event reporter |

### RAM Variables

| Address | Role |
|---------|------|
| 0xD008A0 | Global "vendor connection active" flag |
| 0xD14072 | USB/link mode latch (if nonzero, notification already sent) |

### Port I/O

None.

### Argument Semantics

No arguments. Operates on implicit OS state.

### Return Value

No explicit return value; A is left as-is from the last operation. The caller in event 0xC0 does not use the return.

---

## Key Findings

### 0x00D681: Much Larger Than Expected

At 877 bytes and 9 calls to `0x00CD7B`, this is not a simple "secondary bootstrap stage" but a complete descriptor iteration pipeline. It processes all interface descriptors in the pool at `D140B3`, walking the full descriptor table for one USB connection setup cycle. This is effectively the inner body of a USB enumeration loop.

### 0x00D9EE: Port 0x3014–0x3015 Are Link Speed Registers

The function reads a 16-bit value split across ports 0x3014 (high) and 0x3015 (low), combines them, masks to 6 bits, and passes the result to the endpoint configurator. This identifies 0x3014–0x3015 as the USB link negotiated-speed register pair. The 6-bit mask (`AND 0x3F`) suggests the speed field is encoded in the lower 6 bits.

### 0x00B8BC: Tick-Count Arg Fans Out to Two Timer Latches

The caller's 24-bit arg (3000 in the event 0x47 path) is written identically to both `D17792` and `D176CB`. These are two separate timer comparison registers — one may be the USB recovery timeout, the other a watchdog latch. The three zeroed regions (`D176A8`–`D176CA`, `D1770A`–`D17769`, `D1776A`–`D177B6`) correspond to the three USB recovery state blocks cleaned before the timer is armed.

### 0x0125EA: D177B7 == 0x55 Is the "Session Active" Sentinel

In the long-wait polling loop, the function continues polling only while `D1440F == 0` AND `D177B7 == 0x55`. The sentinel value 0x55 at `D177B7` was previously noted as the "armed sentinel" in session 430; this function confirms it is used as a polling guard — if the sentinel is cleared (USB init was cancelled), the function stops waiting and forces the fallback mode `(0xFF, 0x10)`.

### 0x012933: D008A0 Is the Vendor Connection Flag

The write `LD A,0x01 / LD (0xD008A0),A` at the end of the success path is the only write to `D008A0` identified in this probe. It gates the mode-change notification: if `D14072` is already nonzero the notification is skipped. D008A0 therefore signals to the rest of the OS that a vendor-class USB control session is now active.

---

## New Addresses for Future Decoding

| Address | Priority | Reason |
|---------|----------|--------|
| 0x01579B | High | Timer arm function — called from 0x00B8BC with both latches pre-loaded |
| 0x01270B | High | Post-mode capability handler — called from 0x0125EA after status submit |
| 0x012766 | Medium | Connection state check — called from 0x012933 |
| 0x012914 | Medium | Cleanup / failure handler — called from 0x012933 |
| 0x00DB66 | Medium | PHY init stage 1 — called from 0x00D9EE context≠0 path |
| 0x00DC0E | Medium | PHY init stage 2 — called from 0x00D9EE context≠0 path |
| 0x00DA8C | Medium | PHY init stage 3 — called from 0x00D9EE context≠0 path |
| 0x00DE0E | Low | Minimal PHY reset — called from 0x00D9EE context=0 path |
| 0x00D33B | Low | Processes D140B3 descriptor pool — called once from 0x00D681 |
| 0x00D2ED | Low | Returns descriptor count into (IX-3) — called from 0x00D681 |
| 0x01322D | Low | Called with arg 4, 8, or 0x100 from multiple functions |

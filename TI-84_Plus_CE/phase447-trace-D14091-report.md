# Phase 447 — D14091 Key-Processing Enable Flag: Complete Reference Map

**Date**: 2026-05-26
**Target**: Memory address D14091 (master key-processing enable flag)
**Method**: Full ROM binary scan for byte pattern `91 40 D1` (little-endian 0xD14091)

## Summary

26 total references to D14091 found in the 4MB ROM:
- **16 READ sites** (`LD A,(D14091)`) — all use `OR A` / `JR Z` or `JR NZ` as a gate
- **10 WRITE sites** (`LD (D14091),A`) — 5 write 0x00, 3 write 0x01, 2 write dynamic values

D14091 is cleared to 0x00 during boot at 0x00B729 and remains zero until mode initialization completes. The flag becomes non-zero (0x01) when the OS flag-check function 0x05206E confirms that flag bit 0 at D008A8 is set (OS flag "key processing allowed"). This happens at **three independent write-1 sites**: 0x041ADA, 0x0489EE, and 0x048C26.

---

## All 26 References

### WRITE Sites (10 total)

| # | ROM Address | Value Written | Context | Function Area |
|---|-------------|--------------|---------|---------------|
| W1 | **0x00B729** | 0x00 (XOR A) | Boot init — clears D14091 alongside D14097=1, D14098=0, D14095=0, D14093=0, D176FC=0 | 0x00B69E boot/USB init |
| W2 | **0x02B88E** | 0x00 (XOR A) | USB handler — clears D14091 when D177B7=0x55 (mode active), then clears D1441D and calls 0x05202F | 0x02B850 USB event handler |
| W3 | **0x02BD11** | 0x00 (XOR A) | USB handler 2 — identical pattern to W2: checks D14091≠0, D14092=0, D177B7=0x55, then clears D14091+D1441D | 0x02BCE0 USB event handler 2 |
| W4 | **0x041ADA** | **0x01** (LD A,1) | Mode init path — `CALL 0x05206E` with BC=0x004140 (OS flag check), if NZ then D14091=1 | 0x041A80 mode init |
| W5 | **0x041E14** | 0x00 (XOR A) | USB handler 3 — identical clear pattern (D14091≠0, D14092=0, D177B7=0x55 → clear D14091+D1441D) | 0x041DD0 USB event handler 3 |
| W6 | **0x0489E6** | dynamic (IX-4) | Mode init dispatch case 0 — reads stack frame variable, writes whatever value was computed | 0x04897F mode init dispatch |
| W7 | **0x0489EE** | **0x01** (LD A,1) | Mode init dispatch case 1 — unconditionally writes 1 | 0x04897F mode init dispatch |
| W8 | **0x0489F5** | 0x00 (XOR A) | Mode init dispatch case 2 — unconditionally writes 0 | 0x04897F mode init dispatch |
| W9 | **0x048C26** | **0x01** (LD A,1) | Mode init tail — `CALL 0x05206E` with BC=0x004140, if NZ then D14091=1, else D14091=0 | 0x048AC4 mode init completion |
| W10 | **0x048C2D** | 0x00 (XOR A) | Mode init tail — else branch of W9: if flag check fails, D14091=0 | 0x048AC4 mode init completion |

### READ Sites (16 total)

| # | ROM Address | Gate Logic | Function Area |
|---|-------------|-----------|---------------|
| R1 | **0x02A873** | OR A / JR NZ → proceed with key processing | 0x02A800 key handler |
| R2 | **0x02A983** | OR A / JR Z → skip (D14091=0 blocks) | 0x02A900 key handler |
| R3 | **0x02AFE3** | OR A / JP NZ → enter main processing | 0x02AF88 key/event handler |
| R4 | **0x02B877** | OR A / JR Z → skip USB handler | 0x02B850 USB event handler |
| R5 | **0x02B93A** | OR A / JR NZ → process USB event | 0x02B900 USB event handler |
| R6 | **0x02BCF3** | OR A / JR Z → skip USB handler | 0x02BCE0 USB event handler 2 |
| R7 | **0x02BD67** | OR A / JR NZ → proceed | 0x02BD50 USB handler |
| R8 | **0x02BDE8** | OR A / JR NZ → skip idle check | 0x02BDB0 event loop body |
| R9 | **0x02BE59** | OR A / JR NZ → skip HALT path | 0x02BE40 event loop body |
| R10 | **0x02BED4** | OR A / JR Z → skip processing | 0x02BEB0 event loop body |
| R11 | **0x02BF47** | OR A / JR NZ → process event | 0x02BF30 event loop body |
| R12 | **0x03FA1C** | OR A / JR Z, +0x70 → skip ALL key processing (main gate) | 0x03FA09 key processor |
| R13 | **0x03FBC3** | OR A / JR Z → skip key-to-buffer write | 0x03FBB0 key processor tail |
| R14 | **0x041DFD** | OR A / JR Z → skip USB clear | 0x041DD0 USB handler |
| R15 | **0x04897A** | Standalone getter: `LD A,(D14091); RET` | 0x04897A getter function |
| R16 | **0x0489CC** | OR A / JR NZ → already set path | 0x04897F mode init dispatch |

---

## Critical Read Sites: The Two Key-Processing Gates

### Gate 1: Key Processor Entry (0x03FA1C)
```
0x03FA1C: LD A,(D14091)
0x03FA20: OR A
0x03FA21: JR Z, +0x70        ; skip to 0x03FA93 — exit without processing
```
This is the **primary gate**. The key processor at 0x03FA09 reads a scan code from D00587, then immediately checks D14091. If zero, the entire 531-byte key processor is bypassed. No key ever reaches D141B5.

### Gate 2: Key-to-Buffer Write (0x03FBC3)
```
0x03FBC3: LD A,(D14091)
0x03FBC5: OR A
0x03FBC7: JR Z, +0x1E        ; skip the D141B5 write
0x03FBC9: LD (D141B2),A      ; also copies D14091 value to D141B2
```
This is the **secondary gate** deeper in the key processor. Even if the primary gate passes, this second check ensures D14091 is still non-zero before writing the key code to D141B5. It also copies the D14091 value to D141B2.

---

## Write Site Analysis: When Does D14091 Become Non-Zero?

### Boot Sequence (D14091 = 0x00)

**W1 at 0x00B729**: During boot, the function at 0x00B69E (USB/link recovery init) explicitly clears D14091:
```
0x00B71E: LD A, 0x01
0x00B720: LD (D14097), A      ; D14097 = 1
0x00B724: XOR A
0x00B725: LD (D14098), A      ; D14098 = 0
0x00B729: LD (D14091), A      ; D14091 = 0  ← KEY PROCESSING DISABLED
0x00B72D: LD (D14095), A      ; D14095 = 0
0x00B731: LD (D14093), A      ; D14093 = 0
0x00B735: LD (D176FC), A      ; D176FC = 0
```
Called from the scheduler at 0x001574 and 0x001624 during OS startup.

### Mode Initialization (D14091 → 0x01)

There are **three paths** that set D14091 = 1, all sharing the same pattern:

#### Pattern: OS Flag Check → Conditional Enable

```
LD BC, 0x004140          ; flag index parameter
PUSH BC
CALL 0x05206E            ; check OS flag bit
POP BC
OR A                     ; test result
JR Z, <skip>             ; if flag NOT set, skip (D14091 stays 0)
LD A, 0x01
LD (D14091), A           ; D14091 = 1 — KEY PROCESSING ENABLED
```

The function at 0x05206E tests a specific bit in the OS flag table at D00080. The parameter 0x004140 selects **flag bit 0 of the byte at offset 0x828** (address D008A8). This is an OS-level permission flag that must be set before key processing is allowed.

#### Write-1 Site W4 (0x041ADA) — Mode Init Path A
- Located in function near 0x041A80
- Part of a hardware init sequence (port 0x3130 bit 7 set, port 0x3130 bit 6+7 set)
- After the flag check succeeds: D14091=1, then calls 0x02AF88 (event processor setup)
- No direct callers found for this function entry — likely reached via fall-through or JP from a table

#### Write-1 Site W7 (0x0489EE) — Mode Init Dispatch Case 1
- Inside the mode-init dispatch function at 0x04897F
- This function has a 4-entry dispatch table:
  - **Case 0** (0x0489CC): Conditional — reads current D14091, computes new value from stack frame
  - **Case 1** (0x0489EC): **Unconditionally sets D14091 = 1** ← THIS IS THE "ENABLE" CASE
  - **Case 2** (0x0489F4): Unconditionally clears D14091 = 0 (the "disable" case)
  - **Case 3** (0x0489FB): Sets status=2, does not touch D14091
- Callers of 0x04897F:
  - JP at 0x021E74 (jump table entry — OS API vector)
  - CALL at 0x02BAEB (from D14095 flag check → passes D14095 bits to dispatch)
  - CALL at 0x04B146 (conditional call with BC=1 or BC=0 based on flag)

#### Write-1 Site W9 (0x048C26) — Mode Init Completion
- Inside function 0x048AC4 (mode init completion)
- Same flag-check pattern as W4 (CALL 0x05206E with BC=0x004140)
- If flag set: D14091=1 (W9), else D14091=0 (W10)
- Then clears D14095, D14093, D176FC and calls 0x04985C
- Callers of 0x048AC4:
  - **0x02F6A2** — OS event handler
  - **0x031DB7** — OS event handler
  - **0x03FAED** — key processor (!) — called when D177B7 ≠ 0x55 and ≠ 0xAA
  - **0x04AE9E** — peripheral handler

### USB Reset Paths (D14091 → 0x00)

Three USB handler sites (W2, W3, W5) share an identical pattern that **clears** D14091 back to 0:
```
LD A,(D14091)           ; check if enabled
OR A
JR Z, <skip>            ; already zero, skip
LD A,(D14092)           ; check USB state
OR A
JR NZ, <skip>           ; USB busy, don't clear
LD A,(D177B7)           ; check mode state
CP 0x55                 ; is it "home screen active"?
JR NZ, <skip>           ; not home screen, don't clear
XOR A
LD (D14091), A          ; D14091 = 0 — DISABLE KEY PROCESSING
LD BC, 0x000000
LD (D1441D), BC         ; clear handler table too
```
These USB handler sites disable key processing when a USB event occurs during home-screen mode (D177B7=0x55).

---

## Getter Function (0x04897A)

A tiny 3-byte function serves as the public API for reading D14091:
```
0x04897A: LD A,(D14091)
0x04897E: RET
```
Called from 0x040506 (checks D14091 and sets IY flags accordingly).

---

## Timeline: D14091 During Normal OS Startup

1. **Boot (0x00B69E)**: D14091 = 0x00. Key processing disabled.
2. **Hardware init**: Port configuration, USB state machine setup. D14091 stays 0.
3. **Mode init dispatch** (0x04897F, called via 0x02BAEB or OS API 0x021E74):
   - The dispatch case (0-3) depends on the current D14095 flags and the init parameter
   - **Case 1** unconditionally sets D14091 = 1
   - **Case 0** conditionally sets it based on stack frame computation
4. **Mode init completion** (0x048AC4, called from 0x02F6A2, 0x031DB7, 0x03FAED, 0x04AE9E):
   - Checks D177B7 for mode state (0x55 = home screen needs init)
   - Calls 0x05206E with flag parameter 0x004140
   - If OS flag at D008A8 bit 0 is set → D14091 = 1 (**key processing enabled**)
   - Then clears D14095, D14093, D176FC and enters mode-specific setup

**The critical moment**: D14091 becomes 1 when the OS mode initialization completes and the OS flag table at D008A8 has bit 0 set. In a cold boot, this happens when the home-screen mode finishes initializing — after all hardware setup, USB enumeration, and memory initialization.

---

## Implications for Transpilation

1. **Workflow probes MUST set D14091 = 1** after boot to enable key processing. Without it, the key processor at 0x03FA09 skips all key handling.

2. **The OS flag at D008A8 bit 0** is the upstream control. If this flag is not set during boot, D14091 will never become 1 through normal OS paths. The probe should either:
   - Set D008A8 bit 0 before mode init runs, OR
   - Directly set D14091 = 1 after boot completes

3. **USB events can clear D14091** back to 0 (W2, W3, W5). In the transpiled environment, if USB handling is simulated, these paths could unexpectedly disable key processing.

4. **D14092 acts as a guard** — the USB clear paths only fire when D14092 = 0. Setting D14092 = 1 would prevent USB handlers from clearing D14091.

5. **The mode-init dispatch at 0x04897F** is a 4-way branch. For the transpiled OS to reach the "enable" case (case 1), the init parameter (via `DD 7E 06` = IX+6) must select entry 1 from the dispatch table.

---

## Related Addresses

| Address | Role |
|---------|------|
| D14091 | Master key-processing enable flag (this report) |
| D14092 | USB state guard — prevents D14091 clearing when non-zero |
| D14093 | Mode state flag — cleared alongside D14091 during boot/mode init |
| D14095 | Mode config flags — bits select dispatch case at 0x04897F |
| D14097 | Set to 1 during boot (purpose: mode ready?) |
| D14098 | Cleared during boot (purpose: mode sub-state?) |
| D008A8 | OS flag table byte — bit 0 controls whether D14091 can be set to 1 |
| D00587 | ISR key scan code buffer — source for key processor |
| D141B2 | Receives copy of D14091 value during key-to-buffer write |
| D141B5 | Key code destination buffer — gated by D14091 |
| D1441D | Handler table pointer — cleared alongside D14091 by USB handlers |
| D177B7 | Mode state latch — 0x55 = home screen active, 0xAA = clean |
| 0x05206E | OS flag check function — tests bit in flag table at D00080 |
| 0x04897F | Mode-init dispatch — 4-case handler, case 1 enables D14091 |
| 0x048AC4 | Mode-init completion — conditional D14091 enable via flag check |
| 0x03FA09 | Key processor — 531 bytes, gated by D14091 at entry and at buffer write |

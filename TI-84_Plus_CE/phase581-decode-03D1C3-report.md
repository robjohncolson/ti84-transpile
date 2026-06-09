# Phase 581: Decode 0x03D1C3 -- Real Key Scan Function

## Summary

**0x03D1C3 is NOT the keyboard matrix scanner.** It is a **counter-gated key scan dispatcher** -- a 15-byte wrapper that decrements a timer at D005F5, and when it reaches zero, tail-calls 0x0A32F9 which is the actual **keyboard matrix scan engine** (237 bytes). The hardware port I/O happens deeper, inside sub-calls from 0x0A32F9 (likely 0x08C308 or the 0x0A34xx helpers that read from the keyboard scan result buffers in extended RAM at 0xD4xxxx).

**Architecture**: The keyboard scanning uses a **round-robin group-at-a-time design** -- each call scans one keyboard group (out of 9), storing results into per-group buffers in extended RAM (0xD408A7-0xD422CE). The group index cycles 0..8 at D005F6. A countdown timer at D005F5 (reset to 6 after each scan) rate-limits how often scans occur.

## Function: 0x03D1C3 -- Counter-Gated Key Scan Dispatcher

- **Size**: 15 bytes (0x03D1C3-0x03D1D1)
- **Instructions**: 6
- **Callers**: 1 (CALL at 0x0A27F5 inside the event loop key input wrapper 0x0A27DD)
- **Call chain**: Event loop 0x08C331 -> CALL 0x0A27DD -> CALL 0x03D1C3 -> CALL 0x0A32F9

### Full Annotated Disassembly

```
Address   Hex Bytes          Mnemonic                    Comment
--------  -----------------  --------------------------  ----------------------------------------
0x03D1C3  21 F5 05 D0        LD HL, 0xD005F5             ; Point to scan countdown timer
0x03D1C7  35                 DEC (HL)                    ; Decrement timer
0x03D1C8  C0                 RET NZ                      ; Not time to scan yet -- early return
0x03D1C9  40 2A F6 05        LD HL, (0x0005F6)           ; SIS prefix: 16-bit load from D005F6 (group index) 
0x03D1CD  CD F9 32 0A        CALL 0x0A32F9               ; Call the real keyboard scan engine
0x03D1D1  C9                 RET                         ; Return to caller
```

**Note**: The `0x40` at 0x03D1C9 is the eZ80 SIS prefix (force short/16-bit mode in ADL). The effective address for the load is in the current MBASE page (D0), so it reads from D005F6 -- the current keyboard group index. The value ends up in HL (low byte = group index, high byte = 0 or garbage from D005F7).

### Adjacent Functions (same cluster)

**0x03D1D2 -- IY-based Key Init Wrapper** (17 bytes, 2 callers at 0x032BAB, 0x0351AA)
```
0x03D1D2  FD E5              PUSH IY                     ; Save IY
0x03D1D4  FD 21 80 00 D0     LD IY, 0xD00080             ; Set IY = OS system flags base
0x03D1D9  FD CB 09 B6        RES 6, (IY+9)               ; Clear flag bit 6 at IY+9
0x03D1DD  CD E4 D1 03        CALL 0x03D1E4               ; Call key status update
0x03D1E1  FD E1              POP IY                      ; Restore IY
0x03D1E3  C9                 RET
```

**0x03D1E4 -- Key Status Flag Updater** (25 bytes, 30 callers!)
```
0x03D1E4  FD CB 03 4E        BIT 1, (IY+3)               ; Test "key available" flag?
0x03D1E8  20 0E              JR NZ, 0x03D1F8             ; If set, skip to SET 0
0x03D1EA  FD CB 17 CE        SET 1, (IY+23)              ; Set "need key refresh" flag
0x03D1EE  FD CB 03 4E        BIT 1, (IY+3)               ; Re-test (may have changed via interrupt)
0x03D1F2  20 04              JR NZ, 0x03D1F8             ; If now set, skip
0x03D1F4  FD CB 13 F6        SET 6, (IY+19)              ; Set "key pending" flag
0x03D1F8  FD CB 03 C6        SET 0, (IY+3)               ; Mark "key scan active"
0x03D1FC  C9                 RET
```

**0x03D1FD -- Key Constants** (3 bytes, likely data not a real function)
```
0x03D1FD  3E 05              LD A, 0x05                  ; Constant: 5
0x03D1FF  06 08              LD B, 0x08                  ; Constant: 8
0x03D201  C9                 RET
```

## Function: 0x0A32F9 -- Keyboard Matrix Scan Engine

- **Size**: 237 bytes (0x0A32F9-0x0A33E5)
- **Instructions**: ~70
- **Callers**: 3 (CALL at 0x03D1CD, 0x08BFC9, 0x0A34AA)
- **This is the heavy-weight keyboard scanner.**

### Full Annotated Disassembly

```
Address   Hex Bytes            Mnemonic                    Comment
--------  -------------------  --------------------------  ----------------------------------------
; --- Entry: save interrupt state, disable interrupts ---
0x0A32F9  ED 57                LD A, I                     ; Read interrupt register (sets P/V flag = IFF2)
0x0A32FB  EA 01 33 0A          JP PE, 0x0A3301             ; If interrupts were enabled, skip next
0x0A32FF  ED 57                LD A, I                     ; Re-read (second chance for race condition)
0x0A3301  F3                   DI                          ; Disable interrupts for scan
0x0A3302  F5                   PUSH AF                     ; Save interrupt state (P/V flag) for restore

; --- Save alternate registers, compute table offset ---
0x0A3303  D9                   EXX                         ; Switch to alternate register set
0x0A3304  E5                   PUSH HL                     ; Save HL'
0x0A3305  C5                   PUSH BC                     ; Save BC'
0x0A3306  D9                   EXX                         ; Back to main registers

; --- Index into keyboard group scan table ---
0x0A3307  06 09                LD B, 9                     ; 9 keyboard groups total
0x0A3309  7C                   LD A, H                     ; H = current group index (from caller's HL)
0x0A330A  26 00                LD H, 0                     ; Zero out H
0x0A330C  29                   ADD HL, HL                  ; HL *= 2
0x0A330D  29                   ADD HL, HL                  ; HL *= 4
0x0A330E  29                   ADD HL, HL                  ; HL *= 8 (stride = 8 bytes per group)
0x0A330F  11 4A 34 0A          LD DE, 0x0A344A             ; Table base address
0x0A3313  19                   ADD HL, DE                  ; HL = table_base + group_index * 8
0x0A3314  EB                   EX DE, HL                   ; DE = table entry pointer

; --- Load table entry into HL' ---
0x0A3315  D5                   PUSH DE
0x0A3316  D9                   EXX
0x0A3317  E1                   POP HL                      ; HL' = pointer into scan parameter table
0x0A3318  D9                   EXX

; --- Check display mode flag ---
0x0A3319  F5                   PUSH AF
0x0A331A  CD 08 C3 08          CALL 0x08C308               ; Test BIT 2, (D000C6) -- display mode flag
0x0A331E  28 4F                JR Z, 0x0A336F              ; Z = normal mode (path B), NZ = split mode (path A)

; ============ PATH A: Split-screen / graph mode ============
0x0A3320  F1                   POP AF
0x0A3321  ED 5B CC 2A D0       LD DE, (0xD02ACC)           ; Load current scan result word
0x0A3326  0E 40                LD C, 0x40                  ; Default mask = 0x40
0x0A3328  B7                   OR A                        ; Test A (group index)
0x0A3329  28 02                JR Z, 0x0A332D              ; If group 0, keep mask 0x40
0x0A332B  0E FF                LD C, 0xFF                  ; Otherwise mask = 0xFF (all bits)

; --- Scan 8 keyboard groups in split-screen mode ---
; Each LD HL, addr / CALL pattern writes scan data to RAM buffers
0x0A332D  21 A7 08 D4          LD HL, 0xD408A7             ; Group 0 buffer (split mode)
0x0A3331  CD 2F 34 0A          CALL 0x0A342F               ; Process 5 entries (16-bit writes)
0x0A3335  21 E7 09 D4          LD HL, 0xD409E7             ; Group 1 buffer
0x0A3339  CD 2F 34 0A          CALL 0x0A342F               ; 5 entries
0x0A333D  21 25 0B D4          LD HL, 0xD40B25             ; Group 2 buffer
0x0A3341  CD 1A 34 0A          CALL 0x0A341A               ; 2+2 entries (byte writes)
0x0A3345  21 65 0C D4          LD HL, 0xD40C65             ; Group 3 buffer
0x0A3349  CD 1A 34 0A          CALL 0x0A341A               ; 2+2 entries
0x0A334D  21 A5 0D D4          LD HL, 0xD40DA5             ; Group 4 buffer
0x0A3351  CD 1A 34 0A          CALL 0x0A341A               ; 2+2 entries
0x0A3355  21 E5 0E D4          LD HL, 0xD40EE5             ; Group 5 buffer
0x0A3359  CD 1A 34 0A          CALL 0x0A341A               ; 2+2 entries
0x0A335D  21 27 10 D4          LD HL, 0xD41027             ; Group 6 buffer
0x0A3361  CD 2F 34 0A          CALL 0x0A342F               ; 5 entries
0x0A3365  21 67 11 D4          LD HL, 0xD41167             ; Group 7 buffer
0x0A3369  CD 2F 34 0A          CALL 0x0A342F               ; 5 entries
0x0A336D  18 5B                JR 0x0A33CA                 ; Skip to epilogue

; ============ PATH B: Normal/home-screen mode ============
0x0A336F  F1                   POP AF
0x0A3370  ED 5B CC 2A D0       LD DE, (0xD02ACC)           ; Load current scan result word
0x0A3375  01 E0 FF 00          LD BC, 0x00FFE0             ; Default mask = 0xFFE0 (24-bit)
0x0A3379  FD CB 42 46          BIT 0, (IY+66)              ; Test extended keyboard flag
0x0A337D  28 04                JR Z, 0x0A3383              ; If not set, skip
0x0A337F  01 A8 FE 00          LD BC, 0x00FEA8             ; Alternate mask
0x0A3383  B7                   OR A                        ; Test A (group index)
0x0A3384  28 04                JR Z, 0x0A338A              ; If group 0, keep mask
0x0A3386  01 FF FF 00          LD BC, 0x00FFFF             ; Otherwise full mask

; --- Scan 8 keyboard groups in normal mode ---
; Uses wider buffers (stride ~640 bytes vs ~320 for split mode)
0x0A338A  21 4E 11 D4          LD HL, 0xD4114E             ; Group 0 buffer (normal mode)
0x0A338E  CD FB 33 0A          CALL 0x0A33FB               ; Process 5 entries (16-bit writes)
0x0A3392  21 CE 13 D4          LD HL, 0xD413CE             ; Group 1 buffer
0x0A3396  CD FB 33 0A          CALL 0x0A33FB               ; 5 entries
0x0A339A  21 4A 16 D4          LD HL, 0xD4164A             ; Group 2 buffer
0x0A339E  CD E6 33 0A          CALL 0x0A33E6               ; 2+2 entries
0x0A33A2  21 CA 18 D4          LD HL, 0xD418CA             ; Group 3 buffer
0x0A33A6  CD E6 33 0A          CALL 0x0A33E6               ; 2+2 entries
0x0A33AA  21 4A 1B D4          LD HL, 0xD41B4A             ; Group 4 buffer
0x0A33AE  CD E6 33 0A          CALL 0x0A33E6               ; 2+2 entries
0x0A33B2  21 CA 1D D4          LD HL, 0xD41DCA             ; Group 5 buffer
0x0A33B6  CD E6 33 0A          CALL 0x0A33E6               ; 2+2 entries
0x0A33BA  21 4E 20 D4          LD HL, 0xD4204E             ; Group 6 buffer
0x0A33BE  CD FB 33 0A          CALL 0x0A33FB               ; 5 entries
0x0A33C2  21 CE 22 D4          LD HL, 0xD422CE             ; Group 7 buffer
0x0A33C6  CD FB 33 0A          CALL 0x0A33FB               ; 5 entries

; ============ EPILOGUE: Reset timer, advance group index ============
0x0A33CA  3E 06                LD A, 6                     ; Reset countdown to 6
0x0A33CC  32 F5 05 D0          LD (0xD005F5), A            ; Store to timer
0x0A33D0  3A F6 05 D0          LD A, (0xD005F6)            ; Read current group index
0x0A33D4  3C                   INC A                       ; Next group
0x0A33D5  FE 09                CP 9                        ; Reached end?
0x0A33D7  38 01                JR C, 0x0A33DA              ; No -- keep it
0x0A33D9  AF                   XOR A                       ; Yes -- wrap to 0
0x0A33DA  32 F6 05 D0          LD (0xD005F6), A            ; Store updated group index

; --- Restore alternate registers ---
0x0A33DE  D9                   EXX
0x0A33DF  C1                   POP BC                      ; Restore BC'
0x0A33E0  E1                   POP HL                      ; Restore HL'
0x0A33E1  D9                   EXX

; --- Restore interrupt state ---
0x0A33E2  F1                   POP AF                      ; Restore flags (P/V = were interrupts on?)
0x0A33E3  E0                   RET PO                      ; If interrupts were off, return without EI
0x0A33E4  FB                   EI                          ; Interrupts were on -- re-enable
0x0A33E5  C9                   RET
```

## Helper Functions

### 0x0A342F / 0x0A3433 -- 16-bit Write to Scan Buffer (split mode)

Reads a byte from the parameter table (via HL'), tests bit 7 (ADD A,A sets carry if bit 7 set).
- If bit 7 clear: writes DE (scan result) as 16-bit LE to (HL), advances HL by 2.
- If bit 7 set: writes BC (mask) as 8-bit to (HL), advances HL by 1.
- Loops B' times (5 for 0x0A342F, 2+2 for 0x0A341A).

### 0x0A33FB / 0x0A33FF -- 16-bit Write to Scan Buffer (normal mode)

Same logic as above but writes DE as 16-bit LE (2 bytes) or BC as 16-bit LE (2 bytes) depending on the carry flag from the table byte.

### 0x0A33E6 / 0x0A341A -- Mixed-Width Write (both modes)

Calls the base helper twice with B'=2, advancing HL by a stride between the two halves.

### 0x08C308 -- Display Mode Flag Checker (10 bytes)

```
0x08C308  E5                   PUSH HL
0x08C309  21 C6 00 D0          LD HL, 0xD000C6
0x08C30D  CB 56                BIT 2, (HL)                 ; Test split-screen mode flag
0x08C30F  E1                   POP HL
0x08C310  C9                   RET                         ; Z=normal, NZ=split
```

## RAM Addresses Referenced

| Address | Description | Access |
|---------|-------------|--------|
| D000C6 | Display mode flags (bit 2 = split-screen) | Read (via 0x08C308) |
| D005F5 | Key scan countdown timer (init 1, reset to 6) | Read/Write |
| D005F6 | Current keyboard group index (0-8) | Read/Write |
| D02ACC | Current scan result word | Read |
| D00080 | OS system flags base (IY base in 0x03D1D2) | Address |
| D408A7-D41167 | Split-mode scan buffers (8 groups, ~320B spacing) | Write |
| D4114E-D422CE | Normal-mode scan buffers (8 groups, ~640B spacing) | Write |

## IY+Offset Flags Touched

| IY+Offset | Operation | Context | Meaning |
|-----------|-----------|---------|---------|
| IY+3 bit 1 | BIT (test) | 0x03D1E4 | Key available flag |
| IY+3 bit 0 | SET | 0x03D1E4 | Key scan active |
| IY+9 bit 6 | RES | 0x03D1D2 | Clear (purpose TBD) |
| IY+18 bit 0 | SET | 0x0A27DD | Key scan requested |
| IY+18 bit 0 | RES | 0x0A349E | Clear key scan requested |
| IY+19 bit 6 | SET | 0x03D1E4 | Key pending flag |
| IY+23 bit 1 | SET | 0x03D1E4 | Need key refresh |
| IY+27 bit 6 | BIT (test) | 0x0A27DD | Guard flag for key scan |
| IY+66 bit 0 | BIT (test) | 0x0A32F9 | Extended keyboard flag |

## CALL Targets

| From | Target | Description |
|------|--------|-------------|
| 0x03D1CD | 0x0A32F9 | Keyboard matrix scan engine |
| 0x03D1DD | 0x03D1E4 | Key status flag updater |
| 0x0A331A | 0x08C308 | Display mode flag checker |
| 0x0A3331+ | 0x0A342F | 5-entry 16-bit write (split mode) |
| 0x0A3341+ | 0x0A341A | 2+2 entry byte write (split mode) |
| 0x0A338E+ | 0x0A33FB | 5-entry 16-bit write (normal mode) |
| 0x0A339E+ | 0x0A33E6 | 2+2 entry byte write (normal mode) |

## Caller Analysis

### 0x03D1C3 (this function)
- 1 caller: CALL at 0x0A27F5 (inside event loop key input wrapper 0x0A27DD)

### 0x0A32F9 (the scan engine)
- 3 callers:
  - CALL at 0x03D1CD (from 0x03D1C3, the counter-gated wrapper)
  - CALL at 0x08BFC9 (likely an alternate event loop path)
  - CALL at 0x0A34AA (from 0x0A3498, an alternate key scan entry with HL=9)

### 0x03D1E4 (key status flag updater)
- 30 callers (widespread across the OS: 0x04Axxx, 0x059xxx, 0x06Bxxx-0x06Fxxx key subsystem, 0x07Fxxx, 0x085xxx, 0x08Axxx, 0x095xxx, 0x09Axxx, 0x09Cxxx, 0x0AFxxx, 0x0B1xxx, 0x0B6xxx, 0x0BAxxx, 0x0BCxxx)

## Architectural Analysis

### What Does 0x03D1C3 Do?

0x03D1C3 is **not** `_GetCSC` (which is at 0x03FA09). It is a **counter-gated key scan dispatcher** that:

1. Decrements a countdown timer at D005F5
2. If the timer has not reached zero, returns immediately (rate limiting)
3. When the timer reaches zero, loads the current keyboard group index from D005F6 and calls 0x0A32F9

### What Does 0x0A32F9 Do?

0x0A32F9 is the **keyboard matrix scan engine**. It does NOT directly read keyboard hardware ports (no IN instructions in its body). Instead, it:

1. Saves interrupt state and disables interrupts
2. Computes an offset into a parameter table at 0x0A344A based on the group index (H register, stride 8)
3. Checks display mode via BIT 2, (D000C6):
   - **Split-screen mode** (NZ): Uses buffers at 0xD408A7-0xD41167 with ~320-byte spacing, calls 0x0A342F/0x0A341A
   - **Normal mode** (Z): Uses buffers at 0xD4114E-0xD422CE with ~640-byte spacing, calls 0x0A33FB/0x0A33E6
4. Reads scan results from D02ACC and applies masks (0x40/0xFF for split, 0xFFE0/0xFEA8/0xFFFF for normal)
5. Uses a table-driven approach to write scan data into per-group RAM buffers
6. After scanning one group, resets the timer to 6 and advances the group index (wraps 8->0)
7. Restores interrupt state

### Key Scan Design

The TI-84 CE OS uses a **round-robin, one-group-per-call** keyboard scanning design:

- **9 keyboard groups** (B=9 at entry, index 0-8)
- **6-tick rate limit** between scans (countdown at D005F5)
- **Table-driven buffer writes** using parameter data at 0x0A344A
- **Dual buffer sets**: separate buffers for split-screen (graph) vs normal (home) display modes
- **Pre-computed scan results** at D02ACC (the actual hardware read likely happens elsewhere, perhaps in the interrupt handler)

The scan data flows: Hardware ports -> D02ACC -> 0x0A32F9 distributes to per-group buffers in 0xD4xxxx -> higher-level key processing reads those buffers.

### Relationship to _GetCSC (0x03FA09)

0x03D1C3 does **not** call _GetCSC. They are parallel subsystems:
- 0x03D1C3/0x0A32F9 = low-level matrix scan (distributes raw scan data to buffers)
- 0x03FA09 = high-level key code retrieval (returns processed scan codes to the caller)

The event loop calls both: first 0x0A27DD (which calls 0x03D1C3 for the matrix scan), then processes the results through the key dispatch cascade at 0x08C331.

### Scan Parameter Table at 0x0A344A

8 bytes per keyboard group, 9 groups = 72 bytes. Each byte's bit 7 determines write mode:
- Bit 7 clear (0x00-0x7F): write the scan result (DE) as 16-bit LE
- Bit 7 set (0x80-0xFF): write the mask (BC) as the masked value

Table contents (hex):
```
Group 0: 50 50 F0 F0 F0 F0 50 50
Group 1: A8 A8 30 F0 F0 C0 A8 A8
Group 2: 98 98 F0 F0 C0 F0 C8 C8
Group 3: B8 B8 30 C0 30 C0 E8 E8
Group 4: 78 78 C0 30 C0 30 F0 F0
Group 5: F0 F0 30 C0 30 C0 78 78
Group 6: E8 E8 C0 30 C0 30 B8 B8
Group 7: D0 D0 F0 C0 30 F0 58 58
Group 8: A8 A8 00 00 00 00 00 00
```

All table bytes have bit 7 set (values >= 0x80 or exactly 0x00 with special handling), meaning most writes use the mask rather than the raw scan result. This suggests the table encodes **key debounce thresholds or scan timing parameters** rather than simple copy instructions.

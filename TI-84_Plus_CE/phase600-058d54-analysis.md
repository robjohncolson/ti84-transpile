# Phase 600: Static Decode of 0x058D54 (Key Type Classifier)

## Overview

Address 0x058D54 is the key type classifier function. It is called from:
- **Command handler**: 0x05899D calls it directly, then dispatches on the return value with cascading CP comparisons (0x0E, 0x0F, 0x21, etc.)

The function at 0x0587E9 (convergence point) does NOT call 0x058D54 directly — it calls 0x058B73 (the 11-byte type-7 check). The CP 0x05 at 0x0587F3 splits on 0x058B73's return value, routing type >= 5 to the command path at 0x05884C, which eventually reaches 0x05899D -> 0x058D54.

## Decoded Listing: 0x058D54

```
0x058d54  cd c6 8e 05               CALL 0x058EC6       ; flag setup helper
0x058d58  fd cb 45 be               RES 7,(IY+69)       ; clear flag
0x058d5c  cd a8 00 08               CALL 0x0800A8       ; OS bcall
0x058d60  28 27                     JR Z, 0x058D89      ; if Z -> skip to cleanup
0x058d62  f5                        PUSH AF
0x058d63  3e 0a                     LD A, 0x0A          ; load constant 10
0x058d65  32 05 25 d0               LD (0xD02505), A    ; store to RAM
0x058d69  40 ed 5b 53 11            LD DE, (0x001153)   ; load table pointer
0x058d6e  16 00                     LD D, 0x00          ; clear D (DE = 16-bit value)
0x058d70  cd 41 d3 0b               CALL 0x0BD341       ; OS table lookup helper
0x058d74  3a 85 26 d0               LD A, (0xD02685)    ; load result byte
0x058d78  32 87 26 d0               LD (0xD02687), A    ; copy to adjacent location
0x058d7c  cd 8d 9a 06               CALL 0x069A8D       ; OS processing helper
0x058d80  fd cb 0c a6               RES 4,(IY+12)       ; clear flag bit
0x058d84  cd 65 8c 05               CALL 0x058C65       ; flag/display update
0x058d88  f1                        POP AF
0x058d89  fd cb 01 9e               RES 3,(IY+1)        ; clear flag bit
0x058d8d  c9                        RET                  ; *** FUNCTION END ***
```

Total: 58 bytes (0x058D54 - 0x058D8D inclusive). Bytes after 0x058D8D are a DIFFERENT function.

## Function Structure

```
0x058D54: CALL 0x058EC6          ; setup (clear bit 5 of (IY+83), check bit 7)
          RES 7,(IY+69)          ; clear a mode flag
          CALL 0x0800A8          ; OS query -- returns Z/NZ
          JR Z, cleanup          ; if Z: nothing to do
          PUSH AF                ; save flags/accumulator (type code)
          LD A, 0x0A             ; constant 10 -> RAM location D02505
          LD DE, table_ptr       ; setup for table lookup
          CALL 0x0BD341          ; table-driven lookup
          LD A, (D02685)         ; read result
          LD (D02687), A         ; store copy
          CALL 0x069A8D          ; process result
          RES 4,(IY+12)          ; clear flag
          CALL 0x058C65          ; display/flag update
          POP AF                 ; restore type code
cleanup:
          RES 3,(IY+1)           ; clear flag
          RET
```

## Key Findings

### 1. No CP Instructions in 0x058D54 Itself

The function contains ZERO CP (compare) instructions. It is NOT a classifier that directly compares type codes. Instead, it:
- Calls OS helpers to perform the classification
- The type code arrives via the A register from the CALL at 0x0800A8
- The calling code (0x05899D) is where the CP cascade happens

### 2. The Real Classification Cascade is at 0x05899D

```
0x05899d  CALL 0x058D54          ; get type code in A
0x0589a1  CP 0x0E                ; type 14?
0x0589a3  JR NZ, +9
0x0589a5  CALL 0x0581A3          ; handle type 14
0x0589a9  CALL 0x05E402
0x0589ad  RET

0x0589ae  CP 0x0F                ; type 15?
0x0589b0  JR NZ, +9
0x0589b2  CALL 0x0581A3          ; handle type 15
0x0589b6  CALL 0x05E42A
0x0589ba  RET

0x0589bb  CP 0x21                ; type 33?
0x0589bd  JR NZ, +38
...
0x0589ca  CALL 0x058D54          ; re-call classifier (second pass)
```

### 3. RAM Locations Used

| Address    | Purpose |
|------------|---------|
| D02505     | Receives constant 0x0A (lookup parameter) |
| D02685     | Result byte from table lookup |
| D02687     | Copy of result byte |
| (IY+69)    | Mode flag, bit 7 cleared |
| (IY+12)    | Flag, bit 4 cleared |
| (IY+83)    | Flag, bits 5/7 managed by 0x058EC6 |
| (IY+1)     | Flag, bit 3 cleared on exit |

### 4. Followed Subroutines

**0x058EC6** (flag setup, 19 bytes):
- RES 5,(IY+83) -- clear flag
- BIT 7,(IY+83) -- test flag
- RET Z -- return if clear
- PUSH AF / CALL 0x0997ED / POP AF -- call handler if bit 7 set
- RES 7,(IY+83) -- clear bit 7
- RET

**0x058C65** (flag/display update, 29 bytes):
- CALL 0x0800A8 -- OS query
- RET NZ -- early return if nonzero
- CALL 0x058C83 -- sub-helper
- CALL 0x0800B8 -- another OS query
- CALL NZ 0x0583EE -- conditional handler
- SET 5,(IY+12) / RES 4,(IY+5) / RES 1,(IY+69)
- RET

**0x058D2E** (NOT part of 0x058D54; separate function at 0x058D8E):
- LD HL, 0x2E (46 decimal, '.' character?)
- CALL 0x07FF91
- CALL 0x0846EA
- RET

**0x058B5C** (cursor math helper, NOT part of 0x058D54):
- LD HL, 0 / JR to middle
- Loads from D0243A, D02437
- SBC HL,DE
- Stores to D02435
- RET

### 5. Architectural Interpretation

0x058D54 is a **key action executor**, not a pure classifier. Its job is:
1. Check/clear mode flags (0x058EC6 setup)
2. Query the OS for key status (0x0800A8)
3. If a key is pending: look up its action in a table (0x0BD341 with param 0x0A)
4. Copy the result to RAM (D02685 -> D02687)
5. Process the result (0x069A8D)
6. Update display/mode flags (0x058C65)
7. Return with A = type code (from the PUSH/POP AF around the body)

The actual type-code CLASSIFICATION happens upstream:
- **0x058B73** classifies raw key codes into types 1-7+ (11-byte function)
- **0x0587F3** (CP 0x05) splits character types (1-4) from command types (5+)
- **0x05899D** dispatches specific command types (0x0E, 0x0F, 0x21) using the value from 0x058D54

### 6. Correction to Context

The description "0x058D54 is the REAL key type classifier" is partially misleading. It is better described as the **key action processor** -- it executes the action associated with a key (table lookup + side effects), while the type classification is done by 0x058B73 and the dispatching by 0x05899D's CP cascade.

## Second Function: 0x058D8E (Separate, After RET)

The bytes after the RET at 0x058D8D belong to a completely separate function:
```
0x058d8e  CALL 0x058D2E          ; load '.' (0x2E) + helpers
0x058d92  CALL NC, 0x082642
0x058d96  CALL 0x07FF7B
0x058d9a  CALL 0x08384F
0x058d9e  CALL NC, 0x08267D
0x058da2  CALL 0x058B5C          ; cursor math helper
0x058da6  JP 0x082448            ; tail jump (never returns here)
```

This is a text/cursor manipulation function (loads '.', adjusts cursor positions via 0x058B5C which references D0243A/D02437).

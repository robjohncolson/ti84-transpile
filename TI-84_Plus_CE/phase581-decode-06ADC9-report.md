# Phase 581: Decode 0x06ADC9 & 0x06ADD1 — Graph CALC Result Handlers

## Summary

| Property | Value |
|----------|-------|
| Entry 1 | 0x06ADC9 (keys 0x89/0x8B) — 8 bytes, 3 insns, falls through to 0x06AD91 |
| Entry 2 | 0x06ADD1 (key 0x8D) — 36 bytes to JP 0x06AE01, 14 insns |
| Shared core | 0x06AD91..0x06ADC8 — 56 bytes, 16 insns |
| Helper 0x06ADF5 | 10 bytes, 4 insns — set D026B1=3, call 0x06AE05 |
| Helper 0x06AE05 | 47 bytes to RET at 0x06AE33, 16 insns — graph display setup |
| Helper 0x06AE96 | 7 bytes, 3 insns — print space char via 0x0A23E5 |
| Helper 0x06AE9D | 28 bytes, 13 insns — null-terminated string printer |
| String table | 0x06AEB9..0x06AF55, 14 strings |
| Exit stub 0x06C8AB | 9 bytes, 3 insns — reset coord sentinel + RET |
| Total function group | 0x06AD7E..0x06AEB8 (321 bytes code) + string table |

**Architectural role**: These are **graph CALC menu result handlers** in the TI-84 CE OS. They handle post-calculation display for graph analysis functions (Zero, Minimum, Maximum, Intersection, etc.). Key 0x8D ("MODE" in this context, actually a CALC result action) triggers "STORE RESULTS?" prompt; keys 0x89/0x8B trigger "DROP POINTS" prompt.

## Full Annotated Disassembly

### Sibling entries (0x06AD7E..0x06AD90) — context for shared handler

These are additional entry points that also fall through to 0x06AD91. Included for context:

```
0x06AD7E  06 3E                LD B, 0x3E             ; ??? (likely mid-block, decode artifact)
0x06AD80  5C                   LD E, H
0x06AD81  18 0E                JR 0x06AD91            ; → shared handler

0x06AD83  21 2B AF 06          LD HL, 0x06AF2B        ; "Guess?"
0x06AD87  3E 58                LD A, 0x58
0x06AD89  18 06                JR 0x06AD91            ; → shared handler

0x06AD8B  21 05 AF 06          LD HL, 0x06AF05        ; "Upper Limit?"
0x06AD8F  3E 5B                LD A, 0x5B
```

### Entry 1: 0x06ADC9 — "DROP POINTS" handler (keys 0x89/0x8B)

```
0x06ADC9  21 46 AF 06          LD HL, 0x06AF46        ; HL → "DROP POINTS" string
0x06ADCD  3E BE                LD A, 0xBE             ; A = 0xBE (result token/command ID)
0x06ADCF  18 C0                JR 0x06AD91            ; → shared handler
```

**Size**: 8 bytes, 3 instructions.
Falls through to shared handler at 0x06AD91 with HL pointing to the prompt string and A holding a command identifier.

### Shared handler: 0x06AD91 — Graph CALC prompt dispatcher

```
0x06AD91  FD CB 35 4E          BIT 1, (IY+53)         ; Test cursor-active flag
0x06AD95  C4 8E 39 02          CALL NZ, 0x02398E      ; If set: cleanup cursor
0x06AD99  FD CB 17 56          BIT 2, (IY+23)         ; Test busy/locked flag
0x06AD9D  C0                   RET NZ                 ; If busy: abort, return to caller

0x06AD9E  E5                   PUSH HL                ; Save string pointer
0x06AD9F  FD CB 04 66          BIT 4, (IY+4)          ; Test graph-screen-active flag
0x06ADA3  20 0C                JR NZ, 0x06ADB1        ; If graph active: skip init block

; --- Graph not active: initialize graph display ---
0x06ADA5  CD A8 FB 06          CALL 0x06FBA8          ; Graph display init
0x06ADA9  CD 6C AF 06          CALL 0x06AF6C          ; Read graph config → save coords
0x06ADAD  CD BF AA 06          CALL 0x06AABF          ; Graph redraw / coordinate setup

; --- Common path ---
0x06ADB1  E1                   POP HL                 ; Restore string pointer
0x06ADB2  3E 03                LD A, 0x03             ; Graph CALC mode = 3
0x06ADB4  32 B1 26 D0          LD (0xD026B1), A       ; Store mode in D026B1

0x06ADB8  FD CB 4B 56          BIT 2, (IY+75)         ; Test "pending text update" flag
0x06ADBC  C4 17 AE 06          CALL NZ, 0x06AE17      ; If set: run text update (0x02315E + 0x028603)

0x06ADC0  FD CB 4B 96          RES 2, (IY+75)         ; Clear pending-text flag
0x06ADC4  CD 93 D0 06          CALL 0x06D093          ; Final display refresh / graph render
0x06ADC8  C9                   RET                    ; Done
```

**Size**: 56 bytes, 16 instructions.

### Entry 2: 0x06ADD1 — "STORE RESULTS?" handler (key 0x8D)

```
0x06ADD1  21 37 AF 06          LD HL, 0x06AF37        ; HL → "STORE RESULTS?" string
0x06ADD5  3E BB                LD A, 0xBB             ; A = 0xBB (result token/command ID)
0x06ADD7  CD F5 AD 06          CALL 0x06ADF5          ; Setup: set D026B1=3, call display init
; (0x06ADF5 calls 0x06AE05, which calls 0x02315E + 0x028603 + 0x06AF70 + 0x06AE96 + 0x06AE9D)
; (0x06ADF5 then falls through to JP 0x06C8AB)
; But CALL returns here:

0x06ADDB  40 2A 98 2A          LD HL, (0x2A98) [.SIS] ; Load graph window X-coord (16-bit)
0x06ADDF  40 22 AA 26          LD (0x26AA), HL [.SIS] ; Save to cursor/result coord
0x06ADE3  CD 6C AF 06          CALL 0x06AF6C          ; Read graph config var (D026B2 → mode setup)
0x06ADE7  CD B7 FF 07          CALL 0x07FFB7          ; Graph calculation / result computation
0x06ADEB  CD EA 46 08          CALL 0x0846EA          ; Result display / formatting
0x06ADEF  D4 91 AB 06          CALL NC, 0x06AB91      ; If no carry (success): store result handler
0x06ADF3  18 0C                JR 0x06AE01            ; → JP 0x06C8AB (exit)
```

**Size**: 36 bytes (0x06ADD1..0x06ADF4), 10 instructions.

### Helper 0x06ADF5 — Mode setup wrapper

```
0x06ADF5  F5                   PUSH AF                ; Save command ID in A
0x06ADF6  3E 03                LD A, 0x03
0x06ADF8  32 B1 26 D0          LD (0xD026B1), A       ; D026B1 = 3 (graph CALC mode)
0x06ADFC  F1                   POP AF                 ; Restore command ID
0x06ADFD  CD 05 AE 06          CALL 0x06AE05          ; Display setup (see below)
; Falls through to:
0x06AE01  C3 AB C8 06          JP 0x06C8AB            ; Exit: reset coords + RET
```

Note: When called from 0x06ADD7, the CALL returns to 0x06ADDB (the caller continues after CALL). The JP 0x06C8AB at 0x06AE01 is only reached when 0x06ADF5 is NOT called (i.e., from the JR at 0x06ADF3, or when 0x06AE05 returns and falls through).

### Helper 0x06AE05 — Graph display initialization

```
0x06AE05  FD CB 35 4E          BIT 1, (IY+53)         ; Test cursor-active flag
0x06AE09  C4 8E 39 02          CALL NZ, 0x02398E      ; If set: cleanup cursor

0x06AE0D  E5                   PUSH HL                ; Save string pointer
0x06AE0E  40 2A 98 2A          LD HL, (0x2A98) [.SIS] ; Load graph window X-coord
0x06AE12  40 22 AA 26          LD (0x26AA), HL [.SIS] ; Save to cursor coord
0x06AE16  E1                   POP HL                 ; Restore string pointer

0x06AE17  CD 5E 31 02          CALL 0x02315E          ; Text/display output routine
0x06AE1B  CD 03 86 02          CALL 0x028603          ; Font/text rendering setup
0x06AE1F  3A B1 26 D0          LD A, (0xD026B1)       ; Read graph CALC mode
0x06AE23  CD 70 AF 06          CALL 0x06AF70          ; Mode-dependent setup (calls 0x061B8E)
0x06AE27  FD CB 05 8E          RES 1, (IY+5)          ; Clear "edit mode" flag
0x06AE2B  CD 96 AE 06          CALL 0x06AE96          ; Print space character
0x06AE2F  CD 9D AE 06          CALL 0x06AE9D          ; Print null-terminated string from HL
0x06AE33  C9                   RET
```

**Size**: 47 bytes, 16 instructions. Entry at 0x06AE17 is also called independently (2 callers: 0x06ADBC, 0x0704FE).

### Helper 0x06AE96 — Print space character

```
0x06AE96  3E 20                LD A, 0x20             ; A = space (0x20)
0x06AE98  CD E5 23 0A          CALL 0x0A23E5          ; _PutC — print character in A
0x06AE9C  C9                   RET
```

**Size**: 7 bytes, 3 instructions, 7 callers.

### Helper 0x06AE9D — Print null-terminated string

```
0x06AE9D  FD CB 2B D6          SET 2, (IY+43)         ; Set "printing string" flag
0x06AEA1  F5                   PUSH AF
0x06AEA2  D5                   PUSH DE
0x06AEA3  DD E5                PUSH IX                ; Save registers

0x06AEA5  7E                   LD A, (HL)             ; Read next char    ←─┐
0x06AEA6  23                   INC HL                 ; Advance pointer     │
0x06AEA7  B7                   OR A                   ; Test for NUL        │
0x06AEA8  28 06                JR Z, 0x06AEB0         ; If NUL: done        │
0x06AEAA  CD E5 23 0A          CALL 0x0A23E5          ; _PutC — print char  │
0x06AEAE  30 F5                JR NC, 0x06AEA5        ; If no overflow: loop┘

0x06AEB0  DD E1                POP IX
0x06AEB2  D1                   POP DE
0x06AEB3  F1                   POP AF                 ; Restore registers
0x06AEB4  FD CB 2B 96          RES 2, (IY+43)         ; Clear "printing string" flag
0x06AEB8  C9                   RET
```

**Size**: 28 bytes, 13 instructions, 4 callers.

### Exit stub 0x06C8AB — Reset coordinate sentinel

```
0x06C8AB  21 FF FF 00          LD HL, 0x00FFFF        ; Sentinel value
0x06C8AF  40 22 AA 26          LD (0x26AA), HL [.SIS] ; Reset graph cursor coord
0x06C8B3  C9                   RET
```

**Size**: 9 bytes, 3 instructions, 13 callers across the OS.

### Helper 0x06AF6C — Read graph config variable

```
0x06AF6C  3A B2 26 D0          LD A, (0xD026B2)       ; Read graph config byte
; Falls through to 0x06AF70:
0x06AF70  CD 8E 1B 06          CALL 0x061B8E          ; Mode-to-config conversion
0x06AF74  40 ED 53 AC 26       LD (0x26AC), DE [.SIS]  ; Save DE result (16-bit)
0x06AF79  32 AE 26 D0          LD (0xD026AE), A       ; Save A result
0x06AF7D  C9                   RET
```

0x06AF6C (18 callers) reads D026B2 then falls into 0x06AF70 (7 callers) which calls 0x061B8E and stores results.

### Additional entries in the function group (0x06AE34..0x06AE71)

These are additional graph CALC result handlers NOT reached from 0x06ADC9/0x06ADD1, but part of the same function group:

```
0x06AE34  21 C0 AE 06          LD HL, 0x06AEC0        ; "Minimum"
0x06AE38  3E 62                LD A, 0x62             ; ZOOM key code
0x06AE3A  18 1C                JR 0x06AE58

0x06AE3C  21 C8 AE 06          LD HL, 0x06AEC8        ; "Maximum"
0x06AE40  3E 61                LD A, 0x61             ; TRACE key code
0x06AE42  18 14                JR 0x06AE58

0x06AE44  21 D0 AE 06          LD HL, 0x06AED0        ; "Intersection"
0x06AE48  3E 03                LD A, 0x03
0x06AE4A  32 B1 26 D0          LD (0xD026B1), A       ; D026B1 = 3
0x06AE4E  3E 60                LD A, 0x60             ; GRAPH key code
0x06AE50  18 10                JR 0x06AE62

0x06AE52  21 32 AF 06          LD HL, 0x06AF32        ; "Zero"
0x06AE56  3E 57                LD A, 0x57             ; ALPHA key code
0x06AE58  F5                   PUSH AF
0x06AE59  3A B2 26 D0          LD A, (0xD026B2)       ; Read graph config
0x06AE5D  32 B1 26 D0          LD (0xD026B1), A       ; Copy to mode byte
0x06AE61  F1                   POP AF
0x06AE62  CD 05 AE 06          CALL 0x06AE05          ; Display init
0x06AE66  CD 6C AF 06          CALL 0x06AF6C          ; Read graph config
0x06AE6A  CD BF AA 06          CALL 0x06AABF          ; Graph redraw
0x06AE6E  C3 AB C8 06          JP 0x06C8AB            ; Exit: reset coords + RET
```

These handle Zero (0x06AE52), Minimum (0x06AE34), Maximum (0x06AE3C), and Intersection (0x06AE44) — all called from elsewhere in the 0x06Dxxx graph dispatch cluster.

## RAM Addresses Referenced

| Address | Purpose | References |
|---------|---------|------------|
| 0xD026B1 | Graph CALC mode byte | 6 refs: WRITE=3 at 0x06ADB4, 0x06ADF8, 0x06AE4A; READ at 0x06AE1F; WRITE from D026B2 at 0x06AE5D |
| 0xD026B2 | Graph config variable (persistent) | 2 refs: READ at 0x06AE59, 0x06AF6C |
| 0xD026AE | Graph mode result storage | 1 ref: WRITE at 0x06AF79 |

Also referenced via .SIS 16-bit operations (these are 16-bit addresses, likely in the TI-OS system area):
- `(0x2A98)` — graph window X coordinate (READ, 2 refs)
- `(0x26AA)` — graph cursor/result coordinate (WRITE, multiple refs)
- `(0x26AC)` — graph config result DE (WRITE at 0x06AF74)

## IY+Offset Flags Touched

| IY+Offset | Bit | Operation | Purpose |
|-----------|-----|-----------|---------|
| IY+4 | 4 | BIT (test) | Graph screen active flag |
| IY+5 | 1 | RES (clear) | Edit mode flag |
| IY+23 | 2 | BIT (test) | Busy/locked guard |
| IY+29 | 6 | SET | (in 0x06AE72, separate handler) |
| IY+35 | 1 | BIT (test) | Cursor active flag |
| IY+43 | 2 | SET/RES | String printing in progress flag |
| IY+75 | 2 | BIT/RES | Pending text update flag |

## CALL Targets

| From | Target | Purpose |
|------|--------|---------|
| 0x06AD95 | 0x02398E | Cursor cleanup |
| 0x06ADA5 | 0x06FBA8 | Graph display init |
| 0x06ADA9 | 0x06AF6C | Read graph config var |
| 0x06ADAD | 0x06AABF | Graph redraw / coordinate setup |
| 0x06ADBC | 0x06AE17 | Text update (entry into 0x06AE05 mid-block) |
| 0x06ADC4 | 0x06D093 | Final display refresh |
| 0x06ADD7 | 0x06ADF5 | Mode setup wrapper (set D026B1=3, call 0x06AE05) |
| 0x06ADE3 | 0x06AF6C | Read graph config var |
| 0x06ADE7 | 0x07FFB7 | Graph calculation / result computation |
| 0x06ADEB | 0x0846EA | Result display / formatting |
| 0x06ADEF | 0x06AB91 | Store result handler (conditional on NC) |
| 0x06ADFD | 0x06AE05 | Graph display initialization |
| 0x06AE09 | 0x02398E | Cursor cleanup |
| 0x06AE17 | 0x02315E | Text/display output routine |
| 0x06AE1B | 0x028603 | Font/text rendering setup |
| 0x06AE23 | 0x06AF70 | Mode-dependent config setup |
| 0x06AE2B | 0x06AE96 | Print space character |
| 0x06AE2F | 0x06AE9D | Print null-terminated string |
| 0x06AE62 | 0x06AE05 | Graph display initialization |
| 0x06AE66 | 0x06AF6C | Read graph config var |
| 0x06AE6A | 0x06AABF | Graph redraw |
| 0x06AE98 | 0x0A23E5 | _PutC — print single character |
| 0x06AEAA | 0x0A23E5 | _PutC — print single character (in loop) |
| 0x06AF70 | 0x061B8E | Mode-to-config conversion |

## JP Targets

| From | Target | Type |
|------|--------|------|
| 0x06AE01 | 0x06C8AB | Unconditional — exit: reset coord sentinel + RET |
| 0x06AE6E | 0x06C8AB | Unconditional — same exit |

## Caller List

### 0x06ADC9 (keys 0x89/0x8B — "DROP POINTS")
- 0x06CF43: JP Z (from multi-key dispatcher 0x06CF41, key 0x89 direct, key 0x8B via JR to same JP)

### 0x06ADD1 (key 0x8D — "STORE RESULTS?")
- 0x06CF4D: JP Z (from multi-key dispatcher 0x06CF41, key 0x8D)

Both entries have exactly **1 caller each**, both from the multi-key dispatcher.

### Sibling entry callers (for context)
- 0x06AD83 ("Guess?"): 1 caller at 0x06CF2B (JP cc)
- 0x06AD8B ("Upper Limit?"): 1 caller at 0x06CEFB (JP cc)
- 0x06AE34 ("Minimum"): 1 caller at 0x06D3F5 (CALL cc)
- 0x06AE3C ("Maximum"): 1 caller at 0x06D3F0 (CALL cc)
- 0x06AE44 ("Intersection"): 1 caller at 0x06D548 (CALL)
- 0x06AE52 ("Zero"): 1 caller at 0x06D325 (CALL)

## String Table (0x06AEB9..0x06AF55)

| Address | String | Used by |
|---------|--------|---------|
| 0x06AEB9 | "dy/dx=" | 0x06AE72 handler |
| 0x06AEC0 | "Minimum" | 0x06AE34 |
| 0x06AEC8 | "Maximum" | 0x06AE3C |
| 0x06AED0 | "Intersection" | 0x06AE44 |
| 0x06AEDD | "First curve?" | (graph CALC prompts) |
| 0x06AEEA | "Second curve?" | (graph CALC prompts) |
| 0x06AEF8 | "Lower Limit?" | (graph CALC prompts) |
| 0x06AF05 | "Upper Limit?" | 0x06AD8B |
| 0x06AF12 | "Left Bound?" | (graph CALC prompts) |
| 0x06AF1E | "Right Bound?" | (graph CALC prompts) |
| 0x06AF2B | "Guess?" | 0x06AD83 |
| 0x06AF32 | "Zero" | 0x06AE52 |
| 0x06AF37 | "STORE RESULTS?" | 0x06ADD1 (MODE/0x8D) |
| 0x06AF46 | "DROP POINTS" | 0x06ADC9 (keys 0x89/0x8B) |

## Architectural Summary

### What does key 0x89/0x8B do at 0x06ADC9?

Keys 0x89 and 0x8B both dispatch to the **"DROP POINTS"** handler. This is a graph CALC result action that:

1. Loads HL with the "DROP POINTS" string pointer and A with command ID 0xBE
2. Jumps to the shared handler at 0x06AD91
3. The shared handler checks cursor/busy guards, optionally initializes the graph display (CALL 0x06FBA8 + 0x06AF6C + 0x06AABF), then sets graph CALC mode to 3 in D026B1
4. Optionally updates pending text, calls 0x06D093 for final display refresh, and returns

This is the handler for when the user wants to "drop" calculated points onto the graph — marking intersections, zeros, or extrema on the graph screen.

### What does key 0x8D do at 0x06ADD1?

Key 0x8D dispatches to the **"STORE RESULTS?"** handler. This is a more complex handler that:

1. Loads HL with "STORE RESULTS?" string and A with command ID 0xBB
2. Calls 0x06ADF5 which sets D026B1=3 and runs the display init pipeline (0x06AE05: cursor cleanup, window coord save, text output via 0x02315E, font setup via 0x028603, mode config via 0x06AF70, print space + prompt string)
3. After the prompt is displayed, saves the graph window X coordinate from (0x2A98) to (0x26AA)
4. Reads graph config via 0x06AF6C
5. Calls 0x07FFB7 (graph calculation/result computation)
6. Calls 0x0846EA (result display/formatting)
7. If carry is clear (calculation succeeded): calls 0x06AB91 to store the result
8. Exits via JP 0x06C8AB which resets the cursor coordinate to 0xFFFF sentinel

This is the handler for **storing graph CALC results to a variable** — when the user presses a key after computing a zero, minimum, etc., this prompts "STORE RESULTS?" and if confirmed, saves the computed value.

### Function group architecture

The entire 0x06AD7E..0x06AEB8 region is a **graph CALC result dispatch table** with multiple entry points, each setting HL to a prompt string and A to a command identifier, then falling into either:

- **0x06AD91** (shared handler for "light" operations: display prompt, set mode, refresh graph)
- **0x06AE05** (display init for "heavy" operations: full text output pipeline + string display)
- **0x06AE58/0x06AE62** (common path for Zero/Minimum/Maximum/Intersection: copy config, display init, graph redraw, exit)

All exit paths eventually reach **0x06C8AB** (reset coordinate sentinel to 0xFFFF, RET) either directly via JP or indirectly via the caller's RET chain.

The string table at 0x06AEB9 contains all the TI-84's CALC menu prompts: dy/dx=, Minimum, Maximum, Intersection, First/Second curve?, Lower/Upper Limit?, Left/Right Bound?, Guess?, Zero, STORE RESULTS?, DROP POINTS.

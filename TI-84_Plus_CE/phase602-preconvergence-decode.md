# Phase 602: Pre-Convergence Function Decode (0x055B8F + 0x058DCD)

## Context

In the key dispatch chain, `0x05877A` (pre-convergence path) calls:
```
CALL 0x080259 → PUSH AF → CALL 0x055B8F → CALL 0x058DCD → POP AF → CALL 0x080259 → CALL 0x058EDA
```

The PUSH/POP AF bracket means 0x055B8F and 0x058DCD can trash A freely; the caller preserves its own copy. These functions set IY-relative flags and modify OS state that affects downstream routing.

IY = 0xD00080 throughout. `.SIS` prefix (0x40) makes addresses 16-bit with MBASE=0xD0, so `.SIS LD HL,(0x26B5)` = `LD HL,(0xD026B5)`.

---

## Function 1: 0x055B8F — `appContextSave` (context save/restore for app transitions)

### Disassembly

```
  055B8F  FD CB 27 7E            BIT 7,(IY+0x27)       ; test bit 7 of 0xD000A7 (context-active flag)
  055B93  C0                     RET NZ                 ; already active → skip entirely

  055B94  7A                     LD A,D                 ; test DE (passed in from caller)
  055B95  B3                     OR E
  055B96  20 10                  JR NZ,0x055BA8          ; DE != 0 → skip default setup

  ; DE == 0: set up default context
  055B98  3E 03                  LD A,0x03
  055B9A  CD 66 23 04            CALL 0x042366           ; ISR/timer check (chains to 0x0421A7)
  055B9E  11 00 00 00            LD DE,0x000000
  055BA2  28 04                  JR Z,0x055BA8           ; Z → keep DE=0
  055BA4  11 2C 00 00            LD DE,0x00002C          ; NZ → DE=0x2C (44 decimal)

  ; Main path
  055BA8  40 2A B5 26            .SIS LD HL,(0xD026B5)   ; load 16-bit value from D026B5
  055BAC  CD 79 C9 04            CALL 0x04C979           ; cpHL_DE — compare HL vs DE
  055BB0  C8                     RET Z                   ; HL == DE → nothing to do, return

  055BB1  40 ED 53 B5 26         .SIS LD (0xD026B5),DE   ; store new DE to D026B5
  055BB6  18 24                  JR 0x055BDC             ; jump to save-state block

  ; Entry point for "from VRAM reset" path (jumped to from 055BD6)
  055BB8  2A CC 2A D0            LD HL,(0xD02ACC)        ; load current scan result word
  055BBC  40 22 C0 2A            .SIS LD (0xD02AC0),HL   ; save to D02AC0
  055BC0  21 00 00 00            LD HL,0x000000
  055BC4  11 2C 01 00            LD DE,0x00012C          ; DE = 300 (screen height in px? or timer?)
  055BC8  01 19 0E 00            LD BC,0x000E19          ; BC = 3609
  055BCC  C3 44 EF 09            JP 0x09EF44             ; tail-call memset/screen-clear

  ; Re-entry to check if we need the full context push
  055BD0  40 2A B5 26            .SIS LD HL,(0xD026B5)   ; reload D026B5
  055BD4  7C                     LD A,H
  055BD5  B5                     OR L
  055BD6  28 D9                  JR Z,0x055BB1           ; HL==0 → just store DE and go

  ; Full context save
  055BD8  FD CB 27 FE            SET 7,(IY+0x27)         ; mark context as active (0xD000A7 bit 7)
  055BDC  40 ED 53 49 2A         .SIS LD (0xD02A49),DE   ; save DE to context slot
  055BE1  40 2A AC 26            .SIS LD HL,(0xD026AC)   ; load drawFGColor
  055BE5  E5                     PUSH HL                 ; save on stack
  055BE6  40 2A AA 26            .SIS LD HL,(0xD026AA)   ; load drawBGColor
  055BEA  E5                     PUSH HL
  055BEB  40 2A C0 2A            .SIS LD HL,(0xD02AC0)   ; load saved scan data
  055BEF  E5                     PUSH HL
  055BF0  40 2A D2 08            .SIS LD HL,(0xD008D2)   ; load cursor/state word
  055BF4  E5                     PUSH HL
  055BF5  3A D5 08 D0            LD A,(0xD008D5)         ; load context-type byte
  055BF9  F5                     PUSH AF                 ; save on stack

  ; Install new context values
  055BFA  21 1C E7 00            LD HL,0x00E71C          ; new FG color value (0xE71C = yellow-ish RGB565)
  055BFE  40 22 AC 26            .SIS LD (0xD026AC),HL   ; set drawFGColor
  055C02  40 ED 4B CC 2A         .SIS LD BC,(0xD02ACC)   ; load current scan result
  055C07  40 ED 43 AA 26         .SIS LD (0xD026AA),BC   ; set drawBGColor from scan result
  055C0C  3E 0E                  LD A,0x0E
  055C0E  32 D5 08 D0            LD (0xD008D5),A         ; set context-type = 0x0E
  055C12  01 02 00 00            LD BC,0x000002
  055C16  40 ED 43 D2 08         .SIS LD (0xD008D2),BC   ; set cursor/state = 2

  ; Check DE for secondary action
  055C1B  7A                     LD A,D
  055C1C  B3                     OR E
  055C1D  CA BC 5C 05            JP Z,0x055CBC           ; DE==0 → skip to restore

  055C21  21 36 00 00            LD HL,0x000036          ; HL = 54
  055C25  CD 79 C9 04            CALL 0x04C979           ; cpHL_DE
  055C29  DA BC 5C 05            JP C,0x055CBC           ; DE > 54 → skip

  055C2D  D5                     PUSH DE
  055C2E  1B                     DEC DE
  055C2F  21 F4 5C 05            LD HL,0x055CF4          ; pointer to jump table
  055C33  19                     ADD HL,DE               ; index into table
  055C34  19                     ADD HL,DE               ; ×3 (3-byte entries)
  055C35  19                     ADD HL,DE
  055C36  ED 27                  ??? (ED 27)             ; eZ80: likely LD HL,(HL) — indirect load
  055C38  CD 5E 31 02            CALL 0x02315E           ; dispatch through table entry

  ; ... continues with string formatting, "TESTGUARD" inline string at 055C82 ...
  ; ... ends with context restore:

  055CBC  ...                    (restore path)
  055CD0  F1                     POP AF
  055CD1  32 D5 08 D0            LD (0xD008D5),A         ; restore context-type
  055CD5  E1                     POP HL
  055CD6  40 22 D2 08            .SIS LD (0xD008D2),HL   ; restore cursor/state
  055CDA  E1                     POP HL
  055CDB  40 22 C0 2A            .SIS LD (0xD02AC0),HL   ; restore scan data backup
  055CDF  E1                     POP HL
  055CE0  40 22 AA 26            .SIS LD (0xD026AA),HL   ; restore drawBGColor
  055CE4  E1                     POP HL
  055CE5  40 22 AC 26            .SIS LD (0xD026AC),HL   ; restore drawFGColor
  055CE9  C9                     RET
```

### Summary

`0x055B8F` is an **application context save/restore wrapper**. It:

1. Guards against re-entry via `(IY+0x27) bit 7` (0xD000A7).
2. Saves the current drawing context onto the stack: FG color (D026AC), BG color (D026AA), scan data (D02AC0), cursor state (D008D2), and context-type (D008D5).
3. Installs temporary drawing context values (FG=0xE71C, context-type=0x0E, cursor=2).
4. Optionally dispatches through a 54-entry jump table at 0x055CF4 (indexed by DE-1, 3-byte entries).
5. Restores the saved context and returns.

### OS State Variables Accessed

| Address | Direction | Purpose |
|---------|-----------|---------|
| 0xD000A7 (IY+0x27) bit 7 | R/W | Context-active guard flag (BIT/SET) |
| 0xD026B5 | R/W | Context comparison value |
| 0xD026AC | R/W | drawFGColor — foreground drawing color |
| 0xD026AA | R/W | drawBGColor — background drawing color |
| 0xD02AC0 | R/W | Scan data backup slot |
| 0xD02ACC | R | Current scan result word |
| 0xD008D2 | R/W | Cursor/state word |
| 0xD008D5 | R/W | Context-type byte |
| 0xD02A49 | W | Saved DE context slot |

### Cross-References

| Target | Label | Notes |
|--------|-------|-------|
| 0x042366 | ISR/timer check | Chains to 0x0421A7, the ISR dispatch path |
| 0x04C979 | cpHL_DE | 24-bit compare (HL vs DE), sets flags |
| 0x09EF44 | memset/screen-clear | Tail-called for VRAM reset path |
| 0x02315E | Dispatch helper | Called with HL from jump table |

### Callers (known)

- 0x08C7BB (newContext path)
- 0x08BF62, 0x08BF7C (yield path)

---

## Function 2: 0x058DCD — `appStateReset` (clear app flags and reset display state)

### Disassembly

```
  058DCD  CD 89 8D 05            CALL 0x058D89           ; clearEditFlag — RES 3,(IY+0x01)
  058DD1  CD AE 81 05            CALL 0x0581AE           ; display refresh/redraw helper
  058DD5  FD CB 09 BE            RES 7,(IY+0x09)         ; clear bit 7 of statFlags (0xD00089)
  058DD9  CD F5 8D 05            CALL 0x058DF5           ; clearIndicators sub
  058DDD  FD CB 49 B6            RES 6,(IY+0x49)         ; clear bit 6 of 0xD000C9
  058DE1  CD D1 1F 0A            CALL 0x0A1FD1           ; cursor/display update
  058DE5  CD 5C 8B 05            CALL 0x058B5C           ; editBufReset — zeros edit pointers (D02435)
  058DE9  FD CB 15 96            RES 2,(IY+0x15)         ; clear bit 2 of 0xD00095
  058DED  FD CB 45 BE            RES 7,(IY+0x45)         ; clear bit 7 of 0xD000C5
  058DF1  C3 BC 82 05            JP 0x0582BC             ; tail-call to bulkFlagClear
```

### Sub-function 0x058D89 — `clearEditFlag`

```
  058D89  FD CB 01 9E            RES 3,(IY+0x01)         ; clear bit 3 of 0xD00081 (edit-mode flag)
  058D8D  C9                     RET
```

### Sub-function 0x058DF5 — `clearIndicators`

```
  058DF5  CD EC 00 08            CALL 0x0800EC           ; OS helper (indicator clear)
  058DF9  CD F2 21 0A            CALL 0x0A21F2           ; display indicator update
  058DFD  CD 5E 23 0A            CALL 0x0A235E           ; secondary indicator clear
  058E01  C9                     RET
```

### Tail target 0x0582BC — `bulkFlagClear`

```
  0582BC  FD CB 4A A6            RES 4,(IY+0x4A)         ; clear bit 4 of 0xD000CA
  0582C0  FD CB 05 9E            RES 3,(IY+0x05)         ; clear bit 3 of 0xD00085
  0582C4  FD CB 47 8E            RES 1,(IY+0x47)         ; clear bit 1 of 0xD000C7
  0582C8  FD CB 49 B6            RES 6,(IY+0x49)         ; clear bit 6 of 0xD000C9
  0582CC  FD CB 25 AE            RES 5,(IY+0x25)         ; clear bit 5 of 0xD000A5
  0582D0  FD CB 08 8E            RES 1,(IY+0x08)         ; clear bit 1 of 0xD00088
  0582D4  FD CB 15 B6            RES 6,(IY+0x15)         ; clear bit 6 of 0xD00095
  0582D8  FD CB 1F 96            RES 2,(IY+0x1F)         ; clear bit 2 of 0xD0009F
  0582DC  CD EC 00 08            CALL 0x0800EC           ; OS helper
  0582E0  FD CB 01 A6            RES 4,(IY+0x01)         ; clear bit 4 of 0xD00081
  ...                            (continues with more calls)
```

### Summary

`0x058DCD` is a **comprehensive app state reset**. It:

1. Clears the edit-mode flag (`(IY+0x01) bit 3`)
2. Calls display refresh (`0x0581AE`)
3. Clears statFlags bit 7 (`(IY+0x09)` = 0xD00089) — the "stat result pending" flag
4. Clears display indicators via 3 sub-calls
5. Clears bit 6 of `(IY+0x49)` = 0xD000C9
6. Updates cursor/display state
7. Resets edit buffer pointers (via `0x058B5C`, which zeros D02435)
8. Clears bit 2 of `(IY+0x15)` = 0xD00095
9. Clears bit 7 of `(IY+0x45)` = 0xD000C5
10. Tail-calls `bulkFlagClear` at 0x0582BC which clears 8+ more IY-relative flag bits

### OS State Variables Modified

| Address | Bit | Operation | Known Name |
|---------|-----|-----------|------------|
| 0xD00081 (IY+0x01) | 3 | RES | edit-mode flag |
| 0xD00089 (IY+0x09) | 7 | RES | statFlags — stat result pending |
| 0xD000C9 (IY+0x49) | 6 | RES | (unknown app flag) |
| 0xD00095 (IY+0x15) | 2 | RES | (unknown display flag) |
| 0xD000C5 (IY+0x45) | 7 | RES | (unknown mode flag) |
| 0xD000CA (IY+0x4A) | 4 | RES | (via bulkFlagClear) |
| 0xD00085 (IY+0x05) | 3 | RES | (via bulkFlagClear) |
| 0xD000C7 (IY+0x47) | 1 | RES | (via bulkFlagClear) |
| 0xD000A5 (IY+0x25) | 5 | RES | (via bulkFlagClear) |
| 0xD00088 (IY+0x08) | 1 | RES | (via bulkFlagClear) |
| 0xD00095 (IY+0x15) | 6 | RES | (via bulkFlagClear) |
| 0xD0009F (IY+0x1F) | 2 | RES | (via bulkFlagClear) |
| 0xD00081 (IY+0x01) | 4 | RES | (via bulkFlagClear) |
| 0xD02435 region | - | zeroed | edit buffer pointers (via 058B5C) |

### Cross-References

| Target | Label | Notes |
|--------|-------|-------|
| 0x058D89 | clearEditFlag | RES 3,(IY+0x01); RET |
| 0x0581AE | display refresh | Complex sub — redraws/updates display |
| 0x058DF5 | clearIndicators | Calls 0x0800EC, 0x0A21F2, 0x0A235E |
| 0x0A1FD1 | cursor/display update | Tests IY+0x49 bits, conditionally updates |
| 0x058B5C | editBufReset | Zeros edit buffer pointers at D02435 |
| 0x0582BC | bulkFlagClear | Clears 8+ IY-relative flag bits |
| 0x0800EC | OS helper | Indicator management |

---

## Cross-Reference to Key OS Variables

Neither function writes to:
- **D007CA** (cxMain handler pointer) — NOT touched
- **D0231A** (edit buffer base) — NOT touched
- **D0243A** (editCursor) — NOT directly touched (but 058B5C zeros D02435 region nearby)
- **D0058C** (kbdKey) — NOT touched
- **D0058E** (raw scan code) — NOT touched

Both functions operate on the **drawing context** (colors, indicators, flags) and **edit state** (buffer pointers, mode flags), not on the key dispatch variables. They prepare the display subsystem for whatever action follows after the PUSH/POP AF bracket returns control with the original scan code in A.

## Significance for Key Dispatch

In the sequence `PUSH AF → CALL 0x055B8F → CALL 0x058DCD → POP AF`:

1. **0x055B8F** saves the current drawing context and installs temporary values. When called from the pre-convergence path with a number key (A=0x90), it likely does nothing significant (the BIT 7,(IY+0x27) guard or the cpHL_DE early-exit will short-circuit).

2. **0x058DCD** clears ~15+ IY-relative flag bits, resets the edit buffer, and refreshes the display. This is the "clean slate" operation — it ensures no stale app state (stat results, edit mode, indicator flags) leaks into the new key action.

3. After POP AF restores the scan code, the dispatch chain continues with `CALL 0x080259` (descriptor check) and `CALL 0x058EDA` (the 11-byte catalog-key detector / type classifier), which uses the preserved A value for routing.

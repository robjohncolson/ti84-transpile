# Phase 446: Disassembly of 0x00846E (Main OS Dispatch) and 0x03FA09 (Key Processor)

## Function 1: 0x00846E — Main OS Dispatch

**Size**: 0x00846E–0x008526 (185 bytes) for the main body. Sub-functions 0x0085C4 and 0x0085D3 are helpers (15 bytes each). The JP NZ branch at 0x008522 enters the USB/transfer handler block 0x008527–0x0085C3 (157 bytes).

**Total span including all inline helpers**: 0x00846E–0x0085E2 (373 bytes).

### Full Disassembly

```asm
; ===== MAIN BODY =====
00846E: CD 8A 21 00       CALL 0x00218A          ; __frameset0 (set up IX frame)
008472: 3A 80 40 D1       LD A,(D14080)          ; USB transfer-active flag
008476: B7                OR A
008477: C2 22 85 00       JP NZ,0x008522          ; if transfer active -> skip to epilogue (via 0x008527 block)
00847B: 3A BB 77 D1       LD A,(D177BB)          ; display-busy flag
00847F: B7                OR A
008480: 20 58             JR NZ,0x0084DA          ; if display busy -> skip USB check, go to mode dispatch

; --- USB state == 0xFF path (idle/disconnected) ---
008482: FB                EI
008483: 3A B8 77 D1       LD A,(D177B8)          ; USB state code
008487: FE FF             CP 0xFF
008489: 20 27             JR NZ,0x0084B2          ; if USB not idle -> skip USB polling
00848B: CD 56 27 01       CALL 0x012756          ; USB poll / check connection
00848F: B7                OR A
008490: 28 20             JR Z,0x0084B2           ; if no USB event -> skip
008492: 01 12 00 00       LD BC,0x000012          ; arg2 = 0x12 (timeout/type)
008496: C5                PUSH BC
008497: 01 C4 00 00       LD BC,0x0000C4          ; arg1 = 0xC4 (USB event code)
00849B: C5                PUSH BC
00849C: CD 3C 88 00       CALL 0x00883C          ; dispatch_event(0xC4, 0x12)
0084A0: C1                POP BC
0084A1: C1                POP BC
0084A2: AF                XOR A
0084A3: 32 96 77 D1       LD (D17796),A          ; clear D17796 (event-pending?)
0084A7: CD A9 26 01       CALL 0x0126A9          ; USB status check
0084AB: B7                OR A
0084AC: 28 04             JR Z,0x0084B2           ; if no further action -> skip
0084AE: CD 14 29 01       CALL 0x012914          ; USB enumeration/setup

; --- Mode parameter check ---
0084B2: DD 7E 06          LD A,(IX+6)            ; function parameter (passed on stack)
0084B5: FE 02             CP 0x02
0084B7: 20 21             JR NZ,0x0084DA          ; if param != 2 -> skip to mode dispatch
0084B9: 3A B8 77 D1       LD A,(D177B8)          ; USB state code
0084BD: FE FF             CP 0xFF
0084BF: 20 19             JR NZ,0x0084DA          ; if USB not idle -> skip
0084C1: AF                XOR A
0084C2: 32 96 77 D1       LD (D17796),A          ; clear event-pending
0084C6: CD D3 85 00       CALL 0x0085D3          ; set_usb_active() — sets D14089=1, RES 2,(IY+0x43)
0084CA: 01 12 00 00       LD BC,0x000012
0084CE: C5                PUSH BC
0084CF: 01 C0 00 00       LD BC,0x0000C0          ; event code 0xC0
0084D3: C5                PUSH BC
0084D4: CD 3C 88 00       CALL 0x00883C          ; dispatch_event(0xC0, 0x12)
0084D8: C1                POP BC
0084D9: C1                POP BC

; ===== MODE DISPATCH SECTION =====
; Reached from multiple paths above
0084DA: 3A B8 77 D1       LD A,(D177B8)          ; USB state code
0084DE: FE 40             CP 0x40
0084E0: 28 1F             JR Z,0x008501           ; if state == 0x40 -> skip port manipulation

; --- Port 0x5005 manipulation (USB hardware) ---
0084E2: ED 57             LD A,I                 ; save interrupt state
0084E4: F5                PUSH AF
0084E5: F3                DI
0084E6: 01 05 50 00       LD BC,0x005005          ; USB port 0x5005
0084EA: ED 78             IN A,(C)
0084EC: CB EF             SET 5,A                ; set bit 5
0084EE: ED 79             OUT (C),A
0084F0: 78                LD A,B                 ; port safety check (RST 08h trap)
0084F1: FE 50             CP 0x50
0084F3: 28 01             JR Z,0x0084F6
0084F5: CF                RST 08h                ; ASSERT: port address valid
0084F6: 79                LD A,C
0084F7: FE 05             CP 0x05
0084F9: 20 FA             JR NZ,0x0084F5
0084FB: F1                POP AF
0084FC: E2 01 85 00       JP PO,0x008501          ; restore interrupt state (JP PO = IFF was off)
008500: FB                EI

; --- USB state == 0x01 handling (connected/active) ---
008501: 3A B8 77 D1       LD A,(D177B8)          ; USB state code
008505: FE 01             CP 0x01
008507: 20 15             JR NZ,0x00851E          ; if state != 1 -> skip
008509: DD 7E 06          LD A,(IX+6)            ; function parameter
00850C: B7                OR A
00850D: 28 06             JR Z,0x008515           ; if param == 0
00850F: CD D3 85 00       CALL 0x0085D3          ; set_usb_active()
008513: 18 04             JR 0x008519
008515: CD C4 85 00       CALL 0x0085C4          ; clear_usb_active()
008519: AF                XOR A
00851A: 32 74 40 D1       LD (D14074),A          ; clear D14074 (USB callback pending?)

; --- Final cleanup ---
00851E: CD 54 84 00       CALL 0x008454          ; post-dispatch handler (calls 0x006EB6, checks D177B8)

; ===== EPILOGUE =====
008522: DD F9             LD SP,IX
008524: DD E1             POP IX
008526: C9                RET

; ===== USB TRANSFER HANDLER (reached when D14080 != 0) =====
008527: CD B6 6E 00       CALL 0x006EB6          ; USB transfer check
00852B: B7                OR A
00852C: 20 41             JR NZ,0x00856F          ; if active transfer -> handle specific state

; --- No active transfer, but D14080 was set ---
00852E: LD B,B                                    ; NOP-equivalent (0x40)
00852F: 01 82 30 ED       LD BC,0xED3082          ; (actually: LD BC,0x003082 then IN A,(C))
; NOTE: 0x00852E-0x008536 reads port 0x3082, checks bit 3
008536: 28 10             JR Z,0x008548           ; if bit 3 clear -> skip
008538: 01 01 00 00       LD BC,0x000001
00853C: C5                PUSH BC
00853D: 01 00 00 00       LD BC,0x000000
008541: C5                PUSH BC
008542: CD 56 24 01       CALL 0x012456          ; USB endpoint setup
008546: C1                POP BC
008547: C1                POP BC
008548: 01 14 31 00       LD BC,0x003114          ; port 0x3114
00854C: ED 78             IN A,(C)
00854E: CB C7             SET 0,A
008550: ED 79             OUT (C),A              ; set bit 0 of port 0x3114
008558: ...                                       ; port safety check
00855D: 01 10 00 00       LD BC,0x000010
008561: C5                PUSH BC
008562: 01 FF 00 00       LD BC,0x0000FF
008566: C5                PUSH BC
008567: CD EA 25 01       CALL 0x0125EA          ; USB transfer completion
00856B: C1                POP BC
00856C: C1                POP BC
00856D: 18 45             JR 0x0085B4            ; -> cleanup_and_return

; --- Active transfer, check state 0x98 ---
00856F: 3A B8 77 D1       LD A,(D177B8)
008573: FE 98             CP 0x98
008575: 20 18             JR NZ,0x00858F
008577: CD 1E E9 00       CALL 0x00E91E          ; state 0x98 handler
00857B: 01 01 00 00       LD BC,0x000001
00857F: C5                PUSH BC
008580: CD EE D9 00       CALL 0x00D9EE          ; USB data transfer
008584: C1                POP BC
008585: 01 00 00 00       LD BC,0x000000
008589: C5                PUSH BC
00858A: CD 8C DA 00       CALL 0x00DA8C          ; USB completion
00858E: C1                POP BC
00858F: 01 14 31 00       LD BC,0x003114          ; port 0x3114
008593: ED 78             IN A,(C)
008595: CB C7             SET 0,A
008597: ED 79             OUT (C),A
0085A4: 01 00 00 00       LD BC,0x000000
0085A8: C5                PUSH BC
0085A9: 01 01 00 00       LD BC,0x000001
0085AD: C5                PUSH BC
0085AE: CD 3F 25 01       CALL 0x01253F          ; USB finalize
0085B2: C1                POP BC
0085B3: C1                POP BC

; --- Cleanup and return (shared by USB transfer paths) ---
0085B4: AF                XOR A
0085B5: 32 75 40 D1       LD (D14075),A          ; clear D14075 (poll-retry counter)
0085B9: 01 00 08 00       LD BC,0x000800
0085BD: C5                PUSH BC
0085BE: CD 2D 32 01       CALL 0x01322D          ; USB cleanup(0x0800)
0085C2: C1                POP BC
0085C3: C9                RET

; ===== HELPER: clear_usb_active =====
0085C4: AF                XOR A
0085C5: 32 89 40 D1       LD (D14089),A          ; D14089 = 0
0085C9: FD 21 80 00 D0    LD IY,0xD00080
0085CE: FD CB 43 D6       SET 2,(IY+0x43)        ; set bit 2 of (D000C3)
0085D2: C9                RET

; ===== HELPER: set_usb_active =====
0085D3: 3E 01             LD A,0x01
0085D5: 32 89 40 D1       LD (D14089),A          ; D14089 = 1
0085D9: FD 21 80 00 D0    LD IY,0xD00080
0085DE: FD CB 43 96       RES 2,(IY+0x43)        ; clear bit 2 of (D000C3)
0085E2: C9                RET
```

### CALL Targets (Function 1)

| Address | Purpose |
|---------|---------|
| 0x00218A | `__frameset0` — stack frame setup |
| 0x012756 | USB poll / check connection |
| 0x00883C | `dispatch_event(event_code, param)` — two-arg event dispatcher |
| 0x0126A9 | USB status check |
| 0x012914 | USB enumeration/setup |
| 0x0085D3 | `set_usb_active()` — D14089=1, RES 2,(IY+0x43) |
| 0x0085C4 | `clear_usb_active()` — D14089=0, SET 2,(IY+0x43) |
| 0x008454 | Post-dispatch handler (calls 0x006EB6, loops on D177B8) |
| 0x006EB6 | USB transfer check (called from 0x008527 and 0x008454) |
| 0x012456 | USB endpoint setup |
| 0x0125EA | USB transfer completion |
| 0x00E91E | State 0x98 handler |
| 0x00D9EE | USB data transfer |
| 0x00DA8C | USB completion |
| 0x01253F | USB finalize |
| 0x01322D | USB cleanup |

### RAM Addresses Read

| Address | Name | Purpose |
|---------|------|---------|
| D14080 | USB transfer-active flag | Gates entire function: if set, jumps to USB transfer handler |
| D177BB | Display-busy flag | If set, skips USB state checks, goes directly to mode dispatch |
| D177B8 | USB state code | Multi-value: 0xFF=idle, 0x40=special, 0x01=connected, 0x98=transfer |
| D14089 | USB callback state | Set/cleared by helpers (0x0085D3/0x0085C4) |
| IX+6 | Function parameter | Passed by caller: 0=clear_usb, 2=trigger USB poll |

### RAM Addresses Written

| Address | Value | Purpose |
|---------|-------|---------|
| D17796 | 0x00 | Event-pending flag cleared after USB dispatch |
| D14074 | 0x00 | USB callback-pending cleared when state=0x01 |
| D14075 | 0x00 | Poll-retry counter cleared after USB transfer |
| D14089 | 0 or 1 | USB active flag (via helpers) |
| D000C3 | bit 2 | SET/RES via (IY+0x43) — USB-related display flag |

### How It Routes to Mode-Specific Handlers

The function does NOT directly route to mode-specific key handlers. Instead:

1. **Primary gate**: D14080 (USB transfer active) splits into two major paths:
   - D14080 == 0: USB connection polling + mode dispatch via D177B8 state
   - D14080 != 0: USB transfer handling (bulk data, state 0x98, port manipulation)

2. **USB state machine** (D177B8) drives the non-transfer path:
   - 0xFF (idle): Poll for USB connection, dispatch event 0xC4 or 0xC0
   - 0x40: Skip port manipulation
   - 0x01 (connected): Toggle USB active flag based on parameter
   - Other: Standard port 0x5005 bit 5 set + post-dispatch

3. **Mode-specific dispatch** happens via 0x008454 (post-dispatch) and 0x00883C (dispatch_event), which are separate functions that use D177B9 (the OS mode register) to route to per-mode handlers. The 0x00883C function internally contains a `__switch` on D177B9 with 11 cases routing to mode-specific handlers at 0x00868E–0x008834.

---

## Function 2: 0x03FA09 — Key Processor

**Size**: 0x03FA09–0x03FBE9 (481 bytes) for the main function body (ends at RET at 0x03FBE9).

### Full Disassembly

```asm
; ===== ENTRY: Read and clear raw scan code =====
03FA09: 21 87 05 D0       LD HL,0xD00587          ; address of raw scan code buffer
03FA0D: F3                DI                       ; disable interrupts (atomic read)
03FA0E: 7E                LD A,(HL)               ; A = raw scan code
03FA0F: 36 00             LD (HL),0x00            ; clear raw scan code (consume it)
03FA11: FD CB 00 9E       RES 3,(IY+0x00)         ; clear key-ready flag at (D00080)
03FA15: FB                EI
03FA16: F5                PUSH AF                 ; save scan code on stack
03FA17: B7                OR A
03FA18: C2 9A FB 03       JP NZ,0x03FB9A          ; if scan code != 0 -> process key

; ===== NO KEY PRESSED — auto-repeat / USB key injection path =====
03FA1C: 3A 91 40 D1       LD A,(D14091)           ; key-repeat enabled flag
03FA20: B7                OR A
03FA21: 28 70             JR Z,0x03FA93           ; if repeat disabled -> check USB key
03FA23: 3A B2 41 D1       LD A,(D141B2)           ; key-repeat state
03FA27: B7                OR A
03FA28: 28 14             JR Z,0x03FA3E           ; if repeat state == 0 -> check USB ON key
03FA2A: 3A BA 41 D1       LD A,(D141BA)           ; repeat delay counter
03FA2E: B7                OR A
03FA2F: 28 62             JR Z,0x03FA93           ; if delay expired -> check USB
03FA31: 3A 89 05 D0       LD A,(D00589)           ; ISR key-repeat trigger
03FA35: B7                OR A
03FA36: C2 9A FB 03       JP NZ,0x03FB9A          ; if ISR triggered repeat -> process as key
03FA3A: 32 B2 41 D1       LD (D141B2),A           ; clear repeat state

; --- ON key detection via port 0x500C ---
03FA3E: ED 57             LD A,I                 ; save IFF state
03FA40: EA 46 FA 03       JP PE,0x03FA46
03FA44: ED 57             LD A,I                 ; re-read (IFF2 stability workaround)
03FA46: F5                PUSH AF
03FA47: F3                DI
03FA48: C5                PUSH BC
03FA49-03FA77:                                    ; Read port 0x5000 bit 0 (ON key status)
                                                   ; via port 0x500C clear/read/restore sequence
03FA79: F1                POP AF                 ; ON key state
03FA7A: C1                POP BC
03FA7B: 20 10             JR NZ,0x03FA8D          ; if ON key NOT pressed -> restore & continue
03FA7D: F1                POP AF                 ; restore IFF
03FA7E: E2 83 FA 03       JP PO,0x03FA83
03FA82: FB                EI
03FA83: 3E 01             LD A,0x01
03FA85: 32 B2 41 D1       LD (D141B2),A           ; set repeat state = 1 (ON key detected)
03FA89: C3 D6 FB 03       JP 0x03FBD6            ; -> write key code 0x39 (ON) to D141B5
03FA8D: F1                POP AF
03FA8E: E2 93 FA 03       JP PO,0x03FA93
03FA92: FB                EI

; ===== USB KEY INJECTION CHECK =====
03FA93: 3A 00 00 D0       LD A,(D00000)           ; USB key buffer
03FA97: B7                OR A
03FA98: CA 9A FB 03       JP Z,0x03FB9A           ; if no USB key -> go to final key output
03FA9C: FE CC             CP 0xCC                 ; magic marker 0xCC
03FA9E: C2 9A FB 03       JP NZ,0x03FB9A          ; if not 0xCC marker -> skip

; --- USB key injection active ---
03FAA2: C5                PUSH BC
03FAA3: 01 04 50 00       LD BC,0x005004          ; USB control port
03FAA7: ED 78             IN A,(C)
03FAA9: CB 47             BIT 0,A                ; check USB ready bit
03FAAB: 20 0F             JR NZ,0x03FABC          ; if already set -> skip
03FAAD-03FABB:                                    ; SET bit 0 of port 0x5004 + safety check
03FABC: C1                POP BC
03FABD: CD 5C 51 02       CALL 0x02515C          ; USB key decode
03FAC1: CD F4 05 00       CALL 0x0005F4           ; validate decoded key
03FAC5: CA 9A FB 03       JP Z,0x03FB9A           ; if invalid -> skip

; --- Process USB-injected key ---
03FAC9: FD 21 80 00 D0    LD IY,0xD00080
03FACE: FD CB 1B 6E       BIT 5,(IY+0x1B)        ; check "USB key processing" flag
03FAD2: C2 9A FB 03       JP NZ,0x03FB9A          ; if already processing -> skip (reentrance guard)
03FAD6: FD CB 1B EE       SET 5,(IY+0x1B)        ; set "USB key processing" flag

; --- D177B7 display-dirty dispatch ---
03FADA: 3A B7 77 D1       LD A,(D177B7)           ; display-dirty flag
03FADE: FE 55             CP 0x55                 ; 0x55 = display needs refresh before key
03FAE0: 28 11             JR Z,0x03FAF3           ; -> refresh path
03FAE2: FE AA             CP 0xAA                 ; 0xAA = display clean, direct dispatch
03FAE4: CA 6C FB 03       JP Z,0x03FB6C           ; -> direct key dispatch

; --- Default path (D177B7 != 0x55 and != 0xAA) ---
03FAE8: C5                PUSH BC
03FAE9: D5                PUSH DE
03FAEA: E5                PUSH HL
03FAEB: DD E5             PUSH IX
03FAED: CD C4 8A 04       CALL 0x048AC4           ; default key handler
03FAF1: 18 1F             JR 0x03FB12             ; -> post-processing

; --- Display refresh path (D177B7 == 0x55) ---
03FAF3: C5                PUSH BC
03FAF4: D5                PUSH DE
03FAF5: E5                PUSH HL
03FAF6: DD E5             PUSH IX
03FAF8: ED 38 0F          IN0 A,(0x0F)            ; read port 0x0F (LCD status)
03FAFB: CB 77             BIT 6,A                ; check bit 6 (display transfer ready)
03FAFD: 28 13             JR Z,0x03FB12           ; if not ready -> skip display work
03FAFF: CB 7F             BIT 7,A                ; check bit 7 (display busy)
03FB01: 20 0F             JR NZ,0x03FB12          ; if busy -> skip
03FB03: CD 87 90 04       CALL 0x049087           ; display refresh
03FB07: B7                OR A
03FB08: 20 08             JR NZ,0x03FB12          ; if error -> skip token dispatch
03FB0A: CD 07 9E 04       CALL 0x049E07           ; token dispatch (key -> command execution)
03FB0E: FE 01             CP 0x01
03FB10: 28 5A             JR Z,0x03FB6C           ; if result == 1 -> direct dispatch

; ===== POST-PROCESSING (after key handler) =====
03FB12: FD 21 80 00 D0    LD IY,0xD00080
03FB17-03FB2A:                                    ; Clear bit 0 of port 0x5004 + safety check

; --- Modifier key state management ---
03FB2C: FD CB 59 8E       RES 1,(IY+0x59)        ; clear temp modifier
03FB30: FD CB 09 66       BIT 4,(IY+0x09)        ; test persistent modifier
03FB34: 28 04             JR Z,0x03FB3A
03FB36: FD CB 59 CE       SET 1,(IY+0x59)        ; copy persistent -> temp
03FB3A: FD CB 09 A6       RES 4,(IY+0x09)        ; clear persistent modifier

; --- Call key callback with arg 0 ---
03FB3E: 01 00 00 00       LD BC,0x000000
03FB42: C5                PUSH BC
03FB43: CD 56 96 04       CALL 0x049656           ; key_callback(0) — notify OS of key event

; --- Restore modifier state ---
03FB47: FD 21 80 00 D0    LD IY,0xD00080
03FB4C: FD CB 59 4E       BIT 1,(IY+0x59)
03FB50: 28 04             JR Z,0x03FB56
03FB52: FD CB 09 E6       SET 4,(IY+0x09)        ; restore persistent modifier

; --- Re-enable USB key bit + safety check ---
03FB56: 01 04 50 00       LD BC,0x005004
03FB5A-03FB6A:                                    ; SET bit 0 of port 0x5004 + safety check

; --- Cleanup ---
03FB6B: C1                POP BC
03FB6C: CD F5 9E 04       CALL 0x049EF5           ; finalize key dispatch
03FB70: DD E1             POP IX
03FB72: E1                POP HL
03FB73: D1                POP DE
03FB74: C1                POP BC
03FB75: FD 21 80 00 D0    LD IY,0xD00080
03FB7A: FD CB 1B AE       RES 5,(IY+0x1B)        ; clear "USB key processing" flag
03FB7E: 3A 66 77 D1       LD A,(D17766)           ; display update request
03FB82: CB 7F             BIT 7,A
03FB84: 28 0A             JR Z,0x03FB90
03FB86: CB BF             RES 7,A
03FB88: 32 66 77 D1       LD (D17766),A           ; clear display update bit
03FB8C: CD 33 C0 02       CALL 0x02C033           ; trigger display update

03FB90: FD CB 41 5E       BIT 3,(IY+0x41)        ; check "re-dispatch needed" flag
03FB94: FD CB 41 9E       RES 3,(IY+0x41)        ; clear it
03FB98: 20 50             JR NZ,0x03FBEA          ; if re-dispatch -> jump to alternate exit

; ===== FINAL KEY OUTPUT SECTION (0x03FB9A) =====
; Reached when: scan code == 0 with no USB key, or after USB key processing
03FB9A: F1                POP AF                 ; recover original scan code
03FB9B: F5                PUSH AF
03FB9C: FD CB 12 46       BIT 0,(IY+0x12)        ; check "key processing enabled" flag
03FBA0: 28 1E             JR Z,0x03FBC0           ; if disabled -> skip modifier checks

; --- Special key filtering ---
03FBA2: FE 0F             CP 0x0F                ; scan code == 0x0F (Power key)?
03FBA4: 28 0C             JR Z,0x03FBB2           ; -> set wake flag
03FBA6: FD CB 09 66       BIT 4,(IY+0x09)        ; modifier active?
03FBAA: 20 06             JR NZ,0x03FBB2
03FBAC: FD CB 43 66       BIT 4,(IY+0x43)        ; another modifier flag
03FBB0: 28 0E             JR Z,0x03FBC0           ; if no modifiers -> skip

; --- Set wake/activity flag ---
03FBB2: FD CB 5B F6       SET 6,(IY+0x5B)        ; set "key activity" flag
03FBB6: FD CB 5C 46       BIT 0,(IY+0x5C)        ; check "force ON key" mode
03FBBA: 28 04             JR Z,0x03FBC0
03FBBC: F1                POP AF
03FBBD: 3E 0F             LD A,0x0F              ; REPLACE scan code with 0x0F (ON key)
03FBBF: F5                PUSH AF

; ===== WRITE PROCESSED KEY =====
03FBC0: B7                OR A
03FBC1: 28 25             JR Z,0x03FBE8           ; if scan code == 0 -> skip (no key)
03FBC3: 3A 91 40 D1       LD A,(D14091)           ; key-repeat enabled
03FBC7: B7                OR A
03FBC8: 28 1E             JR Z,0x03FBE8           ; if repeat disabled -> skip

; --- Store repeat state and check modifiers ---
03FBCA: 32 B2 41 D1       LD (D141B2),A           ; store repeat state
03FBCE: F1                POP AF                 ; recover scan code
03FBCF: F5                PUSH AF
03FBD0: FD CB 28 5E       BIT 3,(IY+0x28)        ; check "2nd key active" flag
03FBD4: 28 02             JR Z,0x03FBD8
03FBD6: 3E 39             LD A,0x39              ; REPLACE with 0x39 if 2nd modifier active

; --- Write to D141B5 (the actual key output) ---
03FBD8: F5                PUSH AF
03FBD9: 3A B5 41 D1       LD A,(D141B5)           ; check if output slot already occupied
03FBDD: B7                OR A
03FBDE: 20 07             JR NZ,0x03FBE7          ; if occupied -> discard new key (don't overwrite)
03FBE0: F1                POP AF
03FBE1: 32 B5 41 D1       LD (D141B5),A           ; *** WRITE PROCESSED KEY ***
03FBE5: 18 01             JR 0x03FBE8
03FBE7: F1                POP AF                 ; discard (slot was occupied)
03FBE8: F1                POP AF
03FBE9: C9                RET

; ===== ALTERNATE EXIT (re-dispatch path) =====
03FBEA: FD CB 08 8E       RES 1,(IY+0x08)
03FBEE: C3 0A C6 08       JP 0x08C60A            ; jump to extended handler
```

### CALL Targets (Function 2)

| Address | Purpose |
|---------|---------|
| 0x02515C | USB key decode |
| 0x0005F4 | Validate decoded key |
| 0x048AC4 | Default key handler (when D177B7 is neither 0x55 nor 0xAA) |
| 0x049087 | Display refresh (called when port 0x0F bit 6 set, bit 7 clear) |
| 0x049E07 | Token dispatch (key -> command execution) |
| 0x049656 | `key_callback(0)` — notify OS of key event |
| 0x049EF5 | Finalize key dispatch |
| 0x02C033 | Trigger display update |

### RAM Addresses Read

| Address | Purpose |
|---------|---------|
| D00587 | Raw scan code buffer (ISR writes here) |
| D14091 | Key-repeat enabled flag |
| D141B2 | Key-repeat state |
| D141BA | Repeat delay counter |
| D00589 | ISR key-repeat trigger |
| D00000 | USB key buffer (0xCC = magic marker) |
| D177B7 | Display-dirty flag (0x55=needs refresh, 0xAA=clean) |
| D141B5 | Processed key output slot (checked before writing) |
| D17766 | Display update request (bit 7) |
| (IY+0x00) | Key-ready flag (D00080) |
| (IY+0x09) | Modifier flags (bit 4 = persistent modifier) |
| (IY+0x12) | Key processing enabled (bit 0), other flags (bits 6,7) |
| (IY+0x1B) | USB key processing guard (bit 5) |
| (IY+0x28) | 2nd key modifier active (bit 3) |
| (IY+0x41) | Re-dispatch needed (bit 3) |
| (IY+0x43) | Modifier flag (bit 4) |
| (IY+0x59) | Temp modifier (bit 1) |
| (IY+0x5B) | Key activity flag (bit 6) |
| (IY+0x5C) | Force ON key mode (bit 0) |
| Port 0x0F | LCD status (bit 6=transfer ready, bit 7=busy) |
| Port 0x5000 | ON key status (bit 0) |
| Port 0x5004 | USB control (bit 0) |
| Port 0x500C | USB clear/read port |

### RAM Addresses Written

| Address | Value | Purpose |
|---------|-------|---------|
| D00587 | 0x00 | Clear raw scan code after reading |
| D141B2 | 0/1/A | Key-repeat state |
| D141B5 | key code | **THE processed key output** |
| D17766 | clear bit 7 | Acknowledge display update |
| (IY+0x00) bit 3 | 0 | Clear key-ready flag |
| (IY+0x08) bit 1 | 0 | Clear re-dispatch flag (alternate exit) |
| (IY+0x09) bit 4 | 0/1 | Modifier state management |
| (IY+0x1B) bit 5 | 0/1 | USB key processing guard |
| (IY+0x41) bit 3 | 0 | Clear re-dispatch needed |
| (IY+0x59) bit 1 | 0/1 | Temp modifier state |
| (IY+0x5B) bit 6 | 1 | Set key activity flag |

### Scan Code to Key Code Transformation

The transformation is NOT a computation — it is a **direct identity pass-through** with two override cases:

1. **Normal path**: The raw scan code from D00587 passes through the entire function unchanged and is written directly to D141B5 at 0x03FBE1. The scan code IS the key code.

2. **Override 1 — ON key**: If the ON key is detected via port 0x5000 (hardware, not keyboard matrix), or if `(IY+0x5C)` bit 0 is set ("force ON mode"), the key code is replaced with **0x0F** (the ON key code).

3. **Override 2 — 2nd modifier**: If `(IY+0x28)` bit 3 is set (2nd key active), the key code is replaced with **0x39** regardless of the original scan code.

4. **No-overwrite guard**: If D141B5 already contains a non-zero value, the new key is discarded — the old key takes priority.

**There is a separate lookup table at 0x03FC41** (64 bytes, 8x8 matrix indexed by scan code) used by the CALLER function at 0x03FC1C — not by 0x03FA09 itself. That caller reads D0058D for a remapped scan index, looks up the table to get a key code, then calls 0x03FA09. The table maps physical keyboard matrix positions to TI-84 key codes.

### How 0x00846E Reaches Mode-Specific Key Handling

0x00846E does NOT call 0x03FA09 directly. The chain is:

1. **Scheduler** calls 0x00846E every loop when port 0x0F bit 7 is set
2. 0x00846E calls **0x00883C** (`dispatch_event`) with event codes (0xC4 or 0xC0)
3. 0x00883C internally uses **`__switch` on D177B9** (the OS mode register) with 11 cases:
   - Cases 0x01–0x04 -> 0x00862C (simple modes: home, graph, etc.)
   - Cases 0x10–0x15, 0x2E -> 0x008632 (editor/menu modes)
   - Case 0x30 -> 0x008806 (special mode)
4. Each mode handler eventually invokes the key processor (0x03FA09) through the ISR -> D00587 -> D141B5 pipeline
5. The ISR writes to D00587; the event loop's key processor (0x03FA09) converts it and writes to D141B5; the mode-specific handler reads D141B5

### Function Sizes Summary

| Function | Start | End | Size |
|----------|-------|-----|------|
| 0x00846E main body | 0x00846E | 0x008526 | 185 bytes |
| 0x00846E + USB handler + helpers | 0x00846E | 0x0085E2 | 373 bytes |
| 0x03FA09 main body | 0x03FA09 | 0x03FBE9 | 481 bytes |
| 0x03FA09 + alternate exit | 0x03FA09 | 0x03FBF1 | 489 bytes |

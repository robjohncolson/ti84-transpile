# Phase 445 — OS Scheduler Trace at 0x001612

**Probe**: `probe-phase445-scheduler-trace.mjs`  
**ROM**: TI-84 Plus CE OS 5.8.2.0029 (eZ80 ADL mode, 24-bit addresses)

## Scheduler Region: 0x0015F7–0x00164E

The scheduler is **not** a standalone function at 0x001612. It is a **loop body** that starts mid-function. The true loop top is at **0x0015F7**, and the loop back target (JR Z at 0x001617 / 0x00161B / 0x00162A) is also 0x0015F7.

### Full Disassembly

```asm
; --- Loop top (re-entry point for scheduler) ---
0x0015F7:  CALL 0x001652         ; read keyboard/port status
0x0015FB:  IN0  A,(0x0F)         ; read interrupt status port
0x0015FE:  BIT  7,A              ; test bit 7 (some ready flag)
;--- falls through to 0x001600 ---

0x001600:  LD   BC,0x000000      ; clear counter (entry init)
0x001604:  JR   NZ,0x001644      ; if bit 7 set, skip to 0x001644

0x001606:  BIT  6,A              ; test bit 6
0x001608:  LD   BC,0x000002      ; counter = 2
0x00160C:  JR   Z,0x00162C       ; if bit 6 clear → slow path (0x00162C)

; --- Fast path: event pending ---
0x00160E:  CALL 0x001794         ; main event handler (the big one)

; --- Post-event: check port 0x0F again ---
0x001612:  IN0  A,(0x0F)         ; re-read interrupt status
0x001615:  BIT  6,A              ; bit 6 still set?
0x001617:  JR   Z,0x0015F7       ; no → loop back (no display refresh needed)
0x001619:  BIT  7,A              ; bit 7 set?
0x00161B:  JR   Z,0x0015F7       ; no → loop back

; --- Display refresh path (both bits 6+7 set) ---
0x00161D:  XOR  A                ; A = 0
0x00161E:  LD   (0xD177B7),A     ; clear display-dirty flag
0x001622:  PUSH IY               ; preserve IY
0x001624:  CALL 0x00B69E         ; ** DISPLAY REFRESH **
0x001628:  POP  IY               ; restore IY
0x00162A:  JR   0x0015F7         ; loop back to top

; --- Slow path: bit 6 was clear ---
0x00162C:  PUSH BC               ; save counter
0x00162D:  CALL 0x001296         ; status check (port polling)
0x001631:  JP   Z,0x001933       ; if zero → DI+HALT sleep (power save)
0x001635:  CALL 0x0017CE         ; timeout/watchdog handler
0x001639:  CALL 0x01275B         ; system service call
0x00163D:  CP   0x40             ; compare result
0x00163F:  JP   NC,0x001933      ; if >= 0x40 → DI+HALT sleep
0x001643:  POP  BC               ; restore counter

; --- Common exit: dispatch to app handler ---
0x001644:  PUSH IY
0x001646:  PUSH BC
0x001647:  CALL 0x00846E         ; app-level event handler
0x00164B:  POP  BC
0x00164C:  POP  IY
0x00164E:  JP   0x001584         ; → display init chain → loops back to 0x0015F7
```

## Main Event Handler: 0x001794

Called from 0x00160E when port 0x0F bit 6 indicates an event is pending.

```asm
0x001794:  LD   B,0xF8           ; retry counter = 248
0x001796:  CALL 0x001778         ; set timer: LD (D02658),0x000026 (38 ticks)
0x00179A:  CALL 0x001296         ; status check
0x00179E:  JR   Z,0x0017BC       ; if zero → error path

; --- Event present ---
0x0017A0:  CALL 0x001652         ; read keyboard/port status
0x0017A4:  IN0  A,(0x0F)         ; check port 0x0F
0x0017A7:  BIT  7,A              ; bit 7?
0x0017A9:  JR   NZ,0x0017AF      ; if set → return immediately
0x0017AB:  BIT  6,A              ; bit 6?
0x0017AD:  JR   NZ,0x0017B0      ; if set → continue processing
0x0017AF:  RET                   ; exit handler (bits indicate done)

; --- Continue processing ---
0x0017B0:  CALL 0x001783         ; EI + HALT + check D02658 timer
0x0017B4:  JR   NZ,0x00179A      ; if timer not expired → retry (back to status check)
0x0017B6:  CALL 0x0017CE         ; timeout handler
0x0017BA:  DJNZ 0x001796         ; decrement B, loop if not zero (up to 248 retries)

; --- Exhausted retries: error display ---
0x0017BC:  PUSH HL
0x0017BD:  LD   HL,0x000000
0x0017C1:  LD   (0xD00595),HL    ; clear error code
0x0017C5:  POP  HL
0x0017C6:  LD   DE,0x000000
0x0017CA:  JP   0x003A0F         ; → error display ("ERROR! Press any key...")
```

## Timer/Watchdog Handler: 0x0017CE

```asm
0x0017CE:  PUSH HL
0x0017CF:  LD   HL,0x000C00      ; timeout value = 3072
0x0017D3:  CALL 0x0017DD         ; store + rotate watchdog byte
0x0017D7:  POP  HL
0x0017D8:  RET
```

### Watchdog Rotation at 0x0017DD

```asm
0x0017DD:  PUSH AF
0x0017DE:  LD   (0xD00595),HL    ; store timeout value
0x0017E2:  LD   A,(0xD17744)     ; read rotation counter
0x0017E6:  INC  A                ; increment
0x0017E7:  AND  0x03             ; mod 4 (cycles through 0,1,2,3)
0x0017E9:  LD   (0xD17744),A     ; store back
0x0017ED:  LD   HL,0x0017D9      ; base of 4-byte watchdog table
0x0017F1:  ADD  A,L              ; index into table
0x0017F2:  LD   L,A
0x0017F3:  LD   A,0x00
0x0017F5:  ADC  A,H
0x0017F6:  LD   H,A
0x0017F7:  LD   A,(HL)           ; read watchdog byte
0x0017F8:  CALL 0x0059C6         ; dispatch watchdog
0x0017FC:  POP  AF
0x0017FD:  RET
```

The watchdog table at 0x0017D9 contains 4 bytes: `7C 2F 2D 5C`. These are rotated through on each call — likely a self-test pattern (CPL, DEC L, LD E,H → produces predictable register transforms).

## Wait-for-Event: 0x001778 and Sleep: 0x001783

```asm
; Set timer (called before polling loop)
0x001778:  PUSH HL
0x001779:  LD   HL,0x000026      ; 38 ticks
0x00177D:  LD   (0xD02658),HL    ; write to OS delay timer
0x001781:  POP  HL
0x001782:  RET

; Sleep until IRQ, then check timer
0x001783:  EI                    ; enable interrupts
0x001784:  HALT                  ; sleep until next IRQ
0x001785:  NOP                   ; (post-HALT NOP, standard practice)
0x001786:  PUSH HL
0x001787:  LD   HL,(0xD02658)    ; read timer countdown
0x00178B:  LD   A,L
0x00178C:  OR   H                ; is timer zero?
0x00178D:  JR   Z,0x001792       ; if zero → timer expired, return Z
0x00178F:  LD   A,0x01
0x001791:  OR   A                ; set NZ (timer still running)
0x001792:  POP  HL
0x001793:  RET                   ; Z = expired, NZ = still counting
```

## HALT Sleep (Power Save): 0x001933

Reached via JP from 0x001631 or 0x00163F when the scheduler has nothing to do.

```asm
0x001933:  CALL 0x00620D         ; pre-sleep cleanup
0x001937:  DI                    ; disable interrupts
0x001938:  LD   A,0xC0
0x00193A:  OUT0 (0x00),A         ; configure port 0x00 for sleep
0x00193D:  LD   A,0xC4
0x00193F:  OUT0 (0x09),A         ; configure port 0x09 for sleep
0x001942:  HALT                  ; ** DEEP SLEEP — waits for hardware IRQ **
0x001943:  LD   (0xD02AD7),DE    ; save wake reason
0x001948:  LD   A,(0xD02AD9)     ; read wake status
0x00194C:  RET                   ; return to caller (0x001631+3=0x001634 or 0x001642)
```

## Display Init / Re-entry: 0x001584

Reached via JP from 0x00164E (after app handler returns).

```asm
0x001584:  CALL 0x005BA6         ; clear/init display buffer
0x001588:  LD   HL,0x0157C2      ; string pointer (OS message)
0x00158C:  CALL 0x0059E9         ; print string
0x001590:  CALL 0x005A02         ; display update helper
0x001594:  CALL 0x005A20         ; display flush
0x001598:  CALL 0x005A02         ; display update helper (again)
0x00159C:  LD   HL,0x01580A      ; another string
0x0015A0:  CALL 0x0059E9         ; print string
; ... continues with port checks, then falls through to 0x0015F7 (loop top)
```

## Key RAM Addresses

| Address | Size | Role |
|---------|------|------|
| `D177B7` | 1 byte | Display-dirty flag — cleared before CALL 0x00B69E |
| `D02658` | 24-bit | OS delay timer — set to 38 ticks, decremented by timer ISR |
| `D00595` | 24-bit | Error/timeout code — set by various paths |
| `D00596` | 1 byte | Secondary status — cleared on entry/exit |
| `D17744` | 1 byte | Watchdog rotation counter (0–3 cycle) |
| `D02AD7` | 24-bit | HALT wake reason (DE saved after wake) |
| `D02AD9` | 1 byte | Wake status byte |
| `D177BA` | 1 byte | Pre-scheduler gate (checked at 0x001718) |

## Key Port I/O

| Port | Direction | Role |
|------|-----------|------|
| `0x0F` | IN0 | Interrupt/status register — bit 6 = event pending, bit 7 = display ready |
| `0x06` | IN0/OUT0 | Interrupt control — bit 2 toggled for flash operations |
| `0x24` | OUT0 | Flash control — 0x8C enables, 0x88 disables |
| `0x28` | IN0/OUT0 | Memory base register (MBASE context save/restore) |
| `0x00` | OUT0 | Sleep config (0xC0 before HALT) |
| `0x09` | OUT0 | Sleep config (0xC4 before HALT) |

## Call Graph

```
0x0015F7 ──── SCHEDULER LOOP TOP ────────────────────────
  │
  ├── CALL 0x001652  (keyboard/port status read)
  ├── IN0  A,(0x0F)  (check interrupt flags)
  │
  ├── [bit 7 set] → JR to 0x001644:
  │     ├── CALL 0x00846E  (app-level event handler)
  │     └── JP   0x001584  (display init → loop back)
  │
  ├── [bit 6 set] → CALL 0x001794:
  │     │   Main event handler (up to 248 retries):
  │     ├── CALL 0x001778  (set 38-tick timer in D02658)
  │     ├── CALL 0x001296  (status check)
  │     ├── CALL 0x001652  (keyboard/port read)
  │     ├── CALL 0x001783  (EI+HALT+check timer)
  │     ├── CALL 0x0017CE  (watchdog rotation)
  │     └── [exhausted] → JP 0x003A0F  (error display)
  │
  │   Post-event check (0x001612):
  │     ├── [bits 6+7 both set]:
  │     │     XOR A → LD (D177B7),A  (clear dirty flag)
  │     │     CALL 0x00B69E  ** DISPLAY REFRESH **
  │     │     JR → loop back
  │     └── [otherwise] → JR → loop back
  │
  └── [bit 6 clear] → slow path:
        ├── CALL 0x001296  (status check)
        ├── [Z] → JP 0x001933  (DI+HALT deep sleep)
        ├── CALL 0x0017CE  (watchdog)
        ├── CALL 0x01275B  (system service)
        ├── [result >= 0x40] → JP 0x001933  (DI+HALT deep sleep)
        └── → CALL 0x00846E + JP 0x001584  (app handler + display init)
```

## Key Findings

1. **Display refresh IS called from the scheduler.** When port 0x0F bits 6 and 7 are both set after the main event handler (0x001794) returns, the scheduler calls **0x00B69E** to refresh the display. The flag at **D177B7** is cleared first, suggesting it acts as a display-dirty latch.

2. **The scheduler has three paths:**
   - **Fast path** (bit 6 set): Process events via 0x001794, then conditionally refresh display
   - **Slow path** (bit 6 clear): Check status, potentially sleep via DI+HALT at 0x001933
   - **App dispatch** (bit 7 set on first check): Skip event processing, go directly to app handler at 0x00846E

3. **The event handler (0x001794) is a polling loop**, not a single dispatch. It retries up to 248 times (B=0xF8), sleeping via EI+HALT between each attempt, with a 38-tick timer. If all retries are exhausted, it falls through to the error display at 0x003A0F.

4. **Two distinct HALT sites:**
   - **0x001784** (inside 0x001783): Light sleep — EI+HALT, wakes on any IRQ, checks if timer D02658 has expired. Used for polling delays within the event handler.
   - **0x001942** (at 0x001933 path): Deep sleep — DI first, configures ports 0x00 and 0x09 for low-power mode, then HALT. Only a hardware interrupt (keyboard press, USB) can wake this.

5. **Port 0x0F is the central dispatch register.** Bit 6 = "event pending" (triggers event handler), bit 7 = "display ready" or "high-priority event" (triggers app handler or display refresh depending on context).

6. **D177B7 is the display-dirty flag.** Only cleared at 0x00161E immediately before the display refresh call. It is likely set by the event handler or ISR when the display buffer has been modified.

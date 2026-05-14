# Phase 320: All References to 0x0019B5 (Crash/Halt Handler)

## Crash Handler Disassembly

```
0x0019b5: F3           DI                    ; disable interrupts
0x0019b6: 3E 10        LD A,0x10             ; A = 0x10
0x0019b8: ED 39 00     OUT0 (0x00),A         ; write 0x10 to port 0x00 (CPU control)
0x0019bb: 00           NOP
0x0019bc: 00           NOP
0x0019bd: 76           HALT                  ; permanent halt - CPU stops
```

Port 0x00 is the eZ80 CPU control register. Writing 0x10 likely triggers a reset/shutdown signal before the CPU halts. This is an unrecoverable crash: interrupts disabled, hardware signaled, then HALT with no wake source.

## Reference Summary

Found **19 references** (not 13 as originally estimated from session 319). All 19 are non-return crash paths.

| # | Address | Instruction | Category | Trigger Condition |
|---|---------|-------------|----------|-------------------|
| 1 | 0x00004F | JP NZ | ISR validation | CALL 0x0008bb returns NZ (ISR integrity check fails) |
| 2 | 0x0003AC | JP | BCALL table | BCALL index 0x1E invoked (deliberate crash BCALL) |
| 3 | 0x00070C | JP NZ | Boot | RSMIX result != 0xD0 (flash unlock verification fails) |
| 4 | 0x000873 | JP | Boot | Unconditional after clearing RAM state (boot abort path) |
| 5 | 0x000DAA | JP NC | BCALL dispatch | Stack/memory bounds check fails (carry not set) |
| 6 | 0x000DF2 | JP Z | Flash check | Port 0x28 bit 3 = 0 (flash not ready/unlocked) |
| 7 | 0x001420 | JP | Main loop | Key code = 0x06/0x22 after zeroing D0301B (specific error state) |
| 8 | 0x001B19 | JP NZ | Reset sequence | OUT (C),A readback: B != 0x10 (port 0x1005 write failed) |
| 9 | 0x001B24 | JP NZ | Reset sequence | OUT0 (0x01),A readback: A != 0x03 (clock config failed) |
| 10 | 0x001BA8 | JP | Reset sequence | Unconditional after flash/port init (reset-to-crash path) |
| 11 | 0x0094F7 | CALL | Port init | After port 0x3014 write loop + bit 4 check (GPIO init done) |
| 12 | 0x0099A3 | CALL | Port init | After CALL 0x00C9A0 + port 0x314C write loop (LCD init done) |
| 13 | 0x0099B8 | CALL | Port init | LD A,(0xD1772D); OR A; non-zero = crash (link error flag set) |
| 14 | 0x00F3FB | CALL | OS init | (0xD177BA) bit 7 set (OS state corruption flag) |
| 15 | 0x01401A | CALL | Link/USB | CALL 0x006EDA returns non-zero (link receive error) |
| 16 | 0x0141B3 | CALL | Link/USB | Unconditional after port 0x03 bit 4 check (link error path) |
| 17 | 0x0149D2 | CALL | Link/USB | CALL 0x006EDA returns non-zero (link receive error) |
| 18 | 0x0149ED | CALL | Link/USB | CALL 0x006EDA returns non-zero (link receive error) |
| 19 | 0x015110 | CALL | Link/USB | CALL 0x006EDA returns non-zero (link receive error) |

## Detailed Disassembly by Category

### Category 1: ISR / Interrupt Validation (1 site)

#### Site 1: 0x00004F - ISR trampoline integrity check

```
0x000047: E5           PUSH HL
0x000048: C5           PUSH BC
0x000049: CD BB 08 00  CALL 0x0008bb          ; ISR integrity/validation check
0x00004D: C1           POP BC
0x00004E: E1           POP HL
0x00004F: C2 B5 19 00  JP NZ,0x0019b5         ; if check fails -> CRASH
0x000053: F1           POP AF
0x000054: C3 A8 20 02  JP 0x0220a8            ; normal ISR continuation
```

**Context**: This is in the low-ROM interrupt vector area. Before dispatching to the actual ISR handler at 0x0220A8, it calls 0x0008BB to validate the interrupt context. If validation fails (NZ), the system crashes rather than running a corrupted ISR.

### Category 2: BCALL Jump Table (1 site)

#### Site 2: 0x0003AC - BCALL index 0x1E = "ForceCrash"

```
0x00039C: C3 4D 19 00  JP 0x00194d            ; BCALL 0x1A
0x0003A0: C3 88 19 00  JP 0x001988            ; BCALL 0x1B
0x0003A4: C3 E9 6F 00  JP 0x006fe9            ; BCALL 0x1C
0x0003A8: C3 D1 6F 00  JP 0x006fd1            ; BCALL 0x1D
0x0003AC: C3 B5 19 00  JP 0x0019b5            ; BCALL 0x1E -> CRASH
0x0003B0: C3 05 3B 00  JP 0x003b05            ; BCALL 0x1F
```

**Context**: BCALL 0x1E is a deliberate "force crash" system call. Any OS code that calls `RST 28h` with index 0x1E will trigger an immediate halt. This is the OS equivalent of `abort()` - a programmatic crash that can be invoked from any context.

### Category 3: Boot / Reset Sequence (5 sites)

#### Site 3: 0x00070C - Flash unlock verification

```
0x0006FC: ED 39 06     OUT0 (0x06),A          ; write to flash control port
0x0006FF: FE 03        CP 0x03                ; expected value?
0x000701: 28 01        JR Z,0x000704          ; skip RST if match
0x000703: CF           RST 08h                ; soft error
0x000704: FD CB 1B F6  SET 6,(IY+0x1B)        ; set flag in IY table
0x000708: ED 6E        RSMIX                  ; restore mixed ADL mode
0x00070A: FE D0        CP 0xD0                ; must be 0xD0
0x00070C: C2 B5 19 00  JP NZ,0x0019b5         ; if != 0xD0 -> CRASH
0x000710: 2A D7 2A D0  LD HL,(0xD02AD7)       ; continue boot
0x000714: E5           PUSH HL
0x000715: CD 13 17 00  CALL 0x001713          ; next boot stage
```

**Trigger**: After RSMIX, the A register must equal 0xD0 (indicating correct ADL mode state). If the CPU mode is wrong after flash operations, the boot sequence cannot continue safely.

#### Site 4: 0x000873 - Boot abort after RAM clear

```
0x000862: AF           XOR A                  ; A = 0
0x000863: 32 BA 77 D1  LD (0xD177BA),A        ; clear OS state byte
0x000867: 32 BC 77 D1  LD (0xD177BC),A        ; clear another state byte
0x00086B: 21 00 00 00  LD HL,0x000000
0x00086F: 22 1B 30 D0  LD (0xD0301B),HL       ; clear error pointer
0x000873: C3 B5 19 00  JP 0x0019b5            ; -> CRASH (unconditional)
```

**Trigger**: Unconditional. This is reached after earlier checks pass but the boot sequence determines it cannot proceed. The RAM state is cleared before halting to prevent stale data from confusing a subsequent reset. Likely the "boot failed after N retries" path.

#### Site 8: 0x001B19 - Port write verification (1 of 2)

```
0x001B0A: 31 7E A8 D1  LD SP,0xD1A87E         ; set stack for reset
0x001B0E: 01 05 10 00  LD BC,0x001005         ; port address
0x001B12: 3E 04        LD A,0x04              ; value to write
0x001B14: ED 79        OUT (C),A              ; write 0x04 to port 0x1005
0x001B16: 78           LD A,B                 ; read back B (should still be 0x10)
0x001B17: FE 10        CP 0x10                ; verify B unchanged
0x001B19: C2 B5 19 00  JP NZ,0x0019b5         ; if B corrupted -> CRASH
```

**Trigger**: After writing to port 0x1005, the B register is verified to still contain 0x10. If a hardware fault or bus error corrupted the register during the OUT instruction, the system crashes. This is a paranoid hardware integrity check.

#### Site 9: 0x001B24 - Clock configuration verification

```
0x001B1D: 3E 03        LD A,0x03              ; clock divider value
0x001B1F: ED 39 01     OUT0 (0x01),A          ; write to port 0x01 (clock control)
0x001B22: FE 03        CP 0x03                ; A should still be 0x03
0x001B24: C2 B5 19 00  JP NZ,0x0019b5         ; if A corrupted -> CRASH
```

**Trigger**: Verifies that the A register was not corrupted by the OUT0 instruction. On a healthy eZ80, OUT0 never modifies A, so this would only fail on hardware with bus faults or silicon errata.

#### Site 10: 0x001BA8 - Reset completion crash

```
0x001B9C: 3E 88        LD A,0x88
0x001B9E: ED 39 24     OUT0 (0x24),A          ; write to memory control port
0x001BA1: FE 88        CP 0x88                ; verify A intact
0x001BA3: C2 66 00 00  JP NZ,0x000066         ; different crash path if corrupted
0x001BA7: F1           POP AF
0x001BA8: C3 B5 19 00  JP 0x0019b5            ; -> CRASH (unconditional)
```

**Trigger**: Unconditional. This is reached at the end of a reset/init sequence. After all hardware ports are configured, this path halts the CPU. This appears to be the "reset complete, power down" or "reset-to-safe-halt" path used when the OS determines it should not continue running.

### Category 4: Flash / Memory Protection (2 sites)

#### Site 5: 0x000DAA - BCALL dispatch bounds check

```
0x000D96: AF           XOR A                  ; A = 0
0x000D97: ED 42        SBC HL,BC              ; HL = HL - BC (with borrow)
0x000D99: EB           EX DE,HL
0x000D9A: D5           PUSH DE                ; save result
0x000D9B: ED B0        LDIR                   ; block copy
0x000D9D: 22 D7 2A D0  LD (0xD02AD7),HL       ; store pointer
0x000DA1: 3A D9 2A D0  LD A,(0xD02AD9)        ; load bounds byte
0x000DA5: ED 08        IN0 A,(0x08)           ; read port 0x08 (alt: this may be a 2-byte ED prefix)
0x000DA8: 0C           INC C
0x000DA9: B9           CP C                   ; compare
0x000DAA: D2 B5 19 00  JP NC,0x0019b5         ; if no carry (out of bounds) -> CRASH
```

**Trigger**: During BCALL dispatch, after copying the handler code, a bounds check is performed. If the comparison indicates an out-of-bounds access (carry not set), the system crashes rather than executing potentially corrupted code.

#### Site 6: 0x000DF2 - Flash status check

```
0x000DED: ED 38 28     IN0 A,(0x28)           ; read flash status port
0x000DF0: CB 5F        BIT 3,A                ; test bit 3 (flash ready?)
0x000DF2: CA B5 19 00  JP Z,0x0019b5          ; if bit 3 = 0 -> CRASH
0x000DF6: CD EB 1E 00  CALL 0x001eeb          ; continue with flash ops
0x000DFA: D8           RET C
```

**Trigger**: Port 0x28 is the flash controller status register. Bit 3 indicates flash is ready/unlocked. If flash is not ready when the OS expects it to be, execution cannot safely continue (flash contains all OS code), so the system crashes.

### Category 5: Main Loop Error (1 site)

#### Site 7: 0x001420 - Specific key event triggers crash

```
0x001409: FE 06        CP 0x06                ; check if key group = 0x06
0x00140B: 20 17        JR NZ,0x001424         ; not group 6, skip
0x00140D: 7D           LD A,L                 ; get key code low byte
0x00140E: FE A0        CP 0xa0                ; is it 0xA0?
0x001410: CA BD 14 00  JP Z,0x0014bd          ; handle 0xA0 separately
0x001414: FE 22        CP 0x22                ; is it 0x22?
0x001416: 20 0C        JR NZ,0x001424         ; not 0x22, skip
0x001418: 21 00 00 00  LD HL,0x000000
0x00141C: 22 1B 30 D0  LD (0xD0301B),HL       ; zero the error pointer
0x001420: C3 B5 19 00  JP 0x0019b5            ; -> CRASH
```

**Trigger**: When key group is 0x06 and key code is 0x22, the OS deliberately crashes. This appears to be a "panic key combination" or an error condition where the OS has received an impossible key event (0x0622 may not correspond to any real key). The error pointer at 0xD0301B is cleared before crashing, suggesting this is a "clean shutdown on fatal key error" path.

### Category 6: Port/Peripheral Init (2 sites)

#### Site 11: 0x0094F7 - GPIO port init completion

```
0x0094E4: 01 14 30 00  LD BC,0x003014         ; port address
0x0094E8: 3E 10        LD A,0x10              ; value
0x0094EA: ED 79        OUT (C),A              ; write to port
0x0094EC: 78           LD A,B                 ; readback B
0x0094ED: FE 30        CP 0x30                ; verify B = 0x30
0x0094EF: 28 01        JR Z,0x0094f2          ; OK
0x0094F1: CF           RST 08h                ; soft error if B wrong
0x0094F2: 79           LD A,C                 ; readback C  
0x0094F3: FE 14        CP 0x14                ; verify C = 0x14
0x0094F5: 20 FA        JR NZ,0x0094f1         ; loop/error if C wrong
0x0094F7: CD B5 19 00  CALL 0x0019b5          ; -> CRASH
```

**Trigger**: After writing to GPIO port 0x3014 and verifying BC integrity, the code calls the crash handler. This is unusual - it appears to be reached only when AND 0x10 at 0x94E0 is non-zero (bit 4 of 0xD14049 is set). That bit likely indicates a fatal hardware configuration state.

#### Site 12: 0x0099A3 - LCD controller init

```
0x00998C: 01 4C 31 00  LD BC,0x00314C         ; LCD control port
0x009990: 3E 01        LD A,0x01              ; value
0x009992: ED 79        OUT (C),A              ; write to LCD port
0x009994: 78           LD A,B                 ; verify B
0x009995: FE 31        CP 0x31
0x009997: 28 01        JR Z,0x00999a
0x009999: CF           RST 08h                ; error
0x00999A: 79           LD A,C
0x00999B: FE 4C        CP 0x4c                ; verify C
0x00999D: 20 FA        JR NZ,0x009999         ; loop
0x00999F: CD A0 C9 00  CALL 0x00c9a0          ; LCD init subroutine
0x0099A3: CD B5 19 00  CALL 0x0019b5          ; -> CRASH
```

**Trigger**: After LCD controller initialization. The CALL (not JP) means execution would return to 0x0099A7 after the crash handler, but since the crash handler halts, this is a deliberate dead-end. This code path is reached when a specific hardware condition flag is set during LCD init.

### Category 7: OS State Corruption (1 site)

#### Site 14: 0x00F3FB - OS state flag check

```
0x00F3F3: 3A BA 77 D1  LD A,(0xD177BA)        ; load OS state byte
0x00F3F7: E6 80        AND 0x80               ; test bit 7
0x00F3F9: 28 04        JR Z,0x00f3ff          ; bit 7 clear = OK, skip crash
0x00F3FB: CD B5 19 00  CALL 0x0019b5          ; bit 7 set -> CRASH
0x00F3FF: CD AF 6E 00  CALL 0x006eaf          ; continue normal init
```

**Trigger**: Address 0xD177BA is an OS state byte. Bit 7 being set indicates a corruption/error state. This check occurs during OS initialization after clearing several state variables (0xD176F8, 0xD17795, 0xD17796, 0xD177BB). If the corruption flag persists after cleanup, the OS cannot safely boot.

### Category 8: Link/USB Protocol Errors (5 sites)

All five link sites share the same pattern: `CALL 0x006EDA; POP BC; OR A; JR Z,+4; CALL 0x0019B5`. Function 0x006EDA appears to be a link/USB error checker. If it returns non-zero in A, the link state is unrecoverable and the OS crashes.

#### Site 13: 0x0099B8 - Link error flag

```
0x0099B0: C1           POP BC
0x0099B1: 3A 2D 77 D1  LD A,(0xD1772D)        ; link status byte
0x0099B5: B7           OR A                   ; test if zero
0x0099B6: 28 04        JR Z,0x0099bc          ; zero = OK
0x0099B8: CD B5 19 00  CALL 0x0019b5          ; non-zero -> CRASH
```

**Trigger**: 0xD1772D holds a link/USB error flag. If it's non-zero after a link operation, crash.

#### Sites 15, 17, 18, 19 (0x01401A, 0x0149D2, 0x0149ED, 0x015110) - Link receive errors

All four follow the identical pattern:
```
  LD BC,0x000000         ; param = 0
  PUSH BC
  CALL 0x006eda          ; check link state
  POP BC
  OR A                   ; test return value
  JR Z,+4               ; zero = OK
  CALL 0x0019b5          ; non-zero -> CRASH
```

These are scattered through the link/USB receive handler (0x14000-0x15200 region). Each represents a point where the link protocol state machine has entered an unrecoverable error.

#### Site 16: 0x0141B3 - Link port error

```
0x0141A3: ED 38 03     IN0 A,(0x03)           ; read link hardware port
0x0141A6: CB 67        BIT 4,A                ; test bit 4
0x0141A8: 21 00 00 00  LD HL,0x000000
0x0141AC: 28 04        JR Z,0x0141b2          ; bit 4 clear = skip
0x0141AE: 22 1B 30 D0  LD (0xD0301B),HL       ; zero error pointer
0x0141B2: 00           NOP
0x0141B3: CD B5 19 00  CALL 0x0019b5          ; -> CRASH (unconditional)
```

**Trigger**: Unconditional crash after checking link port bit 4. Whether or not the error pointer is cleared depends on port state, but the crash always happens. This is the terminal error path for the link receive function.

## Categorization Summary

| Category | Count | Sites | Nature |
|----------|-------|-------|--------|
| ISR validation | 1 | #1 | Runtime integrity check before ISR dispatch |
| BCALL table entry | 1 | #2 | Deliberate `abort()` system call (BCALL 0x1E) |
| Boot/reset sequence | 5 | #3,4,8,9,10 | Hardware verification during startup |
| Flash/memory protection | 2 | #5,6 | Bounds checks and flash readiness |
| Main loop error | 1 | #7 | Impossible key event detection |
| Port/peripheral init | 2 | #11,12 | Hardware init with fatal flag set |
| OS state corruption | 1 | #14 | Corruption flag in RAM state byte |
| Link/USB errors | 6 | #13,15,16,17,18,19 | Unrecoverable link protocol errors |

## Key Insights

1. **Hardware paranoia pattern**: Sites 3, 8, 9 verify that CPU registers were not corrupted by I/O instructions (OUT0 followed by CP of the same value). This detects bus faults and silicon errata. The eZ80 OUT0 instruction should never modify A, so these checks catch hardware-level failures.

2. **Two crash severity levels**: Most boot-time checks use JP (unconditional flow), while runtime checks use CALL. The CALL sites technically push a return address, but since the crash handler halts, this is irrelevant. The use of CALL may be a coding convention to distinguish "error in a subroutine" from "error in a flow."

3. **0xD0301B is the error context pointer**: Multiple sites zero `(0xD0301B)` before crashing. This address likely holds an error context or backtrace pointer. Clearing it signals "no additional error context" to any post-mortem reset handler.

4. **0xD177BA bit 7 is the corruption flag**: This byte is checked during OS init (site 14) and cleared during boot (site 4). It serves as a persistent "OS state is corrupt" indicator across warm resets.

5. **Link/USB is the most crash-prone subsystem**: 6 of 19 crash references (32%) are in the link/USB handler (0x14000-0x15200). The common helper 0x006EDA appears to be a "check link error" function whose non-zero return triggers immediate crash. This suggests the OS treats link protocol violations as unrecoverable.

6. **BCALL 0x1E = programmatic crash**: Any OS code can force a crash via `RST 28h` + index 0x1E. This is the software-triggered abort mechanism, equivalent to `__builtin_trap()`.

## Implications for Transpilation

- The crash handler is already stubbed in the transpiler. The 19 sites identified here are the complete set of ROM locations that can trigger it.
- Boot-time hardware checks (sites 3, 8, 9) will always crash in the transpiler unless the runtime simulates correct register preservation across OUT0 instructions. The current `cpu-runtime.js` likely handles this correctly since OUT0 is a no-op in emulation.
- Link/USB crash sites (sites 13, 15-19) are irrelevant unless link emulation is implemented.
- The BCALL 0x1E entry (site 2) should be noted as a known "dead" BCALL that always crashes.
- Flash status checks (site 6) require port 0x28 bit 3 to be set in `peripherals.js` to avoid spurious crashes during OS init.

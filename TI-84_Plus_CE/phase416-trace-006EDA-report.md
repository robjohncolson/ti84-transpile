# Phase 416: Trace 0x006EDA and 0x0019B5 -- Channel 3 Special Path

## Context

Session 415 decoded 0x0150C2 (generic completion dispatcher, 103 bytes at 0x0150C2-0x015128).
It has a **special case for Channel 3** (arg==3): if D176FC==0 AND D1772D!=0,
it calls 0x006EDA then optionally 0x0019B5. This probe traces both functions.

## 1. 0x006EDA -- USB Port Status Checker (87 bytes, 0x006EDA-0x006F30)

### Disassembly

```
0x006eda: DD E5              PUSH IX
0x006edc: DD 21 00 00 00     LD IX,0x000000
0x006ee1: DD 39              ADD IX,SP          ; IX = frame pointer
0x006ee3: FD 21 80 00 D0     LD IY,0xd00080     ; standard IY base
0x006ee8: ED 38              IN A,(C) [eZ80: TSTI]  ; read port status
0x006eea: 0F                 RRCA               ; shift bit 0 into carry/bit 7
0x006eeb: CB 7F              BIT 7,A            ; test original bit 0
0x006eed: 20 04              JR NZ,0x006ef3     ; if bit 0 was set, go to port polling
0x006eef: 3E 01              LD A,0x01          ; A=1 (return: "not ready" / "skip")
0x006ef1: 18 3B              JR 0x006f2e        ; jump to epilogue
; --- Port polling path ---
0x006ef3: 01 82 30 00        LD BC,0x003082     ; port 0x3082 (USB host control)
0x006ef7: ED 78              IN A,(C)           ; read port 0x3082
0x006ef9: CB 67              BIT 4,A            ; test bit 4
0x006efb: 20 0C              JR NZ,0x006f09     ; if set, check bit 5
0x006efd: 01 30 30 00        LD BC,0x003030     ; port 0x3030
0x006f01: ED 78              IN A,(C)           ; read port 0x3030
0x006f03: CB 47              BIT 0,A            ; test bit 0
0x006f05: 28 E8              JR Z,0x006eef      ; if clear -> return 1 (not ready)
0x006f07: 18 22              JR 0x006f2b        ; -> return 0 (ready)
0x006f09: CB 6F              BIT 5,A            ; test bit 5 of port 0x3082
0x006f0b: 20 1E              JR NZ,0x006f2b     ; if set -> return 0 (ready)
; --- Timeout polling loop ---
0x006f0d: 21 B8 24 00        LD HL,0x0024b8     ; timeout counter = 9400
0x006f11: 0E 31              LD C,0x31          ; port 0x3031 (BC=0x003031)
0x006f13: 16 00              LD D,0x00          ; D = accumulator for OR'd reads
0x006f15: ED 78              IN A,(C)           ; read port 0x3031
0x006f17: B2                 OR D               ; accumulate
0x006f18: 57                 LD D,A
0x006f19: E6 0C              AND 0x0c           ; mask bits 2-3
0x006f1b: FE 0C              CP 0x0c            ; both bits set?
0x006f1d: 28 0C              JR Z,0x006f2b      ; yes -> return 0 (ready)
0x006f1f: 2B                 DEC HL             ; decrement timeout
0x006f20: 7D                 LD A,L
0x006f21: B4                 OR H
0x006f22: 20 F1              JR NZ,0x006f15     ; loop until timeout
; --- Timeout expired ---
0x006f24: 7A                 LD A,D             ; check accumulated bits
0x006f25: E6 0C              AND 0x0c
0x006f27: FE 08              CP 0x08            ; only bit 3 set?
0x006f29: 28 C4              JR Z,0x006eef      ; yes -> return 1 (not ready)
; --- Return 0 (ready) ---
0x006f2b: [XOR A via IX+6 / frame access]       ; A = 0
0x006f2e: [epilogue: restore IX, return]
0x006f30: C9                 RET
```

### Analysis

**Purpose**: USB port status checker / readiness probe. Polls hardware I/O ports to determine if a USB endpoint is ready.

**Ports accessed**:
- Port 0x3082 -- USB host control register (bits 4, 5)
- Port 0x3030 -- USB status register (bit 0)
- Port 0x3031 -- USB data/status register (bits 2-3), polled in tight loop with timeout of 9400 iterations

**Return value**: A = 0 means "ready" (proceed with 0x0019B5 call), A != 0 means "not ready" (skip).

**Key behavior**:
1. Initial check via TSTI/IN -- if bit 0 clear, return 1 (not ready)
2. Read port 0x3082 bit 4 -- if clear, check port 0x3030 bit 0
3. If port 0x3082 bit 5 set -> ready (return 0)
4. Otherwise, poll port 0x3031 up to 9400 times waiting for bits 2+3 both set
5. On timeout: if only bit 3 set -> not ready; otherwise -> ready

**No RAM reads or writes** (pure I/O polling). **No subroutine calls** (leaf function).

## 2. 0x0019B5 -- USB Interrupt Service Routine (~250 bytes, 0x0019B5-0x001AF6)

### Disassembly (key sections)

```
0x0019b5: F3                 DI                 ; disable interrupts
0x0019b6: 3E 10              LD A,0x10
0x0019b8: ED 39              OUT (C),A [eZ80]   ; write to port
; ... save state (IX, IY, EXX, EX AF,AF') ...
0x0019bf: 01 15 50 ED        LD BC -> port 0x5015 (USB IRQ status)
0x0019c3: IN A,(C)                              ; read interrupt status
0x0019c4: JR Z,0x0019ef                         ; if zero, check alternate port
; --- Bit-scan dispatch (port 0x5015) ---
0x0019c6: LD C,0x09                             ; port 0x5009 (USB IRQ ack)
0x0019c8-0x0019dd: RLA bit-scan:
  - bit 6 -> 0x001a4b: SET 6,A; OUT (C),A; -> exit
  - bit 5 -> 0x001a77: SET 5,A; OUT (C),A; CALL 0x009b35; -> exit
  - bit 4 -> 0x001a8d: SET 4,A; OUT (C),A; CALL 0x010220; -> exit
  - bit 2 -> 0x001abb: SET 2,A; OUT (C),A; -> exit
  - default: LD A,0xFF; OUT (C),A (ack all)
; --- Alternate port check ---
0x0019ef: DEC C                                 ; -> port 0x5008
0x0019f0: IN A,(C)                              ; read port 0x5008
0x0019f2: JR Z,0x001a17                         ; if zero -> further alt path
; --- Bit-scan dispatch (port 0x5008) ---
0x0019f4: LD C,0x08                             ; ack port
0x0019f6-0x001a06: RRA bit-scan:
  - bit 3 -> 0x001aa3: SET 3,A; OUT (C),A; CALL 0x014dab; -> exit
  - bit 4 -> 0x001acf: LD A,0x10; OUT (C),A; dec D02651; -> exit
  - default: LD A,0xFF; OUT (C),A
; --- Common exit (0x001a32) ---
0x001a32: POP HL
0x001a33-36: LD (D02AD7),HL                     ; restore saved state
0x001a37: LD IY,0xd00080
0x001a3c: RES 6,(IY+27)                         ; clear "in ISR" flag (D0009B bit 6)
0x001a40: POP IY
0x001a42: POP IX
0x001a44: EXX; EX AF,AF'
0x001a48: EI
0x001a49: RETI
```

### Analysis

**Purpose**: USB interrupt service routine. Reads USB interrupt status ports and dispatches to the appropriate handler based on which interrupt bit is set.

**Ports accessed**:
- Port 0x5015 -- USB interrupt status (read), dispatches on bits 6/5/4/2
- Port 0x5009 -- USB interrupt acknowledge for port 0x5015 (write)
- Port 0x5008 -- USB alternate interrupt status/ack, dispatches on bits 3/4
- Port 0x5006 -- USB control (in one sub-handler)

**Subroutines called from ISR branches**:

| IRQ source | Bit | Handler called |
|------------|-----|----------------|
| Port 0x5015 bit 6 | 6 | (ack only, no handler) |
| Port 0x5015 bit 5 | 5 | CALL 0x009B35 |
| Port 0x5015 bit 4 | 4 | CALL 0x010220 |
| Port 0x5015 bit 2 | 2 | (ack only, no handler) |
| Port 0x5008 bit 3 | 3 | CALL 0x014DAB |
| Port 0x5008 bit 4 | 4 | decrement D02651 counter |

**RAM accessed**:
- D02AD7 -- saves/restores HL (interrupt context)
- D02651 -- USB event counter (decremented in ISR)
- D0009B (IY+27) -- bit 6 = "in USB ISR" flag, cleared on exit

## 3. Callers of 0x006EDA (8 total)

| Address | Type | Context |
|---------|------|---------|
| 0x000604 | JP | Early boot / reset vector area |
| 0x00FB01 | CALL | ROM utility region |
| 0x013711 | CALL | USB protocol handler |
| 0x0137FA | CALL | USB protocol handler |
| 0x014012 | CALL | USB transfer region |
| 0x0149CA | CALL | USB completion region |
| 0x0149E5 | CALL | USB completion region |
| 0x015108 | CALL | **0x0150C2 dispatcher (Channel 3 path)** |

All 8 references accounted for (7 CALL + 1 JP). Broad search confirms no LD-based references.

## 4. Callers of 0x0019B5 (13 direct + 6 conditional)

### Direct callers (CALL/JP)

| Address | Type | Context |
|---------|------|---------|
| 0x0003AC | JP | Interrupt vector table |
| 0x000873 | JP | Interrupt vector table |
| 0x001420 | JP | Interrupt dispatch |
| 0x001BA8 | JP | Interrupt dispatch |
| 0x0094F7 | CALL | USB driver |
| 0x0099A3 | CALL | USB driver |
| 0x0099B8 | CALL | USB driver |
| 0x00F3FB | CALL | USB support |
| 0x01401A | CALL | USB transfer |
| 0x0141B3 | CALL | USB transfer |
| 0x0149D2 | CALL | USB completion |
| 0x0149ED | CALL | USB completion |
| 0x015110 | CALL | **0x0150C2 dispatcher (Channel 3 path)** |

### Conditional JP references

| Address | Condition |
|---------|-----------|
| 0x00004F | JP NZ |
| 0x00070C | JP NZ |
| 0x000DAA | JP NC |
| 0x000DF2 | JP Z |
| 0x001B19 | JP NZ |
| 0x001B24 | JP NZ |

Total: 19 references to 0x0019B5 across the ROM.

## 5. Cross-reference: The Channel 3 Special Path in 0x0150C2

The exact sequence verified from hex dump at 0x0150E4-0x015114:

```
0x0150e4: AF              XOR A                    ; A = 0
0x0150e5: 32 FB 76 D1     LD (0xD176FB),A          ; clear D176FB
0x0150e9: 3A FC 76 D1     LD A,(0xD176FC)          ; read D176FC
0x0150ed: B7              OR A                     ; test if zero
0x0150ee: 20 24           JR NZ,0x015114           ; if D176FC != 0 -> skip (busy)
0x0150f0: 01 03 00 00     LD BC,0x000003           ; BC = 3
                          [IX-relative load]        ; load arg from stack frame
0x0150f8: ED 42           SBC HL,BC                ; HL - 3
0x0150fa: 20 18           JR NZ,0x015114           ; if arg != 3 -> skip (not Channel 3)
0x0150fc: 3A 2D 77 D1     LD A,(0xD1772D)          ; read D1772D
0x015100: B7              OR A                     ; test if zero
0x015101: 28 11           JR Z,0x015114            ; if D1772D == 0 -> skip (no pending work)
; --- Channel 3 special path ---
0x015103: 01 00 00 00     LD BC,0x000000           ; push 0 as argument
0x015107: C5              PUSH BC
0x015108: CD DA 6E 00     CALL 0x006EDA            ; check USB port readiness
0x01510c: C1              POP BC                   ; clean stack
0x01510d: B7              OR A                     ; test return value
0x01510e: 28 04           JR Z,0x015114            ; if A==0 -> skip (not ready)
0x015110: CD B5 19 00     CALL 0x0019B5            ; fire USB ISR handler
0x015114: [common exit]
```

### Verified condition chain:
1. **D176FC == 0** -- protocol not busy
2. **arg == 3** -- this is Channel 3 (USB data channel)
3. **D1772D != 0** -- pending USB work exists
4. **0x006EDA returns nonzero** -- USB hardware is ready
5. Then: **CALL 0x0019B5** -- manually invoke USB ISR

### Interpretation

The Channel 3 special path is a **polled interrupt fallback**: when USB data transfer completes on Channel 3 and the protocol layer is not busy (D176FC==0) and there is pending work (D1772D!=0), the OS polls the USB hardware ports (0x006EDA checks ports 0x3082/0x3030/0x3031) to see if the endpoint is ready. If ready, it manually invokes the USB ISR (0x0019B5) to process the pending interrupt without waiting for the hardware IRQ line. This is a software-driven interrupt coalescing pattern common in USB host controller drivers.

## RAM Variables Summary

| Address | Role | Refs |
|---------|------|------|
| D176FB | Cleared to 0 by dispatcher on entry | Write only in dispatcher |
| D176FC | Protocol busy flag (nonzero = skip Channel 3 path) | Read in dispatcher |
| D1772D | Pending USB work flag (nonzero = work to process) | Read in dispatcher |
| D02651 | USB event counter (decremented in ISR) | Read/write in 0x0019B5 |
| D02AD7 | ISR saved HL register | Read/write in 0x0019B5 |
| D0009B | IY+27 bit 6: "in USB ISR" flag | Written in 0x0019B5 exit |

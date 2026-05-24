# Phase 428: 0x00CC71 Descriptor Subsystem Init Wrapper (266 bytes)

## Summary

0x00CC71-0x00CD7A is the master orchestrator for descriptor subsystem initialization. It performs hardware I/O, clears connection state, optionally polls a hardware port in a retry loop, and gates the final descriptor bootstrap (0x00E2EB) based on param2 and a secondary check (0x00DCB6).

**3 callers confirmed:**
- 0x008A52: params 0/2/0x7D0 (param3=2000)
- 0x008EB5: params 0/1/0x12C (param3=300)
- 0x0126F5: params 0/1/0x3E8 (param3=1000)

## Parameter Usage

| Parameter | IX offset | Usage |
|-----------|-----------|-------|
| param1 (24-bit) | IX+6 | Read at 0x00CCCA, passed to CALL 0x014E3F (unknown function) |
| param2 (24-bit) | IX+9 | Read at 0x00CCB1 (gates delay call 0x0123AD if zero) and at 0x00CD5A (compared to 2 -- gates descriptor bootstrap path) |
| param3 (24-bit) | IX+12 | **Not directly accessed in this function** -- likely consumed by a subroutine or passed via stack by a caller's prologue |

## Full Disassembly with Annotations

```
PHASE 1: PROLOGUE + LAYOUT (0x00CC71-0x00CC75)
0x00CC71  CALL 0x00218A           ; frame setup (push IX, LD IX,SP pattern)
0x00CC75  CALL 0x00CAF4           ; layout helper -- carves pool pointers D14017/D1401A/D1401D/D14020

PHASE 2: LINK I/O DRAIN (0x00CC79-0x00CC8C)
0x00CC79  LD BC,0x000000
0x00CC7D  PUSH BC
0x00CC7E  CALL 0x00DB66           ; link I/O drain #1 (control-line arm)
0x00CC82  POP BC
0x00CC83  LD BC,0x000000
0x00CC87  PUSH BC
0x00CC88  CALL 0x00DC0E           ; link I/O drain #2 (control-line drain)
0x00CC8C  POP BC

PHASE 3: CLEAR CONNECTION STATE (0x00CC8D-0x00CCA5)
0x00CC8D  LD BC,0x000000
0x00CC91  LD (0xD14014),BC        ; clear connection state flag (3 bytes)
0x00CC96  LD BC,0x00000D          ; length = 13 bytes
0x00CC9A  PUSH BC
0x00CC9B  LD BC,0xD13FED          ; connection table address
0x00CC9F  PUSH BC
0x00CCA0  CALL 0x00285F           ; _bzero -- clears 13 bytes at D13FED..D13FF9
0x00CCA4  POP BC
0x00CCA5  POP BC

PHASE 4: CONDITIONAL INIT (0x00CCA6-0x00CCC0)
0x00CCA6  LD A,(0xD14077)         ; check flag
0x00CCAA  OR A
0x00CCAB  JR NZ,0x00CCB1          ; skip 0x014F97 if flag nonzero
0x00CCAD  CALL 0x014F97           ; unknown init function (only if D14077==0)
0x00CCB1  LD A,(IX+9)             ; param2
0x00CCB4  OR A
0x00CCB5  JR NZ,0x00CCC1          ; skip delay if param2 != 0
0x00CCB7  LD BC,0x000032          ; 50 decimal
0x00CCBB  PUSH BC
0x00CCBC  CALL 0x0123AD           ; delay/sleep(50) -- only if param2==0
0x00CCC0  POP BC

PHASE 5: PARAM1 DISPATCH + HARDWARE POLL LOOP (0x00CCC1-0x00CD02)
0x00CCC1  LD BC,0x000000
0x00CCC5  LD (0xD1403B),BC        ; clear D1403B (3 bytes)
0x00CCCA  LD BC,(IX+6)            ; load param1
0x00CCCD  PUSH BC
0x00CCCE  CALL 0x014E3F           ; dispatch param1
0x00CCD2  POP BC

--- Hardware port poll loop (0x00CCD3-0x00CD02) ---
0x00CCD3  LD BC,0x3030            ; SIS prefix: BC = 0x3030, port 0x3030
0x00CCD7  IN A,(C)                ; read port 0x3030
0x00CCD9  AND 0x01                ; mask bit 0
0x00CCDB  OR A
0x00CCDC  SBC HL,HL               ; HL = 0 (with carry effects)
0x00CCDE  LD L,A                  ; L = port bit 0
0x00CCDF  LD (0xD1403B),HL        ; store result
0x00CCE3  LD A,(0xD1440F)         ; check flag
0x00CCE7  OR A
0x00CCE8  JR NZ,0x00CCF2          ; if D1440F != 0 -> skip magic check, go to error path
0x00CCEA  LD A,(0xD177B7)         ; load magic byte
0x00CCEE  CP 0x55                 ; compare to 0x55 ('U')
0x00CCF0  JR Z,0x00CCFA           ; if magic == 0x55 -> success path
0x00CCF2  XOR A                   ; A = 0
0x00CCF3  LD (0xD1440E),A         ; clear D1440E
0x00CCF7  XOR A                   ; A = 0 (return code)
0x00CCF8  JR 0x00CD76             ; -> EPILOGUE (early return, A=0)
0x00CCFA  LD HL,(0xD1403B)        ; reload port result
0x00CCFE  CALL 0x0021C2           ; test HL (compare/zero-check helper)
0x00CD02  JR Z,0x00CCD3           ; if zero -> loop back to poll port 0x3030

PHASE 6: DESCRIPTOR TABLE BUILD (0x00CD04-0x00CD59)
0x00CD04  XOR A
0x00CD05  LD (0xD1440E),A         ; clear D1440E
0x00CD09  LD BC,0x000019          ; 25 decimal
0x00CD0D  PUSH BC
0x00CD0E  CALL 0x014FA0           ; unknown function(25)
0x00CD12  POP BC
0x00CD13  LD BC,0x000003          ; 3
0x00CD17  PUSH BC
0x00CD18  CALL 0x007991           ; unknown function(3)
0x00CD1C  POP BC
0x00CD1D  LD BC,(0xD14017)        ; master descriptor source pointer
0x00CD22  PUSH BC
0x00CD23  CALL 0x007A25           ; unknown function(D14017 value)
0x00CD27  POP BC
0x00CD28  LD BC,0x000002          ; 2
0x00CD2C  PUSH BC
0x00CD2D  CALL 0x0079B9           ; unknown function(2)
0x00CD31  POP BC
0x00CD32  LD BC,(0xD1401D)        ; slab pool B pointer
0x00CD37  PUSH BC
0x00CD38  CALL 0x007957           ; unknown function(D1401D value)
0x00CD3C  POP BC

PHASE 7: PORT WRITE + VERIFICATION (0x00CD3D-0x00CD59)
0x00CD3D  LD BC,0x003014          ; port 0x3014
0x00CD41  LD A,0x08
0x00CD43  OUT (C),A               ; write 0x08 to port 0x3014
0x00CD45  LD A,B
0x00CD46  CP 0x30                 ; verify B == 0x30
0x00CD48  JR Z,0x00CD4B           ; ok
0x00CD4A  RST 0x08                ; TRAP if B != 0x30
0x00CD4B  LD A,C
0x00CD4C  CP 0x14                 ; verify C == 0x14
0x00CD4E  JR NZ,0x00CD4A          ; TRAP if C != 0x14
0x00CD50  LD BC,0x00003F          ; 63 decimal
0x00CD54  PUSH BC
0x00CD55  CALL 0x007A05           ; unknown function(63)
0x00CD59  POP BC

PHASE 8: GATE DESCRIPTOR BOOTSTRAP (0x00CD5A-0x00CD75)
0x00CD5A  LD A,(IX+9)             ; param2
0x00CD5D  CP 0x02                 ; is param2 == 2?
0x00CD5F  JR Z,0x00CD6C           ; yes -> skip DCB6 check, go straight to bootstrap
0x00CD61  CALL 0x00DCB6           ; secondary check
0x00CD65  OR A
0x00CD66  JR NZ,0x00CD6C          ; if DCB6 returned nonzero -> go to bootstrap
0x00CD68  LD A,0x02
0x00CD6A  JR 0x00CD76             ; -> EPILOGUE (return A=2, partial init)
0x00CD6C  CALL 0x00E2EB           ; DESCRIPTOR BOOTSTRAP (509 bytes)
0x00CD70  CALL 0x00DE8B           ; post-bootstrap cleanup
0x00CD74  LD A,0x01               ; return code = 1 (success)

PHASE 9: EPILOGUE (0x00CD76-0x00CD7A)
0x00CD76  LD SP,IX                ; tear down frame
0x00CD78  POP IX                  ; restore IX
0x00CD7A  RET                     ; return A = status code
```

## Control Flow Diagram

```
0x00CC71: prologue + layout helper
    |
    v
drain link I/O (DB66 + DC0E)
    |
    v
clear D14014 (3 bytes) + bzero D13FED (13 bytes)
    |
    v
D14077 == 0? --yes--> CALL 014F97
    |
    v
param2 == 0? --yes--> delay(50) via 0123AD
    |
    v
clear D1403B, dispatch param1 via 014E3F
    |
    v
POLL LOOP: IN port 0x3030, bit 0
    |
    +-- D1440F != 0? --> clear D1440E, return A=0 (ERROR)
    +-- D177B7 != 0x55? --> clear D1440E, return A=0 (ERROR)
    +-- D177B7 == 0x55 AND port bit 0 still zero? --> loop back
    +-- D177B7 == 0x55 AND port bit 0 set? --> continue
    |
    v
DESCRIPTOR TABLE BUILD:
  call 014FA0(25), 007991(3), 007A25(D14017), 0079B9(2), 007957(D1401D)
    |
    v
OUT port 0x3014 = 0x08 (with RST 0x08 trap if BC corrupted)
    |
    v
call 007A05(63)
    |
    v
param2 == 2? --yes--> CALL 0x00E2EB (bootstrap) + 0x00DE8B, return A=1
    |
    v
CALL 0x00DCB6 (secondary check)
    |
    +-- returned 0? --> return A=2 (partial init)
    +-- returned nonzero? --> CALL 0x00E2EB (bootstrap) + 0x00DE8B, return A=1
```

## Return Codes

| A value | Meaning |
|---------|---------|
| 0 | Error/abort: D1440F set or magic byte D177B7 != 0x55 |
| 1 | Full success: descriptor bootstrap (0x00E2EB) completed |
| 2 | Partial init: DCB6 check returned 0, bootstrap skipped |

## Key Findings

### 1. Hardware Port I/O
- **Port 0x3030 (IN)**: Polled in a loop. Bit 0 indicates hardware readiness. The loop waits until bit 0 is set AND the magic byte at D177B7 equals 0x55.
- **Port 0x3014 (OUT)**: Written with value 0x08 after descriptor table build. This likely arms or configures a USB/link hardware register. The BC register is verified (RST 0x08 trap if corrupted) -- a debug assertion.

### 2. The Poll Loop (0x00CCD3-0x00CD02)
This is the most interesting structure. It polls port 0x3030 bit 0, stores the result in D1403B, then checks two abort conditions:
- D1440F != 0: immediate error exit (some external cancel flag)
- D177B7 != 0x55: magic-not-set error exit

If magic is 0x55 but port bit 0 is still zero, it loops back. This is a hardware handshake -- waiting for the link/USB controller to signal readiness.

### 3. Param2 Controls Bootstrap Gating
- param2=0: extra 50-unit delay before hardware poll
- param2=1: no delay, but DCB6 check gates bootstrap
- param2=2: no delay, DCB6 check skipped, bootstrap always runs

The caller at 0x008A52 passes param2=2, meaning it always does full bootstrap. The other two callers (param2=1) may skip bootstrap if DCB6 returns 0.

### 4. Between 0x00CAF4 and 0x00E2EB
The path between the layout helper and descriptor bootstrap contains:
1. Link I/O drain (DB66 + DC0E) -- reset link hardware state
2. Connection table clear -- zero D14014 (3 bytes) + D13FED (13 bytes)
3. Conditional init (014F97 if D14077==0)
4. Optional delay (0123AD with 50 if param2==0)
5. Param1 dispatch (014E3F)
6. Hardware poll loop on port 0x3030
7. Descriptor table build (series of calls with D14017/D1401D pool pointers)
8. Port 0x3014 write (0x08)
9. Bootstrap gate check (param2 vs DCB6 result)

### 5. Call Target Summary (18 unique calls)

| Address | Role | Notes |
|---------|------|-------|
| 0x00218A | Frame setup | Push IX, LD IX,SP |
| 0x00CAF4 | Layout helper | Carves D14017/D1401A/D1401D/D14020 |
| 0x00DB66 | Link I/O drain #1 | Control-line arm (param=0) |
| 0x00DC0E | Link I/O drain #2 | Control-line drain (param=0) |
| 0x00285F | _bzero | Clears 13 bytes at D13FED |
| 0x014F97 | Unknown init | Only if D14077==0 |
| 0x0123AD | Delay/sleep | Only if param2==0, duration=50 |
| 0x014E3F | Param1 dispatch | Receives param1 (IX+6) |
| 0x0021C2 | HL zero test | Used in poll loop |
| 0x014FA0 | Unknown | param=25 |
| 0x007991 | Unknown | param=3 |
| 0x007A25 | Unknown | param=D14017 (master descriptor ptr) |
| 0x0079B9 | Unknown | param=2 |
| 0x007957 | Unknown | param=D1401D (slab pool B ptr) |
| 0x007A05 | Unknown | param=63 |
| 0x00DCB6 | Secondary check | Gates bootstrap when param2 != 2 |
| 0x00E2EB | Descriptor bootstrap | 509 bytes, the main payload |
| 0x00DE8B | Post-bootstrap cleanup | Called immediately after E2EB |

### 6. RAM Variables

| Address | Size | Role |
|---------|------|------|
| D14014 | 3 bytes | Connection state flag (cleared to 0) |
| D13FED | 13 bytes | Connection table (cleared to 0) |
| D14077 | 1 byte | Init flag (read, gates 014F97 call) |
| D1403B | 3 bytes | Port 0x3030 poll result storage |
| D1440E | 1 byte | Error/status byte (cleared on error and success paths) |
| D1440F | 1 byte | Cancel/abort flag (read, triggers early exit) |
| D177B7 | 1 byte | Magic byte (must be 0x55 for init to proceed) |
| D14017 | 3 bytes | Master descriptor source pointer (read, passed to 007A25) |
| D1401D | 3 bytes | Slab pool B pointer (read, passed to 007957) |

### 7. Param3 Mystery
The third parameter (varying: 2000/300/1000) is NOT directly accessed by IX+12 in this function. It is likely:
- Consumed by the frame setup at 0x00218A as a stack-allocated local
- Passed through to one of the subroutines via the stack frame
- Or used by 0x00CAF4 (layout helper) which has access to the same frame

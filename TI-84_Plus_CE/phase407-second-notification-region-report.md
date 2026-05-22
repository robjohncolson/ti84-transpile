# Phase 407: Second Notification Region Report

## Region: 0x008800-0x008960 (352 bytes, low ROM)

This region is the **low-ROM mirror** of the flash notification handler at 0x049Cxx. It contains the primary `dispatch_key` function (0x00883C) which is the most-called notification entry point in the entire ROM (77 external callers).

## Key Findings

### 1. Function Map

| Address | Name | Callers | Purpose |
|---------|------|---------|---------|
| 0x008800 | `dispatch_key_preamble` | (internal) | Sets (IX-01)=0, falls through to 0x008834 |
| 0x008834 | `dispatch_key_epilog` | 6 JP | Reads return value from (IX-01), tears down stack frame, RET |
| 0x008837 | `dispatch_key_epilog_sp` | 1 JP | Same as above but enters at LD SP,IX (stack cleanup variant) |
| 0x00883C | `dispatch_key` | **77 CALL** | Main notification dispatch function |
| 0x008952 | `dispatch_key_alt` | 2 CALL | Alternate entry (same prologue, continues past region end) |

### 2. dispatch_key (0x00883C) -- Main Function

**Prologue:**
```
LD HL, 0xFFFFFF
CALL 0x002197          ; stack frame setup (allocates local vars)
LD (IX-01), 0x00       ; return code = 0
LD A, I
PUSH AF
DI                     ; save & disable interrupts
```

**Phase 1: State transition (0x00884C-0x008882)**
```
LD A, (0xD177B9)       ; read current notification type
CP (IX+09)             ; compare with desired type (parameter)
JR Z, skip             ; if already in correct state, skip
LD C, (IX+09)          ; push desired type
CALL 0x0085E3          ; exit_state_lowrom -- tear down current state
OR A                   ; check return
JR Z, fail             ; if exit failed, set return=1
LD A, (0xD177B9)       ; re-read current type
PUSH                   ; push as arg
CALL 0x00883C          ; RECURSIVE CALL to self (re-enter dispatch)
LD A, (IX+09)
LD (0xD177B9), A       ; write new notification type
```

**Phase 2: Key processing (0x008883-0x0088AB)**
```
LD A, (IX-01)          ; check return code
OR A
JP NZ, exit            ; bail if non-zero
LD C, (IX+06)          ; key code parameter
CALL 0x00863A          ; process_key_lowrom
LD (IX-01), A          ; store result as return code
...check again...
```

**Phase 3: _seqcase dispatch on notification type (0x0088A8-0x0088DC)**

Table 1 at 0x008811 (5 entries, from preamble context):

| Key | Target | Meaning |
|-----|--------|---------|
| 0x8C | 0x00882A | LD (IX-01),0; JR epilog |
| 0x8E | 0x00882A | same |
| 0x8F | 0x00882A | same |
| 0x90 | 0x00882A | same |
| 0x91 | 0x00882A | same |
| default | 0x008834 | epilog |

Table 2 at 0x0088AC (11 entries, main dispatch):

| Key | Type | Target | Action |
|-----|------|--------|--------|
| 0x00 | type 0 | 0x0088DD | LD A,(IX+06); LD (D177B8),A |
| 0x01 | type 1 | 0x0088E6 | LD A,(IX+06); LD (D177B8),A |
| 0x02 | type 2 | 0x0088EF | LD A,(IX+06); LD (D177B8),A |
| 0x03 | type 3 | 0x0088F8 | LD A,(IX+06); LD (D177B8),A |
| 0x04 | type 4 | 0x008901 | LD A,(IX+06); LD (D177B8),A |
| 0x10 | type 16 | 0x00890A | LD A,(IX+06); LD (D177B8),A |
| 0x11 | type 17 | 0x008913 | LD A,(IX+06); LD (D177B8),A |
| 0x12 | type 18 | 0x00891C | LD A,(IX+06); LD (D177B8),A |
| 0x13 | type 19 | 0x008925 | LD A,(IX+06); LD (D177B8),A |
| 0x14 | type 20 | 0x00892E | LD A,(IX+06); LD (D177B8),A |
| 0x15 | type 21 | 0x008937 | LD A,(IX+06); LD (D177B8),A |
| default | --- | 0x008940 | LD (IX-01),2 (error, no D177B8 write) |

**Critical observation**: All 11 cases perform the **identical operation**: `LD A,(IX+06); LD (D177B8),A`. The key code from parameter (IX+06) is stored into D177B8 (notification payload). The _seqcase exists to validate that the notification type is one of the 11 recognized types. The default case sets return code 2 (unrecognized type).

### 3. D177B8 Writers

11 writers, all identical: `LD A,(IX+06); LD (D177B8),A`

| Address | Source |
|---------|--------|
| 0x0088E0 | type 0x00 handler |
| 0x0088E9 | type 0x01 handler |
| 0x0088F2 | type 0x02 handler |
| 0x0088FB | type 0x03 handler |
| 0x008904 | type 0x04 handler |
| 0x00890D | type 0x10 handler |
| 0x008916 | type 0x11 handler |
| 0x00891F | type 0x12 handler |
| 0x008928 | type 0x13 handler |
| 0x008931 | type 0x14 handler |
| 0x00893A | type 0x15 handler |

### 4. D177B9 Reads

2 reads at 0x00884C and 0x008863, both in `dispatch_key`:
- First read: compare current type with desired type (IX+09)
- Second read: after recursive call, push current type for nested dispatch

### 5. External Dependencies

| Target | Name | Purpose |
|--------|------|---------|
| 0x00211B | _seqcase | Jump table dispatcher |
| 0x002197 | _frameset | Stack frame allocator |
| 0x0085E3 | exit_state_lowrom | Notification state teardown |
| 0x00863A | process_key_lowrom | Key event processing |

### 6. Caller Distribution (86 external callers)

| Entry Point | Callers | Range |
|-------------|---------|-------|
| 0x00883C | 77 | 0x0084xx-0x01572A (low + mid ROM) |
| 0x008834 | 6 | 0x0086xx (all from key handler family) |
| 0x008837 | 1 | 0x00864D |
| 0x008952 | 2 | 0x00F232, 0x01384F |

The 77 callers to `dispatch_key` span from 0x0084xx (key input layer) through 0x0157xx (mid-ROM services), making this the central notification dispatch hub.

### 7. Relationship to Flash Region (0x049Cxx)

This low-ROM region (0x008800-0x008960) is the **exact structural mirror** of the flash region (0x049CCA-0x049DEF):
- Both use the same _seqcase pattern via CALL 0x00211B
- Both dispatch on 11 notification types (0x00-0x04, 0x10-0x15)
- Both write (IX+06) into D177B8 for all cases
- Both call `exit_state` and `process_key` (low-ROM vs flash variants)
- The flash region calls 0x0499C0 (exit_state_flash) and 0x049A23 (process_key_flash)

### 8. Notification Types Handled

The 11 types handled by both regions:

| Type | Hex | Category |
|------|-----|----------|
| 0 | 0x00 | Base/idle |
| 1 | 0x01 | Home screen |
| 2 | 0x02 | Program editor |
| 3 | 0x03 | Window/settings |
| 4 | 0x04 | Table setup |
| 16 | 0x10 | Graph mode |
| 17 | 0x11 | Stat list editor |
| 18 | 0x12 | Matrix editor |
| 19 | 0x13 | Distribution |
| 20 | 0x14 | Finance |
| 21 | 0x15 | App/catalog |

## Conclusions

1. **dispatch_key at 0x00883C is the OS's main key-to-notification-payload writer.** With 77 callers, it is the most-referenced notification function.

2. **The 11 writers are a type-validation gate, not differentiated handlers.** Every case does the same thing (store key code into D177B8). The _seqcase ensures only valid notification types trigger a payload write; invalid types return error code 2.

3. **The function is recursive** -- it calls itself when a notification type transition is needed (current type differs from requested type).

4. **Interrupts are disabled** during the entire dispatch (DI at entry, restored via PUSH AF / POP AF at exit with JP PO guard for the EI).

5. **The low-ROM and flash regions are compiler-generated duplicates** -- identical logic, different callers. Low-ROM callers (0x0084-0x0157) use 0x00883C; flash callers would use 0x049CCA.

## Artifacts

- `TI-84_Plus_CE/probe-phase407-second-notification-region.mjs` -- probe script
- `TI-84_Plus_CE/phase407-second-notification-region-report.md` -- this report

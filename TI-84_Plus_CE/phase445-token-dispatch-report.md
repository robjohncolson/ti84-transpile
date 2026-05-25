# Phase 445: Token Dispatch and Display Refresh Paths

## Key Finding: Only ONE `CALL 0x003D5A` in the Entire ROM

There is exactly **one** site in the entire 4MB ROM that calls `_GetCSC` (0x003D5A):

| Address | Context |
|---------|---------|
| 0x003A73 | Error handler key poll loop |

**No other code calls `_GetCSC` directly.** The home screen event loop does NOT use `_GetCSC`. Instead, the OS uses a completely different mechanism: the keyboard ISR scans keys into D00587 via `0x003CC2`, and the scheduler's normal dispatch path reads them through `0x03FA09`.

## The REAL Home Screen Event Loop

### Scheduler Main Loop (0x001584-0x00164E)

The scheduler is a loop starting at `0x001584`:

```
0x001584  CALL 0x005BA6           ; display refresh / status update
0x001588  [string display calls]  ; render status line
0x0015D5  CALL 0x0066FF           ; APD timer check
0x0015F7  CALL 0x001652           ; *** KEY SCAN *** (calls 0x003CC2)
0x0015FB  IN0 A, (0x0F)          ; read status port
0x0015FE  BIT 7, A               ; check bit 7 (key ready?)
0x001600  LD BC, 0x000000
0x001604  JR NZ, 0x001644         ; bit 7 set → dispatch with BC=0
0x001606  BIT 6, A               ; check bit 6 (error condition?)
0x001608  LD BC, 0x000002
0x00160C  JR Z, 0x00162C          ; bit 6 clear → normal path
0x00160E  CALL 0x001794           ; bit 6 set → error handler (→ JP 0x003A0F)
0x001612  [check bits again]      ; if error handler returns (not tail-calls)
0x001617  JR Z, 0x0015F7          ; loop back to key scan
; --
0x00162C  PUSH BC                 ; normal (non-error) path
0x00162D  CALL 0x001296           ; port status / USB check
0x001631  JP Z, 0x001933          ; sleep if nothing pending
0x001635  CALL 0x0017CE           ; delay / debounce
0x001639  CALL 0x01275B           ; battery / power check
0x00163D  CP 0x40
0x00163F  JP NC, 0x001933         ; sleep if power issue
0x001643  POP BC
; --
0x001644  PUSH IY                 ; *** DISPATCH ***
0x001646  PUSH BC
0x001647  CALL 0x00846E           ; *** MAIN OS DISPATCH ***
0x00164B  POP BC
0x00164C  POP IY
0x00164E  JP 0x001584             ; loop back to top
```

**Critical insight**: The scheduler calls `0x001652` to scan the keyboard (which calls `0x003CC2` to read the hardware matrix and store the scan code at D00587), then dispatches through `0x00846E`. It does NOT call `_GetCSC`.

### Key Scan via 0x001652 → 0x003CC2

`0x001652` is a wrapper that:
1. Saves registers (PUSH AF/BC/DE/HL)
2. Calls `0x003CC2` — the hardware keyboard matrix scanner
3. If scan code = 0x0F, enters a special clock/timer path
4. Otherwise stores the result and returns

`0x003CC2` reads the keyboard matrix directly via ports:
- Port 0xA000 group: keyboard row select
- Port 0xA008: keyboard column read  
- Debounce and repeat logic via D00588-D0058B
- Scan code stored at D00587 (via 0x003D4B: `LD (D00587), A`)
- Sets IY bit 3 offset 0 to flag "key available"

### Main OS Dispatch at 0x00846E

`0x00846E` is the central OS dispatch called every scheduler loop:

```
0x00846E  CALL 0x00218A           ; prologue / context setup
0x008472  LD A, (0xD14080)        ; check pending flags
0x008476  OR A
0x008477  JP NZ, 0x008522         ; handle pending event
0x00847B  LD A, (0xD177BB)        ; check mode state
0x00847F  OR A
0x008480  JR NZ, 0x0084DA         ; mode-specific dispatch
0x008482  EI
0x008483  LD A, (0xD177B8)        ; check key buffer state
0x008487  CP 0xFF
0x008489  JR NZ, 0x0084B2         ; key available → process
0x00848B  CALL 0x012756           ; check for pending work
0x00848F  OR A
0x008490  JR Z, 0x0084B2          ; none → fall through
0x008492  [notification dispatch with BC=0x12, BC=0xC4]
0x00849C  CALL 0x00883C           ; notification handler
```

**D177B8** is the processed key code buffer checked by the dispatch. When it's not 0xFF, there's a key to process.

### Key Code Flow: D00587 → D141B5

The function at `0x03FA09` bridges the raw scan code (D00587) to the dispatch key buffer (D141B5):

```
0x03FA09  LD HL, 0xD00587         ; raw scan code from ISR
0x03FA0D  DI
0x03FA0E  LD A, (HL)              ; read scan code
0x03FA0F  LD (HL), 0x00           ; clear it (consume)
0x03FA11  RES 3, (IY+0)           ; clear "key available" flag
0x03FA15  EI
0x03FA16  PUSH AF                 ; save scan code
0x03FA17  OR A
0x03FA18  JP NZ, 0x03FB9A         ; non-zero → process key
  ...
0x03FB9A  [key processing: mode checks, cursor blink, etc.]
  ...
0x03FBE1  LD (0xD141B5), A        ; *** STORE PROCESSED KEY CODE ***
  ...
0x03FBE8  [continue to dispatch]
```

**0x03FA09 has 8 direct callers** plus a syscall thunk at 0x02014C:

| Address | Context |
|---------|---------|
| 0x02014C | Syscall jump table thunk (JP 0x03FA09) |
| 0x02FDBE | Mode handler |
| 0x03005C | Mode handler |
| 0x03FC36 | Self-call within key processing |
| 0x040C9D | Mode handler |
| 0x044FDA | Mode handler |
| 0x0461C2 | Mode handler |
| 0x056224 | Mode handler |
| 0x09CFA5 | Mode handler |

### Full Key Processing Path

```
Hardware key press
    │
    ▼
0x003CC2: keyboard matrix scan (port reads)
    │ stores raw scan code at D00587
    │ sets IY bit 3 (key available)
    ▼
0x001652: scheduler key scan wrapper
    │ called every scheduler loop iteration
    ▼
0x00846E: main OS dispatch
    │ checks D14080 (pending flags)
    │ checks D177BB (mode state)
    │ checks D177B8 (processed key)
    ▼
0x03FA09: key processor (called by mode-specific handlers)
    │ reads D00587 (raw scan code)
    │ clears D00587
    │ processes through mode-specific logic
    │ stores at D141B5 (processed key buffer)
    ▼
0x02BDA3/0x02BDDE: dispatch callers
    │ read C = (D141B5)
    │ push D141B3 (result buffer)
    │ push BC (key code)
    ▼
0x05D58F: key_dispatch_lookup
    │ reads table base from D1441D
    │ computes handler = table[key * 4]
    │ copies 4-byte entry to D141B3
    ▼
0x02B373: notification_init
    │ reads handler from D141B3
    │ sets up notification at D143E7-D14420
    │ queues via CALL 0x0004A0
    ▼
Handler function executes (mode-specific)
    │ token insertion, display update, etc.
    ▼
VRAM writes at D40000+
```

## Disassembly: Key Dispatch at 0x05D58F

```
0x05D58F  CALL 0x000130           ; stack frame setup
0x05D593  LD HL, (0xD1441D)       ; load table base pointer
0x05D597  CALL 0x000138           ; null check
0x05D59B  JR Z, 0x05D5BD          ; null → skip dispatch (cleanup)
0x05D59D  LD BC, 0x000004          ; entry size = 4 bytes
0x05D5A1  PUSH BC
0x05D5A2  LD A, (IX+6)            ; key code from stack parameter
0x05D5A5  OR A                    ; (clear carry for SBC)
0x05D5A6  SBC HL, HL              ; HL = 0
0x05D5A8  LD L, A                 ; HL = key_code
0x05D5A9  ADD HL, HL              ; HL = key_code * 2
0x05D5AA  ADD HL, HL              ; HL = key_code * 4
0x05D5AB  LD BC, (0xD1441D)       ; reload table base
0x05D5B0  ADD HL, BC              ; HL = table_base + key_code * 4
0x05D5B1  PUSH HL                 ; source address
0x05D5B2  LD BC, (IX+9)           ; destination buffer (D141B3)
0x05D5B5  PUSH BC
0x05D5B6  CALL 0x0000A4           ; memcpy(dest, src, 4)
0x05D5BA  POP BC
0x05D5BB  POP BC
0x05D5BC  POP BC
0x05D5BD  LD SP, IX               ; cleanup stack frame
0x05D5BF  POP IX
0x05D5C1  RET
```

## Disassembly: Dispatch Caller at 0x02BDA3

This is within the function at 0x02BD50:

```
0x02BD50  [DI/EI wrapper, checks D14074]
0x02BD5E  LD A, (0xD14074)        ; key processing enabled?
0x02BD62  OR A
0x02BD63  JP Z, 0x02BDE8          ; no → skip
0x02BD67  LD A, (0xD14091)        ; menu mode active?
0x02BD6B  OR A
0x02BD6C  JR NZ, 0x02BD7E         ; yes → different path
0x02BD6E  CALL 0x042985            ; cursor position setup
  ...
0x02BD7E  LD BC, 0x0000FF
0x02BD82  LD HL, 0xD140B3
0x02BD86  ADD HL, BC              ; HL = D140B3 + 0xFF = D141B2
0x02BD87  LD A, (HL)              ; check pending key at D141B2
0x02BD88  OR A
0x02BD89  JR Z, 0x02BDB5          ; no pending key → check D141B3
0x02BD8B  LD IY, 0xD141B3
0x02BD90  LD A, (IY+7)            ; check notification active (D141BA)
0x02BD93  OR A
0x02BD94  JR NZ, 0x02BDE8         ; notification already active → skip
; --- First dispatch path (key from D141B5) ---
0x02BD96  LD HL, 0xD141B5
0x02BD9A  LD C, (HL)              ; C = scan code from D141B5
0x02BD9B  LD DE, 0xD141B3          ; dest buffer
0x02BD9F  PUSH DE
0x02BDA0  LD B, 0x00
0x02BDA2  PUSH BC                 ; push key code (B=0, C=scancode)
0x02BDA3  CALL 0x05D58F            ; key_dispatch_lookup
0x02BDA7  POP BC
0x02BDA8  POP BC
0x02BDA9  CALL 0x02B373            ; notification_init (queue handler)
0x02BDAD  LD HL, 0xD141BA
0x02BDB1  LD (HL), 0x01            ; mark notification active
0x02BDB3  JR 0x02BDE8              ; done
; --- Second path (when no pending key at D141B2) ---
0x02BDB5  LD IY, 0xD141B3
0x02BDBA  LD A, (IY+7)             ; D141BA notification active?
0x02BDBD  OR A
0x02BDBE  JR Z, 0x02BDE8           ; not active → done
0x02BDC0  XOR A
0x02BDC1  LD (0xD141B3), A         ; clear notification buffer
0x02BDC5  LD HL, 0xD141B5
0x02BDC9  LD (HL), 0x00            ; clear key buffer
0x02BDCB  LD HL, 0xD141BA
0x02BDCF  LD (HL), 0x00            ; clear notification flag
; --- Re-read and re-dispatch ---
0x02BDD1  LD HL, 0xD141B5
0x02BDD5  LD C, (HL)               ; re-read key code (should be 0 now)
0x02BDD6  LD DE, 0xD141B3
0x02BDDA  PUSH DE
0x02BDDB  LD B, 0x00
0x02BDDD  PUSH BC
0x02BDDE  CALL 0x05D58F            ; key_dispatch_lookup (second call)
0x02BDE2  POP BC
0x02BDE3  POP BC
0x02BDE4  CALL 0x02B373            ; notification_init
0x02BDE8  [post-dispatch checks: D14091, D176F8, D14059]
```

## Disassembly: Notification Init at 0x02B373

```
0x02B373  LD IY, 0xD141B3         ; handler entry (from dispatch lookup)
0x02B378  LD A, (IY+7)            ; D141BA — notification active flag
0x02B37B  OR A
0x02B37C  JR NZ, 0x02B3CD         ; already active → RET
0x02B37E  LD BC, 0x000000
0x02B382  LD (0xD143E7), BC        ; clear notification struct
0x02B387  LD (0xD143EA), BC
0x02B38C  LD BC, 0xD141B3          ; source = handler entry
0x02B390  LD (0xD143ED), BC        ; notification.source = D141B3
0x02B395  LD BC, 0x000004          ; size = 4
0x02B399  LD (0xD143F6), BC        ; notification.size
0x02B39E  LD BC, 0x000000
0x02B3A2  LD (0xD143F9), BC
0x02B3A7  LD BC, 0x000008          ; flags
0x02B3AB  LD (0xD143FC), BC        ; notification.flags
0x02B3B0  LD A, 0x02               ; type = 2 (key event)
0x02B3B2  LD (0xD143FF), A         ; notification.type
0x02B3B6  LD BC, 0x000000
0x02B3BA  LD (0xD14402), BC
0x02B3BF  LD BC, 0xD143E7          ; notification struct address
0x02B3C3  PUSH BC
0x02B3C4  CALL 0x0004A0            ; PostNotification(struct)
0x02B3C8  POP BC
0x02B3C9  LD (0xD17725), A         ; store result
0x02B3CD  RET
```

## All Writes to D141B5 (Key Buffer)

| Address | Instruction | Context |
|---------|-------------|---------|
| 0x03FBE1 | `LD (0xD141B5), A` | Key processor stores processed scan code |
| 0x02BDC9 | `LD (HL), 0x00` with HL=D141B5 | Clear key buffer during re-dispatch |

Only **one** function writes a real key code to D141B5: `0x03FA09` at instruction `0x03FBE1`.

## All Reads from D141B5

| Address | Instruction | Context |
|---------|-------------|---------|
| 0x03FBD9 | `LD A, (0xD141B5)` | Within key processor: check if key already buffered |
| 0x02BD96 | `LD HL, 0xD141B5; LD C, (HL)` | First dispatch caller: read key for lookup |
| 0x02BDD1 | `LD HL, 0xD141B5; LD C, (HL)` | Second dispatch caller: re-read after clear |

## All Writes to D00587 (Raw Scan Code Buffer)

| Address | Instruction | Context |
|---------|-------------|---------|
| 0x003D4B | `LD (D00587), A` | Within keyboard scan routine (0x003CC2), stores raw scan code |
| 0x003D7B | `LD (D00587), A` | Within `_GetCSC` (0x003D5A), clears after read |
| 0x028C2D | `LD (D00587), A` | Clears (A=0) during mode reset |
| 0x03F9FA | `LD (D00587), A` | Within key repeat/hold processing |

## Table Installer Sites

No direct `CALL 0x05D5C2` or `CALL 0x021E78` found in the ROM. The table installer must be called through a different thunk or indirectly. The table base at D1441D is set by:
- 0x02B896, 0x02BD19, 0x041E1C: clear to 0 (disable dispatch)
- 0x048B6E: save/restore during mode switch
- 0x05D5C9: the actual installer (reads table address from stack param)

## Why VRAM Never Changes in the Workflow Probe

The probe uses `0x003A73` as the event loop entry. This is inside the **error handler** (0x003A05-0x003A8E), which:
1. Displays "ERROR! Press any key to turn unit OFF"
2. Polls `_GetCSC` in a DJNZ loop
3. When a key is detected, calls `0x001713` (APD check) then jumps to power-off
4. **Never dispatches the key to a handler, never writes tokens, never updates display**

The REAL home screen event loop is the scheduler at `0x001584`:
1. `CALL 0x005BA6` — display refresh
2. `CALL 0x001652` — keyboard scan (→ `0x003CC2` → stores at D00587)
3. Status port check → `CALL 0x00846E` — main OS dispatch
4. `JP 0x001584` — loop

The probe needs to enter at `0x001584` (or wherever the scheduler loop starts after OS init), NOT at `0x003A73`.

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│              Scheduler Loop (0x001584)           │
│                                                 │
│  0x005BA6: display refresh                      │
│  0x001652: keyboard scan → 0x003CC2             │
│     └→ raw scan code at D00587                  │
│  Port 0x0F status check                         │
│     ├─ bit 7: key ready → dispatch              │
│     ├─ bit 6: error → 0x001794 → 0x003A0F      │
│     └─ neither: sleep at 0x001933               │
│  0x00846E: main OS dispatch                     │
│     └→ mode handler calls 0x03FA09              │
│        └→ reads D00587, processes key           │
│           └→ stores at D141B5                   │
│              └→ 0x02BDA3: dispatch lookup       │
│                 └→ 0x05D58F: table[key*4]       │
│                    └→ 0x02B373: post notif      │
│                       └→ handler: token→VRAM    │
│  JP 0x001584: loop                              │
└─────────────────────────────────────────────────┘

 _GetCSC (0x003D5A) is ONLY used by the error handler.
 The home screen never calls _GetCSC.
```

## Next Steps

1. **Change the probe's EVENT_LOOP_ENTRY** from `0x003A73` to `0x001584` (the scheduler loop top)
2. **Ensure port 0x0F emulation** returns appropriate status bits (bit 7 for key ready, bit 6 clear for non-error)
3. **Ensure D00587 is populated** with the raw scan code when the keyboard is pressed (the probe currently uses `_GetCSC` conventions but the scheduler uses `0x003CC2` which reads hardware ports)
4. **The key handler table at D1441D must be installed** — it's NULL after basic OS init. A mode-specific initialization function must run first to install the home screen key table via `0x05D5C2`
5. **Trace which mode init installs the home screen table** — look at the 8 callers of `0x03FA09` to find the home screen mode entry point

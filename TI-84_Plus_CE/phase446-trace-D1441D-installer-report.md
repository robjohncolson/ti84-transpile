# Phase 446 — D1441D Key Handler Table Pointer Trace

## 1. JP Table Dispatch Mechanism

The OS jump table at `0x020104`–`0x02230C` is a single contiguous array of 2,178 `JP` instructions (4 bytes each: `C3 xx xx xx`). The installer function at `0x05D5C2` is entry **#1885** at address `0x021E78`.

This table is the TI-OS public API surface — equivalent to the bcall vector table. However, **no ROM code calls entry 1885**:

| Search | Result |
|--------|--------|
| `CALL 0x05D5C2` | 0 hits |
| `JP 0x05D5C2` | 1 hit (the table entry itself at `0x021E78`) |
| `CALL 0x021E78` | 0 hits |
| RST 28h + any JP table slot address | 0 hits |
| RST (any) + `0x021E78` | 0 hits |
| Conditional CALL/JP to `0x05D5C2` | 0 hits |

The installer at `0x05D5C2` is exclusively a public API for ASM apps. No OS-internal code invokes it.

### Installer disassembly (`0x05D5C2`)

```
0x05D5C2: CD 30 01 00    CALL 0x000130       ; frame setup (PUSH IX, IX=SP)
0x05D5C6: DD 07 06       LD BC,(IX+6)        ; BC = first stack argument (table pointer)
0x05D5C9: ED 43 1D 44 D1 LD (0xD1441D),BC    ; install table pointer
0x05D5CE: AF             XOR A
0x05D5CF: 32 84 40 D1    LD (0xD14084),A     ; clear notification flag
0x05D5D3: DD F9          LD SP,IX            ; frame teardown
0x05D5D5: DD E1          POP IX
0x05D5D7: C9             RET
```

### Dispatch function (`0x05D58F`)

```
0x05D58F: CD 30 01 00    CALL 0x000130       ; frame setup
0x05D593: 2A 1D 44 D1    LD HL,(0xD1441D)    ; load table pointer
0x05D597: CD 38 01 00    CALL 0x000138       ; test HL == 0
0x05D59B: 28 20          JR Z,0x05D5BD       ; *** if NULL, skip entirely ***
0x05D59D: 01 04 00 00    LD BC,0x000004      ; entry size = 4
0x05D5A1: C5             PUSH BC
0x05D5A2: DD 7E 06       LD A,(IX+6)         ; A = key code argument
0x05D5A5: B7             OR A                ; clear carry
0x05D5A6: ED 62          SBC HL,HL           ; HL = 0
0x05D5A8: 6F             LD L,A              ; HL = key_code
0x05D5A9: 29             ADD HL,HL           ; HL = key_code * 2
0x05D5AA: 29             ADD HL,HL           ; HL = key_code * 4
0x05D5AB: ED 4B 1D 44 D1 LD BC,(0xD1441D)   ; reload table base
0x05D5B0: 09             ADD HL,BC           ; HL = table + key_code * 4
0x05D5B1: E5             PUSH HL             ; source address
0x05D5B2: DD 07 09       LD BC,(IX+9)        ; destination buffer (arg 2)
0x05D5B5: C5             PUSH BC
0x05D5B6: CD A4 00 00    CALL 0x0000A4       ; memcpy(dest, src, 4)
0x05D5BA: C1 C1 C1       POP BC × 3
0x05D5BD: DD F9          LD SP,IX
0x05D5BF: DD E1          POP IX
0x05D5C1: C9             RET
```

When `D1441D` is NULL (0x000000), the dispatch function returns immediately without copying any handler data.

## 2. What Value the Home Screen Installs at D1441D

**The home screen stores `0x000000` (NULL) at D1441D.**

All three home-screen-mode write sites explicitly clear D1441D to zero:

| Writer address | Context | Value written |
|----------------|---------|---------------|
| `0x02B896` | Home screen init (checks `(D177B7) == 0x55`) | `LD BC,0x000000` |
| `0x02BD19` | Home screen reinit after `CALL 0x0003E4` | `LD BC,0x000000` |
| `0x041E1C` | Alternate init path (same `CP 0x55` guard) | `LD BC,0x000000` |

The pattern at all three sites is identical:

```
LD A,(0xD177B7)       ; load current mode
CP 0x55               ; is it home screen?
JR NZ,skip            ; no → skip
XOR A
LD (0xD14091),A       ; clear flag
LD BC,0x000000
LD (0xD1441D),BC      ; *** clear key handler table pointer ***
```

The home screen **does not use D1441D for key dispatch**. It relies on a different mechanism entirely (see section 3).

The fourth write site at `0x048B6E` is a save/restore pattern inside `0x048AC4` (the general mode key handler). When leaving home screen mode temporarily (e.g., entering a menu), it saves the current D1441D (which is 0) to the stack, switches to mode 0xAA, and restores D1441D afterward.

The fifth write site at `0x05D5C9` is the installer function itself — only called by external ASM apps via jump table entry 1885.

## 3. Home Screen Mode Initialization and Key Handling

### Mode initialization

The home screen mode is identified by `(D177B7) == 0x55`. Initialization occurs at three code sites (`0x02B886`, `0x02BD01`, `0x041E0B`), all following the same pattern:

1. Check `(D177B7) == 0x55`
2. Clear `D14091` (notification flag)
3. Clear `D1441D` to 0x000000
4. Call `0x05202F` with arg `0x004140` (clears bit 6 at RAM `D000C1`)

### Home screen key handling architecture

The home screen uses a **direct handler** instead of the D1441D table dispatch:

```
ISR → D00587 flag → 0x03FA09 (key scanner entry point)
                          |
            LD A,(D177B7); CP 0x55; JR Z,home_path
                          |
                    (home_path at 0x03FAF3)
                          |
              IN0 A,(0x0F)           ; read LCD status port
              BIT 6,A / BIT 7,A     ; check LCD active
                          |
              CALL 0x049087          ; *** direct home screen key handler ***
                          |
              (reads keyboard ports 0x3100-0x314C directly,
               does debounce and scan code processing,
               writes results to D14059, D1405A, D1405B, etc.)
```

The general key dispatch through `0x05D58F` is called from the event loop at `0x02BDA3`/`0x02BDDE`, but when D1441D is NULL it skips the table lookup entirely. The post-dispatch function `0x02B373` then sets up a default notification structure:

| RAM address | Field | Value |
|-------------|-------|-------|
| `D143E7` | handler address | `0x000000` (NULL) |
| `D143EA` | parameter | `0x000000` |
| `D143ED` | data pointer | `0xD141B3` (key dispatch buffer) |
| `D143F6` | entry size | `0x000004` |
| `D143FF` | notification type | `0x02` |

This notification is submitted via `CALL 0x0004A0` and processed by the OS notification system.

### Non-home-screen modes

Other modes enter key handling through `0x048AC4` (the general mode key handler). This function:

1. Saves the current D1441D to the stack (`0x048B3E`: `LD BC,(D1441D); LD (IX-4),BC`)
2. Switches mode to 0xAA (`LD A,0xAA; LD (D177B7),A`)
3. Copies `0x448` bytes of mode context from D13FD8
4. Restores the saved D1441D from the stack (`0x048B6E`)

This confirms D1441D is mode-specific state that each mode manages independently.

## Summary

| Question | Answer |
|----------|--------|
| What value does the home screen store at D1441D? | **`0x000000` (NULL)** — the home screen explicitly clears it |
| Where is the home screen mode init? | Three sites: `0x02B886`, `0x02BD01`, `0x041E0B` (all guarded by `CP 0x55`) |
| How does the JP table dispatch work? | OS jump table entry 1885 at `0x021E78` → `JP 0x05D5C2` (installer). **No ROM code calls this entry** — it is a public API for ASM apps only |
| How does the home screen handle keys? | Direct handler at `0x049087` (called from `0x03FA09` when mode is 0x55), reads keyboard ports directly. Does NOT use D1441D table dispatch |
| What uses D1441D? | External ASM apps and potentially other OS modes (graph, editor, etc.) that install custom key handler tables via the `0x05D5C2` installer |

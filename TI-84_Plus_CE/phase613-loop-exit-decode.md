# Phase 613 — Outer Loop Exit Target 0x08F5E1 Decode

**Date**: 2026-06-10  
**Entry point for this report**: `0x08F5E1`  
**Triggered by**: `JP Z, 0x08F5E1` at `0x08F458` when CALL 0x090883 (token reader) returns Z flag.

---

## Stack State at Entry

When `JP Z, 0x08F5E1` fires at 0x08F458, the stack contains (top to bottom):

| Depth | What | Pushed by |
|-------|------|-----------|
| +0 | `AF` (outer loop saved) | `PUSH AF` at `0x08F43F` |
| -3 | outer loop return address `0x08F45A` | `CALL 0x090883` at `0x08F454` |

So `RET` would return to `0x08F45A` in the outer loop (the instruction *after* the JP Z).

At `0x08F5E1` entry: two more pushes (`PUSH HL`, `PUSH DE`) bring the stack to 4 items total.

The early-return path `0x08F5DD` does 3× `POP DE` + `RET`: pops HL (saved), DE (saved), AF (outer loop's saved AF), then returns to `0x08F45A`. This is the normal early-exit path (token reader already consumed the token).

---

## Full Disassembly: 0x08F5E1–0x08F6B4

```text
; === ENTRY — save registers, test edit-buffer state ===
0x08f5e1: e5                   push hl
0x08f5e2: d5                   push de
0x08f5e3: 2a 3d 24 d0          ld hl, (0xd0243d)          ; load editBtm pointer
0x08f5e7: ed 5b 40 2a d0       ld de, (0xd02a40)          ; load current token pointer (set by 0x090918 call at 0x08F437)
0x08f5ec: cd dc f3 08          call 0x08f3dc              ; test D000A3 bit 3 (IY+35)
0x08f5f0: ca 96 f6 08          jp z, 0x08f696             ; Z=set → bit CLEAR → jump to 0x08f696 (error/alt path)

; === CALL 0x04C973 — compare HL (editBtm) vs DE (current token ptr) ===
0x08f5f4: cd 73 c9 04          call 0x04c973              ; 24-bit equality compare: Z if HL==DE
0x08f5f8: c2 96 f6 08          jp nz, 0x08f696            ; not equal → jump to 0x08f696

; === CALL 0x090859 — test token against edit buffer ===
0x08f5fc: cd 59 08 09          call 0x090859
0x08f600: d1                   pop de                     ; restore DE (pushed at 0x08F5E2)

; === Branch on Z from 0x090859 ===
0x08f601: 20 1e                jr nz, 0x08f621            ; NZ → jump to multi-token path
; --- Z path (single token / simple case) ---
0x08f603: 3a 36 11 d0          ld a, (0xd01136)           ; load token type byte
0x08f607: fe 1f                cp 0x1f
0x08f609: 28 04                jr z, 0x08f60f             ; token == 0x1F → skip SET
0x08f60b: fd cb 44 e6          set 4, (iy+68)             ; SET D000C4 bit 4 (sub-phase flag)
0x08f60f: 3e 20                ld a, 0x20                 ; space character (0x20)
0x08f611: cd 8e 09 09          call 0x09098e              ; store A to D00599, then load D02A28, set Z if zero
0x08f615: ca dd f5 08          jp z, 0x08f5dd             ; D02A28 == 0 → early return (clean exit)
0x08f619: 3e ef                ld a, 0xef
0x08f61b: 32 99 05 d0          ld (0xd00599), a           ; store 0xEF to D00599 (token output byte)
0x08f61f: 18 4a                jr 0x08f66b                ; → dispatch token

; --- NZ path (multi-token / complex case) ---
0x08f621: cd 53 2b 0a          call 0x0a2b53              ; token lookup helper: HL = token name ptr
0x08f625: 23                   inc hl                     ; advance past length byte
0x08f626: 7e                   ld a, (hl)                 ; load first char of token name
0x08f627: 32 99 05 d0          ld (0xd00599), a           ; store to D00599 (token output)
0x08f62b: 2a 40 2a d0          ld hl, (0xd02a40)          ; reload current token pointer
0x08f62f: 23                   inc hl                     ; advance pointer
0x08f630: cd 39 f2 08          call 0x08f239              ; char classifier: Z if char is bracket/paren
0x08f634: 20 39                jr nz, 0x08f66f            ; non-bracket → go to dispatch

; --- bracket/paren case: save context state ---
; NOTE: instructions at 0x08F636–0x08F65F use SIS/SIL mode prefixes (0x40/0x52)
; These are mixed ADL/SIS loads — the decoder emits them as sis/sil prefixed pairs.
; Semantically they are 16-bit loads into 16-bit RAM slots at D02A31/D02A33 etc.
0x08f636: 40 2a 31 2a          sis ld hl, (0x002a31)      ; save/restore context pair
0x08f63a: 40 22 33 2a          sis ld hl, (0x002a33)
0x08f63e: 40 2a 1d 2a          sis ld hl, (0x002a1d)
0x08f642: 40 22 35 2a          sis ld hl, (0x002a35)
0x08f646: cd 40 f1 08          call 0x08f140              ; context save/restore helper
0x08f64a: 40 22 2d 2a          sis ld hl, (0x002a2d)
0x08f64e: 40 ed 53 2f 2a       sis ld (0x002a2f), de
0x08f653: 40 2a 54 11          sis ld hl, (0x001154)
0x08f657: 40 22 37 2a          sis ld hl, (0x002a37)
0x08f65b: 40 2a 56 11          sis ld hl, (0x001156)
0x08f65f: 40 22 39 2a          sis ld hl, (0x002a39)
0x08f663: cd 92 09 09          call 0x090992              ; load D02A28, set Z if zero
0x08f667: ca dd f5 08          jp z, 0x08f5dd             ; D02A28 == 0 → early return

; --- token dispatch ---
0x08f66b: 3e 0a                ld a, 0x0a                 ; token code 0x0A
0x08f66d: 18 17                jr 0x08f686                ; → write token and dispatch

; --- NZ path from bracket check (0x08F634) ---
0x08f66f: cd 92 09 09          call 0x090992              ; load D02A28, set Z if zero
0x08f673: 28 1d                jr z, 0x08f692             ; D02A28 == 0 → skip to RES+return
0x08f675: 3a 99 05 d0          ld a, (0xd00599)           ; load token output byte
0x08f679: fe f7                cp 0xf7
0x08f67b: 20 04                jr nz, 0x08f681            ; not 0xF7 → call 0x0A23C0
0x08f67d: 3e 0a                ld a, 0x0a                 ; override with 0x0A
0x08f67f: 18 05                jr 0x08f686
0x08f681: cd c0 23 0a          call 0x0a23c0              ; token-to-display mapper
0x08f685: 7e                   ld a, (hl)                 ; load mapped char
; --- common dispatch tail ---
0x08f686: 32 b8 01 d0          ld (0xd001b8), a           ; store to D001B8 (display char buffer?)
0x08f68a: 32 d3 01 d0          ld (0xd001d3), a           ; store to D001D3 (second output buffer?)
0x08f68e: fd cb 44 9e          res 3, (iy+68)             ; RES D000C4 bit 3 (clear phase flag)
0x08f692: c3 dd f5 08          jp 0x08f5dd                ; → early return (pop DE×3, ret to 0x08F45A)
```

## Full Disassembly: 0x08F696 (Alternate Path — bit 3 clear or editBtm≠tokenPtr)

```text
0x08f696: d1                   pop de                     ; restore saved DE
0x08f697: c5                   push bc
0x08f698: cd db 07 09          call 0x0907db              ; decode/advance token cursor
; --- SIS/SIL context: update position in D02A29 ---
0x08f69c: 40 2a 29 2a          sis ld hl, (0x002a29)      ; load 16-bit slot D02A29
0x08f6a0: 5f                   ld e, a                    ; E = result of 0x0907DB
0x08f6a1: 16 00                ld d, 0x00
0x08f6a3: 52 19                sil add hl, de             ; HL += offset (24-bit add)
0x08f6a5: 40 22 29 2a          sis ld hl, (0x002a29)      ; store back to D02A29
0x08f6a9: c3 6c f5 08          jp 0x08f56c                ; → pop bc; pop hl; jp 0x08F433 (restart outer loop body)
```

## Sub-routine: 0x08F6AD (called at top of outer loop — 0x08F404)

```text
0x08f6ad: cd b5 f6 08          call 0x08f6b5
0x08f6b1: c3 ec f6 08          jp 0x08f6ec                ; → 0x08F6EC (token advance + context update)

0x08f6b5: 01 0d 00 00          ld bc, 0x00000d
0x08f6b9: cd 7b 07 09          call 0x09077b              ; allocate/setup 13-byte block
0x08f6bd: 40 2a 56 11          sis ld hl, (0x001156)      ; (continues into 0x08F6C0 region)
...
0x08f6ec: 01 0b 00 00          ld bc, 0x00000b
0x08f6f0: cd 7b 07 09          call 0x09077b
; ... SIS/SIL loads updating D02A54/D02A29/D02A2B
0x08f722: c9                   ret
```

## Called Sub-routines (Summary)

### 0x08F3DC — D000A3 Bit 3 Test
```text
0x08f3dc: fd cb 23 5e    bit 3, (iy+35)    ; test D000A3 bit 3
0x08f3e0: c9             ret               ; Z set if bit CLEAR
```
Z = 1 means D000A3 bit 3 is **clear** (cursor walker disabled).

### 0x04C973 — 24-bit Equality Compare (HL==DE)
Non-destructive. `PUSH HL; OR A; SBC HL,DE; POP HL; RET`. Returns Z if HL == DE.

### 0x090859 — Token Validity Test
```text
0x090859: call 0x08f3dc    ; test D000A3 bit 3
0x09085d: jr nz, 0x090862  ; bit SET → return NZ
0x09085f: ld a, c
0x090860: or b
0x090861: ret              ; Z = (BC == 0)
```
Returns Z if D000A3 bit 3 is clear AND BC == 0.

### 0x09098E — Store A to D00599, Then Test D02A28
```text
0x09098e: ld (0xd00599), a   ; store token output byte
; falls through to:
0x090992: ld a, (0xd02a28)   ; load D02A28
0x090996: or a
0x090997: ret                ; Z if D02A28 == 0
```

### 0x090992 — Test D02A28 (standalone entry)
Loads D02A28, sets Z if zero. Shared tail with 0x09098E.

### 0x08F239 — Bracket/Paren Classifier
```text
0x08f239: cp 0x28    ; '('
0x08f23b: jr z, ...  ; is '(' → Z
0x08f23d: cp 0x7b    ; '{'
0x08f23f: jr z, ...  ; is '{' → Z
0x08f241: cp 0x29    ; ')'
0x08f243: jp z, 0x08f346
0x08f247: cp 0x7d    ; '}'
0x08f249: jp z, 0x08f346
0x08f24d: ret        ; NZ if not a bracket
```

### 0x0907DB — Token Cursor Advance
```text
0x0907db: call 0x0a2b53    ; token lookup
0x0907df: call 0x090992    ; test D02A28
0x0907e3: jr z, ...
0x0907e5: res 2, (iy+50)   ; clear D000B2 bit 2
0x0907e9: call 0x026024    ; (display/LCD helper)
; ... advance HL, load from HL, call 0x08f7d6
```

---

## Control Flow Map

```
0x08F458: JP Z, 0x08F5E1
              │
              ▼
         0x08F5E1  push hl / push de
              │
              ├─ D000A3 bit 3 CLEAR ──────────────────────────────► 0x08F696 (alt path)
              │                                                           │
              ├─ editBtm ≠ tokenPtr (0x04C973 NZ) ──────────────► 0x08F696
              │
              │ (both conditions pass: bit 3 SET, editBtm==tokenPtr)
              ▼
         0x08F5FC: CALL 0x090859
              │
              ├─ NZ: BC≠0 / bit3 SET ─────────────────────────► 0x08F621 (multi-token)
              │
              │ Z: simple token
              ▼
         0x08F603: load D01136 token type
              ├─ type == 0x1F → skip SET ───────────────────────► 0x08F60F
              └─ else: SET 4,(iy+68) [D000C4 bit 4]
              ▼
         0x08F60F: A = 0x20 → CALL 0x09098E
              │
              ├─ D02A28 == 0 ─────────────────────────────────► 0x08F5DD (early return)
              └─ D02A28 ≠ 0: A = 0xEF → D00599 ─────────────► 0x08F66B

         0x08F621 (multi-token):
              CALL 0x0A2B53 → load first char of token name → D00599
              CALL 0x08F239 (bracket classifier)
              ├─ bracket: save context (SIS pairs) → CALL 0x090992
              │    ├─ D02A28 == 0 ─────────────────────────► 0x08F5DD
              │    └─ ≠ 0 → A = 0x0A ──────────────────────► 0x08F686
              └─ non-bracket: CALL 0x090992
                   ├─ D02A28 == 0 ─────────────────────────► 0x08F692 → 0x08F5DD
                   ├─ D00599 == 0xF7: A = 0x0A ──────────► 0x08F686
                   └─ else: CALL 0x0A23C0 (token mapper) ► 0x08F686

         0x08F686 (dispatch tail):
              D001B8 = A, D001D3 = A
              RES 3,(iy+68) [D000C4 bit 3]
              JP 0x08F5DD ───────────────────────────────► 0x08F5DD (early return)

         0x08F5DD (early return):
              pop de / pop de / pop de / ret
              ──────────────────────────────────────────► 0x08F45A (back in outer loop body)

         0x08F696 (alternate path):
              pop de / push bc
              CALL 0x0907DB (advance token cursor)
              update D02A29
              JP 0x08F56C ──────────────────────────────► pop bc; pop hl; JP 0x08F433
                                                                           (restart outer loop)
```

---

## Key RAM Addresses Referenced

| Address | Usage in this region |
|---------|---------------------|
| `D0243D` | `editBtm` — end of edit buffer (loaded at entry) |
| `D02A40` | Current token pointer (loaded at entry; set by CALL 0x090918 in outer loop) |
| `D000A3` bit 3 | Cursor-walker enable flag (tested via 0x08F3DC) |
| `D01136` | Token type byte |
| `D00599` | Token output byte (written multiple paths) |
| `D02A28` | Mode/context flag; Z check gates all early returns |
| `D001B8` | Display character buffer (dispatch tail write) |
| `D001D3` | Second output buffer (dispatch tail write) |
| `D000C4` bit 3 | Phase flag — RES at dispatch tail (0x08F68E) |
| `D000C4` bit 4 | Sub-phase flag — SET at 0x08F60B for non-0x1F tokens |
| `D02A29` | Token cursor position (updated in alternate path) |

---

## Cross-References with Existing Phase Reports

### phase612-loop-decode-report.md
Confirmed: `0x08F458: JP Z,0x08F5E1` is the outer loop's Z-exit when token reader returns Z.  
The outer loop entry is `0x08F3F8` (reached after prologue at `0x08F3B8`).

### phase613-d000a0-semantics.md
`0x08F60B: SET 4,(IY+68)` and `0x08F68E: RES 3,(IY+68)` are already documented there as:
- SET 4 at 0x08F60B: "Set sub-phase bit later in loop body"
- RES 3 at 0x08F68E: "Clear phase flag at loop exit / tail"

### phase608-decode-08f3dc.md / phase611-caller-decode-report.md
`0x08F3DC` (BIT 3,(IY+35)) tested at entry — this is the D000A3 cursor-walker flag whose full semantics were decoded in session 608-611.

### CONTINUATION_PROMPT_CODEX.md (session 607)
`0x04C973` is the 24-bit equality compare (HL==DE). `0x0A2B53` is the token lookup helper. Both confirmed by prior sessions.

`0x090992` (load D02A28, Z if zero) is the shared tail of `0x09098E`. D02A28 is identified in session tracking as a mode/context flag whose value gates token output.

---

## Summary

**0x08F5E1 is the post-token-read dispatch/cleanup routine for the outer edit-buffer loop.**

It fires when `CALL 0x090883` (token reader) returns Z — meaning the token reader found the end of the token stream or consumed the token without advancing.

The routine does three things:

1. **Validates position**: Checks D000A3 bit 3 (cursor walker enabled) and compares the edit-buffer bottom pointer (`D0243D`) against the current token pointer (`D02A40`). If either check fails, it diverts to the alternate path at `0x08F696` which advances the token cursor via `0x0907DB` and restarts the outer loop body at `0x08F433`.

2. **Resolves the output token byte**: Depending on whether the token is simple or multi-character, it either:
   - Writes `0x20` (space) to `D00599` and checks `D02A28`
   - Calls `0x0A2B53` (token lookup) to get the first character of the token's display name
   - Calls `0x0A23C0` (token-to-display mapper) for non-bracket tokens
   The resolved byte ends up in `D001B8` and `D001D3` (display output buffers).

3. **Cleans up flags and returns**: `RES 3,(IY+68)` clears `D000C4` bit 3 (phase flag), then returns to `0x08F45A` in the outer loop via the 3×POP / RET sequence at `0x08F5DD`.

The routine does **not** return to the event loop (0x08C331). It returns to the outer loop body, which may then back-edge to `0x08F3B8` or proceed to subsequent processing. The `0x08F5DD` epilogue pops the AF saved by `PUSH AF` at `0x08F43F`, restoring the original AF before the token reader was called.

**D02A28** is the critical gate: every exit path checks it. When D02A28 is zero, the routine takes the shortest path back. When non-zero, it writes token output bytes and modifies display state.

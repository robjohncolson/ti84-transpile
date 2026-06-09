# Phase 596c — Pass-2 Suspect Addresses

Analysis of ROM bytes at key addresses relevant to the warm key-event loop
pass-2 reset-path blocker. The warm re-entry at `0x02FD8F` takes a reset path
instead of dispatching the pending key token stored in `D0058C`.

IY base assumed = `D00080` (standard TI-OS value).

---

## 1. Warm Key-Event Entry: 0x02FD8F (64+ bytes)

### Hex dump

```
02FD8F: FD CB 28 9E 3E CC 32 00 00 D0 3E 1A FD CB 34 46
02FD9F: 28 05 CD 0A 39 02 C8 DD E5 CD 3A 01 03 DD E1 FD
02FDAF: CB 43 56 CC 6C C7 05 FD CB 43 96 FD CB 08 DE CD
02FDBF: 09 FA 03 FD CB 28 6E 20 06 FD CB 28 5E 28 0A FD
02FDCF: CB 28 9E FD CB 28 AE 3E FF FD CB 34 46 28 08 47
02FDDF: 3E 1B CD 0A 39 02 C8 B7 C2 89 FE 02 3A 00 00 D0
02FDEF: B7 CA 0E 03 03 FD CB 57 56 28 08 FD CB 57 5E C2
02FDFF: 89 FE 02 CD BE D1 03 28 1B FD CB 46 46 C4 78 00
02FE0F: 03 2A 91 05 D0 7C B7 20 05 7D FE 01 28 04 CD 11
02FE1F: 0D 04 AF C9
```

### Decoded instructions

```
02FD8F: FD CB 28 9E    RES 3,(IY+0x28)       ; clear bit 3 of (IY+0x28) [D000A8]
02FD93: 3E CC          LD A,0xCC
02FD95: 32 00 00 D0    LD (D00000),A          ; store 0xCC to D00000 (system mode byte?)
02FD99: 3E 1A          LD A,0x1A
02FD9B: FD CB 34 46    BIT 0,(IY+0x34)        ; test bit 0 of (IY+0x34) [D000B4]
02FD9F: 28 05          JR Z,0x02FDA6          ; if bit 0 clear, skip CALL
02FDA1: CD 0A 39 02    CALL 0x02390A          ; conditional call (bit 0 set)
02FDA5: C8             RET Z                  ; return if Z set after call
; --- fall through or jumped here from JR Z ---
02FDA6: DD E5          PUSH IX
02FDA8: CD 3A 01 03    CALL 0x03013A          ; *** KEY CALL — main dispatch prep? ***
02FDAC: DD E1          POP IX
02FDAE: FD CB 43 56    BIT 2,(IY+0x43)        ; test bit 2 of (IY+0x43) [D000C3]
02FDB2: CC 6C C7 05    CALL Z,0x05C76C        ; call if bit 2 is CLEAR
02FDB6: FD CB 43 96    RES 2,(IY+0x43)        ; clear bit 2 of (IY+0x43) [D000C3]
02FDBA: FD CB 08 DE    SET 3,(IY+0x08)        ; set bit 3 of (IY+0x08) [D00088]
02FDBE: CD 09 FA 03    CALL 0x03FA09          ; *** read D00587 pending-key latch ***
02FDC2: FD CB 28 6E    BIT 5,(IY+0x28)        ; test bit 5 of (IY+0x28) [D000A8]
02FDC6: 20 06          JR NZ,0x02FDCE         ; if bit 5 set, skip next test
02FDC8: FD CB 28 5E    BIT 3,(IY+0x28)        ; test bit 3 of (IY+0x28) [D000A8]
02FDCC: 28 0A          JR Z,0x02FDD8          ; if bit 3 clear, jump to 0x02FDD8
; --- bit 5 set path ---
02FDCE: FD CB 28 9E    RES 3,(IY+0x28)        ; clear bit 3 of (IY+0x28) [D000A8]
02FDD2: FD CB 28 AE    RES 5,(IY+0x28)        ; clear bit 5 of (IY+0x28) [D000A8]
02FDD6: 3E FF          LD A,0xFF              ; A = 0xFF (sentinel "no key"?)
; --- converge here from JR Z at 02FDCC ---
02FDD8: FD CB 34 46    BIT 0,(IY+0x34)        ; test bit 0 of (IY+0x34) [D000B4]
02FDDC: 28 08          JR Z,0x02FDE6          ; if bit 0 clear, skip CALL
02FDDE: 47             LD B,A                 ; save A in B
02FDDF: 3E 1B          LD A,0x1B
02FDE1: CD 0A 39 02    CALL 0x02390A          ; conditional call (bit 0 set)
02FDE5: C8             RET Z                  ; return if Z
; --- fall through or jumped from JR Z ---
02FDE6: B7             OR A                   ; set flags from A
02FDE7: C2 89 FE 02    JP NZ,0x02FE89         ; *** A != 0 → jump to key-dispatch ***
02FDEB: 3A 00 00 D0    LD A,(D00000)          ; re-read D00000
02FDEF: B7             OR A                   ; test A
02FDF0: CA 0E 03 03    JP Z,0x03030E          ; if D00000 == 0, jump away (idle path?)
02FDF4: FD CB 57 56    BIT 2,(IY+0x57)        ; test bit 2 of (IY+0x57) [D000D7]
02FDF8: 28 08          JR Z,0x02FE02          ; skip if clear
02FDFA: FD CB 57 5E    BIT 3,(IY+0x57)        ; test bit 3 of (IY+0x57) [D000D7]
02FDFE: C2 89 FE 02    JP NZ,0x02FE89         ; if bit 3 set, go to key-dispatch
; --- fell through: both bits not as expected ---
02FE02: CD BE D1 03    CALL 0x03D1BE
02FE06: 28 1B          JR Z,0x02FE23
02FE08: FD CB 46 46    BIT 0,(IY+0x46)        ; [D000C6]
02FE0C: C4 78 00 03    CALL NZ,0x030078
02FE10: 2A 91 05 D0    LD HL,(D00591)         ; read 24-bit pointer from D00591
02FE14: 7C             LD A,H
02FE15: B7             OR A
02FE16: 20 05          JR NZ,0x02FE1D
02FE18: 7D             LD A,L
02FE19: FE 01          CP 0x01
02FE1B: 28 04          JR Z,0x02FE21
02FE1D: CD 11 0D 04    CALL 0x040D11
02FE21: AF             XOR A                  ; A = 0
02FE22: C9             RET                    ; *** RETURN with A=0 (no key dispatched) ***
```

### Key observations — 0x02FD8F path

1. **0x02FDBE calls 0x03FA09** which reads `D00587` (the pending-key latch),
   clears it, and returns the key code in A. If no key is pending, A returns 0
   or 0xFF.

2. **0x02FDE7: `JP NZ,0x02FE89`** — this is the critical fork. If A is non-zero
   (a real key was found), execution jumps to `0x02FE89` for dispatch.
   If A == 0, execution falls through to the "no key" / idle path, eventually
   returning with A=0 at `0x02FE22`.

3. **The "reset path" means A == 0 at 0x02FDE6.** On pass 2, the pending key
   latch at D00587 has already been consumed by pass 1. When pass 2 calls
   `0x03FA09` again, D00587 is zero → A=0 → falls through → no dispatch.

4. **D000A8 bits 3 and 5** gate whether the key latch value survives. If bit 5
   is set at `0x02FDC2`, execution jumps to `0x02FDCE` which forces A=0xFF
   (effectively discarding the latch value). This could cause a false "no key"
   on pass 2 even if the latch hadn't been cleared.

---

## 2. Pending-Key Relay: 0x02FE73 (48 bytes)

### Hex dump

```
02FE73: 3A 8C 05 D0 B7 CA 99 FD 02 FD CB 43 96 FD CB 1F
02FE83: AE CD 00 03 03 FD CB 12 9E 3E 3F FD CB 28 7E 20
02FE93: EB C3 9B 04 04 FD CB 1D C6 FD CB 00 66 28 10 FD
02FEA3: CB 1D 86 CD 00 03 03 FD CB 00 A6 FD CB 25 96
```

### Decoded instructions

```
02FE73: 3A 8C 05 D0    LD A,(D0058C)          ; *** READ the pending key token ***
02FE77: B7             OR A                   ; set flags
02FE78: CA 99 FD 02    JP Z,0x02FD99          ; *** if D0058C == 0, LOOP BACK to 0x02FD99 ***
                                              ; THIS IS THE PASS-2 RESET JUMP
02FE7C: FD CB 43 96    RES 2,(IY+0x43)        ; clear bit 2 of [D000C3]
02FE80: FD CB 1F AE    RES 5,(IY+0x1F)        ; clear bit 5 of [D0009F]
02FE84: CD 00 03 03    CALL 0x030300          ; *** relay/dispatch the key ***
02FE88: C9             RET                    ; (actually this is part of the next instruction block)
; ---- next block (0x02FE89 = target of JP NZ from 0x02FDE7) ----
02FE89: FD CB 12 9E    RES 3,(IY+0x12)        ; clear bit 3 of [D00092]
02FE8D: 3E 3F          LD A,0x3F
02FE8F: FD CB 28 7E    BIT 7,(IY+0x28)        ; test bit 7 of [D000A8]
02FE93: 20 EB          JR NZ,0x02FE80         ; if bit 7 set, jump back to 0x02FE80 
                                              ; (RES 5 + CALL 0x030300 path)
02FE95: C3 9B 04 04    JP 0x04049B            ; *** alternate dispatch target ***
; ---- separate block ----
02FE99: FD CB 1D C6    SET 0,(IY+0x1D)        ; set bit 0 of [D0009D]
02FE9D: FD CB 00 66    BIT 4,(IY+0x00)        ; test bit 4 of [D00080]
02FEA1: 28 10          JR Z,0x02FEB3          ; skip if clear
02FEA3: FD CB 1D 86    RES 0,(IY+0x1D)        ; clear bit 0 of [D0009D]
02FEA7: CD 00 03 03    CALL 0x030300
02FEAB: FD CB 00 A6    RES 4,(IY+0x00)        ; clear bit 4 of [D00080]
02FEAF: FD CB 25 96    RES 2,(IY+0x25)        ; clear bit 2 of [D000A5]
```

### Key observations — 0x02FE73 path

1. **0x02FE73 reads D0058C** (the translated key token, distinct from D00587
   raw key latch). If the token is zero, it jumps BACK to `0x02FD99` — this
   is the "pass-2 reset" behavior. The loop re-enters the warm path but
   D0058C has already been consumed, so it loops into the idle/no-key path.

2. **0x02FE78: `JP Z,0x02FD99`** is the exact instruction causing the reset.
   On pass 1, D0058C holds the translated token (e.g., 0x90 for ENTER).
   On pass 2, D0058C has been cleared to 0 (either by this code or by the
   dispatch at 0x030300), so the JP Z fires and re-enters the warm loop
   from scratch.

3. **0x02FE89** is the entry from the `JP NZ` at `0x02FDE7`. This path sets
   A=0x3F, tests bit 7 of [D000A8], and either calls `0x030300` (the key
   relay) or jumps to `0x04049B` (alternate dispatch).

---

## 3. D0058C Cross-Reference

### Total occurrences of `8C 05 D0` in ROM: **47**

### Occurrences in 0x02F000–0x030000 range (5 hits)

| Address | Instruction bytes | Decoded | Type |
|---------|------------------|---------|------|
| `0x02F95D` | `AF 32 8C 05 D0` | `XOR A` / `LD (D0058C),A` | **WRITE** (A=0, clear token) |
| `0x02FCBA` | `AF 32 8C 05 D0` | `XOR A` / `LD (D0058C),A` | **WRITE** (A=0, clear token) |
| `0x02FE61` | `21 8C 05 D0 36 00` | `LD HL,D0058C` / `LD (HL),0x00` | **WRITE** (clear via HL, 0x00) |
| `0x02FE74` | `3A 8C 05 D0` | `LD A,(D0058C)` | **READ** (the pass-2 check) |
| `0x02FEC9` | `3E FA 32 8C 05 D0` | `LD A,0xFA` / `LD (D0058C),A` | **WRITE** (store 0xFA sentinel) |

### Analysis of D0058C writes in the 0x02F–0x030 range

- **0x02F95D and 0x02FCBA**: Both clear D0058C to 0 (`XOR A` then store).
  These are initialization/reset writes.

- **0x02FE61**: `LD HL,D0058C` / `LD (HL),0x00` — another clearing path, using
  HL-indirect store. This is at the bottom of the long key-event handler, just
  before the `0x02FE73` read.

  Surrounding context at `0x02FE58`:
  ```
  02FE58: FD CB 41 AE    RES 5,(IY+0x41)        ; [D000C1]
  02FE5C: 20 04          JR NZ,0x02FE62         ; (from previous BIT test)
  02FE5E: C3 BE FD 02    JP 0x02FDBE            ; skip the clear, re-enter warm loop
  02FE62: 21 8C 05 D0    LD HL,D0058C
  02FE66: 36 00          LD (HL),0x00           ; *** CLEAR D0058C ***
  02FE68: 28 0A          JR Z,0x02FE74          ; (Z from the LD? No — from earlier BIT)
                                                ; actually JR Z here goes to 0x02FE74
  02FE6A: FD CB 1F 6E    BIT 5,(IY+0x1F)        ; [D0009F]
  02FE6E: FD CB 1F AE    RES 5,(IY+0x1F)
  02FE72: 20 00          JR NZ,0x02FE74         ; falls through to 0x02FE74
  02FE74: 3A 8C 05 D0    LD A,(D0058C)          ; *** THE READ ***
  ```

- **0x02FEC9**: Writes `0xFA` to D0058C — a non-zero sentinel. This only
  fires when bit 3 of (IY+0x57) [D000D7] is set AND bit 3 of (IY+0x57)
  [D000D7] conditions are met (see surrounding code at 0x02FEB8).

### The bug path (pass-2 token consumption)

The sequence that causes the pass-2 reset:

1. **Pass 1**: Key press sets `D00587` (raw latch) and `D0058C` (translated
   token, e.g., 0x90 for ENTER).

2. **Pass 1 dispatch**: `0x02FE73` reads D0058C → non-zero → falls through
   to `0x02FE7C` → calls `0x030300` to dispatch the key.

3. **At 0x02FE62**: After dispatch returns, `LD (HL),0x00` clears D0058C back
   to zero. This is correct for single-pass behavior.

4. **Pass 2 re-entry at 0x02FD8F**: The warm loop re-enters. `0x03FA09`
   reads D00587 (already consumed → A=0). Falls through at `0x02FDE7`
   (A==0) to idle path. Eventually reaches `0x02FE73`.

5. **0x02FE73**: `LD A,(D0058C)` → A=0 (cleared in step 3) → `JP Z,0x02FD99`
   → reset loop. The key is fully consumed and pass 2 has nothing to dispatch.

### Fix hypothesis

The pass-2 reset occurs because both `D00587` (raw latch) and `D0058C`
(translated token) are consumed/cleared during pass 1. For a clean pass-2
dispatch, one of these must survive:

- **Option A**: Don't clear D0058C at `0x02FE62` until a flag indicates both
  passes are complete.
- **Option B**: Save the token before dispatch and restore it for pass 2 in
  the transpiler runtime.
- **Option C**: Prevent pass-2 re-entry entirely if the key has already been
  dispatched (the OS may not intend a second pass at all — the "pass 2" may
  be a transpiler artifact from re-entering the event loop).

---

## 4. Supporting Subroutines

### 0x03FA09 — Pending-Key Latch Reader

```
03FA09: 21 87 05 D0    LD HL,D00587           ; point HL at raw key latch
03FA0D: F3             DI                     ; disable interrupts
03FA0E: 7E             LD A,(HL)              ; read the latch
03FA0F: 36 00          LD (HL),0x00           ; clear it atomically
03FA11: FD CB 00 9E    RES 3,(IY+0x00)        ; clear bit 3 of [D00080]
03FA15: FB             EI                     ; re-enable interrupts
03FA16: F5             PUSH AF                ; save key code
03FA17: B7             OR A                   ; test A
03FA18: C2 ...         JP NZ,...              ; if key present, continue processing
```

This confirms D00587 is the ISR-written key latch. The `DI`/`LD`/`LD 0`/`EI`
pattern is a classic atomic read-and-clear. After this call, D00587 is always
zero — pass 2 will never find a key here.

### 0x030300 — Key Dispatch Entry

```
030300: FD CB 1D 46    BIT 0,(IY+0x1D)        ; test bit 0 of [D0009D]
030304: C0             RET NZ                 ; return if bit 0 SET (already dispatching?)
030305: FD CB 08 9E    RES 3,(IY+0x08)        ; clear bit 3 of [D00088]
030309: CD 11 0D 04    CALL 0x040D11          ; actual key handler
03030D: C9             RET
```

The `BIT 0,(IY+0x1D)` / `RET NZ` is a reentrancy guard — if dispatch is
already in progress, bail immediately.

---

## 5. Summary

| Address | Role | Pass-2 Impact |
|---------|------|---------------|
| `0x02FD8F` | Warm entry: clear flags, read mode, call 0x03FA09 | D00587 already zero on pass 2 |
| `0x02FDE7` | `JP NZ,0x02FE89` — key-present fork | A=0 on pass 2 → falls through to idle |
| `0x02FE62` | `LD (HL),0x00` — clears D0058C | Token consumed, unavailable for pass 2 |
| `0x02FE73` | `LD A,(D0058C)` — reads token | Zero on pass 2 → `JP Z` back to warm entry |
| `0x02FE78` | `JP Z,0x02FD99` — the reset jump | **This is the pass-2 reset instruction** |
| `0x03FA09` | Atomic read-and-clear of D00587 | Latch consumed on pass 1, zero on pass 2 |
| `0x030300` | Key dispatch with reentrancy guard | Dispatches correctly but token is gone |

The root cause is that both the raw key latch (`D00587`) and the translated
token (`D0058C`) are single-shot: read once, clear immediately. The OS was not
designed for a second pass through the event loop for the same keypress. The
"pass 2" re-entry is likely a transpiler artifact from the `setjmp`/`longjmp`
loop structure, not an intended OS code path.

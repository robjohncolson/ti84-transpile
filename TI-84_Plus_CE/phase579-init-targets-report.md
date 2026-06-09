# Phase 579: Init Trampoline Targets Decoded

Session 578 identified 0x063033 as a 13-byte init trampoline (10 callers):
```
CALL 0x0250FA → CALL 0x09E640 → CALL Z,0x09E601 → RET
```

All three targets are now decoded.

---

## 0x0250FA — RAM BLOCK COPY (20B, 7 insns, 2 callers)

**Callers**: 0x063033 (init trampoline), 0x09D1D7

```
0x0250FA  LD HL, 0xD007E2       ; source
0x0250FE  LD DE, 0xD007CA       ; destination
0x025102  LD BC, 0x000017       ; length = 23 bytes
0x025106  LDIR                  ; copy D007E2..D007F8 → D007CA..D007E0
0x025108  LD A, (HL)            ; read byte at D007F9
0x025109  LD (0xD0008D), A      ; store to D0008D
0x02510D  RET
```

**Function**: Copies 23 bytes from D007E2 to D007CA (overlapping — LDIR handles forward copy safely). Then copies one more byte from D007F9 to D0008D. This is a state-backup/restore operation — the 23-byte region D007CA..D007E0 is the OS context block (mode byte D007E0 is the last destination byte).

**RAM refs**: D007E2 (source), D007CA (dest), D0008D (single byte store)

---

## 0x09E640 — MODE VALIDATOR / CPIR LOOKUP (15B, 5 insns, 1 CALL + 1 JP ref)

**CALL callers**: 0x063037 (init trampoline)
**JP refs**: 0x0219B4

```
0x09E640  LD A, (0xD007E0)      ; read current mode byte
0x09E644  LD HL, 0x09E64F       ; point to valid-mode table in ROM
0x09E648  LD BC, 0x000007       ; 7 entries
0x09E64C  CPIR                  ; search table for A
0x09E64E  RET                   ; Z flag set if mode found in table
```

**Valid mode table** at 0x09E64F (7 bytes):
```
0x40, 0x49, 0x43, 0x48, 0x44, 0x4A, 0x4B
```

These are ASCII: `@`, `I`, `C`, `H`, `D`, `J`, `K`. These correspond to the OS mode identifiers.

**Function**: Reads D007E0 (the mode byte) and checks if it's one of the 7 valid modes. Returns Z=1 if valid, Z=0 if invalid. The init trampoline uses this: `CALL 0x09E640` then `CALL Z,0x09E601` — meaning 0x09E601 only runs if the mode is valid.

---

## 0x09E601 — DISPLAY CONTEXT REINIT (53B, 16 insns, 6 callers)

**Callers**: 0x058350, 0x05FEF9, 0x09E2B2, 0x09E37C, 0x0AB67B, 0x0B2950 (+ conditional from init trampoline)

```
0x09E601  CALL 0x0800A0         ; check something (returns Z if no-op)
0x09E605  RET Z                 ; early exit if nothing to do
0x09E606  BIT 2, (IY+20)        ; test IY+0x14 bit 2 (display dirty flag?)
0x09E60A  JR Z, 0x09E636        ; skip reinit if bit clear → JP 0x0A2E05
0x09E60C  CALL 0x0A21BB         ; sub-call 1
0x09E610  CALL 0x0A27DD         ; sub-call 2 (key input — known from session 578)
0x09E614  LD HL, (0xD007D6)     ; save current D007D6 value
0x09E618  PUSH HL
0x09E619  CALL 0x063051         ; sub-call 3
0x09E61D  RES 1, (IY+2)         ; clear IY+0x02 bit 1
0x09E621  CALL 0x044409         ; sub-call 4
0x09E625  POP HL
0x09E626  LD (0xD007D6), HL     ; restore D007D6
0x09E62A  CALL 0x0A349A         ; sub-call 5
0x09E62E  RES 2, (IY+20)        ; clear IY+0x14 bit 2 (ack dirty flag)
0x09E632  JP 0x0A2E05           ; tail-call to 0x0A2E05
```

**Function**: Display context reinitializer. Guards on 0x0800A0 result and IY+0x14 bit 2 (display-dirty). When active: calls key input (0x0A27DD), saves/restores D007D6 across a reinit sequence (0x063051 then 0x044409), clears busy flags (IY+2 bit 1, IY+20 bit 2), tail-jumps to 0x0A2E05.

**IY ops**: BIT 2,(IY+20) — guard; RES 1,(IY+2) — clear busy; RES 2,(IY+20) — ack dirty
**RAM refs**: D007D6 (saved/restored across reinit), D007E0 (indirectly via mode check)
**Sub-calls**: 0x0800A0, 0x0A21BB, 0x0A27DD, 0x063051, 0x044409, 0x0A349A
**Tail-jump**: JP 0x0A2E05

---

## Summary

| Address | Size | Insns | Label | Callers | Sub-calls |
|---------|------|-------|-------|---------|-----------|
| 0x0250FA | 20B | 7 | RAM BLOCK COPY | 2 | 0 |
| 0x09E640 | 15B | 5 | MODE VALIDATOR | 1+1 JP | 0 |
| 0x09E601 | 53B | 16 | DISPLAY CONTEXT REINIT | 6 | 6 |

**New RAM addresses mapped**:
- D007CA: context block destination (23 bytes)
- D007E2: context block source (23 bytes)
- D0008D: single-byte state variable
- D007D6: display context pointer (saved/restored in reinit)
- D007E0: mode byte (confirmed — read by mode validator)

**New sub-call targets for future decoding**:
- 0x0800A0 — guard check (called by 0x09E601)
- 0x0A21BB — unknown (called during reinit)
- 0x063051 — unknown (called during reinit, D007D6 saved around it)
- 0x044409 — unknown (called during reinit)
- 0x0A349A — unknown (called during reinit)
- 0x0A2E05 — tail target (known from prior sessions)
- 0x0A27DD — key input (known from session 578)

**Valid OS mode table** at 0x09E64F: `[0x40, 0x49, 0x43, 0x48, 0x44, 0x4A, 0x4B]`

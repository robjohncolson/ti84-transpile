# Phase 579: Trace 0x06CE73 — KEY DISPATCH PRE-PROCESSOR

## Target

`0x06CE73` is the second call in the event loop body decoded in session 578:

```text
RES 5,(IY+0x14)
CALL 0x05C634
CALL 0x06CE73   ← THIS TARGET
CALL 0x0A349A
CALL 0x05C75B
```

## Classification: KEY CODE DISPATCHER / PRE-PROCESSOR

0x06CE73 is a **key-code pre-processor** that reads the current key code from D0146D, filters special keys (CLEAR 0x85, DEL 0x87, MODE 0x8D), and dispatches recognized key codes to handler subroutines via a massive CP cascade. It runs every event loop iteration but early-exits (RET Z) when no key is pending (D0146D == 0).

## Structure

### Wrapper (0x06CE73, 12 bytes)
```
0x06CE73  RES 3, (IY+0x02)      ; clear "key processed" flag at D00082
0x06CE77  CALL 0x06CE7F          ; inner worker
0x06CE7B  JP 0x06C8AB            ; tail: LD HL,0xFFFF + store cursor pos
```

Callers: 1 CALL at 0x08C339 (event loop), 1 JP at 0x020BC0.

### Inner Worker (0x06CE7F, 96+ bytes, continues to 0x06CFAF+)

Entry:
```
LD A, (D0146D)    ; load current key code
OR A, A           ; test if zero
RET Z             ; no key pending → return
```

Early-exit filter for special keys:
```
RES 1, (IY+0x0D)  ; clear flag at D0008D
CP 0x85            ; CLEAR key
RET Z
CP 0x87            ; DEL key
RET Z
CP 0x8D            ; MODE key → JP Z, 0x06CF41 (separate handler)
```

Then CALL 0x06C8B4 (cursor position saver) and RES 1,(IY+0x05).

**Graph mode gate** at IY+0x4E bit 2 and IY+0x03 bit 2:
- If graph mode active: CALL 0x09F1DF with HL=D02709 (token insertion helper)

**CALL 0x06AF6C** — reads D026B2, calls 0x061B8E, writes D026AE (cursor/display state sync, 17 callers).

Re-reads key code, special-cases 0x07 → JP Z, 0x06CFAF (graph/table key handler).

**BIT 0,(IY+0x02)** gate — if clear, falls into key dispatch cascade at 0x06CF41.

If D01D45 != 0: CALL 0x0B0BAD (status bar formatter, 120B, SET 1 IY+0x05, writes D008D5=0x1E).

### Key Dispatch Cascade (0x06CEEB–0x06CF41+)

Massive CP cascade on the key code in A (read from D0146D):

| Key Code | Hex  | Handler Target     |
|----------|------|--------------------|
| 0x5F     | _    | JP Z, 0x06AD7B     |
| 0x61     | a    | JP Z, 0x06AD8B     |
| 0x53     | S    | JR Z, 0x06CF19     |
| 0x65     | e    | JP Z, 0x06AD63     |
| 0x67     | g    | JP Z, 0x06AD6B     |
| 0x59     | Y    | JR Z, 0x06CF2B     |
| 0x55     | U    | JR Z, 0x06CF35     |
| 0x69     | i    | JP Z, 0x06AD5B     |
| 0x7F     | DEL  | JR Z, 0x06CF19     |
| 0x81     |      | JR Z, 0x06CF35     |
| 0x6B     |      | JR Z, 0x06CF35     |
| 0x6D     |      | JP Z, 0x06AD83     |
| 0x77     |      | JR Z, 0x06CF19     |
| 0x79     |      | JP Z, 0x06AD73     |
| 0x7B     |      | JR Z, 0x06CF2B     |
| 0x57     |      | JR Z, 0x06CF2B     |
| 0x89     |      | JP Z, 0x06ADC9     |
| 0x8B     |      | JR Z, 0x06CF43     |
| 0x8D     |      | JP Z, 0x06ADD1     |
| 0x1B     |      | JR Z, 0x06CF59     |
| 0x1D     |      | JR Z, 0x06CF59     |

### Post-Cascade (0x06CF61+)

```
BIT 2, (IY+0x17)   ; check flag at D00097
RET NZ
CALL 0x06FC9C       ; key handler A
RET Z
CALL 0x06FCA2       ; key handler B
RET Z
CP 0x4D             ; check for 'M' key
RET Z
CP 0x2F / CP 0x05   ; further key checks
JP Z, 0x06AABF
BIT 0, (IY+0x11)    ; flag at D00091
RET NZ
```

Final path: SET 6,(IY+0x1D) → CALL 0x06C72D (screen-mode tester) → further dispatch.

### Graph Key Handler (0x06CFAF)

Entered when key code == 0x07 (GRAPH key):
- BIT 4,(IY+0x04) → RET NZ (exit if in certain mode)
- BIT 3,(IY+0x04) gate, BIT 6,(IY+0x03), BIT 7,(IY+0x03) gates
- Many sub-calls: 0x061DEF, 0x07FFB3, 0x0846EA, 0x07FFAF, 0x09AC64, 0x07F8FA, 0x09AC73, 0x07DAF8, 0x07FEB6, 0x061E20, 0x082957, 0x09A55E, 0x082902, 0x09A554

## RAM Variables

| Address  | Usage |
|----------|-------|
| D0146D   | Current key code (read 4x) — primary input |
| D01D45   | Status bar dirty flag (if nonzero → format status bar) |
| D02709   | Token insertion buffer (passed to 0x09F1DF in HL) |
| D026B2   | Read by 0x06AF6C cursor/display sync |
| D026AE   | Written by 0x06AF6C cursor/display sync |
| D008D5   | Written 0x1E by 0x0B0BAD (status bar timer/counter) |
| D0265C   | Read at 0x06CF59 for 0x1B/0x1D key handling |

## IY Flags

| IY+offset | Address  | Operation | Meaning |
|-----------|----------|-----------|---------|
| IY+0x02   | D00082   | RES 3     | Clear "key processed" (wrapper entry) |
| IY+0x02   | D00082   | BIT 0     | Gate for key dispatch cascade |
| IY+0x02   | D00082   | BIT 3     | Post-graph key gate |
| IY+0x03   | D00083   | BIT 2     | Graph mode check |
| IY+0x03   | D00083   | BIT 6,7   | Graph key handler gates |
| IY+0x04   | D00084   | BIT 3     | Graph key handler gate |
| IY+0x04   | D00084   | BIT 4     | Graph key exit / status bar gate |
| IY+0x05   | D00085   | RES 1     | Clear after cursor save |
| IY+0x05   | D00085   | SET 1     | Set by status bar formatter |
| IY+0x0D   | D0008D   | RES 1     | Clear early in key processing |
| IY+0x11   | D00091   | BIT 0     | Post-cascade gate |
| IY+0x17   | D00097   | BIT 2     | Post-cascade exit gate |
| IY+0x18   | D00098   | BIT 0     | Status bar mode check |
| IY+0x1D   | D0009D   | SET 6     | Set before screen-mode tester call |
| IY+0x4E   | D000CE   | BIT 2     | Graph mode active flag |
| IY+0x4E   | D000CE   | SET 2     | Set by 0x09F1DF |

## Sub-Calls Summary

| Address   | Called From | Purpose |
|-----------|------------|---------|
| 0x06C8B4  | 0x06CE95   | Cursor position saver (9B, 6 callers) |
| 0x09F1DF  | 0x06CEAD   | Token insertion / graph edit helper (62B, 5 callers) |
| 0x06AF6C  | 0x06CEB1   | Cursor/display state sync (18B, 17 callers) |
| 0x0B0BAD  | 0x06CECC   | Status bar formatter (120B, 1 caller) |
| 0x06C8AB  | JP tail    | Cursor position finalizer (9B, 5 callers) |
| 0x06FC9C  | 0x06CF66   | Key handler A |
| 0x06FCA2  | 0x06CF6B   | Key handler B |
| 0x06C72D  | 0x06CF8F   | Screen-mode bit tester (session 578 decoded) |

## Probe

Working probe: `probe-phase579-trace-06CE73.mjs`

Run:
```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase579-trace-06CE73.mjs
```

## Status

DECODED. The original probe was broken (passed `DataView` to decoder which expects `Uint8Array`/`Buffer`). Fixed and fully traced. 0x06CE73 is confirmed as the **key dispatch pre-processor** — the second call in every event loop iteration. It reads the pending key code from D0146D, filters special keys, and dispatches to ~20+ handler addresses via a CP cascade.

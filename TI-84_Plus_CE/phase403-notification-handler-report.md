# Phase 403 - Decode 0x0499C0 Notification Handler

ROM: `TI-84_Plus_CE/ROM.rom`

## Summary

- `0x0499C0` does not consume the pushed `new_type` argument from `0x049CCA`.
- It reads only `0xD177B9`, the current notification type byte.
- All reachable table targets return the preinitialized local value `0x01`, so this ROM image treats `0x0499C0` as an always-allow exit hook.
- The apparent zero-return stub at `0x049A17` exists in code bytes but is not selected by the inline table and has no literal CALL/JP references.
- The actual state-transition work happens in `0x049CCA`, which recursively flushes the old state with payload `0x00`, commits the new state to `0xD177B9`, and stores the payload in `0xD177B8`.

## 1. Full Disassembly of 0x0499C0

### 1.1 Executable Prologue

```text
0x0499C0  21 FF FF FF       LD HL, 0xFFFFFF
0x0499C4  CD 2C 01 00       CALL 0x00012C
0x0499C8  DD 36 FF 01       LD (IX-0x01), 0x01
0x0499CC  3A B9 77 D1       LD A, (0xD177B9)
0x0499D0  B7                OR A
0x0499D1  ED 62             SBC HL, HL
0x0499D3  6F                LD L, A
0x0499D4  CD 24 01 00       CALL 0x000124
```

### 1.2 Inline _seqcase Table at 0x0499D8

The table has `rawCount = 0x0E`, so it contains 13 explicit cases plus a default:

| Current type | Target | Meaning |
| --- | --- | --- |
| `0x01` | `0x049A15` | `JR 0x049A1B` -> return local retval unchanged (`0x01`) |
| `0x02` | `0x049A15` | same |
| `0x03` | `0x049A15` | same |
| `0x04` | `0x049A15` | same |
| `0x10` | `0x049A1B` | direct epilogue -> return local retval unchanged (`0x01`) |
| `0x11` | `0x049A1B` | same |
| `0x12` | `0x049A1B` | same |
| `0x13` | `0x049A1B` | same |
| `0x14` | `0x049A1B` | same |
| `0x15` | `0x049A1B` | same |
| `0x16` | `0x049A1B` | same |
| `0x17` | `0x049A15` | same |
| `0x18` | `0x049A15` | same |
| default | `0x049A15` | same |

### 1.3 Tail / Epilogue Stubs

```text
0x049A15  18 04             JR 0x049A1B
0x049A17  DD 36 FF 00       LD (IX-0x01), 0x00
0x049A1B  DD 7E FF          LD A, (IX-0x01)
0x049A1E  DD F9             LD SP, IX
0x049A20  DD E1             POP IX
0x049A22  C9                RET
```

`0x049A17` would produce a zero return, but it is not chosen by the table.

## 2. Parameter and RAM Access Map

- Positive `IX+offset` argument reads: none.
- Local frame usage: `(IX-1)` only, as a one-byte return slot.
- Global RAM reads: `0xD177B9` only.
- Global RAM writes: none.
- IY-offset flag accesses: none. There are no `FD`-prefixed instructions in `0x0499C0`.
- Calls:
  - `0x00012C` - frame setup helper
  - `0x000124` - inline `_seqcase`
- Return value: `A = (IX-1)` at `0x049A1B`. Since the reachable targets never overwrite the local byte, the observable return is constant `0x01`.

## 3. All ROM Callers of 0x0499C0

Literal scan results:

- `CALL 0x0499C0`: 1 hit
- `JP 0x0499C0`: 0 hits

Caller context:

```text
0x049CDE  DD BE 09          CP (IX+0x09)
0x049CE1  28 2E             JR Z, 0x049D11
0x049CE3  DD 4E 09          LD C, (IX+0x09)
0x049CE6  06 00             LD B, 0x00
0x049CE8  C5                PUSH BC
0x049CE9  CD C0 99 04       CALL 0x0499C0
```

Interpretation: `0x049CCA` passes the requested destination type from `(IX+9)`, zero-extended in `BC`. `0x0499C0` never reads it.

## 4. Handler Jump Table at 0x049D3A

The `0x049D3A` table has `rawCount = 0x0E`, so it contains 13 explicit cases plus a default. Every explicit handler body and the default body do the same thing:

```text
LD A, (IX+0x06)
LD (0xD177B8), A
JR 0x049DF9
```

### 4.1 Explicit Targets

| Type | Target |
| --- | --- |
| `0x01` | `0x049D77` |
| `0x02` | `0x049D80` |
| `0x03` | `0x049D89` |
| `0x04` | `0x049D92` |
| `0x10` | `0x049D9B` |
| `0x11` | `0x049DA4` |
| `0x12` | `0x049DAD` |
| `0x13` | `0x049DB6` |
| `0x14` | `0x049DBF` |
| `0x15` | `0x049DC8` |
| `0x16` | `0x049DD1` |
| `0x17` | `0x049DDA` |
| `0x18` | `0x049DE3` |

### 4.2 Full Type Map 0x00-0x18

| Type | Mapping |
| --- | --- |
| `0x00` | default -> `0x049DEC` |
| `0x01` | explicit -> `0x049D77` |
| `0x02` | explicit -> `0x049D80` |
| `0x03` | explicit -> `0x049D89` |
| `0x04` | explicit -> `0x049D92` |
| `0x05` | default -> `0x049DEC` |
| `0x06` | default -> `0x049DEC` |
| `0x07` | default -> `0x049DEC` |
| `0x08` | default -> `0x049DEC` |
| `0x09` | default -> `0x049DEC` |
| `0x0A` | default -> `0x049DEC` |
| `0x0B` | default -> `0x049DEC` |
| `0x0C` | default -> `0x049DEC` |
| `0x0D` | default -> `0x049DEC` |
| `0x0E` | default -> `0x049DEC` |
| `0x0F` | default -> `0x049DEC` |
| `0x10` | explicit -> `0x049D9B` |
| `0x11` | explicit -> `0x049DA4` |
| `0x12` | explicit -> `0x049DAD` |
| `0x13` | explicit -> `0x049DB6` |
| `0x14` | explicit -> `0x049DBF` |
| `0x15` | explicit -> `0x049DC8` |
| `0x16` | explicit -> `0x049DD1` |
| `0x17` | explicit -> `0x049DDA` |
| `0x18` | explicit -> `0x049DE3` |

### 4.3 Important Correction

- The default target for the `0x049D3A` table is `0x049DEC`, not `0x049DF5`.
- `0x049DF5` does contain `LD (IX-1),0x02`, but it is not the table default. The actual default stores the payload to `0xD177B8` exactly like every explicit case body.

## 5. Cross-Reference With 0x049CCA

Relevant control flow:

```text
0x049CDA  LD A, (0xD177B9)
0x049CDE  CP (IX+0x09)
0x049CE3  LD C, (IX+0x09)
0x049CE8  PUSH BC
0x049CE9  CALL 0x0499C0
0x049CEE  OR A
0x049CF1  LD A, (0xD177B9)
0x049CF8  PUSH BC          ; old type
0x049CF9  LD BC, 0x000000
0x049CFD  PUSH BC          ; payload 0
0x049CFE  CALL 0x049CCA    ; recursive flush
0x049D07  LD (0xD177B9), A ; commit new type
0x049D1F  CALL 0x049A23
0x049D36  CALL 0x000124    ; table at 0x049D3A
```

Interpretation:

1. `0x049CCA` compares the requested type `(IX+9)` against the current type in `0xD177B9`.
2. On a mismatch, it calls `0x0499C0`, passing the requested type.
3. `0x0499C0` ignores that argument and simply returns `0x01`.
4. Because the return is nonzero, `0x049CCA` always performs the recursive old-state flush with `(old_type, 0x00)`.
5. `0x049CCA` then commits the new type to `0xD177B9`, runs the process helper for the new payload, and stores the new payload into `0xD177B8`.

## Verdict

- `0x0499C0` is not a real teardown routine in this ROM image.
- It is an exit-hook / gate slot whose implementation always allows the transition.
- The actual old-state cleanup is the recursive `0x049CCA(old_type, 0)` call, not `0x0499C0` itself.

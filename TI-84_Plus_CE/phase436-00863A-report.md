# Phase 436 Report: `0x00863A` Event Code Preprocessor

## 1. Byte Range

| Property | Value |
|----------|-------|
| Start | `0x00863A` |
| End | `0x00883B` |
| Size | `514` bytes (`0x202`) |
| Next function | `0x00883C` |

This routine is a full IX-frame function with **inline dispatch tables** mixed into the body. It is not straight-line code from `0x00865D` onward; the ranges below are data tables consumed by `_seqcase` helpers:

- `0x00865D-0x00868D`: sparse state table
- `0x008699-0x0086AF`: dense event table for state `0x00`
- `0x0086C3-0x0086CF`: sparse event table for state `0x01`
- `0x0086E3-0x008702`: dense event table for state `0x02`
- `0x008716-0x00873E`: dense event table for state `0x03`
- `0x008752-0x008766`: sparse event table for state `0x10`
- `0x00877A-0x00878D`: dense event table for state `0x11`
- `0x0087A1-0x0087B7`: dense event table for state `0x12`
- `0x0087C9-0x0087E9`: sparse event table for state `0x13`
- `0x008811-0x008829`: sparse event table for state `0x15`

## 2. Disassembly Walkthrough

### Prologue and default result

```asm
0x00863A  LD HL,0xFFFFFF
0x00863E  CALL 0x002197
0x008642  LD (IX-1),0x01
```

`0x002197` is the standard ZDS frame helper. The local byte at `IX-1` is initialized to `1`, which is the routine's default "reject / skip dispatch" result.

### Event-code zero fast path

```asm
0x008646  LD A,(IX+6)
0x008649  OR A
0x00864A  JR NZ,0x008651
0x00864C  XOR A
0x00864D  JP 0x008837
```

If `event_code == 0`, the function returns `A=0` immediately. This is the path used by the recursive `0x00883C(0, old_sub_event)` flush call; zero is always allowed through.

### First-stage dispatch: current state / sub-event

```asm
0x008651  LD A,(0xD177B9)
0x008655  OR A
0x008656  SBC HL,HL
0x008658  LD L,A
0x008659  CALL 0x00211B
```

The routine **does not read `IX+9`**. Instead it reads the already-current global sub-event from `D177B9`, zero-extends it into `HL`, and uses sparse `_seqcase` helper `0x00211B` to choose a per-state validator.

Top-level state table:

| `D177B9` | Target | Meaning |
|---------:|--------|---------|
| `0x00` | `0x00868E` | validate `0x01-0x05` |
| `0x01` | `0x0086B8` | validate `{0x20,0x21}` |
| `0x02` | `0x0086D8` | validate `0x40-0x47` |
| `0x03` | `0x00870B` | validate `0x06-0x10` |
| `0x04` | `0x008834` | reject all nonzero codes |
| `0x10` | `0x008747` | validate `{0x80,0x81,0x82,0xFF}` |
| `0x11` | `0x00876F` | validate `0x83-0x86` |
| `0x12` | `0x008796` | validate `0xC0-0xC4` |
| `0x13` | `0x0087BE` | validate `{0x08,0x96-0x9B}` |
| `0x14` | `0x0087F0` | validate `{0x8D}` |
| `0x15` | `0x008806` | validate `{0x8C,0x8E-0x91}` |
| default | `0x008830` | reject |

### Representative per-state validators

All validators reload `event_code` from `IX+6`, build `HL = event_code`, then either call dense `_seqcase` helper `0x002623`, sparse helper `0x00211B`, or do one direct compare.

State `0x00`:

```asm
0x00868E  LD A,(IX+6)
0x008695  CALL 0x002623
```

Dense table at `0x008699`: base `0x01`, count `5`, so accepted codes are `0x01-0x05`.

State `0x02`:

```asm
0x0086D8  LD A,(IX+6)
0x0086DF  CALL 0x002623
```

Dense table at `0x0086E3`: base `0x40`, count `8`, so accepted codes are `0x40-0x47`.

State `0x10`:

```asm
0x008747  LD A,(IX+6)
0x00874E  CALL 0x00211B
```

Sparse table at `0x008752`: accepted codes are `0x80`, `0x81`, `0x82`, `0xFF`.

State `0x14` is the only special-case compare instead of a table:

```asm
0x0087F0  LD A,(IX+6)
0x0087F7  OR A
0x0087F8  LD BC,0x00008D
0x0087FC  SBC HL,BC
0x0087FE  JR NZ,0x008834
0x008800  LD (IX-1),0x00
```

So state `0x14` accepts only `event_code == 0x8D`.

### Accept / reject stubs and epilogue

Accept handlers all collapse to:

```asm
LD (IX-1),0x00
JP/JR 0x008834
```

Reject path:

```asm
0x008830  LD (IX-1),0x01
```

Shared epilogue:

```asm
0x008834  LD A,(IX-1)
0x008837  LD SP,IX
0x008839  POP IX
0x00883B  RET
```

## 3. What It Preprocesses

`0x00863A` is **not** a transformer for `event_code`; it is a **state-aware validator/gate**.

What it does:

1. Reads the incoming `event_code` from `IX+6`
2. Reads the current committed sub-event/state from `D177B9`
3. Chooses the allowed event-code family for that state
4. Returns `0` if the code belongs to that family, else returns `1`

What it does **not** do:

- does not rewrite `event_code`
- does not store to `D177B8`
- does not write `D177B9`
- does not inspect `IX+9`

So the preprocessing is: **"is this `event_code` valid for the current sub-event bucket?"**

In the `0x00883C` flow, that means:

- if the state transition has already committed `D177B9 = requested_sub_event`, then `0x00863A` validates that the incoming `event_code` matches that sub-event family
- if it returns nonzero, `0x00883C` skips its normal `D177B8 = event_code` store and returns early

## 4. Return Semantics

`0x00863A` returns only two observable values here:

| Return in `A` | Meaning inside `0x00883C` | Condition |
|--------------:|----------------------------|-----------|
| `0` | proceed | `event_code == 0`, or `event_code` matches the allowed set for current `D177B9` |
| `1` | skip dispatch | unlisted `D177B9`, state `0x04`, or `event_code` not in that state's allowed set |

There is no `0x02` path in this function.

Equivalent high-level logic:

```c
if (event_code == 0) return 0;
switch (D177B9) {
  case 0x00: return in_range(event_code, 0x01, 0x05) ? 0 : 1;
  case 0x01: return (event_code == 0x20 || event_code == 0x21) ? 0 : 1;
  case 0x02: return in_range(event_code, 0x40, 0x47) ? 0 : 1;
  case 0x03: return in_range(event_code, 0x06, 0x10) ? 0 : 1;
  case 0x04: return 1;
  case 0x10: return in_set(event_code, {0x80,0x81,0x82,0xFF}) ? 0 : 1;
  case 0x11: return in_range(event_code, 0x83, 0x86) ? 0 : 1;
  case 0x12: return in_range(event_code, 0xC0, 0xC4) ? 0 : 1;
  case 0x13: return in_set(event_code, {0x08,0x96,0x97,0x98,0x99,0x9A,0x9B}) ? 0 : 1;
  case 0x14: return event_code == 0x8D ? 0 : 1;
  case 0x15: return in_set(event_code, {0x8C,0x8E,0x8F,0x90,0x91}) ? 0 : 1;
  default:   return 1;
}
```

## 5. Inputs / Outputs

### Reads

| Source | Use |
|--------|-----|
| `IX+6` | incoming `event_code` |
| `D177B9` | current committed sub-event/state |
| `IX-1` | local return byte during epilogue |

### Writes

| Destination | Use |
|-------------|-----|
| `IX-1` | local return byte (`1` by default, `0` on accepted code) |

### Register behavior

| Register | Role |
|----------|------|
| `A` | carries `event_code`, `D177B9`, and final return value |
| `HL` | zero-extended selector for `_seqcase` calls |
| `BC` | compare scratch for state `0x14` |
| `IX` | frame pointer |

Notably absent:

- no writes to `D177B8`
- no writes to `D177B9`
- no port I/O
- no hardware-facing helper calls

## 6. Cross-References

### Callers

- Direct literal caller: `0x008891` inside `0x00883C`
- Upstream path for the USB work from phase 434: `0x00FBD1 -> 0x00883C -> 0x00863A`
- Parallel flash-ROM mirror: `0x049A23` is the sibling of `0x00863A`, called from `0x049D1F` inside `0x049CCA`

### Callees

| Target | Count | Role |
|--------|------:|------|
| `0x002197` | 1 | IX-frame setup helper |
| `0x00211B` | 5 | sparse `_seqcase` dispatcher |
| `0x002623` | 5 | dense `_seqcase` dispatcher |

## 7. Relationship to Known Event Codes

Yes. The function explicitly covers every event code already seen in the `0x00FBD1` USB path:

| Known code | Where it is recognized |
|-----------:|------------------------|
| `0x01` | state `0x00` table (`0x01-0x05`) |
| `0x06` | state `0x03` table (`0x06-0x10`) |
| `0x44` | state `0x02` table (`0x40-0x47`) |
| `0x45` | state `0x02` table (`0x40-0x47`) |
| `0x80` | state `0x10` sparse set |
| `0x81` | state `0x10` sparse set |
| `0x84` | state `0x11` table (`0x83-0x86`) |
| `0xC3` | state `0x12` table (`0xC0-0xC4`) |

This matches the recovered USB `(event_code, sub_event)` pairs perfectly:

| Pair from `0x00FBD1` | Validation rule in `0x00863A` |
|----------------------|--------------------------------|
| `(0x01, 0x00)` | state `0x00` accepts `0x01-0x05` |
| `(0x44, 0x02)` | state `0x02` accepts `0x40-0x47` |
| `(0x45, 0x02)` | state `0x02` accepts `0x40-0x47` |
| `(0x06, 0x03)` | state `0x03` accepts `0x06-0x10` |
| `(0x80, 0x10)` | state `0x10` accepts `0x80/0x81/0x82/0xFF` |
| `(0x81, 0x10)` | state `0x10` accepts `0x80/0x81/0x82/0xFF` |
| `(0x84, 0x11)` | state `0x11` accepts `0x83-0x86` |
| `(0xC3, 0x12)` | state `0x12` accepts `0xC0-0xC4` |

So the routine's job is not to translate those USB event codes. Its job is to **ensure each code belongs to the event-family expected by the current sub-event/state** before `0x00883C` continues with its normal dispatch/store path.

## Conclusion

`0x00863A` is the **event-code family gate** in front of `0x00883C`'s real state-machine dispatch.

- Input: `event_code` in `IX+6`
- State key: current `D177B9`
- Behavior: validate `event_code` against the allowed family for that state
- Return `0`: allow normal dispatch
- Return `1`: skip dispatch immediately

It does **not** modify the event code. It only decides whether the `(event_code, sub_event)` combination is internally consistent.

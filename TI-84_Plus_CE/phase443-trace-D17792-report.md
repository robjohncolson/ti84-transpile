# Phase 443 - Trace D17792 Report

## Verdict

- `D17792` is a **24-bit staged argument slot** in the USB/link notification pipeline.
- It is **not** a fixed hardware timer register.
- There are **15** literal `D17792` hits in the 4 MB ROM: **6 writes** and **9 reads**.
- There are **0** literal `D17793` hits and **0** literal `D17794` hits.
- Even without separate `D17793`/`D17794` literals, every `LD BC,(D17792)`, `LD HL,(D17792)`, and `LD (D17792),BC` access is ADL-width, so the live object is the full **3-byte word `D17792..D17794`**.

The important consequence is that `D17792` behaves like an **opaque per-transfer callback/notification argument**. Different writers load it with different kinds of 24-bit values:

- a size-derived timeout-like scalar
- a direct caller-supplied tick/count argument
- a pointer-derived `base + 0x57` value
- `0` during reset/teardown

## Raw Reference Summary

| Site | Access | Function | Meaning |
| --- | --- | --- | --- |
| `0x00B8F7` | write | `0x00B8BC` | copies caller arg `(IX+6)` into `D17792` |
| `0x011060` | write | `0x011017` | writes computed size-derived value |
| `0x0115B4` | read | `0x011576` | null-checks `D17792`; recomputes if zero |
| `0x011633` | read | `0x011576` | compares `D17792` against `D176CB` |
| `0x011657` | read | `0x011576` | selects `D17792` as the `0x0155BC` argument when it wins the compare |
| `0x011A6D` | write | `0x011A4D` | writes `LEA BC,IY+0x57` into `D17792` |
| `0x011FA3` | read | `0x011F20` | `D14073`-gated call into `0x0155BC` |
| `0x012021` | read | same helper family | same `D14073`-gated `0x0155BC` pattern |
| `0x0122C1` | read | `0x0121F3` | same `D14073`-gated `0x0155BC` pattern |
| `0x013773` | read | `0x013700` | `D1407A` consume path A -> `0x0155BC` |
| `0x013877` | read | `0x0137E9` | `D1407A` consume path B -> `0x0155BC` |
| `0x0156C2` | read | `0x01567C` | pushes `D17792` into `0x0151FE` |
| `0x049724` | write | `0x049701` | clears `D17792` to `0` during reset/setup |
| `0x04E0B6` | write | `0x04E07B` | mirror of `0x00B8BC` writer |
| `0x06A5E0` | write | `0x06A5C0` | mirror of `0x011A4D` writer |

## Value Characterization

### 1. Size-derived scalar writer: `0x011017 -> 0x011060`

`0x011017` is the most informative writer.

Observed sequence:

```text
0x01102D  LD HL,(0xD1778F)
0x01103F  LD HL,(IX-6)          ; effective size, default-capped at 0x03FF
0x011042  ADD HL,HL
0x011043  ADD HL,HL
0x011044  ADD HL,HL             ; size * 8
0x011045  LD BC,0x0003E8
0x011049  CALL 0x00224C         ; _imulu / _imuls
0x01104D  LD BC,0x016E36
0x011051  CALL 0x002207         ; _idivu
0x011055  LD BC,0x000BB8
0x011059  ADD HL,BC
0x01105D  LD BC,(IX-3)
0x011060  LD (0xD17792),BC
```

Using the existing phase-435 OS API naming:

- `0x00224C` = `_imulu` / `_imuls`
- `0x002207` = `_idivu`

So this writer computes:

```text
D17792 = 0x0BB8 + ((effective_size * 8 * 1000) / 0x016E36)
       = 3000 + ((effective_size * 8000) / 93750)
```

With `effective_size <= 0x03FF`, that yields roughly:

- minimum near `3000`
- maximum near `3087`

This looks like a **base 3-second delay/timeout plus a small transfer-size-derived slack term**.

### 2. Direct caller-argument writer: `0x00B8BC` and `0x04E07B`

`0x00B8BC` writes `(IX+6)` directly to both `D17792` and `D176CB` after zeroing three USB/link state blocks:

```text
0x00B8F4  LD BC,(IX+0x06)
0x00B8F7  LD (0xD17792),BC
0x00B8FC  LD BC,(IX+0x06)
0x00B8FF  LD (0xD176CB),BC
```

Known caller values from prior traces:

- event-`0x47` path uses `0x000BB8` (`3000`)
- link/peripheral mirror path calls `0x04E07B` with `0x0007D0` (`2000`) in at least one traced case

This is not pointer math; it is a **straight staged 24-bit argument copy**.

### 3. Pointer-derived writer: `0x011A4D` and `0x06A5C0`

These two mirrored writers do something different:

```text
0x011A60  LD (0xD176CB),BC
0x011A65  LD IY,(0xD176CB)
0x011A6A  LEA BC,IY+87
0x011A6D  LD (0xD17792),BC
```

So here:

```text
D17792 = D176CB + 0x57
```

That is explicitly **pointer-like / offset-like**, not timer-like.

Because these functions also touch the display-region-heavy `D1771A` area, this looks like "base pointer plus fixed structure offset" staging.

### 4. Reset writer: `0x049701`

This helper zeroes `D17792` and `D1778F` together:

```text
0x049720  LD BC,0x000000
0x049724  LD (0xD17792),BC
0x049729  LD (0xD1778F),BC
```

That is teardown/reset behavior, not a live payload producer.

## Read-side Behavior

### `0x01567C` consumes `D17792` as the entry-167 argument

Session 412/413 already established the key read:

```text
0x0156C2  LD BC,(0xD17792)
0x0156C7  PUSH BC
0x0156C8  CALL 0x0151FE
```

`0x0151FE` then copies the caller-supplied 24-bit argument into `D17773`.

So for the `0x01567C` path:

```text
D17792 -> pushed arg -> 0x0151FE -> D17773
```

### `0x011576` validates and may recompute `D17792`

`0x011576` first ensures the staging state exists:

```text
0x0115B4  LD HL,(0xD17792)
0x0115B8  CALL 0x0021C2
0x0115BC  JR Z,0x0115C8
0x0115BE  LD HL,(0xD1778F)
0x0115C2  CALL 0x0021C2
0x0115C6  JR NZ,0x0115CC
0x0115C8  CALL 0x011017
```

Meaning:

- if `D17792 == 0`, recompute it
- if `D1778F == 0`, also recompute it

Later the same function compares `D17792` against `D176CB`, then passes **the larger of the two** into `0x0155BC`:

```text
0x01162E  LD BC,(0xD176CB)
0x011633  LD HL,(0xD17792)
0x011637  OR A
0x011638  SBC HL,BC
...
0x01164D  LD BC,(0xD176CB)   ; if D176CB wins
...
0x011657  LD BC,(0xD17792)   ; if D17792 wins
0x011669  CALL 0x0155BC
```

So `D17792` is not just stored and forgotten. It participates in **selection logic** before the wrapper call.

### Multiple worker families pass `D17792` into `0x0155BC`

The same "load `D17792`, push, call `0x0155BC`" pattern appears at:

- `0x011FA3`
- `0x012021`
- `0x0122C1`
- `0x013773`
- `0x013877`

The important gates around those reads are:

- `D14073` in the `0x011F20` / `0x0121F3` families
- `D1407A` in the `0x013700` / `0x0137E9` consume paths

That makes `D17792` a **shared argument slot reused by several wrapper-entry paths**, not a single-purpose local variable.

## Co-access Map

### D177xx neighbors

Most common same-function companions:

- `D176CB` - paired staged-argument slot; compared against `D17792` in `0x011576`
- `D1778F` - size/length input to `0x011017`
- `D1778B`, `D17783`, `D1776D` - inputs to `0x0155BC`
- `D1776A`, `D1777B` - inputs to `0x01567C`
- `D17773` - downstream destination after `0x0151FE`
- `D17795` - protocol state; promoted to READY around the `D17792` checks
- `D17787`, `D1778A`, `D1778E`, `D1777F`, `D17782`, `D1777B`, `D1777E` - scrubbed in the READY transition after the `D17792` validation

### D140xx neighbors

Most important same-function `D140xx` gates:

- `D14073` - branch gate for several `D17792 -> 0x0155BC` reads
- `D1407A` - deferred-dispatch pending flag consumed at `0x013767` / `0x01386B`
- `D14032` - incremented in the `0x01567C` post-delivery follow-up
- `D14046`, `D14074` - reset helper `0x049701`

## Who Writes D17792?

Six distinct writer sites exist, but they collapse into four behavioral groups:

| Writer | Function | Value source | Condition |
| --- | --- | --- | --- |
| `0x00B8F7` | `0x00B8BC` | direct `(IX+6)` | event-`0x47` recovery/setup path |
| `0x011060` | `0x011017` | computed scalar | when `D17792` or `D1778F` is missing / needs refresh |
| `0x011A6D` | `0x011A4D` | `D176CB + 0x57` | display/status-style path |
| `0x049724` | `0x049701` | `0` | reset/teardown |
| `0x04E0B6` | `0x04E07B` | direct `(IX+6)` | link/peripheral mirror of `0x00B8BC` |
| `0x06A5E0` | `0x06A5C0` | `D176CB + 0x57` | link/peripheral mirror of `0x011A4D` |

So the correct high-level model is:

> `D17792` is a shared 24-bit "argument slot" whose concrete value depends on which producer armed the current USB/link callback path.

## What Does `0x0155BC` Do?

`0x0155BC` is the **entry-166 sibling** of `0x01567C`.

It is another notification-delivery wrapper that:

1. builds the shared descriptor block at `D143E7..D14402`
2. uses `D1776D + D1778B` as the payload pointer (`D143ED`)
3. copies its caller-supplied argument `(IX+6)` into `D143F6`
4. copies `D17783` into `D143FC`
5. sets type/state byte `D143FF = 1`
6. installs callback pointers `0x00FB6E` and `0x011F1C`
7. stages another argument through `0x0151FE`
8. calls the real delivery handler `0x00F5B0`

### First ~80 bytes of `0x0155BC`

```text
0x0155BC  CD 8A 21 00       CALL 0x00218A
0x0155C0  ED 4B 8B 77 D1    LD BC,(0xD1778B)
0x0155C5  2A 6D 77 D1       LD HL,(0xD1776D)
0x0155C9  09                ADD HL,BC
0x0155CA  22 ED 43 D1       LD (0xD143ED),HL
0x0155CE  DD 07 06          LD BC,(IX+0x06)
0x0155D1  ED 43 F6 43 D1    LD (0xD143F6),BC
0x0155D6  01 00 00 00       LD BC,0x000000
0x0155DA  ED 43 F9 43 D1    LD (0xD143F9),BC
0x0155DF  ED 4B 83 77 D1    LD BC,(0xD17783)
0x0155E4  ED 43 FC 43 D1    LD (0xD143FC),BC
0x0155E9  3E 01             LD A,0x01
0x0155EB  32 FF 43 D1       LD (0xD143FF),A
0x0155EF  01 00 00 00       LD BC,0x000000
0x0155F3  ED 43 02 44 D1    LD (0xD14402),BC
0x0155F8  01 6E FB 00       LD BC,0x00FB6E
0x0155FC  ED 43 E7 43 D1    LD (0xD143E7),BC
0x015601  01 1C 1F 01       LD BC,0x011F1C
0x015605  ED 43 EA 43 D1    LD (0xD143EA),BC
0x01560A  DD 31 06          LEA IX,IX+0x06
0x01560D  ED 03 0A          LEA BC,IY+0x0A
0x015610  C5                PUSH BC
0x015611  CD FE 51 01       CALL 0x0151FE
```

That matches the broader interpretation from session 413:

- `0x01567C` uses `D17792` as the argument source
- `0x0155BC` uses a caller-supplied pointer/value (`IY+0x0A`) as the argument source
- both wrappers feed the same delivery machinery

## Bottom Line

`D17792` is best named conceptually as something like:

- `usb_link_staged_arg`
- `notification_arg_slot`
- `callback_param_24`

What it is **not**:

- not a 1-byte enum
- not a fixed 2-byte counter
- not a dedicated timer MMIO shadow

What it **is**:

- a 24-bit staged argument word consumed by `0x01567C` and several `0x0155BC`-feeding worker paths
- loaded with producer-specific values that can be scalar, pointer-derived, or zero

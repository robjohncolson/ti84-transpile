# Phase 408 Notification Cascade Report

## Scope
- ROM page: `0x012000..0x012FFF`
- Target RAM byte: `0xD177B8` (notification payload)
- Decoder mode: eZ80 ADL

## Scan Result
- Validated payload reads in this page: **15**
- Validated `LD HL,0xD177B8` loads in this page: **0**
- One raw prefix-shaped false positive appears at `0x012069` (`40 3A B8 77 D1`), but decoding there yields `SIS LD A,(0x77B8)` across the previous `JR` displacement. It is **not** a real `D177B8` read.

Validated readers:

`0x01204A, 0x012052, 0x01205A, 0x012062, 0x01206A, 0x012072, 0x01207A, 0x012082, 0x01208A, 0x012092, 0x012141, 0x012180, 0x01219A, 0x012D2E, 0x012D78`

## Main Finding
Page `0x012xxx` is **not** another copy of the session-407 type-`0x11` Stat/List or type-`0x03` Window/Format payload-index readers.

Instead, it contains:

1. A **10-way payload gate** at `0x01204A` that funnels many payload values into one common USB/link-side handler at `0x0120AA`.
2. A smaller decision tree at `0x012141/0x012180/0x01219A` that uses payload `0x01` or `0xFF` as a guard before calling `dispatch_key(0x00883C)` with hardcoded `(key,state)` pairs.
3. Two late `0xFF` special-case tests at `0x012D2E` and `0x012D78` inside a USB/FIFO-style port-manipulation block.

The surrounding helpers line up with prior work:

- `0x006EAF` is `usb_BusPowered` from phase 312.
- `0x01322D` is the null-checked callback wrapper for slot `0xD14026` from phase 314.
- Port families `0x003010`, `0x003080`, `0x003100`, and `0x003144` match the USB endpoint/FIFO helper neighborhood from phase 310.
- `0xD14026` itself was already classified as a USB/runtime event sink in phase 313.

## 1. Long CP Cascade at `0x01204A`

This is the page-`0x012xxx` “long CP cascade” from the session note.

| Compare site | Payload value | Match branch |
| --- | --- | --- |
| `0x01204E` | `0x0B` | `JR Z, 0x0120AA` |
| `0x012056` | `0x0D` | `JR Z, 0x0120AA` |
| `0x01205E` | `0x99` | `JR Z, 0x0120AA` |
| `0x012066` | `0x9A` | `JR Z, 0x0120AA` |
| `0x01206E` | `0x9B` | `JR Z, 0x0120AA` |
| `0x012076` | `0x01` | `JR Z, 0x0120AA` |
| `0x01207E` | `0x98` | `JR Z, 0x0120AA` |
| `0x012086` | `0x96` | `JR Z, 0x0120AA` |
| `0x01208E` | `0x97` | `JR Z, 0x0120AA` |
| `0x012096` | `0xFF` | `JR Z, 0x0120AA` |

So the payload set is exactly:

`{ 0x01, 0x0B, 0x0D, 0x96, 0x97, 0x98, 0x99, 0x9A, 0x9B, 0xFF }`

Every one of those values jumps to the **same** handler, `0x0120AA`.

### What `0x0120AA` does

`0x0120AA` first runs a compare/helper prelude (`CALL 0x00238F`, `CALL 0x0023AD`) against RAM at `0xD1778E` and `0xD1778B`. If that pre-check fails, it falls back to:

- `BC = 1`
- `CALL 0x0136BF`
- `RET`

If the pre-check passes, the handler reads `(IY+4)` and dispatches through the dense `_seqcase` helper at `0x002623`. The inline table at `0x0120E1` is:

| Selector (`IY+4`) | Target | Observed effect |
| --- | --- | --- |
| `0x01` | `0x0120F8` -> `CALL 0x013250` | USB/link worker path A |
| `0x02` | `0x012100` -> `CALL 0x013377` | USB/link worker path B |
| `0x03` | `0x012108` | `D17795 = 4`, then `CALL 0x01340F` |
| `0x04` | `0x012116` | `D17795 = 5`, then `CALL 0x01340F` |
| `0x05` | `0x012124` -> `CALL 0x0135CF` | extended worker path C |
| default | `0x01212C` | `CALL 0x0136BF` with `BC = 1` |

The important point is that the payload value itself does **not** select ten different handlers. Those ten payloads are all aliases for the same second-level USB/link dispatcher, and `(IY+4)` decides which worker actually runs.

## 2. Decision Tree at `0x012141 / 0x012180 / 0x01219A`

This is a separate function with three payload reads.

### `0x012141`

| Compare | Match branch | Meaning |
| --- | --- | --- |
| `CP 0x01` | `JR Z, 0x0121B2` | payload `0x01` skips straight to the shared tail |

If payload is **not** `0x01`, the code checks `D176FC` and `usb_BusPowered()` (`0x006EAF`) and then dispatches one of two hardcoded screen transitions:

- `dispatch_key(0x08, 0x03)` via `CALL 0x00883C`
- or `dispatch_key(0x10, 0x03)` via `CALL 0x00883C`, then clears `D14074`

Because `dispatch_key(key,state)` uses `IX+6 = key` and `IX+9 = state` (phase 321), these two calls mean:

- target state `0x03` = **Window/Format**
- key/payload re-issued as `0x08` or `0x10`

### `0x012180`

| Compare | Match branch | Not-taken path |
| --- | --- | --- |
| `CP 0x01` | `JR Z, 0x0121B2` | `dispatch_key(0x08, 0x03)` then shared tail |

So payload `0x01` is the “do not recurse / just tail out” token here; every other payload causes a low-ROM `dispatch_key` into state `0x03`.

### `0x01219A`

| Compare | Match branch | Not-taken path |
| --- | --- | --- |
| `CP 0xFF` | `JR Z, 0x0121B2` | `dispatch_key(0x08, 0x13)` then shared tail |

Here payload `0xFF` is the “skip dispatch” token. Non-`0xFF` values push the pair `(state=0x13, key=0x08)`, so the routine asks `dispatch_key` to enter state `0x13` (**Graph Active** in prior mapping).

### Shared tail at `0x0121B2`

All three of the branches above converge at `0x0121B2`. That tail:

- reads `D17796`
- chooses callback mask `0x00CCCC` or `0x000003`
- calls `0x0150C2`
- returns

`0x0150C2` sits in the same link/USB crash/receive neighborhood identified in prior phases.

## 3. Late `0xFF` Tests at `0x012D2E` and `0x012D78`

These are inside the USB/FIFO-style port block, not inside the UI dispatch block.

### `0x012D2E`

| Compare | Match branch | Not-taken path |
| --- | --- | --- |
| `CP 0xFF` | `JR Z, 0x012D6A` | `CALL 0x012370`, then continue to `0x012D6A` |

So payload `0xFF` skips the preamble `CALL 0x012370`; every other payload runs it first. Both paths then converge on:

- `CALL 0x012C48`
- `CALL 0x01322D` with callback/event mask `0x40`

### `0x012D78`

| Compare | Match branch | Meaning |
| --- | --- | --- |
| `CP 0xFF` | `JP NZ, 0x012E48` | non-`0xFF` returns immediately |

Only payload `0xFF` continues. That continuation clears bits on port `0x003010` (`RES 5`, `RES 4`, `RES 0`), then pushes `0` and calls `0x0123AD` before returning. In other words, this is a **payload-`0xFF` cleanup/reset path**.

## Cross-Reference Against Known Notification Families

Session 407 gave three known families:

- type `0x11` Stat/List -> payloads `0x83..0x86`
- type `0x03` Window/Format -> payloads `0x06..0x11`
- type `0x00` generic switch -> payloads `0x01..0x05`

Page `0x012xxx` does **not** look like another reader for those families:

- there are **no `D177B9` reads** in this page
- the long cascade keys are mostly `0x96..0x9B`, `0x0B`, `0x0D`, and `0xFF`
- only `0x01` overlaps the generic switch range
- two of the singleton readers use the payload byte only as a guard before re-issuing fresh `(key,state)` pairs through `dispatch_key`

So the best fit is:

- the long cascade is a **USB/link subsystem payload alias gate**
- `0x012141/0x012180/0x01219A` are **payload-guarded state-transition helpers**
- `0x012D2E/0x012D78` are **payload-`0xFF` special cases in USB/FIFO control flow**

## Bottom Line

- The “page `0x012xxx` long CP cascade” is real and spans **10 payload values**.
- All 10 matched values branch to **one** handler at `0x0120AA`.
- That handler is a **second-level USB/link dispatcher**, not ten independent payload handlers.
- The later `0x012141/0x012180/0x01219A` reads use payload `0x01` or `0xFF` as sentinels around hardcoded `dispatch_key()` calls into states `0x03` and `0x13`.
- The `0x012D2E/0x012D78` reads treat `0xFF` as a special cleanup/reset token in a USB/FIFO register sequence.

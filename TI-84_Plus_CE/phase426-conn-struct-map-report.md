# Phase 426 - Connection Struct Map

## Summary

The cleanest reconciliation of the session-421/422/409/410/412 evidence is that each `D13FED` entry points to a 28-byte notification/connection descriptor with one extra 24-bit tail slot starting at `+27`.

Three new characterizations are solid from the initializer wrappers plus the handler cluster:

- `+3..+5` is a **secondary callback slot**. `0x01567C` writes `0x0121EF` there, and `0x00FB6E` reads `IY+3` and dispatches it.
- `+6..+8` is a **payload/work pointer**, with **bit 7 of byte `+8` reused as the busy/in-use flag**. This reconciles the earlier “`+8` busy flag” observation with the wrapper writes to `D143ED`.
- `+24..+27` is a **state/mode quartet**: `+24` type byte, `+25` mode byte, `+26` low data/status byte, `+27` high/status byte. `0x00E4E8` consumes it as a small field block, while the dispatcher also writes staged state codes into the 24-bit slot rooted at `+27`.

`0x00DA8C` does not directly touch any `D13FED`-provenance `IY+N` fields. `0x00ED77` and `0x00FE10` only use a subset of the descriptor. `0x00E4E8` is the main consumer of the `+24..+27` tail.

## Per-Byte Map

| Off | Type | Reads | Writes | Notes |
| --- | --- | --- | --- | --- |
| `+0` | callback slot 0 byte 0 | `0x00FEAB`, `0x00F56B`, `0x00F84F`, `0x00F91F`, `0x00F9E3`, `0x00FB5A` | `0x02B373` clears, `0x01567C` writes `0x00FB6E` | Primary callback pointer, dispatched through `CALL 0x002288`. |
| `+1` | callback slot 0 byte 1 | same 24-bit reads as `+0` | same 24-bit writes as `+0` | Middle byte of callback slot 0. |
| `+2` | callback slot 0 byte 2 | same 24-bit reads as `+0` | same 24-bit writes as `+0` | High byte of callback slot 0. |
| `+3` | callback slot 1 byte 0 | `0x00F4CB`, `0x00FB9A`, `0x00FBA6` | `0x02B373` clears, `0x01567C` writes `0x0121EF` | Secondary/result callback slot. `0x00FB6E` reads it before calling `0x015542` + `0x002288`. |
| `+4` | callback slot 1 byte 1 | same 24-bit reads as `+3` | same 24-bit writes as `+3` | Middle byte of callback slot 1. |
| `+5` | callback slot 1 byte 2 | same 24-bit reads as `+3` | same 24-bit writes as `+3` | High byte of callback slot 1. |
| `+6` | payload/work pointer byte 0 | `0x00F5D3`, `0x00F97A`, `0x00FAC7` | `0x02B373` writes `0xD141B3`, `0x01567C` writes `*(D1776A)` | Low byte of the descriptor payload/work pointer. |
| `+7` | payload/work pointer byte 1 | same 24-bit reads as `+6` | same 24-bit writes as `+6` | Middle byte of the payload/work pointer. |
| `+8` | payload/work pointer byte 2, `bit7 = busy` | `0x00EDBF`, `0x00FEC8`, `0x00FEF7` | `0x00FEA5`, `0x00FEFC`, `0x00FF2E` clear bit 7; wrappers write the pointer high byte | This is the important overlap: the top byte of the `+6` pointer also carries the in-use/busy flag in bit 7. |
| `+9` | primary context pointer byte 0 | `0x00EDB3`, `0x00FE6C` | `0x00EC3A` | Low byte of the live-session/context pointer matched against `D14014` / `D141E2`. |
| `+10` | primary context pointer byte 1 | same 24-bit reads as `+9` | same 24-bit writes as `+9` | Middle byte of the primary context pointer. |
| `+11` | primary context pointer byte 2 | same 24-bit reads as `+9` | same 24-bit writes as `+9` | High byte of the primary context pointer. |
| `+12` | secondary working pointer byte 0 | `0x00FE75` | `0x00EC62` | Low byte of the secondary/helper pointer cached by `0x00FE10`. |
| `+13` | secondary working pointer byte 1 | same 24-bit reads as `+12` | same 24-bit writes as `+12` | Middle byte of the secondary working pointer. |
| `+14` | secondary working pointer byte 2 | same 24-bit reads as `+12` | same 24-bit writes as `+12` | High byte of the secondary working pointer. |
| `+15` | delivery/control word byte 0 | `0x00F57C`, `0x00F687`, `0x00F7D4`, `0x00F8E5` | `0x02B373` writes `0x000004`, `0x01567C` writes `0x0003E8` | Passed through `D14410` into `0x014E3F`; best fit is a delivery parameter/timeout/control word. |
| `+16` | delivery/control word byte 1 | same 24-bit reads as `+15` | same 24-bit writes as `+15` | Middle byte of the control word. |
| `+17` | delivery/control word byte 2 | same 24-bit reads as `+15` | same 24-bit writes as `+15` | High byte of the control word. |
| `+18` | range/current word byte 0 | `0x00F522`, `0x00F89D`, `0x00F8AA`, `0x00F8BE`, `0x00FBA9` | `0x00F95F`, `0x00FA9B`, `0x010018`, wrappers clear it to `0` | Low byte of a current/progress/start word. `0x00F890` compares it against `+21`. |
| `+19` | range/current word byte 1 | same 24-bit reads as `+18` | same 24-bit writes as `+18` | Middle byte of the range/current word. |
| `+20` | range/current word byte 2 | same 24-bit reads as `+18` | same 24-bit writes as `+18` | High byte of the range/current word. |
| `+21` | range/limit word byte 0 | `0x00F51F`, `0x00F712`, `0x00F89A`, `0x00F965`, `0x00FAA1`, `0x01002B` | `0x02B373` writes `0x000008`, `0x01567C` writes `*(D1777B)` | Low byte of the companion limit/goal/aux word. |
| `+22` | range/limit word byte 1 | same 24-bit reads as `+21` | same 24-bit writes as `+21` | Middle byte of the range/limit word. |
| `+23` | range/limit word byte 2 | same 24-bit reads as `+21` | same 24-bit writes as `+21` | High byte of the range/limit word. |
| `+24` | type/tag byte | `0x00F5E8`, `0x00E549` | `0x02B373` writes `0x02`, `0x01567C` writes `0x00`, `0x00E552` clears it | Notification/descriptor type. `0x00F5B0` uses it as the jump-table selector. |
| `+25` | mode/subtype byte | `0x00E529`, `0x00F934`, `0x00F981`, `0x00FACE` | `0x00F639=0x04`, `0x00F786=0x01`, `0x00F94B=0x02`, `0x00FA22=0x02` | Small mode byte. `0x00E4E8` only inspects its low 2 bits. |
| `+26` | low data/status byte | `0x00E503`, `0x00F52D` | `0x00F5E1=0x00`, `0x00F511=0x01` | Low byte of the `0x00E4E8` field word; also used as a simple status byte in the delivery handlers. |
| `+27` | high data/status byte, plus 24-bit staged-state root | `0x00E4F3`, `0x00FB3B`, `0x00FB82`, `0x00FBAD` | `0x00F62C=0`, `0x00F6D0=3`, `0x00F83D=3`, `0x00F90D=3`, `0x01000B=0`, `0x01004C=7`, wrappers clear it | Low 7 bits feed `fieldWord = ((IY+27 & 0x7F) << 8) \| IY+26`. The dispatcher also writes 24-bit state codes rooted here, so `+27` is the low byte of the staged disposition slot and the high data byte of the `0x00E4E8` field block. |

## Groupings

- `+0..+5`: dual callback vector block.
  - `+0..+2` is the primary callback.
  - `+3..+5` is the completion/result callback.
- `+6..+14`: pointer/control block.
  - `+6..+8` is the payload/work pointer, with `+8.bit7` overloaded as the busy flag.
  - `+9..+11` is the primary live-session pointer.
  - `+12..+14` is a secondary helper pointer.
- `+15..+23`: numeric control block.
  - `+15..+17` is a control/timeout/delivery word.
  - `+18..+20` is the current/progress/start word.
  - `+21..+23` is the limit/goal/aux word.
- `+24..+27`: mode/state quartet.
  - `+24` selects the handler family.
  - `+25` selects the mode/subtype.
  - `+26/+27` form the `0x00E4E8` field word.
  - `+27` also doubles as the staged disposition byte when the code writes a 24-bit value rooted at `+27`.

## Known Caller Cross-Reference

- `0x00ED77` (`link_handshake`) only reads `+9..+11` and `+8.bit7`.
- `0x00FE10` (`link_transfer_engine`) reads `+0..+2`, `+8`, `+9..+14`, `+18..+23`; it writes `+8`, `+18..+20`, and the 24-bit state slot rooted at `+27`.
- `0x00E4E8` (`header_field_extractor`) is the direct consumer of `+24..+27`; it also clears `+24`.
- `0x00E583` (`sibling_list_walker`) does not show direct `D13FED`-provenance field traffic in its own body; it reaches the tail quartet through its `CALL 0x00E4E8`.
- `0x00DA8C` (`link_state_toggle`) contributes no direct `IY+0..+31` accesses on this descriptor family.

## Beyond `+27`

The struct is larger than a strict 28-byte object in one specific sense: the code repeatedly uses **24-bit** loads/stores rooted at `+27`:

- `LD (IY+27),HL` at `0x00F62C`, `0x00FA11`
- `LD (IY+27),BC` at `0x00F6D0`, `0x00F83D`, `0x00F90D`, `0x00FB35`, `0x01000B`, `0x01004C`
- `LD HL,(IY+27)` at `0x00FB3B`
- `LD BC,(IY+27)` at `0x00FB82`, `0x00FBAD`

So bytes `+28` and `+29` are definitely live. In all observed writers they are zero-filled because the stored values are `0`, `3`, `5`, or `7`, but they are still part of the accessed object. I found no independent `+30` or `+31` accesses that could be tied back to a `D13FED`-loaded descriptor rather than to unrelated `IY`-based state blocks.

## Bottom Line

The strongest phase-426 update is that the “unknown” gaps are not random padding:

- `+3..+5` is a real second callback vector.
- `+6..+8` is a pointer field with the busy flag packed into its high byte.
- `+24..+27` is a coherent mode/state tail that both the delivery wrapper and the transfer extractor understand.

That gives a defensible byte-for-byte map for `+0..+27`, and it also explains why the previous reports alternated between “pointer table descriptor,” “notification block,” and “connection struct”: they are the same runtime object viewed by different parts of the link/USB stack.

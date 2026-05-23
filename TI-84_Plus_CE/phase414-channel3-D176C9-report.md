# Phase 414 Report: Channel 3 (D176C9/D176CA) Notification Map

## Summary

Channel 3 is a **protocol-layer notification channel** used to signal completion of USB/Link data-transfer operations. It follows the exact same armed/completed flag pattern as Channels 1 and 2, and its staging block lives in the D176C0-D176CE RAM region -- structurally parallel to Channel 2's D17770-D1777A block.

## Reference Counts

| Address | Label | Writes | Reads |
|---------|-------|--------|-------|
| D176C9 | Active/armed flag | 29 | 1 |
| D176CA | Completion/status byte | 4 | 0 |

## The Staging Function: 0x0151A7

Confirmed as the Channel 3 staging function, structurally identical to 0x0151FE (Channel 2 staging). 12 instructions, 45 bytes, ends with RET at 0x0151D3.

### Disassembly

```
0x0151A7  LD (D176C9),A        ; initial write (A is input param from caller)
0x0151AB  LD BC,(D176CB)       ; read staged argument source
0x0151B0  LD (D176C3),BC       ; copy to callback argument slot
0x0151B5  LD BC,0x01516F       ; completion callback address
0x0151B9  LD (D176C0),BC       ; install callback pointer
0x0151BE  LD BC,(D14038)       ; global notification context
0x0151C3  LD (D176C6),BC       ; install context mirror
0x0151C8  XOR A                ; A = 0
0x0151C9  LD (D176CA),A        ; clear completion flag
0x0151CD  LD A,0x01            ; A = 1
0x0151CF  LD (D176C9),A        ; arm the channel
0x0151D3  RET
```

### Channel 3 Staging Block (D176C0-D176CE)

| Address | Purpose | Populated by 0x0151A7 |
|---------|---------|-----------------------|
| D176C0 | Callback pointer | 0x01516F (completion callback) |
| D176C3 | Callback argument | Copied from D176CB |
| D176C6 | Context mirror | Copied from D14038 (global notification source) |
| D176C9 | Armed flag | Set to 1 last (publication ordering) |
| D176CA | Completion flag | Cleared to 0 before arming |
| D176CB | Argument source (pre-staging) | Read, not written by 0x0151A7 |
| D176CE | Unknown (cleared elsewhere) | Not touched by 0x0151A7 |

### Callers

0 direct CALL/JP references found. 0x0151A7 starts immediately after 0x0151A5 (which the probe at 0x015199 shows is preceded by `POP BC; POP BC`), suggesting it is reached via fall-through from the code at 0x015185 or via an indirect call.

## The Completion Callback: 0x01516F

```
0x01516F  XOR A
0x015170  LD (D176C9),A        ; disarm channel (set to 0)
0x015174  LD A,0x01
0x015176  LD (D176CA),A        ; set completion flag to 1
0x01517A  LD BC,0x000003       ; argument = 3
0x01517E  PUSH BC
0x01517F  CALL 0x0150C2        ; notify with channel ID = 3
0x015183  POP BC
0x015184  RET
```

This mirrors Channel 2's completion callback at 0x015185, which calls 0x0150C2 with argument 2. The numeric argument (3 vs 2) is the **channel identifier** passed to the common notification dispatcher at 0x0150C2.

## The Teardown: 0x014E81

The teardown processes all three channels sequentially with identical logic:

```
Channel 1 (USB lock):     D1440E → read → if nonzero: clear D1440E, set D1440F=1
Channel 2 (Link staging): D17779 → read → if nonzero: clear D17779, set D1777A=1
Channel 3 (this one):     D176C9 → read → if nonzero: clear D176C9, set D176CA=1
```

The single read of D176C9 in the entire ROM occurs at 0x014EC5, inside this teardown.

## Write Site Analysis

All 29 writes to D176C9 follow one of two patterns:

### Pattern A: Disarm (clear to 0) -- 27 sites

Preceded by `XOR A` (A=0), the write clears the armed flag. After clearing, most sites call one of:
- `CALL 0x015151` (13 sites) -- a protocol state reset/check
- `CALL 0x0004EC` (11 sites) -- a jump-table vector

Many then read D176F2 (protocol state) or D176F8 (FSM state byte), indicating Channel 3 is disarmed as part of protocol state transitions.

### Pattern B: Arm (set to 1) -- 2 sites

Both are in the staging function cluster at 0x015170-0x0151F3:
- 0x0151CF: final arm in 0x0151A7 staging function
- 0x0151F3: final arm in a parallel staging path at 0x0151D4

### Co-clearing with Channel 2

Several sites clear both D176C9 and D17779 (Channel 2) in sequence:
- 0x00AA20: clears D176C9 then D17779
- 0x047E4B: clears D176C9 then D17779
- 0x04DC06: clears D176C9 then D17779

This confirms Channels 2 and 3 are **peer notification channels** in the same protocol layer, both disarmed together during state resets.

## Adjacent RAM: D176F2, D176F8, D176CB

Several addresses appear repeatedly alongside D176C9:

| Address | Role | Evidence |
|---------|------|----------|
| D176F2 | Protocol connection/session state | Read via `LD HL,(D176F2)` after most D176C9 clears |
| D176F8 | Protocol FSM state byte | Compared against 0x10 at 0x00B89D, 0x04DF51 |
| D176CB | Pre-staging argument source | Read by 0x0151A7 to populate D176C3 |
| D176CE | Unknown | Cleared to 0 at 0x015169 (just before 0x01516F callback) |

## Second Staging Path: 0x0151D4

There is a parallel staging function starting around 0x0151D4 that also arms D176C9 (at 0x0151F3). Its structure:

```
0x0151D4  ...                  ; (entry, likely reached via fall-through)
          ...
0x0151DD  LD (D176C3),BC       ; argument slot
0x0151E2  LD BC,(D14038)       ; context from global source
0x0151E7  LD (D176C6),BC       ; context mirror
0x0151EC  XOR A
0x0151ED  LD (D176CA),A        ; clear completion
0x0151F1  LD A,0x01
0x0151F3  LD (D176C9),A        ; arm
          ...
0x0151FD  RET
```

This is a variant staging path that populates the same D176C0-D176C9 block but takes a different argument source. Its existence (two staging entries for the same channel) suggests Channel 3 handles at least two distinct notification contexts.

## Interpretation

**Channel 3 is a data-transfer completion notification channel.** It serves the same protocol layer as Channel 2 (Link protocol staging) but operates on a separate staging block (D176C0 vs D17770). The key evidence:

1. **Identical lifecycle**: arm (set D176C9=1), callback fires (0x01516F clears D176C9, sets D176CA=1, notifies dispatcher with channel ID 3), teardown disarms.
2. **Same dispatcher**: Both channels call 0x0150C2 with their channel number (2 or 3).
3. **Co-clearing**: Channels 2 and 3 are cleared together at 3 sites, confirming they are peer channels.
4. **Protocol state coupling**: D176F2 and D176F8 (protocol FSM state) are checked immediately after most D176C9 clears.
5. **29 disarm sites vs 2 arm sites**: The channel is cleared frequently during protocol state transitions but armed only through the dedicated staging functions. This is consistent with a "ready to receive" notification that gets disarmed whenever the protocol state changes.

**Likely purpose**: Channel 3 is the **data-transfer ready/complete** notification, while Channel 2 is the **link protocol staging** notification. Together with Channel 1 (USB hardware lock), they form a three-layer notification stack: hardware (Ch1) -> protocol (Ch2) -> data transfer (Ch3).

## New Decoded Addresses

| Address | Type | Bytes | Description |
|---------|------|-------|-------------|
| 0x0151A7 | Function | 45 | Channel 3 staging (primary path) |
| 0x0151D4 | Function | ~42 | Channel 3 staging (variant path) |
| 0x01516F | Function | 22 | Channel 3 completion callback |
| D176C0 | RAM | 3 | Channel 3 callback pointer slot |
| D176C3 | RAM | 3 | Channel 3 callback argument slot |
| D176C6 | RAM | 3 | Channel 3 context mirror slot |
| D176C9 | RAM | 1 | Channel 3 armed flag |
| D176CA | RAM | 1 | Channel 3 completion flag |
| D176CB | RAM | 3 | Channel 3 pre-staging argument source |
| D176CE | RAM | 3 | Channel 3 auxiliary (cleared by callback) |

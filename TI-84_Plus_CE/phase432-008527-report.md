# Phase 432 - Decode of `0x008527`

## Summary

`0x008527..0x0085C3` is a 157-byte shared USB/controller follow-up helper. It is not a thin boolean wrapper. Instead it performs deeper controller re-arm and mode-transition work, optionally takes a special `D177B8 == 0x98` branch, then clears a follow-up gate byte and schedules a delayed callback through `0x01322D(0x0800)`.

The function is side-effect driven. The known P2 and P7 callers use it to continue USB bring-up after their own outer gating and delays; they do not depend on `0x008527` to compute the final success bit.

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x008527` |
| End | `0x0085C3` |
| Size | `157` bytes (`0x009D`) |
| Epilogue | `POP BC ; RET` after the `0x01322D` call tail |

## Behavior

1. Call `0x006EB6`, the alternate USB-ready / `usb_SelfPowered` gate.
2. If that gate reports **not ready**, read port `0x3082` and test bit 3.
3. If bit 3 is set, call `0x012456` to re-arm controller/link state.
4. Set bit 0 on port `0x3114`, then call `0x0125EA` with the standard-control pair used elsewhere in the USB bring-up path (`0x10` / `0xFF`).
5. Read `D177B8`. If it equals `0x98`, take a broader special-state branch:
   - `0x00E91E`
   - `0x00D9EE(1)`
   - `0x00DA8C(0)`
   - set bit 0 on `0x3114` again
   - call `0x01253F` with the shorter `(0,1)` status-submit pattern
6. Common tail for all paths:
   - `XOR A`
   - `LD (0xD14075),A`
   - `CALL 0x01322D` with `0x0800`
   - `RET`

Best-fit label: **shared USB follow-up / mode-transition helper with a special `0x98` re-enumeration arm**.

## CALL Targets

| Target | Role | Site |
| --- | --- | --- |
| `0x006EB6` | alternate USB-ready / `usb_SelfPowered` gate (`IN0 0x0F` bit 6 path) | `0x008527` |
| `0x012456` | controller/link re-arm helper; toggles `0x3080` bits and clears `D14082` | `0x008542` |
| `0x0125EA` | USB mode-transition / port-ready gate; waits on `0x3082` bit 1 and submits status | `0x008567` |
| `0x00E91E` | pre-enumerate setup | `0x008577` |
| `0x00D9EE` | USB PHY link-speed negotiation / init stage | `0x008580` |
| `0x00DA8C` | legacy link disconnect/toggle helper | `0x00858A` |
| `0x01253F` | shorter sibling of `0x0125EA`; another `0x3082`-ready/status-submit gate | `0x0085AE` |
| `0x01322D` | indirect callback wrapper through slot `D14026`; here used with `0x0800` | `0x0085BE` |

## Port I/O Summary

Direct port I/O inside `0x008527`:

| Port | Access | Bits | Meaning in this routine |
| --- | --- | --- | --- |
| `0x3082` | read | bit 3 | gates whether the function first calls `0x012456` |
| `0x3114` | read-modify-write | bit 0 | raised once before `0x0125EA`, and raised again on the `D177B8 == 0x98` branch before `0x01253F` |

Nested helpers touch more ports, but those are callee-side effects:

- `0x012456` manipulates `0x3080`.
- `0x00D9EE` reads `0x3018`, `0x3015`, and `0x3014`.
- `0x0125EA` and `0x01253F` poll `0x3082` bit 1.

## RAM Variables Accessed

Direct absolute RAM references inside `0x008527`:

| Address | Access | Role |
| --- | --- | --- |
| `0xD177B8` | read | USB notification/state byte; only the special `0x98` branch uses it |
| `0xD14075` | write (`0`) | follow-up gate byte cleared just before the delayed callback |

No other absolute RAM reads or writes occur directly in this helper.

## Relation To P2 And P7

### P7 (`0x009087`)

The phase-431 fallback wrapper for `D177B8 == 0x21` already does its own outer status work:

- checks `0x3082` bit 4
- emits status via `0x00883C`
- waits 2 ticks
- optionally pulses `0x3080` bit 2 for 7 ticks

It then calls `0x008527` as the deeper continuation. Inside `0x008527`, P7 uses the common front half:

- optional `0x012456` re-arm based on `0x006EB6` and `0x3082` bit 3
- raise `0x3114` bit 0
- run `0x0125EA`
- clear `D14075`
- schedule the `0x01322D(0x0800)` follow-up

Because P7 only enters when `D177B8 == 0x21`, it should **not** take the internal `0x98` branch.

### P2 (`0x008BE9`)

The phase-431 HID/alt-setting path reaches `0x008527` only after:

- calling `0x006EB6`
- doing descriptor/status setup
- setting `0x3114` bit 0
- waiting through `0x014FA0`
- optionally pulsing `0x3080` bit 2

So `0x008527` is not P2's first-stage arm logic; it is the common deeper follow-up after that prep work. As with P7, the known P2 path rechecks `D177B8 == 0x85`, so its call should also stay on the common non-`0x98` path.

### What The Helper Sets Up For Them

For both known callers, `0x008527` provides the deeper part of USB bring-up:

- one more readiness/re-arm decision (`0x006EB6` + `0x3082 bit 3`)
- a direct enable of `0x3114 bit 0`
- a status/mode transition gate through the `0x0125xx` helpers
- clearing `D14075`
- a delayed follow-up callback through `0x01322D(0x0800)`

That makes `0x008527` the **shared continuation that turns the outer caller-specific arm/pulse logic into a completed mode-transition / follow-up schedule**.

## Conclusion

`0x008527` is broader than just P2 or P7, because it contains its own `D177B8 == 0x98` branch. But for the two known callers in the phase-431 init chain, the important role is the common path: optional controller re-arm, direct `0x3114` enable, `0x0125xx` port-ready/status submission, then `D14075` clear plus a delayed callback through `0x01322D`.

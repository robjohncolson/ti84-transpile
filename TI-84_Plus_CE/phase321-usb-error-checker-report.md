# Phase 321: 0x006EDA USB Error Checker Report

## Summary

`0x006EDA` is a small USB/link status probe that **does not crash directly**. It reads a handful of USB-related ports and returns:

- `A = 0x01` on failure
- `A = caller-pushed BC low byte` on success

All direct callers found in this pass push `BC = 0x000000` before the call, so the success path effectively returns `A = 0x00`.

The checker's fatal behavior comes entirely from callers that do:

```asm
CALL 0x006EDA
POP BC
OR A
JR Z,ok
CALL 0x0019B5
```

That matches the phase 320 link/USB crash pattern.

## 1. Full Disassembly of 0x006EDA

Disassembly from `0x006EDA` through the function return:

```asm
0x006EDA  DD E5             PUSH IX
0x006EDC  DD 21 00 00 00    LD IX,0x000000
0x006EE1  DD 39             ADD IX,SP
0x006EE3  FD 21 80 00 D0    LD IY,0xD00080
0x006EE8  ED 38 0F          IN0 A,(0x0F)
0x006EEB  CB 7F             BIT 7,A
0x006EED  20 04             JR NZ,0x006EF3
0x006EEF  3E 01             LD A,0x01
0x006EF1  18 3B             JR 0x006F2E
0x006EF3  01 82 30 00       LD BC,0x003082
0x006EF7  ED 78             IN A,(C)
0x006EF9  CB 67             BIT 4,A
0x006EFB  20 0C             JR NZ,0x006F09
0x006EFD  01 30 30 00       LD BC,0x003030
0x006F01  ED 78             IN A,(C)
0x006F03  CB 47             BIT 0,A
0x006F05  28 E8             JR Z,0x006EEF
0x006F07  18 22             JR 0x006F2B
0x006F09  CB 6F             BIT 5,A
0x006F0B  20 1E             JR NZ,0x006F2B
0x006F0D  21 B8 24 00       LD HL,0x0024B8
0x006F11  0E 31             LD C,0x31
0x006F13  16 00             LD D,0x00
0x006F15  ED 78             IN A,(C)
0x006F17  B2                OR D
0x006F18  57                LD D,A
0x006F19  E6 0C             AND 0x0C
0x006F1B  FE 0C             CP 0x0C
0x006F1D  28 0C             JR Z,0x006F2B
0x006F1F  2B                DEC HL
0x006F20  7D                LD A,L
0x006F21  B4                OR H
0x006F22  20 F1             JR NZ,0x006F15
0x006F24  7A                LD A,D
0x006F25  E6 0C             AND 0x0C
0x006F27  FE 08             CP 0x08
0x006F29  28 C4             JR Z,0x006EEF
0x006F2B  DD 7E 06          LD A,(IX+6)
0x006F2E  DD E1             POP IX
0x006F30  C9                RET
```

### Notes

- `LD IY,0xD00080` is dead setup inside this routine. `IY` is never dereferenced before return.
- `LD A,(IX+6)` reads the low byte of the caller-pushed `BC` value from the stack frame.
  In ADL mode, the stack layout is:
  - `IX+0..2` = saved `IX`
  - `IX+3..5` = return address
  - `IX+6..8` = caller-pushed `BC`
- Every direct caller found here pushes `BC=0`, so the pass path returns `A=0`.

## 2. Error Condition

### Fixed reads performed by the function

- No absolute RAM reads
- Stack read: `(IX+6)` on the success path only
- Port reads:
  - `IN0 A,(0x0F)`
  - `IN A,(0x3082)`
  - `IN A,(0x3030)` when `0x3082.bit4 == 0`
  - `IN A,(0x3031)` in the polling branch

### Pseudocode

```c
if ((port_0x0F & 0x80) == 0) {
    return 1;
}

status82 = in(0x3082);
if ((status82 & 0x10) == 0) {
    if ((in(0x3030) & 0x01) == 0) {
        return 1;
    }
    return stacked_bc_low;
}

if ((status82 & 0x20) != 0) {
    return stacked_bc_low;
}

d = 0;
for (hl = 0x24B8; hl != 0; --hl) {
    sample = in(0x3031);
    d |= sample;
    if ((sample & 0x0C) == 0x0C) {
        return stacked_bc_low;
    }
}

if ((d & 0x0C) == 0x08) {
    return 1;
}

return stacked_bc_low;
```

### Exact fail cases

The function returns `A=1` only in these cases:

1. `port 0x0F bit 7 == 0`
2. `port 0x0F bit 7 == 1`, `port 0x3082 bit 4 == 0`, and `port 0x3030 bit 0 == 0`
3. `port 0x0F bit 7 == 1`, `port 0x3082 bit 4 == 1`, `port 0x3082 bit 5 == 0`, and the `0x3031` poll loop times out without ever seeing `(sample & 0x0C) == 0x0C`, with the aggregate final state `(D & 0x0C) == 0x08`

### Exact pass cases

The function returns the stacked low byte from `BC` (zero in all observed direct callers) when any of these hold:

1. `port 0x0F bit 7 == 1`, `port 0x3082 bit 4 == 0`, and `port 0x3030 bit 0 == 1`
2. `port 0x0F bit 7 == 1`, `port 0x3082 bit 4 == 1`, and `port 0x3082 bit 5 == 1`
3. Poll branch: any `0x3031` sample has bits `2` and `3` both set (`sample & 0x0C == 0x0C`)
4. Poll branch timeout with aggregate `(D & 0x0C)` equal to `0x00`, `0x04`, or `0x0C`

## 3. Caller Analysis

Direct pattern scan results:

- `CALL 0x006EDA` (`CD DA 6E 00`): **7 hits**
- `JP 0x006EDA` (`C3 DA 6E 00`): **1 hit**

### Direct callers / jumpers

| Site | Type | Immediate context | Effect of non-zero return |
|---|---|---|---|
| `0x000604` | `JP` | Unnamed public USB vector slot in the low jump table, between `usb_SetDMAAddress` and `usb_InEndpointClrStall` in `ti84pceg.inc`. | Transfers directly into `0x006EDA`; many higher-level callers can reach the checker through this vector. |
| `0x00FB01` | `CALL` | In the event-cluster dispatcher near `0x00FAE6`. This branch is only taken when `D14076 != 0`, `D1440F == 0`, and `usbInited (D177B7) == 0x55`. | On failure it sets local return byte `(IX-1)=1`, clears `D14076`, and loops back; no crash here. |
| `0x013711` | `CALL` | Sibling USB/link helper with a 2-byte local frame from `CALL 0x002197`; zeroes `(IX-2)` and `(IX-1)` before calling. | On failure it loads `HL=0x00F006` and exits via `0x0137E0`; on success it calls `0x0151A6`, sets `D17795=2`, then calls `0x01106A`. |
| `0x0137FA` | `CALL` | Second sibling helper with the same frame/setup pattern as `0x013711`. | On failure it loads `HL=0x00F006` and exits via `0x0138E6`; on success it calls `0x0151A6`, copies `D176DD -> D17783`, clears `D17786`, then calls `0x011576`. |
| `0x014012` | `CALL` | Link/USB crash site from phase 320. The caller first stores `0x02` to `D176F8` and `0x01` to `D1772D`, then pushes `BC=0`. | Failure falls into `0x01401A: CALL 0x0019B5`; success clears `D176FC` and calls `0x0141BC`. |
| `0x0149CA` | `CALL` | Later link/USB handler stage. The nearby code stores a size/value into `D17726`, disables/restores mode around `0x014900`, then re-enters ADL and calls the checker. | Failure falls into `0x0149D2: CALL 0x0019B5`; success loads `HL=(D17726)` and calls `0x0025E8`. |
| `0x0149E5` | `CALL` | Follow-on stage immediately after the `0x0025E8` path above succeeds. | Failure falls into `0x0149ED: CALL 0x0019B5`; success sets `D176F8=3`, prepares `BC=0x00AA10`, and continues. |
| `0x015108` | `CALL` | Late link/USB path entered only when `D1772D != 0` and the preceding compare block matched. | Failure falls into `0x015110: CALL 0x0019B5`; success continues with `CALL 0x0021C2`. |

### Cross-reference against phase 320 crash sites

Only these phase 320 crash sites are direct `0x006EDA` consumers:

- site 15: `0x01401A`
- site 17: `0x0149D2`
- site 18: `0x0149ED`
- site 19: `0x015110`

Related Link/USB crash sites from phase 320 that **do not** call `0x006EDA`:

- site 13: `0x0099B8` crashes directly on `D1772D != 0`
- site 16: `0x0141B3` is a separate unconditional crash path after a different port test

## 4. Crash Path

`0x006EDA` never jumps or calls `0x0019B5` itself.

Its crash path is always:

```asm
CALL 0x006EDA
POP BC
OR A
JR Z,ok
CALL 0x0019B5
```

Observed direct crash relays:

- `0x01401A`
- `0x0149D2`
- `0x0149ED`
- `0x015110`

### D0301B handling

- `0x006EDA` does **not** write `D0301B`
- none of the four direct `0x006EDA` crash-relay blocks above write `D0301B` first
- the nearby separate crash site at `0x0141B3` does zero `D0301B`, but that is **not** a `0x006EDA` path

So for this checker specifically, the crash route is "return `A=1` to caller, caller crashes," with **no error-context pointer setup** in the checker itself.

## 5. Peripheral Implications for the Emulator

### Simplest always-pass mapping

If the emulator wants this checker to pass immediately, the easiest stable mapping is:

- `port 0x0F = 0x80` (bit 7 set)
- `port 0x3082 = 0x30` (bits 4 and 5 both set)

With those two values:

- the function skips the fail-at-`0x3030` branch
- it skips the `0x3031` poll loop
- it returns success immediately

### Alternate pass mappings

If `0x3082 bit 4` is left clear instead, then:

- `port 0x3030 bit 0` must be `1`

If `0x3082 bit 4 = 1` but `bit 5 = 0`, then:

- `port 0x3031` should produce a sample with `(value & 0x0C) == 0x0C`
- or at minimum avoid timing out in a persistent bit-3-only state (`0x08`)

### Practical emulator recommendation

For a browser-shell or non-USB-focused emulator, the least risky fake USB state for this checker is:

```text
0x0F   -> 0x80
0x3082 -> 0x30
0x3030 -> 0x01   (optional safety)
0x3031 -> 0x0C   (optional safety)
```

Only the first two are needed for the shortest pass path inside `0x006EDA`.

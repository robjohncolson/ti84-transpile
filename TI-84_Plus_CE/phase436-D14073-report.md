# Phase 436: D14073 (USB Connected/Ready Flag) Trace

## Summary

- Total literal `73 40 D1` hits in `ROM.rom`: `52`
- Real direct reads: `40`
- Real direct writes: `12`
- `LD HL,D14073` / `LD IX,D14073` / `LD IY,D14073` hits: `0`
- `BIT n,(HL)` via a literal `D14073` address load: `0`

All `52` hits are genuine direct byte accesses:

- `40 x LD A,(0xD14073)` (reads)
- `12 x LD (0xD14073),A` (writes)

There are no false positives from call targets, jump targets, or pair loads. The ROM uses `D14073` as a byte flag, not as a pointer.

Best fit:

- `D14073` is a **USB connected/ready** flag.
- Written `1` when USB port 0x3082 bit 4 (device connected) is detected, or when the USB subsystem transitions to an active/enumerated state.
- Written `0` when the USB subsystem is reset, detached, or enters cleanup.
- Read in **40** places, overwhelmingly as a gate: `OR A; JR Z / JP Z` (skip USB work when not connected) or `OR A; JR NZ / JP NZ` (take USB-specific path when connected).

## Value Domain

D14073 is a binary flag: only `0` and `1` are ever written.

- **6 writes set to `1`** via `LD A,0x01; LD (D14073),A`
- **4 writes clear to `0`** via `XOR A; LD (D14073),A`
- **2 writes store a hardware port bit**: `IN A,(0x3082); AND 0x10; LD (D14073),A` -- this is port 0x3082 bit 4 masked, so the stored value is either `0x00` or `0x10` (nonzero = connected). This is the only case where D14073 holds a value other than exactly `1`, but the pattern is still boolean: nonzero = connected.

All 40 reads use the same `OR A` flag-test pattern. No reader compares against specific numeric values (no `CP n`), confirming D14073 is tested purely for zero/nonzero.

## Read Usage Patterns

Every single read follows the same pattern:

```asm
LD A,(0xD14073)
OR A
JR Z,+N    ; or JP Z,addr  (24 sites: skip USB work when not connected)
JR NZ,+N   ; or JP NZ,addr (16 sites: enter USB-specific path when connected)
```

### Breakdown of read behaviors:

| Pattern | Count | Meaning |
|---------|-------|---------|
| `OR A; JR Z,+6` then `CALL usb_submit_xxx` | 5 | Endpoint submit guards in descriptor/transfer handlers |
| `OR A; JR Z,+N` (various) | 19 | Skip USB processing when disconnected |
| `OR A; JR NZ,+N` / `JP NZ` | 16 | Enter USB-specific code paths when connected |

The 5 short-guard sites (JR Z,+6) at `0x0133EB`, `0x0135B7`, `0x01368E`, `0x0136A7`, `0x0136E2` are particularly clear: each gates a `CALL` to a USB submit/transfer function. If D14073 is zero (not connected), the submit is skipped entirely.

## Relationship to D14074

D14073 and D14074 are adjacent bytes in the USB state structure. **6 of 52** D14073 references occur within 64 bytes of a D14074 reference, all in the USB/key state machine functions:

| D14073 site | Nearby D14074 site | Function |
|-------------|-------------------|----------|
| `0x00F0F7` (read) | `0x00F03C` (write) | Low-ROM USB/key state machine (`func_00EFA0`) |
| `0x00F11E` (write 0) | `0x00F0DF` (write) | Same function, cleanup path |
| `0x012B5A` (read) | `0x012B2A` (write) | Low-ROM USB enable helper (`func_012AC2`) |
| `0x02BC60` (read) | `0x02BBA5` (write) | Flash mirror of `func_00EFA0` |
| `0x02BC87` (write 0) | `0x02BCCA` (write) | Flash mirror, cleanup path |
| `0x0417E1` (read) | `0x0417B1` (write) | Flash mirror of `func_012AC2` |

The key distinction:

- **D14073** = USB device physically connected/ready (40 reads, high-traffic gate)
- **D14074** = USB subsystem fully active/enumerated (3 reads, event-loop gate)

D14073 is the **inner, finer-grained** flag. Many functions check D14073 but never check D14074. D14074 is only checked at the top-level event loop and FIFO reset, while D14073 gates individual endpoint submissions and transfer operations deep in the USB driver.

## Write Sites

### Sets to 1 (USB becoming connected/ready)

| Instr addr | Function context | Trigger |
|------------|-----------------|---------|
| `0x008B3F` | `func_008A9x` USB state callback | After `D177B8 != 0x55` check; sets ready after event dispatch |
| `0x009A26` | `func_009A1x` USB port monitor | After reading port `0xD14044` bit 0 and port `0x3082` bit 4; sets ready on USB connect detect |
| `0x012EED` | `func_012Exx` USB enable/enumerate | After `CALL 0x0021C2` succeeds; also writes `D14042=0x0F`, `D14046=0x21` (descriptor config) |
| `0x036773` | `func_036xxx` flash helper | Flash mirror of `0x009A26` |
| `0x041A91` | `func_041xxx` flash USB enable | Flash mirror of `0x012EED` |
| `0x049412` | `func_049xxx` flash USB helper | Flash mirror of `0x008B3F` |

### Clears to 0 (USB disconnecting/resetting)

| Instr addr | Function context | Trigger |
|------------|-----------------|---------|
| `0x00F11E` | `func_00EFA0` USB/key state machine | During cleanup: also clears `D14088`, reads `D14084` |
| `0x012F80` | `func_012Fxx` USB disable/cleanup | After endpoint teardown; also writes `D14042=0x1F`, `D14046=0x30` |
| `0x02BC87` | `func_02B806` flash USB state machine | Flash mirror of `0x00F11E` |
| `0x041B0E` | `func_041xxx` flash USB disable | Flash mirror of `0x012F80` |

### Stores port bit (hardware detect)

| Instr addr | Function context | Trigger |
|------------|-----------------|---------|
| `0x01304B` | USB port polling loop | `IN A,(0x3082); AND 0x10; LD (D14073),A` -- stores raw port bit |
| `0x041BD7` | Flash mirror | Same pattern |

These two sites are inside a tight polling loop that reads port 0x3082 repeatedly, checking bit 4 (device connected) and bit 3. The raw masked value (`0x00` or `0x10`) is stored directly, which still works as a boolean flag since all readers use `OR A`.

## Containing Functions (Deduplicated, Low-ROM Only)

| Function range | D14073 refs | Role |
|---------------|-------------|------|
| `0x008A9x-0x008Bxx` | 1R, 1W | USB state callback: read as gate, write `1` on event completion |
| `0x009A1x-0x009Bxx` | 1W, 1R | USB port monitor: write `1` on hardware connect, read as state check |
| `0x00EFA0-0x00F2xx` | 2R, 1W | USB/key state machine: read in two branch points, clear on cleanup |
| `0x00F5xx-0x00FAxx` | 3R | USB state machine (dispatch table section): three separate branch gates |
| `0x011EEx-0x0122xx` | 5R | USB state helper cluster: read-only guards on USB operations |
| `0x0128Dx` | 1R | USB submit guard |
| `0x012Axx-0x01305x` | 2R, 3W | USB enable/disable pair: write `1` on enable, write `0` on disable, port-bit poll |
| `0x0133xx-0x01384x` | 7R | Endpoint/descriptor submit handlers: 5 short guards (JR Z,+6) + 2 longer guards |
| `0x0156xx-0x01570x` | 2R | USB PHY/port-status helpers |
| `0x06AA6x` | 1R | Isolated flash function (no low-ROM mirror found) |

## Low-ROM / Flash Mirror Pairs

The 52 references decompose into **34 low-ROM** + **18 flash** references. Flash mirrors replicate low-ROM logic:

| Low-ROM cluster | Flash mirror | Refs (each) |
|----------------|-------------|-------------|
| `0x00F0F7-0x00F218` | `0x02BC60-0x02BEAC` | 3 / 3 |
| `0x009A26-0x009BD5` | `0x0366E5-0x036773` | 2 / 2 |
| `0x012B5A-0x01304B` | `0x0417E1-0x041BD7` | 9 / 9 |
| `0x008AB1-0x008B3F` | `0x049412-0x0495D7` | 2 / 2 |
| `0x011EEF` | `0x06AA62` | 1 / 1 |
| (remaining low-ROM) | `0x0414A3` | -- / 1 |

After deduplication, there are approximately **28 unique behavioral sites** (the low-ROM set plus `0x0414A3` and `0x06AA62`).

## Behavioral Hypothesis

**D14073 is a USB device-connected flag that gates individual USB transfer operations.**

Evidence:

1. **Binary flag**: only `0` and `1` (or `0x10` as nonzero) are written. All reads test zero/nonzero.

2. **Set by hardware detection**: the port-polling loop reads USB port 0x3082 bit 4 (device-connected status) and stores it directly into D14073.

3. **Set by software on USB enumeration**: `0x012EED` sets D14073 to `1` alongside descriptor configuration (`D14042=0x0F`, `D14046=0x21`), indicating the device has been enumerated and endpoints are configured.

4. **Cleared on USB disconnect/cleanup**: `0x012F80` clears D14073 to `0` alongside endpoint teardown and different port configuration (`D14042=0x1F`, `D14046=0x30`).

5. **Gates endpoint submit calls**: the 5 short-guard sites each protect a `CALL` to a USB submit/transfer function. When D14073 is zero, transfers are skipped -- you cannot submit to an endpoint that is not connected.

6. **Much higher traffic than D14074**: 40 reads vs D14074's 3 reads. D14073 is checked at every USB operation, while D14074 is only checked at the top-level event loop. This makes D14073 the **connection-level** flag and D14074 the **subsystem-active** flag.

## Adjacent RAM Context

| Address | Refs | Role |
|---------|------|------|
| `D14042` | -- | USB port/descriptor configuration byte (written alongside D14073 transitions) |
| `D14046` | -- | USB descriptor type byte (written alongside D14073 transitions) |
| `D14073` | 52 | **USB connected/ready flag** (this report) |
| `D14074` | 29 | USB subsystem active flag (phase 435) |
| `D14084` | -- | USB sub-state byte (read during D14073 cleanup paths) |
| `D14088` | 11 | USB auxiliary flag (cleared alongside D14073 in cleanup) |

## Final Answer

`D14073` is read in **40** places and written in **12** places (28 unique sites after deduplication of flash mirrors).

It is a **USB device-connected/ready flag**:

- `0` = no USB device connected; all endpoint submit/transfer calls are skipped
- `1` (or nonzero) = USB device connected and ready; endpoint operations proceed

It is set by:
1. Hardware port 0x3082 bit 4 polling (device-connected detect)
2. Software enumeration completion (alongside endpoint configuration)

It is cleared by:
1. USB disconnect/cleanup (alongside endpoint teardown)
2. USB/key state machine reset paths

Most precise behavioral description:

- **D14073** gates individual USB transfer/submit operations throughout the driver. It is the "are we connected?" check that every endpoint handler tests before attempting I/O.
- **D14074** gates the top-level event loop's decision to enter the USB subsystem at all. It is the "is USB active?" check at the dispatcher level.
- Together they form a two-level gate: D14074 controls whether the OS even looks at USB, and D14073 controls whether individual USB operations actually execute.

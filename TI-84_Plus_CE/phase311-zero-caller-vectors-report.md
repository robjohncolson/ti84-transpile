# Phase 311: Zero-Caller Vector Table Entry Trace

## Scope

Traced 14 jump vector table entries (at `0x000578 + idx*4`) that have **zero direct CALL sites** to the vector address. These are indices `[1, 4, 32, 40, 45, 46, 47, 48, 49, 51, 52, 53, 54, 55]` from the 56-entry table mapped in session 309.

## Summary Table

| Idx | Vector | SDK Name | Target | Vec Refs | Tgt CALLs | Category |
|-----|--------|----------|--------|----------|-----------|----------|
| 1 | `0x00057C` | `boot.GetOnInt` | `0x006EC0` | 0 | 0 | Dead / boot-only |
| 4 | `0x000588` | `boot.RTCGetInitStatus` | `0x010F87` | 0 | 0 | Dead / boot-only |
| 32 | `0x0005F8` | `usb_SetDMAAddress` | `0x0077F8` | 0 | 4 | USB (bypass) |
| 40 | `0x000618` | `usb_InEndpointSendZlp` | `0x007FE3` | 0 | 1 | USB (bypass) |
| 45 | `0x00062C` | `usb_SetFifoMap` | `0x00822C` | 1 data | 4 | USB (bypass) |
| 46 | `0x000630` | `usb_SetEndpointConfig` | `0x008294` | 0 | 4 | USB (bypass) |
| 47 | `0x000634` | `usb_ClrEndpointConfig` | `0x008381` | 3 data | 2 | USB (bypass) |
| 48 | `0x000638` | `usb_SetFifoConfig` | `0x008392` | 1 data | 5 | USB (bypass) |
| 49 | `0x00063C` | (unlabeled) | `0x00FBD1` | 1 LD-pair | 0 | OS internal |
| 51 | `0x000644` | (unlabeled) | `0x0060F7` | 0 | 32 | LCD port writer (OR A entry) |
| 52 | `0x000648` | (unlabeled) | `0x0060FA` | 8 data | 99 | LCD port writer (SCF entry) |
| 53 | `0x00064C` | (unlabeled) | `0x00609A` | 0 | 0 | Hardware init (dead?) |
| 54 | `0x000650` | (unlabeled) | `0x015834` | 0 | 1 | Hardware init (port writer) |
| 55 | `0x000654` | (unlabeled) | `0x015AEC` | 2 (1 CALL-cond) | 2 | Emulation guard |

## Detailed Findings

### Category 1: USB — OS bypasses vector (6 entries)

**Entries 32, 40, 45, 46, 47, 48** — all `usb_*` functions from the SDK.

The OS never CALLs the vector slot; it calls the target directly. The vector addresses exist for third-party app ABI compatibility (apps linked against `ti84pceg.inc` would CALL these vectors). The OS's own USB init/reset code bypasses the indirection entirely.

Entries 45, 47, and 48 have a few 3-byte LE data references to the vector address, but these are coincidental byte patterns in unrelated data, not actual address references (verified by context bytes — they don't match any CALL/JP/LD opcode).

### Category 2: Boot / RTC — truly dead (2 entries)

**Entry 1 (`boot.GetOnInt`, target `0x006EC0`):**
- Reads `IY+0x09` bit test, returns 0 or 1 in A.
- Zero references of any kind to vector or target.
- Likely a boot ROM internal that predates the current OS or was superseded.

**Entry 4 (`boot.RTCGetInitStatus`, target `0x010F87`):**
- Reads `(0xD177BC)` and returns in A. A one-liner status check.
- Zero references of any kind.
- The RTC subsystem has its own internal calls; this vector was likely for external apps but no code uses it.

### Category 3: LCD Port Writer — dual-entry function (2 entries)

**Entry 51 (target `0x0060F7`) and Entry 52 (target `0x0060FA`):**

These are **two entry points into the same function**. The function outputs a value through port `0xD018` using three rotated writes:

```
0x0060F7: OR A        ; clear carry flag (entry 51)
0x0060F8: JR 0x0060FB ; skip SCF
0x0060FA: SCF         ; set carry flag (entry 52)
0x0060FB: LD BC, 0xD018
0x0060FF: RLA; RLA; RLA; OUT (C), A  ; repeat 3x
```

- Entry 51 (`OR A` path): 32 direct callers, 0 vector callers.
- Entry 52 (`SCF` path): 99 direct callers, 0 vector callers, 8 data refs to vector address.

The 8 data refs to `0x000648` are coincidental byte matches (not address references — surrounding context is port I/O data, not address tables).

All 131 callers bypass the vector and call targets `0x0060F7` / `0x0060FA` directly. Port `0xD018` is in the LCD controller address space — this is an **LCD SPI/data port writer** with a carry-flag parameter (carry = command vs. data select bit).

### Category 4: OS Internal — miscellaneous (3 entries)

**Entry 49 (`0x00063C` -> `0x00FBD1`):**
- Has 1 LD-pair-imm reference: at `0x02BA64` — `LD BC, 0x00063C` followed by `LD (0xD14026), BC`. This stores the vector address into a RAM variable, suggesting a **callback registration** pattern.
- Target calls `0x00218A` and `0x0021C2`, writes to `0xD14074`, `0xD1772D`, `0xD176FB`.
- This is a **USB event/state handler** registered at runtime. The vector is used as a callback pointer, not via direct CALL.

**Entry 54 (`0x000650` -> `0x015834`):**
- 1 direct CALL to target. Writes `0xFF` to port `0xB024`, calls `0x0061E3`, manipulates port `0x05`.
- An LCD/peripheral **hardware initialization** helper. The single caller suggests it runs once during boot.

**Entry 55 (`0x000654` -> `0x015AEC`):**
- 2 direct CALLs to target. 2 data refs to vector address.
- Target calls `CheckIfEmulated` (`0x0158A6`), then:
  - If emulated (Z flag): falls through to `0x015AFB` (returns, skips hardware access).
  - If real hardware (NZ): reads port `0x0C` via `IN0`, clears bit 2 (`RES 2, A`), writes back via `OUT0`.
- One of the vector refs (`0x04C0A5`) is a **conditional CALL**: `CALL Z, 0x000654` — meaning the vector IS called, but only conditionally (Z flag), and only from one site.
- This is an **emulation-aware hardware register tweak** — port `0x0C` bit 2 control, skipped on emulators.

### Category 5: Hardware Init — truly dead (1 entry)

**Entry 53 (`0x00064C` -> `0x00609A`):**
- Zero references of any kind (vector or target).
- Target does `IN0` / `RES` / `SET` on port `0x05`, then a timing loop (`DJNZ`), then loads `BC = 0xB020` and writes `0xFF`.
- This is a **clock/PLL initialization sequence**. Port `0x05` is the eZ80 Flash Wait State register. The `DJNZ` loops are timing delays.
- Likely a boot-time-only routine that was inlined or superseded in the current OS build.

## Why Zero Vector Callers?

The 14 entries fall into three patterns:

1. **OS bypasses vector, calls target directly** (entries 32, 40, 45-48, 51, 52, 54, 55): The vector slot exists for ABI/app compatibility. The OS's own code knows the direct address and skips the indirection. This is the dominant pattern — 10 of 14 entries.

2. **Callback pointer, not direct CALL** (entry 49): The vector address is loaded into a register pair and stored in RAM as a callback. It's invoked via computed JP/CALL, not a literal `CALL 0x00063C`.

3. **Truly dead / vestigial** (entries 1, 4, 53): No references of any kind. These are boot ROM leftovers or superseded functions. Safe to stub.

## Browser-Shell Relevance

- **None of these 14 entries are needed for the browser shell.** The USB entries (32, 40, 45-48) have no event-loop path. The LCD port writer (51, 52) is already transpiled via direct-target calls. The hardware init entries (53, 54) only run at boot. The emulation guard (55) is irrelevant in a JS environment.
- All 14 can be safely stubbed as no-ops for browser execution.

## Artifacts

- `probe-phase311-zero-caller-vectors.mjs` — the analysis probe
- This report

# Phase 458 - 0x03CF7D Event Loop Dispatch Static Map

This report was written from direct ADL-mode ROM disassembly captured while building [`probe-phase458-trace-03CF7D.mjs`](./probe-phase458-trace-03CF7D.mjs). The probe is the reproducible artifact. This subagent did not execute the new file after writing it.

## Bottom Line

1. **How large is this function?**
   The contiguous dispatcher core spans **`0x03CF7D-0x03D1BC`**, which is **`0x240` bytes (576 bytes)**. The control-flow walk also reaches an internal helper at **`0x03D1C3-0x03D1D1`** via `CALL NZ,0x03D1C3`, so the mapped dispatcher-plus-helper span is effectively **`0x03CF7D-0x03D1D1`** or **`0x255` bytes (597 bytes)**. Within that span, the core flow contains **268 reachable instructions** before any out-of-range callees are previewed.

2. **Does it contain the polling loop (`0x003D6B`)?**
   **No, not directly.** The `0x03CF7D` dispatcher core does not `CALL` or `JP` to `0x003D5A`, `0x003D6B`, or the old `_GetCSC` polling loop. The first keyboard-adjacent direct callee here is **`0x03F994`**, not `0x003D5A`.

3. **Does it reference the hardware scanner (`0x003C63`)?**
   **No direct reference was found** in the mapped core or the first-level callee previews. The `0x003C63/0x003D6B` path belongs to the earlier foreground key scanner / poller path, not to the `0x03CF7D` ISR dispatcher body itself.

4. **What is the main control flow?**
   It is a **three-stage interrupt/status-port demultiplexer**:
   - `0x03CF7D` starts with `.SIS LD BC,0x5016 ; IN A,(C)` and handles the first status byte.
   - If that byte is zero, it falls to `0x03CFA4` (`BC=0x5015`) for the next status byte.
   - If that is zero too, it falls to `0x03CFCF`, which decrements `C` and reads `0x5008`.
   - Each stage acknowledges the active bit by writing to the same `0x50xx` port block, validates `B==0x50` and the expected `C` value, then jumps into a specific handler block.
   - Most handlers return through the shared epilogue at **`0x03D0E0`** (`POP HL -> LD (0xD02AD7),HL -> restore IY/IX -> EI -> RETI`).
   - The keyboard-specific exit path is **`0x03D184-0x03D1BC`**, which clears the enable-mask bit at `0x5006` and ends in `RETI`.

5. **What CALL targets are there, and which ones relate to key processing?**

| Call Site | Target | Role | Key relevance |
| --- | --- | --- | --- |
| `0x03D048` | `0x03D1C3` | Internal deferred-countdown helper (`D005F5`) | Indirectly key/timer related |
| `0x03D054` | `0x03F994` | `KbdScan` / debounce helper | **Yes** |
| `0x03D05C` | `0x05C623` | Cursor blink helper (`D00594`, IY flags) | UI/input-adjacent |
| `0x03D0A1` | `0x040D11` | Writes `D00590/D00591` state bytes | UI/input-adjacent |
| `0x03D0AF` | `0x0404EC` | Status / callback gate | Not obviously key-buffer related |
| `0x03D10A` and `0x03D123` | `0x02510E` | Port `0x7034` transfer helper | Not directly key-buffer related |
| `0x03D139` | `0x0BCC81` | `D14038/D1407x` helper | Not directly key-buffer related |
| `0x03D14F` | `0x05F685` | Display callback wrapper -> `0x000580 -> 0x010220` | Display-side |
| `0x03D165` | `0x049526` | Mode-gated helper that reads `D177B7` | **Yes, mode/input gating** |
| `0x03D17C` | `0x04C6A3` | Mode/state dispatch helper | Possibly mode/input-adjacent |
| `0x03D0C4` | `0x0300A1` | Port/status helper | Housekeeping |
| `0x03D0C8` | `0x0003CC` | Vector wrapper (`JP 0x003C4B`) | Housekeeping |

6. **How does it connect to `0x03D033` from session 457?**
   `0x03D033` is inside the **`0x03D029` branch**, which is reached from the third status-byte fan-out:
   - `0x03CFCF` reads `0x5008`
   - successive `RRA` tests branch to one of `0x03D002`, `0x03D0F7`, `0x03D110`, `0x03D129`, or **`0x03D029`**
   - `0x03D029` writes `0x10` to the port block, checks `B==0x50`, and lands at **`0x03D033`**
   - from there it immediately checks `C==0x08`, then reads and decrements **`0xD02651`** at `0x03D038/0x03D040`, conditionally calls `0x03D1C3`, and continues through more housekeeping before `0x03D0E0`

   So the session-457 final PC was not random. It had already entered the **timer/countdown service branch** inside the dispatcher and was sitting at the validation point immediately before the `D02651` decrement path.

## Core Branch Map

### Stage A: `0x03CF7D` - status byte at `0x5016`

- `.SIS LD BC,0x5016`
- `IN A,(C)`
- If zero: `JR Z,0x03CFA4`
- Non-zero cases branch to:
  - `JP C,0x03D16D`
  - later `JP C,0x03D184`
- Otherwise acknowledge and fall to `JP 0x03D0E0`

### Stage B: `0x03CFA4` - status byte at `0x5015`

- `.SIS LD BC,0x5015`
- `IN A,(C)`
- If zero: `JR Z,0x03CFCF`
- Non-zero cases branch to:
  - `JP C,0x03D184`
  - `JP C,0x03D155`
  - `JP C,0x03D13F`
- Otherwise acknowledge and fall to `JP 0x03D0E0`

### Stage C: `0x03CFCF` - status byte at `0x5008`

- `DEC C ; IN A,(C)`
- If zero: `JR Z,0x03CFFE`
- Non-zero cases branch to:
  - `JP C,0x03D002`
  - `JP C,0x03D0F7`
  - `JP C,0x03D110`
  - `JP C,0x03D129`
  - `JP C,0x03D029`
- Otherwise acknowledge and fall to `JP 0x03D0E0`

## Requested RAM References

These are the specific addresses requested in the prompt.

| Address | Seen in dispatcher core? | Seen in first-level callee preview? | Notes |
| --- | --- | --- | --- |
| `0xD00587` | No | **Yes** (`0x03F9FA`, `0x03FA09`) | Accessed by direct callee `0x03F994` (`KbdScan`) |
| `0xD0058D` | No | No | Not seen in the mapped slice |
| `0xD141B5` | No | No | Not seen in the mapped slice |
| `0xD14091` | No | No | Not seen in the mapped slice |
| `0xD177B7` | No | **Yes** (`0x04953B`) | Accessed by direct callee `0x049526` |
| `0xD1441D` | No | No | Not seen in the mapped slice |

Other important RAM touched directly by the dispatcher core:

- `0xD02651` at `0x03D038/0x03D040` - 8-bit countdown used by the `0x03D029` branch
- `0xD00590` / `0xD00591` - state bytes used in the same branch and in callee `0x040D11`
- `0xD02AD7` - callback pointer restored by the common epilogue
- `0xD00080` - system flags base reloaded into `IY`
- `0xD005F5` - deferred countdown byte used by helper `0x03D1C3`

## Polling Loop and Hardware Scanner

The prompt asked whether `0x03CF7D` contains the earlier keyboard poller (`0x003D6B`) and hardware scan routine (`0x003C63`). The short answer is **no**:

- no direct `CALL` or `JP` to `0x003D5A`, `0x003D6B`, `0x003C63`, or `0x003CC2` appears in the mapped dispatcher core
- the dispatcher's keyboard-adjacent work is routed through `0x03F994`, not the old `0x003D5A` foreground scanner
- that matches the session-457 sequence: the `0x003D6B` polling loop is part of the earlier `_GetCSC` path, while `0x03D033` belongs to the later `0x03CF7D` status-port dispatch body

So the broader event-loop path may contain both regions, but they are **different stages**, not one contiguous function body.

## Computed Jumps / Dispatch Tables

No computed `JP (HL)` / `JP (IX)` / `JP (IY)` style transfer was encountered in the first 300 decoded instructions. The dispatch in `0x03CF7D` is an explicit hand-written branch fan-out based on rotated status bits.

The nearest table-like behavior appears one level deeper in the display path:

- `0x03D14F -> CALL 0x05F685`
- `0x05F685 -> CALL 0x000580`
- `0x000580 -> JP 0x010220`

That is a vector/callback dispatch outside the core `0x03CF7D` body, not a computed jump inside it.

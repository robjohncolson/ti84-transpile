# Phase 321 - LCD Synchronization Function 0x010A3C

## Context

Phase 319 already established that vectors `224-252` are a low-ROM display cluster. This report isolates the shared leaf at `0x010A3C`, which is called by **12** of those display-vector implementations before they touch the `0x8000-0x8040` LCD port block.

The important result is that `0x010A3C` is not itself a direct `IN`/`IN0` routine. It is a **generic masked busy-wait wrapper** around helper `0x007B05`, and `0x007B05` is the routine that actually reads the LCD status port.

## 1. Full Disassembly of 0x010A3C

| Address | Bytes | Disassembly | Meaning |
|---|---|---|---|
| `0x010A3C` | `CD 8A 21 00` | `CALL 0x00218A` | ZDS frame helper; sets up `IX`, so the first byte argument is at `IX+6`. |
| `0x010A40` | `CD 05 7B 00` | `CALL 0x007B05` | Read LCD sync/status port. |
| `0x010A44` | `47` | `LD B,A` | Save returned status byte. |
| `0x010A45` | `DD 7E 06` | `LD A,(IX+6)` | Load caller-supplied wait mask. |
| `0x010A48` | `A0` | `AND B` | Compute `mask & status`. |
| `0x010A49` | `20 F5` | `JR NZ,0x010A40` | If any masked bit is still set, keep polling. |
| `0x010A4B` | `DD F9` | `LD SP,IX` | Epilogue. |
| `0x010A4D` | `DD E1` | `POP IX` | Epilogue. |
| `0x010A4F` | `C9` | `RET` | Return when masked bits are all clear. |

### Pseudocode

```c
void lcd_sync(uint8_t mask) {
  do {
    uint8_t status = read_port_8040();
  } while ((status & mask) != 0);
}
```

There is **no timeout**, **no decrementing counter**, and **no alternate exit path**.

## 2. Port Identification

`0x010A3C` itself contains no `IN` or `IN0`. The actual poll happens in helper `0x007B05`:

| Address | Bytes | Disassembly |
|---|---|---|
| `0x007B05` | `01 40 80 00` | `LD BC,0x008040` |
| `0x007B09` | `ED 78` | `IN A,(C)` |
| `0x007B0B` | `F5` | `PUSH AF` |
| `0x007B0C` | `78` | `LD A,B` |
| `0x007B0D` | `FE 80` | `CP 0x80` |
| `0x007B0F` | `28 01` | `JR Z,0x007B12` |
| `0x007B11` | `CF` | `RST 0x08` |
| `0x007B12` | `79` | `LD A,C` |
| `0x007B13` | `FE 40` | `CP 0x40` |
| `0x007B15` | `20 FA` | `JR NZ,0x007B11` |
| `0x007B17` | `F1` | `POP AF` |
| `0x007B18` | `C9` | `RET` |

### Port

- The helper loads `BC = 0x008040` and then executes `IN A,(C)`.
- In the current JS emulator, `peripherals.js` normalizes ports with `port & 0xffff`, so the effective bus key is **`0x8040`**.
- This is the **only** port polled by the sync loop.

### Bits Tested

The function does **not** hardcode a single bit test. It tests whatever bits the caller places in the mask byte at `IX+6`.

Observed masks from the 12 vector callers:

| Mask | Bits waited on | Vectors |
|---|---|---|
| `0xFF` | bits `0-7` | `228`, `229`, `244` |
| `0xF0` | bits `4-7` | `230`, `246` |
| `0x70` | bits `4-6` | `235`, `236`, `237`, `247` |
| `0x07` | bits `0-2` | `238`, `239`, `245` |

So the exit condition is always:

```text
(read_port_8040() & caller_mask) == 0
```

## 3. Loop Structure

The busy-wait loop is:

1. `CALL 0x007B05` to sample port `0x8040`
2. Save the returned byte in `B`
3. Reload the caller mask from `IX+6`
4. `AND` the mask with the sampled status
5. `JR NZ,0x010A40`

Properties:

- **Loop body**: 4 instructions after the helper call
- **Back-edge**: one conditional branch, `JR NZ,0x010A40`
- **Timeout**: none
- **Counter**: none
- **Exit**: only when all masked bits are zero

This is a pure spin barrier. If the port never returns a matching ready state, the caller never returns.

## 4. Caller Analysis

These are the **12 direct callers** found by scanning the ROM for `CALL 0x010A3C` (`CD 3C 0A 01`). They correspond to 12 low-ROM display vectors from the phase 319 display cluster.

| Vec | Stub | Impl | Call site | Mask | Likely display operation |
|---:|---|---|---|---|---|
| 228 | `0x000590` | `0x010A94` | `0x010AAE` | `0xFF` | Broad LCD control reconfiguration: clears bit 4 on port `0x5005`, waits for full idle, then updates several control bits on port `0x8020` via helpers `0x007D19/03/B1/9D`. |
| 229 | `0x000594` | `0x010701` | `0x010718` | `0xFF` | Table-driven 3-byte LCD parameter write: computes a clamped 12-byte-stepped offset, writes values to ports `0x8024/0x8028/0x802C`, then sets control bit 6 (`0x007D93`). |
| 230 | `0x000598` | `0x0107AC` | `0x0107C0` | `0xF0` | Buffer/window gate around `D177FC` and `D177CC`; it waits on the high nibble before doing its table/position clamp logic. |
| 235 | `0x0005AC` | `0x010466` | `0x010473` | `0x70` | LCD status/parameter query: reads ports `0x8000` and `0x8004`, uses `0x8008` plus `D177E3` state to derive a third returned byte. |
| 236 | `0x0005B0` | `0x010403` | `0x01040C` | `0x70` | Reads a 3-byte LCD parameter/status triple from ports `0x8000/0x8004/0x8008` into caller-provided pointers. |
| 237 | `0x0005B4` | `0x01042E` | `0x010437` | `0x70` | Writes a 3-byte LCD parameter triple to ports `0x8024/0x8028/0x802C`, then commits it by setting control bit 6 on `0x8020`. |
| 238 | `0x0005B8` | `0x0104CC` | `0x0104D5` | `0x07` | Reads a second 3-byte LCD parameter/status bank from ports `0x8010/0x8014/0x8018`. |
| 239 | `0x0005BC` | `0x0104F7` | `0x010500` | `0x07` | Writes the `0x8010/0x8014/0x8018` bank after clearing control bit 5, then restores related display state/flags. |
| 244 | `0x0005D0` | `0x0103A4` | `0x0103A9` | `0xFF` | Full-idle wait before toggling control bit 5 on `0x8020` and resetting callback/display bookkeeping (`D177E1`, `D177D7`). |
| 245 | `0x0005D4` | `0x010553` | `0x01055C` | `0x07` | Writes the `0x8010/0x8014/0x8018` bank after clearing control bit 5; a simpler version of vec239 without the extra flag restore. |
| 246 | `0x0005D8` | `0x01058B` | `0x010594` | `0xF0` | Mode-enable dispatcher: selected cases set bits `1/2/3/4` on control port `0x8020` and mirror those mode bits into `D177D7`. |
| 247 | `0x0005DC` | `0x01061D` | `0x010626` | `0x70` | Mode-disable dispatcher: selected cases clear bits `1/2/3` on control port `0x8020` and clear the matching `D177D7` flags. |

### Pattern

The 12 callers fall into three obvious groups:

- **Full-byte / high-nibble waits** before broader control or mode changes: vec `228`, `229`, `230`, `244`, `246`, `247`
- **`0x70` waits** before the `0x8000/0x8004/0x8008` and `0x8024/0x8028/0x802C` bank
- **`0x07` waits** before the `0x8010/0x8014/0x8018` bank

That strongly suggests `0x8040` is a shared LCD status register whose different bit groups gate different sub-banks of LCD control/data ports.

## 5. Peripheral Implications for `peripherals.js`

`peripherals.js` currently returns `0xFF` for unregistered ports. That is fatal here:

- `0x010A3C` loops while `(status & mask) != 0`
- all 12 callers use masks with at least one bit set
- so `0xFF` causes an **infinite loop** for every caller family

### Required ready value

For this sync point, the polled port must eventually read as:

- **`0x00`** for a universal "ready" state

That is the only value guaranteed to satisfy all observed masks:

- `0xFF` callers require `status == 0x00`
- `0xF0` callers require `(status & 0xF0) == 0`
- `0x70` callers require `(status & 0x70) == 0`
- `0x07` callers require `(status & 0x07) == 0`

### Practical emulator recommendation

If the goal is simply to avoid deadlock, register port **`0x8040`** so reads return `0x00`.

If the goal is a slightly more realistic busy/ready model, the port may transiently return nonzero busy bits, but it must eventually settle to a value whose masked bits are all clear. Because some callers use `0xFF`, the safest idle value is still `0x00`.

## Bottom Line

`0x010A3C` is the display subsystem's shared LCD spin-wait barrier:

- it polls **port `0x8040`** indirectly through `0x007B05`
- it uses a **caller-supplied bitmask**
- it has **no timeout**
- and in the current emulator the correct "ready" return is **`0x00`**, not the default unhandled-port value `0xFF`

That is why this routine shows up as the central synchronization point for the low-ROM display vector cluster.

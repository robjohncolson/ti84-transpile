# Phase 310: CheckIfEmulated Implication for Transpilation

## ROM byte confirmation

- `ROM[0x7E] = 0xFF` in `TI-84_Plus_CE/ROM.rom`.
- `0x000578` is just `jp 0x0158A6`.
- `0x0158A6` does `ld a,(0x00007E)` then `cp 0xFF`, so this ROM always returns `Z=1` from `CheckIfEmulated`.
- Phase 309 reported 76 raw-ROM callers. Grepping `TI-84_Plus_CE/ROM.transpiled.js` surfaced 73 unique lifted call addresses; the table below uses representative lifted callers from that set.

## Representative callers from `ROM.transpiled.js`

Real-hardware path below means the path taken today with `ROM[0x7E] == 0xFF`. Emulated path means the opposite branch that would run if the transpiler forced `ROM[0x7E] != 0xFF`.

| Call site | Real-hardware path (`Z`) | Emulated path (`NZ`) | What changes |
| --- | --- | --- | --- |
| `0x022317` | Returns immediately. | Pushes `HL`, loads `A=0x02`, points `HL` at `IX-3`, calls `0x0236F9`. | Emulated mode enables a helper/dispatch path instead of a no-op return. |
| `0x022347` | Returns immediately. | Reads `(HL)`, zero-extends it into `HL`, calls `0x022359`. | Emulated mode performs a data-driven lookup/transform that real hardware skips. |
| `0x02250C` | Returns immediately. | Checks `D007E0` against `0x55`; if it matches, uses `HL=0x0BBFBE`, otherwise calls `0x088F0A`. | Emulated mode enables alternate signature/config handling. |
| `0x02254C` | Returns immediately. | Reads `D008DF`, stores it at `IX-1`, sets `A=0x0A`, calls `0x0236F9`. | Emulated mode pulls extra RAM state into a helper path. |
| `0x0225ED` | Clears `(IY+93).bit0` and returns. | First checks `(IY+68).bit5` and `(IY+93).bit0`; only if both are clear does it continue into the longer handler. | Emulated mode gates cleanup behind extra runtime flags. |
| `0x02269C` | Returns immediately. | Checks `(IY+68).bit5`; if clear, reads pointer `D00687`, copies bytes/pointer into the local frame, calls `0x0236F9` with `A=0x1E`. | Emulated mode reconstructs state from RAM and calls the helper. |
| `0x02280A` | Returns immediately. | Checks `(IY+68).bit5`; if clear, sets local byte `0x03`, branches on `A==0x15`, and continues longer subtype logic. | Emulated mode enables subtype-specific processing. |
| `0x022CE5` | Returns immediately. | Checks `D007E0 == 0x49`; if true, loads `{C,IX}` from `D02500/D02501` and calls `0x0B205F`. | Emulated mode enters a table/object lookup path from RAM. |
| `0x0230A5` | Returns immediately. | Copies 9-byte records from `D005F8`, `D0146E/F`, and `D014FE/F` into locals, updates `D005F9`, and calls `0x0846EA` twice. | Emulated mode performs explicit state packaging/snapshot work. |
| `0x025691` | Programs `F20030/F20010/F20014/F20031/F20038`, toggles IY flags, then returns. | Skips all of that register programming and returns immediately. | Emulated mode bypasses low-level hardware-register init. |
| `0x0256EB` | Writes `F20030`, `F00008`, `F00004`, copies 4 bytes to `F20010`, clears `(IY+27).bit3`, then joins a shared tail. | Skips straight to the shared tail that loads `D02FEC/D02FEF`. | Emulated mode avoids another hardware-setup sequence. |
| `0x0453C5` | Keeps the computed `B` value. | Forces `B=0x0C` before joining the common tail. | Emulated mode changes a small selector/stride constant. |
| `0x04AB81` | Dispatches through `RST 0x30`. | Does direct `in a,(0x00)` and returns based on the port value. | Emulated mode replaces a helper/service path with direct port polling. |
| `0x04AC10` | Calls helper `0x02F881`. | Does direct `in a,(0x04)` and returns. | Emulated mode swaps helper logic for a raw port read. |
| `0x04AF27` | Reads page-0 port `0x0F`, tests bit 7, and continues with more logic. | Does direct `in a,(0x30)` and returns. | Emulated mode uses a simpler but different hardware sampling path. |

## Categories

1. **Fast-return on real hardware, longer helper path in emulated mode**
   Most lifted callers in the `0x0223xx` to `0x0236xx` range work like this. The current ROM takes the short `jr/jp z` exit; forcing emulated mode would activate more work: helper calls (`0x0236F9`, `0x0846EA`, `0x0B205F`), pointer chasing, RAM copies, and extra flag/signature checks.

2. **Skip low-level register init in emulated mode**
   The clearest examples are `0x025691` and `0x0256EB`. Their real-hardware path touches `F200xx` and `F000xx` registers and flips IY flags; emulated mode skips or short-circuits that work.

3. **Replace helper/RST paths with direct port reads**
   The `0x04AB81` to `0x04AF27` cluster is the opposite shape: real hardware uses helpers, `RST 0x30`, or more involved logic, while emulated mode reads ports directly (`0x00`, `0x04`, `0x30`, and nearby ports in the same cluster).

4. **Small constant/selector changes**
   `0x0453C5` shows that some callers do not switch whole subsystems; they just tweak a register value (`B=0x0C`) under emulated mode.

## Assessment

- In the lifted transpiled artifact, **57 of the 73 unique call sites branch on `Z`**, so the current ROM value takes the real-hardware path and the flipped value would activate a larger alternate path.
- Only **16 of 73** use the opposite polarity (`jr/jp nz`), where emulated mode skips work or swaps in a direct port-read path.
- That means a global flip would not just "avoid hardware-only init." In the majority of visible callers it would instead enable **more** code, not less.

## Recommendation

**Do not globally flip `ROM[0x7E]` for transpilation.**

Why:

- The biggest visible effect is not safer JS behavior; it is wide control-flow divergence into longer, less-proven alternate paths.
- Those alternate paths depend on specific RAM signatures and flags such as `D007E0 == 0x55/0x49`, `(IY+68).bit5`, `(IY+93).bit0`, pointers in `D00687`, and records in `D02500`, `D0146E/F`, and `D014FE/F`.
- Several emulated-mode callers switch to direct `IN` reads from hardware ports. If the JS runtime does not model those ports accurately, behavior will drift immediately.
- The current ROM image was built with `ROM[0x7E] == 0xFF`, so the non-`0xFF` paths are effectively cold paths for this specific OS image.

Potential benefit:

- The `0x0256xx` callers show a real benefit: emulated mode can bypass `F200xx`/`F000xx` register programming that may be meaningless or risky in a browser/runtime environment.

Best next step:

- If the transpiled runtime is hanging on a specific hardware-init sequence, patch that specific site or emulate the needed `F200xx`/port behavior.
- A targeted override around the `0x025691` / `0x0256EB` cluster is much lower risk than globally pretending the whole ROM is running in emulator mode.

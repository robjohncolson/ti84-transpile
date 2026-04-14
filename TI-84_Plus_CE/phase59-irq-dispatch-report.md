# Phase 59 IRQ Dispatch Report

## How Status Bits Were Forced

- `peripherals.js` does define the FTINTC fields we needed, but they stay closure-local:
  - `intcState.rawStatus`
  - `intcState.enableMask`
- The bus only exports `read()`, `write()`, `register()`, `getState()`, and `setKeyboardIRQ()`. There is no public API that lets a probe directly poke byte0/byte1 masked-status bits.
- Because of that, `probe-irq-dispatch-trace.mjs` installs a shadow FTINTC handler over ports `0x5000-0x501F` with `peripherals.register(...)`.
- Before each IRQ injection, the probe rearms the shadow controller with:
  - `rawStatus = targetMask`
  - `enableMask = targetMask`
- That makes `0x5014`, `0x5015`, and `0x5016` return the exact masked byte requested for the pass, while still honoring the OS acknowledge writes to `0x5008`, `0x5009`, and `0x500A`.
- A true direct poke would require `createPeripheralBus()` to expose `intcState` or add a debug helper such as `debugSetIntcState()` / `debugSetMaskedStatus()`.

## Probe Command

```text
node TI-84_Plus_CE/probe-irq-dispatch-trace.mjs
```

## Output Snippet

```text
=== Setup ===
boot: steps=8804 termination=halt lastPc=0x0019b5 lastMode=adl
init: steps=691 termination=missing_block lastPc=0xffffff lastMode=adl

[C irq 1] inject resumePc=0x0019b5 byte0=0x00 byte1=0x10 byte2=0x00
[C irq 1] block 0x0019be adl
[C irq 1] block 0x0019c6 adl
[C irq 1] block 0x001a8d adl
[C irq 1] block 0x001a98 adl
[C irq 1] block 0x010220 adl
[C irq 1] block 0x002197 adl
[C irq 1] missing 0xffffff adl
[C irq 1] result steps=35 termination=missing_block lastPc=0xffffff vramWrites=0 stackDepth=0x000016 maskedAfter=0x000000

[E irq 1] inject resumePc=0x0019b5 byte0=0x08 byte1=0x00 byte2=0x00
[E irq 1] block 0x0019be adl
[E irq 1] block 0x0019ef adl
[E irq 1] block 0x0019f4 adl
[E irq 1] block 0x001aa3 adl
[E irq 1] block 0x001aae adl
[E irq 1] block 0x014dab adl
[E irq 1] block 0x002197 adl
[E irq 1] block 0x001ab7 adl
[E irq 1] block 0x001a32 adl
[E irq 1] result steps=39 termination=halt lastPc=0x0019b5 vramWrites=0 stackDepth=0x000000 maskedAfter=0x000000

=== Verdict ===
mostVRAMWrites=Pass C: byte1 bit4 -> 0x001A8D -> 0x010220 vramWrites=0 newBeyond56C=26 deepestNewPc=0x010264
```

## Per-Pass Results

| Pass | Forced masked byte | Result | New blocks beyond Phase 56C | Missing blocks | VRAM writes | Key hot blocks / follow-up |
| --- | --- | --- | ---: | ---: | ---: | --- |
| A | `0x5015 = 0x40` | `5/5` clean halts | 5 | 0 | 0 | `0x001A4B -> 0x001A56 -> 0x001A5B -> 0x001A32` |
| B | `0x5015 = 0x20` | `5/5` clean halts | 11 | 0 | 0 | Reached `0x009B35`; next blocks were `0x009B45 -> 0x009B4A -> 0x009C16 -> 0x001A8B -> 0x001A32`. Final shadow `enableMask` ended at `0x000000`, matching the expected bit5 mask clear. |
| C | `0x5015 = 0x10` | `0/1`, unwound on first pass | 26 | 1 (`0xffffff`) | 0 | Reached `0x010220`; next blocks were `0x002197 -> 0x010228 -> 0x010231 -> 0x007DC7 -> 0x007DD4 -> 0x007DD9 -> 0x010235 -> 0x010241`. Expected `0x001AA1` / `0x001A32` never came back. |
| D | `0x5015 = 0x04` | `5/5` clean halts | 8 | 0 | 0 | `0x001ABB -> 0x001AC6 -> 0x001ACB -> 0x001A32` |
| E | `0x5014 = 0x08` | `5/5` clean halts | 17 | 0 | 0 | Reached `0x014DAB`; next blocks were `0x014DD0 -> 0x014E20 -> 0x014D48 -> 0x002197 -> 0x014D50 -> 0x014D59 -> 0x014DA6 -> 0x014E29`. `0xD14038` wrapped and incremented from `0xFFFFFF` to `0x000004`. |
| E bonus | `0x5014 = 0x08`, plus `0xD1407B = 0`, `0xD1408D = 0` | `5/5` clean halts | 19 | 0 | 0 | Same `0x014DAB` path, but the first new blocks shifted to `0x014DC2 -> 0x014DC9 -> 0x014DD0`. This is the deepest stable branch variant. `0xD14038` still ended at `0x000004`. |
| F | `0x5014 = 0x10` | `5/5` clean halts | 7 | 0 | 0 | `0x001ACF -> 0x001AD9 -> 0x001ADE -> 0x001AF2 -> 0x001A32`. `0xD02658` decremented `0xFFFFFF -> 0xFFFFFA`; `0xD02651` decremented `0xFF -> 0xFA`. |

## Which Pass Unlocked The Most Code

- **Most stable new coverage:** `Pass E bonus`
  - 19 new blocks beyond Phase 56C
  - deepest stable PC: `0x014E3D`
  - no missing blocks
- **Largest raw new-block count:** `Pass C`
  - 26 new blocks beyond Phase 56C
  - but it never returned to `0x001AA1` / `0x001A32`
  - it unwound into a missing `0xFFFFFF` target after `0x010220 -> 0x002197`
- **Most VRAM writes:** no winner
  - every pass wrote **0** VRAM bytes

## What The Dormant Paths Actually Did

- Byte1 bit6 is pure acknowledge / bookkeeping. It opens only the short `0x001A4B` branch and returns.
- Byte1 bit5 is also service bookkeeping. It does reach `0x009B35`, which clears byte1 enable bit5 and returns, but still no display activity.
- Byte1 bit4 is the only byte1 source that blows the current stack model up. `0x010220` is a real trampoline and wants a more faithful caller frame than the synthetic IRQ return stack currently provides.
- Byte0 bit3 is the most interesting service path:
  - it reliably reaches `0x014DAB`
  - it mutates `0xD14038` every injection
  - forcing `0xD1407B = 0` and `0xD1408D = 0` unlocks two extra blocks (`0x014DC2`, `0x014DC9`)
- Byte0 bit4 looks like timer/counter maintenance, not rendering:
  - it only decremented `0xD02658` and `0xD02651`
  - it never escaped the local `0x001ACF` path

## Recommended Next Seeds

1. Fix the `0x010220` caller frame.
   The current real-return-frame IRQ model is enough for the stable event loop, but not enough for the stack-adjust trampoline. The next probe should capture or reconstruct the actual `IX/SP` frame that lets `0x002197` return to `0x001AA1` instead of unwinding to `0xFFFFFF`.

2. Stay on byte0 bit3 and push deeper into `0x014DAB`.
   `Pass E bonus` is the best stable seed. The next values to try are around `0xD14038 ~= 0x0007D0`, since Phase 58 flagged that compare as the next likely gate after the `0xD1407B` / `0xD1408D` zero checks.

3. Use small counter seeds on byte0 bit4 only if the goal is to understand timer housekeeping.
   `0xD02651 = 0x01` and tiny `0xD02658` values should expose the immediate-exit variants, but this path still looks much less likely to reach rendering than byte0 bit3.

## Verdict

No forced IRQ source in Phase 59 produced VRAM activity.

The best render-adjacent source is still **byte0 bit3 (`0x5014` bit3)**:

- it is the only stable dormant branch that reaches a substantial service function (`0x014DAB`)
- it mutates a rolling state counter (`0xD14038`)
- zeroing `0xD1407B` and `0xD1408D` clearly opens deeper logic

The byte0 bit4 source is real, but it only behaved like a decrementing timer/counter path. The byte1 sources are service/ack paths, except for byte1 bit4, which currently escapes through the `0x010220` trampoline before returning to the event-loop epilogue.

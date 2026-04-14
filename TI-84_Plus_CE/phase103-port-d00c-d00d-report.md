# Phase 103 - Port `0xD00C` / `0xD00D` Hardware Semantics

## Short answer

Best public evidence says the idle TI-84 Plus CE SPI status is:

- `0xD00C = 0x02`
- `0xD00D = 0x00`

So the current stub in `TI-84_Plus_CE/peripherals.js` is only half-right. Returning `0x00` for `0xD00D` is consistent with an idle SPI controller, but returning `0x00` for `0xD00C` is not. Real idle hardware reports bit 1 set at `0xD00C`, meaning "send FIFO not full".

`0xD00D` is not documented as a separate named port. It is the second byte of the 32-bit SPI status register that starts at `0xD00C`.

## Current stub under review

The current handler is a shared constant-return stub:

- `TI-84_Plus_CE/peripherals.js`, `createPhase99CPollUnlockHandler()`
- Registered for both `0xD00C` and `0xD00D`
- Returns `0x00` for every read

That matches the earlier Phase 99C experiment, but not the documented SPI status register.

## 1. What real hardware returns

### WikiTI evidence

WikiTI documents `D000` as the CE SPI controller and `D00C` as its status register:

- `D00C` is a read-only status register.
- Default value is `0x00000002`.
- Bit 1 means "send FIFO is not full".
- Bit 2 means "data is being sent or received".
- Bits 12-16 hold the queued send FIFO entry count.

Source:

- https://wikiti.brandonw.net/index.php?title=84PCE:Ports:D000

That implies these byte reads when the controller is idle:

- `0xD00C` is the low byte of `0x00000002`, so it reads `0x02`.
- `0xD00D` is the next byte of `0x00000002`, so it reads `0x00`.

WikiTI does not give `0xD00D` its own standalone page. The exact `0xD00D` meaning is therefore undocumented as a separate port, but it is strongly implied by the documented 32-bit register at `D00C`.

### CEmu evidence

CEmu models the same register as a 32-bit SPI `STATUS` register at offset `0x0C`:

- `core/spi.c#L164-L215`
- `core/spi.c#L285-L289`
- `core/spi.h#L14-L16`

Relevant links:

- https://github.com/CE-Programming/CEmu/blob/73a4cb0c1ae2a9d5c8d70ccb5f02c5705ad1871b/core/spi.c#L164-L215
- https://github.com/CE-Programming/CEmu/blob/73a4cb0c1ae2a9d5c8d70ccb5f02c5705ad1871b/core/spi.c#L285-L289
- https://github.com/CE-Programming/CEmu/blob/73a4cb0c1ae2a9d5c8d70ccb5f02c5705ad1871b/core/spi.h#L14-L16

CEmu computes:

```c
STATUS = spi.tfve << 12
       | spi.rfve << 4
       | (spi.transferBits != 0) << 2
       | (spi.tfve != SPI_TXFIFO_DEPTH) << 1
       | (spi.rfve == SPI_RXFIFO_DEPTH) << 0;
```

and then returns the requested byte with:

```c
shift = (addr & 3) << 3;
return value >> shift;
```

After `spi_reset()`, CEmu zeroes the whole SPI state. With `SPI_TXFIFO_DEPTH = 16` and `SPI_RXFIFO_DEPTH = 16`, idle status becomes:

- `tfve = 0`
- `rfve = 0`
- `transferBits = 0`
- `STATUS = 0x00000002`

So CEmu agrees with WikiTI:

- `0xD00C -> 0x02`
- `0xD00D -> 0x00`

### Practical semantics

The important part for the boot loop is:

- `0xD00C` is dynamic, not constant. Idle is `0x02`, busy is typically `0x06` or another value with bit 2 set.
- `0xD00D` is also dynamic. Idle is `0x00`, but its high nibble becomes nonzero when queued send FIFO entries remain because it exposes status bits 12-15.

## 2. What the poll loop at `0x006138` is testing

The local disassembly in `TI-84_Plus_CE/ROM.transpiled.js` shows:

```asm
0x006133  push bc
0x006134  ld bc, 0x00d00d
0x006138  in a, (c)
0x00613a  and 0xf0
0x00613c  jr nz, 0x006138
0x00613e  dec c
0x00613f  in a, (c)
0x006141  bit 2, a
0x006143  jr nz, 0x00613f
0x006145  pop bc
0x006146  ret
```

The corresponding lifted blocks are:

- `block_006133_adl`
- `block_006138_adl`
- `block_00613e_adl`
- `block_006145_adl`

Plain-English decode:

1. Load `BC = 0x00D00D`.
2. Poll `0xD00D` until `(A & 0xF0) == 0`.
3. Decrement `C`, so the next port is `0xD00C`.
4. Poll `0xD00C` until bit 2 clears.
5. Return.

Using the documented SPI register layout, that means:

- First loop: wait until SPI status bits 12-15 are zero.
- Second loop: wait until SPI status bit 2 is zero.

WikiTI says boot code waits for exactly those conditions on the SPI status register: first the queued send FIFO count bits, then the busy bit. So the loop is not checking an "unlock" register. It is waiting for the SPI/LCD controller to go idle.

The best plain-English description is:

> Wait until the SPI transmit FIFO is drained, then wait until the SPI controller is no longer actively sending or receiving.

## 3. Is the current `0x00` stub safe?

### For this exact boot poll

Yes.

Why:

- `0xD00D = 0x00` makes `(A & 0xF0) == 0` immediately true.
- `0xD00C = 0x00` makes bit 2 clear immediately.

So the loop at `0x006138..0x006145` exits exactly as intended.

### As a hardware-faithful answer

No.

Why:

- Real idle `0xD00C` should be `0x02`, not `0x00`.
- `0x00` incorrectly reports bit 1 clear, which means "send FIFO not full" is false.
- Any later code that polls bit 1 before writing to the SPI data register would think the FIFO is full forever.

So the current stub is:

- Safe as a narrow boot-loop unblocker.
- Unsafe as a general SPI status emulation.

### What would actually break later

The most likely break is any code that uses `0xD00C` bit 1 as a ready/space-available test. On real hardware, idle status says "yes, you can queue more transmit data" by returning `0x02`. The stub returns `0x00`, which says the opposite.

I did not find a direct later call site in this repo that already depends on bit 1, so I cannot point to a currently failing path here. But from the documented register semantics, that is the first behavior this stub would misreport.

## 4. Recommended handler update

Do not keep the TODO as "unknown semantics". The register is not unknown enough anymore.

### Minimal accurate-enough fix

If you want the smallest change that keeps boot working and matches idle hardware better, replace the shared constant `0x00` behavior with:

- `0xD00D -> 0x00`
- `0xD00C -> 0x02`

Proposed diff:

```diff
 function createPhase99CPollUnlockHandler() {
   return {
-    read() {
-      return 0x00;
+    read(port) {
+      // TI-84 Plus CE SPI status register at D00C..D00F.
+      // Public docs + CEmu agree that idle status is 0x00000002:
+      // D00C = 0x02 (TX FIFO not full), D00D = 0x00.
+      if (port === 0xd00d) {
+        return 0x00;
+      }
+
+      return 0x02;
     },

     write() {},
   };
 }
```

### Better long-term fix

Long-term, this should stop being a special "phase99c unlock" handler and become a real SPI status model for the `D000` register block. The boot loop is reading normal SPI status, not a one-off escape hatch.

## Verdict

- `0xD00D` idle value: `0x00`
- `0xD00C` idle value: `0x02`
- Poll loop meaning: wait for SPI TX FIFO empty, then wait for SPI transfer not busy
- Is `0x00/0x00` boot-safe: yes
- Is `0x00/0x00` hardware-correct: no
- Recommended immediate update: return `0x00` for `0xD00D`, `0x02` for `0xD00C`

## Sources

- WikiTI SPI port documentation: https://wikiti.brandonw.net/index.php?title=84PCE:Ports:D000
- CEmu SPI status implementation: https://github.com/CE-Programming/CEmu/blob/73a4cb0c1ae2a9d5c8d70ccb5f02c5705ad1871b/core/spi.c#L164-L215
- CEmu SPI reset path: https://github.com/CE-Programming/CEmu/blob/73a4cb0c1ae2a9d5c8d70ccb5f02c5705ad1871b/core/spi.c#L285-L289
- CEmu SPI FIFO depth definitions: https://github.com/CE-Programming/CEmu/blob/73a4cb0c1ae2a9d5c8d70ccb5f02c5705ad1871b/core/spi.h#L14-L16
- Local disassembly evidence: `TI-84_Plus_CE/ROM.transpiled.js`, blocks `006133:adl`, `006138:adl`, `00613e:adl`, `006145:adl`

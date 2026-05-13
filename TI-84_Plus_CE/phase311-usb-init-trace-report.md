# Phase 311 USB Init Trace Report

## Scope
This pass traced the phase 310 USB endpoint/FIFO helper families back toward their callers and compared them against the documented boot/wake init block at `0x040892`.

## High-Level Finding
`0x040892` is **not** the entry point for the phase 310 endpoint/FIFO init tree.

It does perform **early USB-related hardware bring-up** by touching:

- `0x3114`
- `0x5008`
- `0x5004`
- status port `0x0F`

But the **endpoint reset/stall helpers** and the **FIFO map/config writers** live under **separate runtime USB state-machine paths** and public USB helper vectors.

## Boot Block vs USB Init Tree
Disassembling the first ~100 instructions at `0x040892` shows direct calls only to:

- `0x04C83A`
- `0x0003A0 (= boot.Set48MHzMode)`
- `0x0000F8 (= kL6A)`
- `0x05FDD1`
- `0x040D11`
- `0x040D02`
- `0x05C67C`
- `0x040CD1`

None of those targets overlap the known USB init caller roots from phase 310:

- `0x02A10F` / batch window `0x02A1E5..0x02A263`
- `0x02A801`, `0x02A818`, `0x02AA32`
- `0x00BC77`
- `0x00C320`, `0x00C358`, `0x00C391`, `0x00C40C`, `0x00C435`, `0x00C4B4`

A recursive static call-path search from `0x040892` into those USB ranges also found **no path**. The safest conclusion is:

- `0x040892` does **controller/clock/PHY-style bring-up**
- the **endpoint/FIFO configuration phase happens elsewhere**

## USB Init/Reset Call Chain
The phase 310 endpoint helper block around `0x02A1F2` is not called directly as a standalone function entry. The exact site `0x02A1F2` has **no direct CALL/JP references**.

Instead, the containing USB batch is reached through a broader runtime path:

- `0x02AE60` acts as a USB state-dispatch block
- `0x02AE83` calls `0x02AB8F`
- inside that path, `0x02ABD1` calls `0x02A10F`
- execution then falls into the batch window `0x02A1E5..0x02A263`
- that window issues the vector-slot calls:
  - `0x02A1F2 -> 0x000614 (= usb_InEndpointSetReset)`
  - `0x02A1FD -> 0x000610 (= usb_InEndpointClrReset)`
  - `0x02A208 -> 0x000608 (= usb_InEndpointClrStall)`
  - `0x02A215 -> 0x000628 (= usb_OutEndpointSetReset)`
  - `0x02A220 -> 0x000624 (= usb_OutEndpointClrReset)`
  - `0x02A22B -> 0x00061C (= usb_OutEndpointClrStall)`

There is also a separate sweep/reset path:

- `0x02AE60`
- `0x02AEB1 -> 0x02AC49`
- `0x02AC0B -> 0x02A801`
- `0x02AC1A -> 0x02A818`
- `0x02AC27 -> 0x02AA32`
- those paths converge on the sweep loop around `0x02A9B9`, which reuses the same endpoint vector helpers

## USB Config Builder Entry Points
The config-builder window requested in the prompt, `0x00BD5C..0x00C558`, is **not the top of the routine family**. It sits inside a larger cluster whose public roots are:

- `0x0004BC (= usb_ResetFIFOS) -> 0x00BC77`
- `0x000404 (= usb_DMACXReadNext) -> 0x00C435`
- `0x000408 (= usb_DMACXWrite) -> 0x00C358`
- `0x00040C (= usb_DMACXRead) -> 0x00C320`
- `0x000410 (= usb_DMACXWriteNext) -> 0x00C391`
- `0x000414 (= usb_DMACXWriteCheck) -> 0x00C40C`
- `0x000418 (unlabeled public USB helper) -> 0x00C4B4`

Inside that cluster, the literal config window does the endpoint/FIFO programming observed in phase 310:

- `0x00BD5C`, `0x00BD6C`, `0x00BD7C`, `0x00C533` call `usb_SetFifoMap`
- `0x00BDC9`, `0x00BDDF`, `0x00BDF5`, `0x00BE0B` call `usb_SetEndpointConfig`
- `0x00C4D8`, `0x00C4E9` call `usb_ClrEndpointConfig`
- `0x00BD8C`, `0x00BD9C`, `0x00BDA8`, `0x00BDB4`, `0x00C558` call `usb_SetFifoConfig`

Those public roots are called from runtime code such as:

- `0x02A85B`, `0x02AB24` -> `usb_ResetFIFOS`
- `0x00A350`, `0x00A485`, `0x00A683`, `0x00A6FF` -> DMA/config entry points
- `0x00A4D5`, `0x00A511`, `0x00A708` -> `usb_ResetFIFOS`

That is strong evidence the config phase is **runtime callable**, not a one-shot boot-only sequence.

## Relationship Between Vector-Slot and Direct Callers
There are two layers using the same hardware register block:

- **Vector-slot callers** (`0x02A1F2..0x02AA23`) call the jump-table entries at `0x000608..0x000638`
- **Direct callers** (`0x009E76..0x00A607`, `0x00BD5C..0x00C558`, `0x00F93A`) bypass the vector table and call the concrete helper bodies directly

Functionally, both paths target the same `0x31xx` endpoint/FIFO registers:

- vector-slot paths are mostly **state-machine reset/stall sweeps**
- direct-call paths are mostly **literal endpoint/FIFO setup** and **transfer helpers**

## Answer to the Prompt
If the question is, “does the 964-byte boot/wake block at `0x040892` contain the phase 310 USB endpoint/FIFO initialization?”, the answer is:

- **No** for the endpoint reset/FIFO mapping/configuration tree
- **Yes, partially** for lower-level USB controller bring-up

So USB init appears split into two stages:

1. `0x040892`: low-level boot/wake hardware enable and status setup
2. runtime USB driver paths (`0x02AE60` state dispatch and `0x00BC77..0x00C558` builder cluster): endpoint reset, FIFO mapping, endpoint config, and reset sweeps

## Bottom Line
The phase 310 helpers are **not boot-only**. They are reachable from runtime USB driver code and public USB helper vectors, so the endpoint/FIFO init phase can be **re-triggered after boot**. The `0x040892` block should be treated as an earlier hardware bring-up stage, not the full USB endpoint/FIFO initialization routine.

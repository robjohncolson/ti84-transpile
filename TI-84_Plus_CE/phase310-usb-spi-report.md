# Phase 310 USB/FIFO Entry Report

## Scope
This pass mapped jump-vector entries **36-48** at `0x000608..0x000638`, with targets `0x007E0F..0x008392`.

Reference names were corroborated against [ti84pceg.inc](./references/ti84pceg.inc), which labels these vectors as:

- `usb_InEndpointClrStall`
- `usb_InEndpointSetStall`
- `usb_InEndpointClrReset`
- `usb_InEndpointSetReset`
- `usb_InEndpointSendZlp`
- `usb_OutEndpointClrStall`
- `usb_OutEndpointSetStall`
- `usb_OutEndpointClrReset`
- `usb_OutEndpointSetReset`
- `usb_SetFifoMap`
- `usb_SetEndpointConfig`
- `usb_ClrEndpointConfig`
- `usb_SetFifoConfig`

## High-Level Findings
- These entries are **USB endpoint/FIFO register helpers**, not LCD SPI helpers. They only touch the `0x31xx` port block and never hit the `0xD000` SPI controller.
- Entries **36-44** are nine nearly identical **0x75-byte** endpoint bit-twiddlers. They choose endpoint `1..4` from the first argument, then perform an `IN`/modify/`OUT` cycle on endpoint status ports.
- Entry **45** writes one byte to `0x31A8..0x31AB`, so it behaves like a **FIFO map selector**.
- Entry **46** writes a two-byte endpoint config word to either the **IN endpoint config family** (`0x3160/61`, `0x3164/65`, `0x3168/69`, `0x316C/6D`) or the **OUT endpoint config family** (`0x3180/81`, `0x3184/85`, `0x3188/89`, `0x318C/8D`).
- Entry **47** is a **17-byte wrapper** that zeroes `DE` and jumps into entry 46's shared config-writing body.
- Entry **48** writes one byte to `0x31AC..0x31AF`, matching a **FIFO config byte** writer.
- No CALL/JP references from the known **OS event-loop / USB-timer path** around `0x049656` were found for any of these vector slots. The vector table is only referenced by **USB init/reset helpers**, and several internal routines bypass the vector slots and call targets directly.

## Entry Map
| Idx | Vector | Reference Name | Target | Length | Observed Behavior | Vector CALL/JP Refs | Direct Target Refs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 36 | `0x000608` | `usb_InEndpointClrStall` | `0x007E0F` | `0x75` | Clear bit 3 on `0x3161/65/69/6D` | 2 (`0x02A208`, `0x02A9EE`) | 2 (`0x009E8C`, `0x00A5D2`) |
| 37 | `0x00060C` | `usb_InEndpointSetStall` | `0x007E84` | `0x75` | Set bit 3 on `0x3161/65/69/6D` | 1 (`0x02A31E`) | 1 (`0x009F98`) |
| 38 | `0x000610` | `usb_InEndpointClrReset` | `0x007EF9` | `0x75` | Clear bit 4 on `0x3161/65/69/6D` | 2 (`0x02A1FD`, `0x02A9E3`) | 2 (`0x009E81`, `0x00A5C7`) |
| 39 | `0x000614` | `usb_InEndpointSetReset` | `0x007F6E` | `0x75` | Set bit 4 on `0x3161/65/69/6D` | 2 (`0x02A1F2`, `0x02A9D8`) | 2 (`0x009E76`, `0x00A5BC`) |
| 40 | `0x000618` | `usb_InEndpointSendZlp` | `0x007FE3` | `0x75` | Set bit 7 on `0x3161/65/69/6D` | 0 | 1 (`0x00F93A`) |
| 41 | `0x00061C` | `usb_OutEndpointClrStall` | `0x008058` | `0x75` | Clear bit 3 on `0x3181/85/89/8D` | 2 (`0x02A22B`, `0x02AA23`) | 2 (`0x009EAF`, `0x00A607`) |
| 42 | `0x000620` | `usb_OutEndpointSetStall` | `0x0080CD` | `0x75` | Set bit 3 on `0x3181/85/89/8D` | 1 (`0x02A32D`) | 1 (`0x009FA7`) |
| 43 | `0x000624` | `usb_OutEndpointClrReset` | `0x008142` | `0x75` | Clear bit 4 on `0x3181/85/89/8D` | 2 (`0x02A220`, `0x02AA18`) | 2 (`0x009EA4`, `0x00A5FC`) |
| 44 | `0x000628` | `usb_OutEndpointSetReset` | `0x0081B7` | `0x75` | Set bit 4 on `0x3181/85/89/8D` | 2 (`0x02A215`, `0x02AA0D`) | 2 (`0x009E99`, `0x00A5F1`) |
| 45 | `0x00062C` | `usb_SetFifoMap` | `0x00822C` | `0x68` | Write one byte to `0x31A8..0x31AB` selected by arg0 `0..3` | 0 | 4 (`0x00BD5C`, `0x00BD6C`, `0x00BD7C`, `0x00C533`) |
| 46 | `0x000630` | `usb_SetEndpointConfig` | `0x008294` | `0xED` | Write `E` then `D` to `0x3160/61..0x316C/6D` or `0x3180/81..0x318C/8D` | 0 | 4 (`0x00BDC9`, `0x00BDDF`, `0x00BDF5`, `0x00BE0B`) |
| 47 | `0x000634` | `usb_ClrEndpointConfig` | `0x008381` | `0x11` | Zero `DE`, then tail-jump to `0x0082A0` shared config writer | 0 | 2 (`0x00C4D8`, `0x00C4E9`) |
| 48 | `0x000638` | `usb_SetFifoConfig` | `0x008392` | `0x5F` | Write one byte to `0x31AC..0x31AF` selected by arg0 `0..3` | 0 | 5 (`0x00BD8C`, `0x00BD9C`, `0x00BDA8`, `0x00BDB4`, `0x00C558`) |

## Caller Classification
### Vector-slot callers
- `0x02A1F2..0x02A22B`: a **USB init/reset batch** that toggles reset/stall state for endpoint families.
- `0x02A31E..0x02A32D`: a **direction-specific stall path** that selects IN vs OUT stall helpers.
- `0x02A9D8..0x02AA23`: a **USB endpoint sweep/reset loop** that iterates endpoints and applies the same reset/stall helpers.

### Direct target callers
- `0x009E76..0x00A607`: **runtime endpoint helpers** that bypass the vector table and call the endpoint bit-twiddlers directly.
- `0x00BD5C..0x00C558`: **USB config builders** that push literal slot/config values and call the FIFO-map / endpoint-config / FIFO-config writers directly.
- `0x00F93A`: one **runtime transfer helper** that calls `usb_InEndpointSendZlp` directly.

### Event-loop relevance
- No direct vector-slot or target CALL/JP references were found from the known **OS event-loop / USB-timer** chain around `0x03FB43 -> 0x049656`.
- In practice, these 13 entries look like **driver-internal USB control helpers**, not generic event-loop services.

## Port-Family Map
The prompt called out `0x3161`, `0x3181`, `0x31A8`, and `0x31AC`, but the actual code uses **whole port families**:

| Port Family | Effective Ports | Entries | Access Pattern | Meaning |
| --- | --- | --- | --- | --- |
| `0x3161` family | `0x3161`, `0x3165`, `0x3169`, `0x316D` | 36-40 | `IN` + modify + `OUT` | IN endpoint status/control bits: stall, reset, ZLP |
| `0x3181` family | `0x3181`, `0x3185`, `0x3189`, `0x318D` | 41-44 | `IN` + modify + `OUT` | OUT endpoint status/control bits: stall, reset |
| `0x3160/61` family | `0x3160/61`, `0x3164/65`, `0x3168/69`, `0x316C/6D` | 46-47 | write-only | IN endpoint config word (`E` low byte, `D` high byte) |
| `0x3180/81` family | `0x3180/81`, `0x3184/85`, `0x3188/89`, `0x318C/8D` | 46-47 | write-only | OUT endpoint config word (`E` low byte, `D` high byte) |
| `0x31A8` family | `0x31A8..0x31AB` | 45 | write-only | FIFO map slots 0..3 |
| `0x31AC` family | `0x31AC..0x31AF` | 48 | write-only | FIFO config slots 0..3 |

## Browser-Shell Relevance
- For the current browser shell, **none of these 13 entries appear necessary**. There is no browser USB link layer, and the known event-loop/timer path does not reference them.
- The safest current transpilation stance is:
  - **stub all 13 as no-ops** for browser-only execution.
  - If a future USB/link implementation is added, start by **shadowing software state** for:
    - endpoint stall/reset/ZLP bits (entries 36-44)
    - FIFO map/config bytes (entries 45 and 48)
    - endpoint config words (entries 46-47)
- Of the group, **entries 45-48** are the most structurally important for a future faithful USB model because they carry persistent configuration data rather than one-shot status-bit toggles.

## Bottom Line
Entries 36-48 are a compact USB endpoint/FIFO helper block:

- `36-44`: endpoint control/status bit manipulation
- `45`: FIFO map write
- `46-47`: endpoint config word write / clear
- `48`: FIFO config write

For the browser shell today, they can be stubbed safely. If USB emulation ever becomes a goal, these handlers should be modeled as a small in-memory USB register block rather than tied to the existing LCD/SPI peripherals.

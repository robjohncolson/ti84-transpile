# Phase 432: Trace of `0x0079E5`

## Summary

`0x0079E5..0x007A04` is a **32-byte write-and-sanity-check stub**, not a numbered-endpoint configurator.

The function takes one stacked byte argument from `IX+6`, loads `BC = 0x3014`, writes that argument to port `0x3014`, performs the usual `BC == 0x3014` sanity loop, and returns. It makes **no direct CALLs**, touches **no absolute RAM**, and performs **no `0x31xx` endpoint-window writes**.

The 6-bit value is prepared entirely in the caller `0x00D9EE`. That caller samples ports `0x3015` and `0x3014`, uses `0x0026D2` only to repack those bytes into `HL`, then masks the **low byte** with `0x3F` and passes that masked byte to `0x0079E5`. So the effective mapping is:

```text
config_byte = (port 0x3014) & 0x3F
0x0079E5 writes config_byte directly to port 0x3014
```

## Function Boundary

| Item | Value |
| --- | --- |
| Start | `0x0079E5` |
| End | `0x007A04` |
| Total size | `32` bytes (`0x20`) |
| Exit | `RET` at `0x007A04` |
| Next sibling | `0x007A05` begins a separate but similarly shaped port-write stub |

## Disassembly

```asm
0x0079E5  DD E5              PUSH IX
0x0079E7  DD 21 00 00 00     LD IX,0x000000
0x0079EC  DD 39              ADD IX,SP
0x0079EE  DD 7E 06           LD A,(IX+6)         ; stacked caller byte
0x0079F1  01 14 30 00        LD BC,0x003014
0x0079F5  ED 79              OUT (C),A           ; direct write to port 0x3014
0x0079F7  78                 LD A,B
0x0079F8  FE 30              CP 0x30
0x0079FA  28 01              JR Z,0x0079FD
0x0079FC  CF                 RST 0x08
0x0079FD  79                 LD A,C
0x0079FE  FE 14              CP 0x14
0x007A00  20 FA              JR NZ,0x0079FC      ; loop until BC still decodes as 0x3014
0x007A02  DD E1              POP IX
0x007A04  C9                 RET
```

## How the 6-Bit Value Maps to Configuration

The 6-bit mapping does **not** happen inside `0x0079E5`; it happens in `0x00D9EE` immediately before the call:

1. `0x00DA3E` reads `0x3015` into `A`.
2. `0x00DA49` reads `0x3014` into `A`.
3. `0x00DA51` calls `0x0026D2`, whose body is just:

   ```asm
   0x0026D2  PUSH AF
   0x0026D3  LD A,L
   0x0026D4  OR C
   0x0026D5  LD L,A
   0x0026D6  LD A,H
   0x0026D7  OR B
   0x0026D8  LD H,A
   0x0026D9  POP AF
   0x0026DA  RET
   ```

   With the caller’s register setup, that repacks the samples as `H = port0x3015`, `L = port0x3014`.

4. `0x00DA55..0x00DA58` keeps only the low byte and masks it:

   ```asm
   0x00DA55  LD A,L
   0x00DA56  AND 0x3F
   0x00DA58  LD C,A
   ```

5. `0x00DA67` calls `0x0079E5`.

So the mapping implemented by this stub is an **identity passthrough** of that masked byte:

```text
arg_to_0x0079E5 = port0x3014 & 0x3F
OUT (0x3014), arg_to_0x0079E5
```

Notably, `0x3015` is sampled by the caller but does **not** influence the byte actually passed to `0x0079E5`.

## Which USB Endpoint Registers Are Written

None.

There are **no direct writes to `0x31xx`** inside `0x0079E5`, including:

- no `0x3108..0x310F` endpoint-0 window
- no `0x3110..0x3117` endpoint-1 window
- no `0x3118..0x311F` endpoint-2 window
- no interrupt/window writes such as `0x3138` or `0x313A`

The only direct port write is:

| Site | Port | Access | Role |
| --- | --- | --- | --- |
| `0x0079F5` | `0x3014` | write | writes the caller-supplied 6-bit masked byte unchanged |

## Multiple Endpoints or One?

Neither.

`0x0079E5` does **not** configure any numbered endpoint at all. It writes **one non-endpoint control/status register** (`0x3014`) and returns.

## Packet Size / FIFO Settings by Speed

No packet-size or FIFO programming is visible in this function.

There is:

- no branch on the 6-bit value
- no lookup table
- no writes to `0x316x`, `0x318x`, or `0x31A8..0x31AF`
- no descriptor/FIFO RAM traffic

So `0x0079E5` applies **no speed-dependent packet-size or FIFO setting** on its own. If packet sizing exists elsewhere in the USB bring-up path, it is outside this stub.

## RAM Variables Accessed

None.

`0x0079E5` has:

- no absolute `0xD0xxxx` reads
- no absolute `0xD0xxxx` writes
- one stacked parameter read from `IX+6`

## CALL Targets and Roles

There are **no direct CALL instructions inside `0x0079E5`**.

For context, the caller-side helpers immediately around it are:

| Target | Role |
| --- | --- |
| `0x00D9EE` | larger USB side-band/reset helper that prepares the `0x3014 & 0x3F` byte and then calls `0x0079E5` |
| `0x0026D2` | byte pack helper used by `0x00D9EE`; it repacks `0x3015` and `0x3014` into `HL` without transforming the low-byte value |

## Conclusion

Best-fit label:

**`0x0079E5` is a `0x3014` write wrapper, not an endpoint/FIFO configurator.**

It is only `32` bytes long, takes one caller-prepared byte, writes that byte to `0x3014`, verifies the port constant, and returns. The 6-bit mapping is just:

```text
(port 0x3014) & 0x3F  ->  OUT (0x3014),A
```

No numbered USB endpoint register is programmed here.

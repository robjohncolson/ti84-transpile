# Phase 412: Map 0x01567C (Notification Delivery Wrapper)

## Verdict

- `0x01567C` is the **entry-167 wrapper** that packages USB/link state into the same `D143E7..D14402` 28-byte notification block used by `0x02B373`, then calls the notification delivery handler.
- Unlike `0x02B373`, it **calls `0x00F5B0` directly** at `0x0156D2`. There is **no `CALL 0x0004A0`** inside `0x01567C`.
- The wrapper is not a thin syscall trampoline. It does extra work **before** delivery (`CALL 0x0151FE`) and **after** delivery (status bookkeeping, optional `dispatch_key`, then `CALL 0x015542`).
- It does **not** call `0x014E3F` or `0x02B373` directly. `0x014E3F`, `D14084`, `D1440E`, and `D177B7` only appear **downstream inside `0x00F5B0`**.

## Direct Disassembly

Function body: `0x01567C..0x01573E` (`0xC3` bytes, 195 decimal).

```text
0x01567C  ED 4B 6A 77 D1    LD BC,(0xD1776A)
0x015681  ED 43 ED 43 D1    LD (0xD143ED),BC
0x015686  01 E8 03 00       LD BC,0x0003E8
0x01568A  ED 43 F6 43 D1    LD (0xD143F6),BC
0x01568F  01 00 00 00       LD BC,0x000000
0x015693  ED 43 F9 43 D1    LD (0xD143F9),BC
0x015698  ED 4B 7B 77 D1    LD BC,(0xD1777B)
0x01569D  ED 43 FC 43 D1    LD (0xD143FC),BC
0x0156A2  AF                XOR A
0x0156A3  32 FF 43 D1       LD (0xD143FF),A
0x0156A7  01 00 00 00       LD BC,0x000000
0x0156AB  ED 43 02 44 D1    LD (0xD14402),BC
0x0156B0  01 6E FB 00       LD BC,0x00FB6E
0x0156B4  ED 43 E7 43 D1    LD (0xD143E7),BC
0x0156B9  01 EF 21 01       LD BC,0x0121EF
0x0156BD  ED 43 EA 43 D1    LD (0xD143EA),BC
0x0156C2  ED 4B 92 77 D1    LD BC,(0xD17792)
0x0156C7  C5                PUSH BC
0x0156C8  CD FE 51 01       CALL 0x0151FE
0x0156CC  C1                POP BC
0x0156CD  01 E7 43 D1       LD BC,0xD143E7
0x0156D1  C5                PUSH BC
0x0156D2  CD B0 F5 00       CALL 0x00F5B0
0x0156D6  C1                POP BC
0x0156D7  32 25 77 D1       LD (0xD17725),A
0x0156DB  3A 25 77 D1       LD A,(0xD17725)
0x0156DF  B7                OR A
0x0156E0  28 4E             JR Z,0x015730
0x0156E2  AF                XOR A
0x0156E3  32 79 77 D1       LD (0xD17779),A
0x0156E7  3A BB 77 D1       LD A,(0xD177BB)
0x0156EB  B7                OR A
0x0156EC  28 42             JR Z,0x015730
0x0156EE  ED 4B 32 40 D1    LD BC,(0xD14032)
0x0156F3  03                INC BC
0x0156F4  ED 43 32 40 D1    LD (0xD14032),BC
0x0156F9  AF                XOR A
0x0156FA  32 BB 77 D1       LD (0xD177BB),A
0x0156FE  FD 21 80 00 D0    LD IY,0xD00080
0x015703  FD CB 41 DE       SET 3,(IY+0x41)
0x015707  3A 73 40 D1       LD A,(0xD14073)
0x01570B  B7                OR A
0x01570C  20 12             JR NZ,0x015720
0x01570E  01 13 00 00       LD BC,0x000013
0x015712  C5                PUSH BC
0x015713  01 98 00 00       LD BC,0x000098
0x015717  C5                PUSH BC
0x015718  CD 3C 88 00       CALL 0x00883C
0x01571C  C1                POP BC
0x01571D  C1                POP BC
0x01571E  18 10             JR 0x015730
0x015720  01 03 00 00       LD BC,0x000003
0x015724  C5                PUSH BC
0x015725  01 10 00 00       LD BC,0x000010
0x015729  C5                PUSH BC
0x01572A  CD 3C 88 00       CALL 0x00883C
0x01572E  C1                POP BC
0x01572F  C1                POP BC
0x015730  3A 25 77 D1       LD A,(0xD17725)
0x015734  B7                OR A
0x015735  ED 62             SBC HL,HL
0x015737  6F                LD L,A
0x015738  E5                PUSH HL
0x015739  CD 42 55 01       CALL 0x015542
0x01573D  C1                POP BC
0x01573E  C9                RET
```

## Calls and Control Flow

Direct calls inside `0x01567C`:

| Site | Target | Notes |
| --- | --- | --- |
| `0x0156C8` | `0x0151FE` | pre-delivery state-staging helper |
| `0x0156D2` | `0x00F5B0` | **direct** notification delivery call |
| `0x015718` | `0x00883C` | `dispatch_key(0x98, 0x13)` path when `D14073 == 0` |
| `0x01572A` | `0x00883C` | `dispatch_key(0x10, 0x03)` path when `D14073 != 0` |
| `0x015739` | `0x015542` | status-to-callback selector on the return byte in `D17725` |

Not present in the direct body:

- `CALL 0x0004A0`: **absent**
- `CALL 0x014E3F`: **absent**
- `CALL 0x02B373`: **absent**

### What the helper calls add

`0x0151FE` is not just cosmetic. It stages notification state before the `0x00F5B0` call:

- clears `D17779`
- stores the pushed argument to `D17773` (here the argument comes from `D17792`)
- installs `0x015185` into `D17770`
- copies `D14038 -> D17776`
- clears `D1777A`
- sets `D17779 = 1`

After `0x00F5B0` returns, `0x01567C` stores `A -> D17725`, and if that byte is non-zero it:

- clears `D17779`
- checks and clears `D177BB`
- increments `D14032`
- sets bit 3 at resolved RAM address `D000C1`
- emits one `dispatch_key` call
- then always calls `0x015542(status)`

## RAM Map

### Direct absolute accesses in `0x01567C`

| Address | Access | Use in wrapper |
| --- | --- | --- |
| `0xD1776A` | read | copied into descriptor field `D143ED` |
| `0xD143ED` | write | payload pointer field |
| `0xD143F6` | write | set to `0x0003E8` |
| `0xD143F9` | write | cleared to `0` |
| `0xD1777B` | read | copied into descriptor field `D143FC` |
| `0xD143FC` | write | aux field sourced from `D1777B` |
| `0xD143FF` | write | type/state byte cleared to `0` |
| `0xD14402` | write | tail field cleared to `0` |
| `0xD143E7` | write | callback slot 0 set to `0x00FB6E` |
| `0xD143EA` | write | callback slot 1 set to `0x0121EF` |
| `0xD17792` | read | pushed into `0x0151FE` |
| `0xD17725` | write/read | holds the `0x00F5B0` return/status byte |
| `0xD17779` | write | cleared on non-zero return path |
| `0xD177BB` | read/write | gate/flag for extra follow-up work |
| `0xD14032` | read/write | incremented on the non-zero + `D177BB` path |
| `0xD14073` | read | selects which `dispatch_key` argument pair to send |

### Resolved indexed RAM access

`FD 21 80 00 D0` loads `IY = 0xD00080`, so:

- `FD CB 41 DE` = `SET 3,(IY+0x41)` writes bit 3 at **`0xD000C1`**

### Requested watch addresses

| Address | Direct access in `0x01567C`? | Notes |
| --- | --- | --- |
| `D143E7..D14402` | yes | same 28-byte block as `0x02B373`, but with different contents |
| `D177B7` | no | only appears downstream inside `0x00F5B0` |
| `D14073` | yes | read at `0x015707` |
| `D14084` | no | only checked inside `0x00F5B0` |
| `D1440E` | no | only manipulated inside `0x00F5B0` / `0x014E3F` |

## Callers of `0x01567C`

Pattern scan results:

| Address | Type | Context |
| --- | --- | --- |
| `0x00049C` | `JP 0x01567C` | jump-table/vector stub for **entry 167** |
| `0x011555` | `CALL 0x01567C` | reached after `D176F2` is compared against `0xCCCC` / `0xCCCD` |
| `0x01336E` | `CALL 0x01567C` | USB receive worker A calls it immediately after `D17795 := 4` |

The `0x01336E` caller is the important one for this session. In the worker A path:

- `D1777B` has just been set to `0x000009`
- the receive path has already populated `D1776A`
- then `0x01567C` packages those values into the descriptor and delivers it

## Comparison with `0x02B373`

Both wrappers populate the same 28-byte block at `D143E7..D14402`, but the field values are not the same.

| Field | `0x01567C` | `0x02B373` |
| --- | --- | --- |
| `D143E7` | `0x00FB6E` | `0x000000` |
| `D143EA` | `0x0121EF` | `0x000000` |
| `D143ED` | `mem[D1776A]` | `0xD141B3` |
| `D143F6` | `0x0003E8` | `0x000004` |
| `D143F9` | `0x000000` | `0x000000` |
| `D143FC` | `mem[D1777B]` | `0x000008` |
| `D143FF` | `0x00` | `0x02` |
| `D14402` | `0x000000` | `0x000000` |

That is the key answer to the session question:

- **Same block layout**: yes
- **Same contents**: no

`0x02B373` is a small fixed initializer for the secondary key-state descriptor. `0x01567C` is a richer USB/link wrapper that installs two callback pointers (`0x00FB6E`, `0x0121EF`), copies a live payload pointer from `D1776A`, uses a large limit value `0x03E8`, and carries a caller-supplied aux field from `D1777B`.

## Interpretation

`0x01567C` looks like the USB/link-side sibling of the simpler `0x02B373` wrapper.

The shape is:

1. Build the shared descriptor block at `D143E7..D14402`
2. Stage extra notification state through `0x0151FE`
3. Call the real delivery handler with `BC = 0xD143E7`
4. Store the return byte in `D17725`
5. If the return byte is non-zero, run extra bookkeeping and emit one `dispatch_key`
6. Call `0x015542(status)` and return

The most important deltas from `0x02B373` are:

- it is **not** using the `0x0004A0` gate
- it is **not** building the small `D141B3` / length-4 / type-2 descriptor
- it adds both **pre-delivery setup** and **post-delivery follow-up**

So the wrapper is best described as:

**"USB/link notification-delivery front-end for syscall entry 167, using the shared D143E7 descriptor block but with a different payload/callback configuration than 0x02B373."**

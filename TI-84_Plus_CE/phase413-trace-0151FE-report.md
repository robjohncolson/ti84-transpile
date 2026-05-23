# Phase 413: Trace 0x0151FE Pre-Delivery Setup Helper

## Verdict

- `0x0151FE` is a 52-byte pre-delivery staging helper shared by the two notification wrappers at `0x0155BC` and `0x01567C`.
- It does **not** touch link/USB ports and does **not** call `0x00F5B0` itself. Its body is pure state setup around one common prologue helper call.
- Its main job is to arm the `D17770..D1777A` notification-state block before the real delivery wrapper calls `0x00F5B0`:
  - clear `D17779`
  - copy the caller-supplied 24-bit argument into `D17773`
  - install callback pointer `0x015185` into `D17770`
  - mirror `D14038` into `D17776`
  - clear `D1777A`
  - set `D17779 = 1` last
- The store ordering matters: it publishes the "active/armed" byte only after the rest of the staging block is populated.

## Full Disassembly

Function body: `0x0151FE..0x015231` (`0x34` bytes, 52 decimal).

```text
0x0151FE  CD 8A 21 00         CALL 0x00218A
0x015202  AF                  XOR A
0x015203  32 79 77 D1         LD (0xD17779),A
0x015207  DD 07 06            LD BC,(IX+0x06)
0x01520A  ED 43 73 77 D1      LD (0xD17773),BC
0x01520F  01 85 51 01         LD BC,0x015185
0x015213  ED 43 70 77 D1      LD (0xD17770),BC
0x015218  ED 4B 38 40 D1      LD BC,(0xD14038)
0x01521D  ED 43 76 77 D1      LD (0xD17776),BC
0x015222  AF                  XOR A
0x015223  32 7A 77 D1         LD (0xD1777A),A
0x015227  3E 01               LD A,0x01
0x015229  32 79 77 D1         LD (0xD17779),A
0x01522D  DD F9               LD SP,IX
0x01522F  DD E1               POP IX
0x015231  C9                  RET
```

## RAM Addresses Accessed

| Address | Access | Purpose |
| --- | --- | --- |
| `0xD17779` | write twice | Notification active/armed flag. Cleared first, then set to `1` after the rest of the staging block is ready. |
| `0xD17773` | write | Stores the caller-supplied 24-bit argument from `(IX+6)`. In `0x01567C` that argument comes from `D17792`; in `0x0155BC` it comes from `IY+0x0A`. |
| `0xD17770` | write | Stores callback pointer `0x015185`, effectively registering the completion/follow-up handler. |
| `0xD14038` | read | Source of a global context/handle copied into the staging block. |
| `0xD17776` | write | Receives the mirrored value from `D14038`. |
| `0xD1777A` | write | Completion/state byte. Cleared here before delivery begins. |
| `(IX+0x06)` | indexed read | First 24-bit stack argument after the common `0x00218A` prologue establishes an IX frame. |

### Write Summary

| Site | Write |
| --- | --- |
| `0x015203` | `D17779 := 0` |
| `0x01520A` | `D17773 := arg0` |
| `0x015213` | `D17770 := 0x015185` |
| `0x01521D` | `D17776 := mem[D14038]` |
| `0x015223` | `D1777A := 0` |
| `0x015229` | `D17779 := 1` |

## Call Graph

### Who Calls `0x0151FE`

| Address | Type | Context |
| --- | --- | --- |
| `0x0004DC` | `JP 0x0151FE` | Jump-table export near the syscall/vector stubs. By slot order this is likely the standalone vector for this helper. |
| `0x015611` | `CALL 0x0151FE` | Inside wrapper `0x0155BC`, immediately after `LEA BC,IY+0x0A` / `PUSH BC`. |
| `0x0156C8` | `CALL 0x0151FE` | Inside wrapper `0x01567C`, immediately after loading `BC` from `D17792` / `PUSH BC`. |

### Who `0x0151FE` Calls

| Site | Target | Role |
| --- | --- | --- |
| `0x0151FE` | `0x00218A` | Common IX stack-frame prologue helper. In the broader ROM this helper does `EX (SP),IX`, builds an IX frame, then jumps back into the caller. |

### Indirect/Staged Target

`0x0151FE` does not directly call `0x015185`, but it stores that address into `D17770`. That is strong evidence that `0x015185` is the callback/completion routine for this staged record.

The nearby `0x015185` body supports that interpretation:

- clears `D17779`
- sets `D1777A = 1`
- pushes `0` and `3`
- loads `IY` from `D143EA`
- calls `0x002288`

So `0x0151FE` appears to register `0x015185` as the routine that flips the staged block from "armed" to "completed" and then dispatches follow-up work.

## Port I/O

`0x0151FE` contains **no `IN0` or `OUT0` instructions**.

## Hypothesis: Role In The Notification Lifecycle

`0x0151FE` looks like the small, deterministic setup step that turns a caller-supplied pointer/value into an in-flight notification record:

1. Enter via the common prologue helper and read the first stack argument.
2. Mark the notification block inactive while mutating it.
3. Store the per-call argument (`D17773`), completion callback (`D17770`), and mirrored global context (`D17776`).
4. Clear the completion/state byte (`D1777A`).
5. Publish the record by setting `D17779 = 1`.

That makes the most likely interpretation:

**`0x0151FE` is a pre-delivery arming routine for the `D1777x` notification state block.** It does not deliver the notification itself. Instead, it registers the callback/context that the later delivery path and callback completion path will consume.

For the `0x01567C` chain specifically:

- `0x01567C` loads the argument from `D17792`
- `0x0151FE` stores that value into `D17773` and arms the `D17770..D1777A` block
- `0x01567C` then calls `0x00F5B0` to perform delivery
- the staged callback `0x015185` appears to flip the block into its post-delivery/completed state

The strongest evidence for this interpretation is the flag choreography:

- `0x0151FE`: `D17779 = 0` -> populate block -> `D17779 = 1`
- `0x015185`: `D17779 = 0`, `D1777A = 1`

That pair looks like an "in flight" flag plus a "completion/event pending" flag.

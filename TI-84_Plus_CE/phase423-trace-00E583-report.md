# Phase 423: Trace Report for `0x00E583`

## Summary

`0x00E583` is not walking `D141EC`, `D141ED`, or the descriptor tables directly. The real list walk is a **selector-0 slab sibling chain** built from `0x20`-byte nodes:

- caller arg0 is copied into `D14008`
- the original head pointer is mirrored into `D14005`
- `D14011` becomes the current-node pointer
- node bytes `+0..+2` encode the next sibling pointer
- byte `+0` bit `0` marks the terminal node

After it patches the terminal sibling, `0x00E583` drops into a cleanup tail that matches the already-known `0x00FE10` transfer-engine tail: it rebuilds successors through `D1400E`, walks current nodes through `D1400B`, calls `0x00E4E8`, then frees each selector-0 node through `0x00E1CC` until the walk returns to `D14005`.

So the answer to "what list does it walk?" is:

> It walks the same **selector-0 transfer block list** that `0x00FE10` later consumes, but `0x00E583` reaches it through the staged `D14008` / `D14011` path before handing off to the shared `D1400B` / `D1400E` cleanup logic.

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x00E583` |
| End | `0x00E91D` |
| Size | `923` bytes |
| Direct callers | `0x00D295`, `0x00ED10` |
| Direct `JP 0x00E583` refs | none |
| Port I/O | `IN A,(0x3030)` only |

The function is much larger than the initial estimate because the primary sibling walk is only the first loop. The routine also contains:

- a completion/poll loop (`0x00E7A5..0x00E836`)
- the shared cleanup/free tail (`0x00E8A3..0x00E914`)

## Exact Call Targets

| Target | Role in `0x00E583` |
| --- | --- |
| `0x002197` | `__frameset` prologue |
| `0x006EAF` | `usb_BusPowered()` hardware gate |
| `0x0022F9` | build 24-bit values from node bytes by shifting `+1` / `+2` |
| `0x00229D` | merge shifted bytes into a 24-bit pointer |
| `0x0027E8` | `memcpy(dst, src, len)`; copies caller arg0 into `D14008` |
| `0x014E3F` | notification installer wrapper |
| `0x0021C2` | null/zero check before storing the `0x00E4E8` result |
| `0x00DA8C` | link/notification poll helper |
| `0x002330` | right-shift helper used when rewriting terminal-node bytes |
| `0x00276B` | zero-extend helper before `0x00E4E8` |
| `0x00E4E8` | field extractor / `D141EC` stream hook |
| `0x00E1CC` | selector-0 slab free helper |

The `0x00E4E8` call site is at `0x00E882`.

## RAM Traffic

Absolute reads:

- `D14008` - staged selector-0 node buffer
- `D14005` - original head pointer / termination value
- `D14011` - current walk pointer
- `D1400B` - cleanup current-node pointer
- `D1400E` - cleanup successor pointer
- `D141EA` - link RX status latch
- `D141EC` - transfer/source gate byte
- `D1440F` - notification delivery status
- `D177B7` - USB/link initialized sentinel

Absolute writes:

- `D14008` - result of the 0x20-byte `memcpy`
- `D14005` - head/original node pointer
- `D14011` - current walk pointer, then repeatedly replaced with the next sibling
- `D141BB` - published current-node pointer
- `D176FB = 1` - notification/ack side-flag
- `D14076++` - completion-side counter/flag
- `D141EC = 0` - fallback path clears the one-byte gate
- `D1440E = 0` - cleanup tail clears the notification lock
- `D1400B` / `D1400E` - shared cleanup walk state

The function also seeds two stack-local pointer slots from the literal `0xD141EC`, then increments one of them to `0xD141ED`. That is a pointer setup step, not the main list walk.

## Loop Structure

### 1. Primary sibling walk: `0x00E623..0x00E679`

This is the direct answer to the task.

Behavior:

1. `D14011` points at the current selector-0 node.
2. Test `current[0] & 0x01`.
3. If bit 0 is set, the walker found the terminal sibling and exits the loop.
4. Otherwise rebuild `next` from:
   - `current[0] & 0xE0`
   - `current[1] << 8`
   - `current[2] << 16`
5. Store `next` back into `D14011`.
6. Repeat.

Interpretation:

- bytes `+0..+2` are a packed sibling/next pointer
- byte `+0` bit `0` is the terminal flag
- this is a **node-chain walk**, not a byte-stream walk

### 2. Completion/poll loop: `0x00E7A5..0x00E836`

This loop is not a list walk. It is a bounded wait loop that:

- increments a local counter up to `300`
- checks `D141EC`
- inspects `current[+8]` bit 7
- polls `D1440F`, `D177B7`, `D141ED`, `D141EA`
- reads port `0x3030` bit 0
- may call `0x00DA8C(0)`

### 3. Cleanup/free loop: `0x00E8A3..0x00E914`

This loop is the same node recycler already seen in `0x00FE10`.

Behavior:

1. Rebuild `D1400E` from `D1400B` bytes `+0..+2`.
2. Build a 16-bit field from `D1400B` bytes `+10/+11`.
3. Call `0x00E4E8`.
4. If the caller-provided secondary pointer is non-null, store the `0x00E4E8` result there.
5. Free the current node with `0x00E1CC(selector=0, ptr=D1400B)`.
6. Replace `D1400B = D1400E`.
7. Repeat until `D1400B == D14005`.

## What Gets Patched Before Cleanup

Once the terminal sibling is found, `0x00E583` rewrites it:

- byte `+0` gets the high bits from `D14005`
- bytes `+1` / `+2` get the shifted low/mid bytes of `D14005`
- byte `+3` is cleared
- bytes `+4..+7` mirror bytes `+0..+3`

That makes the terminal node link back to the original head pointer. In other words, the routine turns the staged sibling chain into a head-linked structure before the notification/poll phase and the later free walk.

## Return Value

The function returns `A = (IX-3)` at `0x00E916`.

Observed behavior:

- default return status is initialized to `1`
- the path where `current[+8]` already had bit 7 set forces the status to `0`
- normal completion paths force the status back to `1`

So the callers use the result as a boolean-like handled/success status, not as a pointer.

## Direct Callers

### Caller 1: `0x00D295`

Static context:

- pushes five arguments before the call
- the pushed values are:
  - `0`
  - `0`
  - `0x001388`
  - `*(D13FD8 + 3*slot)`
  - `*(D13FFC)`

Post-call behavior:

- stores returned `A` at `IX-2`
- branches on nonzero (`JR NZ,0x00D2E5`)

Meaning:

- this caller treats `0x00E583` as a status-producing helper over a node head pointer from `D13FFC`, with a sibling/descriptor pointer from the `D13FD8` table.

### Caller 2: `0x00ED10`

Static context:

- pushes five arguments before the call
- the pushed values are:
  - `*(IX+9)`
  - zero-extended `(IX+15)`
  - `*(IX+18)`
  - `*(D13FDE + 3*slot)`
  - `*(IX-3)`

Post-call behavior:

- stores returned `A` at `IX-5`
- immediately converts caller byte `IX-4` through `0x002623`

Meaning:

- this caller also treats `0x00E583` as a boolean/status helper, but it feeds it a different descriptor-table entry (`D13FDE`) and live caller-local pointers.

## Relationship To `0x00FE10`

This is the key connection:

- `0x00FE10` already had a selector-0 cleanup tail that:
  - walked current nodes through `D1400B`
  - rebuilt successors into `D1400E`
  - called `0x00E4E8`
  - called `0x00E1CC`
- `0x00E583` contains the same tail at `0x00E8A3..0x00E914`

The difference is that `0x00E583` does **additional upstream staging**:

1. copy caller head node into `D14008`
2. walk siblings via `D14011`
3. patch the terminal sibling so it links back to `D14005`
4. publish the current node via `D141BB`
5. run the notification/poll phase
6. then enter the same cleanup/free walk that `0x00FE10` uses

So `0x00E583` is best described as:

- a **selector-0 sibling-list stager / terminal-node patcher**
- followed by the **same cleanup walker** used downstream by the transfer engine

It is not a separate unrelated list family.

## Bottom Line

- The walked list is **not** `D141EC`.
- The walked list is **not** the descriptor tables `D13FD8` / `D13FDE`.
- The walked list is a **selector-0 0x20-byte slab chain**.
- `D14008` is the staged head copy.
- `D14011` is the forward walk pointer.
- `D1400B` / `D1400E` are the cleanup walk pointers.
- `0x00E4E8` is called once per node during the cleanup tail, exactly like the `0x00FE10` transfer-engine tail.

## Probe

The companion probe is:

- `TI-84_Plus_CE/probe-phase423-trace-00E583.mjs`

Run:

```bash
node TI-84_Plus_CE/probe-phase423-trace-00E583.mjs
```

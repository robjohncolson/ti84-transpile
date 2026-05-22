# Phase 410 — Key Handler Table Dump

## Key Dispatch Mechanism

The OS key dispatch at `0x05D58F` uses a computed function table:

1. Reads table base pointer from RAM `0xD1441D`
2. Computes entry address: `table_base + key_code * 4`
3. Copies 4-byte handler entry (3-byte address + 1 byte flags) to caller's buffer at `D141B3`
4. Caller passes result to notification system at `0x02B373`

The table installer at `0x05D5C2` (syscall `0x021E78`, entry #1885) takes a table base
address as a stack parameter and stores it at `D1441D`.

## D1441D Writers

| Address | Source | Value |
|---------|--------|-------|
| 0x02B896 | LD BC,0x000000 at 0x02B892 | 0x000000 |
| 0x02BD19 | LD BC,0x000000 at 0x02BD15 | 0x000000 |
| 0x041E1C | LD BC,0x000000 at 0x041E18 | 0x000000 |
| 0x048B6E | LD BC,(IX+252) at 0x048B6B (stack parameter) | (dynamic) |
| 0x05D5C9 | LD BC,(IX+6) at 0x05D5C6 (stack parameter) | (dynamic) |

**0x048B6E**: Saves current D1441D to (IX-4), zeroes D13FD8 context block, then
restores the saved value. This is a save/restore across init, not a new table install.

**0x05D5C9**: The installer function (0x05D5C2) -- reads table base from its first
stack parameter. Called through syscall 0x021E78 by mode-specific code.

## D1441D Readers

| Address | Instruction |
|---------|-------------|
| 0x05D593 | LD HL,(D1441D) |
| 0x048B47 | LD BC,(D1441D) |
| 0x05D5AB | LD BC,(D1441D) |

## Dispatch Callers (0x05D58F)

Found 2 direct callers:
- `0x02BDA3`: reads key code from RAM D141B5, stores result at D141B3
- `0x02BDDE`: reads key code from RAM D141B5, stores result at D141B3

## D13FD8 Context Structure

The 0x448-byte block at D13FD8 is an OS mode context structure:
- Zeroed during mode init at `0x048B5B`
- D1441D (table base pointer) is at offset +0x445 within this block
- The table base pointer points elsewhere (ROM or RAM) to the actual handler table
- Mode switches involve saving/restoring D1441D and installing new tables

## Key Code Source

Key codes come from RAM `D141B5`, loaded by `LD C,(D141B5)` before calling
the dispatch. D141B5 is the "current key buffer" in the OS event system.

## Handler Entry Format

Each table entry is 4 bytes:
- Bytes 0-2: 24-bit handler function address (little-endian)
- Byte 3: flags or padding (purpose TBD)

## Runtime Table Dump

Table base was NULL after OS init -- the handler table is installed later
when a specific mode (home screen, graph, editor, etc.) is entered. Each mode
installs its own key handler table via the `0x05D5C2` installer (syscall
`0x021E78`). A full runtime dump requires deeper boot simulation with mode
entry.

## Architecture Summary

```
Key press -> _GetCSC -> key code stored at D141B5
                            |
                            v
              0x05D58F: key_dispatch_lookup(key_code, dest_buf)
                reads table base from D1441D
                copies 4-byte handler from table[key * 4] to D141B3
                            |
                            v
              0x02B373: post_dispatch_notification_init
                sets up notification structure at D143E7-D14420
                queues handler for execution
                            |
                            v
              handler function called via notification system
```

Key insight: the handler table is MODE-SPECIFIC. Different OS modes install
different tables, enabling each mode to respond differently to the same key.
Three code sites explicitly clear D1441D to 0 (disable key handling), and
one site saves/restores it across temporary mode switches.

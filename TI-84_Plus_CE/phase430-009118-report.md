# Phase 430 - `0x009118` Sequential Priority Init Chain

## Summary

`0x009118..0x009183` is a 108-byte wrapper that performs a **six-slot priority scan** across communication initializers, then falls into a final ungated fallback call if all six miss. The structure is:

1. build a 1-byte stack local via `CALL 0x002197`,
2. try priority 1,
3. if `A == 1`, exit immediately,
4. otherwise try the next priority,
5. after priority 6 fails, call `0x009087` as the terminal fallback and return its `A`.

Important correction versus the earlier six-call assumption: the bytes confirm **six compare-gated priorities plus one extra fallback call**. `0x009087` is not another `CP 1`-guarded slot in the chain.

Direct ROM callers of `0x009118`:

- `0x013006`
- `0x01305B`

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x009118` |
| End | `0x009183` |
| Size | `108` bytes (`0x006C`) |
| Prologue | `LD HL,0xFFFFFF ; CALL 0x002197` |
| Epilogue | `LD SP,IX ; POP IX ; RET` |
| Wrapper RAM access | stack local `(IX-1)` only |
| Wrapper port I/O | none |

## Full Disassembly Annotation

| Address | Bytes | Instruction | Annotation |
| --- | --- | --- | --- |
| `0x009118` | `21 FF FF FF` | `LD HL,0xFFFFFF` | Prepare `HL=-1` for a 1-byte stack local. |
| `0x00911C` | `CD 97 21 00` | `CALL 0x002197` | Common frame setup helper. |
| `0x009120` | `DD 36 FF 00` | `LD (IX-1),0x00` | Initialize local result scratch byte. |
| `0x009124` | `CD F8 89 00` | `CALL 0x0089F8` | Priority 1 attempt. |
| `0x009128` | `DD 77 FF` | `LD (IX-1),A` | Cache priority 1 result. |
| `0x00912B` | `DD 7E FF` | `LD A,(IX-1)` | Reload cached result. |
| `0x00912E` | `FE 01` | `CP 0x01` | Success means `A == 1`. |
| `0x009130` | `28 4D` | `JR Z,0x00917F` | Exit immediately if priority 1 succeeded. |
| `0x009132` | `CD E9 8B 00` | `CALL 0x008BE9` | Priority 2 attempt. |
| `0x009136` | `DD 77 FF` | `LD (IX-1),A` | Cache priority 2 result. |
| `0x009139` | `DD 7E FF` | `LD A,(IX-1)` | Reload cached result. |
| `0x00913C` | `FE 01` | `CP 0x01` | Success means `A == 1`. |
| `0x00913E` | `28 3F` | `JR Z,0x00917F` | Exit immediately if priority 2 succeeded. |
| `0x009140` | `CD A0 8D 00` | `CALL 0x008DA0` | Priority 3 attempt. |
| `0x009144` | `DD 77 FF` | `LD (IX-1),A` | Cache priority 3 result. |
| `0x009147` | `DD 7E FF` | `LD A,(IX-1)` | Reload cached result. |
| `0x00914A` | `FE 01` | `CP 0x01` | Success means `A == 1`. |
| `0x00914C` | `28 31` | `JR Z,0x00917F` | Exit immediately if priority 3 succeeded. |
| `0x00914E` | `CD 16 8F 00` | `CALL 0x008F16` | Priority 4 attempt. |
| `0x009152` | `DD 77 FF` | `LD (IX-1),A` | Cache priority 4 result. |
| `0x009155` | `DD 7E FF` | `LD A,(IX-1)` | Reload cached result. |
| `0x009158` | `FE 01` | `CP 0x01` | Success means `A == 1`. |
| `0x00915A` | `28 23` | `JR Z,0x00917F` | Exit immediately if priority 4 succeeded. |
| `0x00915C` | `CD C3 8F 00` | `CALL 0x008FC3` | Priority 5 attempt. |
| `0x009160` | `DD 77 FF` | `LD (IX-1),A` | Cache priority 5 result. |
| `0x009163` | `DD 7E FF` | `LD A,(IX-1)` | Reload cached result. |
| `0x009166` | `FE 01` | `CP 0x01` | Success means `A == 1`. |
| `0x009168` | `28 15` | `JR Z,0x00917F` | Exit immediately if priority 5 succeeded. |
| `0x00916A` | `CD 4C 90 00` | `CALL 0x00904C` | Priority 6 attempt. |
| `0x00916E` | `DD 77 FF` | `LD (IX-1),A` | Cache priority 6 result. |
| `0x009171` | `DD 7E FF` | `LD A,(IX-1)` | Reload cached result. |
| `0x009174` | `FE 01` | `CP 0x01` | Success means `A == 1`. |
| `0x009176` | `28 07` | `JR Z,0x00917F` | Exit immediately if priority 6 succeeded. |
| `0x009178` | `CD 87 90 00` | `CALL 0x009087` | Terminal fallback if priorities 1-6 all failed. |
| `0x00917C` | `DD 77 FF` | `LD (IX-1),A` | Cache fallback result before returning. |
| `0x00917F` | `DD F9` | `LD SP,IX` | Shared epilogue. |
| `0x009181` | `DD E1` | `POP IX` | Shared epilogue. |
| `0x009183` | `C9` | `RET` | Return to caller. |

## Priority Order

1. `0x0089F8`  
Known from earlier phases as the USB path: it reaches `0x00CC71` with arguments `(0, 2, 2000)`.

2. `0x008BE9`  
Target identified here; not fully decoded in this phase.

3. `0x008DA0`  
Known from earlier phases as the Link path: it reaches `0x00CC71` with arguments `(0, 1, 300)`.

4. `0x008F16`  
Target identified here; not fully decoded in this phase.

5. `0x008FC3`  
Target identified here; not fully decoded in this phase.

6. `0x00904C`  
Target identified here; not fully decoded in this phase.

Fallback. `0x009087`  
Reached only when priorities 1-6 all return something other than `1`.

## How The "First Success Wins" Logic Works

After every priority call, the wrapper executes the same four-instruction postamble:

```text
LD (IX-1),A
LD A,(IX-1)
CP 0x01
JR Z,0x00917F
```

That means:

- the callee's return byte is cached in the single local scratch slot,
- the wrapper tests only for the literal success value `1`,
- a success jumps directly to the shared epilogue,
- no later priorities execute once one returns `1`.

Because `CP` and `JR` do not overwrite `A`, the successful callee's `A` value is still live when the epilogue runs. The wrapper therefore returns the winning callee's status byte directly.

## Early Exit And Fallback Behavior

- Early exit: any of priorities 1-6 may terminate the wrapper immediately if it returns `A=1`.
- Fall-through: if a priority returns any value other than `1`, execution continues to the next slot.
- Final fallback: if priorities 1-6 all miss, control falls through to `CALL 0x009087`.
- Return semantics: the function does **not** encode which priority succeeded. It only returns the byte left in `A` by the successful callee, or by `0x009087` if the chain fell through.

## RAM Variables And Port I/O In `0x009118`

- Local stack scratch:
  - writes at `0x009120`, `0x009128`, `0x009136`, `0x009144`, `0x009152`, `0x009160`, `0x00916E`, `0x00917C`
  - reads at `0x00912B`, `0x009139`, `0x009147`, `0x009155`, `0x009163`, `0x009171`
- Absolute RAM variables referenced directly by this wrapper: none
- Port I/O instructions in this wrapper: none

## Conclusion

`0x009118` is a compact dispatcher that tries **six ordered initializer slots** and stops on the first `A=1`. If all six fail, it performs one last fallback call to `0x009087` and returns that result. The wrapper itself has no global RAM or I/O side effects beyond its one-byte local scratch slot.

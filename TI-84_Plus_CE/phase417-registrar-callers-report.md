# Phase 417: Callback Registrar Caller Analysis

## Registrar Decode

Entry: 0x01069C (vector #55 at 0x0005E0)

```
0x01069C: CALL 0x00218A (frame_setup)   ; IX frame builder
0x0106A0: LD HL,(IX+0x06)            ; load slot index from stack param
0x0106A3: CALL 0x002623 (_seqcase)    ; _seqcase inline switch on HL
```

### Inline _seqcase Table

Count: 5, Lower bound: 1 (1-based indexing)

| Selector | Target | Slot | RAM Address | Action |
| --- | --- | --- | --- | --- |
| 1 | `0x0106BE` | 0 | `0xD177BD` | LD BC,(IX+0x09) then LD (0xD177BD),BC |
| 2 | `0x0106C8` | 1 | `0xD177C0` | LD BC,(IX+0x09) then LD (0xD177C0),BC |
| 3 | `0x0106D2` | 2 | `0xD177C3` | LD BC,(IX+0x09) then LD (0xD177C3),BC |
| 4 | `0x0106DC` | 3 | `0xD177C6` | LD BC,(IX+0x09) then LD (0xD177C6),BC |
| 5 | `0x0106E6` | 4 | `0xD177C9` | LD BC,(IX+0x09) then LD (0xD177C9),BC |
| default | `0x0106EE` | - | - | epilogue (no-op) |

Selector is the **stack parameter at (IX+6)**, not A or BC. Valid range: 1-5. Out-of-range values silently do nothing.

### Case Handler Disassembly

```
  0x0106BE: DD 07 09         LD BC,(IX+0x09)
  0x0106C1: ED 43 BD 77 D1   LD (0xD177BD),BC
  0x0106C6: 18 26            JR 0x0106EE
  0x0106C8: DD 07 09         LD BC,(IX+0x09)
  0x0106CB: ED 43 C0 77 D1   LD (0xD177C0),BC
  0x0106D0: 18 1C            JR 0x0106EE
  0x0106D2: DD 07 09         LD BC,(IX+0x09)
  0x0106D5: ED 43 C3 77 D1   LD (0xD177C3),BC
  0x0106DA: 18 12            JR 0x0106EE
  0x0106DC: DD 07 09         LD BC,(IX+0x09)
  0x0106DF: ED 43 C6 77 D1   LD (0xD177C6),BC
  0x0106E4: 18 08            JR 0x0106EE
  0x0106E6: DD 07 09         LD BC,(IX+0x09)
  0x0106E9: ED 43 C9 77 D1   LD (0xD177C9),BC
  0x0106EE: DD F9            LD SP,IX
  0x0106F0: DD E1            POP IX
  0x0106F2: C9               RET
```

## Caller Search

CALL 0x0005E0 (vector entry): 2 hits at 0x5F789, 0x5F7A1
JP 0x0005E0: 0 hits
CALL 0x01069C (direct): 0 hits
JP 0x01069C (direct): 0 hits (excludes vector table entry)

**Total ROM callers: 2**

## Caller Table

| caller_addr | callback_addr_in_BC | slot_index | notes |
| --- | --- | --- | --- |
| `0x05F789` | pass-through from (IX+0x09) | pass-through from (IX+0x06) | register wrapper: forwards both params from its own caller |
| `0x05F7A1` | 0x000000 (clear) | pass-through from (IX+0x06) | unregister wrapper: hardcodes callback=0, forwards slot index from caller |

## Caller Context Disassembly

### lcd_RegisterCallback at 0x05F77D

```
  0x05F77D: CD 30 01 00      CALL 0x000130 (vec_frame_setup)
  0x05F781: DD 07 09         LD BC,(IX+0x09)
  0x05F784: C5               PUSH BC
  0x05F785: DD 07 06         LD BC,(IX+0x06)
  0x05F788: C5               PUSH BC
  0x05F789: CD E0 05 00      CALL 0x0005E0 (vec55_registrar)
  0x05F78D: C1               POP BC
  0x05F78E: C1               POP BC
  0x05F78F: DD F9            LD SP,IX
  0x05F791: DD E1            POP IX
  0x05F793: C9               RET
```

### lcd_UnregisterCallback at 0x05F794

```
  0x05F794: CD 30 01 00      CALL 0x000130 (vec_frame_setup)
  0x05F798: 01 00 00 00      LD BC,0x000000
  0x05F79C: C5               PUSH BC
  0x05F79D: DD 07 06         LD BC,(IX+0x06)
  0x05F7A0: C5               PUSH BC
  0x05F7A1: CD E0 05 00      CALL 0x0005E0 (vec55_registrar)
  0x05F7A5: C1               POP BC
  0x05F7A6: C1               POP BC
  0x05F7A7: DD F9            LD SP,IX
  0x05F7A9: DD E1            POP IX
  0x05F7AB: C9               RET
```

## Wrapper Reachability

| Wrapper | Address | CALL refs in ROM | JP refs in ROM | Data refs | Conclusion |
| --- | --- | --- | --- | --- | --- |
| `lcd_RegisterCallback` | `0x05F77D` | 0 | 0 | 0 | **Not called within ROM** -- app-only C API |
| `lcd_UnregisterCallback` | `0x05F794` | 0 | 0 | 0 | **Not called within ROM** -- app-only C API |

Neither wrapper function is referenced anywhere in the 4 MB ROM. They are C SDK library exports callable only by user applications loaded into RAM at runtime.

## Teardown

The bulk-clear at `0x010F00` (vector #32 at `0x000584`) zeroes all 5 slots:

```
  0x010F00: CD 8A 21 00      CALL 0x00218A (frame_setup)
  0x010F04: CD F5 0A 01      CALL 0x010AF5
  0x010F08: CD EF 7A 00      CALL 0x007AEF
  0x010F0C: B7               DB 0xB7
  0x010F0D: 20               DB 0x20
  0x010F0E: F9               DB 0xF9
  0x010F0F: 01 00 00 00      LD BC,0x000000
  0x010F13: ED 43 BD 77 D1   LD (0xD177BD),BC
  0x010F18: ED 43 C0 77 D1   LD (0xD177C0),BC
  0x010F1D: ED 43 C3 77 D1   LD (0xD177C3),BC
  0x010F22: ED 43 C6 77 D1   LD (0xD177C6),BC
  0x010F27: ED 43 C9 77 D1   LD (0xD177C9),BC
```

Teardown callers: 1 (at 0x5FDF9)

## Summary

| Slot | RAM Addr | Selector (1-based) | Registered By | Cleared By | Dispatched From |
| --- | --- | --- | --- | --- | --- |
| 0 | `0xD177BD` | 1 | `lcd_RegisterCallback(1, cb)` | `lcd_UnregisterCallback(1)` or teardown | `0x010269` |
| 1 | `0xD177C0` | 2 | `lcd_RegisterCallback(2, cb)` | `lcd_UnregisterCallback(2)` or teardown | `0x0102A4` |
| 2 | `0xD177C3` | 3 | `lcd_RegisterCallback(3, cb)` | `lcd_UnregisterCallback(3)` or teardown | `0x0102C9` |
| 3 | `0xD177C6` | 4 | `lcd_RegisterCallback(4, cb)` | `lcd_UnregisterCallback(4)` or teardown | `0x0102F2` |
| 4 | `0xD177C9` | 5 | `lcd_RegisterCallback(5, cb)` | `lcd_UnregisterCallback(5)` or teardown | `0x010389` |

## Conclusions

1. The registrar is a clean OS API: 1-based slot index and callback address are passed on the stack. A `_seqcase` inline switch dispatches to 5 identical store handlers.
2. Only 2 ROM callers exist, both in the SDK C wrapper layer. `lcd_RegisterCallback` at `0x05F77D` forwards both parameters; `lcd_UnregisterCallback` at `0x05F794` hardcodes callback=0x000000.
3. Neither wrapper is referenced anywhere in ROM. They are exported C API functions for user applications, confirming the D177BD table is a **user-facing display callback API**.
4. No in-ROM caller passes a concrete nonzero callback address. The only hardcoded BC value is 0x000000 (clear). Actual callback addresses come from user applications at runtime.
5. The teardown at `0x010F00` bulk-clears all 5 slots, called from a single SDK wrapper at `0x05FDF9`.
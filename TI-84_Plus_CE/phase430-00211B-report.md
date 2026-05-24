# Phase 430 Report: 0x00211B Inline Case Dispatcher

## Function Summary

| Field | Value |
|-------|-------|
| Address | `0x00211B` - `0x002150` |
| Size | 54 bytes |
| Call sites | 22 |
| Total inline table entries | 119 |
| Total inline table bytes | 586 |
| Entry count range | 2 - 11 |

## Algorithm Pseudocode

```
// Caller convention: HL = zero-extended dispatch key (OR A; SBC HL,HL; LD L,A)
// Inline table follows immediately after the CALL instruction

function dispatch_00211B():
    IY = pop_return_address()      // EX (SP), IY
    save AF, BC, DE

    count = read16_LE(IY)          // 2-byte LE entry count
    IY += 2                        // advance past count field

    for i = count downto 1:
        case_byte = read8(IY)      // 1-byte case value
        IY += 1
        if HL == case_byte:        // 24-bit compare (SBC HL, BC)
            target = read24_LE(IY) // 3-byte LE target address
            restore AF, BC, DE, IY
            jump target
        IY += 3                    // skip 3-byte target addr

    // No match: fall through to default
    fallthrough = read24_LE(IY)    // 3-byte LE default address
    restore AF, BC, DE, IY
    jump fallthrough
```

## Inline Table Format

Immediately after `CALL 0x00211B`:

```
Offset    Size  Description
+0        2     Entry count (little-endian 16-bit)
+2        1     Case byte 0
+3        3     Target address 0 (little-endian 24-bit)
+6        1     Case byte 1
+7        3     Target address 1
...
+2+N*4    3     Fall-through address (default handler, little-endian 24-bit)
```

Total table size: `2 + N*4 + 3` bytes.

## Disassembly

```
0x00211b  FD E3          EX (SP), IY              ; IY = return addr (inline table ptr); old IY pushed
0x00211d  F5             PUSH AF                  ; save A (dispatch key)
0x00211e  C5             PUSH BC                  ; save BC
0x00211f  D5             PUSH DE                  ; save DE
0x002120  ED 33 02       LEA IY, IY+2             ; skip 2-byte count field; IY -> first entry
0x002123  FD 17 FE       LD DE, (IY-2)            ; DE = entry count (2-byte LE from count field)
0x002126  01 00 00 00    LD BC, 0x000000          ; zero BC (loop top — re-entered on miss)
0x00212a  FD 4E 00       LD C, (IY+0)             ; C = case byte from current entry
0x00212d  FD 23          INC IY                   ; IY past case byte, now -> 3-byte target addr
0x00212f  E5             PUSH HL                  ; save HL (dispatch key, zero-extended A)
0x002130  B7             OR A                     ; clear carry for SBC
0x002131  ED 42          SBC HL, BC               ; HL -= BC; Z flag set if HL == case byte
0x002133  E1             POP HL                   ; restore HL (key value)
0x002134  28 11          JR Z, +0x11              ; match -> jump to 0x002147 (read target addr)
0x002136  52 1B          DEC.SIL DE               ; decrement entry counter (16-bit in SIL mode)
0x002138  06 00          LD B, 0x00               ; ensure B=0 (re-zero high byte of BC)
0x00213a  0E 00          LD C, 0x00               ; C=0 (will be overwritten at loop top)
0x00213c  EB             EX DE, HL                ; HL = counter, DE = key
0x00213d  B7             OR A                     ; clear carry
0x00213e  52 ED 42       SBC.SIL HL, BC           ; HL -= 0; sets Z if counter == 0
0x002141  EB             EX DE, HL                ; restore: DE = counter, HL = key
0x002142  ED 33 03       LEA IY, IY+3             ; skip 3-byte addr field; IY -> next entry
0x002145  20 DF          JR NZ, -0x21             ; counter != 0 -> loop back to 0x002126
0x002147  FD 27 00       LD HL, (IY+0)            ; HL = target addr (match) or fall-through addr (exhausted)
0x00214a  D1             POP DE                   ; restore DE
0x00214b  C1             POP BC                   ; restore BC
0x00214c  F1             POP AF                   ; restore AF
0x00214d  FD E3          EX (SP), IY              ; restore old IY; push IY-derived value
0x00214f  E3             EX (SP), HL              ; push target addr onto stack top
0x002150  C9             RET                      ; pop target addr -> jump to handler
```

## Comparison with _seqcase (0x002623)

| Feature | 0x00211B (sparse) | 0x002623 (sequential) |
|---------|-------------------|-----------------------|
| Table format | 1-byte case + 3-byte addr per entry | Dense sequential: 3-byte addr per index |
| Lookup | Linear scan, O(N) | Direct index, O(1) |
| Use case | Sparse/non-contiguous case values | Contiguous 0..N case values |
| Entry size | 4 bytes each | 3 bytes each |
| Count field | 2-byte LE | 1-byte |

## Call Sites and Case Tables

### 0x0085f7 (11 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x00` | `0x00862c` | |
| `0x01` | `0x00862c` | |
| `0x02` | `0x00862c` | |
| `0x03` | `0x00862c` | |
| `0x04` | `0x008632` | |
| `0x10` | `0x008632` | |
| `0x11` | `0x008632` | |
| `0x12` | `0x008632` | |
| `0x13` | `0x008632` | |
| `0x14` | `0x008632` | |
| `0x15` | `0x008632` | |
| *default* | `0x00862e` | fall-through |

### 0x008659 (11 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x00` | `0x00868e` | |
| `0x01` | `0x0086b8` | |
| `0x02` | `0x0086d8` | |
| `0x03` | `0x00870b` | |
| `0x04` | `0x008834` | |
| `0x10` | `0x008747` | |
| `0x11` | `0x00876f` | |
| `0x12` | `0x008796` | |
| `0x13` | `0x0087be` | |
| `0x14` | `0x0087f0` | |
| `0x15` | `0x008806` | |
| *default* | `0x008830` | fall-through |

### 0x0086bf (2 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x20` | `0x0086d0` | |
| `0x21` | `0x0086d0` | |
| *default* | `0x008834` | fall-through |

### 0x00874e (4 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x80` | `0x008767` | |
| `0x81` | `0x008767` | |
| `0x82` | `0x008767` | |
| `0xff` | `0x008767` | |
| *default* | `0x008834` | fall-through |

### 0x0087c5 (7 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x08` | `0x0087ea` | |
| `0x96` | `0x0087ea` | |
| `0x97` | `0x0087ea` | |
| `0x98` | `0x0087ea` | |
| `0x99` | `0x0087ea` | |
| `0x9a` | `0x0087ea` | |
| `0x9b` | `0x0087ea` | |
| *default* | `0x008834` | fall-through |

### 0x00880d (5 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x8c` | `0x00882a` | |
| `0x8e` | `0x00882a` | |
| `0x8f` | `0x00882a` | |
| `0x90` | `0x00882a` | |
| `0x91` | `0x00882a` | |
| *default* | `0x008834` | fall-through |

### 0x0088a8 (11 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x00` | `0x0088dd` | |
| `0x01` | `0x0088e6` | |
| `0x02` | `0x0088ef` | |
| `0x03` | `0x0088f8` | |
| `0x04` | `0x008901` | |
| `0x10` | `0x00890a` | |
| `0x11` | `0x008913` | |
| `0x12` | `0x00891c` | |
| `0x13` | `0x008925` | |
| `0x14` | `0x00892e` | |
| `0x15` | `0x008937` | |
| *default* | `0x008940` | fall-through |

### 0x008966 (10 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x00` | `0x008997` | |
| `0x01` | `0x0089a0` | |
| `0x02` | `0x0089a9` | |
| `0x03` | `0x0089b2` | |
| `0x04` | `0x0089bb` | |
| `0x10` | `0x0089c4` | |
| `0x11` | `0x0089cd` | |
| `0x12` | `0x0089d6` | |
| `0x13` | `0x0089df` | |
| `0x14` | `0x0089e8` | |
| *default* | `0x0089ef` | fall-through |

### 0x008a10 (8 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x41` | `0x008af6` | |
| `0x45` | `0x008a39` | |
| `0x46` | `0x008a85` | |
| `0x47` | `0x008b57` | |
| `0xc0` | `0x008b7d` | |
| `0xc1` | `0x008bbb` | |
| `0xc2` | `0x008bbb` | |
| `0xc4` | `0x008be1` | |
| *default* | `0x008bdd` | fall-through |

### 0x008db4 (4 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x80` | `0x008dcd` | |
| `0x81` | `0x008ea6` | |
| `0x82` | `0x008e94` | |
| `0xff` | `0x008f0e` | |
| *default* | `0x008f0a` | fall-through |

### 0x008fd7 (5 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x8c` | `0x009006` | |
| `0x8e` | `0x008ff4` | |
| `0x8f` | `0x008ff4` | |
| `0x90` | `0x008ff4` | |
| `0x91` | `0x008ff4` | |
| *default* | `0x009040` | fall-through |

### 0x009229 (2 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x20` | `0x009262` | |
| `0x21` | `0x00923a` | |
| *default* | `0x00927a` | fall-through |

### 0x00929a (4 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x06` | `0x009300` | |
| `0x07` | `0x009314` | |
| `0x08` | `0x0092b3` | |
| `0x10` | `0x00931e` | |
| *default* | `0x009349` | fall-through |

### 0x009369 (2 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x44` | `0x00937a` | |
| `0x45` | `0x00937a` | |
| *default* | `0x009384` | fall-through |

### 0x00a159 (8 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x01` | `0x00a182` | |
| `0x02` | `0x00a19c` | |
| `0x03` | `0x00a28b` | |
| `0x04` | `0x00a2f3` | |
| `0x05` | `0x00a2f6` | |
| `0x06` | `0x00a2f9` | |
| `0x07` | `0x00a2fc` | |
| `0x22` | `0x00a2ff` | |
| *default* | `0x00a329` | fall-through |

### 0x00a40d (2 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x01` | `0x00a41e` | |
| `0x02` | `0x00a436` | |
| *default* | `0x00a44e` | fall-through |

### 0x00a836 (3 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0xf8` | `0x00a8a2` | |
| `0xf9` | `0x00a86c` | |
| `0xff` | `0x00a84b` | |
| *default* | `0x00a8b8` | fall-through |

### 0x00ce16 (6 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x01` | `0x00ce37` | |
| `0x02` | `0x00ce37` | |
| `0x03` | `0x00ce37` | |
| `0x09` | `0x00ce43` | |
| `0x0a` | `0x00ce3d` | |
| `0x0b` | `0x00ce43` | |
| *default* | `0x00ce6b` | fall-through |

### 0x00e07c (2 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x00` | `0x00e09e` | |
| `0x02` | `0x00e169` | |
| *default* | `0x00e1c4` | fall-through |

### 0x00e1e1 (2 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x00` | `0x00e1f2` | |
| `0x02` | `0x00e294` | |
| *default* | `0x00e2e6` | fall-through |

### 0x011119 (4 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x02` | `0x011132` | |
| `0x04` | `0x0113b7` | |
| `0x05` | `0x0113b7` | |
| `0x07` | `0x011443` | |
| *default* | `0x011499` | fall-through |

### 0x011b5a (6 entries)

| Case | Target | Notes |
|------|--------|-------|
| `0x00` | `0x011c1e` | |
| `0x01` | `0x011c27` | |
| `0x09` | `0x011b7b` | |
| `0x1c` | `0x011bc0` | |
| `0x1d` | `0x011be6` | |
| `0x1e` | `0x011b9a` | |
| *default* | `0x011c27` | fall-through |

## Address Clusters

The 22 call sites cluster in these ROM regions:

- **0x008000-0x009000**: 11 site(s)
- **0x009000-0x00a000**: 3 site(s)
- **0x00a000-0x00b000**: 3 site(s)
- **0x00c000-0x00d000**: 1 site(s)
- **0x00e000-0x00f000**: 2 site(s)
- **0x011000-0x012000**: 2 site(s)

## Known Identifications

- **0x008A10**: USB event handler (cases 0x41, 0x45, 0x46, 0x47, 0xC0, 0xC1, 0xC2, 0xC4) -- session 429

## Statistics

- Unique case values used: 50
- Unique target addresses: 104
- Target validation: ALL PASS (all targets in ROM range 0x000100-0x3FFFFF)

# Phase 430 — D141BE Data Source Buffer Trace

ROM: 4194304 bytes (4.0 MB)

## Summary

| Address | Total | READs | WRITEs | ADDR_LOADs | CALLs | JUMPs | DATA |
|---------|-------|-------|--------|------------|-------|-------|------|
| D141BD | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| D141BE | 54 | 47 | 7 | 0 | 0 | 0 | 0 |
| D141BF | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| D141C0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Variable Size

D141BF and D141C0 have zero references.
D141BE is likely a **1-byte variable** or accessed only via pointer/index register.

## D141BE References

| ROM addr | Instr addr | Type | Mnemonic | Function range | Function size |
|----------|------------|------|----------|----------------|---------------|
| 0x00CF54 | 0x00CF52 | READ | LD BC,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00CF6E | 0x00CF6C | READ | LD BC,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00CFE4 | 0x00CFE2 | READ | LD BC,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00CFFE | 0x00CFFD | READ | LD HL,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00D0D7 | 0x00D0D5 | READ | LD BC,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00D153 | 0x00D152 | READ | LD HL,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00D16E | 0x00D16D | READ | LD HL,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00D187 | 0x00D186 | READ | LD HL,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00D199 | 0x00D197 | READ | LD BC,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00D2D6 | 0x00D2D4 | READ | LD BC,(nn) | 0x00CD7B-0x00D2EC | 1394 |
| 0x00E36F | 0x00E36E | WRITE | LD (nn),HL | 0x00E2EB-0x00E4E7 | 509 |
| 0x00E373 | 0x00E372 | READ | LD HL,(nn) | 0x00E2EB-0x00E4E7 | 509 |
| 0x02F5B6 | 0x02F5B5 | READ | LD HL,(nn) | 0x02F574-0x02F5FE | 139 |
| 0x02F5C7 | 0x02F5C6 | READ | LD HL,(nn) | 0x02F574-0x02F5FE | 139 |
| 0x03164E | 0x03164C | READ | LD IY,(nn) | 0x031550-0x03179B | 588 |
| 0x031753 | 0x031751 | READ | LD IY,(nn) | 0x031550-0x03179B | 588 |
| 0x031CE8 | 0x031CE6 | READ | LD BC,(nn) | 0x031CBA-0x031D10 | 87 |
| 0x031CFD | 0x031CFB | WRITE | LD (nn),BC | 0x031CBA-0x031D10 | 87 |
| 0x032548 | 0x032547 | READ | LD HL,(nn) | 0x0324E2-0x0325F1 | 272 |
| 0x032557 | 0x032556 | READ | LD HL,(nn) | 0x0324E2-0x0325F1 | 272 |
| 0x032569 | 0x032567 | READ | LD BC,(nn) | 0x0324E2-0x0325F1 | 272 |
| 0x032576 | 0x032574 | READ | LD BC,(nn) | 0x0324E2-0x0325F1 | 272 |
| 0x032B11 | 0x032B0F | READ | LD BC,(nn) | 0x032A8E-0x032E44 | 951 |
| 0x032B22 | 0x032B20 | READ | LD IY,(nn) | 0x032A8E-0x032E44 | 951 |
| 0x032F69 | 0x032F67 | READ | LD BC,(nn) | 0x032E45-0x0331F8 | 948 |
| 0x032FE4 | 0x032FE3 | READ | LD HL,(nn) | 0x032E45-0x0331F8 | 948 |
| 0x03314D | 0x03314B | READ | LD BC,(nn) | 0x032E45-0x0331F8 | 948 |
| 0x03315D | 0x03315B | READ | LD BC,(nn) | 0x032E45-0x0331F8 | 948 |
| 0x033178 | 0x033176 | READ | LD IY,(nn) | 0x032E45-0x0331F8 | 948 |
| 0x033189 | 0x033187 | READ | LD IY,(nn) | 0x032E45-0x0331F8 | 948 |
| 0x033198 | 0x033196 | READ | LD BC,(nn) | 0x032E45-0x0331F8 | 948 |
| 0x03364B | 0x03364A | READ | LD HL,(nn) | 0x0335B4-0x033685 | 210 |
| 0x033672 | 0x033671 | READ | LD HL,(nn) | 0x0335B4-0x033685 | 210 |
| 0x037697 | 0x037695 | READ | LD BC,(nn) | 0x03767C-0x0376BF | 68 |
| 0x0376AC | 0x0376AA | WRITE | LD (nn),BC | 0x03767C-0x0376BF | 68 |
| 0x038C64 | 0x038C62 | READ | LD BC,(nn) | 0x038A2D-0x038CC2 | 662 |
| 0x038C79 | 0x038C77 | WRITE | LD (nn),BC | 0x038A2D-0x038CC2 | 662 |
| 0x039419 | 0x039417 | READ | LD BC,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x039433 | 0x039431 | READ | LD BC,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x0394A9 | 0x0394A7 | READ | LD BC,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x0394C3 | 0x0394C2 | READ | LD HL,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x03959C | 0x03959A | READ | LD BC,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x039618 | 0x039617 | READ | LD HL,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x039633 | 0x039632 | READ | LD HL,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x03964C | 0x03964B | READ | LD HL,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x03965E | 0x03965C | READ | LD BC,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x03979B | 0x039799 | READ | LD BC,(nn) | 0x0391DC-0x0397B1 | 1494 |
| 0x03B547 | 0x03B546 | WRITE | LD (nn),HL | 0x03B4A5-0x03B722 | 638 |
| 0x03B54B | 0x03B54A | READ | LD HL,(nn) | 0x03B4A5-0x03B722 | 638 |
| 0x03CC46 | 0x03CC45 | READ | LD HL,(nn) | 0x03CB9A-0x03CC69 | 208 |
| 0x071255 | 0x071253 | READ | LD BC,(nn) | 0x0711AB-0x0712F9 | 335 |
| 0x07126A | 0x071268 | WRITE | LD (nn),BC | 0x0711AB-0x0712F9 | 335 |
| 0x0712D1 | 0x0712CF | READ | LD BC,(nn) | 0x0711AB-0x0712F9 | 335 |
| 0x0712E6 | 0x0712E4 | WRITE | LD (nn),BC | 0x0711AB-0x0712F9 | 335 |

## Writers (store to D141BE)

| Instr addr | Mnemonic | Function range |
|------------|----------|----------------|
| 0x00E36E | LD (nn),HL | 0x00E2EB-0x00E4E7 |
| 0x031CFB | LD (nn),BC | 0x031CBA-0x031D10 |
| 0x0376AA | LD (nn),BC | 0x03767C-0x0376BF |
| 0x038C77 | LD (nn),BC | 0x038A2D-0x038CC2 |
| 0x03B546 | LD (nn),HL | 0x03B4A5-0x03B722 |
| 0x071268 | LD (nn),BC | 0x0711AB-0x0712F9 |
| 0x0712E4 | LD (nn),BC | 0x0711AB-0x0712F9 |

## Readers (load from D141BE)

| Instr addr | Mnemonic | Function range |
|------------|----------|----------------|
| 0x00CF52 | LD BC,(nn) | 0x00CD7B-0x00D2EC |
| 0x00CF6C | LD BC,(nn) | 0x00CD7B-0x00D2EC |
| 0x00CFE2 | LD BC,(nn) | 0x00CD7B-0x00D2EC |
| 0x00CFFD | LD HL,(nn) | 0x00CD7B-0x00D2EC |
| 0x00D0D5 | LD BC,(nn) | 0x00CD7B-0x00D2EC |
| 0x00D152 | LD HL,(nn) | 0x00CD7B-0x00D2EC |
| 0x00D16D | LD HL,(nn) | 0x00CD7B-0x00D2EC |
| 0x00D186 | LD HL,(nn) | 0x00CD7B-0x00D2EC |
| 0x00D197 | LD BC,(nn) | 0x00CD7B-0x00D2EC |
| 0x00D2D4 | LD BC,(nn) | 0x00CD7B-0x00D2EC |
| 0x00E372 | LD HL,(nn) | 0x00E2EB-0x00E4E7 |
| 0x02F5B5 | LD HL,(nn) | 0x02F574-0x02F5FE |
| 0x02F5C6 | LD HL,(nn) | 0x02F574-0x02F5FE |
| 0x03164C | LD IY,(nn) | 0x031550-0x03179B |
| 0x031751 | LD IY,(nn) | 0x031550-0x03179B |
| 0x031CE6 | LD BC,(nn) | 0x031CBA-0x031D10 |
| 0x032547 | LD HL,(nn) | 0x0324E2-0x0325F1 |
| 0x032556 | LD HL,(nn) | 0x0324E2-0x0325F1 |
| 0x032567 | LD BC,(nn) | 0x0324E2-0x0325F1 |
| 0x032574 | LD BC,(nn) | 0x0324E2-0x0325F1 |
| 0x032B0F | LD BC,(nn) | 0x032A8E-0x032E44 |
| 0x032B20 | LD IY,(nn) | 0x032A8E-0x032E44 |
| 0x032F67 | LD BC,(nn) | 0x032E45-0x0331F8 |
| 0x032FE3 | LD HL,(nn) | 0x032E45-0x0331F8 |
| 0x03314B | LD BC,(nn) | 0x032E45-0x0331F8 |
| 0x03315B | LD BC,(nn) | 0x032E45-0x0331F8 |
| 0x033176 | LD IY,(nn) | 0x032E45-0x0331F8 |
| 0x033187 | LD IY,(nn) | 0x032E45-0x0331F8 |
| 0x033196 | LD BC,(nn) | 0x032E45-0x0331F8 |
| 0x03364A | LD HL,(nn) | 0x0335B4-0x033685 |
| 0x033671 | LD HL,(nn) | 0x0335B4-0x033685 |
| 0x037695 | LD BC,(nn) | 0x03767C-0x0376BF |
| 0x038C62 | LD BC,(nn) | 0x038A2D-0x038CC2 |
| 0x039417 | LD BC,(nn) | 0x0391DC-0x0397B1 |
| 0x039431 | LD BC,(nn) | 0x0391DC-0x0397B1 |
| 0x0394A7 | LD BC,(nn) | 0x0391DC-0x0397B1 |
| 0x0394C2 | LD HL,(nn) | 0x0391DC-0x0397B1 |
| 0x03959A | LD BC,(nn) | 0x0391DC-0x0397B1 |
| 0x039617 | LD HL,(nn) | 0x0391DC-0x0397B1 |
| 0x039632 | LD HL,(nn) | 0x0391DC-0x0397B1 |
| 0x03964B | LD HL,(nn) | 0x0391DC-0x0397B1 |
| 0x03965C | LD BC,(nn) | 0x0391DC-0x0397B1 |
| 0x039799 | LD BC,(nn) | 0x0391DC-0x0397B1 |
| 0x03B54A | LD HL,(nn) | 0x03B4A5-0x03B722 |
| 0x03CC45 | LD HL,(nn) | 0x03CB9A-0x03CC69 |
| 0x071253 | LD BC,(nn) | 0x0711AB-0x0712F9 |
| 0x0712CF | LD BC,(nn) | 0x0711AB-0x0712F9 |

## Address Loaders (load &D141BE into register)

No address loads found.

## Grouped by Containing Function

### Function 0x00CD7B-0x00D2EC (1394 bytes)

- 0x00CF52: READ — LD BC,(nn)
- 0x00CF6C: READ — LD BC,(nn)
- 0x00CFE2: READ — LD BC,(nn)
- 0x00CFFD: READ — LD HL,(nn)
- 0x00D0D5: READ — LD BC,(nn)
- 0x00D152: READ — LD HL,(nn)
- 0x00D16D: READ — LD HL,(nn)
- 0x00D186: READ — LD HL,(nn)
- 0x00D197: READ — LD BC,(nn)
- 0x00D2D4: READ — LD BC,(nn)

### Function 0x00E2EB-0x00E4E7 (509 bytes)

- 0x00E36E: WRITE — LD (nn),HL
- 0x00E372: READ — LD HL,(nn)

### Function 0x02F574-0x02F5FE (139 bytes)

- 0x02F5B5: READ — LD HL,(nn)
- 0x02F5C6: READ — LD HL,(nn)

### Function 0x031550-0x03179B (588 bytes)

- 0x03164C: READ — LD IY,(nn)
- 0x031751: READ — LD IY,(nn)

### Function 0x031CBA-0x031D10 (87 bytes)

- 0x031CE6: READ — LD BC,(nn)
- 0x031CFB: WRITE — LD (nn),BC

### Function 0x0324E2-0x0325F1 (272 bytes)

- 0x032547: READ — LD HL,(nn)
- 0x032556: READ — LD HL,(nn)
- 0x032567: READ — LD BC,(nn)
- 0x032574: READ — LD BC,(nn)

### Function 0x032A8E-0x032E44 (951 bytes)

- 0x032B0F: READ — LD BC,(nn)
- 0x032B20: READ — LD IY,(nn)

### Function 0x032E45-0x0331F8 (948 bytes)

- 0x032F67: READ — LD BC,(nn)
- 0x032FE3: READ — LD HL,(nn)
- 0x03314B: READ — LD BC,(nn)
- 0x03315B: READ — LD BC,(nn)
- 0x033176: READ — LD IY,(nn)
- 0x033187: READ — LD IY,(nn)
- 0x033196: READ — LD BC,(nn)

### Function 0x0335B4-0x033685 (210 bytes)

- 0x03364A: READ — LD HL,(nn)
- 0x033671: READ — LD HL,(nn)

### Function 0x03767C-0x0376BF (68 bytes)

- 0x037695: READ — LD BC,(nn)
- 0x0376AA: WRITE — LD (nn),BC

### Function 0x038A2D-0x038CC2 (662 bytes)

- 0x038C62: READ — LD BC,(nn)
- 0x038C77: WRITE — LD (nn),BC

### Function 0x0391DC-0x0397B1 (1494 bytes)

- 0x039417: READ — LD BC,(nn)
- 0x039431: READ — LD BC,(nn)
- 0x0394A7: READ — LD BC,(nn)
- 0x0394C2: READ — LD HL,(nn)
- 0x03959A: READ — LD BC,(nn)
- 0x039617: READ — LD HL,(nn)
- 0x039632: READ — LD HL,(nn)
- 0x03964B: READ — LD HL,(nn)
- 0x03965C: READ — LD BC,(nn)
- 0x039799: READ — LD BC,(nn)

### Function 0x03B4A5-0x03B722 (638 bytes)

- 0x03B546: WRITE — LD (nn),HL
- 0x03B54A: READ — LD HL,(nn)

### Function 0x03CB9A-0x03CC69 (208 bytes)

- 0x03CC45: READ — LD HL,(nn)

### Function 0x0711AB-0x0712F9 (335 bytes)

- 0x071253: READ — LD BC,(nn)
- 0x071268: WRITE — LD (nn),BC
- 0x0712CF: READ — LD BC,(nn)
- 0x0712E4: WRITE — LD (nn),BC

## Data Flow

```
Source → D141BE → Consumers

Writers:
  0x00E36E LD (nn),HL (func 0x00E2EB)
  0x031CFB LD (nn),BC (func 0x031CBA)
  0x0376AA LD (nn),BC (func 0x03767C)
  0x038C77 LD (nn),BC (func 0x038A2D)
  0x03B546 LD (nn),HL (func 0x03B4A5)
  0x071268 LD (nn),BC (func 0x0711AB)
  0x0712E4 LD (nn),BC (func 0x0711AB)

Readers:
  0x00CF52 LD BC,(nn) (func 0x00CD7B)
  0x00CF6C LD BC,(nn) (func 0x00CD7B)
  0x00CFE2 LD BC,(nn) (func 0x00CD7B)
  0x00CFFD LD HL,(nn) (func 0x00CD7B)
  0x00D0D5 LD BC,(nn) (func 0x00CD7B)
  0x00D152 LD HL,(nn) (func 0x00CD7B)
  0x00D16D LD HL,(nn) (func 0x00CD7B)
  0x00D186 LD HL,(nn) (func 0x00CD7B)
  0x00D197 LD BC,(nn) (func 0x00CD7B)
  0x00D2D4 LD BC,(nn) (func 0x00CD7B)
  0x00E372 LD HL,(nn) (func 0x00E2EB)
  0x02F5B5 LD HL,(nn) (func 0x02F574)
  0x02F5C6 LD HL,(nn) (func 0x02F574)
  0x03164C LD IY,(nn) (func 0x031550)
  0x031751 LD IY,(nn) (func 0x031550)
  0x031CE6 LD BC,(nn) (func 0x031CBA)
  0x032547 LD HL,(nn) (func 0x0324E2)
  0x032556 LD HL,(nn) (func 0x0324E2)
  0x032567 LD BC,(nn) (func 0x0324E2)
  0x032574 LD BC,(nn) (func 0x0324E2)
  0x032B0F LD BC,(nn) (func 0x032A8E)
  0x032B20 LD IY,(nn) (func 0x032A8E)
  0x032F67 LD BC,(nn) (func 0x032E45)
  0x032FE3 LD HL,(nn) (func 0x032E45)
  0x03314B LD BC,(nn) (func 0x032E45)
  0x03315B LD BC,(nn) (func 0x032E45)
  0x033176 LD IY,(nn) (func 0x032E45)
  0x033187 LD IY,(nn) (func 0x032E45)
  0x033196 LD BC,(nn) (func 0x032E45)
  0x03364A LD HL,(nn) (func 0x0335B4)
  0x033671 LD HL,(nn) (func 0x0335B4)
  0x037695 LD BC,(nn) (func 0x03767C)
  0x038C62 LD BC,(nn) (func 0x038A2D)
  0x039417 LD BC,(nn) (func 0x0391DC)
  0x039431 LD BC,(nn) (func 0x0391DC)
  0x0394A7 LD BC,(nn) (func 0x0391DC)
  0x0394C2 LD HL,(nn) (func 0x0391DC)
  0x03959A LD BC,(nn) (func 0x0391DC)
  0x039617 LD HL,(nn) (func 0x0391DC)
  0x039632 LD HL,(nn) (func 0x0391DC)
  0x03964B LD HL,(nn) (func 0x0391DC)
  0x03965C LD BC,(nn) (func 0x0391DC)
  0x039799 LD BC,(nn) (func 0x0391DC)
  0x03B54A LD HL,(nn) (func 0x03B4A5)
  0x03CC45 LD HL,(nn) (func 0x03CB9A)
  0x071253 LD BC,(nn) (func 0x0711AB)
  0x0712CF LD BC,(nn) (func 0x0711AB)

```


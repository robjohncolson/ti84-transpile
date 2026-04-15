# Phase 188 - FG Color Read Trace

- Boot: halt @ 0x0019B5
- Kernel init: max_steps @ 0x006202
- Post-init: missing_block @ 0xFFFFFF
- Stage 1: missing_block @ 0xFFFFFF
- Stage 3: missing_block @ 0xFFFFFF
- Target block hits: 0x0A1939 x0, 0x0A19D7 x0, 0x005B96 x0
- Traced reads in 0xD00000-0xD02FFF: 0

## 1. Disassembly

### 0x0A1939

```text
0x0A1939  7B                  ld-reg-reg
0x0A193A  CB 21               rotate-reg
0x0A193C  8A                  alu-reg
0x0A193D  77                  ld-ind-reg
0x0A193E  23                  inc-pair
0x0A193F  77                  ld-ind-reg
0x0A1940  23                  inc-pair
0x0A1941  7B                  ld-reg-reg
0x0A1942  CB 21               rotate-reg
0x0A1944  8A                  alu-reg
0x0A1945  77                  ld-ind-reg
0x0A1946  23                  inc-pair
0x0A1947  77                  ld-ind-reg
0x0A1948  23                  inc-pair
0x0A1949  7B                  ld-reg-reg
0x0A194A  CB 21               rotate-reg
0x0A194C  8A                  alu-reg
0x0A194D  77                  ld-ind-reg
0x0A194E  23                  inc-pair
0x0A194F  77                  ld-ind-reg
0x0A1950  23                  inc-pair
0x0A1951  7B                  ld-reg-reg
0x0A1952  CB 21               rotate-reg
0x0A1954  8A                  alu-reg
0x0A1955  77                  ld-ind-reg
0x0A1956  23                  inc-pair
0x0A1957  77                  ld-ind-reg
0x0A1958  23                  inc-pair
0x0A1959  7B                  ld-reg-reg
0x0A195A  CB 21               rotate-reg
0x0A195C  8A                  alu-reg
0x0A195D  77                  ld-ind-reg
0x0A195E  23                  inc-pair
0x0A195F  77                  ld-ind-reg
0x0A1960  23                  inc-pair
0x0A1961  C3 69 19 0A         jp
```

### 0x0A19D7

```text
0x0A19D7  11 FF 00 00         ld-pair-imm
0x0A19DB  7B                  ld-reg-reg
0x0A19DC  CB 21               rotate-reg
0x0A19DE  8A                  alu-reg
0x0A19DF  77                  ld-ind-reg
0x0A19E0  23                  inc-pair
0x0A19E1  77                  ld-ind-reg
0x0A19E2  23                  inc-pair
0x0A19E3  7B                  ld-reg-reg
0x0A19E4  CB 21               rotate-reg
0x0A19E6  8A                  alu-reg
0x0A19E7  77                  ld-ind-reg
0x0A19E8  23                  inc-pair
0x0A19E9  77                  ld-ind-reg
0x0A19EA  23                  inc-pair
0x0A19EB  7B                  ld-reg-reg
0x0A19EC  CB 21               rotate-reg
0x0A19EE  8A                  alu-reg
0x0A19EF  77                  ld-ind-reg
0x0A19F0  23                  inc-pair
0x0A19F1  77                  ld-ind-reg
0x0A19F2  23                  inc-pair
0x0A19F3  7B                  ld-reg-reg
0x0A19F4  CB 21               rotate-reg
0x0A19F6  8A                  alu-reg
0x0A19F7  77                  ld-ind-reg
0x0A19F8  23                  inc-pair
0x0A19F9  77                  ld-ind-reg
0x0A19FA  23                  inc-pair
0x0A19FB  7B                  ld-reg-reg
0x0A19FC  CB 21               rotate-reg
0x0A19FE  8A                  alu-reg
0x0A19FF  77                  ld-ind-reg
0x0A1A00  23                  inc-pair
0x0A1A01  77                  ld-ind-reg
0x0A1A02  23                  inc-pair
0x0A1A03  7B                  ld-reg-reg
0x0A1A04  CB 21               rotate-reg
0x0A1A06  8A                  alu-reg
0x0A1A07  77                  ld-ind-reg
0x0A1A08  23                  inc-pair
0x0A1A09  77                  ld-ind-reg
0x0A1A0A  23                  inc-pair
0x0A1A0B  7B                  ld-reg-reg
0x0A1A0C  CB 21               rotate-reg
0x0A1A0E  8A                  alu-reg
0x0A1A0F  77                  ld-ind-reg
0x0A1A10  23                  inc-pair
0x0A1A11  77                  ld-ind-reg
0x0A1A12  23                  inc-pair
0x0A1A13  C3 1D 1A 0A         jp
```

### 0x005B96

```text
0x005B96  21 00 00 D4         ld-pair-imm
0x005B9A  36 FF               ld-ind-imm
0x005B9C  11 01 00 D4         ld-pair-imm
0x005BA0  01 FF 57 02         ld-pair-imm
0x005BA4  ED B0               ldir
0x005BA6  E5                  push
0x005BA7  21 00 00 00         ld-pair-imm
0x005BAB  22 95 05 D0         ld-pair-mem
0x005BAF  E1                  pop
0x005BB0  C9                  ret
```

## 2. All color reads grouped by RAM address

- No reads from 0xD00000-0xD02FFF were captured while the target blocks were active.

## 3. Verdict

- None of the target writer blocks executed before stage 3 terminated.

## 4. Summary Table

| RAM Address | Read Count | Typical Value | Suspect? |
|---|---:|---|---|
| none | 0 | n/a | n/a |


# Phase 134 - RAM Dispatch Table Initialization Hunt

Static and dynamic findings captured from the phase 134 hunt logic.

## Summary

- Exact raw ROM hits for `1A 23 D0`: `177`
- Exact raw ROM hits for `EB 07 D0`: `1`
- Literal refs anywhere in `0xD0231A-0xD02340`: `297`
- Candidate direct writes into `0xD0231A-0xD02340`: `165`
- Direct literal writes to `0xD007EB`: `0`

## Key Findings

- The only exact raw `0xD007EB` hit is at ROM `0x08C747`, and it is a read, not a write:

```text
0x08c747 | ld hl,(nn) READ | 0x08c73d-0x08c753 | fd 21 80 00 d0 e1 e1 c9 e9 2a eb 07 d0 cd 45 c7 08 fd 21 80 00 d0 c9
```

- The `0xD0231A` base literal is used heavily. Exact-hit classifications:
  - `ld (nn),hl WRITE`: `66`
  - `ld hl,(nn) READ`: `43`
  - `ld (nn),bc WRITE`: `43`
  - `ld bc,(nn) READ`: `11`
  - `ld de,(nn) READ`: `9`
  - `ld (nn),de WRITE`: `3`

- Representative `0xD0231A` write/read sites:

```text
0x05690c | ld (nn),de WRITE | 0x056902-0x056918 | d0 e5 2a 1d 23 d0 e5 1b ed 53 1a 23 d0 2a 3a 24 d0 2b 22 1d 23 d0 06
0x05692b | ld (nn),hl WRITE | 0x056921-0x056937 | 23 d0 03 e1 22 1d 23 d0 e1 22 1a 23 d0 d5 c5 e1 7b b7 c4 c3 68 05 c1
0x059445 | ld (nn),bc WRITE | 0x05943b-0x059451 | 20 12 7a b3 20 19 3e d0 ed 43 1a 23 d0 f5 cd 2f 9d 09 f1 c9 fe d4 20
0x08cabd | ld (nn),hl WRITE | 0x08cab3-0x08cac9 | 09 cd 3b 1a 09 2a e6 10 d0 22 1a 23 d0 2a ec 10 d0 c3 75 0a 09 cd b4
0x08d75b | ld (nn),bc WRITE | 0x08d751-0x08d767 | d0 d5 ed 5b 1d 23 d0 d5 ed 43 1a 23 d0 22 1d 23 d0 ed 4b 1a 23 d0 2a
0x099d45 | ld (nn),hl WRITE | 0x099d3b-0x099d51 | d0 e5 c5 cd 0b c7 09 c1 e1 22 1a 23 d0 c8 ed 43 1a 23 d0 c3 1a 1d 06
```

- The broader `0xD0231A-0xD02340` range also gets literal writes to nearby slots such as `0xD0231D`, `0xD02322`, `0xD02323`, `0xD02327-0xD0232C`, but nothing in the raw scan writes to `0xD007EB`.

## Dynamic Boot Trace

- `coldBoot`: `steps=3062 termination=halt lastPc=0x0019B5 lastMode=adl`
- `osInit`: `steps=691 termination=missing_block lastPc=0xFFFFFF lastMode=adl`
- Post-boot `0xD007EB`: bytes `ff ff ff`, pointer `0xFFFFFF`
- Post-boot `0xD0231A-0xD02340`: all `FF`

```text
0xd0231a: ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff
0xd0232a: ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff
0xd0233a: ff ff ff ff ff ff ff
```

## Conclusion

- The dispatch-table pointer slot at `0xD007EB` is not initialized by any direct literal write visible in the raw ROM scan.
- In the reachable 500k-step boot path, the pointer slot still ends as `0xFFFFFF` and the dispatch-table RAM window stays completely uninitialized.
- The most likely remaining explanations are:
  - the real table populator runs after the current boot path falls into the missing block at `0xFFFFFF`
  - the table base is computed indirectly without embedding `0xD007EB` as a literal

Running `node probe-phase134-ram-dispatch-hunt.mjs` will regenerate this report with the full exhaustive hit appendix.

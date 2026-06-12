# Phase 627: Natural D02A29 Tuple Path Search

Probe: `probe-phase627-natural-d02a29-tuple.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase627-natural-d02a29-tuple.mjs`  
Exit: 0

## Summary

- ★★★ Tested 6 OS-driven key classes from the normal boot/init/paint/key-dispatch recipe, watching the decoded D02A29 tuple clusters `0x08DF54`, `0x08DFDD`, `0x08E151`, `0x08ED73`, `0x08F54B`, and `0x08F6FE`.
- ★★★ Natural tuple-cluster hits: 0. The exercised keys still do not reach the D02A29 tuple machinery; all observed watchpoint hits are the structural cleanup at `0x0018F8`.
- ★★ Clean halts: 6/6. This extends the phase623 negative result beyond the single `2` key to digits, operators, Enter, and Clear.

## Case Results

| Key | Scan | Termination | Steps | Last PC | Tuple-cluster hits | Cleanup hits | Final tuple |
|---|---:|---|---:|---|---:|---:|---|
| digit 2 | 0x90 | halt | 332856 | 0x0019B5 | 0 | 2 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| digit 3 | 0x91 | halt | 359913 | 0x0019B5 | 0 | 2 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| plus | 0x70 | halt | 281696 | 0x0019B5 | 0 | 2 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| minus | 0x71 | halt | 283491 | 0x0019B5 | 0 | 2 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| enter | 0x05 | halt | 401886 | 0x0019B5 | 0 | 2 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| clear | 0x09 | halt | 332434 | 0x0019B5 | 0 | 2 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |

## Watchpoint Timeline

| Key | Block | PC | Hit | Role | Tuple |
|---|---:|---|---:|---|---|
| digit 2 | 140845 | 0x0018F8 | 1 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| digit 2 | 330973 | 0x0018F8 | 2 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| digit 3 | 167639 | 0x0018F8 | 1 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| digit 3 | 357767 | 0x0018F8 | 2 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| plus | 89698 | 0x0018F8 | 1 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| plus | 279826 | 0x0018F8 | 2 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| minus | 91463 | 0x0018F8 | 1 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| minus | 281591 | 0x0018F8 | 2 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| enter | 209494 | 0x0018F8 | 1 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| enter | 399622 | 0x0018F8 | 2 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| clear | 140439 | 0x0018F8 | 1 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| clear | 330567 | 0x0018F8 | 2 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |

## Interpretation

The natural D02A29 tuple path remains unfound in the normal home-screen key pipeline. Phase625 proved the tuple machinery is live under direct entry, but this probe shows the common key classes exercised here do not route through it before cleanup. For practical browser work, keep using the proven VRAM/token-buffer snapshot path; tuple restoration needs a different OS mode or entry path that naturally reaches these clusters.

No runtime, transpiler, or browser files were changed.

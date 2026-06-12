# Phase 623: Cursor/Display Tuple Lifetime Trace

## Summary

- Traced the coherent cursor/display tuple requested by the phase622 handoff around `0x08DF54`, `0x08ED73`, `0x08F54B`, and `0x0018F8` during one `2` keypress.
- Run result: halt at 0x0019B5 after 332856 steps; pass=true.
- Watchpoint hits: 0x08DF54 seed cursor/display tuple=0; 0x08ED73 token-output setup=0; 0x08F54B normal/alternate exit save=0; 0x0018F8 cleanup wipe entry=2.
- Negative dynamic result: the one-key path did not enter the decoded tuple setup clusters at `0x08DF54`, `0x08ED73`, or `0x08F54B`; only the structural cleanup wipe at `0x0018F8` was observed.
- At both cleanup hits and final halt, the tracked tuple fields are already zero. This means the known keypress path is not preserving or rebuilding the `D02A29`/display-position tuple before cleanup.

## Watchpoint Timeline

| Block | PC | Hit | Role | Tuple |
|---:|---|---:|---|---|
| 140845 | 0x0018F8 | 1 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| 330973 | 0x0018F8 | 2 | cleanup wipe entry | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |

## Phase Diffs

- First observed tuple to last pre-cleanup tuple: no changes.
- Last cleanup tuple to final halt tuple: no changes.

## Interpretation

The decoded `D02A29` cursor/display tuple clusters from phase621 are not on this exercised keypress path. The actual run reaches the structural cleanup wipe twice with `D02A29`, `D02A2B`, `D02A1B`, `D0059A`, and D011xx display-position fields all zero. So this path has no phase-consistent cursor/display tuple to snapshot at the requested cluster addresses.

For browser persistence, this reinforces the lower-risk route: persist the observed VRAM and token-output buffers instead of trying to restore `D02A29` tuple RAM. A future tuple probe should first force a path that actually reaches `0x08DF54`/`0x08ED73`/`0x08F54B`, then snapshot from that phase.

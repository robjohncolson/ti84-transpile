# Phase 752 Browser ArrowDown Corruption Trace

Probe: `probe-phase752-browser-arrowdown-corruption-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase752-browser-arrowdown-corruption-trace.mjs`

Serves an in-memory instrumented `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowDown`, and records the pre-`max_steps` route plus first cx/VAT/cursor zeroing evidence.

The in-memory harness caps only `ArrowDown` at 200000 steps so the trace completes under the 180s watchdog while still covering the first destructive `0x001879 -> 0x0018F8` transition. The shell file on disk is not patched.

No disk browser/runtime/transpiler behavior is patched by this probe.

## Result

- ArrowDown ended with termination=max_steps, lastPc=0x006D64; first critical zero is observed-before-block at 0x0018F8.
- Final key state: termination=max_steps, steps=200000, lastPc=0x006D64, final cpu.pc=0x0021C2.
- Base was sane before key: D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CC, lastPc=0x08C331.
- First critical zero: observed-before-block at block 185328, pc=0x0018F8, prev=0x001879.
- First 0x202020 signal: none.
- CDP/page errors: 0.

## Hot Blocks

| PC | Hits |
|---|---:|
| 0x09EFDE | 65834 |
| 0x06F2E8 | 21780 |
| 0x06F341 | 21780 |
| 0x06F2E2 | 21615 |
| 0x0A2588 | 2904 |
| 0x0A255F | 2904 |
| 0x0A2563 | 2261 |
| 0x0A257E | 2261 |
| 0x005AE8 | 1392 |
| 0x005B16 | 1392 |
| 0x005B4B | 1392 |
| 0x005AB6 | 1305 |
| 0x003D28 | 1141 |
| 0x003D25 | 1141 |
| 0x001CA6 | 1104 |
| 0x001CC0 | 1076 |
| 0x001CCA | 1075 |
| 0x0A2572 | 1051 |
| 0x001C33 | 929 |
| 0x001C38 | 927 |
| 0x001C3C | 900 |
| 0x001CE4 | 896 |
| 0x001C7D | 742 |
| 0x001C81 | 742 |
| 0x001C82 | 742 |
| 0x001C44 | 741 |
| 0x001C48 | 741 |
| 0x09EFE8 | 699 |
| 0x09EFCB | 693 |
| 0x0A3404 | 672 |

## Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|---|
| reset000000 | 1 | 184758 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x000000 |
| rst000038 | 177 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x05C67C |
| low000a92 | 0 | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 185327 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0013E8 |
| cleanupTail0018f8 | 1 | 185328 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FEFF | 0xD3FF00 | 0xD1A87B | 0x0013E8 |
| sentinel001c33 | 929 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 |
| sentinel0158bc | 2 | 185123 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0158EC |
| postInsertGate0158de | 2 | 185121 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0013DA |
| eolOwner0a229d | 0 | - | - | - | - | - | - | - | - |
| eolTail0a22a4 | 0 | - | - | - | - | - | - | - | - |
| spaceFillBridge0a2a37 | 7 | 567 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| display09efde | 65834 | 6000 | 0x09EFDE | 0x09EFB7 | 0x009595 | 0xD42304 | 0x0052AA | 0xD1A830 | 0x00012B |
| tokenOuter08f3b8 | 0 | - | - | - | - | - | - | - | - |
| tokenTuple08f54b | 0 | - | - | - | - | - | - | - | - |
| tokenExit08f5e1 | 0 | - | - | - | - | - | - | - | - |
| tokenGate090992 | 0 | - | - | - | - | - | - | - | - |

## Tail Snapshots

| Block | Step | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D008E0 | D0243A | D02590 | Key bytes |
|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 199776 | 199952 | 0x006D64 | 0x0021C2 | 0x002001 | 0x09387E | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199777 | 199953 | 0x006CDF | 0x006D64 | 0x002001 | 0x09387E | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199778 | 199954 | 0x006CF7 | 0x006CDF | 0x09387E | 0xF6C7C2 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199779 | 199955 | 0x006D0F | 0x006CF7 | 0x000040 | 0x020104 | 0x002010 | 0xD1A828 | 0x000080 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199780 | 199956 | 0x006D38 | 0x006D0F | 0x000040 | 0x000000 | 0x002010 | 0xD1A82B | 0x000040 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199781 | 199957 | 0x006D4F | 0x006D38 | 0x002000 | 0x000000 | 0x002010 | 0xD1A828 | 0x000E42 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199782 | 199958 | 0x006D5D | 0x006D4F | 0x002001 | 0x000000 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199783 | 199959 | 0x0021C2 | 0x006D5D | 0x002001 | 0x09383E | 0x002010 | 0xD1A828 | 0x006D64 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199784 | 199960 | 0x006D64 | 0x0021C2 | 0x002001 | 0x09383E | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199785 | 199961 | 0x006CDF | 0x006D64 | 0x002001 | 0x09383E | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199786 | 199962 | 0x006CF7 | 0x006CDF | 0x09383E | 0xF6C802 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199787 | 199963 | 0x006D0F | 0x006CF7 | 0x000040 | 0x020104 | 0x002010 | 0xD1A828 | 0x000080 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199788 | 199964 | 0x006D38 | 0x006D0F | 0x000040 | 0x000000 | 0x002010 | 0xD1A82B | 0x000040 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199789 | 199965 | 0x006D4F | 0x006D38 | 0x002000 | 0x000000 | 0x002010 | 0xD1A828 | 0x000E42 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199790 | 199966 | 0x006D5D | 0x006D4F | 0x002001 | 0x000000 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199791 | 199967 | 0x0021C2 | 0x006D5D | 0x002001 | 0x0937FE | 0x002010 | 0xD1A828 | 0x006D64 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199792 | 199968 | 0x006D64 | 0x0021C2 | 0x002001 | 0x0937FE | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199793 | 199969 | 0x006CDF | 0x006D64 | 0x002001 | 0x0937FE | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199794 | 199970 | 0x006CF7 | 0x006CDF | 0x0937FE | 0xF6C842 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199795 | 199971 | 0x006D0F | 0x006CF7 | 0x000040 | 0x020104 | 0x002010 | 0xD1A828 | 0x000080 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199796 | 199972 | 0x006D38 | 0x006D0F | 0x000040 | 0x000000 | 0x002010 | 0xD1A82B | 0x000040 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199797 | 199973 | 0x006D4F | 0x006D38 | 0x002000 | 0x000000 | 0x002010 | 0xD1A828 | 0x000E42 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199798 | 199974 | 0x006D5D | 0x006D4F | 0x002001 | 0x000000 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199799 | 199975 | 0x0021C2 | 0x006D5D | 0x002001 | 0x0937BE | 0x002010 | 0xD1A828 | 0x006D64 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199800 | 199976 | 0x006D64 | 0x0021C2 | 0x002001 | 0x0937BE | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199801 | 199977 | 0x006CDF | 0x006D64 | 0x002001 | 0x0937BE | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199802 | 199978 | 0x006CF7 | 0x006CDF | 0x0937BE | 0xF6C882 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199803 | 199979 | 0x006D0F | 0x006CF7 | 0x000040 | 0x020104 | 0x002010 | 0xD1A828 | 0x000080 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199804 | 199980 | 0x006D38 | 0x006D0F | 0x000040 | 0x000000 | 0x002010 | 0xD1A82B | 0x000040 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199805 | 199981 | 0x006D4F | 0x006D38 | 0x002000 | 0x000000 | 0x002010 | 0xD1A828 | 0x000E42 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199806 | 199982 | 0x006D5D | 0x006D4F | 0x002001 | 0x000000 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199807 | 199983 | 0x0021C2 | 0x006D5D | 0x002001 | 0x09377E | 0x002010 | 0xD1A828 | 0x006D64 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199808 | 199984 | 0x006D64 | 0x0021C2 | 0x002001 | 0x09377E | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199809 | 199985 | 0x006CDF | 0x006D64 | 0x002001 | 0x09377E | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199810 | 199986 | 0x006CF7 | 0x006CDF | 0x09377E | 0xF6C8C2 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199811 | 199987 | 0x006D0F | 0x006CF7 | 0x000040 | 0x020104 | 0x002010 | 0xD1A828 | 0x000080 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199812 | 199988 | 0x006D38 | 0x006D0F | 0x000040 | 0x000000 | 0x002010 | 0xD1A82B | 0x000040 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199813 | 199989 | 0x006D4F | 0x006D38 | 0x002000 | 0x000000 | 0x002010 | 0xD1A828 | 0x000E42 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199814 | 199990 | 0x006D5D | 0x006D4F | 0x002001 | 0x000000 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199815 | 199991 | 0x0021C2 | 0x006D5D | 0x002001 | 0x09373E | 0x002010 | 0xD1A828 | 0x006D64 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199816 | 199992 | 0x006D64 | 0x0021C2 | 0x002001 | 0x09373E | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199817 | 199993 | 0x006CDF | 0x006D64 | 0x002001 | 0x09373E | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199818 | 199994 | 0x006CF7 | 0x006CDF | 0x09373E | 0xF6C902 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199819 | 199995 | 0x006D0F | 0x006CF7 | 0x000040 | 0x020104 | 0x002010 | 0xD1A828 | 0x000080 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199820 | 199996 | 0x006D38 | 0x006D0F | 0x000040 | 0x000000 | 0x002010 | 0xD1A82B | 0x000040 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199821 | 199997 | 0x006D4F | 0x006D38 | 0x002000 | 0x000000 | 0x002010 | 0xD1A828 | 0x000E42 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199822 | 199998 | 0x006D5D | 0x006D4F | 0x002001 | 0x000000 | 0x002010 | 0xD1A82B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 199823 | 199999 | 0x0021C2 | 0x006D5D | 0x002001 | 0x0936FE | 0x002010 | 0xD1A828 | 0x006D64 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |

## Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 191534 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000013->0x000014 |
| 191621 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000014->0x000015 |
| 191708 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000015->0x000016 |
| 191796 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000016->0x000017 |
| 191884 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000017->0x000018 |
| 191890 | 0x0059E9 | 0x013D29 | entry-vs-previous-block | D00595:0x000006->0x000007; D00596:0x000018->0x000000 |
| 191975 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000000->0x000001 |
| 192062 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000001->0x000002 |
| 192149 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000002->0x000003 |
| 192236 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000003->0x000004 |
| 192323 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000004->0x000005 |
| 192410 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000005->0x000006 |
| 192497 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000006->0x000007 |
| 192584 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000007->0x000008 |
| 192671 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000008->0x000009 |
| 192758 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000009->0x00000A |
| 192845 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x00000A->0x00000B |
| 192932 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x00000B->0x00000C |
| 193019 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x00000C->0x00000D |
| 193106 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x00000D->0x00000E |
| 193193 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x00000E->0x00000F |
| 193280 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x00000F->0x000010 |
| 193367 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000010->0x000011 |
| 193454 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000011->0x000012 |
| 193541 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000012->0x000013 |
| 193547 | 0x0059E9 | 0x013D29 | entry-vs-previous-block | D00595:0x000007->0x000008; D00596:0x000013->0x000000 |
| 193632 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000000->0x000001 |
| 193719 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000001->0x000002 |
| 193806 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000002->0x000003 |
| 193893 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000003->0x000004 |
| 193980 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000004->0x000005 |
| 194067 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000005->0x000006 |
| 194154 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000006->0x000007 |
| 194241 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000007->0x000008 |
| 194328 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000008->0x000009 |
| 194415 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000009->0x00000A |
| 194448 | 0x0059C6 | 0x0017DD | entry-vs-previous-block | D00595:0x000008->0x000004; D00596:0x00000A->0x000012 |
| 194531 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000012->0x000013 |
| 194573 | 0x0059C6 | 0x0017DD | entry-vs-previous-block | D00596:0x000013->0x000012 |
| 194656 | 0x0059E6 | 0x0059DA | entry-vs-previous-block | D00596:0x000012->0x000013 |

## Compact Evidence

```json
{
  "finding": "ArrowDown ended with termination=max_steps, lastPc=0x006D64; first critical zero is observed-before-block at 0x0018F8.",
  "before": {
    "status": "Coldboot complete. OS event loop is ready.",
    "lastPc": "0x08C331",
    "fields": {
      "D007CA": "0x0585E9",
      "D008E0": "0x000000",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D000C2": "0x00",
      "D02A28": "0x00",
      "D02A29": "0x000000",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x00"
    },
    "vram": 8549
  },
  "after": {
    "status": "Key: DOWN → 200000 steps (max_steps, peak 76665px)",
    "lastPc": "0x006D64",
    "cpu": {
      "pc": "0x0021C2",
      "sp": "0xD1A82B",
      "af": "0x000002",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x0936FE",
      "ix": "0xD1A831",
      "iy": "0xD00080",
      "f": "0x02",
      "stepCount": 199999
    },
    "fields": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0x000000",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D000C2": "0x00",
      "D02A28": "0x00",
      "D02A29": "0x000000",
      "D02A40": "0x000000",
      "D00595": "0x04",
      "D00596": "0x13"
    },
    "lastKey": {
      "code": "ArrowDown",
      "label": "DOWN",
      "expectedInsertByte": null,
      "controlPreStopPc": null,
      "controlPreStopLabel": null,
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": null,
      "controlStopPc": null,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": false,
      "steps": 200000,
      "termination": "max_steps",
      "wipes": 1,
      "D0243A": 0,
      "D0243D": 0,
      "D007CA": 0,
      "D008E0": 0,
      "D02590": 0,
      "D000C2": 0,
      "buffer": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 76665,
      "vramCurrent": 3031
    },
    "stackTop": [
      {
        "addr": "0xD1A82B",
        "value": "0x000000"
      },
      {
        "addr": "0xD1A82E",
        "value": "0x000040"
      },
      {
        "addr": "0xD1A831",
        "value": "0xD1A866"
      },
      {
        "addr": "0xD1A834",
        "value": "0x006512"
      },
      {
        "addr": "0xD1A837",
        "value": "0x020104"
      },
      {
        "addr": "0xD1A83A",
        "value": "0x0936FE"
      },
      {
        "addr": "0xD1A83D",
        "value": "0x1700D1"
      },
      {
        "addr": "0xD1A840",
        "value": "0x740017"
      }
    ]
  },
  "record": {
    "totalBlocks": 199823,
    "regionCounts": {
      "low000000_006fff": 35517,
      "cleanup001000_001fff": 13686,
      "display09e000_0a2fff": 87460,
      "token08f000_090fff": 0,
      "near0a2100_0a23ff": 218
    },
    "targetCounts": {
      "reset000000": 1,
      "rst000038": 177,
      "cleanup001879": 1,
      "cleanupTail0018f8": 1,
      "sentinel001c33": 929,
      "sentinel0158bc": 2,
      "postInsertGate0158de": 2,
      "spaceFillBridge0a2a37": 7,
      "display09efde": 65834
    },
    "firstSamples": {
      "rst000038": {
        "block": 3,
        "step": 3,
        "pc": "0x000038",
        "prevPc": "0x05C634",
        "cpu": {
          "pc": "0x000038",
          "sp": "0xD1A85D",
          "af": "0x001054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "stepCount": 3
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x01",
          "D0058C": "0x04",
          "D0058D": "0x04",
          "D0058E": "0x04",
          "D00080": "0x08",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A85D",
            "value": "0x05C67C"
          },
          {
            "addr": "0xD1A860",
            "value": "0x08C339"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A869",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86C",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A872",
            "value": "0xFFFFFF"
          }
        ],
        "vram": 8549
      },
      "sentinel001c33": {
        "block": 22,
        "step": 22,
        "pc": "0x001C33",
        "prevPc": "0x006808",
        "cpu": {
          "pc": "0x001C33",
          "sp": "0xD1A845",
          "af": "0x00090C",
          "bc": "0x09D6B4",
          "de": "0x0080C0",
          "hl": "0x020006",
          "ix": "0xD1A848",
          "iy": "0xD00080",
          "f": "0x0C",
          "stepCount": 22
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x01",
          "D0058C": "0x04",
          "D0058D": "0x04",
          "D0058E": "0x04",
          "D00080": "0x08",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A845",
            "value": "0x006810"
          },
          {
            "addr": "0xD1A848",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x001727"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A851",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A857",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD1A860"
          }
        ],
        "vram": 8549
      },
      "spaceFillBridge0a2a37": {
        "block": 567,
        "step": 569,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A842",
          "af": "0x000075",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0x000000",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x75",
          "stepCount": 569
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x31",
          "D0058C": "0x04",
          "D0058D": "0x31",
          "D0058E": "0x04",
          "D00080": "0x18",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0x0A2389"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD2A815"
          },
          {
            "addr": "0xD1A848",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x000075"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x05C819"
          },
          {
            "addr": "0xD1A851",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A857",
            "value": "0x00FFFF"
          }
        ],
        "vram": 8549
      },
      "display09efde": {
        "block": 6000,
        "step": 6015,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFB7",
        "cpu": {
          "pc": "0x09EFDE",
          "sp": "0xD1A830",
          "af": "0x000C85",
          "bc": "0x009595",
          "de": "0x0052AA",
          "hl": "0xD42304",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x85",
          "stepCount": 6015
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x44",
          "D0058D": "0x31",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A830",
            "value": "0x00012B"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000C18"
          },
          {
            "addr": "0xD1A836",
            "value": "0x000E19"
          },
          {
            "addr": "0xD1A839",
            "value": "0x00012C"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000045"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A845",
            "value": "0x055CDA"
          }
        ],
        "vram": 8585
      },
      "reset000000": {
        "block": 184758,
        "step": 184934,
        "pc": "0x000000",
        "prevPc": "0x03D0E0",
        "cpu": {
          "pc": "0x000000",
          "sp": "0xF9DD11",
          "af": "0x000045",
          "bc": "0x000000",
          "de": "0xD1A7FC",
          "hl": "0x000002",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "f": "0x45",
          "stepCount": 184934
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x31",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xF9DD11",
            "value": "0x000000"
          },
          {
            "addr": "0xF9DD14",
            "value": "0x000000"
          },
          {
            "addr": "0xF9DD17",
            "value": "0x000000"
          },
          {
            "addr": "0xF9DD1A",
            "value": "0x000000"
          },
          {
            "addr": "0xF9DD1D",
            "value": "0x000000"
          },
          {
            "addr": "0xF9DD20",
            "value": "0x000000"
          },
          {
            "addr": "0xF9DD23",
            "value": "0x000000"
          },
          {
            "addr": "0xF9DD26",
            "value": "0x000000"
          }
        ],
        "vram": 32940
      },
      "postInsertGate0158de": {
        "block": 185121,
        "step": 185297,
        "pc": "0x0158DE",
        "prevPc": "0x0013C7",
        "cpu": {
          "pc": "0x0158DE",
          "sp": "0xD1A87B",
          "af": "0x00D042",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "f": "0x42",
          "stepCount": 185297
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x31",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x0013DA"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          }
        ],
        "vram": 32940
      },
      "sentinel0158bc": {
        "block": 185123,
        "step": 185299,
        "pc": "0x0158BC",
        "prevPc": "0x0158E8",
        "cpu": {
          "pc": "0x0158BC",
          "sp": "0xD1A878",
          "af": "0x00D054",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "f": "0x54",
          "stepCount": 185299
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x31",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A878",
            "value": "0x0158EC"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x0013DA"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "vram": 32940
      },
      "cleanup001879": {
        "block": 185327,
        "step": 185503,
        "pc": "0x001879",
        "prevPc": "0x001872",
        "cpu": {
          "pc": "0x001879",
          "sp": "0xD1A87B",
          "af": "0x00EE54",
          "bc": "0x000003",
          "de": "0x000430",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "f": "0x54",
          "stepCount": 185503
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x31",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x0013E8"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          }
        ],
        "vram": 32940
      },
      "cleanupTail0018f8": {
        "block": 185328,
        "step": 185504,
        "pc": "0x0018F8",
        "prevPc": "0x001879",
        "cpu": {
          "pc": "0x0018F8",
          "sp": "0xD1A87B",
          "af": "0x005200",
          "bc": "0x0000FF",
          "de": "0xD3FF00",
          "hl": "0xD3FEFF",
          "ix": "0x000000",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 185504
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0x000000",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x0013E8"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          }
        ],
        "vram": 32940
      }
    },
    "firstFieldZero": {
      "source": "observed-before-block",
      "snapshot": {
        "block": 185328,
        "step": 185504,
        "pc": "0x0018F8",
        "prevPc": "0x001879",
        "cpu": {
          "pc": "0x0018F8",
          "sp": "0xD1A87B",
          "af": "0x005200",
          "bc": "0x0000FF",
          "de": "0xD3FF00",
          "hl": "0xD3FEFF",
          "ix": "0x000000",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 185504
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0x000000",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x0013E8"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          }
        ],
        "vram": 32940
      }
    },
    "first202020": null,
    "hotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 65834
      },
      {
        "pc": "0x06F2E8",
        "count": 21780
      },
      {
        "pc": "0x06F341",
        "count": 21780
      },
      {
        "pc": "0x06F2E2",
        "count": 21615
      },
      {
        "pc": "0x0A2588",
        "count": 2904
      },
      {
        "pc": "0x0A255F",
        "count": 2904
      },
      {
        "pc": "0x0A2563",
        "count": 2261
      },
      {
        "pc": "0x0A257E",
        "count": 2261
      },
      {
        "pc": "0x005AE8",
        "count": 1392
      },
      {
        "pc": "0x005B16",
        "count": 1392
      },
      {
        "pc": "0x005B4B",
        "count": 1392
      },
      {
        "pc": "0x005AB6",
        "count": 1305
      },
      {
        "pc": "0x003D28",
        "count": 1141
      },
      {
        "pc": "0x003D25",
        "count": 1141
      },
      {
        "pc": "0x001CA6",
        "count": 1104
      },
      {
        "pc": "0x001CC0",
        "count": 1076
      },
      {
        "pc": "0x001CCA",
        "count": 1075
      },
      {
        "pc": "0x0A2572",
        "count": 1051
      },
      {
        "pc": "0x001C33",
        "count": 929
      },
      {
        "pc": "0x001C38",
        "count": 927
      },
      {
        "pc": "0x001C3C",
        "count": 900
      },
      {
        "pc": "0x001CE4",
        "count": 896
      },
      {
        "pc": "0x001C7D",
        "count": 742
      },
      {
        "pc": "0x001C81",
        "count": 742
      },
      {
        "pc": "0x001C82",
        "count": 742
      },
      {
        "pc": "0x001C44",
        "count": 741
      },
      {
        "pc": "0x001C48",
        "count": 741
      },
      {
        "pc": "0x09EFE8",
        "count": 699
      },
      {
        "pc": "0x09EFCB",
        "count": 693
      },
      {
        "pc": "0x0A3404",
        "count": 672
      },
      {
        "pc": "0x09EFEF",
        "count": 659
      },
      {
        "pc": "0x0021C2",
        "count": 651
      },
      {
        "pc": "0x006D5D",
        "count": 647
      },
      {
        "pc": "0x006D64",
        "count": 646
      },
      {
        "pc": "0x006CDF",
        "count": 644
      },
      {
        "pc": "0x006D0F",
        "count": 644
      },
      {
        "pc": "0x006D38",
        "count": 643
      },
      {
        "pc": "0x006D4F",
        "count": 643
      },
      {
        "pc": "0x006CF7",
        "count": 642
      },
      {
        "pc": "0x0A3411",
        "count": 606
      },
      {
        "pc": "0x0A19A4",
        "count": 560
      },
      {
        "pc": "0x0A2548",
        "count": 492
      },
      {
        "pc": "0x0A254F",
        "count": 492
      },
      {
        "pc": "0x0A258B",
        "count": 492
      },
      {
        "pc": "0x0A2695",
        "count": 492
      },
      {
        "pc": "0x0A2555",
        "count": 408
      },
      {
        "pc": "0x0A2585",
        "count": 408
      },
      {
        "pc": "0x0A269A",
        "count": 408
      },
      {
        "pc": "0x0A26B4",
        "count": 408
      },
      {
        "pc": "0x0A3408",
        "count": 402
      },
      {
        "pc": "0x0A2537",
        "count": 374
      },
      {
        "pc": "0x001C4F",
        "count": 362
      },
      {
        "pc": "0x001C54",
        "count": 362
      },
      {
        "pc": "0x0008BB",
        "count": 265
      },
      {
        "pc": "0x001713",
        "count": 264
      },
      {
        "pc": "0x001717",
        "count": 264
      },
      {
        "pc": "0x001718",
        "count": 264
      },
      {
        "pc": "0x0060B3",
        "count": 255
      },
      {
        "pc": "0x001377",
        "count": 254
      },
      {
        "pc": "0x001CE5",
        "count": 208
      },
      {
        "pc": "0x0A3418",
        "count": 207
      },
      {
        "pc": "0x001C42",
        "count": 186
      },
      {
        "pc": "0x001CCE",
        "count": 179
      },
      {
        "pc": "0x001CD5",
        "count": 179
      },
      {
        "pc": "0x000038",
        "count": 177
      },
      {
        "pc": "0x0006F3",
        "count": 177
      },
      {
        "pc": "0x000704",
        "count": 177
      },
      {
        "pc": "0x000710",
        "count": 177
      },
      {
        "pc": "0x00171E",
        "count": 177
      },
      {
        "pc": "0x0067F8",
        "count": 177
      },
      {
        "pc": "0x006808",
        "count": 177
      },
      {
        "pc": "0x006810",
        "count": 177
      },
      {
        "pc": "0x006812",
        "count": 177
      },
      {
        "pc": "0x006816",
        "count": 177
      },
      {
        "pc": "0x00681E",
        "count": 177
      },
      {
        "pc": "0x006828",
        "count": 177
      },
      {
        "pc": "0x001727",
        "count": 177
      },
      {
        "pc": "0x000719",
        "count": 177
      },
      {
        "pc": "0x00071D",
        "count": 177
      },
      {
        "pc": "0x02010C",
        "count": 177
      }
    ],
    "firstBlocks": [
      "0x08C331",
      "0x05C634",
      "0x000038",
      "0x0006F3",
      "0x000704",
      "0x000710",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x00171E",
      "0x0067F8",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CCE",
      "0x001CD5",
      "0x001CE5",
      "0x001C54",
      "0x006808",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C42",
      "0x006810",
      "0x006812",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C54",
      "0x006816",
      "0x00681E",
      "0x006828",
      "0x001727",
      "0x000719",
      "0x00071D",
      "0x02010C",
      "0x03CF7D",
      "0x03CFA4",
      "0x03CFCF",
      "0x03CFD4",
      "0x03CFDB",
      "0x03CFE0",
      "0x03CFE5",
      "0x03CFEA"
    ],
    "lastBlocks": [
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2",
      "0x006D64",
      "0x006CDF",
      "0x006CF7",
      "0x006D0F",
      "0x006D38",
      "0x006D4F",
      "0x006D5D",
      "0x0021C2"
    ],
    "tailSnapshots": [
      {
        "block": 199760,
        "step": 199936,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
        "bc": "0x002001",
        "hl": "0x0938FE",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199761,
        "step": 199937,
        "pc": "0x006CDF",
        "prevPc": "0x006D64",
        "bc": "0x002001",
        "hl": "0x0938FE",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199762,
        "step": 199938,
        "pc": "0x006CF7",
        "prevPc": "0x006CDF",
        "bc": "0x0938FE",
        "hl": "0xF6C742",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199763,
        "step": 199939,
        "pc": "0x006D0F",
        "prevPc": "0x006CF7",
        "bc": "0x000040",
        "hl": "0x020104",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000080",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199764,
        "step": 199940,
        "pc": "0x006D38",
        "prevPc": "0x006D0F",
        "bc": "0x000040",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000040",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199765,
        "step": 199941,
        "pc": "0x006D4F",
        "prevPc": "0x006D38",
        "bc": "0x002000",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000E42",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199766,
        "step": 199942,
        "pc": "0x006D5D",
        "prevPc": "0x006D4F",
        "bc": "0x002001",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199767,
        "step": 199943,
        "pc": "0x0021C2",
        "prevPc": "0x006D5D",
        "bc": "0x002001",
        "hl": "0x0938BE",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x006D64",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199768,
        "step": 199944,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
        "bc": "0x002001",
        "hl": "0x0938BE",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199769,
        "step": 199945,
        "pc": "0x006CDF",
        "prevPc": "0x006D64",
        "bc": "0x002001",
        "hl": "0x0938BE",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199770,
        "step": 199946,
        "pc": "0x006CF7",
        "prevPc": "0x006CDF",
        "bc": "0x0938BE",
        "hl": "0xF6C782",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199771,
        "step": 199947,
        "pc": "0x006D0F",
        "prevPc": "0x006CF7",
        "bc": "0x000040",
        "hl": "0x020104",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000080",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199772,
        "step": 199948,
        "pc": "0x006D38",
        "prevPc": "0x006D0F",
        "bc": "0x000040",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000040",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199773,
        "step": 199949,
        "pc": "0x006D4F",
        "prevPc": "0x006D38",
        "bc": "0x002000",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000E42",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199774,
        "step": 199950,
        "pc": "0x006D5D",
        "prevPc": "0x006D4F",
        "bc": "0x002001",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199775,
        "step": 199951,
        "pc": "0x0021C2",
        "prevPc": "0x006D5D",
        "bc": "0x002001",
        "hl": "0x09387E",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x006D64",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199776,
        "step": 199952,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
        "bc": "0x002001",
        "hl": "0x09387E",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199777,
        "step": 199953,
        "pc": "0x006CDF",
        "prevPc": "0x006D64",
        "bc": "0x002001",
        "hl": "0x09387E",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199778,
        "step": 199954,
        "pc": "0x006CF7",
        "prevPc": "0x006CDF",
        "bc": "0x09387E",
        "hl": "0xF6C7C2",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199779,
        "step": 199955,
        "pc": "0x006D0F",
        "prevPc": "0x006CF7",
        "bc": "0x000040",
        "hl": "0x020104",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000080",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199780,
        "step": 199956,
        "pc": "0x006D38",
        "prevPc": "0x006D0F",
        "bc": "0x000040",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000040",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199781,
        "step": 199957,
        "pc": "0x006D4F",
        "prevPc": "0x006D38",
        "bc": "0x002000",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000E42",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199782,
        "step": 199958,
        "pc": "0x006D5D",
        "prevPc": "0x006D4F",
        "bc": "0x002001",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199783,
        "step": 199959,
        "pc": "0x0021C2",
        "prevPc": "0x006D5D",
        "bc": "0x002001",
        "hl": "0x09383E",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x006D64",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199784,
        "step": 199960,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
        "bc": "0x002001",
        "hl": "0x09383E",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199785,
        "step": 199961,
        "pc": "0x006CDF",
        "prevPc": "0x006D64",
        "bc": "0x002001",
        "hl": "0x09383E",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199786,
        "step": 199962,
        "pc": "0x006CF7",
        "prevPc": "0x006CDF",
        "bc": "0x09383E",
        "hl": "0xF6C802",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199787,
        "step": 199963,
        "pc": "0x006D0F",
        "prevPc": "0x006CF7",
        "bc": "0x000040",
        "hl": "0x020104",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000080",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199788,
        "step": 199964,
        "pc": "0x006D38",
        "prevPc": "0x006D0F",
        "bc": "0x000040",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000040",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199789,
        "step": 199965,
        "pc": "0x006D4F",
        "prevPc": "0x006D38",
        "bc": "0x002000",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000E42",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199790,
        "step": 199966,
        "pc": "0x006D5D",
        "prevPc": "0x006D4F",
        "bc": "0x002001",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199791,
        "step": 199967,
        "pc": "0x0021C2",
        "prevPc": "0x006D5D",
        "bc": "0x002001",
        "hl": "0x0937FE",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x006D64",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199792,
        "step": 199968,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
        "bc": "0x002001",
        "hl": "0x0937FE",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199793,
        "step": 199969,
        "pc": "0x006CDF",
        "prevPc": "0x006D64",
        "bc": "0x002001",
        "hl": "0x0937FE",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199794,
        "step": 199970,
        "pc": "0x006CF7",
        "prevPc": "0x006CDF",
        "bc": "0x0937FE",
        "hl": "0xF6C842",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199795,
        "step": 199971,
        "pc": "0x006D0F",
        "prevPc": "0x006CF7",
        "bc": "0x000040",
        "hl": "0x020104",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000080",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199796,
        "step": 199972,
        "pc": "0x006D38",
        "prevPc": "0x006D0F",
        "bc": "0x000040",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000040",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199797,
        "step": 199973,
        "pc": "0x006D4F",
        "prevPc": "0x006D38",
        "bc": "0x002000",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000E42",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199798,
        "step": 199974,
        "pc": "0x006D5D",
        "prevPc": "0x006D4F",
        "bc": "0x002001",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199799,
        "step": 199975,
        "pc": "0x0021C2",
        "prevPc": "0x006D5D",
        "bc": "0x002001",
        "hl": "0x0937BE",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x006D64",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199800,
        "step": 199976,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
        "bc": "0x002001",
        "hl": "0x0937BE",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199801,
        "step": 199977,
        "pc": "0x006CDF",
        "prevPc": "0x006D64",
        "bc": "0x002001",
        "hl": "0x0937BE",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199802,
        "step": 199978,
        "pc": "0x006CF7",
        "prevPc": "0x006CDF",
        "bc": "0x0937BE",
        "hl": "0xF6C882",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199803,
        "step": 199979,
        "pc": "0x006D0F",
        "prevPc": "0x006CF7",
        "bc": "0x000040",
        "hl": "0x020104",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000080",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199804,
        "step": 199980,
        "pc": "0x006D38",
        "prevPc": "0x006D0F",
        "bc": "0x000040",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000040",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199805,
        "step": 199981,
        "pc": "0x006D4F",
        "prevPc": "0x006D38",
        "bc": "0x002000",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000E42",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199806,
        "step": 199982,
        "pc": "0x006D5D",
        "prevPc": "0x006D4F",
        "bc": "0x002001",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199807,
        "step": 199983,
        "pc": "0x0021C2",
        "prevPc": "0x006D5D",
        "bc": "0x002001",
        "hl": "0x09377E",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x006D64",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199808,
        "step": 199984,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
        "bc": "0x002001",
        "hl": "0x09377E",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199809,
        "step": 199985,
        "pc": "0x006CDF",
        "prevPc": "0x006D64",
        "bc": "0x002001",
        "hl": "0x09377E",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199810,
        "step": 199986,
        "pc": "0x006CF7",
        "prevPc": "0x006CDF",
        "bc": "0x09377E",
        "hl": "0xF6C8C2",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199811,
        "step": 199987,
        "pc": "0x006D0F",
        "prevPc": "0x006CF7",
        "bc": "0x000040",
        "hl": "0x020104",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000080",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199812,
        "step": 199988,
        "pc": "0x006D38",
        "prevPc": "0x006D0F",
        "bc": "0x000040",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000040",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199813,
        "step": 199989,
        "pc": "0x006D4F",
        "prevPc": "0x006D38",
        "bc": "0x002000",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000E42",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199814,
        "step": 199990,
        "pc": "0x006D5D",
        "prevPc": "0x006D4F",
        "bc": "0x002001",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199815,
        "step": 199991,
        "pc": "0x0021C2",
        "prevPc": "0x006D5D",
        "bc": "0x002001",
        "hl": "0x09373E",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x006D64",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199816,
        "step": 199992,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
        "bc": "0x002001",
        "hl": "0x09373E",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199817,
        "step": 199993,
        "pc": "0x006CDF",
        "prevPc": "0x006D64",
        "bc": "0x002001",
        "hl": "0x09373E",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199818,
        "step": 199994,
        "pc": "0x006CF7",
        "prevPc": "0x006CDF",
        "bc": "0x09373E",
        "hl": "0xF6C902",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199819,
        "step": 199995,
        "pc": "0x006D0F",
        "prevPc": "0x006CF7",
        "bc": "0x000040",
        "hl": "0x020104",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000080",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199820,
        "step": 199996,
        "pc": "0x006D38",
        "prevPc": "0x006D0F",
        "bc": "0x000040",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000040",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199821,
        "step": 199997,
        "pc": "0x006D4F",
        "prevPc": "0x006D38",
        "bc": "0x002000",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x000E42",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199822,
        "step": 199998,
        "pc": "0x006D5D",
        "prevPc": "0x006D4F",
        "bc": "0x002001",
        "hl": "0x000000",
        "de": "0x002010",
        "sp": "0xD1A82B",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 199823,
        "step": 199999,
        "pc": "0x0021C2",
        "prevPc": "0x006D5D",
        "bc": "0x002001",
        "hl": "0x0936FE",
        "de": "0x002010",
        "sp": "0xD1A828",
        "stack0": "0x006D64",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      }
    ],
    "fieldTransitions": [
      {
        "block": 188222,
        "pc": "0x0059E9",
        "prevPc": "0x013D1F",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000000",
            "after": "0x000004"
          },
          "D00596": {
            "before": "0x00000E",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 188307,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000000",
            "after": "0x000001"
          }
        }
      },
      {
        "block": 188394,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000001",
            "after": "0x000002"
          }
        }
      },
      {
        "block": 188481,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000002",
            "after": "0x000003"
          }
        }
      },
      {
        "block": 188568,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000003",
            "after": "0x000004"
          }
        }
      },
      {
        "block": 188655,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000004",
            "after": "0x000005"
          }
        }
      },
      {
        "block": 188742,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000005",
            "after": "0x000006"
          }
        }
      },
      {
        "block": 188829,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000006",
            "after": "0x000007"
          }
        }
      },
      {
        "block": 188916,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000007",
            "after": "0x000008"
          }
        }
      },
      {
        "block": 189003,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000008",
            "after": "0x000009"
          }
        }
      },
      {
        "block": 189090,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000009",
            "after": "0x00000A"
          }
        }
      },
      {
        "block": 189177,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000A",
            "after": "0x00000B"
          }
        }
      },
      {
        "block": 189264,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000B",
            "after": "0x00000C"
          }
        }
      },
      {
        "block": 189351,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000C",
            "after": "0x00000D"
          }
        }
      },
      {
        "block": 189438,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000D",
            "after": "0x00000E"
          }
        }
      },
      {
        "block": 189525,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000E",
            "after": "0x00000F"
          }
        }
      },
      {
        "block": 189612,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000F",
            "after": "0x000010"
          }
        }
      },
      {
        "block": 189699,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000010",
            "after": "0x000011"
          }
        }
      },
      {
        "block": 189705,
        "pc": "0x0059E9",
        "prevPc": "0x013D29",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000004",
            "after": "0x000005"
          },
          "D00596": {
            "before": "0x000011",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 189790,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000000",
            "after": "0x000001"
          }
        }
      },
      {
        "block": 189796,
        "pc": "0x0059E9",
        "prevPc": "0x013D29",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000005",
            "after": "0x000006"
          },
          "D00596": {
            "before": "0x000001",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 189881,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000000",
            "after": "0x000001"
          }
        }
      },
      {
        "block": 189968,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000001",
            "after": "0x000002"
          }
        }
      },
      {
        "block": 190055,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000002",
            "after": "0x000003"
          }
        }
      },
      {
        "block": 190142,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000003",
            "after": "0x000004"
          }
        }
      },
      {
        "block": 190229,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000004",
            "after": "0x000005"
          }
        }
      },
      {
        "block": 190316,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000005",
            "after": "0x000006"
          }
        }
      },
      {
        "block": 190403,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000006",
            "after": "0x000007"
          }
        }
      },
      {
        "block": 190490,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000007",
            "after": "0x000008"
          }
        }
      },
      {
        "block": 190577,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000008",
            "after": "0x000009"
          }
        }
      },
      {
        "block": 190664,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000009",
            "after": "0x00000A"
          }
        }
      },
      {
        "block": 190751,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000A",
            "after": "0x00000B"
          }
        }
      },
      {
        "block": 190838,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000B",
            "after": "0x00000C"
          }
        }
      },
      {
        "block": 190925,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000C",
            "after": "0x00000D"
          }
        }
      },
      {
        "block": 191012,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000D",
            "after": "0x00000E"
          }
        }
      },
      {
        "block": 191099,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000E",
            "after": "0x00000F"
          }
        }
      },
      {
        "block": 191186,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000F",
            "after": "0x000010"
          }
        }
      },
      {
        "block": 191273,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000010",
            "after": "0x000011"
          }
        }
      },
      {
        "block": 191360,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000011",
            "after": "0x000012"
          }
        }
      },
      {
        "block": 191447,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000012",
            "after": "0x000013"
          }
        }
      },
      {
        "block": 191534,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000013",
            "after": "0x000014"
          }
        }
      },
      {
        "block": 191621,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000014",
            "after": "0x000015"
          }
        }
      },
      {
        "block": 191708,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000015",
            "after": "0x000016"
          }
        }
      },
      {
        "block": 191796,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000016",
            "after": "0x000017"
          }
        }
      },
      {
        "block": 191884,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000017",
            "after": "0x000018"
          }
        }
      },
      {
        "block": 191890,
        "pc": "0x0059E9",
        "prevPc": "0x013D29",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000006",
            "after": "0x000007"
          },
          "D00596": {
            "before": "0x000018",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 191975,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000000",
            "after": "0x000001"
          }
        }
      },
      {
        "block": 192062,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000001",
            "after": "0x000002"
          }
        }
      },
      {
        "block": 192149,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000002",
            "after": "0x000003"
          }
        }
      },
      {
        "block": 192236,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000003",
            "after": "0x000004"
          }
        }
      },
      {
        "block": 192323,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000004",
            "after": "0x000005"
          }
        }
      },
      {
        "block": 192410,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000005",
            "after": "0x000006"
          }
        }
      },
      {
        "block": 192497,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000006",
            "after": "0x000007"
          }
        }
      },
      {
        "block": 192584,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000007",
            "after": "0x000008"
          }
        }
      },
      {
        "block": 192671,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000008",
            "after": "0x000009"
          }
        }
      },
      {
        "block": 192758,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000009",
            "after": "0x00000A"
          }
        }
      },
      {
        "block": 192845,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000A",
            "after": "0x00000B"
          }
        }
      },
      {
        "block": 192932,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000B",
            "after": "0x00000C"
          }
        }
      },
      {
        "block": 193019,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000C",
            "after": "0x00000D"
          }
        }
      },
      {
        "block": 193106,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000D",
            "after": "0x00000E"
          }
        }
      },
      {
        "block": 193193,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000E",
            "after": "0x00000F"
          }
        }
      },
      {
        "block": 193280,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000F",
            "after": "0x000010"
          }
        }
      },
      {
        "block": 193367,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000010",
            "after": "0x000011"
          }
        }
      },
      {
        "block": 193454,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000011",
            "after": "0x000012"
          }
        }
      },
      {
        "block": 193541,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000012",
            "after": "0x000013"
          }
        }
      },
      {
        "block": 193547,
        "pc": "0x0059E9",
        "prevPc": "0x013D29",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000007",
            "after": "0x000008"
          },
          "D00596": {
            "before": "0x000013",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 193632,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000000",
            "after": "0x000001"
          }
        }
      },
      {
        "block": 193719,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000001",
            "after": "0x000002"
          }
        }
      },
      {
        "block": 193806,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000002",
            "after": "0x000003"
          }
        }
      },
      {
        "block": 193893,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000003",
            "after": "0x000004"
          }
        }
      },
      {
        "block": 193980,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000004",
            "after": "0x000005"
          }
        }
      },
      {
        "block": 194067,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000005",
            "after": "0x000006"
          }
        }
      },
      {
        "block": 194154,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000006",
            "after": "0x000007"
          }
        }
      },
      {
        "block": 194241,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000007",
            "after": "0x000008"
          }
        }
      },
      {
        "block": 194328,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000008",
            "after": "0x000009"
          }
        }
      },
      {
        "block": 194415,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000009",
            "after": "0x00000A"
          }
        }
      },
      {
        "block": 194448,
        "pc": "0x0059C6",
        "prevPc": "0x0017DD",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000008",
            "after": "0x000004"
          },
          "D00596": {
            "before": "0x00000A",
            "after": "0x000012"
          }
        }
      },
      {
        "block": 194531,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000012",
            "after": "0x000013"
          }
        }
      },
      {
        "block": 194573,
        "pc": "0x0059C6",
        "prevPc": "0x0017DD",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000013",
            "after": "0x000012"
          }
        }
      },
      {
        "block": 194656,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000012",
            "after": "0x000013"
          }
        }
      }
    ]
  },
  "cdpPageErrors": []
}
```


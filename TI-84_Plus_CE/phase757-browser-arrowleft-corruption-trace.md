# Phase 757 Browser ArrowLeft Corruption Trace

Probe: `probe-phase757-browser-arrowleft-corruption-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase757-browser-arrowleft-corruption-trace.mjs`

Serves an in-memory instrumented `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowLeft`, and records the pre-`max_steps` route plus first cx/VAT/cursor zeroing evidence.

The in-memory harness caps only `ArrowLeft` at 200000 steps so the trace completes under the 180s watchdog while preserving the current shell behavior. The shell file on disk is not patched.

No disk browser/runtime/transpiler behavior is patched by this probe.

## Result

- ArrowLeft ended with termination=max_steps, lastPc=0x09EFDE, classified as same 0x08C782 -> 0x06C764 context-vector owner path; first critical zero is not captured at -.
- Final key state: termination=max_steps, steps=200000, lastPc=0x09EFDE, final cpu.pc=0x09EFDE.
- Base was sane before key: D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CC, lastPc=0x08C331.
- First critical zero: none.
- First 0x202020 signal: none.
- Owner-class target hits: vectorOwner08c782=1, vectorRestore06c764=1, clearOwner0a229d=0, clearTail0a22a4=0, cleanup001879=0, cleanupTail0018f8=0.
- CDP/page errors: 0.

## Hot Blocks

| PC | Hits |
|---|---:|
| 0x09EFDE | 75039 |
| 0x06F2E8 | 21780 |
| 0x06F341 | 21780 |
| 0x06F2E2 | 21615 |
| 0x0A2588 | 2904 |
| 0x0A255F | 2904 |
| 0x0A2563 | 2261 |
| 0x0A257E | 2261 |
| 0x003D28 | 1351 |
| 0x003D25 | 1351 |
| 0x001CA6 | 1245 |
| 0x001CC0 | 1233 |
| 0x001CCA | 1233 |
| 0x0A2572 | 1051 |
| 0x001C33 | 1040 |
| 0x001C38 | 1040 |
| 0x001C3C | 1028 |
| 0x001CE4 | 1028 |
| 0x001C44 | 832 |
| 0x001C7D | 832 |
| 0x001C81 | 832 |
| 0x001C82 | 832 |
| 0x001C48 | 832 |
| 0x0A3404 | 816 |
| 0x0A3411 | 776 |
| 0x09EFE8 | 767 |
| 0x09EFCB | 761 |
| 0x09EFEF | 727 |
| 0x0A19A4 | 560 |
| 0x0A2548 | 492 |

## Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|---|
| reset000000 | 0 | - | - | - | - | - | - | - | - |
| rst000038 | 205 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x05C67C |
| low000a92 | 0 | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - |
| cleanup001879 | 0 | - | - | - | - | - | - | - | - |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - |
| sentinel001c33 | 1040 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 |
| sentinel0158bc | 0 | - | - | - | - | - | - | - | - |
| postInsertGate0158de | 0 | - | - | - | - | - | - | - | - |
| eolOwner0a229d | 0 | - | - | - | - | - | - | - | - |
| eolTail0a22a4 | 0 | - | - | - | - | - | - | - | - |
| spaceFillBridge0a2a37 | 7 | 570 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| vectorOwner08c782 | 1 | 18166 | 0x08C782 | 0x06C757 | 0x005ABB | 0x06C7EF | 0xD007F9 | 0xD1A854 | 0x06C764 |
| vectorRestore06c764 | 1 | 18167 | 0x06C764 | 0x08C782 | 0x000000 | 0x06C804 | 0xD007DF | 0xD1A857 | 0x005ABB |
| alternateCxMain06c92c | 1 | 48555 | 0x06C92C | 0x08C745 | 0x005A54 | 0x06C92C | 0x000122 | 0xD1A854 | 0x08C73D |
| cxDispatchWrapper08c72f | 2 | 2190 | 0x08C72F | 0x08C536 | 0x000200 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x08C53A |
| display09efde | 75039 | 5984 | 0x09EFDE | 0x09EFB7 | 0x009595 | 0xD42304 | 0x0052AA | 0xD1A830 | 0x00012B |
| tokenOuter08f3b8 | 0 | - | - | - | - | - | - | - | - |
| tokenTuple08f54b | 0 | - | - | - | - | - | - | - | - |
| tokenExit08f5e1 | 0 | - | - | - | - | - | - | - | - |
| tokenGate090992 | 0 | - | - | - | - | - | - | - | - |

## Tail Snapshots

| Block | Step | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D008E0 | D0243A | D02590 | Key bytes |
|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 199748 | 199952 | 0x09EFDE | 0x09EFDE | 0x005986 | 0xD4AD68 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199749 | 199953 | 0x09EFDE | 0x09EFDE | 0x005886 | 0xD4AD6C | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199750 | 199954 | 0x09EFDE | 0x09EFDE | 0x005786 | 0xD4AD70 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199751 | 199955 | 0x09EFDE | 0x09EFDE | 0x005686 | 0xD4AD74 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199752 | 199956 | 0x09EFDE | 0x09EFDE | 0x005586 | 0xD4AD78 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199753 | 199957 | 0x09EFDE | 0x09EFDE | 0x005486 | 0xD4AD7C | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199754 | 199958 | 0x09EFDE | 0x09EFDE | 0x005386 | 0xD4AD80 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199755 | 199959 | 0x09EFDE | 0x09EFDE | 0x005286 | 0xD4AD84 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199756 | 199960 | 0x09EFDE | 0x09EFDE | 0x005186 | 0xD4AD88 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199757 | 199961 | 0x09EFDE | 0x09EFDE | 0x005086 | 0xD4AD8C | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199758 | 199962 | 0x09EFDE | 0x09EFDE | 0x004F86 | 0xD4AD90 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199759 | 199963 | 0x09EFDE | 0x09EFDE | 0x004E86 | 0xD4AD94 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199760 | 199964 | 0x09EFDE | 0x09EFDE | 0x004D86 | 0xD4AD98 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199761 | 199965 | 0x09EFDE | 0x09EFDE | 0x004C86 | 0xD4AD9C | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199762 | 199966 | 0x09EFDE | 0x09EFDE | 0x004B86 | 0xD4ADA0 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199763 | 199967 | 0x09EFDE | 0x09EFDE | 0x004A86 | 0xD4ADA4 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199764 | 199968 | 0x09EFDE | 0x09EFDE | 0x004986 | 0xD4ADA8 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199765 | 199969 | 0x09EFDE | 0x09EFDE | 0x004886 | 0xD4ADAC | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199766 | 199970 | 0x09EFDE | 0x09EFDE | 0x004786 | 0xD4ADB0 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199767 | 199971 | 0x09EFDE | 0x09EFDE | 0x004686 | 0xD4ADB4 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199768 | 199972 | 0x09EFDE | 0x09EFDE | 0x004586 | 0xD4ADB8 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199769 | 199973 | 0x09EFDE | 0x09EFDE | 0x004486 | 0xD4ADBC | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199770 | 199974 | 0x09EFDE | 0x09EFDE | 0x004386 | 0xD4ADC0 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199771 | 199975 | 0x09EFDE | 0x09EFDE | 0x004286 | 0xD4ADC4 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199772 | 199976 | 0x09EFDE | 0x09EFDE | 0x004186 | 0xD4ADC8 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199773 | 199977 | 0x09EFDE | 0x09EFDE | 0x004086 | 0xD4ADCC | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199774 | 199978 | 0x09EFDE | 0x09EFDE | 0x003F86 | 0xD4ADD0 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199775 | 199979 | 0x09EFDE | 0x09EFDE | 0x003E86 | 0xD4ADD4 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199776 | 199980 | 0x09EFDE | 0x09EFDE | 0x003D86 | 0xD4ADD8 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199777 | 199981 | 0x09EFDE | 0x09EFDE | 0x003C86 | 0xD4ADDC | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199778 | 199982 | 0x09EFDE | 0x09EFDE | 0x003B86 | 0xD4ADE0 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199779 | 199983 | 0x09EFDE | 0x09EFDE | 0x003A86 | 0xD4ADE4 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199780 | 199984 | 0x09EFDE | 0x09EFDE | 0x003986 | 0xD4ADE8 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199781 | 199985 | 0x09EFDE | 0x09EFDE | 0x003886 | 0xD4ADEC | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199782 | 199986 | 0x09EFDE | 0x09EFDE | 0x003786 | 0xD4ADF0 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199783 | 199987 | 0x09EFDE | 0x09EFDE | 0x003686 | 0xD4ADF4 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199784 | 199988 | 0x09EFDE | 0x09EFDE | 0x003586 | 0xD4ADF8 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199785 | 199989 | 0x09EFDE | 0x09EFDE | 0x003486 | 0xD4ADFC | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199786 | 199990 | 0x09EFDE | 0x09EFDE | 0x003386 | 0xD4AE00 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199787 | 199991 | 0x09EFDE | 0x09EFDE | 0x003286 | 0xD4AE04 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199788 | 199992 | 0x09EFDE | 0x09EFDE | 0x003186 | 0xD4AE08 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199789 | 199993 | 0x09EFDE | 0x09EFDE | 0x003086 | 0xD4AE0C | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199790 | 199994 | 0x09EFDE | 0x09EFDE | 0x002F86 | 0xD4AE10 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199791 | 199995 | 0x09EFDE | 0x09EFDE | 0x002E86 | 0xD4AE14 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199792 | 199996 | 0x09EFDE | 0x09EFDE | 0x002D86 | 0xD4AE18 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199793 | 199997 | 0x09EFDE | 0x09EFDE | 0x002C86 | 0xD4AE1C | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199794 | 199998 | 0x09EFDE | 0x09EFDE | 0x002B86 | 0xD4AE20 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |
| 199795 | 199999 | 0x09EFDE | 0x09EFDE | 0x002A86 | 0xD4AE24 | 0x000000 | 0xD1A836 | 0x00010C | 0x06C92C | 0xD1A863 | 0xD1A8CC | 0xD3FE81 | 0x5A/0x32/0x00 |

## Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D00587:0x000000->0x000002; D0058C:0x000000->0x000002; D0058D:0x000000->0x000002; D0058E:0x000000->0x000002; D00080:0x000000->0x000008; D0009F:0x000000->0x000020 |
| 142 | 0x03FA04 | 0x03F9FA | entry-vs-previous-block | D00587:0x000002->0x000032 |
| 143 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000002->0x000032 |
| 145 | 0x03D058 | 0x03F9D8 | entry-vs-previous-block | D00080:0x000008->0x000018 |
| 1149 | 0x08C366 | 0x08C34F | entry-vs-previous-block | D0009F:0x000020->0x000000 |
| 3514 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000002->0x000000; D0058E:0x000002->0x000000 |
| 4110 | 0x000038 | 0x03FA09 | entry-vs-previous-block | D00587:0x000032->0x000000; D00080:0x000018->0x000010 |
| 4365 | 0x02FECF | 0x02FEAF | entry-vs-previous-block | D00080:0x000010->0x000000 |
| 4550 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x00005A |
| 14601 | 0x08377D | 0x061DEF | entry-vs-previous-block | D008E0:0xD1A863->0xD1A839 |
| 16188 | 0x08379A | 0x061E27 | entry-vs-previous-block | D008E0:0xD1A839->0xD1A863 |
| 18167 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |

## Compact Evidence

```json
{
  "finding": "ArrowLeft ended with termination=max_steps, lastPc=0x09EFDE, classified as same 0x08C782 -> 0x06C764 context-vector owner path; first critical zero is not captured at -.",
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
    "status": "Key: LEFT → 200000 steps (max_steps, peak 76665px)",
    "lastPc": "0x09EFDE",
    "cpu": {
      "pc": "0x09EFDE",
      "sp": "0xD1A836",
      "af": "0x00AB80",
      "bc": "0x002986",
      "de": "0x000000",
      "hl": "0xD4AE28",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "f": "0x80",
      "stepCount": 199999
    },
    "fields": {
      "D007CA": "0x06C92C",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D00587": "0x00",
      "D0058C": "0x5A",
      "D0058D": "0x32",
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
    "lastKey": {
      "code": "ArrowLeft",
      "label": "LEFT",
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
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "steps": 200000,
      "termination": "max_steps",
      "wipes": 0,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D007CA": 444716,
      "D008E0": 13740131,
      "D02590": 13893249,
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
      "vramCurrent": 39220
    },
    "stackTop": [
      {
        "addr": "0xD1A836",
        "value": "0x00010C"
      },
      {
        "addr": "0xD1A839",
        "value": "0x00AB7C"
      },
      {
        "addr": "0xD1A83C",
        "value": "0xFF01EF"
      },
      {
        "addr": "0xD1A83F",
        "value": "0x000125"
      },
      {
        "addr": "0xD1A842",
        "value": "0x00001A"
      },
      {
        "addr": "0xD1A845",
        "value": "0x000044"
      },
      {
        "addr": "0xD1A848",
        "value": "0xD1A860"
      },
      {
        "addr": "0xD1A84B",
        "value": "0x06FDEC"
      }
    ]
  },
  "record": {
    "totalBlocks": 199795,
    "regionCounts": {
      "low000000_006fff": 23793,
      "cleanup001000_001fff": 14717,
      "display09e000_0a2fff": 96881,
      "token08f000_090fff": 0,
      "near0a2100_0a23ff": 218
    },
    "targetCounts": {
      "rst000038": 205,
      "sentinel001c33": 1040,
      "spaceFillBridge0a2a37": 7,
      "vectorOwner08c782": 1,
      "vectorRestore06c764": 1,
      "alternateCxMain06c92c": 1,
      "cxDispatchWrapper08c72f": 2,
      "display09efde": 75039
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
          "D00587": "0x02",
          "D0058C": "0x02",
          "D0058D": "0x02",
          "D0058E": "0x02",
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
          "D00587": "0x02",
          "D0058C": "0x02",
          "D0058D": "0x02",
          "D0058E": "0x02",
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
        "block": 570,
        "step": 572,
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
          "stepCount": 572
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x32",
          "D0058C": "0x02",
          "D0058D": "0x32",
          "D0058E": "0x02",
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
      "cxDispatchWrapper08c72f": {
        "block": 2190,
        "step": 2194,
        "pc": "0x08C72F",
        "prevPc": "0x08C536",
        "cpu": {
          "pc": "0x08C72F",
          "sp": "0xD1A85D",
          "af": "0x00029B",
          "bc": "0x000200",
          "de": "0xD2A815",
          "hl": "0x00FFFF",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x9B",
          "stepCount": 2194
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x32",
          "D0058C": "0x02",
          "D0058D": "0x32",
          "D0058E": "0x02",
          "D00080": "0x18",
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
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x00029B"
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
        "vram": 8585
      },
      "display09efde": {
        "block": 5984,
        "step": 5999,
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
          "stepCount": 5999
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x5A",
          "D0058D": "0x32",
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
      "vectorOwner08c782": {
        "block": 18166,
        "step": 18233,
        "pc": "0x08C782",
        "prevPc": "0x06C757",
        "cpu": {
          "pc": "0x08C782",
          "sp": "0xD1A854",
          "af": "0x000054",
          "bc": "0x005ABB",
          "de": "0xD007F9",
          "hl": "0x06C7EF",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "stepCount": 18233
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x5A",
          "D0058D": "0x32",
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
            "addr": "0xD1A854",
            "value": "0x06C764"
          },
          {
            "addr": "0xD1A857",
            "value": "0x005ABB"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x08C911"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x005A54"
          },
          {
            "addr": "0xD1A860",
            "value": "0x08C605"
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
          }
        ],
        "vram": 8585
      },
      "vectorRestore06c764": {
        "block": 18167,
        "step": 18234,
        "pc": "0x06C764",
        "prevPc": "0x08C782",
        "cpu": {
          "pc": "0x06C764",
          "sp": "0xD1A857",
          "af": "0x00AA40",
          "bc": "0x000000",
          "de": "0xD007DF",
          "hl": "0x06C804",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x40",
          "stepCount": 18234
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x5A",
          "D0058D": "0x32",
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
            "addr": "0xD1A857",
            "value": "0x005ABB"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x08C911"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x005A54"
          },
          {
            "addr": "0xD1A860",
            "value": "0x08C605"
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
          }
        ],
        "vram": 8585
      },
      "alternateCxMain06c92c": {
        "block": 48555,
        "step": 48706,
        "pc": "0x06C92C",
        "prevPc": "0x08C745",
        "cpu": {
          "pc": "0x06C92C",
          "sp": "0xD1A854",
          "af": "0x005A23",
          "bc": "0x005A54",
          "de": "0x000122",
          "hl": "0x06C92C",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x23",
          "stepCount": 48706
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x5A",
          "D0058D": "0x32",
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
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x00005A"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x005A22"
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
          }
        ],
        "vram": 8585
      }
    },
    "firstFieldZero": null,
    "first202020": null,
    "hotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 75039
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
        "pc": "0x003D28",
        "count": 1351
      },
      {
        "pc": "0x003D25",
        "count": 1351
      },
      {
        "pc": "0x001CA6",
        "count": 1245
      },
      {
        "pc": "0x001CC0",
        "count": 1233
      },
      {
        "pc": "0x001CCA",
        "count": 1233
      },
      {
        "pc": "0x0A2572",
        "count": 1051
      },
      {
        "pc": "0x001C33",
        "count": 1040
      },
      {
        "pc": "0x001C38",
        "count": 1040
      },
      {
        "pc": "0x001C3C",
        "count": 1028
      },
      {
        "pc": "0x001CE4",
        "count": 1028
      },
      {
        "pc": "0x001C44",
        "count": 832
      },
      {
        "pc": "0x001C7D",
        "count": 832
      },
      {
        "pc": "0x001C81",
        "count": 832
      },
      {
        "pc": "0x001C82",
        "count": 832
      },
      {
        "pc": "0x001C48",
        "count": 832
      },
      {
        "pc": "0x0A3404",
        "count": 816
      },
      {
        "pc": "0x0A3411",
        "count": 776
      },
      {
        "pc": "0x09EFE8",
        "count": 767
      },
      {
        "pc": "0x09EFCB",
        "count": 761
      },
      {
        "pc": "0x09EFEF",
        "count": 727
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
        "pc": "0x0A3408",
        "count": 448
      },
      {
        "pc": "0x001C4F",
        "count": 413
      },
      {
        "pc": "0x001C54",
        "count": 413
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
        "pc": "0x0A2537",
        "count": 374
      },
      {
        "pc": "0x0A3418",
        "count": 270
      },
      {
        "pc": "0x001CE5",
        "count": 217
      },
      {
        "pc": "0x001C42",
        "count": 208
      },
      {
        "pc": "0x000038",
        "count": 205
      },
      {
        "pc": "0x0006F3",
        "count": 205
      },
      {
        "pc": "0x000704",
        "count": 205
      },
      {
        "pc": "0x000710",
        "count": 205
      },
      {
        "pc": "0x001713",
        "count": 205
      },
      {
        "pc": "0x0008BB",
        "count": 205
      },
      {
        "pc": "0x001717",
        "count": 205
      },
      {
        "pc": "0x001718",
        "count": 205
      },
      {
        "pc": "0x00171E",
        "count": 205
      },
      {
        "pc": "0x0067F8",
        "count": 205
      },
      {
        "pc": "0x001CCE",
        "count": 205
      },
      {
        "pc": "0x001CD5",
        "count": 205
      },
      {
        "pc": "0x006808",
        "count": 205
      },
      {
        "pc": "0x006810",
        "count": 205
      },
      {
        "pc": "0x006812",
        "count": 205
      },
      {
        "pc": "0x006816",
        "count": 205
      },
      {
        "pc": "0x00681E",
        "count": 205
      },
      {
        "pc": "0x006828",
        "count": 205
      },
      {
        "pc": "0x001727",
        "count": 205
      },
      {
        "pc": "0x000719",
        "count": 205
      },
      {
        "pc": "0x00071D",
        "count": 205
      },
      {
        "pc": "0x02010C",
        "count": 205
      },
      {
        "pc": "0x03CF7D",
        "count": 205
      },
      {
        "pc": "0x03CFA4",
        "count": 205
      },
      {
        "pc": "0x03CFCF",
        "count": 205
      },
      {
        "pc": "0x03D0E0",
        "count": 205
      },
      {
        "pc": "0x03CFD4",
        "count": 193
      },
      {
        "pc": "0x03CFDB",
        "count": 193
      },
      {
        "pc": "0x03CFE0",
        "count": 193
      },
      {
        "pc": "0x03CFE5",
        "count": 193
      },
      {
        "pc": "0x03CFEA",
        "count": 193
      },
      {
        "pc": "0x03D029",
        "count": 193
      },
      {
        "pc": "0x03D033",
        "count": 193
      },
      {
        "pc": "0x03D038",
        "count": 193
      },
      {
        "pc": "0x03D044",
        "count": 193
      },
      {
        "pc": "0x03D04C",
        "count": 193
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
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFE8",
      "0x09EFEF",
      "0x09EFCB",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFE8",
      "0x09EFEF",
      "0x09EFCB",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFE8",
      "0x09EFEF",
      "0x09EFCB",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE",
      "0x09EFDE"
    ],
    "tailSnapshots": [
      {
        "block": 199732,
        "step": 199936,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006986",
        "hl": "0xD4AD28",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199733,
        "step": 199937,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006886",
        "hl": "0xD4AD2C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199734,
        "step": 199938,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006786",
        "hl": "0xD4AD30",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199735,
        "step": 199939,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006686",
        "hl": "0xD4AD34",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199736,
        "step": 199940,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006586",
        "hl": "0xD4AD38",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199737,
        "step": 199941,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006486",
        "hl": "0xD4AD3C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199738,
        "step": 199942,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006386",
        "hl": "0xD4AD40",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199739,
        "step": 199943,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006286",
        "hl": "0xD4AD44",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199740,
        "step": 199944,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006186",
        "hl": "0xD4AD48",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199741,
        "step": 199945,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x006086",
        "hl": "0xD4AD4C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199742,
        "step": 199946,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005F86",
        "hl": "0xD4AD50",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199743,
        "step": 199947,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005E86",
        "hl": "0xD4AD54",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199744,
        "step": 199948,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005D86",
        "hl": "0xD4AD58",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199745,
        "step": 199949,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005C86",
        "hl": "0xD4AD5C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199746,
        "step": 199950,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005B86",
        "hl": "0xD4AD60",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199747,
        "step": 199951,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005A86",
        "hl": "0xD4AD64",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199748,
        "step": 199952,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005986",
        "hl": "0xD4AD68",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199749,
        "step": 199953,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005886",
        "hl": "0xD4AD6C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199750,
        "step": 199954,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005786",
        "hl": "0xD4AD70",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199751,
        "step": 199955,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005686",
        "hl": "0xD4AD74",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199752,
        "step": 199956,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005586",
        "hl": "0xD4AD78",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199753,
        "step": 199957,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005486",
        "hl": "0xD4AD7C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199754,
        "step": 199958,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005386",
        "hl": "0xD4AD80",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199755,
        "step": 199959,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005286",
        "hl": "0xD4AD84",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199756,
        "step": 199960,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005186",
        "hl": "0xD4AD88",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199757,
        "step": 199961,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x005086",
        "hl": "0xD4AD8C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199758,
        "step": 199962,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004F86",
        "hl": "0xD4AD90",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199759,
        "step": 199963,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004E86",
        "hl": "0xD4AD94",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199760,
        "step": 199964,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004D86",
        "hl": "0xD4AD98",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199761,
        "step": 199965,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004C86",
        "hl": "0xD4AD9C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199762,
        "step": 199966,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004B86",
        "hl": "0xD4ADA0",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199763,
        "step": 199967,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004A86",
        "hl": "0xD4ADA4",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199764,
        "step": 199968,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004986",
        "hl": "0xD4ADA8",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199765,
        "step": 199969,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004886",
        "hl": "0xD4ADAC",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199766,
        "step": 199970,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004786",
        "hl": "0xD4ADB0",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199767,
        "step": 199971,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004686",
        "hl": "0xD4ADB4",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199768,
        "step": 199972,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004586",
        "hl": "0xD4ADB8",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199769,
        "step": 199973,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004486",
        "hl": "0xD4ADBC",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199770,
        "step": 199974,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004386",
        "hl": "0xD4ADC0",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199771,
        "step": 199975,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004286",
        "hl": "0xD4ADC4",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199772,
        "step": 199976,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004186",
        "hl": "0xD4ADC8",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199773,
        "step": 199977,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x004086",
        "hl": "0xD4ADCC",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199774,
        "step": 199978,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003F86",
        "hl": "0xD4ADD0",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199775,
        "step": 199979,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003E86",
        "hl": "0xD4ADD4",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199776,
        "step": 199980,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003D86",
        "hl": "0xD4ADD8",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199777,
        "step": 199981,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003C86",
        "hl": "0xD4ADDC",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199778,
        "step": 199982,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003B86",
        "hl": "0xD4ADE0",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199779,
        "step": 199983,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003A86",
        "hl": "0xD4ADE4",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199780,
        "step": 199984,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003986",
        "hl": "0xD4ADE8",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199781,
        "step": 199985,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003886",
        "hl": "0xD4ADEC",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199782,
        "step": 199986,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003786",
        "hl": "0xD4ADF0",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199783,
        "step": 199987,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003686",
        "hl": "0xD4ADF4",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199784,
        "step": 199988,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003586",
        "hl": "0xD4ADF8",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199785,
        "step": 199989,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003486",
        "hl": "0xD4ADFC",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199786,
        "step": 199990,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003386",
        "hl": "0xD4AE00",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199787,
        "step": 199991,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003286",
        "hl": "0xD4AE04",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199788,
        "step": 199992,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003186",
        "hl": "0xD4AE08",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199789,
        "step": 199993,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x003086",
        "hl": "0xD4AE0C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199790,
        "step": 199994,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x002F86",
        "hl": "0xD4AE10",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199791,
        "step": 199995,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x002E86",
        "hl": "0xD4AE14",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199792,
        "step": 199996,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x002D86",
        "hl": "0xD4AE18",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199793,
        "step": 199997,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x002C86",
        "hl": "0xD4AE1C",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199794,
        "step": 199998,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x002B86",
        "hl": "0xD4AE20",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      },
      {
        "block": 199795,
        "step": 199999,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "bc": "0x002A86",
        "hl": "0xD4AE24",
        "de": "0x000000",
        "sp": "0xD1A836",
        "stack0": "0x00010C",
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D02590": "0xD3FE81",
        "D0058C": "0x5A",
        "D0058D": "0x32",
        "D0058E": "0x00"
      }
    ],
    "fieldTransitions": [
      {
        "block": 1,
        "pc": "0x08C331",
        "prevPc": null,
        "timing": "entry-vs-previous-block",
        "diff": {
          "D008E0": {
            "before": "0x000000",
            "after": "0xD1A863"
          },
          "D00587": {
            "before": "0x000000",
            "after": "0x000002"
          },
          "D0058C": {
            "before": "0x000000",
            "after": "0x000002"
          },
          "D0058D": {
            "before": "0x000000",
            "after": "0x000002"
          },
          "D0058E": {
            "before": "0x000000",
            "after": "0x000002"
          },
          "D00080": {
            "before": "0x000000",
            "after": "0x000008"
          },
          "D0009F": {
            "before": "0x000000",
            "after": "0x000020"
          }
        }
      },
      {
        "block": 142,
        "pc": "0x03FA04",
        "prevPc": "0x03F9FA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00587": {
            "before": "0x000002",
            "after": "0x000032"
          }
        }
      },
      {
        "block": 143,
        "pc": "0x03F9D5",
        "prevPc": "0x03FA04",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0058D": {
            "before": "0x000002",
            "after": "0x000032"
          }
        }
      },
      {
        "block": 145,
        "pc": "0x03D058",
        "prevPc": "0x03F9D8",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00080": {
            "before": "0x000008",
            "after": "0x000018"
          }
        }
      },
      {
        "block": 1149,
        "pc": "0x08C366",
        "prevPc": "0x08C34F",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0009F": {
            "before": "0x000020",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 3514,
        "pc": "0x02FCB3",
        "prevPc": "0x08C359",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0058C": {
            "before": "0x000002",
            "after": "0x000000"
          },
          "D0058E": {
            "before": "0x000002",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 4110,
        "pc": "0x000038",
        "prevPc": "0x03FA09",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00587": {
            "before": "0x000032",
            "after": "0x000000"
          },
          "D00080": {
            "before": "0x000018",
            "after": "0x000010"
          }
        }
      },
      {
        "block": 4365,
        "pc": "0x02FECF",
        "prevPc": "0x02FEAF",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00080": {
            "before": "0x000010",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 4550,
        "pc": "0x08C38A",
        "prevPc": "0x08C366",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0058C": {
            "before": "0x000000",
            "after": "0x00005A"
          }
        }
      },
      {
        "block": 14601,
        "pc": "0x08377D",
        "prevPc": "0x061DEF",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D008E0": {
            "before": "0xD1A863",
            "after": "0xD1A839"
          }
        }
      },
      {
        "block": 16188,
        "pc": "0x08379A",
        "prevPc": "0x061E27",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D008E0": {
            "before": "0xD1A839",
            "after": "0xD1A863"
          }
        }
      },
      {
        "block": 18167,
        "pc": "0x06C764",
        "prevPc": "0x08C782",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D007CA": {
            "before": "0x0585E9",
            "after": "0x06C92C"
          }
        }
      }
    ]
  },
  "cdpPageErrors": []
}
```

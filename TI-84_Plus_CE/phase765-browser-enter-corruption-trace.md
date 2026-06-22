# Phase 765 Browser Enter Corruption Trace

Probe: `probe-phase765-browser-enter-corruption-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase765-browser-enter-corruption-trace.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `Enter`, and records the route plus first cx/VAT/cursor/key-state corruption evidence.

The in-memory harness caps only `Enter` at 190000 steps so the trace completes under the 180s watchdog. The shell file on disk is not patched.

No disk browser/runtime/transpiler behavior is patched by this probe.

## Result

- Enter ends with termination=max_steps, lastPc=0x000B7C, classified as CLEAR-adjacent 0x0A2A37 space-fill bridge followed by cleanup/wipe 0x001879 -> 0x0018F8; first critical zero at 0x0018F8 after 0x001879; first D007CA divergence at 0x0018F8 after 0x001879; hot tail 0x000A92x32512, 0x000BFEx30988, 0x0021C2x10092, 0x006D5Dx10088, 0x006D64x10088.
- Final key state: termination=max_steps, steps=190000, lastPc=0x000B7C, final cpu.pc=0x000B72.
- Base before key: D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, lastPc=0x08C331, VRAM=8549.
- First critical zero: observed-before-block at block 21739, pc=0x0018F8, prev=0x001879.
- First 0x202020 signal: none.
- First D007CA divergence: observed-before-block at block 21739, pc=0x0018F8, prev=0x001879, expected=0x0585E9, saw=0x000000.
- First D0243A change: observed-before-block at block 16570, pc=0x04C973, prev=0x05E851, expected=0xD1A8CC, saw=0xD1A8A3.
- Owner-class target hits: vectorOwner08c782=0, vectorRestore06c764=0, clearOwner0a229d=0, clearTail0a22a4=0, spaceFillBridge0a2a37=7, cleanup001879=1, cleanupTail0018f8=1.
- CDP/page errors: 0.

## Hot Blocks

| PC | Hits |
|---|---:|
| 0x000A92 | 32512 |
| 0x000BFE | 30988 |
| 0x0021C2 | 10092 |
| 0x006D5D | 10088 |
| 0x006D64 | 10088 |
| 0x006CDF | 10083 |
| 0x006D0F | 10083 |
| 0x006D38 | 10080 |
| 0x006D4F | 10080 |
| 0x006CF7 | 10078 |
| 0x000B72 | 3717 |
| 0x000B7C | 2971 |
| 0x000B81 | 2971 |
| 0x005AE8 | 1424 |
| 0x005B16 | 1424 |
| 0x005B4B | 1424 |
| 0x005AB6 | 1335 |
| 0x000B7F | 993 |
| 0x003D28 | 637 |
| 0x003D25 | 637 |
| 0x001CA6 | 582 |
| 0x001CC0 | 570 |
| 0x001CCA | 569 |
| 0x0A19A4 | 560 |
| 0x001C33 | 490 |
| 0x001C38 | 488 |
| 0x001C3C | 477 |
| 0x001CE4 | 473 |
| 0x001C7D | 390 |
| 0x001C81 | 390 |
| 0x001C82 | 390 |
| 0x001C44 | 389 |
| 0x001C48 | 389 |
| 0x000AC5 | 384 |
| 0x000AEE | 381 |

## Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|---|
| reset000000 | 1 | 21169 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x000000 |
| rst000038 | 93 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x05C67C |
| low000a92 | 32512 | 112553 | 0x000A92 | 0x000A72 | 0x000000 | 0x0000E2 | 0xD1A3FD | 0xD1A3BC | 0x000000 |
| low000b7c | 2971 | 112492 | 0x000B7C | 0x000B60 | 0x00105C | 0xFFFF16 | 0x0000EA | 0xD1A3BC | 0x000000 |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 21738 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0013E8 |
| cleanupTail0018f8 | 1 | 21739 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FEFF | 0xD3FF00 | 0xD1A87B | 0x0013E8 |
| sentinel001c33 | 490 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 |
| sentinel0158bc | 2 | 21534 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0158EC |
| postInsertGate0158de | 2 | 21532 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0013DA |
| cursorOwner05e348 | 0 | - | - | - | - | - | - | - | - |
| cursorNext05e372 | 0 | - | - | - | - | - | - | - | - |
| eolOwner0a229d | 0 | - | - | - | - | - | - | - | - |
| eolTail0a22a4 | 0 | - | - | - | - | - | - | - | - |
| spaceFillBridge0a2a37 | 7 | 567 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 1 | 2185 | 0x08C72F | 0x08C536 | 0x000500 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x08C53A |
| cxJpTrampoline08c745 | 1 | 2192 | 0x08C745 | 0x08C734 | 0x000500 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x08C73D |
| display09efde | 0 | - | - | - | - | - | - | - | - |
| display09efcb | 0 | - | - | - | - | - | - | - | - |
| display09efe8 | 0 | - | - | - | - | - | - | - | - |
| tokenOuter08f3b8 | 0 | - | - | - | - | - | - | - | - |
| tokenTuple08f54b | 0 | - | - | - | - | - | - | - | - |
| tokenExit08f5e1 | 0 | - | - | - | - | - | - | - | - |
| tokenGate090992 | 0 | - | - | - | - | - | - | - | - |

## Tail Snapshots

| Block | Step | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D008E0 | D0243A | D02590 | Key bytes |
|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 189852 | 189944 | 0x000BFE | 0x000BFE | 0x000000 | 0x000013 | 0x000023 | 0xD1A3BC | 0x000013 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189853 | 189945 | 0x000BFE | 0x000BFE | 0xFFFFFF | 0x000012 | 0x000038 | 0xD1A3BC | 0x000012 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189854 | 189946 | 0x000BFE | 0x000BFE | 0x000000 | 0x000011 | 0x000043 | 0xD1A3BC | 0x000011 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189855 | 189947 | 0x000BFE | 0x000BFE | 0x000000 | 0x000010 | 0x0000DF | 0xD1A3BC | 0x000010 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189856 | 189948 | 0x000BFE | 0x000BFE | 0xFFFFFF | 0x00000F | 0x00001C | 0xD1A3BC | 0x00000F | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189857 | 189949 | 0x000BFE | 0x000BFE | 0x000000 | 0x00000E | 0x0000F3 | 0xD1A3BC | 0x00000E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189858 | 189950 | 0x000BFE | 0x000BFE | 0xFFFFFF | 0x00000D | 0x0000C5 | 0xD1A3BC | 0x00000D | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189859 | 189951 | 0x000BFE | 0x000BFE | 0x000000 | 0x00000C | 0x000003 | 0xD1A3BC | 0x00000C | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189860 | 189952 | 0x000BFE | 0x000BFE | 0x000000 | 0x00000B | 0x000075 | 0xD1A3BC | 0x00000B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189861 | 189953 | 0x000BFE | 0x000BFE | 0x000000 | 0x00000A | 0x0000F3 | 0xD1A3BC | 0x00000A | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189862 | 189954 | 0x000BFE | 0x000BFE | 0xFFFFFF | 0x000009 | 0x00003A | 0xD1A3BC | 0x000009 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189863 | 189955 | 0x000BFE | 0x000BFE | 0x000000 | 0x000008 | 0x0000EF | 0xD1A3BC | 0x000008 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189864 | 189956 | 0x000BFE | 0x000BFE | 0xFFFFFF | 0x000007 | 0x0000C7 | 0xD1A3BC | 0x000007 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189865 | 189957 | 0x000BFE | 0x000BFE | 0xFFFFFF | 0x000006 | 0x000040 | 0xD1A3BC | 0x000006 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189866 | 189958 | 0x000BFE | 0x000BFE | 0xFFFFFF | 0x000005 | 0x0000E6 | 0xD1A3BC | 0x000005 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189867 | 189959 | 0x000BFE | 0x000BFE | 0xFFFFFF | 0x000004 | 0x0000AB | 0xD1A3BC | 0x000004 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189868 | 189960 | 0x000BFE | 0x000BFE | 0xFFFFFF | 0x000003 | 0x000038 | 0xD1A3BC | 0x000003 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189869 | 189961 | 0x000BFE | 0x000BFE | 0x000000 | 0x000002 | 0x00002E | 0xD1A3BC | 0x000002 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189870 | 189962 | 0x000BFE | 0x000BFE | 0x000000 | 0x000001 | 0x0000AB | 0xD1A3BC | 0x000001 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189871 | 189963 | 0x000C4A | 0x000BFE | 0xFFFFFF | 0x000000 | 0x0000AB | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189872 | 189964 | 0x000C80 | 0x000C4A | 0xD1A487 | 0x000000 | 0xFFFFFF | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189873 | 189965 | 0x000B37 | 0x000C80 | 0xD1A487 | 0x000009 | 0xFFFFFF | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189874 | 189966 | 0x000B60 | 0x000B37 | 0x000089 | 0xD1A3FB | 0xFFFFFF | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189875 | 189967 | 0x000B7C | 0x000B60 | 0x0010C6 | 0xFFFF16 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189876 | 189968 | 0x000B81 | 0x000B7C | 0x0010C6 | 0x000000 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189877 | 189969 | 0x000B72 | 0x000B81 | 0x000FC6 | 0x000000 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189878 | 189970 | 0x000B7C | 0x000B72 | 0x000F8C | 0xFFFF17 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189879 | 189971 | 0x000B81 | 0x000B7C | 0x000F8C | 0x000001 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189880 | 189972 | 0x000B72 | 0x000B81 | 0x000E8C | 0x000001 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189881 | 189973 | 0x000B7C | 0x000B72 | 0x000E18 | 0xFFFF19 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189882 | 189974 | 0x000B81 | 0x000B7C | 0x000E18 | 0x000003 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189883 | 189975 | 0x000B72 | 0x000B81 | 0x000D18 | 0x000003 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189884 | 189976 | 0x000B7C | 0x000B72 | 0x000D30 | 0xFFFF1C | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189885 | 189977 | 0x000B81 | 0x000B7C | 0x000D30 | 0x000006 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189886 | 189978 | 0x000B72 | 0x000B81 | 0x000C30 | 0x000006 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189887 | 189979 | 0x000B7C | 0x000B72 | 0x000C60 | 0xFFFF23 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189888 | 189980 | 0x000B81 | 0x000B7C | 0x000C60 | 0x00000D | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189889 | 189981 | 0x000B72 | 0x000B81 | 0x000B60 | 0x00000D | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189890 | 189982 | 0x000B7C | 0x000B72 | 0x000BC0 | 0xFFFF31 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189891 | 189983 | 0x000B81 | 0x000B7C | 0x000BC0 | 0x00001B | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189892 | 189984 | 0x000B72 | 0x000B81 | 0x000AC0 | 0x00001B | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189893 | 189985 | 0x000B7C | 0x000B72 | 0x000A80 | 0xFFFF4C | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189894 | 189986 | 0x000B81 | 0x000B7C | 0x000A80 | 0x000036 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189895 | 189987 | 0x000B72 | 0x000B81 | 0x000980 | 0x000036 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189896 | 189988 | 0x000B7C | 0x000B72 | 0x000900 | 0xFFFF82 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189897 | 189989 | 0x000B81 | 0x000B7C | 0x000900 | 0x00006C | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189898 | 189990 | 0x000B72 | 0x000B81 | 0x000800 | 0x00006C | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189899 | 189991 | 0x000B7C | 0x000B72 | 0x000800 | 0xFFFFEE | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189900 | 189992 | 0x000B81 | 0x000B7C | 0x000800 | 0x0000D8 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189901 | 189993 | 0x000B72 | 0x000B81 | 0x000700 | 0x0000D8 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189902 | 189994 | 0x000B7F | 0x000B72 | 0x000700 | 0x0000C7 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189903 | 189995 | 0x000B72 | 0x000B7F | 0x000601 | 0x0000C7 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189904 | 189996 | 0x000B7F | 0x000B72 | 0x000602 | 0x0000A5 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189905 | 189997 | 0x000B72 | 0x000B7F | 0x000503 | 0x0000A5 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189906 | 189998 | 0x000B7F | 0x000B72 | 0x000506 | 0x000060 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189907 | 189999 | 0x000B72 | 0x000B7F | 0x000407 | 0x000060 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |

## Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x000005; D0058D:0x000000->0x000005; D0058E:0x000000->0x000005 |
| 142 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000005->0x000029 |
| 16570 | 0x04C973 | 0x05E851 | entry-vs-previous-block | D0243A:0xD1A8CC->0xD1A8A3 |
| 17722 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000005->0x000000; D0058E:0x000005->0x000000 |
| 21739 | 0x0018F8 | 0x001879 | entry-vs-previous-block | D007CA:0x0585E9->0x000000; D008E0:0xD1A863->0x000000; D0243A:0xD1A8A3->0x000000; D0243D:0xD2A83E->0x000000; D02590:0xD3FE81->0x000000; D0058D:0x000029->0x000000 |

## Compact Evidence

```json
{
  "finding": "Enter ends with termination=max_steps, lastPc=0x000B7C, classified as CLEAR-adjacent 0x0A2A37 space-fill bridge followed by cleanup/wipe 0x001879 -> 0x0018F8; first critical zero at 0x0018F8 after 0x001879; first D007CA divergence at 0x0018F8 after 0x001879; hot tail 0x000A92x32512, 0x000BFEx30988, 0x0021C2x10092, 0x006D5Dx10088, 0x006D64x10088.",
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
    "status": "Key: ENTER → 190000 steps (max_steps, peak 8689px)",
    "lastPc": "0x000B7C",
    "cpu": {
      "pc": "0x000B72",
      "sp": "0xD1A3BC",
      "af": "0x0060B3",
      "bc": "0x00040E",
      "de": "0x0000EA",
      "hl": "0xFFFFD6",
      "ix": "0xD1A3E9",
      "iy": "0xD00080",
      "f": "0xB3",
      "stepCount": 189999
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
      "code": "Enter",
      "label": "ENTER",
      "expectedInsertByte": null,
      "controlPreStopPc": 663888,
      "controlPreStopLabel": "enter-context-ldir",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": null,
      "controlStopPc": null,
      "controlStopCursorBefore": null,
      "controlStopCursorAfter": null,
      "controlStopCursorRestored": false,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": false,
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "steps": 190000,
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
      "vramPeak": 8689,
      "vramCurrent": 3039
    },
    "stackTop": [
      {
        "addr": "0xD1A3BC",
        "value": "0x000000"
      },
      {
        "addr": "0xD1A3BF",
        "value": "0x000000"
      },
      {
        "addr": "0xD1A3C2",
        "value": "0x006C63"
      },
      {
        "addr": "0xD1A3C5",
        "value": "0x00EADA"
      },
      {
        "addr": "0xD1A3C8",
        "value": "0xD7180E"
      },
      {
        "addr": "0xD1A3CB",
        "value": "0xD1A487"
      },
      {
        "addr": "0xD1A3CE",
        "value": "0x006C8E"
      },
      {
        "addr": "0xD1A3D1",
        "value": "0x0009EA"
      }
    ]
  },
  "record": {
    "totalBlocks": 189907,
    "regionCounts": {
      "low000000_006fff": 179591,
      "cleanup001000_001fff": 7532,
      "display09e000_0a2fff": 2754,
      "token08f000_090fff": 0,
      "near0a2100_0a23ff": 14
    },
    "targetCounts": {
      "reset000000": 1,
      "rst000038": 93,
      "low000a92": 32512,
      "low000b7c": 2971,
      "cleanup001879": 1,
      "cleanupTail0018f8": 1,
      "sentinel001c33": 490,
      "sentinel0158bc": 2,
      "postInsertGate0158de": 2,
      "spaceFillBridge0a2a37": 7,
      "cxDispatchWrapper08c72f": 1,
      "cxJpTrampoline08c745": 1
    },
    "firstSamples": {
      "rst000038": {
        "expected": "-",
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
          "D00587": "0x09",
          "D0058C": "0x05",
          "D0058D": "0x05",
          "D0058E": "0x05",
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
        "expected": "-",
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
          "D00587": "0x09",
          "D0058C": "0x05",
          "D0058D": "0x05",
          "D0058E": "0x05",
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
        "expected": "-",
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
          "D00587": "0x29",
          "D0058C": "0x05",
          "D0058D": "0x29",
          "D0058E": "0x05",
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
        "expected": "-",
        "block": 2185,
        "step": 2189,
        "pc": "0x08C72F",
        "prevPc": "0x08C536",
        "cpu": {
          "pc": "0x08C72F",
          "sp": "0xD1A85D",
          "af": "0x00059B",
          "bc": "0x000500",
          "de": "0xD2A815",
          "hl": "0x00FFFF",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x9B",
          "stepCount": 2189
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x29",
          "D0058C": "0x05",
          "D0058D": "0x29",
          "D0058E": "0x05",
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
            "value": "0x00059B"
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
      "cxJpTrampoline08c745": {
        "expected": "-",
        "block": 2192,
        "step": 2196,
        "pc": "0x08C745",
        "prevPc": "0x08C734",
        "cpu": {
          "pc": "0x08C745",
          "sp": "0xD1A854",
          "af": "0x00051B",
          "bc": "0x000500",
          "de": "0xD2A815",
          "hl": "0x0585E9",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x1B",
          "stepCount": 2196
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x29",
          "D0058C": "0x05",
          "D0058D": "0x29",
          "D0058E": "0x05",
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
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x000505"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x00FFFF"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x00059B"
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
      "reset000000": {
        "expected": "-",
        "block": 21169,
        "step": 21261,
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
          "stepCount": 21261
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x29",
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
        "vram": 8689
      },
      "postInsertGate0158de": {
        "expected": "-",
        "block": 21532,
        "step": 21624,
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
          "stepCount": 21624
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x29",
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
        "vram": 8689
      },
      "sentinel0158bc": {
        "expected": "-",
        "block": 21534,
        "step": 21626,
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
          "stepCount": 21626
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x29",
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
        "vram": 8689
      },
      "cleanup001879": {
        "expected": "-",
        "block": 21738,
        "step": 21830,
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
          "stepCount": 21830
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x29",
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
        "vram": 8689
      },
      "cleanupTail0018f8": {
        "expected": "-",
        "block": 21739,
        "step": 21831,
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
          "stepCount": 21831
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
        "vram": 8689
      },
      "low000b7c": {
        "expected": "-",
        "block": 112492,
        "step": 112584,
        "pc": "0x000B7C",
        "prevPc": "0x000B60",
        "cpu": {
          "pc": "0x000B7C",
          "sp": "0xD1A3BC",
          "af": "0x000093",
          "bc": "0x00105C",
          "de": "0x0000EA",
          "hl": "0xFFFF16",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "f": "0x93",
          "stepCount": 112584
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
        "stackTop": [
          {
            "addr": "0xD1A3BC",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3BF",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3C2",
            "value": "0x00002E"
          },
          {
            "addr": "0xD1A3C5",
            "value": "0x00EADA"
          },
          {
            "addr": "0xD1A3C8",
            "value": "0x21F192"
          },
          {
            "addr": "0xD1A3CB",
            "value": "0xD1A47D"
          },
          {
            "addr": "0xD1A3CE",
            "value": "0x006C8E"
          },
          {
            "addr": "0xD1A3D1",
            "value": "0x000025"
          }
        ],
        "vram": 3039
      },
      "low000a92": {
        "expected": "-",
        "block": 112553,
        "step": 112645,
        "pc": "0x000A92",
        "prevPc": "0x000A72",
        "cpu": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "af": "0x00E13E",
          "bc": "0x000000",
          "de": "0xD1A3FD",
          "hl": "0x0000E2",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "f": "0x3E",
          "stepCount": 112645
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
        "stackTop": [
          {
            "addr": "0xD1A3BC",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3BF",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3C2",
            "value": "0x00002E"
          },
          {
            "addr": "0xD1A3C5",
            "value": "0x00EADA"
          },
          {
            "addr": "0xD1A3C8",
            "value": "0x002ECA"
          },
          {
            "addr": "0xD1A3CB",
            "value": "0xD1A47D"
          },
          {
            "addr": "0xD1A3CE",
            "value": "0x006C8E"
          },
          {
            "addr": "0xD1A3D1",
            "value": "0xFFFF00"
          }
        ],
        "vram": 3039
      }
    },
    "firstCriticalZero": {
      "source": "observed-before-block",
      "snapshot": {
        "expected": "-",
        "block": 21739,
        "step": 21831,
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
          "stepCount": 21831
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
        "vram": 8689
      }
    },
    "first202020": null,
    "firstBadD007CA": {
      "source": "observed-before-block",
      "expected": "0x0585E9",
      "snapshot": {
        "expected": "-",
        "block": 21739,
        "step": 21831,
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
          "stepCount": 21831
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
        "vram": 8689
      }
    },
    "firstD0243AChange": {
      "source": "observed-before-block",
      "expected": "0xD1A8CC",
      "snapshot": {
        "expected": "-",
        "block": 16570,
        "step": 16646,
        "pc": "0x04C973",
        "prevPc": "0x05E851",
        "cpu": {
          "pc": "0x04C973",
          "sp": "0xD1A848",
          "af": "0x000593",
          "bc": "0xD3FE81",
          "de": "0xD1A8A3",
          "hl": "0xD2A83E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x93",
          "stepCount": 16646
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x29",
          "D0058C": "0x05",
          "D0058D": "0x29",
          "D0058E": "0x05",
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
            "addr": "0xD1A848",
            "value": "0x05E85E"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x058CA0"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000554"
          },
          {
            "addr": "0xD1A851",
            "value": "0x058C6E"
          },
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x000505"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x00FFFF"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          }
        ],
        "vram": 8585
      }
    },
    "hotBlocks": [
      {
        "pc": "0x000A92",
        "count": 32512
      },
      {
        "pc": "0x000BFE",
        "count": 30988
      },
      {
        "pc": "0x0021C2",
        "count": 10092
      },
      {
        "pc": "0x006D5D",
        "count": 10088
      },
      {
        "pc": "0x006D64",
        "count": 10088
      },
      {
        "pc": "0x006CDF",
        "count": 10083
      },
      {
        "pc": "0x006D0F",
        "count": 10083
      },
      {
        "pc": "0x006D38",
        "count": 10080
      },
      {
        "pc": "0x006D4F",
        "count": 10080
      },
      {
        "pc": "0x006CF7",
        "count": 10078
      },
      {
        "pc": "0x000B72",
        "count": 3717
      },
      {
        "pc": "0x000B7C",
        "count": 2971
      },
      {
        "pc": "0x000B81",
        "count": 2971
      },
      {
        "pc": "0x005AE8",
        "count": 1424
      },
      {
        "pc": "0x005B16",
        "count": 1424
      },
      {
        "pc": "0x005B4B",
        "count": 1424
      },
      {
        "pc": "0x005AB6",
        "count": 1335
      },
      {
        "pc": "0x000B7F",
        "count": 993
      },
      {
        "pc": "0x003D28",
        "count": 637
      },
      {
        "pc": "0x003D25",
        "count": 637
      },
      {
        "pc": "0x001CA6",
        "count": 582
      },
      {
        "pc": "0x001CC0",
        "count": 570
      },
      {
        "pc": "0x001CCA",
        "count": 569
      },
      {
        "pc": "0x0A19A4",
        "count": 560
      },
      {
        "pc": "0x001C33",
        "count": 490
      },
      {
        "pc": "0x001C38",
        "count": 488
      },
      {
        "pc": "0x001C3C",
        "count": 477
      },
      {
        "pc": "0x001CE4",
        "count": 473
      },
      {
        "pc": "0x001C7D",
        "count": 390
      },
      {
        "pc": "0x001C81",
        "count": 390
      },
      {
        "pc": "0x001C82",
        "count": 390
      },
      {
        "pc": "0x001C44",
        "count": 389
      },
      {
        "pc": "0x001C48",
        "count": 389
      },
      {
        "pc": "0x000AC5",
        "count": 384
      },
      {
        "pc": "0x000AEE",
        "count": 381
      },
      {
        "pc": "0x000A79",
        "count": 381
      },
      {
        "pc": "0x0A3404",
        "count": 360
      },
      {
        "pc": "0x0A3411",
        "count": 316
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
        "pc": "0x000ACE",
        "count": 250
      },
      {
        "pc": "0x000BCB",
        "count": 249
      },
      {
        "pc": "0x000B60",
        "count": 248
      },
      {
        "pc": "0x000C80",
        "count": 248
      },
      {
        "pc": "0x000B83",
        "count": 247
      },
      {
        "pc": "0x000B37",
        "count": 247
      },
      {
        "pc": "0x000BD3",
        "count": 244
      },
      {
        "pc": "0x000C4A",
        "count": 244
      },
      {
        "pc": "0x0A3408",
        "count": 224
      },
      {
        "pc": "0x001C4F",
        "count": 192
      },
      {
        "pc": "0x001C54",
        "count": 192
      },
      {
        "pc": "0x0008BB",
        "count": 183
      },
      {
        "pc": "0x001713",
        "count": 182
      },
      {
        "pc": "0x001717",
        "count": 182
      },
      {
        "pc": "0x001718",
        "count": 182
      },
      {
        "pc": "0x006129",
        "count": 173
      },
      {
        "pc": "0x00612E",
        "count": 173
      },
      {
        "pc": "0x0A1A83",
        "count": 160
      },
      {
        "pc": "0x000AD9",
        "count": 134
      },
      {
        "pc": "0x000C75",
        "count": 127
      },
      {
        "pc": "0x000BC1",
        "count": 119
      },
      {
        "pc": "0x000BC3",
        "count": 119
      },
      {
        "pc": "0x000BBC",
        "count": 119
      },
      {
        "pc": "0x0A3418",
        "count": 112
      },
      {
        "pc": "0x001CE5",
        "count": 109
      },
      {
        "pc": "0x001C42",
        "count": 99
      },
      {
        "pc": "0x001CCE",
        "count": 96
      },
      {
        "pc": "0x001CD5",
        "count": 96
      },
      {
        "pc": "0x005A53",
        "count": 94
      },
      {
        "pc": "0x000038",
        "count": 93
      },
      {
        "pc": "0x0006F3",
        "count": 93
      },
      {
        "pc": "0x000704",
        "count": 93
      },
      {
        "pc": "0x000710",
        "count": 93
      },
      {
        "pc": "0x00171E",
        "count": 93
      },
      {
        "pc": "0x0067F8",
        "count": 93
      },
      {
        "pc": "0x006808",
        "count": 93
      },
      {
        "pc": "0x006810",
        "count": 93
      },
      {
        "pc": "0x006812",
        "count": 93
      },
      {
        "pc": "0x006816",
        "count": 93
      },
      {
        "pc": "0x00681E",
        "count": 93
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
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
      "0x000B72",
      "0x000B7F",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B83",
      "0x000BCB",
      "0x000BD3",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000C4A",
      "0x000C80",
      "0x000B37",
      "0x000B60",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
      "0x000B72",
      "0x000B7F",
      "0x000B72",
      "0x000B7F",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
      "0x000B72",
      "0x000B7F",
      "0x000B83",
      "0x000BC1",
      "0x000BC3",
      "0x000BBC",
      "0x000BCB",
      "0x000BD3",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000BFE",
      "0x000C4A",
      "0x000C80",
      "0x000B37",
      "0x000B60",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
      "0x000B72",
      "0x000B7F",
      "0x000B72",
      "0x000B7F",
      "0x000B72"
    ],
    "tailSnapshots": [
      {
        "block": 189828,
        "step": 189920,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x00002B",
        "de": "0x000044",
        "sp": "0xD1A3BC",
        "stack0": "0x00002B",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189829,
        "step": 189921,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x00002A",
        "de": "0x000029",
        "sp": "0xD1A3BC",
        "stack0": "0x00002A",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189830,
        "step": 189922,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000029",
        "de": "0x00008E",
        "sp": "0xD1A3BC",
        "stack0": "0x000029",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189831,
        "step": 189923,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000028",
        "de": "0x000004",
        "sp": "0xD1A3BC",
        "stack0": "0x000028",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189832,
        "step": 189924,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000027",
        "de": "0x000052",
        "sp": "0xD1A3BC",
        "stack0": "0x000027",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189833,
        "step": 189925,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000026",
        "de": "0x000044",
        "sp": "0xD1A3BC",
        "stack0": "0x000026",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189834,
        "step": 189926,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000025",
        "de": "0x0000C2",
        "sp": "0xD1A3BC",
        "stack0": "0x000025",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189835,
        "step": 189927,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000024",
        "de": "0x00001B",
        "sp": "0xD1A3BC",
        "stack0": "0x000024",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189836,
        "step": 189928,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000023",
        "de": "0x000029",
        "sp": "0xD1A3BC",
        "stack0": "0x000023",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189837,
        "step": 189929,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000022",
        "de": "0x000097",
        "sp": "0xD1A3BC",
        "stack0": "0x000022",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189838,
        "step": 189930,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000021",
        "de": "0x000005",
        "sp": "0xD1A3BC",
        "stack0": "0x000021",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189839,
        "step": 189931,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000020",
        "de": "0x0000A1",
        "sp": "0xD1A3BC",
        "stack0": "0x000020",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189840,
        "step": 189932,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x00001F",
        "de": "0x0000F5",
        "sp": "0xD1A3BC",
        "stack0": "0x00001F",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189841,
        "step": 189933,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x00001E",
        "de": "0x000060",
        "sp": "0xD1A3BC",
        "stack0": "0x00001E",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189842,
        "step": 189934,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x00001D",
        "de": "0x0000D5",
        "sp": "0xD1A3BC",
        "stack0": "0x00001D",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189843,
        "step": 189935,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x00001C",
        "de": "0x000091",
        "sp": "0xD1A3BC",
        "stack0": "0x00001C",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189844,
        "step": 189936,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x00001B",
        "de": "0x0000E4",
        "sp": "0xD1A3BC",
        "stack0": "0x00001B",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189845,
        "step": 189937,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x00001A",
        "de": "0x0000B6",
        "sp": "0xD1A3BC",
        "stack0": "0x00001A",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189846,
        "step": 189938,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000019",
        "de": "0x0000FA",
        "sp": "0xD1A3BC",
        "stack0": "0x000019",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189847,
        "step": 189939,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000018",
        "de": "0x000053",
        "sp": "0xD1A3BC",
        "stack0": "0x000018",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189848,
        "step": 189940,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000017",
        "de": "0x000038",
        "sp": "0xD1A3BC",
        "stack0": "0x000017",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189849,
        "step": 189941,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000016",
        "de": "0x00003C",
        "sp": "0xD1A3BC",
        "stack0": "0x000016",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189850,
        "step": 189942,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000015",
        "de": "0x00001F",
        "sp": "0xD1A3BC",
        "stack0": "0x000015",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189851,
        "step": 189943,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000014",
        "de": "0x000001",
        "sp": "0xD1A3BC",
        "stack0": "0x000014",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189852,
        "step": 189944,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000013",
        "de": "0x000023",
        "sp": "0xD1A3BC",
        "stack0": "0x000013",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189853,
        "step": 189945,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000012",
        "de": "0x000038",
        "sp": "0xD1A3BC",
        "stack0": "0x000012",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189854,
        "step": 189946,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000011",
        "de": "0x000043",
        "sp": "0xD1A3BC",
        "stack0": "0x000011",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189855,
        "step": 189947,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000010",
        "de": "0x0000DF",
        "sp": "0xD1A3BC",
        "stack0": "0x000010",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189856,
        "step": 189948,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x00000F",
        "de": "0x00001C",
        "sp": "0xD1A3BC",
        "stack0": "0x00000F",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189857,
        "step": 189949,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x00000E",
        "de": "0x0000F3",
        "sp": "0xD1A3BC",
        "stack0": "0x00000E",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189858,
        "step": 189950,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x00000D",
        "de": "0x0000C5",
        "sp": "0xD1A3BC",
        "stack0": "0x00000D",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189859,
        "step": 189951,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x00000C",
        "de": "0x000003",
        "sp": "0xD1A3BC",
        "stack0": "0x00000C",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189860,
        "step": 189952,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x00000B",
        "de": "0x000075",
        "sp": "0xD1A3BC",
        "stack0": "0x00000B",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189861,
        "step": 189953,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x00000A",
        "de": "0x0000F3",
        "sp": "0xD1A3BC",
        "stack0": "0x00000A",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189862,
        "step": 189954,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000009",
        "de": "0x00003A",
        "sp": "0xD1A3BC",
        "stack0": "0x000009",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189863,
        "step": 189955,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000008",
        "de": "0x0000EF",
        "sp": "0xD1A3BC",
        "stack0": "0x000008",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189864,
        "step": 189956,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000007",
        "de": "0x0000C7",
        "sp": "0xD1A3BC",
        "stack0": "0x000007",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189865,
        "step": 189957,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000006",
        "de": "0x000040",
        "sp": "0xD1A3BC",
        "stack0": "0x000006",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189866,
        "step": 189958,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000005",
        "de": "0x0000E6",
        "sp": "0xD1A3BC",
        "stack0": "0x000005",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189867,
        "step": 189959,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000004",
        "de": "0x0000AB",
        "sp": "0xD1A3BC",
        "stack0": "0x000004",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189868,
        "step": 189960,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000003",
        "de": "0x000038",
        "sp": "0xD1A3BC",
        "stack0": "0x000003",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189869,
        "step": 189961,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000002",
        "de": "0x00002E",
        "sp": "0xD1A3BC",
        "stack0": "0x000002",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189870,
        "step": 189962,
        "pc": "0x000BFE",
        "prevPc": "0x000BFE",
        "bc": "0x000000",
        "hl": "0x000001",
        "de": "0x0000AB",
        "sp": "0xD1A3BC",
        "stack0": "0x000001",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189871,
        "step": 189963,
        "pc": "0x000C4A",
        "prevPc": "0x000BFE",
        "bc": "0xFFFFFF",
        "hl": "0x000000",
        "de": "0x0000AB",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189872,
        "step": 189964,
        "pc": "0x000C80",
        "prevPc": "0x000C4A",
        "bc": "0xD1A487",
        "hl": "0x000000",
        "de": "0xFFFFFF",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189873,
        "step": 189965,
        "pc": "0x000B37",
        "prevPc": "0x000C80",
        "bc": "0xD1A487",
        "hl": "0x000009",
        "de": "0xFFFFFF",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189874,
        "step": 189966,
        "pc": "0x000B60",
        "prevPc": "0x000B37",
        "bc": "0x000089",
        "hl": "0xD1A3FB",
        "de": "0xFFFFFF",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189875,
        "step": 189967,
        "pc": "0x000B7C",
        "prevPc": "0x000B60",
        "bc": "0x0010C6",
        "hl": "0xFFFF16",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189876,
        "step": 189968,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x0010C6",
        "hl": "0x000000",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189877,
        "step": 189969,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000FC6",
        "hl": "0x000000",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189878,
        "step": 189970,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000F8C",
        "hl": "0xFFFF17",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189879,
        "step": 189971,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000F8C",
        "hl": "0x000001",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189880,
        "step": 189972,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000E8C",
        "hl": "0x000001",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189881,
        "step": 189973,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000E18",
        "hl": "0xFFFF19",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189882,
        "step": 189974,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000E18",
        "hl": "0x000003",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189883,
        "step": 189975,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000D18",
        "hl": "0x000003",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189884,
        "step": 189976,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000D30",
        "hl": "0xFFFF1C",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189885,
        "step": 189977,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000D30",
        "hl": "0x000006",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189886,
        "step": 189978,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000C30",
        "hl": "0x000006",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189887,
        "step": 189979,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000C60",
        "hl": "0xFFFF23",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189888,
        "step": 189980,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000C60",
        "hl": "0x00000D",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189889,
        "step": 189981,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000B60",
        "hl": "0x00000D",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189890,
        "step": 189982,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000BC0",
        "hl": "0xFFFF31",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189891,
        "step": 189983,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000BC0",
        "hl": "0x00001B",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189892,
        "step": 189984,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000AC0",
        "hl": "0x00001B",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189893,
        "step": 189985,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000A80",
        "hl": "0xFFFF4C",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189894,
        "step": 189986,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000A80",
        "hl": "0x000036",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189895,
        "step": 189987,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000980",
        "hl": "0x000036",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189896,
        "step": 189988,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000900",
        "hl": "0xFFFF82",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189897,
        "step": 189989,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000900",
        "hl": "0x00006C",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189898,
        "step": 189990,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000800",
        "hl": "0x00006C",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189899,
        "step": 189991,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000800",
        "hl": "0xFFFFEE",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189900,
        "step": 189992,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000800",
        "hl": "0x0000D8",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189901,
        "step": 189993,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000700",
        "hl": "0x0000D8",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189902,
        "step": 189994,
        "pc": "0x000B7F",
        "prevPc": "0x000B72",
        "bc": "0x000700",
        "hl": "0x0000C7",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189903,
        "step": 189995,
        "pc": "0x000B72",
        "prevPc": "0x000B7F",
        "bc": "0x000601",
        "hl": "0x0000C7",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189904,
        "step": 189996,
        "pc": "0x000B7F",
        "prevPc": "0x000B72",
        "bc": "0x000602",
        "hl": "0x0000A5",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189905,
        "step": 189997,
        "pc": "0x000B72",
        "prevPc": "0x000B7F",
        "bc": "0x000503",
        "hl": "0x0000A5",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189906,
        "step": 189998,
        "pc": "0x000B7F",
        "prevPc": "0x000B72",
        "bc": "0x000506",
        "hl": "0x000060",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00"
      },
      {
        "block": 189907,
        "step": 189999,
        "pc": "0x000B72",
        "prevPc": "0x000B7F",
        "bc": "0x000407",
        "hl": "0x000060",
        "de": "0x0000EA",
        "sp": "0xD1A3BC",
        "stack0": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0058C": "0x00",
        "D0058D": "0x00",
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
            "after": "0x000009"
          },
          "D0058C": {
            "before": "0x000000",
            "after": "0x000005"
          },
          "D0058D": {
            "before": "0x000000",
            "after": "0x000005"
          },
          "D0058E": {
            "before": "0x000000",
            "after": "0x000005"
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
        "block": 141,
        "pc": "0x03FA04",
        "prevPc": "0x03F9FA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00587": {
            "before": "0x000009",
            "after": "0x000029"
          }
        }
      },
      {
        "block": 142,
        "pc": "0x03F9D5",
        "prevPc": "0x03FA04",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0058D": {
            "before": "0x000005",
            "after": "0x000029"
          }
        }
      },
      {
        "block": 144,
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
        "block": 1146,
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
        "block": 16570,
        "pc": "0x04C973",
        "prevPc": "0x05E851",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0243A": {
            "before": "0xD1A8CC",
            "after": "0xD1A8A3"
          }
        }
      },
      {
        "block": 17722,
        "pc": "0x02FCB3",
        "prevPc": "0x08C359",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0058C": {
            "before": "0x000005",
            "after": "0x000000"
          },
          "D0058E": {
            "before": "0x000005",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 18318,
        "pc": "0x000038",
        "prevPc": "0x03FA09",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00587": {
            "before": "0x000029",
            "after": "0x000000"
          },
          "D00080": {
            "before": "0x000018",
            "after": "0x000010"
          }
        }
      },
      {
        "block": 18572,
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
        "block": 21739,
        "pc": "0x0018F8",
        "prevPc": "0x001879",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D007CA": {
            "before": "0x0585E9",
            "after": "0x000000"
          },
          "D008E0": {
            "before": "0xD1A863",
            "after": "0x000000"
          },
          "D0243A": {
            "before": "0xD1A8A3",
            "after": "0x000000"
          },
          "D0243D": {
            "before": "0xD2A83E",
            "after": "0x000000"
          },
          "D02590": {
            "before": "0xD3FE81",
            "after": "0x000000"
          },
          "D0058D": {
            "before": "0x000029",
            "after": "0x000000"
          },
          "D02A40": {
            "before": "0xD2A83E",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 23510,
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
        "block": 23596,
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
        "block": 23682,
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
        "block": 23768,
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
        "block": 23854,
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
        "block": 23940,
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
        "block": 24026,
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
        "block": 24112,
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
        "block": 24198,
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
        "block": 24284,
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
        "block": 24370,
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
        "block": 24456,
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
        "block": 24542,
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
        "block": 24628,
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
        "block": 24631,
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
        "block": 24716,
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
        "block": 24803,
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
        "block": 24890,
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
        "block": 24977,
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
        "block": 25064,
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
        "block": 25151,
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
        "block": 25238,
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
        "block": 25325,
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
        "block": 25412,
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
        "block": 25499,
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
        "block": 25586,
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
        "block": 25673,
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
        "block": 25760,
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
        "block": 25847,
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
        "block": 25934,
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
        "block": 26021,
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
        "block": 26108,
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
        "block": 26114,
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
        "block": 26199,
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
        "block": 26205,
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
        "block": 26290,
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
        "block": 26377,
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
        "block": 26464,
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
        "block": 26551,
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
        "block": 26638,
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
        "block": 26725,
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
        "block": 26812,
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
        "block": 26899,
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
        "block": 26986,
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
        "block": 27073,
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
        "block": 27160,
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
        "block": 27247,
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
        "block": 27334,
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
        "block": 27421,
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
        "block": 27508,
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
        "block": 27595,
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
        "block": 27682,
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
        "block": 27769,
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
        "block": 27856,
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
        "block": 27943,
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
        "block": 28030,
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
        "block": 28117,
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
        "block": 28205,
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
        "block": 28293,
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
        "block": 28299,
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
        "block": 28384,
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
        "block": 28471,
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
        "block": 28558,
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
        "block": 28645,
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
        "block": 28732,
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
        "block": 28819,
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
        "block": 28906,
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
        "block": 28993,
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
        "block": 29080,
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
        "block": 29167,
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
        "block": 29254,
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
        "block": 29341,
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
        "block": 29428,
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
        "block": 29515,
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
        "block": 29602,
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
        "block": 29689,
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
        "block": 29776,
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
        "block": 29863,
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
        "block": 29950,
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
        "block": 29956,
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
        "block": 30041,
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
        "block": 30128,
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
        "block": 30215,
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
        "block": 30302,
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
        "block": 30389,
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
        "block": 30476,
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
        "block": 30563,
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
        "block": 30650,
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
        "block": 30737,
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
        "block": 30824,
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
        "block": 30857,
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
        "block": 30940,
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
        "block": 30982,
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
        "block": 31065,
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
        "block": 111723,
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
        "block": 111806,
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
        "block": 111853,
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
        "block": 111936,
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


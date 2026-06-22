# Phase 769 Browser KeyE Corruption Trace

Probe: `probe-phase769-browser-keye-corruption-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase769-browser-keye-corruption-trace.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyE`, and records the route plus first cx/VAT/cursor/key-state corruption evidence.

The in-memory harness caps only `KeyE` at 190000 steps so the trace completes under the 180s watchdog. The shell file on disk is not patched.

No disk browser/runtime/transpiler behavior is patched by this probe.

## Result

- KeyE ends with termination=max_steps, lastPc=0x005B4B, classified as CLEAR-adjacent 0x0A2A37 space-fill bridge followed by cleanup/wipe 0x001879 -> 0x0018F8; first critical zero at 0x0018F8 after 0x001879; first D007CA divergence at 0x0018F8 after 0x001879; hot tail 0x000A92x32512, 0x000BFEx32258, 0x0021C2x10094, 0x006D5Dx10088, 0x006D64x10088.
- Final key state: termination=max_steps, steps=190000, lastPc=0x005B4B, final cpu.pc=0x005B16.
- Base before key: D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, lastPc=0x08C331, VRAM=8549.
- First critical zero: observed-before-block at block 13143, pc=0x0018F8, prev=0x001879.
- First 0x202020 signal: none.
- First D007CA divergence: observed-before-block at block 13143, pc=0x0018F8, prev=0x001879, expected=0x0585E9, saw=0x000000.
- First D0243A change: observed-before-block at block 2778, pc=0x05E372, prev=0x05E348, expected=0xD1A8CC, saw=0xD1A8CD.
- Owner-class target hits: vectorOwner08c782=0, vectorRestore06c764=0, clearOwner0a229d=0, clearTail0a22a4=0, spaceFillBridge0a2a37=12, cleanup001879=1, cleanupTail0018f8=1.
- Candidate stop: `0x001879` before the wipe tail. At that block the core fields are still live: D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CE, D0243D=0xD2A83E, D02590=0xD3FE81.
- Wipe tail evidence: the next tracked block `0x0018F8` has D007CA=0x000000, D008E0=0x000000, D0243A=0x000000, D0243D=0x000000, D02590=0x000000.
- Candidate restore scope: vector-owner hits are 0, so no context-vector restore is indicated by this trace. D0243A already changes before cleanup (first 0xD1A8CC->0xD1A8CD at 0x05E372 after 0x05E348); the next A/B should test KeyE pre-stop-only before restoring cursor or context fields.
- CDP/page errors: 0.

## Hot Blocks

| PC | Hits |
|---|---:|
| 0x000A92 | 32512 |
| 0x000BFE | 32258 |
| 0x0021C2 | 10094 |
| 0x006D5D | 10088 |
| 0x006D64 | 10088 |
| 0x006CDF | 10083 |
| 0x006D0F | 10083 |
| 0x006D38 | 10080 |
| 0x006D4F | 10080 |
| 0x006CF7 | 10078 |
| 0x000B72 | 3855 |
| 0x000B7C | 3085 |
| 0x000B81 | 3085 |
| 0x005AE8 | 2641 |
| 0x005B16 | 2641 |
| 0x005B4B | 2640 |
| 0x005AB6 | 2475 |
| 0x000B7F | 1027 |
| 0x0A19A4 | 752 |
| 0x0A18C4 | 400 |
| 0x000AC5 | 384 |
| 0x000AEE | 381 |
| 0x000A79 | 381 |
| 0x0A1A83 | 352 |
| 0x000BCB | 259 |
| 0x000C80 | 258 |
| 0x000B60 | 257 |
| 0x000B83 | 257 |
| 0x000B37 | 256 |
| 0x0060B3 | 255 |
| 0x001377 | 254 |
| 0x000BD3 | 254 |
| 0x000C4A | 254 |
| 0x001CA6 | 252 |
| 0x003D28 | 252 |

## Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|---|
| reset000000 | 1 | 12573 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x000000 |
| rst000038 | 38 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x05C67C |
| low000a92 | 32512 | 103957 | 0x000A92 | 0x000A72 | 0x000000 | 0x0000E2 | 0xD1A3FD | 0xD1A3BC | 0x000000 |
| low000b7c | 3085 | 103896 | 0x000B7C | 0x000B60 | 0x00105C | 0xFFFF16 | 0x0000EA | 0xD1A3BC | 0x000000 |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 13142 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0013E8 |
| cleanupTail0018f8 | 1 | 13143 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FEFF | 0xD3FF00 | 0xD1A87B | 0x0013E8 |
| sentinel001c33 | 215 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 |
| sentinel0158bc | 2 | 12938 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0158EC |
| postInsertGate0158de | 2 | 12936 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0013DA |
| cursorOwner05e348 | 2 | 2777 | 0x05E348 | 0x05E31D | 0x008400 | 0xD1A8CC | 0x0000F0 | 0xD1A845 | 0x002A6A |
| cursorNext05e372 | 2 | 2778 | 0x05E372 | 0x05E348 | 0x008400 | 0xD1A8CD | 0x0000F0 | 0xD1A842 | 0x05E352 |
| eolOwner0a229d | 0 | - | - | - | - | - | - | - | - |
| eolTail0a22a4 | 0 | - | - | - | - | - | - | - | - |
| spaceFillBridge0a2a37 | 12 | 582 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 2 | 2379 | 0x08C72F | 0x08C536 | 0x008400 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x08C53A |
| cxJpTrampoline08c745 | 2 | 2386 | 0x08C745 | 0x08C734 | 0x008400 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x08C73D |
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
| 189907 | 189944 | 0x005B16 | 0x005AE8 | 0xFF05C0 | 0xD538B4 | 0x0000FF | 0xD1A84B | 0xFF0805 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189908 | 189945 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD538BE | 0x0000FF | 0xD1A84B | 0xFF0805 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189909 | 189946 | 0x005AB6 | 0x005B4B | 0xFF0705 | 0xD005A0 | 0x0000FF | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189910 | 189947 | 0x005AE8 | 0x005AB6 | 0xFF0705 | 0xD53B34 | 0xD40000 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189911 | 189948 | 0x005B16 | 0x005AE8 | 0xFF05C0 | 0xD53B34 | 0x0000FF | 0xD1A84B | 0xFF0705 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189912 | 189949 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD53B3E | 0x0000FF | 0xD1A84B | 0xFF0705 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189913 | 189950 | 0x005AB6 | 0x005B4B | 0xFF0605 | 0xD005A0 | 0x0000FF | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189914 | 189951 | 0x005AE8 | 0x005AB6 | 0xFF0605 | 0xD53DB4 | 0xD40000 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189915 | 189952 | 0x005B16 | 0x005AE8 | 0xFF05C0 | 0xD53DB4 | 0x0000FF | 0xD1A84B | 0xFF0605 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189916 | 189953 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD53DBE | 0x0000FF | 0xD1A84B | 0xFF0605 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189917 | 189954 | 0x005AB6 | 0x005B4B | 0xFF0505 | 0xD005A0 | 0x0000FF | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189918 | 189955 | 0x005AE8 | 0x005AB6 | 0xFF0505 | 0xD54034 | 0xD40000 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189919 | 189956 | 0x005B16 | 0x005AE8 | 0xFF05C0 | 0xD54034 | 0x0000FF | 0xD1A84B | 0xFF0505 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189920 | 189957 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD5403E | 0x0000FF | 0xD1A84B | 0xFF0505 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189921 | 189958 | 0x005AB6 | 0x005B4B | 0xFF0405 | 0xD005A0 | 0x0000FF | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189922 | 189959 | 0x005AE8 | 0x005AB6 | 0xFF0405 | 0xD542B4 | 0xD40000 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189923 | 189960 | 0x005B16 | 0x005AE8 | 0xFF05C0 | 0xD542B4 | 0x0000FF | 0xD1A84B | 0xFF0405 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189924 | 189961 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD542BE | 0x0000FF | 0xD1A84B | 0xFF0405 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189925 | 189962 | 0x005AB6 | 0x005B4B | 0xFF0305 | 0xD005A0 | 0x0000FF | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189926 | 189963 | 0x005AE8 | 0x005AB6 | 0xFF0305 | 0xD54534 | 0xD40000 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189927 | 189964 | 0x005B16 | 0x005AE8 | 0xFF05E0 | 0xD54534 | 0x0000FF | 0xD1A84B | 0xFF0305 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189928 | 189965 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD5453E | 0x0000FF | 0xD1A84B | 0xFF0305 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189929 | 189966 | 0x005AB6 | 0x005B4B | 0xFF0205 | 0xD005A0 | 0x0000FF | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189930 | 189967 | 0x005AE8 | 0x005AB6 | 0xFF0205 | 0xD547B4 | 0xD40000 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189931 | 189968 | 0x005B16 | 0x005AE8 | 0xFF0578 | 0xD547B4 | 0x0000FF | 0xD1A84B | 0xFF0205 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189932 | 189969 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD547BE | 0x0000FF | 0xD1A84B | 0xFF0205 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189933 | 189970 | 0x005AB6 | 0x005B4B | 0xFF0105 | 0xD005A0 | 0x0000FF | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189934 | 189971 | 0x005AE8 | 0x005AB6 | 0xFF0105 | 0xD54A34 | 0xD40000 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189935 | 189972 | 0x005B16 | 0x005AE8 | 0xFF0538 | 0xD54A34 | 0x0000FF | 0xD1A84B | 0xFF0105 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189936 | 189973 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD54A3E | 0x0000FF | 0xD1A84B | 0xFF0105 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189937 | 189974 | 0x005B92 | 0x005B4B | 0xFF0005 | 0xD005A0 | 0x0000FF | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189938 | 189975 | 0x005A19 | 0x005B92 | 0xFF0005 | 0xD005A0 | 0x0000FF | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189939 | 189976 | 0x0059DA | 0x005A19 | 0x000A00 | 0x013E0E | 0x000004 | 0xD1A860 | 0x013E0E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189940 | 189977 | 0x0059E6 | 0x0059DA | 0x000A00 | 0xD00596 | 0x000004 | 0xD1A860 | 0x013E0E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189941 | 189978 | 0x0059F7 | 0x0059E6 | 0x000A00 | 0x013E0E | 0x000004 | 0xD1A869 | 0x000045 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189942 | 189979 | 0x0059ED | 0x0059F7 | 0x000A00 | 0x013E0E | 0x000004 | 0xD1A869 | 0x000045 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189943 | 189980 | 0x0059F3 | 0x0059ED | 0x000A00 | 0x013E0F | 0x000004 | 0xD1A869 | 0x000045 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189944 | 189981 | 0x0059C6 | 0x0059F3 | 0x000A00 | 0x013E0F | 0x000004 | 0xD1A866 | 0x0059F7 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189945 | 189982 | 0x0059D6 | 0x0059C6 | 0x000A00 | 0x013E0F | 0x000004 | 0xD1A860 | 0x013E0F | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189946 | 189983 | 0x005A75 | 0x0059D6 | 0x000A00 | 0x013E0F | 0x000004 | 0xD1A85D | 0x0059DA | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189947 | 189984 | 0x005A82 | 0x005A75 | 0x000A00 | 0x013E0F | 0x000004 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189948 | 189985 | 0x00596E | 0x005A82 | 0x000A00 | 0x000AD4 | 0x000004 | 0xD1A84B | 0x005A8B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189949 | 189986 | 0x001713 | 0x00596E | 0x000A00 | 0x000AD4 | 0x000004 | 0xD1A842 | 0x005974 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189950 | 189987 | 0x0008BB | 0x001713 | 0x000A00 | 0x000AD4 | 0x000004 | 0xD1A83F | 0x001717 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189951 | 189988 | 0x001717 | 0x0008BB | 0x00A55A | 0x000000 | 0x000004 | 0xD1A842 | 0x005974 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189952 | 189989 | 0x001718 | 0x001717 | 0x00A55A | 0x000000 | 0x000004 | 0xD1A842 | 0x005974 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189953 | 189990 | 0x005974 | 0x001718 | 0x00A55A | 0x000000 | 0x000004 | 0xD1A845 | 0x000AD4 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189954 | 189991 | 0x005998 | 0x005974 | 0x00A55A | 0x000AD4 | 0x000004 | 0xD1A848 | 0x00633B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189955 | 189992 | 0x005A8B | 0x005998 | 0xFFFFFC | 0xD005A1 | 0xD005C5 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189956 | 189993 | 0x005A48 | 0x005A8B | 0xFFFFFC | 0xD005A1 | 0xD005C5 | 0xD1A84B | 0x005A96 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189957 | 189994 | 0x005A96 | 0x005A48 | 0xFFFFFC | 0xD005A1 | 0xD005C5 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189958 | 189995 | 0x005A53 | 0x005A96 | 0xFFFFFC | 0xD005A1 | 0xD005C5 | 0xD1A84B | 0x005AA2 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189959 | 189996 | 0x005AA2 | 0x005A53 | 0xFFFFFC | 0x000026 | 0xD005C5 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189960 | 189997 | 0x005AAE | 0x005AA2 | 0xFFFFFC | 0x000026 | 0xD0050C | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189961 | 189998 | 0x005AE8 | 0x005AAE | 0xFF10FC | 0xD524CC | 0xD40000 | 0xD1A84E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189962 | 189999 | 0x005B16 | 0x005AE8 | 0xFF0500 | 0xD524CC | 0x0000FF | 0xD1A84B | 0xFF1005 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |

## Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x000084; D0058D:0x000000->0x000084; D0058E:0x000000->0x000084 |
| 147 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000084->0x00002E |
| 2778 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CC->0xD1A8CD |
| 4947 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000084->0x000000; D0058E:0x000084->0x000000 |
| 6156 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x0000B6 |
| 7788 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CD->0xD1A8CE |
| 9956 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x0000B6->0x000000 |
| 13143 | 0x0018F8 | 0x001879 | entry-vs-previous-block | D007CA:0x0585E9->0x000000; D008E0:0xD1A863->0x000000; D0243A:0xD1A8CE->0x000000; D0243D:0xD2A83E->0x000000; D02590:0xD3FE81->0x000000; D0058D:0x00002E->0x000000 |

## Compact Evidence

```json
{
  "finding": "KeyE ends with termination=max_steps, lastPc=0x005B4B, classified as CLEAR-adjacent 0x0A2A37 space-fill bridge followed by cleanup/wipe 0x001879 -> 0x0018F8; first critical zero at 0x0018F8 after 0x001879; first D007CA divergence at 0x0018F8 after 0x001879; hot tail 0x000A92x32512, 0x000BFEx32258, 0x0021C2x10094, 0x006D5Dx10088, 0x006D64x10088.",
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
    "status": "Key: ^ → 190000 steps (max_steps, peak 8754px)",
    "lastPc": "0x005B4B",
    "cpu": {
      "pc": "0x005B16",
      "sp": "0xD1A84B",
      "af": "0x00007C",
      "bc": "0xFF0500",
      "de": "0x0000FF",
      "hl": "0xD524D6",
      "ix": "0xD005A3",
      "iy": "0xD00080",
      "f": "0x7C",
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
      "D00596": "0x03"
    },
    "lastKey": {
      "code": "KeyE",
      "label": "^",
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
        240,
        12,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 8754,
      "vramCurrent": 2632
    },
    "stackTop": [
      {
        "addr": "0xD1A84B",
        "value": "0xFF1005"
      },
      {
        "addr": "0xD1A84E",
        "value": "0x000000"
      },
      {
        "addr": "0xD1A851",
        "value": "0x013E0F"
      },
      {
        "addr": "0xD1A854",
        "value": "0x000004"
      },
      {
        "addr": "0xD1A857",
        "value": "0x000A00"
      },
      {
        "addr": "0xD1A85A",
        "value": "0x00639F"
      },
      {
        "addr": "0xD1A85D",
        "value": "0x0059DA"
      },
      {
        "addr": "0xD1A860",
        "value": "0x013E0F"
      }
    ]
  },
  "record": {
    "totalBlocks": 189962,
    "regionCounts": {
      "low000000_006fff": 182030,
      "cleanup001000_001fff": 3860,
      "display09e000_0a2fff": 5050,
      "token08f000_090fff": 0,
      "near0a2100_0a23ff": 24
    },
    "targetCounts": {
      "reset000000": 1,
      "rst000038": 38,
      "low000a92": 32512,
      "low000b7c": 3085,
      "cleanup001879": 1,
      "cleanupTail0018f8": 1,
      "sentinel001c33": 215,
      "sentinel0158bc": 2,
      "postInsertGate0158de": 2,
      "cursorOwner05e348": 2,
      "cursorNext05e372": 2,
      "spaceFillBridge0a2a37": 12,
      "cxDispatchWrapper08c72f": 2,
      "cxJpTrampoline08c745": 2
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
          "D00587": "0x0E",
          "D0058C": "0x84",
          "D0058D": "0x84",
          "D0058E": "0x84",
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
          "D00587": "0x0E",
          "D0058C": "0x84",
          "D0058D": "0x84",
          "D0058E": "0x84",
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
        "block": 582,
        "step": 584,
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
          "stepCount": 584
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x2E",
          "D0058C": "0x84",
          "D0058D": "0x2E",
          "D0058E": "0x84",
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
        "block": 2379,
        "step": 2384,
        "pc": "0x08C72F",
        "prevPc": "0x08C536",
        "cpu": {
          "pc": "0x08C72F",
          "sp": "0xD1A85D",
          "af": "0x00841E",
          "bc": "0x008400",
          "de": "0xD2A815",
          "hl": "0x00FFFF",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x1E",
          "stepCount": 2384
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x2E",
          "D0058C": "0x84",
          "D0058D": "0x2E",
          "D0058E": "0x84",
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
            "value": "0x00841E"
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
        "block": 2386,
        "step": 2391,
        "pc": "0x08C745",
        "prevPc": "0x08C734",
        "cpu": {
          "pc": "0x08C745",
          "sp": "0xD1A854",
          "af": "0x00849B",
          "bc": "0x008400",
          "de": "0xD2A815",
          "hl": "0x0585E9",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x9B",
          "stepCount": 2391
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x2E",
          "D0058C": "0x84",
          "D0058D": "0x2E",
          "D0058E": "0x84",
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
            "value": "0x008484"
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
            "value": "0x00841E"
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
      "cursorOwner05e348": {
        "expected": "-",
        "block": 2777,
        "step": 2784,
        "pc": "0x05E348",
        "prevPc": "0x05E31D",
        "cpu": {
          "pc": "0x05E348",
          "sp": "0xD1A845",
          "af": "0x000044",
          "bc": "0x008400",
          "de": "0x0000F0",
          "hl": "0xD1A8CC",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x44",
          "stepCount": 2784
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x2E",
          "D0058C": "0x84",
          "D0058D": "0x2E",
          "D0058E": "0x84",
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
            "addr": "0xD1A845",
            "value": "0x002A6A"
          },
          {
            "addr": "0xD1A848",
            "value": "0x05E654"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0000F0"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x002A6A"
          },
          {
            "addr": "0xD1A851",
            "value": "0x058B18"
          },
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x008484"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x00FFFF"
          }
        ],
        "vram": 8585
      },
      "cursorNext05e372": {
        "expected": "-",
        "block": 2778,
        "step": 2785,
        "pc": "0x05E372",
        "prevPc": "0x05E348",
        "cpu": {
          "pc": "0x05E372",
          "sp": "0xD1A842",
          "af": "0x000044",
          "bc": "0x008400",
          "de": "0x0000F0",
          "hl": "0xD1A8CD",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x44",
          "stepCount": 2785
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x2E",
          "D0058C": "0x84",
          "D0058D": "0x2E",
          "D0058E": "0x84",
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
            "addr": "0xD1A842",
            "value": "0x05E352"
          },
          {
            "addr": "0xD1A845",
            "value": "0x002A6A"
          },
          {
            "addr": "0xD1A848",
            "value": "0x05E654"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0000F0"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x002A6A"
          },
          {
            "addr": "0xD1A851",
            "value": "0x058B18"
          },
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x008484"
          }
        ],
        "vram": 8585
      },
      "reset000000": {
        "expected": "-",
        "block": 12573,
        "step": 12610,
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
          "stepCount": 12610
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2E",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x02"
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
        "vram": 8754
      },
      "postInsertGate0158de": {
        "expected": "-",
        "block": 12936,
        "step": 12973,
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
          "stepCount": 12973
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2E",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x02"
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
        "vram": 8754
      },
      "sentinel0158bc": {
        "expected": "-",
        "block": 12938,
        "step": 12975,
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
          "stepCount": 12975
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2E",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x02"
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
        "vram": 8754
      },
      "cleanup001879": {
        "expected": "-",
        "block": 13142,
        "step": 13179,
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
          "stepCount": 13179
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2E",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x02"
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
        "vram": 8754
      },
      "cleanupTail0018f8": {
        "expected": "-",
        "block": 13143,
        "step": 13180,
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
          "stepCount": 13180
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
        "vram": 8754
      },
      "low000b7c": {
        "expected": "-",
        "block": 103896,
        "step": 103933,
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
          "stepCount": 103933
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
        "block": 103957,
        "step": 103994,
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
          "stepCount": 103994
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
        "block": 13143,
        "step": 13180,
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
          "stepCount": 13180
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
        "vram": 8754
      }
    },
    "first202020": null,
    "firstBadD007CA": {
      "source": "observed-before-block",
      "expected": "0x0585E9",
      "snapshot": {
        "expected": "-",
        "block": 13143,
        "step": 13180,
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
          "stepCount": 13180
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
        "vram": 8754
      }
    },
    "firstD0243AChange": {
      "source": "observed-before-block",
      "expected": "0xD1A8CC",
      "snapshot": {
        "expected": "-",
        "block": 2778,
        "step": 2785,
        "pc": "0x05E372",
        "prevPc": "0x05E348",
        "cpu": {
          "pc": "0x05E372",
          "sp": "0xD1A842",
          "af": "0x000044",
          "bc": "0x008400",
          "de": "0x0000F0",
          "hl": "0xD1A8CD",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x44",
          "stepCount": 2785
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x2E",
          "D0058C": "0x84",
          "D0058D": "0x2E",
          "D0058E": "0x84",
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
            "addr": "0xD1A842",
            "value": "0x05E352"
          },
          {
            "addr": "0xD1A845",
            "value": "0x002A6A"
          },
          {
            "addr": "0xD1A848",
            "value": "0x05E654"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0000F0"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x002A6A"
          },
          {
            "addr": "0xD1A851",
            "value": "0x058B18"
          },
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x008484"
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
        "count": 32258
      },
      {
        "pc": "0x0021C2",
        "count": 10094
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
        "count": 3855
      },
      {
        "pc": "0x000B7C",
        "count": 3085
      },
      {
        "pc": "0x000B81",
        "count": 3085
      },
      {
        "pc": "0x005AE8",
        "count": 2641
      },
      {
        "pc": "0x005B16",
        "count": 2641
      },
      {
        "pc": "0x005B4B",
        "count": 2640
      },
      {
        "pc": "0x005AB6",
        "count": 2475
      },
      {
        "pc": "0x000B7F",
        "count": 1027
      },
      {
        "pc": "0x0A19A4",
        "count": 752
      },
      {
        "pc": "0x0A18C4",
        "count": 400
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
        "pc": "0x0A1A83",
        "count": 352
      },
      {
        "pc": "0x000BCB",
        "count": 259
      },
      {
        "pc": "0x000C80",
        "count": 258
      },
      {
        "pc": "0x000B60",
        "count": 257
      },
      {
        "pc": "0x000B83",
        "count": 257
      },
      {
        "pc": "0x000B37",
        "count": 256
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
        "pc": "0x000BD3",
        "count": 254
      },
      {
        "pc": "0x000C4A",
        "count": 254
      },
      {
        "pc": "0x001CA6",
        "count": 252
      },
      {
        "pc": "0x003D28",
        "count": 252
      },
      {
        "pc": "0x003D25",
        "count": 252
      },
      {
        "pc": "0x000ACE",
        "count": 250
      },
      {
        "pc": "0x001CC0",
        "count": 240
      },
      {
        "pc": "0x001CCA",
        "count": 239
      },
      {
        "pc": "0x001C33",
        "count": 215
      },
      {
        "pc": "0x001C38",
        "count": 213
      },
      {
        "pc": "0x0008BB",
        "count": 205
      },
      {
        "pc": "0x001713",
        "count": 204
      },
      {
        "pc": "0x001717",
        "count": 204
      },
      {
        "pc": "0x001718",
        "count": 204
      },
      {
        "pc": "0x001C3C",
        "count": 202
      },
      {
        "pc": "0x001CE4",
        "count": 198
      },
      {
        "pc": "0x003D40",
        "count": 175
      },
      {
        "pc": "0x005A53",
        "count": 175
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
        "pc": "0x001C7D",
        "count": 170
      },
      {
        "pc": "0x001C81",
        "count": 170
      },
      {
        "pc": "0x001C82",
        "count": 170
      },
      {
        "pc": "0x001C44",
        "count": 169
      },
      {
        "pc": "0x001C48",
        "count": 169
      },
      {
        "pc": "0x0A3404",
        "count": 168
      },
      {
        "pc": "0x0059C6",
        "count": 166
      },
      {
        "pc": "0x0059D6",
        "count": 166
      },
      {
        "pc": "0x005A75",
        "count": 166
      },
      {
        "pc": "0x005A82",
        "count": 166
      },
      {
        "pc": "0x00596E",
        "count": 166
      },
      {
        "pc": "0x005974",
        "count": 166
      },
      {
        "pc": "0x005998",
        "count": 166
      },
      {
        "pc": "0x005A8B",
        "count": 166
      },
      {
        "pc": "0x005A48",
        "count": 166
      },
      {
        "pc": "0x005A96",
        "count": 166
      },
      {
        "pc": "0x005AA2",
        "count": 166
      },
      {
        "pc": "0x005AAE",
        "count": 166
      },
      {
        "pc": "0x005B92",
        "count": 165
      },
      {
        "pc": "0x005A19",
        "count": 165
      },
      {
        "pc": "0x0059DA",
        "count": 165
      },
      {
        "pc": "0x0059E6",
        "count": 165
      },
      {
        "pc": "0x0A3408",
        "count": 156
      },
      {
        "pc": "0x0059F3",
        "count": 147
      },
      {
        "pc": "0x0059F7",
        "count": 146
      },
      {
        "pc": "0x0059ED",
        "count": 146
      },
      {
        "pc": "0x0A1854",
        "count": 144
      },
      {
        "pc": "0x0A187C",
        "count": 144
      },
      {
        "pc": "0x0A188A",
        "count": 144
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
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005B92",
      "0x005A19",
      "0x0059DA",
      "0x0059E6",
      "0x0059F7",
      "0x0059ED",
      "0x0059F3",
      "0x0059C6",
      "0x0059D6",
      "0x005A75",
      "0x005A82",
      "0x00596E",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x005974",
      "0x005998",
      "0x005A8B",
      "0x005A48",
      "0x005A96",
      "0x005A53",
      "0x005AA2",
      "0x005AAE",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005B92",
      "0x005A19",
      "0x0059DA",
      "0x0059E6",
      "0x0059F7",
      "0x0059ED",
      "0x0059FE",
      "0x013DB6",
      "0x013DAD",
      "0x0059E9",
      "0x0059F3",
      "0x0059C6",
      "0x0059D6",
      "0x005A75",
      "0x005A82",
      "0x00596E",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x005974",
      "0x005998",
      "0x005A8B",
      "0x005A48",
      "0x005A96",
      "0x005A53",
      "0x005AA2",
      "0x005AAE",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005B92",
      "0x005A19",
      "0x0059DA",
      "0x0059E6",
      "0x0059F7",
      "0x0059ED",
      "0x0059F3",
      "0x0059C6",
      "0x0059D6",
      "0x005A75",
      "0x005A82",
      "0x00596E",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x005974",
      "0x005998",
      "0x005A8B",
      "0x005A48",
      "0x005A96",
      "0x005A53",
      "0x005AA2",
      "0x005AAE",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005B92",
      "0x005A19",
      "0x0059DA",
      "0x0059E6",
      "0x0059F7",
      "0x0059ED",
      "0x0059F3",
      "0x0059C6",
      "0x0059D6",
      "0x005A75",
      "0x005A82",
      "0x00596E",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x005974",
      "0x005998",
      "0x005A8B",
      "0x005A48",
      "0x005A96",
      "0x005A53",
      "0x005AA2",
      "0x005AAE",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005B92",
      "0x005A19",
      "0x0059DA",
      "0x0059E6",
      "0x0059F7",
      "0x0059ED",
      "0x0059F3",
      "0x0059C6",
      "0x0059D6",
      "0x005A75",
      "0x005A82",
      "0x00596E",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x005974",
      "0x005998",
      "0x005A8B",
      "0x005A48",
      "0x005A96",
      "0x005A53",
      "0x005AA2",
      "0x005AAE",
      "0x005AE8",
      "0x005B16"
    ],
    "tailSnapshots": [
      {
        "block": 189883,
        "step": 189920,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0500",
        "hl": "0xD529B4",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0E05",
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
        "step": 189921,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD529BE",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0E05",
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
        "step": 189922,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0D05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "step": 189923,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0D05",
        "hl": "0xD52C34",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "step": 189924,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0500",
        "hl": "0xD52C34",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0D05",
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
        "step": 189925,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD52C3E",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0D05",
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
        "step": 189926,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0C05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "step": 189927,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0C05",
        "hl": "0xD52EB4",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "step": 189928,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0500",
        "hl": "0xD52EB4",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0C05",
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
        "step": 189929,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD52EBE",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0C05",
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
        "step": 189930,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0B05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "step": 189931,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0B05",
        "hl": "0xD53134",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "step": 189932,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0500",
        "hl": "0xD53134",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0B05",
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
        "step": 189933,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD5313E",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0B05",
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
        "step": 189934,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0A05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "step": 189935,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0A05",
        "hl": "0xD533B4",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "step": 189936,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD533B4",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0A05",
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
        "step": 189937,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD533BE",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0A05",
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
        "step": 189938,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0905",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "step": 189939,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0905",
        "hl": "0xD53634",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "step": 189940,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD53634",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0905",
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
        "step": 189941,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD5363E",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0905",
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
        "step": 189942,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0805",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "step": 189943,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0805",
        "hl": "0xD538B4",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "step": 189944,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD538B4",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0805",
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
        "block": 189908,
        "step": 189945,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD538BE",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0805",
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
        "block": 189909,
        "step": 189946,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0705",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "block": 189910,
        "step": 189947,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0705",
        "hl": "0xD53B34",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "block": 189911,
        "step": 189948,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD53B34",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0705",
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
        "block": 189912,
        "step": 189949,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD53B3E",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0705",
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
        "block": 189913,
        "step": 189950,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0605",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "block": 189914,
        "step": 189951,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0605",
        "hl": "0xD53DB4",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "block": 189915,
        "step": 189952,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD53DB4",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0605",
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
        "block": 189916,
        "step": 189953,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD53DBE",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0605",
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
        "block": 189917,
        "step": 189954,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0505",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "block": 189918,
        "step": 189955,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0505",
        "hl": "0xD54034",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "block": 189919,
        "step": 189956,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD54034",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0505",
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
        "block": 189920,
        "step": 189957,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD5403E",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0505",
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
        "block": 189921,
        "step": 189958,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0405",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "block": 189922,
        "step": 189959,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0405",
        "hl": "0xD542B4",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "block": 189923,
        "step": 189960,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD542B4",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0405",
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
        "block": 189924,
        "step": 189961,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD542BE",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0405",
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
        "block": 189925,
        "step": 189962,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0305",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "block": 189926,
        "step": 189963,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0305",
        "hl": "0xD54534",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "block": 189927,
        "step": 189964,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05E0",
        "hl": "0xD54534",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0305",
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
        "block": 189928,
        "step": 189965,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD5453E",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0305",
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
        "block": 189929,
        "step": 189966,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0205",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "block": 189930,
        "step": 189967,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0205",
        "hl": "0xD547B4",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "block": 189931,
        "step": 189968,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0578",
        "hl": "0xD547B4",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0205",
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
        "block": 189932,
        "step": 189969,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD547BE",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0205",
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
        "block": 189933,
        "step": 189970,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0105",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "block": 189934,
        "step": 189971,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0105",
        "hl": "0xD54A34",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "block": 189935,
        "step": 189972,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0538",
        "hl": "0xD54A34",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0105",
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
        "block": 189936,
        "step": 189973,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD54A3E",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF0105",
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
        "block": 189937,
        "step": 189974,
        "pc": "0x005B92",
        "prevPc": "0x005B4B",
        "bc": "0xFF0005",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "block": 189938,
        "step": 189975,
        "pc": "0x005A19",
        "prevPc": "0x005B92",
        "bc": "0xFF0005",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A84E",
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
        "block": 189939,
        "step": 189976,
        "pc": "0x0059DA",
        "prevPc": "0x005A19",
        "bc": "0x000A00",
        "hl": "0x013E0E",
        "de": "0x000004",
        "sp": "0xD1A860",
        "stack0": "0x013E0E",
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
        "block": 189940,
        "step": 189977,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "bc": "0x000A00",
        "hl": "0xD00596",
        "de": "0x000004",
        "sp": "0xD1A860",
        "stack0": "0x013E0E",
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
        "block": 189941,
        "step": 189978,
        "pc": "0x0059F7",
        "prevPc": "0x0059E6",
        "bc": "0x000A00",
        "hl": "0x013E0E",
        "de": "0x000004",
        "sp": "0xD1A869",
        "stack0": "0x000045",
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
        "block": 189942,
        "step": 189979,
        "pc": "0x0059ED",
        "prevPc": "0x0059F7",
        "bc": "0x000A00",
        "hl": "0x013E0E",
        "de": "0x000004",
        "sp": "0xD1A869",
        "stack0": "0x000045",
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
        "block": 189943,
        "step": 189980,
        "pc": "0x0059F3",
        "prevPc": "0x0059ED",
        "bc": "0x000A00",
        "hl": "0x013E0F",
        "de": "0x000004",
        "sp": "0xD1A869",
        "stack0": "0x000045",
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
        "block": 189944,
        "step": 189981,
        "pc": "0x0059C6",
        "prevPc": "0x0059F3",
        "bc": "0x000A00",
        "hl": "0x013E0F",
        "de": "0x000004",
        "sp": "0xD1A866",
        "stack0": "0x0059F7",
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
        "block": 189945,
        "step": 189982,
        "pc": "0x0059D6",
        "prevPc": "0x0059C6",
        "bc": "0x000A00",
        "hl": "0x013E0F",
        "de": "0x000004",
        "sp": "0xD1A860",
        "stack0": "0x013E0F",
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
        "block": 189946,
        "step": 189983,
        "pc": "0x005A75",
        "prevPc": "0x0059D6",
        "bc": "0x000A00",
        "hl": "0x013E0F",
        "de": "0x000004",
        "sp": "0xD1A85D",
        "stack0": "0x0059DA",
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
        "block": 189947,
        "step": 189984,
        "pc": "0x005A82",
        "prevPc": "0x005A75",
        "bc": "0x000A00",
        "hl": "0x013E0F",
        "de": "0x000004",
        "sp": "0xD1A84E",
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
        "block": 189948,
        "step": 189985,
        "pc": "0x00596E",
        "prevPc": "0x005A82",
        "bc": "0x000A00",
        "hl": "0x000AD4",
        "de": "0x000004",
        "sp": "0xD1A84B",
        "stack0": "0x005A8B",
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
        "block": 189949,
        "step": 189986,
        "pc": "0x001713",
        "prevPc": "0x00596E",
        "bc": "0x000A00",
        "hl": "0x000AD4",
        "de": "0x000004",
        "sp": "0xD1A842",
        "stack0": "0x005974",
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
        "block": 189950,
        "step": 189987,
        "pc": "0x0008BB",
        "prevPc": "0x001713",
        "bc": "0x000A00",
        "hl": "0x000AD4",
        "de": "0x000004",
        "sp": "0xD1A83F",
        "stack0": "0x001717",
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
        "block": 189951,
        "step": 189988,
        "pc": "0x001717",
        "prevPc": "0x0008BB",
        "bc": "0x00A55A",
        "hl": "0x000000",
        "de": "0x000004",
        "sp": "0xD1A842",
        "stack0": "0x005974",
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
        "block": 189952,
        "step": 189989,
        "pc": "0x001718",
        "prevPc": "0x001717",
        "bc": "0x00A55A",
        "hl": "0x000000",
        "de": "0x000004",
        "sp": "0xD1A842",
        "stack0": "0x005974",
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
        "block": 189953,
        "step": 189990,
        "pc": "0x005974",
        "prevPc": "0x001718",
        "bc": "0x00A55A",
        "hl": "0x000000",
        "de": "0x000004",
        "sp": "0xD1A845",
        "stack0": "0x000AD4",
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
        "block": 189954,
        "step": 189991,
        "pc": "0x005998",
        "prevPc": "0x005974",
        "bc": "0x00A55A",
        "hl": "0x000AD4",
        "de": "0x000004",
        "sp": "0xD1A848",
        "stack0": "0x00633B",
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
        "block": 189955,
        "step": 189992,
        "pc": "0x005A8B",
        "prevPc": "0x005998",
        "bc": "0xFFFFFC",
        "hl": "0xD005A1",
        "de": "0xD005C5",
        "sp": "0xD1A84E",
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
        "block": 189956,
        "step": 189993,
        "pc": "0x005A48",
        "prevPc": "0x005A8B",
        "bc": "0xFFFFFC",
        "hl": "0xD005A1",
        "de": "0xD005C5",
        "sp": "0xD1A84B",
        "stack0": "0x005A96",
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
        "block": 189957,
        "step": 189994,
        "pc": "0x005A96",
        "prevPc": "0x005A48",
        "bc": "0xFFFFFC",
        "hl": "0xD005A1",
        "de": "0xD005C5",
        "sp": "0xD1A84E",
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
        "block": 189958,
        "step": 189995,
        "pc": "0x005A53",
        "prevPc": "0x005A96",
        "bc": "0xFFFFFC",
        "hl": "0xD005A1",
        "de": "0xD005C5",
        "sp": "0xD1A84B",
        "stack0": "0x005AA2",
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
        "block": 189959,
        "step": 189996,
        "pc": "0x005AA2",
        "prevPc": "0x005A53",
        "bc": "0xFFFFFC",
        "hl": "0x000026",
        "de": "0xD005C5",
        "sp": "0xD1A84E",
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
        "block": 189960,
        "step": 189997,
        "pc": "0x005AAE",
        "prevPc": "0x005AA2",
        "bc": "0xFFFFFC",
        "hl": "0x000026",
        "de": "0xD0050C",
        "sp": "0xD1A84E",
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
        "block": 189961,
        "step": 189998,
        "pc": "0x005AE8",
        "prevPc": "0x005AAE",
        "bc": "0xFF10FC",
        "hl": "0xD524CC",
        "de": "0xD40000",
        "sp": "0xD1A84E",
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
        "block": 189962,
        "step": 189999,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0500",
        "hl": "0xD524CC",
        "de": "0x0000FF",
        "sp": "0xD1A84B",
        "stack0": "0xFF1005",
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
        "block": 19788,
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
        "block": 19875,
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
        "block": 19962,
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
        "block": 20049,
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
        "block": 20136,
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
        "block": 20223,
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
        "block": 20310,
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
        "block": 20397,
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
        "block": 20484,
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
        "block": 20571,
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
        "block": 20658,
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
        "block": 20745,
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
        "block": 20832,
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
        "block": 20919,
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
        "block": 21006,
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
        "block": 21093,
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
        "block": 21180,
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
        "block": 21267,
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
        "block": 21354,
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
        "block": 21360,
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
        "block": 21445,
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
        "block": 21532,
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
        "block": 21619,
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
        "block": 21706,
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
        "block": 21793,
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
        "block": 21880,
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
        "block": 21967,
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
        "block": 22054,
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
        "block": 22141,
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
        "block": 22228,
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
        "block": 22261,
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
        "block": 22344,
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
        "block": 22386,
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
        "block": 22469,
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
        "block": 103127,
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
        "block": 103210,
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
        "block": 103257,
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
        "block": 103340,
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
        "block": 183263,
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
        "block": 183346,
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
        "block": 183394,
        "pc": "0x013D9F",
        "prevPc": "0x005B96",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000004",
            "after": "0x000000"
          },
          "D00596": {
            "before": "0x000013",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 183480,
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
        "block": 183567,
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
        "block": 183654,
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
        "block": 183741,
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
        "block": 183828,
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
        "block": 183915,
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
        "block": 184002,
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
        "block": 184089,
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
        "block": 184176,
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
        "block": 184263,
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
        "block": 184350,
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
        "block": 184437,
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
        "block": 184524,
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
        "block": 184611,
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
        "block": 184698,
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
        "block": 184785,
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
        "block": 184872,
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
        "block": 184959,
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
        "block": 185046,
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
        "block": 185133,
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
        "block": 185220,
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
        "block": 185307,
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
        "block": 185395,
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
        "block": 185483,
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
        "block": 185571,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000018",
            "after": "0x000019"
          }
        }
      },
      {
        "block": 185577,
        "pc": "0x0059E9",
        "prevPc": "0x013DAD",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000000",
            "after": "0x000001"
          },
          "D00596": {
            "before": "0x000019",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 185662,
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
        "block": 185668,
        "pc": "0x0059E9",
        "prevPc": "0x013DAD",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000001",
            "after": "0x000002"
          },
          "D00596": {
            "before": "0x000001",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 185753,
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
        "block": 185840,
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
        "block": 185927,
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
        "block": 186014,
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
        "block": 186101,
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
        "block": 186188,
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
        "block": 186275,
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
        "block": 186362,
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
        "block": 186449,
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
        "block": 186536,
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
        "block": 186623,
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
        "block": 186710,
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
        "block": 186797,
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
        "block": 186884,
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
        "block": 186971,
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
        "block": 187058,
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
        "block": 187145,
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
        "block": 187232,
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
        "block": 187319,
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
        "block": 187406,
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
        "block": 187493,
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
        "block": 187580,
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
        "block": 187668,
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
        "block": 187756,
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
        "block": 187844,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000018",
            "after": "0x000019"
          }
        }
      },
      {
        "block": 187850,
        "pc": "0x0059E9",
        "prevPc": "0x013DAD",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000002",
            "after": "0x000003"
          },
          "D00596": {
            "before": "0x000019",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 187935,
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
        "block": 188022,
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
        "block": 188109,
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
        "block": 188196,
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
        "block": 188283,
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
        "block": 188370,
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
        "block": 188457,
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
        "block": 188544,
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
        "block": 188631,
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
        "block": 188718,
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
        "block": 188805,
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
        "block": 188892,
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
        "block": 188979,
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
        "block": 189066,
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
        "block": 189153,
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
        "block": 189240,
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
        "block": 189327,
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
        "block": 189414,
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
        "block": 189501,
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
        "block": 189588,
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
        "block": 189675,
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
        "block": 189681,
        "pc": "0x0059E9",
        "prevPc": "0x013DAD",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000003",
            "after": "0x000004"
          },
          "D00596": {
            "before": "0x000015",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 189766,
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
        "block": 189853,
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
        "block": 189940,
        "pc": "0x0059E6",
        "prevPc": "0x0059DA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000002",
            "after": "0x000003"
          }
        }
      }
    ]
  },
  "cdpPageErrors": []
}
```


# Phase 762 Browser ArrowRight Corruption Trace

Probe: `probe-phase762-browser-arrowright-corruption-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase762-browser-arrowright-corruption-trace.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowRight`, and records the route plus first cx/VAT/cursor/key-state corruption evidence.

The in-memory harness caps only `ArrowRight` at 160000 steps so the trace completes under the 180s watchdog. The shell file on disk is not patched.

No disk browser/runtime/transpiler behavior is patched by this probe.

## Result

- ArrowRight ends with termination=max_steps, lastPc=0x000A92, classified as CLEAR-adjacent 0x0A2A37 space-fill bridge followed by cleanup/wipe 0x001879 -> 0x0018F8; first critical zero at 0x0018F8 after 0x001879; first D007CA divergence at 0x0018F8 after 0x001879; hot tail 0x09EFDEx35388, 0x0021C2x10092, 0x006D5Dx10088, 0x006D64x10088, 0x006CDFx10083.
- Final key state: termination=max_steps, steps=160000, lastPc=0x000A92, final cpu.pc=0x000A92.
- Base before key: D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, lastPc=0x08C331, VRAM=8549.
- First critical zero: observed-before-block at block 69134, pc=0x0018F8, prev=0x001879.
- First 0x202020 signal: none.
- First D007CA divergence: observed-before-block at block 69134, pc=0x0018F8, prev=0x001879, expected=0x0585E9, saw=0x000000.
- First D0243A change: observed-before-block at block 69134, pc=0x0018F8, prev=0x001879, expected=0xD1A8CC, saw=0x000000.
- Owner-class target hits: vectorOwner08c782=0, vectorRestore06c764=0, clearOwner0a229d=0, clearTail0a22a4=0, spaceFillBridge0a2a37=7, cleanup001879=1, cleanupTail0018f8=1.
- CDP/page errors: 0.

## Hot Blocks

| PC | Hits |
|---|---:|
| 0x09EFDE | 35388 |
| 0x0021C2 | 10092 |
| 0x006D5D | 10088 |
| 0x006D64 | 10088 |
| 0x006CDF | 10083 |
| 0x006D0F | 10083 |
| 0x006D38 | 10080 |
| 0x006D4F | 10080 |
| 0x006CF7 | 10078 |
| 0x0A189E | 1482 |
| 0x0A190D | 1482 |
| 0x0A191F | 1482 |
| 0x0A1969 | 1482 |
| 0x0A1980 | 1482 |
| 0x0A19D7 | 1482 |
| 0x0A1A1D | 1482 |
| 0x0A1854 | 1461 |
| 0x0A187C | 1428 |
| 0x0A1976 | 1428 |
| 0x005AE8 | 1424 |
| 0x005B16 | 1424 |
| 0x005B4B | 1424 |
| 0x0A19CC | 1402 |
| 0x005AB6 | 1335 |
| 0x0A188A | 1284 |
| 0x0A1939 | 1284 |
| 0x0A19A4 | 560 |
| 0x08761B | 270 |
| 0x0060B3 | 255 |
| 0x001377 | 254 |
| 0x087613 | 243 |
| 0x001CA6 | 227 |
| 0x09EFE8 | 222 |
| 0x09EFCB | 220 |
| 0x003D28 | 217 |

## Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|---|
| reset000000 | 1 | 68564 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x000000 |
| rst000038 | 33 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x05C67C |
| low000a92 | 18 | 159950 | 0x000A92 | 0x000A72 | 0x000000 | 0x0000E2 | 0xD1A3FD | 0xD1A3BC | 0x000000 |
| low000b7c | 16 | 159889 | 0x000B7C | 0x000B60 | 0x00105C | 0xFFFF16 | 0x0000EA | 0xD1A3BC | 0x000000 |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 69133 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0013E8 |
| cleanupTail0018f8 | 1 | 69134 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FEFF | 0xD3FF00 | 0xD1A87B | 0x0013E8 |
| sentinel001c33 | 195 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 |
| sentinel0158bc | 2 | 68929 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0158EC |
| postInsertGate0158de | 2 | 68927 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0013DA |
| cursorOwner05e348 | 0 | - | - | - | - | - | - | - | - |
| cursorNext05e372 | 0 | - | - | - | - | - | - | - | - |
| eolOwner0a229d | 0 | - | - | - | - | - | - | - | - |
| eolTail0a22a4 | 0 | - | - | - | - | - | - | - | - |
| spaceFillBridge0a2a37 | 7 | 573 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 1 | 2195 | 0x08C72F | 0x08C536 | 0x000100 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x08C53A |
| cxJpTrampoline08c745 | 1 | 2202 | 0x08C745 | 0x08C734 | 0x000100 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x08C73D |
| display09efde | 35388 | 5806 | 0x09EFDE | 0x09EFB7 | 0x009595 | 0xD42304 | 0x0052AA | 0xD1A833 | 0x00012B |
| display09efcb | 220 | 5957 | 0x09EFCB | 0x09EFEC | 0x00012B | 0xD42584 | 0x0052AA | 0xD1A839 | 0x000E19 |
| display09efe8 | 222 | 5955 | 0x09EFE8 | 0x09EFDE | 0x000095 | 0xD42558 | 0x0052AA | 0xD1A833 | 0x00012B |
| tokenOuter08f3b8 | 0 | - | - | - | - | - | - | - | - |
| tokenTuple08f54b | 0 | - | - | - | - | - | - | - | - |
| tokenExit08f5e1 | 0 | - | - | - | - | - | - | - | - |
| tokenGate090992 | 0 | - | - | - | - | - | - | - | - |

## Tail Snapshots

| Block | Step | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D008E0 | D0243A | D02590 | Key bytes |
|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 159912 | 159944 | 0x000B72 | 0x000B81 | 0x000800 | 0x000000 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159913 | 159945 | 0x000B7C | 0x000B72 | 0x000800 | 0xFFFF16 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159914 | 159946 | 0x000B81 | 0x000B7C | 0x000800 | 0x000000 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159915 | 159947 | 0x000B72 | 0x000B81 | 0x000700 | 0x000000 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159916 | 159948 | 0x000B7C | 0x000B72 | 0x000700 | 0xFFFF16 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159917 | 159949 | 0x000B81 | 0x000B7C | 0x000700 | 0x000000 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159918 | 159950 | 0x000B72 | 0x000B81 | 0x000600 | 0x000000 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159919 | 159951 | 0x000B7C | 0x000B72 | 0x000600 | 0xFFFF17 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159920 | 159952 | 0x000B81 | 0x000B7C | 0x000600 | 0x000001 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159921 | 159953 | 0x000B72 | 0x000B81 | 0x000500 | 0x000001 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159922 | 159954 | 0x000B7C | 0x000B72 | 0x000500 | 0xFFFF18 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159923 | 159955 | 0x000B81 | 0x000B7C | 0x000500 | 0x000002 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159924 | 159956 | 0x000B72 | 0x000B81 | 0x000400 | 0x000002 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159925 | 159957 | 0x000B7C | 0x000B72 | 0x000400 | 0xFFFF1B | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159926 | 159958 | 0x000B81 | 0x000B7C | 0x000400 | 0x000005 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159927 | 159959 | 0x000B72 | 0x000B81 | 0x000300 | 0x000005 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159928 | 159960 | 0x000B7C | 0x000B72 | 0x000300 | 0xFFFF21 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159929 | 159961 | 0x000B81 | 0x000B7C | 0x000300 | 0x00000B | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159930 | 159962 | 0x000B72 | 0x000B81 | 0x000200 | 0x00000B | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159931 | 159963 | 0x000B7C | 0x000B72 | 0x000200 | 0xFFFF2D | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159932 | 159964 | 0x000B81 | 0x000B7C | 0x000200 | 0x000017 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159933 | 159965 | 0x000B72 | 0x000B81 | 0x000100 | 0x000017 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159934 | 159966 | 0x000B7C | 0x000B72 | 0x000100 | 0xFFFF44 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159935 | 159967 | 0x000B81 | 0x000B7C | 0x000100 | 0x00002E | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159936 | 159968 | 0x000B83 | 0x000B81 | 0x000000 | 0x00002E | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159937 | 159969 | 0x000BCB | 0x000B83 | 0x002ECA | 0xFFD136 | 0x00EADA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159938 | 159970 | 0x000C80 | 0x000BCB | 0x002ECA | 0xFFD136 | 0x00EADA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159939 | 159971 | 0x000C8D | 0x000C80 | 0x002ECA | 0xFFFFFF | 0x00EADA | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159940 | 159972 | 0x000CA0 | 0x000C8D | 0x00007F | 0xD1A47B | 0x00EA2E | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159941 | 159973 | 0x000CA4 | 0x000CA0 | 0x00007F | 0xD1A47B | 0x00EA2E | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159942 | 159974 | 0x0009E8 | 0x000CA4 | 0x000080 | 0xD1A3FB | 0x00EA2E | 0xD1A3EF | 0xD1A3FB | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159943 | 159975 | 0x00096C | 0x0009E8 | 0x006C0C | 0xD1A3FB | 0xD1A717 | 0xD1A3F8 | 0x0009F3 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159944 | 159976 | 0x000984 | 0x00096C | 0x000082 | 0x000080 | 0xD1A717 | 0xD1A3F5 | 0xD1A3FB | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159945 | 159977 | 0x0009F3 | 0x000984 | 0x000000 | 0xD1A47D | 0xD1A799 | 0xD1A3FB | 0xF18000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159946 | 159978 | 0x0009F9 | 0x0009F3 | 0x000000 | 0xD1A47D | 0xD1A799 | 0xD1A3FB | 0xF18000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159947 | 159979 | 0x000A2E | 0x0009F9 | 0xD1A3FB | 0xD1A47D | 0xD1A799 | 0xD1A3EC | 0x000A0A | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159948 | 159980 | 0x000A5D | 0x000A2E | 0x000080 | 0xD1A600 | 0xD1A5FF | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159949 | 159981 | 0x000A72 | 0x000A5D | 0x000080 | 0xD1A600 | 0xD1A5FF | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159950 | 159982 | 0x000A92 | 0x000A72 | 0x000000 | 0x0000E2 | 0xD1A3FD | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159951 | 159983 | 0x000A92 | 0x000A92 | 0x000000 | 0x0000C2 | 0xD1A3FE | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159952 | 159984 | 0x000A92 | 0x000A92 | 0x000000 | 0x000005 | 0xD1A3FF | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159953 | 159985 | 0x000A92 | 0x000A92 | 0x000000 | 0x000021 | 0xD1A400 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159954 | 159986 | 0x000A92 | 0x000A92 | 0x000000 | 0x0000E2 | 0xD1A401 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159955 | 159987 | 0x000A92 | 0x000A92 | 0x000000 | 0x0000DF | 0xD1A402 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159956 | 159988 | 0x000A92 | 0x000A92 | 0x000000 | 0x0000E8 | 0xD1A403 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159957 | 159989 | 0x000A92 | 0x000A92 | 0x000000 | 0x000007 | 0xD1A404 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159958 | 159990 | 0x000A92 | 0x000A92 | 0x000000 | 0x000026 | 0xD1A405 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159959 | 159991 | 0x000A92 | 0x000A92 | 0x000000 | 0x00009B | 0xD1A406 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159960 | 159992 | 0x000A92 | 0x000A92 | 0x000000 | 0x00000E | 0xD1A407 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159961 | 159993 | 0x000A92 | 0x000A92 | 0x000000 | 0x000009 | 0xD1A408 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159962 | 159994 | 0x000A92 | 0x000A92 | 0x000000 | 0x0000C0 | 0xD1A409 | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159963 | 159995 | 0x000A92 | 0x000A92 | 0x000000 | 0x0000C6 | 0xD1A40A | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159964 | 159996 | 0x000A92 | 0x000A92 | 0x000000 | 0x00001D | 0xD1A40B | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159965 | 159997 | 0x000A92 | 0x000A92 | 0x000000 | 0x000002 | 0xD1A40C | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159966 | 159998 | 0x000A92 | 0x000A92 | 0x000000 | 0x000078 | 0xD1A40D | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 159967 | 159999 | 0x000A92 | 0x000A92 | 0x000000 | 0x00005E | 0xD1A40E | 0xD1A3BC | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |

## Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x000001; D0058D:0x000000->0x000001; D0058E:0x000000->0x000001 |
| 144 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000001->0x000033 |
| 3530 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000001->0x000000; D0058E:0x000001->0x000000 |
| 4568 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x00002E |
| 66799 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x00002E->0x000000 |
| 69134 | 0x0018F8 | 0x001879 | entry-vs-previous-block | D007CA:0x0585E9->0x000000; D008E0:0xD1A863->0x000000; D0243A:0xD1A8CC->0x000000; D0243D:0xD2A83E->0x000000; D02590:0xD3FE81->0x000000; D0058D:0x000033->0x000000 |

## Compact Evidence

```json
{
  "finding": "ArrowRight ends with termination=max_steps, lastPc=0x000A92, classified as CLEAR-adjacent 0x0A2A37 space-fill bridge followed by cleanup/wipe 0x001879 -> 0x0018F8; first critical zero at 0x0018F8 after 0x001879; first D007CA divergence at 0x0018F8 after 0x001879; hot tail 0x09EFDEx35388, 0x0021C2x10092, 0x006D5Dx10088, 0x006D64x10088, 0x006CDFx10083.",
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
    "status": "Key: RIGHT → 160000 steps (max_steps, peak 13111px)",
    "lastPc": "0x000A92",
    "cpu": {
      "pc": "0x000A92",
      "sp": "0xD1A3BC",
      "af": "0x00BC2A",
      "bc": "0x000000",
      "de": "0xD1A40F",
      "hl": "0x00003A",
      "ix": "0xD1A3E9",
      "iy": "0xD00080",
      "f": "0x2A",
      "stepCount": 159999
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
      "code": "ArrowRight",
      "label": "RIGHT",
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
      "steps": 160000,
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
      "vramPeak": 13111,
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
    ]
  },
  "record": {
    "totalBlocks": 159967,
    "regionCounts": {
      "low000000_006fff": 95757,
      "cleanup001000_001fff": 3328,
      "display09e000_0a2fff": 59115,
      "token08f000_090fff": 0,
      "near0a2100_0a23ff": 17
    },
    "targetCounts": {
      "reset000000": 1,
      "rst000038": 33,
      "low000a92": 18,
      "low000b7c": 16,
      "cleanup001879": 1,
      "cleanupTail0018f8": 1,
      "sentinel001c33": 195,
      "sentinel0158bc": 2,
      "postInsertGate0158de": 2,
      "spaceFillBridge0a2a37": 7,
      "cxDispatchWrapper08c72f": 1,
      "cxJpTrampoline08c745": 1,
      "display09efde": 35388,
      "display09efcb": 220,
      "display09efe8": 222
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
          "D00587": "0x03",
          "D0058C": "0x01",
          "D0058D": "0x01",
          "D0058E": "0x01",
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
          "D00587": "0x03",
          "D0058C": "0x01",
          "D0058D": "0x01",
          "D0058E": "0x01",
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
        "block": 573,
        "step": 575,
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
          "stepCount": 575
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x33",
          "D0058C": "0x01",
          "D0058D": "0x33",
          "D0058E": "0x01",
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
        "block": 2195,
        "step": 2199,
        "pc": "0x08C72F",
        "prevPc": "0x08C536",
        "cpu": {
          "pc": "0x08C72F",
          "sp": "0xD1A85D",
          "af": "0x00019B",
          "bc": "0x000100",
          "de": "0xD2A815",
          "hl": "0x00FFFF",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x9B",
          "stepCount": 2199
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x33",
          "D0058C": "0x01",
          "D0058D": "0x33",
          "D0058E": "0x01",
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
            "value": "0x00019B"
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
        "block": 2202,
        "step": 2206,
        "pc": "0x08C745",
        "prevPc": "0x08C734",
        "cpu": {
          "pc": "0x08C745",
          "sp": "0xD1A854",
          "af": "0x000113",
          "bc": "0x000100",
          "de": "0xD2A815",
          "hl": "0x0585E9",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x13",
          "stepCount": 2206
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x33",
          "D0058C": "0x01",
          "D0058D": "0x33",
          "D0058E": "0x01",
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
            "value": "0x000101"
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
            "value": "0x00019B"
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
      "display09efde": {
        "expected": "-",
        "block": 5806,
        "step": 5820,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFB7",
        "cpu": {
          "pc": "0x09EFDE",
          "sp": "0xD1A833",
          "af": "0x000C85",
          "bc": "0x009595",
          "de": "0x0052AA",
          "hl": "0xD42304",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x85",
          "stepCount": 5820
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x2E",
          "D0058D": "0x33",
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
            "addr": "0xD1A833",
            "value": "0x00012B"
          },
          {
            "addr": "0xD1A836",
            "value": "0x000C18"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000E19"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00012C"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A842",
            "value": "0x000045"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A848",
            "value": "0x055CDA"
          }
        ],
        "vram": 8585
      },
      "display09efe8": {
        "expected": "-",
        "block": 5955,
        "step": 5969,
        "pc": "0x09EFE8",
        "prevPc": "0x09EFDE",
        "cpu": {
          "pc": "0x09EFE8",
          "sp": "0xD1A833",
          "af": "0x000C85",
          "bc": "0x000095",
          "de": "0x0052AA",
          "hl": "0xD42558",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x85",
          "stepCount": 5969
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x2E",
          "D0058D": "0x33",
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
            "addr": "0xD1A833",
            "value": "0x00012B"
          },
          {
            "addr": "0xD1A836",
            "value": "0x000C18"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000E19"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00012C"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A842",
            "value": "0x000045"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A848",
            "value": "0x055CDA"
          }
        ],
        "vram": 8585
      },
      "display09efcb": {
        "expected": "-",
        "block": 5957,
        "step": 5971,
        "pc": "0x09EFCB",
        "prevPc": "0x09EFEC",
        "cpu": {
          "pc": "0x09EFCB",
          "sp": "0xD1A839",
          "af": "0x000B0A",
          "bc": "0x00012B",
          "de": "0x0052AA",
          "hl": "0xD42584",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x0A",
          "stepCount": 5971
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x2E",
          "D0058D": "0x33",
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
            "addr": "0xD1A839",
            "value": "0x000E19"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00012C"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A842",
            "value": "0x000045"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A848",
            "value": "0x055CDA"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x000093"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000116"
          }
        ],
        "vram": 8585
      },
      "reset000000": {
        "expected": "-",
        "block": 68564,
        "step": 68596,
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
          "stepCount": 68596
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x33",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x01",
          "D00596": "0x0A"
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
        "vram": 13461
      },
      "postInsertGate0158de": {
        "expected": "-",
        "block": 68927,
        "step": 68959,
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
          "stepCount": 68959
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x33",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x01",
          "D00596": "0x0A"
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
        "vram": 13461
      },
      "sentinel0158bc": {
        "expected": "-",
        "block": 68929,
        "step": 68961,
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
          "stepCount": 68961
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x33",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x01",
          "D00596": "0x0A"
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
        "vram": 13461
      },
      "cleanup001879": {
        "expected": "-",
        "block": 69133,
        "step": 69165,
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
          "stepCount": 69165
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x33",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x01",
          "D00596": "0x0A"
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
        "vram": 13461
      },
      "cleanupTail0018f8": {
        "expected": "-",
        "block": 69134,
        "step": 69166,
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
          "stepCount": 69166
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
        "vram": 13461
      },
      "low000b7c": {
        "expected": "-",
        "block": 159889,
        "step": 159921,
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
          "stepCount": 159921
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
        "block": 159950,
        "step": 159982,
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
          "stepCount": 159982
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
        "block": 69134,
        "step": 69166,
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
          "stepCount": 69166
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
        "vram": 13461
      }
    },
    "first202020": null,
    "firstBadD007CA": {
      "source": "observed-before-block",
      "expected": "0x0585E9",
      "snapshot": {
        "expected": "-",
        "block": 69134,
        "step": 69166,
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
          "stepCount": 69166
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
        "vram": 13461
      }
    },
    "firstD0243AChange": {
      "source": "observed-before-block",
      "expected": "0xD1A8CC",
      "snapshot": {
        "expected": "-",
        "block": 69134,
        "step": 69166,
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
          "stepCount": 69166
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
        "vram": 13461
      }
    },
    "hotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 35388
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
        "pc": "0x0A189E",
        "count": 1482
      },
      {
        "pc": "0x0A190D",
        "count": 1482
      },
      {
        "pc": "0x0A191F",
        "count": 1482
      },
      {
        "pc": "0x0A1969",
        "count": 1482
      },
      {
        "pc": "0x0A1980",
        "count": 1482
      },
      {
        "pc": "0x0A19D7",
        "count": 1482
      },
      {
        "pc": "0x0A1A1D",
        "count": 1482
      },
      {
        "pc": "0x0A1854",
        "count": 1461
      },
      {
        "pc": "0x0A187C",
        "count": 1428
      },
      {
        "pc": "0x0A1976",
        "count": 1428
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
        "pc": "0x0A19CC",
        "count": 1402
      },
      {
        "pc": "0x005AB6",
        "count": 1335
      },
      {
        "pc": "0x0A188A",
        "count": 1284
      },
      {
        "pc": "0x0A1939",
        "count": 1284
      },
      {
        "pc": "0x0A19A4",
        "count": 560
      },
      {
        "pc": "0x08761B",
        "count": 270
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
        "pc": "0x087613",
        "count": 243
      },
      {
        "pc": "0x001CA6",
        "count": 227
      },
      {
        "pc": "0x09EFE8",
        "count": 222
      },
      {
        "pc": "0x09EFCB",
        "count": 220
      },
      {
        "pc": "0x003D28",
        "count": 217
      },
      {
        "pc": "0x003D25",
        "count": 217
      },
      {
        "pc": "0x001CC0",
        "count": 211
      },
      {
        "pc": "0x001CCA",
        "count": 210
      },
      {
        "pc": "0x09EFEF",
        "count": 210
      },
      {
        "pc": "0x0A188C",
        "count": 198
      },
      {
        "pc": "0x0A1929",
        "count": 198
      },
      {
        "pc": "0x001C33",
        "count": 195
      },
      {
        "pc": "0x001C38",
        "count": 193
      },
      {
        "pc": "0x005A53",
        "count": 180
      },
      {
        "pc": "0x001C3C",
        "count": 178
      },
      {
        "pc": "0x001CE4",
        "count": 174
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
        "pc": "0x001C7D",
        "count": 154
      },
      {
        "pc": "0x001C81",
        "count": 154
      },
      {
        "pc": "0x001C82",
        "count": 154
      },
      {
        "pc": "0x001C44",
        "count": 153
      },
      {
        "pc": "0x001C48",
        "count": 153
      },
      {
        "pc": "0x0A3408",
        "count": 144
      },
      {
        "pc": "0x0A3404",
        "count": 144
      },
      {
        "pc": "0x0A1884",
        "count": 144
      },
      {
        "pc": "0x0A1878",
        "count": 144
      },
      {
        "pc": "0x04C979",
        "count": 140
      },
      {
        "pc": "0x000AC5",
        "count": 128
      },
      {
        "pc": "0x000AD9",
        "count": 128
      },
      {
        "pc": "0x000AEE",
        "count": 127
      },
      {
        "pc": "0x000A79",
        "count": 127
      },
      {
        "pc": "0x0008BB",
        "count": 123
      },
      {
        "pc": "0x001713",
        "count": 122
      },
      {
        "pc": "0x001717",
        "count": 122
      },
      {
        "pc": "0x001718",
        "count": 122
      },
      {
        "pc": "0x07BACF",
        "count": 117
      },
      {
        "pc": "0x07BACC",
        "count": 108
      },
      {
        "pc": "0x0A2D4C",
        "count": 91
      },
      {
        "pc": "0x00038C",
        "count": 91
      },
      {
        "pc": "0x0A1799",
        "count": 90
      },
      {
        "pc": "0x07BF3E",
        "count": 90
      },
      {
        "pc": "0x07BF4D",
        "count": 90
      },
      {
        "pc": "0x07BF5C",
        "count": 90
      },
      {
        "pc": "0x000380",
        "count": 90
      },
      {
        "pc": "0x003D85",
        "count": 90
      },
      {
        "pc": "0x07BF61",
        "count": 90
      },
      {
        "pc": "0x0A17C5",
        "count": 90
      },
      {
        "pc": "0x0A17D0",
        "count": 90
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
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AFD",
      "0x000B19",
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
      "0x000B83",
      "0x000BCB",
      "0x000C80",
      "0x000C8D",
      "0x000CA0",
      "0x000CA4",
      "0x0009E8",
      "0x00096C",
      "0x000984",
      "0x0009F3",
      "0x0009F9",
      "0x000A2E",
      "0x000A5D",
      "0x000A72",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92"
    ],
    "tailSnapshots": [
      {
        "block": 159888,
        "step": 159920,
        "pc": "0x000B60",
        "prevPc": "0x000B19",
        "bc": "0x000080",
        "hl": "0xD1A3FB",
        "de": "0x000081",
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
        "block": 159889,
        "step": 159921,
        "pc": "0x000B7C",
        "prevPc": "0x000B60",
        "bc": "0x00105C",
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
        "block": 159890,
        "step": 159922,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x00105C",
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
        "block": 159891,
        "step": 159923,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000F5C",
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
        "block": 159892,
        "step": 159924,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000FB8",
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
        "block": 159893,
        "step": 159925,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000FB8",
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
        "block": 159894,
        "step": 159926,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000EB8",
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
        "block": 159895,
        "step": 159927,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000E70",
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
        "block": 159896,
        "step": 159928,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000E70",
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
        "block": 159897,
        "step": 159929,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000D70",
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
        "block": 159898,
        "step": 159930,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000DE0",
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
        "block": 159899,
        "step": 159931,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000DE0",
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
        "block": 159900,
        "step": 159932,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000CE0",
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
        "block": 159901,
        "step": 159933,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000CC0",
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
        "block": 159902,
        "step": 159934,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000CC0",
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
        "block": 159903,
        "step": 159935,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000BC0",
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
        "block": 159904,
        "step": 159936,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000B80",
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
        "block": 159905,
        "step": 159937,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000B80",
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
        "block": 159906,
        "step": 159938,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000A80",
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
        "block": 159907,
        "step": 159939,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000A00",
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
        "block": 159908,
        "step": 159940,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000A00",
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
        "block": 159909,
        "step": 159941,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000900",
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
        "block": 159910,
        "step": 159942,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000900",
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
        "block": 159911,
        "step": 159943,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000900",
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
        "block": 159912,
        "step": 159944,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000800",
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
        "block": 159913,
        "step": 159945,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000800",
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
        "block": 159914,
        "step": 159946,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000800",
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
        "block": 159915,
        "step": 159947,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000700",
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
        "block": 159916,
        "step": 159948,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000700",
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
        "block": 159917,
        "step": 159949,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000700",
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
        "block": 159918,
        "step": 159950,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000600",
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
        "block": 159919,
        "step": 159951,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000600",
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
        "block": 159920,
        "step": 159952,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000600",
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
        "block": 159921,
        "step": 159953,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000500",
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
        "block": 159922,
        "step": 159954,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000500",
        "hl": "0xFFFF18",
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
        "block": 159923,
        "step": 159955,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000500",
        "hl": "0x000002",
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
        "block": 159924,
        "step": 159956,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000400",
        "hl": "0x000002",
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
        "block": 159925,
        "step": 159957,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000400",
        "hl": "0xFFFF1B",
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
        "block": 159926,
        "step": 159958,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000400",
        "hl": "0x000005",
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
        "block": 159927,
        "step": 159959,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000300",
        "hl": "0x000005",
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
        "block": 159928,
        "step": 159960,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000300",
        "hl": "0xFFFF21",
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
        "block": 159929,
        "step": 159961,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000300",
        "hl": "0x00000B",
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
        "block": 159930,
        "step": 159962,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000200",
        "hl": "0x00000B",
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
        "block": 159931,
        "step": 159963,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000200",
        "hl": "0xFFFF2D",
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
        "block": 159932,
        "step": 159964,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000200",
        "hl": "0x000017",
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
        "block": 159933,
        "step": 159965,
        "pc": "0x000B72",
        "prevPc": "0x000B81",
        "bc": "0x000100",
        "hl": "0x000017",
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
        "block": 159934,
        "step": 159966,
        "pc": "0x000B7C",
        "prevPc": "0x000B72",
        "bc": "0x000100",
        "hl": "0xFFFF44",
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
        "block": 159935,
        "step": 159967,
        "pc": "0x000B81",
        "prevPc": "0x000B7C",
        "bc": "0x000100",
        "hl": "0x00002E",
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
        "block": 159936,
        "step": 159968,
        "pc": "0x000B83",
        "prevPc": "0x000B81",
        "bc": "0x000000",
        "hl": "0x00002E",
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
        "block": 159937,
        "step": 159969,
        "pc": "0x000BCB",
        "prevPc": "0x000B83",
        "bc": "0x002ECA",
        "hl": "0xFFD136",
        "de": "0x00EADA",
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
        "block": 159938,
        "step": 159970,
        "pc": "0x000C80",
        "prevPc": "0x000BCB",
        "bc": "0x002ECA",
        "hl": "0xFFD136",
        "de": "0x00EADA",
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
        "block": 159939,
        "step": 159971,
        "pc": "0x000C8D",
        "prevPc": "0x000C80",
        "bc": "0x002ECA",
        "hl": "0xFFFFFF",
        "de": "0x00EADA",
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
        "block": 159940,
        "step": 159972,
        "pc": "0x000CA0",
        "prevPc": "0x000C8D",
        "bc": "0x00007F",
        "hl": "0xD1A47B",
        "de": "0x00EA2E",
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
        "block": 159941,
        "step": 159973,
        "pc": "0x000CA4",
        "prevPc": "0x000CA0",
        "bc": "0x00007F",
        "hl": "0xD1A47B",
        "de": "0x00EA2E",
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
        "block": 159942,
        "step": 159974,
        "pc": "0x0009E8",
        "prevPc": "0x000CA4",
        "bc": "0x000080",
        "hl": "0xD1A3FB",
        "de": "0x00EA2E",
        "sp": "0xD1A3EF",
        "stack0": "0xD1A3FB",
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
        "block": 159943,
        "step": 159975,
        "pc": "0x00096C",
        "prevPc": "0x0009E8",
        "bc": "0x006C0C",
        "hl": "0xD1A3FB",
        "de": "0xD1A717",
        "sp": "0xD1A3F8",
        "stack0": "0x0009F3",
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
        "block": 159944,
        "step": 159976,
        "pc": "0x000984",
        "prevPc": "0x00096C",
        "bc": "0x000082",
        "hl": "0x000080",
        "de": "0xD1A717",
        "sp": "0xD1A3F5",
        "stack0": "0xD1A3FB",
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
        "block": 159945,
        "step": 159977,
        "pc": "0x0009F3",
        "prevPc": "0x000984",
        "bc": "0x000000",
        "hl": "0xD1A47D",
        "de": "0xD1A799",
        "sp": "0xD1A3FB",
        "stack0": "0xF18000",
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
        "block": 159946,
        "step": 159978,
        "pc": "0x0009F9",
        "prevPc": "0x0009F3",
        "bc": "0x000000",
        "hl": "0xD1A47D",
        "de": "0xD1A799",
        "sp": "0xD1A3FB",
        "stack0": "0xF18000",
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
        "block": 159947,
        "step": 159979,
        "pc": "0x000A2E",
        "prevPc": "0x0009F9",
        "bc": "0xD1A3FB",
        "hl": "0xD1A47D",
        "de": "0xD1A799",
        "sp": "0xD1A3EC",
        "stack0": "0x000A0A",
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
        "block": 159948,
        "step": 159980,
        "pc": "0x000A5D",
        "prevPc": "0x000A2E",
        "bc": "0x000080",
        "hl": "0xD1A600",
        "de": "0xD1A5FF",
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
        "block": 159949,
        "step": 159981,
        "pc": "0x000A72",
        "prevPc": "0x000A5D",
        "bc": "0x000080",
        "hl": "0xD1A600",
        "de": "0xD1A5FF",
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
        "block": 159950,
        "step": 159982,
        "pc": "0x000A92",
        "prevPc": "0x000A72",
        "bc": "0x000000",
        "hl": "0x0000E2",
        "de": "0xD1A3FD",
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
        "block": 159951,
        "step": 159983,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x0000C2",
        "de": "0xD1A3FE",
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
        "block": 159952,
        "step": 159984,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x000005",
        "de": "0xD1A3FF",
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
        "block": 159953,
        "step": 159985,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x000021",
        "de": "0xD1A400",
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
        "block": 159954,
        "step": 159986,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x0000E2",
        "de": "0xD1A401",
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
        "block": 159955,
        "step": 159987,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x0000DF",
        "de": "0xD1A402",
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
        "block": 159956,
        "step": 159988,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x0000E8",
        "de": "0xD1A403",
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
        "block": 159957,
        "step": 159989,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x000007",
        "de": "0xD1A404",
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
        "block": 159958,
        "step": 159990,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x000026",
        "de": "0xD1A405",
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
        "block": 159959,
        "step": 159991,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x00009B",
        "de": "0xD1A406",
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
        "block": 159960,
        "step": 159992,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x00000E",
        "de": "0xD1A407",
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
        "block": 159961,
        "step": 159993,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x000009",
        "de": "0xD1A408",
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
        "block": 159962,
        "step": 159994,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x0000C0",
        "de": "0xD1A409",
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
        "block": 159963,
        "step": 159995,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x0000C6",
        "de": "0xD1A40A",
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
        "block": 159964,
        "step": 159996,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x00001D",
        "de": "0xD1A40B",
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
        "block": 159965,
        "step": 159997,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x000002",
        "de": "0xD1A40C",
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
        "block": 159966,
        "step": 159998,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x000078",
        "de": "0xD1A40D",
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
        "block": 159967,
        "step": 159999,
        "pc": "0x000A92",
        "prevPc": "0x000A92",
        "bc": "0x000000",
        "hl": "0x00005E",
        "de": "0xD1A40E",
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
        "block": 62224,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000003",
            "after": "0x000004"
          }
        }
      },
      {
        "block": 62461,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000004",
            "after": "0x000005"
          }
        }
      },
      {
        "block": 62698,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000005",
            "after": "0x000006"
          }
        }
      },
      {
        "block": 62935,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000006",
            "after": "0x000007"
          }
        }
      },
      {
        "block": 63172,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000007",
            "after": "0x000008"
          }
        }
      },
      {
        "block": 63409,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000008",
            "after": "0x000009"
          }
        }
      },
      {
        "block": 63646,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000009",
            "after": "0x00000A"
          }
        }
      },
      {
        "block": 63701,
        "pc": "0x08538A",
        "prevPc": "0x085364",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000008",
            "after": "0x000009"
          }
        }
      },
      {
        "block": 63702,
        "pc": "0x08539E",
        "prevPc": "0x08538A",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x00000A",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 63998,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000000",
            "after": "0x000001"
          }
        }
      },
      {
        "block": 64262,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000001",
            "after": "0x000002"
          }
        }
      },
      {
        "block": 64684,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000002",
            "after": "0x000003"
          }
        }
      },
      {
        "block": 64921,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000003",
            "after": "0x000004"
          }
        }
      },
      {
        "block": 65158,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000004",
            "after": "0x000005"
          }
        }
      },
      {
        "block": 65395,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000005",
            "after": "0x000006"
          }
        }
      },
      {
        "block": 65632,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000006",
            "after": "0x000007"
          }
        }
      },
      {
        "block": 65869,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000007",
            "after": "0x000008"
          }
        }
      },
      {
        "block": 66106,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000008",
            "after": "0x000009"
          }
        }
      },
      {
        "block": 66343,
        "pc": "0x0A1B8B",
        "prevPc": "0x0A1B7B",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000009",
            "after": "0x00000A"
          }
        }
      },
      {
        "block": 66423,
        "pc": "0x084CC0",
        "prevPc": "0x0851AA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000009",
            "after": "0x000001"
          }
        }
      },
      {
        "block": 66799,
        "pc": "0x02FCB3",
        "prevPc": "0x08C359",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0058C": {
            "before": "0x00002E",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 69134,
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
            "before": "0xD1A8CC",
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
            "before": "0x000033",
            "after": "0x000000"
          },
          "D02A40": {
            "before": "0xD2A83E",
            "after": "0x000000"
          },
          "D00595": {
            "before": "0x000001",
            "after": "0x000000"
          },
          "D00596": {
            "before": "0x00000A",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 70907,
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
        "block": 70993,
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
        "block": 71079,
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
        "block": 71165,
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
        "block": 71251,
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
        "block": 71337,
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
        "block": 71423,
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
        "block": 71509,
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
        "block": 71595,
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
        "block": 71681,
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
        "block": 71767,
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
        "block": 71853,
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
        "block": 71939,
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
        "block": 72025,
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
        "block": 72028,
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
        "block": 72113,
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
        "block": 72200,
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
        "block": 72287,
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
        "block": 72374,
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
        "block": 72461,
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
        "block": 72548,
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
        "block": 72635,
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
        "block": 72722,
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
        "block": 72809,
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
        "block": 72896,
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
        "block": 72983,
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
        "block": 73070,
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
        "block": 73157,
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
        "block": 73244,
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
        "block": 73331,
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
        "block": 73418,
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
        "block": 73505,
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
        "block": 73511,
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
        "block": 73596,
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
        "block": 73602,
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
        "block": 73687,
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
        "block": 73774,
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
        "block": 73861,
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
        "block": 73948,
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
        "block": 74035,
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
        "block": 74122,
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
        "block": 74209,
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
        "block": 74296,
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
        "block": 74383,
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
        "block": 74470,
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
        "block": 74557,
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
        "block": 74644,
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
        "block": 74731,
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
        "block": 74818,
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
        "block": 74905,
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
        "block": 74992,
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
        "block": 75079,
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
        "block": 75166,
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
        "block": 75253,
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
        "block": 75340,
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
        "block": 75427,
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
        "block": 75514,
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
        "block": 75602,
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
        "block": 75690,
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
        "block": 75696,
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
        "block": 75781,
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
        "block": 75868,
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
        "block": 75955,
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
        "block": 76042,
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
        "block": 76129,
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
        "block": 76216,
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
        "block": 76303,
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
        "block": 76390,
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
        "block": 76477,
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
        "block": 76564,
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
        "block": 76651,
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
        "block": 76738,
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
        "block": 76825,
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
        "block": 76912,
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
        "block": 76999,
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
        "block": 77086,
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
        "block": 77173,
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
        "block": 77260,
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
        "block": 77347,
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
        "block": 77353,
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
        "block": 77438,
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
        "block": 77525,
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
        "block": 77612,
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
        "block": 77699,
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
        "block": 77786,
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
        "block": 77873,
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
        "block": 77960,
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
        "block": 78047,
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
        "block": 78134,
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
        "block": 78221,
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
        "block": 78254,
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
        "block": 78337,
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
        "block": 78379,
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
        "block": 78462,
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
        "block": 159120,
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
        "block": 159203,
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
        "block": 159250,
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
        "block": 159333,
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


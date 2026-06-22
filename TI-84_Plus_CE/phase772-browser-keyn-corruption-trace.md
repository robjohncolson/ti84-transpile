# Phase 772 Browser KeyN Corruption Trace

Probe: `probe-phase772-browser-keyn-corruption-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase772-browser-keyn-corruption-trace.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyN`, and records the route plus first cx/VAT/cursor/key-state corruption evidence.

The in-memory harness caps only `KeyN` at 190000 steps so the trace completes under the 180s watchdog. The shell file on disk is not patched.

No disk browser/runtime/transpiler behavior is patched by this probe.

## Result

- KeyN ends with termination=max_steps, lastPc=0x005AE8, classified as CLEAR-adjacent 0x0A2A37 space-fill bridge followed by cleanup/wipe 0x001879 -> 0x0018F8; first critical zero at 0x0018F8 after 0x001879; first D007CA divergence at 0x0018F8 after 0x001879; hot tail 0x000A92x32512, 0x000BFEx32258, 0x0021C2x10094, 0x006D5Dx10088, 0x006D64x10088.
- Final key state: termination=max_steps, steps=190000, lastPc=0x005AE8, final cpu.pc=0x005AB6.
- Base before key: D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, lastPc=0x08C331, VRAM=8549.
- First critical zero: observed-before-block at block 11739, pc=0x0018F8, prev=0x001879.
- First 0x202020 signal: none.
- First D007CA divergence: observed-before-block at block 11739, pc=0x0018F8, prev=0x001879, expected=0x0585E9, saw=0x000000.
- First D0243A change: observed-before-block at block 2594, pc=0x05E372, prev=0x05E348, expected=0xD1A8CC, saw=0xD1A8CD.
- Owner-class target hits: vectorOwner08c782=0, vectorRestore06c764=0, clearOwner0a229d=0, clearTail0a22a4=0, spaceFillBridge0a2a37=12, cleanup001879=1, cleanupTail0018f8=1.
- Candidate stop: `0x001879` before the wipe tail. At that block the core fields are still live: D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CE, D0243D=0xD2A83E, D02590=0xD3FE81.
- Wipe tail evidence: the next tracked block `0x0018F8` has D007CA=0x000000, D008E0=0x000000, D0243A=0x000000, D0243D=0x000000, D02590=0x000000.
- Candidate restore scope: vector-owner hits are 0, so no context-vector restore is indicated by this trace. D0243A already changes before cleanup (first 0xD1A8CC->0xD1A8CD at 0x05E372 after 0x05E348); the next A/B should test KeyN pre-stop-only before restoring cursor or context fields.
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
| 0x005AE8 | 2894 |
| 0x005B16 | 2894 |
| 0x005B4B | 2894 |
| 0x005AB6 | 2714 |
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
| 0x000ACE | 250 |
| 0x0008BB | 213 |

## Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|---|
| reset000000 | 1 | 11169 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x000000 |
| rst000038 | 31 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x05C67C |
| low000a92 | 32512 | 102553 | 0x000A92 | 0x000A72 | 0x000000 | 0x0000E2 | 0xD1A3FD | 0xD1A3BC | 0x000000 |
| low000b7c | 3085 | 102492 | 0x000B7C | 0x000B60 | 0x00105C | 0xFFFF16 | 0x0000EA | 0xD1A3BC | 0x000000 |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 11738 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0013E8 |
| cleanupTail0018f8 | 1 | 11739 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FEFF | 0xD3FF00 | 0xD1A87B | 0x0013E8 |
| sentinel001c33 | 180 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 |
| sentinel0158bc | 2 | 11534 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0158EC |
| postInsertGate0158de | 2 | 11532 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0013DA |
| cursorOwner05e348 | 2 | 2593 | 0x05E348 | 0x05E31D | 0x008C00 | 0xD1A8CC | 0x0000B0 | 0xD1A845 | 0x003262 |
| cursorNext05e372 | 2 | 2594 | 0x05E372 | 0x05E348 | 0x008C00 | 0xD1A8CD | 0x0000B0 | 0xD1A842 | 0x05E352 |
| eolOwner0a229d | 0 | - | - | - | - | - | - | - | - |
| eolTail0a22a4 | 0 | - | - | - | - | - | - | - | - |
| spaceFillBridge0a2a37 | 12 | 567 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 2 | 2349 | 0x08C72F | 0x08C536 | 0x008C00 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x08C53A |
| cxJpTrampoline08c745 | 2 | 2356 | 0x08C745 | 0x08C734 | 0x008C00 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x08C73D |
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
| 189914 | 189944 | 0x005AE8 | 0x005AAE | 0xFF10FC | 0xD61E9C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189915 | 189945 | 0x005B16 | 0x005AE8 | 0xFF0500 | 0xD61E9C | 0x0000FF | 0xD1A854 | 0xFF1005 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189916 | 189946 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD61EA6 | 0x0000FF | 0xD1A854 | 0xFF1005 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189917 | 189947 | 0x005AB6 | 0x005B4B | 0xFF0F05 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189918 | 189948 | 0x005AE8 | 0x005AB6 | 0xFF0F05 | 0xD6211C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189919 | 189949 | 0x005B16 | 0x005AE8 | 0xFF0500 | 0xD6211C | 0x0000FF | 0xD1A854 | 0xFF0F05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189920 | 189950 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD62126 | 0x0000FF | 0xD1A854 | 0xFF0F05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189921 | 189951 | 0x005AB6 | 0x005B4B | 0xFF0E05 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189922 | 189952 | 0x005AE8 | 0x005AB6 | 0xFF0E05 | 0xD6239C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189923 | 189953 | 0x005B16 | 0x005AE8 | 0xFF0518 | 0xD6239C | 0x0000FF | 0xD1A854 | 0xFF0E05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189924 | 189954 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD623A6 | 0x0000FF | 0xD1A854 | 0xFF0E05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189925 | 189955 | 0x005AB6 | 0x005B4B | 0xFF0D05 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189926 | 189956 | 0x005AE8 | 0x005AB6 | 0xFF0D05 | 0xD6261C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189927 | 189957 | 0x005B16 | 0x005AE8 | 0xFF0578 | 0xD6261C | 0x0000FF | 0xD1A854 | 0xFF0D05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189928 | 189958 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD62626 | 0x0000FF | 0xD1A854 | 0xFF0D05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189929 | 189959 | 0x005AB6 | 0x005B4B | 0xFF0C05 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189930 | 189960 | 0x005AE8 | 0x005AB6 | 0xFF0C05 | 0xD6289C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189931 | 189961 | 0x005B16 | 0x005AE8 | 0xFF0560 | 0xD6289C | 0x0000FF | 0xD1A854 | 0xFF0C05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189932 | 189962 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD628A6 | 0x0000FF | 0xD1A854 | 0xFF0C05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189933 | 189963 | 0x005AB6 | 0x005B4B | 0xFF0B05 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189934 | 189964 | 0x005AE8 | 0x005AB6 | 0xFF0B05 | 0xD62B1C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189935 | 189965 | 0x005B16 | 0x005AE8 | 0xFF05C0 | 0xD62B1C | 0x0000FF | 0xD1A854 | 0xFF0B05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189936 | 189966 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD62B26 | 0x0000FF | 0xD1A854 | 0xFF0B05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189937 | 189967 | 0x005AB6 | 0x005B4B | 0xFF0A05 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189938 | 189968 | 0x005AE8 | 0x005AB6 | 0xFF0A05 | 0xD62D9C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189939 | 189969 | 0x005B16 | 0x005AE8 | 0xFF05C0 | 0xD62D9C | 0x0000FF | 0xD1A854 | 0xFF0A05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189940 | 189970 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD62DA6 | 0x0000FF | 0xD1A854 | 0xFF0A05 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189941 | 189971 | 0x005AB6 | 0x005B4B | 0xFF0905 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189942 | 189972 | 0x005AE8 | 0x005AB6 | 0xFF0905 | 0xD6301C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189943 | 189973 | 0x005B16 | 0x005AE8 | 0xFF05C0 | 0xD6301C | 0x0000FF | 0xD1A854 | 0xFF0905 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189944 | 189974 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD63026 | 0x0000FF | 0xD1A854 | 0xFF0905 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189945 | 189975 | 0x005AB6 | 0x005B4B | 0xFF0805 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189946 | 189976 | 0x005AE8 | 0x005AB6 | 0xFF0805 | 0xD6329C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189947 | 189977 | 0x005B16 | 0x005AE8 | 0xFF05C0 | 0xD6329C | 0x0000FF | 0xD1A854 | 0xFF0805 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189948 | 189978 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD632A6 | 0x0000FF | 0xD1A854 | 0xFF0805 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189949 | 189979 | 0x005AB6 | 0x005B4B | 0xFF0705 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189950 | 189980 | 0x005AE8 | 0x005AB6 | 0xFF0705 | 0xD6351C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189951 | 189981 | 0x005B16 | 0x005AE8 | 0xFF05C8 | 0xD6351C | 0x0000FF | 0xD1A854 | 0xFF0705 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189952 | 189982 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD63526 | 0x0000FF | 0xD1A854 | 0xFF0705 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189953 | 189983 | 0x005AB6 | 0x005B4B | 0xFF0605 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189954 | 189984 | 0x005AE8 | 0x005AB6 | 0xFF0605 | 0xD6379C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189955 | 189985 | 0x005B16 | 0x005AE8 | 0xFF05D8 | 0xD6379C | 0x0000FF | 0xD1A854 | 0xFF0605 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189956 | 189986 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD637A6 | 0x0000FF | 0xD1A854 | 0xFF0605 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189957 | 189987 | 0x005AB6 | 0x005B4B | 0xFF0505 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189958 | 189988 | 0x005AE8 | 0x005AB6 | 0xFF0505 | 0xD63A1C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189959 | 189989 | 0x005B16 | 0x005AE8 | 0xFF05F0 | 0xD63A1C | 0x0000FF | 0xD1A854 | 0xFF0505 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189960 | 189990 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD63A26 | 0x0000FF | 0xD1A854 | 0xFF0505 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189961 | 189991 | 0x005AB6 | 0x005B4B | 0xFF0405 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189962 | 189992 | 0x005AE8 | 0x005AB6 | 0xFF0405 | 0xD63C9C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189963 | 189993 | 0x005B16 | 0x005AE8 | 0xFF05E0 | 0xD63C9C | 0x0000FF | 0xD1A854 | 0xFF0405 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189964 | 189994 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD63CA6 | 0x0000FF | 0xD1A854 | 0xFF0405 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189965 | 189995 | 0x005AB6 | 0x005B4B | 0xFF0305 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189966 | 189996 | 0x005AE8 | 0x005AB6 | 0xFF0305 | 0xD63F1C | 0xD40000 | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189967 | 189997 | 0x005B16 | 0x005AE8 | 0xFF0560 | 0xD63F1C | 0x0000FF | 0xD1A854 | 0xFF0305 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189968 | 189998 | 0x005B4B | 0x005B16 | 0xFF0500 | 0xD63F26 | 0x0000FF | 0xD1A854 | 0xFF0305 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |
| 189969 | 189999 | 0x005AB6 | 0x005B4B | 0xFF0205 | 0xD005A0 | 0x0000FF | 0xD1A857 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00/0x00/0x00 |

## Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x00008C; D0058D:0x000000->0x00008C; D0058E:0x000000->0x00008C |
| 142 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x00008C->0x000021 |
| 2594 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CC->0xD1A8CD |
| 4340 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x00008C->0x000000; D0058E:0x00008C->0x000000 |
| 5390 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x00008E |
| 6996 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CD->0xD1A8CE |
| 8741 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x00008E->0x000000 |
| 11739 | 0x0018F8 | 0x001879 | entry-vs-previous-block | D007CA:0x0585E9->0x000000; D008E0:0xD1A863->0x000000; D0243A:0xD1A8CE->0x000000; D0243D:0xD2A83E->0x000000; D02590:0xD3FE81->0x000000; D0058D:0x000021->0x000000 |

## Compact Evidence

```json
{
  "finding": "KeyN ends with termination=max_steps, lastPc=0x005AE8, classified as CLEAR-adjacent 0x0A2A37 space-fill bridge followed by cleanup/wipe 0x001879 -> 0x0018F8; first critical zero at 0x0018F8 after 0x001879; first D007CA divergence at 0x0018F8 after 0x001879; hot tail 0x000A92x32512, 0x000BFEx32258, 0x0021C2x10094, 0x006D5Dx10088, 0x006D64x10088.",
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
    "status": "Key: (-) → 190000 steps (max_steps, peak 8777px)",
    "lastPc": "0x005AE8",
    "cpu": {
      "pc": "0x005AB6",
      "sp": "0xD1A857",
      "af": "0x007854",
      "bc": "0xFF0205",
      "de": "0xD40000",
      "hl": "0xD6419C",
      "ix": "0xD005BE",
      "iy": "0xD00080",
      "f": "0x54",
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
      "D00595": "0x09",
      "D00596": "0x01"
    },
    "lastKey": {
      "code": "KeyN",
      "label": "(-)",
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
        176,
        48,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 8777,
      "vramCurrent": 3355
    },
    "stackTop": [
      {
        "addr": "0xD1A857",
        "value": "0x000000"
      },
      {
        "addr": "0xD1A85A",
        "value": "0x000209"
      },
      {
        "addr": "0xD1A85D",
        "value": "0x000005"
      },
      {
        "addr": "0xD1A860",
        "value": "0x003D03"
      },
      {
        "addr": "0xD1A863",
        "value": "0x00301B"
      },
      {
        "addr": "0xD1A866",
        "value": "0x0059DA"
      },
      {
        "addr": "0xD1A869",
        "value": "0x000209"
      },
      {
        "addr": "0xD1A86C",
        "value": "0x003020"
      }
    ]
  },
  "record": {
    "totalBlocks": 189969,
    "regionCounts": {
      "low000000_006fff": 182440,
      "cleanup001000_001fff": 3408,
      "display09e000_0a2fff": 5050,
      "token08f000_090fff": 0,
      "near0a2100_0a23ff": 24
    },
    "targetCounts": {
      "reset000000": 1,
      "rst000038": 31,
      "low000a92": 32512,
      "low000b7c": 3085,
      "cleanup001879": 1,
      "cleanupTail0018f8": 1,
      "sentinel001c33": 180,
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
          "D00587": "0x11",
          "D0058C": "0x8C",
          "D0058D": "0x8C",
          "D0058E": "0x8C",
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
          "D00587": "0x11",
          "D0058C": "0x8C",
          "D0058D": "0x8C",
          "D0058E": "0x8C",
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
          "D00587": "0x21",
          "D0058C": "0x8C",
          "D0058D": "0x21",
          "D0058E": "0x8C",
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
        "block": 2349,
        "step": 2354,
        "pc": "0x08C72F",
        "prevPc": "0x08C536",
        "cpu": {
          "pc": "0x08C72F",
          "sp": "0xD1A85D",
          "af": "0x008C26",
          "bc": "0x008C00",
          "de": "0xD2A815",
          "hl": "0x00FFFF",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x26",
          "stepCount": 2354
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x21",
          "D0058C": "0x8C",
          "D0058D": "0x21",
          "D0058E": "0x8C",
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
            "value": "0x008C26"
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
        "block": 2356,
        "step": 2361,
        "pc": "0x08C745",
        "prevPc": "0x08C734",
        "cpu": {
          "pc": "0x08C745",
          "sp": "0xD1A854",
          "af": "0x008C83",
          "bc": "0x008C00",
          "de": "0xD2A815",
          "hl": "0x0585E9",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x83",
          "stepCount": 2361
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x21",
          "D0058C": "0x8C",
          "D0058D": "0x21",
          "D0058E": "0x8C",
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
            "value": "0x008C8C"
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
            "value": "0x008C26"
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
        "block": 2593,
        "step": 2599,
        "pc": "0x05E348",
        "prevPc": "0x05E31D",
        "cpu": {
          "pc": "0x05E348",
          "sp": "0xD1A845",
          "af": "0x000044",
          "bc": "0x008C00",
          "de": "0x0000B0",
          "hl": "0xD1A8CC",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x44",
          "stepCount": 2599
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x21",
          "D0058C": "0x8C",
          "D0058D": "0x21",
          "D0058E": "0x8C",
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
            "value": "0x003262"
          },
          {
            "addr": "0xD1A848",
            "value": "0x05E654"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0000B0"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x003262"
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
            "value": "0x008C8C"
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
        "block": 2594,
        "step": 2600,
        "pc": "0x05E372",
        "prevPc": "0x05E348",
        "cpu": {
          "pc": "0x05E372",
          "sp": "0xD1A842",
          "af": "0x000044",
          "bc": "0x008C00",
          "de": "0x0000B0",
          "hl": "0xD1A8CD",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x44",
          "stepCount": 2600
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x21",
          "D0058C": "0x8C",
          "D0058D": "0x21",
          "D0058E": "0x8C",
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
            "value": "0x003262"
          },
          {
            "addr": "0xD1A848",
            "value": "0x05E654"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0000B0"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x003262"
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
            "value": "0x008C8C"
          }
        ],
        "vram": 8585
      },
      "reset000000": {
        "expected": "-",
        "block": 11169,
        "step": 11199,
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
          "stepCount": 11199
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x21",
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
        "vram": 8777
      },
      "postInsertGate0158de": {
        "expected": "-",
        "block": 11532,
        "step": 11562,
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
          "stepCount": 11562
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x21",
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
        "vram": 8777
      },
      "sentinel0158bc": {
        "expected": "-",
        "block": 11534,
        "step": 11564,
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
          "stepCount": 11564
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x21",
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
        "vram": 8777
      },
      "cleanup001879": {
        "expected": "-",
        "block": 11738,
        "step": 11768,
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
          "stepCount": 11768
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x21",
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
        "vram": 8777
      },
      "cleanupTail0018f8": {
        "expected": "-",
        "block": 11739,
        "step": 11769,
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
          "stepCount": 11769
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
        "vram": 8777
      },
      "low000b7c": {
        "expected": "-",
        "block": 102492,
        "step": 102522,
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
          "stepCount": 102522
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
        "block": 102553,
        "step": 102583,
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
          "stepCount": 102583
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
        "block": 11739,
        "step": 11769,
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
          "stepCount": 11769
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
        "vram": 8777
      }
    },
    "first202020": null,
    "firstBadD007CA": {
      "source": "observed-before-block",
      "expected": "0x0585E9",
      "snapshot": {
        "expected": "-",
        "block": 11739,
        "step": 11769,
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
          "stepCount": 11769
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
        "vram": 8777
      }
    },
    "firstD0243AChange": {
      "source": "observed-before-block",
      "expected": "0xD1A8CC",
      "snapshot": {
        "expected": "-",
        "block": 2594,
        "step": 2600,
        "pc": "0x05E372",
        "prevPc": "0x05E348",
        "cpu": {
          "pc": "0x05E372",
          "sp": "0xD1A842",
          "af": "0x000044",
          "bc": "0x008C00",
          "de": "0x0000B0",
          "hl": "0xD1A8CD",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x44",
          "stepCount": 2600
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x21",
          "D0058C": "0x8C",
          "D0058D": "0x21",
          "D0058E": "0x8C",
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
            "value": "0x003262"
          },
          {
            "addr": "0xD1A848",
            "value": "0x05E654"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x0000B0"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x003262"
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
            "value": "0x008C8C"
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
        "count": 2894
      },
      {
        "pc": "0x005B16",
        "count": 2894
      },
      {
        "pc": "0x005B4B",
        "count": 2894
      },
      {
        "pc": "0x005AB6",
        "count": 2714
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
        "pc": "0x000ACE",
        "count": 250
      },
      {
        "pc": "0x0008BB",
        "count": 213
      },
      {
        "pc": "0x001713",
        "count": 212
      },
      {
        "pc": "0x001717",
        "count": 212
      },
      {
        "pc": "0x001718",
        "count": 212
      },
      {
        "pc": "0x001CA6",
        "count": 210
      },
      {
        "pc": "0x003D28",
        "count": 203
      },
      {
        "pc": "0x003D25",
        "count": 203
      },
      {
        "pc": "0x001CC0",
        "count": 198
      },
      {
        "pc": "0x001CCA",
        "count": 197
      },
      {
        "pc": "0x005A53",
        "count": 190
      },
      {
        "pc": "0x0059C6",
        "count": 181
      },
      {
        "pc": "0x0059D6",
        "count": 181
      },
      {
        "pc": "0x005A75",
        "count": 181
      },
      {
        "pc": "0x005A82",
        "count": 181
      },
      {
        "pc": "0x00596E",
        "count": 181
      },
      {
        "pc": "0x005974",
        "count": 181
      },
      {
        "pc": "0x005998",
        "count": 181
      },
      {
        "pc": "0x005A8B",
        "count": 181
      },
      {
        "pc": "0x005A48",
        "count": 181
      },
      {
        "pc": "0x005A96",
        "count": 181
      },
      {
        "pc": "0x005AA2",
        "count": 181
      },
      {
        "pc": "0x005AAE",
        "count": 181
      },
      {
        "pc": "0x001C33",
        "count": 180
      },
      {
        "pc": "0x005B92",
        "count": 180
      },
      {
        "pc": "0x005A19",
        "count": 180
      },
      {
        "pc": "0x0059DA",
        "count": 180
      },
      {
        "pc": "0x0059E6",
        "count": 180
      },
      {
        "pc": "0x001C38",
        "count": 178
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
        "pc": "0x001C3C",
        "count": 167
      },
      {
        "pc": "0x001CE4",
        "count": 163
      },
      {
        "pc": "0x0059F3",
        "count": 159
      },
      {
        "pc": "0x0059F7",
        "count": 159
      },
      {
        "pc": "0x0059ED",
        "count": 159
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
      },
      {
        "pc": "0x0A189E",
        "count": 144
      },
      {
        "pc": "0x0A18A6",
        "count": 144
      },
      {
        "pc": "0x0A18AF",
        "count": 144
      },
      {
        "pc": "0x0A18C1",
        "count": 144
      },
      {
        "pc": "0x0A18CA",
        "count": 144
      },
      {
        "pc": "0x0A18E9",
        "count": 144
      },
      {
        "pc": "0x0A191F",
        "count": 144
      },
      {
        "pc": "0x0A1939",
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
      "0x013DB9",
      "0x013E1C",
      "0x013E22",
      "0x00073B",
      "0x0061E5",
      "0x0061E9",
      "0x0061FD",
      "0x006202",
      "0x000741",
      "0x00074E",
      "0x00075D",
      "0x000784",
      "0x000791",
      "0x000E01",
      "0x000E0C",
      "0x000E12",
      "0x000E3D",
      "0x000E67",
      "0x000E73",
      "0x000E77",
      "0x000E7F",
      "0x000E94",
      "0x000D7E",
      "0x000DC2",
      "0x000DCA",
      "0x000D82",
      "0x000DAE",
      "0xD18C22",
      "0x000E9D",
      "0x000E24",
      "0x015856",
      "0x015864",
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
      "0x01586A",
      "0x000E33",
      "0x015856",
      "0x015864",
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
      "0x01586A",
      "0x000E38",
      "0x000E06",
      "0x000E0C",
      "0x000E12",
      "0x000E3D",
      "0x000E67",
      "0x000E73",
      "0x000E77",
      "0x000E7F",
      "0x000E94",
      "0x000D7E",
      "0x000DC2",
      "0x000DCA",
      "0x000D82",
      "0x000DAE",
      "0xD18C22",
      "0x000E9D",
      "0x000E24",
      "0x015856",
      "0x015864",
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
      "0x005AB6"
    ],
    "tailSnapshots": [
      {
        "block": 189890,
        "step": 189920,
        "pc": "0x000D82",
        "prevPc": "0x000DCA",
        "bc": "0x003D03",
        "hl": "0x030000",
        "de": "0x000005",
        "sp": "0xD1A86F",
        "stack0": "0x000E9D",
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
        "step": 189921,
        "pc": "0x000DAE",
        "prevPc": "0x000D82",
        "bc": "0x000003",
        "hl": "0x000F15",
        "de": "0xD18C7C",
        "sp": "0xD1A860",
        "stack0": "0xD18C22",
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
        "step": 189922,
        "pc": "0xD18C22",
        "prevPc": "0x000DAE",
        "bc": "0x003D03",
        "hl": "0x030000",
        "de": "0x000005",
        "sp": "0xD1A86F",
        "stack0": "0x000E9D",
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
        "step": 189923,
        "pc": "0x000E9D",
        "prevPc": "0xD18C22",
        "bc": "0x003D03",
        "hl": "0x030000",
        "de": "0x000005",
        "sp": "0xD1A872",
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
        "step": 189924,
        "pc": "0x000E24",
        "prevPc": "0x000E9D",
        "bc": "0x003D03",
        "hl": "0x030000",
        "de": "0x000005",
        "sp": "0xD1A878",
        "stack0": "0x003D03",
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
        "step": 189925,
        "pc": "0x015856",
        "prevPc": "0x000E24",
        "bc": "0x003D03",
        "hl": "0x000109",
        "de": "0x000005",
        "sp": "0xD1A875",
        "stack0": "0x000E33",
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
        "step": 189926,
        "pc": "0x015864",
        "prevPc": "0x015856",
        "bc": "0x003D03",
        "hl": "0x000209",
        "de": "0x000005",
        "sp": "0xD1A872",
        "stack0": "0x000209",
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
        "step": 189927,
        "pc": "0x0059C6",
        "prevPc": "0x015864",
        "bc": "0x003D03",
        "hl": "0x000209",
        "de": "0x000005",
        "sp": "0xD1A86F",
        "stack0": "0x01586A",
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
        "step": 189928,
        "pc": "0x0059D6",
        "prevPc": "0x0059C6",
        "bc": "0x003D03",
        "hl": "0x000209",
        "de": "0x000005",
        "sp": "0xD1A869",
        "stack0": "0x000209",
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
        "step": 189929,
        "pc": "0x005A75",
        "prevPc": "0x0059D6",
        "bc": "0x003D03",
        "hl": "0x000209",
        "de": "0x000005",
        "sp": "0xD1A866",
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
        "block": 189900,
        "step": 189930,
        "pc": "0x005A82",
        "prevPc": "0x005A75",
        "bc": "0x003D03",
        "hl": "0x000209",
        "de": "0x000005",
        "sp": "0xD1A857",
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
        "step": 189931,
        "pc": "0x00596E",
        "prevPc": "0x005A82",
        "bc": "0x003D03",
        "hl": "0x000540",
        "de": "0x000005",
        "sp": "0xD1A854",
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
        "block": 189902,
        "step": 189932,
        "pc": "0x001713",
        "prevPc": "0x00596E",
        "bc": "0x003D03",
        "hl": "0x000540",
        "de": "0x000005",
        "sp": "0xD1A84B",
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
        "block": 189903,
        "step": 189933,
        "pc": "0x0008BB",
        "prevPc": "0x001713",
        "bc": "0x003D03",
        "hl": "0x000540",
        "de": "0x000005",
        "sp": "0xD1A848",
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
        "block": 189904,
        "step": 189934,
        "pc": "0x001717",
        "prevPc": "0x0008BB",
        "bc": "0x00A55A",
        "hl": "0x000000",
        "de": "0x000005",
        "sp": "0xD1A84B",
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
        "block": 189905,
        "step": 189935,
        "pc": "0x001718",
        "prevPc": "0x001717",
        "bc": "0x00A55A",
        "hl": "0x000000",
        "de": "0x000005",
        "sp": "0xD1A84B",
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
        "block": 189906,
        "step": 189936,
        "pc": "0x005974",
        "prevPc": "0x001718",
        "bc": "0x00A55A",
        "hl": "0x000000",
        "de": "0x000005",
        "sp": "0xD1A84E",
        "stack0": "0x000540",
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
        "step": 189937,
        "pc": "0x005998",
        "prevPc": "0x005974",
        "bc": "0x00A55A",
        "hl": "0x000540",
        "de": "0x000005",
        "sp": "0xD1A851",
        "stack0": "0x003033",
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
        "step": 189938,
        "pc": "0x005A8B",
        "prevPc": "0x005998",
        "bc": "0xFFFFFC",
        "hl": "0xD005A1",
        "de": "0xD005C5",
        "sp": "0xD1A857",
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
        "block": 189909,
        "step": 189939,
        "pc": "0x005A48",
        "prevPc": "0x005A8B",
        "bc": "0xFFFFFC",
        "hl": "0xD005A1",
        "de": "0xD005C5",
        "sp": "0xD1A854",
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
        "block": 189910,
        "step": 189940,
        "pc": "0x005A96",
        "prevPc": "0x005A48",
        "bc": "0xFFFFFC",
        "hl": "0xD005A1",
        "de": "0xD005C5",
        "sp": "0xD1A857",
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
        "step": 189941,
        "pc": "0x005A53",
        "prevPc": "0x005A96",
        "bc": "0xFFFFFC",
        "hl": "0xD005A1",
        "de": "0xD005C5",
        "sp": "0xD1A854",
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
        "block": 189912,
        "step": 189942,
        "pc": "0x005AA2",
        "prevPc": "0x005A53",
        "bc": "0xFFFFFC",
        "hl": "0x00000E",
        "de": "0xD005C5",
        "sp": "0xD1A857",
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
        "block": 189913,
        "step": 189943,
        "pc": "0x005AAE",
        "prevPc": "0x005AA2",
        "bc": "0xFFFFFC",
        "hl": "0x00000E",
        "de": "0xD0050C",
        "sp": "0xD1A857",
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
        "step": 189944,
        "pc": "0x005AE8",
        "prevPc": "0x005AAE",
        "bc": "0xFF10FC",
        "hl": "0xD61E9C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "step": 189945,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0500",
        "hl": "0xD61E9C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
        "stack0": "0xFF1005",
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
        "step": 189946,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD61EA6",
        "de": "0x0000FF",
        "sp": "0xD1A854",
        "stack0": "0xFF1005",
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
        "step": 189947,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0F05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "step": 189948,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0F05",
        "hl": "0xD6211C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "step": 189949,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0500",
        "hl": "0xD6211C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
        "stack0": "0xFF0F05",
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
        "step": 189950,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD62126",
        "de": "0x0000FF",
        "sp": "0xD1A854",
        "stack0": "0xFF0F05",
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
        "step": 189951,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0E05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "step": 189952,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0E05",
        "hl": "0xD6239C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "step": 189953,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0518",
        "hl": "0xD6239C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189924,
        "step": 189954,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD623A6",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189925,
        "step": 189955,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0D05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "step": 189956,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0D05",
        "hl": "0xD6261C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "step": 189957,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0578",
        "hl": "0xD6261C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189928,
        "step": 189958,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD62626",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189929,
        "step": 189959,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0C05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "step": 189960,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0C05",
        "hl": "0xD6289C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "step": 189961,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0560",
        "hl": "0xD6289C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189932,
        "step": 189962,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD628A6",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189933,
        "step": 189963,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0B05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "step": 189964,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0B05",
        "hl": "0xD62B1C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "step": 189965,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD62B1C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189936,
        "step": 189966,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD62B26",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189937,
        "step": 189967,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0A05",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "step": 189968,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0A05",
        "hl": "0xD62D9C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "step": 189969,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD62D9C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189940,
        "step": 189970,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD62DA6",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189941,
        "step": 189971,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0905",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "block": 189942,
        "step": 189972,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0905",
        "hl": "0xD6301C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "block": 189943,
        "step": 189973,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD6301C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189944,
        "step": 189974,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD63026",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189945,
        "step": 189975,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0805",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "block": 189946,
        "step": 189976,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0805",
        "hl": "0xD6329C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "block": 189947,
        "step": 189977,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C0",
        "hl": "0xD6329C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189948,
        "step": 189978,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD632A6",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189949,
        "step": 189979,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0705",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "block": 189950,
        "step": 189980,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0705",
        "hl": "0xD6351C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "block": 189951,
        "step": 189981,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05C8",
        "hl": "0xD6351C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189952,
        "step": 189982,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD63526",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189953,
        "step": 189983,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0605",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "block": 189954,
        "step": 189984,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0605",
        "hl": "0xD6379C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "block": 189955,
        "step": 189985,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05D8",
        "hl": "0xD6379C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189956,
        "step": 189986,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD637A6",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189957,
        "step": 189987,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0505",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "step": 189988,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0505",
        "hl": "0xD63A1C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "block": 189959,
        "step": 189989,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05F0",
        "hl": "0xD63A1C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189960,
        "step": 189990,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD63A26",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189961,
        "step": 189991,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0405",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "step": 189992,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0405",
        "hl": "0xD63C9C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "block": 189963,
        "step": 189993,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF05E0",
        "hl": "0xD63C9C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189964,
        "step": 189994,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD63CA6",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189965,
        "step": 189995,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0305",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "block": 189966,
        "step": 189996,
        "pc": "0x005AE8",
        "prevPc": "0x005AB6",
        "bc": "0xFF0305",
        "hl": "0xD63F1C",
        "de": "0xD40000",
        "sp": "0xD1A857",
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
        "block": 189967,
        "step": 189997,
        "pc": "0x005B16",
        "prevPc": "0x005AE8",
        "bc": "0xFF0560",
        "hl": "0xD63F1C",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189968,
        "step": 189998,
        "pc": "0x005B4B",
        "prevPc": "0x005B16",
        "bc": "0xFF0500",
        "hl": "0xD63F26",
        "de": "0x0000FF",
        "sp": "0xD1A854",
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
        "block": 189969,
        "step": 189999,
        "pc": "0x005AB6",
        "prevPc": "0x005B4B",
        "bc": "0xFF0205",
        "hl": "0xD005A0",
        "de": "0x0000FF",
        "sp": "0xD1A857",
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
        "block": 19863,
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
        "block": 19950,
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
        "block": 19956,
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
        "block": 20041,
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
        "block": 20128,
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
        "block": 20215,
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
        "block": 20302,
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
        "block": 20389,
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
        "block": 20476,
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
        "block": 20563,
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
        "block": 20650,
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
        "block": 20737,
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
        "block": 20824,
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
        "block": 20857,
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
        "block": 20940,
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
        "block": 20982,
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
        "block": 21065,
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
        "block": 101723,
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
        "block": 101806,
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
        "block": 101853,
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
        "block": 101936,
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
        "block": 181859,
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
        "block": 181942,
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
        "block": 181990,
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
        "block": 182076,
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
        "block": 182163,
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
        "block": 182250,
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
        "block": 182337,
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
        "block": 182424,
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
        "block": 182511,
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
        "block": 182598,
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
        "block": 182685,
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
        "block": 182772,
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
        "block": 182859,
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
        "block": 182946,
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
        "block": 183033,
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
        "block": 183120,
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
        "block": 183207,
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
        "block": 183294,
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
        "block": 183381,
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
        "block": 183468,
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
        "block": 183555,
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
        "block": 183642,
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
        "block": 183729,
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
        "block": 183816,
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
        "block": 183903,
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
        "block": 183991,
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
        "block": 184079,
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
        "block": 184167,
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
        "block": 184173,
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
        "block": 184258,
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
        "block": 184264,
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
        "block": 184349,
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
        "block": 184436,
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
        "block": 184523,
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
        "block": 184610,
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
        "block": 184697,
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
        "block": 184784,
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
        "block": 184871,
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
        "block": 184958,
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
        "block": 185045,
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
        "block": 185132,
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
        "block": 185219,
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
        "block": 185306,
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
        "block": 185393,
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
        "block": 185480,
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
        "block": 185567,
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
        "block": 185654,
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
        "block": 185741,
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
        "block": 185828,
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
        "block": 185915,
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
        "block": 186002,
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
        "block": 186089,
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
        "block": 186176,
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
        "block": 186264,
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
        "block": 186352,
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
        "block": 186440,
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
        "block": 186446,
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
        "block": 186531,
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
        "block": 186618,
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
        "block": 186705,
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
        "block": 186792,
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
        "block": 186879,
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
        "block": 186966,
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
        "block": 187053,
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
        "block": 187140,
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
        "block": 187227,
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
        "block": 187314,
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
        "block": 187401,
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
        "block": 187488,
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
        "block": 187575,
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
        "block": 187662,
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
        "block": 187749,
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
        "block": 187836,
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
        "block": 187923,
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
        "block": 188010,
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
        "block": 188097,
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
        "block": 188184,
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
        "block": 188271,
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
        "block": 188277,
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
        "block": 188362,
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
        "block": 188449,
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
        "block": 188536,
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
        "block": 188623,
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
        "block": 188710,
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
        "block": 188797,
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
        "block": 188884,
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
        "block": 188971,
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
        "block": 189058,
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
        "block": 189145,
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
        "block": 189232,
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
        "block": 189319,
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
        "block": 189406,
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
        "block": 189493,
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
        "block": 189580,
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
        "block": 189667,
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
        "block": 189703,
        "pc": "0x015864",
        "prevPc": "0x015856",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00595": {
            "before": "0x000004",
            "after": "0x000009"
          },
          "D00596": {
            "before": "0x000010",
            "after": "0x000001"
          }
        }
      },
      {
        "block": 189787,
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
        "block": 189875,
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
        "block": 189896,
        "pc": "0x015864",
        "prevPc": "0x015856",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00596": {
            "before": "0x000003",
            "after": "0x000001"
          }
        }
      }
    ]
  },
  "cdpPageErrors": []
}
```


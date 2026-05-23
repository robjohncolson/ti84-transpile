# Phase 420: Trace of `0x012456` ("USB Endpoint Setup")

## Summary

- Function boundary: `0x012456..0x01250F` (`0xBA` bytes / `186` decimal).
- Static caller scan finds **8 direct CALL sites**, and all eight push the same pair of stacked 24-bit arguments: `IX+9 = 1`, `IX+6 = 0`.
- Because of that fixed caller pattern, the **live ROM path never reaches the `0x3010` branch**. The link-port writes are present in the body, but they are skipped by `JR NZ,0x012507` at `0x0124BC`.
- The observed live path only touches `0x3080` (USB controller), clears `D14082`, and ends in `CALL 0x006E84` to clear bit 2 of `D00092`.
- This routine does **not** write any of the phase-310 endpoint families (`0x3160/61..0x316C/6D`, `0x3180/81..0x318C/8D`, `0x31A8..0x31AF`), so it is **not** a per-endpoint FIFO/configuration writer.

## Function Boundary

| Item | Value |
| --- | --- |
| Start | `0x012456` |
| End | `0x01250F` |
| Size | `0xBA` bytes (`186` decimal) |
| Exit | `RET` at `0x01250F` |
| Prologue | `CALL 0x00218A` frame helper |

## What Endpoints It Configures

Strictly speaking, **none of the numbered USB endpoints** are configured here.

The phase-310 endpoint/FIFO helpers showed that real endpoint programming uses:

- `0x3160/61`, `0x3164/65`, `0x3168/69`, `0x316C/6D` for IN endpoint config/status
- `0x3180/81`, `0x3184/85`, `0x3188/89`, `0x318C/8D` for OUT endpoint config/status
- `0x31A8..0x31AF` for FIFO map/config

`0x012456` touches **none** of those port families. Instead:

- `0x3080` behaves like a **USB controller/global control port**
- `0x3010` behaves like a **link-port/global link control port**

So the best fit is:

**`0x012456` is a controller/link-state sequencer, not an endpoint-config routine.**

## Port Writes

### Direct writes present in the function body

| Port | Site | Bit change | Status |
| --- | --- | --- | --- |
| `0x3080` | `0x012460` / `0x012462` | clear bit 7 (`RES 7`) | **live** |
| `0x3080` | `0x01248A` / `0x01248C` | set bit 5 (`SET 5`) | **live** |
| `0x3080` | `0x01249F` / `0x0124A1` | clear bit 4 (`RES 4`) | **live** |
| `0x3010` | `0x0124C4` / `0x0124C6` | clear bit 5 (`RES 5`) | dormant |
| `0x3010` | `0x0124D9` / `0x0124DB` | clear bit 4 (`RES 4`) | dormant |
| `0x3010` | `0x0124EE` / `0x0124F0` | clear bit 0 (`RES 0`) | dormant |

### Nested write if the dormant `0x3010` branch is taken

If execution reaches `0x0124FD`, the helper pushes `0` and calls `0x0123AD`. The direct body of `0x0123AD`:

- sets `0x3010` bit 1
- null-checks its own `IX+6` argument
- would only call `0x014E3F` if that argument were non-null

Because `0x012456` pushes `0` before calling `0x0123AD`, the installer half of `0x0123AD` is **bypassed** from this caller.

## RAM Variables Initialized

### Direct live-path writes

| Address | Write | Meaning |
| --- | --- | --- |
| `D14082` | `0` at `0x012470` | clears the service latch before controller bit sequencing |

### Direct helper effect on the live path

| Target | Effect | Meaning |
| --- | --- | --- |
| `0x006E84` | clears bit 2 of `D00092` (`IY+0x12`) | final flag clear before return |

### Dormant side-path effect

If `IX+9` were `0`, the `CALL 0x00D9EE` side path becomes reachable. That helper uses `0x3018`, `0x3015`, and `0x3014`, then zeroes:

- `D14078`
- `D14079`
- `D1407A`

No direct ROM caller currently uses that mode.

## CALL Targets

| Target | Reachability from current callers | Apparent purpose |
| --- | --- | --- |
| `0x00218A` | live | ZDS frame helper; establishes IX-frame access to stacked args at `IX+6` and `IX+9` |
| `0x00D9EE` | dormant | larger USB side-band/reset helper using `0x3018` / `0x3015` / `0x3014` and clearing `D14078..D1407A` |
| `0x006FAF` | dormant | low-level handshake helper on low ports `0x03` / `0x0C` / `0x0A` |
| `0x0123AD` | dormant | `0x3010` bit-1 helper; its deeper `0x014E3F` installer branch is bypassed from `0x012456` because the pushed argument is zero |
| `0x006E84` | live | clear `D00092` bit 2 helper |

## Overall Purpose Assessment

The name "USB endpoint setup" is misleading if interpreted as FIFO/descriptor programming.

What `0x012456` actually does on every statically observed ROM call is:

1. clear `0x3080` bit 7
2. clear `D14082`
3. set `0x3080` bit 5
4. clear `0x3080` bit 4
5. clear `D00092` bit 2 via `0x006E84`
6. return

The function body **does contain** a `0x3010` cleanup branch plus two extra helper calls, but the fixed caller arguments (`IX+9=1`, `IX+6=0`) skip that entire region in every direct ROM caller.

So the strongest conclusion is:

**`0x012456` is a small USB-controller/link-state re-arm helper. It resets a software latch (`D14082`), toggles three global control bits on `0x3080`, and clears one RAM flag byte through `0x006E84`. It does not configure numbered USB endpoints.**

## Probe Output

Reproduction command:

```bash
node TI-84_Plus_CE/probe-phase420-trace-012456.mjs
```

Probe output:

```text
# Phase 420 Probe: Static Trace of 0x012456

Function span: 0x012456..0x01250F (186 bytes, 91 decoded instructions)

Direct CALL sites to 0x012456:
- 0x008542 pushes arg1=0x000001 then arg0=0x000000 => IX+9=0x000001, IX+6=0x000000
- 0x008B96 pushes arg1=0x000001 then arg0=0x000000 => IX+9=0x000001, IX+6=0x000000
- 0x008BC5 pushes arg1=0x000001 then arg0=0x000000 => IX+9=0x000001, IX+6=0x000000
- 0x008E4E pushes arg1=0x000001 then arg0=0x000000 => IX+9=0x000001, IX+6=0x000000
- 0x00990D pushes arg1=0x000001 then arg0=0x000000 => IX+9=0x000001, IX+6=0x000000
- 0x009A77 pushes arg1=0x000001 then arg0=0x000000 => IX+9=0x000001, IX+6=0x000000
- 0x009A99 pushes arg1=0x000001 then arg0=0x000000 => IX+9=0x000001, IX+6=0x000000
- 0x009AE0 pushes arg1=0x000001 then arg0=0x000000 => IX+9=0x000001, IX+6=0x000000

Disassembly:
0x012456  CD 8A 21 00       CALL 0x00218A              ; ZDS frame helper; stacked args become IX+6 and IX+9 | function entry; 0x00218A sets IX frame for stacked 24-bit args
0x01245A  01 80 30 00       LD BC,0x003080
0x01245E  ED 78             IN A,(C)                   ; port read 0x3080 (USB controller)
0x012460  CB BF             RES 7,A                    ; USB controller 0x3080: clear bit 7
0x012462  ED 79             OUT (C),A                  ; port write 0x3080 (USB controller)
0x012464  78                LD A,B
0x012465  FE 30             CP 0x30
0x012467  28 01             JR Z,0x01246A
0x012469  CF                RST 0x08
0x01246A  79                LD A,C
0x01246B  FE 80             CP 0x80
0x01246D  20 FA             JR NZ,0x012469
0x01246F  AF                XOR A                      ; clear D14082 before any port sequencing
0x012470  32 82 40 D1       LD (0xD14082),A            ; RAM write 0xD14082 (service latch B / D14082)
0x012474  DD 7E 09          LD A,(IX+9)                ; read second stacked arg at IX+9
0x012477  B7                OR A
0x012478  20 0A             JR NZ,0x012484             ; NZ skips 0x00D9EE side path
0x01247A  01 01 00 00       LD BC,0x000001
0x01247E  C5                PUSH BC
0x01247F  CD EE D9 00       CALL 0x00D9EE              ; larger USB side-band helper (0x3015/0x3014/0x3018 family) | all direct callers avoid this helper by passing arg1=1
0x012483  C1                POP BC
0x012484  01 80 30 00       LD BC,0x003080
0x012488  ED 78             IN A,(C)                   ; port read 0x3080 (USB controller)
0x01248A  CB EF             SET 5,A                    ; USB controller 0x3080: set bit 5
0x01248C  ED 79             OUT (C),A                  ; port write 0x3080 (USB controller)
0x01248E  78                LD A,B
0x01248F  FE 30             CP 0x30
0x012491  28 01             JR Z,0x012494
0x012493  CF                RST 0x08
0x012494  79                LD A,C
0x012495  FE 80             CP 0x80
0x012497  20 FA             JR NZ,0x012493
0x012499  01 80 30 00       LD BC,0x003080
0x01249D  ED 78             IN A,(C)                   ; port read 0x3080 (USB controller)
0x01249F  CB A7             RES 4,A                    ; USB controller 0x3080: clear bit 4
0x0124A1  ED 79             OUT (C),A                  ; port write 0x3080 (USB controller)
0x0124A3  78                LD A,B
0x0124A4  FE 30             CP 0x30
0x0124A6  28 01             JR Z,0x0124A9
0x0124A8  CF                RST 0x08
0x0124A9  79                LD A,C
0x0124AA  FE 80             CP 0x80
0x0124AC  20 FA             JR NZ,0x0124A8
0x0124AE  DD 7E 06          LD A,(IX+6)                ; read first stacked arg at IX+6
0x0124B1  B7                OR A
0x0124B2  28 04             JR Z,0x0124B8              ; Z skips 0x006FAF and falls through
0x0124B4  CD AF 6F 00       CALL 0x006FAF              ; low-level handshake helper on low ports 0x03/0x0C/0x0A | all direct callers avoid this helper by passing arg0=0
0x0124B8  DD 7E 09          LD A,(IX+9)
0x0124BB  B7                OR A
0x0124BC  20 49             JR NZ,0x012507             ; NZ skips the entire 0x3010 cleanup branch
0x0124BE  01 10 30 00       LD BC,0x003010
0x0124C2  ED 78             IN A,(C)                   ; port read 0x3010 (link port)
0x0124C4  CB AF             RES 5,A                    ; link port 0x3010: clear bit 5
0x0124C6  ED 79             OUT (C),A                  ; port write 0x3010 (link port)
0x0124C8  78                LD A,B
0x0124C9  FE 30             CP 0x30
0x0124CB  28 01             JR Z,0x0124CE
0x0124CD  CF                RST 0x08
0x0124CE  79                LD A,C
0x0124CF  FE 10             CP 0x10
0x0124D1  20 FA             JR NZ,0x0124CD
0x0124D3  01 10 30 00       LD BC,0x003010
0x0124D7  ED 78             IN A,(C)                   ; port read 0x3010 (link port)
0x0124D9  CB A7             RES 4,A                    ; link port 0x3010: clear bit 4
0x0124DB  ED 79             OUT (C),A                  ; port write 0x3010 (link port)
0x0124DD  78                LD A,B
0x0124DE  FE 30             CP 0x30
0x0124E0  28 01             JR Z,0x0124E3
0x0124E2  CF                RST 0x08
0x0124E3  79                LD A,C
0x0124E4  FE 10             CP 0x10
0x0124E6  20 FA             JR NZ,0x0124E2
0x0124E8  01 10 30 00       LD BC,0x003010
0x0124EC  ED 78             IN A,(C)                   ; port read 0x3010 (link port)
0x0124EE  CB 87             RES 0,A                    ; link port 0x3010: clear bit 0
0x0124F0  ED 79             OUT (C),A                  ; port write 0x3010 (link port)
0x0124F2  78                LD A,B
0x0124F3  FE 30             CP 0x30
0x0124F5  28 01             JR Z,0x0124F8
0x0124F7  CF                RST 0x08
0x0124F8  79                LD A,C
0x0124F9  FE 10             CP 0x10
0x0124FB  20 FA             JR NZ,0x0124F7
0x0124FD  01 00 00 00       LD BC,0x000000             ; if reached, push 0 and call 0x0123AD; its installer branch is not taken from here
0x012501  C5                PUSH BC
0x012502  CD AD 23 01       CALL 0x0123AD              ; 0x3010 bit1 helper; installer branch exists but is bypassed here
0x012506  C1                POP BC
0x012507  CD 84 6E 00       CALL 0x006E84              ; clear D00092 bit2 helper | final helper clears D00092 bit 2
0x01250B  DD F9             LD SP,IX
0x01250D  DD E1             POP IX
0x01250F  C9                RET

Direct RAM writes:
- 0xD14082 (service latch B / D14082)

Direct port writes present in the function body:
- 0x012462 -> 0x3080
- 0x01248C -> 0x3080
- 0x0124A1 -> 0x3080
- 0x0124C6 -> 0x3010
- 0x0124DB -> 0x3010
- 0x0124F0 -> 0x3010

Direct call targets:
- 0x00218A (ZDS frame helper; stacked args become IX+6 and IX+9)
- 0x006E84 (clear D00092 bit2 helper)
- 0x006FAF (low-level handshake helper on low ports 0x03/0x0C/0x0A)
- 0x00D9EE (larger USB side-band helper (0x3015/0x3014/0x3018 family))
- 0x0123AD (0x3010 bit1 helper; installer branch exists but is bypassed here)

Live-path assessment from direct callers:
- Every direct caller passes IX+9=1 and IX+6=0.
- That means the 0x00D9EE branch is skipped, the 0x006FAF branch is skipped, and the JR NZ at 0x0124BC jumps over the entire 0x3010 cleanup block.
- The observed live path only touches port 0x3080 directly: clear bit 7, set bit 5, clear bit 4.
- The only direct RAM initialization in the live path is D14082=0, followed by the 0x006E84 helper clearing D00092 bit 2.
- No 0x316x/0x318x endpoint-family ports are touched here, so this is not a per-endpoint FIFO/config writer.
```

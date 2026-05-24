# Phase 428 - Trace 0x00CC71 Callers Report

## Summary

Three callers of the descriptor subsystem init wrapper at `0x00CC71` were traced. All three are **case handlers** within larger USB/Link event dispatch functions. None are called directly via `CALL` or `JP` from anywhere in the ROM -- they are reached via **jump tables** or computed jumps within their parent dispatchers.

## Caller A: 0x008A52 (params 0/2/0x7D0 = 2000)

- **Location**: Inside a large event dispatcher at ~0x008A32..0x008BE8
- **Function size**: 439 bytes, 185 instructions, ends with epilogue at 0x008BE1 (`LD A,(IX-1); LD SP,IX; POP IX; RET`)
- **No direct callers found** in full ROM scan -- reached via jump table
- **Parameter setup** (stack-based, C calling convention):
  ```
  LD BC,0x000000   ; arg1 = 0 (flags/mode)
  PUSH BC
  LD BC,0x000002   ; arg2 = 2 (descriptor count)
  PUSH BC
  LD BC,0x0007D0   ; arg3 = 2000 (timeout/size)
  PUSH BC
  CALL 0x00CC71
  POP BC; POP BC; POP BC  ; caller cleans 3 args
  ```
- **Post-call behavior**: Checks return value (CP 1), on success calls 0x00883C(2, 0x46), on failure calls 0x00883C(0x11, 0x86). Then JP 0x008BE1 (common epilogue).
- **Other significant calls in this function**:
  - `0x014FA0` -- called with arg 0xFA (250) and 0x23 (35), likely a delay/wait function
  - `0x00883C` -- called 7 times with various code pairs (status/event notification function)
  - `0x00DCB6` -- called twice (USB/link status check, returns boolean in A)
  - `0x00D681` -- called with arg 1 (connection state check)
  - `0x00D9EE` -- called with arg 1
  - `0x00B8BC` -- called with arg 0x0BB8 (3000) 
  - `0x012456` -- called twice with args (1, 0)
  - `0x0125EA` -- called twice with different args (0x12/0xC0 and 0x10/0xFF)
  - `0x012933` -- called once
  - `0x014E3F` -- called with arg 0x04B0 (1200)
- **Hardware I/O**: Reads port 0x3114 (USB status), sets bit 0, writes back. Also reads port 0x3082.
- **RAM accessed**:
  - Reads: 0xD14073, 0xD1440F, 0xD177B7
  - Writes: 0xD1440E (cleared to 0), 0xD14073 (set to 1), 0xD14082 (cleared to 0)
- **Loops**: Tight poll loop at 0x008B0F..0x008B13 (port 0x3114 verification), and wait loop at 0x008B1F..0x008B36 (port 0x3082 bit 4 + 0xD177B7 == 0x55 check)
- **Assessment**: This is a **USB initialization entry point**. The 2-descriptor / 2000-unit allocation, hardware port access (0x3114 = USB controller), and the extensive error-handling branches with status codes all point to USB subsystem startup.

## Caller B: 0x008EB5 (params 0/1/0x12C = 300)

- **Location**: Function at 0x008E7D..0x008F15
- **Function size**: 153 bytes, 68 instructions
- **Clean boundary found**: Function starts at 0x008E7D (RET at 0x008E7C)
- **No direct callers found** in full ROM scan -- reached via jump table
- **Parameter setup** (identical pattern):
  ```
  LD BC,0x000000   ; arg1 = 0 (flags/mode)
  PUSH BC
  LD BC,0x000001   ; arg2 = 1 (descriptor count)
  PUSH BC
  LD BC,0x00012C   ; arg3 = 300 (timeout/size)
  PUSH BC
  CALL 0x00CC71
  POP BC; POP BC; POP BC  ; caller cleans 3 args
  ```
- **Post-call behavior**: Checks return (CP 1), on success calls 0x00D681(1) to check connection state. Reads 0xD14072 for additional state. Various error paths call 0x00883C with status codes (0x10/0x81, 0x11/0x84, 0x11/0x85, 0x11/0x83).
- **Pre-call**: Clears 0xD1440E to 0, sends status 0x10/0x81 via 0x00883C
- **Other calls**:
  - `0x00883C` -- 5 times (status notifications)
  - `0x00D681` -- once with arg 1
- **RAM accessed**:
  - Reads: 0xD14072
  - Writes: 0xD1440E (cleared to 0)
- **Assessment**: This is a **Link/serial initialization entry point**. Single descriptor, smaller allocation (300 vs 2000), simpler flow (no hardware port access), and different status code set (0x84, 0x85 vs 0x46, 0x86) suggest a serial/link-cable connection path vs USB.

## Caller C: 0x0126F5 (params 0/1/0x3E8 = 1000)

- **Location**: Inside a function that spans at least 0x0126C3..0x01270A  
- **Function size**: ~54 bytes visible, 26 instructions (true start is earlier, before 0x0126C3)
- **No direct callers found** in full ROM scan -- reached via jump table
- **Parameter setup** (identical pattern):
  ```
  XOR A
  LD (0xD1440E),A  ; clear connection flag
  LD BC,0x000000   ; arg1 = 0
  PUSH BC
  LD BC,0x000001   ; arg2 = 1 (descriptor count)
  PUSH BC
  LD BC,0x0003E8   ; arg3 = 1000 (timeout/size)
  PUSH BC
  CALL 0x00CC71
  POP BC; POP BC; POP BC  ; caller cleans 3 args
  ```
- **Post-call behavior**: Minimal -- just checks if return is nonzero (OR A / JR Z), if success sets IX-1 to 1, then falls through to epilogue.
- **Pre-call context**: Has a wait loop at 0x0126C3..0x0126DA that reads 0xD1440F and 0xD177B7, comparing to 0x55 (same magic value as caller A's USB poll)
- **Only call target**: 0x00CC71 (the descriptor init itself)
- **RAM accessed**:
  - Writes: 0xD1440E (cleared to 0)
- **Assessment**: This is a **secondary link/USB initialization path**. The 1-descriptor / 1000-unit allocation is between USB (2000) and Link (300). The 0xD177B7 == 0x55 check shared with caller A suggests this handles a specific USB mode or alternate transport.

## Cross-Caller Patterns

| Property | Caller A (0x008A52) | Caller B (0x008EB5) | Caller C (0x0126F5) |
|----------|---------------------|---------------------|---------------------|
| arg1 (flags) | 0 | 0 | 0 |
| arg2 (count) | 2 | 1 | 1 |
| arg3 (size) | 2000 | 300 | 1000 |
| Clears 0xD1440E | Yes (later) | Yes (pre-call) | Yes (pre-call) |
| Checks 0xD14072/73 | 0xD14073 | 0xD14072 | -- |
| Uses 0x00883C | 7x | 5x | 0x |
| Hardware I/O | Yes (ports 3114, 3082) | No | No |
| Direct callers | None (jump table) | None (jump table) | None (jump table) |
| Parent function size | 439 bytes | 153 bytes | ~54+ bytes |
| Likely subsystem | USB | Link/serial | USB alt mode |

## Key Observations

1. **All three are jump-table targets**: No CALL or JP references found in the entire 4MB ROM. They are reached via computed jumps in event dispatchers (likely switch-case on event/command codes).

2. **Common calling convention**: All push 3 args on the stack (flags, count, size), CALL 0x00CC71, then POP 3 times. The return value is in A (compared with CP 1 or OR A).

3. **0xD1440E is a connection-active flag**: All three clear it to 0 before or during initialization. This likely prevents re-entrant init.

4. **0x00883C is a status/event notification function**: Called with 2 args (severity/type, code). Used extensively by callers A and B for progress/error reporting.

5. **arg2 (descriptor count)**: USB needs 2 descriptors (likely IN + OUT endpoints), Link/serial needs only 1.

6. **arg3 (size)**: Likely buffer size in bytes -- USB gets the largest (2000), alternate mode gets 1000, serial link gets 300. These match typical USB bulk transfer sizes (512-byte aligned for USB 2.0 vs smaller for serial).

## Probe File

`TI-84_Plus_CE/probe-phase428-trace-CC71-callers.mjs`

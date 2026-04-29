# Phase 25BE - Enter Event Loop Common Tail -> ParseInp

Date: 2026-04-29T03:07:11.295Z

## Setup

- Cold boot + kernel init + post-init
- MEM_INIT via JT slot 0x020164
- Input: "2+3" tokens [0x32, 0x70, 0x33, 0x3F] at userMem=0xD1A881
- begPC=curPC=0xD1A881, endPC=0xD1A885
- Allocator: FPSbase/FPS=0xD1A881, OPBase/OPS/pTemp/progPtr=0xD3FFFF
- Error frame at 0xD1A6EE, FAKE_RET=0xCECECE

## Results

| Scenario | Entry | Budget | Termination | Steps | Final PC | ParseInp hit | OP1 | errNo |
|----------|-------|--------|-------------|-------|----------|-------------|-----|-------|
| A: common-tail 0x0586CE | 0x0586CE | 10K | missing_block | 515 | 0x58C35B | true | 2 | 0x88 |
| B: direct ParseInp 0x099914 | 0x099914 | 2K | missing_block | 382 | 0x58C35B | true | 2 | 0x88 |

## Verdict

- Scenario A reached ParseInp: **true**
- Scenario A returned OP1=5.0: **false**
- Scenario B returned OP1=5.0: **false** (control)


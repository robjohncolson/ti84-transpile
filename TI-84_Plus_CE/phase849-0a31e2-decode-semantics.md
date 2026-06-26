# Phase 849: 0x0A31E2 / 0x0A31A2 Decode and Semantics Audit

Probe: `probe-phase849-0a31e2-decode-semantics.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase849-0a31e2-decode-semantics.mjs`

## Summary

- Result: PASS.
- `0x0A31E2` is the owner block; `0x0A31A2` is only the return tail reached after `JR 0x0A31A2`.
- Exact field-writing instruction: `0x0A31F2 ED B8 LDDR`, copying 0x24E0 bytes from 0xD00B0E..0xD02FED to 0xD00E2E..0xD0330D.
- All four watched fields are inside that destination range; the lifted source address for each field is dest-0x0320.
- Bug class: **C / wrong input state or wrong path into a correct block**.

## Decoded ROM Windows

### 0x0A31B8..0x0A31F6 upstream/copy path

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A31B8 | `E5` | `PUSH HL` |
| 0x0A31B9 | `C1` | `POP BC` |
| 0x0A31BA | `E1` | `POP HL` |
| 0x0A31BB | `EB` | `EX DE,HL` |
| 0x0A31BC | `E5` | `PUSH HL` |
| 0x0A31BD | `B7` | `OR A` |
| 0x0A31BE | `ED 52` | `SBC HL,DE` |
| 0x0A31C0 | `D1` | `POP DE` |
| 0x0A31C1 | `ED B8` | `LDDR` |
| 0x0A31C3 | `C1` | `POP BC` |
| 0x0A31C4 | `F1` | `POP AF` |
| 0x0A31C5 | `69` | `LD L,C` |
| 0x0A31C6 | `26 28` | `LD H,0x28` |
| 0x0A31C8 | `ED 6C` | `MLT HL` |
| 0x0A31CA | `E5` | `PUSH HL` |
| 0x0A31CB | `D6 1E` | `SUB 0x1E` |
| 0x0A31CD | `6F` | `LD L,A` |
| 0x0A31CE | `2C` | `INC L` |
| 0x0A31CF | `26 28` | `LD H,0x28` |
| 0x0A31D1 | `ED 6C` | `MLT HL` |
| 0x0A31D3 | `2B` | `DEC HL` |
| 0x0A31D4 | `11 F6 31 D0` | `LD DE,0xD031F6` |
| 0x0A31D8 | `FD CB 4A 5E` | `BIT 3,(IY+74)` |
| 0x0A31DC | `28 04` | `JR Z,0x0A31E2` |
| 0x0A31DE | `11 C6 52 D0` | `LD DE,0xD052C6` |
| 0x0A31E2 | `19` | `ADD HL,DE` |
| 0x0A31E3 | `EB` | `EX DE,HL` |
| 0x0A31E4 | `68` | `LD L,B` |
| 0x0A31E5 | `26 28` | `LD H,0x28` |
| 0x0A31E7 | `ED 6C` | `MLT HL` |
| 0x0A31E9 | `E5` | `PUSH HL` |
| 0x0A31EA | `C1` | `POP BC` |
| 0x0A31EB | `E1` | `POP HL` |
| 0x0A31EC | `EB` | `EX DE,HL` |
| 0x0A31ED | `E5` | `PUSH HL` |
| 0x0A31EE | `B7` | `OR A` |
| 0x0A31EF | `ED 52` | `SBC HL,DE` |
| 0x0A31F1 | `D1` | `POP DE` |
| 0x0A31F2 | `ED B8` | `LDDR` |
| 0x0A31F4 | `18 AC` | `JR 0x0A31A2` |

### 0x0A31E2 owner block

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A31E2 | `19` | `ADD HL,DE` |
| 0x0A31E3 | `EB` | `EX DE,HL` |
| 0x0A31E4 | `68` | `LD L,B` |
| 0x0A31E5 | `26 28` | `LD H,0x28` |
| 0x0A31E7 | `ED 6C` | `MLT HL` |
| 0x0A31E9 | `E5` | `PUSH HL` |
| 0x0A31EA | `C1` | `POP BC` |
| 0x0A31EB | `E1` | `POP HL` |
| 0x0A31EC | `EB` | `EX DE,HL` |
| 0x0A31ED | `E5` | `PUSH HL` |
| 0x0A31EE | `B7` | `OR A` |
| 0x0A31EF | `ED 52` | `SBC HL,DE` |
| 0x0A31F1 | `D1` | `POP DE` |
| 0x0A31F2 | `ED B8` | `LDDR` |
| 0x0A31F4 | `18 AC` | `JR 0x0A31A2` |

### 0x0A31A2 return tail

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A31A2 | `F1` | `POP AF` |
| 0x0A31A3 | `E0` | `RET PO` |
| 0x0A31A4 | `FB` | `EI` |
| 0x0A31A5 | `C9` | `RET` |

## Lifted JS Check

The emitted JS matches the decoded owner/tail structure in this window: `0x0A31E2` computes the copy endpoints, calls `cpu.lddr()`, then returns `0x0A31A2`; `0x0A31A2` only pops AF and checks `RET PO`.

```js
  // 0x0a31e2  19               add hl, de
  // 0x0a31ea  c1               pop bc
  cpu.bc = cpu.pop();
  // 0x0a31eb  e1               pop hl
  cpu.hl = cpu.pop();
  // 0x0a31ef  ed 52            sbc hl, de
  cpu.hl = cpu.subtractWithBorrowWord(cpu.hl, cpu.de);
  // 0x0a31f1  d1               pop de
  cpu.de = cpu.pop();
  // 0x0a31f2  ed b8            lddr
  cpu.lddr();
  // 0x0a31f4  18 ac            jr 0x0a31a2
  return 0x0a31a2;
function block_0a31a2_adl(cpu) {
  // 0x0a31a2  f1               pop af
  cpu.af = cpu.pop();
  // 0x0a31a3  e0               ret po
  if (cpu.checkCondition('po')) return cpu.popReturn();
```

## LDDR Range From Phase844 Entry/Exit State

```json
{
  "beforeCpu": {
    "pc": "0x0A31E2",
    "currentBlockPc": "0x0A31E2",
    "sp": "0xD1A815",
    "ix": "0xD02504",
    "iy": "0xD00080",
    "af": "0x0654",
    "bc": "0x00EC14",
    "de": "0xD031F6",
    "hl": "0x000117",
    "flags": {
      "z": true,
      "c": false
    },
    "fields": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CB",
      "D0243D": "0xD2A83D",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D00587": "0x00",
      "D0058C": "0x09",
      "D0058E": "0x00",
      "D00121": "0x000000",
      "D00124": "0x00"
    },
    "ixFrame": {
      "IX-6": "0x000000",
      "IX-3": "0x000000",
      "IX+0": "0x000000",
      "IX+3": "0x000000",
      "IX+6": "0x000000",
      "IX+9": "0x000000"
    }
  },
  "afterCpu": {
    "pc": "0x0A31A2",
    "currentBlockPc": "0x0A31A2",
    "sp": "0xD1A818",
    "ix": "0xD02504",
    "iy": "0xD00080",
    "af": "0x0680",
    "bc": "0x000000",
    "de": "0xD00E2D",
    "hl": "0xD00B0D",
    "flags": {
      "z": false,
      "c": false
    },
    "fields": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0x000000",
      "D0259D": "0x000000",
      "D02A29": "0x0000",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D00587": "0x00",
      "D0058C": "0x09",
      "D0058E": "0x00",
      "D00121": "0x000000",
      "D00124": "0x00"
    },
    "ixFrame": {
      "IX-6": "0x000000",
      "IX-3": "0x000000",
      "IX+0": "0x000000",
      "IX+3": "0x000000",
      "IX+6": "0x000000",
      "IX+9": "0x000000"
    }
  },
  "copyPlan": {
    "beforeB": 236,
    "count": 9440,
    "countHex": "0x24E0",
    "destStart": "0xD00E2E",
    "destEnd": "0xD0330D",
    "sourceStart": "0xD00B0E",
    "sourceEnd": "0xD02FED",
    "destEndFromBefore": "0xD0330D",
    "destEndMatches": true,
    "delta": "0x0320"
  }
}
```

## Field / Capture Comparison

| Field | Dest | Source copied by lifted LDDR | In dest range | Phase844 before -> after | Real before -> after | Real source before -> after |
| --- | --- | --- | --- | --- | --- | --- |
| D0243A | 0xD0243A | 0xD0211A | yes | 0xD1A8CB -> 0x000000 | 0xD1A8CD -> 0xD1A8CC | 0x000000 -> 0x000000 |
| D0243D | 0xD0243D | 0xD0211D | yes | 0xD2A83D -> 0x000000 | 0xD2A83E -> 0xD2A83E | 0x000000 -> 0x000000 |
| D02590 | 0xD02590 | 0xD02270 | yes | 0xD3FE81 -> 0x000000 | 0xD3FE81 -> 0xD3FE81 | 0x108000 -> 0x108000 |
| D0259D | 0xD0259D | 0xD0227D | yes | 0xD3FECD -> 0x000000 | 0xD3FECD -> 0xD3FECD | 0x000000 -> 0x000000 |

## Classification

- Not **B / decoder bug** in this window: raw bytes decode coherently as the same instructions the lifted block comments show, including `ED B8` as `LDDR` and `F1 E0` as `POP AF; RET PO`.
- Not **A / local emitted-op mismatch** in this window: the lifted JS directly implements the decoded `LDDR` and return tail; the zeroing follows from its computed copy range and source bytes.
- Classified as **C / wrong input state or wrong path into a correct block**: with the captured lifted entry state, the copy source for the watched fields is lower RAM (`D0211A/D0211D/D02270/D0227D`) rather than the live cursor/VAT values. Real hardware after CLEAR keeps/retracts those fields, so a later fix should trace why the lifted route reaches `0x0A31E2` with this B/count/source-stack setup, or why upstream state differs before this copy.

## Machine Summary

```json
{
  "pass": true,
  "bugClass": "C / wrong input state or wrong path into a correct block",
  "checks": {
    "decodedOwnerHasLddr": true,
    "decodedTailIsPopAfRetPo": true,
    "liftedOwnerHasLddr": true,
    "liftedOwnerJumpsToTail": true,
    "liftedTailOnlyReturnLogic": true,
    "destEndMatchesPhase844After": true,
    "watchedFieldsAllInCopyDest": true,
    "realAfterWatchedFieldsNonZero": true,
    "phase844WatchedFieldsZeroed": true
  },
  "oneLineDecode": "0x0A31E2 ADD HL,DE; 0x0A31E3 EX DE,HL; 0x0A31E4 LD L,B; 0x0A31E5 LD H,0x28; 0x0A31E7 MLT HL; 0x0A31E9 PUSH HL; 0x0A31EA POP BC; 0x0A31EB POP HL; 0x0A31EC EX DE,HL; 0x0A31ED PUSH HL; 0x0A31EE OR A; 0x0A31EF SBC HL,DE; 0x0A31F1 POP DE; 0x0A31F2 LDDR; 0x0A31F4 JR 0x0A31A2"
}
```

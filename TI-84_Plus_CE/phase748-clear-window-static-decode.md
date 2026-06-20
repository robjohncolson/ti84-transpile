# Phase 748: CLEAR/EOL Static Window Decode

Probe: `probe-phase748-clear-window-static-decode.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase748-clear-window-static-decode.mjs`  
Exit: 0

## Summary

- **** Static checks passed for the local CLEAR/EOL route from `0x058A16` into `0x0A223A`, through the `0x0A229D` BC-owner sequence, and into the `0x0A22A4` space-fill tail.
- **** The ROM bytes show the exact BC-zero propagation mechanism: `0x0A2299` calls the `0x0A2A37` A-to-HL multiplier, then `0x0A229E-0x0A229F` copies that returned `HL` into `BC` with `PUSH HL; POP BC` before the final tail call.
- *** The space-fill tail at `0x0A22A4` anchors at `D006C0`, makes `DE=HL+1`, stores `0x20`, then executes `LDIR`; this matches the earlier phase744/745 dynamic `0x202020` corruption when the inherited count is zero.
- No runtime, transpiler, browser, scheduler, or follow-along files were modified.

## Critical Checks

| Check | PC | Pass | Decode |
|---|---|---|---|
| home redraw caller reaches CLEAR/EOL local routine | 0x058A16 | yes | `CALL 0x0A223A` |
| local routine explicitly seeds HL with zero | 0x0A226D | yes | `LD HL,0x000000` |
| local routine sets DE to last display column/address parameter 0x00013F | 0x0A2272 | yes | `LD DE,0x00013F` |
| text helper is called after HL=0 and DE=0x00013F are prepared | 0x0A2276 | yes | `CALL 0x09EF20` |
| first size-to-HL helper returns to 0x0A229D | 0x0A2299 | yes | `CALL 0x0A2A37` |
| second pass loads A from B before recomputing the tail offset | 0x0A229D | yes | `LD A,B` |
| HL result is pushed | 0x0A229E | yes | `PUSH HL` |
| HL result is popped into BC, making BC inherit a zero HL result | 0x0A229F | yes | `POP BC` |
| second size-to-HL helper returns to the space-fill tail | 0x0A22A0 | yes | `CALL 0x0A2A37` |
| space-fill tail anchors at D006C0 | 0x0A22A4 | yes | `LD DE,0xD006C0` |
| space-fill tail performs the block copy | 0x0A22AE | yes | `LDIR` |
| helper takes A into L | 0x0A2A37 | yes | `LD L,A` |
| helper loads multiplier 0x1A into H | 0x0A2A38 | yes | `LD H,0x1A` |
| helper multiplies H*L into HL | 0x0A2A3A | yes | `MLT HL` |

## Static Data Path

| Step | Decode | Static meaning |
|---|---|---|
| 0x058A16 | `CALL 0x0A223A` | Home redraw path enters the local CLEAR/EOL text-window routine. |
| 0x0A226D | `LD HL,0` | The local routine has an explicit zero base for the subsequent size/offset calculation. |
| 0x0A2272 | `LD DE,0x00013F` | The right-edge/display parameter is prepared independently of BC. |
| 0x0A2299 | `CALL 0x0A2A37` | The helper converts the current A delta into an HL byte count/offset. Phase745 dynamically proved this returns HL=0 at 0x0A229D in the failing browser path. |
| 0x0A229E-0x0A229F | `PUSH HL; POP BC` | The returned HL value is copied into BC. If HL is zero, BC becomes zero before the final tail call. |
| 0x0A22A0 | `CALL 0x0A2A37` | With A loaded from B, the same helper recomputes the final HL offset for the tail. |
| 0x0A22A4-0x0A22B0 | `D006C0 + HL; LD (HL),0x20; LDIR; RET` | The tail uses HL as the D006C0 offset and BC as the space-fill count. A zero BC is the static route into the old 0x202020 corruption. |

## Direct CALL Scan

| Target | Direct CALL sites |
|---|---|
| 0x0A223A | 0x0244F8, 0x024530, 0x0298E7, 0x03DCC1, 0x03F280, 0x03F2AF, 0x058493, 0x058A16, 0x058BBF, 0x05FE34, 0x06B457, 0x079CF1, 0x080CCA, 0x086BD7, 0x09C8CD, 0x09CD4C, 0x09CDAC, 0x09CE59, 0x09DC51, 0x09E2F4, 0x09E378, 0x09E3C8, 0x0A8B5F, 0x0AB734, 0x0ADB87, 0x0B37CC, 0x0B89E5, 0x0B8A88, 0x0B8F79, 0x0BA9FD |
| 0x0A235E | 0x0237E3, 0x028CA7, 0x029809, 0x029E06, 0x03D3D0, 0x03DFCC, 0x03E0CB, 0x03EF76, 0x03F2C6, 0x04558A, 0x0455CE, 0x04E55E, 0x058364, 0x058DFD, 0x05CD09, 0x060754, 0x06B44E, 0x08A93D, 0x08C2D7, 0x092AAB, 0x09C8E9, 0x09DEB6, 0x09DF85, 0x09E08B, 0x0A223A, 0x0A5F9F, 0x0A62D1, 0x0A8BF0, 0x0A8DC2, 0x0AE48E, 0x0B1A81, 0x0B9064 |
| 0x09EF20 | 0x026784, 0x026BF4, 0x026CED, 0x027198, 0x0271FF, 0x04EA54, 0x051CED, 0x051DB9, 0x05833E, 0x0583C9, 0x06DAAA, 0x06FF24, 0x076E0A, 0x07838C, 0x07B1D4, 0x08106E, 0x08200D, 0x08664F, 0x0877D0, 0x0878EC, 0x088E8F, 0x08ACA4, 0x08C24A, 0x09797B, 0x098092, 0x0A21E0, 0x0A2276, 0x0A22F0, 0x0A2D3C, 0x0A3270, 0x0A6466, 0x0A899C, 0x0A8A67, 0x0AC151, 0x0B2B41, 0x0B420E, 0x0B42AA, 0x0B44D0, 0x0B660E, 0x0B7337, 0x0BA058, 0x0BA579, 0x0BBD7B, 0x0BC7B2 |
| 0x026789 | 0x0583D3, 0x081078, 0x082017, 0x097985, 0x0A66AF |
| 0x0A2A37 | 0x0A20AE, 0x0A212F, 0x0A2147, 0x0A2299, 0x0A22A0, 0x0A2310, 0x0A2385, 0x0A296E, 0x0A3277, 0x0A328F |
| 0x0A22A4 | (none) |

## Static Decode

### caller into CLEAR window 0x058A0C-0x058A21

| PC | Bytes | Decode | Target | Fallthrough |
|---|---|---|---|---|
| 0x058A0C | `FE 09` | `CP 0x09` | - | - |
| 0x058A0E | `20 50` | `JR NZ,0x058A60` | 0x058A60 | 0x058A10 |
| 0x058A10 | `CD 12 82 05` | `CALL 0x058212` | 0x058212 | 0x058A14 |
| 0x058A14 | `20 16` | `JR NZ,0x058A2C` | 0x058A2C | 0x058A16 |
| 0x058A16 | `CD 3A 22 0A` | `CALL 0x0A223A` | 0x0A223A | 0x058A1A |
| 0x058A1A | `FD CB 49 BE` | `RES 7,(IY+73)` | - | - |
| 0x058A1E | `CD 54 8D 05` | `CALL 0x058D54` | 0x058D54 | 0x058A22 |

### CLEAR/EOL local window 0x0A223A-0x0A22B0

| PC | Bytes | Decode | Target | Fallthrough |
|---|---|---|---|---|
| 0x0A223A | `CD 5E 23 0A` | `CALL 0x0A235E` | 0x0A235E | 0x0A223E |
| 0x0A223E | `3A 04 25 D0` | `LD A,(0xD02504)` | - | - |
| 0x0A2242 | `F5` | `PUSH AF` | - | - |
| 0x0A2243 | `CD A0 00 08` | `CALL 0x0800A0` | 0x0800A0 | 0x0A2247 |
| 0x0A2247 | `28 08` | `JR Z,0x0A2251` | 0x0A2251 | 0x0A2249 |
| 0x0A2249 | `FE 06` | `CP 0x06` | - | - |
| 0x0A224B | `20 09` | `JR NZ,0x0A2256` | 0x0A2256 | 0x0A224D |
| 0x0A224D | `3E 9B` | `LD A,0x9B` | - | - |
| 0x0A224F | `18 09` | `JR 0x0A225A` | 0x0A225A | - |
| 0x0A2251 | `B7` | `OR A` | - | - |
| 0x0A2252 | `20 02` | `JR NZ,0x0A2256` | 0x0A2256 | 0x0A2254 |
| 0x0A2254 | `3E 1E` | `LD A,0x1E` | - | - |
| 0x0A2256 | `C4 4C 2D 0A` | `CALL NZ,0x0A2D4C` | 0x0A2D4C | 0x0A225A |
| 0x0A225A | `47` | `LD B,A` | - | - |
| 0x0A225B | `3A 05 25 D0` | `LD A,(0xD02505)` | - | - |
| 0x0A225F | `FE 0A` | `CP 0x0A` | - | - |
| 0x0A2261 | `20 04` | `JR NZ,0x0A2267` | 0x0A2267 | 0x0A2263 |
| 0x0A2263 | `3E EF` | `LD A,0xEF` | - | - |
| 0x0A2265 | `18 06` | `JR 0x0A226D` | 0x0A226D | - |
| 0x0A2267 | `CD 4C 2D 0A` | `CALL 0x0A2D4C` | 0x0A2D4C | 0x0A226B |
| 0x0A226B | `D6 02` | `SUB 0x02` | - | - |
| 0x0A226D | `21 00 00 00` | `LD HL,0x000000` | - | - |
| 0x0A2271 | `4F` | `LD C,A` | - | - |
| 0x0A2272 | `11 3F 01 00` | `LD DE,0x00013F` | - | - |
| 0x0A2276 | `CD 20 EF 09` | `CALL 0x09EF20` | 0x09EF20 | 0x0A227A |
| 0x0A227A | `F1` | `POP AF` | - | - |
| 0x0A227B | `FD CB 0D 4E` | `BIT 1,(IY+13)` | - | - |
| 0x0A227F | `C8` | `RET Z` | - | 0x0A2280 |
| 0x0A2280 | `F5` | `PUSH AF` | - | - |
| 0x0A2281 | `FD CB 4C C6` | `SET 0,(IY+76)` | - | - |
| 0x0A2285 | `3E 02` | `LD A,0x02` | - | - |
| 0x0A2287 | `FD CB 4C 6E` | `BIT 5,(IY+76)` | - | - |
| 0x0A228B | `CC 89 67 02` | `CALL Z,0x026789` | 0x026789 | 0x0A228F |
| 0x0A228F | `FD CB 4C 86` | `RES 0,(IY+76)` | - | - |
| 0x0A2293 | `C1` | `POP BC` | - | - |
| 0x0A2294 | `3A 05 25 D0` | `LD A,(0xD02505)` | - | - |
| 0x0A2298 | `90` | `SUB B` | - | - |
| 0x0A2299 | `CD 37 2A 0A` | `CALL 0x0A2A37` | 0x0A2A37 | 0x0A229D |
| 0x0A229D | `78` | `LD A,B` | - | - |
| 0x0A229E | `E5` | `PUSH HL` | - | - |
| 0x0A229F | `C1` | `POP BC` | - | - |
| 0x0A22A0 | `CD 37 2A 0A` | `CALL 0x0A2A37` | 0x0A2A37 | 0x0A22A4 |
| 0x0A22A4 | `11 C0 06 D0` | `LD DE,0xD006C0` | - | - |
| 0x0A22A8 | `19` | `ADD HL,DE` | - | - |
| 0x0A22A9 | `E5` | `PUSH HL` | - | - |
| 0x0A22AA | `D1` | `POP DE` | - | - |
| 0x0A22AB | `13` | `INC DE` | - | - |
| 0x0A22AC | `36 20` | `LD (HL),0x20` | - | - |
| 0x0A22AE | `ED B0` | `LDIR` | - | - |
| 0x0A22B0 | `C9` | `RET` | - | - |

### row/offset helper 0x0A2A37-0x0A2A3D

| PC | Bytes | Decode | Target | Fallthrough |
|---|---|---|---|---|
| 0x0A2A37 | `6F` | `LD L,A` | - | - |
| 0x0A2A38 | `26 1A` | `LD H,0x1A` | - | - |
| 0x0A2A3A | `ED 6C` | `MLT HL` | - | - |
| 0x0A2A3C | `B7` | `OR A` | - | - |
| 0x0A2A3D | `C9` | `RET` | - | - |

### text output helper return edge 0x09EF20-0x09EF34

| PC | Bytes | Decode | Target | Fallthrough |
|---|---|---|---|---|
| 0x09EF20 | `E5` | `PUSH HL` | - | - |
| 0x09EF21 | `40 21 FF FF` | `LD HL,0x00FFFF` | - | - |
| 0x09EF25 | `40 22 C0 2A` | `ld-pair-mem {"pc":651045,"length":4,"nextPc":651049,"tag":"ld-pair-mem","pair":"hl","addr":10944,"direction":"to-mem","mode":"adl","modePrefix":"sis"}` | - | - |
| 0x09EF29 | `E1` | `POP HL` | - | - |
| 0x09EF2A | `CD 44 EF 09` | `CALL 0x09EF44` | 0x09EF44 | 0x09EF2E |
| 0x09EF2E | `C9` | `RET` | - | - |
| 0x09EF2F | `50` | `LD D,B` | - | - |
| 0x09EF30 | `79` | `LD A,C` | - | - |
| 0x09EF31 | `74` | `ld-ind-reg {"pc":651057,"length":1,"nextPc":651058,"tag":"ld-ind-reg","dest":"hl","src":"h","mode":"adl","modePrefix":null}` | - | - |
| 0x09EF32 | `68` | `LD L,B` | - | - |
| 0x09EF33 | `6F` | `LD L,A` | - | - |
| 0x09EF34 | `6E` | `ld-reg-ind {"pc":651060,"length":1,"nextPc":651061,"tag":"ld-reg-ind","dest":"l","src":"hl","mode":"adl","modePrefix":null}` | - | - |

## Compact Evidence

```json
{
  "pass": true,
  "checks": [
    {
      "pc": "0x058A16",
      "description": "home redraw caller reaches CLEAR/EOL local routine",
      "pass": true,
      "asm": "CALL 0x0A223A",
      "bytes": "CD 3A 22 0A"
    },
    {
      "pc": "0x0A226D",
      "description": "local routine explicitly seeds HL with zero",
      "pass": true,
      "asm": "LD HL,0x000000",
      "bytes": "21 00 00 00"
    },
    {
      "pc": "0x0A2272",
      "description": "local routine sets DE to last display column/address parameter 0x00013F",
      "pass": true,
      "asm": "LD DE,0x00013F",
      "bytes": "11 3F 01 00"
    },
    {
      "pc": "0x0A2276",
      "description": "text helper is called after HL=0 and DE=0x00013F are prepared",
      "pass": true,
      "asm": "CALL 0x09EF20",
      "bytes": "CD 20 EF 09"
    },
    {
      "pc": "0x0A2299",
      "description": "first size-to-HL helper returns to 0x0A229D",
      "pass": true,
      "asm": "CALL 0x0A2A37",
      "bytes": "CD 37 2A 0A"
    },
    {
      "pc": "0x0A229D",
      "description": "second pass loads A from B before recomputing the tail offset",
      "pass": true,
      "asm": "LD A,B",
      "bytes": "78"
    },
    {
      "pc": "0x0A229E",
      "description": "HL result is pushed",
      "pass": true,
      "asm": "PUSH HL",
      "bytes": "E5"
    },
    {
      "pc": "0x0A229F",
      "description": "HL result is popped into BC, making BC inherit a zero HL result",
      "pass": true,
      "asm": "POP BC",
      "bytes": "C1"
    },
    {
      "pc": "0x0A22A0",
      "description": "second size-to-HL helper returns to the space-fill tail",
      "pass": true,
      "asm": "CALL 0x0A2A37",
      "bytes": "CD 37 2A 0A"
    },
    {
      "pc": "0x0A22A4",
      "description": "space-fill tail anchors at D006C0",
      "pass": true,
      "asm": "LD DE,0xD006C0",
      "bytes": "11 C0 06 D0"
    },
    {
      "pc": "0x0A22AE",
      "description": "space-fill tail performs the block copy",
      "pass": true,
      "asm": "LDIR",
      "bytes": "ED B0"
    },
    {
      "pc": "0x0A2A37",
      "description": "helper takes A into L",
      "pass": true,
      "asm": "LD L,A",
      "bytes": "6F"
    },
    {
      "pc": "0x0A2A38",
      "description": "helper loads multiplier 0x1A into H",
      "pass": true,
      "asm": "LD H,0x1A",
      "bytes": "26 1A"
    },
    {
      "pc": "0x0A2A3A",
      "description": "helper multiplies H*L into HL",
      "pass": true,
      "asm": "MLT HL",
      "bytes": "ED 6C"
    }
  ],
  "directCalls": {
    "0x0A223A": [
      "0x0244F8",
      "0x024530",
      "0x0298E7",
      "0x03DCC1",
      "0x03F280",
      "0x03F2AF",
      "0x058493",
      "0x058A16",
      "0x058BBF",
      "0x05FE34",
      "0x06B457",
      "0x079CF1",
      "0x080CCA",
      "0x086BD7",
      "0x09C8CD",
      "0x09CD4C",
      "0x09CDAC",
      "0x09CE59",
      "0x09DC51",
      "0x09E2F4",
      "0x09E378",
      "0x09E3C8",
      "0x0A8B5F",
      "0x0AB734",
      "0x0ADB87",
      "0x0B37CC",
      "0x0B89E5",
      "0x0B8A88",
      "0x0B8F79",
      "0x0BA9FD"
    ],
    "0x0A235E": [
      "0x0237E3",
      "0x028CA7",
      "0x029809",
      "0x029E06",
      "0x03D3D0",
      "0x03DFCC",
      "0x03E0CB",
      "0x03EF76",
      "0x03F2C6",
      "0x04558A",
      "0x0455CE",
      "0x04E55E",
      "0x058364",
      "0x058DFD",
      "0x05CD09",
      "0x060754",
      "0x06B44E",
      "0x08A93D",
      "0x08C2D7",
      "0x092AAB",
      "0x09C8E9",
      "0x09DEB6",
      "0x09DF85",
      "0x09E08B",
      "0x0A223A",
      "0x0A5F9F",
      "0x0A62D1",
      "0x0A8BF0",
      "0x0A8DC2",
      "0x0AE48E",
      "0x0B1A81",
      "0x0B9064"
    ],
    "0x09EF20": [
      "0x026784",
      "0x026BF4",
      "0x026CED",
      "0x027198",
      "0x0271FF",
      "0x04EA54",
      "0x051CED",
      "0x051DB9",
      "0x05833E",
      "0x0583C9",
      "0x06DAAA",
      "0x06FF24",
      "0x076E0A",
      "0x07838C",
      "0x07B1D4",
      "0x08106E",
      "0x08200D",
      "0x08664F",
      "0x0877D0",
      "0x0878EC",
      "0x088E8F",
      "0x08ACA4",
      "0x08C24A",
      "0x09797B",
      "0x098092",
      "0x0A21E0",
      "0x0A2276",
      "0x0A22F0",
      "0x0A2D3C",
      "0x0A3270",
      "0x0A6466",
      "0x0A899C",
      "0x0A8A67",
      "0x0AC151",
      "0x0B2B41",
      "0x0B420E",
      "0x0B42AA",
      "0x0B44D0",
      "0x0B660E",
      "0x0B7337",
      "0x0BA058",
      "0x0BA579",
      "0x0BBD7B",
      "0x0BC7B2"
    ],
    "0x026789": [
      "0x0583D3",
      "0x081078",
      "0x082017",
      "0x097985",
      "0x0A66AF"
    ],
    "0x0A2A37": [
      "0x0A20AE",
      "0x0A212F",
      "0x0A2147",
      "0x0A2299",
      "0x0A22A0",
      "0x0A2310",
      "0x0A2385",
      "0x0A296E",
      "0x0A3277",
      "0x0A328F"
    ],
    "0x0A22A4": []
  }
}
```

## Interpretation

The missing piece after phase745 was not another browser route fork; it was a concise static explanation of how a zero size reaches the old tail. The local window first computes a display/text span, then reuses `0x0A2A37` as an A-to-HL multiplier. The decisive ownership sequence is `CALL 0x0A2A37; LD A,B; PUSH HL; POP BC; CALL 0x0A2A37`: the first helper result becomes the second helper count through BC. When the first helper returns `HL=0` in the failing dynamic path already captured by phase745, the tail is entered with `BC=0` and `HL=0`, so the `D006C0` space-fill LDIR overruns state and the eventual return target becomes `0x202020`.


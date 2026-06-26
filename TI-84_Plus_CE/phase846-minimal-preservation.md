# Phase 846: Minimal Preservation / Side-Effect Isolation

Probe: `probe-phase846-minimal-preservation.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase846-minimal-preservation.mjs`

## Summary

- Bounded probe-local cases ran from the same faithful physical CLEAR setup as Phase845: OS launch-home + repaint, `D0243A=0xD1A8CC`, `D0243D=0xD2A83E`, CLEAR scancode `0x0F`, and no browser `0x0A229D` pre-stop.
- The Phase846 split varies only the fields restored at known owner boundaries: `0x0A31E2 -> 0x0A31A2` for edit/VAT fields and `0x001879 -> 0x0018F8` for cxMain/anchor fields.
- Source modes are explicit: `previous-block` replays values observed immediately before the owner clear; `override-target` writes the hardware oracle target values from the real after-CLEAR capture.
- Route-compatible cases that still reached `0x006Dxx`: `baseline-current`, `preserve-vat-prev`, `preserve-d02590-prev`, `preserve-d0259d-prev`, `preserve-d0243d-prev`, `preserve-d007ca-oracle`, `preserve-d008e0-oracle`, `preserve-cx-oracle`.
- Cases diverted before `0x006Dxx` into the bounded `0x0A1854` loop: `preserve-edit-vat-prev`, `preserve-edit-prev`, `preserve-d0243a-prev`, `preserve-edit-oracle`, `preserve-edit-vat-oracle`.
- Best oracle match: `preserve-edit-vat-prev` with 7/10 fields matching `captures/realram-home-afterCLEAR-D00000-D657FF.bin`. Overall probe result: PASS.

## Case Matrix

| Case | Route | Termination | Steps | Preserves | Low 0x006D Hits | First Exit | 0x001879/0x0018F8 | Oracle | Top PCs | Final Core Fields |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- | --- |
| baseline-current | reaches-006dxx | first-post-006dxx-exit | 20472 | 0 | 23 | 0x0064DE | 1/1 | 4/10 | 0x09EFDE:2880<br>0x005AE8:1392<br>0x005B16:1392 | D007CA=0x000000<br>D008E0=0x000000<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-edit-vat-prev | hot-loop-0A1854-threshold | hot-loop-0A1854-threshold | 15036 | 1 | 0 | - | 0/0 | 7/10 | 0x09EFDE:2880<br>0x0A19A4:560<br>0x0A1854:512 | D007CA=0x0585E9<br>D008E0=0xD1A863<br>D0243A=0xD1A8B5<br>D0243D=0xD2A827<br>D02590=0xD3FE81<br>D0259D=0xD3FECD<br>D02A29=0x0000 |
| preserve-vat-prev | reaches-006dxx | first-post-006dxx-exit | 20472 | 1 | 23 | 0x0064DE | 1/1 | 4/10 | 0x09EFDE:2880<br>0x005AE8:1392<br>0x005B16:1392 | D007CA=0x000000<br>D008E0=0x000000<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-d02590-prev | reaches-006dxx | first-post-006dxx-exit | 20472 | 1 | 23 | 0x0064DE | 1/1 | 4/10 | 0x09EFDE:2880<br>0x005AE8:1392<br>0x005B16:1392 | D007CA=0x000000<br>D008E0=0x000000<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-d0259d-prev | reaches-006dxx | first-post-006dxx-exit | 20472 | 1 | 23 | 0x0064DE | 1/1 | 4/10 | 0x09EFDE:2880<br>0x005AE8:1392<br>0x005B16:1392 | D007CA=0x000000<br>D008E0=0x000000<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-edit-prev | hot-loop-0A1854-threshold | hot-loop-0A1854-threshold | 15036 | 1 | 0 | - | 0/0 | 5/10 | 0x09EFDE:2880<br>0x0A19A4:560<br>0x0A1854:512 | D007CA=0x0585E9<br>D008E0=0xD1A863<br>D0243A=0xD1A8B5<br>D0243D=0xD2A827<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-d0243a-prev | hot-loop-0A1854-threshold | hot-loop-0A1854-threshold | 15036 | 1 | 0 | - | 0/0 | 5/10 | 0x09EFDE:2880<br>0x0A19A4:560<br>0x0A1854:512 | D007CA=0x0585E9<br>D008E0=0xD1A863<br>D0243A=0xD1A8B5<br>D0243D=0xFFFFEA<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-d0243d-prev | reaches-006dxx | first-post-006dxx-exit | 20472 | 1 | 23 | 0x0064DE | 1/1 | 4/10 | 0x09EFDE:2880<br>0x005AE8:1392<br>0x005B16:1392 | D007CA=0x000000<br>D008E0=0x000000<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-edit-oracle | hot-loop-0A1854-threshold | hot-loop-0A1854-threshold | 15036 | 1 | 0 | - | 0/0 | 5/10 | 0x09EFDE:2880<br>0x0A19A4:560<br>0x0A1854:512 | D007CA=0x0585E9<br>D008E0=0xD1A863<br>D0243A=0xD1A8B6<br>D0243D=0xD2A828<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-edit-vat-oracle | hot-loop-0A1854-threshold | hot-loop-0A1854-threshold | 15036 | 1 | 0 | - | 0/0 | 7/10 | 0x09EFDE:2880<br>0x0A19A4:560<br>0x0A1854:512 | D007CA=0x0585E9<br>D008E0=0xD1A863<br>D0243A=0xD1A8B6<br>D0243D=0xD2A828<br>D02590=0xD3FE81<br>D0259D=0xD3FECD<br>D02A29=0x0000 |
| preserve-d007ca-oracle | reaches-006dxx | first-post-006dxx-exit | 20472 | 1 | 23 | 0x0064DE | 1/1 | 5/10 | 0x09EFDE:2880<br>0x005AE8:1392<br>0x005B16:1392 | D007CA=0x0585E9<br>D008E0=0x000000<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-d008e0-oracle | reaches-006dxx | first-post-006dxx-exit | 20472 | 1 | 23 | 0x0064DE | 1/1 | 5/10 | 0x09EFDE:2880<br>0x005AE8:1392<br>0x005B16:1392 | D007CA=0x000000<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |
| preserve-cx-oracle | reaches-006dxx | first-post-006dxx-exit | 20472 | 1 | 23 | 0x0064DE | 1/1 | 6/10 | 0x09EFDE:2880<br>0x005AE8:1392<br>0x005B16:1392 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |

## Preservation Events

| Case | Event | Block # | Boundary | Source Mode | Source Fields | After Restore |
| --- | --- | ---: | --- | --- | --- | --- |
| baseline-current | - | - | - | - | - | - |
| preserve-edit-vat-prev | preserve-edit-vat-at-0A31E2-to-0A31A2 | 4986 | 0x0A31E2 -> 0x0A31A2 | previous-block | {"D0243A":"0xD1A8CB","D0243D":"0xD2A83D","D02590":"0xD3FE81","D0259D":"0xD3FECD"} | {"D0243A":"0xD1A8CB","D0243D":"0xD2A83D","D02590":"0xD3FE81","D0259D":"0xD3FECD"} |
| preserve-vat-prev | preserve-vat-prev-at-0A31E2-to-0A31A2 | 4986 | 0x0A31E2 -> 0x0A31A2 | previous-block | {"D02590":"0xD3FE81","D0259D":"0xD3FECD"} | {"D02590":"0xD3FE81","D0259D":"0xD3FECD"} |
| preserve-d02590-prev | preserve-d02590-prev-at-0A31E2-to-0A31A2 | 4986 | 0x0A31E2 -> 0x0A31A2 | previous-block | {"D02590":"0xD3FE81"} | {"D02590":"0xD3FE81"} |
| preserve-d0259d-prev | preserve-d0259d-prev-at-0A31E2-to-0A31A2 | 4986 | 0x0A31E2 -> 0x0A31A2 | previous-block | {"D0259D":"0xD3FECD"} | {"D0259D":"0xD3FECD"} |
| preserve-edit-prev | preserve-edit-prev-at-0A31E2-to-0A31A2 | 4986 | 0x0A31E2 -> 0x0A31A2 | previous-block | {"D0243A":"0xD1A8CB","D0243D":"0xD2A83D"} | {"D0243A":"0xD1A8CB","D0243D":"0xD2A83D"} |
| preserve-d0243a-prev | preserve-d0243a-prev-at-0A31E2-to-0A31A2 | 4986 | 0x0A31E2 -> 0x0A31A2 | previous-block | {"D0243A":"0xD1A8CB"} | {"D0243A":"0xD1A8CB"} |
| preserve-d0243d-prev | preserve-d0243d-prev-at-0A31E2-to-0A31A2 | 4986 | 0x0A31E2 -> 0x0A31A2 | previous-block | {"D0243D":"0xD2A83D"} | {"D0243D":"0xD2A83D"} |
| preserve-edit-oracle | preserve-edit-oracle-at-0A31E2-to-0A31A2 | 4986 | 0x0A31E2 -> 0x0A31A2 | override-target | {"D0243A":"0xD1A8CC","D0243D":"0xD2A83E"} | {"D0243A":"0xD1A8CC","D0243D":"0xD2A83E"} |
| preserve-edit-vat-oracle | preserve-edit-vat-oracle-at-0A31E2-to-0A31A2 | 4986 | 0x0A31E2 -> 0x0A31A2 | override-target | {"D0243A":"0xD1A8CC","D0243D":"0xD2A83E","D02590":"0xD3FE81","D0259D":"0xD3FECD"} | {"D0243A":"0xD1A8CC","D0243D":"0xD2A83E","D02590":"0xD3FE81","D0259D":"0xD3FECD"} |
| preserve-d007ca-oracle | preserve-d007ca-oracle-at-001879-to-0018F8 | 11129 | 0x001879 -> 0x0018F8 | override-target | {"D007CA":"0x0585E9"} | {"D007CA":"0x0585E9"} |
| preserve-d008e0-oracle | preserve-d008e0-oracle-at-001879-to-0018F8 | 11129 | 0x001879 -> 0x0018F8 | override-target | {"D008E0":"0xD1A86C"} | {"D008E0":"0xD1A86C"} |
| preserve-cx-oracle | preserve-cx-oracle-at-001879-to-0018F8 | 11129 | 0x001879 -> 0x0018F8 | override-target | {"D007CA":"0x0585E9","D008E0":"0xD1A86C"} | {"D007CA":"0x0585E9","D008E0":"0xD1A86C"} |

## Oracle Comparison

Compared against `captures/realram-home-afterCLEAR-D00000-D657FF.bin`.

| Case | Field | Actual | Oracle | Match |
| --- | --- | --- | --- | --- |
| baseline-current | D007CA | 0x000000 | 0x0585E9 | no |
| baseline-current | D008E0 | 0x000000 | 0xD1A86C | no |
| baseline-current | D0243A | 0x000000 | 0xD1A8CC | no |
| baseline-current | D0243D | 0x000000 | 0xD2A83E | no |
| baseline-current | D02590 | 0x000000 | 0xD3FE81 | no |
| baseline-current | D0259D | 0x000000 | 0xD3FECD | no |
| baseline-current | D02A29 | 0x0000 | 0x0000 | yes |
| baseline-current | D00587 | 0x00 | 0x00 | yes |
| baseline-current | D0058C | 0x00 | 0x00 | yes |
| baseline-current | D0058E | 0x00 | 0x00 | yes |
| preserve-edit-vat-prev | D007CA | 0x0585E9 | 0x0585E9 | yes |
| preserve-edit-vat-prev | D008E0 | 0xD1A863 | 0xD1A86C | no |
| preserve-edit-vat-prev | D0243A | 0xD1A8B5 | 0xD1A8CC | no |
| preserve-edit-vat-prev | D0243D | 0xD2A827 | 0xD2A83E | no |
| preserve-edit-vat-prev | D02590 | 0xD3FE81 | 0xD3FE81 | yes |
| preserve-edit-vat-prev | D0259D | 0xD3FECD | 0xD3FECD | yes |
| preserve-edit-vat-prev | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-edit-vat-prev | D00587 | 0x00 | 0x00 | yes |
| preserve-edit-vat-prev | D0058C | 0x00 | 0x00 | yes |
| preserve-edit-vat-prev | D0058E | 0x00 | 0x00 | yes |
| preserve-vat-prev | D007CA | 0x000000 | 0x0585E9 | no |
| preserve-vat-prev | D008E0 | 0x000000 | 0xD1A86C | no |
| preserve-vat-prev | D0243A | 0x000000 | 0xD1A8CC | no |
| preserve-vat-prev | D0243D | 0x000000 | 0xD2A83E | no |
| preserve-vat-prev | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-vat-prev | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-vat-prev | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-vat-prev | D00587 | 0x00 | 0x00 | yes |
| preserve-vat-prev | D0058C | 0x00 | 0x00 | yes |
| preserve-vat-prev | D0058E | 0x00 | 0x00 | yes |
| preserve-d02590-prev | D007CA | 0x000000 | 0x0585E9 | no |
| preserve-d02590-prev | D008E0 | 0x000000 | 0xD1A86C | no |
| preserve-d02590-prev | D0243A | 0x000000 | 0xD1A8CC | no |
| preserve-d02590-prev | D0243D | 0x000000 | 0xD2A83E | no |
| preserve-d02590-prev | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-d02590-prev | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-d02590-prev | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-d02590-prev | D00587 | 0x00 | 0x00 | yes |
| preserve-d02590-prev | D0058C | 0x00 | 0x00 | yes |
| preserve-d02590-prev | D0058E | 0x00 | 0x00 | yes |
| preserve-d0259d-prev | D007CA | 0x000000 | 0x0585E9 | no |
| preserve-d0259d-prev | D008E0 | 0x000000 | 0xD1A86C | no |
| preserve-d0259d-prev | D0243A | 0x000000 | 0xD1A8CC | no |
| preserve-d0259d-prev | D0243D | 0x000000 | 0xD2A83E | no |
| preserve-d0259d-prev | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-d0259d-prev | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-d0259d-prev | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-d0259d-prev | D00587 | 0x00 | 0x00 | yes |
| preserve-d0259d-prev | D0058C | 0x00 | 0x00 | yes |
| preserve-d0259d-prev | D0058E | 0x00 | 0x00 | yes |
| preserve-edit-prev | D007CA | 0x0585E9 | 0x0585E9 | yes |
| preserve-edit-prev | D008E0 | 0xD1A863 | 0xD1A86C | no |
| preserve-edit-prev | D0243A | 0xD1A8B5 | 0xD1A8CC | no |
| preserve-edit-prev | D0243D | 0xD2A827 | 0xD2A83E | no |
| preserve-edit-prev | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-edit-prev | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-edit-prev | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-edit-prev | D00587 | 0x00 | 0x00 | yes |
| preserve-edit-prev | D0058C | 0x00 | 0x00 | yes |
| preserve-edit-prev | D0058E | 0x00 | 0x00 | yes |
| preserve-d0243a-prev | D007CA | 0x0585E9 | 0x0585E9 | yes |
| preserve-d0243a-prev | D008E0 | 0xD1A863 | 0xD1A86C | no |
| preserve-d0243a-prev | D0243A | 0xD1A8B5 | 0xD1A8CC | no |
| preserve-d0243a-prev | D0243D | 0xFFFFEA | 0xD2A83E | no |
| preserve-d0243a-prev | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-d0243a-prev | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-d0243a-prev | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-d0243a-prev | D00587 | 0x00 | 0x00 | yes |
| preserve-d0243a-prev | D0058C | 0x00 | 0x00 | yes |
| preserve-d0243a-prev | D0058E | 0x00 | 0x00 | yes |
| preserve-d0243d-prev | D007CA | 0x000000 | 0x0585E9 | no |
| preserve-d0243d-prev | D008E0 | 0x000000 | 0xD1A86C | no |
| preserve-d0243d-prev | D0243A | 0x000000 | 0xD1A8CC | no |
| preserve-d0243d-prev | D0243D | 0x000000 | 0xD2A83E | no |
| preserve-d0243d-prev | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-d0243d-prev | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-d0243d-prev | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-d0243d-prev | D00587 | 0x00 | 0x00 | yes |
| preserve-d0243d-prev | D0058C | 0x00 | 0x00 | yes |
| preserve-d0243d-prev | D0058E | 0x00 | 0x00 | yes |
| preserve-edit-oracle | D007CA | 0x0585E9 | 0x0585E9 | yes |
| preserve-edit-oracle | D008E0 | 0xD1A863 | 0xD1A86C | no |
| preserve-edit-oracle | D0243A | 0xD1A8B6 | 0xD1A8CC | no |
| preserve-edit-oracle | D0243D | 0xD2A828 | 0xD2A83E | no |
| preserve-edit-oracle | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-edit-oracle | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-edit-oracle | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-edit-oracle | D00587 | 0x00 | 0x00 | yes |
| preserve-edit-oracle | D0058C | 0x00 | 0x00 | yes |
| preserve-edit-oracle | D0058E | 0x00 | 0x00 | yes |
| preserve-edit-vat-oracle | D007CA | 0x0585E9 | 0x0585E9 | yes |
| preserve-edit-vat-oracle | D008E0 | 0xD1A863 | 0xD1A86C | no |
| preserve-edit-vat-oracle | D0243A | 0xD1A8B6 | 0xD1A8CC | no |
| preserve-edit-vat-oracle | D0243D | 0xD2A828 | 0xD2A83E | no |
| preserve-edit-vat-oracle | D02590 | 0xD3FE81 | 0xD3FE81 | yes |
| preserve-edit-vat-oracle | D0259D | 0xD3FECD | 0xD3FECD | yes |
| preserve-edit-vat-oracle | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-edit-vat-oracle | D00587 | 0x00 | 0x00 | yes |
| preserve-edit-vat-oracle | D0058C | 0x00 | 0x00 | yes |
| preserve-edit-vat-oracle | D0058E | 0x00 | 0x00 | yes |
| preserve-d007ca-oracle | D007CA | 0x0585E9 | 0x0585E9 | yes |
| preserve-d007ca-oracle | D008E0 | 0x000000 | 0xD1A86C | no |
| preserve-d007ca-oracle | D0243A | 0x000000 | 0xD1A8CC | no |
| preserve-d007ca-oracle | D0243D | 0x000000 | 0xD2A83E | no |
| preserve-d007ca-oracle | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-d007ca-oracle | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-d007ca-oracle | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-d007ca-oracle | D00587 | 0x00 | 0x00 | yes |
| preserve-d007ca-oracle | D0058C | 0x00 | 0x00 | yes |
| preserve-d007ca-oracle | D0058E | 0x00 | 0x00 | yes |
| preserve-d008e0-oracle | D007CA | 0x000000 | 0x0585E9 | no |
| preserve-d008e0-oracle | D008E0 | 0xD1A86C | 0xD1A86C | yes |
| preserve-d008e0-oracle | D0243A | 0x000000 | 0xD1A8CC | no |
| preserve-d008e0-oracle | D0243D | 0x000000 | 0xD2A83E | no |
| preserve-d008e0-oracle | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-d008e0-oracle | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-d008e0-oracle | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-d008e0-oracle | D00587 | 0x00 | 0x00 | yes |
| preserve-d008e0-oracle | D0058C | 0x00 | 0x00 | yes |
| preserve-d008e0-oracle | D0058E | 0x00 | 0x00 | yes |
| preserve-cx-oracle | D007CA | 0x0585E9 | 0x0585E9 | yes |
| preserve-cx-oracle | D008E0 | 0xD1A86C | 0xD1A86C | yes |
| preserve-cx-oracle | D0243A | 0x000000 | 0xD1A8CC | no |
| preserve-cx-oracle | D0243D | 0x000000 | 0xD2A83E | no |
| preserve-cx-oracle | D02590 | 0x000000 | 0xD3FE81 | no |
| preserve-cx-oracle | D0259D | 0x000000 | 0xD3FECD | no |
| preserve-cx-oracle | D02A29 | 0x0000 | 0x0000 | yes |
| preserve-cx-oracle | D00587 | 0x00 | 0x00 | yes |
| preserve-cx-oracle | D0058C | 0x00 | 0x00 | yes |
| preserve-cx-oracle | D0058E | 0x00 | 0x00 | yes |

## First Exit After 0x006Dxx

```json
{
  "baseline-current": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  },
  "preserve-edit-vat-prev": null,
  "preserve-vat-prev": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  },
  "preserve-d02590-prev": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  },
  "preserve-d0259d-prev": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  },
  "preserve-edit-prev": null,
  "preserve-d0243a-prev": null,
  "preserve-d0243d-prev": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  },
  "preserve-edit-oracle": null,
  "preserve-edit-vat-oracle": null,
  "preserve-d007ca-oracle": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  },
  "preserve-d008e0-oracle": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0xD1A86C",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  },
  "preserve-cx-oracle": {
    "blockIndex": 20472,
    "pc": "0x0064DE",
    "previousPc": "0x006D68",
    "cpu": {
      "pc": "0x0064DE",
      "currentBlockPc": "0x0064DE",
      "sp": "0xD1A837",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0042",
      "bc": "0x002001",
      "de": "0x002010",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "ixFrame": {
        "IX-6": "0x000104",
        "IX-3": "0x09D7BE",
        "IX+0": "0xD1A878",
        "IX+3": "0x013968",
        "IX+6": "0x020000",
        "IX+9": "0xD00080"
      }
    }
  }
}
```

## First Hits

```json
{
  "baseline-current": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
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
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  },
  "preserve-edit-vat-prev": {},
  "preserve-vat-prev": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  },
  "preserve-d02590-prev": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  },
  "preserve-d0259d-prev": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  },
  "preserve-edit-prev": {},
  "preserve-d0243a-prev": {},
  "preserve-d0243d-prev": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
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
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  },
  "preserve-edit-oracle": {},
  "preserve-edit-vat-oracle": {},
  "preserve-d007ca-oracle": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
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
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  },
  "preserve-d008e0-oracle": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
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
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  },
  "preserve-cx-oracle": {
    "clear001879": {
      "blockIndex": 11128,
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "flags": {
          "z": true,
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
          "D0009F": "0x04",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "cleanup0018F8": {
      "blockIndex": 11129,
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00"
        },
        "ixFrame": {
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        }
      }
    },
    "loop006D64": {
      "blockIndex": 20438,
      "pc": "0x006D64",
      "cpu": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x0002",
        "bc": "0x020000",
        "de": "0x000240",
        "hl": "0x000100",
        "flags": {
          "z": false,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        }
      }
    },
    "loop006D4F": {
      "blockIndex": 20443,
      "pc": "0x006D4F",
      "cpu": {
        "pc": "0x006D4F",
        "currentBlockPc": "0x006D4F",
        "sp": "0xD1A828",
        "ix": "0xD1A831",
        "iy": "0xD00080",
        "af": "0x2042",
        "bc": "0x002000",
        "de": "0x002010",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00121": "0x000040",
          "D00124": "0x0A"
        },
        "ixFrame": {
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        }
      }
    }
  }
}
```

## Full JSON

```json
{
  "probe": "phase846-minimal-preservation",
  "pass": true,
  "cases": [
    {
      "scenario": "baseline-current",
      "description": "Current route with no owner preservation; stop at the first post-0x006Dxx exit.",
      "termination": "first-post-006dxx-exit",
      "steps": 20472,
      "low006DRegion": 23,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 4,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 5,
      "overrideCount": 0,
      "preservationCount": 0,
      "preservationEvents": [],
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
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
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
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
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "oracleMatches": 4,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 0,
          "expected": 361961,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 0,
          "expected": 13740140,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CCE",
        "0x001CD5",
        "0x001CE5",
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
        "0x001CC4",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C42",
        "0x00649B",
        "0x00649D",
        "0x0064BE",
        "0x006C8E",
        "0x006C9C",
        "0x006CA1",
        "0x006CB2",
        "0x006CB7",
        "0x0064C7",
        "0x0017DD",
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
        "0x0017FC",
        "0x0064D0",
        "0x006CC6",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF4",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006D68",
        "0x0064DE"
      ]
    },
    {
      "scenario": "preserve-edit-vat-prev",
      "description": "Phase845 comparison case: restore D0243A/D0243D/D02590/D0259D from the previous block at 0x0A31E2 -> 0x0A31A2.",
      "termination": "hot-loop-0A1854-threshold",
      "steps": 15036,
      "low006DRegion": 0,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 0,
      "hits0018F8": 0,
      "hits0019B5": 0,
      "pollReadCount": 0,
      "pollValues": [],
      "allBit3Clear": false,
      "loop006D64": 0,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-edit-vat-at-0A31E2-to-0A31A2",
          "blockIndex": 4986,
          "ownerPc": "0x0A31E2",
          "entryPc": "0x0A31A2",
          "restoredFields": [
            "D0243A",
            "D0243D",
            "D02590",
            "D0259D"
          ],
          "sourceMode": "previous-block",
          "sourceFields": {
            "D0243A": "0xD1A8CB",
            "D0243D": "0xD2A83D",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
          "beforeRestore": {
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000"
          },
          "afterRestore": {
            "D0243A": "0xD1A8CB",
            "D0243D": "0xD2A83D",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
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
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": null,
      "firstHits": {},
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0A1854",
          "count": 512
        },
        {
          "pc": "0x0A187C",
          "count": 511
        },
        {
          "pc": "0x0A188A",
          "count": 511
        },
        {
          "pc": "0x0A189E",
          "count": 511
        },
        {
          "pc": "0x0A190D",
          "count": 511
        },
        {
          "pc": "0x0A191F",
          "count": 511
        },
        {
          "pc": "0x0A1939",
          "count": 511
        },
        {
          "pc": "0x0A1969",
          "count": 511
        },
        {
          "pc": "0x0A1976",
          "count": 511
        },
        {
          "pc": "0x0A1980",
          "count": 511
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8B5",
        "D0243D": "0xD2A827",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x04",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "oracleMatches": 7,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 361961,
          "expected": 361961,
          "match": true,
          "actualHex": "0x0585E9",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 13740131,
          "expected": 13740140,
          "match": false,
          "actualHex": "0xD1A863",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 13740213,
          "expected": 13740236,
          "match": false,
          "actualHex": "0xD1A8B5",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 13805607,
          "expected": 13805630,
          "match": false,
          "actualHex": "0xD2A827",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 13893249,
          "expected": 13893249,
          "match": true,
          "actualHex": "0xD3FE81",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 13893325,
          "expected": 13893325,
          "match": true,
          "actualHex": "0xD3FECD",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854"
      ]
    },
    {
      "scenario": "preserve-vat-prev",
      "description": "Restore only VAT top fields D02590/D0259D from the previous block at 0x0A31E2 -> 0x0A31A2.",
      "termination": "first-post-006dxx-exit",
      "steps": 20472,
      "low006DRegion": 23,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 4,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 5,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-vat-prev-at-0A31E2-to-0A31A2",
          "blockIndex": 4986,
          "ownerPc": "0x0A31E2",
          "entryPc": "0x0A31A2",
          "restoredFields": [
            "D02590",
            "D0259D"
          ],
          "sourceMode": "previous-block",
          "sourceFields": {
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
          "beforeRestore": {
            "D02590": "0x000000",
            "D0259D": "0x000000"
          },
          "afterRestore": {
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
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
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
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
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "oracleMatches": 4,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 0,
          "expected": 361961,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 0,
          "expected": 13740140,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CCE",
        "0x001CD5",
        "0x001CE5",
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
        "0x001CC4",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C42",
        "0x00649B",
        "0x00649D",
        "0x0064BE",
        "0x006C8E",
        "0x006C9C",
        "0x006CA1",
        "0x006CB2",
        "0x006CB7",
        "0x0064C7",
        "0x0017DD",
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
        "0x0017FC",
        "0x0064D0",
        "0x006CC6",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF4",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006D68",
        "0x0064DE"
      ]
    },
    {
      "scenario": "preserve-d02590-prev",
      "description": "Restore only D02590 from the previous block at 0x0A31E2 -> 0x0A31A2.",
      "termination": "first-post-006dxx-exit",
      "steps": 20472,
      "low006DRegion": 23,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 4,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 5,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-d02590-prev-at-0A31E2-to-0A31A2",
          "blockIndex": 4986,
          "ownerPc": "0x0A31E2",
          "entryPc": "0x0A31A2",
          "restoredFields": [
            "D02590"
          ],
          "sourceMode": "previous-block",
          "sourceFields": {
            "D02590": "0xD3FE81"
          },
          "beforeRestore": {
            "D02590": "0x000000"
          },
          "afterRestore": {
            "D02590": "0xD3FE81"
          },
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
              "D02590": "0xD3FE81",
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
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0xD3FE81",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
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
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "oracleMatches": 4,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 0,
          "expected": 361961,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 0,
          "expected": 13740140,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CCE",
        "0x001CD5",
        "0x001CE5",
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
        "0x001CC4",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C42",
        "0x00649B",
        "0x00649D",
        "0x0064BE",
        "0x006C8E",
        "0x006C9C",
        "0x006CA1",
        "0x006CB2",
        "0x006CB7",
        "0x0064C7",
        "0x0017DD",
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
        "0x0017FC",
        "0x0064D0",
        "0x006CC6",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF4",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006D68",
        "0x0064DE"
      ]
    },
    {
      "scenario": "preserve-d0259d-prev",
      "description": "Restore only D0259D from the previous block at 0x0A31E2 -> 0x0A31A2.",
      "termination": "first-post-006dxx-exit",
      "steps": 20472,
      "low006DRegion": 23,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 4,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 5,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-d0259d-prev-at-0A31E2-to-0A31A2",
          "blockIndex": 4986,
          "ownerPc": "0x0A31E2",
          "entryPc": "0x0A31A2",
          "restoredFields": [
            "D0259D"
          ],
          "sourceMode": "previous-block",
          "sourceFields": {
            "D0259D": "0xD3FECD"
          },
          "beforeRestore": {
            "D0259D": "0x000000"
          },
          "afterRestore": {
            "D0259D": "0xD3FECD"
          },
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
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0xD3FECD",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
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
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "oracleMatches": 4,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 0,
          "expected": 361961,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 0,
          "expected": 13740140,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CCE",
        "0x001CD5",
        "0x001CE5",
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
        "0x001CC4",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C42",
        "0x00649B",
        "0x00649D",
        "0x0064BE",
        "0x006C8E",
        "0x006C9C",
        "0x006CA1",
        "0x006CB2",
        "0x006CB7",
        "0x0064C7",
        "0x0017DD",
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
        "0x0017FC",
        "0x0064D0",
        "0x006CC6",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF4",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006D68",
        "0x0064DE"
      ]
    },
    {
      "scenario": "preserve-edit-prev",
      "description": "Restore only edit pointers D0243A/D0243D from the previous block at 0x0A31E2 -> 0x0A31A2.",
      "termination": "hot-loop-0A1854-threshold",
      "steps": 15036,
      "low006DRegion": 0,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 0,
      "hits0018F8": 0,
      "hits0019B5": 0,
      "pollReadCount": 0,
      "pollValues": [],
      "allBit3Clear": false,
      "loop006D64": 0,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-edit-prev-at-0A31E2-to-0A31A2",
          "blockIndex": 4986,
          "ownerPc": "0x0A31E2",
          "entryPc": "0x0A31A2",
          "restoredFields": [
            "D0243A",
            "D0243D"
          ],
          "sourceMode": "previous-block",
          "sourceFields": {
            "D0243A": "0xD1A8CB",
            "D0243D": "0xD2A83D"
          },
          "beforeRestore": {
            "D0243A": "0x000000",
            "D0243D": "0x000000"
          },
          "afterRestore": {
            "D0243A": "0xD1A8CB",
            "D0243D": "0xD2A83D"
          },
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
              "D0243A": "0xD1A8CB",
              "D0243D": "0xD2A83D",
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
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": null,
      "firstHits": {},
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0A1854",
          "count": 512
        },
        {
          "pc": "0x0A187C",
          "count": 511
        },
        {
          "pc": "0x0A188A",
          "count": 511
        },
        {
          "pc": "0x0A189E",
          "count": 511
        },
        {
          "pc": "0x0A190D",
          "count": 511
        },
        {
          "pc": "0x0A191F",
          "count": 511
        },
        {
          "pc": "0x0A1939",
          "count": 511
        },
        {
          "pc": "0x0A1969",
          "count": 511
        },
        {
          "pc": "0x0A1976",
          "count": 511
        },
        {
          "pc": "0x0A1980",
          "count": 511
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8B5",
        "D0243D": "0xD2A827",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x04",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "oracleMatches": 5,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 361961,
          "expected": 361961,
          "match": true,
          "actualHex": "0x0585E9",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 13740131,
          "expected": 13740140,
          "match": false,
          "actualHex": "0xD1A863",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 13740213,
          "expected": 13740236,
          "match": false,
          "actualHex": "0xD1A8B5",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 13805607,
          "expected": 13805630,
          "match": false,
          "actualHex": "0xD2A827",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854"
      ]
    },
    {
      "scenario": "preserve-d0243a-prev",
      "description": "Restore only D0243A from the previous block at 0x0A31E2 -> 0x0A31A2.",
      "termination": "hot-loop-0A1854-threshold",
      "steps": 15036,
      "low006DRegion": 0,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 0,
      "hits0018F8": 0,
      "hits0019B5": 0,
      "pollReadCount": 0,
      "pollValues": [],
      "allBit3Clear": false,
      "loop006D64": 0,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-d0243a-prev-at-0A31E2-to-0A31A2",
          "blockIndex": 4986,
          "ownerPc": "0x0A31E2",
          "entryPc": "0x0A31A2",
          "restoredFields": [
            "D0243A"
          ],
          "sourceMode": "previous-block",
          "sourceFields": {
            "D0243A": "0xD1A8CB"
          },
          "beforeRestore": {
            "D0243A": "0x000000"
          },
          "afterRestore": {
            "D0243A": "0xD1A8CB"
          },
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
              "D0243A": "0xD1A8CB",
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
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": null,
      "firstHits": {},
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0A1854",
          "count": 512
        },
        {
          "pc": "0x0A187C",
          "count": 511
        },
        {
          "pc": "0x0A188A",
          "count": 511
        },
        {
          "pc": "0x0A189E",
          "count": 511
        },
        {
          "pc": "0x0A190D",
          "count": 511
        },
        {
          "pc": "0x0A191F",
          "count": 511
        },
        {
          "pc": "0x0A1939",
          "count": 511
        },
        {
          "pc": "0x0A1969",
          "count": 511
        },
        {
          "pc": "0x0A1976",
          "count": 511
        },
        {
          "pc": "0x0A1980",
          "count": 511
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8B5",
        "D0243D": "0xFFFFEA",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x04",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "oracleMatches": 5,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 361961,
          "expected": 361961,
          "match": true,
          "actualHex": "0x0585E9",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 13740131,
          "expected": 13740140,
          "match": false,
          "actualHex": "0xD1A863",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 13740213,
          "expected": 13740236,
          "match": false,
          "actualHex": "0xD1A8B5",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 16777194,
          "expected": 13805630,
          "match": false,
          "actualHex": "0xFFFFEA",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854"
      ]
    },
    {
      "scenario": "preserve-d0243d-prev",
      "description": "Restore only D0243D from the previous block at 0x0A31E2 -> 0x0A31A2.",
      "termination": "first-post-006dxx-exit",
      "steps": 20472,
      "low006DRegion": 23,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 4,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 5,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-d0243d-prev-at-0A31E2-to-0A31A2",
          "blockIndex": 4986,
          "ownerPc": "0x0A31E2",
          "entryPc": "0x0A31A2",
          "restoredFields": [
            "D0243D"
          ],
          "sourceMode": "previous-block",
          "sourceFields": {
            "D0243D": "0xD2A83D"
          },
          "beforeRestore": {
            "D0243D": "0x000000"
          },
          "afterRestore": {
            "D0243D": "0xD2A83D"
          },
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
              "D0243D": "0xD2A83D",
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
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
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
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
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
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "oracleMatches": 4,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 0,
          "expected": 361961,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 0,
          "expected": 13740140,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CCE",
        "0x001CD5",
        "0x001CE5",
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
        "0x001CC4",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C42",
        "0x00649B",
        "0x00649D",
        "0x0064BE",
        "0x006C8E",
        "0x006C9C",
        "0x006CA1",
        "0x006CB2",
        "0x006CB7",
        "0x0064C7",
        "0x0017DD",
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
        "0x0017FC",
        "0x0064D0",
        "0x006CC6",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF4",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006D68",
        "0x0064DE"
      ]
    },
    {
      "scenario": "preserve-edit-oracle",
      "description": "Restore D0243A/D0243D to the real after-CLEAR oracle targets at 0x0A31E2 -> 0x0A31A2.",
      "termination": "hot-loop-0A1854-threshold",
      "steps": 15036,
      "low006DRegion": 0,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 0,
      "hits0018F8": 0,
      "hits0019B5": 0,
      "pollReadCount": 0,
      "pollValues": [],
      "allBit3Clear": false,
      "loop006D64": 0,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-edit-oracle-at-0A31E2-to-0A31A2",
          "blockIndex": 4986,
          "ownerPc": "0x0A31E2",
          "entryPc": "0x0A31A2",
          "restoredFields": [
            "D0243A",
            "D0243D"
          ],
          "sourceMode": "override-target",
          "sourceFields": {
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E"
          },
          "beforeRestore": {
            "D0243A": "0x000000",
            "D0243D": "0x000000"
          },
          "afterRestore": {
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E"
          },
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
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
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
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": null,
      "firstHits": {},
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0A1854",
          "count": 512
        },
        {
          "pc": "0x0A187C",
          "count": 511
        },
        {
          "pc": "0x0A188A",
          "count": 511
        },
        {
          "pc": "0x0A189E",
          "count": 511
        },
        {
          "pc": "0x0A190D",
          "count": 511
        },
        {
          "pc": "0x0A191F",
          "count": 511
        },
        {
          "pc": "0x0A1939",
          "count": 511
        },
        {
          "pc": "0x0A1969",
          "count": 511
        },
        {
          "pc": "0x0A1976",
          "count": 511
        },
        {
          "pc": "0x0A1980",
          "count": 511
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8B6",
        "D0243D": "0xD2A828",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x04",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "oracleMatches": 5,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 361961,
          "expected": 361961,
          "match": true,
          "actualHex": "0x0585E9",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 13740131,
          "expected": 13740140,
          "match": false,
          "actualHex": "0xD1A863",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 13740214,
          "expected": 13740236,
          "match": false,
          "actualHex": "0xD1A8B6",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 13805608,
          "expected": 13805630,
          "match": false,
          "actualHex": "0xD2A828",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854"
      ]
    },
    {
      "scenario": "preserve-edit-vat-oracle",
      "description": "Restore D0243A/D0243D/D02590/D0259D to the real after-CLEAR oracle targets at 0x0A31E2 -> 0x0A31A2.",
      "termination": "hot-loop-0A1854-threshold",
      "steps": 15036,
      "low006DRegion": 0,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 0,
      "hits0018F8": 0,
      "hits0019B5": 0,
      "pollReadCount": 0,
      "pollValues": [],
      "allBit3Clear": false,
      "loop006D64": 0,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-edit-vat-oracle-at-0A31E2-to-0A31A2",
          "blockIndex": 4986,
          "ownerPc": "0x0A31E2",
          "entryPc": "0x0A31A2",
          "restoredFields": [
            "D0243A",
            "D0243D",
            "D02590",
            "D0259D"
          ],
          "sourceMode": "override-target",
          "sourceFields": {
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
          "beforeRestore": {
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000"
          },
          "afterRestore": {
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
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
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
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
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": null,
      "firstHits": {},
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0A1854",
          "count": 512
        },
        {
          "pc": "0x0A187C",
          "count": 511
        },
        {
          "pc": "0x0A188A",
          "count": 511
        },
        {
          "pc": "0x0A189E",
          "count": 511
        },
        {
          "pc": "0x0A190D",
          "count": 511
        },
        {
          "pc": "0x0A191F",
          "count": 511
        },
        {
          "pc": "0x0A1939",
          "count": 511
        },
        {
          "pc": "0x0A1969",
          "count": 511
        },
        {
          "pc": "0x0A1976",
          "count": 511
        },
        {
          "pc": "0x0A1980",
          "count": 511
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8B6",
        "D0243D": "0xD2A828",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x04",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "oracleMatches": 7,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 361961,
          "expected": 361961,
          "match": true,
          "actualHex": "0x0585E9",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 13740131,
          "expected": 13740140,
          "match": false,
          "actualHex": "0xD1A863",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 13740214,
          "expected": 13740236,
          "match": false,
          "actualHex": "0xD1A8B6",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 13805608,
          "expected": 13805630,
          "match": false,
          "actualHex": "0xD2A828",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 13893249,
          "expected": 13893249,
          "match": true,
          "actualHex": "0xD3FE81",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 13893325,
          "expected": 13893325,
          "match": true,
          "actualHex": "0xD3FECD",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854",
        "0x0A187C",
        "0x0A188A",
        "0x0A189E",
        "0x0A190D",
        "0x0A191F",
        "0x0A1939",
        "0x0A1969",
        "0x0A1976",
        "0x0A1980",
        "0x0A19CC",
        "0x0A19D7",
        "0x0A1A1D",
        "0x0A1854"
      ]
    },
    {
      "scenario": "preserve-d007ca-oracle",
      "description": "Restore only D007CA to the real after-CLEAR oracle target at 0x001879 -> 0x0018F8.",
      "termination": "first-post-006dxx-exit",
      "steps": 20472,
      "low006DRegion": 23,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 4,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 5,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-d007ca-oracle-at-001879-to-0018F8",
          "blockIndex": 11129,
          "ownerPc": "0x001879",
          "entryPc": "0x0018F8",
          "restoredFields": [
            "D007CA"
          ],
          "sourceMode": "override-target",
          "sourceFields": {
            "D007CA": "0x0585E9"
          },
          "beforeRestore": {
            "D007CA": "0x000000"
          },
          "afterRestore": {
            "D007CA": "0x0585E9"
          },
          "beforeCpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
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
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          },
          "afterCpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
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
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
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
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "oracleMatches": 5,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 361961,
          "expected": 361961,
          "match": true,
          "actualHex": "0x0585E9",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 0,
          "expected": 13740140,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CCE",
        "0x001CD5",
        "0x001CE5",
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
        "0x001CC4",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C42",
        "0x00649B",
        "0x00649D",
        "0x0064BE",
        "0x006C8E",
        "0x006C9C",
        "0x006CA1",
        "0x006CB2",
        "0x006CB7",
        "0x0064C7",
        "0x0017DD",
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
        "0x0017FC",
        "0x0064D0",
        "0x006CC6",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF4",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006D68",
        "0x0064DE"
      ]
    },
    {
      "scenario": "preserve-d008e0-oracle",
      "description": "Restore only D008E0 to the real after-CLEAR oracle target 0xD1A86C at 0x001879 -> 0x0018F8.",
      "termination": "first-post-006dxx-exit",
      "steps": 20472,
      "low006DRegion": 23,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 4,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 5,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-d008e0-oracle-at-001879-to-0018F8",
          "blockIndex": 11129,
          "ownerPc": "0x001879",
          "entryPc": "0x0018F8",
          "restoredFields": [
            "D008E0"
          ],
          "sourceMode": "override-target",
          "sourceFields": {
            "D008E0": "0xD1A86C"
          },
          "beforeRestore": {
            "D008E0": "0x000000"
          },
          "afterRestore": {
            "D008E0": "0xD1A86C"
          },
          "beforeCpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
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
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          },
          "afterCpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A86C",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
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
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A86C",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A86C",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A86C",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
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
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0xD1A86C",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "oracleMatches": 5,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 0,
          "expected": 361961,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 13740140,
          "expected": 13740140,
          "match": true,
          "actualHex": "0xD1A86C",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CCE",
        "0x001CD5",
        "0x001CE5",
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
        "0x001CC4",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C42",
        "0x00649B",
        "0x00649D",
        "0x0064BE",
        "0x006C8E",
        "0x006C9C",
        "0x006CA1",
        "0x006CB2",
        "0x006CB7",
        "0x0064C7",
        "0x0017DD",
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
        "0x0017FC",
        "0x0064D0",
        "0x006CC6",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF4",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006D68",
        "0x0064DE"
      ]
    },
    {
      "scenario": "preserve-cx-oracle",
      "description": "Restore D007CA/D008E0 to the real after-CLEAR oracle targets at 0x001879 -> 0x0018F8.",
      "termination": "first-post-006dxx-exit",
      "steps": 20472,
      "low006DRegion": 23,
      "hits0A229D": 0,
      "hits08F54B": 0,
      "hits001879": 1,
      "hits0018F8": 1,
      "hits0019B5": 0,
      "pollReadCount": 4,
      "pollValues": [
        "0x00"
      ],
      "allBit3Clear": true,
      "loop006D64": 5,
      "overrideCount": 0,
      "preservationCount": 1,
      "preservationEvents": [
        {
          "name": "preserve-cx-oracle-at-001879-to-0018F8",
          "blockIndex": 11129,
          "ownerPc": "0x001879",
          "entryPc": "0x0018F8",
          "restoredFields": [
            "D007CA",
            "D008E0"
          ],
          "sourceMode": "override-target",
          "sourceFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C"
          },
          "beforeRestore": {
            "D007CA": "0x000000",
            "D008E0": "0x000000"
          },
          "afterRestore": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C"
          },
          "beforeCpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
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
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          },
          "afterCpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A86C",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        }
      ],
      "firstOverride": null,
      "firstExitAfter006D": {
        "blockIndex": 20472,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x002001",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000100",
            "D00124": "0x0E"
          },
          "ixFrame": {
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      "firstHits": {
        "clear001879": {
          "blockIndex": 11128,
          "pc": "0x001879",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "flags": {
              "z": true,
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
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "cleanup0018F8": {
          "blockIndex": 11129,
          "pc": "0x0018F8",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "ix": "0x000000",
            "iy": "0xD00080",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A86C",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x00D140",
              "IX-3": "0x000000",
              "IX+0": "0x7EEDF3",
              "IX+3": "0x58C35B",
              "IX+6": "0xF30006",
              "IX+9": "0x5B7EED"
            }
          }
        },
        "loop006D64": {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A86C",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          }
        },
        "loop006D4F": {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A86C",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        }
      },
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A19A4",
          "count": 560
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
          "pc": "0x001CA6",
          "count": 154
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "seededFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x08",
        "D0009F": "0x20",
        "D00587": "0x0F",
        "D0058C": "0x0F",
        "D0058E": "0x0F",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000100",
        "D00124": "0x0E"
      },
      "oracleMatches": 6,
      "oracle": [
        {
          "name": "D007CA",
          "actual": 361961,
          "expected": 361961,
          "match": true,
          "actualHex": "0x0585E9",
          "expectedHex": "0x0585E9"
        },
        {
          "name": "D008E0",
          "actual": 13740140,
          "expected": 13740140,
          "match": true,
          "actualHex": "0xD1A86C",
          "expectedHex": "0xD1A86C"
        },
        {
          "name": "D0243A",
          "actual": 0,
          "expected": 13740236,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD1A8CC"
        },
        {
          "name": "D0243D",
          "actual": 0,
          "expected": 13805630,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD2A83E"
        },
        {
          "name": "D02590",
          "actual": 0,
          "expected": 13893249,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "actual": 0,
          "expected": 13893325,
          "match": false,
          "actualHex": "0x000000",
          "expectedHex": "0xD3FECD"
        },
        {
          "name": "D02A29",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x0000",
          "expectedHex": "0x0000"
        },
        {
          "name": "D00587",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058C",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        },
        {
          "name": "D0058E",
          "actual": 0,
          "expected": 0,
          "match": true,
          "actualHex": "0x00",
          "expectedHex": "0x00"
        }
      ],
      "recentPcs": [
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CCE",
        "0x001CD5",
        "0x001CE5",
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
        "0x001CC4",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C42",
        "0x00649B",
        "0x00649D",
        "0x0064BE",
        "0x006C8E",
        "0x006C9C",
        "0x006CA1",
        "0x006CB2",
        "0x006CB7",
        "0x0064C7",
        "0x0017DD",
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
        "0x0017FC",
        "0x0064D0",
        "0x006CC6",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF4",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006D68",
        "0x0064DE"
      ]
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.


# Phase 694: CODE? Frontier Refinement

Probe: `probe-phase694-code-frontier-refine.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase694-code-frontier-refine.mjs`

## Summary

- Phase693-compatible covered bytes: **713,656**.
- Phase693-compatible uncovered non-erased bytes: **31,921** across **2,946** ranges.
- Rechecked CODE? frontier: **1,952 bytes** across **94** ranges.
- Seed-worthy after second pass: **0 ranges / 0 bytes**.
- Manual-review only: **4 ranges / 77 bytes**.
- Likely data/false-positive: **90 ranges / 1875 bytes**.
- Direct control refs into CODE? candidates: **0**. Non-control address/literal refs: **43 candidate ranges**.

## Bucket Totals

| bucket | ranges | bytes |
| --- | --- | --- |
| SEED-CANDIDATE | 0 | 0 |
| MANUAL-REVIEW | 4 | 77 |
| LIKELY-DATA | 90 | 1875 |

## Screens

- Impossible/erased/out-of-ROM branch-target screen: **45/94** candidates flagged.
- Repeated-neighbor/data-shape screen: **54/94** candidates flagged.
- Adjacent covered fallthrough screen: **1/94** candidates flagged.
- Direct control reference screen remains **0/94** if phase693 totals are stable.

## Highest Scoring Candidates

| rank | bucket | score | range | len | reasons | refs | targets | boundary | first bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | MANUAL-REVIEW | 1 | 0x08983D..0x089856 | 26 | plausible-covered-target | none | rst@0x08984B->0x000000 covered | prev rst 0x38 @ 0x089837 d=5; next ld bc, 0xc48700 @ 0x089857 d=0 | F9 09 00 80 00 01 09 00 80 00 01 09 00 80 C7 E1 |
| 2 | MANUAL-REVIEW | 1 | 0x0A169D..0x0A16AF | 19 | adjacent-covered-fallthrough, addressed-as-data/literal | raw24@0x0A027F->0x0A16A0, raw24@0x0A0282->0x0A16A6 | jr-conditional@0x0A169D->0x0A16A0 uncovered, jr-conditional@0x0A16A3->0x0A16A6 uncovered, jr-conditional@0x0A16A9->0x0A16AC uncovered | prev halt @ 0x0A169C d=0; next halt @ 0x0A16B0 d=0 | 28 01 29 26 04 77 28 01 29 27 06 75 28 01 2B 31 |
| 3 | MANUAL-REVIEW | 1 | 0x0A57B7..0x0A57C9 | 19 | plausible-covered-target | none | jr@0x0A57B9->0x0A57D2 covered, jr@0x0A57BE->0x0A57D7 covered | prev jr 0x0a57ce @ 0x0A57B5 d=0; next ld (bc), a @ 0x0A57CA d=0 | 16 36 18 17 16 36 19 18 17 16 02 03 22 23 02 06 |
| 4 | MANUAL-REVIEW | 1 | 0x08B8F1..0x08B8FD | 13 | plausible-covered-target | none | jp-conditional@0x08B8F3->0x08D024 covered | prev ret @ 0x08B8F0 d=0; next ex af, af' @ 0x08B8FE d=0 | BD 08 F2 24 D0 08 0F FE 91 00 00 0A 0A |
| 5 | LIKELY-DATA | 0 | 0x05915F..0x059179 | 27 | plausible-covered-target, zero-heavy | none | jp-conditional@0x059162->0x00D400 covered, jp-conditional@0x05916A->0x00F400 covered, jp-conditional@0x059170->0x00D900 covered, call-conditional@0x059176->0x00FA00 covered | prev rst 0x28 @ 0x05915E d=0; next ld sp, hl @ 0x05917A d=0 | 00 D3 00 D2 00 D4 00 D6 00 F3 00 F2 00 F4 00 F6 |
| 6 | LIKELY-DATA | 0 | 0x086CFB..0x086D15 | 27 | none | none | none | prev rst 0x28 @ 0x086CFA d=0; next ld (hl), e @ 0x086D16 d=0 | 6D 08 B1 6E 08 ED 70 08 11 6F 08 68 73 08 91 73 |
| 7 | LIKELY-DATA | 0 | 0x0044BB..0x0044D3 | 25 | plausible-covered-target, font/bitmap-like | none | jr@0x0044BB->0x00447D covered, jr-conditional@0x0044BD->0x0044B7 covered, jr@0x0044C2->0x0044A4 uncovered, jr-conditional@0x0044C4->0x0044B6 covered | prev jr 0x00447b @ 0x0044B9 d=0; next ret nz @ 0x0044D4 d=0 | 18 C0 38 F8 F0 F8 E0 18 E0 38 F0 70 38 60 18 C0 |
| 8 | LIKELY-DATA | 0 | 0x0050A5..0x0050BD | 25 | plausible-covered-target, font/bitmap-like | none | jr@0x0050A5->0x005067 uncovered, jr@0x0050A7->0x005089 uncovered, jr-conditional@0x0050A9->0x005123 covered, jr-conditional@0x0050AC->0x005086 uncovered | prev jr 0x005065 @ 0x0050A3 d=0; next ret nz @ 0x0050BE d=0 | 18 C0 18 E0 38 78 F8 38 D8 08 80 18 C0 30 60 00 |
| 9 | LIKELY-DATA | 0 | 0x059244..0x059259 | 22 | none | none | none | prev jr 0x0591e4 @ 0x059242 d=0; next push bc @ 0x05925A d=0 | 05 FD 97 05 01 98 05 84 A4 05 00 00 00 16 95 05 |
| 10 | LIKELY-DATA | 0 | 0x04F76B..0x04F77F | 21 | addressed-as-data/literal, plausible-covered-target | raw24@0x04F286->0x04F76B, raw24@0x04F289->0x04F771 | rst@0x04F76C->0x000028 covered | prev rst 0x28 @ 0x04F76A d=0; next ld h, h @ 0x04F780 d=0 | 00 5B EF 01 6E 00 00 02 BB 01 28 6E 70 6D 74 C1 |
| 11 | LIKELY-DATA | 0 | 0x087A1F..0x087A32 | 20 | addressed-as-data/literal, plausible-covered-target | raw24@0x088C57->0x087A27 | jr-conditional@0x087A27->0x087A06 covered | prev rst 0x00 @ 0x087A1E d=0; next add hl, de @ 0x087A3A d=7 | FE 15 FE 22 FE 23 FE 24 30 DD CB 00 3F 01 33 01 |
| 12 | LIKELY-DATA | 0 | 0x0045F9..0x00460B | 19 | addressed-as-data/literal, plausible-covered-target | raw24@0x008A62->0x004601, raw24@0x036696->0x004601 | jr@0x0045F9->0x0045DB covered, jr@0x0045FB->0x0045ED covered, jr@0x0045FD->0x0045D7 covered, jr@0x0045FF->0x0045D9 covered | prev jr 0x0045d9 @ 0x0045F7 d=0; next ret nz @ 0x00460C d=0 | 18 E0 18 F0 18 D8 18 D8 18 C8 98 C8 98 C0 D8 C0 |
| 13 | LIKELY-DATA | 0 | 0x006C7B..0x006C8D | 19 | none | none | none | prev rst 0x18 @ 0x006C7A d=0; next ld bc, 0x002009 @ 0x006C8E d=0 | 9E D5 16 F4 22 27 B0 82 86 E0 2D 33 C5 15 9C E1 |
| 14 | LIKELY-DATA | 0 | 0x08B4CC..0x08B4DD | 18 | plausible-covered-target, zero-heavy | none | jr-conditional@0x08B4D2->0x08B4F4 covered, jp-conditional@0x08B4D5->0x000000 covered | prev ret @ 0x08B4CB d=0; next nop @ 0x08B4DE d=0 | 01 00 00 C4 00 D0 20 20 FB D2 00 00 00 00 2C 02 |
| 15 | LIKELY-DATA | 0 | 0x0A0489..0x0A049A | 18 | addressed-as-data/literal, plausible-covered-target | raw24@0x09F9D0->0x0A048B, raw24@0x09F9D6->0x0A048E | jr-conditional@0x0A0493->0x0A04E9 covered | prev jr 0x0a0409 @ 0x0A0487 d=0; next ld d, l @ 0x0A049B d=0 | 01 2B 81 01 2D 53 04 46 69 78 20 54 05 48 6F 72 |
| 16 | LIKELY-DATA | 0 | 0x0BB0A5..0x0BB0B5 | 17 | none | none | none | prev jr 0x0bb056 @ 0x0BB0A3 d=0; next or c @ 0x0BB0B6 d=0 | 0B 1B B1 0B 2A B1 0B 33 B1 0B 40 B1 0B 5B B1 0B |
| 17 | LIKELY-DATA | 0 | 0x0043A3..0x0043B1 | 15 | plausible-covered-target, font/bitmap-like | none | jr@0x0043A3->0x004385 covered, jr-conditional@0x0043A5->0x00441F covered, jr-conditional@0x0043A8->0x00438A covered, jr-conditional@0x0043AA->0x00438C covered | prev jr 0x004363 @ 0x0043A1 d=0; next ret nz @ 0x0043B2 d=0 | 18 E0 38 78 F0 38 E0 38 E0 78 F0 E0 38 C0 18 |
| 18 | LIKELY-DATA | -1 | 0x08DDDC..0x08DDF7 | 28 | plausible-covered-target, zero-heavy, little-endian-table-shape | none | jr-conditional@0x08DDDC->0x08DE02 covered | prev rst 0x28 @ 0x08DDDB d=0; next ld a, (0xd010f4) @ 0x08DDF8 d=0 | 28 24 00 22 25 00 23 BF 00 25 C1 00 26 BC 00 27 |
| 19 | LIKELY-DATA | -1 | 0x0BCAAC..0x0BCAC7 | 28 | signature-x6 | none | none | prev rst 0x38 @ 0x0BCAAB d=0; next ld hl, 0xfffffd @ 0x0BCAC8 d=0 | 01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00 |
| 20 | LIKELY-DATA | -1 | 0x0BCAEF..0x0BCB0A | 28 | signature-x6 | none | none | prev rst 0x38 @ 0x0BCAEE d=0; next ld hl, 0xfffffd @ 0x0BCB0B d=0 | 01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00 |
| 21 | LIKELY-DATA | -1 | 0x004AB9..0x004AD3 | 27 | plausible-covered-target, zero-heavy, font/bitmap-like | none | jr@0x004AB9->0x004B33 covered, jr-conditional@0x004ABC->0x004AB6 covered, jr@0x004ABF->0x004AC1 uncovered, jr@0x004AC1->0x004ADB covered | prev jr 0x004a79 @ 0x004AB7 d=0; next nop @ 0x004AD4 d=0 | 18 78 F8 38 F8 00 18 00 18 18 F0 38 E0 00 00 00 |
| 22 | LIKELY-DATA | -1 | 0x005302..0x00531B | 26 | addressed-as-data/literal, plausible-covered-target, font/bitmap-like | raw24@0x014D24->0x005303, raw24@0x043015->0x005304 | jr-conditional@0x005302->0x00533C covered, jr-conditional@0x005304->0x00531E covered, jr-conditional@0x005306->0x005320 uncovered, jr-conditional@0x005308->0x005342 covered | prev jr 0x0052f2 @ 0x005300 d=0; next jr c, 0x00531e @ 0x00531C d=0 | 38 38 30 18 30 18 38 38 38 F0 30 E0 30 00 70 00 |
| 23 | LIKELY-DATA | -1 | 0x003E73..0x003E89 | 23 | addressed-as-data/literal, plausible-covered-target, font/bitmap-like | raw24@0x04AE1B->0x003E7F, raw24@0x04C829->0x003E77 | jr-conditional@0x003E73->0x003EE5 uncovered, jr-conditional@0x003E76->0x003E58 covered, jr@0x003E78->0x003E3A covered, jr-conditional@0x003E7A->0x003E5C covered | prev jr 0x003e53 @ 0x003E71 d=0; next nop @ 0x003E8A d=0 | 38 70 70 38 E0 18 C0 38 E0 70 70 E0 38 C0 18 80 |
| 24 | LIKELY-DATA | -1 | 0x005067..0x00507A | 20 | plausible-covered-target, font/bitmap-like, signature-x4 | none | jr@0x005067->0x005029 covered, jr@0x005069->0x00502B covered, jr@0x00506B->0x00502D uncovered, jr@0x00506D->0x00502F uncovered | prev jr 0x005027 @ 0x005065 d=0; next add a, b @ 0x00507B d=0 | 18 C0 18 C0 18 C0 18 C0 18 60 30 78 F0 38 E0 00 |

## Strongest Data / False-Positive Signals

| rank | score | range | len | data reasons | targets | boundary | first bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | -6 | 0x0A4B97..0x0A4BB2 | 28 | zero-heavy, 0xCC-fill, signature-x3 | call-conditional@0x0A4B98->0xCCCCCC outside/uncovered, call-conditional@0x0A4B9C->0xFCCCCC outside/uncovered | prev jr 0x0a4bc7 @ 0x0A4B95 d=0; next call z, 0xcccccc @ 0x0A4BB3 d=0 | 00 CC CC CC CC CC CC CC FC 78 00 00 00 00 00 00 |
| 2 | -6 | 0x03F6F8..0x03F709 | 18 | zero-heavy, signature-x2 | jp-conditional@0x03F6F9->0x1BFA1A erased/uncovered, jp-conditional@0x03F6FD->0xB4FA1C outside/uncovered | prev jr 0x03f6f2 @ 0x03F6F6 d=0; next nop @ 0x03F70A d=0 | 19 FA 1A FA 1B FA 1C FA B4 00 43 00 35 00 45 00 |
| 3 | -5 | 0x0A43B8..0x0A43D2 | 27 | zero-heavy, font/bitmap-like | jr@0x0A43BC->0x0A43BE uncovered, jr@0x0A43BE->0x0A43C0 uncovered, jr@0x0A43C0->0x0A43C2 uncovered, jr@0x0A43C2->0x0A43C4 uncovered | prev jp 0x006600 @ 0x0A43B4 d=0; next nop @ 0x0A43D3 d=0 | 7E 00 3C 00 18 00 18 00 18 00 18 00 08 00 00 FC |
| 4 | -5 | 0x0A52DB..0x0A52F2 | 24 | zero-heavy, 0xCC-fill, little-endian-table-shape | call-conditional@0x0A52DD->0x00C700 covered, jp@0x0A52E1->0x00CE00 covered, call-conditional@0x0A52E5->0x000800 covered, call-conditional@0x0A52F0->0xFCFCCC outside/uncovered | prev jp 0x00c300 @ 0x0A52D7 d=0; next call m, 0x000000 @ 0x0A52F3 d=0 | CE 00 CC 00 C7 00 C3 00 CE 00 CC 00 08 00 00 00 |
| 5 | -5 | 0x0AEAC7..0x0AEADE | 24 | signature-x2 | jp-conditional@0x0AEAC8->0xE6E6FE outside/uncovered | prev rst 0x20 @ 0x0AEAC6 d=0; next jp (hl) @ 0x0AEADF d=0 | 0A FA FE E6 E6 0A BA FB EE E7 0A BB FB 5E E9 0A |
| 6 | -5 | 0x0AEA0B..0x0AEA1E | 20 | signature-x2 | call-conditional@0x0AEA10->0x74610A outside/uncovered, call-conditional@0x0AEA14->0x7A640A outside/uncovered, call-conditional@0x0AEA18->0x82650A outside/uncovered, call-conditional@0x0AEA1C->0xE06B0A outside/uncovered | prev rst 0x38 @ 0x0AEA0A d=0; next ret po @ 0x0AEA1F d=0 | 00 00 00 60 6E EC 0A 61 74 EC 0A 64 7A EC 0A 65 |
| 7 | -5 | 0x0A49A5..0x0A49B2 | 14 | zero-heavy, font/bitmap-like, signature-x4 | jr-conditional@0x0A49A6->0x0A4A20 covered, call-conditional@0x0A49A8->0x7CC0F8 outside/uncovered, jr-conditional@0x0A49AC->0x0A49AE uncovered | prev jr 0x0a49d5 @ 0x0A49A3 d=0; next nop @ 0x0A49B3 d=0 | 00 30 78 CC F8 C0 7C 38 00 00 00 00 00 00 |
| 8 | -4 | 0x05CD1D..0x05CD37 | 27 | addressed-as-data/literal, impossible-target | call-conditional@0x05CD1E->0xCD6705 outside/uncovered, call@0x05CD24->0xCD6C05 outside/uncovered, call@0x05CD2A->0xCD7005 outside/uncovered | prev ret @ 0x05CD1C d=0; next rrc h @ 0x05CD38 d=0 | 14 CC 05 67 CD 05 3C CD 05 6C CD 05 33 CD 05 70 |
| 9 | -4 | 0x09C26B..0x09C285 | 27 | little-endian-table-shape | rst@0x09C26C->0x000018 covered, jp@0x09C26D->0xC3E409 outside/uncovered, jp@0x09C273->0xC3EE09 outside/uncovered, jp@0x09C279->0xC3A609 outside/uncovered | prev jp 0xc37909 @ 0x09C267 d=0; next add hl, bc @ 0x09C286 d=0 | 09 DF C3 09 E4 C3 09 E9 C3 09 EE C3 09 9D C3 09 |
| 10 | -4 | 0x050690..0x0506A9 | 26 | addressed-as-data/literal, impossible-target | jp@0x05069A->0x5DC72C outside/uncovered | prev jp 0x5dc72c @ 0x05068C d=0; next ld l, h @ 0x0506AA d=0 | 29 00 00 1B BB 01 28 78 C1 2C C3 2C C7 5D 29 00 |
| 11 | -4 | 0x0A0121..0x0A013A | 26 | addressed-as-data/literal, impossible-target | jp-conditional@0x0A0126->0xF60A13 outside/uncovered | prev jp 0xd00a13 @ 0x0A011D d=0; next ld (hl), l @ 0x0A013B d=0 | 13 0A DD 13 0A EA 13 0A F6 13 0A 00 14 0A 0A 14 |
| 12 | -4 | 0x0AB3E3..0x0AB3FC | 26 | addressed-as-data/literal, impossible-target | jp@0x0AB3E5->0xC33E81 outside/uncovered, jp@0x0AB3EB->0xC33C81 outside/uncovered | prev jp 0xc31881 @ 0x0AB3DF d=0; next ld (hl), b @ 0x0AB3FD d=0 | 82 00 C3 81 3E C3 82 00 C3 81 3C C3 82 00 70 72 |
| 13 | -4 | 0x09C2CE..0x09C2E5 | 24 | addressed-as-data/literal, impossible-target | jp@0x09C2D0->0xC34709 outside/uncovered, jp@0x09C2D6->0xC4AE09 outside/uncovered, call-conditional@0x09C2DB->0x7109C2 outside/uncovered, call-conditional@0x09C2DF->0xC47709 outside/uncovered | prev jp 0xc34309 @ 0x09C2CA d=0; next di @ 0x09C2E6 d=0 | 09 34 C3 09 47 C3 09 4C C3 09 AE C4 09 E4 C2 09 |
| 14 | -4 | 0x0A5157..0x0A516D | 23 | 0xCC-fill | call-conditional@0x0A515C->0x30CC30 erased/uncovered, call-conditional@0x0A5160->0x30FC30 erased/uncovered, call-conditional@0x0A5164->0x30CC30 erased/uncovered | prev rst 0x38 @ 0x0A5155 d=1; next ret p @ 0x0A5173 d=5 | 0C 0F F0 0F F0 CC 30 CC 30 FC 30 FC 30 CC 30 CC |
| 15 | -4 | 0x0A51BB..0x0A51D1 | 23 | 0xCC-fill | call-conditional@0x0A51C0->0xC0CCC0 outside/uncovered, call-conditional@0x0A51C4->0xF0FCF0 outside/uncovered, call-conditional@0x0A51C8->0xC0CCC0 outside/uncovered | prev rst 0x08 @ 0x0A51B3 d=7; next rst 0x38 @ 0x0A51D3 d=1 | 0C 0F C0 0F C0 CC C0 CC C0 FC F0 FC F0 CC C0 CC |
| 16 | -4 | 0x04766F..0x047684 | 22 | signature-x2 | jp-conditional@0x04766F->0xCDCCCB outside/uncovered, jp-conditional@0x047677->0xD5D4D3 outside/uncovered, jp-conditional@0x04767F->0xDDDCDB outside/uncovered | prev ret @ 0x04766E d=0; next ret po @ 0x047685 d=0 | CA CB CC CD CE CF D0 D1 D2 D3 D4 D5 D6 D7 D8 D9 |
| 17 | -4 | 0x0874C0..0x0874D5 | 22 | addressed-as-data/literal, impossible-target | jp-conditional@0x0874D4->0x8E3A15 outside/uncovered | prev rst 0x38 @ 0x0874B7 d=8; next ld a, (0xd0058e) @ 0x0874D6 d=0 | A5 FB BD FB F8 01 01 70 00 54 01 01 72 00 C9 01 |
| 18 | -4 | 0x09CC64..0x09CC79 | 22 | addressed-as-data/literal, impossible-target | call-conditional@0x09CC65->0xCDA209 outside/uncovered, call@0x09CC6B->0xCDA709 outside/uncovered, call@0x09CC71->0xCDC109 outside/uncovered | prev jp 0x09cec3 @ 0x09CC60 d=0; next res 6, (iy+73) @ 0x09CC7A d=0 | 7A CC 09 A2 CD 09 91 CD 09 A7 CD 09 AC CD 09 C1 |
| 19 | -4 | 0x047575..0x047589 | 21 | signature-x2 | jp-conditional@0x047575->0xEDECEB outside/uncovered, jp-conditional@0x04757D->0xF5F4F3 outside/uncovered, jp-conditional@0x047585->0xFDFCFB outside/uncovered | prev jp (hl) @ 0x047574 d=0; next push ix @ 0x04758B d=1 | EA EB EC ED EE EF F0 F1 F2 F3 F4 F5 F6 F7 F8 F9 |
| 20 | -4 | 0x04768F..0x0476A3 | 21 | signature-x2 | jp-conditional@0x04768F->0xEDECEB outside/uncovered, jp-conditional@0x047697->0xF5F4F3 outside/uncovered, jp-conditional@0x04769F->0xFDFCFB outside/uncovered | prev jp (hl) @ 0x04768E d=0; next pop af @ 0x0476A5 d=1 | EA EB EC ED EE EF F0 F1 F2 F3 F4 F5 F6 F7 F8 F9 |
| 21 | -4 | 0x087221..0x087235 | 21 | addressed-as-data/literal, impossible-target | jp-conditional@0x087226->0x01F3FB erased/uncovered, call-conditional@0x08722B->0x51FC50 outside/uncovered, call-conditional@0x087230->0x53FC52 outside/uncovered, call-conditional@0x087234->0x55FC54 outside/uncovered | prev rst 0x28 @ 0x087220 d=0; next call m, 0x56fc55 @ 0x087236 d=0 | FB F0 FB F1 FB F2 FB F3 01 0A 52 FC 50 FC 51 FC |
| 22 | -4 | 0x09C925..0x09C939 | 21 | addressed-as-data/literal, impossible-target | jp-conditional@0x09C927->0xCAD809 outside/uncovered, jp-conditional@0x09C92D->0xCAB209 outside/uncovered | prev ret @ 0x09C924 d=0; next dec b @ 0x09C93A d=0 | 09 C1 CA 09 D8 CA 09 BC CA 09 B2 CA 09 39 C9 09 |
| 23 | -4 | 0x006C26..0x006C39 | 20 | addressed-as-data/literal, impossible-target | call-conditional@0x006C2C->0xC1A18A outside/uncovered | prev jp 0xa25ce1 @ 0x006C22 d=0; next ld l, a @ 0x006C3A d=0 | 60 DE 7D 2F 0C 47 DC 8A A1 C1 D3 A6 8F 49 75 2A |
| 24 | -4 | 0x04E78F..0x04E7A1 | 19 | addressed-as-data/literal, impossible-target | call-conditional@0x04E794->0xE8FE8A outside/uncovered, jp-conditional@0x04E79B->0xFBC700 outside/uncovered, call-conditional@0x04E79F->0xFF6DFC outside/uncovered | prev rst 0x38 @ 0x04E78E d=0; next cp 0x13 @ 0x04E7AA d=8 | 47 FD D9 FE 34 FC 8A FE E8 FE 23 FB CA 00 C7 FB |

## Interpretation

- This pass found no high-confidence seed targets in the phase693 CODE? set. The lack of direct control refs remains the dominant result.
- The highest-scoring entries are still manual-review at best: they mostly gain points from being adjacent to covered instructions, not from real incoming branches.
- Most candidates carry data/table signatures such as repeated exact byte signatures, bitmap-like byte masks, little-endian table shape, or impossible branch targets like `0xCCCCCC` and out-of-ROM addresses.
- The next coverage push should not blindly seed these 94 ranges. A useful future seed edit needs a new dynamic trace or a real indirect dispatch table owner that points at one candidate.

## Compact JSON

```json
{
  "pass": true,
  "totalCovered": 713656,
  "totalUncovered": 31921,
  "rangeCount": 2946,
  "codeCandidateCount": 94,
  "codeCandidateBytes": 1952,
  "buckets": {
    "LIKELY-DATA": {
      "count": 90,
      "bytes": 1875
    },
    "MANUAL-REVIEW": {
      "count": 4,
      "bytes": 77
    }
  },
  "seedCandidateCount": 0,
  "manualReviewCount": 4,
  "likelyDataCount": 90,
  "directControlTotal": 0,
  "nonControlRefBackedCount": 43,
  "impossibleTargetCount": 45,
  "repeatedPatternCount": 54,
  "fallthroughCandidateCount": 1,
  "highestScoring": [
    {
      "bucket": "MANUAL-REVIEW",
      "score": 1,
      "start": "0x08983D",
      "end": "0x089856",
      "len": 26,
      "reasons": [
        "plausible-covered-target"
      ],
      "refs": "none",
      "targets": "rst@0x08984B->0x000000 covered",
      "boundary": "prev rst 0x38 @ 0x089837 d=5; next ld bc, 0xc48700 @ 0x089857 d=0",
      "first16": "F9 09 00 80 00 01 09 00 80 00 01 09 00 80 C7 E1"
    },
    {
      "bucket": "MANUAL-REVIEW",
      "score": 1,
      "start": "0x0A169D",
      "end": "0x0A16AF",
      "len": 19,
      "reasons": [
        "adjacent-covered-fallthrough",
        "addressed-as-data/literal"
      ],
      "refs": "raw24@0x0A027F->0x0A16A0, raw24@0x0A0282->0x0A16A6",
      "targets": "jr-conditional@0x0A169D->0x0A16A0 uncovered, jr-conditional@0x0A16A3->0x0A16A6 uncovered, jr-conditional@0x0A16A9->0x0A16AC uncovered",
      "boundary": "prev halt @ 0x0A169C d=0; next halt @ 0x0A16B0 d=0",
      "first16": "28 01 29 26 04 77 28 01 29 27 06 75 28 01 2B 31"
    },
    {
      "bucket": "MANUAL-REVIEW",
      "score": 1,
      "start": "0x0A57B7",
      "end": "0x0A57C9",
      "len": 19,
      "reasons": [
        "plausible-covered-target"
      ],
      "refs": "none",
      "targets": "jr@0x0A57B9->0x0A57D2 covered, jr@0x0A57BE->0x0A57D7 covered",
      "boundary": "prev jr 0x0a57ce @ 0x0A57B5 d=0; next ld (bc), a @ 0x0A57CA d=0",
      "first16": "16 36 18 17 16 36 19 18 17 16 02 03 22 23 02 06"
    },
    {
      "bucket": "MANUAL-REVIEW",
      "score": 1,
      "start": "0x08B8F1",
      "end": "0x08B8FD",
      "len": 13,
      "reasons": [
        "plausible-covered-target"
      ],
      "refs": "none",
      "targets": "jp-conditional@0x08B8F3->0x08D024 covered",
      "boundary": "prev ret @ 0x08B8F0 d=0; next ex af, af' @ 0x08B8FE d=0",
      "first16": "BD 08 F2 24 D0 08 0F FE 91 00 00 0A 0A"
    },
    {
      "bucket": "LIKELY-DATA",
      "score": 0,
      "start": "0x05915F",
      "end": "0x059179",
      "len": 27,
      "reasons": [
        "plausible-covered-target",
        "zero-heavy"
      ],
      "refs": "none",
      "targets": "jp-conditional@0x059162->0x00D400 covered, jp-conditional@0x05916A->0x00F400 covered, jp-conditional@0x059170->0x00D900 covered, call-conditional@0x059176->0x00FA00 covered",
      "boundary": "prev rst 0x28 @ 0x05915E d=0; next ld sp, hl @ 0x05917A d=0",
      "first16": "00 D3 00 D2 00 D4 00 D6 00 F3 00 F2 00 F4 00 F6"
    },
    {
      "bucket": "LIKELY-DATA",
      "score": 0,
      "start": "0x086CFB",
      "end": "0x086D15",
      "len": 27,
      "reasons": [],
      "refs": "none",
      "targets": "none",
      "boundary": "prev rst 0x28 @ 0x086CFA d=0; next ld (hl), e @ 0x086D16 d=0",
      "first16": "6D 08 B1 6E 08 ED 70 08 11 6F 08 68 73 08 91 73"
    },
    {
      "bucket": "LIKELY-DATA",
      "score": 0,
      "start": "0x0044BB",
      "end": "0x0044D3",
      "len": 25,
      "reasons": [
        "plausible-covered-target",
        "font/bitmap-like"
      ],
      "refs": "none",
      "targets": "jr@0x0044BB->0x00447D covered, jr-conditional@0x0044BD->0x0044B7 covered, jr@0x0044C2->0x0044A4 uncovered, jr-conditional@0x0044C4->0x0044B6 covered",
      "boundary": "prev jr 0x00447b @ 0x0044B9 d=0; next ret nz @ 0x0044D4 d=0",
      "first16": "18 C0 38 F8 F0 F8 E0 18 E0 38 F0 70 38 60 18 C0"
    },
    {
      "bucket": "LIKELY-DATA",
      "score": 0,
      "start": "0x0050A5",
      "end": "0x0050BD",
      "len": 25,
      "reasons": [
        "plausible-covered-target",
        "font/bitmap-like"
      ],
      "refs": "none",
      "targets": "jr@0x0050A5->0x005067 uncovered, jr@0x0050A7->0x005089 uncovered, jr-conditional@0x0050A9->0x005123 covered, jr-conditional@0x0050AC->0x005086 uncovered",
      "boundary": "prev jr 0x005065 @ 0x0050A3 d=0; next ret nz @ 0x0050BE d=0",
      "first16": "18 C0 18 E0 38 78 F8 38 D8 08 80 18 C0 30 60 00"
    },
    {
      "bucket": "LIKELY-DATA",
      "score": 0,
      "start": "0x059244",
      "end": "0x059259",
      "len": 22,
      "reasons": [],
      "refs": "none",
      "targets": "none",
      "boundary": "prev jr 0x0591e4 @ 0x059242 d=0; next push bc @ 0x05925A d=0",
      "first16": "05 FD 97 05 01 98 05 84 A4 05 00 00 00 16 95 05"
    },
    {
      "bucket": "LIKELY-DATA",
      "score": 0,
      "start": "0x04F76B",
      "end": "0x04F77F",
      "len": 21,
      "reasons": [
        "addressed-as-data/literal",
        "plausible-covered-target"
      ],
      "refs": "raw24@0x04F286->0x04F76B, raw24@0x04F289->0x04F771",
      "targets": "rst@0x04F76C->0x000028 covered",
      "boundary": "prev rst 0x28 @ 0x04F76A d=0; next ld h, h @ 0x04F780 d=0",
      "first16": "00 5B EF 01 6E 00 00 02 BB 01 28 6E 70 6D 74 C1"
    },
    {
      "bucket": "LIKELY-DATA",
      "score": 0,
      "start": "0x087A1F",
      "end": "0x087A32",
      "len": 20,
      "reasons": [
        "addressed-as-data/literal",
        "plausible-covered-target"
      ],
      "refs": "raw24@0x088C57->0x087A27",
      "targets": "jr-conditional@0x087A27->0x087A06 covered",
      "boundary": "prev rst 0x00 @ 0x087A1E d=0; next add hl, de @ 0x087A3A d=7",
      "first16": "FE 15 FE 22 FE 23 FE 24 30 DD CB 00 3F 01 33 01"
    },
    {
      "bucket": "LIKELY-DATA",
      "score": 0,
      "start": "0x0045F9",
      "end": "0x00460B",
      "len": 19,
      "reasons": [
        "addressed-as-data/literal",
        "plausible-covered-target"
      ],
      "refs": "raw24@0x008A62->0x004601, raw24@0x036696->0x004601",
      "targets": "jr@0x0045F9->0x0045DB covered, jr@0x0045FB->0x0045ED covered, jr@0x0045FD->0x0045D7 covered, jr@0x0045FF->0x0045D9 covered",
      "boundary": "prev jr 0x0045d9 @ 0x0045F7 d=0; next ret nz @ 0x00460C d=0",
      "first16": "18 E0 18 F0 18 D8 18 D8 18 C8 98 C8 98 C0 D8 C0"
    }
  ]
}
```


# Phase 695: Manual-Review Range Owner Search

Probe: `probe-phase695-manual-review-owner-search.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase695-manual-review-owner-search.mjs`

## Summary

- Manual-review ranges checked: **4**.
- Seedable direct control owners found: **0** ranges / **0** direct control refs.
- Non-control raw24 refs into ranges: **3**. Lifted non-control refs: **0**.
- Dynamic standard-path hits into any range: **0**.
- Covered bytes baseline: **713,656**.

## Owner Verdicts

| range | len | seedable owner | owner signals | raw control | lifted control | raw24 non-control | dynamic hits |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x08983D..0x089856 | 26 | no | surrounding-block-has-owner | 0 | 0 | 0 | 0 |
| 0x0A169D..0x0A16AF | 19 | no | raw24-noncontrol-into-range, surrounding-block-has-owner | 0 | 0 | 3 | 0 |
| 0x0A57B7..0x0A57C9 | 19 | no | surrounding-block-has-owner | 0 | 0 | 0 | 0 |
| 0x08B8F1..0x08B8FD | 13 | no | surrounding-block-has-owner | 0 | 0 | 0 | 0 |

## Dynamic Trace Screen

| stage | entry | steps | termination | lastPc | hits | first missing blocks |
| --- | --- | --- | --- | --- | --- | --- |
| boot_000000 | 0x000000 | 20000 | max_steps | 0x001CC0 | 0 | 0x013D4A |
| kernel_init_08c331 | 0x08C331 | 100000 | max_steps | 0x000A92 | 0 | none |
| post_init_0802b2 | 0x0802B2 | 100 | max_steps | 0x0158BC | 0 | 0xFFFFFF |
| cold_idle_0019be | 0x0019BE | 192290 | halt | 0x0019B5 | 0 | 0xD18C22, 0xD18C41 |
| launch_init_09dd62 | 0x09DD62 | 83858 | halt | 0x0019B5 | 0 | none |
| repaint_058241 | 0x058241 | 205616 | halt | 0x0019B5 | 0 | none |
| warm_key_02fd8f | 0x02FD8F | 192808 | halt | 0x0019B5 | 0 | none |

No standard boot/init/repaint/warm-key scenario entered any of the four manual-review ranges as a lifted block or missing block.

## 0x08983D..0x089856

- First bytes: `F9 09 00 80 00 01 09 00 80 00 01 09 00 80 C7 E1 09 00 80 C4 21 F9 00 80`
- Direct raw control refs into range: none.
- Lifted control refs into range: none.
- Raw24 refs into range: none.
- Lifted non-control refs into range: none.
- Previous lifted instruction: 0x089837 rst 0x38 (block 0x089837).
- Next lifted instruction: 0x089857 ld bc, 0xc48700 (block 0x089857).
- Neighbor lifted blocks: prev=0x089837..0x089837 next=0x089857..0x08985C.
- Best nearby 3-byte pointer alignment: align=1, records=42, validROM=42, coveredROM=42, nearTarget=0, ramLike=0.

### Decode Window

| pc | bytes | decode |
| --- | --- | --- |
| 0x08983D | F9 | ld-sp-hl |
| 0x08983E | 09 | add-pair dest=HL src=BC |
| 0x08983F | 00 | nop |
| 0x089840 | 80 | alu-reg ADD src=B |
| 0x089841 | 00 | nop |
| 0x089842 | 01 09 00 80 | ld-pair-imm pair=BC value=0x800009 |
| 0x089846 | 00 | nop |
| 0x089847 | 01 09 00 80 | ld-pair-imm pair=BC value=0x800009 |
| 0x08984B | C7 | rst target=0x000000 |
| 0x08984C | E1 | pop pair=HL |
| 0x08984D | 09 | add-pair dest=HL src=BC |
| 0x08984E | 00 | nop |
| 0x08984F | 80 | alu-reg ADD src=B |
| 0x089850 | C4 21 F9 00 | call-conditional cond=NZ target=0x00F921 |
| 0x089854 | 80 | alu-reg ADD src=B |
| 0x089855 | C4 20 01 00 | call-conditional cond=NZ target=0x000120 |

### Decoded Branch Targets

| pc | tag | target | covered | erased/outside |
| --- | --- | --- | --- | --- |
| 0x08984B | rst | 0x000000 | yes | no |
| 0x089850 | call-conditional | 0x00F921 | yes | no |
| 0x089855 | call-conditional | 0x000120 | no | no |

### Neighbor / Target Owners

| address | refs |
| --- | --- |
| 0x089837 | source-text@0x0897F7, source-text@0x089817, source-text@0x089837 |
| 0x089857 | source-text@0x089857 |
| 0x000000 | rst@0x001B00 block=0x001B00, rst@0x001B00 block=0x001AFD, rst@0x002400 block=0x002400, rst@0x006A6F block=0x006A6E, JP@0x026DF2, JP Z@0x03F7B4, JP Z@0x03F876, JP NC@0x08B4D5, source-text@0x000000, source-text@0x000000, source-text@0x000725, source-text@0x000861 |
| 0x00F921 | CALL NZ@0x089850 |

### Nearby Pointer Records

| align | records | validROM | coveredROM | nearTarget | ramLike | first records |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 42 | 42 | 42 | 0 | 0 | 0x0897E2->0x05FFFF*, 0x0897EB->0x000080*, 0x0897F1->0x000000*, 0x0897F4->0x008000*, 0x0897F7->0x000000*, 0x0897FA->0x000380*, 0x089800->0x000003*, 0x089803->0x038000*, 0x089806->0x000000*, 0x089809->0x001F80* |
| 2 | 40 | 40 | 39 | 0 | 0 | 0x0897EC->0x000000*, 0x0897EF->0x008000*, 0x0897F2->0x000000*, 0x0897F5->0x000080*, 0x0897FB->0x000003*, 0x0897FE->0x038000*, 0x089801->0x000000*, 0x089804->0x000380*, 0x08980A->0x00001F*, 0x089810->0x000000* |
| 0 | 38 | 38 | 37 | 0 | 0 | 0x0897EA->0x0080FF*, 0x0897ED->0x000000*, 0x0897F0->0x000080*, 0x0897F6->0x000000*, 0x0897F9->0x038000*, 0x0897FC->0x000000*, 0x0897FF->0x000380*, 0x089805->0x000003*, 0x08980B->0x000000*, 0x08980E->0x001F80* |

## 0x0A169D..0x0A16AF

- First bytes: `28 01 29 26 04 77 28 01 29 27 06 75 28 01 2B 31 29 28 06`
- Direct raw control refs into range: none.
- Lifted control refs into range: none.
- Raw24 refs into range: raw24@0x0A027F->0x0A16A0, raw24@0x0A0282->0x0A16A6, raw24@0x0A0285->0x0A16AE.
- Lifted non-control refs into range: none.
- Previous lifted instruction: 0x0A169C halt (block 0x0A1699).
- Next lifted instruction: 0x0A16B0 halt (block 0x0A16B0).
- Neighbor lifted blocks: prev=0x0A169B..0x0A169C next=0x0A16B0..0x0A16B0.
- Best nearby 3-byte pointer alignment: align=2, records=18, validROM=18, coveredROM=17, nearTarget=0, ramLike=0.

### Decode Window

| pc | bytes | decode |
| --- | --- | --- |
| 0x0A169D | 28 01 | jr-conditional cond=Z target=0x0A16A0 |
| 0x0A169F | 29 | add-pair dest=HL src=HL |
| 0x0A16A0 | 26 04 | ld-reg-imm dest=H value=0x04 |
| 0x0A16A2 | 77 | ld-ind-reg dest=HL src=A |
| 0x0A16A3 | 28 01 | jr-conditional cond=Z target=0x0A16A6 |
| 0x0A16A5 | 29 | add-pair dest=HL src=HL |
| 0x0A16A6 | 27 | daa |
| 0x0A16A7 | 06 75 | ld-reg-imm dest=B value=0x75 |
| 0x0A16A9 | 28 01 | jr-conditional cond=Z target=0x0A16AC |
| 0x0A16AB | 2B | dec-pair pair=HL |
| 0x0A16AC | 31 29 28 06 | ld-pair-imm pair=SP value=0x62829 |

### Decoded Branch Targets

| pc | tag | target | covered | erased/outside |
| --- | --- | --- | --- | --- |
| 0x0A169D | jr-conditional | 0x0A16A0 | no | no |
| 0x0A16A3 | jr-conditional | 0x0A16A6 | no | no |
| 0x0A16A9 | jr-conditional | 0x0A16AC | no | no |

### Neighbor / Target Owners

| address | refs |
| --- | --- |
| 0x0A169C | source-text@0x0A1699, source-text@0x0A169A, source-text@0x0A169B |
| 0x0A16B0 | jr-conditional@0x0A165B block=0x0A165B, jr-conditional@0x0A165B block=0x0A164A, return-source@0x0A164A, return-source@0x0A165B, source-text@0x0A16B0 |
| 0x0A169B | source-text@0x0A1699, source-text@0x0A169A, source-text@0x0A169B |

### Nearby Pointer Records

| align | records | validROM | coveredROM | nearTarget | ramLike | first records |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 18 | 18 | 17 | 0 | 0 | 0x0A1642->0x0B1632*, 0x0A1663->0x061ECE, 0x0A1666->0x012875*, 0x0A167B->0x062129*, 0x0A167E->0x012875*, 0x0A1693->0x042429*, 0x0A1696->0x012875*, 0x0A1699->0x042529*, 0x0A169C->0x012876*, 0x0A169F->0x042629* |
| 0 | 11 | 11 | 10 | 0 | 0 | 0x0A1673->0x062029*, 0x0A1676->0x012877*, 0x0A168B->0x062329, 0x0A168E->0x012877*, 0x0A16B5->0x062929*, 0x0A16B8->0x012877*, 0x0A16D6->0x012851*, 0x0A16E5->0x042E29*, 0x0A16EB->0x062F54*, 0x0A16FA->0x093154* |
| 1 | 9 | 9 | 9 | 0 | 0 | 0x0A166B->0x061F29*, 0x0A166E->0x012876*, 0x0A1683->0x062229*, 0x0A1686->0x012876*, 0x0A16AD->0x062829*, 0x0A16B0->0x012876*, 0x0A16CE->0x012851*, 0x0A16D1->0x082C29*, 0x0A16E0->0x012851* |

## 0x0A57B7..0x0A57C9

- First bytes: `16 36 18 17 16 36 19 18 17 16 02 03 22 23 02 06 03 22 23`
- Direct raw control refs into range: none.
- Lifted control refs into range: none.
- Raw24 refs into range: none.
- Lifted non-control refs into range: none.
- Previous lifted instruction: 0x0A57B5 jr 0x0a57ce (block 0x0A57A1).
- Next lifted instruction: 0x0A57CA ld (bc), a (block 0x0A57CA).
- Neighbor lifted blocks: prev=0x0A57AA..0x0A57B6 next=0x0A57CA..0x0A5805.
- Best nearby 3-byte pointer alignment: align=1, records=16, validROM=16, coveredROM=15, nearTarget=0, ramLike=0.

### Decode Window

| pc | bytes | decode |
| --- | --- | --- |
| 0x0A57B7 | 16 36 | ld-reg-imm dest=D value=0x36 |
| 0x0A57B9 | 18 17 | jr target=0x0A57D2 |
| 0x0A57BB | 16 36 | ld-reg-imm dest=D value=0x36 |
| 0x0A57BD | 19 | add-pair dest=HL src=DE |
| 0x0A57BE | 18 17 | jr target=0x0A57D7 |
| 0x0A57C0 | 16 02 | ld-reg-imm dest=D value=0x02 |
| 0x0A57C2 | 03 | inc-pair pair=BC |
| 0x0A57C3 | 22 23 02 06 | ld-pair-mem pair=HL addr=0x060223 |
| 0x0A57C7 | 03 | inc-pair pair=BC |
| 0x0A57C8 | 22 23 02 06 | ld-pair-mem pair=HL addr=0x060223 |

### Decoded Branch Targets

| pc | tag | target | covered | erased/outside |
| --- | --- | --- | --- | --- |
| 0x0A57B9 | jr | 0x0A57D2 | yes | no |
| 0x0A57BE | jr | 0x0A57D7 | yes | no |

### Neighbor / Target Owners

| address | refs |
| --- | --- |
| 0x0A57B5 | source-text@0x0A57A1, source-text@0x0A57AA |
| 0x0A57CA | source-text@0x0A57CA |
| 0x0A57AA | source-text@0x0A57A1, source-text@0x0A57AA |
| 0x0A57D2 | none |
| 0x0A57D7 | source-text@0x0A57CA, source-text@0x0A57D1 |

### Nearby Pointer Records

| align | records | validROM | coveredROM | nearTarget | ramLike | first records |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 16 | 16 | 15 | 0 | 0 | 0x0A5757->0x0A2718*, 0x0A575D->0x06AE78*, 0x0A576C->0x000000*, 0x0A5778->0x09C97E*, 0x0A577E->0x070208, 0x0A5781->0x040506*, 0x0A579F->0x08090A*, 0x0A57A8->0x060702*, 0x0A57AB->0x030405*, 0x0A57C0->0x030216* |
| 0 | 13 | 13 | 6 | 1 | 0 | 0x0A5759->0x073E0A*, 0x0A576B->0x000011*, 0x0A5771->0x0A577A, 0x0A577D->0x020814, 0x0A5780->0x050607, 0x0A579E->0x090A0B*, 0x0A57A7->0x07020C, 0x0A57AA->0x040506*, 0x0A57BF->0x021617, 0x0A57C5->0x030602 |
| 2 | 11 | 11 | 7 | 0 | 0 | 0x0A5761->0x00FFFF*, 0x0A576A->0x0011E5*, 0x0A577C->0x081413*, 0x0A577F->0x060702*, 0x0A5782->0x030405*, 0x0A579D->0x0A0BFC*, 0x0A57A6->0x020C0D, 0x0A57A9->0x050607, 0x0A57C4->0x060223*, 0x0A57CA->0x030602 |

## 0x08B8F1..0x08B8FD

- First bytes: `BD 08 F2 24 D0 08 0F FE 91 00 00 0A 0A`
- Direct raw control refs into range: none.
- Lifted control refs into range: none.
- Raw24 refs into range: none.
- Lifted non-control refs into range: none.
- Previous lifted instruction: 0x08B8F0 ret (block 0x08B8E2).
- Next lifted instruction: 0x08B8FE ex af, af' (block 0x08B8FE).
- Neighbor lifted blocks: prev=0x08B8E2..0x08B8F0 next=0x08B8FE..0x08B909.
- Best nearby 3-byte pointer alignment: align=1, records=48, validROM=44, coveredROM=40, nearTarget=0, ramLike=4.

### Decode Window

| pc | bytes | decode |
| --- | --- | --- |
| 0x08B8F1 | BD | alu-reg CP src=L |
| 0x08B8F2 | 08 | ex-af |
| 0x08B8F3 | F2 24 D0 08 | jp-conditional cond=P target=0x08D024 |
| 0x08B8F7 | 0F | rrca |
| 0x08B8F8 | FE 91 | alu-imm CP value=0x91 |
| 0x08B8FA | 00 | nop |
| 0x08B8FB | 00 | nop |
| 0x08B8FC | 0A | ld-reg-ind dest=A src=BC |
| 0x08B8FD | 0A | ld-reg-ind dest=A src=BC |

### Decoded Branch Targets

| pc | tag | target | covered | erased/outside |
| --- | --- | --- | --- | --- |
| 0x08B8F3 | jp-conditional | 0x08D024 | yes | no |

### Neighbor / Target Owners

| address | refs |
| --- | --- |
| 0x08B8F0 | source-text@0x08B8E2 |
| 0x08B8FE | source-text@0x08B8FE |
| 0x08B8E2 | return-source@0x08B8DE, return-source@0x08B8DF, source-text@0x08B8E2 |
| 0x08D024 | jp-conditional@0x0B7061 block=0x0B705C, jp-conditional@0x0B7061 block=0x0B7050, JP P@0x08B8F3, JP P@0x0B7061, source-text@0x08D01B, source-text@0x08D024, return-source@0x0B7050, return-source@0x0B705C |

### Nearby Pointer Records

| align | records | validROM | coveredROM | nearTarget | ramLike | first records |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 48 | 44 | 40 | 0 | 4 | 0x08B894->0x006EFE*, 0x08B897->0x060500*, 0x08B89A->0x020702, 0x08B8A0->0x000000*, 0x08B8A3->0xD00084, 0x08B8A9->0x000074*, 0x08B8AC->0x020406, 0x08B8AF->0x080207*, 0x08B8B8->0x04D000*, 0x08B8BE->0x040000* |
| 2 | 43 | 40 | 37 | 0 | 3 | 0x08B895->0x00006E*, 0x08B898->0x020605, 0x08B89B->0x000207*, 0x08B89E->0x00C700*, 0x08B8A4->0x00D000*, 0x08B8AA->0x060000*, 0x08B8AD->0x070204*, 0x08B8B0->0x000802*, 0x08B8B6->0x008408*, 0x08B8BC->0x0073FE* |
| 0 | 41 | 38 | 34 | 0 | 3 | 0x08B896->0x050000*, 0x08B899->0x070206, 0x08B89C->0x000002*, 0x08B89F->0x0000C7*, 0x08B8A2->0x008400*, 0x08B8A8->0x0074FE*, 0x08B8AB->0x040600*, 0x08B8AE->0x020702, 0x08B8B4->0x08BCEB*, 0x08B8B7->0xD00084 |

## Interpretation

- None of the four manual-review ranges has a direct raw or lifted control-flow owner. That keeps them below the bar for seed edits.
- The only in-range references found are non-control raw24/literal-style refs, so they are useful for data ownership but not executable reachability.
- The standard boot, launch-home init, repaint, and one warm key event did not enter any candidate as a lifted or missing block.
- Future work should treat these as coverage debt unless a new indirect dispatch table or dynamic trace proves executable ownership.

## Compact JSON

```json
{
  "pass": true,
  "totalCovered": 713656,
  "seedableCount": 0,
  "directControlCount": 0,
  "raw24NonControlCount": 3,
  "liftedNonControlCount": 0,
  "dynamicHitCount": 0,
  "ranges": [
    {
      "start": "0x08983D",
      "end": "0x089856",
      "len": 26,
      "seedableOwner": false,
      "ownerSignals": [
        "surrounding-block-has-owner"
      ],
      "rawControl": [],
      "liftedControl": [],
      "raw24": [],
      "liftedNonControl": [],
      "dynamicHits": []
    },
    {
      "start": "0x0A169D",
      "end": "0x0A16AF",
      "len": 19,
      "seedableOwner": false,
      "ownerSignals": [
        "raw24-noncontrol-into-range",
        "surrounding-block-has-owner"
      ],
      "rawControl": [],
      "liftedControl": [],
      "raw24": [
        {
          "pc": "0x0A027F",
          "target": "0x0A16A0",
          "controlOperand": false,
          "precedingOp": null
        },
        {
          "pc": "0x0A0282",
          "target": "0x0A16A6",
          "controlOperand": false,
          "precedingOp": null
        },
        {
          "pc": "0x0A0285",
          "target": "0x0A16AE",
          "controlOperand": false,
          "precedingOp": null
        }
      ],
      "liftedNonControl": [],
      "dynamicHits": []
    },
    {
      "start": "0x0A57B7",
      "end": "0x0A57C9",
      "len": 19,
      "seedableOwner": false,
      "ownerSignals": [
        "surrounding-block-has-owner"
      ],
      "rawControl": [],
      "liftedControl": [],
      "raw24": [],
      "liftedNonControl": [],
      "dynamicHits": []
    },
    {
      "start": "0x08B8F1",
      "end": "0x08B8FD",
      "len": 13,
      "seedableOwner": false,
      "ownerSignals": [
        "surrounding-block-has-owner"
      ],
      "rawControl": [],
      "liftedControl": [],
      "raw24": [],
      "liftedNonControl": [],
      "dynamicHits": []
    }
  ],
  "dynamicStages": [
    "boot_000000: steps=20000 term=max_steps last=0x001CC0 hits=0",
    "kernel_init_08c331: steps=100000 term=max_steps last=0x000A92 hits=0",
    "post_init_0802b2: steps=100 term=max_steps last=0x0158BC hits=0",
    "cold_idle_0019be: steps=192290 term=halt last=0x0019B5 hits=0",
    "launch_init_09dd62: steps=83858 term=halt last=0x0019B5 hits=0",
    "repaint_058241: steps=205616 term=halt last=0x0019B5 hits=0",
    "warm_key_02fd8f: steps=192808 term=halt last=0x0019B5 hits=0"
  ]
}
```


# Phase 25U - InsertMem Pointer Slots Cross-Reference

Names below are copied from `TI-84_Plus_CE/references/ti84pceg.inc` where an exact equate exists.

| Address | ti84pceg.inc Name | InsertMem Sub | Notes |
|---------|-------------------|---------------|-------|
| `0xD0066F` | `?iMathPtr1` | `0x0824FD` bulk via `0x0825D1` | Exact equate hit in the iMath/asm scratch cluster. |
| `0xD00672` | `?iMathPtr2` | `0x0824FD` bulk via `0x0825D1` | Exact equate hit in the iMath/asm scratch cluster. |
| `0xD00675` | `?iMathPtr3` | `0x0824FD` bulk via `0x0825D1` | Exact equate hit in the iMath/asm scratch cluster. |
| `0xD00678` | `?iMathPtr4` | `0x0824FD` bulk via `0x0825D1` | Exact equate hit in the iMath/asm scratch cluster. |
| `0xD0067B` | `?iMathPtr5` | `0x0824FD` bulk via `0x0825D1` | Exact equate hit in the iMath/asm scratch cluster. |
| `0xD0067E` | `?asm_data_ptr1` | `0x0824FD` bulk via `0x0825D1` | Exact equate hit; first named asm-data pointer. |
| `0xD00681` | `?asm_data_ptr2` | `0x0824FD` bulk via `0x0825D1` | Exact equate hit; second named asm-data pointer. |
| `0xD00684` | `-` | `0x0824FD` bulk via `0x0825D1` | No exact equate in `ti84pceg.inc`; 3-byte slot immediately before `?asm_ram = 0xD00687`. |
| `0xD0069F` | `-` | `0x0824FD` bulk via `0x0825D1` | No exact equate in `ti84pceg.inc`; inside the unlabeled `0xD00687-0xD006BF` scratch region after `?asm_ram`. |
| `0xD006A2` | `-` | `0x0824FD` bulk via `0x0825D1` | No exact equate in `ti84pceg.inc`; same unlabeled asm/app scratch region as `0xD0069F`. |
| `0xD0256A` | `?fmtMatMem` | `0x0824FD` bulk via `0x0825D1` | Exact equate hit; matrix-formatting scratch pointer. |
| `0xD025A0` | `?newDataPtr` | `0x0824FD` bulk via `0x0825D1` | Exact equate hit; points into the moved VAT data area. |
| `0xD0259A` | `?pTemp` | `0x082823` per-pointer via `signExtTemp` | Exact equate hit; already known from session 79. |
| `0xD0259D` | `?progPtr` | `0x082823` per-pointer via `signExtTemp` | Exact equate hit; already known from session 79. |
| `0xD0244E` | `?editSym` | `0x082823` per-pointer via `signExtTemp` | Exact equate hit; comment in `ti84pceg.inc` says "pointer to vat of variable being edited". |
| `0xD0257B` | `?tSymPtr1` | `0x082823` per-pointer via `signExtTemp` | Exact equate hit; in the temp-symbol / temp-memory cluster just before `tempMem`, `FPSbase`, `FPS`, and `OPBase`. |
| `0xD0257E` | `?tSymPtr2` | `0x082823` per-pointer via `signExtTemp` | Exact equate hit; paired with `?tSymPtr1`. |
| `0xD02581` | `?chkDelPtr3` | `0x082823` per-pointer via `signExtTemp` | Exact equate hit; delete-check pointer in the same cluster. |
| `0xD02584` | `?chkDelPtr4` | `0x082823` per-pointer via `signExtTemp` | Exact equate hit; paired with `?chkDelPtr3`. |
| `0xD02317` | `?begPC` | `0x0824D6` edit-buffer adjuster | Exact equate hit. Session 79 labeled this `editCursor`, but `ti84pceg.inc` places `?editCursor` at `0xD0243A`. |
| `0xD0231A` | `?curPC` | `0x0824D6` edit-buffer adjuster | Exact equate hit. This matches the `curPC` part of the earlier label; `?editTail` lives at `0xD0243D`. |
| `0xD0231D` | `?endPC` | `0x0824D6` edit-buffer adjuster | Exact equate hit. Session 79 labeled this `editBtm`, but `ti84pceg.inc` places `?editBtm` at `0xD02440`. |
| `0xD02590` | `?OPBase` | `0x082739` VAT walker | Exact equate hit; used as the loop bound while the walker adjusts VAT entry data pointers inside the shifted range. |

## Summary

- Identified `20` of the `23` explicit fixed slots in the InsertMem helper set. The unresolved slots are `0xD00684`, `0xD0069F`, and `0xD006A2`; all three sit in the unlabeled asm/app scratch region around `?asm_ram`.
- The main surprise is that the `0x0824D6` triplet does not cross-reference to `?editCursor/?editTail/?editBtm` in `ti84pceg.inc`. It cross-references to `?begPC/?curPC/?endPC`, while the explicit editor cursor/tail/bottom pointers live later at `0xD0243A/0xD0243D/0xD02440`.
- Another notable cluster is `?tSymPtr1/?tSymPtr2/?chkDelPtr3/?chkDelPtr4`, which sits immediately before `tempMem`, `FPSbase`, `FPS`, and `OPBase`. InsertMem is therefore maintaining temp-symbol bookkeeping and the FP/temp-memory frontier, not just editor state.
- For realistic VAT-state seeding, the minimum named state to keep coherent is `?OPBase`, `?pTemp`, `?progPtr`, `?newDataPtr`, `?editSym`, `?fmtMatMem`, the `?tSymPtr*` / `?chkDelPtr*` quartet, and the `?begPC/?curPC/?endPC` trio. The three unnamed `0xD006xx` slots should be treated as live pointer state in the surrounding asm/app scratch block until they are named more precisely.

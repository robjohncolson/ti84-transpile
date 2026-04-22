# Phase 25L - CpOP1OP2 Probe

**Goal**: Verify that calling CpOP1OP2 at `0x07F831` distinguishes OP1<OP2, OP1=OP2, and OP1>OP2 by setting flags.

**Setup**: Each sub-case uses the same full OS cold-boot + postInitState sequence as probe-phase25i-fpadd. `cpu.madl=1` is forced before `cpu.push(FAKE_RET)`; `cpu._iy=0xD00080`, `cpu._ix=0xD1A860`, `cpu.mbase=0xD0`, and timer IRQs remain disabled. OP1 and OP2 are seeded with `writeReal`, then execution CALLs `0x07F831` and captures `cpu.f` at the FAKE_RET trap before any other operation.

**Observed flag state**:
- lt (OP1=3, OP2=5): F=0xa3, carry=true, zero=false, returnHit=true
- eq (OP1=5, OP2=5): F=0x42, carry=false, zero=true, returnHit=true
- gt (OP1=7, OP2=2): F=0x02, carry=false, zero=false, returnHit=true

**Result**: equalZero=true, differentExtremes=true, allReturned=true - **PASS**

**Surprises**: All three cases returned to FAKE_RET and produced three distinct flag bytes.

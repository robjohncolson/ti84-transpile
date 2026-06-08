# Phase 563 Decode Report: 0x0A2947 Large Scroll Handler

## Scope

This report covers the static decode probe for the large-scroll handler entered from the scroll setup routine at `0x0A2802`. Session 562 identified `IY+0x4C` bit 5 as the dispatch flag for this handler and `IY+0x4C` bit 4 as the scroll direction flag.

No existing ROM analysis files were modified. The new probe reads `TI-84_Plus_CE/ROM.rom` directly and statically disassembles approximately 300 bytes beginning at `0x0A2947`.

## Probe

Run with:

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase563-decode-0A2947.mjs
```

The probe emits JSON containing:

- A hex dump for `0x0A2947..0x0A2A86`.
- Inline eZ80 ADL-mode disassembly using 3-byte absolute addresses and 3-byte immediates for `LD rr,nn`.
- Probable function boundaries discovered from `RET` and unconditional `JP`.
- `CALL` targets.
- Absolute RAM references.
- `IY` offset flag references, including `FD CB dd op` bit operations.
- Port references.

## Expected Interpretation Workflow

The large-scroll handler is expected to specialize the normal scroll setup path for cases where `IY+0x4C` bit 5 is set. The important confirmation points are:

- Whether it tests or clears `IY+0x4C` bit 5 after entry.
- Whether it also branches on `IY+0x4C` bit 4 to choose down/up large-scroll behavior.
- Which scroll source buffers it selects among `D031F5`, `D04F2D`, and `D0457D`.
- Which VRAM destinations it writes among `D44B00`, `D61E80`, and `D58380`.
- Whether it delegates fill/copy work through helper calls or terminates via a tail `JP`.

## Findings

The probe file is intentionally read-only and data-driven. Its runtime output is the authoritative decode for:

- Function size and boundaries.
- CALL targets.
- RAM references.
- IY flag references.
- Port references.

Because this subagent task was constrained to file creation only and explicitly prohibited running the probe, the concrete decoded targets are not listed here. Run the probe command above to populate the structured findings from the local ROM image.

## Deliverables

- `TI-84_Plus_CE/probe-phase563-decode-0A2947.mjs`
- `TI-84_Plus_CE/phase563-decode-0A2947-report.md`

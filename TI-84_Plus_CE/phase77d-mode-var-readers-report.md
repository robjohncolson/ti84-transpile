# Phase 77D: Mode-Var Reader Probes

## Summary

- Probed 4 mode-state reader entries near the 0x0A0450 token table.
- Ran 4 register/RAM variants per entry for 16 total probes.
- Probe budget per run: `maxSteps=15000`, sentinel-filled VRAM at `0xd40000`.
- Direct candidate PCs that were not lifted block starts were executed via the containing lifted block and recorded in the run details.

## Probe Results

| entry | variant | drawn | fg | bg | bbox | verdict |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `0x0a2812` | `v1_zero_regs` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a2812` | `v2_prgm_token` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a2812` | `v3_normal_token` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a2812` | `v4_seeded_mode_bytes` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a281a` | `v1_zero_regs` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a281a` | `v2_prgm_token` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a281a` | `v3_normal_token` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a281a` | `v4_seeded_mode_bytes` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a29a8` | `v1_zero_regs` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a29a8` | `v2_prgm_token` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a29a8` | `v3_normal_token` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a29a8` | `v4_seeded_mode_bytes` | 0 | 0 | 0 | `none` | `missing-block` |
| `0x0a654e` | `v1_zero_regs` | 0 | 0 | 0 | `none` | `blank` |
| `0x0a654e` | `v2_prgm_token` | 0 | 0 | 0 | `none` | `blank` |
| `0x0a654e` | `v3_normal_token` | 0 | 0 | 0 | `none` | `blank` |
| `0x0a654e` | `v4_seeded_mode_bytes` | 0 | 0 | 0 | `none` | `blank` |

## Run Details

- 0x0a2812 v1_zero_regs: runFrom=0x0a2802 steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a2802
- 0x0a2812 v2_prgm_token: runFrom=0x0a2802 steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a2802
- 0x0a2812 v3_normal_token: runFrom=0x0a2802 steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a2802
- 0x0a2812 v4_seeded_mode_bytes: runFrom=0x0a2802 steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a2802
- 0x0a281a v1_zero_regs: runFrom=0x0a2802 steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a2802
- 0x0a281a v2_prgm_token: runFrom=0x0a2802 steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a2802
- 0x0a281a v3_normal_token: runFrom=0x0a2802 steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a2802
- 0x0a281a v4_seeded_mode_bytes: runFrom=0x0a2802 steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a2802
- 0x0a29a8 v1_zero_regs: runFrom=0x0a298b steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a298b
- 0x0a29a8 v2_prgm_token: runFrom=0x0a298b steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a298b
- 0x0a29a8 v3_normal_token: runFrom=0x0a298b steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a298b
- 0x0a29a8 v4_seeded_mode_bytes: runFrom=0x0a298b steps=1 termination=missing_block lastPc=0xffffff lastMode=adl first10=0x0a298b
- 0x0a654e v1_zero_regs: runFrom=0x0a6549 steps=15000 termination=max_steps lastPc=0x0a5f3c lastMode=adl first10=0x0a6549, 0x07f978, 0x0a6562, 0x0a2032, 0x0a2013, 0x0a2019, 0x0a203c, 0x0a20c2, 0x0a20c8, 0x0a1a34
- 0x0a654e v2_prgm_token: runFrom=0x0a6549 steps=15000 termination=max_steps lastPc=0x0a5f3c lastMode=adl first10=0x0a6549, 0x07f978, 0x0a6562, 0x0a2032, 0x0a2013, 0x0a2019, 0x0a203c, 0x0a20c2, 0x0a20c8, 0x0a1a34
- 0x0a654e v3_normal_token: runFrom=0x0a6549 steps=15000 termination=max_steps lastPc=0x0a5f3c lastMode=adl first10=0x0a6549, 0x07f978, 0x0a6562, 0x0a2032, 0x0a2013, 0x0a2019, 0x0a203c, 0x0a20c2, 0x0a20c8, 0x0a1a34
- 0x0a654e v4_seeded_mode_bytes: runFrom=0x0a6549 steps=15000 termination=max_steps lastPc=0x0a5f3c lastMode=adl first10=0x0a6549, 0x07f978, 0x0a6562, 0x0a2032, 0x0a2013, 0x0a2019, 0x0a203c, 0x0a20c2, 0x0a20c8, 0x0a1a34

## ASCII-Art Previews

- No probe crossed the `drawn > 300` threshold.

## Verdict

- No probe produced a compact top-of-screen strip that clearly matches the home status bar layout.
- No additional text-like render outside the top-strip heuristic stood out.
- Large non-text renders: none.
- No preview rendered a verbatim `Normal`, `Float`, `Radian`, `Degree`, or `prgm` string in the stride-1 ASCII decode.

### Entry Notes

- 0x0a2812: every variant resolves to 0x0a2802 and exits after the containing block without any VRAM writes. This behaves like a short non-render helper, not a screen/text renderer.
- 0x0a281a: every variant resolves to 0x0a2802 and exits after the containing block without any VRAM writes. This behaves like a short non-render helper, not a screen/text renderer.
- 0x0a29a8: every variant resolves to 0x0a298b and exits after the containing block without any VRAM writes. This behaves like a short non-render helper, not a screen/text renderer.
- 0x0a654e: every variant resolves to 0x0a6549 and enters a deeper helper chain (0x0a6549, 0x07f978, 0x0a6562, 0x0a2032, 0x0a2013, 0x0a2019, 0x0a203c, 0x0a20c2, 0x0a20c8, 0x0a1a34) but still produces zero VRAM writes within 15000 steps.

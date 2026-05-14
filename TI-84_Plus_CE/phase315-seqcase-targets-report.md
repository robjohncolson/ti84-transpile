# Phase 315 `_seqcase` target report

## Summary
- Parsed all 83 `_seqcase` call sites: 49 vector-wrapped calls through `0x000210` and 34 direct calls to `0x002623`.
- Total dispatch table entries (including default arms): 563.
- Unique jump targets: 356.
- Targets with exact known-address matches: 0.
- Additional targets only covered by a known function range: 0.
- Unknown targets after source scraping: 356.

## Top 10 most-referenced targets
1. 0x00B2BA refs=30 shape=register-setup bytes=DD 36 FD 05 18 04 DD 36
2. 0x00B07C refs=20 shape=jp-trampoline bytes=C3 BA B2 00 01 00 00 04
3. 0x049B5B refs=12 shape=register-setup bytes=DD 36 FF 00 C3 C2 9C 04
4. 0x00873F refs=11 shape=register-setup bytes=DD 36 FF 00 C3 34 88 00
5. 0x00B2C0 refs=9 shape=register-setup bytes=DD 36 FD 06 DD 36 F2 00
6. 0x008703 refs=8 shape=register-setup bytes=DD 36 FF 00 C3 34 88 00
7. 0x049B1C refs=8 shape=register-setup bytes=DD 36 FF 00 C3 C2 9C 04
8. 0x049CC2 refs=7 shape=register-setup bytes=DD 7E FF DD F9 DD E1 C9
9. 0x0086B0 refs=5 shape=register-setup bytes=DD 36 FF 00 C3 34 88 00
10. 0x0087B8 refs=5 shape=register-setup bytes=DD 36 FF 00 18 76 DD 7E

## Entry-shape histogram
- register-setup: 285
- call-wrapper: 34
- straight-line: 30
- jp-trampoline: 3
- push-entry: 2
- jr-branch: 1
- return-stub: 1

## Named targets
- No named targets matched the scraped address inventory.

## Highest-frequency unknown targets
- 0x00B2BA refs=30 shape=register-setup bytes=DD 36 FD 05 18 04 DD 36 first=ld-ixd-imm second=jr
- 0x00B07C refs=20 shape=jp-trampoline bytes=C3 BA B2 00 01 00 00 04 first=jp second=ld-pair-imm
- 0x049B5B refs=12 shape=register-setup bytes=DD 36 FF 00 C3 C2 9C 04 first=ld-ixd-imm second=jp
- 0x00873F refs=11 shape=register-setup bytes=DD 36 FF 00 C3 34 88 00 first=ld-ixd-imm second=jp
- 0x00B2C0 refs=9 shape=register-setup bytes=DD 36 FD 06 DD 36 F2 00 first=ld-ixd-imm second=ld-ixd-imm
- 0x008703 refs=8 shape=register-setup bytes=DD 36 FF 00 C3 34 88 00 first=ld-ixd-imm second=jp
- 0x049B1C refs=8 shape=register-setup bytes=DD 36 FF 00 C3 C2 9C 04 first=ld-ixd-imm second=jp
- 0x049CC2 refs=7 shape=register-setup bytes=DD 7E FF DD F9 DD E1 C9 first=ld-reg-ixd second=ld-sp-pair
- 0x0086B0 refs=5 shape=register-setup bytes=DD 36 FF 00 C3 34 88 00 first=ld-ixd-imm second=jp
- 0x0087B8 refs=5 shape=register-setup bytes=DD 36 FF 00 18 76 DD 7E first=ld-ixd-imm second=jr
- 0x008834 refs=5 shape=register-setup bytes=DD 7E FF DD F9 DD E1 C9 first=ld-reg-ixd second=ld-sp-pair
- 0x00CE00 refs=5 shape=register-setup bytes=DD 36 FF 02 18 65 DD 36 first=ld-ixd-imm second=jr
- 0x02E587 refs=5 shape=register-setup bytes=01 00 00 00 DD 0F FA 2A first=ld-pair-imm second=ld-indexed-pair
- 0x039263 refs=5 shape=register-setup bytes=DD 36 FF 02 C3 30 93 03 first=ld-ixd-imm second=jp
- 0x049AC9 refs=5 shape=register-setup bytes=DD 36 FF 00 C3 C2 9C 04 first=ld-ixd-imm second=jp
- 0x049BD4 refs=5 shape=register-setup bytes=DD 36 FF 00 C3 C2 9C 04 first=ld-ixd-imm second=jp
- 0x00878E refs=4 shape=register-setup bytes=DD 36 FF 00 C3 34 88 00 first=ld-ixd-imm second=jp
- 0x00AF6E refs=4 shape=register-setup bytes=ED 4B 16 77 D1 C5 DD 07 first=ld-pair-mem second=push
- 0x00CDFA refs=4 shape=register-setup bytes=DD 36 FF 01 18 6B DD 36 first=ld-ixd-imm second=jr
- 0x00CE6B refs=4 shape=register-setup bytes=DD 7E FF B7 20 07 DD 7E first=ld-reg-ixd second=alu-reg

## Notes
- Exact matches come from direct address hits in `CONTINUATION_PROMPT_CODEX.md`, `scripts/transpile-ti84-rom.mjs`, and every `TI-84_Plus_CE/phase*-report.md` file.
- Range matches come from previously documented function spans such as `name (0xSTART-0xEND)`; they identify targets that land inside a named function even if the jump does not hit the function entry byte.
- The ROM byte preview shown above is the first 8 bytes at each target, used only to classify the entry shape (`jp-trampoline`, `stack-prologue`, `register-setup`, and so on).


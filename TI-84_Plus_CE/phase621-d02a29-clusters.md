# Phase 621: D02A29 Writer Cluster Decode

## Summary

- Decoded the dense `D02A29` writer/read clusters requested by the phase620 handoff: `0x08DF54`, `0x08E151`, `0x08ED73`, `0x08F54B`, plus adjacent loop/helper ranges that share the same state.
- `D02A29` is consistently used as a 16-bit token/display cursor byte offset. It is not isolated: the same clusters pair it with `D02A2B`, `D02A1B`, and derived display cursor fields such as `D0059A`, `D0114E`, `D01150`, `D01156`, and `D0115A`.
- The writer clusters split into four roles: seed from caller/token context, convert to display-coordinate state, adjust during token-output loop setup, and advance by token byte size on normal/alternate exits.
- The practical restore implication is narrower than a full RAM snapshot but broader than `D02A29` alone: persistent display state needs the local cursor-position tuple (`D02A29`, `D02A2B`, `D02A1B`, and derived D011xx/D0059A fields) to stay coherent.

## Cluster Roles

| Range | Role | D02A29 refs | Nearby state refs | Calls/Jumps |
|---|---|---:|---:|---|
| 0x08DF54-0x08E190 | entry seed: stores caller HL into D02A29, then snapshots D02A2B and D02A1B around display setup helpers | 3 | 14 | 0x08FABC, 0x08E064, 0x08E0CB, 0x08E0C9, 0x08E06E, 0x08E07C, 0x08E088, 0x08E108, 0x04C979, 0x091487, 0x08E12B, 0x0915D5, 0x0916E7, 0x08E102, 0x08E1D9, 0x08E1E3, 0x08E086 |
| 0x08E151-0x08E3A8 | display coordinate arithmetic: D02A29 is combined with constants and D02A2B to derive render cursor state | 3 | 16 | 0x08E0CB, 0x08E1D9, 0x08E1E3, 0x08E086, 0x08E0C9, 0x08E1F1, 0x08E401, 0x08E37F, 0x08E588, 0x08F096, 0x08E3BB, 0x090814, 0x08E5D2, 0x04C979, 0x0916E7, 0x08E102 |
| 0x08ED73-0x08EE44 | token-output setup: writes computed HL to D02A29 before token/render position adjustment | 5 | 11 | 0x09077B, 0x08FAC8, 0x090953, 0x08F16D, 0x04C979, 0x08E911, 0x08F33E, 0x08F336, 0x090755, 0x08E151 |
| 0x08F006-0x08F150 | loop setup: repeatedly rewrites D02A29 from local cursor arithmetic before normal token processing | 6 | 12 | 0x090790, 0x08F08E, 0x08F079, 0x08EF6F, 0x0A2B53, 0x08F239, 0x08F0A2, 0x08F723, 0x0907DF, 0x08E102, 0x04C979, 0x08F140, 0x08F12A, 0x09168E, 0x08E216, 0x090953 |
| 0x08F54B-0x08F6B0 | normal exit: saves/restores D02A29 around cleanup and token-position updates | 5 | 9 | 0x090790, 0x08F433, 0x090992, 0x090883, 0x091AD7, 0x08ECF8, 0x09098E, 0x08F66B, 0x08E5E6, 0x08F3DC, 0x04C973, 0x090859, 0x0A2B53, 0x08F239, 0x08F140, 0x0A23C0, 0x08F5DD, 0x0907DB, 0x08F56C, 0x08F6B5 |
| 0x08F6FE-0x08F7D0 | movement helpers: D02A29 is reset or advanced by helpers that coordinate D02A2B and token-size state | 6 | 6 | 0x0916E7, 0x08F736, 0x08F708, 0x090992, 0x08F7D6, 0x04C979, 0x08E102, 0x08F713, 0x0A239E, 0x0A23E9 |

## D02A29 Reference Detail

### 0x08DF54-0x08E190 initializer/display-state setup

D02A29 references:

- `0x08DF54 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08DFDD 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08E151 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`

Nearby cursor/display state references:

- `0x08DF54 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08DF76 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08DF89 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08DF9B 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08DFDD 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08E002 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08E011 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08E01F 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08E09A 40 2A 4E 11    tag=ld-pair-mem pair=hl addr=4430 direction=from-mem mode=adl modePrefix=sis` refs=0xD0114E
- `0x08E0CF 40 2A 56 11    tag=ld-pair-mem pair=hl addr=4438 direction=from-mem mode=adl modePrefix=sis` refs=0xD01156
- `0x08E0DF 40 22 1B 2A    tag=ld-pair-mem pair=hl addr=10779 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A1B
- `0x08E0E3 3A 50 11 D0    tag=ld-reg-mem dest=a addr=13635920 mode=adl modePrefix=null` refs=0xD01150
- `0x08E151 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08E166 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B

### 0x08E151-0x08E3A8 display arithmetic and derived cursor state

D02A29 references:

- `0x08E151 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08E355 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08E380 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`

Nearby cursor/display state references:

- `0x08E151 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08E166 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08E1DD 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08E223 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08E294 40 2A 4E 11    tag=ld-pair-mem pair=hl addr=4430 direction=from-mem mode=adl modePrefix=sis` refs=0xD0114E
- `0x08E299 3A 50 11 D0    tag=ld-reg-mem dest=a addr=13635920 mode=adl modePrefix=null` refs=0xD01150
- `0x08E2A2 40 22 4E 11    tag=ld-pair-mem pair=hl addr=4430 direction=to-mem mode=adl modePrefix=sis` refs=0xD0114E
- `0x08E2A7 32 50 11 D0    tag=ld-mem-reg addr=13635920 src=a mode=adl modePrefix=null` refs=0xD01150
- `0x08E2B8 32 50 11 D0    tag=ld-mem-reg addr=13635920 src=a mode=adl modePrefix=null` refs=0xD01150
- `0x08E32B 40 2A 5A 11    tag=ld-pair-mem pair=hl addr=4442 direction=from-mem mode=adl modePrefix=sis` refs=0xD0115A
- `0x08E351 40 22 5A 11    tag=ld-pair-mem pair=hl addr=4442 direction=to-mem mode=adl modePrefix=sis` refs=0xD0115A
- `0x08E355 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08E363 40 22 9A 05    tag=ld-pair-mem pair=hl addr=1434 direction=to-mem mode=adl modePrefix=sis` refs=0xD0059A
- `0x08E367 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08E375 21 50 11 D0    tag=ld-pair-imm pair=hl value=13635920 mode=adl modePrefix=null` refs=0xD01150
- `0x08E380 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29

### 0x08ED73-0x08EE44 token output setup and cursor adjustment

D02A29 references:

- `0x08ED73 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08EDE3 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08EE0D 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08EE29 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08EE2E 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`

Nearby cursor/display state references:

- `0x08ED73 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08ED99 40 22 56 11    tag=ld-pair-mem pair=hl addr=4438 direction=to-mem mode=adl modePrefix=sis` refs=0xD01156
- `0x08EDE3 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08EDE8 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08EE05 40 2A 56 11    tag=ld-pair-mem pair=hl addr=4438 direction=from-mem mode=adl modePrefix=sis` refs=0xD01156
- `0x08EE0D 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08EE11 40 22 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08EE24 40 22 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08EE29 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08EE2E 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08EE43 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B

### 0x08F006-0x08F150 token output loop setup

D02A29 references:

- `0x08F006 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08F0AA 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08F0B8 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08F0D4 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08F10E 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08F140 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`

Nearby cursor/display state references:

- `0x08F006 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F0A6 40 22 1B 2A    tag=ld-pair-mem pair=hl addr=10779 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A1B
- `0x08F0AA 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F0AF 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08F0B8 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F0CA 40 22 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08F0D4 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F0FE 40 22 1B 2A    tag=ld-pair-mem pair=hl addr=10779 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A1B
- `0x08F10E 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F116 40 22 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08F126 40 22 56 11    tag=ld-pair-mem pair=hl addr=4438 direction=to-mem mode=adl modePrefix=sis` refs=0xD01156
- `0x08F140 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29

### 0x08F54B-0x08F6B0 normal and alternate exit cursor advance

D02A29 references:

- `0x08F54B 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08F551 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08F5A4 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08F69C 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08F6A5 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`

Nearby cursor/display state references:

- `0x08F54B 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F551 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F580 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08F5A4 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F5AE 40 2A 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08F5B4 40 22 2B 2A    tag=ld-pair-mem pair=hl addr=10795 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A2B
- `0x08F65B 40 2A 56 11    tag=ld-pair-mem pair=hl addr=4438 direction=from-mem mode=adl modePrefix=sis` refs=0xD01156
- `0x08F69C 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F6A5 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29

### 0x08F6FE-0x08F7D0 cursor movement helpers

D02A29 references:

- `0x08F6FE 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08F70F 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`
- `0x08F765 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08F79A 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08F7C0 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis`
- `0x08F7C5 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis`

Nearby cursor/display state references:

- `0x08F6FE 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F70F 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F765 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F79A 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F7C0 40 2A 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis` refs=0xD02A29
- `0x08F7C5 40 22 29 2A    tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis` refs=0xD02A29

## Interpretation

`0x08DF54` and `0x08DFDD` initialize `D02A29` from the incoming HL context and immediately work with `D02A2B` / `D02A1B`, so they are setup entries for the token display cursor tuple. `0x08E151` and the nearby `0x08E355`/`0x08E380` references derive display-position fields from that tuple, including `D0059A` and D011xx scratch/state fields. `0x08ED73` and `0x08F006` rewrite `D02A29` during token-output setup. The `0x08F54B` and `0x08F69C` exit paths then save/restore or advance the cursor offset before restarting or cleaning up the loop.

This explains why restoring only `D02A29` would be fragile: the loop expects a coherent token/display cursor tuple. For browser persistence, the already-proven VRAM and token-buffer snapshots are still the low-risk path; if RAM state restoration is attempted, include at least `D02A29-D02A2C`, `D02A1B-D02A1D`, and the derived D011xx/D0059A fields captured from the same phase.

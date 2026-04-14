# Phase 111 - Menu Seed Retranspile

## Changes Applied

- Added a new seed file at [phase111-seeds.txt](/C:/Users/rober/Downloads/Projects/school/follow-alongs/TI-84_Plus_CE/phase111-seeds.txt).
- Wired that file into [transpile-ti84-rom.mjs](/C:/Users/rober/Downloads/Projects/school/follow-alongs/scripts/transpile-ti84-rom.mjs) using the existing `loadSeedFile(...)` path used for Phase 100C seeds.

## Added Seeds

- `0x0b6a58`
- `0x0b6834`
- `0x0b6b48`
- `0x09eb9e`

## Notes

- This subagent only applied the seed wiring and report stub.
- The requested retranspile, gzip regeneration, report delta check, Phase 109 menu probe, and Phase 99D golden regression were not run here because the subagent instructions required exiting immediately after patching without running verification commands.

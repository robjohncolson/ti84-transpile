# Phase 162 Report

## Decoder Edit

Removed these lines from `TI-84_Plus_CE/ez80-decoder.js`:

- Line 640: `// eZ80 indexed 24-bit pair stores: DD/FD 01/11 d = LD (IX/IY+d), BC/DE`
- Line 641: `if (op === 0x01) return emit(2, { tag: 'ld-indexed-pair', pair: 'bc', indexRegister: indexReg, displacement: d() });`
- Line 642: `if (op === 0x11) return emit(2, { tag: 'ld-indexed-pair', pair: 'de', indexRegister: indexReg, displacement: d() });`

## Retranspile Output

Command run:

```bash
node scripts/transpile-ti84-rom.mjs
```

Results:

- Old block count: `123730`
- New block count: `123729`
- Delta: `-1`
- Covered bytes: `697867`
- Coverage: `16.6384%`

Generated files:

- `TI-84_Plus_CE/ROM.transpiled.js`
- `TI-84_Plus_CE/ROM.transpiled.report.json`

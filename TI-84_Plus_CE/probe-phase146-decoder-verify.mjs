#!/usr/bin/env node
import { decodeInstruction } from './ez80-decoder.js';

function runCase(label, bytes, expected) {
  const decoded = decodeInstruction(Uint8Array.from(bytes), 0, 'adl');
  const pass = decoded.tag === expected.tag
    && decoded.pair === expected.pair
    && decoded.indexRegister === expected.indexRegister
    && decoded.displacement === expected.displacement
    && decoded.length === 3;

  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);

  if (!pass) {
    console.log('  expected:', { ...expected, length: 3 });
    console.log('  actual:', {
      tag: decoded.tag,
      pair: decoded.pair,
      indexRegister: decoded.indexRegister,
      displacement: decoded.displacement,
      length: decoded.length,
    });
  }

  return pass;
}

const cases = [
  {
    label: 'FD 07 06 -> ld bc, (iy+6)',
    bytes: [0xfd, 0x07, 0x06],
    expected: { tag: 'ld-pair-indexed', pair: 'bc', indexRegister: 'iy', displacement: 6 },
  },
  {
    label: 'DD 27 03 -> ld hl, (ix+3)',
    bytes: [0xdd, 0x27, 0x03],
    expected: { tag: 'ld-pair-indexed', pair: 'hl', indexRegister: 'ix', displacement: 3 },
  },
  {
    label: 'FD 17 03 -> ld de, (iy+3)',
    bytes: [0xfd, 0x17, 0x03],
    expected: { tag: 'ld-pair-indexed', pair: 'de', indexRegister: 'iy', displacement: 3 },
  },
  {
    label: 'DD 01 09 -> ld (ix+9), bc',
    bytes: [0xdd, 0x01, 0x09],
    expected: { tag: 'ld-indexed-pair', pair: 'bc', indexRegister: 'ix', displacement: 9 },
  },
  {
    label: 'DD 11 05 -> ld (ix+5), de',
    bytes: [0xdd, 0x11, 0x05],
    expected: { tag: 'ld-indexed-pair', pair: 'de', indexRegister: 'ix', displacement: 5 },
  },
  {
    label: 'FD 01 FF -> ld (iy-1), bc (negative displacement)',
    bytes: [0xfd, 0x01, 0xff],
    expected: { tag: 'ld-indexed-pair', pair: 'bc', indexRegister: 'iy', displacement: -1 },
  },
];

const failures = cases
  .map(({ label, bytes, expected }) => runCase(label, bytes, expected))
  .filter((pass) => !pass)
  .length;

if (failures === 0) {
  console.log(`\nPASS phase146 decoder verification (${cases.length}/${cases.length})`);
  process.exit(0);
}

console.log(`\nFAIL phase146 decoder verification (${failures} failing case${failures === 1 ? '' : 's'})`);
process.exit(1);

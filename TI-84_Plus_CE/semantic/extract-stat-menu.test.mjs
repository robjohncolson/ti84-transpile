import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractStatMenuContract } from './extract-stat-menu.mjs';

const rom = readFileSync(new URL('../ROM.rom', import.meta.url));
const sdk = readFileSync(new URL('../references/ti84pceg.inc', import.meta.url), 'utf8');

test('static extraction reproduces the checked-in evidence exactly', () => {
  const saved = JSON.parse(readFileSync(new URL('./stat-menu-contract.json', import.meta.url), 'utf8'));
  assert.deepEqual(extractStatMenuContract(rom, sdk), saved);
});

test('changed dispatch instructions fail instead of silently certifying another ROM', () => {
  const changed = Buffer.from(rom);
  changed[0x085c14] = 1; // Change ENTER comparison to RIGHT.
  assert.throws(() => extractStatMenuContract(changed, sdk), /0x085C13 value/);
});

test('a truncated image and missing SDK key definition fail explicitly', () => {
  assert.throws(() => extractStatMenuContract(rom.subarray(0, 100), sdk), /ROM image/);
  assert.throws(() => extractStatMenuContract(rom, sdk.replace(/\?kEnter\s*:=.*\r?\n/, '')), /Missing SDK symbol kEnter/);
});

test('a change outside the inspected routines cannot inherit the pinned OS identity', () => {
  const changed = Buffer.from(rom);
  changed[0x300000] ^= 1;
  assert.throws(() => extractStatMenuContract(changed, sdk), /Unknown ROM revision/);
});

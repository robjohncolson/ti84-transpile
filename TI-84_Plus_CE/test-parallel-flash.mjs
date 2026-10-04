import assert from 'node:assert/strict';
import test from 'node:test';
import { createParallelFlash } from './parallel-flash.js';
import { createExecutor } from './cpu-runtime.js';
import { buildBlock } from './ez80-lifter.js';

function unlock(flash, command) {
  flash.write8(0xAAA, 0xAA);
  flash.write8(0x555, 0x55);
  flash.write8(0xAAA, command);
}

test('ordinary writes cannot corrupt flash', () => {
  const memory = new Uint8Array(0x400000).fill(0xAA);
  const flash = createParallelFlash(memory);
  flash.write8(0x30000, 0);
  assert.equal(memory[0x30000], 0xAA);
});

test('programming only clears bits and accepts F0 as data', () => {
  const memory = new Uint8Array(0x400000).fill(0xFF);
  const flash = createParallelFlash(memory);
  unlock(flash, 0xA0);
  flash.write8(0x30000, 0xF0);
  unlock(flash, 0xA0);
  flash.write8(0x30000, 0xAA);
  assert.equal(memory[0x30000], 0xA0);
});

test('erase changes only the selected sector and returns completion status', () => {
  const memory = new Uint8Array(0x400000).fill(0);
  const flash = createParallelFlash(memory);
  unlock(flash, 0x80);
  flash.write8(0xAAA, 0xAA);
  flash.write8(0x555, 0x55);
  flash.write8(0x31234, 0x30);
  assert.equal(memory[0x2FFFF], 0);
  assert.equal(memory[0x30000], 0xFF);
  assert.equal(memory[0x3FFFF], 0xFF);
  assert.equal(memory[0x40000], 0);
  assert.deepEqual(Array.from({ length: 4 }, () => flash.read8(0x31234)), [0x80, 0x80, 0x80, 0xFF]);
});

test('protected boot sectors remain intact', () => {
  const memory = new Uint8Array(0x400000).fill(0x55);
  const flash = createParallelFlash(memory);
  unlock(flash, 0xA0);
  flash.write8(0x100, 0);
  assert.equal(memory[0x100], 0x55);
  unlock(flash, 0x90);
  assert.equal(flash.read8(0x100), 1);
  assert.equal(flash.read8(0x30000), 0);
  flash.write8(0, 0xF0);
  assert.equal(flash.read8(0x100), 0x55);
});

test('changed flash code invalidates a prelifted ROM block', () => {
  const memory = new Uint8Array(0x1000000).fill(0xFF);
  memory.set([0x3E, 7, 0x76], 0x30000);
  const block = buildBlock(memory, 0x30000, 'adl');
  const flash = createParallelFlash(memory);
  const ex = createExecutor({ [block.id]: block }, memory, {
    flash, strictExecution: true, liftMissingBlocks: true,
  });
  unlock(flash, 0xA0);
  flash.write8(0x30001, 3);
  const result = ex.runFrom(0x30000);
  assert.equal(result.termination, 'halt');
  assert.equal(ex.cpu.a, 3);
});

test('wide CPU transfers observe flash commands and normalized addresses', () => {
  const memory = new Uint8Array(0x1000000).fill(0xFF);
  const flash = createParallelFlash(memory);
  const { cpu } = createExecutor({}, memory, { flash });
  unlock(flash, 0xA0);
  cpu.write16(0x1030000, 0x1234);
  assert.equal(memory[0x30000], 0x34);
  assert.equal(memory[0x30001], 0xFF);
  assert.equal(cpu.read16(0x1030000), 0xFF34);
  unlock(flash, 0x90);
  assert.equal(cpu.read24(0x100), 0x010101);
  assert.equal(cpu.read24(0x30000), 0);
});

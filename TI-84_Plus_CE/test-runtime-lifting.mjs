import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutor } from './cpu-runtime.js';

function harness() {
  const memory = new Uint8Array(0x1000000);
  return createExecutor({}, memory, { strictExecution: true, liftMissingBlocks: true });
}

test('copied RAM code executes its arithmetic and relative branch', () => {
  const ex = harness();
  // LD A,7; JR +2; LD A,99; ADD A,5; HALT
  ex.cpu.memory.set([0x3E, 7, 0x18, 2, 0x3E, 99, 0xC6, 5, 0x76], 0xD01000);
  const result = ex.runFrom(0xD01000);
  assert.equal(result.termination, 'halt');
  assert.equal(ex.cpu.a, 12);
  assert.equal(result.lastPc, 0xD01008);
  assert.deepEqual(result.missingBlocks, []);
});

test('replacing a cached RAM instruction invalidates its translation', () => {
  const ex = harness();
  ex.cpu.memory.set([0x3E, 7, 0x76], 0xD01000);
  ex.runFrom(0xD01000);
  ex.cpu.memory[0xD01001] = 42;
  ex.cpu.halted = false;
  ex.runFrom(0xD01000);
  assert.equal(ex.cpu.a, 42);
});

test('a RAM instruction can rewrite the next opcode before it executes', () => {
  const ex = harness();
  // LD A,42; LD (D01007),A; LD A,7; HALT
  ex.cpu.memory.set([0x3E, 42, 0x32, 7, 0x10, 0xD0, 0x3E, 7, 0x76], 0xD01000);
  ex.runFrom(0xD01000);
  assert.equal(ex.cpu.a, 42);
});

test('a missing ROM jump-table entry follows its actual target', () => {
  const ex = harness();
  ex.cpu.memory.set([0xC3, 0x10, 0, 0], 0);
  ex.cpu.memory.set([0x3E, 42, 0x76], 0x10);
  const result = ex.runFrom(0);
  assert.equal(result.termination, 'halt');
  assert.equal(ex.cpu.a, 42);
});

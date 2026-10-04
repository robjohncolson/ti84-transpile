import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutor } from './cpu-runtime.js';

function block(pc, source, exits = []) {
  return { [pc.toString(16).padStart(6, '0') + ':adl']: {
    startPc: pc, mode: 'adl', source: `function block(cpu) { ${source} }`, exits,
  } };
}

test('missing ROM bytes are not skipped in strict execution', () => {
  const ex = createExecutor(block(2, 'cpu.a = 99; return -1;'), new Uint8Array(0x1000000));
  const result = ex.runFrom(0, 'adl', { strictExecution: true });
  assert.equal(result.termination, 'missing_block');
  assert.equal(result.lastPc, 0);
  assert.equal(ex.cpu.a, 0);
  assert.equal(result.steps, 0);
});

test('strict execution never fabricates a return for missing RAM code', () => {
  const ex = createExecutor({}, new Uint8Array(0x1000000), { strictExecution: true });
  ex.cpu.sp = 0xD01000;
  const result = ex.runFrom(0xD02000);
  assert.equal(result.termination, 'missing_block');
  assert.equal(ex.cpu.sp, 0xD01000);
  assert.equal(ex.compiledBlocks['d02000:adl'], undefined);
});

test('a synthetic block cached by a legacy run is rejected by a strict run', () => {
  const ex = createExecutor(block(0, 'return -1;'), new Uint8Array(0x1000000));
  ex.cpu.sp = 0xD01000;
  ex.runFrom(0xD02000, 'adl', { maxSteps: 2 });
  ex.cpu.sp = 0xD01000;
  const result = ex.runFrom(0xD02000, 'adl', { strictExecution: true });
  assert.equal(result.termination, 'missing_block');
  assert.equal(ex.cpu.sp, 0xD01000);
});

test('loop limit stops without forcing carry or a branch', () => {
  const ex = createExecutor(block(0, 'return 0;'), new Uint8Array(0x1000000));
  ex.cpu.f = 0x40;
  const result = ex.runFrom(0, 'adl', { strictExecution: true, maxLoopIterations: 2 });
  assert.equal(result.termination, 'loop_limit');
  assert.equal(result.loopsForced, 0);
  assert.equal(ex.cpu.f, 0x40);
});

test('strict execution preserves the stack written by the program', () => {
  const ex = createExecutor(block(0, 'cpu.sp = 123; return -1;'), new Uint8Array(0x1000000));
  ex.cpu.sp = 0xD01000;
  ex.runFrom(0, 'adl', { strictExecution: true });
  assert.equal(ex.cpu.sp, 123);
});

test('DI HALT remains halted despite legacy bypass and wake options', () => {
  const ex = createExecutor(block(0, 'cpu.halted = true; cpu.iff1 = 0; return -1;'), new Uint8Array(0x1000000));
  const result = ex.runFrom(0, 'adl', {
    strictExecution: true, diHaltBypass: true, wakeFromHalt: true,
  });
  assert.equal(result.termination, 'halt');
  assert.equal(result.steps, 1);
  assert.equal(ex.cpu.halted, true);
  assert.equal(ex.cpu.iff1, 0);
});

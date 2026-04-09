// ALU unit tests for cpu-runtime.js
// Run: node TI-84_Plus_CE/test-alu.mjs

import { CPU } from './cpu-runtime.js';

const FLAG_C = 0x01, FLAG_N = 0x02, FLAG_PV = 0x04, FLAG_H = 0x10, FLAG_Z = 0x40, FLAG_S = 0x80;

let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.log('  FAIL: ' + msg); }
}

function flag(cpu, f) { return (cpu.f & f) !== 0; }

console.log('=== ALU Unit Tests ===\n');

// --- inc8 ---
console.log('inc8:');
{
  const cpu = new CPU();
  cpu.f = 0; // clear all flags including C
  let r = cpu.inc8(0x00);
  assert(r === 0x01, 'inc8(0x00) = 0x01, got ' + r);
  assert(!flag(cpu, FLAG_Z), 'inc8(0x00): Z clear');
  assert(!flag(cpu, FLAG_S), 'inc8(0x00): S clear');
  assert(!flag(cpu, FLAG_PV), 'inc8(0x00): PV clear');
  assert(!flag(cpu, FLAG_N), 'inc8(0x00): N clear');

  cpu.f = FLAG_C; // set carry before inc
  r = cpu.inc8(0x7F);
  assert(r === 0x80, 'inc8(0x7F) = 0x80, got ' + r);
  assert(flag(cpu, FLAG_S), 'inc8(0x7F): S set');
  assert(flag(cpu, FLAG_PV), 'inc8(0x7F): PV set (overflow)');
  assert(flag(cpu, FLAG_H), 'inc8(0x7F): H set');
  assert(flag(cpu, FLAG_C), 'inc8(0x7F): C preserved');

  r = cpu.inc8(0xFF);
  assert(r === 0x00, 'inc8(0xFF) = 0x00, got ' + r);
  assert(flag(cpu, FLAG_Z), 'inc8(0xFF): Z set');
  assert(flag(cpu, FLAG_H), 'inc8(0xFF): H set');
  assert(!flag(cpu, FLAG_PV), 'inc8(0xFF): PV clear');

  cpu.f = 0;
  r = cpu.inc8(0x0F);
  assert(r === 0x10, 'inc8(0x0F) = 0x10, got ' + r);
  assert(flag(cpu, FLAG_H), 'inc8(0x0F): H set (half-carry)');
  assert(!flag(cpu, FLAG_C), 'inc8 preserves C=0');
}

// --- dec8 ---
console.log('dec8:');
{
  const cpu = new CPU();
  cpu.f = 0;
  let r = cpu.dec8(0x01);
  assert(r === 0x00, 'dec8(0x01) = 0x00, got ' + r);
  assert(flag(cpu, FLAG_Z), 'dec8(0x01): Z set');
  assert(flag(cpu, FLAG_N), 'dec8(0x01): N set');

  cpu.f = FLAG_C;
  r = cpu.dec8(0x80);
  assert(r === 0x7F, 'dec8(0x80) = 0x7F, got ' + r);
  assert(flag(cpu, FLAG_PV), 'dec8(0x80): PV set (overflow)');
  assert(!flag(cpu, FLAG_S), 'dec8(0x80): S clear');
  assert(flag(cpu, FLAG_C), 'dec8(0x80): C preserved');

  r = cpu.dec8(0x00);
  assert(r === 0xFF, 'dec8(0x00) = 0xFF, got ' + r);
  assert(flag(cpu, FLAG_S), 'dec8(0x00): S set');
  assert(flag(cpu, FLAG_H), 'dec8(0x00): H set (borrow)');
  assert(!flag(cpu, FLAG_PV), 'dec8(0x00): PV clear');

  cpu.f = 0;
  r = cpu.dec8(0x10);
  assert(r === 0x0F, 'dec8(0x10) = 0x0F, got ' + r);
  assert(flag(cpu, FLAG_H), 'dec8(0x10): H set');
  assert(!flag(cpu, FLAG_C), 'dec8 preserves C=0');
}

// --- add8 ---
console.log('add8:');
{
  const cpu = new CPU();
  let r = cpu.add8(0, 0);
  assert(r === 0, 'add8(0,0) = 0');
  assert(flag(cpu, FLAG_Z), 'add8(0,0): Z set');
  assert(!flag(cpu, FLAG_C), 'add8(0,0): C clear');

  r = cpu.add8(0xFF, 1);
  assert(r === 0, 'add8(0xFF,1) = 0');
  assert(flag(cpu, FLAG_Z), 'add8(0xFF,1): Z set');
  assert(flag(cpu, FLAG_C), 'add8(0xFF,1): C set');

  r = cpu.add8(0x7F, 1);
  assert(r === 0x80, 'add8(0x7F,1) = 0x80');
  assert(flag(cpu, FLAG_PV), 'add8(0x7F,1): PV set (overflow)');
  assert(flag(cpu, FLAG_S), 'add8(0x7F,1): S set');

  r = cpu.add8(0x50, 0x50);
  assert(r === 0xA0, 'add8(0x50,0x50) = 0xA0');
  assert(flag(cpu, FLAG_PV), 'add8(0x50,0x50): PV set (overflow)');
}

// --- subtract8 ---
console.log('subtract8:');
{
  const cpu = new CPU();
  let r = cpu.subtract8(5, 3);
  assert(r === 2, 'sub8(5,3) = 2');
  assert(!flag(cpu, FLAG_Z), 'sub8(5,3): Z clear');
  assert(!flag(cpu, FLAG_C), 'sub8(5,3): C clear');
  assert(flag(cpu, FLAG_N), 'sub8(5,3): N set');

  r = cpu.subtract8(0, 1);
  assert(r === 0xFF, 'sub8(0,1) = 0xFF');
  assert(flag(cpu, FLAG_C), 'sub8(0,1): C set (borrow)');
  assert(flag(cpu, FLAG_S), 'sub8(0,1): S set');

  r = cpu.subtract8(0x80, 1);
  assert(r === 0x7F, 'sub8(0x80,1) = 0x7F');
  assert(flag(cpu, FLAG_PV), 'sub8(0x80,1): PV set (overflow)');

  r = cpu.subtract8(3, 3);
  assert(r === 0, 'sub8(3,3) = 0');
  assert(flag(cpu, FLAG_Z), 'sub8(3,3): Z set');
}

// --- updateLogicFlags (AND) ---
console.log('updateLogicFlags (AND):');
{
  const cpu = new CPU();
  cpu.updateLogicFlags(0x00);
  assert(flag(cpu, FLAG_Z), 'AND 0x00: Z set');
  assert(flag(cpu, FLAG_H), 'AND 0x00: H set');
  assert(!flag(cpu, FLAG_C), 'AND 0x00: C clear');
  assert(!flag(cpu, FLAG_N), 'AND 0x00: N clear');

  cpu.updateLogicFlags(0x80);
  assert(flag(cpu, FLAG_S), 'AND 0x80: S set');
  assert(flag(cpu, FLAG_H), 'AND 0x80: H=1 (always)');
}

// --- updateOrXorFlags (OR/XOR) ---
console.log('updateOrXorFlags (OR/XOR):');
{
  const cpu = new CPU();
  cpu.updateOrXorFlags(0x00);
  assert(flag(cpu, FLAG_Z), 'OR 0x00: Z set');
  assert(!flag(cpu, FLAG_H), 'OR 0x00: H clear');
  assert(!flag(cpu, FLAG_C), 'OR 0x00: C clear');

  cpu.updateOrXorFlags(0xFF);
  assert(!flag(cpu, FLAG_Z), 'OR 0xFF: Z clear');
  assert(flag(cpu, FLAG_S), 'OR 0xFF: S set');
  assert(!flag(cpu, FLAG_H), 'OR 0xFF: H=0 (always)');
}

// --- addWithCarry8 ---
console.log('addWithCarry8:');
{
  const cpu = new CPU();
  cpu.f = FLAG_C; // carry set
  let r = cpu.addWithCarry8(0x7E, 0x01);
  assert(r === 0x80, 'adc(0x7E,0x01,C=1) = 0x80, got ' + r);
  assert(flag(cpu, FLAG_PV), 'adc overflow');

  cpu.f = 0; // carry clear
  r = cpu.addWithCarry8(0xFF, 0x00);
  assert(r === 0xFF, 'adc(0xFF,0x00,C=0) = 0xFF');
  assert(!flag(cpu, FLAG_C), 'adc no carry');
}

// --- subtractWithBorrow8 ---
console.log('subtractWithBorrow8:');
{
  const cpu = new CPU();
  cpu.f = FLAG_C; // borrow set
  let r = cpu.subtractWithBorrow8(0x80, 0x00);
  assert(r === 0x7F, 'sbc(0x80,0x00,C=1) = 0x7F, got ' + r);
  assert(flag(cpu, FLAG_PV), 'sbc overflow');

  cpu.f = 0;
  r = cpu.subtractWithBorrow8(5, 3);
  assert(r === 2, 'sbc(5,3,C=0) = 2');
}

// --- Summary ---
console.log('\n' + '='.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
console.log('All tests passed.');

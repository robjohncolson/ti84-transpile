import assert from 'node:assert/strict';
import test from 'node:test';
import { CPU } from './cpu-runtime.js';

// Zilog UM007715-0415, ADC HL (p85), ADD HL (p94), SBC HL (p335).
// https://www.zilog.com/docs/um0077.pdf
// H records carry from bit 11 / borrow from bit 12 in BOTH operand widths.
const C = 0x01;
const N = 0x02;
const PV = 0x04;
const H = 0x10;
const Z = 0x40;
const S = 0x80;
const DOCUMENTED_FLAGS = C | N | PV | H | Z | S;

const modes = [
  { name: 'ADL', madl: 1, forceShort: undefined, bits: 24 },
  { name: 'Z80', madl: 0, forceShort: undefined, bits: 16 },
  { name: 'short override in ADL', madl: 1, forceShort: true, bits: 16 },
  { name: 'long override in Z80', madl: 0, forceShort: false, bits: 24 },
];

const operations = [
  { name: 'ADD', method: 'addWord', subtract: false, withCarry: false },
  { name: 'ADC', method: 'addWithCarryWord', subtract: false, withCarry: true },
  { name: 'SBC', method: 'subtractWithBorrowWord', subtract: true, withCarry: true },
];

for (const mode of modes) {
  for (const operation of operations) {
    test(`${operation.name}: ${mode.name}, results and documented flags`, () => {
      const cpu = new CPU();
      cpu.madl = mode.madl;
      const modulus = 2 ** mode.bits;
      const signBit = modulus / 2;
      // Include dirty upper register bytes and both nibble boundaries.
      const operands = [
        0, 1, 0x0fff, 0x1000, 0x7fff, 0x8000, 0xffff,
        0x10000, 0x100001, 0x0fffff, 0x100000,
        0x7fffff, 0x800000, 0xffffff,
      ];

      for (const left of operands) {
        for (const right of operands) {
          for (const initialFlags of [0, C, DOCUMENTED_FLAGS]) {
            cpu.f = initialFlags;
            const a = left % modulus;
            const b = right % modulus;
            const carry = operation.withCarry && (initialFlags & C) ? 1 : 0;
            const result = operation.subtract ? a - b - carry : a + b + carry;
            const wrapped = ((result % modulus) + modulus) % modulus;
            const signedA = a >= signBit ? a - modulus : a;
            const signedB = b >= signBit ? b - modulus : b;
            const signedResult = operation.subtract
              ? signedA - signedB - carry
              : signedA + signedB + carry;
            const halfResult = operation.subtract
              ? (a % 0x1000) - (b % 0x1000) - carry
              : (a % 0x1000) + (b % 0x1000) + carry;

            let expectedFlags = 0;
            if (result < 0 || result >= modulus) expectedFlags |= C;
            if (halfResult < 0 || halfResult >= 0x1000) expectedFlags |= H;
            if (operation.subtract) expectedFlags |= N;
            if (operation.name === 'ADD') {
              expectedFlags |= initialFlags & (S | Z | PV);
            } else {
              if (wrapped === 0) expectedFlags |= Z;
              if (wrapped >= signBit) expectedFlags |= S;
              if (signedResult < -signBit || signedResult >= signBit) expectedFlags |= PV;
            }

            const label = `${left.toString(16)}, ${right.toString(16)}, F=${initialFlags}`;
            assert.equal(cpu[operation.method](left, right, mode.forceShort), wrapped, label);
            assert.equal(cpu.f & DOCUMENTED_FLAGS, expectedFlags, label);
            assert.equal(cpu.madl, mode.madl, 'an operand-width override must not change ADL');
          }
        }
      }
    });
  }
}

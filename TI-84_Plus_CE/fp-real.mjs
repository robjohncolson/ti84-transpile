#!/usr/bin/env node

/**
 * fp-real.mjs — TI-83/84 9-byte real format helpers.
 *
 * Format (9 bytes):
 *   byte 0:    type/sign. 0x00 = positive real, 0x80 = negative real.
 *   byte 1:    biased exponent. exp = trueExp + 0x80.
 *              10^0 -> 0x80, 10^1 -> 0x81, 10^-1 -> 0x7F. Zero uses 0x80.
 *   bytes 2-8: 14 BCD digits (7 bytes). First nibble of byte 2 is integer
 *              digit (1-9 for normalized, 0 for zero).
 *
 * Limitations: handles integers 0..99999999999999 and simple decimals where
 * the mantissa fits cleanly in 14 digits. Sufficient for FP probe inputs.
 *
 * mem interface: { write8(addr, val), read8(addr) }
 */

export function writeReal(mem, addr, num) {
  const bytes = encodeReal(num);
  for (let i = 0; i < 9; i++) mem.write8(addr + i, bytes[i]);
}

export function readReal(mem, addr) {
  const bytes = new Uint8Array(9);
  for (let i = 0; i < 9; i++) bytes[i] = mem.read8(addr + i);
  return decodeReal(bytes);
}

// ---- encode ----------------------------------------------------------------

function encodeReal(num) {
  const bytes = new Uint8Array(9);

  if (num === 0 || !isFinite(num)) {
    // Zero: sign=0x00, exp=0x80, mantissa all zero.
    bytes[0] = 0x00;
    bytes[1] = 0x80;
    return bytes;
  }

  const negative = num < 0;
  bytes[0] = negative ? 0x80 : 0x00;

  let absVal = Math.abs(num);

  // Find the true base-10 exponent so the integer digit is 1-9.
  // trueExp = floor(log10(absVal))
  const trueExp = Math.floor(Math.log10(absVal));
  bytes[1] = (trueExp + 0x80) & 0xFF;

  // Shift absVal so the integer digit is in the units place.
  // Then extract 14 digits.
  // We scale to get 14 BCD digits starting from the most significant.
  let scaled = absVal / Math.pow(10, trueExp); // 1.xxx...

  // Round to 14 significant digits.
  scaled = parseFloat(scaled.toPrecision(14));

  // Extract 14 BCD digits.
  const digits = [];
  for (let i = 0; i < 14; i++) {
    const d = Math.floor(scaled);
    digits.push(d & 0xF);
    scaled = (scaled - d) * 10;
  }

  // Pack into bytes 2-8 (7 bytes, 2 nibbles each).
  for (let b = 0; b < 7; b++) {
    bytes[2 + b] = ((digits[b * 2] & 0xF) << 4) | (digits[b * 2 + 1] & 0xF);
  }

  return bytes;
}

// ---- decode ----------------------------------------------------------------

function decodeReal(bytes) {
  const negative = (bytes[0] & 0x80) !== 0;
  const trueExp  = (bytes[1] & 0xFF) - 0x80;

  // Extract 14 BCD digits.
  let mantissa = 0;
  for (let b = 0; b < 7; b++) {
    const hi = (bytes[2 + b] >> 4) & 0xF;
    const lo = bytes[2 + b] & 0xF;
    mantissa = mantissa * 100 + hi * 10 + lo;
  }

  // mantissa is a 14-digit integer. Normalized: first digit is integer part.
  // value = mantissa * 10^(trueExp - 13)
  let val = mantissa * Math.pow(10, trueExp - 13);

  return negative ? -val : val;
}

// ---- self-test (run directly: node fp-real.mjs) ----------------------------

if (import.meta.url === new URL(import.meta.url).href &&
    process.argv[1] &&
    process.argv[1].endsWith('fp-real.mjs')) {
  runSelfTest();
}

function runSelfTest() {
  // Fake mem backed by a Uint8Array.
  const buf = new Uint8Array(256);
  const mem = {
    write8(addr, val) { buf[addr] = val & 0xFF; },
    read8(addr)       { return buf[addr] & 0xFF; },
  };

  const cases = [
    { val: 0,    tol: 0 },
    { val: 2,    tol: 1e-9 },
    { val: 3,    tol: 1e-9 },
    { val: 5,    tol: 1e-9 },
    { val: 4,    tol: 1e-9 },
    { val: -1,   tol: 1e-9 },
    { val: 0.5,  tol: 1e-9 },
  ];

  let allPass = true;
  for (const { val, tol } of cases) {
    writeReal(mem, 0, val);
    const got = readReal(mem, 0);
    const diff = Math.abs(got - val);
    const pass = diff <= tol;
    if (!pass) allPass = false;
    // Show raw bytes.
    const raw = Array.from(buf.slice(0, 9), b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`${pass ? 'PASS' : 'FAIL'}  write(${val})  read=${got}  raw=[${raw}]`);
  }
  console.log(allPass ? '\nAll self-tests PASSED' : '\nSome self-tests FAILED');
  process.exitCode = allPass ? 0 : 1;
}

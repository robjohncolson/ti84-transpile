import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const romPath = resolve(__dirname, 'ROM.rom');

const TABLE_BASE = 0x07f196;
const ENTRY_STRIDE = 9;    // 9-byte stride per entry in ROM
const ENTRY_DATA = 8;      // 8 bytes used: 1 exponent + 7 mantissa (loader copies these)
const MIN_BYTES = 180;
const MAX_SCAN_BYTES = 512;

// The loader at 0x07F16C:
//   - writes type=0x00 (positive real) to OP2+0
//   - copies 8 bytes (exp + 7 mantissa) from table to OP2+1..OP2+8
//   - stride is 9 (ld c, 0x09), so byte 8 of each entry is padding/extra precision
//
// Table entry format (9 bytes, but only 8 used):
//   Byte 0:   biased exponent (0x80 = 10^0, 0x81 = 10^1, 0x7F = 10^-1, etc.)
//   Bytes 1-7: BCD mantissa (7 bytes = 14 digits, decimal point after first digit)
//   Byte 8:   padding / extra precision digit (not loaded into OP register)

const knownConstants = [
  { name: '180/pi', value: 180 / Math.PI, tolerance: 5e-12 },
  { name: 'pi/2', value: Math.PI / 2, tolerance: 1e-13 },
  { name: 'pi/4', value: Math.PI / 4, tolerance: 5e-14 },
  { name: 'log10(e)', value: Math.LOG10E, tolerance: 5e-14 },
  { name: 'pi', value: Math.PI, tolerance: 5e-14 },
  { name: 'pi/180', value: Math.PI / 180, tolerance: 5e-16 },
  { name: 'ln(10)', value: Math.LN10, tolerance: 5e-14 },
  { name: 'e', value: Math.E, tolerance: 5e-14 },
  { name: 'ln(2)', value: Math.LN2, tolerance: 5e-14 },
  { name: 'log2(e)', value: Math.LOG2E, tolerance: 5e-14 },
  { name: 'sqrt(2)', value: Math.SQRT2, tolerance: 5e-14 },
  { name: 'sqrt(1/2)', value: Math.SQRT1_2, tolerance: 5e-14 },
  { name: '0.5', value: 0.5, tolerance: 5e-15 },
  { name: '1.0', value: 1, tolerance: 5e-15 },
  { name: '2.0', value: 2, tolerance: 5e-14 },
  { name: '10.0', value: 10, tolerance: 5e-13 },
  { name: '90.0', value: 90, tolerance: 5e-12 },
  { name: '180.0', value: 180, tolerance: 5e-11 },
  { name: '360.0', value: 360, tolerance: 5e-11 },
];

function hexByte(byte) {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

function rawHex(bytes) {
  return Array.from(bytes, hexByte).join(' ');
}

function isBcdByte(byte) {
  return (byte & 0x0f) <= 9 && (byte >> 4) <= 9;
}

function parseBcdEntry(bytes) {
  const exponent = bytes[0];
  const mantissaBytes = bytes.subarray(1, 8);   // 7 bytes = 14 BCD digits
  const padByte = bytes[8];                      // unused by loader
  const validMantissa = Array.from(mantissaBytes).every(isBcdByte);
  const digits = Array.from(mantissaBytes, (byte) => hexByte(byte)).join('');

  if (!validMantissa) {
    return {
      exponent,
      digits,
      padByte,
      valid: false,
      decimal: 'invalid BCD mantissa',
      numeric: Number.NaN,
    };
  }

  const scale = exponent - 0x80;
  const mantissaText = `${digits[0]}.${digits.slice(1)}`;
  const decimal = `${mantissaText}e${scale}`;
  const numeric = Number(mantissaText) * (10 ** scale);

  return {
    exponent,
    digits,
    padByte,
    valid: true,
    decimal,
    numeric,
  };
}

function identifyConstant(entry) {
  if (!Number.isFinite(entry.numeric)) return '';

  const match = knownConstants.find(({ value, tolerance }) =>
    Math.abs(entry.numeric - value) <= tolerance
  );

  if (match) return match.name;

  const rounded = Math.round(entry.numeric);
  if (Math.abs(entry.numeric - rounded) <= 1e-12 && Math.abs(rounded) <= 10000) {
    return `${rounded}.0`;
  }

  return '';
}

function looksLikeBcdEntry(bytes, offset) {
  if (offset + ENTRY_STRIDE > bytes.length) return false;
  const entry = bytes.subarray(offset, offset + ENTRY_STRIDE);

  // Exponent should be in a reasonable range for math constants
  const exponentOk = entry[0] >= 0x70 && entry[0] <= 0x90;

  // Mantissa bytes (1-7) must be valid BCD
  const mantissaOk = Array.from(entry.subarray(1, 8)).every(isBcdByte);

  return exponentOk && mantissaOk;
}

const rom = readFileSync(romPath);
const scanLength = Math.min(MAX_SCAN_BYTES, rom.length - TABLE_BASE);
const tableBytes = rom.subarray(TABLE_BASE, TABLE_BASE + scanLength);

console.log(`BCD constant table probe`);
console.log(`ROM: ${romPath}`);
console.log(`Base: 0x${TABLE_BASE.toString(16).toUpperCase().padStart(6, '0')}`);
console.log(`Entry stride: ${ENTRY_STRIDE} bytes (${ENTRY_DATA} used + 1 padding)`);
console.log(`Minimum bytes requested: ${MIN_BYTES}`);
console.log('');
console.log('Table entry format: [exp] [mantissa x7] [pad]');
console.log('  exp = biased exponent (0x80 = 10^0)');
console.log('  mantissa = 7 BCD bytes (14 digits), decimal after first digit');
console.log('  pad = extra byte (not loaded by 0x07F16C)');
console.log('  All entries are positive real (loader writes type=0x00)');
console.log('');
console.log('idx  address   raw bytes                    exp   decoded                 identification');
console.log('---  --------  ---------------------------  ----  ----------------------  --------------');

let entryCount = 0;
let endReason = 'scan limit reached';

for (let offset = 0; offset + ENTRY_STRIDE <= tableBytes.length; offset += ENTRY_STRIDE) {
  const absolute = TABLE_BASE + offset;

  if (!looksLikeBcdEntry(tableBytes, offset)) {
    endReason = `non-BCD data at 0x${absolute.toString(16).toUpperCase().padStart(6, '0')}`;
    break;
  }

  const bytes = tableBytes.subarray(offset, offset + ENTRY_STRIDE);
  const parsed = parseBcdEntry(bytes);
  const id = identifyConstant(parsed);
  const decoded = parsed.valid ? `${parsed.decimal} = ${parsed.numeric}` : parsed.decimal;
  const expStr = `0x${hexByte(parsed.exponent)}`;

  console.log(
    `${String(entryCount).padStart(3)}  ` +
    `0x${absolute.toString(16).toUpperCase().padStart(6, '0')}  ` +
    `${rawHex(bytes).padEnd(27)}  ` +
    `${expStr}  ` +
    `${decoded.padEnd(22)}  ` +
    id
  );

  entryCount += 1;
}

console.log('');
console.log(`Total BCD entries: ${entryCount}`);
console.log(`End: ${endReason}`);

// Validation checks
console.log('');
console.log('=== Validation ===');

const expected = [
  { idx: 0, name: '180/pi', value: 180 / Math.PI },
  { idx: 4, name: 'pi', value: Math.PI },
];

let pass = true;
for (const { idx, name, value } of expected) {
  const addr = TABLE_BASE + idx * ENTRY_STRIDE;
  const bytes = rom.subarray(addr, addr + ENTRY_STRIDE);
  const parsed = parseBcdEntry(bytes);
  const relErr = Math.abs((parsed.numeric - value) / value);
  const ok = relErr < 1e-13;
  console.log(`Entry ${idx} (${name}): decoded=${parsed.numeric}, expected=${value}, relErr=${relErr.toExponential(2)} ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) pass = false;
}

if (!pass) {
  console.log('VALIDATION FAILED');
  process.exit(1);
}

console.log('All validations passed');

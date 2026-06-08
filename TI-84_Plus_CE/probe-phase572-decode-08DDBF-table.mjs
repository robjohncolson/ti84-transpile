import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TABLE_ADDR = 0x08ddbf;
const ENTRY_COUNT = 19;
const ENTRY_SIZE = 3;

const INTERESTING_RANGES = [
  { name: 'token classifiers', start: 0x09ba00, end: 0x09bcff },
  { name: 'expression evaluators', start: 0x059300, end: 0x05a6ff },
];

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function romAddr(offset) {
  return hex(offset, 6);
}

function numbered(prefix, second, base, zeroName = null) {
  if (second >= 0x00 && second <= 0x08) return `${prefix}${second + 1}`;
  if (second === 0x09) return zeroName ?? `${prefix}10`;
  return `${base} item ${hex(second)}`;
}

function matrixName(second) {
  if (second >= 0x00 && second <= 0x09) {
    return `[${String.fromCharCode(0x41 + second)}]`;
  }
  return `Matrix var ${hex(second)}`;
}

function yVarName(second) {
  const names = [
    'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y0',
    'X1T', 'Y1T', 'X2T', 'Y2T', 'X3T', 'Y3T', 'X4T', 'Y4T', 'X5T', 'Y5T',
    'X6T', 'Y6T', 'r1', 'theta1', 'r2', 'theta2', 'r3', 'theta3',
    'r4', 'theta4', 'r5', 'theta5', 'r6', 'theta6',
    'u', 'v', 'w',
  ];
  return names[second] ?? `Y-var ${hex(second)}`;
}

function statsVarName(second) {
  const names = [
    'RegEQ', 'n', 'xbar', 'sum(x)', 'sum(x^2)', 'Sx', 'sigma x', 'minX',
    'maxX', 'minY', 'maxY', 'ybar', 'sum(y)', 'sum(y^2)', 'Sy', 'sigma y',
    'sum(xy)', 'r', 'Med', 'Q1', 'Q3', 'a', 'b', 'c', 'd', 'e',
    'x1', 'x2', 'x3', 'y1', 'y2', 'y3',
  ];
  return names[second] ?? `Stats var ${hex(second)}`;
}

function windowVarName(second) {
  const names = [
    'Xmin', 'Xmax', 'Xscl', 'Ymin', 'Ymax', 'Yscl', 'Tmin', 'Tmax',
    'Tstep', 'theta min', 'theta max', 'theta step', 'ZXmin', 'ZXmax',
    'ZXscl', 'ZYmin', 'ZYmax', 'ZYscl', 'ZTmin', 'ZTmax', 'ZTstep',
    'Ztheta min', 'Ztheta max', 'Ztheta step', 'TblStart', 'DeltaTbl',
  ];
  return names[second] ?? `Window/Table var ${hex(second)}`;
}

function extendedTokenName(second) {
  const names = new Map([
    [0x00, 'Asm('],
    [0x01, 'AsmComp('],
    [0x02, 'AsmPrgm'],
    [0x03, 'compiled ASM program marker'],
    [0x04, 'OpenLib('],
    [0x05, 'ExecLib'],
    [0x06, 'invT('],
    [0x07, 'chi2pdf('],
    [0x08, 'chi2cdf('],
    [0x09, 'Fpdf('],
    [0x0a, 'Fcdf('],
    [0x0b, 'binompdf('],
    [0x0c, 'binomcdf('],
    [0x0d, 'poissonpdf('],
    [0x0e, 'poissoncdf('],
    [0x0f, 'geometpdf('],
    [0x10, 'geometcdf('],
  ]);
  return names.get(second) ?? `Extended token ${hex(second)}`;
}

function graphFormatName(second) {
  const names = [
    'Sequential', 'Simul', 'PolarGC', 'RectGC', 'CoordOn', 'CoordOff',
    'DrawLine', 'DrawDot', 'AxesOn', 'AxesOff', 'GridOn', 'GridOff',
    'ExprOn', 'ExprOff',
  ];
  return names[second] ?? `Graph format token ${hex(second)}`;
}

function statsCommandName(second) {
  const names = new Map([
    [0x00, 'Med-Med'],
    [0x01, 'LinReg(ax+b)'],
    [0x02, 'QuadReg'],
    [0x03, 'CubicReg'],
    [0x04, 'QuartReg'],
    [0x05, 'LinReg(a+bx)'],
    [0x06, 'LnReg'],
    [0x07, 'ExpReg'],
    [0x08, 'PwrReg'],
    [0x09, 'Logistic'],
    [0x0a, 'SinReg'],
  ]);
  return names.get(second) ?? `Stats command ${hex(second)}`;
}

function decodeToken(prefix, second) {
  switch (prefix) {
    case 0x5c:
      return { className: 'List var', tokenName: numbered('L', second, 'List var'), purpose: 'Named list variable token' };
    case 0x5d:
      return { className: 'Matrix var', tokenName: matrixName(second), purpose: 'Named matrix variable token' };
    case 0x5e:
      return { className: 'Y-var', tokenName: yVarName(second), purpose: 'Graph equation/function variable token' };
    case 0x60:
      return { className: 'Pic var', tokenName: numbered('Pic', second, 'Pic var', 'Pic0'), purpose: 'Picture variable token' };
    case 0x61:
      return { className: 'GDB var', tokenName: numbered('GDB', second, 'GDB var', 'GDB0'), purpose: 'Graph database variable token' };
    case 0x62:
      return { className: 'String var', tokenName: numbered('Str', second, 'String var', 'Str0'), purpose: 'String variable token' };
    case 0x63:
      return { className: 'Stats var', tokenName: statsVarName(second), purpose: 'Statistics result/system variable token' };
    case 0x7e:
      return { className: 'Window/Table var', tokenName: windowVarName(second), purpose: 'Window, zoom-window, or table setup variable token' };
    case 0xaa:
      return { className: 'Stats command', tokenName: statsCommandName(second), purpose: 'Statistics command token with extended prefix' };
    case 0xbb:
      return { className: 'Extended token', tokenName: extendedTokenName(second), purpose: 'Extended calculator command/function token' };
    case 0xef:
      return { className: 'Graph format', tokenName: graphFormatName(second), purpose: 'Graph display format setting token' };
    default:
      return { className: `Prefix ${hex(prefix)}`, tokenName: `Token ${hex(prefix)} ${hex(second)}`, purpose: 'Unknown prefixed TI token' };
  }
}

function countByte(rom, byte) {
  let count = 0;
  for (const value of rom) {
    if (value === byte) count += 1;
  }
  return count;
}

function findByteInRange(rom, byte, range, limit = 10) {
  const matches = [];
  const end = Math.min(range.end, rom.length - 1);
  for (let offset = range.start; offset <= end; offset += 1) {
    if (rom[offset] === byte) {
      matches.push(offset);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

function formatXrefs(rom, internal) {
  const parts = [];
  for (const range of INTERESTING_RANGES) {
    const matches = findByteInRange(rom, internal, range);
    if (matches.length === 0) {
      parts.push(`${range.name}: none`);
    } else {
      parts.push(`${range.name}: ${matches.map(romAddr).join(', ')}`);
    }
  }
  return parts.join(' | ');
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const rom = fs.readFileSync(ROM_PATH);
const tableEnd = TABLE_ADDR + ENTRY_COUNT * ENTRY_SIZE;
if (rom.length < tableEnd) {
  throw new Error(`ROM is too short for table ${romAddr(TABLE_ADDR)}-${romAddr(tableEnd - 1)}; length=${rom.length}`);
}

const entries = [];
for (let index = 0; index < ENTRY_COUNT; index += 1) {
  const offset = TABLE_ADDR + index * ENTRY_SIZE;
  const prefix = rom[offset];
  const second = rom[offset + 1];
  const internal = rom[offset + 2];
  const decoded = decodeToken(prefix, second);
  entries.push({ index, offset, prefix, second, internal, ...decoded });
}

console.log('Phase 572 probe: decode 0x08DDBF token translation table');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Table: ${romAddr(TABLE_ADDR)}-${romAddr(tableEnd - 1)} (${ENTRY_COUNT} entries x ${ENTRY_SIZE} bytes)`);
console.log('');
console.log('entry | addr     | pref second internal | token class        | token name                    | purpose');
console.log('------+----------+----------------------+--------------------+-------------------------------+----------------------------------------------');

for (const entry of entries) {
  const bytes = `${hex(entry.prefix)}   ${hex(entry.second)}     ${hex(entry.internal)}`;
  console.log(
    `${String(entry.index).padStart(5)} | ${romAddr(entry.offset)} | ${bytes.padEnd(20)} | ` +
    `${entry.className.padEnd(18)} | ${entry.tokenName.padEnd(29)} | ${entry.purpose}`
  );
}

console.log('');
console.log('Internal-byte cross references');
console.log('These are byte-level hits for the compact internal representation. They are hints, not proof of semantic use.');
for (const entry of entries) {
  const total = countByte(rom, entry.internal);
  console.log(
    `#${String(entry.index).padStart(2)} ${hex(entry.internal)} <= ${hex(entry.prefix)} ${hex(entry.second)} ` +
    `${entry.tokenName}: full-ROM byte count=${total}; ${formatXrefs(rom, entry.internal)}`
  );
}

console.log('');
console.log('Summary');
console.log('The 0x08DDBF table is a 19-entry bidirectional bridge between selected 2-byte TI tokens and compact 1-byte internal token IDs.');
console.log('The forward routine at 0x08DD8C maps prefixed token bytes to the internal byte; the reverse routine at 0x08DDA5 reconstructs the prefixed token from that internal byte.');
console.log('The decoded entries identify which variable, graph, statistics, or extended-token classes are compressed by this shared lookup table.');

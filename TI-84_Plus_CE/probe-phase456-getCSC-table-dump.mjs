#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const WINDOW_START = 0x03FC00;
const WINDOW_END = 0x03FC80;
const GETK_START = 0x03FC1C;
const GETK_END = 0x03FC40;
const GETK_RET = 0x03FC41;
const TABLE_BASE = 0x03FC41;
const TABLE_DUMP_LENGTH = 0x40;
const MAX_OS_SCAN = 0x38;
const D0058D_ADDR = 0xD0058D;

const KEY_MATRIX = [
  ['DOWN', 'LEFT', 'RIGHT', 'UP', null, null, null, null],
  ['ENTER', '+', '-', '*', '/', '^', 'CLEAR', null],
  ['(-)', '3', '6', '9', ')', 'TAN', 'VARS', null],
  ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'X,T,theta,n'],
  [null, 'STO>', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', 'DEL'],
];

function fail(message) {
  throw new Error(message);
}

if (!fs.existsSync(ROM_PATH)) {
  fail(`ROM not found: ${ROM_PATH}`);
}

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return hex(value & 0xFF, 2);
}

function read24(addr) {
  return (
    (rom[addr] & 0xFF)
    | ((rom[addr + 1] & 0xFF) << 8)
    | ((rom[addr + 2] & 0xFF) << 16)
  ) >>> 0;
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function asciiChar(value) {
  return value >= 0x20 && value <= 0x7E ? String.fromCharCode(value) : '.';
}

function pad(value, width) {
  return String(value).padEnd(width, ' ');
}

function buildKeyMaps() {
  const matrixMap = new Map();
  const osScanMap = new Map();

  for (let matrixIndex = 0; matrixIndex < KEY_MATRIX.length; matrixIndex += 1) {
    for (let bit = 0; bit < KEY_MATRIX[matrixIndex].length; bit += 1) {
      const keyName = KEY_MATRIX[matrixIndex][bit];
      if (!keyName) {
        continue;
      }

      const matrixCode = ((matrixIndex << 4) | bit) & 0xFF;
      const osScan = (((6 - matrixIndex) * 8) + bit + 1) & 0xFF;
      const info = { keyName, matrixIndex, bit, matrixCode, osScan };

      matrixMap.set(matrixCode, info);
      osScanMap.set(osScan, info);
    }
  }

  return { matrixMap, osScanMap };
}

const { matrixMap, osScanMap } = buildKeyMaps();

function formatKeyInfo(info) {
  if (!info) {
    return '(no mapped physical key)';
  }

  return `${info.keyName} (matrix ${hex(info.matrixCode, 2)}, group ${info.matrixIndex}, bit ${info.bit})`;
}

function tableByte(index) {
  return rom[TABLE_BASE + index];
}

function dumpWindow() {
  console.log('=== ROM Window 0x03FC00-0x03FC80 ===');
  console.log('');

  for (let addr = WINDOW_START; addr <= WINDOW_END; addr += 16) {
    const bytes = [];
    const ascii = [];
    const rowEnd = Math.min(addr + 15, WINDOW_END);

    for (let cur = addr; cur <= rowEnd; cur += 1) {
      bytes.push(byteHex(rom[cur]));
      ascii.push(asciiChar(rom[cur]));
    }

    console.log(
      `${hex(addr, 6)}: ${bytes.join(' ').padEnd(47, ' ')} ${ascii.join('')}`,
    );
  }
}

function decodeInstruction(pc) {
  const op = rom[pc];

  switch (op) {
    case 0x11: {
      const imm = read24(pc + 1);
      return { length: 4, text: `LD DE,${hex(imm, 6)}` };
    }
    case 0x18: {
      const disp = signed8(rom[pc + 1]);
      const target = (pc + 2 + disp) & 0xFFFFFF;
      return { length: 2, text: `JR ${hex(target, 6)}` };
    }
    case 0x19:
      return { length: 1, text: 'ADD HL,DE' };
    case 0x20: {
      const disp = signed8(rom[pc + 1]);
      const target = (pc + 2 + disp) & 0xFFFFFF;
      return { length: 2, text: `JR NZ,${hex(target, 6)}` };
    }
    case 0x21: {
      const imm = read24(pc + 1);
      return { length: 4, text: `LD HL,${hex(imm, 6)}` };
    }
    case 0x5F:
      return { length: 1, text: 'LD E,A' };
    case 0x62:
      return { length: 1, text: 'LD H,D' };
    case 0x67:
      return { length: 1, text: 'LD H,A' };
    case 0x6E:
      return { length: 1, text: 'LD L,(HL)' };
    case 0x6F:
      return { length: 1, text: 'LD L,A' };
    case 0x72:
      return { length: 1, text: 'LD (HL),D' };
    case 0x7E:
      return { length: 1, text: 'LD A,(HL)' };
    case 0xB7:
      return { length: 1, text: 'OR A' };
    case 0xC9:
      return { length: 1, text: 'RET' };
    case 0xCD: {
      const imm = read24(pc + 1);
      return { length: 4, text: `CALL ${hex(imm, 6)}` };
    }
    case 0xE1:
      return { length: 1, text: 'POP HL' };
    case 0xE5:
      return { length: 1, text: 'PUSH HL' };
    case 0xF1:
      return { length: 1, text: 'POP AF' };
    case 0xF5:
      return { length: 1, text: 'PUSH AF' };
    default:
      return { length: 1, text: `DB ${byteHex(op)}` };
  }
}

function instructionComment(pc, text) {
  switch (pc) {
    case 0x03FC1C:
      return `reads the consumed scan slot at ${hex(D0058D_ADDR, 6)}`;
    case 0x03FC21:
      return 'zero means "no key pending"';
    case 0x03FC22:
      return 'non-zero enters the lookup path';
    case 0x03FC24:
    case 0x03FC25:
      return 'zero path returns HL=0 without touching the table';
    case 0x03FC28:
      return 'D stays 0 so later LD H,D zero-extends the table byte';
    case 0x03FC2D:
      return `clears ${hex(D0058D_ADDR, 6)} after consuming the scan code`;
    case 0x03FC2E:
      return 'base address for the 1-based lookup';
    case 0x03FC32:
      return 'effective address = 0x03FC41 + scanCode';
    case 0x03FC33:
      return 'loads the translated byte from ROM';
    case 0x03FC34:
      return 'zero-extends the translated byte into HL';
    case 0x03FC36:
      return 'passes the translated value downstream';
    case 0x03FC3C:
      return text === 'CALL 0x0AF8C4' ? 'post-processing call' : '';
    default:
      return '';
  }
}

function disassembleGetK() {
  console.log('=== Manual Disassembly 0x03FC1C-0x03FC40 ===');
  console.log('');

  let pc = GETK_START;
  while (pc <= GETK_END) {
    const decoded = decodeInstruction(pc);
    const bytes = [];
    for (let i = 0; i < decoded.length; i += 1) {
      bytes.push(byteHex(rom[pc + i]));
    }

    const comment = instructionComment(pc, decoded.text);
    const line = `${hex(pc, 6)}: ${bytes.join(' ').padEnd(11, ' ')} ${decoded.text}`;
    console.log(comment ? `${line}  ; ${comment}` : line);
    pc += decoded.length;
  }

  console.log('');
  console.log(
    `${hex(GETK_RET, 6)}: ${byteHex(rom[GETK_RET])}           RET  ; next byte after the requested window`,
  );
}

function dumpTableGrid() {
  console.log('');
  console.log(`=== 64-Byte Dump At ${hex(TABLE_BASE, 6)} (8x8 Grid) ===`);
  console.log('');

  for (let row = 0; row < 8; row += 1) {
    const baseIndex = row * 8;
    const rowAddr = TABLE_BASE + baseIndex;
    const cells = [];

    for (let col = 0; col < 8; col += 1) {
      cells.push(byteHex(tableByte(baseIndex + col)));
    }

    console.log(`${hex(baseIndex, 2)} @ ${hex(rowAddr, 6)}: ${cells.join(' ')}`);
  }

  console.log('');
  console.log(`slot 0x00 byte = ${byteHex(tableByte(0x00))} at ${hex(TABLE_BASE, 6)}`);
  console.log('  That byte is the RET at 0x03FC41. _GetK special-cases scan=0 and does not use it.');
  console.log(`reachable OS scan slots: 0x01-0x${MAX_OS_SCAN.toString(16).toUpperCase()}`);
  console.log('  Slots 0x39-0x3F are outside the _GetCSC range and spill into the next routine.');
}

function printCrossReference() {
  const matrix12 = matrixMap.get(0x12);
  const os12 = osScanMap.get(0x12);
  const slot12Addr = TABLE_BASE + 0x12;
  const slot12Byte = tableByte(0x12);

  const used60Slots = [];
  for (let scan = 0x01; scan <= MAX_OS_SCAN; scan += 1) {
    if (tableByte(scan) === 0x60) {
      used60Slots.push(scan);
    }
  }

  console.log('');
  console.log('=== Namespace Cross-Reference ===');
  console.log('');
  console.log(`matrix code 0x12 = ${formatKeyInfo(matrix12)}`);
  console.log(`OS scan  0x12   = ${formatKeyInfo(os12)}`);
  console.log(
    `lookup slot 0x12 = ROM[${hex(slot12Addr, 6)}] = ${byteHex(slot12Byte)}`,
  );
  console.log(
    used60Slots.length > 0
      ? `reachable slots yielding 0x60: ${used60Slots.map((scan) => hex(scan, 2)).join(', ')}`
      : 'reachable slots yielding 0x60: none',
  );
}

function describeScan(scan) {
  if (scan === 0x00) {
    return {
      state: 'special-zero',
      key: 'no key',
      note: 'table bypassed; slot 0x00 is the RET byte',
    };
  }

  if (scan > MAX_OS_SCAN) {
    return {
      state: 'outside-range',
      key: '(n/a)',
      note: 'outside _GetCSC output range; this byte is next-routine code',
    };
  }

  const info = osScanMap.get(scan);
  if (!info) {
    return {
      state: 'gap',
      key: '(unused slot)',
      note: 'OS scan code slot exists but no physical key is assigned here',
    };
  }

  return {
    state: 'reachable',
    key: info.keyName,
    note: `matrix ${hex(info.matrixCode, 2)}, group ${info.matrixIndex}, bit ${info.bit}`,
  };
}

function printFullMapping() {
  console.log('');
  console.log('=== Full OS Scan -> Table Byte Mapping (0x00-0x3F) ===');
  console.log('');
  console.log(
    `${pad('Scan', 6)} ${pad('Addr', 10)} ${pad('Byte', 6)} ${pad('State', 14)} ${pad('Key', 14)} Note`,
  );
  console.log('-'.repeat(76));

  for (let scan = 0x00; scan < 0x40; scan += 1) {
    const desc = describeScan(scan);
    console.log(
      `${pad(hex(scan, 2), 6)} `
      + `${pad(hex(TABLE_BASE + scan, 6), 10)} `
      + `${pad(byteHex(tableByte(scan)), 6)} `
      + `${pad(desc.state, 14)} `
      + `${pad(desc.key, 14)} `
      + `${desc.note}`,
    );
  }
}

function printSummary() {
  console.log('');
  console.log('=== Summary ===');
  console.log('');
  console.log(`ROM size: ${rom.length} bytes`);
  console.log('_GetK reads D0058D, not D00587.');
  console.log('The ROM base used by the lookup is 0x03FC41, but scan 0 is handled separately.');
  console.log('That makes the effective table 1-based: scan N reads ROM[0x03FC41 + N].');
  console.log(`For D0058D=0x12, the lookup byte is ${byteHex(tableByte(0x12))}, not 0x60.`);
  console.log('OS scan 0x12 corresponds to the "1" key; matrix code 0x12 corresponds to the "-" key.');
  console.log('No reachable OS scan slot 0x01-0x38 in this lookup window maps to 0x60.');
}

function main() {
  console.log('Phase 456: _GetCSC / _GetK table dump');
  console.log(`ROM loaded: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log('');

  dumpWindow();
  console.log('');
  disassembleGetK();
  dumpTableGrid();
  printCrossReference();
  printFullMapping();
  printSummary();
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}

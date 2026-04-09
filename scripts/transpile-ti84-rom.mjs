import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let Z80;

try {
  Z80 = require('z80js');
} catch (error) {
  console.error('Missing generation dependency: z80js');
  console.error('Install it once with: npm install --no-save --package-lock=false z80js');
  throw error;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = path.join(repoRoot, 'TI-84_Plus_CE', 'ROM.rom');
const outPath = path.join(repoRoot, 'TI-84_Plus_CE', 'ROM.transpiled.js');
const reportPath = path.join(repoRoot, 'TI-84_Plus_CE', 'ROM.transpiled.report.json');

const romBytes = fs.readFileSync(romPath);
const romBase64 = romBytes.toString('base64');

const prefixTable = {
  0x40: { suffix: 'SIS', mode: 'z80', immBytes: 2 },
  0x49: { suffix: 'LIS', mode: 'adl', immBytes: 2 },
  0x52: { suffix: 'SIL', mode: 'z80', immBytes: 3 },
  0x5b: { suffix: 'LIL', mode: 'adl', immBytes: 3 },
};

const absoluteImmOps = new Set([
  0x01, 0x11, 0x21, 0x31,
  0x22, 0x2a, 0x32, 0x3a,
  0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea, 0xf2, 0xfa,
  0xc3,
  0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc,
  0xcd,
]);

const absoluteEdOps = new Set([0x43, 0x4b, 0x53, 0x5b, 0x63, 0x6b, 0x73, 0x7b]);

const in0Regs = {
  0x38: 'a',
  0x00: 'b',
  0x08: 'c',
  0x10: 'd',
  0x18: 'e',
  0x20: 'h',
  0x28: 'l',
};

const out0Regs = {
  0x39: 'a',
  0x01: 'b',
  0x09: 'c',
  0x11: 'd',
  0x19: 'e',
  0x21: 'h',
  0x29: 'l',
};

const tstRegs = {
  0x3c: 'a',
  0x04: 'b',
  0x0c: 'c',
  0x14: 'd',
  0x1c: 'e',
  0x24: 'h',
  0x2c: 'l',
};

const leaIxRegs = {
  0x02: 'bc',
  0x12: 'de',
  0x22: 'hl',
};

const leaIyRegs = {
  0x03: 'bc',
  0x13: 'de',
  0x23: 'hl',
};

const mltRegs = {
  0x4c: 'bc',
  0x5c: 'de',
  0x6c: 'hl',
  0x7c: 'sp',
};

const loadWordFromHlRegs = {
  0x07: 'bc',
  0x17: 'de',
  0x27: 'hl',
};

const storeWordToHlRegs = {
  0x0f: 'bc',
  0x1f: 'de',
  0x2f: 'hl',
};

const conditionNames = {
  0x20: 'nz',
  0x28: 'z',
  0x30: 'nc',
  0x38: 'c',
  0xc0: 'nz',
  0xc8: 'z',
  0xd0: 'nc',
  0xd8: 'c',
  0xe0: 'po',
  0xe8: 'pe',
  0xf0: 'p',
  0xf8: 'm',
  0xc2: 'nz',
  0xca: 'z',
  0xd2: 'nc',
  0xda: 'c',
  0xe2: 'po',
  0xea: 'pe',
  0xf2: 'p',
  0xfa: 'm',
  0xc4: 'nz',
  0xcc: 'z',
  0xd4: 'nc',
  0xdc: 'c',
  0xe4: 'po',
  0xec: 'pe',
  0xf4: 'p',
  0xfc: 'm',
};

const indexedCbRegisters = ['b', 'c', 'd', 'e', 'h', 'l', null, 'a'];

const indexedCbOperations = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];

const z80Memory = {
  read8(address) {
    return romBytes[address] ?? 0;
  },
  write8() {},
};

const z80 = new Z80(
  z80Memory,
  {
    read() {
      return 0;
    },
    write() {},
  },
  false
);

function hex(value, width = 2) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function formatKey(pc, mode) {
  return `${pc.toString(16).padStart(6, '0')}:${mode}`;
}

function signedByte(byte) {
  return byte & 0x80 ? byte - 0x100 : byte;
}

function readLE(address, byteCount) {
  let value = 0;

  for (let index = 0; index < byteCount; index += 1) {
    value |= (romBytes[address + index] ?? 0) << (index * 8);
  }

  return value >>> 0;
}

function bytesToHex(address, length) {
  return Array.from(romBytes.slice(address, address + length))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
}

function canonicalizeDasm(dasm) {
  return dasm.replace(/\$([0-9a-fA-F]+)/g, (_, raw) => hex(Number.parseInt(raw, 16), raw.length));
}

function wrap24(value) {
  return value & 0xffffff;
}

function normalizeNumericLiteral(raw) {
  return raw.replace('$', '0x').toLowerCase();
}

function formatIndexedOperand(register, displacement) {
  return `(${register}${displacement >= 0 ? '+' : ''}${displacement})`;
}

function getWordByteWidth(instruction) {
  if (instruction.prefix === 'SIS' || instruction.prefix === 'LIS') {
    return 2;
  }

  if (instruction.prefix === 'SIL' || instruction.prefix === 'LIL') {
    return 3;
  }

  return instruction.mode === 'adl' ? 3 : 2;
}

function getWordReadAccessor(instruction) {
  return getWordByteWidth(instruction) === 2 ? 'read16' : 'read24';
}

function getWordWriteAccessor(instruction) {
  return getWordByteWidth(instruction) === 2 ? 'write16' : 'write24';
}

function manualIndexedCbInstruction(startPc, pc, op0, mode) {
  if (op0 !== 0xdd && op0 !== 0xfd) {
    return null;
  }

  let indexRegister = op0 === 0xdd ? 'ix' : 'iy';
  let cbPc = pc;

  if ((romBytes[pc + 1] === 0xdd || romBytes[pc + 1] === 0xfd) && romBytes[pc + 2] === 0xcb) {
    indexRegister = romBytes[pc + 1] === 0xdd ? 'ix' : 'iy';
    cbPc = pc + 1;
  } else if (romBytes[pc + 1] !== 0xcb) {
    return null;
  }

  const displacement = signedByte(romBytes[cbPc + 2] ?? 0);
  const opcode = romBytes[cbPc + 3] ?? 0;
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 0x07;
  const registerCode = opcode & 0x07;
  const destination = indexedCbRegisters[registerCode];
  const operand = formatIndexedOperand(indexRegister, displacement);
  const length = cbPc + 4 - startPc;

  if (group === 0) {
    const operation = indexedCbOperations[bit];

    return {
      tag: 'indexed-cb-rotate',
      dasm: destination ? `ld ${destination}, ${operation} ${operand}` : `${operation} ${operand}`,
      indexRegister,
      displacement,
      operation,
      destination,
      length,
      nextMode: mode,
    };
  }

  if (group === 1) {
    return {
      tag: 'indexed-cb-bit',
      dasm: `bit ${bit}, ${operand}`,
      indexRegister,
      displacement,
      bit,
      length,
      nextMode: mode,
    };
  }

  if (group === 2) {
    return {
      tag: 'indexed-cb-res',
      dasm: destination ? `ld ${destination}, res ${bit}, ${operand}` : `res ${bit}, ${operand}`,
      indexRegister,
      displacement,
      bit,
      destination,
      length,
      nextMode: mode,
    };
  }

  return {
    tag: 'indexed-cb-set',
    dasm: destination ? `ld ${destination}, set ${bit}, ${operand}` : `set ${bit}, ${operand}`,
    indexRegister,
    displacement,
    bit,
    destination,
    length,
    nextMode: mode,
  };
}

function manualIndexedInstruction(startPc, pc, op0, mode) {
  if (op0 !== 0xdd && op0 !== 0xfd) {
    return null;
  }

  const op1 = romBytes[pc + 1];
  const indexRegister = op0 === 0xdd ? 'ix' : 'iy';
  const displacement = signedByte(romBytes[pc + 2] ?? 0);

  if (op1 === 0x36) {
    const value = romBytes[pc + 3] ?? 0;

    return {
      tag: 'indexed-immediate-store',
      dasm: `ld ${formatIndexedOperand(indexRegister, displacement)}, ${hex(value)}`,
      indexRegister,
      displacement,
      value,
      length: pc + 4 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0xbe) {
    return {
      tag: 'indexed-compare',
      dasm: `cp a, ${formatIndexedOperand(indexRegister, displacement)}`,
      indexRegister,
      displacement,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  return null;
}

function manualEdInstruction(startPc, pc, op1, prefix, mode) {
  const operand8 = romBytes[pc + 2];
  const displacement = signedByte(romBytes[pc + 2] ?? 0);

  if (op1 === 0x7e) {
    return {
      tag: 'rsmix',
      dasm: 'rsmix',
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x7d) {
    return {
      tag: 'stmix',
      dasm: 'stmix',
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x76) {
    return {
      tag: 'slp',
      dasm: 'slp',
      length: pc + 2 - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  if (op1 in in0Regs) {
    return {
      tag: 'in0',
      dasm: `in0 ${in0Regs[op1]}, (${hex(operand8)})`,
      reg: in0Regs[op1],
      port: operand8,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  if (op1 in out0Regs) {
    return {
      tag: 'out0',
      dasm: `out0 (${hex(operand8)}), ${out0Regs[op1]}`,
      reg: out0Regs[op1],
      port: operand8,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x64) {
    return {
      tag: 'tst-immediate',
      dasm: `tst a, ${hex(operand8)}`,
      value: operand8,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x74) {
    return {
      tag: 'tstio',
      dasm: `tstio ${hex(operand8)}`,
      value: operand8,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x34) {
    return {
      tag: 'tst-hl',
      dasm: 'tst a, (hl)',
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 in tstRegs) {
    return {
      tag: 'tst-register',
      dasm: `tst a, ${tstRegs[op1]}`,
      reg: tstRegs[op1],
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 in mltRegs) {
    return {
      tag: 'mlt',
      dasm: `mlt ${mltRegs[op1]}`,
      reg: mltRegs[op1],
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x93) {
    return {
      tag: 'otimr',
      dasm: 'otimr',
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 in loadWordFromHlRegs) {
    return {
      tag: 'load-word-from-hl',
      dasm: `ld ${loadWordFromHlRegs[op1]}, (hl)`,
      register: loadWordFromHlRegs[op1],
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 in storeWordToHlRegs) {
    return {
      tag: 'store-word-to-hl',
      dasm: `ld (hl), ${storeWordToHlRegs[op1]}`,
      register: storeWordToHlRegs[op1],
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x31) {
    return {
      tag: 'ld-iy-from-hl',
      dasm: 'ld iy, (hl)',
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x37) {
    return {
      tag: 'ld-ix-from-hl',
      dasm: 'ld ix, (hl)',
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x3e) {
    return {
      tag: 'ld-hl-from-iy',
      dasm: 'ld (hl), iy',
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x3f) {
    return {
      tag: 'ld-hl-from-ix',
      dasm: 'ld (hl), ix',
      length: pc + 2 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x32) {
    return {
      tag: 'lea',
      dasm: `lea ix, ix${displacement >= 0 ? '+' : ''}${displacement}`,
      destination: 'ix',
      base: 'ix',
      displacement,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x33) {
    return {
      tag: 'lea',
      dasm: `lea iy, iy${displacement >= 0 ? '+' : ''}${displacement}`,
      destination: 'iy',
      base: 'iy',
      displacement,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x54) {
    return {
      tag: 'lea',
      dasm: `lea ix, iy${displacement >= 0 ? '+' : ''}${displacement}`,
      destination: 'ix',
      base: 'iy',
      displacement,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  if (op1 === 0x55) {
    return {
      tag: 'lea',
      dasm: `lea iy, ix${displacement >= 0 ? '+' : ''}${displacement}`,
      destination: 'iy',
      base: 'ix',
      displacement,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  if (op1 in leaIxRegs) {
    return {
      tag: 'lea',
      dasm: `lea ${leaIxRegs[op1]}, ix${displacement >= 0 ? '+' : ''}${displacement}`,
      destination: leaIxRegs[op1],
      base: 'ix',
      displacement,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  if (op1 in leaIyRegs) {
    return {
      tag: 'lea',
      dasm: `lea ${leaIyRegs[op1]}, iy${displacement >= 0 ? '+' : ''}${displacement}`,
      destination: leaIyRegs[op1],
      base: 'iy',
      displacement,
      length: pc + 3 - startPc,
      nextMode: mode,
    };
  }

  return null;
}

function controlFlowInstruction(startPc, pc, op0, prefix, mode) {
  const effectiveImmBytes = prefix ? prefix.immBytes : mode === 'adl' ? 3 : 2;
  const modeAfterControl = prefix ? prefix.mode : mode;

  if (op0 === 0x18) {
    const target = wrap24(startPc + (pc - startPc) + 2 + signedByte(romBytes[pc + 1] ?? 0));

    return {
      tag: 'jr',
      dasm: `jr ${hex(target, 6)}`,
      kind: 'jump',
      target,
      targetMode: modeAfterControl,
      length: pc + 2 - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  if ([0x20, 0x28, 0x30, 0x38].includes(op0)) {
    const target = wrap24(startPc + (pc - startPc) + 2 + signedByte(romBytes[pc + 1] ?? 0));

    return {
      tag: 'jr-conditional',
      dasm: `jr ${conditionNames[op0]}, ${hex(target, 6)}`,
      kind: 'branch',
      condition: conditionNames[op0],
      target,
      targetMode: modeAfterControl,
      fallthrough: wrap24(startPc + (pc - startPc) + 2),
      length: pc + 2 - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  if (op0 === 0x10) {
    const target = wrap24(startPc + (pc - startPc) + 2 + signedByte(romBytes[pc + 1] ?? 0));

    return {
      tag: 'djnz',
      dasm: `djnz ${hex(target, 6)}`,
      kind: 'branch',
      condition: 'djnz',
      target,
      targetMode: modeAfterControl,
      fallthrough: wrap24(startPc + (pc - startPc) + 2),
      length: pc + 2 - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  if (op0 === 0xc3) {
    const target = readLE(pc + 1, effectiveImmBytes);

    return {
      tag: 'jp',
      dasm: `jp ${hex(target, effectiveImmBytes * 2)}`,
      kind: 'jump',
      target,
      targetMode: modeAfterControl,
      length: pc + 1 + effectiveImmBytes - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  if ([0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea, 0xf2, 0xfa].includes(op0)) {
    const target = readLE(pc + 1, effectiveImmBytes);
    const length = pc + 1 + effectiveImmBytes - startPc;

    return {
      tag: 'jp-conditional',
      dasm: `jp ${conditionNames[op0]}, ${hex(target, effectiveImmBytes * 2)}`,
      kind: 'branch',
      condition: conditionNames[op0],
      target,
      targetMode: modeAfterControl,
      fallthrough: wrap24(startPc + length),
      length,
      nextMode: mode,
      terminates: true,
    };
  }

  if (op0 === 0xcd) {
    const target = readLE(pc + 1, effectiveImmBytes);

    return {
      tag: 'call',
      dasm: `call ${hex(target, effectiveImmBytes * 2)}`,
      kind: 'call',
      target,
      targetMode: modeAfterControl,
      fallthrough: wrap24(startPc + (pc + 1 + effectiveImmBytes - startPc)),
      length: pc + 1 + effectiveImmBytes - startPc,
      nextMode: mode,
    };
  }

  if ([0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc].includes(op0)) {
    const target = readLE(pc + 1, effectiveImmBytes);
    const length = pc + 1 + effectiveImmBytes - startPc;

    return {
      tag: 'call-conditional',
      dasm: `call ${conditionNames[op0]}, ${hex(target, effectiveImmBytes * 2)}`,
      kind: 'call',
      condition: conditionNames[op0],
      target,
      targetMode: modeAfterControl,
      fallthrough: wrap24(startPc + length),
      length,
      nextMode: mode,
    };
  }

  if ([0xc7, 0xcf, 0xd7, 0xdf, 0xe7, 0xef, 0xf7, 0xff].includes(op0)) {
    const target = op0 & 0x38;

    return {
      tag: 'rst',
      dasm: `rst ${hex(target)}`,
      kind: 'jump',
      target,
      targetMode: modeAfterControl,
      length: pc + 1 - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  if (op0 === 0xc9) {
    return {
      tag: 'ret',
      dasm: 'ret',
      kind: 'return',
      length: pc + 1 - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  if (op0 === 0xed && (romBytes[pc + 1] === 0x45 || romBytes[pc + 1] === 0x4d)) {
    return {
      tag: 'ret',
      dasm: romBytes[pc + 1] === 0x45 ? 'retn' : 'reti',
      kind: 'return',
      length: pc + 2 - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  if ([0xc0, 0xc8, 0xd0, 0xd8, 0xe0, 0xe8, 0xf0, 0xf8].includes(op0)) {
    return {
      tag: 'ret-conditional',
      dasm: `ret ${conditionNames[op0]}`,
      kind: 'return-conditional',
      condition: conditionNames[op0],
      fallthrough: wrap24(startPc + (pc + 1 - startPc)),
      length: pc + 1 - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  if (op0 === 0xe9 || (op0 === 0xdd && romBytes[pc + 1] === 0xe9) || (op0 === 0xfd && romBytes[pc + 1] === 0xe9)) {
    const indirectTarget = op0 === 0xe9 ? 'hl' : op0 === 0xdd ? 'ix' : 'iy';
    const length = op0 === 0xe9 ? pc + 1 - startPc : pc + 2 - startPc;

    return {
      tag: 'jp-indirect',
      dasm: `jp (${indirectTarget})`,
      kind: 'jump-indirect',
      indirectRegister: indirectTarget,
      length,
      nextMode: mode,
      terminates: true,
    };
  }

  if (op0 === 0x76) {
    return {
      tag: 'halt',
      dasm: 'halt',
      kind: 'halt',
      length: pc + 1 - startPc,
      nextMode: mode,
      terminates: true,
    };
  }

  return null;
}

function decodeInstruction(pc, mode) {
  const startPc = pc;
  const first = romBytes[pc];
  let prefix = null;

  if (first in prefixTable) {
    prefix = prefixTable[first];
    pc += 1;
  }

  const op0 = romBytes[pc];
  const op1 = romBytes[pc + 1];

  const indexedCb = manualIndexedCbInstruction(startPc, pc, op0, mode);

  if (indexedCb) {
    const bytes = bytesToHex(startPc, indexedCb.length);

    return {
      ...indexedCb,
      pc: startPc,
      mode,
      prefix: prefix?.suffix ?? null,
      op0,
      op1,
      bytes,
    };
  }

  const indexed = manualIndexedInstruction(startPc, pc, op0, mode);

  if (indexed) {
    const bytes = bytesToHex(startPc, indexed.length);

    return {
      ...indexed,
      pc: startPc,
      mode,
      prefix: prefix?.suffix ?? null,
      op0,
      op1,
      bytes,
    };
  }

  const manual = op0 === 0xed ? manualEdInstruction(startPc, pc, op1, prefix, mode) : null;

  if (manual) {
    const bytes = bytesToHex(startPc, manual.length);

    return {
      ...manual,
      pc: startPc,
      mode,
      prefix: prefix?.suffix ?? null,
      op0,
      op1,
      bytes,
    };
  }

  if (op0 === 0xdb) {
    const port = romBytes[pc + 1] ?? 0;
    const length = pc + 2 - startPc;

    return {
      tag: 'in-immediate',
      pc: startPc,
      mode,
      prefix: prefix?.suffix ?? null,
      op0,
      op1,
      port,
      length,
      nextMode: mode,
      dasm: `in a, (${hex(port)})`,
      bytes: bytesToHex(startPc, length),
    };
  }

  const control = controlFlowInstruction(startPc, pc, op0, prefix, mode);

  if (control) {
    const bytes = bytesToHex(startPc, control.length);

    return {
      ...control,
      pc: startPc,
      mode,
      prefix: prefix?.suffix ?? null,
      op0,
      op1,
      bytes,
    };
  }

  const baseResult = z80.disassemble(pc);
  let dasm = canonicalizeDasm(baseResult.dasm);
  let length = baseResult.nextAddr - pc;

  const effectiveImmBytes = prefix ? prefix.immBytes : mode === 'adl' ? 3 : 2;

  if (!dasm.startsWith('Error')) {
    if (absoluteImmOps.has(op0)) {
      const target = readLE(pc + 1, effectiveImmBytes);
      dasm = dasm.replace(/0x[0-9a-fA-F]+/, hex(target, effectiveImmBytes * 2));
      length = 1 + effectiveImmBytes;
    } else if ((op0 === 0xdd || op0 === 0xfd) && absoluteImmOps.has(op1)) {
      const target = readLE(pc + 2, effectiveImmBytes);
      dasm = dasm.replace(/0x[0-9a-fA-F]+/, hex(target, effectiveImmBytes * 2));
      length = 2 + effectiveImmBytes;
    } else if (op0 === 0xed && absoluteEdOps.has(op1)) {
      const target = readLE(pc + 2, effectiveImmBytes);
      dasm = dasm.replace(/0x[0-9a-fA-F]+/, hex(target, effectiveImmBytes * 2));
      length = 2 + effectiveImmBytes;
    }
  }

  if (prefix) {
    const [mnemonic, ...rest] = dasm.split(' ');
    dasm = `${mnemonic}.${prefix.suffix.toLowerCase()}${rest.length ? ` ${rest.join(' ')}` : ''}`;
  }

  return {
    tag: dasm.startsWith('Error') ? 'unsupported' : 'generic',
    pc: startPc,
    mode,
    prefix: prefix?.suffix ?? null,
    op0,
    op1,
    length: (pc - startPc) + length,
    nextMode: mode,
    dasm,
    bytes: bytesToHex(startPc, (pc - startPc) + length),
  };
}

function emitInstructionJs(instruction) {
  const { tag, dasm, condition, target, fallthrough } = instruction;

  if (tag === 'indexed-cb-bit') {
    return [`cpu.testBit(cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement}), ${instruction.bit});`];
  }

  if (tag === 'indexed-immediate-store') {
    return [`cpu.writeIndexed8('${instruction.indexRegister}', ${instruction.displacement}, ${hex(instruction.value)});`];
  }

  if (tag === 'indexed-compare') {
    return [`cpu.compare(cpu.a, cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement}));`];
  }

  if (tag === 'indexed-cb-rotate') {
    const lines = [
      '{',
      `  const value = cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement});`,
      `  const result = cpu.rotateShift8('${instruction.operation}', value);`,
      `  cpu.writeIndexed8('${instruction.indexRegister}', ${instruction.displacement}, result);`,
    ];

    if (instruction.destination) {
      lines.push(`  cpu.${instruction.destination} = result;`);
    }

    lines.push('}');

    return lines;
  }

  if (tag === 'indexed-cb-res' || tag === 'indexed-cb-set') {
    const operator = tag === 'indexed-cb-res' ? '& ~' : '| ';
    const lines = [
      '{',
      `  const value = cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement});`,
      `  const result = value ${operator}${hex(1 << instruction.bit)};`,
      `  cpu.writeIndexed8('${instruction.indexRegister}', ${instruction.displacement}, result);`,
    ];

    if (instruction.destination) {
      lines.push(`  cpu.${instruction.destination} = result;`);
    }

    lines.push('}');

    return lines;
  }

  if (tag === 'rsmix') {
    return ['cpu.madl = 0;'];
  }

  if (tag === 'stmix') {
    return ['cpu.madl = 1;'];
  }

  if (tag === 'slp') {
    return ['return cpu.sleep();'];
  }

  if (tag === 'in0') {
    return [`cpu.${instruction.reg} = cpu.ioReadPage0(${hex(instruction.port)});`];
  }

  if (tag === 'out0') {
    return [`cpu.ioWritePage0(${hex(instruction.port)}, cpu.${instruction.reg});`];
  }

  if (tag === 'in-immediate') {
    return [`cpu.a = cpu.ioReadImmediate(cpu.a, ${hex(instruction.port)});`];
  }

  if (tag === 'tst-immediate') {
    return [`cpu.test(cpu.a, ${hex(instruction.value)});`];
  }

  if (tag === 'tst-register') {
    return [`cpu.test(cpu.a, cpu.${instruction.reg});`];
  }

  if (tag === 'tst-hl') {
    return ["cpu.test(cpu.a, cpu.readIndirect8('hl'));"];
  }

  if (tag === 'tstio') {
    return [`cpu.testIo(${hex(instruction.value)});`];
  }

  if (tag === 'mlt') {
    return [`cpu.${instruction.reg} = cpu.multiplyBytes(cpu.${instruction.reg});`];
  }

  if (tag === 'otimr') {
    return ['cpu.otimr();'];
  }

  if (tag === 'load-word-from-hl') {
    return [`cpu.${instruction.register} = cpu.${getWordReadAccessor(instruction)}(cpu.hl);`];
  }

  if (tag === 'store-word-to-hl') {
    return [`cpu.${getWordWriteAccessor(instruction)}(cpu.hl, cpu.${instruction.register});`];
  }

  if (tag === 'ld-iy-from-hl') {
    return ["cpu.iy = cpu.readIndirect24('hl');"];
  }

  if (tag === 'ld-ix-from-hl') {
    return ["cpu.ix = cpu.readIndirect24('hl');"];
  }

  if (tag === 'ld-hl-from-iy') {
    return ["cpu.writeIndirect24('hl', cpu.iy);"];
  }

  if (tag === 'ld-hl-from-ix') {
    return ["cpu.writeIndirect24('hl', cpu.ix);"];
  }

  if (tag === 'lea') {
    const displacement = instruction.displacement;
    const operator = displacement >= 0 ? '+' : '-';
    const magnitude = Math.abs(displacement);

    return [`cpu.${instruction.destination} = (cpu.${instruction.base} ${operator} ${magnitude}) & cpu.addressMask;`];
  }

  if (tag === 'jp' || tag === 'jr' || tag === 'rst' || tag === 'jump' || tag === 'jp-indirect') {
    if (instruction.indirectRegister) {
      return [`return cpu.${instruction.indirectRegister};`];
    }

    return [`return ${hex(target, 6)};`];
  }

  if (tag === 'jp-conditional' || tag === 'jr-conditional' || tag === 'djnz' || tag === 'branch') {
    if (condition === 'djnz') {
      return [`if (cpu.decrementAndCheckB()) return ${hex(target, 6)};`, `return ${hex(fallthrough, 6)};`];
    }

    return [`if (cpu.checkCondition('${condition}')) return ${hex(target, 6)};`, `return ${hex(fallthrough, 6)};`];
  }

  if (tag === 'call' || tag === 'call-conditional') {
    const lines = [`cpu.call(${hex(target, 6)});`];

    if (condition) {
      lines[0] = `if (cpu.checkCondition('${condition}')) cpu.call(${hex(target, 6)});`;
    }

    return lines;
  }

  if (tag === 'return' || tag === 'ret') {
    return ['return cpu.popReturn();'];
  }

  if (tag === 'return-conditional' || tag === 'ret-conditional') {
    return [`if (cpu.checkCondition('${condition}')) return cpu.popReturn();`, `return ${hex(fallthrough, 6)};`];
  }

  if (tag === 'halt') {
    return ['return cpu.halt();'];
  }

  const mnemonic = dasm.toLowerCase();

  if (mnemonic === 'di') {
    return ['cpu.iff1 = 0;', 'cpu.iff2 = 0;'];
  }

  if (mnemonic === 'ei') {
    return ['cpu.iff1 = 1;', 'cpu.iff2 = 1;'];
  }

  if (mnemonic === 'nop') {
    return [];
  }

  if (mnemonic === 'xor a') {
    return ['cpu.a = 0;', 'cpu.updateLogicFlags(cpu.a);'];
  }

  if (mnemonic === 'or a') {
    return ['cpu.updateLogicFlags(cpu.a);'];
  }

  if (mnemonic === 'cpl') {
    return ['cpu.a = (~cpu.a) & 0xff;'];
  }

  if (mnemonic === 'rrca') {
    return ['cpu.a = cpu.rotateRightCircular(cpu.a);'];
  }

  if (mnemonic === 'rla') {
    return ['cpu.a = cpu.rotateLeftThroughCarry(cpu.a);'];
  }

  if (mnemonic === 'rra') {
    return ['cpu.a = cpu.rotateRightThroughCarry(cpu.a);'];
  }

  if (mnemonic === 'rlca') {
    return ['cpu.a = cpu.rotateLeftCircular(cpu.a);'];
  }

  if (mnemonic === 'ccf') {
    return ['cpu.complementCarryFlag();'];
  }

  if (mnemonic === 'scf') {
    return ['cpu.setCarryFlag();'];
  }

  if (mnemonic === 'daa') {
    return ['cpu.a = cpu.decimalAdjustAccumulator(cpu.a);'];
  }

  if (mnemonic === 'ld a, i') {
    return ['cpu.a = cpu.i;'];
  }

  if (mnemonic === 'ldi') {
    return ['cpu.ldi();'];
  }

  if (mnemonic === 'ldir') {
    return ['cpu.ldir();'];
  }

  if (mnemonic === 'cpir') {
    return ['cpu.cpir();'];
  }

  if (mnemonic === 'cpi') {
    return ['cpu.cpi();'];
  }

  const simpleAssign = /^ld(?:\.[a-z]+)? ([abcdehl]|ixh|ixl|iyh|iyl|bc|de|hl|sp|ix|iy), (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (simpleAssign) {
    return [`cpu.${simpleAssign[1].toLowerCase()} = ${simpleAssign[2].toLowerCase()};`];
  }

  const registerAssign = /^ld(?:\.[a-z]+)? ([abcdehl]|ixh|ixl|iyh|iyl), ([abcdehl]|ixh|ixl|iyh|iyl)$/i.exec(mnemonic);

  if (registerAssign) {
    return [`cpu.${registerAssign[1].toLowerCase()} = cpu.${registerAssign[2].toLowerCase()};`];
  }

  const loadRegisterAbsolute8 = /^ld(?:\.[a-z]+)? ([abcdehl]), \((0x[0-9a-f]+)\)$/i.exec(mnemonic);

  if (loadRegisterAbsolute8) {
    return [`cpu.${loadRegisterAbsolute8[1].toLowerCase()} = cpu.read8(${loadRegisterAbsolute8[2].toLowerCase()});`];
  }

  const loadAbsoluteWord = /^ld(?:\.[a-z]+)? (bc|de|hl|sp|ix|iy), \((0x[0-9a-f]+)\)$/i.exec(mnemonic);

  if (loadAbsoluteWord) {
    return [`cpu.${loadAbsoluteWord[1].toLowerCase()} = cpu.${getWordReadAccessor(instruction)}(${loadAbsoluteWord[2].toLowerCase()});`];
  }

  const storeAbsoluteByte = /^ld(?:\.[a-z]+)? \((0x[0-9a-f]+)\), ([abcdehl])$/i.exec(mnemonic);

  if (storeAbsoluteByte) {
    return [`cpu.write8(${storeAbsoluteByte[1].toLowerCase()}, cpu.${storeAbsoluteByte[2].toLowerCase()});`];
  }

  const storeAbsoluteWord = /^ld(?:\.[a-z]+)? \((0x[0-9a-f]+)\), (bc|de|hl|sp|ix|iy)$/i.exec(mnemonic);

  if (storeAbsoluteWord) {
    return [`cpu.${getWordWriteAccessor(instruction)}(${storeAbsoluteWord[1].toLowerCase()}, cpu.${storeAbsoluteWord[2].toLowerCase()});`];
  }

  const compareImmediate = /^cp (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (compareImmediate) {
    return [`cpu.compare(cpu.a, ${compareImmediate[1].toLowerCase()});`];
  }

  const andImmediate = /^and (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (andImmediate) {
    return [`cpu.a &= ${andImmediate[1].toLowerCase()};`, 'cpu.updateLogicFlags(cpu.a);'];
  }

  const addImmediate = /^add a, (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (addImmediate) {
    return [`cpu.a = cpu.add8(cpu.a, ${addImmediate[1].toLowerCase()});`];
  }

  const subImmediate = /^sub (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (subImmediate) {
    return [`cpu.a = cpu.subtract8(cpu.a, ${subImmediate[1].toLowerCase()});`];
  }

  const bitTest = /^bit (\d), a$/i.exec(mnemonic);

  if (bitTest) {
    return [`cpu.testBit(cpu.a, ${bitTest[1]});`];
  }

  const bitTestRegister = /^bit (\d), ([bcdehl])$/i.exec(mnemonic);

  if (bitTestRegister) {
    return [`cpu.testBit(cpu.${bitTestRegister[2].toLowerCase()}, ${bitTestRegister[1]});`];
  }

  const bitSet = /^set (\d), a$/i.exec(mnemonic);

  if (bitSet) {
    return [`cpu.a |= ${hex(1 << Number.parseInt(bitSet[1], 10))};`];
  }

  const bitReset = /^res (\d), a$/i.exec(mnemonic);

  if (bitReset) {
    return [`cpu.a &= ~${hex(1 << Number.parseInt(bitReset[1], 10))};`];
  }

  const pushWord = /^push (af|bc|de|hl|ix|iy)$/i.exec(mnemonic);

  if (pushWord) {
    return [`cpu.push(cpu.${pushWord[1].toLowerCase()});`];
  }

  const popWord = /^pop (af|bc|de|hl|ix|iy)$/i.exec(mnemonic);

  if (popWord) {
    return [`cpu.${popWord[1].toLowerCase()} = cpu.pop();`];
  }

  const incrementWord = /^inc (bc|de|hl|sp|ix|iy)$/i.exec(mnemonic);

  if (incrementWord) {
    return [`cpu.${incrementWord[1].toLowerCase()} = (cpu.${incrementWord[1].toLowerCase()} + 1) & cpu.addressMask;`];
  }

  const decrementWord = /^dec (bc|de|hl|sp|ix|iy)$/i.exec(mnemonic);

  if (decrementWord) {
    return [`cpu.${decrementWord[1].toLowerCase()} = (cpu.${decrementWord[1].toLowerCase()} - 1) & cpu.addressMask;`];
  }

  const loadAImmediate = /^ld a, (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (loadAImmediate) {
    return [`cpu.a = ${loadAImmediate[1].toLowerCase()};`];
  }

  const storeIndexedRegister = /^ld(?:\.[a-z]+)? \((ix|iy)([+-](?:0x[0-9a-f]+|\$[0-9a-f]+|\d+))\), ([abcdehl])$/i.exec(mnemonic);

  if (storeIndexedRegister) {
    return [
      `cpu.writeIndexed8('${storeIndexedRegister[1].toLowerCase()}', ${normalizeNumericLiteral(storeIndexedRegister[2])}, cpu.${storeIndexedRegister[3].toLowerCase()});`,
    ];
  }

  const storeIndexedImmediate = /^ld(?:\.[a-z]+)? \((ix|iy)([+-](?:0x[0-9a-f]+|\$[0-9a-f]+|\d+))\), (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (storeIndexedImmediate) {
    return [
      `cpu.writeIndexed8('${storeIndexedImmediate[1].toLowerCase()}', ${normalizeNumericLiteral(storeIndexedImmediate[2])}, ${storeIndexedImmediate[3].toLowerCase()});`,
    ];
  }

  const loadIndexedRegister = /^ld(?:\.[a-z]+)? ([abcdehl]), \((ix|iy)([+-](?:0x[0-9a-f]+|\$[0-9a-f]+|\d+))\)$/i.exec(mnemonic);

  if (loadIndexedRegister) {
    return [
      `cpu.${loadIndexedRegister[1].toLowerCase()} = cpu.readIndexed8('${loadIndexedRegister[2].toLowerCase()}', ${normalizeNumericLiteral(loadIndexedRegister[3])});`,
    ];
  }

  const loadRegisterIndirectHl = /^ld(?:\.[a-z]+)? ([abcdehl]), \(hl\)$/i.exec(mnemonic);

  if (loadRegisterIndirectHl) {
    return [`cpu.${loadRegisterIndirectHl[1].toLowerCase()} = cpu.readIndirect8('hl');`];
  }

  const loadAFromPair = /^ld a, \((bc|de)\)$/i.exec(mnemonic);

  if (loadAFromPair) {
    return [`cpu.a = cpu.readIndirect8('${loadAFromPair[1].toLowerCase()}');`];
  }

  const inImmediate = /^in a, \((0x[0-9a-f]+)\)$/i.exec(mnemonic);

  if (inImmediate) {
    return [`cpu.a = cpu.ioReadImmediate(cpu.a, ${inImmediate[1].toLowerCase()});`];
  }

  if (mnemonic === "ld (hl), a") {
    return ["cpu.writeIndirect8('hl', cpu.a);"];
  }

  const loadImmediateIndirectHl = /^ld \(hl\), (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (loadImmediateIndirectHl) {
    return [`cpu.writeIndirect8('hl', ${loadImmediateIndirectHl[1].toLowerCase()});`];
  }

  const storeRegisterIndirectHl = /^ld(?:\.[a-z]+)? \(hl\), ([abcdehl])$/i.exec(mnemonic);

  if (storeRegisterIndirectHl) {
    return [`cpu.writeIndirect8('hl', cpu.${storeRegisterIndirectHl[1].toLowerCase()});`];
  }

  const storeAToPair = /^ld \((bc|de)\), a$/i.exec(mnemonic);

  if (storeAToPair) {
    return [`cpu.writeIndirect8('${storeAToPair[1].toLowerCase()}', cpu.a);`];
  }

  if (mnemonic === 'exx') {
    return ['cpu.swapMainAlternate();'];
  }

  if (mnemonic === "ex af, af'") {
    return ['cpu.swapAf();'];
  }

  const exchangeStackWord = /^ex \(sp\), (hl|ix|iy)$/i.exec(mnemonic);

  if (exchangeStackWord) {
    const register = exchangeStackWord[1].toLowerCase();
    const readAccessor = getWordReadAccessor(instruction);
    const writeAccessor = getWordWriteAccessor(instruction);

    return [
      '{',
      `  const stackValue = cpu.${readAccessor}(cpu.sp);`,
      `  cpu.${writeAccessor}(cpu.sp, cpu.${register});`,
      `  cpu.${register} = stackValue;`,
      '}',
    ];
  }

  if (mnemonic === 'ex de, hl') {
    return ['{', '  const temp = cpu.de;', '  cpu.de = cpu.hl;', '  cpu.hl = temp;', '}'];
  }

  if (mnemonic === 'im 1') {
    return ['cpu.im = 1;'];
  }

  if (mnemonic === 'im 2') {
    return ['cpu.im = 2;'];
  }

  if (mnemonic === 'out (c), a') {
    return ['cpu.ioWrite(cpu.c, cpu.a);'];
  }

  if (mnemonic === 'in a, (c)') {
    return ['cpu.a = cpu.ioRead(cpu.c);'];
  }

  const outPortRegister = /^out \(c\), ([abcdehl])$/i.exec(mnemonic);

  if (outPortRegister) {
    return [`cpu.ioWrite(cpu.c, cpu.${outPortRegister[1].toLowerCase()});`];
  }

  if (mnemonic === 'reti' || mnemonic === 'retn') {
    return ['return cpu.popReturn();'];
  }

  if (mnemonic === 'im 0') {
    return ['cpu.im = 0;'];
  }

  const loadSpFromRegister = /^ld sp, (hl|ix|iy)$/i.exec(mnemonic);

  if (loadSpFromRegister) {
    return [`cpu.sp = cpu.${loadSpFromRegister[1].toLowerCase()};`];
  }

  const addWordRegisters = /^add (hl|ix|iy), (bc|de|hl|sp|ix|iy)$/i.exec(mnemonic);

  if (addWordRegisters) {
    return [`cpu.${addWordRegisters[1].toLowerCase()} = cpu.addWord(cpu.${addWordRegisters[1].toLowerCase()}, cpu.${addWordRegisters[2].toLowerCase()});`];
  }

  const sbcWordRegisters = /^sbc(?:\.[a-z]+)? (hl|ix|iy), (bc|de|hl|sp|ix|iy)$/i.exec(mnemonic);

  if (sbcWordRegisters) {
    return [
      `cpu.${sbcWordRegisters[1].toLowerCase()} = cpu.subtractWithBorrowWord(cpu.${sbcWordRegisters[1].toLowerCase()}, cpu.${sbcWordRegisters[2].toLowerCase()});`,
    ];
  }

  const incrementByte = /^inc ([abcdehl])$/i.exec(mnemonic);

  if (incrementByte) {
    return [`cpu.${incrementByte[1].toLowerCase()} = (cpu.${incrementByte[1].toLowerCase()} + 1) & 0xff;`];
  }

  const decrementByte = /^dec ([abcdehl])$/i.exec(mnemonic);

  if (decrementByte) {
    return [`cpu.${decrementByte[1].toLowerCase()} = (cpu.${decrementByte[1].toLowerCase()} - 1) & 0xff;`];
  }

  if (mnemonic === 'cp (hl)') {
    return ["cpu.compare(cpu.a, cpu.readIndirect8('hl'));"];
  }

  const compareIndexed = /^cp(?: a)?, \((ix|iy)([+-](?:0x[0-9a-f]+|\$[0-9a-f]+|\d+))\)$/i.exec(mnemonic);

  if (compareIndexed) {
    return [`cpu.compare(cpu.a, cpu.readIndexed8('${compareIndexed[1].toLowerCase()}', ${normalizeNumericLiteral(compareIndexed[2])}));`];
  }

  if (mnemonic === 'inc (hl)') {
    return ["cpu.writeIndirect8('hl', (cpu.readIndirect8('hl') + 1) & 0xff);"];
  }

  if (mnemonic === 'dec (hl)') {
    return ["cpu.writeIndirect8('hl', (cpu.readIndirect8('hl') - 1) & 0xff);"];
  }

  if (mnemonic === 'and (hl)') {
    return ["cpu.a &= cpu.readIndirect8('hl');", 'cpu.updateLogicFlags(cpu.a);'];
  }

  const andRegister = /^and ([abcdehl]|a)$/i.exec(mnemonic);

  if (andRegister) {
    return [`cpu.a &= cpu.${andRegister[1].toLowerCase()};`, 'cpu.updateLogicFlags(cpu.a);'];
  }

  if (mnemonic === 'or (hl)') {
    return ["cpu.a |= cpu.readIndirect8('hl');", 'cpu.updateLogicFlags(cpu.a);'];
  }

  const orRegister = /^or ([abcdehl]|a)$/i.exec(mnemonic);

  if (orRegister) {
    return [`cpu.a |= cpu.${orRegister[1].toLowerCase()};`, 'cpu.updateLogicFlags(cpu.a);'];
  }

  if (mnemonic === 'xor (hl)') {
    return ["cpu.a ^= cpu.readIndirect8('hl');", 'cpu.updateLogicFlags(cpu.a);'];
  }

  if (mnemonic === 'add a, (hl)') {
    return ["cpu.a = cpu.add8(cpu.a, cpu.readIndirect8('hl'));"];
  }

  const adcRegister = /^adc a, ([abcdehl]|a)$/i.exec(mnemonic);

  if (adcRegister) {
    return [`cpu.a = cpu.addWithCarry8(cpu.a, cpu.${adcRegister[1].toLowerCase()});`];
  }

  if (mnemonic === 'adc a, (hl)') {
    return ["cpu.a = cpu.addWithCarry8(cpu.a, cpu.readIndirect8('hl'));"];
  }

  const subRegister = /^sub ([abcdehl]|a)$/i.exec(mnemonic);

  if (subRegister) {
    return [`cpu.a = cpu.subtract8(cpu.a, cpu.${subRegister[1].toLowerCase()});`];
  }

  if (mnemonic === 'sub (hl)') {
    return ["cpu.a = cpu.subtract8(cpu.a, cpu.readIndirect8('hl'));"];
  }

  const compareRegister = /^cp ([abcdehl]|a)$/i.exec(mnemonic);

  if (compareRegister) {
    return [`cpu.compare(cpu.a, cpu.${compareRegister[1].toLowerCase()});`];
  }

  if (mnemonic === 'sbc a, (hl)') {
    return ["cpu.a = cpu.subtractWithBorrow8(cpu.a, cpu.readIndirect8('hl'));"];
  }

  const rrRegister = /^rr ([abcdehl])$/i.exec(mnemonic);

  if (rrRegister) {
    return [`cpu.${rrRegister[1].toLowerCase()} = cpu.rotateShift8('rr', cpu.${rrRegister[1].toLowerCase()});`];
  }

  const srlRegister = /^srl ([abcdehl])$/i.exec(mnemonic);

  if (srlRegister) {
    return [`cpu.${srlRegister[1].toLowerCase()} = cpu.rotateShift8('srl', cpu.${srlRegister[1].toLowerCase()});`];
  }

  const bitTestIndirectHl = /^bit (\d), \(hl\)$/i.exec(mnemonic);

  if (bitTestIndirectHl) {
    return [`cpu.testBit(cpu.readIndirect8('hl'), ${bitTestIndirectHl[1]});`];
  }

  const bitSetIndirectHl = /^set (\d), \(hl\)$/i.exec(mnemonic);

  if (bitSetIndirectHl) {
    return [`cpu.writeIndirect8('hl', cpu.readIndirect8('hl') | ${hex(1 << Number.parseInt(bitSetIndirectHl[1], 10))});`];
  }

  const bitResetIndirectHl = /^res (\d), \(hl\)$/i.exec(mnemonic);

  if (bitResetIndirectHl) {
    return [`cpu.writeIndirect8('hl', cpu.readIndirect8('hl') & ~${hex(1 << Number.parseInt(bitResetIndirectHl[1], 10))});`];
  }

  const addRegister = /^add a, ([abcdehl])$/i.exec(mnemonic);

  if (addRegister) {
    return [`cpu.a = cpu.add8(cpu.a, cpu.${addRegister[1].toLowerCase()});`];
  }

  const xorRegister = /^xor ([bcdehl])$/i.exec(mnemonic);

  if (xorRegister) {
    return [`cpu.a ^= cpu.${xorRegister[1].toLowerCase()};`, 'cpu.updateLogicFlags(cpu.a);'];
  }

  const xorImmediate = /^xor (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (xorImmediate) {
    return [`cpu.a ^= ${xorImmediate[1].toLowerCase()};`, 'cpu.updateLogicFlags(cpu.a);'];
  }

  const orImmediate = /^or (0x[0-9a-f]+)$/i.exec(mnemonic);

  if (orImmediate) {
    return [`cpu.a |= ${orImmediate[1].toLowerCase()};`, 'cpu.updateLogicFlags(cpu.a);'];
  }

  const sbcRegister = /^sbc a, ([abcdehl])$/i.exec(mnemonic);

  if (sbcRegister) {
    return [`cpu.a = cpu.subtractWithBorrow8(cpu.a, cpu.${sbcRegister[1].toLowerCase()});`];
  }

  const bitSetRegister = /^set (\d), ([bcdehl])$/i.exec(mnemonic);

  if (bitSetRegister) {
    return [`cpu.${bitSetRegister[2].toLowerCase()} |= ${hex(1 << Number.parseInt(bitSetRegister[1], 10))};`];
  }

  return [`cpu.unimplemented(${hex(instruction.pc, 6)}, ${JSON.stringify(dasm)});`];
}

function buildBlock(startPc, mode, options) {
  const instructions = [];
  const exits = [];
  let currentPc = startPc;
  let currentMode = mode;

  for (let index = 0; index < options.instructionsPerBlock; index += 1) {
    if (currentPc >= romBytes.length) {
      break;
    }

    const instruction = decodeInstruction(currentPc, currentMode);
    instructions.push({
      ...instruction,
      js: emitInstructionJs(instruction),
    });

    if (instruction.kind === 'call') {
      exits.push({
        type: 'call',
        target: instruction.target,
        targetMode: instruction.targetMode,
      });
    }

    if (instruction.kind === 'branch') {
      exits.push({
        type: 'branch',
        condition: instruction.condition,
        target: instruction.target,
        targetMode: instruction.targetMode,
      });
      exits.push({
        type: 'fallthrough',
        target: instruction.fallthrough,
        targetMode: currentMode,
      });
      break;
    }

    if (instruction.kind === 'jump' || instruction.kind === 'jump-indirect') {
      if (instruction.target !== undefined) {
        exits.push({
          type: 'jump',
          target: instruction.target,
          targetMode: instruction.targetMode,
        });
      } else {
        exits.push({
          type: 'jump-indirect',
          via: instruction.indirectRegister,
        });
      }
      break;
    }

    if (instruction.kind === 'return' || instruction.kind === 'return-conditional' || instruction.kind === 'halt') {
      exits.push({
        type: instruction.kind,
      });
      break;
    }

    if (instruction.tag === 'unsupported') {
      exits.push({
        type: 'unsupported',
      });
      break;
    }

    currentPc = wrap24(currentPc + instruction.length);
    currentMode = instruction.nextMode;
  }

  const sourceLines = [`function block_${formatKey(startPc, mode).replace(':', '_')}(cpu) {`];

  for (const instruction of instructions) {
    sourceLines.push(`  // ${hex(instruction.pc, 6)}  ${instruction.bytes.padEnd(15)}  ${instruction.dasm}`);

    for (const line of instruction.js) {
      sourceLines.push(`  ${line}`);
    }
  }

  const lastInstruction = instructions.at(-1);

  if (lastInstruction && !lastInstruction.terminates && lastInstruction.tag !== 'unsupported') {
    const fallthrough = wrap24(lastInstruction.pc + lastInstruction.length);
    sourceLines.push(`  return ${hex(fallthrough, 6)};`);
    exits.push({
      type: 'fallthrough',
      target: fallthrough,
      targetMode: lastInstruction.nextMode,
    });
  }

  sourceLines.push('}');

  return {
    id: formatKey(startPc, mode),
    startPc,
    mode,
    instructionCount: instructions.length,
    instructions: instructions.map((instruction) => ({
      pc: instruction.pc,
      mode: instruction.mode,
      bytes: instruction.bytes,
      dasm: instruction.dasm,
      tag: instruction.tag,
      length: instruction.length,
      target: instruction.target,
      targetMode: instruction.targetMode,
      fallthrough: instruction.fallthrough,
    })),
    exits,
    source: sourceLines.join('\n'),
  };
}

function walkBlocks() {
  const seedEntries = [];
  const knownEntryAnchors = [
    { pc: 0x000658, mode: 'adl' },
    { pc: 0x001afa, mode: 'adl' },
    { pc: 0x020110, mode: 'adl' },
  ];

  for (let offset = 0; offset <= 0x38; offset += 0x08) {
    seedEntries.push({ pc: offset, mode: offset === 0 ? 'z80' : 'adl' });
  }

  seedEntries.push(...knownEntryAnchors);

  const queue = [...seedEntries];
  const seen = new Set();
  const blocks = {};
  const byteCoverage = new Set();

  const options = {
    instructionsPerBlock: 64,
    blockLimit: 2048,
  };

  while (queue.length > 0 && Object.keys(blocks).length < options.blockLimit) {
    const current = queue.shift();
    const key = formatKey(current.pc, current.mode);

    if (seen.has(key) || current.pc < 0 || current.pc >= romBytes.length) {
      continue;
    }

    seen.add(key);

    const block = buildBlock(current.pc, current.mode, options);
    blocks[key] = block;

    for (const instruction of block.instructions) {
      for (let offset = 0; offset < instruction.length; offset += 1) {
        byteCoverage.add(instruction.pc + offset);
      }
    }

    for (const exit of block.exits) {
      if (exit.target === undefined) {
        continue;
      }

      queue.push({
        pc: exit.target,
        mode: exit.targetMode ?? current.mode,
      });
    }
  }

  return {
    seedEntries,
    blocks,
    coveredBytes: byteCoverage.size,
  };
}

const walk = walkBlocks();
const blockEntries = Object.entries(walk.blocks);

const moduleMeta = {
  romPath: path.relative(repoRoot, romPath),
  romSize: romBytes.length,
  generatedAt: new Date().toISOString(),
  generator: path.relative(repoRoot, new URL(import.meta.url).pathname),
  blockCount: blockEntries.length,
  coveredBytes: walk.coveredBytes,
  coveragePercent: Number(((walk.coveredBytes / romBytes.length) * 100).toFixed(4)),
  seedCount: walk.seedEntries.length,
  notes: [
    'This is a byte-lifted JavaScript representation of the TI-84 Plus CE ROM reset/startup control flow.',
    'The module embeds the full ROM image and pre-lifts reachable basic blocks from the vector table.',
    'Instructions outside the supported lift set are retained as block comments and emitted as cpu.unimplemented(...) stubs.',
  ],
};

const moduleSource = [
  '// Generated by scripts/transpile-ti84-rom.mjs',
  '// Source: TI-84_Plus_CE/ROM.rom',
  '',
  `export const TRANSPILATION_META = ${JSON.stringify(moduleMeta, null, 2)};`,
  '',
  `export const ROM_BASE64 = ${JSON.stringify(romBase64)};`,
  '',
  `export const ENTRY_POINTS = ${JSON.stringify(walk.seedEntries, null, 2)};`,
  '',
  `export const PRELIFTED_BLOCKS = ${JSON.stringify(walk.blocks, null, 2)};`,
  '',
  'export function decodeEmbeddedRom() {',
  "  const base64 = typeof atob === 'function'",
  "    ? atob(ROM_BASE64)",
  "    : Buffer.from(ROM_BASE64, 'base64').toString('binary');",
  '  const bytes = new Uint8Array(base64.length);',
  '  for (let index = 0; index < base64.length; index += 1) {',
  '    bytes[index] = base64.charCodeAt(index) & 0xff;',
  '  }',
  '  return bytes;',
  '}',
  '',
].join('\n');

fs.writeFileSync(outPath, moduleSource);
fs.writeFileSync(reportPath, JSON.stringify(moduleMeta, null, 2));

console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
console.log(`Wrote ${path.relative(repoRoot, reportPath)}`);
console.log(`Blocks: ${moduleMeta.blockCount}`);
console.log(`Covered bytes: ${moduleMeta.coveredBytes} (${moduleMeta.coveragePercent}%)`);

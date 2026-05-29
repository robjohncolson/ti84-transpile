#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const CALL_CONTEXT_START = 0x001720;
const CALL_CONTEXT_END = 0x001730;
const TARGET_START = 0x0067F8;
const MAX_INSTRUCTIONS = 100;

const CALLER_OBJECT_PTR = 0x020000;
const DESCRIPTOR_SELECTOR_BYTE0 = 0x80;
const DESCRIPTOR_SELECTOR_HIGH_NIBBLE = 0xC0;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(Number(value) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  const end = Math.min(buffer.length, start + length);
  return Array.from(
    buffer.subarray(start, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function signedHex(value) {
  const n = Number(value) | 0;
  const abs = Math.abs(n);
  return `${n >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function indexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${signedHex(displacement)})`;
}

function fallbackFields(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'tag',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'decodeError',
  ]);

  return Object.entries(inst)
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return `db ${hexByte(inst.value)}`;
    case 'nop':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'halt':
    case 'slp':
    case 'di':
    case 'ei':
    case 'scf':
    case 'ccf':
    case 'cpl':
    case 'daa':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'exx':
    case 'ex-de-hl':
    case 'ex-af':
      return inst.tag;
    case 'push':
    case 'pop':
      return `${inst.tag} ${String(inst.pair).toUpperCase()}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
    case 'call-cond':
      return `call ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
    case 'jp-cond':
      return `jp ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
    case 'jr-cond':
      return `jr ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret-conditional':
    case 'ret-cond':
      return `ret ${String(inst.condition).toUpperCase()}`;
    case 'ld-pair-imm':
      return `ld ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-indexed':
      return `ld ${String(inst.pair).toUpperCase()}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${indexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `ld ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `ld ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `ld ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `ld (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'inc-pair':
    case 'dec-pair':
      return `${inst.tag.replace('-', ' ')} ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
    case 'dec-reg':
      return `${inst.tag.replace('-', ' ')} ${String(inst.reg).toUpperCase()}`;
    case 'add-pair':
      return `add ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `sbc HL, ${String(inst.src).toUpperCase()}`;
    case 'in-imm':
      return `in A, (${hexByte(inst.port)})`;
    case 'in0':
      return `in0 ${String(inst.reg).toUpperCase()}, (${hexByte(inst.port)})`;
    case 'in-reg':
      return `in ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-imm':
      return `out (${hexByte(inst.port)}), A`;
    case 'out0':
      return `out0 (${hexByte(inst.port)}), ${String(inst.reg).toUpperCase()}`;
    case 'out-reg':
      return `out (C), ${String(inst.reg).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toLowerCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${String(inst.op).toLowerCase()} ${String(inst.src).toUpperCase()}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${indexed(inst.indexRegister, inst.displacement)}`;
    default: {
      const extra = fallbackFields(inst);
      return extra ? `${inst.tag} ${extra}` : String(inst?.tag ?? 'unknown');
    }
  }
}

function safeDecode(romBytes, pc) {
  try {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned an invalid instruction length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      value: romBytes[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function disassembleRange(romBytes, start, endExclusive) {
  const rows = [];
  let pc = start;
  let safety = 0;

  while (pc < endExclusive && safety < MAX_INSTRUCTIONS) {
    const inst = safeDecode(romBytes, pc);
    rows.push({
      pc,
      bytes: bytesToHex(romBytes, pc, inst.length),
      text: renderInstruction(inst),
      tag: inst.tag,
      inst,
    });
    pc += Math.max(inst.length, 1);
    safety++;
  }

  return rows;
}

function disassembleUntilRet(romBytes, start, maxInstructions) {
  const rows = [];
  let pc = start;

  for (let count = 0; count < maxInstructions; count++) {
    const inst = safeDecode(romBytes, pc);
    rows.push({
      pc,
      bytes: bytesToHex(romBytes, pc, inst.length),
      text: renderInstruction(inst),
      tag: inst.tag,
      inst,
    });
    pc += Math.max(inst.length, 1);
    if (inst.tag === 'ret') {
      break;
    }
  }

  return rows;
}

function printRows(title, rows) {
  console.log(`=== ${title} ===`);
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}`);
  }
  console.log('');
}

function advanceWith1c4f(romBytes, pointer) {
  const controlAddr = pointer + 1;
  const controlByte = romBytes[controlAddr];
  if (controlByte === undefined) {
    throw new RangeError(`Out-of-range control byte for pointer ${hex(pointer)}`);
  }

  const lowNibble = controlByte & 0x0F;

  switch (lowNibble) {
    case 0x0D:
      return {
        pointer,
        controlAddr,
        controlByte,
        payloadAddr: controlAddr + 2,
        note: '0x0D form: one payload byte',
      };
    case 0x0E:
      return {
        pointer,
        controlAddr,
        controlByte,
        payloadAddr: controlAddr + 3,
        note: '0x0E form: two payload bytes',
      };
    case 0x0F: {
      const guard = romBytes[controlAddr + 1];
      if (guard !== 0x00) {
        return {
          pointer,
          controlAddr,
          controlByte,
          payloadAddr: null,
          note: `0x0F form with non-zero guard byte ${hexByte(guard)}; 0x001CA6 would set carry here`,
        };
      }
      return {
        pointer,
        controlAddr,
        controlByte,
        payloadAddr: controlAddr + 5,
        note: '0x0F form: zero guard, subtype byte, then 16-bit payload',
      };
    }
    default:
      return {
        pointer,
        controlAddr,
        controlByte,
        payloadAddr: controlAddr + 1,
        note: 'default form: payload begins immediately after the control byte',
      };
  }
}

function findSelectorEntry(romBytes, start, byte0, highNibble) {
  for (let addr = start; addr < romBytes.length - 1; addr++) {
    if (romBytes[addr] === 0xFF) {
      return null;
    }
    if (romBytes[addr] === byte0 && (romBytes[addr + 1] & 0xF0) === highNibble) {
      return addr;
    }
  }
  return null;
}

function resolveTimerCheckDescriptor(romBytes) {
  const list = advanceWith1c4f(romBytes, CALLER_OBJECT_PTR);
  if (list.payloadAddr == null) {
    return {
      objectPtr: CALLER_OBJECT_PTR,
      list,
      matchAddr: null,
      payload: null,
    };
  }

  const matchAddr = findSelectorEntry(
    romBytes,
    list.payloadAddr,
    DESCRIPTOR_SELECTOR_BYTE0,
    DESCRIPTOR_SELECTOR_HIGH_NIBBLE,
  );

  if (matchAddr == null) {
    return {
      objectPtr: CALLER_OBJECT_PTR,
      list,
      matchAddr: null,
      payload: null,
    };
  }

  const payload = advanceWith1c4f(romBytes, matchAddr);
  const payloadAddr = payload.payloadAddr;

  return {
    objectPtr: CALLER_OBJECT_PTR,
    list,
    matchAddr,
    matchBytes: bytesToHex(romBytes, matchAddr, 4),
    payload,
    mask: payloadAddr == null ? null : romBytes[payloadAddr],
    expected: payloadAddr == null ? null : romBytes[payloadAddr + 1],
  };
}

function printResolvedDescriptor(info) {
  console.log('=== RESOLVED DESCRIPTOR PAYLOAD ===');
  console.log(`Caller object pointer: ${hex(info.objectPtr)}`);
  console.log(
    `First 0x001C4F-style advance: control ${hexByte(info.list.controlByte)} at ${hex(info.list.controlAddr)} -> payload/list start ${info.list.payloadAddr == null ? 'n/a' : hex(info.list.payloadAddr)} (${info.list.note})`,
  );

  if (info.matchAddr == null) {
    console.log(`No ${hexByte(DESCRIPTOR_SELECTOR_BYTE0)} / ${(DESCRIPTOR_SELECTOR_HIGH_NIBBLE >>> 4).toString(16).toUpperCase()}x selector match found.\n`);
    return;
  }

  console.log(
    `0x001C33-style selector match for DE=${hex(0x0080C0)}: entry ${hex(info.matchAddr)} = ${info.matchBytes}`,
  );

  if (info.payload.payloadAddr == null) {
    console.log(`Second 0x001C4F-style advance could not resolve payload: ${info.payload.note}\n`);
    return;
  }

  console.log(
    `Second 0x001C4F-style advance: control ${hexByte(info.payload.controlByte)} at ${hex(info.payload.controlAddr)} -> payload ${hex(info.payload.payloadAddr)} (${info.payload.note})`,
  );
  console.log(
    `Mask byte at ${hex(info.payload.payloadAddr)} = ${hexByte(info.mask)}`,
  );
  console.log(
    `Expected byte at ${hex(info.payload.payloadAddr + 1)} = ${hexByte(info.expected)}`,
  );
  console.log('');
}

function printHighlights(functionRows) {
  console.log('=== HIGHLIGHTS ===');
  for (const row of functionRows) {
    const { inst } = row;
    if (inst.tag === 'in-imm' || inst.tag === 'in0') {
      console.log(`${hex(row.pc)}  read port ${hexByte(inst.port)} -> ${row.text}`);
    }
    if (inst.tag === 'out-imm' || inst.tag === 'out0' || inst.tag === 'out-reg') {
      console.log(`${hex(row.pc)}  write to port -> ${row.text}`);
    }
    if (inst.tag === 'alu-imm' && inst.op === 'and') {
      console.log(`${hex(row.pc)}  immediate mask -> ${row.text}`);
    }
    if (inst.tag === 'alu-imm' && inst.op === 'cp') {
      console.log(`${hex(row.pc)}  immediate compare -> ${row.text}`);
    }
    if (inst.tag === 'ld-reg-mem' && inst.dest === 'a') {
      console.log(`${hex(row.pc)}  RAM read into A -> ${row.text}`);
    }
  }
  console.log('No immediate AND/CP or OUT instructions appear inside 0x0067F8 itself.');
  console.log('The mask/expected bytes are data-driven through the descriptor matched by 0x001C33.\n');
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const contextRows = disassembleRange(romBytes, CALL_CONTEXT_START, CALL_CONTEXT_END);
const functionRows = disassembleUntilRet(romBytes, TARGET_START, MAX_INSTRUCTIONS);
const descriptorInfo = resolveTimerCheckDescriptor(romBytes);

console.log('Phase 458: static decode of 0x0067F8 timer check function');
console.log(`ROM: ${ROM_PATH}`);
console.log('');

printRows('CALL CONTEXT 0x001720-0x001730', contextRows);
printRows(`FUNCTION 0x${TARGET_START.toString(16).toUpperCase()} until RET`, functionRows);
printResolvedDescriptor(descriptorInfo);
printHighlights(functionRows);

if (descriptorInfo.mask != null && descriptorInfo.expected != null) {
  console.log('=== SUMMARY ===');
  console.log(`Resolved check: IN0 A,(0x03); AND ${hexByte(descriptorInfo.mask)}; CP ${hexByte(descriptorInfo.expected)}`);
  console.log(`Pass condition: (port 0x03 & ${hexByte(descriptorInfo.mask)}) == ${hexByte(descriptorInfo.expected)}`);
  console.log('Return convention: HL=1 on pass, HL=0 on fail; caller immediately does DEC L / RET.');
  console.log('');
}

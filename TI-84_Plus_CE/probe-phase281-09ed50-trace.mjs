#!/usr/bin/env node

/**
 * Phase 281: trace 0x09ED50 - display/menu setup helper
 *
 * This probe performs:
 *   1. Static disassembly of 0x09ED50 until RET/unconditional JP.
 *   2. Two dynamic trace experiments at 0x09ED50 with the requested stack args.
 *   3. Caller scan for direct CALL/JP sites that target 0x09ED50.
 *   4. Function boundary / size reporting.
 *
 * Notes:
 *   - The first-call allocator return value is not known from the task prompt.
 *     By default the first trace uses 0x000000 for that stack argument, and it
 *     can be overridden with PHASE281_ALLOC_HL=0x123456 when running the probe.
 *   - The dynamic traces start directly at 0x09ED50 with the requested stack
 *     layout and do not perform a full OS boot first.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const rom = fs.readFileSync(ROM_PATH);

let transpiledSource;
if (fs.existsSync(TRANSPILED_JS_PATH)) {
  transpiledSource = fs.readFileSync(TRANSPILED_JS_PATH, 'utf-8');
} else {
  transpiledSource = gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)).toString('utf-8');
}

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TARGET = 0x09ED50;
const RETURN_SENTINEL = 0xFEFEFE;
const TRACE_STEPS = 500;
const TRACE_SP = 0xD1A870;
const TRACE_IX = 0xD1A860;
const TRACE_IY = 0xD00080;

const KNOWN_TARGETS = new Map([
  [0x0540D0, 'helper called with three pushed args'],
  [0x054DD4, 'helper fed by original arg0'],
  [0x0552F2, 'helper called with zero'],
  [0x055316, 'helper called with arg2/flag'],
  [0x09ED50, 'target function'],
  [0x09EDC3, 'shared UI initializer'],
  [0x09EE86, 'allocator-like wrapper used by first call site'],
]);

const DEFAULT_FIRST_CALL_ARG0 = parseMaybeHex(process.env.PHASE281_ALLOC_HL, 0x000000);

function parseMaybeHex(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed & 0xFFFFFF;
  const parsedInt = Number.parseInt(String(value), 0);
  return Number.isFinite(parsedInt) ? (parsedInt & 0xFFFFFF) : fallback;
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function formatDisp(value) {
  const signed = value > 0x7F ? value - 0x100 : value;
  return signed >= 0 ? `+${signed}` : `${signed}`;
}

function read24LE(bytes, offset) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function write24Mem(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24Mem(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    mem[base] |
    (mem[(base + 1) & MEM_MASK] << 8) |
    (mem[(base + 2) & MEM_MASK] << 16)
  ) >>> 0;
}

function byteString(bytes, start, len) {
  const out = [];
  for (let i = 0; i < len; i += 1) {
    out.push((bytes[start + i] ?? 0).toString(16).padStart(2, '0'));
  }
  return out.join(' ');
}

function decodeCbOp(op, operand) {
  const group = op >> 6;
  if (group === 0) {
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return `${ops[(op >> 3) & 7]} ${operand}`;
  }
  if (group === 1) return `BIT ${(op >> 3) & 7},${operand}`;
  if (group === 2) return `RES ${(op >> 3) & 7},${operand}`;
  return `SET ${(op >> 3) & 7},${operand}`;
}

function decodeIndexedPrefix(prefixName, bytes, pc) {
  const op = bytes[pc + 1];
  const prefix = prefixName.toUpperCase();

  if (op === 0x21) return { text: `LD ${prefix},${hex(read24LE(bytes, pc + 2))}`, length: 5 };
  if (op === 0xE5) return { text: `PUSH ${prefix}`, length: 2 };
  if (op === 0xE1) return { text: `POP ${prefix}`, length: 2 };
  if (op === 0xE9) return { text: `JP (${prefix})`, length: 2, isUncondJp: true };
  if (op === 0xF9) return { text: `LD SP,${prefix}`, length: 2 };
  if (op === 0x23) return { text: `INC ${prefix}`, length: 2 };
  if (op === 0x2B) return { text: `DEC ${prefix}`, length: 2 };
  if (op === 0x09) return { text: `ADD ${prefix},BC`, length: 2 };
  if (op === 0x19) return { text: `ADD ${prefix},DE`, length: 2 };
  if (op === 0x29) return { text: `ADD ${prefix},${prefix}`, length: 2 };
  if (op === 0x39) return { text: `ADD ${prefix},SP`, length: 2 };
  if (op === 0x7E) return { text: `LD A,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x77) return { text: `LD (${prefix}${formatDisp(bytes[pc + 2])}),A`, length: 3 };
  if (op === 0x36) {
    return {
      text: `LD (${prefix}${formatDisp(bytes[pc + 2])}),${hexByte(bytes[pc + 3])}`,
      length: 4,
    };
  }
  if (op === 0x46) return { text: `LD B,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x4E) return { text: `LD C,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x56) return { text: `LD D,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x5E) return { text: `LD E,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x66) return { text: `LD H,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x6E) return { text: `LD L,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0xBE) return { text: `CP (${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x34) return { text: `INC (${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x35) return { text: `DEC (${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x86) return { text: `ADD A,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x96) return { text: `SUB (${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0xA6) return { text: `AND (${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0xAE) return { text: `XOR (${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0xB6) return { text: `OR (${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };

  if (op === 0x07) return { text: `LD BC,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x0F) return { text: `LD (${prefix}${formatDisp(bytes[pc + 2])}),BC`, length: 3 };
  if (op === 0x27) return { text: `LD HL,(${prefix}${formatDisp(bytes[pc + 2])})`, length: 3 };
  if (op === 0x2F) return { text: `LD (${prefix}${formatDisp(bytes[pc + 2])}),HL`, length: 3 };

  if (op === 0xCB) {
    const disp = bytes[pc + 2];
    const cbOp = bytes[pc + 3];
    return {
      text: `${decodeCbOp(cbOp, `(${prefix}${formatDisp(disp)})`)}`,
      length: 4,
    };
  }

  return { text: `DB ${prefixName.toUpperCase()} ${hexByte(op)}`, length: 2 };
}

function decodeEdPrefix(bytes, pc) {
  const op = bytes[pc + 1];
  if (op === 0xB0) return { text: 'LDIR', length: 2 };
  if (op === 0xB8) return { text: 'LDDR', length: 2 };
  if (op === 0xA0) return { text: 'LDI', length: 2 };
  if (op === 0xA8) return { text: 'LDD', length: 2 };
  if (op === 0xB1) return { text: 'CPIR', length: 2 };
  if (op === 0xB9) return { text: 'CPDR', length: 2 };
  if (op === 0x42) return { text: 'SBC HL,BC', length: 2 };
  if (op === 0x52) return { text: 'SBC HL,DE', length: 2 };
  if (op === 0x62) return { text: 'SBC HL,HL', length: 2 };
  if (op === 0x72) return { text: 'SBC HL,SP', length: 2 };
  if (op === 0x4A) return { text: 'ADC HL,BC', length: 2 };
  if (op === 0x5A) return { text: 'ADC HL,DE', length: 2 };
  if (op === 0x6A) return { text: 'ADC HL,HL', length: 2 };
  if (op === 0x7A) return { text: 'ADC HL,SP', length: 2 };
  if (op === 0x43) return { text: `LD (${hex(read24LE(bytes, pc + 2))}),BC`, length: 5 };
  if (op === 0x53) return { text: `LD (${hex(read24LE(bytes, pc + 2))}),DE`, length: 5 };
  if (op === 0x63) return { text: `LD (${hex(read24LE(bytes, pc + 2))}),HL`, length: 5 };
  if (op === 0x73) return { text: `LD (${hex(read24LE(bytes, pc + 2))}),SP`, length: 5 };
  if (op === 0x4B) return { text: `LD BC,(${hex(read24LE(bytes, pc + 2))})`, length: 5 };
  if (op === 0x5B) return { text: `LD DE,(${hex(read24LE(bytes, pc + 2))})`, length: 5 };
  if (op === 0x6B) return { text: `LD HL,(${hex(read24LE(bytes, pc + 2))})`, length: 5 };
  if (op === 0x7B) return { text: `LD SP,(${hex(read24LE(bytes, pc + 2))})`, length: 5 };
  if (op === 0x44) return { text: 'NEG', length: 2 };
  if (op === 0x45) return { text: 'RETN', length: 2 };
  if (op === 0x4D) return { text: 'RETI', length: 2 };
  if (op === 0x46) return { text: 'IM 0', length: 2 };
  if (op === 0x56) return { text: 'IM 1', length: 2 };
  if (op === 0x5E) return { text: 'IM 2', length: 2 };
  if (op === 0x47) return { text: 'LD I,A', length: 2 };
  if (op === 0x57) return { text: 'LD A,I', length: 2 };
  if (op === 0x4F) return { text: 'LD R,A', length: 2 };
  if (op === 0x5F) return { text: 'LD A,R', length: 2 };
  return { text: `ED ${hexByte(op)}`, length: 2 };
}

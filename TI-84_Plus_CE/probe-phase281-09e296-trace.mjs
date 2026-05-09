#!/usr/bin/env node

/**
 * Phase 281: Trace 0x09E296 - STAT CALC post-init function
 *
 * Outputs:
 *   1. Manual static disassembly from ROM bytes
 *   2. Dynamic lifted-block trace from 0x09E296
 *   3. RAM write log (0xD00000+ only)
 *   4. Direct CALL/JP caller scan for 0x09E296
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

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TARGET = 0x09E296;
const MAX_STATIC_BYTES = 0x100;
const MAX_DYNAMIC_STEPS = 500;
const START_SP = 0xD1A87E;
const START_IY = 0xD00080;
const RETURN_SENTINEL = 0x7FFFFE;

const rom = fs.readFileSync(ROM_PATH);

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const COND = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const KNOWN_ADDRS = new Map([
  [0x09E0A1, 'STAT CALC path'],
  [0x09EDC3, 'shared STAT UI init'],
  [0x09E296, 'STAT CALC post-init target'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesHex(values) {
  return Array.from(values, (value) => hex(value, 2).slice(2)).join(' ');
}

function labelFor(addr) {
  const label = KNOWN_ADDRS.get(addr);
  return label ? ` [${label}]` : '';
}

function signed8(value) {
  return value > 0x7F ? value - 0x100 : value;
}

function formatDisp(raw) {
  const value = signed8(raw & 0xFF);
  if (value === 0) return '+0x00';
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function read24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function write24Mem(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function relativeTarget(pc, rawOffset) {
  return (pc + 2 + signed8(rawOffset)) & 0xFFFFFF;
}

function decodeCbOp(opcode, operand) {
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 7;
  if (group === 0) {
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return `${ops[bit]} ${operand}`;
  }
  if (group === 1) return `BIT ${bit},${operand}`;
  if (group === 2) return `RES ${bit},${operand}`;
  return `SET ${bit},${operand}`;
}

function decodeEdInstruction(pc) {
  const opcode = rom[pc + 1];
  const pair = ['BC', 'DE', 'HL', 'SP'][(opcode >> 4) & 0x03];
  let text = '';
  let length = 2;

  if (opcode === 0xA0) text = 'LDI';
  else if (opcode === 0xA8) text = 'LDD';
  else if (opcode === 0xB0) text = 'LDIR';
  else if (opcode === 0xB8) text = 'LDDR';
  else if (opcode === 0xB1) text = 'CPIR';
  else if (opcode === 0xB9) text = 'CPDR';
  else if (opcode === 0x44) text = 'NEG';
  else if (opcode === 0x45) text = 'RETN';
  else if (opcode === 0x4D) text = 'RETI';
  else if (opcode === 0x46) text = 'IM 0';
  else if (opcode === 0x56) text = 'IM 1';
  else if (opcode === 0x5E) text = 'IM 2';
  else if (opcode === 0x47) text = 'LD I,A';
  else if (opcode === 0x57) text = 'LD A,I';
  else if (opcode === 0x4F) text = 'LD R,A';
  else if (opcode === 0x5F) text = 'LD A,R';
  else if ((opcode & 0xCF) === 0x43) {
    text = `LD (${hex(read24LE(pc + 2))}),${pair}`;
    length = 5;
  } else if ((opcode & 0xCF) === 0x4B) {
    text = `LD ${pair},(${hex(read24LE(pc + 2))})`;
    length = 5;
  } else if ((opcode & 0xCF) === 0x42) {
    text = `SBC HL,${pair}`;
  } else if ((opcode & 0xCF) === 0x4A) {
    text = `ADC HL,${pair}`;
  } else {
    text = `ED ${hex(opcode, 2)}`;
  }

  return { text, length };
}

function decodeIndexedInstruction(prefix, pc) {
  const reg = prefix === 0xDD ? 'IX' : 'IY';
  const opcode = rom[pc + 1];
  let text = '';
  let length = 2;
  let stop = false;

  if (opcode === 0x21) {
    text = `LD ${reg},${hex(read24LE(pc + 2))}`;
    length = 5;
  } else if (opcode === 0xE5) {
    text = `PUSH ${reg}`;
  } else if (opcode === 0xE1) {
    text = `POP ${reg}`;
  } else if (opcode === 0xE9) {
    text = `JP (${reg})`;
    stop = true;
  } else if ([0x09, 0x19, 0x29, 0x39].includes(opcode)) {
    const pair = ['BC', 'DE', reg, 'SP'][(opcode >> 4) & 0x03];
    text = `ADD ${reg},${pair}`;
  } else if (opcode === 0x23) {
    text = `INC ${reg}`;
  } else if (opcode === 0x2B) {
    text = `DEC ${reg}`;
  } else if ([0x34, 0x35, 0x36, 0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7E, 0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE].includes(opcode)) {
    const disp = rom[pc + 2];
    const operand = `(${reg}${formatDisp(disp)})`;
    length = 3;
    if (opcode === 0x34) text = `INC ${operand}`;
    else if (opcode === 0x35) text = `DEC ${operand}`;
    else if (opcode === 0x36) {
      text = `LD ${operand},${hex(rom[pc + 3], 2)}`;
      length = 4;
    } else if (opcode === 0x7E) text = `LD A,${operand}`;
    else if (opcode === 0x46) text = `LD B,${operand}`;
    else if (opcode === 0x4E) text = `LD C,${operand}`;
    else if (opcode === 0x56) text = `LD D,${operand}`;
    else if (opcode === 0x5E) text = `LD E,${operand}`;
    else if (opcode === 0x66) text = `LD H,${operand}`;
    else if (opcode === 0x6E) text = `LD L,${operand}`;
    else if (opcode === 0x70) text = `LD ${operand},B`;
    else if (opcode === 0x71) text = `LD ${operand},C`;
    else if (opcode === 0x72) text = `LD ${operand},D`;
    else if (opcode === 0x73) text = `LD ${operand},E`;
    else if (opcode === 0x74) text = `LD ${operand},H`;
    else if (opcode === 0x75) text = `LD ${operand},L`;
    else if (opcode === 0x77) text = `LD ${operand},A`;
    else if (opcode === 0x86) text = `ADD A,${operand}`;
    else if (opcode === 0x8E) text = `ADC A,${operand}`;
    else if (opcode === 0x96) text = `SUB ${operand}`;
    else if (opcode === 0x9E) text = `SBC A,${operand}`;
    else if (opcode === 0xA6) text = `AND ${operand}`;
    else if (opcode === 0xAE) text = `XOR ${operand}`;
    else if (opcode === 0xB6) text = `OR ${operand}`;
    else if (opcode === 0xBE) text = `CP ${operand}`;
  } else if (opcode === 0xCB) {
    const disp = rom[pc + 2];
    const cbOp = rom[pc + 3];
    text = decodeCbOp(cbOp, `(${reg}${formatDisp(disp)})`);
    length = 4;
  } else {
    text = `${reg} ${hex(opcode, 2)}`;
  }

  return { text, length, stop };
}

function decodeInstruction(pc) {
  const opcode = rom[pc];
  let text = '';
  let length = 1;
  let stop = false;
  let kind = 'other';

  if (opcode === 0x00) {
    text = 'NOP';
  } else if (opcode === 0x08) {
    text = "EX AF,AF'";
  } else if (opcode === 0x10) {
    text = `DJNZ ${hex(relativeTarget(pc, rom[pc + 1]))} (${signed8(rom[pc + 1])})`;
    length = 2;
    kind = 'jump';
  } else if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(opcode)) {
    const cond = { 0x18: '', 0x20: 'NZ,', 0x28: 'Z,', 0x30: 'NC,', 0x38: 'C,' }[opcode];
    text = `JR ${cond}${hex(relativeTarget(pc, rom[pc + 1]))} (${signed8(rom[pc + 1])})`;
    length = 2;
    kind = 'jump';
  } else if ([0x01, 0x11, 0x21, 0x31].includes(opcode)) {
    const pair = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' }[opcode];
    text = `LD ${pair},${hex(read24LE(pc + 1))}`;
    length = 4;
  } else if ([0x03, 0x13, 0x23, 0x33].includes(opcode)) {
    const pair = { 0x03: 'BC', 0x13: 'DE', 0x23: 'HL', 0x33: 'SP' }[opcode];
    text = `INC ${pair}`;
  } else if ([0x0B, 0x1B, 0x2B, 0x3B].includes(opcode)) {
    const pair = { 0x0B: 'BC', 0x1B: 'DE', 0x2B: 'HL', 0x3B: 'SP' }[opcode];
    text = `DEC ${pair}`;
  } else if ([0x09, 0x19, 0x29, 0x39].includes(opcode)) {
    const pair = { 0x09: 'BC', 0x19: 'DE', 0x29: 'HL', 0x39: 'SP' }[opcode];
    text = `ADD HL,${pair}`;
  } else if ((opcode & 0xC7) === 0x04) {
    text = `INC ${REG8[(opcode >> 3) & 0x07]}`;
  } else if ((opcode & 0xC7) === 0x05) {
    text = `DEC ${REG8[(opcode >> 3) & 0x07]}`;
  } else if ((opcode & 0xC7) === 0x06) {
    const reg = REG8[(opcode >> 3) & 0x07];
    if (opcode === 0x76) {
      text = 'HALT';
      kind = 'halt';
    } else {
      text = `LD ${reg},${hex(rom[pc + 1], 2)}`;
      length = 2;
    }
  } else if (opcode >= 0x40 && opcode <= 0x7F && opcode !== 0x76) {
    text = `LD ${REG8[(opcode >> 3) & 0x07]},${REG8[opcode & 0x07]}`;
  } else if (opcode >= 0x80 && opcode <= 0xBF) {
    const group = opcode >> 3;
    const operand = REG8[opcode & 0x07];
    const opText = {
      0x10: 'ADD A',
      0x11: 'ADC A',
      0x12: 'SUB',
      0x13: 'SBC A',
      0x14: 'AND',
      0x15: 'XOR',
      0x16: 'OR',
      0x17: 'CP',
    }[group];
    text = opText === 'SUB' || opText === 'AND' || opText === 'XOR' || opText === 'OR' || opText === 'CP'
      ? `${opText} ${operand}`
      : `${opText},${operand}`;
  } else if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(opcode)) {
    const opText = {
      0xC6: 'ADD A',
      0xCE: 'ADC A',
      0xD6: 'SUB',
      0xDE: 'SBC A',
      0xE6: 'AND',
      0xEE: 'XOR',
      0xF6: 'OR',
      0xFE: 'CP',
    }[opcode];
    text = opText === 'SUB' || opText === 'AND' || opText === 'XOR' || opText === 'OR' || opText === 'CP'
      ? `${opText} ${hex(rom[pc + 1], 2)}`
      : `${opText},${hex(rom[pc + 1], 2)}`;
    length = 2;
  } else if ([0x02, 0x12, 0x0A, 0x1A].includes(opcode)) {
    text = { 0x02: 'LD (BC),A', 0x12: 'LD (DE),A', 0x0A: 'LD A,(BC)', 0x1A: 'LD A,(DE)' }[opcode];
  } else if ([0x22, 0x2A, 0x32, 0x3A].includes(opcode)) {
    const addr = hex(read24LE(pc + 1));
    text = { 0x22: `LD (${addr}),HL`, 0x2A: `LD HL,(${addr})`, 0x32: `LD (${addr}),A`, 0x3A: `LD A,(${addr})` }[opcode];
    length = 4;
  } else if ([0xC1, 0xD1, 0xE1, 0xF1].includes(opcode)) {
    const pair = { 0xC1: 'BC', 0xD1: 'DE', 0xE1: 'HL', 0xF1: 'AF' }[opcode];
    text = `POP ${pair}`;
  } else if ([0xC5, 0xD5, 0xE5, 0xF5].includes(opcode)) {
    const pair = { 0xC5: 'BC', 0xD5: 'DE', 0xE5: 'HL', 0xF5: 'AF' }[opcode];
    text = `PUSH ${pair}`;
  } else if (opcode === 0xC3) {
    text = `JP ${hex(read24LE(pc + 1))}`;
    length = 4;
    stop = true;
    kind = 'jump';
  } else if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(opcode)) {
    const cond = COND[(opcode >> 3) & 0x07];
    text = `JP ${cond},${hex(read24LE(pc + 1))}`;
    length = 4;
    kind = 'jump';
  } else if (opcode === 0xE9) {
    text = 'JP (HL)';
    stop = true;
    kind = 'jump';
  } else if (opcode === 0xCD) {
    text = `CALL ${hex(read24LE(pc + 1))}`;
    length = 4;
    kind = 'call';
  } else if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(opcode)) {
    const cond = COND[(opcode >> 3) & 0x07];
    text = `CALL ${cond},${hex(read24LE(pc + 1))}`;
    length = 4;
    kind = 'call';
  } else if (opcode === 0xC9) {
    text = 'RET';
    stop = true;
    kind = 'ret';
  } else if ([0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8].includes(opcode)) {
    const cond = COND[(opcode >> 3) & 0x07];
    text = `RET ${cond}`;
    kind = 'ret';
  } else if (opcode === 0x07) {
    text = 'RLCA';
  } else if (opcode === 0x0F) {
    text = 'RRCA';
  } else if (opcode === 0x17) {
    text = 'RLA';
  } else if (opcode === 0x1F) {
    text = 'RRA';
  } else if (opcode === 0x2F) {
    text = 'CPL';
  } else if (opcode === 0x37) {
    text = 'SCF';
  } else if (opcode === 0x3F) {
    text = 'CCF';
  } else if (opcode === 0x76) {
    text = 'HALT';
    kind = 'halt';
  } else if (opcode === 0xD9) {
    text = 'EXX';
  } else if (opcode === 0xE3) {
    text = 'EX (SP),HL';
  } else if (opcode === 0xEB) {
    text = 'EX DE,HL';
  } else if (opcode === 0xF3) {
    text = 'DI';
  } else if (opcode === 0xFB) {
    text = 'EI';
  } else if (opcode === 0xCB) {
    text = decodeCbOp(rom[pc + 1], REG8[rom[pc + 1] & 0x07]);
    length = 2;
  } else if (opcode === 0xED) {
    const decoded = decodeEdInstruction(pc);
    text = decoded.text;
    length = decoded.length;
  } else if (opcode === 0xDD || opcode === 0xFD) {
    const decoded = decodeIndexedInstruction(opcode, pc);
    text = decoded.text;
    length = decoded.length;
    stop = decoded.stop;
    if (decoded.stop) kind = 'jump';
  } else if ((opcode & 0xC7) === 0xC7) {
    text = `RST ${hex(opcode & 0x38, 2)}`;
    kind = 'call';
  } else {
    text = `DB ${hex(opcode, 2)}`;
  }

  const bytes = rom.subarray(pc, pc + length);
  return { addr: pc, bytes, length, text, stop, kind };
}

function disassembleLinear(start, maxBytes = MAX_STATIC_BYTES) {
  const entries = [];
  const limit = Math.min(rom.length, start + maxBytes);
  let pc = start;
  while (pc < limit) {
    const instruction = decodeInstruction(pc);
    entries.push(instruction);
    pc += instruction.length;
    if (instruction.stop) break;
  }
  return entries;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase281-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTemp(assets) {
  if (assets?.tempModulePath) {
    try {
      fs.unlinkSync(assets.tempModulePath);
    } catch {}
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTemp(assets);
    throw error;
  }
}

function resolveNextMode(meta, resultPc, currentMode) {
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === resultPc && exit.targetMode) return exit.targetMode;
  }
  return currentMode;
}

function installRamWriteHooks(cpu, traceContext, writeEvents) {
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  const record = (kind, addr, width, before, after) => {
    const maskedAddr = addr & MEM_MASK;
    if (maskedAddr < 0xD00000) return;
    let changed = false;
    for (let i = 0; i < width; i++) {
      if (before[i] !== after[i]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    writeEvents.push({
      step: traceContext.step,
      blockPc: traceContext.blockPc,
      kind,
      addr: maskedAddr,
      width,
      before: [...before],
      after: [...after],
    });
  };

  cpu.write8 = (addr, value) => {
    const maskedAddr = addr & MEM_MASK;
    const before = [cpu.memory[maskedAddr] ?? 0];
    origWrite8(addr, value);
    const after = [cpu.memory[maskedAddr] ?? 0];
    record('write8', maskedAddr, 1, before, after);
  };

  cpu.write16 = (addr, value) => {
    const maskedAddr = addr & MEM_MASK;
    const before = [cpu.memory[maskedAddr] ?? 0, cpu.memory[(maskedAddr + 1) & MEM_MASK] ?? 0];
    origWrite16(addr, value);
    const after = [cpu.memory[maskedAddr] ?? 0, cpu.memory[(maskedAddr + 1) & MEM_MASK] ?? 0];
    record('write16', maskedAddr, 2, before, after);
  };

  cpu.write24 = (addr, value) => {
    const maskedAddr = addr & MEM_MASK;
    const before = [
      cpu.memory[maskedAddr] ?? 0,
      cpu.memory[(maskedAddr + 1) & MEM_MASK] ?? 0,
      cpu.memory[(maskedAddr + 2) & MEM_MASK] ?? 0,
    ];
    origWrite24(addr, value);
    const after = [
      cpu.memory[maskedAddr] ?? 0,
      cpu.memory[(maskedAddr + 1) & MEM_MASK] ?? 0,
      cpu.memory[(maskedAddr + 2) & MEM_MASK] ?? 0,
    ];
    record('write24', maskedAddr, 3, before, after);
  };
}

function summarizeByteChanges(writeEvents) {
  const changes = new Map();
  for (const event of writeEvents) {
    for (let i = 0; i < event.width; i++) {
      const addr = (event.addr + i) & MEM_MASK;
      changes.set(addr, {
        addr,
        before: event.before[i],
        after: event.after[i],
        lastStep: event.step,
        lastBlockPc: event.blockPc,
      });
    }
  }
  return [...changes.values()].sort((a, b) => a.addr - b.addr);
}

function findDirectTransfersTo(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];
  for (let i = 0; i <= rom.length - 4; i++) {
    const opcode = rom[i];
    if ((opcode === 0xCD || opcode === 0xC3) && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      hits.push({
        addr: i,
        type: opcode === 0xCD ? 'CALL' : 'JP',
        bytes: bytesHex(rom.subarray(i, i + 4)),
      });
    }
  }
  return hits;
}

function formatWriteBytes(values) {
  return values.map((value) => hex(value, 2)).join(' ');
}

async function runDynamicTrace() {
  const { blocks, assets } = await loadBlocks();
  try {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const exec = createExecutor(blocks, mem, { peripherals });
    const { cpu, compiledBlocks, blockMeta } = exec;

    cpu.a = 0;
    cpu.f = 0;
    cpu._bc = 0;
    cpu._de = 0;
    cpu._hl = 0;
    cpu._ix = 0;
    cpu._iy = START_IY;
    cpu.madl = 1;
    cpu.mbase = 0xD0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.pc = TARGET;
    cpu.sp = START_SP;

    write24Mem(mem, START_SP, RETURN_SENTINEL);

    const traceContext = { step: 0, blockPc: TARGET };
    const writeEvents = [];
    installRamWriteHooks(cpu, traceContext, writeEvents);

    const blocksVisited = [];
    const callTargets = [];
    const jumpTargets = [];
    let termination = 'max_steps';
    let error = null;
    let pc = TARGET;
    let mode = 'adl';
    let steps = 0;

    while (steps < MAX_DYNAMIC_STEPS) {
      const key = `${pc.toString(16).padStart(6, '0')}:${mode}`;
      const fn = compiledBlocks[key];
      const meta = blockMeta[key];
      if (!fn) {
        termination = 'missing_block';
        break;
      }

      cpu.madl = mode === 'adl' ? 1 : 0;
      cpu.pc = pc;
      cpu._currentBlockPc = pc;
      traceContext.step = steps + 1;
      traceContext.blockPc = pc;

      let result;
      try {
        result = fn(cpu);
      } catch (caught) {
        termination = 'error';
        error = caught;
        break;
      }

      steps++;

      const lastInstruction = meta?.instructions?.[meta.instructions.length - 1] ?? null;
      const matchedExit = meta?.exits?.find((exit) => exit.target === result) ?? null;
      blocksVisited.push({
        step: steps,
        blockPc: pc,
        result,
        exitType: matchedExit?.type ?? 'dynamic',
        instructionCount: meta?.instructionCount ?? 0,
        lastDasm: lastInstruction?.dasm ?? '(unknown)',
      });

      if (matchedExit?.type === 'call') {
        callTargets.push({
          step: steps,
          site: lastInstruction?.pc ?? pc,
          target: result,
          dasm: lastInstruction?.dasm ?? '',
        });
      } else if (matchedExit && ['jump', 'jump-indirect', 'branch'].includes(matchedExit.type)) {
        jumpTargets.push({
          step: steps,
          site: lastInstruction?.pc ?? pc,
          target: result,
          type: matchedExit.type,
          dasm: lastInstruction?.dasm ?? '',
        });
      }

      if (result === RETURN_SENTINEL && cpu.sp === ((START_SP + 3) & MEM_MASK)) {
        termination = 'ret_to_caller';
        pc = result;
        break;
      }

      if (result === undefined || result === null) {
        termination = 'no_return';
        break;
      }

      if (typeof result !== 'number') {
        termination = 'non_numeric_result';
        break;
      }

      if (result < 0) {
        termination = result === -1 ? 'halt' : result === -2 ? 'sleep' : `sentinel_${result}`;
        break;
      }

      mode = resolveNextMode(meta, result, mode);
      pc = result & 0xFFFFFF;
    }

    return {
      steps,
      termination,
      error,
      finalPc: pc,
      finalMode: mode,
      finalCpu: {
        pc: cpu.pc,
        sp: cpu.sp,
        a: cpu.a,
        f: cpu.f,
        bc: cpu._bc,
        de: cpu._de,
        hl: cpu._hl,
        ix: cpu._ix,
        iy: cpu._iy,
      },
      blocksVisited,
      callTargets,
      jumpTargets,
      writeEvents,
      byteChanges: summarizeByteChanges(writeEvents),
    };
  } finally {
    cleanupTemp(assets);
  }
}

console.log('='.repeat(80));
console.log(`Phase 281: Trace ${hex(TARGET)} - STAT CALC post-init function`);
console.log('='.repeat(80));

console.log('\n' + '='.repeat(80));
console.log(`PART 1: Static disassembly from ${hex(TARGET)} (until RET/unconditional JP)`);
console.log('='.repeat(80));

const disassembly = disassembleLinear(TARGET, MAX_STATIC_BYTES);
for (const entry of disassembly) {
  const addrText = hex(entry.addr);
  const byteText = bytesHex(entry.bytes).padEnd(20, ' ');
  console.log(`  ${addrText}: ${byteText} ${entry.text}`);
}

if (disassembly.length > 0) {
  const last = disassembly[disassembly.length - 1];
  console.log(`\n  Decoded ${disassembly.length} instruction(s), ${(last.addr + last.length - TARGET)} byte(s) total.`);
  console.log(`  Stop point: ${hex(last.addr)} -> ${last.text}`);
}

console.log('\n' + '='.repeat(80));
console.log('PART 2: Dynamic trace summary');
console.log('='.repeat(80));

let dynamicResult = null;
try {
  dynamicResult = await runDynamicTrace();

  console.log(`  Start state: PC=${hex(TARGET)} SP=${hex(START_SP)} IY=${hex(START_IY)} timerInterrupt=false`);
  console.log(`  Return sentinel: ${hex(RETURN_SENTINEL)} stored at ${hex(START_SP)}`);
  console.log(`  Steps executed: ${dynamicResult.steps}`);
  console.log(`  Termination: ${dynamicResult.termination}`);
  if (dynamicResult.error) {
    console.log(`  Error: ${dynamicResult.error.message}`);
  }
  console.log(`  Final flow PC: ${hex(dynamicResult.finalPc)}:${dynamicResult.finalMode}`);
  console.log(`  Final CPU: PC=${hex(dynamicResult.finalCpu.pc)} SP=${hex(dynamicResult.finalCpu.sp)} A=${hex(dynamicResult.finalCpu.a, 2)} F=${hex(dynamicResult.finalCpu.f, 2)}`);
  console.log(`             BC=${hex(dynamicResult.finalCpu.bc)} DE=${hex(dynamicResult.finalCpu.de)} HL=${hex(dynamicResult.finalCpu.hl)} IX=${hex(dynamicResult.finalCpu.ix)} IY=${hex(dynamicResult.finalCpu.iy)}`);

  console.log(`\n  Blocks visited (${dynamicResult.blocksVisited.length}):`);
  for (const block of dynamicResult.blocksVisited) {
    const targetText = typeof block.result === 'number' && block.result >= 0 ? hex(block.result) : String(block.result);
    console.log(`    [${String(block.step).padStart(3, ' ')}] ${hex(block.blockPc)} -> ${targetText} via ${block.exitType} | ${block.lastDasm}`);
  }

  console.log(`\n  CALL targets taken (${dynamicResult.callTargets.length}):`);
  if (dynamicResult.callTargets.length === 0) {
    console.log('    (none)');
  } else {
    for (const call of dynamicResult.callTargets) {
      console.log(`    step ${call.step}: ${hex(call.site)} -> ${hex(call.target)}${labelFor(call.target)} | ${call.dasm}`);
    }
  }

  console.log(`\n  JP/JR targets taken (${dynamicResult.jumpTargets.length}):`);
  if (dynamicResult.jumpTargets.length === 0) {
    console.log('    (none)');
  } else {
    for (const jump of dynamicResult.jumpTargets) {
      console.log(`    step ${jump.step}: ${hex(jump.site)} -> ${hex(jump.target)}${labelFor(jump.target)} | ${jump.type} | ${jump.dasm}`);
    }
  }
} catch (error) {
  console.log(`  Dynamic trace failed: ${error.message}`);
  console.log(error.stack);
}

console.log('\n' + '='.repeat(80));
console.log('PART 3: RAM writes (0xD00000+)');
console.log('='.repeat(80));

if (!dynamicResult) {
  console.log('  Dynamic trace did not complete, so RAM writes are unavailable.');
} else {
  console.log(`  Write events: ${dynamicResult.writeEvents.length}`);
  if (dynamicResult.writeEvents.length === 0) {
    console.log('    (none)');
  } else {
    for (const event of dynamicResult.writeEvents) {
      console.log(`    step ${event.step}: ${hex(event.blockPc)} ${event.kind} ${hex(event.addr)} [${formatWriteBytes(event.before)}] -> [${formatWriteBytes(event.after)}]`);
    }
  }

  console.log(`\n  Final changed RAM bytes: ${dynamicResult.byteChanges.length}`);
  if (dynamicResult.byteChanges.length === 0) {
    console.log('    (none)');
  } else {
    for (const change of dynamicResult.byteChanges) {
      console.log(`    ${hex(change.addr)}: ${hex(change.before, 2)} -> ${hex(change.after, 2)} (last step ${change.lastStep}, block ${hex(change.lastBlockPc)})`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log(`PART 4: Direct CALL/JP scan for ${hex(TARGET)}`);
console.log('='.repeat(80));

const directTransfers = findDirectTransfersTo(TARGET);
console.log(`  Matches found: ${directTransfers.length}`);
if (directTransfers.length === 0) {
  console.log('    (none)');
} else {
  for (const hit of directTransfers) {
    console.log(`    ${hex(hit.addr)}: ${hit.type} ${hex(TARGET)}${labelFor(hit.addr)} | ${hit.bytes}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('Phase 281 probe complete.');
console.log('='.repeat(80));

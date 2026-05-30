import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const MEM_SIZE = 0x1000000;

const START = 0x003D5A;
const MIN_RAW_BYTES = 128;
const MAX_DISASSEMBLY_BYTES = 1024;
const D_RANGE_START = 0xD00000;
const D_RANGE_END = 0xD1FFFF;

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const RP = ['BC', 'DE', 'HL', 'SP'];
const RP2 = ['BC', 'DE', 'HL', 'AF'];
const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ALU = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];

const callTargets = new Map();
const memoryAccesses = new Map();
const portAccesses = new Map();

function byteAt(addr) {
  if (addr < 0 || addr >= romBytes.length) return 0;
  return romBytes[addr] ?? 0;
}

function bytesAt(addr, length) {
  const out = [];
  for (let i = 0; i < length; i++) out.push(byteAt(addr + i));
  return out;
}

function readU24(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8) | (byteAt(addr + 2) << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function addrHex(value) {
  return hex(value & 0xFFFFFF, 6);
}

function rawBytes(addr, length) {
  return bytesAt(addr, length).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function relativeTarget(addr, length, offset) {
  return (addr + length + signed8(offset)) & 0xFFFFFF;
}

function isDRange(addr) {
  return addr >= D_RANGE_START && addr <= D_RANGE_END;
}

function addCall(target, at, text) {
  const normalized = target & 0xFFFFFF;
  const existing = callTargets.get(normalized) ?? [];
  existing.push({ at, text });
  callTargets.set(normalized, existing);
}

function addMemoryAccess(target, direction, at, text) {
  if (!isDRange(target)) return;
  const normalized = target & 0xFFFFFF;
  const existing = memoryAccesses.get(normalized) ?? [];
  existing.push({ direction, at, text });
  memoryAccesses.set(normalized, existing);
}

function addPortAccess(port, direction, at, text) {
  const key = typeof port === 'number' ? hex(port, 2) : port;
  const existing = portAccesses.get(key) ?? [];
  existing.push({ direction, at, text });
  portAccesses.set(key, existing);
}

function instruction(addr, length, text, options = {}) {
  return {
    addr,
    length,
    bytes: bytesAt(addr, length),
    text,
    terminates: options.terminates ?? false,
  };
}

function formatIndexed(indexRegister, displacement) {
  if (displacement === 0) return `(${indexRegister})`;
  const sign = displacement < 0 ? '-' : '+';
  return `(${indexRegister}${sign}${hex(Math.abs(displacement), 2)})`;
}

function formatAlu(name, operand) {
  if (name === 'SUB' || name === 'AND' || name === 'XOR' || name === 'OR' || name === 'CP') {
    return `${name} ${operand}`;
  }
  return `${name},${operand}`;
}

function decodeCB(addr) {
  const op = byteAt(addr + 1);
  const reg = REG8[op & 0x07];
  if (op < 0x40) {
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return instruction(addr, 2, `${ops[(op >> 3) & 0x07]} ${reg}`);
  }
  if (op < 0x80) return instruction(addr, 2, `BIT ${(op >> 3) & 0x07},${reg}`);
  if (op < 0xC0) return instruction(addr, 2, `RES ${(op >> 3) & 0x07},${reg}`);
  return instruction(addr, 2, `SET ${(op >> 3) & 0x07},${reg}`);
}

function decodeIndexedCB(addr, indexRegister) {
  const displacement = signed8(byteAt(addr + 2));
  const operand = formatIndexed(indexRegister, displacement);
  const op = byteAt(addr + 3);
  if (op < 0x40) {
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return instruction(addr, 4, `${ops[(op >> 3) & 0x07]} ${operand}`);
  }
  if (op < 0x80) return instruction(addr, 4, `BIT ${(op >> 3) & 0x07},${operand}`);
  if (op < 0xC0) return instruction(addr, 4, `RES ${(op >> 3) & 0x07},${operand}`);
  return instruction(addr, 4, `SET ${(op >> 3) & 0x07},${operand}`);
}

function decodeED(addr, collect) {
  const op = byteAt(addr + 1);

  if ((op & 0xC7) === 0x40) {
    const reg = REG8[(op >> 3) & 0x07];
    const text = reg === '(HL)' ? 'IN (C)' : `IN ${reg},(C)`;
    if (collect) addPortAccess('C', 'read', addr, text);
    return instruction(addr, 2, text);
  }

  if ((op & 0xC7) === 0x41) {
    const reg = REG8[(op >> 3) & 0x07];
    const text = `OUT (C),${reg === '(HL)' ? '0' : reg}`;
    if (collect) addPortAccess('C', 'write', addr, text);
    return instruction(addr, 2, text);
  }

  const memLoads = {
    0x43: ['BC', 'write'],
    0x4B: ['BC', 'read'],
    0x53: ['DE', 'write'],
    0x5B: ['DE', 'read'],
    0x63: ['HL', 'write'],
    0x6B: ['HL', 'read'],
    0x73: ['SP', 'write'],
    0x7B: ['SP', 'read'],
  };

  if (op in memLoads) {
    const [reg, direction] = memLoads[op];
    const target = readU24(addr + 2);
    const text = direction === 'read'
      ? `LD ${reg},(${addrHex(target)})`
      : `LD (${addrHex(target)}),${reg}`;
    if (collect) addMemoryAccess(target, direction, addr, text);
    return instruction(addr, 5, text);
  }

  const simple = {
    0x44: 'NEG',
    0x45: 'RETN',
    0x46: 'IM 0',
    0x47: 'LD I,A',
    0x4D: 'RETI',
    0x4F: 'LD R,A',
    0x56: 'IM 1',
    0x57: 'LD A,I',
    0x5E: 'IM 2',
    0x5F: 'LD A,R',
    0x67: 'RRD',
    0x6F: 'RLD',
    0xA0: 'LDI',
    0xA1: 'CPI',
    0xA2: 'INI',
    0xA3: 'OUTI',
    0xA8: 'LDD',
    0xA9: 'CPD',
    0xAA: 'IND',
    0xAB: 'OUTD',
    0xB0: 'LDIR',
    0xB1: 'CPIR',
    0xB2: 'INIR',
    0xB3: 'OTIR',
    0xB8: 'LDDR',
    0xB9: 'CPDR',
    0xBA: 'INDR',
    0xBB: 'OTDR',
  };

  if (op in simple) {
    return instruction(addr, 2, simple[op], { terminates: op === 0x45 || op === 0x4D });
  }

  return instruction(addr, 2, `ED ${hex(op, 2)}`);
}

function decodeIndexed(addr, collect, prefix) {
  const indexRegister = prefix === 0xDD ? 'IX' : 'IY';
  const op = byteAt(addr + 1);

  if (op === 0xCB) return decodeIndexedCB(addr, indexRegister);

  if (op === 0x21) return instruction(addr, 5, `LD ${indexRegister},${addrHex(readU24(addr + 2))}`);
  if (op === 0x22 || op === 0x2A) {
    const target = readU24(addr + 2);
    const direction = op === 0x2A ? 'read' : 'write';
    const text = direction === 'read'
      ? `LD ${indexRegister},(${addrHex(target)})`
      : `LD (${addrHex(target)}),${indexRegister}`;
    if (collect) addMemoryAccess(target, direction, addr, text);
    return instruction(addr, 5, text);
  }

  if (op === 0x23) return instruction(addr, 2, `INC ${indexRegister}`);
  if (op === 0x2B) return instruction(addr, 2, `DEC ${indexRegister}`);
  if (op === 0x34 || op === 0x35) {
    const operand = formatIndexed(indexRegister, signed8(byteAt(addr + 2)));
    return instruction(addr, 3, `${op === 0x34 ? 'INC' : 'DEC'} ${operand}`);
  }
  if (op === 0x36) {
    const operand = formatIndexed(indexRegister, signed8(byteAt(addr + 2)));
    return instruction(addr, 4, `LD ${operand},${hex(byteAt(addr + 3), 2)}`);
  }

  if ((op & 0xC7) === 0x46) {
    const operand = formatIndexed(indexRegister, signed8(byteAt(addr + 2)));
    return instruction(addr, 3, `LD ${REG8[(op >> 3) & 0x07]},${operand}`);
  }

  if ((op & 0xF8) === 0x70 && op !== 0x76) {
    const operand = formatIndexed(indexRegister, signed8(byteAt(addr + 2)));
    return instruction(addr, 3, `LD ${operand},${REG8[op & 0x07]}`);
  }

  if (op >= 0x80 && op <= 0xBF && (op & 0x07) === 0x06) {
    const operand = formatIndexed(indexRegister, signed8(byteAt(addr + 2)));
    return instruction(addr, 3, formatAlu(ALU[(op >> 3) & 0x07], operand));
  }

  if ((op & 0xCF) === 0x09) {
    const regs = ['BC', 'DE', indexRegister, 'SP'];
    return instruction(addr, 2, `ADD ${indexRegister},${regs[(op >> 4) & 0x03]}`);
  }

  const simple = {
    0xE1: `POP ${indexRegister}`,
    0xE3: `EX (SP),${indexRegister}`,
    0xE5: `PUSH ${indexRegister}`,
    0xE9: `JP (${indexRegister})`,
    0xF9: `LD SP,${indexRegister}`,
  };
  if (op in simple) return instruction(addr, 2, simple[op], { terminates: op === 0xE9 });

  return instruction(addr, 2, `${indexRegister} prefix ${hex(op, 2)}`);
}

function decodeInstruction(addr, options = {}) {
  const collect = options.collect ?? false;
  const op = byteAt(addr);

  if (op === 0xCB) return decodeCB(addr);
  if (op === 0xED) return decodeED(addr, collect);
  if (op === 0xDD || op === 0xFD) return decodeIndexed(addr, collect, op);

  if (op >= 0x40 && op <= 0x7F) {
    if (op === 0x76) return instruction(addr, 1, 'HALT');
    return instruction(addr, 1, `LD ${REG8[(op >> 3) & 0x07]},${REG8[op & 0x07]}`);
  }

  if (op >= 0x80 && op <= 0xBF) {
    return instruction(addr, 1, formatAlu(ALU[(op >> 3) & 0x07], REG8[op & 0x07]));
  }

  if ((op & 0xC7) === 0x04) return instruction(addr, 1, `INC ${REG8[(op >> 3) & 0x07]}`);
  if ((op & 0xC7) === 0x05) return instruction(addr, 1, `DEC ${REG8[(op >> 3) & 0x07]}`);
  if ((op & 0xC7) === 0x06) return instruction(addr, 2, `LD ${REG8[(op >> 3) & 0x07]},${hex(byteAt(addr + 1), 2)}`);

  if ((op & 0xCF) === 0x01) return instruction(addr, 4, `LD ${RP[(op >> 4) & 0x03]},${addrHex(readU24(addr + 1))}`);
  if ((op & 0xCF) === 0x03) return instruction(addr, 1, `INC ${RP[(op >> 4) & 0x03]}`);
  if ((op & 0xCF) === 0x09) return instruction(addr, 1, `ADD HL,${RP[(op >> 4) & 0x03]}`);
  if ((op & 0xCF) === 0x0B) return instruction(addr, 1, `DEC ${RP[(op >> 4) & 0x03]}`);
  if ((op & 0xCF) === 0xC1) return instruction(addr, 1, `POP ${RP2[(op >> 4) & 0x03]}`);
  if ((op & 0xCF) === 0xC5) return instruction(addr, 1, `PUSH ${RP2[(op >> 4) & 0x03]}`);
  if ((op & 0xC7) === 0xC0) return instruction(addr, 1, `RET ${CC[(op >> 3) & 0x07]}`);
  if ((op & 0xC7) === 0xC2) return instruction(addr, 4, `JP ${CC[(op >> 3) & 0x07]},${addrHex(readU24(addr + 1))}`);
  if ((op & 0xC7) === 0xC4) {
    const target = readU24(addr + 1);
    const text = `CALL ${CC[(op >> 3) & 0x07]},${addrHex(target)}`;
    if (collect) addCall(target, addr, text);
    return instruction(addr, 4, text);
  }
  if ((op & 0xC7) === 0xC7) return instruction(addr, 1, `RST ${hex(op & 0x38, 2)}`);

  const jrConditions = {
    0x20: 'NZ',
    0x28: 'Z',
    0x30: 'NC',
    0x38: 'C',
  };
  if (op in jrConditions) {
    const target = relativeTarget(addr, 2, byteAt(addr + 1));
    return instruction(addr, 2, `JR ${jrConditions[op]},${addrHex(target)}`);
  }

  const immAlu = {
    0xC6: 'ADD A',
    0xCE: 'ADC A',
    0xD6: 'SUB',
    0xDE: 'SBC A',
    0xE6: 'AND',
    0xEE: 'XOR',
    0xF6: 'OR',
    0xFE: 'CP',
  };
  if (op in immAlu) return instruction(addr, 2, formatAlu(immAlu[op], hex(byteAt(addr + 1), 2)));

  switch (op) {
    case 0x00:
      return instruction(addr, 1, 'NOP');
    case 0x02:
      return instruction(addr, 1, 'LD (BC),A');
    case 0x07:
      return instruction(addr, 1, 'RLCA');
    case 0x08:
      return instruction(addr, 1, "EX AF,AF'");
    case 0x0A:
      return instruction(addr, 1, 'LD A,(BC)');
    case 0x0F:
      return instruction(addr, 1, 'RRCA');
    case 0x10:
      return instruction(addr, 2, `DJNZ ${addrHex(relativeTarget(addr, 2, byteAt(addr + 1)))}`);
    case 0x12:
      return instruction(addr, 1, 'LD (DE),A');
    case 0x17:
      return instruction(addr, 1, 'RLA');
    case 0x18:
      return instruction(addr, 2, `JR ${addrHex(relativeTarget(addr, 2, byteAt(addr + 1)))}`);
    case 0x1A:
      return instruction(addr, 1, 'LD A,(DE)');
    case 0x1F:
      return instruction(addr, 1, 'RRA');
    case 0x22: {
      const target = readU24(addr + 1);
      const text = `LD (${addrHex(target)}),HL`;
      if (collect) addMemoryAccess(target, 'write', addr, text);
      return instruction(addr, 4, text);
    }
    case 0x27:
      return instruction(addr, 1, 'DAA');
    case 0x2A: {
      const target = readU24(addr + 1);
      const text = `LD HL,(${addrHex(target)})`;
      if (collect) addMemoryAccess(target, 'read', addr, text);
      return instruction(addr, 4, text);
    }
    case 0x2F:
      return instruction(addr, 1, 'CPL');
    case 0x32: {
      const target = readU24(addr + 1);
      const text = `LD (${addrHex(target)}),A`;
      if (collect) addMemoryAccess(target, 'write', addr, text);
      return instruction(addr, 4, text);
    }
    case 0x37:
      return instruction(addr, 1, 'SCF');
    case 0x3A: {
      const target = readU24(addr + 1);
      const text = `LD A,(${addrHex(target)})`;
      if (collect) addMemoryAccess(target, 'read', addr, text);
      return instruction(addr, 4, text);
    }
    case 0x3F:
      return instruction(addr, 1, 'CCF');
    case 0xC3:
      return instruction(addr, 4, `JP ${addrHex(readU24(addr + 1))}`, { terminates: true });
    case 0xC9:
      return instruction(addr, 1, 'RET', { terminates: true });
    case 0xCD: {
      const target = readU24(addr + 1);
      const text = `CALL ${addrHex(target)}`;
      if (collect) addCall(target, addr, text);
      return instruction(addr, 4, text);
    }
    case 0xD3: {
      const port = byteAt(addr + 1);
      const text = `OUT (${hex(port, 2)}),A`;
      if (collect) addPortAccess(port, 'write', addr, text);
      return instruction(addr, 2, text);
    }
    case 0xD9:
      return instruction(addr, 1, 'EXX');
    case 0xDB: {
      const port = byteAt(addr + 1);
      const text = `IN A,(${hex(port, 2)})`;
      if (collect) addPortAccess(port, 'read', addr, text);
      return instruction(addr, 2, text);
    }
    case 0xE3:
      return instruction(addr, 1, 'EX (SP),HL');
    case 0xE9:
      return instruction(addr, 1, 'JP (HL)', { terminates: true });
    case 0xEB:
      return instruction(addr, 1, 'EX DE,HL');
    case 0xF3:
      return instruction(addr, 1, 'DI');
    case 0xF9:
      return instruction(addr, 1, 'LD SP,HL');
    case 0xFB:
      return instruction(addr, 1, 'EI');
    default:
      return instruction(addr, 1, `DB ${hex(op, 2)}`);
  }
}

function disassembleFunction(start) {
  const result = [];
  let pc = start;
  const limit = start + MAX_DISASSEMBLY_BYTES;
  while (pc < limit) {
    const decoded = decodeInstruction(pc, { collect: true });
    result.push(decoded);
    pc += Math.max(decoded.length, 1);
    if (decoded.terminates) break;
  }
  return result;
}

function printSection(title) {
  console.log('');
  console.log(`=== ${title} ===`);
}

function printHexDump(start, length) {
  for (let offset = 0; offset < length; offset += 16) {
    const count = Math.min(16, length - offset);
    console.log(`${addrHex(start + offset)}: ${rawBytes(start + offset, count)}`);
  }
}

function printInstruction(decoded) {
  const bytes = rawBytes(decoded.addr, decoded.length).padEnd(17, ' ');
  console.log(`${addrHex(decoded.addr)}: ${bytes} ${decoded.text}`);
}

function summarize(instructions) {
  const hasPortRead = [...portAccesses.values()].some((entries) => entries.some((entry) => entry.direction === 'read'));
  const hasPortWrite = [...portAccesses.values()].some((entries) => entries.some((entry) => entry.direction === 'write'));
  const hasMemory = memoryAccesses.size > 0;
  const hasCalls = callTargets.size > 0;
  const hasReturn = instructions.some((entry) => entry.terminates && /RET|JP/.test(entry.text));

  const parts = [];
  if (hasPortRead && hasPortWrite) parts.push('performs port input and output');
  else if (hasPortRead) parts.push('reads from ports');
  else if (hasPortWrite) parts.push('writes to ports');
  if (hasMemory) parts.push('touches D00000-D1FFFF state directly');
  if (hasCalls) parts.push(`delegates to ${callTargets.size} CALL target(s)`);
  if (!parts.length) parts.push('has no direct D-range absolute memory access or port I/O in the decoded body');

  return `Heuristic summary: ${parts.join('; ')}${hasReturn ? '; terminates with a return/tail jump.' : '.'}`;
}

function printCallTargets() {
  printSection('CALL targets');
  if (!callTargets.size) {
    console.log('No CALL targets found in the decoded 0x003D5A body.');
    return;
  }

  for (const [target, sites] of [...callTargets.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`${addrHex(target)} called from ${sites.map((site) => addrHex(site.at)).join(', ')}`);
    console.log(`  first 16 bytes: ${rawBytes(target, 16)}`);
    let pc = target;
    let decodedCount = 0;
    while (pc < target + 16 && decodedCount < 6) {
      const decoded = decodeInstruction(pc, { collect: false });
      console.log(`  ${addrHex(decoded.addr)}: ${rawBytes(decoded.addr, decoded.length).padEnd(17, ' ')} ${decoded.text}`);
      pc += Math.max(decoded.length, 1);
      decodedCount++;
      if (decoded.terminates) break;
    }
  }
}

function printMemoryAccesses() {
  printSection('D-range memory accesses');
  if (!memoryAccesses.size) {
    console.log('No absolute D00000-D1FFFF memory references found in the decoded body.');
    return;
  }

  for (const [target, entries] of [...memoryAccesses.entries()].sort((a, b) => a[0] - b[0])) {
    const directions = [...new Set(entries.map((entry) => entry.direction))].join('/');
    const sites = entries.map((entry) => `${addrHex(entry.at)} ${entry.text}`).join('; ');
    console.log(`${addrHex(target)} ${directions}: ${sites}`);
  }
}

function printPortAccesses() {
  printSection('Port I/O');
  if (!portAccesses.size) {
    console.log('No IN/OUT instructions found in the decoded body.');
    return;
  }

  for (const [port, entries] of [...portAccesses.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const directions = [...new Set(entries.map((entry) => entry.direction))].join('/');
    const sites = entries.map((entry) => `${addrHex(entry.at)} ${entry.text}`).join('; ');
    console.log(`${port} ${directions}: ${sites}`);
  }
}

function cloneDRange(mem) {
  return mem.slice(D_RANGE_START, D_RANGE_END + 1);
}

function diffDRange(before, mem) {
  const changes = [];
  for (let i = 0; i < before.length; i++) {
    const addr = D_RANGE_START + i;
    const after = mem[addr];
    if (before[i] !== after) {
      changes.push({ addr, before: before[i], after });
    }
  }
  return changes;
}

async function runExecutionTest() {
  printSection('Direct execution test');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)), 0);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('executor: createExecutor(BLOCKS, mem, { peripherals })');

  // Stage 1: z80 boot
  const stage1 = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`stage 1: termination=${stage1.termination}; finalPC=${addrHex(stage1.lastPc)}; steps=${stage1.steps}`);

  // Stage 2: kernel init
  cpu.halted = false;
  cpu.sp = 0xD1A87E;
  const stage2 = executor.runFrom(0x08C331, 'adl', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`stage 2: termination=${stage2.termination}; finalPC=${addrHex(stage2.lastPc)}; steps=${stage2.steps}`);

  // Stage 3: post-init
  cpu.halted = false;
  cpu.sp = 0xD1A87E;
  const stage3 = executor.runFrom(0x0802B2, 'adl', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`stage 3: termination=${stage3.termination}; finalPC=${addrHex(stage3.lastPc)}; steps=${stage3.steps}`);

  mem[0xD177BA] = 0x7F;
  const before = cloneDRange(mem);

  // Direct execution of 0x003D5A
  cpu.halted = false;
  cpu.sp = 0xD1A87E;
  const result = executor.runFrom(START, 'adl', { maxSteps: 10000, maxLoopIterations: 32 });
  console.log(`direct: termination=${result.termination}; finalPC=${addrHex(result.lastPc)}; steps=${result.steps}`);

  const changes = diffDRange(before, mem);
  console.log(`D00000-D1FFFF changes: ${changes.length}`);
  for (const change of changes.slice(0, 128)) {
    console.log(`  ${addrHex(change.addr)}: ${hex(change.before, 2)} => ${hex(change.after, 2)}`);
  }
  if (changes.length > 128) console.log(`  ... ${changes.length - 128} more changes omitted`);
}

const functionInstructions = disassembleFunction(START);

printSection(`Raw ROM bytes at ${addrHex(START)} (${MIN_RAW_BYTES} bytes)`);
printHexDump(START, MIN_RAW_BYTES);

printSection(`Disassembly from ${addrHex(START)}`);
for (const decoded of functionInstructions) printInstruction(decoded);

printSection('Summary');
console.log(summarize(functionInstructions));

printCallTargets();
printMemoryAccesses();
printPortAccesses();

try {
  await runExecutionTest();
} catch (error) {
  printSection('Direct execution test failed');
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}

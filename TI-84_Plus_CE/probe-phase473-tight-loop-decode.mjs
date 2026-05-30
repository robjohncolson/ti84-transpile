import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;

const DISASM_START = 0x02FDD8;
const DISASM_END = 0x02FE88;
const EVENT_LOOP_HEAD = 0x02FDBE;
const MAIN_HANDLER = 0x02FDD8;
const LOOP_RET = 0x02FE88;
const KEY_PROCESSOR = 0x03FA09;
const TRACE_LIMIT = 200;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(romPath);
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, Math.min(romBytes.length, mem.length)));

const romModule = await import(pathToFileURL(transpiledPath).href);

let cpu;
let traceEnabled = false;
const blockTrace = [];
const traceLimitReached = new Error('TRACE_LIMIT_REACHED');

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexPlain(value, width = 2) {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function readU8(addr) {
  return romBytes[addr] ?? 0;
}

function readSigned8(addr) {
  const value = readU8(addr);
  return value & 0x80 ? value - 0x100 : value;
}

function readLE(addr, size) {
  let value = 0;
  for (let i = 0; i < size; i += 1) {
    value |= readU8(addr + i) << (8 * i);
  }
  return value >>> 0;
}

function formatBytes(addr, size) {
  const bytes = [];
  for (let i = 0; i < size; i += 1) {
    bytes.push(hexPlain(readU8(addr + i), 2));
  }
  return bytes.join(' ').padEnd(14, ' ');
}

function relTarget(pc, size, disp) {
  return (pc + size + disp) & 0xFFFFFF;
}

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const RP = ['BC', 'DE', 'HL', 'SP'];
const RP2 = ['BC', 'DE', 'HL', 'AF'];
const COND = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ALU = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const ROT = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function branchTargetInstruction(opcode) {
  if (opcode === 0xC3) return { mnemonic: 'JP', conditional: false };
  if (opcode === 0xCD) return { mnemonic: 'CALL', conditional: false };
  if ((opcode & 0xC7) === 0xC2) {
    return { mnemonic: `JP ${COND[(opcode >> 3) & 7]},`, conditional: true };
  }
  if ((opcode & 0xC7) === 0xC4) {
    return { mnemonic: `CALL ${COND[(opcode >> 3) & 7]},`, conditional: true };
  }
  return null;
}

function decodeCb(pc, prefix = null, displacement = null) {
  const opcodeAddr = displacement === null ? pc + 1 : pc + 3;
  const opcode = readU8(opcodeAddr);
  const x = opcode >> 6;
  const y = (opcode >> 3) & 7;
  const z = opcode & 7;
  const indexedMem = prefix && z === 6 ? `(${prefix}${displacement < 0 ? '-' : '+'}${hex(Math.abs(displacement), 2)})` : REG8[z];
  const operand = prefix && z !== 6 ? `${indexedMem}, ${REG8[z]}` : indexedMem;

  if (x === 0) return { size: displacement === null ? 2 : 4, mnemonic: `${ROT[y]} ${operand}` };
  if (x === 1) return { size: displacement === null ? 2 : 4, mnemonic: `BIT ${y}, ${indexedMem}` };
  if (x === 2) return { size: displacement === null ? 2 : 4, mnemonic: `RES ${y}, ${operand}` };
  return { size: displacement === null ? 2 : 4, mnemonic: `SET ${y}, ${operand}` };
}

function decodeEd(pc, addrBytes) {
  const opcode = readU8(pc + 1);
  const x = opcode >> 6;
  const y = (opcode >> 3) & 7;
  const z = opcode & 7;
  const p = y >> 1;
  const q = y & 1;

  const fixed = new Map([
    [0x44, 'NEG'],
    [0x45, 'RETN'],
    [0x46, 'IM 0'],
    [0x47, 'LD I, A'],
    [0x4D, 'RETI'],
    [0x4F, 'LD R, A'],
    [0x56, 'IM 1'],
    [0x57, 'LD A, I'],
    [0x5E, 'IM 2'],
    [0x5F, 'LD A, R'],
    [0x67, 'RRD'],
    [0x6F, 'RLD'],
    [0xA0, 'LDI'],
    [0xA1, 'CPI'],
    [0xA2, 'INI'],
    [0xA3, 'OUTI'],
    [0xA8, 'LDD'],
    [0xA9, 'CPD'],
    [0xAA, 'IND'],
    [0xAB, 'OUTD'],
    [0xB0, 'LDIR'],
    [0xB1, 'CPIR'],
    [0xB2, 'INIR'],
    [0xB3, 'OTIR'],
    [0xB8, 'LDDR'],
    [0xB9, 'CPDR'],
    [0xBA, 'INDR'],
    [0xBB, 'OTDR'],
  ]);

  if (fixed.has(opcode)) return { size: 2, mnemonic: fixed.get(opcode) };
  if (x === 1 && z === 0) return { size: 2, mnemonic: `IN ${REG8[y]}, (C)` };
  if (x === 1 && z === 1) return { size: 2, mnemonic: `OUT (C), ${REG8[y]}` };
  if (x === 1 && z === 2) return { size: 2, mnemonic: `${q ? 'ADC' : 'SBC'} HL, ${RP[p]}` };
  if (x === 1 && z === 3) {
    const target = readLE(pc + 2, addrBytes);
    return { size: 2 + addrBytes, mnemonic: q ? `LD ${RP[p]}, (${hex(target, 6)})` : `LD (${hex(target, 6)}), ${RP[p]}`, target };
  }

  return { size: 2, mnemonic: `DB ED ${hexPlain(opcode)}` };
}

function replaceIndexRegisters(text, indexReg, displacement = null) {
  let out = text.replace(/\bHL\b/g, indexReg);
  out = out.replace(/\bH\b/g, `${indexReg}H`).replace(/\bL\b/g, `${indexReg}L`);
  if (displacement !== null) {
    const disp = `${displacement < 0 ? '-' : '+'}${hex(Math.abs(displacement), 2)}`;
    out = out.replace(/\(HL\)/g, `(${indexReg}${disp})`);
  }
  return out;
}

function decodeBase(pc, options = {}) {
  const addrBytes = options.addrBytes ?? 3;
  const opcode = readU8(pc);
  const x = opcode >> 6;
  const y = (opcode >> 3) & 7;
  const z = opcode & 7;
  const p = y >> 1;
  const q = y & 1;

  if (opcode === 0xCB) return decodeCb(pc);
  if (opcode === 0xED) return decodeEd(pc, addrBytes);

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { size: 1, mnemonic: 'NOP' };
      if (y === 1) return { size: 1, mnemonic: "EX AF, AF'" };
      if (y === 2) {
        const disp = readSigned8(pc + 1);
        return { size: 2, mnemonic: `DJNZ ${hex(relTarget(pc, 2, disp), 6)}`, target: relTarget(pc, 2, disp) };
      }
      if (y === 3) {
        const disp = readSigned8(pc + 1);
        return { size: 2, mnemonic: `JR ${hex(relTarget(pc, 2, disp), 6)}`, target: relTarget(pc, 2, disp) };
      }
      const disp = readSigned8(pc + 1);
      return { size: 2, mnemonic: `JR ${COND[y - 4]}, ${hex(relTarget(pc, 2, disp), 6)}`, target: relTarget(pc, 2, disp) };
    }

    if (z === 1) {
      if (q === 0) {
        const value = readLE(pc + 1, addrBytes);
        return { size: 1 + addrBytes, mnemonic: `LD ${RP[p]}, ${hex(value, addrBytes * 2)}` };
      }
      return { size: 1, mnemonic: `ADD HL, ${RP[p]}` };
    }

    if (z === 2) {
      const absolute = readLE(pc + 1, addrBytes);
      const table = [
        'LD (BC), A',
        'LD A, (BC)',
        'LD (DE), A',
        'LD A, (DE)',
        `LD (${hex(absolute, 6)}), HL`,
        `LD HL, (${hex(absolute, 6)})`,
        `LD (${hex(absolute, 6)}), A`,
        `LD A, (${hex(absolute, 6)})`,
      ];
      const size = y >= 4 ? 1 + addrBytes : 1;
      return { size, mnemonic: table[y], target: y >= 4 ? absolute : undefined };
    }

    if (z === 3) return { size: 1, mnemonic: `${q ? 'DEC' : 'INC'} ${RP[p]}` };
    if (z === 4) return { size: 1, mnemonic: `INC ${REG8[y]}` };
    if (z === 5) return { size: 1, mnemonic: `DEC ${REG8[y]}` };
    if (z === 6) return { size: 2, mnemonic: `LD ${REG8[y]}, ${hex(readU8(pc + 1), 2)}` };

    return {
      size: 1,
      mnemonic: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y],
    };
  }

  if (x === 1) {
    if (opcode === 0x76) return { size: 1, mnemonic: 'HALT' };
    return { size: 1, mnemonic: `LD ${REG8[y]}, ${REG8[z]}` };
  }

  if (x === 2) {
    return { size: 1, mnemonic: `${ALU[y]} ${REG8[z]}` };
  }

  if (z === 0) return { size: 1, mnemonic: `RET ${COND[y]}` };
  if (z === 1) {
    if (q === 0) return { size: 1, mnemonic: `POP ${RP2[p]}` };
    return { size: 1, mnemonic: ['RET', 'EXX', 'JP (HL)', 'LD SP, HL'][p] };
  }
  if (z === 2) {
    const target = readLE(pc + 1, addrBytes);
    return { size: 1 + addrBytes, mnemonic: `JP ${COND[y]}, ${hex(target, 6)}`, target };
  }
  if (z === 3) {
    if (y === 0) {
      const target = readLE(pc + 1, addrBytes);
      return { size: 1 + addrBytes, mnemonic: `JP ${hex(target, 6)}`, target };
    }
    if (y === 1) return { size: 1, mnemonic: 'CB prefix' };
    if (y === 2) return { size: 2, mnemonic: `OUT (${hex(readU8(pc + 1), 2)}), A` };
    if (y === 3) return { size: 2, mnemonic: `IN A, (${hex(readU8(pc + 1), 2)})` };
    if (y === 4) return { size: 1, mnemonic: 'EX (SP), HL' };
    if (y === 5) return { size: 1, mnemonic: 'EX DE, HL' };
    if (y === 6) return { size: 1, mnemonic: 'DI' };
    return { size: 1, mnemonic: 'EI' };
  }
  if (z === 4) {
    const target = readLE(pc + 1, addrBytes);
    return { size: 1 + addrBytes, mnemonic: `CALL ${COND[y]}, ${hex(target, 6)}`, target };
  }
  if (z === 5) {
    if (q === 0) return { size: 1, mnemonic: `PUSH ${RP2[p]}` };
    if (p === 0) {
      const target = readLE(pc + 1, addrBytes);
      return { size: 1 + addrBytes, mnemonic: `CALL ${hex(target, 6)}`, target };
    }
  }
  if (z === 6) return { size: 2, mnemonic: `${ALU[y]} ${hex(readU8(pc + 1), 2)}` };
  return { size: 1, mnemonic: `RST ${hex(y * 8, 2)}` };
}

function decodeIndexed(pc, prefixByte, addrBytes) {
  const indexReg = prefixByte === 0xDD ? 'IX' : 'IY';
  const opcode = readU8(pc + 1);

  if (opcode === 0xCB) {
    return decodeCb(pc, indexReg, readSigned8(pc + 2));
  }

  const displacementOpcodes = new Set([
    0x34, 0x35, 0x36, 0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x70, 0x71, 0x72,
    0x73, 0x74, 0x75, 0x77, 0x7E, 0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6,
    0xBE,
  ]);

  const innerPc = pc + 1;
  if (displacementOpcodes.has(opcode)) {
    const displacement = readSigned8(pc + 2);
    const decoded = decodeBase(innerPc, { addrBytes });
    return {
      size: decoded.size + 1,
      mnemonic: replaceIndexRegisters(decoded.mnemonic, indexReg, displacement),
      target: decoded.target,
    };
  }

  const decoded = decodeBase(innerPc, { addrBytes });
  return {
    size: decoded.size + 1,
    mnemonic: replaceIndexRegisters(decoded.mnemonic, indexReg),
    target: decoded.target,
  };
}

function decodeOne(pc, addrBytes = 3) {
  const opcode = readU8(pc);
  if (opcode === 0xDD || opcode === 0xFD) {
    return decodeIndexed(pc, opcode, addrBytes);
  }
  return decodeBase(pc, { addrBytes });
}

function disassembleRange(start, end) {
  console.log(`=== Raw ROM disassembly ${hex(start, 6)}..${hex(end, 6)} (ADL, 24-bit immediates) ===`);

  let pc = start;
  while (pc <= end) {
    const decoded = decodeOne(pc, 3);
    const size = Math.max(1, decoded.size);
    const marker = decoded.target === KEY_PROCESSOR ? '  <-- direct target 0x03FA09' : '';
    console.log(`${hex(pc, 6)}  ${formatBytes(pc, size)}  ${decoded.mnemonic}${marker}`);
    pc += size;
  }

  console.log('');
  console.log(`=== Sliding direct CALL/JP scan for ${hex(KEY_PROCESSOR, 6)} ===`);
  let found = false;
  for (let addr = start; addr <= end - 3; addr += 1) {
    const branch = branchTargetInstruction(readU8(addr));
    if (!branch) continue;
    const target = readLE(addr + 1, 3);
    if (target !== KEY_PROCESSOR) continue;
    found = true;
    console.log(`${hex(addr, 6)}  ${formatBytes(addr, 4)}  ${branch.mnemonic} ${hex(target, 6)}`);
  }
  if (!found) {
    console.log(`No direct ADL CALL/JP byte pattern to ${hex(KEY_PROCESSOR, 6)} was found in this range.`);
  }
  console.log('');
}

function createBus() {
  const candidates = [
    () => createPeripheralBus({ mem, memory: mem }),
    () => createPeripheralBus(mem),
    () => createPeripheralBus(mem, {}),
  ];
  const errors = [];

  for (const candidate of candidates) {
    try {
      const bus = candidate();
      if (bus) return bus;
    } catch (error) {
      errors.push(error);
    }
  }

  throw new Error(`Unable to create peripheral bus: ${errors.map((error) => error.message).join(' | ')}`);
}

function getBlocks(module) {
  return module.blocks ?? module.BLOCKS ?? module.default?.blocks ?? module.default ?? module;
}

function createProbeExecutor(peripheralBus) {
  const blocks = getBlocks(romModule);
  const options = {
    mem,
    memory: mem,
    bus: peripheralBus,
    peripheralBus,
    onBlock,
    timerInterrupt: true,
    timerInterval: 500,
    diHaltBypass: true,
  };

  const candidates = [
    () => createExecutor({ blocks, romModule, module: romModule, ...options }),
    () => createExecutor(blocks, options),
    () => createExecutor(romModule, options),
    () => createExecutor(romModule, mem, peripheralBus, options),
    () => createExecutor(blocks, mem, peripheralBus, options),
  ];
  const errors = [];

  for (const candidate of candidates) {
    try {
      const executor = candidate();
      if (executor && typeof executor.runFrom === 'function') return executor;
      errors.push(new Error('candidate did not return an executor with runFrom'));
    } catch (error) {
      errors.push(error);
    }
  }

  throw new Error(`Unable to create executor: ${errors.map((error) => error.message).join(' | ')}`);
}

function extractBlockPc(args) {
  for (const arg of args) {
    if (typeof arg === 'number') return arg & 0xFFFFFF;
    if (!arg || typeof arg !== 'object') continue;
    for (const key of ['pc', 'addr', 'address', 'start', 'entry', 'blockPc']) {
      if (typeof arg[key] === 'number') return arg[key] & 0xFFFFFF;
    }
    if (arg.block && typeof arg.block === 'object') {
      for (const key of ['pc', 'addr', 'address', 'start', 'entry']) {
        if (typeof arg.block[key] === 'number') return arg.block[key] & 0xFFFFFF;
      }
    }
  }

  if (cpu && typeof cpu.pc === 'number') return cpu.pc & 0xFFFFFF;
  return null;
}

function onBlock(...args) {
  if (!traceEnabled) return;

  const pc = extractBlockPc(args);
  blockTrace.push({
    index: blockTrace.length,
    pc,
    sp: typeof cpu?.sp === 'number' ? cpu.sp & 0xFFFFFF : null,
    adl: typeof cpu?.adl === 'boolean' ? cpu.adl : null,
    a: typeof cpu?.a === 'number' ? cpu.a & 0xFF : null,
    f: typeof cpu?.f === 'number' ? cpu.f & 0xFF : null,
  });

  if (blockTrace.length >= TRACE_LIMIT) {
    throw traceLimitReached;
  }
}

function runBootSequence(executor) {
  const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  cpu.mbase = 0xD0; cpu._iy = 0xD00080;
  const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

  return { bootResult, kernelResult, postInitResult };
}

function write24(addr, value) {
  mem[addr & 0xFFFFFF] = value & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (value >> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (value >> 16) & 0xFF;
}

function seedTightLoopState() {
  mem[0xD00587] = 0x09;
  mem[0xD00080] |= 0x08;
  mem[0xD14091] = 0x01;
  mem[0xD00824] = 0x48;
  mem[0xD177B7] = 0x00;
  mem[0xD177BA] = 0x7F;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 3;
  write24(cpu.sp, EVENT_LOOP_HEAD);
}

function summarizeRunResult(result) {
  if (result === undefined) return 'undefined';
  if (result === null) return 'null';
  if (typeof result !== 'object') return String(result);

  const keys = ['steps', 'blocks', 'pc', 'halted', 'reason', 'loopIterations', 'maxLoopIterationsHit'];
  const parts = [];
  for (const key of keys) {
    if (key in result) parts.push(`${key}=${result[key]}`);
  }
  return parts.length ? parts.join(' ') : JSON.stringify(result);
}

function printTrace() {
  console.log('');
  console.log(`=== First ${blockTrace.length} block PCs from ${hex(EVENT_LOOP_HEAD, 6)} ===`);
  for (const entry of blockTrace) {
    const fields = [
      `#${String(entry.index).padStart(3, '0')}`,
      `pc=${entry.pc === null ? 'unknown' : hex(entry.pc, 6)}`,
      `sp=${entry.sp === null ? 'unknown' : hex(entry.sp, 6)}`,
    ];
    if (entry.adl !== null) fields.push(`adl=${entry.adl ? 1 : 0}`);
    if (entry.a !== null) fields.push(`a=${hex(entry.a, 2)}`);
    if (entry.f !== null) fields.push(`f=${hex(entry.f, 2)}`);
    console.log(fields.join('  '));
  }
}

function splitIterations() {
  const starts = [];
  for (let i = 0; i < blockTrace.length; i += 1) {
    if (blockTrace[i].pc === EVENT_LOOP_HEAD) starts.push(i);
  }

  if (starts.length < 2) return [];

  return starts.slice(0, 2).map((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : blockTrace.length;
    return blockTrace.slice(start, end);
  });
}

function printIterationTrace(iterations) {
  console.log('');
  console.log('=== Iteration traces ===');

  if (iterations.length < 2) {
    console.log(`Only ${iterations.length} iteration(s) starting at ${hex(EVENT_LOOP_HEAD, 6)} were captured.`);
    console.log(`Captured ${hex(LOOP_RET, 6)} count: ${blockTrace.filter((entry) => entry.pc === LOOP_RET).length}`);
    console.log(`Captured ${hex(MAIN_HANDLER, 6)} count: ${blockTrace.filter((entry) => entry.pc === MAIN_HANDLER).length}`);
    console.log(`Captured ${hex(KEY_PROCESSOR, 6)} count: ${blockTrace.filter((entry) => entry.pc === KEY_PROCESSOR).length}`);
    return;
  }

  iterations.forEach((iteration, index) => {
    console.log(`Iteration ${index + 1}:`);
    for (const entry of iteration) {
      console.log(`  #${String(entry.index).padStart(3, '0')} ${entry.pc === null ? 'unknown' : hex(entry.pc, 6)}`);
    }
  });
}

function printTransitionSummary() {
  const transitions = new Map();
  for (let i = 1; i < blockTrace.length; i += 1) {
    const from = blockTrace[i - 1].pc;
    const to = blockTrace[i].pc;
    const key = `${from ?? 'unknown'}>${to ?? 'unknown'}`;
    transitions.set(key, { from, to, count: (transitions.get(key)?.count ?? 0) + 1 });
  }

  console.log('');
  console.log('=== Transition hits involving tight-loop PCs ===');
  const interesting = [...transitions.values()].filter(({ from, to }) => (
    from === EVENT_LOOP_HEAD || from === MAIN_HANDLER || from === KEY_PROCESSOR ||
    to === EVENT_LOOP_HEAD || to === MAIN_HANDLER || to === KEY_PROCESSOR || to === LOOP_RET
  ));

  if (!interesting.length) {
    console.log('No transitions involving the watched PCs were captured.');
    return;
  }

  interesting
    .sort((a, b) => b.count - a.count)
    .forEach(({ from, to, count }) => {
      console.log(`${from === null ? 'unknown' : hex(from, 6)} -> ${to === null ? 'unknown' : hex(to, 6)} : ${count}`);
    });
}

function printDivergenceAnalysis(iterations) {
  console.log('');
  console.log('=== Iteration divergence analysis ===');

  if (iterations.length < 2) {
    console.log(`Cannot compare iterations: fewer than two ${hex(EVENT_LOOP_HEAD, 6)} entries were captured.`);
    return;
  }

  const first = iterations[0];
  const second = iterations[1];
  const limit = Math.min(first.length, second.length);
  let divergence = -1;
  for (let i = 0; i < limit; i += 1) {
    if (first[i].pc !== second[i].pc) {
      divergence = i;
      break;
    }
  }

  const firstRet = first.find((entry) => entry.pc === LOOP_RET);
  const secondRet = second.find((entry) => entry.pc === LOOP_RET);
  console.log(`Iteration 1 length before next head: ${first.length}; reaches ${hex(LOOP_RET, 6)}: ${firstRet ? `yes at #${firstRet.index}` : 'no'}`);
  console.log(`Iteration 2 captured length: ${second.length}; reaches ${hex(LOOP_RET, 6)}: ${secondRet ? `yes at #${secondRet.index}` : 'no'}`);

  if (divergence >= 0) {
    console.log(`First divergent block offset: ${divergence}`);
    console.log(`  iteration 1 #${first[divergence].index}: ${hex(first[divergence].pc, 6)}`);
    console.log(`  iteration 2 #${second[divergence].index}: ${hex(second[divergence].pc, 6)}`);
    return;
  }

  if (first.length !== second.length) {
    console.log(`The common prefix is identical for ${limit} block(s); lengths differ after that.`);
    if (second.length > first.length) {
      const extra = second.slice(first.length, Math.min(second.length, first.length + 16));
      console.log(`Iteration 2 extra prefix: ${extra.map((entry) => hex(entry.pc, 6)).join(' ')}`);
    }
    return;
  }

  console.log(`No divergence was observed within the captured ${limit} block(s).`);
}

disassembleRange(DISASM_START, DISASM_END);

const peripheralBus = createBus();
const executor = createProbeExecutor(peripheralBus);
cpu = executor.cpu ?? executor.state?.cpu ?? executor.context?.cpu;

if (!cpu) {
  throw new Error('Executor did not expose cpu as executor.cpu, executor.state.cpu, or executor.context.cpu');
}

console.log('=== Boot ===');
const bootResults = runBootSequence(executor);
console.log(`bootResult: ${summarizeRunResult(bootResults.bootResult)}`);
console.log(`kernelResult: ${summarizeRunResult(bootResults.kernelResult)}`);
console.log(`postInitResult: ${summarizeRunResult(bootResults.postInitResult)}`);

seedTightLoopState();
console.log('');
console.log('=== Seeded state ===');
console.log(`D00587=${hex(mem[0xD00587], 2)} D00080=${hex(mem[0xD00080], 2)} D14091=${hex(mem[0xD14091], 2)} D00824=${hex(mem[0xD00824], 2)}`);
console.log(`D177B7=${hex(mem[0xD177B7], 2)} D177BA=${hex(mem[0xD177BA], 2)} SP=${hex(cpu.sp, 6)} stackRet=${hex(readLEFromMem(cpu.sp, 3), 6)}`);

traceEnabled = true;
let loopResult = null;
let stoppedByTraceLimit = false;
try {
  loopResult = executor.runFrom(EVENT_LOOP_HEAD, 'adl', {
    maxSteps: 1000000,
    maxLoopIterations: 100000,
    timerInterrupt: true,
    timerInterval: 500,
    diHaltBypass: true,
  });
} catch (error) {
  if (error !== traceLimitReached) throw error;
  stoppedByTraceLimit = true;
}
traceEnabled = false;

console.log('');
console.log('=== Tight-loop run result ===');
console.log(stoppedByTraceLimit ? `Stopped after collecting ${TRACE_LIMIT} block callbacks.` : summarizeRunResult(loopResult));

printTrace();
const iterations = splitIterations();
printIterationTrace(iterations);
printTransitionSummary();
printDivergenceAnalysis(iterations);

function readLEFromMem(addr, size) {
  let value = 0;
  for (let i = 0; i < size; i += 1) {
    value |= mem[(addr + i) & 0xFFFFFF] << (8 * i);
  }
  return value >>> 0;
}

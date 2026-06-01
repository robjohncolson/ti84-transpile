import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = `${TRANSPILED_PATH}.gz`;

const OUT_LOCATIONS = [0x03F455, 0x0A5C79, 0x0A657F];
const CURSOR_CASES = [
  { name: 'cursor row=0 col=0', row: 0, col: 0 },
  { name: 'cursor row=5 col=13', row: 5, col: 13 },
];

const D00595 = 0xD00595;
const D00596 = 0xD00596;
const LCD_PORT_START = 0x4000;
const LCD_PORT_END = 0x4020;
const DISASM_RADIUS = 128;
const CALL_STEP_LIMIT = 60000;
const BOOT_STEPS = 40000;

const BOOT_STAGES = [
  { label: 'boot stage 1', start: 0x0802B2, intercepts: [0x08C331], maxSteps: 700000 },
  { label: 'boot stage 2', start: 0x08C331, intercepts: [0x08BF22], maxSteps: 300000 },
  { label: 'boot stage 3', start: 0x08BF22, intercepts: [0x003A73, 0x030173], maxSteps: 500000 },
];

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function hexPort(value) {
  return hex(value & 0xFFFF, 4);
}

function read24(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)) >>> 0;
}

function bytesAt(bytes, offset, length) {
  return Array.from(bytes.subarray(offset, offset + length), hexByte).join(' ');
}

function upperReg(value) {
  return String(value).toUpperCase();
}

function formatInstruction(ins) {
  switch (ins.tag) {
    case 'db':
      return `DB ${hexByte(ins.byte)} (${ins.error})`;
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'ret':
      return 'RET';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'ret-conditional':
      return `RET ${String(ins.condition).toUpperCase()}`;
    case 'call':
      return `CALL ${hex(ins.target)}`;
    case 'call-conditional':
      return `CALL ${String(ins.condition).toUpperCase()},${hex(ins.target)}`;
    case 'jp':
      return `JP ${hex(ins.target)}`;
    case 'jp-conditional':
      return `JP ${String(ins.condition).toUpperCase()},${hex(ins.target)}`;
    case 'jp-indirect':
      return `JP (${upperReg(ins.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(ins.target)}`;
    case 'jr-conditional':
      return `JR ${String(ins.condition).toUpperCase()},${hex(ins.target)}`;
    case 'djnz':
      return `DJNZ ${hex(ins.target)}`;
    case 'ld-pair-imm':
      return `LD ${upperReg(ins.pair)},${hex(ins.value, ins.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-reg-imm':
      return `LD ${upperReg(ins.dest)},${hexByte(ins.value)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hexByte(ins.value)}`;
    case 'ld-reg-reg':
      return `LD ${upperReg(ins.dest)},${upperReg(ins.src)}`;
    case 'ld-reg-mem':
      return `LD ${upperReg(ins.dest)},(${hex(ins.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(ins.addr)}),${upperReg(ins.src)}`;
    case 'ld-pair-mem':
      if (ins.direction === 'to-mem') return `LD (${hex(ins.addr)}),${upperReg(ins.pair)}`;
      return `LD ${upperReg(ins.pair)},(${hex(ins.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(ins.addr)}),${upperReg(ins.pair)}`;
    case 'ld-reg-ind':
      return `LD ${upperReg(ins.dest)},(${upperReg(ins.src)})`;
    case 'ld-ind-reg':
      return `LD (${upperReg(ins.dest)}),${upperReg(ins.src)}`;
    case 'ld-reg-ixd':
      return `LD ${upperReg(ins.dest)},(${upperReg(ins.indexRegister)}${ins.displacement >= 0 ? '+' : ''}${ins.displacement})`;
    case 'ld-ixd-reg':
      return `LD (${upperReg(ins.indexRegister)}${ins.displacement >= 0 ? '+' : ''}${ins.displacement}),${upperReg(ins.src)}`;
    case 'ld-ixd-imm':
      return `LD (${upperReg(ins.indexRegister)}${ins.displacement >= 0 ? '+' : ''}${ins.displacement}),${hexByte(ins.value)}`;
    case 'inc-reg':
      return `INC ${upperReg(ins.reg)}`;
    case 'dec-reg':
      return `DEC ${upperReg(ins.reg)}`;
    case 'inc-pair':
      return `INC ${upperReg(ins.pair)}`;
    case 'dec-pair':
      return `DEC ${upperReg(ins.pair)}`;
    case 'add-pair':
      return `ADD ${upperReg(ins.dest)},${upperReg(ins.src)}`;
    case 'alu-reg':
      return `${String(ins.op).toUpperCase()} ${upperReg(ins.src)}`;
    case 'alu-imm':
      return `${String(ins.op).toUpperCase()} ${hexByte(ins.value)}`;
    case 'out-reg':
      return `OUT (C),${upperReg(ins.reg)}`;
    case 'out-imm':
      return `OUT (${hexByte(ins.port)}),A`;
    case 'out0':
      return `OUT0 (${hexByte(ins.port)}),${upperReg(ins.reg)}`;
    case 'in-reg':
      return `IN ${upperReg(ins.reg)},(C)`;
    case 'in-imm':
      return `IN A,(${hexByte(ins.port)})`;
    case 'in0':
      return `IN0 ${upperReg(ins.reg)},(${hexByte(ins.port)})`;
    case 'outi':
      return 'OUTI';
    case 'outd':
      return 'OUTD';
    case 'otir':
      return 'OTIR';
    case 'otdr':
      return 'OTDR';
    case 'otimr':
      return 'OTIMR';
    case 'push':
      return `PUSH ${upperReg(ins.pair)}`;
    case 'pop':
      return `POP ${upperReg(ins.pair)}`;
    case 'exx':
      return 'EXX';
    case 'ex-af':
      return "EX AF,AF'";
    case 'ex-de-hl':
      return 'EX DE,HL';
    case 'ld-sp-hl':
      return 'LD SP,HL';
    case 'ld-sp-pair':
      return `LD SP,${upperReg(ins.pair)}`;
    case 'bit-test':
      return `BIT ${ins.bit},${upperReg(ins.reg)}`;
    case 'bit-test-ind':
      return `BIT ${ins.bit},(${upperReg(ins.indirectRegister)})`;
    case 'bit-set':
      return `SET ${ins.bit},${upperReg(ins.reg)}`;
    case 'bit-res':
      return `RES ${ins.bit},${upperReg(ins.reg)}`;
    case 'rotate-reg':
      return `${String(ins.op).toUpperCase()} ${upperReg(ins.reg)}`;
    case 'rotate-ind':
      return `${String(ins.op).toUpperCase()} (${upperReg(ins.indirectRegister)})`;
    default: {
      const fields = Object.entries(ins)
        .filter(([key]) => !['pc', 'nextPc', 'length', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(key))
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : JSON.stringify(value)}`);
      return `${ins.tag} ${fields.join(' ')}`.trim();
    }
  }
}

function safeDecodeAt(pc) {
  try {
    const ins = decodeInstruction(romBytes, pc, 'adl');
    const length = Math.max(1, Number(ins.length ?? (ins.nextPc - pc)) || 1);
    return { ...ins, length };
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      byte: romBytes[pc] ?? 0,
      error: String(error?.message ?? error).split('\n')[0],
    };
  }
}

function decodeRange(start, end) {
  const instructions = [];
  let pc = Math.max(0, start);
  const stop = Math.min(romBytes.length, end);
  while (pc < stop) {
    const ins = safeDecodeAt(pc);
    const length = Math.max(1, Math.min(ins.length, stop - pc));
    instructions.push({ ...ins, length, nextPc: pc + length });
    pc += length;
  }
  return instructions;
}

function printDisassembly(address, entryInfo) {
  const start = Math.max(0, address - DISASM_RADIUS);
  const end = Math.min(romBytes.length, address + DISASM_RADIUS);
  const target = safeDecodeAt(address);
  const instructions = decodeRange(start, end);

  console.log(`\n=== OUT site ${hex(address)} ===`);
  console.log(`Function entry guess: ${hex(entryInfo.entry)} (${entryInfo.reason})`);
  if (entryInfo.runtimeEntry !== entryInfo.entry) {
    console.log(`Runtime entry fallback: ${hex(entryInfo.runtimeEntry)} (${entryInfo.runtimeReason})`);
  }
  console.log(`Target decode: ${hex(address)}  ${bytesAt(romBytes, address, target.length).padEnd(17)} ${formatInstruction(target)}`);
  console.log(`Disassembly window: ${hex(start)}..${hex(end - 1)} (+/-${DISASM_RADIUS} bytes)`);

  let marked = false;
  for (const ins of instructions) {
    const marker = ins.pc <= address && address < ins.nextPc ? '  <== target OUT' : '';
    if (marker) marked = true;
    console.log(`${hex(ins.pc)}  ${bytesAt(romBytes, ins.pc, ins.length).padEnd(17)} ${formatInstruction(ins)}${marker}`);
  }
  if (!marked) {
    console.log(`  note: linear decode from ${hex(start)} did not align on ${hex(address)}; target decode above is authoritative.`);
  }
}

function findAddressLiterals(start, end, address) {
  const hits = [];
  const b0 = address & 0xFF;
  const b1 = (address >>> 8) & 0xFF;
  const b2 = (address >>> 16) & 0xFF;
  for (let offset = Math.max(0, start); offset <= Math.min(romBytes.length - 3, end - 3); offset += 1) {
    if (romBytes[offset] === b0 && romBytes[offset + 1] === b1 && romBytes[offset + 2] === b2) {
      hits.push(offset);
    }
  }
  return hits;
}

function cursorAddressLabel(addr) {
  if (addr === D00595 || addr === 0x0595) return 'D00595 cursor row';
  if (addr === D00596 || addr === 0x0596) return 'D00596 cursor column';
  return null;
}

function scanCursorReferences(address, entryInfo) {
  const start = Math.max(0, Math.min(entryInfo.entry, address - DISASM_RADIUS));
  const end = Math.min(romBytes.length, address + DISASM_RADIUS);
  const instructions = decodeRange(start, end);
  const decodedRefs = [];

  for (const ins of instructions) {
    const label = cursorAddressLabel(ins.addr);
    if (!label) continue;
    const readLike = ['ld-reg-mem', 'ld-pair-mem'].includes(ins.tag) && ins.direction !== 'to-mem';
    decodedRefs.push({ pc: ins.pc, label, readLike, text: formatInstruction(ins) });
  }

  return {
    decodedRefs,
    rawRowLiterals: findAddressLiterals(start, end, D00595),
    rawColLiterals: findAddressLiterals(start, end, D00596),
  };
}

function formatCursorStaticRefs(refs) {
  const parts = [];
  if (refs.decodedRefs.length > 0) {
    parts.push(refs.decodedRefs.map((ref) => `${ref.label} at ${hex(ref.pc)} (${ref.readLike ? 'read' : 'ref'}: ${ref.text})`).join('; '));
  }
  if (refs.rawRowLiterals.length > 0) {
    parts.push(`raw D00595 literal bytes at ${refs.rawRowLiterals.map((offset) => hex(offset)).join(', ')}`);
  }
  if (refs.rawColLiterals.length > 0) {
    parts.push(`raw D00596 literal bytes at ${refs.rawColLiterals.map((offset) => hex(offset)).join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'none in +/-128/function-entry window';
}

function parseBlockAddress(key) {
  const match = /^([0-9a-f]{6}):(adl|z80|sis|lis|sil|lil)$/i.exec(String(key));
  return match ? Number.parseInt(match[1], 16) : null;
}

function looksLikeBlockMap(value) {
  if (!value || typeof value !== 'object') return false;
  const keys = Object.keys(value).slice(0, 200);
  return keys.some((key) => parseBlockAddress(key) !== null && value[key] && typeof value[key].source === 'string');
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return { available: true, created: false, path: TRANSPILED_PATH };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    return { available: false, created: false, path: TRANSPILED_PATH };
  }
  const decompressed = zlib.gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH));
  fs.writeFileSync(TRANSPILED_PATH, decompressed);
  return { available: true, created: true, path: TRANSPILED_PATH };
}

async function loadTranspiledBlocks() {
  const status = ensureTranspiledRom();
  if (!status.available) return { status, blocks: null };

  const mod = await import(pathToFileURL(TRANSPILED_PATH).href);
  const candidates = [
    mod.blocks,
    mod.romBlocks,
    mod.ROM_BLOCKS,
    mod.transpiledBlocks,
    mod.default,
    mod.default?.blocks,
    mod.default?.romBlocks,
    mod,
  ];

  for (const candidate of candidates) {
    if (looksLikeBlockMap(candidate)) return { status, blocks: candidate };
  }
  return { status, blocks: null };
}

function nearestBlockStart(blocks, address, maxBack = 512) {
  if (!blocks) return null;
  let best = null;
  for (const key of Object.keys(blocks)) {
    if (!key.toLowerCase().endsWith(':adl')) continue;
    const blockAddress = parseBlockAddress(key);
    if (blockAddress === null) continue;
    if (blockAddress > address) continue;
    if (address - blockAddress > maxBack) continue;
    if (best === null || blockAddress > best) best = blockAddress;
  }
  return best;
}

function findCallTargetsNear(address) {
  const callOps = new Set([0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);
  const minTarget = Math.max(0, address - 512);
  const hits = [];
  for (let offset = 0; offset <= romBytes.length - 4; offset += 1) {
    if (!callOps.has(romBytes[offset])) continue;
    const target = read24(romBytes, offset + 1);
    if (target >= minTarget && target <= address) hits.push({ source: offset, target });
  }
  hits.sort((a, b) => (address - a.target) - (address - b.target));
  return hits;
}

function getEntryInfo(address, blocks) {
  const callTargets = findCallTargetsNear(address);
  const blockStart = nearestBlockStart(blocks, address);
  const entry = callTargets[0]?.target ?? blockStart ?? address;
  const reason = callTargets[0]
    ? `nearest direct CALL target from ${hex(callTargets[0].source)}`
    : blockStart !== null
      ? 'nearest transpiled ADL block start'
      : 'fallback to OUT instruction address';

  let runtimeEntry = entry;
  let runtimeReason = reason;
  if (blocks && !blocks[`${entry.toString(16).padStart(6, '0')}:adl`]) {
    const runtimeBlock = nearestBlockStart(blocks, address);
    if (runtimeBlock !== null) {
      runtimeEntry = runtimeBlock;
      runtimeReason = 'nearest runnable transpiled ADL block start';
    }
  }

  return {
    entry,
    reason,
    runtimeEntry,
    runtimeReason,
    callTargets: callTargets.slice(0, 5),
  };
}

function staticPortInference(address, entry) {
  const start = Math.max(0, Math.min(entry, address - 96));
  const instructions = decodeRange(start, address + 8);
  const regs = new Map();

  function setReg(reg, value) {
    regs.set(reg, value === null ? null : value & 0xFF);
    if (reg === 'b' || reg === 'c') {
      const b = regs.get('b');
      const c = regs.get('c');
      regs.set('bc', b === null || c === null || b === undefined || c === undefined ? null : ((b << 8) | c));
    }
  }

  function setPair(pair, value) {
    if (pair !== 'bc') {
      regs.set(pair, value === null ? null : value & 0xFFFFFF);
      return;
    }
    if (value === null) {
      regs.set('bc', null);
      regs.set('b', null);
      regs.set('c', null);
      return;
    }
    const normalized = value & 0xFFFFFF;
    regs.set('bc', normalized & 0xFFFF);
    regs.set('b', (normalized >>> 8) & 0xFF);
    regs.set('c', normalized & 0xFF);
  }

  for (const ins of instructions) {
    if (ins.pc === address) {
      const c = regs.get('c');
      const bc = regs.get('bc');
      return {
        outInstruction: ins,
        c,
        port16: bc,
        confidence: 'linear decode into OUT',
      };
    }
    if (ins.pc > address || (ins.pc < address && ins.nextPc > address)) break;

    switch (ins.tag) {
      case 'ld-pair-imm':
        setPair(ins.pair, ins.value);
        break;
      case 'ld-pair-mem':
        setPair(ins.pair, null);
        break;
      case 'ld-reg-imm':
        setReg(ins.dest, ins.value);
        break;
      case 'ld-reg-reg':
        setReg(ins.dest, regs.has(ins.src) ? regs.get(ins.src) : null);
        break;
      case 'ld-reg-mem':
      case 'ld-reg-ind':
      case 'ld-reg-ixd':
        setReg(ins.dest, null);
        break;
      case 'inc-reg':
        if (regs.has(ins.reg) && regs.get(ins.reg) !== null) setReg(ins.reg, regs.get(ins.reg) + 1);
        else setReg(ins.reg, null);
        break;
      case 'dec-reg':
        if (regs.has(ins.reg) && regs.get(ins.reg) !== null) setReg(ins.reg, regs.get(ins.reg) - 1);
        else setReg(ins.reg, null);
        break;
      case 'inc-pair':
        if (ins.pair === 'bc' && regs.get('bc') !== null && regs.get('bc') !== undefined) setPair('bc', regs.get('bc') + 1);
        else setPair(ins.pair, null);
        break;
      case 'dec-pair':
        if (ins.pair === 'bc' && regs.get('bc') !== null && regs.get('bc') !== undefined) setPair('bc', regs.get('bc') - 1);
        else setPair(ins.pair, null);
        break;
      case 'alu-reg':
      case 'alu-imm':
        setReg('a', null);
        break;
      default:
        break;
    }
  }

  const target = safeDecodeAt(address);
  return {
    outInstruction: target,
    c: regs.get('c'),
    port16: regs.get('bc'),
    confidence: 'target decode only; prior linear decode did not align exactly',
  };
}

function isByteArray(value) {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray || Buffer.isBuffer(value);
}

function findByteArrays(root) {
  if (!root || typeof root !== 'object') return [];
  const arrays = [];
  const seen = new Set();
  const queue = [root];
  while (queue.length > 0 && arrays.length < 32) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (isByteArray(current)) {
      arrays.push(current);
      continue;
    }
    for (const name of ['memory', 'mem', 'ram', 'rom', 'bytes', 'data']) {
      try {
        const value = current[name];
        if (isByteArray(value)) arrays.push(value);
        else if (value && typeof value === 'object') queue.push(value);
      } catch {
        // Ignore probing failures.
      }
    }
  }
  return [...new Set(arrays)];
}

function candidateOffsetsForArray(array, address) {
  const addr = address >>> 0;
  return [...new Set([addr, addr & 0xFFFFFF, addr - 0xD00000, addr & (array.length - 1)])]
    .filter((offset) => Number.isInteger(offset) && offset >= 0 && offset < array.length);
}

function writeByte(cpu, address, value) {
  if (typeof cpu.write8 === 'function') {
    cpu.write8(address >>> 0, value & 0xFF);
    return;
  }
  if (typeof cpu.writeByte === 'function') {
    cpu.writeByte(address >>> 0, value & 0xFF);
    return;
  }
  for (const array of findByteArrays(cpu)) {
    for (const offset of candidateOffsetsForArray(array, address)) {
      array[offset] = value & 0xFF;
      return;
    }
  }
  throw new Error(`Unable to write byte at ${hex(address)}`);
}

function write24(cpu, address, value) {
  writeByte(cpu, address, value & 0xFF);
  writeByte(cpu, address + 1, (value >>> 8) & 0xFF);
  writeByte(cpu, address + 2, (value >>> 16) & 0xFF);
}

function setRegister(cpu, names, value) {
  const roots = [cpu, cpu?.regs, cpu?.registers, cpu?.state, cpu?.r, cpu?.reg].filter(Boolean);
  for (const root of roots) {
    for (const name of names) {
      if (!(name in root)) continue;
      try {
        root[name] = value >>> 0;
        return true;
      } catch {
        // Try the next register slot.
      }
    }
  }
  return false;
}

function getRegister(cpu, names) {
  const roots = [cpu, cpu?.regs, cpu?.registers, cpu?.state, cpu?.r, cpu?.reg].filter(Boolean);
  for (const root of roots) {
    for (const name of names) {
      const value = root[name];
      if (Number.isFinite(value)) return value >>> 0;
    }
  }
  return null;
}

function stepCPU(cpu) {
  for (const name of ['step', 'executeInstruction', 'runInstruction', 'tick', 'executeOne']) {
    if (typeof cpu[name] === 'function') return cpu[name]();
  }
  throw new Error('CPU exposes no step-like method');
}

function tryLoadRom(cpu, peripherals) {
  const targets = [cpu, cpu?.memory, cpu?.mem, cpu?.mmu, peripherals].filter(Boolean);
  for (const target of targets) {
    for (const name of ['loadROM', 'loadRom', 'load', 'loadImage', 'setROM', 'setRom']) {
      if (typeof target[name] !== 'function') continue;
      try {
        target[name](romBytes);
        return;
      } catch {
        // Try the next loader shape.
      }
    }
  }
  for (const array of findByteArrays(cpu)) {
    if (array.length >= romBytes.length) {
      array.set(romBytes, 0);
      return;
    }
  }
}

function createCpuStepMachine() {
  const createCPU = cpuRuntime.createCPU ?? cpuRuntime.createCpu;
  if (typeof createCPU !== 'function') throw new Error('createCPU export is unavailable');
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const attempts = [
    () => createCPU({ rom: romBytes, romBytes, peripherals, bus: peripherals }),
    () => createCPU(romBytes, peripherals),
    () => createCPU(romBytes, { peripherals, bus: peripherals }),
    () => createCPU(peripherals, romBytes),
    () => createCPU({ peripherals, bus: peripherals }),
    () => createCPU(),
  ];
  let lastError;
  for (const attempt of attempts) {
    try {
      const result = attempt();
      const cpu = result?.cpu ?? result;
      if (!cpu) continue;
      tryLoadRom(cpu, peripherals);
      return { kind: 'cpu-step', cpu, peripherals };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Unable to create CPU');
}

function createExecutorMachine(blocks) {
  if (typeof cpuRuntime.createExecutor !== 'function') {
    throw new Error('createExecutor export is unavailable');
  }
  if (!blocks) throw new Error('ROM.transpiled.js blocks are unavailable');
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const memory = new Uint8Array(0x1000000);
  memory.set(romBytes.subarray(0, Math.min(romBytes.length, memory.length)), 0);
  const executor = cpuRuntime.createExecutor(blocks, memory, { peripherals, trackMemoryMapped: true });
  return { kind: 'executor', cpu: executor.cpu, peripherals, executor, memory };
}

function createMachine(blocks) {
  if (typeof cpuRuntime.createExecutor === 'function' && blocks) return createExecutorMachine(blocks);
  return createCpuStepMachine();
}

class InterceptSignal extends Error {
  constructor(type, pc, mode, steps) {
    super(type);
    this.type = type;
    this.pc = pc;
    this.mode = mode;
    this.steps = steps;
  }
}

function runExecutorUntil(executor, start, mode, options) {
  const interceptSet = new Set((options.intercepts ?? []).map((value) => value & 0xFFFFFF));
  try {
    const result = executor.runFrom(start, mode, {
      maxSteps: options.maxSteps,
      maxLoopIterations: 128,
      onBlock(pc, blockMode, meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;
        if (steps > 0 && interceptSet.has(normalizedPc)) {
          throw new InterceptSignal('intercept', normalizedPc, blockMode, steps);
        }
      },
      onMissingBlock(pc, blockMode, steps) {
        const normalizedPc = pc & 0xFFFFFF;
        if (interceptSet.has(normalizedPc)) {
          throw new InterceptSignal('intercept', normalizedPc, blockMode, steps);
        }
      },
    });
    return {
      label: options.label,
      steps: result.steps,
      pc: result.lastPc,
      mode: result.lastMode,
      hitIntercept: null,
      termination: result.termination,
      loopsForced: result.loopsForced,
    };
  } catch (error) {
    if (error instanceof InterceptSignal) {
      return {
        label: options.label,
        steps: error.steps,
        pc: error.pc,
        mode: error.mode,
        hitIntercept: error.pc,
        termination: error.type,
        loopsForced: null,
      };
    }
    throw error;
  }
}

function bootMachine(machine) {
  if (machine.kind === 'executor') {
    return BOOT_STAGES.map((stage) => runExecutorUntil(machine.executor, stage.start, 'adl', stage));
  }

  for (let i = 0; i < BOOT_STEPS; i += 1) {
    stepCPU(machine.cpu);
  }
  return [{ label: 'step boot', steps: BOOT_STEPS, pc: getRegister(machine.cpu, ['pc', 'PC', 'programCounter']), hitIntercept: null }];
}

function setupCursorState(cpu, row, col) {
  writeByte(cpu, 0xD00092, 0x16);
  writeByte(cpu, 0xD000C6, 0x01);
  writeByte(cpu, 0xD00080, 0x18);
  writeByte(cpu, D00595, row);
  writeByte(cpu, D00596, col);
  writeByte(cpu, 0xD0058B, 0x70);
  write24(cpu, 0xD0059C, 0xD40000);
  setRegister(cpu, ['mbase', 'MBASE', 'mb'], 0xD0);
  setRegister(cpu, ['iy', 'IY'], 0xD00080);
}

function currentPc(cpu) {
  return (getRegister(cpu, ['_currentBlockPc', 'pc', 'PC', 'programCounter']) ?? 0) & 0xFFFFFF;
}

function installIoRecorder(cpu, peripherals, operations) {
  const wrapped = [];

  function record(kind, port, value, source) {
    operations.push({
      kind,
      port: Number(port) & 0xFFFF,
      value: value === undefined ? null : Number(value) & 0xFF,
      pc: currentPc(cpu),
      source,
    });
  }

  if (typeof cpu._ioWrite === 'function') {
    const original = cpu._ioWrite;
    cpu._ioWrite = function wrappedIoWrite(port, value, ...rest) {
      record('write', port, value, 'cpu._ioWrite');
      return original.call(this, port, value, ...rest);
    };
    wrapped.push({ target: cpu, name: '_ioWrite', original });
  } else if (typeof peripherals.write === 'function') {
    const original = peripherals.write;
    peripherals.write = function wrappedPeripheralWrite(port, value, ...rest) {
      record('write', port, value, 'peripherals.write');
      return original.call(this, port, value, ...rest);
    };
    wrapped.push({ target: peripherals, name: 'write', original });
  }

  if (typeof cpu._ioRead === 'function') {
    const original = cpu._ioRead;
    cpu._ioRead = function wrappedIoRead(port, ...rest) {
      const value = original.call(this, port, ...rest);
      record('read', port, value, 'cpu._ioRead');
      return value;
    };
    wrapped.push({ target: cpu, name: '_ioRead', original });
  } else if (typeof peripherals.read === 'function') {
    const original = peripherals.read;
    peripherals.read = function wrappedPeripheralRead(port, ...rest) {
      const value = original.call(this, port, ...rest);
      record('read', port, value, 'peripherals.read');
      return value;
    };
    wrapped.push({ target: peripherals, name: 'read', original });
  }

  return () => {
    for (const { target, name, original } of wrapped.reverse()) {
      target[name] = original;
    }
  };
}

function installCursorReadRecorder(cpu, reads) {
  const wrapped = [];

  function cursorHit(address, width) {
    const start = address & 0xFFFFFF;
    const end = (start + width) & 0xFFFFFF;
    const rowHit = start <= D00595 && D00595 < start + width;
    const colHit = start <= D00596 && D00596 < start + width;
    if (!rowHit && !colHit) return;
    reads.push({
      address: start,
      width,
      rowHit,
      colHit,
      pc: currentPc(cpu),
      wraps: end < start,
    });
  }

  for (const [name, width] of [['read8', 1], ['read16', 2], ['read24', 3]]) {
    if (typeof cpu[name] !== 'function') continue;
    const original = cpu[name];
    cpu[name] = function wrappedRead(address, ...rest) {
      const value = original.call(this, address, ...rest);
      cursorHit(Number(address), width);
      return value;
    };
    wrapped.push({ target: cpu, name, original });
  }

  return () => {
    for (const { target, name, original } of wrapped.reverse()) {
      target[name] = original;
    }
  };
}

function ensureCallStack(cpu) {
  const currentSp = getRegister(cpu, ['sp', 'SP', 'stackPointer']);
  if (currentSp !== null && currentSp >= 0x400000) return currentSp & 0xFFFFFF;
  const fallbackSp = 0xD1FFF0;
  setRegister(cpu, ['sp', 'SP', 'stackPointer'], fallbackSp);
  return fallbackSp;
}

function runExecutorCall(machine, entry, outAddress) {
  const sentinel = 0x00FFEE;
  const sp = ensureCallStack(machine.cpu);
  write24(machine.cpu, sp, sentinel);

  try {
    const result = machine.executor.runFrom(entry, 'adl', {
      maxSteps: CALL_STEP_LIMIT,
      maxLoopIterations: 128,
      onBlock(pc, mode, meta, steps) {
        if ((pc & 0xFFFFFF) === sentinel) throw new InterceptSignal('return', pc & 0xFFFFFF, mode, steps);
      },
      onMissingBlock(pc, mode, steps) {
        if ((pc & 0xFFFFFF) === sentinel) throw new InterceptSignal('return', pc & 0xFFFFFF, mode, steps);
      },
    });
    return {
      mode: 'executor.runFrom',
      entry,
      returned: false,
      steps: result.steps,
      finalPc: result.lastPc,
      termination: result.termination,
      error: result.error?.message ?? null,
      outAddress,
    };
  } catch (error) {
    if (error instanceof InterceptSignal && error.type === 'return') {
      return {
        mode: 'executor.runFrom',
        entry,
        returned: true,
        steps: error.steps,
        finalPc: error.pc,
        termination: 'returned_to_sentinel',
        error: null,
        outAddress,
      };
    }
    throw error;
  }
}

function runStepCall(cpu, entry) {
  const sentinel = 0x00FFEE;
  const sp = ensureCallStack(cpu);
  write24(cpu, sp, sentinel);
  if (!setRegister(cpu, ['pc', 'PC', 'programCounter'], entry)) {
    throw new Error('Unable to set PC for direct call');
  }

  for (let steps = 0; steps < CALL_STEP_LIMIT; steps += 1) {
    stepCPU(cpu);
    const pc = getRegister(cpu, ['pc', 'PC', 'programCounter']);
    if (pc === sentinel) {
      return { mode: 'pc+stack-sentinel', entry, returned: true, steps: steps + 1, finalPc: pc, termination: 'returned_to_sentinel' };
    }
  }
  return { mode: 'pc+stack-sentinel', entry, returned: false, steps: CALL_STEP_LIMIT, finalPc: getRegister(cpu, ['pc', 'PC']), termination: 'max_steps' };
}

function runFunction(machine, entry, outAddress) {
  if (machine.kind === 'executor') return runExecutorCall(machine, entry, outAddress);
  return runStepCall(machine.cpu, entry);
}

function runCandidateCase(address, entryInfo, cursorCase, blocks) {
  const machine = createMachine(blocks);
  const boot = bootMachine(machine);
  setupCursorState(machine.cpu, cursorCase.row, cursorCase.col);

  const ioOps = [];
  const cursorReads = [];
  const restoreIo = installIoRecorder(machine.cpu, machine.peripherals, ioOps);
  const restoreCursorReads = installCursorReadRecorder(machine.cpu, cursorReads);
  let call;
  try {
    call = runFunction(machine, entryInfo.runtimeEntry, address);
  } finally {
    restoreCursorReads();
    restoreIo();
  }

  return {
    cursorCase,
    boot,
    call,
    ioOps,
    cursorReads,
    writes: ioOps.filter((op) => op.kind === 'write'),
    reads: ioOps.filter((op) => op.kind === 'read'),
  };
}

function isLcdPort(port) {
  return port >= LCD_PORT_START && port <= LCD_PORT_END;
}

function summarizePortOps(ops, limit = 12) {
  if (ops.length === 0) return 'none';
  const byPort = new Map();
  for (const op of ops) {
    const key = op.port;
    if (!byPort.has(key)) byPort.set(key, []);
    byPort.get(key).push(op.value);
  }
  const parts = [];
  for (const [port, values] of [...byPort.entries()].sort((a, b) => a[0] - b[0])) {
    const uniqueValues = [...new Set(values)].map((value) => hexByte(value));
    parts.push(`${hexPort(port)} <= ${uniqueValues.join(',')} (${values.length} writes)`);
    if (parts.length >= limit) break;
  }
  if (byPort.size > limit) parts.push(`... ${byPort.size - limit} more ports`);
  return parts.join('; ');
}

function formatIoSequence(ops, limit = 16) {
  if (ops.length === 0) return 'none';
  const shown = ops.slice(0, limit).map((op) => `${hex(op.pc)}:${hexPort(op.port)}<=${hexByte(op.value)}`);
  if (ops.length > limit) shown.push(`... ${ops.length - limit} more`);
  return shown.join(', ');
}

function formatCursorReads(reads) {
  if (reads.length === 0) return 'none';
  return reads.slice(0, 12).map((read) => {
    const vars = [read.rowHit ? 'D00595' : null, read.colHit ? 'D00596' : null].filter(Boolean).join('/');
    return `${vars} via ${hex(read.address)} width=${read.width} at pc=${hex(read.pc)}`;
  }).join('; ');
}

function writeSignature(result, lcdOnly = false) {
  return result.writes
    .filter((op) => !lcdOnly || isLcdPort(op.port))
    .map((op) => `${op.port}:${op.value}`)
    .join('|');
}

function printCaseResult(result) {
  const lcdWrites = result.writes.filter((op) => isLcdPort(op.port));
  const bootSummary = result.boot
    .map((stage) => `${stage.label}:${stage.hitIntercept === null ? stage.termination ?? 'done' : `hit ${hex(stage.hitIntercept)}`}@${hex(stage.pc ?? 0)}`)
    .join(', ');

  console.log(`\n  ${result.cursorCase.name}`);
  console.log(`    boot: ${bootSummary}`);
  console.log(`    call: mode=${result.call.mode}, entry=${hex(result.call.entry)}, returned=${result.call.returned}, steps=${result.call.steps}, finalPC=${hex(result.call.finalPc ?? 0)}, termination=${result.call.termination}`);
  console.log(`    I/O captured: writes=${result.writes.length}, reads=${result.reads.length}, LCD writes=${lcdWrites.length}`);
  console.log(`    ports written: ${summarizePortOps(result.writes)}`);
  console.log(`    LCD 0x4000-0x4020 writes: ${summarizePortOps(lcdWrites)}`);
  console.log(`    first write sequence: ${formatIoSequence(result.writes)}`);
  console.log(`    cursor RAM reads during call: ${formatCursorReads(result.cursorReads)}`);
}

function printDynamicConclusion(address, first, second) {
  const firstLcdWrites = first.writes.filter((op) => isLcdPort(op.port));
  const secondLcdWrites = second.writes.filter((op) => isLcdPort(op.port));
  const anyLcd = firstLcdWrites.length > 0 || secondLcdWrites.length > 0;
  const lcdChanged = writeSignature(first, true) !== writeSignature(second, true);
  const allChanged = writeSignature(first, false) !== writeSignature(second, false);
  const cursorRead = first.cursorReads.length > 0 || second.cursorReads.length > 0;

  if (anyLcd && lcdChanged) {
    console.log(`  Conclusion for ${hex(address)}: HARDWARE CURSOR PATH - LCD controller port writes changed with D00595/D00596.`);
    return;
  }
  if (anyLcd) {
    console.log(`  Conclusion for ${hex(address)}: NOT CURSOR RELATED - LCD controller ports were written, but values did not change with cursor position.`);
    return;
  }
  if (allChanged) {
    console.log(`  Conclusion for ${hex(address)}: NOT CURSOR RELATED to LCD hardware cursor - non-LCD I/O changed, but no 0x4000-0x4020 writes were captured.${cursorRead ? ' Cursor RAM was read.' : ''}`);
    return;
  }
  console.log(`  Conclusion for ${hex(address)}: NOT CURSOR RELATED - no cursor-position-dependent LCD port writes captured.${cursorRead ? ' Cursor RAM was read, but port writes were stable/non-LCD.' : ''}`);
}

async function main() {
  console.log('Phase 490 hardware cursor OUT probe');
  console.log(`ROM: ${ROM_PATH} (${romBytes.length} bytes)`);

  let blocks = null;
  try {
    const loaded = await loadTranspiledBlocks();
    blocks = loaded.blocks;
    if (loaded.status.created) {
      console.log(`ROM.transpiled.js was missing; decompressed ${TRANSPILED_GZ_PATH}`);
    }
    console.log(`Transpiled blocks: ${blocks ? 'loaded' : 'unavailable; will use createCPU fallback if possible'}`);
  } catch (error) {
    console.log(`Transpiled block load failed: ${error?.message ?? error}`);
  }

  for (const address of OUT_LOCATIONS) {
    const entryInfo = getEntryInfo(address, blocks);
    printDisassembly(address, entryInfo);

    const staticRefs = scanCursorReferences(address, entryInfo);
    const staticPort = staticPortInference(address, entryInfo.entry);
    console.log(`Static cursor references: ${formatCursorStaticRefs(staticRefs)}`);
    console.log(`Static OUT port inference: instruction=${formatInstruction(staticPort.outInstruction)}, C=${staticPort.c === undefined || staticPort.c === null ? 'unknown' : hexByte(staticPort.c)}, BC/port16=${staticPort.port16 === undefined || staticPort.port16 === null ? 'unknown' : hexPort(staticPort.port16)}, confidence=${staticPort.confidence}`);
    if (entryInfo.callTargets.length > 0) {
      console.log(`Nearby call-target evidence: ${entryInfo.callTargets.map((hit) => `${hex(hit.source)} -> ${hex(hit.target)}`).join(', ')}`);
    }

    const results = [];
    for (const cursorCase of CURSOR_CASES) {
      try {
        const result = runCandidateCase(address, entryInfo, cursorCase, blocks);
        printCaseResult(result);
        results.push(result);
      } catch (error) {
        const message = error?.stack ?? String(error);
        console.log(`\n  ${cursorCase.name}`);
        console.log(`    dynamic test failed: ${message}`);
        results.push({ cursorCase, error: message, writes: [], reads: [], cursorReads: [], ioOps: [] });
      }
    }

    if (results.length === 2 && !results[0].error && !results[1].error) {
      printDynamicConclusion(address, results[0], results[1]);
    } else {
      console.log(`  Conclusion for ${hex(address)}: dynamic test incomplete; inspect failure above.`);
    }
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});

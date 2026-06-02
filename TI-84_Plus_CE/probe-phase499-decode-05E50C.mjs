import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STACK_RESET_TOP = 0xD1A87E;
const TARGET = 0x05E50C;
const MAX_STATIC_BYTES = 300;

const RAM = {
  D008D2: 0xD008D2,
  D008D5: 0xD008D5,
  D00595: 0xD00595,
  D00596: 0xD00596,
  D02505: 0xD02505,
  D02575: 0xD02575,
};

const KNOWN_TARGETS = new Map([
  [0x061980, 'putchar'],
  [0x061003, 'cursor_erase'],
  [0x061061, 'cursor_draw'],
  [0x060EF5, 'cursor_blink_orchestrator'],
  [0x096BEE, 'cursor_blink_toggle'],
  [0x096CCF, 'cursor_show_sub'],
  [0x0A23E5, 'pixel_renderer'],
  [0x05E50C, 'cursor_to_vram_converter'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function loadRomBytes() {
  return new Uint8Array(fs.readFileSync(path.join(__dirname, 'ROM.rom')));
}

function getInstructionBytes(decoded, romBytes, pc) {
  if (decoded?.bytes instanceof Uint8Array || Array.isArray(decoded?.bytes)) {
    return Array.from(decoded.bytes);
  }

  const size = decoded?.size ?? decoded?.length ?? decoded?.byteLength ?? 1;
  return Array.from(romBytes.slice(pc, pc + size));
}

function getInstructionText(decoded) {
  if (typeof decoded === 'string') return decoded;
  return decoded?.disasm ?? decoded?.text ?? decoded?.mnemonic ?? decoded?.instruction ?? String(decoded);
}

function getInstructionSize(decoded, bytes) {
  return decoded?.size ?? decoded?.length ?? decoded?.byteLength ?? bytes.length ?? 1;
}

function formatInstruction(pc, decoded, romBytes) {
  const bytes = getInstructionBytes(decoded, romBytes, pc);
  const raw = bytes.map(hexByte).join(' ').padEnd(16, ' ');
  return `${hex(pc)}  ${raw}  ${getInstructionText(decoded)}`;
}

function annotationFor(text) {
  const upper = text.toUpperCase();
  const annotations = [];

  for (const [name, address] of Object.entries(RAM)) {
    if (upper.includes(address.toString(16).toUpperCase())) {
      const rw = /^\s*(LD|LEA|PEA|PUSH|POP|EX|ADC|ADD|SBC|SUB|INC|DEC|BIT|RES|SET|CP|OR|XOR|AND)/i.test(text)
        ? (/\(\s*D0[0-9A-F]{4}\s*\)\s*,/i.test(text) || /\(\s*0xD0[0-9A-F]{4}\s*\)\s*,/i.test(text) ? 'RAM write' : 'RAM ref')
        : 'RAM ref';
      annotations.push(`${rw} ${name}`);
    }
  }

  const targetMatch = upper.match(/\b(?:CALL|JP)\s+(?:0X)?([0-9A-F]{5,6})\b/);
  if (targetMatch) {
    const target = Number.parseInt(targetMatch[1], 16);
    const name = KNOWN_TARGETS.get(target);
    if (name) annotations.push(`known target ${name}`);
  }

  return annotations.length ? ` ; ${annotations.join(', ')}` : '';
}

function isUnconditionalRet(text) {
  return /^\s*RET\s*$/i.test(text) || /^\s*RET\.S\s*$/i.test(text) || /^\s*RETI\s*$/i.test(text);
}

function disassembleTarget(romBytes) {
  console.log('=== Static disassembly: 0x05E50C cursor-to-VRAM converter ===');
  let pc = TARGET;
  let retPc = null;

  while (pc < TARGET + MAX_STATIC_BYTES) {
    const decoded = decodeInstruction(romBytes, pc, 'adl');
    const bytes = getInstructionBytes(decoded, romBytes, pc);
    const size = getInstructionSize(decoded, bytes);
    const text = getInstructionText(decoded);
    console.log(`${formatInstruction(pc, decoded, romBytes)}${annotationFor(text)}`);

    pc += size;
    if (isUnconditionalRet(text)) {
      retPc = pc;
      break;
    }
  }

  if (retPc === null) {
    console.log(`No unconditional RET found within ${MAX_STATIC_BYTES} bytes.`);
    return;
  }

  console.log('\n=== 20 bytes after RET ===');
  const end = Math.min(retPc + 20, romBytes.length);
  for (let ctx = retPc; ctx < end;) {
    const decoded = decodeInstruction(romBytes, ctx, 'adl');
    const bytes = getInstructionBytes(decoded, romBytes, ctx);
    const size = getInstructionSize(decoded, bytes);
    const text = getInstructionText(decoded);
    console.log(`${formatInstruction(ctx, decoded, romBytes)}${annotationFor(text)}`);
    ctx += size;
  }
}

function makeBus(romBytes) {
  try {
    return createPeripheralBus({ romBytes, timerInterrupt: false });
  } catch {
    return createPeripheralBus(romBytes, { timerInterrupt: false });
  }
}

function makeExecutor(romBytes, bus) {
  const attempts = [
    () => createExecutor({ romBytes, bus, peripheralBus: bus, timerInterrupt: false }),
    () => createExecutor(romBytes, { bus, peripheralBus: bus, timerInterrupt: false }),
    () => createExecutor(romBytes, bus, { timerInterrupt: false }),
  ];

  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // Try the next known constructor shape.
    }
  }

  return createExecutor({ romBytes, timerInterrupt: false });
}

function callIfFunction(obj, names, ...args) {
  for (const name of names) {
    if (typeof obj?.[name] === 'function') return obj[name](...args);
  }
  return undefined;
}

function writeByte(executor, bus, address, value) {
  const masked = value & 0xFF;
  if (callIfFunction(executor, ['writeByte', 'write8', 'poke8', 'writeMemory8'], address, masked) !== undefined) return;
  if (callIfFunction(bus, ['writeByte', 'write8', 'poke8', 'writeMemory8'], address, masked) !== undefined) return;
  if (callIfFunction(executor?.memory, ['writeByte', 'write8', 'poke8', 'writeMemory8'], address, masked) !== undefined) return;
  if (callIfFunction(bus?.memory, ['writeByte', 'write8', 'poke8', 'writeMemory8'], address, masked) !== undefined) return;
  throw new Error(`No byte write API found for ${hex(address)}`);
}

function readByte(executor, bus, address) {
  const value =
    callIfFunction(executor, ['readByte', 'read8', 'peek8', 'readMemory8'], address) ??
    callIfFunction(bus, ['readByte', 'read8', 'peek8', 'readMemory8'], address) ??
    callIfFunction(executor?.memory, ['readByte', 'read8', 'peek8', 'readMemory8'], address) ??
    callIfFunction(bus?.memory, ['readByte', 'read8', 'peek8', 'readMemory8'], address);

  if (value === undefined) throw new Error(`No byte read API found for ${hex(address)}`);
  return value & 0xFF;
}

function read24(executor, bus, address) {
  const lo = readByte(executor, bus, address);
  const mid = readByte(executor, bus, address + 1);
  const hi = readByte(executor, bus, address + 2);
  return lo | (mid << 8) | (hi << 16);
}

function write24(executor, bus, address, value) {
  writeByte(executor, bus, address, value);
  writeByte(executor, bus, address + 1, value >> 8);
  writeByte(executor, bus, address + 2, value >> 16);
}

function snapshotVram(executor, bus) {
  const start = 0xD40000;
  const length = 320 * 240 * 2;
  const sample = new Map();

  for (let offset = 0; offset < length; offset += 257) {
    const address = start + offset;
    try {
      sample.set(address, readByte(executor, bus, address));
    } catch {
      break;
    }
  }

  return sample;
}

function diffVram(before, executor, bus) {
  const changes = [];
  for (const [address, value] of before.entries()) {
    const after = readByte(executor, bus, address);
    if (after !== value) changes.push({ address, before: value, after });
  }
  return changes;
}

function coldBoot(executor) {
  callIfFunction(executor, ['reset', 'coldReset', 'coldBoot']);
  if (executor?.cpu?.registers) executor.cpu.registers.SPL = STACK_RESET_TOP & 0xFF;
  if (executor?.cpu?.registers) executor.cpu.registers.SPS = (STACK_RESET_TOP >> 8) & 0xFF;
  if (executor?.cpu?.registers) executor.cpu.registers.SPH = (STACK_RESET_TOP >> 16) & 0xFF;
  if (executor?.registers) executor.registers.SP = STACK_RESET_TOP;

  if (typeof executor.runFrom === 'function') {
    try {
      executor.runFrom(0x000000, 'adl', { maxSteps: 2_000_000, stackTop: STACK_RESET_TOP, timerInterrupt: false });
    } catch (error) {
      console.log(`Cold boot run returned: ${error.message}`);
    }
  }
}

function runConverterCase(romBytes, row, col) {
  const bus = makeBus(romBytes);
  const executor = makeExecutor(romBytes, bus);
  coldBoot(executor);

  writeByte(executor, bus, RAM.D00595, row);
  writeByte(executor, bus, RAM.D00596, col);
  writeByte(executor, bus, RAM.D02505, col);
  writeByte(executor, bus, RAM.D02575, 0xE1);
  write24(executor, bus, RAM.D008D2, 0);
  writeByte(executor, bus, RAM.D008D5, 0);

  const beforeVram = snapshotVram(executor, bus);
  executor.runFrom(TARGET, 'adl', { maxSteps: 10000, stackTop: STACK_RESET_TOP, timerInterrupt: false });

  const base = read24(executor, bus, RAM.D008D2);
  const high = readByte(executor, bus, RAM.D008D5);
  const vramChanges = diffVram(beforeVram, executor, bus);

  console.log(`row=${row} col=${col}`);
  console.log(`  D008D2 base: ${hex(base)}`);
  console.log(`  D008D5 high: ${hex(high, 2)}`);
  console.log(`  VRAM sampled changes: ${vramChanges.length}`);
  for (const change of vramChanges.slice(0, 20)) {
    console.log(`    ${hex(change.address)}: ${hex(change.before, 2)} -> ${hex(change.after, 2)}`);
  }

  return { row, col, base, high, vramChanges };
}

function deriveFormula(origin, sample) {
  const delta = sample.base - origin.base;
  const expectedCellPixels = { width: 10, height: 14 };
  const expectedStride = 320;
  const expectedDelta = sample.row * expectedCellPixels.height * expectedStride + sample.col * expectedCellPixels.width;
  const impliedBytesPerPixel = expectedDelta === 0 ? NaN : delta / expectedDelta;
  const statusBarOffsetPixels = origin.base >= 0xD40000 ? origin.base - 0xD40000 : origin.base;

  console.log('\n=== Mapping formula ===');
  console.log(`row=${origin.row} col=${origin.col} base=${hex(origin.base)} high=${hex(origin.high, 2)}`);
  console.log(`row=${sample.row} col=${sample.col} base=${hex(sample.base)} high=${hex(sample.high, 2)}`);
  console.log(`delta from origin: ${delta} bytes`);
  console.log(`expected cell: ${expectedCellPixels.width}px wide x ${expectedCellPixels.height}px tall`);
  console.log(`expected pixel delta for row=${sample.row}, col=${sample.col}: ${expectedDelta} pixels`);
  console.log(`implied bytes per pixel: ${Number.isFinite(impliedBytesPerPixel) ? impliedBytesPerPixel : 'n/a'}`);
  console.log(`implied formula: address = ${hex(origin.base)} + row * 14 * 320 * bytesPerPixel + col * 10 * bytesPerPixel`);
  console.log(`status bar offset from VRAM start: ${statusBarOffsetPixels} bytes/pixels before bytes-per-pixel adjustment`);
  console.log(`status bar offset near 10px: ${statusBarOffsetPixels >= 8 && statusBarOffsetPixels <= 24 ? 'yes' : 'check derived base'}`);
}

const romBytes = loadRomBytes();

disassembleTarget(romBytes);

console.log('\n=== Dynamic test: row=5 col=10 ===');
const sample = runConverterCase(romBytes, 5, 10);

console.log('\n=== Dynamic test: row=0 col=0 ===');
const origin = runConverterCase(romBytes, 0, 0);

deriveFormula(origin, sample);

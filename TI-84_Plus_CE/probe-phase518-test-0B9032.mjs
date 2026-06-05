import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createCPU, createMemory, createPeripheralBus } from './cpu-runtime.js';

if (!existsSync('TI-84_Plus_CE/ROM.transpiled.js')) {
  execSync('node scripts/transpile-ti84-rom.mjs', { stdio: 'inherit' });
}

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const TRANSPiled_PATH = './ROM.transpiled.js';
const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;
const ROW_STRIDE = 320 * 2;
const STRING_ADDR = 0xD01000;
const DESCRIPTOR_ADDR = 0xD01100;
const STACK_TOP = 0xD1FF00;
const FAKE_RETURN = 0x0F0000;
const TARGET = 0x0B9032;
const BOOT_STEPS = 52000;
const MAX_RENDER_STEPS = 10000;
const TEST_STRING = 'HELLO';

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hasMethod(obj, name) {
  return obj && typeof obj[name] === 'function';
}

function callFirst(obj, names, ...args) {
  for (const name of names) {
    if (hasMethod(obj, name)) {
      return obj[name](...args);
    }
  }
  return undefined;
}

function read8(memory, addr) {
  const value = callFirst(memory, ['read8', 'readByte', 'read', 'get8', 'getByte'], addr & 0xFFFFFF);
  if (value === undefined) {
    throw new Error('Memory object does not expose a byte read method');
  }
  return value & 0xFF;
}

function write8(memory, addr, value) {
  const result = callFirst(memory, ['write8', 'writeByte', 'write', 'set8', 'setByte'], addr & 0xFFFFFF, value & 0xFF);
  if (result === undefined && !hasMethod(memory, 'write8') && !hasMethod(memory, 'writeByte') && !hasMethod(memory, 'write') && !hasMethod(memory, 'set8') && !hasMethod(memory, 'setByte')) {
    throw new Error('Memory object does not expose a byte write method');
  }
}

function write16(memory, addr, value) {
  write8(memory, addr, value);
  write8(memory, addr + 1, value >>> 8);
}

function write24(memory, addr, value) {
  write8(memory, addr, value);
  write8(memory, addr + 1, value >>> 8);
  write8(memory, addr + 2, value >>> 16);
}

function clearRange(memory, base, size) {
  for (let i = 0; i < size; i++) {
    write8(memory, base + i, 0);
  }
}

function setReg(cpu, name, value) {
  const normalized = name.toLowerCase();
  const candidates = [
    name,
    normalized,
    name.toUpperCase(),
    `set${name.toUpperCase()}`,
    `set${name[0].toUpperCase()}${name.slice(1).toLowerCase()}`,
  ];

  for (const candidate of candidates) {
    if (hasMethod(cpu, candidate)) {
      cpu[candidate](value >>> 0);
      return true;
    }
  }

  for (const bagName of ['regs', 'registers', 'state']) {
    const bag = cpu[bagName];
    if (bag && normalized in bag) {
      bag[normalized] = value >>> 0;
      return true;
    }
    if (bag && name.toUpperCase() in bag) {
      bag[name.toUpperCase()] = value >>> 0;
      return true;
    }
  }

  if (normalized in cpu) {
    cpu[normalized] = value >>> 0;
    return true;
  }
  if (name.toUpperCase() in cpu) {
    cpu[name.toUpperCase()] = value >>> 0;
    return true;
  }
  return false;
}

function getReg(cpu, name) {
  const normalized = name.toLowerCase();
  for (const candidate of [name, normalized, name.toUpperCase(), `get${name.toUpperCase()}`]) {
    if (hasMethod(cpu, candidate)) {
      return cpu[candidate]() >>> 0;
    }
  }
  for (const bagName of ['regs', 'registers', 'state']) {
    const bag = cpu[bagName];
    if (bag && normalized in bag) return bag[normalized] >>> 0;
    if (bag && name.toUpperCase() in bag) return bag[name.toUpperCase()] >>> 0;
  }
  if (normalized in cpu) return cpu[normalized] >>> 0;
  if (name.toUpperCase() in cpu) return cpu[name.toUpperCase()] >>> 0;
  return undefined;
}

function stepCPU(cpu) {
  const result = callFirst(cpu, ['step', 'executeInstruction', 'tick', 'runOne']);
  if (result === undefined && !hasMethod(cpu, 'step') && !hasMethod(cpu, 'executeInstruction') && !hasMethod(cpu, 'tick') && !hasMethod(cpu, 'runOne')) {
    throw new Error('CPU object does not expose a single-step method');
  }
}

function createRuntime() {
  const rom = readFileSync(ROM_PATH);
  const bus = createPeripheralBus({ timerInterrupt: false });
  let memory;

  for (const args of [[rom, bus], [rom], [{ rom, bus }], []]) {
    try {
      memory = createMemory(...args);
      if (memory) break;
    } catch {
      memory = undefined;
    }
  }
  if (!memory) {
    throw new Error('Unable to create memory');
  }

  callFirst(memory, ['loadROM', 'loadRom', 'load'], rom);

  let cpu;
  for (const args of [[memory, bus], [{ memory, bus }], [memory], []]) {
    try {
      cpu = createCPU(...args);
      if (cpu) break;
    } catch {
      cpu = undefined;
    }
  }
  if (!cpu) {
    throw new Error('Unable to create CPU');
  }

  return { cpu, memory, bus };
}

async function installTranspiledROM(cpu, memory, bus) {
  const module = await import(TRANSPiled_PATH);
  const candidates = [
    module.default,
    module.install,
    module.installROM,
    module.installRom,
    module.installTranspiledROM,
    module.loadROM,
    module.loadRom,
    module.attach,
  ].filter((fn) => typeof fn === 'function');

  for (const fn of candidates) {
    for (const args of [[cpu, memory, bus], [{ cpu, memory, bus }], [cpu], [memory]]) {
      try {
        fn(...args);
        return module;
      } catch {
        // Try the next known generated-module shape.
      }
    }
  }

  if (typeof cpu.installTranspiled === 'function') {
    cpu.installTranspiled(module);
  } else if (typeof cpu.loadTranspiled === 'function') {
    cpu.loadTranspiled(module);
  }

  return module;
}

function push24(memory, cpu, value) {
  let sp = getReg(cpu, 'sp') ?? STACK_TOP;
  sp = (sp - 3) & 0xFFFFFF;
  write24(memory, sp, value);
  setReg(cpu, 'sp', sp);
}

function analyzeVRAM(memory) {
  let nonZeroBytes = 0;
  let pixelCount = 0;
  let minRow = Infinity;
  let maxRow = -1;
  let minCol = Infinity;
  let maxCol = -1;

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    const lo = read8(memory, VRAM_BASE + offset);
    const hi = read8(memory, VRAM_BASE + offset + 1);
    if (lo) nonZeroBytes++;
    if (hi) nonZeroBytes++;
    if (lo || hi) {
      const pixel = offset / 2;
      const row = Math.floor(pixel / 320);
      const col = pixel % 320;
      pixelCount++;
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
    }
  }

  return {
    nonZeroBytes,
    pixelCount,
    bbox: pixelCount
      ? { minRow, maxRow, minCol, maxCol }
      : null,
  };
}

function setupStringState(memory, cpu) {
  const bytes = [...Buffer.from(TEST_STRING, 'ascii'), 0x00];
  for (let i = 0; i < bytes.length; i++) {
    write8(memory, STRING_ADDR + i, bytes[i]);
  }

  clearRange(memory, DESCRIPTOR_ADDR, 0x80);
  write24(memory, DESCRIPTOR_ADDR + 0x00, STRING_ADDR);
  write24(memory, DESCRIPTOR_ADDR + 0x03, VRAM_BASE);
  write16(memory, DESCRIPTOR_ADDR + 0x06, 5);
  write16(memory, DESCRIPTOR_ADDR + 0x08, 10);
  write16(memory, DESCRIPTOR_ADDR + 0x0A, TEST_STRING.length);
  write8(memory, DESCRIPTOR_ADDR + 0x0C, 0);

  setReg(cpu, 'hl', STRING_ADDR);
  setReg(cpu, 'de', VRAM_BASE + 10 * ROW_STRIDE + 5 * 2);
  setReg(cpu, 'bc', TEST_STRING.length);
  setReg(cpu, 'ix', DESCRIPTOR_ADDR);
  setReg(cpu, 'iy', DESCRIPTOR_ADDR);
  setReg(cpu, 'a', TEST_STRING.charCodeAt(0));
  setReg(cpu, 'sp', STACK_TOP);

  return {
    stringAddr: STRING_ADDR,
    descriptorAddr: DESCRIPTOR_ADDR,
    vramPtr: VRAM_BASE + 10 * ROW_STRIDE + 5 * 2,
    startRow: 10,
    startCol: 5,
  };
}

const { cpu, memory, bus } = createRuntime();
await installTranspiledROM(cpu, memory, bus);

console.log('Phase 518 probe: 0x0B9032 string renderer end-to-end');
console.log(`Target: ${hex(TARGET)}  String: "${TEST_STRING}"  String RAM: ${hex(STRING_ADDR)}`);
console.log(`Booting OS init for ${BOOT_STEPS} steps with timerInterrupt=false`);

for (let i = 0; i < BOOT_STEPS; i++) {
  stepCPU(cpu);
}

clearRange(memory, VRAM_BASE, VRAM_SIZE);
const setup = setupStringState(memory, cpu);
const beforeCol = getReg(cpu, 'curCol') ?? getReg(cpu, 'c') ?? undefined;
const beforePC = getReg(cpu, 'pc');

setReg(cpu, 'pc', TARGET);
push24(memory, cpu, FAKE_RETURN);

let completed = false;
let stalled = false;
let steps = 0;
let lastPC = getReg(cpu, 'pc');
let samePCCount = 0;

for (; steps < MAX_RENDER_STEPS; steps++) {
  stepCPU(cpu);
  const pc = getReg(cpu, 'pc');
  if (pc === FAKE_RETURN) {
    completed = true;
    break;
  }
  if (pc === lastPC) {
    samePCCount++;
    if (samePCCount > 1000) {
      stalled = true;
      break;
    }
  } else {
    lastPC = pc;
    samePCCount = 0;
  }
}

const afterCol = getReg(cpu, 'curCol') ?? getReg(cpu, 'c') ?? undefined;
const afterPC = getReg(cpu, 'pc');
const analysis = analyzeVRAM(memory);
const visible = analysis.pixelCount > 0;

console.log('');
console.log('Setup');
console.log(`  Descriptor: ${hex(setup.descriptorAddr)}`);
console.log(`  String ptr: ${hex(setup.stringAddr)}`);
console.log(`  Initial VRAM ptr: ${hex(setup.vramPtr)}`);
console.log(`  Initial row/col: ${setup.startRow}/${setup.startCol}`);
console.log(`  PC before direct call setup: ${beforePC === undefined ? 'unknown' : hex(beforePC)}`);
console.log('');
console.log('Execution');
console.log(`  Steps: ${steps}`);
console.log(`  Completed by fake return: ${completed}`);
console.log(`  Stalled: ${stalled}`);
console.log(`  Final PC: ${afterPC === undefined ? 'unknown' : hex(afterPC)}`);
console.log(`  Fake return: ${hex(FAKE_RETURN)}`);
console.log('');
console.log('VRAM analysis');
console.log(`  Non-zero VRAM bytes: ${analysis.nonZeroBytes}`);
console.log(`  Non-zero pixels: ${analysis.pixelCount}`);
if (analysis.bbox) {
  console.log(`  Bounding box rows: ${analysis.bbox.minRow}..${analysis.bbox.maxRow}`);
  console.log(`  Bounding box cols: ${analysis.bbox.minCol}..${analysis.bbox.maxCol}`);
} else {
  console.log('  Bounding box: none');
}
console.log('');
console.log('Cursor analysis');
console.log(`  curCol before: ${beforeCol === undefined ? 'unknown' : beforeCol}`);
console.log(`  curCol after: ${afterCol === undefined ? 'unknown' : afterCol}`);
console.log(`  curCol advanced: ${beforeCol === undefined || afterCol === undefined ? 'unknown' : afterCol - beforeCol}`);
console.log('');
console.log(`Result: ${visible ? 'VISIBLE_OUTPUT' : 'NO_VISIBLE_OUTPUT'} ${completed ? 'COMPLETED' : 'NOT_COMPLETED'}`);

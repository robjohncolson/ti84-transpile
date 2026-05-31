import { readFileSync } from 'node:fs';
import * as runtimeModule from './cpu-runtime.js';
import * as peripheralsModule from './peripherals.js';
import * as romModule from './ROM.transpiled.js';

const createExecutor = runtimeModule.default ?? runtimeModule.createExecutor;
const createPeripheralBus =
  peripheralsModule.default ?? peripheralsModule.createPeripheralBus;

const ROM_BYTES = new Uint8Array(
  readFileSync(new URL('./ROM.rom', import.meta.url)),
);

const BOOT_STAGES = [0x080000, 0x0802B2, 0x08C331];
const BOOT_OPTIONS = { maxSteps: 150_000, maxLoopIterations: 200_000 };

const CHAR_OUTPUT = 0x0059C6;
const DIRECT_CALL_OPTIONS = { maxSteps: 5_000, maxLoopIterations: 100 };
const STACK_RESET_TOP = 0xD1A87E;
const SENTINEL_RETURN = 0xFFFFFF;

const D0058B = 0xD0058B;
const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
const D00595 = 0xD00595;
const D00596 = 0xD00596;
const D0059C = 0xD0059C;

const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const VRAM_ROW_STRIDE = 640;

if (typeof createExecutor !== 'function') {
  throw new TypeError('cpu-runtime.js did not export createExecutor');
}

if (typeof createPeripheralBus !== 'function') {
  throw new TypeError('peripherals.js did not export createPeripheralBus');
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function makePeripheralBus() {
  try {
    return createPeripheralBus({ rom: ROM_BYTES, romBytes: ROM_BYTES });
  } catch {
    return createPeripheralBus();
  }
}

function method(owner, name) {
  return typeof owner?.[name] === 'function' ? owner[name].bind(owner) : null;
}

function arrayIndex(memory, addr) {
  if (typeof memory?.length !== 'number') {
    return addr;
  }
  if (addr < memory.length) {
    return addr;
  }
  return addr & (memory.length - 1);
}

function byteAccess(executor, cpu, bus) {
  const memory =
    executor.memory ??
    executor.mem ??
    executor.ram ??
    executor.addressSpace ??
    executor.mmu?.memory ??
    executor.state?.memory ??
    executor.state?.mem ??
    cpu.memory ??
    cpu.mem ??
    bus.memory ??
    bus.mem;

  const read8 =
    method(executor, 'read8') ??
    method(executor, 'readByte') ??
    method(executor, 'memRead') ??
    method(executor, 'readMemory') ??
    method(cpu, 'read8') ??
    method(cpu, 'readByte') ??
    method(cpu, 'memRead') ??
    method(memory, 'read8') ??
    method(memory, 'readByte') ??
    method(memory, 'read') ??
    method(memory, 'getUint8') ??
    (memory && typeof memory.get === 'function'
      ? (addr) => memory.get(addr) ?? 0
      : null) ??
    (memory && typeof memory.length === 'number'
      ? (addr) => memory[arrayIndex(memory, addr)] ?? 0
      : null);

  const write8 =
    method(executor, 'write8') ??
    method(executor, 'writeByte') ??
    method(executor, 'memWrite') ??
    method(executor, 'writeMemory') ??
    method(cpu, 'write8') ??
    method(cpu, 'writeByte') ??
    method(cpu, 'memWrite') ??
    method(memory, 'write8') ??
    method(memory, 'writeByte') ??
    method(memory, 'write') ??
    method(memory, 'setUint8') ??
    (memory && typeof memory.set === 'function'
      ? (addr, value) => memory.set(addr, value & 0xFF)
      : null) ??
    (memory && typeof memory.length === 'number'
      ? (addr, value) => {
          memory[arrayIndex(memory, addr)] = value & 0xFF;
        }
      : null);

  if (!read8 || !write8) {
    throw new TypeError('Unable to locate byte-addressable memory accessors');
  }

  return {
    read8(addr) {
      return read8(addr) & 0xFF;
    },
    write8(addr, value) {
      write8(addr, value & 0xFF);
    },
  };
}

function normalizeRuntime(executor, bus) {
  const cpu =
    executor.cpu ??
    executor.state?.cpu ??
    executor.context?.cpu ??
    executor.processor;
  const runFrom =
    method(executor, 'runFrom') ??
    method(executor, 'executeFrom') ??
    method(executor.execute, 'runFrom') ??
    method(executor.runner, 'runFrom');

  if (!cpu) {
    throw new TypeError('Executor did not expose a CPU state object');
  }
  if (!runFrom) {
    throw new TypeError('Executor did not expose runFrom');
  }

  return { cpu, runFrom, ...byteAccess(executor, cpu, bus) };
}

function createRuntime() {
  const attempts = [
    [
      'options',
      () => {
        const bus = makePeripheralBus();
        return {
          bus,
          executor: createExecutor({
            rom: ROM_BYTES,
            romBytes: ROM_BYTES,
            romModule,
            program: romModule,
            bus,
            peripheralBus: bus,
            peripherals: bus,
          }),
        };
      },
    ],
    [
      'rom-module-bus',
      () => {
        const bus = makePeripheralBus();
        return { bus, executor: createExecutor(ROM_BYTES, romModule, bus) };
      },
    ],
    [
      'module-rom-bus',
      () => {
        const bus = makePeripheralBus();
        return { bus, executor: createExecutor(romModule, ROM_BYTES, bus) };
      },
    ],
    [
      'module-options',
      () => {
        const bus = makePeripheralBus();
        return {
          bus,
          executor: createExecutor(romModule, {
            rom: ROM_BYTES,
            romBytes: ROM_BYTES,
            bus,
            peripheralBus: bus,
            peripherals: bus,
          }),
        };
      },
    ],
  ];

  let lastError;
  for (const [, attempt] of attempts) {
    try {
      const { executor, bus } = attempt();
      return normalizeRuntime(executor, bus);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

const { cpu, runFrom, read8, write8 } = createRuntime();

async function runFromAdl(address, options) {
  try {
    return await runFrom('adl', address, options);
  } catch (firstError) {
    try {
      return await runFrom(address, 'adl', options);
    } catch {
      try {
        return await runFrom(address, { mode: 'adl', ...options });
      } catch {
        throw firstError;
      }
    }
  }
}

function read24LE(addr) {
  return read8(addr) | (read8(addr + 1) << 8) | (read8(addr + 2) << 16);
}

function write24LE(addr, value) {
  write8(addr, value);
  write8(addr + 1, value >> 8);
  write8(addr + 2, value >> 16);
}

function snapshotVram() {
  const snapshot = new Uint8Array(VRAM_END - VRAM_START);
  for (let addr = VRAM_START; addr < VRAM_END; addr += 1) {
    snapshot[addr - VRAM_START] = read8(addr);
  }
  return snapshot;
}

function diffVram(before) {
  const changed = [];
  for (let addr = VRAM_START; addr < VRAM_END; addr += 1) {
    if (read8(addr) !== before[addr - VRAM_START]) {
      changed.push(addr);
    }
  }
  return changed;
}

function displayState() {
  return {
    d0058b: read8(D0058B),
    d0058c: read8(D0058C),
    d0058e: read8(D0058E),
    d00595: read8(D00595),
    d00596: read8(D00596),
    d0059c: read24LE(D0059C),
  };
}

function formatDisplayState(state) {
  return [
    `D0058B=${hex(state.d0058b, 2)}`,
    `D0058C=${hex(state.d0058c, 2)}`,
    `D0058E=${hex(state.d0058e, 2)}`,
    `D00595=${hex(state.d00595, 2)}`,
    `D00596=${hex(state.d00596, 2)}`,
    `D0059C=${hex(state.d0059c, 6)}`,
  ].join(' ');
}

function formatAddresses(addresses) {
  if (addresses.length === 0) {
    return '(none)';
  }
  return addresses.map((addr) => hex(addr, 6)).join(', ');
}

function changedBounds(changed) {
  let min = Infinity;
  let max = -Infinity;
  for (const addr of changed) {
    min = Math.min(min, addr);
    max = Math.max(max, addr);
  }
  return { min, max };
}

function rowOf(addr) {
  return Math.floor((addr - VRAM_START) / VRAM_ROW_STRIDE);
}

function setupDisplayState() {
  write24LE(D0059C, VRAM_START);
  write8(D00595, 0x00);
  write8(D00596, 0x00);
  write8(D0058C, 0x00);
  write8(D0058E, 0x00);
  write8(D0058B, 0x70);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;
}

function primeDirectCall(charCode) {
  cpu._a = (charCode & 0xFF) << 24;
  cpu.sp = STACK_RESET_TOP - 3;
  write24LE(cpu.sp, SENTINEL_RETURN);
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;
}

console.log('Phase 479 multi-character string probe');
console.log('Booting ROM stages...');
for (const address of BOOT_STAGES) {
  console.log(`  runFrom('adl', ${hex(address, 6)})`);
  await runFromAdl(address, BOOT_OPTIONS);
}

setupDisplayState();
console.log(`Initial display state: ${formatDisplayState(displayState())}`);

const beforeAll = snapshotVram();
let previousSnapshot = beforeAll;

for (const char of 'HOME') {
  const charCode = char.charCodeAt(0);
  primeDirectCall(charCode);
  await runFromAdl(CHAR_OUTPUT, DIRECT_CALL_OPTIONS);

  const changed = diffVram(previousSnapshot);
  const state = displayState();

  console.log(
    `Rendered '${char}' (${hex(charCode, 2)}): ${changed.length} VRAM bytes changed`,
  );
  console.log(`  ${formatDisplayState(state)}`);
  console.log(`  first 16 changed: ${formatAddresses(changed.slice(0, 16))}`);

  previousSnapshot = snapshotVram();
}

const finalChanged = diffVram(beforeAll);
console.log(`Final VRAM diff from pre-render snapshot: ${finalChanged.length} bytes`);

if (finalChanged.length > 0) {
  const { min, max } = changedBounds(finalChanged);
  const topWindowEnd = VRAM_START + VRAM_ROW_STRIDE * 8 - 1;
  const deepWindowStart = VRAM_START + VRAM_ROW_STRIDE * 100;
  const hasTopScreenChanges = finalChanged.some((addr) => addr <= topWindowEnd);
  const hasDeepChanges = finalChanged.some((addr) => addr >= deepWindowStart);

  console.log(
    `Changed VRAM range: ${hex(min, 6)}..${hex(max, 6)} ` +
      `(rows ${rowOf(min)}..${rowOf(max)})`,
  );
  console.log(
    `Top-screen check: ${hasTopScreenChanges ? 'near row 0' : 'not near row 0'} ` +
      `(top window ${hex(VRAM_START, 6)}..${hex(topWindowEnd, 6)})`,
  );
  console.log(
    `Deep-VRAM check: ${hasDeepChanges ? 'changes at row 100+' : 'no row 100+ changes'} ` +
      `(deep window starts ${hex(deepWindowStart, 6)})`,
  );
}

const finalState = displayState();
console.log(`Final display state: ${formatDisplayState(finalState)}`);
console.log(`Final D00596 decimal: ${finalState.d00596} (expected 4 for HOME)`);

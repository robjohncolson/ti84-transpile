import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as runtime from './cpu-runtime.js';
import * as peripherals from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAR_OUT = 0x0059c6;
const SENTINEL = 0x500000;
const CUR_ROW = 0xd00595;
const CUR_COL = 0xd00596;
const VRAM_BASE = 0xd40000;
const STATUS_VRAM_START = VRAM_BASE + 37 * 640;
const STATUS_COLS = 26;
const CHAR_CELL_BYTES = 12 * 2;
const STATUS_HEIGHT = 8;
const STATUS_REGION_LEN = (STATUS_HEIGHT - 1) * 640 + STATUS_COLS * CHAR_CELL_BYTES;
const TEXT = 'Normal Float Radian'.padEnd(STATUS_COLS, ' ');
const BOOT_STAGES = [
  { name: 'reset', pc: 0x000000, maxSteps: 8_000_000 },
];

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function getCreatePeripheralBus() {
  const createPeripheralBus =
    peripherals.createPeripheralBus ??
    peripherals.default?.createPeripheralBus ??
    peripherals.default;
  if (typeof createPeripheralBus !== 'function') {
    throw new Error('createPeripheralBus export not found in peripherals.js');
  }
  return createPeripheralBus;
}

function findRomImage() {
  const roots = [__dirname, path.dirname(__dirname), process.cwd()];
  const exts = new Set(['.rom', '.bin', '.8xu', '.8xv', '.8ce']);
  const seen = new Set();
  const candidates = [];

  function visit(dir, depth) {
    const real = path.resolve(dir);
    if (seen.has(real) || depth > 3) return;
    seen.add(real);

    let entries;
    try {
      entries = fs.readdirSync(real, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.gitnexus') {
        continue;
      }

      const full = path.join(real, entry.name);
      if (entry.isDirectory()) {
        visit(full, depth + 1);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!exts.has(ext)) continue;

      const stat = fs.statSync(full);
      if (stat.size >= 256 * 1024) {
        candidates.push({ full, size: stat.size });
      }
    }
  }

  for (const root of roots) visit(root, 0);
  candidates.sort((a, b) => b.size - a.size);
  if (candidates.length === 0) {
    throw new Error('No ROM image found near the probe directory');
  }
  return candidates[0].full;
}

async function loadRomBytes() {
  for (const name of ['loadRom', 'loadROM', 'loadRomImage', 'loadROMImage']) {
    const loader = runtime[name];
    if (typeof loader !== 'function') continue;

    for (const args of [[], [__dirname], [process.cwd()]]) {
      try {
        const result = await loader(...args);
        const bytes = normalizeRomBytes(result);
        if (bytes) return bytes;
      } catch {
        // Try the next loader shape.
      }
    }
  }

  const romPath = findRomImage();
  return new Uint8Array(fs.readFileSync(romPath));
}

function normalizeRomBytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value.rom instanceof Uint8Array) return value.rom;
  if (value.bytes instanceof Uint8Array) return value.bytes;
  if (value.data instanceof Uint8Array) return value.data;
  if (Buffer.isBuffer(value.rom)) return new Uint8Array(value.rom);
  if (Buffer.isBuffer(value.bytes)) return new Uint8Array(value.bytes);
  if (Buffer.isBuffer(value.data)) return new Uint8Array(value.data);
  return null;
}

function getMemoryArray(cpu) {
  for (const holder of [cpu, cpu.memory, cpu.mem, cpu.bus, cpu.mmu]) {
    if (!holder) continue;
    for (const name of ['memory', 'mem', 'bytes', 'data', 'u8']) {
      const value = holder[name];
      if (value instanceof Uint8Array || Buffer.isBuffer(value)) return value;
    }
    if (holder instanceof Uint8Array || Buffer.isBuffer(holder)) return holder;
  }
  return null;
}

function installRom(cpu, romBytes) {
  for (const name of ['loadRom', 'loadROM', 'installRom', 'installROM', 'setRom', 'setROM']) {
    for (const target of [runtime, cpu]) {
      const fn = target?.[name];
      if (typeof fn !== 'function') continue;
      for (const args of target === runtime ? [[cpu, romBytes], [romBytes, cpu], [romBytes]] : [[romBytes]]) {
        try {
          fn.call(target, ...args);
          return;
        } catch {
          // Try the next loader shape.
        }
      }
    }
  }

  const mem = getMemoryArray(cpu);
  if (mem) {
    mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)), 0);
  }
}

function createCpu(romBytes) {
  const createPeripheralBus = getCreatePeripheralBus();
  const peripheralBus = createPeripheralBus({ timerInterrupt: false });
  const create =
    runtime.createCPU ??
    runtime.createCpu ??
    runtime.createCpuRuntime ??
    runtime.createRuntime ??
    runtime.default;

  if (typeof create !== 'function') {
    throw new Error('CPU factory export not found in cpu-runtime.js');
  }

  const attempts = [
    [romBytes, peripheralBus],
    [{ rom: romBytes, bus: peripheralBus, peripheralBus }],
    [peripheralBus, romBytes],
    [{ bus: peripheralBus, peripheralBus }],
    [peripheralBus],
    [],
  ];

  let lastError;
  for (const args of attempts) {
    try {
      const cpu = create(...args);
      if (cpu && typeof cpu === 'object') {
        installRom(cpu, romBytes);
        return cpu;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Unable to create CPU');
}

function callMaybeAsync(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

async function runCpuFrom(cpu, pc, maxSteps, label) {
  const runFrom = runtime.runFrom;
  if (typeof runFrom !== 'function') {
    throw new Error('runFrom export not found in cpu-runtime.js');
  }

  const attempts = [
    () => runFrom(cpu, pc, maxSteps),
    () => runFrom(cpu, pc, { maxSteps }),
    () => runFrom({ cpu, pc, maxSteps }),
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      return await callMaybeAsync(attempt());
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`runFrom failed during ${label}: ${lastError?.message ?? lastError}`);
}

function invokeRead(cpu, addr) {
  const names = ['read8', 'readByte', 'readMem', 'readMemory', 'memRead', 'peek8', 'peek'];
  for (const target of [runtime, cpu, cpu.memory, cpu.bus, cpu.mmu]) {
    if (!target) continue;
    for (const name of names) {
      const fn = target[name];
      if (typeof fn !== 'function') continue;
      for (const args of target === runtime ? [[cpu, addr], [addr, cpu]] : [[addr]]) {
        try {
          const value = fn.call(target, ...args);
          if (Number.isFinite(value)) return value & 0xff;
        } catch {
          // Try the next reader shape.
        }
      }
    }
  }

  const mem = getMemoryArray(cpu);
  if (mem && addr < mem.length) return mem[addr] & 0xff;
  throw new Error(`Unable to read memory at ${hex(addr)}`);
}

function invokeWrite(cpu, addr, value) {
  const byte = value & 0xff;
  const names = ['write8', 'writeByte', 'writeMem', 'writeMemory', 'memWrite', 'poke8', 'poke'];
  for (const target of [runtime, cpu, cpu.memory, cpu.bus, cpu.mmu]) {
    if (!target) continue;
    for (const name of names) {
      const fn = target[name];
      if (typeof fn !== 'function') continue;
      for (const args of target === runtime ? [[cpu, addr, byte], [addr, byte, cpu]] : [[addr, byte]]) {
        try {
          fn.call(target, ...args);
          return;
        } catch {
          // Try the next writer shape.
        }
      }
    }
  }

  const mem = getMemoryArray(cpu);
  if (mem && addr < mem.length) {
    mem[addr] = byte;
    return;
  }
  throw new Error(`Unable to write memory at ${hex(addr)}`);
}

function read8(cpu, addr) {
  return invokeRead(cpu, addr & 0xffffff);
}

function write8(cpu, addr, value) {
  invokeWrite(cpu, addr & 0xffffff, value);
}

function getRegHolder(cpu, name) {
  const holders = [cpu, cpu.regs, cpu.registers, cpu.state];
  for (const holder of holders) {
    if (!holder) continue;
    if (Object.prototype.hasOwnProperty.call(holder, name)) return holder;
    const upper = name.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(holder, upper)) return { holder, key: upper };
  }
  return null;
}

function setReg(cpu, names, value) {
  for (const name of names) {
    const found = getRegHolder(cpu, name);
    if (!found) continue;
    if (found.holder) found.holder[found.key] = value;
    else found[name] = value;
    return true;
  }

  for (const target of [cpu, cpu.regs, cpu.registers]) {
    const fn = target?.setRegister ?? target?.setReg;
    if (typeof fn !== 'function') continue;
    for (const name of names) {
      try {
        fn.call(target, name, value);
        return true;
      } catch {
        // Try the next register name.
      }
    }
  }
  return false;
}

function getReg(cpu, names) {
  for (const name of names) {
    const found = getRegHolder(cpu, name);
    if (!found) continue;
    const value = found.holder ? found.holder[found.key] : found[name];
    if (Number.isFinite(value)) return value;
  }

  for (const target of [cpu, cpu.regs, cpu.registers]) {
    const fn = target?.getRegister ?? target?.getReg;
    if (typeof fn !== 'function') continue;
    for (const name of names) {
      try {
        const value = fn.call(target, name);
        if (Number.isFinite(value)) return value;
      } catch {
        // Try the next register name.
      }
    }
  }
  return null;
}

function setA(cpu, value) {
  if (!setReg(cpu, ['a', 'regA', 'accumulator'], value & 0xff)) {
    throw new Error('Unable to set A register');
  }
}

function getSp(cpu) {
  return getReg(cpu, ['spl', 'sp', 'sps', 'stackPointer']);
}

function setSp(cpu, value) {
  if (!setReg(cpu, ['spl', 'sp', 'sps', 'stackPointer'], value & 0xffffff)) {
    throw new Error('Unable to set stack pointer');
  }
}

function push24(cpu, value) {
  const current = getSp(cpu);
  const sp = ((current ?? 0xd1fffc) - 3) & 0xffffff;
  write8(cpu, sp, value);
  write8(cpu, sp + 1, value >> 8);
  write8(cpu, sp + 2, value >> 16);
  setSp(cpu, sp);
}

async function bootCpu(label, romBytes) {
  const cpu = createCpu(romBytes);
  write8(cpu, SENTINEL, 0x76);

  for (const stage of BOOT_STAGES) {
    await runCpuFrom(cpu, stage.pc, stage.maxSteps, `${label}:${stage.name}`);
  }

  write8(cpu, CUR_ROW, 0);
  write8(cpu, CUR_COL, 0);
  return cpu;
}

function clearStatusRegion(cpu) {
  for (let offset = 0; offset < STATUS_REGION_LEN; offset += 1) {
    write8(cpu, STATUS_VRAM_START + offset, 0);
  }
}

function snapshot(cpu) {
  const bytes = new Uint8Array(STATUS_REGION_LEN);
  for (let offset = 0; offset < bytes.length; offset += 1) {
    bytes[offset] = read8(cpu, STATUS_VRAM_START + offset);
  }
  return bytes;
}

function diffSnapshots(before, after) {
  let changed = 0;
  let min = null;
  let max = null;
  for (let i = 0; i < after.length; i += 1) {
    if (before[i] === after[i]) continue;
    changed += 1;
    min ??= STATUS_VRAM_START + i;
    max = STATUS_VRAM_START + i;
  }
  return { changed, min, max };
}

function compareSnapshots(left, right) {
  let mismatches = 0;
  const first = [];
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] === right[i]) continue;
    mismatches += 1;
    if (first.length < 12) {
      first.push(`${hex(STATUS_VRAM_START + i)}:${left[i].toString(16).padStart(2, '0')}/${right[i].toString(16).padStart(2, '0')}`);
    }
  }
  return { matches: mismatches === 0, mismatches, first };
}

function countNonZero(bytes) {
  let count = 0;
  for (const byte of bytes) {
    if (byte !== 0) count += 1;
  }
  return count;
}

function charStats(bytes) {
  const stats = [];
  for (let ch = 0; ch < STATUS_COLS; ch += 1) {
    let nonZero = 0;
    const unique = new Set();
    for (let y = 0; y < STATUS_HEIGHT; y += 1) {
      const rowBase = y * 640 + ch * CHAR_CELL_BYTES;
      for (let x = 0; x < CHAR_CELL_BYTES; x += 1) {
        const value = bytes[rowBase + x];
        if (value !== 0) {
          nonZero += 1;
          unique.add(value);
        }
      }
    }
    stats.push({ char: TEXT[ch], nonZero, unique: unique.size });
  }
  return stats;
}

function hexSummary(bytes) {
  const lines = [];
  for (let y = 0; y < STATUS_HEIGHT; y += 1) {
    const offset = y * 640;
    const row = Array.from(bytes.subarray(offset, offset + 64), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(' ');
    lines.push(`${hex(STATUS_VRAM_START + offset)}: ${row}`);
  }
  return lines.join('\n');
}

async function renderChar(cpu, code, index) {
  setA(cpu, code);
  push24(cpu, SENTINEL);
  const result = await runCpuFrom(cpu, CHAR_OUT, 2_000, `char ${index} ${hex(code, 2)}`);
  write8(cpu, SENTINEL, 0x76);
  return result;
}

async function renderText(cpu) {
  write8(cpu, CUR_ROW, 0);
  write8(cpu, CUR_COL, 0);
  for (let i = 0; i < TEXT.length; i += 1) {
    await renderChar(cpu, TEXT.charCodeAt(i), i);
  }
}

async function main() {
  const romBytes = await loadRomBytes();
  console.log(`phase484: rendering ${JSON.stringify(TEXT)} (${TEXT.length} chars) via ${hex(CHAR_OUT)}`);

  const goldenCpu = await bootCpu('golden', romBytes);
  const golden = snapshot(goldenCpu);

  const directCpu = await bootCpu('direct', romBytes);
  clearStatusRegion(directCpu);
  const before = snapshot(directCpu);
  await renderText(directCpu);
  const after = snapshot(directCpu);

  const diff = diffSnapshots(before, after);
  const compare = compareSnapshots(after, golden);
  const stats = charStats(after);
  const visibleStats = stats.filter((item) => item.char !== ' ');
  const visibleGlyphsNonZero = visibleStats.every((item) => item.nonZero > 0);
  const visibleGlyphsNonUniform = visibleStats.every((item) => item.unique > 1);
  const row = read8(directCpu, CUR_ROW);
  const col = read8(directCpu, CUR_COL);

  console.log(`direct changed bytes: ${diff.changed}`);
  console.log(`direct VRAM range: ${diff.min == null ? '(none)' : `${hex(diff.min)}..${hex(diff.max)}`}`);
  console.log(`direct non-zero bytes in status region: ${countNonZero(after)}`);
  console.log(`visible glyph pixels present: ${visibleGlyphsNonZero ? 'yes' : 'no'}`);
  console.log(`visible glyph byte patterns non-uniform: ${visibleGlyphsNonUniform ? 'yes' : 'no'}`);
  console.log(`cursor after 26 chars: D00595(row)=${row}, D00596(col)=${col}`);
  console.log(`row advancement expected: ${row === 1 && col === 0 ? 'yes' : 'no'}`);
  console.log(`matches golden status region: ${compare.matches ? 'yes' : 'no'}`);
  if (!compare.matches) {
    console.log(`golden mismatches: ${compare.mismatches}`);
    console.log(`first mismatches direct/golden: ${compare.first.join(', ')}`);
  }
  console.log('per-character non-zero byte counts:');
  console.log(stats.map((item, index) => `${index}:${JSON.stringify(item.char)}=${item.nonZero}/${item.unique}`).join(' '));
  console.log('direct status hex summary:');
  console.log(hexSummary(after));
}

main().catch((error) => {
  console.error(`phase484 failed: ${error?.stack ?? error}`);
  process.exitCode = 1;
});

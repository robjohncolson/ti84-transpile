import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET = 0x096f67;
const STACK_RESET_TOP = 0xd1a87e;

const WATCH_ADDRS = new Map([
  [0xd008d2, 'D008D2 VRAM base low'],
  [0xd008d3, 'D008D2+1 VRAM base mid'],
  [0xd008d4, 'D008D2+2 VRAM base high'],
  [0xd008d5, 'D008D5 VRAM high byte'],
  [0xd00595, 'D00595 cursor row'],
  [0xd00596, 'D00596 cursor col'],
  [0xd02505, 'D02505 cursor col duplicate'],
  [0xd02575, 'D02575 cursor type/char'],
  [0xd0008d, 'D0008D cursor flags (IY+0x0D)'],
]);

const KNOWN_TARGETS = new Map([
  [0x061980, 'putchar'],
  [0x061003, 'cursor_erase'],
  [0x061061, 'cursor_draw'],
  [0x060ef5, 'cursor_blink_orchestrator'],
  [0x096bee, 'cursor_blink_toggle'],
  [0x096ccf, 'cursor_show_sub'],
  [0x096cc8, 'unknown_096CC8'],
  [0x096f67, 'target_096F67'],
  [0x0a23e5, 'pixel_renderer'],
  [0x05e50c, 'cursor_to_vram_converter'],
  [0x097955, 'early_exit_097955'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function formatInstruction(insn) {
  if (!insn) return '<decode failed>';
  if (typeof insn === 'string') return insn;
  return insn.disasm || insn.text || insn.mnemonic || insn.opcode || JSON.stringify(insn);
}

function instructionLength(insn) {
  if (!insn) return 1;
  if (Number.isInteger(insn.length)) return insn.length;
  if (Number.isInteger(insn.size)) return insn.size;
  if (Array.isArray(insn.bytes)) return insn.bytes.length;
  if (insn.rawBytes?.length) return insn.rawBytes.length;
  return 1;
}

function readBytes(romBytes, pc, length) {
  const out = [];
  for (let i = 0; i < length; i++) out.push(hexByte(romBytes[pc + i] ?? 0));
  return out.join(' ');
}

function immediate24FromBytes(bytes, offset) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function immediate16FromBytes(bytes, offset) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function findAbsoluteAddresses(bytes) {
  const hits = [];
  for (let i = 0; i <= bytes.length - 3; i++) {
    const addr = immediate24FromBytes(bytes, i);
    if (WATCH_ADDRS.has(addr)) hits.push(`${WATCH_ADDRS.get(addr)} ${hex(addr)}`);
  }
  for (let i = 0; i <= bytes.length - 2; i++) {
    const low16 = immediate16FromBytes(bytes, i);
    for (const [addr, label] of WATCH_ADDRS) {
      if ((addr & 0xffff) === low16) hits.push(`${label} low16 ${hex(addr)}`);
    }
  }
  return [...new Set(hits)];
}

function branchTargetFrom(insn, text, bytes) {
  const fields = [insn?.target, insn?.addr, insn?.address, insn?.operand].filter(Number.isInteger);
  for (const field of fields) {
    if (field >= 0 && field <= 0xffffff) return field;
  }

  const match = text.match(/\b(?:CALL|JP|JR)\s+(?:[A-Z]+\s*,\s*)?(?:0x|\$)?([0-9A-F]{4,6})\b/i);
  if (match) return Number.parseInt(match[1], 16);

  if (/^\s*(CALL|JP)\b/i.test(text) && bytes.length >= 4) return immediate24FromBytes(bytes, bytes.length - 3);
  return null;
}

function isUnconditionalRet(text) {
  return /^\s*RET\s*$/i.test(text);
}

function loadRomBytes() {
  return new Uint8Array(fs.readFileSync(path.join(__dirname, 'ROM.rom')));
}

function loadOsIntoExecutor(executor, romBytes) {
  if (typeof executor.loadRom === 'function') return executor.loadRom(romBytes);
  if (typeof executor.loadOS === 'function') return executor.loadOS(romBytes);
  if (typeof executor.loadOs === 'function') return executor.loadOs(romBytes);
  if (executor.memory?.set) return executor.memory.set(romBytes, 0);
  if (executor.mem?.set) return executor.mem.set(romBytes, 0);
  throw new Error('Executor does not expose a known ROM loading API');
}

function getMemory(executor) {
  return executor.memory || executor.mem || executor.ram || executor.bus?.memory || executor.bus?.mem;
}

function memRead8(executor, addr) {
  if (typeof executor.read8 === 'function') return executor.read8(addr);
  if (typeof executor.readByte === 'function') return executor.readByte(addr);
  const mem = getMemory(executor);
  if (typeof mem?.read8 === 'function') return mem.read8(addr);
  if (typeof mem?.readByte === 'function') return mem.readByte(addr);
  return mem[addr];
}

function memWrite8(executor, addr, value) {
  if (typeof executor.write8 === 'function') return executor.write8(addr, value & 0xff);
  if (typeof executor.writeByte === 'function') return executor.writeByte(addr, value & 0xff);
  const mem = getMemory(executor);
  if (typeof mem?.write8 === 'function') return mem.write8(addr, value & 0xff);
  if (typeof mem?.writeByte === 'function') return mem.writeByte(addr, value & 0xff);
  mem[addr] = value & 0xff;
}

function snapshotVram(executor) {
  const base = memRead8(executor, 0xd008d2) | (memRead8(executor, 0xd008d3) << 8) | (memRead8(executor, 0xd008d4) << 16);
  const size = 320 * 240 * 2;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = memRead8(executor, base + i) ?? 0;
  return { base, bytes };
}

function diffVram(before, after) {
  let changed = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < Math.min(before.bytes.length, after.bytes.length); i++) {
    if (before.bytes[i] === after.bytes[i]) continue;
    changed++;
    const pixel = Math.floor(i / 2);
    const x = pixel % 320;
    const y = Math.floor(pixel / 320);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    changed,
    bbox: changed ? { minX, minY, maxX, maxY } : null,
  };
}

function coldBootExecutor(romBytes) {
  const bus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor({ peripheralBus: bus, timerInterrupt: false });
  loadOsIntoExecutor(executor, romBytes);

  if (executor.registers) {
    executor.registers.sp = STACK_RESET_TOP;
    executor.registers.iy = 0xd00080;
  }
  if (executor.state?.registers) {
    executor.state.registers.sp = STACK_RESET_TOP;
    executor.state.registers.iy = 0xd00080;
  }
  if (typeof executor.setRegister === 'function') {
    executor.setRegister('SP', STACK_RESET_TOP);
    executor.setRegister('IY', 0xd00080);
  }
  if (typeof executor.reset === 'function') executor.reset({ stackTop: STACK_RESET_TOP, timerInterrupt: false });
  return executor;
}

function setupCursor(executor, drawn) {
  memWrite8(executor, 0xd00595, 5);
  memWrite8(executor, 0xd00596, 10);
  memWrite8(executor, 0xd02505, 10);
  memWrite8(executor, 0xd02575, 0xe1);
  const flags = memRead8(executor, 0xd0008d) ?? 0;
  memWrite8(executor, 0xd0008d, drawn ? (flags | 0x04) : (flags & ~0x04));
}

function runDynamicCase(label, romBytes, drawn) {
  console.log(`\n=== Dynamic ${label} path ===`);
  const executor = coldBootExecutor(romBytes);
  setupCursor(executor, drawn);
  const before = snapshotVram(executor);
  const result = executor.runFrom(TARGET, 'adl', { maxSteps: 50000, maxLoopIterations: 5000 });
  const after = snapshotVram(executor);
  const diff = diffVram(before, after);
  const flagsAfter = memRead8(executor, 0xd0008d) ?? 0;

  console.log(`steps: ${result?.steps ?? result?.stepCount ?? '<unknown>'}`);
  console.log(`stop reason: ${result?.reason ?? result?.stopReason ?? result?.status ?? '<unknown>'}`);
  console.log(`VRAM base: ${hex(before.base)} -> ${hex(after.base)}`);
  console.log(`VRAM pixels/bytes changed: ${diff.changed}`);
  console.log(`bounding box: ${diff.bbox ? JSON.stringify(diff.bbox) : '<none>'}`);
  console.log(`D0008D after: ${hex(flagsAfter, 2)} (bit 2 ${flagsAfter & 0x04 ? 'SET' : 'CLEAR'})`);
}

function staticDisassembly(romBytes) {
  console.log(`=== Static disassembly from ${hex(TARGET)} ===`);
  const branchTargets = new Map();
  let pc = TARGET;
  const end = TARGET + 400;
  let foundRet = false;

  while (pc < end) {
    const insn = decodeInstruction(romBytes, pc, 'adl');
    const len = instructionLength(insn);
    const bytes = Array.from(romBytes.slice(pc, pc + len));
    const text = formatInstruction(insn);
    const annotations = [];
    const addrHits = findAbsoluteAddresses(bytes);
    annotations.push(...addrHits);

    if (/^\s*(CALL|JP|JR)\b/i.test(text)) {
      const target = branchTargetFrom(insn, text, bytes);
      if (target !== null) {
        branchTargets.set(target, KNOWN_TARGETS.get(target) || '<unknown>');
        annotations.push(`target ${hex(target)} ${KNOWN_TARGETS.get(target) ? `(${KNOWN_TARGETS.get(target)})` : ''}`.trim());
      }
    }

    console.log(`${hex(pc)}  ${readBytes(romBytes, pc, len).padEnd(14)}  ${text}${annotations.length ? `  ; ${annotations.join('; ')}` : ''}`);
    pc += Math.max(len, 1);
    if (isUnconditionalRet(text)) {
      foundRet = true;
      break;
    }
  }

  if (foundRet) {
    console.log('\n=== 20 bytes after RET ===');
    const contextEnd = pc + 20;
    while (pc < contextEnd) {
      const insn = decodeInstruction(romBytes, pc, 'adl');
      const len = instructionLength(insn);
      console.log(`${hex(pc)}  ${readBytes(romBytes, pc, len).padEnd(14)}  ${formatInstruction(insn)}`);
      pc += Math.max(len, 1);
    }
  } else {
    console.log('\nNo unconditional RET found within 400 bytes.');
  }

  console.log('\n=== CALL/JP/JR targets found ===');
  for (const [target, label] of branchTargets) console.log(`${hex(target)}  ${label}`);
  console.log(`directly calls cursor_draw ${hex(0x061061)}: ${branchTargets.has(0x061061) ? 'YES' : 'NO'}`);
  console.log(`directly calls cursor_erase ${hex(0x061003)}: ${branchTargets.has(0x061003) ? 'YES' : 'NO'}`);
}

const romBytes = loadRomBytes();
staticDisassembly(romBytes);
runDynamicCase('DRAW (cursor NOT drawn)', romBytes, false);
runDynamicCase('ERASE (cursor IS drawn)', romBytes, true);

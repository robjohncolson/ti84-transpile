import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STACK_RESET_TOP = 0xD1A87E;

const TARGET = 0x096CC8;
const TARGET_END = 0x096CCE;
const CONTEXT_END = 0x096D20;

const RAM_CURSOR_ROW = 0xD00595;
const RAM_CURSOR_COL = 0xD00596;
const RAM_CURSOR_COL_DUP = 0xD02505;
const RAM_CURSOR_TYPE = 0xD02575;
const RAM_VRAM_BASE = 0xD008D2;
const RAM_VRAM_HIGH = 0xD008D5;
const IY_BASE = 0xD00080;

const KNOWN_FUNCTIONS = new Map([
  [0x061980, 'putchar'],
  [0x061003, 'cursor_erase'],
  [0x061061, 'cursor_draw'],
  [0x060EF5, 'cursor_blink_orchestrator'],
  [0x096BEE, 'cursor_blink_toggle'],
  [0x096CC8, 'target_096CC8'],
  [0x096CCF, 'cursor_show_sub'],
  [0x096F67, 'draw_erase_dispatcher'],
  [0x0A23E5, 'pixel_renderer'],
  [0x05E50C, 'cursor_to_vram_converter'],
  [0x0A1F12, 'unknown_0A1F12'],
  [0x0994DC, 'unknown_0994DC'],
  [0x0A1EAD, 'unknown_0A1EAD'],
]);

const KNOWN_RAM = new Map([
  [0xD008D2, 'D008D2_VRAM_base'],
  [0xD008D5, 'D008D5_VRAM_high'],
  [0xD00595, 'D00595_cursor_row'],
  [0xD00596, 'D00596_cursor_col'],
  [0xD02505, 'D02505_cursor_col_duplicate'],
  [0xD02575, 'D02575_cursor_type_char'],
  [0xD0008D, 'D0008D_cursor_flags_IY_plus_0D'],
  [0xD007E0, 'D007E0_os_mode'],
  [0xD0060E, 'D0060E_unknown'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatRawBytes(bytes) {
  return [...bytes].map(hexByte).join(' ');
}

function getInstructionLength(insn) {
  return insn?.length ?? insn?.size ?? insn?.bytes?.length ?? 1;
}

function getInstructionText(insn) {
  if (typeof insn === 'string') return insn;
  return insn?.text ?? insn?.disasm ?? insn?.mnemonic ?? String(insn);
}

function formatInstruction(romBytes, pc, insn) {
  const length = getInstructionLength(insn);
  const raw = romBytes.slice(pc, pc + length);
  return `${hex(pc)}  ${formatRawBytes(raw).padEnd(16)}  ${getInstructionText(insn)}`;
}

function isUnconditionalRet(insn) {
  return /^ret$/i.test(getInstructionText(insn).trim());
}

function findKnownFunctionRefs(text) {
  const refs = [];
  for (const [addr, name] of KNOWN_FUNCTIONS) {
    const compact = addr.toString(16).toUpperCase().padStart(6, '0');
    const loose = addr.toString(16).toUpperCase().replace(/^0+/, '');
    if (
      text.toUpperCase().includes(`0X${compact}`) ||
      text.toUpperCase().includes(`$${compact}`) ||
      text.toUpperCase().includes(compact) ||
      text.toUpperCase().includes(`0X${loose}`) ||
      text.toUpperCase().includes(`$${loose}`)
    ) {
      refs.push(`${name} (${hex(addr)})`);
    }
  }
  return refs;
}

function findKnownRamRefs(text) {
  const refs = [];
  for (const [addr, name] of KNOWN_RAM) {
    const compact = addr.toString(16).toUpperCase().padStart(6, '0');
    const loose = addr.toString(16).toUpperCase().replace(/^0+/, '');
    if (
      text.toUpperCase().includes(`0X${compact}`) ||
      text.toUpperCase().includes(`$${compact}`) ||
      text.toUpperCase().includes(compact) ||
      text.toUpperCase().includes(`0X${loose}`) ||
      text.toUpperCase().includes(`$${loose}`)
    ) {
      refs.push(`${name} (${hex(addr)})`);
    }
  }
  return refs;
}

function disassembleRange(romBytes, start, endInclusive, stopAtRet = false) {
  const decoded = [];
  let pc = start;
  while (pc <= endInclusive) {
    const insn = decodeInstruction(romBytes, pc, 'adl');
    const length = getInstructionLength(insn);
    decoded.push({ pc, insn, length, text: getInstructionText(insn) });
    pc += length;
    if (stopAtRet && isUnconditionalRet(insn)) break;
  }
  return decoded;
}

function readU8(executor, addr) {
  if (executor.memory?.readU8) return executor.memory.readU8(addr);
  if (executor.bus?.readU8) return executor.bus.readU8(addr);
  if (executor.readU8) return executor.readU8(addr);
  return executor.mem[addr & 0xFFFFFF];
}

function writeU8(executor, addr, value) {
  if (executor.memory?.writeU8) return executor.memory.writeU8(addr, value);
  if (executor.bus?.writeU8) return executor.bus.writeU8(addr, value);
  if (executor.writeU8) return executor.writeU8(addr, value);
  executor.mem[addr & 0xFFFFFF] = value & 0xFF;
}

function readBytes(executor, start, length) {
  return Array.from({ length }, (_, i) => readU8(executor, start + i));
}

function setRegister(executor, name, value) {
  if (executor.cpu?.regs && name in executor.cpu.regs) {
    executor.cpu.regs[name] = value;
  } else if (executor.cpu && name in executor.cpu) {
    executor.cpu[name] = value;
  } else if (executor.registers && name in executor.registers) {
    executor.registers[name] = value;
  } else if (executor.regs && name in executor.regs) {
    executor.regs[name] = value;
  }
}

function getRegister(executor, name) {
  if (executor.cpu?.regs && name in executor.cpu.regs) return executor.cpu.regs[name];
  if (executor.cpu && name in executor.cpu) return executor.cpu[name];
  if (executor.registers && name in executor.registers) return executor.registers[name];
  if (executor.regs && name in executor.regs) return executor.regs[name];
  return undefined;
}

function snapshotRegisters(executor) {
  const names = ['A', 'BC', 'DE', 'HL', 'IX', 'IY', 'SP', 'PC'];
  return Object.fromEntries(names.map((name) => [name, getRegister(executor, name)]));
}

function printRegisterChanges(before, after) {
  let changed = false;
  for (const name of Object.keys(before)) {
    if (before[name] !== after[name]) {
      changed = true;
      console.log(`  ${name}: ${hex(before[name] ?? 0)} -> ${hex(after[name] ?? 0)}`);
    }
  }
  if (!changed) console.log('  none');
}

function printMemoryChanges(label, before, after, base) {
  const changes = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      changes.push(`${hex(base + i)}: ${hexByte(before[i])} -> ${hexByte(after[i])}`);
    }
  }
  console.log(`${label}:`);
  if (changes.length === 0) {
    console.log('  none');
  } else {
    for (const change of changes.slice(0, 80)) console.log(`  ${change}`);
    if (changes.length > 80) console.log(`  ... ${changes.length - 80} more`);
  }
}

function coldBootExecutor(romBytes) {
  const peripheralBus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(romBytes, { peripheralBus, timerInterrupt: false });
  setRegister(executor, 'SP', STACK_RESET_TOP);
  if (typeof executor.runFrom === 'function') {
    executor.runFrom(0x000000, 'adl', { maxSteps: 250000 });
  }
  return executor;
}

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

console.log('=== Part 1: Static disassembly of 0x096CC8 ===');
const targetDecoded = disassembleRange(romBytes, TARGET, TARGET_END, true);
for (const entry of targetDecoded) {
  console.log(formatInstruction(romBytes, entry.pc, entry.insn));
}
const byteCount = targetDecoded.reduce((sum, entry) => sum + entry.length, 0);
console.log(`Total bytes decoded: ${byteCount}`);

const knownFunctionRefs = new Set();
const knownRamRefs = new Set();
for (const entry of targetDecoded) {
  for (const ref of findKnownFunctionRefs(entry.text)) knownFunctionRefs.add(ref);
  for (const ref of findKnownRamRefs(entry.text)) knownRamRefs.add(ref);
}
console.log(`Known function refs: ${knownFunctionRefs.size ? [...knownFunctionRefs].join(', ') : 'none detected'}`);
console.log(`Known RAM refs: ${knownRamRefs.size ? [...knownRamRefs].join(', ') : 'none detected'}`);

console.log('\n=== Part 2: Static context 0x096CC8 through 0x096D20 ===');
const contextDecoded = disassembleRange(romBytes, TARGET, CONTEXT_END, false);
for (const entry of contextDecoded) {
  const marker = entry.pc === TARGET ? '<-- 0x096CC8' : entry.pc === 0x096CCF ? '<-- 0x096CCF' : '';
  console.log(`${formatInstruction(romBytes, entry.pc, entry.insn)} ${marker}`.trimEnd());
}

console.log('\n=== Part 3: Dynamic direct call of 0x096CC8 ===');
const executor = coldBootExecutor(romBytes);

writeU8(executor, RAM_CURSOR_ROW, 5);
writeU8(executor, RAM_CURSOR_COL, 10);
writeU8(executor, RAM_CURSOR_COL_DUP, 10);
writeU8(executor, RAM_CURSOR_TYPE, 0xE1);
setRegister(executor, 'IY', IY_BASE);

const regsBefore = snapshotRegisters(executor);
const vramBefore = readBytes(executor, 0xD40000, 0x2D00);
const watchedBefore = new Map([
  ['D00595_cursor_row', readU8(executor, RAM_CURSOR_ROW)],
  ['D00596_cursor_col', readU8(executor, RAM_CURSOR_COL)],
  ['D008D2_VRAM_base+0', readU8(executor, RAM_VRAM_BASE)],
  ['D008D2_VRAM_base+1', readU8(executor, RAM_VRAM_BASE + 1)],
  ['D008D2_VRAM_base+2', readU8(executor, RAM_VRAM_BASE + 2)],
  ['D008D5_VRAM_high', readU8(executor, RAM_VRAM_HIGH)],
]);

const result = executor.runFrom(TARGET, 'adl', { maxSteps: 5000 });

const regsAfter = snapshotRegisters(executor);
const vramAfter = readBytes(executor, 0xD40000, 0x2D00);
const watchedAfter = new Map([
  ['D00595_cursor_row', readU8(executor, RAM_CURSOR_ROW)],
  ['D00596_cursor_col', readU8(executor, RAM_CURSOR_COL)],
  ['D008D2_VRAM_base+0', readU8(executor, RAM_VRAM_BASE)],
  ['D008D2_VRAM_base+1', readU8(executor, RAM_VRAM_BASE + 1)],
  ['D008D2_VRAM_base+2', readU8(executor, RAM_VRAM_BASE + 2)],
  ['D008D5_VRAM_high', readU8(executor, RAM_VRAM_HIGH)],
]);

console.log(`Steps: ${result?.steps ?? 'unknown'}`);
console.log(`Stop reason: ${result?.reason ?? result?.stopReason ?? 'unknown'}`);
console.log(`Final PC: ${hex(result?.pc ?? getRegister(executor, 'PC') ?? 0)}`);

console.log('Register changes:');
printRegisterChanges(regsBefore, regsAfter);

printMemoryChanges('VRAM changes', vramBefore, vramAfter, 0xD40000);

console.log('Watched RAM changes:');
let watchedChanged = false;
for (const [name, before] of watchedBefore) {
  const after = watchedAfter.get(name);
  if (before !== after) {
    watchedChanged = true;
    console.log(`  ${name}: ${hexByte(before)} -> ${hexByte(after)}`);
  }
}
if (!watchedChanged) console.log('  none');

console.log('\n=== Summary hypothesis ===');
console.log(
  '0x096CC8 is constrained to the seven bytes immediately before cursor_show_sub. ' +
    'If the static decode shows a short register/VARAM helper with no rendering calls, it is likely the tiny cursor-position setup step used after 0x096CCF temporarily moves the cursor row and IX to the adjacent line. ' +
    'The dynamic direct call output above should confirm whether it only updates address/register state or also touches cursor RAM/VRAM.'
);

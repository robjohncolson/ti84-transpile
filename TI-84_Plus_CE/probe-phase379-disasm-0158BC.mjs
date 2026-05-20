#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const BOOT_RESET_SP = 0xD1A87E - 3;
const EVENT_RESET_SP = 0xD1A87E - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 200000, maxLoopIterations: 100000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const ENTER_SCAN_CODE = 0x29;
const CLEAR_SCAN_CODE = 0x2F;

const FLASH_GATE_ADDR = 0x020100;
const FLASH_GATE_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;
const COLDBOOT_RUNTIME_SEEDS = [
  [0xD02AD7, 0xBE],
  [0xD02AD8, 0x19],
  [0xD02AD9, 0x00],
];

const POST_KEY_SUBROUTINE = 0x0158BC;
const POST_KEY_HANDLER = 0x0158DE;
const POST_KEY_END = 0x0158F9;
const HELPER_COMPARE = 0x001C33;
const HELPER_MATCH_PARSE = 0x001C4F;
const HELPER_ROOT_SEARCH = 0x001C55;
const HELPER_SKIP = 0x001C7D;
const HELPER_DESCRIPTOR = 0x001CA6;

const ROOT_SELECTOR = 0x0330;
const CHILD_SELECTOR = 0x0430;
const TABLE_HEADER = 0x3B0000;
const TABLE_START = 0x3B0001;
const TABLE_READ_START = 0x3B0000;
const TABLE_READ_END = 0x3B0100;
const TABLE_DUMP_LENGTH = 0x100;
const TABLE_SENTINEL = 0xFF;

const WATCHED_BLOCKS = new Map([
  [POST_KEY_HANDLER, '0x0158DE post-key handler'],
  [POST_KEY_SUBROUTINE, '0x0158BC action-table dispatcher'],
  [HELPER_ROOT_SEARCH, '0x001C55 root-table search'],
  [HELPER_COMPARE, '0x001C33 compare loop'],
  [0x001C44, '0x001C44 mismatch edge'],
  [HELPER_MATCH_PARSE, '0x001C4F match-parse helper'],
  [HELPER_SKIP, '0x001C7D skip helper'],
  [HELPER_DESCRIPTOR, '0x001CA6 descriptor parser'],
]);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

function hex(value, width = 6) {
  return `0x${(Number(value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}
function hexByte(value) { return hex((Number(value) || 0) & 0xFF, 2); }
function count(value) { return Number(value ?? 0).toLocaleString('en-US'); }
function bytesToHex(buffer, start, len) {
  return Array.from(buffer.subarray(start, Math.min(buffer.length, start + len)), (b) => hexByte(b).slice(2)).join(' ');
}
function previewBytes(buffer, start, len, max = 24) {
  const shown = Math.min(len, max);
  const text = bytesToHex(buffer, start, shown);
  return len > shown ? `${text} ...` : text;
}
function normalizeBlocks(raw) {
  if (Array.isArray(raw)) return Object.fromEntries(raw.filter((x) => x?.id).map((x) => [x.id, x]));
  return raw ?? {};
}
function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}
function snapshotCpu(cpu) {
  const snap = {};
  for (const field of CPU_SNAPSHOT_FIELDS) snap[field] = cpu[field];
  return snap;
}
function restoreCpu(cpu, snap) {
  for (const field of CPU_SNAPSHOT_FIELDS) cpu[field] = snap[field];
}
function restoreLcdMmio(executor, snap) {
  if (snap && executor?.lcdMmio) {
    executor.lcdMmio.upbase = snap.upbase;
    executor.lcdMmio.control = snap.control;
  }
}
function captureRegisters(cpu) {
  return {
    a: cpu.a & 0xFF, f: cpu.f & 0xFF, hl: cpu._hl & 0xFFFFFF, bc: cpu._bc & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF, sp: cpu.sp & 0xFFFFFF, ix: cpu._ix & 0xFFFFFF, iy: cpu._iy & 0xFFFFFF,
  };
}
function formatRegisters(r) {
  return `A=${hexByte(r.a)} F=${hexByte(r.f)} HL=${hex(r.hl)} BC=${hex(r.bc)} DE=${hex(r.de)} SP=${hex(r.sp)} IX=${hex(r.ix)} IY=${hex(r.iy)}`;
}
function bump(map, key) { map.set(key, (map.get(key) ?? 0) + 1); }

function formatInst(inst) {
  const s = (text) => (inst.modePrefix ? `${inst.modePrefix} ${text}` : text);
  switch (inst?.tag) {
    case 'db': return `db ${hexByte(inst.value)}`;
    case 'ret': case 'scf': case 'nop': case 'di': case 'ei': return inst.tag;
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ld-pair-imm': return s(`ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-reg-imm': return s(`ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-ind': return s(`ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-reg': return s(`ld ${inst.dest}, ${inst.src}`);
    case 'ld-sp-pair': return s(`ld sp, ${inst.pair}`);
    case 'ld-pair-indexed': return s(`ld ${inst.pair}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`);
    case 'ld-ixd-reg': return s(`ld (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src}`);
    case 'push': return s(`push ${inst.pair}`);
    case 'pop': return s(`pop ${inst.pair}`);
    case 'inc-pair': return s(`inc ${inst.pair}`);
    case 'dec-pair': return s(`dec ${inst.pair}`);
    case 'dec-reg': return s(`dec ${inst.reg}`);
    case 'add-pair': return s(`add ${inst.dest}, ${inst.src}`);
    case 'sbc-pair': return s(`sbc hl, ${inst.src}`);
    case 'alu-imm': return s(`${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg': return s(`${inst.op} ${inst.src}`);
    case 'bit-test': return s(`bit ${inst.bit}, ${inst.reg}`);
    case 'indexed-cb-bit': return s(`bit ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`);
    case 'indexed-cb-set': return s(`set ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`);
    default: return s(inst?.tag ?? 'unknown');
  }
}
function safeDecode(memory, pc) {
  try {
    const inst = decodeInstruction(memory, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) throw new Error('invalid decode');
    return inst;
  } catch (error) {
    return { tag: 'db', value: memory[pc] ?? 0, length: 1, decodeError: String(error) };
  }
}
function disassembleRange(memory, start, endInclusive) {
  const rows = [];
  let pc = start;
  while (pc <= endInclusive && pc < memory.length) {
    const inst = safeDecode(memory, pc);
    rows.push({ pc, bytes: bytesToHex(memory, pc, Math.max(inst.length ?? 1, 1)), text: formatInst(inst), note: inst.decodeError ?? '' });
    pc += Math.max(inst.length ?? 1, 1);
  }
  return rows;
}
function disassembleCount(memory, start, countLimit) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < countLimit && pc < memory.length; i += 1) {
    const inst = safeDecode(memory, pc);
    rows.push({ pc, bytes: bytesToHex(memory, pc, Math.max(inst.length ?? 1, 1)), text: formatInst(inst), note: inst.decodeError ?? '' });
    pc += Math.max(inst.length ?? 1, 1);
  }
  return rows;
}

function parseDescriptor(memory, descriptorAddr) {
  const token = memory[descriptorAddr] ?? 0;
  const low = token & 0x0F;
  if (low === 0x0D) return { token, kind: 'len8', consumed: 2, payloadSize: memory[descriptorAddr + 1] ?? 0 };
  if (low === 0x0E) return { token, kind: 'len16', consumed: 3, payloadSize: ((memory[descriptorAddr + 1] ?? 0) << 8) | (memory[descriptorAddr + 2] ?? 0) };
  if (low === 0x0F) {
    const marker = memory[descriptorAddr + 1] ?? 0;
    if (marker !== 0x00) return { token, kind: 'ptr24-invalid', consumed: 2, marker };
    return {
      token, kind: 'ptr24', consumed: 5,
      pointer24: (((memory[descriptorAddr + 2] ?? 0) << 16) | ((memory[descriptorAddr + 3] ?? 0) << 8) | (memory[descriptorAddr + 4] ?? 0)) >>> 0,
    };
  }
  return { token, kind: 'len4', consumed: 1, payloadSize: low };
}
function describeDescriptor(desc) {
  if (desc.kind === 'len4' || desc.kind === 'len8' || desc.kind === 'len16') return `${desc.kind}=${count(desc.payloadSize)}`;
  if (desc.kind === 'ptr24') return `ptr24=${hex(desc.pointer24)}`;
  return `ptr24-invalid marker=${hexByte(desc.marker)}`;
}
function parseEntry(memory, entryStart) {
  const key0 = memory[entryStart] ?? 0;
  const descriptorAddr = entryStart + 1;
  const descriptor = parseDescriptor(memory, descriptorAddr);
  const key1 = memory[descriptorAddr] ?? 0;
  const payloadStart = descriptorAddr + descriptor.consumed;
  const payloadSize = descriptor.payloadSize ?? 0;
  const entryEnd = (descriptor.kind === 'len4' || descriptor.kind === 'len8' || descriptor.kind === 'len16') ? payloadStart + payloadSize : payloadStart;
  const payloadPreview = (descriptor.kind === 'len4' || descriptor.kind === 'len8' || descriptor.kind === 'len16')
    ? previewBytes(memory, payloadStart, payloadSize)
    : previewBytes(memory, descriptorAddr + 1, Math.max(0, descriptor.consumed - 1));
  return { entryStart, key0, key1, descriptor, payloadStart, entryEnd, payloadPreview, selectorNibble: key1 & 0xF0 };
}
function summarizeEntry(entry) {
  const base = `${hex(entry.entryStart)} key0=${hexByte(entry.key0)} key1=${hexByte(entry.key1)} hi=${hexByte(entry.selectorNibble)} ${describeDescriptor(entry.descriptor)}`;
  if (entry.descriptor.kind === 'len4' || entry.descriptor.kind === 'len8' || entry.descriptor.kind === 'len16') {
    return `${base} payload@${hex(entry.payloadStart)}=${entry.payloadPreview || '(empty)'} next=${hex(entry.entryEnd)}`;
  }
  return `${base} raw=${entry.payloadPreview || '(empty)'} next=${hex(entry.entryEnd)}`;
}
function collectEntries(memory, start, stopExclusive, maxEntries = 64) {
  const entries = [];
  let cursor = start;
  let sentinelStart = null;
  while (cursor < stopExclusive && entries.length < maxEntries) {
    if ((memory[cursor] ?? 0) === TABLE_SENTINEL) { sentinelStart = cursor; break; }
    const entry = parseEntry(memory, cursor);
    entries.push(entry);
    if (entry.entryEnd <= cursor) break;
    cursor = entry.entryEnd;
  }
  return { entries, sentinelStart, stop: cursor };
}
function findSelectorMatches(entries, selector) {
  const key0 = (selector >> 8) & 0xFF;
  const hi = selector & 0xF0;
  return entries.filter((entry) => entry.key0 === key0 && (entry.key1 & 0xF0) === hi);
}
function compressAddresses(addresses) {
  if (addresses.length === 0) return [];
  const spans = [];
  let start = addresses[0];
  let prev = addresses[0];
  for (let i = 1; i < addresses.length; i += 1) {
    const addr = addresses[i];
    if (addr === prev + 1) { prev = addr; continue; }
    spans.push(start === prev ? hex(start) : `${hex(start)}-${hex(prev)}`);
    start = prev = addr;
  }
  spans.push(start === prev ? hex(start) : `${hex(start)}-${hex(prev)}`);
  return spans;
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const executor = createExecutor(blocks, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  const { cpu } = executor;
  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu._iy = KEY_STATUS_ADDR; cpu.sp = BOOT_RESET_SP; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);
  cpu.mbase = 0xD0; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu._iy = KEY_STATUS_ADDR; cpu.sp = BOOT_RESET_SP; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);
  return { phaseResults: [{ label: 'Phase 1', result: phase1 }, { label: 'Phase 2', result: phase2 }, { label: 'Phase 3', result: phase3 }], memSnapshot: Buffer.from(mem), cpuSnapshot: snapshotCpu(cpu), lcdSnapshot: executor.lcdMmio ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control } : null };
}

function runScenario(blocks, bootState, scanCode, label) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const executor = createExecutor(blocks, mem, { peripherals: createPeripheralBus({ timerInterrupt: true }) });
  const { cpu } = executor;
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu.f = 0x40; cpu.madl = 1; cpu.mbase = 0xD0; cpu._ix = 0xD1A860; cpu._iy = KEY_STATUS_ADDR; cpu.sp = EVENT_RESET_SP; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  for (const [addr, value] of COLDBOOT_RUNTIME_SEEDS) mem[addr] = value;
  mem[0xD0009B] |= 0x40;
  for (let i = 0; i < FLASH_GATE_BYTES.length; i += 1) mem[FLASH_GATE_ADDR + i] = FLASH_GATE_BYTES[i];
  mem[SYSFLAG_ADDR] = 0x00;
  mem[KEY_SCAN_CODE_ADDR] = 0x00; mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;
  mem[KEY_SCAN_CODE_ADDR] = scanCode & 0xFF; mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;

  const trace = { blockLog: [], compareLog: [], parserLog: [], readLog: [], readCounts: new Map(), uniqueBlocks: new Set() };
  const origRead8 = cpu.read8.bind(cpu);
  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    const a = addr & 0xFFFFFF;
    if (a >= TABLE_READ_START && a <= TABLE_READ_END) {
      bump(trace.readCounts, a);
      if (trace.readLog.length < 160) trace.readLog.push({ step: cpu.stepCount ?? 0, blockPc: cpu._currentBlockPc ?? cpu.pc ?? 0, addr: a, value: value & 0xFF, registers: captureRegisters(cpu) });
    }
    return value;
  };

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const addr = pc & 0xFFFFFF;
      trace.uniqueBlocks.add(`${hex(addr)}:${mode}`);
      if (!WATCHED_BLOCKS.has(addr)) return;
      if (trace.blockLog.length < 80) trace.blockLog.push({ step, pc: addr, label: WATCHED_BLOCKS.get(addr), registers: captureRegisters(cpu) });
      if (addr === HELPER_COMPARE && trace.compareLog.length < 40) {
        trace.compareLog.push({ step, selectorKey0: cpu.d & 0xFF, selectorNibble: cpu.e & 0xF0, cursor: cpu.hl & 0xFFFFFF, entry: parseEntry(mem, cpu.hl & 0xFFFFFF) });
      }
      if (addr === HELPER_DESCRIPTOR && trace.parserLog.length < 40) {
        trace.parserLog.push({ step, pointer: cpu.hl & 0xFFFFFF, bytes: bytesToHex(mem, cpu.hl & 0xFFFFFF, 12), descriptor: parseDescriptor(mem, cpu.hl & 0xFFFFFF) });
      }
    },
  });

  const uniqueReadAddresses = [...trace.readCounts.keys()].sort((a, b) => a - b);
  return { label, scanCode, result, trace, finalScanCode: mem[KEY_SCAN_CODE_ADDR] & 0xFF, finalStatus: mem[KEY_STATUS_ADDR] & 0xFF, uniqueReadAddresses };
}

function printDisassembly(title, rows) {
  console.log(`=== ${title} ===`);
  for (const row of rows) console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.note ? ` [${row.note}]` : ''}`);
  console.log('');
}
function printScenario(scenario) {
  const topReads = [...scenario.trace.readCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 16);
  console.log(`=== DYNAMIC TRACE: ${scenario.label.toUpperCase()} (${hexByte(scenario.scanCode)}) ===`);
  console.log(`result: steps=${count(scenario.result.steps)} termination=${scenario.result.termination} lastPc=${hex(scenario.result.lastPc)} loopsForced=${count(scenario.result.loopsForced)}`);
  console.log(`final key RAM: ${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(scenario.finalScanCode)} ${hex(KEY_STATUS_ADDR)}=${hexByte(scenario.finalStatus)}`);
  console.log(`table read spans: ${compressAddresses(scenario.uniqueReadAddresses).join(', ') || 'none'}`);
  console.log('');
  console.log('watched blocks:');
  for (const hit of scenario.trace.blockLog) console.log(`  step=${count(hit.step + 1)} pc=${hex(hit.pc)} ${hit.label} | ${formatRegisters(hit.registers)}`);
  if (scenario.trace.blockLog.length === 0) console.log('  none');
  console.log('');
  console.log('compare-loop entries:');
  for (const row of scenario.trace.compareLog) console.log(`  step=${count(row.step + 1)} selector={${hexByte(row.selectorKey0)}, ${hexByte(row.selectorNibble)}} cursor=${hex(row.cursor)} -> ${summarizeEntry(row.entry)}`);
  if (scenario.trace.compareLog.length === 0) console.log('  none');
  console.log('');
  console.log('descriptor parses:');
  for (const row of scenario.trace.parserLog) console.log(`  step=${count(row.step + 1)} ptr=${hex(row.pointer)} bytes=${row.bytes} => ${describeDescriptor(row.descriptor)}`);
  if (scenario.trace.parserLog.length === 0) console.log('  none');
  console.log('');
  console.log('hottest table reads:');
  for (const [addr, reads] of topReads) console.log(`  ${hex(addr)} -> ${count(reads)} read(s)`);
  if (topReads.length === 0) console.log('  none');
  console.log('');
  console.log('first table reads:');
  for (const row of scenario.trace.readLog) console.log(`  step=${count(row.step + 1)} block=${hex(row.blockPc)} read ${hex(row.addr)} => ${hexByte(row.value)} | ${formatRegisters(row.registers)}`);
  if (scenario.trace.readLog.length === 0) console.log('  none');
  console.log('');
}

if (!fs.existsSync(ROM_PATH)) throw new Error(`ROM not found: ${ROM_PATH}`);
if (!fs.existsSync(TRANSPILED_PATH)) throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = normalizeBlocks(romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule);
if (!blocks || Object.keys(blocks).length === 0) throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');

const rootEntriesInfo = collectEntries(romBytes, TABLE_START, TABLE_START + TABLE_DUMP_LENGTH);
const rootMatches = findSelectorMatches(rootEntriesInfo.entries, ROOT_SELECTOR);
const childEntriesInfo = rootMatches.length > 0 ? collectEntries(romBytes, rootMatches[0].payloadStart, rootMatches[0].entryEnd) : { entries: [], sentinelStart: null, stop: TABLE_START };
const childMatches = findSelectorMatches(childEntriesInfo.entries, CHILD_SELECTOR);

console.log('=== PROBE: PHASE 379 0x0158BC / 0x3B0001 ACTION TABLE ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Transpiled: ${TRANSPILED_PATH}`);
console.log(`coldboot event bus: createPeripheralBus({ timerInterrupt: true })`);
console.log(`direct RAM injection: ENTER=${hexByte(ENTER_SCAN_CODE)} CLEAR=${hexByte(CLEAR_SCAN_CODE)} -> ${hex(KEY_SCAN_CODE_ADDR)}, plus bit 3 of ${hex(KEY_STATUS_ADDR)}`);
console.log('');

printDisassembly(`STATIC DISASSEMBLY ${hex(POST_KEY_SUBROUTINE)}-${hex(POST_KEY_END)}`, disassembleRange(romBytes, POST_KEY_SUBROUTINE, POST_KEY_END));
printDisassembly(`HELPER ${hex(HELPER_ROOT_SEARCH)} first 30 instructions`, disassembleCount(romBytes, HELPER_ROOT_SEARCH, 30));
printDisassembly(`HELPER ${hex(HELPER_COMPARE)} first 30 instructions`, disassembleCount(romBytes, HELPER_COMPARE, 30));
printDisassembly(`HELPER ${hex(HELPER_MATCH_PARSE)} first 30 instructions`, disassembleCount(romBytes, HELPER_MATCH_PARSE, 30));
printDisassembly(`HELPER ${hex(HELPER_DESCRIPTOR)} first 30 instructions`, disassembleCount(romBytes, HELPER_DESCRIPTOR, 30));

console.log('=== RAW TABLE DUMP 0x3B0001-0x3B0100 ===');
console.log(`0x3B0000 header byte: ${hexByte(romBytes[TABLE_HEADER])}`);
for (let offset = 0; offset < TABLE_DUMP_LENGTH; offset += 16) console.log(`  ${hex(TABLE_START + offset)}: ${bytesToHex(romBytes, TABLE_START + offset, 16)}`);
console.log('');

console.log('=== TABLE STRUCTURE ===');
console.log(`root search starts at ${hex(TABLE_START)} because ${hex(HELPER_ROOT_SEARCH)} executes "ld hl, 0x3B0001".`);
console.log('entry format from 0x001C33/0x001CA6: byte0=selector, byte1 high nibble=class, byte1 low nibble=descriptor kind.');
for (const entry of rootEntriesInfo.entries) console.log(`  ${summarizeEntry(entry)}`);
console.log(`  sentinel: ${hex(rootEntriesInfo.sentinelStart ?? rootEntriesInfo.stop)} = ${hexByte(romBytes[rootEntriesInfo.sentinelStart ?? rootEntriesInfo.stop] ?? 0)}`);
console.log('');
console.log(`selector ${hex(ROOT_SELECTOR)} root matches: ${rootMatches.length > 0 ? rootMatches.map((entry) => hex(entry.entryStart)).join(', ') : 'none'}`);
if (rootMatches.length > 0) {
  console.log(`payload window for second-stage scan: ${hex(rootMatches[0].payloadStart)}-${hex(rootMatches[0].entryEnd - 1)}`);
  for (const entry of childEntriesInfo.entries) console.log(`  ${summarizeEntry(entry)}`);
}
console.log(`selector ${hex(CHILD_SELECTOR)} child matches: ${childMatches.length > 0 ? childMatches.map((entry) => hex(entry.entryStart)).join(', ') : 'none'}`);
console.log('');

console.log('=== STATIC ASSESSMENT ===');
console.log(`0x0158BC hard-codes DE=${hex(ROOT_SELECTOR)} then DE=${hex(CHILD_SELECTOR)}. HL is the moving table cursor; BC is parser output; A carries compare state and return flags.`);
console.log(`First stage: ${hex(HELPER_ROOT_SEARCH)} resets HL=${hex(TABLE_START)} and scans for key0=0x03 with high nibble 0x30.`);
console.log(`Second stage: ${hex(HELPER_MATCH_PARSE)} / ${hex(HELPER_DESCRIPTOR)} leave HL at the first-stage payload start, then ${hex(HELPER_COMPARE)} scans that payload for key0=0x04 with high nibble 0x30.`);
console.log(`Observed root-stage match: ${rootMatches.length > 0 ? hex(rootMatches[0].entryStart) : 'none'}. Observed child-stage match: ${childMatches.length > 0 ? childMatches.map((entry) => hex(entry.entryStart)).join(', ') : 'none'}.`);
console.log('');

const bootState = runBootPhases(blocks, romBytes);
console.log('=== BOOT SUMMARY ===');
for (const phase of bootState.phaseResults) console.log(`${phase.label}: steps=${count(phase.result.steps)} termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`);
console.log('');

const enterScenario = runScenario(blocks, bootState, ENTER_SCAN_CODE, 'enter');
const clearScenario = runScenario(blocks, bootState, CLEAR_SCAN_CODE, 'clear');
printScenario(enterScenario);
printScenario(clearScenario);

const enterOnly = enterScenario.uniqueReadAddresses.filter((addr) => !clearScenario.uniqueReadAddresses.includes(addr));
const clearOnly = clearScenario.uniqueReadAddresses.filter((addr) => !enterScenario.uniqueReadAddresses.includes(addr));
const enterCompare = [...new Set(enterScenario.trace.compareLog.map((x) => x.entry.entryStart))].sort((a, b) => a - b);
const clearCompare = [...new Set(clearScenario.trace.compareLog.map((x) => x.entry.entryStart))].sort((a, b) => a - b);

console.log('=== ENTER VS CLEAR COMPARISON ===');
console.log(`ENTER read spans: ${compressAddresses(enterScenario.uniqueReadAddresses).join(', ') || 'none'}`);
console.log(`CLEAR read spans: ${compressAddresses(clearScenario.uniqueReadAddresses).join(', ') || 'none'}`);
console.log(`ENTER-only reads: ${compressAddresses(enterOnly).join(', ') || 'none'}`);
console.log(`CLEAR-only reads: ${compressAddresses(clearOnly).join(', ') || 'none'}`);
console.log(`ENTER compare entries: ${enterCompare.map((addr) => hex(addr)).join(', ') || 'none'}`);
console.log(`CLEAR compare entries: ${clearCompare.map((addr) => hex(addr)).join(', ') || 'none'}`);
console.log(enterOnly.length === 0 && clearOnly.length === 0
  ? 'assessment: ENTER and CLEAR touched the same 0x3Bxxxx footprint in this trace window.'
  : 'assessment: ENTER and CLEAR diverged in their 0x3Bxxxx footprint.');

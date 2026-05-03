#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;

const GETCSC_ENTRY = 0x03CF7D;
const KEYBOARD_SCAN_ROUTINE = 0x0159C0;

const STACK_RESET_TOP = 0xD1A87E;
const OS_IY = 0xD00080;
const OS_MBASE = 0xD0;

const MAX_DISASM_INSTRUCTIONS = 64;
const MAX_TRACE_STEPS = 200;
const MAX_LOOP_ITERATIONS = 128;

const RAM_TRACE_START = 0xD00000;
const RAM_TRACE_END = 0xD1FFFF;
const STACK_TRACE_START = STACK_RESET_TOP - 0x100;
const STACK_TRACE_END = STACK_RESET_TOP + 0x20;

const MMIO_START = 0xE00800;
const MMIO_END = 0xE00FFF;

const CALLBACK_PTR_START = 0xD02AD7;
const CALLBACK_PTR_END = 0xD02AD9;
const CALLBACK_WINDOW_START = 0xD02AD0;
const CALLBACK_WINDOW_END = 0xD02AE0;

const STATIC_STOP_TAGS = new Set(['ret', 'reti', 'retn', 'halt', 'slp']);
const CONTROL_FLOW_TAGS = new Set([
  'call',
  'call-conditional',
  'jp',
  'jp-conditional',
  'jr',
  'jr-conditional',
  'rst',
]);

const romBytes = fs.readFileSync(ROM_PATH).subarray(0, ROM_LIMIT);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks ?? {};

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => (value & 0xFF).toString(16).padStart(2, '0')).join(' ');
}

function formatStep(step) {
  return String(step).padStart(3, ' ');
}

function intersectsRange(addr, width, start, end) {
  const normalizedAddr = Number(addr) & 0xFFFFFF;
  const normalizedWidth = Math.max(1, Number(width) | 0);
  return normalizedAddr <= end && (normalizedAddr + normalizedWidth - 1) >= start;
}

function normalizeWidthValue(width, value) {
  const normalized = Number(value) >>> 0;
  if (width <= 1) return normalized & 0xFF;
  if (width === 2) return normalized & 0xFFFF;
  if (width === 3) return normalized & 0xFFFFFF;
  return normalized;
}

function safeDecode(pc, mode = 'adl') {
  try {
    const decoded = decodeInstruction(romBytes, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function formatIndexedOperand(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : String(displacement);
  return `(${indexRegister}${signed})`;
}

function fallbackFormat(decoded) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'targetMode',
    'kind',
    'dasm',
  ]);

  const parts = [];
  for (const [key, value] of Object.entries(decoded)) {
    if (ignored.has(key) || value === undefined) continue;

    if (typeof value === 'number') {
      if (key === 'bit') {
        parts.push(`${key}=${value}`);
      } else if (key === 'displacement') {
        parts.push(`${key}=${value >= 0 ? `+${value}` : String(value)}`);
      } else if (key === 'value' || key === 'port') {
        parts.push(`${key}=${hexByte(value)}`);
      } else {
        parts.push(`${key}=${hex(value)}`);
      }
      continue;
    }

    parts.push(`${key}=${String(value)}`);
  }

  return parts.length === 0 ? decoded.tag : `${decoded.tag} ${parts.join(' ')}`;
}

function formatInstruction(decoded) {
  switch (decoded.tag) {
    case 'nop':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rrca':
    case 'rlca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'di':
    case 'ei':
    case 'exx':
    case 'halt':
    case 'slp':
    case 'neg':
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
    case 'rrd':
    case 'rld':
    case 'stmix':
    case 'rsmix':
      return decoded.tag;

    case 'ex-af':
      return "ex af, af'";
    case 'ex-de-hl':
      return 'ex de, hl';
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    case 'ex-sp-pair':
      return `ex (sp), ${decoded.pair}`;

    case 'jr':
      return `jr ${hex(decoded.target)}`;
    case 'jr-conditional':
      return `jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'djnz':
      return `djnz ${hex(decoded.target)}`;
    case 'jp':
      return `jp ${hex(decoded.target)}`;
    case 'jp-conditional':
      return `jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect':
      return `jp (${decoded.indirectRegister})`;
    case 'call':
      return `call ${hex(decoded.target)}`;
    case 'call-conditional':
      return `call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'rst':
      return `rst ${hexByte(decoded.target)}`;
    case 'ret-conditional':
      return `ret ${decoded.condition}`;

    case 'push':
      return `push ${decoded.pair}`;
    case 'pop':
      return `pop ${decoded.pair}`;

    case 'inc-pair':
      return `inc ${decoded.pair}`;
    case 'dec-pair':
      return `dec ${decoded.pair}`;
    case 'inc-reg':
      return `inc ${decoded.reg}`;
    case 'dec-reg':
      return `dec ${decoded.reg}`;
    case 'ld-pair-imm':
      return `ld ${decoded.pair}, ${hex(decoded.value)}`;
    case 'ld-reg-imm':
      return `ld ${decoded.dest}, ${hexByte(decoded.value)}`;
    case 'ld-reg-reg':
      return `ld ${decoded.dest}, ${decoded.src}`;
    case 'ld-reg-ind':
      return `ld ${decoded.dest}, (${decoded.src})`;
    case 'ld-ind-reg':
      return `ld (${decoded.dest}), ${decoded.src}`;
    case 'ld-reg-mem':
      return `ld ${decoded.dest}, (${hex(decoded.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(decoded.addr)}), ${decoded.src}`;
    case 'ld-pair-mem':
      if (decoded.direction === 'to-mem') {
        return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
      }
      return `ld ${decoded.pair}, (${hex(decoded.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
    case 'ld-pair-ind':
      return `ld ${decoded.pair}, (${decoded.src})`;
    case 'ld-ind-pair':
      return `ld (${decoded.dest}), ${decoded.pair}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-pair':
      return `ld sp, ${decoded.pair}`;
    case 'ld-ind-imm':
      return `ld (hl), ${hexByte(decoded.value)}`;
    case 'ld-pair-indexed':
      return `ld ${decoded.pair}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.pair}`;
    case 'ld-ixd-imm':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${hexByte(decoded.value)}`;
    case 'ld-reg-ixd':
      return `ld ${decoded.dest}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;
    case 'ld-ixiy-indexed':
      return `ld ${decoded.dest}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-ixiy':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;

    case 'add-pair':
      return `add ${decoded.dest}, ${decoded.src}`;
    case 'adc-pair':
      return `adc hl, ${decoded.src}`;
    case 'sbc-pair':
      return `sbc hl, ${decoded.src}`;
    case 'alu-reg':
      return `${decoded.op} ${decoded.src}`;
    case 'alu-imm':
      return `${decoded.op} ${hexByte(decoded.value)}`;
    case 'alu-ixd':
      return `${decoded.op} ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;

    case 'in-reg':
      return `in ${decoded.reg}, (c)`;
    case 'out-reg':
      return `out (c), ${decoded.reg}`;
    case 'in0':
      return `in0 ${decoded.reg}, (${hexByte(decoded.port)})`;
    case 'out0':
      return `out0 (${hexByte(decoded.port)}), ${decoded.reg}`;
    case 'in-imm':
      return `in a, (${hexByte(decoded.port)})`;
    case 'out-imm':
      return `out (${hexByte(decoded.port)}), a`;

    case 'bit-test':
      return `bit ${decoded.bit}, ${decoded.reg}`;
    case 'bit-test-ind':
      return `bit ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-res':
      return `res ${decoded.bit}, ${decoded.reg}`;
    case 'bit-res-ind':
      return `res ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-set':
      return `set ${decoded.bit}, ${decoded.reg}`;
    case 'bit-set-ind':
      return `set ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'rotate-reg':
      return `${decoded.op} ${decoded.reg}`;
    case 'rotate-ind':
      return `${decoded.op} (${decoded.indirectRegister})`;
    case 'indexed-cb-bit':
      return `bit ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-res':
      return `res ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-set':
      return `set ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-rotate':
      return `${decoded.operation ?? decoded.op} ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;

    case 'lea':
      return `lea ${decoded.dest}, ${formatIndexedOperand(decoded.base, decoded.displacement)}`;
    case 'im':
      return `im ${decoded.value}`;
    case 'mlt':
      return `mlt ${decoded.reg}`;
    case 'ld-special':
      return `ld ${decoded.dest}, ${decoded.src}`;
    case 'tst-reg':
      return `tst a, ${decoded.reg}`;
    case 'tst-ind':
      return 'tst a, (hl)';
    case 'tst-imm':
      return `tst a, ${hexByte(decoded.value)}`;
    case 'tstio':
      return `tstio ${hexByte(decoded.value)}`;

    default:
      return decoded.dasm ?? fallbackFormat(decoded);
  }
}

function disassembleLinear(startPc, maxInstructions, mode = 'adl') {
  const rows = [];
  let pc = startPc >>> 0;

  for (let index = 0; index < maxInstructions; index += 1) {
    const decoded = safeDecode(pc, mode);
    if (!decoded) {
      rows.push({
        pc,
        length: 1,
        bytes: bytesToHex(romBytes.subarray(pc, pc + 1)),
        text: `db ${hexByte(romBytes[pc] ?? 0)}`,
        tag: 'db',
        target: null,
      });
      pc = (pc + 1) & 0xFFFFFF;
      continue;
    }

    rows.push({
      pc,
      length: decoded.length,
      bytes: bytesToHex(romBytes.subarray(pc, pc + decoded.length)),
      text: formatInstruction(decoded),
      tag: decoded.tag,
      target: typeof decoded.target === 'number' ? decoded.target >>> 0 : null,
    });

    pc = (pc + decoded.length) & 0xFFFFFF;
    if (STATIC_STOP_TAGS.has(decoded.tag)) break;
  }

  return rows;
}

function createRuntime() {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes, 0);

  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
  });

  const executor = createExecutor(BLOCKS, memory, { peripherals });
  return {
    memory,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function createTraceState() {
  return {
    currentStep: -1,
    currentPc: null,
    currentMode: 'adl',
    blockEntries: [],
    ramEvents: [],
    mmioEvents: [],
    portEvents: [],
    missingBlocks: [],
    scanRoutineRefs: [],
  };
}

function recordMemoryAccess(state, kind, addr, width, value) {
  const normalizedAddr = Number(addr) & 0xFFFFFF;
  const normalizedWidth = Math.max(1, Number(width) | 0);
  const normalizedValue = normalizeWidthValue(normalizedWidth, value);

  if (intersectsRange(normalizedAddr, normalizedWidth, RAM_TRACE_START, RAM_TRACE_END)) {
    state.ramEvents.push({
      kind,
      step: state.currentStep,
      pc: state.currentPc,
      mode: state.currentMode,
      addr: normalizedAddr,
      width: normalizedWidth,
      value: normalizedValue,
    });
  }

  if (intersectsRange(normalizedAddr, normalizedWidth, MMIO_START, MMIO_END)) {
    state.mmioEvents.push({
      kind,
      step: state.currentStep,
      pc: state.currentPc,
      mode: state.currentMode,
      addr: normalizedAddr,
      width: normalizedWidth,
      value: normalizedValue,
    });
  }
}

function installTraceHooks(runtime, state) {
  const { cpu } = runtime;
  const originals = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  cpu.read8 = (addr) => {
    const value = originals.read8(addr);
    recordMemoryAccess(state, 'read', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originals.read16(addr);
    recordMemoryAccess(state, 'read', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originals.read24(addr);
    recordMemoryAccess(state, 'read', addr, 3, value);
    return value;
  };

  cpu.write8 = (addr, value) => {
    const result = originals.write8(addr, value);
    recordMemoryAccess(state, 'write', addr, 1, value);
    return result;
  };

  cpu.write16 = (addr, value) => {
    const result = originals.write16(addr, value);
    recordMemoryAccess(state, 'write', addr, 2, value);
    return result;
  };

  cpu.write24 = (addr, value) => {
    const result = originals.write24(addr, value);
    recordMemoryAccess(state, 'write', addr, 3, value);
    return result;
  };

  cpu.onIoRead = (port, value) => {
    state.portEvents.push({
      kind: 'read',
      step: state.currentStep,
      pc: state.currentPc,
      mode: state.currentMode,
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    });
  };

  cpu.onIoWrite = (port, value) => {
    state.portEvents.push({
      kind: 'write',
      step: state.currentStep,
      pc: state.currentPc,
      mode: state.currentMode,
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    });
  };
}

function prepareEntryState(runtime) {
  const { memory, peripherals, cpu } = runtime;

  peripherals.keyboard.keyMatrix.fill(0xFF);
  peripherals.keyboard.keyMatrix[6] = (~(1 << 0)) & 0xFF;

  cpu._iy = OS_IY;
  cpu.sp = STACK_RESET_TOP;
  cpu.mbase = OS_MBASE;
  cpu.madl = 1;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.halted = false;

  // Let a raw RET terminate cleanly by returning to a non-lifted sentinel.
  memory[STACK_RESET_TOP] = 0xFF;
  memory[STACK_RESET_TOP + 1] = 0xFF;
  memory[STACK_RESET_TOP + 2] = 0xFF;
}

function collectScanRoutineRefs(state, pc, meta, step) {
  for (const instruction of meta?.instructions ?? []) {
    if (!CONTROL_FLOW_TAGS.has(instruction.tag)) continue;
    if ((instruction.target >>> 0) !== KEYBOARD_SCAN_ROUTINE) continue;

    state.scanRoutineRefs.push({
      step,
      blockPc: pc >>> 0,
      instPc: instruction.pc ?? pc,
      tag: instruction.tag,
      dasm: instruction.dasm ?? formatInstruction(instruction),
    });
  }
}

function runTrace() {
  const runtime = createRuntime();
  const state = createTraceState();

  prepareEntryState(runtime);
  installTraceHooks(runtime, state);

  const { executor, cpu } = runtime;
  const result = executor.runFrom(GETCSC_ENTRY, 'adl', {
    maxSteps: MAX_TRACE_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock: (pc, mode, meta, step) => {
      state.currentStep = step;
      state.currentPc = pc >>> 0;
      state.currentMode = mode;
      state.blockEntries.push({
        step,
        pc: pc >>> 0,
        mode,
        dasm: meta?.instructions?.[0]?.dasm ?? '???',
      });
      collectScanRoutineRefs(state, pc, meta, step);
    },
    onMissingBlock: (pc, mode, step) => {
      state.missingBlocks.push({
        step,
        pc: pc >>> 0,
        mode,
      });
    },
  });

  return {
    runtime,
    state,
    result,
    finalRegisters: {
      pc: result.lastPc >>> 0,
      mode: result.lastMode,
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      bc: cpu.bc & 0xFFFFFF,
      de: cpu.de & 0xFFFFFF,
      hl: cpu.hl & 0xFFFFFF,
      ix: cpu.ix & 0xFFFFFF,
      iy: cpu.iy & 0xFFFFFF,
      sp: cpu.sp & 0xFFFFFF,
      i: cpu.i & 0xFF,
      im: cpu.im & 0xFF,
      iff1: cpu.iff1 & 0xFF,
      iff2: cpu.iff2 & 0xFF,
      madl: cpu.madl & 0xFF,
      mbase: cpu.mbase & 0xFF,
      halted: cpu.halted ? 1 : 0,
      cycles: cpu.cycles >>> 0,
    },
  };
}

function groupAccessesByAddress(events, fieldName) {
  const grouped = new Map();

  for (const event of events) {
    const key = event[fieldName];
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        reads: 0,
        writes: 0,
        widths: new Set(),
        values: new Set(),
        steps: [],
      });
    }

    const entry = grouped.get(key);
    if (event.kind === 'read') entry.reads += 1;
    if (event.kind === 'write') entry.writes += 1;
    entry.widths.add(event.width);
    entry.values.add(event.value);
    entry.steps.push(event.step);
  }

  return [...grouped.values()].sort((left, right) => left.key - right.key);
}

function summarizeCandidateReads(ramEvents) {
  const filtered = ramEvents.filter((event) =>
    event.kind === 'read' &&
    !intersectsRange(event.addr, event.width, STACK_TRACE_START, STACK_TRACE_END) &&
    !intersectsRange(event.addr, event.width, CALLBACK_WINDOW_START, CALLBACK_WINDOW_END)
  );

  const grouped = groupAccessesByAddress(filtered, 'addr');
  return grouped.slice(0, 32);
}

function printDisassembly(rows) {
  console.log('Static Disassembly');
  console.log('-----------------');
  for (const row of rows) {
    const note = row.target === KEYBOARD_SCAN_ROUTINE ? '  ; scan routine target' : '';
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${note}`);
  }
  console.log('');
}

function printBlockTrace(blockEntries) {
  console.log('Execution Path');
  console.log('--------------');
  if (blockEntries.length === 0) {
    console.log('(none)');
  } else {
    for (const entry of blockEntries) {
      console.log(
        `[step ${formatStep(entry.step)}] ${hex(entry.pc)}:${entry.mode} ${entry.dasm}`
      );
    }
  }
  console.log('');
}

function printMemoryEvents(title, events, isPort = false) {
  console.log(title);
  console.log('-'.repeat(title.length));
  if (events.length === 0) {
    console.log('(none)');
    console.log('');
    return;
  }

  for (const event of events) {
    if (isPort) {
      console.log(
        `[step ${formatStep(event.step)}] ${event.kind.toUpperCase().padEnd(5)} ${hex(event.port, 4)} value=${hexByte(event.value)} @ ${hex(event.pc)}:${event.mode}`
      );
      continue;
    }

    console.log(
      `[step ${formatStep(event.step)}] ${event.kind.toUpperCase().padEnd(5)} ${hex(event.addr)} w=${event.width} value=${hex(event.value, Math.max(2, event.width * 2))} @ ${hex(event.pc)}:${event.mode}`
    );
  }
  console.log('');
}

function printGroupedSummary(title, grouped, width = 6) {
  console.log(title);
  console.log('-'.repeat(title.length));
  if (grouped.length === 0) {
    console.log('(none)');
    console.log('');
    return;
  }

  for (const entry of grouped) {
    const widths = [...entry.widths].sort((a, b) => a - b).join(',');
    const values = [...entry.values]
      .sort((a, b) => a - b)
      .map((value) => hex(value, Math.max(2, Number(widths.split(',')[0] || 1) * 2)))
      .join(', ');
    const steps = entry.steps.join(', ');
    console.log(
      `${hex(entry.key, width)}  reads=${entry.reads} writes=${entry.writes} widths=[${widths}] values=[${values}] steps=[${steps}]`
    );
  }
  console.log('');
}

function printRegisterSummary(finalRegisters) {
  console.log('Final Registers');
  console.log('---------------');
  console.log(`pc=${hex(finalRegisters.pc)} mode=${finalRegisters.mode}`);
  console.log(`a=${hexByte(finalRegisters.a)} f=${hexByte(finalRegisters.f)} bc=${hex(finalRegisters.bc)} de=${hex(finalRegisters.de)} hl=${hex(finalRegisters.hl)}`);
  console.log(`ix=${hex(finalRegisters.ix)} iy=${hex(finalRegisters.iy)} sp=${hex(finalRegisters.sp)}`);
  console.log(`i=${hexByte(finalRegisters.i)} im=${hexByte(finalRegisters.im)} iff1=${finalRegisters.iff1} iff2=${finalRegisters.iff2}`);
  console.log(`madl=${finalRegisters.madl} mbase=${hexByte(finalRegisters.mbase)} halted=${finalRegisters.halted} cycles=${finalRegisters.cycles}`);
  console.log('');
}

function main() {
  const staticRows = disassembleLinear(GETCSC_ENTRY, MAX_DISASM_INSTRUCTIONS, 'adl');
  const staticScanTargets = staticRows.filter((row) => row.target === KEYBOARD_SCAN_ROUTINE);

  const trace = runTrace();
  const { state, result, finalRegisters } = trace;

  const callbackHits = state.ramEvents.filter((event) =>
    intersectsRange(event.addr, event.width, CALLBACK_WINDOW_START, CALLBACK_WINDOW_END)
  );
  const callbackPtrHits = state.ramEvents.filter((event) =>
    intersectsRange(event.addr, event.width, CALLBACK_PTR_START, CALLBACK_PTR_END)
  );
  const candidateReads = summarizeCandidateReads(state.ramEvents);
  const mmioSummary = groupAccessesByAddress(state.mmioEvents, 'addr');
  const candidateReadEvents = state.ramEvents.filter((event) =>
    event.kind === 'read' &&
    !intersectsRange(event.addr, event.width, STACK_TRACE_START, STACK_TRACE_END) &&
    !intersectsRange(event.addr, event.width, CALLBACK_WINDOW_START, CALLBACK_WINDOW_END)
  );

  const visitedScanRoutine = state.blockEntries.some((entry) => entry.pc === KEYBOARD_SCAN_ROUTINE);
  const dynamicTargetedScanRoutine = result.dynamicTargets.includes(KEYBOARD_SCAN_ROUTINE);

  console.log('Phase 178: _GetCSC implementation trace');
  console.log('=======================================');
  console.log(`entry=${hex(GETCSC_ENTRY)} stackTop=${hex(STACK_RESET_TOP)} iy=${hex(OS_IY)} mbase=${hexByte(OS_MBASE)}`);
  console.log(`keyboard seed: keyMatrix[6]=${hexByte((~(1 << 0)) & 0xFF)} timerInterrupt=false`);
  console.log('');

  printDisassembly(staticRows);
  printBlockTrace(state.blockEntries);
  printMemoryEvents('RAM Access Log', state.ramEvents);
  printMemoryEvents('Keyboard MMIO Log', state.mmioEvents);
  printMemoryEvents('Port I/O Log', state.portEvents, true);

  console.log('Trace Result');
  console.log('------------');
  console.log(`steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode}`);
  console.log(`dynamicTargets=${result.dynamicTargets.map((value) => hex(value)).join(', ') || '(none)'}`);
  if (state.missingBlocks.length > 0) {
    console.log(`missingBlocks=${state.missingBlocks.map((entry) => `${hex(entry.pc)}:${entry.mode}@${entry.step}`).join(', ')}`);
  } else {
    console.log('missingBlocks=(none)');
  }
  console.log('');

  console.log('Focused Findings');
  console.log('----------------');
  console.log(`static references to 0x0159C0: ${staticScanTargets.length}`);
  console.log(`dynamic references to 0x0159C0: ${state.scanRoutineRefs.length}`);
  console.log(`visited block 0x0159C0: ${visitedScanRoutine ? 'yes' : 'no'}`);
  console.log(`dynamic target 0x0159C0: ${dynamicTargetedScanRoutine ? 'yes' : 'no'}`);
  console.log(`callback window hits (${hex(CALLBACK_WINDOW_START)}-${hex(CALLBACK_WINDOW_END)}): ${callbackHits.length}`);
  console.log(`callback pointer hits (${hex(CALLBACK_PTR_START)}-${hex(CALLBACK_PTR_END)}): ${callbackPtrHits.length}`);
  console.log(`other RAM read candidates: ${candidateReadEvents.length}`);
  console.log('');

  if (state.scanRoutineRefs.length > 0) {
    console.log('Dynamic 0x0159C0 references');
    console.log('---------------------------');
    for (const ref of state.scanRoutineRefs) {
      console.log(
        `[step ${formatStep(ref.step)}] block=${hex(ref.blockPc)} inst=${hex(ref.instPc)} ${ref.tag} ${ref.dasm}`
      );
    }
    console.log('');
  }

  printGroupedSummary('Keyboard MMIO Summary', mmioSummary, 6);
  printGroupedSummary('Callback Window Summary', groupAccessesByAddress(callbackHits, 'addr'), 6);
  printGroupedSummary('Possible Scan Buffer Reads', candidateReads, 6);
  printRegisterSummary(finalRegisters);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}

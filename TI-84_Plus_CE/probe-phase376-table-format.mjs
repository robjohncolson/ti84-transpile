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

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 50000, maxLoopIterations: 50000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const INJECTED_SCAN_CODE = 0x09;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;
const SYSFLAG_CLEAR_VALUE = 0x00;

const TABLE_DUMP_START = 0x020000;
const TABLE_DUMP_END = 0x020200;
const STRUCTURE_STOP = 0x020100;

const LOOP_DISASM_START = 0x001C33;
const LOOP_DISASM_END_EXCLUSIVE = 0x001CEB;
const TRACE_RANGE_START = 0x001C00;
const TRACE_RANGE_END = 0x001D00;
const PARSER_ENTRY = 0x001CA6;

const DISPATCH_CONTEXT_ADDR = 0x0067F8;
const MATCH_KEY_LOAD_ADDR = 0x006808;
const ERROR_PATH_ADDR = 0x001933;
const ERROR_HALT_ADDR = 0x001937;

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
  'pc',
  'stepCount',
];

const DISASM_NOTES = new Map([
  [0x001C33, 'Start of compare loop: HL = current entry, D = required first byte, E high nibble = required class nibble.'],
  [0x001C44, 'Mismatch path: call helper that parses the token/length format so HL can skip this entry.'],
  [0x001C4F, 'Match-followup helper: advance HL to the second byte and parse the payload format.'],
  [0x001C7D, 'Skip helper: call 0x001CA6; on carry, abort; otherwise HL += BC to skip payload bytes.'],
  [0x001CA6, 'Token parser: low nibble selects inline length / extended length / 24-bit pointer encoding.'],
  [0x001CBC, '0x0D case: next byte is an 8-bit payload length.'],
  [0x001CC4, '0x0E case: next two bytes are a 16-bit payload length.'],
  [0x001CCE, '0x0F case: next byte must be 0x00, then three bytes encode a 24-bit pointer.'],
  [0x001CE4, 'Default case: low nibble itself is the payload length; BC = that length.'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function bytesToHex(buffer, start, length) {
  const end = Math.min(buffer.length, start + Math.max(0, length));
  return Array.from(
    buffer.subarray(start, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function previewBytes(buffer, start, length, preview = 8) {
  const size = Math.min(length, preview);
  const text = bytesToHex(buffer, start, size);
  return length > size ? `${text} ...` : text;
}

function signedDisplacement(value) {
  const signed = value >= 0x80 ? value - 0x100 : value;
  return signed >= 0 ? `+${signed}` : String(signed);
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${signedDisplacement(displacement)})`;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, mem.length)));
  return mem;
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function preparePhase(cpu, mem, sp, stackFillBytes) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function seedFlashSignature(mem) {
  for (let index = 0; index < FLASH_SEED_BYTES.length; index += 1) {
    mem[FLASH_SEED_ADDR + index] = FLASH_SEED_BYTES[index];
  }
}

function seedSystemFlag(mem) {
  mem[SYSFLAG_ADDR] = SYSFLAG_CLEAR_VALUE;
}

function seedKeyInput(mem) {
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;
}

function parseDescriptor(memory, descriptorAddr) {
  const token = memory[descriptorAddr] ?? 0;
  const lowNibble = token & 0x0F;

  if (lowNibble === 0x0D) {
    const payloadSize = memory[descriptorAddr + 1] ?? 0;
    return {
      token,
      lowNibble,
      kind: 'len8',
      consumed: 2,
      payloadSize,
      carry: false,
    };
  }

  if (lowNibble === 0x0E) {
    const payloadSize = ((memory[descriptorAddr + 1] ?? 0) << 8) | (memory[descriptorAddr + 2] ?? 0);
    return {
      token,
      lowNibble,
      kind: 'len16',
      consumed: 3,
      payloadSize,
      carry: false,
    };
  }

  if (lowNibble === 0x0F) {
    const marker = memory[descriptorAddr + 1] ?? 0;
    if (marker !== 0x00) {
      return {
        token,
        lowNibble,
        kind: 'ptr24-invalid',
        consumed: 2,
        marker,
        carry: true,
      };
    }

    const pointer24 = (
      ((memory[descriptorAddr + 2] ?? 0) << 16)
      | ((memory[descriptorAddr + 3] ?? 0) << 8)
      | (memory[descriptorAddr + 4] ?? 0)
    ) >>> 0;

    return {
      token,
      lowNibble,
      kind: 'ptr24',
      consumed: 5,
      pointer24,
      carry: false,
    };
  }

  return {
    token,
    lowNibble,
    kind: 'len4',
    consumed: 1,
    payloadSize: lowNibble,
    carry: false,
  };
}

function parseEntry(memory, entryStart) {
  const key0 = memory[entryStart] ?? 0;
  const descriptorAddr = entryStart + 1;
  const descriptor = parseDescriptor(memory, descriptorAddr);
  const key1 = memory[descriptorAddr] ?? 0;
  const payloadStart = descriptorAddr + descriptor.consumed;

  let entryEnd = payloadStart;
  let payloadPreview = '';

  if (descriptor.kind === 'len4' || descriptor.kind === 'len8' || descriptor.kind === 'len16') {
    entryEnd = payloadStart + descriptor.payloadSize;
    payloadPreview = previewBytes(memory, payloadStart, descriptor.payloadSize);
  } else if (descriptor.kind === 'ptr24') {
    entryEnd = payloadStart;
    payloadPreview = bytesToHex(memory, descriptorAddr + 1, descriptor.consumed - 1);
  } else {
    entryEnd = payloadStart;
    payloadPreview = bytesToHex(memory, descriptorAddr + 1, Math.max(0, descriptor.consumed - 1));
  }

  return {
    entryStart,
    entryEnd,
    key0,
    key1,
    matchNibble: key1 & 0xF0,
    descriptorAddr,
    descriptor,
    payloadStart,
    payloadPreview,
  };
}

function describeDescriptor(descriptor) {
  if (descriptor.kind === 'len4') {
    return `len4=${count(descriptor.payloadSize)}`;
  }
  if (descriptor.kind === 'len8') {
    return `len8=${count(descriptor.payloadSize)}`;
  }
  if (descriptor.kind === 'len16') {
    return `len16=${count(descriptor.payloadSize)}`;
  }
  if (descriptor.kind === 'ptr24') {
    return `ptr24=${hex(descriptor.pointer24)}`;
  }
  return `ptr24-invalid marker=${hexByte(descriptor.marker)}`;
}

function summarizeEntry(entry, label = 'entry') {
  const core = `${label} ${hex(entry.entryStart)} key0=${hexByte(entry.key0)} key1=${hexByte(entry.key1)} hi=${hexByte(entry.matchNibble)} ${describeDescriptor(entry.descriptor)}`;

  if (entry.descriptor.kind === 'len4' || entry.descriptor.kind === 'len8' || entry.descriptor.kind === 'len16') {
    return `${core} payload@${hex(entry.payloadStart)}=${entry.payloadPreview || '(empty)'} next=${hex(entry.entryEnd)}`;
  }

  if (entry.descriptor.kind === 'ptr24') {
    return `${core} raw=${entry.payloadPreview} next=${hex(entry.entryEnd)}`;
  }

  return `${core} raw=${entry.payloadPreview} carry=1`;
}

function findEntryCovering(memory, headEnd, addr, stopAt) {
  let cursor = headEnd;

  while (cursor < stopAt) {
    const entry = parseEntry(memory, cursor);
    if (addr >= entry.entryStart && addr < entry.entryEnd) {
      return entry;
    }
    if (entry.entryEnd <= cursor) {
      break;
    }
    cursor = entry.entryEnd;
  }

  return null;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-indexed':
      return `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-sp-pair':
      return `ld sp, ${inst.pair}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'scf':
      return 'scf';
    default:
      return inst?.tag ?? 'unknown';
  }
}

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('invalid decode length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      length: 1,
      value: memory[pc] ?? 0,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function disassembleRange(memory, start, endExclusive) {
  const lines = [];
  let pc = start;

  while (pc < endExclusive) {
    const inst = safeDecode(memory, pc, MODE);
    const size = Math.max(inst.length ?? 1, 1);
    const bytes = bytesToHex(memory, pc, size).padEnd(14, ' ');
    const note = DISASM_NOTES.get(pc);
    lines.push(
      `${hex(pc)}  ${bytes}  ${formatInstruction(inst)}${note ? `  ; ${note}` : ''}`,
    );
    pc += size;
  }

  return lines;
}

function formatCpuState(cpu) {
  return [
    `A=${hexByte(cpu.a)}`,
    `BC=${hex(cpu.bc)}`,
    `DE=${hex(cpu.de)}`,
    `HL=${hex(cpu.hl)}`,
    `IX=${hex(cpu.ix)}`,
    `IY=${hex(cpu.iy)}`,
    `SP=${hex(cpu.sp)}`,
    `PC=${hex(cpu.pc)}`,
    `F=${hexByte(cpu.f)}`,
  ].join(' ');
}

function collectStructureAnnotations(memory) {
  const annotations = [];

  const head = parseEntry(memory, TABLE_DUMP_START);
  annotations.push(summarizeEntry(head, 'head'));

  let cursor = head.entryEnd;
  while (cursor < STRUCTURE_STOP) {
    const entry = parseEntry(memory, cursor);
    annotations.push(summarizeEntry(entry));
    if (entry.entryEnd <= cursor) {
      break;
    }
    cursor = entry.entryEnd;
  }

  const secondaryHead = findEntryCovering(memory, head.entryEnd, 0x0200FA, STRUCTURE_STOP);
  if (!secondaryHead) {
    const tail = parseEntry(memory, 0x0200FA);
    annotations.push(`secondary-head ${summarizeEntry(tail, 'entry')}`);
  }

  const vectorHits = [];
  for (let addr = 0x020104; addr + 3 < TABLE_DUMP_END; addr += 4) {
    if (memory[addr] === 0xC3) {
      const target = (
        (memory[addr + 1] ?? 0)
        | ((memory[addr + 2] ?? 0) << 8)
        | ((memory[addr + 3] ?? 0) << 16)
      ) >>> 0;
      vectorHits.push(`${hex(addr)} -> jp ${hex(target)}`);
    }
  }

  return { head, annotations, vectorHits };
}

function runDynamicTrace(blocks, bootState, rawRomBytes) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const executor = createExecutor(blocks, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  const { cpu } = executor;

  prepareEventLoop(cpu, executor, mem, bootState);
  seedFlashSignature(mem);
  seedSystemFlag(mem);
  seedKeyInput(mem);

  const traceRows = [];
  const loopMatches = [];
  const loopMisses = [];
  const compareStarts = [];
  let parserVisits = 0;

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      if (pc < TRACE_RANGE_START || pc >= TRACE_RANGE_END) {
        return;
      }

      const row = {
        step,
        pc,
        mode,
        a: cpu.a,
        bc: cpu.bc,
        de: cpu.de,
        hl: cpu.hl,
        ix: cpu.ix,
        iy: cpu.iy,
        sp: cpu.sp,
        f: cpu.f,
      };

      if (pc === LOOP_DISASM_START) {
        const entry = parseEntry(mem, cpu.hl);
        row.compare = {
          entryStart: cpu.hl,
          key0: mem[cpu.hl] ?? 0,
          key1: mem[cpu.hl + 1] ?? 0,
          wantedD: (cpu.de >> 8) & 0xFF,
          wantedEHigh: cpu.de & 0xF0,
          entrySummary: summarizeEntry(entry),
        };
        compareStarts.push(row.compare);
      }

      if (pc === 0x001C42) {
        const entryStart = (cpu.hl - 1) & 0xFFFFFF;
        loopMatches.push(parseEntry(mem, entryStart));
      }

      if (pc === 0x001C44) {
        const entryStart = (cpu.hl - 1) & 0xFFFFFF;
        loopMisses.push(parseEntry(mem, entryStart));
      }

      if (pc === PARSER_ENTRY) {
        parserVisits += 1;
        const descriptor = parseDescriptor(mem, cpu.hl);
        row.parser = {
          visit: parserVisits,
          tablePointerRegister: 'HL',
          pointer: cpu.hl,
          bytes: bytesToHex(mem, cpu.hl, 12),
          descriptor,
        };
      }

      traceRows.push(row);
    },
  });

  return {
    mem,
    rawRomBytes,
    result,
    traceRows,
    loopMatches,
    loopMisses,
    compareStarts,
  };
}

function printBootSummary(bootState) {
  console.log('=== BOOT PHASES ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');
}

function printTableDump(rawRomBytes, structure) {
  console.log('=== ROM DUMP 0x020000-0x020200 ===');
  console.log(`raw ROM bytes are shown here; runtime seeding later changes ${hex(FLASH_SEED_ADDR)} from ${bytesToHex(rawRomBytes, FLASH_SEED_ADDR, 3)} to ${FLASH_SEED_BYTES.map((byte) => hexByte(byte)).join(' ')}`);
  for (let addr = TABLE_DUMP_START; addr < TABLE_DUMP_END; addr += 16) {
    console.log(`${hex(addr)}  ${bytesToHex(rawRomBytes, addr, 16)}`);
  }
  console.log('');

  console.log('=== STRUCTURE ANNOTATION ===');
  for (const line of structure.annotations) {
    console.log(line);
  }
  console.log(`vector-like run ${hex(0x020104)}..${hex(TABLE_DUMP_END - 1)}: ${count(structure.vectorHits.length)} probable ADL JP entries`);
  for (const line of structure.vectorHits.slice(0, 12)) {
    console.log(`  ${line}`);
  }
  if (structure.vectorHits.length > 12) {
    console.log(`  ... ${count(structure.vectorHits.length - 12)} more`);
  }
  console.log('');
}

function printDisassembly(rawRomBytes) {
  console.log('=== DISASSEMBLY 0x001C33-0x001CEA (decoder: ADL) ===');
  for (const line of disassembleRange(rawRomBytes, LOOP_DISASM_START, LOOP_DISASM_END_EXCLUSIVE)) {
    console.log(line);
  }
  console.log('');

  console.log('=== LOOP TAKEAWAYS ===');
  console.log(`Cursor register: HL. The loop reads entry bytes via (HL) and advances HL in-place.`);
  console.log(`Match register: DE. In the traced path, ${hex(MATCH_KEY_LOAD_ADDR)} loads DE=${hex(0x0080C0)} before calling ${hex(LOOP_DISASM_START)}.`);
  console.log(`BC is scratch, not the stable cursor. After ${hex(PARSER_ENTRY)} it holds either a payload length or a 24-bit pointer, and ${hex(0x001C82)} uses BC to skip payload bytes.`);
  console.log(`0x0D means len8, 0x0E means len16, 0x0F means ptr24 if followed by 0x00; otherwise ${hex(PARSER_ENTRY)} returns carry set.`);
  console.log('');
}

function printDynamicTrace(trace) {
  console.log('=== DYNAMIC TRACE (ENTER injected, event loop from 0x003A73) ===');
  console.log(`seed flash: ${hex(FLASH_SEED_ADDR)} = ${FLASH_SEED_BYTES.map((byte) => hexByte(byte)).join(' ')}`);
  console.log(`seed sysflag: ${hex(SYSFLAG_ADDR)} = ${hexByte(SYSFLAG_CLEAR_VALUE)}`);
  console.log(`inject ENTER: ${hex(KEY_SCAN_CODE_ADDR)} = ${hexByte(INJECTED_SCAN_CODE)}, ${hex(KEY_STATUS_ADDR)} |= ${hexByte(KEY_AVAILABLE_MASK)}`);
  console.log(`result: steps=${count(trace.result.steps)} termination=${trace.result.termination} lastPc=${hex(trace.result.lastPc)} loopsForced=${count(trace.result.loopsForced)}`);
  console.log('');

  for (const row of trace.traceRows) {
    console.log(`[${String(row.step).padStart(5, '0')}] ${hex(row.pc)} ${formatCpuState(row)}`);

    if (row.compare) {
      console.log(
        `         compare: entry@${hex(row.compare.entryStart)} key0=${hexByte(row.compare.key0)} key1=${hexByte(row.compare.key1)} wantedD=${hexByte(row.compare.wantedD)} wantedEhi=${hexByte(row.compare.wantedEHigh)}`
      );
      console.log(`         ${row.compare.entrySummary}`);
    }

    if (row.parser) {
      console.log(
        `         parser visit ${count(row.parser.visit)} table_ptr(${row.parser.tablePointerRegister})=${hex(row.parser.pointer)} bytes=${row.parser.bytes}`,
      );
      console.log(`         parser decoded: ${describeDescriptor(row.parser.descriptor)}`);
    }
  }
  console.log('');
}

function dedupeEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    if (!entry) {
      continue;
    }
    const key = entry.entryStart;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(entry);
  }
  return out.sort((left, right) => left.entryStart - right.entryStart);
}

function printConclusion(trace, structure) {
  const misses = dedupeEntries(trace.loopMisses);
  const matches = dedupeEntries(trace.loopMatches);
  const head = structure.head;
  const matched = matches[0] ?? null;

  console.log('=== CONCLUSION ===');
  console.log(`Head entry ${hex(head.entryStart)} is not a raw scan-code row. It is a ptr24 descriptor: ${hex(head.entryStart)} ${bytesToHex(trace.rawRomBytes, head.entryStart, head.entryEnd - head.entryStart)} -> ${hex(head.descriptor.pointer24)}.`);
  console.log(`The compare loop itself starts at ${hex(head.entryEnd)}. In the traced ENTER run, ${hex(MATCH_KEY_LOAD_ADDR)} set DE=${hex(0x0080C0)}, so the loop compared against a two-byte descriptor { first byte = 0x80, second-byte high nibble = 0xC0 }.`);
  console.log('This is therefore a token/descriptor table, not a raw scan-code table. The low nibble of the second byte is a format token interpreted by 0x001CA6; the high nibble participates in matching.');
  console.log('');

  console.log(`Rows tested by ${hex(LOOP_DISASM_START)} before the error path:`);
  for (const entry of misses) {
    console.log(`  miss  ${hex(entry.entryStart)} -> key0=${hexByte(entry.key0)} key1=${hexByte(entry.key1)} hi=${hexByte(entry.matchNibble)} ${describeDescriptor(entry.descriptor)}`);
  }
  for (const entry of matches) {
    console.log(`  match ${hex(entry.entryStart)} -> key0=${hexByte(entry.key0)} key1=${hexByte(entry.key1)} hi=${hexByte(entry.matchNibble)} ${describeDescriptor(entry.descriptor)}`);
  }
  console.log('');

  if (matched) {
    console.log(`The only successful compare was ${hex(matched.entryStart)} = ${bytesToHex(trace.rawRomBytes, matched.entryStart, matched.entryEnd - matched.entryStart)}.`);
    console.log(`Its payload is ${matched.payloadPreview || '(empty)'} at ${hex(matched.payloadStart)}. The follow-up call to ${hex(0x001C4F)} parsed token ${hexByte(matched.key1)} as ${describeDescriptor(matched.descriptor)} and returned HL=${hex(matched.payloadStart)}.`);
    console.log(`Execution then ran ${hex(0x006816)}..${hex(0x00681C)}: IN0 A,(3); AND (HL); INC HL; CP (HL). With payload bytes ${matched.payloadPreview || '(empty)'}, that condition failed and the path later fell through ${hex(ERROR_PATH_ADDR)} -> ${hex(ERROR_HALT_ADDR)}.`);
  }
  console.log('');

  console.log(`Why ENTER 0x09 does not "match" as a scan code: the raw injected value ${hexByte(INJECTED_SCAN_CODE)} never appears in the compare operands at ${hex(LOOP_DISASM_START)}. It only appears inside the head ptr24 descriptor ${bytesToHex(trace.rawRomBytes, 0x020001, 5)} -> ${hex(head.descriptor.pointer24)}.`);
  console.log(`So the loop is not searching for byte 0x09. It is searching for descriptor class 0x80/0xC0, and that class does match ${hex(0x020014)}; the later condition check is what rejects the ENTER path in this run.`);
  console.log('');
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
}

const rawRomBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS
  ?? romModule.default?.PRELIFTED_BLOCKS
  ?? romModule.default
  ?? romModule,
);

if (!blocks || Object.keys(blocks).length === 0) {
  throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
}

console.log('=== PROBE: PHASE 376 TABLE FORMAT @ 0x020000 ===');
console.log(`dispatch context: ${hex(DISPATCH_CONTEXT_ADDR)} loads the table argument, ${hex(MATCH_KEY_LOAD_ADDR)} loads DE=0x0080C0 before the compare loop.`);
console.log(`event loop budget: maxSteps=${count(EVENT_OPTS.maxSteps)} maxLoopIterations=${count(EVENT_OPTS.maxLoopIterations)}`);
console.log('');

const bootState = runBootPhases(blocks, rawRomBytes);
const structure = collectStructureAnnotations(rawRomBytes);
const trace = runDynamicTrace(blocks, bootState, rawRomBytes);

printBootSummary(bootState);
printTableDump(rawRomBytes, structure);
printDisassembly(rawRomBytes);
printDynamicTrace(trace);
printConclusion(trace, structure);

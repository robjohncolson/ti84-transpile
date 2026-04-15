#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const RAM_START = 0x400000;
const RAM_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE1_ENTRY = 0x0A2B72;
const STAGE3_ENTRY = 0x0A29EC;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const STAGE1_MAX_STEPS = 30000;
const STAGE3_MAX_STEPS = 50000;

const BOOT_MAX_LOOPS = 32;
const KERNEL_INIT_MAX_LOOPS = 10000;
const STAGE_MAX_LOOPS = 500;

const STACK_RESET_TOP = 0xD1A87E;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;

const MODE_BUF_START = 0xD020A6;
const MODE_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = MODE_TEXT.length;

const STRIP_ROW_START = 37;
const STRIP_ROW_END = 52;

const FONT_POINTER_ADDR = 0xD00585;
const FONT_TABLE_ADDR = 0x0040EE;
const GLYPH_STRIDE = 28;
const CHAR_PRINTER_ENTRY = 0x0A1799;
const FONT_HELPER_ENTRY = 0x07BF3E;
const TARGET_BLOCK = 0x07BF61;

const TRACE_HISTORY_LIMIT = 48;
const TRACE_LIMIT = 5;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const ADL_BLOCK_STARTS = Object.keys(BLOCKS)
  .map((key) => key.split(':'))
  .filter((parts) => parts.length === 2 && parts[1] === 'adl')
  .map((parts) => parseInt(parts[0], 16))
  .filter((value) => Number.isFinite(value))
  .sort((left, right) => left - right);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatChar(code) {
  if (!Number.isInteger(code)) {
    return 'n/a';
  }

  if (code >= 0x20 && code <= 0x7E) {
    return JSON.stringify(String.fromCharCode(code));
  }

  return hex(code, 2);
}

function read24LE(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function write24LE(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >> 8) & 0xFF;
  mem[addr + 2] = (value >> 16) & 0xFF;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_LEN; index += 1) {
    mem[MODE_BUF_START + index] = MODE_TEXT.charCodeAt(index);
  }
}

function countForegroundPixels(mem, rowStart = STRIP_ROW_START, rowEnd = STRIP_ROW_END) {
  let count = 0;

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);

      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) {
        count++;
      }
    }
  }

  return count;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem, stackBytes = 12) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function snapshotRegisters(cpu, pc) {
  return {
    pc: pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu._bc & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF,
    hl: cpu._hl & 0xFFFFFF,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
  };
}

function formatRegisters(registers) {
  return [
    `HL=${hex(registers.hl)}`,
    `DE=${hex(registers.de)}`,
    `BC=${hex(registers.bc)}`,
    `IX=${hex(registers.ix)}`,
    `IY=${hex(registers.iy)}`,
    `SP=${hex(registers.sp)}`,
    `A=${hex(registers.a, 2)}`,
    `F=${hex(registers.f, 2)}`,
  ].join(' ');
}

function formatPath(path) {
  return path.map((pc) => hex(pc)).join(' -> ');
}

function findNextBlockStart(startPc) {
  let low = 0;
  let high = ADL_BLOCK_STARTS.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (ADL_BLOCK_STARTS[mid] <= startPc) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return ADL_BLOCK_STARTS[low] ?? Number.POSITIVE_INFINITY;
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister}${sign}${displacement})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister ?? 'hl'})`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `ld (${hex(inst.addr)}), ${inst.pair}`;
      }
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-ind':
      return `${inst.op} (${inst.src ?? inst.indirectRegister ?? 'hl'})`;
    case 'alu-ixd':
      return `${inst.op} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'djnz':
      return `djnz ${hex(inst.target)}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'ldir':
      return 'ldir';
    case 'ldi':
      return 'ldi';
    case 'di':
      return 'di';
    case 'ei':
      return 'ei';
    case 'halt':
      return 'halt';
    case 'nop':
      return 'nop';
    case 'ex-de-hl':
      return 'ex de, hl';
    case 'mlt':
      return `mlt ${inst.pair ?? 'hl'}`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    default:
      return inst.tag;
  }
}

function decodeLinearBlock(startPc, mode = 'adl', maxInstructions = 64) {
  const instructions = [];
  const nextBlockStart = findNextBlockStart(startPc);
  let pc = startPc;

  while (instructions.length < maxInstructions && pc < romBytes.length && pc < nextBlockStart) {
    let inst;

    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      break;
    }

    if (!inst || !inst.length) {
      break;
    }

    instructions.push({
      ...inst,
      bytes: romBytes.slice(inst.pc, inst.pc + inst.length),
    });

    pc += inst.length;

    if (inst.tag === 'jp' || inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn' || inst.tag === 'halt') {
      break;
    }
  }

  return instructions;
}

function collectInstructionCallers(target) {
  const rows = [];

  for (const block of Object.values(BLOCKS)) {
    for (const inst of block.instructions || []) {
      if (inst.target !== target) {
        continue;
      }

      rows.push({
        blockStart: block.startPc,
        mode: block.mode,
        instructionPc: inst.pc,
        tag: inst.tag,
      });
    }
  }

  rows.sort((left, right) => left.blockStart - right.blockStart || left.instructionPc - right.instructionPc);
  return rows;
}

function collectExitPredecessors(target) {
  const rows = [];

  for (const block of Object.values(BLOCKS)) {
    for (const exit of block.exits || []) {
      if (exit.target !== target) {
        continue;
      }

      rows.push({
        blockStart: block.startPc,
        mode: block.mode,
        exitType: exit.type,
      });
    }
  }

  rows.sort((left, right) => left.blockStart - right.blockStart);
  return rows;
}

function dedupeOrdered(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function decodePathUntilAnchor(pathBlocks, anchorBlockStart) {
  const rows = [];
  const orderedBlocks = dedupeOrdered(pathBlocks);

  for (const blockStart of orderedBlocks) {
    if (blockStart === TARGET_BLOCK) {
      break;
    }

    const decoded = decodeLinearBlock(blockStart, 'adl');
    for (const inst of decoded) {
      rows.push({ ...inst, blockStart });
    }

    if (blockStart === anchorBlockStart) {
      break;
    }
  }

  return rows;
}

function buildWindowRows(pathBlocks, anchorBlockStart, anchorInstructionPc, before = 20, after = 6) {
  const stitched = decodePathUntilAnchor(pathBlocks, anchorBlockStart);
  let anchorIndex = stitched.findIndex((inst) => inst.pc === anchorInstructionPc);

  if (anchorIndex < 0) {
    const decoded = decodeLinearBlock(anchorBlockStart, 'adl');
    anchorIndex = decoded.findIndex((inst) => inst.pc === anchorInstructionPc);

    if (anchorIndex < 0) {
      return decoded.map((inst) => ({ ...inst, blockStart: anchorBlockStart }));
    }

    const start = Math.max(0, anchorIndex - before);
    const end = Math.min(decoded.length, anchorIndex + after + 1);
    return decoded.slice(start, end).map((inst) => ({ ...inst, blockStart: anchorBlockStart }));
  }

  const start = Math.max(0, anchorIndex - before);
  const end = Math.min(stitched.length, anchorIndex + after + 1);
  return stitched.slice(start, end);
}

function printInstructionRows(title, rows, anchorInstructionPc = null) {
  console.log(`\n${title}`);

  for (const inst of rows) {
    const marker = inst.pc === anchorInstructionPc ? '>>' : '  ';
    const bytes = Array.from(inst.bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`${marker} ${hex(inst.pc)}  ${bytes.padEnd(14)}  ${formatInstruction(inst)}`);
  }
}

function selectRelevantCaller(callers, preferredBlockStarts, fallbackRangeStart, fallbackRangeEnd) {
  const preferred = callers.filter((row) => preferredBlockStarts.has(row.blockStart));
  if (preferred.length > 0) {
    return preferred[0];
  }

  const inRange = callers.filter((row) => row.blockStart >= fallbackRangeStart && row.blockStart < fallbackRangeEnd);
  if (inRange.length > 0) {
    return inRange[0];
  }

  return callers[0] ?? null;
}

function inModeBuffer(addr) {
  return addr >= MODE_BUF_START && addr < MODE_BUF_START + MODE_BUF_LEN;
}

function runScenario({ executor, cpu, mem, ramSnapshot, cpuSnapshot, label, fontPointerValue = null }) {
  mem.set(ramSnapshot, RAM_START);
  clearVram(mem);

  restoreCpu(cpu, cpuSnapshot, mem, 12);
  const stage1 = executor.runFrom(STAGE1_ENTRY, 'adl', {
    maxSteps: STAGE1_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
  });

  seedModeBuffer(mem);

  if (fontPointerValue !== null) {
    write24LE(mem, FONT_POINTER_ADDR, fontPointerValue);
  }

  const fontPointerAtStage3 = read24LE(mem, FONT_POINTER_ADDR);

  restoreCpu(cpu, cpuSnapshot, mem, 12);

  const history = [];
  const charPrinterEntries = [];
  const fontCopyEntries = [];

  const stage3 = executor.runFrom(STAGE3_ENTRY, 'adl', {
    maxSteps: STAGE3_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
    onBlock(pc, mode, meta, steps) {
      const priorPath = history.slice(-TRACE_HISTORY_LIMIT);

      if (pc === CHAR_PRINTER_ENTRY && charPrinterEntries.length < TRACE_LIMIT) {
        const registers = snapshotRegisters(cpu, pc);
        const memoryByteAtHl = registers.hl < MEM_SIZE ? mem[registers.hl] : null;

        charPrinterEntries.push({
          step: steps + 1,
          callerBlock: priorPath.length > 0 ? priorPath[priorPath.length - 1].pc : null,
          path: [...priorPath.map((entry) => entry.pc), pc],
          registers,
          memoryByteAtHl,
        });
      }

      if (pc === TARGET_BLOCK && fontCopyEntries.length < TRACE_LIMIT) {
        const registers = snapshotRegisters(cpu, pc);
        const charCodeFromDe = registers.de % GLYPH_STRIDE === 0 ? Math.floor(registers.de / GLYPH_STRIDE) : null;

        fontCopyEntries.push({
          step: steps + 1,
          callerBlock: priorPath.length > 0 ? priorPath[priorPath.length - 1].pc : null,
          path: [...priorPath.map((entry) => entry.pc), pc],
          registers,
          sourceAddr: (registers.hl + registers.de) & 0xFFFFFF,
          charCodeFromDe,
        });
      }

      history.push({ pc, mode });
      if (history.length > TRACE_HISTORY_LIMIT) {
        history.shift();
      }
    },
  });

  return {
    label,
    fontPointerAtStage3,
    stage1,
    stage3,
    stripFgPixels: countForegroundPixels(mem),
    charPrinterEntries,
    fontCopyEntries,
  };
}

function printDynamicTraceSection(scenario) {
  console.log('\n=== Part A: Dynamic Trace Into 0x07BF61 ===');
  console.log(`Scenario: ${scenario.label}`);
  console.log(`Stage 1: steps=${scenario.stage1.steps} term=${scenario.stage1.termination}`);
  console.log(`Stage 3: steps=${scenario.stage3.steps} term=${scenario.stage3.termination} lastPc=${hex(scenario.stage3.lastPc)}`);
  console.log(`Font pointer slot ${hex(FONT_POINTER_ADDR)} before stage 3: ${hex(scenario.fontPointerAtStage3)}`);
  console.log(`Text-strip foreground pixels rows ${STRIP_ROW_START}-${STRIP_ROW_END}: ${scenario.stripFgPixels}`);

  console.log('\nFirst 5 entries into 0x0A1799 (upstream char printer entry):');
  if (scenario.charPrinterEntries.length === 0) {
    console.log('  none captured');
  } else {
    for (const entry of scenario.charPrinterEntries) {
      const sourceByte = entry.memoryByteAtHl === null ? 'n/a' : hex(entry.memoryByteAtHl, 2);
      const modeBufTag = inModeBuffer(entry.registers.hl) ? 'mode-buffer' : 'not-mode-buffer';
      console.log(
        `  [${entry.step}] caller=${hex(entry.callerBlock)} A=${hex(entry.registers.a, 2)} sourceByte=${sourceByte} HL=${hex(entry.registers.hl)} ${modeBufTag}`,
      );
      console.log(`       path: ${formatPath(entry.path)}`);
    }
  }

  console.log('\nFirst 5 entries into 0x07BF61:');
  if (scenario.fontCopyEntries.length === 0) {
    console.log('  none captured');
    return;
  }

  for (const entry of scenario.fontCopyEntries) {
    const charCode = entry.charCodeFromDe;
    const charLabel = formatChar(charCode);
    console.log(
      `  [${entry.step}] caller=${hex(entry.callerBlock)} ${formatRegisters(entry.registers)} src=HL+DE=${hex(entry.sourceAddr)} DE/28=${charCode === null ? 'n/a' : `${charCode} (${charLabel})`}`,
    );
    console.log(`       path: ${formatPath(entry.path)}`);
  }
}

function printStaticSection(scenario) {
  console.log('\n=== Part B: Static Disassembly Of Caller Blocks ===');

  const firstEntry = scenario.fontCopyEntries[0];
  if (!firstEntry) {
    console.log('No 0x07BF61 entry was captured, so there is no dynamic path to stitch.');
    return;
  }

  const pathSet = new Set(firstEntry.path);
  const charPrinterCallers = collectInstructionCallers(CHAR_PRINTER_ENTRY);
  const fontHelperCallers = collectInstructionCallers(FONT_HELPER_ENTRY);
  const directPredecessors = collectExitPredecessors(TARGET_BLOCK);

  const charSourceCaller = selectRelevantCaller(charPrinterCallers, pathSet, STAGE3_ENTRY, STAGE3_ENTRY + 0x1000);
  const fontHelperCaller = selectRelevantCaller(fontHelperCallers, pathSet, 0x0A1700, 0x0A1800);

  console.log(`Observed direct predecessors to ${hex(TARGET_BLOCK)}:`);
  if (directPredecessors.length === 0) {
    console.log('  none');
  } else {
    for (const predecessor of directPredecessors) {
      console.log(`  ${hex(predecessor.blockStart)} via ${predecessor.exitType}`);
    }
  }

  if (charSourceCaller) {
    const windowRows = buildWindowRows(firstEntry.path, charSourceCaller.blockStart, charSourceCaller.instructionPc, 20, 4);
    printInstructionRows(
      `Stage-3 caller that feeds bytes into 0x0A1799 (block ${hex(charSourceCaller.blockStart)}, call at ${hex(charSourceCaller.instructionPc)})`,
      windowRows,
      charSourceCaller.instructionPc,
    );
  }

  if (fontHelperCaller) {
    const windowRows = buildWindowRows(firstEntry.path, fontHelperCaller.blockStart, fontHelperCaller.instructionPc, 20, 8);
    printInstructionRows(
      `Upstream block that turns A into the glyph offset before 0x07BF61 (block ${hex(fontHelperCaller.blockStart)}, call at ${hex(fontHelperCaller.instructionPc)})`,
      windowRows,
      fontHelperCaller.instructionPc,
    );
  }

  const serviceBlocks = dedupeOrdered(firstEntry.path.filter((pc) => pc !== TARGET_BLOCK)).slice(-3);
  for (const blockStart of serviceBlocks) {
    const rows = decodeLinearBlock(blockStart, 'adl');
    printInstructionRows(`Service block ${hex(blockStart)}`, rows);
  }

  console.log('\nKey deductions from the stitched disassembly:');

  if (charSourceCaller) {
    console.log(`  - The stage-3 flow reaches 0x0A1799 from block ${hex(charSourceCaller.blockStart)}.`);
    console.log('  - In that caller window, `ld a, (hl)` immediately precedes `call 0x0A1799`, which is where the current text byte enters the font path.');
  }

  if (fontHelperCaller) {
    console.log(`  - The block at ${hex(fontHelperCaller.blockStart)} contains the offset math: ` +
      '`ld hl, 0`, `ld l, a`, `ld h, 0x1c`, `mlt hl`, then `call 0x07BF3E`.');
  }

  console.log('  - The service chain into 0x07BF61 is `0x07BF5C -> call 0x000380 -> jp 0x003D85 -> ld hl, 0x003D6E -> ret -> 0x07BF61`.');
  console.log(`  - 0x07BF61 itself begins with \`add hl, de\`, so the ROM source is exactly base HL plus the precomputed DE offset.`);
}

function printExperimentSection(baseline, patched) {
  console.log('\n=== Part C: Font Pointer Override Experiment ===');
  console.log(`Patched ${hex(FONT_POINTER_ADDR)} to ${hex(FONT_TABLE_ADDR)} before stage 3.`);

  const baseEntry = baseline.fontCopyEntries[0] ?? null;
  const patchedEntry = patched.fontCopyEntries[0] ?? null;

  console.log(`Baseline pointer: ${hex(baseline.fontPointerAtStage3)} | strip fg pixels: ${baseline.stripFgPixels}`);
  if (baseEntry) {
    console.log(`  Baseline 0x07BF61 entry: HL=${hex(baseEntry.registers.hl)} DE=${hex(baseEntry.registers.de)} src=${hex(baseEntry.sourceAddr)}`);
  }

  console.log(`Patched pointer:  ${hex(patched.fontPointerAtStage3)} | strip fg pixels: ${patched.stripFgPixels}`);
  if (patchedEntry) {
    console.log(`  Patched 0x07BF61 entry:  HL=${hex(patchedEntry.registers.hl)} DE=${hex(patchedEntry.registers.de)} src=${hex(patchedEntry.sourceAddr)}`);
  }

  if (baseEntry && patchedEntry) {
    const sameHl = baseEntry.registers.hl === patchedEntry.registers.hl;
    const sameDe = baseEntry.registers.de === patchedEntry.registers.de;
    const sameFg = baseline.stripFgPixels === patched.stripFgPixels;

    console.log(`Comparison: HL ${sameHl ? 'unchanged' : 'changed'}, DE ${sameDe ? 'unchanged' : 'changed'}, fg pixels ${sameFg ? 'unchanged' : 'changed'}`);
  }
}

function printConclusion(baseline, patched) {
  console.log('\n=== Conclusion ===');

  const compatBase = (FONT_TABLE_ADDR - (0x20 * GLYPH_STRIDE)) & 0xFFFFFF;
  const charEntry = baseline.charPrinterEntries[0] ?? null;
  const baseEntry = baseline.fontCopyEntries[0] ?? null;
  const patchedEntry = patched.fontCopyEntries[0] ?? null;

  if (charEntry) {
    console.log(
      `- 0x0A1799 is receiving A=${hex(charEntry.registers.a, 2)} from caller ${hex(charEntry.callerBlock)}; ` +
      `HL=${hex(charEntry.registers.hl)} and sourceByte=${charEntry.memoryByteAtHl === null ? 'n/a' : hex(charEntry.memoryByteAtHl, 2)}.`,
    );

    if (!inModeBuffer(charEntry.registers.hl)) {
      console.log(
        `- That HL is outside the seeded mode buffer ${hex(MODE_BUF_START)}-${hex(MODE_BUF_START + MODE_BUF_LEN - 1)}, so this run is not sourcing glyph bytes straight from D020A6.`,
      );
    }
  }

  if (baseEntry) {
    console.log(
      `- 0x07BF61 enters with HL=${hex(baseEntry.registers.hl)} and DE=${hex(baseEntry.registers.de)}, so the copy source is ${hex(baseEntry.sourceAddr)} before the LDIR.`,
    );
  }

  if (baseEntry && baseEntry.registers.hl === compatBase) {
    console.log(
      `- HL matches ${hex(compatBase)}, which is ${hex(FONT_TABLE_ADDR)} - 0x20*${GLYPH_STRIDE}. This path is using base ${hex(compatBase)} plus charCode*${GLYPH_STRIDE}, which is equivalent to base ${hex(FONT_TABLE_ADDR)} plus (charCode-0x20)*${GLYPH_STRIDE}.`,
    );
  }

  if (charEntry && charEntry.registers.a >= 0xFA && baseEntry && baseEntry.charCodeFromDe === 0xD0) {
    console.log('- The upstream byte is a high/token value (>= 0xFA), so the 0x0A17B2/0x0A17B6 clamp path is firing and forcing the glyph index to 0xD0 before 0x07BF61.');
  }

  if (baseEntry && patchedEntry) {
    const sameHl = baseEntry.registers.hl === patchedEntry.registers.hl;
    const sameDe = baseEntry.registers.de === patchedEntry.registers.de;
    const sameFg = baseline.stripFgPixels === patched.stripFgPixels;

    if (sameHl && sameDe && sameFg) {
      console.log(
        `- Setting ${hex(FONT_POINTER_ADDR)}=${hex(FONT_TABLE_ADDR)} did not change HL/DE at 0x07BF61 and did not change the ${baseline.stripFgPixels}-pixel degenerate output.`,
      );
      console.log('- Fixing D00585 alone is not sufficient for this native path.');
    } else {
      console.log('- The pointer override changed the entry registers or pixel count, so D00585 participates in this path and should remain part of the fix.');
    }
  }

  console.log('- The actual fix path is to correct the upstream byte source into 0x0A1799 and keep the base/offset convention consistent with the service path into 0x07BF61.');
}

function initializeEnvironment() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, ROM_LIMIT)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  return {
    mem,
    cpu,
    executor,
    boot,
    kernelInit,
    postInit,
    ramSnapshot: new Uint8Array(mem.subarray(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
  };
}

async function main() {
  console.log('=== Phase 167 - Font Pointer Call Chain Investigation ===');
  console.log(`ROM bytes: ${romBytes.length}`);
  console.log(`PRELIFTED_BLOCKS: ${Object.keys(BLOCKS).length}`);

  const env = initializeEnvironment();

  console.log(`Boot:        steps=${env.boot.steps} term=${env.boot.termination} lastPc=${hex(env.boot.lastPc)}`);
  console.log(`Kernel init: steps=${env.kernelInit.steps} term=${env.kernelInit.termination} lastPc=${hex(env.kernelInit.lastPc)}`);
  console.log(`Post-init:   steps=${env.postInit.steps} term=${env.postInit.termination} lastPc=${hex(env.postInit.lastPc)}`);
  console.log(`Post-init font pointer ${hex(FONT_POINTER_ADDR)}: ${hex(read24LE(env.mem, FONT_POINTER_ADDR))}`);
  console.log(`Compat base check: ${hex(FONT_TABLE_ADDR)} - 0x20*${GLYPH_STRIDE} = ${hex((FONT_TABLE_ADDR - (0x20 * GLYPH_STRIDE)) & 0xFFFFFF)}`);

  const baseline = runScenario({
    ...env,
    label: 'baseline',
  });

  printDynamicTraceSection(baseline);
  printStaticSection(baseline);

  const patched = runScenario({
    ...env,
    label: 'font-pointer=0x0040EE',
    fontPointerValue: FONT_TABLE_ADDR,
  });

  printExperimentSection(baseline, patched);
  printConclusion(baseline, patched);
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}

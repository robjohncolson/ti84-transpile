#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import {
  buildFontSignatures,
  decodeTextStrip,
  FONT_BASE,
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
} from './font-decoder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_MAX_LOOP_ITERATIONS = 500;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = 26;
const STRIP_ROW_START = 37;
const STRIP_ROW_END = 52;
const FONT_POINTER_ADDR = 0xD00585;
const DECODE_STRIDE = 12;
const DECODE_COMPARE_WIDTH = 10;

const FONT_TESTS = [
  { key: 'A', label: 'Test A', pointer: 0x003D6E },
  { key: 'B', label: 'Test B', pointer: 0x0040EE },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function readPixel(mem, row, col) {
  if (row < 0 || row >= VRAM_HEIGHT || col < 0 || col >= VRAM_WIDTH) {
    return VRAM_SENTINEL;
  }

  const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return result;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runStage(executor, entry, maxSteps) {
  return executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_LEN; index++) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function setFontPointer(mem, value) {
  mem[FONT_POINTER_ADDR] = value & 0xFF;
  mem[FONT_POINTER_ADDR + 1] = (value >> 8) & 0xFF;
  mem[FONT_POINTER_ADDR + 2] = (value >> 16) & 0xFF;
}

function countForegroundPixels(mem, rowStart, rowEnd, colStart = 0, colEnd = VRAM_WIDTH - 1) {
  let count = 0;

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const pixel = readPixel(mem, row, col);

      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) {
        count++;
      }
    }
  }

  return count;
}

function prepareStage3(executor, cpu, mem, ramSnapshot, cpuSnapshot) {
  mem.set(ramSnapshot, 0x400000);
  clearVram(mem);

  restoreCpu(cpu, cpuSnapshot, mem);
  const stage1 = runStage(executor, STAGE_1_ENTRY, 30000);

  restoreCpu(cpu, cpuSnapshot, mem);
  const stage2 = runStage(executor, STAGE_2_ENTRY, 30000);

  seedModeBuffer(mem);
  restoreCpu(cpu, cpuSnapshot, mem);

  return { stage1, stage2 };
}

function decodeModeStrip(mem, signatures) {
  return decodeTextStrip(
    mem,
    STRIP_ROW_START,
    2,
    MODE_BUF_LEN,
    signatures,
    40,
    'auto',
    DECODE_STRIDE,
    DECODE_COMPARE_WIDTH,
  );
}

function analyzeDecodedText(text) {
  const hasNormal = text.includes('Normal');
  const hasFloat = text.includes('Float');
  const hasRadian = text.includes('Radian');
  const unknownCount = (text.match(/\?/g) || []).length;
  const knownCount = text.length - unknownCount;

  let exactMatches = 0;

  for (let index = 0; index < Math.min(text.length, MODE_BUF_TEXT.length); index++) {
    if (text[index] === MODE_BUF_TEXT[index]) {
      exactMatches++;
    }
  }

  return {
    hasNormal,
    hasFloat,
    hasRadian,
    wordCount: Number(hasNormal) + Number(hasFloat) + Number(hasRadian),
    exactMatches,
    knownCount,
    unknownCount,
  };
}

function runBaseline(executor, cpu, mem, ramSnapshot, cpuSnapshot, signatures) {
  prepareStage3(executor, cpu, mem, ramSnapshot, cpuSnapshot);
  const stage3 = runStage(executor, STAGE_3_ENTRY, 50000);
  const stripFgPixels = countForegroundPixels(mem, STRIP_ROW_START, STRIP_ROW_END);
  const decodedText = decodeModeStrip(mem, signatures);

  return {
    stage3,
    stripFgPixels,
    decodedText,
    analysis: analyzeDecodedText(decodedText),
  };
}

function runFontTest(executor, cpu, mem, ramSnapshot, cpuSnapshot, signatures, test) {
  prepareStage3(executor, cpu, mem, ramSnapshot, cpuSnapshot);
  setFontPointer(mem, test.pointer);

  const stage3 = runStage(executor, STAGE_3_ENTRY, 50000);
  const stripFgPixels = countForegroundPixels(mem, STRIP_ROW_START, STRIP_ROW_END);
  const decodedText = decodeModeStrip(mem, signatures);
  const analysis = analyzeDecodedText(decodedText);

  return {
    ...test,
    stage3,
    stripFgPixels,
    decodedText,
    analysis,
  };
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function scoreTest(test) {
  return (test.analysis.wordCount * 1000) + (test.analysis.exactMatches * 10) + test.analysis.knownCount;
}

function pickWinner(testA, testB) {
  const scoreA = scoreTest(testA);
  const scoreB = scoreTest(testB);

  if (scoreA === 0 && scoreB === 0) {
    return 'neither';
  }

  if (scoreA === scoreB) {
    return 'neither';
  }

  return scoreA > scoreB ? 'A' : 'B';
}

function printTestResult(test) {
  console.log(`--- ${test.label}: font pointer = ${hex(test.pointer)} ---`);
  console.log(`Font pointer at ${hex(FONT_POINTER_ADDR)} set to: ${hex(test.pointer)}`);
  console.log(`Stage 3 (home row): ${test.stage3.steps} steps, term=${test.stage3.termination}`);
  console.log(`Text strip fg pixels (r${STRIP_ROW_START}-${STRIP_ROW_END}): ${test.stripFgPixels}`);
  console.log(`Decoded text: ${JSON.stringify(test.decodedText)}`);
  console.log(`Words found: Normal=${yesNo(test.analysis.hasNormal)} Float=${yesNo(test.analysis.hasFloat)} Radian=${yesNo(test.analysis.hasRadian)}`);
  console.log('');
}

async function main() {
  console.log('=== Phase 155 - Native Font Rendering Test ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const signatures = buildFontSignatures(romBytes);

  console.log(`Decoder signatures: base=${hex(FONT_BASE)} glyph=${GLYPH_WIDTH}x${GLYPH_HEIGHT} count=${signatures.length}`);

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`Boot: ${bootResult.steps} steps, term=${bootResult.termination}`);

  const ramSnapshot = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnapshot = snapshotCpu(cpu);

  const initialStages = prepareStage3(executor, cpu, mem, ramSnapshot, cpuSnapshot);
  console.log(`Stage 1 (status bar): ${initialStages.stage1.steps} steps, term=${initialStages.stage1.termination}`);
  console.log(`Stage 2 (status dots): ${initialStages.stage2.steps} steps, term=${initialStages.stage2.termination}`);
  console.log('');

  setFontPointer(mem, FONT_TESTS[0].pointer);
  const testA = {
    ...FONT_TESTS[0],
    stage3: runStage(executor, STAGE_3_ENTRY, 50000),
  };
  testA.stripFgPixels = countForegroundPixels(mem, STRIP_ROW_START, STRIP_ROW_END);
  testA.decodedText = decodeModeStrip(mem, signatures);
  testA.analysis = analyzeDecodedText(testA.decodedText);

  printTestResult(testA);

  const testB = runFontTest(executor, cpu, mem, ramSnapshot, cpuSnapshot, signatures, FONT_TESTS[1]);
  printTestResult(testB);

  const baseline = runBaseline(executor, cpu, mem, ramSnapshot, cpuSnapshot, signatures);
  const winner = pickWinner(testA, testB);

  console.log('--- Comparison ---');
  console.log('Baseline (no font fix): ~968 fg pixels total (from paintGlyphs overlay)');
  console.log(`Stage 3 baseline (no font pointer) fg pixels: ${baseline.stripFgPixels}`);
  console.log(`Stage 3 baseline decoded text: ${JSON.stringify(baseline.decodedText)}`);
  console.log(`Test A fg pixels: ${testA.stripFgPixels}`);
  console.log(`Test B fg pixels: ${testB.stripFgPixels}`);
  console.log(`Winner: ${winner}`);
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}

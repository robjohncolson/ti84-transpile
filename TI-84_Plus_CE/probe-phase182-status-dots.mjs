#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = romBytes.length;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_MAX_STEPS = 30000;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const FIXED_IX = 0xD1A860;
const INVESTIGATED_ADDRESS = 0x58C35B;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
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

function countColoredPixels(mem, rowStart, rowEnd, colStart, colEnd) {
  let count = 0;

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      const pixel = readPixel(mem, row, col);

      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) {
        count += 1;
      }
    }
  }

  return count;
}

function scanColoredPixels(mem, rowStart, rowEnd, colStart, colEnd, sampleLimit = 16) {
  let count = 0;
  let rMin = rowEnd + 1;
  let rMax = -1;
  let cMin = colEnd + 1;
  let cMax = -1;
  const samples = [];
  const colorCounts = new Map();

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      const pixel = readPixel(mem, row, col);

      if (pixel === VRAM_SENTINEL || pixel === WHITE_PIXEL) {
        continue;
      }

      count += 1;
      rMin = Math.min(rMin, row);
      rMax = Math.max(rMax, row);
      cMin = Math.min(cMin, col);
      cMax = Math.max(cMax, col);
      colorCounts.set(pixel, (colorCounts.get(pixel) ?? 0) + 1);

      if (samples.length < sampleLimit) {
        samples.push({ row, col, pixel });
      }
    }
  }

  const colors = [...colorCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([pixel, pixelCount]) => `${hex(pixel, 4)}x${pixelCount}`);

  return {
    count,
    rMin: count > 0 ? rMin : null,
    rMax: count > 0 ? rMax : null,
    cMin: count > 0 ? cMin : null,
    cMax: count > 0 ? cMax : null,
    samples,
    colors,
  };
}

function formatScan(scan) {
  if (!scan || scan.count === 0) {
    return 'count=0 bbox=none samples=none colors=none';
  }

  const sampleText = scan.samples
    .map((sample) => `r${sample.row} c${sample.col}=${hex(sample.pixel, 4)}`)
    .join(', ');
  const colorText = scan.colors.join(', ');

  return `count=${scan.count} bbox=r${scan.rMin}-${scan.rMax} c${scan.cMin}-${scan.cMax} samples=${sampleText} colors=${colorText}`;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
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
  mem.fill(0xFF, cpu.sp, 3);

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
  mem.fill(0xFF, cpu.sp, 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return result;
}

function restoreRam(mem, ramSnapshot) {
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
}

function restoreCpu(cpu, snapshot, mem, ixMode) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  cpu._ix = ixMode === 'fixed' ? FIXED_IX : cpu.sp;
  mem.fill(0xFF, cpu.sp, 12);
}

function runStage(executor, label, entry) {
  const result = executor.runFrom(entry, 'adl', {
    maxSteps: STAGE_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });

  console.log(
    `${label}: entry=${hex(entry)} steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`,
  );

  return result;
}

function readMemoryHex(mem, address, length) {
  if (address < 0 || address >= mem.length) {
    return 'n/a (outside 16 MB memory image)';
  }

  const end = Math.min(address + length, mem.length);
  return bytesToHex(mem.slice(address, end));
}

function inspectInvestigatedAddress() {
  const keyA = `${INVESTIGATED_ADDRESS.toString(16)}:adl`;
  const keyB = `${hex(INVESTIGATED_ADDRESS)}:adl`;
  const blockExists = BLOCKS[keyA] !== undefined || BLOCKS[keyB] !== undefined;
  const inRom = INVESTIGATED_ADDRESS >= 0 && INVESTIGATED_ADDRESS < ROM_LIMIT;
  const romHex = inRom
    ? bytesToHex(romBytes.slice(INVESTIGATED_ADDRESS, Math.min(INVESTIGATED_ADDRESS + 32, ROM_LIMIT)))
    : 'n/a (address is beyond ROM.rom size)';

  return {
    keyA,
    keyB,
    blockExists,
    inRom,
    romHex,
    romSize: ROM_LIMIT,
    classification: inRom ? 'ROM address' : 'RAM / out-of-ROM address',
  };
}

function runVariant(executor, cpu, mem, ramSnapshot, cpuSnapshot, ixMode, label) {
  restoreRam(mem, ramSnapshot);
  restoreCpu(cpu, cpuSnapshot, mem, ixMode);
  clearVram(mem);

  const initialIx = cpu._ix;
  const initialSp = cpu.sp;

  const stage1 = runStage(executor, `${label} stage 1`, STAGE_1_ENTRY);
  const broadBefore = countColoredPixels(mem, 0, 20, 0, 319);
  const goldenBefore = countColoredPixels(mem, 6, 13, 290, 305);
  const statusBarBefore = scanColoredPixels(mem, 0, 35, 0, 319);

  restoreCpu(cpu, cpuSnapshot, mem, ixMode);
  const stage2 = runStage(executor, `${label} stage 2`, STAGE_2_ENTRY);
  const broadAfter = countColoredPixels(mem, 0, 20, 0, 319);
  const goldenAfter = countColoredPixels(mem, 6, 13, 290, 305);
  const statusBarAfter = scanColoredPixels(mem, 0, 35, 0, 319);
  const targetMemoryHex = readMemoryHex(mem, INVESTIGATED_ADDRESS, 32);

  return {
    label,
    ixMode,
    initialIx,
    initialSp,
    stage1,
    stage2,
    broadBefore,
    broadAfter,
    broadDelta: broadAfter - broadBefore,
    goldenBefore,
    goldenAfter,
    goldenDelta: goldenAfter - goldenBefore,
    statusBarBefore,
    statusBarAfter,
    statusBarDelta: statusBarAfter.count - statusBarBefore.count,
    targetMemoryHex,
  };
}

function logVariant(result) {
  console.log('');
  console.log(`=== ${result.label} ===`);
  console.log(`initial IX=${hex(result.initialIx)} initial SP=${hex(result.initialSp)}`);
  console.log(
    `rows 0-20 cols 0-319: before=${result.broadBefore} after=${result.broadAfter} delta=${result.broadDelta}`,
  );
  console.log(
    `golden window r6-13 c290-305: before=${result.goldenBefore} after=${result.goldenAfter} delta=${result.goldenDelta}`,
  );
  console.log(`status bar r0-35 after stage 2: ${formatScan(result.statusBarAfter)}`);
  console.log(`memory @ ${hex(INVESTIGATED_ADDRESS)} after stage 2: ${result.targetMemoryHex}`);
}

function buildVerdict(fixedResult, legacyResult, addressInfo) {
  const fixedTargetOutOfRom = fixedResult.stage2.lastPc >= ROM_LIMIT;
  const legacyTargetOutOfRom = legacyResult.stage2.lastPc >= ROM_LIMIT;
  const fixedLostPixels = fixedResult.goldenDelta <= 0 && fixedResult.statusBarDelta <= 0;
  const legacyAddedPixels = legacyResult.goldenDelta > 0 || legacyResult.statusBarDelta > 0;

  if (fixedTargetOutOfRom && fixedLostPixels && legacyAddedPixels) {
    return {
      code: 'IX_FIX_REGRESSION_CONFIRMED',
      explanation:
        `IX=0xD1A860 changes the stage 2 path enough to lose the status-dot draw. The fixed-IX run exits at ${hex(fixedResult.stage2.lastPc)}, which is outside the ${hex(ROM_LIMIT)} ROM image, while IX=SP adds more top-bar pixels.`,
      bullets: [
        `${hex(INVESTIGATED_ADDRESS)} is not a transpiled ROM block (${addressInfo.keyA}/${addressInfo.keyB} missing).`,
        `Because ${hex(INVESTIGATED_ADDRESS)} is above the ROM size, the missing_block is a symptom of a RAM jump target, not a missing ROM lift.`,
        'The most likely cause is IX-dependent frame or pointer data steering stage 2 into the wrong branch or indirect jump target.',
      ],
    };
  }

  if (fixedTargetOutOfRom && fixedLostPixels) {
    return {
      code: 'RAM_JUMP_CONFIRMED_BUT_IX_CAUSALITY_INCONCLUSIVE',
      explanation:
        `The fixed-IX run still dies at an out-of-ROM target (${hex(fixedResult.stage2.lastPc)}) and does not add status-dot pixels, so the bad jump is real.`,
      bullets: [
        `${hex(INVESTIGATED_ADDRESS)} classifies as ${addressInfo.classification}.`,
        'This probe confirms that stage 2 reaches a RAM target, but the legacy IX=SP run did not improve enough to prove the regression is caused only by the IX fix.',
      ],
    };
  }

  if (legacyAddedPixels && fixedResult.goldenDelta < legacyResult.goldenDelta) {
    return {
      code: 'IX_CHANGES_STAGE2_BEHAVIOR',
      explanation:
        `Both runs stay on plausible code paths, but IX=SP adds more status-bar pixels than IX=0xD1A860. The IX initialization still appears to change stage 2 behavior.`,
      bullets: [
        `Fixed IX golden-window delta=${fixedResult.goldenDelta}; legacy delta=${legacyResult.goldenDelta}.`,
        `Fixed IX status-bar delta=${fixedResult.statusBarDelta}; legacy delta=${legacyResult.statusBarDelta}.`,
      ],
    };
  }

  return {
    code: 'INCONCLUSIVE',
    explanation:
      'The two IX variants did not separate cleanly enough to assign the regression to the IX fix alone. The address investigation still determines whether the observed missing_block target is ROM or RAM.',
    bullets: [
      `Fixed IX lastPc=${hex(fixedResult.stage2.lastPc)}; legacy IX lastPc=${hex(legacyResult.stage2.lastPc)}.`,
      `Fixed IX golden delta=${fixedResult.goldenDelta}; legacy golden delta=${legacyResult.goldenDelta}.`,
      `Fixed IX status-bar delta=${fixedResult.statusBarDelta}; legacy status-bar delta=${legacyResult.statusBarDelta}.`,
      fixedTargetOutOfRom || legacyTargetOutOfRom
        ? 'At least one run still reaches an out-of-ROM target, so indirect pointer corruption remains a strong suspect.'
        : 'Neither run reached an out-of-ROM target in this execution.',
    ],
  };
}

async function main() {
  console.log('=== Phase 182 - Stage 2 Status Dots Regression Probe ===');
  console.log(`ROM size: ${hex(ROM_LIMIT)}`);
  console.log(`Investigated address: ${hex(INVESTIGATED_ADDRESS)}`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(
    `boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`,
  );

  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);
  console.log(
    `snapshot: SP=${hex(cpuSnapshot.sp)} IX=${hex(cpuSnapshot._ix)} IY=${hex(cpuSnapshot._iy)} mbase=${hex(cpuSnapshot.mbase, 2)}`,
  );

  const fixedResult = runVariant(
    executor,
    cpu,
    mem,
    ramSnapshot,
    cpuSnapshot,
    'fixed',
    'Variant A - IX=0xD1A860 (Phase 177 fix)',
  );
  const legacyResult = runVariant(
    executor,
    cpu,
    mem,
    ramSnapshot,
    cpuSnapshot,
    'legacy',
    'Variant B - IX=SP (legacy behavior)',
  );

  logVariant(fixedResult);
  logVariant(legacyResult);

  console.log('');
  console.log('=== IX Comparison ===');
  console.log(
    `broad colored pixels after stage 2: fixed=${fixedResult.broadAfter} legacy=${legacyResult.broadAfter} diff=${fixedResult.broadAfter - legacyResult.broadAfter}`,
  );
  console.log(
    `broad delta from stage 1 -> stage 2: fixed=${fixedResult.broadDelta} legacy=${legacyResult.broadDelta} diff=${fixedResult.broadDelta - legacyResult.broadDelta}`,
  );
  console.log(
    `golden window after stage 2: fixed=${fixedResult.goldenAfter} legacy=${legacyResult.goldenAfter} diff=${fixedResult.goldenAfter - legacyResult.goldenAfter}`,
  );
  console.log(
    `golden window delta from stage 1 -> stage 2: fixed=${fixedResult.goldenDelta} legacy=${legacyResult.goldenDelta} diff=${fixedResult.goldenDelta - legacyResult.goldenDelta}`,
  );
  console.log(
    `status bar r0-35 count after stage 2: fixed=${fixedResult.statusBarAfter.count} legacy=${legacyResult.statusBarAfter.count} diff=${fixedResult.statusBarAfter.count - legacyResult.statusBarAfter.count}`,
  );
  console.log(
    `status bar r0-35 delta from stage 1 -> stage 2: fixed=${fixedResult.statusBarDelta} legacy=${legacyResult.statusBarDelta} diff=${fixedResult.statusBarDelta - legacyResult.statusBarDelta}`,
  );
  console.log(
    `stage 2 lastPc: fixed=${hex(fixedResult.stage2.lastPc)} legacy=${hex(legacyResult.stage2.lastPc)}`,
  );

  const addressInfo = inspectInvestigatedAddress();
  console.log('');
  console.log(`=== Investigating ${hex(INVESTIGATED_ADDRESS)} ===`);
  console.log(`block exists: ${addressInfo.blockExists} (${addressInfo.keyA} / ${addressInfo.keyB})`);
  console.log(`classification: ${addressInfo.classification}`);
  console.log(`ROM bytes @ ${hex(INVESTIGATED_ADDRESS)}: ${addressInfo.romHex}`);
  if (!addressInfo.inRom) {
    console.log(
      `${hex(INVESTIGATED_ADDRESS)} is above the ${hex(addressInfo.romSize)} ROM image, so any jump there is reaching RAM / garbage rather than real ROM code.`,
    );
  }

  const verdict = buildVerdict(fixedResult, legacyResult, addressInfo);
  console.log('');
  console.log('=== Verdict ===');
  console.log(`VERDICT: ${verdict.code}`);
  console.log(verdict.explanation);
  for (const bullet of verdict.bullets) {
    console.log(`- ${bullet}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}

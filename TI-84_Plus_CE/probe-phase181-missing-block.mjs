#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const SEEDS_PATH = path.join(__dirname, 'seeds.txt');
const NEW_SEEDS_PATH = path.join(__dirname, 'new-seeds.txt');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const RAW_BLOCKS = romModule.PRELIFTED_BLOCKS;
const BLOCKS = Array.isArray(RAW_BLOCKS)
  ? Object.fromEntries(RAW_BLOCKS.filter((block) => block?.id).map((block) => [block.id, block]))
  : RAW_BLOCKS;

const MEM_SIZE = 0x1000000;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const STACK_RESET_TOP = 0xD1A87E;
const STAGE_MAX_STEPS = 50000;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;

const STRIP_ROW_START = 37;
const STRIP_ROW_END = 52;

const TARGET_PC = 0x004A7E;
const TARGET_MODE = 'adl';
const ROM_DUMP_BYTES = 48;
const MANUAL_DECODE_LIMIT = 12;

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

function hexByte(value) {
  return (value & 0xFF).toString(16).padStart(2, '0');
}

function signedByte(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function formatHexDump(start, bytes, bytesPerLine = 16) {
  const lines = [];

  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    const chunk = bytes.slice(offset, offset + bytesPerLine);
    const formatted = Array.from(chunk, (value) => hexByte(value)).join(' ');
    lines.push(`${hex(start + offset, 6)}: ${formatted}`);
  }

  return lines.join('\n');
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
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function seedBuffers(mem) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index += 1) {
    const value = MODE_BUF_TEXT.charCodeAt(index);
    mem[MODE_BUF_START + index] = value;
    mem[DISPLAY_BUF_START + index] = value;
  }
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });

  return {
    bootResult,
    kernelInitResult,
    postInitResult,
  };
}

function manualDecodeRows(startPc, bytes) {
  const rows = [];
  let pc = startPc;
  let offset = 0;

  while (offset < bytes.length && rows.length < MANUAL_DECODE_LIMIT) {
    const opcode = bytes[offset];

    switch (opcode) {
      case 0xC8:
        rows.push(`${hex(pc, 6)}  ${hexByte(opcode)}            ret z`);
        pc += 1;
        offset += 1;
        break;
      case 0x98:
        rows.push(`${hex(pc, 6)}  ${hexByte(opcode)}            sbc a, b`);
        pc += 1;
        offset += 1;
        break;
      case 0xD8:
        rows.push(`${hex(pc, 6)}  ${hexByte(opcode)}            ret c`);
        pc += 1;
        offset += 1;
        break;
      case 0x78:
        rows.push(`${hex(pc, 6)}  ${hexByte(opcode)}            ld a, b`);
        pc += 1;
        offset += 1;
        break;
      case 0xF0:
        rows.push(`${hex(pc, 6)}  ${hexByte(opcode)}            ret p`);
        pc += 1;
        offset += 1;
        break;
      case 0x70:
        rows.push(`${hex(pc, 6)}  ${hexByte(opcode)}            ld (hl), b`);
        pc += 1;
        offset += 1;
        break;
      case 0x20: {
        const displacement = bytes[offset + 1] ?? 0x00;
        const target = (pc + 2 + signedByte(displacement)) & 0xFFFFFF;
        rows.push(
          `${hex(pc, 6)}  ${hexByte(opcode)} ${hexByte(displacement)}         jr nz, ${hex(target, 6)}`,
        );
        pc += 2;
        offset += 2;
        break;
      }
      case 0x00:
        rows.push(`${hex(pc, 6)}  ${hexByte(opcode)}            nop`);
        pc += 1;
        offset += 1;
        break;
      default:
        rows.push(`${hex(pc, 6)}  ${hexByte(opcode)}            db ${hex(opcode, 2)}`);
        pc += 1;
        offset += 1;
        break;
    }
  }

  return rows;
}

function scanStrip(mem) {
  const rows = [];
  let totalDrawn = 0;
  let totalFg = 0;
  let totalBg = 0;
  let totalSentinel = 0;
  let firstDrawnCol = null;
  let firstFgCol = null;
  let lastDrawnCol = null;
  let lastFgCol = null;

  for (let row = STRIP_ROW_START; row <= STRIP_ROW_END; row += 1) {
    let drawn = 0;
    let fg = 0;
    let bg = 0;
    let sentinel = 0;
    let rowFirstDrawnCol = null;
    let rowFirstFgCol = null;
    let rowLastDrawnCol = null;
    let rowLastFgCol = null;

    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const pixel = readPixel(mem, row, col);

      if (pixel === VRAM_SENTINEL) {
        sentinel += 1;
        totalSentinel += 1;
        continue;
      }

      drawn += 1;
      totalDrawn += 1;
      rowLastDrawnCol = col;
      lastDrawnCol = col;

      if (rowFirstDrawnCol === null) {
        rowFirstDrawnCol = col;
      }

      if (firstDrawnCol === null) {
        firstDrawnCol = col;
      }

      if (pixel === WHITE_PIXEL) {
        bg += 1;
        totalBg += 1;
        continue;
      }

      fg += 1;
      totalFg += 1;
      rowLastFgCol = col;
      lastFgCol = col;

      if (rowFirstFgCol === null) {
        rowFirstFgCol = col;
      }

      if (firstFgCol === null) {
        firstFgCol = col;
      }
    }

    rows.push({
      row,
      drawn,
      fg,
      bg,
      sentinel,
      firstDrawnCol: rowFirstDrawnCol,
      firstFgCol: rowFirstFgCol,
      lastDrawnCol: rowLastDrawnCol,
      lastFgCol: rowLastFgCol,
    });
  }

  const fullWidthRows = rows.filter(
    (row) => row.firstDrawnCol === 0 && row.lastDrawnCol === VRAM_WIDTH - 1 && row.sentinel === 0,
  ).length;

  return {
    rows,
    drawn: totalDrawn,
    fg: totalFg,
    bg: totalBg,
    sentinel: totalSentinel,
    firstDrawnCol,
    firstFgCol,
    lastDrawnCol,
    lastFgCol,
    fullWidthRows,
    rowsWithFg: rows.filter((row) => row.fg > 0).length,
  };
}

function assessStrip(strip) {
  if (strip.fg === 0) {
    return {
      verdict: 'truncated',
      reason: 'no foreground pixels were drawn in rows 37-52',
    };
  }

  if (strip.rows.some((row) => row.sentinel > 0 || row.lastDrawnCol !== VRAM_WIDTH - 1)) {
    return {
      verdict: 'truncated',
      reason: 'sentinel pixels remain in the strip or some rows stop before column 319',
    };
  }

  if (strip.fullWidthRows === strip.rows.length && (strip.lastFgCol ?? -1) >= 180) {
    return {
      verdict: 'likely_complete',
      reason: `all ${strip.rows.length} strip rows are fully painted and fg reaches column ${strip.lastFgCol}`,
    };
  }

  return {
    verdict: 'unclear',
    reason: 'background looks filled, but foreground coverage is shorter than expected for a full mode strip',
  };
}

function searchTextFile(filePath, needles) {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      hits: [],
    };
  }

  const text = fs.readFileSync(filePath, 'utf8');
  return {
    filePath,
    exists: true,
    hits: needles.filter((needle) => text.includes(needle)),
  };
}

function runStageFromSnapshot(runtime, ramSnap, cpuSnap, label, entry) {
  const { mem, executor, cpu } = runtime;

  mem.set(ramSnap, RAM_SNAPSHOT_START);
  clearVram(mem);
  seedBuffers(mem);
  restoreCpu(cpu, cpuSnap, mem);

  const missingHits = [];
  const seen = new Set();

  const result = executor.runFrom(entry, 'adl', {
    maxSteps: STAGE_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
    onMissingBlock(pc, mode, steps) {
      const key = `${hex(pc, 6)}:${mode}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      missingHits.push({
        pc: pc >>> 0,
        mode,
        steps,
      });
    },
  });

  return {
    label,
    entry,
    result,
    missingHits,
    strip: scanStrip(mem),
  };
}

function printStage(stage) {
  const firstMissing = stage.missingHits[0] ?? null;
  const stripAssessment = assessStrip(stage.strip);

  console.log(`${stage.label}:`);
  console.log(
    `  entry=${hex(stage.entry, 6)} steps=${stage.result.steps} term=${stage.result.termination} lastPc=${hex(stage.result.lastPc, 6)} lastMode=${stage.result.lastMode ?? 'n/a'}`,
  );

  if (firstMissing) {
    console.log(
      `  firstMissing=${hex(firstMissing.pc, 6)}:${firstMissing.mode} at step ${firstMissing.steps}`,
    );
  } else {
    console.log('  firstMissing=none');
  }

  console.log(
    `  stripTotals drawn=${stage.strip.drawn} fg=${stage.strip.fg} bg=${stage.strip.bg} sentinel=${stage.strip.sentinel} fullWidthRows=${stage.strip.fullWidthRows}/${stage.strip.rows.length}`,
  );
  console.log(
    `  stripBounds firstDrawn=${stage.strip.firstDrawnCol ?? 'n/a'} lastDrawn=${stage.strip.lastDrawnCol ?? 'n/a'} firstFg=${stage.strip.firstFgCol ?? 'n/a'} lastFg=${stage.strip.lastFgCol ?? 'n/a'}`,
  );
  console.log(`  stripAssessment=${stripAssessment.verdict} (${stripAssessment.reason})`);
  console.log('  rowScan:');

  for (const row of stage.strip.rows) {
    console.log(
      `    r${row.row}: drawn=${row.drawn} fg=${row.fg} bg=${row.bg} sentinel=${row.sentinel} firstDrawn=${row.firstDrawnCol ?? 'n/a'} lastDrawn=${row.lastDrawnCol ?? 'n/a'} firstFg=${row.firstFgCol ?? 'n/a'} lastFg=${row.lastFgCol ?? 'n/a'}`,
    );
  }
}

function blockExists(key) {
  return Object.prototype.hasOwnProperty.call(BLOCKS, key);
}

function main() {
  console.log('=== Phase 181 - Missing Block Investigation ===');
  console.log('');

  const romSlice = romBytes.slice(TARGET_PC, TARGET_PC + ROM_DUMP_BYTES);
  console.log(`ROM bytes at ${hex(TARGET_PC, 6)} (${romSlice.length} bytes):`);
  console.log(formatHexDump(TARGET_PC, romSlice));
  console.log('');
  console.log('Manual decode attempt from page-0 ROM:');

  for (const row of manualDecodeRows(TARGET_PC, romSlice)) {
    console.log(`  ${row}`);
  }

  console.log('  note: repeated RET/SBC pairs plus long zero runs look like ROM data, not a normal function prologue.');
  console.log('');

  const directKey = '004a7e:adl';
  const prefixedKey = '0x004a7e:adl';
  const nearbyKeyA = '024a75:adl';
  const nearbyKeyB = '024a80:adl';

  console.log('PRELIFTED block lookup:');
  console.log(`  ${directKey} => ${blockExists(directKey) ? 'present' : 'missing'}`);
  console.log(`  ${prefixedKey} => ${blockExists(prefixedKey) ? 'present' : 'missing'}`);
  console.log(`  ${nearbyKeyA} => ${blockExists(nearbyKeyA) ? 'present' : 'missing'}`);
  console.log(`  ${nearbyKeyB} => ${blockExists(nearbyKeyB) ? 'present' : 'missing'}`);
  console.log('');

  const runtime = (() => {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes);
    clearVram(mem);

    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });

    return {
      mem,
      executor,
      cpu: executor.cpu,
    };
  })();

  const boot = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const ramSnap = new Uint8Array(runtime.mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnap = snapshotCpu(runtime.cpu);

  console.log('Boot sequence:');
  console.log(
    `  coldBoot steps=${boot.bootResult.steps} term=${boot.bootResult.termination} lastPc=${hex(boot.bootResult.lastPc, 6)}`,
  );
  console.log(
    `  kernelInit steps=${boot.kernelInitResult.steps} term=${boot.kernelInitResult.termination} lastPc=${hex(boot.kernelInitResult.lastPc, 6)}`,
  );
  console.log(
    `  postInit steps=${boot.postInitResult.steps} term=${boot.postInitResult.termination} lastPc=${hex(boot.postInitResult.lastPc, 6)}`,
  );
  console.log('');

  const stage3 = runStageFromSnapshot(runtime, ramSnap, cpuSnap, 'stage 3 home row strip', STAGE_3_ENTRY);
  const stage4 = runStageFromSnapshot(runtime, ramSnap, cpuSnap, 'stage 4 history area', STAGE_4_ENTRY);

  printStage(stage3);
  console.log('');
  printStage(stage4);
  console.log('');

  const seedsCheck = searchTextFile(SEEDS_PATH, ['0x004a7e', '004a7e']);
  const newSeedsCheck = searchTextFile(NEW_SEEDS_PATH, ['0x004a7e', '004a7e', '0x024a75', '024a75']);

  console.log('Seed file checks:');
  console.log(
    `  ${path.basename(SEEDS_PATH)} => ${seedsCheck.exists ? `exists, hits=[${seedsCheck.hits.join(', ') || 'none'}]` : 'missing file'}`,
  );
  console.log(
    `  ${path.basename(NEW_SEEDS_PATH)} => ${newSeedsCheck.exists ? `exists, hits=[${newSeedsCheck.hits.join(', ') || 'none'}]` : 'missing file'}`,
  );
  console.log('');

  console.log('Verdict:');
  console.log('  0x004a7e should not be added as a transpiler seed.');
  console.log('  The page-0 ROM bytes at 0x004a7e look like bitmap/table data, not executable code, and PRELIFTED_BLOCKS has no 004a7e entry.');
  console.log('  Nearby banked code does exist at 0x024a75/0x024a80, so the missing_block is more likely a page/bank/address-selection bug than a genuinely missing seed.');
}

try {
  main();
} catch (error) {
  console.error('Phase 181 probe failed.');
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}

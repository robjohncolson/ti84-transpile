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
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const STAGE_ENTRY = 0x0A2B72;
const STAGE_MODE = 'adl';
const STAGE_MAX_STEPS = 30000;
const STAGE_MAX_LOOP_ITERATIONS = 500;
const LOW_SP_THRESHOLD = 0x010000;
const ABNORMAL_SP_DELTA = 12;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function formatSignedHex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  const absHex = Math.abs(value).toString(16).padStart(width, '0');
  const sign = value >= 0 ? '+' : '-';
  return `${sign}0x${absHex}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index += 1) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
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
  mem.fill(0xFF, cpu.sp, 12);
}

function formatDecodedInstruction(decoded) {
  if (!decoded) {
    return 'decode failed';
  }

  switch (decoded.tag) {
    case 'call':
      return `call ${hex(decoded.target)}`;
    case 'call-conditional':
      return `call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp':
      return `jp ${hex(decoded.target)}`;
    case 'jp-conditional':
      return `jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect':
      return `jp (${decoded.indirectRegister})`;
    case 'jr':
      return `jr ${hex(decoded.target)}`;
    case 'jr-conditional':
      return `jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${decoded.condition}`;
    case 'reti':
      return 'reti';
    case 'retn':
      return 'retn';
    case 'rst':
      return `rst ${hex(decoded.target, 2)}`;
    case 'djnz':
      return `djnz ${hex(decoded.target)}`;
    case 'ld-pair-mem':
      if (decoded.direction === 'to-mem') {
        return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
      }
      return `ld ${decoded.pair}, (${hex(decoded.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
    case 'ld-pair-imm':
      return `ld ${decoded.pair}, ${hex(decoded.value)}`;
    case 'ld-reg-imm':
      return `ld ${decoded.dest}, ${hex(decoded.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${decoded.dest}, ${decoded.src}`;
    case 'push':
      return `push ${decoded.pair}`;
    case 'pop':
      return `pop ${decoded.pair}`;
    case 'inc-pair':
      return `inc ${decoded.pair}`;
    case 'dec-pair':
      return `dec ${decoded.pair}`;
    case 'add-pair':
      return `add ${decoded.dest}, ${decoded.src}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-pair':
      return `ld sp, ${decoded.pair}`;
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    case 'ex-sp-pair':
      return `ex (sp), ${decoded.pair}`;
    default:
      return decoded.dasm ?? decoded.tag;
  }
}

function safeDecode(pc, mode) {
  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch {
    return null;
  }
}

function createSpTraceRecorder(cpu) {
  const rows = [];
  let previousSp = null;

  return {
    onBlock(pc, mode, meta, steps) {
      const step = steps + 1;
      const sp = cpu.sp & 0xFFFFFF;
      const spDelta = previousSp === null ? null : sp - previousSp;
      const previous = rows[rows.length - 1] ?? null;
      const instructions = meta?.instructions ?? [];
      const lastInstruction = instructions.length === 0
        ? null
        : instructions[instructions.length - 1];

      rows.push({
        step,
        pc: pc & 0xFFFFFF,
        mode,
        sp,
        spDelta,
        lastInstruction: lastInstruction
          ? {
              pc: lastInstruction.pc & 0xFFFFFF,
              dasm: lastInstruction.dasm ?? lastInstruction.tag ?? 'n/a',
            }
          : null,
        abnormalDelta: spDelta !== null && Math.abs(spDelta) > ABNORMAL_SP_DELTA,
        crossedIntoRom: previous
          ? previous.sp >= ROM_LIMIT && sp < ROM_LIMIT
          : sp < ROM_LIMIT,
        lowSp: sp < LOW_SP_THRESHOLD,
      });

      previousSp = sp;
    },

    getRows() {
      return rows.slice();
    },
  };
}

function formatLastInstruction(row) {
  return row.lastInstruction?.dasm ?? 'n/a';
}

function printTraceTable(rows) {
  if (rows.length === 0) {
    console.log('No blocks recorded.');
    return;
  }

  const stepWidth = Math.max('STEP'.length, String(rows[rows.length - 1].step).length);
  const deltaValues = rows.map((row) => formatSignedHex(row.spDelta));
  const deltaWidth = Math.max('SP DELTA'.length, ...deltaValues.map((value) => value.length));

  console.log('FULL BLOCK TRACE');
  console.log(
    `${'STEP'.padStart(stepWidth)}  PC        SP        ${'SP DELTA'.padStart(deltaWidth)}  LAST INSTRUCTION`,
  );
  console.log(
    `${''.padStart(stepWidth, '-')}  --------  --------  ${''.padStart(deltaWidth, '-')}  ----------------`,
  );

  for (const row of rows) {
    const reasons = [];
    if (row.abnormalDelta) {
      reasons.push('delta>12');
    }
    if (row.crossedIntoRom) {
      reasons.push('RAM->ROM');
    }
    if (row.lowSp) {
      reasons.push('SP<0x010000');
    }

    const marker = reasons.length > 0 ? ` <<< ${reasons.join(', ')}` : '';
    console.log(
      `${String(row.step).padStart(stepWidth)}  ${hex(row.pc)}  ${hex(row.sp)}  ${formatSignedHex(row.spDelta).padStart(deltaWidth)}  ${formatLastInstruction(row)}${marker}`,
    );
  }
}

function printSummary(rows) {
  console.log('');
  console.log('SUMMARY');

  const firstRomIndex = rows.findIndex((row) => row.crossedIntoRom || row.sp < ROM_LIMIT);
  if (firstRomIndex === -1) {
    console.log('  SP never entered ROM space.');
    return;
  }

  const romRow = rows[firstRomIndex];
  const previousRow = firstRomIndex > 0 ? rows[firstRomIndex - 1] : null;
  const corruptionPc = previousRow?.lastInstruction?.pc ?? romRow.pc;
  const corruptionMode = previousRow?.mode ?? romRow.mode;
  const decoded = safeDecode(corruptionPc, corruptionMode);
  const decodedText = decoded?.dasm
    ?? previousRow?.lastInstruction?.dasm
    ?? formatDecodedInstruction(decoded);

  console.log(
    `  First ROM-space block: step ${romRow.step}, PC=${hex(romRow.pc)}, SP=${hex(romRow.sp)}`,
  );

  if (previousRow) {
    console.log(
      `  Last good block: step ${previousRow.step}, PC=${hex(previousRow.pc)}, SP=${hex(previousRow.sp)}`,
    );
  } else {
    console.log('  Last good block: none (SP started in ROM space)');
  }

  console.log(
    `  Corruption instruction: ${decodedText} @ ${hex(corruptionPc)}${decoded?.tag ? ` [tag=${decoded.tag}]` : ''}`,
  );
}

async function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('=== Phase 159 - Stage 1 SP Trace ===');
  console.log(`ROM size: ${hex(romBytes.length)}`);
  console.log('');

  coldBoot(executor, cpu, mem);
  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);

  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  clearVram(mem);
  restoreCpu(cpu, cpuSnapshot, mem);

  const trace = createSpTraceRecorder(cpu);
  const result = executor.runFrom(STAGE_ENTRY, STAGE_MODE, {
    maxSteps: STAGE_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
    onBlock: trace.onBlock,
  });

  const rows = trace.getRows();

  console.log(`Entry: ${hex(STAGE_ENTRY)}`);
  console.log(
    `Result: ${result.steps} steps, termination=${result.termination}, lastPc=${hex(result.lastPc)}`,
  );
  console.log('');

  printTraceTable(rows);
  printSummary(rows);
}

await main();

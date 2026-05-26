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
const REPORT_PATH = path.join(__dirname, 'phase449-scancode-mapping-report.md');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];

const GETCSC_ENTRY = 0x003D5A;
const DISASM_START = 0x003D36;
const DISASM_END_EXCLUSIVE = 0x003D59;

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_REFRESH_MODE_ADDR = 0xD177B7;

const STOP_BLOCK_ADDR = 0xFFFFFF;
const STOP_BLOCK_KEY = 'ffffff:adl';

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

const MATRIX_LAYOUT = [
  ['DOWN', 'LEFT', 'RIGHT', 'UP', null, null, null, null],
  ['ENTER', '+', '-', 'x', '/', '^', 'CLEAR', null],
  ['(-)', '3', '6', '9', ')', 'TAN', 'VARS', null],
  ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'X,T,theta,n'],
  [null, 'STO>', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', 'DEL'],
];

const DYNAMIC_KEYS = [
  { label: '1', idx: 4, bit: 1, currentProbeScan: 0x41 },
  { label: '+', idx: 1, bit: 1, currentProbeScan: 0x11 },
  { label: 'ENTER', idx: 1, bit: 0, currentProbeScan: 0x10 },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
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

function formatDisplacement(displacement) {
  const signed = signedByte(displacement & 0xFF);
  return `${signed >= 0 ? '+' : ''}${signed}`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)})`;
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'rla':
      return 'RLA';
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'rotate-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ccf':
      return 'CCF';
    case 'scf':
      return 'SCF';
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ret':
      return 'RET';
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)})`;
    case 'alu-reg':
      if (inst.op === 'or' && inst.src === 'a') {
        return 'OR A';
      }
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    default:
      return inst.tag;
  }
}

function disassembleWindow(romBytes, start, endExclusive) {
  const rows = [];
  let pc = start;

  while (pc < endExclusive) {
    const inst = decodeInstruction(romBytes, pc, MODE);
    const bytes = Array.from(
      romBytes.subarray(pc, pc + inst.length),
      (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
    ).join(' ');

    rows.push({
      addr: pc,
      bytes,
      text: formatInstruction(inst),
    });

    pc += inst.length;
  }

  return rows;
}

function computeProbeScan(idx, bit) {
  return ((idx & 0xF) << 4) | (bit & 0xF);
}

function computeOsGroup(idx) {
  return 7 - idx;
}

function computeOsScanFromIdx(idx, bit) {
  const osGroup = computeOsGroup(idx);
  return (osGroup - 1) * 8 + bit + 1;
}

function buildMappingRows() {
  const rows = [];

  for (let idx = 0; idx < MATRIX_LAYOUT.length; idx += 1) {
    for (let bit = 0; bit < MATRIX_LAYOUT[idx].length; bit += 1) {
      const key = MATRIX_LAYOUT[idx][bit];
      if (!key) {
        continue;
      }

      rows.push({
        key,
        idx,
        bit,
        osGroup: computeOsGroup(idx),
        probeScan: computeProbeScan(idx, bit),
        osScan: computeOsScanFromIdx(idx, bit),
      });
    }
  }

  return rows;
}

function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, MODE, { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = 0xD0;
  cpu._iy = KEY_STATUS_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, MODE, { maxSteps: 100, maxLoopIterations: 32 });

  const stageResults = [];
  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = KEY_STATUS_ADDR;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);

    const stageResult = executor.runFrom(entry, MODE, { maxSteps: 50000, maxLoopIterations: 500 });
    stageResults.push({ entry, result: stageResult });
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  mem[KEY_PROCESSING_ENABLE_ADDR] = 0x01;
  mem[DISPLAY_REFRESH_MODE_ADDR] = 0x55;

  return {
    bootResult,
    kernelResult,
    postInitResult,
    stageResults,
  };
}

function buildBootState(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  const bootSummary = bootToHomeScreen(executor, cpu, mem);

  return {
    bootSummary,
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function installSyntheticStopBlock(executor) {
  executor.compiledBlocks[STOP_BLOCK_KEY] = function stopBlock() {
    return -1;
  };
  executor.blockMeta[STOP_BLOCK_KEY] = { exits: [] };
}

function resetKeyboard(peripherals) {
  if (peripherals.keyboard?.keyMatrix) {
    peripherals.keyboard.keyMatrix.fill(0xFF);
    peripherals.keyboard.groupSelect = 0xFF;
  }

  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
}

function pressMatrixKey(peripherals, idx, bit) {
  if (!peripherals.keyboard?.keyMatrix) {
    throw new Error('Keyboard matrix is not available on the peripheral bus.');
  }
  peripherals.keyboard.keyMatrix[idx] &= ~(1 << bit);
}

function prepareGetCscCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function runDynamicCase(blocks, bootState, key) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  installSyntheticStopBlock(executor);

  resetKeyboard(peripherals);
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;
  pressMatrixKey(peripherals, key.idx, key.bit);
  prepareGetCscCall(cpu, mem);

  const result = executor.runFrom(GETCSC_ENTRY, MODE, {
    maxSteps: 5000,
    maxLoopIterations: 5000,
  });

  const actualA = cpu.a & 0xFF;
  const expectedOsScan = computeOsScanFromIdx(key.idx, key.bit);

  return {
    ...key,
    result,
    actualA,
    expectedOsScan,
    keyRamAfter: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    statusAfter: mem[KEY_STATUS_ADDR] & 0xFF,
  };
}

function buildReport(disasmRows, mappingRows, dynamicRows) {
  const lines = [];

  lines.push('# Phase 449 - OS Scan Code vs Probe Scan Code Mapping');
  lines.push('');
  lines.push('Generated by `probe-phase449-scancode-mapping.mjs`.');
  lines.push('');
  lines.push('## Static Disassembly: 0x003D36-0x003D55');
  lines.push('');
  lines.push('The final instruction in the requested window starts at `0x003D55`, so the listing below includes its full 4-byte body through `0x003D58`.');
  lines.push('');
  lines.push('```asm');
  for (const row of disasmRows) {
    lines.push(`${hex(row.addr)}  ${row.bytes.padEnd(19, ' ')} ${row.text}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Formula Reconstruction');
  lines.push('');
  lines.push('1. `0x003D36: LD A, H` copies the OS group counter into `A`.');
  lines.push('2. `0x003D37: DEC A` converts that to `A = os_group - 1`.');
  lines.push('3. `0x003D3D-0x003D3F: RLA` three times multiplies by 8, so `A = (os_group - 1) * 8`.');
  lines.push('4. `0x003D40-0x003D43: INC A ; RR L ; JR NC, 0x003D40` increments `A` once per rotated bit until the pressed bit reaches carry.');
  lines.push('5. For a key at bit position `bit`, that loop contributes `bit + 1`, so the stored value is `scan_code = (os_group - 1) * 8 + bit + 1`.');
  lines.push('6. `0x003D4B: LD (0xD00587), A` stores that OS scan code.');
  lines.push('7. `keyboard-matrix.md` documents `keyMatrix[idx] = SDK Group(7 - idx)`, so `os_group = 7 - idx`.');
  lines.push('');
  lines.push('Therefore the OS formula is:');
  lines.push('');
  lines.push('```text');
  lines.push('scan_code = ((7 - idx) - 1) * 8 + bit + 1');
  lines.push('          = (6 - idx) * 8 + bit + 1');
  lines.push('```');
  lines.push('');
  lines.push('The probe formula currently used by `probe-workflow-arithmetic.mjs` is different:');
  lines.push('');
  lines.push('```text');
  lines.push('scan_code = (idx << 4) | bit');
  lines.push('```');
  lines.push('');
  lines.push('## Full Mapping Table');
  lines.push('');
  lines.push('| Key | keyMatrix idx | OS group | Bit | Probe formula `(idx<<4)|bit` | OS formula | Match |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const row of mappingRows) {
    lines.push(`| ${row.key} | ${row.idx} | ${row.osGroup} | ${row.bit} | ${hexByte(row.probeScan)} | ${hexByte(row.osScan)} | ${row.probeScan === row.osScan ? 'same' : 'different'} |`);
  }
  lines.push('');
  lines.push('Every populated key differs. There are no real keys for which the probe formula already matches the OS `_GetCSC` result.');
  lines.push('');
  lines.push('## Dynamic Verification via Direct `_GetCSC` Call');
  lines.push('');
  lines.push('Boot sequence used: the same workflow-style path as `probe-workflow-arithmetic.mjs`, then a direct call to `_GetCSC` at `0x003D5A` with a synthetic stop block at `0xFFFFFF` so the function can return cleanly.');
  lines.push('');
  lines.push('| Key | idx | bit | Current probe scan | Expected OS scan | `_GetCSC` returned `A` | Steps | Termination | Verdict |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of dynamicRows) {
    const verdict = row.actualA === row.expectedOsScan ? 'matches OS formula' : 'mismatch';
    lines.push(`| ${row.label} | ${row.idx} | ${row.bit} | ${hexByte(row.currentProbeScan)} | ${hexByte(row.expectedOsScan)} | ${hexByte(row.actualA)} | ${row.result.steps} | ${row.result.termination} | ${verdict} |`);
  }
  lines.push('');
  lines.push('## Workflow Probe Fix');
  lines.push('');
  lines.push('The current values in `probe-workflow-arithmetic.mjs` are wrong for `_GetCSC` / OS scan-code injection.');
  lines.push('');
  lines.push('- `KEY_ONE` should be `0x12`, not `0x41`.');
  lines.push('- `KEY_PLUS` should be `0x2A`, not `0x11`.');
  lines.push('- `KEY_ENTER` should be `0x29`, not `0x10`.');

  return `${lines.join('\n')}\n`;
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
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

  const disasmRows = disassembleWindow(romBytes, DISASM_START, DISASM_END_EXCLUSIVE);
  const mappingRows = buildMappingRows();
  const bootState = buildBootState(blocks, romBytes);
  const dynamicRows = DYNAMIC_KEYS.map((key) => runDynamicCase(blocks, bootState, key));

  const report = buildReport(disasmRows, mappingRows, dynamicRows);
  fs.writeFileSync(REPORT_PATH, report);

  console.log(report);
  console.log(`Report written to ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

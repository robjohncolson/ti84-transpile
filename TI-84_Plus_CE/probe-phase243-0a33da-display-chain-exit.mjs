#!/usr/bin/env node

/**
 * Phase 243: trace terminal display-chain block 0x0A33DA before exit.
 *
 * Session 242 found the post-fill display chain enters the 0x0A3200-0x0A3500
 * range around step ~4980 and eventually exits back to 0x04EE00 through the
 * last in-range block at 0x0A33DA.
 *
 * This probe reuses the phase 242 warm boot + 0x04EDD0 entry path, adds the
 * home-screen edit/gap-buffer seed, and stops when 0x0A33DA exits the display
 * chain so we can inspect:
 *   - raw ROM bytes + decoded instructions at 0x0A33DA
 *   - full register state at 0x0A33DA entry
 *   - the three immediately preceding blocks
 *   - the successor block after 0x0A33DA
 *   - RAM writes caused by the 0x0A33DA block
 *   - VRAM-window writes in 0xD40000-0xD52C00
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const ENTRY_PC = 0x04EDD0;
const STEP_BUDGET = 150000;
const CHECKPOINT_INTERVAL = 25000;

const CHAIN_RANGE_START = 0x0A3200;
const CHAIN_RANGE_END = 0x0A3500;
const TARGET_PC = 0x0A33DA;
const TARGET_RAW_BYTE_COUNT = 20;

const RAM_SCAN_START = 0xD00000;
const VRAM_SCAN_START = 0xD40000;
const VRAM_SCAN_END = 0xD52C00; // exclusive, matches requested window

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;
const EDIT_BUF = 0xD00A00;
const EDIT_END = 0xD00B00;

const ENTRY_SEEDS = [
  { addr: 0xD0058E, value: 0x8F, name: 'D0058E (digit 1 keypress)' },
  { addr: 0xD0058D, value: 0x00, name: 'D0058D' },
  { addr: 0xD0059F, value: 0x00, name: 'D0059F' },
  { addr: 0xD003E0, value: 0x00, name: 'D003E0' },
  { addr: 0xD00824, value: 0x00, name: 'D00824' },
  { addr: 0xD003DA, value: 0x00, name: 'D003DA' },
  { addr: 0xD007E0, value: 0x40, name: 'D007E0 (home app)' },
  { addr: 0xD00000, value: 0x00, name: 'D00000' },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) {
    return currentMode;
  }

  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }

  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    const result = fn(this);

    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }

    return result;
  };
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase243-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }

  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function normalizeBlocks(raw) {
  return Array.isArray(raw)
    ? Object.fromEntries(raw.filter((block) => block?.id).map((block) => [block.id, block]))
    : (raw ?? {});
}

function createRuntime(blocks, romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP, EDIT_BUF);
  write24(mem, EDIT_CURSOR, EDIT_BUF);
  write24(mem, EDIT_TAIL, EDIT_END);
  write24(mem, EDIT_BTM, EDIT_END);
  mem.fill(0x00, EDIT_BUF, EDIT_END);
}

function seedEntryState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = ENTRY_PC;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x1D;
  cpu.f = 0x00;

  for (let offset = 0; offset < 128; offset++) {
    mem[(IY_BASE + offset) & MEM_MASK] = 0x00;
  }

  for (const seed of ENTRY_SEEDS) {
    mem[seed.addr & MEM_MASK] = seed.value & 0xFF;
  }

  seedEditBuffer(mem);
  push24(cpu, mem, RETURN_SENTINEL);
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode error)';
  }

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': {
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      const addrWidth = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      if (inst.direction === 'to-mem') {
        return `LD${suffix} (${hex(inst.addr, addrWidth)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `LD${suffix} ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, addrWidth)})`;
    }
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    case 'pop':
      return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    default: {
      let text = inst.tag;
      if (inst.bit !== undefined) text += ` bit=${inst.bit}`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
      return text;
    }
  }
}

function disassembleWindow(romBytes, start, byteCount) {
  const rows = [];
  const end = start + byteCount;

  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = inst.length || 1;
      rows.push({
        pc,
        length,
        bytes: bytesToHex(romBytes.subarray(pc, Math.min(pc + length, end))),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        length: 1,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }

  return rows;
}

function inferExitInstruction(disassembly) {
  const row = disassembly.find((item) => /^(JP|JR|RET|CALL|DJNZ)\b/.test(item.text));
  if (!row) {
    return null;
  }
  return { pc: row.pc, text: row.text };
}

function snapshotRegisters(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF,
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
    madl: cpu.madl ? 1 : 0,
    mbase: cpu.mbase & 0xFF,
  };
}

function regsString(regs) {
  return (
    `PC=${hex(regs.pc)} A=${hexByte(regs.a)} F=${hexByte(regs.f)} ` +
    `BC=${hex(regs.bc)} DE=${hex(regs.de)} HL=${hex(regs.hl)} ` +
    `IX=${hex(regs.ix)} IY=${hex(regs.iy)} SP=${hex(regs.sp)} ` +
    `I=${hexByte(regs.i)} IM=${regs.im} IFF1=${regs.iff1} IFF2=${regs.iff2} ` +
    `MADL=${regs.madl} MBASE=${hexByte(regs.mbase)}`
  );
}

function collectChangedRanges(before, after, start, end, options = {}) {
  const maxRanges = options.maxRanges ?? 128;
  const previewBytes = options.previewBytes ?? 16;
  const ranges = [];
  let truncated = false;
  let changedBytes = 0;

  for (let addr = start; addr < end;) {
    if (before[addr] === after[addr]) {
      addr += 1;
      continue;
    }

    const rangeStart = addr;
    while (addr < end && before[addr] !== after[addr]) {
      changedBytes += 1;
      addr += 1;
    }
    const rangeEnd = addr;

    if (ranges.length < maxRanges) {
      const length = rangeEnd - rangeStart;
      const previewEnd = Math.min(rangeStart + previewBytes, rangeEnd);
      ranges.push({
        start: rangeStart,
        end: rangeEnd - 1,
        length,
        beforePreview: bytesToHex(before.subarray(rangeStart, previewEnd)),
        afterPreview: bytesToHex(after.subarray(rangeStart, previewEnd)),
      });
    } else {
      truncated = true;
    }
  }

  return { changedBytes, ranges, truncated };
}

function isOutsideChain(pc) {
  return pc < CHAIN_RANGE_START || pc >= CHAIN_RANGE_END;
}

function traceToTarget(cpu, mem, romBytes, budget) {
  const history = [];
  const checkpoints = [{ step: 0, regs: snapshotRegisters(cpu), note: 'entry' }];
  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let targetCapture = null;
  let finalTargetCapture = null;

  while (executedSteps < budget) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    const predecessors = history.slice(-3);
    history.push(pc);
    if (history.length > 64) {
      history.shift();
    }

    if (pc === TARGET_PC) {
      const beforeRegs = snapshotRegisters(cpu);
      const beforeMem = new Uint8Array(mem);
      let result;

      try {
        result = cpu.step();
      } catch (traceError) {
        stopReason = 'error';
        error = traceError instanceof Error ? traceError.message : String(traceError);
        break;
      }

      executedSteps += 1;
      const successorPc = cpu.pc & 0xFFFFFF;
      const successorMode = cpu.madl ? 'adl' : 'z80';
      const disassembly = disassembleWindow(romBytes, TARGET_PC, TARGET_RAW_BYTE_COUNT);
      const exitInstruction = inferExitInstruction(disassembly);
      const ramWrites = collectChangedRanges(beforeMem, mem, RAM_SCAN_START, MEM_SIZE, {
        maxRanges: 128,
        previewBytes: 16,
      });
      const vramWrites = collectChangedRanges(beforeMem, mem, VRAM_SCAN_START, VRAM_SCAN_END, {
        maxRanges: 128,
        previewBytes: 16,
      });

      targetCapture = {
        step: executedSteps - 1,
        terminalExit: isOutsideChain(successorPc),
        predecessors,
        targetPc: TARGET_PC,
        successorPc,
        successorMode,
        stepResult: result,
        registers: beforeRegs,
        rawBytes: bytesToHex(romBytes.subarray(TARGET_PC, TARGET_PC + TARGET_RAW_BYTE_COUNT)),
        disassembly,
        exitInstruction,
        ramWrites,
        vramWrites,
      };

      if (targetCapture.terminalExit) {
        finalTargetCapture = targetCapture;
        stopReason = 'captured_terminal_target';
        break;
      }

      continue;
    }

    let result;
    try {
      result = cpu.step();
    } catch (traceError) {
      stopReason = 'error';
      error = traceError instanceof Error ? traceError.message : String(traceError);
      break;
    }

    executedSteps += 1;

    if (executedSteps % CHECKPOINT_INTERVAL === 0) {
      checkpoints.push({
        step: executedSteps,
        regs: snapshotRegisters(cpu),
        note: 'periodic',
      });
    }

    if (result === -1) {
      stopReason = 'halt';
      break;
    }
    if (result === -2) {
      stopReason = 'sleep';
      break;
    }
    if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }
  }

  checkpoints.push({
    step: executedSteps,
    regs: snapshotRegisters(cpu),
    note: 'final',
  });

  return {
    executedSteps,
    stopReason,
    error,
    targetCapture: finalTargetCapture ?? targetCapture,
    checkpoints,
    finalRegs: snapshotRegisters(cpu),
  };
}

function printRangeSet(title, diffSet) {
  console.log(title);
  console.log(`  Changed bytes: ${diffSet.changedBytes}`);

  if (diffSet.ranges.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }

  for (const range of diffSet.ranges) {
    console.log(
      `  ${hex(range.start)}..${hex(range.end)} (${range.length} byte${range.length === 1 ? '' : 's'})`,
    );
    console.log(`    before: ${range.beforePreview}`);
    console.log(`    after:  ${range.afterPreview}`);
  }

  if (diffSet.truncated) {
    console.log('  ...additional changed ranges omitted...');
  }
  console.log('');
}

function printResults(result) {
  console.log('========================================================================');
  console.log('Phase 243: 0x0A33DA display-chain exit block');
  console.log('========================================================================');
  console.log(`Executed steps: ${result.executedSteps}/${STEP_BUDGET}`);
  console.log(`Stop reason:    ${result.stopReason}`);
  console.log(`Final regs:     ${regsString(result.finalRegs)}`);
  if (result.error) {
    console.log(`Error:          ${result.error}`);
  }
  console.log('');

  if (!result.targetCapture) {
    console.log('Target block was not captured.');
    console.log('');
    console.log('Checkpoints:');
    for (const checkpoint of result.checkpoints) {
      console.log(
        `  step ${String(checkpoint.step).padStart(6, ' ')}: ` +
        `${regsString(checkpoint.regs)} (${checkpoint.note})`,
      );
    }
    console.log('');
    return;
  }

  const capture = result.targetCapture;

  console.log('------------------------------------------------------------------------');
  console.log('Target block summary');
  console.log('------------------------------------------------------------------------');
  console.log(`Step:             ${capture.step}`);
  console.log(`Block:            ${hex(capture.targetPc)}`);
  console.log(`Successor block:  ${hex(capture.successorPc)} (${capture.successorMode})`);
  console.log(`Step result:      ${capture.stepResult >= 0 ? hex(capture.stepResult) : capture.stepResult}`);
  console.log(`Terminal exit:    ${capture.terminalExit ? 'yes' : 'no'}`);
  console.log(
    `Approach path:    ${[...capture.predecessors, capture.targetPc, capture.successorPc].map((pc) => hex(pc)).join(' -> ')}`,
  );
  if (capture.exitInstruction) {
    console.log(
      `Exit instruction: ${capture.exitInstruction.text} @ ${hex(capture.exitInstruction.pc)}`,
    );
  } else {
    console.log('Exit instruction: not identified in decoded 20-byte window');
  }
  console.log('');

  console.log('------------------------------------------------------------------------');
  console.log(`ROM bytes @ ${hex(TARGET_PC)} (+${TARGET_RAW_BYTE_COUNT} bytes)`);
  console.log('------------------------------------------------------------------------');
  console.log(`  ${capture.rawBytes}`);
  console.log('');

  console.log('------------------------------------------------------------------------');
  console.log('Decoded instruction window');
  console.log('------------------------------------------------------------------------');
  for (const row of capture.disassembly) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
  }
  console.log('');

  console.log('------------------------------------------------------------------------');
  console.log('Register state at 0x0A33DA entry');
  console.log('------------------------------------------------------------------------');
  console.log(`  ${regsString(capture.registers)}`);
  console.log('');

  console.log('------------------------------------------------------------------------');
  console.log(`RAM writes in block (${hex(RAM_SCAN_START)}..${hex(MEM_SIZE - 1)})`);
  console.log('------------------------------------------------------------------------');
  printRangeSet('', capture.ramWrites);

  console.log('------------------------------------------------------------------------');
  console.log(`VRAM-window writes in block (${hex(VRAM_SCAN_START)}..${hex(VRAM_SCAN_END - 1)})`);
  console.log('------------------------------------------------------------------------');
  printRangeSet('', capture.vramWrites);

  console.log('------------------------------------------------------------------------');
  console.log('Periodic checkpoints');
  console.log('------------------------------------------------------------------------');
  for (const checkpoint of result.checkpoints) {
    console.log(
      `  step ${String(checkpoint.step).padStart(6, ' ')}: ` +
      `${regsString(checkpoint.regs)} (${checkpoint.note})`,
    );
  }
  console.log('');
}

async function main() {
  const assets = ensureTranspiledModule();

  try {
    const romBytes = fs.readFileSync(ROM_PATH);
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule,
    );

    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }

    const runtime = createRuntime(blocks, romBytes);

    console.log('Phase 243: 0x0A33DA display-chain exit probe');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log('Peripheral seed: pllDelay=2 timerInterrupt=false');
    console.log(
      `Entry: PC=${hex(ENTRY_PC)} A=${hexByte(0x1D)} IX=${hex(IX_BASE)} ` +
      `IY=${hex(IY_BASE)} MBASE=${hexByte(MBASE)} D003E0=${hexByte(0x00)}`,
    );
    console.log(
      `Edit buffer seed: top/cursor=${hex(EDIT_BUF)} tail/btm=${hex(EDIT_END)} ` +
      '(empty home-screen gap buffer)',
    );
    console.log(`Target block: ${hex(TARGET_PC)}  Budget: ${STEP_BUDGET} block steps`);
    console.log('');

    const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
    const bootMemory = new Uint8Array(runtime.mem);
    const bootCpuSnapshot = snapshotCpu(runtime.cpu);

    console.log('Cold boot summary:');
    console.log(
      `  boot=${bootSummary.boot.steps}/${bootSummary.boot.termination} ` +
      `kernel=${bootSummary.kernel.steps}/${bootSummary.kernel.termination} ` +
      `post=${bootSummary.post.steps}/${bootSummary.post.termination}`,
    );
    console.log('');

    runtime.mem.set(bootMemory);
    restoreCpu(runtime.cpu, bootCpuSnapshot);
    seedEntryState(runtime.cpu, runtime.mem);

    const result = traceToTarget(runtime.cpu, runtime.mem, romBytes, STEP_BUDGET);
    printResults(result);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});

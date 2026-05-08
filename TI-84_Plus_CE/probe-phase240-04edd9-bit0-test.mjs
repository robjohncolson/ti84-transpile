#!/usr/bin/env node

/**
 * Phase 240: Trace the D003E0 bit 0 gate in the 0x04EDD0 shared handler.
 *
 * Goals:
 *   1. Staticaly disassemble 0x04EDD0..0x04EE10 and identify the exact
 *      bit-test site near 0x04EDD9.
 *   2. Cold-boot once, then run 0x04EDD0 twice with D003E0={0x00,0x01}.
 *   3. Compare the block paths for BIT 0 clear vs set over 5000 block steps.
 *   4. Report which downstream branch each case takes and what that implies.
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

const ENTRY_PC = 0x04EDD0;
const DISASM_START = 0x04EDD0;
const DISASM_END = 0x04EE10;

const BIT0_QUESTION_PC = 0x04EDD9;
const BIT0_TEST_PC = 0x04EDDD;
const BIT0_BRANCH_PC = 0x04EDDF;
const BIT0_SET_ENTRY = 0x04EDE3;
const BIT0_SET_CALL_TARGET = 0x0850D1;
const BIT0_CLEAR_ENTRY = 0x04EE06;
const BIT0_CLEAR_CALL_TARGET = 0x04E447;

const STEP_LIMIT = 5000;
const LOOP_ITERATION_LIMIT = 256;
const POST_BRANCH_BLOCK_LIMIT = 24;

const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_HOME = 0xD1A860;
const IY_HOME = 0xD00080;
const STACK_TOP = 0xD1A800;
const ENTRY_A = 0x44;

const D00000_ADDR = 0xD00000;
const D003DA_ADDR = 0xD003DA;
const D003E0_ADDR = 0xD003E0;
const D0058D_ADDR = 0xD0058D;
const D0058E_ADDR = 0xD0058E;
const D0059F_ADDR = 0xD0059F;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;

const WAYPOINTS = new Map([
  [ENTRY_PC, 'shared handler entry'],
  [0x04ECCE, 'helper 0x04ECCE'],
  [0x07F984, 'helper 0x07F984'],
  [0x08BF22, 'helper 0x08BF22'],
  [0x09EFDE, 'VRAM fill loop 0x09EFDE'],
  [BIT0_QUESTION_PC, 'HL load before BIT 0 gate'],
  [BIT0_SET_ENTRY, 'BIT 0 set fallthrough block'],
  [BIT0_CLEAR_ENTRY, 'BIT 0 clear jump target'],
  [BIT0_SET_CALL_TARGET, 'display-update branch 0x0850D1'],
  [BIT0_CLEAR_CALL_TARGET, 'alternate computation branch 0x04E447'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
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

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
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
    default: {
      let text = inst.tag;
      if (inst.bit !== undefined) text += ` bit=${inst.bit}`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
      return text;
    }
  }
}

function decodeAt(romBytes, pc) {
  try {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const length = inst.length || 1;
    return {
      pc,
      length,
      bytes: bytesToHex(romBytes.subarray(pc, pc + length)),
      text: formatInstruction(inst),
      inst,
    };
  } catch (error) {
    return {
      pc,
      length: 1,
      bytes: hexByte(romBytes[pc]),
      text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
      inst: null,
    };
  }
}

function disassembleRange(romBytes, start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    const row = decodeAt(romBytes, pc);
    rows.push(row);
    pc += row.length;
  }
  return rows;
}

function printDisassembly(rows) {
  console.log('========================================================================');
  console.log(`STATIC DISASSEMBLY ${hex(DISASM_START)}..${hex(DISASM_END)}`);
  console.log('========================================================================');
  for (const row of rows) {
    const marker =
      row.pc === BIT0_QUESTION_PC
        ? ' <-- 0x04EDD9 from the task prompt'
        : row.pc === BIT0_TEST_PC
          ? ' <-- actual BIT 0 test'
          : row.pc === BIT0_BRANCH_PC
            ? ' <-- conditional branch after BIT 0'
            : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(22)} ${row.text}${marker}`);
  }
  console.log('');
}

function findNextConditionalBranch(rows, startPc) {
  const startIndex = rows.findIndex((row) => row.pc === startPc);
  if (startIndex < 0) return null;

  for (let index = startIndex + 1; index < rows.length; index++) {
    const tag = rows[index].inst?.tag;
    if (tag === 'jp-conditional' || tag === 'jr-conditional') {
      return rows[index];
    }
    if (tag === 'jp' || tag === 'jr' || tag === 'ret') {
      return null;
    }
  }
  return null;
}

function describeArm(rows, entryPc) {
  const row = rows.find((candidate) => candidate.pc === entryPc);
  if (!row) {
    return {
      entryPc,
      entryText: '(not found)',
      callTarget: null,
      callText: '(not found)',
    };
  }

  let callTarget = null;
  let callText = '(no direct CALL)';
  if (row.inst?.tag === 'call') {
    callTarget = row.inst.target;
    callText = row.text;
  } else {
    const nextPc = row.pc + row.length;
    const nextRow = rows.find((candidate) => candidate.pc === nextPc);
    if (nextRow?.inst?.tag === 'call') {
      callTarget = nextRow.inst.target;
      callText = nextRow.text;
    }
  }

  return {
    entryPc,
    entryText: row.text,
    callTarget,
    callText,
  };
}

function analyzeBit0Gate(rows) {
  const promptRow = rows.find((row) => row.pc === BIT0_QUESTION_PC) ?? null;
  const testRow = rows.find((row) => row.pc === BIT0_TEST_PC) ?? null;
  const branchRow = findNextConditionalBranch(rows, BIT0_TEST_PC);
  const setArm = describeArm(rows, BIT0_SET_ENTRY);
  const clearArm = describeArm(rows, BIT0_CLEAR_ENTRY);

  return {
    promptRow,
    testRow,
    branchRow,
    setArm,
    clearArm,
    exactFinding:
      promptRow?.inst?.tag === 'ld-pair-imm' &&
      promptRow.inst.pair === 'hl' &&
      promptRow.inst.value === D003E0_ADDR &&
      testRow?.inst?.tag === 'bit-test-ind' &&
      testRow.inst.bit === 0 &&
      testRow.inst.indirectRegister === 'hl'
        ? '0x04EDD9 is LD HL,0xD003E0; the actual BIT 0,(HL) is at 0x04EDDD.'
        : 'Unexpected decode near 0x04EDD9; inspect the disassembly above.',
  };
}

function printGateAnalysis(gate) {
  console.log('========================================================================');
  console.log('BIT 0 GATE ANALYSIS');
  console.log('========================================================================');
  console.log(`  Questioned site: ${hex(BIT0_QUESTION_PC)} -> ${gate.promptRow?.text ?? '(missing)'}`);
  console.log(`  Actual test:     ${hex(gate.testRow?.pc ?? 0)} -> ${gate.testRow?.text ?? '(missing)'}`);
  console.log(`  Branch after:    ${hex(gate.branchRow?.pc ?? 0)} -> ${gate.branchRow?.text ?? '(missing)'}`);
  console.log('');
  console.log(`  Finding: ${gate.exactFinding}`);
  console.log(`  BIT 0 clear (Z=1) : jump to ${hex(gate.branchRow?.inst?.target)} -> ${gate.clearArm.callText}`);
  console.log(`  BIT 0 set   (Z=0) : fall through to ${hex(gate.setArm.entryPc)} -> ${gate.setArm.callText}`);
  console.log('');
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      source: 'js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.',
    );
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase240-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));

  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
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

function makeStopError(reason, pc) {
  const error = new Error('__PHASE240_STOP__');
  error.phase240Stop = {
    reason,
    pc: pc & 0xFFFFFF,
  };
  return error;
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

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernelInit, postInit };
}

function seedHandlerEntry(cpu, mem, d003e0Value) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.ix = IX_HOME;
  cpu.iy = IY_HOME;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = ENTRY_A;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;

  mem.fill(0xFF, STACK_TOP - 32, STACK_TOP + 3);
  mem[D00000_ADDR] = 0x00;
  mem[D003DA_ADDR] = 0x00;
  mem[D003E0_ADDR] = d003e0Value & 0xFF;
  mem[D0058D_ADDR] = 0x00;
  mem[D0058E_ADDR] = 0x00;
  mem[D0059F_ADDR] = 0x00;
  mem[D007E0_ADDR] = 0x40;
  mem[D00824_ADDR] = 0x00;

  push24(cpu, mem, RETURN_SENTINEL);
}

function formatAddressList(addrs) {
  if (!addrs.length) return ['    (none)'];

  const lines = [];
  let current = '    ';
  for (let index = 0; index < addrs.length; index++) {
    const piece = hex(addrs[index]);
    const suffix = index === addrs.length - 1 ? '' : ', ';
    if (current.length + piece.length + suffix.length > 100) {
      lines.push(current.trimEnd());
      current = '    ';
    }
    current += piece + suffix;
  }
  if (current.trim().length > 0) {
    lines.push(current.trimEnd());
  }
  return lines;
}

function branchSummary(trace) {
  if (trace.branchDecision === 'clear') {
    return `BIT 0 clear -> JP Z taken -> CALL ${hex(BIT0_CLEAR_CALL_TARGET)} (normal home-screen / alternate computation path)`;
  }
  if (trace.branchDecision === 'set') {
    return `BIT 0 set -> JP Z not taken -> CALL ${hex(BIT0_SET_CALL_TARGET)} (display-update path)`;
  }
  return 'Branch decision not observed within the trace budget.';
}

function runHandlerTrace(blocks, bootedMem, label, d003e0Value) {
  const mem = new Uint8Array(bootedMem);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  seedHandlerEntry(cpu, mem, d003e0Value);

  const orderedBlocks = [];
  const uniqueBlocks = [];
  const uniqueSet = new Set();
  const visitCounts = new Map();
  const waypointHits = [];
  const waypointSeen = new Set();
  const postBranchBlocks = [];
  let steps = 0;
  let stopReason = 'max_steps';
  let stopPc = ENTRY_PC;
  let loopsForced = 0;
  let branchDecision = null;
  let branchStep = null;

  try {
    const result = executor.runFrom(ENTRY_PC, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: LOOP_ITERATION_LIMIT,
      onBlock(pc, mode, meta, step) {
        const currentPc = pc & 0xFFFFFF;
        const currentStep = (step ?? 0) + 1;

        orderedBlocks.push(currentPc);
        steps = Math.max(steps, currentStep);
        stopPc = currentPc;

        if (!uniqueSet.has(currentPc)) {
          uniqueSet.add(currentPc);
          uniqueBlocks.push(currentPc);
        }
        visitCounts.set(currentPc, (visitCounts.get(currentPc) || 0) + 1);

        if (WAYPOINTS.has(currentPc) && !waypointSeen.has(currentPc)) {
          waypointSeen.add(currentPc);
          waypointHits.push({
            step: currentStep,
            pc: currentPc,
            note: WAYPOINTS.get(currentPc),
          });
        }

        if (branchDecision === null) {
          if (currentPc === BIT0_CLEAR_ENTRY || currentPc === BIT0_CLEAR_CALL_TARGET) {
            branchDecision = 'clear';
            branchStep = currentStep;
          } else if (currentPc === BIT0_SET_ENTRY || currentPc === BIT0_SET_CALL_TARGET) {
            branchDecision = 'set';
            branchStep = currentStep;
          }
        }

        if (branchDecision !== null && postBranchBlocks.length < POST_BRANCH_BLOCK_LIMIT) {
          postBranchBlocks.push(currentPc);
        }
      },
      onMissingBlock(pc, mode, step) {
        const currentPc = pc & 0xFFFFFF;
        const currentStep = (step ?? 0) + 1;

        orderedBlocks.push(currentPc);
        steps = Math.max(steps, currentStep);
        stopPc = currentPc;

        if (!uniqueSet.has(currentPc)) {
          uniqueSet.add(currentPc);
          uniqueBlocks.push(currentPc);
        }
        visitCounts.set(currentPc, (visitCounts.get(currentPc) || 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
        throw makeStopError('missing_block', currentPc);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    stopPc = (result.lastPc ?? stopPc) & 0xFFFFFF;
    stopReason = result.termination ?? stopReason;
    loopsForced = result.loopsForced ?? 0;
  } catch (error) {
    if (error?.phase240Stop) {
      stopReason = error.phase240Stop.reason;
      stopPc = error.phase240Stop.pc;
    } else {
      stopReason = `error: ${error?.message ?? String(error)}`;
    }
  }

  return {
    label,
    d003e0Value,
    steps,
    stopReason,
    stopPc,
    loopsForced,
    branchDecision,
    branchStep,
    orderedBlocks,
    uniqueBlocks,
    visitCounts,
    waypointHits,
    postBranchBlocks,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalHL: cpu.hl & 0xFFFFFF,
    finalDE: cpu.de & 0xFFFFFF,
    finalBC: cpu.bc & 0xFFFFFF,
    finalSP: cpu.sp & 0xFFFFFF,
    finalIX: cpu.ix & 0xFFFFFF,
    finalIY: cpu.iy & 0xFFFFFF,
  };
}

function compareTraces(clearTrace, setTrace) {
  const prefix = [];
  let divergenceIndex = -1;
  const limit = Math.min(clearTrace.orderedBlocks.length, setTrace.orderedBlocks.length);

  for (let index = 0; index < limit; index++) {
    const clearPc = clearTrace.orderedBlocks[index];
    const setPc = setTrace.orderedBlocks[index];
    if (clearPc !== setPc) {
      divergenceIndex = index;
      break;
    }
    prefix.push(clearPc);
  }

  const clearSet = new Set(clearTrace.uniqueBlocks);
  const setSet = new Set(setTrace.uniqueBlocks);

  return {
    commonPrefixBlocks: [...new Set(prefix)],
    divergenceStep: divergenceIndex >= 0 ? divergenceIndex + 1 : null,
    divergenceClearPc:
      divergenceIndex >= 0 ? clearTrace.orderedBlocks[divergenceIndex] ?? null : null,
    divergenceSetPc:
      divergenceIndex >= 0 ? setTrace.orderedBlocks[divergenceIndex] ?? null : null,
    clearOnlyBlocks: clearTrace.uniqueBlocks.filter((pc) => !setSet.has(pc)),
    setOnlyBlocks: setTrace.uniqueBlocks.filter((pc) => !clearSet.has(pc)),
  };
}

function printTrace(trace) {
  console.log('------------------------------------------------------------------------');
  console.log(`${trace.label}  D003E0=${hexByte(trace.d003e0Value)}`);
  console.log('------------------------------------------------------------------------');
  console.log(`  Steps:        ${trace.steps}`);
  console.log(`  Stop reason:  ${trace.stopReason}`);
  console.log(`  Stop PC:      ${hex(trace.stopPc)}`);
  console.log(`  Loops forced: ${trace.loopsForced}`);
  console.log(`  Branch step:  ${trace.branchStep ?? '(not observed)'}`);
  console.log(`  Branch:       ${branchSummary(trace)}`);
  console.log(`  Final regs:   A=${hexByte(trace.finalA)} F=${hexByte(trace.finalF)} HL=${hex(trace.finalHL)} DE=${hex(trace.finalDE)} BC=${hex(trace.finalBC)}`);
  console.log(`  Final ptrs:   SP=${hex(trace.finalSP)} IX=${hex(trace.finalIX)} IY=${hex(trace.finalIY)}`);
  console.log('');

  console.log(`  Unique blocks (${trace.uniqueBlocks.length}):`);
  for (const line of formatAddressList(trace.uniqueBlocks)) {
    console.log(line);
  }
  console.log('');

  console.log(`  First ${POST_BRANCH_BLOCK_LIMIT} blocks after branch selection (${trace.postBranchBlocks.length} captured):`);
  for (const line of formatAddressList(trace.postBranchBlocks)) {
    console.log(line);
  }
  console.log('');

  console.log(`  Waypoints hit (${trace.waypointHits.length}):`);
  if (trace.waypointHits.length === 0) {
    console.log('    (none)');
  } else {
    for (const hit of trace.waypointHits) {
      console.log(`    step ${String(hit.step).padStart(4)}: ${hex(hit.pc)}  ${hit.note}`);
    }
  }
  console.log('');
}

function printComparison(comparison) {
  console.log('========================================================================');
  console.log('TRACE COMPARISON');
  console.log('========================================================================');
  console.log(`  Common prefix unique blocks (${comparison.commonPrefixBlocks.length}):`);
  for (const line of formatAddressList(comparison.commonPrefixBlocks)) {
    console.log(line);
  }
  console.log('');

  console.log(`  First divergence step: ${comparison.divergenceStep ?? '(none observed)'}`);
  console.log(`  Clear trace PC:        ${hex(comparison.divergenceClearPc)}`);
  console.log(`  Set trace PC:          ${hex(comparison.divergenceSetPc)}`);
  console.log('');

  console.log(`  Clear-only unique blocks (${comparison.clearOnlyBlocks.length}):`);
  for (const line of formatAddressList(comparison.clearOnlyBlocks)) {
    console.log(line);
  }
  console.log('');

  console.log(`  Set-only unique blocks (${comparison.setOnlyBlocks.length}):`);
  for (const line of formatAddressList(comparison.setOnlyBlocks)) {
    console.log(line);
  }
  console.log('');
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const disassembly = disassembleRange(romBytes, DISASM_START, DISASM_END);
  const gate = analyzeBit0Gate(disassembly);
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
        romModule.default?.PRELIFTED_BLOCKS ??
        romModule.default ??
        romModule,
    );

    console.log('Phase 240: D003E0 bit 0 gate in 0x04EDD0');
    console.log('');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Dynamic entry: PC=${hex(ENTRY_PC)} A=${hexByte(ENTRY_A)} IX=${hex(IX_HOME)} IY=${hex(IY_HOME)} SP=${hex(STACK_TOP)}`);
    console.log(`Step budget per run: ${STEP_LIMIT}`);
    console.log('');

    printDisassembly(disassembly);
    printGateAnalysis(gate);

    const mem = createMemoryBus(romBytes);
    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;
    const bootSummary = coldBoot(executor, cpu, mem);
    const bootedMem = new Uint8Array(mem);

    console.log('========================================================================');
    console.log('COLD BOOT');
    console.log('========================================================================');
    console.log(`  boot:       steps=${bootSummary.boot.steps} term=${bootSummary.boot.termination} lastPc=${hex(bootSummary.boot.lastPc)}`);
    console.log(`  kernelInit: steps=${bootSummary.kernelInit.steps} term=${bootSummary.kernelInit.termination} lastPc=${hex(bootSummary.kernelInit.lastPc)}`);
    console.log(`  postInit:   steps=${bootSummary.postInit.steps} term=${bootSummary.postInit.termination} lastPc=${hex(bootSummary.postInit.lastPc)}`);
    console.log('');

    const clearTrace = runHandlerTrace(blocks, bootedMem, 'TRACE A: BIT 0 CLEAR', 0x00);
    const setTrace = runHandlerTrace(blocks, bootedMem, 'TRACE B: BIT 0 SET', 0x01);
    const comparison = compareTraces(clearTrace, setTrace);

    printTrace(clearTrace);
    printTrace(setTrace);
    printComparison(comparison);

    console.log('========================================================================');
    console.log('REPORT');
    console.log('========================================================================');
    console.log(`  Exact BIT 0 decode: ${gate.exactFinding}`);
    console.log(`  Clear path:         ${branchSummary(clearTrace)}`);
    console.log(`  Set path:           ${branchSummary(setTrace)}`);
    console.log(`  Functional gate:    BIT 0 chooses between ${hex(BIT0_CLEAR_CALL_TARGET)} (alternate computation / normal home-screen path) and ${hex(BIT0_SET_CALL_TARGET)} (display-update path).`);
    console.log(`  New set-path blocks: ${comparison.setOnlyBlocks.length ? comparison.setOnlyBlocks.map((pc) => hex(pc)).join(', ') : '(none)'}`);
    console.log('');
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});

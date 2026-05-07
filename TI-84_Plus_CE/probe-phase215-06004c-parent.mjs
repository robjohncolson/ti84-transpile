#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILLED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const TARGET_PC = 0x06004c;
const DISPATCHER_PC = 0x061290;
const SET4_PC = 0x0612b0;

const RANGE_START = 0x05ff00;
const RANGE_END = 0x060060;
const LOCAL_DISASM_END = 0x060070;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xd1a87e;
const MBASE = 0xd0;
const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;

const IY_PLUS_5_ADDR = IY_ADDR + 0x05;
const IY_PLUS_18_ADDR = IY_ADDR + 0x18;

const TRACE_A = 0x03;
const TRACE_MAX_STEPS = 500;
const TRACE_RET_SENTINEL = 0x7ffffe;
const MEM_INIT_RET = 0x7ffff6;

const BOOT_ENTRY = 0x000000;
const LEGACY_KERNEL_INIT_ENTRY = 0x000230;
const REPO_KERNEL_INIT_ENTRY = 0x08c331;
const REPO_POST_INIT_ENTRY = 0x0802b2;
const LEGACY_MEM_INIT_ENTRY = 0x08479c;
const REPO_MEM_INIT_ENTRY = 0x09dee0;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 2000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 15000;
const MAX_LOOP_ITERATIONS = 8192;

const DIRECT24 = new Map([
  [0xcd, 'call'],
  [0xc4, 'call nz'],
  [0xcc, 'call z'],
  [0xd4, 'call nc'],
  [0xdc, 'call c'],
  [0xe4, 'call po'],
  [0xec, 'call pe'],
  [0xf4, 'call p'],
  [0xfc, 'call m'],
  [0xc3, 'jp'],
  [0xc2, 'jp nz'],
  [0xca, 'jp z'],
  [0xd2, 'jp nc'],
  [0xda, 'jp c'],
  [0xe2, 'jp po'],
  [0xea, 'jp pe'],
  [0xf2, 'jp p'],
  [0xfa, 'jp m'],
]);

const INTERESTING_LOCAL_OPS = new Set([
  0x18,
  0x20,
  0x28,
  0x30,
  0x38,
  0xc0,
  0xc2,
  0xc3,
  0xc4,
  0xc8,
  0xc9,
  0xca,
  0xcc,
  0xd0,
  0xd2,
  0xd4,
  0xd8,
  0xda,
  0xdc,
  0xe0,
  0xe2,
  0xe4,
  0xe8,
  0xea,
  0xec,
  0xf0,
  0xf2,
  0xf4,
  0xf8,
  0xfa,
  0xfc,
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xff, 2);
}

function blockKey(addr, mode = 'adl') {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
}

function bytesFor(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function clampRange(start, end, limit) {
  return {
    start: Math.max(0, Math.min(limit, start)),
    end: Math.max(0, Math.min(limit, end)),
  };
}

function shouldFallbackToImport(error) {
  if (!error) return false;
  const message = String(error.message ?? error);
  return (
    error.code === 'ERR_REQUIRE_ESM' ||
    error.code === 'ERR_REQUIRE_ASYNC_MODULE' ||
    error.name === 'SyntaxError' ||
    /Cannot use import statement/i.test(message) ||
    /Unexpected token 'export'/i.test(message) ||
    /Must use import to load ES Module/i.test(message)
  );
}

async function loadLocalModule(relativePath) {
  const absolutePath = path.join(__dirname, relativePath);
  try {
    return require(absolutePath);
  } catch (error) {
    if (!shouldFallbackToImport(error)) {
      throw error;
    }
    return import(pathToFileURL(absolutePath).href);
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

const rom = fs.readFileSync(ROM_PATH);
const { decodeInstruction } = await loadLocalModule('./ez80-decoder.js');
const { createExecutor } = await loadLocalModule('./cpu-runtime.js');
const { createPeripheralBus } = await loadLocalModule('./peripherals.js');
const romModule = await loadLocalModule('./ROM.transpiled.js');
const BLOCKS = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? {},
);

function hasBlock(addr, mode = 'adl') {
  return Boolean(BLOCKS[blockKey(addr, mode)]);
}

function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xff) << 16) | (inst.addr & 0xffff)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(resolveMemAddr(inst))}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(resolveMemAddr(inst))}), ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'nop':
      return `${prefix}NOP`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'halt':
      return `${prefix}HALT`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc: pc & 0xffffff,
      length: 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
    };
  }
}

function decodeRange(startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xffffff;
  const stop = endPc & 0xffffff;

  while (pc < stop) {
    const inst = decodeSafe(pc);
    rows.push({
      pc: inst.pc >>> 0,
      pcHex: hex(inst.pc),
      bytes: bytesFor(rom, inst.pc, inst.length ?? 1),
      text: inst.tag === 'decode-error' ? `decode-error: ${inst.errorMessage}` : formatInstruction(inst),
      tag: inst.tag,
      length: Math.max(1, inst.length ?? 1),
      target: Number.isInteger(inst.target) ? (inst.target >>> 0) : null,
    });
    pc = (pc + Math.max(1, inst.length ?? 1)) & 0xffffff;
  }

  return rows;
}

function isHardBoundary(inst) {
  return Boolean(inst) && [
    'ret',
    'reti',
    'retn',
    'jp',
    'jr',
    'jp-indirect',
    'halt',
    'slp',
  ].includes(inst.tag);
}

function reachesTargetLinearly(startPc, targetPc, maxBytes = 0x100) {
  if (startPc === targetPc) {
    return { reaches: true, instructionCount: 0, stopPc: startPc };
  }

  const limit = Math.min(rom.length, startPc + maxBytes);
  let pc = startPc;
  let count = 0;

  while (pc < targetPc && pc < limit) {
    const inst = decodeSafe(pc);
    if (inst.tag === 'decode-error') {
      return { reaches: false, instructionCount: count, stopPc: pc };
    }
    if (isHardBoundary(inst)) {
      return { reaches: false, instructionCount: count + 1, stopPc: pc };
    }
    pc += Math.max(1, inst.length ?? 1);
    count += 1;
  }

  return {
    reaches: pc === targetPc,
    instructionCount: count,
    stopPc: pc,
  };
}

function collectBoundaryCandidates(targetPc, lookback = 0x80) {
  const floor = Math.max(0, targetPc - lookback);
  const candidates = [];

  for (let addr = floor; addr < targetPc; addr += 1) {
    const inst = decodeSafe(addr);
    const length = Math.max(1, inst.length ?? 1);
    const candidateEntry = (addr + length) & 0xffffff;
    if (!isHardBoundary(inst) || candidateEntry > targetPc) {
      continue;
    }

    const linear = reachesTargetLinearly(candidateEntry, targetPc);
    if (!linear.reaches) {
      continue;
    }

    let score = 100;
    if (hasBlock(candidateEntry, 'adl')) score += 20;
    if (candidateEntry === targetPc) score -= 50;

    candidates.push({
      entry: candidateEntry,
      boundaryPc: addr,
      boundaryText: formatInstruction(inst),
      score,
      instructionCount: linear.instructionCount,
    });
  }

  candidates.sort((left, right) =>
    right.score - left.score ||
    left.entry - right.entry ||
    left.boundaryPc - right.boundaryPc,
  );

  return candidates;
}

function findLikelyFunctionEntry(targetPc) {
  const candidates = collectBoundaryCandidates(targetPc);
  if (candidates.length === 0) {
    return {
      entry: targetPc,
      boundaryPc: null,
      boundaryText: null,
      candidates,
    };
  }

  const best = candidates[0];
  return {
    entry: best.entry,
    boundaryPc: best.boundaryPc,
    boundaryText: best.boundaryText,
    candidates,
  };
}

function findBlocksReferencingPc(pc) {
  const hits = [];
  for (const block of Object.values(BLOCKS)) {
    if (!Array.isArray(block?.instructions)) continue;
    if (!block.instructions.some((inst) => inst.pc === pc)) continue;
    hits.push(block);
  }
  hits.sort((left, right) => left.startPc - right.startPc);
  return hits;
}

function chooseContainingBlock(pc) {
  const blocks = findBlocksReferencingPc(pc);
  return blocks.find((block) => block.startPc < pc) ?? null;
}

function summarizeBlock(block) {
  if (!block?.instructions?.length) {
    return '(no lifted instructions)';
  }
  const text = block.instructions.map((instruction) => instruction.dasm).join(' ; ');
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function scanInterestingLocalRegion(startPc, endPc) {
  const rows = [];

  for (let addr = startPc; addr <= endPc; addr += 1) {
    if (!INTERESTING_LOCAL_OPS.has(rom[addr])) continue;
    const inst = decodeSafe(addr);
    if (inst.tag === 'decode-error') continue;
    if (![
      'call',
      'call-conditional',
      'jp',
      'jp-conditional',
      'jr',
      'jr-conditional',
      'ret',
      'ret-conditional',
      'reti',
      'retn',
    ].includes(inst.tag)) {
      continue;
    }
    rows.push({
      addr,
      bytes: bytesFor(rom, addr, Math.max(1, inst.length ?? 1)),
      text: formatInstruction(inst),
      tag: inst.tag,
      target: Number.isInteger(inst.target) ? inst.target >>> 0 : null,
    });
  }

  const deduped = new Map();
  for (const row of rows) deduped.set(row.addr, row);
  return [...deduped.values()].sort((left, right) => left.addr - right.addr);
}

function scanDirectTransfersIntoRange(startPc, endPc) {
  const hits = [];

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const label = DIRECT24.get(rom[addr]);
    if (!label) continue;
    const target = (rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16)) >>> 0;
    if (target < startPc || target > endPc) continue;

    const inst = decodeSafe(addr);
    hits.push({
      from: addr,
      target,
      text: inst.tag === 'decode-error' ? label : formatInstruction(inst),
      bytes: bytesFor(rom, addr, 4),
    });
  }

  return hits.sort((left, right) => left.from - right.from);
}

function createMemory() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(MEM_SIZE, rom.length)));
  return mem;
}

function createCPU(mem, peripherals) {
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function resetOsState(cpu, mem, stackTop = STACK_TOP) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = stackTop;
  const bounds = clampRange(stackTop - 0x80, stackTop + 0x40, mem.length);
  mem.fill(0xff, bounds.start, bounds.end);
}

function detectBootPlan() {
  const notes = [];
  const boot = hasBlock(BOOT_ENTRY, 'z80')
    ? {
        addr: BOOT_ENTRY,
        mode: 'z80',
        maxSteps: BOOT_MAX_STEPS,
        maxLoopIterations: 32,
        label: 'cold-boot',
      }
    : null;

  let kernelInit = null;
  if (hasBlock(LEGACY_KERNEL_INIT_ENTRY, 'adl')) {
    kernelInit = {
      addr: LEGACY_KERNEL_INIT_ENTRY,
      mode: 'adl',
      maxSteps: KERNEL_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      label: 'kernelInit-legacy',
    };
  } else if (hasBlock(REPO_KERNEL_INIT_ENTRY, 'adl')) {
    kernelInit = {
      addr: REPO_KERNEL_INIT_ENTRY,
      mode: 'adl',
      maxSteps: KERNEL_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      label: 'kernelInit-repo',
    };
    notes.push(
      `${hex(LEGACY_KERNEL_INIT_ENTRY)} is not lifted here; using repo OS-init entry ${hex(REPO_KERNEL_INIT_ENTRY)}.`,
    );
  }

  const postInit = hasBlock(REPO_POST_INIT_ENTRY, 'adl')
    ? {
        addr: REPO_POST_INIT_ENTRY,
        mode: 'adl',
        maxSteps: POST_INIT_MAX_STEPS,
        maxLoopIterations: 32,
        label: 'postInit-repo',
      }
    : null;

  let memInit = null;
  if (hasBlock(LEGACY_MEM_INIT_ENTRY, 'adl')) {
    memInit = {
      addr: LEGACY_MEM_INIT_ENTRY,
      mode: 'adl',
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      label: 'memInit-legacy',
    };
  } else if (hasBlock(REPO_MEM_INIT_ENTRY, 'adl')) {
    memInit = {
      addr: REPO_MEM_INIT_ENTRY,
      mode: 'adl',
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      label: 'memInit-repo',
    };
    notes.push(
      `${hex(LEGACY_MEM_INIT_ENTRY)} is not lifted here; using repo mem-init entry ${hex(REPO_MEM_INIT_ENTRY)}.`,
    );
  }

  if (postInit && kernelInit?.addr === REPO_KERNEL_INIT_ENTRY) {
    notes.push(`Keeping repo post-init stage ${hex(REPO_POST_INIT_ENTRY)} between OS init and memInit.`);
  }

  return { boot, kernelInit, postInit, memInit, notes };
}

function runStage(executor, stage) {
  if (!stage) return null;
  return executor.runFrom(stage.addr, stage.mode, {
    maxSteps: stage.maxSteps,
    maxLoopIterations: stage.maxLoopIterations,
  });
}

function coldBoot(executor, cpu, mem, plan) {
  const results = {};

  if (plan.boot) {
    results.boot = runStage(executor, plan.boot);
  }

  if (plan.kernelInit) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_TOP - 3;
    mem.fill(0xff, cpu.sp, cpu.sp + 3);
    results.kernelInit = runStage(executor, plan.kernelInit);
  }

  if (plan.postInit) {
    cpu.mbase = MBASE;
    cpu.iy = IY_ADDR;
    cpu.hl = 0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_TOP - 3;
    mem.fill(0xff, cpu.sp, cpu.sp + 3);
    results.postInit = runStage(executor, plan.postInit);
  }

  return results;
}

function runMemInit(executor, cpu, mem, stage) {
  if (!stage) {
    return { returned: false, skipped: true };
  }

  resetOsState(cpu, mem, STACK_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(stage.addr, stage.mode, {
      maxSteps: stage.maxSteps,
      maxLoopIterations: stage.maxLoopIterations,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return { returned, skipped: false, result };
}

function buildBaseline(plan) {
  const mem = createMemory();
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);

  cpu.mbase = MBASE;
  const bootResults = coldBoot(executor, cpu, mem, plan);
  const memInit = runMemInit(executor, cpu, mem, plan.memInit);

  return {
    memSnapshot: new Uint8Array(mem),
    bootResults,
    memInit,
  };
}

function chooseTraceStart(targetPc, functionEntry, containingBlock) {
  if (containingBlock?.startPc && containingBlock.startPc < targetPc) {
    return {
      addr: containingBlock.startPc,
      reason:
        `${hex(targetPc)} sits mid-block inside lifted block ${hex(containingBlock.startPc)}; ` +
        `starting there preserves A=${hexByte(TRACE_A)} while running the prerequisite BIT gate before ${hex(targetPc)}.`,
    };
  }

  if (functionEntry !== targetPc) {
    return {
      addr: functionEntry,
      reason: `Using inferred function entry ${hex(functionEntry)}.`,
    };
  }

  return {
    addr: targetPc,
    reason: 'No broader entry was found; starting exactly at the target.',
  };
}

function formatTraceMeta(meta) {
  if (!meta?.instructions?.length) return '(missing lifted metadata)';
  return summarizeBlock(meta);
}

function finalRegisterState(cpu, lastPc, lastMode) {
  return {
    pc: hex(lastPc),
    mode: lastMode,
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    sp: hex(cpu.sp),
    mbase: hexByte(cpu.mbase),
  };
}

function locateBit4Transition(traceEvents, finalValue) {
  const after = traceEvents.map((event) => event.iyPlus5BeforeValue);
  after.push(finalValue & 0xff);

  for (let index = 0; index < traceEvents.length; index += 1) {
    const before = after[index] & 0xff;
    const next = after[index + 1] & 0xff;
    if ((before & 0x10) === 0 && (next & 0x10) !== 0) {
      return {
        writtenByStep: traceEvents[index].step,
        writtenByPc: traceEvents[index].pc,
        observedOnNextStep: traceEvents[index + 1]?.step ?? null,
        observedOnNextPc: traceEvents[index + 1]?.pc ?? null,
      };
    }
  }

  return null;
}

function traceFromBaseline(baseline, traceStartAddr) {
  const mem = new Uint8Array(baseline.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);

  resetOsState(cpu, mem, STACK_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET_SENTINEL);
  cpu.a = TRACE_A;
  mem[IY_PLUS_5_ADDR] &= ~0x10;
  mem[IY_PLUS_18_ADDR] |= 0x80;

  const traceEvents = [];
  const uniqueBlocks = new Set();
  let dispatcherStep = null;
  let set4BlockStep = null;
  let execution = null;
  let termination = 'max_steps';

  function pushEvent(kind, pc, mode, meta, step) {
    const summary = kind === 'block' ? formatTraceMeta(meta) : '(missing block)';
    const value = mem[IY_PLUS_5_ADDR] & 0xff;
    const event = {
      step: step + 1,
      kind,
      pc: hex(pc),
      mode,
      summary,
      iyPlus5Before: hexByte(value),
      iyPlus5BeforeValue: value,
    };
    traceEvents.push(event);
    uniqueBlocks.add(`${hex(pc)}:${mode}`);
    if ((pc & 0xffffff) === DISPATCHER_PC && dispatcherStep === null) dispatcherStep = step + 1;
    if ((pc & 0xffffff) === SET4_PC && set4BlockStep === null) set4BlockStep = step + 1;
  }

  try {
    execution = executor.runFrom(traceStartAddr, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        pushEvent('block', pc, mode, meta, step);
      },
      onMissingBlock(pc, mode, step) {
        if ((pc & 0xffffff) === TRACE_RET_SENTINEL) {
          throw new Error('__TRACE_RET__');
        }
        pushEvent('missing', pc, mode, null, step);
      },
    });
    termination = execution.termination ?? termination;
  } catch (error) {
    if (error?.message === '__TRACE_RET__') {
      termination = 'returned_to_sentinel';
    } else {
      throw error;
    }
  }

  const lastPc = execution?.lastPc ?? TRACE_RET_SENTINEL;
  const lastMode = execution?.lastMode ?? 'adl';
  const finalIYPlus5 = mem[IY_PLUS_5_ADDR] & 0xff;

  return {
    traceStartAddr,
    termination,
    executionSteps: execution?.steps ?? traceEvents.length,
    uniqueBlockCount: uniqueBlocks.size,
    dispatcherStep,
    set4BlockStep,
    bit4Transition: locateBit4Transition(traceEvents, finalIYPlus5),
    finalIYPlus5: hexByte(finalIYPlus5),
    finalIYPlus5Value: finalIYPlus5,
    finalRegisters: finalRegisterState(cpu, lastPc, lastMode),
    traceEvents,
  };
}

function printInstructionTable(title, rows) {
  console.log(title);
  if (!rows.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const row of rows) {
    const targetText = row.target === null ? '' : ` -> ${hex(row.target)}`;
    console.log(`  ${hex(row.addr ?? row.pc)}  ${row.bytes.padEnd(14)}  ${row.text}${targetText}`);
  }
  console.log();
}

function printDisassembly(rows) {
  console.log('Containing linear disassembly:');
  for (const row of rows) {
    console.log(`  ${row.pcHex}  ${row.bytes.padEnd(14)}  ${row.text}`);
  }
  console.log();
}

function printTrace(trace) {
  console.log('Full block trace:');
  for (const event of trace.traceEvents) {
    console.log(
      `  [${String(event.step).padStart(3, '0')}] ${event.kind.padEnd(7)} ${event.pc}:${event.mode}  ` +
      `IY+5=${event.iyPlus5Before}  ${event.summary}`,
    );
  }
  console.log();
}

function main() {
  const functionEntry = findLikelyFunctionEntry(TARGET_PC);
  const exactBlock = BLOCKS[blockKey(TARGET_PC, 'adl')] ?? null;
  const containingBlock = chooseContainingBlock(TARGET_PC);
  const traceStart = chooseTraceStart(TARGET_PC, functionEntry.entry, containingBlock);

  const disasmRows = decodeRange(functionEntry.entry, LOCAL_DISASM_END);
  const localRegionHits = scanInterestingLocalRegion(RANGE_START, RANGE_END);
  const inboundTransfers = scanDirectTransfersIntoRange(RANGE_START, RANGE_END);

  const bootPlan = detectBootPlan();
  const baseline = buildBaseline(bootPlan);
  const trace = traceFromBaseline(baseline, traceStart.addr);

  console.log('=== Phase 215: 0x06004C parent + extended dispatcher trace ===');
  console.log();
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled blocks: ${TRANSPILLED_PATH}`);
  console.log(`Target branch site: ${hex(TARGET_PC)}`);
  console.log(`Dispatcher: ${hex(DISPATCHER_PC)}`);
  console.log(`SET 4 site: ${hex(SET4_PC)}`);
  console.log();

  console.log('=== Part A: Parent function boundary ===');
  console.log();
  console.log(`Likely function entry: ${hex(functionEntry.entry)}`);
  console.log(
    functionEntry.boundaryPc === null
      ? 'Boundary heuristic: none'
      : `Boundary heuristic: ${functionEntry.boundaryText} at ${hex(functionEntry.boundaryPc)}`,
  );
  console.log(`Exact lifted block at target: ${exactBlock ? hex(exactBlock.startPc) : 'none'}`);
  console.log(`Containing lifted block: ${containingBlock ? hex(containingBlock.startPc) : 'none'}`);
  if (containingBlock) {
    console.log(`Containing lifted block summary: ${summarizeBlock(containingBlock)}`);
  }
  if (functionEntry.candidates.length > 1) {
    console.log('Other boundary candidates:');
    for (const candidate of functionEntry.candidates.slice(1, 6)) {
      console.log(
        `  ${hex(candidate.entry)} via ${candidate.boundaryText} at ${hex(candidate.boundaryPc)} ` +
        `(linear instructions=${candidate.instructionCount})`,
      );
    }
    console.log();
  } else {
    console.log();
  }

  printDisassembly(disasmRows);
  printInstructionTable(
    `Local RET/CALL/JP/JR scan in ${hex(RANGE_START)}-${hex(RANGE_END)}:`,
    localRegionHits.map((row) => ({ ...row, pc: row.addr })),
  );
  printInstructionTable(
    `Inbound direct CALL/JP transfers into ${hex(RANGE_START)}-${hex(RANGE_END)}:`,
    inboundTransfers.map((row) => ({ ...row, addr: row.from, pc: row.from })),
  );

  console.log('=== Part B: Extended 500-step trace ===');
  console.log();
  console.log(`Trace start: ${hex(traceStart.addr)}`);
  console.log(`Trace start reason: ${traceStart.reason}`);
  console.log(`Seeded A: ${hexByte(TRACE_A)}`);
  console.log(`Seeded (IY+0x18): ${hexByte(baseline.memSnapshot[IY_PLUS_18_ADDR] | 0x80)} at ${hex(IY_PLUS_18_ADDR)}`);
  console.log(`Cleared BIT 4 at (IY+5) before trace: ${hex(IY_PLUS_5_ADDR)}`);
  console.log();

  if (bootPlan.notes.length > 0) {
    console.log('Boot harness notes:');
    for (const note of bootPlan.notes) {
      console.log(`  - ${note}`);
    }
    console.log();
  }

  console.log('Boot / init results:');
  if (baseline.bootResults.boot) {
    console.log(
      `  boot      steps=${baseline.bootResults.boot.steps} term=${baseline.bootResults.boot.termination} ` +
      `lastPc=${hex(baseline.bootResults.boot.lastPc)}`,
    );
  }
  if (baseline.bootResults.kernelInit) {
    console.log(
      `  kernelInit steps=${baseline.bootResults.kernelInit.steps} term=${baseline.bootResults.kernelInit.termination} ` +
      `lastPc=${hex(baseline.bootResults.kernelInit.lastPc)}`,
    );
  }
  if (baseline.bootResults.postInit) {
    console.log(
      `  postInit  steps=${baseline.bootResults.postInit.steps} term=${baseline.bootResults.postInit.termination} ` +
      `lastPc=${hex(baseline.bootResults.postInit.lastPc)}`,
    );
  }
  console.log(
    `  memInit   returned=${baseline.memInit.returned} skipped=${baseline.memInit.skipped === true} ` +
    `entry=${bootPlan.memInit ? hex(bootPlan.memInit.addr) : 'n/a'}`,
  );
  console.log();

  console.log(`Trace termination: ${trace.termination}`);
  console.log(`Trace steps executed: ${trace.executionSteps}`);
  console.log(`Unique blocks visited: ${trace.uniqueBlockCount}`);
  console.log(`Reached dispatcher: ${trace.dispatcherStep === null ? 'no' : `yes at step ${trace.dispatcherStep}`}`);
  console.log(`Reached SET 4 block: ${trace.set4BlockStep === null ? 'no' : `yes at step ${trace.set4BlockStep}`}`);
  console.log(
    trace.bit4Transition
      ? `BIT 4 at (IY+5) first became set after step ${trace.bit4Transition.writtenByStep} ` +
        `(block ${trace.bit4Transition.writtenByPc}).`
      : 'BIT 4 at (IY+5) never transitioned from clear to set within the 500-step trace.',
  );
  console.log(`Final (IY+5): ${trace.finalIYPlus5}`);
  console.log(`Final registers: ${JSON.stringify(trace.finalRegisters)}`);
  console.log();

  printTrace(trace);

  const summary = {
    probe: 'probe-phase215-06004c-parent.mjs',
    targetPc: hex(TARGET_PC),
    functionEntry: hex(functionEntry.entry),
    boundaryPc: hex(functionEntry.boundaryPc),
    boundaryText: functionEntry.boundaryText,
    exactLiftedBlock: exactBlock ? hex(exactBlock.startPc) : null,
    containingLiftedBlock: containingBlock ? hex(containingBlock.startPc) : null,
    traceStart: hex(traceStart.addr),
    traceStartReason: traceStart.reason,
    bootPlan: {
      boot: bootPlan.boot ? hex(bootPlan.boot.addr) : null,
      kernelInit: bootPlan.kernelInit ? hex(bootPlan.kernelInit.addr) : null,
      postInit: bootPlan.postInit ? hex(bootPlan.postInit.addr) : null,
      memInit: bootPlan.memInit ? hex(bootPlan.memInit.addr) : null,
      notes: bootPlan.notes,
    },
    memInitReturned: baseline.memInit.returned,
    localInterestingCount: localRegionHits.length,
    inboundTransferCount: inboundTransfers.length,
    trace: {
      termination: trace.termination,
      executionSteps: trace.executionSteps,
      uniqueBlockCount: trace.uniqueBlockCount,
      dispatcherStep: trace.dispatcherStep,
      set4BlockStep: trace.set4BlockStep,
      bit4Transition: trace.bit4Transition,
      finalIYPlus5: trace.finalIYPlus5,
      finalRegisters: trace.finalRegisters,
    },
  };

  console.log('=== Summary JSON ===');
  console.log();
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    probe: 'probe-phase215-06004c-parent.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}

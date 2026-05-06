#!/usr/bin/env node
/**
 * probe-phase200-stat-09201e-disasm.mjs
 *
 * Disassemble the three blocks that write to 0xD008E6 and trace the live
 * 0x09201E write from the STAT handler with seeded L1 data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const SHORT_MBASE = 0xD0;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const ENTRY_ADDR = 0x058BA9;
const BLOCK_09201E = 0x09201E;
const BLOCK_0921AD = 0x0921AD;
const BLOCK_092FCB = 0x092FCB;

const WATCH_ADDR = 0xD008E6;
const STRUCT_CURSOR_ADDR = 0xD008F0;
const ROM_TEMPLATE_ADDR = 0x0921A1;
const ROM_TEMPLATE_LEN = 12;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE200_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAT_TRACE_MAX_STEPS = 5000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const LIST_DATA_ADDR = 0xD10000;
const VAT_ENTRY_ADDR = 0xD1A800;
const LIST_PTR_TABLE_ADDR = 0xD01508;
const LIST_COUNT_ADDR = 0xD0150B;
const ACTIVE_LIST_ADDR = 0xD0150C;
const CURR_LIST_HIGHLIGHT_ADDR = 0xD0244B;
const LIST_NAME1_ADDR = 0xD02459;
const LIST_NAME_STRIDE = 5;
const LIST_NAME_SLOTS = 20;
const STATFLAGS_ADDR = 0xD00089;
const STATFLAGS2_ADDR = 0xD0009A;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMPCNT_ADDR = 0xD02596;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const NEWDATA_PTR_ADDR = 0xD025A0;

const LIST_VALUES = [1, 2, 3];
const LIST_ELEMENT_BYTES = makeListElements(LIST_VALUES);
const VAT_ENTRY_BYTES = Uint8Array.from([
  0x01,
  LIST_DATA_ADDR & 0xFF,
  (LIST_DATA_ADDR >>> 8) & 0xFF,
  (LIST_DATA_ADDR >>> 16) & 0xFF,
  0x00,
  0x00,
  0x01,
  0x00,
]);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function read16Raw(mem, addr) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  return mem[a & mask] | (mem[(a + 1) & mask] << 8);
}

function read24Raw(mem, addr) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  return mem[a & mask] | (mem[(a + 1) & mask] << 8) | (mem[(a + 2) & mask] << 16);
}

function write16Raw(mem, addr, value) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  mem[a & mask] = value & 0xFF;
  mem[(a + 1) & mask] = (value >>> 8) & 0xFF;
}

function write24Raw(mem, addr, value) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  mem[a & mask] = value & 0xFF;
  mem[(a + 1) & mask] = (value >>> 8) & 0xFF;
  mem[(a + 2) & mask] = (value >>> 16) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    mem[(a + index) & mask] = bytes[index] & 0xFF;
  }
}

function hexSlice(buffer, addr, len) {
  const parts = [];
  for (let index = 0; index < len; index += 1) {
    parts.push((buffer[addr + index] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function decodeWordsLE(buffer, addr, len) {
  const words = [];
  for (let offset = 0; offset < len; offset += 2) {
    words.push(hex((buffer[addr + offset] & 0xFF) | ((buffer[addr + offset + 1] & 0xFF) << 8), 4));
  }
  return words;
}

function mapInstruction(inst) {
  return {
    pc: hex(inst.pc),
    bytes: inst.bytes,
    dasm: inst.dasm,
    tag: inst.tag,
  };
}

function describeBlock(pc) {
  const block = BLOCKS[blockKey(pc)];
  if (!block) {
    return { block: hex(pc), present: false };
  }
  return {
    block: hex(pc),
    id: block.id,
    instructionCount: block.instructionCount,
    instructions: block.instructions.map(mapInstruction),
  };
}

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
      maxLoopIterations,
    });
    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;
    if (result.termination !== 'max_steps') break;
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function runTraceSegmented(executor, entry, mode, options = {}) {
  const sentinels = options.sentinels ?? new Map();
  const totalMaxSteps = options.totalMaxSteps ?? STAT_TRACE_MAX_STEPS;
  const maxLoopIterations = options.maxLoopIterations ?? OS_MAX_LOOP_ITERATIONS;
  const onBlock = options.onBlock ?? null;

  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hitSentinel = null;

  while (totalSteps < totalMaxSteps && !hitSentinel) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    let segmentObservedSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc, dispatchMode, meta, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          const globalStep = totalSteps + localStep;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onBlock) {
            onBlock({
              pc: norm,
              mode: dispatchMode ?? lastMode,
              meta,
              step: globalStep,
            });
          }
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
      });

      totalSteps += result.steps ?? segmentObservedSteps;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') break;
    } catch (error) {
      totalSteps += segmentObservedSteps;
      if (error?.message === TRACE_STOP) {
        hitSentinel = {
          name: error.stopName,
          pc: hex(error.stopPc),
        };
        termination = 'sentinel';
        break;
      }
      throw error;
    }
  }

  if (!hitSentinel && termination === 'max_steps' && totalSteps >= totalMaxSteps) {
    termination = 'step_limit';
  }

  return {
    steps: totalSteps,
    lastPc,
    lastMode,
    termination,
    hitSentinel,
  };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function resetCpuForStatEntry(cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;
  cpu.sp -= 3;
  write24Raw(mem, cpu.sp, RETURN_SENTINEL);
}

function bootRuntime(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: boot.steps, lastPc: hex(boot.lastPc), termination: boot.termination },
    kernelInit: { steps: kernelInit.steps, lastPc: hex(kernelInit.lastPc), termination: kernelInit.termination },
    postInit: { steps: postInit.steps, lastPc: hex(postInit.lastPc), termination: postInit.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24Raw(mem, cpu.sp, MEM_INIT_RET);
  mem[0xD008DF] = 0x00;
  return runTraceSegmented(executor, MEM_INIT_ENTRY, 'adl', {
    totalMaxSteps: MEM_INIT_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([[MEM_INIT_RET, 'mem_init_return']]),
  });
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function makeListElements(values) {
  return values.map((value) => Uint8Array.from([
    0x00,
    0x80,
    ((Number(value) & 0x0F) << 4) & 0xF0,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]));
}

function seedStatLists(mem) {
  const listDataLen = 2 + (LIST_ELEMENT_BYTES.length * 9);
  const listDataEnd = LIST_DATA_ADDR + listDataLen;

  mem.fill(0x00, LIST_DATA_ADDR, LIST_DATA_ADDR + 0x200);
  mem.fill(0x00, VAT_ENTRY_ADDR, VAT_ENTRY_ADDR + 0x20);
  write16Raw(mem, LIST_DATA_ADDR, LIST_ELEMENT_BYTES.length);
  for (let index = 0; index < LIST_ELEMENT_BYTES.length; index += 1) {
    writeBytes(mem, LIST_DATA_ADDR + 2 + (index * 9), LIST_ELEMENT_BYTES[index]);
  }

  writeBytes(mem, VAT_ENTRY_ADDR, VAT_ENTRY_BYTES);
  write24Raw(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, OPS_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24Raw(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length);
  write24Raw(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, NEWDATA_PTR_ADDR, listDataEnd);

  write24Raw(mem, LIST_PTR_TABLE_ADDR, LIST_DATA_ADDR);
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;

  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;
  mem.fill(0x00, LIST_NAME1_ADDR, LIST_NAME1_ADDR + (LIST_NAME_SLOTS * LIST_NAME_STRIDE));
  writeBytes(mem, LIST_NAME1_ADDR, Uint8Array.from([0xDC, 0x00, 0x00, 0x00, 0x00]));

  return {
    values: LIST_VALUES,
    listDataAddr: hex(LIST_DATA_ADDR),
    listDataBytes: hexSlice(mem, LIST_DATA_ADDR, listDataLen),
    vatEntryAddr: hex(VAT_ENTRY_ADDR),
    vatEntryBytes: hexSlice(mem, VAT_ENTRY_ADDR, VAT_ENTRY_BYTES.length),
  };
}

function snapshotCpu(cpu, mem) {
  return {
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    sp: hex(cpu.sp),
    stack: {
      sp0: hex(read24Raw(mem, cpu.sp)),
      sp3: hex(read24Raw(mem, cpu.sp + 3)),
      sp6: hex(read24Raw(mem, cpu.sp + 6)),
    },
    scratch: {
      d008e6: hex(read16Raw(mem, WATCH_ADDR), 4),
      d008f0: hex(read16Raw(mem, STRUCT_CURSOR_ADDR), 4),
      d008e6_to_d008f1: hexSlice(mem, WATCH_ADDR, 12),
    },
  };
}

function collectStaticDisassembly() {
  const templateWord = read16Raw(romBytes, ROM_TEMPLATE_ADDR) & 0xFFFF;
  return {
    block09201E: {
      ...describeBlock(BLOCK_09201E),
      note: 'Writes D008E6 via `ld (0x0008e6), hl`; the stored word comes from HL after pointer arithmetic, not from an immediate literal load.',
    },
    block0921AD: {
      ...describeBlock(BLOCK_0921AD),
      templateCopy: {
        sourceAddr: hex(ROM_TEMPLATE_ADDR),
        byteLength: ROM_TEMPLATE_LEN,
        bytes: hexSlice(romBytes, ROM_TEMPLATE_ADDR, ROM_TEMPLATE_LEN),
        wordsLE: decodeWordsLE(romBytes, ROM_TEMPLATE_ADDR, ROM_TEMPLATE_LEN),
        initialWordAtD008E6: hex(templateWord, 4),
      },
      note: 'Initializes D008E6..D008F1 by copying a 12-byte ROM template. The first template word is 0x000B, which explains the earlier 0x0B write.',
    },
    block092FCB: {
      ...describeBlock(BLOCK_092FCB),
      note: 'Does not synthesize 0x0017. It copies two bytes from caller-selected HL into D008E6, then reloads that word into BC for the following LDIR.',
    },
  };
}

function trace09201E() {
  const runtime = createRuntime();
  const boot = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  const seed = seedStatLists(runtime.mem);
  resetCpuForStatEntry(runtime.cpu, runtime.mem);

  let entryState = null;
  const preTrace = runTraceSegmented(runtime.executor, ENTRY_ADDR, 'adl', {
    totalMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [BLOCK_09201E, 'enter_09201e'],
      [RETURN_SENTINEL, 'return_hit'],
    ]),
    onBlock(event) {
      if (event.pc === BLOCK_09201E && !entryState) {
        entryState = {
          step: event.step,
          ...snapshotCpu(runtime.cpu, runtime.mem),
        };
      }
    },
  });

  const writeEvents = [];
  const origWrite16 = runtime.cpu.write16.bind(runtime.cpu);
  runtime.cpu.write16 = function patchedWrite16(addr, val) {
    const baseAddr = addr & 0xFFFFFF;
    if (baseAddr === WATCH_ADDR) {
      writeEvents.push({
        addr: hex(baseAddr),
        word: hex(val & 0xFFFF, 4),
        sourceRegister: 'HL',
        a: hex(runtime.cpu.a, 2),
        bc: hex(runtime.cpu._bc),
        de: hex(runtime.cpu._de),
        hl: hex(runtime.cpu._hl),
        sp: hex(runtime.cpu.sp),
        read16_0xD008F0: hex(read16Raw(runtime.mem, STRUCT_CURSOR_ADDR), 4),
      });
    }
    return origWrite16(addr, val);
  };

  const singleBlock = runtime.executor.runFrom(BLOCK_09201E, 'adl', {
    maxSteps: 1,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
  });

  return {
    boot,
    memInit: {
      steps: memInit.steps,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
      finalPc: hex(memInit.lastPc),
      finalMode: memInit.lastMode,
    },
    seed,
    preTrace: {
      steps: preTrace.steps,
      termination: preTrace.termination,
      hitSentinel: preTrace.hitSentinel,
      finalPc: hex(preTrace.lastPc),
      finalMode: preTrace.lastMode,
    },
    entryState,
    writeEvents,
    postBlockState: snapshotCpu(runtime.cpu, runtime.mem),
    singleBlockRun: {
      steps: singleBlock.steps,
      termination: singleBlock.termination,
      lastPc: hex(singleBlock.lastPc),
      lastMode: singleBlock.lastMode,
      blockVisits: singleBlock.blockVisits,
    },
    finalWordAtD008E6: hex(read16Raw(runtime.mem, WATCH_ADDR), 4),
  };
}

function determine09201EBehavior(trace) {
  const entryWord = trace.entryState ? Number.parseInt(trace.entryState.scratch.d008f0.slice(2), 16) : null;
  const storedWord = trace.writeEvents[0] ? Number.parseInt(trace.writeEvents[0].word.slice(2), 16) : null;
  const fixedAddend = entryWord !== null && storedWord !== null ? (storedWord - entryWord) & 0xFFFF : null;

  return {
    writesFromImmediateLoad: false,
    sourceRegisterForStore: 'HL',
    formula: fixedAddend === null ? null : `stored_word = read16(0xD008F0) + ${hex(fixedAddend, 4)}`,
    reasoning: [
      '`ld bc,(0x0008f0)` loads the current 16-bit cursor into BC.',
      '`ld hl,0xD008F2` then `add hl,bc` moves HL to the active structure write position.',
      'The block writes 7 bytes through HL before the final subtraction: E, D, E, D, A, 0x00, 0x00.',
      '`ld de,0xD008E7` followed by `sbc hl,de` converts that pointer into the stored size word.',
      'The final `ld (0x0008e6),hl` therefore stores the computed HL value, not a ROM literal like `ld hl,0x0017`.',
    ],
    thisRun: {
      read16_0xD008F0: trace.entryState?.scratch?.d008f0 ?? null,
      storedWord: trace.writeEvents[0]?.word ?? null,
      derivedAddend: fixedAddend === null ? null : hex(fixedAddend, 4),
    },
    supportingNotes: [
      '0x0921AD seeds D008E6 from a ROM template whose first word is 0x000B.',
      '0x092FCB later re-copies a 2-byte word from HL into D008E6; it propagates an existing size value rather than creating one.',
    ],
  };
}

function main() {
  const staticDisassembly = collectStaticDisassembly();
  const trace = trace09201E();
  const determination = determine09201EBehavior(trace);

  const output = {
    probe: 'probe-phase200-stat-09201e-disasm.mjs',
    constraints: {
      timerInterrupt: false,
      mbase: hex(SHORT_MBASE, 2),
      statEntry: hex(ENTRY_ADDR),
      targetBlock: hex(BLOCK_09201E),
      watchedWord: hex(WATCH_ADDR),
    },
    staticDisassembly,
    trace09201E: trace,
    determination,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 1000000, maxLoopIterations: 500000 };

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const GPIO_VALUE = 0xEE;

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KBD_KEY_ADDR = 0xD0058C;
const KEY_AVAILABLE_MASK = 0x08;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

const ENTER_REVERSED_SCAN = 0x29;
const ENTER_FORWARD_INDEX = 0x09;

const LOOKUP_RANGE_START = 0x030000;
const LOOKUP_RANGE_END = 0x031000;
const LOOKUP_ANCHOR_PC = 0x03010D;

const TRACE_LIMITS = {
  blockEntries: 800,
  scanCodeReads: 64,
  kbdKeyWrites: 64,
  aChanges: 256,
};

const POST_LOOKUP_TAIL_BLOCKS = 512;
const POST_KBDKEY_WRITE_TAIL_BLOCKS = 128;
const STOP_SIGNAL = '__PHASE383_STOP__';

const TRACKED_BLOCKS = new Map([
  [0x003D5A, '_GetCSC wrapper'],
  [0x003D75, '_GetCSC key-available path'],
  [0x003A77, 'post-_GetCSC OR A'],
  [0x003A7D, 'event-loop dispatch'],
  [0x001713, 'dispatch gate'],
  [0x001853, 'key handler'],
  [0x0158DE, 'post-key dispatcher'],
  [0x03010D, 'lookup anchor'],
]);

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

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
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

function preparePhase(cpu, mem, sp, stackFillBytes) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(runtime, bootState) {
  restoreCpu(runtime.cpu, bootState.cpuSnapshot);
  restoreLcdMmio(runtime.executor, bootState.lcdSnapshot);
  preparePhase(runtime.cpu, runtime.memory, EVENT_RESET_SP, 12);
  runtime.cpu.f = 0x40;
  runtime.cpu._ix = 0xD1A860;
  runtime.cpu._iy = KEY_STATUS_ADDR;
}

function seedDispatchGates(mem) {
  for (let index = 0; index < FLASH_SEED_BYTES.length; index += 1) {
    mem[FLASH_SEED_ADDR + index] = FLASH_SEED_BYTES[index];
  }
  mem[SYSFLAG_ADDR] = 0x00;
}

function clearKeyState(mem) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KBD_KEY_ADDR] = 0x00;
  mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;
}

function injectEnterKey(mem) {
  mem[KEY_SCAN_CODE_ADDR] = ENTER_REVERSED_SCAN;
  mem[KEY_STATUS_ADDR] = (mem[KEY_STATUS_ADDR] | KEY_AVAILABLE_MASK) & 0xFF;
}

function captureRegisters(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
  };
}

function formatRegisters(registers) {
  return [
    `A=${hexByte(registers.a)}`,
    `F=${hexByte(registers.f)}`,
    `BC=${hex(registers.bc)}`,
    `DE=${hex(registers.de)}`,
    `HL=${hex(registers.hl)}`,
    `SP=${hex(registers.sp)}`,
    `IX=${hex(registers.ix)}`,
    `IY=${hex(registers.iy)}`,
  ].join(' ');
}

function formatBlockHead(meta) {
  const text = meta?.instructions?.map((instruction) => instruction?.dasm).filter(Boolean).join(' ; ') ?? '<unknown>';
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function makeBlockKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function createCPUCompat(blocks, memory, peripheralOptions) {
  const peripherals = createPeripheralBus(peripheralOptions);
  const executor = createExecutor(blocks, memory, { peripherals });
  executor.cpu.peripherals = peripherals;

  return {
    cpu: executor.cpu,
    executor,
    memory,
    peripherals,
    registers: executor.cpu,
    runFrom(address, maxSteps, opts = {}) {
      return executor.runFrom(address, MODE, { maxSteps, ...opts });
    },
  };
}

function pushLimited(trace, key, entry) {
  const list = trace[key];
  const limit = TRACE_LIMITS[key];
  if (list.length < limit) {
    list.push(entry);
    return;
  }
  trace[`${key}Dropped`] += 1;
}

function extendStopAfter(trace, step, extraBlocks) {
  const candidate = step + extraBlocks;
  trace.stopAfterStep = trace.stopAfterStep === null ? candidate : Math.max(trace.stopAfterStep, candidate);
}

function stopError(reason) {
  const error = new Error(STOP_SIGNAL);
  error.phase383Stop = { reason };
  return error;
}

function loadLabelForPc(pc) {
  if (TRACKED_BLOCKS.has(pc)) {
    return TRACKED_BLOCKS.get(pc);
  }
  if (pc >= LOOKUP_RANGE_START && pc < LOOKUP_RANGE_END) {
    return 'lookup-range';
  }
  return null;
}

async function loadRomAndBlocks() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }

  if (!fs.existsSync(TRANSPILED_PATH)) {
    if (fs.existsSync(TRANSPILED_GZ_PATH)) {
      throw new Error(
        `Transpiled ROM not found: ${TRANSPILED_PATH}\n`
        + 'If only ROM.transpiled.js.gz exists, run:\n'
        + '  cd TI-84_Plus_CE && gzip -dk ROM.transpiled.js.gz',
      );
    }
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

  return { romBytes, blocks };
}

function runBootPhases(blocks, romBytes) {
  const runtime = createCPUCompat(
    blocks,
    createMemoryImage(romBytes),
    { timerInterrupt: false, gpioValue: GPIO_VALUE },
  );

  const phase1 = runtime.executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(runtime.cpu, runtime.memory, BOOT_RESET_SP, 3);
  const phase2 = runtime.executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  runtime.cpu.mbase = 0xD0;
  runtime.cpu._hl = 0;
  preparePhase(runtime.cpu, runtime.memory, BOOT_RESET_SP, 3);
  const phase3 = runtime.executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    memSnapshot: Buffer.from(runtime.memory),
    cpuSnapshot: snapshotCpu(runtime.cpu),
    lcdSnapshot: runtime.executor.lcdMmio
      ? { upbase: runtime.executor.lcdMmio.upbase, control: runtime.executor.lcdMmio.control }
      : null,
  };
}

function createTrace() {
  return {
    blockEntries: [],
    blockEntriesDropped: 0,
    scanCodeReads: [],
    scanCodeReadsDropped: 0,
    kbdKeyWrites: [],
    kbdKeyWritesDropped: 0,
    aChanges: [],
    aChangesDropped: 0,
    stopAfterStep: null,
    firstScanCodeRead: null,
    firstKbdKeyWrite: null,
    firstLookupRangeEntry: null,
    firstLookupAnchorEntry: null,
    firstA29: null,
    firstA09: null,
    firstTransformFrom29: null,
  };
}

function installMemoryHooks(runtime, trace) {
  const originalRead8 = runtime.cpu.read8.bind(runtime.cpu);
  const originalWrite8 = runtime.cpu.write8.bind(runtime.cpu);

  runtime.cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    const normalizedAddr = addr & 0xFFFFFF;

    if (normalizedAddr === KEY_SCAN_CODE_ADDR) {
      const event = {
        step: runtime.cpu.stepCount ?? 0,
        pc: (runtime.cpu._currentBlockPc ?? runtime.cpu.pc ?? 0) & 0xFFFFFF,
        value: value & 0xFF,
        registers: captureRegisters(runtime.cpu),
      };
      pushLimited(trace, 'scanCodeReads', event);
      if (!trace.firstScanCodeRead) {
        trace.firstScanCodeRead = event;
      }
    }

    return value;
  };

  runtime.cpu.write8 = (addr, value) => {
    const normalizedAddr = addr & 0xFFFFFF;
    const normalizedValue = value & 0xFF;

    if (normalizedAddr === KBD_KEY_ADDR) {
      const event = {
        step: runtime.cpu.stepCount ?? 0,
        pc: (runtime.cpu._currentBlockPc ?? runtime.cpu.pc ?? 0) & 0xFFFFFF,
        value: normalizedValue,
        registers: captureRegisters(runtime.cpu),
      };
      pushLimited(trace, 'kbdKeyWrites', event);
      if (!trace.firstKbdKeyWrite) {
        trace.firstKbdKeyWrite = event;
      }
      extendStopAfter(trace, event.step, POST_KBDKEY_WRITE_TAIL_BLOCKS);
    }

    return originalWrite8(addr, value);
  };
}

function runTraceScenario(blocks, bootState) {
  const memory = Uint8Array.from(bootState.memSnapshot);
  const runtime = createCPUCompat(
    blocks,
    memory,
    { timerInterrupt: false, gpioValue: GPIO_VALUE },
  );
  const trace = createTrace();

  prepareEventLoop(runtime, bootState);
  seedDispatchGates(memory);
  clearKeyState(memory);
  injectEnterKey(memory);
  installMemoryHooks(runtime, trace);

  let previousBlock = null;
  let runResult = null;
  let stoppedBySignal = false;

  try {
    runResult = runtime.runFrom(EVENT_LOOP_ENTRY, EVENT_OPTS.maxSteps, {
      maxLoopIterations: EVENT_OPTS.maxLoopIterations,
      diHaltBypass: true,
      diHaltBypassEntry: EVENT_LOOP_ENTRY,
      onBlock(pc, mode, meta, step) {
        const normalizedPc = pc & 0xFFFFFF;
        const registers = captureRegisters(runtime.cpu);
        const currentA = registers.a;
        const inLookupRange = normalizedPc >= LOOKUP_RANGE_START && normalizedPc < LOOKUP_RANGE_END;
        const shouldLogBlock = TRACKED_BLOCKS.has(normalizedPc) || inLookupRange;
        const trackingActive = trace.firstScanCodeRead !== null;

        if (!trace.firstLookupRangeEntry && inLookupRange) {
          trace.firstLookupRangeEntry = {
            step,
            pc: normalizedPc,
            registers,
          };
          extendStopAfter(trace, step, POST_LOOKUP_TAIL_BLOCKS);
        }

        if (!trace.firstLookupAnchorEntry && normalizedPc === LOOKUP_ANCHOR_PC) {
          trace.firstLookupAnchorEntry = {
            step,
            pc: normalizedPc,
            registers,
          };
        }

        if (trackingActive && !trace.firstA29 && currentA === ENTER_REVERSED_SCAN) {
          trace.firstA29 = {
            step,
            pc: normalizedPc,
            prevPc: previousBlock?.pc ?? null,
            prevStep: previousBlock?.step ?? null,
            registers,
          };
        }

        if (trackingActive && !trace.firstA09 && currentA === ENTER_FORWARD_INDEX) {
          trace.firstA09 = {
            step,
            pc: normalizedPc,
            prevPc: previousBlock?.pc ?? null,
            prevStep: previousBlock?.step ?? null,
            fromA: previousBlock?.a ?? null,
            registers,
          };
        }

        if (trackingActive && previousBlock && previousBlock.active && previousBlock.a !== currentA) {
          const change = {
            step,
            pc: normalizedPc,
            prevStep: previousBlock.step,
            prevPc: previousBlock.pc,
            fromA: previousBlock.a,
            toA: currentA,
            registers,
          };
          pushLimited(trace, 'aChanges', change);

          if (!trace.firstTransformFrom29 && previousBlock.a === ENTER_REVERSED_SCAN && currentA !== ENTER_REVERSED_SCAN) {
            trace.firstTransformFrom29 = change;
          }
        }

        if (shouldLogBlock) {
          pushLimited(trace, 'blockEntries', {
            step,
            pc: normalizedPc,
            mode,
            label: loadLabelForPc(normalizedPc),
            text: formatBlockHead(meta),
            registers,
          });
        }

        previousBlock = {
          step,
          pc: normalizedPc,
          a: currentA,
          active: trackingActive,
        };

        if (trace.stopAfterStep !== null && step >= trace.stopAfterStep) {
          throw stopError('trace-tail-captured');
        }
      },
    });
  } catch (error) {
    if (error?.message === STOP_SIGNAL) {
      stoppedBySignal = true;
      runResult = {
        steps: runtime.cpu.stepCount ?? 0,
        lastPc: runtime.cpu.pc ?? 0,
        termination: error.phase383Stop?.reason ?? 'signal',
      };
    } else {
      throw error;
    }
  }

  return {
    runtime,
    memory,
    trace,
    result: runResult,
    stoppedBySignal,
  };
}

function printBootSummary(bootState) {
  console.log('=== BOOT SUMMARY ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');
}

function printEventSummary(run) {
  console.log('=== EVENT RUN ===');
  console.log(
    `steps=${count(run.result?.steps)} termination=${run.result?.termination ?? 'n/a'} `
    + `lastPc=${hex(run.result?.lastPc ?? 0)} stoppedBySignal=${run.stoppedBySignal}`,
  );
  console.log(`injected key: D00587=${hexByte(ENTER_REVERSED_SCAN)} D00080|=${hexByte(KEY_AVAILABLE_MASK)}`);
  console.log(
    `post-run RAM: D00080=${hexByte(run.memory[KEY_STATUS_ADDR])} `
    + `D00587=${hexByte(run.memory[KEY_SCAN_CODE_ADDR])} `
    + `D0058C=${hexByte(run.memory[KBD_KEY_ADDR])}`,
  );
  console.log('');
}

function printBlockTrace(trace) {
  console.log('=== A TRACE THROUGH DISPATCH PATH ===');
  if (trace.blockEntries.length === 0) {
    console.log('no tracked block entries recorded');
    console.log('');
    return;
  }

  for (const entry of trace.blockEntries) {
    console.log(
      `step=${count(entry.step).padStart(8)} pc=${hex(entry.pc)} `
      + `${entry.label?.padEnd(24) ?? ''.padEnd(24)} `
      + `${formatRegisters(entry.registers)} `
      + `| ${entry.text}`,
    );
  }

  if (trace.blockEntriesDropped > 0) {
    console.log(`... ${count(trace.blockEntriesDropped)} additional tracked block entries omitted`);
  }
  console.log('');
}

function printScanCodeReads(trace) {
  console.log('=== READS OF 0xD00587 ===');
  if (trace.scanCodeReads.length === 0) {
    console.log('none');
    console.log('');
    return;
  }

  for (const event of trace.scanCodeReads) {
    console.log(
      `step=${count(event.step).padStart(8)} pc=${hex(event.pc)} `
      + `value=${hexByte(event.value)} ${formatRegisters(event.registers)}`,
    );
  }

  if (trace.scanCodeReadsDropped > 0) {
    console.log(`... ${count(trace.scanCodeReadsDropped)} additional reads omitted`);
  }
  console.log('');
}

function printKbdKeyWrites(trace) {
  console.log('=== WRITES TO 0xD0058C ===');
  if (trace.kbdKeyWrites.length === 0) {
    console.log('none');
    console.log('');
    return;
  }

  for (const event of trace.kbdKeyWrites) {
    console.log(
      `step=${count(event.step).padStart(8)} pc=${hex(event.pc)} `
      + `value=${hexByte(event.value)} ${formatRegisters(event.registers)}`,
    );
  }

  if (trace.kbdKeyWritesDropped > 0) {
    console.log(`... ${count(trace.kbdKeyWritesDropped)} additional writes omitted`);
  }
  console.log('');
}

function printAChanges(trace) {
  console.log('=== A REGISTER CHANGES AFTER THE 0xD00587 READ ===');
  if (trace.aChanges.length === 0) {
    console.log('none observed');
    console.log('');
    return;
  }

  for (const change of trace.aChanges) {
    console.log(
      `step=${count(change.step).padStart(8)} `
      + `${hex(change.prevPc)} -> ${hex(change.pc)} `
      + `A ${hexByte(change.fromA)} -> ${hexByte(change.toA)} `
      + `${formatRegisters(change.registers)}`,
    );
  }

  if (trace.aChangesDropped > 0) {
    console.log(`... ${count(trace.aChangesDropped)} additional A changes omitted`);
  }
  console.log('');
}

function relationToLookup(trace, event) {
  const anchor = trace.firstLookupAnchorEntry ?? trace.firstLookupRangeEntry;
  if (!event) {
    return 'not observed';
  }
  if (!anchor) {
    return 'lookup area not reached';
  }
  if (event.step < anchor.step) {
    return 'BEFORE reaching the 0x03010D area';
  }
  return 'AFTER reaching the 0x03010D area';
}

function printSummary(trace) {
  console.log('=== SUMMARY ===');

  if (trace.firstScanCodeRead) {
    console.log(
      `first D00587 read: step=${count(trace.firstScanCodeRead.step)} `
      + `pc=${hex(trace.firstScanCodeRead.pc)} value=${hexByte(trace.firstScanCodeRead.value)}`,
    );
  } else {
    console.log('first D00587 read: not observed');
  }

  if (trace.firstA29) {
    console.log(
      `first A=0x29: step=${count(trace.firstA29.step)} pc=${hex(trace.firstA29.pc)} `
      + `${trace.firstA29.prevPc === null ? '' : `after ${hex(trace.firstA29.prevPc)}`}`.trim(),
    );
  } else {
    console.log('first A=0x29: not observed');
  }

  if (trace.firstTransformFrom29) {
    console.log(
      `first non-0x29 A: step=${count(trace.firstTransformFrom29.step)} `
      + `between ${hex(trace.firstTransformFrom29.prevPc)} and ${hex(trace.firstTransformFrom29.pc)} `
      + `${hexByte(trace.firstTransformFrom29.fromA)} -> ${hexByte(trace.firstTransformFrom29.toA)}`,
    );
    console.log(`first non-0x29 relation: ${relationToLookup(trace, trace.firstTransformFrom29)}`);
  } else {
    console.log('first non-0x29 A: not observed');
  }

  if (trace.firstA09) {
    console.log(
      `first A=0x09: step=${count(trace.firstA09.step)} `
      + `pc=${hex(trace.firstA09.pc)} `
      + `${trace.firstA09.prevPc === null ? '' : `after ${hex(trace.firstA09.prevPc)}`}`.trim(),
    );
    console.log(`A=0x09 relation: ${relationToLookup(trace, trace.firstA09)}`);
  } else {
    console.log('first A=0x09: not observed');
  }

  if (trace.firstLookupRangeEntry) {
    console.log(
      `first lookup-range block: step=${count(trace.firstLookupRangeEntry.step)} `
      + `pc=${hex(trace.firstLookupRangeEntry.pc)}`,
    );
  } else {
    console.log('first lookup-range block: not observed');
  }

  if (trace.firstLookupAnchorEntry) {
    console.log(
      `first 0x03010D entry: step=${count(trace.firstLookupAnchorEntry.step)} `
      + `pc=${hex(trace.firstLookupAnchorEntry.pc)}`,
    );
  } else {
    console.log('first 0x03010D entry: not observed');
  }

  if (trace.firstKbdKeyWrite) {
    console.log(
      `first D0058C write: step=${count(trace.firstKbdKeyWrite.step)} `
      + `pc=${hex(trace.firstKbdKeyWrite.pc)} value=${hexByte(trace.firstKbdKeyWrite.value)}`,
    );
  } else {
    console.log('first D0058C write: not observed');
  }

  if (trace.firstA09) {
    console.log(`conversion verdict: A reached forward index 0x09 ${relationToLookup(trace, trace.firstA09)}.`);
  } else if (trace.firstTransformFrom29) {
    console.log(
      `conversion verdict: A left 0x29 ${relationToLookup(trace, trace.firstTransformFrom29)}, `
      + `but never reached 0x09 in the recorded trace.`,
    );
  } else {
    console.log('conversion verdict: no A-register conversion away from 0x29 was observed in the recorded trace.');
  }

  console.log('');
}

async function main() {
  const { romBytes, blocks } = await loadRomAndBlocks();

  console.log('=== Phase 383 Scan-Code Trace Probe ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled ROM: ${TRANSPILED_PATH}`);
  console.log(`Runtime adapter: local createCPUCompat() over createExecutor()`);
  console.log(`Timer interrupt: disabled`);
  console.log(`GPIO value: ${hexByte(GPIO_VALUE)}`);
  console.log('');

  const bootState = runBootPhases(blocks, romBytes);
  printBootSummary(bootState);

  const run = runTraceScenario(blocks, bootState);
  printEventSummary(run);
  printBlockTrace(run.trace);
  printScanCodeReads(run.trace);
  printKbdKeyWrites(run.trace);
  printAChanges(run.trace);
  printSummary(run.trace);
}

await main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

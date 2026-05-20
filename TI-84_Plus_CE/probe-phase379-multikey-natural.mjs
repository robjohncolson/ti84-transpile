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

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

const BOOT_PERIPHERAL_OPTS = { timerInterrupt: false, gpioValue: 0xEE };
const COLDBOOT_PERIPHERAL_OPTS = { timerInterrupt: true, gpioValue: 0xEE };

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 500000, maxLoopIterations: 500000 };

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;

const FLASH_GATE_ADDR = 0x020100;
const FLASH_GATE_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

const COLDBOOT_RUNTIME_SEEDS = [
  [0xD02AD7, 0xBE],
  [0xD02AD8, 0x19],
  [0xD02AD9, 0x00],
];
const COLDBOOT_RUNTIME_FLAG_ADDR = 0xD0009B;
const COLDBOOT_RUNTIME_FLAG_MASK = 0x40;

const SCAN_ENTRY = 0x003C63;
const SCAN_END = 0x003D59;
const STORE_BLOCK = 0x003D4B;
const FLAG_SET_PC = 0x003D4F;
const GETCSC_KEY_PATH = 0x003D75;
const DISPATCH_ENTRY = 0x003A7D;
const NORMAL_KEY_HANDLER = 0x001853;
const POST_KEY_HANDLER = 0x0158DE;
const HALT_ENTRY = 0x0019B5;

const KEYBOARD_PORT_MIN = 0xA000;
const KEYBOARD_PORT_MAX = 0xA01E;

const WATCHED_BLOCKS = [
  SCAN_ENTRY,
  STORE_BLOCK,
  GETCSC_KEY_PATH,
  DISPATCH_ENTRY,
  NORMAL_KEY_HANDLER,
  POST_KEY_HANDLER,
  HALT_ENTRY,
];

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

const KEY_CASES = [
  { name: 'ENTER', matrixGroup: 1, bit: 0, expectedScanCode: 0x29 },
  { name: 'CLEAR', matrixGroup: 1, bit: 6, expectedScanCode: 0x2F },
  { name: '2ND', matrixGroup: 6, bit: 5, expectedScanCode: 0x06 },
  { name: 'DEL', matrixGroup: 6, bit: 7, expectedScanCode: 0x08 },
  {
    name: '0',
    matrixGroup: 4,
    bit: 0,
    expectedScanCode: 0x11,
    note: 'corrected from the prompt\'s intermediate 5:0 note; 0x11 maps to keyMatrix[4]:bit0',
  },
  { name: 'ALPHA', matrixGroup: 5, bit: 7, expectedScanCode: 0x10 },
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

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
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

function fillSentinel(mem, addr, size) {
  mem.fill(0xFF, addr, addr + size);
}

function preparePhase2(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  fillSentinel(mem, cpu.sp, 3);
}

function preparePhase3(cpu, mem) {
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_STATUS_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  fillSentinel(mem, cpu.sp, 3);
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = EVENT_RESET_SP;
  fillSentinel(mem, cpu.sp, 12);
}

function seedFlashGate(mem) {
  for (let index = 0; index < FLASH_GATE_BYTES.length; index += 1) {
    mem[FLASH_GATE_ADDR + index] = FLASH_GATE_BYTES[index];
  }
}

function seedColdbootRuntime(mem) {
  for (const [addr, value] of COLDBOOT_RUNTIME_SEEDS) {
    mem[addr] = value;
  }
  mem[COLDBOOT_RUNTIME_FLAG_ADDR] |= COLDBOOT_RUNTIME_FLAG_MASK;
}

function clearKeyState(mem) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;
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

function pressMatrixKey(peripherals, keyCase) {
  if (typeof peripherals.setMatrixKey !== 'function') {
    throw new Error('Peripheral bus did not expose setMatrixKey().');
  }
  resetKeyboard(peripherals);
  peripherals.setMatrixKey(keyCase.matrixGroup, keyCase.bit, true);
}

function bumpCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function pushLimited(list, value, limit = 8) {
  if (list.length < limit) {
    list.push(value);
  }
}

function wrapBlock(executor, blockKey, factory) {
  const original = executor.compiledBlocks[blockKey];
  if (!original) {
    return false;
  }
  executor.compiledBlocks[blockKey] = factory(original);
  return true;
}

function createTrace() {
  return {
    uniqueBlocks: new Set(),
    blockHits: new Map(),
    scanCalls: 0,
    activeScan: false,
    keyboardPortReads: 0,
    keyboardPortWrites: 0,
    keyboardPortSamples: [],
    storeHits: 0,
    flagSetHits: 0,
    storeSamples: [],
    getCscSamples: [],
    firstDispatchStep: null,
    haltStep: null,
  };
}

function instrumentKeyboardPorts(peripherals, cpu, trace) {
  const originalRead = peripherals.read.bind(peripherals);
  const originalWrite = peripherals.write.bind(peripherals);

  peripherals.read = (port) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const value = originalRead(normalizedPort) & 0xFF;

    if (trace.activeScan && normalizedPort >= KEYBOARD_PORT_MIN && normalizedPort <= KEYBOARD_PORT_MAX) {
      trace.keyboardPortReads++;
      pushLimited(trace.keyboardPortSamples, {
        step: cpu.stepCount,
        kind: 'IN',
        port: normalizedPort,
        value,
      });
    }

    return value;
  };

  peripherals.write = (port, value) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const normalizedValue = Number(value) & 0xFF;
    originalWrite(normalizedPort, normalizedValue);

    if (trace.activeScan && normalizedPort >= KEYBOARD_PORT_MIN && normalizedPort <= KEYBOARD_PORT_MAX) {
      trace.keyboardPortWrites++;
      pushLimited(trace.keyboardPortSamples, {
        step: cpu.stepCount,
        kind: 'OUT',
        port: normalizedPort,
        value: normalizedValue,
      });
    }
  };
}

function installTraceHooks(executor, mem, trace) {
  wrapBlock(executor, makeKey(STORE_BLOCK), (original) => function wrappedStore(cpu) {
    const beforeScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const beforeStatus = mem[KEY_STATUS_ADDR] & 0xFF;
    const aBefore = cpu.a & 0xFF;
    const result = original(cpu);
    const afterScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const afterStatus = mem[KEY_STATUS_ADDR] & 0xFF;

    trace.storeHits++;
    if ((afterStatus & KEY_AVAILABLE_MASK) !== 0) {
      trace.flagSetHits++;
    }
    pushLimited(trace.storeSamples, {
      step: cpu.stepCount,
      aBefore,
      beforeScan,
      afterScan,
      beforeStatus,
      afterStatus,
      result,
    });

    return result;
  });

  wrapBlock(executor, makeKey(GETCSC_KEY_PATH), (original) => function wrappedGetCscKeyPath(cpu) {
    const beforeScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const beforeStatus = mem[KEY_STATUS_ADDR] & 0xFF;
    const result = original(cpu);
    const afterScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const afterStatus = mem[KEY_STATUS_ADDR] & 0xFF;
    const returnedScanCode = cpu.a & 0xFF;

    pushLimited(trace.getCscSamples, {
      step: cpu.stepCount,
      beforeScan,
      beforeStatus,
      afterScan,
      afterStatus,
      returnedScanCode,
      result,
    });

    return result;
  });
}

function hasHit(trace, addr) {
  return (trace.blockHits.get(addr) ?? 0) > 0;
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus(BOOT_PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase2(cpu, mem);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  preparePhase3(cpu, mem);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function runKeyCase(blocks, romBytes, keyCase) {
  const bootState = runBootPhases(blocks, romBytes);
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus(COLDBOOT_PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace();

  prepareEventLoop(cpu, executor, mem, bootState);
  seedColdbootRuntime(mem);
  seedFlashGate(mem);
  mem[SYSFLAG_ADDR] = 0x00;
  clearKeyState(mem);
  pressMatrixKey(peripherals, keyCase);

  instrumentKeyboardPorts(peripherals, cpu, trace);
  installTraceHooks(executor, mem, trace);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const addr = pc & 0xFFFFFF;
      trace.uniqueBlocks.add(makeKey(addr, mode));

      if (trace.activeScan && (addr < SCAN_ENTRY || addr > SCAN_END)) {
        trace.activeScan = false;
      }

      if (WATCHED_BLOCKS.includes(addr)) {
        bumpCount(trace.blockHits, addr);
      }

      if (addr === SCAN_ENTRY) {
        trace.scanCalls++;
        trace.activeScan = true;
      }

      if (addr === DISPATCH_ENTRY && trace.firstDispatchStep === null) {
        trace.firstDispatchStep = step;
      }

      if (addr === HALT_ENTRY && trace.haltStep === null) {
        trace.haltStep = step;
      }
    },
  });

  trace.activeScan = false;

  const storeSample = trace.storeSamples[0] ?? null;
  const getCscSample = trace.getCscSamples[0] ?? null;
  const observedScanCode = getCscSample?.beforeScan
    ?? storeSample?.afterScan
    ?? (mem[KEY_SCAN_CODE_ADDR] & 0xFF);
  const finalScanCode = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
  const finalKeyStatus = mem[KEY_STATUS_ADDR] & 0xFF;
  const dispatchReached = hasHit(trace, DISPATCH_ENTRY);
  const pass = dispatchReached && observedScanCode === keyCase.expectedScanCode;

  return {
    keyCase,
    bootState,
    result,
    trace,
    storeSample,
    getCscSample,
    observedScanCode,
    finalScanCode,
    finalKeyStatus,
    dispatchReached,
    pass,
  };
}

function formatPhaseResults(phaseResults) {
  return phaseResults
    .map((phase, index) => `P${index + 1}:${phase.result.termination}@${hex(phase.result.lastPc)}`)
    .join(' | ');
}

function formatStop(result) {
  return `${result.termination}@${hex(result.lastPc)}`;
}

function formatPortSamples(samples) {
  if (!samples || samples.length === 0) {
    return 'none';
  }
  return samples
    .map((sample) => `${sample.kind} ${hex(sample.port, 4)}=${hexByte(sample.value)}@${count(sample.step)}`)
    .join(' | ');
}

function printKeyResult(run) {
  const { keyCase, bootState, result, trace, storeSample, getCscSample } = run;

  console.log(`=== ${keyCase.name} ===`);
  console.log(
    `matrix: keyMatrix[${keyCase.matrixGroup}] bit ${keyCase.bit} `
    + `expected=${hexByte(keyCase.expectedScanCode)}`
    + (keyCase.note ? ` note="${keyCase.note}"` : ''),
  );
  console.log(`boot: ${formatPhaseResults(bootState.phaseResults)}`);
  console.log(
    `event: steps=${count(result.steps)} termination=${result.termination} `
    + `lastPc=${hex(result.lastPc)} loopsForced=${count(result.loopsForced)}`,
  );
  console.log(
    `scan: ${hex(SCAN_ENTRY)}=${yesNo(hasHit(trace, SCAN_ENTRY))} calls=${count(trace.scanCalls)} `
    + `kbdIO(reads=${count(trace.keyboardPortReads)} writes=${count(trace.keyboardPortWrites)})`,
  );
  console.log(`  first port I/O: ${formatPortSamples(trace.keyboardPortSamples)}`);
  console.log(
    `store: ${hex(STORE_BLOCK)}=${yesNo(hasHit(trace, STORE_BLOCK))} hits=${count(trace.storeHits)} `
    + `${hex(FLAG_SET_PC)} set_bit3=${yesNo(trace.flagSetHits > 0)}`,
  );
  console.log(
    `blocks: ${hex(GETCSC_KEY_PATH)}=${yesNo(hasHit(trace, GETCSC_KEY_PATH))} `
    + `${hex(DISPATCH_ENTRY)}=${yesNo(hasHit(trace, DISPATCH_ENTRY))} `
    + `${hex(NORMAL_KEY_HANDLER)}=${yesNo(hasHit(trace, NORMAL_KEY_HANDLER))} `
    + `${hex(POST_KEY_HANDLER)}=${yesNo(hasHit(trace, POST_KEY_HANDLER))}`,
  );
  console.log(
    `codes: observed=${hexByte(run.observedScanCode)} expected=${hexByte(keyCase.expectedScanCode)} `
    + `store=${storeSample ? hexByte(storeSample.afterScan) : 'n/a'} `
    + `getcsc=${getCscSample ? hexByte(getCscSample.beforeScan) : 'n/a'} `
    + `finalRam=${hexByte(run.finalScanCode)}`,
  );
  console.log(
    `flags: finalStatus=${hexByte(run.finalKeyStatus)} bit3=${yesNo((run.finalKeyStatus & KEY_AVAILABLE_MASK) !== 0)} `
    + `stop=${formatStop(result)}`
    + (trace.haltStep === null ? '' : ` haltStep=${count(trace.haltStep)}`),
  );
  console.log(`verdict: ${run.pass ? 'PASS' : 'FAIL'}`);
  console.log('');
}

function printSummary(results) {
  console.log('=== SUMMARY ===');
  console.log('Key     Matrix  Exp   Obs   Scan Store Flag GetCSC Disp 1853 158DE Stop                    Verdict');
  for (const run of results) {
    const matrix = `${run.keyCase.matrixGroup}:${run.keyCase.bit}`.padEnd(6, ' ');
    const stop = formatStop(run.result).padEnd(22, ' ');
    console.log(
      `${run.keyCase.name.padEnd(7, ' ')} `
      + `${matrix} `
      + `${hexByte(run.keyCase.expectedScanCode).padEnd(5, ' ')} `
      + `${hexByte(run.observedScanCode).padEnd(5, ' ')} `
      + `${yesNo(hasHit(run.trace, SCAN_ENTRY)).padEnd(4, ' ')} `
      + `${yesNo(hasHit(run.trace, STORE_BLOCK)).padEnd(5, ' ')} `
      + `${yesNo(run.trace.flagSetHits > 0).padEnd(4, ' ')} `
      + `${yesNo(hasHit(run.trace, GETCSC_KEY_PATH)).padEnd(6, ' ')} `
      + `${yesNo(hasHit(run.trace, DISPATCH_ENTRY)).padEnd(4, ' ')} `
      + `${yesNo(hasHit(run.trace, NORMAL_KEY_HANDLER)).padEnd(4, ' ')} `
      + `${yesNo(hasHit(run.trace, POST_KEY_HANDLER)).padEnd(5, ' ')} `
      + `${stop} `
      + `${run.pass ? 'PASS' : 'FAIL'}`,
    );
  }
  console.log('');
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

  console.log('=== PROBE: PHASE 379 MULTI-KEY NATURAL SCAN ===');
  console.log(`coldboot bus: createPeripheralBus({ timerInterrupt: true, gpioValue: ${hexByte(COLDBOOT_PERIPHERAL_OPTS.gpioValue)} })`);
  console.log(`event loop entry: ${hex(EVENT_LOOP_ENTRY)}  scan routine: ${hex(SCAN_ENTRY)}`);
  console.log(`pass condition: dispatch reached at ${hex(DISPATCH_ENTRY)} with expected scan code`);
  console.log('');

  const results = KEY_CASES.map((keyCase) => runKeyCase(blocks, romBytes, keyCase));

  for (const run of results) {
    printKeyResult(run);
  }

  printSummary(results);

  const passCount = results.filter((run) => run.pass).length;
  const allPass = passCount === results.length;

  console.log('=== VERDICT ===');
  console.log(`${count(passCount)}/${count(results.length)} key cases passed.`);
  console.log(allPass ? 'Overall result: PASS' : 'Overall result: FAIL');

  process.exitCode = allPass ? 0 : 1;
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

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

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 500000, maxLoopIterations: 200000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_AVAILABLE_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_LAST_KEY_ADDR = 0xD00588;
const KEY_PREVIOUS_KEY_ADDR = 0xD00589;
const KEY_REPEAT_COUNTER_ADDR = 0xD0058A;
const KEY_DEBOUNCE_COUNTER_ADDR = 0xD0058B;

const SCAN_ENTRY = 0x003C63;
const REPEAT_GATE_BLOCK = 0x003C90;
const REPEAT_PATH_BLOCK = 0x003C96; // contains JP 0x003C98 -> 0x003D4B
const NEW_KEY_BLOCK = 0x003C9C;
const ERROR_PATH_BLOCK = 0x003CAF;
const INC_H_BLOCK = 0x003D2E;
const NO_KEY_RETURN_BLOCK = 0x003D34;
const MULTI_KEY_REJECT_BLOCK = 0x003D47;
const STORE_BLOCK = 0x003D4B;
const STORE_TAIL_BLOCK = 0x003D55;
const GETCSC_LOOP_CALL_BLOCK = 0x003D62;
const GETCSC_LOOP_RETURN_BLOCK = 0x003D67;

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
  return ((Number(value) || 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function makeKey(addr, mode = MODE) {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
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

function prepareEventLoop(cpu, mem) {
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
}

function wrapBlock(executor, blockKey, factory) {
  const original = executor.compiledBlocks[blockKey];
  if (!original) {
    return false;
  }
  executor.compiledBlocks[blockKey] = factory(original);
  return true;
}

function readKeyRam(mem) {
  return {
    scanCode: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    lastKey: mem[KEY_LAST_KEY_ADDR] & 0xFF,
    previousKey: mem[KEY_PREVIOUS_KEY_ADDR] & 0xFF,
    repeatCounter: mem[KEY_REPEAT_COUNTER_ADDR] & 0xFF,
    debounceCounter: mem[KEY_DEBOUNCE_COUNTER_ADDR] & 0xFF,
    keyStatusFlags: mem[KEY_STATUS_ADDR] & 0xFF,
  };
}

function captureRegisters(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
  };
}

function ensureKeyboardApi(peripherals) {
  const keyboardState = peripherals.keyboardState ?? peripherals.keyboard;
  if (!keyboardState?.keyMatrix) {
    throw new Error('Peripheral bus did not expose a keyboard matrix.');
  }
  if (!peripherals.keyboardState) {
    peripherals.keyboardState = keyboardState;
  }
  if (typeof peripherals.setMatrixKey !== 'function') {
    peripherals.setMatrixKey = function setMatrixKey(group, bit, pressed) {
      const mask = 1 << bit;
      if (pressed) {
        keyboardState.keyMatrix[group] &= ~mask;
      } else {
        keyboardState.keyMatrix[group] |= mask;
      }
    };
  }
  return keyboardState;
}

function resetKeyboard(peripherals, keyboardState) {
  keyboardState.keyMatrix.fill(0xFF);
  keyboardState.groupSelect = 0xFF;
  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
}

function createTrace() {
  return {
    scans: [],
    currentScan: null,
    blockHits: new Map(),
    repeatGateEvents: [],
    repeatPathEvents: [],
    newKeyEvents: [],
    storeEvents: [],
    incHEvents: [],
    errorEvents: [],
    multiKeyEvents: [],
  };
}

function startScan(trace, mem, cpu, step) {
  const scan = {
    id: trace.scans.length + 1,
    entryStep: step,
    entryRam: readKeyRam(mem),
    entryA: cpu.a & 0xFF,
    entryF: cpu.f & 0xFF,
    blocks: [],
    lastBlock: null,
    exitBlock: null,
    exitStep: null,
    exitRam: null,
    exitDescription: null,
    repeatGateVisited: false,
    repeatPathHit: false,
    newKeyHit: false,
    storeHits: 0,
    errorHit: false,
    multiKeyHit: false,
    repeatGateTransitions: [],
    incH: [],
  };
  trace.currentScan = scan;
  trace.scans.push(scan);
  return scan;
}

function noteScanBlock(trace, pc) {
  const scan = trace.currentScan;
  if (!scan) {
    return;
  }
  if (scan.blocks[scan.blocks.length - 1] !== pc) {
    scan.blocks.push(pc);
  }
  scan.lastBlock = pc;
}

function describeExit(scan, reason = 'returned') {
  if (reason === 'unfinished') {
    return `unfinished at ${hex(scan.lastBlock ?? 0)}`;
  }
  if (scan.repeatPathHit) {
    return scan.storeHits > 0
      ? 'repeat path 0x003C98 -> 0x003D4B store'
      : 'repeat path hit without a completed store';
  }
  if (scan.newKeyHit) {
    return scan.storeHits > 0
      ? 'new-key path 0x003C9C -> 0x003D4B store'
      : 'new-key path hit without a completed store';
  }
  if (scan.errorHit) {
    return '0x003CAF error path';
  }
  if (scan.multiKeyHit) {
    return '0x003D47 multi-key rejection';
  }
  switch (scan.exitBlock) {
    case 0x003C7D:
      return '0x003C7D debounce countdown return';
    case 0x003C87:
      return '0x003C87 same-key zero return';
    case 0x003C8D:
      return '0x003C8D same-key guard return';
    case REPEAT_GATE_BLOCK:
      return '0x003C95 repeat counter decremented and returned';
    case NO_KEY_RETURN_BLOCK:
      return '0x003D35 low-level no-key return';
    case 0x003D45:
      return '0x003D46 decode-stage return';
    case STORE_TAIL_BLOCK:
      return '0x003D55 store-tail return';
    case 0x003CA3:
      return '0x003CAE new-key post-store return';
    default:
      return scan.exitBlock == null ? 'unknown' : `${hex(scan.exitBlock)} return`;
  }
}

function finalizeScan(trace, mem, step, reason = 'returned') {
  const scan = trace.currentScan;
  if (!scan) {
    return;
  }
  scan.exitStep = step;
  scan.exitBlock = scan.lastBlock;
  scan.exitRam = readKeyRam(mem);
  scan.exitDescription = describeExit(scan, reason);
  trace.currentScan = null;
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
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

function installTraceHooks(executor, mem, trace) {
  wrapBlock(executor, makeKey(REPEAT_GATE_BLOCK), (original) => function wrappedRepeatGate(cpu) {
    const scan = trace.currentScan;
    const before = mem[KEY_REPEAT_COUNTER_ADDR] & 0xFF;
    const result = original(cpu);
    const after = mem[KEY_REPEAT_COUNTER_ADDR] & 0xFF;
    const event = {
      scanId: scan?.id ?? null,
      step: cpu.stepCount,
      before,
      after,
      result,
    };
    trace.repeatGateEvents.push(event);
    if (scan) {
      scan.repeatGateVisited = true;
      scan.repeatGateTransitions.push(event);
    }
    return result;
  });

  wrapBlock(executor, makeKey(REPEAT_PATH_BLOCK), (original) => function wrappedRepeatPath(cpu) {
    const scan = trace.currentScan;
    const event = {
      scanId: scan?.id ?? null,
      step: cpu.stepCount,
      registers: captureRegisters(cpu),
      repeatCounter: mem[KEY_REPEAT_COUNTER_ADDR] & 0xFF,
    };
    trace.repeatPathEvents.push(event);
    if (scan) {
      scan.repeatPathHit = true;
    }
    return original(cpu);
  });

  wrapBlock(executor, makeKey(NEW_KEY_BLOCK), (original) => function wrappedNewKey(cpu) {
    const scan = trace.currentScan;
    const event = {
      scanId: scan?.id ?? null,
      step: cpu.stepCount,
      registers: captureRegisters(cpu),
      lastKey: mem[KEY_LAST_KEY_ADDR] & 0xFF,
      repeatCounter: mem[KEY_REPEAT_COUNTER_ADDR] & 0xFF,
    };
    trace.newKeyEvents.push(event);
    if (scan) {
      scan.newKeyHit = true;
    }
    return original(cpu);
  });

  wrapBlock(executor, makeKey(STORE_BLOCK), (original) => function wrappedStore(cpu) {
    const scan = trace.currentScan;
    const before = readKeyRam(mem);
    const result = original(cpu);
    const after = readKeyRam(mem);
    const event = {
      scanId: scan?.id ?? null,
      step: cpu.stepCount,
      result,
      registers: captureRegisters(cpu),
      before,
      after,
    };
    trace.storeEvents.push(event);
    if (scan) {
      scan.storeHits += 1;
    }
    return result;
  });

  wrapBlock(executor, makeKey(INC_H_BLOCK), (original) => function wrappedIncH(cpu) {
    const scan = trace.currentScan;
    const beforeH = cpu.h & 0xFF;
    const result = original(cpu);
    const afterH = cpu.h & 0xFF;
    const event = {
      scanId: scan?.id ?? null,
      step: cpu.stepCount,
      beforeH,
      afterH,
      result,
      l: cpu.l & 0xFF,
      e: cpu.e & 0xFF,
    };
    trace.incHEvents.push(event);
    if (scan) {
      scan.incH.push(event);
    }
    return result;
  });

  wrapBlock(executor, makeKey(ERROR_PATH_BLOCK), (original) => function wrappedError(cpu) {
    const scan = trace.currentScan;
    const event = {
      scanId: scan?.id ?? null,
      step: cpu.stepCount,
      before: readKeyRam(mem),
    };
    trace.errorEvents.push(event);
    if (scan) {
      scan.errorHit = true;
    }
    return original(cpu);
  });

  wrapBlock(executor, makeKey(MULTI_KEY_REJECT_BLOCK), (original) => function wrappedMultiKey(cpu) {
    const scan = trace.currentScan;
    const event = {
      scanId: scan?.id ?? null,
      step: cpu.stepCount,
      registers: captureRegisters(cpu),
    };
    trace.multiKeyEvents.push(event);
    if (scan) {
      scan.multiKeyHit = true;
    }
    return original(cpu);
  });
}

function runProbe(blocks, bootState) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const keyboardState = ensureKeyboardApi(peripherals);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace();

  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  prepareEventLoop(cpu, mem);

  resetKeyboard(peripherals, keyboardState);
  peripherals.setMatrixKey(1, 0, true);

  installTraceHooks(executor, mem, trace);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const addr = pc & 0xFFFFFF;
      const key = makeKey(addr, mode);
      trace.blockHits.set(key, (trace.blockHits.get(key) ?? 0) + 1);

      if (trace.currentScan && addr === GETCSC_LOOP_RETURN_BLOCK) {
        finalizeScan(trace, mem, step);
      }

      if (addr === SCAN_ENTRY) {
        if (trace.currentScan) {
          finalizeScan(trace, mem, step, 'unfinished');
        }
        startScan(trace, mem, cpu, step);
      }

      if (trace.currentScan) {
        noteScanBlock(trace, addr);
      }
    },
  });

  if (trace.currentScan) {
    finalizeScan(trace, mem, result.steps, 'unfinished');
  }

  return {
    result,
    trace,
    finalKeyRam: readKeyRam(mem),
    keyMatrix: Array.from(keyboardState.keyMatrix),
  };
}

function watchCount(trace, addr) {
  return trace.blockHits.get(makeKey(addr)) ?? 0;
}

function printBootSummary(bootState) {
  console.log('=== Boot Summary ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');
}

function printBootRam(bootState) {
  const ram = readKeyRam(bootState.memSnapshot);
  console.log('=== Post-Boot Key RAM ===');
  console.log(
    `status=0x${hexByte(ram.keyStatusFlags)} scan=0x${hexByte(ram.scanCode)} `
    + `last=0x${hexByte(ram.lastKey)} prev=0x${hexByte(ram.previousKey)} `
    + `repeat=0x${hexByte(ram.repeatCounter)} debounce=0x${hexByte(ram.debounceCounter)}`,
  );
  console.log('');
}

function printEventSummary(probe) {
  console.log('=== Event Loop Summary ===');
  console.log(
    `steps=${count(probe.result.steps)} termination=${probe.result.termination} `
    + `lastPc=${hex(probe.result.lastPc)} loopsForced=${count(probe.result.loopsForced)}`,
  );
  console.log(
    `ENTER matrix seed: keyMatrix[1]=0x${hexByte(probe.keyMatrix[1])} `
    + `(bit0 pressed=${yesNo((probe.keyMatrix[1] & 0x01) === 0)})`,
  );
  console.log('');
}

function printWatchedBlocks(trace) {
  console.log('=== Watched Blocks ===');
  console.log(`0x003C63 scan entry count: ${count(trace.scans.length)}`);
  console.log(
    `0x003C98 repeat-key JP reached: ${yesNo(trace.repeatPathEvents.length > 0)} `
    + `(block 0x003C96 count=${count(watchCount(trace, REPEAT_PATH_BLOCK))})`,
  );
  console.log(
    `0x003C9C new-key CALL reached: ${yesNo(trace.newKeyEvents.length > 0)} `
    + `(count=${count(watchCount(trace, NEW_KEY_BLOCK))})`,
  );
  console.log(
    `0x003D4B store reached: ${yesNo(trace.storeEvents.length > 0)} `
    + `(count=${count(trace.storeEvents.length)})`,
  );
  console.log(
    `0x003D2E INC H reached: ${yesNo(trace.incHEvents.length > 0)} `
    + `(count=${count(trace.incHEvents.length)})`,
  );
  console.log(
    `0x003CAF error path reached: ${yesNo(trace.errorEvents.length > 0)} `
    + `(count=${count(trace.errorEvents.length)})`,
  );
  console.log(
    `0x003D47 multi-key reject reached: ${yesNo(trace.multiKeyEvents.length > 0)} `
    + `(count=${count(trace.multiKeyEvents.length)})`,
  );
  console.log('');
}

function printFirstScanEntries(trace) {
  console.log('=== First 20 Scan Entries ===');
  if (trace.scans.length === 0) {
    console.log('(none)');
    console.log('');
    return;
  }
  for (const scan of trace.scans.slice(0, 20)) {
    const ram = scan.entryRam;
    console.log(
      `#${String(scan.id).padStart(3)} step=${String(scan.entryStep).padStart(7)} `
      + `scan=0x${hexByte(ram.scanCode)} last=0x${hexByte(ram.lastKey)} `
      + `prev=0x${hexByte(ram.previousKey)} repeat=0x${hexByte(ram.repeatCounter)} `
      + `debounce=0x${hexByte(ram.debounceCounter)} status=0x${hexByte(ram.keyStatusFlags)} `
      + `bit3=${yesNo((ram.keyStatusFlags & KEY_AVAILABLE_MASK) !== 0)} `
      + `A=0x${hexByte(scan.entryA)} F=0x${hexByte(scan.entryF)}`,
    );
  }
  console.log('');
}

function printRepeatCounterSummary(trace) {
  const entryValues = trace.scans.map((scan) => scan.entryRam.repeatCounter);
  const zeroEvents = trace.repeatGateEvents.filter((event) => event.after === 0);

  console.log('=== Repeat Counter ===');
  if (trace.scans.length === 0) {
    console.log('(no scan entries)');
    console.log('');
    return;
  }

  console.log(
    `Entry values (first 60 scans): ${entryValues.slice(0, 60).map((value) => hexByte(value)).join(', ')}`,
  );
  console.log(
    `Repeat gate 0x003C90 visited: ${count(trace.repeatGateEvents.length)} / ${count(trace.scans.length)} scans`,
  );
  console.log(`Reached zero inside 0x003C90: ${yesNo(zeroEvents.length > 0)}`);
  if (zeroEvents.length > 0) {
    console.log(
      `Zero-reaching scan IDs: ${zeroEvents.slice(0, 20).map((event) => event.scanId).join(', ')}`,
    );
  }

  if (trace.repeatGateEvents.length > 0) {
    console.log('First 60 repeat-gate transitions:');
    for (const event of trace.repeatGateEvents.slice(0, 60)) {
      const resultText = event.result === REPEAT_PATH_BLOCK
        ? 'repeat path'
        : event.result === GETCSC_LOOP_RETURN_BLOCK
          ? 'return to 0x003D67'
          : hex(event.result);
      console.log(
        `  scan #${String(event.scanId ?? 0).padStart(3)} step=${String(event.step).padStart(7)} `
        + `0x${hexByte(event.before)} -> 0x${hexByte(event.after)} result=${resultText}`,
      );
    }
  }
  console.log('');
}

function printPathSamples(trace) {
  console.log('=== Path Samples ===');

  if (trace.repeatPathEvents.length > 0) {
    console.log('Repeat-path hits (0x003C98 via block 0x003C96):');
    for (const event of trace.repeatPathEvents.slice(0, 10)) {
      console.log(
        `  scan #${String(event.scanId ?? 0).padStart(3)} step=${String(event.step).padStart(7)} `
        + `A=0x${hexByte(event.registers.a)} F=0x${hexByte(event.registers.f)} `
        + `HL=${hex(event.registers.hl)} repeat=0x${hexByte(event.repeatCounter)}`,
      );
    }
  } else {
    console.log('Repeat-path hits: none');
  }

  if (trace.newKeyEvents.length > 0) {
    console.log('New-key hits (0x003C9C):');
    for (const event of trace.newKeyEvents.slice(0, 10)) {
      console.log(
        `  scan #${String(event.scanId ?? 0).padStart(3)} step=${String(event.step).padStart(7)} `
        + `A=0x${hexByte(event.registers.a)} F=0x${hexByte(event.registers.f)} `
        + `HL=${hex(event.registers.hl)} last=0x${hexByte(event.lastKey)} `
        + `repeat=0x${hexByte(event.repeatCounter)}`,
      );
    }
  } else {
    console.log('New-key hits: none');
  }

  if (trace.storeEvents.length > 0) {
    console.log('Store hits (0x003D4B):');
    for (const event of trace.storeEvents.slice(0, 10)) {
      console.log(
        `  scan #${String(event.scanId ?? 0).padStart(3)} step=${String(event.step).padStart(7)} `
        + `A=0x${hexByte(event.registers.a)} scan 0x${hexByte(event.before.scanCode)}->0x${hexByte(event.after.scanCode)} `
        + `status 0x${hexByte(event.before.keyStatusFlags)}->0x${hexByte(event.after.keyStatusFlags)} `
        + `result=${hex(event.result)}`,
      );
    }
  } else {
    console.log('Store hits: none');
  }
  console.log('');
}

function printIncHSummary(trace) {
  const rejectingEvents = trace.incHEvents.filter((event) => event.result === MULTI_KEY_REJECT_BLOCK);

  console.log('=== 0x003D2E INC H Events ===');
  console.log(`Total INC H hits: ${count(trace.incHEvents.length)}`);
  console.log(`INC H -> 0x003D47 multi-key branch: ${count(rejectingEvents.length)}`);
  if (trace.incHEvents.length === 0) {
    console.log('(none)');
    console.log('');
    return;
  }
  for (const event of trace.incHEvents.slice(0, 40)) {
    const resultText = event.result === MULTI_KEY_REJECT_BLOCK ? '0x003D47 reject' : hex(event.result);
    console.log(
      `  scan #${String(event.scanId ?? 0).padStart(3)} step=${String(event.step).padStart(7)} `
      + `H 0x${hexByte(event.beforeH)}->0x${hexByte(event.afterH)} `
      + `L=0x${hexByte(event.l)} E=0x${hexByte(event.e)} result=${resultText}`,
    );
  }
  console.log('');
}

function printScanExitSummary(trace) {
  const exitCounts = new Map();
  for (const scan of trace.scans) {
    exitCounts.set(scan.exitDescription, (exitCounts.get(scan.exitDescription) ?? 0) + 1);
  }

  console.log('=== Scan Exits ===');
  if (trace.scans.length === 0) {
    console.log('(none)');
    console.log('');
    return;
  }

  for (const scan of trace.scans.slice(0, 20)) {
    const repeatTransition = scan.repeatGateTransitions.length > 0
      ? ` repeatGate=${scan.repeatGateTransitions.map((event) => `${hexByte(event.before)}->${hexByte(event.after)}`).join('|')}`
      : '';
    console.log(
      `#${String(scan.id).padStart(3)} exit=${scan.exitDescription} `
      + `lastBlock=${hex(scan.exitBlock ?? 0)}`
      + `${repeatTransition}`,
    );
  }

  console.log('Exit counts:');
  for (const [exitDescription, value] of [...exitCounts.entries()].sort((left, right) => right[1] - left[1])) {
    console.log(`  ${exitDescription}: ${count(value)}`);
  }
  console.log('');
}

function printFinalRam(probe) {
  const ram = probe.finalKeyRam;
  console.log('=== Final Key RAM ===');
  console.log(
    `status=0x${hexByte(ram.keyStatusFlags)} scan=0x${hexByte(ram.scanCode)} `
    + `last=0x${hexByte(ram.lastKey)} prev=0x${hexByte(ram.previousKey)} `
    + `repeat=0x${hexByte(ram.repeatCounter)} debounce=0x${hexByte(ram.debounceCounter)}`,
  );
  console.log('');
}

function buildDiagnosis(trace) {
  const topExit = [...trace.scans.reduce((map, scan) => {
    map.set(scan.exitDescription, (map.get(scan.exitDescription) ?? 0) + 1);
    return map;
  }, new Map()).entries()].sort((left, right) => right[1] - left[1])[0];

  if (trace.repeatGateEvents.length === 0) {
    return `0x003C90 never ran, so 0xD0058A never decremented. Most scans exited via ${topExit?.[0] ?? 'an earlier path'}.`;
  }

  if (trace.repeatPathEvents.length === 0) {
    if (trace.repeatGateEvents.some((event) => event.after === 0)) {
      return '0x003C90 did reach zero, but the 0x003C98 wrapper never fired. That would point to a block-boundary or instrumentation mismatch.';
    }
    return `0x003C90 did run and decrement the counter, but it never reached zero in this capture. Most scans exited via ${topExit?.[0] ?? 'other paths'} before a repeat store happened.`;
  }

  const firstRepeat = trace.repeatPathEvents[0];
  const repeatScan = trace.scans.find((scan) => scan.id === firstRepeat.scanId);
  return `0x003C90 does decrement to zero and does take the repeat path. The first 0x003C98 hit was scan #${firstRepeat.scanId} at step ${count(firstRepeat.step)}, exiting as "${repeatScan?.exitDescription ?? 'unknown'}".`;
}

function printDiagnosis(trace) {
  console.log('=== Diagnosis ===');
  console.log(buildDiagnosis(trace));
  console.log(
    `Total scan calls vs total stores: ${count(trace.scans.length)} vs ${count(trace.storeEvents.length)}`,
  );
  console.log('');
}

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

const bootState = runBootPhases(blocks, romBytes);
const probe = runProbe(blocks, bootState);

console.log('Phase 374: Repeat-key vs new-key path probe');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Transpiled: ${TRANSPILED_PATH}`);
console.log('');

printBootSummary(bootState);
printBootRam(bootState);
printEventSummary(probe);
printWatchedBlocks(probe.trace);
printFirstScanEntries(probe.trace);
printRepeatCounterSummary(probe.trace);
printPathSamples(probe.trace);
printIncHSummary(probe.trace);
printScanExitSummary(probe.trace);
printFinalRam(probe);
printDiagnosis(probe.trace);

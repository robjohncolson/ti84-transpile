#!/usr/bin/env node
// Phase 459: trace whether the event loop ever reaches GetCSC / KbdScan and the
// D141B5 gate after a single injected key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;
const MAX_LOOP_ITERATIONS = 5000;
const TRACE_STEPS = 500000;

const KEY_ENABLE_ADDR = 0xD14091;
const HOME_MODE_ADDR = 0xD177B7;
const EVENT_GATE_ADDR = 0xD177BA;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const RAW_KEY_ADDR = 0xD00587;
const RAW_KEY_MIRROR_ADDR = 0xD0058D;
const KEY_BUFFER_ADDR = 0xD141B5;

const INJECTED_SCAN_CODE = 0x91;

const KBDSCAN_PC = 0x03F994;
const GETCSC_ENTRY_PC = 0x03FA09;
const GETCSC_RANGE_START = 0x03FA09;
const GETCSC_RANGE_END = 0x03FC1B;
const D141B5_GATE_PC = 0x03FBC7;

const RECENT_PC_WINDOW = 12;
const RANGE_TRACE_LIMIT = 48;
const GATE_SNAPSHOT_LIMIT = 8;
const KEY_BUFFER_WRITE_LIMIT = 8;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });
  console.log(`  kernel: steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
  console.log(`  postInit: steps=${postInitResult.steps} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc)}`);

  let lastResult = postInitResult;
  for (let i = 0; i < STAGE_ENTRIES.length; i++) {
    const entry = STAGE_ENTRIES[i];
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    lastResult = executor.runFrom(entry, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
    });
    console.log(`  stage${i + 1}: entry=${hex(entry)} steps=${lastResult.steps} term=${lastResult.termination} lastPc=${hex(lastResult.lastPc)}`);
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl', lastStagePc: lastResult.lastPc };
}

function captureRegisterSnapshot(cpu, mem, step, pc, extra = {}) {
  return {
    step,
    pc,
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
    madl: cpu.madl & 0xFF,
    mbase: cpu.mbase & 0xFF,
    d00587: mem[RAW_KEY_ADDR] & 0xFF,
    d0058d: mem[RAW_KEY_MIRROR_ADDR] & 0xFF,
    d14091: mem[KEY_ENABLE_ADDR] & 0xFF,
    d141b5: mem[KEY_BUFFER_ADDR] & 0xFF,
    ...extra,
  };
}

function formatSnapshot(snapshot) {
  return [
    `step=${snapshot.step}`,
    `pc=${hex(snapshot.pc)}`,
    `A=${hex(snapshot.a, 2)}`,
    `F=${hex(snapshot.f, 2)}`,
    `BC=${hex(snapshot.bc)}`,
    `DE=${hex(snapshot.de)}`,
    `HL=${hex(snapshot.hl)}`,
    `IX=${hex(snapshot.ix)}`,
    `IY=${hex(snapshot.iy)}`,
    `SP=${hex(snapshot.sp)}`,
    `I=${hex(snapshot.i, 2)}`,
    `IM=${snapshot.im}`,
    `IFF1=${snapshot.iff1}`,
    `IFF2=${snapshot.iff2}`,
    `MADL=${snapshot.madl}`,
    `MBASE=${hex(snapshot.mbase, 2)}`,
    `D00587=${hex(snapshot.d00587, 2)}`,
    `D0058D=${hex(snapshot.d0058d, 2)}`,
    `D14091=${hex(snapshot.d14091, 2)}`,
    `D141B5=${hex(snapshot.d141b5, 2)}`,
  ].join(' ');
}

function formatTopVisits(pcVisits, limit = 20) {
  return [...pcVisits.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, limit);
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('--- phase 459: D141B5 trace probe ---');
  console.log('phase 1: boot to home screen');
  const bootState = bootToHomeScreen(executor, cpu, mem);

  console.log('phase 2: seed key-processing state');
  mem[KEY_ENABLE_ADDR] = 0x01;
  mem[HOME_MODE_ADDR] = 0x55;
  mem[EVENT_GATE_ADDR] = 0x00; // Retain the workflow probe gate seed so the event loop can dispatch normally.
  const d141b5Before = mem[KEY_BUFFER_ADDR] & 0xFF;
  console.log(`  D14091=${hex(mem[KEY_ENABLE_ADDR], 2)} (key processing enabled)`);
  console.log(`  D177B7=${hex(mem[HOME_MODE_ADDR], 2)} (home-screen mode)`);
  console.log(`  D177BA=${hex(mem[EVENT_GATE_ADDR], 2)} (workflow per-event gate seed)`);
  console.log(`  D141B5 before injection=${hex(d141b5Before, 2)}`);

  console.log('phase 3: inject one key and trace event loop');
  mem[RAW_KEY_ADDR] = INJECTED_SCAN_CODE;
  mem[RAW_KEY_MIRROR_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_AVAILABLE_FLAG_ADDR] = (mem[KEY_AVAILABLE_FLAG_ADDR] | KEY_AVAILABLE_FLAG_MASK) & 0xFF;
  console.log(`  D00587=${hex(mem[RAW_KEY_ADDR], 2)} D0058D=${hex(mem[RAW_KEY_MIRROR_ADDR], 2)} D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)}`);

  const pcVisits = new Map();
  const recentPcs = [];
  const getCscRangeTrace = [];
  const getCscRangeEntries = [];
  const gateSnapshots = [];
  const keyBufferWrites = [];

  let currentPc = bootState.lastPc;
  let currentStep = 0;
  let inGetCscRange = false;

  let getCscExactFirstStep = null;
  let getCscRangeFirstStep = null;
  let getCscRangeFirstPc = null;
  let getCscExactHits = 0;
  let getCscRangeHits = 0;
  let gateFirstStep = null;
  let gateHits = 0;
  let kbdScanFirstStep = null;
  let kbdScanHits = 0;

  const origWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    const normalizedAddr = addr & 0xFFFFFF;
    const normalizedValue = value & 0xFF;
    if (normalizedAddr === KEY_BUFFER_ADDR && keyBufferWrites.length < KEY_BUFFER_WRITE_LIMIT) {
      keyBufferWrites.push({
        ...captureRegisterSnapshot(cpu, mem, currentStep, currentPc, {
          writeValue: normalizedValue,
          previousValue: mem[KEY_BUFFER_ADDR] & 0xFF,
        }),
      });
    }
    return origWrite8(addr, value);
  };

  const traceResult = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    diHaltBypass: true,
    onBlock(pc, mode, meta, step) {
      const stepIndex = step + 1;
      currentPc = pc & 0xFFFFFF;
      currentStep = stepIndex;

      pcVisits.set(currentPc, (pcVisits.get(currentPc) || 0) + 1);
      recentPcs.push(currentPc);
      if (recentPcs.length > RECENT_PC_WINDOW) recentPcs.shift();

      const isInGetCscRange = currentPc >= GETCSC_RANGE_START && currentPc <= GETCSC_RANGE_END;
      if (isInGetCscRange) {
        getCscRangeHits++;
        if (getCscRangeFirstStep === null) {
          getCscRangeFirstStep = stepIndex;
          getCscRangeFirstPc = currentPc;
        }
        if (!inGetCscRange) {
          getCscRangeEntries.push({ step: stepIndex, pc: currentPc });
        }
        if (getCscRangeTrace.length < RANGE_TRACE_LIMIT) {
          const dasm = meta?.instructions?.[0]?.dasm ?? 'unknown';
          getCscRangeTrace.push({ step: stepIndex, pc: currentPc, dasm });
        }
      }
      inGetCscRange = isInGetCscRange;

      if (currentPc === GETCSC_ENTRY_PC) {
        getCscExactHits++;
        if (getCscExactFirstStep === null) {
          getCscExactFirstStep = stepIndex;
        }
      }

      if (currentPc === D141B5_GATE_PC) {
        gateHits++;
        if (gateFirstStep === null) {
          gateFirstStep = stepIndex;
        }
        if (gateSnapshots.length < GATE_SNAPSHOT_LIMIT) {
          gateSnapshots.push({
            ...captureRegisterSnapshot(cpu, mem, stepIndex, currentPc),
            recentTrail: [...recentPcs],
          });
        }
      }

      if (currentPc === KBDSCAN_PC) {
        kbdScanHits++;
        if (kbdScanFirstStep === null) {
          kbdScanFirstStep = stepIndex;
        }
      }
    },
  });

  cpu.write8 = origWrite8;

  console.log('phase 4: findings');
  console.log(`  run: steps=${traceResult.steps} term=${traceResult.termination} lastPc=${hex(traceResult.lastPc)} lastMode=${traceResult.lastMode} loopsForced=${traceResult.loopsForced}`);
  if (traceResult.error) {
    console.log(`  runtime error: ${traceResult.error.message ?? String(traceResult.error)}`);
  }
  if (traceResult.missingBlocks?.length) {
    console.log(`  missing blocks observed: ${traceResult.missingBlocks.length}`);
  }

  console.log(`  0x03FA09 exact entry reached: ${getCscExactFirstStep === null ? 'NO' : `YES at step ${getCscExactFirstStep} (hits=${getCscExactHits})`}`);
  console.log(`  0x03FA09-0x03FC1B range reached: ${getCscRangeFirstStep === null ? 'NO' : `YES at step ${getCscRangeFirstStep} via ${hex(getCscRangeFirstPc)} (hits=${getCscRangeHits})`}`);
  console.log(`  0x03FBC7 reached: ${gateFirstStep === null ? 'NO' : `YES at step ${gateFirstStep} (hits=${gateHits})`}`);
  console.log(`  0x03F994 reached: ${kbdScanFirstStep === null ? 'NO' : `YES at step ${kbdScanFirstStep} (hits=${kbdScanHits})`}`);
  console.log(`  final D141B5=${hex(mem[KEY_BUFFER_ADDR], 2)}`);
  console.log(`  final D14091=${hex(mem[KEY_ENABLE_ADDR], 2)}`);
  console.log(`  final D00587=${hex(mem[RAW_KEY_ADDR], 2)}`);
  console.log(`  final D0058D=${hex(mem[RAW_KEY_MIRROR_ADDR], 2)}`);
  console.log(`  final D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)}`);

  if (getCscRangeEntries.length > 0) {
    console.log('  range entry transitions:');
    for (const entry of getCscRangeEntries.slice(0, 12)) {
      console.log(`    step=${entry.step} pc=${hex(entry.pc)}`);
    }
  }

  if (getCscRangeTrace.length > 0) {
    console.log('  first PCs seen inside 0x03FA09-0x03FC1B:');
    for (const entry of getCscRangeTrace) {
      console.log(`    step=${entry.step} pc=${hex(entry.pc)} ${entry.dasm}`);
    }
  }

  if (keyBufferWrites.length > 0) {
    console.log('  observed writes to D141B5:');
    for (const entry of keyBufferWrites) {
      console.log(`    ${formatSnapshot(entry)} writeValue=${hex(entry.writeValue, 2)} previousValue=${hex(entry.previousValue, 2)}`);
    }
  } else {
    console.log('  observed writes to D141B5: none');
  }

  if (getCscExactFirstStep !== null && mem[KEY_BUFFER_ADDR] === 0x00) {
    console.log('  GetCSC was reached while D141B5 stayed 0x00. Gate-site snapshots:');
    if (gateSnapshots.length === 0) {
      console.log('    0x03FBC7 was never reached.');
    } else {
      for (const snapshot of gateSnapshots) {
        const trail = snapshot.recentTrail.map((pc) => hex(pc)).join(' -> ');
        console.log(`    ${formatSnapshot(snapshot)}`);
        console.log(`      trail=${trail}`);
      }
    }
  }

  console.log('  top 20 PCs by visit count:');
  for (const [pc, count] of formatTopVisits(pcVisits, 20)) {
    console.log(`    ${hex(pc)} x${count}`);
  }
}

main();

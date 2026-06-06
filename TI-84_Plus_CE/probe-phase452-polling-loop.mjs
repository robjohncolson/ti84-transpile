#!/usr/bin/env node

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
const GETCSC_ENTRY = 0x003D5A;
const GETCSC_RANGE_START = 0x003D5A;
const GETCSC_RANGE_END = 0x003D80;
const LOOP_SEED_PC = 0x003D67;
const LOOP_PC = 0x003D6B;
const LOOP_FALLTHROUGH_PC = 0x003D70;
const FASTPATH_PC = 0x003D75;
const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_GATE_ADDR = 0xD177BA;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_MODE_ADDR = 0xD177B7;
const ROM_PRECOPY_SRC = 0x000EBB;
const ROM_PRECOPY_DST = 0xD18C22;
const ROM_PRECOPY_LEN = 90;

const KEY_ONE = { label: '1', scan: 0x12 };
const CHUNK_STEPS = 1000;
const MAX_STEPS = 500000;
const MAX_LOOP_ITERATIONS = 10000;
const IO_HISTORY_LIMIT = 128;
const SNAPSHOT_IO_LIMIT = 10;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex2(value) {
  return hex(value, 2);
}

function signed8(value) {
  return value > 0x7F ? value - 0x100 : value;
}

function isHaltPc(pc) {
  return pc >= HALT_RANGE_START && pc <= HALT_RANGE_END;
}

function inGetCscRange(pc) {
  return pc >= GETCSC_RANGE_START && pc <= GETCSC_RANGE_END;
}

function incrementCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function pushRing(buffer, entry, limit) {
  buffer.push(entry);
  if (buffer.length > limit) {
    buffer.shift();
  }
}

function formatFlags(flags) {
  const bits = [
    ['S', 0x80],
    ['Z', 0x40],
    ['Y', 0x20],
    ['H', 0x10],
    ['X', 0x08],
    ['PV', 0x04],
    ['N', 0x02],
    ['C', 0x01],
  ];
  const setFlags = bits.filter(([, mask]) => (flags & mask) !== 0).map(([name]) => name);
  return `${hex2(flags)} [${setFlags.length ? setFlags.join(' ') : 'none'}]`;
}

function recentIoEntries(ioHistory, kind = null) {
  const filtered = kind ? ioHistory.filter((entry) => entry.kind === kind) : ioHistory;
  return filtered.slice(-SNAPSHOT_IO_LIMIT).map((entry) => ({ ...entry }));
}

function buildSnapshot(label, step, pc, cpu, mem, ioHistory) {
  return {
    label,
    step,
    pc,
    a: cpu.a & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    flags: cpu.f & 0xFF,
    d00080: mem[KEY_AVAILABLE_FLAG_ADDR] & 0xFF,
    d00587: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    recentReads: recentIoEntries(ioHistory, 'IN'),
    recentIo: recentIoEntries(ioHistory, null),
  };
}

function printSnapshot(snapshot) {
  console.log(
    `  ${snapshot.label}: step=${snapshot.step} pc=${hex(snapshot.pc)} `
      + `A=${hex2(snapshot.a)} BC=${hex(snapshot.bc)} DE=${hex(snapshot.de)} `
      + `HL=${hex(snapshot.hl)} SP=${hex(snapshot.sp)} flags=${formatFlags(snapshot.flags)}`,
  );
  console.log(
    `    D00080=${hex2(snapshot.d00080)} bit3=${(snapshot.d00080 & KEY_AVAILABLE_FLAG_MASK) !== 0 ? 1 : 0} `
      + `D00587=${hex2(snapshot.d00587)}`,
  );

  if (snapshot.recentReads.length === 0) {
    console.log('    recent port reads: none');
  } else {
    console.log('    recent port reads:');
    for (const entry of snapshot.recentReads) {
      console.log(
        `      step=${entry.step} pc=${hex(entry.pc)} IN ${hex(entry.port, 4)} => ${hex2(entry.value)}`,
      );
    }
  }
}

function printPcCounts(label, counts) {
  console.log(label);
  const entries = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  for (const [pc, count] of entries) {
    console.log(`  ${hex(pc)} count=${count}`);
  }
}

function printTopCounts(label, counts, width = 4, limit = 8) {
  console.log(label);
  const entries = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))
    .slice(0, limit);
  if (entries.length === 0) {
    console.log('  none');
    return;
  }
  for (const [key, count] of entries) {
    console.log(`  ${hex(key, width)} count=${count}`);
  }
}

function printHexDump(start, endExclusive, lineBytes = 8) {
  for (let addr = start; addr < endExclusive; addr += lineBytes) {
    const end = Math.min(addr + lineBytes, endExclusive);
    const bytes = [];
    for (let i = addr; i < end; i++) {
      bytes.push(romBytes[i].toString(16).toUpperCase().padStart(2, '0'));
    }
    console.log(`  ${addr.toString(16).toUpperCase().padStart(6, '0')}: ${bytes.join(' ')}`);
  }
}

function read16(addr) {
  return romBytes[addr] | (romBytes[addr + 1] << 8);
}

function read24(addr) {
  return romBytes[addr] | (romBytes[addr + 1] << 8) | (romBytes[addr + 2] << 16);
}

function disasmOne(addr) {
  let pos = addr;
  const start = pos;
  let prefix = null;

  const maybePrefix = romBytes[pos];
  const nextOp = romBytes[pos + 1];
  const immSizeOps = new Set([0x01, 0x21, 0x31, 0x3A, 0x32, 0xCD]);
  if ((maybePrefix === 0x40 || maybePrefix === 0x49 || maybePrefix === 0x52 || maybePrefix === 0x5B) && immSizeOps.has(nextOp)) {
    prefix = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' }[maybePrefix];
    pos++;
  }

  const op = romBytes[pos++];
  const immSize = prefix === '.SIS' || prefix === '.SIL' ? 2 : 3;
  const readImm = () => {
    const value = immSize === 2 ? read16(pos) : read24(pos);
    pos += immSize;
    return value;
  };
  const formatImm = (value) => hex(value, immSize === 2 ? 4 : 6);
  let mnemonic = `DB ${hex2(op)}`;

  if (op === 0xFD) {
    const subOp = romBytes[pos++];
    if (subOp === 0xCB) {
      const displacement = romBytes[pos++];
      const cb = romBytes[pos++];
      const bit = (cb >> 3) & 0x07;
      const group = (cb >> 6) & 0x03;
      if (group === 1) {
        mnemonic = `BIT ${bit}, (IY+${hex2(displacement)})`;
      } else if (group === 2) {
        mnemonic = `RES ${bit}, (IY+${hex2(displacement)})`;
      } else if (group === 3) {
        mnemonic = `SET ${bit}, (IY+${hex2(displacement)})`;
      } else {
        mnemonic = `CB ${hex2(cb)} on (IY+${hex2(displacement)})`;
      }
    } else {
      mnemonic = `FD ${hex2(subOp)}`;
    }
  } else {
    switch (op) {
      case 0x00:
        mnemonic = 'NOP';
        break;
      case 0x01: {
        const value = readImm();
        mnemonic = `LD BC, ${formatImm(value)}`;
        break;
      }
      case 0x06:
        mnemonic = `LD B, ${hex2(romBytes[pos++])}`;
        break;
      case 0x0B:
        mnemonic = 'DEC BC';
        break;
      case 0x10: {
        const offset = signed8(romBytes[pos++]);
        mnemonic = `DJNZ ${hex((pos + offset) & 0xFFFFFF)}`;
        break;
      }
      case 0x20: {
        const offset = signed8(romBytes[pos++]);
        mnemonic = `JR NZ, ${hex((pos + offset) & 0xFFFFFF)}`;
        break;
      }
      case 0x21: {
        const value = readImm();
        mnemonic = `LD HL, ${formatImm(value)}`;
        break;
      }
      case 0x31: {
        const value = readImm();
        mnemonic = `LD SP, ${formatImm(value)}`;
        break;
      }
      case 0x32: {
        const value = readImm();
        mnemonic = `LD (${formatImm(value)}), A`;
        break;
      }
      case 0x3A: {
        const value = readImm();
        mnemonic = `LD A, (${formatImm(value)})`;
        break;
      }
      case 0x47:
        mnemonic = 'LD B, A';
        break;
      case 0x78:
        mnemonic = 'LD A, B';
        break;
      case 0x79:
        mnemonic = 'LD A, C';
        break;
      case 0xAF:
        mnemonic = 'XOR A';
        break;
      case 0xB0:
        mnemonic = 'OR B';
        break;
      case 0xC1:
        mnemonic = 'POP BC';
        break;
      case 0xC5:
        mnemonic = 'PUSH BC';
        break;
      case 0xC9:
        mnemonic = 'RET';
        break;
      case 0xCD: {
        const value = readImm();
        mnemonic = `CALL ${formatImm(value)}`;
        break;
      }
      default:
        break;
    }
  }

  if (prefix) {
    mnemonic = `${prefix} ${mnemonic}`;
  }

  const rawBytes = [];
  for (let i = start; i < pos; i++) {
    rawBytes.push(romBytes[i].toString(16).toUpperCase().padStart(2, '0'));
  }

  return {
    addr: start,
    len: pos - start,
    rawBytes: rawBytes.join(' '),
    mnemonic,
  };
}

function disasmRange(start, endExclusive) {
  const lines = [];
  for (let pc = start; pc < endExclusive;) {
    const inst = disasmOne(pc);
    lines.push(inst);
    pc += Math.max(inst.len, 1);
  }
  return lines;
}

function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`  boot:     steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log(`  kernel:   steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log(`  postInit: steps=${postInitResult.steps} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc)}`);

  for (let index = 0; index < STAGE_ENTRIES.length; index++) {
    const entry = STAGE_ENTRIES[index];
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    const stageResult = executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
    console.log(`  stage${index + 1}:   entry=${hex(entry)} steps=${stageResult.steps} term=${stageResult.termination} lastPc=${hex(stageResult.lastPc)}`);
  }

  mem.copyWithin(ROM_PRECOPY_DST, ROM_PRECOPY_SRC, ROM_PRECOPY_SRC + ROM_PRECOPY_LEN);
  console.log(`  pre-copy: ROM ${hex(ROM_PRECOPY_SRC)}..${hex(ROM_PRECOPY_SRC + ROM_PRECOPY_LEN - 1)} -> RAM ${hex(ROM_PRECOPY_DST)}`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
}

function injectScanCode(mem, scanCode) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_SCAN_CODE_ADDR] = scanCode & 0xFF;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function main() {
  console.log('=== Phase 452 Polling Loop Probe ===');
  console.log();
  console.log('Static bytes: 0x003D60-0x003D80');
  printHexDump(0x003D60, 0x003D81);
  console.log();

  console.log('Static decode: 0x003D5A-0x003D85');
  const disassembly = disasmRange(GETCSC_ENTRY, 0x003D86);
  for (const entry of disassembly) {
    console.log(`  ${entry.addr.toString(16).toUpperCase().padStart(6, '0')}: ${entry.rawBytes.padEnd(20)} ${entry.mnemonic}`);
  }
  console.log();

  const loopOnly = disasmRange(LOOP_PC, LOOP_FALLTHROUGH_PC);
  const loopHasIo = loopOnly.some((entry) => /^IN\b|^OUT\b/.test(entry.mnemonic));
  console.log('Static verdict');
  console.log(`  delay seed block: ${hex(LOOP_SEED_PC)} -> ${disassembly.find((entry) => entry.addr === LOOP_SEED_PC)?.mnemonic ?? 'n/a'}`);
  console.log(`  loop body contains IN/OUT instructions: ${loopHasIo ? 'yes' : 'no'}`);
  console.log('  loop exit condition inside 0x003D6B..0x003D6E: BC must decrement to 0x000000');
  console.log();

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('Boot sequence');
  const bootState = bootToHomeScreen(executor, cpu, mem);
  console.log();

  mem[KEY_PROCESSING_ENABLE_ADDR] = 0x01;
  mem[DISPLAY_MODE_ADDR] = 0x55;
  mem[KEY_GATE_ADDR] = 0x00;
  injectScanCode(mem, KEY_ONE.scan);

  console.log('Runtime setup');
  console.log(`  resumePc=${hex(bootState.lastPc)} resumeMode=${bootState.lastMode}`);
  console.log(`  key=${KEY_ONE.label} scan=${hex2(KEY_ONE.scan)} injected into D00587 + D00080 bit 3`);
  console.log(`  ${hex(KEY_PROCESSING_ENABLE_ADDR)}=${hex2(mem[KEY_PROCESSING_ENABLE_ADDR])}`);
  console.log(`  ${hex(DISPLAY_MODE_ADDR)}=${hex2(mem[DISPLAY_MODE_ADDR])}`);
  console.log(`  ${hex(KEY_GATE_ADDR)}=${hex2(mem[KEY_GATE_ADDR])}`);
  console.log(`  hardware key matrix left idle; only the OS scan-code latch is injected`);
  console.log();

  const ioHistory = [];
  const portReadCounts = new Map();
  const portWriteCounts = new Map();
  const rangePcCounts = new Map();
  const chunkEndCounts = new Map();
  const snapshotLabels = new Set();
  const snapshots = [];

  let currentBlockPc = bootState.lastPc;
  let currentBlockStep = 0;
  let loopVisits = 0;
  let totalSteps = 0;
  let totalChunks = 0;
  let chunksEndingInRange = 0;
  let chunksEndingAtLoop = 0;
  let haltBypasses = 0;
  let loopsForcedTotal = 0;
  let finalResult = null;
  let currentPc = bootState.lastPc;
  let currentMode = bootState.lastMode ?? 'adl';
  let firstRangeSnapshot = null;
  let firstLoopSnapshot = null;
  let fallthroughTrace = null;
  let fallthroughRemaining = 0;

  function saveSnapshot(label, step, pc) {
    if (snapshotLabels.has(label)) {
      return;
    }
    snapshotLabels.add(label);
    snapshots.push(buildSnapshot(label, step, pc, cpu, mem, ioHistory));
  }

  cpu.onIoRead = (port, value) => {
    const normalizedPort = port & 0xFFFF;
    const normalizedValue = value & 0xFF;
    incrementCount(portReadCounts, normalizedPort);
    pushRing(ioHistory, {
      kind: 'IN',
      port: normalizedPort,
      value: normalizedValue,
      step: currentBlockStep,
      pc: currentBlockPc,
    }, IO_HISTORY_LIMIT);
  };

  cpu.onIoWrite = (port, value) => {
    const normalizedPort = port & 0xFFFF;
    const normalizedValue = value & 0xFF;
    incrementCount(portWriteCounts, normalizedPort);
    pushRing(ioHistory, {
      kind: 'OUT',
      port: normalizedPort,
      value: normalizedValue,
      step: currentBlockStep,
      pc: currentBlockPc,
    }, IO_HISTORY_LIMIT);
  };

  while (totalSteps < MAX_STEPS) {
    totalChunks++;
    const chunkBase = totalSteps;
    finalResult = executor.runFrom(currentPc, currentMode, {
      maxSteps: Math.min(CHUNK_STEPS, MAX_STEPS - totalSteps),
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock: (pc, _mode, _meta, steps) => {
        const normalizedPc = pc & 0xFFFFFF;
        currentBlockPc = normalizedPc;
        currentBlockStep = chunkBase + steps;

        if (inGetCscRange(normalizedPc)) {
          incrementCount(rangePcCounts, normalizedPc);
          if (!firstRangeSnapshot) {
            firstRangeSnapshot = buildSnapshot('first_range', currentBlockStep, normalizedPc, cpu, mem, ioHistory);
          }
        }

        if (fallthroughRemaining > 0 && fallthroughTrace) {
          fallthroughTrace.push(buildSnapshot(`fallthrough_${fallthroughTrace.length}`, currentBlockStep, normalizedPc, cpu, mem, ioHistory));
          fallthroughRemaining--;
        }

        if (normalizedPc === LOOP_PC) {
          loopVisits++;
          if (!firstLoopSnapshot) {
            firstLoopSnapshot = buildSnapshot('first_loop', currentBlockStep, normalizedPc, cpu, mem, ioHistory);
          }

          const bcValue = cpu.bc & 0xFFFFFF;
          if (bcValue === 0x000800) saveSnapshot('loop_bc_0800', currentBlockStep, normalizedPc);
          if (bcValue === 0x0007FF) saveSnapshot('loop_bc_07FF', currentBlockStep, normalizedPc);
          if (bcValue === 0x000002) saveSnapshot('loop_bc_0002', currentBlockStep, normalizedPc);
          if (bcValue === 0x000001) {
            saveSnapshot('loop_bc_0001', currentBlockStep, normalizedPc);
            if (!fallthroughTrace) {
              fallthroughTrace = [buildSnapshot('fallthrough_0', currentBlockStep, normalizedPc, cpu, mem, ioHistory)];
              fallthroughRemaining = 4;
            }
          }
        }
      },
    });

    totalSteps += finalResult.steps ?? 0;
    loopsForcedTotal += finalResult.loopsForced ?? 0;

    currentPc = finalResult.lastPc ?? currentPc;
    currentMode = finalResult.lastMode ?? currentMode;

    incrementCount(chunkEndCounts, currentPc & 0xFFFFFF);
    if (inGetCscRange(currentPc)) chunksEndingInRange++;
    if ((currentPc & 0xFFFFFF) === LOOP_PC) chunksEndingAtLoop++;

    if (finalResult.termination === 'halt' && isHaltPc(currentPc & 0xFFFFFF)) {
      haltBypasses++;
      cpu.halted = false;
      cpu.iff1 = 1;
      cpu.iff2 = 1;
      cpu.madl = 1;
      cpu.pc = EVENT_LOOP_ENTRY;
      currentPc = EVENT_LOOP_ENTRY;
      currentMode = 'adl';
      continue;
    }

    if ((finalResult.steps ?? 0) === 0 || finalResult.termination !== 'max_steps') {
      break;
    }
  }

  cpu.onIoRead = () => {};
  cpu.onIoWrite = () => {};

  console.log('Dynamic summary');
  console.log(`  totalSteps=${totalSteps}`);
  console.log(`  totalChunks=${totalChunks}`);
  console.log(`  haltBypasses=${haltBypasses}`);
  console.log(`  loopsForced=${loopsForcedTotal}`);
  console.log(`  finalTermination=${finalResult?.termination ?? 'n/a'}`);
  console.log(`  finalPc=${hex(currentPc)} finalMode=${currentMode}`);
  console.log(`  chunksEndingInGetCSC=${chunksEndingInRange}`);
  console.log(`  chunksEndingAt003D6B=${chunksEndingAtLoop}`);
  console.log(`  visitsAt003D6B=${loopVisits}`);
  console.log(`  visitsAt003D67(re-arm seed)=${rangePcCounts.get(LOOP_SEED_PC) ?? 0}`);
  console.log(`  visitsAt003D70(loop fallthrough)=${rangePcCounts.get(LOOP_FALLTHROUGH_PC) ?? 0}`);
  console.log(`  visitsAt003D75(fast-path return)=${rangePcCounts.get(FASTPATH_PC) ?? 0}`);
  console.log();

  printPcCounts('GetCSC range visit counts', rangePcCounts);
  console.log();
  printTopCounts('Top chunk-ending PCs', chunkEndCounts, 6, 8);
  console.log();
  printTopCounts('Top port reads', portReadCounts, 4, 8);
  console.log();
  printTopCounts('Top port writes', portWriteCounts, 4, 8);
  console.log();

  console.log('Snapshots');
  if (firstRangeSnapshot) {
    printSnapshot(firstRangeSnapshot);
  }
  if (firstLoopSnapshot && firstLoopSnapshot !== firstRangeSnapshot) {
    printSnapshot(firstLoopSnapshot);
  }
  for (const snapshot of snapshots) {
    printSnapshot(snapshot);
  }
  console.log();

  console.log('Fallthrough trace after BC reaches 1');
  if (!fallthroughTrace) {
    console.log('  no BC=1 fallthrough trace captured within 500000 steps');
  } else {
    for (const snapshot of fallthroughTrace) {
      console.log(
        `  step=${snapshot.step} pc=${hex(snapshot.pc)} A=${hex2(snapshot.a)} `
          + `BC=${hex(snapshot.bc)} flags=${formatFlags(snapshot.flags)}`,
      );
    }
    console.log('  expected path: 0x003D6B -> 0x003D70 -> 0x003D71 -> 0x003D5C (until outer B expires) or 0x003D73 when outer B reaches 0');
  }
  console.log();

  console.log('Interpretation');
  console.log('  0x003D6B itself is only a countdown loop: DEC BC / LD A,C / OR B / JR NZ.');
  console.log('  The loop is not waiting on an IN instruction inside 0x003D6B; it exits only when BC hits zero.');
  console.log('  The loop is re-armed at 0x003D67 by LD BC, 0x000800 after each CALL 0x003C63 poll that still finds no key.');
  if (firstLoopSnapshot?.recentReads.some((entry) => entry.port === 0xA008 && entry.value === 0x00)) {
    console.log('  The first recent hardware read before the loop was IN 0xA008 => 0x00, so the keyboard quick-check reported "no key".');
    console.log('  That means the emulator must eventually return a non-zero value from port 0xA008 before _GetCSC will leave the re-poll path.');
  } else {
    console.log('  Recent port reads near the first loop entry should show whether 0xA008 stayed 0x00 or some other port value blocked the scan.');
  }
  console.log('  If 0xA008 becomes non-zero, the follow-up group read must also return non-zero on one of 0xA012..0xA01E for the scan routine to set bit 3 and send control to 0x003D75.');
}

main();

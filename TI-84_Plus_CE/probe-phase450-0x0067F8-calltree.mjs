#!/usr/bin/env node
// Phase 450 - Trace 0x0067F8 execution and map the call/return chain to 0xD18C22.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;

const REPORT_PATH = path.join(__dirname, 'phase450-0x0067F8-calltree-report.md');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;
const TARGET_ADDR = 0x0067F8;
const CRASH_PC = 0xD18C22;
const RETURN_SENTINEL = 0xFFFFFF;
const KEY_ONE = { idx: 4, bit: 1, label: '1', scan: 0x12 };

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((Number(value) || 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function read24(buffer, addr) {
  const base = addr >>> 0;
  return (
    (buffer[base] ?? 0) |
    ((buffer[base + 1] ?? 0) << 8) |
    ((buffer[base + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesHex(buffer, start, length = 8) {
  const base = start >>> 0;
  const end = Math.min(buffer.length, base + Math.max(0, length | 0));
  return Array.from(buffer.subarray(base, end), (value) => hexByte(value)).join(' ');
}

function vramHash(mem) {
  return createHash('sha256').update(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE)).digest('hex').slice(0, 12);
}

function pressKey(peripherals, key) {
  peripherals.keyboard.keyMatrix[key.idx] &= ~(1 << key.bit);
  peripherals.setKeyboardIRQ(true);
}

function releaseKey(peripherals, key) {
  peripherals.keyboard.keyMatrix[key.idx] |= (1 << key.bit);
  peripherals.setKeyboardIRQ(false);
}

function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  const stageResults = [];
  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    stageResults.push(executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 }));
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return {
    bootResult,
    kernelResult,
    postInitResult,
    stageResults,
  };
}

function bufferForPc(pc, mem) {
  return (pc >>> 0) < ROM_LIMIT ? romBytes : mem;
}

function regionForPc(pc) {
  return (pc >>> 0) < ROM_LIMIT ? 'ROM' : 'RAM';
}

function decodeAt(buffer, pc, mode = 'adl') {
  try {
    const inst = decodeInstruction(buffer, pc >>> 0, mode);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      value: buffer[pc >>> 0] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatDisp(value) {
  return value >= 0
    ? `+0x${value.toString(16).toUpperCase()}`
    : `-0x${(-value).toString(16).toUpperCase()}`;
}

function formatInstruction(inst) {
  if (!inst) return '<unknown>';

  switch (inst.tag) {
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm': return `LD (${String(inst.dest).toUpperCase()}), ${hex(inst.value, 2)}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-indexed': return `LD ${String(inst.pair).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ld-indexed-pair': return `LD (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ld-ixd-reg': return `LD (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixiy-indexed': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ld-indexed-ixiy': return `LD (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-pair': return `LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'retn': return 'RETN';
    case 'reti': return 'RETI';
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-ixd': return `INC (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'dec-ixd': return `DEC (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-ixd': return `${String(inst.op).toUpperCase()} (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'in0': return `IN0 ${String(inst.reg).toUpperCase()}, (${hex(inst.port, 2)})`;
    case 'in-reg': return `IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'cpl': return 'CPL';
    case 'ccf': return 'CCF';
    case 'scf': return 'SCF';
    case 'halt': return 'HALT';
    case 'nop': return 'NOP';
    case 'db': return `DB ${hex(inst.value, 2)}`;
    default: return inst.tag ?? '<unknown>';
  }
}

function describeBlock(pc, mem, mode = 'adl') {
  const buffer = bufferForPc(pc, mem);
  const inst = decodeAt(buffer, pc, mode);
  return {
    region: regionForPc(pc),
    bytes: bytesHex(buffer, pc, 8),
    text: formatInstruction(inst),
    instruction: inst,
  };
}

function describeExits(meta) {
  if (!meta?.exits?.length) return 'none';
  return meta.exits.map((exit) => {
    const targetText = typeof exit.target === 'number' ? hex(exit.target) : 'n/a';
    if (exit.target === undefined) return exit.type;
    return `${exit.type}->${targetText}`;
  }).join(', ');
}

function findTargetedExit(meta, targetPc, targetMode) {
  if (!meta?.exits) return null;

  const normalizedPc = targetPc >>> 0;
  const exactMatches = meta.exits.filter((exit) => (
    exit.target === normalizedPc &&
    (exit.targetMode === undefined || exit.targetMode === targetMode)
  ));
  const looseMatches = meta.exits.filter((exit) => exit.target === normalizedPc);
  const matches = exactMatches.length > 0 ? exactMatches : looseMatches;
  if (matches.length === 0) return null;

  const rank = {
    call: 0,
    'conditional-call': 0,
    jump: 1,
    'conditional-jump': 2,
    branch: 2,
    fallthrough: 3,
    'call-return': 4,
  };

  matches.sort((left, right) => (rank[left.type] ?? 99) - (rank[right.type] ?? 99));
  return matches[0];
}

function findCallReturnExit(meta) {
  return meta?.exits?.find((exit) => exit.type === 'call-return') ?? null;
}

function hasReturnExit(meta) {
  return Boolean(meta?.exits?.some((exit) => exit.type === 'return' || exit.type === 'return-conditional'));
}

function fallsThroughTo(meta, targetPc, targetMode) {
  const normalizedPc = targetPc >>> 0;
  return Boolean(meta?.exits?.some((exit) => (
    exit.type === 'fallthrough' &&
    exit.target === normalizedPc &&
    (exit.targetMode === undefined || exit.targetMode === targetMode)
  )));
}

function cloneFrames(frames) {
  return frames.map((frame, index) => ({
    kind: frame.kind,
    depth: index,
    callerPc: frame.callerPc ?? null,
    callerMode: frame.callerMode ?? null,
    entryPc: frame.entryPc,
    entryMode: frame.entryMode,
    returnAddr: frame.returnAddr,
    returnMode: frame.returnMode,
    enterStep: frame.enterStep,
  }));
}

function buildRootFrame() {
  return {
    kind: 'root',
    callerPc: null,
    callerMode: null,
    entryPc: EVENT_LOOP_ENTRY,
    entryMode: 'adl',
    returnAddr: RETURN_SENTINEL,
    returnMode: 'adl',
    enterStep: 0,
  };
}

function findMatchingFrameIndex(frameStack, targetPc, targetMode) {
  for (let index = frameStack.length - 1; index >= 1; index--) {
    const frame = frameStack[index];
    if (frame.returnAddr === (targetPc >>> 0) && frame.returnMode === targetMode) {
      return index;
    }
  }

  for (let index = frameStack.length - 1; index >= 1; index--) {
    const frame = frameStack[index];
    if (frame.returnAddr === (targetPc >>> 0)) {
      return index;
    }
  }

  return -1;
}

function applyTransition(previous, currentPc, currentMode, currentSp, currentTop, frameStack, mem, step, stackWarnings) {
  if (!previous) {
    return {
      kind: 'entry',
      exitType: 'entry',
      fromPc: null,
      fromMode: null,
      toPc: currentPc,
      toMode: currentMode,
      step,
    };
  }

  const exit = findTargetedExit(previous.meta, currentPc, currentMode);
  const tookReturn = hasReturnExit(previous.meta) && !fallsThroughTo(previous.meta, currentPc, currentMode);

  const base = {
    kind: exit?.type ?? (tookReturn ? 'return' : 'dynamic'),
    exitType: exit?.type ?? (tookReturn ? 'return' : 'dynamic'),
    fromPc: previous.pc,
    fromMode: previous.mode,
    toPc: currentPc,
    toMode: currentMode,
    step,
  };

  if (exit?.type === 'call' || exit?.type === 'conditional-call') {
    const callReturn = findCallReturnExit(previous.meta);
    const frame = {
      kind: 'call',
      callerPc: previous.pc,
      callerMode: previous.mode,
      entryPc: currentPc,
      entryMode: currentMode,
      returnAddr: callReturn?.target ?? currentTop,
      returnMode: callReturn?.targetMode ?? previous.mode,
      enterStep: step,
    };
    frameStack.push(frame);

    if (callReturn?.target !== undefined && callReturn.target !== currentTop) {
      stackWarnings.push({
        type: 'call-return-mismatch',
        step,
        callerPc: previous.pc,
        calleePc: currentPc,
        expectedReturnAddr: callReturn.target,
        actualReturnAddr: currentTop,
      });
    }

    return {
      ...base,
      kind: 'call',
      returnAddr: frame.returnAddr,
      returnMode: frame.returnMode,
      actualReturnAddr: currentTop,
    };
  }

  if (tookReturn) {
    const matchedIndex = findMatchingFrameIndex(frameStack, currentPc, currentMode);
    const discardedFrames = [];
    let matchedFrame = null;

    if (matchedIndex >= 1) {
      while (frameStack.length - 1 > matchedIndex) {
        discardedFrames.push(frameStack.pop());
      }
      matchedFrame = frameStack.pop();
      if (discardedFrames.length > 0) {
        stackWarnings.push({
          type: 'discarded-frames',
          step,
          fromPc: previous.pc,
          toPc: currentPc,
          discardedFrames: discardedFrames.map((frame) => ({
            entryPc: frame.entryPc,
            entryMode: frame.entryMode,
            returnAddr: frame.returnAddr,
            returnMode: frame.returnMode,
          })),
        });
      }
    } else if (frameStack.length > 1) {
      matchedFrame = frameStack.pop();
      stackWarnings.push({
        type: 'unmatched-return',
        step,
        fromPc: previous.pc,
        toPc: currentPc,
        poppedFrame: {
          entryPc: matchedFrame.entryPc,
          entryMode: matchedFrame.entryMode,
          returnAddr: matchedFrame.returnAddr,
          returnMode: matchedFrame.returnMode,
        },
      });
    }

    return {
      ...base,
      kind: 'return',
      matchedFrame,
      discardedFrames,
      poppedValueAddr: ((currentSp - 3) & 0xFFFFFF) >>> 0,
      poppedValue: read24(mem, ((currentSp - 3) & 0xFFFFFF) >>> 0),
    };
  }

  return base;
}

function transitionLabel(transition) {
  if (!transition) return 'n/a';
  if (transition.kind === 'entry') return 'entry';
  if (transition.kind === 'call') {
    return `call from ${hex(transition.fromPc)} ret ${hex(transition.returnAddr)}`;
  }
  if (transition.kind === 'return') {
    return `return from ${hex(transition.fromPc)}`;
  }
  if (transition.fromPc === null || transition.fromPc === undefined) return transition.kind;
  return `${transition.kind} from ${hex(transition.fromPc)}`;
}

function scanFunction(startPc) {
  const rows = [];
  const callSites = [];
  const uniqueTargets = new Set();
  let pc = startPc >>> 0;

  for (let index = 0; index < 128 && pc < ROM_LIMIT; index++) {
    const inst = decodeAt(romBytes, pc, 'adl');
    rows.push({
      pc,
      bytes: bytesHex(romBytes, pc, Math.max(4, Math.min(8, inst.length ?? 1))),
      text: formatInstruction(inst),
      tag: inst.tag,
      target: inst.target,
    });

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callSites.push({
        pc,
        target: inst.target >>> 0,
        bytes: bytesHex(romBytes, pc, Math.max(4, Math.min(8, inst.length ?? 1))),
        text: formatInstruction(inst),
      });
      uniqueTargets.add(inst.target >>> 0);
    }

    const nextPc = inst.nextPc ?? (pc + Math.max(inst.length ?? 1, 1));
    pc = nextPc >>> 0;

    if (inst.tag === 'ret' || inst.tag === 'ret-conditional' || inst.tag === 'retn' || inst.tag === 'reti' || inst.tag === 'jp' || inst.tag === 'jp-indirect') {
      break;
    }
  }

  return {
    rows,
    callSites,
    uniqueTargets: [...uniqueTargets],
  };
}

function collectFunctionEntries(uniqueBlocks, mem) {
  const entries = [];
  for (const pc of uniqueBlocks) {
    const buffer = bufferForPc(pc, mem);
    const b0 = buffer[pc >>> 0] ?? 0;
    const b1 = buffer[(pc >>> 0) + 1] ?? 0;
    if (!((b0 === 0xDD || b0 === 0xFD) && b1 === 0xE5)) continue;
    const info = describeBlock(pc, mem);
    entries.push({
      pc,
      region: info.region,
      bytes: info.bytes,
      text: info.text,
    });
  }
  return entries;
}

function summarizeCallEdges(records, startIndex, endIndex) {
  if (!startIndex || !endIndex || endIndex < startIndex) return [];

  const edges = new Map();
  for (const record of records) {
    if (record.index < startIndex || record.index > endIndex) continue;
    if (record.transition?.kind !== 'call') continue;
    const key = [
      record.transition.fromPc ?? -1,
      record.pc ?? -1,
      record.transition.returnAddr ?? -1,
    ].join('|');
    const existing = edges.get(key);
    if (existing) {
      existing.count++;
      existing.lastStep = record.step;
      continue;
    }
    edges.set(key, {
      fromPc: record.transition.fromPc ?? 0,
      toPc: record.pc,
      returnAddr: record.transition.returnAddr ?? 0,
      count: 1,
      firstStep: record.step,
      lastStep: record.step,
    });
  }

  return [...edges.values()].sort((left, right) => left.firstStep - right.firstStep);
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootSummary = bootToHomeScreen(executor, cpu, mem);

  mem[0xD14091] = 1;
  mem[0xD177B7] = 0x55;
  mem[0xD177BA] = 0;

  const vramBefore = vramHash(mem);

  const uniqueBlocks = [];
  const uniqueSeen = new Set();
  const trace = [];
  const stackWarnings = [];
  const frameStack = [buildRootFrame()];
  let previous = null;
  let callCount = 0;
  let returnCount = 0;
  let first0067F8 = null;
  let firstCrash = null;

  pressKey(peripherals, KEY_ONE);
  mem[0xD00587] = KEY_ONE.scan;
  mem[0xD00080] |= 0x08;

  const result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 5000,
    diHaltBypass: true,
    onBlock(pc, mode, meta, step) {
      const normalizedPc = pc >>> 0;
      const normalizedMode = mode ?? 'adl';

      if (!uniqueSeen.has(normalizedPc)) {
        uniqueSeen.add(normalizedPc);
        uniqueBlocks.push(normalizedPc);
      }

      const currentSp = cpu.sp & 0xFFFFFF;
      const currentTop = read24(mem, currentSp);
      const transition = applyTransition(previous, normalizedPc, normalizedMode, currentSp, currentTop, frameStack, mem, step + 1, stackWarnings);

      if (transition.kind === 'call') callCount++;
      if (transition.kind === 'return') returnCount++;

      const record = {
        index: trace.length + 1,
        step: step + 1,
        pc: normalizedPc,
        mode: normalizedMode,
        sp: currentSp,
        top: currentTop,
        transition,
      };
      trace.push(record);

      if (!first0067F8 && normalizedPc === TARGET_ADDR) {
        first0067F8 = { ...record, frames: cloneFrames(frameStack) };
      }
      if (!firstCrash && normalizedPc === CRASH_PC) {
        firstCrash = { ...record, frames: cloneFrames(frameStack) };
      }

      previous = { pc: normalizedPc, mode: normalizedMode, meta };
    },
  });

  releaseKey(peripherals, KEY_ONE);

  const vramAfter = vramHash(mem);
  const functionScan = scanFunction(TARGET_ADDR);
  const functionEntries = collectFunctionEntries(uniqueBlocks, mem);
  const crashSlice = firstCrash
    ? trace.slice(Math.max(0, firstCrash.index - 20), firstCrash.index)
    : trace.slice(Math.max(0, trace.length - 20));
  const callEdges = summarizeCallEdges(trace, first0067F8?.index ?? 0, firstCrash?.index ?? 0);

  const report = [];
  report.push('# Phase 450 - 0x0067F8 Call Tree');
  report.push('');
  report.push('Generated by `probe-phase450-0x0067F8-calltree.mjs`.');
  report.push('');
  report.push('## Setup');
  report.push('');
  report.push(`- Boot: \`${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${STAGE_ENTRIES.map((pc) => hex(pc)).join(', ')}\``);
  report.push(`- Gates: \`D14091=${hex(mem[0xD14091], 2)}\`, \`D177B7=${hex(mem[0xD177B7], 2)}\`, \`D177BA=${hex(mem[0xD177BA], 2)}\``);
  report.push(`- Injected key "${KEY_ONE.label}": \`scan=${hex(KEY_ONE.scan, 2)}\`, \`idx=${KEY_ONE.idx}\`, \`bit=${KEY_ONE.bit}\`, \`D00587=${hex(mem[0xD00587], 2)}\`, \`(IY+0) bit3 set\``);
  report.push(`- Event loop entry: \`${hex(EVENT_LOOP_ENTRY)}\`, \`maxSteps=200000\`, \`diHaltBypass=true\``);
  report.push('');
  report.push('## Execution Summary');
  report.push('');
  report.push(`- Steps: ${result.steps}`);
  report.push(`- Termination: ${result.termination}`);
  report.push(`- Last PC: ${hex(result.lastPc)}:${result.lastMode ?? 'adl'}`);
  report.push(`- Unique blocks observed: ${uniqueBlocks.length}`);
  report.push(`- Total block visits: ${trace.length}`);
  report.push(`- Observed CALL transitions: ${callCount}`);
  report.push(`- Observed RET transitions: ${returnCount}`);
  report.push(`- First 0x0067F8 visit: ${first0067F8 ? `step ${first0067F8.step}, trace#${first0067F8.index}` : 'not reached'}`);
  report.push(`- First 0xD18C22 visit: ${firstCrash ? `step ${firstCrash.step}, trace#${firstCrash.index}` : 'not reached'}`);
  report.push(`- VRAM hash before: \`${vramBefore}\``);
  report.push(`- VRAM hash after: \`${vramAfter}\``);
  report.push(`- VRAM changed: ${vramBefore !== vramAfter ? 'yes' : 'no'}`);
  report.push(`- Stack warnings captured: ${stackWarnings.length}`);
  report.push('');

  report.push('## Call Chain At First 0xD18C22 Hit');
  report.push('');
  if (!firstCrash) {
    report.push('- 0xD18C22 was not reached in this run.');
  } else {
    report.push(`- Incoming transition: ${transitionLabel(firstCrash.transition)}`);
    report.push(`- Stack pointer on entry: ${hex(firstCrash.sp)}`);
    report.push(`- Top-of-stack on entry: ${hex(firstCrash.top)}`);
    report.push(`- Crash block bytes: ${bytesHex(bufferForPc(firstCrash.pc, mem), firstCrash.pc, 8)} (${regionForPc(firstCrash.pc)})`);
    report.push('');
    for (const frame of firstCrash.frames) {
      if (frame.kind === 'root') {
        report.push(`- depth ${frame.depth}: root ${hex(frame.entryPc)}:${frame.entryMode}`);
        continue;
      }
      report.push(`- depth ${frame.depth}: ${hex(frame.callerPc)}:${frame.callerMode} -> ${hex(frame.entryPc)}:${frame.entryMode} return ${hex(frame.returnAddr)}:${frame.returnMode}`);
    }
  }
  report.push('');

  report.push('## Last 20 Blocks Before Crash');
  report.push('');
  report.push(firstCrash
    ? 'These are the last 20 dynamic block visits ending at the first observed `0xD18C22`.'
    : '0xD18C22 was not observed; this is the final 20-block tail of the run.');
  report.push('');
  report.push('| Trace# | Step | PC | Region | Bytes | Disassembly Guess | Incoming |');
  report.push('|--------|------|----|--------|-------|-------------------|----------|');
  for (const record of crashSlice) {
    const info = describeBlock(record.pc, mem, record.mode);
    report.push(`| ${record.index} | ${record.step} | ${hex(record.pc)} | ${info.region} | \`${info.bytes || 'n/a'}\` | ${info.text} | ${transitionLabel(record.transition)} |`);
  }
  report.push('');

  report.push('## Observed CALL Edges From First 0x0067F8 To First 0xD18C22');
  report.push('');
  if (!first0067F8 || !firstCrash) {
    report.push('- Could not compute the 0x0067F8 -> 0xD18C22 call-edge interval because one endpoint was not observed.');
  } else if (callEdges.length === 0) {
    report.push('- No CALL edges were observed in the interval.');
  } else {
    for (const edge of callEdges) {
      report.push(`- ${hex(edge.fromPc)} -> ${hex(edge.toPc)} (return ${hex(edge.returnAddr)}, count ${edge.count}, first step ${edge.firstStep})`);
    }
  }
  report.push('');

  report.push(`## All Unique Blocks (${uniqueBlocks.length} observed)`);
  report.push('');
  report.push('```text');
  for (const pc of uniqueBlocks) {
    report.push(hex(pc));
  }
  report.push('```');
  report.push('');

  report.push('## Function Entry Points');
  report.push('');
  if (functionEntries.length === 0) {
    report.push('- No visited blocks began with `PUSH IX` / `PUSH IY` prologues.');
  } else {
    report.push('| PC | Region | Bytes | Disassembly Guess |');
    report.push('|----|--------|-------|-------------------|');
    for (const entry of functionEntries) {
      report.push(`| ${hex(entry.pc)} | ${entry.region} | \`${entry.bytes}\` | ${entry.text} |`);
    }
  }
  report.push('');

  report.push('## CALL Targets From 0x0067F8');
  report.push('');
  if (functionScan.callSites.length === 0) {
    report.push('- No direct CALL instructions were decoded in the linear 0x0067F8 function body scan.');
  } else {
    report.push('| Call Site | Bytes | Instruction | Target |');
    report.push('|-----------|-------|-------------|--------|');
    for (const site of functionScan.callSites) {
      report.push(`| ${hex(site.pc)} | \`${site.bytes}\` | ${site.text} | ${hex(site.target)} |`);
    }
    report.push('');
    report.push('Unique direct targets:');
    for (const target of functionScan.uniqueTargets) {
      report.push(`- ${hex(target)}`);
    }
  }
  report.push('');

  report.push('## Notes');
  report.push('');
  report.push(`- Boot phase summaries: boot=${bootSummary.bootResult.termination}/${bootSummary.bootResult.steps}, kernel=${bootSummary.kernelResult.termination}/${bootSummary.kernelResult.steps}, postInit=${bootSummary.postInitResult.termination}/${bootSummary.postInitResult.steps}.`);
  report.push(`- Stage terminations: ${bootSummary.stageResults.map((entry, index) => `stage${index + 1}=${entry.termination}/${entry.steps}`).join(', ')}.`);
  report.push(`- The executor currently auto-trampolines missing RAM blocks; if 0xD18C22 is observed, the first hit still marks the original crash frontier even when execution continues afterward.`);
  report.push(`- Last block meta exits before 0xD18C22: ${previous?.meta ? describeExits(previous.meta) : 'n/a'}.`);
  report.push('');

  fs.writeFileSync(REPORT_PATH, report.join('\n'));
  console.log(`Report written to ${REPORT_PATH}`);
  console.log(`Unique blocks: ${uniqueBlocks.length}`);
  console.log(`First 0x0067F8: ${first0067F8 ? `step ${first0067F8.step}` : 'not reached'}`);
  console.log(`First 0xD18C22: ${firstCrash ? `step ${firstCrash.step}` : 'not reached'}`);
}

main();

#!/usr/bin/env node

/**
 * Phase 363: trace the exact SP corruption point during boot.
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase363-sp-corruption-trace.mjs
 *
 * This probe keeps the shared runtime untouched. It mirrors the usual boot
 * setup, but runs a local copy of the dispatch loop with per-instruction hooks
 * injected into lifted blocks so SP changes can be traced precisely.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const FLAG_C = 0x01;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 50000;

const RAM_THRESHOLD = 0xD00000;
const ROM_THRESHOLD = 0x400000;
const WINDOW_START = 2670;
const WINDOW_END = 2690;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hb(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function read24(buffer, addr) {
  const a = addr & 0xFFFFFF;
  const b0 = buffer[a] ?? 0;
  const b1 = buffer[(a + 1) & 0xFFFFFF] ?? 0;
  const b2 = buffer[(a + 2) & 0xFFFFFF] ?? 0;
  return b0 | (b1 << 8) | (b2 << 16);
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const hint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${hint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function decodeText(buffer, pc, mode) {
  try {
    const inst = decodeInstruction(buffer, pc & 0xFFFFFF, mode);
    if (!inst) {
      return 'unknown';
    }
    return inst.dasm ?? inst.mnemonic ?? inst.tag ?? 'unknown';
  } catch {
    return 'decode failed';
  }
}

function formatFlags(f) {
  const value = f & 0xFF;
  const bits = [
    ['S', 0x80],
    ['Z', 0x40],
    ['Y', 0x20],
    ['H', 0x10],
    ['X', 0x08],
    ['P', 0x04],
    ['N', 0x02],
    ['C', 0x01],
  ];
  return bits.map(([label, mask]) => ((value & mask) ? label : label.toLowerCase())).join('');
}

function snapshotRegisters(cpu, pc) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    pc: pc & 0xFFFFFF,
    mbase: cpu.mbase & 0xFF,
    madl: cpu.madl ? 1 : 0,
    flags: formatFlags(cpu.f),
  };
}

function formatRegisterLine(registers) {
  return `A=${hb(registers.a)} BC=${hex(registers.bc)} DE=${hex(registers.de)} HL=${hex(registers.hl)} `
    + `IX=${hex(registers.ix)} IY=${hex(registers.iy)} SP=${hex(registers.sp)} PC=${hex(registers.pc)} `
    + `MBASE=${hb(registers.mbase)} F=${hb(registers.f)}(${registers.flags}) MADL=${registers.madl}`;
}

function printRegisterDump(prefix, registers) {
  console.log(`${prefix}${formatRegisterLine(registers)}`);
}

function splitInstructionSegments(source) {
  const lines = source.replace(/\r/g, '').split('\n');
  const bodyEnd = lines.length > 0 && lines[lines.length - 1].trim() === '}'
    ? lines.length - 1
    : lines.length;
  const bodyLines = lines.slice(1, bodyEnd);
  const segments = [];
  let current = [];

  for (const line of bodyLines) {
    if (/^\s*\/\/ 0x[0-9a-fA-F]+/.test(line)) {
      if (current.length > 0) {
        segments.push(current);
      }
      current = [line];
      continue;
    }

    if (current.length > 0 || line.trim() !== '') {
      current.push(line);
    }
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

function instrumentInstructionSegment(lines, instruction, index, mode) {
  const hookCall = `hooks.afterInstruction(${instruction.pc >>> 0}, ${JSON.stringify(mode)}, ${JSON.stringify(instruction.dasm ?? instruction.tag ?? 'unknown')}, cpu);`;
  const out = [];
  let rewroteReturn = false;

  for (const line of lines) {
    const match = line.match(/^(\s*)return\b([\s\S]*);$/);
    if (!rewroteReturn && match) {
      const [, indent, expr] = match;
      out.push(`${indent}const __traceRet${index} =${expr};`);
      out.push(`${indent}${hookCall}`);
      out.push(`${indent}return __traceRet${index};`);
      rewroteReturn = true;
      continue;
    }

    out.push(line);
  }

  if (!rewroteReturn) {
    out.push(`  ${hookCall}`);
  }

  return out.join('\n');
}

function compileInstrumentedBlock(block, originalFn) {
  const instructions = Array.isArray(block?.instructions) ? block.instructions : [];
  const source = typeof block?.source === 'string' ? block.source : '';

  if (instructions.length === 0 || source.length === 0) {
    if (typeof originalFn !== 'function') {
      return null;
    }
    return function passthrough(cpu, hooks) {
      const result = originalFn(cpu);
      hooks.afterInstruction(block?.startPc ?? 0, block?.mode ?? 'adl', '[fallback block-end]', cpu);
      return result;
    };
  }

  const segments = splitInstructionSegments(source);
  if (segments.length < instructions.length) {
    if (typeof originalFn !== 'function') {
      return null;
    }
    const lastInstruction = instructions[instructions.length - 1];
    return function fallback(cpu, hooks) {
      const result = originalFn(cpu);
      hooks.afterInstruction(
        lastInstruction?.pc ?? block.startPc ?? 0,
        block.mode ?? 'adl',
        `[fallback block-end] ${lastInstruction?.dasm ?? lastInstruction?.tag ?? 'unknown'}`,
        cpu,
      );
      return result;
    };
  }

  const bodyParts = [];
  for (let index = 0; index < instructions.length; index += 1) {
    bodyParts.push(instrumentInstructionSegment(segments[index], instructions[index], index, block.mode ?? 'adl'));
  }
  for (let index = instructions.length; index < segments.length; index += 1) {
    bodyParts.push(segments[index].join('\n'));
  }

  return new Function('cpu', 'hooks', bodyParts.join('\n'));
}

function createRamTrampoline(blockPc) {
  return function ramTrampoline(cpu, hooks) {
    const sp = cpu.sp & 0xFFFFFF;
    const retAddr = read24(cpu.mem, sp);
    cpu.sp = (sp + 3) & 0xFFFFFF;
    hooks.afterInstruction(blockPc & 0xFFFFFF, 'adl', 'synthetic RAM trampoline RET', cpu);
    return retAddr;
  };
}

function createTraceTracker(memory) {
  const stepRecords = new Map();
  const missingBlocks = [];
  const spChanges = [];
  let current = null;
  let transition = null;

  function ensureWindowRecord(step) {
    if (step < WINDOW_START || step > WINDOW_END) {
      return null;
    }
    let record = stepRecords.get(step);
    if (!record) {
      record = { step, changes: [] };
      stepRecords.set(step, record);
    }
    return record;
  }

  function captureEvent(step, blockPc, blockMode, instrPc, instrMode, instruction, prevSp, newSp, cpu, synthetic = false) {
    return {
      step,
      blockPc: blockPc & 0xFFFFFF,
      blockMode,
      instrPc: instrPc & 0xFFFFFF,
      instrMode,
      instruction,
      prevSp: prevSp & 0xFFFFFF,
      newSp: newSp & 0xFFFFFF,
      regs: snapshotRegisters(cpu, instrPc & 0xFFFFFF),
      synthetic,
    };
  }

  function maybeSetTransition(event) {
    if (!transition && event.prevSp >= RAM_THRESHOLD && event.newSp < ROM_THRESHOLD) {
      transition = event;
    }
  }

  function enterBlock(step, blockPc, mode, meta, cpu) {
    const normalizedPc = blockPc & 0xFFFFFF;
    const normalizedMode = mode ?? 'adl';
    const entryInstruction = decodeText(memory, normalizedPc, normalizedMode);
    const entryRegs = snapshotRegisters(cpu, normalizedPc);

    current = {
      step,
      blockPc: normalizedPc,
      mode: normalizedMode,
      meta: meta ?? null,
      lastSp: entryRegs.sp,
      lastInstrPc: normalizedPc,
      lastInstruction: entryInstruction,
    };

    console.log(`step=${String(step).padStart(5)} block=${hex(normalizedPc)}:${normalizedMode} sp=${hex(entryRegs.sp)} entry=${entryInstruction}`);

    const record = ensureWindowRecord(step);
    if (record) {
      record.blockPc = normalizedPc;
      record.mode = normalizedMode;
      record.entryInstruction = entryInstruction;
      record.entry = entryRegs;
    }
  }

  function recordSpChange(instrPc, instrMode, instruction, cpu, beforeOverride = null) {
    if (!current) {
      return;
    }

    const prevSp = beforeOverride === null
      ? current.lastSp
      : (beforeOverride & 0xFFFFFF);
    const newSp = cpu.sp & 0xFFFFFF;
    const normalizedPc = instrPc & 0xFFFFFF;
    const normalizedMode = instrMode ?? current.mode;
    const decodedInstruction = decodeText(memory, normalizedPc, normalizedMode);
    const text = decodedInstruction === 'decode failed' ? instruction : decodedInstruction;

    current.lastInstrPc = normalizedPc;
    current.lastInstruction = text;

    if (prevSp === newSp) {
      return;
    }

    const event = captureEvent(
      current.step,
      current.blockPc,
      current.mode,
      normalizedPc,
      normalizedMode,
      text,
      prevSp,
      newSp,
      cpu,
      beforeOverride !== null,
    );

    current.lastSp = newSp;
    spChanges.push(event);

    console.log(`  SP change @ ${hex(event.instrPc)} ${event.instruction}: ${hex(event.prevSp)} -> ${hex(event.newSp)}`);
    if (event.prevSp >= RAM_THRESHOLD && event.newSp < ROM_THRESHOLD) {
      console.log('  *** RAM -> ROM SP transition detected ***');
      printRegisterDump('  ', event.regs);
    }

    const record = ensureWindowRecord(current.step);
    if (record) {
      record.changes.push(event);
    }

    maybeSetTransition(event);
  }

  function finishBlock(nextPc, nextMode, cpu) {
    if (!current) {
      return;
    }

    const exitSp = cpu.sp & 0xFFFFFF;
    if (exitSp !== current.lastSp) {
      const lastInstruction = current.meta?.instructions?.[current.meta.instructions.length - 1];
      const event = captureEvent(
        current.step,
        current.blockPc,
        current.mode,
        lastInstruction?.pc ?? current.lastInstrPc ?? current.blockPc,
        current.mode,
        `[block-exit fallback] ${lastInstruction?.dasm ?? current.lastInstruction ?? 'unknown'}`,
        current.lastSp,
        exitSp,
        cpu,
        true,
      );
      current.lastSp = exitSp;
      spChanges.push(event);
      console.log(`  SP change @ ${hex(event.instrPc)} ${event.instruction}: ${hex(event.prevSp)} -> ${hex(event.newSp)}`);
      const record = ensureWindowRecord(current.step);
      if (record) {
        record.changes.push(event);
      }
      maybeSetTransition(event);
    }

    const record = ensureWindowRecord(current.step);
    if (record) {
      record.exit = {
        nextPc,
        nextMode,
        regs: snapshotRegisters(cpu, current.lastInstrPc ?? current.blockPc),
      };
    }

    current = null;
  }

  function noteMissingBlock(step, blockPc, mode, cpu) {
    missingBlocks.push({
      step,
      pc: blockPc & 0xFFFFFF,
      mode: mode ?? 'adl',
      sp: cpu.sp & 0xFFFFFF,
    });
  }

  return {
    hooks: {
      afterInstruction(instrPc, instrMode, instruction, cpu) {
        recordSpChange(instrPc, instrMode, instruction, cpu);
      },
    },
    enterBlock,
    finishBlock,
    noteMissingBlock,
    recordSynthetic(instrPc, instrMode, instruction, beforeSp, cpu) {
      recordSpChange(instrPc, instrMode, instruction, cpu, beforeSp);
    },
    stepRecords,
    missingBlocks,
    spChanges,
    get transition() {
      return transition;
    },
  };
}

function createProbeRunner(executor, peripherals, tracker, maxSteps = BOOT_MAX_STEPS) {
  const cpu = executor.cpu;
  const originalCompiledBlocks = executor.compiledBlocks;
  const blockMeta = executor.blockMeta;
  const instrumentedBlocks = Object.create(null);

  function resolveNextMode(key, returnedPc, currentMode) {
    const meta = blockMeta[key];
    if (!meta || !meta.exits) {
      return currentMode;
    }

    for (const exit of meta.exits) {
      if (exit.target === returnedPc && exit.targetMode) {
        return exit.targetMode;
      }
    }

    return currentMode;
  }

  function getBlockFunction(key) {
    if (instrumentedBlocks[key]) {
      return instrumentedBlocks[key];
    }

    const meta = blockMeta[key];
    if (!meta) {
      return null;
    }

    const originalFn = originalCompiledBlocks[key];
    const instrumentedFn = compileInstrumentedBlock(meta, originalFn);
    if (instrumentedFn) {
      instrumentedBlocks[key] = instrumentedFn;
      return instrumentedFn;
    }

    return null;
  }

  return function run() {
    let pc = BOOT_ENTRY;
    let mode = BOOT_MODE;
    let steps = 0;
    let termination = 'max_steps';
    let loopsForced = 0;

    const blockVisits = new Map();
    const missingBlocks = new Set();
    const dynamicTargets = new Set();
    const recentKeys = [];
    const recentMax = 4;
    let loopHitCount = 0;

    while (steps < maxSteps) {
      cpu.madl = mode === 'adl' ? 1 : 0;
      cpu.pc = pc & 0xFFFFFF;

      const key = blockKey(pc, mode);
      if (recentKeys.includes(key)) {
        loopHitCount += 1;
      } else {
        loopHitCount = 0;
      }
      recentKeys.push(key);
      if (recentKeys.length > recentMax) {
        recentKeys.shift();
      }

      if (loopHitCount > MAX_LOOP_ITERATIONS) {
        const meta = blockMeta[key];
        const fallthrough = meta?.exits?.find((exit) => exit.type === 'fallthrough');
        if (fallthrough) {
          mode = fallthrough.targetMode ?? mode;
          pc = fallthrough.target;
          loopHitCount = 0;
          recentKeys.length = 0;
          loopsForced += 1;
          continue;
        }
        cpu.f |= FLAG_C;
        loopHitCount = 0;
        recentKeys.length = 0;
        loopsForced += 1;
      }

      let fn = getBlockFunction(key);
      if (!fn) {
        tracker.noteMissingBlock(steps + 1, pc, mode, cpu);
        missingBlocks.add(key);

        if (pc >= RAM_THRESHOLD) {
          fn = createRamTrampoline(pc);
          instrumentedBlocks[key] = fn;
          continue;
        }

        let skipped = false;
        for (let offset = 1; offset <= 16; offset += 1) {
          const tryPc = (pc + offset) & 0xFFFFFF;
          const tryKey = blockKey(tryPc, mode);
          if (originalCompiledBlocks[tryKey]) {
            pc = tryPc;
            skipped = true;
            break;
          }
        }

        if (!skipped) {
          termination = 'missing_block';
          break;
        }

        steps += 1;
        continue;
      }

      const meta = blockMeta[key];
      cpu._currentBlockPc = pc & 0xFFFFFF;
      tracker.enterBlock(steps + 1, pc, mode, meta, cpu);

      let result;
      try {
        result = fn(cpu, tracker.hooks);
      } catch (error) {
        tracker.finishBlock(null, mode, cpu);
        return {
          steps,
          lastPc: pc,
          lastMode: mode,
          halted: cpu.halted,
          termination: 'error',
          error,
          loopsForced,
          blockVisits: Object.fromEntries(blockVisits),
          dynamicTargets: [...dynamicTargets],
          missingBlocks: [...missingBlocks],
        };
      }

      steps += 1;
      blockVisits.set(key, (blockVisits.get(key) || 0) + 1);

      if (result === undefined || result === null) {
        tracker.finishBlock(result, mode, cpu);
        termination = 'no_return';
        break;
      }

      if (result < 0) {
        if (result === -1 && peripherals && peripherals.tick) {
          peripherals.tick();

          if (peripherals.hasPendingNMI()) {
            cpu.halted = false;
            const beforeSp = cpu.sp & 0xFFFFFF;
            const haltReturnPc = (pc + 1) & 0xFFFFFF;
            cpu.push(haltReturnPc);
            tracker.recordSynthetic(pc, mode, 'synthetic NMI push return address', beforeSp, cpu);
            cpu.iff2 = cpu.iff1;
            cpu.iff1 = 0;
            pc = 0x000066;
            mode = 'adl';
            peripherals.acknowledgeNMI();
            tracker.finishBlock(pc, mode, cpu);
            steps += 1;
            continue;
          }

          if (peripherals.hasPendingIRQ() && cpu.iff1) {
            cpu.halted = false;
            const beforeSp = cpu.sp & 0xFFFFFF;
            const haltReturnPc = (pc + 1) & 0xFFFFFF;
            cpu.push(haltReturnPc);
            tracker.recordSynthetic(pc, mode, 'synthetic IRQ push return address', beforeSp, cpu);
            cpu.iff1 = 0;
            cpu.iff2 = 0;
            pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : 0x000038;
            mode = 'adl';
            peripherals.acknowledgeIRQ();
            tracker.finishBlock(pc, mode, cpu);
            steps += 1;
            continue;
          }
        }

        tracker.finishBlock(result, mode, cpu);
        termination = result === -1 ? 'halt' : 'sleep';
        break;
      }

      if (peripherals && peripherals.tick) {
        peripherals.tick();

        if (peripherals.hasPendingNMI()) {
          const beforeSp = cpu.sp & 0xFFFFFF;
          cpu.push(result);
          tracker.recordSynthetic(pc, mode, 'synthetic NMI push return address', beforeSp, cpu);
          cpu.iff2 = cpu.iff1;
          cpu.iff1 = 0;
          pc = 0x000066;
          mode = 'adl';
          peripherals.acknowledgeNMI();
          tracker.finishBlock(pc, mode, cpu);
          steps += 1;
          continue;
        }

        if (peripherals.hasPendingIRQ() && cpu.iff1) {
          const beforeSp = cpu.sp & 0xFFFFFF;
          cpu.push(result);
          tracker.recordSynthetic(pc, mode, 'synthetic IRQ push return address', beforeSp, cpu);
          cpu.iff1 = 0;
          cpu.iff2 = 0;
          pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : 0x000038;
          mode = 'adl';
          peripherals.acknowledgeIRQ();
          tracker.finishBlock(pc, mode, cpu);
          steps += 1;
          continue;
        }
      }

      if (meta?.exits) {
        const isStaticExit = meta.exits.some((exit) => exit.target === result);
        if (!isStaticExit && typeof result === 'number' && result >= 0) {
          dynamicTargets.add(result);
        }
      }

      const nextMode = resolveNextMode(key, result, mode);
      tracker.finishBlock(result, nextMode, cpu);
      mode = nextMode;
      pc = result & 0xFFFFFF;
    }

    return {
      steps,
      lastPc: pc,
      lastMode: mode,
      halted: cpu.halted,
      termination,
      loopsForced,
      blockVisits: Object.fromEntries(blockVisits),
      dynamicTargets: [...dynamicTargets],
      missingBlocks: [...missingBlocks],
    };
  };
}

function formatNextPc(nextPc) {
  if (typeof nextPc !== 'number') {
    return String(nextPc);
  }
  if (nextPc < 0) {
    return `${nextPc}`;
  }
  return hex(nextPc & 0xFFFFFF);
}

function printWindowSummary(stepRecords) {
  console.log(`=== SP WINDOW ${WINDOW_START}-${WINDOW_END} ===`);
  for (let step = WINDOW_START; step <= WINDOW_END; step += 1) {
    const record = stepRecords.get(step);
    if (!record?.entry) {
      console.log(`step=${String(step).padStart(5)} not executed`);
      continue;
    }

    console.log(`step=${String(step).padStart(5)} block=${hex(record.blockPc)}:${record.mode} entry=${record.entryInstruction}`);
    printRegisterDump('  entry ', record.entry);

    for (const change of record.changes) {
      console.log(`  change ${hex(change.prevSp)} -> ${hex(change.newSp)} @ ${hex(change.instrPc)} ${change.instruction}`);
      printRegisterDump('    regs ', change.regs);
    }

    if (record.exit) {
      console.log(`  exit  next=${formatNextPc(record.exit.nextPc)}:${record.exit.nextMode ?? 'n/a'}`);
      printRegisterDump('    regs ', record.exit.regs);
    }
  }
  console.log('');
}

function printTransitionSummary(transition) {
  console.log('=== FIRST RAM -> ROM SP TRANSITION ===');
  if (!transition) {
    console.log('No SP transition from RAM space to ROM space was detected within 5000 steps.\n');
    return;
  }

  console.log(`step=${transition.step} block=${hex(transition.blockPc)}:${transition.blockMode}`);
  console.log(`instruction=${hex(transition.instrPc)} ${transition.instruction}`);
  console.log(`SP: ${hex(transition.prevSp)} -> ${hex(transition.newSp)}`);
  printRegisterDump('  regs ', transition.regs);
  console.log('');
  console.log(`SP corruption detected at step ${transition.step}, block ${hex(transition.blockPc)}, instruction: ${transition.instruction}`);
  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const tracker = createTraceTracker(mem);
  const run = createProbeRunner(executor, peripherals, tracker, BOOT_MAX_STEPS);

  console.log('Phase 363: Trace SP Corruption Origin');
  console.log('=====================================');
  console.log(`ROM:            ${ROM_PATH}`);
  console.log(`Transpiled ROM: ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:    entry=${hex(BOOT_ENTRY)} mode=${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} timerInterrupt=false`);
  console.log('');
  console.log('=== PER-BLOCK SP TRACE ===');

  const result = run();

  console.log('');
  console.log('=== BOOT SUMMARY ===');
  console.log(`termination=${result.termination} steps=${result.steps} last=${hex(result.lastPc)}:${result.lastMode} halted=${result.halted ? 'yes' : 'no'} loopsForced=${result.loopsForced}`);
  console.log(`missingBlocks=${result.missingBlocks.length} dynamicTargets=${result.dynamicTargets.length} spChanges=${tracker.spChanges.length}`);
  console.log('');

  printWindowSummary(tracker.stepRecords);
  printTransitionSummary(tracker.transition);

  if (tracker.missingBlocks.length > 0) {
    console.log('=== MISSING BLOCKS ===');
    for (const event of tracker.missingBlocks) {
      console.log(`step=${String(event.step).padStart(5)} pc=${hex(event.pc)}:${event.mode} sp=${hex(event.sp)}`);
    }
    console.log('');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}

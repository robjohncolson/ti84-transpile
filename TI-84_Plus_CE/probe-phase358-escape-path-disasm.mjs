#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const NMI_VECTOR = 0x000066;

const STATIC_START = 0x001EEB;
const STATIC_END = 0x001F30; // inclusive, 70 bytes total
const TRACE_START = 0x001E00;
const TRACE_END = 0x001F30; // inclusive

const BOOT_MAX_STEPS = 5000;
const TOTAL_STEP_BUDGET = 20000;
const MAX_WAKES = 256;
const MAX_LOOP_ITERATIONS = 50000;
const RESUME_SCAN_LIMIT = 64;
const MAX_RESUME_ATTEMPTS = 64;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function bytesAt(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, start + Math.max(length, 0)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
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

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function snapshotRegs(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    mbase: cpu.mbase & 0xFF,
    im: cpu.im,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    madl: cpu.madl,
    halted: cpu.halted,
  };
}

function printRegsInline(regs) {
  return [
    `A=${hex(regs.a, 2)}`,
    `F=${hex(regs.f, 2)}`,
    `BC=${hex(regs.bc)}`,
    `DE=${hex(regs.de)}`,
    `HL=${hex(regs.hl)}`,
    `IX=${hex(regs.ix)}`,
    `IY=${hex(regs.iy)}`,
    `SP=${hex(regs.sp)}`,
    `MB=${hex(regs.mbase, 2)}`,
    `IM=${regs.im}`,
    `IFF1=${regs.iff1}`,
    `IFF2=${regs.iff2}`,
    `MADL=${regs.madl}`,
  ].join(' ');
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ${text}` : text;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode failed)';
  }

  const ixd = (reg, displacement) => `(${reg.toUpperCase()}${signedDisp(displacement)})`;

  switch (inst.tag) {
    case 'nop': return withModePrefix(inst, 'NOP');
    case 'di': return withModePrefix(inst, 'DI');
    case 'ei': return withModePrefix(inst, 'EI');
    case 'halt': return withModePrefix(inst, 'HALT');
    case 'slp': return withModePrefix(inst, 'SLP');
    case 'ret': return withModePrefix(inst, 'RET');
    case 'retn': return withModePrefix(inst, 'RETN');
    case 'reti': return withModePrefix(inst, 'RETI');
    case 'ret-conditional': return withModePrefix(inst, `RET ${inst.condition.toUpperCase()}`);
    case 'call': return withModePrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'jp': return withModePrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withModePrefix(inst, `JP (${inst.indirectRegister.toUpperCase()})`);
    case 'jr': return withModePrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'djnz': return withModePrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'rst': return withModePrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push': return withModePrefix(inst, `PUSH ${inst.pair.toUpperCase()}`);
    case 'pop': return withModePrefix(inst, `POP ${inst.pair.toUpperCase()}`);
    case 'ld-reg-imm':
      return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`);
    case 'ld-ind-reg':
      return withModePrefix(inst, `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`);
    case 'ld-reg-mem':
      return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`);
    case 'ld-pair-imm': {
      const width = inst.value > 0xFFFF ? 6 : 4;
      return withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, ${hex(inst.value, width)}`);
    }
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`)
        : withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`);
    case 'ld-pair-ind':
      return withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`);
    case 'ld-ind-pair':
      return withModePrefix(inst, `LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`);
    case 'ld-sp-hl': return withModePrefix(inst, 'LD SP, HL');
    case 'ld-sp-pair': return withModePrefix(inst, `LD SP, ${inst.pair.toUpperCase()}`);
    case 'inc-reg': return withModePrefix(inst, `INC ${inst.reg.toUpperCase()}`);
    case 'dec-reg': return withModePrefix(inst, `DEC ${inst.reg.toUpperCase()}`);
    case 'inc-pair': return withModePrefix(inst, `INC ${inst.pair.toUpperCase()}`);
    case 'dec-pair': return withModePrefix(inst, `DEC ${inst.pair.toUpperCase()}`);
    case 'inc-ixd': return withModePrefix(inst, `INC ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'dec-ixd': return withModePrefix(inst, `DEC ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'add-pair': return withModePrefix(inst, `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'adc-pair': return withModePrefix(inst, `ADC HL, ${inst.src.toUpperCase()}`);
    case 'sbc-pair': return withModePrefix(inst, `SBC HL, ${inst.src.toUpperCase()}`);
    case 'alu-reg':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${inst.src.toUpperCase()}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`);
    case 'alu-imm':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${hex(inst.value, 2)}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`);
    case 'alu-ixd':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${ixd(inst.indexRegister, inst.displacement)}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'bit-test': return withModePrefix(inst, `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-test-ind':
      return withModePrefix(inst, `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'bit-set': return withModePrefix(inst, `SET ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-set-ind':
      return withModePrefix(inst, `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'bit-res': return withModePrefix(inst, `RES ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-res-ind':
      return withModePrefix(inst, `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'indexed-cb-bit':
      return withModePrefix(inst, `BIT ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withModePrefix(inst, `SET ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withModePrefix(inst, `RES ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-rotate':
      return withModePrefix(inst, `${inst.operation.toUpperCase()} ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'in0':
      return withModePrefix(inst, `IN0 ${inst.reg.toUpperCase()}, (${hex(inst.port, 2)})`);
    case 'out0':
      return withModePrefix(inst, `OUT0 (${hex(inst.port, 2)}), ${inst.reg.toUpperCase()}`);
    case 'in-reg':
      return withModePrefix(inst, `IN ${inst.reg.toUpperCase()}, (C)`);
    case 'out-reg':
      return withModePrefix(inst, `OUT (C), ${inst.reg.toUpperCase()}`);
    case 'in-imm':
      return withModePrefix(inst, `IN A, (${hex(inst.port, 2)})`);
    case 'out-imm':
      return withModePrefix(inst, `OUT (${hex(inst.port, 2)}), A`);
    case 'rra': return withModePrefix(inst, 'RRA');
    case 'rla': return withModePrefix(inst, 'RLA');
    case 'rlca': return withModePrefix(inst, 'RLCA');
    case 'rrca': return withModePrefix(inst, 'RRCA');
    case 'ccf': return withModePrefix(inst, 'CCF');
    case 'scf': return withModePrefix(inst, 'SCF');
    case 'cpl': return withModePrefix(inst, 'CPL');
    case 'daa': return withModePrefix(inst, 'DAA');
    case 'neg': return withModePrefix(inst, 'NEG');
    case 'exx': return withModePrefix(inst, 'EXX');
    case 'ex-af': return withModePrefix(inst, "EX AF, AF'");
    case 'ex-de-hl': return withModePrefix(inst, 'EX DE, HL');
    case 'ex-sp-hl': return withModePrefix(inst, 'EX (SP), HL');
    case 'rrd': return withModePrefix(inst, 'RRD');
    case 'rld': return withModePrefix(inst, 'RLD');
    case 'im': return withModePrefix(inst, `IM ${inst.value}`);
    case 'ld-mb-a': return withModePrefix(inst, 'LD MB, A');
    case 'ld-a-mb': return withModePrefix(inst, 'LD A, MB');
    case 'tst-reg': return withModePrefix(inst, `TST A, ${inst.reg.toUpperCase()}`);
    case 'tst-ind': return withModePrefix(inst, 'TST A, (HL)');
    case 'tst-imm': return withModePrefix(inst, `TST A, ${hex(inst.value, 2)}`);
    case 'tstio': return withModePrefix(inst, `TSTIO ${hex(inst.value, 2)}`);
    case 'lea':
      return withModePrefix(inst, `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${signedDisp(inst.displacement)}`);
    default: {
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['tag', 'length', 'pc', 'nextPc', 'mode', 'modePrefix', 'nextMode', 'terminates', 'fallthrough'].includes(key)) {
          continue;
        }
        if (value === undefined || value === null) {
          continue;
        }
        fields.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${value}`);
      }
      return withModePrefix(inst, fields.length > 0 ? `${inst.tag} ${fields.join(' ')}` : inst.tag);
    }
  }
}

function buildInstructionIndex(blockMeta, startPc, endPc) {
  const index = new Map();

  for (const meta of Object.values(blockMeta ?? {})) {
    if (!meta || meta.mode !== 'adl') {
      continue;
    }

    for (const instruction of meta.instructions ?? []) {
      if (instruction.pc < startPc || instruction.pc > endPc) {
        continue;
      }
      if (!index.has(instruction.pc)) {
        index.set(instruction.pc, {
          mnemonic: instruction.dasm ?? null,
          length: Math.max(1, instruction.length ?? 1),
        });
      }
    }
  }

  return index;
}

function disassembleRange(romBytes, instructionIndex, startPc, endPc) {
  const rows = [];
  let pc = startPc;

  while (pc <= endPc) {
    let decoded = null;
    let length = 1;
    let mnemonic = `DB ${hexByte(romBytes[pc] ?? 0)}`;

    try {
      decoded = decodeInstruction(romBytes, pc, 'adl');
      length = Math.max(1, decoded?.length ?? 1);
      mnemonic = instructionIndex.get(pc)?.mnemonic ?? formatInstruction(decoded);
    } catch (error) {
      mnemonic = `DB ${hexByte(romBytes[pc] ?? 0)} ; ${error.message}`;
    }

    rows.push({
      pc,
      length,
      bytes: bytesAt(romBytes, pc, length),
      mnemonic,
      decoded,
    });

    pc += length;
  }

  return rows;
}

function isPortIoTag(tag) {
  return ['in0', 'out0', 'in-reg', 'out-reg', 'in-imm', 'out-imm'].includes(tag);
}

function isBranchTag(tag) {
  return ['call', 'call-conditional', 'jp', 'jp-conditional', 'jp-indirect', 'jr', 'jr-conditional', 'djnz'].includes(tag);
}

function formatPortIoSummary(row) {
  const inst = row.decoded;
  if (!inst) {
    return `${hex(row.pc)}: ${row.mnemonic}`;
  }

  switch (inst.tag) {
    case 'in0':
      return `${hex(row.pc)}: IN0 ${inst.reg.toUpperCase()}, port ${hex(inst.port, 2)}`;
    case 'out0':
      return `${hex(row.pc)}: OUT0 port ${hex(inst.port, 2)}, ${inst.reg.toUpperCase()}`;
    case 'in-reg':
      return `${hex(row.pc)}: IN ${inst.reg.toUpperCase()}, (C)`;
    case 'out-reg':
      return `${hex(row.pc)}: OUT (C), ${inst.reg.toUpperCase()}`;
    case 'in-imm':
      return `${hex(row.pc)}: IN A, port ${hex(inst.port, 2)}`;
    case 'out-imm':
      return `${hex(row.pc)}: OUT port ${hex(inst.port, 2)}, A`;
    default:
      return `${hex(row.pc)}: ${row.mnemonic}`;
  }
}

function formatBranchSummary(row) {
  const inst = row.decoded;
  if (!inst) {
    return `${hex(row.pc)}: ${row.mnemonic}`;
  }

  switch (inst.tag) {
    case 'call':
      return `${hex(row.pc)}: CALL -> ${hex(inst.target)} (always)`;
    case 'call-conditional':
      return `${hex(row.pc)}: CALL ${inst.condition.toUpperCase()} -> ${hex(inst.target)} ; fallthrough ${hex(row.pc + row.length)}`;
    case 'jp':
      return `${hex(row.pc)}: JP -> ${hex(inst.target)} (always)`;
    case 'jp-conditional':
      return `${hex(row.pc)}: JP ${inst.condition.toUpperCase()} -> ${hex(inst.target)} ; fallthrough ${hex(row.pc + row.length)}`;
    case 'jp-indirect':
      return `${hex(row.pc)}: JP -> (${inst.indirectRegister.toUpperCase()})`;
    case 'jr':
      return `${hex(row.pc)}: JR -> ${hex(inst.target)} (always)`;
    case 'jr-conditional':
      return `${hex(row.pc)}: JR ${inst.condition.toUpperCase()} -> ${hex(inst.target)} ; fallthrough ${hex(row.pc + row.length)}`;
    case 'djnz':
      return `${hex(row.pc)}: DJNZ -> ${hex(inst.target)} ; fallthrough ${hex(row.pc + row.length)}`;
    default:
      return `${hex(row.pc)}: ${row.mnemonic}`;
  }
}

function syncCpuState(cpu, result) {
  const mode = result.lastMode ?? (cpu.madl ? 'adl' : 'z80');
  cpu.pc = (result.lastPc ?? cpu.pc ?? 0) & 0xFFFFFF;
  cpu.madl = mode === 'adl' ? 1 : 0;
  cpu.adl = cpu.madl === 1;
  return mode;
}

function buildBlockIndex(compiledBlocks) {
  const index = { adl: [], z80: [] };

  for (const key of Object.keys(compiledBlocks ?? {})) {
    const [pcText, mode = 'adl'] = key.split(':');
    const pc = Number.parseInt(pcText, 16);
    if (!Number.isInteger(pc) || !index[mode]) {
      continue;
    }
    index[mode].push(pc & 0xFFFFFF);
  }

  index.adl.sort((left, right) => left - right);
  index.z80.sort((left, right) => left - right);
  return index;
}

function findResumeTarget(compiledBlocks, blockIndex, pc, mode) {
  const normalizedPc = pc & 0xFFFFFF;
  const normalizedMode = mode ?? 'adl';

  for (let offset = 1; offset <= RESUME_SCAN_LIMIT; offset += 1) {
    const candidatePc = (normalizedPc + offset) & 0xFFFFFF;
    if (compiledBlocks[blockKey(candidatePc, normalizedMode)]) {
      return { pc: candidatePc, mode: normalizedMode };
    }
  }

  for (const candidatePc of blockIndex[normalizedMode] ?? []) {
    if (candidatePc > normalizedPc) {
      return { pc: candidatePc, mode: normalizedMode };
    }
  }

  return null;
}

function sortUniqueTraceBlocks(traceBlocks) {
  return [...traceBlocks.values()].sort((left, right) =>
    left.firstStep - right.firstStep || left.pc - right.pc || left.mode.localeCompare(right.mode)
  );
}

function createTraceLogger(cpu, traceBlocks, traceRows) {
  return function recordTraceBlock(pc, mode, meta, absoluteStep, phase, wake) {
    const key = blockKey(pc, mode);
    const regs = snapshotRegs(cpu);

    traceRows.push({
      step: absoluteStep,
      phase,
      wake,
      key,
      pc,
      mode,
      regs,
    });

    if (!traceBlocks.has(key)) {
      traceBlocks.set(key, {
        key,
        pc,
        mode,
        firstStep: absoluteStep,
        phase,
        wake,
        firstInstruction: meta?.instructions?.[0]?.dasm ?? null,
      });
    }
  };
}

function runDynamicTrace(blocks, romBytes) {
  const memory = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;
  const blockIndex = buildBlockIndex(executor.compiledBlocks ?? {});

  cpu.mem = memory;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const traceBlocks = new Map();
  const traceRows = [];
  const portEvents = [];
  const wakeHistory = [];
  const missingBlocks = [];

  let totalSteps = 0;
  let currentPhase = 'boot';
  let currentWake = null;
  let currentStep = 0;
  let currentBlockPc = BOOT_ENTRY;
  let currentBlockMode = BOOT_MODE;
  let traceActive = false;

  const recordTraceBlock = createTraceLogger(cpu, traceBlocks, traceRows);

  cpu.onIoRead = (port, value) => {
    if (!traceActive) {
      return;
    }
    portEvents.push({
      phase: currentPhase,
      wake: currentWake,
      step: currentStep,
      blockPc: currentBlockPc,
      blockMode: currentBlockMode,
      direction: 'IN',
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    });
  };

  cpu.onIoWrite = (port, value) => {
    if (!traceActive) {
      return;
    }
    portEvents.push({
      phase: currentPhase,
      wake: currentWake,
      step: currentStep,
      blockPc: currentBlockPc,
      blockMode: currentBlockMode,
      direction: 'OUT',
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    });
  };

  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: Math.min(BOOT_MAX_STEPS, TOTAL_STEP_BUDGET),
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pcValue, mode, meta, step) {
      const pc = pcValue & 0xFFFFFF;
      const normalizedMode = mode ?? BOOT_MODE;
      const absoluteStep = totalSteps + step + 1;

      currentPhase = 'boot';
      currentWake = null;
      currentStep = absoluteStep;
      currentBlockPc = pc;
      currentBlockMode = normalizedMode;
      traceActive = pc >= TRACE_START && pc <= TRACE_END;

      if (traceActive) {
        recordTraceBlock(pc, normalizedMode, meta, absoluteStep, 'boot', null);
      }
    },
    onMissingBlock(pcValue, mode, step) {
      missingBlocks.push({
        phase: 'boot',
        wake: null,
        step: totalSteps + step + 1,
        key: blockKey(pcValue & 0xFFFFFF, mode ?? BOOT_MODE),
      });
    },
  });

  totalSteps += Math.max(0, Number(bootResult.steps ?? 0));
  syncCpuState(cpu, bootResult);

  let stopReason = `boot:${bootResult.termination}`;

  if (bootResult.termination === 'halt') {
    for (let wakeNumber = 1; wakeNumber <= MAX_WAKES && totalSteps < TOTAL_STEP_BUDGET; wakeNumber += 1) {
      peripherals.triggerNMI();
      cpu.halted = false;

      let remaining = TOTAL_STEP_BUDGET - totalSteps;
      let resumeAttempts = 0;
      let wakeTermination = 'not_run';

      while (remaining > 0) {
        const segmentBase = totalSteps;

        const result = executor.runFrom(cpu.pc & 0xFFFFFF, cpu.madl ? 'adl' : 'z80', {
          maxSteps: remaining,
          maxLoopIterations: MAX_LOOP_ITERATIONS,
          onBlock(pcValue, mode, meta, step) {
            const pc = pcValue & 0xFFFFFF;
            const normalizedMode = mode ?? (cpu.madl ? 'adl' : 'z80');
            const absoluteStep = segmentBase + step + 1;

            currentPhase = `wake${wakeNumber}`;
            currentWake = wakeNumber;
            currentStep = absoluteStep;
            currentBlockPc = pc;
            currentBlockMode = normalizedMode;
            traceActive = pc >= TRACE_START && pc <= TRACE_END;

            if (traceActive) {
              recordTraceBlock(pc, normalizedMode, meta, absoluteStep, `wake${wakeNumber}`, wakeNumber);
            }
          },
          onMissingBlock(pcValue, mode, step) {
            missingBlocks.push({
              phase: `wake${wakeNumber}`,
              wake: wakeNumber,
              step: segmentBase + step + 1,
              key: blockKey(pcValue & 0xFFFFFF, mode ?? (cpu.madl ? 'adl' : 'z80')),
            });
          },
        });

        const used = Math.max(0, Number(result.steps ?? 0));
        totalSteps += used;
        remaining = TOTAL_STEP_BUDGET - totalSteps;
        syncCpuState(cpu, result);

        if (result.termination !== 'missing_block') {
          wakeTermination = remaining === 0 && result.termination === 'max_steps'
            ? 'step_budget_exhausted'
            : result.termination;
          break;
        }

        const resume = findResumeTarget(
          executor.compiledBlocks ?? {},
          blockIndex,
          cpu.pc,
          cpu.madl ? 'adl' : 'z80',
        );

        if (!resume || resumeAttempts >= MAX_RESUME_ATTEMPTS) {
          wakeTermination = 'missing_block';
          break;
        }

        cpu.halted = false;
        cpu.pc = resume.pc;
        cpu.madl = resume.mode === 'adl' ? 1 : 0;
        cpu.adl = cpu.madl === 1;
        resumeAttempts += 1;
      }

      wakeHistory.push({
        wake: wakeNumber,
        termination: wakeTermination,
        lastPc: cpu.pc & 0xFFFFFF,
        lastMode: cpu.madl ? 'adl' : 'z80',
        totalSteps,
      });

      stopReason = `wake${wakeNumber}:${wakeTermination}`;

      if (wakeTermination !== 'halt') {
        break;
      }
    }
  }

  if (totalSteps >= TOTAL_STEP_BUDGET && stopReason.endsWith(':halt')) {
    stopReason = 'step_budget_exhausted';
  }

  return {
    bootResult: {
      termination: bootResult.termination,
      steps: Math.max(0, Number(bootResult.steps ?? 0)),
      lastPc: (bootResult.lastPc ?? cpu.pc ?? 0) & 0xFFFFFF,
      lastMode: bootResult.lastMode ?? (cpu.madl ? 'adl' : 'z80'),
    },
    stopReason,
    totalSteps,
    traceBlocks,
    traceRows,
    portEvents,
    wakeHistory,
    missingBlocks,
    finalPc: cpu.pc & 0xFFFFFF,
    finalMode: cpu.madl ? 'adl' : 'z80',
  };
}

async function loadBlocks() {
  ensureTranspiledRom();
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const rawBlocks =
    transpiledModule.PRELIFTED_BLOCKS ??
    transpiledModule.default?.PRELIFTED_BLOCKS ??
    transpiledModule.default ??
    transpiledModule;
  const blocks = normalizeBlocks(rawBlocks);
  if (Object.keys(blocks).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
  }
  return blocks;
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regenerated = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const blocks = await loadBlocks();

  const memory = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  const instructionIndex = buildInstructionIndex(executor.blockMeta, STATIC_START, STATIC_END);
  const disassembly = disassembleRange(romBytes, instructionIndex, STATIC_START, STATIC_END);
  const ioRows = disassembly.filter((row) => isPortIoTag(row.decoded?.tag));
  const branchRows = disassembly.filter((row) => isBranchTag(row.decoded?.tag));
  const dynamicTrace = runDynamicTrace(blocks, romBytes);
  const uniqueTraceBlocks = sortUniqueTraceBlocks(dynamicTrace.traceBlocks);

  console.log('Phase 358: PLL Escape Path 0x001EEB-0x001F30');
  console.log('=============================================');
  console.log(`ROM:                 ${ROM_PATH}`);
  console.log(`Transpiled ROM:      ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Static range:        ${hex(STATIC_START)}..${hex(STATIC_END)} (${STATIC_END - STATIC_START + 1} bytes)`);
  console.log(`Dynamic trace range: ${hex(TRACE_START)}..${hex(TRACE_END)}`);
  console.log(`Boot trace budget:   ${TOTAL_STEP_BUDGET} steps total (${BOOT_MAX_STEPS} boot + NMI wakes from ${hex(NMI_VECTOR)})`);
  console.log(`Peripheral model:    createPeripheralBus({ timerInterrupt: false })`);
  console.log('');

  console.log('Static Disassembly');
  console.log('------------------');
  for (const row of disassembly) {
    console.log(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.mnemonic}`);
  }
  console.log('');

  console.log('Port I/O In 0x001EEB-0x001F30');
  console.log('------------------------------');
  if (ioRows.length === 0) {
    console.log('none');
  } else {
    for (const row of ioRows) {
      console.log(formatPortIoSummary(row));
    }
  }
  console.log('');

  console.log('CALL / JP / JR Targets');
  console.log('----------------------');
  if (branchRows.length === 0) {
    console.log('none');
  } else {
    for (const row of branchRows) {
      console.log(formatBranchSummary(row));
    }
  }
  console.log('');

  console.log('Dynamic Boot Trace Summary');
  console.log('--------------------------');
  console.log(`Initial boot:        ${dynamicTrace.bootResult.termination} after ${dynamicTrace.bootResult.steps} steps at ${hex(dynamicTrace.bootResult.lastPc)}:${dynamicTrace.bootResult.lastMode}`);
  console.log(`Trace stop reason:   ${dynamicTrace.stopReason}`);
  console.log(`Total steps:         ${dynamicTrace.totalSteps}`);
  console.log(`Final PC:            ${hex(dynamicTrace.finalPc)}:${dynamicTrace.finalMode}`);
  console.log(`Wakes executed:      ${dynamicTrace.wakeHistory.length}`);
  console.log(`Trace hits in range: ${dynamicTrace.traceRows.length}`);
  console.log(`Unique trace blocks: ${uniqueTraceBlocks.length}`);
  console.log(`Missing blocks:      ${dynamicTrace.missingBlocks.length}`);
  console.log('');

  console.log(`Unique Blocks Hit In ${hex(TRACE_START)}..${hex(TRACE_END)}`);
  console.log('-----------------------------------');
  if (uniqueTraceBlocks.length === 0) {
    console.log('none');
  } else {
    for (const block of uniqueTraceBlocks) {
      const detail = block.firstInstruction ? ` ${block.firstInstruction}` : '';
      console.log(
        `step=${String(block.firstStep).padStart(6)} ${block.key}${detail}`,
      );
    }
  }
  console.log('');

  console.log(`Block Entry Order + Register State In ${hex(TRACE_START)}..${hex(TRACE_END)}`);
  console.log('--------------------------------------------------------------');
  if (dynamicTrace.traceRows.length === 0) {
    console.log('none');
  } else {
    for (const row of dynamicTrace.traceRows) {
      console.log(
        `[${String(row.step).padStart(6)}] ${String(row.phase).padEnd(7)} ${hex(row.pc)}:${row.mode} ${printRegsInline(row.regs)}`,
      );
    }
  }
  console.log('');

  console.log('Port I/O While Executing Trace-Window Blocks');
  console.log('--------------------------------------------');
  if (dynamicTrace.portEvents.length === 0) {
    console.log('none');
  } else {
    for (const event of dynamicTrace.portEvents) {
      console.log(
        `[${String(event.step).padStart(6)}] ${String(event.phase).padEnd(7)} `
        + `${hex(event.blockPc)}:${event.blockMode} ${event.direction} `
        + `${hex(event.port, event.port > 0xFF ? 4 : 2)} `
        + `${event.direction === 'IN' ? '->' : '<-'} ${hex(event.value, 2)}`,
      );
    }
  }
  console.log('');

  if (dynamicTrace.wakeHistory.length > 0) {
    console.log('Wake History');
    console.log('------------');
    for (const wake of dynamicTrace.wakeHistory) {
      console.log(
        `wake=${String(wake.wake).padStart(3)} termination=${wake.termination.padEnd(22)} `
        + `last=${hex(wake.lastPc)}:${wake.lastMode} totalSteps=${wake.totalSteps}`,
      );
    }
    console.log('');
  }

  if (dynamicTrace.missingBlocks.length > 0) {
    console.log('Missing Block Encounters');
    console.log('------------------------');
    for (const miss of dynamicTrace.missingBlocks.slice(0, 20)) {
      console.log(
        `[${String(miss.step).padStart(6)}] ${String(miss.phase).padEnd(7)} ${miss.key}`,
      );
    }
    if (dynamicTrace.missingBlocks.length > 20) {
      console.log(`... and ${dynamicTrace.missingBlocks.length - 20} more`);
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

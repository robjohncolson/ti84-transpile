#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;

const STAGE_SEQUENCE = [
  { label: '0x0A2B72', entry: 0x0a2b72, maxSteps: 30000, maxLoopIterations: 500 },
  { label: '0x0A3301', entry: 0x0a3301, maxSteps: 30000, maxLoopIterations: 500 },
  { label: '0x0A29EC', entry: 0x0a29ec, maxSteps: 50000, maxLoopIterations: 500 },
  { label: '0x0A2854', entry: 0x0a2854, maxSteps: 50000, maxLoopIterations: 500 },
];

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const STACK_RESET = 0xd1a87b;
const IY_RESET = 0xd00080;
const DISPLAY_BUF_START = 0xd006c0;
const DISPLAY_BUF_END = 0xd007c3;
const DISPLAY_BUF_LEN = DISPLAY_BUF_END - DISPLAY_BUF_START + 1;
const PRINTABLE_MIN = 0x20;
const PRINTABLE_MAX = 0x7e;
const TOKEN_SCAN_START = 0x0a0000;
const TOKEN_SCAN_END = 0x0a3000;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function printableChar(value) {
  if (value >= PRINTABLE_MIN && value <= PRINTABLE_MAX) {
    return String.fromCharCode(value);
  }

  return '.';
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function clearScratchStack(mem, sp = STACK_RESET, size = 0x20) {
  mem.fill(0xff, sp, sp + size);
}

function resetStandaloneEntry(cpu, mem) {
  cpu.sp = STACK_RESET;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  clearScratchStack(mem, STACK_RESET);
}

function resetRenderCpu(cpu, mem, snapshot) {
  restoreCpu(cpu, snapshot);
  cpu.sp = STACK_RESET;
  cpu._iy = IY_RESET;
  cpu.mbase = 0xd0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  clearScratchStack(mem, STACK_RESET);
}

function instructionText(inst) {
  if (!inst) {
    return '<null>';
  }

  if (inst.dasm) {
    return inst.dasm;
  }

  if (inst.mnemonic) {
    return inst.mnemonic;
  }

  const pair = (inst.pair ?? '').toUpperCase();
  const reg = (inst.reg ?? '').toUpperCase();
  const src = (inst.src ?? '').toUpperCase();
  const dest = (inst.dest ?? '').toUpperCase();

  switch (inst.tag) {
    case 'ld-pair-imm':
      return `LD ${pair},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${pair},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${pair}`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${src}`;
    case 'ld-reg-mem':
      return `LD ${dest},(${hex(inst.addr)})`;
    case 'ld-reg-ind':
      return `LD ${dest},(${src})`;
    case 'ld-ind-reg':
      return `LD (${dest}),${src}`;
    case 'ld-reg-imm':
      return `LD ${dest},${hex(inst.value, 2)}`;
    case 'inc-pair':
      return `INC ${pair}`;
    case 'dec-pair':
      return `DEC ${pair}`;
    case 'inc-reg':
      return `INC ${reg}`;
    case 'dec-reg':
      return `DEC ${reg}`;
    case 'add-pair':
      return `ADD ${String(inst.dest ?? '').toUpperCase()},${String(inst.src ?? '').toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op ?? '').toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${String(inst.op ?? '').toUpperCase()} ${src}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition ?? '').toUpperCase()},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition ?? '').toUpperCase()},${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition ?? '').toUpperCase()},${hex(inst.target)}`;
    case 'push':
      return `PUSH ${pair}`;
    case 'pop':
      return `POP ${pair}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition ?? '').toUpperCase()}`;
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'ldi':
      return 'LDI';
    case 'ldd':
      return 'LDD';
    case 'cpi':
      return 'CPI';
    case 'cpir':
      return 'CPIR';
    case 'cpd':
      return 'CPD';
    case 'cpdr':
      return 'CPDR';
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    default:
      return inst.tag ?? '<unknown>';
  }
}

function safeDecodeInstruction(pc, mode = 'adl') {
  try {
    const inst = decodeInstruction(romBytes, pc, mode);
    if (!inst || !inst.length || inst.length <= 0) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function collectAlignedRows(targetPc, mode, beforeBytes = 10, afterBytes = 10) {
  const minStart = Math.max(0, targetPc - beforeBytes);
  const maxStart = targetPc;
  let bestStart = targetPc;

  for (let start = minStart; start <= maxStart; start += 1) {
    let pc = start;
    let hit = false;
    let valid = true;

    while (pc <= targetPc + afterBytes) {
      const inst = safeDecodeInstruction(pc, mode);
      if (!inst) {
        valid = false;
        break;
      }

      if (pc === targetPc) {
        hit = true;
        break;
      }

      if (pc > targetPc) {
        break;
      }

      pc = inst.nextPc;
    }

    if (valid && hit) {
      bestStart = start;
      break;
    }
  }

  const rows = [];
  let pc = bestStart;
  const hardEnd = Math.min(romBytes.length, targetPc + afterBytes + 8);

  while (pc < hardEnd) {
    const inst = safeDecodeInstruction(pc, mode);
    if (!inst) {
      rows.push({
        pc,
        bytes: romBytes.subarray(pc, pc + 1),
        text: '<decode-error>',
        isTarget: pc === targetPc,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      bytes: romBytes.subarray(pc, pc + inst.length),
      text: instructionText(inst),
      isTarget: pc === targetPc,
      inst,
    });

    pc = inst.nextPc;

    if (pc > targetPc + afterBytes && rows.some((row) => row.isTarget)) {
      break;
    }
  }

  return rows.filter((row) => row.pc >= minStart && row.pc <= targetPc + afterBytes);
}

function printDisassemblyRows(rows, indent = '  ') {
  for (const row of rows) {
    const marker = row.isTarget ? ' << target' : '';
    console.log(`${indent}${hex(row.pc)}: ${formatBytes(row.bytes).padEnd(20)} ${row.text}${marker}`);
  }
}

function installDisplayWriteTrap(cpu) {
  const writes = [];
  let currentStage = 'boot';
  let currentPc = null;
  let currentStep = 0;

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function record(addr, value) {
    const maskedAddr = addr & 0xffffff;
    const byteValue = value & 0xff;

    if (maskedAddr < DISPLAY_BUF_START || maskedAddr > DISPLAY_BUF_END) {
      return;
    }

    if (byteValue < PRINTABLE_MIN || byteValue > PRINTABLE_MAX) {
      return;
    }

    writes.push({
      stage: currentStage,
      step: currentStep,
      pc: currentPc,
      addr: maskedAddr,
      value: byteValue,
    });
  }

  cpu.write8 = (addr, value) => {
    record(addr, value);
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    record(addr, value);
    record(addr + 1, value >> 8);
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    record(addr, value);
    record(addr + 1, value >> 8);
    record(addr + 2, value >> 16);
    return originalWrite24(addr, value);
  };

  return {
    writes,
    setContext(stage, step, pc) {
      currentStage = stage;
      currentStep = step;
      currentPc = pc;
    },
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function initializeEnvironment() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, ROM_LIMIT)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  resetStandaloneEntry(cpu, mem);
  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xd0;
  cpu._iy = IY_RESET;
  resetStandaloneEntry(cpu, mem);
  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });

  return {
    mem,
    cpu,
    executor,
    boot,
    kernelInit,
    postInit,
    renderSnapshot: snapshotCpu(cpu),
  };
}

function runInvestigationA() {
  console.log('=== Investigation A: Dynamic Write Trace During Full Boot + Rendering ===');

  const env = initializeEnvironment();
  const { mem, cpu, executor, boot, kernelInit, postInit, renderSnapshot } = env;
  const hook = installDisplayWriteTrap(cpu);
  const stageResults = [];

  console.log(`Boot       : steps=${boot.steps} term=${boot.termination} lastPc=${hex(boot.lastPc)}`);
  console.log(`Kernel init: steps=${kernelInit.steps} term=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)}`);
  console.log(`Post-init  : steps=${postInit.steps} term=${postInit.termination} lastPc=${hex(postInit.lastPc)}`);
  console.log(`Display buf: ${hex(DISPLAY_BUF_START)}-${hex(DISPLAY_BUF_END)} (${DISPLAY_BUF_LEN} bytes)`);
  console.log('');

  for (const stage of STAGE_SEQUENCE) {
    resetRenderCpu(cpu, mem, renderSnapshot);
    hook.setContext(stage.label, 0, stage.entry);

    const result = executor.runFrom(stage.entry, 'adl', {
      maxSteps: stage.maxSteps,
      maxLoopIterations: stage.maxLoopIterations,
      onBlock(pc, mode, meta, steps) {
        hook.setContext(stage.label, steps + 1, pc);
      },
    });

    stageResults.push({
      ...stage,
      result,
    });
  }

  hook.restore();

  for (const stage of stageResults) {
    console.log(
      `${stage.label}: steps=${stage.result.steps} term=${stage.result.termination} lastPc=${hex(stage.result.lastPc)}`,
    );
  }

  console.log('');

  if (hook.writes.length === 0) {
    console.log('NO PRINTABLE WRITES TO DISPLAY BUFFER');
    console.log('');
    return {
      boot,
      kernelInit,
      postInit,
      stageResults,
      writes: [],
      hasClearWriter: false,
    };
  }

  console.log('Trapped printable writes:');
  for (const write of hook.writes) {
    console.log(
      `  stage=${write.stage} step=${write.step} pc=${hex(write.pc)} addr=${hex(write.addr)} `
      + `value=${hex(write.value, 2)} (${JSON.stringify(printableChar(write.value))})`,
    );
  }

  const uniqueWriterPcs = [...new Set(hook.writes.map((write) => write.pc).filter((pc) => pc !== null))];

  console.log('');
  console.log(`Unique writer PCs: ${uniqueWriterPcs.map((pc) => hex(pc)).join(', ') || 'none'}`);
  console.log('');

  return {
    boot,
    kernelInit,
    postInit,
    stageResults,
    writes: hook.writes,
    hasClearWriter: uniqueWriterPcs.length > 0,
  };
}

function findPatternHits(bytes, needle, start, endExclusive) {
  const hits = [];
  const lastStart = Math.max(start, endExclusive - needle.length);

  for (let index = start; index <= lastStart; index += 1) {
    let matched = true;

    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      hits.push(index);
    }
  }

  return hits;
}

function findNearbyLdir(instrAddr, instrLength) {
  const windowStart = instrAddr + instrLength;
  const windowEnd = Math.min(ROM_LIMIT, windowStart + 20);

  for (let pc = windowStart; pc + 1 < windowEnd; pc += 1) {
    if (romBytes[pc] === 0xed && romBytes[pc + 1] === 0xb0) {
      return pc;
    }
  }

  return null;
}

function runInvestigationB() {
  console.log('=== Investigation B: Static ROM Scan for D006C0 / LDIR Patterns ===');

  const operandPattern = [0xc0, 0x06, 0xd0];
  const rawHits = findPatternHits(romBytes, operandPattern, 0, ROM_LIMIT);
  const matches = [];
  const unmatchedHits = [];

  for (const hit of rawHits) {
    let match = null;

    if (hit >= 1 && romBytes[hit - 1] === 0x11) {
      match = {
        hitAddr: hit,
        instrAddr: hit - 1,
        instrLength: 4,
        target: 'DE',
        sourceKind: 'immediate',
        opcode: '11 C0 06 D0',
        note: 'LD DE,0xD006C0',
      };
    } else if (hit >= 1 && romBytes[hit - 1] === 0x21) {
      match = {
        hitAddr: hit,
        instrAddr: hit - 1,
        instrLength: 4,
        target: 'HL',
        sourceKind: 'immediate',
        opcode: '21 C0 06 D0',
        note: 'LD HL,0xD006C0',
      };
    } else if (hit >= 2 && romBytes[hit - 2] === 0xed && romBytes[hit - 1] === 0x5b) {
      match = {
        hitAddr: hit,
        instrAddr: hit - 2,
        instrLength: 5,
        target: 'DE',
        sourceKind: 'memory',
        opcode: 'ED 5B C0 06 D0',
        note: 'LD DE,(0xD006C0)',
      };
    } else if (hit >= 2 && romBytes[hit - 2] === 0xed && romBytes[hit - 1] === 0x6b) {
      match = {
        hitAddr: hit,
        instrAddr: hit - 2,
        instrLength: 5,
        target: 'HL',
        sourceKind: 'memory',
        opcode: 'ED 6B C0 06 D0',
        note: 'LD HL,(0xD006C0)',
      };
    }

    if (!match) {
      unmatchedHits.push(hit);
      continue;
    }

    const ldirAddr = findNearbyLdir(match.instrAddr, match.instrLength);
    let classification = 'OTHER';

    if (match.sourceKind === 'immediate' && match.target === 'DE' && ldirAddr !== null) {
      classification = 'WRITE candidate';
    } else if (match.sourceKind === 'immediate' && match.target === 'HL' && ldirAddr !== null) {
      classification = 'READ candidate';
    } else if (ldirAddr !== null) {
      classification = 'LDIR nearby, but operand is indirect';
    }

    matches.push({
      ...match,
      ldirAddr,
      classification,
    });
  }

  console.log(`Raw 3-byte hits for C0 06 D0: ${rawHits.length}`);
  console.log(`Opcode-wrapped matches       : ${matches.length}`);
  console.log(`Non-opcode raw hits          : ${unmatchedHits.length}`);
  console.log('');

  if (matches.length === 0) {
    console.log('No LD DE/HL pattern matches found.');
    console.log('');
    return {
      rawHits,
      matches,
      unmatchedHits,
      promisingCandidates: [],
    };
  }

  for (const match of matches) {
    const ldirText = match.ldirAddr === null ? 'none within +20 bytes' : hex(match.ldirAddr);
    console.log(
      `${hex(match.instrAddr)}  target=${match.target.padEnd(2)}  kind=${match.sourceKind.padEnd(9)} `
      + `opcode=${match.opcode.padEnd(14)} ldir=${ldirText.padEnd(10)} ${match.classification}`,
    );
  }

  console.log('');

  const promisingCandidates = matches.filter((match) =>
    match.classification === 'WRITE candidate' || match.classification === 'READ candidate',
  );

  if (promisingCandidates.length === 0) {
    console.log('Promising LDIR candidates: none');
    console.log('');
    return {
      rawHits,
      matches,
      unmatchedHits,
      promisingCandidates,
    };
  }

  console.log('Promising LDIR candidates:');
  for (const candidate of promisingCandidates) {
    console.log(
      `  ${hex(candidate.instrAddr)} ${candidate.note} -> LDIR at ${hex(candidate.ldirAddr)} `
      + `(${candidate.classification})`,
    );
  }

  console.log('');

  return {
    rawHits,
    matches,
    unmatchedHits,
    promisingCandidates,
  };
}

function runInvestigationC() {
  console.log('=== Investigation C: Token-to-ASCII Scan Near 0x0Axxxx ===');

  const hits = [];

  for (let pc = TOKEN_SCAN_START; pc + 1 < TOKEN_SCAN_END; pc += 1) {
    if (romBytes[pc] !== 0xfe || romBytes[pc + 1] !== 0xfa) {
      continue;
    }

    const rows = collectAlignedRows(pc, 'adl', 10, 10);
    const backwardBranch = rows.some((row) =>
      row.inst
      && (row.inst.tag === 'jr' || row.inst.tag === 'jr-conditional' || row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional')
      && typeof row.inst.target === 'number'
      && row.inst.target < row.pc,
    );
    const loadAFromPointer = rows.some((row) =>
      row.inst
      && row.inst.tag === 'ld-reg-ind'
      && row.inst.dest === 'a'
      && ['hl', 'de', 'ix', 'iy'].includes(row.inst.src),
    );
    const classification = loadAFromPointer && backwardBranch
      ? 'loop-like conversion context'
      : loadAFromPointer
        ? 'pointer-read boundary check'
        : 'boundary check without obvious loop';

    hits.push({
      pc,
      rows,
      classification,
    });
  }

  console.log(`FE FA hits in ${hex(TOKEN_SCAN_START)}-${hex(TOKEN_SCAN_END)}: ${hits.length}`);
  console.log('');

  if (hits.length === 0) {
    console.log('No CP 0xFA boundary checks found in the requested region.');
    console.log('');
    return {
      hits,
    };
  }

  for (const hit of hits) {
    console.log(`${hex(hit.pc)}  ${hit.classification}`);
    printDisassemblyRows(hit.rows, '  ');
    console.log('');
  }

  return {
    hits,
  };
}

function chooseVerdict(phaseA, phaseB) {
  if (phaseA.writes.length > 0 && phaseA.hasClearWriter) {
    return 'POPULATOR_FOUND';
  }

  if (phaseB.promisingCandidates.length > 0) {
    return 'CANDIDATES_IDENTIFIED';
  }

  return 'NO_NATURAL_POPULATOR';
}

async function main() {
  console.log('Phase 178 - Real Text Populator Hunt');
  console.log('');

  const phaseA = runInvestigationA();
  const phaseB = runInvestigationB();
  const phaseC = runInvestigationC();

  const verdict = chooseVerdict(phaseA, phaseB, phaseC);

  console.log(`VERDICT: ${verdict}`);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}

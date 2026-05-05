#!/usr/bin/env node
/**
 * probe-phase192-stat-lddr-successor.mjs
 *
 * 1. Statically disassemble the ROM bytes after the 0x092263 LDDR block.
 * 2. Cold-boot the runtime, run MemInit, then trace STAT context entry 4
 *    with a higher step limit so the seeded 0x092265 successor can be
 *    observed when the transpiled ROM is regenerated.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'ROM.transpiled.report.json');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);
const REPORT = readTranspilationReport();

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const ENTRY_ADDR = 0x058BA9;
const TARGET_BLOCK = 0x092263;
const SUCCESSOR_START = 0x092265;
const SUCCESSOR_END = 0x092280;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE192_STAT_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CONTEXT_ENTRY_MAX_STEPS = 3000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const RAM_WATCH_START = 0xD00000;
const RAM_WATCH_END = 0xD02000;

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function readTranspilationReport() {
  try {
    return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function bytesAt(addr, length) {
  return Array.from(
    romBytes.subarray(addr, Math.min(addr + length, romBytes.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function buildDasm(decoded) {
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const indexed = (reg, displacement) => `(${reg}${disp(displacement)})`;

  switch (decoded.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'cpl': return 'cpl';
    case 'daa': return 'daa';
    case 'neg': return 'neg';
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'rrd': return 'rrd';
    case 'rld': return 'rld';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'stmix': return 'stmix';
    case 'rsmix': return 'rsmix';
    case 'slp': return 'slp';
    case 'otimr': return 'otimr';
    case 'ini': return 'ini';
    case 'ind': return 'ind';
    case 'outi': return 'outi';
    case 'outd': return 'outd';
    case 'inir': return 'inir';
    case 'indr': return 'indr';
    case 'otir': return 'otir';
    case 'otdr': return 'otdr';

    case 'ld-reg-reg': return `ld ${decoded.dest}, ${decoded.src}`;
    case 'ld-reg-imm': return `ld ${decoded.dest}, ${hex(decoded.value, 2)}`;
    case 'ld-reg-ind': return `ld ${decoded.dest}, (${decoded.src})`;
    case 'ld-ind-reg': return `ld (${decoded.dest}), ${decoded.src}`;
    case 'ld-reg-mem': return `ld ${decoded.dest}, (${hex(decoded.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(decoded.addr)}), ${decoded.src}`;
    case 'ld-pair-imm': return `ld ${decoded.pair}, ${hex(decoded.value)}`;
    case 'ld-pair-mem':
      return decoded.direction === 'to-mem'
        ? `ld (${hex(decoded.addr)}), ${decoded.pair}`
        : `ld ${decoded.pair}, (${hex(decoded.addr)})`;
    case 'ld-mem-pair': return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
    case 'ld-ind-imm': return `ld (hl), ${hex(decoded.value, 2)}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-pair': return `ld sp, ${decoded.pair}`;
    case 'ld-special': return `ld ${decoded.dest}, ${decoded.src}`;
    case 'ld-pair-ind': return `ld ${decoded.pair}, (${decoded.src})`;
    case 'ld-ind-pair': return `ld (${decoded.dest}), ${decoded.pair}`;
    case 'ld-reg-ixd': return `ld ${decoded.dest}, ${indexed(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-ixd-reg': return `ld ${indexed(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;
    case 'ld-ixd-imm': return `ld ${indexed(decoded.indexRegister, decoded.displacement)}, ${hex(decoded.value, 2)}`;
    case 'ld-pair-indexed': return `ld ${decoded.pair}, ${indexed(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-pair': return `ld ${indexed(decoded.indexRegister, decoded.displacement)}, ${decoded.pair}`;
    case 'ld-ixiy-indexed': return `ld ${decoded.dest}, ${indexed(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-ixiy': return `ld ${indexed(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;

    case 'alu-reg': {
      const prefix = (decoded.op === 'add' || decoded.op === 'adc' || decoded.op === 'sbc')
        ? `${decoded.op} a, `
        : `${decoded.op} `;
      return `${prefix}${decoded.src}`;
    }
    case 'alu-imm': {
      const prefix = (decoded.op === 'add' || decoded.op === 'adc' || decoded.op === 'sbc')
        ? `${decoded.op} a, `
        : `${decoded.op} `;
      return `${prefix}${hex(decoded.value, 2)}`;
    }
    case 'alu-ixd': {
      const prefix = (decoded.op === 'add' || decoded.op === 'adc' || decoded.op === 'sbc')
        ? `${decoded.op} a, `
        : `${decoded.op} `;
      return `${prefix}${indexed(decoded.indexRegister, decoded.displacement)}`;
    }

    case 'inc-reg': return `inc ${decoded.reg}`;
    case 'dec-reg': return `dec ${decoded.reg}`;
    case 'inc-pair': return `inc ${decoded.pair}`;
    case 'dec-pair': return `dec ${decoded.pair}`;
    case 'inc-ixd': return `inc ${indexed(decoded.indexRegister, decoded.displacement)}`;
    case 'dec-ixd': return `dec ${indexed(decoded.indexRegister, decoded.displacement)}`;

    case 'add-pair': return `add ${decoded.dest}, ${decoded.src}`;
    case 'sbc-pair': return `sbc hl, ${decoded.src}`;
    case 'adc-pair': return `adc hl, ${decoded.src}`;

    case 'push': return `push ${decoded.pair}`;
    case 'pop': return `pop ${decoded.pair}`;

    case 'bit-test': return `bit ${decoded.bit}, ${decoded.reg}`;
    case 'bit-set': return `set ${decoded.bit}, ${decoded.reg}`;
    case 'bit-res': return `res ${decoded.bit}, ${decoded.reg}`;
    case 'bit-test-ind': return `bit ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-set-ind': return `set ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-res-ind': return `res ${decoded.bit}, (${decoded.indirectRegister})`;

    case 'rotate-reg': return `${decoded.op} ${decoded.reg}`;
    case 'rotate-ind': return `${decoded.op} (${decoded.indirectRegister})`;
    case 'indexed-cb-rotate': return `${decoded.operation} ${indexed(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-bit': return `bit ${decoded.bit}, ${indexed(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-res': return `res ${decoded.bit}, ${indexed(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-set': return `set ${decoded.bit}, ${indexed(decoded.indexRegister, decoded.displacement)}`;

    case 'jp': return `jp ${hex(decoded.target)}`;
    case 'jr': return `jr ${hex(decoded.target)}`;
    case 'jp-conditional': return `jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jr-conditional': return `jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect': return `jp (${decoded.indirectRegister})`;
    case 'djnz': return `djnz ${hex(decoded.target)}`;
    case 'call': return `call ${hex(decoded.target)}`;
    case 'call-conditional': return `call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'ret': return 'ret';
    case 'retn': return 'retn';
    case 'reti': return 'reti';
    case 'ret-conditional': return `ret ${decoded.condition}`;
    case 'rst': return `rst ${hex(decoded.target, 2)}`;

    case 'im': return `im ${decoded.value}`;
    case 'in0': return `in0 ${decoded.reg}, (${hex(decoded.port, 2)})`;
    case 'out0': return `out0 (${hex(decoded.port, 2)}), ${decoded.reg}`;
    case 'in-reg': return `in ${decoded.reg}, (c)`;
    case 'out-reg': return `out (c), ${decoded.reg}`;
    case 'in-imm': return `in a, (${hex(decoded.port, 2)})`;
    case 'out-imm': return `out (${hex(decoded.port, 2)}), a`;
    case 'mlt': return `mlt ${decoded.reg}`;
    case 'tst-reg': return `tst a, ${decoded.reg}`;
    case 'tst-ind': return 'tst a, (hl)';
    case 'tst-imm': return `tst a, ${hex(decoded.value, 2)}`;
    case 'tstio': return `tstio ${hex(decoded.value, 2)}`;
    case 'lea': return `lea ${decoded.dest}, ${decoded.base}${disp(decoded.displacement)}`;
    case 'ex-sp-pair': return `ex (sp), ${decoded.pair}`;

    default:
      return `??? tag=${decoded.tag}`;
  }
}

function formatInstruction(decoded) {
  if (!decoded) return 'decode-failed';
  const text = buildDasm(decoded);
  return decoded.modePrefix ? `${decoded.modePrefix} ${text}` : text;
}

function decodeRange(start, end) {
  const rows = [];

  for (let pc = start; pc < end;) {
    try {
      const decoded = decodeInstruction(romBytes, pc, 'adl');
      rows.push({
        pc: decoded.pc,
        pcHex: hex(decoded.pc),
        bytes: bytesAt(decoded.pc, decoded.length),
        length: decoded.length,
        text: formatInstruction(decoded),
      });
      pc = decoded.nextPc;
    } catch (error) {
      rows.push({
        pc,
        pcHex: hex(pc),
        bytes: bytesAt(pc, 1),
        length: 1,
        text: `decode error: ${error?.message ?? String(error)}`,
      });
      pc += 1;
    }
  }

  return rows;
}

function instructionLabel(pc) {
  if (pc < 0 || pc >= romBytes.length) return 'out-of-rom';
  try {
    return formatInstruction(decodeInstruction(romBytes, pc, 'adl'));
  } catch {
    return 'decode-failed';
  }
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
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

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          lastPc = norm;
          for (const [name, target] of Object.entries(sentinels)) {
            if (norm === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          lastPc = norm;
          for (const [name, target] of Object.entries(sentinels)) {
            if (norm === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }
        },
      });
      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function snapshotCpu(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    hl: hex(cpu._hl),
    de: hex(cpu._de),
    bc: hex(cpu._bc),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: bootResult.steps, lastPc: hex(bootResult.lastPc), termination: bootResult.termination },
    kernelInit: { steps: kernelInitResult.steps, lastPc: hex(kernelInitResult.lastPc), termination: kernelInitResult.termination },
    postInit: { steps: postInitResult.steps, lastPc: hex(postInitResult.lastPc), termination: postInitResult.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[0xD008DF] = 0x00;
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function diffRamWrites(mem, ramBefore) {
  const ramWrites = [];
  for (let addr = RAM_WATCH_START; addr < RAM_WATCH_END; addr += 1) {
    const before = ramBefore[addr - RAM_WATCH_START];
    const after = mem[addr];
    if (before !== after) {
      ramWrites.push({
        addr: hex(addr),
        before: hex(before, 2),
        after: hex(after, 2),
      });
    }
  }
  return ramWrites;
}

function recordUniqueVisit(uniqueVisits, seenPcs, pc, kind) {
  const norm = pc & 0xFFFFFF;
  if (seenPcs.has(norm)) return;
  seenPcs.add(norm);
  uniqueVisits.push({
    pc: norm,
    pcHex: hex(norm),
    kind,
    instruction: instructionLabel(norm),
  });
}

function summarizeVisits(visits) {
  return visits.map((visit) => ({
    pc: visit.pcHex,
    kind: visit.kind,
    instruction: visit.instruction,
  }));
}

function runContextEntryTrace(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;

  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const ramBefore = new Uint8Array(RAM_WATCH_END - RAM_WATCH_START);
  ramBefore.set(mem.subarray(RAM_WATCH_START, RAM_WATCH_END));

  const uniqueVisits = [];
  const seenPcs = new Set();
  let totalSteps = 0;
  let currentPc = ENTRY_ADDR & 0xFFFFFF;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;
  let firstMissingBlock = null;

  while (totalSteps < CONTEXT_ENTRY_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, CONTEXT_ENTRY_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          recordUniqueVisit(uniqueVisits, seenPcs, norm, 'block');
          if (norm === RETURN_SENTINEL) {
            hit = 'sentinel';
            throw new Error(TRACE_STOP);
          }
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          recordUniqueVisit(uniqueVisits, seenPcs, norm, 'missing');
          firstMissingBlock ??= norm;
          if (norm === RETURN_SENTINEL) {
            hit = 'sentinel';
            throw new Error(TRACE_STOP);
          }
        },
      });
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= CONTEXT_ENTRY_MAX_STEPS && !hit) {
    termination = 'step_limit';
  }

  const targetIndex = uniqueVisits.findIndex((visit) => visit.pc === TARGET_BLOCK);
  const successorIndex = uniqueVisits.findIndex((visit) => visit.pc === SUCCESSOR_START);
  const successorVisits = uniqueVisits.filter((visit) => visit.pc >= SUCCESSOR_START && visit.pc < SUCCESSOR_END);
  const afterTarget = targetIndex >= 0 ? uniqueVisits.slice(targetIndex + 1) : [];
  const afterSuccessor = successorIndex >= 0 ? uniqueVisits.slice(successorIndex + 1) : [];
  const successorVisit = successorIndex >= 0 ? uniqueVisits[successorIndex] : null;
  const firstMissingAfterSuccessor = afterSuccessor.find((visit) => visit.kind === 'missing') ?? null;
  const bootVectorReachedAfterTarget = afterTarget.some((visit) => visit.pc === BOOT_ENTRY);
  const returnedViaRet = hit === 'sentinel';
  const ramWrites = diffRamWrites(mem, ramBefore);

  let outcome = termination ?? 'unknown';
  if (returnedViaRet) {
    outcome = 'ret';
  } else if (successorVisit?.kind === 'missing') {
    outcome = `missing:${successorVisit.pcHex}`;
  } else if (firstMissingAfterSuccessor) {
    outcome = `missing:${firstMissingAfterSuccessor.pcHex}`;
  } else if (firstMissingBlock !== null) {
    outcome = `missing:${hex(firstMissingBlock)}`;
  }

  return {
    entryAddr: hex(ENTRY_ADDR),
    steps: totalSteps,
    termination,
    hit,
    outcome,
    firstMissingBlock: firstMissingBlock === null ? null : hex(firstMissingBlock),
    targetReached: targetIndex >= 0,
    successorReached: successorIndex >= 0,
    successorKind: successorVisit?.kind ?? null,
    returnedViaRet,
    bootVectorReachedAfterTarget,
    uniqueVisitedCount: uniqueVisits.length,
    uniqueVisited: summarizeVisits(uniqueVisits),
    successorVisits: summarizeVisits(successorVisits),
    afterTarget: summarizeVisits(afterTarget),
    afterSuccessor: summarizeVisits(afterSuccessor),
    firstMissingAfterSuccessor: firstMissingAfterSuccessor?.pcHex ?? null,
    cpuAtExit: snapshotCpu(cpu),
    ramWriteCount: ramWrites.length,
    ramWrites,
    errorMessage: errorMessage ? errorMessage.split('\n')[0] : null,
  };
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function printDisassembly(rows) {
  console.log('=== Static Disassembly: 0x092265..0x09227F ===');
  for (const row of rows) {
    console.log(`  ${row.pcHex}  ${row.bytes.padEnd(17)}  ${row.text}`);
  }
  console.log('');
}

function printReportInfo() {
  console.log('=== Transpiled ROM State ===');
  if (REPORT) {
    console.log(`  report.generatedAt=${REPORT.generatedAt}`);
    console.log(`  report.seedCount=${REPORT.seedCount}`);
    console.log(`  report.blockCount=${REPORT.blockCount}`);
    console.log(`  report.coveragePercent=${REPORT.coveragePercent}`);
  } else {
    console.log('  report=missing');
  }
  console.log(`  PRELIFTED_BLOCKS entries=${Object.keys(BLOCKS).length}`);
  console.log(`  has ${hex(TARGET_BLOCK)}:adl = ${BLOCKS[blockKey(TARGET_BLOCK)] ? 'yes' : 'no'}`);
  console.log(`  has ${hex(SUCCESSOR_START)}:adl = ${BLOCKS[blockKey(SUCCESSOR_START)] ? 'yes' : 'no'}`);
  console.log('');
}

function printTraceSummary(result) {
  console.log('=== STAT Trace Summary ===');
  console.log(`  entry=${result.entryAddr}`);
  console.log(`  steps=${result.steps} termination=${result.termination} hit=${result.hit ?? 'none'} outcome=${result.outcome}`);
  console.log(`  target ${hex(TARGET_BLOCK)} reached=${result.targetReached}`);
  console.log(`  successor ${hex(SUCCESSOR_START)} reached=${result.successorReached} kind=${result.successorKind ?? 'n/a'}`);
  console.log(`  returned via RET=${result.returnedViaRet}`);
  console.log(`  firstMissing=${result.firstMissingBlock ?? 'none'} firstMissingAfterSuccessor=${result.firstMissingAfterSuccessor ?? 'none'}`);
  console.log(`  bootVectorAfterTarget=${result.bootVectorReachedAfterTarget}`);
  console.log(`  uniqueVisited=${result.uniqueVisitedCount}`);
  console.log(`  RAM writes in ${hex(RAM_WATCH_START)}..${hex(RAM_WATCH_END - 1)} = ${result.ramWriteCount}`);
  console.log('');

  console.log('  Successor-window visits:');
  if (result.successorVisits.length === 0) {
    console.log('    none');
  } else {
    for (const visit of result.successorVisits) {
      console.log(`    ${visit.pc} [${visit.kind}] ${visit.instruction}`);
    }
  }
  console.log('');

  console.log('  After target:');
  if (result.afterTarget.length === 0) {
    console.log('    none');
  } else {
    for (const visit of result.afterTarget) {
      console.log(`    ${visit.pc} [${visit.kind}] ${visit.instruction}`);
    }
  }
  console.log('');

  console.log('  Unique PCs:');
  console.log(`    ${result.uniqueVisited.map((visit) => `${visit.pc}${visit.kind === 'missing' ? ' [missing]' : ''}`).join(', ')}`);
  console.log('');

  console.log('  RAM writes:');
  if (result.ramWrites.length === 0) {
    console.log('    none');
  } else {
    for (const write of result.ramWrites) {
      console.log(`    ${write.addr}: ${write.before} -> ${write.after}`);
    }
  }
  if (result.errorMessage) {
    console.log('');
    console.log(`  error=${result.errorMessage}`);
  }
  console.log('');
}

function main() {
  const staticDisassembly = decodeRange(SUCCESSOR_START, SUCCESSOR_END);

  printReportInfo();
  printDisassembly(staticDisassembly);

  const runtime = createRuntime();
  const bootInfo = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);

  console.log('=== Boot ===');
  console.log(`  boot.steps=${bootInfo.boot.steps} termination=${bootInfo.boot.termination} lastPc=${bootInfo.boot.lastPc}`);
  console.log(`  kernelInit.steps=${bootInfo.kernelInit.steps} termination=${bootInfo.kernelInit.termination} lastPc=${bootInfo.kernelInit.lastPc}`);
  console.log(`  postInit.steps=${bootInfo.postInit.steps} termination=${bootInfo.postInit.termination} lastPc=${bootInfo.postInit.lastPc}`);
  console.log(`  memInit.steps=${memInit.steps} termination=${memInit.termination} hit=${memInit.hit ?? 'none'} lastPc=${hex(memInit.lastPc)}`);
  console.log('');

  const output = {
    targetBlock: hex(TARGET_BLOCK),
    successorBlock: hex(SUCCESSOR_START),
    successorRange: `${hex(SUCCESSOR_START)}..${hex(SUCCESSOR_END - 1)}`,
    traceStepLimit: CONTEXT_ENTRY_MAX_STEPS,
    transpilationReport: REPORT
      ? {
          generatedAt: REPORT.generatedAt,
          seedCount: REPORT.seedCount,
          blockCount: REPORT.blockCount,
          coveragePercent: REPORT.coveragePercent,
        }
      : null,
    transpiledBlockPresence: {
      target: !!BLOCKS[blockKey(TARGET_BLOCK)],
      successor: !!BLOCKS[blockKey(SUCCESSOR_START)],
      preliftedBlockCount: Object.keys(BLOCKS).length,
    },
    staticDisassembly,
    boot: bootInfo,
    memInit: {
      hit: memInit.hit,
      steps: memInit.steps,
      termination: memInit.termination,
      errorMessage: memInit.errorMessage ? memInit.errorMessage.split('\n')[0] : null,
    },
    trace: null,
  };

  if (memInit.hit === 'ret') {
    output.trace = runContextEntryTrace(runtime.executor, runtime.cpu, runtime.mem);
    printTraceSummary(output.trace);
  } else {
    console.log('MemInit failed; STAT trace skipped.');
  }

  console.log('=== FULL OUTPUT JSON ===');
  console.log(JSON.stringify(output, null, 2));
}

main();

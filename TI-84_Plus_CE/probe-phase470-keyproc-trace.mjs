#!/usr/bin/env node
// Phase 470: Trace internal behavior of key processor 0x03FA09.
//
// Runs the same three-stage cold boot pattern used by phase 469, injects an
// ENTER scan code, enters the key wait loop at 0x030052, then traces the
// dynamic call tree rooted at 0x03FA09.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const ADDR_MASK = 0xFFFFFF;
const STACK_RESET_TOP = 0xD1A87E;

const KEY_WAIT_ENTRY = 0x030052;
const KEY_PROCESSOR = 0x03FA09;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_FLAGS_ADDR = 0xD00080;
const KEY_FLAGS2_ADDR = 0xD00088;
const KEY_RESULT_ADDR = 0xD141B5;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;

const TRACE_STEPS_AFTER_KEYPROC = 500;

const WATCHED_ADDRS = new Map([
  [KEY_RESULT_ADDR, 'D141B5'],
  [KEY_SCAN_CODE_ADDR, 'D00587'],
  [KEY_FLAGS_ADDR, 'D00080'],
]);

const CONDITION_FLAGS = {
  nz: { mask: 0x40, expected: 0 },
  z: { mask: 0x40, expected: 0x40 },
  nc: { mask: 0x01, expected: 0 },
  c: { mask: 0x01, expected: 0x01 },
  po: { mask: 0x04, expected: 0 },
  pe: { mask: 0x04, expected: 0x04 },
  p: { mask: 0x80, expected: 0 },
  m: { mask: 0x80, expected: 0x80 },
};

const CONDITIONAL_CALLS = new Map([
  [0xC4, 'nz'],
  [0xCC, 'z'],
  [0xD4, 'nc'],
  [0xDC, 'c'],
  [0xE4, 'po'],
  [0xEC, 'pe'],
  [0xF4, 'p'],
  [0xFC, 'm'],
]);

class StopTrace extends Error {
  constructor(reason, pc, mode, steps) {
    super(reason);
    this.name = 'StopTrace';
    this.reason = reason;
    this.pc = pc & ADDR_MASK;
    this.mode = mode;
    this.steps = steps;
  }
}

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(Number(value) & 0xFF, 2);
}

function read24(mem, addr) {
  const a = addr & ADDR_MASK;
  return (mem[a] | (mem[(a + 1) & ADDR_MASK] << 8) | (mem[(a + 2) & ADDR_MASK] << 16)) & ADDR_MASK;
}

function read16(mem, addr) {
  const a = addr & ADDR_MASK;
  return mem[a] | (mem[(a + 1) & ADDR_MASK] << 8);
}

async function importRomModule() {
  const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
  if (fs.existsSync(transpiledPath)) {
    return import(pathToFileURL(transpiledPath).href);
  }

  const gzPath = path.join(__dirname, 'ROM.transpiled.js.gz');
  if (!fs.existsSync(gzPath)) {
    throw new Error(`Missing ${transpiledPath} and ${gzPath}`);
  }

  const stat = fs.statSync(gzPath);
  const tempDir = path.join(os.tmpdir(), 'ti84-transpile');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempModulePath = path.join(tempDir, `ROM.transpiled.${stat.size}.${Math.trunc(stat.mtimeMs)}.mjs`);

  if (!fs.existsSync(tempModulePath)) {
    fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(gzPath)));
  }

  return import(pathToFileURL(tempModulePath).href);
}

function getBlocks(romModule) {
  const blocks = romModule.PRELIFTED_BLOCKS
    ?? romModule.blocks
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default?.blocks
    ?? romModule.default;

  if (!blocks || typeof blocks !== 'object') {
    throw new Error('Could not find PRELIFTED_BLOCKS/blocks export in ROM.transpiled.js');
  }

  return blocks;
}

function resetCpuForBootStage(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function snapshotRegs(cpu) {
  return {
    A: cpu.a & 0xFF,
    B: cpu.b & 0xFF,
    C: cpu.c & 0xFF,
    D: cpu.d & 0xFF,
    E: cpu.e & 0xFF,
    H: cpu.h & 0xFF,
    L: cpu.l & 0xFF,
    IX: cpu.ix & ADDR_MASK,
    IY: cpu.iy & ADDR_MASK,
  };
}

function formatRegs(regs) {
  return [
    `A=${hexByte(regs.A)}`,
    `B=${hexByte(regs.B)}`,
    `C=${hexByte(regs.C)}`,
    `D=${hexByte(regs.D)}`,
    `E=${hexByte(regs.E)}`,
    `H=${hexByte(regs.H)}`,
    `L=${hexByte(regs.L)}`,
    `IX=${hex(regs.IX)}`,
    `IY=${hex(regs.IY)}`,
  ].join(' ');
}

function conditionTaken(cpu, condition) {
  if (!condition) return true;
  const flag = CONDITION_FLAGS[condition];
  if (!flag) return null;
  return (cpu.f & flag.mask) === flag.expected;
}

function decodeCallAt(mem, cpu, pc, mode, meta) {
  const opcode = mem[pc & ADDR_MASK];
  let condition = null;

  if (opcode === 0xCD) {
    condition = null;
  } else if (CONDITIONAL_CALLS.has(opcode)) {
    condition = CONDITIONAL_CALLS.get(opcode);
  } else {
    return null;
  }

  const target = mode === 'adl'
    ? read24(mem, pc + 1)
    : (((cpu.mbase & 0xFF) << 16) | read16(mem, pc + 1)) & ADDR_MASK;

  const metaTargets = Array.isArray(meta?.exits)
    ? meta.exits
        .filter((exit) => typeof exit?.target === 'number' && String(exit?.type ?? '').toLowerCase().includes('call'))
        .map((exit) => exit.target & ADDR_MASK)
    : [];

  return {
    opcode,
    condition,
    taken: conditionTaken(cpu, condition),
    target,
    metaTargets,
  };
}

function classifyWriteAddr(addr) {
  const normalized = addr & ADDR_MASK;
  if (WATCHED_ADDRS.has(normalized)) return WATCHED_ADDRS.get(normalized);
  if (normalized >= VRAM_START && normalized < VRAM_END) return 'VRAM';
  return null;
}

function installWriteTrace(cpu, traceState) {
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordByte(addr, value, width) {
    const normalized = addr & ADDR_MASK;
    const label = classifyWriteAddr(normalized);
    if (!label) return;

    const entry = {
      step: traceState.currentStep,
      pc: traceState.currentPc,
      phase: traceState.keyprocReached
        ? (traceState.keyprocReturned ? 'after-keyproc' : 'keyproc')
        : 'pre-keyproc',
      addr: normalized,
      label,
      value: value & 0xFF,
      width,
    };

    traceState.writeLog.push(entry);

    if (label === 'VRAM') {
      traceState.vramWrites++;
      return;
    }

    if (!traceState.scalarWrites.has(normalized)) {
      traceState.scalarWrites.set(normalized, []);
    }
    traceState.scalarWrites.get(normalized).push(entry);
  }

  cpu.write8 = (addr, value) => {
    recordByte(addr, value, 1);
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordByte(addr, value, 2);
    recordByte(addr + 1, value >> 8, 2);
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte(addr, value, 3);
    recordByte(addr + 1, value >> 8, 3);
    recordByte(addr + 2, value >> 16, 3);
    return originalWrite24(addr, value);
  };
}

function printWriteEntry(entry) {
  console.log(
    `step=${entry.step} pc=${hex(entry.pc)} phase=${entry.phase.padEnd(12)} `
    + `addr=${hex(entry.addr)} ${entry.label.padEnd(6)} value=${hexByte(entry.value)} width=${entry.width}`,
  );
}

async function main() {
  console.log('=== Phase 470: Trace key processor 0x03FA09 ===');
  console.log('');

  const romPath = path.join(__dirname, 'ROM.rom');
  const romBytes = fs.readFileSync(romPath);
  const romModule = await importRomModule();
  const blocks = getBlocks(romModule);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));

  const peripherals = createPeripheralBus({
    timerInterrupt: false,
  });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('--- Stage 1: Cold boot ---');
  const bootResult = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  console.log(`boot:      steps=${bootResult.steps} term=${bootResult.termination}`);

  resetCpuForBootStage(cpu, mem);

  cpu.mbase = 0xD0;
  cpu._iy = KEY_FLAGS_ADDR;
  const kernelResult = executor.runFrom(0x08C331, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 500,
  });
  console.log(`kernel:    steps=${kernelResult.steps} term=${kernelResult.termination}`);

  resetCpuForBootStage(cpu, mem);
  cpu.mbase = 0xD0;
  cpu._iy = KEY_FLAGS_ADDR;
  cpu._hl = 0;

  const postInitResult = executor.runFrom(0x0802B2, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 500,
  });
  console.log(`post-init: steps=${postInitResult.steps} term=${postInitResult.termination}`);
  console.log('');

  console.log('--- Stage 2: Post-boot key injection ---');
  mem[KEY_SCAN_CODE_ADDR] = 0x09;
  mem[KEY_FLAGS_ADDR] = (mem[KEY_FLAGS_ADDR] | 0x08) & 0xFF;
  mem[KEY_FLAGS2_ADDR] = (mem[KEY_FLAGS2_ADDR] | 0x08) & 0xFF;
  mem[0xD177BA] = 0x7F;
  mem[0xD177B7] = 0x00;

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_FLAGS_ADDR;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  console.log(`D00587 (scan code)  = ${hexByte(mem[KEY_SCAN_CODE_ADDR])}`);
  console.log(`D00080 (key flags)  = ${hexByte(mem[KEY_FLAGS_ADDR])} (bit3=${(mem[KEY_FLAGS_ADDR] >> 3) & 1})`);
  console.log(`D00088 (key flags2) = ${hexByte(mem[KEY_FLAGS2_ADDR])} (bit3=${(mem[KEY_FLAGS2_ADDR] >> 3) & 1})`);
  console.log(`IFF1/IFF2           = ${cpu.iff1}/${cpu.iff2}`);
  console.log('');

  const traceState = {
    currentStep: 0,
    currentPc: KEY_WAIT_ENTRY,
    keyprocReached: false,
    keyprocReturned: false,
    keyprocEntryStep: null,
    keyprocEntrySp: null,
    keyprocReturnPc: null,
    keyprocReturnA: null,
    finalPcAfterReturn: null,
    callLog: [],
    writeLog: [],
    scalarWrites: new Map(),
    vramWrites: 0,
    missingBlocks: [],
  };

  installWriteTrace(cpu, traceState);

  console.log('--- Stage 3: Run from 0x030052 and trace 0x03FA09 ---');

  let runResult;
  try {
    runResult = executor.runFrom(KEY_WAIT_ENTRY, 'adl', {
      maxSteps: 2000000,
      maxLoopIterations: 50000,
      diHaltBypass: true,
      diHaltBypassEntry: KEY_WAIT_ENTRY,

      onBlock(pc, mode, meta, steps) {
        const normalizedPc = pc & ADDR_MASK;
        traceState.currentStep = steps;
        traceState.currentPc = normalizedPc;

        if (traceState.keyprocReached && !traceState.keyprocReturned) {
          const expectedReturnSp = (traceState.keyprocEntrySp + 3) & ADDR_MASK;
          if (
            steps > traceState.keyprocEntryStep
            && normalizedPc === traceState.keyprocReturnPc
            && (cpu.sp & ADDR_MASK) === expectedReturnSp
          ) {
            traceState.keyprocReturned = true;
            traceState.keyprocReturnA = cpu.a & 0xFF;
            traceState.finalPcAfterReturn = normalizedPc;
            throw new StopTrace('keyproc_returned', normalizedPc, mode, steps);
          }

          const stepsAfterKeyproc = steps - traceState.keyprocEntryStep;
          if (stepsAfterKeyproc >= TRACE_STEPS_AFTER_KEYPROC) {
            throw new StopTrace('step_limit_after_keyproc', normalizedPc, mode, steps);
          }

          const call = decodeCallAt(mem, cpu, normalizedPc, mode, meta);
          if (call) {
            traceState.callLog.push({
              step: stepsAfterKeyproc,
              pc: normalizedPc,
              mode,
              opcode: call.opcode,
              condition: call.condition,
              taken: call.taken,
              target: call.target,
              metaTargets: call.metaTargets,
              regs: snapshotRegs(cpu),
            });
          }
        }

        if (normalizedPc === KEY_PROCESSOR && !traceState.keyprocReached) {
          traceState.keyprocReached = true;
          traceState.keyprocEntryStep = steps;
          traceState.keyprocEntrySp = cpu.sp & ADDR_MASK;
          traceState.keyprocReturnPc = read24(mem, cpu.sp);
          console.log(
            `keyproc reached at step=${steps} sp=${hex(traceState.keyprocEntrySp)} `
            + `return=${hex(traceState.keyprocReturnPc)} A=${hexByte(cpu.a)}`,
          );
        }
      },

      onMissingBlock(pc, mode, steps) {
        traceState.missingBlocks.push({ pc: pc & ADDR_MASK, mode, steps });
      },
    });
  } catch (error) {
    if (!(error instanceof StopTrace)) {
      throw error;
    }

    runResult = {
      steps: error.steps,
      lastPc: error.pc,
      lastMode: error.mode,
      termination: error.reason,
      halted: cpu.halted,
    };
  }

  console.log(`run: steps=${runResult.steps} term=${runResult.termination} lastPc=${hex(runResult.lastPc)} mode=${runResult.lastMode ?? 'n/a'}`);
  console.log('');

  console.log('=== CALLs after first reaching 0x03FA09 ===');
  if (traceState.callLog.length === 0) {
    console.log('(none)');
  } else {
    for (const entry of traceState.callLog) {
      const cond = entry.condition ? ` ${entry.condition.toUpperCase()}` : '';
      const taken = entry.condition ? ` taken=${entry.taken}` : '';
      const metaTargets = entry.metaTargets.length > 0
        ? ` metaTargets=[${entry.metaTargets.map((target) => hex(target)).join(', ')}]`
        : '';
      console.log(
        `+${entry.step.toString().padStart(3, ' ')} pc=${hex(entry.pc)} mode=${entry.mode} `
        + `CALL${cond} target=${hex(entry.target)}${taken}${metaTargets} ${formatRegs(entry.regs)}`,
      );
    }
  }
  console.log('');

  console.log('=== Watched memory writes ===');
  if (traceState.writeLog.length === 0) {
    console.log('(none)');
  } else {
    for (const entry of traceState.writeLog) {
      printWriteEntry(entry);
    }
  }
  console.log('');

  console.log('=== Summary ===');
  const d141b5Writes = traceState.scalarWrites.get(KEY_RESULT_ADDR) ?? [];
  const d00587Writes = traceState.scalarWrites.get(KEY_SCAN_CODE_ADDR) ?? [];
  const d00080Writes = traceState.scalarWrites.get(KEY_FLAGS_ADDR) ?? [];

  console.log(`0x03FA09 reached: ${traceState.keyprocReached}`);
  console.log(`0x03FA09 returned: ${traceState.keyprocReturned}`);
  console.log(`D141B5 written: ${d141b5Writes.length > 0}${d141b5Writes.length ? ` values=${d141b5Writes.map((w) => hexByte(w.value)).join(',')}` : ''}`);
  console.log(`D00587 consumed/cleared: ${mem[KEY_SCAN_CODE_ADDR] === 0} final=${hexByte(mem[KEY_SCAN_CODE_ADDR])}${d00587Writes.length ? ` writes=${d00587Writes.map((w) => hexByte(w.value)).join(',')}` : ''}`);
  console.log(`D00080 final: ${hexByte(mem[KEY_FLAGS_ADDR])}${d00080Writes.length ? ` writes=${d00080Writes.map((w) => hexByte(w.value)).join(',')}` : ''}`);
  console.log(`VRAM writes occurred: ${traceState.vramWrites > 0} count=${traceState.vramWrites}`);
  console.log(`A on 0x03FA09 return: ${traceState.keyprocReturnA === null ? 'n/a' : hexByte(traceState.keyprocReturnA)}`);
  console.log(`Final PC after 0x03FA09 return: ${traceState.finalPcAfterReturn === null ? 'n/a' : hex(traceState.finalPcAfterReturn)}`);

  if (traceState.missingBlocks.length > 0) {
    console.log('');
    console.log('=== Missing blocks ===');
    for (const entry of traceState.missingBlocks.slice(0, 20)) {
      console.log(`step=${entry.steps} pc=${hex(entry.pc)} mode=${entry.mode}`);
    }
    if (traceState.missingBlocks.length > 20) {
      console.log(`... ${traceState.missingBlocks.length - 20} more`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}

#!/usr/bin/env node

/**
 * Phase 155 - JmpThru trace during gcd(12,8).
 *
 * Goals:
 * 1. Disassemble the ROM window around 0x080188.
 * 2. Trace every hit of 0x080188 while running gcd(12,8).
 * 3. Report the observed follow-on target(s) and whether those targets exist
 *    in PRELIFTED_BLOCKS.
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase155-jmpthru-trace.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
  throw new Error(
    'ROM.transpiled.js not found. Run `node scripts/transpile-ti84-rom.mjs` first.'
  );
}

const romBytes = fs.readFileSync(ROM_BIN_PATH);
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;

if (!BLOCKS) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;

const GCD_DIRECT_ADDR = 0x068d3d;
const GCD_CATEGORY = 0x28;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 5000;

const FPS_CLEAN_AREA = 0xd1aa00;

const JMPTHRU_ADDR = 0x080188;
const JMPTHRU_HELPER_TARGET = 0x080173;
const JMPTHRU_FAST_TARGET = 0x061d0e;
const JMPTHRU_WINDOW_START = 0x080188;
const JMPTHRU_WINDOW_END = 0x0801c0;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const JMPTHRU_WINDOW_KEYS = [
  '080188:adl',
  '08018c:adl',
  '080190:adl',
  '080191:adl',
  '080193:adl',
  '080197:adl',
  '08019d:adl',
  '08019f:adl',
  '0801a3:adl',
  '0801a7:adl',
  '0801a8:adl',
  '0801af:adl',
  '0801b7:adl',
  '0801b9:adl',
  '0801be:adl',
];

const JMPTHRU_HELPER_KEYS = [
  '080173:adl',
  '080177:adl',
  '080178:adl',
  '08017c:adl',
  '080180:adl',
  '080182:adl',
  '080186:adl',
  '080188:adl',
  '08018c:adl',
  '080190:adl',
  '080191:adl',
];

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? null
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (byte) => byte & 0xff);
}

function formatBytes(bytes) {
  return bytes
    .map((byte) => (byte & 0xff).toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function noteStep(stepCount, step) {
  if (typeof step === 'number') {
    return Math.max(stepCount, step + 1);
  }
  return stepCount + 1;
}

function hasTranspiledBlock(addr) {
  const stem = addr.toString(16).padStart(6, '0');
  return Boolean(
    BLOCKS[`block_0x${stem}`]
    || BLOCKS[`${stem}:adl`]
    || BLOCKS[`${stem}:z80`]
  );
}

function romWindowHex(start, end) {
  const lines = [];
  for (let addr = start; addr < end; addr += 16) {
    const bytes = formatBytes(readBytes(romBytes, addr, Math.min(16, end - addr)));
    lines.push(`${hex(addr)}: ${bytes}`);
  }
  return lines;
}

function collectInstructions(keys) {
  const seen = new Set();
  const instructions = [];

  for (const key of keys) {
    const block = BLOCKS[key];
    if (!block?.instructions) continue;

    for (const instruction of block.instructions) {
      const id = `${instruction.pc}:${instruction.bytes}`;
      if (seen.has(id)) continue;
      seen.add(id);
      instructions.push({
        pc: hex(instruction.pc),
        bytes: instruction.bytes.toUpperCase(),
        dasm: instruction.dasm,
      });
    }
  }

  return instructions.sort((a, b) => Number.parseInt(a.pc.slice(2), 16) - Number.parseInt(b.pc.slice(2), 16));
}

function buildStaticReport() {
  return {
    jmpThruEntryPc: hex(JMPTHRU_ADDR),
    jmpThruBlockPresent: hasTranspiledBlock(JMPTHRU_ADDR),
    romWindowHex: romWindowHex(JMPTHRU_WINDOW_START, JMPTHRU_WINDOW_END),
    windowDecode: collectInstructions(JMPTHRU_WINDOW_KEYS),
    helperChainDecode: collectInstructions(JMPTHRU_HELPER_KEYS),
  };
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedRealRegister(mem, addr, bytes) {
  mem.fill(0x00, addr, addr + 11);
  mem.set(bytes, addr);
}

function seedGcdFpState(mem) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, BCD_12);
  seedRealRegister(mem, OP2_ADDR, BCD_8);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let ok = false;

  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      ok = true;
    } else {
      throw error;
    }
  }

  return ok;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return { ...runtime, memInitOk };
}

function buildTraceReport() {
  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    return {
      memInitOk: false,
      outcome: 'meminit-failed',
      totalSteps: 0,
      lastMissingBlock: null,
      thrownMessage: null,
      hits: [],
      uniqueTargets: [],
      missingTargets: [],
    };
  }

  const { mem, executor, cpu } = runtime;
  prepareCallState(cpu, mem);
  seedGcdFpState(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  let stepCount = 0;
  let outcome = 'budget';
  let lastMissingBlock = null;
  let thrownMessage = null;

  const hits = [];
  const pendingImmediate = [];
  const activeHits = [];

  function finalizeHit(hit, reason, targetPc, targetKind, targetStep, targetEvent) {
    if (hit.resolved) return;
    hit.resolved = true;
    hit.actualTargetPc = targetPc;
    hit.actualTargetKind = targetKind;
    hit.actualTargetReason = reason;
    hit.actualTargetStep = targetStep;
    hit.actualTargetEvent = targetEvent;
  }

  function touchEvent(pc, kind, stepNum) {
    for (const hit of pendingImmediate) {
      if (hit.immediateNextPc == null && stepNum > hit.step) {
        hit.immediateNextPc = pc;
        hit.immediateNextKind = kind;
        hit.immediateNextStep = stepNum;
      }
    }

    for (const hit of activeHits) {
      if (hit.resolved) continue;

      if (stepNum > hit.step) {
        const marker = `${hex(pc)}:${kind}`;
        if (hit.path.length === 0 || hit.path[hit.path.length - 1] !== marker) {
          hit.path.push(marker);
        }
      }

      if (pc === hit.callerReturnPc) {
        finalizeHit(hit, 'returned-to-caller', pc, 'return', stepNum, kind);
      } else if (pc === JMPTHRU_FAST_TARGET) {
        finalizeHit(hit, 'jumped-to-061d0e', pc, 'jump', stepNum, kind);
      }
    }
  }

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        touchEvent(norm, 'block', stepCount);

        if (norm === JMPTHRU_ADDR) {
          const hit = {
            hitIndex: hits.length + 1,
            step: stepCount,
            callerReturnPc: read24(mem, cpu.sp),
            bc: cpu.bc & 0xffffff,
            de: cpu.de & 0xffffff,
            hl: cpu.hl & 0xffffff,
            sp: cpu.sp & 0xffffff,
            stackTop6: readBytes(mem, cpu.sp, 6),
            op1First4: readBytes(mem, OP1_ADDR, 4),
            op2First4: readBytes(mem, OP2_ADDR, 4),
            immediateNextPc: null,
            immediateNextKind: null,
            immediateNextStep: null,
            actualTargetPc: null,
            actualTargetKind: null,
            actualTargetReason: null,
            actualTargetStep: null,
            actualTargetEvent: null,
            path: [],
            resolved: false,
          };
          hits.push(hit);
          pendingImmediate.push(hit);
          activeHits.push(hit);
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        lastMissingBlock = norm;
        touchEvent(norm, 'missing', stepCount);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      outcome = 'return';
    } else if (error?.message === '__ERR__') {
      outcome = 'error';
    } else {
      outcome = 'threw';
      thrownMessage = error?.stack || String(error);
    }
  }

  for (const hit of activeHits) {
    if (!hit.resolved) {
      finalizeHit(hit, 'unresolved-before-run-end', null, 'unresolved', stepCount, 'end');
    }
  }

  const uniqueTargetMap = new Map();
  for (const hit of hits) {
    const targetPc = hit.actualTargetPc ?? hit.immediateNextPc;
    if (targetPc == null) continue;
    if (!uniqueTargetMap.has(targetPc)) {
      uniqueTargetMap.set(targetPc, {
        targetPc,
        hasBlock: hasTranspiledBlock(targetPc),
        hitIndices: [hit.hitIndex],
      });
    } else {
      uniqueTargetMap.get(targetPc).hitIndices.push(hit.hitIndex);
    }
  }

  const uniqueTargets = [...uniqueTargetMap.values()]
    .sort((a, b) => a.targetPc - b.targetPc)
    .map((entry) => ({
      targetPc: hex(entry.targetPc),
      hasBlock: entry.hasBlock,
      hitIndices: entry.hitIndices,
    }));

  return {
    memInitOk: true,
    outcome,
    totalSteps: stepCount,
    lastMissingBlock: hex(lastMissingBlock),
    thrownMessage: thrownMessage ? thrownMessage.split('\n')[0] : null,
    hits: hits.map((hit) => ({
      hitIndex: hit.hitIndex,
      step: hit.step,
      callerReturnPc: hex(hit.callerReturnPc),
      bc: hex(hit.bc),
      de: hex(hit.de),
      hl: hex(hit.hl),
      sp: hex(hit.sp),
      stackTop6: formatBytes(hit.stackTop6),
      op1First4: formatBytes(hit.op1First4),
      op2First4: formatBytes(hit.op2First4),
      immediateNextPc: hex(hit.immediateNextPc),
      immediateNextKind: hit.immediateNextKind,
      immediateNextStep: hit.immediateNextStep,
      actualTargetPc: hex(hit.actualTargetPc),
      actualTargetKind: hit.actualTargetKind,
      actualTargetReason: hit.actualTargetReason,
      actualTargetStep: hit.actualTargetStep,
      actualTargetEvent: hit.actualTargetEvent,
      path: hit.path,
    })),
    uniqueTargets,
    missingTargets: uniqueTargets.filter((target) => !target.hasBlock),
  };
}

function buildAnalysis(staticReport, traceReport) {
  const helperFlow = [
    `${hex(JMPTHRU_ADDR)} -> ${hex(JMPTHRU_HELPER_TARGET)}`,
    `${hex(0x08018c)} -> ret nz -> caller`,
    `${hex(0x080191)} -> ${hex(0x080178)} -> ${hex(JMPTHRU_FAST_TARGET)}`,
  ];

  return [
    `0x080188 is present in PRELIFTED_BLOCKS: ${staticReport.jmpThruBlockPresent}.`,
    `The bytes at 0x080188-0x0801BF do not contain a jp (hl), jp (ix), pop/jp pair, or any read of an inline 24-bit target from the return address. The entry at 0x080188 is a fixed helper chain, not a literal-address reader.`,
    `Observed helper flow: ${helperFlow.join(' | ')}.`,
    `During gcd(12,8), 0x080188 is hit ${traceReport.hits.length} times total: twice from the 0x068DC7 call site and twice from the 0x068DDB call site because gcd_sub1 runs once per operand.`,
    `All four hits go to ${hex(JMPTHRU_HELPER_TARGET)} at step+1. The 0x068DC7 hits return to 0x068DCB. The 0x068DDB hits jump to ${hex(JMPTHRU_FAST_TARGET)}.`,
    `All observed targets are transpiled blocks: ${traceReport.uniqueTargets.map((target) => `${target.targetPc}=${target.hasBlock}`).join(', ')}.`,
    traceReport.missingTargets.length === 0
      ? 'No missing JmpThru target was observed, so the gcd failure is probably not caused by an untranslated JmpThru destination.'
      : `Missing JmpThru targets were observed: ${traceReport.missingTargets.map((target) => target.targetPc).join(', ')}.`,
  ];
}

function main() {
  const staticReport = buildStaticReport();
  const traceReport = buildTraceReport();
  const report = {
    partA: staticReport,
    partB: traceReport,
    partC: {
      uniqueTargets: traceReport.uniqueTargets,
      missingTargets: traceReport.missingTargets,
    },
    analysis: buildAnalysis(staticReport, traceReport),
  };

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 0;
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}

/*
Captured output on 2026-04-30:

{
  "partA": {
    "jmpThruEntryPc": "0x080188",
    "jmpThruBlockPresent": true,
    "romWindowHex": [
      "0x080188: CD 73 01 08 CD 4A FD 07 C0 18 E5 CD 50 2C 08 D5",
      "0x080198: EB CD 16 C9 04 D1 C9 CD A5 A3 09 CD FB F9 07 C9",
      "0x0801A8: 3A 03 06 D0 E6 3F C9 3A F9 05 D0 FE 5E 37 C8 AF",
      "0x0801B8: C9 FD CB 14 4E C9 CD 43"
    ],
    "windowDecode": [
      { "pc": "0x080188", "bytes": "CD 73 01 08", "dasm": "call 0x080173" },
      { "pc": "0x08018C", "bytes": "CD 4A FD 07", "dasm": "call 0x07fd4a" },
      { "pc": "0x080190", "bytes": "C0", "dasm": "ret nz" },
      { "pc": "0x080191", "bytes": "18 E5", "dasm": "jr 0x080178" },
      { "pc": "0x080193", "bytes": "CD 50 2C 08", "dasm": "call 0x082c50" },
      { "pc": "0x080197", "bytes": "D5", "dasm": "push de" },
      { "pc": "0x080198", "bytes": "EB", "dasm": "ex de, hl" },
      { "pc": "0x080199", "bytes": "CD 16 C9 04", "dasm": "call 0x04c916" },
      { "pc": "0x08019D", "bytes": "D1", "dasm": "pop de" },
      { "pc": "0x08019E", "bytes": "C9", "dasm": "ret" },
      { "pc": "0x08019F", "bytes": "CD A5 A3 09", "dasm": "call 0x09a3a5" },
      { "pc": "0x0801A3", "bytes": "CD FB F9 07", "dasm": "call 0x07f9fb" },
      { "pc": "0x0801A7", "bytes": "C9", "dasm": "ret" },
      { "pc": "0x0801A8", "bytes": "3A 03 06 D0", "dasm": "ld a, (0xd00603)" },
      { "pc": "0x0801AC", "bytes": "E6 3F", "dasm": "and 0x3f" },
      { "pc": "0x0801AE", "bytes": "C9", "dasm": "ret" },
      { "pc": "0x0801AF", "bytes": "3A F9 05 D0", "dasm": "ld a, (0xd005f9)" },
      { "pc": "0x0801B3", "bytes": "FE 5E", "dasm": "cp 0x5e" },
      { "pc": "0x0801B5", "bytes": "37", "dasm": "scf" },
      { "pc": "0x0801B6", "bytes": "C8", "dasm": "ret z" },
      { "pc": "0x0801B7", "bytes": "AF", "dasm": "xor a" },
      { "pc": "0x0801B8", "bytes": "C9", "dasm": "ret" },
      { "pc": "0x0801B9", "bytes": "FD CB 14 4E", "dasm": "bit 1, (iy+20)" },
      { "pc": "0x0801BD", "bytes": "C9", "dasm": "ret" },
      { "pc": "0x0801BE", "bytes": "CD 43 0E 0B", "dasm": "call 0x0b0e43" }
    ],
    "helperChainDecode": [
      { "pc": "0x080173", "bytes": "CD C9 FD 07", "dasm": "call 0x07fdc9" },
      { "pc": "0x080177", "bytes": "C8", "dasm": "ret z" },
      { "pc": "0x080178", "bytes": "C3 0E 1D 06", "dasm": "jp 0x061d0e" },
      { "pc": "0x08017C", "bytes": "CD BD F7 07", "dasm": "call 0x07f7bd" },
      { "pc": "0x080180", "bytes": "18 F5", "dasm": "jr 0x080177" },
      { "pc": "0x080182", "bytes": "CD 62 FD 07", "dasm": "call 0x07fd62" },
      { "pc": "0x080186", "bytes": "18 EF", "dasm": "jr 0x080177" },
      { "pc": "0x080188", "bytes": "CD 73 01 08", "dasm": "call 0x080173" },
      { "pc": "0x08018C", "bytes": "CD 4A FD 07", "dasm": "call 0x07fd4a" },
      { "pc": "0x080190", "bytes": "C0", "dasm": "ret nz" },
      { "pc": "0x080191", "bytes": "18 E5", "dasm": "jr 0x080178" }
    ]
  },
  "partB": {
    "memInitOk": true,
    "outcome": "return",
    "totalSteps": 1442,
    "lastMissingBlock": "0x7FFFFE",
    "thrownMessage": null,
    "hits": [
      {
        "hitIndex": 1,
        "step": 557,
        "callerReturnPc": "0x068DCB",
        "bc": "0xD1A8F5",
        "de": "0xD00603",
        "hl": "0xD0060E",
        "sp": "0xD1A866",
        "stackTop6": "CB 8D 06 55 81 00",
        "op1First4": "00 81 12 00",
        "op2First4": "00 81 12 00",
        "immediateNextPc": "0x080173",
        "immediateNextKind": "block",
        "immediateNextStep": 558,
        "actualTargetPc": "0x068DCB",
        "actualTargetKind": "return",
        "actualTargetReason": "returned-to-caller",
        "actualTargetStep": 564,
        "actualTargetEvent": "block",
        "path": [
          "0x080173:block",
          "0x07FDC9:block",
          "0x080177:block",
          "0x08018C:block",
          "0x07FD4A:block",
          "0x080190:block",
          "0x068DCB:block"
        ]
      },
      {
        "hitIndex": 2,
        "step": 694,
        "callerReturnPc": "0x068DDF",
        "bc": "0xD10000",
        "de": "0xD005F9",
        "hl": "0xD00601",
        "sp": "0xD1A866",
        "stackTop6": "DF 8D 06 55 81 00",
        "op1First4": "00 80 00 00",
        "op2First4": "00 83 12 00",
        "immediateNextPc": "0x080173",
        "immediateNextKind": "block",
        "immediateNextStep": 695,
        "actualTargetPc": "0x061D0E",
        "actualTargetKind": "jump",
        "actualTargetReason": "jumped-to-061d0e",
        "actualTargetStep": 703,
        "actualTargetEvent": "block",
        "path": [
          "0x080173:block",
          "0x07FDC9:block",
          "0x080177:block",
          "0x08018C:block",
          "0x07FD4A:block",
          "0x080190:block",
          "0x080191:block",
          "0x080178:block",
          "0x061D0E:block"
        ]
      },
      {
        "hitIndex": 3,
        "step": 1261,
        "callerReturnPc": "0x068DCB",
        "bc": "0xD1A8F5",
        "de": "0xD00603",
        "hl": "0xD0060E",
        "sp": "0xD1A866",
        "stackTop6": "CB 8D 06 10 82 00",
        "op1First4": "00 80 10 00",
        "op2First4": "00 80 10 00",
        "immediateNextPc": "0x080173",
        "immediateNextKind": "block",
        "immediateNextStep": 1262,
        "actualTargetPc": "0x068DCB",
        "actualTargetKind": "return",
        "actualTargetReason": "returned-to-caller",
        "actualTargetStep": 1268,
        "actualTargetEvent": "block",
        "path": [
          "0x080173:block",
          "0x07FDC9:block",
          "0x080177:block",
          "0x08018C:block",
          "0x07FD4A:block",
          "0x080190:block",
          "0x068DCB:block"
        ]
      },
      {
        "hitIndex": 4,
        "step": 1398,
        "callerReturnPc": "0x068DDF",
        "bc": "0xD10000",
        "de": "0xD005F9",
        "hl": "0xD00601",
        "sp": "0xD1A866",
        "stackTop6": "DF 8D 06 10 82 00",
        "op1First4": "00 80 00 00",
        "op2First4": "00 82 10 00",
        "immediateNextPc": "0x080173",
        "immediateNextKind": "block",
        "immediateNextStep": 1399,
        "actualTargetPc": "0x061D0E",
        "actualTargetKind": "jump",
        "actualTargetReason": "jumped-to-061d0e",
        "actualTargetStep": 1407,
        "actualTargetEvent": "block",
        "path": [
          "0x080173:block",
          "0x07FDC9:block",
          "0x080177:block",
          "0x08018C:block",
          "0x07FD4A:block",
          "0x080190:block",
          "0x080191:block",
          "0x080178:block",
          "0x061D0E:block"
        ]
      }
    ],
    "uniqueTargets": [
      { "targetPc": "0x061D0E", "hasBlock": true, "hitIndices": [2, 4] },
      { "targetPc": "0x068DCB", "hasBlock": true, "hitIndices": [1, 3] }
    ],
    "missingTargets": []
  },
  "partC": {
    "uniqueTargets": [
      { "targetPc": "0x061D0E", "hasBlock": true, "hitIndices": [2, 4] },
      { "targetPc": "0x068DCB", "hasBlock": true, "hitIndices": [1, 3] }
    ],
    "missingTargets": []
  },
  "analysis": [
    "0x080188 is present in PRELIFTED_BLOCKS: true.",
    "The bytes at 0x080188-0x0801BF do not contain a jp (hl), jp (ix), pop/jp pair, or any read of an inline 24-bit target from the return address. The entry at 0x080188 is a fixed helper chain, not a literal-address reader.",
    "Observed helper flow: 0x080188 -> 0x080173 | 0x08018C -> ret nz -> caller | 0x080191 -> 0x080178 -> 0x061D0E.",
    "During gcd(12,8), 0x080188 is hit 4 times total: twice from the 0x068DC7 call site and twice from the 0x068DDB call site because gcd_sub1 runs once per operand.",
    "All four hits go to 0x080173 at step+1. The 0x068DC7 hits return to 0x068DCB. The 0x068DDB hits jump to 0x061D0E.",
    "All observed targets are transpiled blocks: 0x061D0E=true, 0x068DCB=true.",
    "No missing JmpThru target was observed, so the gcd failure is probably not caused by an untranslated JmpThru destination."
  ]
}
*/

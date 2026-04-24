#!/usr/bin/env node

/**
 * Phase 25AO: force the saved AF at 0x058621 / 0x05862F onto the Z side
 * by clearing bit 5 of IY+68 (0xD000C4) before dispatch.
 *
 * Static control path:
 *   0x05861D call 0x058212
 *   0x058621 push af
 *   0x05862F pop af
 *   0x058630 jr nz, 0x05866A
 *
 * 0x058212 begins with:
 *   0x058212 call 0x0800B8
 *   0x058216 jr z, 0x05821D
 *
 * and 0x0800B8 is:
 *   0x0800B8 bit 5, (iy+68)
 *   0x0800BC ret
 *
 * So clearing bit 5 at 0xD000C4 forces Z=1 at the helper return that is
 * immediately saved by PUSH AF.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rom = readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0xfffff6;
const SECOND_PASS_ENTRY = 0x0585e9;
const SECOND_PASS_BUDGET = 500000;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const CX_MAIN_ADDR = 0xd007ca;
const CX_PPUTAWAY_ADDR = 0xd007cd;
const CX_PUTAWAY_ADDR = 0xd007d0;
const CX_REDISP_ADDR = 0xd007d3;
const CX_ERROREP_ADDR = 0xd007d6;
const CX_SIZEWIND_ADDR = 0xd007d9;
const CX_PAGE_ADDR = 0xd007dc;
const CX_CUR_APP_ADDR = 0xd007e0;
const CX_CONTEXT_END_ADDR = 0xd007e1;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const HOME_SCREEN_APP_ID = 0x40;
const SECOND_PASS_CX_CUR_APP = 0x00;
const K_ENTER = 0x05;
const FAKE_RET = 0xfffffe;
const DEFAULT_MAX_LOOP_ITER = 8192;

const FORCE_Z_ADDR = IY_ADDR + 68;
const FORCE_Z_MASK = 0x20;
const FORCE_Z_LABEL = 'IY+68 bit 5 / 0xD000C4';

const PUSH_AF_PC = 0x058621;
const POP_AF_PC = 0x05862f;
const PARSECMD_TRAMPOLINE_PC = 0x099910;
const PARSEINP_PC = 0x099914;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const MONITORED_ADDRS = [
  { addr: PUSH_AF_PC, label: 'push af before history helper returns' },
  { addr: POP_AF_PC, label: 'pop af before jr nz' },
  { addr: PARSECMD_TRAMPOLINE_PC, label: 'ParseCmd trampoline' },
  { addr: PARSEINP_PC, label: 'ParseInp entry' },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i += 1) {
    parts.push((mem[addr + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function memWrap(mem) {
  return {
    write8(addr, value) { mem[addr] = value & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function safeReadReal(mem, addr) {
  try {
    return readReal(memWrap(mem), addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

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
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return boot;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function makeSentinelError(termination, pc) {
  const error = new Error('__SENTINEL__');
  error.isSentinel = true;
  error.termination = termination;
  error.pc = pc & 0xffffff;
  return error;
}

function runDirect(executor, entry, options = {}) {
  const sentinelMap = options.sentinels ?? new Map();
  let steps = 0;
  let finalPc = entry & 0xffffff;
  let finalMode = 'adl';
  let termination = 'unknown';
  let loopsForced = 0;
  let missingBlockObserved = false;

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: options.maxSteps ?? 100000,
      maxLoopIterations: options.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITER,
      onLoopBreak(pc, mode, loopHitCount, fallthroughTarget) {
        loopsForced += 1;
        if (options.onLoopBreak) {
          options.onLoopBreak(pc & 0xffffff, mode, loopHitCount, fallthroughTarget);
        }
      },
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        if (options.onBlock) options.onBlock(norm, mode, meta, stepNumber);
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        missingBlockObserved = true;
        if (options.onMissingBlock) options.onMissingBlock(norm, mode, stepNumber);
      },
      onDynamicTarget(target, mode, fromPc, step) {
        if (options.onDynamicTarget) {
          options.onDynamicTarget(target & 0xffffff, mode, fromPc & 0xffffff, (step ?? 0) + 1);
        }
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    finalMode = result.lastMode ?? finalMode;
    termination = result.termination ?? 'unknown';
    loopsForced = Math.max(loopsForced, result.loopsForced ?? 0);
    if ((result.missingBlocks?.length ?? 0) > 0 || termination === 'missing_block') {
      missingBlockObserved = true;
    }

    return {
      steps,
      finalPc,
      finalMode,
      termination,
      loopsForced,
      missingBlockObserved,
    };
  } catch (error) {
    if (error?.isSentinel) {
      return {
        steps,
        finalPc: error.pc,
        finalMode,
        termination: error.termination,
        loopsForced,
        missingBlockObserved,
      };
    }
    throw error;
  }
}

function runMemInit(runtime) {
  const { mem, cpu, executor } = runtime;
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runDirect(executor, MEMINIT_ENTRY, {
    maxSteps: 100000,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });
}

function seedCxContext(mem) {
  mem.fill(0x00, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR + 1);
  write24(mem, CX_MAIN_ADDR, SECOND_PASS_ENTRY);
  write24(mem, CX_PPUTAWAY_ADDR, 0x058b19);
  write24(mem, CX_PUTAWAY_ADDR, 0x058b7e);
  write24(mem, CX_REDISP_ADDR, 0x0582bc);
  write24(mem, CX_ERROREP_ADDR, 0x058ba9);
  write24(mem, CX_SIZEWIND_ADDR, 0x058c01);
  mem[CX_PAGE_ADDR] = 0x00;
  mem[CX_PAGE_ADDR + 1] = 0x00;
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
}

function seedParserState(mem) {
  mem.fill(0x00, USERMEM_ADDR, USERMEM_ADDR + 0x20);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedErrorFrame(cpu, mem) {
  const frameBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, frameBase, FAKE_RET);
  write24(mem, frameBase + 3, 0x000000);
  write24(mem, ERR_SP_ADDR, frameBase);
  mem[ERR_NO_ADDR] = 0x00;
  cpu.sp = frameBase;
  return {
    frameBase,
    bytes: hexBytes(mem, frameBase, 6),
  };
}

function createHitMap() {
  const map = new Map();
  for (const target of MONITORED_ADDRS) {
    map.set(target.addr, {
      addr: target.addr,
      label: target.label,
      totalHits: 0,
      steps: [],
    });
  }
  return map;
}

function recordHit(hits, pc, step) {
  const hit = hits.get(pc);
  if (!hit) return;
  hit.totalHits += 1;
  if (hit.steps.length < 16) hit.steps.push(step);
}

function simplifyHit(hits, addr) {
  const hit = hits.get(addr);
  return {
    addr: hex(addr),
    label: hit?.label ?? 'unknown',
    hit: (hit?.totalHits ?? 0) > 0,
    totalHits: hit?.totalHits ?? 0,
    steps: hit?.steps ?? [],
  };
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    transcript.push(line);
    console.log(line);
  };

  log('=== Phase 25AO: force Z at the saved AF used by 0x058630 JR NZ ===');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  const boot = coldBoot(executor, cpu, mem);
  log(`boot: steps=${boot.steps ?? 'n/a'} term=${boot.termination ?? 'n/a'} lastPc=${hex((boot.lastPc ?? 0) & 0xffffff)}`);

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);

  prepareCallState(cpu, mem);
  seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);
  mem[CX_CUR_APP_ADDR] = SECOND_PASS_CX_CUR_APP;

  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  const iy68Before = mem[FORCE_Z_ADDR] & 0xff;
  mem[FORCE_Z_ADDR] = iy68Before & ~FORCE_Z_MASK;
  const iy68After = mem[FORCE_Z_ADDR] & 0xff;

  log(`tokens @ ${hex(USERMEM_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);
  log(`forcing Z source: ${FORCE_Z_LABEL}, before=${hex(iy68Before, 2)} after=${hex(iy68After, 2)}`);
  log(`dispatch regs: A=${hex(cpu.a, 2)} B=${hex(cpu.b, 2)} IY=${hex(IY_ADDR)} IX=${hex(IX_ADDR)} SP=${hex(cpu.sp)}`);

  const hits = createHitMap();
  const uniquePcs = new Set();
  let afBeforePush = null;

  const run = runDirect(executor, SECOND_PASS_ENTRY, {
    maxSteps: SECOND_PASS_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, _meta, stepNumber) {
      uniquePcs.add(pc);
      recordHit(hits, pc, stepNumber);

      if (pc === PUSH_AF_PC && afBeforePush === null) {
        afBeforePush = {
          step: stepNumber,
          a: cpu.a & 0xff,
          f: cpu.f & 0xff,
          af: cpu.af & 0xffff,
          zSet: (cpu.f & 0x40) !== 0,
        };
      }
    },
    onMissingBlock(pc, _mode, stepNumber) {
      uniquePcs.add(pc);
      recordHit(hits, pc, stepNumber);
    },
  });

  const op1Hex = hexBytes(mem, OP1_ADDR, 9);
  const op1Decoded = safeReadReal(mem, OP1_ADDR);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  const summary = {
    entry: hex(SECOND_PASS_ENTRY),
    budget: SECOND_PASS_BUDGET,
    run: {
      termination: run.termination,
      steps: run.steps,
      finalPc: hex(run.finalPc),
      finalMode: run.finalMode,
      loopsForced: run.loopsForced,
      missingBlockObserved: run.missingBlockObserved,
    },
    forceZ: {
      location: hex(FORCE_Z_ADDR),
      label: FORCE_Z_LABEL,
      clearMask: hex(FORCE_Z_MASK, 2),
      before: hex(iy68Before, 2),
      after: hex(iy68After, 2),
      zReason: '0x0800B8 BIT 5,(IY+68) sets Z when bit 5 is clear',
    },
    afBeforePush,
    hits: {
      pushAf: simplifyHit(hits, PUSH_AF_PC),
      popAf: simplifyHit(hits, POP_AF_PC),
      parseCmdTrampoline: simplifyHit(hits, PARSECMD_TRAMPOLINE_PC),
      parseInp: simplifyHit(hits, PARSEINP_PC),
    },
    op1: {
      addr: hex(OP1_ADDR),
      bytes: op1Hex,
      decoded: op1Decoded,
    },
    errNo: {
      addr: hex(ERR_NO_ADDR),
      value: hex(errNo, 2),
    },
    uniquePcs: {
      count: uniquePcs.size,
      sampleFirstSeen: Array.from(uniquePcs).slice(0, 64).map((pc) => hex(pc)),
    },
    parserPointers: {
      begPC: hex(read24(mem, BEGPC_ADDR)),
      curPC: hex(read24(mem, CURPC_ADDR)),
      endPC: hex(read24(mem, ENDPC_ADDR)),
    },
  };

  log();
  log('Summary JSON:');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});

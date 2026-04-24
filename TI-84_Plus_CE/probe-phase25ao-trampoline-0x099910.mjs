#!/usr/bin/env node

/**
 * Phase 25AO: compare the 0x099910 trampoline against direct ParseInp.
 *
 * The task-requested seed family places tokenized "2+3" at userMem (0xD1A881)
 * with endPC = 0xD1A885. That does NOT reproduce the known-good 918-step
 * ParseInp control path from the committed Phase 25X probe, so this probe also
 * runs the validated scratch-buffer baseline at 0xD00800 to isolate whether
 * the behavior change comes from the trampoline or from token placement.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const decoderSource = fs.readFileSync(path.join(__dirname, 'ez80-decoder.js'), 'utf8');
const { decodeInstruction } = await import(
  `data:text/javascript;base64,${Buffer.from(decoderSource).toString('base64')}`,
);

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const TRAMPOLINE_ENTRY = 0x099910;
const PARSEINP_ENTRY = 0x099914;
const PREFUNC_ADDR = 0x07ff81;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const USERMEM_TOKEN_BASE = 0xd1a881;
const SCRATCH_TOKEN_BASE = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const MEMINIT_BUDGET = 100000;
const CALL_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 40;

const SEED_FAMILIES = [
  {
    id: 'requested-userMem',
    description: 'Task-requested seed: tokens at 0xD1A881, endPC one past end',
    tokenBase: USERMEM_TOKEN_BASE,
    endPc: USERMEM_TOKEN_BASE + INPUT_TOKENS.length,
  },
  {
    id: 'validated-scratch',
    description: 'Known-good Phase 25X-style baseline: tokens at 0xD00800, endPC at final token',
    tokenBase: SCRATCH_TOKEN_BASE,
    endPc: SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1,
  },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
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
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}` : String(value);
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function formatPointerSnapshot(s) {
  return [
    `tempMem=${hex(s.tempMem)}`,
    `FPSbase=${hex(s.fpsBase)}`,
    `FPS=${hex(s.fps)}`,
    `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`,
    `pTemp=${hex(s.pTemp)}`,
    `progPtr=${hex(s.progPtr)}`,
    `begPC=${hex(s.begPC)}`,
    `curPC=${hex(s.curPC)}`,
    `endPC=${hex(s.endPC)}`,
    `errSP=${hex(s.errSP)}`,
    `errNo=${hex(s.errNo, 2)}`,
  ].join(' ');
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
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
  cpu._iy = 0xd00080;
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

  return bootResult;
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

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function runCall(executor, cpu, mem, { entry, returnPc, budget }) {
  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let missingBlock = false;
  let stepCount = 0;
  let visitedPrefunc = false;
  const recentPcs = [];

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
    if (norm === PREFUNC_ADDR) visitedPrefunc = true;
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === returnPc) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        notePc(pc, step);
      },
    });

    finalPc = result.lastPc ?? finalPc;
    termination = result.termination ?? termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      termination = 'return_hit';
      finalPc = returnPc;
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
    } else {
      throw error;
    }
  }

  let op1Decoded;
  try {
    op1Decoded = readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    op1Decoded = `readReal error: ${error?.message ?? error}`;
  }

  return {
    entry,
    returnHit,
    errCaught,
    missingBlock,
    termination,
    finalPc,
    stepCount,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    op1Bytes: hexBytes(mem, OP1_ADDR, 9),
    op1Decoded,
    visitedPrefunc,
    recentPcs: recentPcs.map((pc) => hex(pc)),
    after: snapshotPointers(mem),
  };
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  const result = runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    returnPc: MEMINIT_RET,
    budget: MEMINIT_BUDGET,
  });

  if (!result.returnHit) {
    throw new Error(`MEM_INIT failed: termination=${result.termination} finalPc=${hex(result.finalPc ?? 0)}`);
  }

  return result;
}

function seedScenario(mem, cpu, family) {
  mem.fill(0x00, family.tokenBase, family.tokenBase + 0x80);
  mem.set(INPUT_TOKENS, family.tokenBase);

  write24(mem, BEGPC_ADDR, family.tokenBase);
  write24(mem, CURPC_ADDR, family.tokenBase);
  write24(mem, ENDPC_ADDR, family.endPc);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  write24(mem, cpu.sp, FAKE_RET);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    mainSp: cpu.sp & 0xffffff,
    errFrameBase,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
  };
}

function runScenario(family, entry) {
  const { mem, executor, cpu } = createEnv();
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  const postMemInit = snapshotPointers(mem);

  prepareCallState(cpu, mem);
  const frame = seedScenario(mem, cpu, family);
  const seeded = snapshotPointers(mem);
  const call = runCall(executor, cpu, mem, {
    entry,
    returnPc: FAKE_RET,
    budget: CALL_BUDGET,
  });

  return {
    boot,
    memInit,
    postMemInit,
    frame,
    seeded,
    call,
  };
}

function formatInstruction(inst) {
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  switch (inst.tag) {
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-imm': return `ld ${inst.dest}, 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `ld (${inst.indexRegister}${disp(inst.displacement)}), 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'alu-ind': return `${inst.op} (${inst.indirectRegister})`;
    case 'indexed-cb-res': return `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind': return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    default: return inst.tag;
  }
}

function disassembleWindow(startAddr, maxBytes, stopAtRet = false) {
  const rows = [];
  let pc = startAddr;
  const end = Math.min(romBytes.length, startAddr + maxBytes);

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    if (!inst || inst.length <= 0) break;
    rows.push({
      pc: inst.pc,
      bytes: hexBytes(romBytes, inst.pc, inst.length),
      text: formatInstruction(inst),
    });
    pc += inst.length;
    if (stopAtRet && inst.tag === 'ret') break;
  }

  return rows;
}

function printDisassembly(log, title, rows) {
  log(title);
  for (const row of rows) {
    log(`  ${hex(row.pc)}: ${row.bytes.padEnd(17)} ${row.text}`);
  }
}

function printScenario(log, family, label, result) {
  log(`\n[${family.id}] ${label}`);
  log(`  ${family.description}`);
  log(`  tokenBase=${hex(family.tokenBase)} endPC=${hex(family.endPc)} bytes=[${hexArray(INPUT_TOKENS)}]`);
  log(`  post-MEM_INIT: ${formatPointerSnapshot(result.postMemInit)}`);
  log(`  seeded:        ${formatPointerSnapshot(result.seeded)}`);
  log(`  frame: mainSP=${hex(result.frame.mainSp)} [${result.frame.mainReturnBytes}] errFrame=${hex(result.frame.errFrameBase)} [${result.frame.errFrameBytes}]`);
  log(`  call: term=${result.call.termination} finalPc=${hex(result.call.finalPc ?? 0)} steps=${result.call.stepCount}`);
  log(`  errNo=${hex(result.call.errNo, 2)} OP1=[${result.call.op1Bytes}] decoded=${formatNumber(result.call.op1Decoded)}`);
  log(`  visited 0x07FF81=${result.call.visitedPrefunc} missingBlock=${result.call.missingBlock}`);
  log(`  recent PCs: ${result.call.recentPcs.join(' ')}`);
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25AO: 0x099910 trampoline vs direct ParseInp ===');
  log(`transpiled blocks: 0x099910=${Boolean(BLOCKS['099910:adl'])} 0x099914=${Boolean(BLOCKS['099914:adl'])}`);
  log(`transpile seed note: scripts/transpile-ti84-rom.mjs includes { pc: 0x099910, mode: 'adl' }`);

  log('');
  printDisassembly(log, 'Disassembly: 0x099910 window', disassembleWindow(TRAMPOLINE_ENTRY, 0x18));
  log('');
  printDisassembly(log, 'Disassembly: 0x07FF81 helper', disassembleWindow(PREFUNC_ADDR, 0x30, true));
  log('');
  printDisassembly(log, 'Disassembly: 0x04C940 helper', disassembleWindow(0x04c940, 0x10, true));

  for (const family of SEED_FAMILIES) {
    const direct = runScenario(family, PARSEINP_ENTRY);
    const trampoline = runScenario(family, TRAMPOLINE_ENTRY);

    log('');
    log(`=== Seed family: ${family.id} ===`);
    printScenario(log, family, 'direct 0x099914', direct);
    printScenario(log, family, 'trampoline 0x099910', trampoline);

    log('\n  comparison');
    log(`  steps: direct=${direct.call.stepCount} trampoline=${trampoline.call.stepCount}`);
    log(`  errNo: direct=${hex(direct.call.errNo, 2)} trampoline=${hex(trampoline.call.errNo, 2)}`);
    log(`  OP1:   direct=${formatNumber(direct.call.op1Decoded)} trampoline=${formatNumber(trampoline.call.op1Decoded)}`);
    log(`  0x07FF81 visited: direct=${direct.call.visitedPrefunc} trampoline=${trampoline.call.visitedPrefunc}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}

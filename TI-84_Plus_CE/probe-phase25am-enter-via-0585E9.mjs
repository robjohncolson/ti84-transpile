#!/usr/bin/env node

/**
 * Phase 25AM: run the home-screen second-pass handler (0x0585E9) with
 * A=5 / kEnter and trace whether it reaches 0x099211 -> ParseInp.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25am-enter-via-0585E9-report.md');
const REPORT_TITLE = 'Phase 25AM - Run 0x0585E9 with A=5 (kEnter)';

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
const SECOND_PASS_BUDGET = 200000;

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

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_CNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;
const FLASH_SIZE_ADDR = 0xd025c5;

const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const FAKE_RET = 0xfffffe;
const DEFAULT_MAX_LOOP_ITER = 8192;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const MONITORED_ADDRS = [
  { addr: 0x099211, label: '0x099211 expression evaluation entry' },
  { addr: 0x099914, label: '0x099914 ParseInp' },
  { addr: 0x0973c8, label: '0x0973C8 ENTER key path with dual ParseInp' },
  { addr: 0x058d54, label: '0x058D54 setup helper' },
  { addr: 0x058ba3, label: '0x058BA3 setup helper' },
  { addr: 0x058b5c, label: '0x058B5C setup helper' },
  { addr: 0x03fbf9, label: '0x03FBF9 shared pre-parse helper' },
  { addr: 0x05840b, label: '0x05840B setup helper' },
  { addr: 0x058212, label: '0x058212 setup helper' },
  { addr: 0x0581ae, label: '0x0581AE setup helper' },
  { addr: 0x058626, label: '0x058626 CALL 0x099211 site' },
  { addr: 0x05877a, label: '0x05877A non-ENTER path' },
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

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTempCnt: read24(mem, PTEMP_CNT_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    flashSize: read24(mem, FLASH_SIZE_ADDR),
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function formatPointerSnapshot(snapshot) {
  return [
    `tempMem=${hex(snapshot.tempMem)}`,
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTempCnt=${hex(snapshot.pTempCnt)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `newDataPtr=${hex(snapshot.newDataPtr)}`,
    `flashSize=${hex(snapshot.flashSize)}`,
    `begPC=${hex(snapshot.begPC)}`,
    `curPC=${hex(snapshot.curPC)}`,
    `endPC=${hex(snapshot.endPC)}`,
    `errSP=${hex(snapshot.errSP)}`,
    `errNo=${hex(snapshot.errNo, 2)}`,
  ].join(' ');
}

function snapshotCxContext(mem) {
  return {
    cxMain: read24(mem, CX_MAIN_ADDR),
    cxPPutaway: read24(mem, CX_PPUTAWAY_ADDR),
    cxPutaway: read24(mem, CX_PUTAWAY_ADDR),
    cxRedisp: read24(mem, CX_REDISP_ADDR),
    cxErrorEP: read24(mem, CX_ERROREP_ADDR),
    cxSizeWind: read24(mem, CX_SIZEWIND_ADDR),
    cxPageLo: mem[CX_PAGE_ADDR] & 0xff,
    cxPageHi: mem[CX_PAGE_ADDR + 1] & 0xff,
    cxCurApp: mem[CX_CUR_APP_ADDR] & 0xff,
    raw: hexBytes(mem, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR - CX_MAIN_ADDR + 1),
  };
}

function formatCxSnapshot(snapshot) {
  return [
    `cxMain=${hex(snapshot.cxMain)}`,
    `cxPPutaway=${hex(snapshot.cxPPutaway)}`,
    `cxPutaway=${hex(snapshot.cxPutaway)}`,
    `cxRedisp=${hex(snapshot.cxRedisp)}`,
    `cxErrorEP=${hex(snapshot.cxErrorEP)}`,
    `cxSizeWind=${hex(snapshot.cxSizeWind)}`,
    `cxPage=${hex((snapshot.cxPageLo | (snapshot.cxPageHi << 8)) >>> 0, 4)}`,
    `cxCurApp=${hex(snapshot.cxCurApp, 2)}`,
    `raw=[${snapshot.raw}]`,
  ].join(' ');
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

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
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
  write24(mem, CX_MAIN_ADDR, 0x0585e9);
  write24(mem, CX_PPUTAWAY_ADDR, 0x058b19);
  write24(mem, CX_PUTAWAY_ADDR, 0x058b7e);
  write24(mem, CX_REDISP_ADDR, 0x0582bc);
  write24(mem, CX_ERROREP_ADDR, 0x058ba9);
  write24(mem, CX_SIZEWIND_ADDR, 0x058c01);
  mem[CX_PAGE_ADDR] = 0x00;
  mem[CX_PAGE_ADDR + 1] = 0x00;
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
  return snapshotCxContext(mem);
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

function createHitState() {
  const hits = new Map();
  for (const target of MONITORED_ADDRS) {
    hits.set(target.addr, {
      addr: target.addr,
      label: target.label,
      totalHits: 0,
      steps: [],
    });
  }
  return hits;
}

function recordHit(hits, pc, step) {
  const hit = hits.get(pc);
  if (!hit) return;
  hit.totalHits += 1;
  if (hit.steps.length < 16) hit.steps.push(step);
}

function formatHitSteps(hit) {
  if (hit.totalHits === 0) return 'not hit';
  const shown = hit.steps.join(', ');
  const suffix = hit.totalHits > hit.steps.length ? ` (+${hit.totalHits - hit.steps.length} more)` : '';
  return `${shown}${suffix}`;
}

function describeErrNo(errNo) {
  return errNo === 0x00 ? `${hex(errNo, 2)} (no error)` : hex(errNo, 2);
}

function writeReport(details) {
  const reached099211 = details.hits.get(0x099211)?.totalHits > 0;
  const reachedParseInp = details.hits.get(0x099914)?.totalHits > 0;
  const hitNonEnter = details.hits.get(0x05877a)?.totalHits > 0;

  let analysis;
  if (reached099211 && reachedParseInp) {
    analysis = 'The run reached both 0x099211 and 0x099914, which confirms the CoorMon -> HomeHandler -> 0x0585E9 -> 0x099211 -> ParseInp chain for the seeded ENTER path.';
  } else if (reached099211) {
    analysis = 'The run reached 0x099211 but did not record a hit at 0x099914 before termination, so the chain is confirmed only through the expression-evaluation entry.';
  } else if (hitNonEnter) {
    analysis = 'The run fell into the non-ENTER branch at 0x05877A, so this probe did not confirm the expression-evaluation chain.';
  } else {
    analysis = 'The run did not record a hit at 0x099211, so this probe did not confirm the expression-evaluation chain.';
  }

  const lines = [
    `# ${REPORT_TITLE}`,
    '',
    '## Date',
    '',
    new Date().toISOString(),
    '',
    '## Setup',
    '',
    `- Entry: \`${hex(SECOND_PASS_ENTRY)}\` with \`A=${hex(K_ENTER, 2)}\` and \`B=${hex(K_ENTER, 2)}\``,
    `- MEM_INIT entry: \`${hex(MEMINIT_ENTRY)}\``,
    `- MEM_INIT result: termination=\`${details.memInit.termination}\`, steps=\`${details.memInit.steps}\`, finalPc=\`${hex(details.memInit.finalPc)}\``,
    `- cx context: ${formatCxSnapshot(details.cxSnapshot)}`,
    `- Tokens @ \`${hex(USERMEM_ADDR)}\`: \`${hexArray(INPUT_TOKENS)}\``,
    `- begPC/curPC/endPC: \`${hex(details.prePointers.begPC)}\`, \`${hex(details.prePointers.curPC)}\`, \`${hex(details.prePointers.endPC)}\``,
    `- Error frame @ \`${hex(details.errFrame.frameBase)}\`: [${details.errFrame.bytes}]`,
    '',
    '## Run Result',
    '',
    `- Termination: \`${details.run.termination}\``,
    `- Steps: \`${details.run.steps}\``,
    `- Final PC: \`${hex(details.run.finalPc)}\``,
    `- Loops forced: \`${details.run.loopsForced}\``,
    `- Missing block observed: \`${details.run.missingBlockObserved}\``,
    `- 0x099211 reached: \`${reached099211}\``,
    `- 0x099914 reached: \`${reachedParseInp}\``,
    `- 0x05877A hit: \`${hitNonEnter}\``,
    '',
    '## Monitored Address Hits',
    '',
    '| Address | Meaning | Hit Count | Step(s) |',
    '| --- | --- | ---: | --- |',
    ...MONITORED_ADDRS.map(({ addr }) => {
      const hit = details.hits.get(addr);
      return `| \`${hex(addr)}\` | ${hit.label} | ${hit.totalHits} | ${formatHitSteps(hit)} |`;
    }),
    '',
    '## Output State',
    '',
    `- OP1 bytes @ \`${hex(OP1_ADDR)}\`: [${details.op1Hex}]`,
    `- OP1 decoded: \`${String(details.op1Decoded)}\``,
    `- errNo: \`${describeErrNo(details.errNo)}\``,
    `- Final pointer snapshot: ${formatPointerSnapshot(details.postPointers)}`,
    '',
    '## Analysis',
    '',
    analysis,
    '',
    '## Console Output',
    '',
    '```text',
    ...details.transcript,
    '```',
  ];

  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText, transcript) {
  const lines = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '## Console Output',
    '',
    '```text',
    ...transcript,
    '```',
    '',
    '## Error',
    '',
    '```text',
    ...String(errorText).split(/\r?\n/),
    '```',
  ];
  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AM: ENTER via 0x0585E9 -> 0x099211 -> ParseInp ===');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  const boot = coldBoot(executor, cpu, mem);
  const postBootPointers = snapshotPointers(mem);
  log(`boot: steps=${boot.steps} term=${boot.termination} lastPc=${hex(boot.lastPc ?? 0)}`);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);

  const memInit = runMemInit(runtime);
  const postMemInitPointers = snapshotPointers(mem);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);

  prepareCallState(cpu, mem);
  const cxSnapshot = seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);

  // 0x0585F9 restores A from B before the compare at 0x058602, so seed both.
  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  const prePointers = snapshotPointers(mem);
  log(`cx seed: ${formatCxSnapshot(cxSnapshot)}`);
  log(`tokens @ ${hex(USERMEM_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`pre-run pointers: ${formatPointerSnapshot(prePointers)}`);
  log(`error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);
  log(`dispatch regs: A=${hex(cpu.a, 2)} B=${hex(cpu.b, 2)} SP=${hex(cpu.sp)}`);

  const hits = createHitState();
  const run = runDirect(executor, SECOND_PASS_ENTRY, {
    maxSteps: SECOND_PASS_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, _meta, stepNumber) {
      recordHit(hits, pc, stepNumber);
    },
    onMissingBlock(pc, _mode, stepNumber) {
      recordHit(hits, pc, stepNumber);
    },
  });

  const postPointers = snapshotPointers(mem);
  const op1Hex = hexBytes(mem, OP1_ADDR, 9);
  const op1Decoded = safeReadReal(mem, OP1_ADDR);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  log(`run: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  for (const { addr, label } of MONITORED_ADDRS) {
    const hit = hits.get(addr);
    log(`${hex(addr)} ${label}: count=${hit.totalHits} steps=${formatHitSteps(hit)}`);
  }
  log(`OP1 @ ${hex(OP1_ADDR)}: [${op1Hex}] decoded=${String(op1Decoded)}`);
  log(`errNo=${describeErrNo(errNo)}`);
  log(`post-run pointers: ${formatPointerSnapshot(postPointers)}`);

  writeReport({
    transcript,
    memInit,
    prePointers,
    postPointers,
    cxSnapshot,
    errFrame,
    run,
    hits,
    op1Hex,
    op1Decoded,
    errNo,
  });

  log(`report written: ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFailureReport(message, []);
  process.exitCode = 1;
}

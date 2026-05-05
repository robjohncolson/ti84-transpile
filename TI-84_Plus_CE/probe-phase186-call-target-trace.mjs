#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(
    'Missing TI-84_Plus_CE/ROM.transpiled.js. Gunzip ROM.transpiled.js.gz first, then rerun this probe.',
  );
}

const romBytes = fs.readFileSync(ROM_PATH);
const { PRELIFTED_BLOCKS: BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const FAKE_RET = 0x7FFFFE;
const MEMINIT_RET = 0x7FFFF6;
const SENTINEL_STOP = '__PHASE186_SENTINEL__';

const BOOT = 0x000000;
const KERNEL_INIT = 0x08C331;
const POST_INIT = 0x0802B2;
const MEM_INIT = 0x09DEE0;

const MBASE = 0xD0;
const IY = 0xD00080;
const IX = 0xD1A860;

const TOKEN_STAGING = 0xD0230E;
const OP1 = 0xD005F8;
const KBD_SCAN_CODE = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GET_KY = 0xD0058D;

const CONV_KEY_TO_TOK = 0x05C52C;
const COPY9BYTES = 0x07F9FB;
const KEY_CLASSIFIER = 0x07F7BD;
const BUF_INSERT = 0x05E2A0;
const DIRECT_ENTRY = 0x05849F;

const STEP_LIMIT = 500;
const DIRECT_STEP_LIMIT = 5000;
const STAGING_SIZE = 9;
const EVENT_LIMIT = 20;
const BLOCK_LIMIT = 24;
const HIT_LIMIT = 12;

const SEEDED_KEY_CODE = 0x92;
const SEEDED_RAW_SCAN = 0x42;
const DIRECT_STAGING_SEED = Uint8Array.from([0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const CALL_TARGETS = [
  { entry: 0x06EDFE, label: '0x06EDFE (RstGFlags?)' },
  { entry: 0x083623, label: '0x083623 (CleanAll)' },
  { entry: 0x083764, label: '0x083764 (post-CleanAll helper)' },
  { entry: 0x0800EC, label: '0x0800EC (ResetWinTop?)' },
  { entry: 0x0A223A, label: '0x0A223A (ClrWindow)' },
  { entry: 0x058C65, label: '0x058C65 (home helper)' },
];

const ZERO_STAGING = Array.from({ length: STAGING_SIZE }, () => '00').join(' ');

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (v) => hexByte(v)).join(' ');
}

function read24(buffer, addr) {
  return ((buffer[addr] & 0xFF) | ((buffer[addr + 1] & 0xFF) << 8) | ((buffer[addr + 2] & 0xFF) << 16)) >>> 0;
}

function write24(buffer, addr, value) {
  buffer[addr] = value & 0xFF;
  buffer[addr + 1] = (value >>> 8) & 0xFF;
  buffer[addr + 2] = (value >>> 16) & 0xFF;
}

function cap(list, item, limit = EVENT_LIMIT) {
  if (list.length < limit) list.push(item);
}

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE;
  cpu._iy = IY;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return { boot, kernel, post };
}

function prepCpu(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY;
  cpu._ix = IX;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runMemInit(executor, cpu, mem) {
  prepCpu(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 4096,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return { returned, result };
}

function pushSentinelChain(mem, cpu, depth = 4) {
  cpu.sp -= depth * 3;
  for (let i = 0; i < depth; i += 1) {
    write24(mem, cpu.sp + (i * 3), FAKE_RET);
  }
}

function overlaps(addr, width, start, length) {
  const end = addr + width;
  return addr < start + length && end > start;
}

function overlapSlice(addr, width, start, length) {
  const overlapStart = Math.max(addr, start);
  const overlapEnd = Math.min(addr + width, start + length);
  if (overlapStart >= overlapEnd) return null;
  return { start: overlapStart, length: overlapEnd - overlapStart, offset: overlapStart - addr };
}

function installWatchers(cpu, mem) {
  const events = {
    kbdReads: [],
    kbdWrites: [],
    tokenReads: [],
    tokenWrites: [],
    op1Reads: [],
    op1Writes: [],
  };

  const original = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  const trackedKeys = [
    { addr: KBD_SCAN_CODE, label: 'kbdScanCode' },
    { addr: KBD_KEY, label: 'kbdKey' },
    { addr: KBD_GET_KY, label: 'kbdGetKy' },
  ];

  function currentPc() {
    return hex(cpu._currentBlockPc & 0xFFFFFF);
  }

  function recordExactRead(addr, width, list, label, value) {
    if (overlaps(addr, width, label.addr, 1)) {
      cap(list, {
        pc: currentPc(),
        addr: hex(label.addr),
        label: label.label,
        width,
        value,
      });
    }
  }

  function recordRangeRead(addr, width, start, label, list, value) {
    const hit = overlapSlice(addr, width, start, STAGING_SIZE);
    if (!hit) return;
    cap(list, {
      pc: currentPc(),
      addr: hex(addr),
      label,
      width,
      overlap: `${hex(hit.start)}+${hit.length}`,
      value,
      bytes: hexBytes(mem, hit.start, hit.length),
    });
  }

  function recordExactWrite(addr, width, list, label, beforeBytes) {
    if (overlaps(addr, width, label.addr, 1)) {
      const offset = Math.max(0, label.addr - addr);
      cap(list, {
        pc: currentPc(),
        addr: hex(label.addr),
        label: label.label,
        width,
        before: beforeBytes[offset] !== undefined ? hexByte(beforeBytes[offset]) : 'n/a',
        after: hexByte(mem[label.addr]),
      });
    }
  }

  function recordRangeWrite(addr, width, start, label, list, beforeBytes) {
    const hit = overlapSlice(addr, width, start, STAGING_SIZE);
    if (!hit) return;
    cap(list, {
      pc: currentPc(),
      addr: hex(addr),
      label,
      width,
      overlap: `${hex(hit.start)}+${hit.length}`,
      before: Array.from(beforeBytes.slice(hit.offset, hit.offset + hit.length), (v) => hexByte(v)).join(' '),
      after: hexBytes(mem, hit.start, hit.length),
    });
  }

  function wrapRead(width, originalRead) {
    return (addr) => {
      const normalized = Number(addr) & 0xFFFFFF;
      const value = originalRead(normalized);
      const rendered = width === 1 ? hexByte(value) : hex(value, width * 2);

      for (const label of trackedKeys) {
        recordExactRead(normalized, width, events.kbdReads, label, rendered);
      }
      recordRangeRead(normalized, width, TOKEN_STAGING, 'TOKEN_STAGING', events.tokenReads, rendered);
      recordRangeRead(normalized, width, OP1, 'OP1', events.op1Reads, rendered);
      return value;
    };
  }

  function wrapWrite(width, originalWrite) {
    return (addr, value) => {
      const normalized = Number(addr) & 0xFFFFFF;
      const beforeBytes = Array.from(mem.slice(normalized, normalized + width));
      originalWrite(normalized, value);

      for (const label of trackedKeys) {
        recordExactWrite(normalized, width, events.kbdWrites, label, beforeBytes);
      }
      recordRangeWrite(normalized, width, TOKEN_STAGING, 'TOKEN_STAGING', events.tokenWrites, beforeBytes);
      recordRangeWrite(normalized, width, OP1, 'OP1', events.op1Writes, beforeBytes);
    };
  }

  cpu.read8 = wrapRead(1, original.read8);
  cpu.read16 = wrapRead(2, original.read16);
  cpu.read24 = wrapRead(3, original.read24);
  cpu.write8 = wrapWrite(1, original.write8);
  cpu.write16 = wrapWrite(2, original.write16);
  cpu.write24 = wrapWrite(3, original.write24);

  return () => {
    cpu.read8 = original.read8;
    cpu.read16 = original.read16;
    cpu.read24 = original.read24;
    cpu.write8 = original.write8;
    cpu.write16 = original.write16;
    cpu.write24 = original.write24;
    return events;
  };
}

function seedKeyInputs(mem, cpu) {
  cpu.a = SEEDED_KEY_CODE;
  mem[KBD_SCAN_CODE] = SEEDED_RAW_SCAN;
  mem[KBD_KEY] = SEEDED_KEY_CODE;
  mem[KBD_GET_KY] = SEEDED_KEY_CODE;
}

function setupFailureResult({ entry, label, stepLimit, directSeed, error }) {
  return {
    entry,
    label,
    stepLimit,
    directSeed: directSeed ? Array.from(directSeed, (v) => hexByte(v)).join(' ') : null,
    bootTerminations: {
      boot: 'setup_exception',
      kernel: 'setup_exception',
      post: 'setup_exception',
      memInit: 'setup_exception',
    },
    memInitReturned: false,
    termination: 'setup_exception',
    hit: null,
    error: error?.message ?? String(error),
    steps: 0,
    beforeToken: directSeed ? Array.from(directSeed, (v) => hexByte(v)).join(' ') : ZERO_STAGING,
    afterToken: directSeed ? Array.from(directSeed, (v) => hexByte(v)).join(' ') : ZERO_STAGING,
    tokenChanged: false,
    beforeOp1: ZERO_STAGING,
    afterOp1: ZERO_STAGING,
    op1Changed: false,
    finalRegs: {
      a: hex(0, 2),
      e: hex(0, 2),
      hl: hex(0),
      de: hex(0),
      sp: hex(0),
    },
    blockLog: [],
    hits: {
      convKeyToTok: [],
      copy9Bytes: [],
      keyClassifier: [],
      bufInsert: [],
    },
    events: {
      kbdReads: [],
      kbdWrites: [],
      tokenReads: [],
      tokenWrites: [],
      op1Reads: [],
      op1Writes: [],
    },
  };
}

function runTrace({ entry, label, stepLimit, directSeed = null }) {
  let mem;
  let executor;
  let cpu;
  let bootInfo;
  let memInitInfo;

  try {
    ({ mem, executor, cpu } = createEnv());
    bootInfo = coldBoot(executor, cpu, mem);
    memInitInfo = runMemInit(executor, cpu, mem);
  } catch (setupError) {
    return setupFailureResult({ entry, label, stepLimit, directSeed, error: setupError });
  }

  mem.fill(0x00, TOKEN_STAGING, TOKEN_STAGING + STAGING_SIZE);
  mem.fill(0x00, OP1, OP1 + STAGING_SIZE);
  if (directSeed) {
    mem.set(directSeed, TOKEN_STAGING);
  }

  prepCpu(cpu, mem);
  seedKeyInputs(mem, cpu);
  pushSentinelChain(mem, cpu);

  const beforeToken = hexBytes(mem, TOKEN_STAGING, STAGING_SIZE);
  const beforeOp1 = hexBytes(mem, OP1, STAGING_SIZE);
  const releaseWatchers = installWatchers(cpu, mem);

  const blockLog = [];
  const hits = {
    convKeyToTok: [],
    copy9Bytes: [],
    keyClassifier: [],
    bufInsert: [],
  };

  let lastStep = 0;
  let termination = 'unknown';
  let hit = null;
  let error = null;
  let result = null;

  try {
    result = executor.runFrom(entry, 'adl', {
      maxSteps: stepLimit,
      maxLoopIterations: directSeed ? 2048 : 256,
      onBlock(pc, mode, meta, step) {
        const normalizedPc = pc & 0xFFFFFF;
        lastStep = step;
        cap(blockLog, hex(normalizedPc), BLOCK_LIMIT);

        if (normalizedPc === CONV_KEY_TO_TOK) {
          cap(hits.convKeyToTok, { step, pc: hex(normalizedPc) }, HIT_LIMIT);
        }
        if (normalizedPc === COPY9BYTES) {
          cap(hits.copy9Bytes, { step, pc: hex(normalizedPc), hl: hex(cpu.hl), de: hex(cpu.de) }, HIT_LIMIT);
        }
        if (normalizedPc === KEY_CLASSIFIER) {
          cap(hits.keyClassifier, { step, pc: hex(normalizedPc), a: hex(cpu.a, 2) }, HIT_LIMIT);
        }
        if (normalizedPc === BUF_INSERT) {
          cap(hits.bufInsert, { step, pc: hex(normalizedPc), de: hex(cpu.de), hl: hex(cpu.hl) }, HIT_LIMIT);
        }
        if (normalizedPc === FAKE_RET) {
          hit = 'sentinel';
          throw new Error(SENTINEL_STOP);
        }
      },
      onMissingBlock(pc, mode, step) {
        const normalizedPc = pc & 0xFFFFFF;
        lastStep = step;
        cap(blockLog, `MISSING:${hex(normalizedPc)}`, BLOCK_LIMIT);
        if (normalizedPc === FAKE_RET) {
          hit = 'sentinel';
          throw new Error(SENTINEL_STOP);
        }
      },
    });
    termination = result.termination ?? 'completed';
  } catch (traceError) {
    if (traceError?.message === SENTINEL_STOP) {
      termination = 'sentinel';
    } else {
      termination = 'exception';
      error = traceError?.message ?? String(traceError);
    }
  }

  const events = releaseWatchers();
  const afterToken = hexBytes(mem, TOKEN_STAGING, STAGING_SIZE);
  const afterOp1 = hexBytes(mem, OP1, STAGING_SIZE);

  return {
    entry,
    label,
    stepLimit,
    directSeed: directSeed ? Array.from(directSeed, (v) => hexByte(v)).join(' ') : null,
    bootTerminations: {
      boot: bootInfo.boot.termination,
      kernel: bootInfo.kernel.termination,
      post: bootInfo.post.termination,
      memInit: memInitInfo.returned ? 'sentinel_return' : (memInitInfo.result?.termination ?? 'unknown'),
    },
    memInitReturned: memInitInfo.returned,
    termination,
    hit,
    error,
    steps: result?.steps ?? lastStep,
    beforeToken,
    afterToken,
    tokenChanged: beforeToken !== afterToken,
    beforeOp1,
    afterOp1,
    op1Changed: beforeOp1 !== afterOp1,
    finalRegs: {
      a: hex(cpu.a, 2),
      e: hex(cpu.e, 2),
      hl: hex(cpu.hl),
      de: hex(cpu.de),
      sp: hex(cpu.sp),
    },
    blockLog,
    hits,
    events,
  };
}

function renderEvents(title, rows) {
  if (!rows.length) {
    console.log(`  ${title}: none`);
    return;
  }

  console.log(`  ${title}:`);
  for (const row of rows) {
    const detail = Object.entries(row)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    console.log(`    ${detail}`);
  }
}

function printResult(result) {
  console.log(`\n=== ${result.label} ===`);
  console.log(`  entry=${hex(result.entry)} term=${result.termination} steps=${result.steps} memInit=${result.memInitReturned ? 'returned' : 'not_returned'}`);
  console.log(`  seed A=${hex(SEEDED_KEY_CODE, 2)} rawScan=${hex(SEEDED_RAW_SCAN, 2)} tokenBefore=${result.beforeToken}`);
  if (result.directSeed) {
    console.log(`  directSeed=${result.directSeed}`);
  }
  console.log(`  tokenAfter=${result.afterToken} ${result.tokenChanged ? '[changed]' : '[unchanged]'}`);
  console.log(`  op1After=${result.afterOp1} ${result.op1Changed ? '[changed]' : '[unchanged]'}`);
  console.log(`  finalRegs A=${result.finalRegs.a} E=${result.finalRegs.e} HL=${result.finalRegs.hl} DE=${result.finalRegs.de} SP=${result.finalRegs.sp}`);
  console.log(
    `  helperHits ConvKeyToTok=${result.hits.convKeyToTok.length} Copy9Bytes=${result.hits.copy9Bytes.length} ` +
    `KeyClassifier=${result.hits.keyClassifier.length} BufInsert=${result.hits.bufInsert.length}`,
  );
  console.log(`  bootTerminations boot=${result.bootTerminations.boot} kernel=${result.bootTerminations.kernel} post=${result.bootTerminations.post} memInit=${result.bootTerminations.memInit}`);
  renderEvents('kbdReads', result.events.kbdReads);
  renderEvents('tokenReads', result.events.tokenReads);
  renderEvents('tokenWrites', result.events.tokenWrites);
  renderEvents('op1Reads', result.events.op1Reads);
  renderEvents('op1Writes', result.events.op1Writes);
  console.log(`  blocks: ${result.blockLog.join(' -> ') || '(none)'}`);
  if (result.error) {
    console.log(`  error: ${result.error}`);
  }
}

function printSummary(callResults, directResult) {
  console.log('\n=== Summary ===');
  for (const result of callResults) {
    const wroteToken = result.events.tokenWrites.length > 0 ? 'yes' : 'no';
    const readKbd = result.events.kbdReads.length > 0 ? 'yes' : 'no';
    console.log(
      `  ${hex(result.entry)} tokenChanged=${result.tokenChanged ? 'yes' : 'no'} tokenWrites=${wroteToken} ` +
      `kbdReads=${readKbd} op1Changed=${result.op1Changed ? 'yes' : 'no'} term=${result.termination}`,
    );
  }

  const candidates = callResults.filter((result) => result.tokenChanged || result.events.tokenWrites.length > 0);
  if (candidates.length) {
    console.log(`  TOKEN_STAGING writers: ${candidates.map((result) => hex(result.entry)).join(', ')}`);
  } else {
    console.log('  TOKEN_STAGING writers: none observed within the 500-step standalone runs');
  }

  console.log(
    `  direct ${hex(directResult.entry)} copyHits=${directResult.hits.copy9Bytes.length} ` +
    `classifierHits=${directResult.hits.keyClassifier.length} bufInsertHits=${directResult.hits.bufInsert.length} ` +
    `tokenReads=${directResult.events.tokenReads.length} op1Writes=${directResult.events.op1Writes.length} ` +
    `op1Changed=${directResult.op1Changed ? 'yes' : 'no'} term=${directResult.termination}`,
  );
}

function main() {
  console.log('Phase 186: Home Handler CALL Target Trace');
  console.log('=========================================');
  console.log('');
  console.log(`Seeded translated key code: A=${hex(SEEDED_KEY_CODE, 2)}`);
  console.log(`Seeded raw scan byte: ${hex(KBD_SCAN_CODE)}=${hex(SEEDED_RAW_SCAN, 2)}`);
  console.log(`Seeded key vars: ${hex(KBD_KEY)}=${hex(SEEDED_KEY_CODE, 2)} ${hex(KBD_GET_KY)}=${hex(SEEDED_KEY_CODE, 2)}`);
  console.log(`Standalone step limit: ${STEP_LIMIT}`);
  console.log(`Direct-path step limit: ${DIRECT_STEP_LIMIT}`);

  const callResults = CALL_TARGETS.map((target) => runTrace({
    entry: target.entry,
    label: target.label,
    stepLimit: STEP_LIMIT,
  }));

  for (const result of callResults) {
    printResult(result);
  }

  const directResult = runTrace({
    entry: DIRECT_ENTRY,
    label: '0x05849F (copy -> classify -> dispatch path)',
    stepLimit: DIRECT_STEP_LIMIT,
    directSeed: DIRECT_STAGING_SEED,
  });
  printResult(directResult);
  printSummary(callResults, directResult);
}

main();

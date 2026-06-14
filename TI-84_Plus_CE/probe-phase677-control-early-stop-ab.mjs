import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase677-control-early-stop-ab.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const OUTER_LOOP = 0x08C331;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const EDIT_BASE = 0xD1A8CC;
const EDIT_CURSOR = 0xD0243A;
const STOP = Symbol('phase677-stop');

const PRIME_KEY = Object.freeze({
  label: '2',
  code: 'Digit2',
  osScan: 0x1A,
  internal: 0x90,
  expected: 0x32,
  maxSteps: 120000,
});

const CONTROL_KEYS = Object.freeze([
  {
    label: 'ENTER',
    code: 'Enter',
    osScan: 0x09,
    internal: 0x05,
    maxSteps: 300000,
    destructivePc: 0x0A2150,
    observedAfterPc: 0x0A2156,
  },
  {
    label: 'CLEAR',
    code: 'Escape',
    osScan: 0x0F,
    internal: 0x0F,
    maxSteps: 350000,
    destructivePc: 0x001879,
    observedAfterPc: 0x0018F8,
  },
]);

const CANDIDATES = Object.freeze([
  {
    name: 'baseline',
    description: 'let the control key run until the first destructive clear is observed',
    mode: 'baseline',
  },
  {
    name: 'pre-stop',
    description: 'stop before executing the first destructive block',
    mode: 'preStop',
  },
  {
    name: 'post-restore',
    description: 'execute the destructive block, restore the pre-block snapshot on the next block, then stop',
    mode: 'postRestore',
  },
]);

const VAT_SNAPSHOT_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02587', 0xD02587, 3],
  ['D0258A', 0xD0258A, 3],
  ['D0258D', 0xD0258D, 3],
  ['D02590', 0xD02590, 3],
  ['D02593', 0xD02593, 3],
  ['D0259A', 0xD0259A, 3],
  ['D0259D', 0xD0259D, 3],
  ['D025A0', 0xD025A0, 3],
  ['D025C5', 0xD025C5, 3],
]);

const STATE_RANGES = Object.freeze([
  ['iyFlags', 0xD00080, 0x60],
  ['keyState', 0xD00580, 0x20],
  ['homeContext', 0xD007CA, 0x130],
  ['editPointers', 0xD02317, 0x150],
  ['vatPointers', 0xD02587, 0x50],
  ['tokenWalk', 0xD02A28, 0x30],
  ['editBuffer', EDIT_BASE, 0x100],
]);

function hex(value, width = 6) {
  if (value == null) return '-';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[addr + i] << (i * 8);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[addr + i] = (value >>> (i * 8)) & 0xFF;
}

function read24(mem, addr) {
  return readValue(mem, addr, 3);
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function countVRAMPixels(mem) {
  let count = 0;
  for (let addr = 0xD40000; addr < 0xD40000 + 320 * 240 * 2; addr += 2) {
    const word = mem[addr] | (mem[addr + 1] << 8);
    if (word !== 0xFFFF) count += 1;
  }
  return count;
}

function captureFields(mem, fields = VAT_SNAPSHOT_FIELDS) {
  return fields.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: readValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function restoreFields(mem, snapshot) {
  for (const field of snapshot) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
}

function captureRanges(mem, includeVram = false) {
  const ranges = STATE_RANGES.map(([name, start, len]) => ({
    name,
    start,
    len,
    bytes: mem.slice(start, start + len),
  }));
  if (includeVram) {
    ranges.push({
      name: 'vram',
      start: 0xD40000,
      len: 320 * 240 * 2,
      bytes: mem.slice(0xD40000, 0xD40000 + 320 * 240 * 2),
    });
  }
  return ranges;
}

function restoreRanges(mem, snapshot) {
  for (const range of snapshot) mem.set(range.bytes, range.start);
}

function makeMachine() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function prepareEventFrame(mem, peripherals, cpu) {
  peripherals.setTimerEnabled(true);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_TOP - 24;
  fillSentinel(mem, cpu.sp, 24);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
  write24(mem, 0xD008E0, cpu.sp);
}

function rearmHomeContext(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function seedEditContext(mem) {
  const tokenCursor = 0xD2A83E;
  write24(mem, 0xD02317, tokenCursor);
  write24(mem, 0xD0231A, tokenCursor);
  write24(mem, 0xD0231D, tokenCursor - 1);
  mem.fill(0, 0xD02430, 0xD02460);
  write24(mem, 0xD02437, EDIT_BASE);
  write24(mem, 0xD0243A, EDIT_BASE);
  write24(mem, 0xD0243D, tokenCursor);
  write24(mem, 0xD02440, tokenCursor);
  write24(mem, 0xD0244D, 0xD3FE89);
  mem[0xD02455] = 0x07;
  mem[0xD0245D] = 0x01;
  mem[0xD000A3] = 0x0A;
  write24(mem, 0xD02A40, tokenCursor);
  mem[0xD02A29] = 0;
  mem[0xD02A2A] = 0;
  mem.fill(0, EDIT_BASE, EDIT_BASE + 0x80);
  mem[0xD1A8C0] = 0x0C;
  mem[0xD1A8C1] = 0x00;
  mem[0xD1A8C2] = 0x07;
}

function seedKey(mem, key) {
  mem[0xD0058C] = key.internal;
  mem[0xD0058D] = key.internal;
  mem[0xD0058E] = key.internal;
  mem[0xD00587] = key.osScan;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function formatRun(result) {
  return {
    steps: result.steps,
    termination: result.termination,
    lastPc: hex(result.lastPc ?? 0),
    lastMode: result.lastMode,
  };
}

function bootBrowserRecipe() {
  const { mem, peripherals, executor, cpu } = makeMachine();
  const phases = [];

  phases.push({
    name: 'p1-coldboot',
    result: executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }),
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({
    name: 'p2-kernel',
    result: executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }),
  });

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({
    name: 'p3-postinit',
    result: executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }),
  });

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({
    name: 'p4-warm-idle',
    result: executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }),
  });

  peripherals.setTimerEnabled(false);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24;
  fillSentinel(mem, cpu.sp, 24);
  write24(mem, cpu.sp, WARM_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  let vatSnapshot = null;
  const p5 = executor.runFrom(LAUNCH_HOME, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      if (vatSnapshot || (pc & 0xFFFFFF) !== 0x001879) return;
      if (read24(mem, 0xD02590) === 0) return;
      vatSnapshot = captureFields(mem);
    },
  });
  phases.push({ name: 'p5-launch-home', result: p5 });
  if (!vatSnapshot) throw new Error('VAT/context snapshot was not captured before phase5 clear');

  restoreFields(mem, vatSnapshot);
  prepareEventFrame(mem, peripherals, cpu);
  phases.push({
    name: 'p6-repaint',
    result: executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 }),
  });

  seedEditContext(mem);
  return {
    mem,
    peripherals,
    executor,
    cpu,
    phases: phases.map((phase) => ({ name: phase.name, result: formatRun(phase.result) })),
  };
}

function runPrimeInsert(machine) {
  const { mem, peripherals, executor, cpu } = machine;
  const cursorBefore = read24(mem, EDIT_CURSOR);
  const expectedCursor = (cursorBefore + 1) & 0xFFFFFF;
  let insertBlock = null;
  let blockCount = 0;
  let lastPc = OUTER_LOOP;
  let stopSteps = 0;

  rearmHomeContext(mem);
  seedKey(mem, PRIME_KEY);
  prepareEventFrame(mem, peripherals, cpu);

  try {
    const result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: PRIME_KEY.maxSteps,
      maxLoopIterations: PRIME_KEY.maxSteps,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc, mode, meta, steps) {
        blockCount += 1;
        lastPc = pc & 0xFFFFFF;
        const inserted = mem[cursorBefore] === PRIME_KEY.expected && read24(mem, EDIT_CURSOR) === expectedCursor;
        if (inserted && insertBlock === null) insertBlock = blockCount;
        if (insertBlock !== null && blockCount - insertBlock >= 1000) {
          stopSteps = steps;
          throw STOP;
        }
      },
    });
    stopSteps = result.steps;
    lastPc = result.lastPc & 0xFFFFFF;
  } catch (error) {
    if (error !== STOP) throw error;
  }

  return {
    cursorBefore,
    insertBlock,
    steps: stopSteps,
    blocks: blockCount,
    lastPc,
    D0243A: read24(mem, EDIT_CURSOR),
    D007CA: read24(mem, 0xD007CA),
    buffer: Array.from(mem.slice(EDIT_BASE, EDIT_BASE + 8)),
    vramPixels: countVRAMPixels(mem),
    pass: insertBlock !== null
      && read24(mem, EDIT_CURSOR) === expectedCursor
      && mem[cursorBefore] === PRIME_KEY.expected,
  };
}

function stateSnapshot(mem) {
  return {
    D007CA: read24(mem, 0xD007CA),
    D008E0: read24(mem, 0xD008E0),
    D0243A: read24(mem, EDIT_CURSOR),
    D0243D: read24(mem, 0xD0243D),
    D02590: read24(mem, 0xD02590),
    D0259D: read24(mem, 0xD0259D),
    D02A40: read24(mem, 0xD02A40),
    D00587: mem[0xD00587],
    D0058C: mem[0xD0058C],
    D0058D: mem[0xD0058D],
    D0058E: mem[0xD0058E],
    D00080: mem[0xD00080],
    D0009F: mem[0xD0009F],
    D02A28: mem[0xD02A28],
    buffer: Array.from(mem.slice(EDIT_BASE, EDIT_BASE + 8)),
    vramPixels: countVRAMPixels(mem),
  };
}

function classifyState(before, after) {
  const contextSafe = after.D007CA === 0x0585E9
    && after.D02590 === before.D02590
    && after.D02590 !== 0
    && after.buffer[0] === PRIME_KEY.expected
    && after.buffer.slice(1).every((byte) => byte === 0)
    && after.vramPixels > 100;
  const cursorPreserved = after.D0243A === before.D0243A;
  const cursorRewoundOne = after.D0243A === ((before.D0243A - 1) & 0xFFFFFF);
  const stateSafe = after.D007CA === 0x0585E9
    && after.D0243D === before.D0243D
    && after.D02590 === before.D02590
    && after.D02590 !== 0
    && after.D02A40 === before.D02A40
    && after.buffer[0] === PRIME_KEY.expected
    && after.buffer.slice(1).every((byte) => byte === 0)
    && after.vramPixels > 100
    && (cursorPreserved || cursorRewoundOne);
  return {
    contextSafe,
    stateSafe,
    cursorPreserved,
    cursorRewoundOne,
    cursorEffect: cursorPreserved ? 'preserved' : cursorRewoundOne ? 'rewound-one' : 'changed',
  };
}

function stateDiff(before, after) {
  const diffs = [];
  for (const key of Object.keys(before)) {
    if (Array.isArray(before[key])) {
      if (before[key].join(',') !== after[key].join(',')) diffs.push(key);
    } else if (before[key] !== after[key]) {
      diffs.push(key);
    }
  }
  return diffs;
}

function runControlCandidate(machine, key, candidate) {
  const { mem, peripherals, executor, cpu } = machine;
  const before = stateSnapshot(mem);
  let blockCount = 0;
  let lastPc = OUTER_LOOP;
  let lastMode = 'adl';
  let lastSteps = 0;
  let stopReason = null;
  let destructiveHit = null;
  let observedAfterHit = null;
  let preDestructiveSnapshot = null;
  let restoreBlock = null;
  let result = null;
  let contextLdirHits = 0;
  let bulkBodyHits = 0;
  let bulkTailHits = 0;

  rearmHomeContext(mem);
  seedKey(mem, key);
  prepareEventFrame(mem, peripherals, cpu);

  try {
    result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: key.maxSteps,
      maxLoopIterations: key.maxSteps,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc, mode, meta, steps) {
        const addr = pc & 0xFFFFFF;
        blockCount += 1;
        lastPc = addr;
        lastMode = mode;
        lastSteps = steps;

        if (addr === 0x0A2150) contextLdirHits += 1;
        if (addr === 0x001879) bulkBodyHits += 1;
        if (addr === 0x0018F8) bulkTailHits += 1;

        if (candidate.mode === 'preStop' && addr === key.destructivePc) {
          destructiveHit = { pc: addr, step: steps, block: blockCount };
          stopReason = 'pre_destructive_stop';
          throw STOP;
        }

        if (candidate.mode === 'postRestore' && addr === key.destructivePc && !preDestructiveSnapshot) {
          preDestructiveSnapshot = captureRanges(mem, true);
          destructiveHit = { pc: addr, step: steps, block: blockCount };
        } else if (candidate.mode === 'postRestore' && preDestructiveSnapshot && addr === key.observedAfterPc) {
          observedAfterHit = { pc: addr, step: steps, block: blockCount };
          restoreRanges(mem, preDestructiveSnapshot);
          restoreBlock = blockCount;
          stopReason = 'post_destructive_restore_stop';
          throw STOP;
        }

        if (candidate.mode === 'baseline' && destructiveHit == null && addr === key.destructivePc) {
          destructiveHit = { pc: addr, step: steps, block: blockCount };
        }

        if (candidate.mode === 'baseline' && destructiveHit && blockCount - destructiveHit.block > 128) {
          stopReason = 'after_first_destructive_clear';
          throw STOP;
        }
      },
    });
  } catch (error) {
    if (error !== STOP) throw error;
    result = {
      steps: lastSteps,
      termination: stopReason ?? 'early_stop',
      lastPc,
      lastMode,
    };
  }

  const after = stateSnapshot(mem);
  const safety = classifyState(before, after);
  return {
    key: key.label,
    candidate: candidate.name,
    description: candidate.description,
    result: formatRun(result),
    blocks: blockCount,
    destructiveHit,
    observedAfterHit,
    restoreBlock,
    contextLdirHits,
    bulkBodyHits,
    bulkTailHits,
    before,
    after,
    diffs: stateDiff(before, after),
    preserved: safety.stateSafe,
    safety,
    expectedClean: candidate.mode === 'baseline' ? false : true,
  };
}

function runScenario(key, candidate) {
  const machine = bootBrowserRecipe();
  const prime = runPrimeInsert(machine);
  const control = runControlCandidate(machine, key, candidate);
  return {
    key: key.label,
    candidate: candidate.name,
    prime,
    phases: machine.phases,
    control,
    pass: prime.pass && (candidate.mode === 'baseline'
      ? !control.preserved && Boolean(control.destructiveHit)
      : control.preserved && Boolean(control.destructiveHit)),
  };
}

function fmtState(state) {
  return {
    D007CA: hex(state.D007CA),
    D008E0: hex(state.D008E0),
    D0243A: hex(state.D0243A),
    D0243D: hex(state.D0243D),
    D02590: hex(state.D02590),
    D0259D: hex(state.D0259D),
    D02A40: hex(state.D02A40),
    D00587: hex(state.D00587, 2),
    D0058C: hex(state.D0058C, 2),
    D0058D: hex(state.D0058D, 2),
    D0058E: hex(state.D0058E, 2),
    D00080: hex(state.D00080, 2),
    D0009F: hex(state.D0009F, 2),
    D02A28: hex(state.D02A28, 2),
    buffer: state.buffer.map((byte) => hex(byte, 2)).join(' '),
    vramPixels: state.vramPixels,
  };
}

function compactRow(row) {
  const c = row.control;
  return {
    key: row.key,
    candidate: row.candidate,
    pass: row.pass,
    primePass: row.prime.pass,
    result: c.result,
    destructiveHit: c.destructiveHit && {
      pc: hex(c.destructiveHit.pc),
      step: c.destructiveHit.step,
      block: c.destructiveHit.block,
    },
    observedAfterHit: c.observedAfterHit && {
      pc: hex(c.observedAfterHit.pc),
      step: c.observedAfterHit.step,
      block: c.observedAfterHit.block,
    },
    restoreBlock: c.restoreBlock,
    hits: {
      contextLdir: c.contextLdirHits,
      bulkClearBody: c.bulkBodyHits,
      bulkTail: c.bulkTailHits,
    },
    preserved: c.preserved,
    safety: c.safety,
    diffs: c.diffs,
    before: fmtState(c.before),
    after: fmtState(c.after),
  };
}

function buildReport(summary) {
  const lines = [
    '# Phase 677: Control-Key Early-Stop/Persistence A/B',
    '',
    'Probe: `probe-phase677-control-early-stop-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase677-control-early-stop-ab.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${summary.pass ? '**PASS**' : '**FAIL**'}`,
    '- Scope: probe-only direct Node harness mirroring browser coldboot/VAT replay/edit-context seeding; no browser-shell/runtime/transpiler edits.',
    '',
    '## Findings',
    '',
    ...summary.findings.map((finding) => `- ${finding}`),
    '',
    '## Candidate Matrix',
    '',
    '| key | candidate | pass | termination | destructive hit | observed-after hit | restore block | state safe | cursor effect | D007CA after | D0243A after | VAT after | buffer after | VRAM after | changed fields |',
    '|---|---|---|---|---:|---:|---:|---|---|---:|---:|---:|---|---:|---|',
    ...summary.rows.map((row) => {
      const c = row.control;
      return `| ${row.key} | ${row.candidate} | ${row.pass ? 'yes' : 'no'} | ${c.result.termination} ${c.result.lastPc} | ${hex(c.destructiveHit?.pc)}@${c.destructiveHit?.step ?? '-'} | ${hex(c.observedAfterHit?.pc)}@${c.observedAfterHit?.step ?? '-'} | ${c.restoreBlock ?? '-'} | ${c.preserved ? 'yes' : 'no'} | ${c.safety.cursorEffect} | ${hex(c.after.D007CA)} | ${hex(c.after.D0243A)} | ${hex(c.after.D02590)} | ${c.after.buffer.map((byte) => hex(byte, 2)).join(' ')} | ${c.after.vramPixels} | ${c.diffs.join(', ') || '-'} |`;
    }),
    '',
    '## Interpretation',
    '',
    '- `pre-stop` is the clean browser-compatible candidate for state persistence: it hits the first destructive block but stops before executing it, so cxMain context, VAT, edit buffer, and display remain intact.',
    '- ENTER leaves the cursor unchanged after the primed digit; CLEAR has already rewound the cursor one byte before its destructive clear, so it is state-safe but not a full semantic clear of the visible digit.',
    '- `post-restore` also preserves state, but only by executing the destructive block and restoring a broad state/VRAM snapshot on the following block. That is heavier than the pre-stop candidate and is less attractive for browser-shell wiring.',
    '- Baseline confirms the comparison is meaningful: letting either control reach its destructive clear loses D007CA/edit/VAT state.',
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(summary.compact, null, 2),
    '```',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

console.log('phase677: control-key early-stop/persistence A/B');
const rows = [];
for (const key of CONTROL_KEYS) {
  for (const candidate of CANDIDATES) {
    rows.push(runScenario(key, candidate));
  }
}

const preStopRows = rows.filter((row) => row.candidate === 'pre-stop');
const postRestoreRows = rows.filter((row) => row.candidate === 'post-restore');
const baselineRows = rows.filter((row) => row.candidate === 'baseline');
const pass = rows.every((row) => row.pass);
const findings = [
  ...preStopRows.map((row) => `${row.key}: pre-stop at ${hex(row.control.destructiveHit?.pc)} step ${row.control.destructiveHit?.step} preserves D007CA=${hex(row.control.after.D007CA)}, D0243A=${hex(row.control.after.D0243A)}, VAT=${hex(row.control.after.D02590)}, buffer=${row.control.after.buffer.map((byte) => hex(byte, 2)).join(' ')}, VRAM=${row.control.after.vramPixels}.`),
  ...postRestoreRows.map((row) => `${row.key}: post-restore after ${hex(row.control.observedAfterHit?.pc)} also preserves state, but requires broad state+VRAM snapshot restore.`),
  ...baselineRows.map((row) => `${row.key}: baseline reaches ${hex(row.control.destructiveHit?.pc)} and does not preserve state (after D007CA=${hex(row.control.after.D007CA)}, D0243A=${hex(row.control.after.D0243A)}, VAT=${hex(row.control.after.D02590)}).`),
];
const summary = {
  probe: 'phase677-control-early-stop-ab',
  pass,
  findings,
  rows,
  compact: rows.map(compactRow),
};

fs.writeFileSync(REPORT_PATH, buildReport(summary));
console.log(JSON.stringify({
  probe: summary.probe,
  pass,
  findings,
  rows: summary.compact.map((row) => ({
    key: row.key,
    candidate: row.candidate,
    pass: row.pass,
    termination: row.result.termination,
    destructiveHit: row.destructiveHit,
    observedAfterHit: row.observedAfterHit,
    preserved: row.preserved,
    after: {
      D007CA: row.after.D007CA,
      D0243A: row.after.D0243A,
      D02590: row.after.D02590,
      buffer: row.after.buffer,
      vramPixels: row.after.vramPixels,
    },
  })),
}, null, 2));

if (!pass) process.exitCode = 1;

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase681-insert-settling-ab.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_TOP = 0xD1A87E;
const OUTER_LOOP = 0x08C331;
const WARM_IDLE = 0x0019BE;
const HALT = 0x0019B5;
const LAUNCH_HOME_INIT = 0x09DD62;
const HOME_REPAINT = 0x058241;
const WIPE = 0x0018F8;
const EDIT_BASE = 0xD1A8CC;
const TOKEN_CURSOR = 0xD2A83E;
const MAX_SETTLE_STEPS = 300000;
const STOP = Symbol('phase681-stop');

const DIGIT2 = Object.freeze({
  name: 'Digit2',
  group: 3,
  bit: 1,
  osScan: 0x1A,
  internal: 0x90,
  expected: 0x32,
});

const WATCH = Object.freeze({
  isr: 0x000038,
  getcsc: 0x03FA09,
  keyRelay: 0x02FE73,
  cxMain: 0x0585E9,
  charDispatch: 0x058EDA,
  cleanupEntry: 0x001879,
  wipe: WIPE,
});

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'pc', 'stepCount', '_sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2',
  'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
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

function makeMachine() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function captureCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) cpu[field] = snapshot[field];
  cpu.spWarnings = [];
}

function rearmHomeContext(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function refreshEditContextForCursor(mem, cursor) {
  write24(mem, 0xD02317, TOKEN_CURSOR);
  write24(mem, 0xD0231A, TOKEN_CURSOR);
  write24(mem, 0xD0231D, TOKEN_CURSOR - 1);

  mem.fill(0, 0xD02430, 0xD02460);
  write24(mem, 0xD02437, cursor);
  write24(mem, 0xD0243A, cursor);
  write24(mem, 0xD0243D, TOKEN_CURSOR);
  write24(mem, 0xD02440, TOKEN_CURSOR);
  write24(mem, 0xD0244D, 0xD3FE89);
  mem[0xD02455] = 0x07;
  mem[0xD0245D] = 0x01;

  mem[0xD000A3] = 0x0A;
  write24(mem, 0xD02A40, TOKEN_CURSOR);
  mem[0xD02A29] = 0;
  mem[0xD02A2A] = 0;
}

function seedColdbootEditContext(mem) {
  refreshEditContextForCursor(mem, EDIT_BASE);
  mem[0xD1A8C0] = 0x0C;
  mem[0xD1A8C1] = 0x00;
  mem[0xD1A8C2] = 0x07;
  mem.fill(0, EDIT_BASE, EDIT_BASE + 0x80);
}

function seedDigit2Key(mem) {
  mem[0xD0058C] = DIGIT2.internal;
  mem[0xD0058D] = DIGIT2.internal;
  mem[0xD0058E] = DIGIT2.internal;
  mem[0xD00587] = DIGIT2.osScan;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function clearKeyRam(mem) {
  mem[0xD00587] = 0;
  mem[0xD0058C] = 0;
  mem[0xD0058D] = 0;
  mem[0xD0058E] = 0;
  mem[0xD00080] &= ~0x08;
  mem[0xD0009F] &= ~0x20;
}

function prepareBrowserFrame(mem, cpu) {
  rearmHomeContext(mem);
  seedDigit2Key(mem);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_TOP - 27;
  fillSentinel(mem, cpu.sp, 27);
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xD008E0, cpu.sp);
}

function resetKeyboard(peripherals) {
  peripherals.keyboard.keyMatrix.fill(0xFF);
  peripherals.keyboardController.groupSelect = 0xFF;
}

function pressMatrixKey(peripherals) {
  peripherals.setMatrixKey(DIGIT2.group, DIGIT2.bit, true);
}

function releaseMatrixKey(peripherals, mem) {
  peripherals.setMatrixKey(DIGIT2.group, DIGIT2.bit, false);
  peripherals.clearKeyPressed(mem);
}

function readBuffer(mem, len = 8) {
  return Array.from(mem.slice(EDIT_BASE, EDIT_BASE + len));
}

function formatBytes(bytes) {
  return bytes.map((byte) => hex(byte, 2)).join(' ');
}

function snap(mem, cpu, peripherals) {
  return {
    pc: hex(cpu.pc),
    f: hex(cpu.f, 2),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    sp: hex(cpu.sp),
    errSp: hex(read24(mem, 0xD008E0)),
    D00587: hex(mem[0xD00587], 2),
    D0058C: hex(mem[0xD0058C], 2),
    D0058D: hex(mem[0xD0058D], 2),
    D0058E: hex(mem[0xD0058E], 2),
    D00080: hex(mem[0xD00080], 2),
    D0009F: hex(mem[0xD0009F], 2),
    D007CA: hex(read24(mem, 0xD007CA)),
    D0231A: hex(read24(mem, 0xD0231A)),
    D0243A: hex(read24(mem, 0xD0243A)),
    D0243D: hex(read24(mem, 0xD0243D)),
    D02590: hex(read24(mem, 0xD02590)),
    buffer: formatBytes(readBuffer(mem)),
    matrix3: hex(peripherals.keyboard.keyMatrix[3], 2),
  };
}

function bootBrowserSeededState() {
  const machine = makeMachine();
  const { mem, peripherals, executor, cpu } = machine;
  const phases = [];

  phases.push(['coldboot', executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['kernel', executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 })]);

  cpu.madl = 1; cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['postinit', executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12; fillSentinel(mem, cpu.sp, 12);
  phases.push(['warm-idle', executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 })]);

  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24; fillSentinel(mem, cpu.sp, 24);
  write24(mem, cpu.sp, WARM_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  const vatFields = [
    0xD007CA, 0xD008E0, 0xD02587, 0xD0258A, 0xD0258D, 0xD02590,
    0xD02593, 0xD0259A, 0xD0259D, 0xD025A0, 0xD025C5,
  ];
  let vatSnapshot = null;
  phases.push(['launch-home', executor.runFrom(LAUNCH_HOME_INIT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      if (vatSnapshot || (pc & 0xFFFFFF) !== 0x001879) return;
      if (read24(mem, 0xD02590) === 0) return;
      vatSnapshot = vatFields.map((addr) => [addr, read24(mem, addr)]);
    },
  })]);

  if (vatSnapshot) {
    for (const [addr, value] of vatSnapshot) write24(mem, addr, value);
  }

  peripherals.setTimerEnabled(true);
  prepareBrowserFrame(mem, cpu);
  phases.push(['repaint', executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })]);

  rearmHomeContext(mem);
  seedColdbootEditContext(mem);

  return { ...machine, phases, vatSnapshotCaptured: Boolean(vatSnapshot) };
}

function runVariant(machine, base, variant) {
  const { mem, peripherals, executor, cpu } = machine;
  mem.set(base.mem);
  restoreCpu(cpu, base.cpu);
  resetKeyboard(peripherals);
  peripherals.setTimerEnabled(true);

  prepareBrowserFrame(mem, cpu);
  if (!variant.keepPendingKey) clearKeyRam(mem);
  if (variant.matrixHeld) pressMatrixKey(peripherals);

  const before = snap(mem, cpu, peripherals);
  const counts = Object.fromEntries(Object.keys(WATCH).map((name) => [name, 0]));
  const events = [];
  const recent = [];
  let blocks = 0;
  let depositBlock = null;
  let secondDepositBlock = null;
  let firstWipeBlock = null;
  let firstWipeRecent = null;
  let firstCleanupBlock = null;
  let releaseBlock = null;
  let clearRamBlock = null;
  let stopReason = null;
  let stopSteps = null;
  let lastPc = OUTER_LOOP;
  let termination = 'unknown';

  function pushEvent(kind, pc, steps, extra = {}) {
    events.push({
      kind,
      block: blocks,
      steps,
      pc: hex(pc & 0xFFFFFF),
      state: snap(mem, cpu, peripherals),
      ...extra,
    });
  }

  try {
    const result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: variant.maxSteps ?? MAX_SETTLE_STEPS,
      maxLoopIterations: variant.maxLoopIterations ?? 500000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc, mode, meta, steps) {
        blocks += 1;
        const addr = pc & 0xFFFFFF;
        lastPc = addr;
        recent.push(hex(addr));
        if (recent.length > 40) recent.shift();

        for (const [name, target] of Object.entries(WATCH)) {
          if (addr === target) {
            counts[name] += 1;
            if (events.length < 80 || name === 'wipe' || name === 'cleanupEntry') {
              pushEvent(name, addr, steps);
            }
          }
        }

        const cursor = read24(mem, 0xD0243A);
        if (depositBlock === null && mem[EDIT_BASE] === DIGIT2.expected && cursor === EDIT_BASE + 1) {
          depositBlock = blocks;
          pushEvent('deposit1', addr, steps);
        }
        if (secondDepositBlock === null && mem[EDIT_BASE + 1] === DIGIT2.expected && cursor >= EDIT_BASE + 2) {
          secondDepositBlock = blocks;
          pushEvent('deposit2', addr, steps);
        }
        if (firstCleanupBlock === null && addr === WATCH.cleanupEntry) {
          firstCleanupBlock = blocks;
        }
        if (firstWipeBlock === null && addr === WIPE) {
          firstWipeBlock = blocks;
          firstWipeRecent = [...recent];
          pushEvent('first-wipe-recent', addr, steps, { recent: firstWipeRecent });
          if (variant.stopAtFirstWipe) {
            stopReason = 'first_wipe';
            stopSteps = steps;
            throw STOP;
          }
        }
        if (depositBlock !== null) {
          const delta = blocks - depositBlock;
          if (releaseBlock == null && variant.releaseMatrixAfterDepositBlocks != null && delta >= variant.releaseMatrixAfterDepositBlocks) {
            releaseMatrixKey(peripherals, mem);
            releaseBlock = blocks;
            pushEvent('release-matrix', addr, steps, { deltaFromDeposit: delta });
          }
          if (clearRamBlock == null && variant.clearRamAfterDepositBlocks != null && delta >= variant.clearRamAfterDepositBlocks) {
            clearKeyRam(mem);
            clearRamBlock = blocks;
            pushEvent('clear-key-ram', addr, steps, { deltaFromDeposit: delta });
          }
        }
      },
    });
    termination = result.termination;
    stopSteps = result.steps;
    lastPc = result.lastPc & 0xFFFFFF;
  } catch (error) {
    if (error !== STOP) throw error;
    termination = stopReason;
  }

  const after = snap(mem, cpu, peripherals);
  const buffer = readBuffer(mem);
  const keptSingleDeposit = buffer[0] === DIGIT2.expected && buffer[1] === 0;
  const noStateWipe = after.D007CA === hex(WATCH.cxMain) && after.D0243A !== hex(0) && after.D02590 !== hex(0);
  const noDestructiveWipe = firstWipeBlock === null && counts.wipe === 0;

  return {
    name: variant.name,
    maxSteps: variant.maxSteps ?? MAX_SETTLE_STEPS,
    matrixHeld: Boolean(variant.matrixHeld),
    keepPendingKey: Boolean(variant.keepPendingKey),
    releaseAfterDepositBlocks: variant.releaseMatrixAfterDepositBlocks ?? null,
    clearRamAfterDepositBlocks: variant.clearRamAfterDepositBlocks ?? null,
    stopAtFirstWipe: Boolean(variant.stopAtFirstWipe),
    termination,
    steps: stopSteps,
    blocks,
    lastPc: hex(lastPc),
    depositBlock,
    secondDepositBlock,
    firstCleanupBlock,
    firstWipeBlock,
    firstWipeRecent,
    cleanupDeltaFromDeposit: firstCleanupBlock == null || depositBlock == null ? null : firstCleanupBlock - depositBlock,
    wipeDeltaFromDeposit: firstWipeBlock == null || depositBlock == null ? null : firstWipeBlock - depositBlock,
    releaseBlock,
    clearRamBlock,
    counts,
    keptSingleDeposit,
    noStateWipe,
    noDestructiveWipe,
    before,
    after,
    events,
  };
}

function rowMd(row) {
  return [
    row.name,
    row.termination,
    row.steps ?? '-',
    row.depositBlock ?? '-',
    row.secondDepositBlock ?? '-',
    row.firstCleanupBlock ?? '-',
    row.firstWipeBlock ?? '-',
    row.cleanupDeltaFromDeposit ?? '-',
    row.wipeDeltaFromDeposit ?? '-',
    row.releaseBlock ?? '-',
    row.clearRamBlock ?? '-',
    row.counts.cxMain,
    row.counts.getcsc,
    row.counts.wipe,
    row.after.buffer,
    row.after.D0243A,
    row.after.D007CA,
    row.keptSingleDeposit ? 'yes' : 'no',
    row.noDestructiveWipe ? 'yes' : 'no',
  ].join(' | ');
}

function buildReport(data) {
  const lines = [
    '# Phase 681: Insert Settling A/B',
    '',
    'Probe: `probe-phase681-insert-settling-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase681-insert-settling-ab.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}`,
    `- VAT snapshot captured: ${data.vatSnapshotCaptured}`,
    `- Main finding: ${data.finding}`,
    '',
    '## Variants',
    '',
    '| variant | termination | steps | deposit1 | deposit2 | first cleanup | first wipe | cleanup-deposit delta | wipe-deposit delta | release block | clear RAM block | cxMain | GetCSC | wipes | buffer | D0243A | D007CA | single deposit | no wipe |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---|',
    ...data.results.map((row) => `| ${rowMd(row)} |`),
    '',
    '## Interpretation',
    '',
    '- The held-matrix full run reproduces the old-cap failure: the first insert succeeds, the same key can be consumed again, and then the destructive cleanup path clears state.',
    '- The duplicate insert and the destructive cleanup are separable. Releasing the matrix or clearing key RAM after the first deposit prevents the second `2`, but the `0x001879 -> 0x0018F8` cleanup still fires.',
    '- Therefore the browser early-stop is preserving more than key-release timing: it also avoids a post-insert cleanup path that runs a few thousand blocks after the successful deposit even when no second insert occurs.',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify(data.compact, null, 2),
    '```',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

console.log('phase681: insert settling A/B');
const machine = bootBrowserSeededState();
const base = {
  mem: machine.mem.slice(),
  cpu: captureCpu(machine.cpu),
  snap: snap(machine.mem, machine.cpu, machine.peripherals),
};

const variants = [
  {
    name: 'held-matrix-full-300k',
    matrixHeld: true,
    keepPendingKey: true,
  },
  {
    name: 'held-matrix-stop-first-wipe',
    matrixHeld: true,
    keepPendingKey: true,
    stopAtFirstWipe: true,
  },
  {
    name: 'no-matrix-full-300k',
    matrixHeld: false,
    keepPendingKey: true,
  },
  {
    name: 'release-matrix-at-deposit-full-300k',
    matrixHeld: true,
    keepPendingKey: true,
    releaseMatrixAfterDepositBlocks: 0,
  },
  {
    name: 'release-matrix-after-1000-blocks-full-300k',
    matrixHeld: true,
    keepPendingKey: true,
    releaseMatrixAfterDepositBlocks: 1000,
  },
  {
    name: 'clear-ram-at-deposit-while-held-full-300k',
    matrixHeld: true,
    keepPendingKey: true,
    clearRamAfterDepositBlocks: 0,
  },
  {
    name: 'no-pending-no-matrix-control',
    matrixHeld: false,
    keepPendingKey: false,
    stopAtFirstWipe: true,
  },
];

const results = variants.map((variant) => {
  const row = runVariant(machine, base, variant);
  console.log(`${row.name}: term=${row.termination} steps=${row.steps} dep1=${row.depositBlock ?? '-'} dep2=${row.secondDepositBlock ?? '-'} cleanup=${row.firstCleanupBlock ?? '-'} wipe=${row.firstWipeBlock ?? '-'} release=${row.releaseBlock ?? '-'} clear=${row.clearRamBlock ?? '-'} buf=${row.after.buffer} D0243A=${row.after.D0243A} D007CA=${row.after.D007CA}`);
  return row;
});

const held = results.find((row) => row.name === 'held-matrix-full-300k');
const releaseNow = results.find((row) => row.name === 'release-matrix-at-deposit-full-300k');
const releaseSettle = results.find((row) => row.name === 'release-matrix-after-1000-blocks-full-300k');
const clearOnly = results.find((row) => row.name === 'clear-ram-at-deposit-while-held-full-300k');
const noMatrix = results.find((row) => row.name === 'no-matrix-full-300k');

const pass = held?.secondDepositBlock != null
  && held?.firstWipeBlock != null
  && noMatrix?.secondDepositBlock != null
  && noMatrix?.firstWipeBlock != null
  && releaseNow?.secondDepositBlock == null
  && releaseNow?.firstWipeBlock != null
  && releaseNow?.keptSingleDeposit
  && releaseSettle?.secondDepositBlock == null
  && releaseSettle?.firstWipeBlock != null
  && releaseSettle?.keptSingleDeposit
  && clearOnly?.secondDepositBlock == null
  && clearOnly?.firstWipeBlock != null
  && clearOnly?.keptSingleDeposit;

const finding = pass
  ? 'duplicate inserts are key-state driven, but the old-cap state wipe is independent: even single-insert variants enter 0x001879/0x0018F8 about 4K-5K blocks after deposit'
  : 'A/B did not fully isolate the settling cause; inspect variant JSON';

const compact = {
  phases: machine.phases.map(([name, result]) => ({
    name,
    termination: result.termination,
    steps: result.steps,
    lastPc: hex(result.lastPc & 0xFFFFFF),
  })),
  base: base.snap,
  results: results.map((row) => ({
    name: row.name,
    termination: row.termination,
    steps: row.steps,
    depositBlock: row.depositBlock,
    secondDepositBlock: row.secondDepositBlock,
    firstCleanupBlock: row.firstCleanupBlock,
    firstWipeBlock: row.firstWipeBlock,
    cleanupDeltaFromDeposit: row.cleanupDeltaFromDeposit,
    wipeDeltaFromDeposit: row.wipeDeltaFromDeposit,
    releaseBlock: row.releaseBlock,
    clearRamBlock: row.clearRamBlock,
    counts: row.counts,
    keptSingleDeposit: row.keptSingleDeposit,
    noStateWipe: row.noStateWipe,
    noDestructiveWipe: row.noDestructiveWipe,
    before: row.before,
    after: row.after,
    firstWipeRecent: row.firstWipeRecent,
    firstEvents: row.events.slice(0, 12),
    lastEvents: row.events.slice(-12),
  })),
};

const summary = {
  pass,
  vatSnapshotCaptured: machine.vatSnapshotCaptured,
  finding,
  results,
  compact,
};

fs.writeFileSync(REPORT_PATH, buildReport(summary));
console.log(`finding=${finding}`);
console.log(`wrote ${path.basename(REPORT_PATH)}`);

if (!pass) process.exitCode = 1;

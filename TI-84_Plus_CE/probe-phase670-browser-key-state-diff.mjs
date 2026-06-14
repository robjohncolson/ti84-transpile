import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase670-browser-key-state-diff.md');

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
const DIGIT2 = { name: 'Digit2', group: 3, bit: 1, osScan: 0x1A, internal: 0x90, expected: 0x32 };
const STOP = Symbol('phase670-stop');

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'pc', 'stepCount', '_sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2',
  'madl', 'mbase', 'halted', 'cycles',
];

const WATCH = Object.freeze({
  tupleSave: 0x08F54B,
  saveCall: 0x08F547,
  tokenExit: 0x08F5E1,
  tokenGate: 0x090992,
  cxMain: 0x0585E9,
});

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

function rearmHomeContext(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function seedColdbootEditContext(mem) {
  write24(mem, 0xD02317, TOKEN_CURSOR);
  write24(mem, 0xD0231A, TOKEN_CURSOR);
  write24(mem, 0xD0231D, TOKEN_CURSOR - 1);

  mem.fill(0, 0xD02430, 0xD02460);
  write24(mem, 0xD02437, EDIT_BASE);
  write24(mem, 0xD0243A, EDIT_BASE);
  write24(mem, 0xD0243D, TOKEN_CURSOR);
  write24(mem, 0xD02440, TOKEN_CURSOR);
  write24(mem, 0xD0244D, 0xD3FE89);
  mem[0xD02455] = 0x07;
  mem[0xD0245D] = 0x01;

  mem[0xD000A3] = 0x0A;
  write24(mem, 0xD02A40, TOKEN_CURSOR);
  mem[0xD02A29] = 0;
  mem[0xD02A2A] = 0;
  mem.fill(0, EDIT_BASE, EDIT_BASE + 0x80);
  mem[0xD1A8C0] = 0x0C;
  mem[0xD1A8C1] = 0x00;
  mem[0xD1A8C2] = 0x07;
}

function seedDigit2Key(mem) {
  mem[0xD0058C] = DIGIT2.internal;
  mem[0xD0058D] = DIGIT2.internal;
  mem[0xD0058E] = DIGIT2.internal;
  mem[0xD00587] = DIGIT2.osScan;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function prepareProbeFrame(mem, cpu) {
  rearmHomeContext(mem);
  seedDigit2Key(mem);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xD008E0, cpu.sp);
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
  cpu.sp = STACK_TOP - 24;
  fillSentinel(mem, cpu.sp, 24);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xD008E0, cpu.sp);
}

function captureCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) cpu[field] = snapshot[field];
  cpu.spWarnings = [];
}

function resetKeyboard(peripherals) {
  peripherals.keyboard.keyMatrix.fill(0xFF);
  peripherals.keyboardController.groupSelect = 0xFF;
}

function pressMatrixKey(peripherals) {
  peripherals.setMatrixKey(DIGIT2.group, DIGIT2.bit, true);
}

function snap(mem, cpu, peripherals) {
  return {
    f: hex(cpu.f, 2),
    madl: cpu.madl,
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
    D000A3: hex(mem[0xD000A3], 2),
    D02A29: hex(readValue(mem, 0xD02A29, 2), 4),
    D02A40: hex(read24(mem, 0xD02A40)),
    header: [mem[0xD1A8C0], mem[0xD1A8C1], mem[0xD1A8C2]].map((b) => hex(b, 2)).join(' '),
    buffer: Array.from(mem.slice(EDIT_BASE, EDIT_BASE + 8)).map((b) => hex(b, 2)).join(' '),
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

  if (variant.prepare === 'browser') prepareBrowserFrame(mem, cpu);
  else prepareProbeFrame(mem, cpu);

  if (variant.forceF) cpu.f = 0x40;
  if (variant.forceMadl) cpu.madl = 1;
  if (variant.forceIx) cpu._ix = 0xD1A860;
  if (variant.browserSp) {
    cpu.sp = STACK_TOP - 27;
    write24(mem, cpu.sp, HALT);
    write24(mem, 0xD008E0, cpu.sp);
  }
  if (variant.matrixPressed) pressMatrixKey(peripherals);

  const before = snap(mem, cpu, peripherals);
  const counts = { WIPE: 0, ...Object.fromEntries(Object.keys(WATCH).map((name) => [name, 0])) };
  const runOpts = {
    maxSteps: 300000,
    maxLoopIterations: 500000,
  };
  if (variant.fullRun) runOpts.maxSteps = 300000;
  if (variant.diHaltBypass) {
    runOpts.diHaltBypass = true;
    runOpts.diHaltBypassEntry = OUTER_LOOP;
  }

  let blocks = 0;
  let depositBlock = null;
  let firstWipeBlock = null;
  let stopReason = null;
  let stopSteps = null;
  let lastPc = OUTER_LOOP;
  let termination = 'unknown';

  try {
    const result = executor.runFrom(OUTER_LOOP, 'adl', {
      ...runOpts,
      onBlock(pc, mode, meta, steps) {
        blocks += 1;
        const addr = pc & 0xFFFFFF;
        lastPc = addr;
        if (addr === WIPE) {
          counts.WIPE += 1;
          if (firstWipeBlock === null) {
            firstWipeBlock = blocks;
            if (!variant.fullRun) {
              stopReason = 'first_wipe';
              stopSteps = steps;
              throw STOP;
            }
          }
        }
        for (const [name, target] of Object.entries(WATCH)) {
          if (addr === target) counts[name] += 1;
        }
        if (depositBlock === null && mem[EDIT_BASE] === DIGIT2.expected && read24(mem, 0xD0243A) === EDIT_BASE + 1) {
          depositBlock = blocks;
        }
        if (!variant.fullRun && depositBlock !== null && blocks - depositBlock >= 1000) {
          stopReason = 'deposit_stable';
          stopSteps = steps;
          throw STOP;
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
  const pass = depositBlock !== null && firstWipeBlock === null && after.D007CA === hex(WATCH.cxMain);
  return {
    name: variant.name,
    prepare: variant.prepare,
    diHaltBypass: Boolean(variant.diHaltBypass),
    matrixPressed: Boolean(variant.matrixPressed),
    forceF: Boolean(variant.forceF),
    forceMadl: Boolean(variant.forceMadl),
    forceIx: Boolean(variant.forceIx),
    browserSp: Boolean(variant.browserSp),
    fullRun: Boolean(variant.fullRun),
    termination,
    steps: stopSteps,
    blocks,
    lastPc: hex(lastPc),
    firstWipeBlock,
    depositBlock,
    counts,
    pass,
    before,
    after,
  };
}

const machine = bootBrowserSeededState();
const base = {
  mem: machine.mem.slice(),
  cpu: captureCpu(machine.cpu),
  snap: snap(machine.mem, machine.cpu, machine.peripherals),
};

const variants = [
  { name: 'probe-frame', prepare: 'probe' },
  { name: 'probe-plus-di-halt-bypass', prepare: 'probe', diHaltBypass: true },
  { name: 'probe-plus-matrix', prepare: 'probe', matrixPressed: true },
  { name: 'probe-plus-browser-sp', prepare: 'probe', browserSp: true },
  { name: 'probe-plus-browser-regs', prepare: 'probe', forceF: true, forceMadl: true, forceIx: true },
  { name: 'browser-frame-no-bypass-no-matrix', prepare: 'browser' },
  { name: 'browser-frame-plus-matrix', prepare: 'browser', matrixPressed: true },
  { name: 'browser-full-current', prepare: 'browser', matrixPressed: true, diHaltBypass: true },
  { name: 'browser-full-current-300k', prepare: 'browser', matrixPressed: true, diHaltBypass: true, fullRun: true },
];

const results = variants.map((variant) => runVariant(machine, base, variant));
const controlPass = results.find((row) => row.name === 'probe-frame')?.pass === true;
const browserFastPass = results.find((row) => row.name === 'browser-full-current')?.pass === true;
const browserLong = results.find((row) => row.name === 'browser-full-current-300k');
const browserLongPass = browserLong?.depositBlock !== null && browserLong?.counts.WIPE === 0;
const culprit = results.find((row) => row.name === 'probe-plus-di-halt-bypass')?.firstWipeBlock !== null
  ? 'diHaltBypass'
  : results.find((row) => row.name === 'probe-plus-browser-sp')?.firstWipeBlock !== null
    ? 'browserSp'
    : results.find((row) => row.name === 'probe-plus-matrix')?.firstWipeBlock !== null
      ? 'matrixPressed'
      : 'not-isolated';

function rowMd(row) {
  return [
    row.name,
    row.termination,
    row.steps ?? '-',
    row.depositBlock ?? '-',
    row.firstWipeBlock ?? '-',
    row.counts.WIPE,
    row.before.sp,
    row.before.f,
    row.before.ix,
    row.before.matrix3,
    row.after.buffer,
    row.after.D0243A,
    row.after.D007CA,
    row.pass ? 'PASS' : 'FAIL',
  ].join(' | ');
}

const report = [
  '# Phase 670: Browser Key State Diff',
  '',
  'Compares the proven phase669 seeded Digit2 key path with browser-shell key-dispatch variants',
  'from the same browser-style coldboot/VAT-replay/post-repaint/edit-context-seeded state.',
  '',
  `Probe: \`probe-phase670-browser-key-state-diff.mjs\`  `,
  'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase670-browser-key-state-diff.mjs`',
  '',
  '## Summary',
  '',
  `- VAT snapshot captured during browser boot recipe: ${machine.vatSnapshotCaptured}.`,
  `- Isolated culprit: **${culprit}**.`,
  `- Control/browser divergence reproduced: ${browserFastPass ? 'no; browser-style state also deposits' : 'yes'}.`,
  `- Full 300K browser-style run keeps deposit/no-wipe: ${browserLongPass ? 'yes' : 'no'}.`,
  '',
  '## Variants',
  '',
  '| variant | termination | steps | deposit block | first wipe block | wipes | pre SP | pre F | pre IX | matrix[3] | buffer @ D1A8CC | D0243A after | D007CA after | status |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---|',
  ...results.map((row) => `| ${rowMd(row)} |`),
  '',
  '## Phases',
  '',
  '```json',
  JSON.stringify({
    phases: machine.phases.map(([name, result]) => ({
      name,
      termination: result.termination,
      steps: result.steps,
      lastPc: result.lastPc & 0xFFFFFF,
    })),
    base: base.snap,
  }, null, 2),
  '```',
  '',
  '## Full JSON',
  '',
  '```json',
  JSON.stringify(results, null, 2),
  '```',
  '',
].join('\n');

fs.writeFileSync(REPORT_PATH, report);

for (const row of results) {
  console.log(`${row.name}: ${row.termination} steps=${row.steps} deposit=${row.depositBlock ?? '-'} wipe=${row.firstWipeBlock ?? '-'} D0243A=${row.after.D0243A} buf=${row.after.buffer}`);
}
console.log(`culprit=${culprit}`);
console.log(`wrote ${path.basename(REPORT_PATH)}`);

if (!controlPass) {
  console.error('Phase670 control did not deposit; seeded baseline is broken');
  process.exitCode = 1;
}

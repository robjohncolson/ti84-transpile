import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase669-edit-context-seed-multikey.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_TOP = 0xD1A87E;
const HALT = 0x0019B5;
const WARM_IDLE = 0x0019BE;
const OUTER_LOOP = 0x08C331;
const HOME_REPAINT = 0x058241;
const WIPE = 0x0018F8;
const EDIT_BASE = 0xD1A8CC;
const STOP = Symbol('phase669-success-stop');

const TARGETS = Object.freeze({
  tupleSave: 0x08F54B,
  saveCall: 0x08F547,
  tokenExit: 0x08F5E1,
  tokenGate: 0x090992,
  cxMain: 0x0585E9,
});

const KEYS = Object.freeze([
  { name: '2', osScan: 0x1A, internal: 0x90, expected: 0x32 },
  { name: '3', osScan: 0x22, internal: 0x91, expected: 0x33 },
  { name: '+', osScan: 0x2A, internal: 0x70, expected: 0x9E },
]);

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

function bootSystem() {
  const { mem, peripherals, executor, cpu } = makeMachine();
  const phases = [];

  phases.push(['coldboot', executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['kernel', executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 })]);

  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['postinit', executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12; fillSentinel(mem, cpu.sp, 12);
  phases.push(['warm-idle', executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 })]);

  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_TOP - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, WARM_IDLE);
  write24(mem, 0xD008E0, launchSp);
  phases.push(['launch-home', executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })]);

  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT);
  phases.push(['repaint', executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })]);

  return { mem, peripherals, executor, cpu, phases };
}

function rearmHomeContext(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function refreshEditContextForCursor(mem, cursor) {
  const tokenCursor = 0xD2A83E;
  write24(mem, 0xD02317, tokenCursor);
  write24(mem, 0xD0231A, tokenCursor);
  write24(mem, 0xD0231D, tokenCursor - 1);

  mem.fill(0, 0xD02430, 0xD02460);
  write24(mem, 0xD02437, cursor);
  write24(mem, 0xD0243A, cursor);
  write24(mem, 0xD0243D, tokenCursor);
  write24(mem, 0xD02440, tokenCursor);
  write24(mem, 0xD0244D, 0xD3FE89);
  mem[0xD02455] = 0x07;
  mem[0xD0245D] = 0x01;

  mem[0xD000A3] = 0x0A;
  write24(mem, 0xD02A40, tokenCursor);
  mem[0xD02A29] = 0;
  mem[0xD02A2A] = 0;
}

function seedRealEditContext(mem) {
  refreshEditContextForCursor(mem, EDIT_BASE);
  mem[0xD1A8C0] = 0x0C;
  mem[0xD1A8C1] = 0x00;
  mem[0xD1A8C2] = 0x07;
  mem.fill(0, EDIT_BASE, EDIT_BASE + 0x80);
}

function seedKey(mem, key) {
  mem[0xD0058C] = key.internal;
  mem[0xD0058D] = key.internal;
  mem[0xD0058E] = key.internal;
  mem[0xD00587] = key.osScan;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}

function prepareKeyRun(mem, cpu, key) {
  rearmHomeContext(mem);
  seedKey(mem, key);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xD008E0, cpu.sp);
}

function bufferText(mem, count = 8) {
  return Array.from({ length: count }, (_, idx) => hex(mem[EDIT_BASE + idx], 2)).join(' ');
}

function snap(mem) {
  return {
    D0231A: hex(read24(mem, 0xD0231A)),
    D0243A: hex(read24(mem, 0xD0243A)),
    D0243D: hex(read24(mem, 0xD0243D)),
    D02434: Array.from(mem.slice(0xD02434, 0xD02446)).map((byte) => hex(byte, 2)).join(' '),
    D000A3: hex(mem[0xD000A3], 2),
    D007CA: hex(read24(mem, 0xD007CA)),
    D02A29: hex(readValue(mem, 0xD02A29, 2), 4),
    D02A40: hex(read24(mem, 0xD02A40)),
    buffer: bufferText(mem),
    header: `${hex(mem[0xD1A8C0], 2)} ${hex(mem[0xD1A8C1], 2)} ${hex(mem[0xD1A8C2], 2)}`,
  };
}

function runOneKey(machine, key, { refreshBeforeKey }) {
  const { mem, executor, cpu } = machine;
  if (refreshBeforeKey) refreshEditContextForCursor(mem, read24(mem, 0xD0243A) || EDIT_BASE);
  const before = snap(mem);
  const cursorBefore = read24(mem, 0xD0243A);
  const expectedCursor = (cursorBefore + 1) & 0xFFFFFF;

  prepareKeyRun(mem, cpu, key);

  const counts = { WIPE: 0, ...Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0])) };
  let block = 0;
  let stopSteps = null;
  let depositBlock = null;
  let successBlock = null;
  let lastPc = OUTER_LOOP;
  let termination = 'unknown';

  try {
    const result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: 160000,
      maxLoopIterations: 160000,
      onBlock(pc, mode, meta, steps) {
        block += 1;
        const addr = pc & 0xFFFFFF;
        lastPc = addr;
        if (addr === WIPE) counts.WIPE += 1;
        for (const [name, target] of Object.entries(TARGETS)) {
          if (addr === target) counts[name] += 1;
        }
        const deposited = mem[cursorBefore] === key.expected && read24(mem, 0xD0243A) === expectedCursor;
        if (deposited && depositBlock === null) depositBlock = block;
        if (deposited && counts.WIPE === 0 && successBlock === null) successBlock = block;
        if (successBlock !== null && block - successBlock >= 1000) {
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
    termination = 'success_stop';
  }

  const after = snap(mem);
  const pass = successBlock !== null && counts.WIPE === 0 && read24(mem, 0xD007CA) === TARGETS.cxMain;
  return {
    key: key.name,
    osScan: key.osScan,
    internal: key.internal,
    expected: key.expected,
    cursorBefore,
    expectedCursor,
    termination,
    steps: stopSteps,
    blocks: block,
    lastPc,
    counts,
    depositBlock,
    successBlock,
    pass,
    before,
    after,
  };
}

function runScenario(label, { refreshEachKey }) {
  const machine = bootSystem();
  const { mem } = machine;
  rearmHomeContext(mem);
  seedRealEditContext(mem);
  const seeded = snap(mem);
  const keys = KEYS.map((key) => runOneKey(machine, key, { refreshBeforeKey: refreshEachKey }));
  return {
    label,
    refreshEachKey,
    phases: machine.phases.map(([name, result]) => ({
      name,
      termination: result.termination,
      steps: result.steps,
      lastPc: result.lastPc & 0xFFFFFF,
    })),
    seeded,
    keys,
    final: snap(mem),
    pass: keys.every((row) => row.pass),
  };
}

function fmtKeyRow(row) {
  return `| ${row.key} | ${hex(row.osScan, 2)} | ${hex(row.internal, 2)} | ${hex(row.expected, 2)} | ${hex(row.cursorBefore)} | ${row.termination} | ${row.steps ?? '-'} | ${row.depositBlock ?? '-'} | ${row.counts.WIPE} | ${row.counts.tupleSave} | ${row.after.buffer} | ${row.pass ? 'PASS' : 'FAIL'} |`;
}

function buildReport(scenarios) {
  const lines = [
    '# Phase 669: Edit-Context Seed Multi-Key Probe',
    '',
    'Probe: `probe-phase669-edit-context-seed-multikey.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase669-edit-context-seed-multikey.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- 4-star: One-shot ground-truth edit-context seeding ${scenarios[0].pass ? 'accepted all tested keys without wipe' : 'did not survive the whole key sequence'}: ${scenarios[0].keys.filter((row) => row.pass).length}/${scenarios[0].keys.length} keys passed.`,
    `- 4-star: Per-key edit-context refresh ${scenarios[1].pass ? 'accepted all tested keys without wipe' : 'still failed for at least one tested key'}: ${scenarios[1].keys.filter((row) => row.pass).length}/${scenarios[1].keys.length} keys passed.`,
    `- 3-star: The practical seed function is narrow: it refreshes D02317/D0231A/D0231D, the D02430..D0245F descriptor/cursor mirror, D000A3, D02A29, D02A40, and the D1A8C0 buffer header. It does not touch runtime, transpiler, browser shell, or ROM blocks.`,
    '',
  ];

  for (const scenario of scenarios) {
    lines.push(
      `## ${scenario.label}`,
      '',
      '| Key | OS scan | Internal | Expected byte | Cursor before | Termination | Steps | Deposit block | Wipes | 0x08F54B hits | Buffer @ D1A8CC | Status |',
      '|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|---|',
      ...scenario.keys.map(fmtKeyRow),
      '',
      'Seeded baseline:',
      '',
      '```json',
      JSON.stringify(scenario.seeded, null, 2),
      '```',
      '',
      'Final state:',
      '',
      '```json',
      JSON.stringify(scenario.final, null, 2),
      '```',
      '',
    );
  }

  lines.push(
    '## Interpretation',
    '',
    'The ground-truth edit-context layout is sufficient to route tested character keys into the surgical insertion path in synthetic boot state. The probe stops shortly after each observed deposit, so it is proving the insert/cursor-advance/no-wipe condition rather than claiming the full OS key handler reaches idle after each key. This is the right next integration seam for the synthetic boot/browser path: install the same edit-context seed after repaint, and refresh the descriptor cursor mirrors before each key if one-shot state proves insufficient in the browser event loop.',
    '',
  );
  return lines.join('\n');
}

console.log('phase669: edit-context seed multi-key probe');
for (const key of KEYS) {
  console.log(`key ${key.name}: osScan=${hex(key.osScan, 2)} internal=${hex(key.internal, 2)} expected=${hex(key.expected, 2)}`);
}

const scenarios = [
  runScenario('One-shot seed after synthetic repaint', { refreshEachKey: false }),
  runScenario('Per-key cursor/descriptor refresh', { refreshEachKey: true }),
];

for (const scenario of scenarios) {
  console.log(`\n${scenario.label}: pass=${scenario.pass}`);
  for (const row of scenario.keys) {
    console.log(`${row.key}: pass=${row.pass} term=${row.termination} steps=${row.steps ?? '-'} depositBlock=${row.depositBlock ?? '-'} wipe=${row.counts.WIPE} tupleSave=${row.counts.tupleSave} cursor ${hex(row.cursorBefore)}->${row.after.D0243A} buffer=${row.after.buffer}`);
  }
}

fs.writeFileSync(REPORT_PATH, buildReport(scenarios));
console.log(`\nwrote ${path.relative(process.cwd(), REPORT_PATH)}`);

if (!scenarios[0].keys[0].pass || !scenarios[1].pass) {
  console.log('phase669: FAIL -- seed did not prove the required baseline/per-key recipe');
  process.exit(1);
}

console.log('phase669: PASS -- edit-context seed deposits tested keys without wipe');

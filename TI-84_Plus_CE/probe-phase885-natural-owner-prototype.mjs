import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase885-natural-owner-prototype.md');

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const OWNER_A_GATED = 0x0454BE;
const D0301B = 0xD0301B;
const D0301B_MAGIC = 0x5AA55A;

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STABLE_REPLAY_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02505', 0xD02505, 1],
  ['D02587', 0xD02587, 3],
  ['D0258A', 0xD0258A, 3],
  ['D0258D', 0xD0258D, 3],
  ['D02590', 0xD02590, 3],
  ['D02593', 0xD02593, 3],
  ['D0259A', 0xD0259A, 3],
  ['D0259D', 0xD0259D, 3],
  ['D025A0', 0xD025A0, 3],
  ['D025C5', 0xD025C5, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
]);

const WATCHED_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02505', 0xD02505, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D0301B', D0301B, 3],
  ['D000B5_IY53', 0xD000B5, 1],
  ['D000BF_IY63', 0xD000BF, 1],
  ['D000C3_IY67', 0xD000C3, 1],
  ['D00894', 0xD00894, 1],
  ['D1A880', 0xD1A880, 1],
]);

const OWNER_TARGETS = Object.freeze({
  ownerAAlt0454BE: 0x0454BE,
  ownerACommon040BDE: 0x040BDE,
  ownerACommon040BE4: 0x040BE4,
  ownerACall040BEC: 0x040BEC,
  ownerAStore040BF0: 0x040BF0,
  ownerAWrite040BF4: 0x040BF4,
  phase5Snapshot001879: 0x001879,
  phase5Wipe0018F8: 0x0018F8,
});

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function fieldWidth(name) {
  if (name === 'D010F4' || name === 'D02505' || name.endsWith('_IY53') || name.endsWith('_IY63') || name.endsWith('_IY67') || name === 'D00894' || name === 'D1A880') return 2;
  if (name === 'D02A29') return 4;
  return 6;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[(addr + i) & 0xFFFFFF] = (value >>> (8 * i)) & 0xFF;
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function readFields(mem, fields = WATCHED_FIELDS) {
  return Object.fromEntries(fields.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
}

function formatFields(fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([name, value]) => [name, hex(value, fieldWidth(name))]),
  );
}

function formatRun(result) {
  return {
    steps: result?.steps ?? null,
    termination: result?.termination ?? null,
    lastPc: hex(result?.lastPc ?? 0),
    lastMode: result?.lastMode ?? null,
  };
}

function countNonWhiteVram(mem) {
  let count = 0;
  for (let addr = 0xD40000; addr < 0xD40000 + (320 * 240 * 2); addr += 2) {
    if (readValue(mem, addr, 2) !== 0xFFFF) count += 1;
  }
  return count;
}

function makeMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
    ownerCounts: Object.fromEntries(Object.keys(OWNER_TARGETS).map((name) => [name, 0])),
    ownerFirst: {},
  };
}

function compactCpu(cpu) {
  return {
    pc: hex(cpu.pc & 0xFFFFFF),
    currentBlockPc: hex((cpu._currentBlockPc ?? cpu.pc) & 0xFFFFFF),
    sp: hex(cpu.sp & 0xFFFFFF),
    af: hex(cpu.af & 0xFFFF, 4),
    bc: hex(cpu.bc & 0xFFFFFF),
    de: hex(cpu.de & 0xFFFFFF),
    hl: hex(cpu.hl & 0xFFFFFF),
    ix: hex((cpu._ix ?? cpu.ix ?? 0) & 0xFFFFFF),
    iy: hex((cpu._iy ?? cpu.iy ?? 0) & 0xFFFFFF),
    f: hex(cpu.f & 0xFF, 2),
    halted: Boolean(cpu.halted),
  };
}

function observeTarget(machine, pc, label) {
  const addr = pc & 0xFFFFFF;
  for (const [name, target] of Object.entries(OWNER_TARGETS)) {
    if (addr !== target) continue;
    machine.ownerCounts[name] += 1;
    if (!machine.ownerFirst[name]) {
      machine.ownerFirst[name] = {
        label,
        pc: hex(addr),
        cpu: compactCpu(machine.cpu),
        fields: formatFields(readFields(machine.mem)),
      };
    }
  }
}

function runObserved(machine, label, start, mode, opts = {}) {
  const userOnBlock = opts.onBlock;
  return machine.executor.runFrom(start, mode, {
    ...opts,
    onBlock(pc, blockMode, meta, steps) {
      observeTarget(machine, pc, label);
      userOnBlock?.(pc, blockMode, meta, steps);
    },
  });
}

function preparePhase5Frame(machine) {
  const { mem, peripherals, cpu } = machine;
  peripherals.setTimerEnabled(false);
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
  write24(mem, cpu.sp, WARM_IDLE);
  write24(mem, 0xD008E0, cpu.sp);
}

function prepareEventFrame(machine) {
  const { mem, peripherals, cpu } = machine;
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
  write24(mem, 0xD008E0, STACK_TOP - 18);
}

function replayStableSnapshot(mem, snapshot) {
  for (const [field, value] of snapshot) {
    const [, addr, len] = field;
    writeValue(mem, addr, len, value);
  }
}

function runBrowserPhasesToP5() {
  const machine = makeMachine();
  const phases = [];

  phases.push({
    name: 'p1-coldboot-0x000000',
    result: runObserved(machine, 'p1-coldboot', 0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }),
  });

  machine.cpu.halted = false;
  machine.cpu.iff1 = 0;
  machine.cpu.iff2 = 0;
  machine.cpu.sp = STACK_TOP - 3;
  fillSentinel(machine.mem, machine.cpu.sp, 3);
  phases.push({
    name: 'p2-kernel-0x08C331',
    result: runObserved(machine, 'p2-kernel', 0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }),
  });

  machine.cpu.madl = 1;
  machine.cpu.mbase = 0xD0;
  machine.cpu._iy = 0xD00080;
  machine.cpu._hl = 0;
  machine.cpu.halted = false;
  machine.cpu.iff1 = 0;
  machine.cpu.iff2 = 0;
  machine.cpu.sp = STACK_TOP - 3;
  fillSentinel(machine.mem, machine.cpu.sp, 3);
  phases.push({
    name: 'p3-postinit-0x0802B2',
    result: runObserved(machine, 'p3-postinit', 0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }),
  });

  machine.cpu.halted = false;
  machine.cpu.iff1 = 1;
  machine.cpu.iff2 = 1;
  machine.cpu._iy = 0xD00080;
  machine.cpu.mbase = 0xD0;
  machine.cpu.sp = STACK_TOP - 12;
  fillSentinel(machine.mem, machine.cpu.sp, 12);
  phases.push({
    name: 'p4-warm-idle-0x0019BE',
    result: runObserved(machine, 'p4-warm-idle', WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }),
  });

  preparePhase5Frame(machine);
  let stableSnapshot = null;
  let stableFields = null;
  phases.push({
    name: 'p5-launch-home-0x09DD62',
    result: runObserved(machine, 'p5-launch-home', LAUNCH_HOME, 'adl', {
      maxSteps: 300000,
      maxLoopIterations: 30000,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        if (stableSnapshot || addr !== 0x001879) return;
        if (readValue(machine.mem, 0xD02590, 3) === 0) return;
        stableSnapshot = STABLE_REPLAY_FIELDS.map((field) => [field, readValue(machine.mem, field[1], field[2])]);
        stableFields = readFields(machine.mem);
      },
    }),
  });

  return { machine, phases, stableSnapshot, stableFields };
}

function runPrototype() {
  const boot = runBrowserPhasesToP5();
  const { machine } = boot;
  const beforeOwner = readFields(machine.mem);

  preparePhase5Frame(machine);
  const ownerResult = runObserved(machine, 'natural-owner-post-p5-0454BE', OWNER_A_GATED, 'adl', {
    maxSteps: 60000,
    maxLoopIterations: 10000,
  });
  const afterOwner = readFields(machine.mem);

  if (boot.stableSnapshot) replayStableSnapshot(machine.mem, boot.stableSnapshot);
  const afterReplay = readFields(machine.mem);

  prepareEventFrame(machine);
  const beforeRepaint = readFields(machine.mem);
  const repaintResult = runObserved(machine, 'phase6-home-repaint-no-d0301b-force', HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
  });
  const afterRepaint = readFields(machine.mem);

  const pass = Boolean(
    boot.stableSnapshot
      && afterOwner.D0301B === D0301B_MAGIC
      && afterReplay.D0301B === D0301B_MAGIC
      && beforeRepaint.D0301B === D0301B_MAGIC
      && afterRepaint.D0301B === D0301B_MAGIC
      && repaintResult.termination === 'halt'
      && repaintResult.lastPc === HALT_IDLE
      && countNonWhiteVram(machine.mem) > 100,
  );

  return {
    pass,
    phases: boot.phases.map((phase) => ({ name: phase.name, result: formatRun(phase.result) })),
    stableSnapshotCaptured: Boolean(boot.stableSnapshot),
    stableSnapshotFields: formatFields(boot.stableFields),
    beforeOwner: formatFields(beforeOwner),
    ownerResult: formatRun(ownerResult),
    afterOwner: formatFields(afterOwner),
    afterReplay: formatFields(afterReplay),
    beforeRepaint: formatFields(beforeRepaint),
    repaintResult: formatRun(repaintResult),
    afterRepaint: formatFields(afterRepaint),
    vramNonWhite: countNonWhiteVram(machine.mem),
    ownerCounts: machine.ownerCounts,
    ownerFirst: machine.ownerFirst,
    analysis: {
      proposedSourceTiming: 'Run 0x0454BE after Phase 5 captures the stable snapshot, then replay the existing stable packet, keep the explicit D0301B force for this tick, and gate with browser replay + Phase880.',
      naturalD0301BWritten: afterOwner.D0301B === D0301B_MAGIC,
      naturalD0301BSurvivesReplay: afterReplay.D0301B === D0301B_MAGIC,
      naturalD0301BSurvivesPhase6: afterRepaint.D0301B === D0301B_MAGIC,
      noForceUsedInProbe: true,
      sourceForceShouldRemain: true,
    },
  };
}

function renderTable(rows, columns) {
  if (!rows.length) return 'No rows.\n';
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => String(column.value(row) ?? '-')).join(' | ')} |`),
  ].join('\n') + '\n';
}

function writeReport(data) {
  const lines = [
    '# Phase 885: Natural D0301B Owner Prototype',
    '',
    'Probe: `probe-phase885-natural-owner-prototype.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase885-natural-owner-prototype.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Stable snapshot captured: ${data.stableSnapshotCaptured ? 'yes' : 'no'}.`,
    `- Natural owner entry: 0x${OWNER_A_GATED.toString(16).toUpperCase().padStart(6, '0')} after Phase 5, before stable replay.`,
    `- Owner result: ${data.ownerResult.termination} after ${data.ownerResult.steps} steps at ${data.ownerResult.lastPc}.`,
    `- D0301B after owner: ${data.afterOwner.D0301B}; after replay: ${data.afterReplay.D0301B}; after Phase 6 repaint without force: ${data.afterRepaint.D0301B}.`,
    `- Phase 6 repaint without force: ${data.repaintResult.termination} after ${data.repaintResult.steps} steps at ${data.repaintResult.lastPc}; VRAM non-white=${data.vramNonWhite}.`,
    `- Adjudication: ${data.analysis.naturalD0301BWritten && data.analysis.naturalD0301BSurvivesPhase6 ? 'The A-side owner entry naturally writes D0301B and it survives replay/repaint, so browser-shell can prototype this behind the proven force baseline.' : 'The A-side owner path did not survive the required window; source should not be patched.'}`,
    '',
    '## Browser-Like Boot Phases',
    '',
    renderTable(data.phases, [
      { label: 'Phase', value: (row) => row.name },
      { label: 'Steps', value: (row) => row.result.steps },
      { label: 'Termination', value: (row) => row.result.termination },
      { label: 'Last PC', value: (row) => row.result.lastPc },
    ]),
    '## Key Field Snapshots',
    '',
    '```json',
    JSON.stringify({
      stableSnapshotFields: data.stableSnapshotFields,
      beforeOwner: data.beforeOwner,
      afterOwner: data.afterOwner,
      afterReplay: data.afterReplay,
      beforeRepaint: data.beforeRepaint,
      afterRepaint: data.afterRepaint,
    }, null, 2),
    '```',
    '',
    '## Owner Counts',
    '',
    '```json',
    JSON.stringify(data.ownerCounts, null, 2),
    '```',
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'The probe does not edit runtime, transpiler, browser shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files.',
    '',
  ];
  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
}

const data = runPrototype();
writeReport(data);

console.log(JSON.stringify({
  pass: data.pass,
  report: path.relative(process.cwd(), REPORT_PATH),
  stableSnapshotCaptured: data.stableSnapshotCaptured,
  ownerResult: data.ownerResult,
  d0301bAfterOwner: data.afterOwner.D0301B,
  d0301bAfterReplay: data.afterReplay.D0301B,
  d0301bAfterRepaint: data.afterRepaint.D0301B,
  repaintResult: data.repaintResult,
  ownerCounts: data.ownerCounts,
}, null, 2));

if (!data.pass) process.exitCode = 1;

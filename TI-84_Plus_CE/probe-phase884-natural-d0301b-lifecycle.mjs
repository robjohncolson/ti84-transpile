import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase884-natural-d0301b-lifecycle.md');

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const OUTER_LOOP = 0x08C331;
const WARM_IDLE = 0x0019BE;
const LAUNCH_HOME = 0x09DD62;
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
  ['D0301B', D0301B, 3],
  ['D000B5_IY53', 0xD000B5, 1],
  ['D000BF_IY63', 0xD000BF, 1],
  ['D000C3_IY67', 0xD000C3, 1],
  ['D00894', 0xD00894, 1],
  ['D1A880', 0xD1A880, 1],
]);

const LIFETIME_FIELDS = Object.freeze([
  ['D0301B', D0301B, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D008E0', 0xD008E0, 3],
  ['D00894', 0xD00894, 1],
  ['D1A880', 0xD1A880, 1],
]);

const OWNER_TARGETS = Object.freeze({
  phase1Cold000000: 0x000000,
  phase2Kernel08C331: 0x08C331,
  phase3PostInit0802B2: 0x0802B2,
  phase4WarmIdle0019BE: 0x0019BE,
  phase5LaunchHome09DD62: 0x09DD62,
  phase5Snapshot001879: 0x001879,
  phase5Wipe0018F8: 0x0018F8,
  ownerAStart040B05: 0x040B05,
  ownerAGuard040B09: 0x040B09,
  ownerADirect040B27: 0x040B27,
  ownerAAlt0454BE: 0x0454BE,
  ownerAAlt045575: 0x045575,
  ownerACommon040BDE: 0x040BDE,
  ownerACommon040BE4: 0x040BE4,
  ownerACall040BEC: 0x040BEC,
  ownerAStore040BF0: 0x040BF0,
  ownerAWrite040BF4: 0x040BF4,
  ownerBStart040C26: 0x040C26,
  ownerBSetup040C2E: 0x040C2E,
  ownerBCall040C56: 0x040C56,
  ownerBReturn040C5A: 0x040C5A,
  ownerBCall040C5E: 0x040C5E,
  ownerBStore040C62: 0x040C62,
  ownerBWrite040C66: 0x040C66,
});

const OWNER_TARGET_VALUES = new Set(Object.values(OWNER_TARGETS));
const OWNER_HIT_NAMES = Object.keys(OWNER_TARGETS).filter((name) => name.startsWith('owner'));

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
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

function widthFor(name) {
  if (name.endsWith('_IY53') || name.endsWith('_IY63') || name.endsWith('_IY67') || name === 'D010F4' || name === 'D02505' || name === 'D00894' || name === 'D1A880') return 2;
  return 6;
}

function formatFieldValue(name, value) {
  return hex(value, widthFor(name));
}

function readFields(mem, fields = WATCHED_FIELDS) {
  return Object.fromEntries(fields.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
}

function formatFields(fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([name, value]) => [name, formatFieldValue(name, value)]),
  );
}

function compactCpu(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF,
    currentBlockPc: (cpu._currentBlockPc ?? cpu.pc) & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    af: cpu.af & 0xFFFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: (cpu._ix ?? cpu.ix ?? 0) & 0xFFFFFF,
    iy: (cpu._iy ?? cpu.iy ?? 0) & 0xFFFFFF,
    f: cpu.f & 0xFF,
    halted: Boolean(cpu.halted),
  };
}

function formatCpu(cpu) {
  if (!cpu) return null;
  return {
    pc: hex(cpu.pc),
    currentBlockPc: hex(cpu.currentBlockPc),
    sp: hex(cpu.sp),
    af: hex(cpu.af, 4),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    f: hex(cpu.f, 2),
    halted: cpu.halted,
  };
}

function makeMachine(label) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  return {
    label,
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
    route: {
      label,
      phase: 'init',
      prevPc: null,
      totalBlocks: 0,
      targetCounts: Object.fromEntries(Object.keys(OWNER_TARGETS).map((name) => [name, 0])),
      targetFirst: {},
      checkpoints: [],
      fieldChanges: [],
      lastLifetime: null,
    },
  };
}

function snapshot(machine, pc, phase) {
  return {
    block: machine.route.totalBlocks,
    phase,
    pc,
    prevPc: machine.route.prevPc,
    cpu: compactCpu(machine.cpu),
    fields: readFields(machine.mem),
  };
}

function observeBlock(machine, pc, phase) {
  const addr = pc & 0xFFFFFF;
  const route = machine.route;
  route.phase = phase;
  route.totalBlocks += 1;

  const lifetime = readFields(machine.mem, LIFETIME_FIELDS);
  if (route.lastLifetime === null) {
    route.lastLifetime = lifetime;
  } else {
    for (const [name, value] of Object.entries(lifetime)) {
      if (value === route.lastLifetime[name]) continue;
      if (route.fieldChanges.length < 120) {
        route.fieldChanges.push({
          name,
          from: route.lastLifetime[name],
          to: value,
          at: snapshot(machine, addr, phase),
        });
      }
      route.lastLifetime[name] = value;
    }
  }

  for (const [name, target] of Object.entries(OWNER_TARGETS)) {
    if (addr !== target) continue;
    route.targetCounts[name] += 1;
    if (!route.targetFirst[name]) route.targetFirst[name] = snapshot(machine, addr, phase);
  }
  route.prevPc = addr;
}

function checkpoint(machine, label) {
  machine.route.checkpoints.push({
    label,
    atBlock: machine.route.totalBlocks,
    phase: machine.route.phase,
    cpu: compactCpu(machine.cpu),
    fields: readFields(machine.mem),
  });
}

function runWithTrace(machine, phase, startAddress, mode, opts = {}) {
  const userOnBlock = opts.onBlock;
  return machine.executor.runFrom(startAddress, mode, {
    ...opts,
    onBlock(pc, blockMode, meta, steps) {
      observeBlock(machine, pc, phase);
      userOnBlock?.(pc, blockMode, meta, steps);
    },
  });
}

function formatRun(result) {
  return {
    steps: result?.steps ?? null,
    termination: result?.termination ?? null,
    lastPc: hex(result?.lastPc ?? 0),
    lastMode: result?.lastMode ?? null,
  };
}

function formatSnapshot(row) {
  if (!row) return null;
  return {
    ...row,
    pc: hex(row.pc),
    prevPc: row.prevPc == null ? null : hex(row.prevPc),
    cpu: formatCpu(row.cpu),
    fields: formatFields(row.fields),
  };
}

function formatRoute(route) {
  return {
    label: route.label,
    totalBlocks: route.totalBlocks,
    targetCounts: route.targetCounts,
    targetFirst: Object.fromEntries(
      Object.entries(route.targetFirst).map(([name, row]) => [name, formatSnapshot(row)]),
    ),
    checkpoints: route.checkpoints.map((point) => ({
      ...point,
      cpu: formatCpu(point.cpu),
      fields: formatFields(point.fields),
    })),
    fieldChanges: route.fieldChanges.map((change) => ({
      name: change.name,
      from: formatFieldValue(change.name, change.from),
      to: formatFieldValue(change.name, change.to),
      at: formatSnapshot(change.at),
    })),
  };
}

function preparePhase5Frame(machine) {
  const { mem, peripherals, cpu } = machine;
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
}

function runBrowserNaturalPhases() {
  const machine = makeMachine('browser-natural-p1-p5-no-replay-force');
  const phases = [];

  phases.push({ name: 'p1-coldboot-0x000000', result: runWithTrace(machine, 'p1-coldboot', 0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });
  checkpoint(machine, 'after-p1');

  machine.cpu.halted = false;
  machine.cpu.iff1 = 0;
  machine.cpu.iff2 = 0;
  machine.cpu.sp = STACK_TOP - 3;
  fillSentinel(machine.mem, machine.cpu.sp, 3);
  phases.push({ name: 'p2-kernel-0x08C331', result: runWithTrace(machine, 'p2-kernel', OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });
  checkpoint(machine, 'after-p2');

  machine.cpu.madl = 1;
  machine.cpu.mbase = 0xD0;
  machine.cpu._iy = 0xD00080;
  machine.cpu._hl = 0;
  machine.cpu.halted = false;
  machine.cpu.iff1 = 0;
  machine.cpu.iff2 = 0;
  machine.cpu.sp = STACK_TOP - 3;
  fillSentinel(machine.mem, machine.cpu.sp, 3);
  phases.push({ name: 'p3-postinit-0x0802B2', result: runWithTrace(machine, 'p3-postinit', 0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }) });
  checkpoint(machine, 'after-p3');

  machine.cpu.halted = false;
  machine.cpu.iff1 = 1;
  machine.cpu.iff2 = 1;
  machine.cpu._iy = 0xD00080;
  machine.cpu.mbase = 0xD0;
  machine.cpu.sp = STACK_TOP - 12;
  fillSentinel(machine.mem, machine.cpu.sp, 12);
  phases.push({ name: 'p4-warm-idle-0x0019BE', result: runWithTrace(machine, 'p4-warm-idle', WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }) });
  checkpoint(machine, 'after-p4');

  const prePhase5Mem = machine.mem.slice();
  preparePhase5Frame(machine);
  checkpoint(machine, 'before-p5');

  let stableSnapshot = null;
  phases.push({
    name: 'p5-launch-home-0x09DD62',
    result: runWithTrace(machine, 'p5-launch-home', LAUNCH_HOME, 'adl', {
      maxSteps: 300000,
      maxLoopIterations: 30000,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        if (!stableSnapshot && addr === 0x001879 && readValue(machine.mem, 0xD02590, 3) !== 0) {
          stableSnapshot = {
            atBlock: machine.route.totalBlocks,
            fields: readFields(machine.mem),
            replayFields: readFields(machine.mem, STABLE_REPLAY_FIELDS),
            cpu: compactCpu(machine.cpu),
          };
        }
      },
    }),
  });
  checkpoint(machine, 'after-p5-no-replay-force');

  return {
    phases: phases.map((phase) => ({ name: phase.name, result: formatRun(phase.result) })),
    prePhase5Mem,
    phase5StartFields: formatFields(readFields(prePhase5Mem)),
    stableSnapshot: stableSnapshot
      ? {
          atBlock: stableSnapshot.atBlock,
          cpu: formatCpu(stableSnapshot.cpu),
          fields: formatFields(stableSnapshot.fields),
          replayFields: formatFields(stableSnapshot.replayFields),
        }
      : null,
    route: formatRoute(machine.route),
    rawTargetCounts: machine.route.targetCounts,
    finalFields: formatFields(readFields(machine.mem)),
  };
}

function blockKey(pc) {
  return `${pc.toString(16).padStart(6, '0')}:adl`;
}

function blockSource(pc) {
  return BLOCKS[blockKey(pc)]?.source ?? '';
}

function blockDasm(pc) {
  const source = blockSource(pc);
  if (!source) return '(block not lifted)';
  const rows = [];
  for (const line of source.split('\n')) {
    const match = line.match(/\/\/\s+(0x[0-9a-f]+)\s+([0-9a-f ]+)\s+(.+)/i);
    if (match) rows.push(`${match[1].toUpperCase()} ${match[3].trim()}`);
  }
  return rows.join('; ');
}

function classifyRef(source, targetLiteral) {
  const kinds = [];
  if (source.includes(`cpu.push(${targetLiteral});`)) kinds.push('call-return-continuation');
  if (source.includes(`return ${targetLiteral};`)) {
    kinds.push(source.includes('cpu.push(') ? 'direct-call-target' : 'branch-or-fallthrough');
  }
  if (source.includes('cpu.checkCondition') && source.includes(`return ${targetLiteral};`)) kinds.push('conditional-branch');
  return kinds.length ? [...new Set(kinds)].join(', ') : 'source-reference';
}

function incomingRefs(targetPc, limit = 16) {
  const target = `0x${targetPc.toString(16).padStart(6, '0')}`;
  const refs = [];
  for (const block of Object.values(BLOCKS)) {
    const source = block.source ?? '';
    if (!source.includes(target)) continue;
    const startPc = block.startPc ?? Number.parseInt(String(block.id ?? '').slice(0, 6), 16);
    refs.push({
      target: hex(targetPc),
      from: Number.isFinite(startPc) ? startPc : null,
      fromHex: Number.isFinite(startPc) ? hex(startPc) : String(block.id ?? '?'),
      kind: classifyRef(source, target),
      dasm: Number.isFinite(startPc) ? blockDasm(startPc) : '(unknown)',
    });
  }
  return refs
    .sort((a, b) => (a.from ?? 0) - (b.from ?? 0))
    .slice(0, limit);
}

function staticOwnerAnalysis() {
  const chainRows = [
    { owner: 'A', pc: 0x040B05, role: 'guard entry', expected: 'CALL 0x03F1ED -> ret 0x040B09' },
    { owner: 'A', pc: 0x040B09, role: 'D00894 selector', expected: 'D00894 nonzero -> 0x040BE2; zero -> longer branch ending at 0x040BDE/0x040BE4' },
    { owner: 'A', pc: 0x040B27, role: 'alternate direct branch', expected: 'JP 0x040BE4' },
    { owner: 'A', pc: 0x0454BE, role: 'upstream flag branch', expected: 'BIT 1,(IY+53); JP Z,0x040BDE' },
    { owner: 'A', pc: 0x045575, role: 'upstream direct jump', expected: 'JP 0x040B27' },
    { owner: 'A', pc: 0x040BDE, role: 'alternate common entry', expected: 'LD A,0x03 -> JR 0x040BE4' },
    { owner: 'A', pc: 0x040BE4, role: 'common entry', expected: 'DI; save A to D1A880; read IY+63; CALL 0x04572C' },
    { owner: 'A', pc: 0x040BEC, role: 'pre-store call', expected: 'CALL 0x04572C -> ret 0x040BF0' },
    { owner: 'A', pc: 0x040BF0, role: 'magic load/store', expected: 'LD HL,0x5AA55A; LD (D0301B),HL at 0x040BF4' },
    { owner: 'B', pc: 0x040C26, role: 'setup entry', expected: 'LD HL,0x08C754; CALL 0x061DEF -> ret 0x040C2E' },
    { owner: 'B', pc: 0x040C2E, role: 'ON-SP/context setup', expected: 'LD (D007FA),SP; BIT 6,(IY+63); RES 1,(IY+67); CALL 0x040C41' },
    { owner: 'B', pc: 0x040C56, role: 'pre-owner call 1', expected: 'CALL 0x05519F -> ret 0x040C5A' },
    { owner: 'B', pc: 0x040C5A, role: 'pre-owner call 2 entry', expected: 'CALL 0x02507D -> ret 0x040C5E' },
    { owner: 'B', pc: 0x040C5E, role: 'pre-store call 3', expected: 'CALL 0x0246D7 -> ret 0x040C62' },
    { owner: 'B', pc: 0x040C62, role: 'magic load/store', expected: 'LD HL,0x5AA55A; LD (D0301B),HL at 0x040C66' },
  ].map((row) => ({ ...row, pcHex: hex(row.pc), dasm: blockDasm(row.pc) }));

  const seedTargets = [
    0x040BF0, 0x040C62, 0x040BE4, 0x040BDE, 0x040B27, 0x040B05,
    0x0454BE, 0x045575, 0x040C56, 0x040C5E, 0x040C2E, 0x040C26,
  ];
  const incoming = Object.fromEntries(seedTargets.map((pc) => [hex(pc), incomingRefs(pc)]));

  const frontier = [0x040BF0, 0x040C62];
  const layers = [];
  const seen = new Set(frontier);
  let current = frontier;
  for (let depth = 1; depth <= 4; depth += 1) {
    const rows = [];
    const next = [];
    for (const target of current) {
      for (const ref of incomingRefs(target, 32)) {
        rows.push({ depth, target: hex(target), from: ref.fromHex, kind: ref.kind, dasm: ref.dasm });
        if (ref.from != null && !seen.has(ref.from) && ref.from >= 0x000000 && ref.from < 0x0C0000) {
          seen.add(ref.from);
          next.push(ref.from);
        }
      }
    }
    layers.push(rows.slice(0, 48));
    current = next.slice(0, 24);
    if (!current.length) break;
  }

  return { chainRows, incoming, upstreamLayers: layers };
}

function runDirectOwnerEntry(entryPc, label, prePhase5Mem) {
  const machine = makeMachine(`direct-${label}`);
  machine.mem.set(prePhase5Mem);
  preparePhase5Frame(machine);
  checkpoint(machine, 'before-direct-entry');
  const before = readFields(machine.mem);
  const result = runWithTrace(machine, label, entryPc, 'adl', { maxSteps: 50000, maxLoopIterations: 10000 });
  checkpoint(machine, 'after-direct-entry');
  const after = readFields(machine.mem);
  return {
    label,
    entry: hex(entryPc),
    result: formatRun(result),
    beforeFields: formatFields(before),
    afterFields: formatFields(after),
    d0301bChangedToMagic: after.D0301B === D0301B_MAGIC,
    ownerHitTotal: OWNER_HIT_NAMES.reduce((sum, name) => sum + (machine.route.targetCounts[name] ?? 0), 0),
    targetCounts: machine.route.targetCounts,
    targetFirst: Object.fromEntries(
      Object.entries(machine.route.targetFirst).map(([name, row]) => [name, formatSnapshot(row)]),
    ),
    fieldChanges: machine.route.fieldChanges.map((change) => ({
      name: change.name,
      from: formatFieldValue(change.name, change.from),
      to: formatFieldValue(change.name, change.to),
      at: formatSnapshot(change.at),
    })),
  };
}

function renderTable(rows, columns) {
  if (!rows.length) return 'No rows.\n';
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.value(row) ?? '-').replaceAll('\n', '<br>')).join(' | ')} |`);
  return [header, sep, ...body].join('\n') + '\n';
}

function summarizeCounts(counts) {
  return Object.entries(counts)
    .filter(([name, count]) => OWNER_HIT_NAMES.includes(name) && count > 0)
    .map(([name, count]) => `${name}=${count}`);
}

function writeReport(data) {
  const dynamicOwnerHits = summarizeCounts(data.dynamic.rawTargetCounts);
  const directRows = data.directEntries.map((entry) => ({
    label: entry.label,
    entry: entry.entry,
    termination: `${entry.result.termination} @ ${entry.result.lastPc}`,
    d0301b: entry.afterFields.D0301B,
    ownerHits: summarizeCounts(entry.targetCounts).join(', ') || 'none',
  }));

  const directWorking = data.directEntries.filter((entry) => entry.d0301bChangedToMagic);
  const pass = data.analysis.pass;
  const lines = [
    '# Phase 884: Natural D0301B Owner Lifecycle Trace',
    '',
    'Probe: `probe-phase884-natural-d0301b-lifecycle.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase884-natural-d0301b-lifecycle.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${pass ? 'PASS' : 'FAIL'}.`,
    `- Browser-equivalent natural phases 1-5 hit owner-chain targets: ${dynamicOwnerHits.length ? dynamicOwnerHits.join(', ') : 'no'}.`,
    `- Stable snapshot D0301B before replay/force: ${data.dynamic.stableSnapshot?.fields?.D0301B ?? 'not captured'}.`,
    `- Direct owner-entry experiments that naturally wrote magic when explicitly entered: ${directWorking.map((entry) => `${entry.label} (${entry.entry})`).join(', ') || 'none'}.`,
    `- Candidate browser phase: ${data.analysis.candidateBrowserPhase}`,
    `- Static call-in path: ${data.analysis.callInPath}`,
    `- Gate/state observation: ${data.analysis.gateObservation}`,
    `- Feasibility: ${data.analysis.feasibility}`,
    `- Adjudication: ${data.analysis.adjudication}`,
    '',
    '## Browser Natural Phase Results',
    '',
    renderTable(data.dynamic.phases, [
      { label: 'Phase', value: (row) => row.name },
      { label: 'Steps', value: (row) => row.result.steps },
      { label: 'Termination', value: (row) => row.result.termination },
      { label: 'Last PC', value: (row) => row.result.lastPc },
    ]),
    '## Natural Phase Owner Counts',
    '',
    renderTable(Object.entries(data.dynamic.rawTargetCounts)
      .filter(([name]) => OWNER_HIT_NAMES.includes(name))
      .map(([name, count]) => ({ name, count })), [
      { label: 'Owner target', value: (row) => row.name },
      { label: 'Hits', value: (row) => row.count },
    ]),
    '## Stable Snapshot Fields',
    '',
    'At the browser Phase 5 pre-wipe snapshot (`0x001879`, VAT already live):',
    '',
    '```json',
    JSON.stringify(data.dynamic.stableSnapshot?.fields ?? null, null, 2),
    '```',
    '',
    '## Phase/Gate Adjudication',
    '',
    `- Candidate coldboot slot: ${data.analysis.candidateBrowserPhase}`,
    `- A-side path with direct proof: ${data.analysis.callInPath}`,
    `- A-side gate: ${data.analysis.gateObservation}`,
    `- B-side status: ${data.analysis.bSideStatus}`,
    `- Prototype warning: ${data.analysis.prototypeWarning}`,
    '',
    '## Static Owner Chain',
    '',
    renderTable(data.static.chainRows, [
      { label: 'Owner', value: (row) => row.owner },
      { label: 'PC', value: (row) => row.pcHex },
      { label: 'Role', value: (row) => row.role },
      { label: 'Expected next', value: (row) => row.expected },
      { label: 'Lifted evidence', value: (row) => row.dasm },
    ]),
    '## Incoming References',
    '',
  ];

  for (const [target, refs] of Object.entries(data.static.incoming)) {
    lines.push(`### ${target}`, '');
    lines.push(renderTable(refs, [
      { label: 'From', value: (row) => row.fromHex },
      { label: 'Kind', value: (row) => row.kind },
      { label: 'Lifted evidence', value: (row) => row.dasm },
    ]));
  }

  lines.push(
    '## Direct Owner Entry Experiments',
    '',
    'Each entry starts from the browser pre-Phase-5 memory/register recipe, then enters one owner-family candidate directly. These are feasibility probes only; they are not proposed source changes.',
    '',
    renderTable(directRows, [
      { label: 'Entry', value: (row) => `${row.label} ${row.entry}` },
      { label: 'Termination', value: (row) => row.termination },
      { label: 'Final D0301B', value: (row) => row.d0301b },
      { label: 'Owner hits', value: (row) => row.ownerHits },
    ]),
    '## Direct Entry Details',
    '',
    '```json',
    JSON.stringify(data.directEntries.map((entry) => ({
      label: entry.label,
      entry: entry.entry,
      result: entry.result,
      beforeFields: entry.beforeFields,
      afterFields: entry.afterFields,
      targetCounts: entry.targetCounts,
      fieldChanges: entry.fieldChanges,
    })), null, 2),
    '```',
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  );

  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
}

const dynamic = runBrowserNaturalPhases();
const staticAnalysis = staticOwnerAnalysis();
const directEntries = [
  runDirectOwnerEntry(0x040B05, 'ownerA-guard-entry-040B05', dynamic.prePhase5Mem),
  runDirectOwnerEntry(0x040B27, 'ownerA-direct-040B27', dynamic.prePhase5Mem),
  runDirectOwnerEntry(0x0454BE, 'ownerA-upstream-0454BE', dynamic.prePhase5Mem),
  runDirectOwnerEntry(0x045575, 'ownerA-upstream-045575', dynamic.prePhase5Mem),
  runDirectOwnerEntry(0x040C26, 'ownerB-start-040C26', dynamic.prePhase5Mem),
];

const naturalOwnerHitTotal = OWNER_HIT_NAMES.reduce((sum, name) => sum + (dynamic.rawTargetCounts[name] ?? 0), 0);
const directMagicEntries = directEntries.filter((entry) => entry.d0301bChangedToMagic);
const analysis = {
  pass: dynamic.stableSnapshot?.fields?.D0301B === hex(0) && naturalOwnerHitTotal === 0 && directMagicEntries.length > 0,
  naturalOwnerHitTotal,
  stableSnapshotD0301B: dynamic.stableSnapshot?.fields?.D0301B ?? null,
  directMagicEntries: directMagicEntries.map((entry) => ({ label: entry.label, entry: entry.entry })),
  candidateBrowserPhase: 'If this is made natural, it has to occur before or at browser Phase 5 (`0x09DD62` launch-home) before the `0x001879` snapshot / `0x0018D7` integrity decision; phases 1-5 as currently written never call the owner family.',
  callInPath: 'The A-side executable path is `0x045575 -> 0x040B27 -> 0x040BE4 -> 0x040BEC -> 0x040BF0 -> 0x040BF4`, with an alternate gated entry `0x0454BE -> 0x040BDE -> 0x040BE4` when `(IY+53)` bit 1 is clear.',
  gateObservation: 'At the natural Phase 5 snapshot, `D000B5/IY+53=0x00`, `D00894=0x00`, `IY+63=0x00`, and `IY+67=0x00`; those local gates are compatible with the A-side alternate path, but the browser route never reaches the gate blocks at all.',
  bSideStatus: 'The B-side static chain enters through `0x040C16..0x040C22 CALL 0x09DD1C -> 0x040C26`, then `0x040C2E/0x040C56/0x040C5A/0x040C5E -> 0x040C62`; under the browser pre-Phase-5 recipe, direct `0x040C26` reaches setup but stops at missing block `0x58C35B` before writing D0301B.',
  prototypeWarning: 'Do not remove the proven replay/force baseline in Phase885. If prototyping, try the A-side owner-family entry behind the baseline first and require the replay gate plus Phase880 audit; the owner code changes SP/flags and touches low RAM (`D1A880`, `D00000`, IY flags), so it is not a harmless field write.',
  feasibility: directMagicEntries.length
    ? 'Owner code is executable if entered explicitly, but the browser p1-p5 lifecycle has no natural edge to it. A Phase885 prototype would need to add a pre-Phase-5 owner-family entry behind the existing replay baseline and prove it does not destabilize stack, flags, or RAM.'
    : 'No direct owner entry wrote the magic under the browser pre-Phase-5 recipe; STOP would be appropriate before any source prototype.',
  adjudication: 'The missed natural lifecycle is a call-selection gap, not a local D0301B compare or stable-replay timing issue. The shortcut boot reaches launch-home Phase 5 and the 0x001879 snapshot with live VAT/D010 fields but D0301B still zero, while static owner chains live in the 0x040Bxx/0x040Cxx reset/ON-context family and are never called by the browser phases.',
};

const data = {
  pass: analysis.pass,
  analysis,
  dynamic,
  static: staticAnalysis,
  directEntries,
};

writeReport(data);
console.log(JSON.stringify({
  pass: data.pass,
  report: path.relative(process.cwd(), REPORT_PATH),
  naturalOwnerHitTotal: analysis.naturalOwnerHitTotal,
  stableSnapshotD0301B: analysis.stableSnapshotD0301B,
  directMagicEntries: analysis.directMagicEntries,
}, null, 2));

if (!data.pass) process.exitCode = 1;

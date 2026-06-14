import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase676-control-wipe-trace.md');

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
const STOP = Symbol('phase676-stop');

const SNAPSHOT_FIELDS = Object.freeze([
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

const TRACE_FIELDS = Object.freeze([
  ['cxMain', 0xD007CA, 3],
  ['errSP', 0xD008E0, 3],
  ['editCursor', 0xD0243A, 3],
  ['editBtm', 0xD0243D, 3],
  ['tokenPointer', 0xD02A40, 3],
  ['vatOPBase', 0xD02590, 3],
  ['vatProgPtr', 0xD0259D, 3],
  ['keyScan', 0xD00587, 1],
  ['keyPending', 0xD0058C, 1],
  ['keyGetKey', 0xD0058D, 1],
  ['keyInternal', 0xD0058E, 1],
  ['keyAvailableFlag', 0xD00080, 1],
  ['keyDispatchFlag', 0xD0009F, 1],
  ['tokenGate', 0xD02A28, 1],
]);
const CORE_ZERO_FIELDS = new Set([
  'cxMain',
  'errSP',
  'editCursor',
  'editBtm',
  'tokenPointer',
  'vatOPBase',
  'vatProgPtr',
]);

const TARGETS = Object.freeze({
  outerLoop: 0x08C331,
  cxMain: 0x0585E9,
  getCsc: 0x03FA09,
  keyHandler: 0x05877A,
  tokenDeposit: 0x0922B2,
  tokenExit: 0x08F5E1,
  tokenGateTest: 0x090992,
  eolTupleSave: 0x08F54B,
  contextLdir: 0x0A2150,
  contextSpaceFill: 0x0A2156,
  cleanupScan: 0x001C33,
  cleanupExit: 0x001C4A,
  cleanupOwner: 0x0158BC,
  cleanupD2: 0x0158D2,
  bulkGate: 0x001872,
  bulkClearBody: 0x001879,
  bulkBypass: 0x0018AF,
  bulkTail: 0x0018F8,
  lowFrame: 0x0064D0,
  lowRoute: 0x006D5D,
  hotLoopA: 0x000A92,
  hotLoopB: 0x000BFE,
});

const PRIME_KEY = Object.freeze({ label: '2', osScan: 0x1A, internal: 0x90, expected: 0x32, maxSteps: 120000 });
const CONTROL_KEYS = Object.freeze([
  { label: 'ENTER', osScan: 0x09, internal: 0x05, maxSteps: 300000 },
  { label: 'CLEAR', osScan: 0x0F, internal: 0x0F, maxSteps: 350000 },
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

function captureFields(mem, fields = SNAPSHOT_FIELDS) {
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

function fieldsObject(snapshot) {
  return Object.fromEntries(snapshot.map((field) => [field.name, hex(field.value, field.len * 2)]));
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

  phases.push({ name: 'p1-coldboot', result: executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p3-postinit', result: executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({ name: 'p4-warm-idle', result: executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }) });

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
  const p6 = executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
  phases.push({ name: 'p6-repaint', result: p6 });

  seedEditContext(mem);
  return {
    mem,
    peripherals,
    executor,
    cpu,
    phases: phases.map((phase) => ({ name: phase.name, result: formatRun(phase.result) })),
    vatSnapshot: fieldsObject(vatSnapshot),
    postRepaint: {
      D007CA: hex(read24(mem, 0xD007CA)),
      D008E0: hex(read24(mem, 0xD008E0)),
      D02590: hex(read24(mem, 0xD02590)),
      vramPixels: countVRAMPixels(mem),
    },
  };
}

function traceSnapshot(mem, cpu) {
  return {
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu._bc & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF,
    hl: cpu._hl & 0xFFFFFF,
    fields: Object.fromEntries(TRACE_FIELDS.map(([name, addr, len]) => [name, readValue(mem, addr, len)])),
    editBuffer: Array.from(mem.slice(EDIT_BASE, EDIT_BASE + 8)),
    vramPixels: countVRAMPixels(mem),
  };
}

function pushRecent(recent, pc, step, cpu) {
  recent.push({
    pc,
    step,
    sp: cpu.sp & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu._hl & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF,
  });
  if (recent.length > 64) recent.shift();
}

function runPrimeInsert(machine) {
  const { mem, peripherals, executor, cpu } = machine;
  const cursorBefore = read24(mem, EDIT_CURSOR);
  const expectedCursor = (cursorBefore + 1) & 0xFFFFFF;
  let insertBlock = null;
  let blocks = 0;
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
        blocks += 1;
        lastPc = pc & 0xFFFFFF;
        const inserted = mem[cursorBefore] === PRIME_KEY.expected && read24(mem, EDIT_CURSOR) === expectedCursor;
        if (inserted && insertBlock === null) insertBlock = blocks;
        if (insertBlock !== null && blocks - insertBlock >= 1000) {
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
    label: PRIME_KEY.label,
    cursorBefore,
    insertBlock,
    steps: stopSteps,
    blocks,
    lastPc,
    D0243A: read24(mem, EDIT_CURSOR),
    D007CA: read24(mem, 0xD007CA),
    buffer: Array.from(mem.slice(EDIT_BASE, EDIT_BASE + 8)),
    pass: insertBlock !== null && read24(mem, EDIT_CURSOR) === expectedCursor && mem[cursorBefore] === PRIME_KEY.expected,
  };
}

function runControlTrace(machine, key) {
  const { mem, peripherals, executor, cpu } = machine;
  const counts = Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0]));
  const hits = [];
  const recent = [];
  const transitions = [];
  let firstZero = null;
  let firstWipe = null;
  let firstWipeBlock = null;
  let lastSnap = null;
  let lastPc = OUTER_LOOP;
  let lastStep = 0;
  let blocks = 0;
  let stopReason = null;
  let result = null;

  rearmHomeContext(mem);
  seedKey(mem, key);
  prepareEventFrame(mem, peripherals, cpu);

  function recordTransitions(pc, steps, snap) {
    if (!lastSnap) return;
    for (const [name] of TRACE_FIELDS) {
      const before = lastSnap.fields[name];
      const after = snap.fields[name];
      if (before === after) continue;
      const zeroing = before !== 0 && after === 0;
      const isTracked = zeroing || name.startsWith('key') || name === 'tokenGate';
      if (!isTracked || transitions.length >= 40) continue;
      const event = {
        field: name,
        before,
        after,
        zeroing,
        previousPc: lastPc,
        previousStep: lastStep,
        observedAtPc: pc,
        observedAtStep: steps,
        beforeSnapshot: lastSnap,
        afterSnapshot: snap,
        recent: recent.slice(),
      };
      transitions.push(event);
      if (zeroing && CORE_ZERO_FIELDS.has(name) && !firstZero) firstZero = event;
    }
  }

  try {
    result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: key.maxSteps,
      maxLoopIterations: key.maxSteps,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc, mode, meta, steps) {
        blocks += 1;
        const addr = pc & 0xFFFFFF;
        const snap = traceSnapshot(mem, cpu);
        recordTransitions(addr, steps, snap);
        pushRecent(recent, addr, steps, cpu);

        for (const [name, target] of Object.entries(TARGETS)) {
          if (addr !== target) continue;
          counts[name] += 1;
          if (hits.length < 120) {
            hits.push({
              name,
              pc: addr,
              step: steps,
              count: counts[name],
              dasm: meta?.instructions?.[0]?.dasm ?? null,
              snap,
              recent: recent.slice(),
            });
          }
        }

        if (addr === TARGETS.bulkTail && !firstWipe) {
          firstWipeBlock = blocks;
          firstWipe = {
            pc: addr,
            step: steps,
            block: blocks,
            snap,
            recent: recent.slice(),
          };
        }
        if (firstWipeBlock != null && blocks - firstWipeBlock > 128) {
          stopReason = 'after-first-wipe';
          throw STOP;
        }

        lastSnap = snap;
        lastPc = addr;
        lastStep = steps;
      },
    });
  } catch (error) {
    if (error !== STOP) throw error;
    result = {
      steps: lastStep,
      termination: stopReason ?? 'early-stop',
      lastPc,
      lastMode: 'adl',
    };
  }

  return {
    key: key.label,
    osScan: key.osScan,
    internal: key.internal,
    result: formatRun(result),
    blocks,
    counts,
    hits,
    transitions,
    firstZero,
    firstWipe,
    final: traceSnapshot(mem, cpu),
    status: {
      D0243A: hex(read24(mem, EDIT_CURSOR)),
      D007CA: hex(read24(mem, 0xD007CA)),
      D008E0: hex(read24(mem, 0xD008E0)),
      D02590: hex(read24(mem, 0xD02590)),
      buffer: Array.from(mem.slice(EDIT_BASE, EDIT_BASE + 8)).map((byte) => hex(byte, 2)).join(' '),
      vramPixels: countVRAMPixels(mem),
    },
  };
}

function runScenario(key) {
  const machine = bootBrowserRecipe();
  const prime = runPrimeInsert(machine);
  const trace = runControlTrace(machine, key);
  return {
    key: key.label,
    phases: machine.phases,
    vatSnapshot: machine.vatSnapshot,
    postRepaint: machine.postRepaint,
    prime,
    trace,
    pass: prime.pass && Boolean(trace.firstZero) && (
      Boolean(trace.firstWipe) ||
      trace.counts.contextLdir > 0 ||
      trace.counts.bulkClearBody > 0
    ),
  };
}

function transitionLine(row) {
  const first = row.trace.firstZero;
  if (!first) return `${row.key}: no zeroing transition captured.`;
  return `${row.key}: first zeroed ${first.field} ${hex(first.before)} -> ${hex(first.after)}; previous block ${hex(first.previousPc)} at step ${first.previousStep}, observed at ${hex(first.observedAtPc)} step ${first.observedAtStep}.`;
}

function countsSummary(trace) {
  return [
    `cxMain=${trace.counts.cxMain}`,
    `GetCSC=${trace.counts.getCsc}`,
    `0A2150=${trace.counts.contextLdir}`,
    `001879=${trace.counts.bulkClearBody}`,
    `0018F8=${trace.counts.bulkTail}`,
    `006D5D=${trace.counts.lowRoute}`,
    `tokenHooks=${trace.counts.tokenDeposit + trace.counts.tokenExit + trace.counts.tokenGateTest + trace.counts.eolTupleSave}`,
  ].join(', ');
}

function recentString(event) {
  return (event?.recent ?? [])
    .slice(-20)
    .map((entry) => `${hex(entry.pc)}@${entry.step}`)
    .join(' -> ');
}

function compactEvent(event) {
  if (!event) return null;
  return {
    field: event.field,
    before: hex(event.before),
    after: hex(event.after),
    zeroing: event.zeroing,
    previousPc: hex(event.previousPc),
    previousStep: event.previousStep,
    observedAtPc: hex(event.observedAtPc),
    observedAtStep: event.observedAtStep,
    recent: (event.recent ?? []).slice(-24).map((entry) => `${hex(entry.pc)}@${entry.step}`),
  };
}

function compactWipe(event) {
  if (!event) return null;
  return {
    pc: hex(event.pc),
    step: event.step,
    block: event.block,
    fields: Object.fromEntries(Object.entries(event.snap?.fields ?? {}).map(([name, value]) => [name, hex(value)])),
    recent: (event.recent ?? []).slice(-24).map((entry) => `${hex(entry.pc)}@${entry.step}`),
  };
}

function compactHit(hit) {
  return {
    name: hit.name,
    pc: hex(hit.pc),
    step: hit.step,
    count: hit.count,
    dasm: hit.dasm,
    fields: Object.fromEntries(Object.entries(hit.snap?.fields ?? {}).map(([name, value]) => [name, hex(value)])),
    recent: (hit.recent ?? []).slice(-16).map((entry) => `${hex(entry.pc)}@${entry.step}`),
  };
}

function compactScenario(row) {
  return {
    key: row.key,
    phases: row.phases,
    postRepaint: row.postRepaint,
    prime: row.prime,
    controlResult: row.trace.result,
    counts: row.trace.counts,
    firstZero: compactEvent(row.trace.firstZero),
    firstWipe: compactWipe(row.trace.firstWipe),
    transitions: row.trace.transitions.slice(0, 16).map(compactEvent),
    hits: row.trace.hits.filter((hit) => [
      'cxMain',
      'getCsc',
      'keyHandler',
      'contextLdir',
      'contextSpaceFill',
      'bulkGate',
      'bulkClearBody',
      'bulkTail',
      'lowRoute',
      'tokenDeposit',
      'tokenExit',
      'tokenGateTest',
      'eolTupleSave',
    ].includes(hit.name)).slice(0, 40).map(compactHit),
    final: row.trace.status,
  };
}

function buildReport(data) {
  const lines = [
    '# Phase 676: Control-Key Wipe Path Trace',
    '',
    'Probe: `probe-phase676-control-wipe-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase676-control-wipe-trace.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}`,
    '- Scope: direct Node harness mirroring the browser coldboot/VAT-replay/edit-context seed; no browser-shell/runtime/transpiler edits.',
    '',
    '## Findings',
    '',
    ...data.findings.map((line) => `- ${line}`),
    '',
    '## Trace Summary',
    '',
    '| control | prime inserted | control termination | first zeroed field | zeroing block | observed at | first 0x0018F8 step | counts | final D007CA | final D0243A | final VAT |',
    '|---|---|---|---|---:|---:|---:|---|---:|---:|---:|',
    ...data.scenarios.map((row) => {
      const first = row.trace.firstZero;
      return `| ${row.key} | ${row.prime.pass ? 'yes' : 'no'} | ${row.trace.result.termination} ${row.trace.result.lastPc} | ${first?.field ?? '-'} | ${hex(first?.previousPc)} | ${hex(first?.observedAtPc)} | ${row.trace.firstWipe?.step ?? '-'} | ${countsSummary(row.trace)} | ${row.trace.status.D007CA} | ${row.trace.status.D0243A} | ${row.trace.status.D02590} |`;
    }),
    '',
    '## Recent Blocks Around First Zero',
    '',
    ...data.scenarios.flatMap((row) => [
      `### ${row.key}`,
      '',
      transitionLine(row),
      '',
      '```text',
      recentString(row.trace.firstZero),
      '```',
      '',
    ]),
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(data.compact, null, 2),
    '```',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

console.log('phase676: trace Enter/Clear control-key wipe paths');
const scenarios = CONTROL_KEYS.map((key) => runScenario(key));
const pass = scenarios.every((row) => row.pass);
const findings = [
  ...scenarios.map(transitionLine),
  'ENTER uses the browser-equivalent kEnter seed (scan 0x09, internal 0x05); CLEAR uses the browser direct-EOL seed (scan/internal 0x0F).',
  'A separate control-key strategy is appropriate: both controls are non-insertable, so the insertion early-stop map should remain limited to byte-deposit keys.',
];
const summary = {
  probe: 'phase676-control-wipe-trace',
  pass,
  findings,
  scenarios,
  compact: scenarios.map(compactScenario),
};

fs.writeFileSync(REPORT_PATH, buildReport(summary));
console.log(JSON.stringify({
  probe: summary.probe,
  pass,
  findings,
  scenarios: scenarios.map((row) => ({
    key: row.key,
    primePass: row.prime.pass,
    result: row.trace.result,
    firstZero: row.trace.firstZero && {
      field: row.trace.firstZero.field,
      previousPc: hex(row.trace.firstZero.previousPc),
      observedAtPc: hex(row.trace.firstZero.observedAtPc),
      observedAtStep: row.trace.firstZero.observedAtStep,
    },
    firstWipeStep: row.trace.firstWipe?.step ?? null,
    counts: row.trace.counts,
    final: row.trace.status,
  })),
}, null, 2));

if (!pass) process.exitCode = 1;

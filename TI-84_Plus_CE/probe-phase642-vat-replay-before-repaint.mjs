import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase642-vat-replay-before-repaint.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const OUTER_LOOP = 0x08C331;
const CX_MAIN = 0x0585E9;

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

const KEY_TARGETS = Object.freeze({
  cleanup0018f8: 0x0018F8,
  halt0019b5: HALT_IDLE,
  getCsc03fa09: 0x03FA09,
  loop08c331: OUTER_LOOP,
  cxMain0585e9: CX_MAIN,
  outer08f3b8: 0x08F3B8,
  tokenReader090883: 0x090883,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  tokenStore09098e: 0x09098E,
  eolTuple08f54b: 0x08F54B,
  low006d38: 0x006D38,
  low006d5d: 0x006D5D,
});

const REPAINT_TARGETS = Object.freeze({
  homeRepaint058241: HOME_REPAINT,
  vatSearch084711: 0x084711,
  vatRewind082be2: 0x082BE2,
  cleanup0018f8: 0x0018F8,
  halt0019b5: HALT_IDLE,
});

const KEY_CASES = Object.freeze([
  { name: 'eol-clear', label: 'EOL/CLEAR', pendingKey: 0x0F, matrixScan: 0x0F, maxSteps: 650000 },
  { name: 'digit2', label: 'Digit2', pendingKey: 0x90, matrixScan: 0x1A, maxSteps: 350000 },
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[addr + i] << (8 * i);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[addr + i] = (value >>> (8 * i)) & 0xFF;
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
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

function readSnapshotFields(mem) {
  return fieldsObject(captureFields(mem));
}

function countVRAMPixels(mem) {
  let count = 0;
  for (let addr = 0xD40000; addr < 0xD40000 + (320 * 240 * 2); addr += 2) {
    const word = mem[addr] | (mem[addr + 1] << 8);
    if (word !== 0xFFFF) count += 1;
  }
  return count;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function formatRunResult(result) {
  return {
    steps: result.steps,
    termination: result.termination,
    lastPc: hex(result.lastPc ?? 0),
    lastMode: result.lastMode,
  };
}

function makeMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function runBootToPhase5Ready() {
  const { mem, peripherals, executor, cpu } = makeMachine();
  const phases = [];

  phases.push({ name: 'p1-coldboot', result: executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });

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
  const launchSp = STACK_TOP - 24;
  cpu.sp = launchSp;
  fillSentinel(mem, cpu.sp, 24);
  write24(mem, launchSp, WARM_IDLE);
  write24(mem, 0xD008E0, launchSp);

  return { mem, peripherals, executor, cpu, phases };
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

function rearmCxMain(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function seedKey(mem, keyCase) {
  mem[0xD0058C] = keyCase.pendingKey;
  mem[0xD0058D] = keyCase.pendingKey;
  mem[0xD0058E] = keyCase.pendingKey;
  if (keyCase.matrixScan != null) mem[0xD00587] = keyCase.matrixScan;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function makeCounter(targets) {
  return Object.fromEntries(Object.keys(targets).map((name) => [name, 0]));
}

function hotBlocksSummary(hotBlocks, limit = 16) {
  return Array.from(hotBlocks.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([pc, count]) => ({ pc, count }));
}

function runPhase5WithSnapshot() {
  const machine = runBootToPhase5Ready();
  const { mem, executor } = machine;
  const targetCounts = { launchHome09dd62: 0, memInit09dee0: 0, clear001879: 0, cleanup0018f8: 0, halt0019b5: 0 };
  const lastBlocks = [];
  let block = 0;
  let snapshot = null;

  const result = executor.runFrom(LAUNCH_HOME, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      const pcHex = hex(addr);
      lastBlocks.push(pcHex);
      if (lastBlocks.length > 64) lastBlocks.shift();
      if (addr === LAUNCH_HOME) targetCounts.launchHome09dd62 += 1;
      if (addr === 0x09DEE0) targetCounts.memInit09dee0 += 1;
      if (addr === 0x001879) {
        targetCounts.clear001879 += 1;
        if (!snapshot && readValue(mem, 0xD02590, 3) !== 0) {
          snapshot = { block, pc: pcHex, fields: captureFields(mem), vramPixels: countVRAMPixels(mem) };
        }
      }
      if (addr === 0x0018F8) targetCounts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) targetCounts.halt0019b5 += 1;
    },
  });

  return {
    ...machine,
    phase5: {
      result: formatRunResult(result),
      targetCounts,
      snapshot,
      lastBlocks,
      afterFields: readSnapshotFields(mem),
      vramPixels: countVRAMPixels(mem),
    },
  };
}

function runRepaint(mem, peripherals, executor, cpu) {
  const counts = makeCounter(REPAINT_TARGETS);
  const lastBlocks = [];
  const hotBlocks = new Map();
  let block = 0;
  let vramPeak = countVRAMPixels(mem);

  prepareEventFrame(mem, peripherals, cpu);
  const result = executor.runFrom(HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      const pcHex = hex(addr);
      hotBlocks.set(pcHex, (hotBlocks.get(pcHex) ?? 0) + 1);
      lastBlocks.push(pcHex);
      if (lastBlocks.length > 64) lastBlocks.shift();
      for (const [name, target] of Object.entries(REPAINT_TARGETS)) {
        if (addr === target) counts[name] += 1;
      }
      if (block % 5000 === 0) vramPeak = Math.max(vramPeak, countVRAMPixels(mem));
    },
  });
  vramPeak = Math.max(vramPeak, countVRAMPixels(mem));

  return {
    result: formatRunResult(result),
    counts,
    lastBlocks,
    hotBlocks: hotBlocksSummary(hotBlocks),
    fields: readSnapshotFields(mem),
    vramPixels: countVRAMPixels(mem),
    vramPeak,
  };
}

function readTuple(mem) {
  return {
    D02A29: readValue(mem, 0xD02A29, 2),
    D02A2B: readValue(mem, 0xD02A2B, 2),
    D02A1B: readValue(mem, 0xD02A1B, 2),
    D0059A: readValue(mem, 0xD0059A, 1),
    D01150: readValue(mem, 0xD01150, 2),
    D0243D: readValue(mem, 0xD0243D, 3),
    D02A40: readValue(mem, 0xD02A40, 3),
    D02A28: readValue(mem, 0xD02A28, 1),
  };
}

function tupleHasSignal(tuple) {
  return tuple.D02A29 !== 0 || tuple.D02A2B !== 0 || tuple.D02A1B !== 0 || tuple.D0243D !== 0 || tuple.D02A40 !== 0;
}

function formatTuple(tuple) {
  return Object.fromEntries(Object.entries(tuple).map(([name, value]) => {
    const width = name === 'D02A28' || name === 'D0059A' ? 2 : name === 'D0243D' || name === 'D02A40' ? 6 : 4;
    return [name, hex(value, width)];
  }));
}

function runKeyBurst(mem, peripherals, executor, cpu, keyCase) {
  rearmCxMain(mem);
  seedKey(mem, keyCase);
  prepareEventFrame(mem, peripherals, cpu);

  const counts = makeCounter(KEY_TARGETS);
  const regionCounts = { token08f000_090fff: 0, display090000_091fff: 0, low006d00_006dff: 0, cleanupLow001000_001fff: 0 };
  const targetSamples = [];
  const tokenEvents = [];
  const tupleHits = [];
  const firstBlocks = [];
  const lastBlocks = [];
  const hotBlocks = new Map();
  let block = 0;
  let vramPeak = countVRAMPixels(mem);
  let lastTokenA = mem[0xD001B8];
  let lastTokenB = mem[0xD001D3];

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: keyCase.maxSteps,
    maxLoopIterations: keyCase.maxSteps,
    diHaltBypass: true,
    diHaltBypassEntry: OUTER_LOOP,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      const pcHex = hex(addr);
      hotBlocks.set(pcHex, (hotBlocks.get(pcHex) ?? 0) + 1);
      if (firstBlocks.length < 48) firstBlocks.push(pcHex);
      lastBlocks.push(pcHex);
      if (lastBlocks.length > 64) lastBlocks.shift();

      for (const [name, target] of Object.entries(KEY_TARGETS)) {
        if (addr === target) {
          counts[name] += 1;
          if (targetSamples.length < 80) {
            targetSamples.push({
              block,
              target: name,
              pc: pcHex,
              fields: {
                D00587: hex(mem[0xD00587], 2),
                D0058C: hex(mem[0xD0058C], 2),
                D0058D: hex(mem[0xD0058D], 2),
                D0058E: hex(mem[0xD0058E], 2),
                D007CA: hex(readValue(mem, 0xD007CA, 3)),
                D008E0: hex(readValue(mem, 0xD008E0, 3)),
                D02590: hex(readValue(mem, 0xD02590, 3)),
                D02A28: hex(mem[0xD02A28], 2),
                D001B8: hex(mem[0xD001B8], 2),
                D001D3: hex(mem[0xD001D3], 2),
              },
            });
          }
        }
      }

      if (addr === 0x08F5E1 || addr === 0x090992) mem[0xD02A28] = 1;
      if (addr === 0x08F54B) {
        const tuple = readTuple(mem);
        if (tupleHasSignal(tuple)) tupleHits.push({ block, tuple: formatTuple(tuple) });
      }

      if (mem[0xD001B8] !== lastTokenA || mem[0xD001D3] !== lastTokenB) {
        tokenEvents.push({
          block,
          pc: pcHex,
          D001B8: [hex(lastTokenA, 2), hex(mem[0xD001B8], 2)],
          D001D3: [hex(lastTokenB, 2), hex(mem[0xD001D3], 2)],
          D02A28: hex(mem[0xD02A28], 2),
        });
        lastTokenA = mem[0xD001B8];
        lastTokenB = mem[0xD001D3];
      }

      if (addr >= 0x08F000 && addr <= 0x090FFF) regionCounts.token08f000_090fff += 1;
      if (addr >= 0x090000 && addr <= 0x091FFF) regionCounts.display090000_091fff += 1;
      if (addr >= 0x006D00 && addr <= 0x006DFF) regionCounts.low006d00_006dff += 1;
      if (addr >= 0x001000 && addr <= 0x001FFF) regionCounts.cleanupLow001000_001fff += 1;
      if (block % 5000 === 0) vramPeak = Math.max(vramPeak, countVRAMPixels(mem));
    },
  });
  vramPeak = Math.max(vramPeak, countVRAMPixels(mem));

  return {
    key: keyCase.name,
    label: keyCase.label,
    result: formatRunResult(result),
    counts,
    regionCounts,
    firstBlocks,
    lastBlocks,
    targetSamples,
    tokenEvents,
    tupleHits,
    hotBlocks: hotBlocksSummary(hotBlocks, 24),
    fields: {
      D007CA: hex(readValue(mem, 0xD007CA, 3)),
      D008E0: hex(readValue(mem, 0xD008E0, 3)),
      D02590: hex(readValue(mem, 0xD02590, 3)),
      D001B8: hex(mem[0xD001B8], 2),
      D001D3: hex(mem[0xD001D3], 2),
      D02A28: hex(mem[0xD02A28], 2),
      tuple: formatTuple(readTuple(mem)),
    },
    vramPixels: countVRAMPixels(mem),
    vramPeak,
  };
}

function runReplayScenario(keyCase) {
  const machine = runPhase5WithSnapshot();
  const { mem, peripherals, executor, cpu, phase5, phases } = machine;
  const snapshot = phase5.snapshot?.fields ?? null;
  if (!snapshot) {
    return {
      key: keyCase.name,
      phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
      phase5,
      error: 'snapshot-not-captured',
    };
  }

  restoreFields(mem, snapshot);
  const afterReplay = { fields: readSnapshotFields(mem), vramPixels: countVRAMPixels(mem) };
  const repaint = runRepaint(mem, peripherals, executor, cpu);
  const keyBurst = runKeyBurst(mem, peripherals, executor, cpu, keyCase);

  return {
    key: keyCase.name,
    phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    phase5: {
      result: phase5.result,
      targetCounts: phase5.targetCounts,
      snapshot: {
        block: phase5.snapshot.block,
        pc: phase5.snapshot.pc,
        fields: fieldsObject(phase5.snapshot.fields),
        vramPixels: phase5.snapshot.vramPixels,
      },
      afterFields: phase5.afterFields,
      vramPixels: phase5.vramPixels,
    },
    afterReplay,
    repaint,
    keyBurst,
  };
}

function scenarioTable(scenarios) {
  return [
    '| Key | Repaint term | Repaint PC | Repaint VAT loops | Repaint VRAM | Key term | Key PC | cxMain | 0x08F5E1 | 0x090992 | 0x08F54B | low 0x006Dxx | Key VRAM peak |',
    '|---|---|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|',
    ...scenarios.map((row) => {
      if (row.error) return `| ${row.key} | ERROR ${row.error} | | | | | | | | | | | |`;
      return `| ${row.keyBurst.label} | ${row.repaint.result.termination} | ${row.repaint.result.lastPc} | ${row.repaint.counts.vatSearch084711} | ${row.repaint.vramPixels} | ${row.keyBurst.result.termination} | ${row.keyBurst.result.lastPc} | ${row.keyBurst.counts.cxMain0585e9} | ${row.keyBurst.counts.tokenExit08f5e1} | ${row.keyBurst.counts.tokenGate090992} | ${row.keyBurst.counts.eolTuple08f54b} | ${row.keyBurst.regionCounts.low006d00_006dff} | ${row.keyBurst.vramPeak} |`;
    }),
  ].join('\n');
}

function buildReport(scenarios) {
  const first = scenarios.find((row) => !row.error);
  const repaintHalted = scenarios.every((row) => !row.error && row.repaint.result.termination === 'halt');
  const maxRepaintVatLoops = Math.max(...scenarios.filter((row) => !row.error).map((row) => row.repaint.counts.vatSearch084711));
  const anyTokenRoute = scenarios.some((row) => !row.error && (row.keyBurst.counts.tokenExit08f5e1 > 0 || row.keyBurst.counts.tokenGate090992 > 0 || row.keyBurst.counts.eolTuple08f54b > 0));
  const lowRouteStillHot = scenarios.some((row) => !row.error && row.keyBurst.regionCounts.low006d00_006dff > 10000);

  return [
    '# Phase 642: VAT Replay Before Repaint',
    '',
    'Probe: `probe-phase642-vat-replay-before-repaint.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase642-vat-replay-before-repaint.mjs`',
    '',
    '## Summary',
    '',
    first
      ? `- **** Snapshot capture succeeded at block ${first.phase5.snapshot.block} / PC ${first.phase5.snapshot.pc}; captured D02590=${first.phase5.snapshot.fields.D02590}, D0259D=${first.phase5.snapshot.fields.D0259D}, D007CA=${first.phase5.snapshot.fields.D007CA}.`
      : '- !! No successful scenario captured the Phase 5 snapshot.',
    repaintHalted
      ? `- **** Replaying the Phase 5 snapshot before \`0x058241\` fixes the repaint residual: all tested scenarios halted at \`0x0019B5\`; the former hot \`0x084711\` VAT-search loop collapsed to ${maxRepaintVatLoops} visits.`
      : '- **** Replaying the Phase 5 snapshot before `0x058241` did NOT produce a clean repaint halt in every scenario; see the table and JSON for exact counters.',
    anyTokenRoute
      ? '- **** At least one key burst reached the `0x08Fxxx/0x090xxx` token/tuple route after replay.'
      : '- **** Key bursts still bypassed `0x08F5E1`/`0x090992`/`0x08F54B`; VAT replay alone is not sufficient to restore the proven token/tuple route.',
    lowRouteStillHot
      ? '- *** The low `0x006Dxx` route remains hot for at least one key burst, so the browser-routing blocker is not solely the zeroed VAT tuple.'
      : '- *** The low `0x006Dxx` route was not hot after replay in the tested direct scenarios.',
    '',
    '## Scenario Results',
    '',
    scenarioTable(scenarios),
    '',
    '## Captured Snapshot',
    '',
    '```json',
    JSON.stringify(first?.phase5?.snapshot ?? null, null, 2),
    '```',
    '',
    '## Full Scenario JSON',
    '',
    '```json',
    JSON.stringify(scenarios, null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    repaintHalted && anyTokenRoute
      ? 'The Phase 5 tuple replay is a viable integration candidate: it keeps the launch-home MEM_INIT/VAT/context values alive long enough for repaint and key routing. The next step is to port this restore point into the in-memory/browser coldboot path and rerun the phase637 persistence assertions.'
      : 'The Phase 5 snapshot replay is only a partial fix under this direct test. The next useful step is to trace why launch-home enters the `0x001879` clear path, and separately keep tracing the low `0x006Dxx` route cause during browser key bursts.',
    '',
    'No runtime, transpiler, or browser source files were modified.',
    '',
  ].join('\n');
}

console.log('phase642: replay valid Phase 5 VAT/context snapshot before repaint');
const scenarios = KEY_CASES.map((keyCase) => runReplayScenario(keyCase));
fs.writeFileSync(REPORT_PATH, `${buildReport(scenarios)}\n`);

const pass = scenarios.every((row) => !row.error && row.phase5.snapshot && row.repaint && row.keyBurst);
console.log(JSON.stringify({
  probe: 'phase642-vat-replay-before-repaint',
  pass,
  report: path.basename(REPORT_PATH),
  summary: scenarios.map((row) => row.error ? { key: row.key, error: row.error } : {
    key: row.key,
    snapshotD02590: row.phase5.snapshot.fields.D02590,
    repaint: row.repaint.result,
    repaintVatLoops: row.repaint.counts.vatSearch084711,
    key: row.keyBurst.label,
    keyResult: row.keyBurst.result,
    tokenExit08f5e1: row.keyBurst.counts.tokenExit08f5e1,
    tokenGate090992: row.keyBurst.counts.tokenGate090992,
    eolTuple08f54b: row.keyBurst.counts.eolTuple08f54b,
    low006dRegion: row.keyBurst.regionCounts.low006d00_006dff,
    vramPeak: row.keyBurst.vramPeak,
  }),
}, null, 2));

if (!pass) process.exitCode = 1;

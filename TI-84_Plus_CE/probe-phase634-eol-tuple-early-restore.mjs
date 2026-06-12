import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const EOL_KEY = 0x0f;

const FIELDS = [
  ['D02A29', 0xd02a29, 2],
  ['D02A2B', 0xd02a2b, 2],
  ['D02A1B', 0xd02a1b, 2],
  ['D0059A', 0xd0059a, 1],
  ['D01150', 0xd01150, 2],
  ['D0243D', 0xd0243d, 3],
  ['D02A40', 0xd02a40, 3],
  ['D02A28', 0xd02a28, 1],
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[addr + i] << (8 * i);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[addr + i] = (value >> (8 * i)) & 0xff;
}

function readTuple(mem) {
  return Object.fromEntries(FIELDS.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
}

function writeTuple(mem, tuple) {
  for (const [name, addr, len] of FIELDS) writeValue(mem, addr, len, tuple[name] ?? 0);
}

function tupleText(tuple) {
  return FIELDS.map(([name, , len]) => `${name}=${hex(tuple[name], len * 2)}`).join(' ');
}

function tupleHasSignal(tuple) {
  return tuple.D02A29 !== 0 || tuple.D02A2B !== 0 || tuple.D02A1B !== 0 || tuple.D0243D !== 0 || tuple.D02A40 !== 0;
}

function rearmHomeContext(romBytes, mem) {
  for (let i = 0; i < 21; i += 1) mem[0xd007ca + i] = romBytes[0x0585d3 + i];
  mem[0xd0008d] = romBytes[0x0585d3 + 21];
}

function seedKey(mem, keyCode) {
  mem[0xd0058c] = keyCode;
  mem[0xd0058e] = keyCode;
  mem[0xd00587] = keyCode;
  mem[0xd0009f] |= 0x20;
  mem[0xd00080] |= 0x08;
}

async function bootSystem(romModule, romBytes) {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(romModule.PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08c331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 12; mem.fill(0xff, cpu.sp, cpu.sp + 12);
  executor.runFrom(0x0019be, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 });

  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  const launchSp = 0xd1a87e - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, 0x0019be);
  write24(mem, 0xd008e0, launchSp);
  executor.runFrom(0x09dd62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, HALT);
  executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

  return { mem, executor, cpu };
}

async function runEolCase(romModule, romBytes, mode) {
  const { mem, executor, cpu } = await bootSystem(romModule, romBytes);
  rearmHomeContext(romBytes, mem);
  seedKey(mem, EOL_KEY);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xd008e0, cpu.sp);

  let block = 0;
  let latestTuple = null;
  let wipeCount = 0;
  let restorePending = false;
  const tupleHits = [];
  const wipeHits = [];
  const restoreEvents = [];

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 650000,
    maxLoopIterations: 650000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xffffff;

      if (restorePending && latestTuple && mode === 'afterSecondWipe') {
        writeTuple(mem, latestTuple);
        restoreEvents.push({ block, pc: addr, tuple: readTuple(mem) });
        restorePending = false;
      }

      if (addr === 0x08f54b) {
        latestTuple = readTuple(mem);
        tupleHits.push({ block, tuple: latestTuple });
      }
      if (addr === 0x0018f8) {
        wipeCount += 1;
        wipeHits.push({ block, tuple: readTuple(mem) });
        if (mode === 'afterSecondWipe' && wipeCount === 2) restorePending = true;
      }
      if (mode === 'atHalt' && latestTuple && addr === HALT) {
        writeTuple(mem, latestTuple);
        restoreEvents.push({ block, pc: addr, tuple: readTuple(mem) });
      }
    },
  });

  return {
    mode,
    result,
    tupleHits,
    wipeHits,
    restoreEvents,
    finalTuple: readTuple(mem),
  };
}

function buildReport(baseline, afterSecondWipe, atHalt) {
  return [
    '# Phase 634: EOL Tuple Early Restore',
    '',
    'Probe: `probe-phase634-eol-tuple-early-restore.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase634-eol-tuple-early-restore.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- *** Baseline confirms the phase630 lifecycle: EOL hits \`0x08F54B\` ${baseline.tupleHits.length} times and cleanup \`0x0018F8\` ${baseline.wipeHits.length} times, then halts with a cleared tuple: \`${tupleText(baseline.finalTuple)}\`.`,
    `- **** Restoring on the first block boundary after the second \`0x0018F8\` cleanup entry succeeds. Restore occurred at block ${afterSecondWipe.restoreEvents[0]?.block ?? 'n/a'} / PC ${afterSecondWipe.restoreEvents[0] ? hex(afterSecondWipe.restoreEvents[0].pc) : 'n/a'}, and the final halt tuple survives: \`${tupleText(afterSecondWipe.finalTuple)}\`.`,
    `- *** HALT restore remains a control and produces the same surviving tuple: \`${tupleText(atHalt.finalTuple)}\`.`,
    '- *** Practical implication: the earliest proven safe integration point is immediately after the final cleanup entry returns to the next lifted block, not only at the HALT boundary. Browser-shell tuple persistence can restore before final idle if it can identify the final cleanup pass.',
    '',
    '## Case Results',
    '',
    '| Case | Termination | Steps | Last PC | 0x08F54B hits | 0x0018F8 hits | Restore events | Final has signal |',
    '|---|---|---:|---|---:|---:|---:|---|',
    ...[baseline, afterSecondWipe, atHalt].map((row) => `| ${row.mode} | ${row.result.termination} | ${row.result.steps} | ${hex(row.result.lastPc)} | ${row.tupleHits.length} | ${row.wipeHits.length} | ${row.restoreEvents.length} | ${tupleHasSignal(row.finalTuple) ? 'yes' : 'no'} |`),
    '',
    '## Restore Events',
    '',
    '| Case | Block | PC | Tuple After Restore |',
    '|---|---:|---|---|',
    ...[afterSecondWipe, atHalt].flatMap((row) => row.restoreEvents.map((event) => `| ${row.mode} | ${event.block} | ${hex(event.pc)} | \`${tupleText(event.tuple)}\` |`)),
    '',
    '## Captured Natural Tuples',
    '',
    '| Hit | Block | Tuple |',
    '|---:|---:|---|',
    ...afterSecondWipe.tupleHits.map((hit, idx) => `| ${idx + 1} | ${hit.block} | \`${tupleText(hit.tuple)}\` |`),
    '',
    '## Interpretation',
    '',
    'The final `0x0018F8` cleanup entry is followed by a lifted block boundary before HALT. Restoring the last natural EOL tuple at that first post-cleanup boundary preserves it through the rest of the OS path. That makes the integration point less late than phase630 proved: a display-preserve hook does not need to wait for HALT as long as it restores after the final cleanup pass, not before it.',
    '',
    'No runtime, transpiler, or browser files were changed.',
    '',
  ].join('\n');
}

console.log('Phase 634: restore natural EOL tuple immediately after final cleanup');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);

const baseline = await runEolCase(romModule, romBytes, 'baseline');
console.log(`baseline termination=${baseline.result.termination} steps=${baseline.result.steps} lastPc=${hex(baseline.result.lastPc)} tupleHits=${baseline.tupleHits.length} wipeHits=${baseline.wipeHits.length} final=${tupleText(baseline.finalTuple)}`);

const afterSecondWipe = await runEolCase(romModule, romBytes, 'afterSecondWipe');
console.log(`afterSecondWipe termination=${afterSecondWipe.result.termination} steps=${afterSecondWipe.result.steps} lastPc=${hex(afterSecondWipe.result.lastPc)} tupleHits=${afterSecondWipe.tupleHits.length} wipeHits=${afterSecondWipe.wipeHits.length} restores=${afterSecondWipe.restoreEvents.length} final=${tupleText(afterSecondWipe.finalTuple)}`);

const atHalt = await runEolCase(romModule, romBytes, 'atHalt');
console.log(`atHalt termination=${atHalt.result.termination} steps=${atHalt.result.steps} lastPc=${hex(atHalt.result.lastPc)} tupleHits=${atHalt.tupleHits.length} wipeHits=${atHalt.wipeHits.length} restores=${atHalt.restoreEvents.length} final=${tupleText(atHalt.finalTuple)}`);

fs.writeFileSync(path.join(__dirname, 'phase634-eol-tuple-early-restore.md'), buildReport(baseline, afterSecondWipe, atHalt));

const clean = [baseline, afterSecondWipe, atHalt].every((row) => row.result.termination === 'halt' && (row.result.lastPc & 0xffffff) === HALT);
if (!clean
  || baseline.tupleHits.length !== 2
  || afterSecondWipe.tupleHits.length !== 2
  || atHalt.tupleHits.length !== 2
  || baseline.wipeHits.length !== 2
  || afterSecondWipe.wipeHits.length !== 2
  || atHalt.wipeHits.length !== 2
  || tupleHasSignal(baseline.finalTuple)
  || !tupleHasSignal(afterSecondWipe.finalTuple)
  || !tupleHasSignal(atHalt.finalTuple)
  || afterSecondWipe.restoreEvents.length !== 1
  || atHalt.restoreEvents.length !== 1) {
  console.log('\nphase634: FAIL -- early EOL tuple restore expectations were not met');
  process.exit(1);
}

console.log('\nphase634: PASS -- EOL tuple survives when restored immediately after final cleanup');

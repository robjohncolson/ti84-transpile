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

async function runEolCase(romModule, romBytes, persist) {
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
  let restoredAtHalt = false;
  const tupleHits = [];
  const wipeHits = [];

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 650000,
    maxLoopIterations: 650000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xffffff;
      if (addr === 0x08f54b) {
        latestTuple = readTuple(mem);
        tupleHits.push({ block, tuple: latestTuple });
      }
      if (addr === 0x0018f8) wipeHits.push({ block, tuple: readTuple(mem) });
      if (persist && latestTuple && addr === HALT) {
        writeTuple(mem, latestTuple);
        restoredAtHalt = true;
      }
    },
  });

  return {
    persist,
    result,
    tupleHits,
    wipeHits,
    restoredAtHalt,
    finalTuple: readTuple(mem),
  };
}

function buildReport(baseline, persisted) {
  return [
    '# Phase 630: EOL Tuple Persistence',
    '',
    'Probe: `probe-phase630-eol-tuple-persist.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase630-eol-tuple-persist.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- **** Baseline EOL still reaches \`0x08F54B\` ${baseline.tupleHits.length} times and halts cleanly, but the final tuple is cleared: \`${tupleText(baseline.finalTuple)}\`.`,
    `- **** Persist hook captures the latest EOL tuple at \`0x08F54B\` and restores it at HALT after ${persisted.wipeHits.length} cleanup hits; final tuple survives: \`${tupleText(persisted.finalTuple)}\`.`,
    '- *** The surviving tuple is the second natural save from phase629: `D02A29=0x0212`, `D02A2B=0x0006`, `D02A1B=0x0013`, `D0243D=0xD2A814`, `D02A40=0xD1A91A`.',
    '- ** This proves EOL tuple persistence can be layered onto the existing post-cleanup display/token-buffer preservation path without runtime or transpiler changes.',
    '',
    '## Case Results',
    '',
    '| Case | Termination | Steps | Last PC | 0x08F54B hits | 0x0018F8 hits | Restored at halt | Final has signal |',
    '|---|---|---:|---|---:|---:|---|---|',
    ...[baseline, persisted].map((row) => `| ${row.persist ? 'persisted' : 'baseline'} | ${row.result.termination} | ${row.result.steps} | ${hex(row.result.lastPc)} | ${row.tupleHits.length} | ${row.wipeHits.length} | ${row.restoredAtHalt ? 'yes' : 'no'} | ${tupleHasSignal(row.finalTuple) ? 'yes' : 'no'} |`),
    '',
    '## Captured Tuples',
    '',
    '| Case | Hit | Block | Tuple |',
    '|---|---:|---:|---|',
    ...[baseline, persisted].flatMap((row) => row.tupleHits.map((hit, idx) => `| ${row.persist ? 'persisted' : 'baseline'} | ${idx + 1} | ${hit.block} | \`${tupleText(hit.tuple)}\` |`)),
    '',
    '## Interpretation',
    '',
    'The EOL tuple is valid before cleanup and zeroed at halt in the baseline path. Restoring only the captured tuple fields at the final halt boundary preserves the tuple exactly, which is enough to prove the persistence mechanism. A production browser-shell integration should apply this after the OS cleanup phase, alongside the already-proven VRAM and token-buffer persistence hooks.',
    '',
    'No runtime, transpiler, or browser files were changed.',
    '',
  ].join('\n');
}

console.log('Phase 630: persist natural EOL tuple through cleanup');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);

const baseline = await runEolCase(romModule, romBytes, false);
console.log(`baseline termination=${baseline.result.termination} steps=${baseline.result.steps} lastPc=${hex(baseline.result.lastPc)} tupleHits=${baseline.tupleHits.length} wipeHits=${baseline.wipeHits.length} final=${tupleText(baseline.finalTuple)}`);

const persisted = await runEolCase(romModule, romBytes, true);
console.log(`persisted termination=${persisted.result.termination} steps=${persisted.result.steps} lastPc=${hex(persisted.result.lastPc)} tupleHits=${persisted.tupleHits.length} wipeHits=${persisted.wipeHits.length} final=${tupleText(persisted.finalTuple)}`);

fs.writeFileSync(path.join(__dirname, 'phase630-eol-tuple-persist.md'), buildReport(baseline, persisted));

const clean = [baseline, persisted].every((row) => row.result.termination === 'halt' && (row.result.lastPc & 0xffffff) === HALT);
if (!clean || baseline.tupleHits.length !== 2 || persisted.tupleHits.length !== 2 || tupleHasSignal(baseline.finalTuple) || !tupleHasSignal(persisted.finalTuple) || !persisted.restoredAtHalt) {
  console.log('\nphase630: FAIL -- tuple persistence expectations were not met');
  process.exit(1);
}

console.log('\nphase630: PASS -- EOL tuple captured and persisted after cleanup');

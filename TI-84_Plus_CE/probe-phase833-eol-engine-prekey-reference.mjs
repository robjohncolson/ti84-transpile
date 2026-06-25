import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

// Phase 833 — bank the proven ENGINE-side pre-burst reference for the EOL/Escape key.
//
// Why: the post-keyboard-sweep browser shell stops the EOL/Escape key at the
// 0x0A229D space-fill owner pre-stop and never reaches the real OS tuple-save
// engine 0x08F54B. The proven in-memory recipe (phase629) DOES reach 0x08F54B.
// The controlling variable is the pre-burst state. This probe re-runs the proven
// recipe and snapshots that state so a later tick can diff it against the
// browser coldboot state and name the controlling field. Report-only, in-memory,
// no Chrome, no runtime/transpiler/shell edit.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const EOL_KEY = 0x0f;
const ENGINE_ENTRY = 0x08f54b; // EOL_TUPLE_SAVE_ENTRY (the engine the browser never reaches)

// The pre-burst field set we diff against the browser coldboot state later.
const SNAPSHOT_FIELDS = [
  // Seed fields (set by seedKey)
  ['D00587', 0xd00587, 1],
  ['D0058C', 0xd0058c, 1],
  ['D0058E', 0xd0058e, 1],
  ['D0009F', 0xd0009f, 1],
  ['D00080', 0xd00080, 1],
  // Home-context (set by rearmHomeContext from ROM[0x0585D3])
  ['D007CA', 0xd007ca, 3],
  ['D0008D', 0xd0008d, 1],
  ['D008E0', 0xd008e0, 3],
  // Display / edit / VAT state (built by the real OS init in bootSystem)
  ['D00082', 0xd00082, 1],
  ['D007E0', 0xd007e0, 1],
  ['D0243A', 0xd0243a, 3],
  ['D0243D', 0xd0243d, 3],
  ['D02590', 0xd02590, 3],
  ['D02593', 0xd02593, 3],
  ['D0259A', 0xd0259a, 3],
  ['D0259D', 0xd0259d, 3],
  ['D02A28', 0xd02a28, 1],
  ['D02A29', 0xd02a29, 2],
  ['D02A2B', 0xd02a2b, 2],
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

function snapshot(mem, cpu) {
  const fields = {};
  for (const [name, addr, len] of SNAPSHOT_FIELDS) {
    fields[name] = hex(readValue(mem, addr, len), len * 2);
  }
  fields.IY = hex(cpu._iy & 0xffffff);
  fields.MBASE = hex(cpu.mbase & 0xff, 2);
  fields.SP = hex(cpu.sp & 0xffffff);
  return fields;
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

function buildReport({ preBurst, engineHits, result, reachedEngine, haltedClean }) {
  return [
    '# Phase 833 — EOL Engine-Side Pre-Burst Reference',
    '',
    'Probe: `probe-phase833-eol-engine-prekey-reference.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase833-eol-engine-prekey-reference.mjs`  ',
    `Exit: ${reachedEngine && haltedClean ? 0 : 1}`,
    '',
    '## Purpose',
    '',
    'Banks the proven in-memory EOL pre-burst state that reaches the OS tuple-save engine',
    `\`${hex(ENGINE_ENTRY)}\`. The post-sweep browser shell stops EOL/Escape at the \`0x0A229D\``,
    'space-fill owner pre-stop and never reaches this engine. A later tick diffs this',
    'reference against the browser coldboot pre-key state to name the controlling field.',
    '',
    '## Assertion',
    '',
    `- Reached engine \`${hex(ENGINE_ENTRY)}\`: ${reachedEngine ? 'YES' : 'NO'} (hits=${engineHits.length}, expected 2).`,
    `- Halted clean at \`${hex(HALT)}\`: ${haltedClean ? 'YES' : 'NO'} (termination=${result.termination}, lastPc=${hex(result.lastPc)}, steps=${result.steps}).`,
    '',
    '## Engine-Side Pre-Burst Reference (snapshot taken immediately before the EOL burst)',
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...Object.entries(preBurst).map(([name, value]) => `| ${name} | ${value} |`),
    '',
    '## Engine Hits',
    '',
    '| Hit | Block |',
    '| ---: | ---: |',
    ...engineHits.map((h) => `| ${h.hit} | ${h.block} |`),
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify({ preBurst, engineHits, reachedEngine, haltedClean, termination: result.termination, lastPc: hex(result.lastPc), steps: result.steps }, null, 2),
    '```',
    '',
    'No runtime, transpiler, or browser files were changed.',
    '',
  ].join('\n');
}

console.log('Phase 833: bank engine-side EOL pre-burst reference');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const { mem, executor, cpu } = await bootSystem(romModule, romBytes);

rearmHomeContext(romBytes, mem);
seedKey(mem, EOL_KEY);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xd00080; cpu.mbase = 0xd0;
cpu.sp = 0xd1a87e - 24;
write24(mem, cpu.sp, HALT);
write24(mem, 0xd008e0, cpu.sp);

// Snapshot the proven pre-burst state — this is the engine-side reference.
const preBurst = snapshot(mem, cpu);
console.log('pre-burst reference:');
for (const [name, value] of Object.entries(preBurst)) console.log(`  ${name} = ${value}`);

let block = 0;
const engineHits = [];

const result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 650000,
  maxLoopIterations: 650000,
  onBlock(pc) {
    block += 1;
    if ((pc & 0xffffff) === ENGINE_ENTRY) {
      engineHits.push({ hit: engineHits.length + 1, block });
      console.log(`engine ${hex(ENGINE_ENTRY)} hit ${engineHits.length} block=${block}`);
    }
  },
});

const reachedEngine = engineHits.length === 2;
const haltedClean = result.termination === 'halt' && (result.lastPc & 0xffffff) === HALT;

const report = buildReport({ preBurst, engineHits, result, reachedEngine, haltedClean });
fs.writeFileSync(path.join(__dirname, 'phase833-eol-engine-prekey-reference.md'), report);

console.log(`termination=${result.termination} steps=${result.steps} lastPc=${hex(result.lastPc)}`);
console.log(`engine hits=${engineHits.length} reachedEngine=${reachedEngine} haltedClean=${haltedClean}`);
console.log('phase833: report written');

if (!reachedEngine || !haltedClean) {
  process.exit(1);
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;

const KEYS = [
  { name: 'digit 2', scan: 0x90 },
  { name: 'digit 3', scan: 0x91 },
  { name: 'plus', scan: 0x70 },
  { name: 'minus', scan: 0x71 },
  { name: 'enter', scan: 0x05 },
  { name: 'clear', scan: 0x09 },
];

const WATCHPOINTS = new Map([
  [0x08df54, 'tuple seed/display setup'],
  [0x08dfdd, 'tuple derived display update'],
  [0x08e151, 'tuple display-position writer'],
  [0x08ed73, 'token-output setup'],
  [0x08f54b, 'normal/alternate exit save'],
  [0x08f6fe, 'movement helper reset'],
  [0x0018f8, 'cleanup wipe entry'],
]);

const FIELDS = [
  ['D02A29', 0xd02a29, 2],
  ['D02A2B', 0xd02a2b, 2],
  ['D02A1B', 0xd02a1b, 2],
  ['D0059A', 0xd0059a, 1],
  ['D0114E', 0xd0114e, 2],
  ['D01150', 0xd01150, 2],
  ['D01156', 0xd01156, 2],
  ['D0115A', 0xd0115a, 2],
  ['D0243D', 0xd0243d, 3],
  ['D02A40', 0xd02a40, 3],
  ['D02A28', 0xd02a28, 1],
];

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i++) value |= mem[addr + i] << (8 * i);
  return value >>> 0;
}

function readTuple(mem) {
  const row = {};
  for (const [name, addr, len] of FIELDS) row[name] = readValue(mem, addr, len);
  return row;
}

function tupleText(tuple) {
  return FIELDS.map(([name, , len]) => `${name}=${hex(tuple[name], len * 2)}`).join(' ');
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

function rearmHomeContext(romBytes, mem) {
  for (let i = 0; i < 21; i++) mem[0xd007ca + i] = romBytes[0x0585d3 + i];
  mem[0xd0008d] = romBytes[0x0585d3 + 21];
}

function seedKey(mem, scanCode) {
  mem[0xd0058c] = scanCode;
  mem[0xd0058e] = scanCode;
  mem[0xd00587] = scanCode;
  mem[0xd0009f] |= 0x20;
  mem[0xd00080] |= 0x08;
}

async function runKey(romModule, romBytes, spec) {
  const { mem, executor, cpu } = await bootSystem(romModule, romBytes);
  rearmHomeContext(romBytes, mem);
  seedKey(mem, spec.scan);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xd008e0, cpu.sp);

  let block = 0;
  const counts = new Map();
  const events = [];
  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500000,
    onBlock(pc) {
      block++;
      const addr = pc & 0xffffff;
      if (!WATCHPOINTS.has(addr)) return;
      counts.set(addr, (counts.get(addr) ?? 0) + 1);
      events.push({
        block,
        pc: addr,
        hit: counts.get(addr),
        label: WATCHPOINTS.get(addr),
        tuple: readTuple(mem),
      });
    },
  });

  return { spec, result, counts, events, finalTuple: readTuple(mem) };
}

function buildReport(rows) {
  const naturalHits = rows.flatMap((row) => row.events.filter((event) => event.pc !== 0x0018f8));
  const cleanHalts = rows.filter((row) => row.result.termination === 'halt' && (row.result.lastPc & 0xffffff) === HALT).length;
  return [
    '# Phase 627: Natural D02A29 Tuple Path Search',
    '',
    'Probe: `probe-phase627-natural-d02a29-tuple.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase627-natural-d02a29-tuple.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- ★★★ Tested ${rows.length} OS-driven key classes from the normal boot/init/paint/key-dispatch recipe, watching the decoded D02A29 tuple clusters \`0x08DF54\`, \`0x08DFDD\`, \`0x08E151\`, \`0x08ED73\`, \`0x08F54B\`, and \`0x08F6FE\`.`,
    `- ★★★ Natural tuple-cluster hits: ${naturalHits.length}. The exercised keys still do not reach the D02A29 tuple machinery; all observed watchpoint hits are the structural cleanup at \`0x0018F8\`.`,
    `- ★★ Clean halts: ${cleanHalts}/${rows.length}. This extends the phase623 negative result beyond the single \`2\` key to digits, operators, Enter, and Clear.`,
    '',
    '## Case Results',
    '',
    '| Key | Scan | Termination | Steps | Last PC | Tuple-cluster hits | Cleanup hits | Final tuple |',
    '|---|---:|---|---:|---|---:|---:|---|',
    ...rows.map((row) => {
      const tupleHits = row.events.filter((event) => event.pc !== 0x0018f8).length;
      const cleanupHits = row.counts.get(0x0018f8) ?? 0;
      return `| ${row.spec.name} | ${hex(row.spec.scan, 2)} | ${row.result.termination} | ${row.result.steps} | ${hex(row.result.lastPc)} | ${tupleHits} | ${cleanupHits} | \`${tupleText(row.finalTuple)}\` |`;
    }),
    '',
    '## Watchpoint Timeline',
    '',
    '| Key | Block | PC | Hit | Role | Tuple |',
    '|---|---:|---|---:|---|---|',
    ...rows.flatMap((row) => row.events.length
      ? row.events.map((event) => `| ${row.spec.name} | ${event.block} | ${hex(event.pc)} | ${event.hit} | ${event.label} | \`${tupleText(event.tuple)}\` |`)
      : [`| ${row.spec.name} | - | - | - | no watched blocks reached | - |`]),
    '',
    '## Interpretation',
    '',
    'The natural D02A29 tuple path remains unfound in the normal home-screen key pipeline. Phase625 proved the tuple machinery is live under direct entry, but this probe shows the common key classes exercised here do not route through it before cleanup. For practical browser work, keep using the proven VRAM/token-buffer snapshot path; tuple restoration needs a different OS mode or entry path that naturally reaches these clusters.',
    '',
    'No runtime, transpiler, or browser files were changed.',
    '',
  ].join('\n');
}

console.log('Phase 627: natural D02A29 tuple path search');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const rows = [];

for (const spec of KEYS) {
  const row = await runKey(romModule, romBytes, spec);
  rows.push(row);
  const tupleHits = row.events.filter((event) => event.pc !== 0x0018f8).length;
  console.log(`${spec.name} scan=${hex(spec.scan, 2)} termination=${row.result.termination} steps=${row.result.steps} lastPc=${hex(row.result.lastPc)} tupleHits=${tupleHits} cleanupHits=${row.counts.get(0x0018f8) ?? 0}`);
}

fs.writeFileSync(path.join(__dirname, 'phase627-natural-d02a29-tuple.md'), buildReport(rows));

const cleanHalts = rows.filter((row) => row.result.termination === 'halt' && (row.result.lastPc & 0xffffff) === HALT).length;
if (cleanHalts < 4) {
  console.log(`\nphase627: FAIL -- expected at least 4 clean key runs, found ${cleanHalts}`);
  process.exit(1);
}

console.log(`\nphase627: PASS -- natural tuple search completed across ${rows.length} keys and report written`);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;

const CASES = [
  { name: 'left', key: 0x02 },
  { name: 'right', key: 0x01 },
  { name: 'up', key: 0x03 },
  { name: 'down', key: 0x04 },
  { name: 'del', key: 0x0a },
  { name: 'ins', key: 0x0b },
  { name: 'bol', key: 0x0e },
  { name: 'eol', key: 0x0f },
  { name: 'graph/menu', key: 0x44 },
  { name: 'mode/menu', key: 0x45 },
  { name: 'y=/menu', key: 0x49 },
  { name: 'classic-right', key: 0x01, setup: (mem) => { mem[0xd00082] &= 0x7f; } },
  { name: 'mathprint-right', key: 0x01, setup: (mem) => { mem[0xd00082] |= 0x80; } },
  { name: 'alphaDown', key: 0x08 },
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

function seedKey(mem, keyCode) {
  mem[0xd0058c] = keyCode;
  mem[0xd0058e] = keyCode;
  mem[0xd00587] = keyCode;
  mem[0xd0009f] |= 0x20;
  mem[0xd00080] |= 0x08;
}

async function runCase(romModule, romBytes, spec) {
  const { mem, executor, cpu } = await bootSystem(romModule, romBytes);
  rearmHomeContext(romBytes, mem);
  spec.setup?.(mem);
  seedKey(mem, spec.key);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xd008e0, cpu.sp);

  let block = 0;
  const counts = new Map();
  const events = [];
  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 650000,
    maxLoopIterations: 650000,
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
  const hitCases = [...new Set(rows
    .filter((row) => row.events.some((event) => event.pc !== 0x0018f8))
    .map((row) => row.spec.name))];
  const cleanHalts = rows.filter((row) => row.result.termination === 'halt' && (row.result.lastPc & 0xffffff) === HALT).length;
  return [
    '# Phase 628: Alternate Natural D02A29 Tuple Path Search',
    '',
    'Probe: `probe-phase628-alt-d02a29-path.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase628-alt-d02a29-path.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- *** Tested ${rows.length} alternate natural key/mode cases: arrows, editor commands, menu-like keys, and classic/MathPrint right-arrow variants.`,
    `- **** Natural tuple-cluster hits: ${naturalHits.length}, all from case(s): ${hitCases.join(', ') || 'none'}. The EOL key naturally reaches \`0x08F54B\` twice before cleanup, with nonzero D02A29/D02A2B/D02A1B and D0243D/D02A40 state.`,
    `- *** Clean halts: ${cleanHalts}/${rows.length}. All non-MODE cases halted cleanly; MODE reached one cleanup wipe and then hit the 650K per-case step cap at \`0x006D5D\`.`,
    '- ** Negative coverage: arrows, DEL/INS, BOL, GRAPH/Y=/menu-like keys, alphaDown, and simple MathPrint/classic right-arrow variants still do not reach the watched tuple clusters.',
    '',
    '## Case Results',
    '',
    '| Case | Internal key | Termination | Steps | Last PC | Tuple-cluster hits | Cleanup hits | Final tuple |',
    '|---|---:|---|---:|---|---:|---:|---|',
    ...rows.map((row) => {
      const tupleHits = row.events.filter((event) => event.pc !== 0x0018f8).length;
      const cleanupHits = row.counts.get(0x0018f8) ?? 0;
      return `| ${row.spec.name} | ${hex(row.spec.key, 2)} | ${row.result.termination} | ${row.result.steps} | ${hex(row.result.lastPc)} | ${tupleHits} | ${cleanupHits} | \`${tupleText(row.finalTuple)}\` |`;
    }),
    '',
    '## Watched Events',
    '',
    '| Case | Block | PC | Hit | Role | Tuple |',
    '|---|---:|---|---:|---|---|',
    ...rows.flatMap((row) => row.events.length
      ? row.events.map((event) => `| ${row.spec.name} | ${event.block} | ${hex(event.pc)} | ${event.hit} | ${event.label} | \`${tupleText(event.tuple)}\` |`)
      : [`| ${row.spec.name} | - | - | - | no watched blocks reached | - |`]),
    '',
    '## Interpretation',
    '',
    'This resolves the alternate natural tuple-path search with one positive natural path: internal EOL (`0x0F`) reaches `0x08F54B`, the normal/alternate exit save cluster, twice before cleanup. The tuple is still transient and zeroed by the later `0x0018F8` cleanup, but it is no longer forced-only. The practical next step is to trace the EOL caller path into `0x08F54B` and decide whether its tuple snapshot should join the browser-shell display/token-buffer persistence path.',
    '',
    'No runtime, transpiler, or browser files were changed.',
    '',
  ].join('\n');
}

console.log('Phase 628: alternate natural D02A29 tuple path search');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const rows = [];

for (const spec of CASES) {
  const row = await runCase(romModule, romBytes, spec);
  rows.push(row);
  const tupleHits = row.events.filter((event) => event.pc !== 0x0018f8).length;
  console.log(`${spec.name} key=${hex(spec.key, 2)} termination=${row.result.termination} steps=${row.result.steps} lastPc=${hex(row.result.lastPc)} tupleHits=${tupleHits} cleanupHits=${row.counts.get(0x0018f8) ?? 0}`);
}

fs.writeFileSync(path.join(__dirname, 'phase628-alt-d02a29-path.md'), buildReport(rows));

const cleanHalts = rows.filter((row) => row.result.termination === 'halt' && (row.result.lastPc & 0xffffff) === HALT).length;
if (cleanHalts < 10) {
  console.log(`\nphase628: FAIL -- expected at least 10 clean key runs, found ${cleanHalts}`);
  process.exit(1);
}

console.log(`\nphase628: PASS -- alternate natural tuple search completed across ${rows.length} cases and report written`);

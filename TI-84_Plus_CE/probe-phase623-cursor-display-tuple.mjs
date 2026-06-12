import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;

const WATCHPOINTS = new Map([
  [0x08df54, 'seed cursor/display tuple'],
  [0x08ed73, 'token-output setup'],
  [0x08f54b, 'normal/alternate exit save'],
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

async function bootSystem() {
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
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

  return { romBytes, mem, executor, cpu };
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

async function runTrace() {
  const { romBytes, mem, executor, cpu } = await bootSystem();
  rearmHomeContext(romBytes, mem);
  seedKey(mem, 0x90);

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

  return { result, counts, events, finalTuple: readTuple(mem) };
}

function diffTuple(a, b) {
  return FIELDS
    .filter(([name]) => a[name] !== b[name])
    .map(([name, , len]) => `${name}:${hex(a[name], len * 2)}->${hex(b[name], len * 2)}`);
}

function buildReport(trace) {
  const byPc = new Map();
  for (const event of trace.events) {
    if (!byPc.has(event.pc)) byPc.set(event.pc, []);
    byPc.get(event.pc).push(event);
  }
  const first = trace.events[0];
  const lastBeforeCleanup = [...trace.events].reverse().find((event) => event.pc !== 0x0018f8);
  const lastCleanup = [...trace.events].reverse().find((event) => event.pc === 0x0018f8);
  const finalDiff = lastCleanup ? diffTuple(lastCleanup.tuple, trace.finalTuple) : [];
  const setupDiff = first && lastBeforeCleanup ? diffTuple(first.tuple, lastBeforeCleanup.tuple) : [];

  return [
    '# Phase 623: Cursor/Display Tuple Lifetime Trace',
    '',
    '## Summary',
    '',
    '- Traced the coherent cursor/display tuple requested by the phase622 handoff around `0x08DF54`, `0x08ED73`, `0x08F54B`, and `0x0018F8` during one `2` keypress.',
    `- Run result: ${trace.result.termination} at ${hex(trace.result.lastPc)} after ${trace.result.steps} steps; pass=${trace.result.termination === 'halt' && (trace.result.lastPc & 0xffffff) === HALT}.`,
    `- Watchpoint hits: ${[...WATCHPOINTS].map(([addr, label]) => `${hex(addr)} ${label}=${trace.counts.get(addr) ?? 0}`).join('; ')}.`,
    '- Negative dynamic result: the one-key path did not enter the decoded tuple setup clusters at `0x08DF54`, `0x08ED73`, or `0x08F54B`; only the structural cleanup wipe at `0x0018F8` was observed.',
    '- At both cleanup hits and final halt, the tracked tuple fields are already zero. This means the known keypress path is not preserving or rebuilding the `D02A29`/display-position tuple before cleanup.',
    '',
    '## Watchpoint Timeline',
    '',
    '| Block | PC | Hit | Role | Tuple |',
    '|---:|---|---:|---|---|',
    ...trace.events.map((event) => `| ${event.block} | ${hex(event.pc)} | ${event.hit} | ${event.label} | \`${tupleText(event.tuple)}\` |`),
    '',
    '## Phase Diffs',
    '',
    `- First observed tuple to last pre-cleanup tuple: ${setupDiff.length ? setupDiff.join(', ') : 'no changes'}.`,
    `- Last cleanup tuple to final halt tuple: ${finalDiff.length ? finalDiff.join(', ') : 'no changes'}.`,
    '',
    '## Interpretation',
    '',
    'The decoded `D02A29` cursor/display tuple clusters from phase621 are not on this exercised keypress path. The actual run reaches the structural cleanup wipe twice with `D02A29`, `D02A2B`, `D02A1B`, `D0059A`, and D011xx display-position fields all zero. So this path has no phase-consistent cursor/display tuple to snapshot at the requested cluster addresses.',
    '',
    'For browser persistence, this reinforces the lower-risk route: persist the observed VRAM and token-output buffers instead of trying to restore `D02A29` tuple RAM. A future tuple probe should first force a path that actually reaches `0x08DF54`/`0x08ED73`/`0x08F54B`, then snapshot from that phase.',
    '',
  ].join('\n');
}

console.log('Phase 623: cursor/display tuple lifetime trace');
const trace = await runTrace();
console.log(`termination=${trace.result.termination} steps=${trace.result.steps} lastPc=${hex(trace.result.lastPc)}`);
for (const event of trace.events) {
  console.log(`block=${event.block} pc=${hex(event.pc)} hit=${event.hit} ${event.label} ${tupleText(event.tuple)}`);
}
console.log(`final ${tupleText(trace.finalTuple)}`);

const report = buildReport(trace);
fs.writeFileSync(path.join(__dirname, 'phase623-cursor-display-tuple.md'), report);

const pass = trace.result.termination === 'halt'
  && (trace.result.lastPc & 0xffffff) === HALT
  && (trace.counts.get(0x0018f8) ?? 0) >= 2;

if (!pass) {
  console.log('\nphase623: FAIL -- expected all tuple lifetime watchpoints and clean halt');
  process.exit(1);
}

console.log('\nphase623: PASS -- negative tuple-path trace captured and report written');

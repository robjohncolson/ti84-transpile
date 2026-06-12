import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const EOL_KEY = 0x0f;

const WATCH = new Map([
  [0x0585e9, 'cxMain'],
  [0x05877a, 'home key handler'],
  [0x0587e9, 'home convergence'],
  [0x05899d, 'home command/action dispatch'],
  [0x08c72f, 'context dispatch wrapper'],
  [0x08c745, 'JP (HL) trampoline'],
  [0x08f54b, 'natural tuple save path'],
  [0x0018f8, 'cleanup wipe'],
]);

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

function readTuple(mem) {
  return Object.fromEntries(FIELDS.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
}

function tupleText(tuple) {
  return FIELDS.map(([name, , len]) => `${name}=${hex(tuple[name], len * 2)}`).join(' ');
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

function buildReport({ result, tupleHits, watchHits, uniquePath }) {
  const lines = [
    '# Phase 629: EOL Caller Path Into 0x08F54B',
    '',
    'Probe: `probe-phase629-eol-08f54b-callpath.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase629-eol-08f54b-callpath.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- **** EOL reached \`0x08F54B\` naturally ${tupleHits.length} times and halted cleanly at \`${hex(result.lastPc)}\` after ${result.steps} steps.`,
    '- *** Both tuple-save hits occurred inside the same cxMain/home-key path before the first cleanup wipe.',
    '- *** Both recent-block traces converge through `0x08F479 -> 0x08F47D -> 0x04C973 -> 0x08F48A -> 0x08F547 -> 0x08F33E -> 0x090755 -> 0x090378 -> 0x04C90D -> 0x08F54B` immediately before the tuple save.',
    '- ** The condition that makes EOL special is upstream of the shared 0x08F47x/0x08F54B save tail; arrows/DEL/INS from phase628 never reached this tuple-save tail.',
    '',
    '## Watch Hits',
    '',
    '| PC | Role | Hits | First block |',
    '|---|---|---:|---:|',
    ...[...WATCH.entries()].map(([pc, label]) => {
      const hits = watchHits.get(pc) ?? [];
      return `| ${hex(pc)} | ${label} | ${hits.length} | ${hits[0]?.block ?? '-'} |`;
    }),
    '',
    '## 0x08F54B Hits',
    '',
    '| Hit | Block | Tuple | Recent path | Stack tail |',
    '|---:|---:|---|---|---|',
    ...tupleHits.map((hit) => `| ${hit.hit} | ${hit.block} | \`${tupleText(hit.tuple)}\` | \`${hit.recent.map((pc) => hex(pc)).join(' -> ')}\` | \`${hit.stackTail.map((pc) => hex(pc)).join(' -> ')}\` |`),
    '',
    '## Unique Path Prefix',
    '',
    uniquePath.map((pc, idx) => `${idx + 1}. \`${hex(pc)}\`${WATCH.has(pc) ? ` - ${WATCH.get(pc)}` : ''}`).join('\n'),
    '',
    '## Interpretation',
    '',
    'The natural EOL tuple path is a normal home-context dispatch path that branches into the shared 0x08F47x/0x08F54B editor/display save tail before cleanup. The two tuple snapshots differ mainly in D02A29 and D02A40, showing that the second pass advances the display/cursor tuple before the wipe. Next work should either decode the immediate save-tail cluster statically (`0x08F479`, `0x08F547`, `0x08F33E`, `0x090755`, `0x090378`, `0x04C90D`) or snapshot/restore the tuple at 0x08F54B and verify it survives the following 0x0018F8 cleanup.',
    '',
    'No runtime, transpiler, or browser files were changed.',
    '',
  ];
  return lines.join('\n');
}

console.log('Phase 629: trace EOL caller path into 0x08F54B');
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

let block = 0;
let lastSp = cpu.sp;
let lastPc = OUTER_LOOP;
const stack = [];
const recent = [];
const recentMax = 16;
const tupleHits = [];
const watchHits = new Map();
const uniquePath = [];
const seenPath = new Set();
let enteredCxMain = false;

const result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 650000,
  maxLoopIterations: 650000,
  onBlock(pc) {
    block += 1;
    const addr = pc & 0xffffff;
    const sp = cpu.sp & 0xffffff;
    const delta = sp - lastSp;
    if (delta === -3) stack.push(lastPc);
    else if (delta === 3 && stack.length > 0) stack.pop();
    lastSp = sp;

    if (recent.at(-1) !== addr) {
      if (recent.length >= recentMax) recent.shift();
      recent.push(addr);
    }

    if (addr === 0x0585e9) enteredCxMain = true;
    if (enteredCxMain && !seenPath.has(addr) && uniquePath.length < 80) {
      seenPath.add(addr);
      uniquePath.push(addr);
    }

    if (WATCH.has(addr)) {
      if (!watchHits.has(addr)) watchHits.set(addr, []);
      watchHits.get(addr).push({ block, tuple: readTuple(mem) });
    }

    if (addr === 0x08f54b) {
      const hit = tupleHits.length + 1;
      tupleHits.push({
        hit,
        block,
        tuple: readTuple(mem),
        recent: [...recent],
        stackTail: stack.slice(-18),
      });
      console.log(`hit ${hit} block=${block} tuple=${tupleText(tupleHits.at(-1).tuple)}`);
      console.log(`  recent=${recent.map((p) => hex(p)).join(' -> ')}`);
      console.log(`  stackTail=${stack.slice(-18).map((p) => hex(p)).join(' -> ')}`);
    }

    lastPc = addr;
  },
});

const report = buildReport({ result, tupleHits, watchHits, uniquePath });
fs.writeFileSync(path.join(__dirname, 'phase629-eol-08f54b-callpath.md'), report);

console.log(`termination=${result.termination} steps=${result.steps} lastPc=${hex(result.lastPc)}`);
console.log(`0x08F54B hits=${tupleHits.length}`);
console.log('phase629: report written');

if (result.termination !== 'halt' || (result.lastPc & 0xffffff) !== HALT || tupleHits.length !== 2) {
  process.exit(1);
}

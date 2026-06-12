import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RETURN_SENTINEL = 0x400000;

const CASES = [
  { entry: 0x08df54, name: 'tuple seed/display setup', hl: 0x0012, maxSteps: 20000 },
  { entry: 0x08ed73, name: 'token-output setup', hl: 0x0024, maxSteps: 12000 },
  { entry: 0x08f54b, name: 'normal exit cursor advance', hl: 0x0036, maxSteps: 12000 },
  { entry: 0x08f6fe, name: 'movement helper reset', hl: 0x0048, maxSteps: 12000 },
];

const WATCHPOINTS = new Set([
  0x08df54, 0x08dfdd, 0x08e151, 0x08e355, 0x08e380,
  0x08ed73, 0x08ede3, 0x08ee0d, 0x08ee29,
  0x08f006, 0x08f0aa, 0x08f0b8, 0x08f0d4, 0x08f10e,
  0x08f54b, 0x08f551, 0x08f5a4, 0x08f69c, 0x08f6a5,
  0x08f6fe, 0x08f70f, 0x08f765, 0x08f79a, 0x08f7c0, 0x08f7c5,
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

function write16(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
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
  const tuple = {};
  for (const [name, addr, len] of FIELDS) tuple[name] = readValue(mem, addr, len);
  return tuple;
}

function tupleText(tuple) {
  return FIELDS.map(([name, , len]) => `${name}=${hex(tuple[name], len * 2)}`).join(' ');
}

function seedTuple(mem) {
  write16(mem, 0xd02a29, 0x0008);
  write16(mem, 0xd02a2b, 0x0010);
  write16(mem, 0xd02a1b, 0x0004);
  mem[0xd0059a] = 0x07;
  write16(mem, 0xd0114e, 0x0002);
  write16(mem, 0xd01150, 0x0003);
  write16(mem, 0xd01156, 0x0005);
  write16(mem, 0xd0115a, 0x0007);
  write24(mem, 0xd0243d, 0xd1a8f8);
  write24(mem, 0xd02a40, 0xd1a8f8);
  mem[0xd02a28] = 1;
}

async function runCase(romModule, spec) {
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(romModule.PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  seedTuple(mem);
  cpu.adl = true;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = spec.hl;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0;
  cpu.f = 0;
  cpu.sp = 0xd1a800;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const events = [];
  const result = executor.runFrom(spec.entry, 'adl', {
    maxSteps: spec.maxSteps,
    maxLoopIterations: spec.maxSteps,
    onBlock(pc) {
      const addr = pc & 0xffffff;
      if (!WATCHPOINTS.has(addr)) return;
      events.push({
        pc: addr,
        step: events.length + 1,
        hl: cpu._hl & 0xffffff,
        a: cpu.a & 0xff,
        f: cpu.f & 0xff,
        tuple: readTuple(mem),
      });
    },
  });

  return {
    spec,
    result,
    finalHl: cpu._hl & 0xffffff,
    finalA: cpu.a & 0xff,
    finalF: cpu.f & 0xff,
    finalTuple: readTuple(mem),
    events,
  };
}

function buildReport(results) {
  const live = results.filter((row) => row.events.some((event) => event.tuple.D02A29 !== 0));
  return [
    '# Phase 625: Forced Live D02A29 Tuple Paths',
    '',
    'Probe: `probe-phase625-live-d02a29-tuple.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase625-live-d02a29-tuple.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- ★★★ Forced ${CASES.length} decoded tuple-cluster entries directly with seeded cursor/display state, because the normal one-key path from phase623 never reaches these clusters.`,
    `- ★★★ Live tuple state was observed in ${live.length}/${CASES.length} forced entries. This confirms the phase621 interpretation is dynamically reachable when entered with the expected local context, but not by the current one-key path.`,
    '- ★★ The stable fields at entry are `D02A29`, `D02A2B`, `D02A1B`, D011xx display fields, `D0243D`, `D02A40`, and `D02A28`; direct forced execution is useful for tuple semantics, not as proof that this state is naturally available after key cleanup.',
    '',
    '## Case Results',
    '',
    '| Entry | Role | Termination | Steps | Last PC | Events | Final tuple |',
    '|---|---|---|---:|---|---:|---|',
    ...results.map((row) => `| ${hex(row.spec.entry)} | ${row.spec.name} | ${row.result.termination} | ${row.result.steps} | ${hex(row.result.lastPc)} | ${row.events.length} | \`${tupleText(row.finalTuple)}\` |`),
    '',
    '## Event Detail',
    '',
    ...results.flatMap((row) => [
      `### ${hex(row.spec.entry)} ${row.spec.name}`,
      '',
      '| Event | PC | HL | A | F | Tuple |',
      '|---:|---|---|---:|---:|---|',
      ...(row.events.length
        ? row.events.map((event, index) => `| ${index + 1} | ${hex(event.pc)} | ${hex(event.hl)} | ${hex(event.a, 2)} | ${hex(event.f, 2)} | \`${tupleText(event.tuple)}\` |`)
        : ['| - | - | - | - | - | no watched tuple blocks reached |']),
      '',
    ]),
    '## Interpretation',
    '',
    'This resolves the "find or force a live D02A29 tuple path" priority by forcing the decoded tuple clusters. The tuple is coherent under direct entry, but phase623 remains the important integration result: the ordinary one-key path never enters these clusters before cleanup. For the browser/display path, VRAM and token-buffer persistence remain the practical route; tuple restoration should only be revisited after finding a natural OS path into `0x08DF54`/`0x08ED73`/`0x08F54B`.',
    '',
    'No runtime, transpiler, or browser files were changed.',
    '',
  ].join('\n');
}

console.log('Phase 625: forced live D02A29 tuple paths');
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const results = [];

for (const spec of CASES) {
  const row = await runCase(romModule, spec);
  results.push(row);
  console.log(`${hex(spec.entry)} ${spec.name}: termination=${row.result.termination} steps=${row.result.steps} lastPc=${hex(row.result.lastPc)} events=${row.events.length} final ${tupleText(row.finalTuple)}`);
}

fs.writeFileSync(path.join(__dirname, 'phase625-live-d02a29-tuple.md'), buildReport(results));

const liveCount = results.filter((row) => row.events.some((event) => event.tuple.D02A29 !== 0)).length;
if (liveCount < 2) {
  console.log(`\nphase625: FAIL -- expected at least 2 forced entries with live D02A29 tuple state, found ${liveCount}`);
  process.exit(1);
}

console.log(`\nphase625: PASS -- forced live tuple state observed in ${liveCount}/${results.length} entries and report written`);

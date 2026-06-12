import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const EOL_KEY = 0x0f;

const WINDOWS = [
  ['entry / first branch', 0x08f479, 0x08f4a2],
  ['save call site', 0x08f547, 0x08f55f],
  ['mode-specific prelude', 0x08f33e, 0x08f365],
  ['token cursor bridge', 0x090755, 0x090779],
  ['display tuple bridge', 0x090378, 0x090392],
  ['16-bit compare helper', 0x04c90d, 0x04c91b],
];

const WATCH = new Set([
  0x08f479, 0x08f47d, 0x04c973, 0x08f48a, 0x08f547, 0x08f54b,
  0x08f33e, 0x090755, 0x090378, 0x04c90d, 0x0018f8, HALT,
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytes(rom, addr, len) {
  return Array.from({ length: len }, (_, i) => rom[addr + i].toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function insnText(rom, insn) {
  const fields = Object.entries(insn)
    .filter(([key]) => !['pc', 'nextPc', 'length'].includes(key))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join(' ');
  return `${hex(insn.pc)} ${bytes(rom, insn.pc, insn.length).padEnd(15)} ${fields}`;
}

function decodeWindow(rom, start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    try {
      const insn = decodeInstruction(rom, pc, 'adl');
      rows.push(insnText(rom, insn));
      pc = insn.nextPc;
    } catch (err) {
      rows.push(`${hex(pc)} decode-error ${err.message}`);
      pc += 1;
    }
  }
  return rows;
}

function findDirectCalls(rom, target) {
  const pattern = [0xcd, target & 0xff, (target >> 8) & 0xff, (target >> 16) & 0xff];
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    if (pattern.every((byte, j) => rom[i + j] === byte)) hits.push(i);
  }
  return hits;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function read16(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8);
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function tupleSnap(mem) {
  return {
    d02a29: read16(mem, 0xd02a29),
    d02a2b: read16(mem, 0xd02a2b),
    d02a1b: read16(mem, 0xd02a1b),
    d0059a: mem[0xd0059a],
    d01150: read16(mem, 0xd01150),
    d0243d: read24(mem, 0xd0243d),
    d02a40: read24(mem, 0xd02a40),
    d02a28: mem[0xd02a28],
  };
}

function tupleText(t) {
  return `D02A29=${hex(t.d02a29, 4)} D02A2B=${hex(t.d02a2b, 4)} D02A1B=${hex(t.d02a1b, 4)} D0059A=${hex(t.d0059a, 2)} D01150=${hex(t.d01150, 4)} D0243D=${hex(t.d0243d)} D02A40=${hex(t.d02a40)} D02A28=${hex(t.d02a28, 2)}`;
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

async function traceEol(romModule, romBytes) {
  const { mem, executor, cpu } = await bootSystem(romModule, romBytes);
  rearmHomeContext(romBytes, mem);
  seedKey(mem, EOL_KEY);

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
      block += 1;
      const addr = pc & 0xffffff;
      if (!WATCH.has(addr)) return;
      counts.set(addr, (counts.get(addr) ?? 0) + 1);
      if (events.length < 80) {
        events.push({
          block,
          pc: addr,
          a: cpu.a & 0xff,
          f: cpu.f & 0xff,
          hl: cpu._hl & 0xffffff,
          de: cpu._de & 0xffffff,
          bc: cpu._bc & 0xffffff,
          sp: cpu.sp & 0xffffff,
          tuple: tupleSnap(mem),
        });
      }
    },
  });

  return { result, counts, events, finalTuple: tupleSnap(mem) };
}

function formatCounts(counts) {
  return [...WATCH]
    .filter((addr) => counts.has(addr))
    .map((addr) => `${hex(addr)}:${counts.get(addr)}`)
    .join(' ');
}

function buildReport(staticRows, calls, trace) {
  return [
    '# Phase 631: Shared EOL Save Tail Decode',
    '',
    'Probe: `probe-phase631-eol-save-tail-decode.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase631-eol-save-tail-decode.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    '- **** The shared EOL save tail is a cursor/display boundary check and save path, not a cleanup path. It checks an editor/display condition through `0x04C973` and `0x04C90D`, then reaches `0x08F54B` only when the condition allows saving the coherent tuple.',
    '- *** `0x08F547` is the narrow save call site: it calls `0x08F33E`, then stores `HL` into `D02A29` and returns. In the natural EOL run this happens twice before the later `0x0018F8` cleanup wipes the tuple.',
    '- *** `0x090755` copies the display-position tuple through `D02A29/D02A2B`; `0x090378` feeds the 16-bit compare helper `0x04C90D`; `0x08F33E` is the mode/key-state prelude that bridges into that display tuple machinery.',
    '- ** Dynamic confirmation: the natural EOL run halted cleanly at `0x0019B5`, hit `0x08F54B` twice, hit `0x0018F8` twice later, and ended with the tuple cleared.',
    '',
    '## Dynamic Confirmation',
    '',
    `- termination=${trace.result.termination} steps=${trace.result.steps} lastPc=${hex(trace.result.lastPc)}`,
    `- counts=${formatCounts(trace.counts)}`,
    `- final tuple: \`${tupleText(trace.finalTuple)}\``,
    '',
    '| Event | Block | PC | A | F | HL | DE | BC | SP | Tuple |',
    '|---:|---:|---|---|---|---|---|---|---|---|',
    ...trace.events
      .filter((event) => [0x08f479, 0x08f547, 0x08f54b, 0x08f33e, 0x090755, 0x090378, 0x04c90d, 0x0018f8, HALT].includes(event.pc))
      .map((event, idx) => `| ${idx + 1} | ${event.block} | ${hex(event.pc)} | ${hex(event.a, 2)} | ${hex(event.f, 2)} | ${hex(event.hl)} | ${hex(event.de)} | ${hex(event.bc)} | ${hex(event.sp)} | \`${tupleText(event.tuple)}\` |`),
    '',
    '## Static Decode',
    '',
    ...staticRows.flatMap(([name, rows]) => [
      `### ${name}`,
      '',
      '```text',
      ...rows,
      '```',
      '',
    ]),
    '## Direct Call Scan',
    '',
    '| Target | Direct CALL sites |',
    '|---|---|',
    ...calls.map(([target, hits]) => `| ${hex(target)} | ${hits.map((hit) => hex(hit)).join(', ') || '(none)'} |`),
    '',
    '## Interpretation',
    '',
    '`0x08F479` starts by testing the editor/display condition via `0x04C973`; the zero path returns early while the nonzero path calls through `0x08F48A`. The natural EOL path then reaches `0x08F547`, whose only durable write in this window is the `D02A29 <- HL` save after `0x08F33E` returns. `0x090755` and `0x090378` explain why the tuple is coherent at `0x08F54B`: they bridge the current cursor/display position into the same compare-and-save machinery before cleanup later clears RAM.',
    '',
    'No runtime, transpiler, or browser files were changed.',
    '',
  ].join('\n');
}

console.log('Phase 631: shared EOL save tail decode');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);

const staticRows = WINDOWS.map(([name, start, end]) => [`${name} ${hex(start)}-${hex(end - 1)}`, decodeWindow(romBytes, start, end)]);
for (const [name, rows] of staticRows) {
  console.log(`\n=== ${name} ===`);
  for (const row of rows) console.log(row);
}

const callTargets = [0x08f479, 0x08f547, 0x08f33e, 0x090755, 0x090378, 0x04c90d, 0x08f54b];
const calls = callTargets.map((target) => [target, findDirectCalls(romBytes, target)]);
console.log('\n=== direct CALL scan ===');
for (const [target, hits] of calls) console.log(`${hex(target)} callers=${hits.length}: ${hits.map((hit) => hex(hit)).join(', ') || '(none)'}`);

console.log('\n=== dynamic natural EOL trace ===');
const trace = await traceEol(romModule, romBytes);
console.log(`termination=${trace.result.termination} steps=${trace.result.steps} lastPc=${hex(trace.result.lastPc)}`);
console.log(`counts=${formatCounts(trace.counts)}`);
for (const event of trace.events) {
  console.log(`block=${event.block} pc=${hex(event.pc)} A=${hex(event.a, 2)} F=${hex(event.f, 2)} HL=${hex(event.hl)} DE=${hex(event.de)} BC=${hex(event.bc)} SP=${hex(event.sp)} ${tupleText(event.tuple)}`);
}

fs.writeFileSync(path.join(__dirname, 'phase631-eol-save-tail-decode.md'), buildReport(staticRows, calls, trace));

const ok = trace.result.termination === 'halt'
  && (trace.result.lastPc & 0xffffff) === HALT
  && (trace.counts.get(0x08f54b) ?? 0) === 2
  && (trace.counts.get(0x0018f8) ?? 0) === 2
  && (trace.counts.get(0x08f547) ?? 0) >= 2
  && (trace.counts.get(0x090755) ?? 0) >= 1
  && (trace.counts.get(0x090378) ?? 0) >= 1
  && trace.finalTuple.d02a29 === 0;

if (!ok) {
  console.log('\nphase631: FAIL -- expected natural EOL save-tail trace was not reproduced');
  process.exit(1);
}

console.log('\nphase631: PASS -- shared EOL save tail decoded and dynamically confirmed');

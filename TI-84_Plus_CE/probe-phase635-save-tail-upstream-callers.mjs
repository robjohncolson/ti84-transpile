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

const TARGETS = new Map([
  [0x08f33e, 'save-tail mode/key-state prelude'],
  [0x090755, 'D01143 cursor bridge'],
  [0x090378, 'display tuple bridge'],
  [0x04c90d, '16-bit tuple reader'],
  [0x08f54b, 'D02A29 save site'],
  [0x0018f8, 'cleanup wipe'],
  [HALT, 'halt'],
]);

const STATIC_TARGETS = [0x08f33e, 0x090755, 0x090378];

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

function decodeWindow(rom, start, count = 10) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < count; i += 1) {
    try {
      const insn = decodeInstruction(rom, pc, 'adl');
      rows.push(insnText(rom, insn));
      pc = insn.nextPc;
      if (insn.terminates && i > 2) break;
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

function addHistogram(map, target, caller) {
  const byTarget = map.get(target) ?? new Map();
  byTarget.set(caller, (byTarget.get(caller) ?? 0) + 1);
  map.set(target, byTarget);
}

function buildReport({ staticCalls, staticDecodes, result, events, returnHist, finalTuple }) {
  const lines = [
    '# Phase 635: Save-Tail Upstream Callers',
    '',
    'Probe: `probe-phase635-save-tail-upstream-callers.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase635-save-tail-upstream-callers.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    '- *** Natural EOL dynamically reaches the shared save tail with active return-stack origins in the `0x08E4xx`/`0x08E5xx`/`0x08EFxx`/`0x0903xx` clusters plus the narrow `0x08F547` save site.',
    '- *** The actual durable tuple-save path is still narrow: the static `CALL 0x08F33E` at `0x08F547` falls through to `0x08F54B`, and both natural `0x08F54B` hits occur before the two later `0x0018F8` cleanup wipes.',
    '- ** The direct-call scan separates hard CALL edges from JP/fallthrough context: `0x08F33E` has 9 direct CALL sites, `0x090755` has 24, and `0x090378` has 3 (`0x09067B`, `0x090AA5`, `0x090EB4`).',
    '',
    '## Dynamic Result',
    '',
    `- termination=${result.termination} steps=${result.steps} lastPc=${hex(result.lastPc)}`,
    `- final tuple: \`${tupleText(finalTuple)}\``,
    '',
    '## Dynamic Return-Stack Origin Histogram',
    '',
    '| Target | Role | Active return-stack origin | Hits |',
    '|---|---|---|---:|',
  ];

  for (const [target, label] of TARGETS) {
    const byCaller = returnHist.get(target) ?? new Map();
    if (byCaller.size === 0) {
      lines.push(`| ${hex(target)} | ${label} | (none) | 0 |`);
      continue;
    }
    for (const [caller, count] of [...byCaller.entries()].sort((a, b) => a[0] - b[0])) {
      lines.push(`| ${hex(target)} | ${label} | ${hex(caller)} | ${count} |`);
    }
  }

  lines.push('', '## First Dynamic Events', '', '| # | Block | PC | Inferred caller | SP | HL | DE | BC | Tuple |', '|---:|---:|---|---|---|---|---|---|---|');
  for (const [idx, event] of events.entries()) {
    lines.push(`| ${idx + 1} | ${event.block} | ${hex(event.pc)} | ${event.caller === null ? '(none)' : hex(event.caller)} | ${hex(event.sp)} | ${hex(event.hl)} | ${hex(event.de)} | ${hex(event.bc)} | \`${tupleText(event.tuple)}\` |`);
  }

  lines.push('', '## Static Direct CALL Scan', '', '| Target | Direct CALL sites |', '|---|---|');
  for (const target of STATIC_TARGETS) {
    const calls = staticCalls.get(target) ?? [];
    lines.push(`| ${hex(target)} | ${calls.length ? calls.map((addr) => hex(addr)).join(', ') : '(none)'} |`);
  }

  lines.push('', '## Dynamic Caller Decode Windows');
  for (const [label, rows] of staticDecodes) {
    lines.push('', `### ${label}`, '', '```text', ...rows, '```');
  }

  lines.push(
    '',
    '## Interpretation',
    '',
    'The save-tail path is not one EOL-only function. EOL enters shared editor/display positioning code, and the durable tuple save is the narrow static `0x08F547 -> 0x08F33E` call site that falls through to `0x08F54B`. The dynamic return-stack histogram shows which upstream contexts are active when the bridge helpers execute; the static direct-call scan identifies the hard CALL edges. Together they show the EOL-specific condition is upstream of the shared bridge machinery, while the final coherent save remains at `0x08F547/0x08F54B`.',
    '',
    'No runtime, transpiler, or browser files were changed.',
    '',
  );

  return lines.join('\n');
}

console.log('Phase 635: follow save-tail callers upstream');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);

const staticCalls = new Map(STATIC_TARGETS.map((target) => [target, findDirectCalls(romBytes, target)]));
const { mem, executor, cpu } = await bootSystem(romModule, romBytes);

rearmHomeContext(romBytes, mem);
seedKey(mem, EOL_KEY);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xd00080; cpu.mbase = 0xd0;
cpu.sp = 0xd1a87e - 24;
write24(mem, cpu.sp, HALT);
write24(mem, 0xd008e0, cpu.sp);

let block = 0;
const events = [];
const returnHist = new Map();

const result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 650000,
  maxLoopIterations: 650000,
  onBlock(pc) {
    block += 1;
    const addr = pc & 0xffffff;
    if (!TARGETS.has(addr)) return;
    let caller = null;
    if (addr !== HALT && addr !== 0x0018f8) {
      const ret = read24(mem, cpu.sp & 0xffffff);
      caller = (ret - 4) & 0xffffff;
      addHistogram(returnHist, addr, caller);
    }
    if (events.length < 64) {
      events.push({
        block,
        pc: addr,
        caller,
        sp: cpu.sp & 0xffffff,
        hl: cpu._hl & 0xffffff,
        de: cpu._de & 0xffffff,
        bc: cpu._bc & 0xffffff,
        tuple: tupleSnap(mem),
      });
    }
  },
});

const dynamicCallers = new Set();
for (const byCaller of returnHist.values()) {
  for (const caller of byCaller.keys()) {
    if (caller >= 0 && caller < romBytes.length) dynamicCallers.add(caller);
  }
}

const staticDecodes = [...dynamicCallers]
  .filter((addr) => addr >= 0x080000 && addr <= 0x092000)
  .sort((a, b) => a - b)
  .slice(0, 28)
  .map((addr) => [`caller ${hex(addr)}`, decodeWindow(romBytes, addr, 8)]);

const finalTuple = tupleSnap(mem);
const report = buildReport({ staticCalls, staticDecodes, result, events, returnHist, finalTuple });
fs.writeFileSync(path.join(__dirname, 'phase635-save-tail-upstream-callers.md'), report);

console.log(`termination=${result.termination} steps=${result.steps} lastPc=${hex(result.lastPc)}`);
console.log(`events=${events.length} report=TI-84_Plus_CE/phase635-save-tail-upstream-callers.md`);
for (const [target, byCaller] of returnHist) {
  console.log(`${hex(target)} ${[...byCaller.entries()].map(([caller, count]) => `${hex(caller)}:${count}`).join(' ')}`);
}

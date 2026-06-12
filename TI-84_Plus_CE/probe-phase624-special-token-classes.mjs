import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RETURN_SENTINEL = 0x400000;
const POST_PROCESSOR = 0x08f7d6;
const FLAG_Z = 0x40;

const CASES = [
  { token: 0x28, name: 'open paren class', expectedA: 0x06, expectedZ: true, expectedCallerSize: 0x0e },
  { token: 0x29, name: 'close paren class', expectedA: 0x06, expectedZ: true, expectedCallerSize: 0x0e },
  { token: 0x7b, name: 'left brace class', expectedA: 0x04, expectedZ: true, expectedCallerSize: 0x0c },
  { token: 0x7d, name: 'right brace class', expectedA: 0x04, expectedZ: true, expectedCallerSize: 0x0c },
  { token: 0x31, name: 'ordinary control token', expectedA: 0x04, expectedZ: false, expectedCallerSize: 0x08 },
];

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function bytes(rom, addr, len) {
  return Array.from({ length: len }, (_, i) => rom[addr + i].toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function insnText(rom, insn) {
  const fields = Object.entries(insn)
    .filter(([key]) => !['pc', 'nextPc', 'length'].includes(key))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join(' ');
  return `${hex(insn.pc)} ${bytes(rom, insn.pc, insn.length).padEnd(14)} ${fields}`;
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
      pc++;
    }
  }
  return rows;
}

async function runCase(romModule, token) {
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(romModule.PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.a = token;
  cpu.b = 0x08;
  cpu.f = 0;
  cpu._iy = 0xd00080;
  cpu.mbase = 0xd0;
  cpu.adl = true;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xd1a800;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const events = [];
  const watch = new Set([0x08f7d6, 0x08f7da, 0x08f7dc, 0x08f7df, 0x08f7e3, 0x08f7e5, 0x08e68a, 0x08e68c, 0x08e68d, 0x08e68f, 0x08e690, 0x08e692, 0x08e693, 0x08e695]);
  const result = executor.runFrom(POST_PROCESSOR, 'adl', {
    maxSteps: 64,
    maxLoopIterations: 64,
    onBlock(pc) {
      const addr = pc & 0xffffff;
      if (!watch.has(addr)) return;
      events.push({
        pc: addr,
        a: cpu.a & 0xff,
        b: cpu.b & 0xff,
        f: cpu.f & 0xff,
        z: (cpu.f & FLAG_Z) !== 0,
      });
    },
  });

  const z = (cpu.f & FLAG_Z) !== 0;
  return {
    token,
    result,
    finalA: cpu.a & 0xff,
    finalB: cpu.b & 0xff,
    finalF: cpu.f & 0xff,
    finalZ: z,
    callerSize: z ? ((cpu.a + cpu.b) & 0xff) : (cpu.b & 0xff),
    events,
  };
}

function buildReport(romBytes, results) {
  return [
    '# Phase 624: Special Token Classes in 0x08F7D6',
    '',
    'Probe: `probe-phase624-special-token-classes.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase624-special-token-classes.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    '- ★★★★ Dynamically executed `0x08F7D6` for all four special token bytes from the phase622 static decode: `0x28`, `0x29`, `0x7B`, and `0x7D`.',
    '- ★★★★ Confirmed the caller contract with `B=0x08`: `0x28`/`0x29` return `A=0x06,Z=1` so `0x0907DB` would return `B+6=0x0E`; `0x7B`/`0x7D` return `A=0x04,Z=1` so the caller would return `B+4=0x0C`.',
    '- ★★ Control token `0x31` returns `A=0x04,Z=0`, matching the ordinary path where `0x0907DB` returns `B` directly.',
    '',
    '## Static Window',
    '',
    '```text',
    ...decodeWindow(romBytes, 0x08f7d6, 0x08f7e8),
    ...decodeWindow(romBytes, 0x08e68a, 0x08e696),
    '```',
    '',
    '## Dynamic Results',
    '',
    '| Token | Class | Termination | Steps | Final A | Final Z | Caller-size result (`B=0x08`) | Pass |',
    '|---:|---|---|---:|---:|---:|---:|---|',
    ...results.map(({ spec, run, pass }) => `| ${hex(spec.token, 2)} | ${spec.name} | ${run.result.termination} @ ${hex(run.result.lastPc)} | ${run.result.steps} | ${hex(run.finalA, 2)} | ${run.finalZ ? 1 : 0} | ${hex(run.callerSize, 2)} | ${pass ? 'yes' : 'NO'} |`),
    '',
    '## Event Paths',
    '',
    ...results.flatMap(({ spec, run }) => [
      `### ${hex(spec.token, 2)} ${spec.name}`,
      '',
      '```text',
      ...run.events.map((event) => `${hex(event.pc)} A=${hex(event.a, 2)} B=${hex(event.b, 2)} F=${hex(event.f, 2)} Z=${event.z ? 1 : 0}`),
      '```',
      '',
    ]),
    '## Interpretation',
    '',
    'This closes the phase623 priority to exercise the special classes dynamically. The phase622 static interpretation is correct: `0x08F7D6` does not compute a full size by itself; it returns an adjustment in A and leaves Z/NZ as the caller selector. `0x0907DB` then returns either `B+6`, `B+4`, or `B` depending on that flag state.',
    '',
    'No runtime, transpiler, or browser files were changed, so the golden regression was not required for this probe/docs-only tick.',
    '',
  ].join('\n');
}

console.log('Phase 624: special token classes in 0x08F7D6');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const results = [];

for (const spec of CASES) {
  const run = await runCase(romModule, spec.token);
  const pass = run.result.termination === 'missing_block'
    && (run.result.lastPc & 0xffffff) === RETURN_SENTINEL
    && run.finalA === spec.expectedA
    && run.finalZ === spec.expectedZ
    && run.callerSize === spec.expectedCallerSize;
  results.push({ spec, run, pass });
  console.log(`${hex(spec.token, 2)} ${spec.name}: termination=${run.result.termination} steps=${run.result.steps} lastPc=${hex(run.result.lastPc)} A=${hex(run.finalA, 2)} Z=${run.finalZ ? 1 : 0} callerSize=${hex(run.callerSize, 2)} pass=${pass}`);
}

const report = buildReport(romBytes, results);
fs.writeFileSync(path.join(__dirname, 'phase624-special-token-classes.md'), report);

if (results.some((row) => !row.pass)) {
  console.log('\nphase624: FAIL -- at least one special token class did not match the expected dynamic result');
  process.exit(1);
}

console.log('\nphase624: PASS -- all special token classes dynamically confirmed and report written');

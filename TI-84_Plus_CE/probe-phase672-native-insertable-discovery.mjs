import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase672-native-insertable-discovery.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_TOP = 0xD1A87E;
const HALT = 0x0019B5;
const WARM_IDLE = 0x0019BE;
const OUTER_LOOP = 0x08C331;
const HOME_REPAINT = 0x058241;
const WIPE = 0x0018F8;
const EDIT_BASE = 0xD1A8CC;
const STOP = Symbol('phase672-discovery-stop');

const KEYS = Object.freeze([
  { name: '2', pcCode: 'Digit2', osScan: 0x1A, internal: 0x90, translated: 0x90, expected: 0x32 },
  { name: '3', pcCode: 'Digit3', osScan: 0x22, internal: 0x91, translated: 0x91, expected: 0x33 },
  { name: '+', pcCode: 'Equal', osScan: 0x2A, internal: 0x70, translated: 0x80, expected: 0x9E },
  { name: '-', pcCode: 'Minus', osScan: 0x0B, internal: 0x81, translated: 0x81, expected: 0x71 },
  { name: '*', pcCode: 'NumpadMultiply', osScan: 0x0C, internal: 0x82, translated: 0x82, expected: 0x82 },
  { name: '/', pcCode: 'Slash', osScan: 0x0D, internal: 0x83, translated: 0x83, expected: 0x83 },
  { name: '.', pcCode: 'Period', osScan: 0x19, internal: 0x8D, translated: 0x8D, expected: 0x3A },
  { name: '(', pcCode: 'BracketLeft', osScan: 0x1D, internal: 0x85, translated: 0x85, expected: 0x10 },
  { name: ')', pcCode: 'BracketRight', osScan: 0x15, internal: 0x86, translated: 0x86, expected: 0x11 },
]);

function hex(value, width = 6) {
  if (value == null) return '-';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[addr + i] << (i * 8);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[addr + i] = (value >>> (i * 8)) & 0xFF;
}

function read24(mem, addr) {
  return readValue(mem, addr, 3);
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function makeMachine() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function bootSystem() {
  const { mem, peripherals, executor, cpu } = makeMachine();
  const phases = [];

  phases.push(['coldboot', executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['kernel', executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 })]);

  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['postinit', executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12; fillSentinel(mem, cpu.sp, 12);
  phases.push(['warm-idle', executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 })]);

  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_TOP - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, WARM_IDLE);
  write24(mem, 0xD008E0, launchSp);
  phases.push(['launch-home', executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })]);

  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT);
  phases.push(['repaint', executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })]);

  return { mem, executor, cpu, phases };
}

function rearmHomeContext(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function refreshEditContextForCursor(mem, cursor) {
  const tokenCursor = 0xD2A83E;
  write24(mem, 0xD02317, tokenCursor);
  write24(mem, 0xD0231A, tokenCursor);
  write24(mem, 0xD0231D, tokenCursor - 1);

  mem.fill(0, 0xD02430, 0xD02460);
  write24(mem, 0xD02437, cursor);
  write24(mem, 0xD0243A, cursor);
  write24(mem, 0xD0243D, tokenCursor);
  write24(mem, 0xD02440, tokenCursor);
  write24(mem, 0xD0244D, 0xD3FE89);
  mem[0xD02455] = 0x07;
  mem[0xD0245D] = 0x01;
  mem[0xD000A3] = 0x0A;
  write24(mem, 0xD02A40, tokenCursor);
  mem[0xD02A29] = 0;
  mem[0xD02A2A] = 0;
}

function seedRealEditContext(mem) {
  refreshEditContextForCursor(mem, EDIT_BASE);
  mem[0xD1A8C0] = 0x0C;
  mem[0xD1A8C1] = 0x00;
  mem[0xD1A8C2] = 0x07;
  mem.fill(0, EDIT_BASE, EDIT_BASE + 0x80);
}

function seedKey(mem, key) {
  mem[0xD0058C] = key.internal;
  mem[0xD0058D] = key.internal;
  mem[0xD0058E] = key.internal;
  mem[0xD00587] = key.osScan;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}

function prepareKeyRun(mem, cpu, key) {
  rearmHomeContext(mem);
  seedKey(mem, key);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xD008E0, cpu.sp);
}

function bufferBytes(mem, count = 12) {
  return Array.from(mem.slice(EDIT_BASE, EDIT_BASE + count));
}

function runOneKey(machine, key) {
  const { mem, executor, cpu } = machine;
  const cursorBefore = read24(mem, 0xD0243A);
  const expectedCursor = (cursorBefore + 1) & 0xFFFFFF;
  prepareKeyRun(mem, cpu, key);

  let block = 0;
  let stopSteps = null;
  let insertBlock = null;
  let insertedByte = null;
  let lastPc = OUTER_LOOP;
  let termination = 'unknown';
  let wipes = 0;

  try {
    const result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: 120000,
      maxLoopIterations: 120000,
      onBlock(pc, mode, meta, steps) {
        block += 1;
        lastPc = pc & 0xFFFFFF;
        if (lastPc === WIPE) wipes += 1;
        const byte = mem[cursorBefore];
        const cursorNow = read24(mem, 0xD0243A);
        if (insertBlock === null && byte !== 0 && cursorNow === expectedCursor) {
          insertBlock = block;
          insertedByte = byte;
        }
        if (insertBlock !== null && block - insertBlock >= 1000) {
          stopSteps = steps;
          throw STOP;
        }
      },
    });
    termination = result.termination;
    stopSteps = result.steps;
    lastPc = result.lastPc & 0xFFFFFF;
  } catch (error) {
    if (error !== STOP) throw error;
    termination = 'insert_stop';
  }

  return {
    ...key,
    cursorBefore,
    insertedByte,
    insertBlock,
    termination,
    steps: stopSteps,
    blocks: block,
    lastPc,
    wipes,
    D0243A: read24(mem, 0xD0243A),
    D007CA: read24(mem, 0xD007CA),
    buffer: bufferBytes(mem),
    pass: insertBlock !== null && insertedByte === key.expected && wipes === 0 && read24(mem, 0xD007CA) === 0x0585E9,
  };
}

function buildReport(summary) {
  const lines = [
    '# Phase 672: Native Insertable Key Discovery',
    '',
    'Probe: `probe-phase672-native-insertable-discovery.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase672-native-insertable-discovery.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${summary.pass ? '**PASS**' : '**FAIL**'}`,
    `- Keys inserted without wipe: ${summary.keys.filter((row) => row.insertBlock !== null && row.wipes === 0).length}/${summary.keys.length}`,
    `- Confirmed expected bytes matched: ${summary.keys.filter((row) => row.pass).length}/${summary.keys.length}`,
    '',
    '## Key Bytes',
    '',
    '| key | PC code | OS scan | internal seed | ROM table byte | expected insert | inserted byte | insert block | steps | wipes | D0243A | buffer | status |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|',
    ...summary.keys.map((row) => `| ${row.name} | ${row.pcCode} | ${hex(row.osScan, 2)} | ${hex(row.internal, 2)} | ${hex(row.translated, 2)} | ${hex(row.expected, 2)} | ${hex(row.insertedByte, 2)} | ${row.insertBlock ?? '-'} | ${row.steps ?? '-'} | ${row.wipes} | ${hex(row.D0243A)} | ${row.buffer.map((byte) => hex(byte, 2)).join(' ')} | ${row.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

let summary;
try {
  const machine = bootSystem();
  rearmHomeContext(machine.mem);
  seedRealEditContext(machine.mem);
  const keys = KEYS.map((key) => runOneKey(machine, key));
  summary = {
    probe: 'phase672-native-insertable-discovery',
    pass: keys.every((row) => row.pass),
    phases: machine.phases.map(([name, result]) => ({
      name,
      termination: result.termination,
      steps: result.steps,
      lastPc: result.lastPc & 0xFFFFFF,
    })),
    keys,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    keys: keys.map((row) => ({
      key: row.name,
      osScan: hex(row.osScan, 2),
      internal: hex(row.internal, 2),
      translated: hex(row.translated, 2),
      expected: hex(row.expected, 2),
      inserted: hex(row.insertedByte, 2),
      wipes: row.wipes,
      pass: row.pass,
    })),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase672-native-insertable-discovery', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, buildReport(summary));
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase687-d000c2-gate-broad.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_TOP = 0xD1A87E;
const OUTER_LOOP = 0x08C331;
const WARM_IDLE = 0x0019BE;
const HALT = 0x0019B5;
const LAUNCH_HOME_INIT = 0x09DD62;
const HOME_REPAINT = 0x058241;
const EDIT_BASE = 0xD1A8CC;
const TOKEN_CURSOR = 0xD2A83E;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTES = VRAM_WIDTH * VRAM_HEIGHT * 2;
const STOP = Symbol('phase687-stop');

const WATCH = Object.freeze({
  getcsc: 0x03FA09,
  cxMain: 0x0585E9,
  preOwnerFlagGate: 0x0158DE,
  preOwnerCall: 0x0158E8,
  gateReturn: 0x0013DA,
  cleanupOwner: 0x0158BC,
  cleanupEntry: 0x001879,
  wipe: 0x0018F8,
});

const KEYS = Object.freeze([
  { name: '2', pcCode: 'Digit2', group: 3, bit: 1, osScan: 0x1A, internal: 0x90, expected: 0x32 },
  { name: '3', pcCode: 'Digit3', group: 2, bit: 1, osScan: 0x22, internal: 0x91, expected: 0x33 },
  { name: '+', pcCode: 'Equal', group: 1, bit: 1, osScan: 0x2A, internal: 0x70, expected: 0x9E },
  { name: '-', pcCode: 'Minus', group: 1, bit: 2, osScan: 0x0B, internal: 0x81, expected: 0x71 },
  { name: '*', pcCode: 'NumpadMultiply', group: 1, bit: 3, osScan: 0x0C, internal: 0x82, expected: 0x82 },
  { name: '/', pcCode: 'Slash', group: 1, bit: 4, osScan: 0x0D, internal: 0x83, expected: 0x83 },
  { name: '.', pcCode: 'Period', group: 3, bit: 0, osScan: 0x19, internal: 0x8D, expected: 0x3A },
  { name: '(', pcCode: 'BracketLeft', group: 3, bit: 4, osScan: 0x1D, internal: 0x85, expected: 0x10 },
  { name: ')', pcCode: 'BracketRight', group: 2, bit: 4, osScan: 0x15, internal: 0x86, expected: 0x11 },
]);

const DIGIT2 = KEYS[0];
const SEQUENCE = Object.freeze([KEYS[0], KEYS[2], KEYS[1]]);

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'pc', 'stepCount', '_sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2',
  'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value == null) return '-';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[(addr + i) & 0xFFFFFF] << (i * 8);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[(addr + i) & 0xFFFFFF] = (value >>> (i * 8)) & 0xFF;
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

function captureCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) cpu[field] = snapshot[field];
  cpu.spWarnings = [];
}

function rearmHomeContext(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function refreshEditContextForCursor(mem, cursor) {
  write24(mem, 0xD02317, TOKEN_CURSOR);
  write24(mem, 0xD0231A, TOKEN_CURSOR);
  write24(mem, 0xD0231D, TOKEN_CURSOR - 1);

  mem.fill(0, 0xD02430, 0xD02460);
  write24(mem, 0xD02437, cursor);
  write24(mem, 0xD0243A, cursor);
  write24(mem, 0xD0243D, TOKEN_CURSOR);
  write24(mem, 0xD02440, TOKEN_CURSOR);
  write24(mem, 0xD0244D, 0xD3FE89);
  mem[0xD02455] = 0x07;
  mem[0xD0245D] = 0x01;

  mem[0xD000A3] = 0x0A;
  write24(mem, 0xD02A40, TOKEN_CURSOR);
  mem[0xD02A29] = 0;
  mem[0xD02A2A] = 0;
}

function seedColdbootEditContext(mem) {
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
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function prepareBrowserFrame(mem, cpu, key) {
  rearmHomeContext(mem);
  seedKey(mem, key);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_TOP - 27;
  fillSentinel(mem, cpu.sp, 27);
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xD008E0, cpu.sp);
}

function resetKeyboard(peripherals) {
  peripherals.keyboard.keyMatrix.fill(0xFF);
  peripherals.keyboardController.groupSelect = 0xFF;
}

function pressKey(peripherals, mem, key) {
  peripherals.setKeyPressed(mem, key.osScan);
  peripherals.setMatrixKey(key.group, key.bit, true);
}

function releaseKey(peripherals, mem, key) {
  peripherals.setMatrixKey(key.group, key.bit, false);
  peripherals.clearKeyPressed(mem);
}

function readBuffer(mem, len = 12) {
  return Array.from(mem.slice(EDIT_BASE, EDIT_BASE + len));
}

function formatBytes(bytes) {
  return bytes.map((byte) => hex(byte, 2)).join(' ');
}

function bufferStartsWith(mem, expectedPrefix) {
  for (let i = 0; i < expectedPrefix.length; i += 1) {
    if (mem[EDIT_BASE + i] !== expectedPrefix[i]) return false;
  }
  return true;
}

function vramHash(mem) {
  let hash = 0x811C9DC5;
  for (let i = 0; i < VRAM_BYTES; i += 1) {
    hash ^= mem[VRAM_BASE + i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function vramStats(mem) {
  let nonWhite = 0;
  for (let i = 0; i < VRAM_BYTES; i += 2) {
    const px = mem[VRAM_BASE + i] | (mem[VRAM_BASE + i + 1] << 8);
    if (px !== 0xFFFF) nonWhite += 1;
  }
  return { hash: hex(vramHash(mem), 8), nonWhite };
}

function snap(mem, cpu) {
  return {
    pc: hex(cpu.pc),
    f: hex(cpu.f, 2),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    sp: hex(cpu.sp),
    D00080: hex(mem[0xD00080], 2),
    D0009F: hex(mem[0xD0009F], 2),
    D000C2: hex(mem[0xD000C2], 2),
    D00587: hex(mem[0xD00587], 2),
    D0058C: hex(mem[0xD0058C], 2),
    D0058D: hex(mem[0xD0058D], 2),
    D0058E: hex(mem[0xD0058E], 2),
    D007CA: hex(read24(mem, 0xD007CA)),
    D008E0: hex(read24(mem, 0xD008E0)),
    D0231A: hex(read24(mem, 0xD0231A)),
    D0243A: hex(read24(mem, 0xD0243A)),
    D0243D: hex(read24(mem, 0xD0243D)),
    D02587: hex(read24(mem, 0xD02587)),
    D02590: hex(read24(mem, 0xD02590)),
    D02593: hex(read24(mem, 0xD02593)),
    D0259A: hex(read24(mem, 0xD0259A)),
    D0259D: hex(read24(mem, 0xD0259D)),
    buffer: formatBytes(readBuffer(mem)),
    vram: vramStats(mem),
  };
}

function bootBrowserSeededState() {
  const machine = makeMachine();
  const { mem, peripherals, executor, cpu } = machine;
  const phases = [];

  phases.push(['coldboot', executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['kernel', executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 })]);

  cpu.madl = 1; cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['postinit', executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12; fillSentinel(mem, cpu.sp, 12);
  phases.push(['warm-idle', executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 })]);

  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24; fillSentinel(mem, cpu.sp, 24);
  write24(mem, cpu.sp, WARM_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  const vatFields = [
    0xD007CA, 0xD008E0, 0xD02587, 0xD0258A, 0xD0258D, 0xD02590,
    0xD02593, 0xD0259A, 0xD0259D, 0xD025A0, 0xD025C5,
  ];
  let vatSnapshot = null;
  phases.push(['launch-home', executor.runFrom(LAUNCH_HOME_INIT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      if (vatSnapshot || (pc & 0xFFFFFF) !== WATCH.cleanupEntry) return;
      if (read24(mem, 0xD02590) === 0) return;
      vatSnapshot = vatFields.map((addr) => [addr, read24(mem, addr)]);
    },
  })]);

  if (vatSnapshot) {
    for (const [addr, value] of vatSnapshot) write24(mem, addr, value);
  }

  peripherals.setTimerEnabled(true);
  prepareBrowserFrame(mem, cpu, DIGIT2);
  phases.push(['repaint', executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })]);

  rearmHomeContext(mem);
  seedColdbootEditContext(mem);

  return { ...machine, phases, vatSnapshotCaptured: Boolean(vatSnapshot) };
}

function runInsert(machine, start, key, expectedPrefix, policy) {
  const { mem, peripherals, executor, cpu } = machine;
  mem.set(start.mem);
  restoreCpu(cpu, start.cpu);
  resetKeyboard(peripherals);
  peripherals.setTimerEnabled(true);

  prepareBrowserFrame(mem, cpu, key);
  if (policy.clearD000C2BeforeRun) mem[0xD000C2] &= 0x7F;
  pressKey(peripherals, mem, key);

  const counts = {
    getcsc: 0,
    cxMain: 0,
    gate: 0,
    preOwnerCall: 0,
    cleanupOwner: 0,
    cleanupEntry: 0,
    wipe: 0,
  };
  const events = [];
  let blocks = 0;
  let insertBlock = null;
  let releaseBlock = null;
  let gateSetBlock = null;
  let stopReason = null;
  let stopSteps = null;
  let lastPc = OUTER_LOOP;

  function event(kind, addr, steps, extra = {}) {
    if (events.length >= 10 && !kind.startsWith('unexpected')) return;
    events.push({
      kind,
      block: blocks,
      steps,
      pc: hex(addr),
      D000C2: hex(mem[0xD000C2], 2),
      D007CA: hex(read24(mem, 0xD007CA)),
      D0243A: hex(read24(mem, 0xD0243A)),
      buffer: formatBytes(readBuffer(mem, Math.max(8, expectedPrefix.length + 2))),
      ...extra,
    });
  }

  try {
    const result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: policy.maxSteps ?? 160000,
      maxLoopIterations: policy.maxLoopIterations ?? 500000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc, mode, meta, steps) {
        blocks += 1;
        const addr = pc & 0xFFFFFF;
        lastPc = addr;

        if (addr === WATCH.getcsc) counts.getcsc += 1;
        if (addr === WATCH.cxMain) counts.cxMain += 1;
        if (addr === WATCH.preOwnerFlagGate) counts.gate += 1;
        if (addr === WATCH.preOwnerCall) counts.preOwnerCall += 1;
        if (addr === WATCH.cleanupOwner) counts.cleanupOwner += 1;
        if (addr === WATCH.cleanupEntry) counts.cleanupEntry += 1;
        if (addr === WATCH.wipe) counts.wipe += 1;

        const cursor = read24(mem, 0xD0243A);
        if (insertBlock == null
            && bufferStartsWith(mem, expectedPrefix)
            && cursor >= EDIT_BASE + expectedPrefix.length) {
          insertBlock = blocks;
          event('inserted-prefix', addr, steps, { key: key.name, expectedPrefix: formatBytes(expectedPrefix) });
          if (policy.releaseAtInsert) {
            releaseKey(peripherals, mem, key);
            releaseBlock = blocks;
            event('release-key', addr, steps);
          }
          if (policy.stopAtInsert) {
            stopReason = 'insert_stop';
            stopSteps = steps;
            throw STOP;
          }
        }

        if (insertBlock != null && addr === WATCH.preOwnerFlagGate) {
          event('gate-entry', addr, steps);
          if (policy.setD000C2Bit7AtGate && gateSetBlock == null) {
            mem[0xD000C2] |= 0x80;
            gateSetBlock = blocks;
            event('gate-bit7-set', addr, steps);
          }
        }

        if (insertBlock != null && policy.stopAtPreOwnerCall && addr === WATCH.preOwnerCall) {
          stopReason = 'stop_0158e8_before_owner';
          stopSteps = steps;
          event('stop-before-owner', addr, steps);
          throw STOP;
        }

        if (insertBlock != null && policy.stopAtGateReturn && addr === WATCH.gateReturn) {
          stopReason = 'gate_return_0013da';
          stopSteps = steps;
          event('gate-return-stop', addr, steps);
          throw STOP;
        }

        if (gateSetBlock != null && policy.stopOnBypassFailure
            && (addr === WATCH.preOwnerCall || addr === WATCH.cleanupOwner || addr === WATCH.cleanupEntry || addr === WATCH.wipe)) {
          stopReason = `unexpected_${hex(addr)}`;
          stopSteps = steps;
          event('unexpected-post-gate-route', addr, steps);
          throw STOP;
        }
      },
    });
    stopReason = result.termination;
    stopSteps = result.steps;
    lastPc = result.lastPc & 0xFFFFFF;
  } catch (error) {
    if (error !== STOP) throw error;
  }

  return {
    key: key.name,
    policy: policy.name,
    termination: stopReason,
    steps: stopSteps,
    blocks,
    lastPc: hex(lastPc),
    expectedPrefix: formatBytes(expectedPrefix),
    insertBlock,
    releaseBlock,
    gateSetBlock,
    counts,
    after: snap(mem, cpu),
    mem: mem.slice(),
    cpu: captureCpu(cpu),
    events,
  };
}

function sameCoreState(a, b) {
  return a.after.buffer === b.after.buffer
    && a.after.D007CA === b.after.D007CA
    && a.after.D0231A === b.after.D0231A
    && a.after.D0243A === b.after.D0243A
    && a.after.D0243D === b.after.D0243D
    && a.after.D02587 === b.after.D02587
    && a.after.D02590 === b.after.D02590
    && a.after.D02593 === b.after.D02593
    && a.after.D0259A === b.after.D0259A
    && a.after.D0259D === b.after.D0259D
    && a.after.vram.hash === b.after.vram.hash
    && a.after.vram.nonWhite === b.after.vram.nonWhite;
}

function isCleanEarly(row) {
  return row.termination === 'stop_0158e8_before_owner'
    && row.insertBlock != null
    && row.counts.preOwnerCall === 1
    && row.counts.cleanupOwner === 0
    && row.counts.cleanupEntry === 0
    && row.counts.wipe === 0;
}

function isCleanGate(row) {
  return row.termination === 'gate_return_0013da'
    && row.insertBlock != null
    && row.counts.preOwnerCall === 0
    && row.counts.cleanupOwner === 0
    && row.counts.cleanupEntry === 0
    && row.counts.wipe === 0
    && row.after.D000C2 === hex(0x80, 2);
}

function isCleanInsert(row, expectedPrefix) {
  return row.termination === 'insert_stop'
    && row.insertBlock != null
    && row.after.buffer.startsWith(formatBytes(expectedPrefix))
    && row.after.D0243A === hex(EDIT_BASE + expectedPrefix.length)
    && row.counts.cleanupOwner === 0
    && row.counts.cleanupEntry === 0
    && row.counts.wipe === 0;
}

function runPolicySequence(machine, base, keys, policyKind) {
  let state = base;
  const rows = [];
  const expectedPrefix = [];

  for (const key of keys) {
    expectedPrefix.push(key.expected);
    const row = runInsert(machine, state, key, expectedPrefix, policyKind === 'gate'
      ? {
          name: 'gate',
          releaseAtInsert: true,
          setD000C2Bit7AtGate: true,
          stopAtGateReturn: true,
          stopOnBypassFailure: true,
          clearD000C2BeforeRun: rows.length === 0,
        }
      : {
          name: 'early',
          releaseAtInsert: true,
          stopAtPreOwnerCall: true,
          clearD000C2BeforeRun: rows.length === 0,
        });
    rows.push(row);
    state = { mem: row.mem, cpu: row.cpu };
  }

  return { rows, final: rows.at(-1), expectedPrefix: [...expectedPrefix] };
}

function rowMd(row, extra = '') {
  return [
    row.key,
    row.policy,
    row.termination,
    row.steps ?? '-',
    row.insertBlock ?? '-',
    row.gateSetBlock ?? '-',
    row.counts.gate,
    row.counts.preOwnerCall,
    row.counts.cleanupOwner,
    row.counts.cleanupEntry,
    row.counts.wipe,
    row.after.D000C2,
    row.after.D0243A,
    row.after.buffer,
    `${row.after.vram.hash}/${row.after.vram.nonWhite}`,
    extra,
  ].join(' | ');
}

function summarizeSingle(row) {
  return {
    key: row.key,
    policy: row.policy,
    termination: row.termination,
    steps: row.steps,
    insertBlock: row.insertBlock,
    gateSetBlock: row.gateSetBlock,
    counts: row.counts,
    after: row.after,
    events: row.events,
  };
}

function buildReport(data) {
  const lines = [
    '# Phase 687: Broad D000C2 / 0x0158DE Gate Policy Probe',
    '',
    'Probe: `probe-phase687-d000c2-gate-broad.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase687-d000c2-gate-broad.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}`,
    `- VAT snapshot captured: ${data.vatSnapshotCaptured}`,
    `- Single-key pass count: ${data.singlePassCount}/${data.singleResults.length}`,
    `- Sequence pass: ${data.sequencePass}`,
    `- Main finding: ${data.finding}`,
    '',
    '## Single-Key A/B',
    '',
    '| key | policy | termination | steps | insert block | gate set block | gate hits | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D0243A | buffer | VRAM hash/nonWhite | assertion |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|',
  ];

  for (const result of data.singleResults) {
    lines.push(`| ${rowMd(result.early, `early=${result.earlyOk}`)} |`);
    lines.push(`| ${rowMd(result.gate, `gate=${result.gateOk}; eq=${result.equivalent}`)} |`);
    lines.push(`| ${rowMd(result.nextDigit, `nextDigit=${result.nextDigitOk}`)} |`);
  }

  lines.push(
    '',
    '## Three-Key Sequence',
    '',
    `Sequence: ${data.sequence.keys.join(' ')}`,
    '',
    '| key | policy | termination | steps | insert block | gate set block | gate hits | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D0243A | buffer | VRAM hash/nonWhite | assertion |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|',
  );

  for (const row of data.sequence.early.rows) lines.push(`| ${rowMd(row, `early=${isCleanEarly(row)}`)} |`);
  for (const row of data.sequence.gate.rows) lines.push(`| ${rowMd(row, `gate=${isCleanGate(row)}`)} |`);
  lines.push(`| ${rowMd(data.sequence.nextDigit, `nextDigit=${data.sequence.nextDigitOk}`)} |`);

  lines.push(
    '',
    '## Interpretation',
    '',
    '- Setting `D000C2` bit 7 at `0x0158DE` skipped `0x0158E8 -> 0x0158BC` for every tested insertable key and for the `2 + 3` sequence.',
    '- Each gate-bypass result matched the corresponding browser-style early-stop result for buffer, cursor/context, VAT fields, and full-VRAM hash/non-white count. The only intentional state delta is `D000C2=0x80`.',
    '- A follow-up Digit2 insert succeeded from every single-key gate state and from the 3-key sequence gate state while leaving `D000C2` bit 7 set.',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify(data.compact, null, 2),
    '```',
    '',
  );

  return `${lines.join('\n')}\n`;
}

console.log('phase687: broad D000C2 / 0x0158DE gate policy probe');
const machine = bootBrowserSeededState();
const base = {
  mem: machine.mem.slice(),
  cpu: captureCpu(machine.cpu),
  snap: snap(machine.mem, machine.cpu),
};

const singleResults = [];
for (const key of KEYS) {
  const expectedPrefix = [key.expected];
  const early = runInsert(machine, base, key, expectedPrefix, {
    name: 'early',
    releaseAtInsert: true,
    stopAtPreOwnerCall: true,
    clearD000C2BeforeRun: true,
  });
  const gate = runInsert(machine, base, key, expectedPrefix, {
    name: 'gate',
    releaseAtInsert: true,
    setD000C2Bit7AtGate: true,
    stopAtGateReturn: true,
    stopOnBypassFailure: true,
    clearD000C2BeforeRun: true,
  });

  const nextPrefix = [key.expected, DIGIT2.expected];
  const nextDigit = runInsert(machine, { mem: gate.mem, cpu: gate.cpu }, DIGIT2, nextPrefix, {
    name: 'next-digit-from-gate',
    releaseAtInsert: true,
    stopAtInsert: true,
  });

  const earlyOk = isCleanEarly(early);
  const gateOk = isCleanGate(gate);
  const equivalent = sameCoreState(early, gate);
  const nextDigitOk = isCleanInsert(nextDigit, nextPrefix);
  const pass = earlyOk && gateOk && equivalent && nextDigitOk;
  singleResults.push({ key, early, gate, nextDigit, earlyOk, gateOk, equivalent, nextDigitOk, pass });
  console.log(`${key.name}: early=${early.termination}/${early.steps} gate=${gate.termination}/${gate.steps} eq=${equivalent} next=${nextDigit.termination}/${nextDigit.steps} pass=${pass} buf=${gate.after.buffer}`);
}

const earlySequence = runPolicySequence(machine, base, SEQUENCE, 'early');
const gateSequence = runPolicySequence(machine, base, SEQUENCE, 'gate');
const sequenceNextPrefix = [...gateSequence.expectedPrefix, DIGIT2.expected];
const sequenceNextDigit = runInsert(machine, { mem: gateSequence.final.mem, cpu: gateSequence.final.cpu }, DIGIT2, sequenceNextPrefix, {
  name: 'next-digit-from-sequence-gate',
  releaseAtInsert: true,
  stopAtInsert: true,
});

const sequencePass = earlySequence.rows.every(isCleanEarly)
  && gateSequence.rows.every(isCleanGate)
  && sameCoreState(earlySequence.final, gateSequence.final)
  && isCleanInsert(sequenceNextDigit, sequenceNextPrefix);

const singlePassCount = singleResults.filter((row) => row.pass).length;
const pass = singlePassCount === singleResults.length && sequencePass;
const finding = pass
  ? 'broad probe-only D000C2 bit7 gate policy matched browser early-stop across 9 insertable keys and a 2+3 sequence, skipped 0x0158E8/0x0158BC/0x001879/0x0018F8, and preserved follow-up Digit2 insertion with bit 7 left set'
  : 'one or more broad D000C2 gate policy assertions failed; inspect compact JSON and event samples before browser integration';

const compact = {
  phases: machine.phases.map(([name, result]) => ({
    name,
    termination: result.termination,
    steps: result.steps,
    lastPc: hex(result.lastPc & 0xFFFFFF),
  })),
  base: base.snap,
  singleResults: singleResults.map((row) => ({
    key: row.key,
    earlyOk: row.earlyOk,
    gateOk: row.gateOk,
    equivalent: row.equivalent,
    nextDigitOk: row.nextDigitOk,
    pass: row.pass,
    early: summarizeSingle(row.early),
    gate: summarizeSingle(row.gate),
    nextDigit: summarizeSingle(row.nextDigit),
  })),
  sequence: {
    keys: SEQUENCE.map((key) => key.name),
    pass: sequencePass,
    equivalent: sameCoreState(earlySequence.final, gateSequence.final),
    expectedPrefix: formatBytes(gateSequence.expectedPrefix),
    early: earlySequence.rows.map(summarizeSingle),
    gate: gateSequence.rows.map(summarizeSingle),
    nextDigitOk: isCleanInsert(sequenceNextDigit, sequenceNextPrefix),
    nextDigit: summarizeSingle(sequenceNextDigit),
  },
};

const report = {
  pass,
  vatSnapshotCaptured: machine.vatSnapshotCaptured,
  singlePassCount,
  singleResults,
  sequencePass,
  sequence: {
    keys: SEQUENCE.map((key) => key.name),
    early: earlySequence,
    gate: gateSequence,
    nextDigit: sequenceNextDigit,
    nextDigitOk: isCleanInsert(sequenceNextDigit, sequenceNextPrefix),
  },
  finding,
  compact,
};

fs.writeFileSync(REPORT_PATH, buildReport(report));

console.log(`sequence: earlyFinal=${earlySequence.final.termination} gateFinal=${gateSequence.final.termination} eq=${sameCoreState(earlySequence.final, gateSequence.final)} next=${sequenceNextDigit.termination} pass=${sequencePass}`);
console.log(`finding=${finding}`);
console.log(`wrote ${path.basename(REPORT_PATH)}`);

if (!pass) process.exitCode = 1;

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase686-d000c2-gate-ab.md');

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
const STOP = Symbol('phase686-stop');

const DIGIT2 = Object.freeze({
  group: 3,
  bit: 1,
  osScan: 0x1A,
  internal: 0x90,
  expected: 0x32,
});

const WATCH = Object.freeze({
  isr: 0x000038,
  getcsc: 0x03FA09,
  cxMain: 0x0585E9,
  preOwnerFlagGate: 0x0158DE,
  preOwnerCall: 0x0158E8,
  gateReturn: 0x0013DA,
  cleanupOwner: 0x0158BC,
  cleanupEntry: 0x001879,
  wipe: 0x0018F8,
});

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'pc', 'stepCount', '_sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2',
  'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
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

function seedDigit2Key(mem) {
  mem[0xD0058C] = DIGIT2.internal;
  mem[0xD0058D] = DIGIT2.internal;
  mem[0xD0058E] = DIGIT2.internal;
  mem[0xD00587] = DIGIT2.osScan;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function clearKeyRam(mem) {
  mem[0xD00587] = 0;
  mem[0xD0058C] = 0;
  mem[0xD0058D] = 0;
  mem[0xD0058E] = 0;
  mem[0xD00080] &= ~0x08;
  mem[0xD0009F] &= ~0x20;
}

function prepareBrowserFrame(mem, cpu) {
  rearmHomeContext(mem);
  seedDigit2Key(mem);
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

function pressMatrixKey(peripherals) {
  peripherals.setMatrixKey(DIGIT2.group, DIGIT2.bit, true);
}

function releaseMatrixKey(peripherals, mem) {
  peripherals.setMatrixKey(DIGIT2.group, DIGIT2.bit, false);
  peripherals.clearKeyPressed(mem);
}

function readBuffer(mem, len = 8) {
  return Array.from(mem.slice(EDIT_BASE, EDIT_BASE + len));
}

function formatBytes(bytes) {
  return bytes.map((byte) => hex(byte, 2)).join(' ');
}

function stack24(mem, sp, count = 4) {
  const start = sp & 0xFFFFFF;
  return Array.from({ length: count }, (_, index) => hex(read24(mem, start + index * 3)));
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
  let nonZero = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;
  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const off = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const px = mem[off] | (mem[off + 1] << 8);
      if (px !== 0xFFFF) {
        nonWhite += 1;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
      }
      if (px !== 0) nonZero += 1;
    }
  }
  return {
    hash: hex(vramHash(mem), 8),
    nonWhite,
    nonZero,
    bbox: nonWhite ? `${minRow}-${maxRow}/${minCol}-${maxCol}` : 'none',
  };
}

function snap(mem, cpu, peripherals) {
  return {
    pc: hex(cpu.pc),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    sp: hex(cpu.sp),
    stack24: stack24(mem, cpu.sp),
    D00080: hex(mem[0xD00080], 2),
    D0009B: hex(mem[0xD0009B], 2),
    D0009F: hex(mem[0xD0009F], 2),
    D000A3: hex(mem[0xD000A3], 2),
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
    matrix3: hex(peripherals.keyboard.keyMatrix[3], 2),
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
  prepareBrowserFrame(mem, cpu);
  phases.push(['repaint', executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })]);

  rearmHomeContext(mem);
  seedColdbootEditContext(mem);

  return { ...machine, phases, vatSnapshotCaptured: Boolean(vatSnapshot) };
}

function countMatches(mem, expectedPrefix) {
  let matched = 0;
  for (let i = 0; i < expectedPrefix.length; i += 1) {
    if (mem[EDIT_BASE + i] === expectedPrefix[i]) matched += 1;
  }
  return matched;
}

function runInsert(machine, start, variant) {
  const { mem, peripherals, executor, cpu } = machine;
  mem.set(start.mem);
  restoreCpu(cpu, start.cpu);
  resetKeyboard(peripherals);
  peripherals.setTimerEnabled(true);

  prepareBrowserFrame(mem, cpu);
  if (variant.clearD000C2BeforeRun) mem[0xD000C2] &= 0x7F;
  if (variant.matrixHeld) pressMatrixKey(peripherals);

  const expectedPrefix = variant.expectedPrefix;
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
    events.push({
      kind,
      block: blocks,
      steps,
      pc: hex(addr),
      state: snap(mem, cpu, peripherals),
      ...extra,
    });
  }

  try {
    const result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: variant.maxSteps ?? 140000,
      maxLoopIterations: variant.maxLoopIterations ?? 500000,
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
            && countMatches(mem, expectedPrefix) === expectedPrefix.length
            && cursor >= EDIT_BASE + expectedPrefix.length) {
          insertBlock = blocks;
          event('inserted-prefix', addr, steps, { expectedPrefix: formatBytes(expectedPrefix) });
          if (variant.releaseMatrixAtInsert) {
            releaseMatrixKey(peripherals, mem);
            releaseBlock = blocks;
            event('release-matrix', addr, steps);
          }
          if (variant.stopAtInsert) {
            stopReason = 'insert_stop';
            stopSteps = steps;
            throw STOP;
          }
        }

        if (insertBlock != null && addr === WATCH.preOwnerFlagGate) {
          event('gate-entry-before-policy', addr, steps);
          if (variant.setD000C2Bit7AtGate && gateSetBlock == null) {
            mem[0xD000C2] |= 0x80;
            gateSetBlock = blocks;
            event('gate-bit7-set', addr, steps);
          }
        }

        if (insertBlock != null && variant.stopAtPreOwnerCall && addr === WATCH.preOwnerCall) {
          stopReason = 'stop_0158e8_before_owner';
          stopSteps = steps;
          event('stop-before-0158bc', addr, steps);
          throw STOP;
        }

        if (gateSetBlock != null && variant.stopAtGateReturn && addr === WATCH.gateReturn) {
          stopReason = 'gate_return_0013da';
          stopSteps = steps;
          event('gate-return-stop', addr, steps);
          throw STOP;
        }

        if (gateSetBlock != null && variant.stopOnBypassFailure
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

  const after = snap(mem, cpu, peripherals);
  return {
    name: variant.name,
    termination: stopReason,
    steps: stopSteps,
    blocks,
    lastPc: hex(lastPc),
    expectedPrefix: formatBytes(expectedPrefix),
    insertBlock,
    releaseBlock,
    gateSetBlock,
    counts,
    after,
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

function rowMd(row, second) {
  return [
    row.name,
    row.termination,
    row.steps ?? '-',
    row.insertBlock ?? '-',
    row.releaseBlock ?? '-',
    row.gateSetBlock ?? '-',
    row.counts.preOwnerCall,
    row.counts.cleanupOwner,
    row.counts.cleanupEntry,
    row.counts.wipe,
    row.after.D000C2,
    row.after.D007CA,
    row.after.D0243A,
    row.after.D02590,
    row.after.buffer,
    `${row.after.vram.hash}/${row.after.vram.nonWhite}`,
    second?.termination ?? '-',
    second?.after?.buffer ?? '-',
    second?.after?.D0243A ?? '-',
  ].join(' | ');
}

function buildReport(data) {
  const lines = [
    '# Phase 686: D000C2 / 0x0158DE Gate A/B',
    '',
    'Probe: `probe-phase686-d000c2-gate-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase686-d000c2-gate-ab.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}`,
    `- VAT snapshot captured: ${data.vatSnapshotCaptured}`,
    `- Main finding: ${data.finding}`,
    '',
    '## First-Insert Policies',
    '',
    '| policy | termination | steps | insert block | release block | gate set block | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D007CA | D0243A | D02590 | buffer | VRAM hash/nonWhite | second termination | second buffer | second D0243A |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|',
    `| ${rowMd(data.earlyStop, data.earlySecond)} |`,
    `| ${rowMd(data.gateBypass, data.gateSecond)} |`,
    '',
    '## Equivalence',
    '',
    `- Core state equivalent after first insert: ${data.equivalence.coreState}`,
    `- Exact VRAM hash match: ${data.equivalence.vramHash}`,
    `- Intentional D000C2 delta: early-stop=${data.earlyStop.after.D000C2}, gate-bypass=${data.gateBypass.after.D000C2}`,
    `- Second insert works from early-stop state: ${data.secondPass.early}`,
    `- Second insert works from gate-bypass state with D000C2 still set: ${data.secondPass.gate}`,
    '',
    '## Event Samples',
    '',
    '```json',
    JSON.stringify({
      earlyStop: data.earlyStop.events,
      gateBypass: data.gateBypass.events,
      earlySecond: data.earlySecond.events,
      gateSecond: data.gateSecond.events,
    }, null, 2),
    '```',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify(data.compact, null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    '- Setting `D000C2` bit 7 at the entry of `0x0158DE` makes the local `RET NZ` return to `0x0013DA` before the `0x0158E8 -> 0x0158BC` owner call.',
    '- The resulting memory/display state matches the existing browser-style early stop before `0x0158BC` for the tested edit/VAT fields and full-VRAM hash. The only intentional difference is `D000C2=0x80`.',
    '- A subsequent Digit2 insert reaches the second buffer byte from both states. The gate-bypass case was intentionally left with `D000C2` bit 7 still set, so the flag does not block the next browser-framed key insert in this probe.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

console.log('phase686: D000C2 / 0x0158DE gate A/B');
const machine = bootBrowserSeededState();
const base = {
  mem: machine.mem.slice(),
  cpu: captureCpu(machine.cpu),
  snap: snap(machine.mem, machine.cpu, machine.peripherals),
};

const earlyStop = runInsert(machine, base, {
  name: 'early-stop-before-0158bc',
  matrixHeld: true,
  expectedPrefix: [DIGIT2.expected],
  releaseMatrixAtInsert: true,
  stopAtPreOwnerCall: true,
});

const gateBypass = runInsert(machine, base, {
  name: 'd000c2-bit7-at-0158de-stop-return',
  matrixHeld: true,
  expectedPrefix: [DIGIT2.expected],
  releaseMatrixAtInsert: true,
  setD000C2Bit7AtGate: true,
  stopAtGateReturn: true,
  stopOnBypassFailure: true,
});

const earlySecond = runInsert(machine, { mem: earlyStop.mem, cpu: earlyStop.cpu }, {
  name: 'second-digit-from-early-stop',
  matrixHeld: true,
  expectedPrefix: [DIGIT2.expected, DIGIT2.expected],
  releaseMatrixAtInsert: true,
  stopAtInsert: true,
});

const gateSecond = runInsert(machine, { mem: gateBypass.mem, cpu: gateBypass.cpu }, {
  name: 'second-digit-from-gate-bypass',
  matrixHeld: true,
  expectedPrefix: [DIGIT2.expected, DIGIT2.expected],
  releaseMatrixAtInsert: true,
  stopAtInsert: true,
});

const equivalence = {
  coreState: sameCoreState(earlyStop, gateBypass),
  vramHash: earlyStop.after.vram.hash === gateBypass.after.vram.hash
    && earlyStop.after.vram.nonWhite === gateBypass.after.vram.nonWhite,
};

const secondPass = {
  early: earlySecond.termination === 'insert_stop'
    && earlySecond.after.buffer.startsWith('0x32 0x32')
    && earlySecond.after.D0243A === hex(EDIT_BASE + 2)
    && earlySecond.counts.cleanupEntry === 0
    && earlySecond.counts.wipe === 0,
  gate: gateSecond.termination === 'insert_stop'
    && gateSecond.after.buffer.startsWith('0x32 0x32')
    && gateSecond.after.D0243A === hex(EDIT_BASE + 2)
    && gateSecond.counts.cleanupEntry === 0
    && gateSecond.counts.wipe === 0,
};

const pass = earlyStop.termination === 'stop_0158e8_before_owner'
  && earlyStop.counts.cleanupOwner === 0
  && earlyStop.counts.cleanupEntry === 0
  && earlyStop.counts.wipe === 0
  && gateBypass.termination === 'gate_return_0013da'
  && gateBypass.counts.preOwnerCall === 0
  && gateBypass.counts.cleanupOwner === 0
  && gateBypass.counts.cleanupEntry === 0
  && gateBypass.counts.wipe === 0
  && gateBypass.after.D000C2 === hex(0x80, 2)
  && equivalence.coreState
  && secondPass.early
  && secondPass.gate;

const finding = pass
  ? 'probe-only D000C2 bit7 gate is a clean pre-owner bypass: setting bit 7 at 0x0158DE returns to 0x0013DA before 0x0158E8/0x0158BC, preserves buffer/cursor/context/full-VRAM equivalence with browser early-stop except D000C2=0x80, and still allows a subsequent digit insert with the bit left set'
  : 'D000C2 gate A/B did not satisfy all bypass/equivalence/subsequent-insert assertions; inspect event JSON';

const compact = {
  phases: machine.phases.map(([name, result]) => ({
    name,
    termination: result.termination,
    steps: result.steps,
    lastPc: hex(result.lastPc & 0xFFFFFF),
  })),
  base: base.snap,
  earlyStop: {
    termination: earlyStop.termination,
    steps: earlyStop.steps,
    counts: earlyStop.counts,
    after: earlyStop.after,
  },
  gateBypass: {
    termination: gateBypass.termination,
    steps: gateBypass.steps,
    counts: gateBypass.counts,
    after: gateBypass.after,
  },
  earlySecond: {
    termination: earlySecond.termination,
    steps: earlySecond.steps,
    counts: earlySecond.counts,
    after: earlySecond.after,
  },
  gateSecond: {
    termination: gateSecond.termination,
    steps: gateSecond.steps,
    counts: gateSecond.counts,
    after: gateSecond.after,
  },
  equivalence,
  secondPass,
};

const report = {
  pass,
  vatSnapshotCaptured: machine.vatSnapshotCaptured,
  finding,
  earlyStop,
  gateBypass,
  earlySecond,
  gateSecond,
  equivalence,
  secondPass,
  compact,
};

fs.writeFileSync(REPORT_PATH, buildReport(report));

console.log(`early-stop: term=${earlyStop.termination} steps=${earlyStop.steps} preOwner=${earlyStop.counts.preOwnerCall} owner=${earlyStop.counts.cleanupOwner} buf=${earlyStop.after.buffer} cur=${earlyStop.after.D0243A} vram=${earlyStop.after.vram.hash}/${earlyStop.after.vram.nonWhite}`);
console.log(`gate-bypass: term=${gateBypass.termination} steps=${gateBypass.steps} preOwner=${gateBypass.counts.preOwnerCall} owner=${gateBypass.counts.cleanupOwner} D000C2=${gateBypass.after.D000C2} buf=${gateBypass.after.buffer} cur=${gateBypass.after.D0243A} vram=${gateBypass.after.vram.hash}/${gateBypass.after.vram.nonWhite}`);
console.log(`second early: term=${earlySecond.termination} buf=${earlySecond.after.buffer} cur=${earlySecond.after.D0243A}`);
console.log(`second gate: term=${gateSecond.termination} buf=${gateSecond.after.buffer} cur=${gateSecond.after.D0243A} D000C2=${gateSecond.after.D000C2}`);
console.log(`finding=${finding}`);
console.log(`wrote ${path.basename(REPORT_PATH)}`);

if (!pass) process.exitCode = 1;

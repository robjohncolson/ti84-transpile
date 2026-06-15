import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase689-d000c2-owner-dynamic.md');

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
const STOP = Symbol('phase689-stop');

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

const BIT7_OWNERS = Object.freeze([
  { pc: 0x0012EF, op: 'RES', role: 'clearer', cluster: 'low-ROM reset/wake flag initializer' },
  { pc: 0x00186A, op: 'RES', role: 'clearer', cluster: 'low-ROM key/flash wrapper cluster' },
  { pc: 0x0018B7, op: 'BIT', role: 'test', cluster: 'low-ROM key/flash wrapper cluster' },
  { pc: 0x001915, op: 'BIT', role: 'test', cluster: 'low-ROM key/flash wrapper cluster' },
  { pc: 0x005BB6, op: 'RES', role: 'clearer', cluster: 'low-ROM hardware/service dispatch cluster' },
  { pc: 0x005D00, op: 'BIT', role: 'test', cluster: 'low-ROM hardware/service dispatch cluster' },
  { pc: 0x00621F, op: 'RES', role: 'clearer', cluster: 'low-ROM hardware/service dispatch cluster' },
  { pc: 0x0158E3, op: 'BIT', role: 'test', cluster: '0x0158DE post-key flash/action gate' },
  { pc: 0x0158F0, op: 'SET', role: 'setter', cluster: '0x0158DE post-key flash/action gate' },
  { pc: 0x027238, op: 'RES', role: 'clearer', cluster: 'event/parser state cluster' },
  { pc: 0x040580, op: 'RES', role: 'clearer', cluster: 'keyboard/display event cluster' },
  { pc: 0x0405DD, op: 'BIT', role: 'test', cluster: 'keyboard/display event cluster' },
  { pc: 0x04062C, op: 'BIT', role: 'test', cluster: 'keyboard/display event cluster' },
  { pc: 0x040740, op: 'BIT', role: 'test', cluster: 'keyboard/display event cluster' },
  { pc: 0x0408C6, op: 'RES', role: 'clearer', cluster: 'keyboard/display event cluster' },
  { pc: 0x040972, op: 'BIT', role: 'test', cluster: 'keyboard/display event cluster' },
  { pc: 0x040EB4, op: 'RES', role: 'clearer', cluster: 'keyboard/display event tail cluster' },
  { pc: 0x0459F7, op: 'RES', role: 'clearer', cluster: 'home/display transition cluster' },
  { pc: 0x045B46, op: 'SET', role: 'setter', cluster: 'home/display transition cluster' },
  { pc: 0x04C057, op: 'BIT', role: 'test', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x04C0BD, op: 'BIT', role: 'test', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x04C0D3, op: 'BIT', role: 'test', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x04C14D, op: 'BIT', role: 'test', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x04C167, op: 'BIT', role: 'test', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x04C53E, op: 'RES', role: 'clearer', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x04C564, op: 'BIT', role: 'test', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x04C56F, op: 'SET', role: 'setter', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x04C83F, op: 'BIT', role: 'test', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x04C84B, op: 'SET', role: 'setter', cluster: 'central UI bit7 latch/helper cluster' },
  { pc: 0x06B9C5, op: 'RES', role: 'clearer', cluster: 'equation/error UI helper cluster' },
  { pc: 0x06B9CF, op: 'BIT', role: 'test', cluster: 'equation/error UI helper cluster' },
]);

const BIT7_OWNER_BY_PC = new Map(BIT7_OWNERS.map((owner) => [owner.pc, owner]));

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

function blockOwnerPcs(addr, meta) {
  const hits = new Set();
  for (const insn of meta?.instructions ?? []) {
    const pc = Number.isInteger(insn.pc) ? insn.pc : addr + (insn.offset ?? 0);
    if (BIT7_OWNER_BY_PC.has(pc)) hits.add(pc);
  }
  if (hits.size === 0 && BIT7_OWNER_BY_PC.has(addr)) hits.add(addr);
  return [...hits].sort((a, b) => a - b);
}

function makeOwnerMap() {
  return new Map(BIT7_OWNERS.map((owner) => [owner.pc, {
    ...owner,
    count: 0,
    segments: {},
    first: null,
    samples: [],
  }]));
}

function recordOwnerHit(ownerMap, ownerPc, context) {
  const row = ownerMap.get(ownerPc);
  if (!row) throw new Error(`unexpected owner PC ${hex(ownerPc)}`);
  row.count += 1;
  row.segments[context.segment] = (row.segments[context.segment] ?? 0) + 1;
  const sample = {
    run: context.run,
    segment: context.segment,
    block: context.block,
    blockPc: hex(context.blockPc),
    steps: context.steps,
    D000C2: hex(context.mem[0xD000C2], 2),
    D0243A: hex(read24(context.mem, 0xD0243A)),
    buffer: formatBytes(readBuffer(context.mem, 8)),
  };
  row.first ??= sample;
  if (row.samples.length < 5) row.samples.push(sample);
}

function ownerRows(ownerMap) {
  return [...ownerMap.values()];
}

function mergeOwnerRows(rows) {
  const merged = makeOwnerMap();
  for (const source of rows) {
    for (const row of source.ownerHits) {
      const target = merged.get(row.pc);
      target.count += row.count;
      for (const [segment, count] of Object.entries(row.segments)) {
        target.segments[segment] = (target.segments[segment] ?? 0) + count;
      }
      target.first ??= row.first;
      for (const sample of row.samples) {
        if (target.samples.length < 5) target.samples.push(sample);
      }
    }
  }
  return ownerRows(merged);
}

function hitSummary(rows) {
  return rows.filter((row) => row.count > 0)
    .map((row) => `${hex(row.pc)} ${row.op}(${row.count})`)
    .join(', ') || 'none';
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
  let gateSeen = false;
  const ownerMap = makeOwnerMap();
  const runLabel = policy.label ?? `${policy.name}:${key.name}`;

  function segmentFor(addr) {
    if (addr === WATCH.preOwnerFlagGate) return 'at_0158de_gate';
    if (insertBlock == null) return policy.followup ? 'followup_before_insert' : 'before_insert';
    if (!gateSeen) return policy.followup ? 'followup_after_insert_before_0158de' : 'after_insert_before_0158de';
    return policy.followup ? 'followup_after_0158de' : 'after_0158de';
  }

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
          gateSeen = true;
        }

        const segment = segmentFor(addr);
        for (const ownerPc of blockOwnerPcs(addr, meta)) {
          recordOwnerHit(ownerMap, ownerPc, {
            run: runLabel,
            segment,
            block: blocks,
            blockPc: addr,
            steps,
            mem,
          });
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
    ownerHits: ownerRows(ownerMap),
    after: snap(mem, cpu),
    mem: mem.slice(),
    cpu: captureCpu(cpu),
    events,
  };
}

function runSettle(machine, start, label) {
  const { mem, peripherals, executor, cpu } = machine;
  mem.set(start.mem);
  restoreCpu(cpu, start.cpu);
  resetKeyboard(peripherals);
  peripherals.setTimerEnabled(false);
  releaseKey(peripherals, mem, DIGIT2);

  const ownerMap = makeOwnerMap();
  const startPc = cpu.pc & 0xFFFFFF;
  const counts = {
    gate: 0,
    preOwnerCall: 0,
    cleanupOwner: 0,
    cleanupEntry: 0,
    wipe: 0,
  };
  let blocks = 0;
  let lastPc = startPc;

  const result = executor.runFrom(startPc, 'adl', {
    maxSteps: 120000,
    maxLoopIterations: 30000,
    diHaltBypass: false,
    onBlock(pc, mode, meta, steps) {
      blocks += 1;
      const addr = pc & 0xFFFFFF;
      lastPc = addr;
      if (addr === WATCH.preOwnerFlagGate) counts.gate += 1;
      if (addr === WATCH.preOwnerCall) counts.preOwnerCall += 1;
      if (addr === WATCH.cleanupOwner) counts.cleanupOwner += 1;
      if (addr === WATCH.cleanupEntry) counts.cleanupEntry += 1;
      if (addr === WATCH.wipe) counts.wipe += 1;
      for (const ownerPc of blockOwnerPcs(addr, meta)) {
        recordOwnerHit(ownerMap, ownerPc, {
          run: label,
          segment: 'settle_after_gate_return',
          block: blocks,
          blockPc: addr,
          steps,
          mem,
        });
      }
    },
  });

  return {
    key: 'settle',
    policy: label,
    termination: result.termination,
    steps: result.steps,
    blocks,
    lastPc: hex(lastPc),
    counts,
    ownerHits: ownerRows(ownerMap),
    after: snap(mem, cpu),
    mem: mem.slice(),
    cpu: captureCpu(cpu),
    events: [],
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
          label: `sequence-gate-step${rows.length + 1}-${key.name}`,
          releaseAtInsert: true,
          setD000C2Bit7AtGate: true,
          stopAtGateReturn: true,
          stopOnBypassFailure: true,
          clearD000C2BeforeRun: rows.length === 0,
        }
      : {
          name: 'early',
          label: `sequence-early-step${rows.length + 1}-${key.name}`,
          releaseAtInsert: true,
          stopAtPreOwnerCall: true,
          clearD000C2BeforeRun: rows.length === 0,
        });
    rows.push(row);
    state = { mem: row.mem, cpu: row.cpu };
  }

  return { rows, final: rows.at(-1), expectedPrefix: [...expectedPrefix] };
}

function runRowMd(row, assertion = '') {
  const counts = row.counts ?? {};
  return [
    row.policy,
    row.key,
    row.termination,
    row.steps ?? '-',
    row.insertBlock ?? '-',
    row.gateSetBlock ?? '-',
    counts.gate ?? '-',
    counts.preOwnerCall ?? '-',
    counts.cleanupOwner ?? '-',
    counts.cleanupEntry ?? '-',
    counts.wipe ?? '-',
    row.after.D000C2,
    row.after.D0243A,
    row.after.buffer,
    hitSummary(row.ownerHits),
    assertion,
  ].join(' | ');
}

function ownerHitMd(row) {
  const first = row.first;
  return [
    hex(row.pc),
    row.op,
    row.role,
    row.cluster,
    row.count,
    Object.entries(row.segments).map(([segment, count]) => `${segment}:${count}`).join(', ') || '-',
    first ? first.run : '-',
    first ? first.segment : '-',
    first ? first.D000C2 : '-',
    first ? first.buffer : '-',
  ].join(' | ');
}

function summarizeRun(row) {
  return {
    key: row.key,
    policy: row.policy,
    termination: row.termination,
    steps: row.steps,
    insertBlock: row.insertBlock ?? null,
    gateSetBlock: row.gateSetBlock ?? null,
    counts: row.counts ?? {},
    after: row.after,
    ownerHits: row.ownerHits
      .filter((hit) => hit.count > 0)
      .map((hit) => ({
        pc: hex(hit.pc),
        op: hit.op,
        role: hit.role,
        cluster: hit.cluster,
        count: hit.count,
        segments: hit.segments,
        samples: hit.samples,
      })),
    events: row.events,
  };
}

function buildReport(data) {
  const hitRows = data.mergedOwnerHits.filter((row) => row.count > 0);
  const coldRows = data.mergedOwnerHits.filter((row) => row.count === 0);
  const lines = [
    '# Phase 689: Dynamic D000C2 Bit7 Owner-Hit Map',
    '',
    'Probe: `probe-phase689-d000c2-owner-dynamic.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase689-d000c2-owner-dynamic.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}`,
    `- VAT snapshot captured: ${data.vatSnapshotCaptured}`,
    `- Static bit7 owners instrumented: ${BIT7_OWNERS.length}`,
    `- Dynamic owners hit: ${hitRows.length}/${BIT7_OWNERS.length} (${hitRows.map((row) => hex(row.pc)).join(', ') || 'none'})`,
    `- Digit2 early/gate equivalence: ${data.assertions.digit2EarlyGateEquivalent}`,
    `- 2+3 gate sequence: ${data.assertions.sequenceGateClean}`,
    `- Follow-up Digit2 gate insert: ${data.assertions.followupGateClean}`,
    `- Stopped browser inserts only hit the 0x0158DE gate test: ${data.assertions.stoppedRunsOnlyGateTest}`,
    `- Continuing after gate return enters destructive cleanup/wipe: ${data.assertions.settleDestructiveObserved}`,
    `- Main finding: ${data.finding}`,
    `- Browser policy decision: ${data.policyDecision}`,
    '',
    '## Browser Recipe Runs',
    '',
    '| policy | key | termination | steps | insert block | gate set block | gate hits | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D0243A | buffer | owner hits | assertion |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|',
    `| ${runRowMd(data.digit2.early, `cleanEarly=${data.assertions.digit2EarlyClean}`)} |`,
    `| ${runRowMd(data.digit2.gate, `cleanGate=${data.assertions.digit2GateClean}; eq=${data.assertions.digit2EarlyGateEquivalent}`)} |`,
    `| ${runRowMd(data.digit2.settle, `destructiveSettle=${data.assertions.digit2SettleDestructive}`)} |`,
    '',
    '## Gate Sequence And Follow-Up',
    '',
    `Sequence: ${data.sequence.keys.join(' ')}`,
    '',
    '| policy | key | termination | steps | insert block | gate set block | gate hits | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D0243A | buffer | owner hits | assertion |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|',
  ];

  for (const row of data.sequence.gate.rows) {
    lines.push(`| ${runRowMd(row, `cleanGate=${isCleanGate(row)}`)} |`);
  }
  lines.push(`| ${runRowMd(data.sequence.settle, `destructiveSettle=${data.assertions.sequenceSettleDestructive}`)} |`);
  lines.push(`| ${runRowMd(data.followup.gate, `cleanGate=${data.assertions.followupGateClean}`)} |`);
  lines.push(`| ${runRowMd(data.followup.settle, `destructiveSettle=${data.assertions.followupSettleDestructive}`)} |`);

  lines.push(
    '',
    '## Dynamic Owner Hits',
    '',
    '| pc | op | role | cluster | hits | segments | first run | first segment | first D000C2 | first buffer |',
    '|---|---|---|---|---:|---|---|---|---|---|',
  );
  for (const row of hitRows) lines.push(`| ${ownerHitMd(row)} |`);

  lines.push(
    '',
    '## Owners Not Reached',
    '',
    coldRows.map((row) => `- ${hex(row.pc)} ${row.op} ${row.role} (${row.cluster})`).join('\n') || '- none',
    '',
    '## Interpretation',
    '',
    `- The dynamic browser recipe hit ${hitRows.length} bit7 owner site(s): ${hitRows.map((row) => `${hex(row.pc)} ${row.op}`).join(', ') || 'none'}.`,
    '- Stopped browser-style insertions only hit `0x0158E3` (`BIT 7,(IY+66)`) at the targeted `0x0158DE` gate. No normal `SET 7` or `RES 7` owner fires before the safe gate-return stop.',
    '- Bounded continuation after `0x0013DA` does hit normal clearers (`0x00186A`, then `0x005BB6`) and clears `D000C2` to `0x00`, but it also falls through `0x0158E8 -> 0x0158BC -> 0x001879 -> 0x0018F8` and wipes the live edit/VAT context. That is not a safe settling path.',
    '- Browser integration should set bit7 only transiently for the `0x0158DE` `RET NZ`, stop at the `0x0013DA` gate return, and restore the previous `D000C2` bit7 value in browser-managed state. It should not leave bit7 set and should not continue into the low-ROM settle/cleanup path.',
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

console.log('phase689: dynamic D000C2 bit7 owner-hit map');
const machine = bootBrowserSeededState();
const base = {
  mem: machine.mem.slice(),
  cpu: captureCpu(machine.cpu),
  snap: snap(machine.mem, machine.cpu),
};

const digit2Early = runInsert(machine, base, DIGIT2, [DIGIT2.expected], {
  name: 'digit2-early-stop',
  label: 'digit2-early-stop',
  releaseAtInsert: true,
  stopAtPreOwnerCall: true,
  clearD000C2BeforeRun: true,
});
const digit2Gate = runInsert(machine, base, DIGIT2, [DIGIT2.expected], {
  name: 'digit2-gate-bypass',
  label: 'digit2-gate-bypass',
  releaseAtInsert: true,
  setD000C2Bit7AtGate: true,
  stopAtGateReturn: true,
  stopOnBypassFailure: true,
  clearD000C2BeforeRun: true,
});
const digit2Settle = runSettle(machine, { mem: digit2Gate.mem, cpu: digit2Gate.cpu }, 'digit2-gate-settle');

const gateSequence = runPolicySequence(machine, base, SEQUENCE, 'gate');
const sequenceSettle = runSettle(machine, { mem: gateSequence.final.mem, cpu: gateSequence.final.cpu }, 'sequence-gate-settle');
const followupPrefix = [...gateSequence.expectedPrefix, DIGIT2.expected];
const followupGate = runInsert(machine, { mem: gateSequence.final.mem, cpu: gateSequence.final.cpu }, DIGIT2, followupPrefix, {
  name: 'sequence-followup-digit2-gate',
  label: 'sequence-followup-digit2-gate',
  followup: true,
  releaseAtInsert: true,
  setD000C2Bit7AtGate: true,
  stopAtGateReturn: true,
  stopOnBypassFailure: true,
});
const followupSettle = runSettle(machine, { mem: followupGate.mem, cpu: followupGate.cpu }, 'sequence-followup-digit2-settle');

const allRuns = [
  digit2Early,
  digit2Gate,
  digit2Settle,
  ...gateSequence.rows,
  sequenceSettle,
  followupGate,
  followupSettle,
];
const mergedOwnerHits = mergeOwnerRows(allRuns);
const liveOwnerHits = mergedOwnerHits.filter((row) => row.count > 0);
const stoppedRuns = [digit2Early, digit2Gate, ...gateSequence.rows, followupGate];
const stoppedOwnerHits = mergeOwnerRows(stoppedRuns).filter((row) => row.count > 0);

const settleDestructive = (row) => !['error', 'missing_block', 'no_return'].includes(row.termination)
  && (row.counts?.preOwnerCall ?? 0) >= 1
  && (row.counts?.cleanupOwner ?? 0) >= 1
  && (row.counts?.cleanupEntry ?? 0) >= 1
  && (row.counts?.wipe ?? 0) >= 1
  && row.after.D000C2 === hex(0x00, 2)
  && row.after.D007CA === hex(0)
  && row.after.D0243A === hex(0);

const assertions = {
  allOwnersInstrumented: BIT7_OWNERS.length === 31,
  digit2EarlyClean: isCleanEarly(digit2Early),
  digit2GateClean: isCleanGate(digit2Gate),
  digit2EarlyGateEquivalent: sameCoreState(digit2Early, digit2Gate),
  digit2SettleDestructive: settleDestructive(digit2Settle),
  sequenceGateClean: gateSequence.rows.every(isCleanGate),
  sequenceFinalBuffer: gateSequence.final.after.buffer.startsWith('0x32 0x9E 0x33'),
  sequenceSettleDestructive: settleDestructive(sequenceSettle),
  followupGateClean: isCleanGate(followupGate),
  followupBuffer: followupGate.after.buffer.startsWith('0x32 0x9E 0x33 0x32'),
  followupSettleDestructive: settleDestructive(followupSettle),
  stoppedRunsOnlyGateTest: stoppedOwnerHits.length === 1 && stoppedOwnerHits[0].pc === 0x0158E3 && stoppedOwnerHits[0].role === 'test',
};
assertions.settleDestructiveObserved = assertions.digit2SettleDestructive
  && assertions.sequenceSettleDestructive
  && assertions.followupSettleDestructive;

const pass = Object.values(assertions).every(Boolean);
const policyDecision = 'Stop at the 0x0013DA gate return and restore the previous D000C2 bit7 value; bounded continuation clears bit7 only by entering destructive cleanup/wipe.';
const finding = 'stopped browser insertions hit only the targeted 0x0158E3 bit7 test, while post-return continuation hits 0x00186A/0x005BB6 clearers only as part of the destructive 0x0158BC -> 0x001879 -> 0x0018F8 cleanup path';

const compact = {
  phases: machine.phases.map(([name, result]) => ({
    name,
    termination: result.termination,
    steps: result.steps,
    lastPc: hex(result.lastPc & 0xFFFFFF),
  })),
  base: base.snap,
  assertions,
  policyDecision,
  dynamicOwnerHits: liveOwnerHits.map((row) => ({
    pc: hex(row.pc),
    op: row.op,
    role: row.role,
    cluster: row.cluster,
    count: row.count,
    segments: row.segments,
    samples: row.samples,
  })),
  digit2: {
    early: summarizeRun(digit2Early),
    gate: summarizeRun(digit2Gate),
    settle: summarizeRun(digit2Settle),
  },
  sequence: {
    keys: SEQUENCE.map((key) => key.name),
    expectedPrefix: formatBytes(gateSequence.expectedPrefix),
    gate: gateSequence.rows.map(summarizeRun),
    settle: summarizeRun(sequenceSettle),
  },
  followup: {
    expectedPrefix: formatBytes(followupPrefix),
    gate: summarizeRun(followupGate),
    settle: summarizeRun(followupSettle),
  },
};

const report = {
  pass,
  vatSnapshotCaptured: machine.vatSnapshotCaptured,
  assertions,
  policyDecision,
  finding,
  digit2: { early: digit2Early, gate: digit2Gate, settle: digit2Settle },
  sequence: {
    keys: SEQUENCE.map((key) => key.name),
    gate: gateSequence,
    settle: sequenceSettle,
  },
  followup: { gate: followupGate, settle: followupSettle },
  mergedOwnerHits,
  compact,
};

fs.writeFileSync(REPORT_PATH, buildReport(report));

console.log(`digit2: early=${digit2Early.termination}/${digit2Early.steps} gate=${digit2Gate.termination}/${digit2Gate.steps} eq=${assertions.digit2EarlyGateEquivalent} settle=${digit2Settle.termination}/${digit2Settle.steps}`);
console.log(`sequence: gateFinal=${gateSequence.final.termination} followup=${followupGate.termination}/${followupGate.steps} pass=${assertions.sequenceGateClean && assertions.followupGateClean}`);
console.log(`owners hit: ${hitSummary(mergedOwnerHits)}`);
console.log(`decision=${policyDecision}`);
console.log(`wrote ${path.basename(REPORT_PATH)}`);
if (!pass) process.exitCode = 1;

if (!pass) process.exitCode = 1;

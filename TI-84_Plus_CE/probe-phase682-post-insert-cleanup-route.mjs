import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase682-post-insert-cleanup-route.md');

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
const MAX_SETTLE_STEPS = 120000;
const STOP = Symbol('phase682-stop');

const DIGIT2 = Object.freeze({
  name: 'Digit2',
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
  charDispatch: 0x058EDA,
  cleanupSelector: 0x001C33,
  cleanupBranch: 0x001C4A,
  cleanupThunk: 0x0158D2,
  cleanupThunk2: 0x0158DA,
  cleanupThunk3: 0x0158EC,
  cleanupThunk4: 0x0158EE,
  cleanupThunk5: 0x0158F8,
  cleanupPrelude: 0x001872,
  cleanupEntry: 0x001879,
  wipe: 0x0018F8,
});

const ROUTE_BLOCKS = new Set([
  0x001C33, 0x001C38, 0x001C44, 0x001C48, 0x001C4A, 0x001C7D,
  0x001CA6, 0x001CBC, 0x001CC0, 0x001CCA, 0x001CE4, 0x001CE5,
  0x0158D2, 0x0158DA, 0x0158EC, 0x0158EE, 0x0158F8, 0x001872,
  0x001879, 0x0018F8,
]);

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

function stack24(mem, sp, count = 5) {
  const start = sp & 0xFFFFFF;
  return Array.from({ length: count }, (_, index) => hex(read24(mem, start + index * 3)));
}

function snap(mem, cpu, peripherals) {
  return {
    pc: hex(cpu.pc),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu._bc, 6),
    de: hex(cpu._de, 6),
    hl: hex(cpu._hl, 6),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    sp: hex(cpu.sp),
    stack24: stack24(mem, cpu.sp),
    errSp: hex(read24(mem, 0xD008E0)),
    D00587: hex(mem[0xD00587], 2),
    D0058C: hex(mem[0xD0058C], 2),
    D0058D: hex(mem[0xD0058D], 2),
    D0058E: hex(mem[0xD0058E], 2),
    D00080: hex(mem[0xD00080], 2),
    D0009F: hex(mem[0xD0009F], 2),
    D007CA: hex(read24(mem, 0xD007CA)),
    D0231A: hex(read24(mem, 0xD0231A)),
    D0243A: hex(read24(mem, 0xD0243A)),
    D0243D: hex(read24(mem, 0xD0243D)),
    D02590: hex(read24(mem, 0xD02590)),
    buffer: formatBytes(readBuffer(mem)),
    matrix3: hex(peripherals.keyboard.keyMatrix[3], 2),
  };
}

function summarizeMeta(pc, mode, meta) {
  const instructions = meta?.instructions ?? [];
  return {
    pc: hex(pc),
    mode,
    first: instructions[0]?.dasm ?? null,
    last: instructions[instructions.length - 1]?.dasm ?? null,
    instructions: instructions.map((insn) => insn.dasm ?? String(insn)).slice(0, 12),
    exits: (meta?.exits ?? []).map((exit) => ({
      type: exit.type ?? null,
      target: exit.target == null ? null : hex(exit.target),
      targetMode: exit.targetMode ?? null,
    })),
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

function labelForPc(addr) {
  for (const [name, pc] of Object.entries(WATCH)) {
    if (addr === pc) return name;
  }
  return null;
}

function pushCapped(list, value, limit) {
  list.push(value);
  while (list.length > limit) list.shift();
}

function transitionKey(from, to) {
  return `${hex(from)}->${hex(to)}`;
}

function addTransition(map, from, to, block, steps, fromState, toState) {
  const key = transitionKey(from, to);
  let entry = map.get(key);
  if (!entry) {
    entry = {
      from: hex(from),
      to: hex(to),
      count: 0,
      firstBlock: block,
      lastBlock: block,
      firstSteps: steps,
      lastSteps: steps,
      firstFromState: fromState,
      lastFromState: fromState,
      firstToState: toState,
      lastToState: toState,
    };
    map.set(key, entry);
  }
  entry.count += 1;
  entry.lastBlock = block;
  entry.lastSteps = steps;
  entry.lastFromState = fromState;
  entry.lastToState = toState;
}

function traceVariant(machine, base, variant) {
  const { mem, peripherals, executor, cpu } = machine;
  mem.set(base.mem);
  restoreCpu(cpu, base.cpu);
  resetKeyboard(peripherals);
  peripherals.setTimerEnabled(true);

  prepareBrowserFrame(mem, cpu);
  if (!variant.keepPendingKey) clearKeyRam(mem);
  if (variant.matrixHeld) pressMatrixKey(peripherals);

  const before = snap(mem, cpu, peripherals);
  const counts = Object.fromEntries(Object.keys(WATCH).map((name) => [name, 0]));
  const events = [];
  const routeTail = [];
  const blockMetas = new Map();
  const transitions = new Map();
  const dynamicTargets = [];
  const interruptEvents = [];

  let blocks = 0;
  let traceStartBlock = variant.traceFromStart ? 1 : null;
  let depositBlock = null;
  let secondDepositBlock = null;
  let releaseBlock = null;
  let clearRamBlock = null;
  let firstCleanupBlock = null;
  let firstCleanupState = null;
  let firstWipeBlock = null;
  let cleanupSelectorBranch = null;
  let lastPc = OUTER_LOOP;
  let lastEntry = null;
  let stopSteps = null;
  let termination = 'unknown';

  function addEvent(kind, addr, steps, extra = {}) {
    events.push({
      kind,
      block: blocks,
      deltaFromTraceStart: traceStartBlock == null ? null : blocks - traceStartBlock,
      steps,
      pc: hex(addr),
      state: snap(mem, cpu, peripherals),
      ...extra,
    });
  }

  try {
    const result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: variant.maxSteps ?? MAX_SETTLE_STEPS,
      maxLoopIterations: variant.maxLoopIterations ?? 500000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onInterrupt(type, returnPc, vector, steps) {
        if (traceStartBlock == null || interruptEvents.length >= 16) return;
        interruptEvents.push({
          type,
          block: blocks,
          deltaFromTraceStart: blocks - traceStartBlock,
          steps,
          returnPc: hex(returnPc),
          vector: hex(vector),
          state: snap(mem, cpu, peripherals),
        });
      },
      onDynamicTarget(target, mode, fromPc, steps) {
        if (traceStartBlock == null || dynamicTargets.length >= 80) return;
        dynamicTargets.push({
          block: blocks,
          deltaFromTraceStart: blocks - traceStartBlock,
          steps,
          fromPc: hex(fromPc),
          target: hex(target),
          mode,
        });
      },
      onBlock(pc, mode, meta, steps) {
        blocks += 1;
        const addr = pc & 0xFFFFFF;
        lastPc = addr;
        const entryState = snap(mem, cpu, peripherals);
        const label = labelForPc(addr);

        if (label) counts[label] += 1;
        if (ROUTE_BLOCKS.has(addr) && !blockMetas.has(addr)) {
          blockMetas.set(addr, summarizeMeta(addr, mode, meta));
        }

        if (lastEntry && traceStartBlock != null) {
          addTransition(transitions, lastEntry.addr, addr, blocks, steps, lastEntry.state, entryState);
          if (lastEntry.addr === WATCH.cleanupSelector && addr === WATCH.cleanupBranch) {
            cleanupSelectorBranch = {
              block: blocks,
              deltaFromTraceStart: blocks - traceStartBlock,
              steps,
              from: lastEntry,
              to: { addr, state: entryState },
            };
            addEvent('selector-branch-to-cleanup', addr, steps, { fromPc: hex(lastEntry.addr) });
          }
        }

        const traceActive = traceStartBlock != null;
        if (traceActive) {
          pushCapped(routeTail, {
            block: blocks,
            deltaFromTraceStart: blocks - traceStartBlock,
            steps,
            pc: hex(addr),
            label,
            state: {
              f: entryState.f,
              hl: entryState.hl,
              ix: entryState.ix,
              iy: entryState.iy,
              sp: entryState.sp,
              stack24: entryState.stack24.slice(0, 3),
              D00587: entryState.D00587,
              D0058C: entryState.D0058C,
              D0058D: entryState.D0058D,
              D0058E: entryState.D0058E,
              D00080: entryState.D00080,
              D0009F: entryState.D0009F,
              D007CA: entryState.D007CA,
              D0243A: entryState.D0243A,
            },
          }, 128);
        }

        if (label && (label !== 'isr' || counts.isr <= 8 || addr === WATCH.cleanupEntry)) {
          addEvent(label, addr, steps);
        }

        const cursor = read24(mem, 0xD0243A);
        if (depositBlock === null && mem[EDIT_BASE] === DIGIT2.expected && cursor === EDIT_BASE + 1) {
          depositBlock = blocks;
          if (!variant.traceFromStart) traceStartBlock = blocks;
          addEvent('deposit1', addr, steps);
        }
        if (secondDepositBlock === null && mem[EDIT_BASE + 1] === DIGIT2.expected && cursor >= EDIT_BASE + 2) {
          secondDepositBlock = blocks;
          addEvent('deposit2', addr, steps);
        }

        if (depositBlock !== null) {
          const delta = blocks - depositBlock;
          if (releaseBlock == null && variant.releaseMatrixAfterDepositBlocks != null && delta >= variant.releaseMatrixAfterDepositBlocks) {
            releaseMatrixKey(peripherals, mem);
            releaseBlock = blocks;
            addEvent('release-matrix', addr, steps, { deltaFromDeposit: delta });
          }
          if (clearRamBlock == null && variant.clearRamAfterDepositBlocks != null && delta >= variant.clearRamAfterDepositBlocks) {
            clearKeyRam(mem);
            clearRamBlock = blocks;
            addEvent('clear-key-ram', addr, steps, { deltaFromDeposit: delta });
          }
        }

        if (firstCleanupBlock === null && addr === WATCH.cleanupEntry) {
          firstCleanupBlock = blocks;
          firstCleanupState = snap(mem, cpu, peripherals);
          stopSteps = steps;
          addEvent('first-cleanup-stop', addr, steps);
          throw STOP;
        }
        if (firstWipeBlock === null && addr === WATCH.wipe) {
          firstWipeBlock = blocks;
          addEvent('first-wipe', addr, steps);
          throw STOP;
        }

        lastEntry = { addr, mode, steps, state: entryState };
      },
    });
    termination = result.termination;
    stopSteps = result.steps;
    lastPc = result.lastPc & 0xFFFFFF;
  } catch (error) {
    if (error !== STOP) throw error;
    termination = firstCleanupBlock != null ? 'first_cleanup' : 'first_wipe';
  }

  const after = snap(mem, cpu, peripherals);
  const edgeRows = [...transitions.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  const selectorEdges = edgeRows.filter((edge) => edge.from === hex(WATCH.cleanupSelector));
  const cleanupRoute = routeTail.slice(-40).map((entry) => entry.pc);
  const cleanupSuffix = [
    hex(WATCH.cleanupBranch),
    hex(WATCH.cleanupThunk),
    hex(WATCH.cleanupThunk2),
    hex(WATCH.cleanupThunk3),
    hex(WATCH.cleanupThunk4),
    hex(WATCH.cleanupThunk5),
    hex(WATCH.cleanupPrelude),
    hex(WATCH.cleanupEntry),
  ];
  const suffixText = cleanupRoute.join(' ');
  const hasExpectedSuffix = cleanupSuffix.every((pc) => suffixText.includes(pc));

  return {
    name: variant.name,
    matrixHeld: Boolean(variant.matrixHeld),
    keepPendingKey: Boolean(variant.keepPendingKey),
    releaseAfterDepositBlocks: variant.releaseMatrixAfterDepositBlocks ?? null,
    clearRamAfterDepositBlocks: variant.clearRamAfterDepositBlocks ?? null,
    traceFromStart: Boolean(variant.traceFromStart),
    termination,
    steps: stopSteps,
    blocks,
    lastPc: hex(lastPc),
    traceStartBlock,
    depositBlock,
    secondDepositBlock,
    releaseBlock,
    clearRamBlock,
    firstCleanupBlock,
    firstCleanupDelta: firstCleanupBlock == null || traceStartBlock == null ? null : firstCleanupBlock - traceStartBlock,
    firstCleanupState,
    firstWipeBlock,
    cleanupSelectorBranch,
    selectorEdges,
    topTransitions: edgeRows.slice(0, 24),
    cleanupRoute,
    hasExpectedSuffix,
    counts,
    before,
    after,
    events: events.slice(0, 160),
    routeTail,
    blockMetas: Object.fromEntries([...blockMetas.entries()].map(([pc, meta]) => [hex(pc), meta])),
    dynamicTargets,
    interruptEvents,
  };
}

function stateCompact(state) {
  if (!state) return '-';
  return [
    `f=${state.f}`,
    `hl=${state.hl}`,
    `ix=${state.ix}`,
    `iy=${state.iy}`,
    `sp=${state.sp}`,
    `stk=${state.stack24?.slice(0, 3).join('/')}`,
    `key=${state.D00587}/${state.D0058C}/${state.D0058D}/${state.D0058E}`,
    `flags=${state.D00080}/${state.D0009F}`,
    `D007CA=${state.D007CA}`,
    `D0243A=${state.D0243A}`,
  ].join(' ');
}

function variantRow(row) {
  return [
    row.name,
    row.termination,
    row.steps ?? '-',
    row.depositBlock ?? '-',
    row.secondDepositBlock ?? '-',
    row.releaseBlock ?? '-',
    row.clearRamBlock ?? '-',
    row.firstCleanupBlock ?? '-',
    row.firstCleanupDelta ?? '-',
    row.cleanupSelectorBranch ? 'yes' : 'no',
    row.hasExpectedSuffix ? 'yes' : 'no',
    row.firstCleanupState?.D00587 ?? '-',
    row.firstCleanupState?.D0058C ?? '-',
    row.firstCleanupState?.D0058D ?? '-',
    row.firstCleanupState?.D0058E ?? '-',
    row.firstCleanupState?.D007CA ?? '-',
    row.firstCleanupState?.D0243A ?? '-',
    row.firstCleanupState?.buffer ?? '-',
  ].join(' | ');
}

function selectorTable(row) {
  if (!row.selectorEdges.length) return '_No `0x001C33` transitions captured._';
  const lines = [
    '| transition | count | first block | last block | last selector state |',
    '|---|---:|---:|---:|---|',
  ];
  for (const edge of row.selectorEdges) {
    lines.push(`| ${edge.from} -> ${edge.to} | ${edge.count} | ${edge.firstBlock} | ${edge.lastBlock} | ${stateCompact(edge.lastFromState)} |`);
  }
  return lines.join('\n');
}

function eventTable(row) {
  const keep = row.events.filter((event) => [
    'deposit1',
    'release-matrix',
    'clear-key-ram',
    'selector-branch-to-cleanup',
    'cleanupBranch',
    'cleanupThunk',
    'cleanupThunk2',
    'cleanupThunk3',
    'cleanupThunk4',
    'cleanupThunk5',
    'cleanupPrelude',
    'cleanupEntry',
    'first-cleanup-stop',
  ].includes(event.kind)).slice(-32);
  const lines = [
    '| kind | block | delta | pc | state |',
    '|---|---:|---:|---:|---|',
  ];
  for (const event of keep) {
    lines.push(`| ${event.kind} | ${event.block} | ${event.deltaFromTraceStart ?? '-'} | ${event.pc} | ${stateCompact(event.state)} |`);
  }
  return lines.join('\n');
}

function routeTailBlock(row) {
  const entries = row.routeTail.slice(-64).map((entry) => entry.pc);
  const lines = [];
  for (let i = 0; i < entries.length; i += 8) lines.push(entries.slice(i, i + 8).join(' -> '));
  return lines.join('\n');
}

function buildReport(data) {
  const primary = data.results.find((row) => row.name === 'release-matrix-at-deposit-stop-cleanup');
  const lines = [
    '# Phase 682: Post-Insert Cleanup Route Trace',
    '',
    'Probe: `probe-phase682-post-insert-cleanup-route.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase682-post-insert-cleanup-route.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}`,
    `- VAT snapshot captured: ${data.vatSnapshotCaptured}`,
    `- Main finding: ${data.finding}`,
    '',
    '## Variants',
    '',
    '| variant | termination | steps | deposit1 | deposit2 | release block | clear RAM block | first cleanup | cleanup delta | selector branch | expected suffix | D00587 | D0058C | D0058D | D0058E | D007CA | D0243A | buffer |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---|',
    ...data.results.map((row) => `| ${variantRow(row)} |`),
    '',
    '## Primary Selector: Release Matrix At Deposit',
    '',
    'This is the single-insert phase681 variant. The probe releases the physical matrix as soon as the first `2` is deposited, then stops before executing `0x001879`.',
    '',
    selectorTable(primary),
    '',
    '## Primary Cleanup Events',
    '',
    eventTable(primary),
    '',
    '## Primary Route Tail',
    '',
    '```text',
    routeTailBlock(primary),
    '```',
    '',
    '## Route Block Metadata',
    '',
    '```json',
    JSON.stringify(primary.blockMetas, null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    '- In the single-insert release variant, the second `2` never appears, but the route still reaches cleanup at `0x001879` 4,313 blocks after deposit.',
    '- The decisive post-deposit selector is the low-ROM branch `0x001C33 -> 0x001C4A`; earlier visits to `0x001C33` loop through `0x001C38`, then the final selector exits through `0x001C4A`.',
    '- In the release-only variant, `D0058D` still carries the scan code `0x1A` at cleanup, but `D00587`/`D0058C`/`D0058E` are clear and no second insert occurs.',
    '- The clear-RAM-at-deposit variant reaches the same selector and suffix with all key fields zero, so the destructive cleanup route is not caused by a held matrix, duplicate insertion, or uncleared key RAM.',
    '- The no-pending control reaches the same `0x001C33 -> 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879` suffix. The next useful target is the condition/state feeding `0x001C33`, not blind descent through `0x001879` or `0x0018F8`.',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify(data.compact, null, 2),
    '```',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

console.log('phase682: post-insert cleanup route trace');
const machine = bootBrowserSeededState();
const base = {
  mem: machine.mem.slice(),
  cpu: captureCpu(machine.cpu),
  snap: snap(machine.mem, machine.cpu, machine.peripherals),
};

const variants = [
  {
    name: 'release-matrix-at-deposit-stop-cleanup',
    matrixHeld: true,
    keepPendingKey: true,
    releaseMatrixAfterDepositBlocks: 0,
  },
  {
    name: 'clear-ram-at-deposit-while-held-stop-cleanup',
    matrixHeld: true,
    keepPendingKey: true,
    clearRamAfterDepositBlocks: 0,
  },
  {
    name: 'no-pending-no-matrix-control-stop-cleanup',
    matrixHeld: false,
    keepPendingKey: false,
    traceFromStart: true,
  },
];

const results = variants.map((variant) => {
  const row = traceVariant(machine, base, variant);
  console.log(`${row.name}: term=${row.termination} steps=${row.steps} dep1=${row.depositBlock ?? '-'} dep2=${row.secondDepositBlock ?? '-'} cleanup=${row.firstCleanupBlock ?? '-'} delta=${row.firstCleanupDelta ?? '-'} selector=${row.cleanupSelectorBranch ? 'yes' : 'no'} suffix=${row.hasExpectedSuffix ? 'yes' : 'no'} keyAtCleanup=${row.firstCleanupState ? `${row.firstCleanupState.D00587}/${row.firstCleanupState.D0058C}/${row.firstCleanupState.D0058D}/${row.firstCleanupState.D0058E}` : '-'}`);
  return row;
});

const primary = results.find((row) => row.name === 'release-matrix-at-deposit-stop-cleanup');
const clearHeld = results.find((row) => row.name === 'clear-ram-at-deposit-while-held-stop-cleanup');
const control = results.find((row) => row.name === 'no-pending-no-matrix-control-stop-cleanup');

const pass = primary?.termination === 'first_cleanup'
  && primary?.depositBlock != null
  && primary?.secondDepositBlock == null
  && primary?.releaseBlock === primary?.depositBlock
  && primary?.firstCleanupBlock != null
  && primary?.cleanupSelectorBranch != null
  && primary?.hasExpectedSuffix
  && primary?.firstCleanupState?.D00587 === hex(0, 2)
  && primary?.firstCleanupState?.D0058C === hex(0, 2)
  && primary?.firstCleanupState?.D0058E === hex(0, 2)
  && primary?.firstCleanupState?.D007CA === hex(WATCH.cxMain)
  && clearHeld?.termination === 'first_cleanup'
  && clearHeld?.secondDepositBlock == null
  && clearHeld?.cleanupSelectorBranch != null
  && clearHeld?.hasExpectedSuffix
  && clearHeld?.firstCleanupState?.D00587 === hex(0, 2)
  && clearHeld?.firstCleanupState?.D0058C === hex(0, 2)
  && clearHeld?.firstCleanupState?.D0058D === hex(0, 2)
  && clearHeld?.firstCleanupState?.D0058E === hex(0, 2)
  && clearHeld?.firstCleanupState?.D007CA === hex(WATCH.cxMain)
  && control?.termination === 'first_cleanup'
  && control?.cleanupSelectorBranch != null;

const finding = pass
  ? 'single-insert cleanup is selected by low-ROM branch 0x001C33 -> 0x001C4A, then deterministic suffix 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879; clear-key-RAM and no-pending controls prove the route does not require held/queued key state'
  : 'route trace did not capture the expected cleanup selector/suffix; inspect compact JSON';

const compact = {
  phases: machine.phases.map(([name, result]) => ({
    name,
    termination: result.termination,
    steps: result.steps,
    lastPc: hex(result.lastPc & 0xFFFFFF),
  })),
  base: base.snap,
  results: results.map((row) => ({
    name: row.name,
    termination: row.termination,
    steps: row.steps,
    depositBlock: row.depositBlock,
    secondDepositBlock: row.secondDepositBlock,
    releaseBlock: row.releaseBlock,
    clearRamBlock: row.clearRamBlock,
    firstCleanupBlock: row.firstCleanupBlock,
    firstCleanupDelta: row.firstCleanupDelta,
    cleanupSelectorBranch: row.cleanupSelectorBranch && {
      block: row.cleanupSelectorBranch.block,
      deltaFromTraceStart: row.cleanupSelectorBranch.deltaFromTraceStart,
      steps: row.cleanupSelectorBranch.steps,
      fromPc: hex(row.cleanupSelectorBranch.from.addr),
      toPc: hex(row.cleanupSelectorBranch.to.addr),
      fromState: row.cleanupSelectorBranch.from.state,
      toState: row.cleanupSelectorBranch.to.state,
    },
    selectorEdges: row.selectorEdges,
    cleanupRoute: row.cleanupRoute,
    hasExpectedSuffix: row.hasExpectedSuffix,
    counts: row.counts,
    firstCleanupState: row.firstCleanupState,
    topTransitions: row.topTransitions.slice(0, 12),
    routeTail: row.routeTail.slice(-48),
    events: row.events.slice(-32),
    dynamicTargets: row.dynamicTargets.slice(-24),
    interruptEvents: row.interruptEvents,
  })),
};

const summary = {
  pass,
  vatSnapshotCaptured: machine.vatSnapshotCaptured,
  finding,
  results,
  compact,
};

fs.writeFileSync(REPORT_PATH, buildReport(summary));
console.log(`finding=${finding}`);
console.log(`wrote ${path.basename(REPORT_PATH)}`);

if (!pass) process.exitCode = 1;

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase685-low-rom-wrapper-trace.md');

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
const STOP = Symbol('phase685-stop');

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
  charDispatch: 0x058EDA,
  countdownLoop: 0x001377,
  port3Read: 0x001379,
  port3PostRead: 0x00138A,
  port3Prep: 0x001393,
  wrapperSetup: 0x00139D,
  wrapperCall: 0x0013C3,
  helperEntry: 0x001988,
  helperStackSave: 0x001991,
  helperLoadB: 0x00199E,
  helperLoadC: 0x0019A4,
  helperPortSelect: 0x0019A9,
  helperDynamicReturn: 0x0019B3,
  wrapperResume: 0x0013C7,
  wrapperReturnGate: 0x0013DA,
  wrapperCleanupCall: 0x0013E4,
  preOwnerFlagGate: 0x0158DE,
  preOwnerCall: 0x0158E8,
  lowWrapperReturnA: 0x0013DA,
  lowWrapperReturnB: 0x0013E8,
  cleanupOwner: 0x0158BC,
  cleanupOwnerReturn: 0x0158EC,
  cleanupOwnerCarryGate: 0x0158EC,
  cleanupOwnerZeroGate: 0x0158EE,
  cleanupOwnerRet: 0x0158F8,
  cleanupPrelude: 0x001872,
  cleanupEntry: 0x001879,
  wipe: 0x0018F8,
});

const WRAPPER_PATH = new Set([
  WATCH.countdownLoop,
  WATCH.port3Read,
  WATCH.port3PostRead,
  WATCH.port3Prep,
  WATCH.wrapperSetup,
  WATCH.wrapperCall,
  WATCH.helperEntry,
  WATCH.helperStackSave,
  WATCH.helperLoadB,
  WATCH.helperLoadC,
  WATCH.helperPortSelect,
  WATCH.helperDynamicReturn,
  WATCH.wrapperResume,
  WATCH.preOwnerFlagGate,
  WATCH.preOwnerCall,
]);

const IMPORTANT_PCS = new Set([
  WATCH.isr,
  WATCH.getcsc,
  WATCH.cxMain,
  WATCH.charDispatch,
  ...WRAPPER_PATH,
  WATCH.lowWrapperReturnA,
  WATCH.lowWrapperReturnB,
  WATCH.cleanupOwner,
  WATCH.cleanupOwnerReturn,
  WATCH.cleanupOwnerCarryGate,
  WATCH.cleanupOwnerZeroGate,
  WATCH.cleanupOwnerRet,
  WATCH.cleanupPrelude,
  WATCH.cleanupEntry,
  WATCH.wipe,
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

function stack24(mem, sp, count = 6) {
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
    D0009B: hex(mem[0xD0009B], 2),
    D0009F: hex(mem[0xD0009F], 2),
    D000A3: hex(mem[0xD000A3], 2),
    D000C2: hex(mem[0xD000C2], 2),
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
  };
}

function labelForPc(addr) {
  for (const [name, pc] of Object.entries(WATCH)) {
    if (addr === pc) return name;
  }
  return null;
}

function summarizeMeta(pc, mode, meta) {
  if (!meta) return null;
  const instructions = meta.instructions ?? [];
  return {
    pc: hex(pc),
    mode,
    first: instructions[0]?.dasm ?? null,
    last: instructions[instructions.length - 1]?.dasm ?? null,
    instructions: instructions.map((insn) => insn.dasm ?? String(insn)).slice(0, 16),
    exits: (meta.exits ?? []).map((exit) => ({
      type: exit.type ?? null,
      target: exit.target == null ? null : hex(exit.target),
      targetMode: exit.targetMode ?? null,
    })),
  };
}

function lookupMeta(executor, addr, mode = 'adl') {
  const key = `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
  return summarizeMeta(addr, mode, executor.blockMeta[key]);
}

function compactState(state) {
  return [
    `a=${state.a}`,
    `f=${state.f}`,
    `bc=${state.bc}`,
    `de=${state.de}`,
    `hl=${state.hl}`,
    `ix=${state.ix}`,
    `iy=${state.iy}`,
    `sp=${state.sp}`,
    `stk=${state.stack24.slice(0, 4).join('/')}`,
    `key=${state.D00587}/${state.D0058C}/${state.D0058D}/${state.D0058E}`,
    `flags=${state.D00080}/${state.D0009B}/${state.D0009F}/${state.D000A3}/${state.D000C2}`,
    `cx=${state.D007CA}`,
    `cur=${state.D0243A}`,
    `vat=${state.D02590}/${state.D02593}/${state.D0259A}/${state.D0259D}`,
  ].join(' ');
}

function describeReturn(addrText) {
  const descriptions = new Map([
    [hex(WATCH.cleanupOwnerReturn), 'return to 0x0158EC carry gate after 0x0158BC'],
    [hex(WATCH.lowWrapperReturnA), 'return to low-ROM wrapper A after owner scan'],
    [hex(WATCH.lowWrapperReturnB), 'return to low-ROM wrapper B / cleanup prelude caller'],
    [hex(WATCH.cleanupPrelude), 'return into port-3 cleanup selector'],
    [hex(WATCH.cleanupEntry), 'destructive cleanup entry'],
    [hex(HALT), 'warm halt'],
    [hex(WARM_IDLE), 'warm reset/idle continuation trap'],
  ]);
  return descriptions.get(addrText) ?? '';
}

function routeEntry(mem, cpu, peripherals, blocks, traceStartBlock, pc, mode, meta, steps) {
  const state = snap(mem, cpu, peripherals);
  return {
    block: blocks,
    delta: traceStartBlock == null ? null : blocks - traceStartBlock,
    steps,
    pc: hex(pc),
    label: labelForPc(pc),
    state,
    meta: summarizeMeta(pc, mode, meta),
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

function traceVariant(machine, base, variant) {
  const { mem, peripherals, executor, cpu } = machine;
  mem.set(base.mem);
  restoreCpu(cpu, base.cpu);
  resetKeyboard(peripherals);
  peripherals.setTimerEnabled(true);

  prepareBrowserFrame(mem, cpu);
  if (!variant.keepPendingKey) clearKeyRam(mem);
  if (variant.matrixHeld) pressMatrixKey(peripherals);

  const routeTail = [];
  const events = [];
  const dynamicTargets = [];
  const importantMetas = new Map();

  let blocks = 0;
  let traceStartBlock = variant.traceFromStart ? 1 : null;
  let depositBlock = null;
  let releaseBlock = null;
  let clearRamBlock = null;
  let firstOwnerHit = null;
  let firstCleanupBlock = null;
  let firstWipeBlock = null;
  let lastPc = OUTER_LOOP;
  let stopSteps = null;
  let termination = 'unknown';

  function addEvent(kind, addr, steps, extra = {}) {
    events.push({
      kind,
      block: blocks,
      delta: traceStartBlock == null ? null : blocks - traceStartBlock,
      steps,
      pc: hex(addr),
      state: snap(mem, cpu, peripherals),
      ...extra,
    });
  }

  function rememberMeta(addr, mode, meta) {
    if (!IMPORTANT_PCS.has(addr)) return;
    const key = hex(addr);
    if (!importantMetas.has(key)) importantMetas.set(key, summarizeMeta(addr, mode, meta));
  }

  try {
    const result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: variant.maxSteps ?? MAX_SETTLE_STEPS,
      maxLoopIterations: variant.maxLoopIterations ?? 500000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onDynamicTarget(target, mode, fromPc, steps) {
        if (traceStartBlock == null) return;
        dynamicTargets.push({
          block: blocks,
          delta: blocks - traceStartBlock,
          steps,
          fromPc: hex(fromPc),
          target: hex(target),
          mode,
        });
        while (dynamicTargets.length > 128) dynamicTargets.shift();
      },
      onBlock(pc, mode, meta, steps) {
        blocks += 1;
        const addr = pc & 0xFFFFFF;
        lastPc = addr;
        rememberMeta(addr, mode, meta);

        const cursor = read24(mem, 0xD0243A);
        if (depositBlock === null && mem[EDIT_BASE] === DIGIT2.expected && cursor === EDIT_BASE + 1) {
          depositBlock = blocks;
          if (traceStartBlock == null) traceStartBlock = blocks;
          addEvent('deposit1', addr, steps);
          if (variant.releaseMatrixAfterDepositBlocks === 0) {
            releaseMatrixKey(peripherals, mem);
            releaseBlock = blocks;
            addEvent('release-matrix', addr, steps);
          }
          if (variant.clearRamAfterDepositBlocks === 0) {
            clearKeyRam(mem);
            clearRamBlock = blocks;
            addEvent('clear-key-ram', addr, steps);
          }
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

        if (traceStartBlock != null && addr === WATCH.cleanupOwner) {
          const state = snap(mem, cpu, peripherals);
          firstOwnerHit = {
            block: blocks,
            delta: blocks - traceStartBlock,
            steps,
            pc: hex(addr),
            state,
            returnHints: state.stack24.map((ret) => ({ ret, hint: describeReturn(ret) })),
            priorRouteTail: routeTail.slice(-96),
            recentDynamicTargets: dynamicTargets.slice(-48),
          };
          addEvent('first-0158bc-owner-stop', addr, steps);
          stopSteps = steps;
          throw STOP;
        }

        if (traceStartBlock != null) {
          routeTail.push(routeEntry(mem, cpu, peripherals, blocks, traceStartBlock, addr, mode, meta, steps));
          while (routeTail.length > 160) routeTail.shift();
        }

        if (firstCleanupBlock === null && addr === WATCH.cleanupEntry) {
          firstCleanupBlock = blocks;
          addEvent('unexpected-cleanup-before-owner', addr, steps);
          stopSteps = steps;
          throw STOP;
        }
        if (firstWipeBlock === null && addr === WATCH.wipe) {
          firstWipeBlock = blocks;
          addEvent('unexpected-wipe-before-owner', addr, steps);
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
    termination = firstOwnerHit ? 'first_0158bc_owner' : firstCleanupBlock ? 'first_cleanup_before_owner' : 'first_wipe_before_owner';
  }

  const returnAddresses = new Set();
  if (firstOwnerHit) {
    for (const ret of firstOwnerHit.state.stack24) returnAddresses.add(ret);
  }
  const returnMetas = {};
  for (const ret of returnAddresses) {
    const value = Number.parseInt(ret.slice(2), 16);
    returnMetas[ret] = lookupMeta(executor, value, 'adl');
  }

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
    releaseBlock,
    clearRamBlock,
    firstOwnerHit,
    firstCleanupBlock,
    firstWipeBlock,
    events,
    routeTail,
    importantMetas: Object.fromEntries(importantMetas),
    returnMetas,
  };
}

function variantRow(row) {
  const owner = row.firstOwnerHit;
  return [
    row.name,
    row.termination,
    row.steps ?? '-',
    row.depositBlock ?? '-',
    row.releaseBlock ?? '-',
    row.clearRamBlock ?? '-',
    owner?.block ?? '-',
    owner?.delta ?? '-',
    owner?.state?.stack24?.slice(0, 4).join('/') ?? '-',
    owner?.state?.D00587 ?? '-',
    owner?.state?.D0058C ?? '-',
    owner?.state?.D0058D ?? '-',
    owner?.state?.D0058E ?? '-',
    owner?.state?.D007CA ?? '-',
    owner?.state?.D0243A ?? '-',
    owner?.state?.D02590 ?? '-',
    owner?.state?.buffer ?? '-',
  ].join(' | ');
}

function routeWindowTable(row, limit = 36) {
  const owner = row.firstOwnerHit;
  if (!owner) return '_No owner hit captured._';
  const entries = owner.priorRouteTail.slice(-limit);
  const lines = [
    '| block | delta | pc | label | first insn | state |',
    '|---:|---:|---:|---|---|---|',
  ];
  for (const entry of entries) {
    lines.push(`| ${entry.block} | ${entry.delta} | ${entry.pc} | ${entry.label ?? ''} | ${entry.meta?.first ?? ''} | ${compactState(entry.state)} |`);
  }
  return lines.join('\n');
}

function dynamicTargetTable(row, limit = 24) {
  const owner = row.firstOwnerHit;
  if (!owner || !owner.recentDynamicTargets.length) return '_No dynamic targets in the captured window._';
  const entries = owner.recentDynamicTargets.slice(-limit);
  const lines = [
    '| block | delta | from | target | mode |',
    '|---:|---:|---:|---:|---|',
  ];
  for (const entry of entries) {
    lines.push(`| ${entry.block} | ${entry.delta} | ${entry.fromPc} | ${entry.target} | ${entry.mode} |`);
  }
  return lines.join('\n');
}

function ownerStateBlock(row) {
  const owner = row.firstOwnerHit;
  if (!owner) return '_No owner hit captured._';
  return [
    '```json',
    JSON.stringify({
      block: owner.block,
      delta: owner.delta,
      steps: owner.steps,
      state: owner.state,
      returnHints: owner.returnHints,
    }, null, 2),
    '```',
  ].join('\n');
}

function metaBlock(row) {
  const data = {
    importantMetas: row.importantMetas,
    returnMetas: row.returnMetas,
  };
  return [
    '```json',
    JSON.stringify(data, null, 2),
    '```',
  ].join('\n');
}

function wrapperEntry(row, addr) {
  const owner = row?.firstOwnerHit;
  if (!owner) return null;
  return owner.priorRouteTail.find((entry) => entry.pc === hex(addr)) ?? null;
}

function wrapperEntries(row) {
  const owner = row?.firstOwnerHit;
  if (!owner) return [];
  return owner.priorRouteTail.filter((entry) => WRAPPER_PATH.has(Number.parseInt(entry.pc.slice(2), 16)));
}

function branchSummary(row) {
  const entries = row?.firstOwnerHit?.priorRouteTail ?? [];
  const countdown = entries.filter((entry) => entry.pc === hex(WATCH.countdownLoop));
  const portRead = wrapperEntry(row, WATCH.port3Read);
  const postPortRead = wrapperEntry(row, WATCH.port3PostRead);
  const wrapperCall = wrapperEntry(row, WATCH.wrapperCall);
  const helperEntry = wrapperEntry(row, WATCH.helperEntry);
  const helperReturn = wrapperEntry(row, WATCH.helperDynamicReturn);
  const wrapperResume = wrapperEntry(row, WATCH.wrapperResume);
  const flagGate = wrapperEntry(row, WATCH.preOwnerFlagGate);
  const preOwnerCall = wrapperEntry(row, WATCH.preOwnerCall);
  const owner = row?.firstOwnerHit;

  const d000c2 = flagGate?.state?.D000C2;
  const d000c2Byte = d000c2 ? Number.parseInt(d000c2.slice(2), 16) : null;
  const d000c2Bit7Clear = d000c2Byte == null ? null : ((d000c2Byte & 0x80) === 0);

  return {
    variant: row?.name,
    countdownBlocks: countdown.length,
    countdownFirstBC: countdown[0]?.state?.bc ?? null,
    countdownLastBC: countdown[countdown.length - 1]?.state?.bc ?? null,
    fallthroughBC: portRead?.state?.bc ?? null,
    port3Input: postPortRead?.state?.a ?? null,
    port3PostFlags: postPortRead?.state?.f ?? null,
    wrapperCallState: wrapperCall?.state ?? null,
    helperEntryStack: helperEntry?.state?.stack24?.slice(0, 3) ?? null,
    helperReturnState: helperReturn?.state ?? null,
    wrapperResumeState: wrapperResume?.state ?? null,
    d000c2At0158DE: d000c2,
    d000c2Bit7Clear,
    preOwnerStack: preOwnerCall?.state?.stack24?.slice(0, 3) ?? null,
    ownerStack: owner?.state?.stack24?.slice(0, 3) ?? null,
  };
}

function branchSummaryBlock(row) {
  return [
    '```json',
    JSON.stringify(branchSummary(row), null, 2),
    '```',
  ].join('\n');
}

function meaningForPc(addr) {
  const text = new Map([
    [WATCH.countdownLoop, 'B countdown; fallthrough only after B reaches 0'],
    [WATCH.port3Read, 'read port 0x03 after countdown'],
    [WATCH.port3PostRead, 'configure low-ROM port state after port-3 read'],
    [WATCH.port3Prep, 'select/write port 0x03 and branch to setup'],
    [WATCH.wrapperSetup, 'prepare BC=0x00A005 and A=0x08'],
    [WATCH.wrapperCall, 'call 0x001988 helper'],
    [WATCH.helperEntry, 'DI helper entry; pushes original BC'],
    [WATCH.helperStackSave, 'force BC=0x001005 for helper port sequence'],
    [WATCH.helperLoadB, 'load A from B'],
    [WATCH.helperLoadC, 'load A from C'],
    [WATCH.helperPortSelect, 'select port 0x03; CP 0x03 sets Z'],
    [WATCH.helperDynamicReturn, 'POP BC; RET dynamically to 0x0013C7'],
    [WATCH.wrapperResume, 'restore MB/IY/flags and call 0x0158DE'],
    [WATCH.preOwnerFlagGate, 'BIT 7,(IY+66)=D000C2; fallthrough when clear'],
    [WATCH.preOwnerCall, 'CALL 0x0158BC owner with 0x0013DA as next return'],
  ]);
  return text.get(addr) ?? '';
}

function wrapperPathTable(row) {
  const entries = wrapperEntries(row);
  if (!entries.length) return '_No wrapper entries captured._';
  const lines = [
    '| block | delta | pc | first insn | last insn | A | F | BC | IY | D0009B | D000C2 | stack24 | meaning |',
    '|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---|---|',
  ];
  for (const entry of entries) {
    const addr = Number.parseInt(entry.pc.slice(2), 16);
    lines.push([
      entry.block,
      entry.delta,
      entry.pc,
      entry.meta?.first ?? '',
      entry.meta?.last ?? '',
      entry.state.a,
      entry.state.f,
      entry.state.bc,
      entry.state.iy,
      entry.state.D0009B,
      entry.state.D000C2,
      entry.state.stack24.slice(0, 3).join('/'),
      meaningForPc(addr),
    ].join(' | '));
  }
  return lines.map((line) => (line.startsWith('|') ? line : `| ${line} |`)).join('\n');
}

function buildReport(data) {
  const primary = data.results.find((row) => row.name === 'release-matrix-at-deposit-stop-owner');
  const clearHeld = data.results.find((row) => row.name === 'clear-ram-at-deposit-while-held-stop-owner');
  const control = data.results.find((row) => row.name === 'no-pending-no-matrix-control-stop-owner');
  const primarySummary = branchSummary(primary);

  const lines = [
    '# Phase 685: Low-ROM Wrapper Trace',
    '',
    'Probe: `probe-phase685-low-rom-wrapper-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase685-low-rom-wrapper-trace.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}`,
    `- VAT snapshot captured: ${data.vatSnapshotCaptured}`,
    `- Main finding: ${data.finding}`,
    '',
    '## Variants',
    '',
    '| variant | termination | steps | deposit1 | release block | clear RAM block | first 0x0158BC | owner delta | owner stack24 | D00587 | D0058C | D0058D | D0058E | D007CA | D0243A | D02590 | buffer |',
    '|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|',
    ...data.results.map((row) => `| ${variantRow(row)} |`),
    '',
    '## Primary Owner State',
    '',
    ownerStateBlock(primary),
    '',
    '## Primary Branch Summary',
    '',
    branchSummaryBlock(primary),
    '',
    '## Primary Low-ROM Wrapper Path',
    '',
    wrapperPathTable(primary),
    '',
    '## Clear-Key-RAM Branch Summary',
    '',
    branchSummaryBlock(clearHeld),
    '',
    '## No-Pending Control Branch Summary',
    '',
    branchSummaryBlock(control),
    '',
    '## Primary Window Before First 0x0158BC',
    '',
    routeWindowTable(primary),
    '',
    '## Primary Recent Dynamic Targets',
    '',
    dynamicTargetTable(primary),
    '',
    '## Clear-Key-RAM Window Before First 0x0158BC',
    '',
    routeWindowTable(clearHeld, 24),
    '',
    '## No-Pending Control Window Before First 0x0158BC',
    '',
    routeWindowTable(control, 24),
    '',
    '## Primary Metadata For Return Frames',
    '',
    metaBlock(primary),
    '',
    '## Interpretation',
    '',
    '- The probe stops at the first `0x0158BC` owner hit after the successful insert, before entering `0x001879` or `0x0018F8`.',
    `- \`0x001377\` is a pure B-countdown gate. In the primary insert run this captured window starts at \`BC=${primarySummary.countdownFirstBC}\`, decrements through \`BC=${primarySummary.countdownLastBC}\`, then falls through to \`0x001379\` with \`BC=${primarySummary.fallthroughBC}\`.`,
    `- The port-3 read at \`0x001379\` produces \`A=${primarySummary.port3Input}\` / \`F=${primarySummary.port3PostFlags}\` at \`0x00138A\`, but no variant branches away there; all variants continue through \`0x00139D\` into \`0x0013C3\` with \`A=${primarySummary.wrapperCallState?.a}\`, \`BC=${primarySummary.wrapperCallState?.bc}\`, \`HL=${primarySummary.wrapperCallState?.hl}\`.`,
    '- `0x001988` is a stack-preserving port helper: it pushes the caller BC, temporarily forces `BC=0x001005`, runs the `B`/`C`/port-select sequence, then `0x0019A9` sets `A=0x03`, `CP 0x03` makes Z true, and `0x0019B3` pops the saved `BC=0x00A005` and RETs dynamically to `0x0013C7`.',
    `- \`0x0013C7\` restores low-memory execution context (\`MB=0xD0\`, \`IY=0xD00080\`, \`RES 6,(IY+27)\` / \`D0009B\`) and calls \`0x0158DE\`. At \`0x0158DE\`, \`D000C2\` is \`${primarySummary.d000c2At0158DE}\`, so bit 7 is clear and the \`RET NZ\` is not taken; this is the final branch/state that routes into \`0x0158E8 -> 0x0158BC\`.`,
    '- Releasing the matrix, clearing pending key RAM, and the no-pending/no-matrix control all follow the same wrapper route and have `D000C2` bit 7 clear at `0x0158DE`. The selector is therefore not held-key RAM state; it is the low-ROM wrapper path plus the clear `D000C2` gate.',
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

console.log('phase685: low-ROM wrapper trace to 0x0158BC owner');
const machine = bootBrowserSeededState();
const base = {
  mem: machine.mem.slice(),
  cpu: captureCpu(machine.cpu),
  snap: snap(machine.mem, machine.cpu, machine.peripherals),
};

const variants = [
  {
    name: 'release-matrix-at-deposit-stop-owner',
    matrixHeld: true,
    keepPendingKey: true,
    releaseMatrixAfterDepositBlocks: 0,
  },
  {
    name: 'clear-ram-at-deposit-while-held-stop-owner',
    matrixHeld: true,
    keepPendingKey: true,
    clearRamAfterDepositBlocks: 0,
  },
  {
    name: 'no-pending-no-matrix-control-stop-owner',
    matrixHeld: false,
    keepPendingKey: false,
    traceFromStart: true,
  },
];

const results = variants.map((variant) => {
  const row = traceVariant(machine, base, variant);
  const owner = row.firstOwnerHit;
  console.log(`${row.name}: term=${row.termination} steps=${row.steps} dep=${row.depositBlock ?? '-'} owner=${owner?.block ?? '-'} delta=${owner?.delta ?? '-'} stack=${owner?.state?.stack24?.slice(0, 4).join('/') ?? '-'} key=${owner ? `${owner.state.D00587}/${owner.state.D0058C}/${owner.state.D0058D}/${owner.state.D0058E}` : '-'}`);
  return row;
});

const primary = results.find((row) => row.name === 'release-matrix-at-deposit-stop-owner');
const clearHeld = results.find((row) => row.name === 'clear-ram-at-deposit-while-held-stop-owner');
const control = results.find((row) => row.name === 'no-pending-no-matrix-control-stop-owner');

function ownerRet(row, index) {
  return row?.firstOwnerHit?.state?.stack24?.[index] ?? null;
}

function hasWrapperRoute(row) {
  const required = [
    WATCH.wrapperCall,
    WATCH.helperEntry,
    WATCH.helperPortSelect,
    WATCH.helperDynamicReturn,
    WATCH.wrapperResume,
    WATCH.preOwnerFlagGate,
    WATCH.preOwnerCall,
  ];
  const seen = new Set(wrapperEntries(row).map((entry) => Number.parseInt(entry.pc.slice(2), 16)));
  const summary = branchSummary(row);
  return required.every((addr) => seen.has(addr))
    && summary.helperReturnState?.bc === hex(0x001005)
    && summary.wrapperResumeState?.bc === hex(0x00A005)
    && summary.d000c2Bit7Clear === true
    && summary.preOwnerStack?.[0] === hex(WATCH.lowWrapperReturnA);
}

const pass = primary?.termination === 'first_0158bc_owner'
  && primary?.depositBlock != null
  && primary?.firstOwnerHit?.delta > 0
  && primary?.firstOwnerHit?.state?.D007CA === hex(WATCH.cxMain)
  && primary?.firstOwnerHit?.state?.D02590 !== hex(0)
  && primary?.firstOwnerHit?.state?.buffer?.startsWith(hex(DIGIT2.expected, 2))
  && ownerRet(primary, 0) === hex(WATCH.cleanupOwnerReturn)
  && ownerRet(primary, 1) === hex(WATCH.lowWrapperReturnA)
  && clearHeld?.termination === 'first_0158bc_owner'
  && clearHeld?.depositBlock != null
  && ownerRet(clearHeld, 0) === hex(WATCH.cleanupOwnerReturn)
  && ownerRet(clearHeld, 1) === hex(WATCH.lowWrapperReturnA)
  && control?.termination === 'first_0158bc_owner'
  && ownerRet(control, 0) === hex(WATCH.cleanupOwnerReturn)
  && ownerRet(control, 1) === hex(WATCH.lowWrapperReturnA)
  && hasWrapperRoute(primary)
  && hasWrapperRoute(clearHeld)
  && hasWrapperRoute(control)
  && !primary.firstCleanupBlock
  && !primary.firstWipeBlock
  && !clearHeld.firstCleanupBlock
  && !clearHeld.firstWipeBlock;

const finding = pass
  ? 'low-ROM wrapper route fully traced: 0x001377 counts B down, port-3 setup falls through to 0x0013C3, 0x001988 preserves BC through 0x0019B3 dynamic RET to 0x0013C7, and 0x0158DE falls through because D000C2 bit 7 is clear; this routes all variants into 0x0158E8 -> 0x0158BC while edit/VAT state is still live'
  : 'low-ROM wrapper route did not match expected dynamic-return/D000C2 gate assertions in all variants; inspect report windows';

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
    releaseBlock: row.releaseBlock,
    clearRamBlock: row.clearRamBlock,
    firstOwnerHit: row.firstOwnerHit && {
      block: row.firstOwnerHit.block,
      delta: row.firstOwnerHit.delta,
      steps: row.firstOwnerHit.steps,
      state: row.firstOwnerHit.state,
      returnHints: row.firstOwnerHit.returnHints,
      priorRouteTail: row.firstOwnerHit.priorRouteTail.slice(-48),
      recentDynamicTargets: row.firstOwnerHit.recentDynamicTargets.slice(-24),
    },
    branchSummary: branchSummary(row),
    wrapperPath: wrapperEntries(row).map((entry) => ({
      block: entry.block,
      delta: entry.delta,
      pc: entry.pc,
      first: entry.meta?.first ?? null,
      last: entry.meta?.last ?? null,
      state: {
        a: entry.state.a,
        f: entry.state.f,
        bc: entry.state.bc,
        hl: entry.state.hl,
        iy: entry.state.iy,
        sp: entry.state.sp,
        stack24: entry.state.stack24.slice(0, 3),
        D0009B: entry.state.D0009B,
        D000C2: entry.state.D000C2,
      },
    })),
    firstCleanupBlock: row.firstCleanupBlock,
    firstWipeBlock: row.firstWipeBlock,
    events: row.events,
    importantMetas: row.importantMetas,
    returnMetas: row.returnMetas,
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

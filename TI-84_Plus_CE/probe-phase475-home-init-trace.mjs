#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

const HOME_INIT_PC = 0x08BF22;

const WATCH_RANGES = [
  { name: 'displayCounterArea', start: 0xD00000, end: 0xD00003 },
  { name: 'flagsArea', start: 0xD00080, end: 0xD000FF },
  { name: 'cursorPositionArea', start: 0xD0058C, end: 0xD0058F },
  { name: 'cursorAddress', start: 0xD00591, end: 0xD00593 },
  { name: 'modeState', start: 0xD00824, end: 0xD00824 },
  { name: 'companionMode', start: 0xD007E0, end: 0xD007E0 },
  { name: 'keyProcessingEnable', start: 0xD14091, end: 0xD14091 },
  { name: 'stateD177B7', start: 0xD177B7, end: 0xD177B7 },
  { name: 'stateD177BA', start: 0xD177BA, end: 0xD177BA },
];

const NOTABLE_ADDRESSES = new Map([
  [0xD00088, 'flagD00088'],
  [0xD0008C, 'flagD0008C'],
  [0xD0008D, 'flagD0008D'],
  [0xD00092, 'cursorFlags'],
  [0xD00095, 'flagD00095'],
  [0xD0009D, 'flagD0009D'],
  [0xD000B4, 'flagD000B4'],
  [0xD000BE, 'flagD000BE'],
  [0xD000C6, 'flagD000C6'],
  [0xD000D7, 'flagD000D7'],
  [0xD0058C, 'cursorXOrCol'],
  [0xD0058D, 'cursorYOrRow'],
  [0xD0058E, 'cursorState0'],
  [0xD0058F, 'cursorState1'],
  [0xD00591, 'cursorAddressLow'],
  [0xD00592, 'cursorAddressMid'],
  [0xD00593, 'cursorAddressHigh'],
  [0xD007E0, 'companionMode'],
  [0xD00824, 'modeState'],
  [0xD14091, 'keyProcessingEnable'],
  [0xD177B7, 'stateD177B7'],
  [0xD177BA, 'stateD177BA'],
]);

const TRACKED_PCS = [
  0x08BF22,
  0x042366,
  0x030078,
  0x030300,
  0x03FA09,
  0x040D11,
  0x0059C6,
  0x02FDBE,
  0x02FDD8,
];

function hex(value, width) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `0x${(n >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex24(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `0x${(n & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0')}`;
}

function hex8(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `0x${(n & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function addressLabel(addr, rangeName) {
  return NOTABLE_ADDRESSES.get(addr) ?? rangeName;
}

function trackedAddressEntries() {
  const entries = [];
  const seen = new Set();

  for (const range of WATCH_RANGES) {
    for (let addr = range.start; addr <= range.end; addr++) {
      if (seen.has(addr)) continue;
      seen.add(addr);
      entries.push({
        address: addr,
        addressHex: hex24(addr),
        label: addressLabel(addr, range.name),
        range: range.name,
      });
    }
  }

  return entries.sort((a, b) => a.address - b.address);
}

const TRACKED_ADDRESSES = trackedAddressEntries();

function snapshotTrackedState() {
  return TRACKED_ADDRESSES.map((entry) => ({
    address: entry.addressHex,
    label: entry.label,
    range: entry.range,
    value: mem[entry.address],
    valueHex: hex8(mem[entry.address]),
  }));
}

function snapshotByAddress(snapshot) {
  const byAddress = new Map();
  for (const entry of snapshot) byAddress.set(entry.address, entry);
  return byAddress;
}

function changedAddresses(before, after) {
  const beforeByAddress = snapshotByAddress(before);
  const changes = [];

  for (const afterEntry of after) {
    const beforeEntry = beforeByAddress.get(afterEntry.address);
    if (!beforeEntry || beforeEntry.value === afterEntry.value) continue;
    changes.push({
      address: afterEntry.address,
      label: afterEntry.label,
      range: afterEntry.range,
      before: beforeEntry.valueHex,
      after: afterEntry.valueHex,
      beforeDecimal: beforeEntry.value,
      afterDecimal: afterEntry.value,
    });
  }

  return changes;
}

function selectedState(snapshot) {
  const selected = {};
  for (const entry of snapshot) {
    if (!NOTABLE_ADDRESSES.has(Number.parseInt(entry.address.slice(2), 16))) continue;
    selected[`${entry.address} ${entry.label}`] = entry.valueHex;
  }
  return selected;
}

function summarizeRunResult(result) {
  const resultObject = result && typeof result === 'object' ? result : {};
  const reason =
    resultObject.reason ??
    resultObject.terminationReason ??
    resultObject.stopReason ??
    resultObject.status ??
    resultObject.type ??
    null;
  const steps =
    resultObject.steps ??
    resultObject.stepsTaken ??
    resultObject.stepCount ??
    resultObject.totalSteps ??
    resultObject.executedSteps ??
    resultObject.instructions ??
    null;
  const lastPc =
    resultObject.lastPc ??
    resultObject.lastPC ??
    resultObject.pc ??
    resultObject.finalPc ??
    resultObject.finalPC ??
    cpu.pc ??
    cpu._pc ??
    null;

  return {
    reason,
    steps,
    lastPc: hex24(lastPc),
    rawKeys: Object.keys(resultObject).sort(),
  };
}

function summarizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta ?? null;

  const summary = {};
  for (const key of ['name', 'label', 'kind', 'start', 'end', 'pc', 'address', 'blockIndex', 'instrCount']) {
    if (!(key in meta)) continue;
    const value = meta[key];
    summary[key] = typeof value === 'number' ? hex(value, value <= 0xFF ? 2 : 6) : value;
  }

  if (Object.keys(summary).length > 0) return summary;
  return { keys: Object.keys(meta).slice(0, 8) };
}

const trackedPcHits = new Map(
  TRACKED_PCS.map((pc) => [
    pc,
    {
      pc: hex24(pc),
      hits: 0,
      firstStep: null,
      lastStep: null,
      modes: {},
      metaSamples: [],
    },
  ]),
);

function onBlock(pc, mode, meta, steps) {
  const normalizedPc = Number(pc) & 0xFFFFFF;
  const hit = trackedPcHits.get(normalizedPc);
  if (!hit) return;

  hit.hits++;
  if (hit.firstStep === null) hit.firstStep = steps;
  hit.lastStep = steps;
  hit.modes[mode] = (hit.modes[mode] ?? 0) + 1;

  if (hit.metaSamples.length < 3) {
    hit.metaSamples.push(summarizeMeta(meta));
  }
}

function pcHitSummary() {
  return TRACKED_PCS.map((pc) => trackedPcHits.get(pc));
}

console.log('probe-phase475-home-init-trace: booting OS with timerInterrupt=false');

// Stage 1
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Stage 2
cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Stage 3
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

const beforeHomeInit = snapshotTrackedState();

console.log('probe-phase475-home-init-trace: selected state before 0x08BF22');
console.log(JSON.stringify(selectedState(beforeHomeInit), null, 2));

cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

console.log('probe-phase475-home-init-trace: running home init at 0x08BF22');
const homeInitResult = executor.runFrom(HOME_INIT_PC, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 2000,
  diHaltBypass: true,
  onBlock,
});

const afterHomeInit = snapshotTrackedState();
const changes = changedAddresses(beforeHomeInit, afterHomeInit);

console.log('probe-phase475-home-init-trace: selected state after 0x08BF22');
console.log(JSON.stringify(selectedState(afterHomeInit), null, 2));
console.log('probe-phase475-home-init-trace: changed tracked addresses');
console.log(JSON.stringify(changes, null, 2));
console.log('probe-phase475-home-init-trace: tracked PC hits');
console.log(JSON.stringify(pcHitSummary(), null, 2));

const summary = {
  probe: 'phase475-home-init-trace',
  homeInitPc: hex24(HOME_INIT_PC),
  boot: {
    stage1: summarizeRunResult(bootResult),
    stage2: summarizeRunResult(kernelResult),
    stage3: summarizeRunResult(postInitResult),
  },
  homeInit: summarizeRunResult(homeInitResult),
  trackedPcs: pcHitSummary(),
  selectedBefore: selectedState(beforeHomeInit),
  selectedAfter: selectedState(afterHomeInit),
  changedAddresses: changes,
  before: beforeHomeInit,
  after: afterHomeInit,
};

console.log(JSON.stringify(summary, null, 2));

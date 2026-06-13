import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase659-cleanup-gate-state.md');
const debugPort = 9659;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase659-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) {
  throw new Error('No Chrome/Edge executable found for headless browser test');
}

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.rom')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function instrumentBrowserShell(html) {
  const injection = String.raw`
const phase657_TARGETS = Object.freeze({
  launch09dd62: 0x09DD62,
  memInit09dee0: 0x09DEE0,
  clear001879: 0x001879,
  cleanup0018f8: 0x0018F8,
  repaint058241: 0x058241,
  vatLoop084711: 0x084711,
  vatRewind082be2: 0x082BE2,
  halt0019b5: 0x0019B5,
  getCsc03fa09: 0x03FA09,
  loop08c331: 0x08C331,
  cxMain0585e9: 0x0585E9,
  keyHandler05877a: 0x05877A,
  outer08f3b8: 0x08F3B8,
  tokenReader090883: 0x090883,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  tokenStore09098e: 0x09098E,
  eolTuple08f54b: 0x08F54B,
  displaySeed013d11: 0x013D11,
  displayLoop0059c6: 0x0059C6,
  lowBranch0013fc: 0x0013FC,
  gate001c33: 0x001C33,
  gate001c4a: 0x001C4A,
  gate0158d2: 0x0158D2,
  gate0158da: 0x0158DA,
  gate0158ec: 0x0158EC,
  gate0158ee: 0x0158EE,
  gate0158f8: 0x0158F8,
  gate001872: 0x001872,
  low006d38: 0x006D38,
  low006d4f: 0x006D4F,
  low006d5d: 0x006D5D,
});

const phase657_REPLAY_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02587', 0xD02587, 3],
  ['D0258A', 0xD0258A, 3],
  ['D0258D', 0xD0258D, 3],
  ['D02590', 0xD02590, 3],
  ['D02593', 0xD02593, 3],
  ['D0259A', 0xD0259A, 3],
  ['D0259D', 0xD0259D, 3],
  ['D025A0', 0xD025A0, 3],
  ['D025C5', 0xD025C5, 3],
]);

const phase657_ROUTE_FIELDS = Object.freeze([
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02A28', 0xD02A28, 1],
  ['D001B8', 0xD001B8, 1],
  ['D001D3', 0xD001D3, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A2B', 0xD02A2B, 2],
  ['D02A1B', 0xD02A1B, 2],
  ['D0059A', 0xD0059A, 1],
  ['D01150', 0xD01150, 2],
  ['D0243D', 0xD0243D, 3],
  ['D02A40', 0xD02A40, 3],
  ['VAT_D02590', 0xD02590, 3],
  ['VAT_D0259D', 0xD0259D, 3],
]);

const phase657_CLEAR_TRACE_FIELDS = Object.freeze([
  'D007CA',
  'D008E0',
  'VAT_D02590',
  'VAT_D0259D',
]);

const phase659_GATE_TARGETS = Object.freeze([
  'gate001c33',
  'gate001c4a',
  'gate0158d2',
  'gate0158da',
  'gate0158ec',
  'gate0158ee',
  'gate0158f8',
  'gate001872',
  'clear001879',
  'cleanup0018f8',
]);

const phase659_IY_OFFSETS = Object.freeze([
  0x00,
  0x0D,
  0x1B,
  0x1F,
  0x23,
  0x27,
  0x28,
  0x2C,
  0x42,
  0x44,
]);

const phase659_WATCHED_PORTS = new Set([
  0x0003,
  0x0009,
  0x5003,
  0x5004,
  0x5005,
  0x5006,
  0x5014,
  0x5015,
  0x5016,
]);

function phase657Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase657ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[addr + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase657CaptureReplayFields() {
  const mem = cpu?.memory;
  if (!mem) return [];
  return phase657_REPLAY_FIELDS.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: phase657ReadValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function phase657FieldsObject(fields = phase657CaptureReplayFields()) {
  return Object.fromEntries(fields.map((field) => [field.name, phase657Hex(field.value, field.len * 2)]));
}

function phase657RestoreReplayFields(fields) {
  const mem = cpu?.memory;
  if (!mem || !fields?.length) return false;
  for (const field of fields) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
  return true;
}

function phase657ReadRouteFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(phase657_ROUTE_FIELDS.map(([name, addr, len]) => [
    name,
    phase657ReadValue(mem, addr, len),
  ]));
}

function phase657DiffFields(a, b) {
  const diff = {};
  if (!a || !b) return diff;
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) diff[key] = [a[key], b[key]];
  }
  return diff;
}

function phase657ReadStack24(depth = 10) {
  const mem = cpu?.memory;
  if (!mem) return [];
  const sp = cpu.sp >>> 0;
  const out = [];
  for (let i = 0; i < depth; i += 1) {
    const addr = (sp + i * 3) & 0xFFFFFF;
    out.push({
      offset: i * 3,
      addr: phase657Hex(addr),
      value: phase657Hex(phase657ReadValue(mem, addr, 3)),
    });
  }
  return out;
}

function phase659Flags(value) {
  const f = value & 0xFF;
  return {
    s: (f & 0x80) !== 0,
    z: (f & 0x40) !== 0,
    h: (f & 0x10) !== 0,
    pv: (f & 0x04) !== 0,
    n: (f & 0x02) !== 0,
    c: (f & 0x01) !== 0,
  };
}

function phase659CpuState() {
  if (!cpu) return null;
  return {
    pc: phase657Hex(cpu.pc ?? 0),
    sp: phase657Hex(cpu.sp ?? 0),
    ix: phase657Hex(cpu.ix ?? cpu._ix ?? 0),
    iy: phase657Hex(cpu.iy ?? cpu._iy ?? 0),
    a: phase657Hex(cpu.a ?? 0, 2),
    f: phase657Hex(cpu.f ?? 0, 2),
    af: phase657Hex(cpu.af ?? 0, 4),
    bc: phase657Hex(cpu.bc ?? cpu._bc ?? 0),
    de: phase657Hex(cpu.de ?? cpu._de ?? 0),
    hl: phase657Hex(cpu.hl ?? cpu._hl ?? 0),
    flags: phase659Flags(cpu.f ?? 0),
    halted: cpu.halted,
    madl: cpu.madl,
    mbase: phase657Hex(cpu.mbase ?? 0, 2),
  };
}

function phase659ReadIYFlags() {
  const mem = cpu?.memory;
  if (!mem) return {};
  const iy = (cpu?.iy ?? cpu?._iy ?? 0xD00080) & 0xFFFFFF;
  return Object.fromEntries(phase659_IY_OFFSETS.map((offset) => {
    const addr = (iy + offset) & 0xFFFFFF;
    return ['IY+' + phase657Hex(offset, 2).slice(2), {
      addr: phase657Hex(addr),
      value: phase657Hex(mem[addr] ?? 0, 2),
    }];
  }));
}

function phase659ReadBytes(addr, count = 16) {
  const mem = cpu?.memory;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => phase657Hex(mem[(addr + i) & 0xFFFFFF] ?? 0, 2));
}

function phase659ReturnHints(stack24) {
  return stack24
    .map((entry) => entry.value)
    .filter((value) => value !== '0x000000' && value !== '0xFFFFFF')
    .slice(0, 6);
}

function phase659RecordIo(record, type, port, value) {
  if (!record) return;
  const normalizedPort = port & 0xFFFF;
  if (!phase659_WATCHED_PORTS.has(normalizedPort)) return;
  const event = {
    type,
    block: record.totalBlocks,
    pc: record.currentBlockPc ?? null,
    port: phase657Hex(normalizedPort, 4),
    value: phase657Hex(value ?? 0, 2),
    a: phase657Hex(cpu?.a ?? 0, 2),
    f: phase657Hex(cpu?.f ?? 0, 2),
    flags: phase659Flags(cpu?.f ?? 0),
  };
  record.ioEvents.push(event);
  if (record.ioEvents.length > 256) record.ioEvents.shift();
  record.lastIoByPort[event.port] = event;
}

function phase659InstallRouteIoHooks(record) {
  if (!cpu || !record) return;
  record.previousIoHooks = {
    read: cpu.onIoRead,
    write: cpu.onIoWrite,
  };
  cpu.onIoRead = (port, value) => {
    record.previousIoHooks.read?.call(cpu, port, value);
    phase659RecordIo(record, 'read', port, value);
  };
  cpu.onIoWrite = (port, value) => {
    record.previousIoHooks.write?.call(cpu, port, value);
    phase659RecordIo(record, 'write', port, value);
  };
}

function phase659UninstallRouteIoHooks(record) {
  if (!cpu || !record?.previousIoHooks) return;
  cpu.onIoRead = record.previousIoHooks.read;
  cpu.onIoWrite = record.previousIoHooks.write;
}

function phase659CaptureGateState(record, target, pcHex, beforeFields) {
  const stack24 = phase657ReadStack24(12);
  const addr = Number.parseInt(pcHex.slice(2), 16) & 0xFFFFFF;
  return {
    block: record.totalBlocks,
    target,
    pc: pcHex,
    previousPc: record.lastBlocks.length > 1 ? record.lastBlocks[record.lastBlocks.length - 2] : null,
    routeFields: beforeFields,
    cpu: phase659CpuState(),
    iyFlags: phase659ReadIYFlags(),
    bytesAtPc: phase659ReadBytes(addr, 16),
    recentBlocks: record.lastBlocks.slice(-32),
    stack24,
    returnHints: phase659ReturnHints(stack24),
    ioTail: record.ioEvents.slice(-24),
    lastIoByPort: Object.fromEntries(Object.entries(record.lastIoByPort)),
  };
}

function phase657TraceContext(record, event, pcHex, beforeFields, afterFields, extra = {}) {
  return {
    event,
    block: record.totalBlocks,
    pc: extra.writerPc ?? pcHex,
    detectionPc: pcHex,
    before: beforeFields,
    after: afterFields,
    recentBlocks: record.lastBlocks.slice(-80),
    stack24: phase657ReadStack24(),
    cpu: cpu ? {
      pc: phase657Hex(cpu.pc ?? 0),
      sp: phase657Hex(cpu.sp ?? 0),
      ix: phase657Hex(cpu.ix ?? cpu._ix ?? 0),
      iy: phase657Hex(cpu.iy ?? cpu._iy ?? 0),
      f: phase657Hex(cpu.f ?? 0, 2),
      halted: cpu.halted,
      madl: cpu.madl,
    } : null,
    ...extra,
  };
}

function phase657Result(result) {
  return result ? {
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
  } : null;
}

function phase657ReadRuntimeState(label = null, result = null) {
  return {
    label,
    result: phase657Result(result),
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: cpu ? {
      pc: cpu.pc,
      sp: cpu.sp,
      iy: cpu.iy ?? cpu._iy,
      ix: cpu.ix ?? cpu._ix,
      f: cpu.f,
      halted: cpu.halted,
      iff1: cpu.iff1,
      iff2: cpu.iff2,
      mbase: cpu.mbase,
      madl: cpu.madl,
    } : null,
    replayFields: phase657FieldsObject(),
    routeFields: phase657ReadRouteFields(),
    diagnostics: window.getColdbootPersistenceDiagnostics?.() ?? null,
    vramPixels: window.countVRAMPixels?.() ?? null,
    status: document.getElementById('status')?.textContent ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
  };
}

function phase657CreateStats(label) {
  return {
    label,
    totalBlocks: 0,
    targetCounts: Object.fromEntries(Object.keys(phase657_TARGETS).map((name) => [name, 0])),
    firstBlocks: [],
    lastBlocks: [],
    hotBlocks: {},
  };
}

function phase657ObserveStats(stats, pc) {
  const addr = pc & 0xFFFFFF;
  stats.totalBlocks += 1;
  const pcHex = phase657Hex(addr);
  stats.hotBlocks[pcHex] = (stats.hotBlocks[pcHex] || 0) + 1;
  if (stats.firstBlocks.length < 32) stats.firstBlocks.push(pcHex);
  stats.lastBlocks.push(pcHex);
  if (stats.lastBlocks.length > 40) stats.lastBlocks.shift();
  for (const [name, target] of Object.entries(phase657_TARGETS)) {
    if (addr === target) stats.targetCounts[name] += 1;
  }
  if (stats.label === 'browser-p5-launch-home'
    && addr === 0x001879
    && !window.__phase657.snapshot
    && phase657ReadValue(cpu.memory, 0xD02590, 3) !== 0) {
    const fields = phase657CaptureReplayFields();
    window.__phase657.snapshot = {
      block: stats.totalBlocks,
      pc: pcHex,
      fields,
      fieldsObject: phase657FieldsObject(fields),
      vramPixels: countVRAMPixels(),
    };
  }
}

function phase657FinalizeStats(stats) {
  stats.hotBlocks = Object.entries(stats.hotBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([pc, count]) => ({ pc, count }));
  return stats;
}

function phase657RunOptions(label, opts) {
  const stats = phase657CreateStats(label);
  window.__phase657.phaseStats[label] = stats;
  return {
    ...opts,
    onBlock(pc, mode, meta, step) {
      phase657ObserveStats(stats, pc);
      opts.onBlock?.(pc, mode, meta, step);
    },
  };
}

function phase657FinishStats(label) {
  const stats = window.__phase657.phaseStats[label];
  if (stats) window.__phase657.phaseStats[label] = phase657FinalizeStats(stats);
}

function phase657Record(label, result = null) {
  const record = phase657ReadRuntimeState(label, result);
  window.__phase657.records.push(record);
  return record;
}

function phase657ReplaySnapshot(label) {
  const before = phase657ReadRuntimeState(label + '-before');
  const ok = phase657RestoreReplayFields(window.__phase657.snapshot?.fields);
  const after = phase657ReadRuntimeState(label + '-after');
  window.__phase657.restore = { label, ok, before, after };
  return ok;
}

function phase657CreateRouteRecord(label) {
  return {
    label,
    start: phase657ReadRuntimeState(label + '-start'),
    end: null,
    totalBlocks: 0,
    counts: Object.fromEntries(Object.keys(phase657_TARGETS).map((name) => [name, 0])),
    regionCounts: {
      token08f000_090fff: 0,
      display090000_091fff: 0,
      low006d00_006dff: 0,
      cleanupLow001000_001fff: 0,
      home058000_058fff: 0,
    },
    firstBlocks: [],
    lastBlocks: [],
    hotBlocks: {},
    targetSamples: [],
    targetSampleLimits: {},
    fieldTransitions: [],
    firstWrites: {},
    firstClears: {},
    routeEvents: [],
    gateSamples: [],
    gateSampleLimits: {},
    ioEvents: [],
    lastIoByPort: {},
    currentBlockPc: null,
    previousIoHooks: null,
    lastFields: phase657ReadRouteFields(),
  };
}

function phase657ObserveRouteRecord(record, addr, pcHex, beforeFields) {
  record.totalBlocks += 1;
  record.currentBlockPc = pcHex;
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 64) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 96) record.lastBlocks.shift();

  for (const [name, target] of Object.entries(phase657_TARGETS)) {
    if (addr === target) {
      record.counts[name] += 1;
      const sampleCount = record.targetSampleLimits[name] ?? 0;
      if (sampleCount < 4 && record.targetSamples.length < 96) {
        record.targetSamples.push({
          block: record.totalBlocks,
          pc: pcHex,
          target: name,
          before: beforeFields,
          recentBlocks: record.lastBlocks.slice(-80),
          stack24: phase657ReadStack24(),
          runtime: { lastPc, lastMode, totalSteps },
        });
        record.targetSampleLimits[name] = sampleCount + 1;
      }
      if (phase659_GATE_TARGETS.includes(name)) {
        const gateSampleCount = record.gateSampleLimits[name] ?? 0;
        if (gateSampleCount < 3 && record.gateSamples.length < 48) {
          record.gateSamples.push(phase659CaptureGateState(record, name, pcHex, beforeFields));
          record.gateSampleLimits[name] = gateSampleCount + 1;
        }
      }
    }
  }

  if (addr >= 0x08F000 && addr <= 0x090FFF) record.regionCounts.token08f000_090fff += 1;
  if (addr >= 0x090000 && addr <= 0x091FFF) record.regionCounts.display090000_091fff += 1;
  if (addr >= 0x006D00 && addr <= 0x006DFF) record.regionCounts.low006d00_006dff += 1;
  if (addr >= 0x001000 && addr <= 0x001FFF) record.regionCounts.cleanupLow001000_001fff += 1;
  if (addr >= 0x058000 && addr <= 0x058FFF) record.regionCounts.home058000_058fff += 1;
}

function phase657FinalizeRouteRecord(record) {
  record.end = phase657ReadRuntimeState(record.label + '-end');
  record.hotBlocks = Object.entries(record.hotBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([pc, count]) => ({ pc, count }));
  return record;
}

window.__phase657 = {
  records: [],
  routeRecords: [],
  phaseStats: {},
  snapshot: null,
  restore: null,
  currentRoute: null,
  read: phase657ReadRuntimeState,
  replaySnapshot(label) {
    return phase657ReplaySnapshot(label);
  },
  beginRoute(label) {
    this.currentRoute = phase657CreateRouteRecord(label);
    phase659InstallRouteIoHooks(this.currentRoute);
    this.routeRecords.push(this.currentRoute);
    return this.currentRoute.start;
  },
  finishRoute() {
    const record = this.currentRoute;
    phase659UninstallRouteIoHooks(record);
    this.currentRoute = null;
    return record ? phase657FinalizeRouteRecord(record) : null;
  },
};

const phase657OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase657ObserveColdbootPersistenceBlock(state, pc) {
  const record = window.__phase657?.currentRoute;
  if (!record) return phase657OriginalObserveColdbootPersistenceBlock(state, pc);
  const addr = pc & 0xFFFFFF;
  const pcHex = phase657Hex(addr);
  const beforeFields = phase657ReadRouteFields();
  phase657ObserveRouteRecord(record, addr, pcHex, beforeFields);
  const result = phase657OriginalObserveColdbootPersistenceBlock(state, pc);
  const afterFields = phase657ReadRouteFields();
  const diff = phase657DiffFields(record.lastFields, afterFields);
  if (Object.keys(diff).length && record.fieldTransitions.length < 120) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      diff,
      beforeHook: beforeFields,
      afterHook: afterFields,
    });
  }
  for (const key of phase657_CLEAR_TRACE_FIELDS) {
    if (!(key in diff)) continue;
    const [from, to] = diff[key];
    const previousPc = record.lastBlocks.length > 1 ? record.lastBlocks[record.lastBlocks.length - 2] : null;
    const writerPc = previousPc ?? pcHex;
    if (from === 0 && to !== 0 && !record.firstWrites[key]) {
      record.firstWrites[key] = phase657TraceContext(record, key + ' first nonzero write', pcHex, record.lastFields, afterFields, {
        from,
        to,
        writerPc,
        observedBeforeHook: beforeFields,
      });
      if (record.routeEvents.length < 64) record.routeEvents.push(record.firstWrites[key]);
    }
    if (from !== 0 && to === 0 && !record.firstClears[key]) {
      record.firstClears[key] = phase657TraceContext(record, key + ' first clear', pcHex, record.lastFields, afterFields, {
        from,
        to,
        writerPc,
        observedBeforeHook: beforeFields,
      });
      if (record.routeEvents.length < 64) record.routeEvents.push(record.firstClears[key]);
    }
  }
  record.lastFields = afterFields;
  return result;
};
`;

  if (!html.includes('function initializeColdbootRuntime() {')) {
    throw new Error('initializeColdbootRuntime marker not found');
  }
  let out = html.replace('function initializeColdbootRuntime() {', `${injection}\n\nfunction initializeColdbootRuntime() {`);

  out = out.replace(
    /  const p5 = executor\.runFrom\(COLDBOOT_LAUNCH_HOME_INIT, 'adl', \{ maxSteps: 300000, maxLoopIterations: 30000 \}\);/,
    `  phase657Record('browser-before-p5-launch-home');
  const p5 = executor.runFrom(COLDBOOT_LAUNCH_HOME_INIT, 'adl', phase657RunOptions('browser-p5-launch-home', { maxSteps: 300000, maxLoopIterations: 30000 }));
  phase657FinishStats('browser-p5-launch-home');
  phase657Record('browser-after-p5-launch-home', p5);`,
  );

  out = out.replace(
    /  peripherals\?\.setTimerEnabled\?\.\(true\);\r?\n  prepareColdbootEventFrame\(\);/,
    `  peripherals?.setTimerEnabled?.(true);
  phase657ReplaySnapshot('browser-before-p6-replay');
  phase657Record('browser-after-p5-snapshot-replay');
  prepareColdbootEventFrame();
  phase657Record('browser-after-p6-event-frame');`,
  );

  out = out.replace(
    /  const p6 = executor\.runFrom\(COLDBOOT_HOME_REPAINT, 'adl', \{ maxSteps: 300000, maxLoopIterations: 30000 \}\);/,
    `  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', phase657RunOptions('browser-p6-home-repaint', { maxSteps: 300000, maxLoopIterations: 30000 }));
  phase657FinishStats('browser-p6-home-repaint');
  phase657Record('browser-after-p6-home-repaint', p6);`,
  );

  if (!out.includes("phase657Record('browser-after-p5-launch-home'")) {
    throw new Error('Phase 5 instrumentation replacement failed');
  }
  if (!out.includes("phase657ReplaySnapshot('browser-before-p6-replay')")) {
    throw new Error('Phase 5 snapshot replay replacement failed');
  }
  if (!out.includes("phase657Record('browser-after-p6-home-repaint'")) {
    throw new Error('Phase 6 instrumentation replacement failed');
  }
  return out;
}

function startStaticServer() {
  const serverInstance = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'browser-shell.html';
      const fullPath = path.resolve(shellRoot, rel);
      if (fullPath !== shellRoot && !fullPath.startsWith(`${shellRoot}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      if (rel === 'browser-shell.html') {
        const body = instrumentBrowserShell(fs.readFileSync(fullPath, 'utf8'));
        res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
        res.end(body);
        return;
      }
      res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
      fs.createReadStream(fullPath).pipe(res);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(error?.stack || error));
    }
  });

  return new Promise((resolve, reject) => {
    serverInstance.once('error', reject);
    serverInstance.listen(0, '127.0.0.1', () => resolve(serverInstance));
  });
}

async function waitForDevtools() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const pages = await httpJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome may still be starting.
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome DevTools endpoint');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error(`PAGE_EXCEPTION ${JSON.stringify(msg.params?.exceptionDetails || {})}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params?.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      console.error(`PAGE_CONSOLE ${msg.params?.type}: ${text}`);
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function cdp(socket, method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 120000);
  });
}

async function evalExpr(socket, expression, timeout = 120000) {
  const result = await cdp(socket, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const message = details.exception?.description
      || details.exception?.value
      || details.text
      || 'Runtime.evaluate exception';
    throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
  }
  return result.result.value;
}

async function waitFor(socket, expression, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    const value = await evalExpr(socket, expression, 10000);
    lastValue = value;
    if (value) return value;
    await sleep(250);
  }
  const diagnostics = await readPageState(socket).catch((error) => ({ diagnosticError: error.message }));
  throw new Error(`Timed out waiting for ${label}; lastValue=${JSON.stringify(lastValue)} diagnostics=${JSON.stringify(diagnostics)}`);
}

function keyParams(code, key, windowsVirtualKeyCode, text = key) {
  const params = {
    type: 'keyDown',
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    code,
    key,
  };
  if (text) {
    params.text = text;
    params.unmodifiedText = text;
  }
  return params;
}

async function pressKey(socket, item) {
  await evalExpr(socket, `window.__phase657.beginRoute(${JSON.stringify(item.label)}); true;`);
  await cdp(socket, 'Input.dispatchKeyEvent', keyParams(item.code, item.key, item.vk, item.text ?? item.key));
  await cdp(socket, 'Input.dispatchKeyEvent', { ...keyParams(item.code, item.key, item.vk, ''), type: 'keyUp' });
  await sleep(500);
  return await evalExpr(socket, 'window.__phase657.finishRoute()');
}

async function readPageState(socket) {
  return await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    bootDisabled: document.getElementById('btnBoot')?.disabled ?? null,
    preserve: document.getElementById('preserveDisplay')?.checked ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
    diagnostics: window.getColdbootPersistenceDiagnostics?.() ?? null,
    vramPixels: window.countVRAMPixels?.() ?? null,
    errors: window.__phase657Errors || [],
    phase657: window.__phase657 || null,
    logTail: Array.from(document.getElementById('log')?.querySelectorAll('.info') || []).slice(-16).map((n) => n.textContent),
  }))()`);
}

function targetHits(record, names) {
  const counts = record?.counts ?? {};
  return names.reduce((sum, name) => sum + (counts[name] ?? 0), 0);
}

function routeSummary(record) {
  const tokenHookHits = targetHits(record, ['outer08f3b8', 'tokenReader090883', 'tokenExit08f5e1', 'tokenGate090992', 'tokenStore09098e', 'eolTuple08f54b']);
  const lowPathHits = targetHits(record, ['low006d38', 'low006d4f', 'low006d5d', 'displaySeed013d11', 'displayLoop0059c6', 'lowBranch0013fc']);
  return {
    label: record?.label,
    totalBlocks: record?.totalBlocks,
    tokenHookHits,
    lowPathHits,
    cleanupHits: record?.counts?.cleanup0018f8 ?? 0,
    getCscHits: record?.counts?.getCsc03fa09 ?? 0,
    cxMainHits: record?.counts?.cxMain0585e9 ?? 0,
    keyHandlerHits: record?.counts?.keyHandler05877a ?? 0,
    loopHits: record?.counts?.loop08c331 ?? 0,
    haltHits: record?.counts?.halt0019b5 ?? 0,
    counts: record?.counts,
    regionCounts: record?.regionCounts,
    startFields: record?.start?.routeFields,
    endFields: record?.end?.routeFields,
    status: record?.end?.status,
    firstBlocks: record?.firstBlocks?.slice(0, 18),
    lastBlocks: record?.lastBlocks?.slice(-18),
    hotBlocks: record?.hotBlocks?.slice(0, 12),
    targetSamples: record?.targetSamples?.slice(0, 18),
    clearEntries: record?.targetSamples?.filter((sample) => sample.target === 'clear001879' || sample.target === 'cleanup0018f8').slice(0, 10),
    firstWrites: record?.firstWrites,
    firstClears: record?.firstClears,
    gateSamples: record?.gateSamples?.slice(0, 48),
    ioEventsTail: record?.ioEvents?.slice(-48),
    lastIoByPort: record?.lastIoByPort,
    routeEvents: record?.routeEvents?.slice(0, 20),
    fieldTransitions: record?.fieldTransitions?.slice(0, 24),
  };
}

function hasSeedSignal(record, expected) {
  const candidates = [
    record?.start?.routeFields,
    ...(record?.targetSamples ?? []).map((sample) => sample.before),
    ...(record?.fieldTransitions ?? []).flatMap((transition) => [transition.beforeHook, transition.afterHook]),
  ].filter(Boolean);
  return candidates.some((fields) => fields.D0058C === expected
    && fields.D0058D === expected
    && fields.D0058E === expected
    && (fields.D00080 & 0x08) !== 0
    && (fields.D0009F & 0x20) !== 0
    && fields.D007CA === 0x0585E9
    && fields.D008E0 !== 0);
}

function hasLiveVatSignal(record, expected) {
  const candidates = [
    record?.start?.routeFields,
    ...(record?.targetSamples ?? []).map((sample) => sample.before),
    ...(record?.fieldTransitions ?? []).flatMap((transition) => [transition.beforeHook, transition.afterHook]),
  ].filter(Boolean);
  return candidates.some((fields) => fields.D0058C === expected
    && fields.D0058D === expected
    && fields.D0058E === expected
    && fields.D007CA === 0x0585E9
    && fields.VAT_D02590 !== 0);
}

function routeAnswered(record) {
  const summary = routeSummary(record);
  return (summary.totalBlocks ?? 0) > 1000
    && (summary.tokenHookHits > 0 || summary.lowPathHits > 0 || summary.cleanupHits > 0 || summary.cxMainHits > 0);
}

function routePath(summary) {
  if (summary.tokenHookHits > 0) return 'token/tail hooks';
  if (summary.lowPathHits > 0) return 'low-transfer path';
  if (summary.cxMainHits > 0) return 'cxMain-only path';
  if (summary.cleanupHits > 0) return 'cleanup-only path';
  return 'no routed target';
}

function summarizeKeyResult(result) {
  const summary = routeSummary(result?.record);
  return {
    label: result?.label,
    expected: result?.expected,
    seeded: hasSeedSignal(result?.record, result?.expected),
    vatLive: hasLiveVatSignal(result?.record, result?.expected),
    answered: routeAnswered(result?.record),
    path: routePath(summary),
    preReplayOk: result?.preReplay ? result.preReplay.ok === true : null,
    summary,
    afterState: {
      status: result?.afterState?.status,
      vramPixels: result?.afterState?.vramPixels,
      routeFields: result?.afterState?.phase657?.records?.at?.(-1)?.routeFields,
    },
  };
}

function summarizeScenario(scenario) {
  const p6 = scenario?.pageState?.phase657?.records?.find((record) => record.label === 'browser-after-p6-home-repaint');
  const p6Stats = scenario?.pageState?.phase657?.phaseStats?.['browser-p6-home-repaint'];
  const keySummaries = (scenario?.keyResults ?? []).map(summarizeKeyResult);
  return {
    label: scenario?.label,
    autoRun: scenario?.autoRun,
    replayBeforeEachKey: scenario?.replayBeforeEachKey,
    replayOk: scenario?.replayOk,
    p6: p6?.result ?? null,
    p6VatLoopHits: p6Stats?.targetCounts?.vatLoop084711 ?? null,
    afterColdboot: {
      status: scenario?.afterColdboot?.status,
      vramPixels: scenario?.afterColdboot?.vramPixels,
      replayFields: scenario?.afterColdboot?.phase657?.records?.find((record) => record.label === 'browser-after-p6-home-repaint')?.replayFields,
      routeFields: scenario?.afterColdboot?.phase657?.records?.find((record) => record.label === 'browser-after-p6-home-repaint')?.routeFields,
    },
    afterAutoRun: scenario?.afterAutoRun ? {
      status: scenario.afterAutoRun.status,
      vramPixels: scenario.afterAutoRun.vramPixels,
      diagnostics: scenario.afterAutoRun.diagnostics,
    } : null,
    errors: scenario?.errors ?? [],
    keys: keySummaries,
  };
}

function scenarioAnswered(scenario) {
  const summary = summarizeScenario(scenario);
  return scenario?.replayOk
    && summary.errors.length === 0
    && summary.keys.length > 0
    && summary.keys.every((key) => key.seeded && key.vatLive && key.answered);
}

function gateHitSequence(gateSamples) {
  const seen = new Set();
  return gateSamples
    .filter((sample) => {
      if (seen.has(sample.target)) return false;
      seen.add(sample.target);
      return true;
    })
    .map((sample) => `${sample.target}@${sample.pc}#${sample.block}`);
}

function sampleLine(sample) {
  if (!sample) return 'n/a';
  const port03 = sample.lastIoByPort?.['0x0003'];
  const port09 = sample.lastIoByPort?.['0x0009'];
  const stackTop = sample.stack24?.[0]?.value ?? 'n/a';
  return `AF=${sample.cpu?.af ?? 'n/a'} A=${sample.cpu?.a ?? 'n/a'} F=${sample.cpu?.f ?? 'n/a'} Z=${sample.cpu?.flags?.z ?? 'n/a'} C=${sample.cpu?.flags?.c ?? 'n/a'} SP=${sample.cpu?.sp ?? 'n/a'} stack0=${stackTop} port03=${port03 ? `${port03.type}:${port03.value}@${port03.pc}` : 'none'} port09=${port09 ? `${port09.type}:${port09.value}@${port09.pc}` : 'none'}`;
}

function buildReport(data) {
  const scenarioSummaries = (data?.scenarios ?? []).map(summarizeScenario);
  const firstKey = scenarioSummaries[0]?.keys?.[0];
  const firstClears = firstKey?.summary?.firstClears ?? {};
  const firstWrites = firstKey?.summary?.firstWrites ?? {};
  const clearEntries = firstKey?.summary?.clearEntries ?? [];
  const gateSamples = firstKey?.summary?.gateSamples ?? [];
  const gateSequence = gateHitSequence(gateSamples);
  const first001872 = gateSamples.find((sample) => sample.target === 'gate001872');
  const first001879 = gateSamples.find((sample) => sample.target === 'clear001879');
  const first0018f8 = gateSamples.find((sample) => sample.target === 'cleanup0018f8');
  const lines = [
    '# Phase 659: Cleanup Gate State Under Live VAT',
    '',
    'Probe: `probe-phase659-cleanup-gate-state.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase659-cleanup-gate-state.mjs`  ',
    `Exit: ${data?.pass ? 0 : 1}`,
    '',
    '## Summary',
    '',
    ...scenarioSummaries.flatMap((scenario) => [
      `- ${scenario.keys.every((key) => key.seeded && key.vatLive && key.answered) && scenario.replayOk && scenario.errors.length === 0 ? 'PASS' : 'FAIL'}: ${scenario.label} (autoRun=${scenario.autoRun}, replayBeforeEachKey=${scenario.replayBeforeEachKey}) Phase 6 ${scenario.p6?.termination ?? 'n/a'} at ${scenario.p6 ? hex(scenario.p6.lastPc) : 'n/a'}, 0x084711 hits=${scenario.p6VatLoopHits ?? 'n/a'}.`,
      ...scenario.keys.map((key) => `  - ${key.label}: ${key.vatLive ? 'VAT live' : 'VAT zero'} at seeded route; path=${key.path}; token/tail hits=${key.summary.tokenHookHits}; low-path hits=${key.summary.lowPathHits}; cleanup hits=${key.summary.cleanupHits}; cxMain hits=${key.summary.cxMainHits}.`),
    ]),
    data?.errors?.length === 0
      ? '- PASS: All page error collectors saw no browser exceptions.'
      : `- FAIL: Page errors: ${JSON.stringify(data?.errors ?? [])}`,
    `- First cleanup entries: ${clearEntries.map((entry) => `${entry.target}@${entry.pc}#${entry.block}`).join(', ') || 'none'}.`,
    `- First clear sites: ${Object.entries(firstClears).map(([key, event]) => `${key}@${event.pc}#${event.block}`).join(', ') || 'none'}.`,
    `- First nonzero writes: ${Object.entries(firstWrites).map(([key, event]) => `${key}@${event.pc}#${event.block}`).join(', ') || 'none'}.`,
    `- Gate sequence: ${gateSequence.join(' -> ') || 'none'}.`,
    `- First 0x001872 sample: ${sampleLine(first001872)}.`,
    `- First 0x001879 sample: ${sampleLine(first001879)}.`,
    `- First 0x0018F8 sample: ${sampleLine(first0018f8)}.`,
    '',
    '## Interpretation',
    '',
    data?.interpretation ?? 'No interpretation was recorded.',
    '',
    '## Key Records',
    '',
    '```json',
    JSON.stringify({
      scenarios: scenarioSummaries,
      errors: data?.errors,
    }, null, 2),
    '```',
    '',
    'No source files from the browser shell, runtime, transpiler, or scheduler were modified; this probe serves an instrumented HTML copy from memory.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function installPageErrorCollector(socket) {
  await evalExpr(socket, `(() => {
    window.__phase657Errors = [];
    window.addEventListener('error', (e) => window.__phase657Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__phase657Errors.push(String(e.reason || e)));
    return true;
  })()`);
}

async function bootColdbootPage(socket, pageUrl, scenarioLabel) {
  await cdp(socket, 'Page.navigate', { url: pageUrl });
  await waitFor(socket, 'document.readyState === "complete"', `${scenarioLabel} page load`, 30000);
  await waitFor(socket, '!!window.__phase657 && !!window.getColdbootPersistenceDiagnostics', `${scenarioLabel} phase657 instrumentation`, 30000);
  await sleep(500);
  await installPageErrorCollector(socket);

  const beforeBoot = await readPageState(socket);
  const clickResult = await evalExpr(socket, `(() => {
    const boot = document.getElementById('btnBoot');
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    boot.click();
    return { disabled: boot.disabled, status: document.getElementById('status').textContent };
  })()`);
  console.log(JSON.stringify({ scenario: scenarioLabel, phase: 'boot-click', clickResult }));

  await waitFor(socket, `document.getElementById('status').textContent.includes('Coldboot complete')`, `${scenarioLabel} coldboot completion`, 150000);
  const afterColdboot = await readPageState(socket);
  return { beforeBoot, clickResult, afterColdboot };
}

async function runOneShotAutoRun(socket, scenarioLabel) {
  await evalExpr(socket, `document.getElementById('btnAutoRun').click(); true;`);
  await waitFor(socket, `document.getElementById('btnAutoRun').textContent === 'AutoRun'`, `${scenarioLabel} autorun stopped`, 20000);
  return await readPageState(socket);
}

async function replaySnapshot(socket, label) {
  return await evalExpr(socket, `(() => {
    window.__phase657.replaySnapshot(${JSON.stringify(label)});
    return window.__phase657.restore;
  })()`);
}

async function runKeyRoute(socket, scenarioLabel, key, replayBeforeEachKey) {
  const preReplay = replayBeforeEachKey ? await replaySnapshot(socket, `${scenarioLabel}-${key.id}-prekey-replay`) : null;
  const record = await pressKey(socket, {
    label: `${scenarioLabel}:${key.label}`,
    code: key.code,
    key: key.key,
    vk: key.vk,
    text: key.text,
  });
  const afterState = await readPageState(socket);
  return {
    id: key.id,
    label: key.label,
    expected: key.expected,
    preReplay,
    record,
    afterState,
  };
}

async function runScenario(socket, pageUrl, plan) {
  const boot = await bootColdbootPage(socket, pageUrl, plan.label);
  const afterAutoRun = plan.autoRun ? await runOneShotAutoRun(socket, plan.label) : null;
  const keyResults = [];
  for (const key of plan.keys) {
    keyResults.push(await runKeyRoute(socket, plan.label, key, plan.replayBeforeEachKey));
  }
  const errors = await evalExpr(socket, 'window.__phase657Errors');
  const pageState = await readPageState(socket);
  const p6 = pageState.phase657?.records?.find((record) => record.label === 'browser-after-p6-home-repaint');
  const p6Stats = pageState.phase657?.phaseStats?.['browser-p6-home-repaint'];
  const replayOk = Boolean(
    pageState.phase657?.snapshot
      && pageState.phase657?.restore?.ok
      && p6?.result?.termination === 'halt'
      && p6?.result?.lastPc === 0x0019B5
      && (p6Stats?.targetCounts?.vatLoop084711 ?? 9999) < 100
      && p6?.vramPixels > 100,
  );
  return {
    ...plan,
    ...boot,
    afterAutoRun,
    keyResults,
    errors,
    pageState,
    replayOk,
  };
}

try {
  server = await startStaticServer();
  const pageUrl = `http://127.0.0.1:${server.address().port}/browser-shell.html`;
  chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsUrl = await waitForDevtools();
  ws = await connect(wsUrl);
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');

  const keys = {
    clear: { id: 'clear', label: 'Escape/CLEAR', code: 'Escape', key: 'Escape', vk: 27, text: '', expected: 0x0F },
    digit2: { id: 'digit2', label: 'Digit2', code: 'Digit2', key: '2', vk: 50, text: '2', expected: 0x90 },
  };
  const scenarios = [];
  for (const plan of [
    { label: 'no-autorun-digit2', autoRun: false, replayBeforeEachKey: false, keys: [keys.digit2] },
  ]) {
    console.log(JSON.stringify({ phase: 'scenario-start', label: plan.label }));
    scenarios.push(await runScenario(ws, pageUrl, plan));
  }

  const errors = scenarios.flatMap((scenario) => scenario.errors.map((error) => ({ scenario: scenario.label, error })));
  const scenarioSummaries = scenarios.map(summarizeScenario);
  const firstRouteSummary = scenarioSummaries[0]?.keys?.[0]?.summary ?? {};
  const traceKeysComplete = ['D007CA', 'D008E0', 'VAT_D02590', 'VAT_D0259D']
    .every((key) => firstRouteSummary.firstClears?.[key] || firstRouteSummary.firstWrites?.[key]);
  const cleanupTraceComplete = (firstRouteSummary.clearEntries?.length ?? 0) > 0;
  const requiredGateTargets = [
    'gate001c33',
    'gate001c4a',
    'gate0158d2',
    'gate0158da',
    'gate0158ec',
    'gate0158ee',
    'gate0158f8',
    'gate001872',
    'clear001879',
    'cleanup0018f8',
  ];
  const capturedGateTargets = new Set((firstRouteSummary.gateSamples ?? []).map((sample) => sample.target));
  const gateTraceComplete = requiredGateTargets.every((target) => capturedGateTargets.has(target));
  const pass = scenarios.every(scenarioAnswered) && errors.length === 0 && traceKeysComplete && cleanupTraceComplete && gateTraceComplete;
  const tokenTailFired = scenarioSummaries.some((scenario) => scenario.keys.some((key) => key.summary.tokenHookHits > 0));
  const allLiveRoutesLow = scenarioSummaries.every((scenario) => scenario.keys.every((key) => key.vatLive && key.path === 'low-transfer path'));
  const interpretation = tokenTailFired
    ? 'Unexpectedly, the live-VAT Digit2 browser route reached token/tail hooks before cleanup; inspect first-clear records to see whether state loss happens after token/tail entry.'
    : allLiveRoutesLow
      ? 'The no-AutoRun Digit2 browser route starts with live VAT, reaches cxMain/key handling, then routes into the low-transfer/status cleanup path. The gate samples capture the branch/caller state from 0x001C33 through 0x001879; compare the first 0x001872 and 0x001879 records to see the port guard state immediately before the bulk clear.'
      : 'The no-AutoRun Digit2 route did not produce a clean live-VAT low-transfer trace; inspect the route events and page errors before drawing a routing conclusion.';

  summary = {
    probe: 'phase659-cleanup-gate-state',
    chromePath,
    pageUrl,
    pass,
    errors,
    scenarios,
    interpretation,
    gateTraceComplete,
    requiredGateTargets,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    scenarios: scenarioSummaries,
    interpretation,
    errors,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = {
    probe: 'phase659-cleanup-gate-state',
    pass: false,
    error: String(error?.stack || error),
  };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, buildReport(summary));
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  await sleep(500);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

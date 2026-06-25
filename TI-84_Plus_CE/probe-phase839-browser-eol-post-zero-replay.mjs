import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase839-browser-eol-post-zero-replay.md');
const debugPort = 9800;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-PHASE839-eol-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const EXPECTED = Object.freeze({
  code: 'Escape',
  key: 'Escape',
  label: 'CLEAR',
  vk: 27,
  controlStopPc: 0x0A229D,
  controlStopLabel: 'clear-eol-bc-zero-owner',
  engineEntry: 0x08F54B,
  D007CA: 0x0585E9,
  D02590: 0xD3FE81,
});

const FIELD_DEFS = Object.freeze({
  D007CA: { addr: 0xD007CA, len: 3 },
  D008E0: { addr: 0xD008E0, len: 3 },
  D0243A: { addr: 0xD0243A, len: 3 },
  D0243D: { addr: 0xD0243D, len: 3 },
  D02590: { addr: 0xD02590, len: 3 },
  D02A40: { addr: 0xD02A40, len: 3 },
  D00595: { addr: 0xD00595, len: 1 },
  D00596: { addr: 0xD00596, len: 1 },
  D02A29: { addr: 0xD02A29, len: 2 },
  D02A2B: { addr: 0xD02A2B, len: 2 },
  D02A1B: { addr: 0xD02A1B, len: 2 },
  D01150: { addr: 0xD01150, len: 2 },
  D0059A: { addr: 0xD0059A, len: 1 },
  D02A28: { addr: 0xD02A28, len: 1 },
});

const INITIAL_WRITES = Object.freeze([
  { field: 'D0243A', value: 0xD1A8F8 },
]);

const REPLAY_TRIPLE = Object.freeze([
  { field: 'D0243A', value: 0xD1A8F7 },
  { field: 'D0243D', value: 0xD2A83D },
  { field: 'D02590', value: 0xD3FE81 },
]);

const REPLAY_QUAD = Object.freeze([
  ...REPLAY_TRIPLE,
  { field: 'D02A40', value: 0xD2A83E },
]);

const CASES = Object.freeze([
  {
    name: 'no_replay',
    label: 'No replay after 0x0A31E2 clear',
    writes: INITIAL_WRITES,
    replayWrites: [],
  },
  {
    name: 'replay_pointer_triple',
    label: 'Replay D0243A/D0243D/D02590',
    writes: INITIAL_WRITES,
    replayWrites: REPLAY_TRIPLE,
  },
  {
    name: 'replay_pointer_triple_plus_d02a40',
    label: 'Replay D0243A/D0243D/D02590/D02A40',
    writes: INITIAL_WRITES,
    replayWrites: REPLAY_QUAD,
  },
]);

let nextId = 1;
const pending = new Map();
const eventWaiters = new Map();
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
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
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) throw new Error('Instrumentation marker not found in browser-shell.html');

  const injection = String.raw`
const PHASE839_TARGETS = Object.freeze({
  controlPreStop0A229D: 0x0A229D,
  engine08F54B: 0x08F54B,
  zeroPrev0A31E2: 0x0A31E2,
  zeroEntry0A31A2: 0x0A31A2,
  cleanup0018F8: 0x0018F8,
  prewipe001879: 0x001879,
  low000862: 0x000862,
  low000A92: 0x000A92,
  low03D044: 0x03D044,
  caller058A16: 0x058A16,
  spaceFill0A2A37: 0x0A2A37,
  tokenOuter08F3B8: 0x08F3B8,
});

const PHASE839_FIELD_SPECS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02590', 0xD02590, 3],
  ['D02A40', 0xD02A40, 3],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
  ['D02A28', 0xD02A28, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A2B', 0xD02A2B, 2],
  ['D02A1B', 0xD02A1B, 2],
  ['D01150', 0xD01150, 2],
  ['D0059A', 0xD0059A, 1],
]);

const PHASE839_FIELD_BY_NAME = Object.freeze(Object.fromEntries(
  PHASE839_FIELD_SPECS.map(([name, addr, len]) => [name, { addr, len }])
));

const PHASE839_WATCH_FIELDS = Object.freeze([
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D007CA', 0xD007CA, 3],
  ['D02590', 0xD02590, 3],
]);

function PHASE839Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function PHASE839ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function PHASE839WriteValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[(addr + i) & 0xFFFFFF] = (value >>> (8 * i)) & 0xFF;
}

function PHASE839WriteFields(writes) {
  const mem = cpu?.memory;
  if (!mem) return { ok: false, error: 'cpu.memory unavailable', writes };
  const before = PHASE839ReadFields();
  for (const write of writes ?? []) {
    const spec = PHASE839_FIELD_BY_NAME[write.field];
    if (!spec) return { ok: false, error: 'unknown field ' + write.field, writes };
    PHASE839WriteValue(mem, spec.addr, spec.len, write.value);
  }
  return { ok: true, before, after: PHASE839ReadFields(), writes };
}

function PHASE839ReadFieldList(list) {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(list.map(([name, addr, len]) => [
    name,
    PHASE839ReadValue(mem, addr, len),
  ]));
}

function PHASE839ReadFields() {
  return PHASE839ReadFieldList(PHASE839_FIELD_SPECS);
}

function PHASE839ReadWatchFields() {
  return PHASE839ReadFieldList(PHASE839_WATCH_FIELDS);
}

function PHASE839ReadStackSlots(count = 8) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: PHASE839ReadValue(mem, addr, 3) };
  });
}

function PHASE839CpuRaw() {
  return cpu ? {
    pc: cpu.pc ?? 0,
    sp: cpu.sp ?? 0,
    af: cpu.af ?? 0,
    bc: cpu.bc ?? 0,
    de: cpu.de ?? 0,
    hl: cpu.hl ?? 0,
    ix: cpu._ix ?? cpu.ix ?? 0,
    iy: cpu._iy ?? cpu.iy ?? 0,
    f: cpu.f ?? 0,
    halted: Boolean(cpu.halted),
    madl: cpu.madl ?? 0,
    stepCount: cpu.stepCount ?? 0,
  } : null;
}

function PHASE839Snapshot(record, pc) {
  const cpuRaw = PHASE839CpuRaw();
  return {
    block: record?.totalBlocks ?? 0,
    step: cpuRaw?.stepCount ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPc ?? null,
    cpu: cpuRaw,
    fields: PHASE839ReadFields(),
    stackTop: PHASE839ReadStackSlots(8),
    vram: countVRAMPixels?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
  };
}

function PHASE839CreateRecord(label) {
  return {
    label,
    caseConfig: null,
    replayWrites: [],
    replayApplied: false,
    replayEvents: [],
    start: null,
    end: null,
    totalBlocks: 0,
    prevPc: null,
    lastPcs: [],
    hotBlocks: {},
    topHotBlocks: [],
    targetCounts: Object.fromEntries(Object.keys(PHASE839_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    targetSamples: [],
    zeroNeighborhoodSamples: [],
    wipeSamples: [],
    firstWipe: null,
    firstZeroByField: {},
    firstPointerTripleZero: null,
    postReplayPointerTripleZero: null,
    firstAllZero: null,
    stopRequested: null,
    fieldTransitions: [],
    lastWatchFields: null,
  };
}

function PHASE839CurrentRecord() {
  let record = window.__PHASE839State.records.at(-1);
  if (!record) {
    record = PHASE839CreateRecord('implicit');
    window.__PHASE839State.records.push(record);
  }
  return record;
}

function PHASE839Read(label = 'read') {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: PHASE839CpuRaw(),
    fields: PHASE839ReadFields(),
    stackTop: PHASE839ReadStackSlots(8),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__PHASE839PageErrors ?? [])],
  };
}

function PHASE839RecordZeroes(record, timing, pc, prevFields, fields) {
  if (!fields) return;
  const zeroNames = PHASE839_WATCH_FIELDS.map(([name]) => name).filter((name) => fields[name] === 0);
  for (const name of zeroNames) {
    if (record.firstZeroByField[name]) continue;
    if (prevFields && prevFields[name] === 0) continue;
    record.firstZeroByField[name] = {
      timing,
      block: record.totalBlocks,
      pc: PHASE839Hex(pc),
      prevPc: record.prevPc,
      before: prevFields?.[name] ?? null,
      after: fields[name],
      fields,
      snapshot: PHASE839Snapshot(record, pc),
    };
  }
  const allZero = PHASE839_WATCH_FIELDS.every(([name]) => fields[name] === 0);
  const wasAllZero = prevFields && PHASE839_WATCH_FIELDS.every(([name]) => prevFields[name] === 0);
  const pointerTripleZero = fields.D0243A === 0 && fields.D0243D === 0 && fields.D02590 === 0;
  const wasPointerTripleZero = prevFields && prevFields.D0243A === 0 && prevFields.D0243D === 0 && prevFields.D02590 === 0;
  if (pointerTripleZero && !wasPointerTripleZero && !record.firstPointerTripleZero) {
    record.firstPointerTripleZero = {
      timing,
      block: record.totalBlocks,
      pc: PHASE839Hex(pc),
      prevPc: record.prevPc,
      before: prevFields,
      after: fields,
      history120: [...record.lastPcs],
      snapshot: PHASE839Snapshot(record, pc),
      inferredOwner: record.prevPc,
      evidence: 'onBlock observes state before each lifted block executes; the pointer triple was live after the previous observed block and zero on entry to this block',
    };
  } else if (pointerTripleZero && !wasPointerTripleZero && record.replayApplied && !record.postReplayPointerTripleZero) {
    record.postReplayPointerTripleZero = {
      timing,
      block: record.totalBlocks,
      pc: PHASE839Hex(pc),
      prevPc: record.prevPc,
      before: prevFields,
      after: fields,
      history120: [...record.lastPcs],
      snapshot: PHASE839Snapshot(record, pc),
      inferredOwner: record.prevPc,
    };
    record.stopRequested = {
      reason: 'post_replay_pointer_zero',
      block: record.totalBlocks,
      pc: PHASE839Hex(pc),
      prevPc: record.prevPc,
    };
  }
  if (allZero && !wasAllZero && !record.firstAllZero) {
    record.firstAllZero = {
      timing,
      block: record.totalBlocks,
      pc: PHASE839Hex(pc),
      prevPc: record.prevPc,
      before: prevFields,
      after: fields,
      snapshot: PHASE839Snapshot(record, pc),
    };
  }
}

function PHASE839MaybeReplay(record, pc, beforeFields) {
  if (!record.firstPointerTripleZero || record.replayApplied || !record.replayWrites?.length) return beforeFields;
  const zeroHit = record.firstPointerTripleZero;
  if (zeroHit.block !== record.totalBlocks || zeroHit.pc !== PHASE839Hex(pc)) return beforeFields;
  const replay = PHASE839WriteFields(record.replayWrites);
  record.replayApplied = true;
  record.replayEvents.push({
    block: record.totalBlocks,
    pc: PHASE839Hex(pc),
    prevPc: record.prevPc,
    before: beforeFields,
    replay,
    afterWatchFields: PHASE839ReadWatchFields(),
    snapshot: PHASE839Snapshot(record, pc),
  });
  return PHASE839ReadWatchFields();
}

function PHASE839RequestStop(record, reason, pc, extra = {}) {
  if (record.stopRequested) return;
  record.stopRequested = {
    reason,
    block: record.totalBlocks,
    pc: PHASE839Hex(pc),
    prevPc: record.prevPc,
    ...extra,
  };
}

window.__PHASE839PageErrors = [];
window.addEventListener('error', (event) => {
  window.__PHASE839PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__PHASE839PageErrors.push(String(event.reason || event));
});

window.__PHASE839State = {
  records: [],
  begin(label, caseConfig = {}) {
    const record = PHASE839CreateRecord(label);
    record.caseConfig = caseConfig;
    record.replayWrites = Array.isArray(caseConfig.replayWrites) ? caseConfig.replayWrites : [];
    this.records.push(record);
    record.start = PHASE839Read('start');
    record.lastWatchFields = PHASE839ReadWatchFields();
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = PHASE839Read('end');
      record.topHotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([pc, count]) => ({ pc, count }));
    }
    return record;
  },
  read: PHASE839Read,
};
window.__PHASE839 = window.__PHASE839State;

const PHASE839OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function PHASE839ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = PHASE839CurrentRecord();
  record.totalBlocks += 1;
  const pcHex = PHASE839Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  record.lastPcs.push({ block: record.totalBlocks, pc: pcHex, prevPc: record.prevPc });
  if (record.lastPcs.length > 120) record.lastPcs.shift();

  let beforeFields = PHASE839ReadWatchFields();
  PHASE839RecordZeroes(record, 'entry-vs-previous-block', addr, record.lastWatchFields, beforeFields);
  beforeFields = PHASE839MaybeReplay(record, addr, beforeFields);

  for (const [name, target] of Object.entries(PHASE839_TARGETS)) {
    if (addr !== target) continue;
    record.targetCounts[name] += 1;
    const sample = PHASE839Snapshot(record, addr);
    if (!record.targetFirst[name]) record.targetFirst[name] = sample;
    if (record.targetSamples.length < 80) record.targetSamples.push({ target: name, ...sample });
    if (name === 'controlPreStop0A229D') PHASE839RequestStop(record, 'pre_stop_0a229d', addr);
    if (name === 'engine08F54B') PHASE839RequestStop(record, 'engine_08f54b', addr);
    if (name === 'low000A92' && record.targetCounts.low000A92 >= 2000) {
      PHASE839RequestStop(record, 'low_000a92_spin_threshold', addr, { count: record.targetCounts.low000A92 });
    }
  }

  if (addr >= 0x0A3180 && addr <= 0x0A3220 && record.zeroNeighborhoodSamples.length < 80) {
    record.zeroNeighborhoodSamples.push({
      ...PHASE839Snapshot(record, addr),
      pc: pcHex,
      historyTail: record.lastPcs.slice(-16),
    });
  }
  if (addr === 0x0018F8) {
    const sample = PHASE839Snapshot(record, addr);
    const ownerReturn = sample.stackTop?.[0]?.value ?? null;
    const wipe = {
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      ownerReturn,
      ownerReturnHex: PHASE839Hex(ownerReturn),
      beforeWipeCount: state?.wipeCount ?? null,
      sample,
    };
    if (!record.firstWipe) record.firstWipe = wipe;
    if (record.wipeSamples.length < 12) record.wipeSamples.push(wipe);
    PHASE839RequestStop(record, 'first_wipe_0018f8', addr, { ownerReturn: PHASE839Hex(ownerReturn) });
  }

  if (record.stopRequested) throw COLDBOOT_CONTROL_STOP;

  const result = PHASE839OriginalObserveColdbootPersistenceBlock(state, pc);
  const afterFields = PHASE839ReadWatchFields();
  if (JSON.stringify(beforeFields) !== JSON.stringify(afterFields) && record.fieldTransitions.length < 120) {
    record.fieldTransitions.push({
      timing: 'after-persistence-hook',
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      before: beforeFields,
      after: afterFields,
    });
  }
  PHASE839RecordZeroes(record, 'after-persistence-hook', addr, beforeFields, afterFields);
  if (record.stopRequested) throw COLDBOOT_CONTROL_STOP;
  record.lastWatchFields = afterFields;
  record.prevPc = pcHex;
  return result;
};
`;

  return html.replace(marker, `${injection}\n\n${marker}`);
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
      res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
      if (rel === 'browser-shell.html') {
        res.end(instrumentBrowserShell(fs.readFileSync(fullPath, 'utf8')));
        return;
      }
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
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome DevTools endpoint');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      const waiters = eventWaiters.get(msg.method);
      const waiter = waiters?.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      }
      if (waiters?.length === 0) eventWaiters.delete(msg.method);
    }
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function waitForCdpEvent(method, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const waiters = eventWaiters.get(method);
      if (waiters) {
        const idx = waiters.findIndex((entry) => entry.resolve === resolve);
        if (idx >= 0) waiters.splice(idx, 1);
        if (waiters.length === 0) eventWaiters.delete(method);
      }
      reject(new Error(`CDP event timeout: ${method}`));
    }, timeout);
    timer.unref?.();
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push({ resolve, reject, timer });
    eventWaiters.set(method, waiters);
  });
}

function cdp(socket, method, params = {}, timeout = 120000) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, timeout);
    timer.unref?.();
    pending.set(id, { resolve, reject, timer });
  });
}

async function evalExpr(socket, expression, timeout = 120000) {
  const result = await cdp(socket, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  }, timeout + 5000);
  if (result.exceptionDetails) {
    const d = result.exceptionDetails;
    throw new Error(`${d.exception?.description || d.exception?.value || d.text || 'evaluate exception'}`);
  }
  return result.result.value;
}

async function waitFor(socket, expression, label, timeout = 150000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await evalExpr(socket, expression, 10000);
    if (lastValue) return lastValue;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}; lastValue=${JSON.stringify(lastValue)}`);
}

function keyParams(type) {
  return {
    type,
    windowsVirtualKeyCode: EXPECTED.vk,
    nativeVirtualKeyCode: EXPECTED.vk,
    code: EXPECTED.code,
    key: EXPECTED.key,
  };
}

function classify(state) {
  const key = state?.lastKey ?? {};
  const diag = state?.diagnostics ?? {};
  const persistence = state?.persistence ?? {};
  const tuple = persistence?.tuple ?? {};
  const preTuple = state?.preKey?.persistence?.tuple ?? {};
  const pageErrors = state?.pageErrors ?? [];
  const tupleDiffs = {};
  for (const [name, value] of Object.entries(tuple)) {
    if (preTuple[name] !== value) tupleDiffs[name] = { before: preTuple[name] ?? null, after: value };
  }
  const tupleCoreFields = ['D02A29', 'D02A2B', 'D02A1B', 'D01150', 'D02A28'];
  const tupleCoreSignal = tupleCoreFields.some((name) => preTuple[name] !== tuple[name] && tuple[name] !== 0);
  const logText = state?.logText ?? '';
  const status = state?.status ?? '';
  const hasTupleRestoreLog = logText.includes('EOL tuple restored') || status.includes('EOL tuple restored');
  const checks = {
    code: key.code === EXPECTED.code,
    label: key.label === EXPECTED.label,
    controlPreStopPc: key.controlPreStopPc === EXPECTED.controlStopPc,
    controlPreStopLabel: key.controlPreStopLabel === EXPECTED.controlStopLabel,
    termination: key.termination === 'control_pre_stop',
    controlStopPc: key.controlStopPc === EXPECTED.controlStopPc,
    stoppedBeforeControlClear: key.stoppedBeforeControlClear === true,
    uiClearApplied: key.uiClearApplied === true,
    noWipes: key.wipes === 0,
    D007CA: key.D007CA === EXPECTED.D007CA && diag.D007CA === EXPECTED.D007CA,
    D02590: key.D02590 === EXPECTED.D02590 && diag.D02590 === EXPECTED.D02590,
    vramPreserved: (key.vramCurrent ?? 0) > 1000 && (diag.vramCurrent ?? 0) > 1000,
    noPageErrors: pageErrors.length === 0,
  };
  const preStop0A229D = Object.values(checks).every(Boolean);
  const engine08F54B = !preStop0A229D && (hasTupleRestoreLog || tupleCoreSignal);
  const low006D = !preStop0A229D
    && !engine08F54B
    && (key.controlStopPc != null && key.controlStopPc >= 0x006D00 && key.controlStopPc <= 0x006DFF);
  const missing202020 = !preStop0A229D
    && !engine08F54B
    && (key.controlStopPc === 0x202020 || status.includes('0x202020') || logText.includes('0x202020'));
  let route = 'OTHER';
  if (preStop0A229D) route = 'PRE_STOP_0A229D';
  else if (engine08F54B) route = 'ENGINE_08F54B';
  else if (low006D) route = 'LOW_006D';
  else if (missing202020) route = 'MISSING_202020';
  return {
    classification: route,
    checks,
    preStop0A229D,
    engine08F54B,
    tupleCoreSignal,
    tupleDiffs,
    hasTupleRestoreLog,
    low006D,
    missing202020,
  };
}

function writeListLabel(writes) {
  if (!writes.length) return '-';
  return writes.map((w) => {
    const def = FIELD_DEFS[w.field];
    return `${w.field}=${hex(w.value, def.len * 2)}`;
  }).join(', ');
}

function fmtFieldMap(fields) {
  if (!fields) return '-';
  return Object.entries(fields)
    .map(([name, value]) => `${name}=${hex(value, name.startsWith('D005') || name === 'D00080' || name === 'D0009F' || name === 'D02A28' ? 2 : 6)}`)
    .join(', ');
}

function buildReport(data) {
  const results = data?.results ?? (data?.result ? [data.result] : []);
  const caseRows = results.map((result) => {
    const key = result.state?.lastKey ?? {};
    const trace = result.traceRecord ?? {};
    const zero = trace.firstPointerTripleZero ?? null;
    const replay = trace.replayEvents?.[0] ?? null;
    return `| ${result.name} | ${writeListLabel(result.writes ?? [])} | ${writeListLabel(result.replayWrites ?? [])} | ${result.classification?.classification ?? '-'} | ${trace.stopRequested?.reason ?? trace.derivedStopReason ?? '-'} | ${key.termination ?? '-'} | ${key.steps ?? '-'} | ${key.wipes ?? '-'} | ${zero ? `${zero.pc} after ${zero.prevPc ?? '-'}` : '-'} | ${replay ? `${replay.pc} (${fmtFieldMap(replay.afterWatchFields)})` : '-'} | ${trace.firstWipe?.ownerReturnHex ?? '-'} |`;
  });
  const targetRows = results.flatMap((result) => Object.entries(result.traceRecord?.targetCounts ?? {}).map(([name, count]) => (
    `| ${result.name} | ${name} | ${count} |`
  )));
  const replayRows = results.flatMap((result) => (result.traceRecord?.replayEvents ?? []).map((event, idx) => (
    `| ${result.name} | ${idx + 1} | ${event.block} | ${event.pc} | ${event.prevPc ?? '-'} | ${writeListLabel(event.replay?.writes ?? [])} | ${fmtFieldMap(event.before)} | ${fmtFieldMap(event.afterWatchFields)} |`
  )));
  const zeroRows = results.flatMap((result) => {
    const trace = result.traceRecord ?? {};
    const first = trace.firstPointerTripleZero;
    const post = trace.postReplayPointerTripleZero;
    return [
      first ? `| ${result.name} | first | ${first.block} | ${first.pc} | ${first.prevPc ?? '-'} | ${fmtFieldMap(first.before)} | ${fmtFieldMap(first.after)} |` : null,
      post ? `| ${result.name} | post-replay | ${post.block} | ${post.pc} | ${post.prevPc ?? '-'} | ${fmtFieldMap(post.before)} | ${fmtFieldMap(post.after)} |` : null,
    ].filter(Boolean);
  });
  const wipeRows = results.flatMap((result) => (result.traceRecord?.wipeSamples ?? []).map((hit, idx) => (
    `| ${result.name} | ${idx + 1} | ${hit.block} | ${hit.pc} | ${hit.prevPc ?? '-'} | ${hit.ownerReturnHex ?? hex(hit.ownerReturn)} | ${hit.beforeWipeCount ?? '-'} | ${fmtFieldMap(hit.sample?.fields)} |`
  )));
  const interpretation = data?.error
    ? [`- Probe failed: ${data.error.split('\n')[0]}`]
    : [
        `- Ran ${results.length} real-Chrome A/B cases: no replay, replay D0243A/D0243D/D02590, and replay those plus D02A40.`,
        `- Every case reached the same first pointer-triple clear point when observed: ${results.map((result) => `${result.name}=${result.traceRecord?.firstPointerTripleZero?.pc ?? '-'} after ${result.traceRecord?.firstPointerTripleZero?.prevPc ?? '-'}`).join('; ')}.`,
        `- Outcomes: ${results.map((result) => `${result.name}=${result.classification?.classification ?? '-'} (${result.traceRecord?.stopRequested?.reason ?? result.traceRecord?.derivedStopReason ?? '-'})`).join('; ')}.`,
      ];

  return [
    '# Phase 839 Browser EOL Post-Zero Replay',
    '',
    'Probe: `probe-phase839-browser-eol-post-zero-replay.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase839-browser-eol-post-zero-replay.mjs`',
    '',
    'Serves an instrumented in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, injects the smallest Phase 836 reproducer (`D0243A=0xD1A8F8`), then A/B tests restoring the fields cleared by `0x0A31E2` on entry to `0x0A31A2`. The real shell file is not edited.',
    '',
    '## Result',
    '',
    ...interpretation,
    '',
    '## Cases',
    '',
    '| Case | Initial writes | Replay writes | Classification | Stop reason | Termination | Steps | Wipes | First pointer zero | Replay event | First wipe owner |',
    '| --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- |',
    ...(data?.error ? ['| - | - | - | ERROR | - | - | - | - | - | - | - |'] : caseRows),
    '',
    '## Replay Events',
    '',
    '| Case | # | Block | PC | Prev PC | Writes | Before watch fields | After watch fields |',
    '| --- | ---: | ---: | --- | --- | --- | --- | --- |',
    ...(replayRows.length ? replayRows : ['| - | - | - | - | - | - | - | - |']),
    '',
    '## Pointer Zeroes',
    '',
    '| Case | Kind | Block | PC | Prev PC | Before | After |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
    ...(zeroRows.length ? zeroRows : ['| - | - | - | - | - | - | - |']),
    '',
    '## Target Hits',
    '',
    '| Case | Target | Hits |',
    '| --- | --- | ---: |',
    ...(targetRows.length ? targetRows : ['| - | - | - |']),
    '',
    '## Wipes',
    '',
    '| Case | # | Block | PC | Prev PC | Stack owner return | Prior wipe count | Fields |',
    '| --- | ---: | ---: | --- | --- | --- | ---: | --- |',
    ...(wipeRows.length ? wipeRows : ['| - | - | - | - | - | - | - | - |']),
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.',
    '',
  ].join('\n');
}

async function installPageErrorCapture(socket) {
  await evalExpr(socket, `(() => {
    window.__PHASE839ExternalPageErrors = [];
    window.addEventListener('error', (event) => {
      window.__PHASE839ExternalPageErrors.push(String(event.message || event.error || event));
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__PHASE839ExternalPageErrors.push(String(event.reason || event));
    });
    return true;
  })()`);
}

async function bootColdboot(socket) {
  await evalExpr(socket, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(socket, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);
}

async function readBrowserState(socket, extra = {}) {
  return await evalExpr(socket, `(() => ({
    editLine: window.__coldbootReadEditLineState?.() ?? null,
    persistence: window.__coldbootPersistenceDiagnostics?.() ?? window.getColdbootPersistenceDiagnostics?.() ?? null,
    traceRead: window.__PHASE839?.read?.(${JSON.stringify(extra.stage ?? 'read')}) ?? null,
    status: document.getElementById('status')?.textContent ?? null,
    pageErrors: [
      ...(window.__PHASE839PageErrors ?? []),
      ...(window.__PHASE839ExternalPageErrors ?? []),
    ],
    extra: ${JSON.stringify(extra)},
  }))()`, 30000);
}

async function injectWrites(socket, writes) {
  await cdp(socket, 'Debugger.enable', {}, 30000);
  const functionHandle = await cdp(socket, 'Runtime.evaluate', {
    expression: 'window.__coldbootReadEditLineState',
    objectGroup: 'PHASE839-inject',
    returnByValue: false,
  }, 30000);
  const objectId = functionHandle?.result?.objectId;
  if (!objectId) throw new Error('Unable to acquire __coldbootReadEditLineState function object');

  let breakpointId = null;
  let paused = false;
  let callPromise = null;
  try {
    const breakpoint = await cdp(socket, 'Debugger.setBreakpointOnFunctionCall', { objectId }, 30000);
    breakpointId = breakpoint.breakpointId;
    const pausedPromise = waitForCdpEvent('Debugger.paused', 60000);
    callPromise = cdp(socket, 'Runtime.evaluate', {
      expression: 'window.__coldbootReadEditLineState()',
      awaitPromise: true,
      returnByValue: true,
      timeout: 120000,
    }, 125000);
    const pauseEvent = await pausedPromise;
    paused = true;
    const callFrameId = pauseEvent.params?.callFrames?.[0]?.callFrameId;
    if (!callFrameId) throw new Error('Debugger paused without a call frame for injection');
    const result = await cdp(socket, 'Debugger.evaluateOnCallFrame', {
      callFrameId,
      returnByValue: true,
      expression: `(() => {
    const writes = ${JSON.stringify(writes)};
    const fields = ${JSON.stringify(FIELD_DEFS)};
    if (!cpu?.memory) return { ok: false, error: 'cpu.memory not available in diagnostic closure', writes };
    const mem = cpu.memory;
    function readValue(addr, len) {
      let value = 0;
      for (let i = 0; i < len; i++) value |= mem[addr + i] << (8 * i);
      return value >>> 0;
    }
    function writeValue(addr, len, value) {
      for (let i = 0; i < len; i++) mem[addr + i] = (value >>> (8 * i)) & 0xFF;
    }
    function snapshot() {
      const out = {};
      for (const [name, def] of Object.entries(fields)) out[name] = readValue(def.addr, def.len);
      out.buffer = Array.from(mem.slice(0xD1A8CC, 0xD1A8CC + 8));
      return out;
    }
    const before = snapshot();
    for (const write of writes) {
      const def = fields[write.field];
      if (!def) throw new Error('unknown field ' + write.field);
      writeValue(def.addr, def.len, write.value);
    }
    const after = snapshot();
    return { ok: true, before, after, writes };
  })()`,
    }, 30000);
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      throw new Error(`${d.exception?.description || d.exception?.value || d.text || 'call-frame injection exception'}`);
    }
    await cdp(socket, 'Debugger.resume', {}, 30000);
    paused = false;
    await callPromise;
    return result.result.value;
  } finally {
    if (paused) {
      try { await cdp(socket, 'Debugger.resume', {}, 30000); } catch {}
    }
    if (callPromise) {
      try { await callPromise; } catch {}
    }
    if (breakpointId) {
      try { await cdp(socket, 'Debugger.removeBreakpoint', { breakpointId }, 30000); } catch {}
    }
    try { await cdp(socket, 'Runtime.releaseObjectGroup', { objectGroup: 'PHASE839-inject' }, 30000); } catch {}
    try { await cdp(socket, 'Debugger.disable', {}, 30000); } catch {}
  }
}

async function runCase(socket, pageUrl, testCase) {
  await cdp(socket, 'Page.navigate', {
    url: `${pageUrl}?case=${encodeURIComponent(testCase.name)}&t=${Date.now()}`,
  }, 30000);
  await waitFor(socket, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(socket, '!!window.__PHASE839 && !!window.__coldbootReadEditLineState', 'PHASE839 instrumentation', 30000);
  await sleep(500);
  await installPageErrorCapture(socket);
  await bootColdboot(socket);

  const beforeInjection = await readBrowserState(socket, { stage: 'beforeInjection' });
  const traceStart = await evalExpr(socket, `window.__PHASE839.begin(${JSON.stringify(testCase.label)}, ${JSON.stringify({ replayWrites: testCase.replayWrites })})`, 30000);
  const injection = await injectWrites(socket, testCase.writes);
  if (!injection.ok) throw new Error(`Injection failed for ${testCase.name}: ${injection.error}`);
  const preKey = await readBrowserState(socket, { stage: 'afterInjection', injection });

  await cdp(socket, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(socket, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(socket, `window.__coldbootLastKey?.code === '${EXPECTED.code}'`, `Escape completion for ${testCase.name}`, 90000);
  await sleep(150);

  const traceRecord = await evalExpr(socket, 'window.__PHASE839.finish()', 30000);
  const state = await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    scanText: document.getElementById('scanCode')?.textContent ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    persistence: window.__coldbootPersistenceDiagnostics?.() ?? window.getColdbootPersistenceDiagnostics?.() ?? null,
    logText: (document.getElementById('log')?.textContent ?? '').slice(-4000),
    pageErrors: [
      ...(window.__PHASE839PageErrors ?? []),
      ...(window.__PHASE839ExternalPageErrors ?? []),
    ],
    preKey: ${JSON.stringify({
      editLine: preKey.editLine,
      persistence: preKey.persistence,
      status: preKey.status,
      injection,
    })},
  }))()`, 30000);
  const classification = classify(state);
  const stopReason = traceRecord?.stopRequested?.reason ?? null;
  const keyState = state?.lastKey ?? {};
  if (stopReason === 'engine_08f54b') {
    classification.classification = 'ENGINE_08F54B';
    classification.engine08F54B = true;
  } else if (stopReason === 'pre_stop_0a229d') {
    classification.classification = 'PRE_STOP_0A229D';
  } else if (stopReason === 'first_wipe_0018f8') {
    classification.classification = 'STILL_WIPES';
    classification.engine08F54B = false;
    classification.tupleCoreSignal = false;
  } else if (stopReason === 'low_000a92_spin_threshold') {
    classification.classification = 'LOW_000A92_SPIN';
    classification.engine08F54B = false;
    classification.tupleCoreSignal = false;
  } else if (stopReason === 'post_replay_pointer_zero') {
    classification.classification = 'POST_REPLAY_POINTER_ZERO';
    classification.engine08F54B = false;
    classification.tupleCoreSignal = false;
  } else if (!stopReason && keyState.termination === 'max_steps') {
    traceRecord.derivedStopReason = traceRecord.firstWipe ? 'max_steps_after_wipe' : 'max_steps_no_wipe';
    classification.classification = traceRecord.firstWipe ? 'MAX_STEPS_AFTER_WIPE' : 'MAX_STEPS_NO_WIPE';
    classification.engine08F54B = false;
    classification.tupleCoreSignal = false;
  } else if (traceRecord?.firstPointerTripleZero && !traceRecord?.replayApplied) {
    classification.classification = 'EARLY_POINTER_ZERO';
    classification.engine08F54B = false;
    classification.tupleCoreSignal = false;
  }
  return {
    name: testCase.name,
    label: testCase.label,
    writes: testCase.writes,
    replayWrites: testCase.replayWrites,
    beforeInjection,
    traceStart,
    injection,
    preKey,
    classification,
    state,
    traceRecord,
  };
}

async function run() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

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

  ws = await connect(await waitForDevtools());
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');

  const results = [];
  for (const testCase of CASES) {
    console.log(`PHASE839: running ${testCase.name}`);
    const result = await runCase(ws, pageUrl, testCase);
    results.push(result);
    const key = result.state?.lastKey ?? {};
    console.log(JSON.stringify({
      case: testCase.name,
      classification: result.classification.classification,
      stopReason: result.traceRecord?.stopRequested?.reason ?? result.traceRecord?.derivedStopReason ?? null,
      termination: key.termination ?? null,
      steps: key.steps ?? null,
      wipes: key.wipes ?? null,
      hits0A229D: result.traceRecord?.targetCounts?.controlPreStop0A229D ?? null,
      hits08F54B: result.traceRecord?.targetCounts?.engine08F54B ?? null,
      replayApplied: result.traceRecord?.replayApplied ?? false,
      replayEvents: result.traceRecord?.replayEvents?.length ?? 0,
      firstPointerTripleZero: result.traceRecord?.firstPointerTripleZero
        ? {
            block: result.traceRecord.firstPointerTripleZero.block,
            pc: result.traceRecord.firstPointerTripleZero.pc,
            prevPc: result.traceRecord.firstPointerTripleZero.prevPc,
            inferredOwner: result.traceRecord.firstPointerTripleZero.inferredOwner,
          }
        : null,
      firstWipeOwner: result.traceRecord?.firstWipe?.ownerReturnHex ?? null,
    }, null, 2));
  }

  return {
    probe: 'phase839-browser-eol-post-zero-replay',
    chromePath,
    pageUrl,
    pass: results.length === CASES.length
      && results.every((result) => result.traceRecord?.firstPointerTripleZero?.pc === '0x0A31A2')
      && results.every((result) => result.traceRecord?.firstPointerTripleZero?.prevPc === '0x0A31E2')
      && results.every((result) => Boolean(result.traceRecord?.stopRequested?.reason ?? result.traceRecord?.derivedStopReason)),
    results,
  };
}

try {
  summary = await run();
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase839-browser-eol-post-zero-replay', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

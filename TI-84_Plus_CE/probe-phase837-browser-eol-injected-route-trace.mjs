import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase837-browser-eol-injected-route-trace.md');
const debugPort = 9799;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase837-eol-'));
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

const CASE = Object.freeze({
  name: 'D0243A_engine_cursor_only',
  label: 'D0243A engine cursor only',
  writes: [
    { field: 'D0243A', value: 0xD1A8F8 },
  ],
});

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
const PHASE837_TARGETS = Object.freeze({
  controlPreStop0A229D: 0x0A229D,
  engine08F54B: 0x08F54B,
  cleanup0018F8: 0x0018F8,
  prewipe001879: 0x001879,
  low000862: 0x000862,
  low000A92: 0x000A92,
  low03D044: 0x03D044,
  caller058A16: 0x058A16,
  spaceFill0A2A37: 0x0A2A37,
  tokenOuter08F3B8: 0x08F3B8,
});

const PHASE837_FIELD_SPECS = Object.freeze([
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

const PHASE837_WATCH_FIELDS = Object.freeze([
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D007CA', 0xD007CA, 3],
  ['D02590', 0xD02590, 3],
]);

function phase837Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase837ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase837ReadFieldList(list) {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(list.map(([name, addr, len]) => [
    name,
    phase837ReadValue(mem, addr, len),
  ]));
}

function phase837ReadFields() {
  return phase837ReadFieldList(PHASE837_FIELD_SPECS);
}

function phase837ReadWatchFields() {
  return phase837ReadFieldList(PHASE837_WATCH_FIELDS);
}

function phase837ReadStackSlots(count = 8) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: phase837ReadValue(mem, addr, 3) };
  });
}

function phase837CpuRaw() {
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

function phase837Snapshot(record, pc) {
  const cpuRaw = phase837CpuRaw();
  return {
    block: record?.totalBlocks ?? 0,
    step: cpuRaw?.stepCount ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPc ?? null,
    cpu: cpuRaw,
    fields: phase837ReadFields(),
    stackTop: phase837ReadStackSlots(8),
    vram: countVRAMPixels?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
  };
}

function phase837CreateRecord(label) {
  return {
    label,
    start: null,
    end: null,
    totalBlocks: 0,
    prevPc: null,
    lastPcs: [],
    hotBlocks: {},
    topHotBlocks: [],
    targetCounts: Object.fromEntries(Object.keys(PHASE837_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    targetSamples: [],
    wipeSamples: [],
    firstWipe: null,
    firstZeroByField: {},
    firstAllZero: null,
    fieldTransitions: [],
    lastWatchFields: null,
  };
}

function phase837CurrentRecord() {
  let record = window.__phase837State.records.at(-1);
  if (!record) {
    record = phase837CreateRecord('implicit');
    window.__phase837State.records.push(record);
  }
  return record;
}

function phase837Read(label = 'read') {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase837CpuRaw(),
    fields: phase837ReadFields(),
    stackTop: phase837ReadStackSlots(8),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase837PageErrors ?? [])],
  };
}

function phase837RecordZeroes(record, timing, pc, prevFields, fields) {
  if (!fields) return;
  const zeroNames = PHASE837_WATCH_FIELDS.map(([name]) => name).filter((name) => fields[name] === 0);
  for (const name of zeroNames) {
    if (record.firstZeroByField[name]) continue;
    if (prevFields && prevFields[name] === 0) continue;
    record.firstZeroByField[name] = {
      timing,
      block: record.totalBlocks,
      pc: phase837Hex(pc),
      prevPc: record.prevPc,
      before: prevFields?.[name] ?? null,
      after: fields[name],
      fields,
      snapshot: phase837Snapshot(record, pc),
    };
  }
  const allZero = PHASE837_WATCH_FIELDS.every(([name]) => fields[name] === 0);
  const wasAllZero = prevFields && PHASE837_WATCH_FIELDS.every(([name]) => prevFields[name] === 0);
  if (allZero && !wasAllZero && !record.firstAllZero) {
    record.firstAllZero = {
      timing,
      block: record.totalBlocks,
      pc: phase837Hex(pc),
      prevPc: record.prevPc,
      before: prevFields,
      after: fields,
      snapshot: phase837Snapshot(record, pc),
    };
  }
}

window.__phase837PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase837PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase837PageErrors.push(String(event.reason || event));
});

window.__phase837State = {
  records: [],
  begin(label) {
    const record = phase837CreateRecord(label);
    this.records.push(record);
    record.start = phase837Read('start');
    record.lastWatchFields = phase837ReadWatchFields();
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase837Read('end');
      record.topHotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([pc, count]) => ({ pc, count }));
    }
    return record;
  },
  read: phase837Read,
};
window.__phase837 = window.__phase837State;

const phase837OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase837ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase837CurrentRecord();
  record.totalBlocks += 1;
  const pcHex = phase837Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  record.lastPcs.push({ block: record.totalBlocks, pc: pcHex, prevPc: record.prevPc });
  if (record.lastPcs.length > 30) record.lastPcs.shift();

  const beforeFields = phase837ReadWatchFields();
  phase837RecordZeroes(record, 'entry-vs-previous-block', addr, record.lastWatchFields, beforeFields);

  for (const [name, target] of Object.entries(PHASE837_TARGETS)) {
    if (addr !== target) continue;
    record.targetCounts[name] += 1;
    const sample = phase837Snapshot(record, addr);
    if (!record.targetFirst[name]) record.targetFirst[name] = sample;
    if (record.targetSamples.length < 80) record.targetSamples.push({ target: name, ...sample });
  }

  if (addr === 0x0018F8) {
    const sample = phase837Snapshot(record, addr);
    const ownerReturn = sample.stackTop?.[0]?.value ?? null;
    const wipe = {
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      ownerReturn,
      ownerReturnHex: phase837Hex(ownerReturn),
      beforeWipeCount: state?.wipeCount ?? null,
      sample,
    };
    if (!record.firstWipe) record.firstWipe = wipe;
    if (record.wipeSamples.length < 12) record.wipeSamples.push(wipe);
  }

  const result = phase837OriginalObserveColdbootPersistenceBlock(state, pc);
  const afterFields = phase837ReadWatchFields();
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
  phase837RecordZeroes(record, 'after-persistence-hook', addr, beforeFields, afterFields);
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
  const result = data?.result ?? {};
  const key = result.state?.lastKey ?? {};
  const trace = result.traceRecord ?? {};
  const targetCounts = trace.targetCounts ?? {};
  const zeroRows = Object.entries(trace.firstZeroByField ?? {}).map(([name, hit]) => (
    `| ${name} | ${hit.timing} | ${hit.block} | ${hit.pc} | ${hit.prevPc ?? '-'} | ${hex(hit.before)} -> ${hex(hit.after)} |`
  ));
  const wipeRows = (trace.wipeSamples ?? []).map((hit, idx) => (
    `| ${idx + 1} | ${hit.block} | ${hit.pc} | ${hit.prevPc ?? '-'} | ${hex(hit.ownerReturn)} | ${hit.beforeWipeCount ?? '-'} | ${fmtFieldMap(hit.sample?.fields)} |`
  ));
  const hotRows = (trace.topHotBlocks ?? []).slice(0, 20).map((hit) => `| ${hit.pc} | ${hit.count} |`);
  const targetRows = Object.entries(targetCounts).map(([name, count]) => `| ${name} | ${count} |`);
  const lastPcText = (trace.lastPcs ?? []).map((hit) => `${hit.block}:${hit.pc}`).join(' ');
  const firstAllZero = trace.firstAllZero
    ? `block ${trace.firstAllZero.block}, pc ${trace.firstAllZero.pc}, prevPc ${trace.firstAllZero.prevPc ?? '-'}, fields ${fmtFieldMap(trace.firstAllZero.after)}`
    : 'not observed';
  const firstWipe = trace.firstWipe
    ? `block ${trace.firstWipe.block}, owner return ${hex(trace.firstWipe.ownerReturn)}, prevPc ${trace.firstWipe.prevPc ?? '-'}`
    : 'not observed';
  const interpretation = data?.error
    ? [`- Probe failed: ${data.error.split('\n')[0]}`]
    : [
        `- The smallest Phase 836 injection reproduced as ${result.classification?.classification ?? 'UNKNOWN'}: termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, wipes=${key.wipes ?? '-'}.`,
        `- Hits: 0x0A229D=${targetCounts.controlPreStop0A229D ?? 0}, 0x08F54B=${targetCounts.engine08F54B ?? 0}, 0x0018F8=${targetCounts.cleanup0018F8 ?? 0}.`,
        `- First wipe owner: ${firstWipe}.`,
        `- First all-zero point for D0243A/D0243D/D007CA/D02590: ${firstAllZero}.`,
      ];

  return [
    '# Phase 837 Browser EOL Injected Route Trace',
    '',
    'Probe: `probe-phase837-browser-eol-injected-route-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase837-browser-eol-injected-route-trace.mjs`',
    '',
    'Serves an instrumented in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, injects the smallest Phase 836 reproducer (`D0243A=0xD1A8F8`), dispatches browser EOL (`Escape`), and records the route without editing the shell.',
    '',
    '## Result',
    '',
    ...interpretation,
    '',
    '## Case',
    '',
    '| Case | Writes | Classification | Termination | Steps | Wipes | Control PC | Post D0243A | Post D0243D | Post D007CA | Post D02590 |',
    '| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |',
    data?.error
      ? '| - | - | ERROR | - | - | - | - | - | - | - | - |'
      : `| ${result.name} | ${writeListLabel(result.writes ?? [])} | ${result.classification?.classification ?? '-'} | ${key.termination ?? '-'} | ${key.steps ?? '-'} | ${key.wipes ?? '-'} | ${hex(key.controlStopPc)} | ${hex(key.D0243A)} | ${hex(key.D0243D)} | ${hex(key.D007CA)} | ${hex(key.D02590)} |`,
    '',
    '## Target Hits',
    '',
    '| Target | Hits |',
    '| --- | ---: |',
    ...targetRows,
    '',
    '## Wipes',
    '',
    `First wipe: ${firstWipe}.`,
    '',
    '| # | Block | PC | Prev PC | Stack owner return | Prior wipe count | Fields |',
    '| ---: | ---: | --- | --- | --- | ---: | --- |',
    ...(wipeRows.length ? wipeRows : ['| - | - | - | - | - | - | - |']),
    '',
    '## Field Zero Points',
    '',
    `First all-zero: ${firstAllZero}.`,
    '',
    '| Field | Timing | Block | PC | Prev PC | Value |',
    '| --- | --- | ---: | --- | --- | --- |',
    ...(zeroRows.length ? zeroRows : ['| - | - | - | - | - | - |']),
    '',
    '## Top Repeated PCs',
    '',
    '| PC | Count |',
    '| --- | ---: |',
    ...(hotRows.length ? hotRows : ['| - | - |']),
    '',
    '## Last 30 PCs',
    '',
    lastPcText || '-',
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
    window.__phase837ExternalPageErrors = [];
    window.addEventListener('error', (event) => {
      window.__phase837ExternalPageErrors.push(String(event.message || event.error || event));
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__phase837ExternalPageErrors.push(String(event.reason || event));
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
    traceRead: window.__phase837?.read?.(${JSON.stringify(extra.stage ?? 'read')}) ?? null,
    status: document.getElementById('status')?.textContent ?? null,
    pageErrors: [
      ...(window.__phase837PageErrors ?? []),
      ...(window.__phase837ExternalPageErrors ?? []),
    ],
    extra: ${JSON.stringify(extra)},
  }))()`, 30000);
}

async function injectWrites(socket, writes) {
  await cdp(socket, 'Debugger.enable', {}, 30000);
  const functionHandle = await cdp(socket, 'Runtime.evaluate', {
    expression: 'window.__coldbootReadEditLineState',
    objectGroup: 'phase837-inject',
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
    try { await cdp(socket, 'Runtime.releaseObjectGroup', { objectGroup: 'phase837-inject' }, 30000); } catch {}
    try { await cdp(socket, 'Debugger.disable', {}, 30000); } catch {}
  }
}

async function runCase(socket, pageUrl) {
  await cdp(socket, 'Page.navigate', {
    url: `${pageUrl}?case=${encodeURIComponent(CASE.name)}&t=${Date.now()}`,
  }, 30000);
  await waitFor(socket, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(socket, '!!window.__phase837 && !!window.__coldbootReadEditLineState', 'phase837 instrumentation', 30000);
  await sleep(500);
  await installPageErrorCapture(socket);
  await bootColdboot(socket);

  const beforeInjection = await readBrowserState(socket, { stage: 'beforeInjection' });
  const traceStart = await evalExpr(socket, `window.__phase837.begin(${JSON.stringify(CASE.label)})`, 30000);
  const injection = await injectWrites(socket, CASE.writes);
  if (!injection.ok) throw new Error(`Injection failed for ${CASE.name}: ${injection.error}`);
  const preKey = await readBrowserState(socket, { stage: 'afterInjection', injection });

  await cdp(socket, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(socket, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(socket, `window.__coldbootLastKey?.code === '${EXPECTED.code}'`, `Escape completion for ${CASE.name}`, 90000);
  await sleep(150);

  const traceRecord = await evalExpr(socket, 'window.__phase837.finish()', 30000);
  const state = await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    scanText: document.getElementById('scanCode')?.textContent ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    persistence: window.__coldbootPersistenceDiagnostics?.() ?? window.getColdbootPersistenceDiagnostics?.() ?? null,
    logText: (document.getElementById('log')?.textContent ?? '').slice(-4000),
    pageErrors: [
      ...(window.__phase837PageErrors ?? []),
      ...(window.__phase837ExternalPageErrors ?? []),
    ],
    preKey: ${JSON.stringify({
      editLine: preKey.editLine,
      persistence: preKey.persistence,
      status: preKey.status,
      injection,
    })},
  }))()`, 30000);
  const classification = classify(state);
  return {
    name: CASE.name,
    label: CASE.label,
    writes: CASE.writes,
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

  console.log(`phase837: running ${CASE.name}`);
  const result = await runCase(ws, pageUrl);
  const key = result.state?.lastKey ?? {};
  console.log(JSON.stringify({
    classification: result.classification.classification,
    termination: key.termination ?? null,
    steps: key.steps ?? null,
    wipes: key.wipes ?? null,
    hits0A229D: result.traceRecord?.targetCounts?.controlPreStop0A229D ?? null,
    hits08F54B: result.traceRecord?.targetCounts?.engine08F54B ?? null,
    firstWipeOwner: result.traceRecord?.firstWipe?.ownerReturnHex ?? null,
    firstAllZero: result.traceRecord?.firstAllZero
      ? {
          block: result.traceRecord.firstAllZero.block,
          pc: result.traceRecord.firstAllZero.pc,
          prevPc: result.traceRecord.firstAllZero.prevPc,
        }
      : null,
  }, null, 2));

  return {
    probe: 'phase837-browser-eol-injected-route-trace',
    chromePath,
    pageUrl,
    pass: result.classification.classification === 'OTHER'
      && result.state?.lastKey?.termination === 'max_steps'
      && (result.traceRecord?.targetCounts?.engine08F54B ?? 0) === 0,
    result,
  };
}

try {
  summary = await run();
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase837-browser-eol-injected-route-trace', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

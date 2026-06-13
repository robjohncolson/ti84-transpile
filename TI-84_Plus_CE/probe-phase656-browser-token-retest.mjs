import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase656-browser-token-retest.md');
const debugPort = 9656;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase656-'));
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
const PHASE656_TARGETS = Object.freeze({
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
  low006d38: 0x006D38,
  low006d4f: 0x006D4F,
  low006d5d: 0x006D5D,
});

const PHASE656_REPLAY_FIELDS = Object.freeze([
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

const PHASE656_ROUTE_FIELDS = Object.freeze([
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

function phase656Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase656ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[addr + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase656CaptureReplayFields() {
  const mem = cpu?.memory;
  if (!mem) return [];
  return PHASE656_REPLAY_FIELDS.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: phase656ReadValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function phase656FieldsObject(fields = phase656CaptureReplayFields()) {
  return Object.fromEntries(fields.map((field) => [field.name, phase656Hex(field.value, field.len * 2)]));
}

function phase656RestoreReplayFields(fields) {
  const mem = cpu?.memory;
  if (!mem || !fields?.length) return false;
  for (const field of fields) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
  return true;
}

function phase656ReadRouteFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE656_ROUTE_FIELDS.map(([name, addr, len]) => [
    name,
    phase656ReadValue(mem, addr, len),
  ]));
}

function phase656DiffFields(a, b) {
  const diff = {};
  if (!a || !b) return diff;
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) diff[key] = [a[key], b[key]];
  }
  return diff;
}

function phase656Result(result) {
  return result ? {
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
  } : null;
}

function phase656ReadRuntimeState(label = null, result = null) {
  return {
    label,
    result: phase656Result(result),
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
    replayFields: phase656FieldsObject(),
    routeFields: phase656ReadRouteFields(),
    diagnostics: window.getColdbootPersistenceDiagnostics?.() ?? null,
    vramPixels: window.countVRAMPixels?.() ?? null,
    status: document.getElementById('status')?.textContent ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
  };
}

function phase656CreateStats(label) {
  return {
    label,
    totalBlocks: 0,
    targetCounts: Object.fromEntries(Object.keys(PHASE656_TARGETS).map((name) => [name, 0])),
    firstBlocks: [],
    lastBlocks: [],
    hotBlocks: {},
  };
}

function phase656ObserveStats(stats, pc) {
  const addr = pc & 0xFFFFFF;
  stats.totalBlocks += 1;
  const pcHex = phase656Hex(addr);
  stats.hotBlocks[pcHex] = (stats.hotBlocks[pcHex] || 0) + 1;
  if (stats.firstBlocks.length < 32) stats.firstBlocks.push(pcHex);
  stats.lastBlocks.push(pcHex);
  if (stats.lastBlocks.length > 40) stats.lastBlocks.shift();
  for (const [name, target] of Object.entries(PHASE656_TARGETS)) {
    if (addr === target) stats.targetCounts[name] += 1;
  }
  if (stats.label === 'browser-p5-launch-home'
    && addr === 0x001879
    && !window.__phase656.snapshot
    && phase656ReadValue(cpu.memory, 0xD02590, 3) !== 0) {
    const fields = phase656CaptureReplayFields();
    window.__phase656.snapshot = {
      block: stats.totalBlocks,
      pc: pcHex,
      fields,
      fieldsObject: phase656FieldsObject(fields),
      vramPixels: countVRAMPixels(),
    };
  }
}

function phase656FinalizeStats(stats) {
  stats.hotBlocks = Object.entries(stats.hotBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([pc, count]) => ({ pc, count }));
  return stats;
}

function phase656RunOptions(label, opts) {
  const stats = phase656CreateStats(label);
  window.__phase656.phaseStats[label] = stats;
  return {
    ...opts,
    onBlock(pc, mode, meta, step) {
      phase656ObserveStats(stats, pc);
      opts.onBlock?.(pc, mode, meta, step);
    },
  };
}

function phase656FinishStats(label) {
  const stats = window.__phase656.phaseStats[label];
  if (stats) window.__phase656.phaseStats[label] = phase656FinalizeStats(stats);
}

function phase656Record(label, result = null) {
  const record = phase656ReadRuntimeState(label, result);
  window.__phase656.records.push(record);
  return record;
}

function phase656ReplaySnapshot(label) {
  const before = phase656ReadRuntimeState(label + '-before');
  const ok = phase656RestoreReplayFields(window.__phase656.snapshot?.fields);
  const after = phase656ReadRuntimeState(label + '-after');
  window.__phase656.restore = { label, ok, before, after };
  return ok;
}

function phase656CreateRouteRecord(label) {
  return {
    label,
    start: phase656ReadRuntimeState(label + '-start'),
    end: null,
    totalBlocks: 0,
    counts: Object.fromEntries(Object.keys(PHASE656_TARGETS).map((name) => [name, 0])),
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
    lastFields: phase656ReadRouteFields(),
  };
}

function phase656ObserveRouteRecord(record, addr, pcHex, beforeFields) {
  record.totalBlocks += 1;
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 64) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 64) record.lastBlocks.shift();

  for (const [name, target] of Object.entries(PHASE656_TARGETS)) {
    if (addr === target) {
      record.counts[name] += 1;
      const sampleCount = record.targetSampleLimits[name] ?? 0;
      if (sampleCount < 4 && record.targetSamples.length < 96) {
        record.targetSamples.push({
          block: record.totalBlocks,
          pc: pcHex,
          target: name,
          before: beforeFields,
          runtime: { lastPc, lastMode, totalSteps },
        });
        record.targetSampleLimits[name] = sampleCount + 1;
      }
    }
  }

  if (addr >= 0x08F000 && addr <= 0x090FFF) record.regionCounts.token08f000_090fff += 1;
  if (addr >= 0x090000 && addr <= 0x091FFF) record.regionCounts.display090000_091fff += 1;
  if (addr >= 0x006D00 && addr <= 0x006DFF) record.regionCounts.low006d00_006dff += 1;
  if (addr >= 0x001000 && addr <= 0x001FFF) record.regionCounts.cleanupLow001000_001fff += 1;
  if (addr >= 0x058000 && addr <= 0x058FFF) record.regionCounts.home058000_058fff += 1;
}

function phase656FinalizeRouteRecord(record) {
  record.end = phase656ReadRuntimeState(record.label + '-end');
  record.hotBlocks = Object.entries(record.hotBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([pc, count]) => ({ pc, count }));
  return record;
}

window.__phase656 = {
  records: [],
  routeRecords: [],
  phaseStats: {},
  snapshot: null,
  restore: null,
  currentRoute: null,
  read: phase656ReadRuntimeState,
  beginRoute(label) {
    this.currentRoute = phase656CreateRouteRecord(label);
    this.routeRecords.push(this.currentRoute);
    return this.currentRoute.start;
  },
  finishRoute() {
    const record = this.currentRoute;
    this.currentRoute = null;
    return record ? phase656FinalizeRouteRecord(record) : null;
  },
};

const phase656OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase656ObserveColdbootPersistenceBlock(state, pc) {
  const record = window.__phase656?.currentRoute;
  if (!record) return phase656OriginalObserveColdbootPersistenceBlock(state, pc);
  const addr = pc & 0xFFFFFF;
  const pcHex = phase656Hex(addr);
  const beforeFields = phase656ReadRouteFields();
  phase656ObserveRouteRecord(record, addr, pcHex, beforeFields);
  const result = phase656OriginalObserveColdbootPersistenceBlock(state, pc);
  const afterFields = phase656ReadRouteFields();
  const diff = phase656DiffFields(record.lastFields, afterFields);
  if (Object.keys(diff).length && record.fieldTransitions.length < 120) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      diff,
      beforeHook: beforeFields,
      afterHook: afterFields,
    });
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
    `  phase656Record('browser-before-p5-launch-home');
  const p5 = executor.runFrom(COLDBOOT_LAUNCH_HOME_INIT, 'adl', phase656RunOptions('browser-p5-launch-home', { maxSteps: 300000, maxLoopIterations: 30000 }));
  phase656FinishStats('browser-p5-launch-home');
  phase656Record('browser-after-p5-launch-home', p5);`,
  );

  out = out.replace(
    /  peripherals\?\.setTimerEnabled\?\.\(true\);\r?\n  prepareColdbootEventFrame\(\);/,
    `  peripherals?.setTimerEnabled?.(true);
  phase656ReplaySnapshot('browser-before-p6-replay');
  phase656Record('browser-after-p5-snapshot-replay');
  prepareColdbootEventFrame();
  phase656Record('browser-after-p6-event-frame');`,
  );

  out = out.replace(
    /  const p6 = executor\.runFrom\(COLDBOOT_HOME_REPAINT, 'adl', \{ maxSteps: 300000, maxLoopIterations: 30000 \}\);/,
    `  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', phase656RunOptions('browser-p6-home-repaint', { maxSteps: 300000, maxLoopIterations: 30000 }));
  phase656FinishStats('browser-p6-home-repaint');
  phase656Record('browser-after-p6-home-repaint', p6);`,
  );

  if (!out.includes("phase656Record('browser-after-p5-launch-home'")) {
    throw new Error('Phase 5 instrumentation replacement failed');
  }
  if (!out.includes("phase656ReplaySnapshot('browser-before-p6-replay')")) {
    throw new Error('Phase 5 snapshot replay replacement failed');
  }
  if (!out.includes("phase656Record('browser-after-p6-home-repaint'")) {
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
  await evalExpr(socket, `window.__phase656.beginRoute(${JSON.stringify(item.label)}); true;`);
  await cdp(socket, 'Input.dispatchKeyEvent', keyParams(item.code, item.key, item.vk, item.text ?? item.key));
  await cdp(socket, 'Input.dispatchKeyEvent', { ...keyParams(item.code, item.key, item.vk, ''), type: 'keyUp' });
  await sleep(500);
  return await evalExpr(socket, 'window.__phase656.finishRoute()');
}

async function readPageState(socket) {
  return await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    bootDisabled: document.getElementById('btnBoot')?.disabled ?? null,
    preserve: document.getElementById('preserveDisplay')?.checked ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
    diagnostics: window.getColdbootPersistenceDiagnostics?.() ?? null,
    vramPixels: window.countVRAMPixels?.() ?? null,
    errors: window.__phase656Errors || [],
    phase656: window.__phase656 || null,
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

function buildReport(data) {
  const p6 = data?.phase656?.records?.find((record) => record.label === 'browser-after-p6-home-repaint');
  const p6Stats = data?.phase656?.phaseStats?.['browser-p6-home-repaint'];
  const snapshot = data?.phase656?.snapshot;
  const restore = data?.phase656?.restore;
  const eol = routeSummary(data?.eolRecord);
  const digit2 = routeSummary(data?.digit2Record);
  const eolPath = eol.tokenHookHits > 0 ? 'token/tail hooks' : eol.lowPathHits > 0 ? 'low-transfer path' : 'no routed target';
  const digit2Path = digit2.tokenHookHits > 0 ? 'token/tail hooks' : digit2.lowPathHits > 0 ? 'low-transfer path' : 'no routed target';
  const lines = [
    '# Phase 656: Browser Token/Tuple Retest With VAT Replay',
    '',
    'Probe: `probe-phase656-browser-token-retest.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase656-browser-token-retest.mjs`  ',
    `Exit: ${data?.pass ? 0 : 1}`,
    '',
    '## Summary',
    '',
    snapshot
      ? `- PASS: Captured the Phase 5 replay snapshot at block ${snapshot.block} / ${snapshot.pc}: D007CA=${snapshot.fieldsObject?.D007CA}, VAT=${snapshot.fieldsObject?.D02590}.`
      : '- FAIL: No Phase 5 replay snapshot was captured.',
    restore?.ok
      ? `- PASS: Replayed the snapshot before Phase 6; replay restored D007CA=${restore.after?.replayFields?.D007CA}, VAT=${restore.after?.replayFields?.D02590}.`
      : '- FAIL: Snapshot replay did not run.',
    p6?.result
      ? `- PASS: Browser Phase 6 ended ${p6.result.termination} after ${p6.result.steps} steps at ${hex(p6.result.lastPc)}; 0x084711 hits=${p6Stats?.targetCounts?.vatLoop084711 ?? 'n/a'}, VRAM=${p6.vramPixels}px.`
      : '- FAIL: Browser Phase 6 result was not recorded.',
    `- ${data?.eolSeeded ? 'PASS' : 'FAIL'}: Escape/CLEAR seed used live D007CA+D008E0 (${data?.eolVatLive ? 'VAT live' : 'VAT zero by key entry'}); route=${eolPath}; token/tail hits=${eol.tokenHookHits}, low-path hits=${eol.lowPathHits}, cleanup hits=${eol.cleanupHits}.`,
    `- ${data?.digit2Seeded ? 'PASS' : 'FAIL'}: Digit2 seed used live D007CA+D008E0 (${data?.digit2VatLive ? 'VAT live' : 'VAT zero by key entry'}); route=${digit2Path}; token/tail hits=${digit2.tokenHookHits}, low-path hits=${digit2.lowPathHits}, cleanup hits=${digit2.cleanupHits}.`,
    data?.errors?.length === 0
      ? '- PASS: Page error collector saw no browser exceptions.'
      : `- FAIL: Page errors: ${JSON.stringify(data?.errors ?? [])}`,
    '',
    '## Interpretation',
    '',
    'With the phase655 replay active, Phase 6 starts from live VAT and halts cleanly. In the phase637-style retest, the one-shot pre-key AutoRun frame still falls into the low-transfer/status path and zeroes the replayed VAT/core RAM before the key bursts. The browser key handler re-arms D007CA and D008E0 for each key, so cxMain is reached, but both Escape/CLEAR and Digit2 still route through the low-transfer/status path instead of the token/tail hooks (`0x08F5E1`, `0x090992`, `0x09098E`, `0x08F54B`).',
    '',
    '## Key Records',
    '',
    '```json',
    JSON.stringify({
      beforeBoot: data?.beforeBoot,
      afterColdboot: data?.afterColdboot,
      afterAutoRun: data?.afterAutoRun,
      afterEol: data?.afterEol,
      afterDigit2: data?.afterDigit2,
      eol,
      digit2,
      errors: data?.errors,
    }, null, 2),
    '```',
    '',
    'No source files from the browser shell, runtime, transpiler, or scheduler were modified; this probe serves an instrumented HTML copy from memory.',
    '',
  ];
  return `${lines.join('\n')}\n`;
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
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(ws, '!!window.__phase656 && !!window.getColdbootPersistenceDiagnostics', 'phase656 instrumentation', 30000);
  await sleep(1000);

  await evalExpr(ws, `(() => {
    window.__phase656Errors = [];
    window.addEventListener('error', (e) => window.__phase656Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__phase656Errors.push(String(e.reason || e)));
    return true;
  })()`);

  const beforeBoot = await readPageState(ws);
  const clickResult = await evalExpr(ws, `(() => {
    const boot = document.getElementById('btnBoot');
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    boot.click();
    return { disabled: boot.disabled, status: document.getElementById('status').textContent };
  })()`);
  console.log(JSON.stringify({ phase: 'boot-click', clickResult }));

  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 150000);
  const afterColdboot = await readPageState(ws);

  await evalExpr(ws, `document.getElementById('btnAutoRun').click(); true;`);
  await waitFor(ws, `document.getElementById('btnAutoRun').textContent === 'AutoRun'`, 'autorun stopped', 20000);
  const afterAutoRun = await readPageState(ws);

  const eolRecord = await pressKey(ws, { label: 'EOL/CLEAR', code: 'Escape', key: 'Escape', vk: 27, text: '' });
  const afterEol = await readPageState(ws);
  const digit2Record = await pressKey(ws, { label: 'Digit2', code: 'Digit2', key: '2', vk: 50 });
  const afterDigit2 = await readPageState(ws);
  const errors = await evalExpr(ws, 'window.__phase656Errors');
  const pageState = await readPageState(ws);

  const p6 = pageState.phase656?.records?.find((record) => record.label === 'browser-after-p6-home-repaint');
  const p6Stats = pageState.phase656?.phaseStats?.['browser-p6-home-repaint'];
  const replayOk = Boolean(
    pageState.phase656?.snapshot
      && pageState.phase656?.restore?.ok
      && p6?.result?.termination === 'halt'
      && p6?.result?.lastPc === 0x0019B5
      && (p6Stats?.targetCounts?.vatLoop084711 ?? 9999) < 100
      && p6?.vramPixels > 100,
  );
  const eolSeeded = hasSeedSignal(eolRecord, 0x0F);
  const digit2Seeded = hasSeedSignal(digit2Record, 0x90);
  const eolVatLive = hasLiveVatSignal(eolRecord, 0x0F);
  const digit2VatLive = hasLiveVatSignal(digit2Record, 0x90);
  const eolAnswered = eolSeeded && routeAnswered(eolRecord);
  const digit2Answered = digit2Seeded && routeAnswered(digit2Record);
  const pass = replayOk && eolAnswered && digit2Answered && errors.length === 0;

  summary = {
    probe: 'phase656-browser-token-retest',
    chromePath,
    pageUrl,
    pass,
    replayOk,
    beforeBoot,
    afterColdboot,
    afterAutoRun,
    afterEol,
    afterDigit2,
    eolRecord,
    digit2Record,
    errors,
    eolSeeded,
    digit2Seeded,
    eolVatLive,
    digit2VatLive,
    eolAnswered,
    digit2Answered,
    ...pageState,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    replayOk,
    eolSeeded,
    digit2Seeded,
    eolVatLive,
    digit2VatLive,
    eol: routeSummary(eolRecord),
    digit2: routeSummary(digit2Record),
    errors,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = {
    probe: 'phase656-browser-token-retest',
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

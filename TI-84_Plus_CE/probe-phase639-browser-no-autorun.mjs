import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const shellRoot = import.meta.dirname;
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) {
  throw new Error('No Chrome/Edge executable found for headless browser test');
}

const debugPort = 9639;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase639-'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return 'application/octet-stream';
}

function instrumentBrowserShell(html) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) {
    throw new Error('Instrumentation marker not found in browser-shell.html');
  }

  const injection = String.raw`
const PHASE639_TARGETS = Object.freeze({
  cleanup0018f8: 0x0018F8,
  halt0019b5: 0x0019B5,
  getCsc03fa09: 0x03FA09,
  loop08c331: 0x08C331,
  outer08f3b8: 0x08F3B8,
  tokenReader090883: 0x090883,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  tokenStore09098e: 0x09098E,
  eolTuple08f54b: 0x08F54B,
  low006d38: 0x006D38,
  low006d4f: 0x006D4F,
  low006d5d: 0x006D5D,
});

function phase639Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase639ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i++) value |= (mem[addr + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase639ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return {
    D00587: mem[0xD00587] ?? 0,
    D0058C: mem[0xD0058C] ?? 0,
    D0058D: mem[0xD0058D] ?? 0,
    D0058E: mem[0xD0058E] ?? 0,
    D00080: mem[0xD00080] ?? 0,
    D0009F: mem[0xD0009F] ?? 0,
    D007CA: phase639ReadValue(mem, 0xD007CA, 3),
    D008E0: phase639ReadValue(mem, 0xD008E0, 3),
    D02A28: mem[0xD02A28] ?? 0,
    D001B8: mem[0xD001B8] ?? 0,
    D001D3: mem[0xD001D3] ?? 0,
    D02A29: phase639ReadValue(mem, 0xD02A29, 2),
    D02A2B: phase639ReadValue(mem, 0xD02A2B, 2),
    D02A1B: phase639ReadValue(mem, 0xD02A1B, 2),
    D0059A: mem[0xD0059A] ?? 0,
    D01150: phase639ReadValue(mem, 0xD01150, 2),
    D0243D: phase639ReadValue(mem, 0xD0243D, 3),
    D02A40: phase639ReadValue(mem, 0xD02A40, 3),
    VAT_D02590: phase639ReadValue(mem, 0xD02590, 3),
  };
}

function phase639ReadRuntimeState() {
  return {
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
    fields: phase639ReadFields(),
    diagnostics: getColdbootPersistenceDiagnostics(),
    vramPixels: countVRAMPixels(),
    status: document.getElementById('status')?.textContent ?? null,
  };
}

function phase639CreateRecord(label) {
  return {
    label,
    start: phase639ReadRuntimeState(),
    end: null,
    totalBlocks: 0,
    counts: Object.fromEntries(Object.keys(PHASE639_TARGETS).map((name) => [name, 0])),
    regionCounts: {
      token08f000_090fff: 0,
      display090000_091fff: 0,
      low006d00_006dff: 0,
      cleanupLow001000_001fff: 0,
    },
    firstBlocks: [],
    lastBlocks: [],
    targetSamples: [],
    targetSampleLimits: {},
    fieldTransitions: [],
    hotBlocks: {},
    lastFields: phase639ReadFields(),
  };
}

function phase639CurrentRecord() {
  const state = window.__phase639State;
  if (!state.records.length || state.currentLabel == null) {
    state.currentLabel = state.currentLabel || 'unlabeled';
    state.records.push(phase639CreateRecord(state.currentLabel));
  }
  return state.records[state.records.length - 1];
}

function phase639FieldsDiffer(a, b) {
  if (!a || !b) return false;
  return Object.keys(a).some((key) => a[key] !== b[key]);
}

function phase639DiffFields(a, b) {
  const diff = {};
  if (!a || !b) return diff;
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) diff[key] = [a[key], b[key]];
  }
  return diff;
}

window.__phase639State = {
  currentLabel: null,
  records: [],
  read: phase639ReadRuntimeState,
  begin(label) {
    this.currentLabel = label;
    const record = phase639CreateRecord(label);
    this.records.push(record);
    return record.start;
  },
  finish() {
    const record = this.records[this.records.length - 1] ?? null;
    if (record) {
      record.end = phase639ReadRuntimeState();
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 32)
        .map(([pc, count]) => ({ pc, count }));
    }
    this.currentLabel = null;
    return record;
  },
  all() {
    return this.records;
  },
};
window.__phase639 = window.__phase639State;

const phase639OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase639ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase639CurrentRecord();
  record.totalBlocks++;

  const pcHex = phase639Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 64) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 64) record.lastBlocks.shift();

  for (const [name, target] of Object.entries(PHASE639_TARGETS)) {
    if (addr === target) {
      record.counts[name]++;
      const targetSampleCount = record.targetSampleLimits[name] ?? 0;
      if (targetSampleCount < 3 && record.targetSamples.length < 80) {
        record.targetSamples.push({
          block: record.totalBlocks,
          pc: pcHex,
          target: name,
          before: phase639ReadFields(),
          runtime: { lastPc, lastMode, totalSteps },
        });
        record.targetSampleLimits[name] = targetSampleCount + 1;
      }
    }
  }

  if (addr >= 0x08F000 && addr <= 0x090FFF) record.regionCounts.token08f000_090fff++;
  if (addr >= 0x090000 && addr <= 0x091FFF) record.regionCounts.display090000_091fff++;
  if (addr >= 0x006D00 && addr <= 0x006DFF) record.regionCounts.low006d00_006dff++;
  if (addr >= 0x001000 && addr <= 0x001FFF) record.regionCounts.cleanupLow001000_001fff++;

  const beforeFields = phase639ReadFields();
  const result = phase639OriginalObserveColdbootPersistenceBlock(state, pc);
  const afterFields = phase639ReadFields();

  if (phase639FieldsDiffer(record.lastFields, afterFields) && record.fieldTransitions.length < 100) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      diff: phase639DiffFields(record.lastFields, afterFields),
      beforeHook: beforeFields,
      afterHook: afterFields,
    });
  }
  record.lastFields = afterFields;
  return result;
};
`;

  return html.replace(marker, `${injection}\n\n${marker}`);
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
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
        const html = fs.readFileSync(fullPath, 'utf8');
        res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
        res.end(instrumentBrowserShell(html));
        return;
      }
      res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
      fs.createReadStream(fullPath).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error?.stack || error));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
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
  const ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (event) => {
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
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

let nextId = 1;
const pending = new Map();

function cdp(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 120000);
  });
}

async function evalExpr(ws, expression, timeout = 120000) {
  const result = await cdp(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception');
  }
  return result.result.value;
}

async function waitFor(ws, expression, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    const value = await evalExpr(ws, expression, 10000);
    lastValue = value;
    if (value) return value;
    await sleep(250);
  }
  const diagnostics = await readPageState(ws).catch((error) => ({ diagnosticError: error.message }));
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

async function pressKey(ws, item) {
  await evalExpr(ws, `window.__phase639.begin(${JSON.stringify(item.label)}); true;`);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(item.code, item.key, item.vk, item.text ?? item.key));
  await cdp(ws, 'Input.dispatchKeyEvent', { ...keyParams(item.code, item.key, item.vk, ''), type: 'keyUp' });
  await sleep(250);
  return await evalExpr(ws, 'window.__phase639.finish()');
}

async function readPageState(ws) {
  return await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    preserve: document.getElementById('preserveDisplay')?.checked ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
    diagnostics: window.getColdbootPersistenceDiagnostics?.() ?? null,
    phase639: window.__phase639?.read?.() ?? null,
    vramPixels: window.countVRAMPixels?.() ?? null,
    errors: window.__phase639Errors || [],
    infoLogTail: Array.from(document.getElementById('log')?.querySelectorAll('.info') || []).slice(-12).map((n) => n.textContent),
  }))()`);
}

function targetSummary(record) {
  return {
    label: record?.label,
    totalBlocks: record?.totalBlocks,
    counts: record?.counts,
    regionCounts: record?.regionCounts,
    startFields: record?.start?.fields,
    endFields: record?.end?.fields,
    startPc: record?.start?.lastPc,
    endPc: record?.end?.lastPc,
    status: record?.end?.status,
    firstBlocks: record?.firstBlocks?.slice(0, 16),
    lastBlocks: record?.lastBlocks?.slice(-16),
    hotBlocks: record?.hotBlocks?.slice(0, 12),
    targetSamples: record?.targetSamples?.slice(0, 32),
    fieldTransitions: record?.fieldTransitions?.slice(0, 24),
  };
}

function hasSeedSignal(record, expected) {
  const candidates = [
    record?.start?.fields,
    ...(record?.targetSamples ?? []).map((sample) => sample.before),
    ...(record?.fieldTransitions ?? []).flatMap((transition) => [transition.beforeHook, transition.afterHook]),
  ].filter(Boolean);
  return candidates.some((fields) => fields.D0058C === expected
    && fields.D0058D === expected
    && fields.D0058E === expected
    && (fields.D00080 & 0x08) !== 0
    && (fields.D0009F & 0x20) !== 0);
}

function hookHitCount(record) {
  const counts = record?.counts ?? {};
  return (counts.tokenExit08f5e1 ?? 0)
    + (counts.tokenGate090992 ?? 0)
    + (counts.tokenStore09098e ?? 0)
    + (counts.eolTuple08f54b ?? 0);
}

function classifyRoute(record) {
  const counts = record?.counts ?? {};
  if (hookHitCount(record) > 0) return 'hook-route';
  if ((record?.regionCounts?.low006d00_006dff ?? 0) > 1000) return 'low-rom-route';
  if ((counts.cleanup0018f8 ?? 0) > 0) return 'cleanup-no-hook-route';
  return 'undetermined';
}

function buildReport(summary) {
  const eol = targetSummary(summary.eolRecord);
  const digit2 = targetSummary(summary.digit2Record);
  const beforeFields = summary.before?.phase639?.fields ?? {};
  const lines = [
    '# Phase 639: Browser Hook Routing Without Post-Coldboot AutoRun',
    '',
    'Probe: `probe-phase639-browser-no-autorun.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase639-browser-no-autorun.mjs`  ',
    `Exit: ${summary.pass ? 0 : 1}`,
    '',
    '## Summary',
    '',
    `- ${summary.readyStateLive ? '***' : '!!'} Skipped the phase626/637 manual AutoRun frame. Immediately after "Coldboot complete", status="${summary.before?.status}", lastPc=0x${(summary.before?.phase639?.lastPc ?? 0).toString(16)}, D007CA=0x${(beforeFields.D007CA ?? 0).toString(16).padStart(6, '0')}, VAT=0x${(beforeFields.VAT_D02590 ?? 0).toString(16).padStart(6, '0')}, VRAM=${summary.before?.vramPixels}px.`,
    `- ${summary.eolSeeded ? '***' : '!!'} EOL/CLEAR route=${summary.eolRoute}; counters: 0x08F5E1=${eol.counts?.tokenExit08f5e1 ?? 'n/a'}, 0x090992=${eol.counts?.tokenGate090992 ?? 'n/a'}, 0x08F54B=${eol.counts?.eolTuple08f54b ?? 'n/a'}, 0x0018F8=${eol.counts?.cleanup0018f8 ?? 'n/a'}, low006d=${eol.regionCounts?.low006d00_006dff ?? 'n/a'}, final VRAM=${summary.afterEol?.vramPixels}.`,
    `- ${summary.digit2Seeded ? '***' : '!!'} Digit2 route=${summary.digit2Route}; counters: 0x08F5E1=${digit2.counts?.tokenExit08f5e1 ?? 'n/a'}, 0x090992=${digit2.counts?.tokenGate090992 ?? 'n/a'}, 0x08F54B=${digit2.counts?.eolTuple08f54b ?? 'n/a'}, 0x0018F8=${digit2.counts?.cleanup0018f8 ?? 'n/a'}, low006d=${digit2.regionCounts?.low006d00_006dff ?? 'n/a'}, final VRAM=${summary.afterDigit2?.vramPixels}.`,
    `- ${summary.routeChanged ? '***' : '***'} Result: ${summary.routeChanged ? 'skipping AutoRun restored at least one token/tuple hook route.' : 'skipping AutoRun did not restore the token/tuple hook route; both keys still bypassed 0x08F5E1/0x090992/0x08F54B.'}`,
    '',
    '## Interpretation',
    '',
    summary.routeChanged
      ? 'The extra AutoRun frame is not required for the browser to reach at least one of the proven persistence hook addresses. The next step is to rerun the phase637 token/tuple persistence assertions from this no-AutoRun starting state and integrate that browser flow.'
      : 'The extra AutoRun frame is not the only cause of the hook miss. The no-AutoRun coldboot-ready state still starts key bursts at the event-loop entry and seeds the pending key, but both tested keys route through cleanup and the low 0x006Dxx loop while never entering the proven token-output or EOL tuple-save addresses. The remaining blocker is therefore upstream coldboot/repaint state, not merely the post-coldboot AutoRun click.',
    '',
    '## Key Records',
    '',
    '```json',
    JSON.stringify({
      before: summary.before,
      afterEol: summary.afterEol,
      afterDigit2: summary.afterDigit2,
      eol,
      digit2,
      errors: summary.errors,
    }, null, 2),
    '```',
    '',
  ];
  return `${lines.join('\n')}`;
}

let ws;
let chrome;
let server;
let summary;

try {
  server = await startStaticServer();
  const serverPort = server.address().port;
  const pageUrl = `http://127.0.0.1:${serverPort}/browser-shell.html`;

  chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    pageUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsUrl = await waitForDevtools();
  ws = await connect(wsUrl);
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(ws, '!!window.__phase639 && !!window.getColdbootPersistenceDiagnostics', 'phase639 instrumentation', 30000);
  await sleep(1000);

  await evalExpr(ws, `(() => {
    window.__phase639Errors = [];
    window.addEventListener('error', (e) => window.__phase639Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__phase639Errors.push(String(e.reason || e)));
    return true;
  })()`);

  const clickResult = await evalExpr(ws, `(() => {
    const boot = document.getElementById('btnBoot');
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    boot.click();
    return { disabled: boot.disabled, status: document.getElementById('status').textContent };
  })()`);
  console.log(JSON.stringify({ phase: 'boot-click', clickResult }));
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 150000);

  const before = await readPageState(ws);
  const eolRecord = await pressKey(ws, { label: 'NoAutoRun EOL/CLEAR', code: 'Escape', key: 'Escape', vk: 27, text: '' });
  const afterEol = await readPageState(ws);
  const digit2Record = await pressKey(ws, { label: 'NoAutoRun Digit2', code: 'Digit2', key: '2', vk: 50 });
  const afterDigit2 = await readPageState(ws);
  const errors = await evalExpr(ws, 'window.__phase639Errors');

  const eolSeeded = hasSeedSignal(eolRecord, 0x0F);
  const digit2Seeded = hasSeedSignal(digit2Record, 0x90);
  const eolRoute = classifyRoute(eolRecord);
  const digit2Route = classifyRoute(digit2Record);
  const routeChanged = hookHitCount(eolRecord) > 0 || hookHitCount(digit2Record) > 0;
  const readyStateLive = before.status.includes('Coldboot complete')
    && before.autoRunText === 'AutoRun'
    && (before.phase639?.fields?.D007CA ?? 0) === 0x0585E9;
  const completed = (eolRecord?.totalBlocks ?? 0) > 1000 && (digit2Record?.totalBlocks ?? 0) > 1000;
  const pass = readyStateLive && completed && eolSeeded && digit2Seeded && errors.length === 0;

  summary = {
    probe: 'phase639-browser-no-autorun',
    chromePath,
    pageUrl,
    before,
    afterEol,
    afterDigit2,
    eolRecord,
    digit2Record,
    errors,
    eolSeeded,
    digit2Seeded,
    eolRoute,
    digit2Route,
    routeChanged,
    readyStateLive,
    pass,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    readyStateLive,
    eolSeeded,
    digit2Seeded,
    eolRoute,
    digit2Route,
    routeChanged,
    before: {
      status: before.status,
      vramPixels: before.vramPixels,
      fields: before.phase639?.fields,
    },
    eol: {
      counts: eolRecord.counts,
      regionCounts: eolRecord.regionCounts,
      hotBlocks: eolRecord.hotBlocks.slice(0, 12),
      firstTargetSamples: eolRecord.targetSamples.slice(0, 8),
    },
    digit2: {
      counts: digit2Record.counts,
      regionCounts: digit2Record.regionCounts,
      hotBlocks: digit2Record.hotBlocks.slice(0, 12),
      firstTargetSamples: digit2Record.targetSamples.slice(0, 8),
    },
    errors,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  if (summary) {
    fs.writeFileSync(path.join(import.meta.dirname, 'phase639-browser-no-autorun.md'), buildReport(summary));
  }
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  await sleep(500);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

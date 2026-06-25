import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase834-browser-eol-route.md');
const debugPort = 9797;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase834-eol-'));
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
  D008E0: 0xD1A866,
  D02590: 0xD3FE81,
});

let nextId = 1;
const pending = new Map();
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
    }
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
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
  const params = {
    type,
    windowsVirtualKeyCode: EXPECTED.vk,
    nativeVirtualKeyCode: EXPECTED.vk,
    code: EXPECTED.code,
    key: EXPECTED.key,
  };
  return params;
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

function buildReport(data) {
  const key = data?.state?.lastKey ?? {};
  const diag = data?.state?.diagnostics ?? {};
  const checks = data?.classification?.checks ?? {};
  const checkRows = Object.entries(checks).map(([name, ok]) => `| ${name} | ${ok ? 'PASS' : 'FAIL'} |`);
  return [
    '# Phase 834 Browser EOL Route',
    '',
    'Probe: `probe-phase834-browser-eol-route.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase834-browser-eol-route.mjs`',
    '',
    'Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, presses browser EOL (`Escape`), and classifies the current route without patching the browser shell.',
    '',
    '## Result',
    '',
    data?.error
      ? `- Probe failed: ${data.error.split('\n')[0]}`
      : `- Classification: ${data.classification.classification}.`,
    data?.error
      ? ''
      : `- Escape termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, controlStopPc=${hex(key.controlStopPc)}, controlStopLabel=${key.controlPreStopLabel ?? '-'}, stoppedBeforeControlClear=${key.stoppedBeforeControlClear}.`,
    data?.error
      ? ''
      : `- UI clear: applied=${key.uiClearApplied}, roi=${key.uiClearResult?.roiBefore ?? '-'}->${key.uiClearResult?.roiAfter ?? '-'}, D0243A=${hex(diag.D0243A)}, buffer=${(diag.buffer ?? []).map((v) => hex(v, 2)).join(' ')}.`,
    data?.error
      ? ''
      : `- Fields: D007CA=${hex(diag.D007CA)}, D008E0=${hex(diag.D008E0)}, D02590=${hex(diag.D02590)}, D0243D=${hex(diag.D0243D)}.`,
    data?.error
      ? ''
      : `- Tuple/engine evidence: tupleCoreSignal=${data.classification.tupleCoreSignal}, tupleRestoreLog=${data.classification.hasTupleRestoreLog}, tupleDiffs=${JSON.stringify(data.classification.tupleDiffs ?? {})}, persistence=${JSON.stringify(data.state.persistence ?? null)}.`,
    data?.error
      ? ''
      : `- Cleanup/display: wipes=${key.wipes ?? '-'}, VRAM current=${diag.vramCurrent ?? '-'}, keyPeak=${key.vramPeak ?? '-'}.`,
    data?.error
      ? ''
      : `- Page errors: ${JSON.stringify(data.state.pageErrors ?? [])}`,
    '',
    '## Checks',
    '',
    data?.error ? '_No checks._' : ['| Check | Status |', '| --- | --- |', ...checkRows].join('\n'),
    '',
    '## Pre-Key Browser State',
    '',
    data?.error ? '_No pre-key snapshot._' : ['```json', JSON.stringify(data.state.preKey ?? null, null, 2), '```'].join('\n'),
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
  ].join('\n');
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
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(1000);

  await evalExpr(ws, `(() => {
    window.__phase834PageErrors = [];
    window.addEventListener('error', (event) => {
      window.__phase834PageErrors.push(String(event.message || event.error || event));
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__phase834PageErrors.push(String(event.reason || event));
    });
    return true;
  })()`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);

  const preKey = await evalExpr(ws, `(() => ({
    editLine: window.__coldbootReadEditLineState?.() ?? null,
    persistence: window.__coldbootPersistenceDiagnostics?.() ?? window.getColdbootPersistenceDiagnostics?.() ?? null,
    status: document.getElementById('status')?.textContent ?? null,
  }))()`, 30000);

  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${EXPECTED.code}'`, 'Escape completion', 30000);
  await sleep(150);

  const state = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    scanText: document.getElementById('scanCode')?.textContent ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    persistence: window.__coldbootPersistenceDiagnostics?.() ?? window.getColdbootPersistenceDiagnostics?.() ?? null,
    logText: (document.getElementById('log')?.textContent ?? '').slice(-4000),
    pageErrors: window.__phase834PageErrors ?? [],
    preKey: ${JSON.stringify(preKey)},
  }))()`, 30000);
  const classification = classify(state);
  return { probe: 'phase834-browser-eol-route', chromePath, pageUrl, pass: classification.classification !== 'OTHER', classification, state };
}

try {
  summary = await run();
  console.log(JSON.stringify({
    probe: summary.probe,
    classification: summary.classification,
    lastKey: summary.state?.lastKey,
    diagnostics: summary.state?.diagnostics,
    persistence: summary.state?.persistence,
    pageErrors: summary.state?.pageErrors,
  }, null, 2));
} catch (error) {
  summary = { probe: 'phase834-browser-eol-route', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

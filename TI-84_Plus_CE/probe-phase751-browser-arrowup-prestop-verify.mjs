import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase751-browser-arrowup-prestop-verify.md');
const debugPort = 9751;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase751-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

let nextId = 1;
const pending = new Map();
const pageErrors = [];
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
      const fullPath = path.resolve(__dirname, rel);
      if (fullPath !== __dirname && !fullPath.startsWith(`${__dirname}${path.sep}`)) {
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
      pageErrors.push(msg.params?.exceptionDetails?.exception?.description
        || msg.params?.exceptionDetails?.text
        || JSON.stringify(msg.params?.exceptionDetails || {}));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      pageErrors.push(msg.params.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ') || 'console error');
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

async function sendArrowUp(socket) {
  const key = {
    key: 'ArrowUp',
    code: 'ArrowUp',
    windowsVirtualKeyCode: 38,
    nativeVirtualKeyCode: 38,
  };
  await cdp(socket, 'Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await cdp(socket, 'Input.dispatchKeyEvent', { type: 'keyUp', ...key });
}

function hasCorrupt202020(state) {
  const fields = [
    state?.lastKey?.D007CA,
    state?.lastKey?.D008E0,
    state?.lastKey?.D0243A,
    state?.lastKey?.D0243D,
    state?.lastKey?.D02590,
    state?.diagnostics?.D007CA,
    state?.diagnostics?.D008E0,
    state?.diagnostics?.D0243A,
    state?.diagnostics?.D0243D,
    state?.diagnostics?.D02590,
  ];
  return fields.some((value) => value === 0x202020);
}

function buildReport(data) {
  const key = data?.state?.lastKey;
  const diag = data?.state?.diagnostics;
  const lines = [
    '# Phase 751 Browser ArrowUp Pre-Stop Verify',
    '',
    'Probe: `probe-phase751-browser-arrowup-prestop-verify.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase751-browser-arrowup-prestop-verify.mjs`',
    '',
    'Serves the real `browser-shell.html`, boots coldboot with Preserve Display,',
    'presses `ArrowUp`, and verifies the browser patch stops before',
    '`0x0A229D` reaches the corrupt `0x0A22A4` space-fill tail.',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    key
      ? `- ArrowUp stop: pc=${hex(key.controlStopPc)}, termination=${key.termination}, uiClear=${key.uiClearApplied}, steps=${key.steps}.`
      : '- ArrowUp key state was not exposed on `window.__coldbootLastKey`.',
    diag
      ? `- State: D007CA=${hex(diag.D007CA)}, D02590=${hex(diag.D02590)}, cursor=${hex(diag.D0243A)}, VRAM=${data?.state?.vram}.`
      : '- Diagnostics unavailable.',
    `- Page errors: ${JSON.stringify(data?.pageErrors ?? [])}`,
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
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

  ws = await connect(await waitForDevtools());
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);

  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sendArrowUp(ws);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'ArrowUp'`, 'ArrowUp key completion', 180000);

  const state = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    phase6: window.__coldbootPhase6 || null,
    lastKey: window.__coldbootLastKey || null,
    diagnostics: window.__coldbootReadEditLineState?.() || null,
    persistence: window.getColdbootPersistenceDiagnostics?.() || null,
    vram: window.countVRAMPixels?.() ?? null,
  }))()`);

  const key = state.lastKey;
  const diag = state.diagnostics;
  const pass = Boolean(
    key
    && key.code === 'ArrowUp'
    && key.termination === 'control_pre_stop'
    && key.controlPreStopPc === 0x0A229D
    && key.controlStopPc === 0x0A229D
    && key.controlPreStopLabel === 'arrow-up-space-fill-bc-zero-owner'
    && key.uiClearApplied === false
    && key.uiClearResult === null
    && key.D007CA === 0x0585E9
    && key.D02590 === 0xD3FE81
    && key.D0243A === 0xD1A8CC
    && key.termination !== 'missing_block'
    && diag?.D007CA === 0x0585E9
    && diag?.D02590 === 0xD3FE81
    && diag?.D0243A === 0xD1A8CC
    && !hasCorrupt202020(state)
    && pageErrors.length === 0,
  );

  summary = { probe: 'phase751-browser-arrowup-prestop-verify', chromePath, pageUrl, pass, pageErrors, state };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    controlStopPc: hex(key?.controlStopPc),
    termination: key?.termination,
    controlPreStopLabel: key?.controlPreStopLabel,
    uiClearApplied: key?.uiClearApplied,
    D007CA: hex(diag?.D007CA),
    D02590: hex(diag?.D02590),
    D0243A: hex(diag?.D0243A),
    corrupt202020: hasCorrupt202020(state),
    pageErrors,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = {
    probe: 'phase751-browser-arrowup-prestop-verify',
    pass: false,
    pageErrors,
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
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

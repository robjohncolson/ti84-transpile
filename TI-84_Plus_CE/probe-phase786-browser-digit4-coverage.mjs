import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase786-browser-digit4-coverage.md');
const debugPort = 9787;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase786-digit4-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const EXPECTED = Object.freeze({
  code: 'Digit4',
  key: '4',
  label: '4',
  vk: 52,
  expectedInsertByte: 0x34,
  D007CA: 0x0585E9,
  D008E0: 0xD1A863,
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
  if (type === 'keyDown') {
    params.text = EXPECTED.key;
    params.unmodifiedText = EXPECTED.key;
  }
  return params;
}

function classify(state) {
  const key = state?.lastKey ?? {};
  const diag = state?.diagnostics ?? {};
  const pageErrors = state?.pageErrors ?? [];
  const expectedCursor = key.cursorBefore == null ? null : ((key.cursorBefore + 1) & 0xFFFFFF);
  const checks = {
    code: key.code === EXPECTED.code,
    label: key.label === EXPECTED.label,
    expectedByte: key.expectedInsertByte === EXPECTED.expectedInsertByte,
    termination: key.termination === 'post_insert_gate_stop',
    inserted: key.insertBlock != null && key.postInsertGateBlock != null && key.stoppedAtPostInsertGate === true,
    cursorAdvanced: expectedCursor != null && key.D0243A === expectedCursor && diag.D0243A === expectedCursor,
    editBuffer: Array.isArray(key.buffer) && key.buffer[0] === EXPECTED.expectedInsertByte,
    d000c2Restored: key.D000C2Bit7Restored === true,
    noWipes: key.wipes === 0,
    D007CA: key.D007CA === EXPECTED.D007CA && diag.D007CA === EXPECTED.D007CA,
    D008E0: key.D008E0 === EXPECTED.D008E0 && diag.D008E0 === EXPECTED.D008E0,
    D02590: key.D02590 === EXPECTED.D02590 && diag.D02590 === EXPECTED.D02590,
    vramPreserved: (key.vramCurrent ?? 0) > 1000 && (diag.vramCurrent ?? 0) > 1000,
    noPageErrors: pageErrors.length === 0,
  };
  const cleanInsert = Object.values(checks).every(Boolean);
  const needsControlPreStop = !cleanInsert
    && (key.termination === 'max_steps' || key.controlStopPc === 0x001879 || key.wipes > 0);
  return {
    classification: cleanInsert ? 'CLEAN_INSERT' : needsControlPreStop ? 'CONTROL_PRE_STOP_CANDIDATE' : 'DIFFERENT_FAILURE',
    expectedCursor,
    checks,
    cleanInsert,
  };
}

function buildReport(data) {
  const key = data?.state?.lastKey ?? {};
  const diag = data?.state?.diagnostics ?? {};
  const checks = data?.classification?.checks ?? {};
  const checkRows = Object.entries(checks).map(([name, ok]) => `| ${name} | ${ok ? 'PASS' : 'FAIL'} |`);
  return [
    '# Phase 786 Browser Digit4 Coverage',
    '',
    'Probe: `probe-phase786-browser-digit4-coverage.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase786-browser-digit4-coverage.mjs`',
    '',
    'Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, presses `Digit4`, and classifies the coverage-sweep key without patching the browser shell.',
    '',
    '## Result',
    '',
    data?.error
      ? `- Probe failed: ${data.error.split('\n')[0]}`
      : `- Classification: ${data.classification.classification}.`,
    data?.error
      ? ''
      : `- Digit4 termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, insertBlock=${key.insertBlock ?? '-'}, postInsertGateBlock=${key.postInsertGateBlock ?? '-'}, expectedByte=${hex(key.expectedInsertByte, 2)}.`,
    data?.error
      ? ''
      : `- Cursor/buffer: cursorBefore=${hex(key.cursorBefore)}, D0243A=${hex(diag.D0243A)}, expectedCursor=${hex(data.classification.expectedCursor)}, buffer[0]=${hex(key.buffer?.[0], 2)}.`,
    data?.error
      ? ''
      : `- Fields: D007CA=${hex(diag.D007CA)}, D008E0=${hex(diag.D008E0)}, D02590=${hex(diag.D02590)}, D0243D=${hex(diag.D0243D)}.`,
    data?.error
      ? ''
      : `- Cleanup/display: wipes=${key.wipes ?? '-'}, D000C2Restored=${key.D000C2Bit7Restored}, VRAM current=${diag.vramCurrent ?? '-'}, keyPeak=${key.vramPeak ?? '-'}.`,
    data?.error
      ? ''
      : `- Page errors: ${JSON.stringify(data.state.pageErrors ?? [])}`,
    '',
    '## Checks',
    '',
    data?.error ? '_No checks._' : ['| Check | Status |', '| --- | --- |', ...checkRows].join('\n'),
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
    window.__phase786PageErrors = [];
    window.addEventListener('error', (event) => {
      window.__phase786PageErrors.push(String(event.message || event.error || event));
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__phase786PageErrors.push(String(event.reason || event));
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

  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${EXPECTED.code}'`, 'Digit4 completion', 30000);
  await sleep(150);

  const state = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    scanText: document.getElementById('scanCode')?.textContent ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    persistence: window.__coldbootPersistenceDiagnostics?.() ?? null,
    pageErrors: window.__phase786PageErrors ?? [],
  }))()`, 30000);
  const classification = classify(state);
  return { probe: 'phase786-browser-digit4-coverage', chromePath, pageUrl, pass: true, classification, state };
}

try {
  summary = await run();
  console.log(JSON.stringify({
    probe: summary.probe,
    classification: summary.classification,
    lastKey: summary.state?.lastKey,
    diagnostics: summary.state?.diagnostics,
    pageErrors: summary.state?.pageErrors,
  }, null, 2));
} catch (error) {
  summary = { probe: 'phase786-browser-digit4-coverage', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

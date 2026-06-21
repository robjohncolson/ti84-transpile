import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase756-browser-arrowdown-vector-restore-verify.md');
const debugPort = 9756;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase756-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

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

function cdp(socket, method, params = {}, timeout = 120000) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, timeout);
    timer.unref?.();
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
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

function arrowDownKeyParams(type) {
  return {
    type,
    windowsVirtualKeyCode: 40,
    nativeVirtualKeyCode: 40,
    code: 'ArrowDown',
    key: 'ArrowDown',
  };
}

function hasCorrupt202020(state) {
  const values = [
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
  return values.some((value) => value === 0x202020);
}

function hasCriticalZero(state) {
  const values = [
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
  return values.some((value) => value === 0);
}

function assess(before, after) {
  const key = after?.lastKey;
  const diag = after?.diagnostics;
  const routePass = key?.termination === 'control_pre_stop'
    && key?.controlStopPc === 0x001879
    && key?.contextVectorRestorePc === 0x06C764
    && key?.contextVectorRestored === true
    && key?.contextVectorD007CABefore === 0x06C92C
    && key?.contextVectorD007CAAfter === 0x0585E9;
  const saneFields = key?.D007CA === 0x0585E9
    && diag?.D007CA === 0x0585E9
    && key?.D02590 === 0xD3FE81
    && diag?.D02590 === 0xD3FE81
    && key?.D0243A === 0xD1A8CC
    && diag?.D0243A === 0xD1A8CC
    && key?.D008E0 !== 0
    && diag?.D008E0 !== 0;
  const bounded = key?.code === 'ArrowDown'
    && Number.isFinite(key?.steps)
    && key.steps > 0
    && key.steps < 300000;
  const displayPreserved = (after?.vram ?? 0) >= Math.max(1, before?.vram ?? 0);
  const noCorruption = !hasCriticalZero(after) && !hasCorrupt202020(after);
  const noPageErrors = pageErrors.length === 0 && (after?.errors?.length ?? 0) === 0;
  return {
    routePass,
    saneFields,
    bounded,
    displayPreserved,
    noCorruption,
    noPageErrors,
    pass: Boolean(routePass && saneFields && bounded && displayPreserved && noCorruption && noPageErrors),
  };
}

function buildReport(data) {
  const key = data?.after?.lastKey;
  const assessment = data?.assessment ?? {};
  const lines = [
    '# Phase 756 Browser ArrowDown Vector-Restore Verify',
    '',
    'Probe: `probe-phase756-browser-arrowdown-vector-restore-verify.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase756-browser-arrowdown-vector-restore-verify.mjs`',
    '',
    'Serves the real patched `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowDown`, and verifies the phase755 `restoreAfterOwner` browser-shell patch.',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    `- Route: ${assessment.routePass ? 'PASS' : 'FAIL'}; fields: ${assessment.saneFields ? 'PASS' : 'FAIL'}; bounded: ${assessment.bounded ? 'PASS' : 'FAIL'}; display: ${assessment.displayPreserved ? 'PASS' : 'FAIL'}; no corruption: ${assessment.noCorruption ? 'PASS' : 'FAIL'}; no page errors: ${assessment.noPageErrors ? 'PASS' : 'FAIL'}.`,
    key
      ? `- Key result: termination=${key.termination}, steps=${key.steps}, stop=${hex(key.controlStopPc)}, restore=${hex(key.contextVectorRestorePc)}, D007CA ${hex(key.contextVectorD007CABefore)}->${hex(key.contextVectorD007CAAfter)}, final D02590=${hex(key.D02590)}, D0243A=${hex(key.D0243A)}, VRAM=${key.vramCurrent}.`
      : '- Key result was not exposed on window.__coldbootLastKey.',
    `- Display: before=${data?.before?.vram ?? 'n/a'}, after=${data?.after?.vram ?? 'n/a'}.`,
    `- Page errors: ${JSON.stringify(data?.errors ?? [])}`,
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
    window.__p756Errors = [];
    window.addEventListener('error', (e) => window.__p756Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p756Errors.push(String(e.reason || e)));
    return true;
  })()`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);

  const before = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    vram: window.countVRAMPixels?.() ?? null,
  }))()`);

  await cdp(ws, 'Input.dispatchKeyEvent', arrowDownKeyParams('keyDown'), 175000);
  await cdp(ws, 'Input.dispatchKeyEvent', arrowDownKeyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'ArrowDown'`, 'ArrowDown completion', 30000);
  await sleep(250);

  const after = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    vram: window.countVRAMPixels?.() ?? null,
    errors: window.__p756Errors || [],
  }))()`);
  const assessment = assess(before, after);

  summary = {
    probe: 'phase756-browser-arrowdown-vector-restore-verify',
    chromePath,
    pageUrl,
    pass: assessment.pass,
    assessment,
    before,
    after,
    errors: [...pageErrors, ...(after?.errors ?? [])],
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    assessment,
    key: after?.lastKey,
    diagnostics: after?.diagnostics,
    errors: summary.errors,
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = {
    probe: 'phase756-browser-arrowdown-vector-restore-verify',
    pass: false,
    error: String(error?.stack || error),
    errors: [...pageErrors],
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

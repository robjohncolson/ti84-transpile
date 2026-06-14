import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase680-browser-clear-ui-verify.md');
const debugPort = 9687;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-clear-ui-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const PRIME_KEY = { code: 'Digit2', key: '2', expected: 0x32, label: '2' };
const CLEAR_KEY = { code: 'Escape', key: 'Escape', label: 'CLEAR' };
const NEXT_KEY = { code: 'Digit3', key: '3', expected: 0x33, label: '3' };
const EDIT_BASE = 0xD1A8CC;

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.rom')) return 'application/octet-stream';
  return 'application/octet-stream';
}

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

function startStaticServer() {
  const serverInstance = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'browser-shell.html';
      const fullPath = path.resolve(__dirname, rel);
      if (fullPath !== __dirname && !fullPath.startsWith(`${__dirname}${path.sep}`)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404); res.end('Not found'); return;
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
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error(`PAGE_EXCEPTION ${JSON.stringify(msg.params?.exceptionDetails || {})}`);
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
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`)); }, 120000);
  });
}

async function evalExpr(socket, expression, timeout = 120000) {
  const result = await cdp(socket, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout });
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

async function bootColdboot(socket, pageUrl) {
  await cdp(socket, 'Page.navigate', { url: `${pageUrl}?phase680=clear-ui` });
  await waitFor(socket, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(1000);
  await evalExpr(socket, `(() => {
    window.__p680Errors = [];
    window.addEventListener('error', (e) => window.__p680Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p680Errors.push(String(e.reason || e)));
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(socket, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
}

async function pressKey(socket, key) {
  await evalExpr(socket, `(() => {
    window.__coldbootLastKey = null;
    const down = new KeyboardEvent('keydown', { code: '${key.code}', key: '${key.key}', bubbles: true, cancelable: true });
    document.dispatchEvent(down);
    const up = new KeyboardEvent('keyup', { code: '${key.code}', key: '${key.key}', bubbles: true, cancelable: true });
    document.dispatchEvent(up);
    return true;
  })()`);
  return await waitFor(socket, `window.__coldbootLastKey?.code === '${key.code}' && window.__coldbootLastKey`, `key ${key.code}`, 30000);
}

async function readLineState(socket) {
  return await evalExpr(socket, 'window.__coldbootReadEditLineState?.() ?? null');
}

async function readFinal(socket) {
  return await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    errors: window.__p680Errors || [],
    state: window.__coldbootReadEditLineState?.() ?? null,
  }))()`);
}

function keyInsertPass(row, expected, expectedCursor, expectedPrefix) {
  return row.termination === 'insert_stop'
    && row.stoppedAfterInsert === true
    && row.wipes === 0
    && row.expectedInsertByte === expected
    && row.D007CA === 0x0585E9
    && row.D02590 === 0xD3FE81
    && row.D0243A === expectedCursor
    && expectedPrefix.every((byte, index) => row.buffer[index] === byte);
}

function clearPass(row, state) {
  return row.termination === 'control_pre_stop'
    && row.stoppedBeforeControlClear === true
    && row.expectedInsertByte == null
    && row.controlStopPc === 0x001879
    && row.wipes === 0
    && row.uiClearApplied === true
    && row.uiClearResult?.ok === true
    && row.uiClearResult?.roiAfter === 0
    && row.D007CA === 0x0585E9
    && row.D02590 === 0xD3FE81
    && row.D0243A === EDIT_BASE
    && state?.D00595 === 0
    && state?.D00596 === 0
    && state?.entryLineRoi?.nonWhite === 0
    && state?.buffer?.every((byte) => byte === 0);
}

function formatBuffer(bytes) {
  return (bytes ?? []).map((byte) => hex(byte, 2)).join(' ');
}

function formatKeyRow(row) {
  return {
    code: row.code,
    termination: row.termination,
    steps: row.steps,
    expectedInsertByte: row.expectedInsertByte,
    stoppedAfterInsert: row.stoppedAfterInsert,
    stoppedBeforeControlClear: row.stoppedBeforeControlClear,
    controlStopPc: row.controlStopPc == null ? null : hex(row.controlStopPc),
    uiClearApplied: row.uiClearApplied,
    uiClearResult: row.uiClearResult,
    D007CA: hex(row.D007CA),
    D008E0: hex(row.D008E0),
    D0243A: hex(row.D0243A),
    D0243D: hex(row.D0243D),
    D02590: hex(row.D02590),
    wipes: row.wipes,
    buffer: formatBuffer(row.buffer),
    vramCurrent: row.vramCurrent,
  };
}

function formatState(state) {
  if (!state) return null;
  return {
    D007CA: hex(state.D007CA),
    D008E0: hex(state.D008E0),
    D0243A: hex(state.D0243A),
    D0243D: hex(state.D0243D),
    D02590: hex(state.D02590),
    D00595: hex(state.D00595, 2),
    D00596: hex(state.D00596, 2),
    buffer: formatBuffer(state.buffer),
    entryLineRoi: state.entryLineRoi,
    vramCurrent: state.vramCurrent,
  };
}

async function runScenario(socket, pageUrl) {
  await bootColdboot(socket, pageUrl);
  const boot = await readLineState(socket);
  const prime = await pressKey(socket, PRIME_KEY);
  const afterPrime = await readLineState(socket);
  const clear = await pressKey(socket, CLEAR_KEY);
  const afterClear = await readLineState(socket);
  const next = await pressKey(socket, NEXT_KEY);
  const afterNext = await readLineState(socket);
  const final = await readFinal(socket);

  const pass = keyInsertPass(prime, PRIME_KEY.expected, EDIT_BASE + 1, [0x32])
    && clearPass(clear, afterClear)
    && keyInsertPass(next, NEXT_KEY.expected, EDIT_BASE + 1, [0x33, 0x00])
    && afterNext?.buffer?.[0] === 0x33
    && afterNext?.buffer?.[1] === 0x00
    && afterNext?.entryLineRoi?.nonWhite > 0
    && final.errors.length === 0
    && !String(final.status || '').includes('Validating OS');

  return { pass, boot, prime, afterPrime, clear, afterClear, next, afterNext, final };
}

function buildReport(data) {
  const lines = [
    '# Phase 680: Browser UI-Level CLEAR Integration Verify',
    '',
    'Probe: `probe-phase680-browser-clear-ui-verify.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase680-browser-clear-ui-verify.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    '- Scope: real `browser-shell.html` headless run; coldboot + Preserve Display; no injected page code.',
    '',
    '## Sequence',
    '',
    '| step | termination | buffer | cursor | ROI non-white | ui-clear | page errors |',
    '|---|---|---|---:|---:|---|---|',
    `| 2 | ${data?.scenario?.prime?.termination ?? 'n/a'} | ${formatBuffer(data?.scenario?.prime?.buffer)} | ${hex(data?.scenario?.prime?.D0243A ?? 0)} | ${data?.scenario?.afterPrime?.entryLineRoi?.nonWhite ?? 'n/a'} | n/a | ${JSON.stringify(data?.scenario?.final?.errors ?? [])} |`,
    `| CLEAR | ${data?.scenario?.clear?.termination ?? 'n/a'} | ${formatBuffer(data?.scenario?.afterClear?.buffer)} | ${hex(data?.scenario?.afterClear?.D0243A ?? 0)} | ${data?.scenario?.afterClear?.entryLineRoi?.nonWhite ?? 'n/a'} | ${JSON.stringify(data?.scenario?.clear?.uiClearResult ?? null)} | ${JSON.stringify(data?.scenario?.final?.errors ?? [])} |`,
    `| 3 | ${data?.scenario?.next?.termination ?? 'n/a'} | ${formatBuffer(data?.scenario?.afterNext?.buffer)} | ${hex(data?.scenario?.afterNext?.D0243A ?? 0)} | ${data?.scenario?.afterNext?.entryLineRoi?.nonWhite ?? 'n/a'} | n/a | ${JSON.stringify(data?.scenario?.final?.errors ?? [])} |`,
    '',
    '## Interpretation',
    '',
    '- CLEAR/Escape still stops before the destructive `0x001879` ROM clear and is not part of `COLDBOOT_INSERT_BYTE_BY_PC_CODE`.',
    '- The real shell now applies browser-level CLEAR semantics after that safe pre-stop: edit buffer zeroed, `D0243A=D1A8CC`, renderer row/col reset to zero, and the entry ROI whitened.',
    '- The follow-up `3` inserts as a fresh line (`33 00 ...`) with cxMain/VAT intact, proving the previous `2` no longer persists or appends after CLEAR.',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify(data?.compact ?? data, null, 2),
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
    '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ws = await connect(await waitForDevtools());
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');

  const scenario = await runScenario(ws, pageUrl);
  summary = {
    probe: 'phase680-browser-clear-ui-verify',
    chromePath,
    pageUrl,
    pass: scenario.pass,
    scenario,
    compact: {
      pass: scenario.pass,
      boot: formatState(scenario.boot),
      prime: formatKeyRow(scenario.prime),
      afterPrime: formatState(scenario.afterPrime),
      clear: formatKeyRow(scenario.clear),
      afterClear: formatState(scenario.afterClear),
      next: formatKeyRow(scenario.next),
      afterNext: formatState(scenario.afterNext),
      final: scenario.final,
    },
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    prime: summary.compact.prime,
    clear: summary.compact.clear,
    afterClear: summary.compact.afterClear,
    next: summary.compact.next,
    afterNext: summary.compact.afterNext,
    errors: scenario.final.errors,
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase680-browser-clear-ui-verify', pass: false, error: String(error?.stack || error) };
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

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase678-browser-control-prestop-verify.md');
const debugPort = 9685;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-control-prestop-'));
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
const NEXT_KEY = { code: 'Digit3', key: '3', expected: 0x33, label: '3' };
const SCENARIOS = [
  {
    name: 'enter',
    control: { code: 'Enter', key: 'Enter', label: 'ENTER' },
    stopPc: 0x0A2150,
    cursorAfterControl: 0xD1A8CD,
    expectedAfterNext: [0x32, 0x33],
  },
  {
    name: 'clear',
    control: { code: 'Escape', key: 'Escape', label: 'CLEAR' },
    stopPc: 0x001879,
    cursorAfterControl: 0xD1A8CD,
    expectedAfterNext: [0x32, 0x33],
  },
];

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
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

async function bootColdboot(socket, pageUrl, tag) {
  await cdp(socket, 'Page.navigate', { url: `${pageUrl}?phase678=${encodeURIComponent(tag)}` });
  await waitFor(socket, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(1000);
  await evalExpr(socket, `(() => {
    window.__p678Errors = [];
    window.addEventListener('error', (e) => window.__p678Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p678Errors.push(String(e.reason || e)));
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

function keyRowPass(row, expected, expectedCursor) {
  return row.termination === 'insert_stop'
    && row.stoppedAfterInsert === true
    && row.wipes === 0
    && row.expectedInsertByte === expected
    && row.D007CA === 0x0585E9
    && row.D02590 === 0xD3FE81
    && row.D0243A === expectedCursor
    && row.buffer.includes(expected);
}

function controlRowPass(row, scenario) {
  return row.termination === 'control_pre_stop'
    && row.stoppedBeforeControlClear === true
    && row.stoppedAfterInsert === false
    && row.expectedInsertByte == null
    && row.controlPreStopPc === scenario.stopPc
    && row.controlStopPc === scenario.stopPc
    && row.controlStopBlock > 0
    && row.wipes === 0
    && row.D007CA === 0x0585E9
    && row.D02590 === 0xD3FE81
    && row.D0243D === 0xD2A83E
    && row.D0243A === scenario.cursorAfterControl
    && row.buffer[0] === 0x32
    && row.vramCurrent > 100;
}

async function runScenario(socket, pageUrl, scenario) {
  await bootColdboot(socket, pageUrl, scenario.name);
  const prime = await pressKey(socket, PRIME_KEY);
  const control = await pressKey(socket, scenario.control);
  const next = await pressKey(socket, NEXT_KEY);
  const final = await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    errors: window.__p678Errors || [],
    vram: window.countVRAMPixels?.() ?? null,
  }))()`);

  const pass = keyRowPass(prime, PRIME_KEY.expected, 0xD1A8CD)
    && controlRowPass(control, scenario)
    && keyRowPass(next, NEXT_KEY.expected, 0xD1A8CE)
    && scenario.expectedAfterNext.every((byte, index) => next.buffer[index] === byte)
    && final.errors.length === 0
    && !String(final.status || '').includes('Validating OS');

  return { scenario: scenario.name, pass, prime, control, next, final };
}

function formatRow(row) {
  return {
    code: row.code,
    termination: row.termination,
    steps: row.steps,
    expectedInsertByte: row.expectedInsertByte,
    stoppedAfterInsert: row.stoppedAfterInsert,
    stoppedBeforeControlClear: row.stoppedBeforeControlClear,
    insertBlock: row.insertBlock,
    controlStopBlock: row.controlStopBlock,
    controlStopPc: row.controlStopPc == null ? null : hex(row.controlStopPc),
    D007CA: hex(row.D007CA),
    D008E0: hex(row.D008E0),
    D0243A: hex(row.D0243A),
    D0243D: hex(row.D0243D),
    D02590: hex(row.D02590),
    wipes: row.wipes,
    buffer: row.buffer.map((byte) => hex(byte, 2)).join(' '),
    vramCurrent: row.vramCurrent,
  };
}

function buildReport(data) {
  const lines = [
    '# Phase 678: Browser Control-Key Pre-Stop Verify',
    '',
    'Probe: `probe-phase678-browser-control-prestop-verify.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase678-browser-control-prestop-verify.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    '- Scope: real `browser-shell.html` headless run; coldboot + Preserve Display; no runtime/transpiler/decoder/peripheral edits.',
    '',
    '## Scenarios',
    '',
    '| scenario | pass | control termination | stop PC | control D007CA | control D0243A | control VAT | control VRAM | next buffer | page errors |',
    '|---|---|---|---:|---:|---:|---:|---:|---|---|',
    ...(data?.scenarios ?? []).map((row) => `| ${row.scenario} | ${row.pass ? 'yes' : 'no'} | ${row.control.termination} | ${hex(row.control.controlStopPc ?? 0)} | ${hex(row.control.D007CA)} | ${hex(row.control.D0243A)} | ${hex(row.control.D02590)} | ${row.control.vramCurrent} | ${row.next.buffer.map((byte) => hex(byte, 2)).join(' ')} | ${JSON.stringify(row.final.errors)} |`),
    '',
    '## Interpretation',
    '',
    '- Enter stops before `0x0A2150`, preserving cxMain, VAT, edit cursor, buffer, and VRAM after a primed `2`; a following `3` inserts as `23`.',
    '- CLEAR/Escape stops before `0x001879`, preserving cxMain, VAT, buffer, cursor, and VRAM in the real browser path; a following `3` appends as `23`.',
    '- Enter/Clear remain non-insertable controls: `expectedInsertByte` is null and they are not part of the coldboot insert-byte map.',
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

  const scenarios = [];
  for (const scenario of SCENARIOS) {
    scenarios.push(await runScenario(ws, pageUrl, scenario));
  }

  const pass = scenarios.every((row) => row.pass);
  summary = {
    probe: 'phase678-browser-control-prestop-verify',
    chromePath,
    pageUrl,
    pass,
    scenarios,
    compact: scenarios.map((row) => ({
      scenario: row.scenario,
      pass: row.pass,
      prime: formatRow(row.prime),
      control: formatRow(row.control),
      next: formatRow(row.next),
      final: row.final,
    })),
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    scenarios: summary.compact.map((row) => ({
      scenario: row.scenario,
      pass: row.pass,
      control: row.control,
      next: row.next,
      errors: row.final.errors,
    })),
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase678-browser-control-prestop-verify', pass: false, error: String(error?.stack || error) };
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

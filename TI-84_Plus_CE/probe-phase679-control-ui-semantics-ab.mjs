import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase679-control-ui-semantics-ab.md');
const debugPort = 9686;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-control-ui-semantics-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

const PRIME_KEY = { code: 'Digit2', key: '2', expected: 0x32, label: '2' };
const NEXT_KEY = { code: 'Digit3', key: '3', expected: 0x33, label: '3' };

const SCENARIOS = [
  {
    name: 'enter-current-preserve',
    control: { code: 'Enter', key: 'Enter', label: 'ENTER' },
    strategy: 'current',
    expectedControlTermination: 'control_pre_stop',
    expectedControlPc: 0x0A2150,
    expectedAfterNext: [0x32, 0x33],
    expectedCursorAfterNext: 0xD1A8CE,
  },
  {
    name: 'clear-current-preserve',
    control: { code: 'Escape', key: 'Escape', label: 'CLEAR' },
    strategy: 'current',
    expectedControlTermination: 'control_pre_stop',
    expectedControlPc: 0x001879,
    expectedAfterNext: [0x32, 0x33],
    expectedCursorAfterNext: 0xD1A8CE,
  },
  {
    name: 'clear-ui-level-reset',
    control: { code: 'Escape', key: 'Escape', label: 'CLEAR' },
    strategy: 'ui-clear',
    expectedControlTermination: 'control_pre_stop',
    expectedControlPc: 0x001879,
    expectedAfterNext: [0x33, 0x00],
    expectedCursorAfterNext: 0xD1A8CD,
  },
];

const PHASE679_INJECTION = `
window.__phase679SampleCanvasRoi = function(x = 0, y = 34, w = 128, h = 28) {
  const canvas = document.getElementById('lcd');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return { x, y, w, h, error: 'no-canvas-context' };
  const data = ctx.getImageData(x, y, w, h).data;
  let nonWhite = 0;
  let dark = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const isWhite = r >= 245 && g >= 245 && b >= 245;
      if (!isWhite) {
        nonWhite++;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      if (r < 96 && g < 96 && b < 96) dark++;
    }
  }
  return {
    x,
    y,
    w,
    h,
    nonWhite,
    dark,
    bbox: maxX < 0 ? null : [x + minX, y + minY, x + maxX, y + maxY],
  };
};

window.__phase679ReadState = function() {
  const mem = cpu?.memory;
  const read = (addr, len) => {
    if (!mem) return 0;
    let value = 0;
    for (let i = 0; i < len; i++) value |= mem[addr + i] << (i * 8);
    return value >>> 0;
  };
  return {
    hasMemory: Boolean(mem),
    runtimeMode,
    D007CA: read(0xD007CA, 3),
    D008E0: read(0xD008E0, 3),
    D0243A: read(0xD0243A, 3),
    D0243D: read(0xD0243D, 3),
    D02590: read(0xD02590, 3),
    D02A40: read(0xD02A40, 3),
    D00595: read(0xD00595, 1),
    D00596: read(0xD00596, 1),
    D00587: read(0xD00587, 1),
    D0058C: read(0xD0058C, 1),
    D0058D: read(0xD0058D, 1),
    D0058E: read(0xD0058E, 1),
    D00080: read(0xD00080, 1),
    buffer: mem ? Array.from(mem.slice(0xD1A8CC, 0xD1A8CC + 8)) : [],
    vramCurrent: window.countVRAMPixels?.() ?? null,
    roi: window.__phase679SampleCanvasRoi(),
    lastKey: window.__coldbootLastKey ?? null,
  };
};

window.__phase679ApplyUiClearLine = function() {
  const mem = cpu?.memory;
  if (!mem) return { ok: false, reason: 'no-memory' };
  const EDIT_BASE = 0xD1A8CC;
  const write24 = (addr, value) => {
    mem[addr] = value & 0xFF;
    mem[addr + 1] = (value >>> 8) & 0xFF;
    mem[addr + 2] = (value >>> 16) & 0xFF;
  };
  mem.fill(0, EDIT_BASE, EDIT_BASE + 0x80);
  write24(0xD0243A, EDIT_BASE);
  mem[0xD00595] = 0;
  mem[0xD00596] = 0;
  const vramBase = 0xD40000;
  for (let y = 34; y < 60; y++) {
    for (let x = 0; x < 128; x++) {
      const off = vramBase + ((y * 320 + x) << 1);
      mem[off] = 0xFF;
      mem[off + 1] = 0xFF;
    }
  }
  syncLCDState();
  lcd?.renderFrame?.();
  updateRegs();
  updateKeyStateDisplay();
  updateKeyboardOverlay();
  window.__phase679UiClearApplied = window.__phase679ReadState();
  return { ok: true, state: window.__phase679UiClearApplied };
};
`;

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => (
  value == null
    ? '-'
    : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`
);

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

function maybeInjectBrowserShell(fullPath) {
  if (path.basename(fullPath) !== 'browser-shell.html') {
    return fs.createReadStream(fullPath);
  }
  const html = fs.readFileSync(fullPath, 'utf8');
  const marker = 'window.countVRAMPixels = countVRAMPixels;';
  if (!html.includes(marker)) throw new Error('phase679 injection marker not found');
  return html.replace(marker, `${marker}\n${PHASE679_INJECTION}`);
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
      const body = maybeInjectBrowserShell(fullPath);
      if (typeof body === 'string') res.end(body);
      else body.pipe(res);
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

async function bootColdboot(socket, pageUrl, tag) {
  await cdp(socket, 'Page.navigate', { url: `${pageUrl}?phase679=${encodeURIComponent(tag)}` });
  await waitFor(socket, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(socket, 'typeof window.__phase679ReadState === "function"', 'phase679 injected helpers', 30000);
  await sleep(1000);
  await evalExpr(socket, `(() => {
    window.__p679Errors = [];
    window.addEventListener('error', (e) => window.__p679Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p679Errors.push(String(e.reason || e)));
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

async function readState(socket) {
  return await evalExpr(socket, 'window.__phase679ReadState()');
}

async function applyUiClear(socket) {
  return await evalExpr(socket, 'window.__phase679ApplyUiClearLine()');
}

async function readFinal(socket) {
  return await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    errors: window.__p679Errors || [],
    state: window.__phase679ReadState(),
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

function controlPreStopPass(row, scenario) {
  return row.termination === scenario.expectedControlTermination
    && row.stoppedBeforeControlClear === true
    && row.stoppedAfterInsert === false
    && row.expectedInsertByte == null
    && row.controlPreStopPc === scenario.expectedControlPc
    && row.controlStopPc === scenario.expectedControlPc
    && row.wipes === 0
    && row.D007CA === 0x0585E9
    && row.D02590 === 0xD3FE81
    && row.buffer[0] === 0x32;
}

function uiClearPass(uiClear, afterUiClear) {
  return uiClear?.ok === true
    && afterUiClear.D007CA === 0x0585E9
    && afterUiClear.D02590 === 0xD3FE81
    && afterUiClear.D0243A === 0xD1A8CC
    && afterUiClear.buffer.every((byte) => byte === 0)
    && afterUiClear.roi.nonWhite === 0;
}

async function runScenario(socket, pageUrl, scenario) {
  await bootColdboot(socket, pageUrl, scenario.name);
  const boot = await readState(socket);
  const prime = await pressKey(socket, PRIME_KEY);
  const afterPrime = await readState(socket);
  const control = await pressKey(socket, scenario.control);
  const afterControl = await readState(socket);
  let uiClear = null;
  let afterUiClear = null;
  if (scenario.strategy === 'ui-clear') {
    uiClear = await applyUiClear(socket);
    afterUiClear = await readState(socket);
  }
  const next = await pressKey(socket, NEXT_KEY);
  const afterNext = await readState(socket);
  const final = await readFinal(socket);

  const pass = keyInsertPass(prime, PRIME_KEY.expected, 0xD1A8CD, [0x32])
    && controlPreStopPass(control, scenario)
    && (scenario.strategy !== 'ui-clear' || uiClearPass(uiClear, afterUiClear))
    && keyInsertPass(next, NEXT_KEY.expected, scenario.expectedCursorAfterNext, scenario.expectedAfterNext)
    && scenario.expectedAfterNext.every((byte, index) => afterNext.buffer[index] === byte)
    && final.errors.length === 0
    && !String(final.status || '').includes('Validating OS');

  return {
    scenario: scenario.name,
    strategy: scenario.strategy,
    pass,
    boot,
    prime,
    afterPrime,
    control,
    afterControl,
    uiClear,
    afterUiClear,
    next,
    afterNext,
    final,
  };
}

function formatBuffer(bytes) {
  return (bytes ?? []).map((byte) => hex(byte, 2)).join(' ');
}

function formatKeyRow(row) {
  return {
    code: row.code,
    termination: row.termination,
    steps: row.steps,
    expectedInsertByte: row.expectedInsertByte == null ? null : hex(row.expectedInsertByte, 2),
    insertBlock: row.insertBlock,
    controlStopPc: row.controlStopPc == null ? null : hex(row.controlStopPc),
    stoppedAfterInsert: row.stoppedAfterInsert,
    stoppedBeforeControlClear: row.stoppedBeforeControlClear,
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
    hasMemory: state.hasMemory,
    runtimeMode: state.runtimeMode,
    D007CA: hex(state.D007CA),
    D008E0: hex(state.D008E0),
    D0243A: hex(state.D0243A),
    D0243D: hex(state.D0243D),
    D02590: hex(state.D02590),
    D02A40: hex(state.D02A40),
    D00595: hex(state.D00595, 2),
    D00596: hex(state.D00596, 2),
    buffer: formatBuffer(state.buffer),
    vramCurrent: state.vramCurrent,
    roi: state.roi,
  };
}

function compactScenario(row) {
  return {
    scenario: row.scenario,
    strategy: row.strategy,
    pass: row.pass,
    prime: formatKeyRow(row.prime),
    afterPrime: formatState(row.afterPrime),
    control: formatKeyRow(row.control),
    afterControl: formatState(row.afterControl),
    uiClear: row.uiClear,
    afterUiClear: formatState(row.afterUiClear),
    next: formatKeyRow(row.next),
    afterNext: formatState(row.afterNext),
    errors: row.final.errors,
  };
}

function buildReport(data) {
  const rows = data?.scenarios ?? [];
  const lines = [
    '# Phase 679: Control-Key UI Semantics A/B',
    '',
    'Probe: `probe-phase679-control-ui-semantics-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase679-control-ui-semantics-ab.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    '- Scope: headless browser run using `browser-shell.html`; the probe serves an instrumented in-memory copy to expose phase679 state helpers. No source edit to `browser-shell.html`.',
    '',
    '## Scenario Matrix',
    '',
    '| scenario | pass | control stop | after control buffer | after control cursor | after control ROI nonwhite | UI clear ROI nonwhite | next buffer | next cursor | next ROI bbox | page errors |',
    '|---|---|---:|---|---:|---:|---:|---|---:|---|---|',
    ...rows.map((row) => {
      const uiRoi = row.afterUiClear?.roi?.nonWhite ?? '-';
      const nextBbox = row.afterNext?.roi?.bbox ? row.afterNext.roi.bbox.join(',') : '-';
      return `| ${row.scenario} | ${row.pass ? 'yes' : 'no'} | ${hex(row.control.controlStopPc)} | ${formatBuffer(row.afterControl.buffer)} | ${hex(row.afterControl.D0243A)} | ${row.afterControl.roi.nonWhite} | ${uiRoi} | ${formatBuffer(row.afterNext.buffer)} | ${hex(row.afterNext.D0243A)} | ${nextBbox} | ${JSON.stringify(row.final.errors)} |`;
    }),
    '',
    '## Findings',
    '',
    '- Enter currently behaves as a safe preserve/no-op control in the browser demo: after a primed `2`, it stops before `0x0A2150`, keeps the buffer/cursor/context live, and the next `3` appends as `23`.',
    '- Current CLEAR/Escape is also state-safe, but it is not semantic clear: after a primed `2`, it stops before `0x001879`, keeps the `2` visible/in the buffer, and the next `3` appends as `23`.',
    '- The injected UI-level CLEAR candidate is viable: after the same pre-stop, clearing the edit buffer, resetting `D0243A` to `0xD1A8CC`, resetting renderer row/col `D00595/D00596` to zero, and whitening the entry-line ROI makes the next `3` insert as a fresh single-character buffer (`33 00 ...`) with cxMain/VAT intact.',
    '- This does not prove OS-native CLEAR semantics. It proves a browser-demo semantic polish path can be implemented separately from the insert-byte map and separately from the destructive ROM clear path; visual placement must be checked from the ROI bbox if this is wired into the shell.',
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
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
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
    probe: 'phase679-control-ui-semantics-ab',
    chromePath,
    pageUrl,
    pass,
    scenarios,
    compact: scenarios.map(compactScenario),
  };

  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    scenarios: summary.compact.map((row) => ({
      scenario: row.scenario,
      pass: row.pass,
      control: row.control,
      afterControl: row.afterControl,
      afterUiClear: row.afterUiClear,
      next: row.next,
      afterNext: row.afterNext,
      errors: row.errors,
    })),
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase679-control-ui-semantics-ab', pass: false, error: String(error?.stack || error) };
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

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase692-token-aware-visual-assertions.md');
const debugPort = 20000 + Math.floor(Math.random() * 20000);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase692-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

const EDIT_BASE = 0xD1A8CC;
const HOME_HANDLER = 0x0585E9;
const CLEANUP_FREE_TERMINATION = 'post_insert_gate_stop';
const ENTRY_BAND = Object.freeze({ y0: 38, y1: 60 });

const SEQUENCE = Object.freeze([
  { code: 'Digit2', key: '2', vk: 50, label: '2', expected: 0x32, kind: 'digit' },
  { code: 'NumpadAdd', key: '+', vk: 107, label: '+', expected: 0x9E, kind: 'operator' },
  { code: 'Minus', key: '-', vk: 189, label: '-', expected: 0x71, kind: 'operator' },
  { code: 'NumpadMultiply', key: '*', vk: 106, label: '*', expected: 0x82, kind: 'operator' },
  { code: 'Slash', key: '/', vk: 191, label: '/', expected: 0x83, kind: 'operator' },
  { code: 'Period', key: '.', vk: 190, label: '.', expected: 0x3A, kind: 'punctuation' },
  { code: 'BracketLeft', key: '(', vk: 219, label: '(', expected: 0x10, kind: 'punctuation' },
  { code: 'BracketRight', key: ')', vk: 221, label: ')', expected: 0x11, kind: 'punctuation' },
]);

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 2) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

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
    } catch {}
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

function keyDownParams(item) {
  return {
    type: 'keyDown',
    windowsVirtualKeyCode: item.vk,
    nativeVirtualKeyCode: item.vk,
    code: item.code,
    key: item.key,
    text: item.key,
    unmodifiedText: item.key,
  };
}

function keyUpParams(item) {
  return { ...keyDownParams(item), type: 'keyUp', text: '', unmodifiedText: '' };
}

async function installCanvasProbe(socket) {
  await evalExpr(socket, `(() => {
    const ROI = { x: 0, y: 34, w: 128, h: 26 };
    const CHANNEL_DELTA = 12;
    function getRoiData() {
      const canvas = document.getElementById('lcd');
      if (!canvas) throw new Error('lcd canvas missing');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('lcd canvas context missing');
      return Array.from(ctx.getImageData(ROI.x, ROI.y, ROI.w, ROI.h).data);
    }
    function changed(data, ref, i) {
      return Math.abs(data[i] - ref[i]) > CHANNEL_DELTA
        || Math.abs(data[i + 1] - ref[i + 1]) > CHANNEL_DELTA
        || Math.abs(data[i + 2] - ref[i + 2]) > CHANNEL_DELTA
        || Math.abs(data[i + 3] - ref[i + 3]) > CHANNEL_DELTA;
    }
    function isInk(data, i) {
      return data[i + 3] > 0 && (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245);
    }
    function bboxFor(rowCounts, colCounts) {
      const ys = rowCounts
        .map((count, y) => count ? ROI.y + y : null)
        .filter((value) => value != null);
      const xs = colCounts
        .map((count, x) => count ? ROI.x + x : null)
        .filter((value) => value != null);
      if (!xs.length || !ys.length) return null;
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    }
    function summarize(label, data, baseline, previous) {
      let diffFromBaseline = 0;
      let inkDiffFromBaseline = 0;
      let diffFromPrevious = 0;
      let inkDiffFromPrevious = 0;
      const baselineRows = Array(ROI.h).fill(0);
      const baselineCols = Array(ROI.w).fill(0);
      const previousRows = Array(ROI.h).fill(0);
      const previousCols = Array(ROI.w).fill(0);
      for (let y = 0; y < ROI.h; y += 1) {
        for (let x = 0; x < ROI.w; x += 1) {
          const i = (y * ROI.w + x) * 4;
          const ink = isInk(data, i);
          if (baseline && changed(data, baseline, i)) {
            diffFromBaseline += 1;
            if (ink) inkDiffFromBaseline += 1;
            baselineRows[y] += 1;
            baselineCols[x] += 1;
          }
          if (previous && changed(data, previous, i)) {
            diffFromPrevious += 1;
            if (ink) inkDiffFromPrevious += 1;
            previousRows[y] += 1;
            previousCols[x] += 1;
          }
        }
      }
      return {
        label,
        roi: ROI,
        diffFromBaseline,
        inkDiffFromBaseline,
        diffFromPrevious,
        inkDiffFromPrevious,
        bbox: bboxFor(baselineRows, baselineCols),
        incrementalBbox: bboxFor(previousRows, previousCols),
      };
    }
    window.__p692SetCanvasBaseline = () => {
      const data = getRoiData();
      window.__p692CanvasBaseline = data;
      window.__p692CanvasPrevious = data;
      return summarize('baseline', data, null, null);
    };
    window.__p692SampleCanvas = (label) => {
      const data = getRoiData();
      const baseline = window.__p692CanvasBaseline;
      const previous = window.__p692CanvasPrevious;
      const result = summarize(label, data, baseline, previous);
      window.__p692CanvasPrevious = data;
      return result;
    };
    return true;
  })()`);
}

async function bootColdbootShell(socket) {
  await evalExpr(socket, `(() => {
    window.__p692Errors = [];
    window.__coldbootLastKey = null;
    window.addEventListener('error', (e) => window.__p692Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p692Errors.push(String(e.reason || e)));
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(socket, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot', 180000);
  await installCanvasProbe(socket);
  return await evalExpr(socket, 'window.__p692SetCanvasBaseline()');
}

function bufferMatches(buffer, expectedPrefix) {
  if (!Array.isArray(buffer) || buffer.length < expectedPrefix.length) return false;
  return expectedPrefix.every((byte, idx) => buffer[idx] === byte);
}

function entryBandCanvasPass(canvas, previousBbox) {
  if (!canvas?.incrementalBbox) return false;
  const bbox = canvas.incrementalBbox;
  const previousX0 = previousBbox?.x0 ?? -Infinity;
  return canvas.diffFromBaseline > 0
    && canvas.inkDiffFromBaseline > 0
    && canvas.diffFromPrevious >= 4
    && canvas.inkDiffFromPrevious >= 4
    && bbox.y0 >= ENTRY_BAND.y0
    && bbox.y1 <= ENTRY_BAND.y1
    && bbox.x0 >= 0
    && bbox.x1 <= 127
    && bbox.x0 >= previousX0;
}

async function pressKey(socket, item, expectedPrefix, index, previousBbox) {
  await evalExpr(socket, 'window.__coldbootLastKey = null; true');
  await cdp(socket, 'Input.dispatchKeyEvent', keyDownParams(item));
  await waitFor(
    socket,
    `window.__coldbootLastKey?.code === ${JSON.stringify(item.code)} && window.__coldbootLastKey?.postInsertGateBlock != null`,
    `key ${item.label}`,
    120000,
  );
  await cdp(socket, 'Input.dispatchKeyEvent', keyUpParams(item));

  const state = await evalExpr(socket, `(() => ({
    key: ${JSON.stringify(item.label)},
    index: ${index},
    status: document.getElementById('status')?.textContent ?? null,
    lastKey: window.__coldbootLastKey,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    errors: window.__p692Errors || [],
  }))()`);
  const canvas = await evalExpr(socket, `window.__p692SampleCanvas(${JSON.stringify(item.label)})`);
  return evaluateKeyRow({ ...state, canvas, expectedPrefix, item, previousBbox });
}

function evaluateKeyRow(row) {
  const last = row.lastKey || {};
  const diag = row.diagnostics || {};
  const visibleBuffer = diag.buffer || last.buffer || [];
  const expectedAscii = row.item.key.length === 1 ? row.item.key.charCodeAt(0) : null;
  const tokenAwareExpectation = row.item.kind === 'digit'
    ? row.item.expected === expectedAscii
    : row.item.expected !== expectedAscii;
  const stableGatePass = last.termination === CLEANUP_FREE_TERMINATION
    && last.stoppedAtPostInsertGate === true
    && last.D000C2Bit7Restored === true
    && last.D000C2 === 0
    && last.insertBlock != null
    && last.postInsertGateBlock != null
    && last.postInsertGateBlock > last.insertBlock
    && last.wipes === 0
    && last.steps < 50000;
  const statePass = diag.D007CA === HOME_HANDLER
    && diag.D0243A === EDIT_BASE + row.expectedPrefix.length
    && bufferMatches(visibleBuffer, row.expectedPrefix)
    && last.expectedInsertByte === row.item.expected
    && (last.vramCurrent ?? diag.vramCurrent ?? 0) > 100
    && row.errors.length === 0;
  const canvasPass = entryBandCanvasPass(row.canvas, row.previousBbox);
  const pass = tokenAwareExpectation && stableGatePass && statePass && canvasPass;

  return {
    key: row.key,
    index: row.index,
    kind: row.item.kind,
    expectedByte: row.item.expected,
    typedAscii: expectedAscii,
    tokenAwareExpectation,
    expectedPrefix: row.expectedPrefix,
    visibleBuffer,
    diagnostics: diag,
    lastKey: last,
    canvas: row.canvas,
    stableGatePass,
    statePass,
    canvasPass,
    pass,
    errors: row.errors,
    status: row.status,
  };
}

function formatBytes(bytes) {
  return (bytes ?? []).map((byte) => hex(byte, 2)).join(' ');
}

function bboxString(bbox) {
  if (!bbox) return '-';
  return `${bbox.x0},${bbox.y0}..${bbox.x1},${bbox.y1}`;
}

function compactRows(rows) {
  return rows.map((row) => ({
    key: row.key,
    kind: row.kind,
    pass: row.pass,
    expectedByte: hex(row.expectedByte, 2),
    typedAscii: hex(row.typedAscii, 2),
    tokenAwareExpectation: row.tokenAwareExpectation,
    termination: row.lastKey?.termination,
    steps: row.lastKey?.steps,
    insertBlock: row.lastKey?.insertBlock,
    gateBlock: row.lastKey?.postInsertGateBlock,
    D000C2: row.lastKey?.D000C2,
    restored: row.lastKey?.D000C2Bit7Restored,
    wipes: row.lastKey?.wipes,
    cursor: hex(row.diagnostics?.D0243A, 6),
    buffer: formatBytes(row.visibleBuffer),
    canvasDelta: row.canvas?.diffFromPrevious,
    bbox: row.canvas?.incrementalBbox,
  }));
}

function buildReport(data) {
  const lines = [
    '# Phase 692: Token-Aware Visual Assertions',
    '',
    'Probe: `probe-phase692-token-aware-visual-assertions.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase692-token-aware-visual-assertions.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    `- Sequence: ${(data?.sequence ?? []).join(' ')}`,
    `- Expected token bytes: ${formatBytes(data?.expectedBytes)}`,
    `- Final visible buffer: ${formatBytes(data?.final?.visibleBuffer)}`,
    `- Non-ASCII token rows: ${data?.nonAsciiTokenRows ?? '-'}`,
    `- Page errors: ${JSON.stringify(data?.errors ?? [])}`,
    '',
    '## Key Assertions',
    '',
    '| idx | key | kind | expected byte | typed ASCII | token-aware | termination | steps | D000C2 | restored | wipes | D0243A | buffer | canvas delta | bbox | status |',
    '|---:|---|---|---:|---:|---|---|---:|---:|---|---:|---:|---|---:|---|---|',
  ];

  for (const row of data?.rows ?? []) {
    lines.push(`| ${row.index} | ${row.key} | ${row.kind} | ${hex(row.expectedByte, 2)} | ${hex(row.typedAscii, 2)} | ${row.tokenAwareExpectation} | ${row.lastKey?.termination ?? '-'} | ${row.lastKey?.steps ?? '-'} | ${hex(row.lastKey?.D000C2 ?? 0, 2)} | ${row.lastKey?.D000C2Bit7Restored === true} | ${row.lastKey?.wipes ?? '-'} | ${hex(row.diagnostics?.D0243A, 6)} | ${formatBytes(row.visibleBuffer)} | ${row.canvas?.diffFromPrevious ?? '-'} | ${bboxString(row.canvas?.incrementalBbox)} | ${row.pass ? 'PASS' : 'FAIL'} |`);
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- This probe intentionally does not assert isolated glyph shapes. Operators and punctuation are asserted by their TI-OS token bytes plus cursor advance, entry-band canvas deltas, and cleanup-free browser state.',
    '- The eight-key sequence fits the shell diagnostics window, so every final visible byte is checked directly.',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify(data?.compact ?? data, null, 2),
    '```',
    '',
  );
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
  await sleep(1000);

  const baseline = await bootColdbootShell(ws);
  const expectedPrefix = [];
  const rows = [];
  let previousBbox = null;
  for (let i = 0; i < SEQUENCE.length; i += 1) {
    const item = SEQUENCE[i];
    expectedPrefix.push(item.expected);
    const row = await pressKey(ws, item, [...expectedPrefix], i + 1, previousBbox);
    rows.push(row);
    previousBbox = row.canvas?.incrementalBbox || previousBbox;
  }

  const final = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    errors: window.__p692Errors || [],
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    lastKey: window.__coldbootLastKey || null,
    vram: window.countVRAMPixels?.() ?? null,
  }))()`);
  const expectedBytes = SEQUENCE.map((item) => item.expected);
  const finalVisibleBuffer = final.diagnostics?.buffer || [];
  const finalBufferPass = bufferMatches(finalVisibleBuffer, expectedBytes);
  const nonAsciiRows = rows.filter((row) => row.kind !== 'digit');
  const pass = rows.every((row) => row.pass)
    && final.errors.length === 0
    && final.diagnostics?.D0243A === EDIT_BASE + expectedBytes.length
    && finalBufferPass
    && nonAsciiRows.length === 7
    && nonAsciiRows.every((row) => row.expectedByte !== row.typedAscii)
    && !String(final.status || '').includes('Validating OS');

  summary = {
    probe: 'phase692-token-aware-visual-assertions',
    chromePath,
    pageUrl,
    pass,
    baseline,
    sequence: SEQUENCE.map((item) => item.label),
    expectedBytes,
    rows,
    final: { ...final, visibleBuffer: finalVisibleBuffer, finalBufferPass },
    nonAsciiTokenRows: nonAsciiRows.length,
    errors: final.errors || [],
  };
  summary.compact = {
    probe: summary.probe,
    pass,
    sequence: summary.sequence,
    expectedBytes: formatBytes(expectedBytes),
    finalVisibleBuffer: formatBytes(finalVisibleBuffer),
    finalD0243A: hex(final.diagnostics?.D0243A, 6),
    nonAsciiTokenRows: nonAsciiRows.length,
    rows: compactRows(rows),
    errors: summary.errors,
  };

  console.log(JSON.stringify(summary.compact, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase692-token-aware-visual-assertions', pass: false, error: String(error?.stack || error) };
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

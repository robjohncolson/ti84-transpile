import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase691-browser-gate-broad-regression.md');
const debugPort = 20000 + Math.floor(Math.random() * 20000);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase691-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

const EDIT_BASE = 0xD1A8CC;
const HOME_HANDLER = 0x0585E9;
const CLEANUP_FREE_TERMINATION = 'post_insert_gate_stop';

const KEY_DEFS = Object.freeze({
  two: { code: 'Digit2', key: '2', vk: 50, label: '2', expected: 0x32 },
  three: { code: 'Digit3', key: '3', vk: 51, label: '3', expected: 0x33 },
  plus: { code: 'NumpadAdd', key: '+', vk: 107, label: '+', expected: 0x9E },
  minus: { code: 'Minus', key: '-', vk: 189, label: '-', expected: 0x71 },
  multiply: { code: 'NumpadMultiply', key: '*', vk: 106, label: '*', expected: 0x82 },
  divide: { code: 'Slash', key: '/', vk: 191, label: '/', expected: 0x83 },
  decimal: { code: 'Period', key: '.', vk: 190, label: '.', expected: 0x3A },
  lparen: { code: 'BracketLeft', key: '(', vk: 219, label: '(', expected: 0x10 },
  rparen: { code: 'BracketRight', key: ')', vk: 221, label: ')', expected: 0x11 },
});

const FULL_SET_SEQUENCE = Object.freeze([
  KEY_DEFS.two,
  KEY_DEFS.three,
  KEY_DEFS.plus,
  KEY_DEFS.minus,
  KEY_DEFS.multiply,
  KEY_DEFS.divide,
  KEY_DEFS.decimal,
  KEY_DEFS.lparen,
  KEY_DEFS.rparen,
]);

const LONG_SEQUENCE = Object.freeze([
  KEY_DEFS.two,
  KEY_DEFS.three,
  KEY_DEFS.plus,
  KEY_DEFS.minus,
  KEY_DEFS.multiply,
  KEY_DEFS.divide,
  KEY_DEFS.decimal,
  KEY_DEFS.lparen,
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
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`)); }, 120000);
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
      for (let y = 0; y < ROI.h; y++) {
        for (let x = 0; x < ROI.w; x++) {
          const i = (y * ROI.w + x) * 4;
          const ink = isInk(data, i);
          if (baseline && changed(data, baseline, i)) {
            diffFromBaseline++;
            if (ink) inkDiffFromBaseline++;
            baselineRows[y]++;
            baselineCols[x]++;
          }
          if (previous && changed(data, previous, i)) {
            diffFromPrevious++;
            if (ink) inkDiffFromPrevious++;
            previousRows[y]++;
            previousCols[x]++;
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
        incrementalRows: previousRows
          .map((count, y) => count ? { y: ROI.y + y, count } : null)
          .filter(Boolean),
      };
    }
    window.__p691SetCanvasBaseline = () => {
      const data = getRoiData();
      window.__p691CanvasBaseline = data;
      window.__p691CanvasPrevious = data;
      return summarize('baseline', data, null, null);
    };
    window.__p691SampleCanvas = (label) => {
      const data = getRoiData();
      const baseline = window.__p691CanvasBaseline;
      const previous = window.__p691CanvasPrevious;
      const result = summarize(label, data, baseline, previous);
      window.__p691CanvasPrevious = data;
      return result;
    };
    return true;
  })()`);
}

async function bootColdbootShell(socket, scenarioName) {
  await evalExpr(socket, `(() => {
    window.__p691Errors = [];
    window.__coldbootLastKey = null;
    window.addEventListener('error', (e) => window.__p691Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p691Errors.push(String(e.reason || e)));
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(socket, `document.getElementById('status').textContent.includes('Coldboot complete')`, `${scenarioName} coldboot`, 180000);
  await installCanvasProbe(socket);
  return await evalExpr(socket, 'window.__p691SetCanvasBaseline()');
}

async function pressKey(socket, item, expectedPrefix, stepIndex) {
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
    index: ${stepIndex},
    status: document.getElementById('status')?.textContent ?? null,
    lastKey: window.__coldbootLastKey,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    errors: window.__p691Errors || [],
  }))()`);
  const canvas = await evalExpr(socket, `window.__p691SampleCanvas(${JSON.stringify(item.label)})`);
  return evaluateKeyRow({ ...state, canvas, expectedPrefix, expected: item.expected });
}

function bufferMatchesVisiblePrefix(buffer, expectedPrefix) {
  if (!Array.isArray(buffer)) return false;
  const visibleLen = Math.min(buffer.length, expectedPrefix.length);
  for (let i = 0; i < visibleLen; i += 1) {
    if (buffer[i] !== expectedPrefix[i]) return false;
  }
  return true;
}

function canvasPass(canvas) {
  if (!canvas) return false;
  return canvas.diffFromBaseline > 0
    && canvas.inkDiffFromBaseline > 0
    && canvas.diffFromPrevious >= 4
    && canvas.inkDiffFromPrevious >= 4
    && canvas.incrementalBbox
    && canvas.incrementalBbox.y0 >= 38
    && canvas.incrementalBbox.y1 <= 60
    && canvas.incrementalBbox.x0 >= 0
    && canvas.incrementalBbox.x1 <= 127;
}

function evaluateKeyRow(row) {
  const last = row.lastKey || {};
  const diag = row.diagnostics || {};
  const expectedPrefix = row.expectedPrefix || [];
  const visibleBuffer = diag.buffer || last.buffer || [];
  const pass = last.termination === CLEANUP_FREE_TERMINATION
    && last.stoppedAtPostInsertGate === true
    && last.D000C2Bit7Restored === true
    && last.D000C2 === 0
    && last.expectedInsertByte === row.expected
    && last.insertBlock != null
    && last.postInsertGateBlock != null
    && last.postInsertGateBlock > last.insertBlock
    && last.wipes === 0
    && last.steps < 50000
    && diag.D007CA === HOME_HANDLER
    && diag.D0243A === EDIT_BASE + expectedPrefix.length
    && bufferMatchesVisiblePrefix(visibleBuffer, expectedPrefix)
    && (last.vramCurrent ?? diag.vramCurrent ?? 0) > 100
    && canvasPass(row.canvas)
    && row.errors.length === 0;

  return {
    ...row,
    visibleBuffer,
    pass,
    cleanupExposureAvoided: last.termination === CLEANUP_FREE_TERMINATION && last.wipes === 0,
    visibleBufferFullyCoversExpected: visibleBuffer.length >= expectedPrefix.length,
  };
}

function deriveLongSequenceFromFullSet(fullSet) {
  const rows = fullSet.rows.slice(0, LONG_SEQUENCE.length);
  const finalRow = rows.at(-1);
  const expectedBytes = LONG_SEQUENCE.map((item) => item.expected);
  const visibleBuffer = finalRow?.visibleBuffer || [];
  const fullVisibleBufferPass = expectedBytes.every((byte, idx) => visibleBuffer[idx] === byte);
  return {
    name: 'long-sequence-prefix',
    baseline: fullSet.baseline,
    sequence: LONG_SEQUENCE.map((item) => item.label),
    expectedBytes,
    pass: rows.every((row) => row.pass)
      && finalRow?.diagnostics?.D0243A === EDIT_BASE + expectedBytes.length
      && fullVisibleBufferPass,
    fullVisibleBufferPass,
    rows,
    final: {
      diagnostics: finalRow?.diagnostics || null,
      visibleBuffer,
      errors: finalRow?.errors || [],
      status: finalRow?.status || null,
      lastKey: finalRow?.lastKey || null,
      vram: finalRow?.diagnostics?.vramCurrent ?? null,
    },
  };
}

async function runScenario(socket, name, sequence) {
  const baseline = await bootColdbootShell(socket, name);
  const rows = [];
  const expectedPrefix = [];

  for (let i = 0; i < sequence.length; i += 1) {
    const item = sequence[i];
    expectedPrefix.push(item.expected);
    rows.push(await pressKey(socket, item, [...expectedPrefix], i + 1));
  }

  const final = await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    errors: window.__p691Errors || [],
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    lastKey: window.__coldbootLastKey || null,
    vram: window.countVRAMPixels?.() ?? null,
  }))()`);
  const expectedBytes = sequence.map((item) => item.expected);
  const visibleBuffer = final.diagnostics?.buffer || [];
  const fullVisibleBufferPass = expectedBytes.every((byte, idx) => visibleBuffer[idx] === byte);
  const pass = rows.every((row) => row.pass)
    && final.errors.length === 0
    && final.diagnostics?.D0243A === EDIT_BASE + expectedBytes.length
    && (expectedBytes.length > visibleBuffer.length || fullVisibleBufferPass)
    && !String(final.status || '').includes('Validating OS');

  return {
    name,
    baseline,
    sequence: sequence.map((item) => item.label),
    expectedBytes,
    pass,
    fullVisibleBufferPass,
    rows,
    final: { ...final, visibleBuffer },
  };
}

function formatBytes(bytes) {
  return (bytes ?? []).map((byte) => hex(byte, 2)).join(' ');
}

function bboxString(bbox) {
  if (!bbox) return '-';
  return `${bbox.x0},${bbox.y0}..${bbox.x1},${bbox.y1}`;
}

function buildReport(data) {
  const lines = [
    '# Phase 691: Browser Gate Broad Regression',
    '',
    'Probe: `probe-phase691-browser-gate-broad-regression.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase691-browser-gate-broad-regression.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    `- Full insertable set: ${data?.fullSet?.pass ? 'PASS' : 'FAIL'} (${data?.fullSet?.sequence?.join(' ')})`,
    `- Long sequence: ${data?.longSequence?.pass ? 'PASS' : 'FAIL'} (${data?.longSequence?.sequence?.join(' ')})`,
    `- Page errors: ${JSON.stringify(data?.errors ?? [])}`,
    '',
    '## Key Assertions',
    '',
    '| scenario | idx | key | expected prefix | termination | steps | insert block | gate block | D000C2 | restored | wipes | D0243A | visible buffer | canvas delta | bbox | status |',
    '|---|---:|---|---|---|---:|---:|---:|---:|---|---:|---:|---|---:|---|---|',
  ];

  for (const scenario of [data?.fullSet, data?.longSequence].filter(Boolean)) {
    for (const row of scenario.rows) {
      const last = row.lastKey || {};
      const diag = row.diagnostics || {};
      lines.push(`| ${scenario.name} | ${row.index} | ${row.key} | ${formatBytes(row.expectedPrefix)} | ${last.termination} | ${last.steps ?? '-'} | ${last.insertBlock ?? '-'} | ${last.postInsertGateBlock ?? '-'} | ${hex(last.D000C2 ?? 0, 2)} | ${last.D000C2Bit7Restored === true} | ${last.wipes ?? '-'} | ${hex(diag.D0243A, 6)} | ${formatBytes(row.visibleBuffer)} | ${row.canvas?.diffFromPrevious ?? '-'} | ${bboxString(row.canvas?.incrementalBbox)} | ${row.pass ? 'PASS' : 'FAIL'} |`);
    }
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- The shell public diagnostics expose the first eight edit-buffer bytes. The full nine-key set therefore asserts the ninth `)` through the key-specific expected byte, cursor advance, gate stop, zero wipes, and canvas delta; the separate eight-key long sequence asserts every expected buffer byte directly.',
    '- Cleanup avoidance is asserted by `post_insert_gate_stop`, `stoppedAtPostInsertGate=true`, restored `D000C2=0x00`, and `wipes=0`; the browser diagnostics do not expose separate counters for `0x0158BC` or `0x001879`.',
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

  const fullSet = await runScenario(ws, 'full-set', FULL_SET_SEQUENCE);
  const longSequence = deriveLongSequenceFromFullSet(fullSet);
  const errors = [...(fullSet.final.errors || []), ...(longSequence.final.errors || [])];
  const pass = fullSet.pass && longSequence.pass && errors.length === 0;

  summary = {
    probe: 'phase691-browser-gate-broad-regression',
    chromePath,
    pageUrl,
    pass,
    fullSet,
    longSequence,
    errors,
  };
  summary.compact = {
    probe: summary.probe,
    pass,
    fullSet: {
      pass: fullSet.pass,
      sequence: fullSet.sequence,
      expectedBytes: formatBytes(fullSet.expectedBytes),
      finalVisibleBuffer: formatBytes(fullSet.final.visibleBuffer),
      finalD0243A: hex(fullSet.final.diagnostics?.D0243A, 6),
      rows: fullSet.rows.map((row) => ({
        key: row.key,
        pass: row.pass,
        termination: row.lastKey?.termination,
        steps: row.lastKey?.steps,
        restored: row.lastKey?.D000C2Bit7Restored,
        D000C2: row.lastKey?.D000C2,
        wipes: row.lastKey?.wipes,
        buffer: formatBytes(row.visibleBuffer),
        cursor: hex(row.diagnostics?.D0243A, 6),
        canvasDelta: row.canvas?.diffFromPrevious,
        bbox: row.canvas?.incrementalBbox,
      })),
    },
    longSequence: {
      pass: longSequence.pass,
      sequence: longSequence.sequence,
      expectedBytes: formatBytes(longSequence.expectedBytes),
      finalVisibleBuffer: formatBytes(longSequence.final.visibleBuffer),
      finalD0243A: hex(longSequence.final.diagnostics?.D0243A, 6),
      rows: longSequence.rows.map((row) => ({
        key: row.key,
        pass: row.pass,
        termination: row.lastKey?.termination,
        steps: row.lastKey?.steps,
        restored: row.lastKey?.D000C2Bit7Restored,
        D000C2: row.lastKey?.D000C2,
        wipes: row.lastKey?.wipes,
        buffer: formatBytes(row.visibleBuffer),
        cursor: hex(row.diagnostics?.D0243A, 6),
        canvasDelta: row.canvas?.diffFromPrevious,
        bbox: row.canvas?.incrementalBbox,
      })),
    },
    errors,
  };

  console.log(JSON.stringify(summary.compact, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase691-browser-gate-broad-regression', pass: false, error: String(error?.stack || error) };
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

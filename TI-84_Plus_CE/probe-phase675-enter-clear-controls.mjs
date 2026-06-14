import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase675-enter-clear-controls.md');
const debugPort = 9700 + Math.floor(Math.random() * 500);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-enter-clear-controls-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

const PRIME_KEY = { label: '2', code: 'Digit2', key: '2', expected: 0x32 };
const CONTROL_KEYS = [
  { label: 'ENTER', code: 'Enter', key: 'Enter', expectedScan: 0x09 },
  { label: 'CLEAR', code: 'Escape', key: 'Escape', expectedScan: 0x0F },
];

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
const asciiText = (value) => String(value ?? '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');

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

async function navigateAndBoot(socket, pageUrl) {
  await cdp(socket, 'Page.navigate', { url: pageUrl });
  await waitFor(socket, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(1000);
  await evalExpr(socket, `(() => {
    window.__p675Errors = [];
    window.addEventListener('error', (e) => window.__p675Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p675Errors.push(String(e.reason || e)));
    return true;
  })()`);
  await evalExpr(socket, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(socket, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
}

async function pressKey(socket, key) {
  await evalExpr(socket, `(() => {
    const down = new KeyboardEvent('keydown', { code: '${key.code}', key: '${key.key}', bubbles: true, cancelable: true });
    document.dispatchEvent(down);
    const up = new KeyboardEvent('keyup', { code: '${key.code}', key: '${key.key}', bubbles: true, cancelable: true });
    document.dispatchEvent(up);
    return window.__coldbootLastKey || null;
  })()`);
  return await waitFor(socket, `window.__coldbootLastKey?.code === '${key.code}' && window.__coldbootLastKey`, `typed ${key.code}`, 60000);
}

async function installPageProbe(socket) {
  await evalExpr(socket, `(() => {
    const ROI = { x: 0, y: 34, w: 160, h: 24 };
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
      let inkPixels = 0;
      let diffFromBaseline = 0;
      let inkDiffFromBaseline = 0;
      let lightDiffFromBaseline = 0;
      let diffFromPrevious = 0;
      let inkDiffFromPrevious = 0;
      let lightDiffFromPrevious = 0;
      const baselineRows = Array(ROI.h).fill(0);
      const baselineCols = Array(ROI.w).fill(0);
      const previousRows = Array(ROI.h).fill(0);
      const previousCols = Array(ROI.w).fill(0);
      for (let y = 0; y < ROI.h; y++) {
        for (let x = 0; x < ROI.w; x++) {
          const i = (y * ROI.w + x) * 4;
          const ink = isInk(data, i);
          if (ink) inkPixels++;
          if (baseline && changed(data, baseline, i)) {
            diffFromBaseline++;
            if (ink) inkDiffFromBaseline++;
            else lightDiffFromBaseline++;
            baselineRows[y]++;
            baselineCols[x]++;
          }
          if (previous && changed(data, previous, i)) {
            diffFromPrevious++;
            if (ink) inkDiffFromPrevious++;
            else lightDiffFromPrevious++;
            previousRows[y]++;
            previousCols[x]++;
          }
        }
      }
      return {
        label,
        roi: ROI,
        inkPixels,
        diffFromBaseline,
        inkDiffFromBaseline,
        lightDiffFromBaseline,
        diffFromPrevious,
        inkDiffFromPrevious,
        lightDiffFromPrevious,
        bbox: bboxFor(baselineRows, baselineCols),
        incrementalBbox: bboxFor(previousRows, previousCols),
        rows: baselineRows.map((count, y) => count ? { y: ROI.y + y, count } : null).filter(Boolean),
        incrementalRows: previousRows.map((count, y) => count ? { y: ROI.y + y, count } : null).filter(Boolean),
      };
    }
    window.__p675CaptureBaseline = () => {
      const data = getRoiData();
      window.__p675BaselineRoi = data;
      window.__p675PreviousRoi = data;
      return summarize('baseline', data, null, null);
    };
    window.__p675Sample = (label) => {
      const data = getRoiData();
      const result = summarize(label, data, window.__p675BaselineRoi, window.__p675PreviousRoi);
      window.__p675PreviousRoi = data;
      return result;
    };
    window.__p675State = (label) => ({
      label,
      status: document.getElementById('status')?.textContent ?? null,
      lastKey: window.__coldbootLastKey || null,
      diagnostics: window.getColdbootPersistenceDiagnostics?.() ?? null,
      vram: window.countVRAMPixels?.() ?? null,
      errors: window.__p675Errors || [],
    });
    return true;
  })()`);
}

function bboxString(bbox) {
  if (!bbox) return '-';
  return `${bbox.x0},${bbox.y0}..${bbox.x1},${bbox.y1}`;
}

function bufferString(buffer) {
  return (buffer ?? []).map((byte) => hex(byte, 2)).join(' ');
}

function analyzeControl(primeRow, controlRow, beforeState, afterState) {
  const slot = Math.max(0, (primeRow?.D0243A ?? 0xD1A8CC) - 0xD1A8CC);
  const beforeBuffer = beforeState?.lastKey?.buffer ?? primeRow?.buffer ?? [];
  const afterBuffer = controlRow?.buffer ?? [];
  const beforeCursor = beforeState?.lastKey?.D0243A ?? primeRow?.D0243A ?? 0;
  const afterCursor = controlRow?.D0243A ?? 0;
  const wroteNextByte = afterBuffer[slot] !== beforeBuffer[slot] && afterBuffer[slot] !== 0;
  const advancedLikeInsert = afterCursor === ((beforeCursor + 1) & 0xFFFFFF);
  const bufferChanged = JSON.stringify(beforeBuffer) !== JSON.stringify(afterBuffer);
  return {
    slot,
    expectedInsertByteNull: controlRow?.expectedInsertByte == null,
    insertBlockNull: controlRow?.insertBlock == null,
    stoppedAfterInsertFalse: controlRow?.stoppedAfterInsert === false,
    cursorBefore: beforeCursor,
    cursorAfter: afterCursor,
    cursorDelta: (afterCursor - beforeCursor) | 0,
    bufferChanged,
    wroteNextByte,
    advancedLikeInsert,
    looksLikeInsert: wroteNextByte && advancedLikeInsert,
    controlEffect: bufferChanged || beforeCursor !== afterCursor || (controlRow?.wipes ?? 0) > 0,
  };
}

async function runScenario(socket, pageUrl, controlKey) {
  await navigateAndBoot(socket, pageUrl);
  await installPageProbe(socket);
  const baseline = await evalExpr(socket, `window.__p675CaptureBaseline()`);
  const bootState = await evalExpr(socket, `window.__p675State('boot')`);
  const primeRow = await pressKey(socket, PRIME_KEY);
  const afterPrimeSample = await evalExpr(socket, `window.__p675Sample('after 2')`);
  const afterPrimeState = await evalExpr(socket, `window.__p675State('after 2')`);
  const controlRow = await pressKey(socket, controlKey);
  const afterControlSample = await evalExpr(socket, `window.__p675Sample('after ${controlKey.label}')`);
  const afterControlState = await evalExpr(socket, `window.__p675State('after ${controlKey.label}')`);
  afterPrimeState.status = asciiText(afterPrimeState.status);
  afterControlState.status = asciiText(afterControlState.status);
  bootState.status = asciiText(bootState.status);
  const analysis = analyzeControl(primeRow, controlRow, afterPrimeState, afterControlState);
  const primePass = primeRow.expectedInsertByte === PRIME_KEY.expected
    && primeRow.termination === 'insert_stop'
    && primeRow.insertBlock != null
    && primeRow.wipes === 0
    && primeRow.buffer?.[0] === PRIME_KEY.expected
    && primeRow.D0243A === 0xD1A8CD;
  const controlNonInsertable = analysis.expectedInsertByteNull
    && analysis.insertBlockNull
    && analysis.stoppedAfterInsertFalse
    && !analysis.looksLikeInsert;
  return {
    control: controlKey,
    pass: primePass && controlNonInsertable && (afterControlState.errors ?? []).length === 0,
    primePass,
    controlNonInsertable,
    baseline,
    bootState,
    primeRow,
    afterPrimeSample,
    afterPrimeState,
    controlRow,
    afterControlSample,
    afterControlState,
    analysis,
  };
}

function buildReport(data) {
  const lines = [
    '# Phase 675: Enter/Clear Non-Insertable Control Behavior',
    '',
    'Probe: `probe-phase675-enter-clear-controls.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase675-enter-clear-controls.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    '- Scope: browser-shell diagnostics only; no browser-shell/runtime/transpiler edits.',
    `- Page errors: ${JSON.stringify(data?.errors ?? [])}`,
    '',
    '## Findings',
    '',
    ...(data?.findings ?? []).map((line) => `- ${line}`),
    '',
    '## Control Key Summary',
    '',
    '| control | shell expected insert | insert block | stopped after insert | termination | steps | wipes | D0243A before | D0243A after | buffer before | buffer after | canvas ink delta | status |',
    '|---|---:|---:|---|---|---:|---:|---:|---:|---|---|---:|---|',
    ...(data?.scenarios ?? []).map((row) => {
      const beforeBuffer = row.afterPrimeState?.lastKey?.buffer ?? row.primeRow?.buffer ?? [];
      const afterBuffer = row.controlRow?.buffer ?? [];
      return `| ${row.control.label} | ${hex(row.controlRow?.expectedInsertByte, 2)} | ${row.controlRow?.insertBlock ?? '-'} | ${row.controlRow?.stoppedAfterInsert === true ? 'yes' : 'no'} | ${row.controlRow?.termination ?? '-'} | ${row.controlRow?.steps ?? '-'} | ${row.controlRow?.wipes ?? '-'} | ${hex(row.analysis?.cursorBefore)} | ${hex(row.analysis?.cursorAfter)} | ${bufferString(beforeBuffer)} | ${bufferString(afterBuffer)} | ${row.afterControlSample?.inkDiffFromPrevious ?? '-'} | ${row.controlNonInsertable ? 'NON-INSERT' : 'CHECK'} |`;
    }),
    '',
    '## Persistence Diagnostics',
    '',
    '| control | tokenGate | tokenA | tokenB | D02A29 | D02A40 | D02A28 | VRAM | status text |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---|',
    ...(data?.scenarios ?? []).map((row) => {
      const diag = row.afterControlState?.diagnostics ?? {};
      const tuple = diag.tuple ?? {};
      return `| ${row.control.label} | ${hex(diag.tokenGate, 2)} | ${hex(diag.tokenA, 2)} | ${hex(diag.tokenB, 2)} | ${hex(tuple.D02A29, 4)} | ${hex(tuple.D02A40)} | ${hex(tuple.D02A28, 2)} | ${row.afterControlState?.vram ?? '-'} | ${row.afterControlState?.status ?? '-'} |`;
    }),
    '',
    '## Canvas Deltas',
    '',
    '| sample | ROI | diff previous | ink previous | light previous | incremental bbox | final bbox |',
    '|---|---|---:|---:|---:|---|---|',
    ...(data?.scenarios ?? []).flatMap((row) => [
      row.afterPrimeSample,
      row.afterControlSample,
    ].map((sample) => `| ${row.control.label} ${sample?.label ?? '-'} | x=${sample?.roi?.x ?? '-'}, y=${sample?.roi?.y ?? '-'}, w=${sample?.roi?.w ?? '-'}, h=${sample?.roi?.h ?? '-'} | ${sample?.diffFromPrevious ?? '-'} | ${sample?.inkDiffFromPrevious ?? '-'} | ${sample?.lightDiffFromPrevious ?? '-'} | ${bboxString(sample?.incrementalBbox)} | ${bboxString(sample?.bbox)} |`)),
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
    '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ws = await connect(await waitForDevtools());
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');

  const scenarios = [];
  for (const controlKey of CONTROL_KEYS) {
    scenarios.push(await runScenario(ws, pageUrl, controlKey));
  }

  const errors = scenarios.flatMap((row) => row.afterControlState?.errors ?? []).map((error) => asciiText(error));
  const findings = scenarios.map((row) => {
    const a = row.analysis;
    const effect = a.controlEffect
      ? `changed state: cursor ${hex(a.cursorBefore)} -> ${hex(a.cursorAfter)}, bufferChanged=${a.bufferChanged}, wipes=${row.controlRow.wipes}`
      : 'left edit buffer/cursor unchanged';
    return `${row.control.label}: expectedInsertByte=null, insertBlock=${row.controlRow.insertBlock ?? 'null'}, stoppedAfterInsert=${row.controlRow.stoppedAfterInsert}; ${effect}; termination=${row.controlRow.termination}, steps=${row.controlRow.steps}.`;
  });
  const pass = scenarios.every((row) => row.pass) && errors.length === 0;

  summary = {
    probe: 'phase675-enter-clear-controls',
    chromePath,
    pageUrl,
    pass,
    findings,
    scenarios,
    errors,
  };

  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    findings,
    scenarios: scenarios.map((row) => ({
      control: row.control.label,
      primePass: row.primePass,
      controlNonInsertable: row.controlNonInsertable,
      termination: row.controlRow.termination,
      steps: row.controlRow.steps,
      wipes: row.controlRow.wipes,
      expectedInsertByte: row.controlRow.expectedInsertByte,
      insertBlock: row.controlRow.insertBlock,
      cursorBefore: hex(row.analysis.cursorBefore),
      cursorAfter: hex(row.analysis.cursorAfter),
      bufferBefore: bufferString(row.afterPrimeState?.lastKey?.buffer ?? row.primeRow?.buffer),
      bufferAfter: bufferString(row.controlRow.buffer),
      diagnostics: row.afterControlState.diagnostics,
    })),
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase675-enter-clear-controls', pass: false, error: String(error?.stack || error) };
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

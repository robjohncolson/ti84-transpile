import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase673-browser-insertable-visuals.md');
const debugPort = 9680 + Math.floor(Math.random() * 500);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-insertable-visuals-'));
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
const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
const asciiText = (value) => String(value ?? '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');

const KEYS = [
  { code: 'Minus', key: '-', expected: 0x71, label: '-' },
  { code: 'NumpadMultiply', key: '*', expected: 0x82, label: '*' },
  { code: 'Slash', key: '/', expected: 0x83, label: '/' },
  { code: 'Period', key: '.', expected: 0x3A, label: '.' },
  { code: 'BracketLeft', key: '(', expected: 0x10, label: '(' },
  { code: 'BracketRight', key: ')', expected: 0x11, label: ')' },
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

async function pressKey(socket, key) {
  await evalExpr(socket, `(() => {
    const down = new KeyboardEvent('keydown', { code: '${key.code}', key: '${key.key}', bubbles: true, cancelable: true });
    document.dispatchEvent(down);
    const up = new KeyboardEvent('keyup', { code: '${key.code}', key: '${key.key}', bubbles: true, cancelable: true });
    document.dispatchEvent(up);
    return window.__coldbootLastKey || null;
  })()`);
  return await waitFor(socket, `window.__coldbootLastKey?.code === '${key.code}' && window.__coldbootLastKey`, `typed ${key.code}`, 30000);
}

async function installCanvasProbe(socket) {
  await evalExpr(socket, `(() => {
    const ROI = { x: 0, y: 34, w: 128, h: 24 };
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
    function makeAscii(data, ref, bbox) {
      if (!bbox) return '';
      const x0 = Math.max(0, bbox.x0 - ROI.x - 2);
      const y0 = Math.max(0, bbox.y0 - ROI.y - 2);
      const x1 = Math.min(ROI.w - 1, bbox.x1 - ROI.x + 2);
      const y1 = Math.min(ROI.h - 1, bbox.y1 - ROI.y + 2);
      const rows = [];
      for (let y = y0; y <= y1; y++) {
        let line = '';
        for (let x = x0; x <= x1; x++) {
          const i = (y * ROI.w + x) * 4;
          if (!changed(data, ref, i)) line += ' ';
          else line += isInk(data, i) ? '#' : '+';
        }
        rows.push(String(ROI.y + y).padStart(3, '0') + '|' + line);
      }
      return rows.join('\\n');
    }
    function summarize(label, data, baseline, previous) {
      let inkPixels = 0;
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
          if (ink) inkPixels++;
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
      const bbox = bboxFor(baselineRows, baselineCols);
      const incrementalBbox = bboxFor(previousRows, previousCols);
      return {
        label,
        roi: ROI,
        inkPixels,
        diffFromBaseline,
        inkDiffFromBaseline,
        diffFromPrevious,
        inkDiffFromPrevious,
        bbox,
        incrementalBbox,
        changedRows: baselineRows
          .map((count, y) => count ? { y: ROI.y + y, count } : null)
          .filter(Boolean),
        incrementalRows: previousRows
          .map((count, y) => count ? { y: ROI.y + y, count } : null)
          .filter(Boolean),
        ascii: baseline ? makeAscii(data, baseline, bbox) : '',
        incrementalAscii: previous ? makeAscii(data, previous, incrementalBbox) : '',
      };
    }
    window.__p673SetCanvasBaseline = () => {
      const data = getRoiData();
      window.__p673CanvasBaseline = data;
      window.__p673CanvasPrevious = data;
      return summarize('baseline', data, null, null);
    };
    window.__p673SampleCanvas = (label) => {
      const data = getRoiData();
      const baseline = window.__p673CanvasBaseline;
      const previous = window.__p673CanvasPrevious;
      const result = summarize(label, data, baseline, previous);
      window.__p673CanvasPrevious = data;
      return result;
    };
    return true;
  })()`);
}

function bboxString(bbox) {
  if (!bbox) return '-';
  return `${bbox.x0},${bbox.y0}..${bbox.x1},${bbox.y1}`;
}

function buildReport(data) {
  const finalGlyph = data?.glyphs?.at?.(-1) ?? null;
  const lines = [
    '# Phase 673: Browser Insertable Visual Coverage',
    '',
    'Probe: `probe-phase673-browser-insertable-visuals.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase673-browser-insertable-visuals.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    `- Insert assertions: ${data?.insertPass ? 'PASS' : 'FAIL'}`,
    `- Canvas assertions: ${data?.canvasPass ? 'PASS' : 'FAIL'}`,
    `- Final buffer: ${(data?.final?.buffer ?? []).map((byte) => hex(byte, 2)).join(' ')}`,
    `- Final D0243A: ${hex(data?.final?.D0243A ?? 0)}`,
    `- Final VRAM pixels: ${data?.final?.vram ?? '-'}`,
    `- Final bbox: ${bboxString(finalGlyph?.bbox)}`,
    `- Page errors: ${JSON.stringify(data?.errors ?? [])}`,
    '',
    '## Key Insert Assertions',
    '',
    '| key | code | expected | shell expected | termination | steps | insert block | wipes | buffer | D0243A | D007CA | status |',
    '|---|---|---:|---:|---|---:|---:|---:|---|---:|---:|---|',
    ...(data?.keys ?? []).map((row) => `| ${row.label} | ${row.code} | ${hex(row.expected, 2)} | ${hex(row.expectedInsertByte, 2)} | ${row.termination} | ${row.steps} | ${row.insertBlock ?? '-'} | ${row.wipes} | ${row.buffer.map((byte) => hex(byte, 2)).join(' ')} | ${hex(row.D0243A)} | ${hex(row.D007CA)} | ${row.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '## Canvas Assertions',
    '',
    '| sample | ROI | diff vs baseline | ink diff vs baseline | incremental diff | incremental ink | bbox | incremental bbox | incremental rows | status |',
    '|---|---|---:|---:|---:|---:|---|---|---|---|',
    ...(data?.glyphs ?? []).map((row) => `| ${row.label} | x=${row.roi.x}, y=${row.roi.y}, w=${row.roi.w}, h=${row.roi.h} | ${row.diffFromBaseline} | ${row.inkDiffFromBaseline} | ${row.diffFromPrevious} | ${row.inkDiffFromPrevious} | ${bboxString(row.bbox)} | ${bboxString(row.incrementalBbox)} | ${row.incrementalRows.map((r) => `${r.y}:${r.count}`).join(' ')} | ${row.pass == null ? '-' : row.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '## Final ROI ASCII Diff',
    '',
    'Baseline-relative changed dark pixels are `#`; changed light pixels are `+`.',
    '',
    '```text',
    finalGlyph?.ascii || '(no diff)',
    '```',
    '',
    '## Incremental ROI ASCII Diffs',
    '',
    ...(data?.glyphs ?? [])
      .filter((row) => row.incrementalAscii)
      .flatMap((row) => [
        `### ${row.label}`,
        '',
        '```text',
        row.incrementalAscii,
        '```',
        '',
      ]),
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
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(1000);

  await evalExpr(ws, `(() => {
    window.__p673Errors = [];
    window.addEventListener('error', (e) => window.__p673Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p673Errors.push(String(e.reason || e)));
    return true;
  })()`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);

  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await installCanvasProbe(ws);
  const baselineGlyph = await evalExpr(ws, `window.__p673SetCanvasBaseline()`);

  const keyRows = [];
  const glyphs = [baselineGlyph];
  for (const key of KEYS) {
    const row = await pressKey(ws, key);
    keyRows.push({ ...row, label: key.label, expected: key.expected, pass: false });
    glyphs.push(await evalExpr(ws, `window.__p673SampleCanvas('${key.label}')`));
  }

  const final = await evalExpr(ws, `(() => ({
    lastKey: window.__coldbootLastKey || null,
    status: document.getElementById('status')?.textContent ?? null,
    errors: window.__p673Errors || [],
    vram: window.countVRAMPixels?.() ?? null,
  }))()`);
  final.status = asciiText(final.status);
  final.errors = final.errors.map((error) => asciiText(error));
  if (final.lastKey) final.lastKey.label = KEYS.at(-1).label;

  const expectedBuffer = KEYS.map((key) => key.expected);
  const finalBuffer = keyRows.at(-1)?.buffer ?? [];
  for (let idx = 0; idx < keyRows.length; idx += 1) {
    const row = keyRows[idx];
    row.pass = row.stoppedAfterInsert === true
      && row.termination === 'insert_stop'
      && row.wipes === 0
      && row.D007CA === 0x0585E9
      && row.expectedInsertByte === row.expected
      && row.buffer[idx] === row.expected;
  }

  for (let idx = 1; idx < glyphs.length; idx += 1) {
    const glyph = glyphs[idx];
    glyph.pass = glyph.diffFromBaseline > 0
      && glyph.inkDiffFromBaseline > 0
      && glyph.diffFromPrevious >= 4
      && glyph.inkDiffFromPrevious >= 4
      && glyph.incrementalBbox
      && glyph.incrementalBbox.y0 >= 38
      && glyph.incrementalBbox.y1 <= 55
      && glyph.incrementalBbox.x0 >= 0
      && glyph.incrementalBbox.x1 <= 96;
  }

  const finalGlyph = glyphs.at(-1);
  const insertPass = keyRows.every((row) => row.pass)
    && expectedBuffer.every((byte, idx) => finalBuffer[idx] === byte)
    && keyRows.at(-1)?.D0243A === 0xD1A8CC + KEYS.length
    && final.errors.length === 0
    && !String(final.status || '').includes('Validating OS');
  const canvasPass = glyphs.slice(1).every((row) => row.pass)
    && finalGlyph.inkDiffFromBaseline >= 40
    && finalGlyph.bbox
    && finalGlyph.bbox.y0 >= 38
    && finalGlyph.bbox.y1 <= 55
    && finalGlyph.bbox.x0 <= 4
    && finalGlyph.bbox.x1 <= 96;
  const pass = insertPass && canvasPass;

  summary = {
    probe: 'phase673-browser-insertable-visuals',
    chromePath,
    pageUrl,
    pass,
    insertPass,
    canvasPass,
    keys: keyRows,
    glyphs,
    final: { ...final, buffer: finalBuffer, D0243A: keyRows.at(-1)?.D0243A ?? 0 },
    errors: final.errors,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    insertPass,
    canvasPass,
    keys: keyRows.map((row) => ({
      code: row.code,
      label: row.label,
      expected: hex(row.expected, 2),
      shellExpected: hex(row.expectedInsertByte, 2),
      steps: row.steps,
      wipes: row.wipes,
      pass: row.pass,
    })),
    glyphs: glyphs.map((row) => ({
      label: row.label,
      diffFromPrevious: row.diffFromPrevious,
      inkDiffFromPrevious: row.inkDiffFromPrevious,
      incrementalBbox: row.incrementalBbox,
      pass: row.pass,
    })),
    finalBuffer: finalBuffer.map((byte) => hex(byte, 2)),
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase673-browser-insertable-visuals', pass: false, error: String(error?.stack || error) };
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

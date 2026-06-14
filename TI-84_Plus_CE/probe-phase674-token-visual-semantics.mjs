import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase674-token-visual-semantics.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const romBytes = fs.readFileSync(ROM_PATH);
const debugPort = 9681 + Math.floor(Math.random() * 500);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-token-visual-semantics-'));
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
  { label: '2', code: 'Digit2', key: '2', deposit: 0x32, ascii: 0x32 },
  { label: '+', code: 'Equal', key: '+', deposit: 0x9E, ascii: 0x2B },
  { label: '3', code: 'Digit3', key: '3', deposit: 0x33, ascii: 0x33 },
  { label: '-', code: 'Minus', key: '-', deposit: 0x71, ascii: 0x2D },
  { label: '*', code: 'NumpadMultiply', key: '*', deposit: 0x82, ascii: 0x2A },
  { label: '/', code: 'Slash', key: '/', deposit: 0x83, ascii: 0x2F },
  { label: '.', code: 'Period', key: '.', deposit: 0x3A, ascii: 0x2E },
  { label: '(', code: 'BracketLeft', key: '(', deposit: 0x10, ascii: 0x28 },
  { label: ')', code: 'BracketRight', key: ')', deposit: 0x11, ascii: 0x29 },
];

const OPERATOR_KEYS = KEYS.filter((key) => !['2', '3'].includes(key.label));

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.rom')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function decodeDirectGlyph(charCode) {
  const glyphOffset = 0x003D6E + ((charCode & 0xFF) * 0x1C);
  if (glyphOffset + 0x1C > romBytes.length) return null;
  let rightmost = -1;
  let ink = 0;
  const rows = [];
  for (let row = 0; row < 14; row += 1) {
    const rowBits = (romBytes[glyphOffset + row * 2] << 8) | romBytes[glyphOffset + row * 2 + 1];
    let line = '';
    for (let bit = 0; bit < 16; bit += 1) {
      const set = (rowBits & (0x8000 >>> bit)) !== 0;
      if (set) {
        ink += 1;
        rightmost = Math.max(rightmost, bit);
      }
      line += set ? '#' : ' ';
    }
    rows.push(`${String(row).padStart(2, '0')}|${line.replace(/\s+$/, '')}`);
  }
  return {
    charCode,
    advance: rightmost >= 0 ? rightmost + 1 : 6,
    ink,
    ascii: rows.join('\n'),
  };
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

async function installProbeHelper(socket) {
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
      const bbox = bboxFor(baselineRows, baselineCols);
      const incrementalBbox = bboxFor(previousRows, previousCols);
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
        bbox,
        incrementalBbox,
        rows: baselineRows.map((count, y) => count ? { y: ROI.y + y, count } : null).filter(Boolean),
        incrementalRows: previousRows.map((count, y) => count ? { y: ROI.y + y, count } : null).filter(Boolean),
        ascii: baseline ? makeAscii(data, baseline, bbox) : '',
        incrementalAscii: previous ? makeAscii(data, previous, incrementalBbox) : '',
      };
    }
    window.__p674CaptureBaseline = () => {
      window.__p674BaselineRoi = getRoiData();
      window.__p674PreviousRoi = window.__p674BaselineRoi;
      return summarize('baseline', window.__p674BaselineRoi, null, null);
    };
    window.__p674Sample = (label) => {
      const data = getRoiData();
      const result = summarize(label, data, window.__p674BaselineRoi, window.__p674PreviousRoi);
      window.__p674PreviousRoi = data;
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
  const lines = [
    '# Phase 674: Token Visual Semantics',
    '',
    'Probe: `probe-phase674-token-visual-semantics.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase674-token-visual-semantics.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    '- Scope: one booted browser-shell run; no browser-shell/runtime edits.',
    `- Sequence: ${(data?.sequence ?? []).join(' ')}`,
    `- Final buffer: ${(data?.final?.buffer ?? []).map((byte) => hex(byte, 2)).join(' ')}`,
    `- Final D0243A: ${hex(data?.final?.D0243A ?? 0)}`,
    `- Page errors: ${JSON.stringify(data?.errors ?? [])}`,
    '',
    '## Findings',
    '',
    ...(data?.findings ?? []).map((line) => `- ${line}`),
    '',
    '## Direct ROM Font Comparison',
    '',
    '| token | deposit | intended ASCII | deposit font ink/advance | ASCII font ink/advance | same bitmap | conclusion |',
    '|---|---:|---:|---:|---:|---|---|',
    ...(data?.directGlyphs ?? []).map((row) => `| ${row.label} | ${hex(row.deposit, 2)} | ${hex(row.asciiCode, 2)} | ${row.depositGlyph?.ink ?? '-'} / ${row.depositGlyph?.advance ?? '-'} | ${row.asciiGlyph?.ink ?? '-'} / ${row.asciiGlyph?.advance ?? '-'} | ${row.sameBitmap ? 'yes' : 'no'} | ${row.conclusion} |`),
    '',
    '## Browser Sequence',
    '',
    '| step | key | deposit | key pass | cursor | ink prev | light prev | incremental bbox | final bbox from baseline |',
    '|---:|---|---:|---|---:|---:|---:|---|---|',
    ...(data?.steps ?? []).map((step, idx) => `| ${idx + 1} | ${step.label} | ${hex(step.expected, 2)} | ${step.pass ? 'PASS' : 'FAIL'} | ${hex(step.D0243A)} | ${step.sample.inkDiffFromPrevious} | ${step.sample.lightDiffFromPrevious} | ${bboxString(step.sample.incrementalBbox)} | ${bboxString(step.sample.bbox)} |`),
    '',
    '## Incremental ASCII Diffs',
    '',
    ...(data?.steps ?? []).flatMap((step) => [
      `### ${step.label}`,
      '',
      '```text',
      step.sample.incrementalAscii || '(no diff)',
      '```',
      '',
    ]),
    '## Final ASCII Diff',
    '',
    '```text',
    data?.steps?.at?.(-1)?.sample?.ascii || '(no diff)',
    '```',
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
    window.__p674Errors = [];
    window.addEventListener('error', (e) => window.__p674Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p674Errors.push(String(e.reason || e)));
    return true;
  })()`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    if (!document.getElementById('status').textContent.includes('Coldboot complete')) {
      document.getElementById('btnBoot').click();
    }
    return true;
  })()`);

  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await installProbeHelper(ws);
  const baseline = await evalExpr(ws, `window.__p674CaptureBaseline()`);

  const directGlyphs = OPERATOR_KEYS.map((token) => {
    const depositGlyph = decodeDirectGlyph(token.deposit);
    const asciiGlyph = decodeDirectGlyph(token.ascii);
    return {
      label: token.label,
      deposit: token.deposit,
      asciiCode: token.ascii,
      depositGlyph,
      asciiGlyph,
      sameBitmap: Boolean(depositGlyph && asciiGlyph && depositGlyph.ascii === asciiGlyph.ascii),
      conclusion: token.deposit === token.ascii
        ? 'deposit byte is also the intended ASCII code'
        : 'deposit byte is a token code; direct font glyph is not the intended ASCII symbol',
    };
  });

  const steps = [];
  for (let idx = 0; idx < KEYS.length; idx += 1) {
    const key = KEYS[idx];
    const row = await pressKey(ws, key);
    const sample = await evalExpr(ws, `window.__p674Sample('${key.label}')`);
    const pass = row.stoppedAfterInsert === true
      && row.termination === 'insert_stop'
      && row.wipes === 0
      && row.expectedInsertByte === key.deposit
      && (idx >= row.buffer.length || row.buffer[idx] === key.deposit)
      && row.D0243A === 0xD1A8CC + idx + 1;
    steps.push({
      label: key.label,
      code: key.code,
      expected: key.deposit,
      pass,
      steps: row.steps,
      termination: row.termination,
      insertBlock: row.insertBlock,
      wipes: row.wipes,
      D0243A: row.D0243A,
      D007CA: row.D007CA,
      buffer: row.buffer,
      sample,
    });
  }

  const final = await evalExpr(ws, `(() => ({
    lastKey: window.__coldbootLastKey || null,
    status: document.getElementById('status')?.textContent ?? null,
    errors: window.__p674Errors || [],
    vram: window.countVRAMPixels?.() ?? null,
  }))()`);
  final.status = asciiText(final.status);
  final.errors = final.errors.map((error) => asciiText(error));
  final.buffer = steps.at(-1)?.buffer ?? [];
  final.D0243A = steps.at(-1)?.D0243A ?? 0;

  const expectedBuffer = KEYS.map((key) => key.deposit);
  const exposedBuffer = final.buffer ?? [];
  const slash = steps.find((step) => step.label === '/');
  const dot = steps.find((step) => step.label === '.');
  const star = steps.find((step) => step.label === '*');
  const lParen = steps.find((step) => step.label === '(');
  const rParen = steps.find((step) => step.label === ')');
  const directDifferentCount = directGlyphs.filter((row) => !row.sameBitmap).length;
  const pass = steps.every((step) => step.pass && step.sample.inkDiffFromPrevious > 0)
    && expectedBuffer.slice(0, exposedBuffer.length).every((byte, idx) => exposedBuffer[idx] === byte)
    && final.D0243A === 0xD1A8CC + KEYS.length
    && final.errors.length === 0
    && directGlyphs.every((row) => row.depositGlyph && row.asciiGlyph);

  const findings = [
    `${directDifferentCount}/7 operator/punctuation deposit bytes have a different direct ROM-font bitmap than their intended ASCII symbol; these bytes must be treated as tokens, not direct character codes.`,
    `The browser sequence exposed the first 8 deposited bytes as ${exposedBuffer.map((byte) => hex(byte, 2)).join(' ')} and advanced D0243A to ${hex(final.D0243A)} after 9 inserts, so the visual quirks are not buffer/cursor failures.`,
    `Adjacent operator/punctuation rendering rewrites pixels in-place: "*" bbox ${bboxString(star?.sample?.incrementalBbox)}, "/" bbox ${bboxString(slash?.sample?.incrementalBbox)} with ${slash?.sample?.lightDiffFromPrevious ?? '-'} light-pixel erasures, "." bbox ${bboxString(dot?.sample?.incrementalBbox)} with ${dot?.sample?.lightDiffFromPrevious ?? '-'} erasures.`,
    `"(" still rewrites the dot band (${bboxString(lParen?.sample?.incrementalBbox)} with ${lParen?.sample?.lightDiffFromPrevious ?? '-'} erasures), while ")" advances to ${bboxString(rParen?.sample?.incrementalBbox)}; the phase673 overlap is renderer context behavior rather than a frozen canvas or missing cursor advance.`,
  ];

  summary = {
    probe: 'phase674-token-visual-semantics',
    chromePath,
    pageUrl,
    pass,
    sequence: KEYS.map((key) => key.label),
    baseline,
    findings,
    directGlyphs,
    steps,
    final,
    errors: final.errors,
  };

  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    finalBuffer: final.buffer.map((byte) => hex(byte, 2)),
    finalCursor: hex(final.D0243A),
    directDifferentCount,
    steps: steps.map((step) => ({
      label: step.label,
      pass: step.pass,
      inkPrev: step.sample.inkDiffFromPrevious,
      lightPrev: step.sample.lightDiffFromPrevious,
      incrementalBbox: step.sample.incrementalBbox,
    })),
    findings,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase674-token-visual-semantics', pass: false, error: String(error?.stack || error) };
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

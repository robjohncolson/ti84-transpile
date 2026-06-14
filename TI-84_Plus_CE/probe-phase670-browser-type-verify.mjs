import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase670-browser-type-verify.md');
const debugPort = 9677;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-type-verify-'));
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

const KEYS = [
  { code: 'Digit2', key: '2', expected: 0x32, label: '2' },
  { code: 'Digit3', key: '3', expected: 0x33, label: '3' },
  { code: 'Equal', key: '+', expected: 0x9E, label: '+' },
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

function buildReport(data) {
  const lines = [
    '# Phase 670: Browser Type Verify',
    '',
    'Probe: `probe-phase670-browser-type-verify.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase670-browser-type-verify.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    `- Final buffer: ${(data?.final?.buffer ?? []).map((byte) => hex(byte, 2)).join(' ')}`,
    `- Final D0243A: ${hex(data?.final?.D0243A ?? 0)}`,
    `- Page errors: ${JSON.stringify(data?.errors ?? [])}`,
    '',
    '## Keys',
    '',
    '| key | termination | steps | insert block | wipes | buffer | D0243A | D007CA |',
    '|---|---:|---:|---:|---:|---|---:|---:|',
    ...(data?.keys ?? []).map((row) => `| ${row.label} | ${row.termination} | ${row.steps} | ${row.insertBlock ?? '-'} | ${row.wipes} | ${row.buffer.map((byte) => hex(byte, 2)).join(' ')} | ${hex(row.D0243A)} | ${hex(row.D007CA)} |`),
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
    window.__p670Errors = [];
    window.addEventListener('error', (e) => window.__p670Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__p670Errors.push(String(e.reason || e)));
    return true;
  })()`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);

  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);

  const keyRows = [];
  for (const key of KEYS) {
    const row = await pressKey(ws, key);
    keyRows.push({ ...row, expected: key.expected });
  }

  const final = await evalExpr(ws, `(() => ({
    lastKey: window.__coldbootLastKey || null,
    status: document.getElementById('status')?.textContent ?? null,
    errors: window.__p670Errors || [],
    vram: window.countVRAMPixels?.() ?? null,
  }))()`);

  const expectedBuffer = KEYS.map((key) => key.expected);
  const finalBuffer = keyRows.at(-1)?.buffer ?? [];
  const pass = keyRows.every((row, idx) => (
    row.stoppedAfterInsert === true
    && row.termination === 'insert_stop'
    && row.wipes === 0
    && row.D007CA === 0x0585E9
    && row.buffer[idx] === row.expected
  ))
    && expectedBuffer.every((byte, idx) => finalBuffer[idx] === byte)
    && keyRows.at(-1)?.D0243A === 0xD1A8CF
    && final.errors.length === 0
    && !String(final.status || '').includes('Validating OS');

  summary = { probe: 'phase670-browser-type-verify', chromePath, pageUrl, pass, keys: keyRows, final: { ...final, buffer: finalBuffer, D0243A: keyRows.at(-1)?.D0243A ?? 0 } };
  console.log(JSON.stringify({ probe: summary.probe, pass, keys: keyRows.map((row) => ({ code: row.code, steps: row.steps, wipes: row.wipes, buffer: row.buffer })) }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase670-browser-type-verify', pass: false, error: String(error?.stack || error) };
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

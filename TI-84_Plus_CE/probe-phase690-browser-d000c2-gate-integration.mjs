import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase690-browser-d000c2-gate-integration.md');
const debugPort = 9677;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase690-'));
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
const hex = (value, width = 2) => `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

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

function buildReport(data) {
  const lines = [
    '# Phase 690: Browser D000C2 Gate Integration',
    '',
    'Probe: `probe-phase690-browser-d000c2-gate-integration.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase690-browser-d000c2-gate-integration.mjs`',
    '',
    '## Result',
    '',
    `- Overall: ${data?.pass ? '**PASS**' : '**FAIL**'}`,
    `- Keys: ${(data?.keys ?? []).map((row) => `${row.key}:${row.lastKey?.termination}/${hex(row.lastKey?.D000C2 ?? 0)}`).join(', ')}`,
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
    window.__phase690Errors = [];
    window.addEventListener('error', (e) => window.__phase690Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__phase690Errors.push(String(e.reason || e)));
    return true;
  })()`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);

  const sequence = [
    { code: 'Digit2', key: '2', vk: 50, expected: [0x32] },
    { code: 'NumpadAdd', key: '+', vk: 107, expected: [0x32, 0x9E] },
    { code: 'Digit3', key: '3', vk: 51, expected: [0x32, 0x9E, 0x33] },
  ];
  const keyRows = [];

  for (const item of sequence) {
    await cdp(ws, 'Input.dispatchKeyEvent', keyDownParams(item));
    await waitFor(ws, `window.__coldbootLastKey?.code === ${JSON.stringify(item.code)}`, `lastKey ${item.key}`, 120000);
    await cdp(ws, 'Input.dispatchKeyEvent', keyUpParams(item));
    const row = await evalExpr(ws, `(() => ({
      key: ${JSON.stringify(item.key)},
      status: document.getElementById('status')?.textContent ?? null,
      lastKey: window.__coldbootLastKey,
      diagnostics: window.__coldbootReadEditLineState?.() ?? null,
      errors: window.__phase690Errors || [],
    }))()`);
    keyRows.push(row);
  }

  const errors = await evalExpr(ws, 'window.__phase690Errors || []');
  const pass = keyRows.every((row, index) => {
    const expected = sequence[index].expected;
    const last = row.lastKey || {};
    const buffer = last.buffer || [];
    return last.termination === 'post_insert_gate_stop'
      && last.stoppedAtPostInsertGate === true
      && last.D000C2Bit7Restored === true
      && last.D000C2 === 0
      && last.postInsertGateBlock > last.insertBlock
      && last.steps < 50000
      && expected.every((byte, i) => buffer[i] === byte)
      && last.vramCurrent > 100
      && row.errors.length === 0;
  }) && errors.length === 0;

  summary = { probe: 'phase690-browser-d000c2-gate-integration', chromePath, pageUrl, pass, keys: keyRows, errors };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    keys: keyRows.map((row) => ({
      key: row.key,
      termination: row.lastKey?.termination,
      steps: row.lastKey?.steps,
      insertBlock: row.lastKey?.insertBlock,
      gateBlock: row.lastKey?.postInsertGateBlock,
      D000C2: row.lastKey?.D000C2,
      restored: row.lastKey?.D000C2Bit7Restored,
      buffer: row.lastKey?.buffer?.slice(0, 4),
      vramCurrent: row.lastKey?.vramCurrent,
    })),
    errors,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase690-browser-d000c2-gate-integration', pass: false, error: String(error?.stack || error) };
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

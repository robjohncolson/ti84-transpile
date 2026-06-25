import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase827-numpad-alias-coverage.md');
const debugPort = 20000 + Math.floor(Math.random() * 20000);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase827-numpad-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const EDIT_BASE = 0xD1A8CC;
const HOME_HANDLER = 0x0585E9;
const CLEAN_INSERT = 'post_insert_gate_stop';

const ALIASES = Object.freeze([
  { code: 'Numpad0', key: '0', vk: 96, aliasOf: 'Digit0', expectedBytes: [0x30] },
  { code: 'Numpad1', key: '1', vk: 97, aliasOf: 'Digit1', expectedBytes: [0x31] },
  { code: 'Numpad4', key: '4', vk: 100, aliasOf: 'Digit4', expectedBytes: [0x34] },
  { code: 'Numpad7', key: '7', vk: 103, aliasOf: 'Digit7', expectedBytes: [0x37] },
  { code: 'NumpadAdd', key: '+', vk: 107, aliasOf: 'Equal', expectedBytes: [0x9E] },
  { code: 'NumpadSubtract', key: '-', vk: 109, aliasOf: 'Minus', expectedBytes: [0x71] },
  { code: 'NumpadMultiply', key: '*', vk: 106, aliasOf: 'NumpadMultiply', expectedBytes: [0x82] },
  { code: 'NumpadDivide', key: '/', vk: 111, aliasOf: 'Slash', expectedBytes: [0x83] },
  { code: 'NumpadDecimal', key: '.', vk: 110, aliasOf: 'Period', expectedBytes: [0x3A] },
  { code: 'NumpadComma', key: ',', vk: 108, aliasOf: 'Comma', expectedBytes: [0x2B, 0x11], expectedControlStopPc: 0x001879 },
]);

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
const formatBytes = (bytes) => (bytes ?? []).map((byte) => hex(byte, 2)).join(' ');

function objectBody(source, name) {
  const marker = `const ${name} = Object.freeze({`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${name}`);
  const bodyStart = start + marker.length;
  const end = source.indexOf('});', bodyStart);
  if (end < 0) throw new Error(`Could not find end of ${name}`);
  return source.slice(bodyStart, end);
}

function parseNumberMap(source, name) {
  const body = objectBody(source, name);
  const entries = {};
  for (const match of body.matchAll(/\b([A-Za-z0-9]+):\s*0x([0-9A-Fa-f]+)/g)) {
    entries[match[1]] = Number.parseInt(match[2], 16);
  }
  return entries;
}

function parseControlMap(source) {
  const body = objectBody(source, 'COLDBOOT_CONTROL_PRE_STOP_BY_PC_CODE');
  const entries = {};
  for (const match of body.matchAll(/\b([A-Za-z0-9]+):\s*\{\s*pc:\s*0x([0-9A-Fa-f]+),\s*label:\s*'([^']+)'/g)) {
    entries[match[1]] = {
      controlPreStopPc: Number.parseInt(match[2], 16),
      controlPreStopLabel: match[3],
    };
  }
  return entries;
}

function readStaticMappings() {
  const source = fs.readFileSync(path.join(shellRoot, 'browser-shell.html'), 'utf8');
  const scanMap = parseNumberMap(source, 'GETCSC_SCAN_CODE_BY_PC_CODE');
  const insertMap = parseNumberMap(source, 'COLDBOOT_INSERT_BYTE_BY_PC_CODE');
  const controlMap = parseControlMap(source);
  const codes = [...new Set(ALIASES.flatMap((item) => [item.code, item.aliasOf]))];
  return Object.fromEntries(codes.map((code) => [code, {
    scan: scanMap[code] ?? null,
    insertByte: insertMap[code] ?? null,
    controlPreStopPc: controlMap[code]?.controlPreStopPc ?? null,
    controlPreStopLabel: controlMap[code]?.controlPreStopLabel ?? null,
  }]));
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
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function cdp(socket, method, params = {}, timeout = 120000) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, timeout);
    timer.unref?.();
    pending.set(id, { resolve, reject, timer });
  });
}

async function evalExpr(socket, expression, timeout = 120000) {
  const result = await cdp(socket, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  }, timeout + 5000);
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

function keyParams(item, type) {
  const params = {
    type,
    windowsVirtualKeyCode: item.vk,
    nativeVirtualKeyCode: item.vk,
    code: item.code,
    key: item.key,
  };
  if (type === 'keyDown') {
    params.text = item.key;
    params.unmodifiedText = item.key;
  }
  return params;
}

async function pressAlias(socket, item) {
  await evalExpr(socket, 'window.__coldbootLastKey = null; true', 10000);
  await cdp(socket, 'Input.dispatchKeyEvent', keyParams(item, 'keyDown'), 180000);
  await cdp(socket, 'Input.dispatchKeyEvent', keyParams(item, 'keyUp'), 30000);
  await waitFor(socket, `window.__coldbootLastKey?.code === ${JSON.stringify(item.code)}`, item.code, 120000);
  await sleep(100);
  return await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    pageErrors: window.__phase827PageErrors ?? [],
  }))()`, 30000);
}

function assessRow(item, state, mappings, expectedCursorBefore) {
  const key = state?.lastKey ?? {};
  const diag = state?.diagnostics ?? {};
  const aliasMap = mappings[item.code] ?? {};
  const canonicalMap = mappings[item.aliasOf] ?? {};
  const staticEquivalent = aliasMap.scan === canonicalMap.scan
    && aliasMap.insertByte === canonicalMap.insertByte
    && aliasMap.controlPreStopPc === canonicalMap.controlPreStopPc;

  const expectedCursorAfter = expectedCursorBefore + item.expectedBytes.length;
  const isControlExpected = item.expectedControlStopPc != null;
  const cleanPass = !isControlExpected
    && key.termination === CLEAN_INSERT
    && key.stoppedAtPostInsertGate === true
    && key.expectedInsertByte === item.expectedBytes[0]
    && key.cursorBefore === expectedCursorBefore
    && key.D0243A === expectedCursorAfter
    && diag.D0243A === expectedCursorAfter
    && key.D000C2Bit7Restored === true
    && key.D000C2 === 0
    && key.wipes === 0
    && key.D007CA === HOME_HANDLER
    && diag.D007CA === HOME_HANDLER;
  const controlPass = isControlExpected
    && key.termination === 'control_pre_stop'
    && key.controlStopPc === item.expectedControlStopPc
    && key.controlPreStopPc === item.expectedControlStopPc
    && key.D0243A === expectedCursorAfter
    && diag.D0243A === expectedCursorAfter
    && key.wipes === 0
    && key.D007CA === HOME_HANDLER
    && diag.D007CA === HOME_HANDLER;
  const expectedTail = item.expectedBytes;
  const buffer = Array.isArray(key.buffer) ? key.buffer : [];
  const bufferHasVisibleTail = expectedCursorBefore - EDIT_BASE + expectedTail.length <= buffer.length;
  const bufferPass = !bufferHasVisibleTail || expectedTail.every((byte, idx) => {
    const bufferIdx = expectedCursorBefore - EDIT_BASE + idx;
    return buffer[bufferIdx] === byte;
  });
  const pass = staticEquivalent
    && key.code === item.code
    && state.pageErrors.length === 0
    && bufferPass
    && (isControlExpected ? controlPass : cleanPass);

  return {
    code: item.code,
    key: item.key,
    aliasOf: item.aliasOf,
    expectedBytes: item.expectedBytes,
    expectedCursorBefore,
    expectedCursorAfter,
    static: { alias: aliasMap, canonical: canonicalMap, equivalent: staticEquivalent },
    dynamic: {
      label: key.label ?? null,
      termination: key.termination ?? null,
      steps: key.steps ?? null,
      expectedInsertByte: key.expectedInsertByte ?? null,
      cursorBefore: key.cursorBefore ?? null,
      D0243A: key.D0243A ?? null,
      D007CA: key.D007CA ?? null,
      D008E0: key.D008E0 ?? null,
      D02590: key.D02590 ?? null,
      D000C2: key.D000C2 ?? null,
      D000C2Bit7Restored: key.D000C2Bit7Restored ?? null,
      controlStopPc: key.controlStopPc ?? null,
      controlPreStopPc: key.controlPreStopPc ?? null,
      controlPreStopLabel: key.controlPreStopLabel ?? null,
      wipes: key.wipes ?? null,
      buffer,
      vramCurrent: key.vramCurrent ?? null,
    },
    checks: {
      staticEquivalent,
      code: key.code === item.code,
      noPageErrors: state.pageErrors.length === 0,
      bufferPass,
      expectedMode: isControlExpected ? controlPass : cleanPass,
    },
    pass,
  };
}

function buildReport(data) {
  const rows = data?.rows ?? [];
  const confirmed = rows.filter((row) => row.pass);
  const divergent = rows.filter((row) => !row.pass);
  return [
    '# Phase 827: Numpad Alias Coverage',
    '',
    'Probe: `probe-phase827-numpad-alias-coverage.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase827-numpad-alias-coverage.mjs`',
    '',
    'Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, records static shell mappings, then presses the deferred Numpad aliases in one browser session.',
    '',
    '## Result',
    '',
    `- Probe completed: ${data?.probeCompleted ? 'PASS' : 'FAIL'}`,
    `- Alias confirmations: ${confirmed.length}/${rows.length}.`,
    `- Divergences: ${divergent.length ? divergent.map((row) => row.code).join(', ') : 'none'}.`,
    `- Final cursor: ${hex(data?.final?.D0243A)}; final visible buffer: ${formatBytes(data?.final?.buffer)}`,
    `- Page errors: ${JSON.stringify(data?.final?.pageErrors ?? [])}`,
    '',
    '## Alias Rows',
    '',
    '| alias | canonical | static eq | termination | steps | expected bytes | cursor | stop pc | wipes | status |',
    '|---|---|---|---|---:|---|---:|---:|---:|---|',
    ...rows.map((row) => `| ${row.code} | ${row.aliasOf} | ${row.static.equivalent ? 'yes' : 'no'} | ${row.dynamic.termination ?? '-'} | ${row.dynamic.steps ?? '-'} | ${formatBytes(row.expectedBytes)} | ${hex(row.dynamic.D0243A)} | ${hex(row.dynamic.controlStopPc)} | ${row.dynamic.wipes ?? '-'} | ${row.pass ? 'PASS' : 'DIVERGED'} |`),
    '',
    '## Notes',
    '',
    '- `NumpadComma` is evaluated against the canonical `Comma` behavior: token pair `0x2B 0x11`, cursor +2, and a pre-wipe stop at `0x001879`.',
    '- The public edit-buffer diagnostics expose the first 8 bytes, so later rows rely on cursor, token-byte, stop, and static-map checks rather than final visible tail bytes.',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify(data?.compact ?? data, null, 2),
    '```',
    '',
  ].join('\n');
}

try {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

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
    window.__phase827PageErrors = [];
    window.addEventListener('error', (event) => {
      window.__phase827PageErrors.push(String(event.message || event.error || event));
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__phase827PageErrors.push(String(event.reason || event));
    });
    return true;
  })()`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);

  const mappings = readStaticMappings();
  const rows = [];
  let expectedCursor = EDIT_BASE;
  for (const item of ALIASES) {
    const state = await pressAlias(ws, item);
    const row = assessRow(item, state, mappings, expectedCursor);
    rows.push(row);
    if (row.pass) expectedCursor = row.expectedCursorAfter;
  }

  const final = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    pageErrors: window.__phase827PageErrors ?? [],
  }))()`, 30000);
  summary = {
    probe: 'phase827-numpad-alias-coverage',
    chromePath,
    pageUrl,
    probeCompleted: true,
    allAliasesEquivalent: rows.every((row) => row.pass),
    rows,
    final: {
      status: final.status,
      pageErrors: final.pageErrors,
      D0243A: final.diagnostics?.D0243A ?? null,
      D007CA: final.diagnostics?.D007CA ?? null,
      buffer: final.diagnostics?.buffer ?? [],
      vramCurrent: final.diagnostics?.vramCurrent ?? null,
    },
  };
  summary.compact = {
    probe: summary.probe,
    probeCompleted: summary.probeCompleted,
    allAliasesEquivalent: summary.allAliasesEquivalent,
    confirmations: rows.filter((row) => row.pass).length,
    total: rows.length,
    divergent: rows.filter((row) => !row.pass).map((row) => row.code),
    rows: rows.map((row) => ({
      code: row.code,
      aliasOf: row.aliasOf,
      pass: row.pass,
      staticEquivalent: row.static.equivalent,
      termination: row.dynamic.termination,
      steps: row.dynamic.steps,
      expectedBytes: formatBytes(row.expectedBytes),
      expectedInsertByte: hex(row.dynamic.expectedInsertByte, 2),
      cursor: hex(row.dynamic.D0243A),
      controlStopPc: hex(row.dynamic.controlStopPc),
      wipes: row.dynamic.wipes,
      checks: row.checks,
    })),
    final: {
      D0243A: hex(summary.final.D0243A),
      D007CA: hex(summary.final.D007CA),
      buffer: formatBytes(summary.final.buffer),
      pageErrors: summary.final.pageErrors,
    },
  };
  console.log(JSON.stringify(summary.compact, null, 2));
} catch (error) {
  summary = {
    probe: 'phase827-numpad-alias-coverage',
    probeCompleted: false,
    error: String(error?.stack || error),
  };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  await sleep(500);
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

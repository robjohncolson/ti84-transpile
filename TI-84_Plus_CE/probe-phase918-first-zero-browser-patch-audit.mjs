import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase918-first-zero-browser-patch-audit.md');
const CLEAR_CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const RAM_BASE = 0xD00000;
const DEBUG_PORT = 9918;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase918-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

const WATCHED_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02505', 0xD02505, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D0301B', 0xD0301B, 3],
  ['D00587', 0xD00587, 1],
  ['D00588', 0xD00588, 1],
  ['D00589', 0xD00589, 1],
  ['D0058B', 0xD0058B, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
  ['EDIT_TOKEN_D1A8CC', 0xD1A8CC, 1],
]);

const CORE_ORACLE_FIELDS = Object.freeze([
  'D007CA',
  'D008E0',
  'D010EF',
  'D010FE',
  'D010F4',
  'D02317',
  'D0231A',
  'D0231D',
  'D02437',
  'D0243A',
  'D0243D',
  'D02440',
  'D02505',
  'D02590',
  'D0259D',
  'D02A29',
  'D0301B',
  'EDIT_TOKEN_D1A8CC',
]);

const ALLOWED_AFTER_CLEAR_RESIDUALS = new Set(['D0243D', 'EDIT_TOKEN_D1A8CC']);

const DIGIT3_KEY = Object.freeze({ code: 'Digit3', key: '3', vk: 51 });
const CLEAR_KEY = Object.freeze({ code: 'Escape', key: 'Escape', vk: 27 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

function valueWidth(name) {
  if (/^D005/.test(name) || name === 'D010F4' || name === 'D02505' || name === 'EDIT_TOKEN_D1A8CC') return 2;
  if (name === 'D02A29') return 4;
  return 6;
}

function readValue(bytes, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i++) value |= (bytes[(addr + i) >>> 0] ?? 0) << (8 * i);
  return value >>> 0;
}

function readCaptureValue(buffer, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > buffer.length) return null;
  return readValue(buffer, offset, len);
}

function readCaptureFields() {
  const capture = fs.readFileSync(CLEAR_CAPTURE_PATH);
  return Object.fromEntries(WATCHED_FIELDS.map(([name, addr, len]) => [name, readCaptureValue(capture, addr, len)]));
}

function compareFields(actual, oracle, names = CORE_ORACLE_FIELDS) {
  return names.map((name) => ({
    name,
    oracle: oracle[name],
    actual: actual?.[name],
    match: actual?.[name] === oracle[name],
  }));
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

function instrumentBrowserShell(sourceHtml) {
  const marker = 'window.__coldbootApplyUiLevelClear = applyColdbootUiLevelClear;';
  if (!sourceHtml.includes(marker)) throw new Error('Phase918 marker not found');
  const instrumentation = String.raw`
const PHASE918_SEQUENCE_LIMIT = 12000;
const PHASE918_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02505', 0xD02505, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D0301B', 0xD0301B, 3],
  ['D00587', 0xD00587, 1],
  ['D00588', 0xD00588, 1],
  ['D00589', 0xD00589, 1],
  ['D0058B', 0xD0058B, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
  ['EDIT_TOKEN_D1A8CC', 0xD1A8CC, 1],
]);
const PHASE918_TARGETS = Object.freeze({
  keyDebounceCounter03F9AE: 0x03F9AE,
  keyDebounceFallthrough03F9B0: 0x03F9B0,
  keyDebounceReturn03D058: 0x03D058,
  residualOwner05E26C: 0x05E26C,
  clearAnchor0A229D: 0x0A229D,
  preWipe001879: 0x001879,
  cleanup0018F8: 0x0018F8,
});
let phase918OriginalRunFrom = null;
let phase918Current = null;
function phase918ReadFields() {
  if (!cpu?.memory) return {};
  return Object.fromEntries(PHASE918_FIELDS.map(([name, addr, len]) => [
    name,
    readMemoryFieldValue(cpu.memory, addr, len),
  ]));
}
function phase918TargetName(addr) {
  for (const [name, value] of Object.entries(PHASE918_TARGETS)) {
    if (addr === value) return name;
  }
  return null;
}
function phase918RecordBlock(pc, mode, steps) {
  if (!phase918Current || !cpu?.memory) return;
  const addr = pc & 0xFFFFFF;
  const targetName = phase918TargetName(addr);
  if (targetName) phase918Current.targetCounts[targetName] = (phase918Current.targetCounts[targetName] ?? 0) + 1;
  if (targetName && phase918Current.sequence.length < PHASE918_SEQUENCE_LIMIT) {
    const fields = phase918ReadFields();
    phase918Current.sequence.push({ index: phase918Current.blockCount, pc: addr, mode, steps, fields });
  }
  phase918Current.blockCount += 1;
}
window.__Phase918 = {
  install() {
    if (!executor) return false;
    if (phase918OriginalRunFrom) return true;
    phase918OriginalRunFrom = executor.runFrom.bind(executor);
    executor.runFrom = (pc, mode, opts = {}) => {
      const originalOnBlock = opts?.onBlock;
      return phase918OriginalRunFrom(pc, mode, {
        ...opts,
        onBlock(blockPc, blockMode, meta, steps) {
          phase918RecordBlock(blockPc, blockMode, steps);
          if (typeof originalOnBlock === 'function') return originalOnBlock(blockPc, blockMode, meta, steps);
          return undefined;
        },
      });
    };
    return true;
  },
  reset(label) {
    phase918Current = {
      label,
      blockCount: 0,
      targetCounts: {},
      sequence: [],
      startFields: phase918ReadFields(),
    };
    return phase918Current;
  },
  read(label) {
    return {
      label,
      fields: phase918ReadFields(),
      targetCounts: { ...(phase918Current?.targetCounts ?? {}) },
      sequence: [...(phase918Current?.sequence ?? [])],
      lastKey: window.__coldbootLastKey ?? null,
      status: document.getElementById('status')?.textContent ?? null,
    };
  },
};
`;
  return sourceHtml.replace(marker, `${marker}\n${instrumentation}`);
}

function startStaticServer() {
  const sourceHtml = fs.readFileSync(path.join(shellRoot, 'browser-shell.html'), 'utf8');
  const instrumentedHtml = instrumentBrowserShell(sourceHtml);
  const serverInstance = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'browser-shell.html';
      const fullPath = path.resolve(shellRoot, rel);
      if (fullPath !== shellRoot && !fullPath.startsWith(`${shellRoot}${path.sep}`)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      if (rel === 'browser-shell.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(instrumentedHtml);
        return;
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
      const pages = await httpJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
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

function keyParams(keySpec, type) {
  return {
    type,
    windowsVirtualKeyCode: keySpec.vk,
    nativeVirtualKeyCode: keySpec.vk,
    code: keySpec.code,
    key: keySpec.key,
  };
}

async function pressKey(keySpec, label) {
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${keySpec.code}'`, `${label} completion`, 90000);
  await sleep(150);
  return evalExpr(ws, `window.__Phase918.read(${JSON.stringify(label)})`, 30000);
}

function buildRows(rows) {
  if (rows.length === 0) return '_None._\n';
  return [
    '| Field | Oracle | Actual | Allowed |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.name} | ${hex(row.oracle, valueWidth(row.name))} | ${hex(row.actual, valueWidth(row.name))} | ${ALLOWED_AFTER_CLEAR_RESIDUALS.has(row.name) ? 'yes' : 'no'} |`),
  ].join('\n') + '\n';
}

function buildReport(data) {
  const digitDrain = data?.digit?.lastKey?.postInsertFirstZeroDrain;
  const escapeCounts = data?.escape?.targetCounts ?? {};
  const mismatches = data?.afterClearMismatches ?? [];
  const lines = [
    '# Phase 918: Browser First-Zero Handoff Patch Audit',
    '',
    'Probe: `probe-phase918-first-zero-browser-patch-audit.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase918-first-zero-browser-patch-audit.mjs`',
    '',
    'Serves a temporary instrumented copy of the patched `browser-shell.html`; disk',
    '`browser-shell.html` is the production file under test.',
    '',
    '## Summary',
    '',
    `- Probe completed: ${data?.pass ? 'PASS' : 'FAIL'}.`,
    `- Digit3 drain: ok=${digitDrain?.ok ?? false}, stop=${digitDrain?.stopPc == null ? '-' : hex(digitDrain.stopPc)}, D0058B=${digitDrain?.stopD0058B == null ? '-' : hex(digitDrain.stopD0058B, 2)}, steps=${digitDrain?.steps ?? '-'}, wipes=${digitDrain?.wipes ?? '-'}.`,
    `- Escape route: 0x0A229D=${escapeCounts.clearAnchor0A229D ?? 0}, 0x001879=${escapeCounts.preWipe001879 ?? 0}, 0x0018F8=${escapeCounts.cleanup0018F8 ?? 0}, uiClearApplied=${data?.escape?.lastKey?.uiClearApplied === true}, wipes=${data?.escape?.lastKey?.wipes ?? '-'}.`,
    `- After-CLEAR oracle mismatches: ${mismatches.map((row) => row.name).join(', ') || 'none'}.`,
    '',
    '## After-CLEAR Mismatches',
    '',
    buildRows(mismatches),
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
  ];
  return lines.join('\n');
}

try {
  const oracle = readCaptureFields();
  server = await startStaticServer();
  const pageUrl = `http://127.0.0.1:${server.address().port}/browser-shell.html`;
  chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ws = await connect(await waitForDevtools());
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Page.navigate', { url: `${pageUrl}?phase918=${Date.now()}` });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(500);
  await evalExpr(ws, `(() => {
    window.__phase918Errors = [];
    window.addEventListener('error', (e) => window.__phase918Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__phase918Errors.push(String(e.reason || e)));
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await waitFor(ws, 'window.__Phase918?.install?.() === true', 'Phase918 observer install', 30000);

  await evalExpr(ws, `window.__Phase918.reset('Digit3')`, 30000);
  const digit = await pressKey(DIGIT3_KEY, 'Digit3');
  await evalExpr(ws, `window.__Phase918.reset('Escape')`, 30000);
  const escape = await pressKey(CLEAR_KEY, 'Escape');
  const errors = await evalExpr(ws, 'window.__phase918Errors || []', 30000);

  const afterClearComparison = compareFields(escape.fields, oracle);
  const afterClearMismatches = afterClearComparison.filter((row) => !row.match);
  const unexpectedMismatches = afterClearMismatches.filter((row) => !ALLOWED_AFTER_CLEAR_RESIDUALS.has(row.name));
  const digitDrain = digit?.lastKey?.postInsertFirstZeroDrain;
  const escapeCounts = escape?.targetCounts ?? {};
  const pass = Boolean(
    errors.length === 0
    && digit?.lastKey?.code === 'Digit3'
    && digit?.lastKey?.stoppedAtPostInsertGate === true
    && digitDrain?.ok === true
    && digitDrain?.stopPc === 0x03F9B0
    && digitDrain?.stopD0058B === 0
    && digitDrain?.wipes === 0
    && digit.fields?.D007CA === 0x0585E9
    && digit.fields?.D0243A === 0xD1A8CD
    && digit.fields?.EDIT_TOKEN_D1A8CC === 0x33
    && escape?.lastKey?.code === 'Escape'
    && escape?.lastKey?.controlStopPc === 0x0A229D
    && escape?.lastKey?.uiClearApplied === true
    && escape?.lastKey?.wipes === 0
    && (escapeCounts.clearAnchor0A229D ?? 0) >= 1
    && (escapeCounts.preWipe001879 ?? 0) === 0
    && (escapeCounts.cleanup0018F8 ?? 0) === 0
    && unexpectedMismatches.length === 0
  );

  summary = {
    probe: 'phase918-first-zero-browser-patch-audit',
    pass,
    chromePath,
    pageUrl,
    digit,
    escape,
    afterClearComparison,
    afterClearMismatches,
    unexpectedMismatches,
    errors,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    digitDrain,
    escapeCounts,
    afterClearMismatches: afterClearMismatches.map((row) => row.name),
    errors,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase918-first-zero-browser-patch-audit', pass: false, error: String(error?.stack || error) };
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

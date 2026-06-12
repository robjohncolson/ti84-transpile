import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) {
  throw new Error('No Chrome/Edge executable found for headless browser test');
}

const port = 9637;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase637-'));
const pageUrl = pathToFileURL(path.join(import.meta.dirname, 'browser-shell.html')).href;
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--allow-file-access-from-files',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let nextId = 1;
const pending = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function waitForDevtools() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const pages = await httpJson(`http://127.0.0.1:${port}/json/list`);
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome may still be starting.
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome DevTools endpoint');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error(`PAGE_EXCEPTION ${JSON.stringify(msg.params?.exceptionDetails || {})}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params?.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      console.error(`PAGE_CONSOLE ${msg.params?.type}: ${text}`);
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

function cdp(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 120000);
  });
}

async function evalExpr(ws, expression, timeout = 120000) {
  const result = await cdp(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception');
  }
  return result.result.value;
}

async function waitFor(ws, expression, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    const value = await evalExpr(ws, expression, 10000);
    lastValue = value;
    if (value) return value;
    await sleep(250);
  }
  const diagnostics = await readPageState(ws).catch((error) => ({ diagnosticError: error.message }));
  throw new Error(`Timed out waiting for ${label}; lastValue=${JSON.stringify(lastValue)} diagnostics=${JSON.stringify(diagnostics)}`);
}

function keyParams(code, key, windowsVirtualKeyCode, text = key) {
  const params = {
    type: 'keyDown',
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    code,
    key,
  };
  if (text) {
    params.text = text;
    params.unmodifiedText = text;
  }
  return params;
}

async function pressKey(ws, item) {
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(item.code, item.key, item.vk, item.text ?? item.key));
  await cdp(ws, 'Input.dispatchKeyEvent', { ...keyParams(item.code, item.key, item.vk, ''), type: 'keyUp' });
  await sleep(250);
}

async function readPageState(ws) {
  return await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    preserve: document.getElementById('preserveDisplay')?.checked ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
    diagnostics: window.getColdbootPersistenceDiagnostics?.() ?? null,
    vramPixels: window.countVRAMPixels?.() ?? null,
    errors: window.__phase637Errors || [],
    infoLogTail: Array.from(document.getElementById('log')?.querySelectorAll('.info') || []).slice(-10).map((n) => n.textContent),
  }))()`);
}

function buildReport(summary) {
  const lines = [
    '# Phase 637: Browser Shell Token/Tuple Persistence',
    '',
    'Probe: `probe-phase637-browser-shell-persistence.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase637-browser-shell-persistence.mjs`  ',
    `Exit: ${summary.pass ? 0 : 1}`,
    '',
    '## Summary',
    '',
    `- ${summary.eolTuplePass ? '****' : '!!'} EOL/Escape path ${summary.eolTuplePass ? 'restored' : 'did not restore'} the coherent tuple: \`D02A29=0x${summary.afterEol?.diagnostics?.tuple?.D02A29?.toString(16).padStart(4, '0') ?? '????'} D0243D=0x${summary.afterEol?.diagnostics?.tuple?.D0243D?.toString(16).padStart(6, '0') ?? '??????'} D02A40=0x${summary.afterEol?.diagnostics?.tuple?.D02A40?.toString(16).padStart(6, '0') ?? '??????'}\`.`,
    `- ${summary.tokenPass ? '****' : '!!'} Digit2 path ${summary.tokenPass ? 'restored' : 'did not restore'} token output buffers: \`D001B8=0x${summary.afterDigit2?.diagnostics?.tokenA?.toString(16).padStart(2, '0') ?? '??'} D001D3=0x${summary.afterDigit2?.diagnostics?.tokenB?.toString(16).padStart(2, '0') ?? '??'}\`.`,
    `- ${summary.phase626StillExpected ? '***' : '!!'} Preserve Display stayed active and VRAM remained non-white after both key bursts: EOL=${summary.afterEol?.vramPixels}, Digit2=${summary.afterDigit2?.vramPixels}.`,
    '',
    '## Browser States',
    '',
    '```json',
    JSON.stringify({
      before: summary.before,
      afterEol: summary.afterEol,
      afterDigit2: summary.afterDigit2,
      errors: summary.errors,
    }, null, 2),
    '```',
  ];
  return `${lines.join('\n')}\n`;
}

let ws;
let summary;
try {
  const wsUrl = await waitForDevtools();
  ws = await connect(wsUrl);
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(1000);

  await evalExpr(ws, `(() => {
    window.__phase637Errors = [];
    window.addEventListener('error', (e) => window.__phase637Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__phase637Errors.push(String(e.reason || e)));
    return true;
  })()`);

  const clickResult = await evalExpr(ws, `(() => {
    const boot = document.getElementById('btnBoot');
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    boot.click();
    return { disabled: boot.disabled, status: document.getElementById('status').textContent };
  })()`);
  console.log(JSON.stringify({ phase: 'boot-click', clickResult }));
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 150000);
  await evalExpr(ws, `document.getElementById('btnAutoRun').click(); true;`);
  await waitFor(ws, `document.getElementById('btnAutoRun').textContent === 'AutoRun'`, 'autorun stopped', 10000);

  const before = await readPageState(ws);
  await pressKey(ws, { code: 'Escape', key: 'Escape', vk: 27, text: '' });
  const afterEol = await readPageState(ws);
  await pressKey(ws, { code: 'Digit2', key: '2', vk: 50 });
  const afterDigit2 = await readPageState(ws);
  const errors = await evalExpr(ws, 'window.__phase637Errors');

  const eolTuple = afterEol?.diagnostics?.tuple ?? {};
  const eolTuplePass = (eolTuple.D02A29 ?? 0) !== 0
    && (eolTuple.D0243D ?? 0) !== 0
    && (eolTuple.D02A40 ?? 0) !== 0
    && afterEol.infoLogTail.some((line) => line.includes('EOL tuple restored'));
  const tokenPass = (afterDigit2?.diagnostics?.tokenA ?? 0) !== 0
    && (afterDigit2?.diagnostics?.tokenB ?? 0) !== 0
    && afterDigit2.infoLogTail.some((line) => line.includes('Token buffers restored'));
  const phase626StillExpected = afterEol.preserve === true
    && afterDigit2.preserve === true
    && afterEol.vramPixels > 100
    && afterDigit2.vramPixels > 100;
  const pass = eolTuplePass && tokenPass && phase626StillExpected && errors.length === 0;

  summary = {
    probe: 'phase637-browser-shell-persistence',
    chromePath,
    pageUrl,
    before,
    afterEol,
    afterDigit2,
    errors,
    eolTuplePass,
    tokenPass,
    phase626StillExpected,
    pass,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  if (summary) {
    fs.writeFileSync(path.join(import.meta.dirname, 'phase637-browser-shell-persistence.md'), buildReport(summary));
  }
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(500);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

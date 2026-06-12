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

const port = 9326;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase626-'));
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
  const diagnostics = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    bootDisabled: document.getElementById('btnBoot')?.disabled ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
    errors: window.__phase626Errors || [],
    logTail: Array.from(document.getElementById('log')?.children || []).slice(-8).map((n) => n.textContent),
  }))()`).catch((error) => ({ diagnosticError: error.message }));
  throw new Error(`Timed out waiting for ${label}; lastValue=${JSON.stringify(lastValue)} diagnostics=${JSON.stringify(diagnostics)}`);
}

function keyParams(code, key, windowsVirtualKeyCode) {
  return {
    type: 'keyDown',
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    code,
    key,
    text: key,
    unmodifiedText: key,
  };
}

let ws;
try {
  const wsUrl = await waitForDevtools();
  ws = await connect(wsUrl);
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(1000);

  const consoleErrors = await evalExpr(ws, `(() => {
    window.__phase626Errors = [];
    window.addEventListener('error', (e) => window.__phase626Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__phase626Errors.push(String(e.reason || e)));
    return true;
  })()`);
  if (!consoleErrors) throw new Error('Failed to install page error collector');

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

  const before = await evalExpr(ws, `(() => ({
    status: document.getElementById('status').textContent,
    preserve: document.getElementById('preserveDisplay').checked,
    vramPixels: countVRAMPixels(),
    canvasNonWhite: (() => {
      const c = document.getElementById('lcd');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (!(d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255)) n++;
      return n;
    })()
  }))()`);

  const keys = [
    { code: 'Digit2', key: '2', vk: 50 },
    { code: 'Digit3', key: '3', vk: 51 },
    { code: 'NumpadAdd', key: '+', vk: 107 },
  ];
  const afterKeys = [];
  for (const item of keys) {
    await cdp(ws, 'Input.dispatchKeyEvent', keyParams(item.code, item.key, item.vk));
    await cdp(ws, 'Input.dispatchKeyEvent', { ...keyParams(item.code, item.key, item.vk), type: 'keyUp', text: '', unmodifiedText: '' });
    await waitFor(ws, `document.getElementById('status').textContent.includes('Key:')`, `key ${item.key} status`, 120000);
    afterKeys.push(await evalExpr(ws, `(() => ({
      key: ${JSON.stringify(item.key)},
      status: document.getElementById('status').textContent,
      vramPixels: countVRAMPixels(),
      logTail: Array.from(document.getElementById('log').querySelectorAll('.info')).slice(-5).map((n) => n.textContent),
      canvasNonWhite: (() => {
        const c = document.getElementById('lcd');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (!(d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255)) n++;
        return n;
      })()
    }))()`));
  }

  const errors = await evalExpr(ws, 'window.__phase626Errors');
  const persisted = afterKeys.every((entry) => entry.vramPixels > 100 && entry.status.includes('peak'));
  console.log(JSON.stringify({
    probe: 'phase626-browser-shell-interactive',
    chromePath,
    pageUrl,
    before,
    afterKeys,
    errors,
    persisted,
    conclusion: persisted && errors.length === 0
      ? 'Headless browser coldboot multi-key test passed with Preserve Display checked.'
      : 'Headless browser coldboot multi-key test did not prove persistent display.',
  }, null, 2));
  if (!persisted || errors.length > 0) process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(500);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase890-owner-stop-source-audit.md');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const debugPort = 9890 + Math.floor(Math.random() * 200);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase890-owner-stop-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const EXPECTED = Object.freeze({
  phase6Termination: 'halt',
  phase6LastPc: 0x0019B5,
  phase6Vram: 8482,
  ownerEntry: 0x0454BE,
  ownerTermination: 'stopped_before_target',
  ownerLastPc: 0x09DEE0,
  ownerSteps: 39171,
  ownerBeforeD0301B: 0x000000,
  ownerAfterD0301B: 0x5AA55A,
  oldCapPc: 0x04C8A3,
  oldCapSteps: 60000,
});

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.rom')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function analyzeBrowserSource() {
  const source = fs.readFileSync(BROWSER_SHELL_PATH, 'utf8');
  const sha256 = crypto.createHash('sha256').update(source).digest('hex');
  return {
    file: 'browser-shell.html',
    sha256,
    hasOwnerEntry: /const COLDBOOT_D0301B_OWNER_ENTRY = 0x0454BE;/.test(source),
    hasStopBeforeConstant: /const COLDBOOT_D0301B_OWNER_STOP_BEFORE = 0x09DEE0;/.test(source),
    hasStopSentinel: /const COLDBOOT_D0301B_OWNER_STOP = 'COLDBOOT_D0301B_OWNER_STOP';/.test(source),
    hasStopHook: /\(pc & 0xFFFFFF\) !== COLDBOOT_D0301B_OWNER_STOP_BEFORE/.test(source),
    hasSyntheticStopResult: /termination:\s*'stopped_before_target'/.test(source),
    hasOldCapGuard: /maxSteps:\s*60000/.test(source),
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

function compareNumber(name, actual, expected, width = 6) {
  return {
    name,
    actual,
    expected,
    pass: actual === expected,
    displayActual: hex(actual, width),
    displayExpected: hex(expected, width),
  };
}

function compareValue(name, actual, expected) {
  return { name, actual, expected, pass: actual === expected };
}

function buildChecks(state, sourceEvidence) {
  const p6 = state.phase6 ?? {};
  const owner = state.owner ?? {};
  const checks = [
    compareValue('source has owner entry constant', sourceEvidence.hasOwnerEntry, true),
    compareValue('source has stop-before constant', sourceEvidence.hasStopBeforeConstant, true),
    compareValue('source has stop sentinel', sourceEvidence.hasStopSentinel, true),
    compareValue('source has stop hook', sourceEvidence.hasStopHook, true),
    compareValue('source has synthetic stop result', sourceEvidence.hasSyntheticStopResult, true),
    compareValue('phase6 termination', p6.termination, EXPECTED.phase6Termination),
    compareNumber('phase6 lastPc', p6.lastPc, EXPECTED.phase6LastPc),
    compareNumber('phase6 vram', p6.vram, EXPECTED.phase6Vram, 4),
    compareValue('phase6 vatSnapshotCaptured', p6.vatSnapshotCaptured, true),
    compareNumber('owner entry', owner.entry, EXPECTED.ownerEntry),
    compareValue('owner termination', owner.termination, EXPECTED.ownerTermination),
    compareNumber('owner lastPc', owner.lastPc, EXPECTED.ownerLastPc),
    compareNumber('owner steps', owner.steps, EXPECTED.ownerSteps, 5),
    compareNumber('owner beforeD0301B', owner.beforeD0301B, EXPECTED.ownerBeforeD0301B),
    compareNumber('owner afterD0301B', owner.afterD0301B, EXPECTED.ownerAfterD0301B),
    compareValue('page errors empty', state.errors.length, 0),
    compareValue('old 60K cap not hit', owner.steps < EXPECTED.oldCapSteps, true),
    compareValue('old cap termination not hit', owner.termination !== 'max_steps', true),
    compareValue('old cap PC not hit', owner.lastPc !== EXPECTED.oldCapPc, true),
  ];
  return checks;
}

function formatCheck(check) {
  if ('displayActual' in check) {
    return {
      name: check.name,
      actual: check.displayActual,
      expected: check.displayExpected,
      pass: check.pass,
    };
  }
  return check;
}

function table(rows, columns) {
  if (!rows.length) return 'No rows.';
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 890: Browser Owner-Stop Source Audit',
      '',
      'Probe failed before producing a complete audit.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const owner = data.state.owner ?? {};
  const p6 = data.state.phase6 ?? {};
  const rows = data.checks.map(formatCheck);
  return [
    '# Phase 890: Browser Owner-Stop Source Audit',
    '',
    'Probe: `probe-phase890-owner-stop-source-audit.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase890-owner-stop-source-audit.mjs`',
    '',
    'Serves the real, unmodified `browser-shell.html`, runs the coldboot browser path in headless Chrome, and audits the exposed `window.__coldbootPhase6.naturalD0301BOwner` result.',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}.`,
    `- Phase 6: ${p6.termination ?? '-'} after ${p6.steps ?? '-'} steps at ${p6.lastPc == null ? '-' : hex(p6.lastPc)}; VRAM=${p6.vram ?? '-'}; snapshot captured=${p6.vatSnapshotCaptured === true}.`,
    `- Natural D0301B owner: ${owner.termination ?? '-'} after ${owner.steps ?? '-'} steps at ${owner.lastPc == null ? '-' : hex(owner.lastPc)}; D0301B ${owner.beforeD0301B == null ? '-' : hex(owner.beforeD0301B)} -> ${owner.afterD0301B == null ? '-' : hex(owner.afterD0301B)}.`,
    `- Old cap avoided: ${data.oldCapAvoided ? 'yes' : 'NO'} (not max_steps, not 60000 steps, not 0x04C8A3).`,
    `- Page errors: ${JSON.stringify(data.state.errors ?? [])}.`,
    '',
    '## Source Evidence',
    '',
    `- Source file SHA-256: \`${data.sourceEvidence.sha256}\``,
    `- Stop-before marker present: ${data.sourceEvidence.hasStopBeforeConstant ? 'yes' : 'NO'}.`,
    `- Stop hook present: ${data.sourceEvidence.hasStopHook ? 'yes' : 'NO'}.`,
    `- 60K max-step guard still present as a guardrail: ${data.sourceEvidence.hasOldCapGuard ? 'yes' : 'no'}.`,
    '',
    '## Checks',
    '',
    table(rows, [
      { label: 'Check', value: (row) => row.name },
      { label: 'Actual', value: (row) => String(row.actual) },
      { label: 'Expected', value: (row) => String(row.expected) },
      { label: 'Pass', value: (row) => (row.pass ? 'yes' : 'NO') },
    ]),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

  const sourceEvidence = analyzeBrowserSource();
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
  await sleep(500);

  await evalExpr(ws, `(() => {
    window.__phase890Errors = [];
    window.addEventListener('error', (event) => window.__phase890Errors.push(String(event.message || event.error || event)));
    window.addEventListener('unhandledrejection', (event) => window.__phase890Errors.push(String(event.reason || event)));
    return true;
  })()`, 30000);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`, 30000);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(150);

  const state = await evalExpr(ws, `(() => {
    const phase6 = window.__coldbootPhase6 ?? null;
    const owner = phase6?.naturalD0301BOwner ?? window.__coldbootNaturalD0301BOwner ?? null;
    return {
      phase6,
      owner,
      vram: window.countVRAMPixels?.() ?? null,
      errors: window.__phase890Errors ?? [],
      status: document.getElementById('status')?.textContent ?? null,
    };
  })()`, 30000);

  const checks = buildChecks(state, sourceEvidence);
  const oldCapAvoided = Boolean(
    state.owner
      && state.owner.steps < EXPECTED.oldCapSteps
      && state.owner.termination !== 'max_steps'
      && state.owner.lastPc !== EXPECTED.oldCapPc,
  );
  const pass = checks.every((check) => check.pass);

  return {
    probe: 'phase890-owner-stop-source-audit',
    chromePath,
    pageUrl,
    pass,
    oldCapAvoided,
    sourceEvidence,
    checks: checks.map(formatCheck),
    state,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    oldCapAvoided: summary.oldCapAvoided,
    phase6: summary.state.phase6,
    owner: summary.state.owner,
    errors: summary.state.errors,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase890-owner-stop-source-audit', pass: false, error: String(error?.stack || error) };
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

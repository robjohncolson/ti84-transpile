import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase655-browser-vat-replay.md');
const debugPort = 9655;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase655-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) {
  throw new Error('No Chrome/Edge executable found for headless browser test');
}

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
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

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.rom')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function instrumentBrowserShell(html) {
  const injection = String.raw`
const PHASE655_TARGETS = Object.freeze({
  launch09dd62: 0x09DD62,
  memInit09dee0: 0x09DEE0,
  clear001879: 0x001879,
  cleanup0018f8: 0x0018F8,
  repaint058241: 0x058241,
  vatLoop084711: 0x084711,
  vatRewind082be2: 0x082BE2,
  halt0019b5: 0x0019B5,
});

const PHASE655_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02587', 0xD02587, 3],
  ['D0258A', 0xD0258A, 3],
  ['D0258D', 0xD0258D, 3],
  ['D02590', 0xD02590, 3],
  ['D02593', 0xD02593, 3],
  ['D0259A', 0xD0259A, 3],
  ['D0259D', 0xD0259D, 3],
  ['D025A0', 0xD025A0, 3],
  ['D025C5', 0xD025C5, 3],
]);

function phase655Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase655ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[addr + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase655CaptureFields() {
  const mem = cpu?.memory;
  if (!mem) return [];
  return PHASE655_FIELDS.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: phase655ReadValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function phase655FieldsObject(fields = phase655CaptureFields()) {
  return Object.fromEntries(fields.map((field) => [field.name, phase655Hex(field.value, field.len * 2)]));
}

function phase655RestoreFields(fields) {
  const mem = cpu?.memory;
  if (!mem || !fields?.length) return false;
  for (const field of fields) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
  return true;
}

function phase655Result(result) {
  return result ? {
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
  } : null;
}

function phase655ReadState(label, result = null) {
  return {
    label,
    result: phase655Result(result),
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: cpu ? {
      pc: cpu.pc,
      sp: cpu.sp,
      iy: cpu.iy ?? cpu._iy,
      ix: cpu.ix ?? cpu._ix,
      halted: cpu.halted,
      iff1: cpu.iff1,
      iff2: cpu.iff2,
      mbase: cpu.mbase,
      madl: cpu.madl,
    } : null,
    fields: phase655FieldsObject(),
    vramPixels: countVRAMPixels(),
    status: document.getElementById('status')?.textContent ?? null,
  };
}

function phase655CreateStats(label) {
  return {
    label,
    totalBlocks: 0,
    targetCounts: Object.fromEntries(Object.keys(PHASE655_TARGETS).map((name) => [name, 0])),
    firstBlocks: [],
    lastBlocks: [],
    hotBlocks: {},
  };
}

function phase655Observe(stats, pc) {
  const addr = pc & 0xFFFFFF;
  stats.totalBlocks += 1;
  const pcHex = phase655Hex(addr);
  stats.hotBlocks[pcHex] = (stats.hotBlocks[pcHex] || 0) + 1;
  if (stats.firstBlocks.length < 24) stats.firstBlocks.push(pcHex);
  stats.lastBlocks.push(pcHex);
  if (stats.lastBlocks.length > 32) stats.lastBlocks.shift();
  for (const [name, target] of Object.entries(PHASE655_TARGETS)) {
    if (addr === target) stats.targetCounts[name] += 1;
  }
  if (stats.label === 'browser-p5-launch-home'
    && addr === 0x001879
    && !window.__phase655.snapshot
    && phase655ReadValue(cpu.memory, 0xD02590, 3) !== 0) {
    const fields = phase655CaptureFields();
    window.__phase655.snapshot = {
      block: stats.totalBlocks,
      pc: pcHex,
      fields,
      fieldsObject: phase655FieldsObject(fields),
      vramPixels: countVRAMPixels(),
    };
  }
}

function phase655FinalizeStats(stats) {
  stats.hotBlocks = Object.entries(stats.hotBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([pc, count]) => ({ pc, count }));
  return stats;
}

function phase655RunOptions(label, opts) {
  const stats = phase655CreateStats(label);
  window.__phase655.phaseStats[label] = stats;
  return {
    ...opts,
    onBlock(pc, mode, meta, step) {
      phase655Observe(stats, pc);
      opts.onBlock?.(pc, mode, meta, step);
    },
  };
}

function phase655Finish(label) {
  const stats = window.__phase655.phaseStats[label];
  if (stats) window.__phase655.phaseStats[label] = phase655FinalizeStats(stats);
}

function phase655Record(label, result = null) {
  const record = phase655ReadState(label, result);
  window.__phase655.records.push(record);
  return record;
}

function phase655ReplaySnapshot(label) {
  const before = phase655ReadState(label + '-before');
  const ok = phase655RestoreFields(window.__phase655.snapshot?.fields);
  const after = phase655ReadState(label + '-after');
  window.__phase655.restore = { label, ok, before, after };
  return ok;
}

window.__phase655 = {
  records: [],
  phaseStats: {},
  snapshot: null,
  restore: null,
  readState: phase655ReadState,
};
`;

  if (!html.includes('function initializeColdbootRuntime() {')) {
    throw new Error('initializeColdbootRuntime marker not found');
  }
  let out = html.replace('function initializeColdbootRuntime() {', `${injection}\n\nfunction initializeColdbootRuntime() {`);

  out = out.replace(
    /  const p5 = executor\.runFrom\(COLDBOOT_LAUNCH_HOME_INIT, 'adl', \{ maxSteps: 300000, maxLoopIterations: 30000 \}\);/,
    `  phase655Record('browser-before-p5-launch-home');
  const p5 = executor.runFrom(COLDBOOT_LAUNCH_HOME_INIT, 'adl', phase655RunOptions('browser-p5-launch-home', { maxSteps: 300000, maxLoopIterations: 30000 }));
  phase655Finish('browser-p5-launch-home');
  phase655Record('browser-after-p5-launch-home', p5);`,
  );

  out = out.replace(
    /  peripherals\?\.setTimerEnabled\?\.\(true\);\r?\n  prepareColdbootEventFrame\(\);/,
    `  peripherals?.setTimerEnabled?.(true);
  phase655ReplaySnapshot('browser-before-p6-replay');
  phase655Record('browser-after-p5-snapshot-replay');
  prepareColdbootEventFrame();
  phase655Record('browser-after-p6-event-frame');`,
  );

  out = out.replace(
    /  const p6 = executor\.runFrom\(COLDBOOT_HOME_REPAINT, 'adl', \{ maxSteps: 300000, maxLoopIterations: 30000 \}\);/,
    `  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', phase655RunOptions('browser-p6-home-repaint', { maxSteps: 300000, maxLoopIterations: 30000 }));
  phase655Finish('browser-p6-home-repaint');
  phase655Record('browser-after-p6-home-repaint', p6);`,
  );

  if (!out.includes("phase655Record('browser-after-p5-launch-home'")) {
    throw new Error('Phase 5 instrumentation replacement failed');
  }
  if (!out.includes("phase655ReplaySnapshot('browser-before-p6-replay')")) {
    throw new Error('Phase 5 snapshot replay replacement failed');
  }
  if (!out.includes("phase655Record('browser-after-p6-home-repaint'")) {
    throw new Error('Phase 6 instrumentation replacement failed');
  }
  return out;
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
      if (rel === 'browser-shell.html') {
        const body = instrumentBrowserShell(fs.readFileSync(fullPath, 'utf8'));
        res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
        res.end(body);
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
      // Chrome may still be starting.
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
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function cdp(socket, method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 120000);
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
    const details = result.exceptionDetails;
    const message = details.exception?.description
      || details.exception?.value
      || details.text
      || 'Runtime.evaluate exception';
    throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
  }
  return result.result.value;
}

async function waitFor(socket, expression, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    const value = await evalExpr(socket, expression, 10000);
    lastValue = value;
    if (value) return value;
    await sleep(250);
  }
  const diagnostics = await readPageState(socket).catch((error) => ({ diagnosticError: error.message }));
  throw new Error(`Timed out waiting for ${label}; lastValue=${JSON.stringify(lastValue)} diagnostics=${JSON.stringify(diagnostics)}`);
}

async function readPageState(socket) {
  return await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    bootDisabled: document.getElementById('btnBoot')?.disabled ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
    vramPixels: window.countVRAMPixels?.() ?? null,
    errors: window.__phase655Errors || [],
    phase655: window.__phase655 || null,
    logTail: Array.from(document.getElementById('log')?.querySelectorAll('.info') || []).slice(-12).map((n) => n.textContent),
  }))()`);
}

function buildReport(data) {
  const p6 = data?.phase655?.records?.find((record) => record.label === 'browser-after-p6-home-repaint');
  const p6Stats = data?.phase655?.phaseStats?.['browser-p6-home-repaint'];
  const snapshot = data?.phase655?.snapshot;
  const restore = data?.phase655?.restore;
  const pass = data?.pass === true;
  const lines = [
    '# Phase 655: Browser VAT Replay Before Repaint',
    '',
    'Probe: `probe-phase655-browser-vat-replay.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase655-browser-vat-replay.mjs`',
    '',
    '## Summary',
    '',
    snapshot
      ? `- ${pass ? '****' : '!!'} Captured Phase 5 snapshot at block ${snapshot.block} / ${snapshot.pc}: D02590=${snapshot.fieldsObject?.D02590}, D0259D=${snapshot.fieldsObject?.D0259D}, D007CA=${snapshot.fieldsObject?.D007CA}.`
      : '- !! No Phase 5 snapshot was captured before the `0x001879` clear.',
    restore?.ok
      ? `- ${pass ? '****' : '!!'} Replayed the snapshot inside the browser coldboot path before Phase 6 event-frame setup; after replay D02590=${restore.after?.fields?.D02590}, D007CA=${restore.after?.fields?.D007CA}.`
      : '- !! Snapshot replay did not run successfully.',
    p6?.result
      ? `- ${p6.result.termination === 'halt' ? '****' : '!!'} Browser Phase 6 repaint ended ${p6.result.termination} after ${p6.result.steps} steps at ${hex(p6.result.lastPc)}; \`0x084711\` hits=${p6Stats?.targetCounts?.vatLoop084711 ?? 'n/a'}, VRAM=${p6.vramPixels}px.`
      : '- !! Browser Phase 6 repaint result was not recorded.',
    data?.errors?.length === 0
      ? '- *** Page error collector saw no browser exceptions.'
      : `- !! Page errors: ${JSON.stringify(data?.errors ?? [])}`,
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'No source files from the browser shell, runtime, transpiler, or scheduler were modified; this probe serves an instrumented HTML copy from memory.',
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

  const wsUrl = await waitForDevtools();
  ws = await connect(wsUrl);
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(1000);

  await evalExpr(ws, `(() => {
    window.__phase655Errors = [];
    window.addEventListener('error', (e) => window.__phase655Errors.push(String(e.message || e.error || e)));
    window.addEventListener('unhandledrejection', (e) => window.__phase655Errors.push(String(e.reason || e)));
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
  const pageState = await readPageState(ws);
  const p6 = pageState.phase655?.records?.find((record) => record.label === 'browser-after-p6-home-repaint');
  const p6Stats = pageState.phase655?.phaseStats?.['browser-p6-home-repaint'];
  const pass = Boolean(
    pageState.phase655?.snapshot
      && pageState.phase655?.restore?.ok
      && p6?.result?.termination === 'halt'
      && p6?.result?.lastPc === 0x0019B5
      && (p6Stats?.targetCounts?.vatLoop084711 ?? 9999) < 100
      && pageState.vramPixels > 100
      && pageState.errors.length === 0,
  );

  summary = {
    probe: 'phase655-browser-vat-replay',
    chromePath,
    pageUrl,
    pass,
    ...pageState,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass,
    phase6: p6?.result,
    phase6VatLoopHits: p6Stats?.targetCounts?.vatLoop084711,
    snapshot: pageState.phase655?.snapshot?.fieldsObject,
    finalVramPixels: pageState.vramPixels,
    errors: pageState.errors,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} catch (error) {
  summary = {
    probe: 'phase655-browser-vat-replay',
    pass: false,
    error: String(error?.stack || error),
  };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, buildReport(summary));
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  await sleep(500);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase836-browser-eol-field-injection.md');
const debugPort = 9798;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase836-eol-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const EXPECTED = Object.freeze({
  code: 'Escape',
  key: 'Escape',
  label: 'CLEAR',
  vk: 27,
  controlStopPc: 0x0A229D,
  controlStopLabel: 'clear-eol-bc-zero-owner',
  engineEntry: 0x08F54B,
  D007CA: 0x0585E9,
  D02590: 0xD3FE81,
});

const FIELD_DEFS = Object.freeze({
  D007CA: { addr: 0xD007CA, len: 3 },
  D008E0: { addr: 0xD008E0, len: 3 },
  D0243A: { addr: 0xD0243A, len: 3 },
  D0243D: { addr: 0xD0243D, len: 3 },
  D02590: { addr: 0xD02590, len: 3 },
  D02A40: { addr: 0xD02A40, len: 3 },
  D00595: { addr: 0xD00595, len: 1 },
  D00596: { addr: 0xD00596, len: 1 },
  D02A29: { addr: 0xD02A29, len: 2 },
  D02A2B: { addr: 0xD02A2B, len: 2 },
  D02A1B: { addr: 0xD02A1B, len: 2 },
  D01150: { addr: 0xD01150, len: 2 },
  D0059A: { addr: 0xD0059A, len: 1 },
  D02A28: { addr: 0xD02A28, len: 1 },
});

const CASES = Object.freeze([
  {
    name: 'baseline_browser_no_injection',
    label: 'Baseline browser state',
    writes: [],
  },
  {
    name: 'D0243A_engine_cursor_only',
    label: 'D0243A engine cursor only',
    writes: [
      { field: 'D0243A', value: 0xD1A8F8 },
    ],
  },
  {
    name: 'D0243D_D02A40_engine_descriptor',
    label: 'D0243D + D02A40 engine descriptor',
    writes: [
      { field: 'D0243D', value: 0xD2A7E1 },
      { field: 'D02A40', value: 0xD2A7F7 },
    ],
  },
  {
    name: 'full_engine_edit_set',
    label: 'Full engine edit set',
    writes: [
      { field: 'D0243A', value: 0xD1A8F8 },
      { field: 'D0243D', value: 0xD2A7E1 },
      { field: 'D02A40', value: 0xD2A7F7 },
      { field: 'D00595', value: 0x06 },
    ],
  },
]);

let nextId = 1;
const pending = new Map();
const eventWaiters = new Map();
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

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
    } else if (msg.method) {
      const waiters = eventWaiters.get(msg.method);
      const waiter = waiters?.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      }
      if (waiters?.length === 0) eventWaiters.delete(msg.method);
    }
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function waitForCdpEvent(method, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const waiters = eventWaiters.get(method);
      if (waiters) {
        const idx = waiters.findIndex((entry) => entry.resolve === resolve);
        if (idx >= 0) waiters.splice(idx, 1);
        if (waiters.length === 0) eventWaiters.delete(method);
      }
      reject(new Error(`CDP event timeout: ${method}`));
    }, timeout);
    timer.unref?.();
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push({ resolve, reject, timer });
    eventWaiters.set(method, waiters);
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

function keyParams(type) {
  return {
    type,
    windowsVirtualKeyCode: EXPECTED.vk,
    nativeVirtualKeyCode: EXPECTED.vk,
    code: EXPECTED.code,
    key: EXPECTED.key,
  };
}

function classify(state) {
  const key = state?.lastKey ?? {};
  const diag = state?.diagnostics ?? {};
  const persistence = state?.persistence ?? {};
  const tuple = persistence?.tuple ?? {};
  const preTuple = state?.preKey?.persistence?.tuple ?? {};
  const pageErrors = state?.pageErrors ?? [];
  const tupleDiffs = {};
  for (const [name, value] of Object.entries(tuple)) {
    if (preTuple[name] !== value) tupleDiffs[name] = { before: preTuple[name] ?? null, after: value };
  }
  const tupleCoreFields = ['D02A29', 'D02A2B', 'D02A1B', 'D01150', 'D02A28'];
  const tupleCoreSignal = tupleCoreFields.some((name) => preTuple[name] !== tuple[name] && tuple[name] !== 0);
  const logText = state?.logText ?? '';
  const status = state?.status ?? '';
  const hasTupleRestoreLog = logText.includes('EOL tuple restored') || status.includes('EOL tuple restored');
  const checks = {
    code: key.code === EXPECTED.code,
    label: key.label === EXPECTED.label,
    controlPreStopPc: key.controlPreStopPc === EXPECTED.controlStopPc,
    controlPreStopLabel: key.controlPreStopLabel === EXPECTED.controlStopLabel,
    termination: key.termination === 'control_pre_stop',
    controlStopPc: key.controlStopPc === EXPECTED.controlStopPc,
    stoppedBeforeControlClear: key.stoppedBeforeControlClear === true,
    uiClearApplied: key.uiClearApplied === true,
    noWipes: key.wipes === 0,
    D007CA: key.D007CA === EXPECTED.D007CA && diag.D007CA === EXPECTED.D007CA,
    D02590: key.D02590 === EXPECTED.D02590 && diag.D02590 === EXPECTED.D02590,
    vramPreserved: (key.vramCurrent ?? 0) > 1000 && (diag.vramCurrent ?? 0) > 1000,
    noPageErrors: pageErrors.length === 0,
  };
  const preStop0A229D = Object.values(checks).every(Boolean);
  const engine08F54B = !preStop0A229D && (hasTupleRestoreLog || tupleCoreSignal);
  const low006D = !preStop0A229D
    && !engine08F54B
    && (key.controlStopPc != null && key.controlStopPc >= 0x006D00 && key.controlStopPc <= 0x006DFF);
  const missing202020 = !preStop0A229D
    && !engine08F54B
    && (key.controlStopPc === 0x202020 || status.includes('0x202020') || logText.includes('0x202020'));
  let route = 'OTHER';
  if (preStop0A229D) route = 'PRE_STOP_0A229D';
  else if (engine08F54B) route = 'ENGINE_08F54B';
  else if (low006D) route = 'LOW_006D';
  else if (missing202020) route = 'MISSING_202020';
  return {
    classification: route,
    checks,
    preStop0A229D,
    engine08F54B,
    tupleCoreSignal,
    tupleDiffs,
    hasTupleRestoreLog,
    low006D,
    missing202020,
  };
}

function writeListLabel(writes) {
  if (!writes.length) return '-';
  return writes.map((w) => {
    const def = FIELD_DEFS[w.field];
    return `${w.field}=${hex(w.value, def.len * 2)}`;
  }).join(', ');
}

function buildReport(data) {
  const resultRows = (data.results ?? []).map((result) => {
    const key = result.state?.lastKey ?? {};
    const diag = result.state?.diagnostics ?? {};
    return `| ${result.name} | ${result.classification.classification} | ${key.termination ?? '-'} | ${hex(key.controlStopPc)} | ${key.steps ?? '-'} | ${key.wipes ?? '-'} | ${hex(diag.D0243A)} | ${hex(diag.D0243D)} | ${hex(result.preKey?.persistence?.tuple?.D02A40)} | ${writeListLabel(result.writes)} |`;
  });
  const interpretation = data.allPreStop
    ? [
        '- All four real-browser cases stopped at the existing `0x0A229D` control pre-stop.',
        '- Engine-side cursor/descriptor writes did not route browser Escape into `0x08F54B`; the direct-Escape/control-prestop layer dominates this harness path.',
      ]
    : data.engineCases?.length === 0 && data.preStopCases?.length === 1 && data.otherCases?.length === 3
      ? [
          '- Baseline browser Escape still stops at the existing `0x0A229D` control pre-stop.',
          '- Each engine-side edit-field injection changed the route away from that pre-stop, but none reached `0x08F54B`; all injected cases ran to `max_steps` with `wipes=3` and zeroed post-key pointers.',
          '- The browser-side blocker is therefore not solved by directly copying the phase833 cursor/descriptor fields into the current shell state. The injection destabilizes the current direct-Escape path instead of recovering the tuple-save engine route.',
        ]
    : [
        '- At least one injected case changed the route away from the baseline browser pre-stop; inspect the per-case JSON for the exact field set.',
      ];

  return [
    '# Phase 836 Browser EOL Field Injection',
    '',
    'Probe: `probe-phase836-browser-eol-field-injection.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase836-browser-eol-field-injection.mjs`',
    '',
    'Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, injects candidate engine-side edit fields before dispatching browser EOL (`Escape`), and classifies the observed route without editing the shell.',
    '',
    '## Result',
    '',
    `- Completed cases: ${data.results?.length ?? 0}/${CASES.length}.`,
    `- Classifications: ${(data.results ?? []).map((r) => `${r.name}=${r.classification.classification}`).join(', ')}`,
    `- Engine cases: ${(data.engineCases ?? []).map((r) => r.name).join(', ') || 'none'}.`,
    `- Pre-stop cases: ${(data.preStopCases ?? []).map((r) => r.name).join(', ') || 'none'}.`,
    `- OTHER cases: ${(data.otherCases ?? []).map((r) => r.name).join(', ') || 'none'}.`,
    '',
    '## Interpretation',
    '',
    ...interpretation,
    '',
    '## Cases',
    '',
    '| Case | Classification | Termination | Control PC | Steps | Wipes | Post D0243A | Post D0243D | Pre D02A40 | Writes |',
    '| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |',
    ...resultRows,
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, or ROM artifact files were changed.',
    '',
  ].join('\n');
}

async function installPageErrorCapture(socket, caseName) {
  await evalExpr(socket, `(() => {
    window.__phase836PageErrors = [];
    window.__phase836CaseName = ${JSON.stringify(caseName)};
    window.addEventListener('error', (event) => {
      window.__phase836PageErrors.push(String(event.message || event.error || event));
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__phase836PageErrors.push(String(event.reason || event));
    });
    return true;
  })()`);
}

async function bootColdboot(socket) {
  await evalExpr(socket, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(socket, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);
}

async function readBrowserState(socket, extra = {}) {
  return await evalExpr(socket, `(() => ({
    editLine: window.__coldbootReadEditLineState?.() ?? null,
    persistence: window.__coldbootPersistenceDiagnostics?.() ?? window.getColdbootPersistenceDiagnostics?.() ?? null,
    status: document.getElementById('status')?.textContent ?? null,
    pageErrors: window.__phase836PageErrors ?? [],
    extra: ${JSON.stringify(extra)},
  }))()`, 30000);
}

async function injectWrites(socket, writes) {
  await cdp(socket, 'Debugger.enable', {}, 30000);
  const functionHandle = await cdp(socket, 'Runtime.evaluate', {
    expression: 'window.__coldbootReadEditLineState',
    objectGroup: 'phase836-inject',
    returnByValue: false,
  }, 30000);
  const objectId = functionHandle?.result?.objectId;
  if (!objectId) throw new Error('Unable to acquire __coldbootReadEditLineState function object');

  let breakpointId = null;
  let paused = false;
  let callPromise = null;
  try {
    console.log(`  installing injection breakpoint (${writes.length} writes)`);
    const breakpoint = await cdp(socket, 'Debugger.setBreakpointOnFunctionCall', { objectId }, 30000);
    breakpointId = breakpoint.breakpointId;
    const pausedPromise = waitForCdpEvent('Debugger.paused', 60000);
    callPromise = cdp(socket, 'Runtime.evaluate', {
      expression: 'window.__coldbootReadEditLineState()',
      awaitPromise: true,
      returnByValue: true,
      timeout: 120000,
    }, 125000);
    const pauseEvent = await pausedPromise;
    paused = true;
    console.log('  paused inside coldboot diagnostic closure');
    const callFrameId = pauseEvent.params?.callFrames?.[0]?.callFrameId;
    if (!callFrameId) throw new Error('Debugger paused without a call frame for injection');
    const result = await cdp(socket, 'Debugger.evaluateOnCallFrame', {
      callFrameId,
      returnByValue: true,
      expression: `(() => {
    const writes = ${JSON.stringify(writes)};
    const fields = ${JSON.stringify(FIELD_DEFS)};
    if (!cpu?.memory) return { ok: false, error: 'cpu.memory not available in diagnostic closure', writes };
    const mem = cpu.memory;
    function readValue(addr, len) {
      let value = 0;
      for (let i = 0; i < len; i++) value |= mem[addr + i] << (8 * i);
      return value >>> 0;
    }
    function writeValue(addr, len, value) {
      for (let i = 0; i < len; i++) mem[addr + i] = (value >>> (8 * i)) & 0xFF;
    }
    function snapshot() {
      const out = {};
      for (const [name, def] of Object.entries(fields)) out[name] = readValue(def.addr, def.len);
      out.buffer = Array.from(mem.slice(0xD1A8CC, 0xD1A8CC + 8));
      return out;
    }
    const before = snapshot();
    for (const write of writes) {
      const def = fields[write.field];
      if (!def) throw new Error('unknown field ' + write.field);
      writeValue(def.addr, def.len, write.value);
    }
    const after = snapshot();
    return { ok: true, before, after, writes };
  })()`,
    }, 30000);
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      throw new Error(`${d.exception?.description || d.exception?.value || d.text || 'call-frame injection exception'}`);
    }
    console.log('  injected fields via call frame');
    await cdp(socket, 'Debugger.resume', {}, 30000);
    paused = false;
    console.log('  resumed page execution');
    await callPromise;
    return result.result.value;
  } finally {
    if (paused) {
      try { await cdp(socket, 'Debugger.resume', {}, 30000); } catch {}
    }
    if (callPromise) {
      try { await callPromise; } catch {}
    }
    if (breakpointId) {
      try { await cdp(socket, 'Debugger.removeBreakpoint', { breakpointId }, 30000); } catch {}
    }
    try { await cdp(socket, 'Runtime.releaseObjectGroup', { objectGroup: 'phase836-inject' }, 30000); } catch {}
    try { await cdp(socket, 'Debugger.disable', {}, 30000); } catch {}
  }
}

async function runCase(socket, pageUrl, testCase) {
  await cdp(socket, 'Page.navigate', {
    url: `${pageUrl}?case=${encodeURIComponent(testCase.name)}&t=${Date.now()}`,
  }, 30000);
  await waitFor(socket, 'document.readyState === "complete"', 'page load', 30000);
  await sleep(500);
  await installPageErrorCapture(socket, testCase.name);
  await bootColdboot(socket);

  const beforeInjection = await readBrowserState(socket, { stage: 'beforeInjection' });
  const injection = await injectWrites(socket, testCase.writes);
  if (!injection.ok) throw new Error(`Injection failed for ${testCase.name}: ${injection.error}`);
  const preKey = await readBrowserState(socket, { stage: 'afterInjection', injection });

  await cdp(socket, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(socket, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(socket, `window.__coldbootLastKey?.code === '${EXPECTED.code}'`, `Escape completion for ${testCase.name}`, 60000);
  await sleep(150);

  const state = await evalExpr(socket, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    scanText: document.getElementById('scanCode')?.textContent ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    persistence: window.__coldbootPersistenceDiagnostics?.() ?? window.getColdbootPersistenceDiagnostics?.() ?? null,
    logText: (document.getElementById('log')?.textContent ?? '').slice(-4000),
    pageErrors: window.__phase836PageErrors ?? [],
    preKey: ${JSON.stringify({
      editLine: preKey.editLine,
      persistence: preKey.persistence,
      status: preKey.status,
      injection,
    })},
  }))()`, 30000);
  const classification = classify(state);
  return {
    name: testCase.name,
    label: testCase.label,
    writes: testCase.writes,
    beforeInjection,
    injection,
    preKey,
    classification,
    state,
  };
}

async function run() {
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

  const results = [];
  for (const testCase of CASES) {
    console.log(`phase836: running ${testCase.name}`);
    const result = await runCase(ws, pageUrl, testCase);
    results.push(result);
    const key = result.state?.lastKey ?? {};
    console.log(`  ${result.classification.classification} termination=${key.termination ?? '-'} pc=${hex(key.controlStopPc)} steps=${key.steps ?? '-'}`);
  }

  const engineCases = results.filter((r) => r.classification.classification === 'ENGINE_08F54B');
  const preStopCases = results.filter((r) => r.classification.classification === 'PRE_STOP_0A229D');
  const otherCases = results.filter((r) => r.classification.classification === 'OTHER');
  return {
    probe: 'phase836-browser-eol-field-injection',
    chromePath,
    pageUrl,
    pass: results.length === CASES.length,
    allPreStop: preStopCases.length === results.length,
    engineCases,
    preStopCases,
    otherCases,
    results,
  };
}

try {
  summary = await run();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    classifications: summary.results.map((r) => ({
      name: r.name,
      classification: r.classification.classification,
      termination: r.state?.lastKey?.termination ?? null,
      controlStopPc: r.state?.lastKey?.controlStopPc ?? null,
      steps: r.state?.lastKey?.steps ?? null,
      writes: r.writes,
    })),
  }, null, 2));
} catch (error) {
  summary = { probe: 'phase836-browser-eol-field-injection', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

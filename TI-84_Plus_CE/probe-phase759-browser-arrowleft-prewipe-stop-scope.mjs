import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase759-browser-arrowleft-prewipe-stop-scope.md');
const debugPort = 9759;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase759-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const STRATEGIES = Object.freeze([
  { name: 'baseline', restoreArrowLeft: false, preStopArrowLeft: false, stepCap: 70000 },
  { name: 'restoreNoStop', restoreArrowLeft: true, preStopArrowLeft: false, stepCap: 130000 },
  { name: 'restorePreStop001879', restoreArrowLeft: true, preStopArrowLeft: true, stepCap: 90000 },
]);

let nextId = 1;
const pending = new Map();
const cdpErrors = [];
let chrome;
let server;
let ws;
let summary;

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

function instrumentBrowserShell(html) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) throw new Error('Instrumentation marker not found in browser-shell.html');

  const burstRegex = /function getColdbootKeyBurstStepsForCode\(code\) \{\s+return code === EOL_PC_CODE\s+\? Math\.max\(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS\)\s+: COLDBOOT_KEY_BURST_STEPS;\s+\}/;
  let patched = html.replace(burstRegex, `function getColdbootKeyBurstStepsForCode(code) {
  if (code === 'ArrowLeft' && window.__phase758Config?.stepCap) return window.__phase758Config.stepCap;
  return code === EOL_PC_CODE
    ? Math.max(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS)
    : COLDBOOT_KEY_BURST_STEPS;
}`);
  if (patched === html) throw new Error('ArrowLeft burst cap patch point not found');

  const preStopNeedle = `function getColdbootControlPreStop(code) {
  return COLDBOOT_CONTROL_PRE_STOP_BY_PC_CODE[code] ?? null;
}`;
  patched = patched.replace(preStopNeedle, `function getColdbootControlPreStop(code) {
  if (code === 'ArrowLeft' && window.__phase758Config?.preStopArrowLeft === true) {
    return { pc: 0x001879, label: 'arrow-left-prewipe-vector-restore-stop' };
  }
  return COLDBOOT_CONTROL_PRE_STOP_BY_PC_CODE[code] ?? null;
}`);
  if (!patched.includes('arrow-left-prewipe-vector-restore-stop')) {
    throw new Error('ArrowLeft pre-stop patch point not found');
  }

  const restoreNeedle = "const shouldRestoreContextVector = e.code === 'ArrowDown';";
  patched = patched.replace(
    restoreNeedle,
    "const shouldRestoreContextVector = e.code === 'ArrowDown' || (e.code === 'ArrowLeft' && window.__phase758Config?.restoreArrowLeft === true);",
  );
  if (!patched.includes('window.__phase758Config?.restoreArrowLeft')) {
    throw new Error('Context-vector restore patch point not found');
  }

  const injection = String.raw`
window.__phase758Config = { restoreArrowLeft: false, preStopArrowLeft: false, stepCap: 70000 };

const PHASE758_TARGETS = Object.freeze({
  rst000038: 0x000038,
  coldIdle0019b5: 0x0019B5,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  sentinel001c33: 0x001C33,
  sentinel0158bc: 0x0158BC,
  vectorOwner08c782: 0x08C782,
  vectorRestore06c764: 0x06C764,
  alternateCxMain06c92c: 0x06C92C,
  cxDispatchWrapper08c72f: 0x08C72F,
  cxJpTrampoline08c745: 0x08C745,
  display09efde: 0x09EFDE,
  display09efcb: 0x09EFCB,
  display09efe8: 0x09EFE8,
  low000b7c: 0x000B7C,
  eolOwner0a229d: 0x0A229D,
  eolTail0a22a4: 0x0A22A4,
});

const PHASE758_FIELD_SPECS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02590', 0xD02590, 3],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
  ['D000C2', 0xD000C2, 1],
  ['D02A28', 0xD02A28, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A40', 0xD02A40, 3],
]);

const PHASE758_CRITICAL_FIELDS = Object.freeze(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590']);

function phase758Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase758ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase758ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE758_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase758ReadValue(mem, addr, len),
  ]));
}

function phase758ReadStack0() {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return null;
  return phase758ReadValue(mem, sp & 0xFFFFFF, 3);
}

function phase758CpuRaw() {
  return cpu ? {
    pc: cpu.pc ?? 0,
    sp: cpu.sp ?? 0,
    af: cpu.af ?? 0,
    bc: cpu.bc ?? 0,
    de: cpu.de ?? 0,
    hl: cpu.hl ?? 0,
    ix: cpu._ix ?? cpu.ix ?? 0,
    iy: cpu._iy ?? cpu.iy ?? 0,
    f: cpu.f ?? 0,
    halted: Boolean(cpu.halted),
    stepCount: cpu.stepCount ?? 0,
  } : null;
}

function phase758Has202020(fields) {
  return Object.values(fields ?? {}).some((value) => value === 0x202020)
    || phase758ReadStack0() === 0x202020;
}

function phase758HasCriticalZero(fields) {
  return PHASE758_CRITICAL_FIELDS.some((name) => fields?.[name] === 0);
}

function phase758DiffFields(before, after) {
  const diff = {};
  for (const name of Object.keys(after ?? {})) {
    if ((before?.[name] ?? null) !== after[name]) diff[name] = { before: before?.[name] ?? null, after: after[name] };
  }
  return diff;
}

function phase758Snapshot(record, pc, fields = null) {
  return {
    block: record?.totalBlocks ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPcRaw ?? null,
    cpu: phase758CpuRaw(),
    fields: fields ?? phase758ReadFields(),
    stack0: phase758ReadStack0(),
    vram: countVRAMPixels?.() ?? null,
  };
}

function phase758CreateRecord(label) {
  return {
    label,
    config: { ...window.__phase758Config },
    totalBlocks: 0,
    prevPcRaw: null,
    prevPc: null,
    counts: Object.fromEntries(Object.keys(PHASE758_TARGETS).map((name) => [name, 0])),
    firstSamples: {},
    lastBlocks: [],
    hotBlocks: {},
    fieldTransitions: [],
    firstCriticalZero: null,
    first202020: null,
    lastFields: null,
  };
}

function phase758Read(label = 'read') {
  const fields = phase758ReadFields();
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase758CpuRaw(),
    fields,
    stack0: phase758ReadStack0(),
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase758PageErrors ?? [])],
  };
}

window.__phase758PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase758PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase758PageErrors.push(String(event.reason || event));
});

window.__phase758State = {
  records: [],
  configure(config) {
    window.__phase758Config = { ...window.__phase758Config, ...(config ?? {}) };
    return window.__phase758Config;
  },
  begin(label) {
    const record = phase758CreateRecord(label);
    this.records.push(record);
    record.start = phase758Read('start');
    record.lastFields = record.start.fields;
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase758Read('end');
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([pc, count]) => ({ pc, count }));
      if (!record.firstCriticalZero && phase758HasCriticalZero(record.end.fields)) {
        record.firstCriticalZero = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.first202020 && phase758Has202020(record.end.fields)) {
        record.first202020 = { source: 'final-state-only', snapshot: record.end };
      }
    }
    return record;
  },
  read: phase758Read,
};
window.__phase758 = window.__phase758State;

const phase758OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase758ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  let record = window.__phase758State.records.at(-1);
  if (!record) {
    record = phase758CreateRecord('implicit');
    window.__phase758State.records.push(record);
  }

  record.totalBlocks += 1;
  const pcHex = phase758Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 96) record.lastBlocks.shift();

  const fieldsBefore = phase758ReadFields();
  const diff = phase758DiffFields(record.lastFields, fieldsBefore);
  if (Object.keys(diff).length && record.fieldTransitions.length < 80) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'entry-vs-previous-block',
      diff,
    });
  }
  if (!record.firstCriticalZero && phase758HasCriticalZero(fieldsBefore)) {
    record.firstCriticalZero = { source: 'observed-before-block', snapshot: phase758Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.first202020 && phase758Has202020(fieldsBefore)) {
    record.first202020 = { source: 'observed-before-block', snapshot: phase758Snapshot(record, addr, fieldsBefore) };
  }

  for (const [name, target] of Object.entries(PHASE758_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = phase758Snapshot(record, addr, fieldsBefore);
  }

  const result = phase758OriginalObserveColdbootPersistenceBlock(state, pc);
  record.lastFields = phase758ReadFields();
  record.prevPcRaw = addr;
  record.prevPc = pcHex;
  return result;
};
`;

  return patched.replace(marker, `${injection}\n\n${marker}`);
}

function startStaticServer() {
  const serverInstance = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'browser-shell.html';
      const fullPath = path.resolve(__dirname, rel);
      if (fullPath !== __dirname && !fullPath.startsWith(`${__dirname}${path.sep}`)) {
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
      if (rel === 'browser-shell.html') {
        res.end(instrumentBrowserShell(fs.readFileSync(fullPath, 'utf8')));
        return;
      }
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
      cdpErrors.push(msg.params?.exceptionDetails?.exception?.description
        || msg.params?.exceptionDetails?.text
        || JSON.stringify(msg.params?.exceptionDetails || {}));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      cdpErrors.push(msg.params.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ') || 'console error');
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

function arrowLeftKeyParams(type) {
  return {
    type,
    windowsVirtualKeyCode: 37,
    nativeVirtualKeyCode: 37,
    code: 'ArrowLeft',
    key: 'ArrowLeft',
  };
}

function hasBadSignal(result) {
  const values = [
    result?.after?.lastKey?.D007CA,
    result?.after?.lastKey?.D008E0,
    result?.after?.lastKey?.D0243A,
    result?.after?.lastKey?.D0243D,
    result?.after?.lastKey?.D02590,
    result?.after?.diagnostics?.D007CA,
    result?.after?.diagnostics?.D008E0,
    result?.after?.diagnostics?.D0243A,
    result?.after?.diagnostics?.D0243D,
    result?.after?.diagnostics?.D02590,
    result?.after?.stack0,
  ];
  return values.some((value) => value === 0 || value === 0x202020);
}

function assess(result) {
  const key = result.after?.lastKey;
  const diag = result.after?.diagnostics;
  const counts = result.record?.counts ?? {};
  const restoreFired = key?.contextVectorRestored === true
    && key?.contextVectorRestorePc === 0x06C764
    && key?.contextVectorD007CAAfter === 0x0585E9;
  const finalHomeVector = diag?.D007CA === 0x0585E9 && key?.D007CA === 0x0585E9;
  const saneCore = diag?.D02590 === 0xD3FE81
    && diag?.D0243A === 0xD1A8CC
    && diag?.D008E0 !== 0
    && key?.D02590 === 0xD3FE81
    && key?.D0243A === 0xD1A8CC
    && key?.D008E0 !== 0;
  const bounded = key?.code === 'ArrowLeft'
    && (result.strategy.preStopArrowLeft
      ? key?.termination === 'control_pre_stop' && key?.controlStopPc === 0x001879
      : key?.termination !== 'max_steps' && key?.termination !== 'missing_block')
    && Number.isFinite(key?.steps)
    && key.steps > 0
    && key.steps < result.strategy.stepCap;
  const badRoute = counts.alternateCxMain06c92c > 0 || diag?.D007CA === 0x06C92C || key?.D007CA === 0x06C92C;
  const noPageErrors = (result.pageErrors?.length ?? 0) === 0 && (result.after?.pageErrors?.length ?? 0) === 0;
  const noCorruption = !result.record?.firstCriticalZero && !result.record?.first202020 && !hasBadSignal(result);
  return {
    restoreFired,
    finalHomeVector,
    saneCore,
    bounded,
    badRoute,
    noCorruption,
    noPageErrors,
    safeCandidate: Boolean(result.strategy.restoreArrowLeft && result.strategy.preStopArrowLeft && restoreFired && finalHomeVector && saneCore && bounded && !badRoute && noCorruption && noPageErrors),
  };
}

async function runOneStrategy(strategy, pageUrl) {
  cdpErrors.length = 0;
  await cdp(ws, 'Page.navigate', { url: `${pageUrl}?phase759=${strategy.name}&t=${Date.now()}` });
  await waitFor(ws, 'document.readyState === "complete"', `page load ${strategy.name}`, 30000);
  await waitFor(ws, '!!window.__phase758 && !!window.getColdbootPersistenceDiagnostics', `phase758 instrumentation ${strategy.name}`, 30000);
  const browserConfig = await evalExpr(ws, `window.__phase758.configure(${JSON.stringify({
    restoreArrowLeft: strategy.restoreArrowLeft,
    preStopArrowLeft: strategy.preStopArrowLeft,
    stepCap: strategy.stepCap,
  })})`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, `coldboot completion ${strategy.name}`, 180000);
  const before = await evalExpr(ws, `window.__phase758.begin(${JSON.stringify(`phase759 ${strategy.name}`)})`);

  await cdp(ws, 'Input.dispatchKeyEvent', arrowLeftKeyParams('keyDown'), 170000);
  await cdp(ws, 'Input.dispatchKeyEvent', arrowLeftKeyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'ArrowLeft'`, `ArrowLeft completion ${strategy.name}`, 30000);
  await sleep(150);

  const record = await evalExpr(ws, 'window.__phase758.finish()', 30000);
  const after = await evalExpr(ws, 'window.__phase758.read("after-finish")', 30000);
  const result = {
    strategy,
    browserConfig,
    before,
    record,
    after,
    pageErrors: [...cdpErrors],
  };
  result.assessment = assess(result);
  return result;
}

async function runScope() {
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
  for (const strategy of STRATEGIES) {
    results.push(await runOneStrategy(strategy, pageUrl));
  }

  return {
    probe: 'phase759-browser-arrowleft-prewipe-stop-scope',
    chromePath,
    pageUrl,
    results,
  };
}

function fmtValue(value, width = 6) {
  if (value == null) return '-';
  if (typeof value === 'number') return hex(value, width);
  return String(value);
}

function fmtFields(fields) {
  if (!fields) return {};
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => {
    const width = name.startsWith('D005') || name.startsWith('D000') || name === 'D02A28' ? 2 : 6;
    return [name, hex(value, width)];
  }));
}

function fmtCpu(cpu) {
  if (!cpu) return null;
  return {
    pc: hex(cpu.pc),
    sp: hex(cpu.sp),
    af: hex(cpu.af),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    f: hex(cpu.f, 2),
    stepCount: cpu.stepCount,
  };
}

function targetSummary(result) {
  const counts = result.record?.counts ?? {};
  const interesting = [
    'vectorOwner08c782',
    'vectorRestore06c764',
    'alternateCxMain06c92c',
    'cxDispatchWrapper08c72f',
    'cleanup001879',
    'cleanupTail0018f8',
    'sentinel001c33',
    'display09efde',
    'low000b7c',
    'eolOwner0a229d',
    'eolTail0a22a4',
  ];
  return interesting.map((name) => `${name}=${counts[name] ?? 0}`).join(', ');
}

function strategyTable(results) {
  return [
    '| Strategy | Restore fired | Safe candidate | Termination | Steps | Last PC | D007CA | D02590 | D0243A | Hot loop | Page errors |',
    '|---|---|---|---|---:|---|---|---|---|---|---:|',
    ...results.map((result) => {
      const a = result.assessment ?? {};
      const key = result.after?.lastKey ?? {};
      const diag = result.after?.diagnostics ?? {};
      const hot = (result.record?.hotBlocks ?? []).slice(0, 3).map((row) => `${row.pc}x${row.count}`).join(', ');
      const errors = (result.pageErrors?.length ?? 0) + (result.after?.pageErrors?.length ?? 0);
      return `| ${result.strategy.name} | ${a.restoreFired ? 'yes' : 'no'} | ${a.safeCandidate ? 'YES' : 'NO'} | ${key.termination ?? '-'} | ${key.steps ?? '-'} | ${fmtValue(result.after?.lastPc)} | ${fmtValue(diag.D007CA)} | ${fmtValue(diag.D02590)} | ${fmtValue(diag.D0243A)} | ${hot} | ${errors} |`;
    }),
  ].join('\n');
}

function transitionTable(result) {
  const rows = (result.record?.fieldTransitions ?? [])
    .filter((row) => Object.hasOwn(row.diff ?? {}, 'D007CA') || Object.hasOwn(row.diff ?? {}, 'D008E0'))
    .slice(-20);
  if (!rows.length) return '_No D007CA/D008E0 transitions captured._';
  return [
    '| Block | PC | Prev PC | Timing | Diff |',
    '|---:|---|---|---|---|',
    ...rows.map((row) => {
      const diff = Object.entries(row.diff ?? {})
        .filter(([name]) => name === 'D007CA' || name === 'D008E0')
        .map(([name, value]) => `${name}:${fmtValue(value.before)}->${fmtValue(value.after)}`)
        .join('; ');
      return `| ${row.block} | ${row.pc} | ${row.prevPc ?? '-'} | ${row.timing} | ${diff} |`;
    }),
  ].join('\n');
}

function detailSections(results) {
  return results.map((result) => {
    const key = result.after?.lastKey ?? {};
    const diag = result.after?.diagnostics ?? {};
    const a = result.assessment ?? {};
    return [
      `## Strategy: ${result.strategy.name}`,
      '',
      `- Config: restoreArrowLeft=${result.strategy.restoreArrowLeft}, preStopArrowLeft=${result.strategy.preStopArrowLeft}, stepCap=${result.strategy.stepCap}.`,
      `- Assessment: restoreFired=${a.restoreFired}, finalHomeVector=${a.finalHomeVector}, saneCore=${a.saneCore}, bounded=${a.bounded}, badRoute=${a.badRoute}, noCorruption=${a.noCorruption}, noPageErrors=${a.noPageErrors}, safeCandidate=${a.safeCandidate}.`,
      `- Key result: termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, stop=${fmtValue(key.controlStopPc)}, lastPc=${fmtValue(result.after?.lastPc)}, contextRestore=${fmtValue(key.contextVectorRestorePc)}, D007CA ${fmtValue(key.contextVectorD007CABefore)}->${fmtValue(key.contextVectorD007CAAfter)}.`,
      `- Final fields: D007CA=${fmtValue(diag.D007CA)}, D008E0=${fmtValue(diag.D008E0)}, D02590=${fmtValue(diag.D02590)}, D0243A=${fmtValue(diag.D0243A)}, D0243D=${fmtValue(diag.D0243D)}, VRAM=${result.after?.vram ?? '-'}.`,
      `- Target hits: ${targetSummary(result)}.`,
      '',
      '### D007CA/D008E0 Transitions',
      '',
      transitionTable(result),
      '',
    ].join('\n');
  }).join('\n');
}

function compactResult(result) {
  return {
    strategy: result.strategy,
    browserConfig: result.browserConfig,
    assessment: result.assessment,
    before: {
      status: result.before?.status,
      lastPc: fmtValue(result.before?.lastPc),
      fields: fmtFields(result.before?.fields),
      vram: result.before?.vram,
    },
    after: {
      status: result.after?.status,
      lastPc: fmtValue(result.after?.lastPc),
      cpu: fmtCpu(result.after?.cpu),
      fields: fmtFields(result.after?.fields),
      diagnostics: result.after?.diagnostics,
      lastKey: result.after?.lastKey,
      stack0: fmtValue(result.after?.stack0),
      pageErrors: result.after?.pageErrors,
    },
    targetCounts: result.record?.counts ?? {},
    hotBlocks: result.record?.hotBlocks ?? [],
    lastBlocks: result.record?.lastBlocks ?? [],
    d007caTransitions: (result.record?.fieldTransitions ?? [])
      .filter((row) => Object.hasOwn(row.diff ?? {}, 'D007CA')),
    firstCriticalZero: result.record?.firstCriticalZero ?? null,
    first202020: result.record?.first202020 ?? null,
    pageErrors: result.pageErrors ?? [],
  };
}

function buildReport(data) {
  const results = data?.results ?? [];
  const baseline = results.find((result) => result.strategy.name === 'baseline');
  const restoreNoStop = results.find((result) => result.strategy.name === 'restoreNoStop');
  const restorePreStop = results.find((result) => result.strategy.name === 'restorePreStop001879');
  const finding = data?.error
    ? `Probe failed: ${data.error.split('\n')[0]}`
    : restorePreStop?.assessment?.safeCandidate
      ? 'ArrowLeft context-vector restore at 0x06C764 plus pre-wipe stop at 0x001879 produced a bounded sane candidate.'
      : `ArrowLeft pre-wipe stop ${restorePreStop?.assessment?.bounded ? 'bounded the run' : 'did not prove a bounded sane candidate'}; restoreFired=${restorePreStop?.assessment?.restoreFired ?? false}, safeCandidate=${restorePreStop?.assessment?.safeCandidate ?? false}.`;
  const baselineLine = baseline
    ? `Baseline: termination=${baseline.after?.lastKey?.termination}, lastPc=${fmtValue(baseline.after?.lastPc)}, D007CA=${fmtValue(baseline.after?.diagnostics?.D007CA)}, hot=${(baseline.record?.hotBlocks ?? []).slice(0, 3).map((row) => `${row.pc}x${row.count}`).join(', ')}.`
    : 'Baseline did not run.';
  const noStopLine = restoreNoStop
    ? `Restore/no-stop: termination=${restoreNoStop.after?.lastKey?.termination}, lastPc=${fmtValue(restoreNoStop.after?.lastPc)}, D007CA=${fmtValue(restoreNoStop.after?.diagnostics?.D007CA)}, restorePc=${fmtValue(restoreNoStop.after?.lastKey?.contextVectorRestorePc)}, hot=${(restoreNoStop.record?.hotBlocks ?? []).slice(0, 3).map((row) => `${row.pc}x${row.count}`).join(', ')}.`
    : 'Restore/no-stop strategy did not run.';
  const preStopLine = restorePreStop
    ? `Restore/pre-stop: termination=${restorePreStop.after?.lastKey?.termination}, stop=${fmtValue(restorePreStop.after?.lastKey?.controlStopPc)}, lastPc=${fmtValue(restorePreStop.after?.lastPc)}, D007CA=${fmtValue(restorePreStop.after?.diagnostics?.D007CA)}, D02590=${fmtValue(restorePreStop.after?.diagnostics?.D02590)}, D0243A=${fmtValue(restorePreStop.after?.diagnostics?.D0243A)}, VRAM=${restorePreStop.after?.vram ?? '-'}, restorePc=${fmtValue(restorePreStop.after?.lastKey?.contextVectorRestorePc)}.`
    : 'Restore/pre-stop strategy did not run.';

  const compact = data?.error ? { error: data.error } : {
    finding,
    results: results.map(compactResult),
  };

  return [
    '# Phase 759 Browser ArrowLeft Pre-Wipe Stop Scope',
    '',
    'Probe: `probe-phase759-browser-arrowleft-prewipe-stop-scope.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase759-browser-arrowleft-prewipe-stop-scope.mjs`',
    '',
    'Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowLeft`, and compares baseline behavior, the phase758 restore-without-stop negative control, and a new `restorePreStop001879` variant. The candidate restores the pre-key 21-byte `D007CA..D007DE` context vector at `0x06C764`, then stops before the destructive wipe at `0x001879`.',
    '',
    'The disk `browser-shell.html` is not patched by this probe.',
    '',
    '## Result',
    '',
    `- ${finding}`,
    `- ${baselineLine}`,
    `- ${noStopLine}`,
    `- ${preStopLine}`,
    '',
    '## Strategy Matrix',
    '',
    data?.error ? '_No strategy matrix._' : strategyTable(results),
    '',
    data?.error ? '' : detailSections(results),
    '',
    '## Compact Evidence',
    '',
    '```json',
    JSON.stringify(compact, null, 2),
    '```',
    '',
  ].join('\n');
}

try {
  summary = await runScope();
  console.log(JSON.stringify({
    probe: summary.probe,
    results: summary.results.map((result) => ({
      strategy: result.strategy.name,
      assessment: result.assessment,
      termination: result.after?.lastKey?.termination,
      steps: result.after?.lastKey?.steps,
      lastPc: hex(result.after?.lastPc),
      D007CA: hex(result.after?.diagnostics?.D007CA),
      D008E0: hex(result.after?.diagnostics?.D008E0),
      D02590: hex(result.after?.diagnostics?.D02590),
      D0243A: hex(result.after?.diagnostics?.D0243A),
      contextVectorRestored: result.after?.lastKey?.contextVectorRestored,
      contextVectorRestorePc: hex(result.after?.lastKey?.contextVectorRestorePc),
      contextVectorD007CABefore: hex(result.after?.lastKey?.contextVectorD007CABefore),
      contextVectorD007CAAfter: hex(result.after?.lastKey?.contextVectorD007CAAfter),
      hotBlocks: result.record?.hotBlocks?.slice(0, 8),
      targetCounts: Object.fromEntries(Object.entries(result.record?.counts ?? {}).filter(([, value]) => value)),
      pageErrors: [...(result.pageErrors ?? []), ...(result.after?.pageErrors ?? [])],
    })),
  }, null, 2));
} catch (error) {
  summary = {
    probe: 'phase759-browser-arrowleft-prewipe-stop-scope',
    error: String(error?.stack || error),
  };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  await sleep(500);
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

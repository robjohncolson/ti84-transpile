import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase767-browser-enter-cursor-treatment-scope.md');
const debugPort = 9767;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase767-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const ENTER_PRESTOP_PC = 0x001879;
const ENTER_PRESTOP_LABEL = 'enter-prewipe-cursor-treatment-scope';
const STRATEGIES = Object.freeze([
  { name: 'preStop001879Only', preStopEnter: true, cursorFixAtStop: false, stepCap: 90000 },
  { name: 'cursorFixAt001879', preStopEnter: true, cursorFixAtStop: true, stepCap: 90000 },
]);

let nextId = 1;
const pending = new Map();
const cdpErrors = [];
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

function instrumentBrowserShell(html) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) throw new Error('Instrumentation marker not found in browser-shell.html');

  const burstRegex = /function getColdbootKeyBurstStepsForCode\(code\) \{\s+return code === EOL_PC_CODE\s+\? Math\.max\(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS\)\s+: COLDBOOT_KEY_BURST_STEPS;\s+\}/;
  let patched = html.replace(burstRegex, `function getColdbootKeyBurstStepsForCode(code) {
  if (code === 'Enter' && window.__phase766Config?.stepCap) return window.__phase766Config.stepCap;
  return code === EOL_PC_CODE
    ? Math.max(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS)
    : COLDBOOT_KEY_BURST_STEPS;
}`);
  if (patched === html) throw new Error('Enter burst cap patch point not found');

  const injection = String.raw`
window.__phase766Config = {
  preStopEnter: false,
  cursorFixAtStop: false,
  stepCap: 190000,
};

const PHASE766_TARGETS = Object.freeze({
  reset000000: 0x000000,
  low000a92: 0x000A92,
  low000b7c: 0x000B7C,
  coldIdle0019b5: 0x0019B5,
  wipe0019be: 0x0019BE,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  sentinel001c33: 0x001C33,
  sentinel0158bc: 0x0158BC,
  postInsertGate0158de: 0x0158DE,
  spaceFillBridge0a2a37: 0x0A2A37,
  vectorOwner08c782: 0x08C782,
  vectorRestore06c764: 0x06C764,
  alternateCxMain06c92c: 0x06C92C,
  cxDispatchWrapper08c72f: 0x08C72F,
  cxJpTrampoline08c745: 0x08C745,
  display09efde: 0x09EFDE,
  display09efcb: 0x09EFCB,
  display09efe8: 0x09EFE8,
});

const PHASE766_FIELD_SPECS = Object.freeze([
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
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
]);

const PHASE766_CRITICAL_FIELDS = Object.freeze(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590']);

function phase766Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase766ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase766WriteValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[(addr + i) & 0xFFFFFF] = (value >>> (8 * i)) & 0xFF;
}

function phase766ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE766_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase766ReadValue(mem, addr, len),
  ]));
}

function phase766ReadStackSlots(count = 8) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: phase766ReadValue(mem, addr, 3) };
  });
}

function phase766CpuRaw() {
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
    madl: cpu.madl ?? 0,
    stepCount: cpu.stepCount ?? 0,
  } : null;
}

function phase766Has202020(fields, stackTop = []) {
  return Object.values(fields ?? {}).some((value) => value === 0x202020)
    || stackTop.some((slot) => slot.value === 0x202020);
}

function phase766HasCriticalZero(fields) {
  return PHASE766_CRITICAL_FIELDS.some((name) => fields?.[name] === 0);
}

function phase766DiffFields(before, after) {
  const diff = {};
  for (const name of Object.keys(after ?? {})) {
    if ((before?.[name] ?? null) !== after[name]) diff[name] = { before: before?.[name] ?? null, after: after[name] };
  }
  return diff;
}

function phase766Snapshot(record, pc, fields = null) {
  return {
    block: record?.totalBlocks ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPcRaw ?? null,
    cpu: phase766CpuRaw(),
    fields: fields ?? phase766ReadFields(),
    stackTop: phase766ReadStackSlots(8),
    vram: countVRAMPixels?.() ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? getColdbootEditLineDiagnostics?.() ?? null,
  };
}

function phase766CreateRecord(label) {
  return {
    label,
    config: { ...window.__phase766Config },
    totalBlocks: 0,
    prevPcRaw: null,
    prevPc: null,
    counts: Object.fromEntries(Object.keys(PHASE766_TARGETS).map((name) => [name, 0])),
    firstSamples: {},
    firstBlocks: [],
    lastBlocks: [],
    hotBlocks: {},
    fieldTransitions: [],
    cursorCorrections: [],
    firstCriticalZero: null,
    first202020: null,
    firstBadD007CA: null,
    firstD0243AChange: null,
    lastFields: null,
    expected: null,
  };
}

function phase766Read(label = 'read') {
  const fields = phase766ReadFields();
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase766CpuRaw(),
    fields,
    stackTop: phase766ReadStackSlots(8),
    diagnostics: window.__coldbootReadEditLineState?.() ?? getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase766PageErrors ?? [])],
  };
}

window.__phase766PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase766PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase766PageErrors.push(String(event.reason || event));
});

window.__phase766State = {
  records: [],
  configure(config) {
    window.__phase766Config = { ...window.__phase766Config, ...(config ?? {}) };
    return window.__phase766Config;
  },
  begin(label) {
    const record = phase766CreateRecord(label);
    this.records.push(record);
    record.start = phase766Read('start');
    record.lastFields = record.start.fields;
    record.expected = {
      D007CA: record.start.fields?.D007CA ?? null,
      D0243A: record.start.fields?.D0243A ?? null,
      D0243D: record.start.fields?.D0243D ?? null,
      D02590: record.start.fields?.D02590 ?? null,
    };
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase766Read('end');
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([pc, count]) => ({ pc, count }));
      if (!record.firstCriticalZero && phase766HasCriticalZero(record.end.fields)) {
        record.firstCriticalZero = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.first202020 && phase766Has202020(record.end.fields, record.end.stackTop)) {
        record.first202020 = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.firstBadD007CA && record.expected?.D007CA != null && record.end.fields?.D007CA !== record.expected.D007CA) {
        record.firstBadD007CA = { source: 'final-state-only', expected: record.expected.D007CA, snapshot: record.end };
      }
      if (!record.firstD0243AChange && record.expected?.D0243A != null && record.end.fields?.D0243A !== record.expected.D0243A) {
        record.firstD0243AChange = { source: 'final-state-only', expected: record.expected.D0243A, snapshot: record.end };
      }
    }
    return record;
  },
  read: phase766Read,
};
window.__phase766 = window.__phase766State;

const phase766OriginalGetColdbootControlPreStop = getColdbootControlPreStop;
getColdbootControlPreStop = function phase766GetColdbootControlPreStop(code) {
  if (code === 'Enter' && window.__phase766Config?.preStopEnter === true) {
    return { pc: ${ENTER_PRESTOP_PC}, label: '${ENTER_PRESTOP_LABEL}' };
  }
  return phase766OriginalGetColdbootControlPreStop(code);
};

const phase766OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase766ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  let record = window.__phase766State.records.at(-1);
  if (!record) {
    record = phase766CreateRecord('implicit');
    window.__phase766State.records.push(record);
  }

  record.totalBlocks += 1;
  const pcHex = phase766Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 80) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 160) record.lastBlocks.shift();

  const fieldsBefore = phase766ReadFields();
  const stackTop = phase766ReadStackSlots(8);
  const entryDiff = phase766DiffFields(record.lastFields, fieldsBefore);
  if (Object.keys(entryDiff).length && record.fieldTransitions.length < 120) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'entry-vs-previous-block',
      diff: entryDiff,
    });
  }

  if (!record.firstCriticalZero && phase766HasCriticalZero(fieldsBefore)) {
    record.firstCriticalZero = { source: 'observed-before-block', snapshot: phase766Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.first202020 && phase766Has202020(fieldsBefore, stackTop)) {
    record.first202020 = { source: 'observed-before-block', snapshot: phase766Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.firstBadD007CA && record.expected?.D007CA != null && fieldsBefore?.D007CA !== record.expected.D007CA) {
    record.firstBadD007CA = { source: 'observed-before-block', expected: record.expected.D007CA, snapshot: phase766Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.firstD0243AChange && record.expected?.D0243A != null && fieldsBefore?.D0243A !== record.expected.D0243A) {
    record.firstD0243AChange = { source: 'observed-before-block', expected: record.expected.D0243A, snapshot: phase766Snapshot(record, addr, fieldsBefore) };
  }

  for (const [name, target] of Object.entries(PHASE766_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = phase766Snapshot(record, addr, fieldsBefore);
  }

  const result = phase766OriginalObserveColdbootPersistenceBlock(state, pc);
  let fieldsAfter = phase766ReadFields();

  if (addr === ${ENTER_PRESTOP_PC} && window.__phase766Config?.cursorFixAtStop === true) {
    const beforeFix = fieldsAfter;
    const targetCursor = record.expected?.D0243A ?? 0xD1A8CC;
    phase766WriteValue(cpu.memory, 0xD0243A, 3, targetCursor);
    fieldsAfter = phase766ReadFields();
    record.cursorCorrections.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      before: beforeFix?.D0243A ?? null,
      after: fieldsAfter?.D0243A ?? null,
      target: targetCursor,
    });
  }

  const hookDiff = phase766DiffFields(fieldsBefore, fieldsAfter);
  if (Object.keys(hookDiff).length && record.fieldTransitions.length < 120) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'after-persistence-hook',
      diff: hookDiff,
    });
  }

  record.lastFields = fieldsAfter;
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

function enterKeyParams(type) {
  return {
    type,
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    code: 'Enter',
    key: 'Enter',
  };
}

function valueSetHasBadSignal(...values) {
  return values.some((value) => value === 0 || value === 0x202020);
}

function assess(result) {
  const key = result.after?.lastKey ?? {};
  const diag = result.after?.diagnostics ?? {};
  const counts = result.record?.counts ?? {};
  const pageErrorCount = (result.pageErrors?.length ?? 0) + (result.after?.pageErrors?.length ?? 0);
  const stoppedAtPrewipe = key.code === 'Enter'
    && key.termination === 'control_pre_stop'
    && key.controlStopPc === ENTER_PRESTOP_PC
    && key.controlPreStopPc === ENTER_PRESTOP_PC;
  const saneHomeState = diag.D007CA === 0x0585E9
    && diag.D02590 === 0xD3FE81
    && diag.D008E0 !== 0
    && diag.D0243A === 0xD1A8CC
    && diag.D0243D === 0xD2A83E;
  const noZeroOrSpaceCorruption = !result.record?.firstCriticalZero
    && !result.record?.first202020
    && !valueSetHasBadSignal(key.D007CA, key.D008E0, key.D0243A, key.D0243D, key.D02590);
  const noWipeTail = (counts.cleanup001879 ?? 0) === 1 && (counts.cleanupTail0018f8 ?? 0) === 0;
  const noContextVectorRestore = key.contextVectorRestoreEnabled === false
    && key.contextVectorRestored === false;
  const cursorCorrectionCount = result.record?.cursorCorrections?.length ?? 0;
  const cursorFixApplied = result.strategy.cursorFixAtStop === true
    && cursorCorrectionCount === 1
    && result.record.cursorCorrections[0]?.before === 0xD1A8A3
    && result.record.cursorCorrections[0]?.after === 0xD1A8CC;
  const cursorTreatmentAsExpected = result.strategy.cursorFixAtStop === true
    ? cursorFixApplied
    : cursorCorrectionCount === 0;
  const vramNotWiped = (result.after?.vram ?? 0) >= Math.max(1, Math.floor((result.before?.vram ?? 0) * 0.75));
  const noPageErrors = pageErrorCount === 0;

  return {
    stoppedAtPrewipe,
    saneHomeState,
    cursorStayedAtBaseline: diag.D0243A === 0xD1A8CC,
    cursorMovedToEnterObservedValue: diag.D0243A === 0xD1A8A3,
    cursorFixApplied,
    cursorTreatmentAsExpected,
    noZeroOrSpaceCorruption,
    noWipeTail,
    noContextVectorRestore,
    vramNotWiped,
    noPageErrors,
    safeCandidate: Boolean(
      result.strategy.preStopEnter
      && result.strategy.cursorFixAtStop
      && stoppedAtPrewipe
      && saneHomeState
      && cursorFixApplied
      && cursorTreatmentAsExpected
      && noZeroOrSpaceCorruption
      && noWipeTail
      && noContextVectorRestore
      && vramNotWiped
      && noPageErrors
    ),
  };
}

async function runOneStrategy(strategy, pageUrl) {
  cdpErrors.length = 0;
  await cdp(ws, 'Page.navigate', { url: `${pageUrl}?phase767=${strategy.name}&t=${Date.now()}` });
  await waitFor(ws, 'document.readyState === "complete"', `page load ${strategy.name}`, 30000);
  await waitFor(ws, '!!window.__phase766 && !!window.getColdbootPersistenceDiagnostics', `phase766 instrumentation ${strategy.name}`, 30000);
  const browserConfig = await evalExpr(ws, `window.__phase766.configure(${JSON.stringify({
    preStopEnter: strategy.preStopEnter,
    cursorFixAtStop: strategy.cursorFixAtStop,
    stepCap: strategy.stepCap,
  })})`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, `coldboot completion ${strategy.name}`, 180000);
  const before = await evalExpr(ws, `window.__phase766.begin(${JSON.stringify(`phase767 ${strategy.name}`)})`, 30000);

  await cdp(ws, 'Input.dispatchKeyEvent', enterKeyParams('keyDown'), 175000);
  await cdp(ws, 'Input.dispatchKeyEvent', enterKeyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'Enter'`, `Enter completion ${strategy.name}`, 30000);
  await sleep(150);

  const record = await evalExpr(ws, 'window.__phase766.finish()', 30000);
  const after = await evalExpr(ws, 'window.__phase766.read("after-finish")', 30000);
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
    probe: 'phase767-browser-enter-cursor-treatment-scope',
    chromePath,
    pageUrl,
    prestop: { code: 'Enter', pc: ENTER_PRESTOP_PC, label: ENTER_PRESTOP_LABEL },
    results,
  };
}

function fmtValue(value, width = 6) {
  if (value == null) return '-';
  if (typeof value === 'number') return hex(value, width);
  return String(value);
}

function fieldWidth(name) {
  return name.startsWith('D005') || name.startsWith('D000') || name === 'D02A28' ? 2 : 6;
}

function fmtFields(fields) {
  if (!fields) return {};
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, hex(value, fieldWidth(name))]));
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
    'spaceFillBridge0a2a37',
    'cleanup001879',
    'cleanupTail0018f8',
    'vectorOwner08c782',
    'vectorRestore06c764',
    'alternateCxMain06c92c',
    'sentinel0158bc',
    'postInsertGate0158de',
    'low000a92',
    'low000b7c',
  ];
  return interesting.map((name) => `${name}=${counts[name] ?? 0}`).join(', ');
}

function firstCoreTransition(result, field) {
  return (result.record?.fieldTransitions ?? []).find((row) => Object.hasOwn(row.diff ?? {}, field)) ?? null;
}

function strategyTable(results) {
  return [
    '| Strategy | Cursor fix | Safe candidate | Termination | Steps | Stop | Last PC | D007CA | D008E0 | D02590 | D0243A | D0243D | VRAM | Corrections | Wipe tail | Page errors |',
    '|---|---|---|---|---:|---|---|---|---|---|---|---|---:|---:|---:|---:|',
    ...results.map((result) => {
      const a = result.assessment ?? {};
      const key = result.after?.lastKey ?? {};
      const diag = result.after?.diagnostics ?? {};
      const counts = result.record?.counts ?? {};
      const errors = (result.pageErrors?.length ?? 0) + (result.after?.pageErrors?.length ?? 0);
      return `| ${result.strategy.name} | ${result.strategy.cursorFixAtStop ? 'yes' : 'no'} | ${a.safeCandidate ? 'YES' : 'NO'} | ${key.termination ?? '-'} | ${key.steps ?? '-'} | ${fmtValue(key.controlStopPc)} | ${fmtValue(result.after?.lastPc)} | ${fmtValue(diag.D007CA)} | ${fmtValue(diag.D008E0)} | ${fmtValue(diag.D02590)} | ${fmtValue(diag.D0243A)} | ${fmtValue(diag.D0243D)} | ${result.after?.vram ?? '-'} | ${result.record?.cursorCorrections?.length ?? 0} | ${counts.cleanupTail0018f8 ?? 0} | ${errors} |`;
    }),
  ].join('\n');
}

function transitionTable(result) {
  const interesting = new Set(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590', 'D0058C', 'D0058D', 'D0058E']);
  const rows = (result.record?.fieldTransitions ?? [])
    .filter((row) => Object.keys(row.diff ?? {}).some((name) => interesting.has(name)))
    .slice(-36);
  if (!rows.length) return '_No core field transitions captured._';
  return [
    '| Block | PC | Prev PC | Timing | Diffs |',
    '|---:|---|---|---|---|',
    ...rows.map((row) => {
      const diff = Object.entries(row.diff ?? {})
        .filter(([name]) => interesting.has(name))
        .map(([name, value]) => `${name}:${fmtValue(value.before)}->${fmtValue(value.after)}`)
        .join('; ');
      return `| ${row.block} | ${row.pc} | ${row.prevPc ?? '-'} | ${row.timing} | ${diff.replaceAll('|', '\\|')} |`;
    }),
  ].join('\n');
}

function targetTable(result) {
  const counts = result.record?.counts ?? {};
  const samples = result.record?.firstSamples ?? {};
  return [
    '| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | D007CA | D02590 |',
    '|---|---:|---:|---|---|---|---|---|---|---|---|',
    ...Object.keys(counts).map((name) => {
      const sample = samples[name];
      return `| ${name} | ${counts[name] ?? 0} | ${sample?.block ?? '-'} | ${fmtValue(sample?.pc)} | ${fmtValue(sample?.prevPc)} | ${fmtValue(sample?.cpu?.bc)} | ${fmtValue(sample?.cpu?.hl)} | ${fmtValue(sample?.cpu?.de)} | ${fmtValue(sample?.cpu?.sp)} | ${fmtValue(sample?.fields?.D007CA)} | ${fmtValue(sample?.fields?.D02590)} |`;
    }),
  ].join('\n');
}

function cursorCorrectionTable(result) {
  const rows = result?.record?.cursorCorrections ?? [];
  if (!rows.length) return '_No cursor correction applied._';
  return [
    '| Block | PC | Prev PC | D0243A before | D0243A after | Target |',
    '|---:|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.block} | ${row.pc} | ${row.prevPc ?? '-'} | ${fmtValue(row.before)} | ${fmtValue(row.after)} | ${fmtValue(row.target)} |`),
  ].join('\n');
}

function detailSections(results) {
  return results.map((result) => {
    const key = result.after?.lastKey ?? {};
    const diag = result.after?.diagnostics ?? {};
    const a = result.assessment ?? {};
    const d007ca = firstCoreTransition(result, 'D007CA');
    const d0243a = firstCoreTransition(result, 'D0243A');
    return [
      `## Strategy: ${result.strategy.name}`,
      '',
      `- Config: preStopEnter=${result.strategy.preStopEnter}, cursorFixAtStop=${result.strategy.cursorFixAtStop}, stepCap=${result.strategy.stepCap}.`,
      `- Assessment: stoppedAtPrewipe=${a.stoppedAtPrewipe}, saneHomeState=${a.saneHomeState}, cursorStayedAtBaseline=${a.cursorStayedAtBaseline}, cursorMovedToEnterObservedValue=${a.cursorMovedToEnterObservedValue}, cursorFixApplied=${a.cursorFixApplied}, cursorTreatmentAsExpected=${a.cursorTreatmentAsExpected}, noZeroOrSpaceCorruption=${a.noZeroOrSpaceCorruption}, noWipeTail=${a.noWipeTail}, noContextVectorRestore=${a.noContextVectorRestore}, vramNotWiped=${a.vramNotWiped}, noPageErrors=${a.noPageErrors}, safeCandidate=${a.safeCandidate}.`,
      `- Key result: termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, controlStop=${fmtValue(key.controlStopPc)}, controlLabel=${key.controlPreStopLabel ?? '-'}, lastPc=${fmtValue(result.after?.lastPc)}, contextRestoreEnabled=${key.contextVectorRestoreEnabled}, contextRestored=${key.contextVectorRestored}.`,
      `- Final fields: D007CA=${fmtValue(diag.D007CA)}, D008E0=${fmtValue(diag.D008E0)}, D02590=${fmtValue(diag.D02590)}, D0243A=${fmtValue(diag.D0243A)}, D0243D=${fmtValue(diag.D0243D)}, VRAM=${result.after?.vram ?? '-'}, pageErrors=${(result.pageErrors?.length ?? 0) + (result.after?.pageErrors?.length ?? 0)}.`,
      d007ca ? `- First D007CA transition: block ${d007ca.block}, prevPc=${d007ca.prevPc ?? '-'}, nextPc=${d007ca.pc}, ${fmtValue(d007ca.diff.D007CA.before)}->${fmtValue(d007ca.diff.D007CA.after)}.` : '- First D007CA transition: none captured.',
      d0243a ? `- First D0243A transition: block ${d0243a.block}, prevPc=${d0243a.prevPc ?? '-'}, nextPc=${d0243a.pc}, ${fmtValue(d0243a.diff.D0243A.before)}->${fmtValue(d0243a.diff.D0243A.after)}.` : '- First D0243A transition: none captured.',
      `- Target hits: ${targetSummary(result)}.`,
      '',
      '### Target Hits',
      '',
      targetTable(result),
      '',
      '### Core Field Transitions',
      '',
      transitionTable(result),
      '',
      '### Cursor Corrections',
      '',
      cursorCorrectionTable(result),
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
      pageErrors: result.after?.pageErrors,
    },
    targetCounts: result.record?.counts ?? {},
    hotBlocks: result.record?.hotBlocks ?? [],
    firstCriticalZero: result.record?.firstCriticalZero ?? null,
    first202020: result.record?.first202020 ?? null,
    firstBadD007CA: result.record?.firstBadD007CA ?? null,
    firstD0243AChange: result.record?.firstD0243AChange ?? null,
    d007caTransitions: (result.record?.fieldTransitions ?? []).filter((row) => Object.hasOwn(row.diff ?? {}, 'D007CA')),
    cursorTransitions: (result.record?.fieldTransitions ?? []).filter((row) => Object.hasOwn(row.diff ?? {}, 'D0243A')),
    cursorCorrections: result.record?.cursorCorrections ?? [],
    lastBlocks: result.record?.lastBlocks ?? [],
    pageErrors: result.pageErrors ?? [],
  };
}

function buildReport(data) {
  const results = data?.results ?? [];
  const preStop = results.find((result) => result.strategy.name === 'preStop001879Only');
  const fix = results.find((result) => result.strategy.name === 'cursorFixAt001879');
  const preStopDelta = firstCoreTransition(preStop, 'D0243A');
  const fixCorrection = fix?.record?.cursorCorrections?.[0] ?? null;
  const finding = data?.error
    ? `Probe failed: ${data.error.split('\n')[0]}`
    : fix?.assessment?.safeCandidate
      ? 'Enter cursor-treatment candidate is bounded and sane: stop at 0x001879, restore only D0243A to 0xD1A8CC, no context-vector restore.'
      : `Enter cursor-treatment candidate did not meet exact criteria; safeCandidate=${fix?.assessment?.safeCandidate ?? false}.`;
  const deltaLine = preStopDelta
    ? `Pre-stop-only cursor delta: D0243A ${fmtValue(preStopDelta.diff.D0243A.before)}->${fmtValue(preStopDelta.diff.D0243A.after)} appears at nextPc=${preStopDelta.pc}; owner is previous block ${preStopDelta.prevPc ?? '-'} (block ${preStopDelta.block}).`
    : 'Pre-stop-only cursor delta: no D0243A transition captured.';
  const preStopLine = preStop
    ? `Pre-stop-only: termination=${preStop.after?.lastKey?.termination}, stop=${fmtValue(preStop.after?.lastKey?.controlStopPc)}, D007CA=${fmtValue(preStop.after?.diagnostics?.D007CA)}, D008E0=${fmtValue(preStop.after?.diagnostics?.D008E0)}, D02590=${fmtValue(preStop.after?.diagnostics?.D02590)}, D0243A=${fmtValue(preStop.after?.diagnostics?.D0243A)}, D0243D=${fmtValue(preStop.after?.diagnostics?.D0243D)}, VRAM=${preStop.after?.vram ?? '-'}, cleanupTail=${preStop.record?.counts?.cleanupTail0018f8 ?? 0}.`
    : 'Pre-stop-only strategy did not run.';
  const fixLine = fix
    ? `Cursor-fix final: termination=${fix.after?.lastKey?.termination}, stop=${fmtValue(fix.after?.lastKey?.controlStopPc)}, D007CA=${fmtValue(fix.after?.diagnostics?.D007CA)}, D008E0=${fmtValue(fix.after?.diagnostics?.D008E0)}, D02590=${fmtValue(fix.after?.diagnostics?.D02590)}, D0243A=${fmtValue(fix.after?.diagnostics?.D0243A)}, D0243D=${fmtValue(fix.after?.diagnostics?.D0243D)}, VRAM=${fix.after?.vram ?? '-'}, cleanupTail=${fix.record?.counts?.cleanupTail0018f8 ?? 0}, correction=${fixCorrection ? `${fmtValue(fixCorrection.before)}->${fmtValue(fixCorrection.after)} at ${fixCorrection.pc}` : 'none'}.`
    : 'Cursor-fix strategy did not run.';
  const compact = data?.error ? { error: data.error } : {
    finding,
    prestop: data?.prestop,
    results: results.map(compactResult),
  };

  return [
    '# Phase 767 Browser Enter Cursor-Treatment Scope',
    '',
    'Probe: `probe-phase767-browser-enter-cursor-treatment-scope.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase767-browser-enter-cursor-treatment-scope.mjs`',
    '',
    'Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `Enter`, and compares the phase766 bounded pre-stop against an in-memory cursor-treatment candidate that restores only `D0243A` at `0x001879`.',
    '',
    'This probe intentionally does not patch disk `browser-shell.html`; it tests whether a later disk patch can be limited to a control pre-stop plus a narrow cursor writeback with no context-vector restore.',
    '',
    '## Result',
    '',
    `- ${finding}`,
    `- ${deltaLine}`,
    `- ${preStopLine}`,
    `- ${fixLine}`,
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
      controlStopPc: hex(result.after?.lastKey?.controlStopPc),
      controlPreStopLabel: result.after?.lastKey?.controlPreStopLabel,
      lastPc: hex(result.after?.lastPc),
      D007CA: hex(result.after?.diagnostics?.D007CA),
      D008E0: hex(result.after?.diagnostics?.D008E0),
      D02590: hex(result.after?.diagnostics?.D02590),
      D0243A: hex(result.after?.diagnostics?.D0243A),
      D0243D: hex(result.after?.diagnostics?.D0243D),
      cursorCorrections: result.record?.cursorCorrections ?? [],
      firstCriticalZero: result.record?.firstCriticalZero?.source ?? null,
      first202020: result.record?.first202020?.source ?? null,
      firstBadD007CA: result.record?.firstBadD007CA ? {
        source: result.record.firstBadD007CA.source,
        pc: hex(result.record.firstBadD007CA.snapshot?.pc),
        prevPc: hex(result.record.firstBadD007CA.snapshot?.prevPc),
        block: result.record.firstBadD007CA.snapshot?.block,
        value: hex(result.record.firstBadD007CA.snapshot?.fields?.D007CA),
      } : null,
      targetCounts: Object.fromEntries(Object.entries(result.record?.counts ?? {}).filter(([, value]) => value)),
      hotBlocks: result.record?.hotBlocks?.slice(0, 10) ?? [],
      pageErrors: [...(result.pageErrors ?? []), ...(result.after?.pageErrors ?? [])],
    })),
  }, null, 2));
} catch (error) {
  summary = {
    probe: 'phase767-browser-enter-cursor-treatment-scope',
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

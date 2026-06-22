import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase770-browser-keye-prestop-scope.md');
const debugPort = 9770;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase770-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const KEYE_PRESTOP_PC = 0x001879;
const KEYE_PRESTOP_LABEL = 'keye-prewipe-stop';
const STRATEGIES = Object.freeze([
  { name: 'baselineNoStop', preStopKeyE: false, stepCap: 190000 },
  { name: 'preStop001879Only', preStopKeyE: true, stepCap: 90000 },
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
  if (code === 'KeyE' && window.__phase770Config?.stepCap) return window.__phase770Config.stepCap;
  return code === EOL_PC_CODE
    ? Math.max(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS)
    : COLDBOOT_KEY_BURST_STEPS;
}`);
  if (patched === html) throw new Error('KeyE burst cap patch point not found');

  const injection = String.raw`
window.__phase770Config = {
  preStopKeyE: false,
  stepCap: 190000,
};

const PHASE770_TARGETS = Object.freeze({
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

const PHASE770_FIELD_SPECS = Object.freeze([
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

const PHASE770_CRITICAL_FIELDS = Object.freeze(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590']);

function phase770Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase770ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase770ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE770_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase770ReadValue(mem, addr, len),
  ]));
}

function phase770ReadStackSlots(count = 8) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: phase770ReadValue(mem, addr, 3) };
  });
}

function phase770CpuRaw() {
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

function phase770Has202020(fields, stackTop = []) {
  return Object.values(fields ?? {}).some((value) => value === 0x202020)
    || stackTop.some((slot) => slot.value === 0x202020);
}

function phase770HasCriticalZero(fields) {
  return PHASE770_CRITICAL_FIELDS.some((name) => fields?.[name] === 0);
}

function phase770DiffFields(before, after) {
  const diff = {};
  for (const name of Object.keys(after ?? {})) {
    if ((before?.[name] ?? null) !== after[name]) diff[name] = { before: before?.[name] ?? null, after: after[name] };
  }
  return diff;
}

function phase770Snapshot(record, pc, fields = null) {
  return {
    block: record?.totalBlocks ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPcRaw ?? null,
    cpu: phase770CpuRaw(),
    fields: fields ?? phase770ReadFields(),
    stackTop: phase770ReadStackSlots(8),
    vram: countVRAMPixels?.() ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? getColdbootEditLineDiagnostics?.() ?? null,
  };
}

function phase770CreateRecord(label) {
  return {
    label,
    config: { ...window.__phase770Config },
    totalBlocks: 0,
    prevPcRaw: null,
    prevPc: null,
    counts: Object.fromEntries(Object.keys(PHASE770_TARGETS).map((name) => [name, 0])),
    firstSamples: {},
    firstBlocks: [],
    lastBlocks: [],
    hotBlocks: {},
    fieldTransitions: [],
    firstCriticalZero: null,
    first202020: null,
    firstBadD007CA: null,
    firstD0243AChange: null,
    lastFields: null,
    expected: null,
  };
}

function phase770Read(label = 'read') {
  const fields = phase770ReadFields();
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase770CpuRaw(),
    fields,
    stackTop: phase770ReadStackSlots(8),
    diagnostics: window.__coldbootReadEditLineState?.() ?? getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase770PageErrors ?? [])],
  };
}

window.__phase770PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase770PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase770PageErrors.push(String(event.reason || event));
});

window.__phase770State = {
  records: [],
  configure(config) {
    window.__phase770Config = { ...window.__phase770Config, ...(config ?? {}) };
    return window.__phase770Config;
  },
  begin(label) {
    const record = phase770CreateRecord(label);
    this.records.push(record);
    record.start = phase770Read('start');
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
      record.end = phase770Read('end');
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([pc, count]) => ({ pc, count }));
      if (!record.firstCriticalZero && phase770HasCriticalZero(record.end.fields)) {
        record.firstCriticalZero = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.first202020 && phase770Has202020(record.end.fields, record.end.stackTop)) {
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
  read: phase770Read,
};
window.__phase770 = window.__phase770State;

const phase770OriginalGetColdbootControlPreStop = getColdbootControlPreStop;
getColdbootControlPreStop = function phase770GetColdbootControlPreStop(code) {
  if (code === 'KeyE' && window.__phase770Config?.preStopKeyE === true) {
    return { pc: ${KEYE_PRESTOP_PC}, label: '${KEYE_PRESTOP_LABEL}' };
  }
  return phase770OriginalGetColdbootControlPreStop(code);
};

const phase770OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase770ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  let record = window.__phase770State.records.at(-1);
  if (!record) {
    record = phase770CreateRecord('implicit');
    window.__phase770State.records.push(record);
  }

  record.totalBlocks += 1;
  const pcHex = phase770Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 80) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 160) record.lastBlocks.shift();

  const fieldsBefore = phase770ReadFields();
  const stackTop = phase770ReadStackSlots(8);
  const entryDiff = phase770DiffFields(record.lastFields, fieldsBefore);
  if (Object.keys(entryDiff).length && record.fieldTransitions.length < 120) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'entry-vs-previous-block',
      diff: entryDiff,
    });
  }

  if (!record.firstCriticalZero && phase770HasCriticalZero(fieldsBefore)) {
    record.firstCriticalZero = { source: 'observed-before-block', snapshot: phase770Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.first202020 && phase770Has202020(fieldsBefore, stackTop)) {
    record.first202020 = { source: 'observed-before-block', snapshot: phase770Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.firstBadD007CA && record.expected?.D007CA != null && fieldsBefore?.D007CA !== record.expected.D007CA) {
    record.firstBadD007CA = { source: 'observed-before-block', expected: record.expected.D007CA, snapshot: phase770Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.firstD0243AChange && record.expected?.D0243A != null && fieldsBefore?.D0243A !== record.expected.D0243A) {
    record.firstD0243AChange = { source: 'observed-before-block', expected: record.expected.D0243A, snapshot: phase770Snapshot(record, addr, fieldsBefore) };
  }

  for (const [name, target] of Object.entries(PHASE770_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = phase770Snapshot(record, addr, fieldsBefore);
  }

  const result = phase770OriginalObserveColdbootPersistenceBlock(state, pc);
  const fieldsAfter = phase770ReadFields();
  const hookDiff = phase770DiffFields(fieldsBefore, fieldsAfter);
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

function keyeKeyParams(type) {
  const params = {
    type,
    windowsVirtualKeyCode: 69,
    nativeVirtualKeyCode: 69,
    code: 'KeyE',
    key: 'e',
  };
  if (type === 'keyDown') {
    params.text = 'e';
    params.unmodifiedText = 'e';
  }
  return params;
}

function valueSetHasBadSignal(...values) {
  return values.some((value) => value === 0 || value === 0x202020);
}

function assess(result) {
  const key = result.after?.lastKey ?? {};
  const diag = result.after?.diagnostics ?? {};
  const counts = result.record?.counts ?? {};
  const pageErrorCount = (result.pageErrors?.length ?? 0) + (result.after?.pageErrors?.length ?? 0);
  const stoppedAtPrewipe = key.code === 'KeyE'
    && key.termination === 'control_pre_stop'
    && key.controlStopPc === KEYE_PRESTOP_PC
    && key.controlPreStopPc === KEYE_PRESTOP_PC;
  const saneHomeState = diag.D007CA === 0x0585E9
    && diag.D02590 === 0xD3FE81
    && diag.D008E0 !== 0
    && diag.D0243A === 0xD1A8CE
    && diag.D0243D === 0xD2A83E;
  const noZeroOrSpaceCorruption = !result.record?.firstCriticalZero
    && !result.record?.first202020
    && !valueSetHasBadSignal(key.D007CA, key.D008E0, key.D0243A, key.D0243D, key.D02590);
  const noWipeTail = (counts.cleanup001879 ?? 0) === 1 && (counts.cleanupTail0018f8 ?? 0) === 0;
  const noUnexpectedRestores = key.contextVectorRestoreEnabled === false
    && key.contextVectorRestored === false
    && key.controlStopCursorRestored === false;
  const vramNotWiped = (result.after?.vram ?? 0) >= Math.max(1, Math.floor((result.before?.vram ?? 0) * 0.75));
  const noPageErrors = pageErrorCount === 0;

  return {
    stoppedAtPrewipe,
    saneHomeState,
    cursorStayedAtBaseline: diag.D0243A === 0xD1A8CC,
    cursorMovedToKeyEObservedValue: diag.D0243A === 0xD1A8CE,
    noZeroOrSpaceCorruption,
    noWipeTail,
    noUnexpectedRestores,
    vramNotWiped,
    noPageErrors,
    safeCandidate: Boolean(
      result.strategy.preStopKeyE
      && stoppedAtPrewipe
      && saneHomeState
      && noZeroOrSpaceCorruption
      && noWipeTail
      && noUnexpectedRestores
      && vramNotWiped
      && noPageErrors
    ),
  };
}

async function runOneStrategy(strategy, pageUrl) {
  cdpErrors.length = 0;
  await cdp(ws, 'Page.navigate', { url: `${pageUrl}?phase770=${strategy.name}&t=${Date.now()}` });
  await waitFor(ws, 'document.readyState === "complete"', `page load ${strategy.name}`, 30000);
  await waitFor(ws, '!!window.__phase770 && !!window.getColdbootPersistenceDiagnostics', `phase770 instrumentation ${strategy.name}`, 30000);
  const browserConfig = await evalExpr(ws, `window.__phase770.configure(${JSON.stringify({
    preStopKeyE: strategy.preStopKeyE,
    stepCap: strategy.stepCap,
  })})`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, `coldboot completion ${strategy.name}`, 180000);
  const before = await evalExpr(ws, `window.__phase770.begin(${JSON.stringify(`phase770 ${strategy.name}`)})`, 30000);

  await cdp(ws, 'Input.dispatchKeyEvent', keyeKeyParams('keyDown'), 175000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyeKeyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'KeyE'`, `KeyE completion ${strategy.name}`, 30000);
  await sleep(150);

  const record = await evalExpr(ws, 'window.__phase770.finish()', 30000);
  const after = await evalExpr(ws, 'window.__phase770.read("after-finish")', 30000);
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
    probe: 'phase770-browser-keye-prestop-scope',
    chromePath,
    pageUrl,
    prestop: { code: 'KeyE', pc: KEYE_PRESTOP_PC, label: KEYE_PRESTOP_LABEL },
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
    '| Strategy | Pre-stop | Safe candidate | Termination | Steps | Stop | Last PC | D007CA | D008E0 | D02590 | D0243A | D0243D | VRAM | Wipe tail | Page errors |',
    '|---|---|---|---|---:|---|---|---|---|---|---|---|---:|---:|---:|',
    ...results.map((result) => {
      const a = result.assessment ?? {};
      const key = result.after?.lastKey ?? {};
      const diag = result.after?.diagnostics ?? {};
      const counts = result.record?.counts ?? {};
      const errors = (result.pageErrors?.length ?? 0) + (result.after?.pageErrors?.length ?? 0);
      return `| ${result.strategy.name} | ${result.strategy.preStopKeyE ? 'yes' : 'no'} | ${a.safeCandidate ? 'YES' : 'NO'} | ${key.termination ?? '-'} | ${key.steps ?? '-'} | ${fmtValue(key.controlStopPc)} | ${fmtValue(result.after?.lastPc)} | ${fmtValue(diag.D007CA)} | ${fmtValue(diag.D008E0)} | ${fmtValue(diag.D02590)} | ${fmtValue(diag.D0243A)} | ${fmtValue(diag.D0243D)} | ${result.after?.vram ?? '-'} | ${counts.cleanupTail0018f8 ?? 0} | ${errors} |`;
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
      `- Config: preStopKeyE=${result.strategy.preStopKeyE}, stepCap=${result.strategy.stepCap}.`,
      `- Assessment: stoppedAtPrewipe=${a.stoppedAtPrewipe}, saneHomeState=${a.saneHomeState}, cursorStayedAtBaseline=${a.cursorStayedAtBaseline}, cursorMovedToKeyEObservedValue=${a.cursorMovedToKeyEObservedValue}, noZeroOrSpaceCorruption=${a.noZeroOrSpaceCorruption}, noWipeTail=${a.noWipeTail}, noUnexpectedRestores=${a.noUnexpectedRestores}, vramNotWiped=${a.vramNotWiped}, noPageErrors=${a.noPageErrors}, safeCandidate=${a.safeCandidate}.`,
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
    lastBlocks: result.record?.lastBlocks ?? [],
    pageErrors: result.pageErrors ?? [],
  };
}

function buildReport(data) {
  const results = data?.results ?? [];
  const baseline = results.find((result) => result.strategy.name === 'baselineNoStop');
  const preStop = results.find((result) => result.strategy.name === 'preStop001879Only');
  const finding = data?.error
    ? `Probe failed: ${data.error.split('\n')[0]}`
    : preStop?.assessment?.safeCandidate
      ? 'KeyE pre-wipe stop at 0x001879 is bounded and preserves the home cx/VAT/cursor state without context-vector or cursor restore.'
      : `KeyE pre-wipe stop at 0x001879 did not meet exact patch-readiness criteria; safeCandidate=${preStop?.assessment?.safeCandidate ?? false}.`;
  const baselineLine = baseline
    ? `Baseline/no-stop: termination=${baseline.after?.lastKey?.termination}, steps=${baseline.after?.lastKey?.steps}, D007CA=${fmtValue(baseline.after?.diagnostics?.D007CA)}, D02590=${fmtValue(baseline.after?.diagnostics?.D02590)}, firstCriticalZero=${baseline.record?.firstCriticalZero?.source ?? 'none'}, cleanupTail=${baseline.record?.counts?.cleanupTail0018f8 ?? 0}.`
    : 'Baseline/no-stop strategy did not run.';
  const preStopLine = preStop
    ? `Pre-stop-only: termination=${preStop.after?.lastKey?.termination}, stop=${fmtValue(preStop.after?.lastKey?.controlStopPc)}, D007CA=${fmtValue(preStop.after?.diagnostics?.D007CA)}, D008E0=${fmtValue(preStop.after?.diagnostics?.D008E0)}, D02590=${fmtValue(preStop.after?.diagnostics?.D02590)}, D0243A=${fmtValue(preStop.after?.diagnostics?.D0243A)}, D0243D=${fmtValue(preStop.after?.diagnostics?.D0243D)}, VRAM=${preStop.after?.vram ?? '-'}, cleanupTail=${preStop.record?.counts?.cleanupTail0018f8 ?? 0}.`
    : 'Pre-stop-only strategy did not run.';
  const compact = data?.error ? { error: data.error } : {
    finding,
    prestop: data?.prestop,
    results: results.map(compactResult),
  };

  return [
    '# Phase 770 Browser KeyE Pre-Stop Scope',
    '',
    'Probe: `probe-phase770-browser-keye-prestop-scope.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase770-browser-keye-prestop-scope.mjs`',
    '',
    'Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyE`, and compares the phase769 no-stop corruption baseline against an in-memory `KeyE` control pre-stop at `0x001879`.',
    '',
    'This probe intentionally does not patch disk `browser-shell.html`; it tests whether a later disk patch can be limited to a control pre-stop with no context-vector restore or cursor restore.',
    '',
    '## Result',
    '',
    `- ${finding}`,
    `- ${baselineLine}`,
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
      controlStopPc: hex(result.after?.lastKey?.controlStopPc),
      controlPreStopLabel: result.after?.lastKey?.controlPreStopLabel,
      lastPc: hex(result.after?.lastPc),
      D007CA: hex(result.after?.diagnostics?.D007CA),
      D008E0: hex(result.after?.diagnostics?.D008E0),
      D02590: hex(result.after?.diagnostics?.D02590),
      D0243A: hex(result.after?.diagnostics?.D0243A),
      D0243D: hex(result.after?.diagnostics?.D0243D),
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
    probe: 'phase770-browser-keye-prestop-scope',
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

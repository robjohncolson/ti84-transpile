import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase783-browser-keyr-coverage-scope.md');
const debugPort = 9783;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase783-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const KEY_CODE = 'KeyR';
const KEY_CHAR = 'r';
const KEY_VK = 82;
const KEY_LABEL = 'STAT';
const KEYR_GETCSC_SCAN = 0x20;
const PRESTOP_PC = 0x001879;
const PRESTOP_LABEL = 'keyr-prewipe-stop';
const STRATEGIES = Object.freeze([
  { name: 'currentUnmapped', scanMapKeyR: false, preStopKeyR: false, stepCap: 60000 },
  { name: 'currentPreStop001879Only', scanMapKeyR: false, preStopKeyR: true, stepCap: 130000 },
  { name: 'mappedNoStop', scanMapKeyR: true, preStopKeyR: false, stepCap: 190000 },
  { name: 'mappedPreStop001879Only', scanMapKeyR: true, preStopKeyR: true, stepCap: 130000 },
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
  if (code === '${KEY_CODE}' && window.__phase783Config?.stepCap) return window.__phase783Config.stepCap;
  return code === EOL_PC_CODE
    ? Math.max(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS)
    : COLDBOOT_KEY_BURST_STEPS;
}`);
  if (patched === html) throw new Error('KeyR burst cap patch point not found');

  const injection = String.raw`
window.__phase783Config = {
  scanMapKeyR: false,
  preStopKeyR: false,
  stepCap: 60000,
};

const phase783_TARGETS = Object.freeze({
  reset000000: 0x000000,
  rst000038: 0x000038,
  coldIdle0019b5: 0x0019B5,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  sentinel001c33: 0x001C33,
  sentinel0158bc: 0x0158BC,
  postInsertGate0158de: 0x0158DE,
  display09efde: 0x09EFDE,
  display09efcb: 0x09EFCB,
  display09efe8: 0x09EFE8,
});

const phase783_FIELD_SPECS = Object.freeze([
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

const phase783_CRITICAL_FIELDS = Object.freeze(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590']);

function phase783Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase783ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase783ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(phase783_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase783ReadValue(mem, addr, len),
  ]));
}

function phase783ReadStackSlots(count = 8) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: phase783ReadValue(mem, addr, 3) };
  });
}

function phase783CpuRaw() {
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

function phase783HasCriticalZero(fields) {
  return phase783_CRITICAL_FIELDS.some((name) => fields?.[name] === 0);
}

function phase783Has202020(fields, stackTop = []) {
  return Object.values(fields ?? {}).some((value) => value === 0x202020)
    || stackTop.some((slot) => slot.value === 0x202020);
}

function phase783DiffFields(before, after) {
  const diff = {};
  for (const name of Object.keys(after ?? {})) {
    if ((before?.[name] ?? null) !== after[name]) diff[name] = { before: before?.[name] ?? null, after: after[name] };
  }
  return diff;
}

function phase783Snapshot(record, pc, fields = null) {
  return {
    block: record?.totalBlocks ?? 0,
    step: cpu?.stepCount ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPcRaw ?? null,
    cpu: phase783CpuRaw(),
    fields: fields ?? phase783ReadFields(),
    stackTop: phase783ReadStackSlots(8),
    vram: countVRAMPixels?.() ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? getColdbootEditLineDiagnostics?.() ?? null,
  };
}

function phase783CreateRecord(label) {
  return {
    label,
    config: { ...window.__phase783Config },
    totalBlocks: 0,
    prevPcRaw: null,
    prevPc: null,
    counts: Object.fromEntries(Object.keys(phase783_TARGETS).map((name) => [name, 0])),
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

function phase783Read(label = 'read') {
  const fields = phase783ReadFields();
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    keyMapHasKeyR: Boolean(KEY_MAP?.KeyR),
    scanCodeForKeyR: getScanCodeForPcCode('KeyR'),
    coorMonScanForKeyR: getCoorMonScanCodeForPcCode('KeyR'),
    keyState: kbd?.getKeyState?.() ?? null,
    cpu: phase783CpuRaw(),
    fields,
    stackTop: phase783ReadStackSlots(8),
    diagnostics: window.__coldbootReadEditLineState?.() ?? getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase783PageErrors ?? [])],
  };
}

window.__phase783PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase783PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase783PageErrors.push(String(event.reason || event));
});

window.__phase783State = {
  records: [],
  configure(config) {
    window.__phase783Config = { ...window.__phase783Config, ...(config ?? {}) };
    return window.__phase783Config;
  },
  begin(label) {
    const record = phase783CreateRecord(label);
    this.records.push(record);
    record.start = phase783Read('start');
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
      record.end = phase783Read('end');
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([pc, count]) => ({ pc, count }));
      if (!record.firstCriticalZero && phase783HasCriticalZero(record.end.fields)) {
        record.firstCriticalZero = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.first202020 && phase783Has202020(record.end.fields, record.end.stackTop)) {
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
  read: phase783Read,
};
window.__phase783 = window.__phase783State;

const phase783OriginalGetScanCodeForPcCode = getScanCodeForPcCode;
getScanCodeForPcCode = function phase783GetScanCodeForPcCode(code) {
  if (code === 'KeyR' && window.__phase783Config?.scanMapKeyR === true) return 0x20;
  return phase783OriginalGetScanCodeForPcCode(code);
};

const phase783OriginalGetColdbootControlPreStop = getColdbootControlPreStop;
getColdbootControlPreStop = function phase783GetColdbootControlPreStop(code) {
  if (code === 'KeyR' && window.__phase783Config?.preStopKeyR === true) {
    return { pc: 0x001879, label: 'keyr-prewipe-stop' };
  }
  return phase783OriginalGetColdbootControlPreStop(code);
};

const phase783OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase783ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  let record = window.__phase783State.records.at(-1);
  if (!record) {
    record = phase783CreateRecord('implicit');
    window.__phase783State.records.push(record);
  }

  record.totalBlocks += 1;
  const pcHex = phase783Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 80) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 160) record.lastBlocks.shift();

  const fieldsBefore = phase783ReadFields();
  const stackTop = phase783ReadStackSlots(8);
  const entryDiff = phase783DiffFields(record.lastFields, fieldsBefore);
  if (Object.keys(entryDiff).length && record.fieldTransitions.length < 200) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'entry-vs-previous-block',
      diff: entryDiff,
    });
  }

  if (!record.firstCriticalZero && phase783HasCriticalZero(fieldsBefore)) {
    record.firstCriticalZero = { source: 'observed-before-block', snapshot: phase783Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.first202020 && phase783Has202020(fieldsBefore, stackTop)) {
    record.first202020 = { source: 'observed-before-block', snapshot: phase783Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.firstBadD007CA && record.expected?.D007CA != null && fieldsBefore?.D007CA !== record.expected.D007CA) {
    record.firstBadD007CA = { source: 'observed-before-block', expected: record.expected.D007CA, snapshot: phase783Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.firstD0243AChange && record.expected?.D0243A != null && fieldsBefore?.D0243A !== record.expected.D0243A) {
    record.firstD0243AChange = { source: 'observed-before-block', expected: record.expected.D0243A, snapshot: phase783Snapshot(record, addr, fieldsBefore) };
  }

  for (const [name, target] of Object.entries(phase783_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = phase783Snapshot(record, addr, fieldsBefore);
  }

  const result = phase783OriginalObserveColdbootPersistenceBlock(state, pc);
  const fieldsAfter = phase783ReadFields();
  const hookDiff = phase783DiffFields(fieldsBefore, fieldsAfter);
  if (Object.keys(hookDiff).length && record.fieldTransitions.length < 200) {
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

function keyRParams(type) {
  const params = {
    type,
    windowsVirtualKeyCode: KEY_VK,
    nativeVirtualKeyCode: KEY_VK,
    code: KEY_CODE,
    key: KEY_CHAR,
  };
  if (type === 'keyDown') {
    params.text = KEY_CHAR;
    params.unmodifiedText = KEY_CHAR;
  }
  return params;
}

function hasBadValue(...values) {
  return values.some((value) => value === 0 || value === 0x202020);
}

function assess(result) {
  const key = result.after?.lastKey ?? {};
  const fields = result.after?.fields ?? {};
  const counts = result.record?.counts ?? {};
  const pageErrorCount = (result.pageErrors?.length ?? 0) + (result.after?.pageErrors?.length ?? 0);
  const beforeFields = result.before?.fields ?? {};
  const expectedCursor = beforeFields.D0243A ?? 0xD1A8CC;
  const stoppedAtPrewipe = key.code === KEY_CODE
    && key.termination === 'control_pre_stop'
    && key.controlStopPc === PRESTOP_PC
    && key.controlPreStopPc === PRESTOP_PC;
  const saneHomeState = fields.D007CA === 0x0585E9
    && fields.D008E0 === 0xD1A863
    && fields.D02590 === 0xD3FE81
    && fields.D0243A === expectedCursor
    && fields.D0243D === 0xD2A83E;
  const noZeroOrSpaceCorruption = !result.record?.firstCriticalZero
    && !result.record?.first202020
    && !hasBadValue(fields.D007CA, fields.D008E0, fields.D0243A, fields.D0243D, fields.D02590);
  const noWipeTail = (counts.cleanup001879 ?? 0) === 1 && (counts.cleanupTail0018f8 ?? 0) === 0;
  const vramNotWiped = (result.after?.vram ?? 0) >= Math.max(1, Math.floor((result.before?.vram ?? 0) * 0.75));
  const noUnexpectedRestores = key.contextVectorRestoreEnabled === false
    && key.contextVectorRestored === false
    && key.controlStopCursorRestored === false;
  const noPageErrors = pageErrorCount === 0;
  const currentMissingScan = !result.strategy.scanMapKeyR
    && result.before?.keyMapHasKeyR === true
    && result.before?.scanCodeForKeyR == null
    && result.before?.coorMonScanForKeyR === 0x37;
  const mappedHitsWipe = result.strategy.scanMapKeyR
    && !result.strategy.preStopKeyR
    && (counts.cleanup001879 ?? 0) === 1
    && (counts.cleanupTail0018f8 ?? 0) === 1
    && fields.D007CA === 0
    && fields.D02590 === 0;
  const safeCandidate = Boolean(
    result.strategy.preStopKeyR
    && stoppedAtPrewipe
    && saneHomeState
    && noZeroOrSpaceCorruption
    && noWipeTail
    && noUnexpectedRestores
    && vramNotWiped
    && noPageErrors
  );
  return {
    currentMissingScan,
    mappedHitsWipe,
    stoppedAtPrewipe,
    saneHomeState,
    noZeroOrSpaceCorruption,
    noWipeTail,
    noUnexpectedRestores,
    vramNotWiped,
    noPageErrors,
    safeCandidate,
  };
}

async function runOneStrategy(strategy, pageUrl) {
  cdpErrors.length = 0;
  await cdp(ws, 'Page.navigate', { url: `${pageUrl}?phase783=${strategy.name}&t=${Date.now()}` });
  await waitFor(ws, 'document.readyState === "complete"', `page load ${strategy.name}`, 30000);
  await waitFor(ws, '!!window.__phase783 && !!window.getColdbootPersistenceDiagnostics', `phase783 instrumentation ${strategy.name}`, 30000);
  const browserConfig = await evalExpr(ws, `window.__phase783.configure(${JSON.stringify(strategy)})`);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, `coldboot completion ${strategy.name}`, 180000);
  const before = await evalExpr(ws, `window.__phase783.begin(${JSON.stringify(`phase783 ${strategy.name}`)})`, 30000);

  await cdp(ws, 'Input.dispatchKeyEvent', keyRParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyRParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${KEY_CODE}'`, `KeyR completion ${strategy.name}`, 30000);
  await sleep(150);

  const record = await evalExpr(ws, 'window.__phase783.finish()', 30000);
  const after = await evalExpr(ws, 'window.__phase783.read("after-finish")', 30000);
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
    probe: 'phase783-browser-keyr-coverage-scope',
    chromePath,
    pageUrl,
    key: { code: KEY_CODE, char: KEY_CHAR, label: KEY_LABEL, scanCode: KEYR_GETCSC_SCAN },
    prestop: { pc: PRESTOP_PC, label: PRESTOP_LABEL },
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

function firstTransition(result, field) {
  return (result.record?.fieldTransitions ?? []).find((row) => Object.hasOwn(row.diff ?? {}, field)) ?? null;
}

function strategyTable(results) {
  return [
    '| Strategy | Scan map | Pre-stop | Classification flags | Termination | Steps | Stop | Last PC | D00587 | D007CA | D008E0 | D02590 | D0243A | D0243D | VRAM | Wipe tail | Page errors |',
    '|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|---:|---:|---:|',
    ...results.map((result) => {
      const a = result.assessment ?? {};
      const key = result.after?.lastKey ?? {};
      const fields = result.after?.fields ?? {};
      const counts = result.record?.counts ?? {};
      const errors = (result.pageErrors?.length ?? 0) + (result.after?.pageErrors?.length ?? 0);
      const flags = [
        a.currentMissingScan ? 'currentMissingScan' : null,
        a.mappedHitsWipe ? 'mappedHitsWipe' : null,
        a.safeCandidate ? 'safeCandidate' : null,
      ].filter(Boolean).join(', ') || '-';
      return `| ${result.strategy.name} | ${result.strategy.scanMapKeyR ? '0x20' : 'disk'} | ${result.strategy.preStopKeyR ? '0x001879' : 'no'} | ${flags} | ${key.termination ?? '-'} | ${key.steps ?? '-'} | ${fmtValue(key.controlStopPc)} | ${fmtValue(result.after?.lastPc)} | ${fmtValue(fields.D00587, 2)} | ${fmtValue(fields.D007CA)} | ${fmtValue(fields.D008E0)} | ${fmtValue(fields.D02590)} | ${fmtValue(fields.D0243A)} | ${fmtValue(fields.D0243D)} | ${result.after?.vram ?? '-'} | ${counts.cleanupTail0018f8 ?? 0} | ${errors} |`;
    }),
  ].join('\n');
}

function targetSummary(result) {
  const counts = result.record?.counts ?? {};
  return [
    'cleanup001879',
    'cleanupTail0018f8',
    'sentinel0158bc',
    'postInsertGate0158de',
    'display09efde',
  ].map((name) => `${name}=${counts[name] ?? 0}`).join(', ');
}

function detailSections(results) {
  return results.map((result) => {
    const key = result.after?.lastKey ?? {};
    const fields = result.after?.fields ?? {};
    const d007ca = firstTransition(result, 'D007CA');
    const d0243a = firstTransition(result, 'D0243A');
    return [
      `## Strategy: ${result.strategy.name}`,
      '',
      `- Config: scanMapKeyR=${result.strategy.scanMapKeyR}, preStopKeyR=${result.strategy.preStopKeyR}, stepCap=${result.strategy.stepCap}.`,
      `- Pre-run mapping: keyMapHasKeyR=${result.before?.keyMapHasKeyR}, coldbootScan=${fmtValue(result.before?.scanCodeForKeyR, 2)}, coorMonScan=${fmtValue(result.before?.coorMonScanForKeyR, 2)}.`,
      `- Assessment: ${JSON.stringify(result.assessment)}.`,
      `- Key result: label=${key.label ?? '-'}, termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, controlStop=${fmtValue(key.controlStopPc)}, controlLabel=${key.controlPreStopLabel ?? '-'}, contextRestoreEnabled=${key.contextVectorRestoreEnabled}, contextRestored=${key.contextVectorRestored}, cursorRestored=${key.controlStopCursorRestored}.`,
      `- Final fields: D00587=${fmtValue(fields.D00587, 2)}, D007CA=${fmtValue(fields.D007CA)}, D008E0=${fmtValue(fields.D008E0)}, D02590=${fmtValue(fields.D02590)}, D0243A=${fmtValue(fields.D0243A)}, D0243D=${fmtValue(fields.D0243D)}, VRAM=${result.after?.vram ?? '-'}, pageErrors=${(result.pageErrors?.length ?? 0) + (result.after?.pageErrors?.length ?? 0)}.`,
      d007ca ? `- First D007CA transition: block ${d007ca.block}, prevPc=${d007ca.prevPc ?? '-'}, nextPc=${d007ca.pc}, ${fmtValue(d007ca.diff.D007CA.before)}->${fmtValue(d007ca.diff.D007CA.after)}.` : '- First D007CA transition: none captured.',
      d0243a ? `- First D0243A transition: block ${d0243a.block}, prevPc=${d0243a.prevPc ?? '-'}, nextPc=${d0243a.pc}, ${fmtValue(d0243a.diff.D0243A.before)}->${fmtValue(d0243a.diff.D0243A.after)}.` : '- First D0243A transition: none captured.',
      `- Target hits: ${targetSummary(result)}.`,
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
      keyMapHasKeyR: result.before?.keyMapHasKeyR,
      scanCodeForKeyR: result.before?.scanCodeForKeyR,
      coorMonScanForKeyR: result.before?.coorMonScanForKeyR,
      fields: fmtFields(result.before?.fields),
      vram: result.before?.vram,
    },
    after: {
      status: result.after?.status,
      lastPc: fmtValue(result.after?.lastPc),
      fields: fmtFields(result.after?.fields),
      lastKey: result.after?.lastKey,
      pageErrors: result.after?.pageErrors,
    },
    targetCounts: result.record?.counts ?? {},
    hotBlocks: result.record?.hotBlocks ?? [],
    firstCriticalZero: result.record?.firstCriticalZero ?? null,
    first202020: result.record?.first202020 ?? null,
    d007caTransitions: (result.record?.fieldTransitions ?? []).filter((row) => Object.hasOwn(row.diff ?? {}, 'D007CA')),
    cursorTransitions: (result.record?.fieldTransitions ?? []).filter((row) => Object.hasOwn(row.diff ?? {}, 'D0243A')),
    lastBlocks: result.record?.lastBlocks ?? [],
    pageErrors: result.pageErrors ?? [],
  };
}

function buildReport(data) {
  const results = data?.results ?? [];
  const current = results.find((result) => result.strategy.name === 'currentUnmapped');
  const currentPreStop = results.find((result) => result.strategy.name === 'currentPreStop001879Only');
  const mappedNoStop = results.find((result) => result.strategy.name === 'mappedNoStop');
  const mappedPreStop = results.find((result) => result.strategy.name === 'mappedPreStop001879Only');
  const finding = data?.error
    ? `Probe failed: ${data.error.split('\n')[0]}`
    : currentPreStop?.assessment?.safeCandidate
      ? 'KeyR already reaches the 0x001879 wipe path through the current disk matrix path; a pre-stop-only treatment is patch-ready, and adding a coldboot scan-code mapping is not required for this fix.'
      : mappedPreStop?.assessment?.safeCandidate
        ? 'KeyR requires both a coldboot scan-code mapping and the 0x001879 pre-stop to become patch-ready.'
      : 'KeyR did not meet patch-readiness criteria in this probe.';
  const currentLine = current
    ? `Current disk mapping: keyMapHasKeyR=${current.before?.keyMapHasKeyR}, coldbootScan=${fmtValue(current.before?.scanCodeForKeyR, 2)}, coorMonScan=${fmtValue(current.before?.coorMonScanForKeyR, 2)}, termination=${current.after?.lastKey?.termination}, steps=${current.after?.lastKey?.steps}, cleanupTail=${current.record?.counts?.cleanupTail0018f8 ?? 0}.`
    : 'Current/unmapped strategy did not run.';
  const currentPreStopLine = currentPreStop
    ? `Current/pre-stop-only: termination=${currentPreStop.after?.lastKey?.termination}, stop=${fmtValue(currentPreStop.after?.lastKey?.controlStopPc)}, D007CA=${fmtValue(currentPreStop.after?.fields?.D007CA)}, D008E0=${fmtValue(currentPreStop.after?.fields?.D008E0)}, D02590=${fmtValue(currentPreStop.after?.fields?.D02590)}, D0243A=${fmtValue(currentPreStop.after?.fields?.D0243A)}, D0243D=${fmtValue(currentPreStop.after?.fields?.D0243D)}, VRAM=${currentPreStop.after?.vram ?? '-'}, cleanupTail=${currentPreStop.record?.counts?.cleanupTail0018f8 ?? 0}.`
    : 'Current/pre-stop-only strategy did not run.';
  const mappedLine = mappedNoStop
    ? `Mapped/no-stop: termination=${mappedNoStop.after?.lastKey?.termination}, steps=${mappedNoStop.after?.lastKey?.steps}, D007CA=${fmtValue(mappedNoStop.after?.fields?.D007CA)}, D02590=${fmtValue(mappedNoStop.after?.fields?.D02590)}, firstCriticalZero=${mappedNoStop.record?.firstCriticalZero?.source ?? 'none'}, cleanupTail=${mappedNoStop.record?.counts?.cleanupTail0018f8 ?? 0}.`
    : 'Mapped/no-stop strategy did not run.';
  const preStopLine = mappedPreStop
    ? `Mapped/pre-stop-only: termination=${mappedPreStop.after?.lastKey?.termination}, stop=${fmtValue(mappedPreStop.after?.lastKey?.controlStopPc)}, D007CA=${fmtValue(mappedPreStop.after?.fields?.D007CA)}, D008E0=${fmtValue(mappedPreStop.after?.fields?.D008E0)}, D02590=${fmtValue(mappedPreStop.after?.fields?.D02590)}, D0243A=${fmtValue(mappedPreStop.after?.fields?.D0243A)}, D0243D=${fmtValue(mappedPreStop.after?.fields?.D0243D)}, VRAM=${mappedPreStop.after?.vram ?? '-'}, cleanupTail=${mappedPreStop.record?.counts?.cleanupTail0018f8 ?? 0}.`
    : 'Mapped/pre-stop-only strategy did not run.';
  const compact = data?.error ? { error: data.error } : {
    finding,
    key: data?.key,
    prestop: data?.prestop,
    results: results.map(compactResult),
  };

  return [
    '# Phase 783 Browser KeyR Coverage Scope',
    '',
    'Probe: `probe-phase783-browser-keyr-coverage-scope.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase783-browser-keyr-coverage-scope.mjs`',
    '',
    'Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyR` / `STAT`, and classifies the first coverage-sweep key.',
    '',
    'The probe compares the current disk behavior against an in-memory coldboot scan-code mapping (`KeyR -> 0x20`) and an in-memory `0x001879` control pre-stop. It intentionally does not patch disk `browser-shell.html`.',
    '',
    '## Result',
    '',
    `- ${finding}`,
    `- ${currentLine}`,
    `- ${currentPreStopLine}`,
    `- ${mappedLine}`,
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
      keyMapHasKeyR: result.before?.keyMapHasKeyR,
      scanCodeForKeyR: result.before?.scanCodeForKeyR,
      coorMonScanForKeyR: result.before?.coorMonScanForKeyR,
      termination: result.after?.lastKey?.termination,
      steps: result.after?.lastKey?.steps,
      controlStopPc: hex(result.after?.lastKey?.controlStopPc),
      controlPreStopLabel: result.after?.lastKey?.controlPreStopLabel,
      lastPc: hex(result.after?.lastPc),
      D00587: hex(result.after?.fields?.D00587, 2),
      D007CA: hex(result.after?.fields?.D007CA),
      D008E0: hex(result.after?.fields?.D008E0),
      D02590: hex(result.after?.fields?.D02590),
      D0243A: hex(result.after?.fields?.D0243A),
      D0243D: hex(result.after?.fields?.D0243D),
      firstCriticalZero: result.record?.firstCriticalZero?.source ?? null,
      first202020: result.record?.first202020?.source ?? null,
      targetCounts: Object.fromEntries(Object.entries(result.record?.counts ?? {}).filter(([, value]) => value)),
      hotBlocks: result.record?.hotBlocks?.slice(0, 10) ?? [],
      pageErrors: [...(result.pageErrors ?? []), ...(result.after?.pageErrors ?? [])],
    })),
  }, null, 2));
} catch (error) {
  summary = {
    probe: 'phase783-browser-keyr-coverage-scope',
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

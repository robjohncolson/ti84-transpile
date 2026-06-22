import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase772-browser-keyn-corruption-trace.md');
const debugPort = 9772;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase772-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));
const KEYN_TRACE_STEP_CAP = 190000;

let nextId = 1;
const pending = new Map();
const cdpPageErrors = [];
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
  const patchedHtml = html.replace(burstRegex, `function getColdbootKeyBurstStepsForCode(code) {
  if (code === 'KeyN') return ${KEYN_TRACE_STEP_CAP};
  return code === EOL_PC_CODE
    ? Math.max(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS)
    : COLDBOOT_KEY_BURST_STEPS;
}`);
  if (patchedHtml === html) throw new Error('KeyN trace cap patch point not found');

  const injection = String.raw`
window.__phase772TraceStepCap = ${KEYN_TRACE_STEP_CAP};

const phase772_TARGETS = Object.freeze({
  reset000000: 0x000000,
  rst000038: 0x000038,
  low000a92: 0x000A92,
  low000b7c: 0x000B7C,
  coldIdle0019b5: 0x0019B5,
  wipe0019be: 0x0019BE,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  sentinel001c33: 0x001C33,
  sentinel0158bc: 0x0158BC,
  postInsertGate0158de: 0x0158DE,
  cursorOwner05e348: 0x05E348,
  cursorNext05e372: 0x05E372,
  eolOwner0a229d: 0x0A229D,
  eolTail0a22a4: 0x0A22A4,
  spaceFillBridge0a2a37: 0x0A2A37,
  vectorOwner08c782: 0x08C782,
  vectorRestore06c764: 0x06C764,
  alternateCxMain06c92c: 0x06C92C,
  cxDispatchWrapper08c72f: 0x08C72F,
  cxJpTrampoline08c745: 0x08C745,
  display09efde: 0x09EFDE,
  display09efcb: 0x09EFCB,
  display09efe8: 0x09EFE8,
  tokenOuter08f3b8: 0x08F3B8,
  tokenTuple08f54b: 0x08F54B,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
});

const phase772_FIELD_SPECS = Object.freeze([
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

const phase772_CRITICAL_FIELDS = Object.freeze(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590']);

function phase772Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase772ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase772ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(phase772_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase772ReadValue(mem, addr, len),
  ]));
}

function phase772ReadStackSlots(count = 8) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: phase772ReadValue(mem, addr, 3) };
  });
}

function phase772CpuRaw() {
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

function phase772Has202020(fields, stackTop = []) {
  return Object.values(fields ?? {}).some((value) => value === 0x202020)
    || stackTop.some((slot) => slot.value === 0x202020);
}

function phase772HasCriticalZero(fields) {
  return phase772_CRITICAL_FIELDS.some((name) => fields?.[name] === 0);
}

function phase772DiffFields(before, after) {
  const diff = {};
  for (const name of Object.keys(after ?? {})) {
    if ((before?.[name] ?? null) !== after[name]) diff[name] = { before: before?.[name] ?? null, after: after[name] };
  }
  return diff;
}

function phase772Snapshot(record, pc, fields = null) {
  const cpuRaw = phase772CpuRaw();
  return {
    block: record?.totalBlocks ?? 0,
    step: cpuRaw?.stepCount ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPcRaw ?? null,
    cpu: cpuRaw,
    fields: fields ?? phase772ReadFields(),
    stackTop: phase772ReadStackSlots(8),
    vram: countVRAMPixels?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    editLine: window.__coldbootReadEditLineState?.() ?? getColdbootEditLineDiagnostics?.() ?? null,
  };
}

function phase772TailSnapshot(record, pc, fields) {
  const cpuRaw = phase772CpuRaw();
  const mem = cpu?.memory;
  const stack0 = mem ? phase772ReadValue(mem, cpuRaw?.sp ?? 0, 3) : null;
  return {
    block: record.totalBlocks,
    step: cpuRaw?.stepCount ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record.prevPcRaw,
    bc: cpuRaw?.bc ?? 0,
    hl: cpuRaw?.hl ?? 0,
    de: cpuRaw?.de ?? 0,
    sp: cpuRaw?.sp ?? 0,
    stack0,
    D007CA: fields?.D007CA ?? null,
    D008E0: fields?.D008E0 ?? null,
    D0243A: fields?.D0243A ?? null,
    D0243D: fields?.D0243D ?? null,
    D02590: fields?.D02590 ?? null,
    D0058C: fields?.D0058C ?? null,
    D0058D: fields?.D0058D ?? null,
    D0058E: fields?.D0058E ?? null,
  };
}

function phase772CreateRecord(label) {
  return {
    label,
    start: null,
    end: null,
    totalBlocks: 0,
    prevPcRaw: null,
    prevPc: null,
    firstBlocks: [],
    lastBlocks: [],
    tailSnapshots: [],
    hotBlocks: {},
    regionCounts: {
      low000000_006fff: 0,
      cleanup001000_001fff: 0,
      display09e000_0a2fff: 0,
      token08f000_090fff: 0,
      near0a2100_0a23ff: 0,
    },
    counts: Object.fromEntries(Object.keys(phase772_TARGETS).map((name) => [name, 0])),
    firstSamples: {},
    targetSamples: [],
    fieldTransitions: [],
    firstCriticalZero: null,
    first202020: null,
    firstBadD007CA: null,
    firstD0243AChange: null,
    lastFields: null,
    expected: null,
  };
}

function phase772Read(label = 'read') {
  const fields = phase772ReadFields();
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase772CpuRaw(),
    fields,
    stackTop: phase772ReadStackSlots(8),
    editLine: window.__coldbootReadEditLineState?.() ?? getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase772PageErrors ?? [])],
  };
}

window.__phase772PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase772PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase772PageErrors.push(String(event.reason || event));
});

window.__phase772State = {
  records: [],
  begin(label) {
    const record = phase772CreateRecord(label);
    this.records.push(record);
    record.start = phase772Read('start');
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
      record.end = phase772Read('end');
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80)
        .map(([pc, count]) => ({ pc, count }));
      if (!record.first202020 && phase772Has202020(record.end.fields, record.end.stackTop)) {
        record.first202020 = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.firstCriticalZero && phase772HasCriticalZero(record.end.fields)) {
        record.firstCriticalZero = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.firstBadD007CA && record.expected?.D007CA != null && record.end.fields?.D007CA !== record.expected.D007CA) {
        record.firstBadD007CA = { source: 'final-state-only', expected: record.expected.D007CA, snapshot: record.end };
      }
    }
    return record;
  },
  read: phase772Read,
};
window.__phase772 = window.__phase772State;

const phase772OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase772ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  let record = window.__phase772State.records.at(-1);
  if (!record) {
    record = phase772CreateRecord('implicit');
    window.__phase772State.records.push(record);
  }

  record.totalBlocks += 1;
  const pcHex = phase772Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 96) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 384) record.lastBlocks.shift();

  if (addr <= 0x006FFF) record.regionCounts.low000000_006fff += 1;
  if (addr >= 0x001000 && addr <= 0x001FFF) record.regionCounts.cleanup001000_001fff += 1;
  if (addr >= 0x09E000 && addr <= 0x0A2FFF) record.regionCounts.display09e000_0a2fff += 1;
  if (addr >= 0x08F000 && addr <= 0x090FFF) record.regionCounts.token08f000_090fff += 1;
  if (addr >= 0x0A2100 && addr <= 0x0A23FF) record.regionCounts.near0a2100_0a23ff += 1;

  const fields = phase772ReadFields();
  const stackTop = phase772ReadStackSlots(8);
  const tail = phase772TailSnapshot(record, addr, fields);
  record.tailSnapshots.push(tail);
  if (record.tailSnapshots.length > 384) record.tailSnapshots.shift();

  const entryDiff = phase772DiffFields(record.lastFields, fields);
  if (Object.keys(entryDiff).length && record.fieldTransitions.length < 360) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'entry-vs-previous-block',
      diff: entryDiff,
    });
  }

  if (!record.firstCriticalZero && phase772HasCriticalZero(fields)) {
    record.firstCriticalZero = {
      source: 'observed-before-block',
      snapshot: phase772Snapshot(record, addr, fields),
    };
  }

  if (!record.first202020 && phase772Has202020(fields, stackTop)) {
    record.first202020 = {
      source: 'observed-before-block',
      snapshot: phase772Snapshot(record, addr, fields),
    };
  }

  if (!record.firstBadD007CA && record.expected?.D007CA != null && fields?.D007CA !== record.expected.D007CA) {
    record.firstBadD007CA = {
      source: 'observed-before-block',
      expected: record.expected.D007CA,
      snapshot: phase772Snapshot(record, addr, fields),
    };
  }

  if (!record.firstD0243AChange && record.expected?.D0243A != null && fields?.D0243A !== record.expected.D0243A) {
    record.firstD0243AChange = {
      source: 'observed-before-block',
      expected: record.expected.D0243A,
      snapshot: phase772Snapshot(record, addr, fields),
    };
  }

  for (const [name, target] of Object.entries(phase772_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = phase772Snapshot(record, addr, fields);
    if (record.targetSamples.length < 140) record.targetSamples.push({ target: name, ...record.firstSamples[name] });
  }

  const result = phase772OriginalObserveColdbootPersistenceBlock(state, pc);
  const afterHookFields = phase772ReadFields();
  const hookDiff = phase772DiffFields(fields, afterHookFields);
  if (Object.keys(hookDiff).length && record.fieldTransitions.length < 360) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'after-persistence-hook',
      diff: hookDiff,
    });
  }
  if (!record.firstCriticalZero && phase772HasCriticalZero(afterHookFields)) {
    record.firstCriticalZero = {
      source: 'after-persistence-hook',
      snapshot: phase772Snapshot(record, addr, afterHookFields),
    };
  }
  if (!record.first202020 && phase772Has202020(afterHookFields, phase772ReadStackSlots(8))) {
    record.first202020 = {
      source: 'after-persistence-hook',
      snapshot: phase772Snapshot(record, addr, afterHookFields),
    };
  }

  record.lastFields = afterHookFields;
  record.prevPcRaw = addr;
  record.prevPc = pcHex;
  return result;
};
`;

  return patchedHtml.replace(marker, `${injection}\n\n${marker}`);
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
      cdpPageErrors.push(msg.params?.exceptionDetails?.exception?.description
        || msg.params?.exceptionDetails?.text
        || JSON.stringify(msg.params?.exceptionDetails || {}));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      cdpPageErrors.push(msg.params.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ') || 'console error');
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

function keyNKeyParams(type) {
  const params = {
    type,
    windowsVirtualKeyCode: 78,
    nativeVirtualKeyCode: 78,
    code: 'KeyN',
    key: 'n',
  };
  if (type === 'keyDown') {
    params.text = 'n';
    params.unmodifiedText = 'n';
  }
  return params;
}

async function runTrace() {
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
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(ws, '!!window.__phase772 && !!window.getColdbootPersistenceDiagnostics', 'phase772 instrumentation', 30000);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  const before = await evalExpr(ws, `window.__phase772.begin('KeyN corruption trace')`, 30000);

  await cdp(ws, 'Input.dispatchKeyEvent', keyNKeyParams('keyDown'), 175000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyNKeyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'KeyN'`, 'KeyN completion', 30000);
  await sleep(250);
  const record = await evalExpr(ws, 'window.__phase772.finish()', 120000);
  const after = await evalExpr(ws, 'window.__phase772.read("after-finish")', 120000);

  return {
    probe: 'phase772-browser-keyn-corruption-trace',
    chromePath,
    pageUrl,
    traceStepCap: KEYN_TRACE_STEP_CAP,
    before,
    record,
    after,
    cdpPageErrors,
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

function compactSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    source: snapshot.source,
    expected: fmtValue(snapshot.expected),
    block: snapshot.block,
    step: snapshot.step,
    pc: fmtValue(snapshot.pc),
    prevPc: fmtValue(snapshot.prevPc),
    cpu: fmtCpu(snapshot.cpu),
    fields: fmtFields(snapshot.fields),
    stackTop: (snapshot.stackTop ?? []).slice(0, 8).map((slot) => ({
      addr: fmtValue(slot.addr),
      value: fmtValue(slot.value),
    })),
    vram: snapshot.vram,
  };
}

function compactTail(tail) {
  return {
    block: tail.block,
    step: tail.step,
    pc: fmtValue(tail.pc),
    prevPc: fmtValue(tail.prevPc),
    bc: fmtValue(tail.bc),
    hl: fmtValue(tail.hl),
    de: fmtValue(tail.de),
    sp: fmtValue(tail.sp),
    stack0: fmtValue(tail.stack0),
    D007CA: fmtValue(tail.D007CA),
    D008E0: fmtValue(tail.D008E0),
    D0243A: fmtValue(tail.D0243A),
    D0243D: fmtValue(tail.D0243D),
    D02590: fmtValue(tail.D02590),
    D0058C: fmtValue(tail.D0058C, 2),
    D0058D: fmtValue(tail.D0058D, 2),
    D0058E: fmtValue(tail.D0058E, 2),
  };
}

function compactRecord(record) {
  return {
    totalBlocks: record?.totalBlocks ?? 0,
    regionCounts: record?.regionCounts ?? {},
    targetCounts: Object.fromEntries(Object.entries(record?.counts ?? {}).filter(([, value]) => value)),
    firstSamples: Object.fromEntries(Object.entries(record?.firstSamples ?? {}).map(([name, value]) => [name, compactSnapshot(value)])),
    firstCriticalZero: record?.firstCriticalZero ? {
      source: record.firstCriticalZero.source,
      snapshot: compactSnapshot(record.firstCriticalZero.snapshot),
    } : null,
    first202020: record?.first202020 ? {
      source: record.first202020.source,
      snapshot: compactSnapshot(record.first202020.snapshot),
    } : null,
    firstBadD007CA: record?.firstBadD007CA ? {
      source: record.firstBadD007CA.source,
      expected: fmtValue(record.firstBadD007CA.expected),
      snapshot: compactSnapshot(record.firstBadD007CA.snapshot),
    } : null,
    firstD0243AChange: record?.firstD0243AChange ? {
      source: record.firstD0243AChange.source,
      expected: fmtValue(record.firstD0243AChange.expected),
      snapshot: compactSnapshot(record.firstD0243AChange.snapshot),
    } : null,
    hotBlocks: record?.hotBlocks ?? [],
    firstBlocks: record?.firstBlocks ?? [],
    lastBlocks: record?.lastBlocks ?? [],
    tailSnapshots: (record?.tailSnapshots ?? []).slice(-80).map(compactTail),
    fieldTransitions: (record?.fieldTransitions ?? []).slice(-120).map((transition) => ({
      block: transition.block,
      pc: transition.pc,
      prevPc: transition.prevPc,
      timing: transition.timing,
      diff: Object.fromEntries(Object.entries(transition.diff ?? {}).map(([name, value]) => [
        name,
        { before: fmtValue(value.before), after: fmtValue(value.after) },
      ])),
    })),
  };
}

function classifyRoute(record) {
  const counts = record?.counts ?? {};
  const vectorHits = (counts.vectorOwner08c782 ?? 0) + (counts.vectorRestore06c764 ?? 0);
  const clearHits = (counts.eolOwner0a229d ?? 0) + (counts.eolTail0a22a4 ?? 0) + (counts.spaceFillBridge0a2a37 ?? 0);
  const wipeHits = (counts.cleanup001879 ?? 0) + (counts.cleanupTail0018f8 ?? 0) + (counts.wipe0019be ?? 0);
  if (vectorHits) return 'same 0x08C782 -> 0x06C764 context-vector owner class';
  if ((counts.spaceFillBridge0a2a37 ?? 0) && wipeHits) return 'CLEAR-adjacent 0x0A2A37 space-fill bridge followed by cleanup/wipe 0x001879 -> 0x0018F8';
  if (clearHits) return 'CLEAR-class 0x0A229D/0x0A22A4/0x0A2A37 path';
  if (wipeHits) return 'cleanup/wipe path through 0x001879/0x0018F8';
  return 'new/unknown owner class in tracked targets';
}

function inferFinding(data) {
  if (data?.error) return `Probe failed: ${data.error.split('\n')[0]}`;
  const record = data.record ?? {};
  const after = data.after ?? record.end ?? {};
  const key = after.lastKey ?? {};
  const route = classifyRoute(record);
  const firstZero = record.firstCriticalZero;
  const firstD007CA = record.firstBadD007CA;
  const first202020 = record.first202020;
  const hot = (record.hotBlocks ?? []).slice(0, 5).map((row) => `${row.pc}x${row.count}`).join(', ');
  const corruptionBits = [
    firstZero ? `first critical zero at ${fmtValue(firstZero.snapshot?.pc)} after ${fmtValue(firstZero.snapshot?.prevPc)}` : null,
    first202020 ? `first 0x202020 at ${fmtValue(first202020.snapshot?.pc)} after ${fmtValue(first202020.snapshot?.prevPc)}` : null,
    firstD007CA ? `first D007CA divergence at ${fmtValue(firstD007CA.snapshot?.pc)} after ${fmtValue(firstD007CA.snapshot?.prevPc)}` : null,
  ].filter(Boolean).join('; ') || 'no zero/0x202020 signal before final read';
  return `KeyN ends with termination=${key.termination ?? 'n/a'}, lastPc=${fmtValue(after.lastPc)}, classified as ${route}; ${corruptionBits}; hot tail ${hot || 'none'}.`;
}

function targetTable(record) {
  const counts = record?.counts ?? {};
  const samples = record?.firstSamples ?? {};
  return [
    '| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] |',
    '|---|---:|---:|---|---|---|---|---|---|---|',
    ...Object.keys(counts).map((name) => {
      const sample = samples[name];
      return `| ${name} | ${counts[name] ?? 0} | ${sample?.block ?? '-'} | ${fmtValue(sample?.pc)} | ${fmtValue(sample?.prevPc)} | ${fmtValue(sample?.cpu?.bc)} | ${fmtValue(sample?.cpu?.hl)} | ${fmtValue(sample?.cpu?.de)} | ${fmtValue(sample?.cpu?.sp)} | ${fmtValue(sample?.stackTop?.[0]?.value)} |`;
    }),
  ].join('\n');
}

function candidateScopeLines(record) {
  const counts = record?.counts ?? {};
  const pre = record?.firstSamples?.cleanup001879 ?? null;
  const tail = record?.firstSamples?.cleanupTail0018f8 ?? null;
  const cursor = record?.firstD0243AChange ?? null;
  const vectorHits = (counts.vectorOwner08c782 ?? 0) + (counts.vectorRestore06c764 ?? 0);
  if (!pre && !tail) {
    return ['- Candidate stop/restore fields: no cleanup pre-stop/tail sample was captured.'];
  }
  const preFields = pre?.fields ?? {};
  const tailFields = tail?.fields ?? {};
  const stopLine = pre
    ? `- Candidate stop: \`0x001879\` before the wipe tail. At that block the core fields are still live: D007CA=${fmtValue(preFields.D007CA)}, D008E0=${fmtValue(preFields.D008E0)}, D0243A=${fmtValue(preFields.D0243A)}, D0243D=${fmtValue(preFields.D0243D)}, D02590=${fmtValue(preFields.D02590)}.`
    : '- Candidate stop: cleanup pre-stop `0x001879` was not sampled.';
  const tailLine = tail
    ? `- Wipe tail evidence: the next tracked block \`0x0018F8\` has D007CA=${fmtValue(tailFields.D007CA)}, D008E0=${fmtValue(tailFields.D008E0)}, D0243A=${fmtValue(tailFields.D0243A)}, D0243D=${fmtValue(tailFields.D0243D)}, D02590=${fmtValue(tailFields.D02590)}.`
    : '- Wipe tail evidence: cleanup tail `0x0018F8` was not sampled.';
  const restoreLine = `- Candidate restore scope: vector-owner hits are ${vectorHits}, so no context-vector restore is indicated by this trace. D0243A already changes before cleanup${cursor?.snapshot ? ` (first ${fmtValue(cursor.expected)}->${fmtValue(cursor.snapshot.fields?.D0243A)} at ${fmtValue(cursor.snapshot.pc)} after ${fmtValue(cursor.snapshot.prevPc)})` : ''}; the next A/B should test KeyN pre-stop-only before restoring cursor or context fields.`;
  return [stopLine, tailLine, restoreLine];
}

function tailTable(record) {
  const snapshots = (record?.tailSnapshots ?? []).slice(-56);
  if (!snapshots.length) return '_No tail snapshots captured._';
  return [
    '| Block | Step | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D008E0 | D0243A | D02590 | Key bytes |',
    '|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...snapshots.map((s) => `| ${s.block} | ${s.step} | ${fmtValue(s.pc)} | ${fmtValue(s.prevPc)} | ${fmtValue(s.bc)} | ${fmtValue(s.hl)} | ${fmtValue(s.de)} | ${fmtValue(s.sp)} | ${fmtValue(s.stack0)} | ${fmtValue(s.D007CA)} | ${fmtValue(s.D008E0)} | ${fmtValue(s.D0243A)} | ${fmtValue(s.D02590)} | ${fmtValue(s.D0058C, 2)}/${fmtValue(s.D0058D, 2)}/${fmtValue(s.D0058E, 2)} |`),
  ].join('\n');
}

function transitionTable(record) {
  const interesting = new Set(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590', 'D0058C', 'D0058D', 'D0058E']);
  const rows = (record?.fieldTransitions ?? [])
    .filter((transition) => Object.keys(transition.diff ?? {}).some((name) => interesting.has(name)))
    .slice(-60);
  if (!rows.length) return '_No tracked field transitions captured._';
  return [
    '| Block | PC | Prev PC | Timing | Diffs |',
    '|---:|---|---|---|---|',
    ...rows.map((transition) => {
      const diffs = Object.entries(transition.diff ?? {})
        .filter(([name]) => interesting.has(name))
        .map(([name, value]) => `${name}:${fmtValue(value.before)}->${fmtValue(value.after)}`)
        .join('; ');
      return `| ${transition.block} | ${transition.pc} | ${transition.prevPc ?? '-'} | ${transition.timing} | ${diffs.replaceAll('|', '\\|')} |`;
    }),
  ].join('\n');
}

function hotBlockTable(record) {
  const rows = (record?.hotBlocks ?? []).slice(0, 35);
  if (!rows.length) return '_No hot blocks captured._';
  return [
    '| PC | Hits |',
    '|---|---:|',
    ...rows.map((row) => `| ${row.pc} | ${row.count} |`),
  ].join('\n');
}

function buildReport(data) {
  const finding = inferFinding(data);
  const record = data?.record ?? {};
  const before = data?.before ?? {};
  const after = data?.after ?? record.end ?? {};
  const key = after.lastKey ?? {};
  const compact = data?.error ? { error: data.error } : {
    finding,
    before: {
      status: before.status,
      lastPc: fmtValue(before.lastPc),
      fields: fmtFields(before.fields),
      vram: before.vram,
    },
    after: {
      status: after.status,
      lastPc: fmtValue(after.lastPc),
      cpu: fmtCpu(after.cpu),
      fields: fmtFields(after.fields),
      lastKey: key,
      stackTop: (after.stackTop ?? []).slice(0, 8).map((slot) => ({
        addr: fmtValue(slot.addr),
        value: fmtValue(slot.value),
      })),
    },
    record: compactRecord(record),
    cdpPageErrors: data.cdpPageErrors ?? [],
  };

  return [
    '# Phase 772 Browser KeyN Corruption Trace',
    '',
    'Probe: `probe-phase772-browser-keyn-corruption-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase772-browser-keyn-corruption-trace.mjs`',
    '',
    'Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyN`, and records the route plus first cx/VAT/cursor/key-state corruption evidence.',
    '',
    `The in-memory harness caps only \`KeyN\` at ${KEYN_TRACE_STEP_CAP} steps so the trace completes under the 180s watchdog. The shell file on disk is not patched.`,
    '',
    'No disk browser/runtime/transpiler behavior is patched by this probe.',
    '',
    '## Result',
    '',
    data?.error ? `- Probe failed: ${data.error.split('\n')[0]}` : `- ${finding}`,
    data?.error ? '' : `- Final key state: termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, lastPc=${fmtValue(after.lastPc)}, final cpu.pc=${fmtValue(after.cpu?.pc)}.`,
    data?.error ? '' : `- Base before key: D007CA=${fmtValue(before.fields?.D007CA)}, D02590=${fmtValue(before.fields?.D02590)}, D0243A=${fmtValue(before.fields?.D0243A)}, D0243D=${fmtValue(before.fields?.D0243D)}, lastPc=${fmtValue(before.lastPc)}, VRAM=${before.vram ?? '-'}.`,
    data?.error ? '' : `- First critical zero: ${record.firstCriticalZero?.source ?? 'none'}${record.firstCriticalZero?.snapshot ? ` at block ${record.firstCriticalZero.snapshot.block}, pc=${fmtValue(record.firstCriticalZero.snapshot.pc)}, prev=${fmtValue(record.firstCriticalZero.snapshot.prevPc)}` : ''}.`,
    data?.error ? '' : `- First 0x202020 signal: ${record.first202020?.source ?? 'none'}.`,
    data?.error ? '' : `- First D007CA divergence: ${record.firstBadD007CA?.source ?? 'none'}${record.firstBadD007CA?.snapshot ? ` at block ${record.firstBadD007CA.snapshot.block}, pc=${fmtValue(record.firstBadD007CA.snapshot.pc)}, prev=${fmtValue(record.firstBadD007CA.snapshot.prevPc)}, expected=${fmtValue(record.firstBadD007CA.expected)}, saw=${fmtValue(record.firstBadD007CA.snapshot.fields?.D007CA)}` : ''}.`,
    data?.error ? '' : `- First D0243A change: ${record.firstD0243AChange?.source ?? 'none'}${record.firstD0243AChange?.snapshot ? ` at block ${record.firstD0243AChange.snapshot.block}, pc=${fmtValue(record.firstD0243AChange.snapshot.pc)}, prev=${fmtValue(record.firstD0243AChange.snapshot.prevPc)}, expected=${fmtValue(record.firstD0243AChange.expected)}, saw=${fmtValue(record.firstD0243AChange.snapshot.fields?.D0243A)}` : ''}.`,
    data?.error ? '' : `- Owner-class target hits: vectorOwner08c782=${record.counts?.vectorOwner08c782 ?? 0}, vectorRestore06c764=${record.counts?.vectorRestore06c764 ?? 0}, clearOwner0a229d=${record.counts?.eolOwner0a229d ?? 0}, clearTail0a22a4=${record.counts?.eolTail0a22a4 ?? 0}, spaceFillBridge0a2a37=${record.counts?.spaceFillBridge0a2a37 ?? 0}, cleanup001879=${record.counts?.cleanup001879 ?? 0}, cleanupTail0018f8=${record.counts?.cleanupTail0018f8 ?? 0}.`,
    ...(data?.error ? [] : candidateScopeLines(record)),
    data?.error ? '' : `- CDP/page errors: ${(data.cdpPageErrors ?? []).length + (after.pageErrors?.length ?? 0)}.`,
    '',
    '## Hot Blocks',
    '',
    data?.error ? '_No hot block table._' : hotBlockTable(record),
    '',
    '## Target Hits',
    '',
    data?.error ? '_No target table._' : targetTable(record),
    '',
    '## Tail Snapshots',
    '',
    data?.error ? '_No tail table._' : tailTable(record),
    '',
    '## Field Transitions',
    '',
    data?.error ? '_No transition table._' : transitionTable(record),
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
  summary = await runTrace();
  console.log(JSON.stringify({
    probe: summary.probe,
    finding: inferFinding(summary),
    final: {
      status: summary.after?.status,
      lastPc: hex(summary.after?.lastPc),
      termination: summary.after?.lastKey?.termination,
      steps: summary.after?.lastKey?.steps,
      D007CA: hex(summary.after?.fields?.D007CA),
      D008E0: hex(summary.after?.fields?.D008E0),
      D02590: hex(summary.after?.fields?.D02590),
      D0243A: hex(summary.after?.fields?.D0243A),
      D0243D: hex(summary.after?.fields?.D0243D),
    },
    firstCriticalZero: summary.record?.firstCriticalZero ? {
      source: summary.record.firstCriticalZero.source,
      pc: hex(summary.record.firstCriticalZero.snapshot?.pc),
      prevPc: hex(summary.record.firstCriticalZero.snapshot?.prevPc),
      block: summary.record.firstCriticalZero.snapshot?.block,
    } : null,
    first202020: summary.record?.first202020?.source ?? null,
    firstBadD007CA: summary.record?.firstBadD007CA ? {
      source: summary.record.firstBadD007CA.source,
      pc: hex(summary.record.firstBadD007CA.snapshot?.pc),
      prevPc: hex(summary.record.firstBadD007CA.snapshot?.prevPc),
      block: summary.record.firstBadD007CA.snapshot?.block,
      value: hex(summary.record.firstBadD007CA.snapshot?.fields?.D007CA),
    } : null,
    firstD0243AChange: summary.record?.firstD0243AChange ? {
      source: summary.record.firstD0243AChange.source,
      pc: hex(summary.record.firstD0243AChange.snapshot?.pc),
      prevPc: hex(summary.record.firstD0243AChange.snapshot?.prevPc),
      block: summary.record.firstD0243AChange.snapshot?.block,
      value: hex(summary.record.firstD0243AChange.snapshot?.fields?.D0243A),
    } : null,
    targetCounts: Object.fromEntries(Object.entries(summary.record?.counts ?? {}).filter(([, value]) => value)),
    hotBlocks: summary.record?.hotBlocks?.slice(0, 10) ?? [],
    tail: summary.record?.lastBlocks?.slice(-16) ?? [],
  }, null, 2));
} catch (error) {
  summary = {
    probe: 'phase772-browser-keyn-corruption-trace',
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


import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase757-browser-arrowleft-corruption-trace.md');
const debugPort = 9757;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase757-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));
const ARROWLEFT_TRACE_STEP_CAP = 200000;

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
  if (code === 'ArrowLeft') return ${ARROWLEFT_TRACE_STEP_CAP};
  return code === EOL_PC_CODE
    ? Math.max(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS)
    : COLDBOOT_KEY_BURST_STEPS;
}`);
  if (patchedHtml === html) throw new Error('ArrowLeft trace cap patch point not found');

  const injection = String.raw`
window.__phase757TraceStepCap = ${ARROWLEFT_TRACE_STEP_CAP};
const PHASE757_TARGETS = Object.freeze({
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
  eolOwner0a229d: 0x0A229D,
  eolTail0a22a4: 0x0A22A4,
  spaceFillBridge0a2a37: 0x0A2A37,
  vectorOwner08c782: 0x08C782,
  vectorRestore06c764: 0x06C764,
  alternateCxMain06c92c: 0x06C92C,
  cxDispatchWrapper08c72f: 0x08C72F,
  display09efde: 0x09EFDE,
  tokenOuter08f3b8: 0x08F3B8,
  tokenTuple08f54b: 0x08F54B,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
});

const PHASE757_FIELD_SPECS = Object.freeze([
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

const PHASE757_CRITICAL_FIELDS = Object.freeze(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590']);

function phase757Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase757ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase757ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE757_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase757ReadValue(mem, addr, len),
  ]));
}

function phase757ReadStackSlots(count = 8) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: phase757ReadValue(mem, addr, 3) };
  });
}

function phase757CpuRaw() {
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

function phase757Has202020(fields, stackTop = []) {
  return Object.values(fields ?? {}).some((value) => value === 0x202020)
    || stackTop.some((slot) => slot.value === 0x202020);
}

function phase757HasCriticalZero(fields) {
  return PHASE757_CRITICAL_FIELDS.some((name) => fields?.[name] === 0);
}

function phase757DiffFields(before, after) {
  const diff = {};
  for (const name of Object.keys(after ?? {})) {
    if ((before?.[name] ?? null) !== after[name]) diff[name] = { before: before?.[name] ?? null, after: after[name] };
  }
  return diff;
}

function phase757Snapshot(record, pc, fields = null) {
  const cpuRaw = phase757CpuRaw();
  return {
    block: record?.totalBlocks ?? 0,
    step: cpuRaw?.stepCount ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPcRaw ?? null,
    cpu: cpuRaw,
    fields: fields ?? phase757ReadFields(),
    stackTop: phase757ReadStackSlots(8),
    vram: countVRAMPixels?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
  };
}

function phase757TailSnapshot(record, pc, fields) {
  const cpuRaw = phase757CpuRaw();
  const mem = cpu?.memory;
  const stack0 = mem ? phase757ReadValue(mem, cpuRaw?.sp ?? 0, 3) : null;
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
    D02590: fields?.D02590 ?? null,
    D0058C: fields?.D0058C ?? null,
    D0058D: fields?.D0058D ?? null,
    D0058E: fields?.D0058E ?? null,
  };
}

function phase757CreateRecord(label) {
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
    counts: Object.fromEntries(Object.keys(PHASE757_TARGETS).map((name) => [name, 0])),
    firstSamples: {},
    targetSamples: [],
    fieldTransitions: [],
    firstFieldZero: null,
    first202020: null,
    lastFields: null,
  };
}

function phase757Read(label = 'read') {
  const fields = phase757ReadFields();
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase757CpuRaw(),
    fields,
    stackTop: phase757ReadStackSlots(8),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase757PageErrors ?? [])],
  };
}

window.__phase757PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase757PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase757PageErrors.push(String(event.reason || event));
});

window.__phase757State = {
  records: [],
  begin(label) {
    const record = phase757CreateRecord(label);
    this.records.push(record);
    record.start = phase757Read('start');
    record.lastFields = record.start.fields;
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase757Read('end');
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80)
        .map(([pc, count]) => ({ pc, count }));
      if (!record.first202020 && phase757Has202020(record.end.fields, record.end.stackTop)) {
        record.first202020 = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.firstFieldZero && phase757HasCriticalZero(record.end.fields)) {
        record.firstFieldZero = { source: 'final-state-only', snapshot: record.end };
      }
    }
    return record;
  },
  read: phase757Read,
};
window.__phase757 = window.__phase757State;

const phase757OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase757ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  let record = window.__phase757State.records.at(-1);
  if (!record) {
    record = phase757CreateRecord('implicit');
    window.__phase757State.records.push(record);
  }

  record.totalBlocks += 1;
  const pcHex = phase757Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 96) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 384) record.lastBlocks.shift();

  if (addr <= 0x006FFF) record.regionCounts.low000000_006fff += 1;
  if (addr >= 0x001000 && addr <= 0x001FFF) record.regionCounts.cleanup001000_001fff += 1;
  if (addr >= 0x09E000 && addr <= 0x0A2FFF) record.regionCounts.display09e000_0a2fff += 1;
  if (addr >= 0x08F000 && addr <= 0x090FFF) record.regionCounts.token08f000_090fff += 1;
  if (addr >= 0x0A2100 && addr <= 0x0A23FF) record.regionCounts.near0a2100_0a23ff += 1;

  const fields = phase757ReadFields();
  const tail = phase757TailSnapshot(record, addr, fields);
  record.tailSnapshots.push(tail);
  if (record.tailSnapshots.length > 384) record.tailSnapshots.shift();

  const entryDiff = phase757DiffFields(record.lastFields, fields);
  if (Object.keys(entryDiff).length && record.fieldTransitions.length < 260) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'entry-vs-previous-block',
      diff: entryDiff,
    });
  }

  if (!record.firstFieldZero && phase757HasCriticalZero(fields)) {
    record.firstFieldZero = {
      source: 'observed-before-block',
      snapshot: phase757Snapshot(record, addr, fields),
    };
  }

  if (!record.first202020 && phase757Has202020(fields, phase757ReadStackSlots(8))) {
    record.first202020 = {
      source: 'observed-before-block',
      snapshot: phase757Snapshot(record, addr, fields),
    };
  }

  for (const [name, target] of Object.entries(PHASE757_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = phase757Snapshot(record, addr, fields);
    if (record.targetSamples.length < 120) record.targetSamples.push({ target: name, ...record.firstSamples[name] });
  }

  const result = phase757OriginalObserveColdbootPersistenceBlock(state, pc);
  const afterHookFields = phase757ReadFields();
  const hookDiff = phase757DiffFields(fields, afterHookFields);
  if (Object.keys(hookDiff).length && record.fieldTransitions.length < 260) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'after-persistence-hook',
      diff: hookDiff,
    });
  }
  if (!record.firstFieldZero && phase757HasCriticalZero(afterHookFields)) {
    record.firstFieldZero = {
      source: 'after-persistence-hook',
      snapshot: phase757Snapshot(record, addr, afterHookFields),
    };
  }
  if (!record.first202020 && phase757Has202020(afterHookFields, phase757ReadStackSlots(8))) {
    record.first202020 = {
      source: 'after-persistence-hook',
      snapshot: phase757Snapshot(record, addr, afterHookFields),
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

function cdp(socket, method, params = {}, timeout = 165000) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, timeout);
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
    windowsVirtualKeyCode: 37,
    nativeVirtualKeyCode: 37,
    code: 'ArrowLeft',
    key: 'ArrowLeft',
  };
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
  await waitFor(ws, '!!window.__phase757 && !!window.getColdbootPersistenceDiagnostics', 'phase757 instrumentation', 30000);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  const before = await evalExpr(ws, `window.__phase757.begin('ArrowLeft corruption trace')`);

  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'));
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'));
  await waitFor(ws, `window.__coldbootLastKey?.code === 'ArrowLeft'`, 'ArrowLeft key completion', 180000);
  await sleep(250);
  const record = await evalExpr(ws, 'window.__phase757.finish()', 120000);
  const after = await evalExpr(ws, 'window.__phase757.read("after-finish")', 120000);

  return {
    probe: 'phase757-browser-arrowleft-corruption-trace',
    chromePath,
    pageUrl,
    traceStepCap: ARROWLEFT_TRACE_STEP_CAP,
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

function fmtFields(fields) {
  if (!fields) return {};
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, hex(value, name.startsWith('D005') || name === 'D00080' || name === 'D0009F' || name === 'D000C2' || name === 'D02A28' ? 2 : 6)]));
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
    firstFieldZero: record?.firstFieldZero ? {
      source: record.firstFieldZero.source,
      snapshot: compactSnapshot(record.firstFieldZero.snapshot),
    } : null,
    first202020: record?.first202020 ? {
      source: record.first202020.source,
      snapshot: compactSnapshot(record.first202020.snapshot),
    } : null,
    hotBlocks: record?.hotBlocks ?? [],
    firstBlocks: record?.firstBlocks ?? [],
    lastBlocks: record?.lastBlocks ?? [],
    tailSnapshots: (record?.tailSnapshots ?? []).slice(-64).map(compactTail),
    fieldTransitions: (record?.fieldTransitions ?? []).slice(-80).map((transition) => ({
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

function inferFinding(data) {
  if (data?.error) return `Probe failed: ${data.error.split('\n')[0]}`;
  const record = data.record ?? {};
  const after = data.after ?? record.end ?? {};
  const key = after.lastKey ?? {};
  const firstZero = record.firstFieldZero;
  const finalPc = after.lastPc;
  const hot = (record.hotBlocks ?? []).slice(0, 5).map((row) => `${row.pc}x${row.count}`).join(', ');
  const counts = record.counts ?? {};
  const vector = (counts.vectorOwner08c782 ?? 0) || (counts.vectorRestore06c764 ?? 0);
  const clearTail = (counts.eolOwner0a229d ?? 0) || (counts.eolTail0a22a4 ?? 0) || (counts.spaceFillBridge0a2a37 ?? 0);
  const cleanup = (counts.cleanup001879 ?? 0) || (counts.cleanupTail0018f8 ?? 0);
  const classification = vector
    ? 'same 0x08C782 -> 0x06C764 context-vector owner path'
    : clearTail
      ? 'CLEAR-class 0x0A229D -> 0x0A22A4 space-fill tail'
      : cleanup
        ? 'cleanup wipe path through 0x001879/0x0018F8'
        : 'no known owner class in tracked targets';

  if (key.termination === 'max_steps' && finalPc === 0x000B7C) {
    return `ArrowLeft reproduces the phase749 max_steps failure at 0x000B7C and classifies as ${classification}; first critical zero is ${firstZero?.source ?? 'not captured'} at ${fmtValue(firstZero?.snapshot?.pc)} after prev ${fmtValue(firstZero?.snapshot?.prevPc)}, with hot tail ${hot}.`;
  }
  if (key.termination === 'missing_block') {
    return `ArrowLeft now ends at missing_block ${fmtValue(finalPc)} and classifies as ${classification}; first critical zero is ${firstZero?.source ?? 'not captured'} at ${fmtValue(firstZero?.snapshot?.pc)}.`;
  }
  return `ArrowLeft ended with termination=${key.termination ?? 'n/a'}, lastPc=${fmtValue(finalPc)}, classified as ${classification}; first critical zero is ${firstZero?.source ?? 'not captured'} at ${fmtValue(firstZero?.snapshot?.pc)}.`;
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

function tailTable(record) {
  const snapshots = (record?.tailSnapshots ?? []).slice(-48);
  if (!snapshots.length) return '_No tail snapshots captured._';
  return [
    '| Block | Step | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D008E0 | D0243A | D02590 | Key bytes |',
    '|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...snapshots.map((s) => `| ${s.block} | ${s.step} | ${fmtValue(s.pc)} | ${fmtValue(s.prevPc)} | ${fmtValue(s.bc)} | ${fmtValue(s.hl)} | ${fmtValue(s.de)} | ${fmtValue(s.sp)} | ${fmtValue(s.stack0)} | ${fmtValue(s.D007CA)} | ${fmtValue(s.D008E0)} | ${fmtValue(s.D0243A)} | ${fmtValue(s.D02590)} | ${fmtValue(s.D0058C, 2)}/${fmtValue(s.D0058D, 2)}/${fmtValue(s.D0058E, 2)} |`),
  ].join('\n');
}

function transitionTable(record) {
  const rows = (record?.fieldTransitions ?? []).slice(-40);
  if (!rows.length) return '_No tracked field transitions captured._';
  return [
    '| Block | PC | Prev PC | Timing | Diffs |',
    '|---:|---|---|---|---|',
    ...rows.map((transition) => {
      const diffs = Object.entries(transition.diff ?? {})
        .map(([name, value]) => `${name}:${fmtValue(value.before)}->${fmtValue(value.after)}`)
        .join('; ');
      return `| ${transition.block} | ${transition.pc} | ${transition.prevPc ?? '-'} | ${transition.timing} | ${diffs.replaceAll('|', '\\|')} |`;
    }),
  ].join('\n');
}

function hotBlockTable(record) {
  const rows = (record?.hotBlocks ?? []).slice(0, 30);
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
    '# Phase 757 Browser ArrowLeft Corruption Trace',
    '',
    'Probe: `probe-phase757-browser-arrowleft-corruption-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase757-browser-arrowleft-corruption-trace.mjs`',
    '',
    'Serves an in-memory instrumented `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowLeft`, and records the pre-`max_steps` route plus first cx/VAT/cursor zeroing evidence.',
    '',
    `The in-memory harness caps only \`ArrowLeft\` at ${ARROWLEFT_TRACE_STEP_CAP} steps so the trace completes under the 180s watchdog while preserving the current shell behavior. The shell file on disk is not patched.`,
    '',
    'No disk browser/runtime/transpiler behavior is patched by this probe.',
    '',
    '## Result',
    '',
    data?.error ? `- Probe failed: ${data.error.split('\n')[0]}` : `- ${finding}`,
    data?.error ? '' : `- Final key state: termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, lastPc=${fmtValue(after.lastPc)}, final cpu.pc=${fmtValue(after.cpu?.pc)}.`,
    data?.error ? '' : `- Base was sane before key: D007CA=${fmtValue(before.fields?.D007CA)}, D02590=${fmtValue(before.fields?.D02590)}, D0243A=${fmtValue(before.fields?.D0243A)}, lastPc=${fmtValue(before.lastPc)}.`,
    data?.error ? '' : `- First critical zero: ${record.firstFieldZero?.source ?? 'none'}${record.firstFieldZero?.snapshot ? ` at block ${record.firstFieldZero.snapshot.block}, pc=${fmtValue(record.firstFieldZero.snapshot.pc)}, prev=${fmtValue(record.firstFieldZero.snapshot.prevPc)}` : ''}.`,
    data?.error ? '' : `- First 0x202020 signal: ${record.first202020?.source ?? 'none'}.`,
    data?.error ? '' : `- Owner-class target hits: vectorOwner08c782=${record.counts?.vectorOwner08c782 ?? 0}, vectorRestore06c764=${record.counts?.vectorRestore06c764 ?? 0}, clearOwner0a229d=${record.counts?.eolOwner0a229d ?? 0}, clearTail0a22a4=${record.counts?.eolTail0a22a4 ?? 0}, cleanup001879=${record.counts?.cleanup001879 ?? 0}, cleanupTail0018f8=${record.counts?.cleanupTail0018f8 ?? 0}.`,
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
    },
    firstFieldZero: summary.record?.firstFieldZero ? {
      source: summary.record.firstFieldZero.source,
      pc: hex(summary.record.firstFieldZero.snapshot?.pc),
      prevPc: hex(summary.record.firstFieldZero.snapshot?.prevPc),
      block: summary.record.firstFieldZero.snapshot?.block,
    } : null,
    first202020: summary.record?.first202020?.source ?? null,
    targetCounts: Object.fromEntries(Object.entries(summary.record?.counts ?? {}).filter(([, value]) => value)),
    hotBlocks: summary.record?.hotBlocks?.slice(0, 10) ?? [],
    tail: summary.record?.lastBlocks?.slice(-12) ?? [],
  }, null, 2));
} catch (error) {
  summary = {
    probe: 'phase757-browser-arrowleft-corruption-trace',
    error: String(error?.stack || error),
  };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

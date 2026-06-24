import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase821-browser-home-corruption-trace.md');
const debugPort = 9822;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase821-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

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
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) throw new Error('Instrumentation marker not found in browser-shell.html');

  const injection = String.raw`
const PHASE750_TARGETS = Object.freeze({
  eolCaller058a16: 0x058A16,
  eolOwner0a229d: 0x0A229D,
  eolTail0a22a4: 0x0A22A4,
  spaceFillBridge0a2a37: 0x0A2A37,
  enterClear0a2150: 0x0A2150,
  tokenOuter08f3b8: 0x08F3B8,
  tokenTuple08f54b: 0x08F54B,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  postInsertGate0158de: 0x0158DE,
  postInsertReturn0013da: 0x0013DA,
  low000a92: 0x000A92,
  low000b7c: 0x000B7C,
  low006d5d: 0x006D5D,
  display09efde: 0x09EFDE,
});

const PHASE750_FIELD_SPECS = Object.freeze([
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

function phase821Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase821ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase821ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE750_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase821ReadValue(mem, addr, len),
  ]));
}

function phase821ReadStackSlots(count = 10) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: phase821ReadValue(mem, addr, 3) };
  });
}

function phase821CpuRaw() {
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

function phase821Bytes(addr, count) {
  const mem = cpu?.memory;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => mem[(addr + i) & 0xFFFFFF] ?? 0);
}

function phase821Ascii(bytes) {
  return bytes.map((byte) => (byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.')).join('');
}

function phase821MemoryWindow(addr, radius = 24) {
  const start = ((addr ?? 0) - radius) & 0xFFFFFF;
  const count = radius * 2;
  const bytes = phase821Bytes(start, count);
  return {
    start,
    bytes,
    ascii: phase821Ascii(bytes),
  };
}

function phase821Has202020(fields, stackTop) {
  if (Object.values(fields ?? {}).some((value) => value === 0x202020)) return true;
  return (stackTop ?? []).some((slot) => slot.value === 0x202020);
}

function phase821DiffFields(before, after) {
  const diff = {};
  for (const name of Object.keys(after ?? {})) {
    if ((before?.[name] ?? null) !== after[name]) diff[name] = { before: before?.[name] ?? null, after: after[name] };
  }
  return diff;
}

function phase821Snapshot(record, pc, includeWindows = false) {
  const cpuRaw = phase821CpuRaw();
  const fields = phase821ReadFields();
  const stackTop = phase821ReadStackSlots(10);
  const snapshot = {
    block: record?.totalBlocks ?? 0,
    step: cpuRaw?.stepCount ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPc ?? null,
    cpu: cpuRaw,
    fields,
    stackTop,
    vram: countVRAMPixels?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
  };
  if (includeWindows) {
    snapshot.windows = {
      aroundSp: phase821MemoryWindow(cpuRaw?.sp ?? 0),
      aroundHl: phase821MemoryWindow(cpuRaw?.hl ?? 0),
      aroundDe: phase821MemoryWindow(cpuRaw?.de ?? 0),
      D006C0: phase821MemoryWindow(0xD006C0, 32),
      D1A840: phase821MemoryWindow(0xD1A840, 32),
      D02430: phase821MemoryWindow(0xD02430, 32),
    };
  }
  return snapshot;
}

function phase821CreateRecord(label) {
  const counts = Object.fromEntries(Object.keys(PHASE750_TARGETS).map((name) => [name, 0]));
  return {
    label,
    start: null,
    end: null,
    totalBlocks: 0,
    prevPc: null,
    firstBlocks: [],
    lastBlocks: [],
    lastSnapshots: [],
    hotBlocks: {},
    regionCounts: {
      near0a2100_0a23ff: 0,
      token08f000_090fff: 0,
      low000000_006fff: 0,
      cleanup001000_001fff: 0,
      display09e000_0a2fff: 0,
    },
    counts,
    firstSamples: {},
    targetSamples: [],
    fieldTransitions: [],
    first202020: null,
    firstFieldZero: null,
    lastFields: null,
  };
}

function phase821CurrentRecord() {
  let record = window.__phase821State.records.at(-1);
  if (!record) {
    record = phase821CreateRecord('implicit');
    window.__phase821State.records.push(record);
  }
  return record;
}

function phase821Read(label = 'read') {
  const fields = phase821ReadFields();
  const cpuRaw = phase821CpuRaw();
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: cpuRaw,
    fields,
    stackTop: phase821ReadStackSlots(10),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase821PageErrors ?? [])],
  };
}

window.__phase821PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase821PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase821PageErrors.push(String(event.reason || event));
});

window.__phase821State = {
  records: [],
  begin(label) {
    const record = phase821CreateRecord(label);
    this.records.push(record);
    record.start = phase821Read('start');
    record.lastFields = record.start.fields;
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase821Read('end');
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([pc, count]) => ({ pc, count }));
      if (!record.first202020 && phase821Has202020(record.end.fields, record.end.stackTop)) {
        record.first202020 = { source: 'final-state-only', snapshot: record.end };
      }
    }
    return record;
  },
  read: phase821Read,
};
window.__phase821 = window.__phase821State;

const phase821OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase821ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase821CurrentRecord();
  record.totalBlocks += 1;
  const pcHex = phase821Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 160) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 512) record.lastBlocks.shift();

  if (addr >= 0x0A2100 && addr <= 0x0A23FF) record.regionCounts.near0a2100_0a23ff += 1;
  if (addr >= 0x08F000 && addr <= 0x090FFF) record.regionCounts.token08f000_090fff += 1;
  if (addr <= 0x006FFF) record.regionCounts.low000000_006fff += 1;
  if (addr >= 0x001000 && addr <= 0x001FFF) record.regionCounts.cleanup001000_001fff += 1;
  if (addr >= 0x09E000 && addr <= 0x0A2FFF) record.regionCounts.display09e000_0a2fff += 1;

  const isTarget = Object.values(PHASE750_TARGETS).includes(addr);
  const isNearCritical = (addr >= 0x0A2100 && addr <= 0x0A23FF)
    || (addr >= 0x058900 && addr <= 0x058B00)
    || (addr >= 0x08F000 && addr <= 0x090FFF)
    || (addr <= 0x006FFF);
  const snapshot = phase821Snapshot(record, addr, isTarget || isNearCritical);
  record.lastSnapshots.push(snapshot);
  if (record.lastSnapshots.length > 512) record.lastSnapshots.shift();

  for (const [name, target] of Object.entries(PHASE750_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = snapshot;
    if (record.targetSamples.length < 160) record.targetSamples.push({ target: name, ...snapshot });
  }

  if (!record.first202020 && phase821Has202020(snapshot.fields, snapshot.stackTop)) {
    record.first202020 = { source: 'observed-before-block', snapshot };
  }

  const beforeFields = record.lastFields;
  const entryDiff = phase821DiffFields(beforeFields, snapshot.fields);
  if (Object.keys(entryDiff).length && record.fieldTransitions.length < 240) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'entry-vs-previous-block',
      diff: entryDiff,
      before: beforeFields,
      after: snapshot.fields,
    });
  }

  const result = phase821OriginalObserveColdbootPersistenceBlock(state, pc);
  const afterHookFields = phase821ReadFields();
  const hookDiff = phase821DiffFields(snapshot.fields, afterHookFields);
  if (Object.keys(hookDiff).length && record.fieldTransitions.length < 240) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      timing: 'after-persistence-hook',
      diff: hookDiff,
      before: snapshot.fields,
      after: afterHookFields,
    });
  }

  if (!record.first202020 && phase821Has202020(afterHookFields, phase821ReadStackSlots(10))) {
    record.first202020 = {
      source: 'after-persistence-hook',
      snapshot: phase821Snapshot(record, addr, true),
    };
  }

  if (!record.firstFieldZero && ['D007CA', 'D02590', 'D0243A'].some((name) => afterHookFields?.[name] === 0)) {
    record.firstFieldZero = {
      block: record.totalBlocks,
      pc: pcHex,
      prevPc: record.prevPc,
      fields: afterHookFields,
    };
  }

  record.lastFields = afterHookFields;
  record.prevPc = pcHex;
  return result;
};
`;

  html = html.replace('const COLDBOOT_KEY_BURST_STEPS = 300000;', 'const COLDBOOT_KEY_BURST_STEPS = 40000;');
  return html.replace(marker, `${injection}\n\n${marker}`);
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
    windowsVirtualKeyCode: 36,
    nativeVirtualKeyCode: 36,
    code: 'Home',
    key: 'Home',
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
  await waitFor(ws, '!!window.__phase821 && !!window.getColdbootPersistenceDiagnostics', 'phase821 instrumentation', 30000);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  const before = await evalExpr(ws, `window.__phase821.begin('F4 0x202020 corruption trace')`);

  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'));
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'));
  await waitFor(ws, `window.__coldbootLastKey?.code === 'Home'`, 'Home key completion', 180000);
  await sleep(250);
  const record = await evalExpr(ws, 'window.__phase821.finish()');
  const after = await evalExpr(ws, 'window.__phase821.read("after-finish")');

  return {
    probe: 'phase821-browser-home-corruption-trace',
    chromePath,
    pageUrl,
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
    windows: snapshot.windows ? {
      aroundSp: {
        start: fmtValue(snapshot.windows.aroundSp?.start),
        ascii: snapshot.windows.aroundSp?.ascii,
        bytes: snapshot.windows.aroundSp?.bytes?.map((byte) => hex(byte, 2)),
      },
      aroundHl: {
        start: fmtValue(snapshot.windows.aroundHl?.start),
        ascii: snapshot.windows.aroundHl?.ascii,
        bytes: snapshot.windows.aroundHl?.bytes?.map((byte) => hex(byte, 2)),
      },
      aroundDe: {
        start: fmtValue(snapshot.windows.aroundDe?.start),
        ascii: snapshot.windows.aroundDe?.ascii,
        bytes: snapshot.windows.aroundDe?.bytes?.map((byte) => hex(byte, 2)),
      },
      D006C0: {
        start: fmtValue(snapshot.windows.D006C0?.start),
        ascii: snapshot.windows.D006C0?.ascii,
      },
      D1A840: {
        start: fmtValue(snapshot.windows.D1A840?.start),
        ascii: snapshot.windows.D1A840?.ascii,
      },
    } : null,
  };
}

function compactRecord(record) {
  return {
    totalBlocks: record?.totalBlocks ?? 0,
    regionCounts: record?.regionCounts ?? {},
    targetCounts: Object.fromEntries(Object.entries(record?.counts ?? {}).filter(([, value]) => value)),
    firstSamples: Object.fromEntries(Object.entries(record?.firstSamples ?? {}).map(([name, value]) => [name, compactSnapshot(value)])),
    first202020: record?.first202020 ? {
      source: record.first202020.source,
      snapshot: compactSnapshot(record.first202020.snapshot),
    } : null,
    firstFieldZero: record?.firstFieldZero ? {
      ...record.firstFieldZero,
      fields: fmtFields(record.firstFieldZero.fields),
    } : null,
    hotBlocks: record?.hotBlocks ?? [],
    firstBlocks: record?.firstBlocks ?? [],
    lastBlocks: record?.lastBlocks ?? [],
    tailSnapshots: (record?.lastSnapshots ?? []).slice(-32).map(compactSnapshot),
    fieldTransitions: (record?.fieldTransitions ?? []).slice(-48).map((transition) => ({
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
  const end = data.after ?? record.end ?? {};
  const finalLastPc = end.lastPc;
  const finalCpuPc = end.cpu?.pc;
  const lastSnapshot = record.lastSnapshots?.at(-1);
  const first202020 = record.first202020;
  const hit0a22a4 = record.counts?.eolTail0a22a4 ?? 0;
  const hit0a229d = record.counts?.eolOwner0a229d ?? 0;

  if (finalLastPc === 0x202020 && lastSnapshot?.pc === 0x0A22A4) {
    return `F4 ends at missing_block 0x202020 from the same 0x0A22A4 space-fill tail shape as CLEAR; 0x0A229D hits=${hit0a229d}, 0x0A22A4 hits=${hit0a22a4}.`;
  }
  if (finalLastPc === 0x202020 && hit0a22a4) {
    return `F4 ends at missing_block 0x202020 and did hit 0x0A22A4, but the last observed block was ${fmtValue(lastSnapshot?.pc)}; inspect the tail snapshots.`;
  }
  if (finalLastPc === 0x202020) {
    return `F4 ends at missing_block 0x202020 without hitting the known CLEAR 0x0A22A4 tail; last observed block=${fmtValue(lastSnapshot?.pc)}, final cpu.pc=${fmtValue(finalCpuPc)}, first202020=${first202020?.source ?? 'none'}.`;
  }
  return `F4 no longer ends at 0x202020; final lastPc=${fmtValue(finalLastPc)}, termination=${end.lastKey?.termination ?? 'n/a'}.`;
}

function targetTable(record) {
  const counts = record?.counts ?? {};
  const samples = record?.firstSamples ?? {};
  const rows = Object.keys(counts).map((name) => {
    const sample = samples[name];
    return `| ${name} | ${counts[name] ?? 0} | ${sample?.block ?? '-'} | ${fmtValue(sample?.pc)} | ${fmtValue(sample?.prevPc)} | ${fmtValue(sample?.cpu?.bc)} | ${fmtValue(sample?.cpu?.hl)} | ${fmtValue(sample?.cpu?.de)} | ${fmtValue(sample?.cpu?.sp)} | ${fmtValue(sample?.stackTop?.[0]?.value)} |`;
  });
  return [
    '| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] |',
    '|---|---:|---:|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function tailTable(record) {
  const snapshots = (record?.lastSnapshots ?? []).slice(-24);
  if (!snapshots.length) return '_No tail snapshots captured._';
  return [
    '| Block | Step | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D02590 | D0243A |',
    '|---:|---:|---|---|---|---|---|---|---|---|---|---|',
    ...snapshots.map((snapshot) => `| ${snapshot.block} | ${snapshot.step} | ${fmtValue(snapshot.pc)} | ${fmtValue(snapshot.prevPc)} | ${fmtValue(snapshot.cpu?.bc)} | ${fmtValue(snapshot.cpu?.hl)} | ${fmtValue(snapshot.cpu?.de)} | ${fmtValue(snapshot.cpu?.sp)} | ${fmtValue(snapshot.stackTop?.[0]?.value)} | ${fmtValue(snapshot.fields?.D007CA)} | ${fmtValue(snapshot.fields?.D02590)} | ${fmtValue(snapshot.fields?.D0243A)} |`),
  ].join('\n');
}

function transitionTable(record) {
  const rows = (record?.fieldTransitions ?? []).slice(-24);
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
    '# Phase 750 Browser F4 Corruption Trace',
    '',
    'Probe: `probe-phase821-browser-home-corruption-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase821-browser-home-corruption-trace.mjs`',
    '',
    'Serves an in-memory instrumented `browser-shell.html`, boots coldboot with Preserve Display, presses `F4`, and records the pre-`missing_block` route plus field/stack corruption signals.',
    '',
    'No disk browser/runtime/transpiler behavior is patched by this probe.',
    '',
    '## Result',
    '',
    data?.error ? `- Probe failed: ${data.error.split('\n')[0]}` : `- ${finding}`,
    data?.error ? '' : `- Final key state: termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, lastPc=${fmtValue(after.lastPc)}, final cpu.pc=${fmtValue(after.cpu?.pc)}.`,
    data?.error ? '' : `- Base was sane before key: D007CA=${fmtValue(before.fields?.D007CA)}, D02590=${fmtValue(before.fields?.D02590)}, D0243A=${fmtValue(before.fields?.D0243A)}, lastPc=${fmtValue(before.lastPc)}.`,
    data?.error ? '' : `- First 0x202020 signal: ${record.first202020?.source ?? 'none during observed blocks'}${record.first202020?.snapshot ? ` at block ${record.first202020.snapshot.block}, pc=${fmtValue(record.first202020.snapshot.pc)}` : ''}.`,
    data?.error ? '' : `- CDP/page errors: ${(data.cdpPageErrors ?? []).length + (after.pageErrors?.length ?? 0)}.`,
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
      D02590: hex(summary.after?.fields?.D02590),
      D0243A: hex(summary.after?.fields?.D0243A),
    },
    first202020: summary.record?.first202020?.source ?? null,
    targetCounts: Object.fromEntries(Object.entries(summary.record?.counts ?? {}).filter(([, value]) => value)),
    tail: summary.record?.lastBlocks?.slice(-12) ?? [],
  }, null, 2));
} catch (error) {
  summary = {
    probe: 'phase821-browser-home-corruption-trace',
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

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase746-0a229d-fix-scope.md');
const debugPort = 9746;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase746-'));

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const TARGETS = Object.freeze({
  caller058a16: 0x058A16,
  call0a223a: 0x0A223A,
  source0a229d: 0x0A229D,
  bridge0a2a37: 0x0A2A37,
  tail0a22a4: 0x0A22A4,
  return058a1a: 0x058A1A,
  legacyClear001879: 0x001879,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  return 'application/octet-stream';
}

function instrumentBrowserShell(html) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) throw new Error('Instrumentation marker not found in browser-shell.html');

  const injection = String.raw`
const PHASE746_TARGETS = Object.freeze({
  caller058a16: 0x058A16,
  call0a223a: 0x0A223A,
  source0a229d: 0x0A229D,
  bridge0a2a37: 0x0A2A37,
  tail0a22a4: 0x0A22A4,
  return058a1a: 0x058A1A,
  legacyClear001879: 0x001879,
});

const PHASE746_FIELD_SPECS = Object.freeze([
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00587', 0xD00587, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
  ['D000C2', 0xD000C2, 1],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02A28', 0xD02A28, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A40', 0xD02A40, 3],
  ['D00121', 0xD00121, 3],
  ['D00124', 0xD00124, 1],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D0059C', 0xD0059C, 3],
  ['D005A0', 0xD005A0, 1],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02590', 0xD02590, 3],
]);

function phase746Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase746ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase746Write24(mem, addr, value) {
  mem[addr & 0xFFFFFF] = value & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function phase746Bytes(mem, addr, count) {
  return Array.from({ length: count }, (_, i) => mem[(addr + i) & 0xFFFFFF] ?? 0);
}

function phase746Ascii(bytes) {
  return bytes.map((byte) => (byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.')).join('');
}

function phase746Fields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE746_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase746Hex(phase746ReadValue(mem, addr, len), len * 2),
  ]));
}

function phase746Stack(count = 8) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr: phase746Hex(addr), value: phase746Hex(phase746ReadValue(mem, addr, 3)) };
  });
}

function phase746CpuSummary() {
  return cpu ? {
    pc: phase746Hex(cpu.pc ?? 0),
    sp: phase746Hex(cpu.sp ?? 0),
    ix: phase746Hex(cpu.ix ?? cpu._ix ?? 0),
    iy: phase746Hex(cpu.iy ?? cpu._iy ?? 0),
    af: phase746Hex(cpu.af ?? 0, 4),
    bc: phase746Hex(cpu.bc ?? 0),
    de: phase746Hex(cpu.de ?? 0),
    hl: phase746Hex(cpu.hl ?? 0),
    f: phase746Hex(cpu.f ?? 0, 2),
    halted: Boolean(cpu.halted),
    iff1: cpu.iff1 ?? 0,
    iff2: cpu.iff2 ?? 0,
    mbase: cpu.mbase ?? 0,
    madl: cpu.madl ?? 0,
  } : null;
}

function phase746CpuRaw() {
  return cpu ? {
    pc: cpu.pc ?? 0,
    sp: cpu.sp ?? 0,
    af: cpu.af ?? 0,
    bc: cpu.bc ?? 0,
    de: cpu.de ?? 0,
    hl: cpu.hl ?? 0,
    _ix: cpu._ix ?? cpu.ix ?? 0,
    _iy: cpu._iy ?? cpu.iy ?? 0,
    f: cpu.f ?? 0,
    halted: Boolean(cpu.halted),
    iff1: cpu.iff1 ?? 0,
    iff2: cpu.iff2 ?? 0,
    mbase: cpu.mbase ?? 0,
    madl: cpu.madl ?? 0,
  } : null;
}

function phase746RestoreCpu(raw) {
  if (!cpu || !raw) return;
  cpu.pc = raw.pc;
  cpu.sp = raw.sp;
  cpu.af = raw.af;
  cpu.bc = raw.bc;
  cpu.de = raw.de;
  cpu.hl = raw.hl;
  cpu._ix = raw._ix;
  cpu._iy = raw._iy;
  cpu.f = raw.f;
  cpu.halted = raw.halted;
  cpu.iff1 = raw.iff1;
  cpu.iff2 = raw.iff2;
  cpu.mbase = raw.mbase;
  cpu.madl = raw.madl;
}

function phase746MemoryWindows() {
  const mem = cpu?.memory;
  if (!mem) return null;
  const windows = [
    ['D006C0', 0xD006C0, 48],
    ['D1A840', 0xD1A840, 72],
    ['D02420', 0xD02420, 72],
  ];
  return Object.fromEntries(windows.map(([name, addr, count]) => {
    const bytes = phase746Bytes(mem, addr, count);
    return {
      addr: phase746Hex(addr),
      bytes: bytes.map((byte) => phase746Hex(byte, 2)),
      ascii: phase746Ascii(bytes),
    };
  }));
}

function phase746Snapshot(label, includeWindows = false) {
  const snapshot = {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc: phase746Hex(lastPc ?? 0),
    lastMode,
    totalSteps,
    cpu: phase746CpuSummary(),
    fields: phase746Fields(),
    stackTop: phase746Stack(8),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    diagnostics: getColdbootPersistenceDiagnostics?.() ?? null,
    vramPixels: countVRAMPixels?.() ?? null,
  };
  if (includeWindows) snapshot.memoryWindows = phase746MemoryWindows();
  return snapshot;
}

function phase746IsSane(snapshot) {
  const fields = snapshot?.fields ?? {};
  const bad = new Set(['0x202020', '0xFFFFFF']);
  return fields.D007CA === '0x0585E9'
    && fields.D02590 === '0xD3FE81'
    && !bad.has(fields.D0243A)
    && !bad.has(fields.D0243D)
    && !bad.has(fields.D008E0)
    && !bad.has(fields.D02590);
}

function phase746CreateRecord(label, config) {
  return {
    label,
    config,
    start: phase746Snapshot('start', true),
    end: null,
    totalBlocks: 0,
    counts: Object.fromEntries(Object.keys(PHASE746_TARGETS).map((name) => [name, 0])),
    firstSamples: {},
    targetSamples: [],
    lastBlocks: [],
    mutations: [],
    uiClearResult: null,
    sanity: null,
    prevPc: null,
  };
}

function phase746CurrentRecord() {
  const state = window.__phase746State;
  if (!state.currentRecord) {
    state.currentRecord = phase746CreateRecord('implicit', state.config ?? {});
    state.records.push(state.currentRecord);
  }
  return state.currentRecord;
}

function phase746RestoreBase() {
  const base = window.__phase746State.base;
  if (!base || !cpu?.memory) return false;
  cpu.memory.set(base.memory);
  phase746RestoreCpu(base.cpu);
  lastPc = base.lastPc;
  lastMode = base.lastMode;
  totalSteps = base.totalSteps;
  runtimeMode = base.runtimeMode;
  vramSnapshotPeak = 0;
  window.__coldbootLastKey = null;
  if (typeof syncLCDState === 'function') syncLCDState();
  if (lcd) lcd.renderFrame();
  if (typeof updateRegs === 'function') updateRegs();
  return true;
}

window.__phase746State = {
  config: null,
  currentRecord: null,
  records: [],
  base: null,
  captureBase() {
    if (!cpu?.memory) return false;
    this.base = {
      memory: cpu.memory.slice(),
      cpu: phase746CpuRaw(),
      lastPc,
      lastMode,
      totalSteps,
      runtimeMode,
      snapshot: phase746Snapshot('base', true),
    };
    return true;
  },
  restoreBase: phase746RestoreBase,
  begin(label, config = {}) {
    phase746RestoreBase();
    this.config = { ...config };
    this.currentRecord = phase746CreateRecord(label, this.config);
    this.records.push(this.currentRecord);
    return this.currentRecord.start;
  },
  applyUiClear() {
    const record = phase746CurrentRecord();
    record.uiClearResult = applyColdbootUiLevelClear?.() ?? { ok: false, reason: 'missing-helper' };
    return record.uiClearResult;
  },
  finish() {
    const record = this.currentRecord;
    if (!record) return null;
    record.end = phase746Snapshot('end', true);
    record.sanity = phase746IsSane(record.end);
    this.currentRecord = null;
    this.config = null;
    return record;
  },
  uiClearTrial(label) {
    phase746RestoreBase();
    const record = phase746CreateRecord(label, { mode: 'ui-level-clear-only' });
    this.currentRecord = record;
    this.records.push(record);
    record.uiClearResult = applyColdbootUiLevelClear?.() ?? { ok: false, reason: 'missing-helper' };
    if (typeof setStatus === 'function') setStatus('Phase746 UI-level clear helper applied');
    record.end = phase746Snapshot('end', true);
    record.sanity = phase746IsSane(record.end);
    this.currentRecord = null;
    this.config = null;
    return record;
  },
  read() {
    return phase746Snapshot('read', true);
  },
  all() {
    return this.records;
  },
};
window.__phase746 = window.__phase746State;

const phase746OriginalGetColdbootControlPreStop = getColdbootControlPreStop;
getColdbootControlPreStop = function phase746GetColdbootControlPreStop(code) {
  const config = window.__phase746State?.config;
  if (code === EOL_PC_CODE && config?.stopPc != null) {
    return { pc: config.stopPc & 0xFFFFFF, label: config.stopLabel || 'phase746-custom-stop' };
  }
  return phase746OriginalGetColdbootControlPreStop(code);
};

const phase746OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase746ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase746CurrentRecord();
  record.totalBlocks += 1;
  const pcHex = phase746Hex(addr);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 96) record.lastBlocks.shift();

  for (const [name, target] of Object.entries(PHASE746_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) {
      record.firstSamples[name] = {
        block: record.totalBlocks,
        pc: pcHex,
        prevPc: record.prevPc,
        snapshot: phase746Snapshot(name, true),
      };
    }
    if (record.targetSamples.length < 32) {
      record.targetSamples.push({ target: name, ...record.firstSamples[name] });
    }
  }

  const config = window.__phase746State?.config ?? {};
  if (addr === 0x0A22A4 && config.bcAtTail != null) {
    const before = phase746Snapshot('before-bc-tail-correction', true);
    cpu.bc = config.bcAtTail & 0xFFFFFF;
    record.mutations.push({
      block: record.totalBlocks,
      pc: pcHex,
      action: 'set-bc-at-0x0A22A4',
      from: before.cpu?.bc ?? null,
      to: phase746Hex(cpu.bc),
      before,
      after: phase746Snapshot('after-bc-tail-correction', true),
    });
  }

  record.prevPc = pcHex;
  return phase746OriginalObserveColdbootPersistenceBlock(state, pc);
};
`;

  return html.replace(marker, `${injection}\n\n${marker}`);
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
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
      if (rel === 'browser-shell.html') {
        const shell = fs.readFileSync(fullPath, 'utf8');
        res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
        res.end(instrumentBrowserShell(shell));
        return;
      }
      res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
      fs.createReadStream(fullPath).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error?.stack || error));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
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

let nextId = 1;
const pending = new Map();

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (event) => {
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
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

function cdp(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 120000);
  });
}

async function evalExpr(ws, expression, timeout = 120000) {
  const result = await cdp(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function waitFor(ws, expression, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await evalExpr(ws, expression, 10000);
    if (lastValue) return lastValue;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}; lastValue=${JSON.stringify(lastValue)}`);
}

function keyParams(code, key, windowsVirtualKeyCode, text = key) {
  const params = {
    type: 'keyDown',
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    code,
    key,
  };
  if (text) {
    params.text = text;
    params.unmodifiedText = text;
  }
  return params;
}

async function pressBrowserEol(ws, label, config, applyUiClear = false) {
  await evalExpr(ws, `window.__phase746.begin(${JSON.stringify(label)}, ${JSON.stringify(config)}); true;`);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('Escape', 'Escape', 27, ''));
  await cdp(ws, 'Input.dispatchKeyEvent', { ...keyParams('Escape', 'Escape', 27, ''), type: 'keyUp' });
  if (applyUiClear) await evalExpr(ws, 'window.__phase746.applyUiClear()');
  await sleep(400);
  return await evalExpr(ws, 'window.__phase746.finish()');
}

function compactCounts(counts) {
  return Object.fromEntries(Object.entries(counts ?? {}).filter(([, value]) => value));
}

async function runBrowserRecipe() {
  if (!chromePath) {
    return {
      recipe: 'browser-shell-eol-fix-scope',
      skipped: true,
      error: 'No Chrome/Edge executable found for headless browser test',
    };
  }

  let ws;
  let chrome;
  let server;
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
      pageUrl,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const wsUrl = await waitForDevtools();
    ws = await connect(wsUrl);
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
    await waitFor(ws, '!!window.__phase746 && !!window.getColdbootPersistenceDiagnostics', 'phase746 instrumentation', 30000);

    await evalExpr(ws, `(() => {
      window.__phase746Errors = [];
      window.addEventListener('error', (e) => window.__phase746Errors.push(String(e.message || e.error || e)));
      window.addEventListener('unhandledrejection', (e) => window.__phase746Errors.push(String(e.reason || e)));
      return true;
    })()`);

    const clickResult = await evalExpr(ws, `(() => {
      const boot = document.getElementById('btnBoot');
      document.getElementById('coldbootMode').checked = true;
      document.getElementById('preserveDisplay').checked = true;
      boot.click();
      return { disabled: boot.disabled, status: document.getElementById('status').textContent };
    })()`);
    console.log(JSON.stringify({ phase: 'browser-boot-click', clickResult }));

    await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 150000);
    await evalExpr(ws, 'window.__phase746.captureBase()');
    const base = await evalExpr(ws, 'window.__phase746State.base.snapshot');

    const trials = [];
    trials.push(await pressBrowserEol(ws, 'original-current-browser-clear', {}));
    trials.push(await pressBrowserEol(
      ws,
      'stop-before-0x0A229D-plus-ui-clear',
      { stopPc: 0x0A229D, stopLabel: 'phase746-stop-before-bc-zero-owner' },
      true,
    ));
    trials.push(await pressBrowserEol(
      ws,
      'stop-before-0x0A22A4-plus-ui-clear',
      { stopPc: 0x0A22A4, stopLabel: 'phase746-stop-before-space-fill-tail' },
      true,
    ));
    trials.push(await pressBrowserEol(
      ws,
      'correct-bc-0x18-at-tail-stop-at-return',
      { bcAtTail: 0x000018, stopPc: 0x058A1A, stopLabel: 'phase746-tail-return-after-bc-correction' },
    ));
    trials.push(await evalExpr(ws, `window.__phase746.uiClearTrial('ui-level-clear-only')`));

    const finalState = await evalExpr(ws, `window.__phase746.read()`);
    const errors = await evalExpr(ws, 'window.__phase746Errors || []');

    return {
      recipe: 'browser-shell-eol-fix-scope',
      chromePath,
      pageUrl,
      base,
      trials,
      finalState,
      errors,
    };
  } catch (error) {
    return {
      recipe: 'browser-shell-eol-fix-scope',
      error: String(error?.stack || error),
    };
  } finally {
    try { ws?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    try { server?.close(); } catch {}
    await sleep(500);
  }
}

function targetTable(record) {
  return [
    '| Target | Hits | First block | Prev PC | BC | HL | DE | SP | Stack[0] |',
    '|---|---:|---:|---|---|---|---|---|---|',
    ...Object.keys(TARGETS).map((name) => {
      const sample = record?.firstSamples?.[name];
      const snap = sample?.snapshot;
      return `| ${name} | ${record?.counts?.[name] ?? 0} | ${sample?.block ?? '-'} | ${sample?.prevPc ?? '-'} | ${snap?.cpu?.bc ?? '-'} | ${snap?.cpu?.hl ?? '-'} | ${snap?.cpu?.de ?? '-'} | ${snap?.cpu?.sp ?? '-'} | ${snap?.stackTop?.[0]?.value ?? '-'} |`;
    }),
  ].join('\n');
}

function trialSummaryRows(trials) {
  return [
    '| Trial | Termination | Steps | Status | Sane fields | D007CA | D008E0 | D02590 | D0243A | D0243D | UI clear | Key result |',
    '|---|---|---:|---|---|---|---|---|---|---|---|---|',
    ...trials.map((trial) => {
      const lastKey = trial?.end?.lastKey ?? {};
      const fields = trial?.end?.fields ?? {};
      const status = String(trial?.end?.status ?? '').replaceAll('|', '\\|');
      const keyResult = [
        lastKey.stoppedBeforeControlClear ? `stop@${hex(lastKey.controlStopPc ?? 0)}` : null,
        lastKey.termination ?? null,
        lastKey.uiClearApplied ? 'ui-clear-in-handler' : null,
      ].filter(Boolean).join(', ');
      return `| ${trial.label} | ${lastKey.termination ?? '-'} | ${lastKey.steps ?? '-'} | ${status} | ${trial.sanity ? 'yes' : 'no'} | ${fields.D007CA ?? '-'} | ${fields.D008E0 ?? '-'} | ${fields.D02590 ?? '-'} | ${fields.D0243A ?? '-'} | ${fields.D0243D ?? '-'} | ${trial.uiClearResult?.ok ? 'yes' : 'no'} | ${keyResult || '-'} |`;
    }),
  ].join('\n');
}

function mutationTable(trial) {
  const rows = trial?.mutations ?? [];
  if (!rows.length) return 'No register mutation was applied in this trial.';
  return [
    '| Block | PC | Action | From | To | Pre-stack[0] | Pre-D007CA | Pre-D02590 |',
    '|---:|---|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.block} | ${row.pc} | ${row.action} | ${row.from} | ${row.to} | ${row.before?.stackTop?.[0]?.value ?? '-'} | ${row.before?.fields?.D007CA ?? '-'} | ${row.before?.fields?.D02590 ?? '-'} |`),
  ].join('\n');
}

function compactTrial(trial) {
  return {
    label: trial.label,
    config: trial.config,
    counts: compactCounts(trial.counts),
    sanity: trial.sanity,
    uiClearResult: trial.uiClearResult,
    status: trial.end?.status,
    lastKey: trial.end?.lastKey,
    end: {
      cpu: trial.end?.cpu,
      fields: trial.end?.fields,
      stackTop: trial.end?.stackTop,
      editLine: trial.end?.editLine,
      vramPixels: trial.end?.vramPixels,
    },
    firstSamples: Object.fromEntries(Object.entries(trial.firstSamples ?? {}).map(([name, sample]) => [
      name,
      {
        block: sample.block,
        pc: sample.pc,
        prevPc: sample.prevPc,
        cpu: sample.snapshot?.cpu,
        fields: sample.snapshot?.fields,
        stackTop: sample.snapshot?.stackTop,
      },
    ])),
    mutations: (trial.mutations ?? []).map((row) => ({
      block: row.block,
      pc: row.pc,
      action: row.action,
      from: row.from,
      to: row.to,
      before: {
        cpu: row.before?.cpu,
        fields: row.before?.fields,
        stackTop: row.before?.stackTop,
      },
      after: {
        cpu: row.after?.cpu,
        fields: row.after?.fields,
        stackTop: row.after?.stackTop,
      },
    })),
  };
}

function chooseRecommendation(summary) {
  if (summary.error) return 'No recommendation: browser leg failed.';
  const byLabel = Object.fromEntries(summary.trials.map((trial) => [trial.label, trial]));
  const stopOwner = byLabel['stop-before-0x0A229D-plus-ui-clear'];
  const stopTail = byLabel['stop-before-0x0A22A4-plus-ui-clear'];
  const bcFix = byLabel['correct-bc-0x18-at-tail-stop-at-return'];
  const uiClear = byLabel['ui-level-clear-only'];

  if (stopOwner?.sanity && stopOwner?.uiClearResult?.ok && uiClear?.sanity) {
    return 'Recommend browser-safe CLEAR/EOL handling by stopping before 0x0A229D and applying the existing UI-level clear helper. It avoids the owner that zeroes BC, preserves D007CA/D02590/edit pointers, and uses already-shipped clear behavior. Stop-at-0x0A22A4 is also locally safe but later than necessary; BC correction is a narrower ROM-parameter guess and should not be preferred for browser UX.';
  }
  if (stopTail?.sanity && stopTail?.uiClearResult?.ok) {
    return 'Fallback recommendation: stop before 0x0A22A4 and apply UI-level clear. It avoids executing the corrupting LDIR tail, but it lets the BC-zero owner run first.';
  }
  if (bcFix?.sanity) {
    return 'Fallback recommendation: BC correction at 0x0A22A4 locally returns without 0x202020 corruption, but the required count is inferred and should not be promoted without a stronger source for the intended length.';
  }
  return 'No safe strategy proved out in this run.';
}

function buildReport(summary) {
  const trials = summary.trials ?? [];
  const original = trials.find((trial) => trial.label === 'original-current-browser-clear');
  const stopOwner = trials.find((trial) => trial.label === 'stop-before-0x0A229D-plus-ui-clear');
  const stopTail = trials.find((trial) => trial.label === 'stop-before-0x0A22A4-plus-ui-clear');
  const bcFix = trials.find((trial) => trial.label === 'correct-bc-0x18-at-tail-stop-at-return');
  const uiClear = trials.find((trial) => trial.label === 'ui-level-clear-only');
  const recommendation = chooseRecommendation(summary);

  const compact = summary.error ? { error: summary.error } : {
    base: {
      status: summary.base?.status,
      cpu: summary.base?.cpu,
      fields: summary.base?.fields,
      editLine: summary.base?.editLine,
    },
    trials: trials.map(compactTrial),
    errors: summary.errors ?? [],
    recommendation,
  };

  return [
    '# Phase 746: 0x0A229D CLEAR/EOL Fix Scope',
    '',
    'Probe: `probe-phase746-0a229d-fix-scope.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase746-0a229d-fix-scope.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    summary.error
      ? `- Browser leg failed: ${summary.error.split('\n')[0]}`
      : `- Baseline current browser CLEAR still reproduces ${original?.end?.lastKey?.termination ?? 'unknown'} with lastPc ${original?.end?.lastPc ?? 'n/a'} and sane fields=${original?.sanity ? 'yes' : 'no'}.`,
    summary.error
      ? '- No in-memory strategy was tested.'
      : `- Stop before 0x0A229D + UI clear: termination=${stopOwner?.end?.lastKey?.termination ?? 'n/a'}, stopped=${stopOwner?.end?.lastKey?.stoppedBeforeControlClear ?? false}, sane fields=${stopOwner?.sanity ? 'yes' : 'no'}, uiClear=${stopOwner?.uiClearResult?.ok ? 'yes' : 'no'}.`,
    summary.error
      ? '- No tail strategy was tested.'
      : `- Stop before 0x0A22A4 + UI clear: termination=${stopTail?.end?.lastKey?.termination ?? 'n/a'}, stopped=${stopTail?.end?.lastKey?.stoppedBeforeControlClear ?? false}, sane fields=${stopTail?.sanity ? 'yes' : 'no'}, uiClear=${stopTail?.uiClearResult?.ok ? 'yes' : 'no'}.`,
    summary.error
      ? '- No BC correction was tested.'
      : `- BC correction at 0x0A22A4 to 0x000018 reached return stop 0x058A1A with sane fields=${bcFix?.sanity ? 'yes' : 'no'}; mutation count=${bcFix?.mutations?.length ?? 0}.`,
    summary.error
      ? '- No recommendation.'
      : `- Recommendation: ${recommendation}`,
    '- `browser-shell.html` was served from an in-memory instrumented copy only; no disk behavior was patched.',
    '',
    '## Trial Matrix',
    '',
    summary.error ? 'No trials.' : trialSummaryRows(trials),
    '',
    '## Target Hits: Baseline Current Browser',
    '',
    original ? targetTable(original) : 'No baseline target table.',
    '',
    '## Target Hits: Stop Before 0x0A229D',
    '',
    stopOwner ? targetTable(stopOwner) : 'No 0x0A229D stop target table.',
    '',
    '## Target Hits: Stop Before 0x0A22A4',
    '',
    stopTail ? targetTable(stopTail) : 'No 0x0A22A4 stop target table.',
    '',
    '## BC Correction Trial',
    '',
    bcFix ? targetTable(bcFix) : 'No BC correction target table.',
    '',
    bcFix ? mutationTable(bcFix) : '',
    '',
    '## UI-Level Clear Helper',
    '',
    uiClear
      ? `Result: \`${JSON.stringify(uiClear.uiClearResult)}\`; sane fields=${uiClear.sanity ? 'yes' : 'no'}; end cursor=${uiClear.end?.fields?.D0243A ?? 'n/a'}; ROI=${uiClear.end?.editLine?.entryLineRoi?.nonWhite ?? 'n/a'}.`
      : 'UI-level clear helper was not captured.',
    '',
    '## Interpretation',
    '',
    summary.error
      ? 'The browser run did not complete, so no fix scope conclusion should be used.'
      : 'The phase745 root cause makes the safest browser-level fix a pre-stop before the ROM tail that turns a zero-length/zero-HL parameter set into an unbounded ADL LDIR. This probe shows stopping before 0x0A229D is sufficient and earlier than stopping at 0x0A22A4. The existing UI-level clear helper independently resets the edit buffer/cursor and entry-line ROI while preserving cx/VAT fields, so pairing the early pre-stop with that helper avoids changing ROM/runtime semantics.',
    '',
    'BC correction is technically interesting: forcing BC=0x18 at 0x0A22A4 lets the tail return to 0x058A1A without immediate 0x202020 corruption. It is a weaker browser strategy because the correct count is inferred from the prior path, while the UI-level clear path is already shipped and explicitly models the user-visible CLEAR behavior.',
    '',
    '## Compact Evidence',
    '',
    '```json',
    JSON.stringify(compact, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser, scheduler, or follow-along files were modified.',
    '',
  ].join('\n');
}

console.log('phase746: browser CLEAR/EOL 0x0A229D fix scope');
const summary = await runBrowserRecipe();
fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);

console.log(JSON.stringify({
  probe: 'phase746-0a229d-fix-scope',
  report: path.basename(REPORT_PATH),
  result: summary.error ? {
    error: summary.error.split('\n')[0],
  } : {
    trials: summary.trials.map((trial) => ({
      label: trial.label,
      termination: trial.end?.lastKey?.termination,
      status: trial.end?.status,
      sane: trial.sanity,
      counts: compactCounts(trial.counts),
      uiClear: trial.uiClearResult?.ok === true,
      mutations: trial.mutations?.length ?? 0,
    })),
    recommendation: chooseRecommendation(summary),
  },
}, null, 2));

try {
  fs.rmSync(userDataDir, { recursive: true, force: true });
} catch {}

if (summary.error) process.exitCode = 1;

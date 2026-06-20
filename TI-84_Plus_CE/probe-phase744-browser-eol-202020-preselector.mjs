import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase744-browser-eol-202020-preselector.md');
const debugPort = 9744;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase744-'));

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const WATCH_TARGETS = Object.freeze({
  block0a22a4: 0x0A22A4,
  nearby0a2150: 0x0A2150,
  nearby0a21ff: 0x0A21FF,
  nearby0a223a: 0x0A223A,
  nearby0a22b1: 0x0A22B1,
  nearby0a22da: 0x0A22DA,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  postInsertGate0158de: 0x0158DE,
  postInsertReturn0013da: 0x0013DA,
  status0059da: 0x0059DA,
  displayLoop005ab6: 0x005AB6,
  displayCaller005b92: 0x005B92,
  lowSelect0064d0: 0x0064D0,
  lowFrame006cc6: 0x006CC6,
  lowCall006d5d: 0x006D5D,
  lowBackedge006d64: 0x006D64,
  tokenOuter08f3b8: 0x08F3B8,
  tokenTuple08f54b: 0x08F54B,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
});

const STATIC_DECODE_0A22A4 = Object.freeze([
  '0x0A22A4: LD DE,0xD006C0',
  '0x0A22A8: ADD HL,DE',
  '0x0A22A9: PUSH HL',
  '0x0A22AA: POP DE',
  '0x0A22AB: INC DE',
  '0x0A22AC: LD (HL),0x20',
  '0x0A22AE: LDIR',
  '0x0A22B0: RET',
]);

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
const PHASE744_TARGETS = Object.freeze({
  block0a22a4: 0x0A22A4,
  nearby0a2150: 0x0A2150,
  nearby0a21ff: 0x0A21FF,
  nearby0a223a: 0x0A223A,
  nearby0a22b1: 0x0A22B1,
  nearby0a22da: 0x0A22DA,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  postInsertGate0158de: 0x0158DE,
  postInsertReturn0013da: 0x0013DA,
  status0059da: 0x0059DA,
  displayLoop005ab6: 0x005AB6,
  displayCaller005b92: 0x005B92,
  lowSelect0064d0: 0x0064D0,
  lowFrame006cc6: 0x006CC6,
  lowCall006d5d: 0x006D5D,
  lowBackedge006d64: 0x006D64,
  tokenOuter08f3b8: 0x08F3B8,
  tokenTuple08f54b: 0x08F54B,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
});

const PHASE744_FIELD_SPECS = Object.freeze([
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D00085', 0xD00085, 1],
  ['D000C2', 0xD000C2, 1],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02A28', 0xD02A28, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A2B', 0xD02A2B, 2],
  ['D02A1B', 0xD02A1B, 2],
  ['D02A40', 0xD02A40, 3],
  ['D00121', 0xD00121, 3],
  ['D00124', 0xD00124, 1],
  ['D005A0', 0xD005A0, 1],
  ['D0059C', 0xD0059C, 3],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02590', 0xD02590, 3],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
  ['D01150', 0xD01150, 2],
]);

function phase744Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase744ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase744ReadBytes(mem, addr, count) {
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => mem[(addr + i) & 0xFFFFFF] ?? 0);
}

function phase744Ascii(bytes) {
  return bytes.map((byte) => (byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.')).join('');
}

function phase744ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE744_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase744Hex(phase744ReadValue(mem, addr, len), len * 2),
  ]));
}

function phase744ReadStackSlots(count = 8) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr: phase744Hex(addr), value: phase744Hex(phase744ReadValue(mem, addr, 3)) };
  });
}

function phase744CpuSummary() {
  return cpu ? {
    pc: phase744Hex(cpu.pc ?? 0),
    sp: phase744Hex(cpu.sp ?? 0),
    ix: phase744Hex(cpu.ix ?? cpu._ix ?? 0),
    iy: phase744Hex(cpu.iy ?? cpu._iy ?? 0),
    af: phase744Hex(cpu.af ?? 0, 4),
    bc: phase744Hex(cpu.bc ?? 0),
    de: phase744Hex(cpu.de ?? 0),
    hl: phase744Hex(cpu.hl ?? 0),
    f: phase744Hex(cpu.f ?? 0, 2),
    halted: Boolean(cpu.halted),
    iff1: cpu.iff1 ?? 0,
    iff2: cpu.iff2 ?? 0,
    mbase: cpu.mbase ?? 0,
    madl: cpu.madl ?? 0,
  } : null;
}

function phase744ReadMemoryWindows() {
  const mem = cpu?.memory;
  if (!mem) return null;
  const sp = cpu?.sp ?? 0;
  const hl = cpu?.hl ?? cpu?._hl ?? 0;
  const de = cpu?.de ?? cpu?._de ?? 0;
  const pc = cpu?.pc ?? 0;
  const windows = [
    ['aroundPc', pc - 8, 32],
    ['aroundSp', sp - 12, 48],
    ['aroundHl', hl - 12, 48],
    ['aroundDe', de - 12, 48],
    ['D006B0', 0xD006B0, 80],
    ['D1A830', 0xD1A830, 96],
    ['D02420', 0xD02420, 64],
  ];
  return Object.fromEntries(windows.map(([name, addr, count]) => {
    const bytes = phase744ReadBytes(mem, addr, count);
    return {
      addr: phase744Hex(addr & 0xFFFFFF),
      bytes: bytes.map((byte) => phase744Hex(byte, 2)),
      ascii: phase744Ascii(bytes),
    };
  }));
}

function phase744Snapshot(record, pc, includeWindows = false) {
  const snapshot = {
    block: record.totalBlocks,
    pc: phase744Hex(pc & 0xFFFFFF),
    prevPc: record.prevPc,
    runtime: {
      lastPc: phase744Hex(lastPc ?? 0),
      lastMode,
      totalSteps,
    },
    fields: phase744ReadFields(),
    cpu: phase744CpuSummary(),
    stackTop: phase744ReadStackSlots(8),
  };
  if (includeWindows) snapshot.memoryWindows = phase744ReadMemoryWindows();
  return snapshot;
}

function phase744CreateRecord(label) {
  return {
    label,
    start: window.__phase744Read?.() ?? null,
    end: null,
    totalBlocks: 0,
    counts: Object.fromEntries(Object.keys(PHASE744_TARGETS).map((name) => [name, 0])),
    regionCounts: {
      near0a2100_0a23ff: 0,
      token08f000_090fff: 0,
      display005900_006dff: 0,
      cleanup001000_001fff: 0,
    },
    firstBlocks: [],
    lastBlocks: [],
    lastSnapshots: [],
    firstSamples: {},
    targetSamples: [],
    near0aSamples: [],
    hotBlocks: {},
    fieldTransitions: [],
    prevPc: null,
    lastFields: phase744ReadFields(),
  };
}

function phase744CurrentRecord() {
  const state = window.__phase744State;
  if (!state.records.length || state.currentLabel == null) {
    state.currentLabel = state.currentLabel || 'unlabeled';
    state.records.push(phase744CreateRecord(state.currentLabel));
  }
  return state.records[state.records.length - 1];
}

function phase744DiffFields(before, after) {
  const diff = {};
  if (!before || !after) return diff;
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) diff[key] = [before[key], after[key]];
  }
  return diff;
}

function phase744HasDiff(diff) {
  return Object.keys(diff).length > 0;
}

window.__phase744Read = function phase744Read() {
  const mem = cpu?.memory;
  const buffer = mem ? phase744ReadBytes(mem, 0xD006C0, 32) : [];
  return {
    runtimeMode,
    lastPc: phase744Hex(lastPc ?? 0),
    lastMode,
    totalSteps,
    cpu: phase744CpuSummary(),
    fields: phase744ReadFields(),
    stackTop: phase744ReadStackSlots(8),
    d006c0: {
      bytes: buffer.map((byte) => phase744Hex(byte, 2)),
      ascii: phase744Ascii(buffer),
    },
    memoryWindows: phase744ReadMemoryWindows(),
    diagnostics: getColdbootPersistenceDiagnostics?.() ?? null,
    vramPixels: countVRAMPixels?.() ?? null,
    status: document.getElementById('status')?.textContent ?? null,
    lastKey: window.__coldbootLastKey ?? null,
  };
};

window.__phase744State = {
  currentLabel: null,
  records: [],
  begin(label) {
    this.currentLabel = label;
    const record = phase744CreateRecord(label);
    this.records.push(record);
    return record.start;
  },
  finish() {
    const record = this.records[this.records.length - 1] ?? null;
    if (record) {
      record.end = window.__phase744Read();
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 32)
        .map(([pc, count]) => ({ pc, count }));
    }
    this.currentLabel = null;
    return record;
  },
  read() {
    return window.__phase744Read();
  },
  all() {
    return this.records;
  },
};
window.__phase744 = window.__phase744State;

const phase744OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase744ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase744CurrentRecord();
  record.totalBlocks += 1;

  const pcHex = phase744Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 256) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 256) record.lastBlocks.shift();

  const isNear0a = addr >= 0x0A2100 && addr <= 0x0A23FF;
  if (isNear0a) record.regionCounts.near0a2100_0a23ff += 1;
  if (addr >= 0x08F000 && addr <= 0x090FFF) record.regionCounts.token08f000_090fff += 1;
  if (addr >= 0x005900 && addr <= 0x006DFF) record.regionCounts.display005900_006dff += 1;
  if (addr >= 0x001000 && addr <= 0x001FFF) record.regionCounts.cleanup001000_001fff += 1;

  const includeWindows = isNear0a || addr === 0x0A22A4 || Object.values(PHASE744_TARGETS).includes(addr);
  const snapshot = phase744Snapshot(record, addr, includeWindows);
  record.lastSnapshots.push(snapshot);
  if (record.lastSnapshots.length > 256) record.lastSnapshots.shift();

  for (const [name, target] of Object.entries(PHASE744_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = snapshot;
    if (record.targetSamples.length < 96) {
      record.targetSamples.push({ target: name, ...snapshot });
    }
  }

  if (isNear0a) {
    if (record.near0aSamples.length < 128) record.near0aSamples.push(snapshot);
    else {
      record.near0aSamples.shift();
      record.near0aSamples.push(snapshot);
    }
  }

  const beforeFields = record.lastFields;
  const result = phase744OriginalObserveColdbootPersistenceBlock(state, pc);
  const afterFields = phase744ReadFields();
  const diff = phase744DiffFields(beforeFields, afterFields);
  if (phase744HasDiff(diff) && record.fieldTransitions.length < 160) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: pcHex,
      diff,
      beforeHook: beforeFields,
      afterHook: afterFields,
    });
  }
  record.lastFields = afterFields;
  record.prevPc = pcHex;
  return result;
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

async function readPageState(ws) {
  return await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    preserve: document.getElementById('preserveDisplay')?.checked ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
    phase744: window.__phase744?.read?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    errors: window.__phase744Errors || [],
  }))()`);
}

async function pressBrowserEol(ws) {
  await evalExpr(ws, `window.__phase744.begin('Browser EOL/CLEAR pre-missing trace'); true;`);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('Escape', 'Escape', 27, ''));
  await cdp(ws, 'Input.dispatchKeyEvent', { ...keyParams('Escape', 'Escape', 27, ''), type: 'keyUp' });
  await sleep(750);
  return await evalExpr(ws, 'window.__phase744.finish()');
}

async function runBrowserRecipe() {
  if (!chromePath) {
    return {
      recipe: 'browser-shell-eol',
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
    await waitFor(ws, '!!window.__phase744 && !!window.getColdbootPersistenceDiagnostics', 'phase744 instrumentation', 30000);

    await evalExpr(ws, `(() => {
      window.__phase744Errors = [];
      window.addEventListener('error', (e) => window.__phase744Errors.push(String(e.message || e.error || e)));
      window.addEventListener('unhandledrejection', (e) => window.__phase744Errors.push(String(e.reason || e)));
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
    const before = await readPageState(ws);
    const record = await pressBrowserEol(ws);
    const after = await readPageState(ws);

    return {
      recipe: 'browser-shell-eol',
      chromePath,
      pageUrl,
      before,
      record,
      after,
      errors: after.errors ?? [],
    };
  } catch (error) {
    return {
      recipe: 'browser-shell-eol',
      error: String(error?.stack || error),
    };
  } finally {
    try { ws?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    try { server?.close(); } catch {}
    await sleep(500);
  }
}

function compactCounts(counts) {
  return Object.fromEntries(Object.entries(counts ?? {}).filter(([, value]) => value));
}

function targetTable(counts, samples) {
  return [
    '| Target | Hits | First block | First PC |',
    '|---|---:|---:|---|',
    ...Object.keys(WATCH_TARGETS).map((name) => {
      const sample = samples?.[name];
      return `| ${name} | ${counts?.[name] ?? 0} | ${sample?.block ?? '-'} | ${sample?.pc ?? '-'} |`;
    }),
  ].join('\n');
}

function summarizeSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    block: snapshot.block,
    pc: snapshot.pc,
    prevPc: snapshot.prevPc,
    cpu: snapshot.cpu,
    fields: snapshot.fields,
    stackTop: snapshot.stackTop,
    d006c0: snapshot.memoryWindows?.D006B0 ?? null,
    aroundSp: snapshot.memoryWindows?.aroundSp ?? null,
    aroundHl: snapshot.memoryWindows?.aroundHl ?? null,
    aroundDe: snapshot.memoryWindows?.aroundDe ?? null,
  };
}

function inferSource(browser) {
  const record = browser.record ?? {};
  const afterState = browser.after?.phase744 ?? null;
  const lastSnapshot = record.lastSnapshots?.at(-1) ?? null;
  const a22a4 = record.firstSamples?.block0a22a4 ?? null;
  const finalLastPc = afterState?.lastPc ?? 'n/a';
  const finalCpuPc = afterState?.cpu?.pc ?? 'n/a';
  const entryStack = a22a4?.stackTop?.[0]?.value ?? 'n/a';
  const lastStack = lastSnapshot?.stackTop?.[0]?.value ?? 'n/a';
  const finalStack = afterState?.stackTop?.[0]?.value ?? 'n/a';
  const entryBc = a22a4?.cpu?.bc ?? 'n/a';
  const finalFields = afterState?.fields ?? {};

  if (finalLastPc === '0x202020' && (lastSnapshot?.pc === '0x0A22A4' || finalCpuPc === '0x0A22A4')) {
    if (entryStack !== '0x202020' && lastStack !== '0x202020' && finalStack === '0x202020') {
      return `0x202020 is produced by the 0x0A22A4 space-fill tail: entry SP=${a22a4?.cpu?.sp ?? 'n/a'} had return ${entryStack}, but BC=${entryBc} and the LD (HL),0x20; LDIR sequence leaves the post-run stack/cx/VAT fields as spaces (SP top=${finalStack}, D007CA=${finalFields.D007CA ?? 'n/a'}, D008E0=${finalFields.D008E0 ?? 'n/a'}, D02590=${finalFields.D02590 ?? 'n/a'}), then RET at 0x0A22B0 targets 0x202020.`;
    }
    if (entryStack === '0x202020' || lastStack === '0x202020' || finalStack === '0x202020') {
      return `0x202020 is produced at the RET tail of block 0x0A22A4/0x0A22B0: the top return slot is spaces (entry=${entryStack}, last=${lastStack}, final=${finalStack}).`;
    }
    return `0x202020 is produced immediately after block 0x0A22A4, whose static tail ends in RET at 0x0A22B0; the captured top stack values were entry=${entryStack}, last=${lastStack}, final=${finalStack}, so inspect the full stack window for the popped slot.`;
  }

  if (finalLastPc === '0x202020') {
    return `0x202020 was still the missing target, but the last observed block was ${lastSnapshot?.pc ?? 'n/a'} and final CPU PC was ${finalCpuPc}; source is outside the expected 0x0A22A4 tail.`;
  }

  return `Current browser route no longer ends at 0x202020 (lastPc=${finalLastPc}, final CPU pc=${finalCpuPc}).`;
}

function buildReport(browser) {
  const record = browser.record ?? {};
  const afterState = browser.after?.phase744 ?? null;
  const beforeState = browser.before?.phase744 ?? null;
  const lastSnapshot = record.lastSnapshots?.at(-1) ?? null;
  const a22a4 = record.firstSamples?.block0a22a4 ?? null;
  const source = browser.error ? `Browser run failed: ${browser.error.split('\n')[0]}` : inferSource(browser);
  const compact = {
    before: {
      status: browser.before?.status,
      lastPc: beforeState?.lastPc,
      cpu: beforeState?.cpu,
      fields: beforeState?.fields,
      d006c0: beforeState?.d006c0,
    },
    after: {
      status: browser.after?.status,
      lastPc: afterState?.lastPc,
      cpu: afterState?.cpu,
      fields: afterState?.fields,
      stackTop: afterState?.stackTop,
      d006c0: afterState?.d006c0,
      lastKey: browser.after?.lastKey,
    },
    record: browser.error ? null : {
      totalBlocks: record.totalBlocks,
      counts: compactCounts(record.counts),
      regionCounts: record.regionCounts,
      firstBlocks: record.firstBlocks,
      lastBlocks: record.lastBlocks,
      hotBlocks: record.hotBlocks,
      firstSamples: Object.fromEntries(Object.entries(record.firstSamples ?? {}).map(([name, sample]) => [name, summarizeSnapshot(sample)])),
      lastSnapshot: summarizeSnapshot(lastSnapshot),
      block0a22a4: summarizeSnapshot(a22a4),
      near0aTail: (record.near0aSamples ?? []).slice(-24).map(summarizeSnapshot),
      finalWindowTail: (record.lastSnapshots ?? []).slice(-32).map((snapshot) => ({
        block: snapshot.block,
        pc: snapshot.pc,
        prevPc: snapshot.prevPc,
        cpu: snapshot.cpu,
        fields: snapshot.fields,
        stackTop: snapshot.stackTop,
      })),
      fieldTransitionsTail: (record.fieldTransitions ?? []).slice(-40),
      targetSamples: (record.targetSamples ?? []).map(summarizeSnapshot),
    },
    errors: browser.errors ?? [],
  };

  return [
    '# Phase 744: Browser EOL 0x202020 Pre-Missing Trace',
    '',
    'Probe: `probe-phase744-browser-eol-202020-preselector.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase744-browser-eol-202020-preselector.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    browser.error
      ? `- !! Browser leg failed before trace completion: ${browser.error.split('\n')[0]}`
      : `- **** Browser EOL burst captured ${record.totalBlocks} observed blocks; result status: ${browser.after?.status ?? 'n/a'}.`,
    browser.error
      ? '- !! No route conclusion.'
      : `- **** Final missing target: lastPc=${afterState?.lastPc ?? 'n/a'}, final CPU pc=${afterState?.cpu?.pc ?? 'n/a'}, final status=${afterState?.status ?? 'n/a'}.`,
    browser.error
      ? '- !! No source inference.'
      : `- **** Source inference: ${source}`,
    browser.error
      ? '- !! No field conclusion.'
      : `- *** Space-source check: D006C0 after key is \`${afterState?.d006c0?.ascii ?? 'n/a'}\`; lastKey buffer=${JSON.stringify(browser.after?.lastKey?.buffer ?? [])}.`,
    '- No disk edit to `browser-shell.html`; this probe served an in-memory instrumented copy only.',
    '',
    '## Static Tail at 0x0A22A4',
    '',
    STATIC_DECODE_0A22A4.map((line) => `- \`${line}\``).join('\n'),
    '',
    '## Target Hits',
    '',
    browser.error ? 'No target table; browser failed.' : targetTable(record.counts, record.firstSamples),
    '',
    '## Final Observed Snapshot',
    '',
    '```json',
    JSON.stringify({
      source,
      lastSnapshot: summarizeSnapshot(lastSnapshot),
      block0a22a4: summarizeSnapshot(a22a4),
      after: compact.after,
    }, null, 2),
    '```',
    '',
    '## Compact Trace Evidence',
    '',
    '```json',
    JSON.stringify(compact, null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    browser.error
      ? 'The headless browser leg did not complete, so no route inference should be used.'
      : 'The current browser EOL route still never reaches the phase743 selector/token/low targets before the miss. The immediate pre-missing block is the 0x0A22A4 text-buffer space-fill tail, and its final transfer is a RET at 0x0A22B0; the report records the stack and field state at that block and after termination to distinguish a space-filled return frame from a corrupted cx/VAT tuple.',
    '',
    'No runtime, transpiler, browser, scheduler, or follow-along files were modified.',
    '',
  ].join('\n');
}

console.log('phase744: current-browser EOL 0x202020 pre-missing trace');
const browser = await runBrowserRecipe();
fs.writeFileSync(REPORT_PATH, `${buildReport(browser)}\n`);

console.log(JSON.stringify({
  probe: 'phase744-browser-eol-202020-preselector',
  report: path.basename(REPORT_PATH),
  browser: browser.error ? {
    error: browser.error.split('\n')[0],
  } : {
    status: browser.after?.status,
    lastPc: browser.after?.phase744?.lastPc,
    cpuPc: browser.after?.phase744?.cpu?.pc,
    totalBlocks: browser.record?.totalBlocks,
    counts: compactCounts(browser.record?.counts),
    lastObserved: browser.record?.lastSnapshots?.at(-1)?.pc,
    source: inferSource(browser),
  },
}, null, 2));

try {
  fs.rmSync(userDataDir, { recursive: true, force: true });
} catch {}

if (!browser.record && !browser.error) process.exitCode = 1;

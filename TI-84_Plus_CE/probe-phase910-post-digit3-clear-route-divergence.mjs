import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase910-post-digit3-clear-route-divergence.md');
const CLEAR_CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const RAM_BASE = 0xD00000;
const DEBUG_PORT = 9910;
const EDIT_BUFFER_BASE = 0xD1A8CC;
const SEQUENCE_CONTEXT = 10;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase910-route-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const WATCHED_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02505', 0xD02505, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D0301B', 0xD0301B, 3],
  ['D000C2_IY42', 0xD000C2, 1],
  ['D000C4_IY44', 0xD000C4, 1],
  ['D000CA_IY4A', 0xD000CA, 1],
  ['D00587', 0xD00587, 1],
  ['D00588', 0xD00588, 1],
  ['D00589', 0xD00589, 1],
  ['D0058B', 0xD0058B, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D0059A', 0xD0059A, 1],
  ['EDIT_TOKEN_D1A8CC', EDIT_BUFFER_BASE, 1],
]);

const TARGETS = Object.freeze({
  eventLoop08C331: 0x08C331,
  getCsc03FA09: 0x03FA09,
  keyDebounceBranch03F998: 0x03F998,
  keyDebounceCompare03F99A: 0x03F99A,
  keyDebounceOr03F9AB: 0x03F9AB,
  keyDebounceCounter03F9AE: 0x03F9AE,
  keyDebounceFallthrough03F9B0: 0x03F9B0,
  keyDebouncePost03F9B8: 0x03F9B8,
  keyDebounceReturn03D058: 0x03D058,
  insertGate0158DE: 0x0158DE,
  insertGateReturn0013DA: 0x0013DA,
  flagCaller058A10: 0x058A10,
  flagOwner058212: 0x058212,
  flagGate0800B8: 0x0800B8,
  flagBranch058216: 0x058216,
  flagCompare05E3E3: 0x05E3E3,
  flagCompareD0243D05E3F5: 0x05E3F5,
  flagCompareD0243A05E3E8: 0x05E3E8,
  flagCompare04C973: 0x04C973,
  flagCompareReturn05E3E7: 0x05E3E7,
  flagCompareReturn058221: 0x058221,
  flagReturn058A14: 0x058A14,
  clearFallthrough058A16: 0x058A16,
  clearTaken058A2C: 0x058A2C,
  clearEntry0A223A: 0x0A223A,
  clearAnchor0A229D: 0x0A229D,
  preWipe001879: 0x001879,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});

const FLAG_OWNER_PCS = new Set([
  0x058A10,
  0x058212,
  0x0800B8,
  0x058216,
  0x05E3E3,
  0x05E3F5,
  0x04C973,
  0x05E3E7,
  0x05E3E8,
  0x058221,
  0x058A14,
]);

const DIGIT3_KEY = Object.freeze({
  code: 'Digit3',
  key: '3',
  vk: 51,
});

const CLEAR_KEY = Object.freeze({
  code: 'Escape',
  key: 'Escape',
  vk: 27,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

function valueWidth(name) {
  if (/^D000/.test(name) || /^D005/.test(name) || name === 'D010F4' || name === 'D02505' || name === 'EDIT_TOKEN_D1A8CC') return 2;
  if (name === 'D02A29') return 4;
  return 6;
}

function formatValue(name, value) {
  return value == null ? null : hex(value, valueWidth(name));
}

function formatFields(fields) {
  if (!fields) return null;
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, formatValue(name, value)]));
}

function readValue(bytes, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (bytes[(addr + i) >>> 0] ?? 0) << (8 * i);
  return value >>> 0;
}

function readCaptureValue(buffer, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > buffer.length) return null;
  return readValue(buffer, offset, len);
}

function readCaptureFields() {
  const capture = fs.readFileSync(CLEAR_CAPTURE_PATH);
  return Object.fromEntries(WATCHED_FIELDS.map(([name, addr, len]) => [name, readCaptureValue(capture, addr, len)]));
}

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

function instrumentBrowserShell(sourceHtml) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!sourceHtml.includes(marker)) throw new Error('Phase910 marker not found: finalizeColdbootPersistenceState');

  const instrumentation = String.raw`
const PHASE910_SEQUENCE_LIMIT = 16000;
const PHASE910_TARGET_SAMPLE_LIMIT = 320;
const PHASE910_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02505', 0xD02505, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D0301B', 0xD0301B, 3],
  ['D000C2_IY42', 0xD000C2, 1],
  ['D000C4_IY44', 0xD000C4, 1],
  ['D000CA_IY4A', 0xD000CA, 1],
  ['D00587', 0xD00587, 1],
  ['D00588', 0xD00588, 1],
  ['D00589', 0xD00589, 1],
  ['D0058B', 0xD0058B, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D0059A', 0xD0059A, 1],
  ['EDIT_TOKEN_D1A8CC', 0xD1A8CC, 1],
]);
const PHASE910_TARGETS = Object.freeze({
  eventLoop08C331: 0x08C331,
  getCsc03FA09: 0x03FA09,
  keyDebounceBranch03F998: 0x03F998,
  keyDebounceCompare03F99A: 0x03F99A,
  keyDebounceOr03F9AB: 0x03F9AB,
  keyDebounceCounter03F9AE: 0x03F9AE,
  keyDebounceFallthrough03F9B0: 0x03F9B0,
  keyDebouncePost03F9B8: 0x03F9B8,
  keyDebounceReturn03D058: 0x03D058,
  insertGate0158DE: 0x0158DE,
  insertGateReturn0013DA: 0x0013DA,
  flagCaller058A10: 0x058A10,
  flagOwner058212: 0x058212,
  flagGate0800B8: 0x0800B8,
  flagBranch058216: 0x058216,
  flagCompare05E3E3: 0x05E3E3,
  flagCompareD0243D05E3F5: 0x05E3F5,
  flagCompareD0243A05E3E8: 0x05E3E8,
  flagCompare04C973: 0x04C973,
  flagCompareReturn05E3E7: 0x05E3E7,
  flagCompareReturn058221: 0x058221,
  flagReturn058A14: 0x058A14,
  clearFallthrough058A16: 0x058A16,
  clearTaken058A2C: 0x058A2C,
  clearEntry0A223A: 0x0A223A,
  clearAnchor0A229D: 0x0A229D,
  preWipe001879: 0x001879,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});

function phase910ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase910ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE910_FIELDS.map(([name, addr, len]) => [
    name,
    phase910ReadValue(mem, addr, len),
  ]));
}

function phase910CpuRaw() {
  if (!cpu) return null;
  return {
    pc: cpu.pc ?? 0,
    currentBlockPc: cpu._currentBlockPc ?? cpu.pc ?? 0,
    sp: cpu.sp ?? 0,
    af: cpu.af ?? 0,
    bc: cpu.bc ?? 0,
    de: cpu.de ?? 0,
    hl: cpu.hl ?? 0,
    ix: cpu._ix ?? cpu.ix ?? 0,
    iy: cpu._iy ?? cpu.iy ?? 0,
    f: cpu.f ?? 0,
    halted: Boolean(cpu.halted),
  };
}

function phase910StackTop(count = 5) {
  const mem = cpu?.memory;
  if (!mem || !cpu) return [];
  const sp = cpu.sp & 0xFFFFFF;
  return Array.from({ length: count }, (_, index) => {
    const addr = (sp + index * 3) & 0xFFFFFF;
    return { addr, value: phase910ReadValue(mem, addr, 3) };
  });
}

function phase910Capture(label, pc = null, prevPc = null, block = null, seqIndex = null) {
  return {
    label,
    block,
    seqIndex,
    pc,
    prevPc,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase910CpuRaw(),
    fields: phase910ReadFields(),
    stackTop: phase910StackTop(),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__Phase910PageErrors ?? [])],
  };
}

function phase910CreateRecord(label) {
  return {
    label,
    active: true,
    blockCount: 0,
    prevPc: null,
    sequence: [],
    sequenceLimitReached: false,
    start: null,
    end: null,
    lastFields: null,
    targetCounts: Object.fromEntries(Object.keys(PHASE910_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    targetSamples: [],
    fieldChanges: [],
  };
}

function phase910CurrentRecord() {
  const record = window.__Phase910?.records?.at(-1) ?? null;
  return record?.active ? record : null;
}

window.__Phase910PageErrors = [];
window.addEventListener('error', (event) => {
  window.__Phase910PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__Phase910PageErrors.push(String(event.reason || event));
});

window.__Phase910 = {
  records: [],
  uiClearSamples: [],
  read: phase910Capture,
  begin(label) {
    const record = phase910CreateRecord(label);
    record.start = phase910Capture('start');
    record.lastFields = phase910ReadFields();
    this.records.push(record);
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (!record) return null;
    record.active = false;
    record.end = phase910Capture('end');
    return record;
  },
};

const Phase910OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function Phase910ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase910CurrentRecord();
  if (record) {
    const seqIndex = record.sequence.length;
    record.blockCount += 1;
    if (record.sequence.length < PHASE910_SEQUENCE_LIMIT) record.sequence.push(addr);
    else record.sequenceLimitReached = true;

    const fields = phase910ReadFields();
    if (fields && record.lastFields) {
      for (const [name] of PHASE910_FIELDS) {
        if (fields[name] === record.lastFields[name]) continue;
        if (record.fieldChanges.length < 120) {
          record.fieldChanges.push({
            block: record.blockCount,
            seqIndex,
            name,
            before: record.lastFields[name],
            after: fields[name],
            pc: addr,
            prevPc: record.prevPc,
          });
        }
      }
    }
    record.lastFields = fields;

    for (const [name, target] of Object.entries(PHASE910_TARGETS)) {
      if (addr !== target) continue;
      record.targetCounts[name] += 1;
      const sample = phase910Capture(name, addr, record.prevPc, record.blockCount, seqIndex);
      if (!record.targetFirst[name]) record.targetFirst[name] = sample;
      if (record.targetSamples.length < PHASE910_TARGET_SAMPLE_LIMIT) record.targetSamples.push(sample);
    }
  }
  const result = Phase910OriginalObserveColdbootPersistenceBlock(state, pc);
  if (record) record.prevPc = addr;
  return result;
};

const Phase910OriginalApplyColdbootUiLevelClear = applyColdbootUiLevelClear;
applyColdbootUiLevelClear = function Phase910ApplyColdbootUiLevelClear() {
  const before = phase910Capture('uiClearBefore');
  const result = Phase910OriginalApplyColdbootUiLevelClear();
  const after = phase910Capture('uiClearAfter');
  const changes = [];
  const beforeFields = before.fields ?? {};
  const afterFields = after.fields ?? {};
  for (const [name] of PHASE910_FIELDS) {
    if (beforeFields[name] === afterFields[name]) continue;
    changes.push({ name, before: beforeFields[name], after: afterFields[name], owner: 'applyColdbootUiLevelClear' });
  }
  window.__Phase910.uiClearSamples.push({ before, result, after, changes });
  return result;
};
`;

  return sourceHtml.replace(marker, `${instrumentation}\n\n${marker}`);
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
      const pages = await httpJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
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

function keyParams(keySpec, type) {
  return {
    type,
    windowsVirtualKeyCode: keySpec.vk,
    nativeVirtualKeyCode: keySpec.vk,
    code: keySpec.code,
    key: keySpec.key,
  };
}

async function loadAndBoot(pageUrl, label) {
  await cdp(ws, 'Page.navigate', { url: `${pageUrl}?phase910=${encodeURIComponent(label)}-${Date.now()}` }, 30000);
  await waitFor(ws, 'document.readyState === "complete"', `${label} page load`, 30000);
  await waitFor(ws, '!!window.__Phase910 && !!window.__coldbootReadEditLineState', `${label} Phase910 instrumentation`, 30000);
  await sleep(500);
  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, `${label} coldboot completion`, 180000);
  await sleep(150);
  return evalExpr(ws, `window.__Phase910.read('${label}:afterBoot')`, 30000);
}

async function pressKey(keySpec, label) {
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${keySpec.code}'`, `${label} completion`, 90000);
  await sleep(150);
  return evalExpr(ws, `window.__Phase910.read('${label}:afterKey')`, 30000);
}

async function runStandaloneClear(pageUrl) {
  const afterBoot = await loadAndBoot(pageUrl, 'standalone');
  await evalExpr(ws, `window.__Phase910.begin('standalone Escape/CLEAR')`, 30000);
  const afterClear = await pressKey(CLEAR_KEY, 'standalone Escape/CLEAR');
  const record = await evalExpr(ws, `window.__Phase910.finish()`, 30000);
  const uiClearSamples = await evalExpr(ws, `window.__Phase910.uiClearSamples ?? []`, 30000);
  return { afterBoot, afterClear, record, uiClearSamples };
}

async function runTransitionClear(pageUrl) {
  const afterBoot = await loadAndBoot(pageUrl, 'transition');
  const afterDigit = await pressKey(DIGIT3_KEY, 'transition Digit3');
  await evalExpr(ws, `window.__Phase910.begin('transition Digit3->Escape/CLEAR')`, 30000);
  const afterClear = await pressKey(CLEAR_KEY, 'transition Escape/CLEAR');
  const record = await evalExpr(ws, `window.__Phase910.finish()`, 30000);
  const uiClearSamples = await evalExpr(ws, `window.__Phase910.uiClearSamples ?? []`, 30000);
  return { afterBoot, afterDigit, afterClear, record, uiClearSamples };
}

function pcName(pc) {
  const hit = Object.entries(TARGETS).find(([, value]) => value === pc);
  return hit ? hit[0] : hex(pc);
}

function parsePc(value) {
  if (typeof value === 'number') return value >>> 0;
  if (typeof value === 'string' && value.startsWith('0x')) return Number.parseInt(value.slice(2), 16) >>> 0;
  return null;
}

function firstIndexOf(sequence, pc) {
  return (sequence ?? []).findIndex((value) => (value & 0xFFFFFF) === pc);
}

function findDivergence(aRecord, bRecord, anchorPc = TARGETS.getCsc03FA09) {
  const aSeq = aRecord?.sequence ?? [];
  const bSeq = bRecord?.sequence ?? [];
  const aStart = firstIndexOf(aSeq, anchorPc);
  const bStart = firstIndexOf(bSeq, anchorPc);
  if (aStart < 0 || bStart < 0) {
    return {
      found: false,
      reason: `anchor ${hex(anchorPc)} missing: standalone=${aStart}, transition=${bStart}`,
    };
  }
  const max = Math.min(aSeq.length - aStart, bSeq.length - bStart);
  for (let offset = 0; offset < max; offset += 1) {
    const aPc = aSeq[aStart + offset] & 0xFFFFFF;
    const bPc = bSeq[bStart + offset] & 0xFFFFFF;
    if (aPc !== bPc) {
      return {
        found: true,
        anchorPc,
        offset,
        standaloneIndex: aStart + offset,
        transitionIndex: bStart + offset,
        previousStandaloneIndex: aStart + offset - 1,
        previousTransitionIndex: bStart + offset - 1,
        previousPc: offset > 0 ? (aSeq[aStart + offset - 1] & 0xFFFFFF) : null,
        standaloneNextPc: aPc,
        transitionNextPc: bPc,
      };
    }
  }
  return {
    found: false,
    reason: `no divergence within ${max} compared blocks after ${hex(anchorPc)}`,
  };
}

function sampleBySeq(record, seqIndex) {
  return (record?.targetSamples ?? []).find((sample) => sample.seqIndex === seqIndex) ?? null;
}

function targetSamplesInWindow(record, startSeq, endSeq) {
  return (record?.targetSamples ?? [])
    .filter((sample) => sample.seqIndex >= startSeq && sample.seqIndex <= endSeq)
    .sort((a, b) => a.seqIndex - b.seqIndex);
}

function traceFlagOwner(record, divergenceSeqIndex) {
  const samples = record?.targetSamples ?? [];
  const returns = samples.filter((sample) => sample.pc === TARGETS.flagReturn058A14 && sample.seqIndex <= divergenceSeqIndex);
  const returnSample = returns.at(-1) ?? null;
  if (!returnSample) return { found: false, reason: '0x058A14 return sample not found' };
  const callers = samples.filter((sample) => sample.pc === TARGETS.flagCaller058A10 && sample.seqIndex <= returnSample.seqIndex);
  const callSample = callers.at(-1) ?? null;
  if (!callSample) return { found: false, reason: '0x058A10 caller sample not found' };

  const window = targetSamplesInWindow(record, callSample.seqIndex, returnSample.seqIndex)
    .filter((sample) => FLAG_OWNER_PCS.has(sample.pc));
  const compareRows = [];
  for (let i = 0; i < window.length; i += 1) {
    const row = window[i];
    if (row.pc !== TARGETS.flagCompare04C973) continue;
    const next = window[i + 1] ?? null;
    const f = next?.cpu?.f ?? row.cpu?.f ?? 0;
    compareRows.push({
      role: compareRows.length === 0 ? 'D02440-D0243D' : 'D0243A-D02437',
      pc: row.pc,
      seqIndex: row.seqIndex,
      nextPc: next?.pc ?? null,
      hl: row.cpu?.hl ?? null,
      de: row.cpu?.de ?? null,
      resultF: f,
      resultZ: (f & 0x40) !== 0,
    });
  }

  const fields = returnSample.fields ?? {};
  const f = returnSample.cpu?.f ?? null;
  return {
    found: true,
    callSeqIndex: callSample.seqIndex,
    returnSeqIndex: returnSample.seqIndex,
    path: window.map((sample) => hex(sample.pc)).join(' -> '),
    rows: window,
    compareRows,
    pointerState: {
      D02437: fields.D02437 ?? null,
      D0243A: fields.D0243A ?? null,
      D0243D: fields.D0243D ?? null,
      D02440: fields.D02440 ?? null,
      firstCompareEqual: fields.D0243D === fields.D02440,
      secondCompareEqual: fields.D0243A === fields.D02437,
    },
    returnState: {
      af: returnSample.cpu?.af ?? null,
      f,
      z: f == null ? null : ((f & 0x40) !== 0),
      de: returnSample.cpu?.de ?? null,
      hl: returnSample.cpu?.hl ?? null,
    },
  };
}

function classifyController(standaloneRecord, transitionRecord, divergence) {
  if (divergence.previousPc === TARGETS.keyDebounceCounter03F9AE) {
    const standaloneSample = sampleBySeq(standaloneRecord, divergence.previousStandaloneIndex);
    const transitionSample = sampleBySeq(transitionRecord, divergence.previousTransitionIndex);
    const standaloneCounter = standaloneSample?.fields?.D0058B ?? null;
    const transitionCounter = transitionSample?.fields?.D0058B ?? null;
    return {
      kind: 'key-debounce-counter',
      standaloneSample,
      transitionSample,
      controller: `0x03F9AE is the first split: the lifted block is DEC (D0058B); RET NZ. Standalone enters with D0058B=${hex(standaloneCounter, 2)}, so DEC leaves a nonzero value and returns to ${hex(divergence.standaloneNextPc)}. Transition enters with D0058B=${hex(transitionCounter, 2)}, so DEC reaches zero, RET NZ falls through to ${hex(divergence.transitionNextPc)}, and that later routes to 0x001879 -> 0x0018F8.`,
    };
  }

  const standaloneTrace = traceFlagOwner(standaloneRecord, divergence.previousStandaloneIndex ?? 0);
  const transitionTrace = traceFlagOwner(transitionRecord, divergence.previousTransitionIndex ?? 0);
  const standaloneFinal = standaloneTrace.compareRows?.at(-1) ?? null;
  const transitionFinal = transitionTrace.compareRows?.at(-1) ?? null;
  const previousPc = divergence.previousPc;
  const controller = previousPc === TARGETS.flagReturn058A14 && standaloneTrace.found && transitionTrace.found
    ? `0x058A14 JR NZ is controlled by the Z flag returned from 0x058212/0x05E3E3. Standalone CLEAR compares D0243A=${hex(standaloneFinal?.hl)} to D02437=${hex(standaloneFinal?.de)} and returns F=${hex(standaloneTrace.returnState.f, 2)} (Z=${standaloneTrace.returnState.z ? 1 : 0}) -> ${hex(divergence.standaloneNextPc)}. Transition CLEAR compares D0243A=${hex(transitionFinal?.hl)} to D02437=${hex(transitionFinal?.de)} and returns F=${hex(transitionTrace.returnState.f, 2)} (Z=${transitionTrace.returnState.z ? 1 : 0}) -> ${hex(divergence.transitionNextPc)}.`
    : 'first divergence was not the expected 0x058A14 flag return window';
  return { kind: 'flag-owner', standaloneTrace, transitionTrace, controller };
}

function diffAtSamples(aSample, bSample) {
  if (!aSample || !bSample) return [];
  const diffs = [];
  for (const reg of ['af', 'bc', 'de', 'hl', 'sp', 'f']) {
    if (aSample.cpu?.[reg] !== bSample.cpu?.[reg]) {
      diffs.push({ kind: 'cpu', name: reg.toUpperCase(), standalone: aSample.cpu?.[reg], transition: bSample.cpu?.[reg] });
    }
  }
  const names = new Set([...Object.keys(aSample.fields ?? {}), ...Object.keys(bSample.fields ?? {})]);
  for (const name of names) {
    if (aSample.fields?.[name] !== bSample.fields?.[name]) {
      diffs.push({ kind: 'field', name, standalone: aSample.fields?.[name], transition: bSample.fields?.[name] });
    }
  }
  return diffs;
}

function sequenceContextRows(aRecord, bRecord, divergence) {
  if (!divergence.found) return [];
  const rows = [];
  for (let rel = -SEQUENCE_CONTEXT; rel <= SEQUENCE_CONTEXT; rel += 1) {
    const aIndex = divergence.standaloneIndex + rel;
    const bIndex = divergence.transitionIndex + rel;
    if (aIndex < 0 || bIndex < 0) continue;
    rows.push({
      rel,
      standaloneIndex: aIndex,
      transitionIndex: bIndex,
      standalonePc: aRecord.sequence?.[aIndex],
      transitionPc: bRecord.sequence?.[bIndex],
    });
  }
  return rows;
}

function formatCpu(cpu) {
  if (!cpu) return null;
  return {
    pc: hex(cpu.pc),
    currentBlockPc: hex(cpu.currentBlockPc),
    sp: hex(cpu.sp),
    af: hex(cpu.af, 4),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    f: hex(cpu.f, 2),
    halted: cpu.halted,
  };
}

function formatStack(stackTop) {
  return (stackTop ?? []).map((slot) => ({ addr: hex(slot.addr), value: hex(slot.value) }));
}

function formatSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    label: snapshot.label,
    block: snapshot.block,
    seqIndex: snapshot.seqIndex,
    pc: snapshot.pc == null ? null : hex(snapshot.pc),
    prevPc: snapshot.prevPc == null ? null : hex(snapshot.prevPc),
    status: snapshot.status,
    cpu: formatCpu(snapshot.cpu),
    fields: formatFields(snapshot.fields),
    stackTop: formatStack(snapshot.stackTop),
    editLine: snapshot.editLine ? {
      D007CA: hex(snapshot.editLine.D007CA),
      D008E0: hex(snapshot.editLine.D008E0),
      D0243A: hex(snapshot.editLine.D0243A),
      D0243D: hex(snapshot.editLine.D0243D),
      D02590: hex(snapshot.editLine.D02590),
      D00595: snapshot.editLine.D00595,
      D00596: snapshot.editLine.D00596,
      buffer: snapshot.editLine.buffer,
      entryLineRoi: snapshot.editLine.entryLineRoi,
      vramCurrent: snapshot.editLine.vramCurrent,
    } : null,
    persistence: snapshot.persistence,
    vram: snapshot.vram,
    phase6: snapshot.phase6,
    lastKey: snapshot.lastKey,
    pageErrors: snapshot.pageErrors,
  };
}

function formatTargetFirst(targetFirst) {
  return Object.fromEntries(Object.entries(targetFirst ?? {}).map(([name, sample]) => [name, formatSnapshot(sample)]));
}

function formatChanges(changes) {
  return (changes ?? []).map((row) => ({
    ...row,
    before: formatValue(row.name, row.before),
    after: formatValue(row.name, row.after),
    pc: row.pc == null ? null : hex(row.pc),
    prevPc: row.prevPc == null ? null : hex(row.prevPc),
  }));
}

function compactRecord(record) {
  if (!record) return null;
  return {
    label: record.label,
    blockCount: record.blockCount,
    sequenceLength: record.sequence?.length ?? 0,
    sequenceLimitReached: record.sequenceLimitReached === true,
    start: formatSnapshot(record.start),
    end: formatSnapshot(record.end),
    targetCounts: record.targetCounts,
    targetFirst: formatTargetFirst(record.targetFirst),
    fieldChanges: formatChanges(record.fieldChanges ?? []),
  };
}

function formatTrace(trace) {
  if (!trace?.found) return trace;
  return {
    found: true,
    callSeqIndex: trace.callSeqIndex,
    returnSeqIndex: trace.returnSeqIndex,
    path: trace.path,
    compareRows: (trace.compareRows ?? []).map((row) => ({
      role: row.role,
      pc: hex(row.pc),
      seqIndex: row.seqIndex,
      nextPc: row.nextPc == null ? null : hex(row.nextPc),
      hl: row.hl == null ? null : hex(row.hl),
      de: row.de == null ? null : hex(row.de),
      resultF: row.resultF == null ? null : hex(row.resultF, 2),
      resultZ: row.resultZ,
    })),
    pointerState: Object.fromEntries(Object.entries(trace.pointerState ?? {}).map(([name, value]) => [
      name,
      typeof value === 'boolean' ? value : hex(value),
    ])),
    returnState: {
      af: trace.returnState?.af == null ? null : hex(trace.returnState.af, 4),
      f: trace.returnState?.f == null ? null : hex(trace.returnState.f, 2),
      z: trace.returnState?.z,
      de: trace.returnState?.de == null ? null : hex(trace.returnState.de),
      hl: trace.returnState?.hl == null ? null : hex(trace.returnState.hl),
    },
    rows: (trace.rows ?? []).map(formatSnapshot),
  };
}

function table(rows, columns) {
  if (!rows.length) return 'No rows.';
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function routeCountsTable(data) {
  const rows = [
    { label: 'standalone CLEAR', record: data.standalone.record, key: data.standalone.afterClear?.lastKey },
    { label: 'Digit3->CLEAR transition', record: data.transition.record, key: data.transition.afterClear?.lastKey },
  ];
  return table(rows, [
    { label: 'Route', value: (row) => row.label },
    { label: '0x058A16', value: (row) => String(row.record?.targetCounts?.clearFallthrough058A16 ?? 0) },
    { label: '0x058A2C', value: (row) => String(row.record?.targetCounts?.clearTaken058A2C ?? 0) },
    { label: '0x0A223A', value: (row) => String(row.record?.targetCounts?.clearEntry0A223A ?? 0) },
    { label: '0x0A229D', value: (row) => String(row.record?.targetCounts?.clearAnchor0A229D ?? 0) },
    { label: '0x001879', value: (row) => String(row.record?.targetCounts?.preWipe001879 ?? 0) },
    { label: '0x0018F8', value: (row) => String(row.record?.targetCounts?.cleanup0018F8 ?? 0) },
    { label: '0x006D64', value: (row) => String(row.record?.targetCounts?.poll006D64 ?? 0) },
    { label: 'Termination', value: (row) => row.key?.termination ?? '-' },
    { label: 'Wipes', value: (row) => String(row.key?.wipes ?? 0) },
    { label: 'UI clear', value: (row) => row.key?.uiClearApplied === true ? 'yes' : 'no' },
  ]);
}

function sequenceTable(rows) {
  return table(rows, [
    { label: 'Rel', value: (row) => String(row.rel) },
    { label: 'Standalone #', value: (row) => String(row.standaloneIndex) },
    { label: 'Standalone PC', value: (row) => `${hex(row.standalonePc)} (${pcName(row.standalonePc)})` },
    { label: 'Transition #', value: (row) => String(row.transitionIndex) },
    { label: 'Transition PC', value: (row) => `${hex(row.transitionPc)} (${pcName(row.transitionPc)})` },
    { label: 'Same', value: (row) => row.standalonePc === row.transitionPc ? 'yes' : 'NO' },
  ]);
}

function compareTraceTable(tracePair) {
  if (!tracePair.standaloneTrace || !tracePair.transitionTrace) return 'Not reached before the first split.';
  const rows = [];
  const max = Math.max(tracePair.standaloneTrace?.compareRows?.length ?? 0, tracePair.transitionTrace?.compareRows?.length ?? 0);
  for (let index = 0; index < max; index += 1) {
    const a = tracePair.standaloneTrace.compareRows[index];
    const b = tracePair.transitionTrace.compareRows[index];
    rows.push({ index: index + 1, standalone: a, transition: b, role: a?.role ?? b?.role ?? '-' });
  }
  return table(rows, [
    { label: '#', value: (row) => String(row.index) },
    { label: 'Role', value: (row) => row.role },
    { label: 'Standalone HL', value: (row) => row.standalone?.hl == null ? '-' : hex(row.standalone.hl) },
    { label: 'Standalone DE', value: (row) => row.standalone?.de == null ? '-' : hex(row.standalone.de) },
    { label: 'Standalone F', value: (row) => row.standalone?.resultF == null ? '-' : hex(row.standalone.resultF, 2) },
    { label: 'Standalone Z', value: (row) => row.standalone?.resultZ ? '1' : '0' },
    { label: 'Transition HL', value: (row) => row.transition?.hl == null ? '-' : hex(row.transition.hl) },
    { label: 'Transition DE', value: (row) => row.transition?.de == null ? '-' : hex(row.transition.de) },
    { label: 'Transition F', value: (row) => row.transition?.resultF == null ? '-' : hex(row.transition.resultF, 2) },
    { label: 'Transition Z', value: (row) => row.transition?.resultZ ? '1' : '0' },
  ]);
}

function earlyCounterTable(controller) {
  if (controller.kind !== 'key-debounce-counter') return 'Not the controlling split.';
  const rows = [
    { route: 'standalone CLEAR', sample: controller.standaloneSample },
    { route: 'Digit3->CLEAR transition', sample: controller.transitionSample },
  ];
  return table(rows, [
    { label: 'Route', value: (row) => row.route },
    { label: 'Seq', value: (row) => String(row.sample?.seqIndex ?? '-') },
    { label: 'PC', value: (row) => row.sample?.pc == null ? '-' : hex(row.sample.pc) },
    { label: 'Prev', value: (row) => row.sample?.prevPc == null ? '-' : hex(row.sample.prevPc) },
    { label: 'AF', value: (row) => row.sample?.cpu?.af == null ? '-' : hex(row.sample.cpu.af, 4) },
    { label: 'HL', value: (row) => row.sample?.cpu?.hl == null ? '-' : hex(row.sample.cpu.hl) },
    { label: 'D00588', value: (row) => formatValue('D00588', row.sample?.fields?.D00588) },
    { label: 'D00589', value: (row) => formatValue('D00589', row.sample?.fields?.D00589) },
    { label: 'D0058B', value: (row) => formatValue('D0058B', row.sample?.fields?.D0058B) },
    { label: 'D0058C', value: (row) => formatValue('D0058C', row.sample?.fields?.D0058C) },
    { label: 'D0058E', value: (row) => formatValue('D0058E', row.sample?.fields?.D0058E) },
    { label: 'D0243A', value: (row) => formatValue('D0243A', row.sample?.fields?.D0243A) },
  ]);
}

function flagWindowTable(trace) {
  if (!trace?.found) return trace?.reason ?? 'window not found';
  return table(trace.rows ?? [], [
    { label: '#', value: (row) => String(row.seqIndex) },
    { label: 'PC', value: (row) => hex(row.pc) },
    { label: 'Prev', value: (row) => row.prevPc == null ? '-' : hex(row.prevPc) },
    { label: 'AF', value: (row) => hex(row.cpu?.af, 4) },
    { label: 'DE', value: (row) => hex(row.cpu?.de) },
    { label: 'HL', value: (row) => hex(row.cpu?.hl) },
    { label: 'D02437', value: (row) => hex(row.fields?.D02437) },
    { label: 'D0243A', value: (row) => hex(row.fields?.D0243A) },
    { label: 'D0243D', value: (row) => hex(row.fields?.D0243D) },
    { label: 'D02440', value: (row) => hex(row.fields?.D02440) },
  ]);
}

function diffTable(diffs) {
  return table(diffs.slice(0, 24), [
    { label: 'Kind', value: (row) => row.kind },
    { label: 'Name', value: (row) => row.name },
    { label: 'Standalone', value: (row) => row.kind === 'field' ? formatValue(row.name, row.standalone) : hex(row.standalone, row.name === 'F' ? 2 : 6) },
    { label: 'Transition', value: (row) => row.kind === 'field' ? formatValue(row.name, row.transition) : hex(row.transition, row.name === 'F' ? 2 : 6) },
  ]);
}

function changeTable(changes) {
  return table((changes ?? []).slice(0, 40), [
    { label: 'Block', value: (row) => String(row.block ?? '-') },
    { label: 'Seq', value: (row) => String(row.seqIndex ?? '-') },
    { label: 'Field', value: (row) => row.name },
    { label: 'Before', value: (row) => row.before },
    { label: 'After', value: (row) => row.after },
    { label: 'PC', value: (row) => row.pc },
    { label: 'Prev PC', value: (row) => row.prevPc },
  ]);
}

function finalFieldTable(oracleFields, standaloneFields, transitionFields) {
  const names = ['D007CA', 'D008E0', 'D02437', 'D0243A', 'D0243D', 'D02505', 'D02590', 'D0259D', 'D02A29', 'D0301B', 'EDIT_TOKEN_D1A8CC'];
  return table(names.map((name) => ({ name })), [
    { label: 'Field', value: (row) => row.name },
    { label: 'Oracle after CLEAR', value: (row) => formatValue(row.name, oracleFields[row.name]) },
    { label: 'Standalone CLEAR', value: (row) => formatValue(row.name, standaloneFields?.[row.name]) },
    { label: 'Transition CLEAR', value: (row) => formatValue(row.name, transitionFields?.[row.name]) },
  ]);
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 910: Post-Digit3 CLEAR Route Divergence',
      '',
      'Probe failed before producing a complete comparison.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const standaloneKey = data.standalone.afterClear?.lastKey ?? {};
  const transitionKey = data.transition.afterClear?.lastKey ?? {};
  const d = data.divergence;
  const c = data.controller;
  const interpretation = c.kind === 'key-debounce-counter'
    ? 'Interpretation: post-Digit3 CLEAR does not reach the later `0x058A14` home CLEAR handler at all. It diverges first in the key-scan debounce/countdown path at `0x03F9AE`: `D0058B=0x01` after Digit3 causes `DEC (D0058B)` to reach zero, so `RET NZ` falls through to `0x03F9B0`; that path later reaches `0x001879 -> 0x0018F8` and wipes the watched context. Standalone CLEAR has a nonzero post-decrement counter and returns immediately to `0x03D058`, then reaches the normal `0x058A16 -> 0x0A223A -> 0x0A229D` pre-stop path.'
    : 'Interpretation: the probe found a route split, but it was not classified as the expected key-scan counter split.';
  return [
    '# Phase 910: Post-Digit3 CLEAR Route Divergence',
    '',
    'Probe: `probe-phase910-post-digit3-clear-route-divergence.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase910-post-digit3-clear-route-divergence.mjs`',
    '',
    'Serves a temporary instrumented copy of `browser-shell.html`, runs a fresh standalone Escape/CLEAR route, then runs a fresh Digit3 -> Escape/CLEAR transition route. Disk `browser-shell.html` is not edited.',
    '',
    '## Summary',
    '',
    `- Probe completed: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Standalone CLEAR: termination=${standaloneKey.termination ?? '-'}, steps=${standaloneKey.steps ?? '-'}, controlStopPc=${standaloneKey.controlStopPc == null ? '-' : hex(standaloneKey.controlStopPc)}, uiClearApplied=${standaloneKey.uiClearApplied === true}, wipes=${standaloneKey.wipes ?? '-'}.`,
    `- Transition CLEAR: termination=${transitionKey.termination ?? '-'}, steps=${transitionKey.steps ?? '-'}, controlStopPc=${transitionKey.controlStopPc == null ? '-' : hex(transitionKey.controlStopPc)}, uiClearApplied=${transitionKey.uiClearApplied === true}, wipes=${transitionKey.wipes ?? '-'}.`,
    `- First divergence after first 0x03FA09 key-consumption anchor: previous=${d.previousPc == null ? '-' : hex(d.previousPc)}, standalone next=${d.standaloneNextPc == null ? '-' : hex(d.standaloneNextPc)}, transition next=${d.transitionNextPc == null ? '-' : hex(d.transitionNextPc)}.`,
    `- Controller: ${c.controller}`,
    `- ${interpretation}`,
    '',
    '## Route Counts',
    '',
    routeCountsTable(data),
    '',
    '## First Divergence Window',
    '',
    sequenceTable(data.sequenceContext),
    '',
    '## Key-Scan Counter Window',
    '',
    earlyCounterTable(c),
    '',
    '## 0x04C973 Compare Trace',
    '',
    compareTraceTable(c),
    '',
    '## Standalone 0x058212 Window',
    '',
    flagWindowTable(c.standaloneTrace),
    '',
    '## Transition 0x058212 Window',
    '',
    flagWindowTable(c.transitionTrace),
    '',
    '## Diffs At Previous Common Block',
    '',
    diffTable(data.previousDiffs),
    '',
    '## Transition Field Changes Before Wipe',
    '',
    changeTable(data.transition.compactRecord?.fieldChanges ?? []),
    '',
    '## Final Field Comparison',
    '',
    finalFieldTable(data.oracleFields, data.standalone.afterClear?.fields, data.transition.afterClear?.fields),
    '',
    '## Bounded Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      divergence: {
        ...data.divergence,
        anchorPc: data.divergence.anchorPc == null ? null : hex(data.divergence.anchorPc),
        previousPc: data.divergence.previousPc == null ? null : hex(data.divergence.previousPc),
        standaloneNextPc: data.divergence.standaloneNextPc == null ? null : hex(data.divergence.standaloneNextPc),
        transitionNextPc: data.divergence.transitionNextPc == null ? null : hex(data.divergence.transitionNextPc),
      },
      controller: {
        kind: data.controller.kind,
        controller: data.controller.controller,
        standaloneSample: formatSnapshot(data.controller.standaloneSample),
        transitionSample: formatSnapshot(data.controller.transitionSample),
        standaloneTrace: formatTrace(data.controller.standaloneTrace),
        transitionTrace: formatTrace(data.controller.transitionTrace),
      },
      standalone: {
        afterBoot: formatSnapshot(data.standalone.afterBoot),
        afterClear: formatSnapshot(data.standalone.afterClear),
        record: data.standalone.compactRecord,
      },
      transition: {
        afterBoot: formatSnapshot(data.transition.afterBoot),
        afterDigit: formatSnapshot(data.transition.afterDigit),
        afterClear: formatSnapshot(data.transition.afterClear),
        record: data.transition.compactRecord,
      },
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

  const oracleFields = readCaptureFields();
  server = await startStaticServer();
  const pageUrl = `http://127.0.0.1:${server.address().port}/browser-shell.html`;
  chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ws = await connect(await waitForDevtools());
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');

  const standalone = await runStandaloneClear(pageUrl);
  const transition = await runTransitionClear(pageUrl);

  const divergence = findDivergence(standalone.record, transition.record, TARGETS.getCsc03FA09);
  const controller = classifyController(standalone.record, transition.record, divergence);
  const standalonePrevSample = sampleBySeq(standalone.record, divergence.previousStandaloneIndex);
  const transitionPrevSample = sampleBySeq(transition.record, divergence.previousTransitionIndex);
  const previousDiffs = diffAtSamples(standalonePrevSample, transitionPrevSample);
  const sequenceContext = sequenceContextRows(standalone.record, transition.record, divergence);

  standalone.compactRecord = compactRecord(standalone.record);
  transition.compactRecord = compactRecord(transition.record);

  const standaloneKey = standalone.afterClear?.lastKey ?? {};
  const transitionKey = transition.afterClear?.lastKey ?? {};
  const standaloneCounter = controller.standaloneSample?.fields?.D0058B ?? null;
  const transitionCounter = controller.transitionSample?.fields?.D0058B ?? null;
  const pass = divergence.found
    && controller.kind === 'key-debounce-counter'
    && divergence.previousPc === TARGETS.keyDebounceCounter03F9AE
    && divergence.standaloneNextPc === TARGETS.keyDebounceReturn03D058
    && divergence.transitionNextPc === TARGETS.keyDebounceFallthrough03F9B0
    && transitionCounter === 0x01
    && standaloneCounter !== 0x01
    && standalone.record.targetCounts.clearAnchor0A229D > 0
    && standaloneKey.termination === 'control_pre_stop'
    && standaloneKey.uiClearApplied === true
    && transition.record.targetCounts.preWipe001879 > 0
    && transition.record.targetCounts.cleanup0018F8 > 0
    && transitionKey.termination === 'max_steps'
    && transitionKey.uiClearApplied === false
    && (standalone.afterClear?.pageErrors ?? []).length === 0
    && (transition.afterClear?.pageErrors ?? []).length === 0;

  return {
    probe: 'phase910-post-digit3-clear-route-divergence',
    chromePath,
    pageUrl,
    pass,
    oracleFields,
    standalone,
    transition,
    divergence,
    controller,
    previousDiffs,
    sequenceContext,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    divergence: {
      previousPc: summary.divergence.previousPc == null ? null : hex(summary.divergence.previousPc),
      standaloneNextPc: summary.divergence.standaloneNextPc == null ? null : hex(summary.divergence.standaloneNextPc),
      transitionNextPc: summary.divergence.transitionNextPc == null ? null : hex(summary.divergence.transitionNextPc),
      standaloneIndex: summary.divergence.standaloneIndex,
      transitionIndex: summary.divergence.transitionIndex,
    },
    controller: summary.controller.controller,
    standaloneKey: summary.standalone.afterClear?.lastKey,
    transitionKey: summary.transition.afterClear?.lastKey,
    standaloneCounts: summary.standalone.record?.targetCounts,
    transitionCounts: summary.transition.record?.targetCounts,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase910-post-digit3-clear-route-divergence', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

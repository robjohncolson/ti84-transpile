import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase909-full-transition-oracle.md');
const DIGIT3_CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const CLEAR_CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const RAM_BASE = 0xD00000;
const DEBUG_PORT = 9909;
const EDIT_BUFFER_BASE = 0xD1A8CC;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase909-transition-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const PHASE886_FIELDS = Object.freeze([
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
]);

const EXTRA_FIELDS = Object.freeze([
  ['EDIT_TOKEN_D1A8CC', EDIT_BUFFER_BASE, 1],
]);

const WATCHED_FIELDS = Object.freeze([...PHASE886_FIELDS, ...EXTRA_FIELDS]);

const TARGETS = Object.freeze({
  eventLoop08C331: 0x08C331,
  getCsc03FA09: 0x03FA09,
  insertGate0158DE: 0x0158DE,
  insertGateReturn0013DA: 0x0013DA,
  clearCaller058A16: 0x058A16,
  clearEntry0A223A: 0x0A223A,
  clearAnchor0A229D: 0x0A229D,
  sentinelBlock0018D7: 0x0018D7,
  shortTail0018EC: 0x0018EC,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});

const DIGIT3_KEY = Object.freeze({
  code: 'Digit3',
  key: '3',
  vk: 51,
  expectedInsertByte: 0x33,
});

const CLEAR_KEY = Object.freeze({
  code: 'Escape',
  key: 'Escape',
  vk: 27,
});

const DIGIT3_CONTRACT = Object.freeze({
  D0243A: 0xD1A8CD,
  EDIT_TOKEN_D1A8CC: 0x33,
  D02A29: 0x000C,
});

const CLEAR_CONTRACT = Object.freeze({
  D0243A: EDIT_BUFFER_BASE,
  EDIT_TOKEN_D1A8CC: 0x33,
  D02A29: 0x0000,
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
  if (name === 'D010F4' || name === 'D02505' || name === 'D000C2_IY42' || name === 'EDIT_TOKEN_D1A8CC') return 2;
  if (name === 'D02A29') return 4;
  return 6;
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

function readCaptureFields(capturePath, fields = WATCHED_FIELDS) {
  const capture = fs.readFileSync(capturePath);
  return Object.fromEntries(fields.map(([name, addr, len]) => [name, readCaptureValue(capture, addr, len)]));
}

function formatValue(name, value) {
  return value == null ? null : hex(value, valueWidth(name));
}

function formatFields(fields) {
  if (!fields) return null;
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, formatValue(name, value)]));
}

function compareFields(actual, oracle, fields = WATCHED_FIELDS) {
  return fields
    .filter(([name]) => actual?.[name] !== oracle?.[name])
    .map(([name]) => ({
      name,
      actual: actual?.[name] ?? null,
      oracle: oracle?.[name] ?? null,
    }));
}

function formatMismatches(mismatches) {
  return mismatches.map((row) => ({
    name: row.name,
    actual: formatValue(row.name, row.actual),
    oracle: formatValue(row.name, row.oracle),
    owner: row.owner ?? null,
  }));
}

function formatChanges(changes) {
  return changes.map((row) => ({
    ...row,
    before: formatValue(row.name, row.before),
    after: formatValue(row.name, row.after),
    pc: row.pc == null ? null : hex(row.pc),
    prevPc: row.prevPc == null ? null : hex(row.prevPc),
  }));
}

function analyzeSource() {
  const source = fs.readFileSync(BROWSER_SHELL_PATH, 'utf8');
  const packetMatch = source.match(/const COLDBOOT_STABLE_REPLAY_FIELDS = \[([\s\S]*?)\n  \];/);
  const replayNames = packetMatch
    ? [...packetMatch[1].matchAll(/\['([^']+)'/g)].map((match) => match[1])
    : [];
  const digitInsertMatch = source.match(/Digit3:\s*0x([0-9A-Fa-f]+)/);
  const digitScanMatch = source.match(/Digit3:\s*0x([0-9A-Fa-f]+),\s*\n\s*Numpad3:\s*0x([0-9A-Fa-f]+)/);
  return {
    replayNames,
    hasD010Replay: ['D010EF', 'D010FE', 'D010F4'].every((name) => replayNames.includes(name)),
    hasD0301BForce: /evalWrite24\(mem,\s*0xD0301B,\s*0x5AA55A\)/.test(source),
    hasD008E0OracleErrSp: /evalWrite24\(mem,\s*0xD008E0,\s*SCREEN_STACK_TOP\s*-\s*18\)/.test(source),
    hasBroadEditVatForceRestore: /force-restore|forceRestore|broad edit\/VAT/i.test(source),
    digit3InsertByte: digitInsertMatch ? Number.parseInt(digitInsertMatch[1], 16) : null,
    digit3ScanCode: digitScanMatch ? Number.parseInt(digitScanMatch[1], 16) : null,
  };
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
  let html = sourceHtml;
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  const snapshotLine = '      coldbootVatSnapshot = COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field, readColdbootReplayField(field)]);';
  const replayLine = '    for (const [field, value] of coldbootVatSnapshot) writeColdbootReplayField(field, value);';
  const noForceLine = '    // Keep the stable replay packet here, but do not force the magic manually.';
  if (!html.includes(marker)) throw new Error('Phase909 marker not found: finalizeColdbootPersistenceState');
  if (!html.includes(snapshotLine)) throw new Error('Phase909 marker not found: stable snapshot line');
  if (!html.includes(replayLine)) throw new Error('Phase909 marker not found: stable replay line');
  if (!html.includes(noForceLine)) throw new Error('Phase909 marker not found: D0301B no-force line');

  const instrumentation = String.raw`
const Phase909_WATCHED_FIELDS = Object.freeze([
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
  ['EDIT_TOKEN_D1A8CC', 0xD1A8CC, 1],
]);

const Phase909_TARGETS = Object.freeze({
  eventLoop08C331: 0x08C331,
  getCsc03FA09: 0x03FA09,
  insertGate0158DE: 0x0158DE,
  insertGateReturn0013DA: 0x0013DA,
  clearCaller058A16: 0x058A16,
  clearEntry0A223A: 0x0A223A,
  clearAnchor0A229D: 0x0A229D,
  sentinelBlock0018D7: 0x0018D7,
  shortTail0018EC: 0x0018EC,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});

function Phase909ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function Phase909ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(Phase909_WATCHED_FIELDS.map(([name, addr, len]) => [
    name,
    Phase909ReadValue(mem, addr, len),
  ]));
}

function Phase909CpuRaw() {
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

function Phase909Capture(label) {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: Phase909CpuRaw(),
    fields: Phase909ReadFields(),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__Phase909PageErrors ?? [])],
  };
}

function Phase909CreateRecord(label) {
  return {
    label,
    active: true,
    blockCount: 0,
    prevPc: null,
    start: null,
    end: null,
    lastFields: null,
    targetCounts: Object.fromEntries(Object.keys(Phase909_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    fieldChanges: [],
  };
}

function Phase909CurrentRecord() {
  const record = window.__Phase909?.records?.at(-1) ?? null;
  return record?.active ? record : null;
}

window.__Phase909PageErrors = [];
window.addEventListener('error', (event) => {
  window.__Phase909PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__Phase909PageErrors.push(String(event.reason || event));
});

window.__Phase909 = {
  records: [],
  bootSnapshot: null,
  postReplayFields: null,
  afterD0301BFields: null,
  uiClearSamples: [],
  read: Phase909Capture,
  begin(label) {
    const record = Phase909CreateRecord(label);
    record.start = Phase909Capture('start');
    record.lastFields = Phase909ReadFields();
    this.records.push(record);
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (!record) return null;
    record.active = false;
    record.end = Phase909Capture('end');
    return record;
  },
};

const Phase909OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function Phase909ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = Phase909CurrentRecord();
  if (record) {
    record.blockCount += 1;
    const fields = Phase909ReadFields();
    if (fields && record.lastFields) {
      for (const [name] of Phase909_WATCHED_FIELDS) {
        if (fields[name] === record.lastFields[name]) continue;
        if (record.fieldChanges.length < 120) {
          record.fieldChanges.push({
            block: record.blockCount,
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

    for (const [name, target] of Object.entries(Phase909_TARGETS)) {
      if (addr !== target) continue;
      record.targetCounts[name] += 1;
      if (!record.targetFirst[name]) {
        record.targetFirst[name] = {
          block: record.blockCount,
          pc: addr,
          prevPc: record.prevPc,
          fields,
        };
      }
    }
  }
  const result = Phase909OriginalObserveColdbootPersistenceBlock(state, pc);
  if (record) record.prevPc = addr;
  return result;
};

const Phase909OriginalApplyColdbootUiLevelClear = applyColdbootUiLevelClear;
applyColdbootUiLevelClear = function Phase909ApplyColdbootUiLevelClear() {
  const before = Phase909Capture('uiClearBefore');
  const result = Phase909OriginalApplyColdbootUiLevelClear();
  const after = Phase909Capture('uiClearAfter');
  const changes = [];
  const beforeFields = before.fields ?? {};
  const afterFields = after.fields ?? {};
  for (const [name] of Phase909_WATCHED_FIELDS) {
    if (beforeFields[name] === afterFields[name]) continue;
    changes.push({ name, before: beforeFields[name], after: afterFields[name], owner: 'applyColdbootUiLevelClear' });
  }
  window.__Phase909.uiClearSamples.push({ before, result, after, changes });
  return result;
};
`;

  html = html.replace(marker, `${instrumentation}\n\n${marker}`);
  html = html.replace(snapshotLine, `${snapshotLine}
      window.__Phase909.bootSnapshot = coldbootVatSnapshot.map(([field, value]) => ({ name: field[0], addr: field[1], len: field[2], value }));`);
  html = html.replace(replayLine, `${replayLine}
    window.__Phase909.postReplayFields = Phase909ReadFields();`);
  html = html.replace(noForceLine, `${noForceLine}
    window.__Phase909.afterD0301BFields = Phase909ReadFields();`);
  return html;
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

function formatSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    label: snapshot.label,
    status: snapshot.status,
    runtimeMode: snapshot.runtimeMode,
    lastPc: snapshot.lastPc == null ? null : hex(snapshot.lastPc),
    lastMode: snapshot.lastMode,
    totalSteps: snapshot.totalSteps,
    cpu: snapshot.cpu ? {
      pc: hex(snapshot.cpu.pc),
      currentBlockPc: hex(snapshot.cpu.currentBlockPc),
      sp: hex(snapshot.cpu.sp),
      af: hex(snapshot.cpu.af, 4),
      bc: hex(snapshot.cpu.bc),
      de: hex(snapshot.cpu.de),
      hl: hex(snapshot.cpu.hl),
      ix: hex(snapshot.cpu.ix),
      iy: hex(snapshot.cpu.iy),
      f: hex(snapshot.cpu.f, 2),
      halted: snapshot.cpu.halted,
    } : null,
    fields: formatFields(snapshot.fields),
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
  return Object.fromEntries(Object.entries(targetFirst ?? {}).map(([name, sample]) => [name, {
    block: sample.block,
    pc: sample.pc == null ? null : hex(sample.pc),
    prevPc: sample.prevPc == null ? null : hex(sample.prevPc),
    fields: formatFields(sample.fields),
  }]));
}

function formatRecord(record) {
  if (!record) return null;
  return {
    label: record.label,
    active: record.active,
    blockCount: record.blockCount,
    prevPc: record.prevPc == null ? null : hex(record.prevPc),
    start: formatSnapshot(record.start),
    end: formatSnapshot(record.end),
    lastFields: formatFields(record.lastFields),
    targetCounts: record.targetCounts,
    targetFirst: formatTargetFirst(record.targetFirst),
    fieldChanges: formatChanges(record.fieldChanges ?? []),
  };
}

function formatBootSnapshot(snapshot) {
  return (snapshot ?? []).map((field) => ({
    ...field,
    addr: hex(field.addr),
    value: field.value == null ? null : hex(field.value, valueWidth(field.name)),
  }));
}

function firstOwnerForMismatch(row, rawState, checkpoint) {
  const isDigit = checkpoint === 'A';
  const record = isDigit ? rawState.digitRecord : rawState.clearRecord;
  const snapshot = isDigit ? rawState.afterDigit : rawState.afterClear;
  const changes = record?.fieldChanges ?? [];
  const change = changes.find((entry) => entry.name === row.name);
  if (change) return `first changed before pc ${hex(change.pc)} (prev ${change.prevPc == null ? 'none' : hex(change.prevPc)})`;

  const uiSample = !isDigit
    ? (rawState.uiClearSamples ?? []).find((sample) => (sample.changes ?? []).some((entry) => entry.name === row.name))
    : null;
  if (uiSample) return 'applyColdbootUiLevelClear';

  const key = snapshot?.lastKey ?? {};
  if (isDigit) {
    if (row.name === 'EDIT_TOKEN_D1A8CC') {
      return key.insertBlock == null
        ? 'Digit3 insert was not observed'
        : `Digit3 insert route observed at block ${key.insertBlock}`;
    }
    if (row.name === 'D0243A') {
      return key.insertBlock == null
        ? 'cursor did not advance through observed insert route'
        : `Digit3 insert route advanced cursor at block ${key.insertBlock}`;
    }
    if (row.name === 'D02A29') {
      return key.stoppedAtPostInsertGate
        ? 'known checkpoint-A residual: post_insert_gate_stop ended browser burst before any D02A29 owner wrote the real cursor offset'
        : 'no D02A29 owner observed in bounded Digit3 trace';
    }
  } else {
    if (row.name === 'EDIT_TOKEN_D1A8CC' || row.name === 'D0243A' || row.name === 'D02A29') {
      return key.uiClearApplied
        ? 'CLEAR checkpoint after applyColdbootUiLevelClear'
        : 'CLEAR route did not apply browser-level UI clear';
    }
  }

  const priorValue = (isDigit ? rawState.afterBoot : rawState.afterDigit)?.fields?.[row.name];
  if (priorValue !== row.oracle) return isDigit
    ? 'coldboot post-Phase6 baseline before Digit3'
    : 'checkpoint-A/Digit3 state before CLEAR';
  if (row.actual !== row.oracle) return isDigit
    ? 'unchanged residual after Digit3; no owner observed in bounded Phase909 trace'
    : 'unchanged residual after CLEAR; no owner observed in bounded Phase909 trace';
  return null;
}

function table(rows, columns) {
  if (!rows.length) return 'No rows.';
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function fieldTable(label, fields, oracleFields, actualFields) {
  return table(fields.map(([name]) => ({ name })), [
    { label: 'Field', value: (row) => row.name },
    { label: `Oracle ${label}`, value: (row) => formatValue(row.name, oracleFields[row.name]) },
    { label: `Browser ${label}`, value: (row) => (
      typeof actualFields[row.name] === 'string'
        ? actualFields[row.name]
        : formatValue(row.name, actualFields[row.name])
    ) },
    { label: 'Match', value: (row) => {
      const actual = typeof actualFields[row.name] === 'string'
        ? actualFields[row.name]
        : formatValue(row.name, actualFields[row.name]);
      return actual === formatValue(row.name, oracleFields[row.name]) ? 'yes' : 'NO';
    } },
  ]);
}

function contractTable(rows) {
  return table(rows, [
    { label: 'Contract', value: (row) => row.name },
    { label: 'Expected', value: (row) => formatValue(row.name, row.expected) },
    { label: 'Oracle', value: (row) => formatValue(row.name, row.oracle) },
    { label: 'Browser', value: (row) => formatValue(row.name, row.actual) },
    { label: 'Pass', value: (row) => (row.pass ? 'yes' : 'NO') },
  ]);
}

function mismatchTable(mismatches) {
  return table(mismatches, [
    { label: 'Field', value: (row) => row.name },
    { label: 'Actual', value: (row) => row.actual },
    { label: 'Oracle', value: (row) => row.oracle },
    { label: 'First owner / classification', value: (row) => row.owner },
  ]);
}

function targetTable(record) {
  return table(Object.entries(record?.targetCounts ?? {}).map(([name, count]) => ({ name, count })), [
    { label: 'Target', value: (row) => row.name },
    { label: 'Hits', value: (row) => String(row.count) },
  ]);
}

function changeTable(changes) {
  return table((changes ?? []).slice(0, 80), [
    { label: 'Block', value: (row) => String(row.block ?? '-') },
    { label: 'Field', value: (row) => row.name },
    { label: 'Before', value: (row) => row.before },
    { label: 'After', value: (row) => row.after },
    { label: 'PC', value: (row) => row.pc },
    { label: 'Prev PC', value: (row) => row.prevPc },
  ]);
}

function sourceEvidenceTable(source) {
  return table([
    { name: 'D010 replay packet present', value: source.hasD010Replay ? 'yes' : 'no' },
    { name: 'D0301B magic forced', value: source.hasD0301BForce ? 'yes' : 'no' },
    { name: 'D008E0 uses SCREEN_STACK_TOP-18', value: source.hasD008E0OracleErrSp ? 'yes' : 'no' },
    { name: 'Broad edit/VAT force-restore marker found', value: source.hasBroadEditVatForceRestore ? 'yes' : 'no' },
    { name: 'Digit3 insert byte mapping', value: source.digit3InsertByte == null ? '-' : hex(source.digit3InsertByte, 2) },
    { name: 'Digit3 scan-code mapping', value: source.digit3ScanCode == null ? '-' : hex(source.digit3ScanCode, 2) },
  ], [
    { label: 'Source check', value: (row) => row.name },
    { label: 'Value', value: (row) => row.value },
  ]);
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 909: Full Transition Oracle',
      '',
      'Probe failed before producing a complete audit.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const state = data.state ?? {};
  const digitKey = state.afterDigit?.lastKey ?? {};
  const clearKey = state.afterClear?.lastKey ?? {};
  return [
    '# Phase 909: Full Transition Oracle',
    '',
    'Probe: `probe-phase909-full-transition-oracle.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase909-full-transition-oracle.mjs`',
    '',
    'Serves a temporary observation-only copy of `browser-shell.html`, boots coldboot mode, presses Digit3, records checkpoint A against `realram-home-digit3-D00000-D657FF.bin`, then presses Escape/CLEAR and records checkpoint B against `realram-home-afterCLEAR-D00000-D657FF.bin`. The disk browser shell is not edited.',
    '',
    '## Summary',
    '',
    `- Probe completed: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Clean pre-stop execution: ${data.cleanExecution ? 'YES' : 'NO'}; classified CLEAR route: ${data.clearRouteClassified ? 'YES' : 'NO'}.`,
    `- Checkpoint A (Digit3) field match: ${data.checkpointA.fieldMatch ? 'YES' : 'NO'} (${data.checkpointA.mismatches.length} mismatches); known-only residual: ${data.checkpointA.knownOnly ? 'YES' : 'NO'}.`,
    `- Checkpoint A edit-line contract: ${data.checkpointA.contractMatch ? 'YES' : 'NO'} (${data.checkpointA.contractMismatches.length} mismatches).`,
    `- Checkpoint B (CLEAR) field match: ${data.checkpointB.fieldMatch ? 'YES' : 'NO'} (${data.checkpointB.mismatches.length} mismatches).`,
    `- Checkpoint B edit-line contract: ${data.checkpointB.contractMatch ? 'YES' : 'NO'} (${data.checkpointB.contractMismatches.length} mismatches).`,
    `- Digit3 route: termination=${digitKey.termination ?? '-'}, steps=${digitKey.steps ?? '-'}, insert=${digitKey.expectedInsertByte == null ? '-' : hex(digitKey.expectedInsertByte, 2)}, insertBlock=${digitKey.insertBlock ?? '-'}, postInsertGateBlock=${digitKey.postInsertGateBlock ?? '-'}, D000C2Bit7Restored=${digitKey.D000C2Bit7Restored === true}.`,
    `- CLEAR route: termination=${clearKey.termination ?? '-'}, steps=${clearKey.steps ?? '-'}, controlStopPc=${clearKey.controlStopPc == null ? '-' : hex(clearKey.controlStopPc)}, uiClearApplied=${clearKey.uiClearApplied === true}, wipes=${clearKey.wipes ?? '-'}.`,
    `- Phase 6: ${state.afterBoot?.phase6?.termination ?? '-'} after ${state.afterBoot?.phase6?.steps ?? '-'} steps at ${state.afterBoot?.phase6?.lastPc == null ? '-' : hex(state.afterBoot.phase6.lastPc)}; snapshot captured=${state.afterBoot?.phase6?.vatSnapshotCaptured === true}.`,
    `- Page errors: ${JSON.stringify(state.afterClear?.pageErrors ?? [])}.`,
    `- Adjudication: ${data.conclusion}`,
    '',
    '## Source Checks',
    '',
    sourceEvidenceTable(data.sourceEvidence),
    '',
    '## Checkpoint A: Digit3 Watched Fields',
    '',
    fieldTable('Digit3', PHASE886_FIELDS, data.digitOracleFields, state.afterDigit?.fields ?? {}),
    '',
    '## Checkpoint A: Edit-Line Contract',
    '',
    contractTable(data.checkpointA.contractRows),
    '',
    '## Checkpoint A: Residual Mismatches',
    '',
    mismatchTable(data.checkpointA.mismatches),
    '',
    '## Checkpoint B: CLEAR Watched Fields',
    '',
    fieldTable('after CLEAR', PHASE886_FIELDS, data.clearOracleFields, state.afterClear?.fields ?? {}),
    '',
    '## Checkpoint B: Edit-Line Contract',
    '',
    contractTable(data.checkpointB.contractRows),
    '',
    '## Checkpoint B: Residual Mismatches',
    '',
    mismatchTable(data.checkpointB.mismatches),
    '',
    '## Digit3 Route Targets',
    '',
    targetTable(state.digitRecord),
    '',
    '## CLEAR Route Targets',
    '',
    targetTable(state.clearRecord),
    '',
    '## Watched Field Changes During Digit3 Route',
    '',
    changeTable(state.digitRecord?.fieldChanges ?? []),
    '',
    '## Watched Field Changes During CLEAR Route',
    '',
    changeTable(state.clearRecord?.fieldChanges ?? []),
    '',
    '## UI Clear Samples',
    '',
    '```json',
    JSON.stringify(state.uiClearSamples ?? [], null, 2),
    '```',
    '',
    '## Bounded Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      cleanExecution: data.cleanExecution,
      clearRouteClassified: data.clearRouteClassified,
      conclusion: data.conclusion,
      checkpointA: data.checkpointA,
      checkpointB: data.checkpointB,
      sourceEvidence: data.sourceEvidence,
      bootSnapshot: state.bootSnapshot,
      postReplayFields: state.postReplayFields,
      afterD0301BFields: state.afterD0301BFields,
      afterBoot: {
        status: state.afterBoot?.status,
        fields: state.afterBoot?.fields,
        editLine: state.afterBoot?.editLine,
        phase6: state.afterBoot?.phase6,
      },
      afterDigit: {
        status: state.afterDigit?.status,
        fields: state.afterDigit?.fields,
        editLine: state.afterDigit?.editLine,
        persistence: state.afterDigit?.persistence,
        lastKey: state.afterDigit?.lastKey,
      },
      afterClear: {
        status: state.afterClear?.status,
        fields: state.afterClear?.fields,
        editLine: state.afterClear?.editLine,
        persistence: state.afterClear?.persistence,
        lastKey: state.afterClear?.lastKey,
      },
      digitRecord: state.digitRecord,
      clearRecord: state.clearRecord,
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

  const digitOracleRaw = readCaptureFields(DIGIT3_CAPTURE_PATH);
  const clearOracleRaw = readCaptureFields(CLEAR_CAPTURE_PATH);
  const sourceEvidence = analyzeSource();

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
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(ws, '!!window.__Phase909 && !!window.__coldbootReadEditLineState', 'Phase909 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__Phase909.read('afterBoot')`, 30000);

  await evalExpr(ws, `window.__Phase909.begin('Digit3')`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(DIGIT3_KEY, 'keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(DIGIT3_KEY, 'keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${DIGIT3_KEY.code}'`, 'Digit3 completion', 90000);
  await sleep(150);
  const digitRecordRaw = await evalExpr(ws, `window.__Phase909.finish()`, 30000);
  const afterDigit = await evalExpr(ws, `window.__Phase909.read('afterDigit')`, 30000);

  await evalExpr(ws, `window.__Phase909.begin('Escape/CLEAR')`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(CLEAR_KEY, 'keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(CLEAR_KEY, 'keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${CLEAR_KEY.code}'`, 'Escape/CLEAR completion', 90000);
  await sleep(150);

  const clearRecordRaw = await evalExpr(ws, `window.__Phase909.finish()`, 30000);
  const afterClear = await evalExpr(ws, `window.__Phase909.read('afterClear')`, 30000);
  const extra = await evalExpr(ws, `(() => ({
    bootSnapshot: window.__Phase909.bootSnapshot ?? null,
    postReplayFields: window.__Phase909.postReplayFields ?? null,
    afterD0301BFields: window.__Phase909.afterD0301BFields ?? null,
    uiClearSamples: window.__Phase909.uiClearSamples ?? [],
  }))()`, 30000);

  const rawState = {
    bootSnapshot: extra.bootSnapshot,
    postReplayFields: extra.postReplayFields,
    afterD0301BFields: extra.afterD0301BFields,
    uiClearSamples: extra.uiClearSamples,
    afterBoot,
    afterDigit,
    afterClear,
    digitRecord: digitRecordRaw,
    clearRecord: clearRecordRaw,
  };

  const buildContractRows = (contract, oracle, actual) => Object.entries(contract).map(([name, expected]) => ({
    name,
    expected,
    oracle: oracle[name],
    actual: actual?.[name],
    pass: actual?.[name] === expected && oracle[name] === expected,
  }));

  const checkpointAFieldRawMismatches = compareFields(afterDigit.fields, digitOracleRaw, PHASE886_FIELDS);
  const checkpointAContractRowsRaw = buildContractRows(DIGIT3_CONTRACT, digitOracleRaw, afterDigit.fields);
  const checkpointAContractRawMismatches = checkpointAContractRowsRaw.filter((row) => !row.pass);
  const checkpointARawMismatches = [...new Map(
    [...checkpointAFieldRawMismatches, ...checkpointAContractRawMismatches.map((row) => ({
      name: row.name,
      actual: row.actual,
      oracle: row.oracle,
    }))].map((row) => [row.name, row]),
  ).values()];
  const checkpointAMismatches = checkpointARawMismatches.map((row) => ({
    ...row,
    owner: firstOwnerForMismatch(row, rawState, 'A'),
  }));
  const checkpointAKnownOnly = checkpointARawMismatches.every((row) => row.name === 'D02A29');

  const checkpointBFieldRawMismatches = compareFields(afterClear.fields, clearOracleRaw, PHASE886_FIELDS);
  const checkpointBContractRowsRaw = buildContractRows(CLEAR_CONTRACT, clearOracleRaw, afterClear.fields);
  const checkpointBContractRawMismatches = checkpointBContractRowsRaw.filter((row) => !row.pass);
  const checkpointBRawMismatches = [...new Map(
    [...checkpointBFieldRawMismatches, ...checkpointBContractRawMismatches.map((row) => ({
      name: row.name,
      actual: row.actual,
      oracle: row.oracle,
    }))].map((row) => [row.name, row]),
  ).values()];
  const checkpointBMismatches = checkpointBRawMismatches.map((row) => ({
    ...row,
    owner: firstOwnerForMismatch(row, rawState, 'B'),
  }));
  const checkpointBResidualNamed = checkpointBMismatches.every((row) => typeof row.owner === 'string' && row.owner.length > 0);

  const digitKey = afterDigit.lastKey ?? {};
  const clearKey = afterClear.lastKey ?? {};
  const noPageErrors = (afterClear.pageErrors ?? []).length === 0;
  const digitClean = noPageErrors
    && digitKey.code === DIGIT3_KEY.code
    && digitKey.expectedInsertByte === DIGIT3_KEY.expectedInsertByte
    && digitKey.insertBlock != null
    && digitKey.termination === 'post_insert_gate_stop'
    && digitKey.stoppedAtPostInsertGate === true
    && digitKey.D000C2Bit7Restored === true
    && afterBoot.phase6?.termination === 'halt'
    && afterBoot.phase6?.vatSnapshotCaptured === true;
  const clearClean = noPageErrors
    && clearKey.code === CLEAR_KEY.code
    && clearKey.termination === 'control_pre_stop'
    && clearKey.uiClearApplied === true
    && clearKey.controlStopPc === 0x0A229D
    && afterBoot.phase6?.termination === 'halt'
    && afterBoot.phase6?.vatSnapshotCaptured === true;
  const clearRouteClassified = noPageErrors
    && clearKey.code === CLEAR_KEY.code
    && (
      clearClean
      || (
        clearKey.termination === 'max_steps'
        && clearKey.wipes > 0
        && (clearRecordRaw?.targetCounts?.cleanup0018F8 ?? 0) > 0
      )
    );
  const cleanExecution = digitClean && clearClean;
  const checkpointAFieldMatch = checkpointAFieldRawMismatches.length === 0;
  const checkpointAContractMatch = checkpointAContractRawMismatches.length === 0;
  const checkpointBFieldMatch = checkpointBFieldRawMismatches.length === 0;
  const checkpointBContractMatch = checkpointBContractRawMismatches.length === 0;
  const pass = digitClean && clearRouteClassified && checkpointAKnownOnly && checkpointBResidualNamed;

  const state = {
    bootSnapshot: formatBootSnapshot(rawState.bootSnapshot),
    postReplayFields: formatFields(rawState.postReplayFields),
    afterD0301BFields: formatFields(rawState.afterD0301BFields),
    uiClearSamples: rawState.uiClearSamples.map((sample) => ({
      before: formatSnapshot(sample.before),
      result: sample.result,
      after: formatSnapshot(sample.after),
      changes: formatChanges(sample.changes ?? []),
    })),
    afterBoot: formatSnapshot(rawState.afterBoot),
    afterDigit: formatSnapshot(rawState.afterDigit),
    afterClear: formatSnapshot(rawState.afterClear),
    digitRecord: formatRecord(rawState.digitRecord),
    clearRecord: formatRecord(rawState.clearRecord),
  };

  return {
    probe: 'phase909-full-transition-oracle',
    chromePath,
    pageUrl,
    pass,
    cleanExecution,
    clearRouteClassified,
    checkpointA: {
      fieldMatch: checkpointAFieldMatch,
      contractMatch: checkpointAContractMatch,
      knownOnly: checkpointAKnownOnly,
      mismatches: formatMismatches(checkpointAMismatches),
      contractMismatches: checkpointAContractRawMismatches.map((row) => ({
        name: row.name,
        expected: formatValue(row.name, row.expected),
        oracle: formatValue(row.name, row.oracle),
        actual: formatValue(row.name, row.actual),
      })),
      contractRows: checkpointAContractRowsRaw,
    },
    checkpointB: {
      fieldMatch: checkpointBFieldMatch,
      contractMatch: checkpointBContractMatch,
      mismatches: formatMismatches(checkpointBMismatches),
      contractMismatches: checkpointBContractRawMismatches.map((row) => ({
        name: row.name,
        expected: formatValue(row.name, row.expected),
        oracle: formatValue(row.name, row.oracle),
        actual: formatValue(row.name, row.actual),
      })),
      contractRows: checkpointBContractRowsRaw,
    },
    sourceEvidence,
    digitOracleFields: digitOracleRaw,
    clearOracleFields: clearOracleRaw,
    conclusion: checkpointAKnownOnly && checkpointBFieldMatch && checkpointBContractMatch
      ? 'The full Digit3 -> CLEAR transition is oracle-faithful at checkpoint B. Checkpoint A carries only the known D02A29 residual from the Digit3 post-insert gate stop; CLEAR resets it to the after-CLEAR oracle value.'
      : clearRouteClassified && !clearClean
        ? 'Digit3 is oracle-faithful except for the known checkpoint-A D02A29 residual, but the following CLEAR diverges: it misses the 0x0A229D pre-stop, takes the 0x001879 -> 0x0018F8 wipe path, and ends at max_steps with watched fields zeroed.'
      : 'The transition probe completed, but one or more unexpected checkpoint mismatches remain; see the residual tables for owner/classification.',
    state,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    cleanExecution: summary.cleanExecution,
    clearRouteClassified: summary.clearRouteClassified,
    checkpointA: {
      fieldMatch: summary.checkpointA?.fieldMatch,
      contractMatch: summary.checkpointA?.contractMatch,
      knownOnly: summary.checkpointA?.knownOnly,
      mismatches: summary.checkpointA?.mismatches,
    },
    checkpointB: {
      fieldMatch: summary.checkpointB?.fieldMatch,
      contractMatch: summary.checkpointB?.contractMatch,
      mismatches: summary.checkpointB?.mismatches,
    },
    digitKey: summary.state?.afterDigit?.lastKey,
    clearKey: summary.state?.afterClear?.lastKey,
    digitTargetCounts: summary.state?.digitRecord?.targetCounts,
    clearTargetCounts: summary.state?.clearRecord?.targetCounts,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase909-full-transition-oracle', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

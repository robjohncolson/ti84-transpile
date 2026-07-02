import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase908-browser-digit3-field-audit.md');
const CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const RAM_BASE = 0xD00000;
const DEBUG_PORT = 9908;
const EDIT_BUFFER_BASE = 0xD1A8CC;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase908-digit3-'));
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
  poll006D64: 0x006D64,
  clearAnchor0A229D: 0x0A229D,
});

const KEY = Object.freeze({
  code: 'Digit3',
  key: '3',
  vk: 51,
  expectedInsertByte: 0x33,
});

const EXPECTED_CONTRACT = Object.freeze({
  D0243A: 0xD1A8CD,
  EDIT_TOKEN_D1A8CC: 0x33,
  D02A29: 0x000C,
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

function readCaptureFields(fields = WATCHED_FIELDS) {
  const capture = fs.readFileSync(CAPTURE_PATH);
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
  if (!html.includes(marker)) throw new Error('Phase908 marker not found: finalizeColdbootPersistenceState');
  if (!html.includes(snapshotLine)) throw new Error('Phase908 marker not found: stable snapshot line');
  if (!html.includes(replayLine)) throw new Error('Phase908 marker not found: stable replay line');
  if (!html.includes(noForceLine)) throw new Error('Phase908 marker not found: D0301B no-force line');

  const instrumentation = String.raw`
const PHASE908_WATCHED_FIELDS = Object.freeze([
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

const PHASE908_TARGETS = Object.freeze({
  eventLoop08C331: 0x08C331,
  getCsc03FA09: 0x03FA09,
  insertGate0158DE: 0x0158DE,
  insertGateReturn0013DA: 0x0013DA,
  poll006D64: 0x006D64,
  clearAnchor0A229D: 0x0A229D,
});

function phase908ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase908ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE908_WATCHED_FIELDS.map(([name, addr, len]) => [
    name,
    phase908ReadValue(mem, addr, len),
  ]));
}

function phase908CpuRaw() {
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

function phase908Capture(label) {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase908CpuRaw(),
    fields: phase908ReadFields(),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase908PageErrors ?? [])],
  };
}

function phase908CreateRecord(label) {
  return {
    label,
    active: true,
    blockCount: 0,
    prevPc: null,
    start: null,
    end: null,
    lastFields: null,
    targetCounts: Object.fromEntries(Object.keys(PHASE908_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    fieldChanges: [],
  };
}

function phase908CurrentRecord() {
  const record = window.__phase908?.records?.at(-1) ?? null;
  return record?.active ? record : null;
}

window.__phase908PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase908PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase908PageErrors.push(String(event.reason || event));
});

window.__phase908 = {
  records: [],
  bootSnapshot: null,
  postReplayFields: null,
  afterD0301BFields: null,
  read: phase908Capture,
  begin(label) {
    const record = phase908CreateRecord(label);
    record.start = phase908Capture('start');
    record.lastFields = phase908ReadFields();
    this.records.push(record);
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (!record) return null;
    record.active = false;
    record.end = phase908Capture('end');
    return record;
  },
};

const phase908OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase908ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase908CurrentRecord();
  if (record) {
    record.blockCount += 1;
    const fields = phase908ReadFields();
    if (fields && record.lastFields) {
      for (const [name] of PHASE908_WATCHED_FIELDS) {
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

    for (const [name, target] of Object.entries(PHASE908_TARGETS)) {
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
  const result = phase908OriginalObserveColdbootPersistenceBlock(state, pc);
  if (record) record.prevPc = addr;
  return result;
};
`;

  html = html.replace(marker, `${instrumentation}\n\n${marker}`);
  html = html.replace(snapshotLine, `${snapshotLine}
      window.__phase908.bootSnapshot = coldbootVatSnapshot.map(([field, value]) => ({ name: field[0], addr: field[1], len: field[2], value }));`);
  html = html.replace(replayLine, `${replayLine}
    window.__phase908.postReplayFields = phase908ReadFields();`);
  html = html.replace(noForceLine, `${noForceLine}
    window.__phase908.afterD0301BFields = phase908ReadFields();`);
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

function keyParams(type) {
  return {
    type,
    windowsVirtualKeyCode: KEY.vk,
    nativeVirtualKeyCode: KEY.vk,
    code: KEY.code,
    key: KEY.key,
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

function firstOwnerForMismatch(row, rawState) {
  const changes = rawState.record?.fieldChanges ?? [];
  const change = changes.find((entry) => entry.name === row.name);
  if (change) return `first changed before pc ${hex(change.pc)} (prev ${change.prevPc == null ? 'none' : hex(change.prevPc)})`;

  const key = rawState.afterKey?.lastKey ?? {};
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
      ? 'post_insert_gate_stop ended browser burst before any D02A29 owner wrote the real cursor offset'
      : 'no D02A29 owner observed in bounded Digit3 trace';
  }

  const afterBootValue = rawState.afterBoot?.fields?.[row.name];
  if (afterBootValue !== row.oracle) return 'coldboot post-Phase6 baseline before Digit3';
  if (row.actual !== row.oracle) return 'unchanged residual after Digit3; no owner observed in bounded Phase908 trace';
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

function fieldTable(fields, oracleFields, actualFields) {
  return table(fields.map(([name]) => ({ name })), [
    { label: 'Field', value: (row) => row.name },
    { label: 'Oracle digit3', value: (row) => formatValue(row.name, oracleFields[row.name]) },
    { label: 'Browser Digit3', value: (row) => formatValue(row.name, actualFields[row.name]) },
    { label: 'Match', value: (row) => (actualFields[row.name] === oracleFields[row.name] ? 'yes' : 'NO') },
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
      '# Phase 908: Browser Digit3 Field Audit',
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
  const record = state.record ?? {};
  const key = state.afterKey?.lastKey ?? {};
  return [
    '# Phase 908: Browser Digit3 Field Audit',
    '',
    'Probe: `probe-phase908-browser-digit3-field-audit.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase908-browser-digit3-field-audit.mjs`',
    '',
    'Serves a temporary observation-only copy of `browser-shell.html`, boots coldboot mode, presses Digit3 through headless Chrome, and compares post-key RAM to `captures/realram-home-digit3-D00000-D657FF.bin`. The disk browser shell is not edited.',
    '',
    '## Summary',
    '',
    `- Probe completed: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Phase886 watched-field oracle match: ${data.phase886Match ? 'YES' : 'NO'} (${data.phase886Mismatches.length} mismatches).`,
    `- Edit-line contract match: ${data.editContractMatch ? 'YES' : 'NO'} (${data.editContractMismatches.length} mismatches).`,
    `- Key route: code=${key.code ?? '-'}, label=${key.label ?? '-'}, termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, expectedInsertByte=${key.expectedInsertByte == null ? '-' : hex(key.expectedInsertByte, 2)}, insertBlock=${key.insertBlock ?? '-'}, postInsertGateBlock=${key.postInsertGateBlock ?? '-'}, stoppedAtPostInsertGate=${key.stoppedAtPostInsertGate === true}, D000C2Bit7Restored=${key.D000C2Bit7Restored === true}.`,
    `- Phase 6: ${state.afterBoot?.phase6?.termination ?? '-'} after ${state.afterBoot?.phase6?.steps ?? '-'} steps at ${state.afterBoot?.phase6?.lastPc == null ? '-' : hex(state.afterBoot.phase6.lastPc)}; snapshot captured=${state.afterBoot?.phase6?.vatSnapshotCaptured === true}.`,
    `- Page errors: ${JSON.stringify(state.afterKey?.pageErrors ?? [])}.`,
    `- Adjudication: ${data.conclusion}`,
    '',
    '## Source Checks',
    '',
    sourceEvidenceTable(data.sourceEvidence),
    '',
    '## Phase886 Watched Fields',
    '',
    fieldTable(PHASE886_FIELDS, data.oracleFields, state.afterKey?.fields ?? {}),
    '',
    '## Edit-Line Contract',
    '',
    contractTable(data.editContractRows),
    '',
    '## Residual Mismatches',
    '',
    mismatchTable(data.mismatches),
    '',
    '## Route Targets',
    '',
    targetTable(record),
    '',
    '## Watched Field Changes During Digit3 Route',
    '',
    changeTable(record.fieldChanges ?? []),
    '',
    '## Bounded Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      phase886Match: data.phase886Match,
      editContractMatch: data.editContractMatch,
      conclusion: data.conclusion,
      mismatches: data.mismatches,
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
      afterKey: {
        status: state.afterKey?.status,
        fields: state.afterKey?.fields,
        editLine: state.afterKey?.editLine,
        persistence: state.afterKey?.persistence,
        lastKey: state.afterKey?.lastKey,
      },
      record: {
        label: record.label,
        blockCount: record.blockCount,
        targetCounts: record.targetCounts,
        targetFirst: record.targetFirst,
        fieldChanges: record.fieldChanges,
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

  const oracleRaw = readCaptureFields();
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
  await waitFor(ws, '!!window.__phase908 && !!window.__coldbootReadEditLineState', 'phase908 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__phase908.read('afterBoot')`, 30000);
  await evalExpr(ws, `window.__phase908.begin('Digit3')`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${KEY.code}'`, 'Digit3 completion', 90000);
  await sleep(150);

  const recordRaw = await evalExpr(ws, `window.__phase908.finish()`, 30000);
  const afterKey = await evalExpr(ws, `window.__phase908.read('afterKey')`, 30000);
  const extra = await evalExpr(ws, `(() => ({
    bootSnapshot: window.__phase908.bootSnapshot ?? null,
    postReplayFields: window.__phase908.postReplayFields ?? null,
    afterD0301BFields: window.__phase908.afterD0301BFields ?? null,
  }))()`, 30000);

  const rawState = {
    bootSnapshot: extra.bootSnapshot,
    postReplayFields: extra.postReplayFields,
    afterD0301BFields: extra.afterD0301BFields,
    afterBoot,
    afterKey,
    record: recordRaw,
  };

  const phase886RawMismatches = compareFields(afterKey.fields, oracleRaw, PHASE886_FIELDS);
  const editContractRowsRaw = Object.entries(EXPECTED_CONTRACT).map(([name, expected]) => ({
    name,
    expected,
    oracle: oracleRaw[name],
    actual: afterKey.fields?.[name],
    pass: afterKey.fields?.[name] === expected && oracleRaw[name] === expected,
  }));
  const editContractRawMismatches = editContractRowsRaw.filter((row) => !row.pass);
  const rawMismatches = [...new Map(
    [...phase886RawMismatches, ...editContractRawMismatches.map((row) => ({
      name: row.name,
      actual: row.actual,
      oracle: row.oracle,
    }))].map((row) => [row.name, row]),
  ).values()];
  const mismatches = rawMismatches.map((row) => ({
    ...row,
    owner: firstOwnerForMismatch(row, rawState),
  }));

  const key = afterKey.lastKey ?? {};
  const noPageErrors = (afterKey.pageErrors ?? []).length === 0;
  const cleanExecution = noPageErrors
    && key.code === KEY.code
    && key.expectedInsertByte === KEY.expectedInsertByte
    && key.insertBlock != null
    && key.termination === 'post_insert_gate_stop'
    && key.stoppedAtPostInsertGate === true
    && key.D000C2Bit7Restored === true
    && afterBoot.phase6?.termination === 'halt'
    && afterBoot.phase6?.vatSnapshotCaptured === true;
  const phase886Match = phase886RawMismatches.length === 0;
  const editContractMatch = editContractRawMismatches.length === 0;
  const pass = cleanExecution;

  const state = {
    bootSnapshot: formatBootSnapshot(rawState.bootSnapshot),
    postReplayFields: formatFields(rawState.postReplayFields),
    afterD0301BFields: formatFields(rawState.afterD0301BFields),
    afterBoot: formatSnapshot(rawState.afterBoot),
    afterKey: formatSnapshot(rawState.afterKey),
    record: formatRecord(rawState.record),
  };

  return {
    probe: 'phase908-browser-digit3-field-audit',
    chromePath,
    pageUrl,
    pass,
    cleanExecution,
    phase886Match,
    editContractMatch,
    phase886Mismatches: formatMismatches(phase886RawMismatches.map((row) => ({
      ...row,
      owner: firstOwnerForMismatch(row, rawState),
    }))),
    editContractMismatches: editContractRawMismatches.map((row) => ({
      name: row.name,
      expected: formatValue(row.name, row.expected),
      oracle: formatValue(row.name, row.oracle),
      actual: formatValue(row.name, row.actual),
    })),
    editContractRows: editContractRowsRaw.map((row) => ({
      ...row,
      expected: row.expected,
      oracle: row.oracle,
      actual: row.actual,
    })),
    sourceEvidence,
    oracleFields: oracleRaw,
    mismatches: formatMismatches(mismatches),
    conclusion: phase886Match && editContractMatch
      ? 'The browser Digit3 route matches the real digit3 oracle for all phase886 watched fields and the edit-line contract.'
      : 'The browser Digit3 route completed cleanly, but one or more oracle fields differ; see the owner/classification column for the first observed cause.',
    state,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    cleanExecution: summary.cleanExecution,
    phase886Match: summary.phase886Match,
    editContractMatch: summary.editContractMatch,
    mismatches: summary.mismatches,
    key: summary.state?.afterKey?.lastKey,
    targetCounts: summary.state?.record?.targetCounts,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase908-browser-digit3-field-audit', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

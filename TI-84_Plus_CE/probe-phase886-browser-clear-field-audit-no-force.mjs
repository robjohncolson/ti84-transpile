import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase886-browser-clear-field-audit-no-force.md');
const CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const RAM_BASE = 0xD00000;
const debugPort = 9886;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase886-no-force-'));
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
]);

const TARGETS = Object.freeze({
  clearCaller058A16: 0x058A16,
  clearEntry0A223A: 0x0A223A,
  anchor0A229D: 0x0A229D,
  sentinelBlock0018D7: 0x0018D7,
  shortTail0018EC: 0x0018EC,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});

const KEY = Object.freeze({
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
  if (name === 'D010F4' || name === 'D02505' || name === 'D000C2_IY42') return 2;
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

function readCaptureFields() {
  const capture = fs.readFileSync(CAPTURE_PATH);
  return Object.fromEntries(WATCHED_FIELDS.map(([name, addr, len]) => [name, readCaptureValue(capture, addr, len)]));
}

function formatFields(fields) {
  if (!fields) return null;
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, value == null ? null : hex(value, valueWidth(name))]),
  );
}

function compareFields(actual, oracle) {
  return WATCHED_FIELDS
    .filter(([name]) => actual?.[name] !== oracle?.[name])
    .map(([name]) => ({
      name,
      actual: actual?.[name] ?? null,
      oracle: oracle?.[name] ?? null,
    }));
}

function compareNamedFields(before, after) {
  return WATCHED_FIELDS
    .filter(([name]) => before?.[name] !== after?.[name])
    .map(([name]) => ({
      name,
      before: before?.[name] ?? null,
      after: after?.[name] ?? null,
    }));
}

function formatMismatches(mismatches) {
  return mismatches.map((row) => ({
    name: row.name,
    actual: row.actual == null ? null : hex(row.actual, valueWidth(row.name)),
    oracle: row.oracle == null ? null : hex(row.oracle, valueWidth(row.name)),
    owner: row.owner ?? null,
  }));
}

function formatChanges(changes) {
  return changes.map((row) => ({
    ...row,
    before: row.before == null ? null : hex(row.before, valueWidth(row.name)),
    after: row.after == null ? null : hex(row.after, valueWidth(row.name)),
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
  return {
    replayNames,
    hasD010Replay: ['D010EF', 'D010FE', 'D010F4'].every((name) => replayNames.includes(name)),
    hasD0301BForce: /evalWrite24\(mem,\s*0xD0301B,\s*0x5AA55A\)/.test(source),
    hasD008E0OracleErrSp: /evalWrite24\(mem,\s*0xD008E0,\s*SCREEN_STACK_TOP\s*-\s*18\)/.test(source),
    hasBroadEditVatForceRestore: /force-restore|forceRestore|broad edit\/VAT/i.test(source),
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
  if (!html.includes(marker)) throw new Error('Phase880 marker not found: finalizeColdbootPersistenceState');
  if (!html.includes(snapshotLine)) throw new Error('Phase880 marker not found: stable snapshot line');
  if (!html.includes(replayLine)) throw new Error('Phase880 marker not found: stable replay line');
  if (!html.includes(noForceLine)) throw new Error('Phase886 marker not found: D0301B no-force line');

  const instrumentation = String.raw`
const PHASE880_WATCHED_FIELDS = Object.freeze([
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

const PHASE880_TARGETS = Object.freeze({
  clearCaller058A16: 0x058A16,
  clearEntry0A223A: 0x0A223A,
  anchor0A229D: 0x0A229D,
  sentinelBlock0018D7: 0x0018D7,
  shortTail0018EC: 0x0018EC,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});
const PHASE880_TARGET_VALUES = new Set(Object.values(PHASE880_TARGETS));

function phase880ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase880ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE880_WATCHED_FIELDS.map(([name, addr, len]) => [
    name,
    phase880ReadValue(mem, addr, len),
  ]));
}

function phase880CpuRaw() {
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

function phase880Capture(label) {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase880CpuRaw(),
    fields: phase880ReadFields(),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase880PageErrors ?? [])],
  };
}

function phase880CreateRecord(label) {
  return {
    label,
    active: true,
    blockCount: 0,
    prevPc: null,
    start: null,
    end: null,
    lastFields: null,
    targetCounts: Object.fromEntries(Object.keys(PHASE880_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    targetSamples: [],
    fieldChanges: [],
    hotBlocks: {},
    topHotBlocks: [],
  };
}

function phase880CurrentRecord() {
  const record = window.__phase880?.records?.at(-1) ?? null;
  return record?.active ? record : null;
}

window.__phase880PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase880PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase880PageErrors.push(String(event.reason || event));
});

window.__phase880 = {
  records: [],
  bootSnapshot: null,
  postReplayFields: null,
  afterD0301BFields: null,
  uiClearSamples: [],
  read: phase880Capture,
  begin(label) {
    const record = phase880CreateRecord(label);
    record.start = phase880Capture('start');
    record.lastFields = phase880ReadFields();
    this.records.push(record);
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (!record) return null;
    record.active = false;
    record.end = phase880Capture('end');
    record.topHotBlocks = Object.entries(record.hotBlocks)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([pc, count]) => ({ pc, count }));
    return record;
  },
};

const phase880OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase880ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase880CurrentRecord();
  if (record) {
    record.blockCount += 1;
    const pcHex = '0x' + addr.toString(16).toUpperCase().padStart(6, '0');
    record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
    const fields = phase880ReadFields();
    if (fields && record.lastFields) {
      for (const [name] of PHASE880_WATCHED_FIELDS) {
        if (fields[name] === record.lastFields[name]) continue;
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
    record.lastFields = fields;

    for (const [name, target] of Object.entries(PHASE880_TARGETS)) {
      if (addr !== target) continue;
      record.targetCounts[name] += 1;
      const sample = phase880Capture(name);
      sample.block = record.blockCount;
      sample.pc = addr;
      sample.prevPc = record.prevPc;
      if (!record.targetFirst[name]) record.targetFirst[name] = sample;
      if (record.targetSamples.length < 40) record.targetSamples.push(sample);
    }

    if (PHASE880_TARGET_VALUES.has(addr) && record.targetSamples.length < 40) {
      const sample = phase880Capture('target');
      sample.block = record.blockCount;
      sample.pc = addr;
      sample.prevPc = record.prevPc;
      record.targetSamples.push(sample);
    }
  }
  const result = phase880OriginalObserveColdbootPersistenceBlock(state, pc);
  if (record) record.prevPc = addr;
  return result;
};

const phase880OriginalApplyColdbootUiLevelClear = applyColdbootUiLevelClear;
applyColdbootUiLevelClear = function phase880ApplyColdbootUiLevelClear() {
  const before = phase880Capture('uiClearBefore');
  const result = phase880OriginalApplyColdbootUiLevelClear();
  const after = phase880Capture('uiClearAfter');
  const changes = [];
  const beforeFields = before.fields ?? {};
  const afterFields = after.fields ?? {};
  for (const [name] of PHASE880_WATCHED_FIELDS) {
    if (beforeFields[name] === afterFields[name]) continue;
    changes.push({ name, before: beforeFields[name], after: afterFields[name], owner: 'applyColdbootUiLevelClear' });
  }
  window.__phase880.uiClearSamples.push({ before, result, after, changes });
  return result;
};
`;

  html = html.replace(marker, `${instrumentation}\n\n${marker}`);
  html = html.replace(snapshotLine, `${snapshotLine}
      window.__phase880.bootSnapshot = coldbootVatSnapshot.map(([field, value]) => ({ name: field[0], addr: field[1], len: field[2], value }));`);
  html = html.replace(replayLine, `${replayLine}
    window.__phase880.postReplayFields = phase880ReadFields();`);
  html = html.replace(noForceLine, `${noForceLine}
    window.__phase880.afterD0301BFields = phase880ReadFields();`);
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
      const pages = await httpJson(`http://127.0.0.1:${debugPort}/json/list`);
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
    ...snapshot,
    pc: snapshot.pc == null ? null : hex(snapshot.pc),
    prevPc: snapshot.prevPc == null ? null : hex(snapshot.prevPc),
    fields: formatFields(snapshot.fields),
    cpu: snapshot.cpu ? {
      ...snapshot.cpu,
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
    } : null,
  };
}

function formatRecord(record) {
  if (!record) return null;
  return {
    ...record,
    start: formatSnapshot(record.start),
    end: formatSnapshot(record.end),
    lastFields: formatFields(record.lastFields),
    targetFirst: Object.fromEntries(
      Object.entries(record.targetFirst ?? {}).map(([name, value]) => [name, formatSnapshot(value)]),
    ),
    targetSamples: (record.targetSamples ?? []).map(formatSnapshot),
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

function ownerForMismatch(name, actual, oracle, state) {
  const uiSample = (state.uiClearSamples ?? []).find((sample) => (
    (sample.changes ?? []).some((change) => change.name === name)
  ));
  if (uiSample) return 'applyColdbootUiLevelClear';

  const routeChange = (state.record?.fieldChanges ?? []).find((change) => change.name === name);
  if (routeChange) {
    return `key route changed ${name} before pc ${hex(routeChange.pc)} (prev ${routeChange.prevPc == null ? 'none' : hex(routeChange.prevPc)})`;
  }

  const afterBootValue = state.afterBoot?.fields?.[name];
  if (afterBootValue !== oracle) return 'coldboot post-Phase6 state before key';

  if (actual !== oracle) return 'unchanged residual after key; no field owner observed in Phase880 trace';
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

function fieldTable(oracleFields, actualFields) {
  return table(WATCHED_FIELDS.map(([name]) => ({ name })), [
    { label: 'Field', value: (row) => row.name },
    { label: 'Oracle after CLEAR', value: (row) => hex(oracleFields[row.name], valueWidth(row.name)) },
    { label: 'Browser after CLEAR', value: (row) => hex(actualFields[row.name], valueWidth(row.name)) },
    { label: 'Match', value: (row) => (
      hex(actualFields[row.name], valueWidth(row.name)) === hex(oracleFields[row.name], valueWidth(row.name)) ? 'yes' : 'NO'
    ) },
  ]);
}

function mismatchTable(mismatches) {
  return table(mismatches, [
    { label: 'Field', value: (row) => row.name },
    { label: 'Actual', value: (row) => row.actual },
    { label: 'Oracle', value: (row) => row.oracle },
    { label: 'Owner', value: (row) => row.owner },
  ]);
}

function targetTable(record) {
  return table(Object.entries(record?.targetCounts ?? {}).map(([name, count]) => ({ name, count })), [
    { label: 'Target', value: (row) => row.name },
    { label: 'Hits', value: (row) => String(row.count) },
  ]);
}

function changeTable(changes) {
  return table(changes, [
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
    { name: 'D010 replay packet present', value: source.hasD010Replay },
    { name: 'D0301B magic forced', value: source.hasD0301BForce },
    { name: 'D008E0 uses SCREEN_STACK_TOP-18', value: source.hasD008E0OracleErrSp },
    { name: 'Broad edit/VAT force-restore marker found', value: source.hasBroadEditVatForceRestore },
  ], [
    { label: 'Source check', value: (row) => row.name },
    { label: 'Value', value: (row) => (row.value ? 'yes' : 'no') },
  ]);
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 886: Browser CLEAR Field Audit (No D0301B Force)',
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
    '# Phase 886: Browser CLEAR Field Audit (No D0301B Force)',
    '',
    'Probe: `probe-phase886-browser-clear-field-audit-no-force.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase886-browser-clear-field-audit-no-force.mjs`',
    '',
    'Serves a temporary observation-only copy of the patched `browser-shell.html`, boots coldboot mode, presses Escape/CLEAR through headless Chrome, and compares the post-key watched RAM fields to `captures/realram-home-afterCLEAR-D00000-D657FF.bin`. The disk browser shell is not edited.',
    '',
    '## Summary',
    '',
    `- Probe completed: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Browser CLEAR oracle match: ${data.milestoneComplete ? 'YES' : 'NO'}.`,
    `- Key route: termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, controlStopPc=${key.controlStopPc == null ? '-' : hex(key.controlStopPc)}, uiClearApplied=${key.uiClearApplied === true}, wipes=${key.wipes ?? '-'}.`,
    `- Phase 6: ${state.afterBoot?.phase6?.termination ?? '-'} after ${state.afterBoot?.phase6?.steps ?? '-'} steps at ${state.afterBoot?.phase6?.lastPc == null ? '-' : hex(state.afterBoot.phase6.lastPc)}; snapshot captured=${state.afterBoot?.phase6?.vatSnapshotCaptured === true}.`,
    `- Page errors: ${JSON.stringify(state.afterKey?.pageErrors ?? [])}.`,
    `- Adjudication: ${data.conclusion}`,
    '',
    '## Source Checks',
    '',
    sourceEvidenceTable(data.sourceEvidence),
    '',
    'Stable replay field names:',
    '',
    '```json',
    JSON.stringify(data.sourceEvidence.replayNames, null, 2),
    '```',
    '',
    '## Field Comparison',
    '',
    fieldTable(data.oracleFields, state.afterKey?.fields ?? {}),
    '',
    '## Residual Mismatches',
    '',
    mismatchTable(data.mismatches),
    '',
    '## Route Targets',
    '',
    targetTable(record),
    '',
    '## Watched Field Changes During Key Route',
    '',
    changeTable(record.fieldChanges ?? []),
    '',
    '## UI Clear Samples',
    '',
    '```json',
    JSON.stringify(state.uiClearSamples ?? [], null, 2),
    '```',
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      milestoneComplete: data.milestoneComplete,
      conclusion: data.conclusion,
      mismatches: data.mismatches,
      sourceEvidence: data.sourceEvidence,
      bootSnapshot: state.bootSnapshot,
      postReplayFields: state.postReplayFields,
      afterD0301BFields: state.afterD0301BFields,
      afterBoot: state.afterBoot,
      afterKey: state.afterKey,
      record: state.record,
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
  await waitFor(ws, '!!window.__phase880 && !!window.__coldbootReadEditLineState', 'phase880 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__phase880.read('afterBoot')`, 30000);
  await evalExpr(ws, `window.__phase880.begin('Escape/CLEAR')`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${KEY.code}'`, 'Escape/CLEAR completion', 90000);
  await sleep(150);

  const recordRaw = await evalExpr(ws, `window.__phase880.finish()`, 30000);
  const afterKey = await evalExpr(ws, `window.__phase880.read('afterKey')`, 30000);
  const extra = await evalExpr(ws, `(() => ({
    bootSnapshot: window.__phase880.bootSnapshot ?? null,
    postReplayFields: window.__phase880.postReplayFields ?? null,
    afterD0301BFields: window.__phase880.afterD0301BFields ?? null,
    uiClearSamples: window.__phase880.uiClearSamples ?? [],
  }))()`, 30000);

  const rawState = {
    bootSnapshot: extra.bootSnapshot,
    postReplayFields: extra.postReplayFields,
    afterD0301BFields: extra.afterD0301BFields,
    uiClearSamples: extra.uiClearSamples,
    afterBoot,
    afterKey,
    record: recordRaw,
  };
  const rawMismatches = compareFields(afterKey.fields, oracleRaw);
  const mismatches = rawMismatches.map((row) => ({
    ...row,
    owner: ownerForMismatch(row.name, row.actual, row.oracle, rawState),
  }));
  const milestoneComplete = mismatches.length === 0;
  const key = afterKey.lastKey ?? {};
  const noPageErrors = (afterKey.pageErrors ?? []).length === 0;
  const cleanExecution = noPageErrors
    && key.code === KEY.code
    && key.termination === 'control_pre_stop'
    && key.uiClearApplied === true
    && afterBoot.phase6?.termination === 'halt'
    && afterBoot.phase6?.vatSnapshotCaptured === true;
  const residualNamed = mismatches.every((row) => typeof row.owner === 'string' && row.owner.length > 0);
  const pass = cleanExecution && (milestoneComplete || residualNamed);

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
    afterKey: formatSnapshot(rawState.afterKey),
    record: formatRecord(rawState.record),
  };

  return {
    probe: 'phase886-browser-clear-field-audit-no-force',
    chromePath,
    pageUrl,
    pass,
    milestoneComplete,
    cleanExecution,
    sourceEvidence,
    oracleFields: oracleRaw,
    mismatches: formatMismatches(mismatches),
    conclusion: milestoneComplete
      ? 'The patched browser Escape/CLEAR path matches the raw realram after-CLEAR oracle for every watched field. D0301B, the D010 mirror packet, D008E0, and the edit/VAT set all survive without any probe-side broad force-restore.'
      : 'The browser Escape/CLEAR path still has residual watched-field mismatches; see the owner column for the first observed owner/classification.',
    state,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    milestoneComplete: summary.milestoneComplete,
    cleanExecution: summary.cleanExecution,
    mismatches: summary.mismatches,
    targetCounts: summary.state?.record?.targetCounts,
    key: summary.state?.afterKey?.lastKey,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase886-browser-clear-field-audit-no-force', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

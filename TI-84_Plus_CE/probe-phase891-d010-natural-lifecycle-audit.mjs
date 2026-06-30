import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase891-d010-natural-lifecycle-audit.md');
const CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const RAM_BASE = 0xD00000;
const debugPort = 9891 + Math.floor(Math.random() * 200);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase891-d010-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const KEY = Object.freeze({
  code: 'Escape',
  key: 'Escape',
  vk: 27,
});

const D010_FIELDS = Object.freeze([
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
]);

const WATCHED_FIELDS = Object.freeze([
  ['D008E0', 0xD008E0, 3],
  ...D010_FIELDS,
  ['D0301B', 0xD0301B, 3],
]);

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function valueWidth(name) {
  if (name === 'D010F4') return 2;
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

function formatChange(change) {
  return {
    ...change,
    before: change.before == null ? null : hex(change.before, valueWidth(change.name)),
    after: change.after == null ? null : hex(change.after, valueWidth(change.name)),
    pc: change.pc == null ? null : hex(change.pc),
    prevPc: change.prevPc == null ? null : hex(change.prevPc),
  };
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

function analyzeSource(source) {
  const sha256 = crypto.createHash('sha256').update(source).digest('hex');
  const packetMatch = source.match(/const COLDBOOT_STABLE_REPLAY_FIELDS = \[([\s\S]*?)\n  \];/);
  const replayNames = packetMatch
    ? [...packetMatch[1].matchAll(/\['([^']+)'/g)].map((match) => match[1])
    : [];
  return {
    file: 'browser-shell.html',
    sha256,
    replayNames,
    hasD010Replay: D010_FIELDS.every(([name]) => replayNames.includes(name)),
    hasD0301BForce: /evalWrite24\(mem,\s*0xD0301B,\s*0x5AA55A\)/.test(source),
    hasNaturalOwnerEntry: /const COLDBOOT_D0301B_OWNER_ENTRY = 0x0454BE;/.test(source),
    hasOwnerStopBefore09DEE0: /const COLDBOOT_D0301B_OWNER_STOP_BEFORE = 0x09DEE0;/.test(source),
    hasD008E0OracleErrSp: /evalWrite24\(mem,\s*0xD008E0,\s*SCREEN_STACK_TOP\s*-\s*18\)/.test(source),
  };
}

function instrumentBrowserShell(sourceHtml) {
  let html = sourceHtml;
  const finalizeMarker = '  return state;\n}\n\nfunction getColdbootKeyBurstStepsForCode';
  const p5Start = '  const p5 = executor.runFrom(COLDBOOT_LAUNCH_HOME_INIT, \'adl\', {';
  const p5OnBlock = '    onBlock(pc) {\n      if (coldbootVatSnapshot || (pc & 0xFFFFFF) !== 0x001879) return;';
  const snapshotLine = '      coldbootVatSnapshot = COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field, readColdbootReplayField(field)]);';
  const p5Total = '  totalSteps += p5.steps;';
  const beforeOwner = '    const d0301bBeforeOwner = evalRead24(mem, 0xD0301B);';
  const ownerOnBlock = '        onBlock(pc, mode, meta, steps) {\n          if ((pc & 0xFFFFFF) !== COLDBOOT_D0301B_OWNER_STOP_BEFORE) return;';
  const ownerTotal = '    totalSteps += owner.steps;';
  const replayStart = '  if (coldbootVatSnapshot) {\n    for (const [field, value] of coldbootVatSnapshot) writeColdbootReplayField(field, value);';
  const phase6Expose = '  window.__coldbootPhase6 = {\n    steps: p6.steps,';
  const phase6Log = '  log(`<span class="info">--- Phase 6 done: ${p6.steps} steps, ${p6.termination} at 0x${hex(p6.lastPc, 6)}; D007CA=0x${hex(evalRead24(mem, 0xD007CA), 6)}, VAT=0x${hex(evalRead24(mem, 0xD02590), 6)}, VRAM=${countVRAMPixels()}px ---</span>`);';
  const editSeedEnd = '    mem[0xD1A8C0] = 0x0C; mem[0xD1A8C1] = 0x00; mem[0xD1A8C2] = 0x07;\n  })();';

  for (const marker of [finalizeMarker, p5Start, p5OnBlock, snapshotLine, p5Total, beforeOwner, ownerOnBlock, ownerTotal, replayStart, phase6Expose, phase6Log, editSeedEnd]) {
    if (!html.includes(marker)) throw new Error(`Phase891 instrumentation marker not found: ${marker.slice(0, 80)}`);
  }

  const instrumentation = String.raw`
const PHASE891_FIELDS = Object.freeze([
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D0301B', 0xD0301B, 3],
]);
const PHASE891_D010_NAMES = new Set(['D010EF', 'D010FE', 'D010F4']);
const PHASE891_TARGETS = Object.freeze({
  stableSnapshot001879: 0x001879,
  stableWipe0018F8: 0x0018F8,
  naturalOwner0454BE: 0x0454BE,
  ownerStop09DEE0: 0x09DEE0,
  clearCaller058A16: 0x058A16,
  clearEntry0A223A: 0x0A223A,
  anchor0A229D: 0x0A229D,
});

function phase891ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase891ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE891_FIELDS.map(([name, addr, len]) => [name, phase891ReadValue(mem, addr, len)]));
}

function phase891Capture(label) {
  return {
    label,
    runtimeMode,
    totalSteps,
    lastPc,
    lastMode,
    cpu: cpu ? {
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
    } : null,
    fields: phase891ReadFields(),
    phase6: window.__coldbootPhase6 ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    vram: countVRAMPixels?.() ?? null,
    status: document.getElementById('status')?.textContent ?? null,
  };
}

function phase891CreateRecord(name) {
  return {
    name,
    active: false,
    blockCount: 0,
    prevPc: null,
    lastFields: null,
    changes: [],
    d010Changes: [],
    targetCounts: Object.fromEntries(Object.keys(PHASE891_TARGETS).map((key) => [key, 0])),
    targetFirst: {},
    start: null,
    end: null,
  };
}

window.__phase891 = {
  records: {},
  snapshots: {},
  stableReplaySnapshot: null,
  replayD010Values: null,
  keyActive: false,
  errors: [],
  capture: phase891Capture,
  beginPhase(name) {
    const record = this.records[name] ?? phase891CreateRecord(name);
    record.active = true;
    record.blockCount = 0;
    record.prevPc = null;
    record.lastFields = phase891ReadFields();
    record.changes = [];
    record.d010Changes = [];
    record.targetCounts = Object.fromEntries(Object.keys(PHASE891_TARGETS).map((key) => [key, 0]));
    record.targetFirst = {};
    record.start = phase891Capture(name + ':start');
    record.end = null;
    this.records[name] = record;
    return record.start;
  },
  observe(name, pc) {
    const record = this.records[name] ?? phase891CreateRecord(name);
    if (!record.active) {
      record.active = true;
      record.lastFields = phase891ReadFields();
      record.start = phase891Capture(name + ':implicit-start');
      this.records[name] = record;
    }
    const addr = pc & 0xFFFFFF;
    record.blockCount += 1;
    const fields = phase891ReadFields();
    for (const [targetName, targetPc] of Object.entries(PHASE891_TARGETS)) {
      if (addr !== targetPc) continue;
      record.targetCounts[targetName] += 1;
      if (!record.targetFirst[targetName]) record.targetFirst[targetName] = {
        block: record.blockCount,
        pc: addr,
        prevPc: record.prevPc,
        snapshot: phase891Capture(targetName),
      };
    }
    if (fields && record.lastFields) {
      for (const [fieldName] of PHASE891_FIELDS) {
        if (fields[fieldName] === record.lastFields[fieldName]) continue;
        const change = {
          phase: name,
          block: record.blockCount,
          name: fieldName,
          before: record.lastFields[fieldName],
          after: fields[fieldName],
          pc: addr,
          prevPc: record.prevPc,
        };
        record.changes.push(change);
        if (PHASE891_D010_NAMES.has(fieldName)) record.d010Changes.push(change);
      }
    }
    record.lastFields = fields;
    record.prevPc = addr;
  },
  endPhase(name) {
    const record = this.records[name];
    if (!record) return null;
    record.active = false;
    record.end = phase891Capture(name + ':end');
    return record.end;
  },
};

window.addEventListener('error', (event) => {
  window.__phase891?.errors?.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase891?.errors?.push(String(event.reason || event));
});

const phase891OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase891ObserveColdbootPersistenceBlock(state, pc) {
  if (window.__phase891?.keyActive) window.__phase891.observe('key-route', pc);
  return phase891OriginalObserveColdbootPersistenceBlock(state, pc);
};

const phase891OriginalApplyColdbootUiLevelClear = applyColdbootUiLevelClear;
applyColdbootUiLevelClear = function phase891ApplyColdbootUiLevelClear() {
  if (window.__phase891) window.__phase891.snapshots.beforeUiClear = phase891Capture('beforeUiClear');
  const result = phase891OriginalApplyColdbootUiLevelClear();
  if (window.__phase891) window.__phase891.snapshots.afterUiClear = phase891Capture('afterUiClear');
  return result;
};

function phase891SnapshotD010FromReplay(snapshot) {
  return Object.fromEntries((snapshot ?? [])
    .filter(([field]) => PHASE891_D010_NAMES.has(field[0]))
    .map(([field, value]) => [field[0], value]));
}
`;

  html = html.replace(finalizeMarker, `  return state;\n}\n\n${instrumentation}\nfunction getColdbootKeyBurstStepsForCode`);
  html = html.replace(p5Start, `  window.__phase891?.beginPhase('p5-launch-home');\n  window.__phase891.snapshots.beforeP5 = window.__phase891.capture('beforeP5');\n${p5Start}`);
  html = html.replace(p5OnBlock, `    onBlock(pc) {\n      window.__phase891?.observe('p5-launch-home', pc);\n      if (coldbootVatSnapshot || (pc & 0xFFFFFF) !== 0x001879) return;`);
  html = html.replace(snapshotLine, `${snapshotLine}\n      window.__phase891.stableReplaySnapshot = coldbootVatSnapshot.map(([field, value]) => ({ name: field[0], addr: field[1], len: field[2], value }));\n      window.__phase891.snapshots.stableSnapshotHit = window.__phase891.capture('stableSnapshotHit');`);
  html = html.replace(p5Total, `${p5Total}\n  window.__phase891.snapshots.afterP5 = window.__phase891.capture('afterP5');\n  window.__phase891?.endPhase('p5-launch-home');`);
  html = html.replace(beforeOwner, `    window.__phase891.snapshots.beforeNaturalD0301BOwner = window.__phase891.capture('beforeNaturalD0301BOwner');\n    window.__phase891?.beginPhase('phase5b-natural-d0301b-owner');\n${beforeOwner}`);
  html = html.replace(ownerOnBlock, `        onBlock(pc, mode, meta, steps) {\n          window.__phase891?.observe('phase5b-natural-d0301b-owner', pc);\n          if ((pc & 0xFFFFFF) !== COLDBOOT_D0301B_OWNER_STOP_BEFORE) return;`);
  html = html.replace(ownerTotal, `    window.__phase891.snapshots.afterNaturalD0301BOwner = window.__phase891.capture('afterNaturalD0301BOwner');\n    window.__phase891?.endPhase('phase5b-natural-d0301b-owner');\n${ownerTotal}`);
  html = html.replace(replayStart, `  if (coldbootVatSnapshot) {\n    window.__phase891.snapshots.beforeStableReplay = window.__phase891.capture('beforeStableReplay');\n    for (const [field, value] of coldbootVatSnapshot) writeColdbootReplayField(field, value);\n    window.__phase891.replayD010Values = phase891SnapshotD010FromReplay(coldbootVatSnapshot);\n    window.__phase891.snapshots.afterStableReplay = window.__phase891.capture('afterStableReplay');`);
  html = html.replace(phase6Expose, `  window.__phase891.snapshots.afterPhase6BeforeExpose = window.__phase891.capture('afterPhase6BeforeExpose');\n${phase6Expose}`);
  html = html.replace(phase6Log, `${phase6Log}\n  window.__phase891.snapshots.afterPhase6 = window.__phase891.capture('afterPhase6');`);
  html = html.replace(editSeedEnd, `${editSeedEnd}\n  window.__phase891.snapshots.afterEditSeed = window.__phase891.capture('afterEditSeed');`);
  return html;
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

function snapshotFields(state, name) {
  return state?.snapshots?.[name]?.fields ?? null;
}

function d010Only(fields) {
  return Object.fromEntries(D010_FIELDS.map(([name]) => [name, fields?.[name] ?? null]));
}

function d010Matches(actual, expected) {
  return D010_FIELDS.every(([name]) => actual?.[name] === expected?.[name]);
}

function formatSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    ...snapshot,
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
    changes: (record.changes ?? []).map(formatChange),
    d010Changes: (record.d010Changes ?? []).map(formatChange),
    targetFirst: Object.fromEntries(
      Object.entries(record.targetFirst ?? {}).map(([name, value]) => [name, {
        block: value.block,
        pc: hex(value.pc),
        prevPc: value.prevPc == null ? null : hex(value.prevPc),
        snapshot: formatSnapshot(value.snapshot),
      }]),
    ),
  };
}

function formatState(state) {
  return {
    ...state,
    snapshots: Object.fromEntries(
      Object.entries(state.snapshots ?? {}).map(([name, snapshot]) => [name, formatSnapshot(snapshot)]),
    ),
    records: Object.fromEntries(
      Object.entries(state.records ?? {}).map(([name, record]) => [name, formatRecord(record)]),
    ),
    stableReplaySnapshot: (state.stableReplaySnapshot ?? []).map((row) => ({
      ...row,
      addr: hex(row.addr),
      value: row.value == null ? null : hex(row.value, valueWidth(row.name)),
    })),
    replayD010Values: formatFields(state.replayD010Values),
  };
}

function buildTimelineRows(state, oracleD010) {
  const names = [
    ['real after-CLEAR oracle', { fields: oracleD010, source: 'capture' }],
    ['stable snapshot @0x001879', { fields: d010Only(snapshotFields(state, 'stableSnapshotHit')), source: 'browser snapshot' }],
    ['after Phase5 natural route', { fields: d010Only(snapshotFields(state, 'afterP5')), source: 'browser natural' }],
    ['before D0301B owner', { fields: d010Only(snapshotFields(state, 'beforeNaturalD0301BOwner')), source: 'browser natural' }],
    ['after D0301B owner', { fields: d010Only(snapshotFields(state, 'afterNaturalD0301BOwner')), source: 'browser natural' }],
    ['before stable replay', { fields: d010Only(snapshotFields(state, 'beforeStableReplay')), source: 'browser replay boundary' }],
    ['after stable replay', { fields: d010Only(snapshotFields(state, 'afterStableReplay')), source: 'browser replay boundary' }],
    ['after Phase6 repaint', { fields: d010Only(snapshotFields(state, 'afterPhase6')), source: 'browser natural' }],
    ['after edit seed', { fields: d010Only(snapshotFields(state, 'afterEditSeed')), source: 'browser seed' }],
    ['before UI clear', { fields: d010Only(snapshotFields(state, 'beforeUiClear')), source: 'browser key route' }],
    ['after UI clear', { fields: d010Only(snapshotFields(state, 'afterUiClear')), source: 'browser key route' }],
  ];
  return names.map(([point, data]) => ({
    point,
    source: data.source,
    fields: data.fields,
    matchesOracle: d010Matches(data.fields, oracleD010),
  }));
}

function table(rows, columns) {
  if (!rows.length) return 'No rows.';
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function d010Table(rows) {
  return table(rows, [
    { label: 'Point', value: (row) => row.point },
    { label: 'Source', value: (row) => row.source },
    { label: 'D010EF', value: (row) => hex(row.fields?.D010EF, 6) },
    { label: 'D010FE', value: (row) => hex(row.fields?.D010FE, 6) },
    { label: 'D010F4', value: (row) => hex(row.fields?.D010F4, 2) },
    { label: 'Oracle match', value: (row) => (row.matchesOracle ? 'yes' : 'NO') },
  ]);
}

function changeTable(rows) {
  return table(rows, [
    { label: 'Phase', value: (row) => row.phase },
    { label: 'Block', value: (row) => String(row.block ?? '-') },
    { label: 'Field', value: (row) => row.name },
    { label: 'Before', value: (row) => row.before },
    { label: 'After', value: (row) => row.after },
    { label: 'PC', value: (row) => row.pc },
    { label: 'Prev PC', value: (row) => row.prevPc },
  ]);
}

function buildAnalysis(rawState, oracleFields, sourceEvidence, pageState) {
  const oracleD010 = d010Only(oracleFields);
  const p5Record = rawState.records?.['p5-launch-home'] ?? {};
  const ownerRecord = rawState.records?.['phase5b-natural-d0301b-owner'] ?? {};
  const keyRecord = rawState.records?.['key-route'] ?? {};
  const p5D010Changes = p5Record.d010Changes ?? [];
  const ownerD010Changes = ownerRecord.d010Changes ?? [];
  const keyD010Changes = keyRecord.d010Changes ?? [];
  const stableSnapshotD010 = d010Only(snapshotFields(rawState, 'stableSnapshotHit'));
  const afterP5D010 = d010Only(snapshotFields(rawState, 'afterP5'));
  const beforeReplayD010 = d010Only(snapshotFields(rawState, 'beforeStableReplay'));
  const afterReplayD010 = d010Only(snapshotFields(rawState, 'afterStableReplay'));
  const afterPhase6D010 = d010Only(snapshotFields(rawState, 'afterPhase6'));
  const afterUiClearD010 = d010Only(snapshotFields(rawState, 'afterUiClear'));
  const zeroD010 = { D010EF: 0, D010FE: 0, D010F4: 0 };
  const p5WritesOracleThenWipes = d010Matches(stableSnapshotD010, oracleD010)
    && d010Matches(afterP5D010, zeroD010)
    && p5D010Changes.some((change) => change.after !== 0)
    && p5D010Changes.some((change) => change.after === 0 && change.pc === 0x0018F8);
  const postWipeNaturalWrites = [...ownerD010Changes, ...keyD010Changes];
  const replayRestoresOracle = d010Matches(beforeReplayD010, zeroD010)
    && d010Matches(afterReplayD010, oracleD010)
    && d010Matches(afterPhase6D010, oracleD010)
    && d010Matches(afterUiClearD010, oracleD010);
  const cleanBrowser = (rawState.errors ?? []).length === 0
    && pageState.phase6?.termination === 'halt'
    && pageState.phase6?.vatSnapshotCaptured === true
    && pageState.owner?.termination === 'stopped_before_target'
    && pageState.owner?.afterD0301B === 0x5AA55A
    && pageState.lastKey?.code === KEY.code
    && pageState.lastKey?.termination === 'control_pre_stop'
    && pageState.lastKey?.uiClearApplied === true;
  const complete = cleanBrowser
    && sourceEvidence.hasD010Replay
    && !sourceEvidence.hasD0301BForce
    && p5D010Changes.length >= 6
    && replayRestoresOracle;
  const conclusion = postWipeNaturalWrites.length === 0
    ? 'The natural launch-home route writes the D010 mirror before the 0x001879 stable snapshot, then 0x0018F8 wipes it. After that wipe, Phase5b owner, Phase6 repaint, edit seed, and Escape/CLEAR do not write D010; the current browser preserves the real after-CLEAR D010 mirror through the stable replay packet.'
    : 'A post-wipe natural D010 writer was observed after the stable snapshot; see the owner/key D010 change records.';
  return {
    pass: complete,
    cleanBrowser,
    p5WritesOracleThenWipes,
    replayRestoresOracle,
    postWipeNaturalD010Writes: postWipeNaturalWrites.length,
    conclusion,
  };
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 891: Natural D010 Mirror Lifecycle Audit',
      '',
      'Probe failed before producing a complete audit.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const p5Changes = data.state.records?.['p5-launch-home']?.d010Changes ?? [];
  const ownerChanges = data.state.records?.['phase5b-natural-d0301b-owner']?.d010Changes ?? [];
  const keyChanges = data.state.records?.['key-route']?.d010Changes ?? [];
  return [
    '# Phase 891: Natural D010 Mirror Lifecycle Audit',
    '',
    'Probe: `probe-phase891-d010-natural-lifecycle-audit.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase891-d010-natural-lifecycle-audit.mjs`',
    '',
    'Serves a temporary observation-only copy of the real `browser-shell.html`, boots coldboot mode in headless Chrome, traces D010 mirror fields across Phase 5, the natural D0301B owner leg, stable replay, Phase 6, and Escape/CLEAR, then compares against `captures/realram-home-afterCLEAR-D00000-D657FF.bin`.',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}.`,
    `- Browser execution clean: ${data.analysis.cleanBrowser ? 'yes' : 'NO'}.`,
    `- Phase 5 writes oracle D010 then wipes it: ${data.analysis.p5WritesOracleThenWipes ? 'yes' : 'NO'}.`,
    `- Stable replay restores and preserves D010 through CLEAR: ${data.analysis.replayRestoresOracle ? 'yes' : 'NO'}.`,
    `- Post-wipe natural D010 writes observed: ${data.analysis.postWipeNaturalD010Writes}.`,
    `- Adjudication: ${data.analysis.conclusion}`,
    '',
    '## Source Evidence',
    '',
    `- Source SHA-256: \`${data.sourceEvidence.sha256}\``,
    `- Stable replay includes D010EF/D010FE/D010F4: ${data.sourceEvidence.hasD010Replay ? 'yes' : 'NO'}.`,
    `- Manual D0301B force is absent: ${!data.sourceEvidence.hasD0301BForce ? 'yes' : 'NO'}.`,
    `- Natural owner entry/stop markers present: ${data.sourceEvidence.hasNaturalOwnerEntry && data.sourceEvidence.hasOwnerStopBefore09DEE0 ? 'yes' : 'NO'}.`,
    `- D008E0 oracle event frame source present: ${data.sourceEvidence.hasD008E0OracleErrSp ? 'yes' : 'NO'}.`,
    '',
    'Stable replay field names:',
    '',
    '```json',
    JSON.stringify(data.sourceEvidence.replayNames, null, 2),
    '```',
    '',
    '## D010 Timeline',
    '',
    d010Table(data.timelineRows),
    '',
    '## Phase 5 D010 Changes',
    '',
    changeTable(p5Changes),
    '',
    '## Post-Wipe D010 Changes',
    '',
    'Natural D0301B owner leg:',
    '',
    changeTable(ownerChanges),
    '',
    'Escape/CLEAR key route:',
    '',
    changeTable(keyChanges),
    '',
    '## Target Counts',
    '',
    table([
      { phase: 'p5-launch-home', ...(data.state.records?.['p5-launch-home']?.targetCounts ?? {}) },
      { phase: 'phase5b-natural-d0301b-owner', ...(data.state.records?.['phase5b-natural-d0301b-owner']?.targetCounts ?? {}) },
      { phase: 'key-route', ...(data.state.records?.['key-route']?.targetCounts ?? {}) },
    ], [
      { label: 'Phase', value: (row) => row.phase },
      { label: '0x001879', value: (row) => String(row.stableSnapshot001879 ?? 0) },
      { label: '0x0018F8', value: (row) => String(row.stableWipe0018F8 ?? 0) },
      { label: '0x0454BE', value: (row) => String(row.naturalOwner0454BE ?? 0) },
      { label: '0x09DEE0', value: (row) => String(row.ownerStop09DEE0 ?? 0) },
      { label: '0x0A229D', value: (row) => String(row.anchor0A229D ?? 0) },
    ]),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      analysis: data.analysis,
      sourceEvidence: data.sourceEvidence,
      oracleFields: formatFields(data.oracleFields),
      pageState: data.pageState,
      state: data.state,
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

  const source = fs.readFileSync(BROWSER_SHELL_PATH, 'utf8');
  const sourceEvidence = analyzeSource(source);
  const oracleFields = readCaptureFields();
  const oracleD010 = d010Only(oracleFields);

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
  await waitFor(ws, '!!window.__phase891 && !!window.__coldbootReadEditLineState', 'phase891 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`, 30000);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(150);

  const afterBoot = await evalExpr(ws, `window.__phase891.capture('afterBootEval')`, 30000);
  await evalExpr(ws, `(() => {
    window.__phase891.snapshots.beforeKey = window.__phase891.capture('beforeKey');
    window.__phase891.beginPhase('key-route');
    window.__phase891.keyActive = true;
    return true;
  })()`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${KEY.code}'`, 'Escape/CLEAR completion', 90000);
  await sleep(150);
  await evalExpr(ws, `(() => {
    window.__phase891.keyActive = false;
    window.__phase891.endPhase('key-route');
    window.__phase891.snapshots.afterKey = window.__phase891.capture('afterKey');
    return true;
  })()`, 30000);

  const rawState = await evalExpr(ws, `(() => ({
    records: window.__phase891.records,
    snapshots: window.__phase891.snapshots,
    stableReplaySnapshot: window.__phase891.stableReplaySnapshot,
    replayD010Values: window.__phase891.replayD010Values,
    errors: window.__phase891.errors,
  }))()`, 30000);
  const pageState = await evalExpr(ws, `(() => ({
    phase6: window.__coldbootPhase6 ?? null,
    owner: window.__coldbootPhase6?.naturalD0301BOwner ?? window.__coldbootNaturalD0301BOwner ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    afterBoot: ${JSON.stringify(afterBoot)},
    status: document.getElementById('status')?.textContent ?? null,
    vram: countVRAMPixels?.() ?? null,
  }))()`, 30000);

  const analysis = buildAnalysis(rawState, oracleFields, sourceEvidence, pageState);
  const timelineRows = buildTimelineRows(rawState, oracleD010).map((row) => ({
    ...row,
    fields: formatFields(row.fields),
  }));
  const state = formatState(rawState);

  return {
    probe: 'phase891-d010-natural-lifecycle-audit',
    chromePath,
    pageUrl,
    pass: analysis.pass,
    analysis,
    sourceEvidence,
    oracleFields,
    timelineRows,
    pageState,
    state,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    cleanBrowser: summary.analysis.cleanBrowser,
    p5WritesOracleThenWipes: summary.analysis.p5WritesOracleThenWipes,
    replayRestoresOracle: summary.analysis.replayRestoresOracle,
    postWipeNaturalD010Writes: summary.analysis.postWipeNaturalD010Writes,
    conclusion: summary.analysis.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase891-d010-natural-lifecycle-audit', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  await sleep(500);
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

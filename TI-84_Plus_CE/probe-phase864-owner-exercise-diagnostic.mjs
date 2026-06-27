import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase864-owner-exercise-diagnostic.md');
const debugPort = 9864;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase864-clear-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const EXPECTED = Object.freeze({
  code: 'Escape',
  key: 'Escape',
  label: 'CLEAR',
  vk: 27,
  controlStopPc: 0x0A229D,
  ownerBoundary: 0x0A31FD,
  safeCount: 0x1C20,
  safeSource: 0xD0330E,
  safeDest: 0xD0362E,
});

let nextId = 1;
const pending = new Map();
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

function instrumentBrowserShell(sourceHtml) {
  let html = sourceHtml;
  const snapshotLine = '      coldbootVatSnapshot = COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field, readColdbootReplayField(field)]);';
  const replayLine = '    for (const [field, value] of coldbootVatSnapshot) writeColdbootReplayField(field, value);';
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(snapshotLine)) throw new Error('Phase858 snapshot capture marker not found');
  if (!html.includes(replayLine)) throw new Error('Phase858 replay marker not found');
  if (!html.includes(marker)) throw new Error('Phase858 persistence marker not found');

  html = html.replace(snapshotLine, `${snapshotLine}
      window.__phase864BootSnapshot = coldbootVatSnapshot.map(([field, value]) => ({ name: field[0], addr: field[1], len: field[2], value }));`);

  html = html.replace(replayLine, `${replayLine}
    window.__phase864ReplayApplied = true;
    window.__phase864PostReplayFields = Object.fromEntries(COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field[0], readColdbootReplayField(field)]));`);

  const injection = String.raw`
const PHASE858_TARGETS = Object.freeze({
  controlPreStop0A229D: 0x0A229D,
  owner0A31FD: 0x0A31FD,
  ownerFallthrough0A3205: 0x0A3205,
  copySetup0A31B8: 0x0A31B8,
  destructiveCopy0A31E2: 0x0A31E2,
  postCopy0A31A2: 0x0A31A2,
  spinLoop0A1854: 0x0A1854,
  cleanup0018F8: 0x0018F8,
  low006D64: 0x006D64,
});

const PHASE858_FIELD_SPECS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02504', 0xD02504, 1],
  ['D02505', 0xD02505, 1],
  ['D02506', 0xD02506, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
]);

function phase864ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase864Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase864ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE858_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase864ReadValue(mem, addr, len),
  ]));
}

function phase864ReadStackSlots(count = 6) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, index) => {
    const addr = ((sp & 0xFFFFFF) + index * 3) & 0xFFFFFF;
    return { addr, value: phase864ReadValue(mem, addr, 3) };
  });
}

function phase864CpuRaw() {
  return cpu ? {
    pc: cpu.pc ?? 0,
    currentBlockPc: cpu._currentBlockPc ?? 0,
    stepCount: cpu.stepCount ?? 0,
    sp: cpu.sp ?? 0,
    af: cpu.af ?? 0,
    bc: cpu.bc ?? 0,
    de: cpu.de ?? 0,
    hl: cpu.hl ?? 0,
    ix: cpu._ix ?? cpu.ix ?? 0,
    iy: cpu._iy ?? cpu.iy ?? 0,
    f: cpu.f ?? 0,
    halted: Boolean(cpu.halted),
  } : null;
}

function phase864CopyPlan(before, after) {
  if (!before || !after) return null;
  return {
    count: before.cpu.bc & 0xFFFFFF,
    sourceStart: (after.cpu.hl + 1) & 0xFFFFFF,
    sourceEnd: before.cpu.hl & 0xFFFFFF,
    destStart: (after.cpu.de + 1) & 0xFFFFFF,
    destEnd: before.cpu.de & 0xFFFFFF,
  };
}

function phase864Snapshot(record, pc) {
  return {
    block: record?.totalBlocks ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPc ?? null,
    cpu: phase864CpuRaw(),
    fields: phase864ReadFields(),
    stackTop: phase864ReadStackSlots(6),
    vram: countVRAMPixels?.() ?? null,
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
  };
}

function phase864CreateRecord(label) {
  return {
    label,
    start: null,
    end: null,
    totalBlocks: 0,
    prevPc: null,
    lastPcs: [],
    hotBlocks: {},
    topHotBlocks: [],
    targetCounts: Object.fromEntries(Object.keys(PHASE858_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    targetSamples: [],
    lddrSamples: [],
    originalLddr: null,
  };
}

function phase864CurrentRecord() {
  let record = window.__phase864State.records.at(-1);
  if (!record) {
    record = phase864CreateRecord('implicit');
    window.__phase864State.records.push(record);
  }
  return record;
}

function phase864Read(label = 'read') {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase864CpuRaw(),
    fields: phase864ReadFields(),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    bootSnapshot: window.__phase864BootSnapshot ?? null,
    replayApplied: window.__phase864ReplayApplied === true,
    postReplayFields: window.__phase864PostReplayFields ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase864PageErrors ?? [])],
  };
}

function phase864InstallLddrTrace(record) {
  if (!cpu?.lddr || record.originalLddr) return;
  record.originalLddr = cpu.lddr.bind(cpu);
  cpu.lddr = function phase864LddrWrapper() {
    const blockPc = cpu._currentBlockPc & 0xFFFFFF;
    const logicalPc = blockPc === 0x0A31B8
      ? 0x0A31C1
      : ((blockPc === 0x0A31E2 || blockPc === 0x0A31DE) ? 0x0A31F2 : blockPc);
    const shouldRecord = logicalPc === 0x0A31C1 || logicalPc === 0x0A31F2;
    const before = shouldRecord ? phase864Snapshot(record, blockPc) : null;
    const result = record.originalLddr();
    if (shouldRecord) {
      const after = phase864Snapshot(record, blockPc);
      record.lddrSamples.push({
        logicalPc,
        blockPc,
        block: record.totalBlocks,
        before,
        after,
        copyPlan: phase864CopyPlan(before, after),
        recentPcs: [...record.lastPcs].slice(-24),
      });
    }
    return result;
  };
}

function phase864RestoreLddr(record) {
  if (record?.originalLddr && cpu?.lddr) {
    cpu.lddr = record.originalLddr;
    record.originalLddr = null;
  }
}

window.__phase864PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase864PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase864PageErrors.push(String(event.reason || event));
});

window.__phase864State = {
  records: [],
  begin(label) {
    const record = phase864CreateRecord(label);
    this.records.push(record);
    record.start = phase864Read('start');
    phase864InstallLddrTrace(record);
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      phase864RestoreLddr(record);
      record.end = phase864Read('end');
      record.topHotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([pc, count]) => ({ pc, count }));
    }
    return record;
  },
  read: phase864Read,
};
window.__phase864 = window.__phase864State;

const phase864OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase864ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase864CurrentRecord();
  record.totalBlocks += 1;
  const pcHex = phase864Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  record.lastPcs.push({ block: record.totalBlocks, pc: pcHex, prevPc: record.prevPc });
  if (record.lastPcs.length > 80) record.lastPcs.shift();

  for (const [name, target] of Object.entries(PHASE858_TARGETS)) {
    if (addr !== target) continue;
    record.targetCounts[name] += 1;
    const sample = phase864Snapshot(record, addr);
    if (!record.targetFirst[name]) record.targetFirst[name] = sample;
    if (record.targetSamples.length < 80) record.targetSamples.push({ target: name, ...sample });
  }

  const result = phase864OriginalObserveColdbootPersistenceBlock(state, pc);
  record.prevPc = pcHex;
  return result;
};

// [phase864 diagnostic] HUMAN-AUTHORIZED owner exercise. Bypass the intentional
// Escape control pre-stop at 0x0A229D so the faithful CLEAR route flows through the
// real OS CLEAR code to the downstream destructive-copy owner 0x0A31FD, with the
// live D02505=0x0A carry from the Phase857 snapshot contract. This also skips the
// JS-level applyColdbootUiLevelClear() band-aid, so we observe pure OS behaviour.
// Override lives ONLY in this served copy; the disk browser-shell.html is untouched.
getColdbootControlPreStop = function phase864GetColdbootControlPreStop(code) {
  if (code === 'Escape') return null;
  return COLDBOOT_CONTROL_PRE_STOP_BY_PC_CODE[code] ?? null;
};

// Bounded headroom: enough to pass 0x0A229D (~74K steps), execute the owner copy,
// and reach a natural halt (~300-500K observed in the harness), but small enough
// that a possible 0x0A1854 spin is reaped well inside the 180s watchdog. (6M timed out.)
const phase864OriginalRunOptions = getColdbootRunOptions;
getColdbootRunOptions = function phase864GetColdbootRunOptions(stepBudget) {
  const opts = phase864OriginalRunOptions(stepBudget);
  opts.maxSteps = 450000;
  return opts;
};
`;

  return html.replace(marker, `${injection}\n\n${marker}`);
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
    windowsVirtualKeyCode: EXPECTED.vk,
    nativeVirtualKeyCode: EXPECTED.vk,
    code: EXPECTED.code,
    key: EXPECTED.key,
  };
}

function valueWidth(name) {
  if (/^D0250[456]$/.test(name)) return 2;
  if (/^D005/.test(name)) return 2;
  return 6;
}

function formatFieldMap(fields) {
  if (!fields) return '-';
  return Object.entries(fields).map(([name, value]) => `${name}=${hex(value, valueWidth(name))}`).join(', ');
}

function formatCopyPlan(plan) {
  if (!plan) return null;
  return {
    count: hex(plan.count, 4),
    sourceStart: hex(plan.sourceStart),
    sourceEnd: hex(plan.sourceEnd),
    destStart: hex(plan.destStart),
    destEnd: hex(plan.destEnd),
  };
}

function asciiSafe(value) {
  if (typeof value === 'string') return value.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
  if (Array.isArray(value)) return value.map(asciiSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asciiSafe(item)]));
  }
  return value;
}

function formatSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    pc: hex(snapshot.pc),
    prevPc: snapshot.prevPc ?? null,
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
    } : null,
    fields: snapshot.fields
      ? Object.fromEntries(Object.entries(snapshot.fields).map(([name, value]) => [name, hex(value, valueWidth(name))]))
      : null,
    stackTop: (snapshot.stackTop ?? []).map((slot) => ({
      addr: hex(slot.addr),
      value: hex(slot.value),
    })),
  };
}

function classify(state) {
  const record = state.traceRecord ?? {};
  const key = state.keyState ?? {};
  const counts = record.targetCounts ?? {};
  const ownerHit = record.targetFirst?.owner0A31FD ?? null;
  const controlHit = counts.controlPreStop0A229D > 0;
  const ownerReached = counts.owner0A31FD > 0;
  const copy0A31F2 = (record.lddrSamples ?? []).find((sample) => sample.logicalPc === 0x0A31F2);
  const copyPlan = copy0A31F2?.copyPlan ?? null;
  const ownerD02505 = ownerHit?.fields?.D02505 ?? null;
  const safeGeometry = ownerD02505 === 0x0A
    && copyPlan?.count === EXPECTED.safeCount
    && copyPlan?.sourceStart === EXPECTED.safeSource
    && copyPlan?.destStart === EXPECTED.safeDest;
  const bootSnapshotD02505 = (state.afterBoot?.bootSnapshot ?? []).find((field) => field.name === 'D02505')?.value ?? null;
  const postReplayD02505 = state.afterBoot?.postReplayFields?.D02505 ?? null;
  const currentD02505 = state.afterBoot?.fields?.D02505 ?? null;

  // The OUTCOME oracle: did the edit/VAT fields survive the live CLEAR route, and
  // do they end at the values a real TI-84 keeps after CLEAR? preKey = state right
  // after boot/replay (before Escape); postKey = state at end of the Escape route.
  const EDIT_VAT_FIELDS = ['D0243A', 'D0243D', 'D02590', 'D0259D'];
  const ORACLE_AFTER_CLEAR = { D0243A: 0xD1A8CC, D0243D: 0xD2A83E, D02590: 0xD3FE81, D0259D: 0xD3FECD };
  const preKey = state.afterBoot?.fields ?? {};
  const postKey = state.traceRecord?.end?.fields ?? {};
  const editVatBefore = Object.fromEntries(EDIT_VAT_FIELDS.map((f) => [f, preKey[f] ?? null]));
  const editVatAfter = Object.fromEntries(EDIT_VAT_FIELDS.map((f) => [f, postKey[f] ?? null]));
  const fieldsZeroedByRoute = EDIT_VAT_FIELDS.filter((f) => (preKey[f] ?? 0) !== 0 && (postKey[f] ?? 0) === 0);
  const fieldsPreserved = EDIT_VAT_FIELDS.every((f) => (postKey[f] ?? 0) !== 0 && postKey[f] === preKey[f]);
  const oracleMatch = EDIT_VAT_FIELDS.every((f) => postKey[f] === ORACLE_AFTER_CLEAR[f]);

  let route = 'OTHER';
  if (ownerReached) route = safeGeometry ? 'OWNER_SAFE_GEOMETRY' : 'OWNER_UNSAFE_OR_INCOMPLETE';
  else if (controlHit && key.termination === 'control_pre_stop' && key.controlStopPc === EXPECTED.controlStopPc) {
    route = 'CONTROL_PRE_STOP_0A229D_BEFORE_OWNER';
  }
  return {
    route,
    controlHit,
    ownerReached,
    ownerD02505,
    copyPlan: formatCopyPlan(copyPlan),
    safeGeometry,
    editVatBefore: Object.fromEntries(Object.entries(editVatBefore).map(([k, v]) => [k, v == null ? null : hex(v)])),
    editVatAfter: Object.fromEntries(Object.entries(editVatAfter).map(([k, v]) => [k, v == null ? null : hex(v)])),
    oracleAfterClear: Object.fromEntries(Object.entries(ORACLE_AFTER_CLEAR).map(([k, v]) => [k, hex(v)])),
    fieldsZeroedByRoute,
    fieldsPreserved,
    oracleMatch,
    bootSnapshotD02505,
    postReplayD02505,
    currentD02505,
    d02505CarryPresent: bootSnapshotD02505 === 0x0A && postReplayD02505 === 0x0A && currentD02505 === 0x0A,
  };
}

function buildReport(data) {
  const classification = data?.classification ?? {};
  const state = data?.state ?? {};
  const key = state.keyState ?? {};
  const trace = state.traceRecord ?? {};
  const targetRows = Object.entries(trace.targetCounts ?? {}).map(([name, count]) => `| ${name} | ${count} |`);
  const sampleRows = (trace.targetSamples ?? []).map((sample) => (
    `| ${sample.target} | ${sample.block} | ${hex(sample.pc)} | ${sample.prevPc ?? '-'} | ${formatFieldMap(sample.fields)} |`
  ));
  const lddrRows = (trace.lddrSamples ?? []).map((sample) => {
    const plan = formatCopyPlan(sample.copyPlan);
    return `| ${hex(sample.logicalPc)} | ${hex(sample.blockPc)} | ${sample.block} | ${plan?.count ?? '-'} | ${plan?.sourceStart ?? '-'} | ${plan?.destStart ?? '-'} |`;
  });
  const hotRows = (trace.topHotBlocks ?? []).slice(0, 15).map((row) => `| ${row.pc} | ${row.count} |`);
  const bootD02505 = classification.bootSnapshotD02505 == null ? '-' : hex(classification.bootSnapshotD02505, 2);
  const replayD02505 = classification.postReplayD02505 == null ? '-' : hex(classification.postReplayD02505, 2);
  const currentD02505 = classification.currentD02505 == null ? '-' : hex(classification.currentD02505, 2);
  const resultLine = data?.error
    ? `- Probe failed: ${data.error.split('\n')[0]}`
    : `- Verdict: ${data.verdict}. Route: ${classification.route}.`;
  const interpretation = data?.error
    ? '- No route interpretation was possible.'
    : data.verdict === 'FIX_HOLDS_OWNER_SAFE_AND_ORACLE_MATCH'
      ? '- With the Escape pre-stop bypassed, the live CLEAR route reached the real `0x0A31FD` owner with `D02505=0x0A`, ran the safe `0x0A31F2` geometry, and the edit/VAT fields end at the real-hardware after-CLEAR oracle values. The D02505 root-cause fix holds end-to-end; the `0x0A229D` pre-stop band-aid is no longer load-bearing.'
      : data.verdict === 'FIX_HOLDS_OWNER_SAFE_FIELDS_PRESERVED'
        ? '- With the pre-stop bypassed, the owner ran with safe geometry and the edit/VAT fields were preserved (not zeroed), though they did not exactly match the captured oracle values. The destructive copy is fixed; reconcile against the capture before removing the band-aid.'
        : data.verdict === 'OWNER_SAFE_GEOMETRY_BUT_FIELDS_NOT_RETAINED'
          ? '- The owner ran with safe geometry, but the edit/VAT fields were not retained at end of route (a later cxMain wipe likely clears+rebuilds). The destructive copy itself is fixed, but a downstream owner still needs accounting before the band-aid can be removed.'
          : data.verdict === 'OWNER_REACHED_BUT_UNSAFE_GEOMETRY'
            ? '- The owner was reached but with UNSAFE geometry (D02505 was not 0x0A at the owner, or count/source/dest mismatched). The carry did not transfer into the live route; inspect the LDDR samples.'
            : '- The owner was not exercised (route stopped short or other); the bypass may not have taken effect. Inspect the JSON.';

  return [
    '# Phase 864: Owner-Exercise Diagnostic (human-authorized Escape pre-stop bypass)',
    '',
    'Probe: `probe-phase864-owner-exercise-diagnostic.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase864-owner-exercise-diagnostic.mjs`',
    '',
    'Human-authorized verification. Serves a temporary instrumented copy of the real patched `browser-shell.html` and, in the served copy ONLY, bypasses the intentional Escape control pre-stop at `0x0A229D` so the faithful CLEAR route flows through the real OS CLEAR code to the downstream destructive-copy owner `0x0A31FD` with the live `D02505=0x0A` carry. Measures whether the owner runs the safe `0x0A31F2` geometry and whether the edit/VAT fields (`D0243A/D0243D/D02590/D0259D`) survive to the real-hardware after-CLEAR oracle. The disk shell is not edited.',
    '',
    '## Summary',
    '',
    resultLine,
    data?.error ? '' : `- Boot/replay ` + '`D02505`' + ` values: snapshot=${bootD02505}, postReplay=${replayD02505}, afterBoot=${currentD02505}; carryPresent=${classification.d02505CarryPresent}.`,
    data?.error ? '' : `- Key termination=${key.termination ?? '-'}, steps=${key.steps ?? '-'}, controlStopPc=${hex(key.controlStopPc)}, wipes=${key.wipes ?? '-'}, uiClearApplied=${key.uiClearApplied}.`,
    data?.error ? '' : `- Owner reached=${classification.ownerReached}, ownerD02505=${classification.ownerD02505 == null ? '-' : hex(classification.ownerD02505, 2)}, safeGeometry=${classification.safeGeometry}, copyPlan=${JSON.stringify(classification.copyPlan)}.`,
    data?.error ? '' : `- Edit/VAT before: ${JSON.stringify(classification.editVatBefore)}.`,
    data?.error ? '' : `- Edit/VAT after:  ${JSON.stringify(classification.editVatAfter)}.`,
    data?.error ? '' : `- Oracle (real HW after CLEAR): ${JSON.stringify(classification.oracleAfterClear)}; fieldsPreserved=${classification.fieldsPreserved}, oracleMatch=${classification.oracleMatch}, zeroedByRoute=${JSON.stringify(classification.fieldsZeroedByRoute)}.`,
    data?.error ? '' : `- Page errors: ${JSON.stringify(state.pageErrors ?? [])}.`,
    interpretation,
    '',
    '## Target Hits',
    '',
    '| Target | Hits |',
    '| --- | ---: |',
    ...(targetRows.length ? targetRows : ['| - | - |']),
    '',
    '## Target Samples',
    '',
    '| Target | Block | PC | Previous PC | Fields |',
    '| --- | ---: | --- | --- | --- |',
    ...(sampleRows.length ? sampleRows : ['| - | - | - | - | - |']),
    '',
    '## LDDR Samples',
    '',
    '| Logical PC | Block PC | Block | Count | Source start | Dest start |',
    '| --- | --- | ---: | --- | --- | --- |',
    ...(lddrRows.length ? lddrRows : ['| - | - | - | - | - | - |']),
    '',
    '## Top PCs',
    '',
    '| PC | Count |',
    '| --- | ---: |',
    ...(hotRows.length ? hotRows : ['| - | - |']),
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function run() {
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
  await waitFor(ws, '!!window.__phase864 && !!window.__coldbootReadEditLineState', 'phase864 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__phase864.read('afterBoot')`, 30000);
  await evalExpr(ws, `window.__phase864.begin('Escape/CLEAR after D02505 patch')`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${EXPECTED.code}'`, 'Escape completion', 90000);
  await sleep(150);

  const traceRecord = await evalExpr(ws, `window.__phase864.finish()`, 30000);
  const state = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    keyState: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    persistence: window.getColdbootPersistenceDiagnostics?.() ?? null,
    pageErrors: window.__phase864PageErrors ?? [],
  }))()`, 30000);
  const classifiedState = { ...state, afterBoot, traceRecord };
  const classification = classify(classifiedState);
  const safeState = asciiSafe(classifiedState);
  // "pass" (exit 0) = the experiment ran cleanly and actually exercised the owner
  // (no page errors, D02505 carry present, route was NOT stopped short). The VERDICT
  // below is the separate scientific result: does the D02505 fix hold at the owner?
  const ownerExercised = classification.ownerReached
    && classification.route !== 'CONTROL_PRE_STOP_0A229D_BEFORE_OWNER';
  const pass = state.pageErrors.length === 0
    && classification.d02505CarryPresent
    && ownerExercised;
  const verdict = !ownerExercised
    ? 'INCONCLUSIVE_OWNER_NOT_EXERCISED'
    : classification.safeGeometry && classification.oracleMatch
      ? 'FIX_HOLDS_OWNER_SAFE_AND_ORACLE_MATCH'
      : classification.safeGeometry && classification.fieldsPreserved
        ? 'FIX_HOLDS_OWNER_SAFE_FIELDS_PRESERVED'
        : classification.safeGeometry
          ? 'OWNER_SAFE_GEOMETRY_BUT_FIELDS_NOT_RETAINED'
          : 'OWNER_REACHED_BUT_UNSAFE_GEOMETRY';

  return asciiSafe({
    probe: 'phase864-owner-exercise-diagnostic',
    chromePath,
    pageUrl,
    pass,
    verdict,
    classification,
    state: {
      ...safeState,
      afterBoot: {
        ...safeState.afterBoot,
        fields: safeState.afterBoot.fields
          ? Object.fromEntries(Object.entries(safeState.afterBoot.fields).map(([name, value]) => [name, hex(value, valueWidth(name))]))
          : null,
      },
      traceRecord: {
        ...traceRecord,
        start: formatSnapshot(traceRecord.start),
        end: formatSnapshot(traceRecord.end),
        targetFirst: Object.fromEntries(Object.entries(traceRecord.targetFirst ?? {}).map(([name, value]) => [name, formatSnapshot(value)])),
        targetSamples: (traceRecord.targetSamples ?? []).map(formatSnapshot),
        lddrSamples: (traceRecord.lddrSamples ?? []).map((sample) => ({
          ...sample,
          logicalPc: hex(sample.logicalPc),
          blockPc: hex(sample.blockPc),
          before: formatSnapshot(sample.before),
          after: formatSnapshot(sample.after),
          copyPlan: formatCopyPlan(sample.copyPlan),
        })),
      },
    },
  });
}

try {
  summary = await run();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    verdict: summary.verdict,
    classification: summary.classification,
    key: summary.state?.keyState,
    targetCounts: summary.state?.traceRecord?.targetCounts,
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase864-owner-exercise-diagnostic', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

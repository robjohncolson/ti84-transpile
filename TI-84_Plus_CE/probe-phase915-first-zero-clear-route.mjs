import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase915-first-zero-clear-route.md');
const CLEAR_CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const RAM_BASE = 0xD00000;
const DEBUG_PORT = 9915;
const EDIT_BUFFER_BASE = 0xD1A8CC;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase915-first-zero-'));
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
  ['D000CA_IY4A', 0xD000CA, 1],
  ['D00587', 0xD00587, 1],
  ['D00588', 0xD00588, 1],
  ['D00589', 0xD00589, 1],
  ['D0058B', 0xD0058B, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['EDIT_TOKEN_D1A8CC', EDIT_BUFFER_BASE, 1],
]);

const TARGETS = Object.freeze({
  getCsc03FA09: 0x03FA09,
  keyDebounceCounter03F9AE: 0x03F9AE,
  keyDebounceFallthrough03F9B0: 0x03F9B0,
  keyDebouncePost03F9B8: 0x03F9B8,
  keyDebounceRefresh03F9D1: 0x03F9D1,
  keyDebounceClear03F9D5: 0x03F9D5,
  keyDebounceReturn03D058: 0x03D058,
  clearFallthrough058A16: 0x058A16,
  clearEntry0A223A: 0x0A223A,
  clearAnchor0A229D: 0x0A229D,
  preWipe001879: 0x001879,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});

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

const IDLE_BUDGETS = Object.freeze([
  3520,
  3536,
  3552,
  3568,
  3584,
]);

const CORE_ORACLE_FIELDS = Object.freeze([
  'D007CA',
  'D008E0',
  'D010EF',
  'D010FE',
  'D010F4',
  'D02317',
  'D0231A',
  'D0231D',
  'D02437',
  'D0243A',
  'D0243D',
  'D02440',
  'D02505',
  'D02590',
  'D0259D',
  'D02A29',
  'D0301B',
  'EDIT_TOKEN_D1A8CC',
]);

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
  return value == null ? '-' : hex(value, valueWidth(name));
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
  if (!sourceHtml.includes(marker)) throw new Error('Phase914 marker not found: finalizeColdbootPersistenceState');

  const instrumentation = String.raw`
const PHASE914_SEQUENCE_LIMIT = 18000;
const PHASE914_FIELDS = Object.freeze([
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
  ['D000CA_IY4A', 0xD000CA, 1],
  ['D00587', 0xD00587, 1],
  ['D00588', 0xD00588, 1],
  ['D00589', 0xD00589, 1],
  ['D0058B', 0xD0058B, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['EDIT_TOKEN_D1A8CC', 0xD1A8CC, 1],
]);
const PHASE914_TARGETS = Object.freeze({
  getCsc03FA09: 0x03FA09,
  keyDebounceCounter03F9AE: 0x03F9AE,
  keyDebounceFallthrough03F9B0: 0x03F9B0,
  keyDebouncePost03F9B8: 0x03F9B8,
  keyDebounceRefresh03F9D1: 0x03F9D1,
  keyDebounceClear03F9D5: 0x03F9D5,
  keyDebounceReturn03D058: 0x03D058,
  clearFallthrough058A16: 0x058A16,
  clearEntry0A223A: 0x0A223A,
  clearAnchor0A229D: 0x0A229D,
  preWipe001879: 0x001879,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});
const PHASE914_FOCUS_FIELD_NAMES = Object.freeze([
  'D00587',
  'D00588',
  'D00589',
  'D0058B',
  'D0058C',
  'D0058E',
  'D00595',
  'D00596',
  'D0243A',
  'D0243D',
  'EDIT_TOKEN_D1A8CC',
]);
const PHASE914_SAMPLE_TARGETS = new Set([
  PHASE914_TARGETS.keyDebounceCounter03F9AE,
  PHASE914_TARGETS.keyDebounceFallthrough03F9B0,
  PHASE914_TARGETS.keyDebouncePost03F9B8,
  PHASE914_TARGETS.keyDebounceRefresh03F9D1,
  PHASE914_TARGETS.keyDebounceClear03F9D5,
  PHASE914_TARGETS.keyDebounceReturn03D058,
]);
const PHASE914_TARGET_SAMPLE_LIMIT = 96;
const PHASE914_IDLE_STOP = '__PHASE914_IDLE_STOP__';

function phase914ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase914ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE914_FIELDS.map(([name, addr, len]) => [
    name,
    phase914ReadValue(mem, addr, len),
  ]));
}

function phase914CpuRaw() {
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

function phase914Capture(label, pc = null, prevPc = null, block = null, seqIndex = null) {
  return {
    label,
    block,
    seqIndex,
    pc,
    prevPc,
    status: document.getElementById('status')?.textContent ?? null,
    cpu: phase914CpuRaw(),
    fields: phase914ReadFields(),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__Phase914PageErrors ?? [])],
  };
}

function phase914FocusFields(fields = phase914ReadFields()) {
  if (!fields) return null;
  return Object.fromEntries(PHASE914_FOCUS_FIELD_NAMES.map((name) => [name, fields[name]]));
}

function phase914CreateRecord(label, forcePlan) {
  return {
    label,
    active: true,
    blockCount: 0,
    prevPc: null,
    sequence: [],
    sequenceLimitReached: false,
    targetCounts: Object.fromEntries(Object.keys(PHASE914_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    targetSamples: [],
    fieldChanges: [],
    forcePlan,
    anchorSeen: false,
    anchorCount: 0,
    forceEvents: [],
    lastFields: phase914ReadFields(),
    start: phase914Capture('start'),
    end: null,
  };
}

function phase914CurrentRecord() {
  const record = window.__Phase914?.records?.at(-1) ?? null;
  return record?.active ? record : null;
}

function phase914MaybeForce(record, addr, seqIndex) {
  const plan = record.forcePlan;
  if (!plan?.enabled || record.forceEvents.length > 0) return null;
  if (plan.afterAnchor !== false && !record.anchorSeen) return null;
  if (addr !== PHASE914_TARGETS.keyDebounceCounter03F9AE) return null;
  const fieldsBefore = phase914ReadFields();
  if (plan.matchValue != null && fieldsBefore.D0058B !== plan.matchValue) return null;
  const before = phase914Capture('forceBefore', addr, record.prevPc, record.blockCount, seqIndex);
  cpu.memory[0xD0058B] = plan.value & 0xFF;
  const after = phase914Capture('forceAfter', addr, record.prevPc, record.blockCount, seqIndex);
  const event = {
    pc: addr,
    prevPc: record.prevPc,
    block: record.blockCount,
    seqIndex,
    anchorCount: record.anchorCount,
    requestedValue: plan.value & 0xFF,
    matchValue: plan.matchValue,
    before,
    after,
  };
  record.forceEvents.push(event);
  return event;
}

window.__Phase914PageErrors = [];
window.addEventListener('error', (event) => {
  window.__Phase914PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__Phase914PageErrors.push(String(event.reason || event));
});

const PHASE914_CPU_SNAPSHOT_FIELDS = Object.freeze([
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
]);

function phase914JsonClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function phase914SnapshotRuntime(label) {
  if (!cpu?.memory) throw new Error('Phase914 snapshot requested before CPU memory is available');
  window.__Phase914.snapshots[label] = {
    memory: cpu.memory.slice(),
    cpu: Object.fromEntries(PHASE914_CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]])),
    lastPc,
    lastMode,
    totalSteps,
    secondActive,
    alphaActive,
    vramSnapshot: vramSnapshot ? vramSnapshot.slice() : null,
    vramSnapshotPeak,
    lastKey: phase914JsonClone(window.__coldbootLastKey ?? null),
  };
  return phase914Capture(label + ':snapshot');
}

function phase914RestoreRuntime(label) {
  const snapshot = window.__Phase914.snapshots[label];
  if (!snapshot || !cpu?.memory) throw new Error('Phase914 snapshot not available: ' + label);
  cpu.memory.set(snapshot.memory);
  for (const field of PHASE914_CPU_SNAPSHOT_FIELDS) cpu[field] = snapshot.cpu[field];
  lastPc = snapshot.lastPc;
  lastMode = snapshot.lastMode;
  totalSteps = snapshot.totalSteps;
  secondActive = snapshot.secondActive;
  alphaActive = snapshot.alphaActive;
  vramSnapshot = snapshot.vramSnapshot ? snapshot.vramSnapshot.slice() : null;
  vramSnapshotPeak = snapshot.vramSnapshotPeak;
  window.__coldbootLastKey = phase914JsonClone(snapshot.lastKey);
  peripherals?.clearKeyPressed?.(cpu?.memory);
  updateModifierFlags();
  updateModifierDisplay();
  updateRegs();
  syncLCDState();
  if (lcd) lcd.renderFrame();
  updateKeyStateDisplay();
  updateKeyboardOverlay();
  return phase914Capture(label + ':restored');
}

window.__Phase914 = {
  records: [],
  snapshots: {},
  read: phase914Capture,
  snapshot: phase914SnapshotRuntime,
  restore: phase914RestoreRuntime,
  patchMemory(label, patch) {
    if (!cpu?.memory) throw new Error('Phase915 patch requested before CPU memory is available');
    const mem = cpu.memory;
    const before = phase914Capture(label + ':beforePatch');
    const writes = [];
    const put8 = (addr, value, name) => {
      const oldValue = mem[addr & 0xFFFFFF] ?? 0;
      mem[addr & 0xFFFFFF] = value & 0xFF;
      writes.push({ name, addr: addr & 0xFFFFFF, before: oldValue, after: mem[addr & 0xFFFFFF] });
    };
    switch (patch) {
      case 'none':
        break;
      case 'clear-d00588':
        put8(0xD00588, 0x00, 'D00588');
        break;
      case 'd0058b-cb':
        put8(0xD0058B, 0xCB, 'D0058B');
        break;
      case 'd0058b-cb-clear-d00588':
        put8(0xD0058B, 0xCB, 'D0058B');
        put8(0xD00588, 0x00, 'D00588');
        break;
      default:
        throw new Error('Unknown Phase915 patch: ' + patch);
    }
    updateRegs();
    updateKeyStateDisplay();
    updateKeyboardOverlay();
    const after = phase914Capture(label + ':afterPatch');
    return { label, patch, writes, before, after };
  },
  begin(label, forcePlan = null) {
    const record = phase914CreateRecord(label, forcePlan);
    this.records.push(record);
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (!record) return null;
    record.active = false;
    record.end = phase914Capture('end');
    return record;
  },
  runIdleFrame(label, budget, stopPlan = null) {
    this.begin(label);
    const persistenceState = createColdbootPersistenceState();
    prepareColdbootEventFrame();
    const opts = getColdbootRunOptions(budget);
    let stopEvent = null;
    let lastObservedPc = lastPc;
    let lastObservedMode = lastMode;
    let lastObservedSteps = 0;
    opts.onBlock = (pc, mode, meta, steps) => {
      observeColdbootPersistenceBlock(persistenceState, pc);
      const addr = pc & 0xFFFFFF;
      lastObservedPc = addr;
      lastObservedMode = mode;
      lastObservedSteps = steps;
      const fields = phase914ReadFields();
      const shouldStopAtFirstZero = stopPlan?.kind === 'first-zero-counter'
        && addr === PHASE914_TARGETS.keyDebounceFallthrough03F9B0
        && fields?.D0058B === 0;
      const shouldStopAtPreWipe = stopPlan?.kind === 'pre-wipe-001879'
        && addr === PHASE914_TARGETS.preWipe001879;
      if (!shouldStopAtFirstZero && !shouldStopAtPreWipe) return;
      const record = phase914CurrentRecord();
      stopEvent = {
        kind: stopPlan.kind,
        block: record?.blockCount ?? null,
        seqIndex: (record?.sequence?.length ?? 1) - 1,
        pc: addr,
        mode,
        steps,
        fields,
        cpu: phase914CpuRaw(),
        targetCounts: record?.targetCounts ?? {},
        recentFieldChanges: (record?.fieldChanges ?? []).slice(-16),
        recentSequence: (record?.sequence ?? []).slice(-48),
      };
      throw new Error(PHASE914_IDLE_STOP);
    };
    let result;
    try {
      result = executor.runFrom(lastPc, lastMode, opts);
    } catch (error) {
      if (String(error?.message || error) !== PHASE914_IDLE_STOP) throw error;
      result = {
        steps: lastObservedSteps,
        termination: stopEvent ? 'phase914_stop_' + stopEvent.kind : 'phase914_stop',
        lastPc: lastObservedPc,
        lastMode: lastObservedMode,
      };
    }
    totalSteps += result.steps;
    lastPc = result.lastPc;
    lastMode = result.lastMode;
    updateRegs();
    syncLCDState();
    if (lcd) lcd.renderFrame();
    updateKeyStateDisplay();
    updateKeyboardOverlay();
    finalizeColdbootPersistenceState(persistenceState);
    setStatus('Phase914 idle frame: ' + result.steps + ' steps, ' + result.termination + ' | Total: ' + totalSteps + ' | PC=0x' + hex(lastPc, 6));
    const record = this.finish();
    const afterFrame = phase914Capture(label + ':afterIdleFrame');
    return {
      label,
      budget,
      result: {
        steps: result?.steps ?? null,
        termination: result?.termination ?? null,
        lastPc: result?.lastPc ?? null,
        lastMode: result?.lastMode ?? null,
      },
      record,
      persistenceState,
      afterFrame,
      stopEvent,
    };
  },
  runContinuation(label, budget) {
    this.begin(label);
    const persistenceState = createColdbootPersistenceState();
    const opts = getColdbootRunOptions(budget);
    let lastObservedPc = lastPc;
    let lastObservedMode = lastMode;
    opts.onBlock = (pc, mode) => {
      observeColdbootPersistenceBlock(persistenceState, pc);
      lastObservedPc = pc & 0xFFFFFF;
      lastObservedMode = mode;
    };
    const result = executor.runFrom(lastPc, lastMode, opts);
    totalSteps += result.steps;
    lastPc = result.lastPc ?? lastObservedPc;
    lastMode = result.lastMode ?? lastObservedMode;
    updateRegs();
    syncLCDState();
    if (lcd) lcd.renderFrame();
    updateKeyStateDisplay();
    updateKeyboardOverlay();
    finalizeColdbootPersistenceState(persistenceState);
    setStatus('Phase915 continuation: ' + result.steps + ' steps, ' + result.termination + ' | Total: ' + totalSteps + ' | PC=0x' + hex(lastPc, 6));
    const record = this.finish();
    const afterFrame = phase914Capture(label + ':afterContinuation');
    return {
      label,
      budget,
      result: {
        steps: result?.steps ?? null,
        termination: result?.termination ?? null,
        lastPc: result?.lastPc ?? null,
        lastMode: result?.lastMode ?? null,
      },
      record,
      persistenceState,
      afterFrame,
    };
  },
};

const Phase914OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function Phase914ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase914CurrentRecord();
  if (record) {
    const seqIndex = record.sequence.length;
    record.blockCount += 1;
    if (record.sequence.length < PHASE914_SEQUENCE_LIMIT) record.sequence.push(addr);
    else record.sequenceLimitReached = true;
    if (addr === PHASE914_TARGETS.getCsc03FA09) {
      record.anchorSeen = true;
      record.anchorCount += 1;
    }
    phase914MaybeForce(record, addr, seqIndex);

    const fields = phase914ReadFields();
    if (fields && record.lastFields) {
      for (const [name] of PHASE914_FIELDS) {
        if (fields[name] === record.lastFields[name]) continue;
        if (record.fieldChanges.length < 160) {
          record.fieldChanges.push({
            block: record.blockCount,
            seqIndex,
            name,
            before: record.lastFields[name],
            after: fields[name],
            pc: addr,
            ownerPc: record.prevPc,
          });
        }
      }
    }
    record.lastFields = fields;

    for (const [name, target] of Object.entries(PHASE914_TARGETS)) {
      if (addr !== target) continue;
      record.targetCounts[name] += 1;
      if (!record.targetFirst[name]) {
        record.targetFirst[name] = phase914Capture(name, addr, record.prevPc, record.blockCount, seqIndex);
      }
      if (PHASE914_SAMPLE_TARGETS.has(addr) && record.targetSamples.length < PHASE914_TARGET_SAMPLE_LIMIT) {
        record.targetSamples.push({
          name,
          block: record.blockCount,
          seqIndex,
          pc: addr,
          prevPc: record.prevPc,
          anchorCount: record.anchorCount,
          fields: phase914FocusFields(fields),
          cpu: phase914CpuRaw(),
        });
      }
    }
  }
  const result = Phase914OriginalObserveColdbootPersistenceBlock(state, pc);
  if (record) record.prevPc = addr;
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
  await cdp(ws, 'Page.navigate', { url: `${pageUrl}?phase914=${encodeURIComponent(label)}-${Date.now()}` }, 30000);
  await waitFor(ws, 'document.readyState === "complete"', `${label} page load`, 30000);
  await waitFor(ws, '!!window.__Phase914 && !!window.__coldbootReadEditLineState', `${label} Phase914 instrumentation`, 30000);
  await sleep(500);
  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, `${label} coldboot completion`, 180000);
  await sleep(150);
  return evalExpr(ws, `window.__Phase914.read('${label}:afterBoot')`, 30000);
}

async function pressKey(keySpec, label) {
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${keySpec.code}'`, `${label} completion`, 90000);
  await sleep(150);
  return evalExpr(ws, `window.__Phase914.read('${label}:afterKey')`, 30000);
}

async function runIdleFrame(label, budget, stopPlan = null) {
  return evalExpr(ws, `window.__Phase914.runIdleFrame(${JSON.stringify(label)}, ${budget}, ${JSON.stringify(stopPlan)})`, 120000);
}

async function runContinuation(label, budget) {
  return evalExpr(ws, `window.__Phase914.runContinuation(${JSON.stringify(label)}, ${budget})`, 120000);
}

async function runScenario(pageUrl, spec) {
  const afterBoot = await loadAndBoot(pageUrl, spec.label);
  const afterDigit = spec.digitFirst ? await pressKey(DIGIT3_KEY, `${spec.label} Digit3`) : null;
  const afterDigitSettled = afterDigit
    ? await evalExpr(ws, `window.__Phase914.read('${spec.label}:afterDigitSettled')`, 30000)
    : null;
  if (spec.wallClockDelayMs) await sleep(spec.wallClockDelayMs);
  const afterWallClockDelay = afterDigit && spec.wallClockDelayMs
    ? await evalExpr(ws, `window.__Phase914.read('${spec.label}:afterWallClockDelay')`, 30000)
    : null;
  const idleFrames = [];
  for (const frame of spec.idleFrames ?? []) {
    idleFrames.push(await runIdleFrame(`${spec.label} ${frame.label}`, frame.budget));
  }
  await evalExpr(ws, `window.__Phase914.begin('${spec.label} Escape/CLEAR')`, 30000);
  const afterClear = await pressKey(CLEAR_KEY, `${spec.label} Escape/CLEAR`);
  const record = await evalExpr(ws, `window.__Phase914.finish()`, 30000);
  return {
    label: spec.label,
    afterBoot,
    afterDigit,
    afterDigitSettled,
    afterWallClockDelay,
    idleFrames,
    afterClear,
    record,
  };
}

async function snapshotRuntime(label) {
  return evalExpr(ws, `window.__Phase914.snapshot(${JSON.stringify(label)})`, 30000);
}

async function restoreRuntime(label) {
  return evalExpr(ws, `window.__Phase914.restore(${JSON.stringify(label)})`, 30000);
}

async function patchFirstZeroMemory(label, patch) {
  return evalExpr(ws, `window.__Phase914.patchMemory(${JSON.stringify(label)}, ${JSON.stringify(patch)})`, 30000);
}

async function runClearFromCurrentState(label, afterDigit = null, idleFrames = []) {
  await evalExpr(ws, `window.__Phase914.begin(${JSON.stringify(`${label} Escape/CLEAR`)})`, 30000);
  const afterClear = await pressKey(CLEAR_KEY, `${label} Escape/CLEAR`);
  const record = await evalExpr(ws, 'window.__Phase914.finish()', 30000);
  return {
    label,
    afterBoot: null,
    afterDigit,
    afterDigitSettled: null,
    afterWallClockDelay: null,
    idleFrames,
    afterClear,
    record,
  };
}

async function runClearFromFirstZero(label, patch, afterDigit, firstZeroFrame) {
  const preClearPatch = await patchFirstZeroMemory(label, patch);
  const scenario = await runClearFromCurrentState(label, afterDigit, [firstZeroFrame]);
  scenario.preClearPatch = preClearPatch;
  return scenario;
}

function isSafeIdleDrain(frame) {
  const fields = frame?.afterFrame?.fields ?? {};
  const counts = frame?.record?.targetCounts ?? {};
  return fields.D0058B === 0
    && fields.D00587 === 0
    && fields.D00588 === 0
    && fields.D00589 === 0
    && fields.D007CA === 0x0585E9
    && fields.D0243A === 0xD1A8CD
    && fields.EDIT_TOKEN_D1A8CC === 0x33
    && (counts.preWipe001879 ?? 0) === 0
    && (counts.cleanup0018F8 ?? 0) === 0;
}

async function runBudgetScan(pageUrl) {
  const label = 'budget-scan';
  const afterBoot = await loadAndBoot(pageUrl, label);
  const afterDigit = await pressKey(DIGIT3_KEY, `${label} Digit3`);
  const snapshot = await snapshotRuntime('postDigit3');
  const scanFrames = [];

  for (const budget of IDLE_BUDGETS) {
    await restoreRuntime('postDigit3');
    scanFrames.push(await runIdleFrame(`${label} idle-${budget}`, budget));
  }

  const stopFrames = [];
  await restoreRuntime('postDigit3');
  stopFrames.push(await runIdleFrame(`${label} stop-first-zero-counter`, 10000, { kind: 'first-zero-counter' }));
  await restoreRuntime('postDigit3');
  stopFrames.push(await runIdleFrame(`${label} stop-pre-wipe-001879`, 10000, { kind: 'pre-wipe-001879' }));

  const safeDrains = scanFrames.filter(isSafeIdleDrain);
  const clearTests = [];
  if (safeDrains.length > 0) {
    const candidate = safeDrains[0];
    await restoreRuntime('postDigit3');
    const idleFrame = await runIdleFrame(`clear-after-${candidate.budget} idle-${candidate.budget}`, candidate.budget);
    clearTests.push(await runClearFromCurrentState(`clear-after-${candidate.budget}`, afterDigit, [idleFrame]));
  }

  return {
    label,
    afterBoot,
    afterDigit,
    snapshot,
    scanFrames,
    stopFrames,
    safeDrains,
    clearTests,
  };
}

function firstIndexOf(sequence, pc, start = 0) {
  return (sequence ?? []).findIndex((value, index) => index >= start && (value & 0xFFFFFF) === pc);
}

function firstCounterAfterAnchor(record) {
  const sequence = record?.sequence ?? [];
  const anchorIndex = firstIndexOf(sequence, TARGETS.getCsc03FA09);
  if (anchorIndex < 0) return { found: false, reason: '0x03FA09 anchor missing' };
  const counterIndex = firstIndexOf(sequence, TARGETS.keyDebounceCounter03F9AE, anchorIndex + 1);
  if (counterIndex < 0) return { found: false, anchorIndex, reason: '0x03F9AE after anchor missing' };
  return {
    found: true,
    anchorIndex,
    counterIndex,
    counterPc: sequence[counterIndex] ?? null,
    nextIndex: counterIndex + 1,
    nextPc: sequence[counterIndex + 1] ?? null,
  };
}

function fieldMap(fields) {
  return fields ?? {};
}

function compareOracle(oracleFields, actualFields) {
  return CORE_ORACLE_FIELDS.map((name) => ({
    name,
    oracle: oracleFields[name],
    actual: actualFields?.[name],
    match: oracleFields[name] === actualFields?.[name],
  }));
}

function keyState(capture) {
  return capture ? {
    D00587: capture.fields?.D00587,
    D00588: capture.fields?.D00588,
    D00589: capture.fields?.D00589,
    D0058B: capture.fields?.D0058B,
    D0058C: capture.fields?.D0058C,
    D0058E: capture.fields?.D0058E,
    D00595: capture.fields?.D00595,
    D00596: capture.fields?.D00596,
    D0243A: capture.fields?.D0243A,
    D0243D: capture.fields?.D0243D,
    token: capture.fields?.EDIT_TOKEN_D1A8CC,
  } : null;
}

function summarizeIdleFrame(frame) {
  const record = frame.record ?? {};
  return {
    label: frame.label,
    budget: frame.budget,
    result: frame.result,
    after: keyState(frame.afterFrame),
    targetCounts: record.targetCounts ?? {},
    targetSamples: (record.targetSamples ?? []).slice(0, 24),
    fieldChanges: (record.fieldChanges ?? []).slice(0, 32),
    stopEvent: frame.stopEvent ?? null,
  };
}

function routeSummary(scenario, oracleFields) {
  const key = scenario.afterClear?.lastKey ?? {};
  const record = scenario.record ?? {};
  const firstCounter = firstCounterAfterAnchor(record);
  const oracleRows = compareOracle(oracleFields, scenario.afterClear?.fields);
  return {
    label: scenario.label,
    firstCounter,
    key: {
      termination: key.termination ?? null,
      steps: key.steps ?? null,
      uiClearApplied: key.uiClearApplied === true,
      wipes: key.wipes ?? 0,
      controlStopPc: key.controlStopPc ?? null,
      vramPeak: key.vramPeak ?? null,
      vramCurrent: key.vramCurrent ?? null,
    },
    counts: record.targetCounts ?? {},
    afterDigit: keyState(scenario.afterDigit),
    afterDigitSettled: keyState(scenario.afterDigitSettled),
    afterWallClockDelay: keyState(scenario.afterWallClockDelay),
    preClearPatch: scenario.preClearPatch ?? null,
    idleFrames: (scenario.idleFrames ?? []).map(summarizeIdleFrame),
    fields: fieldMap(scenario.afterClear?.fields),
    oracleMismatches: oracleRows.filter((row) => !row.match),
    pageErrors: scenario.afterClear?.pageErrors ?? [],
    fieldChanges: (record.fieldChanges ?? []).slice(0, 48),
    targetSamples: (record.targetSamples ?? []).slice(0, 48),
  };
}

function compactScenario(scenario) {
  return {
    label: scenario.label,
    afterDigit: scenario.afterDigit ? keyState(scenario.afterDigit) : null,
    afterDigitSettled: keyState(scenario.afterDigitSettled),
    afterWallClockDelay: keyState(scenario.afterWallClockDelay),
    preClearPatch: scenario.preClearPatch ? {
      patch: scenario.preClearPatch.patch,
      writes: scenario.preClearPatch.writes,
      before: keyState(scenario.preClearPatch.before),
      after: keyState(scenario.preClearPatch.after),
    } : null,
    idleFrames: (scenario.idleFrames ?? []).map((frame) => ({
      label: frame.label,
      budget: frame.budget,
      result: frame.result,
      after: keyState(frame.afterFrame),
      targetCounts: frame.record?.targetCounts ?? {},
    })),
    afterClear: {
      termination: scenario.afterClear?.lastKey?.termination ?? null,
      steps: scenario.afterClear?.lastKey?.steps ?? null,
      uiClearApplied: scenario.afterClear?.lastKey?.uiClearApplied === true,
      wipes: scenario.afterClear?.lastKey?.wipes ?? 0,
      D007CA: scenario.afterClear?.fields?.D007CA,
      D0243A: scenario.afterClear?.fields?.D0243A,
      D0058B: scenario.afterClear?.fields?.D0058B,
      token: scenario.afterClear?.fields?.EDIT_TOKEN_D1A8CC,
    },
    firstCounter: firstCounterAfterAnchor(scenario.record),
    targetCounts: scenario.record?.targetCounts ?? {},
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

function routeTable(routes) {
  return table(routes, [
    { label: 'Scenario', value: (row) => row.label },
    { label: 'After Digit3 D0058B', value: (row) => formatValue('D0058B', row.afterDigit?.D0058B) },
    { label: 'After delay D0058B', value: (row) => formatValue('D0058B', row.afterWallClockDelay?.D0058B) },
    { label: 'Idle-frame D0058B', value: (row) => row.idleFrames.map((frame) => `${frame.label.replace(`${row.label} `, '')}:${formatValue('D0058B', frame.after?.D0058B)}`).join('<br>') || '-' },
    { label: 'First 0x03F9AE next', value: (row) => row.firstCounter?.nextPc == null ? '-' : hex(row.firstCounter.nextPc) },
    { label: '0x03F9B0', value: (row) => String(row.counts.keyDebounceFallthrough03F9B0 ?? 0) },
    { label: '0x03F9B8', value: (row) => String(row.counts.keyDebouncePost03F9B8 ?? 0) },
    { label: '0x03F9D1', value: (row) => String(row.counts.keyDebounceRefresh03F9D1 ?? 0) },
    { label: '0x03F9D5', value: (row) => String(row.counts.keyDebounceClear03F9D5 ?? 0) },
    { label: '0x0A229D', value: (row) => String(row.counts.clearAnchor0A229D ?? 0) },
    { label: '0x001879', value: (row) => String(row.counts.preWipe001879 ?? 0) },
    { label: '0x0018F8', value: (row) => String(row.counts.cleanup0018F8 ?? 0) },
    { label: 'Term', value: (row) => row.key.termination ?? '-' },
    { label: 'UI clear', value: (row) => row.key.uiClearApplied ? 'yes' : 'no' },
    { label: 'Wipes', value: (row) => String(row.key.wipes) },
    { label: 'Oracle mismatches', value: (row) => String(row.oracleMismatches.length) },
  ]);
}

function oracleTable(routes) {
  const rows = [];
  for (const route of routes) {
    for (const field of ['D007CA', 'D008E0', 'D010EF', 'D010FE', 'D0243A', 'D0243D', 'D02590', 'D0259D', 'D0301B', 'EDIT_TOKEN_D1A8CC']) {
      rows.push({
        scenario: route.label,
        field,
        actual: route.fields[field],
        mismatch: route.oracleMismatches.some((row) => row.name === field),
      });
    }
  }
  return table(rows, [
    { label: 'Scenario', value: (row) => row.scenario },
    { label: 'Field', value: (row) => row.field },
    { label: 'Actual', value: (row) => formatValue(row.field, row.actual) },
    { label: 'Match', value: (row) => row.mismatch ? 'NO' : 'yes' },
  ]);
}

function changeTable(changes) {
  return table(changes, [
    { label: 'Seq', value: (row) => String(row.seqIndex ?? '-') },
    { label: 'Field', value: (row) => row.name },
    { label: 'Before', value: (row) => formatValue(row.name, row.before) },
    { label: 'After', value: (row) => formatValue(row.name, row.after) },
    { label: 'Observed At', value: (row) => row.pc == null ? '-' : hex(row.pc) },
    { label: 'Owner PC', value: (row) => row.ownerPc == null ? '-' : hex(row.ownerPc) },
  ]);
}

function sampleTable(samples, limit = 32) {
  return table(samples.slice(0, limit), [
    { label: 'Seq', value: (row) => String(row.seqIndex ?? '-') },
    { label: 'PC', value: (row) => row.pc == null ? '-' : hex(row.pc) },
    { label: 'Prev', value: (row) => row.prevPc == null ? '-' : hex(row.prevPc) },
    { label: 'D00587', value: (row) => formatValue('D00587', row.fields?.D00587) },
    { label: 'D00588', value: (row) => formatValue('D00588', row.fields?.D00588) },
    { label: 'D00589', value: (row) => formatValue('D00589', row.fields?.D00589) },
    { label: 'D0058B', value: (row) => formatValue('D0058B', row.fields?.D0058B) },
    { label: 'D0058C', value: (row) => formatValue('D0058C', row.fields?.D0058C) },
    { label: 'D0058E', value: (row) => formatValue('D0058E', row.fields?.D0058E) },
    { label: 'D0243A', value: (row) => formatValue('D0243A', row.fields?.D0243A) },
    { label: 'Token', value: (row) => formatValue('EDIT_TOKEN_D1A8CC', row.fields?.EDIT_TOKEN_D1A8CC) },
  ]);
}

function idleFrameTable(routes) {
  const rows = routes.flatMap((route) => route.idleFrames.map((frame) => ({
    route: route.label,
    label: frame.label.replace(`${route.label} `, ''),
    budget: frame.budget,
    termination: frame.result?.termination ?? null,
    steps: frame.result?.steps ?? null,
    D0058B: frame.after?.D0058B,
    D00587: frame.after?.D00587,
    count03F9AE: frame.targetCounts.keyDebounceCounter03F9AE ?? 0,
    count03D058: frame.targetCounts.keyDebounceReturn03D058 ?? 0,
    count03F9B0: frame.targetCounts.keyDebounceFallthrough03F9B0 ?? 0,
  })));
  return table(rows, [
    { label: 'Scenario', value: (row) => row.route },
    { label: 'Idle Frame', value: (row) => row.label },
    { label: 'Budget', value: (row) => String(row.budget) },
    { label: 'Steps', value: (row) => String(row.steps ?? '-') },
    { label: 'Term', value: (row) => row.termination ?? '-' },
    { label: 'D0058B After', value: (row) => formatValue('D0058B', row.D0058B) },
    { label: 'D00587 After', value: (row) => formatValue('D00587', row.D00587) },
    { label: '0x03F9AE', value: (row) => String(row.count03F9AE) },
    { label: '0x03D058', value: (row) => String(row.count03D058) },
    { label: '0x03F9B0', value: (row) => String(row.count03F9B0) },
  ]);
}

function budgetScanTable(scanFrames) {
  const rows = scanFrames.map((frame) => {
    const fields = frame.afterFrame?.fields ?? {};
    const counts = frame.record?.targetCounts ?? {};
    return {
      budget: frame.budget,
      steps: frame.result?.steps ?? null,
      term: frame.result?.termination ?? null,
      D00587: fields.D00587,
      D00588: fields.D00588,
      D00589: fields.D00589,
      D0058B: fields.D0058B,
      D007CA: fields.D007CA,
      D0243A: fields.D0243A,
      token: fields.EDIT_TOKEN_D1A8CC,
      count03F9AE: counts.keyDebounceCounter03F9AE ?? 0,
      count03F9B0: counts.keyDebounceFallthrough03F9B0 ?? 0,
      count03D058: counts.keyDebounceReturn03D058 ?? 0,
      count001879: counts.preWipe001879 ?? 0,
      count0018F8: counts.cleanup0018F8 ?? 0,
      safeDrain: isSafeIdleDrain(frame),
    };
  });
  return table(rows, [
    { label: 'Budget', value: (row) => String(row.budget) },
    { label: 'Steps', value: (row) => String(row.steps ?? '-') },
    { label: 'Term', value: (row) => row.term ?? '-' },
    { label: 'D0058B', value: (row) => formatValue('D0058B', row.D0058B) },
    { label: 'D00587', value: (row) => formatValue('D00587', row.D00587) },
    { label: 'D00588', value: (row) => formatValue('D00588', row.D00588) },
    { label: 'D00589', value: (row) => formatValue('D00589', row.D00589) },
    { label: 'D007CA', value: (row) => formatValue('D007CA', row.D007CA) },
    { label: 'D0243A', value: (row) => formatValue('D0243A', row.D0243A) },
    { label: 'Token', value: (row) => formatValue('EDIT_TOKEN_D1A8CC', row.token) },
    { label: '0x03F9AE', value: (row) => String(row.count03F9AE) },
    { label: '0x03F9B0', value: (row) => String(row.count03F9B0) },
    { label: '0x03D058', value: (row) => String(row.count03D058) },
    { label: '0x001879', value: (row) => String(row.count001879) },
    { label: '0x0018F8', value: (row) => String(row.count0018F8) },
    { label: 'Safe drain', value: (row) => row.safeDrain ? 'yes' : 'no' },
  ]);
}

function stopFrameTable(stopFrames) {
  const rows = stopFrames.map((frame) => ({
    label: frame.label,
    budget: frame.budget,
    termination: frame.result?.termination ?? null,
    steps: frame.result?.steps ?? null,
    pc: frame.stopEvent?.pc ?? frame.result?.lastPc ?? null,
    D00587: frame.stopEvent?.fields?.D00587,
    D00588: frame.stopEvent?.fields?.D00588,
    D00589: frame.stopEvent?.fields?.D00589,
    D0058B: frame.stopEvent?.fields?.D0058B,
    D007CA: frame.stopEvent?.fields?.D007CA,
    D0243A: frame.stopEvent?.fields?.D0243A,
    token: frame.stopEvent?.fields?.EDIT_TOKEN_D1A8CC,
    preWipe: frame.stopEvent?.targetCounts?.preWipe001879 ?? 0,
    cleanup: frame.stopEvent?.targetCounts?.cleanup0018F8 ?? 0,
  }));
  return table(rows, [
    { label: 'Stop', value: (row) => row.label.replace('budget-scan ', '') },
    { label: 'Term', value: (row) => row.termination ?? '-' },
    { label: 'Steps', value: (row) => String(row.steps ?? '-') },
    { label: 'PC', value: (row) => row.pc == null ? '-' : hex(row.pc) },
    { label: 'D0058B', value: (row) => formatValue('D0058B', row.D0058B) },
    { label: 'D00587', value: (row) => formatValue('D00587', row.D00587) },
    { label: 'D00588', value: (row) => formatValue('D00588', row.D00588) },
    { label: 'D00589', value: (row) => formatValue('D00589', row.D00589) },
    { label: 'D007CA', value: (row) => formatValue('D007CA', row.D007CA) },
    { label: 'D0243A', value: (row) => formatValue('D0243A', row.D0243A) },
    { label: 'Token', value: (row) => formatValue('EDIT_TOKEN_D1A8CC', row.token) },
    { label: '0x001879 seen', value: (row) => String(row.preWipe) },
    { label: '0x0018F8 seen', value: (row) => String(row.cleanup) },
  ]);
}

function stopRecentChangeTable(stopFrames) {
  const rows = stopFrames.flatMap((frame) => (frame.stopEvent?.recentFieldChanges ?? []).map((change) => ({
    stop: frame.label.replace('budget-scan ', ''),
    ...change,
  })));
  return table(rows, [
    { label: 'Stop', value: (row) => row.stop },
    { label: 'Seq', value: (row) => String(row.seqIndex ?? '-') },
    { label: 'Field', value: (row) => row.name },
    { label: 'Before', value: (row) => formatValue(row.name, row.before) },
    { label: 'After', value: (row) => formatValue(row.name, row.after) },
    { label: 'Observed At', value: (row) => row.pc == null ? '-' : hex(row.pc) },
    { label: 'Owner PC', value: (row) => row.ownerPc == null ? '-' : hex(row.ownerPc) },
  ]);
}

function stopSequenceTable(stopFrames) {
  const rows = stopFrames.flatMap((frame) => (frame.stopEvent?.recentSequence ?? []).map((pc, index, sequence) => ({
    stop: frame.label.replace('budget-scan ', ''),
    rel: index - sequence.length + 1,
    pc,
  })));
  return table(rows, [
    { label: 'Stop', value: (row) => row.stop },
    { label: 'Rel', value: (row) => String(row.rel) },
    { label: 'PC', value: (row) => hex(row.pc) },
  ]);
}

function firstZeroPatchTable(routes) {
  const rows = routes
    .filter((route) => route.preClearPatch)
    .map((route) => ({
      label: route.label,
      patch: route.preClearPatch.patch,
      writes: route.preClearPatch.writes ?? [],
      before: keyState(route.preClearPatch.before),
      after: keyState(route.preClearPatch.after),
    }));
  return table(rows, [
    { label: 'Scenario', value: (row) => row.label },
    { label: 'Patch', value: (row) => row.patch },
    { label: 'Writes', value: (row) => row.writes.map((write) => `${write.name}:${hex(write.before, 2)}->${hex(write.after, 2)}`).join('<br>') || 'none' },
    { label: 'Before D0058B', value: (row) => formatValue('D0058B', row.before?.D0058B) },
    { label: 'Before D00588', value: (row) => formatValue('D00588', row.before?.D00588) },
    { label: 'Before D0243A', value: (row) => formatValue('D0243A', row.before?.D0243A) },
    { label: 'After D0058B', value: (row) => formatValue('D0058B', row.after?.D0058B) },
    { label: 'After D00588', value: (row) => formatValue('D00588', row.after?.D00588) },
    { label: 'After D0243A', value: (row) => formatValue('D0243A', row.after?.D0243A) },
  ]);
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 915: First-Zero CLEAR Route',
      '',
      'Probe failed before producing a complete comparison.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const baseline = data.routes.find((route) => route.label === 'transition-baseline');
  const standalone = data.routes.find((route) => route.label === 'standalone-clear');
  const firstZeroRoutes = data.routes.filter((route) => route.label.startsWith('first-zero-'));
  const direct = data.routes.find((route) => route.label === 'first-zero-reset-clear');
  const d0058bCb = data.routes.find((route) => route.label === 'first-zero-d0058b-cb-clear');
  const firstZeroStop = data.firstZero?.stopFrame ?? null;
  const continuation = data.firstZero?.continuation ?? null;

  return [
    '# Phase 915: First-Zero CLEAR Route',
    '',
    'Probe: `probe-phase915-first-zero-clear-route.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase915-first-zero-clear-route.mjs`',
    '',
    'Serves a temporary instrumented copy of `browser-shell.html`. Disk `browser-shell.html` is not edited.',
    '',
    '## Summary',
    '',
    `- Probe completed: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Phase914 first-zero baseline reproduced: pc=${firstZeroStop?.stopEvent?.pc == null ? '-' : hex(firstZeroStop.stopEvent.pc)}, D0058B=${formatValue('D0058B', firstZeroStop?.stopEvent?.fields?.D0058B)}, D00588=${formatValue('D00588', firstZeroStop?.stopEvent?.fields?.D00588)}, D007CA=${formatValue('D007CA', firstZeroStop?.stopEvent?.fields?.D007CA)}, D0243A=${formatValue('D0243A', firstZeroStop?.stopEvent?.fields?.D0243A)}, token=${formatValue('EDIT_TOKEN_D1A8CC', firstZeroStop?.stopEvent?.fields?.EDIT_TOKEN_D1A8CC)}.`,
    `- Continuing from the exact 0x03F9B0 stop without resetting: 0x03F9B0=${continuation?.record?.targetCounts?.keyDebounceFallthrough03F9B0 ?? 0}, 0x03F9B8=${continuation?.record?.targetCounts?.keyDebouncePost03F9B8 ?? 0}, 0x03F9D1=${continuation?.record?.targetCounts?.keyDebounceRefresh03F9D1 ?? 0}, 0x001879=${continuation?.record?.targetCounts?.preWipe001879 ?? 0}, 0x0018F8=${continuation?.record?.targetCounts?.cleanup0018F8 ?? 0}, final D0058B=${formatValue('D0058B', continuation?.afterFrame?.fields?.D0058B)}.`,
    `- Reset-to-event-loop CLEAR from first-zero: 0x0A229D=${direct?.counts.clearAnchor0A229D ?? 0}, 0x001879=${direct?.counts.preWipe001879 ?? 0}, 0x0018F8=${direct?.counts.cleanup0018F8 ?? 0}, uiClearApplied=${direct?.key.uiClearApplied === true}, wipes=${direct?.key.wipes ?? '-'}, oracle mismatches=${direct?.oracleMismatches.length ?? '-'}.`,
    `- Narrow A/B best case (` + `D0058B=0xCB` + ` before CLEAR): 0x0A229D=${d0058bCb?.counts.clearAnchor0A229D ?? 0}, 0x001879=${d0058bCb?.counts.preWipe001879 ?? 0}, 0x0018F8=${d0058bCb?.counts.cleanup0018F8 ?? 0}, uiClearApplied=${d0058bCb?.key.uiClearApplied === true}, wipes=${d0058bCb?.key.wipes ?? '-'}, oracle mismatches=${d0058bCb?.oracleMismatches.length ?? '-'}.`,
    `- Baseline Digit3 -> CLEAR still reproduces the bad route: first 0x03F9AE next=${baseline?.firstCounter?.nextPc == null ? '-' : hex(baseline.firstCounter.nextPc)}, 0x03F9B0=${baseline?.counts.keyDebounceFallthrough03F9B0 ?? 0}, 0x001879=${baseline?.counts.preWipe001879 ?? 0}, wipes=${baseline?.key.wipes ?? '-'}, termination=${baseline?.key.termination ?? '-'}.`,
    `- Standalone CLEAR baseline: first 0x03F9AE next=${standalone?.firstCounter?.nextPc == null ? '-' : hex(standalone.firstCounter.nextPc)}, 0x0A229D=${standalone?.counts.clearAnchor0A229D ?? 0}, wipes=${standalone?.key.wipes ?? '-'}, uiClearApplied=${standalone?.key.uiClearApplied === true}.`,
    `- Interpretation: ${data.interpretation}`,
    '',
    '## CLEAR Route Summary',
    '',
    routeTable(data.routes),
    '',
    '## First-Zero Stop And Continuation',
    '',
    stopFrameTable([firstZeroStop].filter(Boolean)),
    '',
    '### No-Key Continuation From 0x03F9B0',
    '',
    continuation ? table([continuation], [
      { label: 'Label', value: (row) => row.label },
      { label: 'Steps', value: (row) => String(row.result?.steps ?? '-') },
      { label: 'Term', value: (row) => row.result?.termination ?? '-' },
      { label: 'Last PC', value: (row) => row.result?.lastPc == null ? '-' : hex(row.result.lastPc) },
      { label: 'D0058B', value: (row) => formatValue('D0058B', row.afterFrame?.fields?.D0058B) },
      { label: 'D007CA', value: (row) => formatValue('D007CA', row.afterFrame?.fields?.D007CA) },
      { label: 'D0243A', value: (row) => formatValue('D0243A', row.afterFrame?.fields?.D0243A) },
      { label: '0x03F9B0', value: (row) => String(row.record?.targetCounts?.keyDebounceFallthrough03F9B0 ?? 0) },
      { label: '0x03F9B8', value: (row) => String(row.record?.targetCounts?.keyDebouncePost03F9B8 ?? 0) },
      { label: '0x03F9D1', value: (row) => String(row.record?.targetCounts?.keyDebounceRefresh03F9D1 ?? 0) },
      { label: '0x001879', value: (row) => String(row.record?.targetCounts?.preWipe001879 ?? 0) },
      { label: '0x0018F8', value: (row) => String(row.record?.targetCounts?.cleanup0018F8 ?? 0) },
    ]) : 'No rows.',
    '',
    '## First-Zero Pre-CLEAR Patches',
    '',
    firstZeroPatchTable(firstZeroRoutes),
    '',
    '## First-Zero Stop Recent Field Changes',
    '',
    stopRecentChangeTable([firstZeroStop].filter(Boolean)),
    '',
    '## Selected Oracle Fields',
    '',
    oracleTable(data.routes),
    '',
    '## First-Zero Route Target Samples',
    '',
    firstZeroRoutes.map((route) => `### ${route.label}\n\n${sampleTable(route.targetSamples, 24)}`).join('\n\n') || 'No rows.',
    '',
    '## Baseline Transition Early Changes',
    '',
    changeTable(baseline?.fieldChanges ?? []),
    '',
    '## First-Zero Direct CLEAR Early Changes',
    '',
    changeTable(direct?.fieldChanges ?? []),
    '',
    '## Bounded Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      firstZero: data.firstZero,
      routes: data.scenarios.map(compactScenario),
      routeSummaries: data.routes.map((route) => ({
        label: route.label,
        firstCounter: route.firstCounter,
        afterDigit: route.afterDigit,
        afterWallClockDelay: route.afterWallClockDelay,
        idleFrames: route.idleFrames.map((frame) => ({
          label: frame.label,
          budget: frame.budget,
          result: frame.result,
          after: frame.after,
          targetCounts: frame.targetCounts,
          fieldChanges: frame.fieldChanges,
        })),
        key: route.key,
        counts: route.counts,
        oracleMismatches: route.oracleMismatches.map((row) => ({
          name: row.name,
          oracle: row.oracle,
          actual: row.actual,
        })),
      })),
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

  const scenarios = [];
  scenarios.push(await runScenario(pageUrl, {
    label: 'standalone-clear',
    digitFirst: false,
    forcePlan: null,
  }));
  scenarios.push(await runScenario(pageUrl, {
    label: 'transition-baseline',
    digitFirst: true,
  }));

  const afterBoot = await loadAndBoot(pageUrl, 'first-zero-baseline');
  const afterDigit = await pressKey(DIGIT3_KEY, 'first-zero-baseline Digit3');
  await snapshotRuntime('phase915-postDigit3');
  const firstZeroStop = await runIdleFrame('first-zero-baseline stop-first-zero-counter', 10000, { kind: 'first-zero-counter' });
  await snapshotRuntime('phase915-firstZeroStop');

  const continuation = await runContinuation('first-zero-continue-from-03f9b0', 6000);

  const firstZeroScenarios = [];
  const firstZeroVariants = [
    ['first-zero-reset-clear', 'none'],
    ['first-zero-clear-d00588-clear', 'clear-d00588'],
    ['first-zero-d0058b-cb-clear', 'd0058b-cb'],
    ['first-zero-d0058b-cb-d00588-clear', 'd0058b-cb-clear-d00588'],
  ];
  for (const [label, patch] of firstZeroVariants) {
    await restoreRuntime('phase915-firstZeroStop');
    firstZeroScenarios.push(await runClearFromFirstZero(label, patch, afterDigit, firstZeroStop));
  }
  scenarios.push(...firstZeroScenarios);

  const routes = scenarios.map((scenario) => routeSummary(scenario, oracleFields));
  const baseline = routes.find((route) => route.label === 'transition-baseline');
  const standalone = routes.find((route) => route.label === 'standalone-clear');
  const direct = routes.find((route) => route.label === 'first-zero-reset-clear');
  const d0058bCb = routes.find((route) => route.label === 'first-zero-d0058b-cb-clear');

  const standaloneOk = standalone?.firstCounter?.nextPc === TARGETS.keyDebounceReturn03D058
    && standalone?.counts.clearAnchor0A229D > 0
    && standalone?.key.uiClearApplied === true
    && standalone?.key.wipes === 0;
  const baselineBad = baseline?.firstCounter?.nextPc === TARGETS.keyDebounceFallthrough03F9B0
    && baseline?.counts.preWipe001879 > 0
    && baseline?.counts.cleanup0018F8 > 0
    && baseline?.key.uiClearApplied === false;
  const stopCaptured = firstZeroStop?.stopEvent?.pc === TARGETS.keyDebounceFallthrough03F9B0
    && firstZeroStop?.stopEvent?.fields?.D0058B === 0;
  const continuationCaptured = continuation?.result?.steps > 0
    && continuation?.record?.targetCounts?.keyDebounceFallthrough03F9B0 > 0;
  const firstZeroRoutesCaptured = routes
    .filter((route) => route.label.startsWith('first-zero-'))
    .every((route) => route.key?.termination != null);
  const pass = standaloneOk
    && baselineBad
    && stopCaptured
    && continuationCaptured
    && firstZeroRoutesCaptured
    && routes.every((route) => route.pageErrors.length === 0);

  const directRouteCorrect = direct?.counts.clearAnchor0A229D > 0
    && direct?.key.uiClearApplied === true
    && direct?.key.wipes === 0
    && (direct?.counts.preWipe001879 ?? 0) === 0
    && (direct?.counts.cleanup0018F8 ?? 0) === 0;
  const d0058bRouteCorrect = d0058bCb?.counts.clearAnchor0A229D > 0
    && d0058bCb?.key.uiClearApplied === true
    && d0058bCb?.key.wipes === 0
    && (d0058bCb?.counts.preWipe001879 ?? 0) === 0
    && (d0058bCb?.counts.cleanup0018F8 ?? 0) === 0;
  const firstZeroStopSafe = firstZeroStop?.stopEvent?.fields?.D007CA === 0x0585E9
    && firstZeroStop?.stopEvent?.fields?.D0243A === 0xD1A8CD
    && firstZeroStop?.stopEvent?.fields?.EDIT_TOKEN_D1A8CC === 0x33
    && (firstZeroStop?.stopEvent?.targetCounts?.preWipe001879 ?? 0) === 0
    && (firstZeroStop?.stopEvent?.targetCounts?.cleanup0018F8 ?? 0) === 0;
  const continuationWipes = (continuation?.record?.targetCounts?.preWipe001879 ?? 0) > 0
    || (continuation?.record?.targetCounts?.cleanup0018F8 ?? 0) > 0;
  const interpretation = directRouteCorrect
    ? 'Resetting from the exact 0x03F9B0 first-zero stop to the normal event loop is sufficient for a route-correct CLEAR: the route reaches 0x0A229D with uiClearApplied and no 0x001879/0x0018F8 wipe. Treat the broad no-key continuation as the destructive path, not the state to preserve.'
    : d0058bRouteCorrect
      ? 'The exact 0x03F9B0 stop is safe as a snapshot, but default reset-to-event-loop CLEAR is still not route-correct. The narrow A/B shows D0058B is the decisive pre-CLEAR branch state: holding it nonzero at 0xCB reaches 0x0A229D with no wipe, while the drained zero state does not.'
      : continuationWipes
        ? 'The exact 0x03F9B0 stop is real and context-intact, but both continuing from it and resetting from it still fall back to the destructive owner path. The next step should trace the 0x03F9B0/0x03F9B8/0x03F9D1 refresh owner rather than broad force-restoring edit/VAT fields.'
        : firstZeroStopSafe
          ? 'The exact first-zero stop is context-intact, but the tested reset/A-B variants did not produce a clean route-correct CLEAR. Continue with a narrower owner trace around the 0x03F9B0 branch state.'
          : 'The first-zero stop did not preserve the expected context; re-run the owner stop with tighter instrumentation before treating it as a baseline.';

  return {
    probe: 'phase915-first-zero-clear-route',
    chromePath,
    pageUrl,
    pass,
    interpretation,
    firstZero: {
      afterBoot,
      afterDigit,
      stopFrame: firstZeroStop,
      continuation,
      directRouteCorrect,
      d0058bRouteCorrect,
    },
    scenarios,
    routes,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    routes: summary.routes.map((route) => ({
      label: route.label,
      firstCounterNext: route.firstCounter?.nextPc == null ? null : hex(route.firstCounter.nextPc),
      afterDigitD0058B: route.afterDigit?.D0058B == null ? null : hex(route.afterDigit.D0058B, 2),
      idleFrames: route.idleFrames.map((frame) => ({
        label: frame.label,
        D0058B: frame.after?.D0058B == null ? null : hex(frame.after.D0058B, 2),
        steps: frame.result?.steps ?? null,
        termination: frame.result?.termination ?? null,
      })),
      termination: route.key.termination,
      uiClearApplied: route.key.uiClearApplied,
      wipes: route.key.wipes,
      clearAnchor0A229D: route.counts.clearAnchor0A229D,
      preWipe001879: route.counts.preWipe001879,
      cleanup0018F8: route.counts.cleanup0018F8,
      oracleMismatches: route.oracleMismatches.length,
      preClearPatch: route.preClearPatch ? {
        patch: route.preClearPatch.patch,
        writes: route.preClearPatch.writes,
      } : null,
    })),
    firstZero: {
      stop: {
        termination: summary.firstZero.stopFrame?.result?.termination ?? null,
        pc: summary.firstZero.stopFrame?.stopEvent?.pc == null ? null : hex(summary.firstZero.stopFrame.stopEvent.pc),
        D0058B: summary.firstZero.stopFrame?.stopEvent?.fields?.D0058B == null ? null : hex(summary.firstZero.stopFrame.stopEvent.fields.D0058B, 2),
        D00588: summary.firstZero.stopFrame?.stopEvent?.fields?.D00588 == null ? null : hex(summary.firstZero.stopFrame.stopEvent.fields.D00588, 2),
        D007CA: summary.firstZero.stopFrame?.stopEvent?.fields?.D007CA == null ? null : hex(summary.firstZero.stopFrame.stopEvent.fields.D007CA),
        D0243A: summary.firstZero.stopFrame?.stopEvent?.fields?.D0243A == null ? null : hex(summary.firstZero.stopFrame.stopEvent.fields.D0243A),
        token: summary.firstZero.stopFrame?.stopEvent?.fields?.EDIT_TOKEN_D1A8CC == null ? null : hex(summary.firstZero.stopFrame.stopEvent.fields.EDIT_TOKEN_D1A8CC, 2),
      },
      continuation: {
        termination: summary.firstZero.continuation?.result?.termination ?? null,
        steps: summary.firstZero.continuation?.result?.steps ?? null,
        lastPc: summary.firstZero.continuation?.result?.lastPc == null ? null : hex(summary.firstZero.continuation.result.lastPc),
        D0058B: summary.firstZero.continuation?.afterFrame?.fields?.D0058B == null ? null : hex(summary.firstZero.continuation.afterFrame.fields.D0058B, 2),
        preWipe001879: summary.firstZero.continuation?.record?.targetCounts?.preWipe001879 ?? 0,
        cleanup0018F8: summary.firstZero.continuation?.record?.targetCounts?.cleanup0018F8 ?? 0,
      },
      directRouteCorrect: summary.firstZero.directRouteCorrect,
      d0058bRouteCorrect: summary.firstZero.d0058bRouteCorrect,
    },
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase915-first-zero-clear-route', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}


import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase888-visual-settle-stop-trace.md');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const debugPort = 9888;
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const OWNER_ENTRY = 0x0454BE;
const OWNER_STORE_BLOCK = 0x040BF0;
const D0301B_MAGIC = 0x5AA55A;
const ACCEPTED_PHASE6_HALT = 0x0019B5;

const CANDIDATE_SPECS = Object.freeze([
  { label: 'stop-before-0x040C16', stopBeforePc: 0x040C16, requiredHits: 1 },
  { label: 'stop-before-0x09DD1C', stopBeforePc: 0x09DD1C, requiredHits: 1 },
  { label: 'stop-before-0x09DEE0', stopBeforePc: 0x09DEE0, requiredHits: 1 },
  { label: 'stop-before-0x08A98F', stopBeforePc: 0x08A98F, requiredHits: 1 },
  { label: 'stop-before-0x04C8A3-hit-1', stopBeforePc: 0x04C8A3, requiredHits: 1 },
  { label: 'stop-before-0x04C8A3-hit-10', stopBeforePc: 0x04C8A3, requiredHits: 10 },
  { label: 'stop-before-0x04C8A3-hit-100', stopBeforePc: 0x04C8A3, requiredHits: 100 },
]);

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
  ['D0301B', 0xD0301B, 3],
  ['D00000_IY0', 0xD00000, 1],
  ['D000B5_IY53', 0xD000B5, 1],
  ['D000BF_IY63', 0xD000BF, 1],
  ['D000C3_IY67', 0xD000C3, 1],
  ['D00894', 0xD00894, 1],
  ['D1A880', 0xD1A880, 1],
]);

const OWNER_TARGETS = Object.freeze({
  ownerEntry0454BE: 0x0454BE,
  ownerGate040BDE: 0x040BDE,
  ownerCommon040BE4: 0x040BE4,
  ownerPreStoreCall040BEC: 0x040BEC,
  ownerStore040BF0: OWNER_STORE_BLOCK,
  postStore040C10: 0x040C10,
  postStore040C16: 0x040C16,
  postStore09E0D9: 0x09E0D9,
  displayClear09EFDE: 0x09EFDE,
  preMemInit09DD40: 0x09DD40,
  launchHome09DD1C: 0x09DD1C,
  launchHome09DD14: 0x09DD14,
  memInit09DEE0: 0x09DEE0,
  memInitReturn08A98F: 0x08A98F,
  tailHelper04C8A3: 0x04C8A3,
  halt0019B5: 0x0019B5,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

let nextId = 1;
let ws;
const pending = new Map();

function fieldWidth(name) {
  if (
    name === 'D010F4'
    || name === 'D02505'
    || name.endsWith('_IY0')
    || name.endsWith('_IY53')
    || name.endsWith('_IY63')
    || name.endsWith('_IY67')
    || name === 'D00894'
    || name === 'D1A880'
  ) return 2;
  return 6;
}

function formatFields(fields) {
  if (!fields) return null;
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, value == null ? null : hex(value, fieldWidth(name))]),
  );
}

function formatCpu(cpu) {
  if (!cpu) return null;
  return {
    ...cpu,
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
  };
}

function formatChange(change) {
  return {
    ...change,
    from: change.from == null ? null : hex(change.from, fieldWidth(change.name)),
    to: change.to == null ? null : hex(change.to, fieldWidth(change.name)),
    pc: change.pc == null ? null : hex(change.pc),
    prevPc: change.prevPc == null ? null : hex(change.prevPc),
  };
}

function formatSnapshot(row) {
  if (!row) return null;
  return {
    ...row,
    pc: row.pc == null ? null : hex(row.pc),
    prevPc: row.prevPc == null ? null : hex(row.prevPc),
    cpu: formatCpu(row.cpu),
    fields: formatFields(row.fields),
  };
}

function compareFields(a, b) {
  return WATCHED_FIELDS
    .filter(([name]) => a?.[name] !== b?.[name])
    .map(([name]) => ({
      name,
      baseline: a?.[name] == null ? null : hex(a[name], fieldWidth(name)),
      candidate: b?.[name] == null ? null : hex(b[name], fieldWidth(name)),
    }));
}

function isSafeCandidate(baseline, candidate) {
  const postBootDiffs = compareFields(baseline.snapshot?.fields, candidate.snapshot?.fields);
  const safe = Boolean(
    candidate.ownerTrace?.stop
      && candidate.naturalOwner?.afterD0301B === hex(D0301B_MAGIC)
      && candidate.phase6?.termination === 'halt'
      && candidate.phase6?.lastPc === hex(ACCEPTED_PHASE6_HALT)
      && candidate.phase6?.vram === baseline.phase6?.vram
      && postBootDiffs.length === 0,
  );
  return { safe, postBootDiffs };
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.rom')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function instrumentBrowserShell(sourceHtml, scenario) {
  const marker = 'function initializeColdbootRuntime() {';
  const ownerRun = `const owner = executor.runFrom(COLDBOOT_D0301B_OWNER_ENTRY, 'adl', {
      maxSteps: 60000,
      maxLoopIterations: 10000,
    });`;
  const phase6Line = '  window.__coldbootPhase6 = {';
  if (!sourceHtml.includes(marker)) throw new Error('initializeColdbootRuntime marker not found');
  if (!sourceHtml.includes(ownerRun)) throw new Error('owner run marker not found');
  if (!sourceHtml.includes(phase6Line)) throw new Error('phase6 marker not found');

  const instrumentation = `
const PHASE888_STOP = '__PHASE888_STOP__';
const PHASE888_BASELINE_SPEC = Object.freeze({ label: 'baseline-full-owner-leg', stopBeforePc: null, requiredHits: 1 });
const PHASE888_WATCHED_FIELDS = Object.freeze(${JSON.stringify(WATCHED_FIELDS)});
const PHASE888_TARGETS = Object.freeze(${JSON.stringify(OWNER_TARGETS)});
const PHASE888_CPU_FIELDS = Object.freeze([
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'pc', '_currentBlockPc', 'stepCount', '_sp', '_ix', '_iy', 'i', 'im',
  'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
]);

function phase888Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase888ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase888WriteValue(mem, addr, len, value) {
  if (len === 1) mem[addr & 0xFFFFFF] = value & 0xFF;
  else evalWrite24(mem, addr, value);
}

function phase888ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE888_WATCHED_FIELDS.map(([name, addr, len]) => [
    name,
    phase888ReadValue(mem, addr, len),
  ]));
}

function phase888CpuRaw() {
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

function phase888Snapshot(label, pc = null, prevPc = null, phase6 = null) {
  return {
    label,
    pc,
    prevPc,
    totalSteps,
    status: document.getElementById('status')?.textContent ?? null,
    cpu: phase888CpuRaw(),
    fields: phase888ReadFields(),
    phase6: phase6 ?? window.__coldbootPhase6 ?? null,
    vram: countVRAMPixels?.() ?? null,
  };
}

function phase888CaptureCpu() {
  return Object.fromEntries(PHASE888_CPU_FIELDS.map((field) => [field, cpu?.[field]]));
}

function phase888RestoreCpu(snapshot) {
  for (const field of PHASE888_CPU_FIELDS) {
    if (field in snapshot) cpu[field] = snapshot[field];
  }
}

function phase888CaptureBase(label) {
  return {
    label,
    memory: new Uint8Array(cpu.memory),
    cpu: phase888CaptureCpu(),
    totalSteps,
    vramSnapshot: vramSnapshot ? new Uint8Array(vramSnapshot) : null,
    vramSnapshotPeak,
  };
}

function phase888RestoreBase(snapshot) {
  cpu.memory.set(snapshot.memory);
  phase888RestoreCpu(snapshot.cpu);
  totalSteps = snapshot.totalSteps ?? totalSteps;
  vramSnapshot = snapshot.vramSnapshot ? new Uint8Array(snapshot.vramSnapshot) : null;
  vramSnapshotPeak = snapshot.vramSnapshotPeak ?? 0;
  peripherals?.setTimerEnabled?.(false);
  peripherals?.acknowledgeIRQ?.();
  peripherals?.acknowledgeNMI?.();
}

function phase888CreateTrace(spec) {
  return {
    label: spec.label,
    stopBeforePc: spec.stopBeforePc ?? null,
    requiredHits: spec.requiredHits ?? 1,
    blockCount: 0,
    prevPc: null,
    targetCounts: Object.fromEntries(Object.keys(PHASE888_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    fieldChanges: [],
    d0301bChanges: [],
    samplesAfterStore: [],
    hotBlocks: {},
    topHotBlocks: [],
    stopHits: 0,
    stop: null,
    lastFields: null,
  };
}

function phase888ObserveOwnerBlock(pc, steps, spec) {
  const trace = window.__phase888OwnerTrace;
  if (!trace) return;
  const addr = pc & 0xFFFFFF;
  const prevPc = trace.prevPc;
  trace.blockCount += 1;
  const key = phase888Hex(addr);
  trace.hotBlocks[key] = (trace.hotBlocks[key] || 0) + 1;

  const fields = phase888ReadFields();
  if (fields && trace.lastFields) {
    for (const [name] of PHASE888_WATCHED_FIELDS) {
      if (fields[name] === trace.lastFields[name]) continue;
      const change = { block: trace.blockCount, name, from: trace.lastFields[name], to: fields[name], pc: addr, prevPc };
      trace.fieldChanges.push(change);
      if (name === 'D0301B') trace.d0301bChanges.push(change);
    }
  }
  trace.lastFields = fields;

  for (const [name, target] of Object.entries(PHASE888_TARGETS)) {
    if (addr !== target) continue;
    trace.targetCounts[name] += 1;
    if (!trace.targetFirst[name]) trace.targetFirst[name] = phase888Snapshot(name, addr, prevPc);
  }

  if (trace.targetCounts.ownerStore040BF0 > 0 && trace.samplesAfterStore.length < 100) {
    trace.samplesAfterStore.push(phase888Snapshot('after-store-window', addr, prevPc));
  }

  if (spec.stopBeforePc != null && addr === spec.stopBeforePc) {
    trace.stopHits += 1;
    if (trace.stopHits >= (spec.requiredHits ?? 1)) {
      trace.stop = {
        block: trace.blockCount,
        stopBeforePc: addr,
        requiredHits: spec.requiredHits ?? 1,
        hit: trace.stopHits,
        prevPc,
        steps,
        snapshot: phase888Snapshot('stop-before-target', addr, prevPc),
      };
      throw new Error(PHASE888_STOP);
    }
  }

  trace.prevPc = addr;
}

function phase888FinishTrace() {
  const trace = window.__phase888OwnerTrace;
  if (!trace) return null;
  trace.topHotBlocks = Object.entries(trace.hotBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([pc, count]) => ({ pc, count }));
  return trace;
}

function phase888RunOwnerWithStop(entry, spec = PHASE888_BASELINE_SPEC) {
  window.__phase888OwnerTrace = phase888CreateTrace(spec);
  window.__phase888OwnerTrace.lastFields = phase888ReadFields();
  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: 60000,
      maxLoopIterations: 10000,
      onBlock(pc, mode, meta, steps) {
        phase888ObserveOwnerBlock(pc, steps, spec);
      },
    });
    phase888FinishTrace();
    return result;
  } catch (error) {
    if (String(error?.message || error) !== PHASE888_STOP) throw error;
    phase888FinishTrace();
    const stop = window.__phase888OwnerTrace.stop;
    return {
      steps: stop?.steps ?? 0,
      termination: 'stopped_before_target',
      lastPc: stop?.stopBeforePc ?? spec.stopBeforePc,
      lastMode: 'adl',
      halted: Boolean(cpu?.halted),
      loopsForced: null,
      blockVisits: {},
      dynamicTargets: [],
      missingBlocks: [],
    };
  }
}

function phase888ReplayStableFields() {
  const replay = window.__phase888StableReplay;
  if (!Array.isArray(replay) || !replay.length) return false;
  const mem = cpu.memory;
  for (const [field, value] of replay) {
    phase888WriteValue(mem, field[1], field[2], value);
  }
  return true;
}

function phase888RunPhase6(naturalOwner) {
  const replayed = phase888ReplayStableFields();
  peripherals?.setTimerEnabled?.(true);
  prepareColdbootEventFrame();
  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
  return {
    steps: p6.steps,
    termination: p6.termination,
    lastPc: p6.lastPc,
    vram: countVRAMPixels(),
    vatSnapshotCaptured: replayed,
    naturalD0301BOwner: naturalOwner,
  };
}

function phase888SeedColdbootEditContext() {
  const mem = cpu.memory;
  const EDIT_BASE = 0xD1A8CC;
  const tokenCursor = 0xD2A83E;
  evalWrite24(mem, 0xD02317, tokenCursor);
  evalWrite24(mem, 0xD0231A, tokenCursor);
  evalWrite24(mem, 0xD0231D, tokenCursor - 1);
  mem.fill(0, 0xD02430, 0xD02460);
  evalWrite24(mem, 0xD02437, EDIT_BASE);
  evalWrite24(mem, 0xD0243A, EDIT_BASE);
  evalWrite24(mem, 0xD0243D, tokenCursor);
  evalWrite24(mem, 0xD02440, tokenCursor);
  evalWrite24(mem, 0xD0244D, 0xD3FE89);
  mem[0xD02455] = 0x07;
  mem[0xD0245D] = 0x01;
  mem[0xD000A3] = 0x0A;
  evalWrite24(mem, 0xD02A40, tokenCursor);
  mem[0xD02A29] = 0;
  mem[0xD02A2A] = 0;
  mem.fill(0, EDIT_BASE, EDIT_BASE + 0x80);
  mem[0xD1A8C0] = 0x0C;
  mem[0xD1A8C1] = 0x00;
  mem[0xD1A8C2] = 0x07;
  lastPc = COLDBOOT_EVENT_LOOP_ENTRY;
  lastMode = 'adl';
  updateRegs();
  syncLCDState();
  if (lcd) lcd.renderFrame();
  updateKeyStateDisplay();
  updateKeyboardOverlay();
  setStatus('Coldboot complete. OS event loop is ready.');
}

window.__phase888RunCandidate = (spec) => {
  if (!window.__phase888PreOwnerSnapshot) throw new Error('PHASE888 pre-owner snapshot missing');
  phase888RestoreBase(window.__phase888PreOwnerSnapshot);
  const d0301bBeforeOwner = evalRead24(cpu.memory, 0xD0301B);
  const owner = phase888RunOwnerWithStop(COLDBOOT_D0301B_OWNER_ENTRY, spec);
  totalSteps += owner.steps;
  const naturalOwner = {
    entry: COLDBOOT_D0301B_OWNER_ENTRY,
    steps: owner.steps,
    termination: owner.termination,
    lastPc: owner.lastPc,
    beforeD0301B: d0301bBeforeOwner,
    afterD0301B: evalRead24(cpu.memory, 0xD0301B),
  };
  const ownerTrace = window.__phase888OwnerTrace;
  const phase6 = phase888RunPhase6(naturalOwner);
  totalSteps += phase6.steps;
  phase888SeedColdbootEditContext();
  return {
    label: spec.label,
    config: spec,
    naturalOwner,
    ownerTrace,
    phase6,
    snapshot: phase888Snapshot(spec.label + '-post-phase6', null, null, phase6),
  };
};

window.__phase888ReadBaseline = () => ({
  label: 'baseline-full-owner-leg',
  config: PHASE888_BASELINE_SPEC,
  ownerTrace: window.__phase888BaselineOwnerTrace ?? null,
  naturalOwner: window.__coldbootNaturalD0301BOwner ?? null,
  phase6: window.__coldbootPhase6 ?? null,
  snapshot: phase888Snapshot('baseline-post-phase6'),
});
`;

  let html = sourceHtml.replace(marker, `${instrumentation}\n\n${marker}`);
  html = html.replace('    const d0301bBeforeOwner = evalRead24(mem, 0xD0301B);', `    window.__phase888PreOwnerSnapshot = phase888CaptureBase('pre-owner');\n    const d0301bBeforeOwner = evalRead24(mem, 0xD0301B);`);
  html = html.replace(ownerRun, `const owner = phase888RunOwnerWithStop(COLDBOOT_D0301B_OWNER_ENTRY, PHASE888_BASELINE_SPEC);\n    window.__phase888BaselineOwnerTrace = window.__phase888OwnerTrace;`);
  html = html.replace(phase6Line, `  window.__phase888StableReplay = coldbootVatSnapshot ? coldbootVatSnapshot.map(([field, value]) => [field, value]) : null;\n${phase6Line}`);
  return html;
}

function startStaticServer(scenario) {
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
      res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
      if (rel === 'browser-shell.html') {
        res.end(instrumentBrowserShell(fs.readFileSync(BROWSER_SHELL_PATH, 'utf8'), scenario));
        return;
      }
      fs.createReadStream(fullPath).pipe(res);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(error?.stack || error));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
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

function formatTrace(trace) {
  if (!trace) return null;
  return {
    ...trace,
    stopBeforePc: trace.stopBeforePc == null ? null : hex(trace.stopBeforePc),
    targetFirst: Object.fromEntries(
      Object.entries(trace.targetFirst ?? {}).map(([name, row]) => [name, formatSnapshot(row)]),
    ),
    fieldChanges: (trace.fieldChanges ?? []).map(formatChange),
    d0301bChanges: (trace.d0301bChanges ?? []).map(formatChange),
    samplesAfterStore: (trace.samplesAfterStore ?? []).map(formatSnapshot),
    stop: trace.stop ? {
      ...trace.stop,
      stopBeforePc: hex(trace.stop.stopBeforePc),
      prevPc: trace.stop.prevPc == null ? null : hex(trace.stop.prevPc),
      snapshot: formatSnapshot(trace.stop.snapshot),
    } : null,
    lastFields: formatFields(trace.lastFields),
  };
}

function formatBrowserSummary(raw) {
  return {
    label: raw.label,
    config: {
      ...raw.config,
      stopBeforePc: raw.config?.stopBeforePc == null ? null : hex(raw.config.stopBeforePc),
    },
    naturalOwner: raw.naturalOwner ? {
      ...raw.naturalOwner,
      entry: hex(raw.naturalOwner.entry),
      lastPc: hex(raw.naturalOwner.lastPc),
      beforeD0301B: hex(raw.naturalOwner.beforeD0301B),
      afterD0301B: hex(raw.naturalOwner.afterD0301B),
    } : null,
    phase6: raw.phase6 ? {
      ...raw.phase6,
      lastPc: hex(raw.phase6.lastPc),
      naturalD0301BOwner: raw.phase6.naturalD0301BOwner ? {
        ...raw.phase6.naturalD0301BOwner,
        entry: hex(raw.phase6.naturalD0301BOwner.entry),
        lastPc: hex(raw.phase6.naturalD0301BOwner.lastPc),
        beforeD0301B: hex(raw.phase6.naturalD0301BOwner.beforeD0301B),
        afterD0301B: hex(raw.phase6.naturalD0301BOwner.afterD0301B),
      } : null,
    } : null,
    snapshot: formatSnapshot(raw.snapshot),
    ownerTrace: formatTrace(raw.ownerTrace),
  };
}

async function runBrowserProbe() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-phase888-'));
  let chrome;
  let server;
  try {
    server = await startStaticServer({});
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
    await waitFor(ws, 'typeof window.__phase888ReadBaseline === "function" && typeof window.__phase888RunCandidate === "function"', 'phase888 instrumentation', 30000);
    await sleep(250);

    await evalExpr(ws, `(() => {
      document.getElementById('coldbootMode').checked = true;
      document.getElementById('preserveDisplay').checked = true;
      document.getElementById('btnBoot').click();
      return true;
    })()`);
    await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
    await sleep(150);

    const baselineRaw = await evalExpr(ws, 'window.__phase888ReadBaseline()', 60000);
    const baseline = formatBrowserSummary(baselineRaw);
    const candidates = [];

    for (const spec of CANDIDATE_SPECS) {
      const raw = await evalExpr(ws, `window.__phase888RunCandidate(${JSON.stringify(spec)})`, 150000);
      const candidate = formatBrowserSummary(raw);
      candidates.push(candidate);
      if (isSafeCandidate(baseline, candidate).safe) break;
    }

    return { baseline, candidates };
  } finally {
    try { ws?.close(); } catch {}
    ws = null;
    pending.clear();
    try { chrome?.kill(); } catch {}
    try { server?.close(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
    await sleep(500);
  }
}

function table(rows, columns) {
  if (!rows.length) return 'No rows.';
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function buildReport(data) {
  const scenarioRows = [
    {
      label: data.baseline.label,
      stop: '-',
      hits: '-',
      owner: data.baseline.naturalOwner ? `${data.baseline.naturalOwner.termination} ${data.baseline.naturalOwner.steps} @ ${data.baseline.naturalOwner.lastPc}` : '-',
      d0301b: data.baseline.naturalOwner?.afterD0301B ?? '-',
      phase6: data.baseline.phase6 ? `${data.baseline.phase6.termination} ${data.baseline.phase6.steps} @ ${data.baseline.phase6.lastPc}` : '-',
      vram: data.baseline.phase6?.vram ?? '-',
      diffs: '-',
      safe: 'baseline',
    },
    ...data.evaluations.map((row) => ({
      label: row.candidate.label,
      stop: row.candidate.config.stopBeforePc ?? '-',
      hits: row.candidate.config.requiredHits ?? 1,
      owner: row.candidate.naturalOwner ? `${row.candidate.naturalOwner.termination} ${row.candidate.naturalOwner.steps} @ ${row.candidate.naturalOwner.lastPc}` : '-',
      d0301b: row.candidate.naturalOwner?.afterD0301B ?? '-',
      phase6: row.candidate.phase6 ? `${row.candidate.phase6.termination} ${row.candidate.phase6.steps} @ ${row.candidate.phase6.lastPc}` : '-',
      vram: row.candidate.phase6?.vram ?? '-',
      diffs: row.postBootDiffs.length,
      safe: row.safe ? 'yes' : 'no',
    })),
  ];

  const targetRows = Object.entries(data.baseline.ownerTrace?.targetCounts ?? {}).map(([name, count]) => ({
    name,
    count,
    first: data.baseline.ownerTrace?.targetFirst?.[name]?.pc ?? '-',
    prev: data.baseline.ownerTrace?.targetFirst?.[name]?.prevPc ?? '-',
  }));

  const unsafeRows = data.evaluations
    .filter((row) => !row.safe)
    .map((row) => ({
      label: row.candidate.label,
      vram: row.candidate.phase6?.vram ?? '-',
      baselineVram: data.baseline.phase6?.vram ?? '-',
      diffs: row.postBootDiffs.length,
      firstDiff: row.postBootDiffs[0]?.name ?? '-',
    }));

  const staticRows = [
    { pc: '0x040BF0', note: 'Lifted owner block writes D0301B; the observed change is visible at the next block.' },
    { pc: '0x040C10', note: 'First post-store block from Phase887; stopping before it changed Phase 6 VRAM to 8549.' },
    { pc: '0x09EFDE', note: 'Large display-clear loop in the post-store tail; useful visual-settle landmark.' },
    { pc: '0x09DEE0', note: 'MEM_INIT entry reached after the display-clear loop.' },
    { pc: '0x08A98F', note: 'First observed post-MEM_INIT VAT pointer update site in the owner tail.' },
    { pc: '0x04C8A3', note: 'Current full owner leg cap helper; baseline maxes out here after 60K steps.' },
  ];

  return [
    '# Phase 888: Post-0x040C10 Visual-Settle Stop Trace',
    '',
    'Probe: `probe-phase888-visual-settle-stop-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase888-visual-settle-stop-trace.mjs`',
    '',
    'Serves a temporary instrumented copy of `browser-shell.html`; the disk browser shell is not edited.',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Baseline owner leg: ${data.baseline.naturalOwner.termination} after ${data.baseline.naturalOwner.steps} steps at ${data.baseline.naturalOwner.lastPc}; Phase 6 ${data.baseline.phase6.termination} at ${data.baseline.phase6.lastPc}, VRAM=${data.baseline.phase6.vram}.`,
    `- Candidates tested: ${data.evaluations.length}.`,
    `- Earliest safe candidate: ${data.safeCandidate ? `${data.safeCandidate.label} (${data.safeCandidate.config.stopBeforePc}, hit ${data.safeCandidate.config.requiredHits ?? 1})` : 'none found in this ordered set'}.`,
    `- Adjudication: ${data.conclusion}`,
    '',
    '## Candidate Comparison',
    '',
    table(scenarioRows, [
      { label: 'Scenario', value: (row) => row.label },
      { label: 'Stop before', value: (row) => row.stop },
      { label: 'Hits', value: (row) => row.hits },
      { label: 'Owner result', value: (row) => row.owner },
      { label: 'D0301B', value: (row) => row.d0301b },
      { label: 'Phase 6', value: (row) => row.phase6 },
      { label: 'VRAM', value: (row) => row.vram },
      { label: 'Diffs', value: (row) => row.diffs },
      { label: 'Safe', value: (row) => row.safe },
    ]),
    '',
    '## Unsafe Candidate Notes',
    '',
    table(unsafeRows, [
      { label: 'Scenario', value: (row) => row.label },
      { label: 'VRAM', value: (row) => row.vram },
      { label: 'Baseline VRAM', value: (row) => row.baselineVram },
      { label: 'Field diffs', value: (row) => row.diffs },
      { label: 'First diff', value: (row) => row.firstDiff },
    ]),
    '',
    '## Baseline Target Counts',
    '',
    table(targetRows, [
      { label: 'Target', value: (row) => row.name },
      { label: 'Hits', value: (row) => row.count },
      { label: 'First PC', value: (row) => row.first },
      { label: 'Prev PC', value: (row) => row.prev },
    ]),
    '',
    '## Static Notes',
    '',
    table(staticRows, [
      { label: 'PC', value: (row) => row.pc },
      { label: 'Note', value: (row) => row.note },
    ]),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  const { baseline, candidates } = await runBrowserProbe();
  const evaluations = candidates.map((candidate) => ({
    candidate,
    ...isSafeCandidate(baseline, candidate),
  }));
  const safeEvaluation = evaluations.find((row) => row.safe) ?? null;
  const safeCandidate = safeEvaluation?.candidate ?? null;

  const baselineCapObserved = baseline.naturalOwner?.termination === 'max_steps'
    && baseline.naturalOwner?.lastPc === hex(0x04C8A3);
  const baselinePhase6Accepted = baseline.phase6?.termination === 'halt'
    && baseline.phase6?.lastPc === hex(ACCEPTED_PHASE6_HALT)
    && baseline.phase6?.vram === 8482;
  const diagnosticComplete = baselineCapObserved
    && baselinePhase6Accepted
    && evaluations.length > 0
    && evaluations.every((row) => row.candidate.naturalOwner?.afterD0301B === hex(D0301B_MAGIC))
    && evaluations.every((row) => row.candidate.phase6?.termination === 'halt')
    && evaluations.every((row) => row.candidate.phase6?.lastPc === hex(ACCEPTED_PHASE6_HALT));

  const conclusion = safeCandidate
    ? `The earliest tested safe stop is ${safeCandidate.label}: stop before ${safeCandidate.config.stopBeforePc} on hit ${safeCandidate.config.requiredHits ?? 1}. It preserves D0301B, keeps zero watched post-boot field mismatches, and restores Phase 6 to the accepted baseline VRAM=${baseline.phase6.vram}.`
    : `No tested post-0x040C10 stop restored the accepted Phase 6 baseline. All completed candidates preserved D0301B and halted at 0x0019B5, but each still changed Phase 6 VRAM and/or watched fields relative to the full 60K owner leg.`;

  return {
    pass: Boolean(diagnosticComplete),
    conclusion,
    baselineCapObserved,
    baselinePhase6Accepted,
    diagnosticComplete: Boolean(diagnosticComplete),
    safeCandidate: safeCandidate ? {
      label: safeCandidate.label,
      config: safeCandidate.config,
      naturalOwner: safeCandidate.naturalOwner,
      phase6: safeCandidate.phase6,
    } : null,
    baseline,
    candidates,
    evaluations,
  };
}

let summary;
try {
  summary = await runProbe();
  fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
  console.log(JSON.stringify({
    pass: summary.pass,
    report: path.relative(process.cwd(), REPORT_PATH),
    baselineOwner: summary.baseline.naturalOwner,
    baselinePhase6: summary.baseline.phase6,
    candidatesTested: summary.evaluations.length,
    safeCandidate: summary.safeCandidate,
    candidateResults: summary.evaluations.map((row) => ({
      label: row.candidate.label,
      stopBeforePc: row.candidate.config.stopBeforePc,
      requiredHits: row.candidate.config.requiredHits,
      owner: row.candidate.naturalOwner,
      phase6: row.candidate.phase6,
      postBootDiffs: row.postBootDiffs.length,
      safe: row.safe,
    })),
    conclusion: summary.conclusion,
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { pass: false, error: String(error?.stack || error) };
  try {
    fs.writeFileSync(REPORT_PATH, `${buildReport({
      pass: false,
      conclusion: 'Probe failed before completing the browser stop trace.',
      baseline: { label: 'baseline', naturalOwner: {}, ownerTrace: {}, phase6: {}, snapshot: {} },
      candidates: [],
      evaluations: [],
      safeCandidate: null,
      error: summary.error,
    })}\n\n\`\`\`text\n${summary.error}\n\`\`\`\n`);
  } catch {}
  console.error(summary.error);
  process.exitCode = 1;
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase892-d008e0-natural-lifetime.md');
const CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const RAM_BASE = 0xD00000;
const D008E0 = 0xD008E0;
const SCREEN_STACK_TOP = 0xD1A87E;
const ORACLE_D008E0 = SCREEN_STACK_TOP - 18;
const debugPort = 9892 + Math.floor(Math.random() * 200);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase892-d008e0-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const KEY = Object.freeze({
  code: 'Escape',
  key: 'Escape',
  vk: 27,
});

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

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

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

function readCaptureStack(start, count = 6) {
  const capture = fs.readFileSync(CAPTURE_PATH);
  return Array.from({ length: count }, (_, index) => {
    const addr = start + index * 3;
    return { addr, value: readCaptureValue(capture, addr, 3) };
  });
}

function formatFields(fields) {
  if (!fields) return null;
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, value == null ? null : hex(value, valueWidth(name))]),
  );
}

function formatStack(stack) {
  return (stack ?? []).map((slot) => ({
    addr: hex(slot.addr),
    value: slot.value == null ? null : hex(slot.value),
  }));
}

function formatChange(change) {
  return {
    ...change,
    before: change.before == null ? null : hex(change.before),
    after: change.after == null ? null : hex(change.after),
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
    sha256,
    replayNames,
    stableReplayIncludesD008E0: replayNames.includes('D008E0'),
    hasOraclePrepareWrite: /evalWrite24\(mem,\s*0xD008E0,\s*SCREEN_STACK_TOP\s*-\s*18\)/.test(source),
    hasOtherD008E0CpuSpWrites: /evalWrite24\(mem,\s*0xD008E0,\s*cpu\.sp\)/.test(source),
    hasD0301BForce: /evalWrite24\(mem,\s*0xD0301B,\s*0x5AA55A\)/.test(source),
    hasNaturalOwnerStop: /const COLDBOOT_D0301B_OWNER_STOP_BEFORE = 0x09DEE0;/.test(source),
  };
}

function instrumentBrowserShell(sourceHtml) {
  let html = sourceHtml;
  const evalReadMarker = `function evalRead24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function evalRunCreateReal`;
  const p5Start = "  const p5 = executor.runFrom(COLDBOOT_LAUNCH_HOME_INIT, 'adl', {";
  const p5OnBlock = '    onBlock(pc) {\n      if (coldbootVatSnapshot || (pc & 0xFFFFFF) !== 0x001879) return;';
  const snapshotLine = '      coldbootVatSnapshot = COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field, readColdbootReplayField(field)]);';
  const p5Total = '  totalSteps += p5.steps;';
  const beforeOwner = '    const d0301bBeforeOwner = evalRead24(mem, 0xD0301B);';
  const ownerOnBlock = '        onBlock(pc, mode, meta, steps) {\n          if ((pc & 0xFFFFFF) !== COLDBOOT_D0301B_OWNER_STOP_BEFORE) return;';
  const ownerTotal = '    totalSteps += owner.steps;';
  const replayStart = '  if (coldbootVatSnapshot) {\n    for (const [field, value] of coldbootVatSnapshot) writeColdbootReplayField(field, value);';
  const phase6Prepare = `  peripherals?.setTimerEnabled?.(true);
  prepareColdbootEventFrame();
  log(\`<span class="info">--- Coldboot Phase 6: Home repaint`;
  const p6Run = "  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });";
  const p6Total = '  totalSteps += p6.steps;';
  const editSeedStart = '  (function seedColdbootEditContext() {';
  const editSeedEnd = '    mem[0xD1A8C0] = 0x0C; mem[0xD1A8C1] = 0x00; mem[0xD1A8C2] = 0x07;\n  })();';
  const uiClearCall = '          uiClearResult = applyColdbootUiLevelClear();';

  for (const marker of [
    evalReadMarker,
    p5Start,
    p5OnBlock,
    snapshotLine,
    p5Total,
    beforeOwner,
    ownerOnBlock,
    ownerTotal,
    replayStart,
    phase6Prepare,
    p6Run,
    p6Total,
    editSeedStart,
    editSeedEnd,
    uiClearCall,
  ]) {
    if (!html.includes(marker)) throw new Error(`Phase892 instrumentation marker not found: ${marker.slice(0, 80)}`);
  }

  const instrumentation = String.raw`
const PHASE892_D008E0_ADDR = 0xD008E0;
const PHASE892_ORACLE_D008E0 = SCREEN_STACK_TOP - 18;
const PHASE892_FIELDS = Object.freeze([
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
const PHASE892_TARGETS = Object.freeze({
  stableSnapshot001879: 0x001879,
  stableWipe0018F8: 0x0018F8,
  pushErr091A: 0x061DEF,
  popErr061E27: 0x061E27,
  naturalOwner0454BE: 0x0454BE,
  ownerStop09DEE0: 0x09DEE0,
  phase6Repaint058241: 0x058241,
  keyCxMain0585E9: 0x0585E9,
  clearAnchor0A229D: 0x0A229D,
});

function phase892ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase892ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE892_FIELDS.map(([name, addr, len]) => [name, phase892ReadValue(mem, addr, len)]));
}

function phase892ReadStack(start, count = 6) {
  if (!cpu?.memory || !start) return [];
  return Array.from({ length: count }, (_, index) => {
    const addr = (start + index * 3) & 0xFFFFFF;
    return { addr, value: phase892ReadValue(cpu.memory, addr, 3) };
  });
}

function phase892Capture(label) {
  const fields = phase892ReadFields();
  const errSp = fields?.D008E0 ?? 0;
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
    fields,
    errSpStack: phase892ReadStack(errSp),
    cpuStack: phase892ReadStack(cpu?.sp ?? 0),
    vram: countVRAMPixels?.() ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    status: document.getElementById('status')?.textContent ?? null,
  };
}

function phase892CreateRecord(name) {
  return {
    name,
    active: false,
    blockCount: 0,
    prevPc: null,
    lastD008E0: null,
    start: null,
    end: null,
    d008e0Changes: [],
    jsWrites: [],
    targetCounts: Object.fromEntries(Object.keys(PHASE892_TARGETS).map((key) => [key, 0])),
    targetFirst: {},
  };
}

window.__phase892 = {
  records: {},
  phaseStack: [],
  helperCallCount: 0,
  keyActive: false,
  snapshots: {},
  jsWrites: [],
  errors: [],
  capture: phase892Capture,
  currentPhase() {
    return this.phaseStack[this.phaseStack.length - 1] ?? null;
  },
  beginPhase(name) {
    const record = this.records[name] ?? phase892CreateRecord(name);
    record.active = true;
    record.blockCount = 0;
    record.prevPc = null;
    record.lastD008E0 = phase892ReadFields()?.D008E0 ?? null;
    record.start = phase892Capture(name + ':start');
    record.end = null;
    this.records[name] = record;
    this.phaseStack.push(name);
    return record.start;
  },
  endPhase(name) {
    const record = this.records[name];
    if (!record) return null;
    record.active = false;
    record.end = phase892Capture(name + ':end');
    const index = this.phaseStack.lastIndexOf(name);
    if (index >= 0) this.phaseStack.splice(index, 1);
    return record.end;
  },
  recordJsWrite(source, addr, before, after) {
    if ((addr & 0xFFFFFF) !== PHASE892_D008E0_ADDR) return;
    const phase = this.currentPhase() ?? 'unscoped-js';
    const row = {
      source,
      phase,
      before,
      after,
      stack: phase892Capture(source),
    };
    this.jsWrites.push(row);
    const record = this.records[phase] ?? phase892CreateRecord(phase);
    record.jsWrites.push(row);
    this.records[phase] = record;
    for (const activeName of this.phaseStack) {
      const activeRecord = this.records[activeName];
      if (activeRecord?.active) activeRecord.lastD008E0 = after;
    }
  },
  observe(name, pc) {
    const record = this.records[name] ?? phase892CreateRecord(name);
    if (!record.active) {
      record.active = true;
      record.lastD008E0 = phase892ReadFields()?.D008E0 ?? null;
      record.start = phase892Capture(name + ':implicit-start');
      this.records[name] = record;
    }
    const addr = pc & 0xFFFFFF;
    record.blockCount += 1;
    for (const [targetName, targetPc] of Object.entries(PHASE892_TARGETS)) {
      if (addr !== targetPc) continue;
      record.targetCounts[targetName] += 1;
      if (!record.targetFirst[targetName]) {
        record.targetFirst[targetName] = {
          block: record.blockCount,
          pc: addr,
          prevPc: record.prevPc,
          snapshot: phase892Capture(targetName),
        };
      }
    }
    const value = phase892ReadFields()?.D008E0 ?? null;
    if (record.lastD008E0 !== null && value !== record.lastD008E0) {
      record.d008e0Changes.push({
        phase: name,
        block: record.blockCount,
        before: record.lastD008E0,
        after: value,
        pc: addr,
        prevPc: record.prevPc,
        snapshot: phase892Capture('d008e0-change'),
      });
    }
    record.lastD008E0 = value;
    record.prevPc = addr;
  },
};

window.addEventListener('error', (event) => {
  window.__phase892?.errors?.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase892?.errors?.push(String(event.reason || event));
});

const phase892OriginalEvalWrite24 = evalWrite24;
evalWrite24 = function phase892EvalWrite24(mem, addr, val) {
  const before = (addr & 0xFFFFFF) === PHASE892_D008E0_ADDR ? phase892ReadValue(mem, addr, 3) : null;
  const result = phase892OriginalEvalWrite24(mem, addr, val);
  if ((addr & 0xFFFFFF) === PHASE892_D008E0_ADDR) window.__phase892?.recordJsWrite('evalWrite24', addr, before, phase892ReadValue(mem, addr, 3));
  return result;
};

const phase892OriginalWriteMemoryFieldValue = writeMemoryFieldValue;
writeMemoryFieldValue = function phase892WriteMemoryFieldValue(mem, addr, len, value) {
  const before = (addr & 0xFFFFFF) === PHASE892_D008E0_ADDR ? phase892ReadValue(mem, addr, len) : null;
  const result = phase892OriginalWriteMemoryFieldValue(mem, addr, len, value);
  if ((addr & 0xFFFFFF) === PHASE892_D008E0_ADDR) window.__phase892?.recordJsWrite('writeMemoryFieldValue', addr, before, phase892ReadValue(mem, addr, len));
  return result;
};

const phase892OriginalPrepareColdbootEventFrame = prepareColdbootEventFrame;
prepareColdbootEventFrame = function phase892PrepareColdbootEventFrame() {
  const call = ++window.__phase892.helperCallCount;
  const label = call === 1 ? 'phase6-prepare-event-frame' : call === 2 ? 'key-prepare-event-frame' : 'prepare-event-frame-' + call;
  window.__phase892.beginPhase(label);
  window.__phase892.snapshots[label + ':before'] = phase892Capture(label + ':before');
  const result = phase892OriginalPrepareColdbootEventFrame.apply(this, arguments);
  window.__phase892.snapshots[label + ':after'] = phase892Capture(label + ':after');
  window.__phase892.endPhase(label);
  return result;
};

const phase892OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase892ObserveColdbootPersistenceBlock(state, pc) {
  if (window.__phase892?.keyActive) window.__phase892.observe('key-route', pc);
  return phase892OriginalObserveColdbootPersistenceBlock(state, pc);
};

const phase892OriginalApplyColdbootUiLevelClear = applyColdbootUiLevelClear;
applyColdbootUiLevelClear = function phase892ApplyColdbootUiLevelClear() {
  window.__phase892.beginPhase('ui-clear');
  window.__phase892.snapshots.beforeUiClear = phase892Capture('beforeUiClear');
  const result = phase892OriginalApplyColdbootUiLevelClear.apply(this, arguments);
  window.__phase892.snapshots.afterUiClear = phase892Capture('afterUiClear');
  window.__phase892.endPhase('ui-clear');
  return result;
};
`;

  html = html.replace(evalReadMarker, `function evalRead24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

${instrumentation}

function evalRunCreateReal`);
  html = html.replace(p5Start, `  window.__phase892?.beginPhase('p5-launch-home');\n  window.__phase892.snapshots.beforeP5 = window.__phase892.capture('beforeP5');\n${p5Start}`);
  html = html.replace(p5OnBlock, `    onBlock(pc) {\n      window.__phase892?.observe('p5-launch-home', pc);\n      if (coldbootVatSnapshot || (pc & 0xFFFFFF) !== 0x001879) return;`);
  html = html.replace(snapshotLine, `${snapshotLine}\n      window.__phase892.snapshots.stableSnapshotHit = window.__phase892.capture('stableSnapshotHit');`);
  html = html.replace(p5Total, `${p5Total}\n  window.__phase892.snapshots.afterP5 = window.__phase892.capture('afterP5');\n  window.__phase892?.endPhase('p5-launch-home');`);
  html = html.replace(beforeOwner, `    window.__phase892?.beginPhase('phase5b-natural-d0301b-owner');\n    window.__phase892.snapshots.beforeNaturalD0301BOwner = window.__phase892.capture('beforeNaturalD0301BOwner');\n${beforeOwner}`);
  html = html.replace(ownerOnBlock, `        onBlock(pc, mode, meta, steps) {\n          window.__phase892?.observe('phase5b-natural-d0301b-owner', pc);\n          if ((pc & 0xFFFFFF) !== COLDBOOT_D0301B_OWNER_STOP_BEFORE) return;`);
  html = html.replace(ownerTotal, `${ownerTotal}\n    window.__phase892.snapshots.afterNaturalD0301BOwner = window.__phase892.capture('afterNaturalD0301BOwner');\n    window.__phase892?.endPhase('phase5b-natural-d0301b-owner');`);
  html = html.replace(replayStart, `  if (coldbootVatSnapshot) {\n    window.__phase892?.beginPhase('stable-replay');\n    window.__phase892.snapshots.beforeStableReplay = window.__phase892.capture('beforeStableReplay');\n    for (const [field, value] of coldbootVatSnapshot) writeColdbootReplayField(field, value);\n    window.__phase892.snapshots.afterStableReplay = window.__phase892.capture('afterStableReplay');\n    window.__phase892?.endPhase('stable-replay');`);
  html = html.replace(phase6Prepare, `  peripherals?.setTimerEnabled?.(true);\n  prepareColdbootEventFrame();\n  window.__phase892?.beginPhase('phase6-repaint');\n  log(\`<span class="info">--- Coldboot Phase 6: Home repaint`);
  html = html.replace(p6Run, `  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', {\n    maxSteps: 300000,\n    maxLoopIterations: 30000,\n    onBlock(pc) { window.__phase892?.observe('phase6-repaint', pc); },\n  });`);
  html = html.replace(p6Total, `${p6Total}\n  window.__phase892.snapshots.afterPhase6Run = window.__phase892.capture('afterPhase6Run');\n  window.__phase892?.endPhase('phase6-repaint');`);
  html = html.replace(editSeedStart, `  window.__phase892?.beginPhase('edit-context-seed');\n  window.__phase892.snapshots.beforeEditSeed = window.__phase892.capture('beforeEditSeed');\n${editSeedStart}`);
  html = html.replace(editSeedEnd, `${editSeedEnd}\n  window.__phase892.snapshots.afterEditSeed = window.__phase892.capture('afterEditSeed');\n  window.__phase892?.endPhase('edit-context-seed');`);
  html = html.replace(uiClearCall, `          window.__phase892.snapshots.beforeUiClearCall = window.__phase892.capture('beforeUiClearCall');\n${uiClearCall}`);
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

function formatSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    lastPc: snapshot.lastPc == null ? null : hex(snapshot.lastPc),
    fields: formatFields(snapshot.fields),
    errSpStack: formatStack(snapshot.errSpStack),
    cpuStack: formatStack(snapshot.cpuStack),
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
    d008e0Changes: (record.d008e0Changes ?? []).map((change) => ({
      ...formatChange(change),
      snapshot: formatSnapshot(change.snapshot),
    })),
    jsWrites: (record.jsWrites ?? []).map((write) => ({
      source: write.source,
      phase: write.phase,
      before: hex(write.before),
      after: hex(write.after),
      stack: formatSnapshot(write.stack),
    })),
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
    jsWrites: (state.jsWrites ?? []).map((write) => ({
      source: write.source,
      phase: write.phase,
      before: hex(write.before),
      after: hex(write.after),
      stack: formatSnapshot(write.stack),
    })),
  };
}

function stackMatches(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) return false;
  return actual.every((slot, index) => slot.value === expected[index].value);
}

function table(rows, columns) {
  if (!rows.length) return 'No rows.';
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function buildTimelineRows(rawState, oracleFields, oracleStack) {
  const points = [
    ['real after-CLEAR oracle', { fields: oracleFields, stack: oracleStack, source: 'capture' }],
    ['before Phase5', { snap: rawState.snapshots?.beforeP5, source: 'browser natural' }],
    ['stable snapshot @0x001879', { snap: rawState.snapshots?.stableSnapshotHit, source: 'browser natural' }],
    ['after Phase5', { snap: rawState.snapshots?.afterP5, source: 'browser natural after wipe' }],
    ['before D0301B owner', { snap: rawState.snapshots?.beforeNaturalD0301BOwner, source: 'browser natural' }],
    ['after D0301B owner', { snap: rawState.snapshots?.afterNaturalD0301BOwner, source: 'browser natural owner' }],
    ['before stable replay', { snap: rawState.snapshots?.beforeStableReplay, source: 'browser replay boundary' }],
    ['after stable replay', { snap: rawState.snapshots?.afterStableReplay, source: 'browser replay boundary' }],
    ['after Phase6 event-frame helper', { snap: rawState.snapshots?.['phase6-prepare-event-frame:after'], source: 'JS helper' }],
    ['after Phase6 repaint', { snap: rawState.snapshots?.afterPhase6Run, source: 'browser natural repaint' }],
    ['after edit seed', { snap: rawState.snapshots?.afterEditSeed, source: 'browser seed' }],
    ['after key event-frame helper', { snap: rawState.snapshots?.['key-prepare-event-frame:after'], source: 'JS helper' }],
    ['before UI clear / at 0x0A229D', { snap: rawState.snapshots?.beforeUiClear, source: 'browser key route' }],
    ['after UI clear', { snap: rawState.snapshots?.afterUiClear, source: 'browser UI clear' }],
    ['after key route', { snap: rawState.snapshots?.afterKey, source: 'browser key route' }],
  ];
  return points.map(([point, data]) => {
    const fields = data.fields ?? data.snap?.fields ?? null;
    const stack = data.stack ?? data.snap?.errSpStack ?? null;
    return {
      point,
      source: data.source,
      d008e0: fields?.D008E0 ?? null,
      cpuSp: data.snap?.cpu?.sp ?? null,
      stack,
      d008e0Oracle: fields?.D008E0 === oracleFields.D008E0,
      stackOracle: stackMatches(stack, oracleStack),
    };
  });
}

function timelineTable(rows) {
  return table(rows, [
    { label: 'Point', value: (row) => row.point },
    { label: 'Source', value: (row) => row.source },
    { label: 'D008E0', value: (row) => row.d008e0 == null ? '-' : hex(row.d008e0) },
    { label: 'CPU SP', value: (row) => row.cpuSp == null ? '-' : hex(row.cpuSp) },
    { label: 'D008E0 oracle', value: (row) => row.d008e0Oracle ? 'yes' : 'NO' },
    { label: 'errSP stack oracle', value: (row) => row.stackOracle ? 'yes' : 'NO' },
  ]);
}

function changeTable(rows) {
  return table(rows, [
    { label: 'Phase', value: (row) => row.phase },
    { label: 'Block', value: (row) => String(row.block ?? '-') },
    { label: 'Before', value: (row) => row.before },
    { label: 'After', value: (row) => row.after },
    { label: 'PC', value: (row) => row.pc },
    { label: 'Prev PC', value: (row) => row.prevPc },
  ]);
}

function jsWriteTable(rows) {
  return table(rows, [
    { label: 'Phase', value: (row) => row.phase },
    { label: 'Source', value: (row) => row.source },
    { label: 'Before', value: (row) => row.before },
    { label: 'After', value: (row) => row.after },
  ]);
}

function stackTable(stack) {
  return table(stack, [
    { label: 'Address', value: (row) => row.addr },
    { label: '3-byte value', value: (row) => row.value },
  ]);
}

function buildAnalysis(rawState, oracleFields, oracleStack, sourceEvidence, pageState) {
  const records = rawState.records ?? {};
  const allNaturalChanges = Object.values(records)
    .flatMap((record) => record.d008e0Changes ?? [])
    .filter((change) => change.after === ORACLE_D008E0);
  const helperOracleWrites = (rawState.jsWrites ?? [])
    .filter((write) => write.after === ORACLE_D008E0);
  const replayWrites = (rawState.jsWrites ?? [])
    .filter((write) => write.phase === 'stable-replay');
  const p5ChangeValues = (records['p5-launch-home']?.d008e0Changes ?? []).map((change) => change.after);
  const p5WipesD008E0 = p5ChangeValues.includes(0);
  const p5StableValue = rawState.snapshots?.stableSnapshotHit?.fields?.D008E0 ?? null;
  const afterP5Value = rawState.snapshots?.afterP5?.fields?.D008E0 ?? null;
  const afterReplayValue = rawState.snapshots?.afterStableReplay?.fields?.D008E0 ?? null;
  const afterPhase6Value = rawState.snapshots?.afterPhase6Run?.fields?.D008E0 ?? null;
  const afterKeyHelper = rawState.snapshots?.['key-prepare-event-frame:after'] ?? null;
  const beforeUiClear = rawState.snapshots?.beforeUiClear ?? null;
  const afterUiClear = rawState.snapshots?.afterUiClear ?? null;
  const afterKey = rawState.snapshots?.afterKey ?? null;
  const keyStackMatchesOracle = stackMatches(beforeUiClear?.errSpStack, oracleStack)
    || stackMatches(afterUiClear?.errSpStack, oracleStack)
    || stackMatches(afterKey?.errSpStack, oracleStack);
  const cleanBrowser = (rawState.errors ?? []).length === 0
    && pageState.phase6?.termination === 'halt'
    && pageState.phase6?.lastPc === 0x0019B5
    && pageState.phase6?.vatSnapshotCaptured === true
    && pageState.owner?.afterD0301B === 0x5AA55A
    && pageState.lastKey?.code === KEY.code
    && pageState.lastKey?.termination === 'control_pre_stop'
    && pageState.lastKey?.uiClearApplied === true;
  const pass = cleanBrowser
    && sourceEvidence.hasOraclePrepareWrite
    && sourceEvidence.stableReplayIncludesD008E0
    && helperOracleWrites.length >= 2
    && allNaturalChanges.length === 0
    && p5StableValue === SCREEN_STACK_TOP - 24
    && afterP5Value === 0
    && afterReplayValue === SCREEN_STACK_TOP - 24
    && afterPhase6Value === 0
    && afterKeyHelper?.fields?.D008E0 === ORACLE_D008E0
    && beforeUiClear?.fields?.D008E0 === ORACLE_D008E0
    && afterUiClear?.fields?.D008E0 === ORACLE_D008E0;
  const conclusion = pass
    ? 'No natural post-wipe browser route establishes D008E0=0xD1A86C. Phase 5 naturally cycles D008E0 and captures 0xD1A866 at the 0x001879 snapshot, then 0x0018F8 wipes it. Stable replay restores 0xD1A866, Phase 6 repaint zeros it again, and the only observed 0xD1A86C writes are prepareColdbootEventFrame() helper writes before Phase 6 and before the CLEAR key route. The D008E0 field matches the oracle at CLEAR, but the live errSP stack slots are not the raw realram error-frame stack.'
    : 'The D008E0 lifetime trace did not match the expected helper-only oracle-write pattern; inspect the machine JSON.';
  return {
    pass,
    cleanBrowser,
    naturalOracleD008E0Writes: allNaturalChanges.length,
    helperOracleD008E0Writes: helperOracleWrites.length,
    stableReplayD008E0Writes: replayWrites.length,
    p5WipesD008E0,
    p5StableValue,
    afterP5Value,
    afterReplayValue,
    afterPhase6Value,
    keyStackMatchesOracle,
    conclusion,
  };
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 892: Natural D008E0 / Stack-Frame Lifetime Trace',
      '',
      'Probe failed before producing a complete audit.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const naturalChanges = Object.values(data.state.records ?? {})
    .flatMap((record) => record.d008e0Changes ?? []);
  return [
    '# Phase 892: Natural D008E0 / Stack-Frame Lifetime Trace',
    '',
    'Probe: `probe-phase892-d008e0-natural-lifetime.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase892-d008e0-natural-lifetime.mjs`',
    '',
    'Serves a temporary observation-only copy of the real `browser-shell.html`, boots coldboot mode in headless Chrome, traces `D008E0` and errSP stack slots across Phase 5, Phase 5b, stable replay, Phase 6, the key event-frame helper, and Escape/CLEAR, then compares against `captures/realram-home-afterCLEAR-D00000-D657FF.bin`.',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}.`,
    `- Browser execution clean: ${data.analysis.cleanBrowser ? 'yes' : 'NO'}.`,
    `- Natural D008E0 writes to oracle 0xD1A86C: ${data.analysis.naturalOracleD008E0Writes}.`,
    `- Helper D008E0 writes to oracle 0xD1A86C: ${data.analysis.helperOracleD008E0Writes}.`,
    `- Stable replay D008E0 writes: ${data.analysis.stableReplayD008E0Writes}.`,
    `- Live CLEAR errSP stack matches raw oracle stack: ${data.analysis.keyStackMatchesOracle ? 'yes' : 'NO'}.`,
    `- Adjudication: ${data.analysis.conclusion}`,
    '',
    '## Source Evidence',
    '',
    `- Source SHA-256: \`${data.sourceEvidence.sha256}\``,
    `- Stable replay includes D008E0: ${data.sourceEvidence.stableReplayIncludesD008E0 ? 'yes' : 'NO'}.`,
    `- ` + `prepareColdbootEventFrame()` + ` writes ` + '`SCREEN_STACK_TOP - 18`' + `: ${data.sourceEvidence.hasOraclePrepareWrite ? 'yes' : 'NO'}.`,
    `- Other source writes of ` + '`D008E0=cpu.sp`' + ` exist outside the current helper: ${data.sourceEvidence.hasOtherD008E0CpuSpWrites ? 'yes' : 'no'}.`,
    `- Manual D0301B force is absent: ${!data.sourceEvidence.hasD0301BForce ? 'yes' : 'NO'}.`,
    '',
    '## D008E0 Timeline',
    '',
    timelineTable(data.timelineRows),
    '',
    '## Natural Block-Observed D008E0 Changes',
    '',
    changeTable(naturalChanges),
    '',
    '## JS-Owned D008E0 Writes',
    '',
    jsWriteTable(data.state.jsWrites ?? []),
    '',
    '## Raw Oracle errSP Stack',
    '',
    stackTable(data.oracleErrSpStack),
    '',
    '## Live CLEAR errSP Stack at 0x0A229D',
    '',
    stackTable(data.timelineRows.find((row) => row.point === 'before UI clear / at 0x0A229D')?.stack ?? []),
    '',
    '## Target Counts',
    '',
    table(Object.values(data.state.records ?? {}), [
      { label: 'Phase', value: (row) => row.name },
      { label: '0x001879', value: (row) => String(row.targetCounts?.stableSnapshot001879 ?? 0) },
      { label: '0x0018F8', value: (row) => String(row.targetCounts?.stableWipe0018F8 ?? 0) },
      { label: '0x061DEF', value: (row) => String(row.targetCounts?.pushErr091A ?? 0) },
      { label: '0x061E27', value: (row) => String(row.targetCounts?.popErr061E27 ?? 0) },
      { label: '0x0A229D', value: (row) => String(row.targetCounts?.clearAnchor0A229D ?? 0) },
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
      oracleErrSpStack: data.oracleErrSpStack,
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
  const oracleErrSpStackRaw = readCaptureStack(oracleFields.D008E0);

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
  await waitFor(ws, '!!window.__phase892 && !!window.__coldbootReadEditLineState', 'phase892 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`, 30000);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(150);

  const afterBoot = await evalExpr(ws, `window.__phase892.capture('afterBootEval')`, 30000);
  await evalExpr(ws, `(() => {
    window.__phase892.snapshots.beforeKey = window.__phase892.capture('beforeKey');
    window.__phase892.beginPhase('key-route');
    window.__phase892.keyActive = true;
    return true;
  })()`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${KEY.code}'`, 'Escape/CLEAR completion', 90000);
  await sleep(150);
  await evalExpr(ws, `(() => {
    window.__phase892.keyActive = false;
    window.__phase892.endPhase('key-route');
    window.__phase892.snapshots.afterKey = window.__phase892.capture('afterKey');
    return true;
  })()`, 30000);

  const rawState = await evalExpr(ws, `(() => ({
    records: window.__phase892.records,
    snapshots: window.__phase892.snapshots,
    jsWrites: window.__phase892.jsWrites,
    helperCallCount: window.__phase892.helperCallCount,
    errors: window.__phase892.errors,
  }))()`, 30000);
  const pageState = await evalExpr(ws, `(() => ({
    phase6: window.__coldbootPhase6 ?? null,
    owner: window.__coldbootPhase6?.naturalD0301BOwner ?? window.__coldbootNaturalD0301BOwner ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    afterBoot: ${JSON.stringify(afterBoot)},
    status: document.getElementById('status')?.textContent ?? null,
    vram: countVRAMPixels?.() ?? null,
  }))()`, 30000);

  const analysis = buildAnalysis(rawState, oracleFields, oracleErrSpStackRaw, sourceEvidence, pageState);
  const timelineRowsRaw = buildTimelineRows(rawState, oracleFields, oracleErrSpStackRaw);
  const timelineRows = timelineRowsRaw.map((row) => ({
    ...row,
    stack: formatStack(row.stack),
  }));

  return {
    probe: 'phase892-d008e0-natural-lifetime',
    chromePath,
    pageUrl,
    pass: analysis.pass,
    analysis,
    sourceEvidence,
    oracleFields,
    oracleErrSpStack: formatStack(oracleErrSpStackRaw),
    pageState,
    timelineRows,
    state: formatState(rawState),
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    cleanBrowser: summary.analysis.cleanBrowser,
    naturalOracleD008E0Writes: summary.analysis.naturalOracleD008E0Writes,
    helperOracleD008E0Writes: summary.analysis.helperOracleD008E0Writes,
    stableReplayD008E0Writes: summary.analysis.stableReplayD008E0Writes,
    keyStackMatchesOracle: summary.analysis.keyStackMatchesOracle,
    conclusion: summary.analysis.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase892-d008e0-natural-lifetime', pass: false, error: String(error?.stack || error) };
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

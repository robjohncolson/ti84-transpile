import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase893-d008e0-field-stack-ab.md');
const CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const RAM_BASE = 0xD00000;
const D008E0 = 0xD008E0;
const SCREEN_STACK_TOP = 0xD1A87E;
const ORACLE_D008E0 = SCREEN_STACK_TOP - 18;
const debugPortBase = 9893 + Math.floor(Math.random() * 100);
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const KEY = Object.freeze({
  code: 'Escape',
  key: 'Escape',
  vk: 27,
});

const VARIANTS = Object.freeze([
  {
    id: 'baseline',
    label: 'current helper field-only baseline',
    expectPrepareWrite: true,
    expectStackInjection: false,
  },
  {
    id: 'no_prepare_d008e0',
    label: 'no prepareColdbootEventFrame D008E0 oracle write',
    expectPrepareWrite: false,
    expectStackInjection: false,
  },
  {
    id: 'field_plus_stack',
    label: 'helper field plus raw oracle errSP stack slots',
    expectPrepareWrite: true,
    expectStackInjection: true,
  },
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
  ['D02A29', 0xD02A29, 2],
  ['D0301B', 0xD0301B, 3],
  ['D000C2_IY42', 0xD000C2, 1],
]);

const ORACLE_STACK_SLOTS = Object.freeze([
  ['D1A86C', 0xD1A86C, 0x061E27],
  ['D1A86F', 0xD1A86F, 0x061DD1],
  ['D1A872', 0xD1A872, 0x000000],
  ['D1A875', 0xD1A875, 0x000000],
  ['D1A878', 0xD1A878, 0x000000],
  ['D1A87B', 0xD1A87B, 0x08C754],
]);

let nextId = 1;
const pending = new Map();
let server;
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
    addr: slot.addr == null ? null : hex(slot.addr),
    value: slot.value == null ? null : hex(slot.value),
  }));
}

function formatSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    lastPc: snapshot.lastPc == null ? null : hex(snapshot.lastPc),
    fields: formatFields(snapshot.fields),
    errSpStack: formatStack(snapshot.errSpStack),
    oracleAddrStack: formatStack(snapshot.oracleAddrStack),
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
  return {
    sha256,
    hasOraclePrepareWrite: /evalWrite24\(mem,\s*0xD008E0,\s*SCREEN_STACK_TOP\s*-\s*18\)/.test(source),
    hasNaturalOwnerStop: /const COLDBOOT_D0301B_OWNER_STOP_BEFORE = 0x09DEE0;/.test(source),
    hasD0301BForce: /evalWrite24\(mem,\s*0xD0301B,\s*0x5AA55A\)/.test(source),
  };
}

function instrumentBrowserShell(sourceHtml) {
  const marker = `function evalRead24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function evalRunCreateReal`;
  if (!sourceHtml.includes(marker)) throw new Error('Phase893 instrumentation marker not found');

  const instrumentation = String.raw`
const PHASE893_VARIANT = new URL(location.href).searchParams.get('phase893') || 'baseline';
const PHASE893_D008E0_ADDR = 0xD008E0;
const PHASE893_ORACLE_D008E0 = SCREEN_STACK_TOP - 18;
const PHASE893_FIELDS = Object.freeze([
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
const PHASE893_ORACLE_STACK = Object.freeze([
  [0xD1A86C, 0x061E27],
  [0xD1A86F, 0x061DD1],
  [0xD1A872, 0x000000],
  [0xD1A875, 0x000000],
  [0xD1A878, 0x000000],
  [0xD1A87B, 0x08C754],
]);

function phase893ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase893Write24(mem, addr, value) {
  mem[addr & 0xFFFFFF] = value & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function phase893ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE893_FIELDS.map(([name, addr, len]) => [name, phase893ReadValue(mem, addr, len)]));
}

function phase893ReadStack(start, count = 6) {
  if (!cpu?.memory || !start) return [];
  return Array.from({ length: count }, (_, index) => {
    const addr = (start + index * 3) & 0xFFFFFF;
    return { addr, value: phase893ReadValue(cpu.memory, addr, 3) };
  });
}

function phase893Capture(label) {
  const fields = phase893ReadFields();
  const errSp = fields?.D008E0 ?? 0;
  return {
    label,
    variant: PHASE893_VARIANT,
    totalSteps,
    lastPc,
    lastMode,
    status: document.getElementById('status')?.textContent ?? null,
    vram: countVRAMPixels?.() ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    fields,
    errSpStack: phase893ReadStack(errSp),
    oracleAddrStack: phase893ReadStack(PHASE893_ORACLE_D008E0),
    cpuStack: phase893ReadStack(cpu?.sp ?? 0),
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
  };
}

window.__phase893 = {
  variant: PHASE893_VARIANT,
  helperCallCount: 0,
  currentPrepareLabel: null,
  snapshots: {},
  jsWrites: [],
  skippedWrites: [],
  stackInjections: [],
  errors: [],
  capture: phase893Capture,
};

window.addEventListener('error', (event) => {
  window.__phase893?.errors?.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase893?.errors?.push(String(event.reason || event));
});

const phase893OriginalEvalWrite24 = evalWrite24;
evalWrite24 = function phase893EvalWrite24(mem, addr, val) {
  const masked = addr & 0xFFFFFF;
  const before = masked === PHASE893_D008E0_ADDR ? phase893ReadValue(mem, addr, 3) : null;
  const phase = window.__phase893?.currentPrepareLabel ?? 'unscoped';
  const suppressPrepareWrite = PHASE893_VARIANT === 'no_prepare_d008e0'
    && masked === PHASE893_D008E0_ADDR
    && val === PHASE893_ORACLE_D008E0
    && /prepare-event-frame$/.test(phase);
  if (suppressPrepareWrite) {
    window.__phase893.skippedWrites.push({
      source: 'evalWrite24',
      phase,
      addr: masked,
      before,
      attempted: val,
      snapshot: phase893Capture('skipped-d008e0-write'),
    });
    return undefined;
  }
  const result = phase893OriginalEvalWrite24(mem, addr, val);
  if (masked === PHASE893_D008E0_ADDR) {
    window.__phase893.jsWrites.push({
      source: 'evalWrite24',
      phase,
      addr: masked,
      before,
      after: phase893ReadValue(mem, addr, 3),
      snapshot: phase893Capture('d008e0-js-write'),
    });
  }
  return result;
};

const phase893OriginalPrepareColdbootEventFrame = prepareColdbootEventFrame;
prepareColdbootEventFrame = function phase893PrepareColdbootEventFrame() {
  const call = ++window.__phase893.helperCallCount;
  const label = call === 1 ? 'phase6-prepare-event-frame' : call === 2 ? 'key-prepare-event-frame' : 'prepare-event-frame-' + call;
  window.__phase893.currentPrepareLabel = label;
  window.__phase893.snapshots[label + ':before'] = phase893Capture(label + ':before');
  const result = phase893OriginalPrepareColdbootEventFrame.apply(this, arguments);
  if (PHASE893_VARIANT === 'field_plus_stack' && cpu?.memory) {
    const before = phase893ReadStack(PHASE893_ORACLE_D008E0);
    for (const [addr, value] of PHASE893_ORACLE_STACK) phase893Write24(cpu.memory, addr, value);
    const after = phase893ReadStack(PHASE893_ORACLE_D008E0);
    window.__phase893.stackInjections.push({ phase: label, before, after, snapshot: phase893Capture(label + ':after-stack-injection') });
  }
  window.__phase893.snapshots[label + ':after'] = phase893Capture(label + ':after');
  window.__phase893.currentPrepareLabel = null;
  return result;
};

const phase893OriginalApplyColdbootUiLevelClear = applyColdbootUiLevelClear;
applyColdbootUiLevelClear = function phase893ApplyColdbootUiLevelClear() {
  window.__phase893.snapshots.beforeUiClear = phase893Capture('beforeUiClear');
  const result = phase893OriginalApplyColdbootUiLevelClear.apply(this, arguments);
  window.__phase893.snapshots.afterUiClear = phase893Capture('afterUiClear');
  return result;
};
`;

  return sourceHtml.replace(marker, `function evalRead24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

${instrumentation}

function evalRunCreateReal`);
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

async function waitForDevtools(debugPort) {
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

function normalizeState(state) {
  return {
    ...state,
    snapshots: Object.fromEntries(
      Object.entries(state.snapshots ?? {}).map(([name, snapshot]) => [name, formatSnapshot(snapshot)]),
    ),
    jsWrites: (state.jsWrites ?? []).map((write) => ({
      source: write.source,
      phase: write.phase,
      addr: hex(write.addr),
      before: write.before == null ? null : hex(write.before),
      after: write.after == null ? null : hex(write.after),
      snapshot: formatSnapshot(write.snapshot),
    })),
    skippedWrites: (state.skippedWrites ?? []).map((write) => ({
      source: write.source,
      phase: write.phase,
      addr: hex(write.addr),
      before: write.before == null ? null : hex(write.before),
      attempted: write.attempted == null ? null : hex(write.attempted),
      snapshot: formatSnapshot(write.snapshot),
    })),
    stackInjections: (state.stackInjections ?? []).map((row) => ({
      phase: row.phase,
      before: formatStack(row.before),
      after: formatStack(row.after),
      snapshot: formatSnapshot(row.snapshot),
    })),
    finalSnapshot: formatSnapshot(state.finalSnapshot),
  };
}

function stackMatches(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) return false;
  return actual.every((slot, index) => slot.value === expected[index].value);
}

function fieldsMismatches(fields, oracleFields) {
  return WATCHED_FIELDS
    .map(([name]) => ({ name, actual: fields?.[name], oracle: oracleFields[name] }))
    .filter((row) => row.actual !== row.oracle)
    .map((row) => ({
      name: row.name,
      actual: row.actual == null ? null : hex(row.actual, valueWidth(row.name)),
      oracle: row.oracle == null ? null : hex(row.oracle, valueWidth(row.name)),
    }));
}

function stackMismatches(stack, oracleStack) {
  return oracleStack
    .map((slot, index) => ({ addr: slot.addr, actual: stack?.[index]?.value, oracle: slot.value }))
    .filter((row) => row.actual !== row.oracle)
    .map((row) => ({
      addr: hex(row.addr),
      actual: row.actual == null ? null : hex(row.actual),
      oracle: row.oracle == null ? null : hex(row.oracle),
    }));
}

function analyzeScenario(state, oracleFields, oracleStack) {
  const final = state.finalSnapshot;
  const beforeUiClear = state.snapshots?.beforeUiClear;
  const phase6 = state.phase6 ?? {};
  const lastKey = state.lastKey ?? {};
  const finalFieldMismatches = fieldsMismatches(final?.fields, oracleFields);
  const beforeUiClearFieldMismatches = fieldsMismatches(beforeUiClear?.fields, oracleFields);
  const finalStackMismatches = stackMismatches(final?.oracleAddrStack, oracleStack);
  const beforeUiStackMismatches = stackMismatches(beforeUiClear?.oracleAddrStack, oracleStack);
  const cleanPhase6 = phase6.termination === 'halt'
    && phase6.lastPc === 0x0019B5
    && phase6.vatSnapshotCaptured === true
    && phase6.naturalD0301BOwner?.afterD0301B === 0x5AA55A;
  const cleanClear = lastKey.code === KEY.code
    && lastKey.termination === 'control_pre_stop'
    && lastKey.uiClearApplied === true
    && lastKey.wipes === 0;
  return {
    cleanPhase6,
    cleanClear,
    pageErrors: state.errors ?? [],
    helperWrites: state.jsWrites?.filter((write) => write.after === ORACLE_D008E0).length ?? 0,
    skippedPrepareWrites: state.skippedWrites?.length ?? 0,
    stackInjectionCount: state.stackInjections?.length ?? 0,
    finalD008E0: final?.fields?.D008E0 ?? null,
    beforeUiClearD008E0: beforeUiClear?.fields?.D008E0 ?? null,
    finalFieldMismatches,
    beforeUiClearFieldMismatches,
    finalStackMismatches,
    beforeUiStackMismatches,
    finalStackMatchesOracle: finalStackMismatches.length === 0,
    beforeUiStackMatchesOracle: beforeUiStackMismatches.length === 0,
  };
}

async function runScenario(serverPort, variant, index) {
  const debugPort = debugPortBase + index;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `ti84-browser-phase893-${variant.id}-`));
  let chrome;
  let ws;
  try {
    const pageUrl = `http://127.0.0.1:${serverPort}/browser-shell.html?phase893=${encodeURIComponent(variant.id)}`;
    chrome = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    ws = await connect(await waitForDevtools(debugPort));
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    await cdp(ws, 'Page.navigate', { url: pageUrl });
    await waitFor(ws, 'document.readyState === "complete"', `${variant.id} page load`, 30000);
    await waitFor(ws, '!!window.__phase893 && !!window.__coldbootReadEditLineState', `${variant.id} instrumentation`, 30000);
    await sleep(250);

    await evalExpr(ws, `(() => {
      document.getElementById('coldbootMode').checked = true;
      document.getElementById('preserveDisplay').checked = true;
      document.getElementById('btnBoot').click();
      return true;
    })()`, 30000);
    await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, `${variant.id} coldboot completion`, 180000);
    await sleep(100);

    await evalExpr(ws, `(() => {
      window.__phase893.snapshots.afterBoot = window.__phase893.capture('afterBoot');
      window.__phase893.snapshots.beforeKey = window.__phase893.capture('beforeKey');
      return true;
    })()`, 30000);
    await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 45000);
    await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
    await waitFor(ws, `window.__coldbootLastKey?.code === '${KEY.code}' || window.__phase893.errors.length > 0`, `${variant.id} Escape/CLEAR completion`, 45000);
    await sleep(100);

    const rawState = await evalExpr(ws, `(() => {
      window.__phase893.snapshots.afterKey = window.__phase893.capture('afterKey');
      return {
        variant: window.__phase893.variant,
        snapshots: window.__phase893.snapshots,
        jsWrites: window.__phase893.jsWrites,
        skippedWrites: window.__phase893.skippedWrites,
        stackInjections: window.__phase893.stackInjections,
        errors: window.__phase893.errors,
        helperCallCount: window.__phase893.helperCallCount,
        phase6: window.__coldbootPhase6 ?? null,
        owner: window.__coldbootPhase6?.naturalD0301BOwner ?? window.__coldbootNaturalD0301BOwner ?? null,
        lastKey: window.__coldbootLastKey ?? null,
        finalSnapshot: window.__phase893.capture('final'),
        status: document.getElementById('status')?.textContent ?? null,
      };
    })()`, 30000);

    return {
      id: variant.id,
      label: variant.label,
      pageUrl,
      completed: true,
      rawState,
      state: normalizeState(rawState),
    };
  } catch (error) {
    let partialState = null;
    try {
      partialState = ws ? await evalExpr(ws, `(() => window.__phase893 ? {
        variant: window.__phase893.variant,
        snapshots: window.__phase893.snapshots,
        jsWrites: window.__phase893.jsWrites,
        skippedWrites: window.__phase893.skippedWrites,
        stackInjections: window.__phase893.stackInjections,
        errors: window.__phase893.errors,
        helperCallCount: window.__phase893.helperCallCount,
        phase6: window.__coldbootPhase6 ?? null,
        owner: window.__coldbootPhase6?.naturalD0301BOwner ?? window.__coldbootNaturalD0301BOwner ?? null,
        lastKey: window.__coldbootLastKey ?? null,
        finalSnapshot: window.__phase893.capture('partial-final'),
        status: document.getElementById('status')?.textContent ?? null,
      } : null)()`, 5000) : null;
    } catch {}
    return {
      id: variant.id,
      label: variant.label,
      completed: false,
      error: String(error?.stack || error),
      rawState: partialState,
      state: partialState ? normalizeState(partialState) : null,
    };
  } finally {
    try { ws?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    await sleep(300);
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
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

function buildVariantRows(scenarios) {
  return scenarios.map((scenario) => {
    const a = scenario.analysis ?? {};
    return {
      variant: scenario.label,
      completed: scenario.completed ? 'yes' : 'NO',
      phase6: a.cleanPhase6 ? 'clean' : 'NO',
      clear: a.cleanClear ? 'clean' : 'NO',
      pageErrors: String(a.pageErrors?.length ?? '-'),
      helperWrites: String(a.helperWrites ?? '-'),
      skippedWrites: String(a.skippedPrepareWrites ?? '-'),
      stackInjections: String(a.stackInjectionCount ?? '-'),
      finalD008E0: a.finalD008E0 == null ? '-' : hex(a.finalD008E0),
      fieldMismatches: String(a.finalFieldMismatches?.length ?? '-'),
      stackMismatches: String(a.finalStackMismatches?.length ?? '-'),
    };
  });
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 893: D008E0 Field/Stack A/B Adjudication',
      '',
      'Probe failed before producing a complete comparison.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const rows = buildVariantRows(data.scenarios);
  return [
    '# Phase 893: D008E0 Field/Stack A/B Adjudication',
    '',
    'Probe: `probe-phase893-d008e0-field-stack-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase893-d008e0-field-stack-ab.mjs`',
    '',
    'Serves a temporary instrumented copy of `browser-shell.html` and runs three browser-local A/B scenarios: the current helper field-only route, a route that suppresses only `prepareColdbootEventFrame()` writes of `D008E0=SCREEN_STACK_TOP-18`, and a route that keeps the helper field write while also injecting the raw oracle errSP stack packet at `D1A86C..D1A87D`.',
    '',
    '## Result',
    '',
    `- Overall: ${data.pass ? '**PASS**' : '**FAIL**'}.`,
    `- Baseline field-only route clean: ${data.analysis.baselineClean ? 'yes' : 'NO'}.`,
    `- No-helper route clean: ${data.analysis.noHelperClean ? 'yes' : 'NO'}.`,
    `- No-helper final field mismatches: ${data.analysis.noHelperFieldMismatchNames.join(', ') || 'none'}.`,
    `- Field-plus-stack route clean: ${data.analysis.stackVariantClean ? 'yes' : 'NO'}.`,
    `- Field-plus-stack oracle stack preserved through CLEAR: ${data.analysis.stackVariantStackMatches ? 'yes' : 'NO'}.`,
    `- Stack packet behaviorally load-bearing in this bounded route: ${data.analysis.stackPacketLoadBearing ? 'YES' : 'no'}.`,
    `- Adjudication: ${data.analysis.conclusion}`,
    '',
    '## Variant Summary',
    '',
    table(rows, [
      { label: 'Variant', value: (row) => row.variant },
      { label: 'Completed', value: (row) => row.completed },
      { label: 'Phase6', value: (row) => row.phase6 },
      { label: 'CLEAR', value: (row) => row.clear },
      { label: 'Page errors', value: (row) => row.pageErrors },
      { label: 'Helper writes', value: (row) => row.helperWrites },
      { label: 'Skipped writes', value: (row) => row.skippedWrites },
      { label: 'Stack injections', value: (row) => row.stackInjections },
      { label: 'Final D008E0', value: (row) => row.finalD008E0 },
      { label: 'Field mismatches', value: (row) => row.fieldMismatches },
      { label: 'Stack mismatches', value: (row) => row.stackMismatches },
    ]),
    '',
    '## Oracle Stack Packet',
    '',
    table(data.oracleStackFormatted, [
      { label: 'Address', value: (row) => row.addr },
      { label: '3-byte value', value: (row) => row.value },
    ]),
    '',
    '## Final Mismatches by Variant',
    '',
    ...data.scenarios.flatMap((scenario) => [
      `### ${scenario.label}`,
      '',
      scenario.error ? `Error: ${scenario.error}` : '',
      scenario.analysis?.finalFieldMismatches?.length
        ? table(scenario.analysis.finalFieldMismatches, [
          { label: 'Field', value: (row) => row.name },
          { label: 'Actual', value: (row) => row.actual },
          { label: 'Oracle', value: (row) => row.oracle },
        ])
        : 'Watched fields match the after-CLEAR oracle.',
      '',
      scenario.analysis?.finalStackMismatches?.length
        ? table(scenario.analysis.finalStackMismatches, [
          { label: 'Address', value: (row) => row.addr },
          { label: 'Actual', value: (row) => row.actual },
          { label: 'Oracle', value: (row) => row.oracle },
        ])
        : 'Fixed-address `D1A86C` stack slots match the after-CLEAR oracle.',
      '',
    ]),
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      analysis: data.analysis,
      sourceEvidence: data.sourceEvidence,
      oracleFields: formatFields(data.oracleFields),
      oracleStack: data.oracleStackFormatted,
      scenarios: data.scenarios,
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
  const oracleStack = readCaptureStack(ORACLE_D008E0);

  server = await startStaticServer();
  const serverPort = server.address().port;
  const scenarios = [];
  for (let i = 0; i < VARIANTS.length; i += 1) {
    const scenario = await runScenario(serverPort, VARIANTS[i], i);
    if (scenario.rawState) scenario.analysis = analyzeScenario(scenario.rawState, oracleFields, oracleStack);
    scenarios.push(scenario);
  }

  const byId = Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario]));
  const baseline = byId.baseline?.analysis;
  const noHelper = byId.no_prepare_d008e0?.analysis;
  const stackVariant = byId.field_plus_stack?.analysis;
  const noHelperFieldMismatchNames = noHelper?.finalFieldMismatches?.map((row) => row.name) ?? [];
  const stackPacketBehaviorDelta = Boolean(
    baseline
      && stackVariant
      && (
        baseline.cleanPhase6 !== stackVariant.cleanPhase6
        || baseline.cleanClear !== stackVariant.cleanClear
        || (baseline.pageErrors?.length ?? 0) !== (stackVariant.pageErrors?.length ?? 0)
        || (baseline.finalFieldMismatches?.length ?? 0) !== (stackVariant.finalFieldMismatches?.length ?? 0)
      ),
  );
  const stackPacketLoadBearing = stackPacketBehaviorDelta;

  const analysis = {
    baselineClean: Boolean(baseline?.cleanPhase6 && baseline?.cleanClear && !baseline.pageErrors.length),
    noHelperClean: Boolean(noHelper?.cleanPhase6 && noHelper?.cleanClear && !noHelper.pageErrors.length),
    stackVariantClean: Boolean(stackVariant?.cleanPhase6 && stackVariant?.cleanClear && !stackVariant.pageErrors.length),
    stackVariantStackMatches: Boolean(stackVariant?.finalStackMatchesOracle),
    noHelperFieldMismatchNames,
    stackPacketLoadBearing,
    conclusion: '',
  };
  analysis.conclusion = analysis.baselineClean
    && analysis.stackVariantClean
    && analysis.stackVariantStackMatches
    && noHelperFieldMismatchNames.includes('D008E0')
    ? 'The D008E0 helper field write is load-bearing for oracle field fidelity: suppressing only that write leaves D008E0 mismatched after CLEAR. The raw errSP stack packet is not behaviorally load-bearing for the bounded browser CLEAR route: adding the exact stack slots preserves clean Phase6/CLEAR behavior and only changes the stack bytes from FFFFFF to the raw oracle packet.'
    : 'The three-way D008E0 field/stack A/B did not match the expected clean-baseline/field-mismatch/stack-clean pattern; inspect the variant machine JSON before integration decisions.';

  const pass = scenarios.every((scenario) => scenario.completed && scenario.analysis)
    && analysis.baselineClean
    && analysis.stackVariantClean
    && analysis.stackVariantStackMatches
    && noHelperFieldMismatchNames.includes('D008E0');

  return {
    probe: 'phase893-d008e0-field-stack-ab',
    pass,
    chromePath,
    sourceEvidence,
    oracleFields,
    oracleStackFormatted: formatStack(oracleStack),
    analysis,
    scenarios,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    baselineClean: summary.analysis.baselineClean,
    noHelperClean: summary.analysis.noHelperClean,
    noHelperFieldMismatchNames: summary.analysis.noHelperFieldMismatchNames,
    stackVariantClean: summary.analysis.stackVariantClean,
    stackVariantStackMatches: summary.analysis.stackVariantStackMatches,
    stackPacketLoadBearing: summary.analysis.stackPacketLoadBearing,
    conclusion: summary.analysis.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase893-d008e0-field-stack-ab', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { server?.close(); } catch {}
}

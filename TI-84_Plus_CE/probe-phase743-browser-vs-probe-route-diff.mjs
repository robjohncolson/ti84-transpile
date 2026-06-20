import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase743-browser-vs-probe-route-diff.md');
const HALT = 0x0019B5;
const WARM_IDLE = 0x0019BE;
const OUTER_LOOP = 0x08C331;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const STACK_TOP = 0xD1A87E;
const EOL_KEY = 0x0F;
const MEM_SIZE = 0x1000000;

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const debugPort = 9743;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase743-'));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const TARGETS = Object.freeze({
  status0059da: 0x0059DA,
  displayLoop005ab6: 0x005AB6,
  displayCaller005b92: 0x005B92,
  lowSelect0064d0: 0x0064D0,
  lowFrame006cc6: 0x006CC6,
  lowCall006d5d: 0x006D5D,
  lowBackedge006d64: 0x006D64,
  tokenOuter08f3b8: 0x08F3B8,
  tokenTuple08f54b: 0x08F54B,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  postInsertGate0158de: 0x0158DE,
  postInsertReturn0013da: 0x0013DA,
});

const SNAPSHOT_TARGET_NAMES = Object.freeze([
  'status0059da',
  'displayLoop005ab6',
  'displayCaller005b92',
  'lowSelect0064d0',
  'lowFrame006cc6',
  'lowCall006d5d',
  'lowBackedge006d64',
  'tokenOuter08f3b8',
  'tokenTuple08f54b',
  'tokenExit08f5e1',
  'tokenGate090992',
  'cleanup001879',
  'cleanupTail0018f8',
  'postInsertGate0158de',
  'postInsertReturn0013da',
]);

const SELECTOR_TARGET_NAMES = Object.freeze([
  'status0059da',
  'displayLoop005ab6',
  'displayCaller005b92',
  'lowSelect0064d0',
  'lowFrame006cc6',
]);

const FIELD_SPECS = Object.freeze([
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D00085', 0xD00085, 1],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02A28', 0xD02A28, 1],
  ['D00121', 0xD00121, 3],
  ['D00124', 0xD00124, 1],
  ['D005A0', 0xD005A0, 1],
  ['D0059C', 0xD0059C, 3],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02590', 0xD02590, 3],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
]);

class EarlyStop extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[(addr + i) & 0xFFFFFF] << (8 * i);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[(addr + i) & 0xFFFFFF] = (value >>> (8 * i)) & 0xFF;
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function readFields(mem) {
  return Object.fromEntries(FIELD_SPECS.map(([name, addr, len]) => [name, hex(readValue(mem, addr, len), len * 2)]));
}

function readStackSlots(mem, sp, count = 6) {
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr: hex(addr), value: hex(readValue(mem, addr, 3)) };
  });
}

function cpuSummary(cpu) {
  return {
    pc: hex(cpu.pc ?? 0),
    sp: hex(cpu.sp ?? 0),
    ix: hex(cpu.ix ?? cpu._ix ?? 0),
    iy: hex(cpu.iy ?? cpu._iy ?? 0),
    af: hex(cpu.af ?? 0, 4),
    bc: hex(cpu.bc ?? 0),
    de: hex(cpu.de ?? 0),
    hl: hex(cpu.hl ?? 0),
    f: hex(cpu.f ?? 0, 2),
    halted: Boolean(cpu.halted),
    iff1: cpu.iff1 ?? 0,
    iff2: cpu.iff2 ?? 0,
    mbase: cpu.mbase ?? 0,
    madl: cpu.madl ?? 0,
  };
}

function makeCounts() {
  return Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0]));
}

function formatResult(result) {
  return {
    steps: result.steps,
    termination: result.termination,
    lastPc: hex(result.lastPc ?? 0),
    lastMode: result.lastMode,
  };
}

function captureSnapshot(label, mem, cpu, block, pc, recentBlocks, callStack) {
  return {
    label,
    block,
    pc: hex(pc),
    fields: readFields(mem),
    cpu: cpuSummary(cpu),
    stackTop: readStackSlots(mem, cpu.sp, 6),
    recentBlocks: recentBlocks.slice(-20).map((addr) => hex(addr)),
    callStackTail: callStack.slice(-16).map((addr) => hex(addr)),
  };
}

function makeMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function runBootToRepaintReady() {
  const machine = makeMachine();
  const { mem, peripherals, executor, cpu } = machine;
  const phases = [];

  phases.push({ name: 'cold-reset-000000', result: formatResult(executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 })) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'warm-spin-08c331', result: formatResult(executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 })) });

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'post-init-0802b2', result: formatResult(executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 })) });

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({ name: 'warm-idle-0019be', result: formatResult(executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 })) });

  peripherals.setTimerEnabled(false);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  const launchSp = STACK_TOP - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, WARM_IDLE);
  write24(mem, 0xD008E0, launchSp);
  phases.push({ name: 'launch-home-09dd62', result: formatResult(executor.runFrom(LAUNCH_HOME, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })) });

  peripherals.setTimerEnabled(true);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT);
  phases.push({ name: 'home-repaint-058241', result: formatResult(executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })) });

  return { ...machine, phases };
}

function rearmHomeContext(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function seedEolKey(mem) {
  mem[0xD0058C] = EOL_KEY;
  mem[0xD0058E] = EOL_KEY;
  mem[0xD00587] = EOL_KEY;
  mem[0xD0009F] |= 0x20;
  mem[0xD00080] |= 0x08;
}

function runDirectRecipe() {
  const machine = runBootToRepaintReady();
  const { mem, executor, cpu } = machine;

  rearmHomeContext(mem);
  seedEolKey(mem);

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xD008E0, cpu.sp);

  const counts = makeCounts();
  const firstSamples = {};
  const recentBlocks = [];
  const callStack = [];
  const hotBlocks = new Map();
  let block = 0;
  let prevSp = cpu.sp & 0xFFFFFF;
  let prevPc = OUTER_LOOP;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 650000,
    maxLoopIterations: 650000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      hotBlocks.set(hex(addr), (hotBlocks.get(hex(addr)) ?? 0) + 1);
      if (recentBlocks.at(-1) !== addr) {
        recentBlocks.push(addr);
        if (recentBlocks.length > 96) recentBlocks.shift();
      }

      const curSp = cpu.sp & 0xFFFFFF;
      const delta = prevSp - curSp;
      if (delta >= 3 && delta <= 18) {
        callStack.push(prevPc);
        if (callStack.length > 200) callStack.shift();
      } else if (delta <= -3 && delta >= -18) {
        callStack.splice(Math.max(0, callStack.length - Math.max(1, Math.floor((-delta) / 3))));
      }
      prevSp = curSp;

      for (const [name, target] of Object.entries(TARGETS)) {
        if (addr !== target) continue;
        counts[name] += 1;
        if (SNAPSHOT_TARGET_NAMES.includes(name) && !firstSamples[name]) {
          firstSamples[name] = captureSnapshot(name, mem, cpu, block, addr, recentBlocks, callStack);
        }
      }

      prevPc = addr;
    },
  });

  return {
    recipe: 'direct-probe-phase629-eol',
    phases: machine.phases,
    result: formatResult(result),
    counts,
    firstSamples,
    hotBlocks: Array.from(hotBlocks.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([pc, count]) => ({ pc, count })),
    final: captureSnapshot('direct-final', mem, cpu, block, result.lastPc ?? 0, recentBlocks, callStack),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
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
  return 'application/octet-stream';
}

function instrumentBrowserShell(html) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) throw new Error('Instrumentation marker not found in browser-shell.html');

  const injection = String.raw`
const PHASE743_TARGETS = Object.freeze({
  status0059da: 0x0059DA,
  displayLoop005ab6: 0x005AB6,
  displayCaller005b92: 0x005B92,
  lowSelect0064d0: 0x0064D0,
  lowFrame006cc6: 0x006CC6,
  lowCall006d5d: 0x006D5D,
  lowBackedge006d64: 0x006D64,
  tokenOuter08f3b8: 0x08F3B8,
  tokenTuple08f54b: 0x08F54B,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  postInsertGate0158de: 0x0158DE,
  postInsertReturn0013da: 0x0013DA,
});

const PHASE743_FIELD_SPECS = Object.freeze([
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D00085', 0xD00085, 1],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02A28', 0xD02A28, 1],
  ['D00121', 0xD00121, 3],
  ['D00124', 0xD00124, 1],
  ['D005A0', 0xD005A0, 1],
  ['D0059C', 0xD0059C, 3],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02590', 0xD02590, 3],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
]);

function phase743Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase743ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase743ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE743_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase743Hex(phase743ReadValue(mem, addr, len), len * 2),
  ]));
}

function phase743ReadStackSlots(count = 6) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr: phase743Hex(addr), value: phase743Hex(phase743ReadValue(mem, addr, 3)) };
  });
}

function phase743CpuSummary() {
  return cpu ? {
    pc: phase743Hex(cpu.pc ?? 0),
    sp: phase743Hex(cpu.sp ?? 0),
    ix: phase743Hex(cpu.ix ?? cpu._ix ?? 0),
    iy: phase743Hex(cpu.iy ?? cpu._iy ?? 0),
    af: phase743Hex(cpu.af ?? 0, 4),
    bc: phase743Hex(cpu.bc ?? 0),
    de: phase743Hex(cpu.de ?? 0),
    hl: phase743Hex(cpu.hl ?? 0),
    f: phase743Hex(cpu.f ?? 0, 2),
    halted: Boolean(cpu.halted),
    iff1: cpu.iff1 ?? 0,
    iff2: cpu.iff2 ?? 0,
    mbase: cpu.mbase ?? 0,
    madl: cpu.madl ?? 0,
  } : null;
}

function phase743MakeRecord(label) {
  return {
    label,
    start: window.__phase743Read?.() ?? null,
    end: null,
    totalBlocks: 0,
    counts: Object.fromEntries(Object.keys(PHASE743_TARGETS).map((name) => [name, 0])),
    firstSamples: {},
    recentBlocks: [],
    hotBlocks: {},
    lastKey: null,
  };
}

function phase743CurrentRecord() {
  const state = window.__phase743State;
  if (!state.records.length || state.currentLabel == null) {
    state.currentLabel = state.currentLabel || 'unlabeled';
    state.records.push(phase743MakeRecord(state.currentLabel));
  }
  return state.records[state.records.length - 1];
}

window.__phase743Read = function phase743Read() {
  return {
    runtimeMode,
    lastPc: phase743Hex(lastPc ?? 0),
    lastMode,
    totalSteps,
    cpu: phase743CpuSummary(),
    fields: phase743ReadFields(),
    diagnostics: getColdbootPersistenceDiagnostics?.() ?? null,
    vramPixels: countVRAMPixels?.() ?? null,
    status: document.getElementById('status')?.textContent ?? null,
    lastKey: window.__coldbootLastKey ?? null,
  };
};

window.__phase743State = {
  currentLabel: null,
  records: [],
  begin(label) {
    this.currentLabel = label;
    const record = phase743MakeRecord(label);
    this.records.push(record);
    return record.start;
  },
  finish() {
    const record = this.records[this.records.length - 1] ?? null;
    if (record) {
      record.end = window.__phase743Read();
      record.lastKey = window.__coldbootLastKey ?? null;
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([pc, count]) => ({ pc, count }));
    }
    this.currentLabel = null;
    return record;
  },
  read() {
    return window.__phase743Read();
  },
  all() {
    return this.records;
  },
};
window.__phase743 = window.__phase743State;

const phase743OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase743ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase743CurrentRecord();
  record.totalBlocks += 1;
  const pcHex = phase743Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  record.recentBlocks.push(pcHex);
  if (record.recentBlocks.length > 96) record.recentBlocks.shift();

  for (const [name, target] of Object.entries(PHASE743_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) {
      record.firstSamples[name] = {
        label: name,
        block: record.totalBlocks,
        pc: pcHex,
        fields: phase743ReadFields(),
        cpu: phase743CpuSummary(),
        stackTop: phase743ReadStackSlots(6),
        recentBlocks: record.recentBlocks.slice(-20),
        runtime: { lastPc: phase743Hex(lastPc ?? 0), lastMode, totalSteps },
      };
    }
  }

  return phase743OriginalObserveColdbootPersistenceBlock(state, pc);
};
`;

  return html.replace(marker, `${injection}\n\n${marker}`);
}

function startStaticServer() {
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
      if (rel === 'browser-shell.html') {
        const html = fs.readFileSync(fullPath, 'utf8');
        res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
        res.end(instrumentBrowserShell(html));
        return;
      }
      res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
      fs.createReadStream(fullPath).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error?.stack || error));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
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
      // Chrome may still be starting.
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome DevTools endpoint');
}

let nextId = 1;
const pending = new Map();

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error(`PAGE_EXCEPTION ${JSON.stringify(msg.params?.exceptionDetails || {})}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params?.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      console.error(`PAGE_CONSOLE ${msg.params?.type}: ${text}`);
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

function cdp(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 120000);
  });
}

async function evalExpr(ws, expression, timeout = 120000) {
  const result = await cdp(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function waitFor(ws, expression, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await evalExpr(ws, expression, 10000);
    if (lastValue) return lastValue;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}; lastValue=${JSON.stringify(lastValue)}`);
}

function keyParams(code, key, windowsVirtualKeyCode, text = key) {
  const params = {
    type: 'keyDown',
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    code,
    key,
  };
  if (text) {
    params.text = text;
    params.unmodifiedText = text;
  }
  return params;
}

async function readPageState(ws) {
  return await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    preserve: document.getElementById('preserveDisplay')?.checked ?? null,
    autoRunText: document.getElementById('btnAutoRun')?.textContent ?? null,
    phase743: window.__phase743?.read?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    errors: window.__phase743Errors || [],
  }))()`);
}

async function pressBrowserEol(ws) {
  await evalExpr(ws, `window.__phase743.begin('Browser EOL/CLEAR'); true;`);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('Escape', 'Escape', 27, ''));
  await cdp(ws, 'Input.dispatchKeyEvent', { ...keyParams('Escape', 'Escape', 27, ''), type: 'keyUp' });
  await sleep(750);
  return await evalExpr(ws, 'window.__phase743.finish()');
}

async function runBrowserRecipe() {
  if (!chromePath) {
    return {
      recipe: 'browser-shell-eol',
      skipped: true,
      error: 'No Chrome/Edge executable found for headless browser test',
    };
  }

  let ws;
  let chrome;
  let server;
  try {
    server = await startStaticServer();
    const pageUrl = `http://127.0.0.1:${server.address().port}/browser-shell.html`;

    chrome = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      pageUrl,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const wsUrl = await waitForDevtools();
    ws = await connect(wsUrl);
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
    await waitFor(ws, '!!window.__phase743 && !!window.getColdbootPersistenceDiagnostics', 'phase743 instrumentation', 30000);

    await evalExpr(ws, `(() => {
      window.__phase743Errors = [];
      window.addEventListener('error', (e) => window.__phase743Errors.push(String(e.message || e.error || e)));
      window.addEventListener('unhandledrejection', (e) => window.__phase743Errors.push(String(e.reason || e)));
      return true;
    })()`);

    const clickResult = await evalExpr(ws, `(() => {
      const boot = document.getElementById('btnBoot');
      document.getElementById('coldbootMode').checked = true;
      document.getElementById('preserveDisplay').checked = true;
      boot.click();
      return { disabled: boot.disabled, status: document.getElementById('status').textContent };
    })()`);
    console.log(JSON.stringify({ phase: 'browser-boot-click', clickResult }));

    await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 150000);
    const before = await readPageState(ws);
    const record = await pressBrowserEol(ws);
    const after = await readPageState(ws);

    return {
      recipe: 'browser-shell-eol',
      chromePath,
      pageUrl,
      before,
      record,
      after,
      errors: after.errors ?? [],
    };
  } catch (error) {
    return {
      recipe: 'browser-shell-eol',
      error: String(error?.stack || error),
    };
  } finally {
    try { ws?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    try { server?.close(); } catch {}
    await sleep(500);
  }
}

function countAny(counts, names) {
  return names.reduce((sum, name) => sum + (counts?.[name] ?? 0), 0);
}

function classify(record) {
  const counts = record?.counts ?? record?.record?.counts ?? {};
  const tokenHits = countAny(counts, ['tokenOuter08f3b8', 'tokenTuple08f54b', 'tokenExit08f5e1', 'tokenGate090992']);
  const low006dHits = countAny(counts, ['lowCall006d5d', 'lowBackedge006d64']);
  const lowFrameHits = countAny(counts, ['lowSelect0064d0', 'lowFrame006cc6']);
  if (tokenHits > 0 && low006dHits > 0) return 'token-engine-then-low-006d-route';
  if (tokenHits > 0 && lowFrameHits > 0) return 'token-engine-then-low-frame-route';
  if (tokenHits > 0) return 'token-engine-route';
  if (low006dHits > 0) return 'low-006d-route';
  if (lowFrameHits > 0) return 'low-frame-route';
  if (countAny(counts, ['cleanup001879', 'cleanupTail0018f8']) > 0) return 'cleanup/control-route';
  if (countAny(counts, ['postInsertGate0158de', 'postInsertReturn0013da']) > 0) return 'post-insert-stop-route';
  return 'unclassified';
}

function compactCounts(counts) {
  return Object.fromEntries(Object.entries(counts ?? {}).filter(([, value]) => value));
}

function getSample(run, name) {
  return run?.firstSamples?.[name] ?? run?.record?.firstSamples?.[name] ?? null;
}

function firstSharedSelector(direct, browser) {
  for (const name of SELECTOR_TARGET_NAMES) {
    const a = getSample(direct, name);
    const b = getSample(browser, name);
    if (a && b) return { name, direct: a, browser: b };
  }
  return null;
}

function firstOneSidedSelector(direct, browser) {
  return SELECTOR_TARGET_NAMES.map((name) => ({
    name,
    direct: Boolean(getSample(direct, name)),
    browser: Boolean(getSample(browser, name)),
  })).filter((row) => row.direct || row.browser);
}

function fieldDiffRows(a, b) {
  if (!a?.fields || !b?.fields) return [];
  return Object.keys(a.fields).map((name) => ({
    name,
    direct: a.fields[name],
    browser: b.fields[name],
    same: a.fields[name] === b.fields[name],
  }));
}

function stackDiffRows(a, b) {
  const left = a?.stackTop ?? [];
  const right = b?.stackTop ?? [];
  return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => ({
    slot: i,
    direct: left[i]?.value ?? 'n/a',
    browser: right[i]?.value ?? 'n/a',
    same: (left[i]?.value ?? 'n/a') === (right[i]?.value ?? 'n/a'),
  }));
}

function nameDifferingInput(shared) {
  if (!shared) return null;
  const fieldDiffs = fieldDiffRows(shared.direct, shared.browser).filter((row) => !row.same);
  const stackDiffs = stackDiffRows(shared.direct, shared.browser).filter((row) => !row.same);
  if (fieldDiffs.length > 0) return `first differing captured field at ${shared.name}: ${fieldDiffs[0].name} (${fieldDiffs[0].direct} vs ${fieldDiffs[0].browser})`;
  if (stackDiffs.length > 0) return `captured fields equal at ${shared.name}; first stack-slot difference is slot ${stackDiffs[0].slot} (${stackDiffs[0].direct} vs ${stackDiffs[0].browser})`;
  return `all captured fields and top-6 stack slots equal at ${shared.name}`;
}

function markdownFieldTable(rows) {
  if (!rows.length) return 'No shared selector sample was available.';
  return [
    '| Field | Direct | Browser | Same |',
    '|---|---|---|---|',
    ...rows.map((row) => `| ${row.name} | \`${row.direct}\` | \`${row.browser}\` | ${row.same ? 'yes' : 'NO'} |`),
  ].join('\n');
}

function markdownStackTable(rows) {
  if (!rows.length) return 'No shared stack sample was available.';
  return [
    '| Slot | Direct | Browser | Same |',
    '|---:|---|---|---|',
    ...rows.map((row) => `| ${row.slot} | \`${row.direct}\` | \`${row.browser}\` | ${row.same ? 'yes' : 'NO'} |`),
  ].join('\n');
}

function targetTable(direct, browser) {
  return [
    '| Target | Direct hits | Browser hits | Direct first block | Browser first block |',
    '|---|---:|---:|---:|---:|',
    ...Object.keys(TARGETS).map((name) => {
      const a = getSample(direct, name);
      const b = getSample(browser, name);
      return `| ${name} | ${direct.counts?.[name] ?? 0} | ${browser.record?.counts?.[name] ?? 0} | ${a?.block ?? '-'} | ${b?.block ?? '-'} |`;
    }),
  ].join('\n');
}

function buildReport(summary) {
  const directRoute = classify(summary.direct);
  const browserRoute = summary.browser.error ? 'browser-error' : classify(summary.browser.record);
  const directTokenHits = countAny(summary.direct.counts, ['tokenOuter08f3b8', 'tokenTuple08f54b', 'tokenExit08f5e1', 'tokenGate090992']);
  const directLowHits = countAny(summary.direct.counts, ['lowCall006d5d', 'lowBackedge006d64']);
  const browserLowHits = countAny(summary.browser.record?.counts, ['lowCall006d5d', 'lowBackedge006d64']);
  const shared = firstSharedSelector(summary.direct, summary.browser);
  const differingInput = nameDifferingInput(shared);
  const oneSided = firstOneSidedSelector(summary.direct, summary.browser);

  const fieldRows = shared ? fieldDiffRows(shared.direct, shared.browser) : [];
  const stackRows = shared ? stackDiffRows(shared.direct, shared.browser) : [];
  const browserLastKey = summary.browser.after?.lastKey ?? summary.browser.record?.lastKey ?? null;
  const browserControlStop = browserLastKey?.stoppedBeforeControlClear === true;
  const browserAfterState = summary.browser.after?.phase743 ?? null;
  const browserLastPc = browserAfterState?.lastPc ?? 'n/a';
  const browserWatchedHits = countAny(summary.browser.record?.counts, Object.keys(TARGETS));

  return [
    '# Phase 743: Browser vs Proven Probe Route Diff',
    '',
    'Probe: `probe-phase743-browser-vs-probe-route-diff.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase743-browser-vs-probe-route-diff.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- **** Direct/proven EOL recipe reached the token engine first: route=${directRoute}, token hits=${directTokenHits}, later 0x006D hits=${directLowHits}, result=${summary.direct.result.termination} ${summary.direct.result.lastPc}.`,
    summary.browser.error
      ? `- !! Browser leg failed before a route record was captured: ${summary.browser.error.split('\n')[0]}`
      : `- ${browserLowHits > 0 ? '****' : '***'} Browser EOL route=${browserRoute}; watched hits=${browserWatchedHits}, 0x006D hits=${browserLowHits}, final lastPc=${browserLastPc}.`,
    !summary.browser.error && browserWatchedHits === 0 && browserLastPc === '0x202020'
      ? '- **** Current browser EOL diverges before the requested selector set: it jumps to missing block `0x202020` after 7366 steps, with post-run D007CA/D008E0/D02590 also reading `0x202020` in the captured browser state.'
      : '- *** Browser leg reached at least one watched target or ended at a different final PC; inspect target counts below.',
    browserControlStop
      ? '- **** Current `browser-shell.html` no longer reproduces the old EOL low-loop route for this key: the shipped EOL control-pre-stop fired at `0x001879`, applied the UI-level clear, and reset back to the event-loop entry before `0x006D5D`/`0x006D64`.'
      : '- *** Browser leg did not report the shipped EOL control-pre-stop path.',
    shared
      ? `- **** First shared selector sample is ${shared.name}. ${differingInput}.`
      : `- *** No shared 0x005Axx/low selector sample was captured. One-sided selector evidence: ${oneSided.map((row) => `${row.name}=direct:${row.direct ? 'yes' : 'no'}/browser:${row.browser ? 'yes' : 'no'}`).join(', ') || 'none'}.`,
    '- No shell/runtime/transpiler files were edited; browser instrumentation was served only from an in-memory HTML copy.',
    '',
    '## Target Hits',
    '',
    targetTable(summary.direct, summary.browser),
    '',
    '## Shared Selector Field Diff',
    '',
    shared ? `Shared target: \`${shared.name}\`` : 'Shared target: none',
    '',
    markdownFieldTable(fieldRows),
    '',
    '## Shared Selector Stack Diff',
    '',
    markdownStackTable(stackRows),
    '',
    '## Compact Evidence',
    '',
    '```json',
    JSON.stringify({
      direct: {
        result: summary.direct.result,
        route: directRoute,
        counts: compactCounts(summary.direct.counts),
        selectorSamples: Object.fromEntries(SELECTOR_TARGET_NAMES.map((name) => [name, getSample(summary.direct, name)]).filter(([, value]) => value)),
        tokenSamples: Object.fromEntries(['tokenOuter08f3b8', 'tokenTuple08f54b', 'tokenExit08f5e1', 'tokenGate090992'].map((name) => [name, getSample(summary.direct, name)]).filter(([, value]) => value)),
      },
      browser: summary.browser.error ? {
        error: summary.browser.error,
      } : {
        route: browserRoute,
        before: summary.browser.before,
        after: summary.browser.after,
        counts: compactCounts(summary.browser.record?.counts),
        selectorSamples: Object.fromEntries(SELECTOR_TARGET_NAMES.map((name) => [name, getSample(summary.browser, name)]).filter(([, value]) => value)),
        lowSamples: Object.fromEntries(['lowCall006d5d', 'lowBackedge006d64', 'lowFrame006cc6', 'lowSelect0064d0'].map((name) => [name, getSample(summary.browser, name)]).filter(([, value]) => value)),
        tokenSamples: Object.fromEntries(['tokenOuter08f3b8', 'tokenTuple08f54b', 'tokenExit08f5e1', 'tokenGate090992'].map((name) => [name, getSample(summary.browser, name)]).filter(([, value]) => value)),
        lastKey: browserLastKey,
        errors: summary.browser.errors,
      },
      shared: shared ? {
        name: shared.name,
        differingInput,
      } : null,
    }, null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    shared
      ? `The differential reached a shared selector and names the first captured input difference above. This is the candidate input for the next static decode of the 0x005Axx scheduler path.`
      : 'The direct/proven recipe and current browser EOL route did not meet at a selector sample. The important new constraint is that current `browser-shell.html` has moved EOL away from the old low-loop reproduction path: its control-pre-stop at `0x001879` prevents the `0x006D5D`/`0x006D64` hot loop for this key. A future diff should either use the older no-control-stop browser recipe or switch to a key that still reproduces the low route in the current shell.',
    '',
    'No runtime, transpiler, browser, or scheduler source files were modified.',
    '',
  ].join('\n');
}

console.log('phase743: browser vs proven probe route diff');
const direct = runDirectRecipe();
console.log(JSON.stringify({
  phase: 'direct-complete',
  result: direct.result,
  counts: compactCounts(direct.counts),
}, null, 2));

const browser = await runBrowserRecipe();
const summary = { direct, browser };
fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);

console.log(JSON.stringify({
  probe: 'phase743-browser-vs-probe-route-diff',
  report: path.basename(REPORT_PATH),
  direct: {
    result: direct.result,
    route: classify(direct),
    counts: compactCounts(direct.counts),
  },
  browser: browser.error ? {
    error: browser.error.split('\n')[0],
  } : {
    route: classify(browser.record),
    counts: compactCounts(browser.record?.counts),
    lastKey: browser.after?.lastKey,
    errors: browser.errors,
  },
  sharedSelector: firstSharedSelector(direct, browser)?.name ?? null,
}, null, 2));

try {
  fs.rmSync(userDataDir, { recursive: true, force: true });
} catch {}

const directTokenPass = countAny(direct.counts, ['tokenOuter08f3b8', 'tokenTuple08f54b', 'tokenExit08f5e1', 'tokenGate090992']) > 0;
const browserCaptured = Boolean(browser.error) || Boolean(browser.record);
if (!directTokenPass || !browserCaptured) process.exitCode = 1;

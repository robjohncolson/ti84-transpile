import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase874-d0301b-sentinel-ab.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const AFTER_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const RAM_BASE = 0xD00000;
const D0301B = 0xD0301B;
const D0301B_MAGIC = 0x5AA55A;
const DEBUG_PORT = 9874;
const ROUTE_LIMIT = 5400;

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase874-'));
const romBytes = fs.readFileSync(ROM_PATH);
const afterClearRam = fs.readFileSync(AFTER_CLEAR_CAPTURE);

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary;

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
  ['D0301B', D0301B, 3],
  ['D000C2_IY42', 0xD000C2, 1],
]);

const CORE_ORACLE_FIELDS = Object.freeze([
  'D007CA', 'D008E0', 'D010EF', 'D010FE', 'D010F4',
  'D02437', 'D0243A', 'D0243D', 'D02440',
  'D02505', 'D02590', 'D0259D', 'D02A29', 'D0301B',
]);

const EDIT_VAT_ORACLE_FIELDS = Object.freeze([
  'D007CA', 'D02437', 'D0243A', 'D0243D', 'D02440',
  'D02505', 'D02590', 'D0259D', 'D02A29', 'D0301B',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function parseHex(value) {
  if (typeof value === 'number') return value >>> 0;
  if (typeof value === 'string' && value.startsWith('0x')) return Number.parseInt(value.slice(2), 16) >>> 0;
  return null;
}

function readCaptureValue(buffer, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > buffer.length) return null;
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (buffer[offset + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function valueWidth(name) {
  if (name === 'D010F4' || name === 'D02505' || name === 'D000C2_IY42') return 2;
  if (name === 'D02A29') return 4;
  return 6;
}

function formatFields(fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([name, value]) => [name, hex(value, valueWidth(name))]),
  );
}

function captureOracleFields() {
  return formatFields(Object.fromEntries(
    WATCHED_FIELDS.map(([name, addr, len]) => [name, readCaptureValue(afterClearRam, addr, len)]),
  ));
}

function formatInst(inst) {
  if (!inst) return '(decode failed)';
  const upper = (value) => String(value ?? '').toUpperCase();
  if (inst.tag === 'ret') return 'RET';
  if (inst.tag === 'call') return `CALL ${hex(inst.target)}`;
  if (inst.tag === 'jp') return `JP ${hex(inst.target)}`;
  if (inst.tag === 'jr') return `JR ${hex(inst.target)}`;
  if (inst.tag === 'jr-conditional') return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
  if (inst.tag === 'jp-conditional') return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
  if (inst.tag === 'ld-reg-mem') return `LD ${upper(inst.dest)}, (${hex(inst.addr)})`;
  if (inst.tag === 'ld-mem-reg') return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
  if (inst.tag === 'ld-pair-imm') return `LD ${upper(inst.pair ?? inst.dest)}, ${hex(inst.value)}`;
  if (inst.tag === 'ld-reg-imm') return `LD ${upper(inst.dest)}, ${hex(inst.value, 2)}`;
  if (inst.tag === 'ld-ind-imm') return `LD (${upper(inst.dest)}), ${hex(inst.value, 2)}`;
  if (inst.tag === 'ldir') return 'LDIR';
  if (inst.tag === 'push') return `PUSH ${upper(inst.pair)}`;
  if (inst.tag === 'pop') return `POP ${upper(inst.pair)}`;
  if (inst.tag === 'alu-reg') return `${upper(inst.op)} ${upper(inst.src)}`;
  if (inst.tag === 'alu-imm') return `${upper(inst.op)} ${hex(inst.value, 2)}`;
  if (inst.tag === 'sbc-pair') return `SBC HL, ${upper(inst.src)}`;
  if (inst.tag === 'in0') return `IN0 ${upper(inst.reg)}, (${hex(inst.port, 2)})`;
  if (inst.tag === 'out0') return `OUT0 (${hex(inst.port, 2)}), ${upper(inst.reg)}`;
  if (inst.tag === 'bit-test') return `BIT ${inst.bit}, ${upper(inst.reg)}`;
  if (inst.tag === 'bit-set') return `SET ${inst.bit}, ${upper(inst.reg)}`;
  return `${inst.tag} ${JSON.stringify(Object.fromEntries(Object.entries(inst).filter(([key]) => !['tag', 'pc', 'length', 'nextPc'].includes(key))))}`;
}

function decodeWindow(start, end) {
  const rows = [];
  let pc = start;
  while (pc <= end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const bytes = Array.from(romBytes.subarray(pc, pc + inst.length), (byte) => (
      byte.toString(16).toUpperCase().padStart(2, '0')
    )).join(' ');
    rows.push({ pc: hex(pc), bytes, instruction: formatInst(inst) });
    pc += Math.max(1, inst.length);
  }
  return rows;
}

function decodeTable(rows) {
  return [
    '| PC | Bytes | Instruction |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.pc} | \`${row.bytes}\` | ${row.instruction} |`),
  ].join('\n');
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
  if (!sourceHtml.includes(marker)) throw new Error('persistence marker not found');

  const injection = String.raw`
const PHASE874_ROUTE_LIMIT = 5400;
const PHASE874_ANCHOR = 0x0A229D;
const PHASE874_D0301B = 0xD0301B;
const PHASE874_D0301B_MAGIC = 0x5AA55A;
const PHASE874_TARGETS = Object.freeze({
  anchor0A229D: 0x0A229D,
  liveSpin0A1854: 0x0A1854,
  portBranch001872: 0x001872,
  portSkip0018AF: 0x0018AF,
  preWipe001879: 0x001879,
  largeClear001881: 0x001881,
  sentinelCompareBlock0018D7: 0x0018D7,
  sentinelCompare0018E0: 0x0018E0,
  sentinelBranch0018EA: 0x0018EA,
  shortTail0018EC: 0x0018EC,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});
const PHASE874_FIELDS = Object.freeze([
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
function phase874ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}
function phase874WriteValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[(addr + i) & 0xFFFFFF] = (value >>> (8 * i)) & 0xFF;
}
function phase874ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE874_FIELDS.map(([name, addr, len]) => [name, phase874ReadValue(mem, addr, len)]));
}
function phase874CpuRaw() {
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
  } : null;
}
function phase874Stack(count = 6) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, index) => {
    const addr = ((sp & 0xFFFFFF) + index * 3) & 0xFFFFFF;
    return { addr, value: phase874ReadValue(mem, addr, 3) };
  });
}
function phase874Snapshot(record, pc) {
  return {
    index: record.rows.length,
    block: record.totalBlocks,
    pc: pc & 0xFFFFFF,
    prevPc: record.prevPc,
    cpu: phase874CpuRaw(),
    fields: phase874ReadFields(),
    stackTop: phase874Stack(6),
  };
}
function phase874CreateRecord(label) {
  return {
    label,
    start: null,
    end: null,
    totalBlocks: 0,
    prevPc: null,
    anchorSeen: false,
    anchorBlock: null,
    rows: [],
    targetCounts: Object.fromEntries(Object.keys(PHASE874_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    hotBlocks: {},
    mutations: [],
  };
}
function phase874Read(label = 'read') {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase874CpuRaw(),
    fields: phase874ReadFields(),
    port03OverrideApplied: window.__phase874Port03OverrideApplied === true,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase874PageErrors ?? [])],
  };
}
window.__phase874PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase874PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase874PageErrors.push(String(event.reason || event));
});
window.__phase874 = {
  records: [],
  config: { forcePort03Bit4: true, forceD0301BMagic: false },
  configure(config = {}) {
    this.config = {
      forcePort03Bit4: config.forcePort03Bit4 !== false,
      forceD0301BMagic: config.forceD0301BMagic === true,
    };
    return this.config;
  },
  begin(label) {
    const record = phase874CreateRecord(label);
    this.records.push(record);
    if (this.config.forcePort03Bit4 && peripherals?.register) {
      peripherals.register(0x03, {
        read() { return 0xFE; },
        write() {},
      });
      window.__phase874Port03OverrideApplied = true;
    } else {
      window.__phase874Port03OverrideApplied = false;
    }
    record.start = phase874Read('start');
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase874Read('end');
      record.topHotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24)
        .map(([pc, count]) => ({ pc, count }));
    }
    return record;
  },
  read: phase874Read,
};
function phase874Hex(value) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(6, '0');
}
function phase874MaybeMutate(record, addr) {
  const mem = cpu?.memory;
  if (!mem || addr !== 0x0018D7 || !window.__phase874.config?.forceD0301BMagic || record.mutations.length > 0) return;
  const before = phase874Snapshot(record, addr);
  phase874WriteValue(mem, PHASE874_D0301B, 3, PHASE874_D0301B_MAGIC);
  record.mutations.push({
    pc: addr,
    block: record.totalBlocks,
    field: 'D0301B',
    note: '0x0018D7 lifted block contains the 0x0018E0 D0301B compare; mutation occurs before that block executes',
    forcedValue: PHASE874_D0301B_MAGIC,
    before,
    after: phase874Snapshot(record, addr),
  });
}
const phase874OriginalObserve = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase874ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = window.__phase874.records.at(-1) ?? phase874CreateRecord('implicit');
  if (!window.__phase874.records.length) window.__phase874.records.push(record);
  record.totalBlocks += 1;
  const pcHex = phase874Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  phase874MaybeMutate(record, addr);
  for (const [name, target] of Object.entries(PHASE874_TARGETS)) {
    if (addr !== target) continue;
    record.targetCounts[name] += 1;
    if (!record.targetFirst[name]) record.targetFirst[name] = phase874Snapshot(record, addr);
  }
  if ((addr === 0x0A1854 || addr === PHASE874_ANCHOR) && !record.anchorSeen) {
    record.anchorSeen = true;
    record.anchorBlock = record.totalBlocks;
    record.windowStartPc = addr;
  }
  if (record.anchorSeen && record.rows.length < PHASE874_ROUTE_LIMIT) {
    record.rows.push(phase874Snapshot(record, addr));
  }
  const result = phase874OriginalObserve(state, pc);
  record.prevPc = addr;
  return result;
};
getColdbootControlPreStop = function phase874GetColdbootControlPreStop(code) {
  if (code === 'Escape') return null;
  return COLDBOOT_CONTROL_PRE_STOP_BY_PC_CODE[code] ?? null;
};
const phase874OriginalRunOptions = getColdbootRunOptions;
getColdbootRunOptions = function phase874GetColdbootRunOptions(stepBudget) {
  const opts = phase874OriginalRunOptions(stepBudget);
  opts.maxSteps = 160000;
  return opts;
};
`;

  return sourceHtml.replace(marker, `${injection}\n\n${marker}`);
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
      const pages = await httpJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
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
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
    code: 'Escape',
    key: 'Escape',
  };
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
  };
}

function formatStack(stackTop) {
  return (stackTop ?? []).map((slot) => ({ addr: hex(slot.addr), value: hex(slot.value) }));
}

function formatRouteRow(row) {
  if (!row) return null;
  return {
    ...row,
    pc: hex(row.pc),
    prevPc: row.prevPc == null ? null : hex(row.prevPc),
    cpu: formatCpu(row.cpu),
    fields: formatFields(row.fields),
    stackTop: formatStack(row.stackTop),
  };
}

function formatMutation(mutation) {
  if (!mutation) return null;
  return {
    ...mutation,
    pc: hex(mutation.pc),
    forcedValue: hex(mutation.forcedValue),
    before: formatRouteRow(mutation.before),
    after: formatRouteRow(mutation.after),
  };
}

function formatRead(read) {
  if (!read) return null;
  return {
    ...read,
    cpu: formatCpu(read.cpu),
    fields: formatFields(read.fields),
  };
}

function formatRoute(route) {
  if (!route) return null;
  return {
    ...route,
    prevPc: route.prevPc == null ? null : hex(route.prevPc),
    windowStartPc: route.windowStartPc == null ? null : hex(route.windowStartPc),
    start: formatRead(route.start),
    end: formatRead(route.end),
    targetFirst: Object.fromEntries(
      Object.entries(route.targetFirst ?? {}).map(([name, row]) => [name, formatRouteRow(row)]),
    ),
    rows: (route.rows ?? []).map(formatRouteRow),
    mutations: (route.mutations ?? []).map(formatMutation),
  };
}

async function runScenario(pageUrl, scenario) {
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(ws, '!!window.__phase874 && !!window.__coldbootReadEditLineState', 'phase874 instrumentation', 30000);
  await sleep(500);
  const config = await evalExpr(ws, `window.__phase874.configure(${JSON.stringify({
    forcePort03Bit4: true,
    forceD0301BMagic: scenario.forceD0301BMagic === true,
  })})`, 30000);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__phase874.read('afterBoot')`, 30000);
  await evalExpr(ws, `window.__phase874.begin(${JSON.stringify(scenario.label)})`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'Escape'`, 'Escape completion', 180000);
  await sleep(150);

  const traceRecord = await evalExpr(ws, `window.__phase874.finish()`, 30000);
  const state = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    keyState: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    config: window.__phase874.config ?? null,
    pageErrors: window.__phase874PageErrors ?? [],
  }))()`, 30000);

  return {
    routeKind: scenario.routeKind,
    forceD0301BMagic: scenario.forceD0301BMagic === true,
    config,
    afterBoot: formatRead(afterBoot),
    state,
    route: formatRoute(traceRecord),
  };
}

async function runLiveBrowserRoute() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

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

  const portSkipControl = await runScenario(pageUrl, {
    routeKind: 'live-browser-port03-bit4-skip-control',
    label: 'Escape/CLEAR with port 0x03 bit4 skip, D0301B control',
    forceD0301BMagic: false,
  });
  const sentinelForced = await runScenario(pageUrl, {
    routeKind: 'live-browser-port03-bit4-skip-d0301b-magic',
    label: 'Escape/CLEAR with port 0x03 bit4 skip and D0301B magic at 0x0018E0',
    forceD0301BMagic: true,
  });

  return {
    routeKind: 'live-browser-phase874-d0301b-ab',
    chromePath,
    pageUrl,
    portSkipControl,
    sentinelForced,
  };
}

function summarizeRow(row) {
  if (!row) return null;
  const stack0 = row.stackTop?.[0]?.value ?? null;
  return {
    pc: row.pc ?? null,
    prevPc: row.prevPc ?? null,
    af: row.cpu?.af ?? null,
    bc: row.cpu?.bc ?? null,
    de: row.cpu?.de ?? null,
    hl: row.cpu?.hl ?? null,
    sp: row.cpu?.sp ?? null,
    stack0,
    D007CA: row.fields?.D007CA ?? null,
    D008E0: row.fields?.D008E0 ?? null,
    D02437: row.fields?.D02437 ?? null,
    D0243A: row.fields?.D0243A ?? null,
    D0243D: row.fields?.D0243D ?? null,
    D02505: row.fields?.D02505 ?? null,
    D02590: row.fields?.D02590 ?? null,
    D0301B: row.fields?.D0301B ?? null,
  };
}

function firstTargetRow(route, name) {
  return route?.targetFirst?.[name] ?? null;
}

function edgeInto(route, name) {
  const row = firstTargetRow(route, name);
  if (!row) return null;
  return { fromPc: row.prevPc ?? null, to: summarizeRow(row) };
}

function routeFields(scenario) {
  return scenario?.route?.end?.fields ?? {};
}

function fieldsMatch(fields, oracle, names) {
  return names.every((name) => fields?.[name] === oracle?.[name]);
}

function mutationSummary(scenario) {
  const mutation = scenario?.route?.mutations?.[0] ?? null;
  if (!mutation) return null;
  return {
    pc: mutation.pc,
    beforeD0301B: mutation.before?.fields?.D0301B ?? null,
    afterD0301B: mutation.after?.fields?.D0301B ?? null,
    forcedValue: mutation.forcedValue,
    block: mutation.block,
  };
}

function summarizeScenario(label, scenario, oracleAfter) {
  const counts = scenario?.route?.targetCounts ?? {};
  const fields = routeFields(scenario);
  const cleanup = edgeInto(scenario?.route, 'cleanup0018F8');
  return {
    label,
    status: scenario?.state?.status ?? null,
    forceD0301BMagic: scenario?.forceD0301BMagic === true,
    port03OverrideApplied: scenario?.route?.start?.port03OverrideApplied === true,
    termination: scenario?.state?.keyState?.termination ?? null,
    steps: scenario?.state?.keyState?.steps ?? null,
    wipes: scenario?.state?.keyState?.wipes ?? null,
    vramPeak: scenario?.state?.keyState?.vramPeak ?? null,
    vramCurrent: scenario?.state?.keyState?.vramCurrent ?? null,
    pageErrors: scenario?.state?.pageErrors ?? [],
    counts: {
      anchor0A229D: counts.anchor0A229D ?? 0,
      portBranch001872: counts.portBranch001872 ?? 0,
      portSkip0018AF: counts.portSkip0018AF ?? 0,
      preWipe001879: counts.preWipe001879 ?? 0,
      largeClear001881: counts.largeClear001881 ?? 0,
      sentinelCompareBlock0018D7: counts.sentinelCompareBlock0018D7 ?? 0,
      sentinelCompare0018E0: counts.sentinelCompare0018E0 ?? 0,
      shortTail0018EC: counts.shortTail0018EC ?? 0,
      cleanup0018F8: counts.cleanup0018F8 ?? 0,
      poll006D64: counts.poll006D64 ?? 0,
    },
    edges: {
      branch: edgeInto(scenario?.route, 'portBranch001872'),
      skip: edgeInto(scenario?.route, 'portSkip0018AF'),
      largeClear: edgeInto(scenario?.route, 'largeClear001881'),
      sentinelCompareBlock: edgeInto(scenario?.route, 'sentinelCompareBlock0018D7'),
      sentinelCompare: edgeInto(scenario?.route, 'sentinelCompare0018E0'),
      shortTail: edgeInto(scenario?.route, 'shortTail0018EC'),
      cleanup,
    },
    cleanupTail: cleanup?.to ? {
      fromPc: cleanup.fromPc,
      bc: cleanup.to.bc,
      de: cleanup.to.de,
      hl: cleanup.to.hl,
      d0301b: cleanup.to.D0301B,
    } : null,
    mutation: mutationSummary(scenario),
    endFields: Object.fromEntries(CORE_ORACLE_FIELDS.map((name) => [name, fields?.[name] ?? '-'])),
    postKeyCoreMatchesOracle: fieldsMatch(fields, oracleAfter, CORE_ORACLE_FIELDS),
    postKeyEditVatMatchesOracle: fieldsMatch(fields, oracleAfter, EDIT_VAT_ORACLE_FIELDS),
  };
}

function analyzePhase874(live, oracleAfter) {
  const control = summarizeScenario('port bit skip control', live.portSkipControl, oracleAfter);
  const forced = summarizeScenario('D0301B magic at 0x0018E0', live.sentinelForced, oracleAfter);
  const controlTakesMismatch =
    control.counts.portSkip0018AF > 0
    && control.counts.largeClear001881 > 0
    && control.cleanupTail?.fromPc === '0x001881'
    && control.cleanupTail?.bc === '0x0000FF'
    && control.cleanupTail?.de === '0xD3FF00'
    && control.cleanupTail?.hl === '0xD3FEFF';
  const forcedMutationApplied =
    forced.mutation?.beforeD0301B !== '0x5AA55A'
    && forced.mutation?.afterD0301B === '0x5AA55A';
  const forcedTakesShortTail =
    forced.counts.portSkip0018AF > 0
    && forced.counts.sentinelCompareBlock0018D7 > 0
    && forced.counts.shortTail0018EC > 0
    && forced.counts.largeClear001881 === 0
    && forced.wipes === 0;
  const allErrorFree = control.pageErrors.length === 0 && forced.pageErrors.length === 0;
  const pass = allErrorFree
    && control.port03OverrideApplied
    && forced.port03OverrideApplied
    && controlTakesMismatch
    && forcedMutationApplied;
  const conclusion = forcedTakesShortTail
    ? 'Forcing D0301B=0x5AA55A before the 0x0018E0 compare is causal for cleanup geometry: the port-skip route leaves the 0x001881 large-clear branch, takes the 0x0018EC short-tail block, and records zero wipes. It is not a full after-CLEAR oracle yet: edit/VAT fields are preserved, but D010EF/D010FE/D010F4 remain zero and D008E0 remains offset from the real capture.'
    : 'Forcing D0301B=0x5AA55A was observed, but it did not produce the expected 0x0018EC short-tail branch; inspect the edge table before tracing owner lifetime.';
  return {
    pass,
    variants: { control, forced },
    controlTakesMismatch,
    forcedMutationApplied,
    forcedTakesShortTail,
    allErrorFree,
    conclusion,
  };
}

function countsTable(variants) {
  return [
    '| Variant | Port override | Force D0301B | 0x0018AF | 0x0018D7 block | 0x0018E0 exact | 0x001881 | 0x0018EC | 0x0018F8 | 0x006D64 | Wipes | Termination |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...Object.values(variants).map((variant) => `| ${variant.label} | ${variant.port03OverrideApplied ? 1 : 0} | ${variant.forceD0301BMagic ? 1 : 0} | ${variant.counts.portSkip0018AF} | ${variant.counts.sentinelCompareBlock0018D7} | ${variant.counts.sentinelCompare0018E0} | ${variant.counts.largeClear001881} | ${variant.counts.shortTail0018EC} | ${variant.counts.cleanup0018F8} | ${variant.counts.poll006D64} | ${variant.wipes ?? '-'} | ${variant.termination ?? '-'} |`),
  ].join('\n');
}

function edgeTable(variants) {
  return [
    '| Variant | Skip edge | Compare block edge | Exact 0x0018E0 edge | Large-clear edge | Short-tail edge | Cleanup edge | Cleanup BC | Cleanup DE | Cleanup HL | Cleanup D0301B |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...Object.values(variants).map((variant) => {
      const edgeText = (edge) => `${edge?.fromPc ?? '-'} -> ${edge?.to?.pc ?? '-'}`;
      return `| ${variant.label} | ${edgeText(variant.edges.skip)} | ${edgeText(variant.edges.sentinelCompareBlock)} | ${edgeText(variant.edges.sentinelCompare)} | ${edgeText(variant.edges.largeClear)} | ${edgeText(variant.edges.shortTail)} | ${edgeText(variant.edges.cleanup)} | ${variant.cleanupTail?.bc ?? '-'} | ${variant.cleanupTail?.de ?? '-'} | ${variant.cleanupTail?.hl ?? '-'} | ${variant.cleanupTail?.d0301b ?? '-'} |`;
    }),
  ].join('\n');
}

function mutationTable(variants) {
  return [
    '| Variant | Mutation PC | Before D0301B | After D0301B | Forced value |',
    '| --- | --- | --- | --- | --- |',
    ...Object.values(variants).map((variant) => `| ${variant.label} | ${variant.mutation?.pc ?? '-'} | ${variant.mutation?.beforeD0301B ?? '-'} | ${variant.mutation?.afterD0301B ?? '-'} | ${variant.mutation?.forcedValue ?? '-'} |`),
  ].join('\n');
}

function fieldTable(oracleAfter, variants) {
  return [
    `| Field | Oracle after CLEAR | ${Object.values(variants).map((variant) => variant.label).join(' | ')} |`,
    `| --- | --- | ${Object.values(variants).map(() => '---').join(' | ')} |`,
    ...CORE_ORACLE_FIELDS.map((name) => `| ${name} | ${oracleAfter[name] ?? '-'} | ${Object.values(variants).map((variant) => variant.endFields[name] ?? '-').join(' | ')} |`),
  ].join('\n');
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 874: D0301B Sentinel A/B',
      '',
      'Probe failed before producing a complete comparison.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const ab = data.adjudication;
  return [
    '# Phase 874: D0301B Sentinel A/B',
    '',
    'Probe: `probe-phase874-d0301b-sentinel-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase874-d0301b-sentinel-ab.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Control route took D0301B mismatch branch: ${ab.controlTakesMismatch ? 'yes' : 'no'}.`,
    `- Forced D0301B mutation applied at containing block 0x0018D7 before the 0x0018E0 compare: ${ab.forcedMutationApplied ? 'yes' : 'no'}.`,
    `- Forced route took short-tail setup: ${ab.forcedTakesShortTail ? 'yes' : 'no'}.`,
    `- Forced route preserved edit/VAT oracle fields: ${ab.variants.forced.postKeyEditVatMatchesOracle ? 'yes' : 'no'}.`,
    `- Final forced fields match real after-CLEAR oracle: ${ab.variants.forced.postKeyCoreMatchesOracle ? 'yes' : 'no'}.`,
    `- Adjudication: ${ab.conclusion}`,
    '',
    '## Variant Counts',
    '',
    countsTable(ab.variants),
    '',
    '## Branch Edges And Tail Registers',
    '',
    edgeTable(ab.variants),
    '',
    '## Mutation Check',
    '',
    mutationTable(ab.variants),
    '',
    '## Final Field Comparison',
    '',
    fieldTable(data.oracleAfter, ab.variants),
    '',
    '## Static Decode: D0301B Sentinel Gate',
    '',
    decodeTable(decodeWindow(0x0018AF, 0x0018F8)),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      adjudication: ab,
      oracleAfter: data.oracleAfter,
      live: {
        portSkipControl: {
          status: data.live.portSkipControl.state.status,
          keyState: data.live.portSkipControl.state.keyState,
          afterBoot: data.live.portSkipControl.afterBoot,
          targetCounts: data.live.portSkipControl.route.targetCounts,
          mutations: data.live.portSkipControl.route.mutations,
          pageErrors: data.live.portSkipControl.state.pageErrors,
        },
        sentinelForced: {
          status: data.live.sentinelForced.state.status,
          keyState: data.live.sentinelForced.state.keyState,
          afterBoot: data.live.sentinelForced.afterBoot,
          targetCounts: data.live.sentinelForced.route.targetCounts,
          mutations: data.live.sentinelForced.route.mutations,
          pageErrors: data.live.sentinelForced.state.pageErrors,
        },
      },
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  const live = await runLiveBrowserRoute();
  const oracleAfter = captureOracleFields();
  const adjudication = analyzePhase874(live, oracleAfter);
  return {
    probe: 'phase874-d0301b-sentinel-ab',
    pass: adjudication.pass,
    live,
    oracleAfter,
    adjudication,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    controlTakesMismatch: summary.adjudication.controlTakesMismatch,
    forcedMutationApplied: summary.adjudication.forcedMutationApplied,
    forcedTakesShortTail: summary.adjudication.forcedTakesShortTail,
    forcedCoreOracle: summary.adjudication.variants.forced.postKeyCoreMatchesOracle,
    conclusion: summary.adjudication.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase874-d0301b-sentinel-ab', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

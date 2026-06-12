import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase640-browser-coldboot-state.md');
const shellRoot = __dirname;
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const EVENT_LOOP = 0x08C331;
const debugPort = 9640;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase640-'));

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!chromePath) {
  throw new Error('No Chrome/Edge executable found for headless browser test');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(mem, addr) {
  return (mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function readFields(mem) {
  return {
    D007CA: read24(mem, 0xD007CA),
    D007E0: mem[0xD007E0] ?? 0,
    D008E0: read24(mem, 0xD008E0),
    D0231A: read24(mem, 0xD0231A),
    D0243A: read24(mem, 0xD0243A),
    D02587: read24(mem, 0xD02587),
    D0258A: read24(mem, 0xD0258A),
    D0258D: read24(mem, 0xD0258D),
    D02590: read24(mem, 0xD02590),
    D02593: read24(mem, 0xD02593),
    D0259A: read24(mem, 0xD0259A),
    D0259D: read24(mem, 0xD0259D),
    D025A0: read24(mem, 0xD025A0),
    D025C5: read24(mem, 0xD025C5),
  };
}

function fieldDiff(before, after) {
  const diff = {};
  for (const key of Object.keys(after)) {
    if (before?.[key] !== after[key]) diff[key] = [before?.[key], after[key]];
  }
  return diff;
}

function countVRAMPixels(mem) {
  let count = 0;
  for (let addr = 0xD40000; addr < 0xD40000 + (320 * 240 * 2); addr += 2) {
    if (mem[addr] !== 0xFF || mem[addr + 1] !== 0xFF) count++;
  }
  return count;
}

function summarizeResult(result) {
  return result ? {
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
  } : null;
}

function snapshot(label, cpu, mem, result = null) {
  return {
    label,
    result: summarizeResult(result),
    cpu: {
      pc: cpu.pc ?? null,
      sp: cpu.sp ?? null,
      iy: cpu.iy ?? cpu._iy ?? null,
      ix: cpu.ix ?? cpu._ix ?? null,
      halted: cpu.halted,
      iff1: cpu.iff1,
      iff2: cpu.iff2,
      mbase: cpu.mbase,
      madl: cpu.madl,
    },
    fields: readFields(mem),
    vramPixels: countVRAMPixels(mem),
  };
}

const targetAddrs = {
  launch09dd62: LAUNCH_HOME,
  memInit09dee0: 0x09DEE0,
  memInitStore09defc: 0x09DEFC,
  repaint058241: HOME_REPAINT,
  vatLoop084711: 0x084711,
  vatRewind082be2: 0x082BE2,
  cleanup0018f8: 0x0018F8,
  halt0019b5: HALT_IDLE,
};

function makePhaseStats(label, mem) {
  return {
    label,
    totalBlocks: 0,
    targetCounts: Object.fromEntries(Object.keys(targetAddrs).map((name) => [name, 0])),
    fieldTransitions: [],
    firstBlocks: [],
    lastBlocks: [],
    hotBlocks: {},
    lastFields: readFields(mem),
  };
}

function observePhase(stats, mem, pc) {
  const addr = pc & 0xFFFFFF;
  stats.totalBlocks++;
  const pcHex = hex(addr);
  stats.hotBlocks[pcHex] = (stats.hotBlocks[pcHex] || 0) + 1;
  if (stats.firstBlocks.length < 24) stats.firstBlocks.push(pcHex);
  stats.lastBlocks.push(pcHex);
  if (stats.lastBlocks.length > 24) stats.lastBlocks.shift();
  for (const [name, target] of Object.entries(targetAddrs)) {
    if (addr === target) stats.targetCounts[name]++;
  }
  const now = readFields(mem);
  const diff = fieldDiff(stats.lastFields, now);
  if (Object.keys(diff).length && stats.fieldTransitions.length < 40) {
    stats.fieldTransitions.push({ block: stats.totalBlocks, pc: pcHex, diff });
  }
  stats.lastFields = now;
}

function finalizeStats(stats) {
  return {
    ...stats,
    hotBlocks: Object.entries(stats.hotBlocks)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([pc, count]) => ({ pc, count })),
  };
}

function makeMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function runObserved(executor, mem, label, entry, mode, opts) {
  const stats = makePhaseStats(label, mem);
  const result = executor.runFrom(entry, mode, {
    ...opts,
    onBlock(pc) {
      observePhase(stats, mem, pc);
      opts.onBlock?.(pc);
    },
  });
  return { result, stats: finalizeStats(stats) };
}

function prepareProbeStyleRepaintFrame(cpu, mem, peripherals) {
  peripherals.setTimerEnabled(true);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_TOP - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
}

function runDirectProbeRecipe() {
  const { mem, peripherals, executor, cpu } = makeMachine();
  const records = [];
  const phaseStats = {};

  const p1 = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  records.push(snapshot('direct-after-p1-coldboot', cpu, mem, p1));

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  const p2 = executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  records.push(snapshot('direct-after-p2-kernel', cpu, mem, p2));

  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  const p3 = executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  records.push(snapshot('direct-after-p3-postinit', cpu, mem, p3));

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  const p4 = executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 });
  records.push(snapshot('direct-after-p4-warm-idle', cpu, mem, p4));

  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_TOP - 24;
  cpu.sp = launchSp;
  fillSentinel(mem, cpu.sp, 24);
  write24(mem, launchSp, WARM_IDLE);
  write24(mem, 0xD008E0, launchSp);
  records.push(snapshot('direct-before-p5-launch-home', cpu, mem));
  const p5 = runObserved(executor, mem, 'direct-p5-launch-home', LAUNCH_HOME, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
  });
  phaseStats[p5.stats.label] = p5.stats;
  records.push(snapshot('direct-after-p5-launch-home', cpu, mem, p5.result));

  prepareProbeStyleRepaintFrame(cpu, mem, peripherals);
  records.push(snapshot('direct-after-p6-probe-frame', cpu, mem));
  const p6 = runObserved(executor, mem, 'direct-p6-home-repaint', HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
  });
  phaseStats[p6.stats.label] = p6.stats;
  records.push(snapshot('direct-after-p6-home-repaint', cpu, mem, p6.result));

  return { records, phaseStats };
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
  const injection = String.raw`
const PHASE640_TARGETS = Object.freeze({
  launch09dd62: 0x09DD62,
  memInit09dee0: 0x09DEE0,
  memInitStore09defc: 0x09DEFC,
  repaint058241: 0x058241,
  vatLoop084711: 0x084711,
  vatRewind082be2: 0x082BE2,
  cleanup0018f8: 0x0018F8,
  halt0019b5: 0x0019B5,
});

function phase640Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase640Read24(mem, addr) {
  return ((mem[addr] ?? 0) | ((mem[addr + 1] ?? 0) << 8) | ((mem[addr + 2] ?? 0) << 16)) >>> 0;
}

function phase640ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return {
    D007CA: phase640Read24(mem, 0xD007CA),
    D007E0: mem[0xD007E0] ?? 0,
    D008E0: phase640Read24(mem, 0xD008E0),
    D0231A: phase640Read24(mem, 0xD0231A),
    D0243A: phase640Read24(mem, 0xD0243A),
    D02587: phase640Read24(mem, 0xD02587),
    D0258A: phase640Read24(mem, 0xD0258A),
    D0258D: phase640Read24(mem, 0xD0258D),
    D02590: phase640Read24(mem, 0xD02590),
    D02593: phase640Read24(mem, 0xD02593),
    D0259A: phase640Read24(mem, 0xD0259A),
    D0259D: phase640Read24(mem, 0xD0259D),
    D025A0: phase640Read24(mem, 0xD025A0),
    D025C5: phase640Read24(mem, 0xD025C5),
  };
}

function phase640DiffFields(before, after) {
  const diff = {};
  if (!after) return diff;
  for (const key of Object.keys(after)) {
    if (before?.[key] !== after[key]) diff[key] = [before?.[key], after[key]];
  }
  return diff;
}

function phase640Result(result) {
  return result ? {
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
  } : null;
}

function phase640ReadState(label, result = null) {
  return {
    label,
    result: phase640Result(result),
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: cpu ? {
      pc: cpu.pc,
      sp: cpu.sp,
      iy: cpu.iy ?? cpu._iy,
      ix: cpu.ix ?? cpu._ix,
      halted: cpu.halted,
      iff1: cpu.iff1,
      iff2: cpu.iff2,
      mbase: cpu.mbase,
      madl: cpu.madl,
    } : null,
    fields: phase640ReadFields(),
    vramPixels: countVRAMPixels(),
    status: document.getElementById('status')?.textContent ?? null,
  };
}

function phase640CreateStats(label) {
  return {
    label,
    totalBlocks: 0,
    targetCounts: Object.fromEntries(Object.keys(PHASE640_TARGETS).map((name) => [name, 0])),
    fieldTransitions: [],
    firstBlocks: [],
    lastBlocks: [],
    hotBlocks: {},
    lastFields: phase640ReadFields(),
  };
}

function phase640Observe(stats, pc) {
  const addr = pc & 0xFFFFFF;
  stats.totalBlocks++;
  const pcHex = phase640Hex(addr);
  stats.hotBlocks[pcHex] = (stats.hotBlocks[pcHex] || 0) + 1;
  if (stats.firstBlocks.length < 24) stats.firstBlocks.push(pcHex);
  stats.lastBlocks.push(pcHex);
  if (stats.lastBlocks.length > 24) stats.lastBlocks.shift();
  for (const [name, target] of Object.entries(PHASE640_TARGETS)) {
    if (addr === target) stats.targetCounts[name]++;
  }
  const now = phase640ReadFields();
  const diff = phase640DiffFields(stats.lastFields, now);
  if (Object.keys(diff).length && stats.fieldTransitions.length < 40) {
    stats.fieldTransitions.push({ block: stats.totalBlocks, pc: pcHex, diff });
  }
  stats.lastFields = now;
}

function phase640FinalizeStats(stats) {
  stats.hotBlocks = Object.entries(stats.hotBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([pc, count]) => ({ pc, count }));
  return stats;
}

function phase640RunOptions(label, opts) {
  const stats = phase640CreateStats(label);
  window.__phase640.phaseStats[label] = stats;
  return {
    ...opts,
    onBlock(pc, mode, meta, step) {
      phase640Observe(stats, pc);
      opts.onBlock?.(pc, mode, meta, step);
    },
  };
}

function phase640Record(label, result = null) {
  const record = phase640ReadState(label, result);
  window.__phase640.records.push(record);
  return record;
}

function phase640Finish(label) {
  const stats = window.__phase640.phaseStats[label];
  if (stats) window.__phase640.phaseStats[label] = phase640FinalizeStats(stats);
}

window.__phase640 = {
  records: [],
  phaseStats: {},
  readState: phase640ReadState,
};
`;

  if (!html.includes('function initializeColdbootRuntime() {')) {
    throw new Error('initializeColdbootRuntime marker not found');
  }
  let out = html.replace('function initializeColdbootRuntime() {', `${injection}\n\nfunction initializeColdbootRuntime() {`);

  out = out.replace(
    /  const p5 = executor\.runFrom\(COLDBOOT_LAUNCH_HOME_INIT, 'adl', \{ maxSteps: 300000, maxLoopIterations: 30000 \}\);/,
    `  phase640Record('browser-before-p5-launch-home');
  const p5 = executor.runFrom(COLDBOOT_LAUNCH_HOME_INIT, 'adl', phase640RunOptions('browser-p5-launch-home', { maxSteps: 300000, maxLoopIterations: 30000 }));
  phase640Finish('browser-p5-launch-home');
  phase640Record('browser-after-p5-launch-home', p5);`,
  );

  out = out.replace(
    /(  peripherals\?\.setTimerEnabled\?\.\(true\);\r?\n  prepareColdbootEventFrame\(\);)/,
    `$1
  phase640Record('browser-after-p6-event-frame');`,
  );

  out = out.replace(
    /  const p6 = executor\.runFrom\(COLDBOOT_HOME_REPAINT, 'adl', \{ maxSteps: 300000, maxLoopIterations: 30000 \}\);/,
    `  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', phase640RunOptions('browser-p6-home-repaint', { maxSteps: 300000, maxLoopIterations: 30000 }));
  phase640Finish('browser-p6-home-repaint');
  phase640Record('browser-after-p6-home-repaint', p6);`,
  );

  if (!out.includes("phase640Record('browser-after-p5-launch-home'")) {
    throw new Error('Phase 5 instrumentation replacement failed');
  }
  if (!out.includes("phase640Record('browser-after-p6-home-repaint'")) {
    throw new Error('Phase 6 instrumentation replacement failed');
  }
  return out;
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
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
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception');
  }
  return result.result.value;
}

async function waitFor(ws, expression, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    const value = await evalExpr(ws, expression, 10000);
    lastValue = value;
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}; lastValue=${JSON.stringify(lastValue)}`);
}

async function runBrowserColdbootProbe() {
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
    await waitFor(ws, '!!window.__phase640', 'phase640 instrumentation', 30000);
    await sleep(1000);

    const clickResult = await evalExpr(ws, `(() => {
      const boot = document.getElementById('btnBoot');
      document.getElementById('coldbootMode').checked = true;
      document.getElementById('preserveDisplay').checked = true;
      boot.click();
      return { disabled: boot.disabled, status: document.getElementById('status').textContent };
    })()`);
    await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 150000);
    const state = await evalExpr(ws, `(() => ({
      clickResult: ${JSON.stringify(clickResult)},
      status: document.getElementById('status')?.textContent ?? null,
      records: window.__phase640.records,
      phaseStats: window.__phase640.phaseStats,
      final: window.__phase640.readState('browser-final'),
      logTail: Array.from(document.getElementById('log')?.querySelectorAll('.info') || []).slice(-12).map((n) => n.textContent),
    }))()`);
    return { pageUrl, state };
  } finally {
    try { ws?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    try { server?.close(); } catch {}
    await sleep(500);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

function findRecord(records, label) {
  return records.find((record) => record.label === label) ?? null;
}

function shortRecord(record) {
  if (!record) return null;
  return {
    label: record.label,
    result: record.result ? {
      steps: record.result.steps,
      termination: record.result.termination,
      lastPc: hex(record.result.lastPc),
    } : null,
    sp: record.cpu?.sp != null ? hex(record.cpu.sp) : null,
    pc: record.cpu?.pc != null ? hex(record.cpu.pc) : null,
    halted: record.cpu?.halted,
    fields: Object.fromEntries(Object.entries(record.fields ?? {}).map(([key, value]) => [
      key,
      key === 'D007E0' ? hex(value, 2) : hex(value, 6),
    ])),
    vramPixels: record.vramPixels,
    status: record.status,
  };
}

function shortStats(stats) {
  if (!stats) return null;
  return {
    label: stats.label,
    totalBlocks: stats.totalBlocks,
    targetCounts: stats.targetCounts,
    firstBlocks: stats.firstBlocks?.slice(0, 12),
    lastBlocks: stats.lastBlocks?.slice(-12),
    hotBlocks: stats.hotBlocks?.slice(0, 8),
    fieldTransitions: stats.fieldTransitions?.slice(0, 12),
  };
}

function classify(summary) {
  const bP5 = findRecord(summary.browser.state.records, 'browser-after-p5-launch-home');
  const bFrame = findRecord(summary.browser.state.records, 'browser-after-p6-event-frame');
  const bP6 = findRecord(summary.browser.state.records, 'browser-after-p6-home-repaint');
  const dP5 = findRecord(summary.direct.records, 'direct-after-p5-launch-home');
  const dFrame = findRecord(summary.direct.records, 'direct-after-p6-probe-frame');
  const dP6 = findRecord(summary.direct.records, 'direct-after-p6-home-repaint');
  const bP5Vat = bP5?.fields?.D02590 ?? 0;
  const bFrameVat = bFrame?.fields?.D02590 ?? 0;
  const bP6Vat = bP6?.fields?.D02590 ?? 0;
  const dP5Vat = dP5?.fields?.D02590 ?? 0;
  const dFrameVat = dFrame?.fields?.D02590 ?? 0;
  const dP6Vat = dP6?.fields?.D02590 ?? 0;
  const bP5MemInit = summary.browser.state.phaseStats['browser-p5-launch-home']?.targetCounts?.memInit09dee0 ?? 0;
  const dP5MemInit = summary.direct.phaseStats['direct-p5-launch-home']?.targetCounts?.memInit09dee0 ?? 0;

  let finding = '';
  if (bP5Vat === 0 && dP5Vat === 0) {
    finding = 'both browser and direct phase597-style launch-home state still have D02590=0 after 0x09DD62; the browser VAT=0 log is not just a browser read/export bug';
  } else if (bP5Vat === 0 && dP5Vat !== 0) {
    finding = 'browser-specific launch-home divergence: direct recipe initializes VAT but browser Phase 5 does not';
  } else if (bP5Vat !== 0 && bP6Vat === 0) {
    finding = 'browser Phase 6/repaint path clears VAT after a nonzero Phase 5 state';
  } else if (bP5Vat !== 0 && bP6Vat !== 0) {
    finding = 'VAT survives Phase 5 and Phase 6; the residual is elsewhere';
  } else {
    finding = 'VAT transition pattern is mixed; inspect detailed records';
  }

  return {
    finding,
    browser: {
      afterP5D02590: bP5Vat,
      afterFrameD02590: bFrameVat,
      afterP6D02590: bP6Vat,
      afterP5MemInitHits: bP5MemInit,
      afterP6Termination: bP6?.result?.termination,
      afterP6LastPc: bP6?.result?.lastPc,
    },
    direct: {
      afterP5D02590: dP5Vat,
      afterFrameD02590: dFrameVat,
      afterP6D02590: dP6Vat,
      afterP5MemInitHits: dP5MemInit,
      afterP6Termination: dP6?.result?.termination,
      afterP6LastPc: dP6?.result?.lastPc,
    },
  };
}

function markdownTable(records) {
  const rows = [
    '| Label | Term | Steps | Last PC | D007CA | D007E0 | D008E0 | D02590 | D0259A | D0259D | D025C5 | VRAM |',
    '| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | ---: |',
  ];
  for (const record of records) {
    const r = shortRecord(record);
    rows.push(`| ${r.label} | ${r.result?.termination ?? ''} | ${r.result?.steps ?? ''} | ${r.result?.lastPc ?? ''} | ${r.fields.D007CA} | ${r.fields.D007E0} | ${r.fields.D008E0} | ${r.fields.D02590} | ${r.fields.D0259A} | ${r.fields.D0259D} | ${r.fields.D025C5} | ${r.vramPixels} |`);
  }
  return rows.join('\n');
}

function buildReport(summary) {
  const verdict = summary.verdict;
  const browserRecords = summary.browser.state.records.filter((record) => [
    'browser-before-p5-launch-home',
    'browser-after-p5-launch-home',
    'browser-after-p6-event-frame',
    'browser-after-p6-home-repaint',
  ].includes(record.label));
  const directRecords = summary.direct.records.filter((record) => [
    'direct-before-p5-launch-home',
    'direct-after-p5-launch-home',
    'direct-after-p6-probe-frame',
    'direct-after-p6-home-repaint',
  ].includes(record.label));

  return [
    '# Phase 640: Browser Coldboot State Residual',
    '',
    'Probe: `probe-phase640-browser-coldboot-state.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase640-browser-coldboot-state.mjs`  ',
    `Exit: ${summary.pass ? 0 : 1}`,
    '',
    '## Summary',
    '',
    `- *** Browser Phase 5/6 snapshots were captured from an in-memory instrumented browser shell; no repo browser/runtime/transpiler source was modified.`,
    `- *** Direct comparison used the current phase597/610-style probe recipe around \`0x09DD62\` and \`0x058241\`.`,
    `- ${summary.pass ? '***' : '!!'} Key finding: ${verdict.finding}.`,
    `- *** Browser Phase 5 MEM_INIT block hits=${verdict.browser.afterP5MemInitHits}; direct Phase 5 MEM_INIT block hits=${verdict.direct.afterP5MemInitHits}.`,
    `- *** Browser repaint ended ${verdict.browser.afterP6Termination} at ${hex(verdict.browser.afterP6LastPc ?? 0)} with D02590=${hex(verdict.browser.afterP6D02590)}; direct repaint ended ${verdict.direct.afterP6Termination} at ${hex(verdict.direct.afterP6LastPc ?? 0)} with D02590=${hex(verdict.direct.afterP6D02590)}.`,
    '',
    '## Browser Snapshots',
    '',
    markdownTable(browserRecords),
    '',
    '## Direct Probe Snapshots',
    '',
    markdownTable(directRecords),
    '',
    '## Phase Stats',
    '',
    '```json',
    JSON.stringify({
      browserP5: shortStats(summary.browser.state.phaseStats['browser-p5-launch-home']),
      browserP6: shortStats(summary.browser.state.phaseStats['browser-p6-home-repaint']),
      directP5: shortStats(summary.direct.phaseStats['direct-p5-launch-home']),
      directP6: shortStats(summary.direct.phaseStats['direct-p6-home-repaint']),
      browserLogTail: summary.browser.state.logTail,
      browserFinal: shortRecord(summary.browser.state.final),
    }, null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    verdict.browser.afterP5D02590 === 0 && verdict.direct.afterP5D02590 === 0
      ? 'The residual is now narrowed to the launch-home setup boundary rather than a browser-only Phase 6 display issue. The current browser and direct recipes both reach a clean-looking home context path, but neither leaves OPBase (`D02590`) initialized after `0x09DD62`; `0x058241` then hits the known VAT search loop (`0x084711`). The next useful test is to inspect why the `0x09DD62` frame is not reaching or preserving MEM_INIT in the current recipe, or replay a known-good post-init/VAT snapshot before repaint.'
      : 'The browser and direct recipes diverge. The next useful test is to use the direct nonzero fields as a browser-side overwrite before Phase 6, then rerun the key route counters.',
    '',
  ].join('\n');
}

const direct = runDirectProbeRecipe();
const browser = await runBrowserColdbootProbe();
const summary = {
  probe: 'phase640-browser-coldboot-state',
  direct,
  browser,
};
summary.verdict = classify(summary);
summary.pass = browser.state.records.length >= 4
  && !!browser.state.phaseStats['browser-p5-launch-home']
  && !!browser.state.phaseStats['browser-p6-home-repaint']
  && direct.records.length >= 8
  && !!direct.phaseStats['direct-p5-launch-home']
  && !!direct.phaseStats['direct-p6-home-repaint'];

fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);

console.log(JSON.stringify({
  probe: summary.probe,
  pass: summary.pass,
  verdict: summary.verdict,
  browserRecords: summary.browser.state.records.map(shortRecord),
  directRecords: summary.direct.records.map(shortRecord),
  report: path.basename(REPORT_PATH),
}, null, 2));

if (!summary.pass) process.exitCode = 1;

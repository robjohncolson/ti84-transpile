import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase887-owner-leg-termination-trace.md');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const debugPort = 9887;
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const OWNER_ENTRY = 0x0454BE;
const OWNER_STORE_BLOCK = 0x040BF0;
const D0301B_MAGIC = 0x5AA55A;

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
  launchHome09DD1C: 0x09DD1C,
  launchHome09DD14: 0x09DD14,
  memInit09DEE0: 0x09DEE0,
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
const PHASE887_CONFIG = Object.freeze(${JSON.stringify({
    label: scenario.label,
    stopBeforePc: scenario.stopBeforePc ?? null,
  })});
const PHASE887_STOP = '__PHASE887_STOP__';
const PHASE887_WATCHED_FIELDS = Object.freeze(${JSON.stringify(WATCHED_FIELDS)});
const PHASE887_TARGETS = Object.freeze(${JSON.stringify(OWNER_TARGETS)});

function phase887ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase887ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE887_WATCHED_FIELDS.map(([name, addr, len]) => [
    name,
    phase887ReadValue(mem, addr, len),
  ]));
}

function phase887CpuRaw() {
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

function phase887Snapshot(label, pc = null, prevPc = null) {
  return {
    label,
    pc,
    prevPc,
    totalSteps,
    status: document.getElementById('status')?.textContent ?? null,
    cpu: phase887CpuRaw(),
    fields: phase887ReadFields(),
    phase6: window.__coldbootPhase6 ?? null,
    vram: countVRAMPixels?.() ?? null,
  };
}

function phase887CreateTrace() {
  return {
    label: PHASE887_CONFIG.label,
    stopBeforePc: PHASE887_CONFIG.stopBeforePc,
    blockCount: 0,
    prevPc: null,
    targetCounts: Object.fromEntries(Object.keys(PHASE887_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    fieldChanges: [],
    d0301bChanges: [],
    samplesAfterStore: [],
    hotBlocks: {},
    topHotBlocks: [],
    stop: null,
    lastFields: null,
  };
}

function phase887ObserveOwnerBlock(pc, steps) {
  const trace = window.__phase887OwnerTrace;
  if (!trace) return;
  const addr = pc & 0xFFFFFF;
  const prevPc = trace.prevPc;
  trace.blockCount += 1;
  const key = '0x' + addr.toString(16).toUpperCase().padStart(6, '0');
  trace.hotBlocks[key] = (trace.hotBlocks[key] || 0) + 1;

  const fields = phase887ReadFields();
  if (fields && trace.lastFields) {
    for (const [name] of PHASE887_WATCHED_FIELDS) {
      if (fields[name] === trace.lastFields[name]) continue;
      const change = { block: trace.blockCount, name, from: trace.lastFields[name], to: fields[name], pc: addr, prevPc };
      trace.fieldChanges.push(change);
      if (name === 'D0301B') trace.d0301bChanges.push(change);
    }
  }
  trace.lastFields = fields;

  for (const [name, target] of Object.entries(PHASE887_TARGETS)) {
    if (addr !== target) continue;
    trace.targetCounts[name] += 1;
    if (!trace.targetFirst[name]) trace.targetFirst[name] = phase887Snapshot(name, addr, prevPc);
  }

  if (trace.targetCounts.ownerStore040BF0 > 0 && trace.samplesAfterStore.length < 60) {
    trace.samplesAfterStore.push(phase887Snapshot('after-store-window', addr, prevPc));
  }

  if (PHASE887_CONFIG.stopBeforePc != null && addr === PHASE887_CONFIG.stopBeforePc) {
    trace.stop = {
      block: trace.blockCount,
      stopBeforePc: addr,
      prevPc,
      steps,
      snapshot: phase887Snapshot('stop-before-target', addr, prevPc),
    };
    throw new Error(PHASE887_STOP);
  }

  trace.prevPc = addr;
}

function phase887FinishTrace() {
  const trace = window.__phase887OwnerTrace;
  if (!trace) return null;
  trace.topHotBlocks = Object.entries(trace.hotBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([pc, count]) => ({ pc, count }));
  return trace;
}

function phase887RunOwner(entry) {
  window.__phase887OwnerTrace = phase887CreateTrace();
  window.__phase887OwnerTrace.lastFields = phase887ReadFields();
  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: 60000,
      maxLoopIterations: 10000,
      onBlock(pc, mode, meta, steps) {
        phase887ObserveOwnerBlock(pc, steps);
      },
    });
    phase887FinishTrace();
    return result;
  } catch (error) {
    if (String(error?.message || error) !== PHASE887_STOP) throw error;
    phase887FinishTrace();
    const stop = window.__phase887OwnerTrace.stop;
    return {
      steps: stop?.steps ?? 0,
      termination: 'stopped_before_target',
      lastPc: stop?.stopBeforePc ?? PHASE887_CONFIG.stopBeforePc,
      lastMode: 'adl',
      halted: Boolean(cpu?.halted),
      loopsForced: null,
      blockVisits: {},
      dynamicTargets: [],
      missingBlocks: [],
    };
  }
}

window.__phase887Read = (label = 'snapshot') => ({
  label,
  config: PHASE887_CONFIG,
  ownerTrace: window.__phase887OwnerTrace ?? null,
  naturalOwner: window.__coldbootNaturalD0301BOwner ?? null,
  phase6: window.__coldbootPhase6 ?? null,
  snapshot: phase887Snapshot(label),
});
`;

  let html = sourceHtml.replace(marker, `${instrumentation}\n\n${marker}`);
  html = html.replace(ownerRun, `const owner = phase887RunOwner(COLDBOOT_D0301B_OWNER_ENTRY);`);
  html = html.replace(phase6Line, `  window.__phase887AfterReplayBeforePhase6 = phase887Snapshot('after-replay-before-phase6');\n${phase6Line}`);
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

async function runBrowserScenario(scenario) {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `ti84-phase887-${scenario.label}-`));
  let chrome;
  let server;
  try {
    server = await startStaticServer(scenario);
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
    await waitFor(ws, 'typeof window.__phase887Read === "function"', 'phase887 instrumentation', 30000);
    await sleep(250);

    await evalExpr(ws, `(() => {
      document.getElementById('coldbootMode').checked = true;
      document.getElementById('preserveDisplay').checked = true;
      document.getElementById('btnBoot').click();
      return true;
    })()`);
    await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
    await sleep(150);

    const raw = await evalExpr(ws, `window.__phase887Read(${JSON.stringify(scenario.label)})`, 60000);
    return formatBrowserSummary(raw);
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

function findCandidateStop(baseline) {
  const change = baseline.ownerTrace?.d0301bChanges?.[0] ?? null;
  if (!change?.pc) return null;
  const numeric = Number.parseInt(change.pc, 16);
  return Number.isFinite(numeric) ? numeric : null;
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
  const scenarioRows = data.scenarios.map((row) => ({
    label: row.label,
    stop: row.config.stopBeforePc ?? '-',
    owner: row.naturalOwner ? `${row.naturalOwner.termination} ${row.naturalOwner.steps} @ ${row.naturalOwner.lastPc}` : '-',
    d0301b: row.naturalOwner?.afterD0301B ?? '-',
    phase6: row.phase6 ? `${row.phase6.termination} ${row.phase6.steps} @ ${row.phase6.lastPc}` : '-',
    vram: row.phase6?.vram ?? '-',
    store: row.ownerTrace?.targetCounts?.ownerStore040BF0 ?? 0,
    stopHit: row.ownerTrace?.stop ? 'yes' : 'no',
  }));

  const targetRows = Object.entries(data.baseline.ownerTrace?.targetCounts ?? {}).map(([name, count]) => ({
    name,
    count,
    first: data.baseline.ownerTrace?.targetFirst?.[name]?.pc ?? '-',
    prev: data.baseline.ownerTrace?.targetFirst?.[name]?.prevPc ?? '-',
  }));

  const staticRows = [
    { pc: '0x040BF0', note: 'Lifted block writes D0301B then branches based on D1A880 bit 0.' },
    { pc: '0x040C10', note: 'Observed first post-store block in the current browser route.' },
    { pc: '0x09E0D9', note: 'Static alternate post-store target, not hit by the current no-force browser route if count is 0.' },
    { pc: '0x04C8A3', note: 'Current cap location/helper reached only if the post-store tail is allowed to continue.' },
  ];

  return [
    '# Phase 887: Owner-Leg Termination Trace',
    '',
    'Probe: `probe-phase887-owner-leg-termination-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase887-owner-leg-termination-trace.mjs`',
    '',
    'Serves temporary instrumented copies of `browser-shell.html`; the disk browser shell is not edited.',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Baseline owner leg: ${data.baseline.naturalOwner.termination} after ${data.baseline.naturalOwner.steps} steps at ${data.baseline.naturalOwner.lastPc}; D0301B=${data.baseline.naturalOwner.afterD0301B}.`,
    `- First post-store block from fresh browser output: ${data.candidateStopHex}.`,
    `- Candidate stop: ${data.candidate.naturalOwner.termination} after ${data.candidate.naturalOwner.steps} steps at ${data.candidate.naturalOwner.lastPc}; D0301B=${data.candidate.naturalOwner.afterD0301B}.`,
    `- Candidate Phase 6: ${data.candidate.phase6.termination} after ${data.candidate.phase6.steps} steps at ${data.candidate.phase6.lastPc}; VRAM=${data.candidate.phase6.vram}.`,
    `- Baseline vs candidate post-boot watched-field diff: ${data.postBootDiffs.length} mismatches.`,
    `- Adjudication: ${data.conclusion}`,
    '',
    '## Scenario Comparison',
    '',
    table(scenarioRows, [
      { label: 'Scenario', value: (row) => row.label },
      { label: 'Stop before', value: (row) => row.stop },
      { label: 'Owner result', value: (row) => row.owner },
      { label: 'D0301B', value: (row) => row.d0301b },
      { label: 'Phase 6', value: (row) => row.phase6 },
      { label: 'VRAM', value: (row) => row.vram },
      { label: 'Store hits', value: (row) => row.store },
      { label: 'Stop hit', value: (row) => row.stopHit },
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
    '## D0301B Change Evidence',
    '',
    'Baseline:',
    '',
    table(data.baseline.ownerTrace?.d0301bChanges ?? [], [
      { label: 'Block', value: (row) => row.block },
      { label: 'From', value: (row) => row.from },
      { label: 'To', value: (row) => row.to },
      { label: 'PC', value: (row) => row.pc },
      { label: 'Prev PC', value: (row) => row.prevPc },
    ]),
    '',
    'Candidate:',
    '',
    table(data.candidate.ownerTrace?.d0301bChanges ?? [], [
      { label: 'Block', value: (row) => row.block },
      { label: 'From', value: (row) => row.from },
      { label: 'To', value: (row) => row.to },
      { label: 'PC', value: (row) => row.pc },
      { label: 'Prev PC', value: (row) => row.prevPc },
    ]),
    '',
    '## Post-Boot Diff',
    '',
    table(data.postBootDiffs, [
      { label: 'Field', value: (row) => row.name },
      { label: 'Baseline', value: (row) => row.baseline },
      { label: 'Candidate', value: (row) => row.candidate },
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
  const baseline = await runBrowserScenario({ label: 'baseline-full-owner-leg', stopBeforePc: null });
  const candidateStop = findCandidateStop(baseline);
  if (candidateStop == null) throw new Error('Could not identify first post-store block from baseline D0301B change trace');
  const candidate = await runBrowserScenario({ label: `candidate-stop-before-${hex(candidateStop)}`, stopBeforePc: candidateStop });
  const postBootDiffs = compareFields(baseline.snapshot?.fields, candidate.snapshot?.fields);

  const baselineCapObserved = baseline.naturalOwner?.termination === 'max_steps'
    && baseline.naturalOwner?.lastPc === hex(0x04C8A3);
  const candidateSafe = candidate.ownerTrace?.stop
    && candidate.naturalOwner?.afterD0301B === hex(D0301B_MAGIC)
    && candidate.phase6?.termination === 'halt'
    && candidate.phase6?.lastPc === hex(0x0019B5)
    && candidate.phase6?.vram === baseline.phase6?.vram
    && postBootDiffs.length === 0;
  const diagnosticComplete = baselineCapObserved
    && candidate.ownerTrace?.stop
    && candidate.naturalOwner?.afterD0301B === hex(D0301B_MAGIC)
    && candidate.phase6?.termination === 'halt'
    && candidate.phase6?.lastPc === hex(0x0019B5)
    && postBootDiffs.length === 0;

  const conclusion = candidateSafe
    ? `Stop before ${hex(candidateStop)} is the report-only safe candidate: it executes the ${hex(OWNER_STORE_BLOCK)} block that writes D0301B, avoids the remaining owner tail and its ${baselineCapObserved ? 'observed 60K cap' : 'post-store side leg'}, and matches the baseline post-boot watched fields plus Phase 6 VRAM.`
    : `The exact first post-store block is ${hex(candidateStop)}, but stopping there is not safe to prototype yet: watched post-boot fields match, but Phase 6 VRAM changes from ${baseline.phase6?.vram} to ${candidate.phase6?.vram}. Trace a later post-store stop after the visual side effects settle and before the 60K cap.`;

  return {
    pass: Boolean(diagnosticComplete),
    conclusion,
    candidateStop,
    candidateStopHex: hex(candidateStop),
    baselineCapObserved,
    candidateSafe: Boolean(candidateSafe),
    diagnosticComplete: Boolean(diagnosticComplete),
    baseline,
    candidate,
    scenarios: [baseline, candidate],
    postBootDiffs,
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
    candidateStop: summary.candidateStopHex,
    candidateOwner: summary.candidate.naturalOwner,
    postBootDiffs: summary.postBootDiffs.length,
    conclusion: summary.conclusion,
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { pass: false, error: String(error?.stack || error) };
  try {
    fs.writeFileSync(REPORT_PATH, `${buildReport({
      pass: false,
      conclusion: 'Probe failed before completing both browser scenarios.',
      candidateStopHex: '-',
      baseline: { label: 'baseline', naturalOwner: {}, ownerTrace: {}, phase6: {}, snapshot: {} },
      candidate: { label: 'candidate', naturalOwner: {}, ownerTrace: {}, phase6: {}, snapshot: {} },
      scenarios: [],
      postBootDiffs: [],
      error: summary.error,
    })}\n\n\`\`\`text\n${summary.error}\n\`\`\`\n`);
  } catch {}
  console.error(summary.error);
  process.exitCode = 1;
}

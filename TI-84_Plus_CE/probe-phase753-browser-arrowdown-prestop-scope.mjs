import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase753-browser-arrowdown-prestop-scope.md');
const debugPort = 9753;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase753-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const ARROWDOWN_FALLBACK_STEP_CAP = 190000;
const ARROWDOWN_PRESTOP_PC = 0x001879;
const ARROWDOWN_PRESTOP_LABEL = 'arrow-down-cleanup-prewipe-owner';

let nextId = 1;
const pending = new Map();
const pageErrors = [];
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

function instrumentBrowserShell(html) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) throw new Error('Instrumentation marker not found in browser-shell.html');

  const burstRegex = /function getColdbootKeyBurstStepsForCode\(code\) \{\s+return code === EOL_PC_CODE\s+\? Math\.max\(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS\)\s+: COLDBOOT_KEY_BURST_STEPS;\s+\}/;
  const cappedHtml = html.replace(burstRegex, `function getColdbootKeyBurstStepsForCode(code) {
  if (code === 'ArrowDown') return ${ARROWDOWN_FALLBACK_STEP_CAP};
  return code === EOL_PC_CODE
    ? Math.max(COLDBOOT_KEY_BURST_STEPS, COLDBOOT_EOL_KEY_BURST_STEPS)
    : COLDBOOT_KEY_BURST_STEPS;
}`);
  if (cappedHtml === html) throw new Error('ArrowDown burst cap patch point not found');

  const injection = String.raw`
const PHASE753_ARROW_DOWN_STOP = Object.freeze({
  pc: ${ARROWDOWN_PRESTOP_PC},
  label: '${ARROWDOWN_PRESTOP_LABEL}',
});

const PHASE753_TARGETS = Object.freeze({
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  sentinel001c33: 0x001C33,
  sentinel0158bc: 0x0158BC,
  postInsertGate0158de: 0x0158DE,
  low000b7c: 0x000B7C,
  coldIdle0019b5: 0x0019B5,
});

const PHASE753_FIELD_SPECS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02590', 0xD02590, 3],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00080', 0xD00080, 1],
  ['D000C2', 0xD000C2, 1],
  ['D02A28', 0xD02A28, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A40', 0xD02A40, 3],
]);

const PHASE753_CRITICAL_FIELDS = Object.freeze(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590']);

function phase753Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase753ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase753ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE753_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase753ReadValue(mem, addr, len),
  ]));
}

function phase753ReadStackSlots(count = 6) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: phase753ReadValue(mem, addr, 3) };
  });
}

function phase753CpuRaw() {
  return cpu ? {
    pc: cpu.pc ?? 0,
    sp: cpu.sp ?? 0,
    af: cpu.af ?? 0,
    bc: cpu.bc ?? 0,
    de: cpu.de ?? 0,
    hl: cpu.hl ?? 0,
    ix: cpu._ix ?? cpu.ix ?? 0,
    iy: cpu._iy ?? cpu.iy ?? 0,
    f: cpu.f ?? 0,
    halted: Boolean(cpu.halted),
    madl: cpu.madl ?? 0,
    stepCount: cpu.stepCount ?? 0,
  } : null;
}

function phase753Has202020(fields, stackTop = []) {
  return Object.values(fields ?? {}).some((value) => value === 0x202020)
    || stackTop.some((slot) => slot.value === 0x202020);
}

function phase753HasCriticalZero(fields) {
  return PHASE753_CRITICAL_FIELDS.some((name) => fields?.[name] === 0);
}

function phase753DiffFields(before, after) {
  const diff = {};
  for (const name of Object.keys(after ?? {})) {
    if ((before?.[name] ?? null) !== after[name]) diff[name] = { before: before?.[name] ?? null, after: after[name] };
  }
  return diff;
}

function phase753Snapshot(record, pc, fields = null) {
  return {
    block: record?.totalBlocks ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPcRaw ?? null,
    cpu: phase753CpuRaw(),
    fields: fields ?? phase753ReadFields(),
    stackTop: phase753ReadStackSlots(6),
    vram: countVRAMPixels?.() ?? null,
  };
}

function phase753CreateRecord(label) {
  return {
    label,
    totalBlocks: 0,
    prevPcRaw: null,
    prevPc: null,
    firstBlocks: [],
    lastBlocks: [],
    counts: Object.fromEntries(Object.keys(PHASE753_TARGETS).map((name) => [name, 0])),
    firstSamples: {},
    fieldTransitions: [],
    firstCriticalZero: null,
    first202020: null,
    lastFields: null,
  };
}

function phase753Read(label = 'read') {
  const fields = phase753ReadFields();
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase753CpuRaw(),
    fields,
    stackTop: phase753ReadStackSlots(6),
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase753PageErrors ?? [])],
  };
}

window.__phase753PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase753PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase753PageErrors.push(String(event.reason || event));
});

window.__phase753State = {
  records: [],
  begin(label) {
    const record = phase753CreateRecord(label);
    this.records.push(record);
    const start = phase753Read('start');
    record.start = start;
    record.lastFields = start.fields;
    return start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase753Read('end');
      if (!record.firstCriticalZero && phase753HasCriticalZero(record.end.fields)) {
        record.firstCriticalZero = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.first202020 && phase753Has202020(record.end.fields, record.end.stackTop)) {
        record.first202020 = { source: 'final-state-only', snapshot: record.end };
      }
    }
    return record;
  },
  read: phase753Read,
};
window.__phase753 = window.__phase753State;

const phase753OriginalGetColdbootControlPreStop = getColdbootControlPreStop;
getColdbootControlPreStop = function phase753GetColdbootControlPreStop(code) {
  if (code === 'ArrowDown') return PHASE753_ARROW_DOWN_STOP;
  return phase753OriginalGetColdbootControlPreStop(code);
};

const phase753OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase753ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  let record = window.__phase753State.records.at(-1);
  if (!record) {
    record = phase753CreateRecord('implicit');
    window.__phase753State.records.push(record);
  }

  record.totalBlocks += 1;
  if (record.firstBlocks.length < 64) record.firstBlocks.push(phase753Hex(addr));
  record.lastBlocks.push(phase753Hex(addr));
  if (record.lastBlocks.length > 128) record.lastBlocks.shift();

  const fieldsBefore = phase753ReadFields();
  const entryDiff = phase753DiffFields(record.lastFields, fieldsBefore);
  if (Object.keys(entryDiff).length && record.fieldTransitions.length < 64) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: phase753Hex(addr),
      prevPc: record.prevPc,
      timing: 'entry-vs-previous-block',
      diff: entryDiff,
    });
  }
  if (!record.firstCriticalZero && phase753HasCriticalZero(fieldsBefore)) {
    record.firstCriticalZero = { source: 'observed-before-block', snapshot: phase753Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.first202020 && phase753Has202020(fieldsBefore, phase753ReadStackSlots(6))) {
    record.first202020 = { source: 'observed-before-block', snapshot: phase753Snapshot(record, addr, fieldsBefore) };
  }

  for (const [name, target] of Object.entries(PHASE753_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = phase753Snapshot(record, addr, fieldsBefore);
  }

  const result = phase753OriginalObserveColdbootPersistenceBlock(state, pc);
  const fieldsAfter = phase753ReadFields();
  const hookDiff = phase753DiffFields(fieldsBefore, fieldsAfter);
  if (Object.keys(hookDiff).length && record.fieldTransitions.length < 64) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: phase753Hex(addr),
      prevPc: record.prevPc,
      timing: 'after-persistence-hook',
      diff: hookDiff,
    });
  }

  record.lastFields = fieldsAfter;
  record.prevPcRaw = addr;
  record.prevPc = phase753Hex(addr);
  return result;
};
`;

  return cappedHtml.replace(marker, `${injection}\n\n${marker}`);
}

function startStaticServer() {
  const serverInstance = http.createServer((req, res) => {
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
      // Chrome may still be starting.
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome DevTools endpoint');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params?.exceptionDetails?.exception?.description
        || msg.params?.exceptionDetails?.text
        || JSON.stringify(msg.params?.exceptionDetails || {}));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      pageErrors.push(msg.params.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ') || 'console error');
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function cdp(socket, method, params = {}, timeout = 175000) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, timeout);
    timer.unref?.();
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
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

function arrowDownKeyParams(type) {
  return {
    type,
    windowsVirtualKeyCode: 40,
    nativeVirtualKeyCode: 40,
    code: 'ArrowDown',
    key: 'ArrowDown',
  };
}

function hasCorrupt202020(state) {
  const values = [
    state?.lastKey?.D007CA,
    state?.lastKey?.D008E0,
    state?.lastKey?.D0243A,
    state?.lastKey?.D0243D,
    state?.lastKey?.D02590,
    state?.diagnostics?.D007CA,
    state?.diagnostics?.D008E0,
    state?.diagnostics?.D0243A,
    state?.diagnostics?.D0243D,
    state?.diagnostics?.D02590,
  ];
  return values.some((value) => value === 0x202020);
}

function hasCriticalZero(state) {
  const values = [
    state?.lastKey?.D007CA,
    state?.lastKey?.D008E0,
    state?.lastKey?.D0243A,
    state?.lastKey?.D0243D,
    state?.lastKey?.D02590,
    state?.diagnostics?.D007CA,
    state?.diagnostics?.D008E0,
    state?.diagnostics?.D0243A,
    state?.diagnostics?.D0243D,
    state?.diagnostics?.D02590,
  ];
  return values.some((value) => value === 0);
}

async function runScope() {
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
  await waitFor(ws, '!!window.__phase753 && !!window.getColdbootPersistenceDiagnostics', 'phase753 instrumentation', 30000);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  const before = await evalExpr(ws, `window.__phase753.begin('ArrowDown 0x001879 pre-stop scope')`);

  await cdp(ws, 'Input.dispatchKeyEvent', arrowDownKeyParams('keyDown'), 175000);
  await cdp(ws, 'Input.dispatchKeyEvent', arrowDownKeyParams('keyUp'), 20000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'ArrowDown'`, 'ArrowDown key completion', 30000);
  await sleep(250);

  const record = await evalExpr(ws, 'window.__phase753.finish()', 30000);
  const after = await evalExpr(ws, 'window.__phase753.read("after-finish")', 30000);
  const key = after.lastKey;
  const diag = after.diagnostics;
  const candidatePass = Boolean(
    key
    && key.code === 'ArrowDown'
    && key.termination === 'control_pre_stop'
    && key.controlPreStopPc === ARROWDOWN_PRESTOP_PC
    && key.controlStopPc === ARROWDOWN_PRESTOP_PC
    && key.controlPreStopLabel === ARROWDOWN_PRESTOP_LABEL
    && key.uiClearApplied === false
    && key.termination !== 'missing_block'
    && key.D007CA === 0x0585E9
    && key.D02590 === 0xD3FE81
    && key.D0243A === 0xD1A8CC
    && key.D008E0 !== 0
    && diag?.D007CA === 0x0585E9
    && diag?.D02590 === 0xD3FE81
    && diag?.D0243A === 0xD1A8CC
    && diag?.D008E0 !== 0
    && record?.counts?.cleanup001879 === 1
    && record?.counts?.cleanupTail0018f8 === 0
    && !record?.firstCriticalZero
    && !hasCriticalZero(after)
    && !hasCorrupt202020(after)
    && pageErrors.length === 0
    && (after.pageErrors?.length ?? 0) === 0
  );

  return {
    probe: 'phase753-browser-arrowdown-prestop-scope',
    chromePath,
    pageUrl,
    prestop: { code: 'ArrowDown', pc: ARROWDOWN_PRESTOP_PC, label: ARROWDOWN_PRESTOP_LABEL },
    fallbackStepCap: ARROWDOWN_FALLBACK_STEP_CAP,
    completed: true,
    candidatePass,
    before,
    record,
    after,
    pageErrors,
  };
}

function fmtValue(value, width = 6) {
  if (value == null) return '-';
  if (typeof value === 'number') return hex(value, width);
  return String(value);
}

function fmtFields(fields) {
  if (!fields) return {};
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => {
    const width = name.startsWith('D005') || name === 'D00080' || name === 'D000C2' || name === 'D02A28' ? 2 : 6;
    return [name, hex(value, width)];
  }));
}

function fmtCpu(cpu) {
  if (!cpu) return null;
  return {
    pc: hex(cpu.pc),
    sp: hex(cpu.sp),
    af: hex(cpu.af),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    f: hex(cpu.f, 2),
    stepCount: cpu.stepCount,
  };
}

function compactSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    block: snapshot.block,
    pc: fmtValue(snapshot.pc),
    prevPc: fmtValue(snapshot.prevPc),
    cpu: fmtCpu(snapshot.cpu),
    fields: fmtFields(snapshot.fields),
    stackTop: (snapshot.stackTop ?? []).map((slot) => ({ addr: fmtValue(slot.addr), value: fmtValue(slot.value) })),
    vram: snapshot.vram,
  };
}

function targetTable(record) {
  const counts = record?.counts ?? {};
  const samples = record?.firstSamples ?? {};
  return [
    '| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D02590 |',
    '|---|---:|---:|---|---|---|---|---|---|---|---|---|',
    ...Object.keys(counts).map((name) => {
      const sample = samples[name];
      return `| ${name} | ${counts[name] ?? 0} | ${sample?.block ?? '-'} | ${fmtValue(sample?.pc)} | ${fmtValue(sample?.prevPc)} | ${fmtValue(sample?.cpu?.bc)} | ${fmtValue(sample?.cpu?.hl)} | ${fmtValue(sample?.cpu?.de)} | ${fmtValue(sample?.cpu?.sp)} | ${fmtValue(sample?.stackTop?.[0]?.value)} | ${fmtValue(sample?.fields?.D007CA)} | ${fmtValue(sample?.fields?.D02590)} |`;
    }),
  ].join('\n');
}

function transitionTable(record) {
  const rows = record?.fieldTransitions ?? [];
  if (!rows.length) return '_No tracked field transitions captured._';
  return [
    '| Block | PC | Prev PC | Timing | Diffs |',
    '|---:|---|---|---|---|',
    ...rows.map((transition) => {
      const diffs = Object.entries(transition.diff ?? {})
        .map(([name, value]) => `${name}:${fmtValue(value.before)}->${fmtValue(value.after)}`)
        .join('; ');
      return `| ${transition.block} | ${transition.pc} | ${transition.prevPc ?? '-'} | ${transition.timing} | ${diffs.replaceAll('|', '\\|')} |`;
    }),
  ].join('\n');
}

function buildReport(data) {
  const key = data?.after?.lastKey;
  const diag = data?.after?.diagnostics;
  const record = data?.record;
  const compact = data?.error ? { error: data.error } : {
    completed: data.completed,
    candidatePass: data.candidatePass,
    prestop: data.prestop,
    fallbackStepCap: data.fallbackStepCap,
    before: {
      status: data.before?.status,
      lastPc: fmtValue(data.before?.lastPc),
      fields: fmtFields(data.before?.fields),
      vram: data.before?.vram,
    },
    after: {
      status: data.after?.status,
      lastPc: fmtValue(data.after?.lastPc),
      cpu: fmtCpu(data.after?.cpu),
      fields: fmtFields(data.after?.fields),
      diagnostics: diag,
      lastKey: key,
      pageErrors: data.after?.pageErrors,
    },
    targetCounts: record?.counts ?? {},
    firstSamples: Object.fromEntries(Object.entries(record?.firstSamples ?? {}).map(([name, value]) => [name, compactSnapshot(value)])),
    firstCriticalZero: record?.firstCriticalZero ?? null,
    first202020: record?.first202020 ?? null,
    firstBlocks: record?.firstBlocks ?? [],
    lastBlocks: record?.lastBlocks ?? [],
    pageErrors: data.pageErrors ?? [],
  };

  return [
    '# Phase 753 Browser ArrowDown Pre-Stop Scope',
    '',
    'Probe: `probe-phase753-browser-arrowdown-prestop-scope.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase753-browser-arrowdown-prestop-scope.mjs`',
    '',
    'Serves an in-memory instrumented `browser-shell.html`, boots coldboot with Preserve Display, wraps `getColdbootControlPreStop` only for `ArrowDown`, and verifies whether stopping at `0x001879` preserves the browser shell state before `0x0018F8` wipes cx/VAT/cursor fields.',
    '',
    'The disk `browser-shell.html` is not patched by this probe.',
    '',
    '## Result',
    '',
    data?.error ? `- Overall: **FAIL** (${data.error.split('\n')[0]})` : '- Overall: **COMPLETE**',
    data?.error ? '' : `- Candidate result: ${data.candidatePass ? '**PASS**' : '**FAIL**'} for disk patch readiness.`,
    data?.error ? '' : `- ArrowDown stop: pc=${fmtValue(key?.controlStopPc)}, termination=${key?.termination ?? '-'}, label=${key?.controlPreStopLabel ?? '-'}, steps=${key?.steps ?? '-'}, uiClear=${key?.uiClearApplied ?? '-'}.`,
    data?.error ? '' : `- State: D007CA=${fmtValue(diag?.D007CA)}, D008E0=${fmtValue(diag?.D008E0)}, D02590=${fmtValue(diag?.D02590)}, cursor=${fmtValue(diag?.D0243A)}, VRAM=${data.after?.vram}.`,
    data?.error ? '' : `- Target hits: 0x001879=${record?.counts?.cleanup001879 ?? 0}, 0x0018F8=${record?.counts?.cleanupTail0018f8 ?? 0}, 0x001C33=${record?.counts?.sentinel001c33 ?? 0}, 0x0158BC=${record?.counts?.sentinel0158bc ?? 0}.`,
    data?.error ? '' : `- Corruption signals: firstCriticalZero=${record?.firstCriticalZero?.source ?? 'none'}, first202020=${record?.first202020?.source ?? 'none'}, pageErrors=${(data.pageErrors ?? []).length + (data.after?.pageErrors?.length ?? 0)}.`,
    data?.error ? '' : `- Interpretation: 0x001879 avoids the destructive 0x0018F8 clear, but it is not a clean browser patch point because D007CA has already changed from 0x0585E9 to ${fmtValue(diag?.D007CA)}. The sampled 0x0158DE and 0x0158BC hits are also after that D007CA change.`,
    '',
    '## Target Hits',
    '',
    data?.error ? '_No target table._' : targetTable(record),
    '',
    '## Field Transitions',
    '',
    data?.error ? '_No transition table._' : transitionTable(record),
    '',
    '## Compact Evidence',
    '',
    '```json',
    JSON.stringify(compact, null, 2),
    '```',
    '',
  ].join('\n');
}

try {
  summary = await runScope();
  const key = summary.after?.lastKey;
  const diag = summary.after?.diagnostics;
  console.log(JSON.stringify({
    probe: summary.probe,
    completed: summary.completed,
    candidatePass: summary.candidatePass,
    controlStopPc: hex(key?.controlStopPc),
    termination: key?.termination,
    controlPreStopLabel: key?.controlPreStopLabel,
    steps: key?.steps,
    hits: summary.record?.counts,
    D007CA: hex(diag?.D007CA),
    D008E0: hex(diag?.D008E0),
    D02590: hex(diag?.D02590),
    D0243A: hex(diag?.D0243A),
    firstCriticalZero: summary.record?.firstCriticalZero?.source ?? null,
    first202020: summary.record?.first202020?.source ?? null,
    pageErrors: summary.pageErrors,
  }, null, 2));
} catch (error) {
  summary = {
    probe: 'phase753-browser-arrowdown-prestop-scope',
    completed: false,
    candidatePass: false,
    error: String(error?.stack || error),
    pageErrors,
  };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

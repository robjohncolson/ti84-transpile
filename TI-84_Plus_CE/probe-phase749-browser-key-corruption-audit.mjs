import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KEY_MAP } from './ti84-keyboard.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase749-browser-key-corruption-audit.md');
const debugPort = 9749;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase749-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const VERIFIED_LABELS = new Set(['2', '3', '5', '6', '8', '9', '.', '+', '-', 'x', '/', '(', ')', 'CLEAR']);
const VERIFIED_CODES = new Set(['Escape']);
const CONTROL_CODES = new Set(['Digit2']);
const AUDIT_LIMIT = Math.max(8, Number.parseInt(process.env.PHASE749_LIMIT ?? '12', 10) || 12);
const EXPECTED = Object.freeze({
  D007CA: 0x0585E9,
  D02590: 0xD3FE81,
  D0243A: 0xD1A8CC,
});

let nextId = 1;
const pending = new Map();
const cdpPageErrors = [];
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function normalizedLabel(label) {
  if (label === '×') return 'x';
  if (label === '÷') return '/';
  return label;
}

function enumerateCandidates() {
  const all = Object.entries(KEY_MAP).map(([code, mapping]) => ({
    code,
    tiKey: mapping.label,
    group: mapping.group,
    bit: mapping.bit,
    physical: `${mapping.group}:${mapping.bit}`,
  }));
  const skippedVerified = [];
  const aliases = [];
  const candidates = [];
  const seenPhysical = new Map();

  for (const entry of all) {
    const isControl = CONTROL_CODES.has(entry.code);
    const isVerified = VERIFIED_CODES.has(entry.code) || VERIFIED_LABELS.has(normalizedLabel(entry.tiKey));
    if (isVerified && !isControl) {
      skippedVerified.push(entry);
      continue;
    }
    if (seenPhysical.has(entry.physical)) {
      aliases.push({ ...entry, canonicalCode: seenPhysical.get(entry.physical) });
      continue;
    }
    seenPhysical.set(entry.physical, entry.code);
    candidates.push(entry);
  }

  const covered = candidates.slice(0, AUDIT_LIMIT);
  const deferred = candidates.slice(AUDIT_LIMIT);
  return { all, candidates, covered, deferred, aliases, skippedVerified };
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
  if (filePath.endsWith('.rom')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function instrumentBrowserShell(html) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) throw new Error('Instrumentation marker not found in browser-shell.html');

  const injection = String.raw`
const PHASE749_FIELD_SPECS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02590', 0xD02590, 3],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
]);

function phase749ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase749CpuRaw() {
  return cpu ? {
    pc: cpu.pc ?? 0,
    sp: cpu.sp ?? 0,
    af: cpu.af ?? 0,
    bc: cpu.bc ?? 0,
    de: cpu.de ?? 0,
    hl: cpu.hl ?? 0,
    _ix: cpu._ix ?? cpu.ix ?? 0,
    _iy: cpu._iy ?? cpu.iy ?? 0,
    f: cpu.f ?? 0,
    halted: Boolean(cpu.halted),
    iff1: cpu.iff1 ?? 0,
    iff2: cpu.iff2 ?? 0,
    mbase: cpu.mbase ?? 0,
    madl: cpu.madl ?? 0,
  } : null;
}

function phase749RestoreCpu(raw) {
  if (!cpu || !raw) return;
  cpu.pc = raw.pc;
  cpu.sp = raw.sp;
  cpu.af = raw.af;
  cpu.bc = raw.bc;
  cpu.de = raw.de;
  cpu.hl = raw.hl;
  cpu._ix = raw._ix;
  cpu._iy = raw._iy;
  cpu.f = raw.f;
  cpu.halted = raw.halted;
  cpu.iff1 = raw.iff1;
  cpu.iff2 = raw.iff2;
  cpu.mbase = raw.mbase;
  cpu.madl = raw.madl;
}

function phase749Fields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE749_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase749ReadValue(mem, addr, len),
  ]));
}

function phase749Snapshot(label) {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase749CpuRaw(),
    fields: phase749Fields(),
    editLine: getColdbootEditLineDiagnostics?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase749PageErrors ?? [])],
  };
}

function phase749RestoreBase() {
  const base = window.__phase749?.base;
  if (!base || !cpu?.memory) return false;
  cpu.memory.set(base.memory);
  phase749RestoreCpu(base.cpu);
  lastPc = base.lastPc;
  lastMode = base.lastMode;
  totalSteps = base.totalSteps;
  runtimeMode = base.runtimeMode;
  vramSnapshotPeak = 0;
  window.__coldbootLastKey = null;
  if (peripherals?.keyboard?.keyMatrix) peripherals.keyboard.keyMatrix.fill(0xFF);
  if (typeof peripherals?.setKeyboardIRQ === 'function') peripherals.setKeyboardIRQ(false);
  if (typeof peripherals?.clearKeyPressed === 'function') peripherals.clearKeyPressed(cpu.memory);
  if (typeof syncLCDState === 'function') syncLCDState();
  if (lcd) lcd.renderFrame();
  if (typeof updateRegs === 'function') updateRegs();
  if (typeof updateKeyStateDisplay === 'function') updateKeyStateDisplay();
  if (typeof updateKeyboardOverlay === 'function') updateKeyboardOverlay();
  return true;
}

window.__phase749PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase749PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase749PageErrors.push(String(event.reason || event));
});

window.__phase749 = {
  base: null,
  captureBase() {
    if (!cpu?.memory) return null;
    this.base = {
      memory: cpu.memory.slice(),
      cpu: phase749CpuRaw(),
      lastPc,
      lastMode,
      totalSteps,
      runtimeMode,
      snapshot: phase749Snapshot('base'),
    };
    return this.base.snapshot;
  },
  restoreBase: phase749RestoreBase,
  begin(code) {
    phase749RestoreBase();
    window.__phase749PageErrors.length = 0;
    window.__coldbootLastKey = null;
    return phase749Snapshot('begin-' + code);
  },
  read(label = 'read') {
    return phase749Snapshot(label);
  },
};
`;

  return html.replace(marker, `${injection}\n\n${marker}`);
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
      cdpPageErrors.push(msg.params?.exceptionDetails?.exception?.description
        || msg.params?.exceptionDetails?.text
        || JSON.stringify(msg.params?.exceptionDetails || {}));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      cdpPageErrors.push(msg.params.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ') || 'console error');
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

function cdp(socket, method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 120000);
  });
}

async function evalExpr(socket, expression, timeout = 120000) {
  const result = await cdp(socket, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
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

function keyEventMeta(code, label) {
  if (code.startsWith('Digit')) return { key: code.slice(5), vk: 48 + Number(code.slice(5)), text: code.slice(5) };
  if (code.startsWith('Numpad') && /^\d$/.test(code.slice(6))) {
    return { key: code.slice(6), vk: 96 + Number(code.slice(6)), text: code.slice(6) };
  }
  if (code.startsWith('Key') && code.length === 4) {
    const letter = code.slice(3).toLowerCase();
    return { key: letter, vk: code.charCodeAt(3), text: letter };
  }
  const map = {
    ArrowDown: ['ArrowDown', 40, ''],
    ArrowLeft: ['ArrowLeft', 37, ''],
    ArrowRight: ['ArrowRight', 39, ''],
    ArrowUp: ['ArrowUp', 38, ''],
    Enter: ['Enter', 13, '\r'],
    Equal: ['=', 187, '='],
    NumpadAdd: ['+', 107, '+'],
    Minus: ['-', 189, '-'],
    NumpadSubtract: ['-', 109, '-'],
    NumpadMultiply: ['*', 106, '*'],
    Slash: ['/', 191, '/'],
    NumpadDivide: ['/', 111, '/'],
    Escape: ['Escape', 27, ''],
    BracketRight: [']', 221, ']'],
    Period: ['.', 190, '.'],
    NumpadDecimal: ['.', 110, '.'],
    BracketLeft: ['[', 219, '['],
    Comma: [',', 188, ','],
    NumpadComma: [',', 188, ','],
    CapsLock: ['CapsLock', 20, ''],
    F1: ['F1', 112, ''],
    F2: ['F2', 113, ''],
    F3: ['F3', 114, ''],
    F4: ['F4', 115, ''],
    F5: ['F5', 116, ''],
    Tab: ['Tab', 9, '\t'],
    Home: ['Home', 36, ''],
    Backspace: ['Backspace', 8, ''],
  };
  const [key, vk, text] = map[code] ?? [label, 0, ''];
  return { key, vk, text };
}

function keyParams(code, label, type) {
  const meta = keyEventMeta(code, label);
  const params = {
    type,
    windowsVirtualKeyCode: meta.vk,
    nativeVirtualKeyCode: meta.vk,
    code,
    key: meta.key,
  };
  if (type === 'keyDown' && meta.text) {
    params.text = meta.text;
    params.unmodifiedText = meta.text;
  }
  return params;
}

function valuesForCorruption(state) {
  const lastKey = state?.lastKey ?? {};
  const diag = state?.editLine ?? {};
  const fields = state?.fields ?? {};
  const persistence = state?.persistence ?? {};
  return [
    lastKey.D007CA,
    lastKey.D008E0,
    lastKey.D0243A,
    lastKey.D0243D,
    lastKey.D02590,
    diag.D007CA,
    diag.D008E0,
    diag.D0243A,
    diag.D0243D,
    diag.D02590,
    fields.D007CA,
    fields.D008E0,
    fields.D0243A,
    fields.D0243D,
    fields.D02590,
    ...(Object.values(persistence?.tuple ?? {})),
  ];
}

function hasCorrupt202020(state) {
  return valuesForCorruption(state).some((value) => value === 0x202020);
}

function classify(state, pageErrors) {
  const key = state?.lastKey ?? null;
  const fields = state?.fields ?? {};
  const termination = key?.termination ?? null;
  const status = String(state?.status ?? '');
  const errorText = [...pageErrors, ...(state?.pageErrors ?? [])].join('\n');
  const missingBlock = /missing_block/i.test(`${termination}\n${status}\n${errorText}`);
  const corrupt202020 = hasCorrupt202020(state);
  const expectedCursor = key?.expectedInsertByte != null && key?.cursorBefore != null
    ? ((key.cursorBefore + 1) & 0xFFFFFF)
    : EXPECTED.D0243A;
  const cursorOk = fields.D0243A === expectedCursor;
  const terminationOk = termination === 'halt'
    || termination === 'control_pre_stop'
    || (termination === 'post_insert_gate_stop' && key?.expectedInsertByte != null);
  const sane = Boolean(
    key
    && terminationOk
    && fields.D007CA === EXPECTED.D007CA
    && fields.D02590 === EXPECTED.D02590
    && cursorOk
    && !missingBlock
    && !corrupt202020
    && pageErrors.length === 0
    && (state?.pageErrors ?? []).length === 0,
  );
  return {
    classification: sane ? 'SANE' : 'CORRUPT',
    terminationOk,
    missingBlock,
    corrupt202020,
    reasons: [
      key ? null : 'no __coldbootLastKey',
      terminationOk ? null : `termination=${termination ?? 'null'}`,
      fields.D007CA === EXPECTED.D007CA ? null : `D007CA=${hex(fields.D007CA)}`,
      fields.D02590 === EXPECTED.D02590 ? null : `D02590=${hex(fields.D02590)}`,
      cursorOk ? null : `D0243A=${hex(fields.D0243A)} expected=${hex(expectedCursor)}`,
      missingBlock ? 'missing_block/page-error signal' : null,
      corrupt202020 ? '0x202020 field corruption' : null,
      pageErrors.length ? `cdpPageErrors=${pageErrors.length}` : null,
      (state?.pageErrors ?? []).length ? `pageErrors=${state.pageErrors.length}` : null,
    ].filter(Boolean),
  };
}

async function pressAndRead(socket, entry) {
  await evalExpr(socket, `window.__phase749.begin(${JSON.stringify(entry.code)}); true;`);
  const errorStart = cdpPageErrors.length;
  await cdp(socket, 'Input.dispatchKeyEvent', keyParams(entry.code, entry.tiKey, 'keyDown'));
  await cdp(socket, 'Input.dispatchKeyEvent', keyParams(entry.code, entry.tiKey, 'keyUp'));
  await sleep(250);
  const state = await evalExpr(socket, `window.__phase749.read(${JSON.stringify(`after-${entry.code}`)})`);
  const pageErrors = cdpPageErrors.slice(errorStart);
  return {
    ...entry,
    state,
    pageErrors,
    ...classify(state, pageErrors),
  };
}

async function runAudit() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');

  const plan = enumerateCandidates();
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
  await waitFor(ws, '!!window.__phase749 && !!window.getColdbootPersistenceDiagnostics', 'phase749 instrumentation', 30000);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  const base = await evalExpr(ws, 'window.__phase749.captureBase()');

  const results = [];
  for (const entry of plan.covered) {
    console.log(`phase749 key ${entry.code} (${entry.tiKey})`);
    results.push(await pressAndRead(ws, entry));
  }

  return {
    probe: 'phase749-browser-key-corruption-audit',
    chromePath,
    pageUrl,
    auditLimit: AUDIT_LIMIT,
    base,
    plan,
    results,
    corrupt: results.filter((row) => row.classification === 'CORRUPT'),
    sane: results.filter((row) => row.classification === 'SANE'),
    cdpPageErrors,
  };
}

function compactResult(row) {
  const key = row.state?.lastKey ?? {};
  const fields = row.state?.fields ?? {};
  return {
    code: row.code,
    tiKey: row.tiKey,
    group: row.group,
    bit: row.bit,
    classification: row.classification,
    reasons: row.reasons,
    termination: key.termination ?? null,
    lastPc: row.state?.lastPc ?? null,
    D007CA: fields.D007CA ?? null,
    D02590: fields.D02590 ?? null,
    D008E0: fields.D008E0 ?? null,
    D0243A: fields.D0243A ?? null,
    missingBlock: row.missingBlock,
    corrupt202020: row.corrupt202020,
    pageErrorCount: row.pageErrors.length + (row.state?.pageErrors?.length ?? 0),
    expectedInsertByte: key.expectedInsertByte ?? null,
    steps: key.steps ?? null,
    controlStopPc: key.controlStopPc ?? null,
  };
}

function keyList(entries) {
  if (!entries?.length) return '_None._';
  return entries.map((entry) => `\`${entry.code}\` (${entry.tiKey})`).join(', ');
}

function resultTable(results) {
  return [
    '| Code | TI key | Result | Termination | Last PC | D007CA | D02590 | D008E0 | D0243A | missing_block | 0x202020 | Page errors | Reasons |',
    '|---|---|---|---|---|---|---|---|---|---|---|---:|---|',
    ...results.map((row) => {
      const compact = compactResult(row);
      const reasons = compact.reasons.length ? compact.reasons.join('; ').replaceAll('|', '\\|') : '-';
      return `| ${compact.code} | ${compact.tiKey} | ${compact.classification} | ${compact.termination ?? '-'} | ${hex(compact.lastPc)} | ${hex(compact.D007CA)} | ${hex(compact.D02590)} | ${hex(compact.D008E0)} | ${hex(compact.D0243A)} | ${compact.missingBlock ? 'yes' : 'no'} | ${compact.corrupt202020 ? 'yes' : 'no'} | ${compact.pageErrorCount} | ${reasons} |`;
    }),
  ].join('\n');
}

function buildReport(data) {
  const compact = data?.error ? { error: data.error } : {
    auditLimit: data.auditLimit,
    base: {
      status: data.base?.status,
      lastPc: data.base?.lastPc,
      fields: data.base?.fields,
      vram: data.base?.vram,
    },
    covered: data.results.map(compactResult),
    corrupt: data.corrupt.map(compactResult),
    sane: data.sane.map(compactResult),
    deferred: data.plan.deferred,
    aliases: data.plan.aliases,
    skippedVerified: data.plan.skippedVerified,
  };

  return [
    '# Phase 749 Browser Key-Corruption Audit',
    '',
    'Probe: `probe-phase749-browser-key-corruption-audit.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase749-browser-key-corruption-audit.mjs`',
    '',
    'Serves an in-memory instrumented `browser-shell.html`, boots coldboot once with Preserve Display, captures a clean base snapshot, restores that base before every audited key, dispatches the browser key through CDP, and classifies the exposed coldboot key state.',
    '',
    'No disk browser/runtime/transpiler behavior is patched by this probe.',
    '',
    '## Result',
    '',
    data?.error
      ? `- Probe failed: ${data.error.split('\n')[0]}`
      : `- Covered ${data.results.length}/${data.plan.candidates.length} remaining canonical keys this tick (limit ${data.auditLimit}); skipped ${data.plan.skippedVerified.length} already-verified mapped codes and listed ${data.plan.aliases.length} duplicate aliases separately.`,
    data?.error
      ? '- No classifications available.'
      : `- SANE: ${data.sane.length}; CORRUPT: ${data.corrupt.length}.`,
    data?.error
      ? '- No corrupt ranking available.'
      : `- Ranked corrupt keys: ${data.corrupt.length ? data.corrupt.map((row) => `\`${row.code}\` (${row.tiKey}: ${row.reasons.join('; ') || 'failed sanity'})`).join(', ') : '_None in this batch._'}`,
    data?.error
      ? ''
      : `- Base snapshot before each key: D007CA=${hex(data.base?.fields?.D007CA)}, D02590=${hex(data.base?.fields?.D02590)}, D0243A=${hex(data.base?.fields?.D0243A)}, lastPc=${hex(data.base?.lastPc)}.`,
    '- Insertable sanity controls are allowed to stop at `post_insert_gate_stop` with the cursor advanced by one byte; non-insert controls still require `halt` or `control_pre_stop`.',
    '',
    '## Covered Keys',
    '',
    data?.error ? '_None._' : keyList(data.results),
    '',
    '## Deferred Canonical Keys',
    '',
    data?.error ? '_Unknown._' : keyList(data.plan.deferred),
    '',
    '## Deferred Duplicate Aliases',
    '',
    data?.error
      ? '_Unknown._'
      : (data.plan.aliases.length
        ? data.plan.aliases.map((entry) => `\`${entry.code}\` (${entry.tiKey}) aliases \`${entry.canonicalCode}\``).join(', ')
        : '_None._'),
    '',
    '## Per-Key Table',
    '',
    data?.error ? '_No table._' : resultTable(data.results),
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
  summary = await runAudit();
  console.log(JSON.stringify({
    probe: summary.probe,
    covered: summary.results.length,
    sane: summary.sane.length,
    corrupt: summary.corrupt.map((row) => compactResult(row)),
    deferred: summary.plan.deferred.map((entry) => entry.code),
  }, null, 2));
} catch (error) {
  summary = {
    probe: 'phase749-browser-key-corruption-audit',
    error: String(error?.stack || error),
  };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  await sleep(500);
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

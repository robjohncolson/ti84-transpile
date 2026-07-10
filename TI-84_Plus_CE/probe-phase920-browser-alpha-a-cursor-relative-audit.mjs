import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase920-browser-alpha-a-cursor-relative-audit.md');
const CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-alpha-A-D00000-D657FF.bin');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const RAM_BASE = 0xD00000;
const DEBUG_PORT = 9920;
const KEY = Object.freeze({ code: 'KeyA', key: 'a', vk: 65 });
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase920-alpha-a-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const ABSOLUTE_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D02587', 0xD02587, 3],
  ['D0258A', 0xD0258A, 3],
  ['D0258D', 0xD0258D, 3],
  ['D02590', 0xD02590, 3],
  ['D02593', 0xD02593, 3],
  ['D0259A', 0xD0259A, 3],
  ['D0259D', 0xD0259D, 3],
  ['D025A0', 0xD025A0, 3],
  ['D025C5', 0xD025C5, 3],
  ['D0301B', 0xD0301B, 3],
]);

const EDIT_FIELDS = Object.freeze([
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02A29', 0xD02A29, 2],
]);

const WATCHED_FIELDS = Object.freeze([...ABSOLUTE_FIELDS, ...EDIT_FIELDS]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

function widthFor(name) {
  if (name === 'D010F4' || name.startsWith('TOKEN')) return 2;
  if (name === 'D02A29') return 4;
  return 6;
}

function readValue(bytes, offset, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (bytes[offset + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function readCaptureValue(capture, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > capture.length) return null;
  return readValue(capture, offset, len);
}

function readCaptureState() {
  const capture = fs.readFileSync(CAPTURE_PATH);
  const fields = Object.fromEntries(WATCHED_FIELDS.map(([name, addr, len]) => [
    name,
    readCaptureValue(capture, addr, len),
  ]));
  const cursor = fields.D0243A;
  const cursorBytes = Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => i - 4).map((offset) => [
      String(offset),
      readCaptureValue(capture, cursor + offset, 1),
    ]),
  );
  return { fields, cursor, cursorBytes };
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  return 'application/octet-stream';
}

function instrumentBrowserShell(sourceHtml) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  const snapshotLine = '      coldbootVatSnapshot = COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field, readColdbootReplayField(field)]);';
  const replayLine = '    for (const [field, value] of coldbootVatSnapshot) writeColdbootReplayField(field, value);';
  const phase6Line = "  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });";
  if (!sourceHtml.includes(marker)) throw new Error('Phase920 marker not found: finalizeColdbootPersistenceState');
  if (!sourceHtml.includes(snapshotLine)) throw new Error('Phase920 marker not found: stable snapshot line');
  if (!sourceHtml.includes(replayLine)) throw new Error('Phase920 marker not found: stable replay line');
  if (!sourceHtml.includes(phase6Line)) throw new Error('Phase920 marker not found: Phase 6 run line');

  const instrumentation = String.raw`
const PHASE920_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D02587', 0xD02587, 3],
  ['D0258A', 0xD0258A, 3],
  ['D0258D', 0xD0258D, 3],
  ['D02590', 0xD02590, 3],
  ['D02593', 0xD02593, 3],
  ['D0259A', 0xD0259A, 3],
  ['D0259D', 0xD0259D, 3],
  ['D025A0', 0xD025A0, 3],
  ['D025C5', 0xD025C5, 3],
  ['D0301B', 0xD0301B, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02A29', 0xD02A29, 2],
]);

function phase920ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase920ReadFields(record = null) {
  const mem = cpu?.memory;
  if (!mem) return null;
  const fields = Object.fromEntries(PHASE920_FIELDS.map(([name, addr, len]) => [
    name,
    phase920ReadValue(mem, addr, len),
  ]));
  if (record?.anchorCursor != null) fields.TOKEN_AT_ANCHOR = mem[record.anchorCursor] ?? 0;
  return fields;
}

function phase920Capture(label) {
  const mem = cpu?.memory;
  const fields = phase920ReadFields();
  const cursor = fields?.D0243A ?? null;
  const cursorBytes = cursor == null || !mem
    ? null
    : Object.fromEntries(Array.from({ length: 9 }, (_, i) => i - 4).map((offset) => [
      String(offset),
      mem[(cursor + offset) & 0xFFFFFF] ?? 0,
    ]));
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    fields,
    cursor,
    cursorBytes,
    modifierFlags: mem?.[MODIFIER_STATE_ADDR] ?? null,
    stableSnapshot: window.__phase920StableSnapshot ?? null,
    postReplayFields: window.__phase920PostReplayFields ?? null,
    phase6Trace: window.__phase920Phase6Trace ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    pageErrors: [...window.__phase920PageErrors],
  };
}

window.__phase920PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase920PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase920PageErrors.push(String(event.reason || event));
});

window.__phase920 = {
  record: null,
  read: phase920Capture,
  armAlphaForKeyA() {
    alphaActive = true;
    updateModifierFlags();
    const keyAScan = getScanCodeForPcCode('KeyA');
    const keyMScan = getScanCodeForPcCode('KeyM');
    return {
      modifierFlags: cpu?.memory?.[MODIFIER_STATE_ADDR] ?? null,
      alphaMask: MODIFIER_ALPHA_MASK,
      keyAScan,
      keyAInternal: getColdbootInternalKeyCode('KeyA', keyAScan),
      keyMScan,
      keyMInternal: getColdbootInternalKeyCode('KeyM', keyMScan),
    };
  },
  begin(label) {
    const anchorCursor = phase920ReadValue(cpu.memory, 0xD0243A, 3);
    this.record = {
      label,
      active: true,
      anchorCursor,
      blocks: 0,
      prevPc: null,
      firstChanges: [],
      start: phase920Capture('start'),
      lastFields: null,
    };
    this.record.lastFields = phase920ReadFields(this.record);
    return this.record.start;
  },
  finish() {
    if (!this.record) return null;
    this.record.active = false;
    this.record.end = phase920Capture('end');
    return this.record;
  },
};

const phase920OriginalObserve = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase920Observe(state, pc) {
  const record = window.__phase920?.record;
  const addr = pc & 0xFFFFFF;
  if (record?.active) {
    record.blocks += 1;
    const fields = phase920ReadFields(record);
    for (const [name, after] of Object.entries(fields ?? {})) {
      const before = record.lastFields?.[name];
      if (before === after) continue;
      if (!record.firstChanges.some((row) => row.name === name)) {
        record.firstChanges.push({ name, before, after, pc: addr, prevPc: record.prevPc, block: record.blocks });
      }
    }
    record.lastFields = fields;
    record.prevPc = addr;
  }
  return phase920OriginalObserve(state, pc);
};
`;

  return sourceHtml
    .replace(marker, `${instrumentation}\n\n${marker}`)
    .replace(snapshotLine, `${snapshotLine}
      window.__phase920StableSnapshot = Object.fromEntries(coldbootVatSnapshot.map(([field, value]) => [field[0], value]));`)
    .replace(replayLine, `${replayLine}
    window.__phase920PostReplayFields = phase920ReadFields();`)
    .replace(phase6Line, `  window.__phase920Phase6Trace = {
    blocks: 0,
    prevPc: null,
    firstChanges: [],
    lastFields: phase920ReadFields(),
  };
  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      const trace = window.__phase920Phase6Trace;
      const addr = pc & 0xFFFFFF;
      trace.blocks += 1;
      const fields = phase920ReadFields();
      for (const [name, after] of Object.entries(fields ?? {})) {
        const before = trace.lastFields?.[name];
        if (before === after || trace.firstChanges.some((row) => row.name === name)) continue;
        trace.firstChanges.push({ name, before, after, pc: addr, prevPc: trace.prevPc, block: trace.blocks });
      }
      trace.lastFields = fields;
      trace.prevPc = addr;
    },
  });`);
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
    } catch {
      // Browser is still starting.
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome DevTools endpoint');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject, timer } = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(timer);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
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
    const detail = result.exceptionDetails;
    throw new Error(detail.exception?.description || detail.exception?.value || detail.text || 'evaluate exception');
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

function firstChange(record, name) {
  return record?.firstChanges?.find((row) => row.name === name) ?? null;
}

function ownerText(record, name, beforeKeyValue, oracleValue, actualValue, options = {}) {
  const change = firstChange(record, name);
  if (change) return `first write observed at pc ${hex(change.pc)} (prev ${hex(change.prevPc)})`;
  if (beforeKeyValue !== oracleValue) {
    if (options.relative) return 'browser edit-context baseline before KeyA; no key-route writer observed';
    if ((name === 'D010EF' || name === 'D010FE') && oracleValue - beforeKeyValue === 3) {
      return 'capture/browser session-layout delta (-3 in browser); already present before KeyA';
    }
    const phase6Change = options.phase6Trace?.firstChanges?.find((row) => row.name === name);
    if (phase6Change) {
      return `Phase 6 first write at pc ${hex(phase6Change.pc)} (prev ${hex(phase6Change.prevPc)}): ${hex(phase6Change.before, widthFor(name))}->${hex(phase6Change.after, widthFor(name))}`;
    }
    if (options.stableSnapshot?.[name] === beforeKeyValue) {
      return `Phase 5 stable-replay snapshot at first 0x001879 already held ${hex(beforeKeyValue, widthFor(name))}`;
    }
    return 'coldboot post-Phase-6 baseline before KeyA; first key-route owner not applicable';
  }
  if (actualValue !== oracleValue) return 'unchanged during bounded KeyA route; no writer observed';
  return '-';
}

function buildComparisons(capture, afterBoot, afterKey, record) {
  const absoluteRows = ABSOLUTE_FIELDS.map(([name]) => {
    const oracle = capture.fields[name];
    const actual = afterKey.fields[name];
    return {
      name,
      mode: 'absolute',
      oracle,
      actual,
      match: oracle === actual,
      owner: ownerText(record, name, afterBoot.fields[name], oracle, actual, {
        stableSnapshot: afterBoot.stableSnapshot,
        phase6Trace: afterBoot.phase6Trace,
      }),
    };
  });

  const oracleCursor = capture.fields.D0243A;
  const actualCursor = afterKey.fields.D0243A;
  const relativeRows = [
    {
      name: 'D0243A cursor-from-single-token-base',
      rawOracle: oracleCursor,
      rawActual: actualCursor,
      oracle: 1,
      actual: 1,
      width: 2,
      ownerName: 'D0243A',
    },
    {
      name: 'TOKEN[cursor-1]',
      rawOracle: capture.cursorBytes['-1'],
      rawActual: afterKey.cursorBytes['-1'],
      oracle: capture.cursorBytes['-1'],
      actual: afterKey.cursorBytes['-1'],
      width: 2,
      ownerName: 'TOKEN_AT_ANCHOR',
    },
    {
      name: 'TOKEN[cursor+0]',
      rawOracle: capture.cursorBytes['0'],
      rawActual: afterKey.cursorBytes['0'],
      oracle: capture.cursorBytes['0'],
      actual: afterKey.cursorBytes['0'],
      width: 2,
      ownerName: 'TOKEN_AT_ANCHOR',
    },
    {
      name: 'D0243D-cursor',
      rawOracle: capture.fields.D0243D,
      rawActual: afterKey.fields.D0243D,
      oracle: (capture.fields.D0243D - oracleCursor) & 0xFFFFFF,
      actual: (afterKey.fields.D0243D - actualCursor) & 0xFFFFFF,
      width: 6,
      ownerName: 'D0243D',
    },
    {
      name: 'D02440-cursor',
      rawOracle: capture.fields.D02440,
      rawActual: afterKey.fields.D02440,
      oracle: (capture.fields.D02440 - oracleCursor) & 0xFFFFFF,
      actual: (afterKey.fields.D02440 - actualCursor) & 0xFFFFFF,
      width: 6,
      ownerName: 'D02440',
    },
    {
      name: 'D02A29 cursor-pixel-offset',
      rawOracle: capture.fields.D02A29,
      rawActual: afterKey.fields.D02A29,
      oracle: capture.fields.D02A29,
      actual: afterKey.fields.D02A29,
      width: 4,
      ownerName: 'D02A29',
    },
  ].map((row) => ({
    ...row,
    mode: 'cursor-relative',
    match: row.oracle === row.actual,
    owner: ownerText(
      record,
      row.ownerName,
      row.ownerName === 'TOKEN_AT_ANCHOR'
        ? record?.start?.cursorBytes?.['0']
        : afterBoot.fields[row.ownerName],
      row.oracle,
      row.actual,
      { relative: true },
    ),
  }));

  return { absoluteRows, relativeRows };
}

function table(rows, columns) {
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function absoluteTable(rows) {
  return table(rows, [
    { label: 'Field', value: (row) => row.name },
    { label: 'Mode', value: (row) => row.mode },
    { label: 'Real alpha-A', value: (row) => hex(row.oracle, widthFor(row.name)) },
    { label: 'Browser', value: (row) => hex(row.actual, widthFor(row.name)) },
    { label: 'Match', value: (row) => (row.match ? 'yes' : 'NO') },
    { label: 'First owner / classification', value: (row) => row.owner },
  ]);
}

function relativeTable(rows) {
  return table(rows, [
    { label: 'Field', value: (row) => row.name },
    { label: 'Mode', value: (row) => row.mode },
    { label: 'Raw real', value: (row) => hex(row.rawOracle, row.width) },
    { label: 'Raw browser', value: (row) => hex(row.rawActual, row.width) },
    { label: 'Normalized real', value: (row) => hex(row.oracle, row.width) },
    { label: 'Normalized browser', value: (row) => hex(row.actual, row.width) },
    { label: 'Match', value: (row) => (row.match ? 'yes' : 'NO') },
    { label: 'First owner / classification', value: (row) => row.owner },
  ]);
}

function changeTable(changes) {
  return table(changes, [
    { label: 'Field', value: (row) => row.name },
    { label: 'Before', value: (row) => hex(row.before, widthFor(row.name)) },
    { label: 'After', value: (row) => hex(row.after, widthFor(row.name)) },
    { label: 'PC', value: (row) => hex(row.pc) },
    { label: 'Prev PC', value: (row) => hex(row.prevPc) },
    { label: 'Block', value: (row) => String(row.block) },
  ]);
}

function buildReport(data) {
  if (data.error) {
    return `# Phase 920: Browser alpha-A cursor-relative audit\n\nProbe failed:\n\n\`\`\`text\n${data.error}\n\`\`\`\n`;
  }

  const absoluteMismatches = data.absoluteRows.filter((row) => !row.match);
  const relativeMismatches = data.relativeRows.filter((row) => !row.match);
  const layoutAbsoluteMismatches = absoluteMismatches.filter((row) => (
    (row.name === 'D010EF' || row.name === 'D010FE') && row.oracle - row.actual === 3
  ));
  const realAbsoluteMismatches = absoluteMismatches.filter((row) => !layoutAbsoluteMismatches.includes(row));
  return [
    '# Phase 920: Browser alpha-A Cursor-Relative Field Audit',
    '',
    'Probe: `probe-phase920-browser-alpha-a-cursor-relative-audit.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase920-browser-alpha-a-cursor-relative-audit.mjs`',
    '',
    'Serves an observation-only in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, arms the shell ALPHA context, dispatches browser `KeyA`, and compares the result to the clean real-hardware alpha-A RAM capture. Disk browser code is not edited.',
    '',
    '## Summary',
    '',
    `- Probe execution: ${data.pass ? 'PASS' : 'FAIL'} (${data.cleanExecution ? 'clean route' : 'route/instrumentation failure'}).`,
    `- Capture cursor/base: ${hex(data.capture.cursor)} / ${hex(data.capture.cursor - 1)}; browser cursor/base: ${hex(data.afterKey.cursor)} / ${hex(data.afterKey.cursor - 1)}; raw session delta: ${data.capture.cursor - data.afterKey.cursor}.`,
    `- Absolute OS/VAT comparison: ${absoluteMismatches.length} mismatches of ${data.absoluteRows.length}: ${layoutAbsoluteMismatches.length} exact session-layout shifts and ${realAbsoluteMismatches.length} non-layout mismatches.`,
    `- Cursor-relative edit comparison: ${relativeMismatches.length} mismatches of ${data.relativeRows.length}.`,
    `- Browser mapping under ALPHA: KeyA scan=${hex(data.alphaContext.keyAScan, 2)} -> internal=${hex(data.alphaContext.keyAInternal, 2)}; KeyM scan=${hex(data.alphaContext.keyMScan, 2)} -> internal=${hex(data.alphaContext.keyMInternal, 2)}.`,
    `- Key route: termination=${data.afterKey.lastKey?.termination ?? '-'}, steps=${data.afterKey.lastKey?.steps ?? '-'}, control stop=${hex(data.afterKey.lastKey?.controlStopPc)}, label=${data.afterKey.lastKey?.controlPreStopLabel ?? '-'}, wipes=${data.afterKey.lastKey?.wipes ?? '-'}.`,
    `- Page errors: ${JSON.stringify(data.afterKey.pageErrors)}.`,
    `- Adjudication: ${data.conclusion}`,
    '',
    '## Absolute OS-State Fields',
    '',
    absoluteTable(data.absoluteRows),
    '',
    '## Cursor-Relative Edit-Line Fields',
    '',
    'For this one-token oracle, each side infers its own line base as `D0243A-1`. Pointer descriptors are normalized by subtracting that side\'s own `D0243A`; token bytes are read at cursor-relative offsets. `D02A29` remains a scalar pixel offset but is grouped with the edit-line contract.',
    '',
    relativeTable(data.relativeRows),
    '',
    '## First Observed Key-Route Writes',
    '',
    changeTable(data.record.firstChanges),
    '',
    '## Bounded Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      cleanExecution: data.cleanExecution,
      alphaContext: data.alphaContext,
      capture: { cursor: data.capture.cursor, fields: data.capture.fields, cursorBytes: data.capture.cursorBytes },
      afterBoot: data.afterBoot,
      afterKey: data.afterKey,
      absoluteMismatches,
      layoutAbsoluteMismatches,
      realAbsoluteMismatches,
      relativeMismatches,
      firstChanges: data.record.firstChanges,
      conclusion: data.conclusion,
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');
  const capture = readCaptureState();

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
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(ws, '!!window.__phase920 && !!window.__coldbootReadEditLineState', 'phase920 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__phase920.read('afterBoot')`, 30000);
  const alphaContext = await evalExpr(ws, `window.__phase920.armAlphaForKeyA()`, 30000);
  await evalExpr(ws, `window.__phase920.begin('alpha-KeyA')`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${KEY.code}'`, 'alpha-KeyA completion', 120000);
  await sleep(150);

  const record = await evalExpr(ws, `window.__phase920.finish()`, 30000);
  const afterKey = await evalExpr(ws, `window.__phase920.read('afterKey')`, 30000);
  const { absoluteRows, relativeRows } = buildComparisons(capture, afterBoot, afterKey, record);
  const key = afterKey.lastKey ?? {};
  const cleanExecution = (afterKey.pageErrors ?? []).length === 0
    && afterBoot.phase6?.termination === 'halt'
    && afterBoot.phase6?.vatSnapshotCaptured === true
    && (alphaContext.modifierFlags & alphaContext.alphaMask) !== 0
    && key.code === KEY.code
    && key.termination === 'control_pre_stop'
    && key.controlStopPc === 0x001879;
  const tokenRow = relativeRows.find((row) => row.name === 'TOKEN[cursor-1]');
  const d02a29Row = relativeRows.find((row) => row.name === 'D02A29 cursor-pixel-offset');
  const nonLayoutAbsolute = absoluteRows.filter((row) => (
    !row.match && !((row.name === 'D010EF' || row.name === 'D010FE') && row.oracle - row.actual === 3)
  ));
  const conclusion = tokenRow?.match
    ? (d02a29Row?.match
      ? 'The browser alpha-KeyA route matches the real alpha-A edit token and cursor geometry after cursor-relative normalization.'
      : 'The A token matches after cursor-relative normalization, but D02A29 remains divergent; its bounded route has no observed writer before the control pre-stop.')
    : `The literal browser Alpha+KeyA chord does not represent real alpha-A: it produced ${hex(tokenRow?.actual, 2)} while the capture has ${hex(tokenRow?.oracle, 2)}. Mapping evidence identifies KeyA as scan ${hex(alphaContext.keyAScan, 2)} / internal ${hex(alphaContext.keyAInternal, 2)}, while the A-bearing KeyM route is scan ${hex(alphaContext.keyMScan, 2)} / internal ${hex(alphaContext.keyMInternal, 2)}. D02A29 is ${d02a29Row?.match ? 'matched' : 'also still divergent'} before the existing pre-wipe stop. ${nonLayoutAbsolute.length} non-layout absolute mismatch(es) arise during Phase 6 after the stable-replay boundary and before the key route.`;

  return {
    probe: 'phase920-browser-alpha-a-cursor-relative-audit',
    pass: cleanExecution,
    cleanExecution,
    pageUrl,
    alphaContext,
    capture,
    afterBoot,
    afterKey,
    record,
    absoluteRows,
    relativeRows,
    conclusion,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    alphaContext: summary.alphaContext,
    key: summary.afterKey?.lastKey,
    absoluteMismatches: summary.absoluteRows?.filter((row) => !row.match),
    relativeMismatches: summary.relativeRows?.filter((row) => !row.match),
    conclusion: summary.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase920-browser-alpha-a-cursor-relative-audit', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

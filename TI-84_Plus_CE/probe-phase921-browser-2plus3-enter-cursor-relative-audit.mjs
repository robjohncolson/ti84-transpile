import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase921-browser-2plus3-enter-cursor-relative-audit.md');
const CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-2plus3-enter-D00000-D657FF.bin');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const RAM_BASE = 0xD00000;
const DEBUG_PORT = 9921;
const KEY_SEQUENCE = Object.freeze([
  { code: 'Digit2', key: '2', vk: 50, label: '2' },
  { code: 'NumpadAdd', key: '+', vk: 107, label: '+' },
  { code: 'Digit3', key: '3', vk: 51, label: '3' },
  { code: 'Enter', key: 'Enter', vk: 13, label: 'ENTER' },
]);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase921-2plus3-enter-'));
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
const CURSOR_OFFSETS = Object.freeze([-3, -2, -1, 0]);

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
    Array.from({ length: 17 }, (_, i) => i - 8).map((offset) => [
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
  if (!sourceHtml.includes(marker)) throw new Error('Phase921 marker not found: finalizeColdbootPersistenceState');
  if (!sourceHtml.includes(snapshotLine)) throw new Error('Phase921 marker not found: stable snapshot line');
  if (!sourceHtml.includes(replayLine)) throw new Error('Phase921 marker not found: stable replay line');
  if (!sourceHtml.includes(phase6Line)) throw new Error('Phase921 marker not found: Phase 6 run line');

  const instrumentation = String.raw`
const PHASE921_FIELDS = Object.freeze([
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

function phase921ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase921ReadFields(record = null) {
  const mem = cpu?.memory;
  if (!mem) return null;
  const fields = Object.fromEntries(PHASE921_FIELDS.map(([name, addr, len]) => [
    name,
    phase921ReadValue(mem, addr, len),
  ]));
  if (record?.lineBase != null) {
    for (let i = 0; i < 8; i += 1) fields['TOKEN_BASE_' + i] = mem[(record.lineBase + i) & 0xFFFFFF] ?? 0;
  }
  return fields;
}

function phase921Capture(label) {
  const mem = cpu?.memory;
  const fields = phase921ReadFields();
  const cursor = fields?.D0243A ?? null;
  const cursorBytes = cursor == null || !mem
    ? null
    : Object.fromEntries(Array.from({ length: 17 }, (_, i) => i - 8).map((offset) => [
      String(offset),
      mem[(cursor + offset) & 0xFFFFFF] ?? 0,
    ]));
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    fields,
    cursor,
    cursorBytes,
    stableSnapshot: window.__phase921StableSnapshot ?? null,
    postReplayFields: window.__phase921PostReplayFields ?? null,
    phase6Trace: window.__phase921Phase6Trace ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    phase6: window.__coldbootPhase6 ?? null,
    pageErrors: [...window.__phase921PageErrors],
  };
}

window.__phase921PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase921PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase921PageErrors.push(String(event.reason || event));
});

window.__phase921 = {
  record: null,
  records: [],
  lineBase: null,
  read: phase921Capture,
  setLineBase() {
    this.lineBase = phase921ReadValue(cpu.memory, 0xD0243A, 3);
    return this.lineBase;
  },
  begin(label) {
    this.record = {
      label,
      active: true,
      lineBase: this.lineBase,
      blocks: 0,
      prevPc: null,
      firstChanges: [],
      start: phase921Capture(label + ':start'),
      lastFields: null,
    };
    this.record.lastFields = phase921ReadFields(this.record);
    return this.record.start;
  },
  finish() {
    if (!this.record) return null;
    this.record.active = false;
    this.record.end = phase921Capture(this.record.label + ':end');
    this.records.push(this.record);
    const result = this.record;
    this.record = null;
    return result;
  },
};

const phase921OriginalObserve = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase921Observe(state, pc) {
  const record = window.__phase921?.record;
  const addr = pc & 0xFFFFFF;
  if (record?.active) {
    record.blocks += 1;
    const fields = phase921ReadFields(record);
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
  return phase921OriginalObserve(state, pc);
};
`;

  return sourceHtml
    .replace(marker, `${instrumentation}\n\n${marker}`)
    .replace(snapshotLine, `${snapshotLine}
      window.__phase921StableSnapshot = Object.fromEntries(coldbootVatSnapshot.map(([field, value]) => [field[0], value]));`)
    .replace(replayLine, `${replayLine}
    window.__phase921PostReplayFields = phase921ReadFields();`)
    .replace(phase6Line, `  window.__phase921Phase6Trace = {
    blocks: 0,
    prevPc: null,
    firstChanges: [],
    lastFields: phase921ReadFields(),
  };
  const p6 = executor.runFrom(COLDBOOT_HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      const trace = window.__phase921Phase6Trace;
      const addr = pc & 0xFFFFFF;
      trace.blocks += 1;
      const fields = phase921ReadFields();
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

function keyParams(keySpec, type) {
  return {
    type,
    windowsVirtualKeyCode: keySpec.vk,
    nativeVirtualKeyCode: keySpec.vk,
    code: keySpec.code,
    key: keySpec.key,
  };
}

async function pressKey(keySpec) {
  await evalExpr(ws, `window.__phase921.begin(${JSON.stringify(keySpec.label)})`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${keySpec.code}'`, `${keySpec.label} completion`, 120000);
  await sleep(150);
  const record = await evalExpr(ws, 'window.__phase921.finish()', 30000);
  const state = await evalExpr(ws, `window.__phase921.read(${JSON.stringify(`after-${keySpec.label}`)})`, 30000);
  return { keySpec, record, state };
}

function firstChange(records, name) {
  for (const record of records ?? []) {
    const change = record?.firstChanges?.find((row) => row.name === name);
    if (change) return { ...change, keyLabel: record.label };
  }
  return null;
}

function absoluteOwner(name, oracle, actual, afterBoot, records) {
  const before = afterBoot.fields[name];
  if ((name === 'D010EF' || name === 'D010FE') && oracle - actual === 3 && before === actual) {
    return 'capture/browser session-layout delta (-3 in browser); already present before keys';
  }
  if (before !== oracle) {
    const phase6Change = afterBoot.phase6Trace?.firstChanges?.find((row) => row.name === name);
    if (phase6Change) {
      return `Phase 6 first write at pc ${hex(phase6Change.pc)} (prev ${hex(phase6Change.prevPc)}): ${hex(phase6Change.before, widthFor(name))}->${hex(phase6Change.after, widthFor(name))}`;
    }
    return 'coldboot baseline already differed before the key sequence';
  }
  const change = firstChange(records, name);
  if (change) return `${change.keyLabel} first write at pc ${hex(change.pc)} (prev ${hex(change.prevPc)})`;
  if (actual !== oracle) return 'unchanged during the bounded key sequence; no writer observed';
  return '-';
}

function sequenceOwner(keyRuns, detail = '') {
  const digit3Run = keyRuns[2];
  const repeatedInsert = digit3Run?.record?.firstChanges?.find((row) => row.name === 'TOKEN_BASE_3');
  if (digit3Run?.state?.lastKey?.termination === 'max_steps' && repeatedInsert) {
    return `Digit3 repeated insert owner at pc ${hex(repeatedInsert.pc)} (prev ${hex(repeatedInsert.prevPc)}, block ${repeatedInsert.block}) wrote 0x31 after the intended 0x33${detail}`;
  }
  const enter = keyRuns.at(-1)?.state?.lastKey ?? {};
  if (enter.termination === 'control_pre_stop' && enter.controlStopPc === 0x001879) {
    return `ENTER shell pre-stop at 0x001879${enter.controlStopCursorRestored ? ' restored the pre-ENTER cursor' : ''}${detail}`;
  }
  return `sequence was already divergent before ENTER${detail}`;
}

function buildComparisons(capture, afterBoot, afterEnter, keyRuns) {
  const records = keyRuns.map((row) => row.record);
  const absoluteRows = ABSOLUTE_FIELDS.map(([name]) => {
    const oracle = capture.fields[name];
    const actual = afterEnter.fields[name];
    return {
      name,
      mode: 'absolute',
      oracle,
      actual,
      match: oracle === actual,
      owner: absoluteOwner(name, oracle, actual, afterBoot, records),
    };
  });

  const oracleCursor = capture.fields.D0243A;
  const actualCursor = afterEnter.fields.D0243A;
  const browserLineBase = afterBoot.fields.D0243A;
  const relativeRows = [
    {
      name: 'D0243A cursor-from-line-base',
      rawOracle: oracleCursor,
      rawActual: actualCursor,
      oracle: 0,
      actual: (actualCursor - browserLineBase) & 0xFFFFFF,
      width: 6,
      ownerName: 'D0243A',
      owner: sequenceOwner(keyRuns, `; final browser cursor offset is +${(actualCursor - browserLineBase) & 0xFFFFFF}`),
    },
    ...CURSOR_OFFSETS.map((offset) => {
      const oracle = capture.cursorBytes[String(offset)];
      const actual = afterEnter.cursorBytes[String(offset)];
      const tokenIndex = (actualCursor + offset - browserLineBase) & 0xFFFFFF;
      const original = tokenIndex < 8 ? firstChange(records, `TOKEN_BASE_${tokenIndex}`) : null;
      return {
        name: `TOKEN[cursor${offset >= 0 ? '+' : ''}${offset}]`,
        rawOracle: oracle,
        rawActual: actual,
        oracle,
        actual,
        width: 2,
        ownerName: tokenIndex < 8 ? `TOKEN_BASE_${tokenIndex}` : null,
        owner: oracle !== actual
          ? sequenceOwner(keyRuns, original ? `; compared byte was first written by ${original.keyLabel} at pc ${hex(original.pc)} (prev ${hex(original.prevPc)})` : '; final byte is downstream damage')
          : '-',
      };
    }),
    {
      name: 'D0243D-cursor',
      rawOracle: capture.fields.D0243D,
      rawActual: afterEnter.fields.D0243D,
      oracle: (capture.fields.D0243D - oracleCursor) & 0xFFFFFF,
      actual: (afterEnter.fields.D0243D - actualCursor) & 0xFFFFFF,
      width: 6,
      ownerName: 'D0243D',
      owner: sequenceOwner(keyRuns, '; descriptor state is downstream of the repeated insert'),
    },
    {
      name: 'D02440-cursor',
      rawOracle: capture.fields.D02440,
      rawActual: afterEnter.fields.D02440,
      oracle: (capture.fields.D02440 - oracleCursor) & 0xFFFFFF,
      actual: (afterEnter.fields.D02440 - actualCursor) & 0xFFFFFF,
      width: 6,
      ownerName: 'D02440',
      owner: sequenceOwner(keyRuns, '; descriptor state is downstream of the repeated insert'),
    },
    {
      name: 'D02A29 cursor-pixel-offset',
      rawOracle: capture.fields.D02A29,
      rawActual: afterEnter.fields.D02A29,
      oracle: capture.fields.D02A29,
      actual: afterEnter.fields.D02A29,
      width: 4,
      ownerName: 'D02A29',
      owner: '-',
    },
  ].map((row) => ({ ...row, mode: 'cursor-relative', match: row.oracle === row.actual }));

  for (const row of relativeRows) {
    if (row.match) row.owner = '-';
    else if (!row.owner || row.owner === '-') {
      const change = row.ownerName ? firstChange(records, row.ownerName) : null;
      row.owner = change
        ? `${change.keyLabel} first write at pc ${hex(change.pc)} (prev ${hex(change.prevPc)})`
        : 'no bounded writer observed';
    }
  }
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
    { label: 'Real 2+3 ENTER', value: (row) => hex(row.oracle, widthFor(row.name)) },
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

function keyRouteTable(keyRuns) {
  return table(keyRuns, [
    { label: 'Key', value: (row) => row.keySpec.label },
    { label: 'Code', value: (row) => row.keySpec.code },
    { label: 'Label', value: (row) => row.state.lastKey?.label ?? '-' },
    { label: 'Termination', value: (row) => row.state.lastKey?.termination ?? '-' },
    { label: 'Steps', value: (row) => String(row.state.lastKey?.steps ?? '-') },
    { label: 'Cursor', value: (row) => hex(row.state.fields?.D0243A) },
    { label: 'Buffer[0..3]', value: (row) => (row.state.lastKey?.buffer ?? []).slice(0, 4).map((value) => hex(value, 2)).join(' ') },
    { label: 'Control stop', value: (row) => hex(row.state.lastKey?.controlStopPc) },
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
    return `# Phase 921: Browser 2+3 ENTER cursor-relative audit\n\nProbe failed:\n\n\`\`\`text\n${data.error}\n\`\`\`\n`;
  }

  const absoluteMismatches = data.absoluteRows.filter((row) => !row.match);
  const relativeMismatches = data.relativeRows.filter((row) => !row.match);
  const layoutAbsoluteMismatches = absoluteMismatches.filter((row) => (
    (row.name === 'D010EF' || row.name === 'D010FE') && row.oracle - row.actual === 3
  ));
  const realAbsoluteMismatches = absoluteMismatches.filter((row) => !layoutAbsoluteMismatches.includes(row));
  const enterRecord = data.keyRuns.at(-1).record;
  return [
    '# Phase 921: Browser 2+3 ENTER Cursor-Relative Field Audit',
    '',
    'Probe: `probe-phase921-browser-2plus3-enter-cursor-relative-audit.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase921-browser-2plus3-enter-cursor-relative-audit.mjs`',
    '',
    'Serves an observation-only in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, dispatches `2`, `+`, `3`, `ENTER`, and compares the final RAM state to the real-hardware compute capture. Disk browser code is not edited.',
    '',
    '## Summary',
    '',
    `- Probe execution: ${data.pass ? 'PASS' : 'FAIL'} (${data.cleanExecution ? 'bounded negative audit' : 'unexpected route/instrumentation failure'}).`,
    `- Real post-compute cursor/base: ${hex(data.capture.cursor)}; browser initial line base: ${hex(data.afterBoot.cursor)}; browser post-ENTER cursor: ${hex(data.afterEnter.cursor)} (offset +${(data.afterEnter.cursor - data.afterBoot.cursor) & 0xFFFFFF}).`,
    `- Absolute OS/VAT comparison: ${absoluteMismatches.length} mismatches of ${data.absoluteRows.length}: ${layoutAbsoluteMismatches.length} exact session-layout shifts and ${realAbsoluteMismatches.length} non-layout mismatches.`,
    `- Cursor-relative edit comparison: ${relativeMismatches.length} mismatches of ${data.relativeRows.length}.`,
    `- First divergence: ${data.firstDivergence}.`,
    `- ENTER route (downstream of that divergence): termination=${data.afterEnter.lastKey?.termination ?? '-'}, steps=${data.afterEnter.lastKey?.steps ?? '-'}, control stop=${hex(data.afterEnter.lastKey?.controlStopPc)}, label=${data.afterEnter.lastKey?.controlPreStopLabel ?? '-'}, cursor restore=${data.afterEnter.lastKey?.controlStopCursorRestored ?? false}.`,
    `- Page errors: ${JSON.stringify(data.afterEnter.pageErrors)}.`,
    `- Adjudication: ${data.conclusion}`,
    '',
    '## Per-Key Route',
    '',
    keyRouteTable(data.keyRuns),
    '',
    '## Absolute OS-State Fields',
    '',
    absoluteTable(data.absoluteRows),
    '',
    '## Cursor-Relative Edit-Line Fields',
    '',
    'The real post-compute capture has an empty line, so its own `D0243A` is the line base. The browser line base is its pre-sequence `D0243A`. Cursor displacement is normalized from those per-side bases; token bytes are compared at offsets from each side\'s final cursor; descriptor pointers are normalized by subtracting each side\'s final cursor. Because the browser first diverges during Digit3, final ENTER mismatches below are downstream measurements, not independent ENTER owners.',
    '',
    relativeTable(data.relativeRows),
    '',
    '## First Observed ENTER-Route Writes',
    '',
    changeTable(enterRecord.firstChanges),
    '',
    '## Bounded Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      cleanExecution: data.cleanExecution,
      capture: { cursor: data.capture.cursor, fields: data.capture.fields, cursorBytes: data.capture.cursorBytes },
      afterBoot: {
        cursor: data.afterBoot.cursor,
        fields: data.afterBoot.fields,
        phase6: data.afterBoot.phase6,
        phase6Trace: data.afterBoot.phase6Trace,
      },
      keyRuns: data.keyRuns.map((row) => ({
        keySpec: row.keySpec,
        lastKey: row.state.lastKey,
        cursor: row.state.cursor,
        fields: row.state.fields,
        firstChanges: row.record.firstChanges,
      })),
      absoluteMismatches,
      layoutAbsoluteMismatches,
      realAbsoluteMismatches,
      relativeMismatches,
      firstDivergence: data.firstDivergence,
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
  await waitFor(ws, '!!window.__phase921 && !!window.__coldbootReadEditLineState', 'phase921 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__phase921.read('afterBoot')`, 30000);
  const browserLineBase = await evalExpr(ws, 'window.__phase921.setLineBase()', 30000);
  if (browserLineBase !== afterBoot.cursor) throw new Error('Phase921 line-base capture changed unexpectedly');

  const keyRuns = [];
  for (const keySpec of KEY_SEQUENCE) keyRuns.push(await pressKey(keySpec));
  const afterEnter = keyRuns.at(-1).state;
  const { absoluteRows, relativeRows } = buildComparisons(capture, afterBoot, afterEnter, keyRuns);

  const keyRoutesClean = keyRuns.every((row) => row.state.lastKey?.code === row.keySpec.code);
  const firstTwoInsertRoutesClean = keyRuns.slice(0, 2).every((row) => (
    row.state.lastKey?.termination === 'post_insert_gate_stop'
    && row.state.lastKey?.stoppedAtPostInsertGate === true
  ));
  const digit3 = keyRuns[2];
  const repeatedDigit3Insert = digit3.record?.firstChanges?.find((row) => row.name === 'TOKEN_BASE_3');
  const digit3DivergenceBounded = digit3.state.lastKey?.insertBlock != null
    && digit3.state.lastKey?.termination === 'max_steps'
    && repeatedDigit3Insert?.after === 0x31
    && repeatedDigit3Insert?.pc === 0x05E372;
  const enter = afterEnter.lastKey ?? {};
  const enterDownstreamBounded = enter.code === 'Enter' && enter.termination === 'max_steps';
  const cleanExecution = (afterEnter.pageErrors ?? []).length === 0
    && afterBoot.phase6?.termination === 'halt'
    && afterBoot.phase6?.vatSnapshotCaptured === true
    && keyRoutesClean
    && firstTwoInsertRoutesClean
    && digit3DivergenceBounded
    && enterDownstreamBounded;

  const relativeMismatches = relativeRows.filter((row) => !row.match);
  const nonLayoutAbsolute = absoluteRows.filter((row) => (
    !row.match && !((row.name === 'D010EF' || row.name === 'D010FE') && row.oracle - row.actual === 3)
  ));
  const firstDivergence = digit3DivergenceBounded
    ? `after 2 and + complete, Digit3 inserts the intended 0x33 at 0x05E372 (block ${digit3.state.lastKey.insertBlock}) but revisits the same owner at block ${repeatedDigit3Insert.block}, writes an unexpected 0x31 at the next slot, and exhausts 300000 steps before 0x0158DE`
    : 'the expected bounded Digit3 repeated-insert signature was not observed';
  const conclusion = relativeMismatches.length === 0
    ? `The browser 2+3 ENTER route matches the real post-compute edit context after cursor-relative normalization; ${nonLayoutAbsolute.length} non-layout absolute mismatch(es) remain.`
    : `The first browser/hardware integration divergence is before ENTER: ${firstDivergence}. ENTER then starts from the already-divergent cursor/buffer, also exhausts 300000 steps, and never reaches its expected 0x001879 pre-stop. Therefore the ${relativeMismatches.length} final cursor-relative mismatch(es) and late RAM clearing are downstream of the repeated 0x05E372 Digit3 insert owner, not evidence of a standalone ENTER owner. ${nonLayoutAbsolute.length} non-layout absolute mismatch(es) were measured at the final bounded stop.`;

  return {
    probe: 'phase921-browser-2plus3-enter-cursor-relative-audit',
    pass: cleanExecution,
    cleanExecution,
    pageUrl,
    capture,
    afterBoot,
    afterEnter,
    keyRuns,
    absoluteRows,
    relativeRows,
    firstDivergence,
    conclusion,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    keyRoutes: summary.keyRuns?.map((row) => ({
      key: row.keySpec.label,
      code: row.state.lastKey?.code,
      label: row.state.lastKey?.label,
      termination: row.state.lastKey?.termination,
      steps: row.state.lastKey?.steps,
      cursor: hex(row.state.cursor),
      buffer: row.state.lastKey?.buffer?.slice(0, 4),
      controlStopPc: hex(row.state.lastKey?.controlStopPc),
    })),
    absoluteMismatches: summary.absoluteRows?.filter((row) => !row.match),
    relativeMismatches: summary.relativeRows?.filter((row) => !row.match),
    firstDivergence: summary.firstDivergence,
    conclusion: summary.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase921-browser-2plus3-enter-cursor-relative-audit', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

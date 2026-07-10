import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase926-plus-conditioned-pre-enter-owner.md');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DEBUG_PORT = 9926;
const GATE_PC = 0x0158DE;
const GATE_RETURN_PC = 0x0013DA;
const INSERT_PC = 0x05E372;
const CONTROL_SEQUENCE = Object.freeze([
  { code: 'Digit1', key: '1', vk: 49, label: '1', expectedIndex: 0, expectedByte: 0x31 },
  { code: 'Digit2', key: '2', vk: 50, label: '2', expectedIndex: 1, expectedByte: 0x32 },
  { code: 'Digit3', key: '3', vk: 51, label: '3', expectedIndex: 2, expectedByte: 0x33 },
]);
const PLUS_SEQUENCE = Object.freeze([
  { code: 'Digit2', key: '2', vk: 50, label: '2', expectedIndex: 0, expectedByte: 0x32 },
  { code: 'NumpadAdd', key: '+', vk: 107, label: '+', expectedIndex: 1, expectedByte: 0x9E },
  { code: 'Digit3', key: '3', vk: 51, label: '3', expectedIndex: 2, expectedByte: 0x33 },
]);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase926-plus-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

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
  if (!sourceHtml.includes(marker)) throw new Error('Phase923 marker not found: finalizeColdbootPersistenceState');

  const instrumentation = String.raw`
const PHASE926_GATE_PC = 0x0158DE;
const PHASE926_GATE_RETURN_PC = 0x0013DA;
const PHASE926_INSERT_PC = 0x05E372;

function phase926Read24(addr) {
  const mem = cpu.memory;
  return ((mem[addr] ?? 0) | ((mem[addr + 1] ?? 0) << 8) | ((mem[addr + 2] ?? 0) << 16)) >>> 0;
}

function phase926Buffer(base) {
  return Array.from(cpu.memory.slice(base, base + 8));
}

function phase926Window(start, end) {
  return Array.from(cpu.memory.slice(start, end));
}

function phase926TraceRow(pc, block, base) {
  const mem = cpu.memory;
  return [
    pc & 0xFFFFFF,
    block,
    cpu.af ?? 0,
    cpu.bc ?? 0,
    cpu.de ?? 0,
    cpu.hl ?? 0,
    cpu.sp ?? 0,
    mem[0xD00587] ?? 0,
    mem[0xD0058B] ?? 0,
    mem[0xD0058C] ?? 0,
    mem[0xD0058D] ?? 0,
    mem[0xD0058E] ?? 0,
    mem[0xD00080] ?? 0,
    mem[0xD0009F] ?? 0,
    phase926Read24(0xD0243A),
    phase926Read24(0xD0243D),
    phase926Read24(0xD02440),
    ...phase926Buffer(base).slice(0, 5),
    mem[0xD000C2] ?? 0,
    mem[0xD000C3] ?? 0,
    mem[0xD000C4] ?? 0,
    mem[0xD0009B] ?? 0,
    window.__phase926?.record?.phase === 'drain' ? 1 : 0,
  ];
}

window.__phase926PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase926PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase926PageErrors.push(String(event.reason || event));
});

window.__phase926 = {
  lineBase: null,
  record: null,
  records: [],
  setLineBase() {
    this.lineBase = phase926Read24(0xD0243A);
    return this.lineBase;
  },
  begin(spec) {
    this.record = {
      label: spec.label,
      expectedIndex: spec.expectedIndex,
      expectedByte: spec.expectedByte,
      active: true,
      phase: 'burst',
      blocks: 0,
      prevPc: null,
      lineBase: this.lineBase,
      lastBuffer: phase926Buffer(this.lineBase),
      lastControl: [cpu.memory[0xD000C2] ?? 0, cpu.memory[0xD000C3] ?? 0, cpu.memory[0xD000C4] ?? 0],
      lastD0009B: cpu.memory[0xD0009B] ?? 0,
      writes: [],
      controlWrites: [],
      D0009BWrites: [],
      milestones: [],
      trace: [],
      traceActive: false,
      traceEnd: null,
      drainStart: null,
      drainEnd: null,
      handoffs: [],
      start: {
        cursor: phase926Read24(0xD0243A),
        descriptor: phase926Read24(0xD0243D),
        buffer: phase926Buffer(this.lineBase),
        control: [cpu.memory[0xD000C2] ?? 0, cpu.memory[0xD000C3] ?? 0, cpu.memory[0xD000C4] ?? 0],
        keyRam: phase926Window(0xD00580, 0xD00591),
        flagRam: phase926Window(0xD00080, 0xD000C8),
      },
    };
    return this.record.start;
  },
  finish() {
    if (!this.record) return null;
    this.record.active = false;
    this.record.end = {
      cursor: phase926Read24(0xD0243A),
      descriptor: phase926Read24(0xD0243D),
      buffer: phase926Buffer(this.lineBase),
      control: [cpu.memory[0xD000C2] ?? 0, cpu.memory[0xD000C3] ?? 0, cpu.memory[0xD000C4] ?? 0],
      keyRam: phase926Window(0xD00580, 0xD00591),
      flagRam: phase926Window(0xD00080, 0xD000C8),
      lastKey: window.__coldbootLastKey ?? null,
    };
    const result = this.record;
    this.records.push(result);
    this.record = null;
    return result;
  },
};

const phase926OriginalObserve = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase926Observe(state, pc) {
  const record = window.__phase926?.record;
  const addr = pc & 0xFFFFFF;
  if (record?.active && cpu?.memory) {
    record.blocks += 1;
    const buffer = phase926Buffer(record.lineBase);
    const control = [cpu.memory[0xD000C2] ?? 0, cpu.memory[0xD000C3] ?? 0, cpu.memory[0xD000C4] ?? 0];
    const changes = [];
    for (let i = 0; i < buffer.length; i += 1) {
      if (buffer[i] !== record.lastBuffer[i]) {
        changes.push({ index: i, before: record.lastBuffer[i], after: buffer[i] });
      }
    }
    const intended = changes.some((change) => change.index === record.expectedIndex && change.after === record.expectedByte);
    const repeated = record.label === '3'
      && changes.some((change) => change.index === 3 && change.after === 0x31);

    if (intended && !record.traceActive && record.traceEnd === null) {
      record.traceActive = true;
      record.milestones.push({ kind: 'intended_insert', pc: addr, block: record.blocks, row: phase926TraceRow(addr, record.blocks, record.lineBase) });
    }
    if (record.traceActive) {
      if (record.trace.length < 12000) record.trace.push(phase926TraceRow(addr, record.blocks, record.lineBase));
      else if (record.traceEnd === null) record.traceEnd = 'trace_cap';
    }
    if (changes.length > 0) {
      record.writes.push({ pc: addr, block: record.blocks, changes, row: phase926TraceRow(addr, record.blocks, record.lineBase) });
    }
    for (let i = 0; i < control.length; i += 1) {
      if (control[i] === record.lastControl[i]) continue;
      record.controlWrites.push({
        field: ['D000C2', 'D000C3', 'D000C4'][i],
        before: record.lastControl[i],
        after: control[i],
        pc: addr,
        prevPc: record.prevPc,
        block: record.blocks,
        row: phase926TraceRow(addr, record.blocks, record.lineBase),
      });
    }
    const D0009B = cpu.memory[0xD0009B] ?? 0;
    if (D0009B !== record.lastD0009B) {
      record.D0009BWrites.push({
        before: record.lastD0009B,
        after: D0009B,
        pc: addr,
        prevPc: record.prevPc,
        block: record.blocks,
        phase: record.phase,
        row: phase926TraceRow(addr, record.blocks, record.lineBase),
      });
      record.lastD0009B = D0009B;
    }
    if (addr === PHASE926_GATE_PC || addr === PHASE926_GATE_RETURN_PC || addr === PHASE926_INSERT_PC) {
      record.milestones.push({
        kind: addr === PHASE926_GATE_PC ? 'gate_entry' : addr === PHASE926_GATE_RETURN_PC ? 'gate_return' : 'insert_pc',
        pc: addr,
        block: record.blocks,
        row: phase926TraceRow(addr, record.blocks, record.lineBase),
      });
    }
    if (addr === 0x03F9B0) {
      record.handoffs.push({
        pc: addr,
        block: record.blocks,
        D0058B: cpu.memory[0xD0058B] ?? 0,
        D000C3: cpu.memory[0xD000C3] ?? 0,
        row: phase926TraceRow(addr, record.blocks, record.lineBase),
      });
    }
    if (repeated && record.traceActive) {
      record.traceEnd = 'repeated_insert';
      record.traceActive = false;
      record.milestones.push({ kind: 'repeated_insert', pc: addr, block: record.blocks, row: phase926TraceRow(addr, record.blocks, record.lineBase) });
    }
    record.lastBuffer = buffer;
    record.lastControl = control;
    record.prevPc = addr;
  }
  return phase926OriginalObserve(state, pc);
};

const phase926OriginalDrain = runColdbootPostInsertFirstZeroDrain;
runColdbootPostInsertFirstZeroDrain = function phase926Drain() {
  const record = window.__phase926?.record;
  if (record?.active) {
    record.phase = 'drain';
    record.drainStart = {
      block: record.blocks,
      D0058B: cpu.memory[0xD0058B] ?? 0,
      D000C3: cpu.memory[0xD000C3] ?? 0,
      keyRam: phase926Window(0xD00580, 0xD00591),
      flagRam: phase926Window(0xD00080, 0xD000C8),
    };
  }
  try {
    return phase926OriginalDrain();
  } finally {
    if (record?.active) {
      record.drainEnd = {
        block: record.blocks,
        D0058B: cpu.memory[0xD0058B] ?? 0,
        D000C3: cpu.memory[0xD000C3] ?? 0,
        keyRam: phase926Window(0xD00580, 0xD00591),
        flagRam: phase926Window(0xD00080, 0xD000C8),
      };
      record.phase = 'after_drain';
      if (record.traceActive) {
        record.traceActive = false;
        record.traceEnd = 'drain_end';
      }
    }
  }
};
`;

  return sourceHtml.replace(marker, `${instrumentation}\n\n${marker}`);
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
        res.end(instrumentBrowserShell(fs.readFileSync(BROWSER_SHELL_PATH, 'utf8')));
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
  await evalExpr(ws, `window.__phase926.begin(${JSON.stringify(keySpec)})`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${keySpec.code}'`, `${keySpec.label} completion`, 120000);
  await sleep(100);
  return evalExpr(ws, 'window.__phase926.finish()', 30000);
}

async function bootColdboot() {
  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return document.getElementById('status').textContent;
  })()`, 180000);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);
}

async function runScenario(name, sequence) {
  await bootColdboot();
  const lineBase = await evalExpr(ws, 'window.__phase926.setLineBase()', 30000);
  const records = [];
  for (const keySpec of sequence) records.push(await pressKey(keySpec));
  return { name, lineBase, records };
}

const pcOf = (row) => row?.[0] ?? null;
const phaseOf = (row) => row?.[26] ?? 0;

function phaseRecord(record, phase) {
  return { ...record, trace: record.trace.filter((row) => phaseOf(row) === phase) };
}

function windowDiffs(left, right, base) {
  const rows = [];
  for (let i = 0; i < Math.max(left?.length ?? 0, right?.length ?? 0); i += 1) {
    if (left?.[i] !== right?.[i]) rows.push({ addr: base + i, control: left?.[i] ?? null, plus: right?.[i] ?? null });
  }
  return rows;
}

function edgeSet(records) {
  const set = new Set();
  for (const record of records) {
    for (let i = 1; i < record.trace.length; i += 1) {
      set.add(`${pcOf(record.trace[i - 1])}:${pcOf(record.trace[i])}`);
    }
  }
  return set;
}

function firstNovelEdge(badRecord, cleanRecords) {
  const clean = edgeSet(cleanRecords);
  for (let i = 1; i < badRecord.trace.length; i += 1) {
    const from = pcOf(badRecord.trace[i - 1]);
    const to = pcOf(badRecord.trace[i]);
    if (!clean.has(`${from}:${to}`)) {
      return {
        index: i,
        from,
        to,
        fromRow: badRecord.trace[i - 1],
        toRow: badRecord.trace[i],
        window: badRecord.trace.slice(Math.max(0, i - 8), Math.min(badRecord.trace.length, i + 9)),
      };
    }
  }
  return null;
}

function transitionsFrom(records, fromPc) {
  const rows = [];
  const seen = new Set();
  for (const record of records) {
    for (let i = 1; i < record.trace.length; i += 1) {
      if (pcOf(record.trace[i - 1]) !== fromPc) continue;
      const to = pcOf(record.trace[i]);
      const key = `${record.label}:${fromPc}:${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        label: record.label,
        from: fromPc,
        to,
        fromRow: record.trace[i - 1],
        toRow: record.trace[i],
      });
    }
  }
  return rows;
}

function topPcCounts(record, limit = 16) {
  const counts = new Map();
  for (const row of record.trace) counts.set(pcOf(row), (counts.get(pcOf(row)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([pc, count]) => ({ pc, count }));
}

function firstRepeatedEdge(record) {
  const seen = new Map();
  for (let i = 1; i < record.trace.length; i += 1) {
    const key = `${pcOf(record.trace[i - 1])}:${pcOf(record.trace[i])}`;
    if (seen.has(key)) {
      return {
        edge: key,
        firstIndex: seen.get(key),
        repeatIndex: i,
        from: pcOf(record.trace[i - 1]),
        to: pcOf(record.trace[i]),
      };
    }
    seen.set(key, i);
  }
  return null;
}

function decodeWindow(rom, startPc, maxInstructions = 12) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  for (let i = 0; i < maxInstructions && pc < rom.length; i += 1) {
    try {
      const instruction = decodeInstruction(rom, pc, 'adl');
      const length = Math.max(1, instruction.length ?? 1);
      rows.push({
        pc,
        bytes: Array.from(rom.slice(pc, pc + length)),
        mnemonic: instruction.mnemonic ?? instruction.tag ?? '???',
        target: instruction.target ?? instruction.branchTarget ?? null,
      });
      pc += length;
      if (instruction.isReturn || instruction.mnemonic === 'ret' || instruction.mnemonic === 'reti' || instruction.mnemonic === 'retn') break;
    } catch (error) {
      rows.push({ pc, bytes: [rom[pc]], mnemonic: `decode-error: ${error.message}` });
      pc += 1;
    }
  }
  return rows;
}

function formatTraceRow(row) {
  if (!row) return '-';
  return `${hex(row[0])} b${row[1]} AF=${hex(row[2], 6)} BC=${hex(row[3])} DE=${hex(row[4])} HL=${hex(row[5])} SP=${hex(row[6])} `
    + `D00587/8B/8C/8D/8E=${row.slice(7, 12).map((value) => hex(value, 2)).join('/')} `
    + `D00080/9F=${hex(row[12], 2)}/${hex(row[13], 2)} cursor=${hex(row[14])} desc=${hex(row[15])} end=${hex(row[16])} `
    + `buf=${row.slice(17, 22).map((value) => hex(value, 2)).join(' ')} `
    + `D000C2/C3/C4=${row.slice(22, 25).map((value) => hex(value, 2)).join('/')} D0009B=${hex(row[25], 2)} phase=${row[26] === 1 ? 'drain' : 'burst'}`;
}

function formatDecode(rows) {
  return rows.map((row) => `${hex(row.pc)}  ${row.bytes.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(18)}  ${row.mnemonic}`).join('\n');
}

function formatRecordTable(records) {
  const lines = [
    '| key | termination | steps | insert block | gate block | trace end | trace rows | final cursor | buffer[0..4] |',
    '|---|---|---:|---:|---:|---|---:|---|---|',
  ];
  for (const record of records) {
    const key = record.end.lastKey ?? {};
    lines.push(`| ${record.label} | ${key.termination ?? '-'} | ${key.steps ?? '-'} | ${key.insertBlock ?? '-'} | ${key.postInsertGateBlock ?? '-'} | ${record.traceEnd ?? '-'} | ${record.trace.length} | ${hex(record.end.cursor)} | ${record.end.buffer.slice(0, 5).map((value) => hex(value, 2)).join(' ')} |`);
  }
  return lines.join('\n');
}

function buildPhase926Report(data) {
  const controlDigit2 = data.control.records[1];
  const controlDigit3 = data.control.records[2];
  const plusPred = data.plus.records[1];
  const plusDigit3 = data.plus.records[2];
  const intended = plusDigit3.writes.find((write) => write.changes.some((change) => change.index === 2 && change.after === 0x33));
  const repeated = plusDigit3.writes.find((write) => write.changes.some((change) => change.index === 3 && change.after === 0x31));
  const candidate = data.firstNovelEdge;
  const clean = data.cleanTransitions.find((row) => row.to === 0x0A349F) ?? data.cleanTransitions[0];
  const controlDrain = controlDigit2.end.lastKey?.postInsertFirstZeroDrain;
  const plusDrain = plusPred.end.lastKey?.postInsertFirstZeroDrain;
  const finalFlagWrite = data.finalPlusD0009BWrite;
  const routeRows = [
    ...data.control.records.map((record) => ({ scenario: '123 control', record })),
    ...data.plus.records.map((record) => ({ scenario: '2+3', record })),
  ];
  const routeTable = [
    '| Scenario | Key | Key termination | Steps | Trace end | Buffer[0..3] | Drain termination |',
    '|---|---|---|---:|---|---|---|',
    ...routeRows.map(({ scenario, record }) => {
      const key = record.end.lastKey ?? {};
      return `| ${scenario} | ${record.label} | ${key.termination ?? '-'} | ${key.steps ?? '-'} | ${record.traceEnd ?? '-'} | ${record.end.buffer.slice(0, 4).map((value) => hex(value, 2)).join(' ')} | ${key.postInsertFirstZeroDrain?.termination ?? '-'} |`;
    }),
  ].join('\n');
  const handoffs = (record) => record.handoffs.map((row) => `(${hex(row.D0058B, 2)},${hex(row.D000C3, 2)},${hex(row.row?.[25], 2)})`).join(' ');
  const drainTable = [
    '| Predecessor | Start D0058B/C3/9B | Handoffs `(D0058B,C3,9B)` | Result | End D0058B/C3/9B |',
    '|---|---|---|---|---|',
    `| control Digit2 after \`1\` | ${hex(controlDigit2.drainStart?.D0058B, 2)}/${hex(controlDigit2.drainStart?.D000C3, 2)}/${hex(controlDigit2.drainStart?.flagRam?.[0x1B], 2)} | ${handoffs(controlDigit2)} | ${controlDrain?.termination ?? '-'} / ${controlDrain?.stopKind ?? '-'} | ${hex(controlDigit2.drainEnd?.D0058B, 2)}/${hex(controlDigit2.drainEnd?.D000C3, 2)}/${hex(controlDigit2.drainEnd?.flagRam?.[0x1B], 2)} |`,
    `| plus after \`2\` | ${hex(plusPred.drainStart?.D0058B, 2)}/${hex(plusPred.drainStart?.D000C3, 2)}/${hex(plusPred.drainStart?.flagRam?.[0x1B], 2)} | ${handoffs(plusPred)} | ${plusDrain?.termination ?? '-'} / ${plusDrain?.stopKind ?? '-'} | ${hex(plusPred.drainEnd?.D0058B, 2)}/${hex(plusPred.drainEnd?.D000C3, 2)}/${hex(plusPred.drainEnd?.flagRam?.[0x1B], 2)} |`,
  ].join('\n');
  const diffTable = [
    '| RAM byte | Control before Digit3 | Plus-conditioned before Digit3 |',
    '|---|---:|---:|',
    ...[...data.startDiffs.keyRam, ...data.startDiffs.flagRam].map((row) => `| ${hex(row.addr)} | ${hex(row.control, 2)} | ${hex(row.plus, 2)} |`),
  ].join('\n');
  const evidence = {
    pass: data.pass,
    controlRoutes: data.control.records.map((record) => ({ key: record.label, termination: record.end.lastKey?.termination, steps: record.end.lastKey?.steps, traceEnd: record.traceEnd, buffer: record.end.buffer.slice(0, 4), drain: record.end.lastKey?.postInsertFirstZeroDrain })),
    plusRoutes: data.plus.records.map((record) => ({ key: record.label, termination: record.end.lastKey?.termination, steps: record.end.lastKey?.steps, traceEnd: record.traceEnd, buffer: record.end.buffer.slice(0, 4), drain: record.end.lastKey?.postInsertFirstZeroDrain })),
    predecessorDrains: {
      controlDigit2: { start: controlDigit2.drainStart, handoffs: controlDigit2.handoffs.map(({ block, D0058B, D000C3, row }) => ({ block, D0058B, D000C3, D0009B: row?.[25] })), end: controlDigit2.drainEnd },
      plus: { start: plusPred.drainStart, handoffs: plusPred.handoffs.map(({ block, D0058B, D000C3, row }) => ({ block, D0058B, D000C3, D0009B: row?.[25] })), end: plusPred.drainEnd, finalD0009BWrite: finalFlagWrite },
    },
    digit3StartDiffs: data.startDiffs,
    firstBadEdge: candidate && { index: candidate.index, from: candidate.from, to: candidate.to, badFrom: candidate.fromRow, badTo: candidate.toRow, cleanTransitions: data.cleanTransitions },
    intendedInsert: intended,
    repeatedInsert: repeated,
    pageErrors: data.pageErrors,
  };
  return [
    '# Phase 926: Plus-Conditioned Pre-ENTER Owner Trace',
    '',
    'Probe: `probe-phase926-plus-conditioned-pre-enter-owner.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase926-plus-conditioned-pre-enter-owner.mjs`',
    '',
    'The probe serves an observation-only instrumented copy of `browser-shell.html`, runs independent fresh-page `123` and `2+3` scenarios, extends post-insert traces through the browser debounce drain, and never dispatches ENTER. Disk browser/runtime code is untouched.',
    '',
    '## Result',
    '',
    `- PASS: **${data.pass ? 'yes' : 'no'}**; page errors: ${JSON.stringify(data.pageErrors)}.`,
    `- Clean Digit3 reaches \`post_insert_gate_stop\` in ${controlDigit3.end.lastKey?.steps} steps with exact \`31 32 33 00\`. Plus-conditioned Digit3 inserts \`0x33\` at ${hex(intended?.pc)} block ${intended?.block}, never reaches \`0x0158DE\`, then repeats \`0x31\` at the same insert owner in block ${repeated?.block}.`,
    `- The first edge in the bad Digit3 trace absent from the complete clean Digit3 trace is **${hex(candidate?.from)} -> ${hex(candidate?.to)}** at trace index ${candidate?.index}. Clean takes **${hex(clean?.from)} -> ${hex(clean?.to)}**.`,
    '- Static decode names the controller: `0x0A349A: BIT 6,(IY+0x1B)` tests `D0009B` bit 6 and `0x0A349E: RET NZ`. Bad has `D0009B=0x60` and returns to `0x08C341`; clean has `D0009B=0x00` and falls through to `0x0A349F`.',
    `- The mismatch predates Digit3. The plus drain's final flag transition is observed at ${hex(finalFlagWrite?.pc)} after ${hex(finalFlagWrite?.prevPc)}: \`D0009B\` ${hex(finalFlagWrite?.before, 2)} -> ${hex(finalFlagWrite?.after, 2)}. The drain then accepts \`0x03F9B0\` with \`D0058B=0\`, \`D000C3=0\`, but \`D0009B=0x60\`.`,
    '- This is a diagnostic owner candidate, not a patch. A narrow observation-only A/B should test refusing handoff while `D0009B` bit 6 is set.',
    '',
    '## Route Bounds',
    '',
    routeTable,
    '',
    '## Predecessor Drain Chronology',
    '',
    drainTable,
    '',
    'The PHASE924 predicate lets the clean Digit2 drain reject three handoffs with `D000C3=0x06`; that bounded drain ends without an accepted handoff, and the next Digit3 is clean. The plus drain later accepts a handoff while `D0009B=0x60`, which directly controls the first subsequent Digit3 edge mismatch.',
    '',
    '## Digit3 Start-State Differences',
    '',
    diffTable,
    '',
    '`D0009B` is singled out because the first divergent instruction reads it directly. The other differences remain correlated state, not adjudicated owners.',
    '',
    '## First Bad Edge',
    '',
    'Bad route:',
    '',
    '```text',
    formatTraceRow(candidate?.fromRow),
    formatTraceRow(candidate?.toRow),
    '```',
    '',
    'Clean route:',
    '',
    '```text',
    formatTraceRow(clean?.fromRow),
    formatTraceRow(clean?.toRow),
    '```',
    '',
    'Static decode:',
    '',
    '```text',
    formatDecode(data.decode.from.slice(0, 4)),
    '```',
    '',
    '## Bounded JSON Evidence',
    '',
    '```json',
    JSON.stringify(evidence, null, 2),
    '```',
    '',
    'No ENTER event was sent. No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` file was changed.',
    '',
  ].join('\n');
}

function buildReport(data) {
  if (data?.control && data?.plus) return buildPhase926Report(data);
  if (data?.error) {
    return `# Phase 926: Repeated Digit3 owner trace\n\nProbe failed:\n\n\`\`\`text\n${data.error}\n\`\`\`\n`;
  }
  const digit3 = data.records[2];
  const repeated = digit3.writes.find((write) => write.changes.some((change) => change.index === 3 && change.after === 0x31));
  const intended = digit3.writes.find((write) => write.changes.some((change) => change.index === 2 && change.after === 0x33));
  const candidate = data.firstNovelEdge;
  const cleanTransitions = data.cleanTransitions;
  const digit2 = data.records[1];
  const gateHits = digit3.milestones.filter((row) => row.kind === 'gate_entry').length;
  const candidateLabel = candidate ? `${hex(candidate.from)} -> ${hex(candidate.to)}` : 'none';
  const branchSpecific = candidate?.from === 0x02FDAC
    && candidate?.to === 0x02FDB6
    && cleanTransitions.some((row) => row.to === 0x05C76C);
  const intervention = branchSpecific
    ? `The smallest owner-level intervention is in the browser debounce drain, not the edit buffer: after Digit2, runColdbootPostInsertFirstZeroDrain stops at the first 0x03F9B0 handoff solely because D0058B=0, even though D000C3 is still 0x06. The next Digit3 therefore sees bit 2 set at 0x02FDAE and skips CALL Z,0x05C76C. A future narrow fix should keep draining when (D000C3 & 0x04) != 0 (or equivalently require both D0058B=0 and bit 2 clear before accepting the handoff), rather than force-restoring RAM after duplication. This trace tick does not apply that intervention.`
    : candidate
      ? `The smallest owner-level intervention to test next is at the first Digit3-only transition ${candidateLabel}: preserve the clean successor/control state there long enough to reach ${hex(GATE_PC)}, rather than forcing the edit buffer or cursor after the duplicate write. This trace tick does not apply that intervention.`
    : 'No owner-level intervention is justified because no Digit3-only transition was isolated.';
  return [
    '# Phase 926: Repeated Digit3 owner trace',
    '',
    'Probe: `probe-phase926-plus-conditioned-pre-enter-owner.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase926-plus-conditioned-pre-enter-owner.mjs`',
    '',
    '## Result',
    '',
    `- PASS: **${data.pass ? 'yes' : 'no'}**.`,
    `- Digit3 intended write: ${intended ? `${hex(intended.pc)} at block ${intended.block}, buffer[2] 0x00->0x33` : 'not observed'}.`,
    `- Digit3 repeated write: ${repeated ? `${hex(repeated.pc)} at block ${repeated.block}, buffer[3] 0x00->0x31` : 'not observed'}.`,
    `- Between the two writes: ${repeated && intended ? repeated.block - intended.block : '-'} observed blocks; ${gateHits} visit(s) to ${hex(GATE_PC)}.`,
    `- First edge absent from both clean Digit1/Digit2 post-insert routes: **${candidateLabel}**.`,
    `- Clean successor(s) from the same source: ${cleanTransitions.length ? cleanTransitions.map((row) => `${row.label}: ${hex(row.from)} -> ${hex(row.to)}, D000C3=${hex(row.fromRow[23], 2)}`).join('; ') : 'none'}. Bad Digit3 D000C3=${candidate ? hex(candidate.fromRow[23], 2) : '-'}.`,
    `- Debounce-drain carryover: Digit2 reports ${digit2.end.lastKey?.postInsertFirstZeroDrain?.stopKind ?? '-'} at ${hex(digit2.end.lastKey?.postInsertFirstZeroDrain?.stopPc)} with D0058B=${hex(digit2.end.lastKey?.postInsertFirstZeroDrain?.stopD0058B, 2)}, but ends with D000C3=${hex(digit2.end.control?.[1], 2)}; Digit3 starts with D000C3=${hex(digit3.start.control?.[1], 2)}.`,
    `- First repeated edge in the bad segment: ${data.firstRepeatedEdge ? `${hex(data.firstRepeatedEdge.from)} -> ${hex(data.firstRepeatedEdge.to)} (first index ${data.firstRepeatedEdge.firstIndex}, repeated at ${data.firstRepeatedEdge.repeatIndex})` : 'none'}.`,
    `- ${intervention}`,
    '',
    '## Per-key route bounds',
    '',
    formatRecordTable(data.records),
    '',
    'Digit1 and Digit2 stop at the browser post-insert gate. Digit3 instead reaches a second edit-buffer write before any gate visit; the missing gate is therefore a route-selection failure, not a late failure inside the gate.',
    '',
    '## First Digit3-only transition evidence',
    '',
    candidate
      ? [
          `Candidate edge: ${candidateLabel} at Digit3 trace index ${candidate.index}.`,
          '',
          '```text',
          ...candidate.window.map(formatTraceRow),
          '```',
          '',
          `Static decode from ${hex(candidate.from)}:`,
          '',
          '```text',
          formatDecode(data.decode.from),
          '```',
          '',
          `Static decode from ${hex(candidate.to)}:`,
          '',
          '```text',
          formatDecode(data.decode.to),
          '```',
        ].join('\n')
      : 'No candidate edge isolated.',
    '',
    '## Digit3 write chronology',
    '',
    '| block | observed pc | changed edit byte(s) | registers/state |',
    '|---:|---|---|---|',
    ...digit3.writes.map((write) => `| ${write.block} | ${hex(write.pc)} | ${write.changes.map((change) => `[${change.index}] ${hex(change.before, 2)}->${hex(change.after, 2)}`).join(', ')} | ${formatTraceRow(write.row).replaceAll('|', '\\|')} |`),
    '',
    '## D000C2/C3/C4 write chronology',
    '',
    '| key | block | observed transition | field | change |',
    '|---|---:|---|---|---|',
    ...data.records.flatMap((record) => record.controlWrites.map((write) => `| ${record.label} | ${write.block} | ${hex(write.prevPc)} -> ${hex(write.pc)} | ${write.field} | ${hex(write.before, 2)}->${hex(write.after, 2)} |`)),
    '',
    '## Hot PCs between intended and repeated insert',
    '',
    '| pc | visits |',
    '|---|---:|',
    ...data.topPcCounts.map((row) => `| ${hex(row.pc)} | ${row.count} |`),
    '',
    '## Tail into the repeated insert',
    '',
    '```text',
    ...digit3.trace.slice(-32).map(formatTraceRow),
    '```',
    '',
    '## Bounded JSON evidence',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      lineBase: data.lineBase,
      records: data.records.map((record) => ({
        label: record.label,
        start: record.start,
        end: record.end,
        writes: record.writes,
        controlWrites: record.controlWrites,
        milestones: record.milestones,
        traceEnd: record.traceEnd,
        traceLength: record.trace.length,
      })),
      firstNovelEdge: data.firstNovelEdge,
      cleanTransitions: data.cleanTransitions,
      firstRepeatedEdge: data.firstRepeatedEdge,
      topPcCounts: data.topPcCounts,
      pageErrors: data.pageErrors,
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');
  const rom = fs.readFileSync(ROM_PATH);

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
  await waitFor(ws, '!!window.__phase926 && !!window.__coldbootReadEditLineState', 'phase926 instrumentation', 30000);
  await sleep(400);

  const control = await runScenario('123-control', CONTROL_SEQUENCE);
  const controlPageErrors = await evalExpr(ws, 'window.__phase926PageErrors', 30000);
  await cdp(ws, 'Page.navigate', { url: `${pageUrl}?scenario=2plus3` });
  await waitFor(ws, 'document.readyState === "complete"', 'plus scenario page load', 30000);
  await waitFor(ws, '!!window.__phase926 && !!window.__coldbootReadEditLineState', 'plus scenario instrumentation', 30000);
  await sleep(300);
  const plus = await runScenario('2plus3', PLUS_SEQUENCE);
  const plusPageErrors = await evalExpr(ws, 'window.__phase926PageErrors', 30000);
  const pageErrors = [...controlPageErrors, ...plusPageErrors];

  const controlDigit2 = control.records[1];
  const controlDigit3 = control.records[2];
  const plusPred = plus.records[1];
  const plusDigit3 = plus.records[2];
  const intended = plusDigit3.writes.find((write) => write.changes.some((change) => change.index === 2 && change.after === 0x33));
  const repeated = plusDigit3.writes.find((write) => write.changes.some((change) => change.index === 3 && change.after === 0x31));
  const gateHits = plusDigit3.milestones.filter((row) => row.kind === 'gate_entry').length;
  const novel = firstNovelEdge(plusDigit3, [controlDigit3]);
  const cleanTransitions = novel ? transitionsFrom([controlDigit3], novel.from) : [];
  const drainNovel = firstNovelEdge(phaseRecord(plusPred, 1), [phaseRecord(controlDigit2, 1)]);
  const drainCleanTransitions = drainNovel ? transitionsFrom([phaseRecord(controlDigit2, 1)], drainNovel.from) : [];
  const repeatedEdge = firstRepeatedEdge(plusDigit3);
  const startDiffs = {
    keyRam: windowDiffs(controlDigit3.start.keyRam, plusDigit3.start.keyRam, 0xD00580),
    flagRam: windowDiffs(controlDigit3.start.flagRam, plusDigit3.start.flagRam, 0xD00080),
  };
  const finalPlusD0009BWrite = plusPred.D0009BWrites.at(-1) ?? null;
  const pass = pageErrors.length === 0
    && control.records.every((record) => record.end.lastKey?.termination === 'post_insert_gate_stop')
    && control.records.every((record) => record.traceEnd === 'drain_end')
    && controlDigit3.end.buffer.slice(0, 4).join(',') === '49,50,51,0'
    && plus.records.slice(0, 2).every((record) => record.end.lastKey?.termination === 'post_insert_gate_stop')
    && plus.records.slice(0, 2).every((record) => record.traceEnd === 'drain_end')
    && plusDigit3.end.lastKey?.termination === 'max_steps'
    && intended?.pc === INSERT_PC
    && repeated?.pc === INSERT_PC
    && gateHits === 0
    && novel?.from === 0x0A349A
    && novel?.to === 0x08C341
    && cleanTransitions.some((row) => row.to === 0x0A349F)
    && controlDigit3.start.flagRam[0x1B] === 0x00
    && plusDigit3.start.flagRam[0x1B] === 0x60
    && finalPlusD0009BWrite?.before === 0x20
    && finalPlusD0009BWrite?.after === 0x60
    && finalPlusD0009BWrite?.prevPc === 0x000704
    && finalPlusD0009BWrite?.pc === 0x000710;

  return {
    probe: 'phase926-plus-conditioned-pre-enter-owner',
    pass,
    pageUrl,
    lineBase: plus.lineBase,
    control,
    plus,
    records: plus.records,
    firstNovelEdge: novel,
    cleanTransitions,
    firstDrainNovelEdge: drainNovel,
    drainCleanTransitions,
    startDiffs,
    finalPlusD0009BWrite,
    firstRepeatedEdge: repeatedEdge,
    topPcCounts: topPcCounts(plusDigit3),
    decode: {
      from: novel ? decodeWindow(rom, novel.from) : [],
      to: novel ? decodeWindow(rom, novel.to) : [],
    },
    pageErrors,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    lineBase: hex(summary.lineBase),
    controlRoutes: summary.control.records.map((record) => ({
      key: record.label,
      termination: record.end.lastKey?.termination,
      steps: record.end.lastKey?.steps,
      traceEnd: record.traceEnd,
      traceLength: record.trace.length,
      handoffs: record.handoffs,
    })),
    keyRoutes: summary.records.map((record) => ({
      key: record.label,
      termination: record.end.lastKey?.termination,
      steps: record.end.lastKey?.steps,
      insertBlock: record.end.lastKey?.insertBlock,
      gateBlock: record.end.lastKey?.postInsertGateBlock,
      traceEnd: record.traceEnd,
      traceLength: record.trace.length,
      writes: record.writes.map((write) => ({ pc: hex(write.pc), block: write.block, changes: write.changes })),
    })),
    firstNovelEdge: summary.firstNovelEdge && {
      index: summary.firstNovelEdge.index,
      from: hex(summary.firstNovelEdge.from),
      to: hex(summary.firstNovelEdge.to),
      fromRow: formatTraceRow(summary.firstNovelEdge.fromRow),
      toRow: formatTraceRow(summary.firstNovelEdge.toRow),
    },
    cleanTransitions: summary.cleanTransitions?.map((row) => ({
      key: row.label,
      from: hex(row.from),
      to: hex(row.to),
      fromRow: formatTraceRow(row.fromRow),
      toRow: formatTraceRow(row.toRow),
    })),
    predecessorDrains: {
      controlDigit2: {
        start: summary.control.records[1].drainStart,
        end: summary.control.records[1].drainEnd,
        handoffs: summary.control.records[1].handoffs,
        D0009BWrites: summary.control.records[1].D0009BWrites,
      },
      plus: {
        start: summary.plus.records[1].drainStart,
        end: summary.plus.records[1].drainEnd,
        handoffs: summary.plus.records[1].handoffs,
        D0009BWrites: summary.plus.records[1].D0009BWrites,
      },
    },
    firstDrainNovelEdge: summary.firstDrainNovelEdge && {
      index: summary.firstDrainNovelEdge.index,
      from: hex(summary.firstDrainNovelEdge.from),
      to: hex(summary.firstDrainNovelEdge.to),
      fromRow: formatTraceRow(summary.firstDrainNovelEdge.fromRow),
      toRow: formatTraceRow(summary.firstDrainNovelEdge.toRow),
    },
    drainCleanTransitions: summary.drainCleanTransitions?.map((row) => ({
      key: row.label,
      from: hex(row.from),
      to: hex(row.to),
      fromRow: formatTraceRow(row.fromRow),
      toRow: formatTraceRow(row.toRow),
    })),
    digit3StartDiffs: summary.startDiffs,
    firstRepeatedEdge: summary.firstRepeatedEdge && {
      from: hex(summary.firstRepeatedEdge.from),
      to: hex(summary.firstRepeatedEdge.to),
      firstIndex: summary.firstRepeatedEdge.firstIndex,
      repeatIndex: summary.firstRepeatedEdge.repeatIndex,
    },
    topPcCounts: summary.topPcCounts.map((row) => ({ pc: hex(row.pc), count: row.count })),
    decode: summary.decode,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase926-plus-conditioned-pre-enter-owner', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

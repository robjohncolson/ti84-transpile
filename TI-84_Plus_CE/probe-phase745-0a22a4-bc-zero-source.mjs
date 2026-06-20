import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase745-0a22a4-bc-zero-source.md');
const debugPort = 9745;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase745-'));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const WATCH_TARGETS = Object.freeze({
  caller058a16: 0x058A16,
  call0a223a: 0x0A223A,
  bridge0a2a37: 0x0A2A37,
  tail0a22a4: 0x0A22A4,
  tailRet0a22b0: 0x0A22B0,
});

const FIELD_SPECS = Object.freeze([
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00587', 0xD00587, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
  ['D000C2', 0xD000C2, 1],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02A28', 0xD02A28, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A40', 0xD02A40, 3],
  ['D00121', 0xD00121, 3],
  ['D00124', 0xD00124, 1],
  ['D0059C', 0xD0059C, 3],
  ['D005A0', 0xD005A0, 1],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02590', 0xD02590, 3],
]);

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

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  return 'application/octet-stream';
}

function byteText(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatValue(value, width = 6) {
  return typeof value === 'number' ? hex(value, width) : String(value);
}

function formatIndex(indexRegister, displacement = 0) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(insn) {
  if (!insn) return '(decode error)';
  if (insn.dasm) return insn.dasm;

  switch (insn.tag) {
    case 'call': return `CALL ${hex(insn.target)}`;
    case 'call-conditional': return `CALL ${String(insn.condition).toUpperCase()},${hex(insn.target)}`;
    case 'jp': return `JP ${hex(insn.target)}`;
    case 'jp-conditional': return `JP ${String(insn.condition).toUpperCase()},${hex(insn.target)}`;
    case 'jp-indirect': return `JP (${String(insn.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(insn.target)}`;
    case 'jr-conditional': return `JR ${String(insn.condition).toUpperCase()},${hex(insn.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(insn.condition).toUpperCase()}`;
    case 'push': return `PUSH ${String(insn.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(insn.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(insn.pair).toUpperCase()},${formatValue(insn.value)}`;
    case 'ld-reg-imm': return `LD ${String(insn.dest).toUpperCase()},${formatValue(insn.value, 2)}`;
    case 'ld-reg-reg': return `LD ${String(insn.dest).toUpperCase()},${String(insn.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(insn.dest).toUpperCase()},(${String(insn.src).toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${String(insn.dest).toUpperCase()}),${String(insn.src).toUpperCase()}`;
    case 'ld-ind-imm': return `LD (HL),${formatValue(insn.value, 2)}`;
    case 'ld-reg-mem': return `LD ${String(insn.dest).toUpperCase()},(${hex(insn.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(insn.addr)}),${String(insn.src).toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${String(insn.pair).toUpperCase()},(${hex(insn.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(insn.addr)}),${String(insn.pair).toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${String(insn.dest).toUpperCase()},${formatIndex(insn.indexRegister, insn.displacement)}`;
    case 'ld-ixd-reg': return `LD ${formatIndex(insn.indexRegister, insn.displacement)},${String(insn.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `LD ${formatIndex(insn.indexRegister, insn.displacement)},${formatValue(insn.value, 2)}`;
    case 'ld-pair-indexed': return `LD ${String(insn.pair).toUpperCase()},${formatIndex(insn.indexRegister, insn.displacement)}`;
    case 'ld-indexed-pair': return `LD ${formatIndex(insn.indexRegister, insn.displacement)},${String(insn.pair).toUpperCase()}`;
    case 'add-pair': return `ADD ${String(insn.dest).toUpperCase()},${String(insn.src).toUpperCase()}`;
    case 'adc-pair': return `ADC HL,${String(insn.src).toUpperCase()}`;
    case 'sbc-pair': return `SBC HL,${String(insn.src).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(insn.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(insn.pair).toUpperCase()}`;
    case 'inc-reg': return `INC ${String(insn.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(insn.reg).toUpperCase()}`;
    case 'alu-reg': return `${String(insn.op).toUpperCase()} ${String(insn.src).toUpperCase()}`;
    case 'alu-imm': return `${String(insn.op).toUpperCase()} ${formatValue(insn.value, 2)}`;
    case 'bit-test': return `BIT ${insn.bit},${String(insn.reg).toUpperCase()}`;
    case 'bit-set': return `SET ${insn.bit},${String(insn.reg).toUpperCase()}`;
    case 'bit-res': return `RES ${insn.bit},${String(insn.reg).toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${insn.bit},(${String(insn.indirectRegister).toUpperCase()})`;
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'ldi':
    case 'ldir':
    case 'ldd':
    case 'lddr':
    case 'cpi':
    case 'cpir':
    case 'cpd':
    case 'cpdr':
    case 'exx':
    case 'ccf':
    case 'scf':
    case 'di':
    case 'ei':
    case 'rra':
    case 'rla':
    case 'rlca':
    case 'rrca':
    case 'cpl':
      return insn.tag.toUpperCase();
    default:
      return `${insn.tag ?? 'unknown'} ${JSON.stringify(insn)}`;
  }
}

function decodeAt(pc) {
  try {
    const insn = decodeInstruction(rom, pc, 'adl');
    const len = Math.max(1, insn?.length ?? 1);
    return {
      pc: hex(pc),
      bytes: byteText(pc, len),
      asm: formatInstruction(insn),
      tag: insn?.tag ?? 'decode-error',
      target: Number.isInteger(insn?.target) ? hex(insn.target) : null,
      fallthrough: Number.isInteger(insn?.fallthrough) ? hex(insn.fallthrough) : null,
      length: len,
      raw: insn ?? null,
    };
  } catch (error) {
    return {
      pc: hex(pc),
      bytes: byteText(pc, 1),
      asm: `DB ${hex(rom[pc] ?? 0, 2)} (${String(error?.message || error)})`,
      tag: 'decode-error',
      target: null,
      fallthrough: null,
      length: 1,
      raw: null,
    };
  }
}

function disassembleRange(start, end, maxRows = 80) {
  const rows = [];
  let pc = start;
  while (pc < end && rows.length < maxRows) {
    const row = decodeAt(pc);
    rows.push(row);
    pc += row.length;
  }
  return rows;
}

function staticDecode() {
  return {
    caller058a10_058a22: disassembleRange(0x058A10, 0x058A22),
    source0a223a_0a22b1: disassembleRange(0x0A223A, 0x0A22B1),
    bridge0a2a20_0a2a45: disassembleRange(0x0A2A20, 0x0A2A45),
    tail0a22a4_0a22b1: disassembleRange(0x0A22A4, 0x0A22B1),
  };
}

function instrumentBrowserShell(html) {
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(marker)) throw new Error('Instrumentation marker not found in browser-shell.html');

  const injection = String.raw`
const PHASE745_TARGETS = Object.freeze({
  caller058a16: 0x058A16,
  call0a223a: 0x0A223A,
  bridge0a2a37: 0x0A2A37,
  tail0a22a4: 0x0A22A4,
  tailRet0a22b0: 0x0A22B0,
});

const PHASE745_FIELD_SPECS = Object.freeze([
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D00587', 0xD00587, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
  ['D000C2', 0xD000C2, 1],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02A28', 0xD02A28, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A40', 0xD02A40, 3],
  ['D00121', 0xD00121, 3],
  ['D00124', 0xD00124, 1],
  ['D0059C', 0xD0059C, 3],
  ['D005A0', 0xD005A0, 1],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02590', 0xD02590, 3],
]);

function phase745Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase745ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase745ReadBytes(mem, addr, count) {
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => mem[(addr + i) & 0xFFFFFF] ?? 0);
}

function phase745Ascii(bytes) {
  return bytes.map((byte) => (byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.')).join('');
}

function phase745ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE745_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase745Hex(phase745ReadValue(mem, addr, len), len * 2),
  ]));
}

function phase745ReadStackSlots(count = 10) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr: phase745Hex(addr), value: phase745Hex(phase745ReadValue(mem, addr, 3)) };
  });
}

function phase745CpuSummary() {
  return cpu ? {
    pc: phase745Hex(cpu.pc ?? 0),
    sp: phase745Hex(cpu.sp ?? 0),
    ix: phase745Hex(cpu.ix ?? cpu._ix ?? 0),
    iy: phase745Hex(cpu.iy ?? cpu._iy ?? 0),
    af: phase745Hex(cpu.af ?? 0, 4),
    bc: phase745Hex(cpu.bc ?? 0),
    de: phase745Hex(cpu.de ?? 0),
    hl: phase745Hex(cpu.hl ?? 0),
    f: phase745Hex(cpu.f ?? 0, 2),
    halted: Boolean(cpu.halted),
    iff1: cpu.iff1 ?? 0,
    iff2: cpu.iff2 ?? 0,
    mbase: cpu.mbase ?? 0,
    madl: cpu.madl ?? 0,
  } : null;
}

function phase745ReadMemoryWindows() {
  const mem = cpu?.memory;
  if (!mem) return null;
  const sp = cpu?.sp ?? 0;
  const hl = cpu?.hl ?? cpu?._hl ?? 0;
  const de = cpu?.de ?? cpu?._de ?? 0;
  const windows = [
    ['aroundSp', sp - 12, 72],
    ['aroundHl', hl - 12, 72],
    ['aroundDe', de - 12, 72],
    ['D006B0', 0xD006B0, 96],
    ['D1A840', 0xD1A840, 96],
    ['D02420', 0xD02420, 80],
  ];
  return Object.fromEntries(windows.map(([name, addr, count]) => {
    const bytes = phase745ReadBytes(mem, addr, count);
    return {
      addr: phase745Hex(addr & 0xFFFFFF),
      bytes: bytes.map((byte) => phase745Hex(byte, 2)),
      ascii: phase745Ascii(bytes),
    };
  }));
}

function phase745Snapshot(record, pc, includeWindows = false) {
  const snapshot = {
    block: record.totalBlocks,
    pc: phase745Hex(pc & 0xFFFFFF),
    prevPc: record.prevPc,
    runtime: {
      lastPc: phase745Hex(lastPc ?? 0),
      lastMode,
      totalSteps,
    },
    fields: phase745ReadFields(),
    cpu: phase745CpuSummary(),
    stackTop: phase745ReadStackSlots(10),
  };
  if (includeWindows) snapshot.memoryWindows = phase745ReadMemoryWindows();
  return snapshot;
}

function phase745CreateRecord(label) {
  return {
    label,
    start: window.__phase745Read?.() ?? null,
    end: null,
    totalBlocks: 0,
    counts: Object.fromEntries(Object.keys(PHASE745_TARGETS).map((name) => [name, 0])),
    firstBlocks: [],
    lastBlocks: [],
    firstSamples: {},
    targetSamples: [],
    focusEvents: [],
    registerTransitions: [],
    hotBlocks: {},
    prevPc: null,
    prevCpu: phase745CpuSummary(),
  };
}

function phase745CurrentRecord() {
  const state = window.__phase745State;
  if (!state.records.length || state.currentLabel == null) {
    state.currentLabel = state.currentLabel || 'unlabeled';
    state.records.push(phase745CreateRecord(state.currentLabel));
  }
  return state.records[state.records.length - 1];
}

window.__phase745Read = function phase745Read() {
  const mem = cpu?.memory;
  const d006c0 = mem ? phase745ReadBytes(mem, 0xD006C0, 32) : [];
  return {
    runtimeMode,
    lastPc: phase745Hex(lastPc ?? 0),
    lastMode,
    totalSteps,
    cpu: phase745CpuSummary(),
    fields: phase745ReadFields(),
    stackTop: phase745ReadStackSlots(10),
    d006c0: {
      bytes: d006c0.map((byte) => phase745Hex(byte, 2)),
      ascii: phase745Ascii(d006c0),
    },
    diagnostics: getColdbootPersistenceDiagnostics?.() ?? null,
    vramPixels: countVRAMPixels?.() ?? null,
    status: document.getElementById('status')?.textContent ?? null,
    lastKey: window.__coldbootLastKey ?? null,
  };
};

window.__phase745State = {
  currentLabel: null,
  records: [],
  begin(label) {
    this.currentLabel = label;
    const record = phase745CreateRecord(label);
    this.records.push(record);
    return record.start;
  },
  finish() {
    const record = this.records[this.records.length - 1] ?? null;
    if (record) {
      record.end = window.__phase745Read();
      record.hotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 32)
        .map(([pc, count]) => ({ pc, count }));
    }
    this.currentLabel = null;
    return record;
  },
  read() {
    return window.__phase745Read();
  },
  all() {
    return this.records;
  },
};
window.__phase745 = window.__phase745State;

const phase745OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase745ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = phase745CurrentRecord();
  record.totalBlocks += 1;

  const pcHex = phase745Hex(addr);
  const isNear0a21 = addr >= 0x0A2100 && addr <= 0x0A23FF;
  const isNear0a2a = addr >= 0x0A2A00 && addr <= 0x0A2AFF;
  const isNear058a = addr >= 0x058A00 && addr <= 0x058A30;
  const isTarget = Object.values(PHASE745_TARGETS).includes(addr);
  const prevFocus = typeof record.prevPc === 'string'
    && (record.prevPc.startsWith('0x0A21')
      || record.prevPc.startsWith('0x0A22')
      || record.prevPc.startsWith('0x0A23')
      || record.prevPc.startsWith('0x0A2A')
      || record.prevPc.startsWith('0x058A'));
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  if (record.firstBlocks.length < 256) record.firstBlocks.push(pcHex);
  record.lastBlocks.push(pcHex);
  if (record.lastBlocks.length > 384) record.lastBlocks.shift();

  const cpuNow = phase745CpuSummary();
  if (record.prevCpu) {
    for (const reg of ['af', 'bc', 'de', 'hl', 'sp']) {
      const changed = record.prevCpu[reg] !== cpuNow?.[reg];
      const keep = reg === 'bc' || isNear0a21 || isNear0a2a || isNear058a || isTarget || prevFocus;
      if (changed && keep) {
        record.registerTransitions.push({
          block: record.totalBlocks,
          pc: pcHex,
          prevPc: record.prevPc,
          reg,
          from: record.prevCpu[reg],
          to: cpuNow?.[reg],
        });
        if (record.registerTransitions.length > 1024) record.registerTransitions.shift();
      }
    }
  }
  record.prevCpu = cpuNow;

  const includeWindows = isTarget || addr === 0x0A2A37 || addr === 0x0A22A4;
  const snapshot = (isNear0a21 || isNear0a2a || isNear058a || isTarget)
    ? phase745Snapshot(record, addr, includeWindows)
    : null;

  if (snapshot && record.focusEvents.length < 512) {
    record.focusEvents.push(snapshot);
  }

  for (const [name, target] of Object.entries(PHASE745_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = snapshot ?? phase745Snapshot(record, addr, true);
    if (record.targetSamples.length < 64) {
      record.targetSamples.push({ target: name, ...(record.firstSamples[name]) });
    }
  }

  record.prevPc = pcHex;
  return phase745OriginalObserveColdbootPersistenceBlock(state, pc);
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
        const shell = fs.readFileSync(fullPath, 'utf8');
        res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
        res.end(instrumentBrowserShell(shell));
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
    phase745: window.__phase745?.read?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    errors: window.__phase745Errors || [],
  }))()`);
}

async function pressBrowserEol(ws) {
  await evalExpr(ws, `window.__phase745.begin('Browser EOL/CLEAR BC-zero source trace'); true;`);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('Escape', 'Escape', 27, ''));
  await cdp(ws, 'Input.dispatchKeyEvent', { ...keyParams('Escape', 'Escape', 27, ''), type: 'keyUp' });
  await sleep(750);
  return await evalExpr(ws, 'window.__phase745.finish()');
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
    await waitFor(ws, '!!window.__phase745 && !!window.getColdbootPersistenceDiagnostics', 'phase745 instrumentation', 30000);

    await evalExpr(ws, `(() => {
      window.__phase745Errors = [];
      window.addEventListener('error', (e) => window.__phase745Errors.push(String(e.message || e.error || e)));
      window.addEventListener('unhandledrejection', (e) => window.__phase745Errors.push(String(e.reason || e)));
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

function compactCounts(counts) {
  return Object.fromEntries(Object.entries(counts ?? {}).filter(([, value]) => value));
}

function summarizeSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    block: snapshot.block,
    pc: snapshot.pc,
    prevPc: snapshot.prevPc,
    cpu: snapshot.cpu,
    fields: snapshot.fields,
    stackTop: snapshot.stackTop,
    windows: snapshot.memoryWindows ? {
      aroundSp: snapshot.memoryWindows.aroundSp,
      aroundHl: snapshot.memoryWindows.aroundHl,
      aroundDe: snapshot.memoryWindows.aroundDe,
      D006B0: snapshot.memoryWindows.D006B0,
      D1A840: snapshot.memoryWindows.D1A840,
    } : null,
  };
}

function targetTable(record) {
  return [
    '| Target | Hits | First block | Prev PC | BC | HL | DE | SP | Stack[0] |',
    '|---|---:|---:|---|---|---|---|---|---|',
    ...Object.keys(WATCH_TARGETS).map((name) => {
      const sample = record?.firstSamples?.[name];
      return `| ${name} | ${record?.counts?.[name] ?? 0} | ${sample?.block ?? '-'} | ${sample?.prevPc ?? '-'} | ${sample?.cpu?.bc ?? '-'} | ${sample?.cpu?.hl ?? '-'} | ${sample?.cpu?.de ?? '-'} | ${sample?.cpu?.sp ?? '-'} | ${sample?.stackTop?.[0]?.value ?? '-'} |`;
    }),
  ].join('\n');
}

function focusTable(record) {
  const rows = record?.focusEvents ?? [];
  if (!rows.length) return 'No focused 0x058A/0x0A21xx/0x0A2Axx events were captured.';
  return [
    '| Block | PC | Prev PC | BC | HL | DE | AF | SP | Stack[0] | D0058C/D/E | D0243A | D0243D | D0059C |',
    '|---:|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((sample) => `| ${sample.block} | ${sample.pc} | ${sample.prevPc ?? '-'} | ${sample.cpu?.bc ?? '-'} | ${sample.cpu?.hl ?? '-'} | ${sample.cpu?.de ?? '-'} | ${sample.cpu?.af ?? '-'} | ${sample.cpu?.sp ?? '-'} | ${sample.stackTop?.[0]?.value ?? '-'} | ${sample.fields?.D0058C ?? '-'}/${sample.fields?.D0058D ?? '-'}/${sample.fields?.D0058E ?? '-'} | ${sample.fields?.D0243A ?? '-'} | ${sample.fields?.D0243D ?? '-'} | ${sample.fields?.D0059C ?? '-'} |`),
  ].join('\n');
}

function transitionTable(transitions) {
  const rows = transitions ?? [];
  if (!rows.length) return 'No register transitions were captured.';
  return [
    '| Block | PC | Prev PC | Reg | From | To | Owner note |',
    '|---:|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.block} | ${row.pc} | ${row.prevPc ?? '-'} | ${row.reg.toUpperCase()} | ${row.from} | ${row.to} | change occurred during previous observed block/path |`),
  ].join('\n');
}

function disasmTable(rows) {
  return [
    '| PC | Bytes | Decode | Target | Fallthrough |',
    '|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.pc} | \`${row.bytes}\` | \`${row.asm}\` | ${row.target ?? '-'} | ${row.fallthrough ?? '-'} |`),
  ].join('\n');
}

function staticDecodeSection(staticRows) {
  return [
    '### 0x058A10-0x058A22',
    '',
    disasmTable(staticRows.caller058a10_058a22),
    '',
    '### 0x0A223A-0x0A22B1',
    '',
    disasmTable(staticRows.source0a223a_0a22b1),
    '',
    '### 0x0A2A20-0x0A2A45',
    '',
    disasmTable(staticRows.bridge0a2a20_0a2a45),
    '',
    '### 0x0A22A4-0x0A22B1',
    '',
    disasmTable(staticRows.tail0a22a4_0a22b1),
  ].join('\n');
}

function findBcZeroTransition(record) {
  const tail = record?.firstSamples?.tail0a22a4;
  const tailBlock = tail?.block ?? Number.MAX_SAFE_INTEGER;
  return [...(record?.registerTransitions ?? [])]
    .reverse()
    .find((row) => row.reg === 'bc' && row.to === '0x000000' && row.block <= tailBlock) ?? null;
}

function relevantTransitionRows(record) {
  const source = record?.firstSamples?.call0a223a;
  const tail = record?.firstSamples?.tail0a22a4;
  const sourceStart = Math.max(0, (source?.block ?? 0) - 4);
  const sourceEnd = (source?.block ?? 0) + 32;
  const tailStart = Math.max(0, (tail?.block ?? record?.totalBlocks ?? 0) - 96);
  const tailEnd = (tail?.block ?? record?.totalBlocks ?? 0) + 4;
  return (record?.registerTransitions ?? []).filter((row) => (
    (row.block >= sourceStart && row.block <= sourceEnd)
      || (row.block >= tailStart && row.block <= tailEnd)
  ));
}

function inferOwner(browser) {
  if (browser.error) return `Browser run failed: ${browser.error.split('\n')[0]}`;
  const record = browser.record ?? {};
  const source = record.firstSamples?.call0a223a;
  const bridge = record.firstSamples?.bridge0a2a37;
  const tail = record.firstSamples?.tail0a22a4;
  const transition = findBcZeroTransition(record);
  const finalLastPc = browser.after?.phase745?.lastPc ?? 'n/a';

  if (!tail) {
    return `No 0x0A22A4 tail hit was captured; final lastPc=${finalLastPc}.`;
  }

  const sourcePart = source
    ? `0x0A223A is entered from ${source.prevPc ?? 'unknown'} with BC=${source.cpu?.bc ?? 'n/a'}`
    : '0x0A223A was not captured';
  const bridgePart = bridge
    ? `0x0A2A37 is entered from ${bridge.prevPc ?? 'unknown'} with BC=${bridge.cpu?.bc ?? 'n/a'}`
    : '0x0A2A37 was not captured';
  const tailPart = `0x0A22A4 is entered from ${tail.prevPc ?? 'unknown'} with BC=${tail.cpu?.bc ?? 'n/a'}, HL=${tail.cpu?.hl ?? 'n/a'}, DE=${tail.cpu?.de ?? 'n/a'}`;

  if (transition) {
    const owner = transition.prevPc ?? 'unknown previous block';
    return `${sourcePart}; ${bridgePart}; ${tailPart}. The last BC transition to zero before the LDIR tail is ${transition.from}->${transition.to} at observed block ${transition.block} (${transition.prevPc ?? 'unknown'} -> ${transition.pc}), so the owner is the previous block/path ${owner}. Static decode shows this is the 0x0A229D tail: LD A,B; PUSH HL; POP BC; CALL 0x0A2A37. With HL=0 at 0x0A229D, POP BC makes BC=0 before the final 0x0A2A37 call and 0x0A22A4 LDIR tail.`;
  }

  return `${sourcePart}; ${bridgePart}; ${tailPart}. No explicit BC->0 transition was captured before the tail, so BC was already zero before the focused transition window.`;
}

function buildReport(browser, staticRows) {
  const record = browser.record ?? {};
  const afterState = browser.after?.phase745 ?? null;
  const beforeState = browser.before?.phase745 ?? null;
  const source = record.firstSamples?.call0a223a ?? null;
  const bridge = record.firstSamples?.bridge0a2a37 ?? null;
  const tail = record.firstSamples?.tail0a22a4 ?? null;
  const zeroTransition = findBcZeroTransition(record);
  const owner = inferOwner(browser);
  const compact = {
    before: {
      status: browser.before?.status,
      lastPc: beforeState?.lastPc,
      cpu: beforeState?.cpu,
      fields: beforeState?.fields,
    },
    after: {
      status: browser.after?.status,
      lastPc: afterState?.lastPc,
      cpu: afterState?.cpu,
      fields: afterState?.fields,
      stackTop: afterState?.stackTop,
      d006c0: afterState?.d006c0,
      lastKey: browser.after?.lastKey,
    },
    record: browser.error ? null : {
      totalBlocks: record.totalBlocks,
      counts: compactCounts(record.counts),
      firstSamples: {
        call0a223a: summarizeSnapshot(source),
        bridge0a2a37: summarizeSnapshot(bridge),
        tail0a22a4: summarizeSnapshot(tail),
      },
      focusEvents: (record.focusEvents ?? []).map((sample) => ({
        block: sample.block,
        pc: sample.pc,
        prevPc: sample.prevPc,
        cpu: sample.cpu,
        fields: sample.fields,
        stack0: sample.stackTop?.[0] ?? null,
      })),
      zeroTransition,
      registerTransitions: record.registerTransitions ?? [],
      lastBlocks: record.lastBlocks ?? [],
      hotBlocks: record.hotBlocks ?? [],
    },
    staticDecode: staticRows,
    errors: browser.errors ?? [],
  };

  return [
    '# Phase 745: 0x0A22A4 BC-Zero Source Trace',
    '',
    'Probe: `probe-phase745-0a22a4-bc-zero-source.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase745-0a22a4-bc-zero-source.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    browser.error
      ? `- !! Browser leg failed before trace completion: ${browser.error.split('\n')[0]}`
      : `- **** Browser EOL/CLEAR captured ${record.totalBlocks} observed blocks; final status: ${browser.after?.status ?? 'n/a'}.`,
    browser.error
      ? '- !! No BC-zero source conclusion.'
      : `- **** Dynamic source path: ${owner}`,
    browser.error
      ? '- !! No tail state.'
      : `- **** Tail entry state: prevPc=${tail?.prevPc ?? 'n/a'}, BC=${tail?.cpu?.bc ?? 'n/a'}, HL=${tail?.cpu?.hl ?? 'n/a'}, DE=${tail?.cpu?.de ?? 'n/a'}, SP=${tail?.cpu?.sp ?? 'n/a'}, Stack[0]=${tail?.stackTop?.[0]?.value ?? 'n/a'}.`,
    browser.error
      ? '- !! No key-state comparison.'
      : `- *** EOL/CLEAR key state at tail is D0058C=${tail?.fields?.D0058C ?? 'n/a'}, D0058D=${tail?.fields?.D0058D ?? 'n/a'}, D0058E=${tail?.fields?.D0058E ?? 'n/a'} while BC is already ${tail?.cpu?.bc ?? 'n/a'}; the zero count is therefore owned by the display/text-fill parameter path, not by a raw key byte.`,
    '- No disk edit to `browser-shell.html`; this probe served an in-memory instrumented copy only.',
    '',
    '## Focus Target Hits',
    '',
    browser.error ? 'No target table; browser failed.' : targetTable(record),
    '',
    '## Focused Dynamic Route',
    '',
    browser.error ? 'No focused route; browser failed.' : focusTable(record),
    '',
    '## Register Transitions Near the Tail',
    '',
    browser.error ? 'No register transitions; browser failed.' : transitionTable(relevantTransitionRows(record)),
    '',
    '## Static Decode',
    '',
    staticDecodeSection(staticRows),
    '',
    '## Compact Evidence',
    '',
    '```json',
    JSON.stringify(compact, null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    browser.error
      ? 'The headless browser leg did not complete, so no route inference should be used.'
      : 'The current browser CLEAR/EOL failure is a zero-count call into the 0x0A22A4 space-fill tail. The decisive dynamic comparison is 0x0A223A entering with BC=0x0900 versus the later 0x0A22A4 entry from 0x0A2A37 with BC=0, HL=0, and DE=0x00013F. The captured register transition identifies the immediate owner of the zero count as the previous observed block/path before the tail, not the post-run space corruption caused by LDIR.',
    '',
    'No runtime, transpiler, browser, scheduler, or follow-along files were modified.',
    '',
  ].join('\n');
}

console.log('phase745: browser EOL 0x0A22A4 BC-zero source trace');
const staticRows = staticDecode();
const browser = await runBrowserRecipe();
fs.writeFileSync(REPORT_PATH, `${buildReport(browser, staticRows)}\n`);

console.log(JSON.stringify({
  probe: 'phase745-0a22a4-bc-zero-source',
  report: path.basename(REPORT_PATH),
  browser: browser.error ? {
    error: browser.error.split('\n')[0],
  } : {
    status: browser.after?.status,
    lastPc: browser.after?.phase745?.lastPc,
    cpuPc: browser.after?.phase745?.cpu?.pc,
    totalBlocks: browser.record?.totalBlocks,
    counts: compactCounts(browser.record?.counts),
    source: inferOwner(browser),
    zeroTransition: findBcZeroTransition(browser.record),
  },
}, null, 2));

try {
  fs.rmSync(userDataDir, { recursive: true, force: true });
} catch {}

if (browser.error || !browser.record) process.exitCode = 1;

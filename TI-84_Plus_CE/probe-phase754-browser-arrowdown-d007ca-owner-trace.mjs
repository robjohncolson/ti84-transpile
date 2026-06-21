import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase754-browser-arrowdown-d007ca-owner-trace.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const debugPort = 9754;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase754-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const ARROWDOWN_FALLBACK_STEP_CAP = 190000;
const ARROWDOWN_TRACE_STOP_PC = 0x001879;
const ARROWDOWN_TRACE_STOP_LABEL = 'arrow-down-prewipe-trace-stop';

let nextId = 1;
const pending = new Map();
const pageErrors = [];
let chrome;
let server;
let ws;
let summary = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value, width = 6) => `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

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
    case 'jp': return `JP ${hex(insn.target)}`;
    case 'jp-cond': return `JP ${String(insn.cond).toUpperCase()},${hex(insn.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jr': return `JR ${hex(insn.target)}`;
    case 'jr-cond': return `JR ${String(insn.cond).toUpperCase()},${hex(insn.target)}`;
    case 'ret': return 'RET';
    case 'ret-cond': return `RET ${String(insn.cond).toUpperCase()}`;
    case 'rst': return `RST ${formatValue(insn.vector, 2)}`;
    case 'ld-pair-imm': return `LD ${String(insn.pair).toUpperCase()},${formatValue(insn.value)}`;
    case 'ld-reg-imm': return `LD ${String(insn.dest).toUpperCase()},${formatValue(insn.value, 2)}`;
    case 'ld-reg-reg': return `LD ${String(insn.dest).toUpperCase()},${String(insn.src).toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${String(insn.dest).toUpperCase()},(${hex(insn.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(insn.addr)}),${String(insn.src).toUpperCase()}`;
    case 'ld-mem-pair': return `LD (${hex(insn.addr)}),${String(insn.src).toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${String(insn.dest).toUpperCase()},(${hex(insn.addr)})`;
    case 'ld-ind-imm': return `LD (HL),${formatValue(insn.value, 2)}`;
    case 'indexed-cb-bit': return `BIT ${insn.bit},${formatIndex(insn.indexRegister, insn.displacement)}`;
    case 'indexed-cb-set': return `SET ${insn.bit},${formatIndex(insn.indexRegister, insn.displacement)}`;
    case 'indexed-cb-res': return `RES ${insn.bit},${formatIndex(insn.indexRegister, insn.displacement)}`;
    case 'alu-reg': return `${String(insn.op).toUpperCase()} ${String(insn.src).toUpperCase()}`;
    case 'alu-imm': return `${String(insn.op).toUpperCase()} ${formatValue(insn.value, 2)}`;
    case 'inc-pair': return `INC ${String(insn.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(insn.pair).toUpperCase()}`;
    case 'inc-reg': return `INC ${String(insn.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(insn.reg).toUpperCase()}`;
    case 'push': return `PUSH ${String(insn.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(insn.pair).toUpperCase()}`;
    case 'ex-de-hl': return 'EX DE,HL';
    case 'or-a': return 'OR A,A';
    case 'ccf': return 'CCF';
    case 'ldir': return 'LDIR';
    default: return `${insn.tag ?? 'unknown'} ${JSON.stringify(insn)}`;
  }
}

function decodeWindow(rom, start, instructionCount = 24) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < instructionCount && pc < rom.length; i += 1) {
    try {
      const insn = decodeInstruction(rom, pc, 'adl');
      const length = Math.max(1, insn?.length ?? 1);
      rows.push({
        pc,
        bytes: Array.from(rom.slice(pc, pc + length)).map((b) => hex(b, 2)).join(' '),
        asm: formatInstruction(insn),
        tag: insn?.tag ?? 'decode-error',
        target: Number.isInteger(insn?.target) ? insn.target : null,
        fallthrough: Number.isInteger(insn?.fallthrough) ? insn.fallthrough : null,
      });
      pc += length;
      if (['ret', 'jp', 'jp-hl', 'rst'].includes(insn?.tag)) break;
    } catch (error) {
      rows.push({
        pc,
        bytes: hex(rom[pc] ?? 0, 2),
        asm: `DB ${hex(rom[pc] ?? 0, 2)} (${String(error?.message || error)})`,
        tag: 'decode-error',
        target: null,
        fallthrough: null,
      });
      pc += 1;
    }
  }
  return rows;
}

function buildStaticDecode() {
  const rom = fs.readFileSync(ROM_PATH);
  const windows = [
    { label: 'reroute owner candidate 0x08C782', start: 0x08C782, instructionCount: 20 },
    { label: 'reroute entry 0x06C764', start: 0x06C764, instructionCount: 24 },
    { label: 'alternate cxMain target 0x06C92C', start: 0x06C92C, instructionCount: 24 },
    { label: 'cxMain dispatch wrapper 0x08C72F', start: 0x08C72F, instructionCount: 18 },
  ];
  return windows.map((window) => ({
    ...window,
    rows: decodeWindow(rom, window.start, window.instructionCount),
  }));
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
const phase754_ARROW_DOWN_STOP = Object.freeze({
  pc: ${ARROWDOWN_TRACE_STOP_PC},
  label: '${ARROWDOWN_TRACE_STOP_LABEL}',
});

const phase754_TARGETS = Object.freeze({
  reroutePrev08c782: 0x08C782,
  rerouteEntry06c764: 0x06C764,
  alternateCxMain06c92c: 0x06C92C,
  cxDispatchWrapper08c72f: 0x08C72F,
  cxJpTrampoline08c745: 0x08C745,
  cleanup001879: 0x001879,
  cleanupTail0018f8: 0x0018F8,
  sentinel001c33: 0x001C33,
  sentinel0158bc: 0x0158BC,
  postInsertGate0158de: 0x0158DE,
  low000b7c: 0x000B7C,
  coldIdle0019b5: 0x0019B5,
});

const phase754_FIELD_SPECS = Object.freeze([
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

const phase754_CRITICAL_FIELDS = Object.freeze(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590']);

function phase754Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function phase754ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function phase754ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(phase754_FIELD_SPECS.map(([name, addr, len]) => [
    name,
    phase754ReadValue(mem, addr, len),
  ]));
}

function phase754ReadStackSlots(count = 6) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr, value: phase754ReadValue(mem, addr, 3) };
  });
}

function phase754CpuRaw() {
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

function phase754Has202020(fields, stackTop = []) {
  return Object.values(fields ?? {}).some((value) => value === 0x202020)
    || stackTop.some((slot) => slot.value === 0x202020);
}

function phase754HasCriticalZero(fields) {
  return phase754_CRITICAL_FIELDS.some((name) => fields?.[name] === 0);
}

function phase754DiffFields(before, after) {
  const diff = {};
  for (const name of Object.keys(after ?? {})) {
    if ((before?.[name] ?? null) !== after[name]) diff[name] = { before: before?.[name] ?? null, after: after[name] };
  }
  return diff;
}

function phase754Snapshot(record, pc, fields = null) {
  return {
    block: record?.totalBlocks ?? 0,
    pc: pc & 0xFFFFFF,
    prevPc: record?.prevPcRaw ?? null,
    cpu: phase754CpuRaw(),
    fields: fields ?? phase754ReadFields(),
    stackTop: phase754ReadStackSlots(6),
    vram: countVRAMPixels?.() ?? null,
  };
}

function phase754CreateRecord(label) {
  return {
    label,
    totalBlocks: 0,
    prevPcRaw: null,
    prevPc: null,
    firstBlocks: [],
    lastBlocks: [],
    counts: Object.fromEntries(Object.keys(phase754_TARGETS).map((name) => [name, 0])),
    firstSamples: {},
    fieldTransitions: [],
    firstCriticalZero: null,
    first202020: null,
    lastFields: null,
  };
}

function phase754Read(label = 'read') {
  const fields = phase754ReadFields();
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase754CpuRaw(),
    fields,
    stackTop: phase754ReadStackSlots(6),
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    persistence: getColdbootPersistenceDiagnostics?.() ?? null,
    vram: countVRAMPixels?.() ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase754PageErrors ?? [])],
  };
}

window.__phase754PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase754PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase754PageErrors.push(String(event.reason || event));
});

window.__phase754State = {
  records: [],
  begin(label) {
    const record = phase754CreateRecord(label);
    this.records.push(record);
    const start = phase754Read('start');
    record.start = start;
    record.lastFields = start.fields;
    return start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase754Read('end');
      if (!record.firstCriticalZero && phase754HasCriticalZero(record.end.fields)) {
        record.firstCriticalZero = { source: 'final-state-only', snapshot: record.end };
      }
      if (!record.first202020 && phase754Has202020(record.end.fields, record.end.stackTop)) {
        record.first202020 = { source: 'final-state-only', snapshot: record.end };
      }
    }
    return record;
  },
  read: phase754Read,
};
window.__phase754 = window.__phase754State;

const phase754OriginalGetColdbootControlPreStop = getColdbootControlPreStop;
getColdbootControlPreStop = function phase754GetColdbootControlPreStop(code) {
  if (code === 'ArrowDown') return phase754_ARROW_DOWN_STOP;
  return phase754OriginalGetColdbootControlPreStop(code);
};

const phase754OriginalObserveColdbootPersistenceBlock = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase754ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  let record = window.__phase754State.records.at(-1);
  if (!record) {
    record = phase754CreateRecord('implicit');
    window.__phase754State.records.push(record);
  }

  record.totalBlocks += 1;
  if (record.firstBlocks.length < 64) record.firstBlocks.push(phase754Hex(addr));
  record.lastBlocks.push(phase754Hex(addr));
  if (record.lastBlocks.length > 128) record.lastBlocks.shift();

  const fieldsBefore = phase754ReadFields();
  const entryDiff = phase754DiffFields(record.lastFields, fieldsBefore);
  if (Object.keys(entryDiff).length && record.fieldTransitions.length < 64) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: phase754Hex(addr),
      prevPc: record.prevPc,
      timing: 'entry-vs-previous-block',
      diff: entryDiff,
    });
  }
  if (!record.firstCriticalZero && phase754HasCriticalZero(fieldsBefore)) {
    record.firstCriticalZero = { source: 'observed-before-block', snapshot: phase754Snapshot(record, addr, fieldsBefore) };
  }
  if (!record.first202020 && phase754Has202020(fieldsBefore, phase754ReadStackSlots(6))) {
    record.first202020 = { source: 'observed-before-block', snapshot: phase754Snapshot(record, addr, fieldsBefore) };
  }

  for (const [name, target] of Object.entries(phase754_TARGETS)) {
    if (addr !== target) continue;
    record.counts[name] += 1;
    if (!record.firstSamples[name]) record.firstSamples[name] = phase754Snapshot(record, addr, fieldsBefore);
  }

  const result = phase754OriginalObserveColdbootPersistenceBlock(state, pc);
  const fieldsAfter = phase754ReadFields();
  const hookDiff = phase754DiffFields(fieldsBefore, fieldsAfter);
  if (Object.keys(hookDiff).length && record.fieldTransitions.length < 64) {
    record.fieldTransitions.push({
      block: record.totalBlocks,
      pc: phase754Hex(addr),
      prevPc: record.prevPc,
      timing: 'after-persistence-hook',
      diff: hookDiff,
    });
  }

  record.lastFields = fieldsAfter;
  record.prevPcRaw = addr;
  record.prevPc = phase754Hex(addr);
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
  await waitFor(ws, '!!window.__phase754 && !!window.getColdbootPersistenceDiagnostics', 'phase754 instrumentation', 30000);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  const before = await evalExpr(ws, `window.__phase754.begin('ArrowDown D007CA reroute owner trace')`);

  await cdp(ws, 'Input.dispatchKeyEvent', arrowDownKeyParams('keyDown'), 175000);
  await cdp(ws, 'Input.dispatchKeyEvent', arrowDownKeyParams('keyUp'), 20000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'ArrowDown'`, 'ArrowDown key completion', 30000);
  await sleep(250);

  const record = await evalExpr(ws, 'window.__phase754.finish()', 30000);
  const after = await evalExpr(ws, 'window.__phase754.read("after-finish")', 30000);
  const key = after.lastKey;
  const d007caTransitions = (record?.fieldTransitions ?? [])
    .filter((transition) => Object.hasOwn(transition.diff ?? {}, 'D007CA'));
  const rerouteTransition = d007caTransitions.find((transition) => {
    const diff = transition.diff?.D007CA;
    return transition.pc === '0x06C764'
      && transition.prevPc === '0x08C782'
      && diff?.before === 0x0585E9
      && diff?.after === 0x06C92C;
  }) ?? null;
  const rerouteCaptured = Boolean(
    rerouteTransition
    && record?.counts?.reroutePrev08c782 === 1
    && record?.counts?.rerouteEntry06c764 === 1
    && record?.counts?.cleanup001879 === 1
    && record?.counts?.cleanupTail0018f8 === 0
    && !record?.firstCriticalZero
    && !hasCriticalZero(after)
    && !hasCorrupt202020(after)
    && pageErrors.length === 0
    && (after.pageErrors?.length ?? 0) === 0
  );

  return {
    probe: 'phase754-browser-arrowdown-d007ca-owner-trace',
    chromePath,
    pageUrl,
    traceStop: { code: 'ArrowDown', pc: ARROWDOWN_TRACE_STOP_PC, label: ARROWDOWN_TRACE_STOP_LABEL },
    traceStepCap: ARROWDOWN_FALLBACK_STEP_CAP,
    completed: true,
    rerouteCaptured,
    rerouteTransition,
    d007caTransitions,
    staticDecode: buildStaticDecode(),
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

function staticDecodeTable(staticDecode) {
  const windows = staticDecode ?? [];
  if (!windows.length) return '_No static decode captured._';
  return windows.map((window) => [
    `### ${window.label}`,
    '',
    '| PC | Bytes | Instruction | Target | Fallthrough |',
    '|---|---|---|---|---|',
    ...window.rows.map((row) => `| ${hex(row.pc)} | \`${row.bytes}\` | \`${String(row.asm).replaceAll('|', '\\|')}\` | ${row.target == null ? '-' : hex(row.target)} | ${row.fallthrough == null ? '-' : hex(row.fallthrough)} |`),
  ].join('\n')).join('\n\n');
}

function buildReport(data) {
  const key = data?.after?.lastKey;
  const diag = data?.after?.diagnostics;
  const record = data?.record;
  const reroute = data?.rerouteTransition;
  const compact = data?.error ? { error: data.error } : {
    completed: data.completed,
    rerouteCaptured: data.rerouteCaptured,
    rerouteTransition: data.rerouteTransition,
    d007caTransitions: data.d007caTransitions,
    traceStop: data.traceStop,
    traceStepCap: data.traceStepCap,
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
    staticDecode: data.staticDecode,
    firstBlocks: record?.firstBlocks ?? [],
    lastBlocks: record?.lastBlocks ?? [],
    pageErrors: data.pageErrors ?? [],
  };

  return [
    '# Phase 754 Browser ArrowDown D007CA Owner Trace',
    '',
    'Probe: `probe-phase754-browser-arrowdown-d007ca-owner-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase754-browser-arrowdown-d007ca-owner-trace.mjs`',
    '',
    'Serves an in-memory instrumented `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowDown`, records the earlier `D007CA` reroute around `0x08C782 -> 0x06C764`, and stops later at `0x001879` only to keep the trace bounded before the known `0x0018F8` zero-wipe.',
    '',
    'The disk `browser-shell.html` is not patched by this probe.',
    '',
    '## Result',
    '',
    data?.error ? `- Overall: **FAIL** (${data.error.split('\n')[0]})` : '- Overall: **COMPLETE**',
    data?.error ? '' : `- Reroute captured: ${data.rerouteCaptured ? '**YES**' : '**NO**'}; first ` + '`D007CA`' + ` transition is block ${reroute?.block ?? '-'} at pc=${reroute?.pc ?? '-'} after prev=${reroute?.prevPc ?? '-'}.`,
    data?.error ? '' : `- Transition: D007CA ${fmtValue(reroute?.diff?.D007CA?.before)} -> ${fmtValue(reroute?.diff?.D007CA?.after)}. Static decode names \`0x08C782\` as the direct writer: it executes \`LD DE,0xD007CA; LD BC,0x15; LDIR\`; the dynamic sample enters it with HL=${fmtValue(record?.firstSamples?.reroutePrev08c782?.cpu?.hl)}, so it copies a 21-byte context-vector record into \`D007CA..\`, selecting first vector \`0x06C92C\`.`,
    data?.error ? '' : `- ArrowDown trace stop: pc=${fmtValue(key?.controlStopPc)}, termination=${key?.termination ?? '-'}, label=${key?.controlPreStopLabel ?? '-'}, steps=${key?.steps ?? '-'}, uiClear=${key?.uiClearApplied ?? '-'}.`,
    data?.error ? '' : `- State: D007CA=${fmtValue(diag?.D007CA)}, D008E0=${fmtValue(diag?.D008E0)}, D02590=${fmtValue(diag?.D02590)}, cursor=${fmtValue(diag?.D0243A)}, VRAM=${data.after?.vram}.`,
    data?.error ? '' : `- Target hits: 0x08C782=${record?.counts?.reroutePrev08c782 ?? 0}, 0x06C764=${record?.counts?.rerouteEntry06c764 ?? 0}, 0x06C92C=${record?.counts?.alternateCxMain06c92c ?? 0}, 0x001879=${record?.counts?.cleanup001879 ?? 0}, 0x0018F8=${record?.counts?.cleanupTail0018f8 ?? 0}.`,
    data?.error ? '' : `- Corruption signals: firstCriticalZero=${record?.firstCriticalZero?.source ?? 'none'}, first202020=${record?.first202020?.source ?? 'none'}, pageErrors=${(data.pageErrors ?? []).length + (data.after?.pageErrors?.length ?? 0)}.`,
    data?.error ? '' : `- Interpretation: the alternate \`D007CA=0x06C92C\` route is an intentional OS context-vector copy performed by \`0x08C782\`, and the copied handler is later dispatched once via \`0x08C745\`. \`0x001879\` remains a useful guard against \`0x0018F8\`, but phase754 does not justify a disk patch because the route owner must be handled or restored first.`,
    '',
    '## Target Hits',
    '',
    data?.error ? '_No target table._' : targetTable(record),
    '',
    '## Field Transitions',
    '',
    data?.error ? '_No transition table._' : transitionTable(record),
    '',
    '## Static Decode',
    '',
    data?.error ? '_No static decode._' : staticDecodeTable(data.staticDecode),
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
    rerouteCaptured: summary.rerouteCaptured,
    rerouteTransition: summary.rerouteTransition,
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
    probe: 'phase754-browser-arrowdown-d007ca-owner-trace',
    completed: false,
    rerouteCaptured: false,
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

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase927-d0009b-conditioned-handoff-ab.md');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const DEBUG_PORT = 9927;
const GATE_PC = 0x0158DE;
const INSERT_PC = 0x05E372;
const HANDOFF_PC = 0x03F9B0;
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
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase927-'));
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
  const predicate = 'if (stopD0058B === 0 && ((cpu.memory[0xD000C3] ?? 0) & 0x04) === 0) {';
  const conditionedPredicate = 'if (stopD0058B === 0 && ((cpu.memory[0xD000C3] ?? 0) & 0x04) === 0 && (!window.__phase927D0009BPolicy || ((cpu.memory[0xD0009B] ?? 0) & 0x40) === 0)) {';
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!sourceHtml.includes(predicate)) throw new Error('Phase927 debounce predicate marker not found');
  if (!sourceHtml.includes(marker)) throw new Error('Phase927 instrumentation marker not found');

  const instrumentation = String.raw`
const PHASE927_GATE_PC = 0x0158DE;
const PHASE927_INSERT_PC = 0x05E372;
const PHASE927_HANDOFF_PC = 0x03F9B0;

function phase927Read24(addr) {
  const mem = cpu.memory;
  return ((mem[addr] ?? 0) | ((mem[addr + 1] ?? 0) << 8) | ((mem[addr + 2] ?? 0) << 16)) >>> 0;
}

function phase927Buffer(base) {
  return Array.from(cpu.memory.slice(base, base + 8));
}

window.__phase927D0009BPolicy = false;
window.__phase927PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase927PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase927PageErrors.push(String(event.reason || event));
});

window.__phase927 = {
  lineBase: null,
  record: null,
  records: [],
  setLineBase() {
    this.lineBase = phase927Read24(0xD0243A);
    return this.lineBase;
  },
  begin(spec) {
    const policyActive = !!spec.usePolicy && spec.label === '+';
    window.__phase927D0009BPolicy = policyActive;
    this.record = {
      label: spec.label,
      expectedIndex: spec.expectedIndex,
      expectedByte: spec.expectedByte,
      policyRequested: !!spec.usePolicy,
      policyActive,
      blocks: 0,
      prevPc: null,
      lastBuffer: phase927Buffer(this.lineBase),
      lastD0009B: cpu.memory[0xD0009B] ?? 0,
      writes: [],
      D0009BWrites: [],
      handoffs: [],
      milestones: [],
      drainStart: null,
      drainEnd: null,
      start: {
        cursor: phase927Read24(0xD0243A),
        descriptor: phase927Read24(0xD0243D),
        buffer: phase927Buffer(this.lineBase),
        D0058B: cpu.memory[0xD0058B] ?? 0,
        D000C3: cpu.memory[0xD000C3] ?? 0,
        D0009B: cpu.memory[0xD0009B] ?? 0,
      },
    };
    return this.record.start;
  },
  finish() {
    if (!this.record) return null;
    this.record.end = {
      cursor: phase927Read24(0xD0243A),
      descriptor: phase927Read24(0xD0243D),
      buffer: phase927Buffer(this.lineBase),
      D0058B: cpu.memory[0xD0058B] ?? 0,
      D000C3: cpu.memory[0xD000C3] ?? 0,
      D0009B: cpu.memory[0xD0009B] ?? 0,
      lastKey: window.__coldbootLastKey ?? null,
    };
    const result = this.record;
    this.records.push(result);
    this.record = null;
    window.__phase927D0009BPolicy = false;
    return result;
  },
};

const phase927OriginalObserve = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase927Observe(state, pc) {
  const record = window.__phase927?.record;
  const addr = pc & 0xFFFFFF;
  if (record && cpu?.memory) {
    record.blocks += 1;
    const buffer = phase927Buffer(record.lineBase);
    const changes = [];
    for (let i = 0; i < buffer.length; i += 1) {
      if (buffer[i] !== record.lastBuffer[i]) changes.push({ index: i, before: record.lastBuffer[i], after: buffer[i] });
    }
    if (changes.length > 0) record.writes.push({ pc: addr, prevPc: record.prevPc, block: record.blocks, changes });
    const D0009B = cpu.memory[0xD0009B] ?? 0;
    if (D0009B !== record.lastD0009B) {
      record.D0009BWrites.push({ pc: addr, prevPc: record.prevPc, block: record.blocks, before: record.lastD0009B, after: D0009B });
      record.lastD0009B = D0009B;
    }
    if (addr === PHASE927_HANDOFF_PC) {
      const D0058B = cpu.memory[0xD0058B] ?? 0;
      const D000C3 = cpu.memory[0xD000C3] ?? 0;
      const wouldPhase924Accept = D0058B === 0 && (D000C3 & 0x04) === 0;
      const wouldPhase927Accept = wouldPhase924Accept && (D0009B & 0x40) === 0;
      record.handoffs.push({
        block: record.blocks,
        D0058B,
        D000C3,
        D0009B,
        policyActive: !!window.__phase927D0009BPolicy,
        wouldPhase924Accept,
        wouldPhase927Accept,
      });
    }
    if (addr === PHASE927_GATE_PC || addr === PHASE927_INSERT_PC || addr === 0x001879) {
      record.milestones.push({
        kind: addr === PHASE927_GATE_PC ? 'gate' : addr === PHASE927_INSERT_PC ? 'insert' : 'pre_wipe',
        pc: addr,
        prevPc: record.prevPc,
        block: record.blocks,
        cursor: phase927Read24(0xD0243A),
        buffer,
        D000C3: cpu.memory[0xD000C3] ?? 0,
        D0009B,
      });
    }
    record.lastBuffer = buffer;
    record.prevPc = addr;
  }
  return phase927OriginalObserve(state, pc);
};

const phase927OriginalDrain = runColdbootPostInsertFirstZeroDrain;
runColdbootPostInsertFirstZeroDrain = function phase927Drain() {
  const record = window.__phase927?.record;
  if (record) {
    record.drainStart = {
      block: record.blocks,
      policyActive: !!window.__phase927D0009BPolicy,
      D0058B: cpu.memory[0xD0058B] ?? 0,
      D000C3: cpu.memory[0xD000C3] ?? 0,
      D0009B: cpu.memory[0xD0009B] ?? 0,
    };
  }
  const result = phase927OriginalDrain();
  if (record) {
    record.drainEnd = {
      result,
      block: record.blocks,
      D0058B: cpu.memory[0xD0058B] ?? 0,
      D000C3: cpu.memory[0xD000C3] ?? 0,
      D0009B: cpu.memory[0xD0009B] ?? 0,
    };
  }
  return result;
};
`;

  return sourceHtml
    .replace(predicate, conditionedPredicate)
    .replace(marker, `${instrumentation}\n\n${marker}`);
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
    await sleep(200);
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

async function pressKey(keySpec, usePolicy) {
  const spec = { ...keySpec, usePolicy };
  await evalExpr(ws, `window.__phase927.begin(${JSON.stringify(spec)})`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams(keySpec, 'keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === '${keySpec.code}'`, `${keySpec.label} completion`, 120000);
  await sleep(50);
  return evalExpr(ws, 'window.__phase927.finish()', 30000);
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

async function runScenario(pageUrl, name, sequence, usePolicy) {
  await cdp(ws, 'Page.navigate', { url: `${pageUrl}?scenario=${encodeURIComponent(name)}` });
  await waitFor(ws, 'document.readyState === "complete"', `${name} page load`, 30000);
  await waitFor(ws, '!!window.__phase927 && !!window.__coldbootReadEditLineState', `${name} instrumentation`, 30000);
  await sleep(250);
  await bootColdboot();
  const lineBase = await evalExpr(ws, 'window.__phase927.setLineBase()', 30000);
  const records = [];
  for (const keySpec of sequence) records.push(await pressKey(keySpec, usePolicy));
  const pageErrors = await evalExpr(ws, 'window.__phase927PageErrors', 30000);
  return { name, usePolicy, lineBase, records, pageErrors };
}

function insertCount(record, index, value) {
  return record.writes.filter((write) => write.changes.some((change) => change.index === index && change.after === value)).length;
}

function scenarioSummary(scenario) {
  const last = scenario.records.at(-1);
  return {
    name: scenario.name,
    usePolicy: scenario.usePolicy,
    lineBase: scenario.lineBase,
    routes: scenario.records.map((record) => ({
      key: record.label,
      policyActive: record.policyActive,
      termination: record.end.lastKey?.termination,
      steps: record.end.lastKey?.steps,
      gateHits: record.milestones.filter((row) => row.kind === 'gate').length,
      insertHits: record.milestones.filter((row) => row.kind === 'insert').length,
      preWipeHits: record.milestones.filter((row) => row.kind === 'pre_wipe').length,
      buffer: record.end.buffer,
      cursor: record.end.cursor,
      drain: record.drainEnd?.result ?? null,
      handoffs: record.handoffs,
    })),
    finalBuffer: last?.end.buffer ?? [],
    finalCursor: last?.end.cursor ?? null,
    pageErrors: scenario.pageErrors,
  };
}

function isExact123(scenario) {
  const last = scenario.records[2];
  return scenario.pageErrors.length === 0
    && scenario.records.every((record) => record.end.lastKey?.termination === 'post_insert_gate_stop')
    && last.end.buffer.slice(0, 4).join(',') === '49,50,51,0'
    && last.milestones.filter((row) => row.kind === 'insert').length === 1
    && insertCount(last, 3, 0x31) === 0;
}

function isExact2Plus3(scenario) {
  const last = scenario.records[2];
  return scenario.pageErrors.length === 0
    && scenario.records.every((record) => record.end.lastKey?.termination === 'post_insert_gate_stop')
    && last.end.buffer.slice(0, 4).join(',') === '50,158,51,0'
    && last.milestones.filter((row) => row.kind === 'insert').length === 1
    && insertCount(last, 3, 0x31) === 0;
}

function formatScenarioRows(scenarios) {
  return scenarios.flatMap((scenario) => scenario.records.map((record) => {
    const gateHits = record.milestones.filter((row) => row.kind === 'gate').length;
    const repeated = record.label === '3' && record.end.buffer[3] === 0x31 ? 1 : 0;
    const drain = record.drainEnd?.result;
    return `| ${scenario.name} | ${record.label} | ${record.policyActive ? 'yes' : 'no'} | ${record.end.lastKey?.termination ?? '-'} | ${record.end.lastKey?.steps ?? '-'} | ${gateHits} | ${repeated} | ${record.end.buffer.slice(0, 4).map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ')} | ${drain?.stopKind ?? '-'} @ ${hex(drain?.stopPc ?? drain?.guardPc)} |`;
  }));
}

function buildReport(data) {
  if (!data || data.error) {
    return `# Phase 927: D0009B-conditioned handoff A/B\n\nProbe failed: ${data?.error ?? 'unknown error'}\n`;
  }
  const plusBase = data.scenarios.find((scenario) => scenario.name === '2plus3-baseline');
  const plusPolicy = data.scenarios.find((scenario) => scenario.name === '2plus3-d0009b-policy');
  const plusBaseDrain = plusBase.records[1];
  const plusPolicyDrain = plusPolicy.records[1];
  const rejected = plusPolicyDrain.handoffs.filter((row) => row.policyActive && row.wouldPhase924Accept && !row.wouldPhase927Accept);
  const policyDigit3 = plusPolicy.records[2];
  const baselineDigit3 = plusBase.records[2];
  const candidateWorks = data.candidateWorks;
  return [
    '# Phase 927: D0009B-conditioned handoff A/B',
    '',
    'Probe: `probe-phase927-d0009b-conditioned-handoff-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase927-d0009b-conditioned-handoff-ab.mjs`',
    '',
    '## Result',
    '',
    `- Probe PASS: **${data.pass ? 'yes' : 'no'}**. Candidate removes duplication: **${candidateWorks ? 'yes' : 'no'}**.`,
    `- Both independent \`123\` pages stay exact: baseline=${data.controlBaselineExact ? 'yes' : 'no'}, instrumented-policy shell=${data.controlPolicyExact ? 'yes' : 'no'}.`,
    `- Baseline \`2+3\` remains the PHASE926 failure: exact=${data.plusBaselineExact ? 'yes' : 'no'}, Digit3 termination=${baselineDigit3.end.lastKey?.termination}, insert-owner hits=${baselineDigit3.milestones.filter((row) => row.kind === 'insert').length}, repeated final \`0x31\`=${baselineDigit3.end.buffer[3] === 0x31 ? 'yes' : 'no'}.`,
    `- The plus-only policy rejected ${rejected.length} handoff(s) that PHASE924 would accept solely because \`D0009B & 0x40\` was set.`,
    `- Conditioned plus drain ended as \`${plusPolicyDrain.drainEnd?.result?.stopKind ?? plusPolicyDrain.drainEnd?.result?.termination ?? '-'}\` at ${hex(plusPolicyDrain.drainEnd?.result?.stopPc ?? plusPolicyDrain.drainEnd?.result?.guardPc)} after ${plusPolicyDrain.drainEnd?.result?.steps ?? '-'} steps; D0009B=${hex(plusPolicyDrain.drainEnd?.D0009B, 2)}.`,
    `- Conditioned Digit3 termination=${policyDigit3.end.lastKey?.termination}, gate hits=${policyDigit3.milestones.filter((row) => row.kind === 'gate').length}, insert-owner hits=${policyDigit3.milestones.filter((row) => row.kind === 'insert').length}, repeated final \`0x31\`=${policyDigit3.end.buffer[3] === 0x31 ? 'yes' : 'no'}, final=${policyDigit3.end.buffer.slice(0, 4).map((value) => hex(value, 2)).join(' ')}.`,
    '',
    candidateWorks
      ? 'The A/B supports the narrow predicate as a causal fix candidate: refusing the stale bit-6 handoff lets the plus-conditioned next Digit3 reach the existing post-insert gate exactly once without editing RAM or dispatching ENTER. The next tick must adjudicate where the extended drain stops and its wipe safety before any disk patch.'
      : 'The A/B rejects the stale bit-6 handoff but does not produce an exact gated Digit3. Therefore `D0009B` bit 6 is a directly read controller but this predicate alone is not yet a safe browser fix; continue from the bounded conditioned-drain stop/next route rather than force-clearing flags or restoring edit RAM.',
    '',
    '## Route table',
    '',
    '| page | key | policy active | termination | steps | gate hits | repeated 31 | final first 4 bytes | drain stop |',
    '|---|---|---:|---|---:|---:|---:|---|---|',
    ...formatScenarioRows(data.scenarios),
    '',
    '## Plus handoff A/B',
    '',
    '| variant | block | D0058B | D000C3 | D0009B | PHASE924 accepts | PHASE927 accepts |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...[
      ...plusBaseDrain.handoffs.map((row) => ({ variant: 'baseline', ...row })),
      ...plusPolicyDrain.handoffs.map((row) => ({ variant: 'conditioned', ...row })),
    ].map((row) => `| ${row.variant} | ${row.block} | ${hex(row.D0058B, 2)} | ${hex(row.D000C3, 2)} | ${hex(row.D0009B, 2)} | ${row.wouldPhase924Accept ? 'yes' : 'no'} | ${row.wouldPhase927Accept ? 'yes' : 'no'} |`),
    '',
    '## Bounded JSON evidence',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      candidateWorks: data.candidateWorks,
      controlBaselineExact: data.controlBaselineExact,
      controlPolicyExact: data.controlPolicyExact,
      plusBaselineExact: data.plusBaselineExact,
      plusPolicyExact: data.plusPolicyExact,
      policyObserved: data.policyObserved,
      scenarios: data.scenarios.map(scenarioSummary),
    }, null, 2),
    '```',
    '',
    'The browser shell was modified only in the HTTP response served by this probe. No disk browser/runtime/transpiler/decoder/peripheral/scheduler/ROM/`follow-alongs/` file was changed.',
    '',
  ].join('\n');
}

async function runProbe() {
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

  const scenarios = [];
  scenarios.push(await runScenario(pageUrl, '123-baseline', CONTROL_SEQUENCE, false));
  scenarios.push(await runScenario(pageUrl, '123-policy-shell', CONTROL_SEQUENCE, true));
  scenarios.push(await runScenario(pageUrl, '2plus3-baseline', PLUS_SEQUENCE, false));
  scenarios.push(await runScenario(pageUrl, '2plus3-d0009b-policy', PLUS_SEQUENCE, true));

  const controlBaselineExact = isExact123(scenarios[0]);
  const controlPolicyExact = isExact123(scenarios[1]);
  const plusBaselineExact = isExact2Plus3(scenarios[2]);
  const plusPolicyExact = isExact2Plus3(scenarios[3]);
  const baselineDigit3 = scenarios[2].records[2];
  const policyPlusDrain = scenarios[3].records[1];
  const policyObserved = policyPlusDrain.handoffs.some((row) => row.policyActive && row.wouldPhase924Accept && !row.wouldPhase927Accept);
  const baselineFailureReproduced = baselineDigit3.end.lastKey?.termination === 'max_steps'
    && baselineDigit3.milestones.filter((row) => row.kind === 'insert').length >= 2
    && baselineDigit3.end.buffer.slice(0, 4).join(',') === '50,158,51,49';
  const pageErrors = scenarios.flatMap((scenario) => scenario.pageErrors);
  const pass = pageErrors.length === 0
    && controlBaselineExact
    && controlPolicyExact
    && baselineFailureReproduced
    && policyObserved
    && scenarios.every((scenario) => scenario.records.length === 3);

  return {
    probe: 'phase927-d0009b-conditioned-handoff-ab',
    pass,
    candidateWorks: plusPolicyExact,
    controlBaselineExact,
    controlPolicyExact,
    plusBaselineExact,
    plusPolicyExact,
    baselineFailureReproduced,
    policyObserved,
    pageErrors,
    scenarios,
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    candidateWorks: summary.candidateWorks,
    controlBaselineExact: summary.controlBaselineExact,
    controlPolicyExact: summary.controlPolicyExact,
    plusBaselineExact: summary.plusBaselineExact,
    plusPolicyExact: summary.plusPolicyExact,
    policyObserved: summary.policyObserved,
    scenarios: summary.scenarios.map(scenarioSummary),
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase927-d0009b-conditioned-handoff-ab', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

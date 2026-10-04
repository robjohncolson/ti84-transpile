// Run through scripts/run-probe.mjs --max-time 180.
// Exercise the current browser's ROM paths without its JavaScript evaluator.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { buildFontSignatures, decodeTextStrip } from './font-decoder.mjs';

const root = import.meta.dirname;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-rom-calculator-'));
const executable = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(candidate => fs.existsSync(candidate));
assert.ok(executable, 'Chrome or Edge is required');

// Observation hooks only: the shell's execution and evaluation code is unchanged.
const hooks = `
window.__romCalculatorProbe = {
  parse: evaluateViaParseInp,
  vram: () => Array.from(cpu.memory.slice(0xD40000, 0xD65800)),
  bootState: () => ({ status: document.getElementById('status').textContent,
    pointers: [0xD0066F, 0xD00672, 0xD00675, 0xD02437, 0xD02440].map(a => evalRead24(cpu.memory, a)),
    log: document.getElementById('log')?.textContent?.slice(-1500) }),
  traceEnter() {
    this.originalRun ??= executor.runFrom.bind(executor);
    const run = this.originalRun;
    const trace = { recent: [], corruption: null, changes: [], home: [], parser: [], editChanges: [], copies: [], parserHits: 0 };
    let oldVat = evalRead24(cpu.memory, 0xD02590);
    const editBase = evalRead24(cpu.memory, 0xD02437);
    let oldEdit = Array.from(cpu.memory.slice(editBase, editBase + 3)).join(',');
    executor.runFrom = (pc, mode, options = {}) => run(pc, mode, {
      ...options,
      onBlock(pc, mode, meta, steps) {
        if (meta?.instructions?.some(i => /ld[di]r/.test(i.dasm)) && trace.copies.length < 100) {
          trace.copies.push({ pc, hl: cpu.hl, de: cpu.de, bc: cpu.bc,
            bytes: Array.from(cpu.memory.slice(cpu.hl, cpu.hl + 16)),
            instructions: meta.instructions.map(i => i.dasm) });
        }
        const edit = Array.from(cpu.memory.slice(editBase, editBase + 3)).join(',');
        if (edit !== oldEdit && trace.editChanges.length < 12) {
          trace.editChanges.push({ pc, oldEdit, edit, preceding: trace.recent.slice(-5) });
          oldEdit = edit;
        }
        if (pc >= 0x099910 && pc < 0x099a00) trace.parserHits++;
        if ((pc >= 0x099910 && pc < 0x099a00) || pc === 0x0586e7 || pc === 0x05e872 || pc === 0x05e87b) {
          const begin = evalRead24(cpu.memory, 0xD02317);
          trace.parser.push({ pc, hl: cpu.hl, de: cpu.de, a: cpu.a, begin,
            current: evalRead24(cpu.memory, 0xD0231A), end: evalRead24(cpu.memory, 0xD0231D),
            bytes: Array.from(cpu.memory.slice(begin, begin + 16)),
            pointers: [0xD0066F, 0xD00672, 0xD00675, 0xD02437, 0xD0243A, 0xD0243D, 0xD02440].map(a => evalRead24(cpu.memory, a)),
            op1: Array.from(cpu.memory.slice(0xD005F8, 0xD00601)),
            instructions: meta?.instructions?.map(i => i.dasm) });
        }
        if (pc >= 0x058500 && pc < 0x058c80 && trace.home.length < 80) {
          trace.home.push({ pc, a: cpu.a, f: cpu.f, hl: cpu.hl, de: cpu.de, bc: cpu.bc,
            begPC: evalRead24(cpu.memory, 0xD02317), curPC: evalRead24(cpu.memory, 0xD0231A),
            endPC: evalRead24(cpu.memory, 0xD0231D),
            instructions: meta?.instructions?.map(i => i.dasm) });
        }
        const vat = evalRead24(cpu.memory, 0xD02590);
        if (vat !== oldVat) {
          if (trace.changes.length < 20) trace.changes.push({ pc, oldVat, vat });
          if (!trace.corruption && vat === 0) trace.corruption = [...trace.recent];
          oldVat = vat;
        }
        trace.recent.push({ pc, mode, sp: cpu.sp, hl: cpu.hl, de: cpu.de, bc: cpu.bc, af: cpu.af,
          instructions: meta?.instructions?.map(i => i.dasm) });
        if (trace.recent.length > 35) trace.recent.shift();
        options.onBlock?.(pc, mode, meta, steps);
      },
    });
    this.trace = trace;
  },
  read() {
    const mem = cpu.memory;
    return {
      lastKey: window.__coldbootLastKey ?? null,
      edit: getColdbootEditLineDiagnostics(),
      op1: Array.from(mem.slice(0xD005F8, 0xD00601)),
      pc: lastPc,
    };
  },
};
`;
let shell = fs.readFileSync(path.join(root, 'browser-shell.html'), 'utf8');
const snapshot = '      coldbootVatSnapshot = COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field, readColdbootReplayField(field)]);';
assert.ok(shell.includes(snapshot), 'stable snapshot marker');
shell = shell.replace(snapshot, `${snapshot}\n      window.__probeHistorySnapshot = { end: evalRead24(mem, 0xD01508), count: mem[0xD01D0B] };`);
assert.equal(shell.split('</script>').length, 2, 'one shell module expected');

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const filename = path.resolve(root, `.${pathname}`);
  if (!filename.startsWith(`${root}${path.sep}`) || !fs.existsSync(filename)) {
    response.writeHead(404).end();
    return;
  }
  const extension = path.extname(filename);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
  response.setHeader('Content-Type', `${types[extension] || 'application/octet-stream'}; charset=utf-8`);
  if (filename === path.join(root, 'browser-shell.html')) {
    response.end(shell.replace('</script>', `${hooks}\n</script>`));
    return;
  }
  const stream = fs.createReadStream(filename);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
});

let browser;
let socket;
let nextId = 0;
const pending = new Map();
const summary = { pass: false, workflow: [], parser: [], errors: [] };

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 45000);
    timer.unref();
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, timeout: 40000,
  });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitFor(check, description, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(executable, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  browser.on('error', error => summary.errors.push(error.message));
  const endpointFile = path.join(profile, 'DevToolsActivePort');
  await waitFor(() => fs.existsSync(endpointFile), 'DevTools endpoint', 15000);
  const port = fs.readFileSync(endpointFile, 'utf8').split('\n')[0].trim();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(entry => entry.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') {
      summary.errors.push(message.params.exceptionDetails);
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/browser-shell.html` });
  await waitFor(() => evaluate('Boolean(window.__romCalculatorProbe)'), 'shell load');
  await evaluate(`(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(() => evaluate('Boolean(window.__coldbootPhase6)'), 'boot phases');
  summary.bootStatus = await evaluate('window.__romCalculatorProbe.bootState()');
  console.log(JSON.stringify(summary.bootStatus));
  await waitFor(() => evaluate("document.getElementById('status').textContent.includes('Coldboot complete')"), 'coldboot');
  summary.boot = await evaluate('window.__coldbootPhase6');
  summary.historySnapshot = await evaluate('window.__probeHistorySnapshot');

  for (const [code, key, virtualKey] of [
    ['Digit1', '1', 49], ['Equal', '+', 187], ['Digit1', '1', 49], ['Enter', 'Enter', 13],
  ]) {
    if (code === 'Enter') await evaluate('window.__romCalculatorProbe.traceEnter()');
    await command('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: virtualKey });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: virtualKey });
    const state = await evaluate('window.__romCalculatorProbe.read()');
    summary.workflow.push({ code, ...state });
    console.log(JSON.stringify({ key: code, termination: state.lastKey?.termination, op1: state.op1, edit: state.edit }));
  }
  summary.enterTrace = await evaluate('window.__romCalculatorProbe.trace');
  const screen = await evaluate("document.getElementById('lcd').toDataURL('image/png')");
  fs.writeFileSync(path.join(root, '..', 'logs', 'rom-calculator-screen.png'), Buffer.from(screen.split(',')[1], 'base64'));
  const memory = new Uint8Array(0x1000000);
  memory.set(await evaluate('window.__romCalculatorProbe.vram()'), 0xD40000);
  const signatures = buildFontSignatures(fs.readFileSync(path.join(root, 'ROM.rom')));
  summary.screenText = [39, 59, 79, 99].map(row => ({ row,
    text: decodeTextStrip(memory, row, 2, 26, signatures, 0, 'normal', 12, 10) }));

  // Separate parser evidence: a parser result is not a passing keyboard workflow.
  for (const [expression, expected] of [['1+1', 2], ['2+3', 5], ['6*7', 42], ['22/7', 22 / 7]]) {
    const result = await evaluate(`window.__romCalculatorProbe.parse(${JSON.stringify(expression)})`);
    const pass = result.romParser === true && result.errNo === 0
      && Number.isFinite(result.value) && Math.abs(result.value - expected) < 1e-10;
    summary.parser.push({ expression, expected, pass, result });
    console.log(JSON.stringify({ expression, pass, result }));
  }
  summary.resultScreenVerified = summary.screenText[0].text.startsWith('1+1')
    && summary.screenText[1].text.trim() === '2';
  summary.singleEvaluation = summary.enterTrace.parser.filter(block => block.pc === 0x0586e7).length === 1;
  summary.followup = [];
  for (const [expression, keys, resultRow, expected] of [
    ['2+3', [['Digit2', '2', 50], ['Equal', '+', 187], ['Digit3', '3', 51]], 99, '5'],
    ['6*7', [['Digit6', '6', 54], ['NumpadMultiply', '*', 106], ['Digit7', '7', 55]], 139, '42'],
  ]) {
    for (const [code, key, virtualKey] of [...keys, ['Enter', 'Enter', 13]]) {
      if (code === 'Enter') await evaluate('window.__romCalculatorProbe.traceEnter()');
      await command('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: virtualKey });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: virtualKey });
    }
    memory.set(await evaluate('window.__romCalculatorProbe.vram()'), 0xD40000);
    const text = decodeTextStrip(memory, resultRow, 2, 26, signatures, 0, 'normal', 12, 10);
    const trace = await evaluate('window.__romCalculatorProbe.trace');
    const evaluations = trace.parser.filter(block => block.pc === 0x0586e7).length;
    summary.followup.push({ expression, expected, text, evaluations, pass: text.trim() === expected && evaluations === 1 });
  }
  summary.invalidExpressions = [];
  for (const expression of ['1/0', '2+']) {
    const result = await evaluate('window.__romCalculatorProbe.parse(' + JSON.stringify(expression) + ')');
    summary.invalidExpressions.push({ expression, result,
      pass: result.romParser === true && Boolean(result.error) && result.errNo > 0 && result.value === undefined });
  }
  const afterError = await evaluate('window.__romCalculatorProbe.parse("1+1")');
  summary.recovery = { result: afterError,
    pass: afterError.value === 2 && afterError.errNo === 0 && !afterError.error };
  summary.parserUi = [];
  for (const [expression, expected] of [['1/0', 'ROM parser error 0x82'], ['1+1', '= 2  [ROM Parser]']]) {
    const text = await evaluate(`(() => {
      document.getElementById('evalUseROMParser').checked = true;
      document.getElementById('evalInput').value = ${JSON.stringify(expression)};
      document.getElementById('btnEval').click();
      return document.getElementById('evalResult').textContent;
    })()`);
    summary.parserUi.push({ expression, text, pass: text === expected });
  }
  summary.pass = summary.resultScreenVerified && summary.parser.every(result => result.pass)
    && summary.singleEvaluation && summary.followup.every(result => result.pass)
    && summary.invalidExpressions.every(result => result.pass) && summary.recovery.pass
    && summary.parserUi.every(result => result.pass) && summary.errors.length === 0;
  process.exitCode = summary.pass ? 0 : 1;
} catch (error) {
  summary.errors.push(String(error.stack || error));
  process.exitCode = 1;
} finally {
  const report = path.join(root, '..', 'logs', 'rom-calculator-probe.json');
  fs.writeFileSync(report, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ pass: summary.pass, errors: summary.errors, report }));
  for (const entry of pending.values()) clearTimeout(entry.timer);
  socket?.close();
  if (browser?.pid && process.platform === 'win32') {
    await new Promise(resolve => {
      const cleanup = spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true });
      cleanup.once('exit', resolve);
      cleanup.once('error', resolve);
    });
  } else {
    browser?.kill();
  }
  server.closeAllConnections();
  server.close();
  await delay(500);
  // profile was created by mkdtemp under os.tmpdir; never clean another path.
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); } catch {}
}

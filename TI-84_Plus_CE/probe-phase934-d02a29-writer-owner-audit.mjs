import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const BASE_PROBE_PATH = path.join(__dirname, 'probe-phase922-browser-123-left-cursor-relative-audit.mjs');
const REPORT_PATH = path.join(__dirname, 'phase934-d02a29-writer-owner-audit.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DIGIT3_CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const RESULT_NAME = `.phase934-${process.pid}-${Date.now()}.result.tmp.json`;
const TEMP_REPORT_NAME = `.phase934-${process.pid}-${Date.now()}.report.tmp.md`;
const TEMP_MODULE_NAME = `.phase934-${process.pid}-${Date.now()}.tmp.mjs`;
const RESULT_PATH = path.join(__dirname, RESULT_NAME);
const TEMP_REPORT_PATH = path.join(__dirname, TEMP_REPORT_NAME);
const TEMP_MODULE_PATH = path.join(__dirname, TEMP_MODULE_NAME);
const DEBUG_PORT = 9936;

const D02A29 = 0xD02A29;
const RAM_BASE = 0xD00000;
const WRITER_OPCODE = Object.freeze([0x40, 0x22, 0x29, 0x2A]);
const EXPECTED_DIRECT_WRITER_PCS = Object.freeze([
  0x08DF54,
  0x08DFDD,
  0x08ED73,
  0x08EE0D,
  0x08F006,
  0x08F0B8,
  0x08F0D4,
  0x08F10E,
  0x08F551,
  0x08F5A4,
  0x08F6A5,
  0x08F6FE,
  0x08F70F,
  0x08F7C5,
]);
const RELEVANT_OWNER_PCS = Object.freeze([
  0x08DF54,
  0x08DFDD,
  0x08ED73,
  0x08EE0D,
  0x08F006,
  0x08F0B8,
  0x08F0D4,
  0x08F10E,
  0x08F54B,
  0x08F551,
  0x08F56C,
  0x08F59D,
  0x08F5A4,
  0x08F69C,
  0x08F6A5,
  0x08F6F4,
  0x08F6FE,
  0x08F704,
  0x08F70F,
  0x08F7BF,
  0x08F7C5,
]);

const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Phase934 marker not found: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Phase934 marker is not unique: ${label}`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

function buildProbeSource(baseSource) {
  let source = baseSource;
  source = replaceExactlyOnce(
    source,
    "const REPORT_PATH = path.join(__dirname, 'phase922-browser-123-left-cursor-relative-audit.md');",
    `const REPORT_PATH = path.join(__dirname, ${JSON.stringify(TEMP_REPORT_NAME)});\nconst PHASE934_RESULT_PATH = path.join(__dirname, ${JSON.stringify(RESULT_NAME)});`,
    'phase922 report path',
  );
  source = replaceExactlyOnce(
    source,
    'const DEBUG_PORT = 9922;',
    `const DEBUG_PORT = ${DEBUG_PORT};`,
    'phase922 debug port',
  );
  source = replaceExactlyOnce(
    source,
    '  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    '  try { fs.writeFileSync(PHASE934_RESULT_PATH, JSON.stringify(summary)); } catch {}\n  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    'phase922 result write',
  );

  const accessInstrumentation = String.raw`
const PHASE934_D02A29_START = 0xD02A29;
const PHASE934_D02A29_END = 0xD02A2A;
const PHASE934_RELEVANT_OWNER_PCS = new Set(${JSON.stringify(RELEVANT_OWNER_PCS)});
let phase934WrappedCpu = null;
let phase934CurrentPc = null;

function phase934RangeOverlaps(addr, width) {
  const start = addr & 0xFFFFFF;
  const end = (start + width - 1) & 0xFFFFFF;
  return start <= PHASE934_D02A29_END && end >= PHASE934_D02A29_START;
}

function phase934FieldValue() {
  if (!cpu?.memory) return null;
  return (cpu.memory[PHASE934_D02A29_START] ?? 0)
    | ((cpu.memory[PHASE934_D02A29_START + 1] ?? 0) << 8);
}

function phase934InstallAccessTrace() {
  if (!cpu || phase934WrappedCpu === cpu) return;
  phase934WrappedCpu = cpu;
  const widths = { read8: 1, write8: 1, read16: 2, write16: 2, read24: 3, write24: 3 };
  for (const [method, width] of Object.entries(widths)) {
    const original = cpu[method].bind(cpu);
    cpu[method] = function phase934TracedAccess(...args) {
      const addr = (args[0] ?? 0) & 0xFFFFFF;
      const before = phase934FieldValue();
      const result = original(...args);
      const record = window.__phase922?.record;
      if (record?.active && phase934RangeOverlaps(addr, width)) {
        record.d02a29Accesses.push({
          kind: method.startsWith('read') ? 'read' : 'write',
          method,
          pc: phase934CurrentPc,
          addr,
          width,
          argument: method.startsWith('write') ? (args[1] >>> 0) : null,
          result: method.startsWith('read') ? (result >>> 0) : null,
          before,
          after: phase934FieldValue(),
          mbase: cpu.mbase,
          hl: cpu.hl,
          de: cpu.de,
          bc: cpu.bc,
          a: cpu.a,
          f: cpu.f,
        });
      }
      return result;
    };
  }
}
`;
  source = replaceExactlyOnce(
    source,
    'const phase922OriginalObserve = observeColdbootPersistenceBlock;',
    `${accessInstrumentation}\nconst phase922OriginalObserve = observeColdbootPersistenceBlock;`,
    'phase922 observer declaration',
  );
  source = replaceExactlyOnce(
    source,
    `      firstChanges: [],
      start: phase922Capture(label + ':start'),`,
    `      firstChanges: [],
      d02a29Accesses: [],
      relevantOwnerHits: {},
      renderRangeHits: 0,
      visitedPcCount: 0,
      start: phase922Capture(label + ':start'),`,
    'phase922 record fields',
  );
  source = replaceExactlyOnce(
    source,
    `    this.record.lastFields = phase922ReadFields(this.record);
    return this.record.start;`,
    `    phase934InstallAccessTrace();
    phase934CurrentPc = null;
    this.record.lastFields = phase922ReadFields(this.record);
    return this.record.start;`,
    'phase922 begin hook',
  );
  source = replaceExactlyOnce(
    source,
    `  if (record?.active) {
    record.blocks += 1;`,
    `  if (record?.active) {
    phase934CurrentPc = addr;
    record.blocks += 1;
    record.visitedPcCount += 1;
    if (PHASE934_RELEVANT_OWNER_PCS.has(addr)) {
      record.relevantOwnerHits[addr] = (record.relevantOwnerHits[addr] ?? 0) + 1;
    }
    if (addr >= 0x08DF00 && addr <= 0x08F7FF) record.renderRangeHits += 1;`,
    'phase922 observer active block',
  );
  return source;
}

function scanDirectWriterSites() {
  const rom = fs.readFileSync(ROM_PATH);
  const hits = [];
  for (let pc = 0; pc <= rom.length - WRITER_OPCODE.length; pc += 1) {
    if (WRITER_OPCODE.every((byte, index) => rom[pc + index] === byte)) hits.push(pc);
  }
  return hits;
}

function readCapture16(filePath, addr) {
  const bytes = fs.readFileSync(filePath);
  const offset = addr - RAM_BASE;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function routeDigest(row) {
  const record = row?.record ?? {};
  const lastKey = row?.state?.lastKey ?? {};
  return {
    key: row?.keySpec?.label ?? null,
    code: lastKey.code ?? null,
    termination: lastKey.termination ?? null,
    steps: lastKey.steps ?? null,
    controlStopPc: lastKey.controlStopPc ?? null,
    field: row?.state?.fields?.D02A29 ?? null,
    accesses: record.d02a29Accesses ?? [],
    relevantOwnerHits: record.relevantOwnerHits ?? {},
    renderRangeHits: record.renderRangeHits ?? 0,
    visitedPcCount: record.visitedPcCount ?? 0,
    buffer: lastKey.buffer?.slice(0, 4) ?? [],
    pageErrors: row?.state?.pageErrors ?? [],
  };
}

function flattenHits(routes) {
  const totals = {};
  for (const route of routes) {
    for (const [pc, count] of Object.entries(route.relevantOwnerHits)) {
      totals[pc] = (totals[pc] ?? 0) + count;
    }
  }
  return totals;
}

function formatRouteRows(routes) {
  return routes.map((route) => (
    `| ${route.key} | ${route.termination} | ${route.steps?.toLocaleString?.() ?? route.steps} | ${hex(route.controlStopPc)} | ${hex(route.field, 4)} | ${route.accesses.length} | ${route.renderRangeHits} | ${route.pageErrors.length} |`
  )).join('\n');
}

function buildReport(summary) {
  if (summary.error) return `# Phase 934: D02A29 Writer/Owner Audit\n\nProbe failed:\n\n\`\`\`text\n${summary.error}\n\`\`\`\n`;
  return `# Phase 934: D02A29 Writer/Owner Audit

Probe: \`probe-phase934-d02a29-writer-owner-audit.mjs\`  
Run: \`node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase934-d02a29-writer-owner-audit.mjs\`

## Result

- Probe execution: ${summary.pass ? '**PASS**' : '**FAIL**'}.
- The bounded disk route inserted exact \`31 32 33 00\`; all three digit routes stopped at the existing post-insert gate, and ArrowLeft stopped at the preserved \`0x001879\` control pre-stop with zero page errors.
- Across all four active routes, wrapped CPU \`read8/read16/read24/write8/write16/write24\` recorded **${summary.totalAccesses} reads/writes overlapping \`D02A29..D02A2A\`**. The field stayed \`${hex(summary.browserValues.at(-1), 4)}\` from the pre-sequence state through ArrowLeft, while the real \`123 LEFT\` capture is \`${hex(summary.realLeftOracle, 4)}\`.
- None of the ${RELEVANT_OWNER_PCS.length} bounded owner/entry PCs was reached, and there were ${summary.totalRenderRangeHits} visits anywhere in \`0x08DF00..0x08F7FF\`. This rules out a writer that ran but was later undone: the renderer/measurement family never runs on this harness route.
- Raw ROM bytes contain the direct short-address \`LD (0x002A29),HL\` opcode at exactly ${summary.directWriterSites.length} sites: ${summary.directWriterSites.map((pc) => `\`${hex(pc)}\``).join(', ')}.
- The first missing functional writer is \`0x08F551\` in the closed \`0x08F54B\` text-measure/render block: \`HL = old D02A29 + DE\`, then \`LD (0x002A29),HL\`. The real one-digit \`Digit3\` capture is \`${hex(summary.realDigit3Oracle, 4)}\` and the real \`123 LEFT\` capture is \`${hex(summary.realLeftOracle, 4)}\`, consistent with three 12-pixel glyph advances. This audit names the absent path but does not enter, patch, or force it.

## Bounded route evidence

| Key | Termination | Steps | Control stop | D02A29 | CPU accesses | 08DF00..08F7FF hits | Page errors |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
${formatRouteRows(summary.routes)}

All dynamic access arrays and relevant-owner hit maps are empty. The browser shell's coldboot seed writes \`D02A29=0\` before this bounded key sequence begins; no OS block reads or writes either byte afterward.

## Static owner adjudication

The fourteen direct writer sites separate into initialization/save-restore and live measurement/update families. For the active mismatch, \`0x08F551\` is the first semantically relevant owner because the \`0x08F54B\` block reads the current accumulator, adds the incoming glyph advance in \`DE\`, and stores the sum. The route's existing post-insert and control pre-stops occur without entering that family, so forcing \`D02A29=0x0024\` would mask an intentionally absent downstream measurement pass rather than repair a writer that executed incorrectly.

The closed \`0x08F54B\` engine thread remains closed. A future fix, if authorized, should be a narrow browser policy derived from the already-inserted token bytes and should be validated as a probe-local A/B before any disk edit.

## Scope

Only this new probe, this report, and the handoff are persisted. \`browser-shell.html\`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and \`follow-alongs/\` are untouched.
`;
}

let summary;
try {
  const baseSource = fs.readFileSync(BASE_PROBE_PATH, 'utf8');
  fs.writeFileSync(TEMP_MODULE_PATH, buildProbeSource(baseSource));
  await import(`${pathToFileURL(TEMP_MODULE_PATH).href}?phase934=${Date.now()}`);
  process.exitCode = 0;
  if (!fs.existsSync(RESULT_PATH)) throw new Error('Phase934 child did not write a result');
  const result = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));
  const routes = (result.keyRuns ?? []).map(routeDigest);
  const directWriterSites = scanDirectWriterSites();
  const realDigit3Oracle = readCapture16(DIGIT3_CAPTURE_PATH, D02A29);
  const realLeftOracle = result.capture?.fields?.D02A29 ?? null;
  const browserValues = [result.afterBoot?.fields?.D02A29, ...routes.map((route) => route.field)];
  const totalAccesses = routes.reduce((sum, route) => sum + route.accesses.length, 0);
  const totalRenderRangeHits = routes.reduce((sum, route) => sum + route.renderRangeHits, 0);
  const ownerHits = flattenHits(routes);
  const exactBuffers = [
    [0x31, 0x00, 0x00, 0x00],
    [0x31, 0x32, 0x00, 0x00],
    [0x31, 0x32, 0x33, 0x00],
    [0x31, 0x32, 0x33, 0x00],
  ];
  const routePass = routes.length === 4
    && routes.slice(0, 3).every((route) => route.termination === 'post_insert_gate_stop')
    && routes[3].termination === 'control_pre_stop'
    && routes[3].controlStopPc === 0x001879
    && routes.every((route) => route.pageErrors.length === 0)
    && routes.every((route, index) => exactBuffers[index].every((byte, byteIndex) => route.buffer[byteIndex] === byte));
  const dynamicPass = totalAccesses === 0
    && totalRenderRangeHits === 0
    && Object.keys(ownerHits).length === 0
    && browserValues.every((value) => value === 0);
  const staticPass = JSON.stringify(directWriterSites) === JSON.stringify(EXPECTED_DIRECT_WRITER_PCS)
    && realDigit3Oracle === 0x000C
    && realLeftOracle === 0x0024;

  summary = {
    probe: 'phase934-d02a29-writer-owner-audit',
    pass: routePass && dynamicPass && staticPass,
    routePass,
    dynamicPass,
    staticPass,
    realDigit3Oracle,
    realLeftOracle,
    browserValues,
    totalAccesses,
    totalRenderRangeHits,
    ownerHits,
    directWriterSites,
    routes,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    routePass,
    dynamicPass,
    staticPass,
    realDigit3Oracle: hex(realDigit3Oracle, 4),
    realLeftOracle: hex(realLeftOracle, 4),
    browserValues: browserValues.map((value) => hex(value, 4)),
    totalAccesses,
    totalRenderRangeHits,
    ownerHits,
    directWriterSites: directWriterSites.map((pc) => hex(pc)),
    routes: routes.map((route) => ({
      key: route.key,
      termination: route.termination,
      steps: route.steps,
      controlStopPc: hex(route.controlStopPc),
      field: hex(route.field, 4),
      accesses: route.accesses,
      relevantOwnerHits: route.relevantOwnerHits,
      renderRangeHits: route.renderRangeHits,
      buffer: route.buffer.map((value) => hex(value, 2)),
      pageErrors: route.pageErrors,
    })),
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase934-d02a29-writer-owner-audit', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  for (const filePath of [TEMP_MODULE_PATH, RESULT_PATH, TEMP_REPORT_PATH]) {
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
}

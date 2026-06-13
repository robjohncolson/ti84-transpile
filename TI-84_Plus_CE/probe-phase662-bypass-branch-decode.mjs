import fs from 'node:fs';
import path from 'node:path';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = import.meta.dirname;
const TEMPLATE_PATH = path.join(__dirname, 'probe-phase659-cleanup-gate-state.mjs');
const REPORT_PATH = path.join(__dirname, 'phase662-bypass-branch-decode.md');

function replaceOnce(source, needle, replacement) {
  if (!source.includes(needle)) {
    throw new Error(`Template marker not found: ${needle.slice(0, 120)}`);
  }
  return source.replace(needle, replacement);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatInsn(insn, romBytes) {
  const fields = Object.entries(insn)
    .filter(([key]) => !['pc', 'nextPc', 'length'].includes(key))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join(' ');
  return {
    address: hex(insn.pc),
    bytes: Array.from(romBytes.slice(insn.pc, insn.nextPc)).map((byte) => hex(byte, 2)).join(' '),
    text: `len=${insn.length} ${fields}`.trim(),
  };
}

function decodeWindow(romBytes, start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    try {
      const insn = decodeInstruction(romBytes, pc, 'adl');
      rows.push(formatInsn(insn, romBytes));
      pc = insn.nextPc;
    } catch (error) {
      rows.push({
        address: hex(pc),
        bytes: hex(romBytes[pc] ?? 0, 2),
        text: `decode-error ${error.message}`,
      });
      pc += 1;
    }
  }
  return rows;
}

function targetHits(record, names) {
  const counts = record?.counts ?? {};
  return names.reduce((sum, name) => sum + (counts[name] ?? 0), 0);
}

function firstGate(record, target) {
  return (record?.gateSamples ?? []).find((sample) => sample.target === target) ?? null;
}

function routeSummary(record) {
  const tokenNames = [
    'outer08f3b8',
    'tokenReader090883',
    'tokenExit08f5e1',
    'tokenGate090992',
    'tokenStore09098e',
    'eolTuple08f54b',
  ];
  const lowNames = [
    'low006d38',
    'low006d4f',
    'low006d5d',
    'displaySeed013d11',
    'displayLoop0059c6',
    'lowBranch0013fc',
  ];
  return {
    label: record?.label ?? null,
    totalBlocks: record?.totalBlocks ?? 0,
    tokenHookHits: targetHits(record, tokenNames),
    lowPathHits: targetHits(record, lowNames),
    counts: {
      gate001872: record?.counts?.gate001872 ?? 0,
      clear001879: record?.counts?.clear001879 ?? 0,
      bypass0018af: record?.counts?.bypass0018af ?? 0,
      bypass0018d7: record?.counts?.bypass0018d7 ?? 0,
      bypass001881: record?.counts?.bypass001881 ?? 0,
      cleanup0018f8: record?.counts?.cleanup0018f8 ?? 0,
    },
    forcedPort03Events: record?.forcedPort03Events ?? [],
    samples: {
      gate001872: firstGate(record, 'gate001872'),
      clear001879: firstGate(record, 'clear001879'),
      bypass0018af: firstGate(record, 'bypass0018af'),
      bypass0018d7: firstGate(record, 'bypass0018d7'),
      bypass001881: firstGate(record, 'bypass001881'),
      cleanup0018f8: firstGate(record, 'cleanup0018f8'),
    },
    firstBlocks: record?.firstBlocks?.slice(0, 20) ?? [],
    hotBlocks: record?.hotBlocks?.slice(0, 12) ?? [],
    startFields: record?.start?.routeFields ?? null,
    endFields: record?.end?.routeFields ?? null,
  };
}

function scenarioSummary(scenario) {
  const key = scenario?.keyResults?.[0] ?? null;
  return {
    label: scenario?.label ?? null,
    replayOk: Boolean(scenario?.replayOk),
    errors: scenario?.errors ?? [],
    key: {
      label: key?.label ?? null,
      afterStatus: key?.afterState?.status ?? null,
      afterVramPixels: key?.afterState?.vramPixels ?? null,
      route: routeSummary(key?.record),
    },
  };
}

function sampleBrief(sample) {
  if (!sample) return 'none';
  const port03 = sample.lastIoByPort?.['0x0003'];
  const port07 = sample.lastIoByPort?.['0x0007'];
  const port09 = sample.lastIoByPort?.['0x0009'];
  const fields = sample.routeFields ?? {};
  const d0301b = fields.D0301B == null ? 'n/a' : hex(fields.D0301B);
  return [
    `${sample.target}@${sample.pc}#${sample.block}`,
    `AF=${sample.cpu?.af ?? 'n/a'}`,
    `Z=${sample.cpu?.flags?.z ?? 'n/a'}`,
    `C=${sample.cpu?.flags?.c ?? 'n/a'}`,
    `HL=${sample.cpu?.hl ?? 'n/a'}`,
    `DE=${sample.cpu?.de ?? 'n/a'}`,
    `BC=${sample.cpu?.bc ?? 'n/a'}`,
    `stack0=${sample.stack24?.[0]?.value ?? 'n/a'}`,
    `IY+42=${sample.iyFlags?.['IY+42']?.value ?? 'n/a'}`,
    `D0301B=${d0301b}`,
    `port03=${port03 ? `${port03.type}:${port03.value}@${port03.pc}` : 'none'}`,
    `port07=${port07 ? `${port07.type}:${port07.value}@${port07.pc}` : 'none'}`,
    `port09=${port09 ? `${port09.type}:${port09.value}@${port09.pc}` : 'none'}`,
  ].join('; ');
}

function markdownTable(rows) {
  return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function buildReport(summary, pass, staticRows) {
  const scenarios = (summary?.scenarios ?? []).map(scenarioSummary);
  const baseline = scenarios.find((scenario) => scenario.label === 'baseline-no-autorun-digit2') ?? scenarios[0];
  const forced = scenarios.find((scenario) => scenario.label === 'force-port03-bit4-no-autorun-digit2') ?? scenarios[1];
  const forcedEvent = forced?.key?.route?.forcedPort03Events?.[0] ?? null;
  const forcedCounts = forced?.key?.route?.counts ?? {};
  const conclusion = forcedCounts.bypass0018af > 0 && forcedCounts.bypass0018d7 > 0 && forcedCounts.bypass001881 > 0
    ? 'The port-bit4 bypass lands in a second cleanup setup path, not a cleanup skip. It sets port 0x07 bit4, checks IY+0x42, sets port 0x09 bit4, then compares D0301B against 0x5AA55A; because the comparison is NZ, it jumps to 0x001881 and reaches the same 0x0018F8 clear tail.'
    : 'The forced route did not capture the expected bypass chain; inspect raw scenario records before drawing a branch conclusion.';

  const lines = [
    '# Phase 662: Port-Bit4 Bypass Branch Decode',
    '',
    'Probe: `probe-phase662-bypass-branch-decode.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase662-bypass-branch-decode.mjs`',
    '',
    '## Summary',
    '',
    `- ${pass ? 'PASS' : 'FAIL'}: browser coldboot live-VAT route completed with baseline and forced first-port-read scenarios.`,
    `- Baseline: token/tail hits=${baseline?.key?.route?.tokenHookHits ?? 'n/a'}, low-path hits=${baseline?.key?.route?.lowPathHits ?? 'n/a'}, counts=${JSON.stringify(baseline?.key?.route?.counts ?? {})}.`,
    `- Forced: shim=${forcedEvent ? `${forcedEvent.raw}->${forcedEvent.forced} at ${forcedEvent.pc}#${forcedEvent.block}` : 'none'}, token/tail hits=${forced?.key?.route?.tokenHookHits ?? 'n/a'}, low-path hits=${forced?.key?.route?.lowPathHits ?? 'n/a'}, counts=${JSON.stringify(forcedCounts)}.`,
    `- Finding: ${conclusion}`,
    '- No browser-shell, runtime, transpiler, scheduler, or golden-regression-relevant source files were modified.',
    '',
    '## Dynamic Branch Samples',
    '',
    markdownTable([
      ['Scenario', '0x001872', '0x001879', '0x0018AF', '0x0018D7', '0x001881', '0x0018F8'],
      ['---', '---', '---', '---', '---', '---', '---'],
      [
        'Baseline',
        sampleBrief(baseline?.key?.route?.samples?.gate001872),
        sampleBrief(baseline?.key?.route?.samples?.clear001879),
        sampleBrief(baseline?.key?.route?.samples?.bypass0018af),
        sampleBrief(baseline?.key?.route?.samples?.bypass0018d7),
        sampleBrief(baseline?.key?.route?.samples?.bypass001881),
        sampleBrief(baseline?.key?.route?.samples?.cleanup0018f8),
      ],
      [
        'Forced',
        sampleBrief(forced?.key?.route?.samples?.gate001872),
        sampleBrief(forced?.key?.route?.samples?.clear001879),
        sampleBrief(forced?.key?.route?.samples?.bypass0018af),
        sampleBrief(forced?.key?.route?.samples?.bypass0018d7),
        sampleBrief(forced?.key?.route?.samples?.bypass001881),
        sampleBrief(forced?.key?.route?.samples?.cleanup0018f8),
      ],
    ]),
    '',
    '## Static Decode: 0x0018AF..0x0018F8',
    '',
    markdownTable([
      ['Address', 'Bytes', 'Instruction'],
      ['---', '---', '---'],
      ...staticRows.map((row) => [row.address, row.bytes, row.text.replaceAll('|', '\\|')]),
    ]),
    '',
    '## Shim Events',
    '',
    '```json',
    JSON.stringify(forced?.key?.route?.forcedPort03Events ?? [], null, 2),
    '```',
    '',
    '## Scenario Records',
    '',
    '```json',
    JSON.stringify({ scenarios, errors: summary?.errors ?? [], originalPass: summary?.pass }, null, 2),
    '```',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function makeProbeSource() {
  let source = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  source = replaceOnce(
    source,
    'const __dirname = import.meta.dirname;',
    `const __dirname = ${JSON.stringify(__dirname)};`,
  );
  source = replaceOnce(
    source,
    "const REPORT_PATH = path.join(__dirname, 'phase659-cleanup-gate-state.md');",
    "const REPORT_PATH = path.join(__dirname, 'phase662-bypass-branch-decode.md');",
  );
  source = replaceOnce(source, 'const debugPort = 9659;', 'const debugPort = 9662;');
  source = replaceOnce(
    source,
    "const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase659-'));",
    "const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase662-'));",
  );
  source = replaceOnce(
    source,
    `  gate001872: 0x001872,
  low006d38: 0x006D38,`,
    `  gate001872: 0x001872,
  bypass0018af: 0x0018AF,
  bypass0018d7: 0x0018D7,
  bypass001881: 0x001881,
  low006d38: 0x006D38,`,
  );
  source = replaceOnce(
    source,
    `  ['D0243D', 0xD0243D, 3],
  ['D02A40', 0xD02A40, 3],`,
    `  ['D0243D', 0xD0243D, 3],
  ['D0301B', 0xD0301B, 3],
  ['D02A40', 0xD02A40, 3],`,
  );
  source = replaceOnce(
    source,
    `  'gate0158f8',
  'gate001872',
  'clear001879',`,
    `  'gate0158f8',
  'gate001872',
  'bypass0018af',
  'bypass0018d7',
  'bypass001881',
  'clear001879',`,
  );
  source = replaceOnce(
    source,
    'function phase659InstallRouteIoHooks(record) {',
    `window.__phase662 = window.__phase662 || { forceFirstPort03Bit4: false };

function phase659InstallRouteIoHooks(record) {`,
  );
  source = replaceOnce(
    source,
    '    previousIoHooks: null,\n    lastFields: phase657ReadRouteFields(),',
    `    previousIoHooks: null,
    previousPeripheralRead: null,
    peripheralReadShimInstalled: false,
    forceFirstPort03Bit4: Boolean(window.__phase662?.forceFirstPort03Bit4),
    forcePort03Used: false,
    forcedPort03Events: [],
    lastFields: phase657ReadRouteFields(),`,
  );
  source = replaceOnce(
    source,
    `  record.previousIoHooks = {
    read: cpu.onIoRead,
    write: cpu.onIoWrite,
  };`,
    `  record.previousIoHooks = {
    read: cpu.onIoRead,
    write: cpu.onIoWrite,
  };
  if (peripherals?.read && !record.peripheralReadShimInstalled) {
    record.previousPeripheralRead = peripherals.read.bind(peripherals);
    peripherals.read = (port) => {
      const raw = record.previousPeripheralRead(port);
      const normalizedPort = port & 0xFFFF;
      if (record.forceFirstPort03Bit4
        && !record.forcePort03Used
        && normalizedPort === 0x0003
        && record.currentBlockPc === '0x001872') {
        const forced = raw | 0x10;
        record.forcePort03Used = true;
        record.forcedPort03Events.push({
          block: record.totalBlocks,
          pc: record.currentBlockPc,
          port: phase657Hex(normalizedPort, 4),
          raw: phase657Hex(raw, 2),
          forced: phase657Hex(forced, 2),
          stack24: phase657ReadStack24(8),
          cpuBefore: phase659CpuState(),
        });
        return forced;
      }
      return raw;
    };
    record.peripheralReadShimInstalled = true;
  }`,
  );
  source = replaceOnce(
    source,
    `  cpu.onIoRead = record.previousIoHooks.read;
  cpu.onIoWrite = record.previousIoHooks.write;`,
    `  cpu.onIoRead = record.previousIoHooks.read;
  cpu.onIoWrite = record.previousIoHooks.write;
  if (record.previousPeripheralRead && peripherals?.read) {
    peripherals.read = record.previousPeripheralRead;
  }`,
  );
  source = replaceOnce(
    source,
    `async function runKeyRoute(socket, scenarioLabel, key, replayBeforeEachKey) {
  const preReplay = replayBeforeEachKey ? await replaySnapshot(socket, \`\${scenarioLabel}-\${key.id}-prekey-replay\`) : null;`,
    `async function runKeyRoute(socket, scenarioLabel, key, replayBeforeEachKey) {
  await evalExpr(socket, \`(() => {
    window.__phase662 = window.__phase662 || {};
    window.__phase662.forceFirstPort03Bit4 = \${JSON.stringify(scenarioLabel.includes('force-port03-bit4'))};
    return window.__phase662.forceFirstPort03Bit4;
  })()\`);
  const preReplay = replayBeforeEachKey ? await replaySnapshot(socket, \`\${scenarioLabel}-\${key.id}-prekey-replay\`) : null;`,
  );
  source = replaceOnce(
    source,
    "    { label: 'no-autorun-digit2', autoRun: false, replayBeforeEachKey: false, keys: [keys.digit2] },",
    "    { label: 'baseline-no-autorun-digit2', autoRun: false, replayBeforeEachKey: false, keys: [keys.digit2] },\n    { label: 'force-port03-bit4-no-autorun-digit2', autoRun: false, replayBeforeEachKey: false, keys: [keys.digit2] },",
  );
  source = replaceOnce(
    source,
    "probe: 'phase659-cleanup-gate-state',",
    "probe: 'phase662-bypass-branch-decode',",
  );
  source = replaceOnce(
    source,
    "    probe: 'phase659-cleanup-gate-state',",
    "    probe: 'phase662-bypass-branch-decode',",
  );
  return `${source}\nexport { summary };\n`;
}

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const staticRows = decodeWindow(romBytes, 0x0018AF, 0x0018F8);
const source = makeProbeSource();
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const mod = await import(moduleUrl);
const summary = mod.summary;
const scenarios = (summary?.scenarios ?? []).map(scenarioSummary);
const baseline = scenarios.find((scenario) => scenario.label === 'baseline-no-autorun-digit2');
const forced = scenarios.find((scenario) => scenario.label === 'force-port03-bit4-no-autorun-digit2');
const forcedCounts = forced?.key?.route?.counts ?? {};
const pass = Boolean(
  summary
    && (summary.errors ?? []).length === 0
    && baseline?.replayOk
    && forced?.replayOk
    && forced.key.route.forcedPort03Events.length === 1
    && forcedCounts.bypass0018af > 0
    && forcedCounts.bypass0018d7 > 0
    && forcedCounts.bypass001881 > 0
    && forcedCounts.cleanup0018f8 > 0
);

fs.writeFileSync(REPORT_PATH, buildReport(summary, pass, staticRows));
console.log(JSON.stringify({
  probe: 'phase662-bypass-branch-decode',
  pass,
  baseline: baseline?.key?.route?.counts,
  forced: forced?.key?.route?.counts,
  forcedEvent: forced?.key?.route?.forcedPort03Events?.[0] ?? null,
}, null, 2));

process.exitCode = pass ? 0 : 1;

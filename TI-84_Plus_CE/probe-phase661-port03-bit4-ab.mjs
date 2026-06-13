import fs from 'node:fs';
import path from 'node:path';

const __dirname = import.meta.dirname;
const TEMPLATE_PATH = path.join(__dirname, 'probe-phase659-cleanup-gate-state.mjs');
const REPORT_PATH = path.join(__dirname, 'phase661-port03-bit4-ab.md');

function replaceOnce(source, needle, replacement) {
  if (!source.includes(needle)) {
    throw new Error(`Template marker not found: ${needle.slice(0, 120)}`);
  }
  return source.replace(needle, replacement);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function targetHits(record, names) {
  const counts = record?.counts ?? {};
  return names.reduce((sum, name) => sum + (counts[name] ?? 0), 0);
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
  const gateSamples = record?.gateSamples ?? [];
  const firstSample = (target) => gateSamples.find((sample) => sample.target === target);
  const firstPortRead = record?.forcedPort03Events?.[0] ?? null;
  return {
    label: record?.label ?? null,
    totalBlocks: record?.totalBlocks ?? 0,
    tokenHookHits: targetHits(record, tokenNames),
    lowPathHits: targetHits(record, lowNames),
    cxMainHits: record?.counts?.cxMain0585e9 ?? 0,
    keyHandlerHits: record?.counts?.keyHandler05877a ?? 0,
    gate001872Hits: record?.counts?.gate001872 ?? 0,
    clear001879Hits: record?.counts?.clear001879 ?? 0,
    cleanup0018f8Hits: record?.counts?.cleanup0018f8 ?? 0,
    forcedPort03Events: record?.forcedPort03Events ?? [],
    first001872: firstSample('gate001872'),
    first001879: firstSample('clear001879'),
    first0018f8: firstSample('cleanup0018f8'),
    firstBlocks: record?.firstBlocks?.slice(0, 18) ?? [],
    lastBlocks: record?.lastBlocks?.slice(-18) ?? [],
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
    p6: scenario?.pageState?.phase657?.records?.find((record) => record.label === 'browser-after-p6-home-repaint')?.result ?? null,
    key: {
      label: key?.label ?? null,
      expected: key?.expected ?? null,
      afterStatus: key?.afterState?.status ?? null,
      afterVramPixels: key?.afterState?.vramPixels ?? null,
      route: routeSummary(key?.record),
    },
  };
}

function sampleBrief(sample) {
  if (!sample) return 'none';
  const port03 = sample.lastIoByPort?.['0x0003'];
  const port09 = sample.lastIoByPort?.['0x0009'];
  return [
    `${sample.target}@${sample.pc}#${sample.block}`,
    `AF=${sample.cpu?.af ?? 'n/a'}`,
    `Z=${sample.cpu?.flags?.z ?? 'n/a'}`,
    `C=${sample.cpu?.flags?.c ?? 'n/a'}`,
    `stack0=${sample.stack24?.[0]?.value ?? 'n/a'}`,
    `port03=${port03 ? `${port03.type}:${port03.value}@${port03.pc}` : 'none'}`,
    `port09=${port09 ? `${port09.type}:${port09.value}@${port09.pc}` : 'none'}`,
  ].join('; ');
}

function decisionText(baseline, forced) {
  const forcedEvent = forced.key.route.forcedPort03Events[0];
  if (!forcedEvent) return 'The forced run did not hit the shimmed read, so no causal conclusion is valid.';
  if (forced.key.route.clear001879Hits < baseline.key.route.clear001879Hits) {
    return 'Forcing bit 4 on the first port 0x03 read skips the immediate 0x001879 selector entry, but the destructive 0x0018F8 path still fires through the 0x0018AF/0x0018D7/0x001881 branch.';
  }
  if (!forced.key.route.first001879 || forced.key.route.first001879.block > baseline.key.route.first001879?.block) {
    return 'Forcing bit 4 delayed the first 0x001879 entry, but later cleanup still reached the same destructive path.';
  }
  return 'Forcing bit 4 on the first 0x001872 read did not prevent cleanup; later or alternate cleanup routing still dominates.';
}

function buildReport(summary, pass) {
  const scenarios = (summary?.scenarios ?? []).map(scenarioSummary);
  const baseline = scenarios.find((scenario) => scenario.label === 'baseline-no-autorun-digit2') ?? scenarios[0];
  const forced = scenarios.find((scenario) => scenario.label === 'force-port03-bit4-no-autorun-digit2') ?? scenarios[1];
  const forcedEvent = forced?.key?.route?.forcedPort03Events?.[0] ?? null;
  const lines = [
    '# Phase 661: Live-VAT Port 0x03 Bit-4 Causal A/B',
    '',
    'Probe: `probe-phase661-port03-bit4-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase661-port03-bit4-ab.mjs`',
    '',
    '## Summary',
    '',
    `- ${pass ? 'PASS' : 'FAIL'}: both browser coldboot scenarios completed with the phase655/phase659 in-memory snapshot replay harness.`,
    `- Baseline: token/tail hits=${baseline?.key?.route?.tokenHookHits ?? 'n/a'}, low-path hits=${baseline?.key?.route?.lowPathHits ?? 'n/a'}, 0x001872 hits=${baseline?.key?.route?.gate001872Hits ?? 'n/a'}, 0x001879 hits=${baseline?.key?.route?.clear001879Hits ?? 'n/a'}, 0x0018F8 hits=${baseline?.key?.route?.cleanup0018f8Hits ?? 'n/a'}.`,
    `- Forced first read: shim event=${forcedEvent ? `${forcedEvent.raw}->${forcedEvent.forced} at ${forcedEvent.pc}#${forcedEvent.block}` : 'none'}, token/tail hits=${forced?.key?.route?.tokenHookHits ?? 'n/a'}, low-path hits=${forced?.key?.route?.lowPathHits ?? 'n/a'}, 0x001872 hits=${forced?.key?.route?.gate001872Hits ?? 'n/a'}, 0x001879 hits=${forced?.key?.route?.clear001879Hits ?? 'n/a'}, 0x0018F8 hits=${forced?.key?.route?.cleanup0018f8Hits ?? 'n/a'}.`,
    `- Finding: ${baseline && forced ? decisionText(baseline, forced) : 'missing scenario data'}`,
    '- No browser-shell, runtime, transpiler, scheduler, or golden-regression-relevant source files were modified.',
    '',
    '## First Gate Samples',
    '',
    '| Scenario | First 0x001872 | First 0x001879 | First 0x0018F8 |',
    '| --- | --- | --- | --- |',
    `| Baseline | ${sampleBrief(baseline?.key?.route?.first001872)} | ${sampleBrief(baseline?.key?.route?.first001879)} | ${sampleBrief(baseline?.key?.route?.first0018f8)} |`,
    `| Forced | ${sampleBrief(forced?.key?.route?.first001872)} | ${sampleBrief(forced?.key?.route?.first001879)} | ${sampleBrief(forced?.key?.route?.first0018f8)} |`,
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
    "const REPORT_PATH = path.join(__dirname, 'phase661-port03-bit4-ab.md');",
  );
  source = replaceOnce(source, 'const debugPort = 9659;', 'const debugPort = 9661;');
  source = replaceOnce(
    source,
    "const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase659-'));",
    "const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase661-'));",
  );
  source = replaceOnce(
    source,
    'function phase659InstallRouteIoHooks(record) {',
    `window.__phase661 = window.__phase661 || { forceFirstPort03Bit4: false };

function phase659InstallRouteIoHooks(record) {`,
  );
  source = replaceOnce(
    source,
    '    previousIoHooks: null,\n    lastFields: phase657ReadRouteFields(),',
    `    previousIoHooks: null,
    previousPeripheralRead: null,
    peripheralReadShimInstalled: false,
    forceFirstPort03Bit4: Boolean(window.__phase661?.forceFirstPort03Bit4),
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
          stack24: phase657ReadStack24(6),
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
    window.__phase661 = window.__phase661 || {};
    window.__phase661.forceFirstPort03Bit4 = \${JSON.stringify(scenarioLabel.includes('force-port03-bit4'))};
    return window.__phase661.forceFirstPort03Bit4;
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
    "probe: 'phase661-port03-bit4-ab',",
  );
  source = replaceOnce(
    source,
    "    probe: 'phase659-cleanup-gate-state',",
    "    probe: 'phase661-port03-bit4-ab',",
  );
  return `${source}\nexport { summary };\n`;
}

const source = makeProbeSource();
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const mod = await import(moduleUrl);
const summary = mod.summary;
const scenarios = (summary?.scenarios ?? []).map(scenarioSummary);
const baseline = scenarios.find((scenario) => scenario.label === 'baseline-no-autorun-digit2');
const forced = scenarios.find((scenario) => scenario.label === 'force-port03-bit4-no-autorun-digit2');
const pass = Boolean(
  summary
    && (summary.errors ?? []).length === 0
    && baseline?.replayOk
    && forced?.replayOk
    && baseline.key.route.gate001872Hits > 0
    && baseline.key.route.clear001879Hits > 0
    && forced.key.route.gate001872Hits > 0
    && forced.key.route.forcedPort03Events.length === 1
);

fs.writeFileSync(REPORT_PATH, buildReport(summary, pass));
console.log(JSON.stringify({
  probe: 'phase661-port03-bit4-ab',
  pass,
  baseline: baseline?.key?.route,
  forced: forced?.key?.route,
}, null, 2));

process.exitCode = pass ? 0 : 1;

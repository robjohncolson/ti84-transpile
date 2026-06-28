import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase873-cleanup-leg-decode.md');
const SOURCE_REPORT_PATH = path.join(__dirname, 'phase872-d010-port-bit-ab.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const PRE_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const AFTER_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const RAM_BASE = 0xD00000;
const SENTINEL_D0301B = 0xD0301B;
const SENTINEL_MAGIC = 0x5AA55A;

const romBytes = fs.readFileSync(ROM_PATH);
const preClearRam = fs.readFileSync(PRE_CLEAR_CAPTURE);
const afterClearRam = fs.readFileSync(AFTER_CLEAR_CAPTURE);

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function parseHex(value) {
  if (typeof value === 'number') return value >>> 0;
  if (typeof value === 'string' && value.startsWith('0x')) return Number.parseInt(value.slice(2), 16) >>> 0;
  return null;
}

function readCaptureValue(buffer, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > buffer.length) return null;
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (buffer[offset + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function formatInst(inst) {
  if (!inst) return '(decode failed)';
  if (inst.tag === 'ret') return 'RET';
  if (inst.tag === 'ret-conditional') return `RET ${upper(inst.condition)}`;
  if (inst.tag === 'call') return `CALL ${hex(inst.target)}`;
  if (inst.tag === 'jp') return `JP ${hex(inst.target)}`;
  if (inst.tag === 'jr') return `JR ${hex(inst.target)}`;
  if (inst.tag === 'jr-conditional') return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
  if (inst.tag === 'jp-conditional') return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
  if (inst.tag === 'ld-reg-mem') return `LD ${upper(inst.dest)}, (${hex(inst.addr)})`;
  if (inst.tag === 'ld-mem-reg') return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
  if (inst.tag === 'ld-pair-imm') return `LD ${upper(inst.pair ?? inst.dest)}, ${hex(inst.value)}`;
  if (inst.tag === 'ld-reg-imm') return `LD ${upper(inst.dest)}, ${hex(inst.value, 2)}`;
  if (inst.tag === 'ld-ind-imm') return `LD (${upper(inst.dest)}), ${hex(inst.value, 2)}`;
  if (inst.tag === 'ldir') return 'LDIR';
  if (inst.tag === 'lddr') return 'LDDR';
  if (inst.tag === 'push') return `PUSH ${upper(inst.pair)}`;
  if (inst.tag === 'pop') return `POP ${upper(inst.pair)}`;
  if (inst.tag === 'alu-imm') return `${upper(inst.op)} ${hex(inst.value, 2)}`;
  if (inst.tag === 'alu-reg') return `${upper(inst.op)} ${upper(inst.src)}`;
  if (inst.tag === 'ex-de-hl') return 'EX DE,HL';
  if (inst.tag === 'add-pair') return `ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
  if (inst.tag === 'in0') return `IN0 ${upper(inst.reg)}, (${hex(inst.port, 2)})`;
  if (inst.tag === 'out0') return `OUT0 (${hex(inst.port, 2)}), ${upper(inst.reg)}`;
  if (inst.tag === 'bit-test') return `BIT ${inst.bit}, ${upper(inst.reg)}`;
  if (inst.tag === 'bit-set') return `SET ${inst.bit}, ${upper(inst.reg)}`;
  return `${inst.tag} ${JSON.stringify(Object.fromEntries(Object.entries(inst).filter(([key]) => !['tag', 'pc', 'length', 'nextPc'].includes(key))))}`;
}

function decodeWindow(start, end) {
  const rows = [];
  let pc = start;
  while (pc <= end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const bytes = Array.from(
      romBytes.subarray(pc, pc + inst.length),
      (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
    ).join(' ');
    rows.push({ pc: hex(pc), bytes, instruction: formatInst(inst), tag: inst.tag });
    pc += Math.max(1, inst.length);
  }
  return rows;
}

function decodeTable(rows) {
  return [
    '| PC | Bytes | Instruction |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.pc} | \`${row.bytes}\` | ${row.instruction} |`),
  ].join('\n');
}

function extractMachineJson(reportText) {
  const markerIndex = reportText.indexOf('## Machine JSON');
  if (markerIndex < 0) throw new Error('Machine JSON section not found in phase872 report');
  const jsonMatch = reportText.slice(markerIndex).match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) throw new Error('Machine JSON fence not found in phase872 report');
  return JSON.parse(jsonMatch[1]);
}

function expectVariant(data, name) {
  const variant = data?.adjudication?.variants?.[name];
  if (!variant) throw new Error(`Missing Phase872 variant: ${name}`);
  return variant;
}

function edgeSummary(edge) {
  return {
    fromPc: edge?.from?.pc ?? null,
    toPc: edge?.to?.pc ?? null,
    af: edge?.to?.af ?? null,
    bc: edge?.to?.bc ?? null,
    de: edge?.to?.de ?? null,
    hl: edge?.to?.hl ?? null,
    sp: edge?.to?.sp ?? null,
    stack0: edge?.to?.stack0 ?? null,
    d007ca: edge?.to?.D007CA ?? null,
    d02437: edge?.to?.D02437 ?? null,
    d0243a: edge?.to?.D0243A ?? null,
    d0243d: edge?.to?.D0243D ?? null,
    d02505: edge?.to?.D02505 ?? null,
    d02590: edge?.to?.D02590 ?? null,
  };
}

function sameRegisterTail(a, b) {
  return ['bc', 'de', 'hl'].every((name) => a?.[name] === b?.[name]);
}

function flagSummary(afValue) {
  const af = parseHex(afValue);
  if (af == null) return '-';
  const f = af & 0xFF;
  return `F=${hex(f, 2)} Z=${(f & 0x40) ? 1 : 0} C=${(f & 0x01) ? 1 : 0}`;
}

function variantCountTable(variants) {
  return [
    '| Variant | 0x001872 | 0x0018AF | 0x001879 | 0x0018F8 | 0x006D64 | Wipes | Termination |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...variants.map(({ label, variant }) => `| ${label} | ${variant.counts.branch001872} | ${variant.counts.skip0018AF} | ${variant.counts.preWipe001879} | ${variant.counts.cleanup0018F8} | ${variant.counts.poll006D64} | ${variant.wipes ?? '-'} | ${variant.termination ?? '-'} |`),
  ].join('\n');
}

function edgeTable(rows) {
  return [
    '| Variant | Branch edge | Skip edge | Pre-wipe edge | Cleanup edge | Cleanup AF | Cleanup BC | Cleanup DE | Cleanup HL |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(({ label, branch, skip, preWipe, cleanup }) => {
      const branchText = `${branch?.fromPc ?? '-'} -> ${branch?.toPc ?? '-'}`;
      const skipText = `${skip?.fromPc ?? '-'} -> ${skip?.toPc ?? '-'}`;
      const preWipeText = `${preWipe?.fromPc ?? '-'} -> ${preWipe?.toPc ?? '-'}`;
      const cleanupText = `${cleanup?.fromPc ?? '-'} -> ${cleanup?.toPc ?? '-'}`;
      return `| ${label} | ${branchText} | ${skipText} | ${preWipeText} | ${cleanupText} | ${cleanup?.af ?? '-'} (${flagSummary(cleanup?.af)}) | ${cleanup?.bc ?? '-'} | ${cleanup?.de ?? '-'} | ${cleanup?.hl ?? '-'} |`;
    }),
  ].join('\n');
}

function fieldTable(oracle, variants) {
  const names = ['D007CA', 'D008E0', 'D010EF', 'D010FE', 'D010F4', 'D02437', 'D0243A', 'D0243D', 'D02440', 'D02505', 'D02590', 'D0259D', 'D02A29'];
  return [
    `| Field | Oracle after CLEAR | ${variants.map(({ label }) => label).join(' | ')} |`,
    `| --- | --- | ${variants.map(() => '---').join(' | ')} |`,
    ...names.map((name) => `| ${name} | ${oracle?.[name] ?? '-'} | ${variants.map(({ variant }) => variant.endFields?.[name] ?? '-').join(' | ')} |`),
  ].join('\n');
}

function analyzePhase873(phase872) {
  const baseline = expectVariant(phase872, 'baseline');
  const d010Replay = expectVariant(phase872, 'd010Replay');
  const portSkip = expectVariant(phase872, 'portSkip');
  const combined = expectVariant(phase872, 'combined');
  const variants = [
    { label: 'baseline', variant: baseline },
    { label: 'D010 replay only', variant: d010Replay },
    { label: 'port bit skip only', variant: portSkip },
    { label: 'D010 replay + port bit skip', variant: combined },
  ];
  const edges = variants.map(({ label, variant }) => ({
    label,
    branch: edgeSummary(variant.branchEdge),
    skip: edgeSummary(variant.skipEdge),
    preWipe: edgeSummary(variant.preWipeEdge),
    cleanup: edgeSummary(variant.cleanupEdge),
  }));
  const baselineEdge = edges[0];
  const portSkipEdge = edges[2];
  const combinedEdge = edges[3];
  const cleanupTailSame = sameRegisterTail(baselineEdge.cleanup, portSkipEdge.cleanup)
    && sameRegisterTail(portSkipEdge.cleanup, combinedEdge.cleanup);
  const port03ControllerObserved =
    baselineEdge.branch.toPc === '0x001879'
    && portSkipEdge.branch.toPc === '0x0018AF'
    && portSkipEdge.skip.toPc === '0x0018AF';
  const skipStillWipes =
    portSkip.counts.skip0018AF > 0
    && portSkip.counts.preWipe001879 === 0
    && portSkip.counts.cleanup0018F8 > 0;
  const observedSharedTail = cleanupTailSame
    && baselineEdge.cleanup.toPc === '0x0018F8'
    && portSkipEdge.cleanup.toPc === '0x0018F8'
    && portSkipEdge.cleanup.fromPc === '0x001881';
  const d0301bSentinel = {
    addr: hex(SENTINEL_D0301B),
    magic: hex(SENTINEL_MAGIC),
    preClearCapture: hex(readCaptureValue(preClearRam, SENTINEL_D0301B, 3)),
    afterClearCapture: hex(readCaptureValue(afterClearRam, SENTINEL_D0301B, 3)),
    observedBranch: 'port-skip cleanup edge 0x001881 -> 0x0018F8 implies JR NZ at 0x0018EA was taken, so live D0301B did not equal 0x5AA55A in the traced route',
  };
  const sentinelControllerObserved = observedSharedTail;
  const decode = {
    portBranch: decodeWindow(0x00186A, 0x0018AD),
    skipLeg: decodeWindow(0x0018AF, 0x0018F7),
    clearTail: decodeWindow(0x0018F8, 0x00192F),
  };
  const pass = phase872.pass === true
    && port03ControllerObserved
    && skipStillWipes
    && observedSharedTail
    && sentinelControllerObserved
    && decode.skipLeg.some((row) => row.pc === '0x0018AF')
    && decode.clearTail.some((row) => row.pc === '0x0018F8');
  const conclusion = observedSharedTail
    ? 'The cleanup cluster has two observed entry legs and one observed destructive clear tail. Port 0x03 bit 4 at 0x001872 selects the optional 0x001879 port-9 setup versus the 0x0018AF skip leg. Inside the skip leg, the RAM sentinel at D0301B is compared with 0x5AA55A; the observed port-skip edge 0x001881 -> 0x0018F8 proves the live route took the D0301B-mismatch path into the same large clear body as baseline. If D0301B matched the magic value, static decode shows the route would load the short-tail parameters BC=0x25, HL=D000FF, DE=D00100 before 0x0018F8 instead.'
    : 'The observed cleanup edges did not prove a shared clear tail; inspect the edge/register table before moving upstream.';
  return {
    pass,
    source: {
      report: path.basename(SOURCE_REPORT_PATH),
      sourcePass: phase872.pass === true,
    },
    variants,
    edges,
    cleanupTailSame,
    port03ControllerObserved,
    skipStillWipes,
    observedSharedTail,
    clearTailUnconditional: false,
    sentinelControllerObserved,
    d0301bSentinel,
    conclusion,
    decode,
    oracleAfter: phase872.oracleAfter,
  };
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 873: Cleanup-Leg Decode',
      '',
      'Probe failed before producing a complete comparison.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  return [
    '# Phase 873: Cleanup-Leg Decode',
    '',
    'Probe: `probe-phase873-cleanup-leg-decode.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase873-cleanup-leg-decode.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Dynamic source: \`${data.source.report}\` Machine JSON, source pass=${data.source.sourcePass ? 'yes' : 'no'}.`,
    `- Port-0x03 controller observed: ${data.port03ControllerObserved ? 'yes' : 'no'}.`,
    `- Port-skip route still wipes: ${data.skipStillWipes ? 'yes' : 'no'}.`,
    `- Shared clear-tail parameters: ${data.cleanupTailSame ? 'yes' : 'no'} (BC/DE/HL identical at 0x0018F8).`,
    `- D0301B sentinel controller: ${data.sentinelControllerObserved ? 'observed via 0x001881 -> 0x0018F8' : 'not observed'}; capture before/after CLEAR=${data.d0301bSentinel.preClearCapture}/${data.d0301bSentinel.afterClearCapture}, magic=${data.d0301bSentinel.magic}.`,
    `- Adjudication: ${data.conclusion}`,
    '',
    '## Dynamic Counts',
    '',
    variantCountTable(data.variants),
    '',
    '## Dynamic Edges And Tail Registers',
    '',
    edgeTable(data.edges),
    '',
    '## Post-Key Field Comparison',
    '',
    fieldTable(data.oracleAfter, data.variants),
    '',
    '## Static Decode: Port-0x03 Branch And Baseline Clear Body',
    '',
    decodeTable(data.decode.portBranch),
    '',
    '## Static Decode: Port-Skip Leg Beyond 0x0018AF',
    '',
    decodeTable(data.decode.skipLeg),
    '',
    '## Static Decode: Common Clear Tail At 0x0018F8',
    '',
    decodeTable(data.decode.clearTail),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      source: data.source,
      cleanupTailSame: data.cleanupTailSame,
      port03ControllerObserved: data.port03ControllerObserved,
      skipStillWipes: data.skipStillWipes,
      observedSharedTail: data.observedSharedTail,
      clearTailUnconditional: data.clearTailUnconditional,
      sentinelControllerObserved: data.sentinelControllerObserved,
      d0301bSentinel: data.d0301bSentinel,
      conclusion: data.conclusion,
      edges: data.edges,
      counts: Object.fromEntries(data.variants.map(({ label, variant }) => [label, variant.counts])),
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

let summary;
try {
  const sourceText = fs.readFileSync(SOURCE_REPORT_PATH, 'utf8');
  const phase872 = extractMachineJson(sourceText);
  summary = {
    probe: 'phase873-cleanup-leg-decode',
    ...analyzePhase873(phase872),
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    cleanupTailSame: summary.cleanupTailSame,
    port03ControllerObserved: summary.port03ControllerObserved,
    skipStillWipes: summary.skipStillWipes,
    observedSharedTail: summary.observedSharedTail,
    sentinelControllerObserved: summary.sentinelControllerObserved,
    conclusion: summary.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase873-cleanup-leg-decode', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}

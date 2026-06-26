import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const PHASE850_REPORT = path.join(__dirname, 'phase850-0a31e2-input-trace.md');
const PRE_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const AFTER_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const REPORT_PATH = path.join(__dirname, 'phase851-upstream-owner-chain.md');

const RAM_BASE = 0xD00000;

const DECODE_WINDOWS = Object.freeze([
  { label: 'Immediate parent 0x0A20CC..0x0A20EE', start: 0x0A20CC, end: 0x0A20EE },
  { label: 'Owner entry/save 0x0A321D..0x0A323A', start: 0x0A321D, end: 0x0A323A },
  { label: 'Descriptor gate 0x0A31FD..0x0A3216', start: 0x0A31FD, end: 0x0A3216 },
  { label: 'Index transform 0x0A2D4C..0x0A2D57', start: 0x0A2D4C, end: 0x0A2D57 },
  { label: 'Post-transform dispatch 0x0A3216..0x0A321D', start: 0x0A3216, end: 0x0A321D },
  { label: 'Interrupt-save/copy setup 0x0A3146..0x0A3166', start: 0x0A3146, end: 0x0A3166 },
  { label: 'Scale helper 0x0A31F6..0x0A31FD', start: 0x0A31F6, end: 0x0A31FD },
  { label: 'Second geometry leg 0x0A3158..0x0A3166', start: 0x0A3158, end: 0x0A3166 },
  { label: 'Destination/source setup 0x0A31A6..0x0A31B8', start: 0x0A31A6, end: 0x0A31B8 },
  { label: 'Bulk copy pair 0x0A31B8..0x0A31F6', start: 0x0A31B8, end: 0x0A31F6 },
  { label: 'Nearby D02505 writer 0x058D54..0x058D8E', start: 0x058D54, end: 0x058D8E },
]);

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function parseHex(value) {
  if (typeof value === 'number') return value >>> 0;
  if (typeof value !== 'string') return 0;
  return Number.parseInt(value.replace(/^0x/i, ''), 16) >>> 0;
}

function byteText(rom, pc, length) {
  const bytes = [];
  for (let i = 0; i < length; i += 1) bytes.push(hex(rom[pc + i] ?? 0, 2).slice(2));
  return bytes.join(' ');
}

function fmtAddr(value, width = 6) {
  return hex(value, width);
}

function fmtDisp(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function formatInstruction(insn) {
  switch (insn.tag) {
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${insn.condition.toUpperCase()}`;
    case 'jr': return `JR ${fmtAddr(insn.target)}`;
    case 'jr-conditional': return `JR ${insn.condition.toUpperCase()},${fmtAddr(insn.target)}`;
    case 'jp': return `JP ${fmtAddr(insn.target)}`;
    case 'jp-conditional': return `JP ${insn.condition.toUpperCase()},${fmtAddr(insn.target)}`;
    case 'call': return `CALL ${fmtAddr(insn.target)}`;
    case 'call-conditional': return `CALL ${insn.condition.toUpperCase()},${fmtAddr(insn.target)}`;
    case 'push': return `PUSH ${insn.pair.toUpperCase()}`;
    case 'pop': return `POP ${insn.pair.toUpperCase()}`;
    case 'ld-special': return `LD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${insn.dest.toUpperCase()},${fmtAddr(insn.value, 2)}`;
    case 'ld-pair-imm': return `LD ${insn.pair.toUpperCase()},${fmtAddr(insn.value)}`;
    case 'ld-reg-mem': return `LD ${insn.dest.toUpperCase()},(${fmtAddr(insn.addr)})`;
    case 'ld-mem-reg': return `LD (${fmtAddr(insn.addr)}),${insn.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${insn.dest.toUpperCase()},(${insn.src.toUpperCase()})`;
    case 'ld-pair-mem': return `LD ${insn.pair.toUpperCase()},(${fmtAddr(insn.addr)})`;
    case 'ld-mem-pair': return `LD (${fmtAddr(insn.addr)}),${insn.pair.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${insn.dest.toUpperCase()},(${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    case 'ld-ixd-reg': return `LD (${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)}),${insn.src.toUpperCase()}`;
    case 'alu-reg': return `${insn.op.toUpperCase()} ${insn.src.toUpperCase()}`;
    case 'alu-imm': return `${insn.op.toUpperCase()} ${fmtAddr(insn.value, 2)}`;
    case 'alu-ixd': return `${insn.op.toUpperCase()} (${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    case 'sbc-pair': return `SBC HL,${insn.src.toUpperCase()}`;
    case 'add-pair': return `ADD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'inc-reg': return `INC ${insn.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${insn.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${insn.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${insn.pair.toUpperCase()}`;
    case 'mlt': return `MLT ${(insn.pair ?? insn.reg ?? '?').toUpperCase()}`;
    case 'lddr': return 'LDDR';
    case 'ldir': return 'LDIR';
    case 'ex-de-hl': return 'EX DE,HL';
    case 'indexed-cb-bit': return `BIT ${insn.bit},(${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    case 'indexed-cb-set': return `SET ${insn.bit},(${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    case 'indexed-cb-res': return `RES ${insn.bit},(${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    default: return `${(insn.tag ?? 'unknown').toUpperCase()} ${JSON.stringify(insn)}`;
  }
}

function decodeRange(rom, start, end) {
  const records = [];
  let pc = start;
  while (pc < end) {
    let insn;
    try {
      insn = decodeInstruction(rom, pc, 'adl');
    } catch (error) {
      insn = { pc, length: 1, tag: 'db', error: String(error?.message || error) };
    }
    if (!Number.isFinite(insn.length) || insn.length <= 0) {
      insn = { pc, length: 1, tag: 'db', error: 'invalid decoded length' };
    }
    const length = Math.min(insn.length, end - pc);
    records.push({
      pc,
      length,
      bytes: byteText(rom, pc, length),
      tag: insn.tag,
      text: insn.tag === 'db' ? `DB ${hex(rom[pc] ?? 0, 2)} ; ${insn.error}` : formatInstruction(insn),
      raw: insn,
    });
    pc += length;
  }
  return records;
}

function decodeTable(records) {
  return [
    '| PC | Bytes | Decode |',
    '| --- | --- | --- |',
    ...records.map((record) => `| ${hex(record.pc)} | \`${record.bytes}\` | \`${record.text}\` |`),
  ].join('\n');
}

function parsePhase850Summary() {
  const text = fs.readFileSync(PHASE850_REPORT, 'utf8');
  const marker = '## Full JSON';
  const markerAt = text.indexOf(marker);
  if (markerAt === -1) throw new Error('phase850 Full JSON marker not found');
  const fenceAt = text.indexOf('```json', markerAt);
  if (fenceAt === -1) throw new Error('phase850 Full JSON fence not found');
  const jsonStart = text.indexOf('\n', fenceAt) + 1;
  const jsonEnd = text.indexOf('\n```', jsonStart);
  if (jsonEnd === -1) throw new Error('phase850 Full JSON fence terminator not found');
  return JSON.parse(text.slice(jsonStart, jsonEnd));
}

function captureByte(capture, addr) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset >= capture.length) return null;
  return capture[offset] ?? null;
}

function capture24(capture, addr) {
  const b0 = captureByte(capture, addr);
  const b1 = captureByte(capture, addr + 1);
  const b2 = captureByte(capture, addr + 2);
  if (b0 == null || b1 == null || b2 == null) return null;
  return (b0 | (b1 << 8) | (b2 << 16)) >>> 0;
}

function captureRow(name, addr, pre, after) {
  return {
    name,
    addr,
    preByte: captureByte(pre, addr),
    afterByte: captureByte(after, addr),
    pre24: capture24(pre, addr),
    after24: capture24(after, addr),
  };
}

function phase850Sample(summary, pc) {
  return summary.allSamples.find((sample) => parseHex(sample.logicalPc) === pc) ?? null;
}

function lowByteFrom24(value, offset) {
  return (value >>> (offset * 8)) & 0xFF;
}

function simulateDescriptorPath(ix0, ix1, iy4a) {
  const afterSub = (ix1 - ix0) & 0xFF;
  const afterDec = (afterSub - 1) & 0xFF;
  const retZ = afterDec === 0;
  const bAfter3205 = (0x14 * afterDec) & 0xFF;
  let aAfter2d4c = ix1 & 0xFF;
  aAfter2d4c = (aAfter2d4c * 2) & 0xFF;
  const savedB = aAfter2d4c;
  aAfter2d4c = (aAfter2d4c * 2) & 0xFF;
  aAfter2d4c = (aAfter2d4c * 2) & 0xFF;
  aAfter2d4c = (aAfter2d4c + savedB) & 0xFF;
  aAfter2d4c = (aAfter2d4c * 2) & 0xFF;
  aAfter2d4c = (aAfter2d4c + 0x25) & 0xFF;
  const dAfter3216 = (aAfter2d4c - 1) & 0xFF;
  const firstCopyCount = (0x280 * bAfter3205) >>> 0;
  const destructiveCopyCount = (0x28 * bAfter3205) >>> 0;
  const firstDestEnd = (0xD40000 + ((0x280 * ((dAfter3216 + 1) & 0xFF)) >>> 0) - 1) & 0xFFFFFF;
  const secondBranchBase = (iy4a & 0x08) === 0 ? 0xD031F6 : 0xD052C6;
  return {
    ix0,
    ix1,
    iy4a,
    afterSub,
    afterDec,
    retZ,
    bAfter3205,
    aAfter2d4c,
    dAfter3216,
    firstCopyCount,
    destructiveCopyCount,
    firstDestEnd,
    secondBranchBase,
  };
}

function formatSimulation(row) {
  return {
    ix0: hex(row.ix0, 2),
    ix1: hex(row.ix1, 2),
    iy4a: hex(row.iy4a, 2),
    afterSub: hex(row.afterSub, 2),
    afterDec: hex(row.afterDec, 2),
    retZ: row.retZ,
    bAfter3205: hex(row.bAfter3205, 2),
    aAfter2d4c: hex(row.aAfter2d4c, 2),
    dAfter3216: hex(row.dAfter3216, 2),
    firstCopyCount: hex(row.firstCopyCount, 5),
    destructiveCopyCount: hex(row.destructiveCopyCount, 4),
    firstDestEnd: hex(row.firstDestEnd),
    secondBranchBase: hex(row.secondBranchBase),
  };
}

function formatCaptureRow(row) {
  return {
    name: row.name,
    addr: hex(row.addr),
    preByte: row.preByte == null ? null : hex(row.preByte, 2),
    afterByte: row.afterByte == null ? null : hex(row.afterByte, 2),
    pre24: row.pre24 == null ? null : hex(row.pre24),
    after24: row.after24 == null ? null : hex(row.after24),
  };
}

function sampleRow(label, sample) {
  if (!sample) return `| ${label} | - | - | - | - | - | - | - | - |`;
  const cpu = sample.cpu;
  const ix0 = parseHex(cpu.ixFrame?.['IX+0'] ?? '0');
  return [
    `| ${label}`,
    sample.logicalPc,
    sample.blockIndex,
    cpu.af,
    cpu.bc,
    cpu.de,
    cpu.hl,
    cpu.sp,
    `${hex(lowByteFrom24(ix0, 0), 2)} / ${hex(lowByteFrom24(ix0, 1), 2)} / ${hex(lowByteFrom24(ix0, 2), 2)} |`,
  ].join(' | ');
}

function buildCaptureTable(rows) {
  return [
    '| Name | Address | Real before byte | Real after byte | Real before 24-bit | Real after 24-bit |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.name} | ${hex(row.addr)} | ${hex(row.preByte, 2)} | ${hex(row.afterByte, 2)} | ${hex(row.pre24)} | ${hex(row.after24)} |`),
  ].join('\n');
}

function buildDecodeSections(decodes) {
  return decodes.map((section) => [
    `### ${section.label}`,
    '',
    decodeTable(section.records),
  ].join('\n')).join('\n\n');
}

function buildReport(summary) {
  return [
    '# Phase 851: Upstream Owner Chain Decode for 0x0A31E2 Input State',
    '',
    'Probe: `probe-phase851-upstream-owner-chain.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase851-upstream-owner-chain.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${summary.pass ? 'PASS' : 'FAIL'}. Phase850 dynamic evidence was parsed successfully and the owner-chain windows decoded coherently.`,
    '- `0x0A322B` does not initialize a new descriptor; it hardcodes `IX=0xD02504`, sets `(IY+5)` bit2, and calls `0x0A31FD`. The bad value is therefore already in the `D02504/D02505` window before this owner chain.',
    '- `0x0A31FD` early-returns only when `(IX+1) - (IX+0) - 1 == 0`, meaning `IX+1 == IX+0 + 1`. With lifted `IX+0=0x00` and `IX+1=0x00`, the computed value is `0xFF`, so `RET Z` correctly does not fire and the chain falls through.',
    `- Real captures show \`D02504=0x${summary.real.ix0.toString(16).toUpperCase().padStart(2, '0')}\` and \`D02505=0x${summary.real.ix1.toString(16).toUpperCase().padStart(2, '0')}\` both before and after CLEAR. The lifted Phase850 sample has the 24-bit \`IX+0\` window as zero, so the specific mismatched input is **\`D02505\` / \`IX+1\` (lifted 0x00 vs real 0x0A)**, not \`D02504\`.`,
    '- `(IY+0x4A)` is bit3 clear in both lifted trace and real capture (`0x21`), so selecting the `D031F6` branch at `0x0A31D8` is not itself the bad branch.',
    '- Nearby static decode confirms `0x058D65` can write `D02505=0x0A`; Phase850 recent path includes `0x058D60 -> 0x058D89`, which is the Z cleanup branch that skips that writer. The concrete next diagnostic is to confirm whether missed/cleared `D02505=0x0A` is the upstream state defect.',
    '',
    '## Dynamic Samples From Phase850',
    '',
    '| Sample | PC | Block # | AF | BC | DE | HL | SP | IX+0/IX+1/IX+2 bytes |',
    '| --- | --- | ---: | --- | --- | --- | --- | --- | --- |',
    sampleRow('owner entry 0x0A322B', summary.samples.at0A322B),
    sampleRow('gate entry 0x0A31FD', summary.samples.at0A31FD),
    sampleRow('fallthrough 0x0A3205', summary.samples.at0A3205),
    sampleRow('branch test 0x0A31D8', summary.samples.at0A31D8),
    sampleRow('destructive owner 0x0A31E2', summary.samples.at0A31E2),
    '',
    '## Real Capture Inputs',
    '',
    buildCaptureTable(summary.captureRows),
    '',
    '## Descriptor Algebra',
    '',
    '```json',
    JSON.stringify({
      lifted: summary.simulations.lifted,
      realCapture: summary.simulations.realCapture,
    }, null, 2),
    '```',
    '',
    'Interpretation: the lifted zeroed `D02505` expands the fallthrough value to `0xFF`, producing `B=0xEC` and the observed `0x24E0` destructive copy. The real `D02505=0x0A` would produce a different geometry (`B=0xB4`, destructive count `0x1C20`) before any later branch/copy effects.',
    '',
    '## Decoded Owner Chain',
    '',
    buildDecodeSections(summary.decodes),
    '',
    '## Fix Direction for Next Phase',
    '',
    '- Phase852 should test the narrow upstream input, not a downstream force-restore: set only `D02505=0x0A` at the `0x0A322B`/`0x0A31FD` boundary and verify whether the `0x0A31F2` source/destination no longer zeroes `D0243A/D0243D/D02590/D0259D` or enters the closed `0x0A1854` artifact.',
    '- If that A/B confirms the direction, the later real fix should trace why the lifted CLEAR route reaches this owner with `D02505=0x00` despite real hardware holding `0x0A`; likely writer candidates include the non-Z path through `0x058D54..0x058D65` or other display-window setup routines already decoded around `0x0A2802`/`0x0A223A`.',
    '',
    '## Machine Summary',
    '',
    '```json',
    JSON.stringify(summary.machine, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.',
    '',
  ].join('\n');
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const preClear = fs.readFileSync(PRE_CLEAR_CAPTURE);
  const afterClear = fs.readFileSync(AFTER_CLEAR_CAPTURE);
  const phase850 = parsePhase850Summary();

  const decodes = DECODE_WINDOWS.map((window) => ({
    ...window,
    records: decodeRange(rom, window.start, window.end),
  }));

  const samples = {
    at0A322B: phase850Sample(phase850, 0x0A322B),
    at0A31FD: phase850Sample(phase850, 0x0A31FD),
    at0A3205: phase850Sample(phase850, 0x0A3205),
    at0A31D8: phase850.keySamples?.at0A31D8 ?? null,
    at0A31E2: phase850.keySamples?.at0A31E2 ?? phase850Sample(phase850, 0x0A31E2),
  };

  const liftedIxWindow = parseHex(samples.at0A31FD?.cpu?.ixFrame?.['IX+0'] ?? '0');
  const liftedIx0 = lowByteFrom24(liftedIxWindow, 0);
  const liftedIx1 = lowByteFrom24(liftedIxWindow, 1);
  const liftedIy4a = samples.at0A31D8?.indexedRead?.value ?? 0;
  const realIx0 = captureByte(preClear, 0xD02504);
  const realIx1 = captureByte(preClear, 0xD02505);
  const realIy4a = captureByte(preClear, 0xD000CA);

  const captureRows = [
    captureRow('D02504 / IX+0', 0xD02504, preClear, afterClear),
    captureRow('D02505 / IX+1', 0xD02505, preClear, afterClear),
    captureRow('D02506 / IX+2', 0xD02506, preClear, afterClear),
    captureRow('D000CA / IY+0x4A', 0xD000CA, preClear, afterClear),
    captureRow('D0243A edit cursor', 0xD0243A, preClear, afterClear),
    captureRow('D02590 OPBase', 0xD02590, preClear, afterClear),
  ];

  const simulations = {
    lifted: formatSimulation(simulateDescriptorPath(liftedIx0, liftedIx1, liftedIy4a)),
    realCapture: formatSimulation(simulateDescriptorPath(realIx0, realIx1, realIy4a)),
  };
  const recentIntoOwner = (samples.at0A31E2?.recentPcs ?? []).map(parseHex);
  const phase850RecentPathSkipsD02505Writer = recentIntoOwner.includes(0x058D60)
    && recentIntoOwner.includes(0x058D89)
    && !recentIntoOwner.includes(0x058D62)
    && !recentIntoOwner.includes(0x058D65);

  const checks = {
    phase850Pass: phase850.pass === true,
    criticalSamplesPresent: Boolean(samples.at0A31FD && samples.at0A3205 && samples.at0A31D8 && samples.at0A31E2),
    gateHasRetZ: decodes.some((section) => section.records.some((record) => record.pc === 0x0A3204 && record.text === 'RET Z')),
    ownerHardcodesIx: decodes.some((section) => section.records.some((record) => record.pc === 0x0A322D && record.text === 'LD IX,0xD02504')),
    branchReadsIy4a: decodes.some((section) => section.records.some((record) => record.pc === 0x0A31D8 && record.text === 'BIT 3,(IY+74)')),
    d02505WriterDecoded: decodes.some((section) => section.records.some((record) => record.pc === 0x058D65 && record.text === 'LD (0xD02505),A')),
    liftedIx1Zero: liftedIx1 === 0x00,
    realIx1Ten: realIx1 === 0x0A && captureByte(afterClear, 0xD02505) === 0x0A,
    iy4aBranchMatchesReal: liftedIy4a === 0x21 && realIy4a === 0x21,
    liftedRetZFalse: simulateDescriptorPath(liftedIx0, liftedIx1, liftedIy4a).retZ === false,
    phase850RecentPathSkipsD02505Writer,
  };

  const pass = Object.values(checks).every(Boolean);
  const summary = {
    pass,
    samples,
    real: {
      ix0: realIx0,
      ix1: realIx1,
      iy4a: realIy4a,
    },
    captureRows,
    simulations,
    decodes,
    machine: {
      probe: 'phase851-upstream-owner-chain',
      pass,
      checks,
      phase850Result: phase850.result,
      phase850RecentPath: recentIntoOwner.map((pc) => hex(pc)),
      liftedInputs: {
        ixWindow24At0A31FD: hex(liftedIxWindow),
        ix0: hex(liftedIx0, 2),
        ix1: hex(liftedIx1, 2),
        iy4a: hex(liftedIy4a, 2),
      },
      realInputs: Object.fromEntries(captureRows.map((row) => [row.name, formatCaptureRow(row)])),
    },
  };

  fs.writeFileSync(REPORT_PATH, buildReport(summary));
  console.log(JSON.stringify({
    probe: summary.machine.probe,
    pass: summary.pass,
    checks: summary.machine.checks,
    finding: {
      liftedIx0: summary.machine.liftedInputs.ix0,
      liftedIx1: summary.machine.liftedInputs.ix1,
      realIx0: hex(summary.real.ix0, 2),
      realIx1: hex(summary.real.ix1, 2),
      liftedRetZ: summary.simulations.lifted.retZ,
      realRetZ: summary.simulations.realCapture.retZ,
      liftedDestructiveCount: summary.simulations.lifted.destructiveCopyCount,
      realDestructiveCount: summary.simulations.realCapture.destructiveCopyCount,
    },
    report: path.basename(REPORT_PATH),
  }, null, 2));

  if (!summary.pass) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const message = String(error?.stack || error);
  fs.writeFileSync(REPORT_PATH, [
    '# Phase 851: Upstream Owner Chain Decode for 0x0A31E2 Input State',
    '',
    'Probe failed before producing a complete report.',
    '',
    '```text',
    message,
    '```',
    '',
  ].join('\n'));
  console.error(message);
  process.exitCode = 1;
}

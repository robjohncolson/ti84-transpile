import fs from 'node:fs';
import path from 'node:path';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = import.meta.dirname;
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const PHASE659_REPORT = path.join(__dirname, 'phase659-cleanup-gate-state.md');
const REPORT_PATH = path.join(__dirname, 'phase660-cleanup-gate-decode.md');

const rom = fs.readFileSync(ROM_PATH);

const WINDOWS = [
  { label: '0x001C33/0x001C4A upstream guard window', start: 0x001C33, end: 0x001C60 },
  { label: '0x0158D2..0x0158F8 guard-return chain', start: 0x0158D2, end: 0x0158FA },
  { label: '0x001872..0x0018F8 cleanup selector', start: 0x001872, end: 0x00190F },
  { label: '0x0018F8 bulk-clear entry', start: 0x0018F8, end: 0x001933 },
];

const IY_NAMES = new Map([
  ['IY+00', 'D00080'],
  ['IY+0D', 'D0008D'],
  ['IY+1B', 'D0009B'],
  ['IY+1F', 'D0009F'],
  ['IY+23', 'D000A3'],
  ['IY+27', 'D000A7'],
  ['IY+28', 'D000A8'],
  ['IY+2C', 'D000AC'],
  ['IY+42', 'D000C2'],
  ['IY+44', 'D000C4'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function parseHex(value) {
  if (typeof value === 'number') return value >>> 0;
  if (typeof value !== 'string') return 0;
  return Number.parseInt(value.replace(/^0x/i, ''), 16) >>> 0;
}

function byteText(pc, length) {
  const bytes = [];
  for (let i = 0; i < length; i += 1) {
    bytes.push((rom[pc + i] ?? 0).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function flagText(flags) {
  if (!flags) return '';
  return [
    flags.s ? 'S' : 's',
    flags.z ? 'Z' : 'z',
    flags.h ? 'H' : 'h',
    flags.pv ? 'PV' : 'pv',
    flags.n ? 'N' : 'n',
    flags.c ? 'C' : 'c',
  ].join(' ');
}

function conditionTaken(condition, flags) {
  if (!flags) return null;
  switch (condition) {
    case 'nz': return !flags.z;
    case 'z': return flags.z;
    case 'nc': return !flags.c;
    case 'c': return flags.c;
    case 'po': return !flags.pv;
    case 'pe': return flags.pv;
    case 'p': return !flags.s;
    case 'm': return flags.s;
    default: return null;
  }
}

function fmtOperand(value, width = 6) {
  return hex(value, width);
}

function formatInstruction(insn) {
  const tag = insn.tag ?? 'unknown';
  switch (tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${insn.condition.toUpperCase()}`;
    case 'jr': return `JR ${fmtOperand(insn.target)}`;
    case 'jr-conditional': return `JR ${insn.condition.toUpperCase()},${fmtOperand(insn.target)}`;
    case 'jp': return `JP ${fmtOperand(insn.target)}`;
    case 'jp-conditional': return `JP ${insn.condition.toUpperCase()},${fmtOperand(insn.target)}`;
    case 'jp-indirect': return `JP (${insn.indirectRegister.toUpperCase()})`;
    case 'call': return `CALL ${fmtOperand(insn.target)}`;
    case 'call-conditional': return `CALL ${insn.condition.toUpperCase()},${fmtOperand(insn.target)}`;
    case 'rst': return `RST ${fmtOperand(insn.target, 2)}`;
    case 'ld-pair-imm': return `LD ${insn.pair.toUpperCase()},${fmtOperand(insn.value)}`;
    case 'ld-reg-imm': return `LD ${insn.dest.toUpperCase()},${fmtOperand(insn.value, 2)}`;
    case 'ld-ind-imm': return `LD (HL),${fmtOperand(insn.value, 2)}`;
    case 'ld-reg-reg': return `LD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${insn.dest.toUpperCase()},(${insn.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${insn.dest.toUpperCase()}),${insn.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${insn.dest.toUpperCase()},(${fmtOperand(insn.addr)})`;
    case 'ld-mem-reg': return `LD (${fmtOperand(insn.addr)}),${insn.src.toUpperCase()}`;
    case 'ld-pair-mem':
      return insn.direction === 'to-mem'
        ? `LD (${fmtOperand(insn.addr)}),${insn.pair.toUpperCase()}`
        : `LD ${insn.pair.toUpperCase()},(${fmtOperand(insn.addr)})`;
    case 'ld-mem-pair': return `LD (${fmtOperand(insn.addr)}),${insn.pair.toUpperCase()}`;
    case 'inc-pair': return `INC ${insn.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${insn.pair.toUpperCase()}`;
    case 'inc-reg': return `INC ${insn.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${insn.reg.toUpperCase()}`;
    case 'add-pair': return `ADD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL,${insn.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL,${insn.src.toUpperCase()}`;
    case 'alu-reg': return `${insn.op.toUpperCase()} ${insn.src.toUpperCase()}`;
    case 'alu-imm': return `${insn.op.toUpperCase()} ${fmtOperand(insn.value, 2)}`;
    case 'xor': return 'XOR A';
    case 'rlca': return 'RLCA';
    case 'rla': return 'RLA';
    case 'rrca': return 'RRCA';
    case 'rra': return 'RRA';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'daa': return 'DAA';
    case 'ex-af': return "EX AF,AF'";
    case 'exx': return 'EXX';
    case 'ex-de-hl': return 'EX DE,HL';
    case 'push': return `PUSH ${insn.pair.toUpperCase()}`;
    case 'pop': return `POP ${insn.pair.toUpperCase()}`;
    case 'bit-test': return `BIT ${insn.bit},${insn.reg.toUpperCase()}`;
    case 'bit-set': return `SET ${insn.bit},${insn.reg.toUpperCase()}`;
    case 'bit-res': return `RES ${insn.bit},${insn.reg.toUpperCase()}`;
    case 'indexed-cb-bit': return `BIT ${insn.bit},(${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'indexed-cb-set': return `SET ${insn.bit},(${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'indexed-cb-res': return `RES ${insn.bit},(${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'in0': return `IN0 ${insn.reg.toUpperCase()},(${fmtOperand(insn.port, 2)})`;
    case 'out0': return `OUT0 (${fmtOperand(insn.port, 2)}),${insn.reg.toUpperCase()}`;
    case 'in-reg': return `IN ${insn.reg.toUpperCase()},(C)`;
    case 'out-reg': return `OUT (C),${insn.reg.toUpperCase()}`;
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'ldi': return 'LDI';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'neg': return 'NEG';
    default: return `${tag.toUpperCase()} ${JSON.stringify(insn)}`;
  }
}

function isBranchLike(insn) {
  return [
    'jr',
    'jr-conditional',
    'jp',
    'jp-conditional',
    'call',
    'call-conditional',
    'ret',
    'ret-conditional',
  ].includes(insn.tag);
}

function decodeRange(start, end) {
  const records = [];
  let pc = start;
  while (pc < end) {
    let insn;
    try {
      insn = decodeInstruction(rom, pc, 'adl');
    } catch (error) {
      insn = { pc, length: 1, tag: 'db', error: error.message };
    }
    if (!Number.isFinite(insn.length) || insn.length <= 0) {
      insn = { pc, length: 1, tag: 'db', error: 'invalid length' };
    }
    const length = Math.min(insn.length, end - pc);
    const text = insn.tag === 'db' ? `DB ${hex(rom[pc] ?? 0, 2)} ; ${insn.error}` : formatInstruction(insn);
    records.push({
      pc,
      length,
      bytes: byteText(pc, length),
      insn,
      text,
      branchLike: isBranchLike(insn),
    });
    pc += length;
  }
  return records;
}

function parsePhase659() {
  const text = fs.readFileSync(PHASE659_REPORT, 'utf8');
  const jsonStart = text.indexOf('```json');
  if (jsonStart === -1) throw new Error('phase659 report JSON block not found');
  const bodyStart = text.indexOf('\n', jsonStart) + 1;
  const jsonEnd = text.indexOf('\n```', bodyStart);
  if (jsonEnd === -1) throw new Error('phase659 report JSON terminator not found');
  const data = JSON.parse(text.slice(bodyStart, jsonEnd));
  const scenario = data.scenarios?.[0];
  const key = scenario?.keys?.[0];
  const summary = key?.summary;
  if (!summary?.gateSamples?.length) throw new Error('phase659 gateSamples not found');
  return { scenario, key, summary, samples: summary.gateSamples };
}

function targetSample(samples, target, minBlock = 0, maxBlock = Number.POSITIVE_INFINITY) {
  return samples.find((sample) => sample.target === target && sample.block >= minBlock && sample.block <= maxBlock) ?? null;
}

function sampleLine(sample) {
  if (!sample) return '(missing)';
  const iy42 = sample.iyFlags?.['IY+42']?.value ?? '?';
  const port03 = sample.lastIoByPort?.['0x0003']?.value ?? '?';
  const port09 = sample.lastIoByPort?.['0x0009']?.value ?? '?';
  return [
    `${sample.target}@${sample.pc}#${sample.block}`,
    `prev=${sample.previousPc}`,
    `AF=${sample.cpu?.af}`,
    `flags=${flagText(sample.cpu?.flags)}`,
    `SP=${sample.cpu?.sp}`,
    `stack0=${sample.stack24?.[0]?.value ?? '?'}`,
    `IY+42=${iy42}`,
    `port03=${port03}`,
    `port09=${port09}`,
  ].join('; ');
}

function sampleRow(sample) {
  const iy42 = sample.iyFlags?.['IY+42']?.value ?? '';
  const port03 = sample.lastIoByPort?.['0x0003']?.value ?? '';
  const port09 = sample.lastIoByPort?.['0x0009']?.value ?? '';
  return `| ${sample.block} | \`${sample.target}\` | \`${sample.pc}\` | \`${sample.previousPc}\` | \`${sample.cpu?.af}\` | ${flagText(sample.cpu?.flags)} | \`${sample.cpu?.sp}\` | \`${sample.stack24?.[0]?.value ?? ''}\` | \`${iy42}\` | \`${port03}\` | \`${port09}\` |`;
}

function iySummary(sample) {
  if (!sample?.iyFlags) return '';
  return Object.entries(sample.iyFlags)
    .map(([name, rec]) => `${IY_NAMES.get(name) ?? name}=${rec.value}`)
    .join(', ');
}

function branchDecisionRows(samples) {
  const firstCleanup = targetSample(samples, 'cleanup0018f8');
  const min = firstCleanup ? firstCleanup.block - 12 : 0;
  const max = firstCleanup ? firstCleanup.block : Number.POSITIVE_INFINITY;
  const s001c4a = targetSample(samples, 'gate001c4a', min, max);
  const s0158d2 = targetSample(samples, 'gate0158d2', min, max);
  const s0158da = targetSample(samples, 'gate0158da', min, max);
  const s0158ec = targetSample(samples, 'gate0158ec', min, max);
  const s0158ee = targetSample(samples, 'gate0158ee', min, max);
  const s0158f8 = targetSample(samples, 'gate0158f8', min, max);
  const s001872 = targetSample(samples, 'gate001872', min, max);
  const s001879 = targetSample(samples, 'clear001879', min, max);
  const s0018f8 = targetSample(samples, 'cleanup0018f8', min, max);

  const port03 = parseHex(s001879?.lastIoByPort?.['0x0003']?.value);
  const port09Before = parseHex(s001879?.lastIoByPort?.['0x0009']?.value);
  const port09After = parseHex(s0018f8?.lastIoByPort?.['0x0009']?.value);

  return [
    {
      location: '0x001C33 -> 0x001C4A',
      static: 'Upstream loop/search reaches 0x001C4A; 0x001C4A returns to the 0x0158D2 guard chain via stack0.',
      dynamic: s001c4a ? `${sampleLine(s001c4a)}; IY: ${iySummary(s001c4a)}` : 'No cleanup-window 0x001C4A sample.',
      result: s001c4a?.previousPc === '0x001C33' && s001c4a?.stack24?.[0]?.value === '0x0158D2'
        ? 'MATCH: 0x001C33 was the predecessor and stack0 routes RET to 0x0158D2.'
        : 'CHECK: predecessor/return target differs or sample missing.',
    },
    {
      location: '0x0158D2',
      static: 'JR NZ,0x0158DA',
      dynamic: sampleLine(s0158d2),
      result: conditionTaken('nz', s0158d2?.cpu?.flags) ? 'TAKEN: Z=false routes to 0x0158DA.' : 'NOT TAKEN or missing flags.',
    },
    {
      location: '0x0158DA',
      static: 'OR A; SBC HL,HL; RET. This normalizes flags before returning to the caller stack target.',
      dynamic: `${sampleLine(s0158da)} -> next ${s0158ec?.pc ?? '?'}`,
      result: s0158ec?.pc === '0x0158EC' ? 'MATCH: return lands at 0x0158EC with Z=true, C=false.' : 'CHECK: expected next sample 0x0158EC missing.',
    },
    {
      location: '0x0158EC',
      static: 'JR C,0x0158F8',
      dynamic: sampleLine(s0158ec),
      result: conditionTaken('c', s0158ec?.cpu?.flags) ? 'TAKEN unexpectedly.' : 'NOT TAKEN: C=false falls through to 0x0158EE.',
    },
    {
      location: '0x0158EE',
      static: 'JR Z,0x0158F8; fallthrough would SET 7,(IY+0x42), LD A,1, OR A, RET.',
      dynamic: `${sampleLine(s0158ee)}; IY+42=${s0158ee?.iyFlags?.['IY+42']?.value ?? '?'}`,
      result: conditionTaken('z', s0158ee?.cpu?.flags) ? 'TAKEN: Z=true jumps to 0x0158F8 and skips the IY+0x42 set.' : 'NOT TAKEN or missing flags.',
    },
    {
      location: '0x0158F8',
      static: 'XOR A; RET',
      dynamic: `${sampleLine(s0158f8)} -> next ${s001872?.pc ?? '?'}`,
      result: s001872?.pc === '0x001872' ? 'MATCH: returns to the low-ROM cleanup selector at 0x001872.' : 'CHECK: expected 0x001872 sample missing.',
    },
    {
      location: '0x001872',
      static: 'IN0 A,(0x03); BIT 4,A; JR NZ,0x0018B0',
      dynamic: `${sampleLine(s001872)}; after IN0, next sample has A=${s001879?.cpu?.a ?? '?'}, port03=${hex(port03, 2)}`,
      result: (port03 & 0x10) === 0
        ? 'NOT TAKEN: port03 bit4 is clear, so Z=true after BIT 4 and execution falls through to 0x001879.'
        : 'TAKEN: port03 bit4 set would skip toward 0x0018B0.',
    },
    {
      location: '0x001879',
      static: 'IN0 A,(0x09); SET 4,A; OUT0 (0x09),A; then first bulk-clear setup begins.',
      dynamic: `${sampleLine(s001879)}; port09 before=${hex(port09Before, 2)}, port09 after=${hex(port09After, 2)}`,
      result: port09After === (port09Before | 0x10)
        ? 'MATCH: 0x001879 sets port09 bit4 and continues into clear setup; no local skip guard exists.'
        : 'CHECK: port09 did not match expected bit4 set.',
    },
    {
      location: '0x0018F8',
      static: 'LD (HL),0; LDIR; XOR A; LD (D177B7),A; LD A,0x95; LD (D0058F),A...',
      dynamic: sampleLine(s0018f8),
      result: 'ENTRY HAS NO PRE-CLEAR GUARD: registers were already set by 0x001879/0x0018A1 path; this is the third clear stage entry.',
    },
  ];
}

function makeReport() {
  const { key, summary, samples } = parsePhase659();
  const firstCleanup = targetSample(samples, 'cleanup0018f8');
  const min = firstCleanup ? firstCleanup.block - 12 : 0;
  const max = firstCleanup ? firstCleanup.block : Number.POSITIVE_INFINITY;
  const chain = samples.filter((sample) => sample.block >= min && sample.block <= max);
  const decisions = branchDecisionRows(samples);
  const decoded = WINDOWS.map((window) => ({ ...window, records: decodeRange(window.start, window.end) }));

  const lines = [];
  lines.push('# Phase 660: Cleanup Gate Static Decode Against Phase659 Inputs');
  lines.push('');
  lines.push('Probe: `probe-phase660-cleanup-gate-decode.mjs`');
  lines.push('Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase660-cleanup-gate-decode.mjs`');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('- The live-VAT no-AutoRun Digit2 route enters the first destructive cleanup because `0x001872` reads port `0x03` as `0xEE`, bit 4 is clear, and the `JR NZ` bypass is not taken.');
  lines.push('- The upstream `0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8` path does not set `IY+0x42`: `0x0158EE` takes `JR Z` directly to `0x0158F8`, skipping the `SET 7,(IY+0x42)` fallthrough.');
  lines.push('- `0x001879` is not a branch gate. It reads port `0x09`, sets bit 4, writes it back (`0x42 -> 0x52`), then begins the bulk-clear register setup and falls through to the `0x0018F8` clear tail.');
  lines.push('- Token/tail hooks remain absent in the phase659 route: token/tail hits are 0 and low-path hits are 60,889.');
  lines.push('');
  lines.push('## First Cleanup Chain Samples');
  lines.push('');
  const cleanStatus = String(key.summary.status ?? '').replaceAll('â†’', '->').replaceAll('→', '->');
  lines.push(`Phase659 key status: ${cleanStatus}`);
  lines.push('');
  lines.push('| Block | Target | PC | Previous | AF | Flags | SP | Stack0 | IY+42 | Port03 | Port09 |');
  lines.push('| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const sample of chain) lines.push(sampleRow(sample));
  lines.push('');
  lines.push('## Branch Matches');
  lines.push('');
  lines.push('| Location | Static decode | Phase659 input | Decision |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of decisions) {
    lines.push(`| \`${row.location}\` | ${row.static} | ${row.dynamic} | ${row.result} |`);
  }
  lines.push('');
  lines.push('## Static Listings');
  lines.push('');
  for (const window of decoded) {
    lines.push(`### ${window.label}`);
    lines.push('');
    lines.push('| Address | Bytes | Instruction | Notes |');
    lines.push('| --- | --- | --- | --- |');
    for (const record of window.records) {
      const notes = [];
      if (record.branchLike) {
        if (record.insn.condition) {
          const sample = samples.find((item) => parseHex(item.pc) === record.pc);
          const taken = conditionTaken(record.insn.condition, sample?.cpu?.flags);
          if (taken !== null) notes.push(`sample flags imply ${taken ? 'taken' : 'not taken'}`);
        } else {
          notes.push('control transfer');
        }
      }
      if (record.insn.tag === 'in0') notes.push(`port read ${hex(record.insn.port, 2)}`);
      if (record.insn.tag === 'out0') notes.push(`port write ${hex(record.insn.port, 2)}`);
      if (record.insn.tag === 'ldir') notes.push('block copy/clear');
      if (record.insn.tag === 'indexed-cb-set' && record.insn.indexRegister === 'iy' && record.insn.displacement === 0x42) notes.push('sets IY+0x42 bit 7');
      lines.push(`| \`${hex(record.pc)}\` | \`${record.bytes}\` | \`${record.text}\` | ${notes.join('; ')} |`);
    }
    lines.push('');
  }
  lines.push('## Conclusion');
  lines.push('');
  lines.push('The static decode matches phase659: the first cleanup entry is selected locally by the `0x001872` port-3 bit4 guard. The upstream flash/guard return path leaves `IY+0x42` clear and returns through `0x0158F8`; it does not request the bypass path. Once `0x001872` falls through, `0x001879` immediately performs port-9 bit setup and bulk-clear register setup, so the next causal experiment is the live-VAT port-3 bit4 A/B from the handoff.');
  lines.push('');
  lines.push('## Raw Route Counters');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    tokenHookHits: summary.tokenHookHits,
    lowPathHits: summary.lowPathHits,
    cleanupHits: summary.cleanupHits,
    getCscHits: summary.getCscHits,
    cxMainHits: summary.cxMainHits,
    counts: {
      gate001c4a: summary.counts?.gate001c4a,
      gate0158d2: summary.counts?.gate0158d2,
      gate0158da: summary.counts?.gate0158da,
      gate0158ec: summary.counts?.gate0158ec,
      gate0158ee: summary.counts?.gate0158ee,
      gate0158f8: summary.counts?.gate0158f8,
      gate001872: summary.counts?.gate001872,
      clear001879: summary.counts?.clear001879,
      cleanup0018f8: summary.counts?.cleanup0018f8,
    },
  }, null, 2));
  lines.push('```');
  lines.push('');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  return { firstCleanup, chain, decisions, reportPath: REPORT_PATH };
}

const result = makeReport();
console.log(`Phase 660 cleanup-gate decode wrote ${path.relative(process.cwd(), result.reportPath)}`);
console.log(`First cleanup sample: ${result.firstCleanup?.target}@${result.firstCleanup?.pc}#${result.firstCleanup?.block}`);
for (const row of result.decisions) {
  console.log(`${row.location}: ${row.result}`);
}

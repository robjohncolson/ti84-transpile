#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase138-report.md');

const romBytes = fs.readFileSync(ROM_PATH);

const CLUSTER_START = 0x056900;
const CLUSTER_END = 0x056a00;
const EXTENDED_START = 0x056900;
const EXTENDED_END = 0x05a000;

const DISPATCH_BASE = 0xd0231a;
const DISPATCH_RANGE_START = 0xd02300;
const DISPATCH_RANGE_END = 0xd02400;

const CLUSTER_FUNCTIONS = [
  {
    name: 'cluster_shift_or_remove',
    start: 0x0568ff,
    end: 0x056949,
    note: 'starts one byte before the requested 0x056900 window',
  },
  {
    name: 'cluster_scan_until_colon',
    start: 0x05694a,
    end: 0x056966,
    note: 'scanner loop with an early ret tail at 0x056958',
  },
  {
    name: 'cluster_scan_token_stream',
    start: 0x056967,
    end: 0x0569a1,
    note: 'uses a 7-byte inline lookup block at 0x0569a2',
  },
  {
    name: 'cluster_prepare_and_commit',
    start: 0x0569a9,
    end: 0x0569c7,
    note: 'best in-window top-level entry into the local commit path',
  },
  {
    name: 'cluster_commit_thunk',
    start: 0x0569c8,
    end: 0x0569cf,
    note: 'tail-jumps straight into 0x056a02',
  },
  {
    name: 'cluster_advance_current',
    start: 0x0569d0,
    end: 0x0569ec,
    note: 'increments the 0xd0231a cursor by two bytes before follow-on helper calls',
  },
  {
    name: 'cluster_span_helper',
    start: 0x0569ed,
    end: 0x056a01,
    note: 'reads 0xd0231a and 0xd02317, computes a span, then tail-jumps away',
  },
];

const ADJACENT_FUNCTIONS = [
  {
    name: 'adjacent_initializer',
    start: 0x056a02,
    end: 0x056a2b,
    note: 'outside the requested window, but reached by 0x0569c8 and performs the tight 0xd02317/1a/1d write sequence',
  },
];

const INLINE_DATA_BLOCKS = [
  {
    name: 'cluster_scan_lookup',
    start: 0x0569a2,
    end: 0x0569a8,
    note: '7-byte table searched via CPIR from 0x056967',
  },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
}

function read24(bytes, addr) {
  return bytes[addr] | (bytes[addr + 1] << 8) | (bytes[addr + 2] << 16);
}

function signed8(value) {
  if (value < 0x80) {
    return value;
  }

  return value - 0x100;
}

function resolveRelativeTarget(pc, displacement) {
  const nextPc = pc + 2;
  return (nextPc + signed8(displacement)) & 0xffffff;
}

function isWriteClassification(classification) {
  return classification.includes('WRITE');
}

function describeLiteralRef(offset) {
  const prev1 = offset >= 1 ? romBytes[offset - 1] : null;
  const prev2 = offset >= 2 ? romBytes[offset - 2] : null;

  if (prev1 === 0x22) {
    return { classification: 'ld (nn),hl WRITE', instructionStart: offset - 1 };
  }

  if (prev1 === 0x2a) {
    return { classification: 'ld hl,(nn) READ', instructionStart: offset - 1 };
  }

  if (prev1 === 0x21) {
    return { classification: 'ld hl,nn LITERAL', instructionStart: offset - 1 };
  }

  if (prev1 === 0x11) {
    return { classification: 'ld de,nn LITERAL', instructionStart: offset - 1 };
  }

  if (prev1 === 0x01) {
    return { classification: 'ld bc,nn LITERAL', instructionStart: offset - 1 };
  }

  if (prev1 === 0x32) {
    return { classification: 'ld (nn),a WRITE', instructionStart: offset - 1 };
  }

  if (prev1 === 0x3a) {
    return { classification: 'ld a,(nn) READ', instructionStart: offset - 1 };
  }

  if (prev2 === 0xed && prev1 === 0x43) {
    return { classification: 'ld (nn),bc WRITE', instructionStart: offset - 2 };
  }

  if (prev2 === 0xed && prev1 === 0x53) {
    return { classification: 'ld (nn),de WRITE', instructionStart: offset - 2 };
  }

  if (prev2 === 0xed && prev1 === 0x63) {
    return { classification: 'ld (nn),hl WRITE', instructionStart: offset - 2 };
  }

  if (prev2 === 0xed && prev1 === 0x73) {
    return { classification: 'ld (nn),sp WRITE', instructionStart: offset - 2 };
  }

  if (prev2 === 0xed && prev1 === 0x4b) {
    return { classification: 'ld bc,(nn) READ', instructionStart: offset - 2 };
  }

  if (prev2 === 0xed && prev1 === 0x5b) {
    return { classification: 'ld de,(nn) READ', instructionStart: offset - 2 };
  }

  if (prev2 === 0xed && prev1 === 0x6b) {
    return { classification: 'ld hl,(nn) READ', instructionStart: offset - 2 };
  }

  return { classification: 'other', instructionStart: offset };
}

function buildContext(offset, literalSize = 3, radius = 6) {
  const start = Math.max(0, offset - radius);
  const endExclusive = Math.min(romBytes.length, offset + literalSize + radius);

  return {
    start,
    end: endExclusive - 1,
    bytes: bytesToHex(romBytes.slice(start, endExclusive)),
  };
}

function formatHexDump(start, end) {
  const lines = [];

  for (let addr = start; addr <= end; addr += 16) {
    const slice = romBytes.slice(addr, Math.min(end + 1, addr + 16));
    lines.push(`${hex(addr)}: ${bytesToHex(slice)}`);
  }

  return lines;
}

function summarize(items, keyFn) {
  const counts = new Map();

  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return String(left[0]).localeCompare(String(right[0]));
  });
}

function formatSummaryTable(entries, leftHeader, rightHeader) {
  const lines = [`| ${leftHeader} | ${rightHeader} |`, '| --- | --- |'];

  for (const [label, count] of entries) {
    lines.push(`| \`${label}\` | \`${count}\` |`);
  }

  return lines;
}

function decodeInstruction(pc) {
  const opcode = romBytes[pc];

  switch (opcode) {
    case 0x01:
      return { size: 4, text: `ld bc,${hex(read24(romBytes, pc + 1))}` };
    case 0x03:
      return { size: 1, text: 'inc bc' };
    case 0x06:
      return { size: 2, text: `ld b,${hex(romBytes[pc + 1], 2)}` };
    case 0x10:
      return { size: 2, text: `djnz ${hex(resolveRelativeTarget(pc, romBytes[pc + 1]))}` };
    case 0x11:
      return { size: 4, text: `ld de,${hex(read24(romBytes, pc + 1))}` };
    case 0x18:
      return { size: 2, text: `jr ${hex(resolveRelativeTarget(pc, romBytes[pc + 1]))}` };
    case 0x19:
      return { size: 1, text: 'add hl,de' };
    case 0x1b:
      return { size: 1, text: 'dec de' };
    case 0x20:
      return { size: 2, text: `jr nz,${hex(resolveRelativeTarget(pc, romBytes[pc + 1]))}` };
    case 0x21:
      return { size: 4, text: `ld hl,${hex(read24(romBytes, pc + 1))}` };
    case 0x22:
      return { size: 4, text: `ld (${hex(read24(romBytes, pc + 1))}),hl` };
    case 0x23:
      return { size: 1, text: 'inc hl' };
    case 0x28:
      return { size: 2, text: `jr z,${hex(resolveRelativeTarget(pc, romBytes[pc + 1]))}` };
    case 0x2a:
      return { size: 4, text: `ld hl,(${hex(read24(romBytes, pc + 1))})` };
    case 0x2b:
      return { size: 1, text: 'dec hl' };
    case 0x30:
      return { size: 2, text: `jr nc,${hex(resolveRelativeTarget(pc, romBytes[pc + 1]))}` };
    case 0x32:
      return { size: 4, text: `ld (${hex(read24(romBytes, pc + 1))}),a` };
    case 0x38:
      return { size: 2, text: `jr c,${hex(resolveRelativeTarget(pc, romBytes[pc + 1]))}` };
    case 0x3e:
      return { size: 2, text: `ld a,${hex(romBytes[pc + 1], 2)}` };
    case 0x78:
      return { size: 1, text: 'ld a,b' };
    case 0x7b:
      return { size: 1, text: 'ld a,e' };
    case 0x7e:
      return { size: 1, text: 'ld a,(hl)' };
    case 0xaf:
      return { size: 1, text: 'xor a' };
    case 0xb7:
      return { size: 1, text: 'or a' };
    case 0xc1:
      return { size: 1, text: 'pop bc' };
    case 0xc3:
      return { size: 4, text: `jp ${hex(read24(romBytes, pc + 1))}` };
    case 0xc4:
      return { size: 4, text: `call nz,${hex(read24(romBytes, pc + 1))}` };
    case 0xc5:
      return { size: 1, text: 'push bc' };
    case 0xc8:
      return { size: 1, text: 'ret z' };
    case 0xc9:
      return { size: 1, text: 'ret' };
    case 0xcd:
      return { size: 4, text: `call ${hex(read24(romBytes, pc + 1))}` };
    case 0xd1:
      return { size: 1, text: 'pop de' };
    case 0xd5:
      return { size: 1, text: 'push de' };
    case 0xe1:
      return { size: 1, text: 'pop hl' };
    case 0xe5:
      return { size: 1, text: 'push hl' };
    case 0xeb:
      return { size: 1, text: 'ex de,hl' };
    case 0xed: {
      const subOpcode = romBytes[pc + 1];

      switch (subOpcode) {
        case 0x4b:
          return { size: 5, text: `ld bc,(${hex(read24(romBytes, pc + 2))})` };
        case 0x52:
          return { size: 2, text: 'sbc hl,de' };
        case 0x53:
          return { size: 5, text: `ld (${hex(read24(romBytes, pc + 2))}),de` };
        case 0x5b:
          return { size: 5, text: `ld de,(${hex(read24(romBytes, pc + 2))})` };
        case 0xb1:
          return { size: 2, text: 'cpir' };
        default:
          return { size: 2, text: `db 0xed,${hex(subOpcode, 2)}` };
      }
    }
    case 0xf6:
      return { size: 2, text: `or ${hex(romBytes[pc + 1], 2)}` };
    case 0xfe:
      return { size: 2, text: `cp ${hex(romBytes[pc + 1], 2)}` };
    default:
      return { size: 1, text: `db ${hex(opcode, 2)}` };
  }
}

function disassembleRange(start, end) {
  const instructions = [];
  let pc = start;

  while (pc <= end) {
    const decoded = decodeInstruction(pc);
    const bytes = romBytes.slice(pc, Math.min(end + 1, pc + decoded.size));

    instructions.push({
      addr: pc,
      size: decoded.size,
      text: decoded.text,
      bytes: bytesToHex(bytes),
    });

    pc += decoded.size;
  }

  return instructions;
}

function scanExactBaseRefs() {
  const hits = [];

  for (let offset = EXTENDED_START; offset <= EXTENDED_END - 3; offset += 1) {
    const value = read24(romBytes, offset);

    if (value !== DISPATCH_BASE) {
      continue;
    }

    const description = describeLiteralRef(offset);

    hits.push({
      literalOffset: offset,
      instructionStart: description.instructionStart,
      target: value,
      classification: description.classification,
      context: buildContext(offset),
    });
  }

  return hits;
}

function scanRangeRefs() {
  const hits = [];

  for (let offset = EXTENDED_START; offset <= EXTENDED_END - 3; offset += 1) {
    const value = read24(romBytes, offset);

    if (value < DISPATCH_RANGE_START || value > DISPATCH_RANGE_END) {
      continue;
    }

    const description = describeLiteralRef(offset);

    hits.push({
      literalOffset: offset,
      instructionStart: description.instructionStart,
      target: value,
      classification: description.classification,
      context: buildContext(offset),
    });
  }

  return hits;
}

function findHlWriteSites(rangeHits) {
  return rangeHits.filter((hit) => hit.classification === 'ld (nn),hl WRITE');
}

function renderFunctionSection(spec) {
  const lines = [];
  const instructions = disassembleRange(spec.start, spec.end);

  lines.push(`### \`${spec.name}\` ${hex(spec.start)}-${hex(spec.end)}`);
  lines.push('');
  lines.push(`- ${spec.note}`);
  lines.push('');
  lines.push('```text');
  lines.push(...formatHexDump(spec.start, spec.end));
  lines.push('```');
  lines.push('');
  lines.push('```text');

  for (const instruction of instructions) {
    lines.push(`${hex(instruction.addr)} | ${instruction.bytes.padEnd(18)} | ${instruction.text}`);
  }

  lines.push('```');
  lines.push('');

  return lines;
}

function renderInlineDataSection(spec) {
  const lines = [];

  lines.push(`### \`${spec.name}\` ${hex(spec.start)}-${hex(spec.end)}`);
  lines.push('');
  lines.push(`- ${spec.note}`);
  lines.push('');
  lines.push('```text');
  lines.push(...formatHexDump(spec.start, spec.end));
  lines.push('```');
  lines.push('');

  return lines;
}

function renderExactHitTable(hits) {
  const lines = [
    '| Instruction | Literal | Classification | Context |',
    '| --- | --- | --- | --- |',
  ];

  for (const hit of hits) {
    lines.push(
      `| \`${hex(hit.instructionStart)}\` | \`${hex(hit.literalOffset)}\` | \`${hit.classification}\` | \`${hit.context.bytes}\` |`
    );
  }

  return lines;
}

function renderWriteSiteTable(hits) {
  const lines = [
    '| Instruction | Target | Context |',
    '| --- | --- | --- |',
  ];

  for (const hit of hits) {
    lines.push(
      `| \`${hex(hit.instructionStart)}\` | \`${hex(hit.target)}\` | \`${hit.context.bytes}\` |`
    );
  }

  return lines;
}

function collectClusterCalls(functions) {
  const calls = [];

  for (const spec of functions) {
    const instructions = disassembleRange(spec.start, spec.end);

    for (const instruction of instructions) {
      if (!instruction.text.startsWith('call')) {
        continue;
      }

      const parts = instruction.text.split(',');
      const targetText = parts[parts.length - 1].replace('call ', '').trim();

      calls.push({
        functionName: spec.name,
        addr: instruction.addr,
        target: targetText,
        text: instruction.text,
      });
    }
  }

  return calls;
}

function buildReport() {
  const exactBaseHits = scanExactBaseRefs();
  const rangeHits = scanRangeRefs();
  const hlWriteSites = findHlWriteSites(rangeHits);
  const clusterCalls = collectClusterCalls([...CLUSTER_FUNCTIONS, ...ADJACENT_FUNCTIONS]);

  const exactSummary = summarize(exactBaseHits, (hit) => hit.classification);
  const rangeSummary = summarize(rangeHits, (hit) => hit.classification);
  const rangeTargetSummary = summarize(rangeHits, (hit) => hex(hit.target));

  const lines = [];

  lines.push('# Phase 138 - Dispatch Table Populator Deep Dive');
  lines.push('');
  lines.push('Generated by `probe-phase138-dispatch-populator.mjs` from static ROM bytes only.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Requested cluster window: \`${hex(CLUSTER_START)}-${hex(CLUSTER_END - 1)}\``);
  lines.push(`- Extended scan window: \`${hex(EXTENDED_START)}-${hex(EXTENDED_END - 1)}\``);
  lines.push(`- Exact \`${hex(DISPATCH_BASE)}\` hits in the extended window: \`${exactBaseHits.length}\``);
  lines.push(`- Literal refs anywhere in \`${hex(DISPATCH_RANGE_START)}-${hex(DISPATCH_RANGE_END)}\`: \`${rangeHits.length}\``);
  lines.push(`- Nearby \`ld (nn),hl\` write sites in \`${hex(DISPATCH_RANGE_START)}-${hex(DISPATCH_RANGE_END)}\`: \`${hlWriteSites.length}\``);
  lines.push(`- The requested window starts in the middle of \`${hex(CLUSTER_FUNCTIONS[0].start)}\`; the tight multi-slot initializer is the adjacent function at \`${hex(ADJACENT_FUNCTIONS[0].start)}\`.`);
  lines.push('');
  lines.push('## Function Boundaries');
  lines.push('');
  lines.push('| Range | Name | Note |');
  lines.push('| --- | --- | --- |');

  for (const spec of CLUSTER_FUNCTIONS) {
    lines.push(`| \`${hex(spec.start)}-${hex(spec.end)}\` | \`${spec.name}\` | ${spec.note} |`);
  }

  for (const spec of ADJACENT_FUNCTIONS) {
    lines.push(`| \`${hex(spec.start)}-${hex(spec.end)}\` | \`${spec.name}\` | ${spec.note} |`);
  }

  lines.push('');
  lines.push('## Inline Data');
  lines.push('');

  for (const spec of INLINE_DATA_BLOCKS) {
    lines.push(`- \`${spec.name}\` \`${hex(spec.start)}-${hex(spec.end)}\`: ${spec.note}`);
  }

  lines.push('');
  lines.push('## Cluster Hex Dumps And Manual Disassembly');
  lines.push('');

  for (const spec of CLUSTER_FUNCTIONS) {
    lines.push(...renderFunctionSection(spec));
  }

  lines.push('## Adjacent Follow-On Helper');
  lines.push('');

  for (const spec of ADJACENT_FUNCTIONS) {
    lines.push(...renderFunctionSection(spec));
  }

  lines.push('## Inline Lookup Table');
  lines.push('');

  for (const spec of INLINE_DATA_BLOCKS) {
    lines.push(...renderInlineDataSection(spec));
  }

  lines.push('## Cluster CALL Instructions');
  lines.push('');
  lines.push('| Function | ROM | Instruction |');
  lines.push('| --- | --- | --- |');

  for (const call of clusterCalls) {
    lines.push(`| \`${call.functionName}\` | \`${hex(call.addr)}\` | \`${call.text}\` |`);
  }

  lines.push('');
  lines.push(`## Exact ${hex(DISPATCH_BASE)} References In ${hex(EXTENDED_START)}-${hex(EXTENDED_END - 1)}`);
  lines.push('');
  lines.push(...formatSummaryTable(exactSummary, 'Classification', 'Count'));
  lines.push('');
  lines.push(...renderExactHitTable(exactBaseHits));
  lines.push('');
  lines.push(`## Literal Refs In ${hex(DISPATCH_RANGE_START)}-${hex(DISPATCH_RANGE_END)}`);
  lines.push('');
  lines.push(...formatSummaryTable(rangeSummary, 'Classification', 'Count'));
  lines.push('');
  lines.push(...formatSummaryTable(rangeTargetSummary, 'Target', 'Count'));
  lines.push('');
  lines.push(`## Nearby ${hex(DISPATCH_RANGE_START)}-${hex(DISPATCH_RANGE_END)} ld (nn),hl Write Sites`);
  lines.push('');
  lines.push(...renderWriteSiteTable(hlWriteSites));
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  lines.push(`- The in-window cluster already contains real writes into the target neighborhood: \`${hex(0x05690a)}\` stores DE to \`${hex(DISPATCH_BASE)}\`, \`${hex(0x05692a)}\` stores HL to \`${hex(DISPATCH_BASE)}\`, and \`${hex(0x056914)}\` / \`${hex(0x056925)}\` store HL to \`${hex(0xd0231d)}\`.`);
  lines.push(`- The adjacent helper at \`${hex(0x056a02)}\` is the tightest initializer-like block. It writes \`${hex(0xd02317)}\`, \`${hex(DISPATCH_BASE)}\`, and \`${hex(0xd0231d)}\` in one straight-line sequence, then rewrites \`${hex(DISPATCH_BASE)}\` after pointer arithmetic.`);
  lines.push(`- The repeated \`${hex(DISPATCH_BASE)}\` stores in \`${hex(0x059443)}-${hex(0x059cc4)}\` are dominated by \`ld (nn),bc\` and appear behind token or state checks (\`fe 10\`, \`fe 11\`, \`fe 2b\`, \`fe d0\`). That looks more like runtime cursor/state maintenance than a one-shot boot initializer.`);
  lines.push(`- The 7-byte lookup block at \`${hex(0x0569a2)}\` and the paired slots \`${hex(0xd02317)}\` / \`${hex(DISPATCH_BASE)}\` / \`${hex(0xd0231d)}\` point away from a flat callback array. This code behaves more like a small header for a moving window over records: base/start, current cursor, and end/limit.`);
  lines.push('');
  lines.push('## Hypothesis');
  lines.push('');
  lines.push(`- Most likely data structure: a compact pointer header over a packed stream or linked record area, not a pre-filled fixed jump table. \`${hex(0xd02317)}\`, \`${hex(DISPATCH_BASE)}\`, and \`${hex(0xd0231d)}\` behave like start/current/end slots.`);
  lines.push(`- Most likely populator primitive: \`${hex(0x056a02)}\`. It performs the only straight-line multi-slot initialization in the immediate neighborhood.`);
  lines.push(`- Best in-window entry point: \`${hex(0x0569a9)}\`, because it performs setup calls, invokes the thunk at \`${hex(0x0569c8)}\`, and that thunk tail-jumps directly into \`${hex(0x056a02)}\`.`);

  return `${lines.join('\n')}\n`;
}

const report = buildReport();

fs.writeFileSync(REPORT_PATH, report, 'utf8');

console.log(`Wrote ${path.basename(REPORT_PATH)}`);
console.log(`Exact ${hex(DISPATCH_BASE)} hits: ${scanExactBaseRefs().length}`);
console.log(`Nearby ld (nn),hl write sites: ${findHlWriteSites(scanRangeRefs()).length}`);

#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import(
  pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href
);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const ROM_SIZE = 0x400000;

const START_ADDR = 0x0AF062;
const LOCAL_END = START_ADDR + 0x80;
const MAX_TOTAL_BYTES = 400;

const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
const D024FC = 0xD024FC;
const D024FF = 0xD024FF;
const D02500 = 0xD02500;
const D02501 = 0xD02501;

const KNOWN_ADDRS = new Map([
  [D0058C, 'D0058C kbdKey'],
  [D0058E, 'D0058E keyExtend'],
  [D024FC, 'D024FC descriptorTableBase'],
  [D024FF, 'D024FF descriptorTableKind'],
  [D02500, 'D02500 selectedDescriptorIndex'],
  [D02501, 'D02501 currentDescriptorPtr'],
  [0x08ACA9, '0x08ACA9 fallback tail-handler'],
]);

const rom = readFileSync(ROM_PATH);
if (rom.length !== ROM_SIZE) {
  throw new Error(`Expected ${hex(ROM_SIZE)} bytes in ROM.rom, got ${hex(rom.length)}`);
}

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatSignedDisplacement(value) {
  const displacement = Number(value) || 0;
  return displacement < 0 ? `-${hex(Math.abs(displacement), 2)}` : `+${hex(displacement, 2)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${upper(indexRegister)}${formatSignedDisplacement(displacement)})`;
}

function addrLabel(addr) {
  const normalized = Number(addr) & 0xFFFFFF;
  if (KNOWN_ADDRS.has(normalized)) return `${hex(normalized)} [${KNOWN_ADDRS.get(normalized)}]`;
  return hex(normalized);
}

function isLocalAddress(addr) {
  const normalized = Number(addr) & 0xFFFFFF;
  return normalized >= START_ADDR && normalized < LOCAL_END;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'alu-imm':
      return `${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-ixd':
      return `${upper(inst.op)} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${addrLabel(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${addrLabel(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${addrLabel(inst.addr)}), ${upper(inst.pair)}`
        : `LD ${upper(inst.pair)}, (${addrLabel(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${addrLabel(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'call':
      return `CALL ${addrLabel(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${addrLabel(inst.target)}`;
    case 'jp':
      return `JP ${addrLabel(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${addrLabel(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${addrLabel(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${addrLabel(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'scf':
      return 'SCF';
    case 'mlt':
      return `MLT ${upper(inst.reg)}`;
    default: {
      const extras = { ...inst };
      delete extras.pc;
      delete extras.length;
      delete extras.nextPc;
      delete extras.mode;
      delete extras.modePrefix;
      return `${upper(inst?.tag ?? 'UNKNOWN')} ${JSON.stringify(extras)}`;
    }
  }
}

function createRow(pc, inst) {
  return {
    pc,
    length: inst.length,
    inst,
    bytes: bytesToHex(rom.subarray(pc, pc + inst.length)),
    text: formatInstruction(inst),
  };
}

function branchNote(inst) {
  if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional') {
    return `${upper(inst.condition)} -> ${hex(inst.target)} ; fall-through ${hex(inst.fallthrough)}`;
  }
  if (inst.tag === 'jr') return `target ${hex(inst.target)}`;
  if (inst.tag === 'jp') return `target ${hex(inst.target)}`;
  return null;
}

function annotateRow(row) {
  const notes = [];
  const { pc, inst } = row;

  if (pc === 0x0AF067 && inst.tag === 'alu-imm' && inst.op === 'cp') {
    notes.push('sub-case gate: action code 0x01');
  }
  if (pc === 0x0AF06B && inst.tag === 'alu-imm' && inst.op === 'cp') {
    notes.push('sub-case gate: action code 0x02');
  }
  if (pc === 0x0AF069 && inst.tag === 'jr-conditional') {
    notes.push('case 0x01 enters the shared selector body');
  }
  if (pc === 0x0AF06D && inst.tag === 'jr-conditional') {
    notes.push('case 0x02 enters the shared selector body');
  }
  if (pc === 0x0AF06F && inst.tag === 'jp') {
    notes.push('unexpected/non-1/2 action exits this helper via the generic fallback tail-handler');
  }
  if (pc === 0x0AF073 && inst.tag === 'dec-reg') {
    notes.push('shared body for action 0x01/0x02: A becomes selector offset 0 or 1');
  }
  if (pc === 0x0AF074 && inst.tag === 'ld-pair-imm') {
    notes.push('zeroes DE before materializing the selector offset in E');
  }
  if (pc === 0x0AF078 && inst.tag === 'ld-reg-reg') {
    notes.push('E = action-1, so E is 0 for case 0x01 and 1 for case 0x02');
  }
  if (pc === 0x0AF079 && inst.tag === 'add-pair') {
    notes.push('IX advances from currentDescriptorPtr to byte[action-1] in the current descriptor');
  }
  if (pc === 0x0AF07B && inst.tag === 'ld-reg-ixd') {
    notes.push('token-table lookup #1: read the selected child/next-record index byte');
  }
  if (pc === 0x0AF07E && inst.tag === 'ld-mem-reg') {
    notes.push('stores the selected descriptor index to D02500');
  }
  if (pc === 0x0AF082 && inst.tag === 'ld-reg-mem') {
    notes.push('reloads the selected descriptor index from D02500');
  }
  if (pc === 0x0AF089 && inst.tag === 'mlt') {
    notes.push('token-table lookup #2 setup: H=0x11 and L=index, so MLT HL computes index * 0x11');
    notes.push('0x11-byte stride implies fixed-size 17-byte descriptor records');
  }
  if (pc === 0x0AF08B && inst.tag === 'ld-pair-mem') {
    notes.push('loads descriptorTableBase from D024FC');
  }
  if (pc === 0x0AF090 && inst.tag === 'add-pair') {
    notes.push('adds descriptorTableBase to the 17-byte record offset');
  }
  if (pc === 0x0AF091 && inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') {
    notes.push('updates D02501 currentDescriptorPtr to the newly selected 17-byte record');
  }
  if (pc === 0x0AF095 && inst.tag === 'push') {
    notes.push('push/pop pair mirrors the new currentDescriptorPtr into IX');
  }
  if (pc === 0x0AF096 && inst.tag === 'pop') {
    notes.push('IX now points at the newly selected descriptor record');
  }
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    notes.push(`call target ${hex(inst.target)}`);
  }

  const branch = branchNote(inst);
  if (branch) notes.push(branch);

  return notes.join('; ');
}

function traceLocalGraph(startPc) {
  const queue = [startPc];
  const queued = new Set([startPc]);
  const visited = new Set();
  const rows = [];
  const blockStarts = new Set([startPc]);
  const edges = [];
  let bytesDecoded = 0;

  while (queue.length && bytesDecoded < MAX_TOTAL_BYTES) {
    const blockPc = queue.shift();
    let pc = blockPc;

    while (!visited.has(pc) && bytesDecoded < MAX_TOTAL_BYTES) {
      const inst = decodeInstruction(rom, pc, 'adl');
      if (!inst || !inst.length) {
        throw new Error(`Decoder returned an invalid instruction at ${hex(pc)}`);
      }

      visited.add(pc);
      rows.push(createRow(pc, inst));
      bytesDecoded += inst.length;

      if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional') {
        edges.push({ from: pc, to: inst.target, kind: `${inst.tag}:${inst.condition}` });
        if (isLocalAddress(inst.target) && !queued.has(inst.target)) {
          queued.add(inst.target);
          blockStarts.add(inst.target);
          queue.push(inst.target);
        }
        pc = inst.fallthrough;
        continue;
      }

      if (inst.tag === 'jr' || inst.tag === 'jp') {
        edges.push({ from: pc, to: inst.target, kind: inst.tag });
        if (isLocalAddress(inst.target) && !queued.has(inst.target)) {
          queued.add(inst.target);
          blockStarts.add(inst.target);
          queue.push(inst.target);
        }
        break;
      }

      if (
        inst.tag === 'ret' ||
        inst.tag === 'reti' ||
        inst.tag === 'retn' ||
        inst.tag === 'jp-indirect' ||
        inst.tag === 'halt' ||
        inst.tag === 'slp'
      ) {
        break;
      }

      pc = inst.nextPc;
    }
  }

  rows.sort((left, right) => left.pc - right.pc);
  return {
    rows,
    edges,
    blockStarts: [...blockStarts].sort((left, right) => left - right),
    bytesDecoded,
  };
}

function incomingEdgeSummary(edges, target) {
  const incoming = edges.filter((edge) => edge.to === target);
  if (!incoming.length) return 'entry';
  return incoming.map((edge) => `${hex(edge.from)} ${edge.kind}`).join(', ');
}

function summarize(rows) {
  const cpRows = rows.filter((row) => row.inst.tag === 'alu-imm' && row.inst.op === 'cp');
  const callRows = rows.filter((row) => row.inst.tag === 'call' || row.inst.tag === 'call-conditional');
  const d005Reads = rows.filter(
    (row) => row.inst.tag === 'ld-reg-mem' && (row.inst.addr === D0058C || row.inst.addr === D0058E)
  );

  const lines = [];
  lines.push('## Summary');
  lines.push('');
  lines.push('- No direct reads of D0058C or D0058E appear inside 0x0AF062.');
  lines.push(
    '- The helper first guards A against 0x01 and 0x02. Any other action code exits through JP 0x08ACA9.'
  );
  lines.push(
    '- Case 0x01 and case 0x02 both enter the same body at 0x0AF073. The only difference is the selector offset after DEC A: 0 for case 0x01, 1 for case 0x02.'
  );
  lines.push(
    '- The shared body reads one byte from the current descriptor (D02501 + selector offset), stores that byte to D02500, multiplies it by 0x11, adds D024FC, and writes the result back to D02501.'
  );
  lines.push(
    '- That means action 0x01 selects descriptor byte 0 and action 0x02 selects descriptor byte 1. Each byte is interpreted as an index into a 17-byte descriptor table rooted at D024FC.'
  );
  lines.push(
    '- Conclusion: 0x0AF062 does not emit tokens directly. It is a sub-dispatch/navigation helper that advances the active descriptor pointer to another 17-byte record.'
  );
  lines.push('');
  lines.push(`- CP instructions found: ${cpRows.map((row) => `${hex(row.pc)}=${hexByte(row.inst.value)}`).join(', ') || '(none)'}`);
  lines.push(`- CALL targets found: ${callRows.map((row) => hex(row.inst.target)).join(', ') || '(none)'}`);
  lines.push(`- D0058C/D0058E reads found: ${d005Reads.length ? d005Reads.map((row) => hex(row.pc)).join(', ') : 'none'}`);
  lines.push('');
  lines.push('## Case Map');
  lines.push('');
  lines.push('- Action 0x01: use currentDescriptorPtr[0] as the next-record index, then set D02501/IX to descriptorTableBase + 0x11 * index.');
  lines.push('- Action 0x02: use currentDescriptorPtr[1] as the next-record index, then set D02501/IX to descriptorTableBase + 0x11 * index.');
  lines.push('- Other action codes: tail-jump to 0x08ACA9.');
  return lines;
}

const trace = traceLocalGraph(START_ADDR);
const lastRow = trace.rows.at(-1) ?? null;
const endExclusive = lastRow ? lastRow.pc + lastRow.length : START_ADDR;
const endInclusive = endExclusive > START_ADDR ? endExclusive - 1 : START_ADDR;

console.log('# Phase 295: 0x0AF062 Case-1/2 Handler');
console.log('');
console.log(`ROM: ${path.basename(ROM_PATH)} (${hex(rom.length)} bytes)`);
console.log(`Entry: ${hex(START_ADDR)}`);
console.log(`Reachable local byte range: ${hex(START_ADDR)}-${hex(endInclusive)} (${endExclusive - START_ADDR} bytes)`);
console.log(`Unique bytes decoded: ${trace.bytesDecoded}`);
console.log('');

console.log('## Reachable Blocks');
console.log('');
for (const blockStart of trace.blockStarts) {
  console.log(`- ${hex(blockStart)} <- ${incomingEdgeSummary(trace.edges, blockStart)}`);
}
console.log('');

console.log('## Annotated Disassembly');
console.log('');
for (const row of trace.rows) {
  const blockMarker = trace.blockStarts.includes(row.pc) ? '>' : ' ';
  const notes = annotateRow(row);
  const noteSuffix = notes ? ` ; ${notes}` : '';
  console.log(`${blockMarker} ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${noteSuffix}`);
}
console.log('');

for (const line of summarize(trace.rows)) {
  console.log(line);
}

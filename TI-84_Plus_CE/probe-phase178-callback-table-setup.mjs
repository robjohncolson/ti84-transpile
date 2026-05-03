#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const ROM_LIMIT = 0x400000;
const PRIMARY_TARGET = 0xd02ad7;
const CALLBACK_TABLE_START = 0xd02ad4;
const CALLBACK_TABLE_END = 0xd02adf;
const DECODE_BACKTRACK = 8;

const romBytes = fs.readFileSync(ROM_PATH).subarray(0, ROM_LIMIT);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks ?? {};
const BLOCK_RANGES = buildBlockRanges(BLOCKS);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => (value & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function formatIndexedOperand(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : String(displacement);
  return `(${indexRegister}${signed})`;
}

function fallbackFormat(decoded) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'tag',
  ]);

  const parts = [];
  for (const [key, value] of Object.entries(decoded)) {
    if (ignored.has(key) || value === undefined) {
      continue;
    }

    if (typeof value === 'number') {
      if (key === 'bit') {
        parts.push(`${key}=${value}`);
      } else if (key === 'displacement') {
        parts.push(`${key}=${value >= 0 ? `+${value}` : String(value)}`);
      } else if (key === 'value' || key === 'port') {
        parts.push(`${key}=${hexByte(value)}`);
      } else {
        parts.push(`${key}=${hex(value)}`);
      }
      continue;
    }

    parts.push(`${key}=${String(value)}`);
  }

  return parts.length === 0 ? decoded.tag : `${decoded.tag} ${parts.join(' ')}`;
}

function formatInstruction(decoded) {
  const prefix = decoded.modePrefix ? `${decoded.modePrefix} ` : '';

  switch (decoded.tag) {
    case 'nop':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rrca':
    case 'rlca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'di':
    case 'ei':
    case 'exx':
    case 'halt':
    case 'slp':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'ldi':
    case 'cpi':
    case 'ldd':
    case 'cpd':
    case 'ldir':
    case 'cpir':
    case 'lddr':
    case 'cpdr':
    case 'ini':
    case 'outi':
    case 'ind':
    case 'outd':
    case 'inir':
    case 'otir':
    case 'indr':
    case 'otdr':
    case 'stmix':
    case 'rsmix':
      return `${prefix}${decoded.tag}`;

    case 'ex-af':
      return `${prefix}ex af, af'`;
    case 'ex-de-hl':
      return `${prefix}ex de, hl`;
    case 'ex-sp-hl':
      return `${prefix}ex (sp), hl`;
    case 'ex-sp-pair':
      return `${prefix}ex (sp), ${decoded.pair}`;

    case 'jr':
      return `${prefix}jr ${hex(decoded.target)}`;
    case 'jr-conditional':
      return `${prefix}jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'djnz':
      return `${prefix}djnz ${hex(decoded.target)}`;

    case 'jp':
      return `${prefix}jp ${hex(decoded.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect':
      return `${prefix}jp (${decoded.indirectRegister})`;

    case 'call':
      return `${prefix}call ${hex(decoded.target)}`;
    case 'call-conditional':
      return `${prefix}call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'rst':
      return `${prefix}rst ${hexByte(decoded.target)}`;

    case 'push':
      return `${prefix}push ${decoded.pair}`;
    case 'pop':
      return `${prefix}pop ${decoded.pair}`;
    case 'ret-conditional':
      return `${prefix}ret ${decoded.condition}`;

    case 'inc-pair':
      return `${prefix}inc ${decoded.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${decoded.pair}`;
    case 'inc-reg':
      return `${prefix}inc ${decoded.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${decoded.reg}`;
    case 'inc-ind':
      return `${prefix}inc (hl)`;
    case 'dec-ind':
      return `${prefix}dec (hl)`;
    case 'inc-ixd':
      return `${prefix}inc ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'dec-ixd':
      return `${prefix}dec ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;

    case 'ld-pair-imm':
      return `${prefix}ld ${decoded.pair}, ${hex(decoded.value)}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${decoded.dest}, ${hexByte(decoded.value)}`;
    case 'ld-reg-reg':
      return `${prefix}ld ${decoded.dest}, ${decoded.src}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${decoded.dest}, (${decoded.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${decoded.dest}), ${decoded.src}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${decoded.dest}, (${hex(decoded.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${hex(decoded.addr)}), ${decoded.src}`;
    case 'ld-pair-mem':
      if (decoded.direction === 'to-mem') {
        return `${prefix}ld (${hex(decoded.addr)}), ${decoded.pair}`;
      }
      return `${prefix}ld ${decoded.pair}, (${hex(decoded.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${hex(decoded.addr)}), ${decoded.pair}`;
    case 'ld-pair-ind':
      return `${prefix}ld ${decoded.pair}, (${decoded.src})`;
    case 'ld-ind-pair':
      return `${prefix}ld (${decoded.dest}), ${decoded.pair}`;
    case 'ld-sp-hl':
      return `${prefix}ld sp, hl`;
    case 'ld-sp-pair':
      return `${prefix}ld sp, ${decoded.pair}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${decoded.dest}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;
    case 'ld-special':
      return `${prefix}ld ${decoded.dest}, ${decoded.src}`;
    case 'ld-mb-a':
      return `${prefix}ld mb, a`;
    case 'ld-a-mb':
      return `${prefix}ld a, mb`;

    case 'add-pair':
      return `${prefix}add ${decoded.dest}, ${decoded.src}`;
    case 'adc-pair':
      return `${prefix}adc hl, ${decoded.src}`;
    case 'alu-reg':
      return `${prefix}${decoded.op} ${decoded.src}`;
    case 'alu-imm':
      return `${prefix}${decoded.op} ${hexByte(decoded.value)}`;

    case 'in-reg':
      return `${prefix}in ${decoded.reg}, (c)`;
    case 'out-reg':
      return `${prefix}out (c), ${decoded.reg}`;
    case 'in0':
      return `${prefix}in0 ${decoded.reg}, (${hexByte(decoded.port)})`;
    case 'out0':
      return `${prefix}out0 (${hexByte(decoded.port)}), ${decoded.reg}`;

    case 'bit-test':
      return `${prefix}bit ${decoded.bit}, ${decoded.reg}`;
    case 'bit-test-ind':
      return `${prefix}bit ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-res':
      return `${prefix}res ${decoded.bit}, ${decoded.reg}`;
    case 'bit-res-ind':
      return `${prefix}res ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-set':
      return `${prefix}set ${decoded.bit}, ${decoded.reg}`;
    case 'bit-set-ind':
      return `${prefix}set ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'rotate-reg':
      return `${prefix}${decoded.op} ${decoded.reg}`;
    case 'rotate-ind':
      return `${prefix}${decoded.op} (${decoded.indirectRegister})`;
    case 'indexed-cb-bit':
      return `${prefix}bit ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}res ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}set ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-rotate':
      return `${prefix}${decoded.op} ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;

    case 'lea':
      return `${prefix}lea ${decoded.dest}, ${formatIndexedOperand(decoded.base, decoded.displacement)}`;
    case 'im':
      return `${prefix}im ${decoded.value}`;

    default:
      return prefix + fallbackFormat(decoded);
  }
}

function countBlocks(blocks) {
  return Array.isArray(blocks) ? blocks.length : Object.keys(blocks).length;
}

function buildBlockRanges(blocks) {
  const rangesByMode = {
    adl: [],
    z80: [],
  };

  const entries = Array.isArray(blocks)
    ? blocks.map((block, index) => [`block-${index}`, block])
    : Object.entries(blocks);

  for (const [key, block] of entries) {
    if (!block) {
      continue;
    }

    const keyParts = typeof key === 'string' ? key.split(':') : [];
    const keyAddr = keyParts.length > 0 ? Number.parseInt(keyParts[0], 16) : NaN;
    const start = Number.isFinite(block.startPc)
      ? (Number(block.startPc) & 0xffffff)
      : (Number.isFinite(keyAddr) ? (keyAddr & 0xffffff) : null);
    const mode = typeof block.mode === 'string'
      ? block.mode
      : (keyParts[1] === 'z80' ? 'z80' : 'adl');

    if (start === null || (mode !== 'adl' && mode !== 'z80')) {
      continue;
    }

    let end = start;
    if (Array.isArray(block.instructions) && block.instructions.length > 0) {
      for (const instruction of block.instructions) {
        const pc = Number.isFinite(instruction?.pc) ? (Number(instruction.pc) & 0xffffff) : start;
        const length = Number.isFinite(instruction?.length) && instruction.length > 0
          ? Number(instruction.length)
          : 1;
        end = Math.max(end, pc + length - 1);
      }
    }

    const normalizedKey = typeof key === 'string' && key.includes(':')
      ? key
      : `${start.toString(16).padStart(6, '0')}:${mode}`;

    rangesByMode[mode].push({
      key: normalizedKey,
      start,
      end,
      mode,
    });
  }

  for (const ranges of Object.values(rangesByMode)) {
    ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  }

  return rangesByMode;
}

function findContainingBlockInMode(pc, mode) {
  const ranges = BLOCK_RANGES[mode] ?? [];
  let lo = 0;
  let hi = ranges.length - 1;
  let best = null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = ranges[mid];

    if (candidate.start <= pc) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best && pc >= best.start && pc <= best.end) {
    return best;
  }

  return null;
}

function findContainingBlock(pc, preferredMode) {
  if (preferredMode === 'adl' || preferredMode === 'z80') {
    return findContainingBlockInMode(pc, preferredMode)
      ?? findContainingBlockInMode(pc, preferredMode === 'adl' ? 'z80' : 'adl');
  }

  return findContainingBlockInMode(pc, 'adl') ?? findContainingBlockInMode(pc, 'z80');
}

function regName(name) {
  return String(name).toUpperCase();
}

function classifyInstruction(decoded, targetAddr) {
  if (typeof decoded.addr === 'number' && decoded.addr === targetAddr) {
    if (decoded.tag === 'ld-mem-pair') {
      return {
        kind: 'writer',
        score: 180,
        detail: 'absolute pair store',
        writeSummary: `stores ${regName(decoded.pair)} into ${hex(targetAddr)}`,
      };
    }

    if (decoded.tag === 'ld-pair-mem') {
      if (decoded.direction === 'to-mem') {
        return {
          kind: 'writer',
          score: 180,
          detail: 'absolute pair store',
          writeSummary: `stores ${regName(decoded.pair)} into ${hex(targetAddr)}`,
        };
      }

      return {
        kind: 'reader',
        score: 170,
        detail: 'absolute pair load',
        writeSummary: `reads ${hex(targetAddr)} into ${regName(decoded.pair)}`,
      };
    }

    if (decoded.tag === 'ld-mem-reg') {
      return {
        kind: 'writer',
        score: 175,
        detail: 'absolute byte store',
        writeSummary: `stores ${regName(decoded.src)} into ${hex(targetAddr)}`,
      };
    }

    if (decoded.tag === 'ld-reg-mem') {
      return {
        kind: 'reader',
        score: 165,
        detail: 'absolute byte load',
        writeSummary: `reads ${hex(targetAddr)} into ${regName(decoded.dest)}`,
      };
    }

    return {
      kind: 'memory-ref',
      score: 120,
      detail: `absolute memory reference via ${decoded.tag}`,
      writeSummary: `touches ${hex(targetAddr)} via ${decoded.tag}`,
    };
  }

  if (typeof decoded.value === 'number' && decoded.value === targetAddr) {
    if (decoded.tag === 'ld-pair-imm') {
      return {
        kind: 'address-constant',
        score: 110,
        detail: 'loads callback-table address as a literal',
        writeSummary: `loads literal ${hex(targetAddr)} into ${regName(decoded.pair)}`,
      };
    }

    return {
      kind: 'constant',
      score: 95,
      detail: 'uses the callback-table address as an immediate literal',
      writeSummary: `uses literal ${hex(targetAddr)}`,
    };
  }

  if (typeof decoded.target === 'number' && decoded.target === targetAddr) {
    return {
      kind: 'control-flow',
      score: 85,
      detail: 'uses the callback-table address as a control-flow target',
      writeSummary: `branches to ${hex(targetAddr)}`,
    };
  }

  return {
    kind: 'instruction-bytes',
    score: 20,
    detail: 'target bytes appear inside the instruction, but not as a named decoded operand',
    writeSummary: 'embedded bytes only',
  };
}

function sliceMatchesPattern(bytes, relativeOffset, pattern) {
  if (relativeOffset < 0 || relativeOffset + pattern.length > bytes.length) {
    return false;
  }

  for (let index = 0; index < pattern.length; index += 1) {
    if (bytes[relativeOffset + index] !== pattern[index]) {
      return false;
    }
  }

  return true;
}

function decodeHit(targetAddr, romOffset) {
  const pattern = [
    targetAddr & 0xff,
    (targetAddr >> 8) & 0xff,
    (targetAddr >> 16) & 0xff,
  ];
  const candidates = [];

  for (const mode of ['adl', 'z80']) {
    for (let start = Math.max(0, romOffset - DECODE_BACKTRACK); start <= romOffset; start += 1) {
      let decoded;

      try {
        decoded = decodeInstruction(romBytes, start, mode);
      } catch {
        continue;
      }

      if (!decoded || !Number.isFinite(decoded.length) || decoded.length <= 0) {
        continue;
      }

      const end = start + decoded.length;
      if (romOffset < start || romOffset + 2 >= end) {
        continue;
      }

      const bytes = romBytes.subarray(start, end);
      const relativeOffset = romOffset - start;
      if (!sliceMatchesPattern(bytes, relativeOffset, pattern)) {
        continue;
      }

      const classification = classifyInstruction(decoded, targetAddr);
      const block = findContainingBlock(start, mode);

      let score = classification.score - relativeOffset;
      if (block) {
        score += block.mode === mode ? 25 : 10;
      }

      candidates.push({
        start,
        mode,
        decoded,
        bytes,
        relativeOffset,
        classification,
        block,
        score,
      });
    }
  }

  candidates.sort((left, right) =>
    right.score - left.score
    || (right.block ? 1 : 0) - (left.block ? 1 : 0)
    || left.start - right.start
    || (left.mode === 'adl' ? -1 : 1)
  );

  if (candidates.length === 0) {
    return {
      targetAddr,
      romOffset,
      instructionPc: null,
      mode: null,
      instructionText: null,
      instructionBytes: null,
      kind: 'data',
      classification: 'no decodable instruction start found for this literal hit',
      writeSummary: 'undecoded bytes only',
      block: null,
    };
  }

  const best = candidates[0];
  return {
    targetAddr,
    romOffset,
    instructionPc: best.start,
    mode: best.mode,
    instructionText: formatInstruction(best.decoded),
    instructionBytes: bytesToHex(best.bytes),
    kind: best.classification.kind,
    classification: best.classification.detail,
    writeSummary: best.classification.writeSummary,
    block: best.block,
  };
}

function scanCallbackTableRegion() {
  const targets = [];
  const hitsByTarget = new Map();

  for (let addr = CALLBACK_TABLE_START; addr <= CALLBACK_TABLE_END; addr += 1) {
    targets.push(addr);
    hitsByTarget.set(addr, []);
  }

  for (let offset = 0; offset <= romBytes.length - 3; offset += 1) {
    if (romBytes[offset + 1] !== 0x2a || romBytes[offset + 2] !== 0xd0) {
      continue;
    }

    const candidateTarget = ((romBytes[offset + 2] << 16) | (romBytes[offset + 1] << 8) | romBytes[offset]) >>> 0;
    if (!hitsByTarget.has(candidateTarget)) {
      continue;
    }

    hitsByTarget.get(candidateTarget).push(decodeHit(candidateTarget, offset));
  }

  for (const hits of hitsByTarget.values()) {
    hits.sort((left, right) =>
      ((left.instructionPc ?? left.romOffset) - (right.instructionPc ?? right.romOffset))
      || (left.romOffset - right.romOffset)
    );
  }

  return { targets, hitsByTarget };
}

function summarizeKinds(entries) {
  const summary = {
    total: entries.length,
    writer: 0,
    reader: 0,
    'address-constant': 0,
    constant: 0,
    'control-flow': 0,
    'memory-ref': 0,
    'instruction-bytes': 0,
    data: 0,
  };

  for (const entry of entries) {
    if (summary[entry.kind] === undefined) {
      summary[entry.kind] = 0;
    }
    summary[entry.kind] += 1;
  }

  return summary;
}

function describeBlock(block) {
  if (!block) {
    return 'no';
  }

  return `yes ${block.key} [${hex(block.start)}-${hex(block.end)}]`;
}

function formatRow(entry) {
  const romAddr = entry.instructionPc === null ? 'n/a' : hex(entry.instructionPc);
  const mode = entry.mode ?? 'n/a';
  const instruction = entry.instructionText ?? '(undecoded)';
  const write = entry.writeSummary ?? entry.classification ?? '(unknown)';

  return [
    hex(entry.targetAddr),
    romAddr,
    hex(entry.romOffset),
    mode,
    describeBlock(entry.block),
    instruction,
    write,
  ].join(' | ');
}

function printSummary(targets, hitsByTarget) {
  console.log('Summary By Callback Slot');
  console.log('------------------------');
  for (const target of targets) {
    const hits = hitsByTarget.get(target) ?? [];
    const counts = summarizeKinds(hits);
    console.log(
      `${hex(target)}: total=${counts.total} writer=${counts.writer} reader=${counts.reader} literal=${counts['address-constant'] + counts.constant} other=${counts.total - counts.writer - counts.reader - counts['address-constant'] - counts.constant}`
    );
  }
  console.log('');
}

function printSection(title, entries) {
  console.log(title);
  console.log('-'.repeat(title.length));

  if (entries.length === 0) {
    console.log('(none)');
    console.log('');
    return;
  }

  console.log('TARGET | ROM_ADDR | HIT_AT | MODE | IN_BLOCK | INSTRUCTION | WRITES_WHAT');
  for (const entry of entries) {
    console.log(formatRow(entry));
  }
  console.log('');
}

const { targets, hitsByTarget } = scanCallbackTableRegion();
const primaryHits = hitsByTarget.get(PRIMARY_TARGET) ?? [];
const nearbyHits = targets
  .filter((target) => target !== PRIMARY_TARGET)
  .flatMap((target) => hitsByTarget.get(target) ?? []);

console.log('Phase 178: Callback Table Setup Literal Scan');
console.log('============================================');
console.log('');
console.log(`ROM scanned: ${hex(0x000000)}-${hex(ROM_LIMIT - 1)}`);
console.log(`Callback table region: ${hex(CALLBACK_TABLE_START)}-${hex(CALLBACK_TABLE_END)}`);
console.log(`Primary target: ${hex(PRIMARY_TARGET)} (little-endian bytes d7 2a d0)`);
console.log(`PRELIFTED_BLOCKS loaded: ${countBlocks(BLOCKS)}`);
console.log('');
console.log('Notes');
console.log('-----');
console.log('- ROM_ADDR is the decoded instruction start.');
console.log('- HIT_AT is the exact ROM byte offset where the little-endian callback-table literal appears.');
console.log('- IN_BLOCK reports the enclosing PRELIFTED_BLOCKS entry when the decoded instruction PC falls inside a lifted block range.');
console.log('');

printSummary(targets, hitsByTarget);
printSection(`Primary Target ${hex(PRIMARY_TARGET)}`, primaryHits);
printSection(`Nearby Callback Table Hits ${hex(CALLBACK_TABLE_START)}-${hex(CALLBACK_TABLE_END)} (excluding ${hex(PRIMARY_TARGET)})`, nearbyHits);

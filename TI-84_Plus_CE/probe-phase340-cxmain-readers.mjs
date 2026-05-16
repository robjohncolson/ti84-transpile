#!/usr/bin/env node

import fs from 'fs';

import { decodeInstruction } from './ez80-decoder.js';

const rom = fs.readFileSync(new URL('./ROM.rom', import.meta.url));
const ROM_SIZE = rom.length;

const TARGETS = [
  { label: 'cxMain', addr: 0xD007CA, showLoadDisasm: true },
  { label: 'cxMain+1', addr: 0xD007CB, showLoadDisasm: false },
  { label: 'cxMain+2', addr: 0xD007CC, showLoadDisasm: false },
];

const KNOWN_CXMAIN_WRITER = 0x08C8CB;
const TYPE_ORDER = new Map([
  ['LOAD', 0],
  ['STORE', 1],
  ['CALL/JP target', 2],
  ['DATA/FALSE_POSITIVE', 3],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function clamp(value, lower, upper) {
  return Math.max(lower, Math.min(upper, value));
}

function formatDisp(value) {
  if (!Number.isFinite(value)) {
    return '+0';
  }
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatImm(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return value > 0xFF ? hex(value, value > 0xFFFF ? 6 : 4) : hexByte(value);
}

function bytesForAddress(addr) {
  return [addr & 0xFF, (addr >>> 8) & 0xFF, (addr >>> 16) & 0xFF];
}

function byteString(start, count) {
  const from = clamp(start, 0, ROM_SIZE);
  const to = clamp(from + Math.max(0, count), 0, ROM_SIZE);
  return Array.from(rom.subarray(from, to), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function hitContext(offset, matchLength = 3, radius = 10) {
  const beforeStart = Math.max(0, offset - radius);
  const before = byteString(beforeStart, offset - beforeStart);
  const middle = byteString(offset, matchLength);
  const afterEnd = Math.min(ROM_SIZE, offset + matchLength + radius);
  const after = byteString(offset + matchLength, afterEnd - (offset + matchLength));
  return [before, `[${middle}]`, after].filter(Boolean).join(' ');
}

function prefixText(inst) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
}

function formatGenericProps(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'tag',
    'mode',
    'modePrefix',
    'fallthrough',
    'terminates',
    'direction',
    'kind',
    'nextMode',
  ]);

  const props = [];
  for (const [key, value] of Object.entries(inst ?? {})) {
    if (ignored.has(key) || value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'number') {
      if (key === 'addr' || key === 'target') {
        props.push(`${key}=${hex(value)}`);
      } else if (key === 'value') {
        props.push(`${key}=${formatImm(value)}`);
      } else if (key === 'displacement') {
        props.push(`${key}=${formatDisp(value)}`);
      } else {
        props.push(`${key}=${value}`);
      }
      continue;
    }

    props.push(`${key}=${value}`);
  }

  return props.join(' ');
}

function formatInstruction(inst) {
  if (!inst) {
    return '<unknown>';
  }

  const prefix = prefixText(inst);

  switch (inst.tag) {
    case 'ld-reg-imm':
      return `${prefix}ld ${inst.dest}, ${formatImm(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-imm':
      return `${prefix}ld ${inst.pair}, ${formatImm(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
      }
      return `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `${prefix}ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm':
      return `${prefix}ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}ld ${inst.pair}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'ld-indexed-pair':
      return `${prefix}ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.pair}`;
    case 'ld-ixiy-indexed':
      return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'ld-indexed-ixiy':
      return `${prefix}ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.src}`;
    case 'push':
      return `${prefix}push ${inst.pair}`;
    case 'pop':
      return `${prefix}pop ${inst.pair}`;
    case 'call':
      return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}jp (${inst.indirectRegister})`;
    case 'ret':
      return `${prefix}ret`;
    case 'ret-conditional':
      return `${prefix}ret ${inst.condition}`;
    case 'add-pair':
      return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair':
      return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair':
      return `${prefix}sbc hl, ${inst.src}`;
    case 'inc-pair':
      return `${prefix}inc ${inst.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${inst.pair}`;
    case 'inc-reg':
      return `${prefix}inc ${inst.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${inst.reg}`;
    case 'alu-reg':
      return inst.op === 'cp'
        ? `${prefix}cp ${inst.src}`
        : `${prefix}${inst.op} a, ${inst.src}`;
    case 'alu-imm':
      return inst.op === 'cp'
        ? `${prefix}cp ${hexByte(inst.value)}`
        : `${prefix}${inst.op} a, ${hexByte(inst.value)}`;
    case 'alu-ixd':
      return inst.op === 'cp'
        ? `${prefix}cp (${inst.indexRegister}${formatDisp(inst.displacement)})`
        : `${prefix}${inst.op} a, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'bit-test':
      return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res':
      return `${prefix}res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind':
      return `${prefix}res ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set':
      return `${prefix}set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind':
      return `${prefix}set ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit':
      return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `${prefix}res ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `${prefix}set ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-rotate':
      return `${prefix}${inst.operation} (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'ld-special':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-sp-hl':
      return `${prefix}ld sp, hl`;
    case 'ld-sp-pair':
      return `${prefix}ld sp, ${inst.pair}`;
    case 'ldir':
    case 'lddr':
    case 'ldi':
    case 'ldd':
    case 'cpi':
    case 'cpir':
    case 'cpd':
    case 'cpdr':
    case 'di':
    case 'ei':
    case 'scf':
    case 'ccf':
    case 'nop':
    case 'halt':
    case 'ex-de-hl':
    case 'ex-sp-hl':
    case 'exx':
      return `${prefix}${inst.tag.replace(/-/g, ' ')}`;
    default: {
      const props = formatGenericProps(inst);
      return `${prefix}${inst.tag}${props ? ` ${props}` : ''}`;
    }
  }
}

function instructionReferencesTarget(inst, target) {
  if (!inst) {
    return false;
  }

  if (typeof inst.addr === 'number' && inst.addr === target) {
    return true;
  }
  if (typeof inst.target === 'number' && inst.target === target) {
    return true;
  }
  if (inst.tag === 'ld-pair-imm' && typeof inst.value === 'number' && inst.value === target) {
    return true;
  }

  return false;
}

function classifyInstruction(inst) {
  if (!inst) {
    return null;
  }

  if (inst.tag === 'ld-reg-mem') {
    return { type: 'LOAD', reason: 'memory read' };
  }

  if (inst.tag === 'ld-pair-mem') {
    return inst.direction === 'to-mem'
      ? { type: 'STORE', reason: 'pair store' }
      : { type: 'LOAD', reason: 'pair load' };
  }

  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
    return { type: 'STORE', reason: 'memory write' };
  }

  if (
    inst.tag === 'call' ||
    inst.tag === 'call-conditional' ||
    inst.tag === 'jp' ||
    inst.tag === 'jp-conditional'
  ) {
    return { type: 'CALL/JP target', reason: 'direct control-flow immediate' };
  }

  if (inst.tag === 'ld-pair-imm') {
    return { type: 'DATA/FALSE_POSITIVE', reason: 'address literal, not dereference' };
  }

  return { type: 'DATA/FALSE_POSITIVE', reason: `unhandled tag ${inst.tag}` };
}

function findBestDecodeWindow(site, instructionLength, options = {}) {
  const beforeBytes = options.beforeBytes ?? 20;
  const afterBytes = options.afterBytes ?? 20;
  const slop = options.slop ?? 12;

  const desiredStart = Math.max(0, site - beforeBytes);
  const earliestStart = Math.max(0, desiredStart - slop);
  const latestExclusive = Math.min(ROM_SIZE, site + instructionLength + afterBytes);

  let best = null;

  for (let candidate = earliestStart; candidate <= site; candidate++) {
    const instructions = [];
    let pc = candidate;
    let exactSite = false;
    let valid = true;

    while (pc < latestExclusive) {
      let inst;
      try {
        inst = decodeInstruction(rom, pc, 'adl');
      } catch {
        valid = false;
        break;
      }

      if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
        valid = false;
        break;
      }

      if (pc < site && pc + inst.length > site) {
        valid = false;
        break;
      }

      instructions.push(inst);
      if (pc === site) {
        exactSite = true;
      }

      pc += inst.length;
    }

    if (!valid || !exactSite) {
      continue;
    }

    const coveredBefore = Math.min(site - candidate, beforeBytes);
    const coveredAfter = Math.min(Math.max(0, pc - (site + instructionLength)), afterBytes);
    const startPenalty = Math.abs(candidate - desiredStart);
    const score = (coveredBefore * 1000) + (coveredAfter * 10) - startPenalty;

    if (!best || score > best.score) {
      best = { start: candidate, end: pc, instructions, score };
    }
  }

  return best;
}

function scoreCandidate(candidate, hitOffset) {
  const typeWeight =
    candidate.classification.type === 'LOAD' ? 4000
      : candidate.classification.type === 'STORE' ? 3000
        : candidate.classification.type === 'CALL/JP target' ? 2000
          : 1000;

  const windowWeight = candidate.window?.score ?? 0;
  const prefixWeight = candidate.inst.modePrefix ? 5 : 0;
  const lengthWeight = (candidate.inst.length ?? 0) * 10;
  const leadInWeight = Math.max(0, hitOffset - candidate.start);

  return typeWeight + windowWeight + prefixWeight + lengthWeight + leadInWeight;
}

function analyzeHit(target, offset) {
  const matchLength = 3;
  const candidates = [];

  for (let start = Math.max(0, offset - 4); start <= offset; start++) {
    let inst;
    try {
      inst = decodeInstruction(rom, start, 'adl');
    } catch {
      continue;
    }

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      continue;
    }

    const instEnd = start + inst.length;
    if (start > offset || instEnd < offset + matchLength) {
      continue;
    }

    if (!instructionReferencesTarget(inst, target)) {
      continue;
    }

    const classification = classifyInstruction(inst);
    if (!classification) {
      continue;
    }

    const window = findBestDecodeWindow(start, inst.length, {
      beforeBytes: 20,
      afterBytes: 20,
      slop: 16,
    });

    const candidate = {
      start,
      inst,
      classification,
      window,
    };
    candidate.score = scoreCandidate(candidate, offset);
    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    return {
      rawOffset: offset,
      address: offset,
      type: 'DATA/FALSE_POSITIVE',
      reason: 'no aligned 24-bit instruction decode found',
      instructionText: '<no aligned instruction>',
      instructionLength: 3,
      window: null,
      context: hitContext(offset, matchLength, 10),
    };
  }

  candidates.sort((left, right) =>
    (right.score - left.score) ||
    ((TYPE_ORDER.get(left.classification.type) ?? 99) - (TYPE_ORDER.get(right.classification.type) ?? 99)) ||
    (left.start - right.start)
  );

  const best = candidates[0];
  return {
    rawOffset: offset,
    address: best.start,
    type: best.classification.type,
    reason: best.classification.reason,
    instructionText: formatInstruction(best.inst),
    instructionLength: best.inst.length,
    window: best.window,
    inst: best.inst,
    context: hitContext(offset, matchLength, 10),
  };
}

function scanTarget(label, addr) {
  const bytes = bytesForAddress(addr);
  const hits = [];

  for (let offset = 0; offset <= ROM_SIZE - 3; offset++) {
    if (
      rom[offset] === bytes[0] &&
      rom[offset + 1] === bytes[1] &&
      rom[offset + 2] === bytes[2]
    ) {
      hits.push(analyzeHit(addr, offset));
    }
  }

  hits.sort((left, right) =>
    (left.address - right.address) ||
    ((TYPE_ORDER.get(left.type) ?? 99) - (TYPE_ORDER.get(right.type) ?? 99))
  );

  return { label, addr, bytes, hits };
}

function printTable(records) {
  const headers = ['Address', 'Type', 'Instruction', 'Context (+/-10 bytes hex)'];
  const widths = headers.map((header) => header.length);
  const rows = records.map((record) => [
    hex(record.address),
    record.type,
    record.instructionText,
    record.context,
  ]);

  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i], String(row[i]).length);
    }
  }

  console.log(headers.map((header, i) => header.padEnd(widths[i])).join('  '));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) {
    console.log(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  '));
  }
}

function summarizeTypes(records) {
  const counts = new Map([
    ['LOAD', 0],
    ['STORE', 0],
    ['CALL/JP target', 0],
    ['DATA/FALSE_POSITIVE', 0],
  ]);

  for (const record of records) {
    counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([type, count]) => `${type}=${count}`)
    .join('  ');
}

function getWindowInstructions(record) {
  if (!record.window) {
    return [];
  }

  const from = Math.max(0, record.address - 20);
  const to = Math.min(ROM_SIZE, record.address + record.instructionLength + 20);
  return record.window.instructions.filter((inst) =>
    (inst.pc + inst.length) > from && inst.pc < to
  );
}

function printLoadWindows(records) {
  const loads = records.filter((record) => record.type === 'LOAD');

  console.log('\nLOAD disassembly windows (+/-20 bytes):');
  if (loads.length === 0) {
    console.log('  (no LOAD hits)');
    return;
  }

  for (const record of loads) {
    const from = Math.max(0, record.address - 20);
    const to = Math.min(ROM_SIZE, record.address + record.instructionLength + 20);
    const instructions = getWindowInstructions(record);

    console.log(`\n${hex(record.address)}  ${record.instructionText}`);
    console.log(`Raw bytes ${hex(from)}..${hex(to - 1)}: ${byteString(from, to - from)}`);

    if (instructions.length === 0) {
      console.log('  (no aligned disassembly window found)');
      continue;
    }

    for (const inst of instructions) {
      const marker = inst.pc === record.address ? '  <== LOAD' : '';
      const bytes = byteString(inst.pc, inst.length);
      console.log(`  ${hex(inst.pc)}  ${bytes.padEnd(22)}  ${formatInstruction(inst)}${marker}`);
    }
  }
}

function printStoreCheck(records) {
  const stores = records.filter((record) => record.type === 'STORE');
  const known = stores.find((record) => record.address === KNOWN_CXMAIN_WRITER);
  const others = stores.filter((record) => record.address !== KNOWN_CXMAIN_WRITER);

  console.log('\nKnown cxMain writer check:');
  if (known) {
    console.log(`  ${hex(KNOWN_CXMAIN_WRITER)}: FOUND  ${known.instructionText}`);
  } else {
    console.log(`  ${hex(KNOWN_CXMAIN_WRITER)}: NOT FOUND among classified STORE hits`);
  }

  console.log('Other cxMain STORE hits:');
  if (others.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const record of others) {
    console.log(`  ${hex(record.address)}  ${record.instructionText}`);
  }
}

function printSection(result) {
  const bytesText = result.bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');

  console.log(`\n=== ${result.label} @ ${hex(result.addr)} (${bytesText}) ===`);
  console.log(`Hits: ${result.hits.length}`);

  if (result.hits.length === 0) {
    console.log('  (no hits)');
    return;
  }

  printTable(result.hits);
  console.log(`\nType summary: ${summarizeTypes(result.hits)}`);

  if (result.addr === 0xD007CA) {
    printStoreCheck(result.hits);
  }

  if (result.showLoadDisasm) {
    printLoadWindows(result.hits);
  }
}

console.log('Phase 340: cxMain ROM reader scan');
console.log(`ROM size: ${hex(ROM_SIZE, 8)} (${ROM_SIZE} bytes)`);
console.log('Targets: 0xD007CA, 0xD007CB, 0xD007CC');

const results = TARGETS.map((target) => ({
  ...scanTarget(target.label, target.addr),
  showLoadDisasm: target.showLoadDisasm,
}));

for (const result of results) {
  printSection(result);
}

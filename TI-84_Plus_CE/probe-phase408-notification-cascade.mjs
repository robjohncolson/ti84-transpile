#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('fs');

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = require('fs').readFileSync(ROM_PATH);

const MODE = 'adl';
const RANGE_START = 0x012000;
const RANGE_END = 0x013000;
const TARGET_ADDR = 0xD177B8;
const DISPATCH_KEY = 0x00883C;
const EVENT_WRAPPER = 0x01322D;
const SEQCASE_DIRECT = 0x002623;

const PATTERNS = [
  { name: 'LD A,(0xD177B8)', bytes: [0x3A, 0xB8, 0x77, 0xD1] },
  { name: 'LD HL,0xD177B8', bytes: [0x21, 0xB8, 0x77, 0xD1] },
  { name: 'SIS LD A,(0xD177B8)', bytes: [0x40, 0x3A, 0xB8, 0x77, 0xD1] },
  { name: 'LIS LD A,(0xD177B8)', bytes: [0x49, 0x3A, 0xB8, 0x77, 0xD1] },
  { name: 'SIL LD A,(0xD177B8)', bytes: [0x52, 0x3A, 0xB8, 0x77, 0xD1] },
  { name: 'LIL LD A,(0xD177B8)', bytes: [0x5B, 0x3A, 0xB8, 0x77, 0xD1] },
  { name: 'SIS LD HL,0xD177B8', bytes: [0x40, 0x21, 0xB8, 0x77, 0xD1] },
  { name: 'LIS LD HL,0xD177B8', bytes: [0x49, 0x21, 0xB8, 0x77, 0xD1] },
  { name: 'SIL LD HL,0xD177B8', bytes: [0x52, 0x21, 0xB8, 0x77, 0xD1] },
  { name: 'LIL LD HL,0xD177B8', bytes: [0x5B, 0x21, 0xB8, 0x77, 0xD1] },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function bytesAt(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const signed = Number(displacement ?? 0);
  const sign = signed >= 0 ? '+' : '-';
  return `(${String(indexRegister).toUpperCase()}${sign}${hexByte(Math.abs(signed))})`;
}

function decodeSafe(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) return null;
    return inst;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) return '<decode-failed>';

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`
        : `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-reg-ixd': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-sp-pair': return `${prefix}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'bit-test': return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'nop':
    case 'halt':
    case 'di':
    case 'ei':
    case 'xor-a':
      return `${prefix}${String(inst.tag).toUpperCase()}`;
    default: {
      const ignored = new Set([
        'pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'tag',
      ]);
      const extras = Object.entries(inst)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => typeof value === 'number'
          ? `${key}=${value > 0xFF ? hex(value) : hexByte(value)}`
          : `${key}=${value}`)
        .join(' ');
      return extras ? `${prefix}${inst.tag} ${extras}` : `${prefix}${inst.tag}`;
    }
  }
}

function disassembleForward(startPc, maxInstructions) {
  const rows = [];
  let pc = startPc;
  for (let i = 0; i < maxInstructions && pc < rom.length; i++) {
    const inst = decodeSafe(pc);
    if (!inst) break;
    rows.push({ pc, inst });
    pc = inst.nextPc;
    if (inst.tag === 'ret') break;
  }
  return rows;
}

function renderRows(rows, indent = '    ') {
  return rows.map(({ pc, inst }) =>
    `${indent}${hex(pc)}  ${bytesAt(pc, inst.length).padEnd(20)}  ${formatInstruction(inst)}`
  );
}

function findRawHits(pattern) {
  const hits = [];
  for (let i = RANGE_START; i <= RANGE_END - pattern.bytes.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.bytes.length; j++) {
      if (rom[i + j] !== pattern.bytes[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

function isValidatedReference(pc) {
  const inst = decodeSafe(pc);
  if (!inst) return false;

  if (inst.tag === 'ld-reg-mem' && inst.dest === 'a' && inst.addr === TARGET_ADDR) return true;
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl' && inst.value === TARGET_ADDR) return true;
  return false;
}

function collectCascades(validHits) {
  const hitSet = new Set(validHits);
  const covered = new Set();
  const cascades = [];

  for (const hit of validHits) {
    if (covered.has(hit)) continue;

    let pc = hit;
    const comparisons = [];

    while (true) {
      const loadInst = decodeSafe(pc);
      if (!loadInst || loadInst.tag !== 'ld-reg-mem' || loadInst.dest !== 'a' || loadInst.addr !== TARGET_ADDR) {
        break;
      }

      const cmpInst = decodeSafe(loadInst.nextPc);
      if (!cmpInst || cmpInst.tag !== 'alu-imm' || cmpInst.op !== 'cp') break;

      const branchInst = decodeSafe(cmpInst.nextPc);
      if (!branchInst || !['jr-conditional', 'jp-conditional'].includes(branchInst.tag)) break;

      comparisons.push({
        site: pc,
        comparePc: cmpInst.pc,
        branchPc: branchInst.pc,
        value: cmpInst.value,
        branchType: branchInst.tag,
        condition: branchInst.condition,
        branchTarget: branchInst.target,
        fallthroughPc: branchInst.nextPc,
      });
      covered.add(pc);

      if (hitSet.has(branchInst.nextPc)) {
        pc = branchInst.nextPc;
        continue;
      }

      break;
    }

    if (comparisons.length > 0) {
      cascades.push({
        start: hit,
        comparisons,
        fallthroughPc: comparisons[comparisons.length - 1].fallthroughPc,
      });
    }
  }

  return cascades;
}

function parseSeqcaseTable(base) {
  const count = rom[base] | (rom[base + 1] << 8);
  const rangeBase = read24(base + 2);
  const targets = [];
  let offset = base + 5;

  for (let i = 0; i < count; i++) {
    targets.push(read24(offset));
    offset += 3;
  }

  const defaultTarget = read24(offset);
  return { count, rangeBase, targets, defaultTarget, tableEnd: offset + 3 };
}

function findSeqcaseSummary(rows) {
  const callRow = rows.find((row) => row.inst.tag === 'call' && row.inst.target === SEQCASE_DIRECT);
  if (!callRow) return null;

  const table = parseSeqcaseTable(callRow.inst.nextPc);
  const cases = table.targets.map((target, index) => {
    const selector = table.rangeBase + index;
    const firstInst = decodeSafe(target);
    return {
      selector,
      target,
      firstLine: firstInst ? `${hex(target)}  ${formatInstruction(firstInst)}` : `${hex(target)}  <decode-failed>`,
    };
  });

  return {
    tablePc: callRow.inst.nextPc,
    count: table.count,
    rangeBase: table.rangeBase,
    defaultTarget: table.defaultTarget,
    cases,
  };
}

function extractDispatchKeyCalls(rows) {
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.inst.tag !== 'call' || row.inst.target !== DISPATCH_KEY) continue;

    const args = [];
    for (let j = i - 1; j >= 1 && args.length < 2; j--) {
      const pushRow = rows[j];
      const ldRow = rows[j - 1];
      if (pushRow.inst.tag === 'push' && pushRow.inst.pair === 'bc'
        && ldRow.inst.tag === 'ld-pair-imm' && ldRow.inst.pair === 'bc') {
        args.unshift(ldRow.inst.value);
        j -= 1;
      }
    }

    if (args.length === 2) {
      results.push({
        callPc: row.pc,
        state: args[0],
        key: args[1],
      });
    }
  }
  return results;
}

function extractEventCallbackCalls(rows) {
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.inst.tag !== 'call' || row.inst.target !== EVENT_WRAPPER) continue;

    if (i >= 2
      && rows[i - 1].inst.tag === 'push'
      && rows[i - 1].inst.pair === 'bc'
      && rows[i - 2].inst.tag === 'ld-pair-imm'
      && rows[i - 2].inst.pair === 'bc') {
      results.push({
        callPc: row.pc,
        mask: rows[i - 2].inst.value,
      });
    }
  }
  return results;
}

function describeRows(startPc, maxInstructions = 18) {
  const rows = disassembleForward(startPc, maxInstructions);
  return {
    rows,
    dispatchKeyCalls: extractDispatchKeyCalls(rows),
    eventCallbackCalls: extractEventCallbackCalls(rows),
    seqcase: findSeqcaseSummary(rows),
  };
}

const rawPatternHits = PATTERNS
  .map((pattern) => ({
    ...pattern,
    hits: findRawHits(pattern),
  }))
  .filter((entry) => entry.hits.length > 0);

const validatedHits = [...new Set(
  rawPatternHits.flatMap((entry) => entry.hits).filter((pc) => isValidatedReference(pc))
)].sort((a, b) => a - b);

const cascades = collectCascades(validatedHits);

console.log('=== Phase 408: Page 0x012xxx Notification Payload Cascade ===\n');
console.log(`Range scanned: ${hex(RANGE_START)}..${hex(RANGE_END - 1)}`);
console.log(`Target RAM byte: ${hex(TARGET_ADDR, 8)}\n`);

console.log('Raw byte-pattern hits:');
for (const entry of rawPatternHits) {
  console.log(`- ${entry.name}: ${entry.hits.map((pc) => hex(pc)).join(', ')}`);
}
console.log();

console.log(`Validated D177B8 references in range (${validatedHits.length}):`);
for (const pc of validatedHits) {
  const inst = decodeSafe(pc);
  console.log(`- ${hex(pc)}  ${bytesAt(pc, inst.length)}  ${formatInstruction(inst)}`);
}
console.log();

const rejectedHits = rawPatternHits
  .flatMap((entry) => entry.hits.map((pc) => ({ name: entry.name, pc })))
  .filter(({ pc }) => !validatedHits.includes(pc));

if (rejectedHits.length > 0) {
  console.log('Rejected raw matches (overlaps / wrong decode target):');
  for (const hit of rejectedHits) {
    const inst = decodeSafe(hit.pc);
    const rendered = inst ? formatInstruction(inst) : '<decode-failed>';
    console.log(`- ${hit.name} at ${hex(hit.pc)} -> ${rendered}`);
  }
  console.log();
}

console.log(`Cascade / single-test sites (${cascades.length}):\n`);

for (const cascade of cascades) {
  console.log(`--- Site ${hex(cascade.start)} (${cascade.comparisons.length} compare${cascade.comparisons.length === 1 ? '' : 's'}) ---`);
  for (const cmp of cascade.comparisons) {
    console.log(
      `  ${hex(cmp.site)}: CP ${hexByte(cmp.value)} -> ${cmp.branchType === 'jr-conditional' ? 'JR' : 'JP'} ${String(cmp.condition).toUpperCase()} ${hex(cmp.branchTarget)}`
    );
  }
  console.log(`  Fallthrough PC: ${hex(cascade.fallthroughPc)}\n`);

  console.log('  Fallthrough disassembly:');
  const fallthrough = describeRows(cascade.fallthroughPc, cascade.start === 0x012D78 ? 34 : 18);
  for (const line of renderRows(fallthrough.rows, '    ')) console.log(line);
  if (fallthrough.dispatchKeyCalls.length > 0) {
    for (const call of fallthrough.dispatchKeyCalls) {
      console.log(`    dispatch_key at ${hex(call.callPc)} -> key=${hexByte(call.key)}, state=${hexByte(call.state)}`);
    }
  }
  if (fallthrough.eventCallbackCalls.length > 0) {
    for (const call of fallthrough.eventCallbackCalls) {
      console.log(`    event_wrapper at ${hex(call.callPc)} -> mask=${hex(call.mask)}`);
    }
  }
  console.log();

  const uniqueTargets = [...new Set(cascade.comparisons.map((cmp) => cmp.branchTarget))];
  for (const target of uniqueTargets) {
    const branchTarget = describeRows(target, target === 0x0120AA ? 20 : (target === 0x012D6A ? 22 : 18));
    console.log(`  Branch target ${hex(target)}:`);
    for (const line of renderRows(branchTarget.rows, '    ')) console.log(line);

    if (branchTarget.seqcase) {
      console.log(`    _seqcase table at ${hex(branchTarget.seqcase.tablePc)}: count=${branchTarget.seqcase.count}, base=${hex(branchTarget.seqcase.rangeBase)}`);
      for (const entry of branchTarget.seqcase.cases) {
        console.log(`      selector ${hex(entry.selector)} -> ${hex(entry.target)}  (${entry.firstLine})`);
      }
      console.log(`      default -> ${hex(branchTarget.seqcase.defaultTarget)}`);
    }

    if (branchTarget.dispatchKeyCalls.length > 0) {
      for (const call of branchTarget.dispatchKeyCalls) {
        console.log(`    dispatch_key at ${hex(call.callPc)} -> key=${hexByte(call.key)}, state=${hexByte(call.state)}`);
      }
    }

    if (branchTarget.eventCallbackCalls.length > 0) {
      for (const call of branchTarget.eventCallbackCalls) {
        console.log(`    event_wrapper at ${hex(call.callPc)} -> mask=${hex(call.mask)}`);
      }
    }

    console.log();
  }
}

console.log('Done.');

#!/usr/bin/env node

/**
 * Phase 384 - find who calls 0x0300CB in the TI-84 Plus CE ROM.
 *
 * This probe:
 *   1. Reads ROM.rom (expected size: 4,194,304 bytes).
 *   2. Scans the entire ROM for ADL CALL/JP instructions that target:
 *        0x0300CB, 0x0300A1, 0x0300A0, 0x0300CC, 0x0300CD
 *   3. Reports the ROM offset, raw bytes, mnemonic, approximate function
 *      region, and nearby transpiled/seed context when ROM.transpiled.js is
 *      available.
 *   4. Also scans for the raw 24-bit sequence CB 00 03 anywhere in ROM to
 *      catch possible jump-table or data-table references.
 *
 * Usage:
 *   node TI-84_Plus_CE/probe-phase384-callers-0300CB.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const EXPECTED_ROM_SIZE = 0x400000;
const MODE = 'adl';
const FUNCTION_LOOKBACK = 0x120;
const FUNCTION_MAX_BYTES = 0x180;
const CONTEXT_LOOKBACK = 0x18;
const CONTEXT_LOOKAHEAD = 0x24;
const NEARBY_BLOCK_THRESHOLD = 0x40;
const NEARBY_SEED_THRESHOLD = 0x80;

const TARGETS = [
  { addr: 0x0300CB, label: 'primary function entry' },
  { addr: 0x0300A1, label: 'nearby preceding function entry' },
  { addr: 0x0300A0, label: 'nearby RET / prior-function tail' },
  { addr: 0x0300CC, label: 'nearby interior address' },
  { addr: 0x0300CD, label: 'nearby interior branch site' },
];

const TARGET_BY_ADDR = new Map(TARGETS.map((target) => [target.addr, target]));

const CONTROL_PATTERNS = [
  { opcode: 0xCD, mnemonic: 'CALL' },
  { opcode: 0xC3, mnemonic: 'JP' },
  { opcode: 0xC4, mnemonic: 'CALL NZ' },
  { opcode: 0xCC, mnemonic: 'CALL Z' },
  { opcode: 0xD4, mnemonic: 'CALL NC' },
  { opcode: 0xDC, mnemonic: 'CALL C' },
  { opcode: 0xE4, mnemonic: 'CALL PO' },
  { opcode: 0xEC, mnemonic: 'CALL PE' },
  { opcode: 0xF4, mnemonic: 'CALL P' },
  { opcode: 0xFC, mnemonic: 'CALL M' },
  { opcode: 0xC2, mnemonic: 'JP NZ' },
  { opcode: 0xCA, mnemonic: 'JP Z' },
  { opcode: 0xD2, mnemonic: 'JP NC' },
  { opcode: 0xDA, mnemonic: 'JP C' },
  { opcode: 0xE2, mnemonic: 'JP PO' },
  { opcode: 0xEA, mnemonic: 'JP PE' },
  { opcode: 0xF2, mnemonic: 'JP P' },
  { opcode: 0xFA, mnemonic: 'JP M' },
];

const CONTROL_BY_OPCODE = new Map(CONTROL_PATTERNS.map((pattern) => [pattern.opcode, pattern]));
const HARD_TERMINATOR_TAGS = new Set(['ret', 'jp', 'jp-indirect', 'reti', 'retn']);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function bytesHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function read24(buffer, offset) {
  return ((buffer[offset] ?? 0) | ((buffer[offset + 1] ?? 0) << 8) | ((buffer[offset + 2] ?? 0) << 16)) >>> 0;
}

function signedHexDelta(delta) {
  if (delta === 0) return 'exact';
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${hex(Math.abs(delta), 6)}`;
}

function safeDecode(romBytes, pc) {
  try {
    return decodeInstruction(romBytes, pc, MODE);
  } catch {
    return null;
  }
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${displacement >= 0 ? '+' : ''}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  switch (inst.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${String(inst.indirectRegister).toUpperCase()})`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'push': return `push ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `pop ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `ld ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `ld ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `ld ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `ld (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem': {
      const pair = String(inst.pair ?? inst.dest).toUpperCase();
      if (inst.direction === 'to-mem') return `ld (${hex(inst.addr)}), ${pair}`;
      return `ld ${pair}, (${hex(inst.addr)})`;
    }
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-pair': return `ld sp, ${String(inst.pair).toUpperCase()}`;
    case 'ld-ind-imm': return `ld (HL), ${hexByte(inst.value)}`;
    case 'alu-reg':
      return inst.op === 'xor' && String(inst.src).toLowerCase() === 'a'
        ? 'xor a'
        : `${inst.op} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ind': return `${inst.op} (${String(inst.indirectRegister ?? 'hl').toUpperCase()})`;
    case 'add-pair': return `add ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg': return `inc ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `dec ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `inc ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `dec ${String(inst.pair).toUpperCase()}`;
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'rrca': return 'rrca';
    case 'rlca': return 'rlca';
    case 'ccf': return 'ccf';
    case 'scf': return 'scf';
    case 'cpl': return 'cpl';
    case 'neg': return 'neg';
    case 'ldir': return 'ldir';
    case 'lddr': return 'lddr';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'exx': return 'exx';
    case 'rst': return `rst ${hexByte(inst.target ?? inst.vector ?? 0)}`;
    case 'bit-test': return `bit ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `set ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `res ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind': return `set ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind': return `res ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixiy-indexed': return `ld ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy': return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-indexed': return `ld ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'lea': return `lea ${String(inst.dest).toUpperCase()}, ${String(inst.base).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    default: {
      const parts = [inst.tag];
      if (inst.op) parts.push(`op=${inst.op}`);
      if (inst.condition) parts.push(`cond=${inst.condition}`);
      if (inst.target !== undefined) parts.push(`target=${hex(inst.target)}`);
      if (inst.value !== undefined) parts.push(`value=${hex(inst.value)}`);
      if (inst.addr !== undefined) parts.push(`addr=${hex(inst.addr)}`);
      if (inst.dest !== undefined) parts.push(`dest=${inst.dest}`);
      if (inst.src !== undefined) parts.push(`src=${inst.src}`);
      if (inst.indexRegister !== undefined) parts.push(`index=${inst.indexRegister}`);
      if (inst.displacement !== undefined) parts.push(`disp=${inst.displacement}`);
      return parts.join(' ');
    }
  }
}

function isHardTerminator(inst) {
  return !!inst && HARD_TERMINATOR_TAGS.has(inst.tag);
}

function decodeSequential(romBytes, start, endExclusive) {
  const rows = [];
  let pc = start;

  while (pc < endExclusive && pc < romBytes.length) {
    const inst = safeDecode(romBytes, pc);
    const length = Math.max(1, inst?.length ?? 1);

    rows.push({
      pc,
      inst,
      bytes: romBytes.subarray(pc, Math.min(pc + length, romBytes.length)),
      text: formatInstruction(inst),
    });

    pc += length;
  }

  return rows;
}

function findAlignedContextStart(romBytes, targetPc, lookbackBytes = CONTEXT_LOOKBACK) {
  const floor = Math.max(0, targetPc - lookbackBytes);

  for (let candidate = targetPc; candidate >= floor; candidate--) {
    let pc = candidate;
    let steps = 0;

    while (pc < targetPc && steps < 48) {
      const inst = safeDecode(romBytes, pc);
      const length = Math.max(1, inst?.length ?? 1);
      pc += length;
      steps += 1;
    }

    if (pc === targetPc) {
      return candidate;
    }
  }

  return targetPc;
}

function findFunctionRegion(romBytes, targetPc) {
  const floor = Math.max(0, targetPc - FUNCTION_LOOKBACK);
  let entry = targetPc;
  let terminatorPc = null;
  let terminatorText = 'not found';

  for (let addr = targetPc - 1; addr >= floor; addr--) {
    if (romBytes[addr] === 0xC9) {
      entry = addr + 1;
      terminatorPc = addr;
      terminatorText = 'ret';
      break;
    }

    const inst = safeDecode(romBytes, addr);
    if (!inst) continue;
    if (inst.nextPc > targetPc) continue;

    if (isHardTerminator(inst)) {
      entry = inst.nextPc;
      terminatorPc = addr;
      terminatorText = formatInstruction(inst);
      break;
    }
  }

  let end = Math.min(romBytes.length, entry + FUNCTION_MAX_BYTES);
  for (let pc = entry; pc < end;) {
    const inst = safeDecode(romBytes, pc);
    const length = Math.max(1, inst?.length ?? 1);
    const nextPc = pc + length;

    if (pc > entry && isHardTerminator(inst)) {
      end = nextPc;
      break;
    }

    pc = nextPc;
  }

  return {
    entry,
    end,
    terminatorPc,
    terminatorText,
  };
}

function dedupeAndSort(values) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value)))).sort((a, b) => a - b);
}

function nearestValue(sortedValues, target) {
  if (!sortedValues || sortedValues.length === 0) return null;

  let lo = 0;
  let hi = sortedValues.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedValues[mid] < target) lo = mid + 1;
    else hi = mid;
  }

  const candidates = [];
  if (lo < sortedValues.length) candidates.push(sortedValues[lo]);
  if (lo > 0) candidates.push(sortedValues[lo - 1]);
  if (lo + 1 < sortedValues.length) candidates.push(sortedValues[lo + 1]);

  let best = null;
  for (const value of candidates) {
    const delta = value - target;
    const distance = Math.abs(delta);
    if (!best || distance < best.distance || (distance === best.distance && value < best.value)) {
      best = { value, delta, distance };
    }
  }

  return best;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) return rawBlocks;
  if (rawBlocks && typeof rawBlocks === 'object') return Object.values(rawBlocks);
  return [];
}

async function loadTranspiledContext() {
  if (!fs.existsSync(TRANSPILED_PATH)) {
    return {
      loaded: false,
      reason: `${path.basename(TRANSPILED_PATH)} not found`,
      entryPoints: [],
      blockStarts: [],
      entrySet: new Set(),
      blockSet: new Set(),
    };
  }

  try {
    const mod = await import(pathToFileURL(TRANSPILED_PATH).href);
    const rawBlocks =
      mod.PRELIFTED_BLOCKS ??
      mod.default?.PRELIFTED_BLOCKS ??
      mod.default ??
      mod;
    const blocks = normalizeBlocks(rawBlocks);
    const blockStarts = dedupeAndSort(blocks.map((block) => block?.startPc));
    const entryPoints = dedupeAndSort((mod.ENTRY_POINTS ?? []).map((entry) => entry?.pc));

    return {
      loaded: true,
      reason: null,
      entryPoints,
      blockStarts,
      entrySet: new Set(entryPoints),
      blockSet: new Set(blockStarts),
    };
  } catch (error) {
    return {
      loaded: false,
      reason: error instanceof Error ? error.message : String(error),
      entryPoints: [],
      blockStarts: [],
      entrySet: new Set(),
      blockSet: new Set(),
    };
  }
}

function describeTranspiledContext(transpiled, pc, functionEntry) {
  if (!transpiled.loaded) {
    return `transpiled context unavailable (${transpiled.reason})`;
  }

  const notes = [];

  if (transpiled.blockSet.has(pc)) {
    notes.push(`exact lifted block at ${hex(pc)}`);
  } else {
    const nearestBlock = nearestValue(transpiled.blockStarts, pc);
    if (nearestBlock && nearestBlock.distance <= NEARBY_BLOCK_THRESHOLD) {
      notes.push(`nearest lifted block ${hex(nearestBlock.value)} (${signedHexDelta(nearestBlock.delta)})`);
    }
  }

  if (transpiled.blockSet.has(functionEntry) && functionEntry !== pc) {
    notes.push(`lifted function entry ${hex(functionEntry)}`);
  }

  if (transpiled.entrySet.has(functionEntry)) {
    notes.push(`seeded function entry ${hex(functionEntry)}`);
  } else {
    const nearestSeed = nearestValue(transpiled.entryPoints, functionEntry);
    if (nearestSeed && nearestSeed.distance <= NEARBY_SEED_THRESHOLD) {
      notes.push(`nearest seed ${hex(nearestSeed.value)} (${signedHexDelta(nearestSeed.delta)})`);
    }
  }

  return notes.length > 0 ? notes.join('; ') : 'no nearby lifted block / seed context';
}

function buildLocalDisassembly(romBytes, functionRegion, matchPc) {
  const alignedStart = findAlignedContextStart(
    romBytes,
    matchPc,
    Math.min(CONTEXT_LOOKBACK, Math.max(0, matchPc - functionRegion.entry)),
  );
  const start = Math.max(functionRegion.entry, alignedStart);
  const end = Math.min(functionRegion.end, matchPc + CONTEXT_LOOKAHEAD);
  return decodeSequential(romBytes, start, end);
}

function scanDirectHits(romBytes) {
  const hitsByTarget = new Map(TARGETS.map((target) => [target.addr, []]));

  for (let pc = 0; pc <= romBytes.length - 4; pc++) {
    const pattern = CONTROL_BY_OPCODE.get(romBytes[pc]);
    if (!pattern) continue;

    const targetAddr = read24(romBytes, pc + 1);
    if (!TARGET_BY_ADDR.has(targetAddr)) continue;

    const inst = safeDecode(romBytes, pc);
    hitsByTarget.get(targetAddr).push({
      pc,
      targetAddr,
      pattern,
      bytes: romBytes.subarray(pc, pc + 4),
      inst,
      decodedText: formatInstruction(inst),
    });
  }

  return hitsByTarget;
}

function scanRawSequence(romBytes, targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >>> 8) & 0xFF;
  const hi = (targetAddr >>> 16) & 0xFF;
  const hits = [];

  for (let offset = 0; offset <= romBytes.length - 3; offset++) {
    if (romBytes[offset] !== lo || romBytes[offset + 1] !== mid || romBytes[offset + 2] !== hi) {
      continue;
    }

    let ownerPc = null;
    let ownerText = null;

    if (offset > 0) {
      const maybeControl = CONTROL_BY_OPCODE.get(romBytes[offset - 1]);
      if (maybeControl) {
        const inst = safeDecode(romBytes, offset - 1);
        if (inst && inst.target === targetAddr) {
          ownerPc = offset - 1;
          ownerText = formatInstruction(inst);
        }
      }
    }

    hits.push({
      offset,
      bytesAround: romBytes.subarray(Math.max(0, offset - 4), Math.min(romBytes.length, offset + 7)),
      ownerPc,
      ownerText,
    });
  }

  return hits;
}

function printMatchSection(title, lines) {
  console.log(title);
  if (lines.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const line of lines) {
    console.log(line);
  }
  console.log('');
}

function formatFunctionRegion(region) {
  const start = hex(region.entry);
  const end = hex(Math.max(region.entry, region.end - 1));
  if (region.terminatorPc === null) {
    return `${start}..${end} (approx; no prior hard terminator found within ${hex(FUNCTION_LOOKBACK)})`;
  }
  return `${start}..${end} (previous terminator ${region.terminatorText} at ${hex(region.terminatorPc)})`;
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM file: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);
  const transpiled = await loadTranspiledContext();
  const directHits = scanDirectHits(romBytes);
  const rawCb0003Hits = scanRawSequence(romBytes, 0x0300CB);

  console.log('=== Phase 384: CALLERS OF 0x0300CB ===');
  console.log('');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${romBytes.length.toLocaleString()} bytes`);
  console.log(`Expected size: ${EXPECTED_ROM_SIZE.toLocaleString()} bytes`);
  if (romBytes.length !== EXPECTED_ROM_SIZE) {
    console.log(`WARNING: ROM size mismatch; results may be unreliable.`);
  }
  if (transpiled.loaded) {
    console.log(
      `Transpiled context: loaded ${transpiled.blockStarts.length.toLocaleString()} lifted blocks, `
      + `${transpiled.entryPoints.length.toLocaleString()} entry seeds.`,
    );
  } else {
    console.log(`Transpiled context: unavailable (${transpiled.reason}).`);
  }
  console.log('');

  console.log('Targets scanned for direct ADL CALL/JP references:');
  for (const target of TARGETS) {
    const hits = directHits.get(target.addr) ?? [];
    console.log(`  ${hex(target.addr)}  ${target.label}  -> ${hits.length} hit(s)`);
  }
  console.log(`  raw 24-bit sequence ${hexByte(0xCB)} ${hexByte(0x00)} ${hexByte(0x03)} -> ${rawCb0003Hits.length} hit(s)`);
  console.log('');

  for (const target of TARGETS) {
    const hits = directHits.get(target.addr) ?? [];
    console.log(`=== Direct References To ${hex(target.addr)} (${target.label}) ===`);
    console.log('');

    if (hits.length === 0) {
      console.log('  No direct ADL CALL/JP references found.');
      console.log('');
      continue;
    }

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const functionRegion = findFunctionRegion(romBytes, hit.pc);
      const contextSummary = describeTranspiledContext(transpiled, hit.pc, functionRegion.entry);
      const localRows = buildLocalDisassembly(romBytes, functionRegion, hit.pc);

      console.log(`  [${i + 1}] ${hex(hit.pc)}  ${bytesHex(hit.bytes)}`);
      console.log(`      mnemonic: ${hit.pattern.mnemonic} ${hex(target.addr)}`);
      console.log(`      decoded : ${hit.decodedText}`);
      console.log(`      function: ${formatFunctionRegion(functionRegion)}`);
      console.log(`      context : ${contextSummary}`);
      console.log('      local disassembly:');

      for (const row of localRows) {
        const marker = row.pc === hit.pc ? ' <<< MATCH' : '';
        console.log(`        ${hex(row.pc)}  ${bytesHex(row.bytes).padEnd(15)}  ${row.text}${marker}`);
      }

      console.log('');
    }
  }

  console.log('=== Raw 24-bit Sequence Scan: CB 00 03 ===');
  console.log('');

  if (rawCb0003Hits.length === 0) {
    console.log('  No raw CB 00 03 sequences found.');
    console.log('');
  } else {
    for (let i = 0; i < rawCb0003Hits.length; i++) {
      const hit = rawCb0003Hits[i];
      const functionRegion = hit.ownerPc !== null
        ? findFunctionRegion(romBytes, hit.ownerPc)
        : findFunctionRegion(romBytes, hit.offset);
      const contextSummary = describeTranspiledContext(
        transpiled,
        hit.ownerPc ?? hit.offset,
        functionRegion.entry,
      );

      console.log(`  [${i + 1}] raw offset ${hex(hit.offset)}  bytes-around=${bytesHex(hit.bytesAround)}`);
      if (hit.ownerPc !== null) {
        console.log(`      classification: operand bytes of control-transfer at ${hex(hit.ownerPc)} -> ${hit.ownerText}`);
      } else {
        console.log('      classification: raw 24-bit pointer candidate / data-table occurrence');
      }
      console.log(`      function      : ${formatFunctionRegion(functionRegion)}`);
      console.log(`      context       : ${contextSummary}`);
      console.log('');
    }
  }

  console.log('=== Summary ===');
  console.log('');

  const summaryLines = [];
  for (const target of TARGETS) {
    const hits = directHits.get(target.addr) ?? [];
    if (hits.length > 0) {
      summaryLines.push(`${hex(target.addr)} <- ${hits.map((hit) => `${hex(hit.pc)} (${hit.pattern.mnemonic})`).join(', ')}`);
    }
  }

  if (summaryLines.length === 0) {
    console.log('  No direct ADL CALL/JP references matched the requested target set.');
  } else {
    for (const line of summaryLines) {
      console.log(`  ${line}`);
    }
  }

  if (rawCb0003Hits.length > 0) {
    const ownerRefs = rawCb0003Hits
      .filter((hit) => hit.ownerPc !== null)
      .map((hit) => `${hex(hit.offset)} <- operand of ${hex(hit.ownerPc)}`);
    if (ownerRefs.length > 0) {
      console.log(`  Raw CB 00 03 hits tied to direct refs: ${ownerRefs.join(', ')}`);
    } else {
      console.log('  Raw CB 00 03 hits look like standalone pointer/data occurrences.');
    }
  } else {
    console.log('  No raw CB 00 03 sequence occurrences were found.');
  }

  console.log('');
  console.log('Run complete.');
}

await main();

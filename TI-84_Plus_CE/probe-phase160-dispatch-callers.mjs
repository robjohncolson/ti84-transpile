#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const TARGET = 0x056900;
const ROM_LIMIT = 0x400000;

const RAW_JT_BASE = 0x020028;
const RAW_JT_ENTRY_SIZE = 3;
const RAW_JT_SCAN_COUNT = 900;

const JP_STUB_JT_BASE = 0x020104;
const JP_STUB_ENTRY_SIZE = 4;
const JP_STUB_SCAN_COUNT = 900;

const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 3;
const CONTEXT_LOOKBACK_BYTES = 32;
const CONTEXT_MAX_INSTRUCTIONS = 12;
const CONTEXT_FORWARD_BYTES = 32;

const romBytes = fs.readFileSync(ROM_PATH).subarray(0, ROM_LIMIT);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? {};

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function read24(bytes, offset) {
  return (bytes[offset] ?? 0)
    | ((bytes[offset + 1] ?? 0) << 8)
    | ((bytes[offset + 2] ?? 0) << 16);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
}

function sliceBytes(start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(romBytes.length, safeStart + length);
  return romBytes.slice(safeStart, safeEnd);
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister}${sign}${displacement})`;
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
        continue;
      }

      if (key === 'value' || key === 'port') {
        parts.push(`${key}=${hexByte(value)}`);
        continue;
      }

      if (key === 'displacement') {
        parts.push(`${key}=${value >= 0 ? `+${value}` : String(value)}`);
        continue;
      }

      parts.push(`${key}=${hex(value)}`);
      continue;
    }

    parts.push(`${key}=${String(value)}`);
  }

  return parts.length === 0 ? decoded.tag : `${decoded.tag} ${parts.join(' ')}`;
}

function formatInstruction(decoded) {
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
    case 'exx':
    case 'halt':
    case 'slp':
      return decoded.tag;

    case 'jr':
      return `jr ${hex(decoded.target)}`;
    case 'jr-conditional':
      return `jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'djnz':
      return `djnz ${hex(decoded.target)}`;

    case 'jp':
      return `jp ${hex(decoded.target)}`;
    case 'jp-conditional':
      return `jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect':
      return `jp (${decoded.indirectRegister})`;

    case 'call':
      return `call ${hex(decoded.target)}`;
    case 'call-conditional':
      return `call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'rst':
      return `rst ${hexByte(decoded.target)}`;

    case 'push':
      return `push ${decoded.pair}`;
    case 'pop':
      return `pop ${decoded.pair}`;

    case 'inc-pair':
      return `inc ${decoded.pair}`;
    case 'dec-pair':
      return `dec ${decoded.pair}`;
    case 'inc-reg':
      return `inc ${decoded.reg}`;
    case 'dec-reg':
      return `dec ${decoded.reg}`;

    case 'ld-pair-imm':
      return `ld ${decoded.pair}, ${hex(decoded.value)}`;
    case 'ld-reg-imm':
      return `ld ${decoded.dest}, ${hexByte(decoded.value)}`;
    case 'ld-reg-reg':
      return `ld ${decoded.dest}, ${decoded.src}`;
    case 'ld-reg-ind':
      return `ld ${decoded.dest}, (${decoded.src})`;
    case 'ld-ind-reg':
      return `ld (${decoded.dest}), ${decoded.src}`;
    case 'ld-reg-mem':
      return `ld ${decoded.dest}, (${hex(decoded.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(decoded.addr)}), ${decoded.src}`;
    case 'ld-pair-mem':
      if (decoded.direction === 'from-mem') {
        return `ld ${decoded.pair}, (${hex(decoded.addr)})`;
      }
      return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
    case 'ld-pair-ind':
      return `ld ${decoded.pair}, (${decoded.src})`;
    case 'ld-ind-pair':
      return `ld (${decoded.dest}), ${decoded.pair}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-pair':
      return `ld sp, ${decoded.pair}`;

    case 'add-pair':
      return `add ${decoded.dest}, ${decoded.src}`;
    case 'alu-reg':
      return `${decoded.op} ${decoded.src}`;
    case 'alu-imm':
      return `${decoded.op} ${hexByte(decoded.value)}`;

    case 'in-imm':
      return `in a, (${hexByte(decoded.port)})`;
    case 'out-imm':
      return `out (${hexByte(decoded.port)}), a`;

    case 'ex-de-hl':
      return 'ex de, hl';
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    case 'ex-sp-pair':
      return `ex (sp), ${decoded.pair}`;

    case 'bit-test':
      return `bit ${decoded.bit}, ${decoded.reg}`;
    case 'bit-test-ind':
      return `bit ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-res':
      return `res ${decoded.bit}, ${decoded.reg}`;
    case 'bit-res-ind':
      return `res ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-set':
      return `set ${decoded.bit}, ${decoded.reg}`;
    case 'bit-set-ind':
      return `set ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'rotate-reg':
      return `${decoded.op} ${decoded.reg}`;
    case 'rotate-ind':
      return `${decoded.op} (${decoded.indirectRegister})`;

    case 'indexed-cb-bit':
      return `bit ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-rotate':
      return `${decoded.op} ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-res':
      return `res ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-set':
      return `set ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;

    case 'lea':
      return `lea ${decoded.dest}, ${formatIndexedOperand(decoded.base, decoded.displacement)}`;

    default:
      return fallbackFormat(decoded);
  }
}

function safeDecode(pc, mode) {
  if (pc < 0 || pc >= romBytes.length) {
    return null;
  }

  try {
    const decoded = decodeInstruction(romBytes, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function toContextRow(pc, length, text, marker = '  ') {
  const rawBytes = bytesToHex(sliceBytes(pc, length));
  return `${marker} ${hex(pc)}  ${rawBytes.padEnd(17)}  ${text}`;
}

function chooseBestPrefix(candidates, site, desiredCount) {
  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((left, right) => {
    const leftEnough = left.length >= desiredCount ? 1 : 0;
    const rightEnough = right.length >= desiredCount ? 1 : 0;
    if (rightEnough !== leftEnough) {
      return rightEnough - leftEnough;
    }

    const leftSpan = site - left[0].pc;
    const rightSpan = site - right[0].pc;
    if (leftEnough && rightEnough) {
      if (leftSpan !== rightSpan) {
        return leftSpan - rightSpan;
      }

      const leftOver = left.length - desiredCount;
      const rightOver = right.length - desiredCount;
      if (leftOver !== rightOver) {
        return leftOver - rightOver;
      }
    } else if (right.length !== left.length) {
      return right.length - left.length;
    }

    return right[right.length - 1].pc - left[left.length - 1].pc;
  });

  return candidates[0].slice(-desiredCount);
}

function decodePrefix(site, mode, desiredCount = CONTEXT_BEFORE) {
  const startFloor = Math.max(0, site - CONTEXT_LOOKBACK_BYTES);
  const candidates = [];

  for (let start = startFloor; start < site; start += 1) {
    const decoded = [];
    let pc = start;
    let ok = true;

    for (let step = 0; step < CONTEXT_MAX_INSTRUCTIONS && pc < site; step += 1) {
      const instruction = safeDecode(pc, mode);
      if (!instruction || instruction.nextPc > site) {
        ok = false;
        break;
      }

      decoded.push(instruction);
      pc = instruction.nextPc;
    }

    if (ok && pc === site && decoded.length > 0) {
      candidates.push(decoded);
    }
  }

  return chooseBestPrefix(candidates, site, desiredCount);
}

function decodeSuffix(startPc, mode, desiredCount = CONTEXT_AFTER) {
  const rows = [];
  let pc = startPc;
  const limit = Math.min(romBytes.length, startPc + CONTEXT_FORWARD_BYTES);

  while (pc < limit && rows.length < desiredCount) {
    const instruction = safeDecode(pc, mode);
    if (!instruction) {
      break;
    }

    rows.push(instruction);
    pc = instruction.nextPc;
  }

  return rows;
}

function buildContextRows(hit) {
  const before = decodePrefix(hit.caller, hit.mode);
  const after = decodeSuffix(hit.caller + hit.length, hit.mode);
  const rows = [];

  for (const instruction of before) {
    rows.push(toContextRow(instruction.pc, instruction.length, formatInstruction(instruction)));
  }

  rows.push(toContextRow(hit.caller, hit.length, hit.siteText, '=>'));

  for (const instruction of after) {
    rows.push(toContextRow(instruction.pc, instruction.length, formatInstruction(instruction)));
  }

  if (rows.length === 1) {
    rows.push('   <no surrounding instructions decoded>');
  }

  return rows;
}

function scanPattern(pattern) {
  const hits = [];
  const lastStart = romBytes.length - pattern.length;

  for (let addr = 0; addr <= lastStart; addr += 1) {
    let matches = true;

    for (let index = 0; index < pattern.length; index += 1) {
      if (romBytes[addr + index] !== pattern[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      hits.push(addr);
    }
  }

  return hits;
}

function scanDirectHits() {
  const targetBytes = [TARGET & 0xFF, (TARGET >> 8) & 0xFF, (TARGET >> 16) & 0xFF];
  const rawLiteralHits = scanPattern(targetBytes);
  const callHits = scanPattern([0xCD, ...targetBytes]).map((caller) => ({
    caller,
    kind: 'call',
    mechanism: 'CALL',
    mode: 'adl',
    length: 4,
    siteText: `call ${hex(TARGET)}`,
  }));
  const jpHits = scanPattern([0xC3, ...targetBytes]).map((caller) => ({
    caller,
    kind: 'jp',
    mechanism: 'JP',
    mode: 'adl',
    length: 4,
    siteText: `jp ${hex(TARGET)}`,
  }));

  return { rawLiteralHits, callHits, jpHits };
}

function scanRawJumpTable() {
  const matches = [];

  for (let slot = 0; slot < RAW_JT_SCAN_COUNT; slot += 1) {
    const entryAddr = RAW_JT_BASE + slot * RAW_JT_ENTRY_SIZE;
    if (entryAddr + 2 >= romBytes.length) {
      break;
    }

    const target = read24(romBytes, entryAddr);
    if (target === TARGET) {
      matches.push({
        slot,
        entryAddr,
        table: 'raw-jt',
        tableBase: RAW_JT_BASE,
        target,
      });
    }
  }

  return matches;
}

function scanJpStubJumpTable() {
  const matches = [];

  for (let slot = 0; slot < JP_STUB_SCAN_COUNT; slot += 1) {
    const entryAddr = JP_STUB_JT_BASE + slot * JP_STUB_ENTRY_SIZE;
    if (entryAddr + 3 >= romBytes.length) {
      break;
    }

    const opcode = romBytes[entryAddr];
    const target = read24(romBytes, entryAddr + 1);
    if (opcode === 0xC3 && target === TARGET) {
      matches.push({
        slot,
        entryAddr,
        table: 'jp-stub-jt',
        tableBase: JP_STUB_JT_BASE,
        target,
      });
    }
  }

  return matches;
}

function scanBcallHits(slotInfos, rstOpcode, labelPrefix) {
  if (slotInfos.length === 0) {
    return [];
  }

  const slotMap = new Map(slotInfos.map((info) => [info.slot, info]));
  const hits = [];

  for (let caller = 0; caller < romBytes.length; caller += 1) {
    if (romBytes[caller] !== rstOpcode) {
      continue;
    }

    if (caller + 2 < romBytes.length) {
      const slot2 = romBytes[caller + 1] | (romBytes[caller + 2] << 8);
      const slotInfo = slotMap.get(slot2);
      if (slotInfo) {
        hits.push({
          caller,
          kind: 'bcall-2',
          mechanism: `${labelPrefix} 2-byte`,
          mode: 'z80',
          length: 3,
          slot: slot2,
          slotInfo,
          siteText: `rst ${hexByte(rstOpcode)} ; slot ${slot2} (${hex(slot2, 4)}) -> ${hex(TARGET)}`,
        });
        continue;
      }
    }

    if (caller + 3 < romBytes.length) {
      const slot3 = romBytes[caller + 1]
        | (romBytes[caller + 2] << 8)
        | (romBytes[caller + 3] << 16);
      const slotInfo = slotMap.get(slot3);
      if (slotInfo) {
        hits.push({
          caller,
          kind: 'bcall-3',
          mechanism: `${labelPrefix} 3-byte`,
          mode: 'adl',
          length: 4,
          slot: slot3,
          slotInfo,
          siteText: `rst ${hexByte(rstOpcode)} ; slot ${slot3} (${hex(slot3)}) -> ${hex(TARGET)}`,
        });
      }
    }
  }

  return hits;
}

function parseBlockKey(key) {
  const match = /^([0-9a-fA-F]{6})(?::([a-z0-9]+))?$/.exec(key);
  if (!match) {
    return null;
  }

  return {
    key,
    pc: Number.parseInt(match[1], 16),
    mode: match[2] ?? null,
  };
}

function nearbyBlockKeys() {
  return Object.keys(BLOCKS)
    .map(parseBlockKey)
    .filter(Boolean)
    .filter((entry) => Math.abs(entry.pc - TARGET) <= 0x40)
    .sort((left, right) => left.pc - right.pc || left.key.localeCompare(right.key));
}

function printSection(title) {
  console.log(`\n${title}`);
}

function printJumpTableMatches(label, matches, base, entrySize, extraNote = null) {
  console.log(`  base=${hex(base)} stride=${entrySize} scanCount=${matches.length === 0 ? RAW_JT_SCAN_COUNT : matches.length}`);
  if (extraNote) {
    console.log(`  ${extraNote}`);
  }

  if (matches.length === 0) {
    console.log(`  no slot points to ${hex(TARGET)}`);
    return;
  }

  for (const match of matches) {
    console.log(
      `  slot ${match.slot} (${hex(match.slot, 4)}) @ ${hex(match.entryAddr)} -> ${hex(match.target)}`
    );
  }
}

function printCallerDetails(callers) {
  if (callers.length === 0) {
    return;
  }

  printSection('Caller details');

  for (const hit of callers) {
    console.log(
      `[${hit.mechanism}] caller=${hex(hit.caller)} mode=${hit.mode} bytes=${bytesToHex(sliceBytes(hit.caller, hit.length))}`
    );

    if (hit.slotInfo) {
      console.log(
        `  slot ${hit.slot} from ${hit.slotInfo.table} @ ${hex(hit.slotInfo.entryAddr)}`
      );
    }

    for (const row of buildContextRows(hit)) {
      console.log(row);
    }

    console.log('');
  }
}

const exactLiteralBlockKey = Object.prototype.hasOwnProperty.call(BLOCKS, '0x056900');
const canonicalAdlBlockKey = Object.prototype.hasOwnProperty.call(BLOCKS, '056900:adl');
const nearbyBlocks = nearbyBlockKeys();

const direct = scanDirectHits();
const rawJumpTableMatches = scanRawJumpTable();
const jpStubJumpTableMatches = scanJpStubJumpTable();

const efRawBcalls = scanBcallHits(rawJumpTableMatches, 0xEF, 'BCALL RST 28h');
const efStubBcalls = scanBcallHits(jpStubJumpTableMatches, 0xEF, 'BCALL RST 28h (compat slot)');
const cfStubBcalls = scanBcallHits(jpStubJumpTableMatches, 0xCF, 'BCALL RST 08h compatibility');

const callers = [
  ...direct.callHits,
  ...direct.jpHits,
  ...efRawBcalls,
  ...efStubBcalls,
  ...cfStubBcalls,
].sort((left, right) => left.caller - right.caller || left.mechanism.localeCompare(right.mechanism));

console.log('Phase 160 - Dispatch Table Population Investigation');
console.log(`Target function: ${hex(TARGET)}`);
console.log(`ROM scan range: ${hex(0)}-${hex(ROM_LIMIT - 1)}`);

printSection('Transpiled block lookup');
console.log(`  PRELIFTED_BLOCKS['0x056900']: ${exactLiteralBlockKey ? 'present' : 'missing'}`);
console.log(`  PRELIFTED_BLOCKS['056900:adl']: ${canonicalAdlBlockKey ? 'present' : 'missing'}`);
if (nearbyBlocks.length === 0) {
  console.log('  nearby transpiled blocks (+/-0x40): none');
} else {
  console.log(`  nearby transpiled blocks (+/-0x40): ${nearbyBlocks.map((entry) => entry.key).join(', ')}`);
}

printSection('Literal scan');
console.log(`  raw 24-bit literal ${bytesToHex([TARGET & 0xFF, (TARGET >> 8) & 0xFF, (TARGET >> 16) & 0xFF])}: ${direct.rawLiteralHits.length}`);
console.log(`  CALL pattern (${bytesToHex([0xCD, TARGET & 0xFF, (TARGET >> 8) & 0xFF, (TARGET >> 16) & 0xFF])}): ${direct.callHits.length}`);
console.log(`  JP pattern   (${bytesToHex([0xC3, TARGET & 0xFF, (TARGET >> 8) & 0xFF, (TARGET >> 16) & 0xFF])}): ${direct.jpHits.length}`);
if (direct.rawLiteralHits.length > 0) {
  console.log(`  raw literal hits: ${direct.rawLiteralHits.slice(0, 16).map((addr) => hex(addr)).join(', ')}`);
}

printSection('Jump table scan (requested raw table)');
console.log(`  base=${hex(RAW_JT_BASE)} stride=${RAW_JT_ENTRY_SIZE} slotsScanned=${RAW_JT_SCAN_COUNT}`);
if (rawJumpTableMatches.length === 0) {
  console.log(`  no raw-table slot points to ${hex(TARGET)}`);
} else {
  for (const match of rawJumpTableMatches) {
    console.log(`  slot ${match.slot} (${hex(match.slot, 4)}) @ ${hex(match.entryAddr)} -> ${hex(match.target)}`);
  }
}

printSection('Jump table scan (compatibility JP-stub table)');
console.log(`  base=${hex(JP_STUB_JT_BASE)} stride=${JP_STUB_ENTRY_SIZE} slotsScanned=${JP_STUB_SCAN_COUNT}`);
console.log('  note: earlier phases observed C3 <addr24> rows here, so this probe checks them as a fallback.');
if (jpStubJumpTableMatches.length === 0) {
  console.log(`  no JP-stub slot points to ${hex(TARGET)}`);
} else {
  for (const match of jpStubJumpTableMatches) {
    console.log(`  slot ${match.slot} (${hex(match.slot, 4)}) @ ${hex(match.entryAddr)} -> jp ${hex(match.target)}`);
  }
}

printSection('BCALL scan');
if (rawJumpTableMatches.length === 0) {
  console.log('  requested RST 28h scan against the raw table skipped: no matching slot.');
} else {
  console.log(`  raw-table RST 28h callers: ${efRawBcalls.length}`);
}

if (jpStubJumpTableMatches.length === 0) {
  console.log('  compatibility RST 28h / RST 08h scans against the JP-stub table skipped: no matching slot.');
} else {
  console.log(`  compatibility RST 28h callers: ${efStubBcalls.length}`);
  console.log(`  compatibility RST 08h callers: ${cfStubBcalls.length}`);
}

if (callers.length === 0) {
  printSection('No callers found');
  console.log(`  No CALL ${hex(TARGET)} sites were found.`);
  console.log(`  No JP ${hex(TARGET)} sites were found.`);
  console.log(`  No jump-table slot in either scanned table resolves to ${hex(TARGET)}.`);
  console.log('  This target has no static literal callers by the searched mechanisms and is more likely reached indirectly, or the real entry point is adjacent to 0x056900.');
} else {
  printSection('Caller summary');
  for (const hit of callers) {
    const slotSuffix = hit.slotInfo ? ` slot=${hit.slot}` : '';
    console.log(`  ${hex(hit.caller)}  ${hit.mechanism}${slotSuffix}`);
  }
  printCallerDetails(callers);
}

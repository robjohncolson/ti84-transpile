#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const ROM_LIMIT = 0x400000;
const MEM_SIZE = 0x1000000;

const FUNCTION_START = 0x00E4E8;
const FUNCTION_END = 0x00E57E;
const FUNCTION_TRACE_END = 0x00E580;
const FRAME_HELPER = 0x002197;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const KERNEL_INIT_MODE = 'adl';
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

const STACK_RESET_TOP = 0xD1A87E;

const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;

const CONTEXT_BEFORE = 10;
const CONTEXT_LOOKBACK_BYTES = 96;
const CONTEXT_MAX_INSTRUCTIONS = 32;

const SCAN_TARGETS = buildScanTargets();
const SCAN_TARGET_SET = new Set(SCAN_TARGETS);

const romBytes = fs.readFileSync(ROM_PATH).subarray(0, ROM_LIMIT);
if (romBytes.length !== ROM_LIMIT) {
  throw new Error(`Expected a 4 MB ROM image at ${ROM_PATH}, got ${romBytes.length} bytes.`);
}

const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? {};

function buildScanTargets() {
  const targets = [0x00E4E5, 0x00E4E8];

  for (let target = 0x00E4E9; target <= 0x00E4F5; target += 1) {
    targets.push(target);
  }

  return [...new Set(targets)].sort((left, right) => left - right);
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
}

function read24(bytes, offset) {
  return (bytes[offset] ?? 0)
    | ((bytes[offset + 1] ?? 0) << 8)
    | ((bytes[offset + 2] ?? 0) << 16);
}

function signed24(value) {
  const masked = value & 0xFFFFFF;
  return masked & 0x800000 ? masked - 0x1000000 : masked;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function safeDecode(pc, mode = 'adl') {
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
        parts.push(`${key}=${hex(value, 2)}`);
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
    case 'ei':
    case 'exx':
    case 'halt':
    case 'slp':
    case 'neg':
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
      return `rst ${hex(decoded.target, 2)}`;

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
      return `ld ${decoded.dest}, ${hex(decoded.value, 2)}`;
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
      if (decoded.direction === 'to-mem') {
        return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
      }
      return `ld ${decoded.pair}, (${hex(decoded.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
    case 'ld-pair-ind':
      return `ld ${decoded.pair}, (${decoded.src})`;
    case 'ld-ind-pair':
      return `ld (${decoded.dest}), ${decoded.pair}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-pair':
      return `ld sp, ${decoded.pair}`;

    case 'ld-ixd-imm':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${hex(decoded.value, 2)}`;
    case 'ld-reg-ixd':
      return `ld ${decoded.dest}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;
    case 'ld-pair-indexed':
      return `ld ${decoded.pair}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.pair}`;
    case 'ld-ixiy-indexed':
      return `ld ${decoded.dest}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-ixiy':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;
    case 'ld-ind-imm':
      return `ld (hl), ${hex(decoded.value, 2)}`;

    case 'add-pair':
      return `add ${decoded.dest}, ${decoded.src}`;
    case 'adc-pair':
      return `adc hl, ${decoded.src}`;
    case 'sbc-pair':
      return `sbc hl, ${decoded.src}`;
    case 'alu-reg':
      return `${decoded.op} ${decoded.src}`;
    case 'alu-imm':
      return `${decoded.op} ${hex(decoded.value, 2)}`;
    case 'alu-ixd':
      return `${decoded.op} ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;

    case 'in-imm':
      return `in a, (${hex(decoded.port, 2)})`;
    case 'out-imm':
      return `out (${hex(decoded.port, 2)}), a`;
    case 'in-reg':
      return `in ${decoded.reg}, (c)`;
    case 'out-reg':
      return `out (c), ${decoded.reg}`;

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
      return `${decoded.operation}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
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

function isIxHalfRegister(reg) {
  return reg === 'ixh' || reg === 'ixl';
}

function writesIx(decoded) {
  switch (decoded.tag) {
    case 'ld-pair-imm':
    case 'ld-pair-mem':
    case 'ld-pair-indexed':
      return decoded.pair === 'ix';
    case 'ld-ixiy-indexed':
      return decoded.dest === 'ix';
    case 'lea':
      return decoded.dest === 'ix';
    case 'pop':
    case 'inc-pair':
    case 'dec-pair':
      return decoded.pair === 'ix';
    case 'add-pair':
      return decoded.dest === 'ix';
    case 'ld-reg-reg':
    case 'ld-reg-imm':
      return isIxHalfRegister(decoded.dest);
    case 'inc-reg':
    case 'dec-reg':
    case 'bit-res':
    case 'bit-set':
      return isIxHalfRegister(decoded.reg);
    default:
      return false;
  }
}

function mentionsIx(text) {
  return /\bix\b|\bixh\b|\bixl\b|\(ix[+-]/i.test(text);
}

function formatIxRelative(offset) {
  if (offset === 0) {
    return 'IX+0';
  }
  return `IX${offset >= 0 ? '+' : ''}${offset}`;
}

function formatIxSpan(offset, width) {
  if (width <= 1) {
    return formatIxRelative(offset);
  }

  const endOffset = offset + width - 1;
  return `${formatIxRelative(offset)}..${formatIxRelative(endOffset)}`;
}

function findIxAccess(decoded) {
  switch (decoded.tag) {
    case 'ld-reg-ixd':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'read', summary: `reads byte ${formatIxSpan(decoded.displacement, 1)} into ${decoded.dest}` };
    case 'ld-ixd-reg':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'write', summary: `writes byte ${decoded.src} to ${formatIxSpan(decoded.displacement, 1)}` };
    case 'ld-ixd-imm':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'write', summary: `writes immediate ${hex(decoded.value, 2)} to ${formatIxSpan(decoded.displacement, 1)}` };
    case 'alu-ixd':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'read', summary: `${decoded.op} reads byte from ${formatIxSpan(decoded.displacement, 1)}` };
    case 'ld-pair-indexed':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 3, kind: 'read', summary: `reads 24-bit value ${formatIxSpan(decoded.displacement, 3)} into ${decoded.pair}` };
    case 'ld-indexed-pair':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 3, kind: 'write', summary: `writes 24-bit ${decoded.pair} into ${formatIxSpan(decoded.displacement, 3)}` };
    case 'ld-ixiy-indexed':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 3, kind: 'read', summary: `reads 24-bit value ${formatIxSpan(decoded.displacement, 3)} into ${decoded.dest}` };
    case 'ld-indexed-ixiy':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 3, kind: 'write', summary: `writes 24-bit ${decoded.src} into ${formatIxSpan(decoded.displacement, 3)}` };
    case 'indexed-cb-bit':
    case 'indexed-cb-rotate':
    case 'indexed-cb-res':
    case 'indexed-cb-set':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'read', summary: `${decoded.tag} touches ${formatIxSpan(decoded.displacement, 1)}` };
    default:
      return null;
  }
}

function disassembleFunction() {
  const rows = [];
  const ixAccesses = [];

  let pc = FUNCTION_START;
  while (pc <= FUNCTION_END) {
    const decoded = safeDecode(pc, 'adl');
    if (!decoded) {
      break;
    }

    const text = formatInstruction(decoded);
    const bytes = bytesToHex(romBytes.slice(pc, pc + decoded.length));
    const ixAccess = findIxAccess(decoded);

    rows.push({ pc, bytes, text, decoded, ixAccess });
    if (ixAccess) {
      ixAccesses.push({ ...ixAccess, pc, text });
    }

    pc = decoded.nextPc;
  }

  let localFrameBytes = null;
  if (
    rows.length >= 2
    && rows[0].decoded.tag === 'ld-pair-imm'
    && rows[0].decoded.pair === 'hl'
    && rows[1].decoded.tag === 'call'
    && rows[1].decoded.target === FRAME_HELPER
  ) {
    const frameSeed = signed24(rows[0].decoded.value);
    if (frameSeed < 0) {
      localFrameBytes = -frameSeed;
    }
  }

  return { rows, ixAccesses, localFrameBytes };
}

function describeSpanRole(offset, width) {
  if (offset >= 6) {
    const argIndex = Math.floor((offset - 6) / 3) + 1;
    return width === 3 ? `stacked 24-bit argument ${argIndex}` : `byte within stacked argument ${argIndex}`;
  }
  if (offset >= 3) return 'return-address area';
  if (offset >= 0) return 'saved-caller-IX area';
  return width === 3 ? 'local 24-bit scratch slot' : 'local byte scratch slot';
}

function summarizeIxSpans(ixAccesses) {
  const spans = new Map();

  for (const access of ixAccesses) {
    const key = `${access.offset}:${access.width}`;
    let entry = spans.get(key);
    if (!entry) {
      entry = { offset: access.offset, width: access.width, summaries: [] };
      spans.set(key, entry);
    }
    entry.summaries.push(`${hex(access.pc)} ${access.summary}`);
  }

  return [...spans.values()]
    .sort((left, right) => left.offset - right.offset || left.width - right.width);
}

function printDeliverable1(report) {
  console.log('=== Deliverable 1: Static Disassembly 0x00E4E8-0x00E57E ===');
  console.log('');

  for (const row of report.rows) {
    const note = row.ixAccess ? ` ; ${row.ixAccess.summary}` : '';
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.text}${note}`);
  }

  console.log('');
  console.log('IX-relative accesses inside the function:');
  if (report.ixAccesses.length === 0) {
    console.log('  none');
  } else {
    for (const span of summarizeIxSpans(report.ixAccesses)) {
      console.log(`  ${formatIxSpan(span.offset, span.width)}: ${describeSpanRole(span.offset, span.width)}; ${span.summaries.join(' | ')}`);
    }
  }

  console.log('');
  console.log('Inferred frame layout:');
  if (report.localFrameBytes === null) {
    console.log('  Prologue did not match the expected 0x002197 frame-helper pattern.');
  } else {
    console.log(`  Prologue loads HL=${signed24(report.rows[0].decoded.value)} before CALL ${hex(FRAME_HELPER)}, so the helper reserves ${report.localFrameBytes} local bytes below IX.`);
  }
  console.log('  IX+0..IX+2: saved caller IX (from EX (SP),IX in the frame helper).');
  console.log('  IX+3..IX+5: return address for the CALL into 0x00E4E8.');

  const spans = summarizeIxSpans(report.ixAccesses);
  const positiveSpans = spans.filter((span) => span.offset >= 0);
  const negativeSpans = spans.filter((span) => span.offset < 0);

  if (positiveSpans.length === 0) {
    console.log('  No positive IX offsets were touched, so no stacked parameters were observed.');
  } else {
    for (const span of positiveSpans) {
      console.log(`  ${formatIxSpan(span.offset, span.width)}: ${describeSpanRole(span.offset, span.width)}.`);
    }
  }

  if (negativeSpans.length === 0) {
    console.log('  No negative IX offsets were touched, so no local slots were observed.');
  } else {
    console.log(`  Observed local scratch area: ${negativeSpans.map((span) => formatIxSpan(span.offset, span.width)).join(', ')}.`);
  }

  console.log('');
}

function scanStaticCallers() {
  const hits = [];

  for (let caller = 0; caller <= romBytes.length - 4; caller += 1) {
    const opcode = romBytes[caller];
    if (opcode !== 0xCD && opcode !== 0xC3) {
      continue;
    }

    const target = read24(romBytes, caller + 1);
    if (!SCAN_TARGET_SET.has(target)) {
      continue;
    }

    hits.push({
      caller,
      target,
      kind: opcode === 0xCD ? 'call' : 'jp',
      mode: 'adl',
      length: 4,
      bytes: bytesToHex(romBytes.slice(caller, caller + 4)),
    });
  }

  hits.sort((left, right) => left.target - right.target || left.caller - right.caller || left.kind.localeCompare(right.kind));
  return hits;
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
      if (leftSpan !== rightSpan) return leftSpan - rightSpan;

      const leftOver = left.length - desiredCount;
      const rightOver = right.length - desiredCount;
      if (leftOver !== rightOver) return leftOver - rightOver;
    } else if (right.length !== left.length) {
      return right.length - left.length;
    }

    return right[right.length - 1].pc - left[left.length - 1].pc;
  });

  return candidates[0].slice(-desiredCount);
}

function decodePrefix(site, mode = 'adl', desiredCount = CONTEXT_BEFORE) {
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

      decoded.push({
        pc: instruction.pc,
        bytes: bytesToHex(romBytes.slice(instruction.pc, instruction.pc + instruction.length)),
        text: formatInstruction(instruction),
        decoded: instruction,
      });
      pc = instruction.nextPc;
    }

    if (ok && pc === site && decoded.length > 0) {
      candidates.push(decoded);
    }
  }

  return chooseBestPrefix(candidates, site, desiredCount);
}

function findLastPairWriter(context, pair) {
  for (let index = context.length - 1; index >= 0; index -= 1) {
    const decoded = context[index].decoded;
    if (
      (decoded.tag === 'ld-pair-imm' && decoded.pair === pair)
      || (decoded.tag === 'ld-pair-mem' && decoded.pair === pair)
      || (decoded.tag === 'ld-pair-indexed' && decoded.pair === pair)
      || (decoded.tag === 'ld-pair-ind' && decoded.pair === pair)
      || (decoded.tag === 'pop' && decoded.pair === pair)
      || (decoded.tag === 'inc-pair' && decoded.pair === pair)
      || (decoded.tag === 'dec-pair' && decoded.pair === pair)
      || (decoded.tag === 'add-pair' && decoded.dest === pair)
      || (decoded.tag === 'ld-ixiy-indexed' && decoded.dest === pair)
    ) {
      return context[index];
    }
  }

  return null;
}

function summarizeCallerSetup(context, hit) {
  const lines = [];
  const ixWriters = context.filter((row) => writesIx(row.decoded));
  const ixMentions = context.filter((row) => mentionsIx(row.text));

  if (ixWriters.length === 0) {
    lines.push('No direct IX write appears in the previous 10 decoded instructions.');
  } else {
    lines.push(`Direct IX writers: ${ixWriters.map((row) => `${hex(row.pc)} ${row.text}`).join(' | ')}`);
  }

  const immediatePrev = context[context.length - 1] ?? null;
  if (immediatePrev?.decoded?.tag === 'push') {
    lines.push(`Immediate stack setup before ${hit.kind.toUpperCase()}: ${hex(immediatePrev.pc)} ${immediatePrev.text}.`);

    const source = findLastPairWriter(context.slice(0, -1), immediatePrev.decoded.pair);
    if (source) {
      lines.push(`${immediatePrev.decoded.pair.toUpperCase()} was prepared by ${hex(source.pc)} ${source.text}.`);
    }

    if (hit.kind === 'call') {
      lines.push(`That pushed ${immediatePrev.decoded.pair.toUpperCase()} becomes the callee's first stacked argument at IX+6..IX+8.`);
    }
  }

  if (hit.kind === 'jp') {
    lines.push('This site is a JP, not a CALL. 0x00E4E8 will not receive a fresh return address from this entry.');
  }

  if (ixWriters.length === 0 && ixMentions.length > 0) {
    lines.push(`Nearby IX-relative activity: ${ixMentions.map((row) => `${hex(row.pc)} ${row.text}`).join(' | ')}`);
  }

  return lines;
}

function printDeliverable2(hits) {
  console.log('=== Deliverable 2: ROM Caller Scan ===');
  console.log('');
  console.log(`Scanned CALL/JP literals for ${SCAN_TARGETS.length} nearby entry points (${hex(SCAN_TARGETS[0])} through ${hex(SCAN_TARGETS[SCAN_TARGETS.length - 1])}, plus ${hex(0x00E4E5)}).`);
  console.log('');

  for (const target of SCAN_TARGETS) {
    const targetHits = hits.filter((hit) => hit.target === target);
    const callCount = targetHits.filter((hit) => hit.kind === 'call').length;
    const jpCount = targetHits.filter((hit) => hit.kind === 'jp').length;
    console.log(`${hex(target)}: CALL=${callCount} JP=${jpCount}`);
  }

  console.log('');
  if (hits.length === 0) {
    console.log('No static CALL/JP sites matched the requested entry points.');
    console.log('');
    return;
  }

  for (const hit of hits) {
    const context = decodePrefix(hit.caller, hit.mode, CONTEXT_BEFORE);

    console.log(`[${hit.kind.toUpperCase()}] ${hex(hit.caller)} -> ${hex(hit.target)}  bytes=${hit.bytes}`);
    for (const row of context) {
      console.log(`   ${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.text}`);
    }
    console.log(`=> ${hex(hit.caller)}  ${hit.bytes.padEnd(17)}  ${hit.kind} ${hex(hit.target)}`);

    for (const line of summarizeCallerSetup(context, hit)) {
      console.log(`   ${line}`);
    }

    console.log('');
  }
}

function snapshotRegisters(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    madl: cpu.madl & 0x1,
    mbase: cpu.mbase & 0xFF,
  };
}

function parseBlockKey(key) {
  const match = /^([0-9a-fA-F]{6}):(adl|z80)$/.exec(key);
  if (!match) {
    return null;
  }

  return {
    pc: Number.parseInt(match[1], 16),
    mode: match[2],
  };
}

function resetForKernelInit(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function recordMemoryAccess(trace, cpu, op, addr, width, value) {
  const start = addr & 0xFFFFFF;
  const end = start + width - 1;
  if (end < FUNCTION_START || start > FUNCTION_TRACE_END) {
    return;
  }

  trace.rangeAccesses.push({
    phase: trace.current.phase,
    step: trace.current.step,
    blockPc: trace.current.pc,
    blockMode: trace.current.mode,
    op,
    addr: start,
    end,
    value,
    regs: snapshotRegisters(cpu),
  });
}

function installDynamicTrace(machine, hits) {
  const { cpu, executor, mem } = machine;
  const trace = {
    current: { phase: 'idle', step: 0, pc: null, mode: null },
    rangeEntries: [],
    rangeAccesses: [],
    observedCallers: [],
  };

  const originalRead8 = cpu.read8.bind(cpu);
  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    recordMemoryAccess(trace, cpu, 'read8', addr, 1, value & 0xFF);
    return value;
  };

  const originalRead16 = cpu.read16.bind(cpu);
  cpu.read16 = (addr) => {
    const value = originalRead16(addr);
    recordMemoryAccess(trace, cpu, 'read16', addr, 2, value & 0xFFFF);
    return value;
  };

  const originalRead24 = cpu.read24.bind(cpu);
  cpu.read24 = (addr) => {
    const value = originalRead24(addr);
    recordMemoryAccess(trace, cpu, 'read24', addr, 3, value & 0xFFFFFF);
    return value;
  };

  const hitsByCaller = new Map();
  for (const hit of hits) {
    if (!hitsByCaller.has(hit.caller)) {
      hitsByCaller.set(hit.caller, []);
    }
    hitsByCaller.get(hit.caller).push(hit);
  }

  for (const [key, meta] of Object.entries(executor.blockMeta)) {
    const blockInfo = parseBlockKey(key);
    if (!blockInfo) {
      continue;
    }

    const watchedSites = [];
    for (const instruction of meta.instructions ?? []) {
      const siteHits = hitsByCaller.get(instruction.pc);
      if (!siteHits) {
        continue;
      }

      const decoded = safeDecode(instruction.pc, blockInfo.mode);
      if (!decoded) {
        continue;
      }

      for (const hit of siteHits) {
        if (decoded.tag === hit.kind && decoded.target === hit.target) {
          watchedSites.push(hit);
        }
      }
    }

    if (watchedSites.length === 0) {
      continue;
    }

    const originalBlock = executor.compiledBlocks[key];
    if (typeof originalBlock !== 'function') {
      continue;
    }

    executor.compiledBlocks[key] = (innerCpu) => {
      const before = snapshotRegisters(innerCpu);
      const result = originalBlock(innerCpu);
      const after = snapshotRegisters(innerCpu);

      for (const hit of watchedSites) {
        if (result !== hit.target) {
          continue;
        }

        trace.observedCallers.push({
          phase: trace.current.phase,
          step: trace.current.step,
          blockPc: trace.current.pc ?? blockInfo.pc,
          blockMode: trace.current.mode ?? blockInfo.mode,
          caller: hit.caller,
          target: hit.target,
          kind: hit.kind,
          ixAtBlockEntry: before.ix,
          ixAtTransfer: after.ix,
          spAtTransfer: after.sp,
          returnAddr: hit.kind === 'call' ? read24(mem, after.sp) : null,
          stackedArg0: hit.kind === 'call' ? read24(mem, after.sp + 3) : null,
        });
      }

      return result;
    };
  }

  return trace;
}

function createMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function runTracePhase(machine, trace, phase, entry, mode, maxSteps, maxLoopIterations) {
  trace.current = { phase, step: 0, pc: null, mode: null };

  const result = machine.executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
    onBlock(pc, blockMode, meta, steps) {
      trace.current = {
        phase,
        step: steps + 1,
        pc: pc & 0xFFFFFF,
        mode: blockMode,
      };

      if (pc >= FUNCTION_START && pc <= FUNCTION_TRACE_END) {
        trace.rangeEntries.push({
          phase,
          step: steps + 1,
          pc: pc & 0xFFFFFF,
          mode: blockMode,
          regs: snapshotRegisters(machine.cpu),
        });
      }
    },
  });

  trace.current = { phase: 'idle', step: 0, pc: null, mode: null };
  return result;
}

function runDynamicTrace(hits) {
  const machine = createMachine();
  const trace = installDynamicTrace(machine, hits);

  const bootResult = runTracePhase(
    machine,
    trace,
    'boot',
    BOOT_ENTRY,
    BOOT_MODE,
    BOOT_MAX_STEPS,
    BOOT_MAX_LOOP_ITERATIONS,
  );

  resetForKernelInit(machine.cpu, machine.mem);

  const kernelInitResult = runTracePhase(
    machine,
    trace,
    'kernel_init',
    KERNEL_INIT_ENTRY,
    KERNEL_INIT_MODE,
    KERNEL_INIT_MAX_STEPS,
    KERNEL_INIT_MAX_LOOP_ITERATIONS,
  );

  return {
    trace,
    bootResult,
    kernelInitResult,
  };
}

function formatRegSnapshot(regs) {
  return [
    `A=${hex(regs.a, 2)}`,
    `F=${hex(regs.f, 2)}`,
    `BC=${hex(regs.bc)}`,
    `DE=${hex(regs.de)}`,
    `HL=${hex(regs.hl)}`,
    `IX=${hex(regs.ix)}`,
    `IY=${hex(regs.iy)}`,
    `SP=${hex(regs.sp)}`,
    `MADL=${regs.madl}`,
    `MBASE=${hex(regs.mbase, 2)}`,
  ].join(' ');
}

function printRunResult(label, result) {
  console.log(
    `${label}: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode ?? 'n/a'}`,
  );
}

function printDeliverable3(report, hits) {
  console.log('=== Deliverable 3: Dynamic IX Trace Through Boot ===');
  console.log('');
  printRunResult('Boot', report.bootResult);
  printRunResult('Kernel init', report.kernelInitResult);
  console.log('');

  console.log('Function-range block entries:');
  if (report.trace.rangeEntries.length === 0) {
    console.log('  none');
  } else {
    for (const entry of report.trace.rangeEntries) {
      console.log(`  [${entry.phase} step ${entry.step}] PC=${hex(entry.pc)} mode=${entry.mode} ${formatRegSnapshot(entry.regs)}`);
    }
  }

  console.log('');
  console.log(`Function-range memory reads via wrapped cpu.read8/read16/read24 (${hex(FUNCTION_START)}-${hex(FUNCTION_TRACE_END)}):`);
  if (report.trace.rangeAccesses.length === 0) {
    console.log('  none');
  } else {
    for (const access of report.trace.rangeAccesses) {
      const span = access.addr === access.end ? hex(access.addr) : `${hex(access.addr)}-${hex(access.end)}`;
      console.log(`  [${access.phase} step ${access.step}] block=${hex(access.blockPc)} mode=${access.blockMode} ${access.op} ${span} => ${hex(access.value)} ${formatRegSnapshot(access.regs)}`);
    }
  }

  console.log('');
  console.log('Static caller sites reached during boot/kernel init:');
  if (report.trace.observedCallers.length === 0) {
    console.log('  none of the static CALL/JP sites were reached');
  } else {
    for (const caller of report.trace.observedCallers) {
      const argText = caller.kind === 'call'
        ? ` return=${hex(caller.returnAddr)} arg0=${hex(caller.stackedArg0)}`
        : '';
      console.log(`  [${caller.phase} step ${caller.step}] ${caller.kind.toUpperCase()} ${hex(caller.caller)} -> ${hex(caller.target)} block=${hex(caller.blockPc)} mode=${caller.blockMode} IX(entry)=${hex(caller.ixAtBlockEntry)} IX(transfer)=${hex(caller.ixAtTransfer)} SP(transfer)=${hex(caller.spAtTransfer)}${argText}`);
    }
  }

  const reachedCallers = new Set(report.trace.observedCallers.map((caller) => caller.caller));
  const unreached = [...new Set(hits.map((hit) => hit.caller))].filter((caller) => !reachedCallers.has(caller));

  console.log('');
  console.log('Reached caller summary:');
  console.log(`  reached: ${reachedCallers.size === 0 ? 'none' : [...reachedCallers].sort((left, right) => left - right).map((caller) => hex(caller)).join(', ')}`);
  console.log(`  unreached: ${unreached.length === 0 ? 'none' : unreached.map((caller) => hex(caller)).join(', ')}`);
  console.log('');
}

async function main() {
  console.log('=== Phase 166: IX Corruption Source Investigation ===');
  console.log('');

  const disassembly = disassembleFunction();
  printDeliverable1(disassembly);

  const hits = scanStaticCallers();
  printDeliverable2(hits);

  const dynamicReport = runDynamicTrace(hits);
  printDeliverable3(dynamicReport, hits);
}

try {
  await main();
} catch (error) {
  console.error('Phase 166 IX caller probe failed.');
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}

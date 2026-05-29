#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ENTRY = 0x03CF7D;
const INSTRUCTION_LIMIT = 300;
const CORE_WINDOW_START = ENTRY;
const CORE_WINDOW_END = ENTRY + 0x400;
const EXTERNAL_PREVIEW_PER_TARGET = 4;

const WATCHED_RAM = new Map([
  [0xD00587, 'kbdScanCode'],
  [0xD0058D, 'kbdLastKey'],
  [0xD141B5, 'keyBuffer'],
  [0xD14091, 'keyProcessingEnabled'],
  [0xD177B7, 'modeLatch'],
  [0xD1441D, 'keyHandlerTablePtr'],
]);

const AUX_RAM = new Map([
  [0xD00080, 'systemFlagsBase'],
  [0xD00590, 'kbdAux90'],
  [0xD00591, 'kbdAux91'],
  [0xD005F5, 'deferredCountdown'],
  [0xD02651, 'timerCountdown8'],
  [0xD02658, 'timerCountdown24'],
  [0xD02AD7, 'callbackPtr'],
]);

const TARGET_LABELS = new Map([
  [0x0003CC, 'vector_0003CC -> jp 0x003C4B'],
  [0x02510E, 'port_0x7034 transfer helper'],
  [0x0300A1, 'port/status helper'],
  [0x03D0E0, 'common irq epilogue'],
  [0x03D1C3, 'deferred callback helper'],
  [0x03F994, 'KbdScan / debounce helper'],
  [0x04049B, 'status gate helper'],
  [0x0404EC, 'system flag / callback gate'],
  [0x040D11, 'D00590/D00591 state helper'],
  [0x049526, 'mode-gated helper (reads D177B7)'],
  [0x04C6A3, 'mode/state dispatch helper'],
  [0x05C623, 'cursor blink helper'],
  [0x05F685, 'display callback wrapper'],
  [0x0BCC81, 'D14038/D1407x helper'],
]);

const rom = readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function formatSigned(value) {
  const normalized = Number(value ?? 0);
  const abs = Math.abs(normalized);
  return `${normalized >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${upper(indexRegister)}${formatSigned(displacement)})`;
}

function bytesToHex(start, length) {
  const end = Math.min(rom.length, start + Math.max(length, 0));
  return Array.from(
    rom.subarray(start, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function safeDecode(pc, mode = 'adl') {
  try {
    const decoded = decodeInstruction(rom, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      pc,
      nextPc: pc + 1,
      length: 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'decodeError',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${formatSigned(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function withPrefix(inst, text) {
  if (!inst?.modePrefix) return text;
  return `.${String(inst.modePrefix).toUpperCase()} ${text}`;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    case 'nop':
    case 'halt':
    case 'slp':
    case 'di':
    case 'ei':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
    case 'stmix':
    case 'rsmix':
    case 'exx':
      return upper(inst.tag);
    case 'ex-af':
      return "EX AF,AF'";
    case 'ex-de-hl':
      return 'EX DE,HL';
    case 'ex-sp-hl':
      return 'EX (SP),HL';
    case 'ex-sp-pair':
      return `EX (SP),${upper(inst.pair)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)},${hex(inst.target)}`;
    case 'rst':
      return `RST ${hex(inst.target ?? inst.vector ?? 0, 2)}`;
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr ?? inst.address)}),${upper(inst.src)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr ?? inst.address)}),${upper(inst.pair)}`;
      }
      return `LD ${upper(inst.pair)},(${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr ?? inst.address)}),${upper(inst.pair)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)},${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
    case 'ld-idx-disp-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)},${upper(inst.src)}`;
    case 'ld-reg-ixd':
    case 'ld-reg-idx-disp':
      return `LD ${upper(inst.dest)},${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'adc-pair':
      return `ADC HL,${upper(inst.src)}`;
    case 'sbc-pair':
      return `SBC HL,${upper(inst.src)}`;
    case 'in-reg':
      return `IN ${upper(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${upper(inst.reg)}`;
    case 'in0':
      return `IN0 ${upper(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${upper(inst.reg)}`;
    case 'in-imm':
      return `IN A,(${hex(inst.port, 2)})`;
    case 'out-imm':
      return `OUT (${hex(inst.port, 2)}),A`;
    case 'bit-test':
      return `BIT ${inst.bit},${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit},(${upper(inst.indirectRegister)})`;
    case 'bit-set':
      return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set-ind':
      return `SET ${inst.bit},(${upper(inst.indirectRegister)})`;
    case 'bit-res':
      return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res-ind':
      return `RES ${inst.bit},(${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit},${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg':
      return `${upper(inst.op)} ${upper(inst.reg)}`;
    case 'rotate-ind':
      return `${upper(inst.op)} (${upper(inst.indirectRegister)})`;
    case 'ld-special':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'mlt':
      return `MLT ${upper(inst.reg)}`;
    case 'im':
      return `IM ${inst.value}`;
    case 'lea':
      return `LEA ${upper(inst.dest)},${formatIndexedOperand(inst.base, inst.displacement)}`;
    default: {
      const fallback = fallbackOperands(inst);
      return fallback ? `${upper(inst.tag)} ${fallback}` : upper(inst.tag);
    }
  }
}

function isReturnLike(tag) {
  return tag === 'ret'
    || tag === 'ret-conditional'
    || tag === 'reti'
    || tag === 'retn'
    || tag === 'halt'
    || tag === 'slp';
}

function isJumpLike(tag) {
  return tag === 'jp'
    || tag === 'jp-conditional'
    || tag === 'jp-indirect'
    || tag === 'jr'
    || tag === 'jr-conditional'
    || tag === 'djnz';
}

function isCallLike(tag) {
  return tag === 'call' || tag === 'call-conditional';
}

function isComputedTransfer(tag) {
  return tag === 'jp-indirect'
    || tag === 'jp-hl'
    || tag === 'jp-ix'
    || tag === 'jp-iy'
    || tag === 'call-indirect';
}

function withinCore(addr) {
  return addr >= CORE_WINDOW_START && addr <= CORE_WINDOW_END;
}

function mapHitsFromInstruction(inst, pc, maps, source) {
  for (const value of Object.values(inst)) {
    if (typeof value !== 'number') continue;
    const normalized = value & 0xFFFFFF;

    if (WATCHED_RAM.has(normalized)) {
      if (!maps.watched.has(normalized)) maps.watched.set(normalized, []);
      maps.watched.get(normalized).push({ pc, source });
    }

    if (AUX_RAM.has(normalized)) {
      if (!maps.aux.has(normalized)) maps.aux.set(normalized, []);
      maps.aux.get(normalized).push({ pc, source });
    }
  }
}

function pushUnique(list, seen, item) {
  const key = `${item.type}:${item.target}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push(item);
}

function addTransferRecord(map, target, from) {
  if (!map.has(target)) map.set(target, []);
  map.get(target).push(from);
}

function walkCore() {
  const queue = [ENTRY];
  const seen = new Set();
  const rows = [];
  const externalTargets = [];
  const externalSeen = new Set();
  const watched = new Map();
  const aux = new Map();
  const directCalls = new Map();
  const jumpTargets = new Map();
  const computed = [];

  let minPc = ENTRY;
  let maxPc = ENTRY;

  while (queue.length && rows.length < INSTRUCTION_LIMIT) {
    const pc = queue.shift() & 0xFFFFFF;
    if (seen.has(pc) || !withinCore(pc) || pc >= rom.length) continue;

    const inst = safeDecode(pc);
    seen.add(pc);
    rows.push({
      scope: 'core',
      pc,
      inst,
      text: withPrefix(inst, formatInstruction(inst)),
      bytes: bytesToHex(pc, inst.length),
    });

    minPc = Math.min(minPc, pc);
    maxPc = Math.max(maxPc, pc + inst.length - 1);

    mapHitsFromInstruction(inst, pc, { watched, aux }, 'core');

    if (isComputedTransfer(inst.tag)) {
      computed.push({ pc, tag: inst.tag });
    }

    const target = typeof inst.target === 'number' ? (inst.target & 0xFFFFFF) : null;
    const fallthrough = typeof inst.fallthrough === 'number'
      ? (inst.fallthrough & 0xFFFFFF)
      : (inst.nextPc & 0xFFFFFF);
    const nextPc = inst.nextPc & 0xFFFFFF;

    if (isCallLike(inst.tag) && target !== null) {
      addTransferRecord(directCalls, target, pc);
      if (withinCore(target)) {
        queue.push(target);
      } else {
        pushUnique(externalTargets, externalSeen, { type: 'call', target, from: pc });
      }
      if (withinCore(nextPc)) queue.push(nextPc);
      continue;
    }

    if (inst.tag === 'rst') {
      addTransferRecord(directCalls, inst.target ?? 0, pc);
      continue;
    }

    if (isJumpLike(inst.tag) && target !== null) {
      addTransferRecord(jumpTargets, target, pc);
      if (inst.tag === 'jp' || inst.tag === 'jr' || inst.tag === 'jp-indirect') {
        if (withinCore(target)) {
          queue.push(target);
        } else {
          pushUnique(externalTargets, externalSeen, { type: 'jump', target, from: pc });
        }
        continue;
      }

      if (withinCore(target)) {
        queue.push(target);
      } else {
        pushUnique(externalTargets, externalSeen, { type: 'jump', target, from: pc });
      }
      if (withinCore(fallthrough)) queue.push(fallthrough);
      continue;
    }

    if (!isReturnLike(inst.tag) && withinCore(nextPc)) {
      queue.push(nextPc);
    }
  }

  return {
    rows: rows.sort((a, b) => a.pc - b.pc),
    externalTargets,
    watched,
    aux,
    directCalls,
    jumpTargets,
    computed,
    minPc,
    maxPc,
  };
}

function previewExternalTargets(state, printedCount) {
  const rows = [];
  const previewSeen = new Set();
  const remaining = Math.max(0, INSTRUCTION_LIMIT - printedCount);
  if (remaining === 0) return rows;

  const watched = state.watched;
  const aux = state.aux;

  for (const targetInfo of state.externalTargets) {
    if (rows.length >= remaining) break;
    let pc = targetInfo.target & 0xFFFFFF;
    let previewCount = 0;

    while (previewCount < EXTERNAL_PREVIEW_PER_TARGET && rows.length < remaining && pc < rom.length) {
      const key = `${targetInfo.target}:${pc}`;
      if (previewSeen.has(key)) break;
      previewSeen.add(key);

      const inst = safeDecode(pc);
      rows.push({
        scope: 'preview',
        pc,
        inst,
        text: withPrefix(inst, formatInstruction(inst)),
        bytes: bytesToHex(pc, inst.length),
        origin: targetInfo.target,
        originType: targetInfo.type,
        originFrom: targetInfo.from,
      });

      mapHitsFromInstruction(inst, pc, { watched, aux }, 'preview');

      previewCount += 1;
      if (isReturnLike(inst.tag) || inst.tag === 'jp' || inst.tag === 'jr') break;
      pc = inst.nextPc & 0xFFFFFF;
    }
  }

  return rows;
}

function annotationText(row) {
  const notes = [];
  const inst = row.inst;
  const target = typeof inst.target === 'number' ? (inst.target & 0xFFFFFF) : null;

  if (isCallLike(inst.tag) && target !== null) {
    notes.push(`CALL -> ${hex(target)}${TARGET_LABELS.has(target) ? ` ${TARGET_LABELS.get(target)}` : ''}`);
  } else if (isJumpLike(inst.tag) && target !== null) {
    notes.push(`JMP -> ${hex(target)}${TARGET_LABELS.has(target) ? ` ${TARGET_LABELS.get(target)}` : ''}`);
  } else if (inst.tag === 'rst') {
    notes.push(`RST -> ${hex(inst.target ?? 0, 2)}`);
  }

  const hits = [];
  for (const value of Object.values(inst)) {
    if (typeof value !== 'number') continue;
    const normalized = value & 0xFFFFFF;
    if (WATCHED_RAM.has(normalized)) hits.push(`${WATCHED_RAM.get(normalized)}=${hex(normalized)}`);
    if (AUX_RAM.has(normalized)) hits.push(`${AUX_RAM.get(normalized)}=${hex(normalized)}`);
  }
  if (hits.length) notes.push(`RAM ${[...new Set(hits)].join(', ')}`);

  if (row.scope === 'preview' && row.pc === row.origin) {
    notes.push(`preview ${row.originType} from ${hex(row.originFrom)}`);
  }

  return notes.length ? ` ; ${notes.join(' | ')}` : '';
}

function printReferenceSummary(title, labels, hits) {
  console.log(title);
  for (const [addr, label] of labels.entries()) {
    const refs = hits.get(addr) ?? [];
    if (refs.length === 0) {
      console.log(`  ${hex(addr)} ${label}: (not seen)`);
      continue;
    }

    const pcs = [...new Set(refs.map((ref) => `${hex(ref.pc)} [${ref.source}]`))];
    console.log(`  ${hex(addr)} ${label}: ${pcs.join(', ')}`);
  }
}

function printTransferSummary(title, transfers) {
  console.log(title);
  if (transfers.size === 0) {
    console.log('  (none)');
    return;
  }

  for (const [target, froms] of [...transfers.entries()].sort((a, b) => a[0] - b[0])) {
    const fromText = [...new Set(froms.map((pc) => hex(pc)))].join(', ');
    const label = TARGET_LABELS.has(target) ? ` ${TARGET_LABELS.get(target)}` : '';
    console.log(`  ${hex(target)}${label} <- ${fromText}`);
  }
}

function main() {
  const state = walkCore();
  const previewRows = previewExternalTargets(state, state.rows.length);

  let printed = 0;

  console.log('Phase 458 - 0x03CF7D Event Loop Dispatch Static Trace');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Entry: ${hex(ENTRY)}`);
  console.log(`Instruction limit: ${INSTRUCTION_LIMIT}`);
  console.log(`Core window: ${hex(CORE_WINDOW_START)}-${hex(CORE_WINDOW_END)}`);
  console.log('');

  console.log('=== Core Dispatch Region ===');
  for (const row of state.rows) {
    printed += 1;
    const index = String(printed).padStart(3, '0');
    console.log(
      `[${index}] ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${annotationText(row)}`,
    );
  }

  if (previewRows.length) {
    console.log('');
    console.log('=== Direct External Target Previews ===');
    let currentOrigin = null;
    for (const row of previewRows) {
      if (row.origin !== currentOrigin) {
        currentOrigin = row.origin;
        const label = TARGET_LABELS.has(row.origin) ? ` (${TARGET_LABELS.get(row.origin)})` : '';
        console.log('');
        console.log(`-- ${row.originType.toUpperCase()} target ${hex(row.origin)}${label} from ${hex(row.originFrom)} --`);
      }

      printed += 1;
      const index = String(printed).padStart(3, '0');
      console.log(
        `[${index}] ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${annotationText(row)}`,
      );
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Printed instructions: ${printed}`);
  console.log(`  Core reachable instructions: ${state.rows.length}`);
  console.log(`  Core span: ${hex(state.minPc)}-${hex(state.maxPc)} (${hex(state.maxPc - state.minPc + 1)} bytes)`);
  console.log(`  External previews: ${previewRows.length}`);
  console.log('');

  printTransferSummary('Direct CALL targets', state.directCalls);
  console.log('');
  printTransferSummary('Direct JP/JR targets', state.jumpTargets);
  console.log('');
  printReferenceSummary('Requested key RAM references', WATCHED_RAM, state.watched);
  console.log('');
  printReferenceSummary('Other useful RAM references', AUX_RAM, state.aux);
  console.log('');

  console.log('Computed jumps / dispatch tables');
  if (state.computed.length === 0) {
    console.log('  (none encountered in the first 300 decoded instructions)');
  } else {
    for (const hit of state.computed) {
      console.log(`  ${hex(hit.pc)} ${hit.tag}`);
    }
  }
}

main();

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const ENTRY = 0x049526;
const WINDOW_BYTES = 0x300;
const WINDOW_END = ENTRY + WINDOW_BYTES;
const INSTRUCTION_LIMIT = 200;

const WATCHED_RAM = new Map([
  [0xD177B7, 'modeLatch / display-dirty'],
  [0xD141B5, 'keyBuffer'],
  [0xD14091, 'keyProcessingEnabled'],
  [0xD1441D, 'keyHandlerTablePtr'],
]);

const EXTRA_RAM_LABELS = new Map([
  [0xD14042, 'maskedStatusBMask'],
  [0xD14043, 'statusA_raw'],
  [0xD14044, 'statusA_masked'],
  [0xD14046, 'maskedStatusAMask'],
  [0xD14047, 'statusB_raw'],
  [0xD14048, 'statusB_masked'],
  [0xD14049, 'altStatusA_raw'],
  [0xD14073, 'deviceConnectedFlag'],
]);

const TARGET_LABELS = new Map([
  [ENTRY, 'entry: mask FTINTC bit 5'],
  [0x04953B, 'D177B7 gate'],
  [0x049545, '0x55-armed status sample path'],
  [0x049567, 'status-byte helper fanout'],
  [0x04959D, 'masked status consolidation'],
  [0x0495AB, 'display update dispatch'],
  [0x0495C0, 're-enable FTINTC bit 5'],
  [0x0495D7, 'all-zero status alternate path'],
  [0x0495DE, '0x3014/0x3015 alternate sample'],
  [0x049614, 'LCD setup / teardown handoff'],
  [0x049618, 'ret'],
  [0x000008, 'RST 0x08 trap/assert'],
  [0x0003E8, 'usb_SelfPowered / system-event check'],
  [0x048E44, 'link port event handler'],
  [0x04908C, 'LCD controller setup/teardown'],
  [0x04929D, 'display update dispatcher'],
  [0x04B604, 'process USB status B events'],
  [0x04B624, 'process USB status A events'],
]);

const PORT_LABELS = new Map([
  [0x005005, 'FTINTC enable/mask register'],
  [0x003014, 'alt status port B'],
  [0x003015, 'alt status port A'],
  [0x003084, 'status port B'],
  [0x003085, 'status port A'],
]);

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
    || tag === 'slp'
    || tag === 'jp-indirect';
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

function inWindow(pc) {
  return pc >= ENTRY && pc < WINDOW_END && pc < rom.length;
}

function addTransferRecord(map, target, from) {
  if (!map.has(target)) map.set(target, []);
  map.get(target).push(from);
}

function pushExternalTransfer(list, seen, item) {
  const key = `${item.type}:${item.target}:${item.from}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push(item);
}

function walkFunction() {
  const queue = [ENTRY];
  const seen = new Set();
  const rows = [];
  const callTargets = new Map();
  const jumpTargets = new Map();
  const externalTransfers = [];
  const externalSeen = new Set();

  while (queue.length > 0 && rows.length < INSTRUCTION_LIMIT) {
    const pc = queue.shift() & 0xFFFFFF;
    if (seen.has(pc) || !inWindow(pc)) continue;

    const inst = safeDecode(pc);
    const nextPc = inst.nextPc & 0xFFFFFF;
    const target = typeof inst.target === 'number' ? (inst.target & 0xFFFFFF) : null;

    seen.add(pc);
    rows.push({
      pc,
      inst,
      bytes: bytesToHex(pc, inst.length),
      text: withPrefix(inst, formatInstruction(inst)),
    });

    if (isCallLike(inst.tag)) {
      if (target !== null) {
        addTransferRecord(callTargets, target, pc);
        if (!inWindow(target)) {
          pushExternalTransfer(externalTransfers, externalSeen, { type: 'call', target, from: pc });
        }
      }
      if (inWindow(nextPc)) queue.push(nextPc);
      continue;
    }

    if (inst.tag === 'rst') {
      const rstTarget = inst.target ?? inst.vector ?? 0;
      addTransferRecord(callTargets, rstTarget, pc);
      if (!inWindow(rstTarget)) {
        pushExternalTransfer(externalTransfers, externalSeen, { type: 'rst', target: rstTarget, from: pc });
      }
      if (inWindow(nextPc)) queue.push(nextPc);
      continue;
    }

    if (inst.tag === 'jp' || inst.tag === 'jr') {
      if (target !== null) {
        addTransferRecord(jumpTargets, target, pc);
        if (inWindow(target)) {
          queue.push(target);
        } else {
          pushExternalTransfer(externalTransfers, externalSeen, { type: 'jump', target, from: pc });
        }
      }
      continue;
    }

    if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
      if (target !== null) {
        addTransferRecord(jumpTargets, target, pc);
        if (inWindow(target)) {
          queue.push(target);
        } else {
          pushExternalTransfer(externalTransfers, externalSeen, { type: 'jump', target, from: pc });
        }
      }
      if (inWindow(nextPc)) queue.push(nextPc);
      continue;
    }

    if (!isReturnLike(inst.tag) && inWindow(nextPc)) {
      queue.push(nextPc);
    }
  }

  const sortedRows = rows.sort((left, right) => left.pc - right.pc);
  const minPc = sortedRows.length ? sortedRows[0].pc : ENTRY;
  const maxPc = sortedRows.length
    ? sortedRows.reduce((current, row) => Math.max(current, row.pc + row.inst.length - 1), ENTRY)
    : ENTRY;

  return {
    rows: sortedRows,
    callTargets,
    jumpTargets,
    externalTransfers,
    minPc,
    maxPc,
  };
}

function addRamRef(map, addr, kind, pc, width) {
  const normalized = addr & 0xFFFFFF;
  if (!map.has(normalized)) {
    map.set(normalized, { addr: normalized, reads: [], writes: [], widths: new Set() });
  }

  const entry = map.get(normalized);
  entry.widths.add(width);
  if (kind === 'read') {
    entry.reads.push(pc);
  } else {
    entry.writes.push(pc);
  }
}

function collectAbsoluteRamRefs(rows) {
  const refs = new Map();

  for (const row of rows) {
    const { inst, pc } = row;
    switch (inst.tag) {
      case 'ld-reg-mem':
        addRamRef(refs, inst.addr, 'read', pc, 1);
        break;
      case 'ld-mem-reg':
        addRamRef(refs, inst.addr, 'write', pc, 1);
        break;
      case 'ld-pair-mem':
        addRamRef(refs, inst.addr, inst.direction === 'to-mem' ? 'write' : 'read', pc, 3);
        break;
      case 'ld-mem-pair':
        addRamRef(refs, inst.addr, 'write', pc, 3);
        break;
      default:
        break;
    }
  }

  return refs;
}

function inferPortFromBc(rows, rowIndex) {
  for (let index = rowIndex - 1; index >= 0 && index >= rowIndex - 6; index -= 1) {
    const inst = rows[index].inst;

    if (isCallLike(inst.tag) || isJumpLike(inst.tag) || isReturnLike(inst.tag) || inst.tag === 'rst') {
      break;
    }

    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      return inst.value & 0xFFFFFF;
    }

    if (
      (inst.tag === 'ld-pair-mem' && inst.pair === 'bc')
      || (inst.tag === 'pop' && inst.pair === 'bc')
      || (inst.tag === 'inc-pair' && inst.pair === 'bc')
      || (inst.tag === 'dec-pair' && inst.pair === 'bc')
      || (inst.tag === 'ld-reg-imm' && (inst.dest === 'b' || inst.dest === 'c'))
      || (inst.tag === 'ld-reg-reg' && (inst.dest === 'b' || inst.dest === 'c'))
    ) {
      return null;
    }
  }

  return null;
}

function addPortRef(map, port, pc, tag) {
  const key = port === null ? 'unknown' : port & 0xFFFFFF;
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push({ pc, tag });
}

function collectPortRefs(rows) {
  const refs = new Map();

  rows.forEach((row, index) => {
    const { inst, pc } = row;
    switch (inst.tag) {
      case 'in0':
      case 'out0':
      case 'in-imm':
      case 'out-imm':
        addPortRef(refs, inst.port & 0xFFFFFF, pc, inst.tag);
        break;
      case 'in-reg':
      case 'out-reg':
        addPortRef(refs, inferPortFromBc(rows, index), pc, inst.tag);
        break;
      default:
        break;
    }
  });

  return refs;
}

function renderPcList(pcs) {
  return [...new Set(pcs)].sort((left, right) => left - right).map((pc) => hex(pc)).join(', ');
}

function ramLabel(addr) {
  return WATCHED_RAM.get(addr) || EXTRA_RAM_LABELS.get(addr) || null;
}

function transferLabel(addr) {
  return TARGET_LABELS.get(addr) || null;
}

function portLabel(addr) {
  return PORT_LABELS.get(addr) || null;
}

function annotationText(rows, rowIndex, ramRefs, portRefs) {
  const row = rows[rowIndex];
  const { inst } = row;
  const notes = [];
  const target = typeof inst.target === 'number' ? (inst.target & 0xFFFFFF) : null;

  if ((isCallLike(inst.tag) || isJumpLike(inst.tag) || inst.tag === 'rst') && target !== null) {
    const label = transferLabel(target);
    notes.push(`${upper(inst.tag)} -> ${hex(target)}${label ? ` ${label}` : ''}`);
  }

  if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc' && portLabel(inst.value & 0xFFFFFF)) {
    notes.push(`BC=${hex(inst.value)} ${portLabel(inst.value & 0xFFFFFF)}`);
  }

  if (
    inst.tag === 'ld-reg-mem'
    || inst.tag === 'ld-mem-reg'
    || inst.tag === 'ld-pair-mem'
    || inst.tag === 'ld-mem-pair'
  ) {
    const addr = (inst.addr ?? inst.address) & 0xFFFFFF;
    const label = ramLabel(addr);
    const entry = ramRefs.get(addr);
    const kind = entry && entry.reads.includes(row.pc) ? 'read' : 'write';
    notes.push(`RAM ${kind} ${hex(addr)}${label ? ` ${label}` : ''}`);
  }

  if (inst.tag === 'in-reg' || inst.tag === 'out-reg' || inst.tag === 'in0' || inst.tag === 'out0' || inst.tag === 'in-imm' || inst.tag === 'out-imm') {
    const port = inst.port !== undefined ? (inst.port & 0xFFFFFF) : inferPortFromBc(rows, rowIndex);
    const label = port === null ? null : portLabel(port);
    notes.push(`PORT ${port === null ? 'unknown' : hex(port)}${label ? ` ${label}` : ''}`);
  }

  return notes.length ? ` ; ${notes.join(' | ')}` : '';
}

function analyzeD177B7Gate(rows) {
  const hits = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const next = rows[index + 1];
    const branch = rows[index + 2];

    if (row.inst.tag !== 'ld-reg-mem' || row.inst.dest !== 'a' || row.inst.addr !== 0xD177B7) {
      continue;
    }

    const info = {
      loadPc: row.pc,
      loadText: row.text,
      comparePc: next?.pc ?? null,
      compareText: next ? formatInstruction(next.inst) : 'missing',
      branchPc: branch?.pc ?? null,
      branchText: branch ? formatInstruction(branch.inst) : 'missing',
      compareValue: null,
      equalTarget: null,
      nonEqualTarget: null,
    };

    if (next?.inst.tag === 'alu-imm' && next.inst.op === 'cp') {
      info.compareValue = next.inst.value & 0xFF;
    }

    if (branch && (branch.inst.tag === 'jp-conditional' || branch.inst.tag === 'jr-conditional')) {
      const fallthrough = branch.inst.nextPc & 0xFFFFFF;
      const target = branch.inst.target & 0xFFFFFF;
      if (branch.inst.condition === 'z') {
        info.equalTarget = target;
        info.nonEqualTarget = fallthrough;
      } else if (branch.inst.condition === 'nz') {
        info.equalTarget = fallthrough;
        info.nonEqualTarget = target;
      }
    }

    hits.push(info);
  }

  return hits;
}

function printTransferSummary(title, transfers) {
  console.log(title);
  if (transfers.size === 0) {
    console.log('  (none)');
    return;
  }

  for (const [target, froms] of [...transfers.entries()].sort((left, right) => left[0] - right[0])) {
    const label = transferLabel(target);
    console.log(`  ${hex(target)}${label ? ` ${label}` : ''} <- ${renderPcList(froms)}`);
  }
}

function printRequestedRamSummary(ramRefs) {
  console.log('Requested RAM watch list');
  for (const [addr, label] of WATCHED_RAM.entries()) {
    const entry = ramRefs.get(addr);
    if (!entry) {
      console.log(`  ${hex(addr)} ${label}: (not seen)`);
      continue;
    }

    const parts = [];
    if (entry.reads.length) parts.push(`read @ ${renderPcList(entry.reads)}`);
    if (entry.writes.length) parts.push(`write @ ${renderPcList(entry.writes)}`);
    console.log(`  ${hex(addr)} ${label}: ${parts.join('; ')}`);
  }
}

function printOtherRamSummary(ramRefs) {
  console.log('Other direct absolute RAM refs');
  const entries = [...ramRefs.values()]
    .filter((entry) => !WATCHED_RAM.has(entry.addr))
    .sort((left, right) => left.addr - right.addr);

  if (entries.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const entry of entries) {
    const parts = [];
    if (entry.reads.length) parts.push(`read @ ${renderPcList(entry.reads)}`);
    if (entry.writes.length) parts.push(`write @ ${renderPcList(entry.writes)}`);
    const label = ramLabel(entry.addr);
    console.log(`  ${hex(entry.addr)}${label ? ` ${label}` : ''}: ${parts.join('; ')}`);
  }
}

function printD177xxSummary(ramRefs) {
  console.log('D177xx state-block refs');
  const entries = [...ramRefs.values()]
    .filter((entry) => entry.addr >= 0xD17700 && entry.addr <= 0xD177FF)
    .sort((left, right) => left.addr - right.addr);

  if (entries.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const entry of entries) {
    const parts = [];
    if (entry.reads.length) parts.push(`read @ ${renderPcList(entry.reads)}`);
    if (entry.writes.length) parts.push(`write @ ${renderPcList(entry.writes)}`);
    const label = ramLabel(entry.addr);
    console.log(`  ${hex(entry.addr)}${label ? ` ${label}` : ''}: ${parts.join('; ')}`);
  }
}

function printPortSummary(portRefs) {
  console.log('Port I/O');
  const entries = [...portRefs.entries()].sort((left, right) => {
    if (left[0] === 'unknown') return 1;
    if (right[0] === 'unknown') return -1;
    return left[0] - right[0];
  });

  if (entries.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const [port, hits] of entries) {
    if (port === 'unknown') {
      console.log(`  unknown: ${hits.map((hit) => `${hex(hit.pc)} (${hit.tag})`).join(', ')}`);
      continue;
    }

    const label = portLabel(port);
    console.log(`  ${hex(port)}${label ? ` ${label}` : ''}: ${hits.map((hit) => `${hex(hit.pc)} (${hit.tag})`).join(', ')}`);
  }
}

function printD177GateSummary(gates) {
  console.log('D177B7 gate logic');
  if (gates.length === 0) {
    console.log('  No direct D177B7 read was decoded inside the reachable body.');
    return;
  }

  for (const gate of gates) {
    const compareText = gate.compareValue === null ? gate.compareText : `CP ${hex(gate.compareValue, 2)}`;
    console.log(`  ${hex(gate.loadPc)} ${gate.loadText} -> ${compareText} -> ${gate.branchText}`);

    if (gate.compareValue !== null) {
      if (gate.equalTarget !== null) {
        const label = transferLabel(gate.equalTarget);
        console.log(`    equal (${hex(gate.compareValue, 2)}): ${hex(gate.equalTarget)}${label ? ` ${label}` : ''}`);
      }
      if (gate.nonEqualTarget !== null) {
        const label = transferLabel(gate.nonEqualTarget);
        console.log(`    non-equal: ${hex(gate.nonEqualTarget)}${label ? ` ${label}` : ''}`);
      }
    }
  }

  const compares55 = gates.some((gate) => gate.compareValue === 0x55);
  const comparesAA = gates.some((gate) => gate.compareValue === 0xAA);
  console.log(`  0x55 compare present: ${compares55 ? 'yes' : 'no'}`);
  console.log(`  0xAA compare present: ${comparesAA ? 'yes' : 'no'}`);
}

function printConditionalPathSummary(rows) {
  const rowSet = new Set(rows.map((row) => row.pc));
  console.log('D177B7-conditioned path map');
  console.log(`  D177B7 != 0x55 -> ${hex(0x049618)} ret immediately after masking FTINTC bit 5.`);
  console.log(`  D177B7 == 0x55 -> ${hex(0x049545)} sample ports ${hex(0x003084)} / ${hex(0x003085)} and cache them in D14047 / D14043.`);

  if (rowSet.has(0x049565)) {
    console.log(`  If both cached status bytes are zero -> ${hex(0x0495D7)} alternate path; otherwise continue to ${hex(0x049567)} helper fanout.`);
  }
  if (rowSet.has(0x04956F) && rowSet.has(0x04957C) && rowSet.has(0x0495AB)) {
    console.log(`  Non-zero status path -> CALL ${hex(0x04B604)}, CALL ${hex(0x04B624)}, mask with D14042 / D14046, then CALL ${hex(0x04929D)}.`);
  }
  if (rowSet.has(0x0495AF) && rowSet.has(0x0495BE)) {
    console.log(`  After ${hex(0x0003E8)}, a non-zero return plus bit 6 set in port ${hex(0x003084)} jumps straight to ${hex(0x049618)}.`);
  }
  if (rowSet.has(0x0495D7) && rowSet.has(0x049614)) {
    console.log(`  Zero-status alternate path checks D14073: zero -> ${hex(0x0495DE)} sample ${hex(0x003014)} / ${hex(0x003015)}; non-zero -> CALL ${hex(0x04908C)}.`);
  }
  if (rowSet.has(0x0495F9)) {
    console.log(`  In the ${hex(0x003014)} / ${hex(0x003015)} path, non-zero D14049 calls ${hex(0x048E44)} before re-enabling FTINTC bit 5.`);
  }
}

function buildRoleAssessment(ramRefs, portRefs, gates) {
  const has55Gate = gates.some((gate) => gate.compareValue === 0x55);
  const hasAA = gates.some((gate) => gate.compareValue === 0xAA);
  const portList = [...portRefs.keys()].filter((port) => port !== 'unknown');
  const touchesE000 = portList.some((port) => port >= 0xE00000 && port <= 0xE0FFFF);
  const d177Only = [...ramRefs.keys()].filter((addr) => addr >= 0xD17700 && addr <= 0xD177FF);

  if (has55Gate && !hasAA && !touchesE000) {
    return [
      'This is not a direct display-refresh blitter.',
      'It is a mode-gated interrupt-source service helper: it masks FTINTC bit 5 at port 0x5005, requires D177B7 == 0x55 to continue, samples link/USB-style status ports 0x3084/0x3085 or 0x3014/0x3015, then dispatches to status handlers and the downstream display-update dispatcher 0x04929D.',
      'Non-0x55 values do not select alternate D177B7 states here; they jump straight to RET.',
      `Observed D177xx coverage in this helper: ${d177Only.map((addr) => hex(addr)).join(', ') || 'none'}.`,
    ].join(' ');
  }

  return 'The helper behaves as a port-driven event router rather than a standalone state-machine updater: the D177B7 read only gates entry into the port-sampling and downstream handler path.';
}

function main() {
  const state = walkFunction();
  const ramRefs = collectAbsoluteRamRefs(state.rows);
  const portRefs = collectPortRefs(state.rows);
  const gates = analyzeD177B7Gate(state.rows);

  console.log('Phase 459 - Trace 0x049526 Mode-Gated Helper');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Entry: ${hex(ENTRY)}`);
  console.log(`Decode window: ${hex(ENTRY)}-${hex(WINDOW_END - 1)} (${hex(WINDOW_BYTES)} max bytes)`);
  console.log(`Instruction cap: ${INSTRUCTION_LIMIT}`);
  console.log('');

  console.log('=== Reachable Function Body ===');
  state.rows.forEach((row, index) => {
    const counter = String(index + 1).padStart(3, '0');
    console.log(`[${counter}] ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${annotationText(state.rows, index, ramRefs, portRefs)}`);
  });

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Reachable instructions: ${state.rows.length}`);
  console.log(`  Reachable span: ${hex(state.minPc)}-${hex(state.maxPc)} (${hex(state.maxPc - state.minPc + 1)} bytes)`);
  console.log(`  External transfers: ${state.externalTransfers.length}`);
  console.log('');

  printD177GateSummary(gates);
  console.log('');
  printConditionalPathSummary(state.rows);
  console.log('');
  printTransferSummary('CALL / RST targets', state.callTargets);
  console.log('');
  printTransferSummary('JP / JR targets', state.jumpTargets);
  console.log('');
  printRequestedRamSummary(ramRefs);
  console.log('');
  printD177xxSummary(ramRefs);
  console.log('');
  printOtherRamSummary(ramRefs);
  console.log('');
  printPortSummary(portRefs);
  console.log('');
  console.log('Role assessment');
  console.log(`  ${buildRoleAssessment(ramRefs, portRefs, gates)}`);
}

main();

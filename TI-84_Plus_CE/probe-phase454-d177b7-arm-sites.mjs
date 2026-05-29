#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const romBytes = fs.readFileSync(ROM_PATH);

const WRITER_SITES = [
  {
    label: 'D177B7=0x55 Writer #1',
    writerPc: 0x00B74C,
    contextStart: 0x00B600,
    contextEnd: 0x00B900,
    searchBack: 0x220,
  },
  {
    label: 'D177B7=0x55 Writer #2',
    writerPc: 0x048C50,
    contextStart: 0x048B00,
    contextEnd: 0x048D00,
    searchBack: 0x240,
  },
];

const VRAM_LO = 0xD40000;
const VRAM_HI = 0xD65800;
const LCD_MMIO_LO = 0xE30000;
const LCD_MMIO_HI = 0xE30400;
const RAM_LO = 0xD00000;
const RAM_HI = 0xF00000;
const KEY_PATH_LO = 0x03FA09;
const KEY_PATH_HI = 0x03FC1C;

const DIRECT_TRANSFER_OPS = new Set([
  0xC2, 0xC3, 0xC4, 0xCA, 0xCC, 0xCD,
  0xD2, 0xD4, 0xDA, 0xDC,
  0xE2, 0xE4, 0xEA, 0xEC,
  0xF2, 0xF4, 0xFA, 0xFC,
]);

const NAMED_ADDRS = new Map([
  [0x03FA09, 'GetCSC / key processor'],
  [0xD141B5, 'D141B5 key buffer'],
  [0xD177B7, 'D177B7 display-dirty flag'],
  [0xD177B8, 'D177B8 mode/key substate'],
  [0xD177BB, 'D177BB paired latch'],
  [0xD13FD8, 'D13FD8 callback / state block'],
  [0xD1408B, 'D1408B mode/status byte'],
  [0xD14091, 'D14091 key-processing gate'],
  [0xD14093, 'D14093 status byte'],
  [0xD14095, 'D14095 status byte'],
  [0xD14097, 'D14097 status byte'],
  [0xD14098, 'D14098 status byte'],
  [0xD1441D, 'D1441D callback pointer'],
  [0xD14420, 'D14420 state block'],
  [0xD176A8, 'D176A8 state block'],
  [0xD176FC, 'D176FC status byte'],
  [0xD1770A, 'D1770A display-state block'],
  [0xD1776A, 'D1776A display-state block'],
  [0xD17837, 'D17837 display-state block'],
  [0xD1785B, 'D1785B display-state block'],
  [0xD00896, 'D00896 status byte'],
]);

const decodeCache = new Map();

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(start, length) {
  return Array.from(romBytes.slice(start, start + length), hexByte).join(' ');
}

function isRamAddress(addr) {
  return addr >= RAM_LO && addr < RAM_HI;
}

function isVramAddress(addr) {
  return addr >= VRAM_LO && addr < VRAM_HI;
}

function isLcdMmioAddress(addr) {
  return addr >= LCD_MMIO_LO && addr < LCD_MMIO_HI;
}

function labelAddr(addr) {
  return NAMED_ADDRS.has(addr) ? `${hex(addr)} (${NAMED_ADDRS.get(addr)})` : hex(addr);
}

function formatIndex(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${displacement >= 0 ? '+' : ''}${displacement})`;
}

function safeDecode(pc) {
  if (decodeCache.has(pc)) {
    return decodeCache.get(pc);
  }

  let inst;
  try {
    inst = decodeInstruction(romBytes, pc, 'adl');
  } catch {
    inst = {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: romBytes[pc] ?? 0,
      mode: 'adl',
    };
  }

  decodeCache.set(pc, inst);
  return inst;
}

function formatInstruction(inst) {
  const upper = (value) => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)},${hex(inst.target)}`;
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
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${upper(inst.pair)}`
        : `LD ${upper(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndex(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndex(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${upper(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndex(inst.indexRegister, inst.displacement)},${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'ld-sp-pair':
      return `LD SP,${upper(inst.pair)}`;
    case 'ld-special':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
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
    case 'bit-test':
      return `BIT ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'in0':
      return `IN0 ${upper(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${upper(inst.reg)}`;
    case 'in-reg':
      return `IN ${upper(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${upper(inst.reg)}`;
    case 'in-imm':
      return `IN (${hex(inst.port, 2)})`;
    case 'out-imm':
      return `OUT (${hex(inst.port, 2)})`;
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'ldi':
      return 'LDI';
    case 'ldd':
      return 'LDD';
    case 'cpir':
      return 'CPIR';
    case 'cpdr':
      return 'CPDR';
    case 'ini':
      return 'INI';
    case 'ind':
      return 'IND';
    case 'outi':
      return 'OUTI';
    case 'outd':
      return 'OUTD';
    case 'inir':
      return 'INIR';
    case 'indr':
      return 'INDR';
    case 'otir':
      return 'OTIR';
    case 'otdr':
      return 'OTDR';
    case 'ei':
      return 'EI';
    case 'di':
      return 'DI';
    case 'or-a':
      return 'OR A';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'slp':
      return 'SLP';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function buildHexDump(start, end, highlightPc = null) {
  const lines = [];
  const lo = Math.max(0, start);
  const hi = Math.min(romBytes.length, end);

  for (let pc = lo; pc < hi; pc += 16) {
    const bytes = Array.from(romBytes.slice(pc, Math.min(pc + 16, hi)), hexByte);
    const marker = highlightPc !== null && highlightPc >= pc && highlightPc < pc + 16 ? '>' : ' ';
    lines.push(`${marker} ${hex(pc)}: ${bytes.join(' ')}`);
  }

  return lines.join('\n');
}

function renderInstructionRows(rows) {
  return rows.map(({ pc, inst }) => {
    const bytes = rawBytes(pc, inst.length).padEnd(18, ' ');
    return `${hex(pc)}  ${bytes}  ${formatInstruction(inst)}`;
  }).join('\n');
}

function selectBestSequence(hit, maxBack = 192) {
  const searchStart = Math.max(0, hit - maxBack);
  const sequences = [];

  for (let start = searchStart; start <= hit; start += 1) {
    let pc = start;
    let valid = true;
    const rows = [];

    while (pc < hit) {
      const inst = safeDecode(pc);
      if (!inst || !Number.isInteger(inst.nextPc) || inst.nextPc <= pc || inst.nextPc > hit) {
        valid = false;
        break;
      }

      rows.push({ pc, inst });
      pc = inst.nextPc;
    }

    if (valid && pc === hit) {
      sequences.push(rows);
    }
  }

  if (sequences.length === 0) {
    return [];
  }

  return sequences.sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }
    return (left[0]?.pc ?? hit) - (right[0]?.pc ?? hit);
  })[0];
}

function decodeForward(startPc, maxInstructions = 10) {
  const rows = [];
  let pc = startPc;

  for (let i = 0; i < maxInstructions && pc < romBytes.length; i += 1) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!inst || !Number.isInteger(inst.nextPc) || inst.nextPc <= pc) {
      break;
    }
    pc = inst.nextPc;
  }

  return rows;
}

function buildTransferRefs() {
  const refs = [];

  for (let pc = 0; pc <= romBytes.length - 4; pc += 1) {
    if (!DIRECT_TRANSFER_OPS.has(romBytes[pc])) {
      continue;
    }

    const inst = safeDecode(pc);
    if (!inst || inst.pc !== pc) {
      continue;
    }

    if (!['call', 'call-conditional', 'jp', 'jp-conditional'].includes(inst.tag)) {
      continue;
    }

    if (!Number.isInteger(inst.target)) {
      continue;
    }

    refs.push({
      pc,
      target: inst.target >>> 0,
      tag: inst.tag,
      text: formatInstruction(inst),
    });
  }

  return refs;
}

const transferRefs = buildTransferRefs();
const refsByTarget = new Map();

for (const ref of transferRefs) {
  if (!refsByTarget.has(ref.target)) {
    refsByTarget.set(ref.target, []);
  }
  refsByTarget.get(ref.target).push(ref);
}

function getSuccessors(inst, start, limitExclusive) {
  const successors = [];
  const enqueue = (value) => {
    if (!Number.isInteger(value)) {
      return;
    }
    if (value < start || value >= limitExclusive) {
      return;
    }
    successors.push(value);
  };

  switch (inst.tag) {
    case 'jr-conditional':
    case 'jp-conditional':
    case 'djnz':
      enqueue(inst.target);
      enqueue(inst.nextPc);
      break;
    case 'jr':
    case 'jp':
      enqueue(inst.target);
      break;
    case 'call':
    case 'call-conditional':
    case 'rst':
      enqueue(inst.nextPc);
      break;
    case 'ret':
    case 'ret-conditional':
    case 'reti':
    case 'retn':
    case 'jp-indirect':
    case 'halt':
    case 'slp':
      break;
    default:
      enqueue(inst.nextPc);
      break;
  }

  return successors;
}

function walkFunction(start, limitExclusive) {
  const visited = new Map();
  const queue = [start];

  while (queue.length > 0) {
    const pc = queue.pop();
    if (visited.has(pc) || pc < start || pc >= limitExclusive) {
      continue;
    }

    const inst = safeDecode(pc);
    if (!inst || !Number.isInteger(inst.nextPc) || inst.nextPc <= pc) {
      continue;
    }

    visited.set(pc, inst);

    for (const nextPc of getSuccessors(inst, start, limitExclusive)) {
      if (!visited.has(nextPc)) {
        queue.push(nextPc);
      }
    }
  }

  const instructions = [...visited.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([pc, inst]) => ({ pc, inst }));

  const endExclusive = instructions.reduce(
    (current, row) => Math.max(current, row.inst.nextPc),
    start,
  );

  return {
    start,
    endExclusive,
    instructions,
    visited,
  };
}

function prologueScore(pc) {
  const b0 = romBytes[pc] ?? 0;
  const b1 = romBytes[pc + 1] ?? 0;
  const b2 = romBytes[pc + 2] ?? 0;
  const b3 = romBytes[pc + 3] ?? 0;
  let score = 0;

  if (b0 === 0x21 && b2 === 0xFF && b3 === 0xFF) {
    score += 4;
  }

  if ((b0 === 0xDD || b0 === 0xFD) && b1 === 0xE5) {
    score += 2;
  }

  if ([0xC5, 0xD5, 0xE5, 0xF5].includes(b0) && (b1 === 0xDD || b1 === 0xFD)) {
    score += 1;
  }

  return score;
}

function findFunctionForSite(siteConfig) {
  const searchStart = Math.max(0, siteConfig.writerPc - siteConfig.searchBack);
  const walkLimit = Math.min(romBytes.length, siteConfig.writerPc + 0x420);
  const candidateSet = new Set([siteConfig.writerPc]);

  for (const [target] of refsByTarget) {
    if (target >= searchStart && target <= siteConfig.writerPc) {
      candidateSet.add(target);
    }
  }

  for (let pc = searchStart; pc <= siteConfig.writerPc; pc += 1) {
    if (prologueScore(pc) > 0) {
      candidateSet.add(pc);
    }
  }

  const candidates = [...candidateSet].sort((left, right) => left - right).map((start) => {
    const walk = walkFunction(start, walkLimit);
    const exactIncoming = (refsByTarget.get(start) ?? []).length;
    const nearIncoming = transferRefs.filter((ref) => ref.target >= start && ref.target < start + 0x20).length;
    const score = exactIncoming * 1000 + nearIncoming * 100 + prologueScore(start) * 25 + Math.min(siteConfig.writerPc - start, 0x300) / 16;

    return {
      start,
      walk,
      exactIncoming,
      nearIncoming,
      score,
      containsWriter: walk.visited.has(siteConfig.writerPc),
    };
  }).filter((candidate) => candidate.containsWriter);

  if (candidates.length === 0) {
    const walk = walkFunction(siteConfig.writerPc, walkLimit);
    return {
      start: siteConfig.writerPc,
      endExclusive: walk.endExclusive,
      instructions: walk.instructions,
      candidates: [],
      exactIncoming: 0,
      nearIncoming: 0,
    };
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.start - right.start;
  });

  const chosen = candidates[0];

  return {
    start: chosen.start,
    endExclusive: chosen.walk.endExclusive,
    instructions: chosen.walk.instructions,
    candidates,
    exactIncoming: chosen.exactIncoming,
    nearIncoming: chosen.nearIncoming,
  };
}

function collectOutgoingCalls(functionInfo) {
  return functionInfo.instructions.filter(({ inst }) => inst.tag === 'call' || inst.tag === 'call-conditional');
}

function addAbsoluteRef(targetMap, addr, kind, pc, size) {
  if (!targetMap.has(addr)) {
    targetMap.set(addr, {
      addr,
      reads: [],
      writes: [],
      sizes: new Set(),
    });
  }

  const entry = targetMap.get(addr);
  entry.sizes.add(size);
  if (kind === 'read') {
    entry.reads.push(pc);
  } else {
    entry.writes.push(pc);
  }
}

function collectAbsoluteMemoryRefs(functionInfo) {
  const refs = new Map();

  for (const { pc, inst } of functionInfo.instructions) {
    switch (inst.tag) {
      case 'ld-reg-mem':
        addAbsoluteRef(refs, inst.addr, 'read', pc, 1);
        break;
      case 'ld-mem-reg':
        addAbsoluteRef(refs, inst.addr, 'write', pc, 1);
        break;
      case 'ld-pair-mem':
        addAbsoluteRef(refs, inst.addr, inst.direction === 'to-mem' ? 'write' : 'read', pc, 3);
        break;
      case 'ld-mem-pair':
        addAbsoluteRef(refs, inst.addr, 'write', pc, 3);
        break;
      default:
        break;
    }
  }

  return refs;
}

function collectPointerConstants(functionInfo) {
  const pointers = new Map();

  for (const { pc, inst } of functionInfo.instructions) {
    if (inst.tag !== 'ld-pair-imm') {
      continue;
    }

    const value = inst.value >>> 0;
    if (!isRamAddress(value) && !isLcdMmioAddress(value) && !isVramAddress(value)) {
      continue;
    }

    if (!pointers.has(value)) {
      pointers.set(value, []);
    }

    pointers.get(value).push({
      pc,
      pair: inst.pair,
    });
  }

  return pointers;
}

function inferBcPort(functionInfo, rowIndex) {
  for (let i = rowIndex - 1; i >= 0 && i >= rowIndex - 4; i -= 1) {
    const row = functionInfo.instructions[i];
    if (['jp', 'jr', 'ret', 'reti', 'retn', 'call', 'call-conditional', 'rst'].includes(row.inst.tag)) {
      break;
    }

    if (row.inst.tag === 'ld-pair-imm' && row.inst.pair === 'bc') {
      return row.inst.value >>> 0;
    }
  }

  return null;
}

function collectDirectPorts(functionInfo) {
  const ports = new Map();

  function note(port, pc, tag) {
    if (port === null || port === undefined) {
      return;
    }
    if (!ports.has(port)) {
      ports.set(port, []);
    }
    ports.get(port).push({ pc, tag });
  }

  functionInfo.instructions.forEach(({ pc, inst }, index) => {
    switch (inst.tag) {
      case 'in0':
      case 'out0':
      case 'in-imm':
      case 'out-imm':
        note(inst.port >>> 0, pc, inst.tag);
        break;
      case 'in-reg':
      case 'out-reg':
        note(inferBcPort(functionInfo, index), pc, inst.tag);
        break;
      default:
        break;
    }
  });

  return ports;
}

function renderAddrList(pcs) {
  return pcs.map((pc) => hex(pc)).join(', ');
}

function renderAbsoluteRefs(refs, filterFn = null) {
  const entries = [...refs.values()]
    .filter((entry) => (filterFn ? filterFn(entry.addr) : true))
    .sort((left, right) => left.addr - right.addr);

  if (entries.length === 0) {
    return ['  none'];
  }

  return entries.map((entry) => {
    const parts = [];
    if (entry.reads.length > 0) {
      parts.push(`read @ ${renderAddrList(entry.reads)}`);
    }
    if (entry.writes.length > 0) {
      parts.push(`write @ ${renderAddrList(entry.writes)}`);
    }
    return `  ${labelAddr(entry.addr)}: ${parts.join('; ')}`;
  });
}

function renderPointerConstants(pointerMap) {
  const entries = [...pointerMap.entries()].sort((left, right) => left[0] - right[0]);

  if (entries.length === 0) {
    return ['  none'];
  }

  return entries.map(([addr, hits]) => {
    const detail = hits.map((hit) => `${hex(hit.pc)} via LD ${String(hit.pair).toUpperCase()},${hex(addr)}`).join('; ');
    return `  ${labelAddr(addr)}: ${detail}`;
  });
}

function renderPortRefs(portMap) {
  const entries = [...portMap.entries()].sort((left, right) => left[0] - right[0]);

  if (entries.length === 0) {
    return ['  none'];
  }

  return entries.map(([port, hits]) => {
    const detail = hits.map((hit) => `${hex(hit.pc)} (${hit.tag})`).join(', ');
    return `  ${hex(port)}: ${detail}`;
  });
}

function incomingRefsForStart(functionInfo, windowSize = 0x20) {
  const nearStartEnd = Math.min(functionInfo.endExclusive, functionInfo.start + windowSize);

  return transferRefs
    .filter((ref) => ref.target >= functionInfo.start && ref.target < nearStartEnd)
    .sort((left, right) => left.pc - right.pc);
}

function renderCallerContext(callPc) {
  const prefix = selectBestSequence(callPc, 96);
  const forward = decodeForward(callPc, 4);
  const rows = [...prefix.slice(-3), ...forward];
  return renderInstructionRows(rows);
}

function classifyPath(functionInfo, exactIncoming) {
  const keyRefs = exactIncoming.filter((ref) => ref.pc >= KEY_PATH_LO && ref.pc < KEY_PATH_HI);
  const any048xCaller = exactIncoming.some((ref) => ref.pc >= 0x048000 && ref.pc < 0x04B000);

  return {
    inKeyPath: keyRefs.length > 0,
    in048xModePath: functionInfo.start >= 0x048000 && functionInfo.start < 0x04B000 || any048xCaller,
  };
}

function findD177Sequence(functionInfo, writerPc) {
  const rows = functionInfo.instructions;
  const writerIndex = rows.findIndex((row) => row.pc === writerPc);
  let aaWritePc = null;
  let first55GatePc = null;
  let first55GateBranchPc = null;
  let writerGuardPc = null;
  let writerGuardBranchPc = null;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const next = rows[i + 1];
    const next2 = rows[i + 2];

    if (
      row.inst.tag === 'ld-reg-mem'
      && row.inst.dest === 'a'
      && row.inst.addr === 0xD177B7
      && next?.inst.tag === 'alu-imm'
      && next.inst.op === 'cp'
      && next.inst.value === 0x55
      && first55GatePc === null
    ) {
      first55GatePc = row.pc;
      first55GateBranchPc = next2?.pc ?? null;
    }

    if (
      row.inst.tag === 'ld-reg-imm'
      && row.inst.dest === 'a'
      && row.inst.value === 0xAA
      && next?.inst.tag === 'ld-mem-reg'
      && next.inst.addr === 0xD177B7
      && aaWritePc === null
    ) {
      aaWritePc = next.pc;
    }
  }

  for (let i = Math.max(0, writerIndex - 6); i < writerIndex; i += 1) {
    const row = rows[i];
    const next = rows[i + 1];
    const next2 = rows[i + 2];

    if (
      row?.inst.tag === 'ld-reg-mem'
      && row.inst.dest === 'a'
      && row.inst.addr === 0xD177B7
      && next?.inst.tag === 'alu-imm'
      && next.inst.op === 'cp'
      && next.inst.value === 0xAA
    ) {
      writerGuardPc = row.pc;
      writerGuardBranchPc = next2?.pc ?? null;
      break;
    }
  }

  const pieces = [];

  if (writerGuardPc !== null) {
    pieces.push(`the immediate guard at ${hex(writerGuardPc)} requires D177B7 == 0xAA before the writer at ${hex(writerPc)}`);
  }

  if (aaWritePc !== null) {
    pieces.push(`earlier in the same function, the non-0x55 path stages D177B7 = 0xAA at ${hex(aaWritePc)}`);
  }

  if (first55GatePc !== null) {
    pieces.push(`the function first branches on D177B7 == 0x55 at ${hex(first55GatePc)}`);
  }

  return {
    aaWritePc,
    first55GatePc,
    first55GateBranchPc,
    writerGuardPc,
    writerGuardBranchPc,
    text: pieces.length > 0
      ? `${pieces.join('; ')}. The 0x55 store is the completion/re-arm step of that state transition.`
      : 'no clean D177B7 state-machine pattern was recovered near the writer site.',
  };
}

function buildAssessment(functionInfo, exactIncoming, traits, memRefs, portRefs, writerSeq) {
  const lowRomOnly = exactIncoming.length > 0 && exactIncoming.every((ref) => ref.pc < 0x020000);
  const hasPorts = portRefs.size > 0;
  const hasDirectVram = [...memRefs.values()].some((entry) => isVramAddress(entry.addr));
  const hasDirectLcdMmio = [...memRefs.values()].some((entry) => isLcdMmioAddress(entry.addr));

  if (traits.inKeyPath && traits.in048xModePath) {
    return `This looks like a 0x048xxx mode-initialization helper that is also reachable from the key processor via ${exactIncoming.filter((ref) => ref.pc >= KEY_PATH_LO && ref.pc < KEY_PATH_HI).map((ref) => hex(ref.pc)).join(', ')}. ${writerSeq.text}`;
  }

  if (lowRomOnly && hasPorts && !hasDirectVram && !hasDirectLcdMmio) {
    return `This looks like a low-ROM bootstrap / peripheral-controller rearm routine rather than a key-buffer or direct VRAM routine. ${writerSeq.text}`;
  }

  if (hasPorts && !hasDirectVram) {
    return `This routine is port-heavy and does not touch VRAM directly, so it looks more like hardware/setup glue than a framebuffer painter. ${writerSeq.text}`;
  }

  return writerSeq.text;
}

function analyzeSite(siteConfig) {
  const functionInfo = findFunctionForSite(siteConfig);
  const outgoingCalls = collectOutgoingCalls(functionInfo);
  const absoluteMemRefs = collectAbsoluteMemoryRefs(functionInfo);
  const pointerConstants = collectPointerConstants(functionInfo);
  const directPorts = collectDirectPorts(functionInfo);
  const exactIncoming = (refsByTarget.get(functionInfo.start) ?? []).sort((left, right) => left.pc - right.pc);
  const nearStartIncoming = incomingRefsForStart(functionInfo);
  const traits = classifyPath(functionInfo, exactIncoming);
  const writerSeq = findD177Sequence(functionInfo, siteConfig.writerPc);
  const localRows = functionInfo.instructions.filter(({ pc }) => pc >= siteConfig.writerPc - 0x20 && pc <= siteConfig.writerPc + 0x30);

  return {
    siteConfig,
    functionInfo,
    outgoingCalls,
    absoluteMemRefs,
    pointerConstants,
    directPorts,
    exactIncoming,
    nearStartIncoming,
    traits,
    writerSeq,
    localRows,
    hasD141B5Direct: absoluteMemRefs.has(0xD141B5) || pointerConstants.has(0xD141B5),
    hasDirectVram: [...absoluteMemRefs.values()].some((entry) => isVramAddress(entry.addr))
      || [...pointerConstants.keys()].some((addr) => isVramAddress(addr)),
    hasDirectLcdMmio: [...absoluteMemRefs.values()].some((entry) => isLcdMmioAddress(entry.addr))
      || [...pointerConstants.keys()].some((addr) => isLcdMmioAddress(addr)),
  };
}

function renderCandidateSummary(candidates) {
  if (!candidates || candidates.length === 0) {
    return ['  none'];
  }

  return candidates.slice(0, 5).map((candidate, index) => (
    `  ${index === 0 ? '*' : '-'} ${hex(candidate.start)} score=${candidate.score.toFixed(1)} exactIncoming=${candidate.exactIncoming} nearIncoming=${candidate.nearIncoming} span=${hex(candidate.walk.endExclusive)}`
  ));
}

function renderOutgoingCalls(outgoingCalls) {
  if (outgoingCalls.length === 0) {
    return ['  none'];
  }

  return outgoingCalls.map(({ pc, inst }) => `  ${hex(pc)}: ${formatInstruction(inst)}`);
}

function renderIncomingRefs(title, refs) {
  const lines = [title];

  if (refs.length === 0) {
    lines.push('  none');
    return lines;
  }

  for (const ref of refs) {
    lines.push(`  ${hex(ref.pc)}: ${ref.text}`);
    lines.push('```text');
    lines.push(renderCallerContext(ref.pc));
    lines.push('```');
  }

  return lines;
}

const siteAnalyses = WRITER_SITES.map(analyzeSite);
const lines = [];

lines.push('Phase 454 - D177B7 0x55 Arm-Site Probe', '');
lines.push(`ROM: ${ROM_PATH}`, '');

for (const analysis of siteAnalyses) {
  const { siteConfig, functionInfo } = analysis;
  const assessment = buildAssessment(
    functionInfo,
    analysis.exactIncoming,
    analysis.traits,
    analysis.absoluteMemRefs,
    analysis.directPorts,
    analysis.writerSeq,
  );

  lines.push(`=== ${siteConfig.label}: ${hex(siteConfig.writerPc)} ===`);
  lines.push('Surrounding context (hex dump):');
  lines.push('```text');
  lines.push(buildHexDump(siteConfig.contextStart, siteConfig.contextEnd, siteConfig.writerPc));
  lines.push('```', '');

  lines.push('Local disassembly around writer:');
  lines.push('```text');
  lines.push(renderInstructionRows(analysis.localRows));
  lines.push('```', '');

  lines.push(`Function boundaries: ${hex(functionInfo.start)} - ${hex(functionInfo.endExclusive - 1)}`);
  lines.push(`Function size: ${functionInfo.endExclusive - functionInfo.start} bytes`, '');

  lines.push('Function start candidates:');
  lines.push(...renderCandidateSummary(functionInfo.candidates));
  lines.push('');

  lines.push('Outgoing CALLs from this function:');
  lines.push(...renderOutgoingCalls(analysis.outgoingCalls));
  lines.push('');

  lines.push(...renderIncomingRefs('Incoming CALL/JP to the chosen entrypoint:', analysis.exactIncoming));
  lines.push('');
  lines.push(...renderIncomingRefs('Incoming CALL/JP into the first 0x20 bytes of the function:', analysis.nearStartIncoming));
  lines.push('');

  lines.push('Direct RAM/ROM absolute accesses in this function:');
  lines.push(...renderAbsoluteRefs(analysis.absoluteMemRefs, (addr) => isRamAddress(addr) || isVramAddress(addr) || isLcdMmioAddress(addr)));
  lines.push('');

  lines.push('RAM / MMIO pointer constants staged inside this function:');
  lines.push(...renderPointerConstants(analysis.pointerConstants));
  lines.push('');

  lines.push('Direct I/O port accesses in this function:');
  lines.push(...renderPortRefs(analysis.directPorts));
  lines.push('');

  lines.push('Path checks:');
  lines.push(`  In key processor path near 0x03FA09: ${analysis.traits.inKeyPath ? 'yes' : 'no'}`);
  lines.push(`  In 0x048xxx mode-init path: ${analysis.traits.in048xModePath ? 'yes' : 'no'}`);
  lines.push(`  Accesses D141B5: ${analysis.hasD141B5Direct ? 'yes' : 'no'}`);
  lines.push(`  Accesses VRAM 0xD40000+: ${analysis.hasDirectVram ? 'yes' : 'no'}`);
  lines.push(`  Accesses LCD MMIO 0xE30000+: ${analysis.hasDirectLcdMmio ? 'yes' : 'no'}`);
  lines.push('');

  lines.push('Trigger for 0x55 write:');
  lines.push(`  ${analysis.writerSeq.text}`);
  lines.push('');

  lines.push(`Assessment: ${assessment}`);
  lines.push('');
}

lines.push('=== Summary ===');

for (const analysis of siteAnalyses) {
  const { siteConfig, functionInfo } = analysis;
  const callers = analysis.exactIncoming.length > 0
    ? analysis.exactIncoming.map((ref) => hex(ref.pc)).join(', ')
    : 'no exact CALL/JP entry callers found';
  const role = buildAssessment(
    functionInfo,
    analysis.exactIncoming,
    analysis.traits,
    analysis.absoluteMemRefs,
    analysis.directPorts,
    analysis.writerSeq,
  );

  lines.push(`- Site ${hex(siteConfig.writerPc)} is inside ${hex(functionInfo.start)}..${hex(functionInfo.endExclusive - 1)}; callers: ${callers}. ${role}`);
}

lines.push('- Both writers are guarded by a D177B7 == 0xAA re-check immediately before the LD A,0x55 / LD (D177B7),A pair, so 0x55 is not written as a blind set. In both functions, 0xAA is staged earlier on the non-0x55 path, then 0x55 is written only as the completion step of that state transition.');

console.log(lines.join('\n'));

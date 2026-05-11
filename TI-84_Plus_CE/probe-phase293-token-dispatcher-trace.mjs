#!/usr/bin/env node

import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const PHASE292_PATH = path.join(__dirname, 'probe-phase292-key-dispatch-cp-values.mjs');
const rom = readFileSync(ROM_PATH);
const phase292SourceText = readFileSync(PHASE292_PATH, 'utf8');

const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
const D00595 = 0xD00595;
const D00596 = 0xD00596;
const D006C0 = 0xD006C0;
const D007E0 = 0xD007E0;
const D00824 = 0xD00824;
const D02437 = 0xD02437;
const D0243A = 0xD0243A;
const D0243D = 0xD0243D;
const D02440 = 0xD02440;

const DISPATCHER_088657 = 0x088657;
const DISPATCHER_08C4E9 = 0x08C4E9;

const ADDR_NAMES = new Map([
  [D0058C, 'D0058C kbdKey'],
  [D0058E, 'D0058E keyExtend'],
  [D00595, 'D00595 cursor byte'],
  [D00596, 'D00596 cursor byte'],
  [D006C0, 'D006C0 textShadow'],
  [D007E0, 'D007E0 context mode'],
  [D00824, 'D00824 mode byte'],
  [D02437, 'D02437 editTop'],
  [D0243A, 'D0243A editCursor'],
  [D0243D, 'D0243D editTail'],
  [D02440, 'D02440 editBtm'],
]);

const TARGET_NAMES = new Map([
  [0x023331, '0x023331 state-byte prep helper'],
  [0x04C973, '0x04C973 CpHLDE compare helper'],
  [0x08C5D1, '0x08C5D1 special-key handler'],
  [0x08C72F, '0x08C72F CoorMon dispatch sub'],
  [0x08C7AD, '0x08C7AD NewContext0'],
  [0x0AF408, '0x0AF408 follow-on token dispatcher'],
  [0x055B8F, '0x055B8F state cleanup helper'],
  [0x06EDAC, '0x06EDAC GrPutAway'],
  [0x08C689, '0x08C689 PPutAway'],
]);

const CASES = [
  {
    dispatcher: DISPATCHER_088657,
    scan: 0xFF,
    cpAddr: 0x088634,
    handlerAddr: 0x088638,
    previewStart: 0x088638,
    actionSummary:
      'Loads A=0xFE, then jumps to 0x08867F for CALL 0x0AF408. Raw 0xFF is normalized into the 0xFE magic-token path.',
  },
  {
    dispatcher: DISPATCHER_088657,
    scan: 0xFE,
    cpAddr: 0x08863C,
    handlerAddr: 0x08867F,
    previewStart: 0x08867F,
    actionSummary:
      'Direct CALL 0x0AF408 with A still 0xFE, then RET. This is the straight-through magic-token dispatch.',
  },
  {
    dispatcher: DISPATCHER_088657,
    scan: 0xFC,
    cpAddr: 0x088640,
    handlerAddr: 0x08867F,
    previewStart: 0x08867F,
    actionSummary:
      'Direct CALL 0x0AF408 with A still 0xFC, then RET. No RAM write before the follow-on dispatcher.',
  },
  {
    dispatcher: DISPATCHER_088657,
    scan: 0xFB,
    cpAddr: 0x088644,
    handlerAddr: 0x08864F,
    previewStart: 0x08864F,
    actionSummary:
      'Reads D0058E, restores A=0xFB from C, and only jumps to 0x08867F if keyExtend is nonzero. Otherwise it falls back into the raw-scan dispatcher at 0x088657.',
  },
  {
    dispatcher: DISPATCHER_088657,
    scan: 0xFA,
    cpAddr: 0x08864B,
    handlerAddr: 0x08864F,
    previewStart: 0x08864F,
    actionSummary:
      'Shares the same D0058E gate as 0xFB, but with C/A restored to 0xFA. Extended-key state decides whether the case escalates or falls back.',
  },
  {
    dispatcher: DISPATCHER_088657,
    scan: 0xEF,
    cpAddr: 0x08865B,
    handlerAddr: 0x08865F,
    previewStart: 0x08865F,
    actionSummary:
      'Loads A=0xA6, writes that byte to D0058E, forces A=0xFE, then CALLs 0x0AF408. This re-encodes raw 0xEF as keyExtend=0xA6 plus FE dispatch.',
  },
  {
    dispatcher: DISPATCHER_088657,
    scan: 0x69,
    cpAddr: 0x088663,
    handlerAddr: 0x088667,
    previewStart: 0x088667,
    actionSummary:
      'Loads A=0xFC, writes it to D0058E, forces A=0xFE, then CALLs 0x0AF408. This is another scan-code to keyExtend normalization path.',
  },
  {
    dispatcher: DISPATCHER_088657,
    scan: 0xF9,
    cpAddr: 0x08866B,
    handlerAddr: 0x08866F,
    previewStart: 0x08866F,
    actionSummary:
      'Subtracts 0x14 from A, writes the translated byte to D0058E, forces A=0xFE, then CALLs 0x0AF408. For exact 0xF9 the stored extend byte is 0xE5.',
  },
  {
    dispatcher: DISPATCHER_088657,
    scan: 0xF3,
    cpAddr: 0x088673,
    handlerAddr: 0x088677,
    previewStart: 0x088677,
    actionSummary:
      'Subtracts 0x7C from A, writes the translated byte to D0058E, forces A=0xFE, then CALLs 0x0AF408. For exact 0xF3 the stored extend byte is 0x77.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0xC0,
    cpAddr: 0x08C4BA,
    handlerAddr: 0x08C4D9,
    previewStart: 0x08C4D9,
    actionSummary:
      'Enters the IY-bit gate at 0x08C4D9. Depending on IY+9 bit0 and IY+17 bit0, it either loads A=0xFB and jumps into 0x08C5D1 special-key handling or rejoins the normalized D0058E route at 0x08C4E5.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0xBC,
    cpAddr: 0x08C4BE,
    handlerAddr: 0x08C4D9,
    previewStart: 0x08C4D9,
    actionSummary:
      'Exact 0xBC reaches the same IY-bit gate as 0xC0 after the follow-up 0xBD compare. It conditionally routes to 0x08C5D1 or to the common 0x08C509 normalization path with A=0xFB.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0xBD,
    cpAddr: 0x08C4C2,
    handlerAddr: 0x08C4C6,
    previewStart: 0x08C4C6,
    actionSummary:
      'Copies the scan byte into B, checks D007E0, and if the context mode is 0x44 it loads A=0xFB and jumps to 0x08C5D1. Other modes route to 0x08C4E5 and then into the 0x08C509 normalization chain.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0xEF,
    cpAddr: 0x08C4ED,
    handlerAddr: 0x08C4F1,
    previewStart: 0x08C4F1,
    actionSummary:
      'Loads A=0xA6, writes it to D0058E, forces A=0xFE, then enters the common tail at 0x08C530. That tail calls 0x023331 and 0x08C72F before returning to CoorMon.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0xF9,
    cpAddr: 0x08C4F5,
    handlerAddr: 0x08C4F9,
    previewStart: 0x08C4F9,
    actionSummary:
      'Subtracts 0x14 from A, writes the translated byte to D0058E, forces A=0xFE, then runs the common 0x08C530 tail. For exact 0xF9 the stored extend byte is 0xE5.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0xF3,
    cpAddr: 0x08C4FD,
    handlerAddr: 0x08C501,
    previewStart: 0x08C501,
    actionSummary:
      'Subtracts 0x7C from A, writes the translated byte to D0058E, forces A=0xFE, then runs the common 0x08C530 tail. For exact 0xF3 the stored extend byte is 0x77.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0x69,
    cpAddr: 0x08C509,
    handlerAddr: 0x08C50D,
    previewStart: 0x08C50D,
    actionSummary:
      'Loads A=0xFC, writes it to D0058E, forces A=0xFE, then runs the common 0x08C530 tail.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0x5B,
    cpAddr: 0x08C511,
    handlerAddr: 0x08C515,
    previewStart: 0x08C515,
    actionSummary:
      'Loads A=0xFD, writes it to D0058E, forces A=0xFE, then runs the common 0x08C530 tail.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0x28,
    cpAddr: 0x08C519,
    handlerAddr: 0x08C51E,
    previewStart: 0x08C51E,
    actionSummary:
      'Sets bit 7 at IY+22, loads A=0xDA, then runs the common 0x08C530 tail. This is an explicit state-bit arm rather than a D0058E rewrite.',
  },
  {
    dispatcher: DISPATCHER_08C4E9,
    scan: 0x29,
    cpAddr: 0x08C527,
    handlerAddr: 0x08C52C,
    previewStart: 0x08C52C,
    actionSummary:
      'Sets bit 1 at IY+29, loads A=0x7F, then runs the common 0x08C530 tail. Like 0x28, it arms state bits before the CallMain path.',
  },
];

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

function addrName(addr) {
  if (TARGET_NAMES.has(addr)) return `${hex(addr)} [${TARGET_NAMES.get(addr)}]`;
  if (ADDR_NAMES.has(addr)) return `${hex(addr)} [${ADDR_NAMES.get(addr)}]`;
  return hex(addr);
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement < 0 ? '-' : '+';
  return `(${upper(indexRegister)}${sign}${hex(Math.abs(displacement), 2)})`;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'alu-imm':
      return `${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${addrName(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${addrName(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? `LD ${upper(inst.pair)}, (${addrName(inst.addr)})`
        : `LD (${addrName(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(inst.value)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'call':
      return `CALL ${addrName(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${addrName(inst.target)}`;
    case 'jp':
      return `JP ${addrName(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${addrName(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${addrName(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${addrName(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'sbc-pair':
      return `SBC HL, ${upper(inst.src)}`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ex-af':
      return "EX AF, AF'";
    case 'nop':
      return 'NOP';
    default:
      return upper(inst?.tag ?? 'UNKNOWN');
  }
}

function noteForInstruction(inst) {
  const notes = [];
  if (inst?.tag === 'ld-reg-mem' && ADDR_NAMES.has(inst.addr)) notes.push(`reads ${ADDR_NAMES.get(inst.addr)}`);
  if (inst?.tag === 'ld-mem-reg' && ADDR_NAMES.has(inst.addr)) notes.push(`writes ${ADDR_NAMES.get(inst.addr)}`);
  if (inst?.tag === 'ld-pair-mem' && inst.direction === 'to-mem' && ADDR_NAMES.has(inst.addr)) {
    notes.push(`writes ${ADDR_NAMES.get(inst.addr)}`);
  }
  if (inst?.tag === 'call' && TARGET_NAMES.has(inst.target)) notes.push(TARGET_NAMES.get(inst.target));
  if ((inst?.tag === 'jp' || inst?.tag === 'jr') && TARGET_NAMES.has(inst.target)) notes.push(TARGET_NAMES.get(inst.target));
  if ((inst?.tag === 'indexed-cb-set' || inst?.tag === 'indexed-cb-res' || inst?.tag === 'indexed-cb-bit')
      && inst.indexRegister === 'iy') {
    notes.push(`IY+${inst.displacement} bit ${inst.bit}`);
  }
  return notes.join('; ');
}

function walkLinear(start, maxInstructions = 16) {
  const rows = [];
  const visitedJumpTargets = new Set();
  let pc = start;

  while (rows.length < maxInstructions) {
    const inst = decodeInstruction(rom, pc, 'adl');
    rows.push({
      pc,
      length: inst.length,
      bytes: bytesToHex(rom.subarray(pc, pc + inst.length)),
      text: formatInstruction(inst),
      notes: noteForInstruction(inst),
      inst,
    });

    if (['ret', 'ret-conditional', 'reti', 'retn', 'jp-indirect'].includes(inst.tag)) break;

    if ((inst.tag === 'jp' || inst.tag === 'jr') && inst.target !== undefined) {
      if (visitedJumpTargets.has(inst.target)) break;
      visitedJumpTargets.add(inst.target);
      pc = inst.target;
      continue;
    }

    pc += inst.length;
  }

  return rows;
}

function summarizeTrace(rows) {
  const writes = [];
  const calls = [];
  const iyFlags = [];

  for (const row of rows) {
    const inst = row.inst;
    if (inst?.tag === 'ld-mem-reg' && ADDR_NAMES.has(inst.addr)) writes.push(ADDR_NAMES.get(inst.addr));
    if (inst?.tag === 'call') calls.push(addrName(inst.target));
    if ((inst?.tag === 'indexed-cb-set' || inst?.tag === 'indexed-cb-res') && inst.indexRegister === 'iy') {
      iyFlags.push(`${upper(inst.tag.replace('indexed-cb-', ''))} bit ${inst.bit} at IY+${inst.displacement}`);
    }
  }

  const pieces = [];
  if (writes.length) pieces.push(`writes ${[...new Set(writes)].join(', ')}`);
  if (calls.length) pieces.push(`calls ${Array.from(new Set(calls)).join(', ')}`);
  if (iyFlags.length) pieces.push(`touches ${Array.from(new Set(iyFlags)).join(', ')}`);
  return pieces.length ? pieces.join('; ') : 'no named RAM write or named call in preview';
}

function phase292Fallback(dispatcherAddr) {
  const start = Math.max(0, dispatcherAddr - 48);
  const end = Math.min(rom.length, dispatcherAddr + 128);
  const rows = [];

  for (let i = start; i < end - 1; i++) {
    if (rom[i] !== 0xFE) continue;
    const cpValue = rom[i + 1];
    const op = rom[i + 2];
    let branchType = 'NONE';
    let target = null;

    if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
      const cond = { 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' }[op];
      const rel = rom[i + 3] > 127 ? rom[i + 3] - 256 : rom[i + 3];
      branchType = cond;
      target = i + 4 + rel;
    } else if (op === 0xC2 || op === 0xCA || op === 0xD2 || op === 0xDA) {
      const cond = { 0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C' }[op];
      branchType = cond;
      target = rom[i + 3] | (rom[i + 4] << 8) | (rom[i + 5] << 16);
    }

    rows.push({
      cp_addr: hex(i),
      cp_value: hexByte(cpValue),
      branch_type: branchType,
      target: target === null ? null : hex(target),
    });
  }

  return {
    address: hex(dispatcherAddr),
    cp_cascade: rows,
  };
}

function loadPhase292() {
  try {
    const raw = execFileSync(process.execPath, [PHASE292_PATH], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(raw);
    return { source: 'phase292 probe output', dispatchers: parsed.dispatchers ?? [] };
  } catch (error) {
    return {
      source: `phase292 file read ok (${phase292SourceText.length} bytes), child node exec blocked -> fallback local scan (${error?.code ?? 'exec failed'})`,
      dispatchers: [phase292Fallback(DISPATCHER_088657), phase292Fallback(DISPATCHER_08C4E9)],
    };
  }
}

function mapPhase292Rows(dispatchers) {
  const map = new Map();
  for (const dispatcher of dispatchers) {
    const cascade = dispatcher.cp_cascade ?? [];
    for (const row of cascade) {
      map.set(`${dispatcher.address}:${row.cp_addr}`, row);
    }
  }
  return map;
}

function findPhase292Row(dispatcherAddr, cpAddr, rowMap) {
  return rowMap.get(`${hex(dispatcherAddr)}:${hex(cpAddr)}`) ?? null;
}

function formatPhase292Row(row) {
  if (!row) return 'not present in phase292 output';
  if (!row.target) return `${row.branch_type} (no explicit target recorded)`;
  return `${row.branch_type} -> ${row.target}`;
}

function printTrace(caseInfo, phase292Row) {
  const rows = walkLinear(caseInfo.previewStart, 12);
  const phase292Edge = formatPhase292Row(phase292Row);
  console.log(`- scan ${hexByte(caseInfo.scan)} | cp ${hex(caseInfo.cpAddr)} | phase292 edge ${phase292Edge} | actual match path ${hex(caseInfo.handlerAddr)}`);
  for (const row of rows) {
    const note = row.notes ? ` ; ${row.notes}` : '';
    console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${note}`);
  }
  console.log(`    summary: ${caseInfo.actionSummary}`);
  console.log(`    preview flags: ${summarizeTrace(rows)}`);
  console.log('');
}

const phase292 = loadPhase292();
const phase292RowMap = mapPhase292Rows(phase292.dispatchers);

console.log('# Phase 293: Token Dispatcher Deep Trace');
console.log('');
console.log(`Phase 292 source: ${phase292.source}`);
console.log(`ROM: ${path.basename(ROM_PATH)}`);
console.log('');

for (const dispatcherAddr of [DISPATCHER_088657, DISPATCHER_08C4E9]) {
  console.log(`## Dispatcher ${hex(dispatcherAddr)}`);
  console.log('');
  const cases = CASES.filter((entry) => entry.dispatcher === dispatcherAddr);
  for (const caseInfo of cases) {
    const phase292Row = findPhase292Row(caseInfo.dispatcher, caseInfo.cpAddr, phase292RowMap);
    printTrace(caseInfo, phase292Row);
  }
}

console.log('## Summary Table');
console.log('');
console.log('| scan_code_value | dispatcher | phase292_edge | handler_address | action_summary |');
console.log('|---|---|---|---|---|');
for (const caseInfo of CASES) {
  const phase292Row = findPhase292Row(caseInfo.dispatcher, caseInfo.cpAddr, phase292RowMap);
  const phase292Edge = formatPhase292Row(phase292Row).replace(/\|/g, '\\|');
  const action = caseInfo.actionSummary.replace(/\|/g, '\\|');
  console.log(`| ${hexByte(caseInfo.scan)} | ${hex(caseInfo.dispatcher)} | ${phase292Edge} | ${hex(caseInfo.handlerAddr)} | ${action} |`);
}

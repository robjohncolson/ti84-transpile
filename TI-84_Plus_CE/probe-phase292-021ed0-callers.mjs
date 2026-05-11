#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const LABELS_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const rom = fs.readFileSync(ROM_PATH);

const TARGET = 0x021ED0;
const CONTEXT_BYTES = 32;
const ALIGN_LOOKBACK = 96;
const FUNCTION_LOOKBACK = 192;

const CONDITION_NAMES = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

const REFERENCE_PATTERNS = [
  { opcode: 0xCD, mnemonic: 'CALL', kind: 'call' },
  { opcode: 0xC3, mnemonic: 'JP', kind: 'jp' },
  { opcode: 0xC4, mnemonic: 'CALL NZ', kind: 'call-conditional', condition: 'NZ' },
  { opcode: 0xCC, mnemonic: 'CALL Z', kind: 'call-conditional', condition: 'Z' },
  { opcode: 0xD4, mnemonic: 'CALL NC', kind: 'call-conditional', condition: 'NC' },
  { opcode: 0xDC, mnemonic: 'CALL C', kind: 'call-conditional', condition: 'C' },
  { opcode: 0xE4, mnemonic: 'CALL PO', kind: 'call-conditional', condition: 'PO' },
  { opcode: 0xEC, mnemonic: 'CALL PE', kind: 'call-conditional', condition: 'PE' },
  { opcode: 0xF4, mnemonic: 'CALL P', kind: 'call-conditional', condition: 'P' },
  { opcode: 0xFC, mnemonic: 'CALL M', kind: 'call-conditional', condition: 'M' },
  { opcode: 0xC2, mnemonic: 'JP NZ', kind: 'jp-conditional', condition: 'NZ' },
  { opcode: 0xCA, mnemonic: 'JP Z', kind: 'jp-conditional', condition: 'Z' },
  { opcode: 0xD2, mnemonic: 'JP NC', kind: 'jp-conditional', condition: 'NC' },
  { opcode: 0xDA, mnemonic: 'JP C', kind: 'jp-conditional', condition: 'C' },
  { opcode: 0xE2, mnemonic: 'JP PO', kind: 'jp-conditional', condition: 'PO' },
  { opcode: 0xEA, mnemonic: 'JP PE', kind: 'jp-conditional', condition: 'PE' },
  { opcode: 0xF2, mnemonic: 'JP P', kind: 'jp-conditional', condition: 'P' },
  { opcode: 0xFA, mnemonic: 'JP M', kind: 'jp-conditional', condition: 'M' },
];

const labelMap = loadLabelMap();

function loadLabelMap() {
  const map = new Map();

  if (!fs.existsSync(LABELS_PATH)) {
    return map;
  }

  const source = fs.readFileSync(LABELS_PATH, 'utf8');
  const regex = /^\?([^\s]+)\s+:=\s+([0-9A-Fa-f]+)h/gm;

  for (const match of source.matchAll(regex)) {
    const [, name, rawAddress] = match;
    map.set(Number.parseInt(rawAddress, 16), name);
  }

  return map;
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(start, length) {
  const boundedLength = Math.max(0, Math.min(length, rom.length - start));
  return Array.from(rom.subarray(start, start + boundedLength), (value) => hexByte(value)).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function labelFor(address) {
  return labelMap.get(address) ?? null;
}

function describeLocation(address) {
  const label = labelFor(address);
  return label ? `${label} @ ${hex(address)}` : hex(address);
}

function safeDecode(pc) {
  if (pc < 0 || pc >= rom.length) {
    return null;
  }

  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length || inst.length <= 0) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) {
    return 'DB ?';
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set':
    case 'set-bit':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res':
    case 'res-bit':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set-ind':
    case 'set-bit-ind':
      return `${prefix}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind':
    case 'res-bit-ind':
      return `${prefix}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate':
      return `${prefix}${String(inst.operation).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indirectRegister).toUpperCase()})`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'out-imm':
      return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-imm':
      return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'im':
      return `${prefix}IM ${inst.mode ?? inst.value}`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'daa':
      return `${prefix}DAA`;
    case 'neg':
      return `${prefix}NEG`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'ex-sp-hl':
      return `${prefix}EX (SP), HL`;
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates']);
      const extra = Object.entries(inst)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      return `${prefix}${String(inst.tag).toUpperCase()}${extra ? ` ${extra}` : ''}`;
    }
  }
}

function buildRow(pc, inst) {
  if (!inst) {
    return {
      pc,
      bytes: formatBytes(pc, 1),
      asm: `DB ${hexByte(rom[pc])}`,
      inst: null,
    };
  }

  return {
    pc,
    bytes: formatBytes(pc, inst.length),
    asm: formatInstruction(inst),
    inst,
  };
}

function decodeLinear(start, endExclusive) {
  const rows = [];
  let pc = Math.max(0, start);
  const boundedEnd = Math.min(endExclusive, rom.length);

  while (pc < boundedEnd) {
    const inst = safeDecode(pc);
    rows.push(buildRow(pc, inst));
    pc += inst ? inst.length : 1;
  }

  return rows;
}

function findAlignedStarts(anchor, lookback) {
  const lowerBound = Math.max(0, anchor - lookback);
  const starts = [];

  for (let start = lowerBound; start <= anchor; start++) {
    let pc = start;
    let steps = 0;
    let failed = false;

    while (pc < anchor && steps < 256) {
      const inst = safeDecode(pc);
      if (!inst) {
        failed = true;
        break;
      }
      pc += inst.length;
      steps += 1;
    }

    if (!failed && pc === anchor) {
      starts.push(start);
    }
  }

  return starts;
}

function chooseContextStart(anchor, beforeBytes, lookback = ALIGN_LOOKBACK) {
  const alignedStarts = findAlignedStarts(anchor, lookback);
  const lowerBound = Math.max(0, anchor - beforeBytes);

  if (alignedStarts.length === 0) {
    return lowerBound;
  }

  const candidates = alignedStarts.filter((value) => value >= lowerBound);
  return candidates.length > 0 ? candidates[0] : alignedStarts[alignedStarts.length - 1];
}

function buildContextRows(anchor, beforeBytes = CONTEXT_BYTES, afterBytes = CONTEXT_BYTES) {
  const start = chooseContextStart(anchor, beforeBytes);
  return decodeLinear(start, Math.min(rom.length, anchor + afterBytes));
}

function isTerminator(inst) {
  if (!inst) {
    return false;
  }

  if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn' || inst.tag === 'rst') {
    return true;
  }

  if (inst.tag === 'jp' || inst.tag === 'jp-indirect') {
    return true;
  }

  return false;
}

function findContainingFunction(anchor) {
  const start = chooseContextStart(anchor, FUNCTION_LOOKBACK, FUNCTION_LOOKBACK);
  const rows = decodeLinear(start, anchor + 1);

  let entry = rows.length > 0 ? rows[0].pc : anchor;
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].pc >= anchor) {
      break;
    }

    if (isTerminator(rows[index].inst) && rows[index + 1] && rows[index + 1].pc <= anchor) {
      entry = rows[index + 1].pc;
    }
  }

  return {
    start: entry,
    name: labelFor(entry),
  };
}

function formatContext(rows, highlightPc) {
  return rows
    .filter((row) => row.pc >= Math.max(0, highlightPc - CONTEXT_BYTES) && row.pc <= highlightPc + CONTEXT_BYTES)
    .map((row) => {
      const marker = row.pc === highlightPc ? '>>' : '  ';
      const label = labelFor(row.pc);
      const labelSuffix = label ? ` <${label}>` : '';
      return `${marker} ${hex(row.pc)}: ${row.asm.padEnd(36)} [${row.bytes}]${labelSuffix}`;
    })
    .join('\n');
}

function findLastPairSource(rows, endIndex, pair) {
  for (let index = endIndex - 1; index >= 0; index--) {
    const inst = rows[index].inst;
    if (!inst) {
      continue;
    }

    if (inst.tag === 'ld-pair-imm' && inst.pair === pair) {
      return `${rows[index].asm} @ ${hex(rows[index].pc)}`;
    }

    if (inst.tag === 'ld-pair-mem' && inst.pair === pair && inst.direction !== 'to-mem') {
      return `${rows[index].asm} @ ${hex(rows[index].pc)}`;
    }

    if (inst.tag === 'ld-pair-indexed' && inst.pair === pair) {
      return `${rows[index].asm} @ ${hex(rows[index].pc)}`;
    }

    if (inst.tag === 'ld-reg-reg' && inst.dest === pair) {
      return `${rows[index].asm} @ ${hex(rows[index].pc)}`;
    }

    if (inst.tag === 'pop' && inst.pair === pair) {
      return `${rows[index].asm} @ ${hex(rows[index].pc)}`;
    }

    if (isTerminator(inst)) {
      break;
    }
  }

  return null;
}

function analyzeArgumentSetup(rows, anchor) {
  const anchorIndex = rows.findIndex((row) => row.pc === anchor);
  if (anchorIndex < 0) {
    return {
      summary: 'caller context could not be aligned to an instruction boundary',
      inferred_argument_push: null,
      nearby_stack_ops: [],
    };
  }

  const searchStart = Math.max(0, anchorIndex - 12);
  const nearby = rows.slice(searchStart, anchorIndex);
  const stackOps = nearby.filter((row) => row.inst && (row.inst.tag === 'push' || row.inst.tag === 'pop'));
  const pushes = stackOps.filter((row) => row.inst.tag === 'push');

  if (pushes.length === 0) {
    return {
      summary: 'no obvious PUSH immediately before the transfer; the vector may rely on an earlier stack frame or may have no in-ROM callers',
      inferred_argument_push: null,
      nearby_stack_ops: stackOps.map((row) => `${hex(row.pc)}: ${row.asm}`),
    };
  }

  const lastPush = pushes[pushes.length - 1];
  const pair = String(lastPush.inst.pair).toLowerCase();
  const source = findLastPairSource(rows, rows.indexOf(lastPush), pair);

  return {
    summary: `In ADL mode the callee reads its first 24-bit argument from (IX+6); the last PUSH before the transfer is ${lastPush.asm} @ ${hex(lastPush.pc)}${source ? `, sourced from ${source}` : ''}.`,
    inferred_argument_push: {
      address: hex(lastPush.pc),
      instruction: lastPush.asm,
      source,
    },
    nearby_stack_ops: stackOps.map((row) => `${hex(row.pc)}: ${row.asm}`),
  };
}

function scanCallers(targetAddress) {
  const hits = [];

  for (const pattern of REFERENCE_PATTERNS) {
    const bytes = [
      pattern.opcode,
      targetAddress & 0xFF,
      (targetAddress >> 8) & 0xFF,
      (targetAddress >> 16) & 0xFF,
    ];

    for (let pc = 0; pc <= rom.length - bytes.length; pc++) {
      let match = true;
      for (let index = 0; index < bytes.length; index++) {
        if (rom[pc + index] !== bytes[index]) {
          match = false;
          break;
        }
      }

      if (match) {
        hits.push({
          address: pc,
          kind: pattern.kind,
          instruction: `${pattern.mnemonic} ${hex(targetAddress)}`,
          bytes: formatBytes(pc, 4),
        });
      }
    }
  }

  hits.sort((left, right) => left.address - right.address);
  return hits;
}

function scanDataReferences(targetAddress, callers) {
  const dataHits = [];
  const pointerBytes = [
    targetAddress & 0xFF,
    (targetAddress >> 8) & 0xFF,
    (targetAddress >> 16) & 0xFF,
  ];
  const immediateStarts = new Set(callers.map((caller) => caller.address + 1));

  for (let pc = 0; pc <= rom.length - pointerBytes.length; pc++) {
    if (immediateStarts.has(pc)) {
      continue;
    }

    let match = true;
    for (let index = 0; index < pointerBytes.length; index++) {
      if (rom[pc + index] !== pointerBytes[index]) {
        match = false;
        break;
      }
    }

    if (!match) {
      continue;
    }

    const windowStart = Math.max(0, pc - 12);
    const windowLength = Math.min(27, rom.length - windowStart);
    dataHits.push({
      address: hex(pc),
      context: formatBytes(windowStart, windowLength),
    });
  }

  return dataHits;
}

function enrichCaller(caller) {
  const rows = buildContextRows(caller.address, CONTEXT_BYTES, CONTEXT_BYTES);
  const containingFunction = findContainingFunction(caller.address);
  const argSetup = analyzeArgumentSetup(rows, caller.address);

  return {
    address: hex(caller.address),
    instruction: caller.instruction,
    bytes: caller.bytes,
    function: {
      start: hex(containingFunction.start),
      name: containingFunction.name,
      description: describeLocation(containingFunction.start),
    },
    arg_setup: argSetup.summary,
    arg_setup_details: argSetup,
    context: formatContext(rows, caller.address),
  };
}

function detectVectorTable(targetAddress) {
  let start = targetAddress;
  while (start - 4 >= 0) {
    const inst = safeDecode(start - 4);
    if (!inst || inst.tag !== 'jp' || inst.length !== 4) {
      break;
    }
    start -= 4;
  }

  let endExclusive = targetAddress;
  while (endExclusive < rom.length) {
    const inst = safeDecode(endExclusive);
    if (!inst || inst.tag !== 'jp' || inst.length !== 4) {
      break;
    }
    endExclusive += 4;
  }

  const entryCount = Math.floor((endExclusive - start) / 4);
  const slotIndex = Math.floor((targetAddress - start) / 4);

  const nearbyEntries = [];
  for (
    let pc = Math.max(start, targetAddress - 16);
    pc < Math.min(endExclusive, targetAddress + 20);
    pc += 4
  ) {
    const inst = safeDecode(pc);
    nearbyEntries.push({
      address: hex(pc),
      label: labelFor(pc),
      disassembly: formatInstruction(inst),
      target: inst && inst.target !== undefined ? hex(inst.target) : null,
    });
  }

  return {
    detected: entryCount > 1,
    start: hex(start),
    end: hex(endExclusive - 1),
    stride_bytes: 4,
    entry_count: entryCount,
    slot_index: slotIndex,
    nearby_entries: nearbyEntries,
  };
}

function buildSummary(callers, dataReferences, vectorTable) {
  if (callers.length === 0 && dataReferences.length === 0 && vectorTable.detected) {
    return 'No in-ROM 24-bit CALL/JP/pointer references to 0x021ED0 were found. The target sits inside a dense 4-byte JP vector table, so the most likely consumers are external BCALL/ASM callers rather than other ROM routines.';
  }

  if (callers.length === 0 && dataReferences.length === 0) {
    return 'No in-ROM 24-bit CALL/JP/pointer references to 0x021ED0 were found.';
  }

  return `Found ${callers.length} direct code reference(s) and ${dataReferences.length} raw pointer reference(s) to 0x021ED0.`;
}

const targetInstruction = safeDecode(TARGET);
const callers = scanCallers(TARGET);
const dataReferences = scanDataReferences(TARGET, callers);
const vectorTable = detectVectorTable(TARGET);

const report = {
  target: hex(TARGET),
  target_name: labelFor(TARGET),
  disassembly_at_target: formatInstruction(targetInstruction),
  target_context: formatContext(decodeLinear(TARGET - 16, TARGET + 20), TARGET),
  vector_table: vectorTable,
  callers: callers.map(enrichCaller),
  data_references: dataReferences,
  total_callers: callers.length,
  total_data_refs: dataReferences.length,
  analysis_summary: buildSummary(callers, dataReferences, vectorTable),
  inference: callers.length === 0 && vectorTable.detected
    ? 'Because 0x021ED0 is a syscall-vector-style JP slot and no ROM callers were found, the scan-code injection API appears to be exported for external consumers rather than used internally via absolute references.'
    : null,
  scan_patterns: {
    call: 'CD D0 1E 02',
    jp: 'C3 D0 1E 02',
    call_cc: CONDITION_NAMES.map((condition, index) => `${hexByte([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC][index])} D0 1E 02 (${condition})`),
    jp_cc: CONDITION_NAMES.map((condition, index) => `${hexByte([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA][index])} D0 1E 02 (${condition})`),
    data_pointer: 'D0 1E 02',
  },
};

console.log(JSON.stringify(report, null, 2));

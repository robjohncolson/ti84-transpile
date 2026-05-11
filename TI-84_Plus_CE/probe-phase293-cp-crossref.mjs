import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const PHASE292_PATH = path.join(__dirname, 'probe-phase292-key-dispatch-cp-values.mjs');
const PHASE292_SOURCE_PATH = PHASE292_PATH;
const KEYBOARD_MATRIX_PATH = path.join(__dirname, 'keyboard-matrix.md');

const rom = readFileSync(ROM_PATH);
const phase292Source = readFileSync(PHASE292_SOURCE_PATH, 'utf8');
const keyboardMatrixSource = readFileSync(KEYBOARD_MATRIX_PATH, 'utf8');
const { decodeInstruction } = await import('./ez80-decoder.js');

const A_SCAN_CODE_ADDR = 0xD0058C;
const RAW_JR_CONDITIONS = {
  0x20: 'JR NZ',
  0x28: 'JR Z',
  0x30: 'JR NC',
  0x38: 'JR C',
};
const RAW_JP_CONDITIONS = {
  0xC2: 'JP NZ',
  0xCA: 'JP Z',
  0xD2: 'JP NC',
  0xDA: 'JP C',
};

function hexAddr(value) {
  return `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
}

function hexByte(value) {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
}

function parseDispatcherAddresses(source) {
  const match = source.match(/const DISPATCH_ADDRS = \[([\s\S]*?)\];/);
  if (!match) {
    throw new Error('Failed to locate DISPATCH_ADDRS in phase292 source');
  }

  return [...match[1].matchAll(/0x[0-9A-Fa-f]+/g)].map((entry) => Number.parseInt(entry[0], 16));
}

function parseKeyboardMatrix(source) {
  const map = new Map();

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(0x[0-9A-Fa-f]+)\s*\|/);
    if (!match) continue;

    const keyName = match[1].trim();
    const scanCode = Number.parseInt(match[4], 16);
    map.set(scanCode, keyName);
  }

  return map;
}

function toInt8(value) {
  return value > 127 ? value - 256 : value;
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function scanPhase292Window(dispatcherAddr) {
  const start = Math.max(0, dispatcherAddr - 48);
  const end = Math.min(rom.length, dispatcherAddr + 128);
  const cpCascade = [];

  for (let offset = start; offset < end - 1; offset += 1) {
    if (rom[offset] !== 0xFE) continue;

    const cpValue = rom[offset + 1];
    const afterCp = offset + 2;
    const nextByte = rom[afterCp];
    let branchType = 'NONE';
    let target = null;

    if (nextByte in RAW_JR_CONDITIONS && afterCp + 1 < end) {
      branchType = RAW_JR_CONDITIONS[nextByte];
      target = afterCp + 2 + toInt8(rom[afterCp + 1]);
    } else if (nextByte in RAW_JP_CONDITIONS && afterCp + 3 <= end) {
      branchType = RAW_JP_CONDITIONS[nextByte];
      target = read24(afterCp + 1);
    } else if (nextByte === 0xC3 && afterCp + 3 <= end) {
      branchType = 'JP';
      target = read24(afterCp + 1);
    } else if (nextByte === 0xCD && afterCp + 3 <= end) {
      branchType = 'CALL';
      target = read24(afterCp + 1);
    } else if (nextByte === 0xC9) {
      branchType = 'RET';
    }

    cpCascade.push({
      cpAddr: offset,
      value: cpValue,
      branchType,
      target,
    });
  }

  return cpCascade;
}

function affectsScanState(scanState, instruction) {
  if (!scanState) {
    if (
      instruction.tag === 'ld-reg-mem' &&
      instruction.dest === 'a' &&
      instruction.addr === A_SCAN_CODE_ADDR
    ) {
      return true;
    }
    return false;
  }

  switch (instruction.tag) {
    case 'ld-reg-mem':
      return instruction.dest === 'a' ? instruction.addr === A_SCAN_CODE_ADDR : true;
    case 'ld-reg-ind':
      return instruction.dest === 'a' ? false : true;
    case 'ld-reg-reg':
      return instruction.dest === 'a' ? instruction.src === 'a' : true;
    case 'ld-reg-imm':
      return instruction.dest === 'a' ? false : true;
    case 'alu-imm':
      return instruction.op === 'cp';
    case 'alu-reg':
      if (instruction.op === 'cp') return true;
      if (instruction.op === 'or' && instruction.src === 'a') return true;
      return false;
    case 'pop':
      return instruction.pair !== 'af';
    case 'call':
    case 'call-conditional':
    case 'rst':
      return false;
    case 'in-reg':
      return instruction.reg !== 'a';
    case 'ld-a-mb':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'daa':
    case 'cpl':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
      return false;
    case 'inc-reg':
    case 'dec-reg':
      return instruction.reg !== 'a';
    default:
      return true;
  }
}

function preservesCompareFlags(instruction) {
  switch (instruction.tag) {
    case 'nop':
    case 'push':
      return true;
    case 'pop':
      return instruction.pair !== 'af';
    case 'ld-reg-imm':
    case 'ld-reg-reg':
    case 'ld-reg-mem':
    case 'ld-reg-ind':
    case 'ld-reg-ixd':
    case 'ld-mem-reg':
    case 'ld-ind-reg':
    case 'ld-pair-imm':
    case 'ld-pair-mem':
    case 'ld-mem-pair':
    case 'ld-pair-indexed':
    case 'ld-indexed-pair':
    case 'ld-ixiy-indexed':
    case 'ld-indexed-ixiy':
    case 'ld-ixd-imm':
    case 'ld-ixd-reg':
    case 'ld-sp-hl':
    case 'ld-sp-pair':
      return true;
    case 'indexed-cb-res':
    case 'indexed-cb-set':
    case 'bit-res':
    case 'bit-set':
    case 'bit-res-ind':
    case 'bit-set-ind':
      return true;
    default:
      return false;
  }
}

function findCompareBranch(pc, maxPcExclusive) {
  let current = pc;

  for (let step = 0; step < 6 && current < maxPcExclusive; step += 1) {
    const instruction = decodeInstruction(rom, current, 'adl');

    if (instruction.tag === 'jr-conditional') {
      return {
        branchType: `JR ${instruction.condition.toUpperCase()}`,
        target: instruction.target,
        branchPc: instruction.pc,
      };
    }

    if (instruction.tag === 'jp-conditional') {
      return {
        branchType: `JP ${instruction.condition.toUpperCase()}`,
        target: instruction.target,
        branchPc: instruction.pc,
      };
    }

    if (instruction.tag === 'ret-conditional') {
      return {
        branchType: `RET ${instruction.condition.toUpperCase()}`,
        target: null,
        branchPc: instruction.pc,
      };
    }

    if (instruction.tag === 'jr') {
      return {
        branchType: 'JR',
        target: instruction.target,
        branchPc: instruction.pc,
      };
    }

    if (instruction.tag === 'jp') {
      return {
        branchType: 'JP',
        target: instruction.target,
        branchPc: instruction.pc,
      };
    }

    if (!preservesCompareFlags(instruction)) {
      break;
    }

    current = instruction.nextPc;
  }

  return {
    branchType: 'NONE',
    target: null,
    branchPc: null,
  };
}

function withinRange(value, minValue, maxValueExclusive) {
  return value >= minValue && value < maxValueExclusive;
}

function walkDispatcherStrict(dispatcherAddr) {
  const minPc = Math.max(0, dispatcherAddr - 0x120);
  const maxPcExclusive = Math.min(rom.length, dispatcherAddr + 0x260);
  const queue = [{ pc: dispatcherAddr, scanState: false }];
  const visited = new Set();
  const cpEntries = [];
  const recordedPcs = new Set();

  while (queue.length > 0) {
    const state = queue.pop();
    if (!state) break;

    const visitKey = `${state.pc}:${state.scanState ? 1 : 0}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    if (!withinRange(state.pc, minPc, maxPcExclusive)) continue;

    const instruction = decodeInstruction(rom, state.pc, 'adl');

    if (state.scanState && instruction.tag === 'alu-imm' && instruction.op === 'cp') {
      if (!recordedPcs.has(instruction.pc)) {
        recordedPcs.add(instruction.pc);
        const branchInfo = findCompareBranch(instruction.nextPc, maxPcExclusive);
        cpEntries.push({
          dispatcher: dispatcherAddr,
          cpAddr: instruction.pc,
          value: instruction.value,
          branchType: branchInfo.branchType,
          target: branchInfo.target,
          branchPc: branchInfo.branchPc,
        });
      }
    }

    const nextScanState = affectsScanState(state.scanState, instruction);

    const pushState = (pc, scanState = nextScanState) => {
      if (pc == null) return;
      if (!withinRange(pc, minPc, maxPcExclusive)) return;
      queue.push({ pc, scanState });
    };

    switch (instruction.tag) {
      case 'jr':
      case 'jp':
        pushState(instruction.target);
        break;
      case 'jr-conditional':
      case 'jp-conditional':
        pushState(instruction.target);
        pushState(instruction.fallthrough);
        break;
      case 'ret':
      case 'reti':
      case 'retn':
      case 'halt':
      case 'slp':
      case 'jp-indirect':
        break;
      case 'ret-conditional':
        pushState(instruction.fallthrough);
        break;
      case 'call':
      case 'call-conditional':
        pushState(instruction.fallthrough);
        break;
      default:
        pushState(instruction.nextPc);
        break;
    }
  }

  cpEntries.sort((left, right) => left.cpAddr - right.cpAddr);
  return cpEntries;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function compressByteRanges(values) {
  if (values.length === 0) return [];

  const sorted = [...values].sort((left, right) => left - right);
  const ranges = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const value = sorted[index];
    if (value === rangeEnd + 1) {
      rangeEnd = value;
      continue;
    }

    ranges.push(rangeStart === rangeEnd ? hexByte(rangeStart) : `${hexByte(rangeStart)}-${hexByte(rangeEnd)}`);
    rangeStart = value;
    rangeEnd = value;
  }

  ranges.push(rangeStart === rangeEnd ? hexByte(rangeStart) : `${hexByte(rangeStart)}-${hexByte(rangeEnd)}`);
  return ranges;
}

function formatHandler(entry) {
  if (entry.target == null) {
    return entry.branchType === 'NONE' ? '-' : entry.branchType;
  }
  return `${hexAddr(entry.target)} (${entry.branchType})`;
}

function buildStrictCrossReference(strictEntries) {
  const byValue = new Map();

  for (const entry of strictEntries) {
    const bucket = byValue.get(entry.value) ?? [];
    bucket.push(entry);
    byValue.set(entry.value, bucket);
  }

  for (const bucket of byValue.values()) {
    bucket.sort((left, right) => {
      if (left.dispatcher !== right.dispatcher) return left.dispatcher - right.dispatcher;
      return left.cpAddr - right.cpAddr;
    });
  }

  return byValue;
}

function formatDispatcherRef(entry) {
  return `${hexAddr(entry.dispatcher)}@${hexAddr(entry.cpAddr)}`;
}

const dispatchers = parseDispatcherAddresses(phase292Source);
const keyboardMap = parseKeyboardMatrix(keyboardMatrixSource);
const rawPhase292ByDispatcher = new Map(
  dispatchers.map((dispatcher) => [dispatcher, scanPhase292Window(dispatcher)])
);

const dispatcherResults = dispatchers.map((dispatcher) => ({
  dispatcher,
  strictEntries: walkDispatcherStrict(dispatcher),
  rawEntries: rawPhase292ByDispatcher.get(dispatcher) ?? [],
}));

const strictEntries = dispatcherResults.flatMap((result) => result.strictEntries);
const strictCrossReference = buildStrictCrossReference(strictEntries);
const strictUniqueValues = [...strictCrossReference.keys()].sort((left, right) => left - right);
const strictCoveredSet = new Set(strictUniqueValues);
const gapValues = [];

for (let value = 0; value <= 0xFF; value += 1) {
  if (!strictCoveredSet.has(value)) {
    gapValues.push(value);
  }
}

const overlapValues = strictUniqueValues.filter((value) => {
  const entries = strictCrossReference.get(value) ?? [];
  return new Set(entries.map((entry) => entry.dispatcher)).size > 1;
});

const rawUniqueValues = uniqueSorted(
  dispatcherResults.flatMap((result) => result.rawEntries.map((entry) => entry.value))
);

const rawOnlyPerDispatcher = dispatcherResults
  .map((result) => {
    const strictValueSet = new Set(result.strictEntries.map((entry) => entry.value));
    const rawOnlyValues = uniqueSorted(
      result.rawEntries
        .map((entry) => entry.value)
        .filter((value) => !strictValueSet.has(value))
    );
    return {
      dispatcher: result.dispatcher,
      rawOnlyValues,
    };
  })
  .filter((result) => result.rawOnlyValues.length > 0);

const lines = [];

lines.push('Phase 293 CP Cross-Reference');
lines.push(`phase292_dispatchers: ${dispatchers.length}`);
lines.push(
  `dispatchers: ${dispatchers.map((dispatcher) => hexAddr(dispatcher)).join(', ')}`
);
lines.push(
  `phase292_raw_unique_cp_operands: ${rawUniqueValues.length}`
);
lines.push(
  `strict_d0058c_unique_cp_operands: ${strictUniqueValues.length}`
);
lines.push('');
lines.push('Handled scan codes (strict D0058C walk)');
lines.push('scan_code | key_name | dispatcher(s) | handler_address(es)');

for (const value of strictUniqueValues) {
  const entries = strictCrossReference.get(value) ?? [];
  const keyName = keyboardMap.get(value) ?? '-';
  lines.push(
    [
      hexByte(value),
      keyName,
      entries.map(formatDispatcherRef).join(', '),
      entries.map(formatHandler).join(', '),
    ].join(' | ')
  );
}

lines.push('');
lines.push('Summary');
lines.push(`strict_unique_scan_codes: ${strictUniqueValues.length}`);
lines.push(`strict_gap_count_00_ff: ${gapValues.length}`);
lines.push(`strict_overlap_count: ${overlapValues.length}`);
lines.push(`strict_gap_ranges: ${compressByteRanges(gapValues).join(', ')}`);
lines.push('');
lines.push('Overlapping scan codes');

if (overlapValues.length === 0) {
  lines.push('none');
} else {
  for (const value of overlapValues) {
    const keyName = keyboardMap.get(value) ?? '-';
    const entries = strictCrossReference.get(value) ?? [];
    lines.push(
      `${hexByte(value)} | ${keyName} | ${entries.map(formatDispatcherRef).join(', ')}`
    );
  }
}

lines.push('');
lines.push('Session292 broader-window values not recovered by the strict D0058C walk');

if (rawOnlyPerDispatcher.length === 0) {
  lines.push('none');
} else {
  for (const result of rawOnlyPerDispatcher) {
    lines.push(
      `${hexAddr(result.dispatcher)} | ${result.rawOnlyValues.map((value) => hexByte(value)).join(', ')}`
    );
  }
}

console.log(lines.join('\n'));

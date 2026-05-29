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

const KEY_CALL_PC = 0x03FAED;
const KEY_RAW_START = 0x03FAE0;
const KEY_RAW_LEN = 40;

const TARGET = 0x048AC4;
const TARGET_RAW_LEN = 64;
const TARGET_FIRST_INSTRUCTIONS = 20;
const TARGET_SCAN_END = 0x048E42; // 894-byte extent from Session 454

const D177B7 = 0xD177B7;
const VRAM_LO = 0xD40000;
const VRAM_HI = 0xD65400;
const CALL_PATTERN = [0xCD, 0xC4, 0x8A, 0x04];

const KNOWN_ADDRS = new Map([
  [0xD00896, 'D00896'],
  [0xD1408B, 'D1408B'],
  [0xD14091, 'D14091'],
  [0xD14093, 'D14093'],
  [0xD14095, 'D14095'],
  [0xD14097, 'D14097'],
  [0xD14098, 'D14098'],
  [0xD1441D, 'D1441D'],
  [0xD176FC, 'D176FC'],
  [0xD177B7, 'D177B7'],
  [0xD177BB, 'D177BB'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(start, length) {
  return Array.from(romBytes.subarray(start, start + length), hexByte).join(' ');
}

function labelAddr(addr) {
  return KNOWN_ADDRS.has(addr) ? `${hex(addr)} (${KNOWN_ADDRS.get(addr)})` : hex(addr);
}

function formatIndex(indexRegister, displacement) {
  const disp = displacement >= 0 ? `+${displacement}` : String(displacement);
  return `(${String(indexRegister).toUpperCase()}${disp})`;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(romBytes, pc, 'adl');
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: romBytes[pc] ?? 0,
      mode: 'adl',
    };
  }
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
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr)}),${upper(inst.pair)}`;
      }
      return `LD ${upper(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${upper(inst.pair)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndex(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${upper(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndex(inst.indexRegister, inst.displacement)},${upper(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndex(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ld-special':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-sp-pair':
      return `LD SP,${upper(inst.pair)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-ixd':
      return `INC ${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `DEC ${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'adc-pair':
      return `ADC HL,${upper(inst.src)}`;
    case 'sbc-pair':
      return `SBC HL,${upper(inst.src)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'bit-test':
      return `BIT ${inst.bit},${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit},(HL)`;
    case 'bit-set':
      return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set-ind':
      return `SET ${inst.bit},(HL)`;
    case 'bit-res':
      return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res-ind':
      return `RES ${inst.bit},(HL)`;
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
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'slp':
      return 'SLP';
    case 'ei':
      return 'EI';
    case 'di':
      return 'DI';
    case 'exx':
      return 'EXX';
    case 'ex-af':
      return 'EX AF,AF\'';
    case 'ex-de-hl':
      return 'EX DE,HL';
    case 'rlca':
      return 'RLCA';
    case 'rrca':
      return 'RRCA';
    case 'rla':
      return 'RLA';
    case 'rra':
      return 'RRA';
    case 'cpl':
      return 'CPL';
    case 'scf':
      return 'SCF';
    case 'ccf':
      return 'CCF';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return inst.dasm || inst.tag;
  }
}

function makeRow(pc) {
  const inst = safeDecode(pc);
  const length = Math.max(1, inst.length || 1);
  return {
    pc,
    bytes: rawBytes(pc, length),
    inst,
  };
}

function decodeLinear(startPc, maxBytes, maxInstructions = Number.POSITIVE_INFINITY) {
  const rows = [];
  let pc = startPc;
  let count = 0;
  const endPc = startPc + maxBytes;

  while (pc < endPc && count < maxInstructions) {
    const row = makeRow(pc);
    rows.push(row);
    pc += row.inst.length || 1;
    count += 1;
  }

  return rows;
}

function scanPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= romBytes.length - pattern.length; i += 1) {
    let match = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (romBytes[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      hits.push(i);
    }
  }
  return hits;
}

function chooseContextStart(targetPc, lookBack = 24) {
  const minStart = Math.max(0, targetPc - lookBack);
  let best = null;

  for (let start = minStart; start <= targetPc; start += 1) {
    const rows = [];
    let pc = start;
    let guard = 0;
    let hasTarget = false;
    let unknownCount = 0;

    while (pc <= targetPc && guard < 64) {
      const row = makeRow(pc);
      rows.push(row);
      if (row.inst.tag === 'db') {
        unknownCount += 1;
      }
      if (pc === targetPc) {
        hasTarget = true;
      }
      pc += row.inst.length || 1;
      guard += 1;
      if (pc > targetPc) {
        break;
      }
    }

    if (!hasTarget) {
      continue;
    }

    const beforeInstructionCount = Math.max(0, rows.length - 1);
    const bytesBefore = targetPc - start;
    const avgLen = beforeInstructionCount > 0 ? bytesBefore / beforeInstructionCount : 0;
    const oneBytePrefixCount = rows
      .slice(0, -1)
      .filter((row) => (row.inst.length || 1) === 1)
      .length;
    const score = (avgLen * 1000) + (bytesBefore * 10) - (unknownCount * 200) - (oneBytePrefixCount * 5);

    if (!best || score > best.score) {
      best = { start, score };
    }
  }

  return best ? best.start : minStart;
}

function decodeContext(targetPc, lookBack = 24, maxAfterBytes = 8) {
  const start = chooseContextStart(targetPc, lookBack);
  const rows = [];
  let pc = start;
  let guard = 0;

  while (pc < targetPc + maxAfterBytes && guard < 64) {
    const row = makeRow(pc);
    rows.push(row);
    pc += row.inst.length || 1;
    guard += 1;
    if (pc > targetPc && rows.some((candidate) => candidate.pc === targetPc)) {
      break;
    }
  }

  return rows;
}

function findRow(rows, predicate) {
  return rows.find(predicate) ?? null;
}

function firstRowsSummary(rows) {
  return rows.map((row) => `- ${hex(row.pc)}  ${formatInstruction(row.inst)}`);
}

function callerConditionSummary(rows, callPc) {
  const relevant = rows
    .filter((row) => row.pc < callPc)
    .filter((row) => (
      row.inst.tag === 'ld-reg-mem'
      || row.inst.tag === 'alu-imm'
      || row.inst.tag === 'alu-reg'
      || row.inst.tag === 'jr-conditional'
      || row.inst.tag === 'jp-conditional'
    ));

  return relevant.map((row) => formatInstruction(row.inst)).join(' -> ');
}

function collectFunctionRows() {
  return decodeLinear(TARGET, TARGET_SCAN_END - TARGET, 512);
}

function collectD177B7Checks(rows) {
  const checks = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.inst.tag !== 'ld-reg-mem' || row.inst.dest !== 'a' || row.inst.addr !== D177B7) {
      continue;
    }

    const next = rows[index + 1];
    const branch = rows[index + 2];

    if (next?.inst.tag === 'alu-reg' && next.inst.op === 'or' && next.inst.src === 'a') {
      checks.push(`${hex(row.pc)} reads D177B7 and tests for zero via OR A; ${branch ? formatInstruction(branch.inst) : 'no branch decoded after it'}.`);
      continue;
    }

    if (next?.inst.tag === 'alu-imm' && next.inst.op === 'cp') {
      checks.push(`${hex(row.pc)} reads D177B7 and compares it against ${hex(next.inst.value, 2)}; ${branch ? formatInstruction(branch.inst) : 'no branch decoded after it'}.`);
      continue;
    }

    checks.push(`${hex(row.pc)} reads D177B7; next instruction is ${next ? formatInstruction(next.inst) : 'unknown'}.`);
  }

  return checks;
}

function collectDirectVramRefs(rows) {
  return rows.filter((row) => typeof row.inst.addr === 'number' && row.inst.addr >= VRAM_LO && row.inst.addr < VRAM_HI);
}

function collectPortOps(rows) {
  const hits = [];
  let currentBc = null;

  for (const row of rows) {
    if (row.inst.tag === 'ld-pair-imm' && row.inst.pair === 'bc') {
      currentBc = row.inst.value;
    } else if (
      row.inst.tag === 'ld-pair-mem'
      || row.inst.tag === 'ld-pair-indexed'
      || row.inst.tag === 'inc-pair'
      || row.inst.tag === 'dec-pair'
      || row.inst.tag === 'pop'
    ) {
      if (row.inst.pair === 'bc') {
        currentBc = null;
      }
    }

    if (row.inst.tag === 'in-reg' || row.inst.tag === 'out-reg' || row.inst.tag === 'in0' || row.inst.tag === 'out0') {
      hits.push({
        pc: row.pc,
        text: formatInstruction(row.inst),
        bc: currentBc,
      });
    }
  }

  return hits;
}

function collectInterestingStateWrites(rows) {
  return rows.filter((row) => row.inst.tag === 'ld-mem-reg' && KNOWN_ADDRS.has(row.inst.addr));
}

function printRows(rows, highlightPc = null) {
  for (const row of rows) {
    const marker = row.pc === highlightPc ? '  <==' : '';
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${formatInstruction(row.inst)}${marker}`);
  }
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function main() {
  console.log('Phase 455 - Trace 0x048AC4 Callers in Key Processor Path');
  console.log(`ROM: ${ROM_PATH}`);

  printSection('1. Key processor call gate at 0x03FAED');
  console.log(`Raw bytes at ${hex(KEY_RAW_START)} (+${KEY_RAW_LEN}):`);
  console.log(rawBytes(KEY_RAW_START, KEY_RAW_LEN));
  console.log('');

  const keyRows = decodeContext(KEY_CALL_PC, 24, 8);
  printRows(keyRows, KEY_CALL_PC);

  const keyLoad = findRow(keyRows, (row) => row.inst.tag === 'ld-reg-mem' && row.inst.dest === 'a' && row.inst.addr === D177B7);
  const keyCall = findRow(keyRows, (row) => row.pc === KEY_CALL_PC);

  console.log('');
  console.log(`Condition summary: ${callerConditionSummary(keyRows, KEY_CALL_PC)}`);
  console.log(`Call trigger: ${labelAddr(D177B7)} is loaded into A${keyLoad ? ` at ${hex(keyLoad.pc)}` : ''}; the call happens only if A is neither 0x55 nor 0xAA.`);
  console.log(`Target encoding: ${keyCall ? keyCall.bytes : 'n/a'} = direct CALL ${hex(TARGET)}. No register holds the target.`);

  printSection('2. 0x048AC4 prologue and first-pass behavior');
  console.log(`First ${TARGET_RAW_LEN} raw bytes at ${hex(TARGET)}:`);
  console.log(rawBytes(TARGET, TARGET_RAW_LEN));
  console.log('');

  const prologueRows = decodeLinear(TARGET, 0x80, TARGET_FIRST_INSTRUCTIONS);
  printRows(prologueRows);
  console.log('');

  console.log('What the first ~20 instructions do:');
  for (const line of firstRowsSummary(prologueRows)) {
    console.log(line);
  }

  const functionRows = collectFunctionRows();
  const d177b7Checks = collectD177B7Checks(functionRows);
  const directVramRefs = collectDirectVramRefs(functionRows);
  const portOps = collectPortOps(functionRows);
  const stateWrites = collectInterestingStateWrites(functionRows);

  console.log('');
  console.log(`Linear scan window: ${hex(TARGET)}..${hex(TARGET_SCAN_END - 1)} (${TARGET_SCAN_END - TARGET} bytes).`);
  console.log('D177B7 checks inside 0x048AC4:');
  for (const line of d177b7Checks) {
    console.log(`- ${line}`);
  }

  console.log('');
  console.log(`Direct absolute VRAM refs in the scan window (${hex(VRAM_LO)}..${hex(VRAM_HI - 1)}): ${directVramRefs.length ? 'present' : 'none'}`);
  if (directVramRefs.length) {
    for (const row of directVramRefs) {
      console.log(`- ${hex(row.pc)}  ${formatInstruction(row.inst)}`);
    }
  }

  console.log('');
  console.log(`Port I/O in the scan window: ${portOps.length} hits`);
  for (const hit of portOps.slice(0, 12)) {
    const viaBc = hit.bc !== null && hit.bc !== undefined ? ` [BC=${hex(hit.bc)}]` : '';
    console.log(`- ${hex(hit.pc)}  ${hit.text}${viaBc}`);
  }
  if (portOps.length > 12) {
    console.log(`- ... ${portOps.length - 12} more port operations later in the same function`);
  }

  console.log('');
  console.log('Interesting direct state writes in the scan window:');
  for (const row of stateWrites.slice(0, 16)) {
    console.log(`- ${hex(row.pc)}  ${formatInstruction(row.inst)} -> ${labelAddr(row.inst.addr)}`);
  }

  console.log('');
  console.log('Interpretation:');
  console.log('- The entry sequence is not a framebuffer blit. It allocates a small stack local, manipulates hardware ports, calls status helpers, and uses D177B7 as a mode/state latch.');
  console.log('- The early D177B7 logic is a state machine: test for nonzero, clear to 0, later check for 0x55, and later re-stage 0xAA / 0x55.');
  console.log('- The later direct writes to D14091, D14095, D14093, and D176FC look like mode-init completion / key-processing enable bookkeeping rather than direct display refresh.');
  console.log('- Based on direct ROM evidence here, 0x048AC4 looks closer to a mode/peripheral/init-completion routine with display-state side effects than a pure VRAM refresh routine.');

  printSection('3. All CALL 0x048AC4 sites');
  const callers = scanPattern(CALL_PATTERN);
  console.log(`CALL pattern CD C4 8A 04 matches: ${callers.map((pc) => hex(pc)).join(', ')}`);

  for (const callPc of callers) {
    console.log('');
    console.log(`Caller ${hex(callPc)}`);
    console.log(`Raw 16 bytes before CALL: ${rawBytes(callPc - 16, 20)}`);
    const rows = decodeContext(callPc, 24, 8);
    printRows(rows, callPc);
    console.log(`Condition summary: ${callerConditionSummary(rows, callPc)}`);
  }
}

main();

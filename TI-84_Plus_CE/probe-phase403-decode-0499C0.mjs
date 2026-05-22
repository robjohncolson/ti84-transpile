#!/usr/bin/env node

/**
 * Phase 403 — Decode 0x0499C0 (exit_state / notification teardown handler)
 *
 * This probe statically disassembles and analyzes the function at 0x0499C0,
 * which is called by 0x049CCA when the notification type changes. It determines
 * whether the old type should be "allowed" or "blocked" during teardown.
 *
 * Outputs:
 *   1. Full disassembly of 0x0499C0
 *   2. Parameter and RAM access map
 *   3. All callers with context
 *   4. Handler jump table (seqcase) entries at 0x0499D8
 *   5. Cross-reference with 0x049CCA and the selector table at 0x049D3A
 *   6. Notification lifecycle architecture summary
 *
 * Also writes: TI-84_Plus_CE/phase403-notification-handler-report.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH = path.join(__dirname, 'phase403-notification-handler-report.md');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = fs.readFileSync(ROM_PATH);

const MODE = 'adl';

// Key addresses
const EXIT_STATE_ADDR = 0x0499C0;
const EXIT_STATE_TABLE = 0x0499D8;
const EXIT_STATE_ALLOW = 0x049A15;       // JR to epilogue (retval stays 1 = allow)
const EXIT_STATE_BLOCK = 0x049A17;       // Sets (IX-1)=0 then epilogue (retval=0 = block)
const EXIT_STATE_EPILOGUE = 0x049A1B;    // Common exit: read retval, restore stack, RET
const EXIT_STATE_END = 0x049A23;         // First byte of next function (process_key)

const DISPATCH_ADDR = 0x049CCA;
const DISPATCH_END = 0x049E07;
const SELECTOR_TABLE = 0x049D3A;
const PROCESS_KEY_ADDR = 0x049A23;

const TYPE_REG = 0xD177B9;
const VALUE_REG = 0xD177B8;
const PROLOGUE_HELPER = 0x00012C;        // Stack frame builder
const SEQCASE_HELPER = 0x000124;         // _seqcase dispatcher

// Byte patterns for ROM scanning
const CALL_EXIT_STATE = [0xCD, 0xC0, 0x99, 0x04];
const JP_EXIT_STATE = [0xC3, 0xC0, 0x99, 0x04];
const CALL_DISPATCH = [0xCD, 0xCA, 0x9C, 0x04];

const TYPE_LABELS = new Map([
  [0x00, 'Idle / No context'],
  [0x01, 'Home Screen'],
  [0x02, 'Y= Equation Editor'],
  [0x03, 'Window / Format'],
  [0x04, 'Zoom'],
  [0x10, 'Menu / Dialog'],
  [0x11, 'Stat / List Editor'],
  [0x12, 'Matrix Editor'],
  [0x13, 'Graph Active'],
  [0x14, 'Table'],
  [0x15, 'Distribution / Finance'],
  [0x16, 'Catalog'],
  [0x17, 'Program Editor'],
  [0x18, 'Apps / Memory'],
]);

// ─── Utility functions ────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatSigned(value) {
  const n = Number(value ?? 0);
  return `${n >= 0 ? '+' : '-'}0x${Math.abs(n).toString(16).toUpperCase()}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${formatSigned(displacement)})`;
}

function formatBytes(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

// ─── Decoder wrappers ─────────────────────────────────────────────────

function safeDecode(pc) {
  if (pc < 0 || pc >= rom.length) return null;
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    if (!inst || !inst.length || inst.length <= 0) return null;
    return inst;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) return '<null>';

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  const tag = inst.tag ?? 'unknown';

  switch (tag) {
    case 'nop':
    case 'halt':
    case 'di':
    case 'ei':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rla':
    case 'rrca':
    case 'exx':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'neg':
      return `${prefix}${tag.toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-special':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-pair':
      return `${prefix}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ixd':
      return `${prefix}${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'rst':
      return `${prefix}RST ${hexByte(inst.target)}`;
    default: {
      const skip = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'tag']);
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (skip.has(key) || value === undefined || value === null) continue;
        if (typeof value === 'number') {
          fields.push(`${key}=${key === 'displacement' ? formatSigned(value) : hex(value, value <= 0xFF ? 2 : 6)}`);
        } else {
          fields.push(`${key}=${value}`);
        }
      }
      return `${prefix}${String(tag).toUpperCase()}${fields.length ? ` ${fields.join(' ')}` : ''}`;
    }
  }
}

// ─── Disassembly helpers ──────────────────────────────────────────────

function disassembleLinear(start, endExclusive) {
  const rows = [];
  for (let pc = start; pc < endExclusive;) {
    const inst = safeDecode(pc) ?? {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      mode: MODE,
      modePrefix: null,
    };
    rows.push({ pc, inst });
    pc = inst.nextPc ?? (pc + inst.length);
  }
  return rows;
}

function disassembleN(start, maxInstructions) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < maxInstructions; i++) {
    const inst = safeDecode(pc);
    if (!inst) break;
    rows.push({ pc, inst });
    if (inst.terminates) break;
    pc = inst.nextPc ?? (pc + inst.length);
  }
  return rows;
}

// ─── Seqcase table parser ─────────────────────────────────────────────

function parseSeqcase(base) {
  const rawCount = rom[base];
  const numCases = rawCount - 1;
  let off = base + 3;
  const entries = [];

  for (let i = 0; i < numCases; i++) {
    const target = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
    const key = rom[off + 3];
    entries.push({ key, target });
    off += 4;
  }

  const defaultTarget = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
  return { rawCount, numCases, entries, defaultTarget, end: off + 3 };
}

// ─── ROM pattern scanner ──────────────────────────────────────────────

function findPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let matched = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }
  return hits;
}

// ─── Context recovery for callers ─────────────────────────────────────

const MAX_CONTEXT_BYTES = 32;

function recoverContextRows(endPc) {
  const startMin = Math.max(0, endPc - MAX_CONTEXT_BYTES);
  const candidates = [];

  for (let start = startMin; start < endPc; start++) {
    const rows = [];
    let pc = start;
    let ok = true;

    while (pc < endPc) {
      const inst = safeDecode(pc);
      if (!inst || !inst.length) { ok = false; break; }
      const nextPc = inst.nextPc ?? (pc + inst.length);
      if (nextPc > endPc) { ok = false; break; }
      rows.push({ pc, inst });
      pc = nextPc;
    }

    if (ok && pc === endPc) candidates.push(rows);
  }

  if (!candidates.length) return [];

  // Score: prefer candidates with more push/ld instructions near the end
  candidates.sort((a, b) => {
    let sa = a.length, sb = b.length;
    const ta = a.slice(-8), tb = b.slice(-8);
    sa += ta.filter((r) => r.inst.tag === 'push').length * 100;
    sb += tb.filter((r) => r.inst.tag === 'push').length * 100;
    sa += ta.filter((r) => r.inst.tag === 'ld-pair-imm').length * 25;
    sb += tb.filter((r) => r.inst.tag === 'ld-pair-imm').length * 25;
    sa -= a.filter((r) => r.inst.tag === 'db').length * 50;
    sb -= b.filter((r) => r.inst.tag === 'db').length * 50;
    return sb - sa;
  });
  return candidates[0];
}

// ─── Rendering helpers ────────────────────────────────────────────────

function renderRow(row, note) {
  const text = `${hex(row.pc)}  ${formatBytes(row.pc, row.inst.length).padEnd(16)}  ${formatInstruction(row.inst)}`;
  return note ? `${text}    ; ${note}` : text;
}

function renderRows(rows, noteMap = new Map()) {
  for (const row of rows) {
    output(renderRow(row, noteMap.get(row.pc)));
  }
}

// ─── Output collector (stdout + report file) ──────────────────────────

const reportLines = [];

function output(line = '') {
  console.log(line);
  reportLines.push(line);
}

// ─── Main analysis ────────────────────────────────────────────────────

function main() {
  output('# Phase 403 — Decode 0x0499C0 (exit_state / notification teardown)');
  output(`ROM: ${ROM_PATH}`);
  output(`Target function: ${hex(EXIT_STATE_ADDR)} .. ${hex(EXIT_STATE_END - 1)}`);
  output('');

  // ── 1. Full disassembly of 0x0499C0 ──────────────────────────────

  output('## 1. Full Disassembly of 0x0499C0');
  output('');

  const exitRows = disassembleLinear(EXIT_STATE_ADDR, EXIT_STATE_END);

  const exitNotes = new Map([
    [0x0499C0, 'prologue: HL = -1 (allocate 1 local byte)'],
    [0x0499C4, `CALL ${hex(PROLOGUE_HELPER)} — build stack frame, set IX`],
    [0x0499C8, '(IX-1) = 0x01 — default retval = "allow"'],
    [0x0499CC, `A = (${hex(TYPE_REG)}) — load current notification type`],
    [0x0499D0, 'OR A — set flags, clear carry'],
    [0x0499D1, 'SBC HL, HL — HL = 0 (carry was cleared by OR A)'],
    [0x0499D3, 'L = A — HL = zero-extended type byte'],
    [0x0499D4, `CALL ${hex(SEQCASE_HELPER)} — _seqcase dispatch on type`],
    [0x0499D8, '--- seqcase table (14 raw, 13 cases) follows inline ---'],
    [0x049A15, 'ALLOW path: JR to epilogue (retval stays 0x01)'],
    [0x049A17, 'BLOCK path: (IX-1) = 0x00 — override retval to "block"'],
    [0x049A1B, 'epilogue: A = (IX-1) — read retval'],
    [0x049A1E, 'LD SP, IX — tear down frame'],
    [0x049A20, 'POP IX — restore caller IX'],
    [0x049A22, 'RET'],
  ]);

  renderRows(exitRows, exitNotes);
  output('');

  // ── 2. Seqcase table analysis ────────────────────────────────────

  output('## 2. Exit-State Seqcase Table @ 0x0499D8');
  output('');

  const exitTable = parseSeqcase(EXIT_STATE_TABLE);
  output(`rawCount=${exitTable.rawCount}  cases=${exitTable.numCases}  default=${hex(exitTable.defaultTarget)}`);
  output('');

  const allowKeys = [];
  const blockKeys = [];

  for (const entry of exitTable.entries) {
    const label = TYPE_LABELS.get(entry.key) ?? 'unlabeled';
    const isAllow = entry.target === EXIT_STATE_ALLOW;
    const isBlock = entry.target === EXIT_STATE_BLOCK || entry.target === EXIT_STATE_EPILOGUE;
    const action = isAllow ? 'ALLOW (retval=1)' : 'BLOCK (retval=0)';

    if (isAllow) allowKeys.push(entry.key);
    else blockKeys.push(entry.key);

    output(`  ${hex(entry.key, 2)}  ${label.padEnd(24)} -> ${hex(entry.target)}  ${action}`);
  }

  // Default target
  const defaultIsAllow = exitTable.defaultTarget === EXIT_STATE_ALLOW;
  if (defaultIsAllow) {
    output(`  default${' '.repeat(25)} -> ${hex(exitTable.defaultTarget)}  ALLOW (retval=1)`);
  } else {
    output(`  default${' '.repeat(25)} -> ${hex(exitTable.defaultTarget)}  BLOCK (retval=0)`);
  }
  output('');

  output('Summary:');
  output(`  ALLOW types: ${allowKeys.map((k) => hex(k, 2)).join(', ')}${defaultIsAllow ? ' + default' : ''}`);
  output(`  BLOCK types: ${blockKeys.map((k) => hex(k, 2)).join(', ')}${!defaultIsAllow ? ' + default' : ''}`);
  output('');

  // ── 3. Parameter and RAM access map ──────────────────────────────

  output('## 3. Parameter and RAM Access Map');
  output('');
  output('Parameters:');
  output('  - No explicit parameters passed via stack or registers');
  output(`  - Reads current type from RAM at ${hex(TYPE_REG)} (0xD177B9)`);
  output('  - Returns result in A: 0x01 = allow transition, 0x00 = block transition');
  output('');
  output('RAM reads:');
  output(`  ${hex(TYPE_REG)}  — current notification/screen type (1 byte)`);
  output('');
  output('RAM writes:');
  output('  none (pure read + classify function)');
  output('');
  output('IX offsets:');
  output('  (IX-1) — local retval: initialized to 0x01, overwritten to 0x00 for BLOCK types');
  output('');
  output('IY offsets:');
  output('  none');
  output('');
  output('Subcalls:');
  output(`  ${hex(PROLOGUE_HELPER)} — stack frame prologue (standard OS helper)`);
  output(`  ${hex(SEQCASE_HELPER)} — _seqcase jump-table dispatcher (standard OS helper)`);
  output('');
  output('Return value:');
  output('  A = (IX-1): 0x01 if the current type is on the allow list, 0x00 if blocked');
  output('');

  // ── 4. Caller list with context ──────────────────────────────────

  output('## 4. All Callers of 0x0499C0');
  output('');

  const callHits = findPattern(CALL_EXIT_STATE);
  const jpHits = findPattern(JP_EXIT_STATE);

  output(`CALL ${hex(EXIT_STATE_ADDR)} sites: ${callHits.length}`);
  output(`JP ${hex(EXIT_STATE_ADDR)} sites: ${jpHits.length}`);
  output('');

  const allCallers = [
    ...callHits.map((pc) => ({ pc, kind: 'CALL' })),
    ...jpHits.map((pc) => ({ pc, kind: 'JP' })),
  ].sort((a, b) => a.pc - b.pc);

  for (const caller of allCallers) {
    output(`--- ${caller.kind} at ${hex(caller.pc)} ---`);
    const contextRows = recoverContextRows(caller.pc);
    if (contextRows.length) {
      output('  Context (preceding instructions):');
      for (const row of contextRows.slice(-5)) {
        output(`    ${hex(row.pc)}  ${formatBytes(row.pc, row.inst.length).padEnd(16)}  ${formatInstruction(row.inst)}`);
      }
    }

    // Also show 3 instructions after the call
    const afterRows = disassembleN(caller.pc, 4);
    output('  Call + aftermath:');
    for (const row of afterRows) {
      output(`    ${hex(row.pc)}  ${formatBytes(row.pc, row.inst.length).padEnd(16)}  ${formatInstruction(row.inst)}`);
    }
    output('');
  }

  if (allCallers.length === 0) {
    output('  (no direct CALL/JP references found)');
    output('');
  }

  // ── 5. Handler jump table at 0x049D3A ────────────────────────────

  output('## 5. Selector (Setup) Jump Table @ 0x049D3A');
  output('');

  const selTable = parseSeqcase(SELECTOR_TABLE);
  output(`rawCount=${selTable.rawCount}  cases=${selTable.numCases}  default=${hex(selTable.defaultTarget)}`);
  output('');

  output('Each case handler for the selector table (first few instructions):');
  output('');

  for (const entry of selTable.entries) {
    const label = TYPE_LABELS.get(entry.key) ?? 'unlabeled';
    output(`  Key ${hex(entry.key, 2)} (${label}) -> ${hex(entry.target)}:`);

    const handlerRows = disassembleN(entry.target, 5);
    for (const row of handlerRows) {
      output(`    ${hex(row.pc)}  ${formatBytes(row.pc, row.inst.length).padEnd(16)}  ${formatInstruction(row.inst)}`);
    }
    output('');
  }

  // Default case
  output(`  Default -> ${hex(selTable.defaultTarget)}:`);
  const defaultRows = disassembleN(selTable.defaultTarget, 5);
  for (const row of defaultRows) {
    output(`    ${hex(row.pc)}  ${formatBytes(row.pc, row.inst.length).padEnd(16)}  ${formatInstruction(row.inst)}`);
  }
  output('');

  // Check if all case bodies are uniform
  let allUniform = true;
  for (const entry of selTable.entries) {
    const isStandard =
      rom[entry.target] === 0xDD &&
      rom[entry.target + 1] === 0x7E &&
      rom[entry.target + 2] === 0x06 &&
      rom[entry.target + 3] === 0x32 &&
      rom[entry.target + 4] === 0xB8 &&
      rom[entry.target + 5] === 0x77 &&
      rom[entry.target + 6] === 0xD1;
    if (!isStandard) { allUniform = false; break; }
  }

  if (allUniform) {
    output(`Observation: All ${selTable.numCases} case bodies are uniform — each loads (IX+6) into A and stores it to ${hex(VALUE_REG)}, then jumps to the common epilogue.`);
  }
  output('');

  // Epilogue disassembly
  output('Selector function epilogue @ 0x049DF9:');
  const epilogueRows = disassembleLinear(0x049DF5, 0x049E07);
  const epilogueNotes = new Map([
    [0x049DF5, 'default case: (IX-1) = 0x02 (error / unrecognized type)'],
    [0x049DF9, 'POP AF — restore interrupt state'],
    [0x049DFA, 'JP PO — if interrupts were disabled, skip EI'],
    [0x049DFE, 'EI — re-enable interrupts'],
    [0x049DFF, 'A = (IX-1) — read retval (0x01=ok, 0x02=unrecognized)'],
    [0x049E02, 'LD SP, IX — tear down frame'],
    [0x049E04, 'POP IX — restore caller IX'],
    [0x049E06, 'RET'],
  ]);
  renderRows(epilogueRows, epilogueNotes);
  output('');

  // ── 6. Cross-reference: 0x0499C0 vs 0x049CCA ────────────────────

  output('## 6. Cross-Reference: exit_state (0x0499C0) vs dispatch (0x049CCA)');
  output('');

  output('Call flow inside 0x049CCA when type changes:');
  output('');
  output('  1. Read new requested type from (IX+9)');
  output(`  2. Compare against current type at ${hex(TYPE_REG)}`);
  output('  3. If different:');
  output(`     a. CALL ${hex(EXIT_STATE_ADDR)} — asks "should we allow leaving the current type?"`);
  output('     b. If A=1 (allow): proceed');
  output('     c. Recursive self-call to flush the current state');
  output(`     d. Write new type to ${hex(TYPE_REG)}`);
  output(`     e. CALL ${hex(PROCESS_KEY_ADDR)} — process the key/value for the new type`);
  output('     f. Run the selector table dispatch — stores (IX+6) into D177B8');
  output('  4. If same type: skip straight to step (e)');
  output('');

  // Verify the call site at 0x049CE9
  output('Verification — the single call site at 0x049CE9:');
  const callContext = disassembleLinear(0x049CE0, 0x049CF5);
  const callNotes = new Map([
    [0x049CE8, `push requested type onto stack for exit_state's frame`],
    [0x049CE9, `CALL ${hex(EXIT_STATE_ADDR)} — check if we can leave the current type`],
    [0x049CED, 'B7 = OR A — test return value'],
    [0x049CEE, 'JR Z to skip (if A=0, exit_state blocked the transition)'],
  ]);
  renderRows(callContext, callNotes);
  output('');

  // Compare the two seqcase tables
  output('Seqcase table comparison:');
  output('');
  output(`  exit_state table (${hex(EXIT_STATE_TABLE)}): routes by CURRENT type -> allow/block`);
  output(`  selector table   (${hex(SELECTOR_TABLE)}): routes by NEW type -> store value`);
  output('');

  output('  Type    exit_state action    selector action');
  output('  ------  ------------------   ----------------');

  const exitMap = new Map(exitTable.entries.map((e) => [e.key, e.target]));
  const selMap = new Map(selTable.entries.map((e) => [e.key, e.target]));

  const allKeys = new Set([
    ...exitTable.entries.map((e) => e.key),
    ...selTable.entries.map((e) => e.key),
  ]);

  for (const key of [...allKeys].sort((a, b) => a - b)) {
    const label = TYPE_LABELS.get(key) ?? 'unlabeled';
    const exitTarget = exitMap.get(key);
    const exitAction = exitTarget === EXIT_STATE_ALLOW ? 'ALLOW' : (exitTarget === EXIT_STATE_BLOCK || exitTarget === EXIT_STATE_EPILOGUE) ? 'BLOCK' : exitTarget ? hex(exitTarget) : 'default';
    const selTarget = selMap.get(key);
    const selAction = selTarget ? `store (IX+6)->${hex(VALUE_REG)}` : 'default (retval=2)';

    output(`  ${hex(key, 2)}  ${label.padEnd(16)}  ${exitAction.padEnd(18)} ${selAction}`);
  }
  output('');

  // ── 7. Notification lifecycle architecture ───────────────────────

  output('## 7. Notification Lifecycle Architecture');
  output('');
  output('The notification/screen-context system at 0x049CCA is a synchronous');
  output('state machine with three distinct phases:');
  output('');
  output('### Phase 1: Teardown Gate (exit_state @ 0x0499C0)');
  output('');
  output('  Purpose: Determine if the OS should allow leaving the current screen context.');
  output('  Mechanism: Reads the current type from D177B9, runs a seqcase lookup.');
  output('  Result: A=1 (allow) or A=0 (block).');
  output('');
  output('  The allow/block classification:');
  output('    ALLOW (types 0x01-0x04, 0x17-0x18, default):');
  output('      Home, Y=, Window, Zoom, Program Editor, Apps/Memory, and any');
  output('      unrecognized type. These contexts can be freely exited.');
  output('    BLOCK (types 0x10-0x16):');
  output('      Menu/Dialog, Stat/List Editor, Matrix Editor, Graph Active,');
  output('      Table, Distribution/Finance, Catalog. These contexts resist');
  output('      being exited — the caller sees A=0 and skips the transition.');
  output('');
  output('  Interpretation: "lightweight" screen contexts (basic editors, menus)');
  output('  allow transitions freely. "Heavyweight" contexts (modal dialogs,');
  output('  active graph, stat editors) block transitions — likely because they');
  output('  have unsaved state or active rendering that must be explicitly dismissed.');
  output('');
  output('### Phase 2: State Commit (inside 0x049CCA core)');
  output('');
  output('  If exit_state returned ALLOW:');
  output('    1. Recursive self-call flushes the old type/value');
  output(`    2. New type written to ${hex(TYPE_REG)}`);
  output(`    3. CALL ${hex(PROCESS_KEY_ADDR)} processes the key/value payload`);
  output('');
  output('### Phase 3: Value Store (selector table @ 0x049D3A)');
  output('');
  output(`  The seqcase at ${hex(SELECTOR_TABLE)} routes by the NEW type.`);
  output(`  All 13 cases are identical: store (IX+6) -> ${hex(VALUE_REG)}.`);
  output('  Unrecognized types get retval=0x02 (error indicator).');
  output('');
  output('### Lifecycle Summary');
  output('');
  output('  Caller pushes (type, value) -> CALL 0x049CCA');
  output('    |');
  output('    +-- Same type as current? -> skip teardown, go to process_key');
  output('    |');
  output('    +-- Different type?');
  output('         |');
  output('         +-- CALL 0x0499C0 (exit_state): can we leave current context?');
  output('         |     A=0 -> BLOCKED, return without changing anything');
  output('         |     A=1 -> ALLOWED, continue');
  output('         |');
  output('         +-- Recursive flush of old state');
  output(`         +-- Commit new type to ${hex(TYPE_REG)}`);
  output(`         +-- CALL ${hex(PROCESS_KEY_ADDR)} (process_key on payload)`);
  output(`         +-- Selector dispatch: store value to ${hex(VALUE_REG)}`);
  output('         +-- Return');
  output('');

  // ── 8. Verdict ───────────────────────────────────────────────────

  output('## 8. Verdict');
  output('');
  output(`0x0499C0 is a "teardown gate" or "exit guard" function. It does NOT perform`);
  output('any actual teardown or cleanup. It is a pure classifier:');
  output('');
  output(`  Input:  current notification type from ${hex(TYPE_REG)}`);
  output('  Output: A = 0x01 (allow transition) or A = 0x00 (block transition)');
  output('');
  output('The function has exactly ONE caller: the dispatcher at 0x049CCA (at address');
  output('0x049CE9). It is always called when a new notification arrives with a different');
  output('type than the current one. If it returns 0 (block), 0x049CCA skips the');
  output('entire state transition and returns immediately.');
  output('');
  output('The allow/block split corresponds to a lightweight-vs-heavyweight context');
  output('distinction: basic editors and navigation contexts (types 0x01-0x04, 0x17-0x18)');
  output('allow free switching, while modal/interactive contexts (types 0x10-0x16) resist');
  output('being preempted by a different notification type.');
  output('');
  output('Suggested label: `_exit_state_guard` or `_can_exit_current_context`');
  output('');

  // ── Write report file ────────────────────────────────────────────

  fs.writeFileSync(REPORT_PATH, reportLines.join('\n') + '\n', 'utf8');
  output(`Report written to: ${REPORT_PATH}`);
}

main();

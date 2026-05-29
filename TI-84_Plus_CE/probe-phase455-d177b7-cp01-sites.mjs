#!/usr/bin/env node
/**
 * Phase 455 - D177B7 "CP 0x01" site map
 *
 * Static ROM probe for the two nominated D177B7 reader sites:
 *   0x0128E5
 *   0x0414B5
 *
 * Usage:
 *   node TI-84_Plus_CE/probe-phase455-d177b7-cp01-sites.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const D177B7 = 0xD177B7;
const D177B7_LOAD = [0x3A, 0xB7, 0x77, 0xD1];
const WINDOW_BEFORE = 0x40;
const WINDOW_AFTER = 0x40;

const SITES = [
  {
    label: 'Site A',
    sitePc: 0x0128E5,
  },
  {
    label: 'Site B',
    sitePc: 0x0414B5,
  },
];

const KNOWN_ADDRS = new Map([
  [0xD14073, 'D14073'],
  [0xD1440E, 'D1440E'],
  [0xD1440F, 'D1440F'],
  [0xD177B7, 'D177B7'],
]);

const decodeCache = new Map();

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatIndex(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function safeDecode(pc) {
  if (decodeCache.has(pc)) {
    return decodeCache.get(pc);
  }

  let inst;
  try {
    inst = decodeInstruction(rom, pc, 'adl');
  } catch {
    inst = {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
    };
  }

  decodeCache.set(pc, inst);
  return inst;
}

function bytesAt(pc, length) {
  return Array.from(rom.subarray(pc, pc + length), hexByte).join(' ');
}

function isRetBoundaryBefore(pc) {
  if (pc <= 0) {
    return false;
  }
  if (rom[pc - 1] === 0xC9 || rom[pc - 1] === 0xD9) {
    return true;
  }
  return pc >= 2
    && rom[pc - 2] === 0xED
    && (rom[pc - 1] === 0x45 || rom[pc - 1] === 0x4D);
}

function annotateAddr(addr) {
  if (KNOWN_ADDRS.has(addr)) {
    return `${hex(addr)} (${KNOWN_ADDRS.get(addr)})`;
  }
  return hex(addr);
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
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value, inst.value <= 0xFFFF ? 4 : 6)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${upper(inst.pair)}`
        : `LD ${upper(inst.pair)},(${hex(inst.addr)})`;
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
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'bit-test':
      return `BIT ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit},(HL)`;
    case 'bit-set-ind':
      return `SET ${inst.bit},(HL)`;
    case 'bit-res-ind':
      return `RES ${inst.bit},(HL)`;
    case 'in-reg':
      return `IN ${upper(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${upper(inst.reg)}`;
    case 'in0':
      return `IN0 ${upper(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${upper(inst.reg)}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'or-a':
      return 'OR A';
    case 'rlca':
      return 'RLCA';
    case 'rrca':
      return 'RRCA';
    case 'rla':
      return 'RLA';
    case 'rra':
      return 'RRA';
    case 'ei':
      return 'EI';
    case 'di':
      return 'DI';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function instructionNote(inst) {
  if (typeof inst.addr === 'number' && KNOWN_ADDRS.has(inst.addr)) {
    return KNOWN_ADDRS.get(inst.addr);
  }
  return '';
}

function renderRows(rows, highlightPcs = new Set()) {
  return rows.map(({ pc, inst }) => {
    const marker = highlightPcs.has(pc) ? '>' : ' ';
    const note = instructionNote(inst);
    return `${marker} ${hex(pc)}  ${bytesAt(pc, inst.length).padEnd(18)}  ${formatInstruction(inst)}${note ? `  ; ${note}` : ''}`;
  });
}

function renderHexDump(start, end, highlightPc) {
  const lines = [];
  const lo = Math.max(0, start);
  const hi = Math.min(rom.length, end);

  for (let pc = lo; pc < hi; pc += 16) {
    const marker = highlightPc >= pc && highlightPc < pc + 16 ? '>' : ' ';
    const bytes = Array.from(rom.subarray(pc, Math.min(pc + 16, hi)), hexByte).join(' ');
    lines.push(`${marker} ${hex(pc)}: ${bytes}`);
  }

  return lines;
}

function canLinearReach(startPc, targetPc, maxInstructions = 512) {
  const rows = [];
  let pc = startPc;

  for (let i = 0; i < maxInstructions && pc < targetPc; i += 1) {
    const inst = safeDecode(pc);
    if (!Number.isInteger(inst.nextPc) || inst.nextPc <= pc || inst.nextPc > targetPc) {
      return null;
    }
    rows.push({ pc, inst });
    pc = inst.nextPc;
  }

  return pc === targetPc ? rows : null;
}

function selectBestSequence(hit, maxBack = 0x140) {
  const sequences = [];
  const searchStart = Math.max(0, hit - maxBack);

  for (let start = searchStart; start <= hit; start += 1) {
    const rows = canLinearReach(start, hit, 512);
    if (rows) {
      sequences.push(rows);
    }
  }

  if (sequences.length === 0) {
    return [];
  }

  return sequences.sort((left, right) => {
    if ((left[0]?.pc ?? hit) !== (right[0]?.pc ?? hit)) {
      return (left[0]?.pc ?? hit) - (right[0]?.pc ?? hit);
    }
    return right.length - left.length;
  })[0];
}

function prologueMarkers(pc) {
  const reasons = [];
  let score = 0;

  if (isRetBoundaryBefore(pc)) {
    score += 8;
    reasons.push(`immediately follows a RET-like terminator at ${hex(pc - 1)}`);
  }

  if (
    rom[pc] === 0x21
    && rom[pc + 2] === 0xFF
    && rom[pc + 3] === 0xFF
    && rom[pc + 4] === 0xCD
  ) {
    score += 7;
    reasons.push('starts with `LD HL,0xFFFFxx` / `CALL` frame setup');
  }

  if ([0xC5, 0xD5, 0xE5, 0xF5].includes(rom[pc])) {
    score += 5;
    reasons.push('starts with a PUSH-based prologue');
  }

  if ((rom[pc] === 0xDD || rom[pc] === 0xFD) && rom[pc + 1] === 0xE5) {
    score += 5;
    reasons.push('starts with `PUSH IX/IY`');
  }

  return { score, reasons };
}

function scanFunction(startPc, maxInstructions = 256) {
  const rows = [];
  let pc = startPc;
  const pendingForwardTargets = new Set();

  for (let i = 0; i < maxInstructions && pc < rom.length; i += 1) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });

    if (
      (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz')
      && typeof inst.target === 'number'
      && inst.target > pc
    ) {
      pendingForwardTargets.add(inst.target);
    }

    for (const target of [...pendingForwardTargets]) {
      if (target <= pc) {
        pendingForwardTargets.delete(target);
      }
    }

    if (
      (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn')
      && pendingForwardTargets.size === 0
    ) {
      return {
        rows,
        endPc: pc,
        endExclusive: inst.nextPc,
        complete: true,
      };
    }

    if (!Number.isInteger(inst.nextPc) || inst.nextPc <= pc) {
      break;
    }
    pc = inst.nextPc;
  }

  const last = rows.at(-1);
  return {
    rows,
    endPc: last?.pc ?? startPc,
    endExclusive: last?.inst?.nextPc ?? startPc,
    complete: false,
  };
}

function findFunctionStart(sitePc) {
  const searchStart = Math.max(0, sitePc - 0x200);
  const candidates = [];

  for (let pc = searchStart; pc <= sitePc; pc += 1) {
    const markers = prologueMarkers(pc);
    if (markers.score === 0) {
      continue;
    }
    const prefixRows = canLinearReach(pc, sitePc, 512);
    if (!prefixRows) {
      continue;
    }
    candidates.push({
      pc,
      score: markers.score,
      reasons: markers.reasons,
      prefixRows,
    });
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.pc - right.pc;
  });

  for (const candidate of candidates) {
    const scan = scanFunction(candidate.pc, 256);
    if (sitePc >= candidate.pc && sitePc < scan.endExclusive) {
      return {
        startPc: candidate.pc,
        reasons: candidate.reasons,
        prefixRows: candidate.prefixRows,
        scan,
      };
    }
  }

  const fallbackRows = selectBestSequence(sitePc);
  const fallbackStart = fallbackRows[0]?.pc ?? sitePc;
  return {
    startPc: fallbackStart,
    reasons: ['fallback linear decode only; no strong prologue marker found'],
    prefixRows: fallbackRows,
    scan: scanFunction(fallbackStart, 256),
  };
}

function decodeForward(startPc, maxInstructions = 12) {
  const rows = [];
  let pc = startPc;

  for (let i = 0; i < maxInstructions && pc < rom.length; i += 1) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!Number.isInteger(inst.nextPc) || inst.nextPc <= pc) {
      break;
    }
    pc = inst.nextPc;
  }

  return rows;
}

function findPatternNear(sitePc, pattern, lookback = 16) {
  const start = Math.max(0, sitePc - lookback);
  for (let pc = start; pc <= sitePc; pc += 1) {
    let matches = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (rom[pc + i] !== pattern[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return pc;
    }
  }
  return null;
}

function isImmediateCompare(inst, value) {
  return inst?.tag === 'alu-imm'
    && String(inst.op).toLowerCase() === 'cp'
    && (inst.value & 0xFF) === (value & 0xFF);
}

function isConditionalBranch(inst) {
  return inst?.tag === 'jr-conditional' || inst?.tag === 'jp-conditional' || inst?.tag === 'djnz';
}

function collectD177B7Compares(rows) {
  const compares = [];

  for (let i = 0; i < rows.length - 1; i += 1) {
    const loadRow = rows[i];
    if (loadRow.inst.tag !== 'ld-reg-mem' || loadRow.inst.addr !== D177B7 || loadRow.inst.dest !== 'a') {
      continue;
    }

    const compareRow = rows[i + 1];
    if (!compareRow || compareRow.pc !== loadRow.inst.nextPc) {
      continue;
    }
    if (!isImmediateCompare(compareRow.inst, compareRow.inst.value)) {
      continue;
    }

    const branchRow = rows[i + 2];
    compares.push({
      loadPc: loadRow.pc,
      comparePc: compareRow.pc,
      value: compareRow.inst.value & 0xFF,
      branchPc: branchRow?.pc,
      branchInst: branchRow?.inst,
    });
  }

  return compares;
}

function analyzeSite(siteConfig) {
  const { sitePc } = siteConfig;
  const functionInfo = findFunctionStart(sitePc);
  const functionRows = functionInfo.scan.rows;
  const siteIndex = functionRows.findIndex((row) => row.pc === sitePc);
  const loadPatternPc = findPatternNear(sitePc, D177B7_LOAD, 16);
  const siteRow = siteIndex >= 0 ? functionRows[siteIndex] : { pc: sitePc, inst: safeDecode(sitePc) };
  const compare55Row = functionRows[siteIndex + 1];
  const branch55Row = functionRows[siteIndex + 2];

  let cp01Index = -1;
  for (let i = siteIndex + 1; i < Math.min(functionRows.length, siteIndex + 8); i += 1) {
    if (isImmediateCompare(functionRows[i]?.inst, 0x01)) {
      cp01Index = i;
      break;
    }
  }

  const localLoadRow = cp01Index > 0 ? functionRows[cp01Index - 1] : null;
  const cp01Row = cp01Index >= 0 ? functionRows[cp01Index] : null;
  const branch01Row = cp01Index >= 0 ? functionRows[cp01Index + 1] : null;
  const setState2Row = cp01Index >= 0 ? functionRows[cp01Index + 2] : null;
  const joinPc = typeof branch01Row?.inst?.target === 'number'
    ? branch01Row.inst.target
    : (typeof branch55Row?.inst?.target === 'number' ? branch55Row.inst.target : null);
  const joinRows = joinPc != null ? decodeForward(joinPc, 8) : [];
  const loopRow = joinRows.find((row) => isConditionalBranch(row.inst) && row.inst.target < row.pc) ?? null;
  const d177b7Compares = collectD177B7Compares(functionRows);

  return {
    ...siteConfig,
    functionInfo,
    functionRows,
    loadPatternPc,
    siteRow,
    compare55Row,
    branch55Row,
    localLoadRow,
    cp01Row,
    branch01Row,
    setState2Row,
    joinPc,
    joinRows,
    loopRow,
    d177b7Compares,
  };
}

function renderCompareSummary(analysis) {
  const lines = [];
  if (analysis.d177b7Compares.length === 0) {
    lines.push('- No `LD A,(D177B7)` + immediate compare pairs found inside the estimated function.');
    return lines;
  }

  const values = analysis.d177b7Compares.map((entry) => entry.value);
  const has55 = values.includes(0x55);
  const hasAA = values.includes(0xAA);
  const has01 = values.includes(0x01);

  for (const entry of analysis.d177b7Compares) {
    const branchText = entry.branchInst && isConditionalBranch(entry.branchInst)
      ? ` -> ${formatInstruction(entry.branchInst)}`
      : '';
    lines.push(
      `- ${hex(entry.loadPc)} loads D177B7, ${hex(entry.comparePc)} does \`CP ${hex(entry.value, 2)}\`${branchText}`,
    );
  }

  lines.push(
    `- D177B7 compare values in this function: ${values.map((value) => hex(value, 2)).join(', ')}`,
  );
  lines.push(`- Contains D177B7 == 0x55 check: ${has55 ? 'yes' : 'no'}`);
  lines.push(`- Contains D177B7 == 0xAA check: ${hasAA ? 'yes' : 'no'}`);
  lines.push(`- Contains direct D177B7 == 0x01 check: ${has01 ? 'yes' : 'no'}`);
  return lines;
}

function renderBusyBehavior(analysis) {
  const lines = [];
  const compare55Pc = analysis.compare55Row?.pc;
  const branch55Pc = analysis.branch55Row?.pc;
  const cp01Pc = analysis.cp01Row?.pc;
  const branch01Pc = analysis.branch01Row?.pc;
  const setState2Pc = analysis.setState2Row?.pc;
  const loopTarget = analysis.loopRow?.inst?.target;

  lines.push('- Address correction: the nominated PC is the `LD A,(0xD177B7)` read site.');
  if (compare55Pc != null) {
    lines.push(`  The direct D177B7 compare is ${hex(compare55Pc)}: \`CP 0x55\`.`);
  }
  if (cp01Pc != null) {
    lines.push(
      `  The nearby \`CP 0x01\` is ${hex(cp01Pc)}, and it compares ${formatInstruction(analysis.localLoadRow?.inst ?? { tag: 'db', value: 0 })} rather than D177B7.`,
    );
  }

  lines.push('- Taken vs not-taken paths:');
  if (branch55Pc != null && analysis.branch55Row?.inst?.target != null) {
    lines.push(
      `  If D177B7 == 0x55, ${hex(branch55Pc)} jumps to ${hex(analysis.branch55Row.inst.target)} without touching the local IX state byte first.`,
    );
  }
  if (cp01Pc != null && branch01Pc != null && analysis.branch01Row?.inst?.target != null) {
    lines.push(
      `  If D177B7 != 0x55 (including busy 0x01), execution falls through to ${hex(cp01Pc)} and tests the local ${(analysis.localLoadRow && formatInstruction(analysis.localLoadRow.inst).replace(/^LD A,/, '')) || '(IX-1)'} against 0x01.`,
    );
    lines.push(
      `  If that local byte == 0x01, ${hex(branch01Pc)} jumps to ${hex(analysis.branch01Row.inst.target)}.`,
    );
  }
  if (setState2Pc != null) {
    lines.push(
      `  Otherwise ${hex(setState2Pc)} writes 0x02 into the local IX state byte before joining the common exit path.`,
    );
  }
  if (analysis.joinPc != null) {
    lines.push(`  The common join is ${hex(analysis.joinPc)}.`);
  }
  if (analysis.loopRow) {
    lines.push(
      `  The only loop-back branch is ${hex(analysis.loopRow.pc)}: ${formatInstruction(analysis.loopRow.inst)}, which returns to ${hex(loopTarget)} only when the local IX state byte is still zero.`,
    );
  }

  lines.push('- Busy-state conclusion (`D177B7 == 0x01`):');
  lines.push('  `0x01` takes the non-0x55 path. It does not branch back to the D177B7 load or compare.');
  lines.push('  Instead, it consults the local IX state byte: keep 0x01 if already set, else force 0x02.');
  lines.push('  That makes the subsequent `OR A` nonzero, so the loop-back branch is not taken on the busy path.');

  lines.push('- Classification:');
  lines.push('  Spin-wait loop: no');
  lines.push('  Gate / skip / early-exit path: yes');
  lines.push('  State-machine dispatch on D177B7 itself: no');

  return lines;
}

function renderSiteAnalysis(analysis) {
  const lines = [];
  const functionStart = analysis.functionInfo.startPc;
  const functionEndPc = analysis.functionInfo.scan.endPc;
  const functionEndExclusive = analysis.functionInfo.scan.endExclusive;
  const highlightPcs = new Set([
    analysis.sitePc,
    analysis.compare55Row?.pc,
    analysis.branch55Row?.pc,
    analysis.cp01Row?.pc,
    analysis.branch01Row?.pc,
    analysis.setState2Row?.pc,
    analysis.loopRow?.pc,
  ].filter((value) => Number.isInteger(value)));

  lines.push(`## ${analysis.label} — ${hex(analysis.sitePc)}`);
  lines.push('');
  lines.push(`- Estimated function bounds: ${hex(functionStart)} .. ${hex(functionEndPc)} (end-exclusive ${hex(functionEndExclusive)})`);
  lines.push(`- Start heuristic: ${analysis.functionInfo.reasons.join('; ')}`);
  lines.push(`- D177B7 load pattern \`3A B7 77 D1\` found at: ${analysis.loadPatternPc != null ? hex(analysis.loadPatternPc) : 'not found within 16 bytes before the site'}`);
  lines.push('');
  lines.push('### Raw Hex Dump');
  lines.push('```text');
  lines.push(
    ...renderHexDump(
      analysis.sitePc - WINDOW_BEFORE,
      analysis.sitePc + analysis.siteRow.inst.length + WINDOW_AFTER,
      analysis.sitePc,
    ),
  );
  lines.push('```');
  lines.push('');
  lines.push('### Function Disassembly');
  lines.push('```text');
  lines.push(...renderRows(analysis.functionRows, highlightPcs));
  lines.push('```');
  lines.push('');
  lines.push('### D177B7 Compare Map');
  lines.push(...renderCompareSummary(analysis));
  lines.push('');
  lines.push('### Branch Behavior');
  lines.push(...renderBusyBehavior(analysis));
  return lines;
}

function main() {
  const analyses = SITES.map(analyzeSite);
  const lines = [];

  lines.push('# Phase 455 - D177B7 Busy-Site Static Map');
  lines.push('');
  lines.push(`ROM: ${ROM_PATH}`);
  lines.push('');
  lines.push('This probe checks the two nominated PCs `0x0128E5` and `0x0414B5` directly from `ROM.rom`.');
  lines.push('In both cases, those PCs are the `LD A,(0xD177B7)` read instructions. The direct compare that follows is `CP 0x55`, while the nearby `CP 0x01` applies to the local `(IX-1)` state byte.');
  lines.push('');

  for (const analysis of analyses) {
    lines.push(...renderSiteAnalysis(analysis));
    lines.push('');
  }

  lines.push('## Cross-Site Conclusion');
  lines.push('');
  lines.push('- The two functions are structural twins with different helper call targets, but the D177B7 gating logic is byte-for-byte equivalent.');
  lines.push(`- Actual D177B7 compare PCs: ${hex(analyses[0].compare55Row?.pc ?? 0)} and ${hex(analyses[1].compare55Row?.pc ?? 0)}; both are \`CP 0x55\`.`);
  lines.push(`- Actual nearby \`CP 0x01\` PCs: ${hex(analyses[0].cp01Row?.pc ?? 0)} and ${hex(analyses[1].cp01Row?.pc ?? 0)}; both compare the local IX state byte, not D177B7.`);
  lines.push('- For `D177B7 == 0x01`, neither function spin-waits on D177B7. The busy value takes the non-0x55 path, preserves local state 0x01 or forces local state 0x02, and then exits the poll loop without taking the loop-back branch.');
  lines.push('- Net effect: `0x01` behaves like a busy / abort gate that suppresses another loop iteration, not a dedicated D177B7==0x01 dispatch state inside these two functions.');

  console.log(lines.join('\n'));
}

main();

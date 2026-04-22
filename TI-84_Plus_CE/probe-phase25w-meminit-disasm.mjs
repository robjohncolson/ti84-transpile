#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase25w-meminit-disasm-report.md');

const ADL_MODE = 'adl';
const rom = fs.readFileSync(ROM_PATH);
const decoderSource = fs.readFileSync(path.join(__dirname, 'ez80-decoder.js'), 'utf8');
const { decodeInstruction } = await import(
  `data:text/javascript;base64,${Buffer.from(decoderSource).toString('base64')}`,
);

const SYMBOLS = new Map([
  [0xd005f8, 'OP1'],
  [0xd005f9, 'OP1+1'],
  [0xd005fa, 'OP1M'],
  [0xd005fe, 'OP1+6'],
  [0xd02587, 'tempMem'],
  [0xd0258a, 'FPSbase'],
  [0xd0258d, 'FPS'],
  [0xd02590, 'OPBase'],
  [0xd02593, 'OPS'],
  [0xd02596, 'pTempCnt'],
  [0xd0259a, 'pTemp'],
  [0xd0259d, 'progPtr'],
  [0xd025a0, 'newDataPtr'],
  [0xd1a881, 'userMem'],
]);

const KNOWN_TARGETS = new Map([
  [0x09dee0, 'MEM_INIT entry'],
  [0x0820ed, '9-byte pointer shrink wrapper'],
  [0x0820f1, 'generic pointer shrink helper'],
  [0x07f7bd, 'helper 0x07F7BD'],
  [0x080080, 'slot/length selector'],
  [0x08012d, 'helper 0x08012D'],
  [0x08a98f, 'helper 0x08A98F'],
  [0x08a9cf, 'helper 0x08A9CF'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function bytesFor(pc, length) {
  return Array.from(
    rom.slice(pc, pc + length),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function symbolFor(addr) {
  return SYMBOLS.get(addr) || '';
}

function targetNameFor(addr) {
  return KNOWN_TARGETS.get(addr) || '';
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'ei': text = 'ei'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldir': text = 'ldir'; break;
    case 'ldd': text = 'ldd'; break;
    case 'lddr': text = 'lddr'; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    default: {
      const detail = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(key)) {
          continue;
        }
        detail.push(`${key}=${typeof value === 'number' ? hex(value) : value}`);
      }
      text = detail.length > 0 ? `${inst.tag} ${detail.join(' ')}` : inst.tag;
      break;
    }
  }

  return `${prefix}${text}`;
}

function commentFor(inst) {
  const notes = [];

  if (Number.isInteger(inst.addr)) {
    const symbol = symbolFor(inst.addr);
    if (symbol) notes.push(symbol);
  }

  if (Number.isInteger(inst.target)) {
    const target = targetNameFor(inst.target);
    if (target) notes.push(target);
  }

  if (Number.isInteger(inst.value)) {
    const symbol = symbolFor(inst.value);
    if (symbol) notes.push(symbol);
  }

  return notes.length > 0 ? ` ; ${notes.join(' / ')}` : '';
}

function decodeAt(pc) {
  const inst = decodeInstruction(rom, pc, ADL_MODE);
  if (!inst || inst.length <= 0) {
    throw new Error(`Decode failed at ${hex(pc)}`);
  }
  return inst;
}

function disasmRange(startAddr, endExclusive) {
  const rows = [];
  let pc = startAddr;

  while (pc < endExclusive) {
    const inst = decodeAt(pc);
    rows.push({
      pc: inst.pc,
      inst,
      bytes: bytesFor(inst.pc, inst.length),
      text: formatInstruction(inst),
      comment: commentFor(inst),
    });
    pc += inst.length;
  }

  return rows;
}

function disasmUntilRet(startAddr, maxBytes = 0x80) {
  const rows = [];
  let pc = startAddr;
  const end = Math.min(rom.length, startAddr + maxBytes);

  while (pc < end) {
    const inst = decodeAt(pc);
    rows.push({
      pc: inst.pc,
      inst,
      bytes: bytesFor(inst.pc, inst.length),
      text: formatInstruction(inst),
      comment: commentFor(inst),
    });
    pc += inst.length;
    if (inst.tag === 'ret') break;
  }

  return rows;
}

function renderRows(lines, title, rows) {
  lines.push(title);
  lines.push('```text');
  for (const row of rows) {
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.comment}`);
  }
  lines.push('```');
  lines.push('');
}

function instructionCannotFallThrough(inst) {
  if (inst.tag === 'call' || inst.tag === 'call-conditional') return false;
  if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jr') return true;
  return Boolean(inst.terminates) && !('fallthrough' in inst);
}

function findEntryPoint(rows, anchorPc) {
  let boundary = null;

  for (const row of rows) {
    if (row.pc >= anchorPc) break;
    if (instructionCannotFallThrough(row.inst)) {
      boundary = row;
    }
  }

  const entry = boundary
    ? rows.find((row) => row.pc === boundary.pc + boundary.inst.length)
    : rows[0];

  return { boundary, entry };
}

function instructionTouchesHL(inst) {
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') return true;
  if (inst.tag === 'ld-pair-mem' && inst.pair === 'hl' && inst.direction === 'from-mem') return true;
  if (inst.tag === 'pop' && inst.pair === 'hl') return true;
  if (inst.tag === 'ex-de-hl') return true;
  if (inst.tag === 'inc-pair' && inst.pair === 'hl') return true;
  if (inst.tag === 'dec-pair' && inst.pair === 'hl') return true;
  if (inst.tag === 'add-pair' && inst.dest === 'hl') return true;
  if (inst.tag === 'sbc-pair' || inst.tag === 'adc-pair') return true;
  if (inst.tag === 'inc-reg' && (inst.reg === 'h' || inst.reg === 'l')) return true;
  if (inst.tag === 'dec-reg' && (inst.reg === 'h' || inst.reg === 'l')) return true;
  if (inst.tag === 'ld-reg-imm' && (inst.dest === 'h' || inst.dest === 'l')) return true;
  if (inst.tag === 'ld-reg-reg' && (inst.dest === 'h' || inst.dest === 'l')) return true;
  if (inst.tag === 'ld-reg-mem' && (inst.dest === 'h' || inst.dest === 'l')) return true;
  if (inst.tag === 'ld-reg-ind' && (inst.dest === 'h' || inst.dest === 'l')) return true;
  return false;
}

function traceHLState(rows, entryPc, stopPc) {
  let state = null;

  for (const row of rows) {
    if (row.pc < entryPc) continue;
    if (row.pc >= stopPc) break;

    const inst = row.inst;
    if (!instructionTouchesHL(inst)) continue;

    if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
      state = {
        kind: 'imm',
        value: inst.value,
        sourcePc: row.pc,
      };
      continue;
    }

    if (inst.tag === 'ld-pair-mem' && inst.pair === 'hl' && inst.direction === 'from-mem') {
      state = {
        kind: 'mem',
        addr: inst.addr,
        sourcePc: row.pc,
      };
      continue;
    }

    state = {
      kind: 'unknown',
      sourcePc: row.pc,
      reason: row.text,
    };
  }

  return state;
}

function explainHLState(state) {
  if (!state) return 'unknown';
  if (state.kind === 'imm') {
    const symbol = symbolFor(state.value);
    return symbol
      ? `${hex(state.value)} (${symbol}), loaded at ${hex(state.sourcePc)}`
      : `${hex(state.value)}, loaded at ${hex(state.sourcePc)}`;
  }
  if (state.kind === 'mem') {
    const symbol = symbolFor(state.addr);
    return symbol
      ? `value loaded from ${hex(state.addr)} (${symbol}) at ${hex(state.sourcePc)}`
      : `value loaded from ${hex(state.addr)} at ${hex(state.sourcePc)}`;
  }
  return `unknown after ${hex(state.sourcePc)} (${state.reason})`;
}

function findDirectCallers(rangeStart, rangeEndInclusive) {
  const hits = [];

  for (let pc = 0; pc <= rom.length - 4; pc++) {
    const op = rom[pc];
    if (op !== 0xcd && op !== 0xc3) continue;
    const target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    if (target < rangeStart || target > rangeEndInclusive) continue;
    hits.push({
      pc,
      op,
      target,
      mnemonic: op === 0xcd ? 'call' : 'jp',
    });
  }

  return hits;
}

function classify0820Helper() {
  return [
    `${hex(0x0820ed)} is not a reset routine. It is a 9-byte wrapper that seeds BC = 0x000009 and then falls into the generic helper at ${hex(0x0820f1)}.`,
    `${hex(0x0820f1)} subtracts BC from OPBase immediately, then conditionally subtracts the same span from pTemp and progPtr depending on the OP1+6 type byte and helper calls at ${hex(0x07f7bd)}, ${hex(0x08012d)}, and ${hex(0x080080)}.`,
    `The continuation at ${hex(0x082133)} also rewrites OPS and then performs block movement with LDIR, so this is a compaction/delete helper that shrinks live allocator pointers after removing a record, not a boot-time initializer.`,
    `Direct entry xrefs reinforce that split: ${hex(0x08237a)} calls the 9-byte wrapper ${hex(0x0820ed)}, while ${hex(0x082340)} and ${hex(0x0848ac)} call the generic BC-sized helper at ${hex(0x0820f1)}.`,
  ];
}

function buildConsoleOutput(data) {
  const lines = [];

  lines.push('Phase 25W MEM_INIT static disassembly');
  lines.push(`ROM: ${ROM_PATH}`);
  lines.push('');
  lines.push(`Main window: ${hex(data.mainWindow.start)}..${hex(data.mainWindow.displayEnd)}`);
  lines.push(`Boundary before MEM_INIT: ${data.memInitBoundary ? `${hex(data.memInitBoundary.pc)} ${data.memInitBoundary.text}` : 'not found in decode window'}`);
  lines.push(`MEM_INIT entry point: ${hex(data.memInitEntry.pc)}`);
  lines.push(`HL at FPSbase store ${hex(0x09dee8)}: ${data.hlAtFpsbase}`);
  lines.push(`HL at FPS store ${hex(0x09deec)}: ${data.hlAtFps}`);
  lines.push(`Direct CALL/JP xrefs into ${hex(data.mainWindow.start)}..${hex(data.mainWindow.displayEnd)}: ${data.callers.length}`);
  for (const caller of data.callers) {
    lines.push(`- ${hex(caller.pc)}: ${caller.mnemonic} ${hex(caller.target)}`);
  }
  lines.push('');

  renderRows(lines, `Main disassembly ${hex(data.mainWindow.start)}..${hex(data.mainWindow.displayEnd)}`, data.mainRows);
  renderRows(lines, `MEM_INIT continuation ${hex(data.memInitEntry.pc)}..${hex(data.memInitRoutineEnd)}`, data.memInitRoutineRows);
  renderRows(lines, `Caller context ${hex(data.callerContext.start)}..${hex(data.callerContext.end - 1)}`, data.callerRows);

  lines.push(`Secondary window: ${hex(data.secondaryWindow.start)}..${hex(data.secondaryWindow.displayEnd)}`);
  lines.push(`Boundary before secondary helper: ${data.secondaryBoundary ? `${hex(data.secondaryBoundary.pc)} ${data.secondaryBoundary.text}` : 'not found in decode window'}`);
  lines.push(`Secondary helper entry point: ${hex(data.secondaryEntry.pc)}`);
  lines.push('');

  renderRows(lines, `Secondary disassembly ${hex(data.secondaryWindow.start)}..${hex(data.secondaryWindow.displayEnd)}`, data.secondaryRows);
  renderRows(lines, `Secondary continuation ${hex(data.secondaryExtended.start)}..${hex(data.secondaryExtended.end - 1)}`, data.secondaryExtendedRows);

  lines.push('Secondary helper analysis');
  for (const bullet of data.secondaryAnalysis) {
    lines.push(`- ${bullet}`);
  }

  return lines.join('\n');
}

function buildReport(data, consoleOutput) {
  const lines = [];

  lines.push('# Phase 25W - MEM_INIT disassembly');
  lines.push('');
  lines.push('Generated by `probe-phase25w-meminit-disasm.mjs` from direct `ROM.rom` byte reads using `decodeInstruction(..., "adl")`.');
  lines.push('');
  lines.push('## Direct answers');
  lines.push('');
  lines.push(`- Entry point for the MEM_INIT block: ${hex(data.memInitEntry.pc)}. The immediately preceding instruction at ${hex(data.memInitBoundary.pc)} is an unconditional \`${data.memInitBoundary.text}\`, so control cannot fall through from the previous routine.`);
  lines.push(`- HL for the FPSbase/FPS writes is statically determined as ${data.hlAtFpsbase}. The same HL value is reused for \`tempMem\`, \`FPSbase\`, \`FPS\`, and \`newDataPtr\` before HL is reloaded with ${hex(0xd3ffff)}.`);
  lines.push(`- Additional initialization before those stores is not part of the same routine. The decode window shows a hard boundary at ${hex(data.memInitBoundary.pc)}, so the pointer stores start a fresh routine rather than continuing the earlier setup code at ${hex(data.mainWindow.start)}..${hex(data.memInitBoundary.pc)}.`);
  lines.push(`- Direct CALL/JP references into ${hex(data.mainWindow.start)}..${hex(data.mainWindow.displayEnd)}: ${data.callers.length === 0 ? 'none' : data.callers.map((caller) => `\`${hex(caller.pc)}: ${caller.mnemonic} ${hex(caller.target)}\``).join(', ')}.`);
  lines.push('');
  lines.push('## Secondary cluster at 0x0820FA');
  lines.push('');
  for (const bullet of data.secondaryAnalysis) {
    lines.push(`- ${bullet}`);
  }
  lines.push('');
  lines.push('## Full disassembly listing');
  lines.push('');
  lines.push(`### Main window ${hex(data.mainWindow.start)}..${hex(data.mainWindow.displayEnd)}`);
  lines.push('');
  lines.push('```text');
  for (const row of data.mainRows) {
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.comment}`);
  }
  lines.push('```');
  lines.push('');
  lines.push(`### MEM_INIT continuation from ${hex(data.memInitEntry.pc)} to RET at ${hex(data.memInitRoutineEnd)}`);
  lines.push('');
  lines.push('```text');
  for (const row of data.memInitRoutineRows) {
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.comment}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('### Direct caller context around 0x09DD62');
  lines.push('');
  lines.push('```text');
  for (const row of data.callerRows) {
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.comment}`);
  }
  lines.push('```');
  lines.push('');
  lines.push(`### Secondary window ${hex(data.secondaryWindow.start)}..${hex(data.secondaryWindow.displayEnd)}`);
  lines.push('');
  lines.push('```text');
  for (const row of data.secondaryRows) {
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.comment}`);
  }
  lines.push('```');
  lines.push('');
  lines.push(`### Secondary continuation ${hex(data.secondaryExtended.start)}..${hex(data.secondaryExtended.end - 1)}`);
  lines.push('');
  lines.push('```text');
  for (const row of data.secondaryExtendedRows) {
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.comment}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Full console output');
  lines.push('');
  lines.push('```text');
  lines.push(consoleOutput);
  lines.push('```');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function main() {
  const mainWindow = { start: 0x09de80, end: 0x09df12, displayEnd: 0x09df10 };
  const mainRows = disasmRange(mainWindow.start, mainWindow.end);
  const memInitAnchor = 0x09dee9;
  const { boundary: memInitBoundary, entry: memInitEntry } = findEntryPoint(mainRows, memInitAnchor);
  const memInitRoutineRows = disasmUntilRet(memInitEntry.pc, 0x80);
  const memInitRoutineEnd = memInitRoutineRows[memInitRoutineRows.length - 1].pc;
  const hlAtFpsbase = explainHLState(traceHLState(memInitRoutineRows, memInitEntry.pc, 0x09dee8));
  const hlAtFps = explainHLState(traceHLState(memInitRoutineRows, memInitEntry.pc, 0x09deec));
  const callers = findDirectCallers(mainWindow.start, mainWindow.end - 1);

  const callerContext = { start: 0x09dd54, end: 0x09dd80 };
  const callerRows = disasmRange(callerContext.start, callerContext.end);

  const secondaryWindow = { start: 0x0820f0, end: 0x082122, displayEnd: 0x082120 };
  const secondaryRows = disasmRange(secondaryWindow.start, secondaryWindow.end);
  const secondaryContextRows = disasmRange(0x0820e0, 0x082160);
  const { boundary: secondaryBoundary, entry: secondaryEntry } = findEntryPoint(secondaryContextRows, 0x0820fa);
  const secondaryExtended = { start: 0x0820ed, end: 0x082151 };
  const secondaryExtendedRows = disasmRange(secondaryExtended.start, secondaryExtended.end);
  const secondaryAnalysis = classify0820Helper();

  const data = {
    mainWindow,
    mainRows,
    memInitBoundary,
    memInitEntry,
    memInitRoutineRows,
    memInitRoutineEnd,
    hlAtFpsbase,
    hlAtFps,
    callers,
    callerContext,
    callerRows,
    secondaryWindow,
    secondaryRows,
    secondaryBoundary,
    secondaryEntry,
    secondaryExtended,
    secondaryExtendedRows,
    secondaryAnalysis,
  };

  const consoleOutput = buildConsoleOutput(data);
  const report = buildReport(data, consoleOutput);

  fs.writeFileSync(REPORT_PATH, report);
  console.log(consoleOutput);
}

main();

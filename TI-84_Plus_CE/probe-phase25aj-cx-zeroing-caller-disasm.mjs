#!/usr/bin/env node

/**
 * Phase 25AJ — Static disassembly: 0x05E820 (caller of cx-zeroing LDDR)
 *
 * Section A: Disassemble 0x05E800–0x05E900 (256 bytes around the CALL 0x0831A4 at 0x05E836)
 *            Identify function boundary, all CALL targets, cx-range refs, IY flag ops
 * Section B: Disassemble the zeroing function 0x0831A4–0x083230
 *            Understand what arguments it expects (registers/stack)
 * Section C: Scan full ROM for CALL 0x0831A4 — find ALL callers of the zeroing function
 *            For each caller, show surrounding context
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH     = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH  = path.join(__dirname, 'phase25aj-cx-zeroing-caller-disasm-report.md');

const ADL_MODE = 'adl';

// ── Known addresses ────────────────────────────────────────────────────────
const CALLER_FUNC_ADDR  = 0x05E820;  // Function containing the CALL to zeroing
const CALL_SITE_ADDR    = 0x05E836;  // CALL 0x0831A4 site
const ZEROING_FUNC_ADDR = 0x0831A4;  // The function that does the LDDR zeroing
const LDDR_ADDR         = 0x08321B;  // LDDR instruction inside zeroing func
const CX_RANGE_START    = 0xD007CA;  // cxMain start
const CX_RANGE_END      = 0xD007E1;  // cxCurApp end

// ── Decoder loader ─────────────────────────────────────────────────────────

async function loadDecoder() {
  const src = fs.readFileSync(DECODER_PATH, 'utf8');
  const url = `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
  return import(url);
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesStr(buffer, pc, length) {
  return Array.from(buffer.slice(pc, pc + length), v =>
    v.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function fmtInst(inst) {
  const d = v => (v >= 0 ? `+${v}` : `${v}`);
  const pfx = inst.modePrefix ? `${inst.modePrefix} ` : '';

  let t = inst.tag;
  switch (inst.tag) {
    case 'nop':           t = 'nop'; break;
    case 'ei':            t = 'ei'; break;
    case 'di':            t = 'di'; break;
    case 'halt':          t = 'halt'; break;
    case 'ret':           t = 'ret'; break;
    case 'ret-conditional': t = `ret ${inst.condition}`; break;
    case 'retn':          t = 'retn'; break;
    case 'reti':          t = 'reti'; break;
    case 'call':          t = `call ${hex(inst.target)}`; break;
    case 'call-conditional': t = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp':            t = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': t = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect':   t = `jp (${inst.indirectRegister})`; break;
    case 'jr':            t = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': t = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz':          t = `djnz ${hex(inst.target)}`; break;
    case 'rst':           t = `rst ${hex(inst.target)}`; break;
    case 'push':          t = `push ${inst.pair}`; break;
    case 'pop':           t = `pop ${inst.pair}`; break;
    case 'ex-af':         t = "ex af, af'"; break;
    case 'ex-de-hl':      t = 'ex de, hl'; break;
    case 'ex-sp-pair':    t = `ex (sp), ${inst.pair}`; break;
    case 'exx':           t = 'exx'; break;
    case 'ld-pair-imm':   t = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      t = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`; break;
    case 'ld-mem-pair':   t = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm':    t = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem':    t = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg':    t = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind':    t = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg':    t = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg':    t = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ixd':    t = `ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ld-ixd-reg':    t = `ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm':    t = `ld (${inst.indexRegister}${d(inst.displacement)}), ${hex(inst.value, 2)}`; break;
    case 'ld-sp-pair':    t = `ld sp, ${inst.src}`; break;
    case 'ld-a-ind-bc':   t = 'ld a, (bc)'; break;
    case 'ld-a-ind-de':   t = 'ld a, (de)'; break;
    case 'ld-ind-bc-a':   t = 'ld (bc), a'; break;
    case 'ld-ind-de-a':   t = 'ld (de), a'; break;
    case 'inc-pair':      t = `inc ${inst.pair}`; break;
    case 'dec-pair':      t = `dec ${inst.pair}`; break;
    case 'inc-reg':       t = `inc ${inst.reg}`; break;
    case 'dec-reg':       t = `dec ${inst.reg}`; break;
    case 'inc-ind':       t = `inc (${inst.indirectRegister})`; break;
    case 'dec-ind':       t = `dec (${inst.indirectRegister})`; break;
    case 'add-pair':      t = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg':       t = `${inst.op} ${inst.src}`; break;
    case 'alu-imm':       t = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'alu-ind':       t = `${inst.op} (${inst.indirectRegister})`; break;
    case 'sbc-pair':      t = `sbc hl, ${inst.src}`; break;
    case 'adc-pair':      t = `adc hl, ${inst.src}`; break;
    case 'bit-test':      t = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind':  t = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-res':       t = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind':   t = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-set':       t = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind':   t = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'indexed-cb-bit': t = `bit ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-res': t = `res ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-set': t = `set ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ldir': t = 'ldir'; break;
    case 'lddr': t = 'lddr'; break;
    case 'ldi':  t = 'ldi'; break;
    case 'ldd':  t = 'ldd'; break;
    case 'cpir': t = 'cpir'; break;
    case 'cpdr': t = 'cpdr'; break;
    case 'cpi':  t = 'cpi'; break;
    case 'cpd':  t = 'cpd'; break;
    case 'neg':  t = 'neg'; break;
    case 'cpl':  t = 'cpl'; break;
    case 'ccf':  t = 'ccf'; break;
    case 'scf':  t = 'scf'; break;
    case 'daa':  t = 'daa'; break;
    case 'rla':  t = 'rla'; break;
    case 'rra':  t = 'rra'; break;
    case 'rlca': t = 'rlca'; break;
    case 'rrca': t = 'rrca'; break;
    case 'mlt':  t = `mlt ${inst.reg}`; break;
    case 'tst-reg': t = `tst a, ${inst.reg}`; break;
    case 'tst-ind': t = 'tst a, (hl)'; break;
    case 'tst-imm': t = `tst a, ${hex(inst.value, 2)}`; break;
    case 'lea':  t = `lea ${inst.dest}, ${inst.base}${d(inst.displacement)}`; break;
    case 'rotate': t = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': t = `${inst.op} (${inst.indirectRegister})`; break;
    case 'indexed-cb-rotate': t = `${inst.op} (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'in-a-imm':  t = `in a, (${hex(inst.port, 2)})`; break;
    case 'out-imm-a': t = `out (${hex(inst.port, 2)}), a`; break;
    case 'in-reg':    t = `in ${inst.dest}, (c)`; break;
    case 'out-reg':   t = `out (c), ${inst.src}`; break;
    case 'im':        t = `im ${inst.mode_num}`; break;
    case 'ld-i-a':  t = 'ld i, a'; break;
    case 'ld-a-i':  t = 'ld a, i'; break;
    case 'ld-r-a':  t = 'ld r, a'; break;
    case 'ld-a-r':  t = 'ld a, r'; break;
    default: {
      const skip = new Set(['pc','length','nextPc','tag','mode','modePrefix','terminates','fallthrough']);
      const parts = Object.entries(inst)
        .filter(([k]) => !skip.has(k))
        .map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v) : v}`);
      t = parts.length ? `${inst.tag} ${parts.join(' ')}` : inst.tag;
    }
  }
  return `${pfx}${t}`;
}

// ── Core disassembly ───────────────────────────────────────────────────────

function disassemble(buffer, decode, startAddr, byteCount) {
  const rows = [];
  let pc = startAddr;
  const end = startAddr + byteCount;

  while (pc < end) {
    const inst = decode(buffer, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      rows.push({ pc, bytes: bytesStr(buffer, pc, 1), text: `DB ${hex(buffer[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }
    rows.push({ pc: inst.pc, bytes: bytesStr(buffer, inst.pc, inst.length), text: fmtInst(inst), inst });
    pc += inst.length;
  }
  return rows;
}

// Walk backward from addr to find the most recent RET (function boundary heuristic).
function findFunctionStart(buffer, decode, addr, maxBack = 256) {
  const start = Math.max(0, addr - maxBack);
  const rows  = disassemble(buffer, decode, start, addr - start);

  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (!r.inst) continue;
    if (r.inst.tag === 'ret' || r.inst.tag === 'ret-conditional' ||
        r.inst.tag === 'retn' || r.inst.tag === 'reti') {
      const nextIdx = i + 1;
      return nextIdx < rows.length ? rows[nextIdx].pc : addr;
    }
  }
  return start;
}

// ── Annotation helpers ─────────────────────────────────────────────────────

function annotateInst(inst) {
  if (!inst) return [];
  const notes = [];

  // CALL / JP targets
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    notes.push(`-> CALL ${hex(inst.target)}`);
    if (inst.target === ZEROING_FUNC_ADDR) notes.push('*** CALLS ZEROING FUNCTION ***');
  }
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    notes.push(`-> JP ${hex(inst.target)}`);
  }
  if (inst.tag === 'jp-indirect') {
    notes.push(`-> JP (${inst.indirectRegister})`);
  }

  // cx-range address references (direct loads/stores)
  const checkAddr = (a) => {
    if (a >= CX_RANGE_START && a <= CX_RANGE_END) {
      const offset = a - CX_RANGE_START;
      notes.push(`*** cx-range ref: offset +${offset} from cxMain (${hex(a)}) ***`);
    }
  };

  if (inst.addr !== undefined) checkAddr(inst.addr);
  if (inst.value !== undefined && inst.value >= CX_RANGE_START && inst.value <= CX_RANGE_END) {
    checkAddr(inst.value);
  }

  // IY flag operations
  if (inst.indexRegister === 'iy') {
    if (inst.tag === 'indexed-cb-set') {
      notes.push(`IY flag: SET ${inst.bit},(IY+${inst.displacement})`);
    } else if (inst.tag === 'indexed-cb-res') {
      notes.push(`IY flag: RES ${inst.bit},(IY+${inst.displacement})`);
    } else if (inst.tag === 'indexed-cb-bit') {
      notes.push(`IY flag: BIT ${inst.bit},(IY+${inst.displacement})`);
    } else if (inst.tag === 'ld-reg-ixd') {
      notes.push(`IY read: LD ${inst.dest},(IY+${inst.displacement})`);
    } else if (inst.tag === 'ld-ixd-reg') {
      notes.push(`IY write: LD (IY+${inst.displacement}),${inst.src}`);
    } else if (inst.tag === 'ld-ixd-imm') {
      notes.push(`IY write: LD (IY+${inst.displacement}),imm`);
    }
  }

  // RAM writes
  if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000 && inst.addr <= 0xDFFFFF) {
    notes.push(`RAM write: (${hex(inst.addr)})`);
  }
  if (inst.tag === 'ld-mem-pair' && inst.addr >= 0xD00000 && inst.addr <= 0xDFFFFF) {
    notes.push(`RAM write pair: (${hex(inst.addr)})`);
  }
  if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem' && inst.addr >= 0xD00000 && inst.addr <= 0xDFFFFF) {
    notes.push(`RAM write pair: (${hex(inst.addr)})`);
  }

  // Block transfer ops
  if (inst.tag === 'ldir') notes.push('BLOCK COPY (HL)->(DE), BC bytes, ascending');
  if (inst.tag === 'lddr') notes.push('BLOCK COPY (HL)->(DE), BC bytes, descending');

  return notes;
}

// ── ROM scanner ────────────────────────────────────────────────────────────

function scanForCall(rom, targetAddr) {
  const lo = targetAddr & 0xFF;
  const mi = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  const hits = [];
  const limit = rom.length - 4;

  for (let i = 0; i <= limit; i++) {
    const op = rom[i];
    // CALL unconditional and conditional, JP unconditional and conditional
    if (op !== 0xCD && op !== 0xC3 && op !== 0xC2 && op !== 0xCA &&
        op !== 0xD2 && op !== 0xDA && op !== 0xE2 && op !== 0xEA &&
        op !== 0xF2 && op !== 0xFA && op !== 0xC4 && op !== 0xCC &&
        op !== 0xD4 && op !== 0xDC && op !== 0xE4 && op !== 0xEC &&
        op !== 0xF4 && op !== 0xFC) continue;

    if (rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      const isCall = (op === 0xCD || op === 0xC4 || op === 0xCC || op === 0xD4 ||
                      op === 0xDC || op === 0xE4 || op === 0xEC || op === 0xF4 || op === 0xFC);
      hits.push({ site: i, kind: isCall ? 'CALL' : 'JP', opcode: op });
    }
  }
  return hits;
}

// ── Section A: 0x05E800–0x05E900 disassembly ──────────────────────────────

function sectionA(rom, decode) {
  console.log('\n================================================================');
  console.log('SECTION A — 0x05E800–0x05E900: caller of cx-zeroing LDDR');
  console.log('================================================================\n');

  const WINDOW_START = 0x05E800;
  const WINDOW_END   = 0x05E900;

  // Find function boundary by looking backward from 0x05E820
  const funcStart = findFunctionStart(rom, decode, CALLER_FUNC_ADDR, 256);
  console.log(`Inferred function start: ${hex(funcStart)}`);
  console.log(`Known CALL 0x0831A4 site: ${hex(CALL_SITE_ADDR)}`);
  console.log('');

  const rows = disassemble(rom, decode, WINDOW_START, WINDOW_END - WINDOW_START);

  const callTargets = [];
  const cxRefs = [];
  const iyOps = [];

  for (const row of rows) {
    const ann = annotateInst(row.inst);
    const marker = row.pc === CALL_SITE_ADDR ? '>>>'
                 : row.pc === CALLER_FUNC_ADDR ? '---'
                 : '   ';
    const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);

    if (row.inst) {
      // Collect CALL targets
      if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') {
        callTargets.push({ pc: row.pc, target: row.inst.target });
      }
      // Collect cx-range refs
      for (const note of ann) {
        if (note.includes('cx-range')) cxRefs.push({ pc: row.pc, note, text: row.text });
        if (note.includes('IY')) iyOps.push({ pc: row.pc, note, text: row.text });
      }
    }
  }

  console.log(`\n--- CALL targets in window ---`);
  for (const ct of callTargets) {
    console.log(`  ${hex(ct.pc)}: CALL ${hex(ct.target)}`);
  }

  console.log(`\n--- cx-range references (${hex(CX_RANGE_START)}–${hex(CX_RANGE_END)}) ---`);
  if (cxRefs.length === 0) console.log('  (none found in this window)');
  for (const cr of cxRefs) {
    console.log(`  ${hex(cr.pc)}: ${cr.text}  ; ${cr.note}`);
  }

  console.log(`\n--- IY flag/register operations ---`);
  if (iyOps.length === 0) console.log('  (none found in this window)');
  for (const iy of iyOps) {
    console.log(`  ${hex(iy.pc)}: ${iy.text}  ; ${iy.note}`);
  }

  return { funcStart, rows, callTargets, cxRefs, iyOps };
}

// ── Section B: zeroing function 0x0831A4–0x083230 ─────────────────────────

function sectionB(rom, decode) {
  console.log('\n================================================================');
  console.log('SECTION B — 0x0831A4–0x083230: the zeroing function (LDDR at 0x08321B)');
  console.log('================================================================\n');

  const FUNC_START = ZEROING_FUNC_ADDR;
  const FUNC_END   = 0x083230;

  const rows = disassemble(rom, decode, FUNC_START, FUNC_END - FUNC_START);

  const callTargets = [];
  const blockOps = [];
  const regLoads = [];

  for (const row of rows) {
    const ann = annotateInst(row.inst);
    const marker = row.pc === LDDR_ADDR ? '>>>' : '   ';
    const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);

    if (row.inst) {
      if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') {
        callTargets.push({ pc: row.pc, target: row.inst.target });
      }
      if (row.inst.tag === 'lddr' || row.inst.tag === 'ldir') {
        blockOps.push({ pc: row.pc, tag: row.inst.tag });
      }
      // Track register pair loads (LD rr, imm24) — these set up LDDR args
      if (row.inst.tag === 'ld-pair-imm') {
        regLoads.push({ pc: row.pc, pair: row.inst.pair, value: row.inst.value });
      }
    }
  }

  console.log(`\n--- Register pair immediate loads (LDDR setup) ---`);
  for (const rl of regLoads) {
    console.log(`  ${hex(rl.pc)}: LD ${rl.pair}, ${hex(rl.value)}`);
  }

  console.log(`\n--- Block transfer operations ---`);
  for (const bo of blockOps) {
    console.log(`  ${hex(bo.pc)}: ${bo.tag.toUpperCase()}`);
  }

  console.log(`\n--- CALL targets within zeroing function ---`);
  if (callTargets.length === 0) console.log('  (none)');
  for (const ct of callTargets) {
    console.log(`  ${hex(ct.pc)}: CALL ${hex(ct.target)}`);
  }

  return { rows, callTargets, blockOps, regLoads };
}

// ── Section C: Full ROM scan for CALL 0x0831A4 ───────────────────────────

function sectionC(rom, decode) {
  console.log('\n================================================================');
  console.log('SECTION C — Full ROM scan: all callers of 0x0831A4 (zeroing function)');
  console.log('================================================================\n');

  const hits = scanForCall(rom, ZEROING_FUNC_ADDR);
  console.log(`Found ${hits.length} CALL/JP sites targeting ${hex(ZEROING_FUNC_ADDR)}:\n`);

  const callerDetails = [];

  for (const hit of hits) {
    const funcStart = findFunctionStart(rom, decode, hit.site, 512);

    // Disassemble a few instructions around the call site for context
    const contextStart = Math.max(0, hit.site - 16);
    const contextRows = disassemble(rom, decode, contextStart, 48);

    console.log(`  ${hex(hit.site)}: ${hit.kind} ${hex(ZEROING_FUNC_ADDR)}  (containing func ~${hex(funcStart)})`);

    // Show 2 instructions before and after the call site
    const nearRows = contextRows.filter(r => r.pc >= hit.site - 12 && r.pc <= hit.site + 8);
    for (const row of nearRows) {
      const marker = row.pc === hit.site ? '  >>>' : '     ';
      const ann = annotateInst(row.inst);
      const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
      console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    }
    console.log('');

    callerDetails.push({ site: hit.site, kind: hit.kind, funcStart, nearRows });
  }

  return { hits, callerDetails };
}

// ── Report builder ─────────────────────────────────────────────────────────

function buildReport(sectionAResult, sectionBResult, sectionCResult) {
  const lines = [];

  lines.push('# Phase 25AJ — cx-Zeroing Caller Disassembly (0x05E820 + 0x0831A4)');
  lines.push('');
  lines.push('Generated by `probe-phase25aj-cx-zeroing-caller-disasm.mjs` — static ROM analysis only.');
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');

  const { funcStart: callerFuncStart, callTargets: callerCallTargets, cxRefs, iyOps } = sectionAResult;
  const { regLoads, blockOps, callTargets: zeroingCallTargets } = sectionBResult;
  const { hits: allCallers } = sectionCResult;

  const lddrSetup = regLoads.filter(rl => rl.value >= 0xD00000);
  const lddrSetupStr = lddrSetup.map(rl => `${rl.pair}=${hex(rl.value)}`).join(', ');

  lines.push(`The function at ~${hex(callerFuncStart)} (containing the CALL 0x0831A4 at ${hex(CALL_SITE_ADDR)}) ` +
    `makes ${callerCallTargets.length} CALL(s) within the disassembly window. ` +
    `${cxRefs.length} direct cx-range address references and ${iyOps.length} IY operations were found.`);
  lines.push('');
  lines.push(`The zeroing function at ${hex(ZEROING_FUNC_ADDR)} contains ${blockOps.length} block transfer ` +
    `operation(s) (LDDR/LDIR) and ${zeroingCallTargets.length} sub-CALL(s). ` +
    (lddrSetup.length > 0
      ? `Register pair loads targeting RAM: ${lddrSetupStr}.`
      : 'No immediate register pair loads targeting RAM found (may use register arguments from caller).'));
  lines.push('');
  lines.push(`Full ROM scan found **${allCallers.length} caller(s)** of ${hex(ZEROING_FUNC_ADDR)}. ` +
    (allCallers.length === 1
      ? 'This is the ONLY caller — the zeroing function is dedicated to this one call site.'
      : `Multiple callers suggest this is a general-purpose memory-clear/context-init routine.`));
  lines.push('');

  // Section A
  lines.push('## Section A — Caller Function Disassembly (0x05E800–0x05E900)');
  lines.push('');
  lines.push(`Inferred function start: **${hex(callerFuncStart)}**`);
  lines.push(`CALL 0x0831A4 at: **${hex(CALL_SITE_ADDR)}**`);
  lines.push('');
  lines.push('### Full Disassembly');
  lines.push('');
  lines.push('```text');
  for (const row of sectionAResult.rows) {
    const ann = annotateInst(row.inst);
    const marker = row.pc === CALL_SITE_ADDR ? '>>>'
                 : row.pc === CALLER_FUNC_ADDR ? '---'
                 : '   ';
    const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
    lines.push(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
  }
  lines.push('```');
  lines.push('');

  lines.push('### CALL Targets');
  lines.push('');
  lines.push('| PC | Target |');
  lines.push('| --- | --- |');
  for (const ct of callerCallTargets) {
    lines.push(`| ${hex(ct.pc)} | ${hex(ct.target)} |`);
  }
  lines.push('');

  if (cxRefs.length > 0) {
    lines.push('### cx-Range References');
    lines.push('');
    lines.push('| PC | Instruction | Note |');
    lines.push('| --- | --- | --- |');
    for (const cr of cxRefs) {
      lines.push(`| ${hex(cr.pc)} | \`${cr.text}\` | ${cr.note} |`);
    }
    lines.push('');
  }

  if (iyOps.length > 0) {
    lines.push('### IY Operations');
    lines.push('');
    lines.push('| PC | Instruction | Note |');
    lines.push('| --- | --- | --- |');
    for (const iy of iyOps) {
      lines.push(`| ${hex(iy.pc)} | \`${iy.text}\` | ${iy.note} |`);
    }
    lines.push('');
  }

  // Section B
  lines.push('## Section B — Zeroing Function Disassembly (0x0831A4–0x083230)');
  lines.push('');
  lines.push('### Full Disassembly');
  lines.push('');
  lines.push('```text');
  for (const row of sectionBResult.rows) {
    const ann = annotateInst(row.inst);
    const marker = row.pc === LDDR_ADDR ? '>>>' : '   ';
    const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
    lines.push(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
  }
  lines.push('```');
  lines.push('');

  lines.push('### Register Pair Loads (potential LDDR setup)');
  lines.push('');
  lines.push('| PC | Pair | Value | Notes |');
  lines.push('| --- | --- | --- | --- |');
  for (const rl of regLoads) {
    const note = rl.value >= 0xD00000 ? 'RAM address' : rl.value < 0x400000 ? 'ROM address' : '';
    lines.push(`| ${hex(rl.pc)} | ${rl.pair} | ${hex(rl.value)} | ${note} |`);
  }
  lines.push('');

  lines.push('### Block Transfer Operations');
  lines.push('');
  for (const bo of blockOps) {
    lines.push(`- **${bo.tag.toUpperCase()}** at ${hex(bo.pc)}`);
  }
  lines.push('');

  // Section C
  lines.push('## Section C — All Callers of 0x0831A4 (Full ROM Scan)');
  lines.push('');
  lines.push(`Total: **${allCallers.length}** call/jump site(s)`);
  lines.push('');
  lines.push('| Site | Kind | Containing Func |');
  lines.push('| --- | --- | --- |');
  for (const cd of sectionCResult.callerDetails) {
    lines.push(`| ${hex(cd.site)} | ${cd.kind} | ~${hex(cd.funcStart)} |`);
  }
  lines.push('');

  for (const cd of sectionCResult.callerDetails) {
    lines.push(`### Caller at ${hex(cd.site)} (func ~${hex(cd.funcStart)})`);
    lines.push('');
    lines.push('```text');
    for (const row of cd.nearRows) {
      const marker = row.pc === cd.site ? '>>>' : '   ';
      const ann = annotateInst(row.inst);
      const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
      lines.push(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    }
    lines.push('```');
    lines.push('');
  }

  // Analysis / Next Steps
  lines.push('## Analysis & Next Steps');
  lines.push('');
  lines.push('Key questions answered by this probe:');
  lines.push('');
  lines.push('1. **What does the caller function at ~0x05E820 do?** — See Section A disassembly above.');
  lines.push('2. **What arguments does the zeroing function expect?** — See Section B register loads and block ops.');
  lines.push('3. **Is the zeroing function called from other sites?** — See Section C for the full caller list.');
  lines.push('4. **Is this a context switch, cleanup, or cold-restart path?** — Interpret from the call graph and register setup.');
  lines.push('');

  return lines.join('\n') + '\n';
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { decodeInstruction } = await loadDecoder();

  console.log('Phase 25AJ — cx-Zeroing Caller Disassembly');
  console.log('============================================\n');
  console.log(`ROM size: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);

  const aResult = sectionA(rom, decodeInstruction);
  const bResult = sectionB(rom, decodeInstruction);
  const cResult = sectionC(rom, decodeInstruction);

  const report = buildReport(aResult, bResult, cResult);
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\nWrote report: ${REPORT_PATH}`);
}

await main();

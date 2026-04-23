#!/usr/bin/env node

/**
 * Phase 25AJ — Static disassembly of top 3 ParseInp callers
 *
 * For each of the top 3 ParseInp (0x099914) caller sites reachable from CoorMon:
 *   0x0ACC58 (depth 3, closest)
 *   0x0973F8 (depth 4, CursorOff path)
 *   0x0ACDF6 (depth 4, via 0x06CE73 chain)
 *
 * 1. Disassemble 128-byte window around each call site (64 before, 64 after)
 * 2. Find containing function boundary (backward RET/JP search)
 * 3. Identify register/memory setup before ParseInp call and result handling after
 * 4. List all CALL targets within the containing function
 * 5. Check for references to home-screen addresses: 0x058241, 0xD007E0, 0xD007CA
 * 6. Cross-reference: find all CALL <func_addr> in ROM for each containing function
 * 7. Build call-depth table to 0x058241
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH     = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH  = path.join(__dirname, 'phase25aj-parseinp-caller-disasm-report.md');

const ADL_MODE = 'adl';

// ── Known addresses ────────────────────────────────────────────────────────
const PARSEINP_ADDR     = 0x099914;
const HOME_HANDLER_ADDR = 0x058241;
const COORMON_ADDR      = 0x08C331;
const CXCURAPP_RAM      = 0xD007E0;
const CXMAIN_RAM        = 0xD007CA;
const OP1_RAM           = 0xD005F8;
const BEGPC_RAM         = 0xD02317;
const CURPC_RAM         = 0xD0231A;
const ENDPC_RAM         = 0xD0231D;
const ERRNO_RAM         = 0xD008DF;

const TOP_CALLERS = [
  { addr: 0x0ACC58, label: 'depth-3 (closest from CoorMon)', depth: 3 },
  { addr: 0x0973F8, label: 'depth-4 (CursorOff path)',       depth: 4 },
  { addr: 0x0ACDF6, label: 'depth-4 (via 0x06CE73 chain)',   depth: 4 },
];

const INTERESTING_ADDRS = new Map([
  [HOME_HANDLER_ADDR, 'HOME_HANDLER (0x058241)'],
  [CXCURAPP_RAM,      'cxCurApp RAM'],
  [CXMAIN_RAM,        'cxMain RAM'],
  [OP1_RAM,           'OP1 RAM'],
  [BEGPC_RAM,         'begPC RAM'],
  [CURPC_RAM,         'curPC RAM'],
  [ENDPC_RAM,         'endPC RAM'],
  [ERRNO_RAM,         'errNo RAM'],
]);

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

// Walk backward from addr to find the most recent RET/JP (function boundary heuristic).
function findFunctionStart(buffer, decode, addr, maxBack = 512) {
  const start = Math.max(0, addr - maxBack);
  const rows  = disassemble(buffer, decode, start, addr - start);

  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (!r.inst) continue;
    if (r.inst.tag === 'ret' || r.inst.tag === 'retn' || r.inst.tag === 'reti' ||
        (r.inst.tag === 'jp' && r.inst.target !== undefined)) {
      const nextIdx = i + 1;
      return nextIdx < rows.length ? rows[nextIdx].pc : addr;
    }
  }
  return start;
}

// ── Annotation helpers ─────────────────────────────────────────────────────

function annotateRow(inst) {
  if (!inst) return [];
  const notes = [];

  // Check for interesting address references
  const checkAddr = (a, context) => {
    if (INTERESTING_ADDRS.has(a)) {
      notes.push(`★ ${context} → ${INTERESTING_ADDRS.get(a)} (${hex(a)})`);
    }
    // Check near-misses for OP1 (it's a 9-byte area)
    if (a >= OP1_RAM && a < OP1_RAM + 9 && !INTERESTING_ADDRS.has(a)) {
      notes.push(`★ ${context} → OP1+${a - OP1_RAM} (${hex(a)})`);
    }
  };

  // LD (addr), reg / LD reg, (addr)
  if (inst.tag === 'ld-mem-reg')  checkAddr(inst.addr, `LD (${hex(inst.addr)}),${inst.src}`);
  if (inst.tag === 'ld-reg-mem')  checkAddr(inst.addr, `LD ${inst.dest},(${hex(inst.addr)})`);
  if (inst.tag === 'ld-pair-mem') checkAddr(inst.addr, inst.direction === 'to-mem' ? `LD (${hex(inst.addr)}),${inst.pair}` : `LD ${inst.pair},(${hex(inst.addr)})`);
  if (inst.tag === 'ld-mem-pair') checkAddr(inst.addr, `LD (${hex(inst.addr)}),${inst.pair}`);

  // IY flag operations
  if (inst.tag === 'indexed-cb-set' && inst.indexRegister === 'iy') {
    notes.push(`★ SET ${inst.bit},(IY+${inst.displacement}) — IY flag set`);
  }
  if (inst.tag === 'indexed-cb-res' && inst.indexRegister === 'iy') {
    notes.push(`★ RES ${inst.bit},(IY+${inst.displacement}) — IY flag clear`);
  }
  if (inst.tag === 'indexed-cb-bit' && inst.indexRegister === 'iy') {
    notes.push(`  BIT ${inst.bit},(IY+${inst.displacement}) — IY flag test`);
  }

  // CALL / JP targets
  if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target !== undefined) {
    if (inst.target === PARSEINP_ADDR) {
      notes.push(`★★★ CALL ParseInp (${hex(PARSEINP_ADDR)})`);
    } else {
      notes.push(`→ CALL ${hex(inst.target)}`);
    }
  }
  if ((inst.tag === 'jp' || inst.tag === 'jp-conditional') && inst.target !== undefined) {
    notes.push(`→ JP ${hex(inst.target)}`);
  }
  if (inst.tag === 'jp-indirect') {
    notes.push(`→ JP (${inst.indirectRegister})`);
  }

  // LDIR/LDDR
  if (inst.tag === 'ldir') notes.push('LDIR — block copy');
  if (inst.tag === 'lddr') notes.push('LDDR — block copy reverse');

  // RST (often error handlers)
  if (inst.tag === 'rst') notes.push(`RST ${hex(inst.target)} — system call/error?`);

  return notes;
}

// ── ROM scanner ────────────────────────────────────────────────────────────

function scanCallsAndJumps(rom, targetAddr) {
  const lo = targetAddr & 0xFF;
  const mi = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  const hits = [];
  const limit = rom.length - 4;

  for (let i = 0; i <= limit; i++) {
    const op = rom[i];
    if (op !== 0xCD && op !== 0xC3 && op !== 0xC2 && op !== 0xCA &&
        op !== 0xD2 && op !== 0xDA && op !== 0xE2 && op !== 0xEA &&
        op !== 0xF2 && op !== 0xFA && op !== 0xC4 && op !== 0xCC &&
        op !== 0xD4 && op !== 0xDC && op !== 0xE4 && op !== 0xEC &&
        op !== 0xF4 && op !== 0xFC) continue;

    if (rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      const kind = (op === 0xCD || op === 0xC4 || op === 0xCC || op === 0xD4 ||
                    op === 0xDC || op === 0xE4 || op === 0xEC || op === 0xF4 || op === 0xFC)
        ? 'CALL' : 'JP';
      hits.push({ site: i, kind });
    }
  }
  return hits;
}

// ── BFS call-graph walk ────────────────────────────────────────────────────

function getCallTargets(buffer, decode, addr, maxBytes = 512) {
  const targets = new Set();
  const rows = disassemble(buffer, decode, addr, maxBytes);
  for (const row of rows) {
    if (!row.inst) continue;
    const { tag } = row.inst;
    if (tag === 'call' || tag === 'call-conditional') {
      targets.add(row.inst.target);
    }
  }
  return targets;
}

function bfsCallGraph(buffer, decode, rootAddr, maxDepth, maxBytes = 512) {
  const visited = new Map();
  visited.set(rootAddr, { depth: 0, parent: null });

  const queue = [rootAddr];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentDepth = visited.get(current).depth;
    if (currentDepth >= maxDepth) continue;

    const targets = getCallTargets(buffer, decode, current, maxBytes);
    for (const t of targets) {
      if (visited.has(t)) continue;
      if (t >= 0x400000) continue;
      visited.set(t, { depth: currentDepth + 1, parent: current });
      queue.push(t);
    }
  }
  return visited;
}

function callChain(visited, target) {
  const chain = [];
  let cur = target;
  while (cur !== null) {
    chain.push(cur);
    cur = visited.get(cur)?.parent ?? null;
  }
  return chain.reverse();
}

// ── Section 1: Disassemble 128-byte window around each caller ──────────────

function section1_windowDisasm(rom, decode) {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('SECTION 1 — 128-byte window around each ParseInp caller');
  console.log('════════════════════════════════════════════════════════════\n');

  const results = [];

  for (const caller of TOP_CALLERS) {
    const windowStart = caller.addr - 64;
    const windowBytes = 128;
    console.log(`\n─── ${hex(caller.addr)} (${caller.label}) ───\n`);

    const rows = disassemble(rom, decode, windowStart, windowBytes);

    for (const row of rows) {
      const ann = annotateRow(row.inst);
      const marker = row.pc === caller.addr ? '>>>' : '   ';
      const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
      console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    }

    results.push({ caller, rows });
  }

  return results;
}

// ── Section 2: Containing function analysis ────────────────────────────────

function section2_containingFunctions(rom, decode) {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('SECTION 2 — Containing function analysis');
  console.log('════════════════════════════════════════════════════════════\n');

  const results = [];

  for (const caller of TOP_CALLERS) {
    const funcStart = findFunctionStart(rom, decode, caller.addr);
    console.log(`\n─── Caller ${hex(caller.addr)} → Containing func starts at ${hex(funcStart)} ───\n`);

    // Disassemble the full function (up to 1024 bytes or until a trailing RET)
    const maxFuncBytes = 1024;
    const rows = disassemble(rom, decode, funcStart, maxFuncBytes);

    // Collect CALL targets, interesting address refs, IY ops
    const callTargets = [];
    const interestingRefs = [];
    const iyOps = [];
    let funcEndPc = funcStart + maxFuncBytes;
    let foundParseInpCall = false;
    let parseInpCallPc = null;

    // Track which instructions are BEFORE vs AFTER ParseInp call
    let reachedParseInp = false;
    const preSetup = [];
    const postHandling = [];

    for (const row of rows) {
      if (!row.inst) continue;

      // Detect function end (RET after ParseInp call, not conditional returns before it)
      if (row.pc > caller.addr + 32 && row.inst.tag === 'ret') {
        funcEndPc = row.pc + row.inst.length;
        // Don't break — there may be more code paths
      }

      const ann = annotateRow(row.inst);

      // Track CALL targets
      if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') {
        callTargets.push({ pc: row.pc, target: row.inst.target, tag: row.inst.tag });
        if (row.inst.target === PARSEINP_ADDR) {
          foundParseInpCall = true;
          parseInpCallPc = row.pc;
          reachedParseInp = true;
        }
      }

      // Track interesting address references
      for (const [addr, name] of INTERESTING_ADDRS) {
        if (row.inst.addr === addr || row.inst.target === addr || row.inst.value === addr) {
          interestingRefs.push({ pc: row.pc, addr, name, text: row.text });
        }
      }

      // Track IY ops
      if (row.inst.indexRegister === 'iy' &&
          (row.inst.tag.startsWith('indexed-cb-') || row.inst.tag === 'ld-reg-ixd' || row.inst.tag === 'ld-ixd-reg' || row.inst.tag === 'ld-ixd-imm')) {
        iyOps.push({ pc: row.pc, text: row.text, inst: row.inst });
      }

      // Classify as pre/post ParseInp
      if (!reachedParseInp && row.pc >= funcStart && row.pc < caller.addr) {
        preSetup.push(row);
      } else if (reachedParseInp && row.pc > caller.addr) {
        postHandling.push(row);
      }
    }

    // Print summary
    console.log(`  Function range: ${hex(funcStart)} - ~${hex(funcEndPc)} (${funcEndPc - funcStart} bytes)`);
    console.log(`  ParseInp call at: ${parseInpCallPc ? hex(parseInpCallPc) : 'NOT FOUND'}`);
    console.log(`  Total CALL targets in function: ${callTargets.length}`);
    console.log(`  Interesting address refs: ${interestingRefs.length}`);
    console.log(`  IY operations: ${iyOps.length}`);

    // Pre-ParseInp setup
    console.log(`\n  PRE-ParseInp setup (${preSetup.length} instructions before call):`);
    for (const row of preSetup) {
      const ann = annotateRow(row.inst);
      const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
      console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    }

    // Post-ParseInp handling
    const postWindow = postHandling.slice(0, 30); // First 30 instructions after
    console.log(`\n  POST-ParseInp handling (first ${postWindow.length} instructions after call):`);
    for (const row of postWindow) {
      const ann = annotateRow(row.inst);
      const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
      console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    }

    // All CALL targets
    console.log(`\n  All CALL targets in function:`);
    for (const ct of callTargets) {
      const isParseInp = ct.target === PARSEINP_ADDR ? ' ★★★ ParseInp' : '';
      console.log(`    ${hex(ct.pc)}: ${ct.tag === 'call-conditional' ? 'CALL cc,' : 'CALL'} ${hex(ct.target)}${isParseInp}`);
    }

    // Interesting refs
    if (interestingRefs.length > 0) {
      console.log(`\n  Home-screen address references:`);
      for (const ref of interestingRefs) {
        console.log(`    ${hex(ref.pc)}: ${ref.text} → ${ref.name}`);
      }
    }

    // IY operations
    if (iyOps.length > 0) {
      console.log(`\n  IY flag operations:`);
      for (const iy of iyOps) {
        console.log(`    ${hex(iy.pc)}: ${iy.text}`);
      }
    }

    results.push({
      caller, funcStart, funcEndPc, callTargets, interestingRefs,
      iyOps, preSetup, postHandling: postWindow,
      foundParseInpCall, parseInpCallPc
    });
  }

  return results;
}

// ── Section 3: Cross-reference — who calls each containing function ────────

function section3_crossRef(rom, decode, funcResults) {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('SECTION 3 — Cross-reference: callers of each containing function');
  console.log('════════════════════════════════════════════════════════════\n');

  const results = [];

  for (const fr of funcResults) {
    const { caller, funcStart } = fr;
    const hits = scanCallsAndJumps(rom, funcStart);

    console.log(`\n─── ${hex(funcStart)} (contains ParseInp caller ${hex(caller.addr)}) ───`);
    console.log(`  ${hits.length} ROM sites CALL/JP this function:`);

    for (const h of hits) {
      // For each caller, find ITS containing function
      const callerFunc = findFunctionStart(rom, decode, h.site);
      console.log(`    ${hex(h.site)} (${h.kind}) — in func ~${hex(callerFunc)}`);
    }

    results.push({ funcStart, callerAddr: caller.addr, hits });
  }

  return results;
}

// ── Section 4: Call-depth table to HOME_HANDLER (0x058241) ─────────────────

function section4_depthTable(rom, decode, funcResults) {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('SECTION 4 — Call-depth from HOME_HANDLER (0x058241) to each caller');
  console.log('════════════════════════════════════════════════════════════\n');

  // BFS from HOME_HANDLER, depth 8
  console.log(`BFS from HOME_HANDLER ${hex(HOME_HANDLER_ADDR)}, max depth 8...`);
  const visited = bfsCallGraph(rom, decode, HOME_HANDLER_ADDR, 8);
  console.log(`  ${visited.size} addresses reachable\n`);

  const depthTable = [];

  for (const fr of funcResults) {
    const { caller, funcStart } = fr;

    // Check if caller addr or funcStart is reachable
    const checkAddr = visited.has(caller.addr) ? caller.addr
                    : visited.has(funcStart)   ? funcStart
                    : null;

    if (checkAddr !== null) {
      const info = visited.get(checkAddr);
      const chain = callChain(visited, checkAddr);
      const chainStr = chain.map(a => hex(a)).join(' → ');
      console.log(`  ${hex(caller.addr)}: REACHABLE at depth ${info.depth} — ${chainStr}`);
      depthTable.push({ caller: caller.addr, funcStart, depth: info.depth, chain, reachable: true });
    } else {
      console.log(`  ${hex(caller.addr)}: NOT reachable from HOME_HANDLER at depth 8`);
      depthTable.push({ caller: caller.addr, funcStart, depth: null, chain: null, reachable: false });
    }
  }

  // Also BFS from CoorMon for comparison
  console.log(`\nBFS from CoorMon ${hex(COORMON_ADDR)}, max depth 8...`);
  const coorVisited = bfsCallGraph(rom, decode, COORMON_ADDR, 8);
  console.log(`  ${coorVisited.size} addresses reachable\n`);

  for (const fr of funcResults) {
    const { caller, funcStart } = fr;
    const checkAddr = coorVisited.has(caller.addr) ? caller.addr
                    : coorVisited.has(funcStart)   ? funcStart
                    : null;

    if (checkAddr !== null) {
      const info = coorVisited.get(checkAddr);
      const chain = callChain(coorVisited, checkAddr);
      const chainStr = chain.map(a => hex(a)).join(' → ');
      console.log(`  ${hex(caller.addr)}: REACHABLE from CoorMon at depth ${info.depth} — ${chainStr}`);
    } else {
      console.log(`  ${hex(caller.addr)}: NOT reachable from CoorMon at depth 8`);
    }
  }

  return depthTable;
}

// ── Report builder ─────────────────────────────────────────────────────────

function buildReport(windowResults, funcResults, crossRefResults, depthTable, consoleOutput) {
  const lines = [];

  lines.push('# Phase 25AJ — ParseInp Caller Disassembly Report');
  lines.push('');
  lines.push('Generated by `probe-phase25aj-parseinp-caller-disasm.mjs` — static ROM analysis only.');
  lines.push('');

  // Executive summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push('Analyzed the top 3 ParseInp (0x099914) callers reachable from CoorMon:');
  lines.push('');
  for (const fr of funcResults) {
    const dt = depthTable.find(d => d.caller === fr.caller.addr);
    const depthStr = dt && dt.reachable ? `depth ${dt.depth} from HOME_HANDLER` : 'not reachable from HOME_HANDLER';
    lines.push(`- **${hex(fr.caller.addr)}** (${fr.caller.label}): containing func ${hex(fr.funcStart)}, ` +
      `${fr.callTargets.length} CALL targets, ${fr.interestingRefs.length} interesting addr refs, ` +
      `${fr.iyOps.length} IY ops. ${depthStr}.`);
  }
  lines.push('');

  // Determine best candidate
  const reachableFromHome = depthTable.filter(d => d.reachable).sort((a, b) => a.depth - b.depth);
  if (reachableFromHome.length > 0) {
    const best = reachableFromHome[0];
    const bestFr = funcResults.find(fr => fr.caller.addr === best.caller);
    lines.push(`**Best candidate for ENTER dispatch**: ${hex(best.caller)} at depth ${best.depth} from HOME_HANDLER ` +
      `(chain: ${best.chain.map(a => hex(a)).join(' → ')}). ` +
      (bestFr.interestingRefs.length > 0
        ? `References home-screen addresses: ${bestFr.interestingRefs.map(r => r.name).join(', ')}.`
        : 'No direct home-screen address references in the containing function.'));
  } else {
    lines.push('**No caller is statically reachable from HOME_HANDLER at depth 8.** Indirect dispatch (JP (HL)) likely bridges the gap.');
  }
  lines.push('');

  // Section 1: Window disassembly
  lines.push('## Section 1 — 128-byte Window Around Each Caller');
  lines.push('');
  for (const wr of windowResults) {
    lines.push(`### ${hex(wr.caller.addr)} (${wr.caller.label})`);
    lines.push('');
    lines.push('```text');
    for (const row of wr.rows) {
      const ann = annotateRow(row.inst);
      const marker = row.pc === wr.caller.addr ? '>>>' : '   ';
      const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
      lines.push(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    }
    lines.push('```');
    lines.push('');
  }

  // Section 2: Containing function analysis
  lines.push('## Section 2 — Containing Function Analysis');
  lines.push('');
  for (const fr of funcResults) {
    lines.push(`### ${hex(fr.caller.addr)} → func ${hex(fr.funcStart)}`);
    lines.push('');
    lines.push(`- **Function range**: ${hex(fr.funcStart)} - ~${hex(fr.funcEndPc)} (${fr.funcEndPc - fr.funcStart} bytes)`);
    lines.push(`- **ParseInp call at**: ${fr.parseInpCallPc ? hex(fr.parseInpCallPc) : 'NOT FOUND'}`);
    lines.push(`- **CALL targets**: ${fr.callTargets.length}`);
    lines.push(`- **Interesting addr refs**: ${fr.interestingRefs.length}`);
    lines.push(`- **IY operations**: ${fr.iyOps.length}`);
    lines.push('');

    // Pre-setup
    lines.push('**Pre-ParseInp setup:**');
    lines.push('');
    lines.push('```text');
    for (const row of fr.preSetup) {
      const ann = annotateRow(row.inst);
      const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
      lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    }
    lines.push('```');
    lines.push('');

    // Post-handling
    lines.push('**Post-ParseInp handling:**');
    lines.push('');
    lines.push('```text');
    for (const row of fr.postHandling) {
      const ann = annotateRow(row.inst);
      const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
      lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    }
    lines.push('```');
    lines.push('');

    // CALL targets table
    lines.push('**All CALL targets in function:**');
    lines.push('');
    lines.push('| PC | Type | Target | Note |');
    lines.push('| --- | --- | --- | --- |');
    for (const ct of fr.callTargets) {
      const note = ct.target === PARSEINP_ADDR ? 'ParseInp' : '';
      lines.push(`| ${hex(ct.pc)} | ${ct.tag} | ${hex(ct.target)} | ${note} |`);
    }
    lines.push('');

    // Interesting refs
    if (fr.interestingRefs.length > 0) {
      lines.push('**Home-screen address references:**');
      lines.push('');
      for (const ref of fr.interestingRefs) {
        lines.push(`- ${hex(ref.pc)}: \`${ref.text}\` → **${ref.name}**`);
      }
      lines.push('');
    }

    // IY ops
    if (fr.iyOps.length > 0) {
      lines.push('**IY flag operations:**');
      lines.push('');
      for (const iy of fr.iyOps) {
        lines.push(`- ${hex(iy.pc)}: \`${iy.text}\``);
      }
      lines.push('');
    }
  }

  // Section 3: Cross-reference
  lines.push('## Section 3 — Cross-Reference: Callers of Each Containing Function');
  lines.push('');
  for (const cr of crossRefResults) {
    lines.push(`### ${hex(cr.funcStart)} (contains caller ${hex(cr.callerAddr)})`);
    lines.push('');
    lines.push(`${cr.hits.length} ROM sites CALL/JP this function:`);
    lines.push('');
    if (cr.hits.length > 0) {
      lines.push('| Site | Kind |');
      lines.push('| --- | --- |');
      for (const h of cr.hits) {
        lines.push(`| ${hex(h.site)} | ${h.kind} |`);
      }
    } else {
      lines.push('*No direct callers found — likely reached via indirect dispatch (JP (HL))*');
    }
    lines.push('');
  }

  // Section 4: Depth table
  lines.push('## Section 4 — Call-Depth Table');
  lines.push('');
  lines.push('### From HOME_HANDLER (0x058241)');
  lines.push('');
  lines.push('| Caller | Func Start | Depth | Chain |');
  lines.push('| --- | --- | --- | --- |');
  for (const dt of depthTable) {
    const chainStr = dt.chain ? dt.chain.map(a => hex(a)).join(' → ') : 'N/A';
    lines.push(`| ${hex(dt.caller)} | ${hex(dt.funcStart)} | ${dt.depth ?? 'N/A'} | ${chainStr} |`);
  }
  lines.push('');

  // Next-session recommendation
  lines.push('## Next-Session Recommendation');
  lines.push('');
  if (reachableFromHome.length > 0) {
    const best = reachableFromHome[0];
    lines.push(`The closest ParseInp caller from HOME_HANDLER is **${hex(best.caller)}** at depth ${best.depth}. ` +
      `Set a runtime watchpoint at ${hex(best.caller)} during CoorMon execution with ENTER key pressed. ` +
      `If it fires, single-step through the CALL ParseInp to confirm it processes the ENTER key. ` +
      `Then trace ParseInp\'s return to understand how the OS handles the parsed input (OP1 result, error state).`);
  } else {
    lines.push('No caller is statically reachable from HOME_HANDLER. The gap is likely bridged by indirect dispatch. ' +
      'Next step: set runtime watchpoints on all 3 callers during ENTER key processing and see which fires.');
  }
  lines.push('');

  // Console output
  lines.push('## Raw Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(consoleOutput);
  lines.push('```');
  lines.push('');

  return lines.join('\n') + '\n';
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { decodeInstruction } = await loadDecoder();

  // Capture console output
  const origLog = console.log;
  const outputLines = [];
  console.log = (...args) => {
    const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    outputLines.push(line);
    origLog.apply(console, args);
  };

  console.log('Phase 25AJ — ParseInp Caller Disassembly');
  console.log('=========================================\n');
  console.log(`ROM size: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);

  const windowResults   = section1_windowDisasm(rom, decodeInstruction);
  const funcResults     = section2_containingFunctions(rom, decodeInstruction);
  const crossRefResults = section3_crossRef(rom, decodeInstruction, funcResults);
  const depthTable      = section4_depthTable(rom, decodeInstruction, funcResults);

  console.log = origLog;

  const consoleOutput = outputLines.join('\n');
  const report = buildReport(windowResults, funcResults, crossRefResults, depthTable, consoleOutput);
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\nWrote report: ${REPORT_PATH}`);
}

await main();

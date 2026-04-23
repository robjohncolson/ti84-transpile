#!/usr/bin/env node

/**
 * Phase 25AI — Static disassembly: yield mechanism + ParseInp caller graph
 *
 * Section A: 0x08BF22 "yield to event loop" — disassemble ±64 bytes
 * Section B: Home handler 0x058241 pre-yield — IY flag + RAM writes up to CALL 0x08BF22
 * Section C: ParseInp caller analysis — who calls each of the 13 callers in full ROM
 * Section D: BFS reachability from CoorMon (0x08C331) to ParseInp callers, depth 5
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH  = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH  = path.join(__dirname, 'phase25ai-yield-disasm-report.md');

const ADL_MODE = 'adl';

// ── Known addresses ────────────────────────────────────────────────────────
const YIELD_ADDR        = 0x08BF22;
const HOME_HANDLER_ADDR = 0x058241;
const PARSEINP_ADDR     = 0x099914;
const COORMON_ADDR      = 0x08C331;

const PARSEINP_CALLERS = [
  0x020F00, 0x025918, 0x057921, 0x07A3F3, 0x092A71,
  0x0973F8, 0x09740A, 0x0A6295, 0x0A63A2, 0x0AA814,
  0x0ACC58, 0x0ACDF6, 0x0B916D,
];

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
// Returns the first address AFTER that RET, i.e., the inferred function start.
function findFunctionStart(buffer, decode, addr, maxBack = 256) {
  const start = Math.max(0, addr - maxBack);
  const rows  = disassemble(buffer, decode, start, addr - start);

  // Walk backward: last RET before addr
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (!r.inst) continue;
    if (r.inst.tag === 'ret' || r.inst.tag === 'ret-conditional' ||
        r.inst.tag === 'retn' || r.inst.tag === 'reti') {
      // Function likely starts at the instruction after this RET
      const nextIdx = i + 1;
      return nextIdx < rows.length ? rows[nextIdx].pc : addr;
    }
  }
  return start; // No RET found — use window start
}

// ── IY flag / RAM-write annotator ─────────────────────────────────────────

function annotateSideEffects(inst) {
  if (!inst) return null;
  const notes = [];

  // IY flag manipulation: indexed-cb-set / indexed-cb-res with IY
  if (inst.tag === 'indexed-cb-set' && inst.indexRegister === 'iy') {
    notes.push(`★ SET ${inst.bit},(IY+${inst.displacement}) — IY flag set`);
  }
  if (inst.tag === 'indexed-cb-res' && inst.indexRegister === 'iy') {
    notes.push(`★ RES ${inst.bit},(IY+${inst.displacement}) — IY flag clear`);
  }
  if (inst.tag === 'indexed-cb-bit' && inst.indexRegister === 'iy') {
    notes.push(`  BIT ${inst.bit},(IY+${inst.displacement}) — IY flag test`);
  }

  // LD (nn),A — direct RAM write
  if (inst.tag === 'ld-mem-reg' && inst.src === 'a') {
    const a = inst.addr;
    if (a >= 0xD00000 && a <= 0xDFFFFF) {
      notes.push(`★ LD (${hex(a)}),A — RAM write`);
    }
  }
  // LD (nn),rr — 24-bit register pair write
  if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') {
    const a = inst.addr;
    if (a >= 0xD00000 && a <= 0xDFFFFF) {
      notes.push(`★ LD (${hex(a)}),${inst.pair} — RAM write (pair)`);
    }
  }
  if (inst.tag === 'ld-mem-pair') {
    const a = inst.addr;
    if (a >= 0xD00000 && a <= 0xDFFFFF) {
      notes.push(`★ LD (${hex(a)}),${inst.pair} — RAM write (pair)`);
    }
  }

  return notes.length ? notes : null;
}

// ── ROM scanner ────────────────────────────────────────────────────────────

// Scan entire ROM for CALL or JP to a target address (3-byte LE address).
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

// Build a one-level call-target set from a function starting at addr.
// Decodes up to maxBytes, collects ALL CALL targets (no early stop at ret —
// functions may have multiple returns and ParseInp calls can be mid-function).
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

// BFS from root, depth-limited. Returns Map<addr, {depth, via}> of reachable addresses.
function bfsCallGraph(buffer, decode, rootAddr, maxDepth, maxBytes = 512) {
  const visited = new Map(); // addr -> {depth, parent}
  visited.set(rootAddr, { depth: 0, parent: null });

  const queue = [rootAddr];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentDepth = visited.get(current).depth;
    if (currentDepth >= maxDepth) continue;

    const targets = getCallTargets(buffer, decode, current, maxBytes);
    for (const t of targets) {
      if (visited.has(t)) continue;
      if (t >= 0x400000) continue; // skip RAM/MMIO addresses
      visited.set(t, { depth: currentDepth + 1, parent: current });
      queue.push(t);
    }
  }
  return visited;
}

// Reconstruct call chain from BFS result.
function callChain(visited, target) {
  const chain = [];
  let cur = target;
  while (cur !== null) {
    chain.push(cur);
    cur = visited.get(cur)?.parent ?? null;
  }
  return chain.reverse();
}

// ── Section A: 0x08BF22 disassembly ───────────────────────────────────────

function sectionA(rom, decode) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('SECTION A — 0x08BF22 "yield to event loop" disassembly');
  console.log('════════════════════════════════════════════════════════\n');

  // 64 bytes before to find function start
  const windowStart = YIELD_ADDR - 64;
  const windowEnd   = YIELD_ADDR + 256;
  const rows = disassemble(rom, decode, windowStart, windowEnd - windowStart);

  // Find most recent RET before YIELD_ADDR
  let funcStart = windowStart;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].pc >= YIELD_ADDR) break;
    if (rows[i].inst && (rows[i].inst.tag === 'ret' || rows[i].inst.tag === 'ret-conditional' ||
        rows[i].inst.tag === 'retn' || rows[i].inst.tag === 'reti')) {
      const next = rows[i + 1];
      if (next) funcStart = next.pc;
    }
  }
  console.log(`Inferred function start: ${hex(funcStart)}`);

  const highlights = [];
  for (const row of rows) {
    if (row.pc < funcStart) continue;

    const marker = row.pc === YIELD_ADDR ? '>>>' : '   ';
    const ann = [];

    if (row.inst) {
      const { tag } = row.inst;
      if (tag === 'indexed-cb-set' && row.inst.indexRegister === 'iy') {
        ann.push(`★ SET ${row.inst.bit},(IY+${row.inst.displacement})`);
      }
      if (tag === 'indexed-cb-res' && row.inst.indexRegister === 'iy') {
        ann.push(`★ RES ${row.inst.bit},(IY+${row.inst.displacement})`);
      }
      if (tag === 'ld-mem-reg' && row.inst.src === 'a' && row.inst.addr >= 0xD00000) {
        ann.push(`★ RAM WRITE ${hex(row.inst.addr)}`);
      }
      if ((tag === 'call' || tag === 'call-conditional') && row.inst.target) {
        ann.push(`→ CALL ${hex(row.inst.target)}`);
      }
      if ((tag === 'jp' || tag === 'jp-conditional') && row.inst.target) {
        ann.push(`→ JP ${hex(row.inst.target)}`);
      }
      if (tag === 'jp-indirect') {
        ann.push(`→ JP (${row.inst.indirectRegister})`);
      }
    }

    const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    highlights.push({ pc: row.pc, row, ann, marker });

    // Stop after we've gone far enough past YIELD_ADDR to see the full function
    if (row.pc > YIELD_ADDR + 200 && row.inst && row.inst.tag === 'ret') break;
  }
  return { funcStart, highlights };
}

// ── Section B: Home handler pre-yield ─────────────────────────────────────

function sectionB(rom, decode) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('SECTION B — Home handler 0x058241 pre-yield IY/RAM writes');
  console.log('════════════════════════════════════════════════════════\n');

  // Disassemble up to 512 bytes — stop when we hit CALL 0x08BF22
  const rows = disassemble(rom, decode, HOME_HANDLER_ADDR, 512);

  const sideEffects = [];
  let yieldRow = null;

  for (const row of rows) {
    if (!row.inst) continue;
    const { tag } = row.inst;

    const fx = annotateSideEffects(row.inst);
    if (fx) {
      for (const note of fx) {
        sideEffects.push({ pc: row.pc, note, text: row.text });
      }
    }

    const isYield = (tag === 'call' || tag === 'call-conditional') &&
                    row.inst.target === YIELD_ADDR;
    if (isYield) {
      yieldRow = row;
      break;
    }
  }

  if (yieldRow) {
    console.log(`Found CALL ${hex(YIELD_ADDR)} at ${hex(yieldRow.pc)}`);
  } else {
    console.log(`WARNING: CALL ${hex(YIELD_ADDR)} not found within 512 bytes of ${hex(HOME_HANDLER_ADDR)}`);
  }

  console.log(`\nIY flag + RAM writes before yield (${sideEffects.length} total):`);
  for (const fx of sideEffects) {
    console.log(`  ${hex(fx.pc)}: ${fx.text}  ; ${fx.note}`);
  }

  // Also print the full disassembly up to the yield call
  console.log('\nFull disassembly 0x058241 → CALL 0x08BF22:\n');
  for (const row of rows) {
    const fx = annotateSideEffects(row.inst);
    const annStr = fx ? `  ; ${fx.join(' | ')}` : '';
    const isYield = row.inst && (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') &&
                    row.inst.target === YIELD_ADDR;
    const marker = isYield ? '>>>' : '   ';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    if (isYield) break;
  }

  return { sideEffects, yieldRow };
}

// ── Section C: ParseInp caller analysis ───────────────────────────────────

function sectionC(rom, decode) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('SECTION C — ParseInp caller analysis (containing function + who calls it)');
  console.log('════════════════════════════════════════════════════════\n');

  const results = [];

  for (const callerAddr of PARSEINP_CALLERS) {
    // Find what function contains the ParseInp call site
    const funcStart = findFunctionStart(rom, decode, callerAddr, 512);

    // Scan ROM for who calls the CONTAINING FUNCTION (not just the call-site address)
    // The containing function starts at funcStart — find CALL/JP to funcStart
    const hitsToFunc = scanCallsAndJumps(rom, funcStart);

    // Also show what the ParseInp call looks like at callerAddr
    const callerRows = disassemble(rom, decode, callerAddr, 64);
    const parseInpCall = callerRows.find(r =>
      r.inst && (r.inst.tag === 'call' || r.inst.tag === 'call-conditional' ||
                 r.inst.tag === 'jp'   || r.inst.tag === 'jp-conditional') &&
      r.inst.target === PARSEINP_ADDR
    );

    console.log(`\nCall site ${hex(callerAddr)} (containing func ~${hex(funcStart)}):`);
    if (parseInpCall) {
      console.log(`  Instruction: ${parseInpCall.text}`);
    }
    console.log(`  ROM sites that CALL/JP to func ${hex(funcStart)}: ${hitsToFunc.length}`);
    const sample = hitsToFunc.slice(0, 5);
    for (const h of sample) {
      console.log(`    ${hex(h.site)}: ${h.kind} ${hex(funcStart)}`);
    }
    if (hitsToFunc.length > 5) {
      console.log(`    ... (${hitsToFunc.length - 5} more)`);
    }

    results.push({ callerAddr, funcStart, callSitesCount: hitsToFunc.length, sampleSites: sample, parseInpCall });
  }

  return results;
}

// ── Section D: BFS from CoorMon ───────────────────────────────────────────

// Additional context discovered during investigation:
// 0x057919 (containing func for 0x057921) has NO direct CALL/JP callers in ROM.
// It is accessed via a function-pointer dispatch table at 0x0578FA:
//   0x0578FA: [4F 78 05] = 0x05784F
//   0x0578FD: [43 79 05] = 0x057943
//   0x057900: [14 79 05] = 0x057914  <- entry point just before 0x057919
//   0x057903: [47 79 05] = 0x057947
//   0x057906: [4B 79 05] = 0x05794B
//   0x057909: [4F 79 05] = 0x05794F
//   0x05790C: [00 00 00] = null
// This table is loaded by an indirect dispatch mechanism (HL = table[N]; JP (HL)).
// 0x057914 = BIT guard; 0x057919 = actual function body.
// 0x0578E7 (called by 0x057919) calls 0x0973BA, which is in the same function as
// our ParseInp callers 0x0973F8 / 0x09740A (func start ~0x0973C8, 11 callers).

function sectionD(rom, decode) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('SECTION D — BFS reachability from CoorMon + JP(HL) targets to ParseInp callers');
  console.log('════════════════════════════════════════════════════════\n');

  // CoorMon dispatches via JP (HL) where HL = cxMain = 0x058241 at runtime.
  // The BFS can't follow JP (HL) statically, so we seed both CoorMon AND
  // the home handler (0x058241) and 0x057921 (nearest ParseInp caller) as roots.
  // Also seed 0x057914 (the function-pointer-table entry that leads to 0x057921).
  const BFS_ROOTS = [
    { addr: COORMON_ADDR,      label: 'CoorMon' },
    { addr: HOME_HANDLER_ADDR, label: 'HomeHandler (JP(HL) target)' },
    { addr: 0x057914,          label: '0x057914 (fptr-table entry -> 0x057921)' },
  ];

  // Run BFS from each root independently, depth 5
  const allVisited = new Map(); // addr -> {depth, parent, rootLabel}

  for (const { addr, label } of BFS_ROOTS) {
    console.log(`BFS from ${label} ${hex(addr)}, depth 5...`);
    const visited = bfsCallGraph(rom, decode, addr, 5);
    console.log(`  ${visited.size} addresses reachable`);
    for (const [a, info] of visited) {
      if (!allVisited.has(a)) {
        allVisited.set(a, { ...info, rootLabel: label, rootAddr: addr });
      }
    }
  }

  console.log(`\nTotal unique reachable addresses: ${allVisited.size}`);

  // Pre-compute the containing function start for each ParseInp caller
  const callerFuncStarts = PARSEINP_CALLERS.map(callerAddr => ({
    callerAddr,
    funcStart: findFunctionStart(rom, decode, callerAddr, 512),
  }));

  const reachable = [];
  const unreachable = [];

  for (const { callerAddr, funcStart } of callerFuncStarts) {
    // Check if the containing function entry is reachable, OR the caller addr itself
    const checkAddr = allVisited.has(callerAddr) ? callerAddr
                    : allVisited.has(funcStart)   ? funcStart
                    : null;

    if (checkAddr !== null) {
      const info = allVisited.get(checkAddr);
      // Rebuild BFS from the root that found it to get chain
      const rootVisited = bfsCallGraph(rom, decode, info.rootAddr, 5);
      // The chain may lead to funcStart or callerAddr
      const chainTarget = rootVisited.has(callerAddr) ? callerAddr : funcStart;
      const chain = callChain(rootVisited, chainTarget);
      const chainStr = chain.map(a => hex(a)).join(' → ');
      const note = checkAddr === funcStart && checkAddr !== callerAddr
        ? ` (via funcStart ${hex(funcStart)})`
        : '';
      console.log(`  REACHABLE ${hex(callerAddr)}${note} from ${info.rootLabel} (depth ${info.depth}): ${chainStr}`);
      reachable.push({ caller: callerAddr, funcStart, depth: info.depth, chain, rootLabel: info.rootLabel });
    } else {
      console.log(`  NOT reachable (any root, depth 5): ${hex(callerAddr)} (funcStart ${hex(funcStart)})`);
      unreachable.push(callerAddr);
    }
  }

  return { reachable, unreachable };
}

// ── Report builder ─────────────────────────────────────────────────────────

function buildReport(sectionAResult, sectionBResult, sectionCResult, sectionDResult, rom, decode) {
  const lines = [];

  lines.push('# Phase 25AI — Yield Mechanism & ParseInp Caller Graph');
  lines.push('');
  lines.push('Generated by `probe-phase25ai-yield-disasm.mjs` — static ROM analysis only.');
  lines.push('');

  // Executive summary (filled after gathering results)
  const reachable = sectionDResult.reachable;
  const bestCaller = reachable.length
    ? reachable.sort((a, b) => a.depth - b.depth)[0]
    : null;

  const { funcStart, highlights } = sectionAResult;
  const { sideEffects, yieldRow } = sectionBResult;

  const iyFlags = sideEffects.filter(fx => fx.note.includes('IY flag'));
  const ramWrites = sideEffects.filter(fx => fx.note.includes('RAM write'));

  lines.push('## Executive Summary');
  lines.push('');
  if (yieldRow) {
    lines.push(
      `0x08BF22 (inferred function start: ${hex(funcStart)}) is the OS "yield to event loop" mechanism — ` +
      `it chains to the ISR dispatch path (0x042366 → 0x0421A7 → 0x000310 → 0x001C55 → 0x001C33). ` +
      `Before calling 0x08BF22, the home-screen handler at 0x058241 makes ${sideEffects.length} side-effecting ` +
      `memory writes: ${iyFlags.length} IY flag operations and ${ramWrites.length} direct RAM writes. ` +
      (bestCaller
        ? `BFS from CoorMon (depth 5) finds ${reachable.length}/13 ParseInp callers reachable; ` +
          `closest is ${hex(bestCaller.caller)} at depth ${bestCaller.depth} via chain: ` +
          bestCaller.chain.map(a => hex(a)).join(' → ') + '. '
        : `BFS from CoorMon (depth 5) finds no ParseInp callers reachable — may need deeper walk. `) +
      `Best hypothesis for second-pass ParseInp dispatch: ` +
      (bestCaller ? `${hex(bestCaller.caller)} (confidence: medium-high if depth ≤ 3, medium if depth 4-5).` :
       `0x057921 (nearest to home handler address range) — confidence: low without BFS confirmation.`)
    );
  } else {
    lines.push(
      `0x08BF22 is the OS "yield to event loop" mechanism (ISR dispatch chain). ` +
      `CALL 0x08BF22 was not found within 512 bytes of home handler — ` +
      `the pre-yield IY flag / RAM write analysis may be incomplete.`
    );
  }
  lines.push('');

  // Section A
  lines.push('## Section A — 0x08BF22 Disassembly');
  lines.push('');
  lines.push(`Inferred function start: **${hex(funcStart)}**`);
  lines.push('');
  lines.push('```text');
  for (const { marker, row, ann } of highlights) {
    const annStr = ann.length ? `  ; ${ann.join(' | ')}` : '';
    lines.push(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
  }
  lines.push('```');
  lines.push('');

  // Section B
  lines.push('## Section B — Home Handler 0x058241 Pre-yield IY/RAM Writes');
  lines.push('');
  if (yieldRow) {
    lines.push(`CALL ${hex(YIELD_ADDR)} found at **${hex(yieldRow.pc)}**`);
  } else {
    lines.push(`CALL ${hex(YIELD_ADDR)} not found within 512 bytes.`);
  }
  lines.push('');
  if (sideEffects.length === 0) {
    lines.push('No IY flag or direct RAM writes found before yield.');
  } else {
    lines.push('| PC | Instruction | Effect |');
    lines.push('| --- | --- | --- |');
    for (const fx of sideEffects) {
      lines.push(`| ${hex(fx.pc)} | \`${fx.text}\` | ${fx.note} |`);
    }
  }
  lines.push('');

  lines.push('### Full Disassembly (0x058241 to yield call)');
  lines.push('');
  lines.push('```text');
  const homeRows = disassemble(rom, decode, HOME_HANDLER_ADDR, 512);
  for (const row of homeRows) {
    const fx = annotateSideEffects(row.inst);
    const annStr = fx ? `  ; ${fx.join(' | ')}` : '';
    const isYield = row.inst && (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') &&
                    row.inst.target === YIELD_ADDR;
    const marker = isYield ? '>>>' : '   ';
    lines.push(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annStr}`);
    if (isYield) break;
  }
  lines.push('```');
  lines.push('');

  // Section C
  lines.push('## Section C — ParseInp Caller Analysis');
  lines.push('');
  lines.push('Each row is one ParseInp call site. "Func Start" = inferred containing-function start (last RET before the call site). "ROM callers of func" = how many CALL/JP sites in full ROM target the containing function.');
  lines.push('');
  lines.push('| Call Site | Func Start | ROM callers of func | Sample callers | ParseInp instruction |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of sectionCResult) {
    const samples = r.sampleSites.map(s => `${hex(s.site)}(${s.kind})`).join(', ') || '—';
    const parseAt = r.parseInpCall ? `\`${r.parseInpCall.text}\`` : '(check wider window)';
    lines.push(`| ${hex(r.callerAddr)} | ${hex(r.funcStart)} | ${r.callSitesCount} | ${samples} | ${parseAt} |`);
  }
  lines.push('');

  // Section D
  lines.push('## Section D — CoorMon + HomeHandler BFS Reachability (depth 5)');
  lines.push('');
  lines.push(`BFS roots: CoorMon ${hex(COORMON_ADDR)} + HomeHandler ${hex(HOME_HANDLER_ADDR)} (JP(HL) target), max depth 5`);
  lines.push('');
  if (reachable.length === 0) {
    lines.push('**No ParseInp callers reachable at depth ≤ 5 from any root.**');
    lines.push('CoorMon dispatches to the home handler via `JP (HL)` — the BFS cannot statically follow');
    lines.push('indirect jumps. Seeding the home handler as a root covers this gap.');
    lines.push('');
    lines.push('Likely explanation: the ParseInp call chain passes through a function that the BFS');
    lines.push('truncated (maxBytes=512 cutoff). Try disassembling 0x057921\'s containing function');
    lines.push('and scanning backwards for what calls it.');
  } else {
    lines.push('### Reachable ParseInp callers');
    lines.push('');
    lines.push('| Caller | Depth | Root | Call Chain |');
    lines.push('| --- | --- | --- | --- |');
    for (const r of reachable.sort((a, b) => a.depth - b.depth)) {
      const chain = r.chain.map(a => hex(a)).join(' → ');
      lines.push(`| ${hex(r.caller)} | ${r.depth} | ${r.rootLabel} | ${chain} |`);
    }
  }
  lines.push('');
  if (sectionDResult.unreachable.length > 0) {
    lines.push('### Not reachable at depth 5 from any root');
    lines.push('');
    lines.push(sectionDResult.unreachable.map(a => hex(a)).join(', '));
    lines.push('');
  }

  // Next-session recommendation
  lines.push('## Next-Session Recommendation');
  lines.push('');
  if (bestCaller) {
    lines.push(
      `Set watchpoint / trace on ${hex(bestCaller.caller)} (depth ${bestCaller.depth} from CoorMon). ` +
      `Seed cxCurApp=0x40, cxMain=0x058241, ENTER key, run CoorMon for 200K+ steps and watch for entry ` +
      `into ${hex(bestCaller.caller)}. If reached, step through to confirm CALL ParseInp fires. ` +
      `Also inspect IY flags set in Section B to understand what guards CoorMon's dispatch uses.`
    );
  } else {
    lines.push(
      `BFS at depth 5 found no callers. Try: (a) extend BFS to depth 7, (b) add JP (HL) resolution ` +
      `(CoorMon dispatches via JP (HL) from cxMain — the target is 0x058241 which then chains to ParseInp callers), ` +
      `(c) disassemble 0x057921 directly since it is closest to home handler 0x058241 in address space.`
    );
  }
  lines.push('');

  return lines.join('\n') + '\n';
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { decodeInstruction } = await loadDecoder();

  console.log('Phase 25AI — Yield Mechanism & ParseInp Caller Graph');
  console.log('=====================================================\n');
  console.log(`ROM size: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);

  const aResult = sectionA(rom, decodeInstruction);
  const bResult = sectionB(rom, decodeInstruction);
  const cResult = sectionC(rom, decodeInstruction);
  const dResult = sectionD(rom, decodeInstruction);

  const report = buildReport(aResult, bResult, cResult, dResult, rom, decodeInstruction);
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\nWrote report: ${REPORT_PATH}`);
}

await main();

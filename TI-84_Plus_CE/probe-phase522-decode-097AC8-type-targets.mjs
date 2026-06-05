#!/usr/bin/env node

/**
 * Phase 522 — Decode 0x097AC8 type-dispatch targets
 *
 * 0x097AC8 is the EDIT-BUFFER TYPE DISPATCHER / STATE RESETTER.
 * It calls 0x07F7BD (type checker), then dispatches on A against 7 type codes:
 *   0x1B, 0x20, 0x21, 0x1C, 0x01, 0x0D, 0x02
 *
 * This probe:
 *   1. Disassembles 0x097AC8 fully (until final RET)
 *   2. Identifies each CP imm8 / JP Z / JR Z dispatch pair
 *   3. Disassembles the first ~50 bytes of each target
 *   4. Produces a summary table: type_code -> target_address -> what it does
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Constants ──────────────────────────────────────────────────────────

const FUNC_START = 0x097AC8;
const MAX_FUNC_BYTES = 0x400;
const TARGET_DISASM_BYTES = 60;
const IY_BASE = 0xD00080;

const TYPE_NAMES = {
  0x00: 'real',
  0x01: 'real list',
  0x02: 'matrix',
  0x0C: 'complex',
  0x0D: 'complex list',
  0x1B: 'program',
  0x1C: 'protected program',
  0x20: 'appvar',
  0x21: 'group',
};

// ── Helpers ────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  if (v === null || v === undefined) return 'n/a';
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hex8(v) {
  return hex(v, 2);
}

function fmtInst(inst) {
  const pfx = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let t = inst.tag;

  switch (inst.tag) {
    case 'push': t = `push ${inst.pair}`; break;
    case 'pop': t = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': t = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      t = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-reg-imm': t = `ld ${inst.dest}, ${hex8(inst.value)}`; break;
    case 'ld-reg-reg': t = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': t = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': t = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': t = `ld (hl), ${hex8(inst.value)}`; break;
    case 'ld-reg-ixd': {
      const s = inst.displacement >= 0 ? '+' : '';
      t = `ld ${inst.dest}, (${inst.indexRegister}${s}${inst.displacement})`;
      break;
    }
    case 'ld-ixd-reg': {
      const s = inst.displacement >= 0 ? '+' : '';
      t = `ld (${inst.indexRegister}${s}${inst.displacement}), ${inst.src}`;
      break;
    }
    case 'ld-ixd-imm': {
      const s = inst.displacement >= 0 ? '+' : '';
      t = `ld (${inst.indexRegister}${s}${inst.displacement}), ${hex8(inst.value)}`;
      break;
    }
    case 'ld-a-mem': t = `ld a, (${hex(inst.addr)})`; break;
    case 'ld-mem-a': t = `ld (${hex(inst.addr)}), a`; break;
    case 'alu-imm': t = `${inst.op} ${hex8(inst.value)}`; break;
    case 'alu-reg': t = `${inst.op} ${inst.src}`; break;
    case 'alu-ind': t = `${inst.op} (hl)`; break;
    case 'alu-ixd': {
      const s = inst.displacement >= 0 ? '+' : '';
      t = `${inst.op} (${inst.indexRegister}${s}${inst.displacement})`;
      break;
    }
    case 'call': t = `call ${hex(inst.target)}`; break;
    case 'call-conditional': t = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': t = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': t = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': t = `jp (${inst.indirectRegister ?? 'hl'})`; break;
    case 'jr': t = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': t = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': t = 'ret'; break;
    case 'ret-conditional': t = `ret ${inst.condition}`; break;
    case 'inc-pair': t = `inc ${inst.pair}`; break;
    case 'dec-pair': t = `dec ${inst.pair}`; break;
    case 'inc-reg': t = `inc ${inst.reg}`; break;
    case 'dec-reg': t = `dec ${inst.reg}`; break;
    case 'add-pair': t = `add ${inst.dest}, ${inst.src}`; break;
    case 'djnz': t = `djnz ${hex(inst.target)}`; break;
    case 'rotate-reg': t = `${inst.op} ${inst.reg}`; break;
    case 'ex-de-hl': t = 'ex de, hl'; break;
    case 'nop': t = 'nop'; break;
    case 'di': t = 'di'; break;
    case 'ei': t = 'ei'; break;
    case 'halt': t = 'halt'; break;
    case 'rst': t = `rst ${hex8(inst.target)}`; break;
    case 'bit': t = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'set': t = `set ${inst.bit}, ${inst.reg}`; break;
    case 'res': t = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-ixd': {
      const s = inst.displacement >= 0 ? '+' : '';
      t = `bit ${inst.bit}, (${inst.indexRegister}${s}${inst.displacement})`;
      break;
    }
    case 'set-ixd': {
      const s = inst.displacement >= 0 ? '+' : '';
      t = `set ${inst.bit}, (${inst.indexRegister}${s}${inst.displacement})`;
      break;
    }
    case 'res-ixd': {
      const s = inst.displacement >= 0 ? '+' : '';
      t = `res ${inst.bit}, (${inst.indexRegister}${s}${inst.displacement})`;
      break;
    }
    case 'ex-sp-hl': t = 'ex (sp), hl'; break;
    case 'ex-sp-ix': t = `ex (sp), ${inst.indexRegister}`; break;
    case 'exx': t = 'exx'; break;
    case 'ex-af': t = "ex af, af'"; break;
    case 'cpl': t = 'cpl'; break;
    case 'scf': t = 'scf'; break;
    case 'ccf': t = 'ccf'; break;
    case 'daa': t = 'daa'; break;
    case 'rla': t = 'rla'; break;
    case 'rra': t = 'rra'; break;
    case 'rlca': t = 'rlca'; break;
    case 'rrca': t = 'rrca'; break;
    case 'reti': t = 'reti'; break;
    case 'retn': t = 'retn'; break;
    case 'ldir': t = 'ldir'; break;
    case 'lddr': t = 'lddr'; break;
    case 'cpir': t = 'cpir'; break;
    case 'cpdr': t = 'cpdr'; break;
    case 'outi': t = 'outi'; break;
    case 'outd': t = 'outd'; break;
    case 'ini': t = 'ini'; break;
    case 'ind': t = 'ind'; break;
    case 'out-c-reg': t = `out (c), ${inst.reg}`; break;
    case 'in-reg-c': t = `in ${inst.reg}, (c)`; break;
    case 'out-imm': t = `out (${hex8(inst.port)}), a`; break;
    case 'in-imm': t = `in a, (${hex8(inst.port)})`; break;
    case 'sbc-pair': t = `sbc hl, ${inst.pair}`; break;
    case 'adc-pair': t = `adc hl, ${inst.pair}`; break;
    case 'neg': t = 'neg'; break;
    case 'im': t = `im ${inst.intMode}`; break;
    case 'ld-i-a': t = 'ld i, a'; break;
    case 'ld-a-i': t = 'ld a, i'; break;
    case 'ld-r-a': t = 'ld r, a'; break;
    case 'ld-a-r': t = 'ld a, r'; break;
    case 'rrd': t = 'rrd'; break;
    case 'rld': t = 'rld'; break;
    default: break;
  }

  return `${pfx}${t}`;
}

function annotate(inst) {
  const notes = [];

  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    const name = TYPE_NAMES[inst.value];
    notes.push(`type=${hex8(inst.value)}${name ? ` (${name})` : ''}`);
  }

  if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target === 0x07F7BD) {
    notes.push('type checker');
  }

  // IY-relative
  const iyTags = ['res-ixd', 'set-ixd', 'bit-ixd', 'ld-ixd-imm', 'ld-ixd-reg'];
  if (iyTags.includes(inst.tag) && inst.indexRegister === 'iy') {
    const ramAddr = IY_BASE + inst.displacement;
    notes.push(`${hex(ramAddr)}`);
  }

  if (inst.tag === 'ld-mem-a') notes.push(`write A -> ${hex(inst.addr)}`);
  if (inst.tag === 'ld-a-mem') notes.push(`read ${hex(inst.addr)}`);

  return notes;
}

// ── Disassembly ────────────────────────────────────────────────────────

function disasmRange(start, maxBytes) {
  const rows = [];
  let pc = start;
  const end = start + maxBytes;

  while (pc < end && pc < rom.length) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.length === 0) break;
    const rawBytes = Array.from(rom.slice(inst.pc, inst.pc + inst.length))
      .map(b => b.toString(16).padStart(2, '0')).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      dasm: fmtInst(inst),
      notes: annotate(inst),
      inst,
    });
    pc += inst.length;
  }

  return rows;
}

function disasmUntilRet(start, maxBytes = 512) {
  const rows = [];
  let pc = start;
  const end = start + maxBytes;

  while (pc < end && pc < rom.length) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.length === 0) break;
    const rawBytes = Array.from(rom.slice(inst.pc, inst.pc + inst.length))
      .map(b => b.toString(16).padStart(2, '0')).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      dasm: fmtInst(inst),
      notes: annotate(inst),
      inst,
    });
    pc += inst.length;

    if (inst.tag === 'ret') break;
  }

  return rows;
}

function renderRows(rows) {
  for (const row of rows) {
    const noteStr = row.notes.length > 0 ? `  ; ${row.notes.join(', ')}` : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.dasm}${noteStr}`);
  }
}

// ── Extract CP -> branch dispatch pairs ────────────────────────────────
//
// TI-OS uses two dispatch idioms:
//   A) CP val; JP Z,target   or  CP val; JR Z,target  -- branch ON match
//   B) CP val; JR NZ,skip    -- fall through ON match (target = next instruction)
//   C) CP val; JR NC,target  -- range check (>= val)
//
// We capture all three patterns.

function extractDispatchPairs(rows) {
  const pairs = [];
  let lastCp = null;
  let lastCpIdx = -1;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];

    // Track CP imm8
    if (row.inst.tag === 'alu-imm' && row.inst.op === 'cp') {
      lastCp = { pc: row.pc, value: row.inst.value };
      lastCpIdx = idx;
      continue;
    }

    if (lastCp === null) continue;

    const cond = row.inst.condition?.toLowerCase();
    const isJpCond = row.inst.tag === 'jp-conditional';
    const isJrCond = row.inst.tag === 'jr-conditional';

    if (!isJpCond && !isJrCond) {
      // Non-branch instruction between CP and branch -- reset
      // (unless it's a trivial instruction like LD that doesn't affect flags)
      continue;
    }

    if (cond === 'z') {
      // Pattern A: CP val; JP/JR Z,target -- branch on match
      pairs.push({
        cpPc: lastCp.pc,
        typeCode: lastCp.value,
        typeName: TYPE_NAMES[lastCp.value] || '?',
        branchPc: row.pc,
        branchKind: isJpCond ? 'JP Z' : 'JR Z',
        targetAddr: row.inst.target,
        pattern: 'branch-on-match',
      });
      lastCp = null;
    } else if (cond === 'nz') {
      // Pattern B: CP val; JR NZ,skip -- fall through on match
      // The match target is the next instruction after the branch
      const nextIdx = idx + 1;
      if (nextIdx < rows.length) {
        pairs.push({
          cpPc: lastCp.pc,
          typeCode: lastCp.value,
          typeName: TYPE_NAMES[lastCp.value] || '?',
          branchPc: row.pc,
          branchKind: isJpCond ? 'JP NZ(skip)' : 'JR NZ(skip)',
          targetAddr: rows[nextIdx].pc,
          skipAddr: row.inst.target,
          pattern: 'fall-through-on-match',
        });
      }
      lastCp = null;
    } else if (cond === 'nc' || cond === 'c') {
      // Pattern C: range check -- note it but don't consume lastCp
      pairs.push({
        cpPc: lastCp.pc,
        typeCode: lastCp.value,
        typeName: TYPE_NAMES[lastCp.value] || '?',
        branchPc: row.pc,
        branchKind: `${isJpCond ? 'JP' : 'JR'} ${cond.toUpperCase()}`,
        targetAddr: row.inst.target,
        pattern: 'range-check',
      });
      lastCp = null;
    } else {
      lastCp = null;
    }
  }

  return pairs;
}

// ── Summarize a target ─────────────────────────────────────────────────

function summarizeTarget(addr) {
  const rows = disasmRange(addr, TARGET_DISASM_BYTES);
  const calls = [];
  const ramWrites = [];
  const ramReads = [];
  const iyOps = [];
  const branches = [];

  for (const row of rows) {
    const i = row.inst;

    if (i.tag === 'call' || i.tag === 'call-conditional') calls.push(i.target);
    if (i.tag === 'ld-mem-a') ramWrites.push(i.addr);
    if (i.tag === 'ld-a-mem') ramReads.push(i.addr);
    if (i.tag === 'jp' || i.tag === 'jp-conditional') branches.push(i.target);

    const iyTags = ['res-ixd', 'set-ixd', 'bit-ixd', 'ld-ixd-imm', 'ld-ixd-reg'];
    if (iyTags.includes(i.tag) && i.indexRegister === 'iy') {
      iyOps.push({
        op: i.tag.replace('-ixd', ''),
        displacement: i.displacement,
        ramAddr: IY_BASE + i.displacement,
        bit: i.bit,
        value: i.value,
      });
    }

    // LD (addr),pair writes
    if (i.tag === 'ld-pair-mem' && i.direction === 'to-mem') ramWrites.push(i.addr);
    if (i.tag === 'ld-pair-mem' && i.direction === 'from-mem') ramReads.push(i.addr);
  }

  return { rows, calls, ramWrites, ramReads, iyOps, branches };
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 522: Decode 0x097AC8 Type-Dispatch Targets ===');
  console.log(`ROM: ${rom.length} bytes\n`);

  // Part 1: Disassemble the dispatcher body
  console.log('## Part 1: 0x097AC8 dispatcher disassembly\n');

  // Disassemble generously to capture the full dispatch chain.
  // The function may have multiple RET paths, so scan a wide range
  // and show everything.
  const allRows = disasmRange(FUNC_START, MAX_FUNC_BYTES);
  renderRows(allRows);

  // Part 2: Extract dispatch pairs
  console.log('\n## Part 2: CP -> branch dispatch pairs\n');
  const pairs = extractDispatchPairs(allRows);

  if (pairs.length === 0) {
    console.log('WARNING: No dispatch pairs found with the simple CP->JP Z/JR Z pattern.');
    console.log('Listing all CP instructions and all conditional branches:\n');

    console.log('  CP instructions:');
    for (const row of allRows) {
      if (row.inst.tag === 'alu-imm' && row.inst.op === 'cp') {
        console.log(`    ${hex(row.pc)}: CP ${hex8(row.inst.value)}  ${TYPE_NAMES[row.inst.value] || ''}`);
      }
    }

    console.log('\n  Conditional branches:');
    for (const row of allRows) {
      const conds = ['jp-conditional', 'jr-conditional', 'call-conditional', 'ret-conditional'];
      if (conds.includes(row.inst.tag)) {
        console.log(`    ${hex(row.pc)}: ${row.dasm}`);
      }
    }
  } else {
    console.log(`Found ${pairs.length} dispatch pairs:\n`);
    console.log('  Code | Type               | CP @       | Branch     | Kind         | Target     | Pattern');
    console.log('  -----+--------------------+------------+------------+--------------+------------+--------');
    for (const p of pairs) {
      const code = hex8(p.typeCode).padEnd(4);
      const name = p.typeName.padEnd(18);
      const cpAt = hex(p.cpPc).padEnd(10);
      const brAt = hex(p.branchPc).padEnd(10);
      const kind = p.branchKind.padEnd(12);
      console.log(`  ${code} | ${name} | ${cpAt} | ${brAt} | ${kind} | ${hex(p.targetAddr).padEnd(10)} | ${p.pattern}`);
    }
  }

  // Part 3: Disassemble each target
  console.log('\n## Part 3: Target disassembly\n');

  const details = [];
  for (const p of pairs) {
    console.log(`### Type ${hex8(p.typeCode)} (${p.typeName}) -> ${hex(p.targetAddr)}\n`);

    const s = summarizeTarget(p.targetAddr);
    renderRows(s.rows);

    console.log('');
    if (s.calls.length > 0)     console.log(`  CALLs:      ${s.calls.map(a => hex(a)).join(', ')}`);
    if (s.ramWrites.length > 0) console.log(`  RAM writes: ${s.ramWrites.map(a => hex(a)).join(', ')}`);
    if (s.ramReads.length > 0)  console.log(`  RAM reads:  ${s.ramReads.map(a => hex(a)).join(', ')}`);
    if (s.iyOps.length > 0) {
      console.log('  IY ops:');
      for (const iy of s.iyOps) {
        const bitStr = iy.bit !== undefined ? ` bit ${iy.bit}` : '';
        const valStr = iy.value !== undefined ? ` val=${hex8(iy.value)}` : '';
        console.log(`    ${iy.op}${bitStr}${valStr} @ IY+${iy.displacement} (${hex(iy.ramAddr)})`);
      }
    }
    if (s.branches.length > 0)  console.log(`  Branches:   ${s.branches.map(a => hex(a)).join(', ')}`);
    console.log('');

    details.push({ ...p, ...s });
  }

  // Part 4: Summary table
  console.log('## Part 4: Summary table\n');
  console.log('  Code | Type               | Target     | CALLs | RAM W | RAM R | IY | JP');
  console.log('  -----+--------------------+------------+-------+-------+-------+----+---');
  for (const d of details) {
    const code = hex8(d.typeCode).padEnd(4);
    const name = d.typeName.padEnd(18);
    const target = hex(d.targetAddr).padEnd(10);
    console.log(
      `  ${code} | ${name} | ${target} ` +
      `| ${String(d.calls.length).padEnd(5)} ` +
      `| ${String(d.ramWrites.length).padEnd(5)} ` +
      `| ${String(d.ramReads.length).padEnd(5)} ` +
      `| ${String(d.iyOps.length).padEnd(2)} ` +
      `| ${d.branches.length}`
    );
  }

  // Part 5: All unique CALL targets across all type handlers
  console.log('\n## Part 5: Unique CALL targets across all handlers\n');
  const callMap = new Map();
  for (const d of details) {
    for (const addr of d.calls) {
      if (!callMap.has(addr)) callMap.set(addr, []);
      callMap.get(addr).push(hex8(d.typeCode));
    }
  }
  for (const [addr, types] of [...callMap.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${hex(addr)}  called by types: ${types.join(', ')}`);
  }

  // Part 6: Fall-through / default path
  console.log('\n## Part 6: Default / fall-through path\n');
  if (pairs.length > 0) {
    const lastPair = pairs[pairs.length - 1];
    let afterIdx = -1;
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i].pc === lastPair.branchPc) { afterIdx = i + 1; break; }
    }
    if (afterIdx > 0 && afterIdx < allRows.length) {
      console.log('Instructions after last dispatch branch:');
      // Show until RET or up to 30 rows
      let shown = 0;
      for (let i = afterIdx; i < allRows.length && shown < 30; i++) {
        const row = allRows[i];
        const noteStr = row.notes.length > 0 ? `  ; ${row.notes.join(', ')}` : '';
        console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.dasm}${noteStr}`);
        shown++;
        if (row.inst.tag === 'ret') break;
      }
    } else {
      console.log('No fall-through path found after last dispatch branch.');
    }
  }

  console.log('\n=== Phase 522 complete ===');
}

try {
  main();
} catch (err) {
  console.error('FATAL:', err.stack || String(err));
  process.exitCode = 1;
}

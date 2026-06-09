import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase595c-home-entry-callers.md');
const rom = fs.readFileSync(ROM_PATH);

const RANGE_START = 0x044940;
const RANGE_END = 0x044a75;
const HOME_GATE = 0x044a69;
const CX_MAIN_PRE = 0x058241;
const CX_REGION_END = 0x0582d0;
const BODY_POPULATOR = 0x044d3f;
const COORMON = 0x08bf22;

function hx(n, w = 6) {
  return `0x${(n >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function byteText(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function fmtValue(v) {
  return typeof v === 'number' ? hx(v, v > 0xffff ? 6 : v > 0xff ? 4 : 2) : String(v);
}

function fmt(inst) {
  const c = inst.condition ? ` ${inst.condition.toUpperCase()}` : '';
  switch (inst.tag) {
    case 'call': return `CALL ${hx(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()},${hx(inst.target)}`;
    case 'jr': return `JR ${hx(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()},${hx(inst.target)}`;
    case 'jp': return `JP ${hx(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()},${hx(inst.target)}`;
    case 'jp-indirect': return `JP (${inst.indirectRegister.toUpperCase()})`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET${c}`;
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()},(${hx(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hx(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'ld-mem-pair': return `LD (${hx(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()},(${hx(inst.addr)})`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()},${fmtValue(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()},${fmtValue(inst.value)}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()},(${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-sp-pair': return `LD SP,${inst.pair.toUpperCase()}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${fmtValue(inst.value)}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ccf': return 'CCF';
    case 'scf': return 'SCF';
    case 'nop': return 'NOP';
    case 'ex': return `EX ${inst.a?.toUpperCase?.() ?? ''},${inst.b?.toUpperCase?.() ?? ''}`;
    default: return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function decodeAt(pc) {
  const inst = decodeInstruction(rom, pc, 'adl');
  return { pc, inst, asm: fmt(inst), raw: byteText(pc, inst.length), len: inst.length || 1 };
}

function disasm(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    const row = decodeAt(pc);
    rows.push(row);
    pc += row.len;
  }
  return rows;
}

function isHardBoundary(row) {
  return row.inst.tag === 'ret' || row.inst.tag === 'reti' || row.inst.tag === 'jp';
}

function boundaryName(row) {
  if (row.inst.tag === 'ret') return 'RET 0xC9';
  if (row.inst.tag === 'reti') return 'RETI';
  if (row.inst.tag === 'jp') return 'JP 0xC3';
  return '';
}

function patternFor(addr) {
  return [addr & 0xff, (addr >>> 8) & 0xff, (addr >>> 16) & 0xff];
}

function scan(pattern) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc++) {
    let ok = true;
    for (let i = 0; i < pattern.length; i++) ok &&= rom[pc + i] === pattern[i];
    if (ok) hits.push(pc);
  }
  return hits;
}

function classifyHit(hit, target) {
  for (let start = Math.max(0, hit - 6); start <= hit; start++) {
    let row;
    try {
      row = decodeAt(start);
    } catch {
      continue;
    }
    const end = start + row.len;
    if (hit < start || hit + 3 > end) continue;
    const inst = row.inst;
    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target === target) return { kind: 'CALL operand', row };
    if ((inst.tag === 'jp' || inst.tag === 'jp-conditional') && inst.target === target) return { kind: 'JP operand', row };
    if ((inst.tag.startsWith('ld-')) && (inst.value === target || inst.addr === target)) return { kind: 'LD operand', row };
    return { kind: 'data', row };
  }
  return { kind: 'data', row: null };
}

function contextRows(hit) {
  const rows = [];
  for (let pc = Math.max(0, hit - 4), end = Math.min(rom.length, hit + 8); pc < end;) {
    const row = decodeAt(pc);
    rows.push(row);
    pc += row.len;
  }
  return rows;
}

function callJumpTargets(rows) {
  return rows
    .filter((r) => ['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional'].includes(r.inst.tag))
    .map((r) => ({ pc: r.pc, kind: r.inst.tag, target: r.inst.target, asm: r.asm }));
}

const lines = [];
const say = (s = '') => lines.push(s);

const entryRows = disasm(RANGE_START, RANGE_END);
const boundaries = entryRows.filter(isHardBoundary);
const candidateEntries = [
  RANGE_START,
  ...boundaries.map((r) => r.pc + r.len).filter((addr) => addr > RANGE_START && addr <= HOME_GATE),
].filter((addr, idx, arr) => arr.indexOf(addr) === idx);
const lastBoundary = boundaries.filter((r) => r.pc < HOME_GATE).at(-1);
const inferredEntry = lastBoundary ? lastBoundary.pc + lastBoundary.len : RANGE_START;

say('# Phase595c home entry callers');
say('');
say(`ROM: ${ROM_PATH}`);
say('');
say('## 0x044940-0x044A75 ADL disassembly');
for (const r of entryRows) {
  const mark = isHardBoundary(r) ? `  ; HARD BOUNDARY ${boundaryName(r)}, next=${hx(r.pc + r.len)}` : '';
  say(`${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}${mark}`);
}
say('');
say('## Candidate function entries');
say(`Last hard boundary before ${hx(HOME_GATE)}: ${lastBoundary ? `${hx(lastBoundary.pc)} ${lastBoundary.asm}` : 'none'}.`);
say(`Inferred containing-function entry for ${hx(HOME_GATE)}: ${hx(inferredEntry)}.`);
for (const addr of candidateEntries) say(`- ${hx(addr)}${addr === inferredEntry ? ' (entry after last hard boundary)' : ''}`);
say(`- ${hx(HOME_GATE)} (included as explicit scan target)`);
say('');

const allTargets = [...candidateEntries, HOME_GATE].filter((addr, idx, arr) => arr.indexOf(addr) === idx);
const callerSummaries = new Map();
for (const target of allTargets) {
  const hits = scan(patternFor(target));
  say(`## Whole-ROM references to ${hx(target)}`);
  say(`Pattern: ${patternFor(target).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}; hits=${hits.length}`);
  if (hits.length === 0) say('- none');
  for (const hit of hits) {
    const cls = classifyHit(hit, target);
    say(`- hit ${hx(hit)}: ${cls.kind}${cls.row ? ` via ${hx(cls.row.pc)} ${cls.row.asm}` : ''}`);
    if (cls.kind === 'CALL operand' || cls.kind === 'JP operand') {
      const arr = callerSummaries.get(target) ?? [];
      arr.push({ hit, kind: cls.kind, pc: cls.row.pc, asm: cls.row.asm });
      callerSummaries.set(target, arr);
    }
    for (const r of contextRows(hit)) say(`  ${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}`);
  }
  say('');
}

say(`## References to known context ${hx(CX_MAIN_PRE)} and ${hx(BODY_POPULATOR)}`);
for (const target of [CX_MAIN_PRE, BODY_POPULATOR]) {
  const hits = scan(patternFor(target));
  say(`### ${hx(target)} hits=${hits.length}`);
  if (hits.length === 0) say('- none');
  for (const hit of hits) {
    const cls = classifyHit(hit, target);
    say(`- hit ${hx(hit)}: ${cls.kind}${cls.row ? ` via ${hx(cls.row.pc)} ${cls.row.asm}` : ''}`);
    for (const r of contextRows(hit)) say(`  ${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}`);
  }
  say('');
}

const cxRows = disasm(CX_MAIN_PRE, CX_REGION_END);
say(`## ${hx(CX_MAIN_PRE)}-${hx(CX_REGION_END)} ADL disassembly`);
for (const r of cxRows) say(`${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}`);
say('');
say('### CALL/JP/JR targets in cxMain pre-handler window');
const cxTargets = callJumpTargets(cxRows);
if (cxTargets.length === 0) say('- none');
for (const t of cxTargets) say(`- ${hx(t.pc)} ${t.kind}: ${hx(t.target)} (${t.asm})`);
say('');

say('## Conclusion');
say(`Function entry containing ${hx(HOME_GATE)}: ${hx(inferredEntry)}.`);
const directCallers = callerSummaries.get(inferredEntry) ?? [];
if (directCallers.length) {
  say(`Direct code references to ${hx(inferredEntry)}:`);
  for (const c of directCallers) say(`- ${hx(c.pc)} ${c.kind}: ${c.asm}`);
} else {
  say(`No CALL/JP operands to ${hx(inferredEntry)} were found by whole-ROM little-endian 24-bit scan.`);
}
say('');
const homeGateRefs = callerSummaries.get(HOME_GATE) ?? [];
if (homeGateRefs.length) {
  say(`Direct code references to ${hx(HOME_GATE)}:`);
  for (const c of homeGateRefs) say(`- ${hx(c.pc)} ${c.kind}: ${c.asm}`);
} else {
  say(`No CALL/JP operands to the interior gate ${hx(HOME_GATE)} were found by whole-ROM little-endian 24-bit scan.`);
}
say('');
const regionReach = cxTargets.filter((t) => t.target >= 0x044000 && t.target <= 0x045000);
if (regionReach.length) {
  say(`Most plausible driveable chain: ${hx(CX_MAIN_PRE)} reaches the 0x044Axx bank directly through:`);
  for (const t of regionReach) say(`- ${hx(t.pc)} ${t.asm}`);
} else {
  say(`The ${hx(CX_MAIN_PRE)}-${hx(CX_REGION_END)} window has no direct CALL/JP/JR target in the 0x044Axx region. The plausible static chain remains known driveable entry ${hx(CX_MAIN_PRE)} / CoorMon ${hx(COORMON)} / event-loop dispatch into an indirect or table-driven path, then straight-line execution through ${hx(inferredEntry)} to ${hx(HOME_GATE)} and conditional JP NZ,${hx(BODY_POPULATOR)}.`);
}

const report = lines.join('\n') + '\n';
console.log(report);
fs.writeFileSync(REPORT_PATH, report);

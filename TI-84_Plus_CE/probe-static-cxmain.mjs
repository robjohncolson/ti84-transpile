import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase596-cxmain-launcher.md');
const rom = fs.readFileSync(ROM_PATH);

const HOME_START = 0x044800;
const HOME_END = 0x0448d0;
const HOME_SITE = 0x044890;
const HOME_ENTRY = 0x044a69;
const MODE_START = 0x058bb0;
const MODE_END = 0x058cd0;
const MODE_WRITE = 0x058c61;
const CXMAIN = 0xd007ca;
const HOME_MODE = 0xd007e0;

function hx(n, w = 6) {
  return `0x${(n >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function bytes(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function imm24At(pc) {
  return rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
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
  let asm = fmt(inst);
  if (rom[pc] === 0x22 && inst.length === 4) asm = `LD (${hx(imm24At(pc + 1))}),HL`;
  if (rom[pc] === 0x2a && inst.length === 4) asm = `LD HL,(${hx(imm24At(pc + 1))})`;
  if (rom[pc] === 0x32 && inst.length === 4) asm = `LD (${hx(imm24At(pc + 1))}),A`;
  if (rom[pc] === 0x3a && inst.length === 4) asm = `LD A,(${hx(imm24At(pc + 1))})`;
  if (rom[pc] === 0xed && rom[pc + 1] === 0x53 && inst.length === 5) asm = `LD (${hx(imm24At(pc + 2))}),DE`;
  if (rom[pc] === 0xed && rom[pc + 1] === 0x43 && inst.length === 5) asm = `LD (${hx(imm24At(pc + 2))}),BC`;
  return { pc, inst, asm, raw: bytes(pc, inst.length), len: inst.length || 1 };
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

function scan(pattern) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc++) {
    let ok = true;
    for (let i = 0; i < pattern.length; i++) ok &&= rom[pc + i] === pattern[i];
    if (ok) hits.push(pc);
  }
  return hits;
}

function pattern24(addr) {
  return [addr & 0xff, (addr >>> 8) & 0xff, (addr >>> 16) & 0xff];
}

function isHardBoundary(row) {
  return ['ret', 'reti', 'retn', 'jp'].includes(row.inst.tag);
}

function classifyHit(hit, target) {
  for (let start = Math.max(0, hit - 6); start <= hit; start++) {
    let row;
    try {
      row = decodeAt(start);
    } catch {
      continue;
    }
    if (hit < start || hit + 3 > start + row.len) continue;
    const i = row.inst;
    if ((i.tag === 'call' || i.tag === 'call-conditional') && i.target === target) return { kind: 'CALL operand', row };
    if ((i.tag === 'jp' || i.tag === 'jp-conditional') && i.target === target) return { kind: 'JP operand', row };
    if (i.tag.startsWith('ld-') && (i.value === target || i.addr === target)) return { kind: 'LD operand', row };
    return { kind: 'data/embedded operand', row };
  }
  return { kind: 'data', row: null };
}

function alignedContext(anchor, before = 16, after = 8) {
  const start = Math.max(0, anchor - before);
  const end = Math.min(rom.length, anchor + after);
  const rows = [];
  for (let pc = start; pc < end;) {
    const row = decodeAt(pc);
    rows.push(row);
    pc += row.len;
  }
  return rows;
}

function findContainingEntry(rows, site) {
  const boundaries = rows.filter(isHardBoundary);
  const before = boundaries.filter((r) => r.pc < site).at(-1);
  const after = boundaries.find((r) => r.pc > site);
  const entry = before ? before.pc + before.len : rows[0].pc;
  return { boundaries, before, after, entry };
}

function candidateEntries(rows, site) {
  const entries = [rows[0].pc];
  for (const row of rows) {
    if (isHardBoundary(row) && row.pc + row.len <= site) entries.push(row.pc + row.len);
  }
  return [...new Set(entries)].sort((a, b) => a - b);
}

function refsForTarget(target) {
  return scan(pattern24(target)).map((hit) => ({ hit, ...classifyHit(hit, target) }));
}

function previousRows(anchor, maxBytes = 24) {
  return disasm(Math.max(0, anchor - maxBytes), anchor).slice(-10);
}

function storedValueForWriter(hit, kind) {
  const rows = previousRows(hit);
  if (kind === 'HL') {
    const ld = rows.filter((r) => r.inst.tag === 'ld-pair-imm' && r.inst.pair === 'hl').at(-1);
    return ld ? `HL=${hx(ld.inst.value)} from ${hx(ld.pc)} ${ld.asm}` : 'HL value not determinable in local window';
  }
  if (kind === 'DE') {
    const ld = rows.filter((r) => r.inst.tag === 'ld-pair-imm' && r.inst.pair === 'de').at(-1);
    return ld ? `DE=${hx(ld.inst.value)} from ${hx(ld.pc)} ${ld.asm}` : 'DE value not determinable in local window';
  }
  if (kind === 'BC') {
    const ld = rows.filter((r) => r.inst.tag === 'ld-pair-imm' && r.inst.pair === 'bc').at(-1);
    return ld ? `BC=${hx(ld.inst.value)} from ${hx(ld.pc)} ${ld.asm}` : 'BC value not determinable in local window';
  }
  const ldA = rows.filter((r) => r.inst.tag === 'ld-reg-imm' && r.inst.dest === 'a').at(-1);
  return ldA ? `A=${hx(ldA.inst.value, 2)} from ${hx(ldA.pc)} ${ldA.asm}` : 'A value not determinable in local window';
}

function callJumpTargets(rows) {
  return rows
    .filter((r) => ['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional'].includes(r.inst.tag))
    .map((r) => ({ pc: r.pc, kind: r.inst.tag, target: r.inst.target, asm: r.asm }));
}

function aAtWrite(writePc) {
  const rows = previousRows(writePc, 32);
  const ldA = rows.filter((r) => r.inst.tag === 'ld-reg-imm' && r.inst.dest === 'a').at(-1);
  return ldA ? `A=${hx(ldA.inst.value, 2)} from ${hx(ldA.pc)} ${ldA.asm}` : 'A value not determinable in local window';
}

const lines = [];
const say = (s = '') => lines.push(s);

say('# Phase596 cxMain home launcher static probe');
say('');
say(`ROM: ${ROM_PATH}`);

const homeRows = disasm(HOME_START, HOME_END);
const homeFn = findContainingEntry(homeRows, HOME_SITE);
const homeCandidates = candidateEntries(homeRows, HOME_SITE);

say('');
say(`## Job 1: ${hx(HOME_START)}-${hx(HOME_END)} ADL disassembly`);
for (const r of homeRows) {
  const mark = r.pc === HOME_SITE ? '  ; JP Z,home-entry site' : isHardBoundary(r) ? '  ; hard boundary' : '';
  say(`${hx(r.pc)}  ${r.raw.padEnd(16)}  ${r.asm}${mark}`);
}
say('');
say(`Hard boundary before ${hx(HOME_SITE)}: ${homeFn.before ? `${hx(homeFn.before.pc)} ${homeFn.before.asm}; next=${hx(homeFn.before.pc + homeFn.before.len)}` : 'none in window'}`);
say(`Hard boundary after ${hx(HOME_SITE)}: ${homeFn.after ? `${hx(homeFn.after.pc)} ${homeFn.after.asm}` : 'none in window'}`);
say(`Containing-function entry inferred for ${hx(HOME_SITE)}: ${hx(homeFn.entry)}`);
say('');
say('### Candidate entries and whole-ROM references');
const rankedHome = [];
for (const target of [...new Set([...homeCandidates, homeFn.entry])]) {
  const refs = refsForTarget(target);
  const codeRefs = refs.filter((r) => r.kind === 'CALL operand' || r.kind === 'JP operand');
  rankedHome.push({ target, refs, codeRefs });
  say(`#### ${hx(target)} refs=${refs.length} codeRefs=${codeRefs.length}`);
  if (!refs.length) say('- none');
  for (const ref of refs) {
    say(`- hit ${hx(ref.hit)}: ${ref.kind}${ref.row ? ` via ${hx(ref.row.pc)} ${ref.row.asm}` : ''}`);
    for (const row of alignedContext(ref.hit, 6, 8)) say(`  ${hx(row.pc)}  ${row.raw.padEnd(16)}  ${row.asm}`);
  }
}

say('');
say(`## Job 2: D007CA cxMain writer scan`);
const writerPatterns = [
  { name: 'LD (D007CA),HL', kind: 'HL', pattern: [0x22, 0xca, 0x07, 0xd0] },
  { name: 'LD (D007CA),A', kind: 'A', pattern: [0x32, 0xca, 0x07, 0xd0] },
  { name: 'LD (D007CA),DE', kind: 'DE', pattern: [0xed, 0x53, 0xca, 0x07, 0xd0] },
  { name: 'LD (D007CA),BC', kind: 'BC', pattern: [0xed, 0x43, 0xca, 0x07, 0xd0] },
];
const writerHits = [];
for (const wp of writerPatterns) {
  for (const hit of scan(wp.pattern)) writerHits.push({ ...wp, hit });
}
writerHits.sort((a, b) => a.hit - b.hit);
if (!writerHits.length) say('- no direct writer opcode patterns found');
for (const wh of writerHits) {
  say(`### ${hx(wh.hit)} ${wh.name}`);
  say(`Stored value: ${storedValueForWriter(wh.hit, wh.kind)}`);
  for (const row of alignedContext(wh.hit, 16, 8)) say(`${hx(row.pc)}  ${row.raw.padEnd(16)}  ${row.asm}`);
}
say('');
say('### Plain LE refs to D007CA');
for (const ref of refsForTarget(CXMAIN)) {
  const prev = ref.hit > 0 ? rom[ref.hit - 1] : undefined;
  const prev2 = ref.hit > 1 ? rom[ref.hit - 2] : undefined;
  say(`- hit ${hx(ref.hit)} prev=${prev === undefined ? 'n/a' : hx(prev, 2)} prev2=${prev2 === undefined ? 'n/a' : hx(prev2, 2)}: ${ref.kind}${ref.row ? ` via ${hx(ref.row.pc)} ${ref.row.asm}` : ''}`);
}

const modeRows = disasm(MODE_START, MODE_END);
const modeFn = findContainingEntry(modeRows, MODE_WRITE);
const modeBodyEnd = modeFn.after ? modeFn.after.pc + modeFn.after.len : MODE_END;
const modeBody = disasm(modeFn.entry, modeBodyEnd);
const modeTargets = callJumpTargets(modeBody);
const modeEntryRefs = refsForTarget(modeFn.entry);

say('');
say(`## Job 3: ${hx(MODE_START)}-${hx(MODE_END)} ADL disassembly`);
for (const r of modeRows) {
  const mark = r.pc === MODE_WRITE ? '  ; LD (D007E0),A confirmed mode write' : isHardBoundary(r) ? '  ; hard boundary' : '';
  say(`${hx(r.pc)}  ${r.raw.padEnd(16)}  ${r.asm}${mark}`);
}
say('');
say(`Containing-function entry inferred for ${hx(MODE_WRITE)}: ${hx(modeFn.entry)}`);
say(`Hard boundary before ${hx(MODE_WRITE)}: ${modeFn.before ? `${hx(modeFn.before.pc)} ${modeFn.before.asm}; next=${hx(modeFn.before.pc + modeFn.before.len)}` : 'none in window'}`);
say(`Hard boundary after ${hx(MODE_WRITE)}: ${modeFn.after ? `${hx(modeFn.after.pc)} ${modeFn.after.asm}` : 'none in window'}`);
say(`Value in A at ${hx(MODE_WRITE)}: ${aAtWrite(MODE_WRITE)}`);
say('');
say('### CALL/JP/JR targets in containing function');
if (!modeTargets.length) say('- none');
for (const t of modeTargets) say(`- ${hx(t.pc)} ${t.kind}: ${hx(t.target)} (${t.asm})`);
const hasCxMainRef = modeBody.some((r) => r.raw.includes('CA 07 D0') || r.inst.addr === CXMAIN || r.inst.value === CXMAIN);
const homeRegionTargets = modeTargets.filter((t) => t.target >= 0x044000 && t.target <= 0x044fff);
const homeRegionRefs = modeBody.some((r) => (r.inst.addr >= 0x044000 && r.inst.addr <= 0x044fff) || (r.inst.value >= 0x044000 && r.inst.value <= 0x044fff));
say('');
say(`References D007CA in containing function: ${hasCxMainRef ? 'yes' : 'no'}`);
say(`References 0x044xxx in containing function: ${homeRegionRefs || homeRegionTargets.length ? 'yes' : 'no'}`);
if (homeRegionTargets.length) for (const t of homeRegionTargets) say(`- ${hx(t.pc)} ${t.asm}`);
say('');
say(`### Whole-ROM refs to mode function entry ${hx(modeFn.entry)}`);
if (!modeEntryRefs.length) say('- none');
for (const ref of modeEntryRefs) {
  say(`- hit ${hx(ref.hit)}: ${ref.kind}${ref.row ? ` via ${hx(ref.row.pc)} ${ref.row.asm}` : ''}`);
  for (const row of alignedContext(ref.hit, 6, 8)) say(`  ${hx(row.pc)}  ${row.raw.padEnd(16)}  ${row.asm}`);
}

say('');
say('## Ranked candidates and conclusion');
rankedHome.sort((a, b) => b.codeRefs.length - a.codeRefs.length || b.refs.length - a.refs.length);
for (const [idx, item] of rankedHome.entries()) {
  say(`${idx + 1}. ${hx(item.target)}: ${item.codeRefs.length} code refs, ${item.refs.length} total refs${item.target === homeFn.entry ? ' (contains 0x044890)' : ''}`);
}
const modeCallers = modeEntryRefs.filter((r) => r.kind === 'CALL operand' || r.kind === 'JP operand');
say('');
say(`Most plausible static drive-able entry: ${hx(modeFn.entry)} for context setup, because it writes ${hx(HOME_MODE)} with ${aAtWrite(MODE_WRITE)} and has ${modeCallers.length} code reference(s).`);
say(`The local ${hx(modeFn.entry)} function does ${hasCxMainRef ? '' : 'not '}reference D007CA and does ${homeRegionRefs || homeRegionTargets.length ? '' : 'not '}directly reference 0x044xxx, so the static launcher chain likely uses an outer caller or table/event dispatch to combine D007CA setup with this home-mode write before reaching ${hx(homeFn.entry)} and the conditional ${hx(HOME_SITE)} -> ${hx(HOME_ENTRY)} jump.`);
if (writerHits.length) {
  say('D007CA setup candidates are the direct writer sites listed above; rank the ones storing 0x044xxx values highest if present.');
}

const report = lines.join('\n') + '\n';
console.log(report);
fs.writeFileSync(REPORT_PATH, report);

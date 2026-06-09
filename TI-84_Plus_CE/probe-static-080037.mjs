import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase596b-080037-and-helpers.md');
const rom = fs.readFileSync(ROM_PATH);

const routines = [
  { addr: 0x080037, name: 'stall call' },
  { addr: 0x07FACF, name: 'D005FA default helper' },
  { addr: 0x07FAD5, name: 'D00605 default helper' },
  { addr: 0x07FAC2, name: 'D005F9 default helper' },
  { addr: 0x07FAAF, name: 'D00604 default helper' },
];

function hx(n, w = 6) {
  return `0x${(n >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function rawBytes(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function disp(d) {
  return d < 0 ? `${d}` : `+${d}`;
}

function fmtValue(v) {
  return typeof v === 'number' ? hx(v, v > 0xffff ? 6 : v > 0xff ? 4 : 2) : String(v);
}

function fmt(inst) {
  if (inst.dasm) return inst.dasm;
  if (inst.mnemonic) return inst.mnemonic;
  const c = inst.condition ? inst.condition.toUpperCase() : '';
  switch (inst.tag) {
    case 'call': return `CALL ${hx(inst.target)}`;
    case 'call-conditional': return `CALL ${c},${hx(inst.target)}`;
    case 'jr': return `JR ${hx(inst.target)}`;
    case 'jr-conditional': return `JR ${c},${hx(inst.target)}`;
    case 'jp': return `JP ${hx(inst.target)}`;
    case 'jp-conditional': return `JP ${c},${hx(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${c}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()},(${hx(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hx(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'ld-pair-mem': return inst.direction === 'to-mem'
      ? `LD (${hx(inst.addr)}),${inst.pair.toUpperCase()}`
      : `LD ${inst.pair.toUpperCase()},(${hx(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hx(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()},${fmtValue(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()},${fmtValue(inst.value)}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()},(${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${inst.dest.toUpperCase()},(${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}),${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm': return `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}),${fmtValue(inst.value)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${fmtValue(inst.value)}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'nop': return 'NOP';
    case 'scf': return 'SCF';
    case 'cpl': return 'CPL';
    default: return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function disasm(start) {
  const rows = [];
  const seen = new Set();
  let pc = start;
  let consumed = 0;
  while (consumed < 120 && pc < rom.length && !seen.has(pc)) {
    seen.add(pc);
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = inst.length || 1;
    const asm = fmt(inst);
    rows.push({ pc, inst, len, raw: rawBytes(pc, len), asm });
    consumed += len;
    pc += len;
    if (inst.tag === 'ret') break;
    if (inst.tag === 'jr') {
      pc = inst.target;
      continue;
    }
    if (inst.tag === 'jp') break;
  }
  return rows;
}

function collectAccesses(rows) {
  const reads = new Map();
  const writes = new Map();
  let hl = null;
  let de = null;
  let b = null;
  let a = null;

  const add = (map, addr, why) => {
    if (addr == null || addr < 0xD00000 || addr > 0xD3FFFF) return;
    const key = hx(addr);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(why);
  };

  for (const r of rows) {
    const inst = r.inst;
    const asm = r.asm;
    if (inst.tag === 'ld-pair-imm') {
      if (inst.pair === 'hl') hl = inst.value;
      if (inst.pair === 'de') de = inst.value;
      if (inst.pair === 'bc') b = (inst.value >> 8) & 0xff;
    } else if (inst.tag === 'ld-reg-imm') {
      if (inst.dest === 'b') b = inst.value;
      if (inst.dest === 'a') a = inst.value;
    } else if (inst.tag === 'ld-reg-mem') {
      add(reads, inst.addr, asm);
      if (inst.dest === 'a') a = null;
    } else if (inst.tag === 'ld-mem-reg') {
      add(writes, inst.addr, asm);
    } else if (inst.tag === 'ld-pair-mem' && inst.direction !== 'to-mem') {
      add(reads, inst.addr, asm);
      if (inst.pair === 'hl') hl = null;
      if (inst.pair === 'de') de = null;
    } else if (inst.tag === 'ld-pair-mem' || inst.tag === 'ld-mem-pair') {
      add(writes, inst.addr, asm);
    } else if (inst.tag === 'ld-reg-ind') {
      if (inst.src === 'hl') add(reads, hl, asm);
      if (inst.src === 'de') add(reads, de, asm);
      if (inst.dest === 'a') a = null;
    } else if (inst.tag === 'ld-ind-reg') {
      if (inst.dest === 'hl') add(writes, hl, asm);
      if (inst.dest === 'de') add(writes, de, asm);
    } else if (inst.tag === 'ld-ind-imm') {
      add(writes, hl, asm);
    } else if (inst.tag === 'alu-reg' && inst.src === '(hl)') {
      add(reads, hl, asm);
      a = null;
    } else if (inst.tag === 'inc-pair') {
      if (inst.pair === 'hl' && hl != null) hl += 1;
      if (inst.pair === 'de' && de != null) de += 1;
    } else if (inst.tag === 'dec-pair') {
      if (inst.pair === 'hl' && hl != null) hl -= 1;
      if (inst.pair === 'de' && de != null) de -= 1;
    } else if (inst.tag === 'alu-imm' && inst.op !== 'or') {
      a = null;
    } else if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      hl = null;
      de = null;
      a = null;
    }

    if (inst.tag === 'djnz' && hl != null && b != null && rows.some((x) => x.pc === inst.target)) {
      const loopStart = inst.target;
      const loopRows = rows.filter((x) => x.pc >= loopStart && x.pc < r.pc);
      const writesHL = loopRows.some((x) => x.inst.tag === 'ld-ind-reg' && x.inst.dest === 'hl');
      const readsHL = loopRows.some((x) => x.inst.tag === 'ld-reg-ind' && x.inst.src === 'hl');
      const start = hl - 1;
      for (let i = 0; i < b; i += 1) {
        if (writesHL) add(writes, start + i, `loop ${hx(loopStart)}..${hx(r.pc)}`);
        if (readsHL) add(reads, start + i, `loop ${hx(loopStart)}..${hx(r.pc)}`);
      }
    }
  }

  const expand = (map) => [...map.entries()].map(([addr, whys]) => `- ${addr}: ${[...whys].join('; ')}`);
  return { reads: expand(reads), writes: expand(writes) };
}

function sectionFor(routine, rows) {
  const lines = [];
  lines.push(`## ${hx(routine.addr)} - ${routine.name}`);
  lines.push('');
  for (const r of rows) lines.push(`${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}`);
  lines.push('');
  const accesses = collectAccesses(rows);
  lines.push('### RAM reads');
  lines.push(...(accesses.reads.length ? accesses.reads : ['- none decoded in the 120-byte linear slice']));
  lines.push('');
  lines.push('### RAM writes');
  lines.push(...(accesses.writes.length ? accesses.writes : ['- none decoded in the 120-byte linear slice']));
  lines.push('');
  return lines;
}

const decoded = new Map(routines.map((r) => [r.addr, disasm(r.addr)]));
const lines = [];
lines.push('# Phase596b 0x080037 and descriptor default helpers');
lines.push('');
lines.push(`ROM: ${ROM_PATH}`);
lines.push('');

for (const routine of routines) {
  lines.push(...sectionFor(routine, decoded.get(routine.addr)));
}

lines.push('## Behavioral conclusions');
lines.push('');
lines.push('`0x080037` is not a long-running or diverting routine in this ROM image. It reads `0xD005F9`, loads `HL=0xD00604`, subtracts `(HL)`, and returns immediately. The decoded body has no `CALL`, no computed jump, no direct `JP`, and no clock/PLL or display-reinit edge. It returns to the populator for all states; the only state it communicates is flags from `D005F9 - D00604`: `Z` when the two descriptor class/length bytes match, `NZ` when they differ, and carry when `D005F9 < D00604`.');
lines.push('');
lines.push('`0x07FACF` supplies the default left descriptor when `D005FA==0`: it sets `HL=0xD005F8`, clears `A`, writes zeros through the shared tail, and returns with `D005F8..D00601` zeroed. `0x07FAD5` is the matching right-side helper when `D00605==0`: it sets `HL=0xD00603`, clears `A`, and returns with `D00603..D0060C` zeroed. These are zero-descriptor defaults, not non-returning helpers.');
lines.push('');
lines.push('`0x07FAC2` supplies the default left descriptor when `D005F9==0`: it starts at `0xD005F8`, leaves `D005F8` as zero via the jump-into-tail path, stores `0x80` at `D005F9`, stores `0x00` at `D005FA`, then clears `D005FB..D00600` before returning. `0x07FAAF` supplies the right descriptor default when `D00604==0`: it clears `A` but immediately tail-jumps to `0x07FA2F`, which sets `A=0x50`, writes `D00603=0x00`, `D00604=0x80`, `D00605=0x50`, then clears `D00606..D0060B` before returning. For the empty-descriptor comparator path, `0x080037` itself always returns normally; to avoid the caller taking the `JR NZ` after that call, the state must have `D005F9 == D00604`. The helper defaults make that true for the class/length byte by using `0x80` on both sides.');

const report = lines.join('\n') + '\n';
console.log(report);
fs.writeFileSync(REPORT_PATH, report);

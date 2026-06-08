/**
 * probe-phase569-map-0021xx-syscalls.mjs
 *
 * Map the 0x0021xx syscall cluster.
 * Vector table at 0x000130-0x000150 holds JP instructions dispatching
 * to utilities in the 0x002xxx range. Disassemble each target function,
 * find boundaries, count ROM-wide callers.
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));
function romByte(addr) { return rom[addr]; }
function rom24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }

const MODE = 'adl';

function hex(v, w = 6) { return '0x' + v.toString(16).padStart(w, '0'); }
function byteHex(v) { return v.toString(16).padStart(2, '0'); }
function bytesAt(addr, len) {
  const b = [];
  for (let i = 0; i < len; i++) b.push(byteHex(romByte(addr + i)));
  return b.join(' ');
}

/** Format a decoded instruction into a human-readable mnemonic string */
function formatInstr(inst) {
  const t = inst.tag;
  if (!t) return '???';

  // Conditional suffix
  const cond = inst.condition ? inst.condition + ', ' : '';

  switch (t) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'daa': return 'DAA';
    case 'neg': return 'NEG';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rld': return 'RLD';
    case 'rrd': return 'RRD';
    case 'exx': return 'EXX';
    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'ini': return 'INI';
    case 'inir': return 'INIR';
    case 'ind': return 'IND';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'otir': return 'OTIR';
    case 'outd': return 'OUTD';
    case 'otdr': return 'OTDR';

    case 'ret': return inst.condition ? `RET ${inst.condition}` : 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';

    case 'push': return `PUSH ${(inst.pair || '??').toUpperCase()}`;
    case 'pop': return `POP ${(inst.pair || '??').toUpperCase()}`;

    case 'jp':
      if (inst.condition) return `JP ${inst.condition}, ${hex(inst.target)}`;
      return `JP ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${(inst.reg || 'HL').toUpperCase()})`;
    case 'jr':
      if (inst.condition) return `JR ${inst.condition}, ${hex(inst.target)}`;
      return `JR ${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'call':
      if (inst.condition) return `CALL ${inst.condition}, ${hex(inst.target)}`;
      return `CALL ${hex(inst.target)}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;

    case 'ld-pair-imm':
      return `LD ${(inst.pair || '??').toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `LD ${(inst.dst || '??').toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${(inst.dst || '??').toUpperCase()}, ${(inst.src || '??').toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${(inst.dst || '??').toUpperCase()}, (${(inst.src || 'HL').toUpperCase()}${inst.offset !== undefined ? (inst.offset >= 0 ? '+' : '') + inst.offset : ''})`;
    case 'ld-mem-reg':
      return `LD (${(inst.dst || 'HL').toUpperCase()}${inst.offset !== undefined ? (inst.offset >= 0 ? '+' : '') + inst.offset : ''}), ${(inst.src || '??').toUpperCase()}`;
    case 'ld-a-indirect':
      return `LD A, (${(inst.pair || hex(inst.address)).toString().toUpperCase()})`;
    case 'ld-indirect-a':
      return `LD (${(inst.pair || hex(inst.address)).toString().toUpperCase()}), A`;
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'ld-sp-pair':
      return `LD SP, ${(inst.pair || 'HL').toUpperCase()}`;
    case 'ld-pair-mem':
      return `LD ${(inst.pair || '??').toUpperCase()}, (${hex(inst.address)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.address)}), ${(inst.pair || '??').toUpperCase()}`;
    case 'ld-mem-imm':
      return `LD (HL), ${hex(inst.value, 2)}`;

    case 'alu-reg': {
      const op = (inst.op || '???').toUpperCase();
      const src = (inst.src || '??').toUpperCase();
      if (op === 'CP' || op === 'OR' || op === 'AND' || op === 'XOR' || op === 'SUB')
        return `${op} ${src}`;
      return `${op} A, ${src}`;
    }
    case 'alu-imm': {
      const op = (inst.op || '???').toUpperCase();
      if (op === 'CP' || op === 'OR' || op === 'AND' || op === 'XOR' || op === 'SUB')
        return `${op} ${hex(inst.value, 2)}`;
      return `${op} A, ${hex(inst.value, 2)}`;
    }
    case 'alu-mem': {
      const op = (inst.op || '???').toUpperCase();
      const base = inst.reg ? `(${inst.reg.toUpperCase()}${inst.offset !== undefined ? (inst.offset >= 0 ? '+' : '') + inst.offset : ''})` : '(HL)';
      if (op === 'CP' || op === 'OR' || op === 'AND' || op === 'XOR' || op === 'SUB')
        return `${op} ${base}`;
      return `${op} A, ${base}`;
    }

    case 'inc-reg': return `INC ${(inst.reg || '??').toUpperCase()}`;
    case 'dec-reg': return `DEC ${(inst.reg || '??').toUpperCase()}`;
    case 'inc-pair': return `INC ${(inst.pair || '??').toUpperCase()}`;
    case 'dec-pair': return `DEC ${(inst.pair || '??').toUpperCase()}`;
    case 'inc-mem': return `INC (${(inst.reg || 'HL').toUpperCase()}${inst.offset !== undefined ? (inst.offset >= 0 ? '+' : '') + inst.offset : ''})`;
    case 'dec-mem': return `DEC (${(inst.reg || 'HL').toUpperCase()}${inst.offset !== undefined ? (inst.offset >= 0 ? '+' : '') + inst.offset : ''})`;

    case 'add-pair':
      return `ADD ${(inst.dst || 'HL').toUpperCase()}, ${(inst.src || '??').toUpperCase()}`;
    case 'adc-pair':
      return `ADC HL, ${(inst.src || '??').toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL, ${(inst.src || '??').toUpperCase()}`;

    case 'ex-sp':
      return `EX (SP), ${(inst.pair || 'HL').toUpperCase()}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-af': return "EX AF, AF'";

    case 'bit': return `BIT ${inst.bit}, ${(inst.reg || '??').toUpperCase()}`;
    case 'set': return `SET ${inst.bit}, ${(inst.reg || '??').toUpperCase()}`;
    case 'res': return `RES ${inst.bit}, ${(inst.reg || '??').toUpperCase()}`;

    case 'rl': return `RL ${(inst.reg || '??').toUpperCase()}`;
    case 'rr': return `RR ${(inst.reg || '??').toUpperCase()}`;
    case 'rlc': return `RLC ${(inst.reg || '??').toUpperCase()}`;
    case 'rrc': return `RRC ${(inst.reg || '??').toUpperCase()}`;
    case 'sla': return `SLA ${(inst.reg || '??').toUpperCase()}`;
    case 'sra': return `SRA ${(inst.reg || '??').toUpperCase()}`;
    case 'srl': return `SRL ${(inst.reg || '??').toUpperCase()}`;

    case 'in-reg':
      return `IN ${(inst.reg || '??').toUpperCase()}, (${inst.port !== undefined ? hex(inst.port, 2) : 'C'})`;
    case 'out-reg':
      return `OUT (${inst.port !== undefined ? hex(inst.port, 2) : 'C'}), ${(inst.reg || '??').toUpperCase()}`;
    case 'in-a': return `IN A, (${hex(inst.port, 2)})`;
    case 'out-a': return `OUT (${hex(inst.port, 2)}), A`;

    case 'im': return `IM ${inst.mode_val ?? '?'}`;

    case 'tst-a': return `TST A, ${hex(inst.value, 2)}`;
    case 'lea':
      return `LEA ${(inst.dst || '??').toUpperCase()}, ${(inst.src || 'IX').toUpperCase()}+${inst.offset || 0}`;
    case 'pea':
      return `PEA ${(inst.reg || 'IX').toUpperCase()}+${inst.offset || 0}`;
    case 'mlt':
      return `MLT ${(inst.pair || '??').toUpperCase()}`;

    default:
      // Catch-all: dump all non-standard fields
      const extra = Object.entries(inst)
        .filter(([k]) => !['pc','length','nextPc','tag','mode','modePrefix','terminates','fallthrough'].includes(k))
        .map(([k,v]) => `${k}=${v}`)
        .join(' ');
      return `[${t}] ${extra}`;
  }
}

/** Is this an unconditional terminator? */
function isTerminator(inst) {
  if (!inst.tag) return false;
  if (inst.tag === 'ret' && !inst.condition) return true;
  if (inst.tag === 'reti' || inst.tag === 'retn') return true;
  if (inst.tag === 'jp' && !inst.condition) return true;
  if (inst.tag === 'jp-indirect') return true;
  return false;
}

function countCallers(target) {
  let count = 0;
  const b0 = target & 0xFF;
  const b1 = (target >>> 8) & 0xFF;
  const b2 = (target >>> 16) & 0xFF;
  for (let i = 0; i <= rom.length - 4; i++) {
    if (rom[i] === 0xCD && rom[i+1] === b0 && rom[i+2] === b1 && rom[i+3] === b2) count++;
  }
  return count;
}

function disassemble(start, maxInstr = 60) {
  const instrs = [];
  let pc = start;
  let hitEnd = false;
  for (let i = 0; i < maxInstr; i++) {
    const inst = decodeInstruction(rom, pc, MODE);
    const len = inst.length || 1;
    instrs.push({ addr: pc, inst, len, bytes: bytesAt(pc, len), text: formatInstr(inst) });
    if (isTerminator(inst)) { hitEnd = true; pc += len; break; }
    pc += len;
  }
  return { start, end: pc, size: pc - start, instrs, hitEnd };
}

function classifyFn(fn) {
  const tags = fn.instrs.map(i => i.inst.tag);
  const texts = fn.instrs.map(i => i.text).join('\n');

  // 0x0021C2 pattern: PUSH HL, PUSH DE, LD DE,0, OR A, SBC HL,DE, POP DE, POP HL, RET
  if (/SBC HL, DE/.test(texts) && /LD DE, 0x000000/.test(texts)) return 'null-check (HL==0 test via SBC HL,DE=0)';
  if (/EX \(SP\), IX/.test(texts) && /ADD IX/.test(texts)) return 'stack-frame setup (IX)';
  if (/EX \(SP\), IX/.test(texts)) return 'return-addr manipulation (IX)';
  if (/EX \(SP\), IY/.test(texts)) return 'return-addr manipulation (IY)';
  if (/MLT/.test(texts)) return '24-bit multiply helper';
  if (/SBC HL.*\n.*SBC HL/s.test(texts)) return 'multi-word subtract/compare';
  if (/JP \(IY\)/.test(texts)) return 'indirect dispatch via IY';
  if (/JP \(HL\)/.test(texts)) return 'indirect dispatch via HL';
  if (/LEA.*IX/.test(texts) && /PUSH/.test(texts)) return 'IX offset helper (LEA+PUSH)';
  if (/LEA.*IY/.test(texts) && /PUSH/.test(texts)) return 'IY offset helper (LEA+PUSH)';
  if (/AND.*\(HL\)|OR.*\(HL\)|XOR.*\(HL\)/.test(texts)) return 'bitwise memory AND/OR';
  if (/ADD HL/.test(texts) && /ADC HL/.test(texts)) return '24-bit division/shift';
  if (/LD SP, HL/.test(texts)) return 'stack pointer restore';
  return 'utility';
}

// --- Main ---
console.log('=== Phase 569: 0x0021xx syscall cluster map ===\n');
console.log(`ROM size: ${rom.length} bytes\n`);

// Step 1: Dump vector table
const VSTART = 0x000130;
const VEND   = 0x000150;
console.log(`=== Vector table ${hex(VSTART)}-${hex(VEND)} ===\n`);

const vectors = [];
for (let addr = VSTART; addr < VEND; addr += 4) {
  const op = romByte(addr);
  const target = rom24(addr + 1);
  const isJp = (op === 0xC3);
  const callers = countCallers(addr);
  vectors.push({ addr, target, isJp, callers });
  console.log(`  ${hex(addr)}: ${bytesAt(addr, 4)}  ${isJp ? 'JP' : '??'} ${hex(target)}  callers=${callers}`);
}

// Step 2: Disassemble each target function (stop at RET/JP boundary)
console.log('\n=== Function disassembly ===\n');

const summaries = [];
const seen = new Set();

for (const v of vectors) {
  if (!v.isJp) continue;

  console.log(`--- ${hex(v.addr)} -> ${hex(v.target)} (${v.callers} callers) ---\n`);

  if (seen.has(v.target)) {
    console.log('  [duplicate target, already disassembled]\n');
    const prior = summaries.find(s => s.target === v.target);
    summaries.push({ vector: v.addr, target: v.target, size: prior?.size || 0, purpose: (prior?.purpose || '?') + ' (dup)', callers: v.callers });
    continue;
  }
  seen.add(v.target);

  const fn = disassemble(v.target);
  const purpose = classifyFn(fn);

  console.log(`  Range: ${hex(fn.start)}-${hex(fn.end - 1)} (${fn.size}B), terminated=${fn.hitEnd}`);
  console.log(`  Purpose: ${purpose}\n`);

  for (const i of fn.instrs) {
    console.log(`  ${hex(i.addr)}: ${i.bytes.padEnd(20)} ${i.text}`);
  }
  console.log('');

  summaries.push({ vector: v.addr, target: v.target, size: fn.size, purpose, callers: v.callers });
}

// Step 3: Also scan for additional functions between the last vector target and the end of the cluster
// Find the range bounds
const allTargets = vectors.map(v => v.target).sort((a, b) => a - b);
const clusterStart = allTargets[0];
const lastTarget = allTargets[allTargets.length - 1];
// Disassemble from last target's end to find any trailing functions
const lastFn = disassemble(lastTarget);
const clusterEnd = lastFn.end;

console.log(`=== Cluster spans ${hex(clusterStart)}-${hex(clusterEnd - 1)} ===\n`);

// Step 4: Find non-vector-target functions within the cluster
console.log('=== Non-vector functions in cluster range ===\n');

// Walk through the cluster looking for function boundaries that aren't vector targets
const vectorTargetSet = new Set(vectors.map(v => v.target));
let scanAddr = clusterStart;
while (scanAddr < clusterEnd) {
  const fn = disassemble(scanAddr);
  if (!vectorTargetSet.has(scanAddr)) {
    const callers = countCallers(scanAddr);
    if (callers > 0) {
      const purpose = classifyFn(fn);
      console.log(`  Sub-function at ${hex(scanAddr)} (${fn.size}B, ${callers} direct callers): ${purpose}`);
      for (const i of fn.instrs) {
        console.log(`    ${hex(i.addr)}: ${i.bytes.padEnd(20)} ${i.text}`);
      }
      console.log('');
      summaries.push({ vector: null, target: scanAddr, size: fn.size, purpose: purpose + ' [sub-fn]', callers });
    }
  }
  scanAddr = fn.end;
  if (!fn.hitEnd) break; // stop if we can't find a clean boundary
}

// Step 5: Summary table
console.log('=== SUMMARY TABLE ===\n');
console.log('Vector     | Target     | Size | Callers | Purpose');
console.log('-----------|------------|------|---------|-----------------------------------');
for (const s of summaries) {
  const vecStr = s.vector ? hex(s.vector) : '  (sub) ';
  console.log(`${vecStr} | ${hex(s.target)} | ${String(s.size).padStart(4)} | ${String(s.callers).padStart(7)} | ${s.purpose}`);
}

console.log('\nPhase 569 probe complete.');
process.exit(0);

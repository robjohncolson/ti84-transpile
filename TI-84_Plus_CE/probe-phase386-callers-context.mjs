#!/usr/bin/env node
/**
 * Phase 386: Trace the two external callers of the translation dispatcher (0x02FEC8).
 *
 * Caller 1: 0x05B24B  CALL P,0x02FEC8   (positive sign flag)
 * Caller 2: 0x0773ED  CALL PE,0x02FEF1  (parity even flag)
 *
 * For each caller:
 *   - Disassemble ~80 bytes before the call
 *   - Disassemble ~40 bytes after the call
 *   - Scan backwards for function entry (after RET/RETI)
 *   - Annotate RAM/port accesses, register setup before the call
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const ROM_LIMIT = 0x400000;

const rom = fs.readFileSync(ROM_PATH).subarray(0, ROM_LIMIT);

function hex(v, w = 6) {
  return '0x' + v.toString(16).padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xff).toString(16).padStart(2, '0');
}

function bytesToHex(start, len) {
  const parts = [];
  for (let i = 0; i < len && start + i < rom.length; i++) {
    parts.push(rom[start + i].toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function formatIndexedOperand(indexReg, disp) {
  const sign = disp >= 0 ? '+' : '';
  return `(${indexReg}${sign}${disp})`;
}

function fallbackFormat(d) {
  const skip = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'tag']);
  const parts = [];
  for (const [k, v] of Object.entries(d)) {
    if (skip.has(k) || v === undefined) continue;
    if (typeof v === 'number') {
      if (k === 'value' || k === 'port') { parts.push(`${k}=${hexByte(v)}`); continue; }
      if (k === 'displacement') { parts.push(`${k}=${v >= 0 ? '+' + v : v}`); continue; }
      if (k === 'bit') { parts.push(`${k}=${v}`); continue; }
      parts.push(`${k}=${hex(v)}`);
      continue;
    }
    parts.push(`${k}=${v}`);
  }
  return parts.length === 0 ? d.tag : `${d.tag} ${parts.join(' ')}`;
}

function fmt(d) {
  if (!d || !d.tag) return '???';
  switch (d.tag) {
    case 'nop': case 'ret': case 'reti': case 'retn': case 'di': case 'ei':
    case 'exx': case 'halt': case 'slp': case 'cpl': case 'scf': case 'ccf':
    case 'daa': case 'rrca': case 'rlca': case 'rla': case 'rra':
    case 'neg': case 'ldi': case 'ldir': case 'ldd': case 'lddr':
    case 'cpi': case 'cpir': case 'cpd': case 'cpdr':
    case 'ini': case 'inir': case 'ind': case 'indr':
    case 'outi': case 'otir': case 'outd': case 'otdr':
      return d.tag;
    case 'ret-conditional': return `ret ${d.condition}`;
    case 'jr': return `jr ${hex(d.target)}`;
    case 'jr-conditional': return `jr ${d.condition}, ${hex(d.target)}`;
    case 'djnz': return `djnz ${hex(d.target)}`;
    case 'jp': return `jp ${hex(d.target)}`;
    case 'jp-conditional': return `jp ${d.condition}, ${hex(d.target)}`;
    case 'jp-indirect': return `jp (${d.indirectRegister})`;
    case 'call': return `call ${hex(d.target)}`;
    case 'call-conditional': return `call ${d.condition}, ${hex(d.target)}`;
    case 'rst': return `rst ${hexByte(d.target)}`;
    case 'push': return `push ${d.pair}`;
    case 'pop': return `pop ${d.pair}`;
    case 'inc-pair': return `inc ${d.pair}`;
    case 'dec-pair': return `dec ${d.pair}`;
    case 'inc-reg': return `inc ${d.reg}`;
    case 'dec-reg': return `dec ${d.reg}`;
    case 'ld-pair-imm': return `ld ${d.pair}, ${hex(d.value)}`;
    case 'ld-reg-imm': return `ld ${d.dest}, ${hexByte(d.value)}`;
    case 'ld-reg-reg': return `ld ${d.dest}, ${d.src}`;
    case 'ld-reg-ind': return `ld ${d.dest}, (${d.src})`;
    case 'ld-ind-reg': return `ld (${d.dest}), ${d.src}`;
    case 'ld-reg-mem': return `ld ${d.dest}, (${hex(d.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(d.addr)}), ${d.src}`;
    case 'ld-pair-mem':
      return d.direction === 'from-mem'
        ? `ld ${d.pair}, (${hex(d.addr)})`
        : `ld (${hex(d.addr)}), ${d.pair}`;
    case 'ld-pair-ind': return `ld ${d.pair}, (${d.src})`;
    case 'ld-ind-pair': return `ld (${d.dest}), ${d.pair}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-pair': return `ld sp, ${d.pair}`;
    case 'add-pair': return `add ${d.dest}, ${d.src}`;
    case 'alu-reg': return `${d.op} ${d.src}`;
    case 'alu-imm': return `${d.op} ${hexByte(d.value)}`;
    case 'in-imm': return `in a, (${hexByte(d.port)})`;
    case 'out-imm': return `out (${hexByte(d.port)}), a`;
    case 'in-reg': return `in ${d.dest}, (c)`;
    case 'out-reg': return `out (c), ${d.src}`;
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ex-sp-pair': return `ex (sp), ${d.pair}`;
    case 'ex-af': return "ex af, af'";
    case 'bit-test': return `bit ${d.bit}, ${d.reg}`;
    case 'bit-test-ind': return `bit ${d.bit}, (${d.indirectRegister})`;
    case 'bit-res': return `res ${d.bit}, ${d.reg}`;
    case 'bit-res-ind': return `res ${d.bit}, (${d.indirectRegister})`;
    case 'bit-set': return `set ${d.bit}, ${d.reg}`;
    case 'bit-set-ind': return `set ${d.bit}, (${d.indirectRegister})`;
    case 'rotate-reg': return `${d.op} ${d.reg}`;
    case 'rotate-ind': return `${d.op} (${d.indirectRegister})`;
    case 'indexed-ld-reg':
      return `ld ${d.dest}, ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-ld-ind':
      return `ld ${formatIndexedOperand(d.indexRegister, d.displacement)}, ${d.src}`;
    case 'indexed-ld-imm':
      return `ld ${formatIndexedOperand(d.indexRegister, d.displacement)}, ${hexByte(d.value)}`;
    case 'indexed-inc':
      return `inc ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-dec':
      return `dec ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-alu':
      return `${d.op} ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-bit':
      return `bit ${d.bit}, ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-rotate':
      return `${d.op} ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-res':
      return `res ${d.bit}, ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-set':
      return `set ${d.bit}, ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'lea':
      return `lea ${d.dest}, ${formatIndexedOperand(d.base, d.displacement)}`;
    case 'sbc-pair': return `sbc hl, ${d.src}`;
    case 'adc-pair': return `adc hl, ${d.src}`;
    case 'im': return `im ${d.mode}`;
    case 'ld-i-a': return 'ld i, a';
    case 'ld-a-i': return 'ld a, i';
    case 'ld-r-a': return 'ld r, a';
    case 'ld-a-r': return 'ld a, r';
    case 'rrd': return 'rrd';
    case 'rld': return 'rld';
    case 'tst-imm': return `tst ${hexByte(d.value)}`;
    case 'tst-reg': return `tst ${d.reg}`;
    default: return fallbackFormat(d);
  }
}

// Known OS RAM symbols
const KNOWN_RAM = {
  0xD0008C: 'kbdScanCode',
  0xD0008E: 'kbdLGSC',
  0xD00090: 'kbdPSC',
  0xD00587: 'kbdKey',
  0xD00588: 'kbdGetKy',
  0xD0058A: 'kbdGroup',
  0xD00080: 'flags',
  0xD00081: 'flags+1',
  0xD00082: 'flags+2',
  0xD00083: 'flags+3',
  0xD00084: 'flags+4',
  0xD0244F: 'curRow',
  0xD02450: 'curCol',
  0xD02688: 'penCol',
  0xD02689: 'penRow',
  0xD024BE: 'unknown_D024BE',
  0xD014FE: 'unknown_D014FE',
};

const KNOWN_FUNCS = {
  0x020118: '_GetCSC',
  0x020164: '_GetKey',
  0x02FEC8: 'translationDispatcher',
  0x02FEF1: 'translationDispatcher+0x29',
  0x0300CB: 'kbdKey_processor',
  0x02FEDB: 'translationDispatcher_caller',
  0x082961: '???_082961',
  0x055996: '???_055996',
  0x05B85E: '???_05B85E',
  0x05B820: '???_05B820',
  0x0B17BF: '???_0B17BF',
  0x05ACDD: '???_05ACDD',
  0x05BF5C: '???_05BF5C',
  0x05E132: '???_05E132',
  0x061D22: '???_061D22',
  0x061D2C: '???_061D2C',
  0x082902: '???_082902',
  0x0801D3: '???_0801D3',
  0x076FE1: '???_076FE1',
  0x0775F8: '???_0775F8',
  0x07768A: '???_07768A',
  0x07F8CC: '???_07F8CC',
};

function annotate(d) {
  if (!d || !d.tag) return '';
  const notes = [];

  // RAM/MMIO access
  const addr = d.addr;
  if (addr !== undefined && typeof addr === 'number') {
    if (KNOWN_RAM[addr]) notes.push(`; ${KNOWN_RAM[addr]}`);
    else if (addr >= 0xD00000 && addr < 0xE00000) notes.push(`; RAM`);
    else if (addr >= 0xF00000) notes.push('; MMIO');
  }

  // Call/JP targets
  if (d.target !== undefined && typeof d.target === 'number') {
    if ((d.tag.startsWith('call') || d.tag.startsWith('jp') || d.tag === 'rst') && KNOWN_FUNCS[d.target]) {
      notes.push(`; => ${KNOWN_FUNCS[d.target]}`);
    }
  }

  // Port I/O
  if (d.tag === 'in-imm' || d.tag === 'out-imm' || d.tag === 'in-reg' || d.tag === 'out-reg') {
    notes.push('; PORT I/O');
  }

  return notes.join(' ');
}

// Disassemble range, return instructions
function disasm(startAddr, endAddr) {
  const results = [];
  let pc = startAddr;
  while (pc < endAddr && pc < ROM_LIMIT) {
    try {
      const d = decodeInstruction(rom, pc, 'adl');
      if (!d || !d.length || d.length <= 0) {
        results.push({ addr: pc, len: 1, text: `db ${hexByte(rom[pc])}`, decoded: null });
        pc++;
        continue;
      }
      results.push({ addr: pc, len: d.length, text: fmt(d), decoded: d });
      pc += d.length;
    } catch {
      results.push({ addr: pc, len: 1, text: `db ${hexByte(rom[pc])}`, decoded: null });
      pc++;
    }
  }
  return results;
}

// Find likely function entry by scanning backwards for RET/JP (unconditional)
function findFuncEntry(addr, maxBack = 300) {
  const scanStart = Math.max(0, addr - maxBack);
  const instrs = disasm(scanStart, addr);

  let lastTermIdx = -1;
  for (let i = 0; i < instrs.length; i++) {
    const d = instrs[i].decoded;
    if (!d) continue;
    const t = d.tag;
    if (t === 'ret' || t === 'reti' || t === 'retn') {
      lastTermIdx = i;
    } else if (t === 'jp' && d.target !== undefined) {
      // Unconditional JP (not jp-conditional, not jp-indirect)
      lastTermIdx = i;
    }
  }

  if (lastTermIdx >= 0 && lastTermIdx + 1 < instrs.length) {
    return instrs[lastTermIdx + 1].addr;
  }
  return null;
}

function printLine(addr, len, text, ann, marker) {
  const raw = bytesToHex(addr, len).padEnd(18);
  const m = marker || '  ';
  console.log(`${m} ${hex(addr)}  ${raw}  ${text.padEnd(35)} ${ann}`);
}

// ---- Main ----

const CALLERS = [
  { addr: 0x05B24B, target: 0x02FEC8, desc: 'CALL P,0x02FEC8 (sign positive => no modifier key)' },
  { addr: 0x0773ED, target: 0x02FEF1, desc: 'CALL PE,0x02FEF1 (parity even => post-modifier)' },
];

console.log('='.repeat(90));
console.log('Phase 386: Translation Dispatcher External Callers Context');
console.log('='.repeat(90));

for (const caller of CALLERS) {
  console.log('\n' + '#'.repeat(90));
  console.log(`# CALLER: ${hex(caller.addr)} -- ${caller.desc}`);
  console.log('#'.repeat(90));

  // Verify the call
  const callD = decodeInstruction(rom, caller.addr, 'adl');
  console.log(`\nVerification: ${fmt(callD)} [${callD.length} bytes]`);
  console.log(`  Raw: ${bytesToHex(caller.addr, callD.length)}`);

  // Find function entry
  const funcEntry = findFuncEntry(caller.addr);
  if (funcEntry !== null) {
    console.log(`Function entry: ${hex(funcEntry)} (${caller.addr - funcEntry} bytes before call)`);
  } else {
    console.log('Function entry: not found within 300 bytes');
  }

  // Disassemble from function entry (or 80 bytes before) up to call
  const beforeStart = funcEntry !== null
    ? Math.min(funcEntry, caller.addr - 80)
    : caller.addr - 80;
  const safeStart = Math.max(0, beforeStart);

  console.log(`\n--- BEFORE (${hex(safeStart)} .. ${hex(caller.addr - 1)}) ---`);
  const beforeInstrs = disasm(safeStart, caller.addr);
  for (const i of beforeInstrs) {
    const marker = (funcEntry !== null && i.addr === funcEntry) ? '>>' : '  ';
    printLine(i.addr, i.len, i.text, annotate(i.decoded), marker);
  }

  // The call itself
  printLine(caller.addr, callD.length, fmt(callD), annotate(callD), '**');

  // After
  const afterStart = caller.addr + callD.length;
  const afterEnd = afterStart + 60; // a bit more than 40 to catch the next RET
  console.log(`\n--- AFTER (${hex(afterStart)} .. ${hex(afterEnd - 1)}) ---`);
  const afterInstrs = disasm(afterStart, afterEnd);
  for (const i of afterInstrs) {
    printLine(i.addr, i.len, i.text, annotate(i.decoded));
  }

  // Summary of all CALL/JP targets in the function vicinity
  const fullStart = funcEntry || (caller.addr - 200);
  const fullEnd = Math.min(ROM_LIMIT, caller.addr + 200);
  const allInstrs = disasm(Math.max(0, fullStart), fullEnd);

  const calls = [];
  const rams = [];
  const ports = [];

  for (const i of allInstrs) {
    const d = i.decoded;
    if (!d) continue;

    if ((d.tag === 'call' || d.tag === 'call-conditional' || d.tag === 'jp' || d.tag === 'jp-conditional') && d.target !== undefined) {
      calls.push({ addr: i.addr, target: d.target, text: i.text });
    }
    if (d.tag === 'in-imm' || d.tag === 'out-imm' || d.tag === 'in-reg' || d.tag === 'out-reg') {
      ports.push({ addr: i.addr, text: i.text });
    }
    if (d.addr !== undefined && typeof d.addr === 'number' && d.addr >= 0xD00000) {
      rams.push({ addr: i.addr, ramAddr: d.addr, text: i.text, sym: KNOWN_RAM[d.addr] || '' });
    }
  }

  console.log(`\n--- CALL/JP targets in function vicinity ---`);
  for (const c of calls) {
    const label = KNOWN_FUNCS[c.target] ? ` => ${KNOWN_FUNCS[c.target]}` : '';
    console.log(`  ${hex(c.addr)}: ${c.text}${label}`);
  }

  console.log(`\n--- RAM accesses in function vicinity ---`);
  for (const r of rams) {
    console.log(`  ${hex(r.addr)}: ${r.text}  [${hex(r.ramAddr)}${r.sym ? ' = ' + r.sym : ''}]`);
  }

  if (ports.length > 0) {
    console.log(`\n--- Port I/O in function vicinity ---`);
    for (const p of ports) {
      console.log(`  ${hex(p.addr)}: ${p.text}`);
    }
  }
}

// Scan for references TO the functions containing our callers
console.log('\n' + '='.repeat(90));
console.log('CROSS-REFERENCE: Who calls the functions containing the callers?');
console.log('='.repeat(90));

for (const caller of CALLERS) {
  const funcEntry = findFuncEntry(caller.addr);
  if (!funcEntry) {
    console.log(`\n${hex(caller.addr)}: function entry unknown, skipping xref scan`);
    continue;
  }

  console.log(`\nScanning ROM for CALL/JP to ${hex(funcEntry)} (function containing ${hex(caller.addr)})...`);
  let pc = 0;
  const refs = [];
  while (pc < ROM_LIMIT) {
    try {
      const d = decodeInstruction(rom, pc, 'adl');
      if (!d || d.length <= 0) { pc++; continue; }
      if ((d.tag === 'call' || d.tag === 'call-conditional' || d.tag === 'jp' || d.tag === 'jp-conditional') && d.target === funcEntry) {
        refs.push({ addr: pc, text: fmt(d) });
      }
      pc += d.length;
    } catch {
      pc++;
    }
  }
  console.log(`  Found ${refs.length} references:`);
  for (const r of refs) {
    console.log(`    ${hex(r.addr)}: ${r.text}`);
  }
}

// ---- FALSE POSITIVE VERIFICATION ----
console.log('\n' + '='.repeat(90));
console.log('INSTRUCTION BOUNDARY VERIFICATION');
console.log('='.repeat(90));

for (const caller of CALLERS) {
  console.log(`\n${hex(caller.addr)}: checking if this is a real instruction start...`);

  // Decode from a few bytes before to see if any instruction spans this address
  let isFalsePositive = false;
  for (let back = 1; back <= 6; back++) {
    const prev = caller.addr - back;
    if (prev < 0) continue;
    try {
      const pd = decodeInstruction(rom, prev, 'adl');
      if (pd && pd.length > back) {
        console.log(`  *** FALSE POSITIVE: instruction at ${hex(prev)} is ${fmt(pd)} (${pd.length} bytes)`);
        console.log(`      Byte at ${hex(caller.addr)} is byte ${back + 1} of that instruction`);
        console.log(`      The byte 0x${rom[caller.addr].toString(16)} is the displacement/data of a JR instruction,`);
        console.log(`      not the opcode for CALL ${caller.addr === 0x05B24B ? 'P' : 'PE'}`);
        isFalsePositive = true;
        break;
      }
    } catch {}
  }

  if (!isFalsePositive) {
    console.log(`  CONFIRMED: ${hex(caller.addr)} is a valid instruction start`);
  }

  // Verify by linear disassembly from function entry
  const funcEntry = findFuncEntry(caller.addr);
  if (funcEntry) {
    let pc = funcEntry;
    let reachesAddr = false;
    while (pc < caller.addr + 10 && pc < ROM_LIMIT) {
      try {
        const d = decodeInstruction(rom, pc, 'adl');
        if (!d || d.length <= 0) break;
        if (pc === caller.addr) {
          reachesAddr = true;
          console.log(`  Linear disasm from ${hex(funcEntry)} REACHES ${hex(caller.addr)}: ${fmt(d)}`);
          break;
        }
        if (pc > caller.addr) {
          console.log(`  Linear disasm from ${hex(funcEntry)} SKIPS ${hex(caller.addr)} (lands at ${hex(pc)})`);
          break;
        }
        pc += d.length;
      } catch { break; }
    }
    if (!reachesAddr && pc <= caller.addr) {
      console.log(`  Linear disasm did not reach ${hex(caller.addr)}`);
    }
  }
}

// Summary
console.log('\n' + '='.repeat(90));
console.log('ANALYSIS SUMMARY');
console.log('='.repeat(90));
console.log(`
CRITICAL FINDING: Both "external callers" are FALSE POSITIVES from byte-pattern scanning.

1. ${hex(CALLERS[0].addr)}: NOT a CALL P instruction
   - Actually byte 2 of JR C at 0x05B24A (displacement 0xF4 = -12)
   - 0xF4 happens to be the opcode for CALL P, but it's data here
   - Real instruction flow: CP 0x01 -> JR C, 0x05B240 -> RET Z

2. ${hex(CALLERS[1].addr)}: NOT a CALL PE instruction
   - Actually byte 2 of JR NZ at 0x0773EC (displacement 0xEC = -20)
   - 0xEC happens to be the opcode for CALL PE, but it's data here
   - Real instruction flow: JR C, +2 -> JR NZ, -20 (loop back to 0x0773DA)

CONCLUSION: The translation dispatcher at 0x02FEC8 has NO external callers beyond
the already-known internal call chain. Session 385's byte-pattern scan matched
JR displacement bytes that coincidentally equal CALL opcodes. The function at
0x02FEC8 is called ONLY through:
  - 0x02FEDB (the translationDispatcher_caller, internal)
  - 0x0300CB (kbdKey_processor, internal)
  - Any jump table entries already discovered

The translation dispatcher is more isolated than previously thought.
`);

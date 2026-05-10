#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
import { pathToFileURL } from 'node:url';
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);
const rom = fs.readFileSync(ROM_PATH);

const TARGET = 0x0159CD;
const SCAN_END = 0x0C0000;

// --- Instruction formatter (tag-based objects -> readable string) ---
function hex(v, w = 6) { return '0x' + v.toString(16).padStart(w, '0'); }

function formatInstr(instr) {
  const t = instr.tag;
  if (!t) return `??? (no tag)`;

  switch (t) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${instr.condition.toUpperCase()}`;
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'rst': return `RST ${hex(instr.vector, 2)}`;
    case 'call': return `CALL ${hex(instr.target)}`;
    case 'call-conditional': return `CALL ${instr.condition.toUpperCase()}, ${hex(instr.target)}`;
    case 'jp': return `JP ${hex(instr.target)}`;
    case 'jp-conditional': return `JP ${instr.condition.toUpperCase()}, ${hex(instr.target)}`;
    case 'jp-indirect': return `JP (${instr.indirectRegister.toUpperCase()})`;
    case 'jr': return `JR ${hex(instr.target)}`;
    case 'jr-conditional': return `JR ${instr.condition.toUpperCase()}, ${hex(instr.target)}`;
    case 'djnz': return `DJNZ ${hex(instr.target)}`;
    case 'push': return `PUSH ${instr.pair.toUpperCase()}`;
    case 'pop': return `POP ${instr.pair.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${instr.dest.toUpperCase()}, ${hex(instr.value, 2)}`;
    case 'ld-pair-imm': return `LD ${instr.pair.toUpperCase()}, ${hex(instr.value)}`;
    case 'ld-reg-ind': return `LD ${instr.dest.toUpperCase()}, (${instr.indirectRegister.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${instr.indirectRegister.toUpperCase()}), ${instr.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${instr.dest.toUpperCase()}, (${hex(instr.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(instr.addr)}), ${instr.src.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${instr.pair.toUpperCase()}, (${hex(instr.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(instr.addr)}), ${instr.pair.toUpperCase()}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-pair': return `LD SP, ${instr.pair.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (${instr.indirectRegister.toUpperCase()}), ${hex(instr.value, 2)}`;
    case 'ld-reg-ixd': return `LD ${instr.dest.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-ixd-reg': return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${instr.src.toUpperCase()}`;
    case 'ld-ixd-imm': return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${hex(instr.value, 2)}`;
    case 'ld-special': return `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-pair-ind': return `LD ${instr.pair.toUpperCase()}, (${instr.src.toUpperCase()})`;
    case 'ld-ind-pair': return `LD (${instr.dest.toUpperCase()}), ${instr.pair.toUpperCase()}`;
    case 'ld-pair-indexed': return `LD ${instr.pair.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-indexed-pair': return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${instr.pair.toUpperCase()}`;
    case 'ld-ixiy-indexed': return `LD ${instr.dest.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-indexed-ixiy': return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${instr.src.toUpperCase()}`;
    case 'alu-reg': return `${instr.op.toUpperCase()} A, ${instr.src.toUpperCase()}`;
    case 'alu-imm': return `${instr.op.toUpperCase()} A, ${hex(instr.value, 2)}`;
    case 'alu-ind': return `${instr.op.toUpperCase()} A, (${instr.indirectRegister.toUpperCase()})`;
    case 'alu-ixd': return `${instr.op.toUpperCase()} A, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'alu-hl-pair': return `${instr.op.toUpperCase()} HL, ${instr.pair.toUpperCase()}`;
    case 'inc-reg': return `INC ${instr.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${instr.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${instr.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${instr.pair.toUpperCase()}`;
    case 'inc-ind': return `INC (${instr.indirectRegister.toUpperCase()})`;
    case 'dec-ind': return `DEC (${instr.indirectRegister.toUpperCase()})`;
    case 'inc-ixd': return `INC (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'dec-ixd': return `DEC (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-ix': return `EX (SP), ${instr.indexRegister.toUpperCase()}`;
    case 'rotate-reg': return `${instr.op.toUpperCase()} ${instr.reg.toUpperCase()}`;
    case 'rotate-ind': return `${instr.op.toUpperCase()} (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-test': return `BIT ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-set': return `SET ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-reset': return `RES ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-reset-ind': return `RES ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'neg': return 'NEG';
    case 'im': return `IM ${instr.mode ?? '?'}`;
    case 'ldi': return 'LDI';
    case 'ldd': return 'LDD';
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpd': return 'CPD';
    case 'cpir': return 'CPIR';
    case 'cpdr': return 'CPDR';
    case 'ini': return 'INI';
    case 'ind': return 'IND';
    case 'inir': return 'INIR';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'outd': return 'OUTD';
    case 'otir': return 'OTIR';
    case 'otdr': return 'OTDR';
    case 'in-reg-c': return `IN ${instr.dest.toUpperCase()}, (C)`;
    case 'out-c-reg': return `OUT (C), ${instr.src.toUpperCase()}`;
    case 'in-a-n': return `IN A, (${hex(instr.port, 2)})`;
    case 'out-n-a': return `OUT (${hex(instr.port, 2)}), A`;
    case 'rld': return 'RLD';
    case 'rrd': return 'RRD';
    case 'slp': return 'SLP';
    case 'tst-a': return `TST A, ${hex(instr.value, 2)}`;
    case 'tstio': return `TSTIO ${hex(instr.value, 2)}`;
    case 'mlt': return `MLT ${instr.pair.toUpperCase()}`;
    case 'lea': return `LEA ${instr.dest.toUpperCase()}, ${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}`;
    case 'pea': return `PEA ${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}`;
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    default: return `[${t}] ${JSON.stringify(instr)}`;
  }
}

// --- Part 1: Find all CALL and JP sites to 0x0159CD ---
const callSites = [];
const jpSites = [];

for (let i = 0; i < SCAN_END - 3; i++) {
  // CALL nn = 0xCD + 3-byte LE address (0xCD 0x59 0x01)
  if (rom[i] === 0xCD && rom[i+1] === 0xCD && rom[i+2] === 0x59 && rom[i+3] === 0x01) {
    callSites.push(i);
  }
  // JP nn = 0xC3 + 3-byte LE address
  if (rom[i] === 0xC3 && rom[i+1] === 0xCD && rom[i+2] === 0x59 && rom[i+3] === 0x01) {
    jpSites.push(i);
  }
}

// Also search for CALL/JP to 0x0159C0 (the preamble entry)
const callSitesC0 = [];
const jpSitesC0 = [];
for (let i = 0; i < SCAN_END - 3; i++) {
  if (rom[i] === 0xCD && rom[i+1] === 0xC0 && rom[i+2] === 0x59 && rom[i+3] === 0x01) {
    callSitesC0.push(i);
  }
  if (rom[i] === 0xC3 && rom[i+1] === 0xC0 && rom[i+2] === 0x59 && rom[i+3] === 0x01) {
    jpSitesC0.push(i);
  }
}

console.log(`=== CALL/JP sites to 0x${TARGET.toString(16).toUpperCase()} ===`);
console.log(`Found ${callSites.length} CALL(s) and ${jpSites.length} JP(s) to 0x0159CD`);
console.log(`Found ${callSitesC0.length} CALL(s) and ${jpSitesC0.length} JP(s) to 0x0159C0\n`);

// --- Helper: disassemble N instructions starting at addr ---
function disasmAt(startAddr, count) {
  const lines = [];
  let addr = startAddr;
  for (let i = 0; i < count; i++) {
    if (addr < 0 || addr >= rom.length) break;
    try {
      const instr = decodeInstruction(rom, addr, 'adl');
      const rawBytes = Array.from(rom.slice(addr, addr + instr.length)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      lines.push({ addr, text: `  ${hex(addr)}: ${rawBytes.padEnd(24)} ${formatInstr(instr)}`, length: instr.length });
      addr += instr.length;
    } catch (e) {
      lines.push({ addr, text: `  ${hex(addr)}: ${rom[addr].toString(16).padStart(2,'0').padEnd(24)} ??? (${e.message})`, length: 1 });
      addr++;
    }
  }
  return { lines, endAddr: addr };
}

// --- Helper: find a good disassembly start point N instructions before target ---
function findStartBefore(target, instrCount) {
  // Heuristic: go back ~4 bytes per instruction
  let startGuess = target - instrCount * 4;
  if (startGuess < 0) startGuess = 0;
  // Decode forward and collect addresses
  let addr = startGuess;
  const addrs = [];
  while (addr < target) {
    try {
      const instr = decodeInstruction(rom, addr, 'adl');
      addrs.push(addr);
      addr += instr.length;
    } catch {
      addrs.push(addr);
      addr++;
    }
  }
  const slice = addrs.slice(-instrCount);
  return slice.length > 0 ? slice[0] : target;
}

// --- Part 2: Disassemble context around each caller ---
function printCallerContext(site, type) {
  console.log(`--- ${type} at ${hex(site)} ---`);
  const beforeStart = findStartBefore(site, 15);
  const { lines, endAddr } = disasmAt(beforeStart, 25);
  for (const l of lines) {
    if (l.addr === site) {
      console.log(l.text + '  <-- ***');
    } else {
      console.log(l.text);
    }
  }
  console.log('');
}

for (const site of callSites) printCallerContext(site, 'CALL 0x0159CD');
for (const site of jpSites) printCallerContext(site, 'JP 0x0159CD');
for (const site of callSitesC0) printCallerContext(site, 'CALL 0x0159C0');
for (const site of jpSitesC0) printCallerContext(site, 'JP 0x0159C0');

// --- Part 3: Disassemble preamble at 0x0159C0 through past 0x0159CD ---
console.log(`\n=== Preamble disassembly: 0x0159C0 onward ===`);
const preambleHex = Array.from(rom.slice(0x0159C0, 0x0159E0)).map(b => b.toString(16).padStart(2, '0')).join(' ');
console.log(`Raw bytes 0x0159C0..0x0159DF: ${preambleHex}\n`);

const { lines: preambleLines } = disasmAt(0x0159C0, 30);
for (const l of preambleLines) {
  if (l.addr === TARGET) {
    console.log(l.text + '  <-- 0x0159CD entry');
  } else {
    console.log(l.text);
  }
}

// --- Part 4: Also check what's before 0x0159C0 for context ---
console.log(`\n=== Context before 0x0159C0 (what falls into the preamble?) ===`);
const { lines: preLines } = disasmAt(findStartBefore(0x0159C0, 10), 12);
for (const l of preLines) {
  console.log(l.text);
}

// --- Part 5: Summary ---
console.log(`\n=== Summary ===`);
console.log(`Direct CALL 0x0159CD: ${callSites.length} site(s) at [${callSites.map(a => hex(a)).join(', ')}]`);
console.log(`Direct JP 0x0159CD:   ${jpSites.length} site(s) at [${jpSites.map(a => hex(a)).join(', ')}]`);
console.log(`Direct CALL 0x0159C0: ${callSitesC0.length} site(s) at [${callSitesC0.map(a => hex(a)).join(', ')}]`);
console.log(`Direct JP 0x0159C0:   ${jpSitesC0.length} site(s) at [${jpSitesC0.map(a => hex(a)).join(', ')}]`);
console.log(`\nConclusion:`);
if (callSites.length === 0 && jpSites.length === 0) {
  console.log(`  0x0159CD has ZERO direct callers in the scanned range (0x000000-0x${SCAN_END.toString(16)}).`);
  console.log(`  It is reached ONLY via fall-through from the preamble at 0x0159C0.`);
} else {
  console.log(`  0x0159CD IS called directly — it serves as a public entry point.`);
}
if (callSitesC0.length > 0 || jpSitesC0.length > 0) {
  console.log(`  0x0159C0 IS called directly — the preamble is an alternate entry that does extra setup.`);
} else {
  console.log(`  0x0159C0 also has ZERO direct callers — both may only be reached via earlier fall-through.`);
}

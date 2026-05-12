#!/usr/bin/env node
// Phase 304: Compare 0x080259 (ISR-path key read) vs 0x02014C/0x03FA09 (SDK _GetCSC)
// Goal: RAM touches, sub-calls, return conventions for both paths.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const IY_BASE = 0xD00080;

// --- Formatting helpers (adapted from phase303 probe) ---

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function disasmAt(addr) {
  if (addr < 0 || addr >= rom.length) return null;
  try { return decodeInstruction(rom, addr, 'adl'); } catch { return null; }
}

function formatInst(inst) {
  if (!inst) return '<decode error>';
  if (inst.dasm) return inst.dasm;

  switch (inst.tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-indexed-reg': return `LD (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-indexed': return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ld-indexed-imm': return `LD (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)}), ${hex(inst.value, 2)}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-pair': return `LD SP, ${inst.pair?.toUpperCase() || 'HL'}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-indexed': return `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'cb-bit': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'cb-res': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'cb-set': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'cb-rotate': return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'ldi': return 'LDI';
    case 'ldd': return 'LDD';
    case 'cpir': return 'CPIR';
    case 'cpdr': return 'CPDR';
    case 'cpi': return 'CPI';
    case 'cpd': return 'CPD';
    case 'ei': return 'EI';
    case 'di': return 'DI';
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'ccf': return 'CCF';
    case 'scf': return 'SCF';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'rst': return `RST ${hex(inst.vector, 2)}`;
    case 'in-reg-c': return `IN ${inst.reg.toUpperCase()}, (C)`;
    case 'out-c-reg': return `OUT (C), ${inst.reg.toUpperCase()}`;
    case 'in-a-imm': return `IN A, (${hex(inst.port, 2)})`;
    case 'out-imm-a': return `OUT (${hex(inst.port, 2)}), A`;
    case 'add-hl-pair': return `ADD HL, ${inst.pair.toUpperCase()}`;
    case 'adc-hl-pair': return `ADC HL, ${inst.pair.toUpperCase()}`;
    case 'sbc-hl-pair': return `SBC HL, ${inst.pair.toUpperCase()}`;
    case 'neg': return 'NEG';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'im': return `IM ${inst.mode_val ?? inst.im_mode ?? '?'}`;
    case 'rrd': return 'RRD';
    case 'rld': return 'RLD';
    case 'inc-indexed': return `INC (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'dec-indexed': return `DEC (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-index': return `EX (SP), ${inst.indexRegister.toUpperCase()}`;
    case 'add-index-pair': return `ADD ${inst.indexRegister.toUpperCase()}, ${inst.pair.toUpperCase()}`;
    case 'ld-index-imm': return `LD ${inst.indexRegister.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-index-mem': return `LD ${inst.indexRegister.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-index': return `LD (${hex(inst.addr)}), ${inst.indexRegister.toUpperCase()}`;
    default: return `[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

// --- Disassemble a function ---

function disasmFunction(startAddr, maxInstructions) {
  const lines = [];
  let pc = startAddr;

  for (let i = 0; i < maxInstructions; i++) {
    const inst = disasmAt(pc);
    if (!inst || !inst.length) {
      lines.push({ addr: pc, text: `DB ${hex(rom[pc] ?? 0, 2)}`, inst: null });
      pc += 1;
      continue;
    }

    lines.push({ addr: pc, text: formatInst(inst), inst });
    pc += inst.length;

    // Stop on unconditional RET
    if (inst.tag === 'ret') break;
    // Stop on unconditional JP (not indirect)
    if (inst.tag === 'jp') break;
  }

  return lines;
}

// --- Analysis ---

function analyzeFunction(name, lines) {
  const ramReads = [];
  const ramWrites = [];
  const iyReads = [];
  const iyWrites = [];
  const subcalls = [];

  for (const line of lines) {
    const inst = line.inst;
    if (!inst) continue;

    // Absolute memory reads
    if (inst.tag === 'ld-reg-mem' && inst.addr >= 0xD00000) {
      ramReads.push({ at: hex(line.addr), ram: hex(inst.addr), detail: line.text });
    }
    if (inst.tag === 'ld-pair-mem' && inst.addr >= 0xD00000) {
      ramReads.push({ at: hex(line.addr), ram: hex(inst.addr), detail: line.text });
    }

    // Absolute memory writes
    if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000) {
      ramWrites.push({ at: hex(line.addr), ram: hex(inst.addr), detail: line.text });
    }
    if (inst.tag === 'ld-mem-pair' && inst.addr >= 0xD00000) {
      ramWrites.push({ at: hex(line.addr), ram: hex(inst.addr), detail: line.text });
    }

    // IY-relative reads
    if (inst.tag === 'indexed-cb-bit') {
      const ramAddr = IY_BASE + inst.displacement;
      iyReads.push({ at: hex(line.addr), ram: hex(ramAddr), offset: inst.displacement, detail: line.text });
    }
    if (inst.tag === 'ld-reg-indexed' && inst.indexRegister === 'iy') {
      const ramAddr = IY_BASE + inst.displacement;
      iyReads.push({ at: hex(line.addr), ram: hex(ramAddr), offset: inst.displacement, detail: line.text });
    }
    if (inst.tag === 'alu-indexed' && inst.indexRegister === 'iy') {
      const ramAddr = IY_BASE + inst.displacement;
      iyReads.push({ at: hex(line.addr), ram: hex(ramAddr), offset: inst.displacement, detail: line.text });
    }

    // IY-relative writes
    if (inst.tag === 'indexed-cb-set' || inst.tag === 'indexed-cb-res') {
      const ramAddr = IY_BASE + inst.displacement;
      iyWrites.push({ at: hex(line.addr), ram: hex(ramAddr), offset: inst.displacement, detail: line.text });
      // Also a read (read-modify-write)
      iyReads.push({ at: hex(line.addr), ram: hex(ramAddr), offset: inst.displacement, detail: `${line.text} (rmw)` });
    }
    if (inst.tag === 'ld-indexed-reg' && inst.indexRegister === 'iy') {
      const ramAddr = IY_BASE + inst.displacement;
      iyWrites.push({ at: hex(line.addr), ram: hex(ramAddr), offset: inst.displacement, detail: line.text });
    }
    if (inst.tag === 'ld-indexed-imm' && inst.indexRegister === 'iy') {
      const ramAddr = IY_BASE + inst.displacement;
      iyWrites.push({ at: hex(line.addr), ram: hex(ramAddr), offset: inst.displacement, detail: line.text });
    }

    // Sub-calls
    if (inst.tag === 'call') {
      subcalls.push({ at: hex(line.addr), target: hex(inst.target), detail: line.text });
    }
    if (inst.tag === 'call-conditional') {
      subcalls.push({ at: hex(line.addr), target: hex(inst.target), detail: line.text });
    }
  }

  return { name, ramReads, ramWrites, iyReads, iyWrites, subcalls, lines };
}

function printDisassembly(label, lines) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(70)}`);
  for (const line of lines) {
    console.log(`  ${hex(line.addr)}:  ${line.text}`);
  }
}

function printAnalysis(a) {
  console.log(`\n--- Analysis: ${a.name} ---`);
  console.log(`  Instructions: ${a.lines.length}`);

  if (a.ramReads.length) {
    console.log(`  RAM reads (absolute):`);
    for (const r of a.ramReads) console.log(`    ${r.at}: ${r.detail}  [RAM ${r.ram}]`);
  } else {
    console.log(`  RAM reads (absolute): none`);
  }

  if (a.iyReads.length) {
    console.log(`  IY-relative reads (IY=0xD00080):`);
    for (const r of a.iyReads) console.log(`    ${r.at}: ${r.detail}  => IY+${r.offset} = ${r.ram}`);
  } else {
    console.log(`  IY-relative reads: none`);
  }

  if (a.ramWrites.length) {
    console.log(`  RAM writes (absolute):`);
    for (const r of a.ramWrites) console.log(`    ${r.at}: ${r.detail}  [RAM ${r.ram}]`);
  } else {
    console.log(`  RAM writes (absolute): none`);
  }

  if (a.iyWrites.length) {
    console.log(`  IY-relative writes (IY=0xD00080):`);
    for (const r of a.iyWrites) console.log(`    ${r.at}: ${r.detail}  => IY+${r.offset} = ${r.ram}`);
  } else {
    console.log(`  IY-relative writes: none`);
  }

  if (a.subcalls.length) {
    console.log(`  Sub-calls:`);
    for (const c of a.subcalls) console.log(`    ${c.at}: ${c.detail}`);
  } else {
    console.log(`  Sub-calls: none`);
  }
}

// --- Return convention detection ---

function findReturnConvention(lines) {
  // Find all RET/RET-cond positions and look at preceding instructions
  const clues = [];
  for (let i = 0; i < lines.length; i++) {
    const inst = lines[i].inst;
    if (!inst) continue;
    if (inst.tag === 'ret' || inst.tag === 'ret-conditional') {
      // Look back up to 5 instructions
      const window = lines.slice(Math.max(0, i - 5), i);
      for (const w of window) {
        if (!w.inst) continue;
        if (w.inst.tag === 'ld-reg-mem' && w.inst.dest === 'a') {
          clues.push(`LD A,(addr) at ${hex(w.addr)} before ${inst.tag === 'ret' ? 'RET' : 'RET cond'} at ${hex(lines[i].addr)}`);
        }
        if (w.inst.tag === 'ld-reg-reg' && w.inst.dest === 'a') {
          clues.push(`LD A,${w.inst.src.toUpperCase()} at ${hex(w.addr)} before RET at ${hex(lines[i].addr)}`);
        }
        if (w.inst.tag === 'ld-reg-imm' && w.inst.dest === 'a') {
          clues.push(`LD A,${hex(w.inst.value, 2)} at ${hex(w.addr)} before RET at ${hex(lines[i].addr)}`);
        }
        if (w.inst.tag === 'alu-reg' && w.inst.op === 'xor' && w.inst.src === 'a') {
          clues.push(`XOR A (clear A=0) at ${hex(w.addr)} before RET at ${hex(lines[i].addr)}`);
        }
        if (w.inst.tag === 'alu-reg' && w.inst.op === 'or' && w.inst.src === 'a') {
          clues.push(`OR A (test A, set flags) at ${hex(w.addr)} before RET at ${hex(lines[i].addr)}`);
        }
      }
    }
  }
  return clues.length ? clues.join('\n          ') : 'unclear';
}

// --- Main ---

console.log('Phase 304: _GetCSC comparison');
console.log('  ISR path:  0x080259 (called from 0x0800A8, the ISR event-loop key handler)');
console.log('  SDK entry: 0x02014C (_GetCSC public entry)');
console.log('  SDK impl:  0x03FA09 (actual _GetCSC implementation)');
console.log('  IY base = 0xD00080\n');

// 1. ISR path: 0x080259
const isrLines = disasmFunction(0x080259, 100);
printDisassembly('0x080259 -- ISR-path key buffer read (called from 0x0800A8)', isrLines);
const isrAnalysis = analyzeFunction('0x080259 (ISR path)', isrLines);
printAnalysis(isrAnalysis);

// 2. SDK entry: 0x02014C
const sdkEntryLines = disasmFunction(0x02014C, 15);
printDisassembly('0x02014C -- SDK _GetCSC public entry', sdkEntryLines);
const sdkEntryAnalysis = analyzeFunction('0x02014C (SDK entry)', sdkEntryLines);
printAnalysis(sdkEntryAnalysis);

// 3. SDK implementation: 0x03FA09
const sdkImplLines = disasmFunction(0x03FA09, 120);
printDisassembly('0x03FA09 -- SDK _GetCSC implementation', sdkImplLines);
const sdkImplAnalysis = analyzeFunction('0x03FA09 (SDK impl)', sdkImplLines);
printAnalysis(sdkImplAnalysis);

// --- Side-by-side comparison ---
console.log(`\n${'='.repeat(70)}`);
console.log('  SIDE-BY-SIDE COMPARISON');
console.log(`${'='.repeat(70)}`);

function collectAllRAMAddrs(a) {
  const addrs = new Set();
  for (const r of [...a.ramReads, ...a.ramWrites]) addrs.add(r.ram);
  for (const r of [...a.iyReads, ...a.iyWrites]) addrs.add(r.ram);
  return [...addrs].sort();
}

function getRole(a, addrHex) {
  const hasRead = a.ramReads.some(r => r.ram === addrHex) || a.iyReads.some(r => r.ram === addrHex);
  const hasWrite = a.ramWrites.some(r => r.ram === addrHex) || a.iyWrites.some(r => r.ram === addrHex);
  if (hasRead && hasWrite) return 'R/W';
  if (hasRead) return 'READ';
  if (hasWrite) return 'WRITE';
  return '-';
}

const isrAddrs = collectAllRAMAddrs(isrAnalysis);
const sdkAddrs = collectAllRAMAddrs(sdkImplAnalysis);
const allAddrs = [...new Set([...isrAddrs, ...sdkAddrs])].sort();

const knownNames = {
  '0x0D0080': 'IY+0 (OS flags byte 0)',
  '0x0D0081': 'IY+1 (kbdFlags)',
  '0x0D0082': 'IY+2',
  '0x0D0587': 'scan code buf (secondary)',
  '0x0D058C': 'scan code buf (primary)',
  '0x0D058D': 'scan code (alt)',
};

console.log('\n  RAM addresses touched:');
console.log('  ' + '-'.repeat(66));
console.log(`  ${'Address'.padEnd(14)} ${'Name'.padEnd(22)} ${'ISR'.padEnd(12)} ${'SDK'.padEnd(12)}`);
console.log('  ' + '-'.repeat(66));
for (const addr of allAddrs) {
  const isrRole = getRole(isrAnalysis, addr);
  const sdkRole = getRole(sdkImplAnalysis, addr);
  const name = knownNames[addr] || '';
  console.log(`  ${addr.padEnd(14)} ${name.padEnd(22)} ${isrRole.padEnd(12)} ${sdkRole.padEnd(12)}`);
}

console.log('\n  Sub-calls:');
console.log('  ' + '-'.repeat(50));
console.log(`  ${'Target'.padEnd(14)} ${'ISR'.padEnd(18)} ${'SDK'.padEnd(18)}`);
console.log('  ' + '-'.repeat(50));
const isrTargets = isrAnalysis.subcalls.map(c => c.target);
const sdkTargets = sdkImplAnalysis.subcalls.map(c => c.target);
const allTargets = [...new Set([...isrTargets, ...sdkTargets])].sort();
for (const t of allTargets) {
  const inISR = isrTargets.includes(t) ? 'YES' : '-';
  const inSDK = sdkTargets.includes(t) ? 'YES' : '-';
  console.log(`  ${t.padEnd(14)} ${inISR.padEnd(18)} ${inSDK.padEnd(18)}`);
}

console.log('\n  Return value convention:');
console.log('  ' + '-'.repeat(50));
console.log(`  ISR: ${findReturnConvention(isrLines)}`);
console.log(`  SDK: ${findReturnConvention(sdkImplLines)}`);

console.log('\n  Known address legend:');
console.log('  ' + '-'.repeat(50));
console.log('  0xD00080  IY base (OS flags)');
console.log('  0xD00081  IY+1 (keyboard flags -- BIT 3 = key available)');
console.log('  0xD00587  scan code buffer (secondary)');
console.log('  0xD0058C  scan code buffer (primary)');
console.log('  0xD0058D  scan code location (alt)');

// --- Continuation blocks for SDK _GetCSC ---
// The main body JPs to 0x03FB9A (key-present path) and 0x03FBD6 (other path)

console.log('\n--- SDK _GetCSC continuation blocks ---');

const cont1Lines = disasmFunction(0x03FB9A, 60);
printDisassembly('0x03FB9A -- SDK _GetCSC continuation (key-present path)', cont1Lines);
const cont1Analysis = analyzeFunction('0x03FB9A (SDK cont-key)', cont1Lines);
printAnalysis(cont1Analysis);

const cont2Lines = disasmFunction(0x03FBD6, 40);
printDisassembly('0x03FBD6 -- SDK _GetCSC continuation (other path)', cont2Lines);
const cont2Analysis = analyzeFunction('0x03FBD6 (SDK cont-other)', cont2Lines);
printAnalysis(cont2Analysis);

// Also show 0x03FA89 continuation block (JP 0x03FBD6) - but first check what's at 0x03FA8D
// (the JR NZ target from 0x03FA7B)
const midLines = disasmFunction(0x03FA8D, 40);
printDisassembly('0x03FA8D -- SDK _GetCSC mid-block (USB ON-interrupt path)', midLines);
const midAnalysis = analyzeFunction('0x03FA8D (SDK mid)', midLines);
printAnalysis(midAnalysis);

// Collect all RAM from all SDK blocks
const allSDKAnalyses = [sdkImplAnalysis, cont1Analysis, cont2Analysis, midAnalysis];
const allSDKRAM = new Set();
for (const a of allSDKAnalyses) {
  for (const r of [...a.ramReads, ...a.ramWrites, ...a.iyReads, ...a.iyWrites]) allSDKRAM.add(r.ram);
}
const allSDKCalls = new Set();
for (const a of allSDKAnalyses) {
  for (const c of a.subcalls) allSDKCalls.add(c.target);
}

console.log(`\n${'='.repeat(70)}`);
console.log('  FULL SDK _GetCSC RAM FOOTPRINT (all blocks combined)');
console.log(`${'='.repeat(70)}`);
for (const addr of [...allSDKRAM].sort()) {
  console.log(`  ${addr}`);
}
console.log('\n  All SDK sub-calls:');
for (const t of [...allSDKCalls].sort()) {
  console.log(`  ${t}`);
}

console.log('\nPhase 304 complete.');

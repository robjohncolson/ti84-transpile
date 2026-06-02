#!/usr/bin/env node
// Phase 502 — Re-examine 0x096CCF and 0x096BEE to find cursor draw/erase calls
//
// The puzzle: 0x096CCF calls 0x096F67 (visibility gate) then JP NZ,0x097955
// (invalidation). But 0x097955 is NOT direct draw — it's display invalidation.
// So actual cursor pixel writes must happen somewhere in this chain.
//
// This probe:
// 1. Statically disassembles 0x096CCF (100+ bytes)
// 2. Statically disassembles 0x096BEE through 0x096CCE (blink toggle)
// 3. Searches ROM 0x096000-0x09AFFF for CALL 0x061061 and CALL 0x061003
// 4. Lists all CALL/JP targets found

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexb(v) {
  return (v >>> 0).toString(16).toUpperCase().padStart(2, '0');
}

function signed8(b) {
  return b < 128 ? b : b - 256;
}

// ── eZ80 ADL-mode static disassembler ──────────────────────────────────────
// Returns { bytes, mnemonic, length, callTarget?, jpTarget? }

const R8  = ['B','C','D','E','H','L','(HL)','A'];
const R16 = ['BC','DE','HL','SP'];
const R16AF = ['BC','DE','HL','AF'];
const ALU = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
const CC  = ['NZ','Z','NC','C','PO','PE','P','M'];
const ROT = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];

function disasmOne(buf, pc, ixiyPrefix, sisMode) {
  const immW = sisMode ? 2 : 3;
  const startPc = pc;
  const ob = [];

  function rb() { const v = buf[pc++]; ob.push(v); return v; }
  function bytesStr() { return ob.map(hexb).join(' '); }
  function imm8() { return rb(); }
  function imm16() { const lo = rb(); const hi = rb(); return lo | (hi << 8); }
  function imm24() { const lo = rb(); const mid = rb(); const hi = rb(); return lo | (mid << 8) | (hi << 16); }
  function immAddr() { return immW === 2 ? imm16() : imm24(); }
  function r8name(i) {
    if (i === 4 && ixiyPrefix) return ixiyPrefix + 'H';
    if (i === 5 && ixiyPrefix) return ixiyPrefix + 'L';
    return R8[i];
  }
  function r8ind(i) {
    // For (HL) slot with IX/IY prefix, consume displacement
    if (i === 6 && ixiyPrefix) {
      const d = signed8(imm8());
      return `(${ixiyPrefix}${d >= 0 ? '+' : ''}${d})`;
    }
    return r8name(i);
  }
  function r16name(i) {
    if (i === 2 && ixiyPrefix) return ixiyPrefix;
    return R16[i];
  }
  function r16afname(i) {
    if (i === 2 && ixiyPrefix) return ixiyPrefix;
    return R16AF[i];
  }
  function hlName() { return ixiyPrefix || 'HL'; }

  const op = rb();
  let result = { bytes: '', mnemonic: '???', length: 0 };
  const mk = (mn, extra) => {
    result = { bytes: bytesStr(), mnemonic: mn, length: pc - startPc, ...extra };
    return result;
  };

  // ── CB prefix ──
  if (op === 0xCB) {
    if (ixiyPrefix) {
      const d = signed8(imm8());
      const cbop = rb();
      const group = (cbop >> 6) & 3;
      const bit = (cbop >> 3) & 7;
      const reg = cbop & 7;
      const ind = `(${ixiyPrefix}${d >= 0 ? '+' : ''}${d})`;
      let mn;
      if (group === 0) mn = `${ROT[bit]} ${ind}`;
      else if (group === 1) mn = `BIT ${bit},${ind}`;
      else if (group === 2) mn = `RES ${bit},${ind}`;
      else mn = `SET ${bit},${ind}`;
      if (reg !== 6 && group !== 1) mn += ` -> ${R8[reg]}`;
      return mk(mn);
    }
    const cbop = rb();
    const group = (cbop >> 6) & 3;
    const bit = (cbop >> 3) & 7;
    const reg = cbop & 7;
    let mn;
    if (group === 0) mn = `${ROT[bit]} ${R8[reg]}`;
    else if (group === 1) mn = `BIT ${bit},${R8[reg]}`;
    else if (group === 2) mn = `RES ${bit},${R8[reg]}`;
    else mn = `SET ${bit},${R8[reg]}`;
    return mk(mn);
  }

  // ── ED prefix ──
  if (op === 0xED) {
    const edop = rb();

    // LEA with displacement: 02,03,12,13,22,23,32,33
    if ([0x02,0x03,0x12,0x13,0x22,0x23,0x32,0x33].includes(edop)) {
      const d = signed8(imm8());
      const dstMap = {0x02:'BC',0x03:'BC',0x12:'DE',0x13:'DE',0x22:'HL',0x23:'HL',0x32:'IX',0x33:'IY'};
      const srcMap = {0x02:'IX',0x03:'IY',0x12:'IX',0x13:'IY',0x22:'IX',0x23:'IY',0x32:'IX',0x33:'IY'};
      return mk(`LEA ${dstMap[edop]},${srcMap[edop]}${d >= 0 ? '+' : ''}${d}`);
    }
    if ([0x65, 0x66].includes(edop)) {
      const d = signed8(imm8());
      return mk(`PEA ${edop === 0x65 ? 'IX' : 'IY'}${d >= 0 ? '+' : ''}${d}`);
    }

    // IN0/OUT0
    const in0Map = {0x00:'B',0x08:'C',0x10:'D',0x18:'E',0x20:'H',0x28:'L',0x38:'A'};
    if (in0Map[edop] !== undefined) { const n = imm8(); return mk(`IN0 ${in0Map[edop]},(${hex(n,2)})`); }
    const out0Map = {0x01:'B',0x09:'C',0x11:'D',0x19:'E',0x21:'H',0x29:'L',0x31:'0',0x39:'A'};
    if (out0Map[edop] !== undefined) { const n = imm8(); return mk(`OUT0 (${hex(n,2)}),${out0Map[edop]}`); }

    // Standard ED instructions
    const edSimple = {
      0x44:'NEG', 0x45:'RETN', 0x4D:'RETI',
      0x46:'IM 0', 0x56:'IM 1', 0x5E:'IM 2',
      0x47:'LD I,A', 0x4F:'LD R,A', 0x57:'LD A,I', 0x5F:'LD A,R',
      0x67:'RRD', 0x6F:'RLD', 0x3E:'SLP',
      0xA0:'LDI', 0xA1:'CPI', 0xA2:'INI', 0xA3:'OUTI',
      0xA8:'LDD', 0xA9:'CPD', 0xAA:'IND', 0xAB:'OUTD',
      0xB0:'LDIR', 0xB1:'CPIR', 0xB2:'INIR', 0xB3:'OTIR',
      0xB8:'LDDR', 0xB9:'CPDR', 0xBA:'INDR', 0xBB:'OTDR',
    };
    if (edSimple[edop]) return mk(edSimple[edop]);

    // SBC HL,rr / ADC HL,rr
    if ((edop & 0xCF) === 0x42) { const p = (edop >> 4) & 3; return mk(`SBC HL,${R16[p]}`); }
    if ((edop & 0xCF) === 0x4A) { const p = (edop >> 4) & 3; return mk(`ADC HL,${R16[p]}`); }

    // LD (nn),rr / LD rr,(nn)
    if ((edop & 0xCF) === 0x43) { const p = (edop >> 4) & 3; const a = immAddr(); return mk(`LD (${hex(a)}),${R16[p]}`); }
    if ((edop & 0xCF) === 0x4B) { const p = (edop >> 4) & 3; const a = immAddr(); return mk(`LD ${R16[p]},(${hex(a)})`); }

    // IN r,(C) / OUT (C),r
    if ((edop & 0xC7) === 0x40) { const r = (edop >> 3) & 7; return mk(`IN ${r === 6 ? '(C)' : R8[r]},(C)`); }
    if ((edop & 0xC7) === 0x41) { const r = (edop >> 3) & 7; return mk(`OUT (C),${r === 6 ? '0' : R8[r]}`); }

    // TST
    if (edop === 0x74) { const n = imm8(); return mk(`TST A,${hex(n,2)}`); }
    if (edop === 0x76) { const n = imm8(); return mk(`TSTIO ${hex(n,2)}`); }

    return mk(`ED ${hexb(edop)}`);
  }

  // ── Main opcode table ──
  const x = (op >> 6) & 3;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = (y >> 1) & 3;
  const q = y & 1;

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return mk('NOP');
      if (y === 1) return mk("EX AF,AF'");
      if (y === 2) { const d = signed8(imm8()); const t = pc + d; return mk(`DJNZ ${hex(t)}`, { jpTarget: t }); }
      if (y === 3) { const d = signed8(imm8()); const t = pc + d; return mk(`JR ${hex(t)}`, { jpTarget: t }); }
      const d = signed8(imm8()); const t = pc + d;
      return mk(`JR ${CC[y-4]},${hex(t)}`, { jpTarget: t });
    }
    if (z === 1) {
      if (q === 0) { const v = immAddr(); return mk(`LD ${r16name(p)},${hex(v)}`); }
      return mk(`ADD ${hlName()},${r16name(p)}`);
    }
    if (z === 2) {
      if (p === 0) return mk(q === 0 ? 'LD (BC),A' : 'LD A,(BC)');
      if (p === 1) return mk(q === 0 ? 'LD (DE),A' : 'LD A,(DE)');
      if (p === 2) { const a = immAddr(); return mk(q === 0 ? `LD (${hex(a)}),${hlName()}` : `LD ${hlName()},(${hex(a)})`); }
      if (p === 3) { const a = immAddr(); return mk(q === 0 ? `LD (${hex(a)}),A` : `LD A,(${hex(a)})`); }
    }
    if (z === 3) return mk(q === 0 ? `INC ${r16name(p)}` : `DEC ${r16name(p)}`);
    if (z === 4) return mk(`INC ${r8ind(y)}`);
    if (z === 5) return mk(`DEC ${r8ind(y)}`);
    if (z === 6) {
      if (y === 6 && ixiyPrefix) {
        const d = signed8(imm8());
        const n = imm8();
        return mk(`LD (${ixiyPrefix}${d >= 0 ? '+' : ''}${d}),${hex(n,2)}`);
      }
      const n = imm8();
      return mk(`LD ${r8name(y)},${hex(n,2)}`);
    }
    if (z === 7) {
      return mk(['RLCA','RRCA','RLA','RRA','DAA','CPL','SCF','CCF'][y]);
    }
  }

  if (x === 1) {
    if (y === 6 && z === 6) return mk('HALT');
    if (ixiyPrefix && (y === 6 || z === 6)) {
      if (y === 6) {
        const d = signed8(imm8());
        return mk(`LD (${ixiyPrefix}${d >= 0 ? '+' : ''}${d}),${R8[z]}`);
      } else {
        const d = signed8(imm8());
        return mk(`LD ${R8[y]},(${ixiyPrefix}${d >= 0 ? '+' : ''}${d})`);
      }
    }
    return mk(`LD ${r8name(y)},${r8name(z)}`);
  }

  if (x === 2) {
    let operand;
    if (z === 6 && ixiyPrefix) {
      const d = signed8(imm8());
      operand = `(${ixiyPrefix}${d >= 0 ? '+' : ''}${d})`;
    } else {
      operand = r8name(z);
    }
    return mk(`${ALU[y]}${operand}`);
  }

  // x === 3
  if (z === 0) return mk(`RET ${CC[y]}`);
  if (z === 1) {
    if (q === 0) return mk(`POP ${r16afname(p)}`);
    if (p === 0) return mk('RET');
    if (p === 1) return mk('EXX');
    if (p === 2) return mk(`JP (${hlName()})`);
    if (p === 3) return mk(`LD SP,${hlName()}`);
  }
  if (z === 2) { const a = immAddr(); return mk(`JP ${CC[y]},${hex(a)}`, { jpTarget: a }); }
  if (z === 3) {
    if (y === 0) { const a = immAddr(); return mk(`JP ${hex(a)}`, { jpTarget: a }); }
    if (y === 2) { const n = imm8(); return mk(`OUT (${hex(n,2)}),A`); }
    if (y === 3) { const n = imm8(); return mk(`IN A,(${hex(n,2)})`); }
    if (y === 4) return mk(`EX (SP),${hlName()}`);
    if (y === 5) return mk('EX DE,HL');
    if (y === 6) return mk('DI');
    if (y === 7) return mk('EI');
  }
  if (z === 4) { const a = immAddr(); return mk(`CALL ${CC[y]},${hex(a)}`, { callTarget: a }); }
  if (z === 5) {
    if (q === 0) return mk(`PUSH ${r16afname(p)}`);
    if (p === 0) { const a = immAddr(); return mk(`CALL ${hex(a)}`, { callTarget: a }); }
    // p=1 DD, p=2 ED, p=3 FD — already handled as prefixes
    return mk(`DB ${hexb(op)}`);
  }
  if (z === 6) { const n = imm8(); return mk(`${ALU[y]}${hex(n,2)}`); }
  if (z === 7) return mk(`RST ${hex(y * 8, 2)}`);

  return mk(`DB ${hexb(op)}`);
}

// Top-level decode: handles DD/FD/0x40 prefixes
function decode(buf, pc) {
  const b = buf[pc];

  // .SIS prefix (0x40)
  if (b === 0x40) {
    const inner = disasmOne(buf, pc + 1, null, true);
    inner.bytes = hexb(0x40) + ' ' + inner.bytes;
    inner.mnemonic = '.SIS ' + inner.mnemonic;
    inner.length += 1;
    return inner;
  }

  // DD prefix (IX)
  if (b === 0xDD) {
    const next = buf[pc + 1];
    if (next === 0x40) {
      const inner = disasmOne(buf, pc + 2, 'IX', true);
      inner.bytes = hexb(0xDD) + ' ' + hexb(0x40) + ' ' + inner.bytes;
      inner.mnemonic = '.SIS ' + inner.mnemonic;
      inner.length += 2;
      return inner;
    }
    const inner = disasmOne(buf, pc + 1, 'IX', false);
    inner.bytes = hexb(0xDD) + ' ' + inner.bytes;
    inner.length += 1;
    return inner;
  }

  // FD prefix (IY)
  if (b === 0xFD) {
    const next = buf[pc + 1];
    if (next === 0x40) {
      const inner = disasmOne(buf, pc + 2, 'IY', true);
      inner.bytes = hexb(0xFD) + ' ' + hexb(0x40) + ' ' + inner.bytes;
      inner.mnemonic = '.SIS ' + inner.mnemonic;
      inner.length += 2;
      return inner;
    }
    const inner = disasmOne(buf, pc + 1, 'IY', false);
    inner.bytes = hexb(0xFD) + ' ' + inner.bytes;
    inner.length += 1;
    return inner;
  }

  return disasmOne(buf, pc, null, false);
}

// Disassemble a region
function disasmRegion(start, maxBytes) {
  const results = [];
  let pc = start;
  const end = start + maxBytes;
  while (pc < end && pc < rom.length) {
    const inst = decode(rom, pc);
    results.push({ addr: pc, ...inst });
    if (inst.length === 0) { pc++; continue; }
    pc += inst.length;
  }
  return results;
}

function printDisasm(label, instructions) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(70));
  const calls = [];
  const jps = [];
  for (const inst of instructions) {
    console.log(`  ${hex(inst.addr)}  ${inst.bytes.padEnd(22)}  ${inst.mnemonic}`);
    if (inst.callTarget !== undefined) calls.push({ addr: inst.addr, target: inst.callTarget });
    if (inst.jpTarget !== undefined) jps.push({ addr: inst.addr, target: inst.jpTarget });
  }
  if (calls.length) {
    console.log(`\n  CALL targets:`);
    for (const c of calls) console.log(`    ${hex(c.addr)} -> CALL ${hex(c.target)}`);
  }
  if (jps.length) {
    console.log(`\n  JP/JR targets:`);
    for (const j of jps) console.log(`    ${hex(j.addr)} -> JP/JR ${hex(j.target)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('Phase 502: Re-examine 0x096CCF and blink toggle chain');
console.log('Purpose: Find where cursor draw (0x061061) / erase (0x061003) calls live');
console.log('');

// 1. Disassemble 0x096CCF — 120 bytes
console.log('\n>>> SECTION 1: 0x096CCF (cursor blink dispatcher, 120 bytes)');
const sec1 = disasmRegion(0x096CCF, 120);
printDisasm('0x096CCF — cursor blink dispatcher', sec1);

// 2. Disassemble 0x096BEE through 0x096CCE (blink toggle, 225 bytes)
console.log('\n\n>>> SECTION 2: 0x096BEE-0x096CCE (blink toggle path, 225 bytes)');
const sec2 = disasmRegion(0x096BEE, 0x096CCF - 0x096BEE);
printDisasm('0x096BEE-0x096CCE — blink toggle / pre-dispatcher', sec2);

// 3. Search ROM 0x096000-0x09AFFF for CALL 0x061061 and CALL 0x061003
console.log('\n\n>>> SECTION 3: ROM byte search for cursor draw/erase calls');
console.log('  Searching 0x096000-0x09AFFF for:');
console.log('    CALL 0x061061 = CD 61 10 06');
console.log('    CALL 0x061003 = CD 03 10 06');

const searchStart = 0x096000;
const searchEnd = 0x09B000;
const region = rom.subarray(searchStart, searchEnd);

const pat1 = Buffer.from([0xCD, 0x61, 0x10, 0x06]);
let hits1 = [];
let idx = 0;
while (true) {
  const found = region.indexOf(pat1, idx);
  if (found === -1) break;
  hits1.push(searchStart + found);
  idx = found + 1;
}

const pat2 = Buffer.from([0xCD, 0x03, 0x10, 0x06]);
let hits2 = [];
idx = 0;
while (true) {
  const found = region.indexOf(pat2, idx);
  if (found === -1) break;
  hits2.push(searchStart + found);
  idx = found + 1;
}

console.log(`\n  CALL 0x061061 (cursor draw) hits in 0x096000-0x09AFFF: ${hits1.length}`);
for (const h of hits1) {
  console.log(`    ${hex(h)}  context: ${Array.from(rom.subarray(h - 4, h + 8)).map(hexb).join(' ')}`);
  const ctx = disasmRegion(Math.max(h - 12, 0), 28);
  for (const inst of ctx) {
    console.log(`      ${hex(inst.addr)}  ${inst.bytes.padEnd(22)}  ${inst.mnemonic}`);
  }
}

console.log(`\n  CALL 0x061003 (cursor erase) hits in 0x096000-0x09AFFF: ${hits2.length}`);
for (const h of hits2) {
  console.log(`    ${hex(h)}  context: ${Array.from(rom.subarray(h - 4, h + 8)).map(hexb).join(' ')}`);
  const ctx = disasmRegion(Math.max(h - 12, 0), 28);
  for (const inst of ctx) {
    console.log(`      ${hex(inst.addr)}  ${inst.bytes.padEnd(22)}  ${inst.mnemonic}`);
  }
}

// 4. Full ROM search
console.log('\n\n>>> SECTION 4: Full ROM search for CALL 0x061061 / CALL 0x061003');

let wideHits1 = [];
idx = 0;
while (true) {
  const found = rom.indexOf(pat1, idx);
  if (found === -1) break;
  wideHits1.push(found);
  idx = found + 1;
}
let wideHits2 = [];
idx = 0;
while (true) {
  const found = rom.indexOf(pat2, idx);
  if (found === -1) break;
  wideHits2.push(found);
  idx = found + 1;
}

console.log(`  Full ROM CALL 0x061061 hits: ${wideHits1.length}`);
for (const h of wideHits1) console.log(`    ${hex(h)}`);
console.log(`  Full ROM CALL 0x061003 hits: ${wideHits2.length}`);
for (const h of wideHits2) console.log(`    ${hex(h)}`);

// 5. Reference disassembly of known functions
console.log('\n\n>>> SECTION 5: Reference disassembly of known functions');

const sec5a = disasmRegion(0x096F56, 30);
printDisasm('0x096F56 — visibility check (17 bytes)', sec5a);

const sec5b = disasmRegion(0x096F67, 20);
printDisasm('0x096F67 — 13-byte visibility gate', sec5b);

const sec5c = disasmRegion(0x097955, 60);
printDisasm('0x097955 — display invalidation (55 bytes)', sec5c);

// 6. Cursor draw/erase functions
console.log('\n\n>>> SECTION 6: Cursor draw/erase functions');

const sec6a = disasmRegion(0x061061, 80);
printDisasm('0x061061 — cursor draw', sec6a);

const sec6b = disasmRegion(0x061003, 100);
printDisasm('0x061003 — cursor erase', sec6b);

console.log('\n--- probe complete ---');

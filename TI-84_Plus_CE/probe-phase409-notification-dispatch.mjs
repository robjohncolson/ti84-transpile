// Phase 409: Decode the 6-entry dispatch table inside 0x0120AA
// Notification sub-handler analysis
//
// The handler at 0x0120AA dispatches via the _seqcase helper at 0x002623.
// Inline table at 0x0120E1 has 6 entries indexed by (IY+4).
// This probe disassembles each sub-handler and its CALL targets in depth.

import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

function r8(off) { return rom[off]; }
function r16(off) { return rom[off] | (rom[off + 1] << 8); }
function r24(off) { return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16); }
function hex(n, w = 6) { return '0x' + n.toString(16).padStart(w, '0'); }
function hexByte(b) { return b.toString(16).padStart(2, '0'); }
function rawBytes(start, len) {
  return Array.from(rom.slice(start, start + len)).map(hexByte).join(' ');
}

// ──────────────────────────────────────────────
// Simple eZ80 ADL disassembler (enough for tracing)
// ──────────────────────────────────────────────

function disasmAt(startAddr, maxInstrs = 20) {
  const result = [];
  let pc = startAddr;

  for (let n = 0; n < maxInstrs; n++) {
    const iStart = pc;
    const op = rom[pc++];
    let desc = '';
    let refs = { calls: [], jumps: [], ramReads: [], ramWrites: [] };

    switch (op) {
      // ── Prefixed DD (IX) ──
      case 0xDD: {
        const op2 = rom[pc++];
        switch (op2) {
          case 0xE5: desc = 'PUSH IX'; break;
          case 0xE1: desc = 'POP IX'; break;
          case 0xF9: desc = 'LD SP,IX'; break;
          case 0xE3: desc = 'EX (SP),IX'; break;
          case 0xE9: desc = 'JP (IX)'; break;
          case 0x21: { const a = r24(pc); pc += 3; desc = `LD IX,${hex(a)}`; break; }
          case 0x22: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),IX`; refs.ramWrites.push(a); break; }
          case 0x2A: { const a = r24(pc); pc += 3; desc = `LD IX,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0x27: { const d = rom[pc++]; desc = `LD HL,(IX+${hexByte(d)})`; break; }
          case 0x31: { const d = rom[pc++]; desc = `LD SP,(IX+${hexByte(d)})`; break; }
          case 0x07: { const d = rom[pc++]; desc = `LD BC,(IX+${hexByte(d)})`; break; }
          case 0x17: { const d = rom[pc++]; desc = `LD DE,(IX+${hexByte(d)})`; break; }
          case 0x0F: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),BC`; break; }
          case 0x1F: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),DE`; break; }
          case 0x3F: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),HL`; break; }
          case 0x36: { const d = rom[pc++]; const v = rom[pc++]; desc = `LD (IX+${hexByte(d)}),${hexByte(v)}`; break; }
          case 0x46: { const d = rom[pc++]; desc = `LD B,(IX+${hexByte(d)})`; break; }
          case 0x4E: { const d = rom[pc++]; desc = `LD C,(IX+${hexByte(d)})`; break; }
          case 0x56: { const d = rom[pc++]; desc = `LD D,(IX+${hexByte(d)})`; break; }
          case 0x5E: { const d = rom[pc++]; desc = `LD E,(IX+${hexByte(d)})`; break; }
          case 0x66: { const d = rom[pc++]; desc = `LD H,(IX+${hexByte(d)})`; break; }
          case 0x6E: { const d = rom[pc++]; desc = `LD L,(IX+${hexByte(d)})`; break; }
          case 0x7E: { const d = rom[pc++]; desc = `LD A,(IX+${hexByte(d)})`; break; }
          case 0x70: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),B`; break; }
          case 0x71: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),C`; break; }
          case 0x72: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),D`; break; }
          case 0x73: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),E`; break; }
          case 0x74: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),H`; break; }
          case 0x75: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),L`; break; }
          case 0x77: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),A`; break; }
          case 0xCB: { const d = rom[pc++]; const cb = rom[pc++]; desc = `IX+CB d=${hexByte(d)} op=${hexByte(cb)}`; break; }
          default: desc = `DD ${hexByte(op2)} (unknown IX)`; break;
        }
        break;
      }

      // ── Prefixed FD (IY) ──
      case 0xFD: {
        const op2 = rom[pc++];
        switch (op2) {
          case 0xE5: desc = 'PUSH IY'; break;
          case 0xE1: desc = 'POP IY'; break;
          case 0xF9: desc = 'LD SP,IY'; break;
          case 0xE3: desc = 'EX (SP),IY'; break;
          case 0xE9: desc = 'JP (IY)'; break;
          case 0x21: { const a = r24(pc); pc += 3; desc = `LD IY,${hex(a)}`; break; }
          case 0x7E: { const d = rom[pc++]; desc = `LD A,(IY+${hexByte(d)})`; break; }
          case 0x77: { const d = rom[pc++]; desc = `LD (IY+${hexByte(d)}),A`; break; }
          case 0x27: { const d = rom[pc++]; desc = `LD HL,(IY+${hexByte(d)})`; break; }
          case 0x07: { const d = rom[pc++]; desc = `LD BC,(IY+${hexByte(d)})`; break; }
          default: desc = `FD ${hexByte(op2)} (unknown IY)`; break;
        }
        break;
      }

      // ── Prefixed ED ──
      case 0xED: {
        const op2 = rom[pc++];
        switch (op2) {
          case 0x42: desc = 'SBC HL,BC'; break;
          case 0x43: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),BC`; refs.ramWrites.push(a); break; }
          case 0x4B: { const a = r24(pc); pc += 3; desc = `LD BC,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0x52: desc = 'SBC HL,DE'; break;
          case 0x53: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),DE`; refs.ramWrites.push(a); break; }
          case 0x5B: { const a = r24(pc); pc += 3; desc = `LD DE,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0x62: desc = 'SBC HL,HL'; break;
          case 0x63: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),HL`; refs.ramWrites.push(a); break; }
          case 0x6B: { const a = r24(pc); pc += 3; desc = `LD HL,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0x72: desc = 'SBC HL,SP'; break;
          case 0x73: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),SP`; refs.ramWrites.push(a); break; }
          case 0x7B: { const a = r24(pc); pc += 3; desc = `LD SP,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0xB0: desc = 'LDIR'; break;
          case 0xB1: desc = 'CPIR'; break;
          case 0xB8: desc = 'LDDR'; break;
          case 0x32: { const d = rom[pc++]; desc = `LEA IX,IY+${hexByte(d)}`; break; }
          case 0x33: { const d = rom[pc++]; desc = `LEA IY,IY+${hexByte(d)}`; break; }
          case 0x54: { const d = rom[pc++]; desc = `LEA IX,IX+${hexByte(d)}`; break; }
          case 0x55: { const d = rom[pc++]; desc = `LEA IY,IX+${hexByte(d)}`; break; }
          case 0x65: { const d = rom[pc++]; desc = `PEA IX+${hexByte(d)}`; break; }
          case 0x66: { const d = rom[pc++]; desc = `PEA IY+${hexByte(d)}`; break; }
          default: desc = `ED ${hexByte(op2)}`; break;
        }
        break;
      }

      // ── CB prefix ──
      case 0xCB: {
        const op2 = rom[pc++];
        const bit = (op2 >> 3) & 7;
        const reg = op2 & 7;
        const regNames = ['B','C','D','E','H','L','(HL)','A'];
        if (op2 < 0x40) desc = `CB shift/rot ${hexByte(op2)}`;
        else if (op2 < 0x80) desc = `BIT ${bit},${regNames[reg]}`;
        else if (op2 < 0xC0) desc = `RES ${bit},${regNames[reg]}`;
        else desc = `SET ${bit},${regNames[reg]}`;
        break;
      }

      // ── Single-byte and multi-byte ──
      case 0x00: desc = 'NOP'; break;
      case 0x01: { const a = r24(pc); pc += 3; desc = `LD BC,${hex(a)}`; break; }
      case 0x02: desc = 'LD (BC),A'; break;
      case 0x03: desc = 'INC BC'; break;
      case 0x04: desc = 'INC B'; break;
      case 0x05: desc = 'DEC B'; break;
      case 0x06: { desc = `LD B,${hexByte(rom[pc++])}`; break; }
      case 0x07: desc = 'RLCA'; break;
      case 0x08: desc = 'EX AF,AF\''; break;
      case 0x09: desc = 'ADD HL,BC'; break;
      case 0x0A: desc = 'LD A,(BC)'; break;
      case 0x0B: desc = 'DEC BC'; break;
      case 0x0C: desc = 'INC C'; break;
      case 0x0D: desc = 'DEC C'; break;
      case 0x0E: { desc = `LD C,${hexByte(rom[pc++])}`; break; }
      case 0x0F: desc = 'RRCA'; break;
      case 0x10: { const d = rom[pc++]; desc = `DJNZ ${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; break; }
      case 0x11: { const a = r24(pc); pc += 3; desc = `LD DE,${hex(a)}`; break; }
      case 0x12: desc = 'LD (DE),A'; break;
      case 0x13: desc = 'INC DE'; break;
      case 0x14: desc = 'INC D'; break;
      case 0x15: desc = 'DEC D'; break;
      case 0x16: { desc = `LD D,${hexByte(rom[pc++])}`; break; }
      case 0x18: { const d = rom[pc++]; desc = `JR ${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; break; }
      case 0x19: desc = 'ADD HL,DE'; break;
      case 0x1A: desc = 'LD A,(DE)'; break;
      case 0x1B: desc = 'DEC DE'; break;
      case 0x1E: { desc = `LD E,${hexByte(rom[pc++])}`; break; }
      case 0x20: { const d = rom[pc++]; desc = `JR NZ,${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x21: { const a = r24(pc); pc += 3; desc = `LD HL,${hex(a)}`; break; }
      case 0x22: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),HL`; refs.ramWrites.push(a); break; }
      case 0x23: desc = 'INC HL'; break;
      case 0x2A: { const a = r24(pc); pc += 3; desc = `LD HL,(${hex(a)})`; refs.ramReads.push(a); break; }
      case 0x2B: desc = 'DEC HL'; break;
      case 0x28: { const d = rom[pc++]; desc = `JR Z,${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x2E: { desc = `LD L,${hexByte(rom[pc++])}`; break; }
      case 0x2F: desc = 'CPL'; break;
      case 0x30: { const d = rom[pc++]; desc = `JR NC,${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x32: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),A`; refs.ramWrites.push(a); break; }
      case 0x36: { desc = `LD (HL),${hexByte(rom[pc++])}`; break; }
      case 0x37: desc = 'SCF'; break;
      case 0x38: { const d = rom[pc++]; desc = `JR C,${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x3A: { const a = r24(pc); pc += 3; desc = `LD A,(${hex(a)})`; refs.ramReads.push(a); break; }
      case 0x3E: { desc = `LD A,${hexByte(rom[pc++])}`; break; }
      case 0x3C: desc = 'INC A'; break;
      case 0x3D: desc = 'DEC A'; break;

      case 0x40: desc = 'LD B,B'; break;
      case 0x41: desc = 'LD B,C'; break;
      case 0x44: desc = 'LD B,H'; break;
      case 0x45: desc = 'LD B,L'; break;
      case 0x47: desc = 'LD B,A'; break;
      case 0x48: desc = 'LD C,B'; break;
      case 0x49: desc = 'LD C,C'; break;
      case 0x4F: desc = 'LD C,A'; break;
      case 0x50: desc = 'LD D,B'; break;
      case 0x54: desc = 'LD D,H'; break;
      case 0x55: desc = 'LD D,L'; break;
      case 0x57: desc = 'LD D,A'; break;
      case 0x58: desc = 'LD E,B'; break;
      case 0x59: desc = 'LD E,C'; break;
      case 0x5F: desc = 'LD E,A'; break;
      case 0x60: desc = 'LD H,B'; break;
      case 0x61: desc = 'LD H,C'; break;
      case 0x65: desc = 'LD H,L'; break;
      case 0x67: desc = 'LD H,A'; break;
      case 0x68: desc = 'LD L,B'; break;
      case 0x69: desc = 'LD L,C'; break;
      case 0x6F: desc = 'LD L,A'; break;

      case 0x77: desc = 'LD (HL),A'; break;
      case 0x78: desc = 'LD A,B'; break;
      case 0x79: desc = 'LD A,C'; break;
      case 0x7A: desc = 'LD A,D'; break;
      case 0x7B: desc = 'LD A,E'; break;
      case 0x7C: desc = 'LD A,H'; break;
      case 0x7D: desc = 'LD A,L'; break;
      case 0x7E: desc = 'LD A,(HL)'; break;

      case 0x80: desc = 'ADD A,B'; break;
      case 0x81: desc = 'ADD A,C'; break;
      case 0x87: desc = 'ADD A,A'; break;
      case 0x88: desc = 'ADC A,B'; break;
      case 0x90: desc = 'SUB B'; break;
      case 0x91: desc = 'SUB C'; break;
      case 0x95: desc = 'SUB L'; break;
      case 0x96: desc = 'SUB (HL)'; break;
      case 0x9C: desc = 'SBC A,H'; break;
      case 0xA0: desc = 'AND B'; break;
      case 0xA7: desc = 'AND A'; break;
      case 0xAF: desc = 'XOR A'; break;
      case 0xA6: desc = 'AND (HL)'; break;
      case 0xAE: desc = 'XOR (HL)'; break;
      case 0xB0: desc = 'OR B'; break;
      case 0xB1: desc = 'OR C'; break;
      case 0xB6: desc = 'OR (HL)'; break;
      case 0xB7: desc = 'OR A'; break;
      case 0xB8: desc = 'CP B'; break;
      case 0xB9: desc = 'CP C'; break;
      case 0xBE: desc = 'CP (HL)'; break;

      case 0xC0: desc = 'RET NZ'; break;
      case 0xC1: desc = 'POP BC'; break;
      case 0xC2: { const a = r24(pc); pc += 3; desc = `JP NZ,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xC3: { const a = r24(pc); pc += 3; desc = `JP ${hex(a)}`; refs.jumps.push(a); break; }
      case 0xC4: { const a = r24(pc); pc += 3; desc = `CALL NZ,${hex(a)}`; refs.calls.push(a); break; }
      case 0xC5: desc = 'PUSH BC'; break;
      case 0xC6: { desc = `ADD A,${hexByte(rom[pc++])}`; break; }
      case 0xC8: desc = 'RET Z'; break;
      case 0xC9: desc = 'RET'; break;
      case 0xCA: { const a = r24(pc); pc += 3; desc = `JP Z,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xCC: { const a = r24(pc); pc += 3; desc = `CALL Z,${hex(a)}`; refs.calls.push(a); break; }
      case 0xCD: { const a = r24(pc); pc += 3; desc = `CALL ${hex(a)}`; refs.calls.push(a); break; }
      case 0xD0: desc = 'RET NC'; break;
      case 0xD1: desc = 'POP DE'; break;
      case 0xD2: { const a = r24(pc); pc += 3; desc = `JP NC,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xD3: { const p = rom[pc++]; desc = `OUT (${hexByte(p)}),A`; break; }
      case 0xD5: desc = 'PUSH DE'; break;
      case 0xD6: { desc = `SUB ${hexByte(rom[pc++])}`; break; }
      case 0xD8: desc = 'RET C'; break;
      case 0xD9: desc = 'EXX'; break;
      case 0xDB: { const p = rom[pc++]; desc = `IN A,(${hexByte(p)})`; break; }
      case 0xE1: desc = 'POP HL'; break;
      case 0xE3: desc = 'EX (SP),HL'; break;
      case 0xE5: desc = 'PUSH HL'; break;
      case 0xE6: { desc = `AND ${hexByte(rom[pc++])}`; break; }
      case 0xE9: desc = 'JP (HL)'; break;
      case 0xEB: desc = 'EX DE,HL'; break;
      case 0xF1: desc = 'POP AF'; break;
      case 0xF3: desc = 'DI'; break;
      case 0xF5: desc = 'PUSH AF'; break;
      case 0xF6: { desc = `OR ${hexByte(rom[pc++])}`; break; }
      case 0xFE: { desc = `CP ${hexByte(rom[pc++])}`; break; }

      default:
        desc = hexByte(op);
        break;
    }

    const raw = rawBytes(iStart, pc - iStart);
    result.push({ addr: iStart, raw, desc, refs, len: pc - iStart });

    if (op === 0xC9) break; // RET
    if (op === 0xC3) break; // unconditional JP
    if (op === 0xE9) break; // JP (HL)
    if (op === 0xDD && rom[iStart + 1] === 0xE9) break; // JP (IX)
    if (op === 0xFD && rom[iStart + 1] === 0xE9) break; // JP (IY)
  }
  return result;
}

function printDisasm(label, instrs) {
  console.log(`\n── ${label} ──`);
  for (const i of instrs) {
    console.log(`  ${hex(i.addr)}: ${i.raw.padEnd(20)} ${i.desc}`);
  }
}

// ──────────────────────────────────────────────
// 1. Parse the inline dispatch table
// ──────────────────────────────────────────────

console.log('='.repeat(70));
console.log('Phase 409: Notification Dispatch Table Decoder');
console.log('='.repeat(70));

// CALL 0x002623 is at 0x0120DD (4 bytes: CD 23 26 00)
// Return address = 0x0120E1, which is where inline data begins
const inlineStart = 0x0120E1;
const maxIdx = rom[inlineStart]; // 5
const entryCount = maxIdx + 1;

console.log(`\n[1] DISPATCH MECHANISM`);
console.log(`  Type: _seqcase inline table via CALL 0x002623`);
console.log(`  Inline data at: ${hex(inlineStart)}`);
console.log(`  Index source: (IY+4) loaded into HL at ${hex(0x0120D6)}`);
console.log(`  Max index: ${maxIdx} (${entryCount} entries)`);
console.log(`  Header bytes: ${rawBytes(inlineStart + 1, 4)}`);

const handlers = [];
for (let i = 0; i < entryCount; i++) {
  const off = inlineStart + 5 + i * 3;
  const addr = r24(off);
  handlers.push({ index: i, addr });
  console.log(`  Entry ${i}: ${hex(addr)} (table offset ${hex(off)})`);
}

const inlineEnd = inlineStart + 5 + entryCount * 3;
console.log(`  Code resumes at: ${hex(inlineEnd)}`);

// ──────────────────────────────────────────────
// 2. Context: the handler prelude at 0x0120AA
// ──────────────────────────────────────────────

console.log(`\n[2] HANDLER PRELUDE (0x0120AA)`);
const prelude = disasmAt(0x0120AA, 25);
// Print up to the CALL 0x002623
for (const i of prelude) {
  console.log(`  ${hex(i.addr)}: ${i.raw.padEnd(20)} ${i.desc}`);
  if (i.desc.includes('CALL 0x002623')) break;
}
console.log(`  ... (inline table follows, then handlers) ...`);

// ──────────────────────────────────────────────
// 3. Error path (carry from bounds check)
// ──────────────────────────────────────────────

console.log(`\n[3] ERROR PATH (carry from 0x0023AD bounds check)`);
const errPath = disasmAt(0x0120C5, 10);
printDisasm('Error path at 0x0120C5', errPath);
console.log('  -> Calls 0x0136BF with BC=7 (error code), then JP epilogue');

// ──────────────────────────────────────────────
// 4. Epilogue at 0x0121EA
// ──────────────────────────────────────────────

console.log(`\n[4] EPILOGUE at 0x0121EA`);
const epilogue = disasmAt(0x0121EA, 5);
printDisasm('Epilogue', epilogue);

// ──────────────────────────────────────────────
// 5. Each sub-handler in detail
// ──────────────────────────────────────────────

console.log(`\n${'='.repeat(70)}`);
console.log(`[5] SUB-HANDLER DETAILS`);
console.log(`${'='.repeat(70)}`);

const allCalls = new Set();
const allRamReads = new Set();
const allRamWrites = new Set();

for (const h of handlers) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Handler ${h.index} at ${hex(h.addr)} (IY+4 = ${h.index})`);
  console.log(`${'─'.repeat(60)}`);

  const instrs = disasmAt(h.addr, 20);
  for (const i of instrs) {
    console.log(`  ${hex(i.addr)}: ${i.raw.padEnd(20)} ${i.desc}`);
    for (const c of i.refs.calls) allCalls.add(c);
    for (const r of i.refs.ramReads) allRamReads.add(r);
    for (const w of i.refs.ramWrites) allRamWrites.add(w);
  }

  // Classify behavior
  const callTargets = instrs.flatMap(i => i.refs.calls);
  const ramR = instrs.flatMap(i => i.refs.ramReads);
  const ramW = instrs.flatMap(i => i.refs.ramWrites);

  console.log(`  Calls: ${callTargets.map(hex).join(', ') || 'none'}`);
  console.log(`  RAM reads: ${ramR.map(hex).join(', ') || 'none'}`);
  console.log(`  RAM writes: ${ramW.map(hex).join(', ') || 'none'}`);
}

// ──────────────────────────────────────────────
// 6. Deep-dive into each unique CALL target
// ──────────────────────────────────────────────

const callTargetsToTrace = [0x013250, 0x013377, 0x01340F, 0x0135CF, 0x0136BF];

console.log(`\n${'='.repeat(70)}`);
console.log(`[6] CALL TARGET DEEP DIVES`);
console.log(`${'='.repeat(70)}`);

for (const target of callTargetsToTrace) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Subroutine ${hex(target)}`);
  console.log(`${'─'.repeat(60)}`);

  const instrs = disasmAt(target, 40);
  const ramR = new Set();
  const ramW = new Set();
  const subcalls = new Set();

  for (const i of instrs) {
    console.log(`  ${hex(i.addr)}: ${i.raw.padEnd(20)} ${i.desc}`);
    for (const r of i.refs.ramReads) ramR.add(r);
    for (const w of i.refs.ramWrites) ramW.add(w);
    for (const c of i.refs.calls) subcalls.add(c);
  }

  console.log(`  Sub-calls: ${[...subcalls].map(hex).join(', ') || 'none'}`);
  console.log(`  RAM reads: ${[...ramR].map(hex).join(', ') || 'none'}`);
  console.log(`  RAM writes: ${[...ramW].map(hex).join(', ') || 'none'}`);
}

// ──────────────────────────────────────────────
// 7. Verify the _seqcase helper at 0x002623
// ──────────────────────────────────────────────

console.log(`\n${'='.repeat(70)}`);
console.log(`[7] _seqcase HELPER at 0x002623`);
console.log(`${'='.repeat(70)}`);

const seqcase = disasmAt(0x002623, 30);
printDisasm('_seqcase (0x002623)', seqcase);

// ──────────────────────────────────────────────
// 8. Summary and classification
// ──────────────────────────────────────────────

console.log(`\n${'='.repeat(70)}`);
console.log(`[8] SUMMARY`);
console.log(`${'='.repeat(70)}`);

const classifications = [
  {
    idx: 0,
    addr: 0x0120F8,
    call: 0x013250,
    label: 'Link/USB receive worker A',
    detail: 'Calls 0x013250 which sets up a stack frame (CALL 0x002197), reads ' +
            'link buffer pointer from D1776D, pushes param=4, and processes incoming data. ' +
            'Likely handles a specific USB transfer type (bulk/interrupt IN).',
  },
  {
    idx: 1,
    addr: 0x012100,
    call: 0x013377,
    label: 'Link/USB receive worker B',
    detail: 'Calls 0x013377 which also reads D1776D (link buffer pointer), then ' +
            'calls 0x0021C2 (a comparison/validation helper). Likely handles a ' +
            'different USB transfer type or validates received data before processing.',
  },
  {
    idx: 2,
    addr: 0x012108,
    call: 0x01340F,
    label: 'Link state setter (mode 4)',
    detail: 'Sets RAM byte D17795 = 4 (link protocol mode/state), then calls 0x01340F. ' +
            'The 0x01340F subroutine allocates a large stack frame (22 bytes), zeros ' +
            'multiple IX-relative slots, and likely initializes a link transfer context.',
  },
  {
    idx: 3,
    addr: 0x012116,
    call: 0x01340F,
    label: 'Link state setter (mode 5)',
    detail: 'Sets RAM byte D17795 = 5 (link protocol mode/state), then calls same ' +
            '0x01340F. Identical structure to handler 2 but with a different mode byte. ' +
            'Together handlers 2+3 select between two link protocol variants.',
  },
  {
    idx: 4,
    addr: 0x012124,
    call: 0x0135CF,
    label: 'Extended link worker C',
    detail: 'Calls 0x0135CF which reads D1776D, then does a CP 1 comparison. ' +
            'Likely handles an extended or alternate link transfer protocol.',
  },
  {
    idx: 5,
    addr: 0x01212C,
    call: 0x0136BF,
    label: 'Default/fallback error reporter',
    detail: 'Loads BC=1 and calls 0x0136BF. This is the same function called ' +
            'on bounds-check failure (with BC=7). So handler 5 is the "no specific ' +
            'handler" fallback — it reports a type-1 notification error. The 0x0136BF ' +
            'subroutine writes 7 to D17795 and stores results at D176F2.',
  },
];

console.log('\nDispatch table at 0x0120E1 (6 entries, indexed by IY+4):');
console.log('');
console.log('| Index | Address    | CALL Target | Classification                    |');
console.log('|-------|------------|-------------|-----------------------------------|');
for (const c of classifications) {
  const callStr = c.call ? hex(c.call) : 'inline';
  console.log(`|   ${c.idx}   | ${hex(c.addr)} | ${callStr}  | ${c.label.padEnd(33)} |`);
}

console.log('\nKey RAM addresses:');
console.log('  D1776D — Link/USB buffer pointer (read by handlers 0, 1, 4)');
console.log('  D17795 — Link protocol mode/state byte (written by handlers 2, 3; also by 0x0136BF)');
console.log('  D1778E — Pre-check parameter A (read in prelude)');
console.log('  D1778B — Pre-check parameter BC (read in prelude)');
console.log('  D176F2 — Error/result storage (written by 0x0136BF)');

console.log('\nKey subroutines:');
console.log('  0x002197 — Stack frame allocator (used by 0x013250, 0x013377, 0x01340F, 0x0135CF)');
console.log('  0x002623 — _seqcase inline dispatch (table walker)');
console.log('  0x00238F — Parameter conversion (prelude)');
console.log('  0x0023AD — Bounds check (prelude)');
console.log('  0x0021C2 — Comparison/validation (used by 0x013377)');
console.log('  0x0136BF — Error/notification reporter');

console.log('\nDispatch mechanism detail:');
console.log('  1. Prelude reads IX frame params, calls 0x00238F (param conversion)');
console.log('  2. Reads D1778E into A, D1778B into BC');
console.log('  3. Calls 0x0023AD bounds check — carry = out of range');
console.log('  4. If carry: error path (BC=7, CALL 0x0136BF)');
console.log('  5. If no carry: reads (IY+4) as dispatch index');
console.log('  6. SBC HL,HL + LD L,A → HL = index (0-5)');
console.log('  7. CALL 0x002623 with inline table (6 entries × 3 bytes)');
console.log('  8. _seqcase walks table: if index > max, uses last entry (default)');
console.log('  9. Each handler does its work, then JP 0x0121EA (epilogue)');
console.log('  10. Epilogue: LD SP,IX; POP IX; RET');

console.log('\n' + '='.repeat(70));
console.log('Phase 409 probe complete.');
console.log('='.repeat(70));

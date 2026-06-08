/**
 * probe-phase575-decode-05831E.mjs
 *
 * Decode the function at 0x058241 that contains the CALL 0x0A1FB5
 * (secondary scroll buffer swap) at 0x05831E.
 *
 * Outputs: formatted disassembly, gate analysis, RAM refs, callers.
 * Writes report to phase575p2-decode-05831E-report.md.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rom = readFileSync(join(__dirname, 'ROM.rom'));

// ── helpers ──────────────────────────────────────────────────────────
function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function le24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function le16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function signed8(b) {
  return b > 127 ? b - 256 : b;
}

// ── manual eZ80 ADL-mode decoder (enough for this function) ──────────
function decode(pc) {
  const opc = pc;
  let sis = false;
  let b = rom[pc];

  // .SIS prefix (0x40 in ADL mode)
  if (b === 0x40) {
    sis = true;
    pc++;
    b = rom[pc];
  }

  const pfx = sis ? '.SIS ' : '';

  // LD r,r and LD r,(HL) block 0x40-0x7F (only when NOT .SIS prefix)
  // Already consumed 0x40 as prefix above, so this won't fire for .SIS

  switch (b) {
    // ── returns ──
    case 0xC9: return mk(1, 'RET');
    case 0xC0: return mk(1, 'RET NZ');
    case 0xC8: return mk(1, 'RET Z');
    case 0xD0: return mk(1, 'RET NC');
    case 0xD8: return mk(1, 'RET C');

    // ── unconditional JP / CALL ──
    case 0xC3: return mk(4, pfx + 'JP ' + addr());
    case 0xCD: return mk(4, pfx + 'CALL ' + addr());

    // ── conditional JP ──
    case 0xC2: return mk(4, pfx + 'JP NZ,' + addr());
    case 0xCA: return mk(4, pfx + 'JP Z,' + addr());
    case 0xD2: return mk(4, pfx + 'JP NC,' + addr());
    case 0xDA: return mk(4, pfx + 'JP C,' + addr());

    // ── conditional CALL ──
    case 0xC4: return mk(4, pfx + 'CALL NZ,' + addr());
    case 0xCC: return mk(4, pfx + 'CALL Z,' + addr());
    case 0xD4: return mk(4, pfx + 'CALL NC,' + addr());
    case 0xDC: return mk(4, pfx + 'CALL C,' + addr());

    // ── JR ──
    case 0x18: return mkJR('JR');
    case 0x20: return mkJR('JR NZ,');
    case 0x28: return mkJR('JR Z,');
    case 0x30: return mkJR('JR NC,');
    case 0x38: return mkJR('JR C,');

    // ── 24-bit LD imm ──
    case 0x01: return mk(4, pfx + 'LD BC,' + addr());
    case 0x11: return mk(4, pfx + 'LD DE,' + addr());
    case 0x21: return mk(4, pfx + 'LD HL,' + addr());

    // ── LD A,(nn) / LD (nn),A ──
    case 0x3A: return mk(4, pfx + 'LD A,(' + addr() + ')');
    case 0x32: return mk(4, pfx + 'LD (' + addr() + '),A');

    // ── LD HL,(nn) / LD (nn),HL ──
    case 0x2A: return mk(sis ? 3 : 4, pfx + 'LD HL,(' + (sis ? addr16() : addr()) + ')');
    case 0x22: return mk(sis ? 3 : 4, pfx + 'LD (' + (sis ? addr16() : addr()) + '),HL');

    // ── 8-bit LD imm ──
    case 0x06: return mk(2, pfx + 'LD B,' + hex(rom[pc + 1], 2));
    case 0x0E: return mk(2, pfx + 'LD C,' + hex(rom[pc + 1], 2));
    case 0x16: return mk(2, pfx + 'LD D,' + hex(rom[pc + 1], 2));
    case 0x1E: return mk(2, pfx + 'LD E,' + hex(rom[pc + 1], 2));
    case 0x26: return mk(2, pfx + 'LD H,' + hex(rom[pc + 1], 2));
    case 0x2E: return mk(2, pfx + 'LD L,' + hex(rom[pc + 1], 2));
    case 0x36: return mk(2, pfx + 'LD (HL),' + hex(rom[pc + 1], 2));
    case 0x3E: return mk(2, pfx + 'LD A,' + hex(rom[pc + 1], 2));

    // ── INC/DEC 16-bit ──
    case 0x03: return mk(1, pfx + 'INC BC');
    case 0x13: return mk(1, pfx + 'INC DE');
    case 0x23: return mk(1, pfx + 'INC HL');
    case 0x0B: return mk(1, pfx + 'DEC BC');
    case 0x1B: return mk(1, pfx + 'DEC DE');
    case 0x2B: return mk(1, pfx + 'DEC HL');

    // ── ALU A,imm ──
    case 0xC6: return mk(2, 'ADD A,' + hex(rom[pc + 1], 2));
    case 0xCE: return mk(2, 'ADC A,' + hex(rom[pc + 1], 2));
    case 0xD6: return mk(2, 'SUB ' + hex(rom[pc + 1], 2));
    case 0xDE: return mk(2, 'SBC A,' + hex(rom[pc + 1], 2));
    case 0xE6: return mk(2, 'AND ' + hex(rom[pc + 1], 2));
    case 0xEE: return mk(2, 'XOR ' + hex(rom[pc + 1], 2));
    case 0xF6: return mk(2, 'OR ' + hex(rom[pc + 1], 2));
    case 0xFE: return mk(2, 'CP ' + hex(rom[pc + 1], 2));

    // ── misc single-byte ──
    case 0xAF: return mk(1, 'XOR A');
    case 0xB7: return mk(1, 'OR A');
    case 0xEF: return mk(1, 'RST 28h');

    // ── CB prefix (bit ops on registers) ──
    case 0xCB: return decodeCB();

    // ── FD prefix (IY) ──
    case 0xFD: return decodeFD();

    // ── ED prefix ──
    case 0xED: return decodeED();

    default: break;
  }

  // LD r,r block (0x40-0x7F except 0x76=HALT)
  if (b >= 0x40 && b <= 0x7F && b !== 0x76 && !sis) {
    const dst = ['B','C','D','E','H','L','(HL)','A'][(b >> 3) & 7];
    const src = ['B','C','D','E','H','L','(HL)','A'][b & 7];
    return mk(1, 'LD ' + dst + ',' + src);
  }

  // ALU A,r block (0x80-0xBF)
  if (b >= 0x80 && b <= 0xBF) {
    const ops = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
    const reg = ['B','C','D','E','H','L','(HL)','A'][b & 7];
    return mk(1, ops[(b >> 3) & 7] + reg);
  }

  return mk(1, 'DB ' + hex(b, 2));

  // ── sub-decoders ──
  function mk(instrLen, text) {
    const totalLen = (sis ? 1 : 0) + instrLen;
    return { len: totalLen, text, bytes: rom.subarray(opc, opc + totalLen) };
  }

  function addr() {
    if (sis) return hex(le16(rom, pc + 1), 4);
    return hex(le24(rom, pc + 1));
  }

  function addr16() {
    return hex(le16(rom, pc + 1), 4);
  }

  function mkJR(prefix) {
    const off = signed8(rom[pc + 1]);
    const target = pc + 2 + off;
    return mk(2, prefix + hex(target));
  }

  function decodeCB() {
    const op = rom[pc + 1];
    const bit = (op >> 3) & 7;
    const reg = ['B','C','D','E','H','L','(HL)','A'][op & 7];
    const base = op & 0xC0;
    const what = base === 0x40 ? 'BIT' : base === 0x80 ? 'RES' : base === 0xC0 ? 'SET' : '???';
    return mk(2, what + ' ' + bit + ',' + reg);
  }

  function decodeFD() {
    const b2 = rom[pc + 1];
    if (b2 === 0xCB) {
      const off = rom[pc + 2];
      const op = rom[pc + 3];
      const bit = (op >> 3) & 7;
      const base = op & 0xC0;
      const what = base === 0x40 ? 'BIT' : base === 0x80 ? 'RES' : base === 0xC0 ? 'SET' : '???';
      return mk(4, what + ' ' + bit + ',(IY+' + hex(off, 2) + ')');
    }
    if (b2 === 0x7E) return mk(3, 'LD A,(IY+' + hex(rom[pc + 2], 2) + ')');
    if (b2 === 0x77) return mk(3, 'LD (IY+' + hex(rom[pc + 2], 2) + '),A');
    if (b2 === 0x36) return mk(4, 'LD (IY+' + hex(rom[pc + 2], 2) + '),' + hex(rom[pc + 3], 2));
    return mk(2, 'DB 0xFD,' + hex(b2, 2));
  }

  function decodeED() {
    const b2 = rom[pc + 1];
    if (b2 === 0xB0) return mk(2, pfx + 'LDIR');
    if (b2 === 0xB8) return mk(2, pfx + 'LDDR');
    if (b2 === 0x5B) return mk(sis ? 4 : 5, pfx + 'LD DE,(' + (sis ? hex(le16(rom, pc + 2), 4) : hex(le24(rom, pc + 2))) + ')');
    if (b2 === 0x4B) return mk(sis ? 4 : 5, pfx + 'LD BC,(' + (sis ? hex(le16(rom, pc + 2), 4) : hex(le24(rom, pc + 2))) + ')');
    if (b2 === 0x53) return mk(sis ? 4 : 5, pfx + 'LD (' + (sis ? hex(le16(rom, pc + 2), 4) : hex(le24(rom, pc + 2))) + '),DE');
    if (b2 === 0x43) return mk(sis ? 4 : 5, pfx + 'LD (' + (sis ? hex(le16(rom, pc + 2), 4) : hex(le24(rom, pc + 2))) + '),BC');
    return mk(2, pfx + 'ED ' + hex(b2, 2));
  }
}

// ── disassemble a range ──────────────────────────────────────────────
function disasm(start, end) {
  const out = [];
  let pc = start;
  while (pc < end) {
    const d = decode(pc);
    const byteStr = Array.from(d.bytes).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    out.push({ addr: pc, len: d.len, text: d.text, byteStr });
    pc += d.len;
  }
  return out;
}

// ── scan ROM for CALL/JP to a target ─────────────────────────────────
function findCallers(target) {
  const b0 = target & 0xFF, b1 = (target >> 8) & 0xFF, b2 = (target >> 16) & 0xFF;
  const callers = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
      const op = rom[i];
      if (op === 0xCD) callers.push({ addr: i, type: 'CALL' });
      else if (op === 0xC3) callers.push({ addr: i, type: 'JP' });
      else if (op === 0xC4) callers.push({ addr: i, type: 'CALL NZ' });
      else if (op === 0xCC) callers.push({ addr: i, type: 'CALL Z' });
      else if (op === 0xD4) callers.push({ addr: i, type: 'CALL NC' });
      else if (op === 0xDC) callers.push({ addr: i, type: 'CALL C' });
      else if (op === 0xC2) callers.push({ addr: i, type: 'JP NZ' });
      else if (op === 0xCA) callers.push({ addr: i, type: 'JP Z' });
    }
  }
  return callers;
}

// ── main ─────────────────────────────────────────────────────────────

const FUNC_START = 0x058241;
const FUNC_END   = 0x0583E8; // byte after RET at 0x0583E7
const TARGET     = 0x05831E;
const SCROLL_SWAP = 0x0A1FB5;

console.log('=== Phase 575 P2: Decode function 0x058241 containing CALL 0x0A1FB5 at 0x05831E ===\n');

// 1. Full disassembly
const insns = disasm(FUNC_START, FUNC_END);
console.log('--- Full Disassembly (0x058241 - 0x0583E7, ' + (FUNC_END - FUNC_START) + ' bytes) ---\n');
for (const i of insns) {
  const mark = i.addr === TARGET ? '  <<<< SCROLL SWAP CALL' : '';
  console.log(hex(i.addr) + ':  ' + i.byteStr.padEnd(20) + i.text + mark);
}

// 2. Gate analysis
console.log('\n--- Gate Analysis for CALL 0x0A1FB5 at ' + hex(TARGET) + ' ---\n');
console.log('The CALL at ' + hex(TARGET) + ' is UNCONDITIONAL (opcode CD).');
console.log('Early exits that prevent reaching the scroll swap:');
const gates = [];
for (const i of insns) {
  if (i.addr >= TARGET) break;
  if (i.text.startsWith('RET NZ') || i.text.startsWith('RET Z') ||
      i.text.startsWith('RET NC') || i.text.startsWith('RET C')) {
    gates.push(i);
    console.log('  ' + hex(i.addr) + ': ' + i.text);
  }
  if (i.text.startsWith('JP NZ,') || i.text.startsWith('JP Z,') ||
      i.text.startsWith('JP NC,') || i.text.startsWith('JP C,')) {
    gates.push(i);
    console.log('  ' + hex(i.addr) + ': ' + i.text + ' (exits function)');
  }
}

// 3. IY flag checks that guard the early exits
console.log('\nIY flag checks that gate early exits:');
for (let idx = 0; idx < insns.length; idx++) {
  const i = insns[idx];
  if (i.addr >= TARGET) break;
  if (i.text.startsWith('BIT ')) {
    // Look at next instruction
    const next = insns[idx + 1];
    if (next && (next.text.startsWith('RET') || next.text.startsWith('JP NZ') ||
                  next.text.startsWith('JP Z') || next.text.startsWith('JR NZ') ||
                  next.text.startsWith('JR Z') || next.text.startsWith('CALL NZ') ||
                  next.text.startsWith('CALL Z'))) {
      console.log('  ' + hex(i.addr) + ': ' + i.text + '  ->  ' + hex(next.addr) + ': ' + next.text);
    }
  }
}

// 4. RAM references
console.log('\n--- RAM References (D0xxxx) ---\n');
const ramRefs = new Map();
for (const i of insns) {
  const text = i.text;
  // Extract addresses from instruction text
  const matches = text.matchAll(/0x(D0[0-9A-F]{4})/gi);
  for (const m of matches) {
    const addr = '0x' + m[1].toUpperCase();
    if (!ramRefs.has(addr)) ramRefs.set(addr, []);
    ramRefs.get(addr).push({ addr: i.addr, text: i.text });
  }
}
for (const [addr, refs] of [...ramRefs.entries()].sort()) {
  console.log(addr + ':');
  for (const r of refs) {
    console.log('  ' + hex(r.addr) + ': ' + r.text);
  }
}

// 5. All CALL targets
console.log('\n--- CALL Targets ---\n');
for (const i of insns) {
  if (i.text.includes('CALL')) {
    const mark = i.addr === TARGET ? ' <<<< SCROLL SWAP' : '';
    console.log(hex(i.addr) + ': ' + i.text + mark);
  }
}

// 6. Callers of 0x058241
console.log('\n--- Callers of ' + hex(FUNC_START) + ' ---\n');
const callers = findCallers(FUNC_START);
for (const c of callers) {
  console.log(hex(c.addr) + ': ' + c.type + ' ' + hex(FUNC_START));
}
if (callers.length === 0) console.log('(none found)');

// 7. Also decode the subroutine at 0x0583EE (called from within this function)
const SUB_START = 0x0583EE;
console.log('\n--- Subroutine ' + hex(SUB_START) + ' (called from 0x0583B6) ---\n');
const subInsns = disasm(SUB_START, SUB_START + 0x30);
for (const i of subInsns) {
  console.log(hex(i.addr) + ':  ' + i.byteStr.padEnd(20) + i.text);
  if (i.text === 'RET') break;
}

// 8. Check what the LDIR before the scroll swap does
console.log('\n--- Pre-scroll-swap LDIR context ---\n');
console.log('0x058310: LD HL,0xD0232D   ; source');
console.log('0x058314: LD DE,0xD006C0   ; destination');
console.log('0x058318: LD BC,0x000104   ; 260 bytes');
console.log('0x05831C: LDIR             ; copy 260 bytes D0232D -> D006C0');
console.log('0x05831E: CALL 0x0A1FB5    ; scroll swap: 8400 bytes D07396 -> D031F6');
console.log('');
console.log('Interpretation: D0232D and D006C0 are likely display-state');
console.log('buffers. The 260-byte copy stages some state before the main');
console.log('8400-byte secondary-to-primary scroll buffer swap.');

// 9. Also check the branch after the swap
console.log('\n--- Post-scroll-swap branch ---\n');
console.log('0x058322: BIT 2,(IY+0x15)');
console.log('0x058326: JR Z,0x058344');
console.log('  If bit2 set: load LCD params and CALL 0x09EF20 (LCD window set)');
console.log('  If bit2 clear: CALL 0x0A2854');
console.log('Then both paths converge at 0x058348.');

// ── write report ─────────────────────────────────────────────────────
const lines = [];
lines.push('# Phase 575 P2: Decode 0x058241 (caller of scroll swap 0x0A1FB5)');
lines.push('');
lines.push('## Function Boundaries');
lines.push('');
lines.push('| Field | Value |');
lines.push('|-------|-------|');
lines.push('| Entry | 0x058241 |');
lines.push('| End (byte after RET) | 0x0583E8 |');
lines.push('| Size | ' + (FUNC_END - FUNC_START) + ' bytes (423 bytes) |');
lines.push('| CALL 0x0A1FB5 at | 0x05831E |');
lines.push('| Caller | 0x0620C4: CALL 0x058241 |');
lines.push('');
lines.push('## What Gates the Scroll Swap');
lines.push('');
lines.push('The CALL 0x0A1FB5 at 0x05831E is **unconditional** (opcode `CD`). However, the function has **five early exits** that prevent execution from reaching it:');
lines.push('');
lines.push('| Address | Gate | IY Flag Check |');
lines.push('|---------|------|---------------|');
lines.push('| 0x058253 | CALL NZ,0x0239B3 | BIT 4,(IY+0x34) |');
lines.push('| 0x058257 | RET NZ | (continues from above CALL NZ) |');
lines.push('| 0x058286 | JP NZ,0x058A2C | BIT 6,(IY+0x1C) |');
lines.push('| 0x05828E | RET NZ | BIT 7,(IY+0x09) |');
lines.push('| 0x058297 | JP NZ,0x058483 | BIT 7,(IY+0x0C) |');
lines.push('| 0x05829F | RET NZ | BIT 6,(IY+0x0C) |');
lines.push('');
lines.push('All five gates must pass (bits NOT set) for the scroll swap to execute. The key IY flags:');
lines.push('- **(IY+0x34) bit 4** - if set, calls 0x0239B3 then returns if NZ');
lines.push('- **(IY+0x1C) bit 6** - if set, jumps to 0x058A2C (alternate path)');
lines.push('- **(IY+0x09) bit 7** - if set, returns immediately');
lines.push('- **(IY+0x0C) bit 7** - if set, jumps to 0x058483 (alternate path)');
lines.push('- **(IY+0x0C) bit 6** - if set, returns immediately');
lines.push('');
lines.push('## Pre-Swap Setup');
lines.push('');
lines.push('Before reaching 0x05831E, the function:');
lines.push('1. Clears many IY flags: (IY+0x4A) bit4, (IY+0x05) bit3, (IY+0x47) bit1, (IY+0x49) bit6, (IY+0x25) bit5, (IY+0x08) bit1, (IY+0x15) bit6, (IY+0x1F) bit2, (IY+0x01) bit4');
lines.push('2. Calls several subsystems: 0x09DCAA, 0x083623, 0x083764, 0x058D49, 0x08BF22, 0x0800EC, 0x09CE10');
lines.push('3. Loads and stores LCD parameters via .SIS to ports 0x07C7, 0x07C8, 0x07C4 (reading from 0x2433, 0x2431)');
lines.push('4. Copies RAM: 260 bytes from D0232D to D006C0 (LDIR)');
lines.push('5. Copies A from (D02687) to (D02685)');
lines.push('');
lines.push('## Post-Swap Path');
lines.push('');
lines.push('After the scroll swap call:');
lines.push('1. **BIT 2,(IY+0x15)** branches:');
lines.push('   - If set: loads LCD window params (BC=0x1E24 or 0x9B9C), sets window via CALL 0x09EF20');
lines.push('   - If clear: CALL 0x0A2854');
lines.push('2. CALL 0x061DEF with HL=0x05845D (callback table pointer?)');
lines.push('3. CALL 0x09E601, CALL 0x061E20');
lines.push('4. RES 0,(HL) at D02A92');
lines.push('5. If (IY+0x15) bit2 set: CALL 0x0A235E');
lines.push('6. Menu key handling via (IY+0x45) bits 0-1');
lines.push('7. Final LCD/display commit sequence via 0x07FF7B, 0x058CB6');
lines.push('8. Either graph mode path (BIT 3,(IY+0x49) -> LD A,0x40, CALL 0x092D9C)');
lines.push('   or normal redraw path (CALL 0x0583EE subroutine)');
lines.push('9. RES 6,(IY+0x49), CALL 0x0A1FD1, RET');
lines.push('');
lines.push('## RAM Variables');
lines.push('');
lines.push('| Address | Usage |');
lines.push('|---------|-------|');
lines.push('| D02687 | Read: source value copied to D02685 |');
lines.push('| D02685 | Written: receives value from D02687 |');
lines.push('| D0265B | Written: receives result of CALL 0x058BA3 |');
lines.push('| D02506 | Written: receives same result as D0265B |');
lines.push('| D0232D | Source of 260-byte LDIR copy (display state?) |');
lines.push('| D006C0 | Destination of 260-byte LDIR copy |');
lines.push('| D02A92 | RES 0,(HL): bit 0 cleared after scroll swap |');
lines.push('');
lines.push('## LCD Port Access (.SIS)');
lines.push('');
lines.push('| Port | Operation |');
lines.push('|------|-----------|');
lines.push('| 0x26AC | LD (0x26AC),HL (set to 0x000000 at entry) |');
lines.push('| 0x2433 | LD HL,(0x2433) - read LCD param |');
lines.push('| 0x2431 | LD HL,(0x2431) - read LCD param |');
lines.push('| 0x07C7 | LD (0x07C7),HL - write LCD param |');
lines.push('| 0x07C8 | LD (0x07C8),HL - write LCD param |');
lines.push('| 0x07C4 | LD (0x07C4),HL - write LCD param |');
lines.push('');
lines.push('## Functional Summary');
lines.push('');
lines.push('**0x058241 is the OS main display refresh / home-screen repaint function.** It is called from 0x0620C4 (likely the main event loop dispatcher). The function:');
lines.push('');
lines.push('1. Guards against re-entry and mode conflicts via 5 IY flag checks');
lines.push('2. Clears ~9 IY flags to reset display-subsystem state');
lines.push('3. Calls several display subsystem initializers');
lines.push('4. Copies LCD hardware parameters and a 260-byte display state block');
lines.push('5. **Commits the secondary scroll buffer to primary** via CALL 0x0A1FB5 (8400-byte LDIR from D07396 to D031F6)');
lines.push('6. Configures LCD window (different params for graph vs normal mode)');
lines.push('7. Handles pending menu-key events');
lines.push('8. Runs final LCD commit and optional graph-mode rendering');
lines.push('');
lines.push('The scroll swap at 0x05831E is the core display-commit operation: it copies the secondary (working) scroll buffer into the primary (display) buffer, making pending text/cursor changes visible on-screen.');
lines.push('');
lines.push('## Subroutine 0x0583EE');
lines.push('');
lines.push('Called from 0x0583B6 (normal redraw path) and 0x0583E8 (alternate entry with JR back):');
lines.push('```');
lines.push('0x0583EE: CALL 0x090C12');
lines.push('0x0583F2: CALL 0x08F83E');
lines.push('0x0583F6: CALL 0x09E5CF');
lines.push('0x0583FA: CALL 0x058434');
lines.push('0x0583FE: CALL 0x090124');
lines.push('0x058402: CALL 0x08E294');
lines.push('0x058406: SET 2,(IY+0x44)');
lines.push('0x05840A: RET');
lines.push('```');
lines.push('This subroutine calls 6 display subsystem routines and sets (IY+0x44) bit 2 (display-refresh-complete flag?).');
lines.push('');
lines.push('## Full Disassembly');
lines.push('');
lines.push('```');
for (const i of insns) {
  const mark = i.addr === TARGET ? '  ; <<<< SCROLL SWAP CALL' : '';
  lines.push(hex(i.addr) + ':  ' + i.byteStr.padEnd(20) + i.text + mark);
}
lines.push('```');

const report = lines.join('\n') + '\n';
writeFileSync(join(__dirname, 'phase575p2-decode-05831E-report.md'), report);
console.log('\n--- Report written to phase575p2-decode-05831E-report.md ---');

process.exit(0);

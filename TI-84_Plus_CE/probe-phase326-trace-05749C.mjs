#!/usr/bin/env node
// Phase 326: Trace 0x05749C — sole caller of LCD timing wrapper 0x05F7D9
//
// 0x05F7D9 is a 5-byte leaf: CALL 0x0005CC; RET — returns HL from 0x007B70
// (LCD timing register reader). 0x05749C calls 0x05F7D9, 0x0AF8C4, 0x0572DF.
// This probe disassembles 0x05749C, its call targets, and finds all callers.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function read24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function read16LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function isRAM(addr)  { return addr >= 0xD00000 && addr <= 0xD1FFFF; }
function isVRAM(addr) { return addr >= 0xD40000 && addr <= 0xD65800; }
function isROM(addr)  { return addr < 0x400000; }
function isMMIO(addr) { return (addr >= 0xE00000 && addr <= 0xFFFFFF) || (addr >= 0xF00000); }

function addrLabel(addr) {
  if (addr === 0x05F7D9) return 'LCD_timing_wrapper';
  if (addr === 0x0AF8C4) return 'target_0AF8C4';
  if (addr === 0x0572DF) return 'target_0572DF';
  if (addr === 0x0005CC) return 'BCALL_dispatch';
  if (addr === 0x007B70) return 'LCD_timing_reg_reader';
  if (isRAM(addr))  return `RAM_${hex(addr)}`;
  if (isVRAM(addr)) return `VRAM_${hex(addr)}`;
  if (isMMIO(addr)) return `MMIO_${hex(addr)}`;
  return '';
}

// ---------------------------------------------------------------------------
// eZ80 instruction decoder (sufficient for static disassembly)
// ---------------------------------------------------------------------------
function decodeInstruction(buf, pc) {
  if (pc >= buf.length) return { mnemonic: '???', len: 1, calls: [], jumps: [], readsAddr: null, writesAddr: null };

  const b0 = buf[pc];
  let prefix = null;
  let off = pc;

  // Handle DD/FD prefix
  if (b0 === 0xDD || b0 === 0xFD) {
    prefix = b0 === 0xDD ? 'IX' : 'IY';
    off++;
    if (off >= buf.length) return { mnemonic: `${prefix} prefix (truncated)`, len: 1, calls: [], jumps: [], readsAddr: null, writesAddr: null };
  }

  const b = buf[off];
  const result = { calls: [], jumps: [], readsAddr: null, writesAddr: null };

  // ED prefix
  if (b === 0xED) {
    const b1 = buf[off + 1];
    if (b1 === 0xB0) { result.mnemonic = 'LDIR'; result.len = (off - pc) + 2; return result; }
    if (b1 === 0xB8) { result.mnemonic = 'LDDR'; result.len = (off - pc) + 2; return result; }
    if (b1 === 0xA0) { result.mnemonic = 'LDI'; result.len = (off - pc) + 2; return result; }
    if (b1 === 0xA8) { result.mnemonic = 'LDD'; result.len = (off - pc) + 2; return result; }
    if (b1 === 0x43) { const a = read24LE(buf, off+2); result.mnemonic = `LD (${hex(a)}),BC`; result.writesAddr = a; result.len = (off-pc)+5; return result; }
    if (b1 === 0x53) { const a = read24LE(buf, off+2); result.mnemonic = `LD (${hex(a)}),DE`; result.writesAddr = a; result.len = (off-pc)+5; return result; }
    if (b1 === 0x73) { const a = read24LE(buf, off+2); result.mnemonic = `LD (${hex(a)}),SP`; result.writesAddr = a; result.len = (off-pc)+5; return result; }
    if (b1 === 0x4B) { const a = read24LE(buf, off+2); result.mnemonic = `LD BC,(${hex(a)})`; result.readsAddr = a; result.len = (off-pc)+5; return result; }
    if (b1 === 0x5B) { const a = read24LE(buf, off+2); result.mnemonic = `LD DE,(${hex(a)})`; result.readsAddr = a; result.len = (off-pc)+5; return result; }
    if (b1 === 0x7B) { const a = read24LE(buf, off+2); result.mnemonic = `LD SP,(${hex(a)})`; result.readsAddr = a; result.len = (off-pc)+5; return result; }
    if (b1 === 0x44) { result.mnemonic = 'NEG'; result.len = (off-pc)+2; return result; }
    if (b1 === 0x4D) { result.mnemonic = 'RETI'; result.len = (off-pc)+2; return result; }
    if (b1 === 0x45) { result.mnemonic = 'RETN'; result.len = (off-pc)+2; return result; }
    if (b1 === 0x46) { result.mnemonic = 'IM 0'; result.len = (off-pc)+2; return result; }
    if (b1 === 0x56) { result.mnemonic = 'IM 1'; result.len = (off-pc)+2; return result; }
    if (b1 === 0x5E) { result.mnemonic = 'IM 2'; result.len = (off-pc)+2; return result; }
    if ((b1 & 0xC7) === 0x40) { const r = ['B','C','D','E','H','L','(HL)','A'][(b1>>3)&7]; result.mnemonic = `IN ${r},(C)`; result.len = (off-pc)+2; return result; }
    if ((b1 & 0xC7) === 0x41) { const r = ['B','C','D','E','H','L','(HL)','A'][(b1>>3)&7]; result.mnemonic = `OUT (C),${r}`; result.len = (off-pc)+2; return result; }
    result.mnemonic = `ED ${hex(b1, 2)}`; result.len = (off - pc) + 2; return result;
  }

  // CB prefix (bit ops)
  if (b === 0xCB) {
    const b1 = buf[off + 1];
    const r = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
    const bit = (b1 >> 3) & 7;
    if (b1 < 0x40) {
      const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      result.mnemonic = `${ops[(b1>>3)&7]} ${r}`;
    } else if (b1 < 0x80) {
      result.mnemonic = `BIT ${bit},${r}`;
    } else if (b1 < 0xC0) {
      result.mnemonic = `RES ${bit},${r}`;
    } else {
      result.mnemonic = `SET ${bit},${r}`;
    }
    result.len = (off - pc) + 2;
    return result;
  }

  // RET variants
  if (b === 0xC9) { result.mnemonic = 'RET'; result.len = (off-pc)+1; return result; }
  if (b === 0xC8) { result.mnemonic = 'RET Z'; result.len = (off-pc)+1; return result; }
  if (b === 0xC0) { result.mnemonic = 'RET NZ'; result.len = (off-pc)+1; return result; }
  if (b === 0xD8) { result.mnemonic = 'RET C'; result.len = (off-pc)+1; return result; }
  if (b === 0xD0) { result.mnemonic = 'RET NC'; result.len = (off-pc)+1; return result; }
  if (b === 0xE8) { result.mnemonic = 'RET PE'; result.len = (off-pc)+1; return result; }
  if (b === 0xE0) { result.mnemonic = 'RET PO'; result.len = (off-pc)+1; return result; }
  if (b === 0xF8) { result.mnemonic = 'RET M'; result.len = (off-pc)+1; return result; }
  if (b === 0xF0) { result.mnemonic = 'RET P'; result.len = (off-pc)+1; return result; }

  // CALL nn
  if (b === 0xCD) { const a = read24LE(buf, off+1); result.mnemonic = `CALL ${hex(a)}`; result.calls = [a]; result.len = (off-pc)+4; return result; }
  // Conditional CALL
  const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];
  if ((b & 0xC7) === 0xC4) { const a = read24LE(buf, off+1); const cc = ccNames[(b>>3)&7]; result.mnemonic = `CALL ${cc},${hex(a)}`; result.calls = [a]; result.len = (off-pc)+4; return result; }

  // JP nn
  if (b === 0xC3) { const a = read24LE(buf, off+1); result.mnemonic = `JP ${hex(a)}`; result.jumps = [a]; result.len = (off-pc)+4; return result; }
  // Conditional JP
  if ((b & 0xC7) === 0xC2) { const a = read24LE(buf, off+1); const cc = ccNames[(b>>3)&7]; result.mnemonic = `JP ${cc},${hex(a)}`; result.jumps = [a]; result.len = (off-pc)+4; return result; }

  // JP (HL)
  if (b === 0xE9) {
    const reg = prefix ? prefix : 'HL';
    result.mnemonic = `JP (${reg})`; result.len = (off-pc)+1; return result;
  }

  // JR
  if (b === 0x18) { const d = buf[off+1]; const target = pc + (off-pc) + 2 + ((d & 0x80) ? d - 256 : d); result.mnemonic = `JR ${hex(target)}`; result.jumps = [target]; result.len = (off-pc)+2; return result; }
  if (b === 0x20 || b === 0x28 || b === 0x30 || b === 0x38) {
    const cc = ['NZ','Z','NC','C'][(b - 0x20) >> 3];
    const d = buf[off+1]; const target = pc + (off-pc) + 2 + ((d & 0x80) ? d - 256 : d);
    result.mnemonic = `JR ${cc},${hex(target)}`; result.jumps = [target]; result.len = (off-pc)+2; return result;
  }

  // DJNZ
  if (b === 0x10) { const d = buf[off+1]; const target = pc + (off-pc) + 2 + ((d & 0x80) ? d - 256 : d); result.mnemonic = `DJNZ ${hex(target)}`; result.jumps = [target]; result.len = (off-pc)+2; return result; }

  // LD r,n (8-bit immediate)
  const r8 = ['B','C','D','E','H','L','(HL)','A'];
  if ((b & 0xC7) === 0x06) { const r = r8[(b>>3)&7]; const n = buf[off+1]; result.mnemonic = `LD ${r},${hex(n, 2)}`; result.len = (off-pc)+2; return result; }

  // LD r,r' (register-register)
  if ((b & 0xC0) === 0x40 && b !== 0x76) {
    const dst = r8[(b>>3)&7];
    const src = r8[b&7];
    result.mnemonic = `LD ${dst},${src}`; result.len = (off-pc)+1; return result;
  }

  // 16-bit LD immediate
  if (b === 0x21) { const a = read24LE(buf, off+1); const reg = prefix || 'HL'; result.mnemonic = `LD ${reg},${hex(a)}`; result.len = (off-pc)+4; return result; }
  if (b === 0x11) { const a = read24LE(buf, off+1); result.mnemonic = `LD DE,${hex(a)}`; result.len = (off-pc)+4; return result; }
  if (b === 0x01) { const a = read24LE(buf, off+1); result.mnemonic = `LD BC,${hex(a)}`; result.len = (off-pc)+4; return result; }
  if (b === 0x31) { const a = read24LE(buf, off+1); result.mnemonic = `LD SP,${hex(a)}`; result.len = (off-pc)+4; return result; }

  // LD A,(nn) / LD (nn),A
  if (b === 0x3A) { const a = read24LE(buf, off+1); result.mnemonic = `LD A,(${hex(a)})`; result.readsAddr = a; result.len = (off-pc)+4; return result; }
  if (b === 0x32) { const a = read24LE(buf, off+1); result.mnemonic = `LD (${hex(a)}),A`; result.writesAddr = a; result.len = (off-pc)+4; return result; }

  // LD HL,(nn) / LD (nn),HL
  if (b === 0x2A) { const a = read24LE(buf, off+1); const reg = prefix || 'HL'; result.mnemonic = `LD ${reg},(${hex(a)})`; result.readsAddr = a; result.len = (off-pc)+4; return result; }
  if (b === 0x22) { const a = read24LE(buf, off+1); const reg = prefix || 'HL'; result.mnemonic = `LD (${hex(a)}),${reg}`; result.writesAddr = a; result.len = (off-pc)+4; return result; }

  // LD A,(BC)/(DE)  LD (BC)/(DE),A
  if (b === 0x0A) { result.mnemonic = 'LD A,(BC)'; result.len = (off-pc)+1; return result; }
  if (b === 0x1A) { result.mnemonic = 'LD A,(DE)'; result.len = (off-pc)+1; return result; }
  if (b === 0x02) { result.mnemonic = 'LD (BC),A'; result.len = (off-pc)+1; return result; }
  if (b === 0x12) { result.mnemonic = 'LD (DE),A'; result.len = (off-pc)+1; return result; }

  // PUSH/POP
  const pp = ['BC','DE','HL','AF'];
  if ((b & 0xCF) === 0xC5) { result.mnemonic = `PUSH ${pp[(b>>4)&3]}`; result.len = (off-pc)+1; return result; }
  if ((b & 0xCF) === 0xC1) { result.mnemonic = `POP ${pp[(b>>4)&3]}`; result.len = (off-pc)+1; return result; }

  // INC/DEC 16-bit
  if ((b & 0xCF) === 0x03) { const rr = ['BC','DE','HL','SP'][(b>>4)&3]; result.mnemonic = `INC ${prefix && rr==='HL' ? prefix : rr}`; result.len = (off-pc)+1; return result; }
  if ((b & 0xCF) === 0x0B) { const rr = ['BC','DE','HL','SP'][(b>>4)&3]; result.mnemonic = `DEC ${prefix && rr==='HL' ? prefix : rr}`; result.len = (off-pc)+1; return result; }

  // INC/DEC 8-bit
  if ((b & 0xC7) === 0x04) { const r = r8[(b>>3)&7]; result.mnemonic = `INC ${r}`; result.len = (off-pc)+1; return result; }
  if ((b & 0xC7) === 0x05) { const r = r8[(b>>3)&7]; result.mnemonic = `DEC ${r}`; result.len = (off-pc)+1; return result; }

  // ALU A,r
  const aluOps = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
  if ((b & 0xC0) === 0x80) { const op = aluOps[(b>>3)&7]; const r = r8[b&7]; result.mnemonic = `${op}${r}`; result.len = (off-pc)+1; return result; }

  // ALU A,n (immediate)
  if ((b & 0xC7) === 0xC6) { const op = aluOps[(b>>3)&7]; const n = buf[off+1]; result.mnemonic = `${op}${hex(n, 2)}`; result.len = (off-pc)+2; return result; }

  // ADD HL,rr
  if ((b & 0xCF) === 0x09) { const rr = ['BC','DE','HL','SP'][(b>>4)&3]; result.mnemonic = `ADD HL,${rr}`; result.len = (off-pc)+1; return result; }

  // EX DE,HL / EX AF,AF' / EXX
  if (b === 0xEB) { result.mnemonic = 'EX DE,HL'; result.len = (off-pc)+1; return result; }
  if (b === 0x08) { result.mnemonic = "EX AF,AF'"; result.len = (off-pc)+1; return result; }
  if (b === 0xD9) { result.mnemonic = 'EXX'; result.len = (off-pc)+1; return result; }

  // EX (SP),HL
  if (b === 0xE3) { result.mnemonic = `EX (SP),${prefix || 'HL'}`; result.len = (off-pc)+1; return result; }

  // LD SP,HL
  if (b === 0xF9) { result.mnemonic = `LD SP,${prefix || 'HL'}`; result.len = (off-pc)+1; return result; }

  // Rotates on A
  if (b === 0x07) { result.mnemonic = 'RLCA'; result.len = (off-pc)+1; return result; }
  if (b === 0x0F) { result.mnemonic = 'RRCA'; result.len = (off-pc)+1; return result; }
  if (b === 0x17) { result.mnemonic = 'RLA'; result.len = (off-pc)+1; return result; }
  if (b === 0x1F) { result.mnemonic = 'RRA'; result.len = (off-pc)+1; return result; }

  // Misc
  if (b === 0x76) { result.mnemonic = 'HALT'; result.len = (off-pc)+1; return result; }
  if (b === 0x00) { result.mnemonic = 'NOP'; result.len = (off-pc)+1; return result; }
  if (b === 0x2F) { result.mnemonic = 'CPL'; result.len = (off-pc)+1; return result; }
  if (b === 0x37) { result.mnemonic = 'SCF'; result.len = (off-pc)+1; return result; }
  if (b === 0x3F) { result.mnemonic = 'CCF'; result.len = (off-pc)+1; return result; }
  if (b === 0x27) { result.mnemonic = 'DAA'; result.len = (off-pc)+1; return result; }
  if (b === 0xF3) { result.mnemonic = 'DI'; result.len = (off-pc)+1; return result; }
  if (b === 0xFB) { result.mnemonic = 'EI'; result.len = (off-pc)+1; return result; }

  // RST
  if ((b & 0xC7) === 0xC7) { const t = b & 0x38; result.mnemonic = `RST ${hex(t, 2)}`; result.calls = [t]; result.len = (off-pc)+1; return result; }

  // OUT (n),A / IN A,(n)
  if (b === 0xD3) { result.mnemonic = `OUT (${hex(buf[off+1], 2)}),A`; result.len = (off-pc)+2; return result; }
  if (b === 0xDB) { result.mnemonic = `IN A,(${hex(buf[off+1], 2)})`; result.len = (off-pc)+2; return result; }

  // IX/IY + displacement for LD r,(IX+d) etc — simplified
  if (prefix && (b & 0xC0) === 0x40 && ((b & 7) === 6 || ((b >> 3) & 7) === 6)) {
    const d = buf[off+1];
    const ds = (d & 0x80) ? d - 256 : d;
    const sign = ds >= 0 ? '+' : '';
    if ((b & 7) === 6) {
      const dst = r8[(b>>3)&7];
      result.mnemonic = `LD ${dst},(${prefix}${sign}${ds})`;
    } else {
      const src = r8[b&7];
      result.mnemonic = `LD (${prefix}${sign}${ds}),${src}`;
    }
    result.len = (off-pc)+2;
    return result;
  }

  // Fallback
  result.mnemonic = `DB ${hex(b, 2)}`;
  result.len = (off - pc) + 1;
  return result;
}

// ---------------------------------------------------------------------------
// Disassemble a block of instructions
// ---------------------------------------------------------------------------
function disasmBlock(buf, startPC, maxBytes, maxInsns = 200) {
  const insns = [];
  let pc = startPC;
  const endPC = startPC + maxBytes;
  let hitExit = false;

  for (let i = 0; i < maxInsns && pc < endPC && pc < buf.length; i++) {
    const inst = decodeInstruction(buf, pc);
    const bytes = [];
    for (let j = 0; j < inst.len && (pc + j) < buf.length; j++) bytes.push(buf[pc + j]);

    insns.push({
      pc,
      mnemonic: inst.mnemonic,
      len: inst.len,
      bytes,
      calls: inst.calls,
      jumps: inst.jumps,
      readsAddr: inst.readsAddr,
      writesAddr: inst.writesAddr,
    });

    // Stop after unconditional RET/JP/JP(HL)
    if (inst.mnemonic === 'RET' || inst.mnemonic.startsWith('JP (') ||
        (inst.mnemonic.startsWith('JP ') && !inst.mnemonic.includes(','))) {
      hitExit = true;
      break;
    }

    pc += inst.len;
  }

  return { insns, hitExit };
}

// ---------------------------------------------------------------------------
// Format disassembly
// ---------------------------------------------------------------------------
function formatDisasm(insns, title) {
  const lines = [`\n=== ${title} ===\n`];
  for (const inst of insns) {
    const bytesStr = inst.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
    let annotation = '';
    for (const c of inst.calls) {
      const lbl = addrLabel(c);
      if (lbl) annotation += `  ; -> ${lbl}`;
    }
    for (const j of inst.jumps) {
      const lbl = addrLabel(j);
      if (lbl) annotation += `  ; -> ${lbl}`;
    }
    if (inst.readsAddr !== null) {
      const lbl = addrLabel(inst.readsAddr);
      if (lbl) annotation += `  ; reads ${lbl}`;
    }
    if (inst.writesAddr !== null) {
      const lbl = addrLabel(inst.writesAddr);
      if (lbl) annotation += `  ; writes ${lbl}`;
    }
    lines.push(`  ${hex(inst.pc)}:  ${bytesStr.padEnd(16)} ${inst.mnemonic}${annotation}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Scan ROM for references to an address (CALL/JP patterns)
// ---------------------------------------------------------------------------
function findReferences(buf, targetAddr) {
  const refs = [];
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  // Scan entire ROM (first 4MB)
  const limit = Math.min(buf.length, 0x400000);
  for (let i = 0; i < limit - 3; i++) {
    if (buf[i + 1] === lo && buf[i + 2] === mid && buf[i + 3] === hi) {
      const opcode = buf[i];
      // CALL nn
      if (opcode === 0xCD) refs.push({ addr: i, type: 'CALL' });
      // JP nn
      else if (opcode === 0xC3) refs.push({ addr: i, type: 'JP' });
      // Conditional CALL: C4/CC/D4/DC/E4/EC/F4/FC
      else if ((opcode & 0xC7) === 0xC4) {
        const cc = ccNames[(opcode >> 3) & 7];
        refs.push({ addr: i, type: `CALL ${cc}` });
      }
      // Conditional JP: C2/CA/D2/DA/E2/EA/F2/FA
      else if ((opcode & 0xC7) === 0xC2) {
        const cc = ccNames[(opcode >> 3) & 7];
        refs.push({ addr: i, type: `JP ${cc}` });
      }
    }
  }
  return refs;
}

const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------
console.log('='.repeat(72));
console.log('Phase 326: Trace 0x05749C (sole caller of LCD timing wrapper 0x05F7D9)');
console.log('='.repeat(72));

// 1. Disassemble 0x05749C
const main = disasmBlock(rom, 0x05749C, 200);
console.log(formatDisasm(main.insns, `0x05749C disassembly (${main.insns.length} insns, exit=${main.hitExit})`));

// Collect all CALL targets from 0x05749C
const allCallTargets = new Set();
const allJumpTargets = new Set();
const allReads = [];
const allWrites = [];

for (const inst of main.insns) {
  for (const c of inst.calls) allCallTargets.add(c);
  for (const j of inst.jumps) allJumpTargets.add(j);
  if (inst.readsAddr !== null) allReads.push({ pc: inst.pc, addr: inst.readsAddr, mnemonic: inst.mnemonic });
  if (inst.writesAddr !== null) allWrites.push({ pc: inst.pc, addr: inst.writesAddr, mnemonic: inst.mnemonic });
}

// 2. Disassemble first 20 instructions of each CALL target
console.log('\n' + '='.repeat(72));
console.log('Call targets from 0x05749C');
console.log('='.repeat(72));

for (const target of [...allCallTargets].sort((a, b) => a - b)) {
  if (target >= rom.length) {
    console.log(`\n  ${hex(target)}: beyond ROM bounds`);
    continue;
  }
  const lbl = addrLabel(target);
  const sub = disasmBlock(rom, target, 80, 20);
  console.log(formatDisasm(sub.insns, `${hex(target)} ${lbl ? `(${lbl})` : ''} — first ${sub.insns.length} insns`));

  // Collect sub-calls
  for (const inst of sub.insns) {
    for (const c of inst.calls) {
      if (!allCallTargets.has(c)) {
        console.log(`    ** Sub-call to ${hex(c)} ${addrLabel(c)}`);
      }
    }
  }
}

// 3. RAM/MMIO reads and writes summary
console.log('\n' + '='.repeat(72));
console.log('RAM/MMIO access from 0x05749C');
console.log('='.repeat(72));

if (allReads.length === 0 && allWrites.length === 0) {
  console.log('  (no direct address reads/writes found in main body)');
} else {
  if (allReads.length > 0) {
    console.log('\n  Reads:');
    for (const r of allReads) {
      console.log(`    ${hex(r.pc)}: ${r.mnemonic}  (addr=${hex(r.addr)} ${addrLabel(r.addr)})`);
    }
  }
  if (allWrites.length > 0) {
    console.log('\n  Writes:');
    for (const w of allWrites) {
      console.log(`    ${hex(w.pc)}: ${w.mnemonic}  (addr=${hex(w.addr)} ${addrLabel(w.addr)})`);
    }
  }
}

// 4. Find callers of 0x05749C
console.log('\n' + '='.repeat(72));
console.log('References to 0x05749C in ROM');
console.log('='.repeat(72));

const refs = findReferences(rom, 0x05749C);
if (refs.length === 0) {
  console.log('  No CALL/JP references found — may be reached via jump table or indirect call');
} else {
  console.log(`  Found ${refs.length} reference(s):\n`);
  for (const ref of refs) {
    console.log(`    ${hex(ref.addr)}: ${ref.type} 0x05749C`);
    // Show a few instructions around the caller
    const ctx = disasmBlock(rom, ref.addr, 20, 5);
    for (const inst of ctx.insns) {
      const bytesStr = inst.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`      ${hex(inst.pc)}:  ${bytesStr.padEnd(16)} ${inst.mnemonic}`);
    }
  }
}

// 5. Also find callers of known sub-targets for context
for (const t of [0x0AF8C4, 0x0572DF]) {
  const tRefs = findReferences(rom, t);
  console.log(`\n  References to ${hex(t)} ${addrLabel(t)}: ${tRefs.length} found`);
  if (tRefs.length <= 20) {
    for (const ref of tRefs) {
      console.log(`    ${hex(ref.addr)}: ${ref.type}`);
    }
  } else {
    console.log(`    (too many to list — showing first 20)`);
    for (const ref of tRefs.slice(0, 20)) {
      console.log(`    ${hex(ref.addr)}: ${ref.type}`);
    }
  }
}

// 6. Summary analysis
console.log('\n' + '='.repeat(72));
console.log('Summary');
console.log('='.repeat(72));

console.log(`\n  0x05749C: ${main.insns.length} instructions decoded, exit=${main.hitExit}`);
console.log(`  Call targets: ${[...allCallTargets].map(a => hex(a)).join(', ')}`);
console.log(`  Jump targets: ${[...allJumpTargets].map(a => hex(a)).join(', ') || '(none)'}`);
console.log(`  Direct reads: ${allReads.length}`);
console.log(`  Direct writes: ${allWrites.length}`);
console.log(`  Callers of 0x05749C: ${refs.length}`);
console.log(`\n  LCD timing flow: 0x05749C -> CALL 0x05F7D9 -> CALL 0x0005CC -> 0x007B70`);
console.log(`  The returned HL value from 0x05F7D9 is the LCD timing register.`);
console.log(`  Watch for CP/AND/OR/BIT instructions after the CALL to see how the value is used.`);

console.log('\nDone.');

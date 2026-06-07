import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0a24c8;
const LENGTH = 0x210;  // Through 0x0A26D7 to capture both exit paths (RET at 0x26D5)
const FB_START = 0xd40000;
const FB_END = 0xd52bff;

const rom = readFileSync(ROM_PATH);
const end = Math.min(rom.length, START + LENGTH);

function hex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function b(addr) {
  return addr < rom.length ? rom[addr] : 0;
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function u24(addr) {
  return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
}

function inFramebuffer(addr) {
  return addr >= FB_START && addr <= FB_END;
}

function relTarget(pc, size, disp) {
  return (pc + size + s8(disp)) & 0xffffff;
}

function bytesAt(addr, size) {
  const parts = [];
  for (let i = 0; i < size; i++) parts.push(hex(b(addr + i), 2));
  return parts.join(' ');
}

function annot24(addr, text) {
  return inFramebuffer(addr) ? `${text}; LCD framebuffer address` : text;
}

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rpAF = ['BC', 'DE', 'HL', 'AF'];  // PUSH/POP use AF, not SP
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function decodeCB(addr, prefix = '') {
  const op = b(addr + 1);
  const group = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const target = prefix || r[z];
  if (group === 0) return { size: 2, text: `${rot[y]} ${target}`, tags: ['bit manipulation'] };
  if (group === 1) return { size: 2, text: `BIT ${y},${target}`, tags: ['bit manipulation'] };
  if (group === 2) return { size: 2, text: `RES ${y},${target}`, tags: ['bit manipulation'] };
  return { size: 2, text: `SET ${y},${target}`, tags: ['bit manipulation'] };
}

function decodeED(addr) {
  const op = b(addr + 1);
  const block = {
    0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A',
    0x4D: 'RETI', 0x56: 'IM 1', 0x5E: 'IM 2', 0x57: 'LD A,I',
    0x5F: 'LD A,R', 0x67: 'RRD', 0x6F: 'RLD',
    0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
    0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
    0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
    0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
  };
  if (block[op]) {
    const tags = [];
    if (op === 0xB0) tags.push('block copy; possible framebuffer write if DE/HL targets LCD');
    return { size: 2, text: block[op], tags };
  }
  if ((op & 0xCF) === 0x43) {
    return { size: 5, text: annot24(u24(addr + 2), `LD (${hex(u24(addr + 2), 6)}),${rp[(op >> 4) & 3]} `), tags: [] };
  }
  if ((op & 0xCF) === 0x4B) {
    return { size: 5, text: annot24(u24(addr + 2), `LD ${rp[(op >> 4) & 3]},(${hex(u24(addr + 2), 6)}) `), tags: [] };
  }
  return { size: 2, text: `ED ${hex(op, 2)}`, tags: [] };
}

function ixiyMem(prefixName, disp) {
  const sign = s8(disp) < 0 ? '-' : '+';
  return `(${prefixName}${sign}${hex(Math.abs(s8(disp)), 2)})`;
}

function decodeDDorFD(addr, prefixName) {
  const op = b(addr + 1);
  if (op === 0xCB) {
    const disp = b(addr + 2);
    const cb = decodeCB(addr + 2, ixiyMem(prefixName, disp));
    return { size: 4, text: cb.text, tags: [...cb.tags, `${prefixName} indexed bit op`] };
  }
  if (op === 0x21) return { size: 5, text: `LD ${prefixName},${hex(u24(addr + 2), 6)}`, tags: [`${prefixName} setup`] };
  if (op === 0x22) return { size: 5, text: annot24(u24(addr + 2), `LD (${hex(u24(addr + 2), 6)}),${prefixName} `), tags: [] };
  if (op === 0x2A) return { size: 5, text: annot24(u24(addr + 2), `LD ${prefixName},(${hex(u24(addr + 2), 6)}) `), tags: [`${prefixName} setup`] };
  if (op === 0x23) return { size: 2, text: `INC ${prefixName}`, tags: [`${prefixName} advance`] };
  if (op === 0x2B) return { size: 2, text: `DEC ${prefixName}`, tags: [`${prefixName} advance`] };
  if ((op & 0xCF) === 0x09) return { size: 2, text: `ADD ${prefixName},${rp[(op >> 4) & 3]}`, tags: [`${prefixName} arithmetic`] };
  if (op === 0xE5) return { size: 2, text: `PUSH ${prefixName}`, tags: [] };
  if (op === 0xE1) return { size: 2, text: `POP ${prefixName}`, tags: [] };
  if (op === 0xE9) return { size: 2, text: `JP (${prefixName})`, tags: [] };
  if (op === 0xF9) return { size: 2, text: `LD SP,${prefixName}`, tags: [] };
  if ((op & 0xC7) === 0x46) {
    const dst = r[(op >> 3) & 7];
    return { size: 3, text: `LD ${dst},${ixiyMem(prefixName, b(addr + 2))}`, tags: [`${prefixName} indexed read`, 'possible glyph data read'] };
  }
  if ((op & 0xF8) === 0x70) {
    return { size: 3, text: `LD ${ixiyMem(prefixName, b(addr + 2))},${r[op & 7]}`, tags: [`${prefixName} indexed write`] };
  }
  if (op === 0x36) {
    return { size: 4, text: `LD ${ixiyMem(prefixName, b(addr + 2))},${hex(b(addr + 3), 2)}`, tags: [`${prefixName} indexed write`] };
  }
  if ((op & 0xC7) === 0x86) {
    return { size: 3, text: `${alu[(op >> 3) & 7]} ${ixiyMem(prefixName, b(addr + 2))}`, tags: [`${prefixName} indexed read`] };
  }
  return { size: 2, text: `${prefixName} prefix ${hex(op, 2)}`, tags: [] };
}

function decode(addr) {
  const op = b(addr);
  if (op === 0xCB) return decodeCB(addr);
  if (op === 0xED) return decodeED(addr);
  if (op === 0xDD) return decodeDDorFD(addr, 'IX');
  if (op === 0xFD) return decodeDDorFD(addr, 'IY');
  // eZ80 SIS prefix: 0x40 before an instruction forces 16-bit operand size in ADL mode.
  // In standard Z80, 0x40 = LD B,B (NOP-like). In eZ80 ADL mode, it's a suffix byte.
  // Detect SIS by checking if next byte is a plausible instruction start.
  if (op === 0x40) {
    const next = b(addr + 1);
    // SIS + ED prefix block (LD rr,(nn) / LD (nn),rr with 16-bit addresses)
    if (next === 0xED) {
      const edOp = b(addr + 2);
      if ((edOp & 0xCF) === 0x4B) {
        const a16 = u16(addr + 3);
        return { size: 5, text: `.SIS LD ${rp[(edOp >> 4) & 3]},(${hex(a16, 4)})`, tags: ['SIS prefix', '16-bit address'] };
      }
      if ((edOp & 0xCF) === 0x43) {
        const a16 = u16(addr + 3);
        return { size: 5, text: `.SIS LD (${hex(a16, 4)}),${rp[(edOp >> 4) & 3]}`, tags: ['SIS prefix', '16-bit address'] };
      }
      return { size: 2, text: `.SIS ED ${hex(edOp, 2)}`, tags: ['SIS prefix'] };
    }
    // SIS + LD HL,(nn) with 16-bit address
    if (next === 0x2A) {
      const a16 = u16(addr + 2);
      return { size: 4, text: `.SIS LD HL,(${hex(a16, 4)})`, tags: ['SIS prefix', '16-bit address'] };
    }
    // SIS + LD (nn),HL with 16-bit address
    if (next === 0x22) {
      const a16 = u16(addr + 2);
      return { size: 4, text: `.SIS LD (${hex(a16, 4)}),HL`, tags: ['SIS prefix', '16-bit address'] };
    }
    // SIS + LD rr,nn with 16-bit immediate
    if (next === 0x01 || next === 0x11 || next === 0x21 || next === 0x31) {
      const imm16 = u16(addr + 2);
      return { size: 4, text: `.SIS LD ${rp[next >> 4]},${hex(imm16, 4)}`, tags: ['SIS prefix'] };
    }
    // SIS + CALL nn with 16-bit address
    if (next === 0xCD) {
      const a16 = u16(addr + 2);
      return { size: 4, text: `.SIS CALL ${hex(a16, 4)}`, tags: ['SIS prefix'] };
    }
    // SIS + JP nn with 16-bit address
    if (next === 0xC3) {
      const a16 = u16(addr + 2);
      return { size: 4, text: `.SIS JP ${hex(a16, 4)}`, tags: ['SIS prefix'] };
    }
    // Fallback: treat as LD B,B if next byte doesn't look like a SIS-able instruction
    return { size: 1, text: 'LD B,B', tags: [] };
  }

  if (op === 0x00) return { size: 1, text: 'NOP', tags: [] };
  if (op === 0x76) return { size: 1, text: 'HALT', tags: [] };
  if (op === 0xC9) return { size: 1, text: 'RET', tags: ['function return'] };
  if (op === 0x10) {
    const target = relTarget(addr, 2, b(addr + 1));
    return { size: 2, text: `DJNZ ${hex(target, 6)}`, tags: target < addr ? ['loop back-edge'] : ['loop/branch'] };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const names = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
    const target = relTarget(addr, 2, b(addr + 1));
    return { size: 2, text: `${names[op]} ${hex(target, 6)}`, tags: target < addr ? ['loop back-edge'] : ['branch'] };
  }
  if (op === 0xCD) return { size: 4, text: `CALL ${hex(u24(addr + 1), 6)}`, tags: [] };
  if (op === 0xC3) return { size: 4, text: `JP ${hex(u24(addr + 1), 6)}`, tags: [] };
  if ((op & 0xC7) === 0xC2) return { size: 4, text: `JP ${cc[(op >> 3) & 7]},${hex(u24(addr + 1), 6)}`, tags: ['branch'] };
  if ((op & 0xC7) === 0xC4) return { size: 4, text: `CALL ${cc[(op >> 3) & 7]},${hex(u24(addr + 1), 6)}`, tags: [] };
  if ((op & 0xC7) === 0xC0) return { size: 1, text: `RET ${cc[(op >> 3) & 7]}`, tags: ['function return'] };
  if (op === 0x32) return { size: 4, text: annot24(u24(addr + 1), `LD (${hex(u24(addr + 1), 6)}),A `), tags: inFramebuffer(u24(addr + 1)) ? ['direct framebuffer write'] : [] };
  if (op === 0x3A) return { size: 4, text: annot24(u24(addr + 1), `LD A,(${hex(u24(addr + 1), 6)}) `), tags: [] };
  if (op === 0x01 || op === 0x11 || op === 0x21 || op === 0x31) return { size: 4, text: `LD ${rp[op >> 4]},${hex(u24(addr + 1), 6)}`, tags: inFramebuffer(u24(addr + 1)) ? ['framebuffer pointer load'] : [] };
  if (op === 0x22) return { size: 4, text: annot24(u24(addr + 1), `LD (${hex(u24(addr + 1), 6)}),HL `), tags: inFramebuffer(u24(addr + 1)) ? ['direct framebuffer write'] : [] };
  if (op === 0x2A) return { size: 4, text: annot24(u24(addr + 1), `LD HL,(${hex(u24(addr + 1), 6)}) `), tags: [] };
  if (op === 0x3E) return { size: 2, text: `LD A,${hex(b(addr + 1), 2)}`, tags: [] };
  if ((op & 0xC0) === 0x40) return { size: 1, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}`, tags: [] };
  if ((op & 0xC7) === 0x06) return { size: 2, text: `LD ${r[(op >> 3) & 7]},${hex(b(addr + 1), 2)}`, tags: [] };
  if ((op & 0xC7) === 0x04) return { size: 1, text: `INC ${r[(op >> 3) & 7]}`, tags: [] };
  if ((op & 0xC7) === 0x05) return { size: 1, text: `DEC ${r[(op >> 3) & 7]}`, tags: [] };
  if ((op & 0xC0) === 0x80) return { size: 1, text: `${alu[(op >> 3) & 7]} ${r[op & 7]}`, tags: [] };
  if ((op & 0xC7) === 0xC6) return { size: 2, text: `${alu[(op >> 3) & 7]} ${hex(b(addr + 1), 2)}`, tags: [] };
  if ((op & 0xCF) === 0x03) return { size: 1, text: `INC ${rp[(op >> 4) & 3]}`, tags: [] };
  if ((op & 0xCF) === 0x0B) return { size: 1, text: `DEC ${rp[(op >> 4) & 3]}`, tags: [] };
  if ((op & 0xCF) === 0x09) return { size: 1, text: `ADD HL,${rp[(op >> 4) & 3]}`, tags: [] };
  if ((op & 0xCF) === 0x01) return { size: 4, text: `LD ${rp[(op >> 4) & 3]},${hex(u24(addr + 1), 6)}`, tags: inFramebuffer(u24(addr + 1)) ? ['framebuffer pointer load'] : [] };
  if ((op & 0xCF) === 0xC5) return { size: 1, text: `PUSH ${rpAF[(op >> 4) & 3]}`, tags: [] };
  if ((op & 0xCF) === 0xC1) return { size: 1, text: `POP ${rpAF[(op >> 4) & 3]}`, tags: [] };
  if ((op & 0xC7) === 0xC7) return { size: 1, text: `RST ${hex(op & 0x38, 2)}`, tags: [] };

  const oneByte = {
    0x02: 'LD (BC),A', 0x07: 'RLCA', 0x08: 'EX AF,AF\'', 0x0A: 'LD A,(BC)', 0x0F: 'RRCA',
    0x12: 'LD (DE),A', 0x17: 'RLA', 0x1A: 'LD A,(DE)', 0x1F: 'RRA', 0x27: 'DAA',
    0x2F: 'CPL', 0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x37: 'SCF', 0x3F: 'CCF',
    0xD9: 'EXX', 0xE3: 'EX (SP),HL', 0xE9: 'JP (HL)', 0xEB: 'EX DE,HL', 0xF3: 'DI', 0xF9: 'LD SP,HL', 0xFB: 'EI',
  };
  if (oneByte[op]) {
    const tags = [];
    if (op === 0x12) tags.push('pointer write via DE; possible framebuffer write');
    return { size: 1, text: oneByte[op], tags };
  }
  return { size: 1, text: `DB ${hex(op, 2)}`, tags: [] };
}

console.log('Phase 552 probe: decode 0x0A23E5 continuation / glyph blit search');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Range: ${hex(START, 6)}-${hex(end - 1, 6)} (${end - START} bytes requested from 0x${hex(START, 6)})`);
console.log('Focus: loop back-edges, IX glyph reads, bit expansion, color/framebuffer writes, RET/end markers');
console.log('');

let pc = START;
const findings = [];
while (pc < end) {
  const ins = decode(pc);
  const raw = bytesAt(pc, ins.size).padEnd(14, ' ');
  const note = ins.tags.length ? ` ; ${ins.tags.join('; ')}` : '';
  console.log(`${hex(pc, 6)}  ${raw}  ${ins.text}${note}`);
  if (ins.tags.length) findings.push({ addr: pc, text: ins.text, tags: ins.tags });
  pc += Math.max(ins.size, 1);
}

console.log('');
console.log('Findings summary:');
if (!findings.length) {
  console.log('- No loop, IX, framebuffer, bit-op, LDIR, or RET markers detected in this window.');
} else {
  for (const f of findings) {
    console.log(`- ${hex(f.addr, 6)} ${f.text} (${f.tags.join('; ')})`);
  }
}

const hasRet = findings.some((f) => f.tags.includes('function return'));
console.log('');
if (hasRet) {
  console.log('Function end marker: RET/conditional RET appears inside this decode window.');
} else {
  console.log(`Function end marker: no RET observed through ${hex(end - 1, 6)}; decode likely continues past this range.`);
}

// Structural analysis
console.log('');
console.log('=== STRUCTURAL ANALYSIS ===');
console.log('');
console.log('GLYPH BLIT ARCHITECTURE (0x0A24C8-0x0A26D7):');
console.log('');
console.log('1. GLYPH OFFSET ADJUSTMENT (0x0A24C8-0x0A24E3):');
console.log('   IY+23 bit 0 flag → conditional IX += A (from D0266F)');
console.log('   If E >= 9, double-adds IX (wide glyph stride)');
console.log('');
console.log('2. ROW DIMENSION SETUP (0x0A24E4-0x0A2506):');
console.log('   IY+32 bits 6,2 → attribute-based row height selection');
console.log('   Normal: B=pixel_width, D=excess (or B=8, D=width-8 for wide)');
console.log('   Attr mode: B=5, D=E-B (condensed row)');
console.log('');
console.log('3. FRAMEBUFFER POINTER SETUP (0x0A2507-0x0A2532):');
console.log('   .SIS LD HL,(059C) → 16-bit load of current LCD cursor position');
console.log('   CALL 0x0A1A9D → foreground color setup');
console.log('   .SIS LD (2A87),DE → save original cursor to shadow slot');
console.log('   CALL 0x0A1B1C → background color setup');
console.log('   EXX to swap shadow register set (DE\'=bg_ptr, BC\'=bg_info, HL\'=fb_ptr)');
console.log('');
console.log('4. OUTER ROW LOOP (0x0A2537):');
console.log('   For each glyph row: read 1 byte from IX (glyph bitmap), advance IX');
console.log('   IY+05 bit 3 → inverse mode (CPL the glyph byte)');
console.log('   C = glyph byte, B = pixel count for this row');
console.log('');
console.log('5. THREE BLIT PATHS dispatched by IY+4A bits 5,6:');
console.log('');
console.log('   PATH A (IY+4A bit 5 set) — 1BPP MONOCHROME BLIT (0x0A254F-0x0A258B):');
console.log('     Inner loop at 0x0A255F: SLA C shifts glyph bits left through carry');
console.log('     Carry=1 → foreground color from (26AC), Carry=0 → background from (26AA)');
console.log('     Writes 16-bit pixel (E,D) to HL\' via LD (HL),E; INC HL; LD (HL),D; INC HL');
console.log('     EXX toggles to shadow regs for mask computation (OR B / XOR B pattern)');
console.log('     SRL B advances bit mask; when B=0, reset to 0x80 and advance HL');
console.log('     DJNZ loops B times per row');
console.log('');
console.log('   PATH B (IY+4A bit 6 set) — 4BPP ANTIALIASED BLIT (0x0A2597-0x0A2614):');
console.log('     Similar SLA C bit-shift loop but with 4-bit subpixel blending');
console.log('     OR D0/OR 0D/OR B0/OR 0B → nibble-level alpha masks for LCD subpixel rendering');
console.log('     RRCA x4 rotates nibbles; XOR FF inverts mask');
console.log('     IY+14 bit 1 → large vs small font stride (0x85 vs 0x5D offset)');
console.log('');
console.log('   PATH C (neither bit set) — DIRECT COLOR BLIT (0x0A2618-0x0A2640):');
console.log('     CALL 0x08C308 → color lookup/conversion');
console.log('     Inner loop at 0x0A262B: ADD A,A shifts glyph bits');
console.log('     Carry=1 → LD (HL),E (fg low byte); Carry=0 → LD (HL),C (bg low byte)');
console.log('     Single-byte writes (8bpp mode or palette-indexed)');
console.log('');
console.log('6. ROW ADVANCEMENT (0x0A2660/0x0A26B4):');
console.log('   Two stride constants: 0x000140 (320 bytes = 1 row at 16bpp)');
console.log('                         0x000280 (640 bytes = 1 row at 16bpp x2, for large font)');
console.log('   HL += stride, stored back to D0059C; DEC B outer row counter');
console.log('   JP NZ,0x0A2537 loops for next row');
console.log('');
console.log('7. EXTRA GLYPH ROWS (0x0A2641-0x0A265C / 0x0A2695-0x0A26B0):');
console.log('   If bit 7 of D was set: read ANOTHER glyph byte from IX');
console.log('   RES 7,D clears the "more rows" flag; loops back to 0x0A2548');
console.log('   This handles glyphs taller than 8 pixels (extended character bitmaps)');
console.log('');
console.log('8. FUNCTION EXIT (0x0A26C7-0x0A26D5):');
console.log('   POP HL; EXX; POP BC/DE/HL; EXX; POP AF');
console.log('   Normal exit: XOR A (clear carry); RET — success');
console.log('   Overflow exit at 0x0A26D6: SCF (set carry); RET — clipping failure');
console.log('');
console.log('KEY MEMORY ADDRESSES:');
console.log('   D0059C — LCD framebuffer cursor pointer');
console.log('   D005A0 — current color/attribute byte');
console.log('   D0266F — glyph offset adjustment value');
console.log('   (26AA) — background color (16-bit, via SIS)');
console.log('   (26AC) — foreground color (16-bit, via SIS)');
console.log('   (2A87) — saved cursor shadow (via SIS)');
console.log('');
console.log('LCD FRAMEBUFFER: 320x240 at 16bpp = 153,600 bytes');
console.log('   Row stride = 0x0140 (320 pixels x 2 bytes = 640 bytes)');
console.log('   Large font uses 0x0280 (2 rows per glyph row for double-height)');
console.log('');
console.log('TOTAL FUNCTION SIZE: 0x0A23E5 to 0x0A26D5 = 0x2F0 = 752 bytes');

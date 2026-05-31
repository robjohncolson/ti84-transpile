#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

function hex(v, w = 2) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function byteHex(v) {
  return v.toString(16).padStart(2, '0');
}

function readByte(addr) {
  if (addr < 0 || addr >= rom.length) return undefined;
  return rom[addr];
}

function readBytes(addr, length) {
  const bytes = [];
  for (let i = 0; i < length; i++) {
    const b = readByte(addr + i);
    if (b === undefined) break;
    bytes.push(b);
  }
  return bytes;
}

function formatBytes(bytes) {
  return bytes.map(byteHex).join(' ');
}

function hexDump(start, length, label) {
  console.log(`\n=== ${label} (${hex(start, 6)} - ${hex(start + length - 1, 6)}) ===`);
  for (let i = 0; i < length; i += 16) {
    const addr = start + i;
    const bytes = [];
    const ascii = [];
    for (let j = 0; j < 16 && i + j < length; j++) {
      const b = readByte(addr + j);
      if (b === undefined) {
        bytes.push('??');
        ascii.push('?');
      } else {
        bytes.push(byteHex(b));
        ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
      }
    }
    console.log(`  ${hex(addr, 6)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
}

function readU16LE(addr) {
  const lo = readByte(addr);
  const hi = readByte(addr + 1);
  if (lo === undefined || hi === undefined) return undefined;
  return lo | (hi << 8);
}

function readU24LE(addr) {
  const lo = readByte(addr);
  const mid = readByte(addr + 1);
  const hi = readByte(addr + 2);
  if (lo === undefined || mid === undefined || hi === undefined) return undefined;
  return lo | (mid << 8) | (hi << 16);
}

function signed8(v) {
  return v < 0x80 ? v : v - 0x100;
}

function relTarget(addr, len, disp) {
  return addr + len + signed8(disp);
}

function decodeInstruction(addr) {
  const b0 = readByte(addr);
  const b1 = readByte(addr + 1);
  const b2 = readByte(addr + 2);
  const b3 = readByte(addr + 3);
  const b4 = readByte(addr + 4);

  if (b0 === undefined) return { len: 1, text: '??' };

  if (b0 === 0x00) return { len: 1, text: 'NOP' };
  if (b0 === 0x04) return { len: 1, text: 'INC B' };
  if (b0 === 0x05) return { len: 1, text: 'DEC B' };
  if (b0 === 0x06 && b1 !== undefined) return { len: 2, text: `LD B,${hex(b1)}` };
  if (b0 === 0x0C) return { len: 1, text: 'INC C' };
  if (b0 === 0x0D) return { len: 1, text: 'DEC C' };
  if (b0 === 0x0E && b1 !== undefined) return { len: 2, text: `LD C,${hex(b1)}` };
  if (b0 === 0x10 && b1 !== undefined) return { len: 2, text: `DJNZ ${hex(relTarget(addr, 2, b1), 6)}` };
  if (b0 === 0x11 && b3 !== undefined) return { len: 4, text: `LD DE,${hex(readU24LE(addr + 1), 6)}` };
  if (b0 === 0x13) return { len: 1, text: 'INC DE' };
  if (b0 === 0x15) return { len: 1, text: 'DEC D' };
  if (b0 === 0x16 && b1 !== undefined) return { len: 2, text: `LD D,${hex(b1)}` };
  if (b0 === 0x18 && b1 !== undefined) return { len: 2, text: `JR ${hex(relTarget(addr, 2, b1), 6)}` };
  if (b0 === 0x19) return { len: 1, text: 'ADD HL,DE' };
  if (b0 === 0x1B) return { len: 1, text: 'DEC DE' };
  if (b0 === 0x1D) return { len: 1, text: 'DEC E' };
  if (b0 === 0x1E && b1 !== undefined) return { len: 2, text: `LD E,${hex(b1)}` };
  if (b0 === 0x20 && b1 !== undefined) return { len: 2, text: `JR NZ,${hex(relTarget(addr, 2, b1), 6)}` };
  if (b0 === 0x21 && b3 !== undefined) return { len: 4, text: `LD HL,${hex(readU24LE(addr + 1), 6)}` };
  if (b0 === 0x22 && b3 !== undefined) return { len: 4, text: `LD (${hex(readU24LE(addr + 1), 6)}),HL` };
  if (b0 === 0x23) return { len: 1, text: 'INC HL' };
  if (b0 === 0x24) return { len: 1, text: 'INC H' };
  if (b0 === 0x25) return { len: 1, text: 'DEC H' };
  if (b0 === 0x26 && b1 !== undefined) return { len: 2, text: `LD H,${hex(b1)}` };
  if (b0 === 0x28 && b1 !== undefined) return { len: 2, text: `JR Z,${hex(relTarget(addr, 2, b1), 6)}` };
  if (b0 === 0x2A && b3 !== undefined) return { len: 4, text: `LD HL,(${hex(readU24LE(addr + 1), 6)})` };
  if (b0 === 0x2B) return { len: 1, text: 'DEC HL' };
  if (b0 === 0x2C) return { len: 1, text: 'INC L' };
  if (b0 === 0x2D) return { len: 1, text: 'DEC L' };
  if (b0 === 0x2E && b1 !== undefined) return { len: 2, text: `LD L,${hex(b1)}` };
  if (b0 === 0x30 && b1 !== undefined) return { len: 2, text: `JR NC,${hex(relTarget(addr, 2, b1), 6)}` };
  if (b0 === 0x31 && b3 !== undefined) return { len: 4, text: `LD SP,${hex(readU24LE(addr + 1), 6)}` };
  if (b0 === 0x32 && b3 !== undefined) return { len: 4, text: `LD (${hex(readU24LE(addr + 1), 6)}),A` };
  if (b0 === 0x34) return { len: 1, text: 'INC (HL)' };
  if (b0 === 0x35) return { len: 1, text: 'DEC (HL)' };
  if (b0 === 0x36 && b1 !== undefined) return { len: 2, text: `LD (HL),${hex(b1)}` };
  if (b0 === 0x38 && b1 !== undefined) return { len: 2, text: `JR C,${hex(relTarget(addr, 2, b1), 6)}` };
  if (b0 === 0x3A && b3 !== undefined) return { len: 4, text: `LD A,(${hex(readU24LE(addr + 1), 6)})` };
  if (b0 === 0x3C) return { len: 1, text: 'INC A' };
  if (b0 === 0x3D) return { len: 1, text: 'DEC A' };
  if (b0 === 0x3E && b1 !== undefined) return { len: 2, text: `LD A,${hex(b1)}` };
  if (b0 >= 0x40 && b0 <= 0x7F) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    if (b0 === 0x76) return { len: 1, text: 'HALT' };
    return { len: 1, text: `LD ${regs[(b0 >> 3) & 7]},${regs[b0 & 7]}` };
  }
  if (b0 === 0x86) return { len: 1, text: 'ADD A,(HL)' };
  if (b0 === 0x87) return { len: 1, text: 'ADD A,A' };
  if (b0 === 0xA7) return { len: 1, text: 'AND A' };
  if (b0 === 0xAF) return { len: 1, text: 'XOR A' };
  if (b0 === 0xB7) return { len: 1, text: 'OR A' };
  if (b0 === 0xBE) return { len: 1, text: 'CP (HL)' };
  if (b0 === 0xC1) return { len: 1, text: 'POP BC' };
  if (b0 === 0xC5) return { len: 1, text: 'PUSH BC' };
  if (b0 === 0xC6 && b1 !== undefined) return { len: 2, text: `ADD A,${hex(b1)}` };
  if (b0 === 0xC9) return { len: 1, text: 'RET' };
  if (b0 === 0xCA && b3 !== undefined) return { len: 4, text: `JP Z,${hex(readU24LE(addr + 1), 6)}` };
  if (b0 === 0xCD && b3 !== undefined) return { len: 4, text: `CALL ${hex(readU24LE(addr + 1), 6)}` };
  if (b0 === 0xD1) return { len: 1, text: 'POP DE' };
  if (b0 === 0xD5) return { len: 1, text: 'PUSH DE' };
  if (b0 === 0xD6 && b1 !== undefined) return { len: 2, text: `SUB ${hex(b1)}` };
  if (b0 === 0xE1) return { len: 1, text: 'POP HL' };
  if (b0 === 0xE5) return { len: 1, text: 'PUSH HL' };
  if (b0 === 0xEB) return { len: 1, text: 'EX DE,HL' };
  if (b0 === 0xED && b1 !== undefined) {
    if (b1 === 0x47) return { len: 2, text: 'LD I,A' };
    if (b1 === 0x57) return { len: 2, text: 'LD A,I' };
    if (b1 === 0x5B && b4 !== undefined) return { len: 5, text: `LD DE,(${hex(readU24LE(addr + 2), 6)})` };
    if (b1 === 0x73 && b4 !== undefined) return { len: 5, text: `LD (${hex(readU24LE(addr + 2), 6)}),SP` };
    if (b1 === 0x7B && b4 !== undefined) return { len: 5, text: `LD SP,(${hex(readU24LE(addr + 2), 6)})` };
    if (b1 === 0xA0) return { len: 2, text: 'LDI' };
    if (b1 === 0xB0) return { len: 2, text: 'LDIR' };
  }
  if (b0 === 0xF1) return { len: 1, text: 'POP AF' };
  if (b0 === 0xF3) return { len: 1, text: 'DI' };
  if (b0 === 0xF5) return { len: 1, text: 'PUSH AF' };
  if (b0 === 0xFB) return { len: 1, text: 'EI' };
  if (b0 === 0xFE && b1 !== undefined) return { len: 2, text: `CP ${hex(b1)}` };

  return { len: 1, text: `DB ${hex(b0)}` };
}

function disassemble(start, length, label) {
  console.log(`\n=== ${label} (${hex(start, 6)} - ${hex(start + length - 1, 6)}) ===`);
  let pc = start;
  const end = start + length;
  while (pc < end) {
    const decoded = decodeInstruction(pc);
    const bytes = readBytes(pc, Math.min(decoded.len, end - pc));
    console.log(`  ${hex(pc, 6)}: ${formatBytes(bytes).padEnd(17)} ${decoded.text}`);
    pc += Math.max(1, decoded.len);
  }
}

function printGlyphInfo(charCode, label) {
  const entryAddr = 0x1C00 | charCode;
  const direct = readBytes(entryAddr, 16);
  const ptr16 = readU16LE(entryAddr);
  const ptr24 = readU24LE(entryAddr);

  console.log(`\n=== Font data for ${label} (${hex(charCode)}) ===`);
  console.log(`Pointer table entry at ${hex(entryAddr, 6)}: ${formatBytes(direct)}`);

  if (ptr16 !== undefined) {
    const ptr16Bytes = readBytes(ptr16, 16);
    console.log(`If 16-bit pointer ${hex(ptr16, 4)}, data at target: ${formatBytes(ptr16Bytes)}`);
  }

  if (ptr24 !== undefined) {
    const ptr24Bytes = readBytes(ptr24, 16);
    console.log(`If 24-bit pointer ${hex(ptr24, 6)}, data at target: ${formatBytes(ptr24Bytes)}`);
  }
}

function scanVramWriteSignals(start, length) {
  const end = start + length;
  console.log(`\n=== VRAM write loop signals (${hex(start, 6)} - ${hex(end - 1, 6)}) ===`);
  console.log('Potential write/copy/stride opcodes in the renderer window:');

  let found = 0;
  for (let addr = start; addr < end; addr++) {
    const b0 = readByte(addr);
    const b1 = readByte(addr + 1);
    if (b0 === undefined) continue;

    let note = null;
    if (b0 === 0x12) note = 'LD (DE),A byte write';
    else if (b0 === 0x22) note = `LD (${hex(readU24LE(addr + 1) ?? 0, 6)}),HL absolute word write`;
    else if (b0 === 0x32) note = `LD (${hex(readU24LE(addr + 1) ?? 0, 6)}),A absolute byte write`;
    else if (b0 === 0x36) note = `LD (HL),${hex(b1 ?? 0)} immediate byte write`;
    else if (b0 === 0x70) note = 'LD (HL),B byte write';
    else if (b0 === 0x71) note = 'LD (HL),C byte write';
    else if (b0 === 0x72) note = 'LD (HL),D byte write';
    else if (b0 === 0x73) note = 'LD (HL),E byte write';
    else if (b0 === 0x74) note = 'LD (HL),H byte write';
    else if (b0 === 0x75) note = 'LD (HL),L byte write';
    else if (b0 === 0x77) note = 'LD (HL),A byte write';
    else if (b0 === 0xED && b1 === 0xA0) note = 'LDI block byte copy';
    else if (b0 === 0xED && b1 === 0xB0) note = 'LDIR block byte copy';
    else if (b0 === 0x10) note = `DJNZ loop to ${hex(relTarget(addr, 2, b1 ?? 0), 6)}`;
    else if (b0 === 0x20) note = `JR NZ loop/branch to ${hex(relTarget(addr, 2, b1 ?? 0), 6)}`;
    else if (b0 === 0x21 && b3Safe(addr)) {
      const imm = readU24LE(addr + 1);
      if (imm === 0x000280 || imm === 0x000274 || imm === 0x000640) {
        note = `LD HL,${hex(imm, 6)} possible row-stride delta`;
      }
    }

    if (note) {
      const width = b0 === 0xED || b0 === 0x10 || b0 === 0x20 || b0 === 0x36 ? 2 : b0 === 0x22 || b0 === 0x32 || b0 === 0x21 ? 4 : 1;
      console.log(`  ${hex(addr, 6)}: ${formatBytes(readBytes(addr, width)).padEnd(11)} ${note}`);
      found++;
    }
  }

  if (!found) {
    console.log('  No obvious byte writes, block copies, or loop branches found in this window.');
  }
}

function b3Safe(addr) {
  return readByte(addr + 3) !== undefined;
}

function printAnalysisNotes() {
  console.log('\n=== Analysis notes ===');
  console.log('- Pixel format: session 477 VRAM write spacing strongly indicates 16bpp output, two bytes per pixel.');
  console.log('- Row stride: 0x280 bytes per LCD row = 640 bytes = 320 pixels * 2 bytes.');
  console.log('- Renderer height: the surrounding decode reports a 16-row loop, so glyphs are 16 pixels tall.');
  console.log('- Character width: infer from the contiguous bytes written per row. 12 bytes per row means a 6-pixel-wide glyph at 16bpp; 16 bytes means 8 pixels wide.');
  console.log('- Font entry format: LD H,0x1C; LD L,A forms 0x001C00 | charcode, so the 0x1C00 page is a 256-byte lookup table, not a 16-byte-per-glyph bitmap store.');
  console.log('- Pointer interpretation: compare the direct 16 bytes, the 16-bit target, and the 24-bit target dumps above to identify whether entries are offsets, packed row data, or low bytes into a fixed font page.');
}

hexDump(0x005A75, 140, 'Font renderer at 0x005A75');
hexDump(0x001C00, 256, 'Font table at 0x1C00');

const glyphs = [
  [0x48, "'H'"],
  [0x41, "'A'"],
  [0x30, "'0'"],
  [0x20, 'space'],
  [0xE1, 'cursor glyph 1'],
];

for (const [charCode, label] of glyphs) {
  printGlyphInfo(charCode, label);
}

disassemble(0x005A75, 140, 'Approximate disassembly of 0x005A75 renderer window');
scanVramWriteSignals(0x005A75, 140);
printAnalysisNotes();

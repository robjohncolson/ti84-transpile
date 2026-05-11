#!/usr/bin/env node
// Phase 297b: Deep analysis of keyboard MMIO sites found in phase 297.
//
// Key finding from 297: No IN r,(C) with LD BC,0xE009xx, but 12 Z80-compat
// IN A,(0x09) sites found. On eZ80, IN A,(n) reads port (MBASE<<16) | (A<<8) | n
// in ADL mode, or just (A<<8)|n in Z80 mode. The keyboard port range 0xE009xx
// requires MBASE=0xE0 and A=0x09 (or similar setup).
//
// This probe examines each IN A,(0x09) site in detail.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rom = readFileSync(join(__dirname, 'ROM.rom'));
const romSize = rom.length;

function hex(v, w = 2) {
  return v.toString(16).toUpperCase().padStart(w, '0');
}

function hexDump(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    parts.push(idx >= 0 && idx < buf.length ? hex(buf[idx]) : '??');
  }
  return parts.join(' ');
}

// Disassemble a few bytes as eZ80 mnemonics (simplified)
function disasmSimple(buf, addr, count) {
  const lines = [];
  let pc = addr;
  for (let n = 0; n < count && pc < buf.length; n++) {
    const b0 = buf[pc];
    let line = `${hex(pc, 6)}: `;

    if (b0 === 0xDB) {
      line += `IN A,(0x${hex(buf[pc+1])})`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0xD3) {
      line += `OUT (0x${hex(buf[pc+1])}),A`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0x3E) {
      line += `LD A,0x${hex(buf[pc+1])}`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0x01) {
      const lo = buf[pc+1], mid = buf[pc+2], hi = buf[pc+3];
      line += `LD BC,0x${hex(hi)}${hex(mid)}${hex(lo)}`;
      lines.push(line);
      pc += 4;
    } else if (b0 === 0x11) {
      const lo = buf[pc+1], mid = buf[pc+2], hi = buf[pc+3];
      line += `LD DE,0x${hex(hi)}${hex(mid)}${hex(lo)}`;
      lines.push(line);
      pc += 4;
    } else if (b0 === 0x21) {
      const lo = buf[pc+1], mid = buf[pc+2], hi = buf[pc+3];
      line += `LD HL,0x${hex(hi)}${hex(mid)}${hex(lo)}`;
      lines.push(line);
      pc += 4;
    } else if (b0 === 0xED) {
      const b1 = buf[pc+1];
      if (b1 === 0x78) { line += 'IN A,(C)'; pc += 2; }
      else if (b1 === 0x79) { line += 'OUT (C),A'; pc += 2; }
      else if (b1 === 0x40) { line += 'IN B,(C)'; pc += 2; }
      else if (b1 === 0x41) { line += 'OUT (C),B'; pc += 2; }
      else if (b1 === 0x48) { line += 'IN C,(C)'; pc += 2; }
      else if (b1 === 0x49) { line += 'OUT (C),C'; pc += 2; }
      else if (b1 === 0x50) { line += 'IN D,(C)'; pc += 2; }
      else if (b1 === 0x51) { line += 'OUT (C),D'; pc += 2; }
      else if (b1 === 0x58) { line += 'IN E,(C)'; pc += 2; }
      else if (b1 === 0x60) { line += 'IN H,(C)'; pc += 2; }
      else if (b1 === 0x68) { line += 'IN L,(C)'; pc += 2; }
      else if (b1 === 0x52) { line += 'SBC HL,DE'; pc += 2; }
      else if (b1 === 0xB0) { line += 'LDIR'; pc += 2; }
      else if (b1 === 0xB8) { line += 'LDDR'; pc += 2; }
      else { line += `ED ${hex(b1)}`; pc += 2; }
      lines.push(line);
    } else if (b0 === 0xC9) {
      line += 'RET';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xCD) {
      const lo = buf[pc+1], mid = buf[pc+2], hi = buf[pc+3];
      line += `CALL 0x${hex(hi)}${hex(mid)}${hex(lo)}`;
      lines.push(line);
      pc += 4;
    } else if (b0 === 0xC3) {
      const lo = buf[pc+1], mid = buf[pc+2], hi = buf[pc+3];
      line += `JP 0x${hex(hi)}${hex(mid)}${hex(lo)}`;
      lines.push(line);
      pc += 4;
    } else if (b0 === 0x18) {
      const rel = buf[pc+1];
      const target = pc + 2 + (rel > 127 ? rel - 256 : rel);
      line += `JR 0x${hex(target, 6)}`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0x20) {
      const rel = buf[pc+1];
      const target = pc + 2 + (rel > 127 ? rel - 256 : rel);
      line += `JR NZ,0x${hex(target, 6)}`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0x28) {
      const rel = buf[pc+1];
      const target = pc + 2 + (rel > 127 ? rel - 256 : rel);
      line += `JR Z,0x${hex(target, 6)}`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0xAF) {
      line += 'XOR A';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xB7) {
      line += 'OR A';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xFE) {
      line += `CP 0x${hex(buf[pc+1])}`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0x32) {
      const lo = buf[pc+1], mid = buf[pc+2], hi = buf[pc+3];
      line += `LD (0x${hex(hi)}${hex(mid)}${hex(lo)}),A`;
      lines.push(line);
      pc += 4;
    } else if (b0 === 0x3A) {
      const lo = buf[pc+1], mid = buf[pc+2], hi = buf[pc+3];
      line += `LD A,(0x${hex(hi)}${hex(mid)}${hex(lo)})`;
      lines.push(line);
      pc += 4;
    } else if (b0 === 0xF5) {
      line += 'PUSH AF';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xE5) {
      line += 'PUSH HL';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xD5) {
      line += 'PUSH DE';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xC5) {
      line += 'PUSH BC';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xF1) {
      line += 'POP AF';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xE1) {
      line += 'POP HL';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xD1) {
      line += 'POP DE';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xC1) {
      line += 'POP BC';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0xFF) {
      line += `db 0xFF`;
      lines.push(line);
      pc += 1;
    } else if (b0 === 0x47) {
      line += 'LD B,A';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0x4F) {
      line += 'LD C,A';
      lines.push(line);
      pc += 1;
    } else if (b0 === 0x06) {
      line += `LD B,0x${hex(buf[pc+1])}`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0x0E) {
      line += `LD C,0x${hex(buf[pc+1])}`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0xCB) {
      line += `CB ${hex(buf[pc+1])}`;
      lines.push(line);
      pc += 2;
    } else if (b0 === 0xDD || b0 === 0xFD) {
      const prefix = b0 === 0xDD ? 'IX' : 'IY';
      line += `${b0 === 0xDD ? 'DD' : 'FD'} ${hex(buf[pc+1])}`;
      lines.push(line);
      pc += 2; // simplified
    } else {
      line += `db 0x${hex(b0)}`;
      lines.push(line);
      pc += 1;
    }
  }
  return lines;
}

// IN A,(0x09) sites from phase 297
const inSites = [0x015008];

// OUT (0x09),A sites (excluding false positives from jump tables)
// Let's check all to see which are real OUT instructions vs data
const outCandidates = [
  0x020EC2, 0x020EC6, 0x021806, 0x02667B, 0x058A6A, 0x060859,
  0x0911A0, 0x097214, 0x09CAA7, 0x09CD74, 0x09D07F, 0x09D217,
  0x09D325, 0x09D35F, 0x09D364, 0x0B5101
];

// More IN A,(0x09) sites
const inCandidates = [
  0x015008, 0x020EE6, 0x06D35E,
  0x09D646, 0x09D656, 0x09D75E, 0x09D782,
  0x09D8E2, 0x09D916, 0x09D934, 0x09DAED, 0x09DB05
];

console.log('=== Phase 297b: Keyboard MMIO Detail ===');
console.log();

// ── Detailed disasm of each IN A,(0x09) site ──
console.log('── IN A,(0x09) sites — context disassembly ──');
console.log();

for (const addr of inCandidates) {
  const start = Math.max(0, addr - 20);
  console.log(`--- Site 0x${hex(addr, 6)} ---`);
  console.log(`  Raw hex (addr-20 to addr+15): ${hexDump(rom, start, 35)}`);

  // Check if this is really an IN instruction or part of data (e.g. JP table)
  // A real IN A,(n) is DB xx. Check if the byte at addr is really 0xDB
  if (rom[addr] === 0xDB && rom[addr + 1] === 0x09) {
    console.log('  Confirmed: DB 09 = IN A,(0x09)');

    // Look for LD A,xx before this (sets keyboard group)
    for (let j = addr - 10; j < addr; j++) {
      if (j >= 0 && rom[j] === 0x3E) {
        console.log(`  LD A,0x${hex(rom[j+1])} @ 0x${hex(j, 6)} (possible group select)`);
      }
    }

    // Disassemble context
    const disStart = Math.max(0, addr - 15);
    console.log(`  Disassembly from 0x${hex(disStart, 6)}:`);
    const lines = disasmSimple(rom, disStart, 20);
    for (const l of lines) {
      console.log(`    ${l}`);
    }
  } else {
    // Check if it's really data disguised as a D3 09 in a jump table
    // The surrounding context might be JP instructions (C3 xx xx xx)
    console.log(`  Byte at addr: 0x${hex(rom[addr])}, next: 0x${hex(rom[addr+1])}`);
    console.log('  MAY BE DATA (jump table entry), not a real instruction');

    // Check if addr-2 or addr-3 is a JP/CALL
    for (let delta = -4; delta <= 0; delta++) {
      const p = addr + delta;
      if (p >= 0 && (rom[p] === 0xC3 || rom[p] === 0xCD)) {
        const lo = rom[p+1], mid = rom[p+2], hi = rom[p+3];
        const target = (hi << 16) | (mid << 8) | lo;
        const mnem = rom[p] === 0xC3 ? 'JP' : 'CALL';
        console.log(`  ${mnem} 0x${hex(target, 6)} @ 0x${hex(p, 6)} — this is a jump target, DB 09 is part of an address`);
      }
    }
  }
  console.log();
}

// ── Check the OUT candidates ──
console.log('── OUT (0x09),A candidates — real vs data ──');
console.log();

for (const addr of outCandidates) {
  const isRealD3 = rom[addr] === 0xD3 && rom[addr + 1] === 0x09;

  // Check if preceding bytes form a JP/CALL whose target address contains D3 09
  let isData = false;
  for (let delta = -3; delta <= -1; delta++) {
    const p = addr + delta;
    if (p >= 0 && (rom[p] === 0xC3 || rom[p] === 0xCD)) {
      isData = true;
    }
  }

  if (isRealD3 && !isData) {
    console.log(`  0x${hex(addr, 6)}: REAL OUT (0x09),A`);
    const disStart = Math.max(0, addr - 10);
    const lines = disasmSimple(rom, disStart, 12);
    for (const l of lines) console.log(`    ${l}`);
  } else if (isData) {
    // Decode the JP/CALL to show the target
    for (let delta = -3; delta <= -1; delta++) {
      const p = addr + delta;
      if (p >= 0 && (rom[p] === 0xC3 || rom[p] === 0xCD)) {
        const lo = rom[p+1], mid = rom[p+2], hi = rom[p+3];
        const target = (hi << 16) | (mid << 8) | lo;
        const mnem = rom[p] === 0xC3 ? 'JP' : 'CALL';
        console.log(`  0x${hex(addr, 6)}: DATA — part of ${mnem} 0x${hex(target, 6)} @ 0x${hex(p, 6)}`);
        break;
      }
    }
  } else {
    console.log(`  0x${hex(addr, 6)}: UNCERTAIN — byte=0x${hex(rom[addr])}`);
    console.log(`    hex: ${hexDump(rom, Math.max(0, addr - 8), 16)}`);
  }
  console.log();
}

// ── Focus: 0x015008 area — the real keyboard scanner ──
console.log('── Focus: 0x015008 area (near known scanner at 0x0159C0) ──');
console.log();

// Disassemble a large block around 0x015008
const focusStart = 0x014FF0;
console.log(`  Disassembly from 0x${hex(focusStart, 6)}:`);
const focusLines = disasmSimple(rom, focusStart, 50);
for (const l of focusLines) console.log(`    ${l}`);

console.log();

// ── Also check 0x0159C0 (RAW_SCAN_ENTRY) area ──
console.log('── Focus: 0x0159C0 (RAW_SCAN_ENTRY) ──');
console.log();
const scanLines = disasmSimple(rom, 0x0159C0, 60);
for (const l of scanLines) console.log(`    ${l}`);
console.log();

// ── Search for OUT (0x09),A followed by IN A,(0x09) within 20 bytes ──
console.log('── OUT (0x09),A → IN A,(0x09) pairs (keyboard scan pattern) ──');
console.log();

for (let i = 0; i < romSize - 1; i++) {
  if (rom[i] === 0xD3 && rom[i + 1] === 0x09) {
    // Check if it's really an OUT (not part of a JP address)
    let isJpData = false;
    for (let d = -3; d <= -1; d++) {
      if (i + d >= 0 && (rom[i + d] === 0xC3 || rom[i + d] === 0xCD)) {
        isJpData = true;
        break;
      }
    }
    if (isJpData) continue;

    // Look forward for IN A,(0x09)
    for (let j = i + 2; j < Math.min(romSize - 1, i + 30); j++) {
      if (rom[j] === 0xDB && rom[j + 1] === 0x09) {
        console.log(`  OUT @ 0x${hex(i, 6)}, IN @ 0x${hex(j, 6)} (delta=${j - i})`);
        const disStart = Math.max(0, i - 5);
        const lines = disasmSimple(rom, disStart, 25);
        for (const l of lines) console.log(`    ${l}`);
        console.log();
        break;
      }
    }
  }
}

// ── Search for all DB xx (IN A,(n)) with n in range 01-07 (keyboard groups) ──
// TI keyboard uses OUT to port 0x01-0x07 to select group, then IN from 0x09
console.log('── OUT (n),A where n=01..07 near IN A,(0x09) ──');
console.log();

for (const inAddr of inCandidates) {
  if (rom[inAddr] !== 0xDB) continue;
  // look backward for D3 01..07
  for (let j = inAddr - 20; j < inAddr; j++) {
    if (j >= 0 && rom[j] === 0xD3 && rom[j + 1] >= 0x01 && rom[j + 1] <= 0x0F) {
      console.log(`  OUT (0x${hex(rom[j+1])}),A @ 0x${hex(j, 6)} before IN A,(0x09) @ 0x${hex(inAddr, 6)}`);
    }
  }
}
console.log();

// ── Comprehensive: every DB xx in the ROM with port != 0x09 but near keyboard code ──
// Actually, let's look at IN/OUT near 0x015008 more broadly
console.log('── All IN A,(n) and OUT (n),A in 0x014F00-0x015B00 range ──');
console.log();
for (let i = 0x014F00; i < 0x015B00 && i < romSize - 1; i++) {
  if (rom[i] === 0xDB) {
    console.log(`  IN A,(0x${hex(rom[i+1])}) @ 0x${hex(i, 6)}`);
  }
  if (rom[i] === 0xD3) {
    // Check not part of JP
    let isJp = false;
    for (let d = -3; d <= -1; d++) {
      if (i + d >= 0 && (rom[i + d] === 0xC3 || rom[i + d] === 0xCD)) {
        isJp = true;
        break;
      }
    }
    if (!isJp) {
      console.log(`  OUT (0x${hex(rom[i+1])}),A @ 0x${hex(i, 6)}`);
    }
  }
}

console.log();
console.log('=== Phase 297b complete ===');

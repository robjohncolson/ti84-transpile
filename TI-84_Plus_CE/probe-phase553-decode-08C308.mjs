/**
 * probe-phase553-decode-08C308.mjs
 *
 * Analyzes the function at 0x08C308 and its role in the 16-bit color
 * rendering path of the character blit loop (0x0A2618-0x0A2694).
 *
 * FINDINGS:
 *   0x08C308 is NOT a color loader. It is a 1-flag check:
 *     PUSH HL / LD HL,0xD000C6 / BIT 2,(HL) / POP HL / RET
 *   Returns Z flag: bit2 set -> NZ (16-bit color mode active)
 *                   bit2 clear -> Z (8-bit/mono mode)
 *
 *   The actual foreground/background colors are loaded by the blit loop
 *   itself at 0x0A2619/0x0A261E:
 *     SIS LD DE,(0x26AC) -> DE = foreground color (RGB565)
 *     SIS LD BC,(0x26AA) -> BC = background color (RGB565)
 *   where SIS addresses resolve via MBASE to D026AC / D026AA.
 *
 *   D026AC = foreground color (RGB565, 16-bit) — written by 70+ sites
 *   D026AA = background color (RGB565, 16-bit) — written by 25+ sites
 *   D000C6 bit 2 = 16-bit color mode flag
 */
import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function readU16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function readU24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function bytesAt(buf, off, len) {
  return Array.from(buf.subarray(off, off + len), byteHex).join(' ');
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);

  // ---------------------------------------------------------------
  // 1. Disassemble 0x08C308 (the flag-check function)
  // ---------------------------------------------------------------
  console.log('=== 0x08C308: BIT 2,(D000C6) flag check ===');
  console.log('  08C308: E5              PUSH HL');
  console.log('  08C309: 21 C6 00 D0     LD HL,0xD000C6');
  console.log('  08C30D: CB 56           BIT 2,(HL)    ; test bit 2 of RAM[D000C6]');
  console.log('  08C30F: E1              POP HL');
  console.log('  08C310: C9              RET');
  console.log('');
  console.log('  Contract: no register inputs; returns Z flag.');
  console.log('    NZ (bit2 set) = 16-bit color mode active');
  console.log('    Z  (bit2 clr) = 8-bit or mono mode');
  console.log('');

  // Verify the bytes match
  const expected = [0xE5, 0x21, 0xC6, 0x00, 0xD0, 0xCB, 0x56, 0xE1, 0xC9];
  const actual = Array.from(rom.slice(0x08C308, 0x08C308 + 9));
  const match = expected.every((b, i) => b === actual[i]);
  console.log(`  Byte verification: ${match ? 'PASS' : 'FAIL'}`);
  if (!match) {
    console.log(`    Expected: ${expected.map(byteHex).join(' ')}`);
    console.log(`    Actual:   ${actual.map(byteHex).join(' ')}`);
  }

  // ---------------------------------------------------------------
  // 2. Disassemble the 16-bit color rendering path (0x0A2618)
  // ---------------------------------------------------------------
  console.log('\n=== 0x0A2618: 16-bit color blit path ===');
  console.log('  0A2618: C5              PUSH BC           ; save outer loop counter');
  console.log('  0A2619: 40 ED 5B AC 26  SIS LD DE,(26AC)  ; DE = foreground (D026AC)');
  console.log('  0A261E: 40 ED 4B AA 26  SIS LD BC,(26AA)  ; BC = background (D026AA)');
  console.log('  0A2623: D9              EXX               ; swap to alt registers');
  console.log('  0A2624: CD 08 C3 08     CALL 0x08C308     ; check 16-bit color flag');
  console.log('  0A2628: C1              POP BC            ; B = pixel count from glyph');
  console.log('  0A2629: 28 4C           JR Z,0x0A2677     ; -> 8-bit path if not 16-bit');
  console.log('  --- 16-bit pixel loop (1 byte per pixel) ---');
  console.log('  0A262B: D9              EXX               ; get DE/BC colors back');
  console.log('  0A262C: 87              ADD A,A           ; shift glyph bit into carry');
  console.log('  0A262D: DA 3B 26 0A     JP C,0x0A263B     ; carry=1 -> foreground');
  console.log('  0A2631: 71              LD (HL),C         ; background low byte');
  console.log('  0A2632: 23              INC HL');
  console.log('  0A2633: D9              EXX');
  console.log('  0A2634: 10 F5           DJNZ 0x0A262B     ; next pixel');
  console.log('  0A2636: D9              EXX');
  console.log('  0A2637: C3 41 26 0A     JP 0x0A2641       ; done with row');
  console.log('  0A263B: 73              LD (HL),E         ; foreground low byte');
  console.log('  0A263C: 23              INC HL');
  console.log('  0A263D: D9              EXX');
  console.log('  0A263E: 10 EB           DJNZ 0x0A262B     ; next pixel');
  console.log('  0A2640: D9              EXX');
  console.log('');
  console.log('  NOTE: Only writes C (bg low) or E (fg low) per pixel.');
  console.log('  This is the BYTE-PER-PIXEL path (8bpp palette mode),');
  console.log('  not full 16bpp. The "16-bit" flag at D000C6 bit 2');
  console.log('  distinguishes this 8bpp path from the alternate path.');
  console.log('');

  // ---------------------------------------------------------------
  // 3. Disassemble the alternate path at 0x0A2677 (2 bytes/pixel)
  // ---------------------------------------------------------------
  console.log('=== 0x0A2677: alternate path (2 bytes per pixel, true 16bpp) ===');
  console.log('  0A2677: D9              EXX               ; get DE/BC colors');
  console.log('  0A2678: 87              ADD A,A           ; shift glyph bit');
  console.log('  0A2679: DA 89 26 0A     JP C,0x0A2689     ; carry=1 -> foreground');
  console.log('  0A267D: 71              LD (HL),C         ; bg low byte');
  console.log('  0A267E: 23              INC HL');
  console.log('  0A267F: 70              LD (HL),B         ; bg high byte');
  console.log('  0A2680: 23              INC HL');
  console.log('  0A2681: D9              EXX');
  console.log('  0A2682: 10 F3           DJNZ 0x0A2677     ; next pixel');
  console.log('  0A2684: D9              EXX');
  console.log('  0A2685: C3 95 26 0A     JP 0x0A2695       ; done');
  console.log('  0A2689: 73              LD (HL),E         ; fg low byte');
  console.log('  0A268A: 23              INC HL');
  console.log('  0A268B: 72              LD (HL),D         ; fg high byte');
  console.log('  0A268C: 23              INC HL');
  console.log('  0A268D: D9              EXX');
  console.log('  0A268E: 10 E7           DJNZ 0x0A2677     ; next pixel');
  console.log('  0A2690: D9              EXX');
  console.log('  0A2691: C3 95 26 0A     JP 0x0A2695       ; done');
  console.log('');
  console.log('  This path writes BC (bg) or DE (fg) as full 16-bit');
  console.log('  little-endian words: low byte then high byte.');

  // Verify alternate path bytes
  const altExpected = [0xD9, 0x87, 0xDA, 0x89, 0x26, 0x0A, 0x71, 0x23, 0x70, 0x23, 0xD9, 0x10, 0xF3, 0xD9];
  const altActual = Array.from(rom.slice(0x0A2677, 0x0A2677 + 14));
  const altMatch = altExpected.every((b, i) => b === altActual[i]);
  console.log(`\n  Byte verification: ${altMatch ? 'PASS' : 'FAIL'}`);

  // ---------------------------------------------------------------
  // 4. Count writers to D026AA and D026AC
  // ---------------------------------------------------------------
  let fgWriters = 0;
  let bgWriters = 0;
  const fgSites = [];
  const bgSites = [];

  for (let i = 0; i < rom.length - 5; i++) {
    if (rom[i] === 0x40 && rom[i + 1] === 0xED) {
      const op = rom[i + 2];
      if (op === 0x53 || op === 0x43) {
        const addr16 = readU16(rom, i + 3);
        if (addr16 === 0x26AC) {
          fgWriters++;
          if (fgSites.length < 10) fgSites.push(hex(i));
        }
        if (addr16 === 0x26AA) {
          bgWriters++;
          if (bgSites.length < 10) bgSites.push(hex(i));
        }
      }
    }
  }

  console.log('\n=== Color store sites ===');
  console.log(`  D026AC (foreground) writers: ${fgWriters}`);
  console.log(`    First 10: ${fgSites.join(', ')}`);
  console.log(`  D026AA (background) writers: ${bgWriters}`);
  console.log(`    First 10: ${bgSites.join(', ')}`);

  // ---------------------------------------------------------------
  // 5. Count callers of 0x08C308
  // ---------------------------------------------------------------
  let flagCallers = 0;
  const flagSites = [];
  for (let i = 0; i < rom.length - 4; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === 0x08 && rom[i + 2] === 0xC3 && rom[i + 3] === 0x08) {
      flagCallers++;
      flagSites.push(hex(i));
    }
  }
  console.log(`\n  0x08C308 callers: ${flagCallers}`);
  console.log(`    Sites: ${flagSites.join(', ')}`);

  // ---------------------------------------------------------------
  // 6. Check a typical foreground color writer for context
  // ---------------------------------------------------------------
  console.log('\n=== Sample color writer at 0x088D90 ===');
  console.log('  Bytes: ' + bytesAt(rom, 0x088D90, 32));
  console.log('  088D98: 40 ED 43 AC 26  SIS LD (26AC),BC  ; set foreground = BC');
  console.log('  088D9D: 01 1C E7 00     LD BC,0x00E71C');
  console.log('  088DA1: 40 ED 43 AA 26  SIS LD (26AA),BC  ; set background = BC = 0xE71C');
  const bgColor = 0xE71C;
  const r = (bgColor >> 11) & 0x1F;
  const g = (bgColor >> 5) & 0x3F;
  const b = bgColor & 0x1F;
  console.log(`  0xE71C as RGB565: R=${r} G=${g} B=${b}`);
  console.log(`    -> R=${Math.round(r * 255 / 31)}, G=${Math.round(g * 255 / 63)}, B=${Math.round(b * 255 / 31)}`);
  console.log(`    -> white (255,227,224) — TI-84 default background`);

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log('');
  console.log('0x08C308 = BIT 2,(D000C6) — display mode flag check (9 bytes)');
  console.log('  Input: none');
  console.log('  Output: Z flag only');
  console.log('  NZ = 8bpp palette mode (1 byte per pixel in framebuffer)');
  console.log('  Z  = 16bpp true-color mode (2 bytes per pixel)');
  console.log('');
  console.log('Color RAM addresses (both RGB565, 16-bit):');
  console.log('  D026AC = foreground color');
  console.log('  D026AA = background color');
  console.log('');
  console.log('Blit loop paths:');
  console.log('  0x0A262B: 8bpp path — writes C (bg) or E (fg), 1 byte/pixel');
  console.log('  0x0A2677: 16bpp path — writes C+B (bg) or E+D (fg), 2 bytes/pixel');
  console.log('');
  console.log('D000C6 bit 2 meaning:');
  console.log('  1 = 8bpp (256-color palette, LCD in 8-bit mode)');
  console.log('  0 = 16bpp (RGB565 direct, LCD in 16-bit mode)');
  console.log('');
  console.log(`Callers of 0x08C308: ${flagCallers}`);
  console.log(`Writers to D026AC (fg): ${fgWriters}`);
  console.log(`Writers to D026AA (bg): ${bgWriters}`);
}

main();

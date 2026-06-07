import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mem = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x052a00;
const END = 0x055500;
const refs = [
  { addr: 0x052ade, note: 'JR Z,+9; Z=16bpp jumps, NZ=8bpp falls through' },
  { addr: 0x052bfb, note: 'JR NZ,+1; doubling-loop pattern' },
  { addr: 0x052ce9, note: 'JR NZ,+98; NZ=8bpp jumps far forward' },
  { addr: 0x052d82, note: 'JR NZ,+81; NZ=8bpp jumps forward' },
  { addr: 0x05440b, note: 'JR NZ,+1; doubling-loop pattern' },
  { addr: 0x05529c, note: 'JR Z,+14; Z=16bpp jumps' },
];

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const hex6 = (n) => n.toString(16).toUpperCase().padStart(6, '0');
const u8 = (addr) => mem[addr] ?? 0;
const u24 = (addr) => u8(addr) | (u8(addr + 1) << 8) | (u8(addr + 2) << 16);
const s8 = (n) => (n & 0x80 ? n - 0x100 : n);

function bytes(addr, len) {
  return Array.from({ length: len }, (_, i) => hex2(u8(addr + i))).join(' ');
}

function line(addr, len, text, mark = '') {
  const b = bytes(addr, len).padEnd(15, ' ');
  console.log(`${mark}${hex6(addr)}  ${b}  ${text}`);
}

function decode(addr) {
  const b0 = u8(addr);
  const b1 = u8(addr + 1);
  const b2 = u8(addr + 2);
  const b3 = u8(addr + 3);

  if (b0 === 0x3A) return { len: 4, text: `LD A,(${hex6(u24(addr + 1))})` };
  if (b0 === 0x32) return { len: 4, text: `LD (${hex6(u24(addr + 1))}),A` };
  if (b0 === 0x21) return { len: 4, text: `LD HL,${hex6(u24(addr + 1))}` };
  if (b0 === 0x11) return { len: 4, text: `LD DE,${hex6(u24(addr + 1))}` };
  if (b0 === 0x01) return { len: 4, text: `LD BC,${hex6(u24(addr + 1))}` };
  if (b0 === 0x22) return { len: 4, text: `LD (${hex6(u24(addr + 1))}),HL` };
  if (b0 === 0x2A) return { len: 4, text: `LD HL,(${hex6(u24(addr + 1))})` };
  if (b0 === 0xCD) return { len: 4, text: `CALL ${hex6(u24(addr + 1))}` };
  if (b0 === 0xC3) return { len: 4, text: `JP ${hex6(u24(addr + 1))}` };
  if (b0 === 0xC9) return { len: 1, text: 'RET' };
  if (b0 === 0xC5) return { len: 1, text: 'PUSH BC' };
  if (b0 === 0xD5) return { len: 1, text: 'PUSH DE' };
  if (b0 === 0xE5) return { len: 1, text: 'PUSH HL' };
  if (b0 === 0xF5) return { len: 1, text: 'PUSH AF' };
  if (b0 === 0xC1) return { len: 1, text: 'POP BC' };
  if (b0 === 0xD1) return { len: 1, text: 'POP DE' };
  if (b0 === 0xE1) return { len: 1, text: 'POP HL' };
  if (b0 === 0xF1) return { len: 1, text: 'POP AF' };
  if (b0 === 0xE3) return { len: 1, text: 'EX (SP),HL' };
  if (b0 === 0xEB) return { len: 1, text: 'EX DE,HL' };
  if (b0 === 0x08) return { len: 1, text: 'EX AF,AF\'' };
  if (b0 === 0xD9) return { len: 1, text: 'EXX' };
  if (b0 === 0x13) return { len: 1, text: 'INC DE' };
  if (b0 === 0x23) return { len: 1, text: 'INC HL' };
  if (b0 === 0x03) return { len: 1, text: 'INC BC' };
  if (b0 === 0x1B) return { len: 1, text: 'DEC DE' };
  if (b0 === 0x2B) return { len: 1, text: 'DEC HL' };
  if (b0 === 0x0B) return { len: 1, text: 'DEC BC' };
  if (b0 === 0x09) return { len: 1, text: 'ADD HL,BC' };
  if (b0 === 0x19) return { len: 1, text: 'ADD HL,DE' };
  if (b0 === 0x29) return { len: 1, text: 'ADD HL,HL' };
  if (b0 === 0x39) return { len: 1, text: 'ADD HL,SP' };
  if (b0 === 0x7E) return { len: 1, text: 'LD A,(HL)' };
  if (b0 === 0x77) return { len: 1, text: 'LD (HL),A' };
  if (b0 === 0x12) return { len: 1, text: 'LD (DE),A' };
  if (b0 === 0x1A) return { len: 1, text: 'LD A,(DE)' };
  if (b0 === 0x70) return { len: 1, text: 'LD (HL),B' };
  if (b0 === 0x71) return { len: 1, text: 'LD (HL),C' };
  if (b0 === 0x72) return { len: 1, text: 'LD (HL),D' };
  if (b0 === 0x73) return { len: 1, text: 'LD (HL),E' };
  if (b0 === 0x36) return { len: 2, text: `LD (HL),${hex2(b1)}` };
  if (b0 === 0x3E) return { len: 2, text: `LD A,${hex2(b1)}` };
  if (b0 === 0x06) return { len: 2, text: `LD B,${hex2(b1)}` };
  if (b0 === 0x0E) return { len: 2, text: `LD C,${hex2(b1)}` };
  if (b0 === 0x16) return { len: 2, text: `LD D,${hex2(b1)}` };
  if (b0 === 0x1E) return { len: 2, text: `LD E,${hex2(b1)}` };
  if (b0 === 0x26) return { len: 2, text: `LD H,${hex2(b1)}` };
  if (b0 === 0x2E) return { len: 2, text: `LD L,${hex2(b1)}` };
  if (b0 === 0x18) return { len: 2, text: `JR ${s8(b1) >= 0 ? '+' : ''}${s8(b1)} -> ${hex6(addr + 2 + s8(b1))}` };
  if (b0 === 0x20) return { len: 2, text: `JR NZ,${s8(b1) >= 0 ? '+' : ''}${s8(b1)} -> ${hex6(addr + 2 + s8(b1))}` };
  if (b0 === 0x28) return { len: 2, text: `JR Z,${s8(b1) >= 0 ? '+' : ''}${s8(b1)} -> ${hex6(addr + 2 + s8(b1))}` };
  if (b0 === 0x30) return { len: 2, text: `JR NC,${s8(b1) >= 0 ? '+' : ''}${s8(b1)} -> ${hex6(addr + 2 + s8(b1))}` };
  if (b0 === 0x38) return { len: 2, text: `JR C,${s8(b1) >= 0 ? '+' : ''}${s8(b1)} -> ${hex6(addr + 2 + s8(b1))}` };
  if (b0 === 0x10) return { len: 2, text: `DJNZ ${s8(b1) >= 0 ? '+' : ''}${s8(b1)} -> ${hex6(addr + 2 + s8(b1))}` };
  if (b0 === 0xCB && b1 === 0x57) return { len: 2, text: 'BIT 2,A' };
  if (b0 === 0xED && b1 === 0xA0) return { len: 2, text: 'LDI' };
  if (b0 === 0xED && b1 === 0xB0) return { len: 2, text: 'LDIR' };
  if (b0 === 0xED && b1 === 0xA8) return { len: 2, text: 'LDD' };
  if (b0 === 0xED && b1 === 0xB8) return { len: 2, text: 'LDDR' };
  if (b0 === 0xED && b1 === 0x4B) return { len: 4, text: `LD BC,(${hex4(b2 | (b3 << 8))})` };
  if (b0 === 0xED && b1 === 0x5B) return { len: 4, text: `LD DE,(${hex4(b2 | (b3 << 8))})` };
  if (b0 === 0xED && b1 === 0x6B) return { len: 4, text: `LD HL,(${hex4(b2 | (b3 << 8))})` };

  return { len: 1, text: `DB ${hex2(b0)}` };
}

function disasmWindow(center, before = 30, after = 60) {
  const start = Math.max(START, center - before);
  const end = Math.min(END, center + after);
  let addr = start;

  while (addr < end) {
    const decoded = decode(addr);
    const marker = addr === center ? '=> ' : '   ';
    let text = decoded.text;

    if (addr === center) {
      const ref = refs.find((r) => r.addr === center);
      text += `    ; D000C6 bpp flag: ${ref.note}`;
    }
    if (addr === center + 4 && u8(addr) === 0xCB && u8(addr + 1) === 0x57) {
      text += '    ; test bit 2';
    }
    if ((addr === 0x052c02 || addr === 0x054412) && center < addr) {
      text += '    ; byte skipped by JR NZ,+1 candidate';
    }

    line(addr, decoded.len, text, marker);
    addr += decoded.len;
  }
}

function scanRegion() {
  const rets = [];
  const calls = [];
  const jumps = [];
  const blockCopies = [];
  const d000c6Hits = [];

  for (let addr = START; addr < END; addr++) {
    const b0 = u8(addr);
    const b1 = u8(addr + 1);
    if (b0 === 0xC9) rets.push(addr);
    if (b0 === 0xCD) calls.push({ addr, target: u24(addr + 1) });
    if (b0 === 0xC3) jumps.push({ addr, target: u24(addr + 1) });
    if (b0 === 0x3A && u24(addr + 1) === 0xD000C6) d000c6Hits.push(addr);
    if (b0 === 0xED && [0xA0, 0xB0, 0xA8, 0xB8].includes(b1)) {
      const names = { 0xA0: 'LDI', 0xB0: 'LDIR', 0xA8: 'LDD', 0xB8: 'LDDR' };
      blockCopies.push({ addr, op: names[b1] });
    }
  }

  console.log(`Region: ${hex6(START)}-${hex6(END - 1)} (${END - START} bytes)`);
  console.log(`RET count: ${rets.length}`);
  console.log(rets.map((a) => hex6(a)).join(' ') || '(none)');

  console.log('\nEstimated function spans from RET boundaries:');
  let spanStart = START;
  for (const ret of rets) {
    console.log(`  ${hex6(spanStart)}-${hex6(ret)}  len=${ret - spanStart + 1}`);
    spanStart = ret + 1;
  }
  if (spanStart < END) console.log(`  ${hex6(spanStart)}-${hex6(END - 1)}  len=${END - spanStart} (tail/no RET)`);

  console.log(`\nCALL count: ${calls.length}`);
  for (const c of calls) console.log(`  ${hex6(c.addr)}  CALL ${hex6(c.target)}`);

  console.log(`\nJP count: ${jumps.length}`);
  for (const j of jumps) console.log(`  ${hex6(j.addr)}  JP ${hex6(j.target)}`);

  console.log(`\nBlock copy op count: ${blockCopies.length}`);
  for (const op of blockCopies) console.log(`  ${hex6(op.addr)}  ${op.op}`);

  console.log(`\nD000C6 hits found: ${d000c6Hits.length}`);
  for (const hit of d000c6Hits) console.log(`  ${hex6(hit)}`);
}

function inspectDoublingLoop(addr) {
  const jr = addr + 6;
  const skipTarget = jr + 2 + s8(u8(jr + 1));
  console.log(`\nDoubling-loop candidate at ${hex6(addr)}`);
  console.log(`  ${hex6(addr)} reads D000C6, ${hex6(addr + 4)} tests BIT 2,A`);
  console.log(`  ${hex6(jr)} ${bytes(jr, 2)} => ${decode(jr).text}`);
  console.log(`  skipped byte at ${hex6(jr + 2)}: ${hex2(u8(jr + 2))}`);
  console.log(`  branch target: ${hex6(skipTarget)}`);
  console.log('  Interpretation: bit2 set (8bpp) skips one single-byte instruction; bit2 clear (16bpp) executes it, commonly doubling an increment/stride adjustment.');
}

console.log('Phase 555 BPP-switching cluster probe');
console.log('ROM loaded, size:', mem.length);
console.log('');
scanRegion();

for (const ref of refs) {
  console.log(`\n=== D000C6 reference ${hex6(ref.addr)} ===`);
  console.log(ref.note);
  disasmWindow(ref.addr);
}

inspectDoublingLoop(0x052bfb);
inspectDoublingLoop(0x05440b);

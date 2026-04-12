#!/usr/bin/env node
// Phase 40 Task A: isolate the text-glyph draw primitive at 0x0a1799 and
// figure out why MODE/Y= screens render only solid bars (no glyph shapes).
//
// CC analysis (from the Phase 40 session):
//   0x0a1799 is the small-font glyph draw routine. Decoded prologue:
//     DI; PUSH AF/BC/DE/HL/IX
//     RES 2,(IY+2); BIT 1,(IY+13); JR Z,skip; CALL 0x0a237e; LD (HL),A
//     test char (skip nul, clamp to 0xfa)
//     LD HL,0; LD L,A; LD H,0x1c; MLT HL    ; HL = A*28 (glyph table offset)
//     CALL 0x07bf3e                          ; font ROM lookup
//     PUSH HL; POP IX                        ; IX = font ptr
//     LD A,(0xd00595); CALL 0x0a2d4c         ; column to VRAM stride
//     LD HL,0; LD H,A; LD L,0xa0; MLT HL     ; HL = A*160 (row stride/4)
//     ADD HL,HL; ADD HL,HL                   ; HL = A*640 (row VRAM offset)
//     ... rasterizes 12x18 glyph at computed VRAM addr
//
// Phase 38B trace already proved 0x0a1799 is called 66x during MODE render
// (probe-trace-mode.mjs results), but Phase 39 confirmed VRAM only contains
// 0x0000/0xFFFF -- no glyph shapes. So the routine runs but either:
//   (a) writes both fg and bg as 0xFFFF (color var wrong)
//   (b) bg fill happens AFTER glyph and overwrites it
//   (c) writes go to wrong VRAM addresses (off-screen)
//
// This probe calls 0x0a1799 in isolation against a CLEARED VRAM with no
// surrounding bg fill. If glyph pixels appear, the routine is sound and the
// MODE bug is "bg fill overwrites text". If pixels are still solid, the
// routine itself depends on state we are not setting.

import fs from 'node:fs';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const ROM = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

function fresh() {
  const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(ROM);
  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
  const cpu = ex.cpu;
  // Boot
  ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  // OS init with sentinel stack
  cpu.sp = 0xd1a87e - 3;
  mem[cpu.sp] = 0xff; mem[cpu.sp + 1] = 0xff; mem[cpu.sp + 2] = 0xff;
  ex.runFrom(0x08c331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
  // Clear VRAM
  for (let i = 0xd40000; i < 0xd40000 + 320 * 240 * 2; i++) mem[i] = 0;
  return { ex, cpu, mem };
}

function vramStats(mem) {
  let nz = 0, minR = 240, maxR = -1, minC = 320, maxC = -1;
  const colors = new Map();
  const writes = [];
  for (let row = 0; row < 240; row++) for (let col = 0; col < 320; col++) {
    const off = row * 640 + col * 2;
    const lo = mem[0xd40000 + off], hi = mem[0xd40000 + off + 1];
    if (lo !== 0 || hi !== 0) {
      nz++;
      if (row < minR) minR = row; if (row > maxR) maxR = row;
      if (col < minC) minC = col; if (col > maxC) maxC = col;
      const c = (hi << 8) | lo;
      colors.set(c, (colors.get(c) || 0) + 1);
    }
  }
  return { nz, minR, maxR, minC, maxC, colors };
}

function art(mem, minR, maxR, minC, maxC) {
  const lines = [];
  for (let row = Math.max(0, minR - 1); row <= Math.min(239, maxR + 1); row++) {
    let line = row.toString().padStart(3) + ' ';
    for (let col = Math.max(0, minC - 1); col <= Math.min(319, maxC + 1); col++) {
      const off = row * 640 + col * 2;
      const v = (mem[0xd40000 + off + 1] << 8) | mem[0xd40000 + off];
      line += v === 0 ? '.' : (v === 0xffff ? '#' : '?');
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function setupDrawState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xd00080;
  cpu.sp = 0xd1a87e - 9;
  for (let i = 0; i < 9; i++) mem[cpu.sp + i] = 0xff;
  cpu.f = 0x40;
  mem[0xd00595] = 0;     // cursor col (in char cells)
  mem[0xd00596] = 0;     // cursor row
  mem[0xd02505] = 0x1a;  // text limit (26 cols)
  // Phase 40 fix: text fg/bg colors at 0xd02688 / 0xd0268a (both 16-bit BGR565)
  // Default post-OS-init state has both = 0xffff (white) → all glyphs invisible.
  // Set fg = 0x0000 (black), bg = 0xffff (white).
  mem[0xd02688] = 0x00; mem[0xd02689] = 0x00;  // fg = 0x0000 black
  mem[0xd0268a] = 0xff; mem[0xd0268b] = 0xff;  // bg = 0xffff white
}

console.log('=== SCENARIO 1: 0x0a1799 direct, A=0x52 (R) ===');
{
  const { ex, cpu, mem } = fresh();
  setupDrawState(cpu, mem);
  // Inspect (IY+0x35) before call to see if early-exit guards trigger
  console.log(`(IY+0x35) = mem[0xd000b5] = 0x${mem[0xd000b5].toString(16)}`);
  console.log(`(IY+13)   = mem[0xd0008d] = 0x${mem[0xd0008d].toString(16)}`);
  cpu.a = 0x52;
  const r = ex.runFrom(0x0a1799, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  console.log(`steps=${r.steps} term=${r.termination} lastPc=0x${r.lastPc.toString(16)}`);
  // Dump font staging buffer at 0xd005a1..0xd005c0 (28 bytes + 4 byte header)
  let staging = '';
  for (let i = 0; i < 32; i++) staging += mem[0xd005a1 + i].toString(16).padStart(2,'0') + ' ';
  console.log(`staging buf 0xd005a1..: ${staging}`);
  // What does ROM say the 'R' glyph (0x52) at 0x003d6e + 0x52*0x1c should be?
  let romGlyph = '';
  const romBase = 0x003d6e + 0x52 * 0x1c;
  for (let i = 0; i < 32; i++) romGlyph += ROM[romBase + i].toString(16).padStart(2,'0') + ' ';
  console.log(`ROM glyph @0x${romBase.toString(16)}: ${romGlyph}`);
  const s = vramStats(mem);
  console.log(`nz=${s.nz} bbox rows ${s.minR}-${s.maxR} cols ${s.minC}-${s.maxC}`);
  console.log(`colors: ${[...s.colors.entries()].map(([k,v]) => '0x'+k.toString(16)+'×'+v).join(', ')}`);
  if (s.nz > 0 && s.nz < 1000) console.log(art(mem, s.minR, s.maxR, s.minC, s.maxC));
}

console.log('\n=== SCENARIO 2: 0x028f02 with HL="RADIAN" (full chain) ===');
{
  const { ex, cpu, mem } = fresh();
  setupDrawState(cpu, mem);
  cpu.hl = 0x029139;
  const r = ex.runFrom(0x028f02, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  console.log(`steps=${r.steps} term=${r.termination} lastPc=0x${r.lastPc.toString(16)}`);
  const s = vramStats(mem);
  console.log(`nz=${s.nz} bbox rows ${s.minR}-${s.maxR} cols ${s.minC}-${s.maxC}`);
  console.log(`colors: ${[...s.colors.entries()].map(([k,v]) => '0x'+k.toString(16)+'×'+v).join(', ')}`);
  if (s.nz > 0 && s.nz < 2000) console.log(art(mem, s.minR, s.maxR, s.minC, s.maxC));
}

console.log('\n=== SCENARIO 3: A=0x30..0x39 (digits) one fresh run each ===');
for (let ch = 0x30; ch <= 0x39; ch++) {
  const { ex, cpu, mem } = fresh();
  setupDrawState(cpu, mem);
  cpu.a = ch;
  const r = ex.runFrom(0x0a1799, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  const s = vramStats(mem);
  console.log(`'${String.fromCharCode(ch)}' (0x${ch.toString(16)}): nz=${s.nz} bbox r${s.minR}-${s.maxR} c${s.minC}-${s.maxC} colors=${[...s.colors.keys()].map(k=>'0x'+k.toString(16)).join(',')}`);
}

console.log('\n=== SCENARIO 4: write-order trace during 0x028f02 (RADIAN) ===');
{
  const { ex, cpu, mem } = fresh();
  setupDrawState(cpu, mem);
  cpu.hl = 0x029139;
  // Wrap write8 to log every VRAM write
  const writes = []; // [addr, value, step]
  let step = 0;
  const orig = cpu.write8.bind(cpu);
  cpu.write8 = function (a, v) {
    if (a >= 0xd40000 && a < 0xd40000 + 320 * 240 * 2) {
      writes.push([a - 0xd40000, v, step]);
    }
    return orig(a, v);
  };
  ex.runFrom(0x028f02, 'adl', { maxSteps: 50000, maxLoopIterations: 500, onBlock: () => step++ });
  // Find pixels written multiple times with different values (overwrite)
  const lastByAddr = new Map();
  let overwrites = 0;
  let same = 0;
  for (const [a, v] of writes) {
    if (lastByAddr.has(a)) {
      if (lastByAddr.get(a) !== v) overwrites++;
      else same++;
    }
    lastByAddr.set(a, v);
  }
  console.log(`total writes=${writes.length} unique addrs=${lastByAddr.size}`);
  console.log(`re-writes with DIFFERENT value (overwrite): ${overwrites}`);
  console.log(`re-writes with same value: ${same}`);
  // Histogram of values written
  const valHist = new Map();
  for (const [, v] of writes) valHist.set(v, (valHist.get(v) || 0) + 1);
  console.log(`value histogram: ${[...valHist.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>'0x'+k.toString(16)+'×'+v).join(', ')}`);
}

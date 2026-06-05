#!/usr/bin/env node
// Phase 520 — Decode 0x0A1799 font lookup internals
// Static disassembly (400 bytes) + dynamic trace (A=0x41, 800 steps)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FUNC = 0x0A1799;
const STATIC_LEN = 400;
const IY_BASE = 0xD00080;
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD3FFFF;
const VRAM_MIN = 0xD40000;
const VRAM_MAX = 0xD52BFF;
const FONT_ROM_MIN = 0x003D00;
const FONT_ROM_MAX = 0x004FFF;
const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16(offset) {
  return romBytes[offset] | (romBytes[offset + 1] << 8);
}

function u24(offset) {
  return romBytes[offset] | (romBytes[offset + 1] << 8) | (romBytes[offset + 2] << 16);
}

function bytesAt(addr, len) {
  return Array.from(romBytes.subarray(addr, addr + len), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function iyExpr(disp) {
  const absolute = IY_BASE + disp;
  const sign = disp < 0 ? '-' : '+';
  return `(IY${sign}${hex(Math.abs(disp), 2)}) ; ${hex(absolute)}`;
}

function annotateAddr(addr) {
  const notes = [];
  if (addr >= RAM_MIN && addr <= RAM_MAX) notes.push(`RAM ${hex(addr)}`);
  if (addr >= VRAM_MIN && addr <= VRAM_MAX) notes.push(`VRAM ${hex(addr)}`);
  if (addr >= FONT_ROM_MIN && addr <= FONT_ROM_MAX) notes.push(`FONT ROM ${hex(addr)}`);
  return notes;
}

function ramNote(addr) {
  if (addr >= RAM_MIN && addr <= RAM_MAX) return ` ; RAM ${hex(addr)}`;
  if (addr >= VRAM_MIN && addr <= VRAM_MAX) return ` ; VRAM ${hex(addr)}`;
  if (addr >= FONT_ROM_MIN && addr <= FONT_ROM_MAX) return ` ; FONT ROM ${hex(addr)}`;
  return '';
}

// ── Static decoder (eZ80 ADL mode: 3-byte addresses) ──

function decode(addr) {
  const op = romBytes[addr];
  const op2 = romBytes[addr + 1];

  // CALL / RET / JP / JR / DJNZ
  if (op === 0xCD) return { len: 4, text: `CALL ${hex(u24(addr + 1))}`, call: u24(addr + 1) };
  if (op === 0xC9) return { len: 1, text: 'RET', ret: true };
  if (op === 0xC0) return { len: 1, text: 'RET NZ', ret: true };
  if (op === 0xC8) return { len: 1, text: 'RET Z', ret: true };
  if (op === 0xD0) return { len: 1, text: 'RET NC', ret: true };
  if (op === 0xD8) return { len: 1, text: 'RET C', ret: true };
  if (op === 0xE0) return { len: 1, text: 'RET PO', ret: true };
  if (op === 0xE8) return { len: 1, text: 'RET PE', ret: true };
  if (op === 0xF0) return { len: 1, text: 'RET P', ret: true };
  if (op === 0xF8) return { len: 1, text: 'RET M', ret: true };

  if (op === 0xC3) return { len: 4, text: `JP ${hex(u24(addr + 1))}`, jp: u24(addr + 1) };
  if (op === 0xC2) return { len: 4, text: `JP NZ,${hex(u24(addr + 1))}`, jp: u24(addr + 1) };
  if (op === 0xCA) return { len: 4, text: `JP Z,${hex(u24(addr + 1))}`, jp: u24(addr + 1) };
  if (op === 0xD2) return { len: 4, text: `JP NC,${hex(u24(addr + 1))}`, jp: u24(addr + 1) };
  if (op === 0xDA) return { len: 4, text: `JP C,${hex(u24(addr + 1))}`, jp: u24(addr + 1) };
  if (op === 0xE9) return { len: 1, text: 'JP (HL)' };

  if (op === 0x18) return { len: 2, text: `JR ${hex(addr + 2 + signed8(op2))}`, branch: addr + 2 + signed8(op2) };
  if (op === 0x20) return { len: 2, text: `JR NZ,${hex(addr + 2 + signed8(op2))}`, branch: addr + 2 + signed8(op2) };
  if (op === 0x28) return { len: 2, text: `JR Z,${hex(addr + 2 + signed8(op2))}`, branch: addr + 2 + signed8(op2) };
  if (op === 0x30) return { len: 2, text: `JR NC,${hex(addr + 2 + signed8(op2))}`, branch: addr + 2 + signed8(op2) };
  if (op === 0x38) return { len: 2, text: `JR C,${hex(addr + 2 + signed8(op2))}`, branch: addr + 2 + signed8(op2) };
  if (op === 0x10) return { len: 2, text: `DJNZ ${hex(addr + 2 + signed8(op2))}`, branch: addr + 2 + signed8(op2) };

  // LD absolute (24-bit addresses)
  if (op === 0x3A) return { len: 4, text: `LD A,(${hex(u24(addr + 1))})${ramNote(u24(addr + 1))}`, ram: u24(addr + 1) };
  if (op === 0x32) return { len: 4, text: `LD (${hex(u24(addr + 1))}),A${ramNote(u24(addr + 1))}`, ram: u24(addr + 1) };
  if (op === 0x2A) return { len: 4, text: `LD HL,(${hex(u24(addr + 1))})${ramNote(u24(addr + 1))}`, ram: u24(addr + 1) };
  if (op === 0x22) return { len: 4, text: `LD (${hex(u24(addr + 1))}),HL${ramNote(u24(addr + 1))}`, ram: u24(addr + 1) };

  // ED-prefixed
  if (op === 0xED) {
    if (op2 === 0x4B) return { len: 5, text: `LD BC,(${hex(u24(addr + 2))})${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };
    if (op2 === 0x43) return { len: 5, text: `LD (${hex(u24(addr + 2))}),BC${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };
    if (op2 === 0x5B) return { len: 5, text: `LD DE,(${hex(u24(addr + 2))})${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };
    if (op2 === 0x53) return { len: 5, text: `LD (${hex(u24(addr + 2))}),DE${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };
    if (op2 === 0x7B) return { len: 5, text: `LD SP,(${hex(u24(addr + 2))})${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };
    if (op2 === 0x73) return { len: 5, text: `LD (${hex(u24(addr + 2))}),SP${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };
    if (op2 === 0xB0) return { len: 2, text: 'LDIR', bulk: true };
    if (op2 === 0xB8) return { len: 2, text: 'LDDR', bulk: true };
    if (op2 === 0xA0) return { len: 2, text: 'LDI' };
    if (op2 === 0xA8) return { len: 2, text: 'LDD' };
    if (op2 === 0x44) return { len: 2, text: 'NEG' };
    if (op2 === 0x45) return { len: 2, text: 'RETN', ret: true };
    if (op2 === 0x4D) return { len: 2, text: 'RETI', ret: true };
    if (op2 === 0x47) return { len: 2, text: 'LD I,A' };
    if (op2 === 0x4F) return { len: 2, text: 'LD R,A' };
    if (op2 === 0x57) return { len: 2, text: 'LD A,I' };
    if (op2 === 0x5F) return { len: 2, text: 'LD A,R' };
    if (op2 === 0x67) return { len: 2, text: 'RRD' };
    if (op2 === 0x6F) return { len: 2, text: 'RLD' };
    return { len: 2, text: `ED ${hex(op2, 2)}` };
  }

  // IY / IX prefix
  if (op === 0xFD || op === 0xDD) {
    const ixiy = op === 0xDD ? 'IX' : 'IY';
    const disp = signed8(romBytes[addr + 2]);

    // LD IY/IX,nn24
    if (op2 === 0x21) {
      const v = u24(addr + 2);
      return { len: 5, text: `LD ${ixiy},${hex(v)}${ramNote(v)}`, ram: v };
    }

    // IY/IX-relative load/store
    const iyRegs = {
      0x7E: 'LD A,', 0x77: 'LD ,A', 0x46: 'LD B,', 0x4E: 'LD C,',
      0x56: 'LD D,', 0x5E: 'LD E,', 0x66: 'LD H,', 0x6E: 'LD L,',
      0x70: 'LD ,B', 0x71: 'LD ,C', 0x72: 'LD ,D', 0x73: 'LD ,E',
      0x74: 'LD ,H', 0x75: 'LD ,L',
    };
    if (iyRegs[op2]) {
      const expr = op === 0xFD ? iyExpr(disp) : `(${ixiy}+${hex(Math.abs(disp), 2)})`;
      const txt = iyRegs[op2].includes(',A') || iyRegs[op2].includes(',B') || iyRegs[op2].includes(',C') || iyRegs[op2].includes(',D') || iyRegs[op2].includes(',E') || iyRegs[op2].includes(',H') || iyRegs[op2].includes(',L')
        ? `LD ${expr},${iyRegs[op2].split(',')[1]}` : `${iyRegs[op2]}${expr}`;
      return { len: 3, text: txt, iy: op === 0xFD ? disp : undefined };
    }
    if (op2 === 0x36) {
      const expr = op === 0xFD ? iyExpr(disp) : `(${ixiy}+${hex(Math.abs(disp), 2)})`;
      return { len: 4, text: `LD ${expr},${hex(romBytes[addr + 3], 2)}`, iy: op === 0xFD ? disp : undefined };
    }

    // IY/IX CB prefix (bit ops)
    if (op2 === 0xCB) {
      const bitOp = romBytes[addr + 3];
      const expr = op === 0xFD ? iyExpr(disp) : `(${ixiy}+${hex(Math.abs(disp), 2)})`;
      if ((bitOp & 0xC0) === 0x40) return { len: 4, text: `BIT ${(bitOp >> 3) & 7},${expr}`, iy: op === 0xFD ? disp : undefined };
      if ((bitOp & 0xC0) === 0x80) return { len: 4, text: `RES ${(bitOp >> 3) & 7},${expr}`, iy: op === 0xFD ? disp : undefined };
      if ((bitOp & 0xC0) === 0xC0) return { len: 4, text: `SET ${(bitOp >> 3) & 7},${expr}`, iy: op === 0xFD ? disp : undefined };
      const group = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][bitOp >> 3] ?? 'BITOP';
      return { len: 4, text: `${group} ${expr}`, iy: op === 0xFD ? disp : undefined };
    }

    // ADD IX/IY,rr
    if (op2 === 0x09) return { len: 2, text: `ADD ${ixiy},BC`, mult: true };
    if (op2 === 0x19) return { len: 2, text: `ADD ${ixiy},DE`, mult: true };
    if (op2 === 0x29) return { len: 2, text: `ADD ${ixiy},${ixiy}`, mult: true };
    if (op2 === 0x39) return { len: 2, text: `ADD ${ixiy},SP` };

    // PUSH/POP IX/IY
    if (op2 === 0xE5) return { len: 2, text: `PUSH ${ixiy}` };
    if (op2 === 0xE1) return { len: 2, text: `POP ${ixiy}` };
    // JP (IX/IY)
    if (op2 === 0xE9) return { len: 2, text: `JP (${ixiy})` };
    // INC/DEC IX/IY
    if (op2 === 0x23) return { len: 2, text: `INC ${ixiy}` };
    if (op2 === 0x2B) return { len: 2, text: `DEC ${ixiy}` };

    return { len: 2, text: `${ixiy}: DB ${hex(op2, 2)}` };
  }

  // CB prefix (bit/shift)
  if (op === 0xCB) {
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op2 & 7];
    if ((op2 & 0xC0) === 0x00) {
      const group = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][(op2 >> 3) & 7];
      return { len: 2, text: `${group} ${r}`, mult: group === 'SLA' || group === 'SLL' };
    }
    if ((op2 & 0xC0) === 0x40) return { len: 2, text: `BIT ${(op2 >> 3) & 7},${r}` };
    if ((op2 & 0xC0) === 0x80) return { len: 2, text: `RES ${(op2 >> 3) & 7},${r}` };
    if ((op2 & 0xC0) === 0xC0) return { len: 2, text: `SET ${(op2 >> 3) & 7},${r}` };
  }

  // LD r,r' and ALU r
  const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const dst = regNames[(op >> 3) & 7];
    const src = regNames[op & 7];
    return { len: 1, text: `LD ${dst},${src}` };
  }

  if (op >= 0x80 && op <= 0xBF) {
    const aluOps = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    const aluName = aluOps[(op >> 3) & 7];
    const src = regNames[op & 7];
    return { len: 1, text: `${aluName}${src}` };
  }

  // Common single-byte ops
  const oneByte = {
    0x00: 'NOP', 0x02: 'LD (BC),A', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B', 0x07: 'RLCA',
    0x08: "EX AF,AF'", 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)', 0x0B: 'DEC BC', 0x0C: 'INC C', 0x0D: 'DEC C', 0x0F: 'RRCA',
    0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D', 0x17: 'RLA',
    0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)', 0x1B: 'DEC DE', 0x1C: 'INC E', 0x1D: 'DEC E', 0x1F: 'RRA',
    0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA',
    0x29: 'ADD HL,HL', 0x2B: 'DEC HL', 0x2C: 'INC L', 0x2D: 'DEC L', 0x2F: 'CPL',
    0x33: 'INC SP', 0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x37: 'SCF',
    0x39: 'ADD HL,SP', 0x3B: 'DEC SP', 0x3C: 'INC A', 0x3D: 'DEC A', 0x3F: 'CCF',
    0x76: 'HALT',
    0xC1: 'POP BC', 0xC5: 'PUSH BC', 0xD1: 'POP DE', 0xD5: 'PUSH DE',
    0xD9: 'EXX', 0xE1: 'POP HL', 0xE3: 'EX (SP),HL', 0xE5: 'PUSH HL',
    0xEB: 'EX DE,HL', 0xF1: 'POP AF', 0xF3: 'DI', 0xF5: 'PUSH AF', 0xFB: 'EI',
  };
  if (oneByte[op]) {
    const t = oneByte[op];
    const isMult = (op === 0x29 || op === 0x09 || op === 0x19);
    return { len: 1, text: t, mult: isMult || undefined };
  }

  // LD reg,imm8
  const ldImm8 = { 0x06: 'B', 0x0E: 'C', 0x16: 'D', 0x1E: 'E', 0x26: 'H', 0x2E: 'L', 0x3E: 'A' };
  if (ldImm8[op]) return { len: 2, text: `LD ${ldImm8[op]},${hex(op2, 2)}` };
  if (op === 0x36) return { len: 2, text: `LD (HL),${hex(op2, 2)}` };

  // LD rr,imm24
  const ldImm24 = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
  if (ldImm24[op]) {
    const v = u24(addr + 1);
    return { len: 4, text: `LD ${ldImm24[op]},${hex(v)}${ramNote(v)}`, ram: v };
  }

  // ALU A,imm8
  const aluImm = { 0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A', 0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP' };
  if (aluImm[op]) return { len: 2, text: `${aluImm[op]},${hex(op2, 2)}` };

  // RST
  if ((op & 0xC7) === 0xC7) return { len: 1, text: `RST ${hex(op & 0x38, 2)}` };

  // OUT/IN
  if (op === 0xD3) return { len: 2, text: `OUT (${hex(op2, 2)}),A` };
  if (op === 0xDB) return { len: 2, text: `IN A,(${hex(op2, 2)})` };

  return { len: 1, text: `DB ${hex(op, 2)}` };
}

// ── PART 1: Static disassembly ──

function staticDisassembly() {
  console.log(`\n=== STATIC DISASSEMBLY ${hex(FUNC)} (${STATIC_LEN} bytes) ===`);
  console.log(`IY base assumed: ${hex(IY_BASE)}`);

  const calls = [];
  const jps = [];
  const ramAccesses = [];
  const iyOps = [];
  const multOps = [];
  const fontRomLoads = [];
  const vramAccesses = [];
  const bulkOps = [];
  const returns = [];

  const end = FUNC + STATIC_LEN;
  for (let pc = FUNC; pc < end;) {
    const ins = decode(pc);
    const line = `${hex(pc)}  ${bytesAt(pc, ins.len).padEnd(15)}  ${ins.text}`;
    console.log(line);

    if (ins.call !== undefined) calls.push({ pc, target: ins.call });
    if (ins.jp !== undefined) jps.push({ pc, target: ins.jp });
    if (ins.ret) returns.push({ pc, text: ins.text });

    // RAM / VRAM / font ROM
    if (ins.ram !== undefined) {
      if (ins.ram >= RAM_MIN && ins.ram <= RAM_MAX) ramAccesses.push({ pc, addr: ins.ram, text: ins.text });
      if (ins.ram >= VRAM_MIN && ins.ram <= VRAM_MAX) vramAccesses.push({ pc, addr: ins.ram, text: ins.text });
      if (ins.ram >= FONT_ROM_MIN && ins.ram <= FONT_ROM_MAX) fontRomLoads.push({ pc, addr: ins.ram, text: ins.text });
    }

    // IY-relative
    if (ins.iy !== undefined) iyOps.push({ pc, disp: ins.iy, text: ins.text });

    // Multiplication
    if (ins.mult) multOps.push({ pc, text: ins.text });

    // Bulk copy
    if (ins.bulk) bulkOps.push({ pc, text: ins.text });

    pc += ins.len;
  }

  console.log('\n--- CALL targets ---');
  for (const c of calls) console.log(`  ${hex(c.pc)}  CALL ${hex(c.target)}`);
  if (!calls.length) console.log('  (none)');

  console.log('\n--- JP targets ---');
  for (const j of jps) console.log(`  ${hex(j.pc)}  JP ${hex(j.target)}`);
  if (!jps.length) console.log('  (none)');

  console.log('\n--- RAM reads/writes (D00000-D3FFFF) ---');
  for (const r of ramAccesses) console.log(`  ${hex(r.pc)}  ${r.text}  addr=${hex(r.addr)}`);
  if (!ramAccesses.length) console.log('  (none)');

  console.log('\n--- IY-relative ops (IY base=${hex(IY_BASE)}) ---');
  for (const i of iyOps) console.log(`  ${hex(i.pc)}  ${i.text}  disp=${i.disp}  abs=${hex(IY_BASE + i.disp)}`);
  if (!iyOps.length) console.log('  (none)');

  console.log('\n--- Multiplication patterns (ADD HL,HL / SLA / etc.) ---');
  for (const m of multOps) console.log(`  ${hex(m.pc)}  ${m.text}`);
  if (!multOps.length) console.log('  (none)');

  console.log('\n--- Font ROM address loads (003D00-004FFF) ---');
  for (const f of fontRomLoads) console.log(`  ${hex(f.pc)}  ${f.text}  addr=${hex(f.addr)}`);
  if (!fontRomLoads.length) console.log('  (none)');

  console.log('\n--- VRAM address patterns (D40000-D52BFF) ---');
  for (const v of vramAccesses) console.log(`  ${hex(v.pc)}  ${v.text}  addr=${hex(v.addr)}`);
  if (!vramAccesses.length) console.log('  (none)');

  console.log('\n--- LDIR/LDDR (bulk copy) ---');
  for (const b of bulkOps) console.log(`  ${hex(b.pc)}  ${b.text}`);
  if (!bulkOps.length) console.log('  (none)');

  console.log('\n--- Return points ---');
  for (const r of returns) console.log(`  ${hex(r.pc)}  ${r.text}`);
  if (!returns.length) console.log('  (none)');

  return { calls, jps, ramAccesses, iyOps, multOps, fontRomLoads, vramAccesses, bulkOps };
}

// ── PART 2: Dynamic trace ──

async function dynamicTrace() {
  console.log('\n=== DYNAMIC TRACE ${hex(FUNC)} with A=0x41 ("A") ===');

  // Load transpiled ROM
  const transpiled = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = transpiled.PRELIFTED_BLOCKS;

  // Set up memory, peripherals, executor
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot (same pattern as phase99d)
  console.log('Cold booting...');
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log('Boot complete.');

  // Snapshot VRAM before call
  const vramBefore = new Uint8Array(mem.slice(VRAM_MIN, VRAM_MAX + 1));

  // Set up for 0x0A1799 call with A=0x41
  cpu.a = 0x41;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  // Push a return address onto the stack so RET terminates back to a known location
  const SENTINEL_RET = 0xFFFFF0; // unmapped, will cause missing_block => stops
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  mem[cpu.sp] = SENTINEL_RET & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL_RET >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL_RET >> 16) & 0xFF;

  console.log(`Entry: PC=${hex(FUNC)} A=${hex(cpu.a, 2)} SP=${hex(cpu.sp)} IY=${hex(cpu._iy)}`);

  // Trace blocks visited
  const blocksVisited = [];
  const blockSet = new Set();
  const regSnapshots = [];

  const traceResult = executor.runFrom(FUNC, 'adl', {
    maxSteps: 800,
    maxLoopIterations: 500,
    onBlock(pc, mode, meta, steps) {
      const key = `${hex(pc)}:${mode}`;
      if (!blockSet.has(key)) {
        blockSet.add(key);
        blocksVisited.push({ pc, mode, step: steps });
        // Snapshot registers at each new block
        regSnapshots.push({
          step: steps,
          pc,
          a: cpu.a,
          hl: cpu._hl,
          de: cpu._de,
          bc: cpu._bc,
          sp: cpu.sp,
          iy: cpu._iy,
          ix: cpu._ix,
        });
      }
    },
    onMissingBlock(pc, mode, steps) {
      console.log(`  [missing block at ${hex(pc)} mode=${mode} step=${steps}]`);
    },
  });

  console.log(`\nTrace result: steps=${traceResult.steps} termination=${traceResult.termination} lastPc=${hex(traceResult.lastPc)}`);

  // Report unique blocks
  console.log(`\n--- Unique blocks visited (${blocksVisited.length}) ---`);
  for (const b of blocksVisited) {
    console.log(`  step=${b.step}  ${hex(b.pc)}:${b.mode}`);
  }

  // Report register snapshots
  console.log(`\n--- Register snapshots at new blocks ---`);
  for (const s of regSnapshots) {
    console.log(`  step=${s.step} PC=${hex(s.pc)} A=${hex(s.a, 2)} HL=${hex(s.hl)} DE=${hex(s.de)} BC=${hex(s.bc)} SP=${hex(s.sp)} IY=${hex(s.iy)} IX=${hex(s.ix)}`);
  }

  // VRAM diff
  const vramWrites = [];
  for (let i = 0; i < vramBefore.length; i++) {
    const addr = VRAM_MIN + i;
    if (mem[addr] !== vramBefore[i]) {
      vramWrites.push({ addr, before: vramBefore[i], after: mem[addr] });
    }
  }

  console.log(`\n--- VRAM writes (${vramWrites.length} bytes changed) ---`);
  if (vramWrites.length > 0) {
    const firstAddr = vramWrites[0].addr;
    const lastAddr = vramWrites[vramWrites.length - 1].addr;
    console.log(`  Range: ${hex(firstAddr)} - ${hex(lastAddr)}`);

    // Show first 200 writes
    for (const w of vramWrites.slice(0, 200)) {
      console.log(`  ${hex(w.addr)}  ${hex(w.before, 2)} -> ${hex(w.after, 2)}`);
    }
    if (vramWrites.length > 200) console.log(`  ... and ${vramWrites.length - 200} more`);

    // Compute row distribution
    const rows = new Map();
    for (const w of vramWrites) {
      const row = Math.floor((w.addr - VRAM_MIN) / (320 * 2)); // 320 pixels * 2 bytes/pixel
      rows.set(row, (rows.get(row) ?? 0) + 1);
    }
    console.log(`\n  Row distribution:`);
    for (const [row, count] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    row ${row}: ${count} bytes`);
    }
  }

  // Font pointer detection: check HL/DE values in snapshots for font ROM range
  const fontHits = regSnapshots.filter(s =>
    (s.hl >= FONT_ROM_MIN && s.hl <= FONT_ROM_MAX) ||
    (s.de >= FONT_ROM_MIN && s.de <= FONT_ROM_MAX)
  );
  console.log(`\n--- Font ROM pointer observations ---`);
  if (fontHits.length) {
    for (const s of fontHits) {
      const parts = [];
      if (s.hl >= FONT_ROM_MIN && s.hl <= FONT_ROM_MAX) parts.push(`HL=${hex(s.hl)}`);
      if (s.de >= FONT_ROM_MIN && s.de <= FONT_ROM_MAX) parts.push(`DE=${hex(s.de)}`);
      console.log(`  step=${s.step} PC=${hex(s.pc)} ${parts.join(' ')}`);
    }
  } else {
    console.log('  (none in block-entry snapshots)');
  }

  return { vramWrites, blocksVisited, regSnapshots };
}

// ── PART 3: Summary ──

async function main() {
  console.log('=== Phase 520: Decode 0x0A1799 Font Lookup Internals ===');
  console.log(`ROM: ${romBytes.length} bytes`);

  const staticResult = staticDisassembly();
  const dynamicResult = await dynamicTrace();

  console.log('\n========================================');
  console.log('=== SUMMARY ===');
  console.log('========================================');

  // Font table base
  if (staticResult.fontRomLoads.length > 0) {
    console.log(`Font table base address: ${staticResult.fontRomLoads.map(f => hex(f.addr)).join(', ')}`);
  } else {
    console.log('Font table base address: not directly loaded in static window; likely passed in via register (check dynamic HL/DE)');
  }

  // Multiplication method
  if (staticResult.multOps.length > 0) {
    console.log(`Multiplication method: ${staticResult.multOps.map(m => `${hex(m.pc)} ${m.text}`).join('; ')}`);
  } else {
    console.log('Multiplication method: no ADD HL,HL / SLA patterns in static window; char*28 may be computed in caller');
  }

  // VRAM write pattern
  if (dynamicResult.vramWrites.length > 0) {
    const first = dynamicResult.vramWrites[0].addr;
    const last = dynamicResult.vramWrites[dynamicResult.vramWrites.length - 1].addr;
    const rows = new Set();
    for (const w of dynamicResult.vramWrites) {
      rows.add(Math.floor((w.addr - VRAM_MIN) / (320 * 2)));
    }
    console.log(`VRAM write pattern: ${dynamicResult.vramWrites.length} bytes across ${rows.size} rows, range ${hex(first)}-${hex(last)}`);
  } else {
    console.log('VRAM write pattern: no VRAM changes detected');
  }

  console.log(`Total VRAM bytes written: ${dynamicResult.vramWrites.length}`);
  console.log(`Unique blocks visited: ${dynamicResult.blocksVisited.length}`);
  console.log(`Trace steps: ${dynamicResult.blocksVisited.length > 0 ? dynamicResult.regSnapshots[dynamicResult.regSnapshots.length - 1]?.step ?? 'n/a' : 'n/a'}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

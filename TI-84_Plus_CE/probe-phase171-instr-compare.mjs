#!/usr/bin/env node

/**
 * Phase 171 - Instruction-Level Dynamic Comparison Probe
 *
 * For each block visited during gcd(12,8):
 * 1. Snapshot CPU state BEFORE the block runs
 * 2. Let the transpiled block execute normally
 * 3. Snapshot CPU state AFTER
 * 4. Re-run the same block from the pre-snapshot using a mini eZ80 interpreter
 * 5. Compare mini-interpreter output vs transpiled output
 * 6. Stop and report the first divergence with instruction-level detail
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const ROM_TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
  if (!fs.existsSync(ROM_TRANSPILED_GZ_PATH)) {
    throw new Error('ROM.transpiled.js and ROM.transpiled.js.gz both missing.');
  }
  console.log('ROM.transpiled.js not found — gunzipping...');
  const { execSync } = await import('node:child_process');
  execSync(`gunzip -kf "${ROM_TRANSPILED_GZ_PATH}"`, { stdio: 'inherit' });
  console.log('Gunzip done.');
}

const romBytes = fs.readFileSync(ROM_BIN_PATH);
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;

if (!BLOCKS) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

// ============================================================================
// Helpers
// ============================================================================

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const hexByte = (v) => (v & 0xff).toString(16).toUpperCase().padStart(2, '0');

function read24(mem, addr) {
  return (mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (b) => b & 0xff);
}

function formatBytes(bytes) {
  return bytes.map((b) => hexByte(b)).join(' ');
}

// ============================================================================
// CPU State snapshot / restore
// ============================================================================

function snapshotCpu(cpu) {
  return {
    a: cpu.a,
    f: cpu.f,
    _bc: cpu._bc,
    _de: cpu._de,
    _hl: cpu._hl,
    _a2: cpu._a2,
    _f2: cpu._f2,
    _bc2: cpu._bc2,
    _de2: cpu._de2,
    _hl2: cpu._hl2,
    sp: cpu.sp,
    _ix: cpu._ix,
    _iy: cpu._iy,
    pc: cpu.pc,
    madl: cpu.madl,
    mbase: cpu.mbase,
    i: cpu.i,
    im: cpu.im,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    halted: cpu.halted,
  };
}

function restoreCpu(cpu, snap) {
  cpu.a = snap.a;
  cpu.f = snap.f;
  cpu._bc = snap._bc;
  cpu._de = snap._de;
  cpu._hl = snap._hl;
  cpu._a2 = snap._a2;
  cpu._f2 = snap._f2;
  cpu._bc2 = snap._bc2;
  cpu._de2 = snap._de2;
  cpu._hl2 = snap._hl2;
  cpu.sp = snap.sp;
  cpu._ix = snap._ix;
  cpu._iy = snap._iy;
  cpu.pc = snap.pc;
  cpu.madl = snap.madl;
  cpu.mbase = snap.mbase;
  cpu.i = snap.i;
  cpu.im = snap.im;
  cpu.iff1 = snap.iff1;
  cpu.iff2 = snap.iff2;
  cpu.halted = snap.halted;
}

// Snapshot of key memory regions (registers + OP1 + OP2 + stack + errNo)
const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;
const ERR_NO_ADDR = 0xd008df;

function snapshotState(cpu, mem) {
  const cpuSnap = snapshotCpu(cpu);

  // Stack: top 12 bytes from sp
  const sp = cpu.sp & 0xffffff;
  const stackBytes = readBytes(mem, sp, 12);

  // Key memory
  const op1 = readBytes(mem, OP1_ADDR, 9);
  const op2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  return { cpu: cpuSnap, sp, stackBytes, op1, op2, errNo };
}

// ============================================================================
// Mini eZ80 Interpreter
// ============================================================================

// Parity helper (even parity = true)
function parity(v) {
  let b = v & 0xff;
  b ^= b >> 4;
  b ^= b >> 2;
  b ^= b >> 1;
  return (b & 1) === 0;
}

const FLAG_C  = 0x01;
const FLAG_N  = 0x02;
const FLAG_PV = 0x04;
const FLAG_X  = 0x08;
const FLAG_H  = 0x10;
const FLAG_Y  = 0x20;
const FLAG_Z  = 0x40;
const FLAG_S  = 0x80;

// A minimal CPU state object that mirrors the real CPU's register layout.
// We use an object-with-getters pattern matching cpu-runtime.js.
function makeMiniCpu(snap, mem) {
  const s = { ...snap }; // plain copy

  // Expose b,c,d,e,h,l as getters/setters on a proxy
  const cpu = {
    get a() { return s.a; },
    set a(v) { s.a = v & 0xff; },
    get f() { return s.f; },
    set f(v) { s.f = v & 0xff; },

    get _bc() { return s._bc; },
    set _bc(v) { s._bc = v & 0xffffff; },
    get _de() { return s._de; },
    set _de(v) { s._de = v & 0xffffff; },
    get _hl() { return s._hl; },
    set _hl(v) { s._hl = v & 0xffffff; },

    get b() { return (s._bc >> 8) & 0xff; },
    set b(v) { s._bc = (s._bc & 0xff00ff) | ((v & 0xff) << 8); },
    get c() { return s._bc & 0xff; },
    set c(v) { s._bc = (s._bc & 0xffff00) | (v & 0xff); },

    get d() { return (s._de >> 8) & 0xff; },
    set d(v) { s._de = (s._de & 0xff00ff) | ((v & 0xff) << 8); },
    get e() { return s._de & 0xff; },
    set e(v) { s._de = (s._de & 0xffff00) | (v & 0xff); },

    get h() { return (s._hl >> 8) & 0xff; },
    set h(v) { s._hl = (s._hl & 0xff00ff) | ((v & 0xff) << 8); },
    get l() { return s._hl & 0xff; },
    set l(v) { s._hl = (s._hl & 0xffff00) | (v & 0xff); },

    get bc() { return s._bc; },
    set bc(v) { s._bc = v & 0xffffff; },
    get de() { return s._de; },
    set de(v) { s._de = v & 0xffffff; },
    get hl() { return s._hl; },
    set hl(v) { s._hl = v & 0xffffff; },

    get af() { return (s.a << 8) | s.f; },
    set af(v) { s.a = (v >> 8) & 0xff; s.f = v & 0xff; },

    get _ix() { return s._ix; },
    set _ix(v) { s._ix = v & 0xffffff; },
    get ix() { return s._ix; },
    set ix(v) { s._ix = v & 0xffffff; },
    get ixh() { return (s._ix >> 8) & 0xff; },
    set ixh(v) { s._ix = (s._ix & 0xff00ff) | ((v & 0xff) << 8); },
    get ixl() { return s._ix & 0xff; },
    set ixl(v) { s._ix = (s._ix & 0xffff00) | (v & 0xff); },

    get _iy() { return s._iy; },
    set _iy(v) { s._iy = v & 0xffffff; },
    get iy() { return s._iy; },
    set iy(v) { s._iy = v & 0xffffff; },
    get iyh() { return (s._iy >> 8) & 0xff; },
    set iyh(v) { s._iy = (s._iy & 0xff00ff) | ((v & 0xff) << 8); },
    get iyl() { return s._iy & 0xff; },
    set iyl(v) { s._iy = (s._iy & 0xffff00) | (v & 0xff); },

    get sp() { return s.sp; },
    set sp(v) { s.sp = v & 0xffffff; },

    get madl() { return s.madl; },
    set madl(v) { s.madl = v; },

    get _a2() { return s._a2; },
    set _a2(v) { s._a2 = v; },
    get _f2() { return s._f2; },
    set _f2(v) { s._f2 = v; },
    get _bc2() { return s._bc2; },
    set _bc2(v) { s._bc2 = v; },
    get _de2() { return s._de2; },
    set _de2(v) { s._de2 = v; },
    get _hl2() { return s._hl2; },
    set _hl2(v) { s._hl2 = v; },

    // Memory access (directly uses shared mem array, but reads ROM OK / blocks ROM writes)
    read8(addr) { return mem[addr & 0xffffff] ?? 0; },
    write8(addr, value) {
      const a = addr & 0xffffff;
      if (a < 0x400000) return; // ROM write-protect
      mem[a] = value & 0xff;
    },
    read16(addr) {
      const a = addr & 0xffffff;
      return (mem[a] & 0xff) | ((mem[a + 1] & 0xff) << 8);
    },
    read24(addr) {
      const a = addr & 0xffffff;
      return (mem[a] & 0xff) | ((mem[a + 1] & 0xff) << 8) | ((mem[a + 2] & 0xff) << 16);
    },
    write24(addr, value) {
      const a = addr & 0xffffff;
      if (a < 0x400000) return;
      mem[a] = value & 0xff;
      mem[a + 1] = (value >>> 8) & 0xff;
      mem[a + 2] = (value >>> 16) & 0xff;
    },
  };

  // Flag helpers
  cpu.getF = (flag) => (s.f & flag) !== 0;
  cpu.setF = (flag, val) => {
    if (val) s.f |= flag;
    else s.f &= ~flag;
  };

  // _szFlags helper
  cpu.szFlags = (result) => {
    cpu.setF(FLAG_S, result & 0x80);
    cpu.setF(FLAG_Z, (result & 0xff) === 0);
    cpu.setF(FLAG_X, result & FLAG_X);
    cpu.setF(FLAG_Y, result & FLAG_Y);
  };

  // 8-bit ALU
  cpu.add8 = (a, b) => {
    const r = a + b;
    cpu.szFlags(r);
    cpu.setF(FLAG_H, ((a ^ b ^ r) & 0x10) !== 0);
    cpu.setF(FLAG_PV, ((a ^ r) & (b ^ r) & 0x80) !== 0);
    cpu.setF(FLAG_N, false);
    cpu.setF(FLAG_C, r > 0xff);
    return r & 0xff;
  };

  cpu.sub8 = (a, b) => {
    const r = a - b;
    cpu.szFlags(r);
    cpu.setF(FLAG_H, ((a ^ b ^ r) & 0x10) !== 0);
    cpu.setF(FLAG_PV, ((a ^ b) & (a ^ r) & 0x80) !== 0);
    cpu.setF(FLAG_N, true);
    cpu.setF(FLAG_C, r < 0);
    return r & 0xff;
  };

  cpu.adc8 = (a, b) => {
    const c = cpu.getF(FLAG_C) ? 1 : 0;
    const r = a + b + c;
    cpu.szFlags(r);
    cpu.setF(FLAG_H, ((a ^ b ^ r) & 0x10) !== 0);
    cpu.setF(FLAG_PV, ((a ^ r) & (b ^ r) & 0x80) !== 0);
    cpu.setF(FLAG_N, false);
    cpu.setF(FLAG_C, r > 0xff);
    return r & 0xff;
  };

  cpu.sbc8 = (a, b) => {
    const c = cpu.getF(FLAG_C) ? 1 : 0;
    const r = a - b - c;
    cpu.szFlags(r);
    cpu.setF(FLAG_H, ((a ^ b ^ r) & 0x10) !== 0);
    cpu.setF(FLAG_PV, ((a ^ b) & (a ^ r) & 0x80) !== 0);
    cpu.setF(FLAG_N, true);
    cpu.setF(FLAG_C, r < 0);
    return r & 0xff;
  };

  cpu.and8 = (a, b) => {
    const r = a & b;
    cpu.szFlags(r);
    cpu.setF(FLAG_H, true);
    cpu.setF(FLAG_PV, parity(r));
    cpu.setF(FLAG_N, false);
    cpu.setF(FLAG_C, false);
    return r;
  };

  cpu.or8 = (a, b) => {
    const r = a | b;
    cpu.szFlags(r);
    cpu.setF(FLAG_H, false);
    cpu.setF(FLAG_PV, parity(r));
    cpu.setF(FLAG_N, false);
    cpu.setF(FLAG_C, false);
    return r;
  };

  cpu.xor8 = (a, b) => {
    const r = a ^ b;
    cpu.szFlags(r);
    cpu.setF(FLAG_H, false);
    cpu.setF(FLAG_PV, parity(r));
    cpu.setF(FLAG_N, false);
    cpu.setF(FLAG_C, false);
    return r;
  };

  cpu.cp8 = (a, b) => {
    cpu.sub8(a, b); // flags only
  };

  cpu.inc8 = (v) => {
    const r = (v + 1) & 0xff;
    cpu.szFlags(r);
    cpu.setF(FLAG_H, (v & 0x0f) === 0x0f);
    cpu.setF(FLAG_PV, v === 0x7f);
    cpu.setF(FLAG_N, false);
    // C preserved
    return r;
  };

  cpu.dec8 = (v) => {
    const r = (v - 1) & 0xff;
    cpu.szFlags(r);
    cpu.setF(FLAG_H, (v & 0x0f) === 0x00);
    cpu.setF(FLAG_PV, v === 0x80);
    cpu.setF(FLAG_N, true);
    // C preserved
    return r;
  };

  cpu.neg8 = (v) => cpu.sub8(0, v);

  // 24-bit add (ADD HL/IX/IY, rr) — only updates H, N, C (not S, Z, PV)
  cpu.addPair = (a, b) => {
    const r = a + b;
    cpu.setF(FLAG_H, ((a ^ b ^ r) & 0x1000) !== 0);
    cpu.setF(FLAG_N, false);
    cpu.setF(FLAG_C, r > 0xffffff);
    return r & 0xffffff;
  };

  // Rotate/shift
  cpu.rotShift8 = (op, v) => {
    let r;
    switch (op) {
      case 'rlc': { const b7 = (v >> 7) & 1; r = ((v << 1) | b7) & 0xff; cpu.setF(FLAG_C, b7); break; }
      case 'rrc': { const b0 = v & 1; r = ((v >> 1) | (b0 << 7)) & 0xff; cpu.setF(FLAG_C, b0); break; }
      case 'rl':  { const oc = cpu.getF(FLAG_C) ? 1 : 0; r = ((v << 1) | oc) & 0xff; cpu.setF(FLAG_C, (v >> 7) & 1); break; }
      case 'rr':  { const oc = cpu.getF(FLAG_C) ? 1 : 0; r = ((v >> 1) | (oc << 7)) & 0xff; cpu.setF(FLAG_C, v & 1); break; }
      case 'sla': { r = (v << 1) & 0xff; cpu.setF(FLAG_C, (v >> 7) & 1); break; }
      case 'sra': { r = ((v >> 1) | (v & 0x80)) & 0xff; cpu.setF(FLAG_C, v & 1); break; }
      case 'srl': { r = (v >> 1) & 0xff; cpu.setF(FLAG_C, v & 1); break; }
      case 'sll': { r = ((v << 1) | 1) & 0xff; cpu.setF(FLAG_C, (v >> 7) & 1); break; }
      default: r = v;
    }
    cpu.szFlags(r);
    cpu.setF(FLAG_H, false);
    cpu.setF(FLAG_N, false);
    cpu.setF(FLAG_PV, parity(r));
    return r;
  };

  // PUSH/POP (24-bit in ADL mode)
  cpu.push24 = (val) => {
    s.sp = (s.sp - 3) & 0xffffff;
    cpu.write24(s.sp, val);
  };
  cpu.pop24 = () => {
    const val = cpu.read24(s.sp);
    s.sp = (s.sp + 3) & 0xffffff;
    return val;
  };

  // BIT test
  cpu.bit = (v, bit) => {
    const r = v & (1 << bit);
    cpu.setF(FLAG_Z, r === 0);
    cpu.setF(FLAG_PV, r === 0); // PV mirrors Z
    cpu.setF(FLAG_S, bit === 7 && r !== 0);
    cpu.setF(FLAG_H, true);
    cpu.setF(FLAG_N, false);
  };

  // RLD: A hi nibble rotated out, (HL) nibbles shift left, A lo nibble → (HL) lo
  cpu.rld = () => {
    const memVal = cpu.read8(s._hl);
    const newMem = ((memVal << 4) | (s.a & 0x0f)) & 0xff;
    s.a = (s.a & 0xf0) | ((memVal >> 4) & 0x0f);
    cpu.write8(s._hl, newMem);
    cpu.szFlags(s.a);
    cpu.setF(FLAG_H, false);
    cpu.setF(FLAG_PV, parity(s.a));
    cpu.setF(FLAG_N, false);
  };

  // RRD
  cpu.rrd = () => {
    const memVal = cpu.read8(s._hl);
    const newMem = ((s.a << 4) | ((memVal >> 4) & 0x0f)) & 0xff;
    s.a = (s.a & 0xf0) | (memVal & 0x0f);
    cpu.write8(s._hl, newMem);
    cpu.szFlags(s.a);
    cpu.setF(FLAG_H, false);
    cpu.setF(FLAG_PV, parity(s.a));
    cpu.setF(FLAG_N, false);
  };

  // LDI / LDIR
  cpu.ldi = () => {
    cpu.write8(s._de, cpu.read8(s._hl));
    s._hl = (s._hl + 1) & 0xffffff;
    s._de = (s._de + 1) & 0xffffff;
    s._bc = (s._bc - 1) & 0xffffff;
    cpu.setF(FLAG_H, false);
    cpu.setF(FLAG_PV, s._bc !== 0);
    cpu.setF(FLAG_N, false);
  };

  cpu.ldir = () => {
    do { cpu.ldi(); } while (s._bc !== 0);
  };

  // LDD / LDDR
  cpu.ldd = () => {
    cpu.write8(s._de, cpu.read8(s._hl));
    s._hl = (s._hl - 1) & 0xffffff;
    s._de = (s._de - 1) & 0xffffff;
    s._bc = (s._bc - 1) & 0xffffff;
    cpu.setF(FLAG_H, false);
    cpu.setF(FLAG_PV, s._bc !== 0);
    cpu.setF(FLAG_N, false);
  };

  cpu.lddr = () => {
    do { cpu.ldd(); } while (s._bc !== 0);
  };

  // Condition check
  cpu.cond = (c) => {
    switch (c) {
      case 'z':  return cpu.getF(FLAG_Z);
      case 'nz': return !cpu.getF(FLAG_Z);
      case 'c':  return cpu.getF(FLAG_C);
      case 'nc': return !cpu.getF(FLAG_C);
      case 'pe': return cpu.getF(FLAG_PV);
      case 'po': return !cpu.getF(FLAG_PV);
      case 'm':  return cpu.getF(FLAG_S);
      case 'p':  return !cpu.getF(FLAG_S);
      default: return false;
    }
  };

  // Get 8-bit reg by name (supports '(hl)' as memory read)
  cpu.getReg8 = (name) => {
    switch (name) {
      case 'a': return s.a;
      case 'b': return (s._bc >> 8) & 0xff;
      case 'c': return s._bc & 0xff;
      case 'd': return (s._de >> 8) & 0xff;
      case 'e': return s._de & 0xff;
      case 'h': return (s._hl >> 8) & 0xff;
      case 'l': return s._hl & 0xff;
      case '(hl)': return mem[s._hl & 0xffffff] & 0xff; // memory read
      case 'ixh': return (s._ix >> 8) & 0xff;
      case 'ixl': return s._ix & 0xff;
      case 'iyh': return (s._iy >> 8) & 0xff;
      case 'iyl': return s._iy & 0xff;
      default: throw new Error(`Unknown 8-bit reg: ${name}`);
    }
  };

  cpu.setReg8 = (name, v) => {
    const b = v & 0xff;
    switch (name) {
      case 'a':    s.a = b; return;
      case 'b':    s._bc = (s._bc & 0xff00ff) | (b << 8); return;
      case 'c':    s._bc = (s._bc & 0xffff00) | b; return;
      case 'd':    s._de = (s._de & 0xff00ff) | (b << 8); return;
      case 'e':    s._de = (s._de & 0xffff00) | b; return;
      case 'h':    s._hl = (s._hl & 0xff00ff) | (b << 8); return;
      case 'l':    s._hl = (s._hl & 0xffff00) | b; return;
      case '(hl)': mem[s._hl & 0xffffff] = b; return; // memory write (via mini mem)
      case 'ixh':  s._ix = (s._ix & 0xff00ff) | (b << 8); return;
      case 'ixl':  s._ix = (s._ix & 0xffff00) | b; return;
      case 'iyh':  s._iy = (s._iy & 0xff00ff) | (b << 8); return;
      case 'iyl':  s._iy = (s._iy & 0xffff00) | b; return;
      default: throw new Error(`Unknown 8-bit reg: ${name}`);
    }
  };

  // Get 24-bit pair by name
  cpu.getPair = (name) => {
    switch (name) {
      case 'bc': return s._bc;
      case 'de': return s._de;
      case 'hl': return s._hl;
      case 'sp': return s.sp;
      case 'ix': return s._ix;
      case 'iy': return s._iy;
      case 'af': return (s.a << 8) | s.f;
      default: throw new Error(`Unknown pair: ${name}`);
    }
  };

  cpu.setPair = (name, v) => {
    const w = v & 0xffffff;
    switch (name) {
      case 'bc': s._bc = w; return;
      case 'de': s._de = w; return;
      case 'hl': s._hl = w; return;
      case 'sp': s.sp = w; return;
      case 'ix': s._ix = w; return;
      case 'iy': s._iy = w; return;
      case 'af': s.a = (w >> 8) & 0xff; s.f = w & 0xff; return;
      default: throw new Error(`Unknown pair: ${name}`);
    }
  };

  // Expose inner state for comparison
  cpu._state = s;
  return cpu;
}

// ============================================================================
// Mini interpreter: executes decoded instructions on a mini CPU
// Returns: { ok: true, pc: finalPc } or { ok: false, reason, instr }
// ============================================================================

function execInstr(instr, cpu) {
  const { tag } = instr;

  switch (tag) {
    case 'nop':
      return true;

    case 'halt':
      return true; // treat as NOP for comparison

    case 'di':
    case 'ei':
    case 'im':
      return true; // interrupt-mode instructions don't affect registers we compare

    case 'ld-reg-reg': {
      const val = cpu.getReg8(instr.src);
      cpu.setReg8(instr.dest, val);
      return true;
    }

    case 'ld-reg-imm':
      cpu.setReg8(instr.dest, instr.value);
      return true;

    case 'ld-reg-ind': {
      // LD r, (pair)
      const addr = cpu.getPair(instr.src);
      const val = cpu.read8(addr);
      cpu.setReg8(instr.dest, val);
      return true;
    }

    case 'ld-ind-reg': {
      // LD (pair), r
      const addr = cpu.getPair(instr.dest);
      const val = cpu.getReg8(instr.src);
      cpu.write8(addr, val);
      return true;
    }

    case 'ld-ind-imm': {
      // LD (HL), n
      cpu.write8(cpu.getPair('hl'), instr.value);
      return true;
    }

    case 'ld-reg-ixd': {
      // LD r, (IX/IY+d)
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.setReg8(instr.dest, cpu.read8(addr));
      return true;
    }

    case 'ld-ixd-reg': {
      // LD (IX/IY+d), r
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, cpu.getReg8(instr.src));
      return true;
    }

    case 'ld-ixd-imm': {
      // LD (IX/IY+d), n
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, instr.value);
      return true;
    }

    case 'ld-pair-imm':
      cpu.setPair(instr.pair, instr.value);
      return true;

    case 'ld-pair-mem': {
      // LD pair, (nn)
      const val = cpu.read24(instr.addr);
      cpu.setPair(instr.pair, val);
      return true;
    }

    case 'ld-mem-pair': {
      // LD (nn), pair
      cpu.write24(instr.addr, cpu.getPair(instr.pair));
      return true;
    }

    case 'ld-reg-mem': {
      // LD A, (nn)
      cpu.setReg8(instr.dest, cpu.read8(instr.addr));
      return true;
    }

    case 'ld-mem-reg': {
      // LD (nn), A
      cpu.write8(instr.addr, cpu.getReg8(instr.src));
      return true;
    }

    case 'ld-sp-hl':
      cpu.setPair('sp', cpu.getPair('hl'));
      return true;

    case 'ld-sp-pair':
      cpu.setPair('sp', cpu.getPair(instr.pair));
      return true;

    case 'ld-pair-indexed': {
      // LD pair, (IX/IY+d) — eZ80 24-bit
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.setPair(instr.pair, cpu.read24(addr));
      return true;
    }

    case 'ld-indexed-pair': {
      // LD (IX/IY+d), pair — eZ80 24-bit
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write24(addr, cpu.getPair(instr.pair));
      return true;
    }

    case 'ld-pair-ind': {
      // LD pair, (HL) — eZ80 ED 07/17/27/31/37
      const addr = cpu.getPair(instr.src);
      cpu.setPair(instr.pair, cpu.read24(addr));
      return true;
    }

    case 'ld-ind-pair': {
      // LD (HL), pair — eZ80 ED 0F/1F/2F/3E/3F
      const addr = cpu.getPair(instr.dest);
      cpu.write24(addr, cpu.getPair(instr.pair));
      return true;
    }

    case 'ld-ixiy-indexed': {
      // LD IX/IY, (IX/IY+d)
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.setPair(instr.dest, cpu.read24(addr));
      return true;
    }

    case 'ld-indexed-ixiy': {
      // LD (IX/IY+d), IX/IY
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write24(addr, cpu.getPair(instr.src));
      return true;
    }

    case 'ld-special':
      // LD I,A / LD R,A / LD A,I / LD A,R
      if (instr.dest === 'i') {
        cpu._state.i = cpu._state.a;
      } else if (instr.dest === 'r') {
        // R register (memory refresh) — we don't track it, skip
      } else if (instr.src === 'i') {
        // LD A, I: A = I, flags updated
        cpu._state.a = cpu._state.i & 0xff;
        cpu.szFlags(cpu._state.a);
        cpu.setF(FLAG_H, false);
        cpu.setF(FLAG_N, false);
        cpu.setF(FLAG_PV, cpu._state.iff2 ? 1 : 0); // PV = IFF2
      } else if (instr.src === 'r') {
        // LD A, R: A = R, flags updated (R not tracked, use 0)
        cpu._state.a = 0;
        cpu.szFlags(0);
        cpu.setF(FLAG_H, false);
        cpu.setF(FLAG_N, false);
        cpu.setF(FLAG_PV, cpu._state.iff2 ? 1 : 0);
      }
      return true;

    case 'ld-mb-a':
      // LD MB, A — MBASE
      cpu._state.mbase = cpu._state.a;
      return true;

    case 'ld-a-mb':
      cpu._state.a = cpu._state.mbase & 0xff;
      return true;

    case 'push': {
      const val = cpu.getPair(instr.pair);
      cpu.push24(val);
      return true;
    }

    case 'pop': {
      const val = cpu.pop24();
      cpu.setPair(instr.pair, val);
      return true;
    }

    case 'ex-af': {
      const tmpA = cpu._state.a, tmpF = cpu._state.f;
      cpu._state.a = cpu._state._a2; cpu._state.f = cpu._state._f2;
      cpu._state._a2 = tmpA; cpu._state._f2 = tmpF;
      return true;
    }

    case 'exx': {
      let t;
      t = cpu._state._bc; cpu._state._bc = cpu._state._bc2; cpu._state._bc2 = t;
      t = cpu._state._de; cpu._state._de = cpu._state._de2; cpu._state._de2 = t;
      t = cpu._state._hl; cpu._state._hl = cpu._state._hl2; cpu._state._hl2 = t;
      return true;
    }

    case 'ex-de-hl': {
      const t = cpu._state._de;
      cpu._state._de = cpu._state._hl;
      cpu._state._hl = t;
      return true;
    }

    case 'ex-sp-hl': {
      const sp = cpu._state.sp;
      const memVal = cpu.read24(sp);
      cpu.write24(sp, cpu._state._hl);
      cpu._state._hl = memVal;
      return true;
    }

    case 'ex-sp-pair': {
      // EX (SP), IX/IY
      const sp = cpu._state.sp;
      const memVal = cpu.read24(sp);
      cpu.write24(sp, cpu.getPair(instr.pair));
      cpu.setPair(instr.pair, memVal);
      return true;
    }

    case 'inc-reg': {
      const v = cpu.getReg8(instr.reg);
      cpu.setReg8(instr.reg, cpu.inc8(v));
      return true;
    }

    case 'dec-reg': {
      const v = cpu.getReg8(instr.reg);
      cpu.setReg8(instr.reg, cpu.dec8(v));
      return true;
    }

    case 'inc-pair': {
      const v = (cpu.getPair(instr.pair) + 1) & 0xffffff;
      cpu.setPair(instr.pair, v);
      return true; // no flag change
    }

    case 'dec-pair': {
      const v = (cpu.getPair(instr.pair) - 1) & 0xffffff;
      cpu.setPair(instr.pair, v);
      return true; // no flag change
    }

    case 'inc-ixd': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      const v = cpu.read8(addr);
      cpu.write8(addr, cpu.inc8(v));
      return true;
    }

    case 'dec-ixd': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      const v = cpu.read8(addr);
      cpu.write8(addr, cpu.dec8(v));
      return true;
    }

    case 'alu-reg': {
      const src = cpu.getReg8(instr.src);
      const a = cpu._state.a;
      switch (instr.op) {
        case 'add': cpu._state.a = cpu.add8(a, src); break;
        case 'adc': cpu._state.a = cpu.adc8(a, src); break;
        case 'sub': cpu._state.a = cpu.sub8(a, src); break;
        case 'sbc': cpu._state.a = cpu.sbc8(a, src); break;
        case 'and': cpu._state.a = cpu.and8(a, src); break;
        case 'or':  cpu._state.a = cpu.or8(a, src); break;
        case 'xor': cpu._state.a = cpu.xor8(a, src); break;
        case 'cp':  cpu.cp8(a, src); break;
        default: return false;
      }
      return true;
    }

    case 'alu-imm': {
      const src = instr.value;
      const a = cpu._state.a;
      switch (instr.op) {
        case 'add': cpu._state.a = cpu.add8(a, src); break;
        case 'adc': cpu._state.a = cpu.adc8(a, src); break;
        case 'sub': cpu._state.a = cpu.sub8(a, src); break;
        case 'sbc': cpu._state.a = cpu.sbc8(a, src); break;
        case 'and': cpu._state.a = cpu.and8(a, src); break;
        case 'or':  cpu._state.a = cpu.or8(a, src); break;
        case 'xor': cpu._state.a = cpu.xor8(a, src); break;
        case 'cp':  cpu.cp8(a, src); break;
        default: return false;
      }
      return true;
    }

    case 'alu-ixd': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      const src = cpu.read8(addr);
      const a = cpu._state.a;
      switch (instr.op) {
        case 'add': cpu._state.a = cpu.add8(a, src); break;
        case 'adc': cpu._state.a = cpu.adc8(a, src); break;
        case 'sub': cpu._state.a = cpu.sub8(a, src); break;
        case 'sbc': cpu._state.a = cpu.sbc8(a, src); break;
        case 'and': cpu._state.a = cpu.and8(a, src); break;
        case 'or':  cpu._state.a = cpu.or8(a, src); break;
        case 'xor': cpu._state.a = cpu.xor8(a, src); break;
        case 'cp':  cpu.cp8(a, src); break;
        default: return false;
      }
      return true;
    }

    case 'neg':
      cpu._state.a = cpu.neg8(cpu._state.a);
      return true;

    case 'cpl':
      cpu._state.a = (~cpu._state.a) & 0xff;
      cpu.setF(FLAG_H, true);
      cpu.setF(FLAG_N, true);
      return true;

    case 'scf':
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, true);
      return true;

    case 'ccf':
      cpu.setF(FLAG_H, cpu.getF(FLAG_C));
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, !cpu.getF(FLAG_C));
      return true;

    case 'add-pair': {
      // ADD dest, src (HL/IX/IY + rr)
      const a = cpu.getPair(instr.dest);
      const b = cpu.getPair(instr.src);
      cpu.setPair(instr.dest, cpu.addPair(a, b));
      return true;
    }

    case 'sbc-pair': {
      // SBC HL, rr
      const hl = cpu.getPair('hl');
      const rr = cpu.getPair(instr.src);
      const c = cpu.getF(FLAG_C) ? 1 : 0;
      const r = hl - rr - c;
      const r16 = r & 0xffff;
      cpu.setF(FLAG_S, r16 & 0x8000);
      cpu.setF(FLAG_Z, r16 === 0);
      cpu.setF(FLAG_H, ((hl ^ rr ^ r) & 0x1000) !== 0);
      cpu.setF(FLAG_PV, ((hl ^ rr) & (hl ^ r) & 0x8000) !== 0);
      cpu.setF(FLAG_N, true);
      cpu.setF(FLAG_C, r < 0);
      cpu.setPair('hl', r & 0xffffff);
      return true;
    }

    case 'adc-pair': {
      // ADC HL, rr
      const hl = cpu.getPair('hl');
      const rr = cpu.getPair(instr.src);
      const c = cpu.getF(FLAG_C) ? 1 : 0;
      const r = hl + rr + c;
      const r16 = r & 0xffff;
      cpu.setF(FLAG_S, r16 & 0x8000);
      cpu.setF(FLAG_Z, r16 === 0);
      cpu.setF(FLAG_H, ((hl ^ rr ^ r) & 0x1000) !== 0);
      cpu.setF(FLAG_PV, ((hl ^ r) & (rr ^ r) & 0x8000) !== 0);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, r > 0xffff);
      cpu.setPair('hl', r & 0xffffff);
      return true;
    }

    case 'rotate-reg': {
      const v = cpu.getReg8(instr.reg);
      cpu.setReg8(instr.reg, cpu.rotShift8(instr.op, v));
      return true;
    }

    case 'rotate-ind': {
      // rotate (HL)
      const addr = cpu.getPair(instr.indirectRegister);
      const v = cpu.read8(addr);
      cpu.write8(addr, cpu.rotShift8(instr.op, v));
      return true;
    }

    case 'indexed-cb-rotate': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      const v = cpu.read8(addr);
      cpu.write8(addr, cpu.rotShift8(instr.operation, v));
      return true;
    }

    case 'rlca': {
      const b7 = (cpu._state.a >> 7) & 1;
      cpu._state.a = ((cpu._state.a << 1) | b7) & 0xff;
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, b7);
      return true;
    }

    case 'rrca': {
      const b0 = cpu._state.a & 1;
      cpu._state.a = ((cpu._state.a >> 1) | (b0 << 7)) & 0xff;
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, b0);
      return true;
    }

    case 'rla': {
      const oc = cpu.getF(FLAG_C) ? 1 : 0;
      const b7 = (cpu._state.a >> 7) & 1;
      cpu._state.a = ((cpu._state.a << 1) | oc) & 0xff;
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, b7);
      return true;
    }

    case 'rra': {
      const oc = cpu.getF(FLAG_C) ? 1 : 0;
      const b0 = cpu._state.a & 1;
      cpu._state.a = ((cpu._state.a >> 1) | (oc << 7)) & 0xff;
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, b0);
      return true;
    }

    case 'bit-test': {
      cpu.bit(cpu.getReg8(instr.reg), instr.bit);
      return true;
    }

    case 'bit-test-ind': {
      const addr = cpu.getPair(instr.indirectRegister);
      cpu.bit(cpu.read8(addr), instr.bit);
      return true;
    }

    case 'indexed-cb-bit': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.bit(cpu.read8(addr), instr.bit);
      return true;
    }

    case 'bit-res': {
      const v = cpu.getReg8(instr.reg) & ~(1 << instr.bit);
      cpu.setReg8(instr.reg, v);
      return true;
    }

    case 'bit-res-ind': {
      const addr = cpu.getPair(instr.indirectRegister);
      cpu.write8(addr, cpu.read8(addr) & ~(1 << instr.bit));
      return true;
    }

    case 'indexed-cb-res': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, cpu.read8(addr) & ~(1 << instr.bit));
      return true;
    }

    case 'bit-set': {
      cpu.setReg8(instr.reg, cpu.getReg8(instr.reg) | (1 << instr.bit));
      return true;
    }

    case 'bit-set-ind': {
      const addr = cpu.getPair(instr.indirectRegister);
      cpu.write8(addr, cpu.read8(addr) | (1 << instr.bit));
      return true;
    }

    case 'indexed-cb-set': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, cpu.read8(addr) | (1 << instr.bit));
      return true;
    }

    case 'rld':
      cpu.rld();
      return true;

    case 'rrd':
      cpu.rrd();
      return true;

    case 'ldi':
      cpu.ldi();
      return true;

    case 'ldir':
      cpu.ldir();
      return true;

    case 'ldd':
      cpu.ldd();
      return true;

    case 'lddr':
      cpu.lddr();
      return true;

    case 'daa': {
      // Decimal adjust — complex but important
      const a = cpu._state.a;
      let r = a;
      let correction = 0;
      if (cpu.getF(FLAG_H) || (!cpu.getF(FLAG_N) && (r & 0x0f) > 9)) correction |= 0x06;
      if (cpu.getF(FLAG_C) || (!cpu.getF(FLAG_N) && r > 0x99)) {
        correction |= 0x60;
        cpu.setF(FLAG_C, true);
      }
      if (cpu.getF(FLAG_N)) r = (r - correction) & 0xff;
      else r = (r + correction) & 0xff;
      cpu.setF(FLAG_S, r & 0x80);
      cpu.setF(FLAG_Z, r === 0);
      cpu.setF(FLAG_H, ((a ^ r) & 0x10) !== 0);
      cpu.setF(FLAG_PV, parity(r));
      cpu._state.a = r;
      return true;
    }

    case 'lea': {
      // LEA dest, base+d
      const base = cpu.getPair(instr.base);
      cpu.setPair(instr.dest, (base + instr.displacement) & 0xffffff);
      return true;
    }

    // Control flow — we simulate the SIDE EFFECTS that affect state (SP, mem)
    // but signal termination so the block runner stops here.

    case 'ret':
    case 'retn':
    case 'reti':
      // RET pops 3 bytes from stack (ADL mode)
      cpu.pop24();
      return 'terminate';

    case 'ret-conditional': {
      // RET cc — only pops if condition met
      if (cpu.cond(instr.condition)) {
        cpu.pop24();
      }
      return 'terminate';
    }

    case 'call': {
      // CALL nn — push return addr, jump (we don't follow, just record SP change)
      cpu.push24(instr.fallthrough);
      return 'terminate';
    }

    case 'call-conditional': {
      // CALL cc, nn — conditional push
      if (cpu.cond(instr.condition)) {
        cpu.push24(instr.fallthrough);
      }
      return 'terminate';
    }

    case 'rst': {
      // RST n — same as CALL (pushes return addr)
      cpu.push24(instr.fallthrough);
      return 'terminate';
    }

    case 'jr':
    case 'jr-conditional':
    case 'jp':
    case 'jp-conditional':
    case 'jp-indirect':
      // All jumps terminate the block — do NOT follow branches.
      // In the transpiled code, each jump is the last instruction in a block,
      // and block dispatch handles the next PC. JR cc does not execute any
      // extra side effects (no SP change).
      return 'terminate';

    case 'djnz': {
      // DJNZ decrements B and either loops (returns branch target) or falls through.
      // In the transpiled code, this is the last instruction of the block.
      // We just decrement B — the block runner handles looping via block dispatch.
      const bVal = (cpu._state._bc >> 8) & 0xff;
      const newB = (bVal - 1) & 0xff;
      cpu._state._bc = (cpu._state._bc & 0xff00ff) | (newB << 8);
      return 'terminate';
    }

    case 'halt':
      // HALT doesn't change state we track
      return 'terminate';

    case 'stmix':
      cpu._state.madl = 1;
      return 'terminate';

    case 'rsmix':
      cpu._state.madl = 0;
      return 'terminate';

    case 'mlt': {
      // MLT rr: rr = hi(rr) * lo(rr)
      const pair = instr.reg;
      const val = cpu.getPair(pair);
      const hi = (val >> 8) & 0xff;
      const lo = val & 0xff;
      cpu.setPair(pair, (hi * lo) & 0xffff);
      return true;
    }

    case 'tst-reg': {
      // TST A, r — AND without storing, updates flags like AND
      cpu.and8(cpu._state.a, cpu.getReg8(instr.reg));
      return true;
    }

    case 'tst-imm': {
      cpu.and8(cpu._state.a, instr.value);
      return true;
    }

    case 'tst-ind': {
      cpu.and8(cpu._state.a, cpu.read8(cpu.getPair('hl')));
      return true;
    }

    case 'tstio': {
      // TSTIO n — AND (C) with n, but we skip I/O
      return true;
    }

    case 'in-imm':
    case 'out-imm':
    case 'in-reg':
    case 'out-reg':
    case 'in0':
    case 'out0':
    case 'cpi':
    case 'cpir':
    case 'cpd':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'outi':
    case 'outd':
    case 'inir':
    case 'indr':
    case 'otir':
    case 'otdr':
    case 'otimr':
    case 'slp':
      // I/O and block compare/IO — not worth emulating; skip block
      return 'unsupported';

    default:
      return 'unsupported';
  }
}

// ============================================================================
// Run the mini interpreter over a block's ROM bytes
// Returns final CPU state (as a snapshot), list of instructions, and any error
// Handles intra-block branches (JR cc, DJNZ, JP cc) by following them if they
// point within a "reasonable" range of the block start.
// ============================================================================

function runMiniInterpreter(blockPc, mode, cpuSnapBefore, memBefore) {
  // Clone the memory for the mini interpreter so we don't pollute
  const miniMem = new Uint8Array(memBefore);

  const mini = makeMiniCpu(cpuSnapBefore, miniMem);
  const instructions = [];
  let pc = blockPc;
  let instrCount = 0;
  const maxInstrs = 500; // single-pass through the block

  while (instrCount < maxInstrs) {
    instrCount++;

    let instr;
    try {
      instr = decodeInstruction(romBytes, pc, mode);
    } catch (err) {
      return { ok: false, reason: `decode error at ${hex(pc)}: ${err.message}`, instructions, miniMem, mini };
    }

    instructions.push({ pc, instr });

    const result = execInstr(instr, mini);

    if (result === 'unsupported') {
      return { ok: false, reason: `unsupported instruction: ${instr.tag}`, instructions, miniMem, mini };
    }

    if (result === 'terminate') {
      break;
    }

    if (result !== true) {
      return { ok: false, reason: `exec returned unexpected: ${JSON.stringify(result)}`, instructions, miniMem, mini };
    }

    pc = instr.nextPc;
  }

  if (instrCount >= maxInstrs) {
    return { ok: false, reason: 'block too long (>500 instructions)', instructions, miniMem, mini };
  }

  // Extract final mini state
  const finalSnap = { cpu: snapshotMiniCpu(mini), miniMem };
  return { ok: true, instructions, finalSnap, miniMem, mini };
}

function snapshotMiniCpu(mini) {
  const s = mini._state;
  return {
    a: s.a,
    f: s.f,
    _bc: s._bc,
    _de: s._de,
    _hl: s._hl,
    sp: s.sp,
    _ix: s._ix,
    _iy: s._iy,
    _a2: s._a2,
    _f2: s._f2,
    _bc2: s._bc2,
    _de2: s._de2,
    _hl2: s._hl2,
  };
}

// ============================================================================
// Compare two CPU snapshots — returns list of divergences
// ============================================================================

function compareCpuSnaps(transpiled, reference) {
  const diffs = [];

  const check = (name, a, b) => {
    if ((a & 0xffffff) !== (b & 0xffffff)) {
      diffs.push({ reg: name, transpiled: a & 0xffffff, reference: b & 0xffffff });
    }
  };

  check('A',   transpiled.a,   reference.a);
  check('F',   transpiled.f,   reference.f);
  check('BC',  transpiled._bc, reference._bc);
  check('DE',  transpiled._de, reference._de);
  check('HL',  transpiled._hl, reference._hl);
  check('SP',  transpiled.sp,  reference.sp);
  check('IX',  transpiled._ix, reference._ix);
  check('IY',  transpiled._iy, reference._iy);
  check("A'",  transpiled._a2, reference._a2);
  check("F'",  transpiled._f2, reference._f2);
  check("BC'", transpiled._bc2, reference._bc2);
  check("DE'", transpiled._de2, reference._de2);
  check("HL'", transpiled._hl2, reference._hl2);

  return diffs;
}

function compareMemRegion(transpiledMem, refMem, addr, len, label) {
  const diffs = [];
  for (let i = 0; i < len; i++) {
    const ta = transpiledMem[addr + i] & 0xff;
    const ra = refMem[addr + i] & 0xff;
    if (ta !== ra) {
      diffs.push({ label: `${label}[${i}]`, addr: addr + i, transpiled: ta, reference: ra });
    }
  }
  return diffs;
}

// ============================================================================
// Runtime setup (verbatim from phase 170)
// ============================================================================

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;
const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPS_ADDR = 0xd02593;
const OPBASE_ADDR = 0xd02590;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;
const FP_CATEGORY_ADDR = 0xd0060e;
const GCD_CATEGORY = 0x28;
const ERR_SP_ADDR = 0xd008e0;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const FPS_CLEAN_AREA = 0xd1aa00;
const GCD_ENTRY = 0x068d3d;
const MAX_LOOP_ITER = 8192;
const MEMINIT_BUDGET = 100000;

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedGcdFpState(mem, op1Bytes, op2Bytes) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  for (let i = 0; i < 9; i++) mem[OP1_ADDR + i] = op1Bytes[i];
  for (let i = 0; i < 9; i++) mem[OP2_ADDR + i] = op2Bytes[i];
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const { executor, cpu, mem } = runtime;
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let memInitOk = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET, maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (err) {
    if (err?.message === '__RET__') memInitOk = true;
    else throw err;
  }
  return { ...runtime, memInitOk };
}

// ============================================================================
// Main probe: run gcd with before/after snapshots and mini-interpreter compare
// ============================================================================

function runInstrCompare(runtime) {
  console.log('='.repeat(80));
  console.log('PHASE 171: INSTRUCTION-LEVEL COMPARISON PROBE DURING gcd(12,8)');
  console.log('='.repeat(80));
  console.log('');

  const { mem, executor, cpu } = runtime;

  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 12.0
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 8.0

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, op1Bytes, op2Bytes);

  // Push OP2 to FPS before gcd entry
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Copy = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) mem[fpsPtr + i] = op2Copy[i];
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log(`Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}]`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';
  let firstDivergence = null;
  let skippedBlocks = 0;
  let checkedBlocks = 0;

  // We collect (beforeSnap, afterSnap, pc, mode) for each block.
  // The trick: onBlock fires BEFORE the block runs (at block entry).
  // We snapshot before, run the block, then in the NEXT onBlock call we have the after state.
  // Actually the executor calls onBlock THEN runs fn(cpu).
  // So we need to intercept at the right point.
  //
  // Strategy: maintain a pending "before" snapshot. Each time onBlock fires:
  //   1. If we have a pending "before", the current cpu state IS the after for that block.
  //      -> compare pending_before against current state
  //   2. Take a new "before" snapshot for the current block.
  //
  // This works because onBlock fires at the START of each block (before execution).

  let pendingBefore = null; // { snap, memCopy, pc, mode, step }

  const blockMeta = executor.blockMeta;

  function processBlock(currentPc, currentMode, currentStep) {
    if (firstDivergence) return; // already found one, stop processing

    if (pendingBefore !== null) {
      // Current CPU state = output of pendingBefore's block
      const afterCpuSnap = snapshotCpu(cpu);
      const afterOp1 = readBytes(mem, OP1_ADDR, 9);
      const afterOp2 = readBytes(mem, OP2_ADDR, 9);
      const afterErrNo = mem[ERR_NO_ADDR] & 0xff;
      const afterSp = cpu.sp & 0xffffff;
      const afterStack = readBytes(mem, afterSp, 12);

      const pb = pendingBefore;

      // Run mini interpreter
      const miniResult = runMiniInterpreter(pb.pc, pb.mode, pb.snap, pb.memCopy);

      if (!miniResult.ok) {
        // Can't compare this block — skip
        skippedBlocks++;
        console.log(
          `  step ${String(pb.step).padStart(4)} Block ${hex(pb.pc)} [SKIP: ${miniResult.reason}]`
        );
      } else {
        checkedBlocks++;
        const { finalSnap, miniMem } = miniResult;

        // Compare CPU registers
        const cpuDiffs = compareCpuSnaps(afterCpuSnap, finalSnap.cpu);

        // Compare memory regions
        const op1Diffs = compareMemRegion(mem, miniMem, OP1_ADDR, 9, 'OP1');
        const op2Diffs = compareMemRegion(mem, miniMem, OP2_ADDR, 9, 'OP2');
        const errDiffs = (afterErrNo !== (miniMem[ERR_NO_ADDR] & 0xff))
          ? [{ label: 'errNo', addr: ERR_NO_ADDR, transpiled: afterErrNo, reference: miniMem[ERR_NO_ADDR] & 0xff }]
          : [];

        // Compare stack (top 12 bytes from the MINI's SP)
        const miniSp = finalSnap.cpu.sp & 0xffffff;
        const stackDiffs = compareMemRegion(mem, miniMem, miniSp, 12, 'STACK');

        const allDiffs = [...cpuDiffs, ...op1Diffs, ...op2Diffs, ...errDiffs, ...stackDiffs];

        if (allDiffs.length > 0) {
          firstDivergence = {
            step: pb.step,
            pc: pb.pc,
            mode: pb.mode,
            diffs: allDiffs,
            instructions: miniResult.instructions,
            transpiledCpu: afterCpuSnap,
            referenceCpu: finalSnap.cpu,
          };
          console.log(`  step ${String(pb.step).padStart(4)} Block ${hex(pb.pc)} [DIVERGE]  ***`);
        } else {
          console.log(`  step ${String(pb.step).padStart(4)} Block ${hex(pb.pc)} [MATCH]`);
        }
      }

      pendingBefore = null;
    }

    if (firstDivergence) return;

    // Take before snapshot for current block
    const beforeSnap = snapshotCpu(cpu);
    const memCopy = new Uint8Array(mem); // full copy — expensive but accurate
    pendingBefore = { snap: beforeSnap, memCopy, pc: currentPc, mode: currentMode, step: currentStep };
  }

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: 2000,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        processBlock(norm, mode, step);

        if (firstDivergence) throw new Error('__DIVERGE__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        // Can't snapshot a missing block — flush pending
        pendingBefore = null;
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else if (err?.message === '__DIVERGE__') outcome = 'diverge';
    else {
      outcome = 'threw';
      console.log(`Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log(`Outcome: ${outcome}  |  Steps: ${stepCount}  |  Checked: ${checkedBlocks}  |  Skipped: ${skippedBlocks}`);
  console.log('='.repeat(80));
  console.log('');

  if (firstDivergence) {
    const d = firstDivergence;
    console.log(`FIRST DIVERGENCE at step ${d.step}, Block ${hex(d.pc)} (mode=${d.mode})`);
    console.log('');

    console.log('--- REGISTER/MEMORY DIFFERENCES ---');
    for (const diff of d.diffs) {
      const tHex = hex(diff.transpiled, diff.reg === 'A' || diff.reg === 'F' ? 2 : 6);
      const rHex = hex(diff.reference, diff.reg === 'A' || diff.reg === 'F' ? 2 : 6);
      console.log(`  ${String(diff.reg || diff.label).padEnd(8)} transpiled=${tHex}  reference=${rHex}`);
    }

    console.log('');
    console.log('--- INSTRUCTIONS IN DIVERGING BLOCK ---');
    for (const { pc: ipc, instr } of d.instructions) {
      const bytes = readBytes(romBytes, ipc, instr.length);
      const byteStr = formatBytes(bytes).padEnd(12);
      console.log(`  ${hex(ipc)}  ${byteStr}  tag=${instr.tag}`);
    }

    console.log('');
    console.log('--- TRANSPILED CPU STATE ---');
    printCpuState('  ', d.transpiledCpu);

    console.log('');
    console.log('--- REFERENCE CPU STATE ---');
    printCpuState('  ', d.referenceCpu);

  } else {
    console.log('No divergence found in checked blocks.');
    const errNo = mem[ERR_NO_ADDR] & 0xff;
    const finalOP1 = readBytes(mem, OP1_ADDR, 9);
    const finalOP2 = readBytes(mem, OP2_ADDR, 9);
    console.log(`Error: 0x${hexByte(errNo)}`);
    console.log(`Final OP1: [${formatBytes(finalOP1)}]`);
    console.log(`Final OP2: [${formatBytes(finalOP2)}]`);
  }

  console.log('');
}

function printCpuState(indent, s) {
  console.log(`${indent}A=${hexByte(s.a)}  F=${hexByte(s.f)}  BC=${hex(s._bc)}  DE=${hex(s._de)}  HL=${hex(s._hl)}`);
  console.log(`${indent}SP=${hex(s.sp)}  IX=${hex(s._ix)}  IY=${hex(s._iy)}`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('=== Phase 171: Instruction-Level Comparison Probe ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  runInstrCompare(runtime);

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}

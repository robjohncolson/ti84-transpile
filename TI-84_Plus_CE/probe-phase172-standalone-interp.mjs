#!/usr/bin/env node

/**
 * Phase 172 - Standalone eZ80 Interpreter vs Transpiled Comparison
 *
 * Runs gcd(12,8) through TWO completely independent execution engines:
 *   1. The transpiled code (ROM.transpiled.js + cpu-runtime.js)
 *   2. A standalone eZ80 interpreter that reads ROM bytes directly
 *
 * Both start from identical initial state. At each block boundary,
 * we compare ALL register state and key memory regions.
 * Reports the FIRST divergence with full register dumps.
 *
 * Unlike phase 171 (which used per-block memory snapshots from the
 * transpiled side), this probe gives each side its OWN memory that
 * evolves independently — catching cumulative memory corruption bugs.
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

function flagsToString(f) {
  const bits = [];
  if (f & 0x80) bits.push('S');
  if (f & 0x40) bits.push('Z');
  if (f & 0x20) bits.push('Y');
  if (f & 0x10) bits.push('H');
  if (f & 0x08) bits.push('X');
  if (f & 0x04) bits.push('PV');
  if (f & 0x02) bits.push('N');
  if (f & 0x01) bits.push('C');
  return bits.join('|') || '-';
}

// ============================================================================
// Constants
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
const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;
const ERR_NO_ADDR = 0xd008df;
const FPS_PTR_ADDR = 0xd0258d;
const MAX_STEPS = 2000;

// ============================================================================
// Standalone eZ80 Interpreter (INDEPENDENT of cpu-runtime.js)
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

/**
 * Standalone CPU state. All register/flag logic is written from scratch.
 * Does NOT import or reference any cpu-runtime.js code.
 */
class StandaloneCPU {
  constructor(mem) {
    this.mem = mem;
    this.a = 0;
    this.f = 0;
    this._bc = 0;
    this._de = 0;
    this._hl = 0;
    this._a2 = 0;
    this._f2 = 0;
    this._bc2 = 0;
    this._de2 = 0;
    this._hl2 = 0;
    this.sp = 0;
    this._ix = 0;
    this._iy = 0;
    this.pc = 0;
    this.madl = 1;
    this.mbase = 0;
    this.i = 0;
    this.im = 0;
    this.iff1 = 0;
    this.iff2 = 0;
    this.halted = false;
  }

  // --- 8-bit register accessors ---
  get b() { return (this._bc >> 8) & 0xff; }
  set b(v) { this._bc = (this._bc & 0xff00ff) | ((v & 0xff) << 8); }
  get c() { return this._bc & 0xff; }
  set c(v) { this._bc = (this._bc & 0xffff00) | (v & 0xff); }
  get d() { return (this._de >> 8) & 0xff; }
  set d(v) { this._de = (this._de & 0xff00ff) | ((v & 0xff) << 8); }
  get e() { return this._de & 0xff; }
  set e(v) { this._de = (this._de & 0xffff00) | (v & 0xff); }
  get h() { return (this._hl >> 8) & 0xff; }
  set h(v) { this._hl = (this._hl & 0xff00ff) | ((v & 0xff) << 8); }
  get l() { return this._hl & 0xff; }
  set l(v) { this._hl = (this._hl & 0xffff00) | (v & 0xff); }

  // --- Memory access ---
  read8(addr) { return this.mem[addr & 0xffffff] ?? 0; }
  write8(addr, val) {
    const a = addr & 0xffffff;
    if (a < 0x400000) return; // ROM write-protect
    this.mem[a] = val & 0xff;
  }
  read16(addr) {
    const a = addr & 0xffffff;
    return (this.mem[a] & 0xff) | ((this.mem[a + 1] & 0xff) << 8);
  }
  read24(addr) {
    const a = addr & 0xffffff;
    return (this.mem[a] & 0xff) | ((this.mem[a + 1] & 0xff) << 8) | ((this.mem[a + 2] & 0xff) << 16);
  }
  write24(addr, val) {
    const a = addr & 0xffffff;
    if (a < 0x400000) return;
    this.mem[a] = val & 0xff;
    this.mem[a + 1] = (val >>> 8) & 0xff;
    this.mem[a + 2] = (val >>> 16) & 0xff;
  }
  write16(addr, val) {
    const a = addr & 0xffffff;
    if (a < 0x400000) return;
    this.mem[a] = val & 0xff;
    this.mem[a + 1] = (val >>> 8) & 0xff;
  }

  // --- Flag helpers ---
  getF(flag) { return (this.f & flag) !== 0; }
  setF(flag, val) {
    if (val) this.f |= flag;
    else this.f &= ~flag;
  }

  szFlags(result) {
    this.setF(FLAG_S, result & 0x80);
    this.setF(FLAG_Z, (result & 0xff) === 0);
    this.setF(FLAG_X, result & FLAG_X);
    this.setF(FLAG_Y, result & FLAG_Y);
  }

  // --- 8-bit ALU (written from scratch) ---

  add8(a, b) {
    const r = a + b;
    this.szFlags(r);
    this.setF(FLAG_H, ((a ^ b ^ r) & 0x10) !== 0);
    this.setF(FLAG_PV, ((a ^ r) & (b ^ r) & 0x80) !== 0);
    this.setF(FLAG_N, false);
    this.setF(FLAG_C, r > 0xff);
    return r & 0xff;
  }

  sub8(a, b) {
    const r = a - b;
    this.szFlags(r);
    this.setF(FLAG_H, ((a ^ b ^ r) & 0x10) !== 0);
    this.setF(FLAG_PV, ((a ^ b) & (a ^ r) & 0x80) !== 0);
    this.setF(FLAG_N, true);
    this.setF(FLAG_C, r < 0);
    return r & 0xff;
  }

  adc8(a, b) {
    const c = this.getF(FLAG_C) ? 1 : 0;
    const r = a + b + c;
    this.szFlags(r);
    this.setF(FLAG_H, ((a ^ b ^ r) & 0x10) !== 0);
    this.setF(FLAG_PV, ((a ^ r) & (b ^ r) & 0x80) !== 0);
    this.setF(FLAG_N, false);
    this.setF(FLAG_C, r > 0xff);
    return r & 0xff;
  }

  sbc8(a, b) {
    const c = this.getF(FLAG_C) ? 1 : 0;
    const r = a - b - c;
    this.szFlags(r);
    this.setF(FLAG_H, ((a ^ b ^ r) & 0x10) !== 0);
    this.setF(FLAG_PV, ((a ^ b) & (a ^ r) & 0x80) !== 0);
    this.setF(FLAG_N, true);
    this.setF(FLAG_C, r < 0);
    return r & 0xff;
  }

  and8(a, b) {
    const r = a & b;
    this.szFlags(r);
    this.setF(FLAG_H, true);
    this.setF(FLAG_PV, parity(r));
    this.setF(FLAG_N, false);
    this.setF(FLAG_C, false);
    return r;
  }

  or8(a, b) {
    const r = a | b;
    this.szFlags(r);
    this.setF(FLAG_H, false);
    this.setF(FLAG_PV, parity(r));
    this.setF(FLAG_N, false);
    this.setF(FLAG_C, false);
    return r;
  }

  xor8(a, b) {
    const r = a ^ b;
    this.szFlags(r);
    this.setF(FLAG_H, false);
    this.setF(FLAG_PV, parity(r));
    this.setF(FLAG_N, false);
    this.setF(FLAG_C, false);
    return r;
  }

  cp8(a, b) {
    // CP is subtract without storing result
    this.sub8(a, b);
  }

  inc8(v) {
    const r = (v + 1) & 0xff;
    this.szFlags(r);
    this.setF(FLAG_H, (v & 0x0f) === 0x0f);
    this.setF(FLAG_PV, v === 0x7f);
    this.setF(FLAG_N, false);
    // C preserved
    return r;
  }

  dec8(v) {
    const r = (v - 1) & 0xff;
    this.szFlags(r);
    this.setF(FLAG_H, (v & 0x0f) === 0x00);
    this.setF(FLAG_PV, v === 0x80);
    this.setF(FLAG_N, true);
    // C preserved
    return r;
  }

  neg8(v) {
    return this.sub8(0, v);
  }

  // DAA: decimal adjust accumulator
  daa() {
    const a = this.a;
    let r = a;
    let correction = 0;
    if (this.getF(FLAG_H) || (!this.getF(FLAG_N) && (r & 0x0f) > 9)) {
      correction |= 0x06;
    }
    if (this.getF(FLAG_C) || (!this.getF(FLAG_N) && r > 0x99)) {
      correction |= 0x60;
      this.setF(FLAG_C, true);
    }
    if (this.getF(FLAG_N)) {
      r = (r - correction) & 0xff;
    } else {
      r = (r + correction) & 0xff;
    }
    this.setF(FLAG_S, r & 0x80);
    this.setF(FLAG_Z, r === 0);
    this.setF(FLAG_H, ((a ^ r) & 0x10) !== 0);
    this.setF(FLAG_PV, parity(r));
    this.a = r;
  }

  // --- 24-bit pair arithmetic ---

  addPair(a, b) {
    const r = a + b;
    this.setF(FLAG_H, ((a ^ b ^ r) & 0x1000) !== 0);
    this.setF(FLAG_N, false);
    this.setF(FLAG_C, r > 0xffffff);
    return r & 0xffffff;
  }

  sbcPair(hl, rr) {
    const c = this.getF(FLAG_C) ? 1 : 0;
    const r = hl - rr - c;
    const r16 = r & 0xffff;
    this.setF(FLAG_S, r16 & 0x8000);
    this.setF(FLAG_Z, r16 === 0);
    this.setF(FLAG_H, ((hl ^ rr ^ r) & 0x1000) !== 0);
    this.setF(FLAG_PV, ((hl ^ rr) & (hl ^ r) & 0x8000) !== 0);
    this.setF(FLAG_N, true);
    this.setF(FLAG_C, r < 0);
    return r & 0xffffff;
  }

  adcPair(hl, rr) {
    const c = this.getF(FLAG_C) ? 1 : 0;
    const r = hl + rr + c;
    const r16 = r & 0xffff;
    this.setF(FLAG_S, r16 & 0x8000);
    this.setF(FLAG_Z, r16 === 0);
    this.setF(FLAG_H, ((hl ^ rr ^ r) & 0x1000) !== 0);
    this.setF(FLAG_PV, ((hl ^ r) & (rr ^ r) & 0x8000) !== 0);
    this.setF(FLAG_N, false);
    this.setF(FLAG_C, r > 0xffff);
    return r & 0xffffff;
  }

  // --- Rotate/shift ---

  rotShift8(op, v) {
    let r;
    switch (op) {
      case 'rlc': { const b7 = (v >> 7) & 1; r = ((v << 1) | b7) & 0xff; this.setF(FLAG_C, b7); break; }
      case 'rrc': { const b0 = v & 1; r = ((v >> 1) | (b0 << 7)) & 0xff; this.setF(FLAG_C, b0); break; }
      case 'rl':  { const oc = this.getF(FLAG_C) ? 1 : 0; r = ((v << 1) | oc) & 0xff; this.setF(FLAG_C, (v >> 7) & 1); break; }
      case 'rr':  { const oc = this.getF(FLAG_C) ? 1 : 0; r = ((v >> 1) | (oc << 7)) & 0xff; this.setF(FLAG_C, v & 1); break; }
      case 'sla': { r = (v << 1) & 0xff; this.setF(FLAG_C, (v >> 7) & 1); break; }
      case 'sra': { r = ((v >> 1) | (v & 0x80)) & 0xff; this.setF(FLAG_C, v & 1); break; }
      case 'srl': { r = (v >> 1) & 0xff; this.setF(FLAG_C, v & 1); break; }
      case 'sll': { r = ((v << 1) | 1) & 0xff; this.setF(FLAG_C, (v >> 7) & 1); break; }
      default: r = v;
    }
    this.szFlags(r);
    this.setF(FLAG_H, false);
    this.setF(FLAG_N, false);
    this.setF(FLAG_PV, parity(r));
    return r;
  }

  // --- Stack ---

  push24(val) {
    this.sp = (this.sp - 3) & 0xffffff;
    this.write24(this.sp, val);
  }

  pop24() {
    const val = this.read24(this.sp);
    this.sp = (this.sp + 3) & 0xffffff;
    return val;
  }

  push(val) {
    if (this.madl) {
      this.sp = (this.sp - 3) & 0xffffff;
      this.write24(this.sp, val);
    } else {
      this.sp = (this.sp - 2) & 0xffffff;
      this.write16(this.sp, val & 0xffff);
    }
  }

  pop() {
    if (this.madl) {
      const val = this.read24(this.sp);
      this.sp = (this.sp + 3) & 0xffffff;
      return val;
    }
    const val = this.read16(this.sp);
    this.sp = (this.sp + 2) & 0xffffff;
    return val;
  }

  // --- BIT test ---

  testBit(v, bit) {
    const r = v & (1 << bit);
    this.setF(FLAG_Z, r === 0);
    this.setF(FLAG_PV, r === 0); // PV mirrors Z
    this.setF(FLAG_S, bit === 7 && r !== 0);
    this.setF(FLAG_H, true);
    this.setF(FLAG_N, false);
  }

  // --- BCD rotate ---

  rld() {
    const memVal = this.read8(this._hl);
    const newMem = ((memVal << 4) | (this.a & 0x0f)) & 0xff;
    this.a = (this.a & 0xf0) | ((memVal >> 4) & 0x0f);
    this.write8(this._hl, newMem);
    this.szFlags(this.a);
    this.setF(FLAG_H, false);
    this.setF(FLAG_PV, parity(this.a));
    this.setF(FLAG_N, false);
  }

  rrd() {
    const memVal = this.read8(this._hl);
    const newMem = ((this.a << 4) | ((memVal >> 4) & 0x0f)) & 0xff;
    this.a = (this.a & 0xf0) | (memVal & 0x0f);
    this.write8(this._hl, newMem);
    this.szFlags(this.a);
    this.setF(FLAG_H, false);
    this.setF(FLAG_PV, parity(this.a));
    this.setF(FLAG_N, false);
  }

  // --- Block transfer ---

  ldi() {
    this.write8(this._de, this.read8(this._hl));
    this._hl = (this._hl + 1) & 0xffffff;
    this._de = (this._de + 1) & 0xffffff;
    this._bc = (this._bc - 1) & 0xffffff;
    this.setF(FLAG_H, false);
    this.setF(FLAG_PV, this._bc !== 0);
    this.setF(FLAG_N, false);
  }

  ldir() {
    do { this.ldi(); } while (this._bc !== 0);
  }

  ldd() {
    this.write8(this._de, this.read8(this._hl));
    this._hl = (this._hl - 1) & 0xffffff;
    this._de = (this._de - 1) & 0xffffff;
    this._bc = (this._bc - 1) & 0xffffff;
    this.setF(FLAG_H, false);
    this.setF(FLAG_PV, this._bc !== 0);
    this.setF(FLAG_N, false);
  }

  lddr() {
    do { this.ldd(); } while (this._bc !== 0);
  }

  // --- Condition check ---

  cond(c) {
    switch (c) {
      case 'z':  return this.getF(FLAG_Z);
      case 'nz': return !this.getF(FLAG_Z);
      case 'c':  return this.getF(FLAG_C);
      case 'nc': return !this.getF(FLAG_C);
      case 'pe': return this.getF(FLAG_PV);
      case 'po': return !this.getF(FLAG_PV);
      case 'm':  return this.getF(FLAG_S);
      case 'p':  return !this.getF(FLAG_S);
      default: return false;
    }
  }

  // --- Register access by name ---

  getReg8(name) {
    switch (name) {
      case 'a': return this.a;
      case 'b': return (this._bc >> 8) & 0xff;
      case 'c': return this._bc & 0xff;
      case 'd': return (this._de >> 8) & 0xff;
      case 'e': return this._de & 0xff;
      case 'h': return (this._hl >> 8) & 0xff;
      case 'l': return this._hl & 0xff;
      case '(hl)': return this.read8(this._hl);
      case 'ixh': return (this._ix >> 8) & 0xff;
      case 'ixl': return this._ix & 0xff;
      case 'iyh': return (this._iy >> 8) & 0xff;
      case 'iyl': return this._iy & 0xff;
      default: throw new Error(`getReg8: unknown register '${name}'`);
    }
  }

  setReg8(name, v) {
    const b = v & 0xff;
    switch (name) {
      case 'a': this.a = b; return;
      case 'b': this._bc = (this._bc & 0xff00ff) | (b << 8); return;
      case 'c': this._bc = (this._bc & 0xffff00) | b; return;
      case 'd': this._de = (this._de & 0xff00ff) | (b << 8); return;
      case 'e': this._de = (this._de & 0xffff00) | b; return;
      case 'h': this._hl = (this._hl & 0xff00ff) | (b << 8); return;
      case 'l': this._hl = (this._hl & 0xffff00) | b; return;
      case '(hl)': this.write8(this._hl, b); return;
      case 'ixh': this._ix = (this._ix & 0xff00ff) | (b << 8); return;
      case 'ixl': this._ix = (this._ix & 0xffff00) | b; return;
      case 'iyh': this._iy = (this._iy & 0xff00ff) | (b << 8); return;
      case 'iyl': this._iy = (this._iy & 0xffff00) | b; return;
      default: throw new Error(`setReg8: unknown register '${name}'`);
    }
  }

  getPair(name) {
    switch (name) {
      case 'bc': return this._bc;
      case 'de': return this._de;
      case 'hl': return this._hl;
      case 'sp': return this.sp;
      case 'ix': return this._ix;
      case 'iy': return this._iy;
      case 'af': return (this.a << 8) | this.f;
      default: throw new Error(`getPair: unknown pair '${name}'`);
    }
  }

  setPair(name, v) {
    const w = v & 0xffffff;
    switch (name) {
      case 'bc': this._bc = w; return;
      case 'de': this._de = w; return;
      case 'hl': this._hl = w; return;
      case 'sp': this.sp = w; return;
      case 'ix': this._ix = w; return;
      case 'iy': this._iy = w; return;
      case 'af': this.a = (w >> 8) & 0xff; this.f = w & 0xff; return;
      default: throw new Error(`setPair: unknown pair '${name}'`);
    }
  }

  // --- Snapshot for comparison ---

  snapshot() {
    return {
      a: this.a,
      f: this.f,
      _bc: this._bc,
      _de: this._de,
      _hl: this._hl,
      sp: this.sp,
      _ix: this._ix,
      _iy: this._iy,
      _a2: this._a2,
      _f2: this._f2,
      _bc2: this._bc2,
      _de2: this._de2,
      _hl2: this._hl2,
      pc: this.pc,
    };
  }
}

// ============================================================================
// Standalone instruction executor
// Returns: 'ok' | 'terminate' | 'unsupported'
// For terminate: also sets cpu.pc to the next address
// ============================================================================

function execStandalone(instr, cpu) {
  const { tag } = instr;

  function applyModePrefix() {
    if (instr.modePrefix) {
      cpu.madl = instr.modePrefix[0] === 'l' ? 1 : 0;
    }
  }

  switch (tag) {
    case 'nop':
    case 'di':
    case 'ei':
    case 'im':
      return 'ok';

    case 'halt':
      return 'ok';

    // --- Load instructions ---

    case 'ld-reg-reg':
      cpu.setReg8(instr.dest, cpu.getReg8(instr.src));
      return 'ok';

    case 'ld-reg-imm':
      cpu.setReg8(instr.dest, instr.value);
      return 'ok';

    case 'ld-reg-ind': {
      const addr = cpu.getPair(instr.src);
      cpu.setReg8(instr.dest, cpu.read8(addr));
      return 'ok';
    }

    case 'ld-ind-reg': {
      const addr = cpu.getPair(instr.dest);
      cpu.write8(addr, cpu.getReg8(instr.src));
      return 'ok';
    }

    case 'ld-ind-imm':
      cpu.write8(cpu.getPair('hl'), instr.value);
      return 'ok';

    case 'ld-reg-ixd': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.setReg8(instr.dest, cpu.read8(addr));
      return 'ok';
    }

    case 'ld-ixd-reg': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, cpu.getReg8(instr.src));
      return 'ok';
    }

    case 'ld-ixd-imm': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, instr.value);
      return 'ok';
    }

    case 'ld-pair-imm':
      cpu.setPair(instr.pair, instr.value);
      return 'ok';

    case 'ld-pair-mem':
      cpu.setPair(instr.pair, cpu.read24(instr.addr));
      return 'ok';

    case 'ld-mem-pair':
      cpu.write24(instr.addr, cpu.getPair(instr.pair));
      return 'ok';

    case 'ld-reg-mem':
      cpu.setReg8(instr.dest, cpu.read8(instr.addr));
      return 'ok';

    case 'ld-mem-reg':
      cpu.write8(instr.addr, cpu.getReg8(instr.src));
      return 'ok';

    case 'ld-sp-hl':
      cpu.setPair('sp', cpu.getPair('hl'));
      return 'ok';

    case 'ld-sp-pair':
      cpu.setPair('sp', cpu.getPair(instr.pair));
      return 'ok';

    case 'ld-pair-indexed': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.setPair(instr.pair, cpu.read24(addr));
      return 'ok';
    }

    case 'ld-indexed-pair': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write24(addr, cpu.getPair(instr.pair));
      return 'ok';
    }

    case 'ld-pair-ind':
      cpu.setPair(instr.pair, cpu.read24(cpu.getPair(instr.src)));
      return 'ok';

    case 'ld-ind-pair':
      cpu.write24(cpu.getPair(instr.dest), cpu.getPair(instr.pair));
      return 'ok';

    case 'ld-ixiy-indexed': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.setPair(instr.dest, cpu.read24(addr));
      return 'ok';
    }

    case 'ld-indexed-ixiy': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write24(addr, cpu.getPair(instr.src));
      return 'ok';
    }

    case 'ld-special':
      if (instr.dest === 'i') {
        cpu.i = cpu.a;
      } else if (instr.dest === 'r') {
        // R register not tracked
      } else if (instr.src === 'i') {
        cpu.a = cpu.i & 0xff;
        cpu.szFlags(cpu.a);
        cpu.setF(FLAG_H, false);
        cpu.setF(FLAG_N, false);
        cpu.setF(FLAG_PV, cpu.iff2 ? 1 : 0);
      } else if (instr.src === 'r') {
        cpu.a = 0;
        cpu.szFlags(0);
        cpu.setF(FLAG_H, false);
        cpu.setF(FLAG_N, false);
        cpu.setF(FLAG_PV, cpu.iff2 ? 1 : 0);
      }
      return 'ok';

    case 'ld-mb-a':
      cpu.mbase = cpu.a;
      return 'ok';

    case 'ld-a-mb':
      cpu.a = cpu.mbase & 0xff;
      return 'ok';

    // --- Stack ---

    case 'push':
      cpu.push(cpu.getPair(instr.pair));
      return 'ok';

    case 'pop':
      cpu.setPair(instr.pair, cpu.pop());
      return 'ok';

    // --- Exchange ---

    case 'ex-af': {
      const tmpA = cpu.a, tmpF = cpu.f;
      cpu.a = cpu._a2; cpu.f = cpu._f2;
      cpu._a2 = tmpA; cpu._f2 = tmpF;
      return 'ok';
    }

    case 'exx': {
      let t;
      t = cpu._bc; cpu._bc = cpu._bc2; cpu._bc2 = t;
      t = cpu._de; cpu._de = cpu._de2; cpu._de2 = t;
      t = cpu._hl; cpu._hl = cpu._hl2; cpu._hl2 = t;
      return 'ok';
    }

    case 'ex-de-hl': {
      const t = cpu._de;
      cpu._de = cpu._hl;
      cpu._hl = t;
      return 'ok';
    }

    case 'ex-sp-hl': {
      const spAddr = cpu.sp;
      const memVal = cpu.read24(spAddr);
      cpu.write24(spAddr, cpu._hl);
      cpu._hl = memVal;
      return 'ok';
    }

    case 'ex-sp-pair': {
      const spAddr = cpu.sp;
      const memVal = cpu.read24(spAddr);
      cpu.write24(spAddr, cpu.getPair(instr.pair));
      cpu.setPair(instr.pair, memVal);
      return 'ok';
    }

    // --- 8-bit INC/DEC ---

    case 'inc-reg':
      cpu.setReg8(instr.reg, cpu.inc8(cpu.getReg8(instr.reg)));
      return 'ok';

    case 'dec-reg':
      cpu.setReg8(instr.reg, cpu.dec8(cpu.getReg8(instr.reg)));
      return 'ok';

    case 'inc-pair':
      cpu.setPair(instr.pair, (cpu.getPair(instr.pair) + 1) & 0xffffff);
      return 'ok';

    case 'dec-pair':
      cpu.setPair(instr.pair, (cpu.getPair(instr.pair) - 1) & 0xffffff);
      return 'ok';

    case 'inc-ixd': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, cpu.inc8(cpu.read8(addr)));
      return 'ok';
    }

    case 'dec-ixd': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, cpu.dec8(cpu.read8(addr)));
      return 'ok';
    }

    // --- 8-bit ALU ---

    case 'alu-reg': {
      const src = cpu.getReg8(instr.src);
      const a = cpu.a;
      switch (instr.op) {
        case 'add': cpu.a = cpu.add8(a, src); break;
        case 'adc': cpu.a = cpu.adc8(a, src); break;
        case 'sub': cpu.a = cpu.sub8(a, src); break;
        case 'sbc': cpu.a = cpu.sbc8(a, src); break;
        case 'and': cpu.a = cpu.and8(a, src); break;
        case 'or':  cpu.a = cpu.or8(a, src); break;
        case 'xor': cpu.a = cpu.xor8(a, src); break;
        case 'cp':  cpu.cp8(a, src); break;
        default: return 'unsupported';
      }
      return 'ok';
    }

    case 'alu-imm': {
      const src = instr.value;
      const a = cpu.a;
      switch (instr.op) {
        case 'add': cpu.a = cpu.add8(a, src); break;
        case 'adc': cpu.a = cpu.adc8(a, src); break;
        case 'sub': cpu.a = cpu.sub8(a, src); break;
        case 'sbc': cpu.a = cpu.sbc8(a, src); break;
        case 'and': cpu.a = cpu.and8(a, src); break;
        case 'or':  cpu.a = cpu.or8(a, src); break;
        case 'xor': cpu.a = cpu.xor8(a, src); break;
        case 'cp':  cpu.cp8(a, src); break;
        default: return 'unsupported';
      }
      return 'ok';
    }

    case 'alu-ixd': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      const src = cpu.read8(addr);
      const a = cpu.a;
      switch (instr.op) {
        case 'add': cpu.a = cpu.add8(a, src); break;
        case 'adc': cpu.a = cpu.adc8(a, src); break;
        case 'sub': cpu.a = cpu.sub8(a, src); break;
        case 'sbc': cpu.a = cpu.sbc8(a, src); break;
        case 'and': cpu.a = cpu.and8(a, src); break;
        case 'or':  cpu.a = cpu.or8(a, src); break;
        case 'xor': cpu.a = cpu.xor8(a, src); break;
        case 'cp':  cpu.cp8(a, src); break;
        default: return 'unsupported';
      }
      return 'ok';
    }

    case 'neg':
      cpu.a = cpu.neg8(cpu.a);
      return 'ok';

    case 'cpl':
      cpu.a = (~cpu.a) & 0xff;
      cpu.setF(FLAG_H, true);
      cpu.setF(FLAG_N, true);
      return 'ok';

    case 'scf':
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, true);
      return 'ok';

    case 'ccf':
      cpu.setF(FLAG_H, cpu.getF(FLAG_C));
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, !cpu.getF(FLAG_C));
      return 'ok';

    case 'daa':
      cpu.daa();
      return 'ok';

    // --- 16/24-bit ALU ---

    case 'add-pair':
      cpu.setPair(instr.dest, cpu.addPair(cpu.getPair(instr.dest), cpu.getPair(instr.src)));
      return 'ok';

    case 'sbc-pair':
      cpu._hl = cpu.sbcPair(cpu._hl, cpu.getPair(instr.src));
      return 'ok';

    case 'adc-pair':
      cpu._hl = cpu.adcPair(cpu._hl, cpu.getPair(instr.src));
      return 'ok';

    // --- Rotate/shift ---

    case 'rotate-reg':
      cpu.setReg8(instr.reg, cpu.rotShift8(instr.op, cpu.getReg8(instr.reg)));
      return 'ok';

    case 'rotate-ind': {
      const addr = cpu.getPair(instr.indirectRegister);
      cpu.write8(addr, cpu.rotShift8(instr.op, cpu.read8(addr)));
      return 'ok';
    }

    case 'indexed-cb-rotate': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, cpu.rotShift8(instr.operation, cpu.read8(addr)));
      return 'ok';
    }

    case 'rlca': {
      const b7 = (cpu.a >> 7) & 1;
      cpu.a = ((cpu.a << 1) | b7) & 0xff;
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, b7);
      return 'ok';
    }

    case 'rrca': {
      const b0 = cpu.a & 1;
      cpu.a = ((cpu.a >> 1) | (b0 << 7)) & 0xff;
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, b0);
      return 'ok';
    }

    case 'rla': {
      const oc = cpu.getF(FLAG_C) ? 1 : 0;
      const b7 = (cpu.a >> 7) & 1;
      cpu.a = ((cpu.a << 1) | oc) & 0xff;
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, b7);
      return 'ok';
    }

    case 'rra': {
      const oc = cpu.getF(FLAG_C) ? 1 : 0;
      const b0 = cpu.a & 1;
      cpu.a = ((cpu.a >> 1) | (oc << 7)) & 0xff;
      cpu.setF(FLAG_H, false);
      cpu.setF(FLAG_N, false);
      cpu.setF(FLAG_C, b0);
      return 'ok';
    }

    // --- BIT operations ---

    case 'bit-test':
      cpu.testBit(cpu.getReg8(instr.reg), instr.bit);
      return 'ok';

    case 'bit-test-ind':
      cpu.testBit(cpu.read8(cpu.getPair(instr.indirectRegister)), instr.bit);
      return 'ok';

    case 'indexed-cb-bit': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.testBit(cpu.read8(addr), instr.bit);
      return 'ok';
    }

    case 'bit-res':
      cpu.setReg8(instr.reg, cpu.getReg8(instr.reg) & ~(1 << instr.bit));
      return 'ok';

    case 'bit-res-ind': {
      const addr = cpu.getPair(instr.indirectRegister);
      cpu.write8(addr, cpu.read8(addr) & ~(1 << instr.bit));
      return 'ok';
    }

    case 'indexed-cb-res': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, cpu.read8(addr) & ~(1 << instr.bit));
      return 'ok';
    }

    case 'bit-set':
      cpu.setReg8(instr.reg, cpu.getReg8(instr.reg) | (1 << instr.bit));
      return 'ok';

    case 'bit-set-ind': {
      const addr = cpu.getPair(instr.indirectRegister);
      cpu.write8(addr, cpu.read8(addr) | (1 << instr.bit));
      return 'ok';
    }

    case 'indexed-cb-set': {
      const base = cpu.getPair(instr.indexRegister);
      const addr = (base + instr.displacement) & 0xffffff;
      cpu.write8(addr, cpu.read8(addr) | (1 << instr.bit));
      return 'ok';
    }

    // --- BCD rotate ---

    case 'rld':
      cpu.rld();
      return 'ok';

    case 'rrd':
      cpu.rrd();
      return 'ok';

    // --- Block transfer ---

    case 'ldi':
      cpu.ldi();
      return 'ok';

    case 'ldir':
      cpu.ldir();
      return 'ok';

    case 'ldd':
      cpu.ldd();
      return 'ok';

    case 'lddr':
      cpu.lddr();
      return 'ok';

    // --- LEA ---

    case 'lea': {
      const base = cpu.getPair(instr.base);
      cpu.setPair(instr.dest, (base + instr.displacement) & 0xffffff);
      return 'ok';
    }

    // --- MLT ---

    case 'mlt': {
      const pair = instr.reg;
      const val = cpu.getPair(pair);
      const hi = (val >> 8) & 0xff;
      const lo = val & 0xff;
      cpu.setPair(pair, (hi * lo) & 0xffff);
      return 'ok';
    }

    // --- TST ---

    case 'tst-reg':
      cpu.and8(cpu.a, cpu.getReg8(instr.reg));
      return 'ok';

    case 'tst-imm':
      cpu.and8(cpu.a, instr.value);
      return 'ok';

    case 'tst-ind':
      cpu.and8(cpu.a, cpu.read8(cpu._hl));
      return 'ok';

    case 'tstio':
      return 'ok'; // skip I/O

    // =========================================================================
    // Control flow — the standalone interpreter must FOLLOW branches
    // =========================================================================

    case 'ret':
    case 'retn':
    case 'reti': {
      cpu.pc = cpu.pop();
      applyModePrefix();
      return 'branch';
    }

    case 'ret-conditional': {
      if (cpu.cond(instr.condition)) {
        cpu.pc = cpu.pop();
      } else {
        cpu.pc = instr.fallthrough;
      }
      applyModePrefix();
      return 'branch';
    }

    case 'call': {
      cpu.push(instr.fallthrough);
      cpu.pc = instr.target;
      applyModePrefix();
      return 'branch';
    }

    case 'call-conditional': {
      if (cpu.cond(instr.condition)) {
        cpu.push(instr.fallthrough);
        cpu.pc = instr.target;
      } else {
        cpu.pc = instr.fallthrough;
      }
      applyModePrefix();
      return 'branch';
    }

    case 'rst': {
      cpu.push(instr.fallthrough);
      cpu.pc = instr.target;
      applyModePrefix();
      return 'branch';
    }

    case 'jp': {
      cpu.pc = instr.target;
      applyModePrefix();
      return 'branch';
    }

    case 'jp-conditional': {
      if (cpu.cond(instr.condition)) {
        cpu.pc = instr.target;
      } else {
        cpu.pc = instr.fallthrough;
      }
      applyModePrefix();
      return 'branch';
    }

    case 'jp-indirect': {
      cpu.pc = cpu.getPair(instr.indirectRegister);
      applyModePrefix();
      return 'branch';
    }

    case 'jr': {
      cpu.pc = instr.target;
      applyModePrefix();
      return 'branch';
    }

    case 'jr-conditional': {
      if (cpu.cond(instr.condition)) {
        cpu.pc = instr.target;
      } else {
        cpu.pc = instr.fallthrough;
      }
      applyModePrefix();
      return 'branch';
    }

    case 'djnz': {
      const bVal = (cpu._bc >> 8) & 0xff;
      const newB = (bVal - 1) & 0xff;
      cpu._bc = (cpu._bc & 0xff00ff) | (newB << 8);
      if (newB !== 0) {
        cpu.pc = instr.target;
      } else {
        cpu.pc = instr.fallthrough;
      }
      applyModePrefix();
      return 'branch';
    }

    case 'stmix':
      cpu.madl = 1;
      cpu.pc = instr.nextPc;
      return 'branch'; // mode change = block boundary

    case 'rsmix':
      cpu.madl = 0;
      cpu.pc = instr.nextPc;
      return 'branch'; // mode change = block boundary

    // I/O — skip
    case 'in-imm':
    case 'out-imm':
    case 'in-reg':
    case 'out-reg':
    case 'in0':
    case 'out0':
      return 'ok'; // treat as NOP for register comparison

    default:
      return 'unsupported';
  }
}

// ============================================================================
// Run standalone interpreter for one block (until a branch instruction)
// Returns the PC after the branch (= start of next block)
// ============================================================================

function runStandaloneBlock(cpu, mode) {
  let instrCount = 0;
  const maxInstrs = 500;
  const instructions = [];
  let currentMode = mode;

  while (instrCount < maxInstrs) {
    instrCount++;

    let instr;
    try {
      instr = decodeInstruction(cpu.mem, cpu.pc, currentMode);
    } catch (err) {
      return { ok: false, reason: `decode error at ${hex(cpu.pc)}: ${err.message}`, instructions };
    }

    instructions.push({ pc: cpu.pc, instr });

    const result = execStandalone(instr, cpu);

    if (result === 'unsupported') {
      return { ok: false, reason: `unsupported instruction: ${instr.tag} at ${hex(cpu.pc)}`, instructions };
    }

    if (result === 'branch') {
      // cpu.pc already set by the branch handler
      // Update mode based on madl
      const nextMode = cpu.madl ? 'adl' : 'z80';
      return { ok: true, instructions, nextPc: cpu.pc, nextMode };
    }

    // 'ok' — advance PC to next instruction
    cpu.pc = instr.nextPc;
    // Track mode changes from stmix/rsmix
    currentMode = cpu.madl ? 'adl' : 'z80';
  }

  return { ok: false, reason: 'block too long (>500 instructions)', instructions };
}

// ============================================================================
// Transpiled side: runtime setup (same as phase 171)
// ============================================================================

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
// Snapshot helpers for the transpiled CPU
// ============================================================================

function snapshotTranspiledCpu(cpu) {
  return {
    a: cpu.a,
    f: cpu.f,
    _bc: cpu._bc,
    _de: cpu._de,
    _hl: cpu._hl,
    sp: cpu.sp,
    _ix: cpu._ix,
    _iy: cpu._iy,
    _a2: cpu._a2,
    _f2: cpu._f2,
    _bc2: cpu._bc2,
    _de2: cpu._de2,
    _hl2: cpu._hl2,
    pc: 0, // not meaningful here
  };
}

// ============================================================================
// Compare two snapshots
// ============================================================================

function compareSnapshots(label, transpiled, standalone) {
  const diffs = [];

  const check = (name, a, b, mask = 0xffffff) => {
    if ((a & mask) !== (b & mask)) {
      diffs.push({ reg: name, transpiled: a & mask, standalone: b & mask });
    }
  };

  check('A', transpiled.a, standalone.a, 0xff);
  check('F', transpiled.f, standalone.f, 0xff);
  check('BC', transpiled._bc, standalone._bc);
  check('DE', transpiled._de, standalone._de);
  check('HL', transpiled._hl, standalone._hl);
  check('SP', transpiled.sp, standalone.sp);
  check('IX', transpiled._ix, standalone._ix);
  check('IY', transpiled._iy, standalone._iy);
  check("A'", transpiled._a2, standalone._a2, 0xff);
  check("F'", transpiled._f2, standalone._f2, 0xff);
  check("BC'", transpiled._bc2, standalone._bc2);
  check("DE'", transpiled._de2, standalone._de2);
  check("HL'", transpiled._hl2, standalone._hl2);

  return diffs;
}

function compareMemory(transpiledMem, standaloneMem, addr, len, label) {
  const diffs = [];
  for (let i = 0; i < len; i++) {
    const t = transpiledMem[addr + i] & 0xff;
    const s = standaloneMem[addr + i] & 0xff;
    if (t !== s) {
      diffs.push({ label: `${label}[${i}]`, addr: addr + i, transpiled: t, standalone: s });
    }
  }
  return diffs;
}

function printCpuState(indent, s) {
  console.log(`${indent}A=${hexByte(s.a)}  F=${hexByte(s.f)} [${flagsToString(s.f)}]`);
  console.log(`${indent}BC=${hex(s._bc)}  DE=${hex(s._de)}  HL=${hex(s._hl)}`);
  console.log(`${indent}SP=${hex(s.sp)}  IX=${hex(s._ix)}  IY=${hex(s._iy)}`);
}

// ============================================================================
// Main comparison probe
// ============================================================================

function runComparison(runtime) {
  console.log('='.repeat(80));
  console.log('PHASE 172: STANDALONE INTERPRETER vs TRANSPILED COMPARISON');
  console.log('='.repeat(80));
  console.log('');

  const { mem: transpiledMem, executor, cpu: transpiledCpu } = runtime;

  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 12.0
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 8.0

  // Prepare transpiled side
  prepareCallState(transpiledCpu, transpiledMem);
  seedGcdFpState(transpiledMem, op1Bytes, op2Bytes);

  const fpsPtr = read24(transpiledMem, FPS_ADDR);
  const op2Copy = readBytes(transpiledMem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) transpiledMem[fpsPtr + i] = op2Copy[i];
  write24(transpiledMem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(transpiledCpu, transpiledMem, FAKE_RET, ERR_CATCH_ADDR, 0);

  // --- Clone the ENTIRE state for the standalone side ---
  // This gives the standalone interpreter its own independent memory.
  const standaloneMem = new Uint8Array(transpiledMem);
  const standaloneCpu = new StandaloneCPU(standaloneMem);

  // Copy all register state from transpiledCpu to standaloneCpu
  standaloneCpu.a = transpiledCpu.a;
  standaloneCpu.f = transpiledCpu.f;
  standaloneCpu._bc = transpiledCpu._bc;
  standaloneCpu._de = transpiledCpu._de;
  standaloneCpu._hl = transpiledCpu._hl;
  standaloneCpu._a2 = transpiledCpu._a2;
  standaloneCpu._f2 = transpiledCpu._f2;
  standaloneCpu._bc2 = transpiledCpu._bc2;
  standaloneCpu._de2 = transpiledCpu._de2;
  standaloneCpu._hl2 = transpiledCpu._hl2;
  standaloneCpu.sp = transpiledCpu.sp;
  standaloneCpu._ix = transpiledCpu._ix;
  standaloneCpu._iy = transpiledCpu._iy;
  standaloneCpu.pc = GCD_ENTRY;
  standaloneCpu.madl = transpiledCpu.madl;
  standaloneCpu.mbase = transpiledCpu.mbase;
  standaloneCpu.i = transpiledCpu.i;
  standaloneCpu.im = transpiledCpu.im;
  standaloneCpu.iff1 = transpiledCpu.iff1;
  standaloneCpu.iff2 = transpiledCpu.iff2;

  console.log(`Entry OP1: [${formatBytes(readBytes(transpiledMem, OP1_ADDR, 9))}]`);
  console.log(`Entry OP2: [${formatBytes(readBytes(transpiledMem, OP2_ADDR, 9))}]`);
  console.log(`Entry SP:  ${hex(transpiledCpu.sp)}`);
  console.log(`Entry PC:  ${hex(GCD_ENTRY)}`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';
  let firstDivergence = null;
  let skippedBlocks = 0;
  let checkedBlocks = 0;
  let matchedBlocks = 0;

  // The standalone interpreter runs in lockstep with the transpiled side.
  // For each transpiled block:
  //   1. onBlock fires (before transpiled block runs) — record transpiled PC
  //   2. We run the standalone interpreter from its current PC to the next branch
  //   3. After the transpiled block runs, we compare
  //
  // Strategy: on each onBlock(pc), the standalone should also be at the same PC.
  // If PCs diverge, that means the two took different branches — that IS a divergence.
  //
  // Implementation: use "pendingBefore" pattern. On onBlock(N):
  //   - If we have a pending block N-1:
  //     a. The transpiled side just finished block N-1 (current state = post-N-1)
  //     b. The standalone side already ran block N-1 independently
  //     c. Compare transpiled post-state vs standalone post-state
  //   - Then run standalone for block N (setting up the next comparison)

  let pendingStep = null; // { step, pc, mode }
  let standaloneBlockResult = null; // result of last standalone block run

  function processBlock(currentPc, currentMode, currentStep) {
    if (firstDivergence) return;

    // --- Compare previous block ---
    if (pendingStep !== null) {
      const transSnap = snapshotTranspiledCpu(transpiledCpu);
      const standSnap = standaloneCpu.snapshot();

      // First check: did the two sides arrive at the same PC?
      const transPc = currentPc & 0xffffff;
      const standPc = standaloneCpu.pc & 0xffffff;

      if (standaloneBlockResult && !standaloneBlockResult.ok) {
        skippedBlocks++;
        console.log(
          `  step ${String(pendingStep.step).padStart(4)} Block ${hex(pendingStep.pc)} ` +
          `[SKIP: ${standaloneBlockResult.reason}]`
        );
        // Resync standalone to transpiled PC
        standaloneCpu.pc = currentPc;
        // Also resync all register state and memory from transpiled side
        // (since we can't trust standalone after a skip)
        standaloneCpu.a = transpiledCpu.a;
        standaloneCpu.f = transpiledCpu.f;
        standaloneCpu._bc = transpiledCpu._bc;
        standaloneCpu._de = transpiledCpu._de;
        standaloneCpu._hl = transpiledCpu._hl;
        standaloneCpu._a2 = transpiledCpu._a2;
        standaloneCpu._f2 = transpiledCpu._f2;
        standaloneCpu._bc2 = transpiledCpu._bc2;
        standaloneCpu._de2 = transpiledCpu._de2;
        standaloneCpu._hl2 = transpiledCpu._hl2;
        standaloneCpu.sp = transpiledCpu.sp;
        standaloneCpu._ix = transpiledCpu._ix;
        standaloneCpu._iy = transpiledCpu._iy;
        standaloneCpu.madl = transpiledCpu.madl;
        standaloneCpu.mbase = transpiledCpu.mbase;
        // Copy relevant memory regions from transpiled to standalone
        standaloneMem.set(transpiledMem.subarray(0xD00000, 0xD40000), 0xD00000);
      } else {
        checkedBlocks++;

        // Check PC agreement first
        if (transPc !== standPc) {
          firstDivergence = {
            step: pendingStep.step,
            pc: pendingStep.pc,
            mode: pendingStep.mode,
            type: 'pc-divergence',
            transpiledNextPc: transPc,
            standaloneNextPc: standPc,
            transpiledSnap: transSnap,
            standaloneSnap: standSnap,
            instructions: standaloneBlockResult?.instructions || [],
          };
          console.log(
            `  step ${String(pendingStep.step).padStart(4)} Block ${hex(pendingStep.pc)} ` +
            `[PC DIVERGE] transpiled->${hex(transPc)} standalone->${hex(standPc)}`
          );
          return;
        }

        // Compare register state
        const regDiffs = compareSnapshots('regs', transSnap, standSnap);

        // Compare memory regions
        const op1Diffs = compareMemory(transpiledMem, standaloneMem, OP1_ADDR, 9, 'OP1');
        const op2Diffs = compareMemory(transpiledMem, standaloneMem, OP2_ADDR, 9, 'OP2');
        const errDiff = (transpiledMem[ERR_NO_ADDR] !== standaloneMem[ERR_NO_ADDR])
          ? [{ label: 'errNo', addr: ERR_NO_ADDR, transpiled: transpiledMem[ERR_NO_ADDR], standalone: standaloneMem[ERR_NO_ADDR] }]
          : [];
        const fpsDiffs = compareMemory(transpiledMem, standaloneMem, FPS_PTR_ADDR, 3, 'FPS_PTR');

        const allDiffs = [...regDiffs, ...op1Diffs, ...op2Diffs, ...errDiff, ...fpsDiffs];

        if (allDiffs.length > 0) {
          firstDivergence = {
            step: pendingStep.step,
            pc: pendingStep.pc,
            mode: pendingStep.mode,
            type: 'state-divergence',
            diffs: allDiffs,
            transpiledSnap: transSnap,
            standaloneSnap: standSnap,
            instructions: standaloneBlockResult?.instructions || [],
          };
          console.log(
            `  step ${String(pendingStep.step).padStart(4)} Block ${hex(pendingStep.pc)} [DIVERGE]  ***`
          );
        } else {
          matchedBlocks++;
          if (matchedBlocks <= 20 || matchedBlocks % 100 === 0) {
            console.log(
              `  step ${String(pendingStep.step).padStart(4)} Block ${hex(pendingStep.pc)} [MATCH]`
            );
          }
        }
      }
    }

    if (firstDivergence) return;

    // --- Run standalone for current block ---
    const saMode = standaloneCpu.madl ? 'adl' : 'z80';
    standaloneBlockResult = runStandaloneBlock(standaloneCpu, saMode);
    pendingStep = { step: currentStep, pc: currentPc, mode: currentMode };
  }

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
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
        // Can't compare — flush pending and resync
        if (pendingStep !== null) {
          skippedBlocks++;
          console.log(
            `  step ${String(pendingStep.step).padStart(4)} Block ${hex(pendingStep.pc)} ` +
            `[SKIP: transpiled missing block at ${hex(norm)}]`
          );
        }
        pendingStep = null;
        standaloneBlockResult = null;
        // Resync standalone
        standaloneCpu.pc = norm;
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
  console.log(`Outcome: ${outcome}  |  Steps: ${stepCount}  |  Matched: ${matchedBlocks}  |  Checked: ${checkedBlocks}  |  Skipped: ${skippedBlocks}`);
  console.log('='.repeat(80));
  console.log('');

  if (firstDivergence) {
    const d = firstDivergence;
    console.log(`FIRST DIVERGENCE at step ${d.step}, Block ${hex(d.pc)} (mode=${d.mode})`);
    console.log(`Type: ${d.type}`);
    console.log('');

    if (d.type === 'pc-divergence') {
      console.log(`  Transpiled next PC: ${hex(d.transpiledNextPc)}`);
      console.log(`  Standalone next PC: ${hex(d.standaloneNextPc)}`);
      console.log('');
    }

    if (d.diffs) {
      console.log('--- REGISTER/MEMORY DIFFERENCES ---');
      for (const diff of d.diffs) {
        const isSmall = diff.reg === 'A' || diff.reg === 'F' || diff.reg === "A'" || diff.reg === "F'";
        const w = isSmall ? 2 : 6;
        const tVal = diff.transpiled ?? diff.transpiled;
        const sVal = diff.standalone ?? diff.standalone;
        const name = diff.reg || diff.label;
        console.log(`  ${String(name).padEnd(8)} transpiled=${hex(tVal, w)}  standalone=${hex(sVal, w)}`);
        if (diff.reg === 'F' || diff.reg === "F'") {
          console.log(`  ${' '.repeat(8)} transpiled=[${flagsToString(tVal)}]  standalone=[${flagsToString(sVal)}]`);
        }
      }
      console.log('');
    }

    if (d.instructions && d.instructions.length > 0) {
      console.log('--- INSTRUCTIONS IN DIVERGING BLOCK (standalone) ---');
      for (const { pc: ipc, instr } of d.instructions) {
        const bytes = readBytes(romBytes, ipc, instr.length);
        const byteStr = formatBytes(bytes).padEnd(18);
        console.log(`  ${hex(ipc)}  ${byteStr}  ${instr.tag}`);
      }
      console.log('');
    }

    console.log('--- TRANSPILED CPU STATE (after block) ---');
    printCpuState('  ', d.transpiledSnap);

    console.log('');
    console.log('--- STANDALONE CPU STATE (after block) ---');
    printCpuState('  ', d.standaloneSnap);

  } else {
    console.log('No divergence found in checked blocks.');
    const errNo = transpiledMem[ERR_NO_ADDR] & 0xff;
    const finalOP1 = readBytes(transpiledMem, OP1_ADDR, 9);
    const finalOP2 = readBytes(transpiledMem, OP2_ADDR, 9);
    console.log(`Transpiled errNo: 0x${hexByte(errNo)}`);
    console.log(`Transpiled final OP1: [${formatBytes(finalOP1)}]`);
    console.log(`Transpiled final OP2: [${formatBytes(finalOP2)}]`);

    const sErrNo = standaloneMem[ERR_NO_ADDR] & 0xff;
    const sOP1 = readBytes(standaloneMem, OP1_ADDR, 9);
    const sOP2 = readBytes(standaloneMem, OP2_ADDR, 9);
    console.log(`Standalone errNo: 0x${hexByte(sErrNo)}`);
    console.log(`Standalone final OP1: [${formatBytes(sOP1)}]`);
    console.log(`Standalone final OP2: [${formatBytes(sOP2)}]`);
  }

  console.log('');
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('=== Phase 172: Standalone eZ80 Interpreter vs Transpiled ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  runComparison(runtime);

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}

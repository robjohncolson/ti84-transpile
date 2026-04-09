// CPU runtime scaffold for executing lifted Z80/eZ80 ROM blocks
// Implements all cpu.* methods referenced by ROM.transpiled.js

const FLAG_C = 0x01;
const FLAG_N = 0x02;
const FLAG_PV = 0x04;
const FLAG_X = 0x08;
const FLAG_H = 0x10;
const FLAG_Y = 0x20;
const FLAG_Z = 0x40;
const FLAG_S = 0x80;

function parity(value) {
  let bits = value & 0xff;
  bits ^= bits >> 4;
  bits ^= bits >> 2;
  bits ^= bits >> 1;
  return (bits & 1) === 0;
}

export class CPU {
  constructor(memory) {
    this.memory = memory || new Uint8Array(0x400000);

    // 8-bit registers
    this.a = 0;
    this.f = 0;
    this.b = 0;
    this.c = 0;
    this.d = 0;
    this.e = 0;
    this.h = 0;
    this.l = 0;

    // Alternate registers
    this._a2 = 0;
    this._f2 = 0;
    this._b2 = 0;
    this._c2 = 0;
    this._d2 = 0;
    this._e2 = 0;
    this._h2 = 0;
    this._l2 = 0;

    // 24-bit standalone registers
    this.sp = 0;
    this._ix = 0;
    this._iy = 0;

    // Special
    this.i = 0;
    this.im = 0;
    this.iff1 = 0;
    this.iff2 = 0;
    this.madl = 1; // ADL mode by default for eZ80

    this.halted = false;
    this.cycles = 0;

    // I/O callback stubs
    this._ioRead = () => 0xff;
    this._ioWrite = () => {};
  }

  // --- Register pair getters/setters ---

  get bc() { return (this.b << 8) | this.c; }
  set bc(v) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }

  get de() { return (this.d << 8) | this.e; }
  set de(v) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }

  get hl() { return (this.h << 8) | this.l; }
  set hl(v) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }

  get af() { return (this.a << 8) | this.f; }
  set af(v) { this.a = (v >> 8) & 0xff; this.f = v & 0xff; }

  get ix() { return this._ix; }
  set ix(v) { this._ix = v & 0xffffff; }

  get iy() { return this._iy; }
  set iy(v) { this._iy = v & 0xffffff; }

  get ixh() { return (this._ix >> 8) & 0xff; }
  set ixh(v) { this._ix = (this._ix & 0xff00ff) | ((v & 0xff) << 8); }

  get ixl() { return this._ix & 0xff; }
  set ixl(v) { this._ix = (this._ix & 0xffff00) | (v & 0xff); }

  get iyh() { return (this._iy >> 8) & 0xff; }
  set iyh(v) { this._iy = (this._iy & 0xff00ff) | ((v & 0xff) << 8); }

  get iyl() { return this._iy & 0xff; }
  set iyl(v) { this._iy = (this._iy & 0xffff00) | (v & 0xff); }

  get addressMask() { return this.madl ? 0xffffff : 0xffff; }

  // --- Memory ---

  read8(addr) {
    return this.memory[addr & 0x3fffff] ?? 0;
  }

  write8(addr, value) {
    this.memory[addr & 0x3fffff] = value & 0xff;
  }

  read16(addr) {
    const a = addr & 0x3fffff;
    return this.memory[a] | (this.memory[a + 1] << 8);
  }

  write16(addr, value) {
    const a = addr & 0x3fffff;
    this.memory[a] = value & 0xff;
    this.memory[a + 1] = (value >> 8) & 0xff;
  }

  read24(addr) {
    const a = addr & 0x3fffff;
    return this.memory[a] | (this.memory[a + 1] << 8) | (this.memory[a + 2] << 16);
  }

  write24(addr, value) {
    const a = addr & 0x3fffff;
    this.memory[a] = value & 0xff;
    this.memory[a + 1] = (value >> 8) & 0xff;
    this.memory[a + 2] = (value >> 16) & 0xff;
  }

  readIndirect8(pair) {
    return this.read8(this[pair]);
  }

  writeIndirect8(pair, value) {
    this.write8(this[pair], value);
  }

  readIndirect24(pair) {
    return this.read24(this[pair]);
  }

  writeIndirect24(pair, value) {
    this.write24(this[pair], value);
  }

  readIndexed8(reg, displacement) {
    return this.read8((this[reg] + displacement) & this.addressMask);
  }

  writeIndexed8(reg, displacement, value) {
    this.write8((this[reg] + displacement) & this.addressMask, value);
  }

  // --- Flags helpers ---

  _setFlag(flag, value) {
    if (value) {
      this.f |= flag;
    } else {
      this.f &= ~flag;
    }
  }

  _getFlag(flag) {
    return (this.f & flag) !== 0;
  }

  _szFlags(result) {
    this._setFlag(FLAG_S, result & 0x80);
    this._setFlag(FLAG_Z, (result & 0xff) === 0);
    this._setFlag(FLAG_X, result & FLAG_X);
    this._setFlag(FLAG_Y, result & FLAG_Y);
  }

  // --- 8-bit ALU ---

  add8(a, b) {
    const result = a + b;
    this._szFlags(result);
    this._setFlag(FLAG_H, ((a ^ b ^ result) & 0x10) !== 0);
    this._setFlag(FLAG_PV, ((a ^ result) & (b ^ result) & 0x80) !== 0);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, result > 0xff);
    return result & 0xff;
  }

  subtract8(a, b) {
    const result = a - b;
    this._szFlags(result);
    this._setFlag(FLAG_H, ((a ^ b ^ result) & 0x10) !== 0);
    this._setFlag(FLAG_PV, ((a ^ b) & (a ^ result) & 0x80) !== 0);
    this._setFlag(FLAG_N, true);
    this._setFlag(FLAG_C, result < 0);
    return result & 0xff;
  }

  addWithCarry8(a, b) {
    const carry = this._getFlag(FLAG_C) ? 1 : 0;
    const result = a + b + carry;
    this._szFlags(result);
    this._setFlag(FLAG_H, ((a ^ b ^ result) & 0x10) !== 0);
    this._setFlag(FLAG_PV, ((a ^ result) & (b ^ result) & 0x80) !== 0);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, result > 0xff);
    return result & 0xff;
  }

  subtractWithBorrow8(a, b) {
    const carry = this._getFlag(FLAG_C) ? 1 : 0;
    const result = a - b - carry;
    this._szFlags(result);
    this._setFlag(FLAG_H, ((a ^ b ^ result) & 0x10) !== 0);
    this._setFlag(FLAG_PV, ((a ^ b) & (a ^ result) & 0x80) !== 0);
    this._setFlag(FLAG_N, true);
    this._setFlag(FLAG_C, result < 0);
    return result & 0xff;
  }

  compare(a, b) {
    this.subtract8(a, b);
  }

  negate(a) {
    return this.subtract8(0, a);
  }

  decimalAdjustAccumulator(a) {
    let result = a;
    let correction = 0;

    if (this._getFlag(FLAG_H) || (!this._getFlag(FLAG_N) && (result & 0x0f) > 9)) {
      correction |= 0x06;
    }

    if (this._getFlag(FLAG_C) || (!this._getFlag(FLAG_N) && result > 0x99)) {
      correction |= 0x60;
      this._setFlag(FLAG_C, true);
    }

    if (this._getFlag(FLAG_N)) {
      result -= correction;
    } else {
      result += correction;
    }

    result &= 0xff;
    this._setFlag(FLAG_S, result & 0x80);
    this._setFlag(FLAG_Z, result === 0);
    this._setFlag(FLAG_H, ((a ^ result) & 0x10) !== 0);
    this._setFlag(FLAG_PV, parity(result));
    return result;
  }

  updateLogicFlags(result) {
    const r = result & 0xff;
    this._setFlag(FLAG_S, r & 0x80);
    this._setFlag(FLAG_Z, r === 0);
    this._setFlag(FLAG_H, true);
    this._setFlag(FLAG_PV, parity(r));
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, false);
    this._setFlag(FLAG_X, r & FLAG_X);
    this._setFlag(FLAG_Y, r & FLAG_Y);
  }

  test(a, b) {
    this.updateLogicFlags(a & b);
  }

  // --- 16/24-bit ALU ---

  addWord(a, b) {
    const result = a + b;
    this._setFlag(FLAG_H, ((a ^ b ^ result) & 0x1000) !== 0);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, result > this.addressMask);
    return result & this.addressMask;
  }

  addWithCarryWord(a, b) {
    const carry = this._getFlag(FLAG_C) ? 1 : 0;
    const result = a + b + carry;
    const r16 = result & 0xffff;
    this._setFlag(FLAG_S, r16 & 0x8000);
    this._setFlag(FLAG_Z, r16 === 0);
    this._setFlag(FLAG_H, ((a ^ b ^ result) & 0x1000) !== 0);
    this._setFlag(FLAG_PV, ((a ^ result) & (b ^ result) & 0x8000) !== 0);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, result > 0xffff);
    return result & this.addressMask;
  }

  subtractWithBorrowWord(a, b) {
    const carry = this._getFlag(FLAG_C) ? 1 : 0;
    const result = a - b - carry;
    const r16 = result & 0xffff;
    this._setFlag(FLAG_S, r16 & 0x8000);
    this._setFlag(FLAG_Z, r16 === 0);
    this._setFlag(FLAG_H, ((a ^ b ^ result) & 0x1000) !== 0);
    this._setFlag(FLAG_PV, ((a ^ b) & (a ^ result) & 0x8000) !== 0);
    this._setFlag(FLAG_N, true);
    this._setFlag(FLAG_C, result < 0);
    return result & this.addressMask;
  }

  multiplyBytes(pair) {
    const hi = (pair >> 8) & 0xff;
    const lo = pair & 0xff;
    return (hi * lo) & 0xffff;
  }

  // --- Rotate/Shift ---

  rotateLeftCircular(a) {
    const bit7 = (a >> 7) & 1;
    const result = ((a << 1) | bit7) & 0xff;
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, bit7);
    return result;
  }

  rotateRightCircular(a) {
    const bit0 = a & 1;
    const result = ((a >> 1) | (bit0 << 7)) & 0xff;
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, bit0);
    return result;
  }

  rotateLeftThroughCarry(a) {
    const oldCarry = this._getFlag(FLAG_C) ? 1 : 0;
    const bit7 = (a >> 7) & 1;
    const result = ((a << 1) | oldCarry) & 0xff;
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, bit7);
    return result;
  }

  rotateRightThroughCarry(a) {
    const oldCarry = this._getFlag(FLAG_C) ? 1 : 0;
    const bit0 = a & 1;
    const result = ((a >> 1) | (oldCarry << 7)) & 0xff;
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, bit0);
    return result;
  }

  rotateShift8(op, value) {
    let result;

    switch (op) {
      case 'rlc': {
        const bit7 = (value >> 7) & 1;
        result = ((value << 1) | bit7) & 0xff;
        this._setFlag(FLAG_C, bit7);
        break;
      }
      case 'rrc': {
        const bit0 = value & 1;
        result = ((value >> 1) | (bit0 << 7)) & 0xff;
        this._setFlag(FLAG_C, bit0);
        break;
      }
      case 'rl': {
        const oldCarry = this._getFlag(FLAG_C) ? 1 : 0;
        result = ((value << 1) | oldCarry) & 0xff;
        this._setFlag(FLAG_C, (value >> 7) & 1);
        break;
      }
      case 'rr': {
        const oldCarry = this._getFlag(FLAG_C) ? 1 : 0;
        result = ((value >> 1) | (oldCarry << 7)) & 0xff;
        this._setFlag(FLAG_C, value & 1);
        break;
      }
      case 'sla': {
        result = (value << 1) & 0xff;
        this._setFlag(FLAG_C, (value >> 7) & 1);
        break;
      }
      case 'sra': {
        result = ((value >> 1) | (value & 0x80)) & 0xff;
        this._setFlag(FLAG_C, value & 1);
        break;
      }
      case 'srl': {
        result = (value >> 1) & 0xff;
        this._setFlag(FLAG_C, value & 1);
        break;
      }
      case 'sll': {
        result = ((value << 1) | 1) & 0xff;
        this._setFlag(FLAG_C, (value >> 7) & 1);
        break;
      }
      default:
        result = value;
    }

    this._szFlags(result);
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_PV, parity(result));
    return result;
  }

  // --- Bit operations ---

  testBit(value, bit) {
    const result = value & (1 << bit);
    this._setFlag(FLAG_Z, result === 0);
    this._setFlag(FLAG_H, true);
    this._setFlag(FLAG_N, false);
  }

  complementCarryFlag() {
    this._setFlag(FLAG_H, this._getFlag(FLAG_C));
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, !this._getFlag(FLAG_C));
  }

  setCarryFlag() {
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, true);
  }

  // --- Block transfer ---

  ldi() {
    this.write8(this.de, this.read8(this.hl));
    this.hl = (this.hl + 1) & this.addressMask;
    this.de = (this.de + 1) & this.addressMask;
    this.bc = (this.bc - 1) & this.addressMask;
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_PV, this.bc !== 0);
    this._setFlag(FLAG_N, false);
  }

  ldir() {
    do { this.ldi(); } while (this.bc !== 0);
  }

  ldd() {
    this.write8(this.de, this.read8(this.hl));
    this.hl = (this.hl - 1) & this.addressMask;
    this.de = (this.de - 1) & this.addressMask;
    this.bc = (this.bc - 1) & this.addressMask;
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_PV, this.bc !== 0);
    this._setFlag(FLAG_N, false);
  }

  lddr() {
    do { this.ldd(); } while (this.bc !== 0);
  }

  cpi() {
    const value = this.read8(this.hl);
    const result = this.a - value;
    this.hl = (this.hl + 1) & this.addressMask;
    this.bc = (this.bc - 1) & this.addressMask;
    this._szFlags(result);
    this._setFlag(FLAG_H, ((this.a ^ value ^ result) & 0x10) !== 0);
    this._setFlag(FLAG_PV, this.bc !== 0);
    this._setFlag(FLAG_N, true);
  }

  cpir() {
    do {
      this.cpi();
    } while (this.bc !== 0 && !this._getFlag(FLAG_Z));
  }

  // --- BCD rotate ---

  rld() {
    const value = this.read8(this.hl);
    const newValue = ((value << 4) | (this.a & 0x0f)) & 0xff;
    this.a = (this.a & 0xf0) | ((value >> 4) & 0x0f);
    this.write8(this.hl, newValue);
    this._szFlags(this.a);
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_PV, parity(this.a));
    this._setFlag(FLAG_N, false);
  }

  rrd() {
    const value = this.read8(this.hl);
    const newValue = ((this.a << 4) | ((value >> 4) & 0x0f)) & 0xff;
    this.a = (this.a & 0xf0) | (value & 0x0f);
    this.write8(this.hl, newValue);
    this._szFlags(this.a);
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_PV, parity(this.a));
    this._setFlag(FLAG_N, false);
  }

  // --- I/O ---

  ioRead(port) {
    return this._ioRead(port) & 0xff;
  }

  ioWrite(port, value) {
    this._ioWrite(port, value & 0xff);
  }

  ioReadPage0(port) {
    return this._ioRead(port & 0xff) & 0xff;
  }

  ioWritePage0(port, value) {
    this._ioWrite(port & 0xff, value & 0xff);
  }

  ioReadImmediate(a, port) {
    return this._ioRead((a << 8) | (port & 0xff)) & 0xff;
  }

  testIo(mask) {
    const value = this.ioRead(this.c) & mask;
    this.updateLogicFlags(value);
  }

  otimr() {
    // Output, increment, repeat (eZ80-specific)
    const value = this.read8(this.hl);
    this.ioWrite(this.c, value);
    this.hl = (this.hl + 1) & this.addressMask;
    this.b = (this.b - 1) & 0xff;
    // Repeat is handled in emitter, not here
  }

  // --- Stack/Control ---

  push(value) {
    if (this.madl) {
      this.sp = (this.sp - 3) & 0xffffff;
      this.write24(this.sp, value);
    } else {
      this.sp = (this.sp - 2) & 0xffff;
      this.write16(this.sp, value);
    }
  }

  pop() {
    if (this.madl) {
      const value = this.read24(this.sp);
      this.sp = (this.sp + 3) & 0xffffff;
      return value;
    }
    const value = this.read16(this.sp);
    this.sp = (this.sp + 2) & 0xffff;
    return value;
  }

  call(target) {
    // Push return address — the emitted code handles control flow
    // The return address is the PC after the call instruction,
    // which the block already computed as fallthrough
    // For now, push a placeholder; actual PC tracking done by executor
    this._callStack = this._callStack || [];
    this._callStack.push(target);
  }

  popReturn() {
    return this.pop();
  }

  checkCondition(cond) {
    switch (cond) {
      case 'z': return this._getFlag(FLAG_Z);
      case 'nz': return !this._getFlag(FLAG_Z);
      case 'c': return this._getFlag(FLAG_C);
      case 'nc': return !this._getFlag(FLAG_C);
      case 'pe': return this._getFlag(FLAG_PV);
      case 'po': return !this._getFlag(FLAG_PV);
      case 'm': return this._getFlag(FLAG_S);
      case 'p': return !this._getFlag(FLAG_S);
      default: return false;
    }
  }

  decrementAndCheckB() {
    this.b = (this.b - 1) & 0xff;
    return this.b !== 0;
  }

  halt() {
    this.halted = true;
    return -1; // Sentinel: CPU halted
  }

  sleep() {
    this.halted = true;
    return -2; // Sentinel: CPU sleeping
  }

  // --- Exchange ---

  swapMainAlternate() {
    let tmp;
    tmp = this.b; this.b = this._b2; this._b2 = tmp;
    tmp = this.c; this.c = this._c2; this._c2 = tmp;
    tmp = this.d; this.d = this._d2; this._d2 = tmp;
    tmp = this.e; this.e = this._e2; this._e2 = tmp;
    tmp = this.h; this.h = this._h2; this._h2 = tmp;
    tmp = this.l; this.l = this._l2; this._l2 = tmp;
  }

  swapAf() {
    let tmp;
    tmp = this.a; this.a = this._a2; this._a2 = tmp;
    tmp = this.f; this.f = this._f2; this._f2 = tmp;
  }

  // --- Misc ---

  unimplemented(pc, dasm) {
    // Stub — log and continue
    if (typeof console !== 'undefined') {
      console.warn(`Unimplemented: ${dasm} at 0x${pc.toString(16).padStart(6, '0')}`);
    }
  }
}

export function createExecutor(blocks, memory) {
  const cpu = new CPU(memory);

  // Compile block source strings into callable functions
  const compiledBlocks = {};
  for (const [key, block] of Object.entries(blocks)) {
    try {
      // The source is a function declaration — wrap it to extract
      const fn = new Function('cpu', block.source.replace(/^function [^(]+\(cpu\) \{/, '').replace(/\}$/, ''));
      compiledBlocks[key] = fn;
    } catch {
      // Skip blocks that fail to compile
    }
  }

  return {
    cpu,
    compiledBlocks,

    runFrom(startAddress, mode = 'adl', maxSteps = 100000) {
      let pc = startAddress;
      let steps = 0;

      while (steps < maxSteps) {
        const key = pc.toString(16).padStart(6, '0') + ':' + mode;
        const fn = compiledBlocks[key];

        if (!fn) {
          break; // No block at this address
        }

        const result = fn(cpu);
        steps++;

        if (result === undefined || result === null) {
          break; // Block didn't return next PC
        }

        if (result < 0) {
          break; // Halt/sleep sentinel
        }

        pc = result;
      }

      return { steps, lastPc: pc, halted: cpu.halted };
    },
  };
}

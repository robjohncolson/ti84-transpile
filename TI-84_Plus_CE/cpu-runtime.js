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
    this._memMask = this.memory.length - 1;

    // 8-bit standalone registers
    this.a = 0;
    this.f = 0;

    // 24-bit register pair backing stores (eZ80 ADL mode)
    // 8-bit registers b,c,d,e,h,l are getters/setters into these
    this._bc = 0;
    this._de = 0;
    this._hl = 0;

    // Alternate registers
    this._a2 = 0;
    this._f2 = 0;
    this._bc2 = 0;
    this._de2 = 0;
    this._hl2 = 0;

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
    // MBASE: upper 8 bits of 24-bit address for Z80-mode (.SIS/.SIL)
    // instructions with 16-bit immediate addresses. Real TI-OS sets this
    // to 0xD0 during boot so that short-addressed RAM vars like (0x059c)
    // resolve to RAM at 0xD0059c instead of ROM at 0x00059c.
    this.mbase = 0;

    this.halted = false;
    this.cycles = 0;

    // I/O callback stubs
    this._ioRead = () => 0xff;
    this._ioWrite = () => {};
  }

  // --- 8-bit register accessors (derived from 24-bit backing stores) ---

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

  // --- 24-bit register pair accessors ---

  get bc() { return this._bc; }
  set bc(v) { this._bc = v & 0xffffff; }

  get de() { return this._de; }
  set de(v) { this._de = v & 0xffffff; }

  get hl() { return this._hl; }
  set hl(v) { this._hl = v & 0xffffff; }

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
    return this.memory[addr & this._memMask] ?? 0;
  }

  write8(addr, value) {
    const a = addr & this._memMask;
    // Flash ROM (0x000000-0x3FFFFF on TI-84 CE) is read-only at hardware level.
    // Silently drop writes — OS code sometimes touches these addresses via
    // wide LDIR loops and we must not corrupt the ROM image.
    if (a < 0x400000) return;
    this.memory[a] = value & 0xff;
  }

  read16(addr) {
    const a = addr & this._memMask;
    return this.memory[a] | (this.memory[a + 1] << 8);
  }

  write16(addr, value) {
    const a = addr & this._memMask;
    if (a < 0x400000) return; // ROM write-protect
    this.memory[a] = value & 0xff;
    this.memory[a + 1] = (value >> 8) & 0xff;
  }

  read24(addr) {
    const a = addr & this._memMask;
    return this.memory[a] | (this.memory[a + 1] << 8) | (this.memory[a + 2] << 16);
  }

  write24(addr, value) {
    const a = addr & this._memMask;
    if (a < 0x400000) return; // ROM write-protect
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

  inc8(value) {
    const result = (value + 1) & 0xff;
    this._szFlags(result);
    this._setFlag(FLAG_H, (value & 0x0f) === 0x0f);
    this._setFlag(FLAG_PV, value === 0x7f);
    this._setFlag(FLAG_N, false);
    // C flag preserved
    return result;
  }

  dec8(value) {
    const result = (value - 1) & 0xff;
    this._szFlags(result);
    this._setFlag(FLAG_H, (value & 0x0f) === 0x00);
    this._setFlag(FLAG_PV, value === 0x80);
    this._setFlag(FLAG_N, true);
    // C flag preserved
    return result;
  }

  updateLogicFlags(result) {
    // AND: H=1, N=0, C=0
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

  updateOrXorFlags(result) {
    // OR/XOR: H=0, N=0, C=0
    const r = result & 0xff;
    this._setFlag(FLAG_S, r & 0x80);
    this._setFlag(FLAG_Z, r === 0);
    this._setFlag(FLAG_H, false);
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
    this._setFlag(FLAG_X, result & FLAG_X);
    this._setFlag(FLAG_Y, result & FLAG_Y);
    return result;
  }

  rotateRightCircular(a) {
    const bit0 = a & 1;
    const result = ((a >> 1) | (bit0 << 7)) & 0xff;
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, bit0);
    this._setFlag(FLAG_X, result & FLAG_X);
    this._setFlag(FLAG_Y, result & FLAG_Y);
    return result;
  }

  rotateLeftThroughCarry(a) {
    const oldCarry = this._getFlag(FLAG_C) ? 1 : 0;
    const bit7 = (a >> 7) & 1;
    const result = ((a << 1) | oldCarry) & 0xff;
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, bit7);
    this._setFlag(FLAG_X, result & FLAG_X);
    this._setFlag(FLAG_Y, result & FLAG_Y);
    return result;
  }

  rotateRightThroughCarry(a) {
    const oldCarry = this._getFlag(FLAG_C) ? 1 : 0;
    const bit0 = a & 1;
    const result = ((a >> 1) | (oldCarry << 7)) & 0xff;
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_N, false);
    this._setFlag(FLAG_C, bit0);
    this._setFlag(FLAG_X, result & FLAG_X);
    this._setFlag(FLAG_Y, result & FLAG_Y);
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
    const zero = result === 0;
    this._setFlag(FLAG_Z, zero);
    this._setFlag(FLAG_PV, zero); // PV mirrors Z for bit test
    this._setFlag(FLAG_S, bit === 7 && !zero);
    this._setFlag(FLAG_H, true);
    this._setFlag(FLAG_N, false);
  }

  ioReadPage0AndUpdateFlags(port) {
    const value = this._ioRead(port & 0xff) & 0xff;
    this._setFlag(FLAG_S, value & 0x80);
    this._setFlag(FLAG_Z, value === 0);
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_PV, parity(value));
    this._setFlag(FLAG_N, false);
    return value;
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

  cpd() {
    const value = this.read8(this.hl);
    const result = this.a - value;
    this.hl = (this.hl - 1) & this.addressMask;
    this.bc = (this.bc - 1) & this.addressMask;
    this._szFlags(result);
    this._setFlag(FLAG_H, ((this.a ^ value ^ result) & 0x10) !== 0);
    this._setFlag(FLAG_PV, this.bc !== 0);
    this._setFlag(FLAG_N, true);
  }

  cpdr() {
    do {
      this.cpd();
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

  ioReadAndUpdateFlags(port) {
    const value = this._ioRead(port) & 0xff;
    this._setFlag(FLAG_S, value & 0x80);
    this._setFlag(FLAG_Z, value === 0);
    this._setFlag(FLAG_H, false);
    this._setFlag(FLAG_PV, parity(value));
    this._setFlag(FLAG_N, false);
    return value;
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
  }

  ini() {
    const value = this.ioRead(this.c);
    this.write8(this.hl, value);
    this.hl = (this.hl + 1) & this.addressMask;
    this.b = (this.b - 1) & 0xff;
    this._setFlag(FLAG_Z, this.b === 0);
    this._setFlag(FLAG_N, true);
  }

  ind() {
    const value = this.ioRead(this.c);
    this.write8(this.hl, value);
    this.hl = (this.hl - 1) & this.addressMask;
    this.b = (this.b - 1) & 0xff;
    this._setFlag(FLAG_Z, this.b === 0);
    this._setFlag(FLAG_N, true);
  }

  outi() {
    const value = this.read8(this.hl);
    this.ioWrite(this.c, value);
    this.hl = (this.hl + 1) & this.addressMask;
    this.b = (this.b - 1) & 0xff;
    this._setFlag(FLAG_Z, this.b === 0);
    this._setFlag(FLAG_N, true);
  }

  outd() {
    const value = this.read8(this.hl);
    this.ioWrite(this.c, value);
    this.hl = (this.hl - 1) & this.addressMask;
    this.b = (this.b - 1) & 0xff;
    this._setFlag(FLAG_Z, this.b === 0);
    this._setFlag(FLAG_N, true);
  }

  inir() {
    do { this.ini(); } while (this.b !== 0);
  }

  indr() {
    do { this.ind(); } while (this.b !== 0);
  }

  otir() {
    do { this.outi(); } while (this.b !== 0);
  }

  otdr() {
    do { this.outd(); } while (this.b !== 0);
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
    tmp = this._bc; this._bc = this._bc2; this._bc2 = tmp;
    tmp = this._de; this._de = this._de2; this._de2 = tmp;
    tmp = this._hl; this._hl = this._hl2; this._hl2 = tmp;
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

  // --- I/O tracing hooks (no-ops by default) ---

  onIoRead(port, value) {}
  onIoWrite(port, value) {}

  // --- Memory-mapped I/O hooks (no-ops by default) ---
  // Installed by executor when trackMemoryMapped option is set
  onMmioRead(addr, value) {}
  onMmioWrite(addr, value) {}
}

export function createExecutor(blocks, memory, options = {}) {
  const cpu = new CPU(memory);

  if (options.peripherals) {
    cpu._ioRead = (port) => options.peripherals.read(port);
    cpu._ioWrite = (port, value) => options.peripherals.write(port, value);
  }

  // Wrap I/O methods to call tracing hooks
  const origIoRead = cpu._ioRead;
  const origIoWrite = cpu._ioWrite;

  cpu._ioRead = (port) => {
    const value = origIoRead(port);
    cpu.onIoRead(port, value);
    return value;
  };

  cpu._ioWrite = (port, value) => {
    origIoWrite(port, value);
    cpu.onIoWrite(port, value);
  };

  // Keyboard controller MMIO at 0xE00800-0xE0081F
  // The TI-84 CE keyboard hardware is memory-mapped, accessed via LD (IY+d) with IY=0xE00800
  let lcdMmio = null;
  if (options.peripherals && options.peripherals.keyboard) {
    lcdMmio = {
      upbase: 0xD40000,
      control: 0x00,
    };
    const kbdMmio = {
      mode: 0x00,        // 0xE00803: scan mode
      enable: 0x00,      // 0xE00807: scan enable
      column: 0x00,      // 0xE00808: current scan column
      interval: 0x00,    // 0xE0080F: scan interval
      status: 0x02,      // 0xE00818: status (bit 1 = scan complete, always ready)
      data: new Uint8Array(8).fill(0xFF), // 0xE00810-0xE00817: key data per group
    };
    const kbd = options.peripherals.keyboard;

    const origRead8 = cpu.read8.bind(cpu);
    const origWrite8 = cpu.write8.bind(cpu);

    cpu.read8 = (addr) => {
      if (addr >= 0xE00000 && addr < 0xE00030) {
        const reg = addr - 0xE00000;
        if (reg === 0x10) return lcdMmio.upbase & 0xFF;
        if (reg === 0x11) return (lcdMmio.upbase >> 8) & 0xFF;
        if (reg === 0x12) return (lcdMmio.upbase >> 16) & 0xFF;
        if (reg === 0x18) return lcdMmio.control & 0xFF;
        return 0x00;
      }
      if (addr >= 0xE00800 && addr < 0xE00920) {
        const reg = addr - 0xE00800;
        if (reg >= 0x10 && reg < 0x18) return kbd.keyMatrix[reg - 0x10]; // key data per group
        if (reg === 0x18) return kbdMmio.status; // scan complete (bit 1)
        if (reg === 0x24) return 0x01; // ready flag (bit 0) — keyboard result available
        if (reg === 0x03) return kbdMmio.mode;
        if (reg === 0x07) return kbdMmio.enable;
        if (reg === 0x08) return kbdMmio.column;
        if (reg === 0x0F) return kbdMmio.interval;
        // 0xE00900 = keyboard scan result byte
        if (reg === 0x100) {
          // Compute scan code from key matrix: find first pressed key
          for (let g = 0; g < 8; g++) {
            if (kbd.keyMatrix[g] !== 0xFF) {
              for (let k = 0; k < 8; k++) {
                if (((kbd.keyMatrix[g] >> k) & 1) === 0) {
                  return (g << 4) | k; // group in high nibble, key in low nibble
                }
              }
            }
          }
          return 0x00; // no key pressed
        }
        return 0x00;
      }
      const value = origRead8(addr);
      if (addr >= 0xe00000 && options.trackMemoryMapped) cpu.onMmioRead(addr, value);
      return value;
    };

    cpu.write8 = (addr, value) => {
      if (addr >= 0xE00000 && addr < 0xE00030) {
        const reg = addr - 0xE00000;
        if (reg === 0x10) lcdMmio.upbase = (lcdMmio.upbase & 0xFFFF00) | value;
        if (reg === 0x11) lcdMmio.upbase = (lcdMmio.upbase & 0xFF00FF) | (value << 8);
        if (reg === 0x12) lcdMmio.upbase = (lcdMmio.upbase & 0x00FFFF) | (value << 16);
        if (reg === 0x18) lcdMmio.control = value;
        return;
      }
      if (addr >= 0xE00800 && addr < 0xE00920) {
        const reg = addr - 0xE00800;
        if (reg === 0x03) kbdMmio.mode = value;
        if (reg === 0x07) kbdMmio.enable = value;
        if (reg === 0x08) kbdMmio.column = value;
        if (reg === 0x0F) kbdMmio.interval = value;
        return;
      }
      origWrite8(addr, value);
      if (addr >= 0xe00000 && options.trackMemoryMapped) cpu.onMmioWrite(addr, value);
    };
  } else if (options.trackMemoryMapped) {
    const origRead8 = cpu.read8.bind(cpu);
    const origWrite8 = cpu.write8.bind(cpu);
    cpu.read8 = (addr) => {
      const value = origRead8(addr);
      if (addr >= 0xe00000) cpu.onMmioRead(addr, value);
      return value;
    };
    cpu.write8 = (addr, value) => {
      origWrite8(addr, value);
      if (addr >= 0xe00000) cpu.onMmioWrite(addr, value);
    };
  }

  // Compile block source strings into callable functions
  const compiledBlocks = {};
  const blockMeta = {};

  for (const [key, block] of Object.entries(blocks)) {
    try {
      // Extract function body between first '{' and last '}'
      const src = block.source;
      const bodyStart = src.indexOf('{') + 1;
      const bodyEnd = src.lastIndexOf('}');
      const body = src.slice(bodyStart, bodyEnd);

      compiledBlocks[key] = new Function('cpu', body);
      blockMeta[key] = block;
    } catch {
      // Skip blocks that fail to compile
    }
  }

  // Build exit lookup: given a block key and a returned PC, find the target mode
  function resolveNextMode(blockKey, returnedPc, currentMode) {
    const meta = blockMeta[blockKey];
    if (!meta || !meta.exits) return currentMode;

    for (const exit of meta.exits) {
      if (exit.target === returnedPc && exit.targetMode) {
        return exit.targetMode;
      }
    }

    // If no exit matched the exact target, keep current mode
    return currentMode;
  }

  return {
    cpu,
    lcdMmio,
    compiledBlocks,
    blockMeta,

    runFrom(startAddress, startMode = 'adl', opts = {}) {
      const maxSteps = opts.maxSteps ?? 100000;
      const onBlock = opts.onBlock ?? null;
      const maxLoopIter = opts.maxLoopIterations ?? 64;
      const onLoopBreak = opts.onLoopBreak ?? null;

      let pc = startAddress;
      let mode = startMode;
      cpu.madl = mode === 'adl' ? 1 : 0;
      let steps = 0;
      let termination = 'max_steps';
      let loopsForced = 0;
      const missingBlocks = new Set();
      const blockVisits = new Map();
      const dynamicTargets = new Set();

      // Loop detection: track recent block keys in a small ring buffer
      const recentKeys = [];
      const recentMax = 4;
      let loopHitCount = 0;

      while (steps < maxSteps) {
        // Keep cpu.madl in sync with the block-mode we're about to dispatch.
        // Without this, the executor picks up :adl block variants but leaves
        // madl at whatever it was before, causing subtle bugs like 16-bit
        // call/ret on ADL blocks that expect 24-bit stack operations.
        cpu.madl = mode === 'adl' ? 1 : 0;
        const key = pc.toString(16).padStart(6, '0') + ':' + mode;

        // Loop detection: check if this key appeared recently (1 or 2-block loop)
        if (recentKeys.includes(key)) {
          loopHitCount++;
        } else {
          loopHitCount = 0;
        }
        recentKeys.push(key);
        if (recentKeys.length > recentMax) recentKeys.shift();

        if (loopHitCount > maxLoopIter) {
          // Force-break: find fallthrough exit from this block
          const meta = blockMeta[key];
          const fallthrough = meta?.exits?.find(e => e.type === 'fallthrough');
          if (fallthrough) {
            if (onLoopBreak) {
              onLoopBreak(pc, mode, loopHitCount, fallthrough.target);
            }
            mode = fallthrough.targetMode ?? mode;
            pc = fallthrough.target;
            loopHitCount = 0;
            recentKeys.length = 0;
            loopsForced++;
            continue;
          }
          // No fallthrough available — try to break by setting carry flag
          cpu.f |= FLAG_C;
          if (onLoopBreak) {
            onLoopBreak(pc, mode, loopHitCount, null);
          }
          loopHitCount = 0;
          recentKeys.length = 0;
          loopsForced++;
        }

        const fn = compiledBlocks[key];

        if (!fn) {
          if (opts.onMissingBlock) {
            opts.onMissingBlock(pc, mode, steps);
          }
          missingBlocks.add(key);

          // Try to skip ahead and find the next valid block (up to 16 bytes)
          let skipped = false;
          for (let offset = 1; offset <= 16; offset++) {
            const tryPc = pc + offset;
            const tryKey = tryPc.toString(16).padStart(6, '0') + ':' + mode;
            if (compiledBlocks[tryKey]) {
              pc = tryPc;
              skipped = true;
              break;
            }
          }
          if (!skipped) {
            termination = 'missing_block';
            break;
          }
          steps++;
          continue;
        }

        const meta = blockMeta[key];
        if (onBlock) {
          onBlock(pc, mode, meta, steps);
        }

        let result;
        try {
          result = fn(cpu);
        } catch (err) {
          termination = 'error';
          return {
            steps,
            lastPc: pc,
            lastMode: mode,
            halted: cpu.halted,
            termination,
            error: err,
            loopsForced,
            blockVisits: Object.fromEntries(blockVisits),
            dynamicTargets: [...dynamicTargets],
            missingBlocks: [...missingBlocks],
          };
        }

        steps++;
        blockVisits.set(key, (blockVisits.get(key) || 0) + 1);

        if (result === undefined || result === null) {
          termination = 'no_return';
          break;
        }

        if (result < 0) {
          if (result === -1 && opts.wakeFromHalt) {
            const haltPc = pc;
            // HALT returns from the lifted block, so approximate the post-HALT PC.
            const haltReturnPc = haltPc + 1;
            cpu.halted = false;

            if (typeof opts.wakeFromHalt === 'object') {
              cpu.push(opts.wakeFromHalt.returnPc ?? haltReturnPc);
              pc = opts.wakeFromHalt.vector;
              mode = opts.wakeFromHalt.mode ?? mode;
            } else if (opts.wakeFromHalt === 'nmi') {
              cpu.push(haltReturnPc);
              pc = 0x000066;
            } else {
              cpu.push(haltReturnPc);
              cpu.iff1 = 1;
              cpu.iff2 = 1;
              pc = 0x000038;
            }

            opts.wakeFromHalt = null;

            if (opts.onWake) {
              opts.onWake(haltPc, pc, mode);
            }

            steps++;
            continue;
          }

          // HALT: check for peripheral-driven interrupt wake
          if (result === -1 && options.peripherals && options.peripherals.tick) {
            options.peripherals.tick();

            // NMI wakes from HALT regardless of IFF1
            if (options.peripherals.hasPendingNMI()) {
              cpu.halted = false;
              const haltReturnPc = pc + 1;
              cpu.push(haltReturnPc);
              cpu.iff2 = cpu.iff1;
              cpu.iff1 = 0;
              pc = 0x000066;
              options.peripherals.acknowledgeNMI();
              if (opts.onInterrupt) {
                opts.onInterrupt('nmi', haltReturnPc, 0x000066, steps);
              }
              steps++;
              continue;
            }

            // Maskable IRQ wakes from HALT only if IFF1 is set
            if (options.peripherals.hasPendingIRQ() && cpu.iff1) {
              cpu.halted = false;
              const haltReturnPc = pc + 1;
              cpu.push(haltReturnPc);
              cpu.iff1 = 0;
              cpu.iff2 = 0;
              const vector = cpu.im === 2
                ? cpu.read16((cpu.i << 8) | 0xff)
                : 0x000038;
              pc = vector;
              options.peripherals.acknowledgeIRQ();
              if (opts.onInterrupt) {
                opts.onInterrupt('irq', haltReturnPc, vector, steps);
              }
              steps++;
              continue;
            }
          }

          termination = result === -1 ? 'halt' : 'sleep';
          break;
        }

        // Check for peripheral-driven interrupts after each block
        if (options.peripherals && options.peripherals.tick) {
          options.peripherals.tick();

          // NMI: non-maskable, fires regardless of IFF1
          if (options.peripherals.hasPendingNMI()) {
            cpu.push(result);
            cpu.iff2 = cpu.iff1;
            cpu.iff1 = 0;
            pc = 0x000066;
            mode = 'adl';
            options.peripherals.acknowledgeNMI();
            if (opts.onInterrupt) {
              opts.onInterrupt('nmi', result, 0x000066, steps);
            }
            steps++;
            continue;
          }

          // Maskable IRQ: only fires if interrupts are enabled
          if (options.peripherals.hasPendingIRQ() && cpu.iff1) {
            cpu.push(result);
            cpu.iff1 = 0;
            cpu.iff2 = 0;
            const vector = cpu.im === 2
              ? cpu.read16((cpu.i << 8) | 0xff)
              : 0x000038;
            pc = vector;
            mode = 'adl';
            options.peripherals.acknowledgeIRQ();
            if (opts.onInterrupt) {
              opts.onInterrupt('irq', result, vector, steps);
            }
            steps++;
            continue;
          }
        }

        if (meta && meta.exits) {
          const isStaticExit = meta.exits.some((exit) => exit.target === result);
          if (!isStaticExit && typeof result === 'number' && result >= 0) {
            dynamicTargets.add(result);
            if (opts.onDynamicTarget) {
              opts.onDynamicTarget(result, mode, pc, steps);
            }
          }
        }

        // Resolve next mode from block exit metadata
        mode = resolveNextMode(key, result, mode);
        pc = result;
      }

      return {
        steps,
        lastPc: pc,
        lastMode: mode,
        halted: cpu.halted,
        termination,
        loopsForced,
        blockVisits: Object.fromEntries(blockVisits),
        dynamicTargets: [...dynamicTargets],
        missingBlocks: [...missingBlocks],
      };
    },
  };
}

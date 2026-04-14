const REGS8 = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
const REGS16 = ['bc', 'de', 'hl', 'sp'];
const REGS16_PUSH = ['bc', 'de', 'hl', 'af'];
const ALU_OPS = ['add', 'adc', 'sub', 'sbc', 'and', 'xor', 'or', 'cp'];
const CONDITIONS = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'];
const ROTATE_OPS = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];

function hex(v, w = 2) {
  return '0x' + v.toString(16).padStart(w, '0');
}

function signedByte(b) {
  return b < 128 ? b : b - 256;
}

function readImm(romBytes, pc, width) {
  // width=2: little-endian 16-bit, width=3: little-endian 24-bit
  if (width === 2) return romBytes[pc] | (romBytes[pc + 1] << 8);
  return romBytes[pc] | (romBytes[pc + 1] << 8) | (romBytes[pc + 2] << 16);
}

function getImmWidth(mode, modePrefix) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return 2;
  if (modePrefix === 'sil' || modePrefix === 'lil') return 3;
  return mode === 'adl' ? 3 : 2;
}

function createInstruction(startPc, length, fields) {
  return {
    pc: startPc,
    length,
    nextPc: startPc + length,
    ...fields,
  };
}

function relativeTarget(pc, displacement) {
  return pc + 2 + signedByte(displacement);
}

function decodeCB(romBytes, startPc, cbPc, mode) {
  const op = romBytes[cbPc] ?? 0;
  const reg = REGS8[op & 7];
  const bit = (op >> 3) & 7;
  const group = (op >> 6) & 3;
  const length = cbPc + 1 - startPc;

  if (group === 0) {
    if (reg === '(hl)') {
      return createInstruction(startPc, length, {
        tag: 'rotate-ind',
        op: ROTATE_OPS[bit],
        indirectRegister: 'hl',
      });
    }

    return createInstruction(startPc, length, {
      tag: 'rotate-reg',
      op: ROTATE_OPS[bit],
      reg,
    });
  }

  if (group === 1) {
    if (reg === '(hl)') {
      return createInstruction(startPc, length, {
        tag: 'bit-test-ind',
        bit,
        indirectRegister: 'hl',
      });
    }

    return createInstruction(startPc, length, {
      tag: 'bit-test',
      bit,
      reg,
    });
  }

  if (group === 2) {
    if (reg === '(hl)') {
      return createInstruction(startPc, length, {
        tag: 'bit-res-ind',
        bit,
        indirectRegister: 'hl',
      });
    }

    return createInstruction(startPc, length, {
      tag: 'bit-res',
      bit,
      reg,
    });
  }

  if (group === 3) {
    if (reg === '(hl)') {
      return createInstruction(startPc, length, {
        tag: 'bit-set-ind',
        bit,
        indirectRegister: 'hl',
      });
    }

    return createInstruction(startPc, length, {
      tag: 'bit-set',
      bit,
      reg,
    });
  }

  throw new Error(`Unhandled CB opcode ${hex(op)} at ${hex(startPc, 6)}`);
}

function decodeMain(romBytes, startPc, pc, op, mode, modePrefix, immW) {
  const prefixLength = pc - startPc;
  const r1 = (op >> 3) & 7;
  const r2 = op & 7;
  const rr = (op >> 4) & 3;

  function emit(baseLength, fields) {
    return createInstruction(startPc, prefixLength + baseLength, fields);
  }

  if (op <= 0x3f) {
    if ((op & 0x0f) === 0x01) {
      return emit(1 + immW, {
        tag: 'ld-pair-imm',
        pair: REGS16[rr],
        value: readImm(romBytes, pc + 1, immW),
      });
    }

    if ((op & 0x0f) === 0x03) {
      return emit(1, {
        tag: 'inc-pair',
        pair: REGS16[rr],
      });
    }

    if ((op & 0x0f) === 0x0b) {
      return emit(1, {
        tag: 'dec-pair',
        pair: REGS16[rr],
      });
    }

    if ((op & 0xc7) === 0x04) {
      return emit(1, {
        tag: 'inc-reg',
        reg: REGS8[r1],
      });
    }

    if ((op & 0xc7) === 0x05) {
      return emit(1, {
        tag: 'dec-reg',
        reg: REGS8[r1],
      });
    }

    if ((op & 0xc7) === 0x06) {
      const reg = REGS8[r1];
      const value = romBytes[pc + 1] ?? 0;

      if (reg === '(hl)') {
        return emit(2, {
          tag: 'ld-ind-imm',
          value,
        });
      }

      return emit(2, {
        tag: 'ld-reg-imm',
        dest: reg,
        value,
      });
    }

    if ((op & 0xcf) === 0x09) {
      return emit(1, {
        tag: 'add-pair',
        dest: 'hl',
        src: REGS16[rr],
      });
    }

    if ((op & 0xe7) === 0x20) {
      const length = prefixLength + 2;

      return createInstruction(startPc, length, {
        tag: 'jr-conditional',
        condition: CONDITIONS[(op >> 3) & 3],
        target: relativeTarget(pc, romBytes[pc + 1] ?? 0),
        fallthrough: startPc + length,
        terminates: true,
      });
    }

    switch (op) {
      case 0x00:
        return emit(1, { tag: 'nop' });

      case 0x02:
        return emit(1, {
          tag: 'ld-ind-reg',
          dest: 'bc',
          src: 'a',
        });

      case 0x07:
        return emit(1, { tag: 'rlca' });

      case 0x08:
        return emit(1, { tag: 'ex-af' });

      case 0x0a:
        return emit(1, {
          tag: 'ld-reg-ind',
          dest: 'a',
          src: 'bc',
        });

      case 0x0f:
        return emit(1, { tag: 'rrca' });

      case 0x10: {
        const length = prefixLength + 2;

        return createInstruction(startPc, length, {
          tag: 'djnz',
          target: relativeTarget(pc, romBytes[pc + 1] ?? 0),
          fallthrough: startPc + length,
          terminates: true,
        });
      }

      case 0x12:
        return emit(1, {
          tag: 'ld-ind-reg',
          dest: 'de',
          src: 'a',
        });

      case 0x17:
        return emit(1, { tag: 'rla' });

      case 0x18:
        return emit(2, {
          tag: 'jr',
          target: relativeTarget(pc, romBytes[pc + 1] ?? 0),
          terminates: true,
        });

      case 0x1a:
        return emit(1, {
          tag: 'ld-reg-ind',
          dest: 'a',
          src: 'de',
        });

      case 0x1f:
        return emit(1, { tag: 'rra' });

      case 0x22:
        return emit(1 + immW, {
          tag: 'ld-pair-mem',
          pair: 'hl',
          addr: readImm(romBytes, pc + 1, immW),
          direction: 'to-mem',
        });

      case 0x27:
        return emit(1, { tag: 'daa' });

      case 0x2a:
        return emit(1 + immW, {
          tag: 'ld-pair-mem',
          pair: 'hl',
          addr: readImm(romBytes, pc + 1, immW),
          direction: 'from-mem',
        });

      case 0x2f:
        return emit(1, { tag: 'cpl' });

      case 0x32:
        return emit(1 + immW, {
          tag: 'ld-mem-reg',
          addr: readImm(romBytes, pc + 1, immW),
          src: 'a',
        });

      case 0x37:
        return emit(1, { tag: 'scf' });

      case 0x3a:
        return emit(1 + immW, {
          tag: 'ld-reg-mem',
          dest: 'a',
          addr: readImm(romBytes, pc + 1, immW),
        });

      case 0x3f:
        return emit(1, { tag: 'ccf' });

      default:
        break;
    }
  }

  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) {
      return emit(1, {
        tag: 'halt',
        terminates: true,
      });
    }

    const dest = REGS8[r1];
    const src = REGS8[r2];

    if (dest === '(hl)') {
      return emit(1, {
        tag: 'ld-ind-reg',
        dest: 'hl',
        src,
      });
    }

    if (src === '(hl)') {
      return emit(1, {
        tag: 'ld-reg-ind',
        dest,
        src: 'hl',
      });
    }

    return emit(1, {
      tag: 'ld-reg-reg',
      dest,
      src,
    });
  }

  if (op >= 0x80 && op <= 0xbf) {
    return emit(1, {
      tag: 'alu-reg',
      op: ALU_OPS[r1],
      src: REGS8[r2],
    });
  }

  if ((op & 0xc7) === 0xc0) {
    const length = prefixLength + 1;

    return createInstruction(startPc, length, {
      tag: 'ret-conditional',
      condition: CONDITIONS[r1],
      fallthrough: startPc + length,
      terminates: true,
    });
  }

  if ((op & 0xcf) === 0xc1) {
    return emit(1, {
      tag: 'pop',
      pair: REGS16_PUSH[rr],
    });
  }

  if ((op & 0xc7) === 0xc2) {
    const length = prefixLength + 1 + immW;

    return createInstruction(startPc, length, {
      tag: 'jp-conditional',
      condition: CONDITIONS[r1],
      target: readImm(romBytes, pc + 1, immW),
      fallthrough: startPc + length,
      terminates: true,
    });
  }

  if ((op & 0xc7) === 0xc4) {
    const length = prefixLength + 1 + immW;

    return createInstruction(startPc, length, {
      tag: 'call-conditional',
      condition: CONDITIONS[r1],
      target: readImm(romBytes, pc + 1, immW),
      fallthrough: startPc + length,
      terminates: true,
    });
  }

  if ((op & 0xcf) === 0xc5) {
    return emit(1, {
      tag: 'push',
      pair: REGS16_PUSH[rr],
    });
  }

  if ((op & 0xc7) === 0xc6) {
    return emit(2, {
      tag: 'alu-imm',
      op: ALU_OPS[r1],
      value: romBytes[pc + 1] ?? 0,
    });
  }

  if ((op & 0xc7) === 0xc7) {
    const length = prefixLength + 1;

    return createInstruction(startPc, length, {
      tag: 'rst',
      target: op & 0x38,
      fallthrough: startPc + length,
      terminates: true,
    });
  }

  switch (op) {
    case 0xc3:
      return emit(1 + immW, {
        tag: 'jp',
        target: readImm(romBytes, pc + 1, immW),
        terminates: true,
      });

    case 0xc9:
      return emit(1, {
        tag: 'ret',
        terminates: true,
      });

    case 0xcd: {
      const length = prefixLength + 1 + immW;

      return createInstruction(startPc, length, {
        tag: 'call',
        target: readImm(romBytes, pc + 1, immW),
        fallthrough: startPc + length,
        terminates: true,
      });
    }

    case 0xd3:
      return emit(2, {
        tag: 'out-imm',
        port: romBytes[pc + 1] ?? 0,
      });

    case 0xd9:
      return emit(1, { tag: 'exx' });

    case 0xdb:
      return emit(2, {
        tag: 'in-imm',
        port: romBytes[pc + 1] ?? 0,
      });

    case 0xe3:
      return emit(1, { tag: 'ex-sp-hl' });

    case 0xe9:
      return emit(1, {
        tag: 'jp-indirect',
        indirectRegister: 'hl',
        terminates: true,
      });

    case 0xeb:
      return emit(1, { tag: 'ex-de-hl' });

    case 0xf3:
      return emit(1, { tag: 'di' });

    case 0xf9:
      return emit(1, { tag: 'ld-sp-hl' });

    case 0xfb:
      return emit(1, { tag: 'ei' });

    default:
      throw new Error(
        `Unhandled main opcode ${hex(op)} at ${hex(startPc, 6)} (${mode}/${modePrefix ?? 'none'})`
      );
  }
}

// --- DD/FD prefix: IX/IY indexed ---
function decodeDDFD(romBytes, startPc, prefixPc, indexReg, mode, modePrefix, immW) {
  const op = romBytes[prefixPc + 1] ?? 0;
  const len = (n) => prefixPc + 1 + n - startPc;
  const emit = (n, fields) => createInstruction(startPc, len(n), fields);
  const d = () => signedByte(romBytes[prefixPc + 2] ?? 0);
  const halfH = indexReg === 'ix' ? 'ixh' : 'iyh';
  const halfL = indexReg === 'ix' ? 'ixl' : 'iyl';

  // DD/FD CB d op — indexed bit operations
  if (op === 0xcb) {
    const disp = signedByte(romBytes[prefixPc + 2] ?? 0);
    const cbOp = romBytes[prefixPc + 3] ?? 0;
    const group = (cbOp >> 6) & 3;
    const bit = (cbOp >> 3) & 7;
    const cbLen = prefixPc + 4 - startPc;
    if (group === 0) {
      return createInstruction(startPc, cbLen, { tag: 'indexed-cb-rotate', operation: ROTATE_OPS[bit], indexRegister: indexReg, displacement: disp });
    }
    if (group === 1) {
      return createInstruction(startPc, cbLen, { tag: 'indexed-cb-bit', bit, indexRegister: indexReg, displacement: disp });
    }
    if (group === 2) {
      return createInstruction(startPc, cbLen, { tag: 'indexed-cb-res', bit, indexRegister: indexReg, displacement: disp });
    }
    return createInstruction(startPc, cbLen, { tag: 'indexed-cb-set', bit, indexRegister: indexReg, displacement: disp });
  }

  // LD pair, imm
  if (op === 0x21) {
    const v = readImm(romBytes, prefixPc + 2, immW);
    return emit(1 + immW, { tag: 'ld-pair-imm', pair: indexReg, value: v });
  }
  // LD (nn), pair
  if (op === 0x22) {
    const addr = readImm(romBytes, prefixPc + 2, immW);
    return emit(1 + immW, { tag: 'ld-mem-pair', addr, pair: indexReg });
  }
  // INC pair
  if (op === 0x23) return emit(1, { tag: 'inc-pair', pair: indexReg });
  // DEC pair
  if (op === 0x2b) return emit(1, { tag: 'dec-pair', pair: indexReg });
  // LD pair, (nn)
  if (op === 0x2a) {
    const addr = readImm(romBytes, prefixPc + 2, immW);
    return emit(1 + immW, { tag: 'ld-pair-mem', pair: indexReg, addr });
  }
  // ADD IX/IY, rr
  if ((op & 0xcf) === 0x09) {
    const rr = (op >> 4) & 3;
    const src = rr === 2 ? indexReg : REGS16[rr];
    return emit(1, { tag: 'add-pair', dest: indexReg, src });
  }
  // INC (IX+d)
  if (op === 0x34) return emit(2, { tag: 'inc-ixd', indexRegister: indexReg, displacement: d() });
  // DEC (IX+d)
  if (op === 0x35) return emit(2, { tag: 'dec-ixd', indexRegister: indexReg, displacement: d() });
  // LD (IX+d), n
  if (op === 0x36) {
    const disp = d();
    const v = romBytes[prefixPc + 3] ?? 0;
    return emit(3, { tag: 'ld-ixd-imm', indexRegister: indexReg, displacement: disp, value: v });
  }
  // LD r, (IX+d)  — opcodes 0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E
  if ((op & 0xc7) === 0x46 && op !== 0x76) {
    const dest = REGS8[(op >> 3) & 7];
    return emit(2, { tag: 'ld-reg-ixd', dest, indexRegister: indexReg, displacement: d() });
  }
  // LD (IX+d), r  — opcodes 0x70-0x77 (except 0x76=HALT)
  if ((op & 0xf8) === 0x70 && op !== 0x76) {
    const src = REGS8[op & 7];
    return emit(2, { tag: 'ld-ixd-reg', indexRegister: indexReg, displacement: d(), src });
  }
  // ALU A, (IX+d) — opcodes 0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE
  if ((op & 0xc7) === 0x86) {
    const aluOp = ALU_OPS[(op >> 3) & 7];
    return emit(2, { tag: 'alu-ixd', op: aluOp, indexRegister: indexReg, displacement: d() });
  }
  // POP IX/IY
  if (op === 0xe1) return emit(1, { tag: 'pop', pair: indexReg });
  // PUSH IX/IY
  if (op === 0xe5) return emit(1, { tag: 'push', pair: indexReg });
  // JP (IX/IY)
  if (op === 0xe9) return emit(1, { tag: 'jp-indirect', indirectRegister: indexReg, terminates: true });
  // LD SP, IX/IY
  if (op === 0xf9) return emit(1, { tag: 'ld-sp-pair', pair: indexReg });
  // EX (SP), IX/IY
  if (op === 0xe3) return emit(1, { tag: 'ex-sp-pair', pair: indexReg });

  // Half-register ops: LD r, IXH/IXL and LD IXH/IXL, r
  // In the 0x40-0x7F range, H(4)→halfH, L(5)→halfL for register-only ops
  if (op >= 0x40 && op < 0x80 && op !== 0x76) {
    const dstIdx = (op >> 3) & 7;
    const srcIdx = op & 7;
    // Skip if both are (HL) position — that's indexed load handled above
    if (dstIdx === 6 || srcIdx === 6) {
      // Already handled above for indexed loads; fall through
    } else {
      const dstReg = dstIdx === 4 ? halfH : dstIdx === 5 ? halfL : REGS8[dstIdx];
      const srcReg = srcIdx === 4 ? halfH : srcIdx === 5 ? halfL : REGS8[srcIdx];
      return emit(1, { tag: 'ld-reg-reg', dest: dstReg, src: srcReg });
    }
  }

  // Half-register ALU: ADD A, IXH etc.
  if (op >= 0x80 && op < 0xc0) {
    const srcIdx = op & 7;
    if (srcIdx === 6) {
      // Already handled as ALU (IX+d) above; fall through
    } else {
      const aluOp = ALU_OPS[(op >> 3) & 7];
      const srcReg = srcIdx === 4 ? halfH : srcIdx === 5 ? halfL : REGS8[srcIdx];
      return emit(1, { tag: 'alu-reg', op: aluOp, src: srcReg });
    }
  }

  // INC/DEC half registers
  if (op === 0x24) return emit(1, { tag: 'inc-reg', reg: halfH });
  if (op === 0x25) return emit(1, { tag: 'dec-reg', reg: halfH });
  if (op === 0x2c) return emit(1, { tag: 'inc-reg', reg: halfL });
  if (op === 0x2d) return emit(1, { tag: 'dec-reg', reg: halfL });
  // LD IXH/IXL, n
  if (op === 0x26) return emit(2, { tag: 'ld-reg-imm', dest: halfH, value: romBytes[prefixPc + 2] ?? 0 });
  if (op === 0x2e) return emit(2, { tag: 'ld-reg-imm', dest: halfL, value: romBytes[prefixPc + 2] ?? 0 });

  // DD/FD ED xx → forward to ED decoder (DD/FD prefix ignored for ED instructions)
  if (op === 0xed) {
    return decodeED(romBytes, startPc, prefixPc + 1, mode, modePrefix, immW);
  }

  // eZ80 indexed 24-bit pair loads: DD/FD 07/17/27 d = LD BC/DE/HL, (IX/IY+d)
  if (op === 0x07) return emit(2, { tag: 'ld-pair-indexed', pair: 'bc', indexRegister: indexReg, displacement: d() });
  if (op === 0x17) return emit(2, { tag: 'ld-pair-indexed', pair: 'de', indexRegister: indexReg, displacement: d() });
  if (op === 0x27) return emit(2, { tag: 'ld-pair-indexed', pair: 'hl', indexRegister: indexReg, displacement: d() });

  // eZ80 indexed 24-bit pair stores: DD/FD 0F/1F/2F d = LD (IX/IY+d), BC/DE/HL
  if (op === 0x0f) return emit(2, { tag: 'ld-indexed-pair', pair: 'bc', indexRegister: indexReg, displacement: d() });
  if (op === 0x1f) return emit(2, { tag: 'ld-indexed-pair', pair: 'de', indexRegister: indexReg, displacement: d() });
  if (op === 0x2f) return emit(2, { tag: 'ld-indexed-pair', pair: 'hl', indexRegister: indexReg, displacement: d() });

  // eZ80 indexed 24-bit IX/IY loads: DD/FD 31/37 d = LD IX/IY, (IX/IY+d)
  if (op === 0x31) return emit(2, { tag: 'ld-ixiy-indexed', dest: 'ix', indexRegister: indexReg, displacement: d() });
  if (op === 0x37) return emit(2, { tag: 'ld-ixiy-indexed', dest: 'iy', indexRegister: indexReg, displacement: d() });

  const otherIx = indexReg === 'ix' ? 'iy' : 'ix';
  // eZ80 indexed 24-bit IX/IY stores: DD/FD 3E/3F d = LD (IX/IY+d), IY/IX
  if (op === 0x3e) return emit(2, { tag: 'ld-indexed-ixiy', src: otherIx, indexRegister: indexReg, displacement: d() });
  if (op === 0x3f) return emit(2, { tag: 'ld-indexed-ixiy', src: indexReg, indexRegister: indexReg, displacement: d() });

  // eZ80 indexed 24-bit pair stores: DD/FD 01/11 d = LD (IX/IY+d), BC/DE
  if (op === 0x01) return emit(2, { tag: 'ld-indexed-pair', pair: 'bc', indexRegister: indexReg, displacement: d() });
  if (op === 0x11) return emit(2, { tag: 'ld-indexed-pair', pair: 'de', indexRegister: indexReg, displacement: d() });

  // Fallback: DD/FD prefix on non-IX/IY opcodes — prefix is consumed silently,
  // opcode executes as-is (e.g., DD 2F = CPL, DD AF = XOR A).
  // For stacked prefixes (DD DD, FD FD, etc.) or CB, treat as NOP.
  if (op === 0xdd || op === 0xfd || op === 0xcb) {
    return emit(1, { tag: 'nop' });
  }
  return decodeMain(romBytes, startPc, prefixPc + 1, op, mode, modePrefix, immW);
}

// --- ED prefix: extended instructions ---
const IN0_REGS = { 0x00: 'b', 0x08: 'c', 0x10: 'd', 0x18: 'e', 0x20: 'h', 0x28: 'l', 0x38: 'a' };
const OUT0_REGS = { 0x01: 'b', 0x09: 'c', 0x11: 'd', 0x19: 'e', 0x21: 'h', 0x29: 'l', 0x39: 'a' };
const MLT_REGS = { 0x4c: 'bc', 0x5c: 'de', 0x6c: 'hl', 0x7c: 'sp' };
const TST_REGS = { 0x04: 'b', 0x0c: 'c', 0x14: 'd', 0x1c: 'e', 0x24: 'h', 0x2c: 'l', 0x3c: 'a' };

function decodeED(romBytes, startPc, edPc, mode, modePrefix, immW) {
  const op = romBytes[edPc + 1] ?? 0;
  const len = (n) => edPc + 2 + n - startPc;
  const emit = (n, fields) => createInstruction(startPc, len(n), fields);
  const operand8 = romBytes[edPc + 2] ?? 0;
  const disp = signedByte(operand8);

  // IN0 r, (n)
  if (op in IN0_REGS) {
    return emit(1, { tag: 'in0', reg: IN0_REGS[op], port: operand8 });
  }
  // OUT0 (n), r
  if (op in OUT0_REGS) {
    return emit(1, { tag: 'out0', reg: OUT0_REGS[op], port: operand8 });
  }

  // IN r, (C) — ED 40,48,50,58,60,68,70,78
  if ((op & 0xc7) === 0x40) {
    const reg = REGS8[(op >> 3) & 7];
    return emit(0, { tag: 'in-reg', reg });
  }
  // OUT (C), r — ED 41,49,51,59,61,69,71,79
  if ((op & 0xc7) === 0x41) {
    const reg = REGS8[(op >> 3) & 7];
    return emit(0, { tag: 'out-reg', reg });
  }
  // SBC HL, rr — ED 42,52,62,72
  if ((op & 0xcf) === 0x42) {
    const rr = REGS16[(op >> 4) & 3];
    return emit(0, { tag: 'sbc-pair', src: rr });
  }
  // ADC HL, rr — ED 4A,5A,6A,7A
  if ((op & 0xcf) === 0x4a) {
    const rr = REGS16[(op >> 4) & 3];
    return emit(0, { tag: 'adc-pair', src: rr });
  }
  // LD (nn), rr — ED 43,53,63,73
  if ((op & 0xcf) === 0x43) {
    const rr = REGS16[(op >> 4) & 3];
    const addr = readImm(romBytes, edPc + 2, immW);
    return emit(immW, { tag: 'ld-mem-pair', addr, pair: rr });
  }
  // LD rr, (nn) — ED 4B,5B,6B,7B
  if ((op & 0xcf) === 0x4b) {
    const rr = REGS16[(op >> 4) & 3];
    const addr = readImm(romBytes, edPc + 2, immW);
    return emit(immW, { tag: 'ld-pair-mem', pair: rr, addr });
  }

  // NEG
  if (op === 0x44) return emit(0, { tag: 'neg' });
  // RETN
  if (op === 0x45) return emit(0, { tag: 'retn', terminates: true });
  // RETI
  if (op === 0x4d) return emit(0, { tag: 'reti', terminates: true });
  // IM 0/1/2
  if (op === 0x46) return emit(0, { tag: 'im', value: 0 });
  if (op === 0x56) return emit(0, { tag: 'im', value: 1 });
  if (op === 0x5e) return emit(0, { tag: 'im', value: 2 });
  // LD I, A / LD R, A / LD A, I / LD A, R
  if (op === 0x47) return emit(0, { tag: 'ld-special', dest: 'i', src: 'a' });
  if (op === 0x4f) return emit(0, { tag: 'ld-special', dest: 'r', src: 'a' });
  if (op === 0x57) return emit(0, { tag: 'ld-special', dest: 'a', src: 'i' });
  if (op === 0x5f) return emit(0, { tag: 'ld-special', dest: 'a', src: 'r' });
  // RRD / RLD
  if (op === 0x67) return emit(0, { tag: 'rrd' });
  if (op === 0x6f) return emit(0, { tag: 'rld' });
  // Block transfer/compare
  if (op === 0xa0) return emit(0, { tag: 'ldi' });
  if (op === 0xa1) return emit(0, { tag: 'cpi' });
  if (op === 0xa8) return emit(0, { tag: 'ldd' });
  if (op === 0xa9) return emit(0, { tag: 'cpd' });
  if (op === 0xb0) return emit(0, { tag: 'ldir' });
  if (op === 0xb1) return emit(0, { tag: 'cpir' });
  if (op === 0xb8) return emit(0, { tag: 'lddr' });
  if (op === 0xb9) return emit(0, { tag: 'cpdr' });
  // Block I/O
  if (op === 0xa2) return emit(0, { tag: 'ini' });
  if (op === 0xa3) return emit(0, { tag: 'outi' });
  if (op === 0xaa) return emit(0, { tag: 'ind' });
  if (op === 0xab) return emit(0, { tag: 'outd' });
  if (op === 0xb2) return emit(0, { tag: 'inir' });
  if (op === 0xb3) return emit(0, { tag: 'otir' });
  if (op === 0xba) return emit(0, { tag: 'indr' });
  if (op === 0xbb) return emit(0, { tag: 'otdr' });
  // MLT rr (eZ80)
  if (op in MLT_REGS) return emit(0, { tag: 'mlt', reg: MLT_REGS[op] });
  // TST A, r (eZ80)
  if (op in TST_REGS) return emit(0, { tag: 'tst-reg', reg: TST_REGS[op] });
  // TST A, (HL)
  if (op === 0x34) return emit(0, { tag: 'tst-ind' });
  // TST A, n
  if (op === 0x64) return emit(1, { tag: 'tst-imm', value: operand8 });
  // TSTIO n
  if (op === 0x74) return emit(1, { tag: 'tstio', value: operand8 });
  // STMIX / RSMIX — mode-switch; must terminate the block so the next
  // instruction is decoded in the new mode (instruction widths depend on
  // ADL flag at decode time). Marked as kind='mode-switch' so buildBlock
  // adds a fallthrough exit with targetMode set to the new mode.
  if (op === 0x7d) return emit(0, { tag: 'stmix', kind: 'mode-switch', nextMode: 'adl' });
  if (op === 0x7e) return emit(0, { tag: 'rsmix', kind: 'mode-switch', nextMode: 'z80' });
  // LD MB, A / LD A, MB — eZ80 MBASE register access
  if (op === 0x6d) return emit(0, { tag: 'ld-mb-a' });
  if (op === 0x6e) return emit(0, { tag: 'ld-a-mb' });
  // SLP
  if (op === 0x76) return emit(0, { tag: 'slp', terminates: true });
  // OTIMR
  if (op === 0x93) return emit(0, { tag: 'otimr' });
  // LD rr, (HL) word / LD (HL), rr word (eZ80)
  if (op === 0x07) return emit(0, { tag: 'ld-pair-ind', pair: 'bc', src: 'hl' });
  if (op === 0x17) return emit(0, { tag: 'ld-pair-ind', pair: 'de', src: 'hl' });
  if (op === 0x27) return emit(0, { tag: 'ld-pair-ind', pair: 'hl', src: 'hl' });
  if (op === 0x0f) return emit(0, { tag: 'ld-ind-pair', dest: 'hl', pair: 'bc' });
  if (op === 0x1f) return emit(0, { tag: 'ld-ind-pair', dest: 'hl', pair: 'de' });
  if (op === 0x2f) return emit(0, { tag: 'ld-ind-pair', dest: 'hl', pair: 'hl' });
  // LEA instructions (eZ80)
  if (op === 0x02) return emit(1, { tag: 'lea', dest: 'bc', base: 'ix', displacement: disp });
  if (op === 0x03) return emit(1, { tag: 'lea', dest: 'bc', base: 'iy', displacement: disp });
  if (op === 0x12) return emit(1, { tag: 'lea', dest: 'de', base: 'ix', displacement: disp });
  if (op === 0x13) return emit(1, { tag: 'lea', dest: 'de', base: 'iy', displacement: disp });
  if (op === 0x22) return emit(1, { tag: 'lea', dest: 'hl', base: 'ix', displacement: disp });
  if (op === 0x23) return emit(1, { tag: 'lea', dest: 'hl', base: 'iy', displacement: disp });
  if (op === 0x32) return emit(1, { tag: 'lea', dest: 'ix', base: 'ix', displacement: disp });
  if (op === 0x33) return emit(1, { tag: 'lea', dest: 'iy', base: 'iy', displacement: disp });
  if (op === 0x54) return emit(1, { tag: 'lea', dest: 'ix', base: 'iy', displacement: disp });
  if (op === 0x55) return emit(1, { tag: 'lea', dest: 'iy', base: 'ix', displacement: disp });
  // LD IY/IX, (HL) and LD (HL), IY/IX
  if (op === 0x31) return emit(0, { tag: 'ld-pair-ind', pair: 'iy', src: 'hl' });
  if (op === 0x37) return emit(0, { tag: 'ld-pair-ind', pair: 'ix', src: 'hl' });
  if (op === 0x3e) return emit(0, { tag: 'ld-ind-pair', dest: 'hl', pair: 'iy' });
  if (op === 0x3f) return emit(0, { tag: 'ld-ind-pair', dest: 'hl', pair: 'ix' });

  // Undefined ED opcode → 2-byte NOP
  return emit(0, { tag: 'nop' });
}

export function decodeInstruction(romBytes, pc, mode) {
  const startPc = pc;
  let modePrefix = null;

  const first = romBytes[pc] ?? 0;
  if (first === 0x40) { modePrefix = 'sis'; pc += 1; }
  else if (first === 0x49) { modePrefix = 'lis'; pc += 1; }
  else if (first === 0x52) { modePrefix = 'sil'; pc += 1; }
  else if (first === 0x5b) { modePrefix = 'lil'; pc += 1; }

  const op = romBytes[pc] ?? 0;
  const immW = getImmWidth(mode, modePrefix);

  if (op === 0xcb) {
    return {
      ...decodeCB(romBytes, startPc, pc + 1, mode),
      mode,
      modePrefix,
    };
  }

  if (op === 0xdd || op === 0xfd) {
    let indexReg = op === 0xdd ? 'ix' : 'iy';
    let prefixPc = pc;
    // Doubled prefix: DD FD or FD DD — second wins
    const next = romBytes[pc + 1] ?? 0;
    if ((next === 0xdd || next === 0xfd) && next !== op) {
      indexReg = next === 0xdd ? 'ix' : 'iy';
      prefixPc = pc + 1;
    }
    return {
      ...decodeDDFD(romBytes, startPc, prefixPc, indexReg, mode, modePrefix, immW),
      mode,
      modePrefix,
    };
  }

  if (op === 0xed) {
    return {
      ...decodeED(romBytes, startPc, pc, mode, modePrefix, immW),
      mode,
      modePrefix,
    };
  }

  return {
    ...decodeMain(romBytes, startPc, pc, op, mode, modePrefix, immW),
    mode,
    modePrefix,
  };
}

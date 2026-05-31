/*
Phase 480 output summary:
- Pure ROM probe for the higher-level mode dispatch chain.
- Dumps 0x08A6F0-0x08A780, 0x08A7BE-0x08A830, and 0x08B2AE-0x08B310.
- Each dump line prints the address, up to four raw bytes, and a best-effort eZ80 mnemonic for the instruction starting at that byte.
- Scans the full 0x000000-0x3FFFFF ROM range for ADL CALL/JP byte patterns to 0x08A6F0, 0x08A7BE, and 0x08B2AE, printing each reference and a total.
- This probe intentionally reads ROM.rom directly and does not import cpu-runtime.js or peripherals.js.
*/

import { readFileSync } from "node:fs";

const rom = readFileSync(new URL("./ROM.rom", import.meta.url));
const hex = (v, w=6) => `0x${(v>>>0).toString(16).toUpperCase().padStart(w,'0')}`;

const r8 = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
const cc = ["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"];
const aluOps = ["ADD A,", "ADC A,", "SUB ", "SBC A,", "AND ", "XOR ", "OR ", "CP "];
const rotOps = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"];
const miscOps = ["RLCA", "RRCA", "RLA", "RRA", "DAA", "CPL", "SCF", "CCF"];
const modePrefixes = new Map([
  [0x49, ".SIS"],
  [0x40, ".SIL"],
  [0x52, ".LIS"],
  [0x5B, ".LIL"],
]);

function has(offset) {
  return offset >= 0 && offset < rom.length;
}

function u8(offset) {
  return has(offset) ? rom[offset] : 0;
}

function s8(byte) {
  return byte & 0x80 ? byte - 0x100 : byte;
}

function byteHex(byte) {
  return byte.toString(16).padStart(2, "0");
}

function dispText(byte) {
  const value = s8(byte);
  return value < 0 ? `-${hex(-value, 2)}` : `+${hex(value, 2)}`;
}

function addr16At(offset) {
  return (u8(offset) | (u8(offset + 1) << 8)) >>> 0;
}

function addr24At(offset) {
  return (u8(offset) | (u8(offset + 1) << 8) | (u8(offset + 2) << 16)) >>> 0;
}

function relTarget(offset, disp) {
  return (offset + 2 + s8(disp)) & 0xFFFFFF;
}

function rpName(index, p) {
  return ["BC", "DE", index ?? "HL", "SP"][p];
}

function rp2Name(index, p) {
  return ["BC", "DE", index ?? "HL", "AF"][p];
}

function regName(code, index, disp) {
  if (!index) return r8[code];
  if (code === 4) return `${index}H`;
  if (code === 5) return `${index}L`;
  if (code === 6) return `(${index}${dispText(disp)})`;
  return r8[code];
}

function aluMnemonic(y, operand) {
  return `${aluOps[y]}${operand}`;
}

function decodeCBOp(op, indexedOperand = null) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;

  let operand = r8[z];
  if (indexedOperand) {
    operand = z === 6 ? indexedOperand : `${indexedOperand},${r8[z]}`;
  }

  if (x === 0) return `${rotOps[y]} ${operand}`;
  if (x === 1) return `BIT ${y},${indexedOperand ?? operand}`;
  if (x === 2) return `RES ${y},${operand}`;
  return `SET ${y},${operand}`;
}

function decodeCB(offset) {
  if (!has(offset + 1)) return { length: 1, mnemonic: "CB prefix" };
  return { length: 2, mnemonic: decodeCBOp(u8(offset + 1)) };
}

function decodeIndexedCB(offset, index) {
  if (!has(offset + 3)) return { length: Math.min(rom.length - offset, 4), mnemonic: `${index} CB prefix` };
  const disp = u8(offset + 2);
  const operand = `(${index}${dispText(disp)})`;
  return { length: 4, mnemonic: decodeCBOp(u8(offset + 3), operand) };
}

function decodeED(offset) {
  if (!has(offset + 1)) return { length: 1, mnemonic: "ED prefix" };

  const op = u8(offset + 1);
  const edSingles = new Map([
    [0x44, "NEG"],
    [0x45, "RETN"],
    [0x46, "IM 0"],
    [0x47, "LD I,A"],
    [0x4D, "RETI"],
    [0x4F, "LD R,A"],
    [0x56, "IM 1"],
    [0x57, "LD A,I"],
    [0x5E, "IM 2"],
    [0x5F, "LD A,R"],
    [0x67, "RRD"],
    [0x6F, "RLD"],
    [0xA0, "LDI"],
    [0xA1, "CPI"],
    [0xA2, "INI"],
    [0xA3, "OUTI"],
    [0xA8, "LDD"],
    [0xA9, "CPD"],
    [0xAA, "IND"],
    [0xAB, "OUTD"],
    [0xB0, "LDIR"],
    [0xB1, "CPIR"],
    [0xB2, "INIR"],
    [0xB3, "OTIR"],
    [0xB8, "LDDR"],
    [0xB9, "CPDR"],
    [0xBA, "INDR"],
    [0xBB, "OTDR"],
  ]);
  if (edSingles.has(op)) return { length: 2, mnemonic: edSingles.get(op) };

  if (op >= 0x40 && op <= 0x7F) {
    const y = (op >> 3) & 7;
    const z = op & 7;
    const p = y >> 1;
    const q = y & 1;
    const rp = ["BC", "DE", "HL", "SP"][p];

    if (z === 0) return { length: 2, mnemonic: y === 6 ? "IN (C)" : `IN ${r8[y]},(C)` };
    if (z === 1) return { length: 2, mnemonic: y === 6 ? "OUT (C),0" : `OUT (C),${r8[y]}` };
    if (z === 2) return { length: 2, mnemonic: `${q === 0 ? "SBC" : "ADC"} HL,${rp}` };
    if (z === 3) {
      const addr = hex(addr24At(offset + 2));
      return { length: 5, mnemonic: q === 0 ? `LD (${addr}),${rp}` : `LD ${rp},(${addr})` };
    }
  }

  return { length: 2, mnemonic: `DB ED ${byteHex(op)}` };
}

function decodeBase(offset, index = null) {
  const op = u8(offset);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const disp = u8(offset + 1);

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { length: 1, mnemonic: "NOP" };
      if (y === 1) return { length: 1, mnemonic: "EX AF,AF'" };
      if (y === 2) return { length: 2, mnemonic: `DJNZ ${hex(relTarget(offset, disp))}` };
      if (y === 3) return { length: 2, mnemonic: `JR ${hex(relTarget(offset, disp))}` };
      return { length: 2, mnemonic: `JR ${cc[y - 4]},${hex(relTarget(offset, disp))}` };
    }

    if (z === 1) {
      if (q === 0) return { length: 4, mnemonic: `LD ${rpName(index, p)},${hex(addr24At(offset + 1))}` };
      return { length: 1, mnemonic: `ADD ${index ?? "HL"},${rpName(index, p)}` };
    }

    if (z === 2) {
      if (y === 0) return { length: 1, mnemonic: "LD (BC),A" };
      if (y === 1) return { length: 1, mnemonic: "LD A,(BC)" };
      if (y === 2) return { length: 1, mnemonic: "LD (DE),A" };
      if (y === 3) return { length: 1, mnemonic: "LD A,(DE)" };
      if (y === 4) return { length: 4, mnemonic: `LD (${hex(addr24At(offset + 1))}),${index ?? "HL"}` };
      if (y === 5) return { length: 4, mnemonic: `LD ${index ?? "HL"},(${hex(addr24At(offset + 1))})` };
      if (y === 6) return { length: 4, mnemonic: `LD (${hex(addr24At(offset + 1))}),A` };
      return { length: 4, mnemonic: `LD A,(${hex(addr24At(offset + 1))})` };
    }

    if (z === 3) return { length: 1, mnemonic: `${q === 0 ? "INC" : "DEC"} ${rpName(index, p)}` };

    if (z === 4) {
      const length = index && y === 6 ? 2 : 1;
      return { length, mnemonic: `INC ${regName(y, index, disp)}` };
    }

    if (z === 5) {
      const length = index && y === 6 ? 2 : 1;
      return { length, mnemonic: `DEC ${regName(y, index, disp)}` };
    }

    if (z === 6) {
      const length = index && y === 6 ? 3 : 2;
      const immOffset = index && y === 6 ? offset + 2 : offset + 1;
      return { length, mnemonic: `LD ${regName(y, index, disp)},${hex(u8(immOffset), 2)}` };
    }

    return { length: 1, mnemonic: miscOps[y] };
  }

  if (x === 1) {
    if (op === 0x76) return { length: 1, mnemonic: "HALT" };
    const length = index && (y === 6 || z === 6) ? 2 : 1;
    return { length, mnemonic: `LD ${regName(y, index, disp)},${regName(z, index, disp)}` };
  }

  if (x === 2) {
    const length = index && z === 6 ? 2 : 1;
    return { length, mnemonic: aluMnemonic(y, regName(z, index, disp)) };
  }

  if (z === 0) return { length: 1, mnemonic: `RET ${cc[y]}` };

  if (z === 1) {
    if (q === 0) return { length: 1, mnemonic: `POP ${rp2Name(index, p)}` };
    if (p === 0) return { length: 1, mnemonic: "RET" };
    if (p === 1) return { length: 1, mnemonic: "EXX" };
    if (p === 2) return { length: 1, mnemonic: `JP (${index ?? "HL"})` };
    return { length: 1, mnemonic: `LD SP,${index ?? "HL"}` };
  }

  if (z === 2) return { length: 4, mnemonic: `JP ${cc[y]},${hex(addr24At(offset + 1))}` };

  if (z === 3) {
    if (y === 0) return { length: 4, mnemonic: `JP ${hex(addr24At(offset + 1))}` };
    if (y === 1) return decodeCB(offset);
    if (y === 2) return { length: 2, mnemonic: `OUT (${hex(u8(offset + 1), 2)}),A` };
    if (y === 3) return { length: 2, mnemonic: `IN A,(${hex(u8(offset + 1), 2)})` };
    if (y === 4) return { length: 1, mnemonic: `EX (SP),${index ?? "HL"}` };
    if (y === 5) return { length: 1, mnemonic: `EX DE,${index ?? "HL"}` };
    if (y === 6) return { length: 1, mnemonic: "DI" };
    return { length: 1, mnemonic: "EI" };
  }

  if (z === 4) return { length: 4, mnemonic: `CALL ${cc[y]},${hex(addr24At(offset + 1))}` };

  if (z === 5) {
    if (q === 0) return { length: 1, mnemonic: `PUSH ${rp2Name(index, p)}` };
    if (p === 0) return { length: 4, mnemonic: `CALL ${hex(addr24At(offset + 1))}` };
    return { length: 1, mnemonic: `PREFIX ${byteHex(op)}` };
  }

  if (z === 6) return { length: 2, mnemonic: aluMnemonic(y, hex(u8(offset + 1), 2)) };

  return { length: 1, mnemonic: `RST ${hex(y * 8, 2)}` };
}

function decodeIndexed(offset, index) {
  if (!has(offset + 1)) return { length: 1, mnemonic: `${index} prefix` };

  const op = u8(offset + 1);
  if (op === 0xCB) return decodeIndexedCB(offset, index);
  if (op === 0xED) {
    const decoded = decodeED(offset + 1);
    return { length: 1 + decoded.length, mnemonic: `${index} ${decoded.mnemonic}` };
  }

  const decoded = decodeBase(offset + 1, index);
  return { length: 1 + decoded.length, mnemonic: decoded.mnemonic };
}

function decodeAt(offset, end, depth = 0) {
  if (!has(offset)) return { length: 1, mnemonic: "<outside ROM>" };

  const op = u8(offset);
  if (modePrefixes.has(op) && depth < 2 && offset + 1 < end) {
    const decoded = decodeAt(offset + 1, end, depth + 1);
    return { length: 1 + decoded.length, mnemonic: `${modePrefixes.get(op)} ${decoded.mnemonic}` };
  }

  if (op === 0xDD) return decodeIndexed(offset, "IX");
  if (op === 0xFD) return decodeIndexed(offset, "IY");
  if (op === 0xED) return decodeED(offset);
  if (op === 0xCB) return decodeCB(offset);
  return decodeBase(offset);
}

function dumpRange(start, end, label) {
  console.log(`\n=== ${label} (${hex(start)}-${hex(end)}) ===`);
  for (let i = start; i < end; ) {
    const decoded = decodeAt(i, end);
    let line = `${hex(i)}: `;

    const rawBytes = [];
    for (let j = 0; j < 4 && i + j < end && i + j < rom.length; j++) {
      rawBytes.push(byteHex(rom[i + j]));
    }

    line += rawBytes.join(' ').padEnd(11, ' ');
    line += `  ${decoded.mnemonic}`;
    console.log(line);
    i++; // advance by 1 for raw dump (let human decode)
  }
}

function searchForCallsTo(targetAddr, label) {
  const lo = targetAddr & 0xff;
  const mid = (targetAddr >> 8) & 0xff;
  const hi = (targetAddr >> 16) & 0xff;
  let found = 0;

  console.log(`\n=== Searching for CALL/JP to ${label} (${hex(targetAddr)}) ===`);
  const scanEnd = Math.min(rom.length, 0x400000);
  for (let i = 0; i < scanEnd - 3; i++) {
    if ((rom[i] === 0xCD || rom[i] === 0xC3) && rom[i+1] === lo && rom[i+2] === mid && rom[i+3] === hi) {
      const op = rom[i] === 0xCD ? 'CALL' : 'JP';
      console.log(`  ${hex(i)}: ${op} ${hex(targetAddr)}`);
      found++;
    }
  }

  if (found === 0) console.log("  (none found)");
  console.log(`  total: ${found}`);
}

// Dump regions
dumpRange(0x08A6F0, 0x08A780, "0x08A6F0 HIGHER-LEVEL MODE DISPATCH");
dumpRange(0x08A7BE, 0x08A830, "0x08A7BE CONTAINS 0x08A809 CALLER");
dumpRange(0x08B2AE, 0x08B310, "0x08B2AE SECOND CALLER OF 0x08A7BE");

// Search for callers
searchForCallsTo(0x08A6F0, "08A6F0");
searchForCallsTo(0x08A7BE, "08A7BE");
searchForCallsTo(0x08B2AE, "08B2AE");

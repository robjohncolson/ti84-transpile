/*
Summary:
  Intended command:
    node TI-84_Plus_CE/probe-phase480-decode-005A75.mjs

  This subagent could not execute shell/node commands in the sandbox before
  editing; each attempt failed with:
    windows sandbox: spawn setup refresh

  The probe below is pure ROM binary analysis. When run, it prints:
    - instruction-by-instruction decode for 0x005A75-0x005AC0
    - instruction-by-instruction decode for 0x00596E-0x005990
    - targeted scans for LD HL,(Dxxxxx), D0059C, D00595, D40000,
      CALL, JP, and MLT byte patterns in both ranges
*/
import { readFileSync } from "node:fs";
// NO other imports needed for ROM hex dump

const rom = readFileSync(new URL("./ROM.rom", import.meta.url));

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, "0")}`;

const ranges = [
  { name: "CHARACTER RENDERER", start: 0x005A75, end: 0x005AC0 },
  { name: "FONT BASE ADDER", start: 0x00596E, end: 0x005990 },
];

const reg8 = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
const reg16 = ["BC", "DE", "HL", "SP"];
const reg16PushPop = ["BC", "DE", "HL", "AF"];
const conditions = ["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"];
const aluOps = ["ADD A", "ADC A", "SUB", "SBC A", "AND", "XOR", "OR", "CP"];
const rotateOps = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"];
const modePrefixes = new Map([
  [0x40, ".SIL"],
  [0x49, ".SIS"],
  [0x52, ".LIS"],
  [0x5B, ".LIL"],
]);

const b = (addr) => rom[addr] ?? 0;
const u24 = (addr) => b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
const s8 = (v) => (v < 0x80 ? v : v - 0x100);
const relTarget = (addr, len) => (addr + len + s8(b(addr + 1))) & 0xFFFFFF;
const bytes = (addr, len) => Array.from(rom.subarray(addr, addr + len), (v) => v.toString(16).toUpperCase().padStart(2, "0")).join(" ");
const imm8 = (addr) => hex(b(addr), 2);
const imm24 = (addr) => hex(u24(addr), 6);
const disp = (v) => (v < 0x80 ? `+${hex(v, 2)}` : `-${hex(0x100 - v, 2)}`);

function addrOperand(addr) {
  return imm24(addr);
}

function decodeCb(op) {
  const r = reg8[op & 0x07];
  if (op < 0x40) return `${rotateOps[(op >> 3) & 0x07]} ${r}`;
  if (op < 0x80) return `BIT ${(op >> 3) & 0x07},${r}`;
  if (op < 0xC0) return `RES ${(op >> 3) & 0x07},${r}`;
  return `SET ${(op >> 3) & 0x07},${r}`;
}

function decodeIndexCb(ix, addr) {
  const d = b(addr + 2);
  const op = b(addr + 3);
  const target = `(${ix}${disp(d)})`;
  if (op < 0x40) return `${rotateOps[(op >> 3) & 0x07]} ${target}`;
  if (op < 0x80) return `BIT ${(op >> 3) & 0x07},${target}`;
  if (op < 0xC0) return `RES ${(op >> 3) & 0x07},${target}`;
  return `SET ${(op >> 3) & 0x07},${target}`;
}

function decodeEd(addr) {
  const op = b(addr + 1);
  const mltTargets = new Map([
    [0x4C, "BC"],
    [0x5C, "DE"],
    [0x6C, "HL"],
    [0x7C, "SP"],
  ]);
  if (op === 0x27) return { length: 5, mnemonic: `LD HL,(${addrOperand(addr + 2)})` };
  if (mltTargets.has(op)) return { length: 2, mnemonic: `MLT ${mltTargets.get(op)}` };

  const edFixed = new Map([
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
  if (edFixed.has(op)) return { length: 2, mnemonic: edFixed.get(op) };

  const hlMath = new Map([
    [0x42, "SBC HL,BC"],
    [0x4A, "ADC HL,BC"],
    [0x52, "SBC HL,DE"],
    [0x5A, "ADC HL,DE"],
    [0x62, "SBC HL,HL"],
    [0x6A, "ADC HL,HL"],
    [0x72, "SBC HL,SP"],
    [0x7A, "ADC HL,SP"],
  ]);
  if (hlMath.has(op)) return { length: 2, mnemonic: hlMath.get(op) };

  const memLoads = new Map([
    [0x43, "LD ({addr}),BC"],
    [0x4B, "LD BC,({addr})"],
    [0x53, "LD ({addr}),DE"],
    [0x5B, "LD DE,({addr})"],
    [0x63, "LD ({addr}),HL"],
    [0x6B, "LD HL,({addr})"],
    [0x73, "LD ({addr}),SP"],
    [0x7B, "LD SP,({addr})"],
  ]);
  if (memLoads.has(op)) {
    return { length: 5, mnemonic: memLoads.get(op).replace("{addr}", addrOperand(addr + 2)) };
  }

  return { length: 2, mnemonic: `ED ${hex(op, 2)}` };
}

function decodeIndex(addr, ix) {
  const op = b(addr + 1);
  const high = `${ix}H`;
  const low = `${ix}L`;
  const ixReg8 = ["B", "C", "D", "E", high, low, `(${ix}+d)`, "A"];

  if (op === 0xCB) return { length: 4, mnemonic: decodeIndexCb(ix, addr) };
  if (op === 0x21) return { length: 5, mnemonic: `LD ${ix},${imm24(addr + 2)}` };
  if (op === 0x22) return { length: 5, mnemonic: `LD (${addrOperand(addr + 2)}),${ix}` };
  if (op === 0x2A) return { length: 5, mnemonic: `LD ${ix},(${addrOperand(addr + 2)})` };
  if (op === 0x23) return { length: 2, mnemonic: `INC ${ix}` };
  if (op === 0x2B) return { length: 2, mnemonic: `DEC ${ix}` };
  if (op === 0x29) return { length: 2, mnemonic: `ADD ${ix},${ix}` };
  if (op === 0x34) return { length: 3, mnemonic: `INC (${ix}${disp(b(addr + 2))})` };
  if (op === 0x35) return { length: 3, mnemonic: `DEC (${ix}${disp(b(addr + 2))})` };
  if (op === 0x36) return { length: 4, mnemonic: `LD (${ix}${disp(b(addr + 2))}),${imm8(addr + 3)}` };
  if (op === 0x39) return { length: 2, mnemonic: `ADD ${ix},SP` };
  if (op === 0xE1) return { length: 2, mnemonic: `POP ${ix}` };
  if (op === 0xE3) return { length: 2, mnemonic: `EX (SP),${ix}` };
  if (op === 0xE5) return { length: 2, mnemonic: `PUSH ${ix}` };
  if (op === 0xE9) return { length: 2, mnemonic: `JP (${ix})` };
  if (op === 0xF9) return { length: 2, mnemonic: `LD SP,${ix}` };

  if ((op & 0xC7) === 0x04) return { length: 2, mnemonic: `INC ${ixReg8[(op >> 3) & 0x07]}` };
  if ((op & 0xC7) === 0x05) return { length: 2, mnemonic: `DEC ${ixReg8[(op >> 3) & 0x07]}` };
  if ((op & 0xC7) === 0x06) return { length: 3, mnemonic: `LD ${ixReg8[(op >> 3) & 0x07]},${imm8(addr + 2)}` };

  const loadFromIndex = new Map([
    [0x46, "B"],
    [0x4E, "C"],
    [0x56, "D"],
    [0x5E, "E"],
    [0x66, "H"],
    [0x6E, "L"],
    [0x7E, "A"],
  ]);
  if (loadFromIndex.has(op)) {
    return { length: 3, mnemonic: `LD ${loadFromIndex.get(op)},(${ix}${disp(b(addr + 2))})` };
  }
  if (op >= 0x70 && op <= 0x77 && op !== 0x76) {
    return { length: 3, mnemonic: `LD (${ix}${disp(b(addr + 2))}),${reg8[op & 0x07]}` };
  }
  if ([0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE].includes(op)) {
    return { length: 3, mnemonic: `${aluOps[(op >> 3) & 0x07]} (${ix}${disp(b(addr + 2))})` };
  }
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    return { length: 2, mnemonic: `LD ${ixReg8[(op >> 3) & 0x07]},${ixReg8[op & 0x07]}` };
  }
  if (op >= 0x80 && op <= 0xBF) {
    return { length: 2, mnemonic: `${aluOps[(op >> 3) & 0x07]} ${ixReg8[op & 0x07]}` };
  }

  const inner = decodeBase(addr + 1);
  return { length: inner.length + 1, mnemonic: `${ix} prefix: ${inner.mnemonic}` };
}

function decodeBase(addr) {
  const op = b(addr);

  if ((op & 0xC7) === 0x04) return { length: 1, mnemonic: `INC ${reg8[(op >> 3) & 0x07]}` };
  if ((op & 0xC7) === 0x05) return { length: 1, mnemonic: `DEC ${reg8[(op >> 3) & 0x07]}` };
  if ((op & 0xC7) === 0x06) return { length: 2, mnemonic: `LD ${reg8[(op >> 3) & 0x07]},${imm8(addr + 1)}` };
  if (op >= 0x40 && op <= 0x7F) {
    if (op === 0x76) return { length: 1, mnemonic: "HALT" };
    return { length: 1, mnemonic: `LD ${reg8[(op >> 3) & 0x07]},${reg8[op & 0x07]}` };
  }
  if (op >= 0x80 && op <= 0xBF) return { length: 1, mnemonic: `${aluOps[(op >> 3) & 0x07]} ${reg8[op & 0x07]}` };
  if ((op & 0xC7) === 0xC0) return { length: 1, mnemonic: `RET ${conditions[(op >> 3) & 0x07]}` };
  if ((op & 0xC7) === 0xC2) return { length: 4, mnemonic: `JP ${conditions[(op >> 3) & 0x07]},${addrOperand(addr + 1)}` };
  if ((op & 0xC7) === 0xC4) return { length: 4, mnemonic: `CALL ${conditions[(op >> 3) & 0x07]},${addrOperand(addr + 1)}` };
  if ((op & 0xC7) === 0xC6) return { length: 2, mnemonic: `${aluOps[(op >> 3) & 0x07]},${imm8(addr + 1)}` };
  if ((op & 0xCF) === 0xC1) return { length: 1, mnemonic: `POP ${reg16PushPop[(op >> 4) & 0x03]}` };
  if ((op & 0xCF) === 0xC5) return { length: 1, mnemonic: `PUSH ${reg16PushPop[(op >> 4) & 0x03]}` };
  if ((op & 0xC7) === 0xC7) return { length: 1, mnemonic: `RST ${hex(op & 0x38, 2)}` };

  switch (op) {
    case 0x00: return { length: 1, mnemonic: "NOP" };
    case 0x01: return { length: 4, mnemonic: `LD BC,${imm24(addr + 1)}` };
    case 0x02: return { length: 1, mnemonic: "LD (BC),A" };
    case 0x03: return { length: 1, mnemonic: "INC BC" };
    case 0x07: return { length: 1, mnemonic: "RLCA" };
    case 0x08: return { length: 1, mnemonic: "EX AF,AF'" };
    case 0x09: return { length: 1, mnemonic: "ADD HL,BC" };
    case 0x0A: return { length: 1, mnemonic: "LD A,(BC)" };
    case 0x0B: return { length: 1, mnemonic: "DEC BC" };
    case 0x0F: return { length: 1, mnemonic: "RRCA" };
    case 0x10: return { length: 2, mnemonic: `DJNZ ${hex(relTarget(addr, 2), 6)}` };
    case 0x11: return { length: 4, mnemonic: `LD DE,${imm24(addr + 1)}` };
    case 0x12: return { length: 1, mnemonic: "LD (DE),A" };
    case 0x13: return { length: 1, mnemonic: "INC DE" };
    case 0x17: return { length: 1, mnemonic: "RLA" };
    case 0x18: return { length: 2, mnemonic: `JR ${hex(relTarget(addr, 2), 6)}` };
    case 0x19: return { length: 1, mnemonic: "ADD HL,DE" };
    case 0x1A: return { length: 1, mnemonic: "LD A,(DE)" };
    case 0x1B: return { length: 1, mnemonic: "DEC DE" };
    case 0x1F: return { length: 1, mnemonic: "RRA" };
    case 0x20: return { length: 2, mnemonic: `JR NZ,${hex(relTarget(addr, 2), 6)}` };
    case 0x21: return { length: 4, mnemonic: `LD HL,${imm24(addr + 1)}` };
    case 0x22: return { length: 4, mnemonic: `LD (${addrOperand(addr + 1)}),HL` };
    case 0x23: return { length: 1, mnemonic: "INC HL" };
    case 0x27: return { length: 1, mnemonic: "DAA" };
    case 0x28: return { length: 2, mnemonic: `JR Z,${hex(relTarget(addr, 2), 6)}` };
    case 0x29: return { length: 1, mnemonic: "ADD HL,HL" };
    case 0x2A: return { length: 4, mnemonic: `LD HL,(${addrOperand(addr + 1)})` };
    case 0x2B: return { length: 1, mnemonic: "DEC HL" };
    case 0x2F: return { length: 1, mnemonic: "CPL" };
    case 0x30: return { length: 2, mnemonic: `JR NC,${hex(relTarget(addr, 2), 6)}` };
    case 0x31: return { length: 4, mnemonic: `LD SP,${imm24(addr + 1)}` };
    case 0x32: return { length: 4, mnemonic: `LD (${addrOperand(addr + 1)}),A` };
    case 0x33: return { length: 1, mnemonic: "INC SP" };
    case 0x37: return { length: 1, mnemonic: "SCF" };
    case 0x38: return { length: 2, mnemonic: `JR C,${hex(relTarget(addr, 2), 6)}` };
    case 0x39: return { length: 1, mnemonic: "ADD HL,SP" };
    case 0x3A: return { length: 4, mnemonic: `LD A,(${addrOperand(addr + 1)})` };
    case 0x3B: return { length: 1, mnemonic: "DEC SP" };
    case 0x3F: return { length: 1, mnemonic: "CCF" };
    case 0xC3: return { length: 4, mnemonic: `JP ${addrOperand(addr + 1)}` };
    case 0xC9: return { length: 1, mnemonic: "RET" };
    case 0xCD: return { length: 4, mnemonic: `CALL ${addrOperand(addr + 1)}` };
    case 0xD3: return { length: 2, mnemonic: `OUT (${imm8(addr + 1)}),A` };
    case 0xD9: return { length: 1, mnemonic: "EXX" };
    case 0xDB: return { length: 2, mnemonic: `IN A,(${imm8(addr + 1)})` };
    case 0xE3: return { length: 1, mnemonic: "EX (SP),HL" };
    case 0xE9: return { length: 1, mnemonic: "JP (HL)" };
    case 0xEB: return { length: 1, mnemonic: "EX DE,HL" };
    case 0xF3: return { length: 1, mnemonic: "DI" };
    case 0xF9: return { length: 1, mnemonic: "LD SP,HL" };
    case 0xFB: return { length: 1, mnemonic: "EI" };
    case 0xCB: return { length: 2, mnemonic: decodeCb(b(addr + 1)) };
    case 0xED: return decodeEd(addr);
    case 0xDD: return decodeIndex(addr, "IX");
    case 0xFD: return decodeIndex(addr, "IY");
    default: return { length: 1, mnemonic: `DB ${hex(op, 2)}` };
  }
}

function decode(addr) {
  const op = b(addr);
  if (modePrefixes.has(op)) {
    const inner = decodeBase(addr + 1);
    return { length: inner.length + 1, mnemonic: `${modePrefixes.get(op)} ${inner.mnemonic}` };
  }
  return decodeBase(addr);
}

function dumpInstruction(addr, end) {
  const decoded = decode(addr);
  const available = Math.max(1, Math.min(decoded.length, end - addr));
  const raw = bytes(addr, available).padEnd(17, " ");
  const suffix = available === decoded.length ? "" : " ; truncated at range end";
  console.log(`${hex(addr)}  ${raw}  ${decoded.mnemonic}${suffix}`);
  return available;
}

function scanRange(range) {
  const found = [];
  for (let addr = range.start; addr < range.end; addr++) {
    const op = b(addr);
    if (op === 0x2A && addr + 3 < range.end) {
      found.push({ addr, raw: bytes(addr, 4), label: `LD HL,(${addrOperand(addr + 1)})` });
    }
    if (op === 0xED && b(addr + 1) === 0x27 && addr + 4 < range.end) {
      found.push({ addr, raw: bytes(addr, 5), label: `ED 27 LD HL,(${addrOperand(addr + 2)})` });
    }
    if (op === 0xCD && addr + 3 < range.end) {
      found.push({ addr, raw: bytes(addr, 4), label: `CALL ${addrOperand(addr + 1)}` });
    }
    if (op === 0xC3 && addr + 3 < range.end) {
      found.push({ addr, raw: bytes(addr, 4), label: `JP ${addrOperand(addr + 1)}` });
    }
    if (op === 0xED && b(addr + 1) === 0x6C) {
      found.push({ addr, raw: bytes(addr, 2), label: "MLT HL" });
    }
  }
  return found;
}

function findBytes(range, pattern) {
  const hits = [];
  for (let addr = range.start; addr <= range.end - pattern.length; addr++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (b(addr + j) !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(addr);
  }
  return hits;
}

function printPatternHits(range, label, patterns) {
  const hits = [];
  for (const pattern of patterns) {
    for (const addr of findBytes(range, pattern.bytes)) {
      hits.push({ addr, raw: bytes(addr, pattern.bytes.length), form: pattern.form });
    }
  }
  if (hits.length === 0) {
    console.log(`  ${label}: none`);
    return;
  }
  for (const hit of hits) {
    console.log(`  ${label}: ${hex(hit.addr)}  ${hit.raw.padEnd(14, " ")}  ${hit.form}`);
  }
}

// Dump and decode 0x005A75-0x005AC0
console.log("=== 0x005A75 CHARACTER RENDERER DECODE ===");
for (let i = 0x005A75; i < 0x005AC0;) {
  // print raw hex bytes in groups
  i += dumpInstruction(i, 0x005AC0);
}

// Dump 0x00596E-0x005990
console.log("\n=== 0x00596E FONT BASE ADDER DECODE ===");
for (let i = 0x00596E; i < 0x005990;) {
  // print raw hex bytes in groups
  i += dumpInstruction(i, 0x005990);
}

// Search for LD HL,(Dxxxxx) pattern in the range
// Search for references to D0059C, D00595, D40000
console.log("\n=== TARGETED PATTERN SCAN ===");
for (const range of ranges) {
  console.log(`-- ${range.name} ${hex(range.start)}-${hex(range.end - 1)} --`);

  const instructionHits = scanRange(range);
  const ldHlHits = instructionHits.filter((hit) => hit.label.includes("LD HL,("));
  if (ldHlHits.length === 0) {
    console.log("  LD HL,(Dxxxxx): none");
  } else {
    for (const hit of ldHlHits) {
      const target = hit.label.match(/\((0x[0-9A-F]+)\)/)?.[1] ?? "";
      const isDRam = target.startsWith("0xD") || target.startsWith("0x00D");
      console.log(`  LD HL,(Dxxxxx): ${hex(hit.addr)}  ${hit.raw.padEnd(14, " ")}  ${hit.label}${isDRam ? " ; D-range RAM variable" : ""}`);
    }
  }

  const callJpMltHits = instructionHits.filter((hit) => hit.label.startsWith("CALL ") || hit.label.startsWith("JP ") || hit.label === "MLT HL");
  if (callJpMltHits.length === 0) {
    console.log("  CALL/JP/MLT: none");
  } else {
    for (const hit of callJpMltHits) {
      console.log(`  CALL/JP/MLT: ${hex(hit.addr)}  ${hit.raw.padEnd(14, " ")}  ${hit.label}`);
    }
  }

  printPatternHits(range, "D40000 bytes", [
    { bytes: [0xD4, 0x00, 0x00], form: "D4 00 00" },
    { bytes: [0x00, 0x00, 0xD4], form: "00 00 D4 (little-endian 0xD40000)" },
  ]);
  printPatternHits(range, "D0059C bytes", [
    { bytes: [0x9C, 0x05, 0xD0], form: "9C 05 D0 (little-endian 0xD0059C)" },
    { bytes: [0x9C, 0x05, 0x00], form: "9C 05 00 (little-endian 0x00059C)" },
  ]);
  printPatternHits(range, "D00595 bytes", [
    { bytes: [0x95, 0x05, 0xD0], form: "95 05 D0 (little-endian 0xD00595)" },
    { bytes: [0x95, 0x05, 0x00], form: "95 05 00 (little-endian 0x000595)" },
  ]);
}

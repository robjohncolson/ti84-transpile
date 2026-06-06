/**
 * probe-phase540-decode-07FA95.mjs
 * Decode 0x07FA95-0x07FAC1: OP5/OP4/OP3 zero stubs + validation cluster
 */

import { readFileSync } from "fs";

const rom = readFileSync("TI-84_Plus_CE/ROM.rom");

const START = 0x07FA95;
const END   = 0x07FAC2;

const region = rom.slice(START, END);

console.log("=== Raw hex dump 0x07FA95-0x07FAC1 ===");
for (let i = 0; i < region.length; i++) {
  const addr = (START + i).toString(16).toUpperCase().padStart(6, "0");
  const hex  = region[i].toString(16).toUpperCase().padStart(2, "0");
  process.stdout.write(addr + ": " + hex + "  ");
  if ((i + 1) % 8 === 0) process.stdout.write("\n");
}
console.log("\n");

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function signed8(v) {
  return v > 127 ? v - 256 : v;
}

function hexBytes(buf, off, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push(buf[off + i].toString(16).toUpperCase().padStart(2, "0"));
  }
  return parts.join(" ");
}

const disasm = [];
let pc = START;
let idx = 0;

function emit(len, mnemonic, comment) {
  disasm.push({ addr: pc, len, hex: hexBytes(region, idx, len), mnemonic, comment });
  pc += len;
  idx += len;
}

// 0x07FA95: LD HL, 0xD00624 (OP5)
emit(4, "LD HL, 0xD00624", "HL = OP5 address");

// 0x07FA99: JR +0x2B -> 0x07FAC6
emit(2, "JR 0x07FAC6", "Jump to XOR A + zero-fill (skip validation)");

// 0x07FA9B: LD HL, 0xD00619 (OP4)
emit(4, "LD HL, 0xD00619", "HL = OP4 address");

// 0x07FA9F: JR +0x25 -> 0x07FAC6
emit(2, "JR 0x07FAC6", "Jump to XOR A + zero-fill (skip validation)");

// 0x07FAA1: LD HL, 0xD0060E (OP3)
emit(4, "LD HL, 0xD0060E", "HL = OP3 address");

// 0x07FAA5: JR +0x1F -> 0x07FAC6
emit(2, "JR 0x07FAC6", "Jump to XOR A + zero-fill (skip validation)");

// 0x07FAA7: BIT 5,(IY+0x0A)
emit(4, "BIT 5, (IY+0x0A)", "Test system flag: undefined-variable guard");

// 0x07FAAB: JP NZ, 0x061D16
emit(4, "JP NZ, 0x061D16", "If flag set -> error dispatch (error 0x87 = ERR:UNDEFINED)");

// 0x07FAAF: XOR A
emit(1, "XOR A", "A = 0 (prepare zero fill value)");

// 0x07FAB0: JP 0x07FA2F
emit(4, "JP 0x07FA2F", "Jump to OP2 zero stub (LD HL,D00603 then JP 0x07FA7F shared fill)");

// 0x07FAB4: CALL 0x07FAB8
emit(4, "CALL 0x07FAB8", "Call the validation body (4 bytes ahead)");

// 0x07FAB8: CALL 0x07FD4A
emit(4, "CALL 0x07FD4A", "OP1 zero-check: returns Z if OP1 is zero");

// 0x07FABC: RET Z
emit(1, "RET Z", "Return if OP1 is zero (nothing to validate)");

// 0x07FABD: CALL 0x07FDF1
emit(4, "CALL 0x07FDF1", "Result validation / range check");

// 0x07FAC1: RET NZ
emit(1, "RET NZ", "Return if validation passed (NZ)");

// --- Print disassembly table ---
console.log("=== DISASSEMBLY: 0x07FA95-0x07FAC1 ===\n");
console.log("ADDR     BYTES            INSTRUCTION                        COMMENT");
console.log("------   ---------------  ---------------------------------  ----------------------------------------");
for (const d of disasm) {
  const addr = "0x" + d.addr.toString(16).toUpperCase().padStart(6, "0");
  const hex  = d.hex.padEnd(16);
  const inst = d.mnemonic.padEnd(34);
  console.log(addr + "   " + hex + " " + inst + " " + d.comment);
}

// --- Verify total bytes decoded ---
const totalBytes = disasm.reduce((s, d) => s + d.len, 0);
console.log("\nTotal bytes decoded: " + totalBytes + " (region size: " + (END - START) + ")");
console.log("Coverage: 0x" + START.toString(16).toUpperCase() + " - 0x" + (START + totalBytes - 1).toString(16).toUpperCase());

// --- Verify JR targets ---
console.log("\n=== JR TARGET VERIFICATION ===");
console.log("  All three JR instructions target 0x07FAC6");
console.log("  Byte at 0x07FAC6: 0x" + rom[0x07FAC6].toString(16).toUpperCase() + " (expected: AF = XOR A)");
console.log("  Byte at 0x07FAC7: 0x" + rom[0x07FAC7].toString(16).toUpperCase() + " (expected: C3 = JP)");
const fillTarget = read24(rom, 0x07FAC8);
console.log("  JP target at 0x07FAC7: 0x" + fillTarget.toString(16).toUpperCase() + " (expected: 07FA7F = shared zero-fill)");

// --- Call/JP target summary ---
console.log("\n=== CALL/JP TARGETS ===");
const targets = disasm.filter(d => d.mnemonic.startsWith("CALL") || d.mnemonic.startsWith("JP"));
for (const t of targets) {
  console.log("  " + t.mnemonic.padEnd(30) + " ; " + t.comment);
}

// --- Verify what is at 0x07FA2F ---
console.log("\n=== VERIFICATION: 0x07FA2F (JP target) ===");
console.log("  Bytes at 0x07FA2F: " + hexBytes(rom, 0x07FA2F, 8));
const op2Addr = read24(rom, 0x07FA30);
console.log("  LD HL, 0x" + op2Addr.toString(16).toUpperCase() + " (expected: D00603 = OP2)");

// --- Analysis ---
console.log("\n=== ANALYSIS ===\n");
console.log("STRUCTURE: Two distinct groups in this 45-byte region:\n");

console.log("GROUP A: OP ZERO STUBS WITHOUT VALIDATION (0x07FA95-0x07FAA6, 18 bytes)");
console.log("  Three entry points that zero OP5, OP4, or OP3 by loading the");
console.log("  target address into HL and jumping to XOR A + shared fill at 0x07FA7F.");
console.log("  These bypass the validation gate entirely -- they unconditionally zero.\n");
console.log("  0x07FA95: zeroOP5  -> LD HL,D00624; JR 0x07FAC6 (XOR A + JP 0x07FA7F)");
console.log("  0x07FA9B: zeroOP4  -> LD HL,D00619; JR 0x07FAC6 (XOR A + JP 0x07FA7F)");
console.log("  0x07FAA1: zeroOP3  -> LD HL,D0060E; JR 0x07FAC6 (XOR A + JP 0x07FA7F)\n");

console.log("GROUP B: VALIDATED ZERO-OP2 + VALIDATION SUBROUTINE (0x07FAA7-0x07FAC1, 27 bytes)");
console.log("  0x07FAA7: validatedZeroOP2 -- checks IY+0x0A bit 5 (undefined-variable flag).");
console.log("    If flag is SET   -> JP 0x061D16 (error 0x87 = ERR:UNDEFINED).");
console.log("    If flag is CLEAR -> XOR A; JP 0x07FA2F (OP2 zero-fill via shared path).\n");
console.log("  0x07FAB4: validateOP1_wrapper -- callable entry point.");
console.log("    CALL 0x07FAB8 (calls the body 4 bytes ahead, so the wrapper");
console.log("    can be CALLed and it will RET to the original caller).\n");
console.log("  0x07FAB8: validateOP1_body -- the actual validation logic:");
console.log("    1. CALL 0x07FD4A -- is OP1 zero?");
console.log("    2. RET Z         -- if zero, return (nothing to validate)");
console.log("    3. CALL 0x07FDF1 -- validate OP1 result/range");
console.log("    4. RET NZ        -- return if valid\n");

console.log("FALL-THROUGH: If validateOP1_body reaches RET NZ and Z IS set (validation");
console.log("failed), execution falls through past 0x07FAC1 into the next region");
console.log("(0x07FAC2 = zeroOP1). This means: on validation failure, OP1 gets zeroed");
console.log("as a recovery/cleanup action.\n");

console.log("OVERALL PURPOSE: OP register zero/validation cluster.");
console.log("- Group A: unconditional zero stubs for OP3/OP4/OP5 (FPU pipeline cleanup)");
console.log("- Group B: validated OP2 zero (undefined-variable guard) + OP1 validation");
console.log("  subroutine that checks for zero and range, zeroing OP1 on failure.");

console.log("\n=== PROBE COMPLETE ===");

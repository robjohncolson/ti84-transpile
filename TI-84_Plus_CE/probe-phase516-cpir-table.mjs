#!/usr/bin/env node

/**
 * Phase 516 -- Map the CPIR table at 0x09AF6F
 *
 * Session 515 decoded the token/alpha range dispatcher at 0x09AF4E (301B).
 * At 0x09AF5A there is a CPIR TABLE LOOKUP: BC=count, HL=0x09AF6F (15-byte table).
 * CPIR (ED B1) searches for A in table: compare A with (HL), HL++, BC--, repeat
 * until match or BC=0. Matched codes take fast path, unmatched fall through.
 *
 * This probe:
 *  1. Extracts the 15 bytes at 0x09AF6F-0x09AF7D
 *  2. Cross-references each byte with the OS scan code table from keyboard-matrix.md
 *  3. Decodes ~30 bytes before (CPIR setup) and ~30 bytes after (post-match code)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, "ROM.rom");

const rom = fs.readFileSync(ROM_PATH);

// ---- Helpers ----

function hex2(v) {
  return "0x" + (v & 0xFF).toString(16).padStart(2, "0").toUpperCase();
}

function hex6(v) {
  return "0x" + v.toString(16).padStart(6, "0").toUpperCase();
}

// OS scan code -> key name mapping (from keyboard-matrix.md)
const OS_SCANCODE_NAMES = {
  0x01: "GRAPH",   0x02: "TRACE",  0x03: "ZOOM",    0x04: "WINDOW",
  0x05: "Y=",      0x06: "2ND",    0x07: "MODE",    0x08: "DEL",
  0x0A: "STO->",   0x0B: "LN",     0x0C: "LOG",     0x0D: "x^2",
  0x0E: "x^-1",    0x0F: "MATH",   0x10: "ALPHA",
  0x11: "0",       0x12: "1",      0x13: "4",       0x14: "7",
  0x15: ",",       0x16: "SIN",    0x17: "APPS",    0x18: "X,T,n",
  0x19: ".",       0x1A: "2",      0x1B: "5",       0x1C: "8",
  0x1D: "(",       0x1E: "COS",    0x1F: "PRGM",   0x20: "STAT",
  0x21: "(-)",     0x22: "3",      0x23: "6",       0x24: "9",
  0x25: ")",       0x26: "TAN",    0x27: "VARS",
  0x29: "ENTER",   0x2A: "+",      0x2B: "-",       0x2C: "*",
  0x2D: "/",       0x2E: "^",      0x2F: "CLEAR",
  0x31: "DOWN",    0x32: "LEFT",   0x33: "RIGHT",   0x34: "UP",
};

// Internal key codes (from scancode-translate.js / translation table at 0x09F79B)
const INTERNAL_KEY_NAMES = {
  0x01: "DOWN",  0x02: "LEFT",  0x03: "RIGHT", 0x04: "UP",
  0x09: "ENTER", 0x0A: "+",     0x0B: "-",     0x0C: "*",
  0x0D: "/",     0x0E: "^",     0x0F: "CLEAR",
  0x11: "(-)",   0x12: "3",     0x13: "6",     0x14: "9",
  0x15: ")",     0x16: "TAN",   0x17: "VARS",
  0x19: ".",     0x1A: "2",     0x1B: "5",     0x1C: "8",
  0x1D: "(",     0x1E: "COS",   0x1F: "PRGM",  0x20: "STAT",
  0x21: "0",     0x22: "1",     0x23: "4",     0x24: "7",
  0x25: ",",     0x26: "SIN",   0x27: "APPS",  0x28: "X,T,n",
  0x2A: "STO->", 0x2B: "LN",    0x2C: "LOG",   0x2D: "x^2",
  0x2E: "x^-1",  0x2F: "MATH",  0x30: "ALPHA",
  0x31: "GRAPH", 0x32: "TRACE", 0x33: "ZOOM",  0x34: "WINDOW",
  0x35: "Y=",    0x36: "2ND",   0x37: "MODE",  0x38: "DEL",
};

// ---- CPIR Table ----

const TABLE_ADDR = 0x09AF6F;
const TABLE_LEN = 15;

console.log("=== CPIR TABLE at " + hex6(TABLE_ADDR) + " (" + TABLE_LEN + " bytes) ===\n");
console.log("Context: 0x09AF4E range dispatcher does CPIR with BC=" + TABLE_LEN + ", HL=" + hex6(TABLE_ADDR));
console.log("CPIR searches for register A in this table. Match -> fast path, no match -> fall through.\n");

console.log("Index | Addr       | Byte | As OS scancode       | As internal key code");
console.log("------|------------|------|----------------------|---------------------");

for (let i = 0; i < TABLE_LEN; i++) {
  const addr = TABLE_ADDR + i;
  const byte = rom[addr];
  const osName = OS_SCANCODE_NAMES[byte] || "???";
  const intName = INTERNAL_KEY_NAMES[byte] || "???";
  console.log(
    "  " + String(i).padStart(2) + "  | " + hex6(addr) + " | " + hex2(byte) +
    "  | OS sc " + hex2(byte) + " = " + osName.padEnd(12) +
    " | internal " + hex2(byte) + " = " + intName
  );
}

// ---- Context: bytes before (CPIR setup) ----

const PRE_START = TABLE_ADDR - 30;
const PRE_LEN = 30;

console.log("\n=== DISASM CONTEXT: 30 bytes BEFORE table (" + hex6(PRE_START) + " - " + hex6(TABLE_ADDR - 1) + ") ===\n");

let line = "";
for (let i = 0; i < PRE_LEN; i++) {
  const addr = PRE_START + i;
  const byte = rom[addr];
  if (i > 0 && i % 16 === 0) {
    console.log(hex6(PRE_START + i - 16) + ": " + line.trim());
    line = "";
  }
  line += hex2(byte).slice(2) + " ";
}
if (line.trim()) {
  const lastLineStart = PRE_START + Math.floor((PRE_LEN - 1) / 16) * 16;
  console.log(hex6(lastLineStart) + ": " + line.trim());
}

console.log("\neZ80 reference: ED B1=CPIR, 01=LD BC imm24, 21=LD HL imm24, E2=JP PO, EA=JP PE");

function disasmRange(start, len) {
  for (let i = 0; i < len; i++) {
    const addr = start + i;
    const b = rom[addr];
    if (b === 0xED && i + 1 < len && rom[addr + 1] === 0xB1) {
      console.log("  " + hex6(addr) + ": ED B1       = CPIR");
      i++;
    } else if (b === 0x01 && i + 3 < len) {
      const imm = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
      console.log("  " + hex6(addr) + ": 01 " + hex2(rom[addr+1]).slice(2) + " " + hex2(rom[addr+2]).slice(2) + " " + hex2(rom[addr+3]).slice(2) + "  = LD BC, " + hex6(imm) + " (" + imm + ")");
      i += 3;
    } else if (b === 0x21 && i + 3 < len) {
      const imm = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
      console.log("  " + hex6(addr) + ": 21 " + hex2(rom[addr+1]).slice(2) + " " + hex2(rom[addr+2]).slice(2) + " " + hex2(rom[addr+3]).slice(2) + "  = LD HL, " + hex6(imm));
      i += 3;
    } else if (b === 0xE2 && i + 3 < len) {
      const t = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
      console.log("  " + hex6(addr) + ": E2 " + hex2(rom[addr+1]).slice(2) + " " + hex2(rom[addr+2]).slice(2) + " " + hex2(rom[addr+3]).slice(2) + "  = JP PO, " + hex6(t) + " (no match)");
      i += 3;
    } else if (b === 0xEA && i + 3 < len) {
      const t = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
      console.log("  " + hex6(addr) + ": EA " + hex2(rom[addr+1]).slice(2) + " " + hex2(rom[addr+2]).slice(2) + " " + hex2(rom[addr+3]).slice(2) + "  = JP PE, " + hex6(t) + " (match found)");
      i += 3;
    } else if (b === 0xC3 && i + 3 < len) {
      const t = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
      console.log("  " + hex6(addr) + ": C3 " + hex2(rom[addr+1]).slice(2) + " " + hex2(rom[addr+2]).slice(2) + " " + hex2(rom[addr+3]).slice(2) + "  = JP " + hex6(t));
      i += 3;
    } else if (b === 0xFE && i + 1 < len) {
      console.log("  " + hex6(addr) + ": FE " + hex2(rom[addr+1]).slice(2) + "       = CP " + hex2(rom[addr+1]));
      i++;
    } else if (b === 0xC9) {
      console.log("  " + hex6(addr) + ": C9          = RET");
    } else if (b === 0xCA && i + 3 < len) {
      const t = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
      console.log("  " + hex6(addr) + ": CA " + hex2(rom[addr+1]).slice(2) + " " + hex2(rom[addr+2]).slice(2) + " " + hex2(rom[addr+3]).slice(2) + "  = JP Z, " + hex6(t));
      i += 3;
    } else if (b === 0xC2 && i + 3 < len) {
      const t = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
      console.log("  " + hex6(addr) + ": C2 " + hex2(rom[addr+1]).slice(2) + " " + hex2(rom[addr+2]).slice(2) + " " + hex2(rom[addr+3]).slice(2) + "  = JP NZ, " + hex6(t));
      i += 3;
    } else if (b === 0x28 && i + 1 < len) {
      const off = rom[addr+1]; const s = off > 127 ? off - 256 : off;
      console.log("  " + hex6(addr) + ": 28 " + hex2(rom[addr+1]).slice(2) + "       = JR Z, " + hex6(addr+2+s) + " (off " + s + ")");
      i++;
    } else if (b === 0x20 && i + 1 < len) {
      const off = rom[addr+1]; const s = off > 127 ? off - 256 : off;
      console.log("  " + hex6(addr) + ": 20 " + hex2(rom[addr+1]).slice(2) + "       = JR NZ, " + hex6(addr+2+s) + " (off " + s + ")");
      i++;
    } else if (b === 0x38 && i + 1 < len) {
      const off = rom[addr+1]; const s = off > 127 ? off - 256 : off;
      console.log("  " + hex6(addr) + ": 38 " + hex2(rom[addr+1]).slice(2) + "       = JR C, " + hex6(addr+2+s) + " (off " + s + ")");
      i++;
    } else if (b === 0x30 && i + 1 < len) {
      const off = rom[addr+1]; const s = off > 127 ? off - 256 : off;
      console.log("  " + hex6(addr) + ": 30 " + hex2(rom[addr+1]).slice(2) + "       = JR NC, " + hex6(addr+2+s) + " (off " + s + ")");
      i++;
    } else if (b === 0x18 && i + 1 < len) {
      const off = rom[addr+1]; const s = off > 127 ? off - 256 : off;
      console.log("  " + hex6(addr) + ": 18 " + hex2(rom[addr+1]).slice(2) + "       = JR " + hex6(addr+2+s) + " (off " + s + ")");
      i++;
    } else if (b === 0xCD && i + 3 < len) {
      const t = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
      console.log("  " + hex6(addr) + ": CD " + hex2(rom[addr+1]).slice(2) + " " + hex2(rom[addr+2]).slice(2) + " " + hex2(rom[addr+3]).slice(2) + "  = CALL " + hex6(t));
      i += 3;
    } else if (b === 0x3E && i + 1 < len) {
      console.log("  " + hex6(addr) + ": 3E " + hex2(rom[addr+1]).slice(2) + "       = LD A, " + hex2(rom[addr+1]));
      i++;
    } else if (b === 0xD9) {
      console.log("  " + hex6(addr) + ": D9          = EXX");
    } else if (b === 0xD5) {
      console.log("  " + hex6(addr) + ": D5          = PUSH DE");
    } else if (b === 0xC5) {
      console.log("  " + hex6(addr) + ": C5          = PUSH BC");
    } else if (b === 0xE5) {
      console.log("  " + hex6(addr) + ": E5          = PUSH HL");
    } else if (b === 0xD1) {
      console.log("  " + hex6(addr) + ": D1          = POP DE");
    } else if (b === 0xC1) {
      console.log("  " + hex6(addr) + ": C1          = POP BC");
    } else if (b === 0xE1) {
      console.log("  " + hex6(addr) + ": E1          = POP HL");
    } else if (b === 0xF5) {
      console.log("  " + hex6(addr) + ": F5          = PUSH AF");
    } else if (b === 0xF1) {
      console.log("  " + hex6(addr) + ": F1          = POP AF");
    } else {
      console.log("  " + hex6(addr) + ": " + hex2(b).slice(2) + "          = ? (" + hex2(b) + ")");
    }
  }
}

console.log("\nByte-by-byte annotation (before table):");
disasmRange(PRE_START, PRE_LEN);

// ---- Context: bytes after table (post-match code) ----

const POST_START = TABLE_ADDR + TABLE_LEN;
const POST_LEN = 30;

console.log("\n=== DISASM CONTEXT: 30 bytes AFTER table (" + hex6(POST_START) + " - " + hex6(POST_START + POST_LEN - 1) + ") ===\n");

line = "";
for (let i = 0; i < POST_LEN; i++) {
  const addr = POST_START + i;
  const byte = rom[addr];
  if (i > 0 && i % 16 === 0) {
    console.log(hex6(POST_START + i - 16) + ": " + line.trim());
    line = "";
  }
  line += hex2(byte).slice(2) + " ";
}
if (line.trim()) {
  const lastLineStart = POST_START + Math.floor((POST_LEN - 1) / 16) * 16;
  console.log(hex6(lastLineStart) + ": " + line.trim());
}

console.log("\nByte-by-byte annotation (after table):");
disasmRange(POST_START, POST_LEN);

// ---- Summary ----

console.log("\n=== SUMMARY ===\n");
console.log("The CPIR table contains these 15 bytes:");
const tableBytes = [];
for (let i = 0; i < TABLE_LEN; i++) {
  tableBytes.push(rom[TABLE_ADDR + i]);
}
console.log("  Raw: " + tableBytes.map(b => hex2(b)).join(" "));
console.log("\nIf these are OS scan codes:");
for (const b of tableBytes) {
  const name = OS_SCANCODE_NAMES[b] || "unknown";
  console.log("  " + hex2(b) + " = " + name);
}
console.log("\nIf these are internal key codes:");
for (const b of tableBytes) {
  const name = INTERNAL_KEY_NAMES[b] || "unknown";
  console.log("  " + hex2(b) + " = " + name);
}
console.log("\nNote: These values may be token codes rather than scan/key codes.");
console.log("Cross-reference with the translation table at 0x09F79B for confirmation.");

console.log("\nDone.");
#!/usr/bin/env node

/**
 * Phase 144 -- Extract scan-code translation table from ROM
 *
 * Reads the 228-byte table at ROM address 0x09F79B that maps _GetCSC
 * scan codes (0x00-0x38) to internal OS key codes across 4 modifier states.
 * Outputs a formatted table to stdout and generates scancode-translate.js.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, "ROM.rom");

const romBytes = fs.readFileSync(ROM_PATH);

// ---- Constants ----

const TABLE_ADDR = 0x09F79B;
const SECTION_OFFSETS = [0x00, 0x38, 0x70, 0xA8];
const SECTION_NAMES = ["Unmodified", "2nd", "Alpha", "Alpha+2nd"];
const MAX_SC = 0x38;

const KEY_LABELS = {
  0x01: "DOWN", 0x02: "LEFT", 0x03: "RIGHT", 0x04: "UP",
  0x09: "ENTER", 0x0A: "+", 0x0B: "-", 0x0C: "*", 0x0D: "/", 0x0E: "^", 0x0F: "CLEAR",
  0x11: "(-)", 0x12: "3", 0x13: "6", 0x14: "9", 0x15: ")", 0x16: "TAN", 0x17: "VARS",
  0x19: ".", 0x1A: "2", 0x1B: "5", 0x1C: "8", 0x1D: "(", 0x1E: "COS", 0x1F: "PRGM", 0x20: "STAT",
  0x21: "0", 0x22: "1", 0x23: "4", 0x24: "7", 0x25: ",", 0x26: "SIN", 0x27: "APPS", 0x28: "X,T,n",
  0x2A: "STO", 0x2B: "LN", 0x2C: "LOG", 0x2D: "x^2", 0x2E: "x^-1", 0x2F: "MATH", 0x30: "ALPHA",
  0x31: "GRAPH", 0x32: "TRACE", 0x33: "ZOOM", 0x34: "WINDOW", 0x35: "Y=", 0x36: "2ND", 0x37: "MODE", 0x38: "DEL",
};

function hex2(v) {
  return "0x" + (v & 0xFF).toString(16).padStart(2, "0").toUpperCase();
}

function classify(ic) {
  if (ic === 0x00) return "";
  if (ic >= 0x20 && ic <= 0x7E) return String.fromCharCode(ic);
  return "";
}

// ---- Extract all 4 sections ----

const sections = SECTION_OFFSETS.map((offset, i) => {
  const entries = [];
  for (let sc = 0; sc <= MAX_SC; sc++) {
    entries.push(romBytes[TABLE_ADDR + offset + sc]);
  }
  return { name: SECTION_NAMES[i], offset, entries };
});

// ---- Print formatted table ----

console.log("Phase 144 -- Scan Code Translation Table (ROM 0x09F79B)");
console.log("=".repeat(100));
console.log("");

const hdr = "SC   Key         " +
  SECTION_NAMES.map(n => n.padEnd(16)).join("");
console.log(hdr);
console.log("-".repeat(hdr.length));

for (let sc = 0; sc <= MAX_SC; sc++) {
  const vals = sections.map(s => s.entries[sc]);
  if (vals.every(v => v === 0x00)) continue;

  const scStr = hex2(sc).padEnd(5);
  const label = (KEY_LABELS[sc] || "").padEnd(12);

  const colStrs = vals.map(v => {
    if (v === 0x00) return "  --          ";
    const ch = classify(v);
    const tag = ch ? " " + "'" + ch + "'" : "";
    return (hex2(v) + tag).padEnd(16);
  });

  console.log(scStr + label + colStrs.join(""));
}

console.log("");

// ---- Generate scancode-translate.js ----

const jsLines = [];
jsLines.push("// Auto-generated from ROM 0x09F79B (Phase 141/144 scan code translation table)");
jsLines.push("// Usage: scanCodeToKeyCode[modifier][scanCode]");
jsLines.push("// modifier: 0=none, 1=2nd, 2=alpha, 3=alpha+2nd");
jsLines.push("// scanCode: 0x00-0x38 (_GetCSC sequential scan codes)");
jsLines.push("// Value: internal OS key code (0x00 = no mapping)");
jsLines.push("//");
jsLines.push("// ROM lookup code at 0x03010D:");
jsLines.push("//   BIT 4,(IY+0x12) -> test alpha flag");
jsLines.push("//   ADD A,0x70      -> alpha offset");
jsLines.push("//   BIT 5,(IY+0x12) -> test 2nd flag");
jsLines.push("//   ADD A,0x38      -> 2nd offset (cumulative)");
jsLines.push("//   LD L,A; LD H,0; LD DE,0x09F79B; ADD HL,DE; LD A,(HL)");
jsLines.push("//");
jsLines.push("// Internal code ranges:");
jsLines.push("//   0x01-0x0F: Control codes (arrows, enter, clear, del)");
jsLines.push("//   0x30-0x3E: Digit/punctuation ASCII");
jsLines.push("//   0x41-0x5A: Letter codes (A-Z)");
jsLines.push("//   0x80-0xFF: Function/token codes (math ops, trig, etc.)");
jsLines.push("");
jsLines.push("export const scanCodeToKeyCode = [");

for (let s = 0; s < 4; s++) {
  const sec = sections[s];
  jsLines.push("  // Section " + s + ": " + sec.name);
  jsLines.push("  [");
  for (let i = 0; i < sec.entries.length; i += 16) {
    const chunk = sec.entries.slice(i, Math.min(i + 16, sec.entries.length));
    const hexVals = chunk.map(v => "0x" + v.toString(16).padStart(2, "0"));
    jsLines.push("    " + hexVals.join(", ") + ",");
  }
  jsLines.push("  ],");
}

jsLines.push("];");
jsLines.push("");
jsLines.push("// Reverse lookup: internal key code -> { scanCode, modifier }");
jsLines.push("// Useful for debugging which physical key produces a given code");
jsLines.push("export function reverseLookup(internalCode) {");
jsLines.push("  const results = [];");
jsLines.push("  const modNames = [\"none\", \"2nd\", \"alpha\", \"alpha+2nd\"];");
jsLines.push("  for (let m = 0; m < 4; m++) {");
jsLines.push("    for (let sc = 0; sc < scanCodeToKeyCode[m].length; sc++) {");
jsLines.push("      if (scanCodeToKeyCode[m][sc] === internalCode) {");
jsLines.push("        results.push({ scanCode: sc, modifier: m, modifierName: modNames[m] });");
jsLines.push("      }");
jsLines.push("    }");
jsLines.push("  }");
jsLines.push("  return results;");
jsLines.push("}");
jsLines.push("");

const jsOut = jsLines.join(String.fromCharCode(10));
const jsPath = path.join(__dirname, "scancode-translate.js");
fs.writeFileSync(jsPath, jsOut, "utf8");
console.log("Wrote " + path.basename(jsPath) + " (" + jsLines.length + " lines)");

// ---- Stats summary ----

console.log("");
console.log("Section stats:");
for (const s of sections) {
  const active = s.entries.filter(v => v !== 0).length;
  const letters = s.entries.filter(v => v >= 0x41 && v <= 0x5A).length;
  const digits = s.entries.filter(v => v >= 0x30 && v <= 0x39).length;
  const tokens = s.entries.filter(v => v >= 0x80).length;
  console.log("  " + s.name.padEnd(12) + ": " + active + " active (" + letters + " letters, " + digits + " digits, " + tokens + " tokens)");
}

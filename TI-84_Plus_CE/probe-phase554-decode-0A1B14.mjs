/**
 * probe-phase554-decode-0A1B14.mjs
 *
 * Decodes:
 *   - 0x0A1B14: 8-byte bit-mask table (MSB-first pixel masks for 1bpp mono mode)
 *   - 0x0A1B1C: standalone function called from the blit loop at 0x0A24C8
 *   - Last ~20B of 0x0A1A9D (0x0A1B00-0x0A1B13) showing how it uses the table
 *   - All ROM cross-references to both addresses
 *
 * Run via watchdog:
 *   node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase554-decode-0A1B14.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const romPath = join(__dir, "ROM.rom");
const rom = readFileSync(romPath);

// ---------------------------------------------------------------------------
// Minimal eZ80 ADL-mode disassembler (opcode subset for this region)
// ---------------------------------------------------------------------------
function disasm(startAddr, maxBytes, stopOnRet = true) {
  const out = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    const off = pc;
    let b0 = rom[pc++];
    let size = 1;
    let prefix = null;
    let mnem = "";

    if (b0 === 0xFD || b0 === 0xDD || b0 === 0xED || b0 === 0xCB) {
      prefix = b0;
      b0 = rom[pc++];
      size++;
    }

    if (prefix === 0xFD) {
      if (b0 === 0xCB) {
        const disp = rom[pc++];
        const op2 = rom[pc++];
        size += 2;
        const bit = (op2 >> 3) & 7;
        const opName =
          (op2 & 0xC0) === 0x40 ? "BIT" :
          (op2 & 0xC0) === 0x80 ? "RES" : "SET";
        mnem = opName + " " + bit + ",(IY+0x" + disp.toString(16) + ")";
      } else if (b0 === 0x19) { mnem = "ADD IY,DE"; }
      else if (b0 === 0xE5) { mnem = "PUSH IY"; }
      else if (b0 === 0xE1) { mnem = "POP IY"; }
      else { mnem = "FD 0x" + b0.toString(16); }

    } else if (prefix === 0xED) {
      if      (b0 === 0x6C) { mnem = "MLT HL"; }
      else if (b0 === 0x4C) { mnem = "MLT BC"; }
      else if (b0 === 0x5C) { mnem = "MLT DE"; }
      else { mnem = "ED 0x" + b0.toString(16); }

    } else if (prefix === 0xCB) {
      const shiftNames = {
        0x00: "RLC", 0x08: "RRC", 0x10: "RL",  0x18: "RR",
        0x20: "SLA", 0x28: "SRA", 0x38: "SRL",
      };
      const regs8 = ["B","C","D","E","H","L","(HL)","A"];
      const name = shiftNames[b0 & 0xF8];
      mnem = (name || "CB?") + " " + regs8[b0 & 7];

    } else {
      switch (b0) {
        case 0xC9: mnem = "RET";       break;
        case 0xC8: mnem = "RET Z";     break;
        case 0xD0: mnem = "RET NC";    break;
        case 0xD8: mnem = "RET C";     break;
        case 0xF1: mnem = "POP AF";    break;
        case 0xC1: mnem = "POP BC";    break;
        case 0xD1: mnem = "POP DE";    break;
        case 0xE1: mnem = "POP HL";    break;
        case 0xF5: mnem = "PUSH AF";   break;
        case 0xC5: mnem = "PUSH BC";   break;
        case 0xD5: mnem = "PUSH DE";   break;
        case 0xE5: mnem = "PUSH HL";   break;
        case 0x09: mnem = "ADD HL,BC"; break;
        case 0x19: mnem = "ADD HL,DE"; break;
        case 0x29: mnem = "ADD HL,HL"; break;
        case 0x0B: mnem = "DEC BC";    break;
        case 0x1B: mnem = "DEC DE";    break;
        case 0x2B: mnem = "DEC HL";    break;
        case 0x03: mnem = "INC BC";    break;
        case 0x13: mnem = "INC DE";    break;
        case 0x23: mnem = "INC HL";    break;
        case 0x3C: mnem = "INC A";     break;
        case 0x3D: mnem = "DEC A";     break;
        case 0xB7: mnem = "OR A";      break;
        case 0x6F: mnem = "LD L,A";    break;
        case 0x67: mnem = "LD H,A";    break;
        case 0x47: mnem = "LD B,A";    break;
        case 0x4F: mnem = "LD C,A";    break;
        case 0x57: mnem = "LD D,A";    break;
        case 0x5F: mnem = "LD E,A";    break;
        case 0x60: mnem = "LD H,B";    break;
        case 0x68: mnem = "LD L,B";    break;
        case 0x78: mnem = "LD A,B";    break;
        case 0x79: mnem = "LD A,C";    break;
        case 0x7A: mnem = "LD A,D";    break;
        case 0x7B: mnem = "LD A,E";    break;
        case 0x7C: mnem = "LD A,H";    break;
        case 0x7D: mnem = "LD A,L";    break;
        case 0x7E: mnem = "LD A,(HL)"; break;
        case 0x77: mnem = "LD (HL),A"; break;
        case 0x91: mnem = "SUB C";     break;
        case 0x93: mnem = "SUB E";     break;
        case 0x90: mnem = "SUB B";     break;
        case 0xBD: mnem = "CP L";      break;
        case 0xBC: mnem = "CP H";      break;
        case 0xB8: mnem = "CP B";      break;
        case 0xA7: mnem = "AND A";     break;
        case 0xA0: mnem = "AND B";     break;
        case 0xB0: mnem = "OR B";      break;
        case 0xAF: mnem = "XOR A";     break;
        case 0x26: { const n = rom[pc++]; size++; mnem = "LD H,0x" + n.toString(16).padStart(2,"0"); break; }
        case 0x2E: { const n = rom[pc++]; size++; mnem = "LD L,0x" + n.toString(16).padStart(2,"0"); break; }
        case 0x3E: { const n = rom[pc++]; size++; mnem = "LD A,0x" + n.toString(16).padStart(2,"0"); break; }
        case 0x06: { const n = rom[pc++]; size++; mnem = "LD B,0x" + n.toString(16).padStart(2,"0"); break; }
        case 0x0E: { const n = rom[pc++]; size++; mnem = "LD C,0x" + n.toString(16).padStart(2,"0"); break; }
        case 0x16: { const n = rom[pc++]; size++; mnem = "LD D,0x" + n.toString(16).padStart(2,"0"); break; }
        case 0x1E: { const n = rom[pc++]; size++; mnem = "LD E,0x" + n.toString(16).padStart(2,"0"); break; }
        case 0xE6: { const n = rom[pc++]; size++; mnem = "AND 0x" + n.toString(16).padStart(2,"0"); break; }
        case 0xF6: { const n = rom[pc++]; size++; mnem = "OR 0x" + n.toString(16).padStart(2,"0"); break; }
        case 0xD6: { const n = rom[pc++]; size++; mnem = "SUB 0x" + n.toString(16).padStart(2,"0"); break; }
        case 0xFE: { const n = rom[pc++]; size++; mnem = "CP 0x" + n.toString(16).padStart(2,"0"); break; }
        case 0xC6: { const n = rom[pc++]; size++; mnem = "ADD A,0x" + n.toString(16).padStart(2,"0"); break; }
        case 0x20: { const d=rom[pc++]; size++; const t=pc+(d<0x80?d:d-256); mnem="JR NZ,0x"+t.toString(16); break; }
        case 0x28: { const d=rom[pc++]; size++; const t=pc+(d<0x80?d:d-256); mnem="JR Z,0x"+t.toString(16); break; }
        case 0x30: { const d=rom[pc++]; size++; const t=pc+(d<0x80?d:d-256); mnem="JR NC,0x"+t.toString(16); break; }
        case 0x38: { const d=rom[pc++]; size++; const t=pc+(d<0x80?d:d-256); mnem="JR C,0x"+t.toString(16); break; }
        case 0x18: { const d=rom[pc++]; size++; const t=pc+(d<0x80?d:d-256); mnem="JR 0x"+t.toString(16); break; }
        case 0x10: { const d=rom[pc++]; size++; const t=pc+(d<0x80?d:d-256); mnem="DJNZ 0x"+t.toString(16); break; }
        case 0xCA: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="JP Z,0x"+a.toString(16); break; }
        case 0xC2: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="JP NZ,0x"+a.toString(16); break; }
        case 0xDA: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="JP C,0x"+a.toString(16); break; }
        case 0xD2: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="JP NC,0x"+a.toString(16); break; }
        case 0xC3: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="JP 0x"+a.toString(16); break; }
        case 0xCD: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="CALL 0x"+a.toString(16); break; }
        case 0xCC: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="CALL Z,0x"+a.toString(16); break; }
        case 0xDC: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="CALL C,0x"+a.toString(16); break; }
        case 0xC4: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="CALL NZ,0x"+a.toString(16); break; }
        case 0x21: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="LD HL,0x"+a.toString(16); break; }
        case 0x11: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="LD DE,0x"+a.toString(16); break; }
        case 0x01: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="LD BC,0x"+a.toString(16); break; }
        case 0x3A: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="LD A,(0x"+a.toString(16)+")"; break; }
        case 0x32: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="LD (0x"+a.toString(16)+"),A"; break; }
        case 0x2A: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="LD HL,(0x"+a.toString(16)+")"; break; }
        case 0x22: { const a=rom[pc]|(rom[pc+1]<<8)|(rom[pc+2]<<16); pc+=3; size+=3; mnem="LD (0x"+a.toString(16)+"),HL"; break; }
        default: mnem = "??? 0x" + b0.toString(16);
      }
    }

    const byteHex = Array.from(rom.slice(off, off + size))
      .map(b => b.toString(16).padStart(2, "0"))
      .join(" ");
    out.push({ addr: off, bytes: byteHex, mnem, size });

    if (stopOnRet &&
        (mnem === "RET" || mnem === "RET Z" || mnem === "RET NC" || mnem === "RET C")) {
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Section 1 — Hex dump: 0x0A1B00-0x0A1B7F
// ---------------------------------------------------------------------------
console.log("=".repeat(70));
console.log("HEX DUMP: 0x0A1B00-0x0A1B7F (128 bytes)");
console.log("=".repeat(70));

const DUMP_BASE = 0x0A1B00;
const DUMP_LEN  = 0x80;

for (let i = 0; i < DUMP_LEN; i += 16) {
  const addr  = (DUMP_BASE + i).toString(16).toUpperCase().padStart(6, "0");
  const chunk = rom.slice(DUMP_BASE + i, DUMP_BASE + i + 16);
  const hex   = Array.from(chunk).map(b => b.toString(16).padStart(2, "0")).join(" ");
  const ascii = Array.from(chunk)
    .map(b => b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : ".")
    .join("");
  console.log(addr + ": " + hex.padEnd(47, " ") + "  " + ascii);
}

// ---------------------------------------------------------------------------
// Section 2 — Verify the 8-byte table at 0x0A1B14
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log("TABLE VERIFICATION: 0x0A1B14 (8 bytes - mono pixel bit-mask table)");
console.log("=".repeat(70));

const TABLE_ADDR = 0x0A1B14;
const tableBytes = Array.from(rom.slice(TABLE_ADDR, TABLE_ADDR + 8));
const EXPECTED   = [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01];
const allMatch   = tableBytes.every((b, i) => b === EXPECTED[i]);

console.log("Address: 0x" + TABLE_ADDR.toString(16));
console.log("Bytes:   " + tableBytes.map(b => "0x" + b.toString(16).padStart(2,"0")).join(", "));
console.log("Binary:  " + tableBytes.map(b => b.toString(2).padStart(8,"0")).join(" "));
console.log("Match:   " + (allMatch ? "PASS" : "FAIL") + " (expected 0x80..0x01 MSB-first)");
console.log();
for (let i = 0; i < 8; i++) {
  const mask = tableBytes[i];
  console.log("  table[" + i + "] = 0x" + mask.toString(16).padStart(2,"0") +
              " = " + mask.toString(2).padStart(8,"0") + "b  -> bit " + (7-i) + " of byte");
}
console.log();
console.log("Usage in 1bpp mono mode (each framebuffer byte = 8 pixels):");
console.log("  byteOffset = x >> 3           (x / 8, which byte in the row)");
console.log("  bitMask    = table[x & 7]      (MSB = leftmost pixel in byte)");
console.log("  pixelOn    = framebufByte & bitMask   (non-zero => pixel lit)");

// ---------------------------------------------------------------------------
// Section 3 — End of 0x0A1A9D (0x0A1B00-0x0A1B13) — shows table reference
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log("END OF 0x0A1A9D (0x0A1B00-0x0A1B13) — how the table is referenced");
console.log("=".repeat(70));

const endOf1A9D = disasm(0x0A1B00, 0x14, false);
for (const r of endOf1A9D) {
  console.log("  0x" + r.addr.toString(16).padStart(6,"0") + ":  " +
              r.bytes.padEnd(18," ") + r.mnem);
}

// LD HL,0x0A1B14 context slightly before 0x0A1B00
console.log("\n  [LD HL,0x0A1B14 context at ~0x0A1AC5]");
const refCtx = disasm(0x0A1AC5, 0x10, false);
for (const r of refCtx) {
  const mark = r.mnem.includes("a1b14") ? "  <-- loads bit-mask table" : "";
  console.log("  0x" + r.addr.toString(16).padStart(6,"0") + ":  " +
              r.bytes.padEnd(18," ") + r.mnem + mark);
}

// ---------------------------------------------------------------------------
// Section 4 — Disassembly: function at 0x0A1B1C
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log("FUNCTION DISASSEMBLY: 0x0A1B1C");
console.log("=".repeat(70));

// The function has conditional early-exit paths (RET Z at 0x0A1B3D for the
// no-IY+0x4A-bit-6 case) before the unconditional RET at 0x0A1B58.
// Use stopOnRet=false and a fixed byte count so the full body is shown.
const FN_START = 0x0A1B1C;
const FN_END   = 0x0A1B59;   // byte after unconditional RET at 0x0A1B58
const fn1B1C = disasm(FN_START, FN_END - FN_START, false);
for (const r of fn1B1C) {
  // Annotate branch targets and key instructions
  let ann = "";
  if (r.addr === 0x0A1B39) ann = "  ; [else path: bit 5 clear, check bit 6]";
  if (r.addr === 0x0A1B3D) ann = "  ; RET Z = early exit if bit 6 also clear (not 4bpp)";
  if (r.addr === 0x0A1B57) ann = "  ; convergence: ADD HL,DE then RET";
  console.log("  0x" + r.addr.toString(16).padStart(6,"0") + ":  " +
              r.bytes.padEnd(18," ") + r.mnem + ann);
}
const fnSize = FN_END - FN_START;
console.log("\n  Function size: " + fnSize + " bytes  (0x0a1b1c - 0x" + (FN_END-1).toString(16) + ")");
console.log("  Structure: 3-way branch on IY+0x4A bits 5/6/3 -> sets DE = framebuf base");
console.log("             bit 5 set  -> 1bpp: (y-30)*40, DE=D031CE or D0529E (bit 3 selects)");
console.log("             bit 6 set  -> 4bpp: CALL 0x07B75F (base=D09466), DE=D09466");
console.log("             both clear -> RET Z (caller handles 8bpp/16bpp paths)");

// ---------------------------------------------------------------------------
// Section 5 — Cross-references
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log("CROSS-REFERENCES");
console.log("=".repeat(70));

function findRefs(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mi = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const hits = [];
  for (let i = 1; i < rom.length - 3; i++) {
    if (rom[i] === lo && rom[i+1] === mi && rom[i+2] === hi) {
      const prev = rom[i-1];
      let refType = "data";
      if (prev === 0xCD) refType = "CALL";
      else if (prev === 0xC3) refType = "JP";
      else if (prev === 0xCA) refType = "JP Z";
      else if (prev === 0xDA) refType = "JP C";
      else if (prev === 0x21) refType = "LD HL,";
      else if (prev === 0x11) refType = "LD DE,";
      else if (prev === 0x01) refType = "LD BC,";
      hits.push({ refAddr: i - 1, refType });
    }
  }
  return hits;
}

const refs14 = findRefs(0x0A1B14);
const refs1C = findRefs(0x0A1B1C);

console.log("\nReferences to 0x0A1B14 (bit-mask table): " + refs14.length);
for (const r of refs14) {
  console.log("  0x" + r.refAddr.toString(16).padStart(6,"0") + ": " + r.refType + " 0x0a1b14");
}

console.log("\nReferences to 0x0A1B1C (function): " + refs1C.length);
for (const r of refs1C) {
  console.log("  0x" + r.refAddr.toString(16).padStart(6,"0") + ": " + r.refType + " 0x0a1b1c");
}

// Show disassembly context around each caller of 0x0A1B1C
for (const r of refs1C) {
  console.log("\n  --- Caller context at 0x" + r.refAddr.toString(16).padStart(6,"0") + " ---");
  const ctx = disasm(Math.max(0, r.refAddr - 0x10), 0x24, false);
  for (const inst of ctx) {
    const mark = inst.mnem.includes("a1b1c") ? "  <-- CALL 0x0A1B1C" : "";
    console.log("    0x" + inst.addr.toString(16).padStart(6,"0") + ":  " +
                inst.bytes.padEnd(18," ") + inst.mnem + mark);
  }
}

// ---------------------------------------------------------------------------
// Section 6 — Mono pixel addressing summary
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log("SUMMARY: 1bpp MONO PIXEL ADDRESSING");
console.log("=".repeat(70));
console.log("");
console.log("Display: 320 x 240 pixels");
console.log("1bpp row stride: 40 bytes (320 / 8 = 40)");
console.log("Framebuffer bases: D031CE (primary), D0529E (alternate)");
console.log("");
console.log("Pixel address computation (inside 0x0A1A9D, 119B):");
console.log("  1. LD H,A / LD L,0x28 / MLT HL  -> HL = y * 40  (1bpp stride)");
console.log("  2. ADD base (D031CE or D0529E)   -> HL = byte address for that row");
console.log("  3. x >> 3 added to HL            -> HL = exact byte containing pixel");
console.log("  4. x & 7 indexes table[0x0A1B14] -> bit mask for that pixel");
console.log("");
console.log("Bit-mask table (0x0A1B14, 8 bytes):");
console.log("  index  0     1     2     3     4     5     6     7");
console.log("  mask  0x80  0x40  0x20  0x10  0x08  0x04  0x02  0x01");
console.log("  bit    7     6     5     4     3     2     1     0");
console.log("  (pixel 0 within the byte is the MSB = leftmost on screen)");
console.log("");
console.log("Function 0x0A1B1C (61 bytes, 0x0A1B1C-0x0A1B58):");
console.log("  - 1 caller: CALL at 0x0A2524 (inside blit loop 0x0A24C8)");
console.log("  - Returns DE = framebuffer row base address for current rendering mode");
console.log("  - Also computes (y-30)*40 row offset into HL for 1bpp mode");
console.log("  - 3-way branch on IY+0x4A rendering mode flags:");
console.log("      bit 5 set  -> 1bpp mono:  (A-0x1E)*40 in HL, DE=D031CE (bit3=0) or D0529E (bit3=1)");
console.log("      bit 6 set  -> 4bpp nibble: CALL 0x07B75F, DE=D09466");
console.log("      both clear -> RET Z (caller handles 8bpp/16bpp, no row offset needed)");
console.log("");
console.log("Probe complete.");
